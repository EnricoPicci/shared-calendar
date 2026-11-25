import { z } from 'zod';
import { Username } from '../username';
import { CALENDAR_LIMITS, SETTINGS_RANGES, TIME_STEP_MINUTES, TYPE_CAPACITY } from './defaults';
import { addDays } from './time';

// The primitive schemas of the calendar contract (docs/SHARED_CALENDAR_SPEC.md R-TIME-02,
// section 6.1, R-BOOK-11, sections 11.2 and 11.4). Lengths are JavaScript string lengths (UTF-16
// code units, what a textarea's maxlength counts): most emoji count as two. Checked with s.length,
// not zod's .min/.max, which count code points. Below them come the request bodies
// (docs/SHARED_CALENDAR_SPEC.md section 11.4) and the path and query parameters
// (docs/SHARED_CALENDAR_SPEC.md section 11.2).

// Whether y-m-d is a real date of the (proleptic) Gregorian calendar.
function isRealDate(y: number, m: number, d: number): boolean {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = m === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
  return m >= 1 && m <= 12 && d >= 1 && d <= days;
}

/** A local date `YYYY-MM-DD` that exists in the calendar (2028-02-29 yes, 2027-02-29 no). */
export const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((s) => isRealDate(Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))), 'not a real date');
export type LocalDate = z.infer<typeof LocalDate>;

// The minutes of an hour that lie on the step: "00", "05" … "55".
const STEP_MINUTES = Array.from({ length: 60 / TIME_STEP_MINUTES }, (_, i) => String(i * TIME_STEP_MINUTES).padStart(2, '0'));

/**
 * A local time `HH:mm` on the grid of TIME_STEP_MINUTES, `00:00`–`23:55`: a start
 * (docs/SHARED_CALENDAR_SPEC.md decision D32). A regular expression, so that a schema built on it
 * can be given to a reader as a pattern.
 */
export const LocalTime = z
  .string()
  .regex(new RegExp(`^([01]\\d|2[0-3]):(${STEP_MINUTES.join('|')})$`), `expected HH:mm on the ${TIME_STEP_MINUTES}-minute grid`);
export type LocalTime = z.infer<typeof LocalTime>;

/**
 * A local time that may end a window: the grid of LocalTime, plus `24:00` (midnight at the end of
 * the date).
 */
export const LocalEndTime = z.union([LocalTime, z.literal('24:00')]);
export type LocalEndTime = z.infer<typeof LocalEndTime>;

/** An ISO weekday: 1 = Monday … 7 = Sunday. */
export const Weekday = z.number().int().min(1).max(7);
export type Weekday = z.infer<typeof Weekday>;

/**
 * An instant in a request (docs/SHARED_CALENDAR_SPEC.md section 11.4): exactly the toISOString
 * form, seconds and milliseconds zero, a real moment. Server-written timestamps (createdAt, …) keep
 * their seconds and are not checked here.
 */
export const Instant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/, 'expected YYYY-MM-DDTHH:mm:00.000Z')
  .refine((s) => {
    const ms = Date.parse(s);
    return !Number.isNaN(ms) && new Date(ms).toISOString() === s;
  }, 'not a real instant');
export type Instant = z.infer<typeof Instant>;

/** A ULID (docs/SHARED_CALENDAR_SPEC.md section 11.2): 26 characters of Crockford base32. */
export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'expected a ULID');
export type Ulid = z.infer<typeof Ulid>;

/**
 * An appointment note (docs/SHARED_CALENDAR_SPEC.md R-BOOK-11): trimmed; empty → null; at most 500
 * characters; no control characters except line feed. Accepts null (no note).
 */
export const Note = z
  .string()
  .trim()
  .refine((s) => s.length <= CALENDAR_LIMITS.noteLength, `at most ${CALENDAR_LIMITS.noteLength} characters`)
  .refine((s) => !/[^\P{Cc}\n]/u.test(s), 'no control characters except line feed')
  .transform((s) => (s === '' ? null : s))
  .nullable();
export type Note = z.infer<typeof Note>;

/**
 * An availability type's name (docs/SHARED_CALENDAR_SPEC.md section 6.1): 1–40 characters after
 * trimming, no control characters.
 */
export const TypeName = z
  .string()
  .trim()
  .refine((s) => s.length >= 1 && s.length <= CALENDAR_LIMITS.typeNameLength, `1 to ${CALENDAR_LIMITS.typeNameLength} characters`)
  .refine((s) => !/\p{Cc}/u.test(s), 'no control characters');
