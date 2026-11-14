import {
  CALENDAR_LIMITS,
  addDays,
  cancellableUntil,
  definedWindows,
  effectiveWindows,
  isOnQuarterGrid,
  isWholeLocalHour,
  localDateOf,
  overlaps,
  slotsOf,
  toInstantWindows,
  weekdayOf,
  type ApiErrorCode,
  type Appointment,
  type CalendarDay,
  type CalendarSettings,
  type CalendarView,
  type CalendarWindow,
  type Interval,
  type Role,
  type Slot,
  type AppointmentConflict,
  type AppointmentStatus,
  type OneOffInput,
  type OverrideInput,
  type PatternInput,
  type SourcedWindow,
  type WindowBody,
  type EffectiveWindow,
} from '@shared-calendar/shared';

// The calendar's server-side checks (docs/SHARED_CALENDAR_SPEC.md 14.2): pure functions over what
// calendarDb read inside the locked attempt, with "today", "now" and the zone passed in (R-TIME-04).
// No AWS, no clock, no item layout. A failed check names the contract's error code; the handler maps
// it to the status of spec 11.3. calendarDb runs these as the `check` of its locked writes.

/**
 * A failed check: the error code to answer with, and what only the check can say. `message`, when
 * set, replaces the handler's default text (an overlap names the date and both windows);
 * `conflicts` is set with `availability_conflict` only (R-AV-03) and goes to the response body,
 * never to the log line. Nothing is written.
 */
export type Refusal<C extends ApiErrorCode = ApiErrorCode> = { error: C; message?: string; conflicts?: AppointmentConflict[] };

const refuse = <C extends ApiErrorCode>(error: C, message?: string): Refusal<C> =>
  message === undefined ? { error } : { error, message };

// ── The calendar as the checks see it ──────────────────────────────────────────────────────────

/**
 * What a check needs of an appointment (8.1); `appointmentId`, `username` only for `conflicts`.
 * `userId` (the owner's Cognito `sub`) is internal: the limit of R-BOOK-09 counts on it, never on
 * the username, which a later User could be given.
 */
export type StateAppointment = Pick<Appointment, 'appointmentId' | 'username' | 'start' | 'end' | 'date' | 'typeId' | 'status'> & {
  userId: string;
};

/**
 * The availability state calendarDb reads inside a locked attempt (13.2 access patterns): every
 * type and every pattern; the overrides and one-off windows dated today or later; the appointments
 * that started at most 24 h ago. Nothing earlier can still matter: an appointment lies inside one
 * date, so one that has not ended is dated today or later (R-AV-02 for the rest).
 */
export type CalendarState = {
  types: readonly { typeId: string }[];
  patterns: readonly PatternInput[];
  overrides: readonly OverrideInput[];
  oneOffs: readonly OneOffInput[];
  appointments: readonly StateAppointment[];
};

// ── Availability types (spec 6.1) ────────────────────────────────────────────────────────────

/**
 * The key two type names are compared by (spec 6.1, "compared case-insensitively"): the name,
 * already trimmed by the TypeName schema, lower-cased without a locale. Stored as `nameKey`
 * (13.2), and the order of GET /calendar/types.
 */
export function typeNameKey(name: string): string {
  return name.toLowerCase();
}

/** What a name check needs of each existing type. */
export type NamedType = { typeId: string; nameKey: string };

/**
 * R-TYPE-01 (create) and R-TYPE-02 (rename): the name must be unique among all types, and a
 * create must not make more than CALENDAR_LIMITS.types. `renaming` is the id of the type being
 * renamed: its own name never counts as taken, so a rename that keeps its name, or changes only
 * its case, is allowed. A rename never changes the count, so the limit applies to a create only.
 */
