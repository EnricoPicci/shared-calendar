import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/createAvailabilityType').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'POST /calendar/types';
const NOW = '2026-11-12T09:30:00.000Z';
const EARLIER = '2026-11-01T08:00:00.000Z';
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/createAvailabilityType')).handler;
}

function eventWith(lambda: Record<string, string> | undefined, body?: string) {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (username: string, groups: string[], body?: string) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, body);
const asAdmin = (body = JSON.stringify({ name: '  Studio ' })) => asCaller('admin', ['admin'], body);

const typeItem = (n: number, name: string) => ({
  PK: 'TYPE',
  SK: `01JC00000000000000000000${String(n).padStart(2, '0')}`,
  name,
  nameKey: name.toLowerCase(),
  createdAt: EARLIER,
  updatedAt: EARLIER,
});
const lockBusy = () =>
  new TransactionCanceledException({
    message: 'Transaction cancelled [ConditionalCheckFailed, None]',
    $metadata: {},
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
  });

let output: string[];
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [typeItem(1, 'Pool')] });
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

describe('createAvailabilityType handler', () => {
  it('creates the type with a new ULID, the trimmed name and "now", and answers 201', async () => {
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(201);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const created = body(response);
    expect(created).toEqual({ typeId: expect.stringMatching(ULID), name: 'Studio', createdAt: NOW, updatedAt: NOW });
    expect(transactions()[0]!.TransactItems![1]).toEqual({
      Put: {
        TableName: 'calendar-test',
        Item: { PK: 'TYPE', SK: created.typeId, name: 'Studio', nameKey: 'studio', createdAt: NOW, updatedAt: NOW },
      },
    });
  });

  it('accepts an admin who is also in user', async () => {
    expect((await handler(asCaller('admin', ['user', 'admin'], JSON.stringify({ name: 'Gym' })))).statusCode).toBe(201);
  });

  it.each([[['user']], [[]], [['other']]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups, JSON.stringify({ name: 'Gym' })));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(undefined, JSON.stringify({ name: 'Gym' })))).statusCode).toBe(401);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'malformed JSON', raw: '{"name":', code: 'invalid_json', fields: undefined },
    { name: 'an unknown field (.strict())', raw: JSON.stringify({ name: 'Gym', color: 'red' }), code: 'invalid_request', fields: 'color' },
    { name: 'a missing name', raw: '{}', code: 'invalid_request', fields: 'name' },
    { name: 'a blank name', raw: JSON.stringify({ name: '   ' }), code: 'invalid_request', fields: 'name' },
    { name: 'a name of 41 characters', raw: JSON.stringify({ name: 'x'.repeat(41) }), code: 'invalid_request', fields: 'name' },
    { name: 'a control character', raw: JSON.stringify({ name: 'Gym\tA' }), code: 'invalid_request', fields: 'name' },
    { name: 'a number', raw: JSON.stringify({ name: 7 }), code: 'invalid_request', fields: 'name' },
  ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
    const response = await handler(asCaller('admin', ['admin'], raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    if (fields) expect(body(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 409 type_name_exists for a name that exists in another case (AC-03)', async () => {
    ddb.on(QueryCommand).resolves({ Items: [typeItem(1, 'Studio')] });
    const response = await handler(asAdmin(JSON.stringify({ name: 'studio' })));
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'type_name_exists', message: 'A type with this name already exists' });
    expect(transactions()).toHaveLength(0);
  });

  it('allows the 20th type and refuses the 21st with 409 limit_reached', async () => {
    ddb.on(QueryCommand).resolves({ Items: Array.from({ length: 19 }, (_, i) => typeItem(i, `Type ${i}`)) });
    expect((await handler(asAdmin(JSON.stringify({ name: 'Twentieth' })))).statusCode).toBe(201);

    ddb.on(QueryCommand).resolves({ Items: Array.from({ length: 20 }, (_, i) => typeItem(i, `Type ${i}`)) });
    const response = await handler(asAdmin(JSON.stringify({ name: 'Twenty-first' })));
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'limit_reached', message: 'The calendar already has the maximum number of types' });
    expect(transactions()).toHaveLength(1);
  });

  it('answers 409 type_name_exists when the name was taken between two attempts', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [] })
      .resolves({ Items: [typeItem(1, 'STUDIO')] });
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toBe('type_name_exists');
    expect(transactions()).toHaveLength(1);
  });

  it('keeps the same typeId across a retry', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const created = body(await pending);
    expect(transactions().map((t) => t.TransactItems![1]!.Put!.Item!.SK)).toEqual([created.typeId, created.typeId]);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'concurrent_update', message: 'The calendar is busy; try again' });
    expect(transactions()).toHaveLength(3);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not create the type' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(asCaller('alice', groups, JSON.stringify({ name: 'Gym' })));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('createAvailabilityType handler logging', () => {
  it('writes one info line with the new typeId and the lock attempts, never the name', async () => {
    const response = await handler(asAdmin(JSON.stringify({ name: 'Secret-Name' })));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        typeId: body(response).typeId,
        lockAttempts: 1,
        outcome: 'created',
        status: 201,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toMatch(/secret-name/i);
  });

  it('logs a refusal as a conflict with the code’s status', async () => {
    ddb.on(QueryCommand).resolves({ Items: [typeItem(1, 'Studio')] });
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', outcome: 'conflict', status: 409, typeId: expect.stringMatching(ULID), lockAttempts: 1 }),
    ]);
  });

  it('logs a busy lock with 3 attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    await pending;
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, lockAttempts: 3 })]);
  });

  it('logs a rejected body without echoing it', async () => {
    await handler(asAdmin(JSON.stringify({ name: 'Gym', secretField: 'do-not-log-me' })));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400 })]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('logs a DynamoDB failure at error level with the typeId and the reason', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        outcome: 'error',
        status: 500,
        typeId: expect.stringMatching(ULID),
        reason: { name: 'Error', message: 'network down' },
      }),
    ]);
  });
});
