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
  NOW,
  overrideItem,
  patternItem,
  POOL,
  P1,
  STUDIO,
  TODAY,
  ULID,
  UNKNOWN,
  W1,
  windowItem,
  YESTERDAY,
} from './availabilityFixtures';

type Handler = typeof import('../../../src/handlers/createOneOffWindow').handler;
let handler: Handler;

const ROUTE = 'POST /calendar/windows';
const { ddb, reset, onPartition, logLines, transactions, output } = harness();

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/createOneOffWindow')).handler;
}

/** AC-08: 2026-11-16 12:00–13:00 Studio. */
const AC08 = { date: MONDAY, start: '12:00', end: '13:00', typeId: STUDIO };
const post = (body: unknown = AC08, claims = admin) => handler(eventAt(ROUTE, claims, undefined, typeof body === 'string' ? body : JSON.stringify(body)));

beforeEach(async () => {
  reset();
  // The AC-04 pattern, Mon 08:00–12:00 Studio from 2026-11-01.
  onPartition('PATTERN', [patternItem(P1)]);
  handler = await load();
});
afterEach(cleanUp);

describe('createOneOffWindow handler', () => {
  it('AC-08: creates the window with a new ULID and answers 201 with the OneOffWindow, no createdBy', async () => {
    const response = await post();
    expect(response.statusCode).toBe(201);
    const created = bodyOf(response);
    expect(created).toEqual({ windowId: expect.stringMatching(ULID), ...AC08, createdAt: NOW });
    expect(transactions()[0]!.TransactItems![1]).toEqual({
      Put: {
        TableName: 'calendar-test',
        Item: { PK: 'WINDOW', SK: `${MONDAY}#${created.windowId}`, ...AC08, createdAt: NOW, createdBy: { username: 'admin', role: 'admin' } },
      },
    });
  });

  describe('date_in_past (R-AV-02), before the lock', () => {
    it('refuses yesterday with 409 and touches nothing', async () => {
      const response = await post({ ...AC08, date: YESTERDAY });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'date_in_past', message: 'The date is in the past' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it('accepts today', async () => {
      expect((await post({ ...AC08, date: TODAY })).statusCode).toBe(201);
    });
  });

  describe('overlap (6.5, "create a one-off window")', () => {
    it('AC-09: refuses 11:00–12:30 on a Monday with the pattern, naming the date and both windows', async () => {
      const response = await post({ ...AC08, start: '11:00', end: '12:30' });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 08:00–12:00 would overlap the window 11:00–12:30',
      });
      expect(transactions()).toHaveLength(0);
    });

    it('refuses an overlap with another one-off window of the date', async () => {
      onPartition('WINDOW', [windowItem(W1, '2026-11-17', '09:00', '10:00', POOL)]);
      expect(bodyOf(await post({ ...AC08, date: '2026-11-17', start: '09:30', end: '10:30' })).error).toBe('availability_overlap');
    });

    it('allows a touching window, also of another type', async () => {
      onPartition('WINDOW', [windowItem(W1, MONDAY, '13:00', '14:00', STUDIO)]);
      expect((await post({ ...AC08, typeId: POOL })).statusCode).toBe(201);
    });

    it('R-ONE-01, R-OVR-03: applies on a date with an empty override, compared with the override, not the patterns', async () => {
      onPartition('OVERRIDE', [overrideItem(MONDAY, [])]);
      expect((await post({ ...AC08, start: '09:00', end: '10:00' })).statusCode).toBe(201);
    });

    it('compares with the override’s windows on a date with an override', async () => {
      onPartition('OVERRIDE', [overrideItem(MONDAY, [{ start: '14:00', end: '15:00', typeId: STUDIO }])]);
      expect((await post({ ...AC08, start: '09:00', end: '10:00' })).statusCode).toBe(201);
      expect(bodyOf(await post({ ...AC08, start: '14:30', end: '16:00' })).error).toBe('availability_overlap');
    });
  });

  describe('limit (R-ONE-03)', () => {
    const nine = Array.from({ length: 9 }, (_, i) => windowItem(`W${i}`, '2026-11-17', `0${i}:00`, `0${i}:30`, POOL));
    const add = { date: '2026-11-17', start: '20:00', end: '21:00', typeId: POOL };

    it('accepts the 10th window of a date', async () => {
      onPartition('WINDOW', nine);
      expect((await post(add)).statusCode).toBe(201);
    });

    it('refuses the 11th with 409 limit_reached', async () => {
      onPartition('WINDOW', [...nine, windowItem('W9', '2026-11-17', '09:00', '09:30', POOL)]);
      const response = await post(add);
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'limit_reached', message: 'The date already has the maximum number of one-off windows' });
    });

    it('does not count another date’s windows', async () => {
      onPartition('WINDOW', [...nine, windowItem('W9', '2026-11-17', '09:00', '09:30', POOL)]);
      expect((await post({ ...add, date: '2026-11-18' })).statusCode).toBe(201);
    });
  });

  it('never conflicts: a new window only adds availability (R-AV-04)', async () => {
    onPartition('APPT', [aliceItem]);
    expect((await post()).statusCode).toBe(201);
  });

  it('answers 409 type_not_found for an unknown typeId', async () => {
    const response = await post({ ...AC08, typeId: UNKNOWN });
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'type_not_found', message: 'No availability type with this id' });
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'malformed JSON', raw: '{"date":', code: 'invalid_json', fields: undefined },
    { name: 'an unknown field (.strict())', raw: JSON.stringify({ ...AC08, windowId: W1 }), code: 'invalid_request', fields: 'windowId' },
    { name: 'a missing date', raw: JSON.stringify({ ...AC08, date: undefined }), code: 'invalid_request', fields: 'date' },
    { name: 'an impossible date', raw: JSON.stringify({ ...AC08, date: '2026-02-30' }), code: 'invalid_request', fields: 'date' },
    { name: 'end before start', raw: JSON.stringify({ ...AC08, end: '11:00' }), code: 'invalid_request', fields: 'end' },
    { name: 'a time off the grid', raw: JSON.stringify({ ...AC08, start: '12:05' }), code: 'invalid_request', fields: 'start' },
  ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
    const response = await handler(eventAt(ROUTE, admin, undefined, raw));
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response).error).toBe(code);
    if (fields) expect(bodyOf(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await post(AC08, claimsOf('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventAt(ROUTE, undefined, undefined, JSON.stringify(AC08)))).statusCode).toBe(401);
  });

  it('keeps the same windowId across a retry', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const pending = post();
    await vi.runAllTimersAsync();
    const created = bodyOf(await pending);
    expect(transactions().map((t) => t.TransactItems![1]!.Put!.Item!.SK)).toEqual([`${MONDAY}#${created.windowId}`, `${MONDAY}#${created.windowId}`]);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = post();
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response).error).toBe('concurrent_update');
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
    const response = await post();
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not create the window' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await post(AC08, claimsOf('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('createOneOffWindow handler logging (AC-36)', () => {
  it('writes one info line with the new windowId, its date and the lock attempts, never the times or the type', async () => {
    const response = await post();
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        windowId: bodyOf(response).windowId,
        date: MONDAY,
        lockAttempts: 1,
        outcome: 'created',
        status: 201,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toContain('"12:00"');
    expect(output.join('')).not.toContain(STUDIO);
  });

  it('logs a refusal as a conflict, without its message', async () => {
    await post({ ...AC08, start: '11:00', end: '12:30' });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, windowId: expect.stringMatching(ULID), date: MONDAY })]);
    expect(output.join('')).not.toContain('overlap');
  });

  it('logs date_in_past with the date and no windowId', async () => {
    await post({ ...AC08, date: YESTERDAY });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, date: YESTERDAY })]);
    expect(logLines()[0]).not.toHaveProperty('windowId');
  });

  it('logs a rejected body without echoing it', async () => {
    await post({ ...AC08, secretField: 'do-not-log-me' });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400 })]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('logs a busy lock with 3 attempts, and a DynamoDB failure at error level', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = post();
    await vi.runAllTimersAsync();
    await pending;
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await post();
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'conflict', status: 409, lockAttempts: 3, windowId: expect.stringMatching(ULID) }),
      expect.objectContaining({ level: 'error', status: 500, date: MONDAY, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
