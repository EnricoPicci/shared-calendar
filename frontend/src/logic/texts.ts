import { localDateOf, localTimeOf } from '@shared-calendar/shared';

// The texts that depend on data (docs/FRONTEND_ARCHITECTURE.md section 5 and section 12.4): a
// date, a time, a range, a week's label, a UTC offset, and a failure in plain words. Pure
// functions. A time is read in the time zone given, through the helpers of shared/; a date is
// turned into words reading it as UTC. The browser's own zone plays no part in either.

const MINUTE_MS = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

type DateParts = { weekday: string; day: string; month: string; year: string };

// The words of a local date `YYYY-MM-DD`. The parts are put together here, not by Intl, so that
// the order and the punctuation do not change with the browser's version of the locale data.
function partsOf(date: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: part('weekday'), day: part('day'), month: part('month'), year: part('year') };
}

// A local date as a day of the week calendar: "Mon 16 Nov".
export function dateText(date: string): string {
  const { weekday, day, month } = partsOf(date);
  return `${weekday} ${day} ${month}`;
}

// The seven days from `monday`: "16 Nov – 22 Nov 2026". The first date carries its year only when
// the week ends in another one: "28 Dec 2026 – 3 Jan 2027".
export function weekLabel(monday: string, sunday: string): string {
  const first = partsOf(monday);
  const last = partsOf(sunday);
  const firstYear = first.year === last.year ? '' : ` ${first.year}`;
  return `${first.day} ${first.month}${firstYear} – ${last.day} ${last.month} ${last.year}`;
}

// The UTC offset of `zone` at `instant`: "+02:00", "-03:30", "+00:00". It is what the zone's
// clock shows, read as if it were UTC, minus the instant itself, both to the minute.
export function offsetText(instant: string, zone: string): string {
  const wall = Date.parse(`${localDateOf(instant, zone)}T${localTimeOf(instant, zone)}:00Z`);
  const minutes = Math.round((wall - Math.floor(Date.parse(instant) / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
  const size = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(size / 60))}:${pad(size % 60)}`;
}

// The clock of `zone` at `instant`: "09:00"; with its offset, "02:00 +02:00", which tells apart
// the two hours with the same name on the night the clocks go back
// (docs/SHARED_CALENDAR_SPEC.md section 16.8).
export function timeText(instant: string, zone: string, withOffset = false): string {
  const time = localTimeOf(instant, zone);
  return withOffset ? `${time} ${offsetText(instant, zone)}` : time;
}

// From `start` to `end`: "09:00–10:00". An end at midnight of a later day is "24:00", the way the
// end of a window is written (docs/SHARED_CALENDAR_SPEC.md R-TIME-02). With the offsets:
// "02:00 +02:00 – 02:00 +01:00".
export function rangeText(start: string, end: string, zone: string, withOffset = false): string {
  const endsAtMidnight = localTimeOf(end, zone) === '00:00' && localDateOf(end, zone) > localDateOf(start, zone);
  const endTime = endsAtMidnight ? '24:00' : localTimeOf(end, zone);
  if (!withOffset) return `${timeText(start, zone)}–${endTime}`;
  return `${timeText(start, zone, true)} – ${endTime} ${offsetText(end, zone)}`;
}

// What went wrong, in words for the person in front of the screen. Never the service's own
// `message`, which is written for a developer.
const GENERAL = 'Something went wrong. Please try again.';
const PLAIN_WORDS = new Map<string, string>([
  // Every API call (the transport reasons of docs/FRONTEND_SERVICES.md section 10.2), and the
  // login where it has the same reason.
  ['network', 'The server cannot be reached. Check the connection and try again.'],
  ['server', 'The server is not answering as it should. Please try again in a moment.'],
  ['unexpected', GENERAL],
  ['not_signed_in', 'You are not signed in. Please sign in again.'],
  ['session_rejected', 'Your session has ended. Please sign in again.'],
  // GET /calendar (docs/FRONTEND_SERVICES.md section 18.1).
  ['forbidden', 'Your account is not allowed to do this.'],
  ['invalid_request', 'The request was not accepted. Please try again.'],
  ['internal_error', 'Something went wrong on the server. Please try again in a moment.'],
  // The login (docs/FRONTEND_SERVICES.md section 4.3). A wrong password and an unknown user are
  // one reason, so that the sentence does not say which usernames exist.
  ['invalid_credentials', 'The username or the password is not correct.'],
  ['too_many_attempts', 'Too many attempts. Please wait a few minutes and try again.'],
  ['password_reset_required', 'Your password must be reset before you can sign in. Please ask the Administrator.'],
  ['challenge', 'This account needs a sign-in step that this page does not offer. Please ask the Administrator.'],
  ['no_role', 'Your account has no role yet, so it cannot use the calendar. Please ask the Administrator.'],
]);

// A failure's `reason` as a sentence; a reason without a sentence of its own gets the general one.
export function failureText(reason: string): string {
  return PLAIN_WORDS.get(reason) ?? GENERAL;
}
