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
