import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/renameAvailabilityType').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'PUT /calendar/types/{typeId}';
const NOW = '2026-11-12T09:30:00.000Z';
const EARLIER = '2026-11-01T08:00:00.000Z';
const STUDIO = '01JC0000000000000000000001';
const POOL = '01JC0000000000000000000002';
const UNKNOWN = '01JC0000000000000000000009';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/renameAvailabilityType')).handler;
}

function eventWith(lambda: Record<string, string> | undefined, typeId: string | undefined, body?: string) {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters: typeId === undefined ? undefined : { typeId },
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (username: string, groups: string[], typeId: string | undefined, body?: string) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, typeId, body);
// `null`: no path parameter at all.
const asAdmin = (typeId: string | null = STUDIO, body = JSON.stringify({ name: ' Gym ' })) =>
  asCaller('admin', ['admin'], typeId ?? undefined, body);

const typeItem = (typeId: string, name: string) => ({
  PK: 'TYPE',
  SK: typeId,
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
  ddb.on(QueryCommand).resolves({ Items: [typeItem(STUDIO, 'Studio'), typeItem(POOL, 'Pool')] });
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

// Test names: R-… rules, AC-… scenarios and section numbers are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).
describe('renameAvailabilityType handler', () => {
  it('renames the type, keeps createdAt, sets updatedAt to "now", and answers 200', async () => {
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ typeId: STUDIO, name: 'Gym', capacity: 1, createdAt: EARLIER, updatedAt: NOW });
    expect(transactions()[0]!.TransactItems![1]).toEqual({
      Put: {
        TableName: 'calendar-test',
        Item: { PK: 'TYPE', SK: STUDIO, name: 'Gym', nameKey: 'gym', createdAt: EARLIER, updatedAt: NOW },
      },
    });
  });

  it('edits the capacity, also lowered, and keeps the stored one when the body has none (R-TYPE-05, 11.4, AC-44)', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ ...typeItem(STUDIO, 'Studio'), capacity: 3 }] });
    const kept = await handler(asAdmin(STUDIO, JSON.stringify({ name: 'Studio' })));
    expect(body(kept)).toMatchObject({ name: 'Studio', capacity: 3 });
    const lowered = await handler(asAdmin(STUDIO, JSON.stringify({ name: 'Studio', capacity: 1 })));
    expect(lowered.statusCode).toBe(200);
    expect(body(lowered)).toMatchObject({ capacity: 1 });
    expect(transactions().map((t) => t.TransactItems![1]!.Put!.Item!.capacity)).toEqual([3, 1]);
  });

  it('answers 400 for a capacity out of range, and touches nothing', async () => {
    const response = await handler(asAdmin(STUDIO, JSON.stringify({ name: 'Gym', capacity: 0 })));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: capacity' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each(['Studio', 'STUDIO', 'studio'])('allows keeping its own name, also in another case (%s)', async (name) => {
    const response = await handler(asAdmin(STUDIO, JSON.stringify({ name })));
    expect(response.statusCode).toBe(200);
    expect(body(response).name).toBe(name);
  });

  it('answers 409 type_name_exists for another type’s name, in any case', async () => {
    const response = await handler(asAdmin(STUDIO, JSON.stringify({ name: 'POOL' })));
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'type_name_exists', message: 'A type with this name already exists' });
    expect(transactions()).toHaveLength(0);
  });

  it('answers 404 type_not_found for an unknown id', async () => {
    const response = await handler(asAdmin(UNKNOWN));
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'type_not_found', message: 'No availability type with this id' });
    expect(transactions()).toHaveLength(0);
  });

  it.each([
    { name: 'a lower-case id', typeId: STUDIO.toLowerCase() },
    { name: 'a short id', typeId: 'ABC' },
    { name: 'an id with U (not Crockford)', typeId: '01JC000000000000000000000U' },
    { name: 'no id', typeId: null },
  ])('answers 400 invalid_request on typeId and touches nothing for $name', async ({ typeId }) => {
    const response = await handler(asAdmin(typeId));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: typeId' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'malformed JSON', raw: '{', code: 'invalid_json', fields: undefined },
    { name: 'an unknown field (.strict())', raw: JSON.stringify({ name: 'Gym', typeId: POOL }), code: 'invalid_request', fields: 'typeId' },
    { name: 'a blank name', raw: JSON.stringify({ name: '' }), code: 'invalid_request', fields: 'name' },
  ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
    const response = await handler(asCaller('admin', ['admin'], STUDIO, raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    if (fields) expect(body(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups, STUDIO, JSON.stringify({ name: 'Gym' })));
    expect(response.statusCode).toBe(403);
    expect(body(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(undefined, STUDIO, JSON.stringify({ name: 'Gym' })))).statusCode).toBe(401);
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
    ddb.on(QueryCommand).rejects(new Error('secret detail'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not rename the type' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(asCaller('alice', groups, STUDIO, JSON.stringify({ name: 'Gym' })));
    expect(response.statusCode).toBe(500);
    expect(body(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('renameAvailabilityType handler logging', () => {
  it('writes one info line with the typeId and the lock attempts, never the name', async () => {
    await handler(asAdmin(STUDIO, JSON.stringify({ name: 'Secret-Name' })));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        typeId: STUDIO,
        lockAttempts: 1,
        outcome: 'updated',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toMatch(/secret-name/i);
  });

  it('logs an unknown id as not_found and a taken name as conflict', async () => {
    await handler(asAdmin(UNKNOWN));
    await handler(asAdmin(STUDIO, JSON.stringify({ name: 'pool' })));
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'not_found', status: 404, typeId: UNKNOWN, lockAttempts: 1 }),
      expect.objectContaining({ outcome: 'conflict', status: 409, typeId: STUDIO, lockAttempts: 1 }),
    ]);
  });

  it('logs a rejected body with the typeId, without echoing the body', async () => {
    await handler(asAdmin(STUDIO, JSON.stringify({ name: 'Gym', secretField: 'do-not-log-me' })));
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400, typeId: STUDIO })]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('logs a busy lock with 3 attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    await pending;
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, typeId: STUDIO, lockAttempts: 3 })]);
  });

  it('logs a DynamoDB failure at error level with the reason', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', status: 500, typeId: STUDIO, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
