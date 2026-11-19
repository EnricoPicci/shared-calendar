import { localDateOf, localTimeOf, toInstant } from '@shared-calendar/shared';

// The texts that depend on data (docs/FRONTEND_ARCHITECTURE.md section 5 and section 12.4): a
// date, a time, a range, a date with a time, a week's label, a UTC offset, and a failure in plain
// words. Pure
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

// Whether the UTC offset of `zone` changes during the local date `date`: the day the clocks go
// back or forward. Every time shown in such a day carries its offset
// (docs/SHARED_CALENDAR_SPEC.md section 16.8).
export function offsetChangesOn(date: string, zone: string): boolean {
  return offsetText(toInstant(date, '00:00', zone), zone) !== offsetText(toInstant(date, '24:00', zone), zone);
}

// An instant as a day and a time on the clock of `zone`: "Mon 23 Nov, 10:00"; on a day whose
// offset changes, "Sun 31 Oct, 02:00 +01:00".
export function dateTimeText(instant: string, zone: string): string {
  const date = localDateOf(instant, zone);
  return `${dateText(date)}, ${timeText(instant, zone, offsetChangesOn(date, zone))}`;
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
  ['invalid_request', 'The request was not accepted. Check what you entered and try again.'],
  ['internal_error', 'Something went wrong on the server. Please try again in a moment.'],
  // Booking, cancelling, changing and the note (docs/FRONTEND_SERVICES.md section 19.1) and the
  // list of users (docs/FRONTEND_SERVICES.md section 13.1). After a refused booking or change
  // the week is loaded again (docs/FRONTEND_ARCHITECTURE.md section 5.1), which is what the
  // sentence of `slot_taken` says.
  ['invalid_json', 'The server could not read the request. Please try again.'],
  ['slot_taken', 'This time has just been taken. The calendar has been refreshed: please choose another time.'],
  ['booking_in_past', 'This time has already passed. Please choose a later one.'],
  ['booking_notice_too_short', 'This time is too soon to be booked. Please choose a later one.'],
  ['booking_beyond_horizon', 'This time is too far ahead to be booked yet. Please choose an earlier one.'],
  ['outside_availability', 'This time is not within the hours open for booking. Please choose another time.'],
  ['appointment_limit_reached', 'You have as many upcoming appointments as the calendar allows. Cancel one to book another.'],
  ['user_not_found', 'This user no longer exists.'],
  ['target_not_user', 'An appointment can be booked for a User only, not for an Administrator.'],
  ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
  ['appointment_not_found', 'This appointment cannot be found.'],
  ['appointment_not_active', 'This appointment has already been cancelled, or it has ended.'],
  ['cancellation_notice_too_short', 'It is too late to cancel this appointment.'],
  // The login (docs/FRONTEND_SERVICES.md section 4.3). A wrong password and an unknown user are
  // one reason, so that the sentence does not say which usernames exist.
  ['invalid_credentials', 'The username or the password is not correct.'],
  ['too_many_attempts', 'Too many attempts. Please wait a few minutes and try again.'],
  ['password_reset_required', 'Your password must be reset before you can sign in. Please ask the Administrator.'],
  ['challenge', 'This account needs a sign-in step that this page does not offer. Please ask the Administrator.'],
  ['no_role', 'Your account has no role yet, so it cannot use the calendar. Please ask the Administrator.'],
]);

// What was being attempted when a call failed, where the same reason needs other words for it.
export type Attempt = 'change';
// A change is refused with the cancellation's reason when its appointment is too close to be
// moved by a User (docs/SHARED_CALENDAR_SPEC.md section 8.4): nothing was being cancelled.
const AFTER_A_CHANGE = new Map<string, string>([['cancellation_notice_too_short', 'It is too late to change this appointment.']]);

// A failure's `reason` as a sentence; a reason without a sentence of its own gets the general
// one. `attempt` says what was attempted, for the reasons whose sentence depends on it.
export function failureText(reason: string, attempt?: Attempt): string {
  return (attempt === 'change' ? AFTER_A_CHANGE.get(reason) : undefined) ?? PLAIN_WORDS.get(reason) ?? GENERAL;
}
