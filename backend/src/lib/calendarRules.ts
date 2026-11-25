import {
  CALENDAR_LIMITS,
  TIME_STEP_MINUTES,
  addDays,
  cancellableUntil,
  definedWindows,
  effectiveWindows,
  isOnTimeStep,
  isWholeLocalHour,
  localDateOf,
  overlaps,
  peopleIn,
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
  type SlotTimes,
  type AppointmentConflict,
  type AppointmentStatus,
  type OneOffInput,
  type OverrideInput,
  type PatternInput,
  type SourcedWindow,
  type WindowBody,
  type EffectiveWindow,
} from '@shared-calendar/shared';

// The calendar's server-side checks (docs/SHARED_CALENDAR_SPEC.md section 14.2): pure functions
// over what calendarDb read inside the locked attempt, with "today", "now" and the zone passed in
// (docs/SHARED_CALENDAR_SPEC.md R-TIME-04). No AWS, no clock, no item layout. A failed check names
// the contract's error code; the handler maps it to the status of docs/SHARED_CALENDAR_SPEC.md
// section 11.3. calendarDb runs these as the `check` of its locked writes.

/**
 * A failed check: the error code to answer with, and what only the check can say. `message`, when
 * set, replaces the handler's default text (an overlap names the date and both windows);
 * `conflicts` is set with `availability_conflict` only (docs/SHARED_CALENDAR_SPEC.md R-AV-03) and
 * goes to the response body, never to the log line. Nothing is written.
 */
export type Refusal<C extends ApiErrorCode = ApiErrorCode> = { error: C; message?: string; conflicts?: AppointmentConflict[] };

const refuse = <C extends ApiErrorCode>(error: C, message?: string): Refusal<C> =>
  message === undefined ? { error } : { error, message };

// ── The calendar as the checks see it ──────────────────────────────────────────────────────────

/**
 * What a check needs of an appointment (docs/SHARED_CALENDAR_SPEC.md section 8.1); `appointmentId`,
 * `username` only for `conflicts`. `userId` (the owner's Cognito `sub`) is internal: the limit of
 * docs/SHARED_CALENDAR_SPEC.md R-BOOK-09 counts on it, never on the username, which a later User
 * could be given.
 */
export type StateAppointment = Pick<Appointment, 'appointmentId' | 'username' | 'start' | 'end' | 'date' | 'typeId' | 'status'> & {
  userId: string;
};

/**
 * The availability state calendarDb reads inside a locked attempt (the access patterns of
 * docs/SHARED_CALENDAR_SPEC.md section 13.2): every type with its capacity and every pattern; the overrides and
 * one-off windows dated today or later; the appointments that started at most 24 h ago. Nothing
 * earlier can still matter: an appointment lies inside one date, so one that has not ended is dated
 * today or later (docs/SHARED_CALENDAR_SPEC.md R-AV-02 for the rest).
 */
export type CalendarState = {
  types: readonly { typeId: string; capacity: number }[];
  patterns: readonly PatternInput[];
  overrides: readonly OverrideInput[];
  oneOffs: readonly OneOffInput[];
  appointments: readonly StateAppointment[];
};

// ── Availability types (docs/SHARED_CALENDAR_SPEC.md section 6.1) ───────────────────────────

/**
 * The key two type names are compared by (docs/SHARED_CALENDAR_SPEC.md section 6.1, "compared
 * case-insensitively"): the name, already trimmed by the TypeName schema, lower-cased without a
 * locale. Stored as `nameKey` (docs/SHARED_CALENDAR_SPEC.md section 13.2), and the order of
 * GET /calendar/types.
 */
export function typeNameKey(name: string): string {
  return name.toLowerCase();
}

/** What a name check needs of each existing type. */
export type NamedType = { typeId: string; nameKey: string };

