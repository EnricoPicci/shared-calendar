import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  AC20_NOW,
  AC21_NOW,
  admin,
  APPT_ID,
  bodyOf,
  BOOKED_AT,
  claimsOf,
  cleanUp,
  END,
  eventAt,
  harness,
  lockBusy,
  NOTE,
  START,
  STUDIO,
  storeAppointment,
  storedItem,
} from './appointmentFixtures';

type Handler = typeof import('../../../src/handlers/cancelAppointment').handler;
let handler: Handler;

// Spec 8.3 v10, route 19; AC-20, AC-21, AC-30, AC-31 on the exact instants of 18.3.
const ROUTE = 'POST /calendar/appointments/{appointmentId}/cancel';
const { ddb, reset, logLines, transactions, output } = harness();
const alice = claimsOf('alice', ['user']);
const bob = claimsOf('bob', ['user']);

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/cancelAppointment')).handler;
}
// `appointmentId` null: no path parameters at all.
const cancel = (claims: Record<string, string> | undefined = alice, appointmentId: string | null = APPT_ID) =>
  handler(eventAt(ROUTE, claims, appointmentId === null ? undefined : { appointmentId }));
const at = (instant: string) => vi.setSystemTime(new Date(instant));

beforeEach(async () => {
  reset();
  at(AC20_NOW);
  storeAppointment(ddb);
  handler = await load();
});
afterEach(cleanUp);

describe('cancelAppointment handler', () => {
  it('AC-20: alice cancels exactly 24 h before: 200 with the cancelled appointment, cancellableUntil null', async () => {
    const response = await cancel();
    expect(response.statusCode).toBe(200);
    const body = bodyOf(response);
    expect(body).toEqual({
      appointmentId: APPT_ID,
      username: 'alice',
      start: START,
      end: END,
      date: '2026-11-16',
      typeId: STUDIO,
      typeName: 'Studio',
      note: NOTE,
      status: 'cancelled',
      createdAt: BOOKED_AT,
      createdBy: { username: 'alice', role: 'user' },
      updatedAt: AC20_NOW,
      updatedBy: { username: 'alice', role: 'user' },
      cancelledAt: AC20_NOW,
      cancelledBy: { username: 'alice', role: 'user' },
      cancelReason: 'cancelled',
      replaces: null,
      replacedBy: null,
      cancellableUntil: null,
    });
    expect(Object.keys(body)).not.toContain('userId');
    expect(Object.keys(body)).not.toContain('version');
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(3);
    expect(items[1]!.Update!.ExpressionAttributeValues).toMatchObject({ ':status': 'cancelled', ':cancelReason': 'cancelled', ':version': 2 });
    expect(items[2]!.Put!.Item).toMatchObject({ type: 'appointment.cancelled', eventId: expect.any(String), actor: { username: 'alice', role: 'user' } });
  });

  it('the log line: appointmentId, outcome, attempts; no note, no body, no sub', async () => {
    await cancel();
    expect(logLines()).toEqual([
      {
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'alice',
        role: 'user',
        appointmentId: APPT_ID,
        lockAttempts: 1,
        outcome: 'cancelled',
        status: 200,
        durationMs: expect.any(Number),
        timestamp: AC20_NOW,
      },
    ]);
    expect(output.join('')).not.toContain(NOTE);
    expect(output.join('')).not.toContain('sub-alice');
  });

  it('AC-21: one minute later alice is 403 cancellation_notice_too_short, nothing written; the Administrator cancels: 200', async () => {
    at(AC21_NOW);
    const response = await cancel();
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response)).toEqual({ error: 'cancellation_notice_too_short', message: 'Too late to cancel this appointment' });
    expect(transactions()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ outcome: 'too_late', status: 403, appointmentId: APPT_ID, lockAttempts: 1 });

    const byAdmin = await cancel(admin);
    expect(byAdmin.statusCode).toBe(200);
    expect(bodyOf(byAdmin)).toMatchObject({ status: 'cancelled', cancelledBy: { username: 'admin', role: 'admin' }, cancellableUntil: null });
  });

  it('a now one millisecond past the limit is refused', async () => {
    at('2026-11-15T08:00:00.001Z');
    expect((await cancel()).statusCode).toBe(403);
  });

  it('follows the saved notice: 720 h makes alice’s cancel too late', async () => {
    ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({
      Item: { cancellationNoticeHours: 720, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: BOOKED_AT, updatedBy: admin },
    });
    expect((await cancel()).statusCode).toBe(403);
  });

  it('AC-30: bob cancelling alice’s appointment is 404 appointment_not_found, not 403', async () => {
    const response = await cancel(bob);
    expect(response.statusCode).toBe(404);
    expect(bodyOf(response)).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
    expect(transactions()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ outcome: 'not_found', status: 404 });
  });

  it('an unknown id is 404 for both roles', async () => {
    ddb.on(GetCommand, { Key: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID' } }).resolves({});
    for (const claims of [alice, admin]) expect((await cancel(claims)).statusCode).toBe(404);
  });

  it('AC-31: an ended appointment is 409 appointment_not_active for the Administrator', async () => {
    at('2026-11-16T09:00:00.000Z');
    const response = await cancel(admin);
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'appointment_not_active', message: 'The appointment is cancelled or has ended' });
    expect(logLines()[0]).toMatchObject({ outcome: 'conflict', status: 409 });
  });

  it('a cancelled appointment is 409 appointment_not_active', async () => {
    storeAppointment(ddb, storedItem({ status: 'cancelled', cancelReason: 'cancelled' }));
    expect(bodyOf(await cancel())).toMatchObject({ error: 'appointment_not_active' });
  });

  it('in progress: the Administrator cancels (200); alice is 403', async () => {
    at('2026-11-16T08:30:00.000Z');
    expect((await cancel()).statusCode).toBe(403);
    expect((await cancel(admin)).statusCode).toBe(200);
  });

  it('400 for an id that is not a ULID or is missing, with nothing touched', async () => {
    for (const id of ['not-a-ulid', '01m70nr5e0q7r2c9t5xh3kd8mv', `${APPT_ID}0`, null]) {
      const response = await cancel(alice, id);
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response)).toMatchObject({ error: 'invalid_request' });
    }
    expect(ddb.calls()).toHaveLength(0);
  });

  it('403 forbidden for a token in neither group; 401 without claims; nothing touched', async () => {
    const neither = await cancel(claimsOf('carol', []));
    expect(neither.statusCode).toBe(403);
    expect(bodyOf(neither)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect((await handler(eventAt(ROUTE, undefined, { appointmentId: APPT_ID }))).statusCode).toBe(401);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('500 for every role when the time zone is broken, before the role and the path', async () => {
    handler = await load('Not/AZone');
    for (const claims of [alice, admin, claimsOf('carol', [])]) {
      const response = await cancel(claims, 'bad');
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
    }
    expect(ddb.calls()).toHaveLength(0);
  });

  it('409 concurrent_update after three lost attempts, with the attempts logged', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pending = cancel();
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'concurrent_update', message: 'The calendar is busy; try again' });
    expect(logLines()[0]).toMatchObject({ outcome: 'conflict', appointmentId: APPT_ID, lockAttempts: 3 });
  });

  it('500 internal_error when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('boom'));
    const response = await cancel();
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not cancel the appointment' });
    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'error', appointmentId: APPT_ID });
  });
});
