import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/deleteAvailabilityType').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'DELETE /calendar/types/{typeId}';
// AC-28's day: Monday 2026-11-16, 10:30 in Europe/Rome.
const NOW = '2026-11-16T09:30:00.000Z';
const STUDIO = '01JC0000000000000000000001';
const UNKNOWN = '01JC0000000000000000000009';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/deleteAvailabilityType')).handler;
}

function eventWith(lambda: Record<string, string> | undefined, typeId: string | undefined) {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters: typeId === undefined ? undefined : { typeId },
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (username: string, groups: string[], typeId: string | undefined = STUDIO) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, typeId);
// `null`: no path parameter at all.
const asAdmin = (typeId: string | null = STUDIO) =>
  eventWith({ sub: 'sub-admin', username: 'admin', groups: '["admin"]' }, typeId ?? undefined);

const onPartition = (pk: string, items: object[]) =>
  ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': pk } }).resolves({ Items: items });
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
  ddb.on(QueryCommand).resolves({ Items: [] });
  onPartition('TYPE', [{ PK: 'TYPE', SK: STUDIO, name: 'Studio', nameKey: 'studio', createdAt: NOW, updatedAt: NOW }]);
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
const queryBound = (pk: string) =>
  ddb
    .commandCalls(QueryCommand)
    .map((call) => call.args[0].input)
    .find((q) => q.ExpressionAttributeValues![':pk'] === pk)!.ExpressionAttributeValues![':from'];

describe('deleteAvailabilityType handler', () => {
  it('deletes an unused type and answers 204 with no body', async () => {
    const response = await handler(asAdmin());
    expect(response).toEqual({ statusCode: 204 });
    expect(transactions()[0]!.TransactItems![1]).toEqual({ Delete: { TableName: 'calendar-test', Key: { PK: 'TYPE', SK: STUDIO } } });
  });

  it('reads from "today" in the calendar zone and from now − 24 h', async () => {
    await handler(asAdmin());
    expect(queryBound('OVERRIDE')).toBe('2026-11-16');
    expect(queryBound('WINDOW')).toBe('2026-11-16');
    expect(queryBound('APPT')).toBe('2026-11-15T09:30:00.000Z');
  });

  it('takes "today" as the local date after midnight in Rome, still the day before in UTC', async () => {
    vi.setSystemTime(new Date('2026-11-16T23:30:00.000Z'));
    await handler(asAdmin());
    expect(queryBound('OVERRIDE')).toBe('2026-11-17');
    expect(queryBound('APPT')).toBe('2026-11-15T23:30:00.000Z');
  });

  describe('answers 409 type_in_use and writes nothing (AC-28)', () => {
    it.each<[string, () => void]>([
      ['a weekly pattern', () => onPartition('PATTERN', [{ PK: 'PATTERN', SK: 'P1', typeId: STUDIO, validUntil: '2026-01-31' }])],
      ['an override dated today', () => onPartition('OVERRIDE', [{ PK: 'OVERRIDE', SK: '2026-11-16', windows: [{ typeId: STUDIO }] }])],
      ['a future one-off window', () => onPartition('WINDOW', [{ PK: 'WINDOW', SK: '2026-11-20#W1', date: '2026-11-20', typeId: STUDIO }])],
      [
        'a booked appointment not yet ended',
        () =>
          onPartition('APPT', [
            { PK: 'APPT', SK: '2026-11-16T09:00:00.000Z#A1', typeId: STUDIO, status: 'booked', end: '2026-11-16T10:00:00.000Z' },
          ]),
      ],
    ])('%s', async (_, given) => {
      given();
      const response = await handler(asAdmin());
      expect(response.statusCode).toBe(409);
      expect(body(response)).toEqual({
        error: 'type_in_use',
        message: 'The type is still used by availability or by appointments that have not ended',
      });
      expect(transactions()).toHaveLength(0);
    });
  });

  describe('answers 204 when only the past refers to the type', () => {
    it.each<[string, () => void]>([
      // These would not be returned by the bounded queries; the rule ignores them anyway.
      ['yesterday’s override', () => onPartition('OVERRIDE', [{ PK: 'OVERRIDE', SK: '2026-11-15', windows: [{ typeId: STUDIO }] }])],
      [
        'an appointment that has ended',
        () => onPartition('APPT', [{ PK: 'APPT', SK: 'x#A1', typeId: STUDIO, status: 'booked', end: '2026-11-16T09:00:00.000Z' }]),
      ],
      [
        'a cancelled future appointment',
        () => onPartition('APPT', [{ PK: 'APPT', SK: 'x#A2', typeId: STUDIO, status: 'cancelled', end: '2026-11-20T09:00:00.000Z' }]),
      ],
    ])('%s', async (_, given) => {
      given();
      expect((await handler(asAdmin())).statusCode).toBe(204);
    });
  });

  it('answers 404 type_not_found for an unknown id', async () => {
    const response = await handler(asAdmin(UNKNOWN));
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'type_not_found', message: 'No availability type with this id' });
    expect(transactions()).toHaveLength(0);
  });

  it.each([
    { name: 'a lower-case id', typeId: STUDIO.toLowerCase() },
    { name: 'an id of 27 characters', typeId: `${STUDIO}0` },
    { name: 'no id', typeId: null },
  ])('answers 400 invalid_request and touches nothing for $name', async ({ typeId }) => {
    const response = await handler(asAdmin(typeId));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: typeId' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(undefined, STUDIO))).statusCode).toBe(401);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toBe('concurrent_update');
    expect(transactions()).toHaveLength(3);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(QueryCommand).rejects(new Error('secret detail'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not delete the type' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(asCaller('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(body(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('deleteAvailabilityType handler logging', () => {
  it('writes one info line with the typeId and the lock attempts', async () => {
    await handler(asAdmin());
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
        outcome: 'deleted',
        status: 204,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs an unknown id as not_found and a type in use as conflict', async () => {
    await handler(asAdmin(UNKNOWN));
    onPartition('PATTERN', [{ PK: 'PATTERN', SK: 'P1', typeId: STUDIO }]);
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'not_found', status: 404, typeId: UNKNOWN }),
      expect.objectContaining({ outcome: 'conflict', status: 409, typeId: STUDIO }),
    ]);
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
