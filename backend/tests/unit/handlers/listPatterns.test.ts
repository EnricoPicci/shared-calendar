import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/listPatterns').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'GET /calendar/patterns';
const AT = '2026-11-01T08:00:00.000Z';
const STUDIO = '01JC0000000000000000000001';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/listPatterns')).handler;
}

function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
  } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[]) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

const item = (patternId: string, weekday: number, start: string, end: string) => ({
  PK: 'PATTERN',
  SK: patternId,
  weekday,
  start,
  end,
  typeId: STUDIO,
  validFrom: '2026-11-01',
  validUntil: null,
  createdAt: AT,
  updatedAt: AT,
});

let output: string[];
beforeEach(async () => {
  ddb.reset();
  ddb.on(QueryCommand).resolves({
    Items: [
      item('01JC00000000000000000000P1', 2, '09:00', '10:00'),
      item('01JC00000000000000000000P2', 1, '12:00', '13:00'),
      item('01JC00000000000000000000P3', 1, '08:00', '12:00'),
    ],
  });
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

describe('listPatterns handler', () => {
  it.each([[['admin']], [['user', 'admin']]])('answers 200 with every pattern by weekday, then start, to groups %j', async (groups) => {
    const response = await handler(caller('admin', groups));
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const patterns = body(response).patterns as { patternId: string }[];
    expect(patterns.map((p) => p.patternId)).toEqual(['01JC00000000000000000000P3', '01JC00000000000000000000P2', '01JC00000000000000000000P1']);
    expect(patterns[0]).toEqual({
      patternId: '01JC00000000000000000000P3',
      weekday: 1,
      start: '08:00',
      end: '12:00',
      typeId: STUDIO,
      validFrom: '2026-11-01',
      validUntil: null,
      createdAt: AT,
      updatedAt: AT,
    });
  });

  it.each([[['user']], [[]], [['other']]])('answers 403 and reads nothing for groups %j: patterns are the Administrator’s', async (groups) => {
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith())).statusCode).toBe(401);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(QueryCommand).rejects(new Error('secret detail'));
    const response = await handler(caller('admin', ['admin']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not read the patterns' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('listPatterns handler logging', () => {
  it('writes one info line without the patterns', async () => {
    await handler(caller('admin', ['admin']));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        outcome: 'ok',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
    // Quoted, as a window time would be logged as a JSON value: the line's own timestamp holds
    // the clock time unquoted, so the check cannot fail on the minute it happens to run.
    expect(output.join('')).not.toContain('"12:00"');
  });

  it('logs a failure at error level with the reason', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await handler(caller('admin', ['admin']));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
