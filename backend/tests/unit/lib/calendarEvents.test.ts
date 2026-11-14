import { appointmentEvent, EVENT_SCHEMA_VERSION, type AppointmentSnapshot } from '../../../src/lib/calendarEvents';

// Pure: the ids and the instant are passed in (spec 15.2).

const NOW = '2026-11-10T09:00:00.000Z';
const EVENT_ID = '01M70NR5E0Q7R2C9T5XH3KD8EV';
const ADMIN = { username: 'admin', role: 'admin' } as const;

const stored: AppointmentSnapshot = {
  appointmentId: '01M70NR5E0Q7R2C9T5XH3KD8MV',
  userId: 'c0a8-sub-of-alice',
  username: 'alice',
  start: '2026-11-16T08:00:00.000Z',
  end: '2026-11-16T09:00:00.000Z',
  date: '2026-11-16',
  typeId: '01M6DMBE008N3QKX5R2D7W9VT4',
  typeNameAtBooking: 'Studio',
  note: 'First lesson',
  status: 'booked',
  createdAt: NOW,
  createdBy: ADMIN,
  updatedAt: NOW,
  updatedBy: ADMIN,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  replaces: null,
  replacedBy: null,
  version: 1,
};

describe('appointmentEvent (spec 15.2)', () => {
  it('builds the exact appointment.booked item', () => {
    expect(appointmentEvent({ type: 'appointment.booked', eventId: EVENT_ID, occurredAt: NOW, actor: ADMIN, appointment: stored })).toEqual({
      PK: 'EVENT',
      SK: `${NOW}#${EVENT_ID}`,
      eventId: EVENT_ID,
      type: 'appointment.booked',
      occurredAt: NOW,
      actor: { username: 'admin', role: 'admin' },
      recipients: { userId: 'c0a8-sub-of-alice', username: 'alice', administrator: true },
      appointment: stored,
      schemaVersion: 1,
    });
    expect(EVENT_SCHEMA_VERSION).toBe(1);
  });

  it('has no previous attribute for a booking (it is for appointment.changed only)', () => {
    const item = appointmentEvent({ type: 'appointment.booked', eventId: EVENT_ID, occurredAt: NOW, actor: ADMIN, appointment: stored });
    expect(item).not.toHaveProperty('previous');
  });

  it('copies the appointment field by field: nothing stored beside it (PK, SK) reaches the snapshot', () => {
    const withKeys = { ...stored, PK: 'APPT', SK: `${stored.start}#${stored.appointmentId}`, cancelledBy: { ...ADMIN, extra: 1 } } as AppointmentSnapshot;
    const { appointment } = appointmentEvent({ type: 'appointment.booked', eventId: EVENT_ID, occurredAt: NOW, actor: ADMIN, appointment: withKeys });
    expect(Object.keys(appointment)).toEqual(Object.keys(stored));
    expect(appointment.cancelledBy).toEqual(ADMIN);
  });

  it('carries the note only inside the appointment snapshot', () => {
    const item = appointmentEvent({ type: 'appointment.booked', eventId: EVENT_ID, occurredAt: NOW, actor: ADMIN, appointment: stored });
    const { appointment, ...rest } = item;
    expect(appointment.note).toBe('First lesson');
    expect(JSON.stringify(rest)).not.toContain('First lesson');
  });

  it('copies the actor field by field', () => {
    const actor = { username: 'alice', role: 'user', token: 'x' } as unknown as typeof ADMIN;
    expect(appointmentEvent({ type: 'appointment.booked', eventId: EVENT_ID, occurredAt: NOW, actor, appointment: stored }).actor).toEqual({
      username: 'alice',
      role: 'user',
    });
  });
});
