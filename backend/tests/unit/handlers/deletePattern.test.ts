import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { aliceItem, claimsOf, eventWith, lockBusy, NOW, patternItem, P1, typeItems } from './patternFixtures';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/deletePattern').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'DELETE /calendar/patterns/{patternId}';
const P2 = '01JC00000000000000000000P2';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/deletePattern')).handler;
}

// `null`: no path parameter at all.
const asAdmin = (patternId: string | null = P1) => eventWith(ROUTE, claimsOf('admin', ['admin']), patternId ?? undefined);
const onPartition = (pk: string, items: object[]) =>
  ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': pk } }).resolves({ Items: items });

let output: string[];
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  onPartition('TYPE', typeItems);
  onPartition('PATTERN', [patternItem(P1)]);
  ddb.on(TransactWriteCommand).resolves({});
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  handler = await load();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<Handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);

describe('deletePattern handler', () => {
  it('deletes the pattern and answers 204 with no body', async () => {
    expect(await handler(asAdmin())).toEqual({ statusCode: 204 });
    expect(transactions()[0]!.TransactItems![1]).toEqual({ Delete: { TableName: 'calendar-test', Key: { PK: 'PATTERN', SK: P1 } } });
  });

  it('answers 409 availability_conflict with the conflicts when an appointment depends on it', async () => {
    onPartition('APPT', [aliceItem]);
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({
      error: 'availability_conflict',
      message: '1 appointment would fall outside the availability',
      conflicts: [{ appointmentId: 'A1', username: 'alice', start: aliceItem.start, end: aliceItem.end }],
    });
    expect(transactions()).toHaveLength(0);
  });

  it('deletes it when the appointment has ended', async () => {
    vi.setSystemTime(new Date('2026-11-16T09:00:00.000Z'));
    onPartition('APPT', [aliceItem]);
    expect((await handler(asAdmin())).statusCode).toBe(204);
  });

  it('answers 404 pattern_not_found for an unknown id', async () => {
    const response = await handler(asAdmin(P2));
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'pattern_not_found', message: 'No weekly pattern with this id' });
  });

  it.each([
    { name: 'a lower-case id', patternId: P1.toLowerCase() },
    { name: 'no id', patternId: null },
  ])('answers 400 invalid_request and touches nothing for $name', async ({ patternId }) => {
    const response = await handler(asAdmin(patternId));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: patternId' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await handler(eventWith(ROUTE, claimsOf('alice', groups), P1));
    expect(response.statusCode).toBe(403);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(ROUTE, undefined, P1))).statusCode).toBe(401);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    expect(body(await pending).error).toBe('concurrent_update');
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(QueryCommand).rejects(new Error('secret detail'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not delete the pattern' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(eventWith(ROUTE, claimsOf('alice', groups), P1));
    expect(response.statusCode).toBe(500);
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('deletePattern handler logging', () => {
  it('writes one info line with the patternId and the lock attempts', async () => {
    await handler(asAdmin());
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        patternId: P1,
        lockAttempts: 1,
        outcome: 'deleted',
        status: 204,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs a conflict with its count, never the conflicts or their usernames', async () => {
    onPartition('APPT', [aliceItem]);
    await handler(asAdmin());
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, conflictCount: 1 })]);
    expect(output.join('')).not.toContain('alice');
  });

  it('logs an unknown id as not_found', async () => {
    await handler(asAdmin(P2));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'not_found', status: 404, patternId: P2 })]);
  });

  it('logs a busy lock with 3 attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    await pending;
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', lockAttempts: 3 })]);
  });

  it('logs a DynamoDB failure at error level', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await handler(asAdmin());
    expect(logLines()).toEqual([expect.objectContaining({ level: 'error', status: 500, patternId: P1 })]);
  });
});
