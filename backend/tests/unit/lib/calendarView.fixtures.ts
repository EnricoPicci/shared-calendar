import { readFileSync } from 'node:fs';
import type { Appointment } from '@shared-calendar/shared';
import type { CalendarViewInput, ViewAppointment } from '../../../src/lib/calendarRules';

// The example of docs/SHARED_CALENDAR_SPEC.md section 11.6, shared by the view's tests (pure and
// handler): Monday 2026-11-16, Europe/Rome, now 2026-11-10T09:00Z, default settings.

export const ZONE = 'Europe/Rome';
export const NOW = '2026-11-10T09:00:00.000Z';
export const STUDIO = '01M6DMBE008N3QKX5R2D7W9VT4';
export const POOL = '01M6DMMJZ04FZ6M1H8QJ0C3BNA';
export const ALICE_APPT = '01M70NR5E0Q7R2C9T5XH3KD8MV';
export const BOB_APPT = '01M70N1Q2R3S4T5V6W7X8Y9Z0A';
export const P_STUDIO = '01M6DN0000000000000000PS01';
export const P_POOL = '01M6DN0000000000000000PP01';
export const DEFAULTS = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56 };

export const TYPES = [
  { typeId: STUDIO, name: 'Studio' },
  { typeId: POOL, name: 'Swimming Pool' },
];
export const PATTERNS = [
  { patternId: P_STUDIO, weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null },
  { patternId: P_POOL, weekday: 1, start: '14:00', end: '18:00', typeId: POOL, validFrom: '2026-11-01', validUntil: null },
];

const ALICE = { username: 'alice', role: 'user' } as const;
const BOB = { username: 'bob', role: 'user' } as const;

/** A booked appointment as calendarDb gives it; `more` overrides any response field. */
export function appt(
  userId: string,
  appointmentId: string,
  start: string,
  end: string,
  more: Partial<Omit<Appointment, 'cancellableUntil'>> = {},
): ViewAppointment {
  const by = userId === 'sub-alice' ? ALICE : BOB;
  return {
    userId,
    appointment: {
      appointmentId,
      username: by.username,
      start,
      end,
      date: start.slice(0, 10),
      typeId: STUDIO,
      typeName: 'Studio',
      note: null,
      status: 'booked',
      createdAt: '2026-11-09T17:30:00.000Z',
      createdBy: by,
      updatedAt: '2026-11-09T17:30:00.000Z',
      updatedBy: by,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      replaces: null,
      replacedBy: null,
      ...more,
    },
  };
}

/** alice's 11:00–12:00 local (her own) and bob's 09:00–10:00 local (busy for alice). */
export const ALICE_11 = appt('sub-alice', ALICE_APPT, '2026-11-16T10:00:00.000Z', '2026-11-16T11:00:00.000Z', { note: 'First lesson' });
export const BOB_09 = appt('sub-bob', BOB_APPT, '2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z', { note: 'bob secret note' });

/** The example's input: alice's view of 2026-11-16. */
export const EXAMPLE: CalendarViewInput = {
  from: '2026-11-16',
  to: '2026-11-16',
  now: NOW,
  zone: ZONE,
  role: 'user',
  callerSub: 'sub-alice',
  settings: DEFAULTS,
  types: TYPES,
  patterns: PATTERNS,
  overrides: [],
  oneOffs: [],
  appointments: [BOB_09, ALICE_11],
};

/**
 * The JSON of the example of docs/SHARED_CALENDAR_SPEC.md section 11.6, compacted, read from the
 * spec itself so the two cannot drift.
 */
export function specExample(): string {
  const spec = readFileSync(new URL('../../../../docs/SHARED_CALENDAR_SPEC.md', import.meta.url), 'utf8');
  const at = spec.indexOf('Example (User `alice`, one day');
  const open = spec.indexOf('```json\n', at) + '```json\n'.length;
  const close = spec.indexOf('\n```', open);
  return JSON.stringify(JSON.parse(spec.slice(open, close)));
}
