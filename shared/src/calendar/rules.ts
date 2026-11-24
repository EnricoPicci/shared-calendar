import { localTimeOf, toInstant, weekdayOf } from './time';
import type { DateOverride, OneOffWindow, Slot, WeeklyPattern, WindowSource } from './types';

// The pure calendar rules both sides use (docs/SHARED_CALENDAR_SPEC.md sections 6.5, 6.6 and 7,
// R-BOOK-02, R-CAN-03 and section 12). Plain data in, plain data out: no clock (`now` and the zone
// are arguments), no I/O. The inputs are the fields the API returns, so a stored item with extra
// attributes (PK, SK, createdAt, …) can be passed as it is. Inputs are assumed valid (the schemas
// checked them on the way in). The back end decides with these; the front end only validates before
// sending and presents (docs/SHARED_CALENDAR_SPEC.md section 12).

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
// A slot is 60 real minutes (docs/SHARED_CALENDAR_SPEC.md R-SLOT-01, R-TIME-03).
const SLOT_MS = HOUR_MS;

export type PatternInput = Pick<WeeklyPattern, 'patternId' | 'weekday' | 'start' | 'end' | 'typeId' | 'validFrom' | 'validUntil'>;
export type OverrideInput = Pick<DateOverride, 'date' | 'windows'>;
export type OneOffInput = Pick<OneOffWindow, 'windowId' | 'date' | 'start' | 'end' | 'typeId'>;

/**
 * A defined window with its origin (the Administrator's view shows both,
 * docs/SHARED_CALENDAR_SPEC.md section 11.6). `start` and `end` are local times from
 * definedWindows, or instants after toInstantWindows.
 */
export type SourcedWindow = { start: string; end: string; typeId: string; source: WindowSource; sourceId: string };
/** An effective window (docs/SHARED_CALENDAR_SPEC.md section 6.6): instants, merged. */
export type EffectiveWindow = { start: string; end: string; typeId: string };

// Local times and instants both sort as strings. Array.prototype.sort is stable: windows with the
// same start (only in data that breaks docs/SHARED_CALENDAR_SPEC.md R-AV-01) keep their order.
function byStart(a: { start: string }, b: { start: string }): number {
  return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
}

/**
 * The defined windows of `date` (docs/SHARED_CALENDAR_SPEC.md section 6.5), in local times, sorted
 * by start. base(date) is the override's windows if `date` has one, also when empty
 * (docs/SHARED_CALENDAR_SPEC.md R-OVR-01); otherwise the windows of the patterns valid on `date`:
 * same weekday, validFrom ≤ date ≤ validUntil, no upper bound when null
 * (docs/SHARED_CALENDAR_SPEC.md R-PAT-01). The one-off windows of `date` are added on top
 * (docs/SHARED_CALENDAR_SPEC.md R-ONE-01).
 * `override` is the date's override or null; an override or a one-off window of another date is ignored.
 */
export function definedWindows(
  date: string,
  patterns: readonly PatternInput[],
  override: OverrideInput | null,
  oneOffs: readonly OneOffInput[],
): SourcedWindow[] {
  const base: SourcedWindow[] =
    override !== null && override.date === date
      ? override.windows.map((w) => ({ start: w.start, end: w.end, typeId: w.typeId, source: 'override', sourceId: date }))
      : patterns
          .filter((p) => p.weekday === weekdayOf(date) && p.validFrom <= date && (p.validUntil === null || date <= p.validUntil))
          .map((p) => ({ start: p.start, end: p.end, typeId: p.typeId, source: 'pattern', sourceId: p.patternId }));
  const added: SourcedWindow[] = oneOffs
    .filter((w) => w.date === date)
    .map((w) => ({ start: w.start, end: w.end, typeId: w.typeId, source: 'one_off', sourceId: w.windowId }));
  return [...base, ...added].sort(byStart);
}

/**
 * Windows of `date` in local times, as instants in `zone` (docs/SHARED_CALENDAR_SPEC.md R-TIME-03),
 * sorted by start. They are what the calendar view shows, not merged (docs/SHARED_CALENDAR_SPEC.md
 * section 11.6), and the input of effectiveWindows. On the night clocks go forward, a window that
 * starts in the skipped hour and ends at or just after it holds no real time (02:30–03:00 becomes
 * 01:30Z–01:00Z); effectiveWindows drops it.
 */
export function toInstantWindows(date: string, windows: readonly SourcedWindow[], zone: string): SourcedWindow[] {
  return windows
    .map((w) => ({ ...w, start: toInstant(date, w.start, zone), end: toInstant(date, w.end, zone) }))
    .sort(byStart);
}

/**
 * The effective windows (docs/SHARED_CALENDAR_SPEC.md section 6.6) of windows given as instants:
 * sorted by start, those holding no real time dropped, and adjacent windows of the same type merged
 * (one ends exactly where the next starts). Touching windows of different types stay separate.
 */
