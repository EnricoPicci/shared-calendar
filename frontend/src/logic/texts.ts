import { ASSISTANT_LIMITS, CALENDAR_LIMITS, localDateOf, localTimeOf, MAIL_LIMITS, maskAddress, PASSWORD_POLICY, PASSWORD_SYMBOLS, toInstant, type DateFormats, type Role } from '@shared-calendar/shared';
import { FAILURE_REASONS, type FailureReason, type FailureTexts } from '../texts/texts';
import type { NewPasswordProblem } from '../services/change-password.types';

// The texts that depend on data (docs/FRONTEND_ARCHITECTURE.md section 5 and section 12.4): a
// time, a range, a date with a time, a UTC offset, and a failure in plain words. Pure functions.
// A time is read in the time zone given, through the helpers of shared/; the words come from the
// page texts of the language in use (frontend/src/texts/texts.ts), the dates' words from shared/
// (docs/MULTILANGUAGE_ARCHITECTURE.md decision L10). The browser's own zone and language play no
// part.

const MINUTE_MS = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

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
export function dateTimeText(dates: DateFormats, instant: string, zone: string): string {
  const date = localDateOf(instant, zone);
  return `${dates.shortDate(date)}, ${timeText(instant, zone, offsetChangesOn(date, zone))}`;
}

// What was being attempted when a call failed, where the same reason needs other words for it.
export type Attempt = 'change' | 'type' | 'pattern' | 'window' | 'patterns-back' | 'message' | 'mail';

// The sentence of a reason for what was being attempted, where it has one of its own. The limits
// are the numbers of shared/.
function afterAttempt(failures: FailureTexts, reason: string, attempt: Attempt): string | undefined {
  switch (attempt) {
    case 'change':
      return reason === 'cancellation_notice_too_short' || reason === 'appointment_limit_reached' ? failures.change[reason] : undefined;
    case 'type':
      return reason === 'limit_reached' ? failures.typeLimit(CALENDAR_LIMITS.types) : undefined;
    case 'pattern':
      return reason === 'limit_reached' ? failures.patternLimit(CALENDAR_LIMITS.patterns) : undefined;
    case 'window':
      return reason === 'limit_reached' ? failures.windowLimit(CALENDAR_LIMITS.oneOffWindowsPerDate) : undefined;
    case 'patterns-back':
      return reason === 'availability_overlap' ? failures.patternsBackOverlap : undefined;
    case 'message':
      return reason === 'invalid_request' ? failures.messageRefused(ASSISTANT_LIMITS.messageLength) : undefined;
    case 'mail':
      return reason === 'invalid_request' ? failures.mailRefused(MAIL_LIMITS.rangeDays) : undefined;
  }
}

const isFailureReason = (reason: string): reason is FailureReason => (FAILURE_REASONS as readonly string[]).includes(reason);

// A failure's `reason` as a sentence, never the service's own `message`, which is written for a
// developer; a reason without a sentence of its own gets the general one. `attempt` says what was
// attempted and `role` who attempted, for the reasons whose sentence depends on them; what was
// attempted comes first.
export function failureText(failures: FailureTexts, reason: string, attempt?: Attempt, role?: Role): string {
  const after = attempt === undefined ? undefined : afterAttempt(failures, reason, attempt);
  if (after !== undefined) return after;
  if (role === 'admin' && reason === 'user_busy') return failures.userBusyForAdmin;
  return isFailureReason(reason) ? failures.reasons[reason] : failures.general;
}

// The change of one's own password (docs/FRONTEND_ARCHITECTURE.md section 5.1): what a new
// password still misses, one sentence per name of the shared rule (shared/src/password.ts) and
// for being the current password again, with the rule's own numbers and its 32 symbols.
export const PASSWORD_PROBLEM_TEXT: Record<NewPasswordProblem, string> = {
  too_short: `At least ${PASSWORD_POLICY.minimumLength} characters.`,
  too_long: `At most ${PASSWORD_POLICY.maximumLength} characters.`,
  no_uppercase: 'An upper-case letter, A to Z.',
  no_lowercase: 'A lower-case letter, a to z.',
  no_digit: 'A digit, 0 to 9.',
  no_symbol: `One of these symbols: ${[...PASSWORD_SYMBOLS].join(' ')}`,
  blank: 'No space, and no other blank character.',
  same_as_current: 'Not the same as the current password.',
};

// The other words of the password screen: the field of the current password while it is empty,
// the repeated new password while it is empty or differs, and what the login says after a change.
export const PASSWORD_TEXTS = {
  currentEmpty: 'Type the password you use now.',
  againEmpty: 'Type the new password once more.',
  differ: 'The two new passwords are not the same.',
  changed: 'Password changed.',
} as const;

// The words of the week's "E-mail…" dialog (docs/FRONTEND_ARCHITECTURE.md section 5.1): what the
// mail holds, which is the role's (docs/EMAIL_ARCHITECTURE.md section 9.1), and where it goes once
// asked for, the person's own address masked (docs/EMAIL_ARCHITECTURE.md section 12.4), or in
// general words when it could not be read.
export const MAIL_TEXTS = {
  what: {
    admin: 'The whole calendar between the two dates, as an Excel file, to your own e-mail address.',
    user: 'Your appointments between the two dates, as an Excel file, to your own e-mail address.',
  },
  sent: (address: string | null) => `On its way to ${address === null ? 'your e-mail address' : maskAddress(address)}`,
} as const satisfies { what: Record<Role, string>; sent: (address: string | null) => string };

// The words of the settings' "Daily e-mail" (docs/FRONTEND_ARCHITECTURE.md section 5.1): an hour
// as the field shows it, "07:00"; under the field, what it takes, with the calendar's time zone
// when it is known (docs/EMAIL_ARCHITECTURE.md section 6.2: the hour is the calendar's); and why
// a typed hour is refused.
export const DAILY_MAIL_TEXTS = {
  hour: (hour: number) => `${pad(hour)}:00`,
  range: (timeZone: string | null) => `A whole hour, from 00:00 to 23:00, in the calendar's time zone${timeZone === null ? '' : `, ${timeZone}`}.`,
  refusal: 'The hour must be a whole hour from 00:00 to 23:00, such as 07:00.',
} as const satisfies { hour: (hour: number) => string; range: (timeZone: string | null) => string; refusal: string };
