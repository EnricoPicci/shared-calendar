import { z } from 'zod';
import { CALENDAR_LIMITS } from './defaults';

// The primitive schemas of the calendar contract (spec R-TIME-02, 6.1, R-BOOK-11, 11.2, 11.4).
// Lengths are JavaScript string lengths (UTF-16 code units, what a textarea's maxlength counts):
// most emoji count as two. Checked with s.length, not zod's .min/.max, which count code points.
// The request bodies and queries built on them, and their cross-field rules, are in step 42.

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

/** A local time `HH:mm` on the 15-minute grid, `00:00`–`23:45`: a start. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'expected HH:mm on the 15-minute grid');
export type LocalTime = z.infer<typeof LocalTime>;

/** A local time that may end a window: the grid of LocalTime, plus `24:00` (midnight at the end of the date). */
export const LocalEndTime = z.union([LocalTime, z.literal('24:00')]);
export type LocalEndTime = z.infer<typeof LocalEndTime>;

/** An ISO weekday: 1 = Monday … 7 = Sunday. */
export const Weekday = z.number().int().min(1).max(7);
export type Weekday = z.infer<typeof Weekday>;

/**
 * An instant in a request (spec 11.4): exactly the toISOString form, seconds and milliseconds zero,
 * a real moment. Server-written timestamps (createdAt, …) keep their seconds and are not checked here.
 */
export const Instant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/, 'expected YYYY-MM-DDTHH:mm:00.000Z')
  .refine((s) => {
    const ms = Date.parse(s);
    return !Number.isNaN(ms) && new Date(ms).toISOString() === s;
  }, 'not a real instant');
export type Instant = z.infer<typeof Instant>;

/** A ULID (spec 11.2): 26 characters of Crockford base32. */
export const Ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'expected a ULID');
export type Ulid = z.infer<typeof Ulid>;

/**
 * An appointment note (R-BOOK-11): trimmed; empty → null; at most 500 characters; no control
 * characters except line feed. Accepts null (no note).
 */
export const Note = z
  .string()
  .trim()
  .refine((s) => s.length <= CALENDAR_LIMITS.noteLength, `at most ${CALENDAR_LIMITS.noteLength} characters`)
  .refine((s) => !/[^\P{Cc}\n]/u.test(s), 'no control characters except line feed')
  .transform((s) => (s === '' ? null : s))
  .nullable();
export type Note = z.infer<typeof Note>;

/** An availability type's name (spec 6.1): 1–40 characters after trimming, no control characters. */
export const TypeName = z
  .string()
  .trim()
  .refine((s) => s.length >= 1 && s.length <= CALENDAR_LIMITS.typeNameLength, `1 to ${CALENDAR_LIMITS.typeNameLength} characters`)
  .refine((s) => !/\p{Cc}/u.test(s), 'no control characters');
export type TypeName = z.infer<typeof TypeName>;
