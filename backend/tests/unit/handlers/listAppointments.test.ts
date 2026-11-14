import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AC20_NOW, bodyOf, claimsOf, cleanUp, harness, NOTE, queryEvent, storedItem } from './appointmentFixtures';

type Handler = typeof import('../../../src/handlers/listAppointments').handler;
let handler: Handler;

// Spec 11.1 route 16, 11.2, 8.6 and 13.2, v10. Now is AC-20's, 2026-11-15T08:00Z (09:00 local).
const ROUTE = 'GET /calendar/appointments';
const { ddb, reset, onPartition, logLines, output } = harness();
const alice = claimsOf('alice', ['user']);
const admin = claimsOf('admin', ['admin']);

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/listAppointments')).handler;
}
const list = (query: Record<string, string> | undefined, claims: Record<string, string> | undefined = alice) => handler(queryEvent(ROUTE, claims, query));
const RANGE = { from: '2026-11-14', to: '2026-11-16' };

// One APPT item per case, each an hour long.
const appt = (id: string, start: string, more: Record<string, unknown> = {}) =>
  storedItem({ SK: `${start}#${id}`, start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), ...more });
const items = [
  appt('A0ENDED', '2026-11-14T09:00:00.000Z', { date: '2026-11-14' }), // alice, ended yesterday
  appt('A1BOOKED', '2026-11-16T08:00:00.000Z'), // alice, the AC-20 appointment
  appt('A2CANCELLED', '2026-11-16T10:00:00.000Z', { status: 'cancelled', cancelReason: 'cancelled' }),
  appt('B1', '2026-11-16T09:00:00.000Z', { userId: 'sub-bob', username: 'bob', note: 'bob private' }),
  // An earlier, deleted account named alice: same name, another sub (R-DEL-02).
  appt('OLDALICE', '2026-11-16T12:00:00.000Z', { userId: 'sub-old-alice' }),
];
const idsOf = (response: { body?: string }) => (bodyOf(response).appointments as { appointmentId: string }[]).map((a) => a.appointmentId);

beforeEach(async () => {
  reset();
  vi.setSystemTime(new Date(AC20_NOW));
  onPartition('APPT', items);
  handler = await load();
});
afterEach(cleanUp);