export function checkTypeName(name: string, types: readonly NamedType[]): Refusal<'type_name_exists' | 'limit_reached'> | null;
export function checkTypeName(name: string, types: readonly NamedType[], renaming: string): Refusal<'type_name_exists'> | null;
export function checkTypeName(
  name: string,
  types: readonly NamedType[],
  renaming?: string,
): Refusal<'type_name_exists' | 'limit_reached'> | null {
  const key = typeNameKey(name);
  if (types.some((t) => t.nameKey === key && t.typeId !== renaming)) return refuse('type_name_exists');
  if (renaming === undefined && types.length >= CALENDAR_LIMITS.types) return refuse('limit_reached');
  return null;
}

/**
 * What can refer to a type: the fields of CalendarState the delete check reads. calendarDb already
 * leaves out what lies in the past; checkTypeDelete does not rely on that.
 */
export type TypeReferences = {
  patterns: readonly { typeId: string }[];
  overrides: readonly { date: string; windows: readonly { typeId: string }[] }[];
  oneOffs: readonly { date: string; typeId: string }[];
  appointments: readonly { typeId: string; status: AppointmentStatus; end: string }[];
};

/**
 * R-TYPE-03: a type cannot be deleted while a weekly pattern refers to it (whatever its
 * validity), an override or one-off window dated today or later, or a booked appointment that has
 * not ended (`end > now`; one in progress counts). Past references do not block: an appointment
 * keeps a snapshot of the type name. `today` is a local date, `now` an instant; both compare as
 * strings (R-TIME-02).
 */
export function checkTypeDelete(
  typeId: string,
  refs: TypeReferences,
  today: string,
  now: string,
): Refusal<'type_in_use'> | null {
  const inUse =
    refs.patterns.some((p) => p.typeId === typeId) ||
    refs.overrides.some((o) => o.date >= today && o.windows.some((w) => w.typeId === typeId)) ||
    refs.oneOffs.some((w) => w.date >= today && w.typeId === typeId) ||
    refs.appointments.some((a) => a.typeId === typeId && a.status === 'booked' && a.end > now);
  return inUse ? refuse('type_in_use') : null;
}

// ── Availability writes (spec 6.5, 6.7) ──────────────────────────────────────────────────────

/**
 * One write to availability: the item it touches and its new value, or `null` to delete it.
 * Whether it creates or replaces follows from the state (an id or date already there). Every kind
 * is one source of windows: a pattern, a date's override, a one-off window.
 */
export type AvailabilityWrite =
  | { kind: 'pattern'; patternId: string; pattern: PatternInput | null }
  | { kind: 'override'; date: string; windows: readonly WindowBody[] | null }
  | { kind: 'one_off'; windowId: string; window: OneOffInput | null };

export type AvailabilityRefusal = Refusal<'type_not_found' | 'limit_reached' | 'availability_overlap' | 'availability_conflict'>;

// The state with the write applied: what the calendar would be after it (R-AV-03).
function applyWrite(state: CalendarState, write: AvailabilityWrite): CalendarState {
  switch (write.kind) {
    case 'pattern': {
      const others = state.patterns.filter((p) => p.patternId !== write.patternId);
      return { ...state, patterns: write.pattern ? [...others, write.pattern] : others };
    }
    case 'override': {
      const others = state.overrides.filter((o) => o.date !== write.date);
      return { ...state, overrides: write.windows ? [...others, { date: write.date, windows: [...write.windows] }] : others };
    }
    case 'one_off': {
      const others = state.oneOffs.filter((w) => w.windowId !== write.windowId);
      return { ...state, oneOffs: write.window ? [...others, write.window] : others };
    }
  }
}

// The windows the write brings in (their types must exist, R-TYPE-04).
function newWindows(write: AvailabilityWrite): readonly { typeId: string }[] {
  if (write.kind === 'pattern') return write.pattern ? [write.pattern] : [];
  if (write.kind === 'override') return write.windows ?? [];
  return write.window ? [write.window] : [];
}

const span = (w: { start: string; end: string }) => `${w.start}–${w.end}`;
const overlapMessage = (date: string, a: { start: string; end: string }, b: { start: string; end: string }) =>
  `On ${date} the window ${span(a)} would overlap the window ${span(b)}`;

