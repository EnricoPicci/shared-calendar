// Spec section 9 (R-SET-01): the settings that apply until the Administrator first saves them.
// `timeZone` is not here: it is the deployment parameter CalendarTimeZone (R-TIME-01).
export const DEFAULT_TIME_ZONE = 'Europe/Rome';

export const DEFAULT_SETTINGS = {
  cancellationNoticeHours: 24,
  minBookingNoticeHours: 0,
  bookingHorizonDays: 56,
  maxFutureAppointmentsPerUser: null,
} as const;

// Spec assumption A5 (count limits), section 6.1 (type name) and R-BOOK-11 (note).
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

// Spec section 9: the range of each editable setting, inclusive; all are integers.
// `maxFutureAppointmentsPerUser` may also be null (unlimited). UpdateSettingsBody reads these.
export const SETTINGS_RANGES = {
  cancellationNoticeHours: { min: 0, max: 720 },
  minBookingNoticeHours: { min: 0, max: 720 },
  bookingHorizonDays: { min: 1, max: 365 },
  maxFutureAppointmentsPerUser: { min: 1, max: 100 },
} as const;
