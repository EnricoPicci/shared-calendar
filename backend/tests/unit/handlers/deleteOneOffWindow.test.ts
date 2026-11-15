import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
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
  patternItem,
  P1,
  STUDIO,
  TODAY,
  W1,
  W2,
  windowItem,
  YESTERDAY,
} from './availabilityFixtures';

type Handler = typeof import('../../../src/handlers/deleteOneOffWindow').handler;
let handler: Handler;

const ROUTE = 'DELETE /calendar/windows/{windowId}';
const { ddb, reset, onPartition, logLines, transactions, output } = harness();

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/deleteOneOffWindow')).handler;
}

const del = (windowId: string, claims = admin) => handler(eventAt(ROUTE, claims, { windowId }));
// The windows from today on (the state) and the whole partition (the past lookup) are two queries.
const onWindows = (fromToday: object[], all: object[] = fromToday) => {
  ddb.on(QueryCommand, { KeyConditionExpression: 'PK = :pk AND SK >= :from', ExpressionAttributeValues: { ':pk': 'WINDOW' } }).resolves({ Items: fromToday });
  ddb.on(QueryCommand, { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'WINDOW' } }).resolves({ Items: all });
};

beforeEach(async () => {
  reset();
  // The pattern of docs/SHARED_CALENDAR_SPEC.md AC-04 (Mon 08:00–12:00 Studio) and the window of
  // docs/SHARED_CALENDAR_SPEC.md AC-08 (12:00–13:00 Studio on 2026-11-16).
  onPartition('PATTERN', [patternItem(P1)]);
  onWindows([windowItem(W1, MONDAY, '12:00', '13:00', STUDIO)]);
  handler = await load();
});
afterEach(cleanUp);

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('deleteOneOffWindow handler', () => {
  it('deletes the window and answers 204 with no body', async () => {
    expect(await del(W1)).toEqual({ statusCode: 204 });
    expect(transactions()[0]!.TransactItems![1]).toEqual({ Delete: { TableName: 'calendar-test', Key: { PK: 'WINDOW', SK: `${MONDAY}#${W1}` } } });
  });

  it('answers 404 window_not_found for an unknown id', async () => {
    const response = await del(W2);
    expect(response.statusCode).toBe(404);
    expect(bodyOf(response)).toEqual({ error: 'window_not_found', message: 'No one-off window with this id' });
    expect(transactions()).toHaveLength(0);
  });

  describe('date_in_past, inside the locked attempt', () => {
    it('refuses a window dated yesterday with 409', async () => {
      onWindows([], [windowItem(W2, YESTERDAY, '09:00', '10:00', STUDIO)]);
      const response = await del(W2);
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'date_in_past', message: 'The window is dated in the past' });
      expect(transactions()).toHaveLength(0);
    });

    it('accepts a window dated today', async () => {
      onWindows([windowItem(W2, TODAY, '18:00', '19:00', STUDIO)]);
      expect((await del(W2)).statusCode).toBe(204);
    });
  });

  it('refuses with 409 availability_conflict when the window carries an appointment (R-AV-03)', async () => {
    // alice's 12:00–13:00 local Studio lies in the one-off window only.
    const held = { ...aliceItem, SK: '2026-11-16T11:00:00.000Z#A1', start: '2026-11-16T11:00:00.000Z', end: '2026-11-16T12:00:00.000Z' };
    onPartition('APPT', [held]);
    const response = await del(W1);
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({
      error: 'availability_conflict',
      message: '1 appointment would fall outside the availability',
      conflicts: [{ appointmentId: 'A1', username: 'alice', start: held.start, end: held.end }],
    });
  });

  it('refuses when the appointment lies across the merged pattern and window (6.6)', async () => {
    // 11:00–13:00 local = 10:00Z–12:00Z: inside 08:00–13:00 only while the window is there.
    onPartition('APPT', [{ ...aliceItem, SK: '2026-11-16T10:00:00.000Z#A1', start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T12:00:00.000Z' }]);
    expect(bodyOf(await del(W1)).error).toBe('availability_conflict');
  });

  it('passes an appointment the pattern still holds', async () => {
    onPartition('APPT', [aliceItem]);
    expect((await del(W1)).statusCode).toBe(204);
  });

  it.each(['not-a-ulid', '01JC00000000000000000000w1', ''])('answers 400 for the windowId %j', async (windowId) => {
    const response = await del(windowId);
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: windowId' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await del(W1, claimsOf('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventAt(ROUTE, undefined, { windowId: W1 }))).statusCode).toBe(401);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = del(W1);
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response).error).toBe('concurrent_update');
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
    const response = await del(W1);
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not delete the window' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await del(W1, claimsOf('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('deleteOneOffWindow handler logging (AC-36)', () => {
  it('writes one info line with the windowId and the lock attempts', async () => {
    await del(W1);
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        windowId: W1,
        lockAttempts: 1,
        outcome: 'deleted',
        status: 204,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs not_found, date_in_past and a conflict with conflictCount, never the conflicts', async () => {
    await del(W2);
    onWindows([], [windowItem(W2, YESTERDAY, '09:00', '10:00', STUDIO)]);
    await del(W2);
    onWindows([windowItem(W1, MONDAY, '12:00', '13:00', STUDIO)]);
    onPartition('APPT', [{ ...aliceItem, SK: '2026-11-16T11:00:00.000Z#A1', start: '2026-11-16T11:00:00.000Z', end: '2026-11-16T12:00:00.000Z' }]);
    await del(W1);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'not_found', status: 404, windowId: W2 }),
      expect.objectContaining({ outcome: 'conflict', status: 409, windowId: W2 }),
      expect.objectContaining({ outcome: 'conflict', status: 409, windowId: W1, conflictCount: 1 }),
    ]);
    expect(output.join('')).not.toContain('alice');
    expect(output.join('')).not.toContain('conflicts');
  });

  it('logs a busy lock with 3 attempts, and a DynamoDB failure at error level', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = del(W1);
    await vi.runAllTimersAsync();
    await pending;
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await del(W1);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'conflict', status: 409, windowId: W1, lockAttempts: 3 }),
      expect.objectContaining({ level: 'error', status: 500, windowId: W1, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