/**
 * docs/SHARED_CALENDAR_SPEC.md R-TYPE-01 (create) and R-TYPE-02 (rename): the name must be unique
 * among all types, and a create must not make more than CALENDAR_LIMITS.types. `renaming` is the id
 * of the type being renamed: its own name never counts as taken, so a rename that keeps its name, or
 * changes only its case, is allowed. A rename never changes the count, so the limit applies to a
 * create only.
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
 * docs/SHARED_CALENDAR_SPEC.md R-TYPE-03: a type cannot be deleted while a weekly pattern refers to
 * it (whatever its validity), an override or one-off window dated today or later, or a booked
 * appointment that has not ended (`end > now`; one in progress counts). Past references do not
 * block: an appointment keeps a snapshot of the type name. `today` is a local date, `now` an
 * instant; both compare as strings (docs/SHARED_CALENDAR_SPEC.md R-TIME-02).
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

// ── Availability writes (docs/SHARED_CALENDAR_SPEC.md sections 6.5 and 6.7) ─────────────────

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

// The state with the write applied: what the calendar would be after it
// (docs/SHARED_CALENDAR_SPEC.md R-AV-03).
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

// The windows the write brings in (their types must exist, docs/SHARED_CALENDAR_SPEC.md R-TYPE-04).
function newWindows(write: AvailabilityWrite): readonly { typeId: string }[] {
  if (write.kind === 'pattern') return write.pattern ? [write.pattern] : [];
  if (write.kind === 'override') return write.windows ?? [];
  return write.window ? [write.window] : [];
}

const span = (w: { start: string; end: string }) => `${w.start}–${w.end}`;
const overlapMessage = (date: string, a: { start: string; end: string }, b: { start: string; end: string }) =>
  `On ${date} the window ${span(a)} would overlap the window ${span(b)}`;

// The first two windows of one date that overlap, compared as local times
// (docs/SHARED_CALENDAR_SPEC.md R-AV-01; touching is fine). The windows come sorted by start from
// definedWindows.
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

/**
 * docs/SHARED_CALENDAR_SPEC.md R-AV-01 and R-AV-02 for one write, on the state after it. The message
 * names the date and both windows.
 */
