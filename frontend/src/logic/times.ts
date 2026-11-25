import { TIME_STEP_MINUTES } from '@shared-calendar/shared';

// A time of the Administrator as the page offers it (docs/FRONTEND_ARCHITECTURE.md section
// 5.1): two short lists, its hour and its minute, on the step of shared/ (TIME_STEP_MINUTES,
// docs/SHARED_CALENDAR_SPEC.md decision D32), and the end a chosen start sets. The five places
// with a start and an end, the two forms of a pattern, the two forms of a window of a date and
// the book dialog, all use what is here; the four forms of a window offer an end of whole hours
// only (docs/SHARED_CALENDAR_SPEC.md decision D33). Pure: times are local `HH:mm` texts, "24:00"
// being the midnight that ends a day.

export const DAY_MINUTES = 24 * 60;
const HOUR = 60;

// "HH:mm" for a number of minutes from midnight, and back.
export function clockOf(minute: number): string {
  return `${String(Math.floor(minute / HOUR)).padStart(2, '0')}:${String(minute % HOUR).padStart(2, '0')}`;
}
export function minuteOfClock(time: string): number {
  return Number(time.slice(0, 2)) * HOUR + Number(time.slice(3, 5));
}

const two = (n: number) => String(n).padStart(2, '0');
const hoursFrom = (first: number, last: number) => Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => two(first + i));

// The minutes of an hour, every step of it: 00, 05 … 55.
export const MINUTES: readonly string[] = Array.from({ length: HOUR / TIME_STEP_MINUTES }, (_, i) => two(i * TIME_STEP_MINUTES));
// The hour 24 has one minute, 00: 24:00 is the last time of a day, and 24:05 none.
export function minutesOf(hour: string): readonly string[] {
  return hour === '24' ? ['00'] : MINUTES;
}

// A time taken apart into its hour and its minute, and put together again. A list with nothing
// chosen gives an empty text, and so does the time put together from it.
export function partsOf(time: string): { hour: string; minute: string } {
  return { hour: time.slice(0, 2), minute: time.slice(3, 5) };
}
export function timeOf(hour: string, minute: string): string {
  return hour === '' || minute === '' ? '' : `${hour}:${minute}`;
}

// The hours of a start and of an end.
export type TimeHours = { starts: readonly string[]; ends: readonly string[] };

// The last end a form of a window allows.
export const LAST_TIME = '24:00';

// In a form of a window a window lasts a whole number of hours and ends on its own date, at
// 24:00 at the latest (docs/SHARED_CALENDAR_SPEC.md section 6.2). So a start is 00:00 to 23:00:
// the hour 23 has the minute 00 only, since 23:05 would end past midnight.
export const WINDOW_STARTS: readonly string[] = hoursFrom(0, 23);
export function startMinutesOf(hour: string): readonly string[] {
  return hour === '23' ? ['00'] : MINUTES;
}

// What the end of a form of a window offers for a start: the hours after the start's, up to 23,
// and 24 only when the start is on the hour; and one minute, the start's. 08:05 gives the hours
// 09 to 23 and the minute 05; 08:00 the hours 09 to 24; 23:00 the hour 24 alone.
export function windowEnds(start: string): { hours: readonly string[]; minute: string } {
  const { hour, minute } = partsOf(start);
  return { hours: hoursFrom(Number(hour) + 1, minute === '00' ? 24 : 23), minute };
}

// The end after the person chose the start's hour or its minute, `end` being the end before. A
// new hour sets the end one hour later (endFor). A new minute alone keeps the end's hour, with the
// new minute, so the length chosen stays (08:05–11:05, the minute 30: 08:30–11:30); when that hour
// is no longer offered (08:00–24:00, the minute 05), the end is one hour after the start.
export function endAfter(start: string, end: string, changed: 'hour' | 'minute'): string {
  const kept = partsOf(end).hour;
  return changed === 'minute' && windowEnds(start).hours.includes(kept) ? timeOf(kept, partsOf(start).minute) : endFor(start, LAST_TIME);
}

// In the book dialog, the hours that the window holding the slot touches, `from` and `to` being
// minutes on the clock of the slot's day: a start may begin at the window's start and up to a
// step before its end, an end from a step after its start up to its end. A window 08:05–12:00
// gives the starts 08 to 11 and the ends 08 to 12. The minutes are all twelve whatever the hour,
// so a time outside the window can be put together: whether a booking is allowed is the
// server's to say (docs/FRONTEND_SERVICES.md section 8, decision 42).
export function windowHours(from: number, to: number): TimeHours {
  const hour = (minute: number) => Math.floor(minute / HOUR);
  return { starts: hoursFrom(hour(from), hour(to - TIME_STEP_MINUTES)), ends: hoursFrom(hour(from + TIME_STEP_MINUTES), hour(to)) };
}

// The end that a start chosen by the person sets: one hour later on the clock, or `last`, the
// last time allowed, when one hour later would pass it (24:00 in a form of a window, the end of
// the slot's window in the book dialog). A start at or after `last`, which only the book dialog
// can hold, is outside the window anyway: its end is then one hour later, up to 24:00, so that
// the server's refusal says the time is outside the opening hours rather than that the end is
// not after the start.
export function endFor(start: string, last: string): string {
  const from = minuteOfClock(start);
  const limit = minuteOfClock(last) > from ? minuteOfClock(last) : DAY_MINUTES;
  return clockOf(Math.min(from + HOUR, limit));
}
