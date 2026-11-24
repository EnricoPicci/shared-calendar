import type { Role } from '../roles';
import type { OneOffWindowBody, PatternBody, WindowBody } from './schemas';

// The calendar's response types (docs/SHARED_CALENDAR_SPEC.md sections 11.5 and 11.6) and its event
// types (docs/SHARED_CALENDAR_SPEC.md section 15). Types only: the bodies they extend are inferred
// from the schemas in schemas.ts. Dates are local `YYYY-MM-DD`; every other time is an instant in
// the toISOString form.

/** Who did something: the caller's username and role at that moment. */
export type Actor = { username: string; role: Role };

// ── Settings and availability ───────────────────────────────────────────────────────────────

/**
 * 200 of GET and PUT /calendar/settings. Until the first save: the defaults, `updatedAt: null`
 * (docs/SHARED_CALENDAR_SPEC.md R-SET-01).
 */
export type CalendarSettings = {
  timeZone: string; // the deployment parameter CalendarTimeZone, read-only
  cancellationNoticeHours: number;
  minBookingNoticeHours: number;
  bookingHorizonDays: number;
  maxFutureAppointmentsPerUser: number | null;
  updatedAt: string | null;
  updatedBy: Actor | null;
};

/**
 * A type (docs/SHARED_CALENDAR_SPEC.md section 11.5). `capacity` is how many people it holds at the
 * same time, 1 to 100 (docs/SHARED_CALENDAR_SPEC.md decision D24); a type stored before the
 * capacity existed answers 1 (docs/SHARED_CALENDAR_SPEC.md section 13.2).
 */
export type AvailabilityType = { typeId: string; name: string; capacity: number; createdAt: string; updatedAt: string };
/** 200 of GET /calendar/types, sorted by name. */
export type ListTypesResponse = { types: AvailabilityType[] };

export type WeeklyPattern = PatternBody & { patternId: string; createdAt: string; updatedAt: string };
/** 200 of GET /calendar/patterns, sorted by weekday, then start. */
export type ListPatternsResponse = { patterns: WeeklyPattern[] };

export type DateOverride = { date: string; windows: WindowBody[]; updatedAt: string };

export type OneOffWindow = OneOffWindowBody & { windowId: string; createdAt: string };

// ── Appointments ────────────────────────────────────────────────────────────────────────────

export type AppointmentStatus = 'booked' | 'cancelled';
/**
 * Why an appointment was cancelled: an explicit cancel, replaced by a change, or its User deleted
 * (docs/SHARED_CALENDAR_SPEC.md decision D19).
 */
export type CancelReason = 'cancelled' | 'changed' | 'user_deleted';

export type Appointment = {
  appointmentId: string;
  username: string;
  start: string;
  end: string;
  date: string; // the local date of `start`
  typeId: string;
  typeName: string; // the type's current name, or the snapshot taken at booking if it was deleted
  note: string | null;
  status: AppointmentStatus;
  createdAt: string;
  createdBy: Actor;
  updatedAt: string;
  updatedBy: Actor;
  cancelledAt: string | null;
  cancelledBy: Actor | null;
  cancelReason: CancelReason | null;
  replaces: string | null;
  replacedBy: string | null;
  // User callers only (rules.ts cancellableUntil); null for the Administrator.
  cancellableUntil: string | null;
};

/** 200 of GET /calendar/appointments, sorted by start. */
export type ListAppointmentsResponse = { appointments: Appointment[] };
/** 201 of POST /calendar/appointments/{appointmentId}/change. */
export type ChangeAppointmentResponse = { cancelled: Appointment; booked: Appointment };

// ── The calendar view (GET /calendar) ───────────────────────────────────────────────────────

/** Where a defined window comes from. `sourceId` is the patternId, the override's date, or the windowId. */
export type WindowSource = 'pattern' | 'override' | 'one_off';

export type CalendarWindow = {
  start: string;
  end: string;
  typeId: string;
  typeName: string;
  source?: WindowSource; // admin only
  sourceId?: string; // admin only
};
/**
 * A slot of the view (docs/SHARED_CALENDAR_SPEC.md section 11.6): its times, its type, the type's
 * capacity, and its places left, the capacity minus the people in it, never below 0
 * (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02). `placesLeft: 0` is a full slot, which only the
 * Administrator gets (docs/SHARED_CALENDAR_SPEC.md decision D30).
 */
export type Slot = { start: string; end: string; typeId: string; capacity: number; placesLeft: number };
export type Interval = { start: string; end: string };

export type CalendarDay = {
  date: string;
  weekday: number;
  // The defined windows (docs/SHARED_CALENDAR_SPEC.md section 6.5): sorted instants, not merged.
  windows: CalendarWindow[];
  // For a User, the slots with a place left that the User may book (docs/SHARED_CALENDAR_SPEC.md
  // R-SLOT-03); for the Administrator, every future slot, the full ones included with
  // `placesLeft: 0` (docs/SHARED_CALENDAR_SPEC.md R-SLOT-04).
  slots: Slot[];
  // For a User, the times that are full, no names, the User's own appointments taken out
  // (docs/SHARED_CALENDAR_SPEC.md R-SLOT-06); [] for the Administrator.
  busy: Interval[];
  hasOverride?: boolean; // admin only
};

export type CalendarView = {
  timeZone: string;
  from: string;
  to: string;
  generatedAt: string; // the "now" of the request: the slots are valid as of this instant
  days: CalendarDay[]; // one per date from..to, in order
  appointments: Appointment[]; // active appointments starting in the range: all (admin) or own (user)
};

// ── Events ──────────────────────────────────────────────────────────────────────────────────

/** The `type` of an event item, written in the same transaction as the change it records. */
export type CalendarEventType =
  | 'appointment.booked'
  | 'appointment.cancelled'
  | 'appointment.changed'
  | 'appointment.note_updated';