function checkOverlap(write: AvailabilityWrite, after: CalendarState, today: string): AvailabilityRefusal | null {
  const overrideOf = (date: string) => after.overrides.find((o) => o.date === date) ?? null;
  const futureOneOffs = after.oneOffs.filter((w) => w.date >= today);
  // The defined windows of one date (docs/SHARED_CALENDAR_SPEC.md section 6.5) never overlap.
  const onDate = (date: string): AvailabilityRefusal | null => {
    const pair = firstOverlap(definedWindows(date, after.patterns, overrideOf(date), futureOneOffs));
    return pair ? refuse('availability_overlap', overlapMessage(date, pair[0], pair[1])) : null;
  };

  if (write.kind === 'pattern') {
    const pattern = write.pattern;
    // Deleting a pattern cannot create an overlap (docs/SHARED_CALENDAR_SPEC.md section 11.1,
    // footnote 1).
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
  // A date in the past is refused before (date_in_past); its one-offs are ignored here.
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
 * docs/SHARED_CALENDAR_SPEC.md R-AV-03 and R-AV-04: every booked appointment that has not ended (one
 * in progress included), on a date the write touches, must lie entirely inside one effective window
 * of its own type in the calendar after the write. Compared as instants
 * (docs/SHARED_CALENDAR_SPEC.md R-TIME-03). Listed by start.
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
 * The checks of one availability write (docs/SHARED_CALENDAR_SPEC.md sections 6.5 and 6.7,
 * R-TYPE-04, R-PAT-04, R-ONE-03), on the state read inside the locked attempt, in this order:
 * `type_not_found` (a type in the body that does not exist), `limit_reached` (a 51st pattern, an
 * 11th one-off window on a date), `availability_overlap` (local times), `availability_conflict`
 * with `conflicts` (instants). `today` is the local date of `now` in `zone`. The item the write
 * replaces or deletes must exist; calendarDb checks that first.
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

// ── Booking (docs/SHARED_CALENDAR_SPEC.md section 8.2) ──────────────────────────────────────

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
// A slot and a User's appointment: 60 real minutes (docs/SHARED_CALENDAR_SPEC.md R-SLOT-01).
const SLOT_MS = HOUR_MS;
// The Administrator's step, and the shortest custom appointment (docs/SHARED_CALENDAR_SPEC.md decision D32).
const STEP_MS = TIME_STEP_MINUTES * MINUTE_MS;

/**
 * docs/SHARED_CALENDAR_SPEC.md R-BOOK-02, the times for the caller's role, from the body alone (the
 * zone is the only other input): `400 invalid_request` before Cognito and the lock
 * (docs/SHARED_CALENDAR_SPEC.md section 8.2, step 3 of its order). A User's `start` is a
 * whole local hour and `end` absent or `start + 60 min`; the Administrator's `start` and `end` lie
 * on the local step of TIME_STEP_MINUTES, `end` defaults to `start + 60 min`, and lasts at least one step.
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
  if (!isOnTimeStep(start, zone)) return refuse('invalid_request', `Invalid input: start must be on a ${TIME_STEP_MINUTES}-minute step`);
  const until = end ?? hourLater;
  if (!isOnTimeStep(until, zone)) return refuse('invalid_request', `Invalid input: end must be on a ${TIME_STEP_MINUTES}-minute step`);
  if (Date.parse(until) - Date.parse(start) < STEP_MS) return refuse('invalid_request', `Invalid input: an appointment lasts at least ${TIME_STEP_MINUTES} minutes`);
  return { start, end: until };
}

export type BookingRefusal = Refusal<
  | 'booking_in_past'
  | 'booking_notice_too_short'
  | 'booking_beyond_horizon'
  | 'outside_availability'
  | 'user_busy'
  | 'slot_taken'
  | 'appointment_limit_reached'
>;

export type BookingInput = {
  /** The times docs/SHARED_CALENDAR_SPEC.md R-BOOK-02 accepted, `end` filled in. */
  start: string;
  end: string;
  role: Role;
  /** The Cognito `sub` of the User the appointment is for. */
  userId: string;
  /**
   * The Administrator's force (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13): absent is false. It lifts
   * the capacity for the Administrator only; the handler has already refused a User sending it.
   */
  overbook?: boolean;
  settings: Pick<CalendarSettings, 'minBookingNoticeHours' | 'bookingHorizonDays' | 'maxFutureAppointmentsPerUser'>;
  state: CalendarState;
  now: string;
  today: string;
  zone: string;
};

/**
 * The booking rules that need the calendar (docs/SHARED_CALENDAR_SPEC.md section 8.2, step 5 of its
 * order), on the settings and the state read inside the locked attempt, in that order; the first
 * that fails decides:
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-03 `start > now`: `booking_in_past`;
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-04 `start − now ≥ minBookingNoticeHours` (a User only):
 *   `booking_notice_too_short`;
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-05 `localDateOf(start) ≤ today + bookingHorizonDays` (a User
 *   only): `booking_beyond_horizon`;
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-06 inside one effective window (docs/SHARED_CALENDAR_SPEC.md
 *   section 6.6: merged across sources) of the start's local date, a window whose type no longer
 *   exists left out as in the view: `outside_availability`;
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-12 no booked appointment of the target User (by `userId`)
 *   overlaps, compared as instants: `user_busy`. Nothing lifts it, `overbook` included, and it
 *   comes before the capacity, so the Administrator is never asked to force a booking the force
 *   cannot make;
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-07 the people in `[start, end)`, the booked appointments
 *   counted at their peak (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02), are fewer than the capacity of
 *   the window's type: `slot_taken`. The Administrator's `overbook` lifts it; on a time with a
 *   place left `overbook` changes nothing;
 * - docs/SHARED_CALENDAR_SPEC.md R-BOOK-09 (a User only) the User's booked appointments with
 *   `start > now`, by `userId`, are fewer than `maxFutureAppointmentsPerUser` when it is not null:
 *   `appointment_limit_reached`. One in progress or ended does not count.
 * docs/SHARED_CALENDAR_SPEC.md R-BOOK-08 needs no check here: R-BOOK-02 already allowed the
 * Administrator's custom times.
 * Answers the effective window that holds the appointment: its type is the appointment's.
 */
export function checkBooking(input: BookingInput): { window: EffectiveWindow } | BookingRefusal {
  const { start, end, role, userId, settings, state, now, today, zone } = input;
  const admin = role === 'admin';
  const ahead = Date.parse(start) - Date.parse(now);
  if (ahead <= 0) return refuse('booking_in_past', 'The start is not in the future');
  if (!admin && ahead < settings.minBookingNoticeHours * HOUR_MS) return refuse('booking_notice_too_short', 'Not enough notice before the start');
  const date = localDateOf(start, zone);
  if (!admin && date > addDays(today, settings.bookingHorizonDays)) return refuse('booking_beyond_horizon', 'The start is too far ahead');

  const typeIds = new Set(state.types.map((t) => t.typeId));
  const override = state.overrides.find((o) => o.date === date) ?? null;
  const defined = definedWindows(date, state.patterns, override, state.oneOffs).filter((w) => typeIds.has(w.typeId));
  const window = effectiveWindows(toInstantWindows(date, defined, zone)).find((w) => w.start <= start && end <= w.end);
  if (!window) return refuse('outside_availability', 'The time is not inside the availability');

  const booked = state.appointments.filter((a) => a.status === 'booked');
  if (booked.some((a) => a.userId === userId && overlaps(a, { start, end }))) {
    return refuse('user_busy', 'The User already has an appointment at this time');
  }
  // The window's type exists: the check of docs/SHARED_CALENDAR_SPEC.md R-BOOK-06 above kept only
  // the windows of existing types.
  const capacity = state.types.find((t) => t.typeId === window.typeId)!.capacity;
  if (!(admin && input.overbook === true) && peopleIn({ start, end }, booked) >= capacity) {
    return refuse('slot_taken', 'The time is already booked');
  }

  const limit = settings.maxFutureAppointmentsPerUser;
  if (!admin && limit !== null && booked.filter((a) => a.userId === userId && a.start > now).length >= limit) {
    return refuse('appointment_limit_reached', 'The maximum number of future appointments is reached');
  }
  return { window };
}

// ── Cancelling and the note (docs/SHARED_CALENDAR_SPEC.md sections 8.3 and 8.5) ─────────────

/**
 * `cancellableUntil` of an appointment in a response (docs/SHARED_CALENDAR_SPEC.md sections 8.1 and
 * 11.5): for a User caller on a `booked` appointment, `start − cancellationNoticeHours` (already in
 * the past once that moment has passed, ended appointments included); `null` on a `cancelled` one
 * and in every answer to the Administrator. It depends on the stored status only, never on the
 * clock.
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
export type CancelRefusal = Refusal<'appointment_not_found' | 'appointment_not_active' | 'cancellation_notice_too_short'>;

// The two checks that docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 18 and 19 share, in the
// order of docs/SHARED_CALENDAR_SPEC.md section 8.3. First docs/SHARED_CALENDAR_SPEC.md R-CAN-01 and
// R-PERM-01: absent or (for a User) not theirs by `sub` is 404, before anything that would tell its
// status. Then docs/SHARED_CALENDAR_SPEC.md R-CAN-02 and R-NOTE-01: `status = booked` and
// `end > now`, else 409.
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
 * The cancel checks (docs/SHARED_CALENDAR_SPEC.md section 8.3, in its order), on the appointment read
 * inside the locked attempt (or `null` if there is none) and the settings read with it; the first
 * that fails decides:
 * - docs/SHARED_CALENDAR_SPEC.md R-CAN-01 / R-PERM-01: absent, or a User caller whose `sub` is not
 *   its `userId`: `appointment_not_found` (404, never 403, so ids cannot be probed);
 * - docs/SHARED_CALENDAR_SPEC.md R-CAN-02: `status = booked` and `end > now`:
 *   `appointment_not_active`;
 * - docs/SHARED_CALENDAR_SPEC.md R-CAN-03 (a User only): `now ≤ start − cancellationNoticeHours`, the
 *   response's `cancellableUntil`, compared to the millisecond: `cancellation_notice_too_short`.
 *   Exactly the notice before the start is allowed; an appointment in progress is refused here, not
 *   by docs/SHARED_CALENDAR_SPEC.md R-CAN-02. The Administrator is exempt and may cancel one in
 *   progress.
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
    return refuse('cancellation_notice_too_short', 'Too late to cancel this appointment');
  }
  return null;
}

/**
 * The note checks (docs/SHARED_CALENDAR_SPEC.md R-NOTE-01 and section 8.5), on the appointment read
 * inside the locked attempt (or `null`): docs/SHARED_CALENDAR_SPEC.md R-PERM-01
 * (`appointment_not_found`), then active and not ended (`appointment_not_active`); no notice
 * applies. `note` is the new note, already trimmed with an empty one made `null`
 * (docs/SHARED_CALENDAR_SPEC.md R-BOOK-11). Answers whether it equals the stored one: then nothing is
 * written, no event either.
 */
export function checkNote(
  appointment: (CheckedAppointment & { note: string | null }) | null,
  note: string | null,
  caller: Caller,
  now: string,
): NoteRefusal | { unchanged: boolean } {
  return checkVisibleAndActive(appointment, caller, now) ?? { unchanged: appointment!.note === note };
}

// ── Changing (docs/SHARED_CALENDAR_SPEC.md section 8.4) ─────────────────────────────────────

export type ChangeRefusal = CancelRefusal | BookingRefusal;

export type ChangeInput = {
  /** The old appointment read inside the locked attempt, or null when there is none. */
  appointment: (CheckedAppointment & { appointmentId: string }) | null;
  caller: Caller;
  /** The new times docs/SHARED_CALENDAR_SPEC.md R-BOOK-02 accepted for the caller's role, `end` filled in. */
  start: string;
  end: string;
  /** The Administrator's force, as in a booking (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13). */
  overbook?: boolean;
  settings: Pick<CalendarSettings, 'cancellationNoticeHours' | 'minBookingNoticeHours' | 'bookingHorizonDays' | 'maxFutureAppointmentsPerUser'>;
  state: CalendarState;
  now: string;
  today: string;
  zone: string;
};

/**
 * The change checks (docs/SHARED_CALENDAR_SPEC.md section 8.4, in its order), on what calendarDb read
 * inside the locked attempt; the first that fails decides:
 * - the old appointment, as a cancel (checkCancel): docs/SHARED_CALENDAR_SPEC.md R-CAN-01 / R-PERM-01
 *   (`appointment_not_found`), R-CAN-02 (`appointment_not_active`, also for one already changed),
 *   for a User R-CAN-03 (`cancellation_notice_too_short`, with a change's wording);
 * - the new one, as a booking (checkBooking) for the old appointment's User
 *   (docs/SHARED_CALENDAR_SPEC.md R-BOOK-01: its `userId`), on the state with the old appointment
 *   left out by id: that is both adjustments of docs/SHARED_CALENDAR_SPEC.md R-CHG-01, R-BOOK-12
 *   and R-BOOK-07 ignore it and R-BOOK-09 does not count it. `overbook` is passed on.
 * docs/SHARED_CALENDAR_SPEC.md R-BOOK-10 is not here: the marker is a condition of the transaction.
 * Answers the effective window that holds the new appointment: its type is the new appointment's.
 */
export function checkChange(input: ChangeInput): { window: EffectiveWindow } | ChangeRefusal {
  const { appointment, caller, start, end, overbook, settings, state, now, today, zone } = input;
  const refusal = checkCancel(appointment, caller, settings, now);
  if (refusal) {
    return refusal.error === 'cancellation_notice_too_short' ? refuse(refusal.error, 'Too late to change this appointment') : refusal;
  }
  const old = appointment!;
  const others = { ...state, appointments: state.appointments.filter((a) => a.appointmentId !== old.appointmentId) };
  return checkBooking({ start, end, role: caller.role, userId: old.userId, overbook, settings, state: others, now, today, zone });
}

// ── The calendar view (docs/SHARED_CALENDAR_SPEC.md sections 11.6, 7, 8.6 and 17) ───────────

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
  types: readonly { typeId: string; name: string; capacity: number }[];
  patterns: readonly PatternInput[];
  /** The overrides dated in the range; one of another date is ignored. */
  overrides: readonly OverrideInput[];
  /** The one-off windows dated in the range. */
  oneOffs: readonly OneOffInput[];
  /** The appointments starting in the range, every status; one dated outside the range is ignored. */
  appointments: readonly ViewAppointment[];
};

