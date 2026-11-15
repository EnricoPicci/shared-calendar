import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
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
  NOW,
  P1,
  patternItem,
  START,
  STUDIO,
  storeAppointment,
  storedItem,
  ULID,
} from './appointmentFixtures';

type Handler = typeof import('../../../src/handlers/changeAppointment').handler;
let handler: Handler;

// Spec 8.4 v11, route 20; AC-22, AC-23, AC-24 on the dates of 18.3: Europe/Rome, the AC-04 pattern
// Mon 08:00–12:00 Studio, alice holds Monday 2026-11-16 09:00–10:00 local (08:00Z–09:00Z). Now is
// 2026-11-10T09:00Z (enough notice) unless a test says otherwise; AC-21's now for the notice.
const ROUTE = 'POST /calendar/appointments/{appointmentId}/change';
const { ddb, reset, onPartition, logLines, transactions, output } = harness();
const alice = claimsOf('alice', ['user']);
const bob = claimsOf('bob', ['user']);
const H1000 = '2026-11-16T09:00:00.000Z';
const H1030 = '2026-11-16T09:30:00.000Z';
const H1100 = '2026-11-16T10:00:00.000Z';
const ALICE_ACTOR = { username: 'alice', role: 'user' };
const ADMIN_ACTOR = { username: 'admin', role: 'admin' };

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/changeAppointment')).handler;
}
// `appointmentId` null: no path parameters at all.
const post = (body: unknown, claims: Record<string, string> | undefined = alice, appointmentId: string | null = APPT_ID) =>
  handler(eventAt(ROUTE, claims, appointmentId === null ? undefined : { appointmentId }, typeof body === 'string' ? body : JSON.stringify(body)));
const at = (instant: string) => vi.setSystemTime(new Date(instant));
const settingsItem = (more: object) => ({
  Item: { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: BOOKED_AT, updatedBy: ADMIN_ACTOR, ...more },
});
const withSettings = (more: object) => ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves(settingsItem(more));
const bobAt = (start: string, end: string) => ({ ...storedItem(), SK: `${start}#01M70NR5E0Q7R2C9T5XH3KD8B0`, userId: 'sub-bob', username: 'bob', start, end });

beforeEach(async () => {
  reset();
  onPartition('PATTERN', [patternItem(P1)]);
  onPartition('APPT', [storedItem()]);
  storeAppointment(ddb);
  handler = await load();
});
afterEach(cleanUp);

