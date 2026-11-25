import { TIME_STEP_MINUTES } from '@shared-calendar/shared';

// A time of the Administrator as the page offers it (docs/FRONTEND_ARCHITECTURE.md section
// 5.1): two short lists, its hour and its minute, on the step of shared/ (TIME_STEP_MINUTES,
// docs/SHARED_CALENDAR_SPEC.md decision D32), and the end a chosen start sets. The five places
// with a start and an end, the two forms of a pattern, the two forms of a window of a date and
// the book dialog, all use what is here. Pure: times are local `HH:mm` texts, "24:00" being the
// midnight that ends a day.

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

// In a form of a window: a start from 00:00 to 23:55, an end up to 24:00
// (docs/SHARED_CALENDAR_SPEC.md section 6.2). The end may be chosen as early as 00:00: an end
// not after its start is the form's to refuse, in words, like any other.
export const WINDOW_HOURS: TimeHours = { starts: hoursFrom(0, 23), ends: hoursFrom(0, 24) };
// The last end a form of a window allows.
export const LAST_TIME = '24:00';

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