// The appointment as a response (docs/SHARED_CALENDAR_SPEC.md section 11.5), field by field in the
// contract's order, so nothing stored beside it can reach the body. `cancellableUntil` for a User;
// null for the Administrator.
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
 * The busy times of one date for a User (docs/SHARED_CALENDAR_SPEC.md R-SLOT-06): the maximal
 * intervals in which the booked appointments of the date, the User's own included, are at least
 * the capacity that applies there, with the times of the User's own appointments (`own`) taken
 * out. The capacity that applies at an instant is that of the effective window holding it, or 1
 * where none does (an appointment left from availability changed since,
 * docs/SHARED_CALENDAR_SPEC.md section 22, assumption A3). The date is cut at every start and end
 * of an appointment and of a window; on each piece the count and the capacity are constant, and
 * the full pieces outside the User's own appointments are joined where they touch.
 */
function busyOf(
  appointments: readonly Interval[],
  own: readonly Interval[],
  windows: readonly (Interval & { capacity: number })[],
): Interval[] {
  const cuts = [...new Set([...appointments, ...windows].flatMap((i) => [i.start, i.end]))].sort(byInstant);
  const busy: Interval[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piece = { start: cuts[i]!, end: cuts[i + 1]! };
    const people = appointments.filter((a) => a.start <= piece.start && piece.end <= a.end).length;
    const capacity = windows.find((w) => w.start <= piece.start && piece.end <= w.end)?.capacity ?? 1;
    // The User's own appointments are among the appointments, so their ends are cuts too: a piece
    // lies wholly inside one of them or outside all.
    const mine = own.some((o) => o.start <= piece.start && piece.end <= o.end);
    if (people < capacity || mine) continue;
    const last = busy.at(-1);
    if (last !== undefined && last.end === piece.start) last.end = piece.end;
    else busy.push(piece);
  }
  return busy;
}

