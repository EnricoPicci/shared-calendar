import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { AC04, aliceItem, claimsOf, eventWith, lockBusy, NOW, patternItem, POOL, P1, typeItems, ULID, UNKNOWN } from './patternFixtures';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/createPattern').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'POST /calendar/patterns';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/createPattern')).handler;
}

const asCaller = (username: string, groups: string[], body?: string) => eventWith(ROUTE, claimsOf(username, groups), undefined, body);
const asAdmin = (body: string | undefined = JSON.stringify(AC04)) => asCaller('admin', ['admin'], body);
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
const bound = (pk: string) =>
  ddb
    .commandCalls(QueryCommand)
    .map((call) => call.args[0].input)
    .find((q) => q.ExpressionAttributeValues![':pk'] === pk)!.ExpressionAttributeValues![':from'];

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('createPattern handler', () => {
  it('creates the pattern with a new ULID and "now", and answers 201 with it', async () => {
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(201);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const created = body(response);
    expect(created).toEqual({ patternId: expect.stringMatching(ULID), ...AC04, createdAt: NOW, updatedAt: NOW });
    expect(transactions()[0]!.TransactItems![1]).toEqual({
      Put: { TableName: 'calendar-test', Item: { PK: 'PATTERN', SK: created.patternId, ...AC04, createdAt: NOW, updatedAt: NOW } },
    });
  });

  it('reads from "today" in the calendar zone and from now − 24 h', async () => {
    vi.setSystemTime(new Date('2026-11-16T23:30:00.000Z'));
    await handler(asAdmin());
    expect(bound('OVERRIDE')).toBe('2026-11-17');
    expect(bound('WINDOW')).toBe('2026-11-17');
    expect(bound('APPT')).toBe('2026-11-15T23:30:00.000Z');
  });

  it('answers 409 availability_overlap with the date and both windows (AC-05)', async () => {
    onPartition('PATTERN', [patternItem(P1)]);
    const response = await handler(asAdmin(JSON.stringify({ ...AC04, start: '11:00', end: '13:00', typeId: POOL })));
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({
      error: 'availability_overlap',
      message: 'On 2026-11-02 the window 11:00–13:00 would overlap the window 08:00–12:00',
    });
    expect(transactions()).toHaveLength(0);
  });

  it('allows a touching window', async () => {
    onPartition('PATTERN', [patternItem(P1)]);
    expect((await handler(asAdmin(JSON.stringify({ ...AC04, start: '12:00', end: '13:00', typeId: POOL })))).statusCode).toBe(201);
  });

  it('answers 409 type_not_found for an unknown typeId in the body', async () => {
    const response = await handler(asAdmin(JSON.stringify({ ...AC04, typeId: UNKNOWN })));
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'type_not_found', message: 'No availability type with this id' });
  });

  it('answers 409 limit_reached for the 51st pattern', async () => {
    onPartition(
      'PATTERN',
      Array.from({ length: 50 }, (_, i) => patternItem(`P${i}`, { validFrom: `${1950 + i}-01-01`, validUntil: `${1950 + i}-01-31` })),
    );
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'limit_reached', message: 'The calendar already has the maximum number of weekly patterns' });
  });

  it('passes an appointment that a new pattern leaves inside its window: a create only adds availability', async () => {
    onPartition('PATTERN', [patternItem(P1)]);
    onPartition('APPT', [aliceItem]);
    expect((await handler(asAdmin(JSON.stringify({ ...AC04, weekday: 2 })))).statusCode).toBe(201);
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'malformed JSON', raw: '{"weekday":', code: 'invalid_json', fields: undefined },
    { name: 'an unknown field (.strict())', raw: JSON.stringify({ ...AC04, patternId: P1 }), code: 'invalid_request', fields: 'patternId' },
    { name: 'a missing validUntil', raw: JSON.stringify({ ...AC04, validUntil: undefined }), code: 'invalid_request', fields: 'validUntil' },
    { name: 'end before start', raw: JSON.stringify({ ...AC04, start: '12:00', end: '08:00' }), code: 'invalid_request', fields: 'end' },
    { name: 'end equal to start', raw: JSON.stringify({ ...AC04, end: '08:00' }), code: 'invalid_request', fields: 'end' },
    {
      name: 'validUntil before validFrom',
      raw: JSON.stringify({ ...AC04, validUntil: '2026-10-31' }),
      code: 'invalid_request',
      fields: 'validUntil',
    },
    { name: 'a time off the 15-minute grid', raw: JSON.stringify({ ...AC04, start: '08:10' }), code: 'invalid_request', fields: 'start' },
    { name: 'weekday 8', raw: JSON.stringify({ ...AC04, weekday: 8 }), code: 'invalid_request', fields: 'weekday' },
    { name: 'a typeId that is not a ULID', raw: JSON.stringify({ ...AC04, typeId: 'studio' }), code: 'invalid_request', fields: 'typeId' },
  ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
    const response = await handler(asCaller('admin', ['admin'], raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    if (fields) expect(body(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups, JSON.stringify(AC04)));
    expect(response.statusCode).toBe(403);
    expect(body(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(ROUTE, undefined, undefined, JSON.stringify(AC04)))).statusCode).toBe(401);
  });

  it('keeps the same patternId across a retry', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const created = body(await pending);
    expect(transactions().map((t) => t.TransactItems![1]!.Put!.Item!.SK)).toEqual([created.patternId, created.patternId]);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toBe('concurrent_update');
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not create the pattern' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(asCaller('alice', groups, JSON.stringify(AC04)));
    expect(response.statusCode).toBe(500);
    expect(body(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('createPattern handler logging', () => {
  it('writes one info line with the new patternId and the lock attempts, never the body', async () => {
    const response = await handler(asAdmin());
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        patternId: body(response).patternId,
        lockAttempts: 1,
        outcome: 'created',
        status: 201,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toContain('08:00');
  });

  it('logs a refusal as a conflict, without its message', async () => {
    onPartition('PATTERN', [patternItem(P1)]);
    await handler(asAdmin(JSON.stringify({ ...AC04, start: '11:00', end: '13:00' })));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, patternId: expect.stringMatching(ULID) })]);
    expect(output.join('')).not.toContain('overlap');
  });

  it('logs a rejected body without echoing it', async () => {
    await handler(asAdmin(JSON.stringify({ ...AC04, secretField: 'do-not-log-me' })));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400 })]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('logs a busy lock with 3 attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    await pending;
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, lockAttempts: 3 })]);
  });

  it('logs a DynamoDB failure at error level with the reason', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', status: 500, patternId: expect.stringMatching(ULID), reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});