describe('changeAppointment handler', () => {
  it('AC-22: alice moves 09:00 to 10:00: 201 { cancelled, booked }, cancellableUntil per status, no userId or version', async () => {
    const response = await post({ start: H1000 });
    expect(response.statusCode).toBe(201);
    const body = bodyOf(response) as Record<string, Record<string, unknown>>;
    expect(Object.keys(body)).toEqual(['cancelled', 'booked']);
    const newId = body.booked!.appointmentId as string;
    expect(newId).toMatch(ULID);
    expect(body.cancelled).toEqual({
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
      createdBy: ALICE_ACTOR,
      updatedAt: NOW,
      updatedBy: ALICE_ACTOR,
      cancelledAt: NOW,
      cancelledBy: ALICE_ACTOR,
      cancelReason: 'changed',
      replaces: null,
      replacedBy: newId,
      cancellableUntil: null,
    });
    expect(body.booked).toEqual({
      appointmentId: newId,
      username: 'alice',
      start: H1000,
      end: H1100,
      date: '2026-11-16',
      typeId: STUDIO,
      typeName: 'Studio',
      note: NOTE,
      status: 'booked',
      createdAt: NOW,
      createdBy: ALICE_ACTOR,
      updatedAt: NOW,
      updatedBy: ALICE_ACTOR,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      replaces: APPT_ID,
      replacedBy: null,
      cancellableUntil: '2026-11-15T09:00:00.000Z',
    });
    for (const side of [body.cancelled!, body.booked!]) {
      expect(Object.keys(side)).not.toContain('userId');
      expect(Object.keys(side)).not.toContain('version');
    }
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(6);
    expect(items[4]!.Put!.Item).toMatchObject({ type: 'appointment.changed', appointment: { appointmentId: newId }, previous: { appointmentId: APPT_ID, replacedBy: newId } });
    expect(items[5]!.ConditionCheck!.Key).toEqual({ PK: 'DELETEDUSER#sub-alice', SK: 'DELETEDUSER' });
  });

  it('the log line: both ids, outcome, attempts; no note, no body, no sub', async () => {
    const response = await post({ start: H1000, note: 'a new private note' });
    const newId = (bodyOf(response).booked as Record<string, unknown>).appointmentId;
    expect(logLines()).toEqual([
      {
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'alice',
        role: 'user',
        appointmentId: APPT_ID,
        lockAttempts: 1,
        newAppointmentId: newId,
        outcome: 'changed',
        status: 201,
        durationMs: expect.any(Number),
        timestamp: NOW,
      },
    ]);
    for (const secret of [NOTE, 'a new private note', 'sub-alice', H1000]) expect(output.join('')).not.toContain(secret);
  });

  it('AC-23: 10:00 taken by bob: 409 slot_taken, nothing written', async () => {
    onPartition('APPT', [storedItem(), bobAt(H1000, H1100)]);
    const response = await post({ start: H1000 });
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'slot_taken', message: 'The time is already booked' });
    expect(transactions()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ outcome: 'conflict', status: 409, appointmentId: APPT_ID, lockAttempts: 1 });
    expect(logLines()[0]).not.toHaveProperty('newAppointmentId');
  });

  it('AC-24: the Administrator changes 09:00–10:00 to 09:00–10:30: 201, cancellableUntil null on both', async () => {
    const response = await post({ start: START, end: H1030 }, admin);
    expect(response.statusCode).toBe(201);
    const { cancelled, booked } = bodyOf(response) as Record<string, Record<string, unknown>>;
    expect(booked).toMatchObject({ username: 'alice', start: START, end: H1030, createdBy: ADMIN_ACTOR, cancellableUntil: null });
    expect(cancelled).toMatchObject({ cancelledBy: ADMIN_ACTOR, cancelReason: 'changed', cancellableUntil: null });
  });

  it('the Administrator’s end absent is start + 60 min (v11), not the old duration', async () => {
    storeAppointment(ddb, storedItem({ end: H1030 }));
    const response = await post({ start: H1000 }, admin);
    expect((bodyOf(response).booked as Record<string, unknown>).end).toBe(H1100);
  });

  describe('R-CHG-03: the note', () => {
    const noteOf = async (body: object) => ((bodyOf(await post(body)).booked as Record<string, unknown>).note);

    it('absent keeps the old note', async () => {
      expect(await noteOf({ start: H1000 })).toBe(NOTE);
    });

    it('null clears it', async () => {
      expect(await noteOf({ start: H1000, note: null })).toBeNull();
    });

    it('a string is trimmed; an empty one is null', async () => {
      expect(await noteOf({ start: H1000, note: '  bring shoes  ' })).toBe('bring shoes');
      expect(await noteOf({ start: H1000, note: '   ' })).toBeNull();
    });
  });

  describe('the old appointment', () => {
    it('the notice: alice at 09:01 the day before is 403 cancellation_notice_too_short; the Administrator 201', async () => {
      at(AC21_NOW);
      const response = await post({ start: H1000 });
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toEqual({ error: 'cancellation_notice_too_short', message: 'Too late to change this appointment' });
      expect(logLines()[0]).toMatchObject({ outcome: 'too_late', status: 403 });
      expect(transactions()).toHaveLength(0);
      expect((await post({ start: H1000 }, admin)).statusCode).toBe(201);
    });

    it('bob changing alice’s appointment is 404 appointment_not_found; an unknown id too', async () => {
      const response = await post({ start: H1000 }, bob);
      expect(response.statusCode).toBe(404);
      expect(bodyOf(response)).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
      ddb.on(GetCommand, { Key: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID' } }).resolves({});
      expect((await post({ start: H1000 }, admin)).statusCode).toBe(404);
    });

    it('an already changed appointment is 409 appointment_not_active', async () => {
      storeAppointment(ddb, storedItem({ status: 'cancelled', cancelReason: 'changed', replacedBy: '01M70NR5E0Q7R2C9T5XH3KD8NW' }));
      const response = await post({ start: H1000 });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'appointment_not_active', message: 'The appointment is cancelled or has ended' });
    });

    it('an ended appointment is 409 for the Administrator', async () => {
      at(END);
      expect(bodyOf(await post({ start: '2026-11-23T08:00:00.000Z' }, admin))).toMatchObject({ error: 'appointment_not_active' });
    });
  });

  describe('the new appointment: the booking rules', () => {
    it('booking_notice_too_short, booking_beyond_horizon, outside_availability as 409', async () => {
      withSettings({ minBookingNoticeHours: 200 });
      expect(bodyOf(await post({ start: H1000 }))).toMatchObject({ error: 'booking_notice_too_short' });
      withSettings({ bookingHorizonDays: 5 });
      expect(bodyOf(await post({ start: H1000 }))).toMatchObject({ error: 'booking_beyond_horizon' });
      withSettings({});
      const response = await post({ start: '2026-11-16T11:00:00.000Z' });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toMatchObject({ error: 'outside_availability' });
    });

    it('the limit does not count the old one: at limit 1 alice moves her only future appointment', async () => {
      withSettings({ maxFutureAppointmentsPerUser: 1 });
      expect((await post({ start: H1000 })).statusCode).toBe(201);
    });

    it('the limit counts her other future ones: 409 appointment_limit_reached', async () => {
      withSettings({ maxFutureAppointmentsPerUser: 1 });
      onPartition('APPT', [storedItem(), { ...storedItem(), SK: '2026-11-23T08:00:00.000Z#X', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' }]);
      expect(bodyOf(await post({ start: H1000 }))).toMatchObject({ error: 'appointment_limit_reached' });
    });
  });

  it('R-BOOK-10: the User deleted (marker): 404 user_not_found, no retry', async () => {
    const reasons = ['None', 'None', 'None', 'None', 'None', 'ConditionalCheckFailed'].map((Code) => ({ Code }));
    ddb.on(TransactWriteCommand).rejects(new TransactionCanceledException({ message: 'cancelled', $metadata: {}, CancellationReasons: reasons }));
    const response = await post({ start: H1000 }, admin);
    expect(response.statusCode).toBe(404);
    expect(bodyOf(response)).toEqual({ error: 'user_not_found', message: 'The user has been deleted' });
    expect(transactions()).toHaveLength(1);
    expect(logLines()[0]).toMatchObject({ outcome: 'not_found', status: 404, lockAttempts: 1 });
  });

  describe('the request, before the lock', () => {
    it('400 for an id that is not a ULID or is missing, with nothing touched', async () => {
      for (const id of ['not-a-ulid', `${APPT_ID}0`, null]) {
        const response = await post({ start: H1000 }, alice, id);
        expect(response.statusCode).toBe(400);
        expect(bodyOf(response)).toMatchObject({ error: 'invalid_request' });
      }
      expect(ddb.calls()).toHaveLength(0);
    });

    it('400 invalid_json for a body that is not JSON', async () => {
      const response = await post('{not json');
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response)).toMatchObject({ error: 'invalid_json' });
      expect(logLines()[0]).toMatchObject({ outcome: 'invalid_request', appointmentId: APPT_ID });
    });

    it('400 invalid_request for invalid bodies: an unknown field, username, a malformed instant, a 501-unit note, end ≤ start', async () => {
      const bodies = [
        {},
        { start: H1000, extra: 1 },
        { start: H1000, username: 'alice' },
        { start: '2026-11-16T09:00:00Z' },
        { start: '2026-11-16T09:00:00.000+01:00' },
        { start: H1000, note: 'x'.repeat(501) },
        { start: H1000, note: '😀'.repeat(250) + 'x' },
        { start: H1000, end: H1000 },
      ];
      for (const body of bodies) {
        const response = await post(body, admin);
        expect(response.statusCode).toBe(400);
        expect(bodyOf(response)).toMatchObject({ error: 'invalid_request' });
      }
      expect(ddb.calls()).toHaveLength(0);
      expect(output.join('')).not.toContain('xxxx');
    });

    it('R-BOOK-02 per role: a User’s start not a whole hour, or a custom end; the Administrator off the 15-minute grid', async () => {
      for (const [body, claims] of [
        [{ start: '2026-11-16T09:30:00.000Z' }, alice],
        [{ start: H1000, end: H1030 }, alice],
        [{ start: '2026-11-16T09:10:00.000Z' }, admin],
        [{ start: H1000, end: '2026-11-16T09:05:00.000Z' }, admin],
      ] as const) {
        const response = await post(body, claims);
        expect(response.statusCode).toBe(400);
        expect(bodyOf(response)).toMatchObject({ error: 'invalid_request' });
      }
      expect(ddb.calls()).toHaveLength(0);
    });

    it('R-BOOK-02 comes before the lookup: an invalid time for someone else’s id is 400, not 404', async () => {
      expect((await post({ start: '2026-11-16T09:30:00.000Z' }, bob)).statusCode).toBe(400);
    });

    it('403 forbidden for a token in neither group; 401 without claims; nothing touched', async () => {
      const neither = await post({ start: H1000 }, claimsOf('carol', []));
      expect(neither.statusCode).toBe(403);
      expect(bodyOf(neither)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
      expect((await handler(eventAt(ROUTE, undefined, { appointmentId: APPT_ID }, JSON.stringify({ start: H1000 })))).statusCode).toBe(401);
      expect(ddb.calls()).toHaveLength(0);
    });

    it('500 for every role when the time zone is broken, before the role, the path and the body', async () => {
      handler = await load('Not/AZone');
      for (const claims of [alice, admin, claimsOf('carol', [])]) {
        const response = await post('{bad', claims, 'bad');
        expect(response.statusCode).toBe(500);
        expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
      }
      expect(ddb.calls()).toHaveLength(0);
    });
  });

  it('409 concurrent_update after three lost attempts, with the attempts logged', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pending = post({ start: H1000 });
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'concurrent_update', message: 'The calendar is busy; try again' });
    expect(logLines()[0]).toMatchObject({ outcome: 'conflict', appointmentId: APPT_ID, lockAttempts: 3 });
  });

  it('500 internal_error when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('boom'));
    const response = await post({ start: H1000 });
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not change the appointment' });
    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'error', appointmentId: APPT_ID });
  });
});