// The first two windows of one date that overlap, compared as local times (R-AV-01; touching is
// fine). The windows come sorted by start from definedWindows.
function firstOverlap(windows: readonly SourcedWindow[]): [SourcedWindow, SourcedWindow] | null {
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (overlaps(windows[i]!, windows[j]!)) return [windows[i]!, windows[j]!];
    }
  }
  return null;
}

// The first date both patterns apply (same weekday, both validities), or null if there is none.
function firstSharedDate(a: PatternInput, b: PatternInput): string | null {
  if (a.weekday !== b.weekday) return null;
  const from = a.validFrom > b.validFrom ? a.validFrom : b.validFrom;
  const until = [a.validUntil, b.validUntil].filter((d): d is string => d !== null).sort()[0];
  const date = addDays(from, (a.weekday - weekdayOf(from) + 7) % 7);
  return until === undefined || date <= until ? date : null;
}

/** R-AV-01 and R-AV-02 for one write, on the state after it. The message names the date and both windows. */
function checkOverlap(write: AvailabilityWrite, after: CalendarState, today: string): AvailabilityRefusal | null {
  const overrideOf = (date: string) => after.overrides.find((o) => o.date === date) ?? null;
  const futureOneOffs = after.oneOffs.filter((w) => w.date >= today);
  // The defined windows of one date (6.5) never overlap.
  const onDate = (date: string): AvailabilityRefusal | null => {
    const pair = firstOverlap(definedWindows(date, after.patterns, overrideOf(date), futureOneOffs));
    return pair ? refuse('availability_overlap', overlapMessage(date, pair[0], pair[1])) : null;
  };

  if (write.kind === 'pattern') {
    const pattern = write.pattern;
    // Deleting a pattern cannot create an overlap (11.1, note 1).
    if (!pattern) return null;
    // Against every other pattern with the same weekday and a date in common, past dates
    // included: "an overlap on any date is an overlap".
    for (const other of after.patterns) {
      if (other.patternId === pattern.patternId || !overlaps(pattern, other)) continue;
      const date = firstSharedDate(pattern, other);
      if (date !== null) return refuse('availability_overlap', overlapMessage(date, pattern, other));
    }
    // Against the one-off windows from today on, on the dates where the pattern applies; a date
    // with an override does not take the pattern (definedWindows leaves it out).
    const dates = new Set(futureOneOffs.filter((w) => weekdayOf(w.date) === pattern.weekday).map((w) => w.date));
    for (const date of [...dates].sort()) {
      const refusal = onDate(date);
      if (refusal) return refusal;
    }
    return null;
  }
  // An override set or deleted, or a one-off window created or deleted, changes one date only.
  // A date in the past is refused before (date_in_past, step 47); its one-offs are ignored here.
  const date = write.kind === 'override' ? write.date : (write.window?.date ?? null);
  return date === null ? null : onDate(date);
}

// The dates whose windows the write can change; the conflict check looks at these only.
function touches(write: AvailabilityWrite, before: CalendarState): (date: string) => boolean {
  if (write.kind === 'pattern') {
    const old = before.patterns.find((p) => p.patternId === write.patternId);
    const weekdays = new Set([old?.weekday, write.pattern?.weekday]);
    return (date) => weekdays.has(weekdayOf(date));
  }
  if (write.kind === 'override') return (date) => date === write.date;
  const old = before.oneOffs.find((w) => w.windowId === write.windowId);
  const dates = new Set([old?.date, write.window?.date]);
  return (date) => dates.has(date);
}

/**
 * R-AV-03, R-AV-04: every booked appointment that has not ended (one in progress included), on a
 * date the write touches, must lie entirely inside one effective window of its own type in the
 * calendar after the write. Compared as instants (R-TIME-03). Listed by start.
 */
