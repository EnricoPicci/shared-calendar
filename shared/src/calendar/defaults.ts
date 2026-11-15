// The settings that apply until the Administrator first saves them (docs/SHARED_CALENDAR_SPEC.md
// section 9, R-SET-01). `timeZone` is not among them: it is the deployment parameter
// CalendarTimeZone (docs/SHARED_CALENDAR_SPEC.md R-TIME-01).
export const DEFAULT_TIME_ZONE = 'Europe/Rome';

export const DEFAULT_SETTINGS = {
  cancellationNoticeHours: 24,
  minBookingNoticeHours: 0,
  bookingHorizonDays: 56,
  maxFutureAppointmentsPerUser: null,
} as const;

// The count limits of docs/SHARED_CALENDAR_SPEC.md assumption A5, the type name length of section
// 6.1 and the note length of R-BOOK-11.
export const CALENDAR_LIMITS = {
  types: 20,
  patterns: 50,
  overrideWindowsPerDate: 10,
  oneOffWindowsPerDate: 10,
  calendarViewDays: 31,
  appointmentListDays: 92,
  typeNameLength: 40,
  noteLength: 500,
} as const;

// The range of each editable setting, inclusive; all are integers (docs/SHARED_CALENDAR_SPEC.md
// section 9). `maxFutureAppointmentsPerUser` may also be null (unlimited). UpdateSettingsBody reads
// these.
export const SETTINGS_RANGES = {
  cancellationNoticeHours: { min: 0, max: 720 },
  minBookingNoticeHours: { min: 0, max: 720 },
  bookingHorizonDays: { min: 1, max: 365 },
  maxFutureAppointmentsPerUser: { min: 1, max: 100 },
} as const;