export function effectiveWindows(windows: readonly { start: string; end: string; typeId: string }[]): EffectiveWindow[] {
  const merged: EffectiveWindow[] = [];
  for (const w of [...windows].sort(byStart)) {
    if (w.start >= w.end) continue;
    const last = merged.at(-1);
    if (last !== undefined && last.typeId === w.typeId && last.end === w.start) last.end = w.end;
    else merged.push({ start: w.start, end: w.end, typeId: w.typeId });
  }
  return merged;
}

/**
 * The slots of one effective window (docs/SHARED_CALENDAR_SPEC.md R-SLOT-01): every
 * `[s, s + 60 real minutes)` inside it whose start is a whole hour on the local clock of `zone`.
 * Whether a slot is free or bookable is decided elsewhere (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02,
 * R-SLOT-03, R-SLOT-04). Around a clock change the local hours are followed, not UTC's: on the
 * night clocks go forward the window 01:00–04:00 gives 01:00 (ending at local 03:00) and 03:00; on
 * the night they go back it gives four slots, two of them at local 02:00 (one per offset).
 */
export function slotsOf(window: EffectiveWindow, zone: string): Slot[] {
  const slots: Slot[] = [];
  const end = Date.parse(window.end);
  let s = Date.parse(window.start);
  while (s + SLOT_MS <= end) {
    const minute = Number(localTimeOf(new Date(s).toISOString(), zone).slice(3, 5));
    if (minute === 0) {
      slots.push({ start: new Date(s).toISOString(), end: new Date(s + SLOT_MS).toISOString(), typeId: window.typeId });
      s += SLOT_MS;
    } else {
      // To the next whole local hour. A clock change on the way is caught by the next check.
      s += (60 - minute) * MINUTE_MS;
    }
  }
  return slots;
}

/**
 * Whether `[a.start, a.end)` and `[b.start, b.end)` overlap (docs/SHARED_CALENDAR_SPEC.md
 * R-SLOT-02, R-AV-01): `a < d` and `c < b`, so touching intervals do not. Both must be of the same
 * kind: instants in the toISOString form, or local times of the same date (`24:00` sorts last);
 * both compare as strings.
 */
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The people in `interval` (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02, decision D25): the most of
 * `appointments` present at one instant inside it, their peak, not their sum. Intervals are
 * `[start, end)`, so two that touch are never present together, and one that only touches the
 * interval's edge is not in it. All are instants in the toISOString form, which compare as
 * strings. The caller chooses what to pass (the active appointments, the old one of a change left
 * out, the User's own or not): this only counts.
 */
export function peopleIn(interval: { start: string; end: string }, appointments: readonly { start: string; end: string }[]): number {
  // Each appointment, cut to the interval, gives +1 at its start and -1 at its end. At the same
  // instant the ends come first, so that one leaving and one arriving are never counted together.
  const steps: [string, number][] = [];
  for (const a of appointments) {
    if (!overlaps(a, interval)) continue;
    steps.push([a.start > interval.start ? a.start : interval.start, 1]);
    steps.push([a.end < interval.end ? a.end : interval.end, -1]);
  }
  steps.sort(([t1, d1], [t2, d2]) => (t1 < t2 ? -1 : t1 > t2 ? 1 : d1 - d2));
  let present = 0;
  let peak = 0;
  for (const [, delta] of steps) {
    present += delta;
    peak = Math.max(peak, present);
  }
  return peak;
}

// The minute of the local clock of `zone` at `instant`, or -1 when the instant has seconds.
function localMinute(instant: string, zone: string): number {
  if (Date.parse(instant) % MINUTE_MS !== 0) return -1;
  return Number(localTimeOf(instant, zone).slice(3, 5));
}

/**
 * Whether `instant` is a whole hour (`hh:00`) on the local clock of `zone`: a User's start
 * (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02).
 */
export function isWholeLocalHour(instant: string, zone: string): boolean {
  return localMinute(instant, zone) === 0;
}

/**
 * Whether `instant` is on the local 15-minute grid of `zone`: the Administrator's times
 * (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02).
 */
export function isOnQuarterGrid(instant: string, zone: string): boolean {
  return localMinute(instant, zone) % 15 === 0;
}

/**
 * The last instant at which a User may still cancel or change the appointment
 * (docs/SHARED_CALENDAR_SPEC.md R-CAN-03, section 8.1): `start − cancellationNoticeHours`, in real
 * hours. Whether it is sent (User) or null (Administrator) is the handler's decision.
 */
export function cancellableUntil(
  appointment: { start: string },
  settings: { cancellationNoticeHours: number },
): string {
  return new Date(Date.parse(appointment.start) - settings.cancellationNoticeHours * HOUR_MS).toISOString();
}
