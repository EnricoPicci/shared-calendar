import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/getCalendarSettings').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'GET /calendar/settings';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/getCalendarSettings')).handler;
}

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
  } as unknown as APIGatewayProxyEventV2;
}

const caller = (username: string, groups: string[]) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

const DEFAULTS = {
  timeZone: 'Europe/Rome',
  cancellationNoticeHours: 24,
  minBookingNoticeHours: 0,
  bookingHorizonDays: 56,
  maxFutureAppointmentsPerUser: null,
  updatedAt: null,
  updatedBy: null,
};

let output: string[];
beforeEach(async () => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  handler = await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<Handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('getCalendarSettings handler', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
    { groups: ['user', 'admin'], role: 'admin' },
  ])('answers 200 with the defaults to $role (groups $groups) before the first save (AC-01)', async ({ groups }) => {
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(body(response)).toEqual(DEFAULTS);
  });

  it('answers the saved settings', async () => {
    const saved = {
      cancellationNoticeHours: 48,
      minBookingNoticeHours: 2,
      bookingHorizonDays: 30,
      maxFutureAppointmentsPerUser: 3,
      updatedAt: '2026-11-12T09:30:00.000Z',
      updatedBy: { username: 'admin', role: 'admin' },
    };
    ddb.on(GetCommand).resolves({ Item: { PK: 'SETTINGS', SK: 'SETTINGS', ...saved } });
    expect(body(await handler(caller('alice', ['user'])))).toEqual({ timeZone: 'Europe/Rome', ...saved });
  });

  it('answers the zone of the configuration', async () => {
    handler = await load('Asia/Kathmandu');
    expect(body(await handler(caller('alice', ['user']))).timeZone).toBe('Asia/Kathmandu');
  });

  it.each([[[]], [['other']]])('answers 403 and reads nothing for groups %j', async (groups) => {
    const response = await handler(caller('mallory', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 and reads nothing without an authorizer context', async () => {
    const response = await handler(eventWith());
    expect(response.statusCode).toBe(401);
    expect(body(response).error).toBe('unauthorized');
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [['admin']], [[]]])(
    'answers 500 to every caller (groups %j) when the time zone is invalid (R-TIME-01)',
    async (groups) => {
      handler = await load('Not/AZone');
      const response = await handler(caller('alice', groups));
      expect(response.statusCode).toBe(500);
      expect(body(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
      expect(ddb.calls()).toHaveLength(0);
    },
  );

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(GetCommand).rejects(new Error('ProvisionedThroughputExceededException: secret detail'));
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not read the settings' });
  });
});

describe('getCalendarSettings handler logging', () => {
  it('writes one info line without the body', async () => {
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'alice',
        role: 'user',
        outcome: 'ok',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs a forbidden call with a null role', async () => {
    await handler(caller('mallory', []));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', username: 'mallory', role: null, outcome: 'forbidden', status: 403 }),
    ]);
  });

  it('logs an unauthorized call without a username', async () => {
    await handler(eventWith());
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'info', outcome: 'unauthorized', status: 401 }));
    expect(line).not.toHaveProperty('username');
  });

  it('logs an invalid time zone at error level with the reason', async () => {
    handler = await load('Not/AZone');
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        username: 'alice',
        outcome: 'error',
        status: 500,
        reason: { name: 'CalendarConfigError', message: 'CALENDAR_TIME_ZONE is not a valid time zone: "Not/AZone"' },
      }),
    ]);
  });

  it('logs a DynamoDB failure at error level with the reason', async () => {
    ddb.on(GetCommand).rejects(new Error('network down'));
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