function checkConflicts(
  write: AvailabilityWrite,
  before: CalendarState,
  after: CalendarState,
  now: string,
  zone: string,
): AvailabilityRefusal | null {
  const touched = touches(write, before);
  const conflicts = after.appointments
    .filter((a) => a.status === 'booked' && a.end > now && touched(a.date))
    .filter((a) => {
      const override = after.overrides.find((o) => o.date === a.date) ?? null;
      const windows = effectiveWindows(toInstantWindows(a.date, definedWindows(a.date, after.patterns, override, after.oneOffs), zone));
      return !windows.some((w) => w.typeId === a.typeId && w.start <= a.start && a.end <= w.end);
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .map(({ appointmentId, username, start, end }) => ({ appointmentId, username, start, end }));
  if (conflicts.length === 0) return null;
  const count = conflicts.length === 1 ? '1 appointment' : `${conflicts.length} appointments`;
  return { error: 'availability_conflict', message: `${count} would fall outside the availability`, conflicts };
}

/**
 * The checks of one availability write (6.5, 6.7, R-TYPE-04, R-PAT-04, R-ONE-03), on the state read
 * inside the locked attempt, in this order: `type_not_found` (a type in the body that does not
 * exist), `limit_reached` (a 51st pattern, an 11th one-off window on a date), `availability_overlap`
 * (local times), `availability_conflict` with `conflicts` (instants). `today` is the local date of
 * `now` in `zone`. The item the write replaces or deletes must exist; calendarDb checks that first.
 */
export function checkAvailabilityWrite(
  write: AvailabilityWrite,
  state: CalendarState,
  today: string,
  now: string,
  zone: string,
): AvailabilityRefusal | null {
  const typeIds = new Set(state.types.map((t) => t.typeId));
  if (newWindows(write).some((w) => !typeIds.has(w.typeId))) return refuse('type_not_found');

  if (write.kind === 'pattern' && write.pattern && !state.patterns.some((p) => p.patternId === write.patternId)) {
    if (state.patterns.length >= CALENDAR_LIMITS.patterns) return refuse('limit_reached');
  }
  if (write.kind === 'one_off' && write.window && !state.oneOffs.some((w) => w.windowId === write.windowId)) {
    const date = write.window.date;
    if (state.oneOffs.filter((w) => w.date === date).length >= CALENDAR_LIMITS.oneOffWindowsPerDate) return refuse('limit_reached');
  }

  const after = applyWrite(state, write);
  return checkOverlap(write, after, today) ?? checkConflicts(write, state, after, now, zone);
}

// ── Booking (spec 8.2) ───────────────────────────────────────────────────────────────────────

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const SLOT_MS = HOUR_MS; // a slot, and a User's appointment, is 60 real minutes (R-SLOT-01)
const QUARTER_MS = 15 * MINUTE_MS;

/**
 * R-BOOK-02, the times for the caller's role, from the body alone (the zone is the only other
 * input): `400 invalid_request` before Cognito and the lock (8.2 order, v9). A User's `start` is a
 * whole local hour and `end` absent or `start + 60 min`; the Administrator's `start` and `end` lie
 * on the local 15-minute grid, `end` defaults to `start + 60 min`, and lasts at least 15 minutes.
 * The schema has already checked the exact instant form and `end > start`. Answers the times to
 * book, `end` filled in.
 */
export function checkBookingTimes(
  start: string,
  end: string | undefined,
  role: Role,
  zone: string,
): { start: string; end: string } | Refusal<'invalid_request'> {
  const hourLater = new Date(Date.parse(start) + SLOT_MS).toISOString();
  if (role === 'user') {
    if (!isWholeLocalHour(start, zone)) return refuse('invalid_request', 'Invalid input: start must be a whole hour');
    if (end !== undefined && end !== hourLater) return refuse('invalid_request', 'Invalid input: end must be one hour after start');
    return { start, end: hourLater };
  }
  if (!isOnQuarterGrid(start, zone)) return refuse('invalid_request', 'Invalid input: start must be on a 15-minute step');
  const until = end ?? hourLater;
  if (!isOnQuarterGrid(until, zone)) return refuse('invalid_request', 'Invalid input: end must be on a 15-minute step');
  if (Date.parse(until) - Date.parse(start) < QUARTER_MS) return refuse('invalid_request', 'Invalid input: an appointment lasts at least 15 minutes');
  return { start, end: until };
}

export type BookingRefusal = Refusal<
  'booking_too_soon' | 'booking_too_far' | 'outside_availability' | 'slot_taken' | 'appointment_limit_reached'
>;

export type BookingInput = {
  /** The times R-BOOK-02 accepted, `end` filled in. */
  start: string;
  end: string;
  role: Role;
  /** The Cognito `sub` of the User the appointment is for. */
  userId: string;
  settings: Pick<CalendarSettings, 'minBookingNoticeHours' | 'bookingHorizonDays' | 'maxFutureAppointmentsPerUser'>;
  state: CalendarState;
  now: string;
  today: string;
  zone: string;
};

/**
 * The booking rules that need the calendar (8.2, the order of v9 step 5), on the settings and the
 * state read inside the locked attempt, in table order; the first that fails decides:
 * - R-BOOK-03 `start > now`, and R-BOOK-04 `start − now ≥ minBookingNoticeHours` (a User only):
 *   `booking_too_soon`;
 * - R-BOOK-05 `localDateOf(start) ≤ today + bookingHorizonDays` (a User only): `booking_too_far`;
 * - R-BOOK-06 inside one effective window (6.6: merged across sources) of the start's local date, a
 *   window whose type no longer exists left out as in the view: `outside_availability`;
 * - R-BOOK-07 no booked appointment overlaps, compared as instants (R-SLOT-02): `slot_taken`;
 * - R-BOOK-09 (a User only) the User's booked appointments with `start > now`, by `userId`, are
 *   fewer than `maxFutureAppointmentsPerUser` when it is not null: `appointment_limit_reached`. One
 *   in progress or ended does not count.
 * R-BOOK-08 needs no check here: R-BOOK-02 already allowed the Administrator's custom times.
 * Answers the effective window that holds the appointment: its type is the appointment's.
 */
export function checkBooking(input: BookingInput): { window: EffectiveWindow } | BookingRefusal {
  const { start, end, role, userId, settings, state, now, today, zone } = input;
  const admin = role === 'admin';
  const ahead = Date.parse(start) - Date.parse(now);
  if (ahead <= 0) return refuse('booking_too_soon', 'The start is not in the future');
  if (!admin && ahead < settings.minBookingNoticeHours * HOUR_MS) return refuse('booking_too_soon', 'Not enough notice before the start');
  const date = localDateOf(start, zone);
  if (!admin && date > addDays(today, settings.bookingHorizonDays)) return refuse('booking_too_far', 'The start is too far ahead');

  const typeIds = new Set(state.types.map((t) => t.typeId));
  const override = state.overrides.find((o) => o.date === date) ?? null;
  const defined = definedWindows(date, state.patterns, override, state.oneOffs).filter((w) => typeIds.has(w.typeId));
  const window = effectiveWindows(toInstantWindows(date, defined, zone)).find((w) => w.start <= start && end <= w.end);
  if (!window) return refuse('outside_availability', 'The time is not inside the availability');

  const booked = state.appointments.filter((a) => a.status === 'booked');
  if (booked.some((a) => overlaps(a, { start, end }))) return refuse('slot_taken', 'The time is already booked');

  const limit = settings.maxFutureAppointmentsPerUser;
  if (!admin && limit !== null && booked.filter((a) => a.userId === userId && a.start > now).length >= limit) {
    return refuse('appointment_limit_reached', 'The maximum number of future appointments is reached');
  }
  return { window };
}

// ── Cancelling and the note (spec 8.3, 8.5, v10) ─────────────────────────────────────────────

/**
 * `cancellableUntil` of an appointment in a response (8.1, 11.5, v10): for a User caller on a
 * `booked` appointment, `start − cancellationNoticeHours` (already in the past once that moment has
 * passed, ended appointments included); `null` on a `cancelled` one and in every answer to the
 * Administrator. It depends on the stored status only, never on the clock.
 */
export function cancellableUntilFor(
  appointment: { start: string; status: AppointmentStatus },
  role: Role,
  settings: Pick<CalendarSettings, 'cancellationNoticeHours'>,
): string | null {
  return role === 'user' && appointment.status === 'booked' ? cancellableUntil(appointment, settings) : null;
}

/** Who asks: the role and the Cognito `sub` of the token. A User's ownership is decided on the `sub`. */
export type Caller = { role: Role; sub: string };

/** What the cancel and note checks need of the appointment read inside the locked attempt. */
export type CheckedAppointment = { userId: string; start: string; end: string; status: AppointmentStatus };

export type NoteRefusal = Refusal<'appointment_not_found' | 'appointment_not_active'>;
export type CancelRefusal = Refusal<'appointment_not_found' | 'appointment_not_active' | 'cancellation_too_late'>;

// The two checks routes 18 and 19 share, in the order of 8.3 (v10): R-CAN-01 / R-PERM-01, absent or
// (for a User) not theirs by `sub`, is 404, before anything that would tell its status; then
// R-CAN-02 / R-NOTE-01, `status = booked` and `end > now`, else 409.
function checkVisibleAndActive(appointment: CheckedAppointment | null, caller: Caller, now: string): NoteRefusal | null {
  if (!appointment || (caller.role !== 'admin' && appointment.userId !== caller.sub)) {
    return refuse('appointment_not_found', 'No appointment with this id');
  }
  if (appointment.status !== 'booked' || appointment.end <= now) {
    return refuse('appointment_not_active', 'The appointment is cancelled or has ended');
  }
  return null;
}

/**
 * The cancel checks (8.3, the order of v10), on the appointment read inside the locked attempt (or
 * `null` if there is none) and the settings read with it; the first that fails decides:
 * - R-CAN-01 / R-PERM-01: absent, or a User caller whose `sub` is not its `userId`:
 *   `appointment_not_found` (404, never 403, so ids cannot be probed);
 * - R-CAN-02: `status = booked` and `end > now`: `appointment_not_active`;
 * - R-CAN-03 (a User only): `now ≤ start − cancellationNoticeHours`, the response's
 *   `cancellableUntil`, compared to the millisecond: `cancellation_too_late`. Exactly the notice
 *   before the start is allowed; an appointment in progress is refused here, not by R-CAN-02. The
 *   Administrator is exempt and may cancel one in progress.
 * Answers null when the cancel may be written.
 */
export function checkCancel(
  appointment: CheckedAppointment | null,
  caller: Caller,
  settings: Pick<CalendarSettings, 'cancellationNoticeHours'>,
  now: string,
): CancelRefusal | null {
  const refusal = checkVisibleAndActive(appointment, caller, now);
  if (refusal) return refusal;
  if (caller.role !== 'admin' && Date.parse(now) > Date.parse(cancellableUntil(appointment!, settings))) {
    return refuse('cancellation_too_late', 'Too late to cancel this appointment');
  }
  return null;
}

/**
 * The note checks (R-NOTE-01, 8.5 v10), on the appointment read inside the locked attempt (or
 * `null`): R-PERM-01 (`appointment_not_found`), then active and not ended
 * (`appointment_not_active`); no notice applies. `note` is the new note, already trimmed with an
 * empty one made `null` (R-BOOK-11). Answers whether it equals the stored one: then nothing is
 * written, no event either (v10).
 */
export function checkNote(
  appointment: (CheckedAppointment & { note: string | null }) | null,
  note: string | null,
  caller: Caller,
  now: string,
): NoteRefusal | { unchanged: boolean } {
  return checkVisibleAndActive(appointment, caller, now) ?? { unchanged: appointment!.note === note };
}

// ── Changing (spec 8.4, v11) ─────────────────────────────────────────────────────────────────

export type ChangeRefusal = CancelRefusal | BookingRefusal;

export type ChangeInput = {
  /** The old appointment read inside the locked attempt, or null when there is none. */
  appointment: (CheckedAppointment & { appointmentId: string }) | null;
  caller: Caller;
  /** The new times R-BOOK-02 accepted for the caller's role, `end` filled in. */
  start: string;
  end: string;
  settings: Pick<CalendarSettings, 'cancellationNoticeHours' | 'minBookingNoticeHours' | 'bookingHorizonDays' | 'maxFutureAppointmentsPerUser'>;
  state: CalendarState;
  now: string;
  today: string;
  zone: string;
};

/**
 * The change checks (8.4, the order of v11), on what calendarDb read inside the locked attempt; the
 * first that fails decides:
 * - the old appointment, as a cancel (checkCancel): R-CAN-01 / R-PERM-01 (`appointment_not_found`),
 *   R-CAN-02 (`appointment_not_active`, also for one already changed), for a User R-CAN-03
 *   (`cancellation_too_late`, with a change's wording);
 * - the new one, as a booking (checkBooking) for the old appointment's User (R-BOOK-01: its
 *   `userId`), on the state with the old appointment left out by id: that is both adjustments of
 *   R-CHG-01, R-BOOK-07 ignores it and R-BOOK-09 does not count it.
 * R-BOOK-10 is not here: the marker is a condition of the transaction. Answers the effective window
 * that holds the new appointment: its type is the new appointment's.
 */
export function checkChange(input: ChangeInput): { window: EffectiveWindow } | ChangeRefusal {
  const { appointment, caller, start, end, settings, state, now, today, zone } = input;
  const refusal = checkCancel(appointment, caller, settings, now);
  if (refusal) {
    return refusal.error === 'cancellation_too_late' ? refuse(refusal.error, 'Too late to change this appointment') : refusal;
  }
  const old = appointment!;
  const others = { ...state, appointments: state.appointments.filter((a) => a.appointmentId !== old.appointmentId) };
  return checkBooking({ start, end, role: caller.role, userId: old.userId, settings, state: others, now, today, zone });
}

// ── The calendar view (spec 11.6, 7, 8.6, 17) ────────────────────────────────────────────────

/**
 * An appointment as calendarDb reads it for the view: the response fields (typeName already the
 * current name or the snapshot) and, apart, the owner's Cognito `sub`. Ownership is decided on
 * `userId`, never on `username` (a deleted username can be given to a new User), and `userId` is
 * never part of a response: it sits beside the appointment, not in it.
 */
export type ViewAppointment = { userId: string; appointment: Omit<Appointment, 'cancellableUntil'> };

export type CalendarViewInput = {
  from: string;
  to: string;
  now: string;
  zone: string;
  role: Role;
  /** The caller's Cognito `sub`: a User's own appointments are those with this `userId`. */
  callerSub: string;
  settings: Pick<CalendarSettings, 'cancellationNoticeHours' | 'minBookingNoticeHours' | 'bookingHorizonDays'>;
  types: readonly { typeId: string; name: string }[];
  patterns: readonly PatternInput[];
  /** The overrides dated in the range; one of another date is ignored. */
  overrides: readonly OverrideInput[];
  /** The one-off windows dated in the range. */
  oneOffs: readonly OneOffInput[];
  /** The appointments starting in the range, every status; one dated outside the range is ignored. */
  appointments: readonly ViewAppointment[];
};

// The appointment as a response (11.5), field by field in the contract's order, so nothing stored
// beside it can reach the body. `cancellableUntil` for a User; null for the Administrator.
export function toResponse(a: Omit<Appointment, 'cancellableUntil'>, until: string | null): Appointment {
  return {
    appointmentId: a.appointmentId,
    username: a.username,
    start: a.start,
    end: a.end,
    date: a.date,
    typeId: a.typeId,
    typeName: a.typeName,
    note: a.note,
    status: a.status,
    createdAt: a.createdAt,
    createdBy: a.createdBy,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy,
    cancelledAt: a.cancelledAt,
    cancelledBy: a.cancelledBy,
    cancelReason: a.cancelReason,
    replaces: a.replaces,
    replacedBy: a.replacedBy,
    cancellableUntil: until,
  };
}

const byStartThenId = (a: ViewAppointment, b: ViewAppointment) =>
  byInstant(a.appointment.start, b.appointment.start) || byInstant(a.appointment.appointmentId, b.appointment.appointmentId);
function byInstant(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The calendar view of `from`..`to` for one caller (11.6), pure: "now" and the zone passed in,
 * "today" = localDateOf(now, zone) (R-TIME-04). Per date:
 * - `windows`: the defined windows (6.5) as instants, sorted, not merged (T11); `source`,
 *   `sourceId` for the Administrator only. A window whose type no longer exists is left out (it can
 *   only lie in the past, R-TYPE-03; R-VIEW-03, spec v7), and so is one that holds no real time
 *   (it starts in the hour skipped when clocks go forward and ends at or just after it);
 * - `slots`: the slots (R-SLOT-01) of the effective windows (6.6), minus every slot that overlaps
 *   a booked appointment, the caller's own included (R-SLOT-02). A User gets those that pass
 *   R-SLOT-03 (`start > now`, the minimum notice, the horizon); the Administrator those with
 *   `start > now` (R-SLOT-04). A past date has windows and no slots (R-VIEW-03);
 * - `busy`: for a User, the other Users' booked appointments of that date as bare intervals,
 *   sorted (section 17); `[]` for the Administrator;
 * - `hasOverride`: for the Administrator only, also for an override with no windows.
 * A field that is "admin only" is absent for a User. `appointments`: the booked ones (active, an
 * ended one included) starting in the range, by start: all for the Administrator with
 * `cancellableUntil: null`, the caller's own (by `userId`) for a User with `cancellableUntil`.
 */
export function calendarView(input: CalendarViewInput): CalendarView {
  const { from, to, now, zone, role, callerSub, settings } = input;
  const admin = role === 'admin';
  const today = localDateOf(now, zone);
  const lastBookable = addDays(today, settings.bookingHorizonDays);
  const nowMs = Date.parse(now);
  const typeNames = new Map(input.types.map((t) => [t.typeId, t.name]));
  // Active = booked, an ended one included. Only those dated in the range: calendarDb reads exactly
  // these, and the view does not rely on it.
  const booked = input.appointments
    .filter((a) => a.appointment.status === 'booked' && from <= a.appointment.date && a.appointment.date <= to)
    .sort(byStartThenId);

  // R-SLOT-03 for a User, R-SLOT-04 for the Administrator; R-SLOT-02 for both.
  const offered = (slot: Slot): boolean => {
    const ahead = Date.parse(slot.start) - nowMs;
    if (ahead <= 0) return false;
    if (!admin && (ahead < settings.minBookingNoticeHours * HOUR_MS || localDateOf(slot.start, zone) > lastBookable)) return false;
    return !booked.some((a) => overlaps(slot, a.appointment));
  };

  const days: CalendarDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const override = input.overrides.find((o) => o.date === date) ?? null;
    const defined = definedWindows(date, input.patterns, override, input.oneOffs).filter((w) => typeNames.has(w.typeId));
    const instants = toInstantWindows(date, defined, zone).filter((w) => w.start < w.end);
    const windows = instants.map(
      (w): CalendarWindow => ({
        start: w.start,
        end: w.end,
        typeId: w.typeId,
        typeName: typeNames.get(w.typeId)!,
        ...(admin && { source: w.source, sourceId: w.sourceId }),
      }),
    );
    const slots = effectiveWindows(instants).flatMap((w) => slotsOf(w, zone)).filter(offered);
    const busy: Interval[] = admin
      ? []
      : booked
          .filter((a) => a.userId !== callerSub && a.appointment.date === date)
          .map((a) => ({ start: a.appointment.start, end: a.appointment.end }));
    days.push({ date, weekday: weekdayOf(date), windows, slots, busy, ...(admin && { hasOverride: override !== null }) });
  }

  const appointments = booked
    .filter((a) => admin || a.userId === callerSub)
    .map((a) => toResponse(a.appointment, cancellableUntilFor(a.appointment, role, settings)));
  return { timeZone: zone, from, to, generatedAt: now, days, appointments };
}
