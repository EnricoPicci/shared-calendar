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

// How many people an availability type holds at the same time, inclusive, and the capacity of a
// type created without one (docs/SHARED_CALENDAR_SPEC.md decision D24, R-TYPE-05). TypeBody reads
// the range; the default is applied by the handler, since an edit without a capacity keeps the
// stored one (docs/SHARED_CALENDAR_SPEC.md section 11.4).
export const TYPE_CAPACITY = { min: 1, max: 100, default: 1 } as const;

// The step of the Administrator's times, in minutes of the local clock: a window and a custom
// appointment start and end on it, and a custom appointment lasts at least one step
// (docs/SHARED_CALENDAR_SPEC.md decision D32, R-BOOK-02). It divides the hour, so every whole
// hour, a User's start, lies on it. LocalTime, isOnTimeStep, the server's check of a booking's
// times and the page's lists of times all read it: the step is written here and nowhere else.
export const TIME_STEP_MINUTES = 5;
