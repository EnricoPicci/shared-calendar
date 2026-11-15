import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  admin,
  aliceItem,
  bodyOf,
  claimsOf,
  cleanUp,
  eventAt,
  harness,
  lockBusy,
  MONDAY,
  overrideItem,
  patternItem,
  POOL,
  P1,
  STUDIO,
  TODAY,
  W1,
  windowItem,
  YESTERDAY,
} from './availabilityFixtures';

type Handler = typeof import('../../../src/handlers/deleteOverride').handler;
let handler: Handler;

const ROUTE = 'DELETE /calendar/overrides/{date}';
const { ddb, reset, onPartition, logLines, transactions, output } = harness();

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/deleteOverride')).handler;
}

const del = (date: string, claims = admin) => handler(eventAt(ROUTE, claims, { date }));

beforeEach(async () => {
  reset();
  // The pattern of docs/SHARED_CALENDAR_SPEC.md AC-04 (Mon 08:00–12:00 Studio) and the override of
  // docs/SHARED_CALENDAR_SPEC.md AC-06 on 2026-11-16.
  onPartition('PATTERN', [patternItem(P1)]);
  onPartition('OVERRIDE', [overrideItem(MONDAY, [{ start: '09:00', end: '12:00', typeId: STUDIO }])]);
  handler = await load();
});
afterEach(cleanUp);

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('deleteOverride handler', () => {
  it('deletes the override and answers 204 with no body; the patterns apply again (R-OVR-02)', async () => {
    const response = await del(MONDAY);
    expect(response).toEqual({ statusCode: 204 });
    expect(transactions()[0]!.TransactItems![1]).toEqual({ Delete: { TableName: 'calendar-test', Key: { PK: 'OVERRIDE', SK: MONDAY } } });
  });

  it('answers 404 override_not_found for a date without one', async () => {
    const response = await del('2026-11-23');
    expect(response.statusCode).toBe(404);
    expect(bodyOf(response)).toEqual({ error: 'override_not_found', message: 'No override on this date' });
    expect(transactions()).toHaveLength(0);
  });

  describe('date_in_past (R-AV-02), before the lock', () => {
    it('refuses yesterday with 409, whether it has an override or not, and touches nothing', async () => {
      onPartition('OVERRIDE', [overrideItem(YESTERDAY, [])]);
      const response = await del(YESTERDAY);
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'date_in_past', message: 'The date is in the past' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it('accepts today', async () => {
      onPartition('OVERRIDE', [overrideItem(TODAY, [])]);
      expect((await del(TODAY)).statusCode).toBe(204);
    });
  });

  it('refuses with 409 availability_overlap when the returning pattern window overlaps a one-off window (6.5, last row)', async () => {
    onPartition('OVERRIDE', [overrideItem(MONDAY, [])]);
    onPartition('WINDOW', [windowItem(W1, MONDAY, '09:00', '10:00', POOL)]);
    const response = await del(MONDAY);
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({
      error: 'availability_overlap',
      message: 'On 2026-11-16 the window 08:00–12:00 would overlap the window 09:00–10:00',
    });
    expect(transactions()).toHaveLength(0);
  });

  it('allows it when the one-off window only touches the returning pattern window', async () => {
    onPartition('OVERRIDE', [overrideItem(MONDAY, [])]);
    onPartition('WINDOW', [windowItem(W1, MONDAY, '12:00', '13:00', POOL)]);
    expect((await del(MONDAY)).statusCode).toBe(204);
  });

  it('refuses with 409 availability_conflict when the override held an appointment the patterns do not', async () => {
    // The override gives 08:00–12:00 Pool; alice's 09:00–10:00 is a Pool appointment; the pattern is Studio.
    onPartition('OVERRIDE', [overrideItem(MONDAY, [{ start: '08:00', end: '12:00', typeId: POOL }])]);
    onPartition('APPT', [{ ...aliceItem, typeId: POOL }]);
    const response = await del(MONDAY);
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({
      error: 'availability_conflict',
      message: '1 appointment would fall outside the availability',
      conflicts: [{ appointmentId: 'A1', username: 'alice', start: aliceItem.start, end: aliceItem.end }],
    });
  });

  it('passes an appointment that the returning patterns still hold', async () => {
    onPartition('APPT', [aliceItem]);
    expect((await del(MONDAY)).statusCode).toBe(204);
  });

  it.each(['2026-02-30', '2026-11-16T00:00', ''])('answers 400 for the date %j', async (date) => {
    const response = await del(date);
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: date' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await del(MONDAY, claimsOf('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventAt(ROUTE, undefined, { date: MONDAY }))).statusCode).toBe(401);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = del(MONDAY);
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response).error).toBe('concurrent_update');
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
    const response = await del(MONDAY);
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not delete the override' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await del(MONDAY, claimsOf('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('deleteOverride handler logging (AC-36)', () => {
  it('writes one info line with the date and the lock attempts', async () => {
    await del(MONDAY);
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        date: MONDAY,
        lockAttempts: 1,
        outcome: 'deleted',
        status: 204,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs not_found, and a conflict with conflictCount but never the conflicts', async () => {
    await del('2026-11-23');
    onPartition('OVERRIDE', [overrideItem(MONDAY, [{ start: '08:00', end: '12:00', typeId: POOL }])]);
    onPartition('APPT', [{ ...aliceItem, typeId: POOL }]);
    await del(MONDAY);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'not_found', status: 404, date: '2026-11-23' }),
      expect.objectContaining({ outcome: 'conflict', status: 409, date: MONDAY, conflictCount: 1 }),
    ]);
    expect(output.join('')).not.toContain('alice');
    expect(output.join('')).not.toContain('conflicts');
  });

  it('logs a busy lock with 3 attempts, and a DynamoDB failure at error level', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = del(MONDAY);
    await vi.runAllTimersAsync();
    await pending;
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await del(MONDAY);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'conflict', status: 409, date: MONDAY, lockAttempts: 3 }),
      expect.objectContaining({ level: 'error', status: 500, date: MONDAY, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
