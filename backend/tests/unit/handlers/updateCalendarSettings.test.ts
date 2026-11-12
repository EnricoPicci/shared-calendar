import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/updateCalendarSettings').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'PUT /calendar/settings';
const NOW = '2026-11-12T09:30:00.000Z';
const VALUES = { cancellationNoticeHours: 48, minBookingNoticeHours: 2, bookingHorizonDays: 30, maxFutureAppointmentsPerUser: 3 };

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/updateCalendarSettings')).handler;
}

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda: Record<string, string> | undefined, body?: string, isBase64Encoded = false) {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    body,
    isBase64Encoded,
  } as unknown as APIGatewayProxyEventV2;
}

const asCaller = (username: string, groups: string[], body?: string) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, body);
const asAdmin = (body = JSON.stringify(VALUES)) => asCaller('admin', ['admin'], body);

const lockBusy = () =>
  new TransactionCanceledException({
    message: 'Transaction cancelled, please refer cancellation reasons for specific reasons [ConditionalCheckFailed, None]',
    $metadata: {},
    CancellationReasons: [{ Code: 'ConditionalCheckFailed', Message: 'The conditional request failed' }, { Code: 'None' }],
  });

let output: string[];
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  ddb.reset();
  ddb.on(GetCommand).resolves({});
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
const transactions = () => ddb.commandCalls(TransactWriteCommand);

describe('updateCalendarSettings handler', () => {
  it('saves the four values with "now" and the caller, and answers what it saved', async () => {
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const expected = { ...VALUES, updatedAt: NOW, updatedBy: { username: 'admin', role: 'admin' } };
    expect(body(response)).toEqual({ timeZone: 'Europe/Rome', ...expected });
    expect(transactions()).toHaveLength(1);
    expect(transactions()[0]!.args[0].input.TransactItems![1]).toEqual({
      Put: { TableName: 'calendar-test', Item: { PK: 'SETTINGS', SK: 'SETTINGS', ...expected } },
    });
  });

  it('records an admin who is also in user as the Administrator', async () => {
    const response = await handler(asCaller('admin', ['user', 'admin'], JSON.stringify(VALUES)));
    expect(body(response).updatedBy).toEqual({ username: 'admin', role: 'admin' });
  });

  it('accepts null as an unlimited appointment count, and a base64-encoded body', async () => {
    const raw = Buffer.from(JSON.stringify({ ...VALUES, maxFutureAppointmentsPerUser: null })).toString('base64');
    const response = await handler(
      eventWith({ sub: 'sub-admin', username: 'admin', groups: '["admin"]' }, raw, true),
    );
    expect(response.statusCode).toBe(200);
    expect(body(response).maxFutureAppointmentsPerUser).toBeNull();
  });

  it.each([[['user']], [[]], [['other']]])('answers 403 and writes nothing for groups %j (AC-02)', async (groups) => {
    const response = await handler(asCaller('alice', groups, JSON.stringify(VALUES)));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 and writes nothing without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, JSON.stringify(VALUES)));
    expect(response.statusCode).toBe(401);
    expect(body(response).error).toBe('unauthorized');
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'malformed JSON', raw: '{"cancellationNoticeHours":', code: 'invalid_json', fields: undefined },
    { name: 'a JSON array', raw: '[]', code: 'invalid_request', fields: '(root)' },
    {
      name: 'an unknown field',
      raw: JSON.stringify({ ...VALUES, timeZone: 'Asia/Tokyo' }),
      code: 'invalid_request',
      fields: 'timeZone',
    },
    {
      name: 'a missing field',
      raw: JSON.stringify({ ...VALUES, bookingHorizonDays: undefined }),
      code: 'invalid_request',
      fields: 'bookingHorizonDays',
    },
    {
      name: 'a value above its range',
      raw: JSON.stringify({ ...VALUES, cancellationNoticeHours: 721 }),
      code: 'invalid_request',
      fields: 'cancellationNoticeHours',
    },
    {
      name: 'a value below its range',
      raw: JSON.stringify({ ...VALUES, bookingHorizonDays: 0 }),
      code: 'invalid_request',
      fields: 'bookingHorizonDays',
    },
    {
      name: 'a limit of 0 instead of null',
      raw: JSON.stringify({ ...VALUES, maxFutureAppointmentsPerUser: 0 }),
      code: 'invalid_request',
      fields: 'maxFutureAppointmentsPerUser',
    },
    {
      name: 'a fractional value',
      raw: JSON.stringify({ ...VALUES, minBookingNoticeHours: 1.5 }),
      code: 'invalid_request',
      fields: 'minBookingNoticeHours',
    },
  ])('answers 400 $code and writes nothing for $name', async ({ raw, code, fields }) => {
    // asCaller rather than asAdmin, whose default body would replace an undefined one.
    const response = await handler(asCaller('admin', ['admin'], raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    if (fields) expect(body(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
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
    ddb.on(TransactWriteCommand).rejects(new Error('ProvisionedThroughputExceededException: secret detail'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not save the settings' });
  });

  it.each([[['admin']], [['user']]])(
    'answers 500 to every caller (groups %j) when the time zone is invalid (R-TIME-01)',
    async (groups) => {
      handler = await load('Not/AZone');
      const response = await handler(asCaller('alice', groups, JSON.stringify(VALUES)));
      expect(response.statusCode).toBe(500);
      expect(body(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
      expect(ddb.calls()).toHaveLength(0);
    },
  );
});

describe('updateCalendarSettings handler logging', () => {
  it('writes one info line with the lock attempts and without the body', async () => {
    await handler(asAdmin());
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        outcome: 'updated',
        status: 200,
        lockAttempts: 1,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('counts the attempts when the lock was busy before succeeding', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).rejectsOnce(lockBusy()).resolves({});
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    expect((await pending).statusCode).toBe(200);
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'updated', status: 200, lockAttempts: 3 })]);
  });

  it('logs a busy lock as a conflict with 3 attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    await pending;
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', username: 'admin', outcome: 'conflict', status: 409, lockAttempts: 3 }),
    ]);
  });

  it('logs a forbidden call with the caller', async () => {
    await handler(asCaller('alice', ['user'], JSON.stringify(VALUES)));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', username: 'alice', role: 'user', outcome: 'forbidden', status: 403 }),
    ]);
  });

  it('logs a rejected body without echoing it', async () => {
    await handler(asAdmin(JSON.stringify({ ...VALUES, secretField: 'do-not-log-me' })));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', username: 'admin', outcome: 'invalid_request', status: 400 }),
    ]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('never logs the saved values', async () => {
    await handler(asAdmin(JSON.stringify({ ...VALUES, bookingHorizonDays: 321 })));
    expect(output.join('')).not.toContain('321');
    expect(output.join('')).not.toContain('bookingHorizonDays');
  });

  it('logs a DynamoDB failure at error level with the reason', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });

  it('logs an invalid time zone at error level with the reason', async () => {
    handler = await load('Not/AZone');
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        outcome: 'error',
        status: 500,
        reason: { name: 'CalendarConfigError', message: 'CALENDAR_TIME_ZONE is not a valid time zone: "Not/AZone"' },
      }),
    ]);
  });
});