describe('listAppointments handler', () => {
  describe('a User: their own appointments, by the sub of the token', () => {
    it('a range with the default status booked: their booked ones, an ended one included, by start', async () => {
      const response = await list(RANGE);
      expect(response.statusCode).toBe(200);
      expect(idsOf(response)).toEqual(['A0ENDED', 'A1BOOKED']);
    });

    it('status=all (A6, their history): booked, ended and cancelled; nothing of bob’s, nor of the earlier alice', async () => {
      expect(idsOf(await list({ ...RANGE, status: 'all' }))).toEqual(['A0ENDED', 'A1BOOKED', 'A2CANCELLED']);
      expect(idsOf(await list({ ...RANGE, status: 'cancelled' }))).toEqual(['A2CANCELLED']);
    });

    it('upcoming: only those not yet ended; with status=all the cancelled future one too', async () => {
      expect(idsOf(await list({ upcoming: 'true' }))).toEqual(['A1BOOKED']);
      expect(idsOf(await list({ upcoming: 'true', status: 'all' }))).toEqual(['A1BOOKED', 'A2CANCELLED']);
      const appt = ddb.commandCalls(QueryCommand).map((c) => c.args[0].input).find((q) => q.ExpressionAttributeValues![':pk'] === 'APPT')!;
      expect(appt.KeyConditionExpression).toBe('PK = :pk AND SK >= :from');
      expect(appt.ExpressionAttributeValues![':from']).toBe('2026-11-14T08:00:00.000Z');
    });

    it('their own username changes nothing; another one is 403 forbidden, with nothing read', async () => {
      expect(idsOf(await list({ ...RANGE, username: 'alice', status: 'all' }))).toEqual(['A0ENDED', 'A1BOOKED', 'A2CANCELLED']);
      ddb.resetHistory();
      const response = await list({ ...RANGE, username: 'bob' });
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toEqual({ error: 'forbidden', message: 'A User can list only their own appointments' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it('the response: cancellableUntil start − notice on booked ones (in the past once passed), null on a cancelled one; typeName; no userId', async () => {
      const body = bodyOf(await list({ ...RANGE, status: 'all' })).appointments as Record<string, unknown>[];
      expect(body.map((a) => a.cancellableUntil)).toEqual(['2026-11-13T09:00:00.000Z', '2026-11-15T08:00:00.000Z', null]);
      expect(body[1]).toMatchObject({ typeName: 'Studio', note: NOTE, status: 'booked', username: 'alice' });
      for (const a of body) {
        expect(Object.keys(a)).not.toContain('userId');
        expect(Object.keys(a)).not.toContain('version');
      }
    });
  });

  describe('the Administrator', () => {
    it('without username: every appointment, every owner, cancellableUntil null', async () => {
      const response = await list({ ...RANGE, status: 'all' }, admin);
      expect(idsOf(response)).toEqual(['A0ENDED', 'A1BOOKED', 'B1', 'A2CANCELLED', 'OLDALICE']);
      expect((bodyOf(response).appointments as { cancellableUntil: unknown }[]).every((a) => a.cancellableUntil === null)).toBe(true);
    });

    it('username filters on the stored name: the earlier account with that name included (v10)', async () => {
      expect(idsOf(await list({ ...RANGE, status: 'all', username: 'alice' }, admin))).toEqual(['A0ENDED', 'A1BOOKED', 'A2CANCELLED', 'OLDALICE']);
      expect(idsOf(await list({ ...RANGE, username: 'bob' }, admin))).toEqual(['B1']);
    });

    it('an unknown username is 200 with an empty list', async () => {
      const response = await list({ ...RANGE, username: 'nobody' }, admin);
      expect(response.statusCode).toBe(200);
      expect(bodyOf(response)).toEqual({ appointments: [] });
    });
  });

  describe('the query (11.2)', () => {
    it('accepts a range of exactly 92 days', async () => {
      expect((await list({ from: '2026-11-01', to: '2027-01-31' })).statusCode).toBe(200);
    });

    it.each([
      ['93 days', { from: '2026-11-01', to: '2027-02-01' }],
      ['from after to', { from: '2026-11-16', to: '2026-11-15' }],
      ['neither a range nor upcoming', {}],
      ['no query string at all', undefined],
      ['from without to', { from: '2026-11-16' }],
      ['both a range and upcoming', { ...RANGE, upcoming: 'true' }],
      ['upcoming=false', { upcoming: 'false' }],
      ['an unknown status', { ...RANGE, status: 'ended' }],
      ['an invalid username', { ...RANGE, username: 'Not Valid!' }],
      ['an unknown field', { ...RANGE, limit: '5' }],
      ['a date that does not exist', { from: '2026-02-30', to: '2026-03-01' }],
    ])('400 invalid_request for %s, nothing read', async (_name, query) => {
      for (const claims of [alice, admin]) {
        const response = await list(query, claims);
        expect(response.statusCode).toBe(400);
        expect(bodyOf(response)).toMatchObject({ error: 'invalid_request' });
      }
      expect(ddb.calls()).toHaveLength(0);
    });
  });

  describe('roles, configuration, errors', () => {
    it('403 forbidden for a token in neither group; 401 without claims', async () => {
      const response = await list(RANGE, claimsOf('carol', []));
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
      expect((await handler(queryEvent(ROUTE, undefined, RANGE))).statusCode).toBe(401);
      expect(ddb.calls()).toHaveLength(0);
    });

    it('500 for every role when the time zone is broken, before the role and the query', async () => {
      handler = await load('Not/AZone');
      for (const claims of [alice, admin, claimsOf('carol', [])]) {
        const response = await list({ bad: 'x' }, claims);
        expect(response.statusCode).toBe(500);
        expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
      }
    });

    it('500 internal_error when DynamoDB fails', async () => {
      ddb.on(QueryCommand).rejects(new Error('boom'));
      const response = await list(RANGE);
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not list the appointments' });
      expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'error' });
    });
  });

  describe('the log line (14.5, AC-36)', () => {
    it('the selection, the status and the count; never a note, a sub or another User’s data', async () => {
      await list({ ...RANGE, status: 'all' });
      expect(logLines()).toEqual([
        {
          level: 'info',
          requestId: 'req-1',
          route: ROUTE,
          username: 'alice',
          role: 'user',
          from: RANGE.from,
          to: RANGE.to,
          listStatus: 'all',
          count: 3,
          outcome: 'ok',
          status: 200,
          durationMs: expect.any(Number),
          timestamp: AC20_NOW,
        },
      ]);
      const all = output.join('');
      for (const secret of [NOTE, 'bob private', 'sub-alice', 'sub-bob']) expect(all).not.toContain(secret);
    });

    it('the Administrator’s filter is logged as target; upcoming as upcoming', async () => {
      await list({ upcoming: 'true', username: 'bob' }, admin);
      expect(logLines()[0]).toMatchObject({ upcoming: true, listStatus: 'booked', target: 'bob', count: 1 });
    });
  });
});
