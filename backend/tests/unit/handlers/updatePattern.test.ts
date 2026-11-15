import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { AC04, aliceItem, claimsOf, EARLIER, eventWith, lockBusy, NOW, patternItem, POOL, P1, typeItems, UNKNOWN } from './patternFixtures';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/updatePattern').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'PUT /calendar/patterns/{patternId}';
const P2 = '01JC00000000000000000000P2';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/updatePattern')).handler;
}

const asCaller = (username: string, groups: string[], patternId: string | undefined, body?: string) =>
  eventWith(ROUTE, claimsOf(username, groups), patternId, body);
// `null`: no path parameter at all.
const asAdmin = (patternId: string | null = P1, body: string | undefined = JSON.stringify({ ...AC04, start: '07:00' })) =>
  asCaller('admin', ['admin'], patternId ?? undefined, body);
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
const ALICE_CONFLICT = { appointmentId: 'A1', username: 'alice', start: aliceItem.start, end: aliceItem.end };

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('updatePattern handler', () => {
  it('replaces every field, keeps createdAt, sets updatedAt to "now", and answers 200 (AC-27: extended)', async () => {
    onPartition('APPT', [aliceItem]);
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(200);
    const updated = { patternId: P1, ...AC04, start: '07:00', createdAt: EARLIER, updatedAt: NOW };
    expect(body(response)).toEqual(updated);
    const { patternId, ...item } = updated;
    expect(transactions()[0]!.TransactItems![1]).toEqual({ Put: { TableName: 'calendar-test', Item: { PK: 'PATTERN', SK: patternId, ...item } } });
  });

  it('answers 409 availability_conflict with the conflicts when the type changes under an appointment (AC-26)', async () => {
    onPartition('APPT', [aliceItem]);
    const response = await handler(asAdmin(P1, JSON.stringify({ ...AC04, typeId: POOL })));
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({
      error: 'availability_conflict',
      message: '1 appointment would fall outside the availability',
      conflicts: [ALICE_CONFLICT],
    });
    expect(transactions()).toHaveLength(0);
  });

  it('answers 409 availability_overlap when the new window overlaps another pattern', async () => {
    onPartition('PATTERN', [patternItem(P1), patternItem(P2, { start: '13:00', end: '14:00' })]);
    const response = await handler(asAdmin(P1, JSON.stringify({ ...AC04, end: '13:30' })));
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toBe('availability_overlap');
  });

  it('answers 409 type_not_found for an unknown typeId in the body', async () => {
    const response = await handler(asAdmin(P1, JSON.stringify({ ...AC04, typeId: UNKNOWN })));
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toBe('type_not_found');
  });

  it('answers 404 pattern_not_found for an unknown id', async () => {
    const response = await handler(asAdmin(P2));
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'pattern_not_found', message: 'No weekly pattern with this id' });
    expect(transactions()).toHaveLength(0);
  });

  it.each([
    { name: 'a lower-case id', patternId: P1.toLowerCase() },
    { name: 'a short id', patternId: 'P1' },
    { name: 'no id', patternId: null },
  ])('answers 400 invalid_request on patternId and touches nothing for $name', async ({ patternId }) => {
    const response = await handler(asAdmin(patternId));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: patternId' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'a field left out (full replacement, nothing is kept)', raw: JSON.stringify({ ...AC04, typeId: undefined }), code: 'invalid_request', fields: 'typeId' },
    { name: 'an unknown field', raw: JSON.stringify({ ...AC04, createdAt: NOW }), code: 'invalid_request', fields: 'createdAt' },
    { name: 'validUntil before validFrom', raw: JSON.stringify({ ...AC04, validUntil: '2026-10-01' }), code: 'invalid_request', fields: 'validUntil' },
  ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
    const response = await handler(asCaller('admin', ['admin'], P1, raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    if (fields) expect(body(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups, P1, JSON.stringify(AC04)));
    expect(response.statusCode).toBe(403);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(ROUTE, undefined, P1, JSON.stringify(AC04)))).statusCode).toBe(401);
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
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not update the pattern' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(asCaller('alice', groups, P1, JSON.stringify(AC04)));
    expect(response.statusCode).toBe(500);
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('updatePattern handler logging', () => {
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
        outcome: 'updated',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs a conflict with the number of conflicts, never the conflicts, their usernames or the note', async () => {
    onPartition('APPT', [aliceItem]);
    await handler(asAdmin(P1, JSON.stringify({ ...AC04, typeId: POOL })));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, patternId: P1, conflictCount: 1 })]);
    expect(output.join('')).not.toContain('alice');
    expect(output.join('')).not.toContain('A1');
    expect(output.join('')).not.toContain('secret note');
  });

  it('logs an unknown id as not_found', async () => {
    await handler(asAdmin(P2));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'not_found', status: 404, patternId: P2 })]);
  });

  it('logs a rejected body with the patternId, without echoing it', async () => {
    await handler(asAdmin(P1, JSON.stringify({ ...AC04, secretField: 'do-not-log-me' })));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400, patternId: P1 })]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('logs a busy lock with 3 attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    await pending;
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, patternId: P1, lockAttempts: 3 })]);
  });

  it('logs a DynamoDB failure at error level with the reason', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await handler(asAdmin());
    expect(logLines()).toEqual([expect.objectContaining({ level: 'error', status: 500, patternId: P1 })]);
  });
});
