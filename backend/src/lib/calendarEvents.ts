import type { Actor, AppointmentStatus, CalendarEventType, CancelReason } from '@shared-calendar/shared';

// The calendar's event items (docs/SHARED_CALENDAR_SPEC.md 15.2; attribute names in architecture
// 5.3), pure: the ids and the instant are passed in, nothing is read or written here. calendarDb
// puts the item in the same transaction as the change it records (the transactional outbox of
// section 15), so either both exist or neither does. Events are never updated or deleted.

/**
 * An appointment as stored (spec 8.1, v9 13.2): the `APPT` item's attributes without its keys, and
 * with `appointmentId`, which the item keeps only in its `SK`. This is the event's `appointment`
 * snapshot. `typeName` and `cancellableUntil` are not stored: they are worked out per response.
 */
export type AppointmentSnapshot = {
  appointmentId: string;
  userId: string;
  username: string;
  start: string;
  end: string;
  date: string;
  typeId: string;
  typeNameAtBooking: string;
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
  version: number;
};

/** The event types written so far; each later step adds its own (`appointment.changed` in step 50). */
export type WrittenEventType = Extract<CalendarEventType, 'appointment.booked' | 'appointment.cancelled' | 'appointment.note_updated'>;

export const EVENT_PK = 'EVENT';
export const EVENT_SCHEMA_VERSION = 1;

export type EventItem = {
  PK: typeof EVENT_PK;
  SK: string;
  eventId: string;
  type: WrittenEventType;
  occurredAt: string;
  actor: Actor;
  recipients: { userId: string; username: string; administrator: true };
  appointment: AppointmentSnapshot;
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
};

const actor = (a: Actor): Actor => ({ username: a.username, role: a.role });
const actorOrNull = (a: Actor | null): Actor | null => (a ? actor(a) : null);

// Field by field, so nothing stored beside the appointment (PK, SK) can reach the event.
function snapshot(a: AppointmentSnapshot): AppointmentSnapshot {
  return {
    appointmentId: a.appointmentId,
    userId: a.userId,
    username: a.username,
    start: a.start,
    end: a.end,
    date: a.date,
    typeId: a.typeId,
    typeNameAtBooking: a.typeNameAtBooking,
    note: a.note,
    status: a.status,
    createdAt: a.createdAt,
    createdBy: actor(a.createdBy),
    updatedAt: a.updatedAt,
    updatedBy: actor(a.updatedBy),
    cancelledAt: a.cancelledAt,
    cancelledBy: actorOrNull(a.cancelledBy),
    cancelReason: a.cancelReason,
    replaces: a.replaces,
    replacedBy: a.replacedBy,
    version: a.version,
  };
}

/**
 * The event item of one appointment change (15.2): `PK` `EVENT`, `SK` `<occurredAt>#<eventId>`.
 * `eventId` is a ULID the caller generates once per request (a lock retry writes the same event);
 * `occurredAt` is the request's "now". The recipients are the appointment's User and the
 * Administrator. The note appears only inside the `appointment` snapshot.
 */
export function appointmentEvent(input: {
  type: WrittenEventType;
  eventId: string;
  occurredAt: string;
  actor: Actor;
  appointment: AppointmentSnapshot;
}): EventItem {
  const { type, eventId, occurredAt, appointment } = input;
  return {
    PK: EVENT_PK,
    SK: `${occurredAt}#${eventId}`,
    eventId,
    type,
    occurredAt,
    actor: actor(input.actor),
    recipients: { userId: appointment.userId, username: appointment.username, administrator: true },
    appointment: snapshot(appointment),
    schemaVersion: EVENT_SCHEMA_VERSION,
  };
}
