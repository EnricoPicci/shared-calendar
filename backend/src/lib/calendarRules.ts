import {
  CALENDAR_LIMITS,
  addDays,
  definedWindows,
  effectiveWindows,
  overlaps,
  toInstantWindows,
  weekdayOf,
  type ApiErrorCode,
  type Appointment,
  type AppointmentConflict,
  type AppointmentStatus,
  type OneOffInput,
  type OverrideInput,
  type PatternInput,
  type SourcedWindow,
  type WindowBody,
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

/** What a check needs of an appointment (8.1); `appointmentId`, `username` only for `conflicts`. */
export type StateAppointment = Pick<Appointment, 'appointmentId' | 'username' | 'start' | 'end' | 'date' | 'typeId' | 'status'>;

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
