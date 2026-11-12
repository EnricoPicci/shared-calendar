// The time helpers of the shared calendar (spec R-TIME-02, R-TIME-03, R-TIME-06).
//
// Only the built-in Intl API (decision T6), and nothing that depends on the machine's own time
// zone: dates are counted through UTC (Date.UTC, getUTC*), and the wall clock of a zone is read
// with Intl.DateTimeFormat(…, { timeZone }).formatToParts. Inputs are assumed to be valid
// (the schemas in schemas.ts check them first): local date `YYYY-MM-DD`, local time `HH:mm`,
// instant in the toISOString form.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

// `y`, `m` (1–12), `d` of a `YYYY-MM-DD` date.
function parseDate(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

// Milliseconds of a UTC calendar day plus minutes. setUTCFullYear, not Date.UTC: Date.UTC maps
// the years 0–99 to 1900–1999. Minutes may overflow the day (24:00 is the next midnight).
function utcMs(y: number, m: number, d: number, minutes = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getTime() + minutes * MINUTE_MS;
}

function formatUtcDate(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// The wall clock of `zone` at the instant `ms`. hourCycle 'h23', not hour12: false: some engines
// format midnight as "24" with hour12: false.
function wallClock(ms: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ms);
  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: field('year'),
    month: field('month'),
    day: field('day'),
    hour: field('hour'),
    minute: field('minute'),
    second: field('second'),
  };
}

// The UTC offset of `zone` at the instant `ms`, in milliseconds (Rome in summer: +7 200 000).
function offsetAt(ms: number, zone: string): number {
  const w = wallClock(ms, zone);
  const wallAsUtc = utcMs(w.year, w.month, w.day, w.hour * 60 + w.minute) + w.second * 1000;
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which the wall clock of `zone` shows `date` `time` (R-TIME-03, the "compatible"
 * rule of Temporal):
 * - a time that occurs twice (clocks go back) takes the earlier occurrence;
 * - a time that does not exist (clocks go forward) moves forward by the length of the gap.
 * `24:00` is accepted and means midnight at the end of `date` (the end of a window).
 */
export function toInstant(date: string, time: string, zone: string): string {
  const [y, m, d] = parseDate(date);
  const wall = utcMs(y, m, d, Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)));
  // A zone changes its offset at most once within a day either side of any real moment, so the
  // offsets one day before and one day after are the only two candidates.
  const before = offsetAt(wall - DAY_MS, zone);
  const after = offsetAt(wall + DAY_MS, zone);
  const valid = [wall - before, wall - after].filter((ms) => offsetAt(ms, zone) === wall - ms);
  // No candidate fits: the time is in a gap. Reading it with the offset in force before the gap
  // puts it after the gap, shifted by the gap's length (02:30 → 03:30).
  const ms = valid.length > 0 ? Math.min(...valid) : wall - before;
  return new Date(ms).toISOString();
}

/** The local date (`YYYY-MM-DD`) in `zone` at `instant`. */
export function localDateOf(instant: string, zone: string): string {
  const w = wallClock(Date.parse(instant), zone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** The local time (`HH:mm`, `00:00`–`23:59`) in `zone` at `instant`. Never `24:00`. */
export function localTimeOf(instant: string, zone: string): string {
  const w = wallClock(Date.parse(instant), zone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** The ISO weekday of a local date: 1 = Monday … 7 = Sunday (R-TIME-02). */
export function weekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  const day = new Date(utcMs(y, m, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The local date `n` calendar days after `date` (`n` may be negative). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parseDate(date);
  return formatUtcDate(utcMs(y, m, d + n));
}

/** Whether `Intl.DateTimeFormat` accepts `zone` as a time zone: the cold-start check of R-TIME-01. */
export function isValidTimeZone(zone: unknown): boolean {
  // Checked before Intl: `timeZone: undefined` silently means the machine's own zone.
  if (typeof zone !== 'string' || zone === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