/**
 * The calendar view of `from`..`to` for one caller (docs/SHARED_CALENDAR_SPEC.md section 11.6), pure:
 * "now" and the zone passed in, "today" = localDateOf(now, zone) (docs/SHARED_CALENDAR_SPEC.md
 * R-TIME-04). Per date:
 * - `windows`: the defined windows (docs/SHARED_CALENDAR_SPEC.md section 6.5) as instants, sorted,
 *   not merged (docs/SHARED_CALENDAR_SPEC.md decision T11); `source`, `sourceId` for the
 *   Administrator only. A window whose type no longer exists is left out (it can only lie in the
 *   past: docs/SHARED_CALENDAR_SPEC.md R-TYPE-03 and R-VIEW-03), and so is one that holds no real
 *   time (it starts in the hour skipped when clocks go forward and ends at or just after it);
 * - `slots`: the slots (docs/SHARED_CALENDAR_SPEC.md R-SLOT-01) of the effective windows
 *   (docs/SHARED_CALENDAR_SPEC.md section 6.6), each with its type's capacity and its places left,
 *   the capacity minus the booked appointments in it counted at their peak, never below 0
 *   (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02). A User gets those with a place left that overlap none
 *   of the User's own appointments and pass the timing of docs/SHARED_CALENDAR_SPEC.md R-SLOT-03
 *   (`start > now`, the minimum notice, the horizon); the Administrator every slot with
 *   `start > now`, the full ones included with `placesLeft: 0` (docs/SHARED_CALENDAR_SPEC.md
 *   R-SLOT-04, decision D30). A past date has windows and no slots (docs/SHARED_CALENDAR_SPEC.md
 *   R-VIEW-03);
 * - `busy`: for a User, the times of that date that are full, as bare intervals, sorted, with the
 *   User's own appointments taken out (busyOf, docs/SHARED_CALENDAR_SPEC.md R-SLOT-06 and section
 *   17); `[]` for the Administrator;
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

  const capacities = new Map(input.types.map((t) => [t.typeId, t.capacity]));
  const bookedTimes = booked.map((a) => a.appointment);
  const own = booked.filter((a) => a.userId === callerSub).map((a) => a.appointment);

  // A slot with its capacity and places left (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02). Its window's
  // type exists: the windows of a deleted type were left out.
  const placed = (slot: SlotTimes): Slot => {
    const capacity = capacities.get(slot.typeId)!;
    return { ...slot, capacity, placesLeft: Math.max(0, capacity - peopleIn(slot, bookedTimes)) };
  };
  // docs/SHARED_CALENDAR_SPEC.md R-SLOT-03 for a User, R-SLOT-04 for the Administrator.
  const offered = (slot: Slot): boolean => {
    const ahead = Date.parse(slot.start) - nowMs;
    if (ahead <= 0) return false;
    if (admin) return true;
    if (ahead < settings.minBookingNoticeHours * HOUR_MS || localDateOf(slot.start, zone) > lastBookable) return false;
    return slot.placesLeft > 0 && !own.some((a) => overlaps(slot, a));
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
    const effective = effectiveWindows(instants);
    const slots = effective.flatMap((w) => slotsOf(w, zone)).map(placed).filter(offered);
    const busy: Interval[] = admin
      ? []
      : busyOf(
          booked.filter((a) => a.appointment.date === date).map((a) => a.appointment),
          own,
          effective.map((w) => ({ ...w, capacity: capacities.get(w.typeId)! })),
        );
    days.push({ date, weekday: weekdayOf(date), windows, slots, busy, ...(admin && { hasOverride: override !== null }) });
  }

  const appointments = booked
    .filter((a) => admin || a.userId === callerSub)
    .map((a) => toResponse(a.appointment, cancellableUntilFor(a.appointment, role, settings)));
  return { timeZone: zone, from, to, generatedAt: now, days, appointments };
}