export type TypeName = z.infer<typeof TypeName>;

// ── Request bodies, path and query parameters ───────────────────────────────────────────────
//
// The schemas of docs/SHARED_CALENDAR_SPEC.md sections 11.2 and 11.4. Every object is .strict(): an
// unknown field is a 400 (docs/SHARED_CALENDAR_SPEC.md section 11). A schema decides only what is
// malformed by itself. It knows no time zone, no "now", no settings and no stored data, so these
// are not here: the Administrator's step and the whole-hour grid of an instant and which one
// applies (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02, checked per role in the handler with
// isOnTimeStep / isWholeLocalHour from rules.ts); overlap among an override's windows (409 availability_overlap);
// date_in_past; an unknown typeId; count limits.
//
// The cross-field rules run only on an object whose fields are valid (`when`): a malformed field
// is reported once, by its own schema, without a second message about the order.
// The rejection is reported on `field`.
function onField(field: string, message: string) {
  return { message, path: [field], when: (payload: { issues: readonly unknown[] }) => payload.issues.length === 0 };
}

// Local times `HH:mm` (`24:00` sorts last) and dates `YYYY-MM-DD` compare as strings, and so do
// instants in the toISOString form Instant enforces.
const endAfterStart = (w: { start: string; end?: string }) => w.end === undefined || w.start < w.end;
const END_AFTER_START = 'end must be after start';

// An integer setting in its range (docs/SHARED_CALENDAR_SPEC.md section 9).
function setting(range: { min: number; max: number }) {
  return z.number().int().min(range.min).max(range.max);
}

/**
 * PUT /calendar/settings: the four editable settings, all required
 * (docs/SHARED_CALENDAR_SPEC.md R-SET-02).
 */
export const UpdateSettingsBody = z
  .object({
    cancellationNoticeHours: setting(SETTINGS_RANGES.cancellationNoticeHours),
    minBookingNoticeHours: setting(SETTINGS_RANGES.minBookingNoticeHours),
    bookingHorizonDays: setting(SETTINGS_RANGES.bookingHorizonDays),
    maxFutureAppointmentsPerUser: setting(SETTINGS_RANGES.maxFutureAppointmentsPerUser).nullable(),
  })
  .strict();
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;

/**
 * POST /calendar/types, PUT /calendar/types/{typeId}: the name, and the capacity, an integer 1–100
 * (docs/SHARED_CALENDAR_SPEC.md R-TYPE-05). The capacity is optional and has no default here:
 * absent means 1 at creation and "keep the stored capacity" at an edit
 * (docs/SHARED_CALENDAR_SPEC.md section 11.4), which only the handler can tell apart.
 */
export const TypeBody = z
  .object({ name: TypeName, capacity: z.number().int().min(TYPE_CAPACITY.min).max(TYPE_CAPACITY.max).optional() })
  .strict();
export type TypeBody = z.infer<typeof TypeBody>;

const windowFields = { start: LocalTime, end: LocalEndTime, typeId: Ulid };

/** One window of a date: local times, `start < end`, `end` may be `24:00`. */
export const WindowBody = z.object(windowFields).strict().refine(endAfterStart, onField('end', END_AFTER_START));
export type WindowBody = z.infer<typeof WindowBody>;

/**
 * POST /calendar/patterns, PUT /calendar/patterns/{patternId}: one window per week
 * (docs/SHARED_CALENDAR_SPEC.md R-PAT-02).
 */
export const PatternBody = z
  .object({ ...windowFields, weekday: Weekday, validFrom: LocalDate, validUntil: LocalDate.nullable() })
  .strict()
  .refine(endAfterStart, onField('end', END_AFTER_START))
  .refine((p) => p.validUntil === null || p.validFrom <= p.validUntil, onField('validUntil', 'validUntil must not be before validFrom'));
export type PatternBody = z.infer<typeof PatternBody>;

/**
 * PUT /calendar/overrides/{date}: 0–10 windows; an empty list means "no pattern availability"
 * (docs/SHARED_CALENDAR_SPEC.md R-OVR-01).
 */
export const OverrideBody = z
  .object({ windows: z.array(WindowBody).max(CALENDAR_LIMITS.overrideWindowsPerDate) })
  .strict();
export type OverrideBody = z.infer<typeof OverrideBody>;

/** POST /calendar/windows: a one-off window on a date. */
export const OneOffWindowBody = z
  .object({ ...windowFields, date: LocalDate })
  .strict()
  .refine(endAfterStart, onField('end', END_AFTER_START));
export type OneOffWindowBody = z.infer<typeof OneOffWindowBody>;

// Instants; `end` absent means start + 60 minutes. `note` absent and `note: null` differ in a
// change: absent keeps the old note, null clears it (docs/SHARED_CALENDAR_SPEC.md R-CHG-03).
// `overbook: true` asks to book over the capacity; absent means false. Only the Administrator may
// send true, which the handler checks, not the schema (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13).
const appointmentFields = { start: Instant, end: Instant.optional(), note: Note.optional(), overbook: z.boolean().optional() };

/** POST /calendar/appointments. Whether `username` and a custom `end` are allowed depends on the role. */
export const BookBody = z
  .object({ ...appointmentFields, username: Username.optional() })
  .strict()
  .refine(endAfterStart, onField('end', END_AFTER_START));
export type BookBody = z.infer<typeof BookBody>;

/**
 * POST /calendar/appointments/{appointmentId}/change: the User stays the same
 * (docs/SHARED_CALENDAR_SPEC.md section 8.4).
 */
export const ChangeBody = z.object(appointmentFields).strict().refine(endAfterStart, onField('end', END_AFTER_START));
export type ChangeBody = z.infer<typeof ChangeBody>;

/** PATCH /calendar/appointments/{appointmentId}: the note, or null to clear it. */
export const NoteBody = z.object({ note: Note }).strict();
export type NoteBody = z.infer<typeof NoteBody>;

// Path parameters: objects, as UsernameParam is, so that a rejection names the field.

export const TypeIdParam = z.object({ typeId: Ulid }).strict();
export type TypeIdParam = z.infer<typeof TypeIdParam>;
export const PatternIdParam = z.object({ patternId: Ulid }).strict();
export type PatternIdParam = z.infer<typeof PatternIdParam>;
export const WindowIdParam = z.object({ windowId: Ulid }).strict();
export type WindowIdParam = z.infer<typeof WindowIdParam>;
export const AppointmentIdParam = z.object({ appointmentId: Ulid }).strict();
export type AppointmentIdParam = z.infer<typeof AppointmentIdParam>;
export const DateParam = z.object({ date: LocalDate }).strict();
export type DateParam = z.infer<typeof DateParam>;

// Query parameters arrive as strings. A range `from`..`to` is inclusive and counted in calendar
// days (addDays), never in milliseconds: 31 days is from + 30.
type Range = { from?: string; to?: string };
const fromNotAfterTo = (q: Range) => q.from === undefined || q.to === undefined || q.from <= q.to;
const FROM_NOT_AFTER_TO = 'from must not be after to';
function withinDays(days: number) {
  return (q: Range) => q.from === undefined || q.to === undefined || q.to <= addDays(q.from, days - 1);
}
function tooLong(days: number) {
  return `the range spans more than ${days} days`;
}

/** GET /calendar?from&to: both required, at most 31 days. */
export const CalendarQuery = z
  .object({ from: LocalDate, to: LocalDate })
  .strict()
  .refine(fromNotAfterTo, onField('to', FROM_NOT_AFTER_TO))
  .refine(withinDays(CALENDAR_LIMITS.calendarViewDays), onField('to', tooLong(CALENDAR_LIMITS.calendarViewDays)));
export type CalendarQuery = z.infer<typeof CalendarQuery>;

/**
 * GET /calendar/appointments: either `from` and `to` (at most 92 days) or `upcoming=true`, not
 * both and not neither. `username` is the shared Username; whether the caller may pass it is a
 * role check (403), not a schema rule. `status` defaults to `booked`.
 */
export const AppointmentsQuery = z
  .object({
    from: LocalDate.optional(),
    to: LocalDate.optional(),
    upcoming: z.literal('true').optional(),
    username: Username.optional(),
    status: z.enum(['booked', 'cancelled', 'all']).default('booked'),
  })
  .strict()
  .refine(
    (q) => (q.upcoming === undefined ? q.from !== undefined && q.to !== undefined : q.from === undefined && q.to === undefined),
    onField('upcoming', 'expected either from and to, or upcoming=true'),
  )
  .refine(fromNotAfterTo, onField('to', FROM_NOT_AFTER_TO))
  .refine(withinDays(CALENDAR_LIMITS.appointmentListDays), onField('to', tooLong(CALENDAR_LIMITS.appointmentListDays)));
export type AppointmentsQuery = z.infer<typeof AppointmentsQuery>;
