import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { ALICE_11, BOB_09, NOW, PATTERNS, POOL, STUDIO, specExample } from '../lib/calendarView.fixtures';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/getCalendar').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'GET /calendar';
const EARLIER = '2026-11-02T08:00:00.000Z';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/getCalendar')).handler;
}

function eventWith(lambda: Record<string, string> | undefined, query: Record<string, string | undefined> | undefined): APIGatewayProxyEventV2 {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    queryStringParameters: query,
  } as unknown as APIGatewayProxyEventV2;
}
const DAY = { from: '2026-11-16', to: '2026-11-16' };
// `query` null: the request has no query string at all.
const caller = (username: string, groups: string[], query: Record<string, string | undefined> | null = DAY) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, query ?? undefined);

// The 11.6 example as stored: the items calendarDb maps back into the view's input.
const { appointment: a } = ALICE_11;
const apptItem = ({ userId, appointment }: typeof ALICE_11) => {
  const { appointmentId, typeName, ...fields } = appointment;
  return { PK: 'APPT', SK: `${appointment.start}#${appointmentId}`, userId, ...fields, typeNameAtBooking: typeName, version: 1 };
};
const items = {
  TYPE: [
    { PK: 'TYPE', SK: STUDIO, name: 'Studio', nameKey: 'studio', createdAt: EARLIER, updatedAt: EARLIER },
    { PK: 'TYPE', SK: POOL, name: 'Swimming Pool', nameKey: 'swimming pool', createdAt: EARLIER, updatedAt: EARLIER },
  ],
  PATTERN: PATTERNS.map(({ patternId, ...p }) => ({ PK: 'PATTERN', SK: patternId, ...p, createdAt: EARLIER, updatedAt: EARLIER })),
  APPT: [apptItem(BOB_09), apptItem(ALICE_11)],
};

let output: string[];
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  for (const [pk, list] of Object.entries(items)) ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': pk } }).resolves({ Items: list });
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

describe('getCalendar handler', () => {
  it('answers alice the 11.6 example byte for byte', async () => {
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(response.body).toBe(specExample());
  });

  it.each([[['admin']], [['user', 'admin']]])('answers the Administrator (groups %j) every appointment with its username, sources and hasOverride', async (groups) => {
    const response = await handler(caller('admin', groups));
    expect(response.statusCode).toBe(200);
    const view = body(response) as { days: { hasOverride: boolean; busy: unknown[]; windows: { source: string }[] }[]; appointments: { username: string; cancellableUntil: null }[] };
    expect(view.days[0]!.hasOverride).toBe(false);
    expect(view.days[0]!.busy).toEqual([]);
    expect(view.days[0]!.windows.map((w) => w.source)).toEqual(['pattern', 'pattern']);
    expect(view.appointments.map((x) => [x.username, x.cancellableUntil])).toEqual([
      ['bob', null],
      ['alice', null],
    ]);
  });

  it('reads with consistent queries only, and writes nothing', async () => {
    await handler(caller('alice', ['user']));
    expect(ddb.commandCalls(QueryCommand).every((call) => call.args[0].input.ConsistentRead === true)).toBe(true);
    expect(ddb.commandCalls(GetCommand).map((call) => call.args[0].input.Key)).toEqual([{ PK: 'SETTINGS', SK: 'SETTINGS' }]);
    expect(ddb.calls().every((call) => ['GetCommand', 'QueryCommand'].includes(call.args[0].constructor.name))).toBe(true);
  });

  it.each([[[]], [['other']]])('answers 403 and reads nothing for groups %j', async (groups) => {
    const response = await handler(caller('mallory', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, DAY));
    expect(response.statusCode).toBe(401);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'AC-33: a span of more than 31 days', query: { from: '2026-11-01', to: '2026-12-15' }, field: 'to' },
    { name: 'from after to', query: { from: '2026-11-17', to: '2026-11-16' }, field: 'to' },
    { name: 'an invalid date', query: { from: '2026-02-30', to: '2026-03-01' }, field: 'from' },
    { name: 'a missing to', query: { from: '2026-11-16' }, field: 'to' },
    { name: 'no query string', query: null, field: 'from, to' },
    { name: 'an unknown parameter', query: { ...DAY, username: 'bob' }, field: 'username' },
    { name: 'a repeated parameter (joined with a comma)', query: { from: '2026-11-16,2026-11-17', to: '2026-11-17' }, field: 'from' },
  ])('answers 400 invalid_request for $name, to both roles, and reads nothing', async ({ query, field }) => {
    for (const groups of [['user'], ['admin']]) {
      ddb.resetHistory();
      const response = await handler(caller('alice', groups, query));
      expect(response.statusCode).toBe(400);
      expect(body(response)).toEqual({ error: 'invalid_request', message: `Invalid input: ${field}` });
      expect(ddb.calls()).toHaveLength(0);
    }
  });

  it('accepts exactly 31 days', async () => {
    const response = await handler(caller('alice', ['user'], { from: '2026-11-01', to: '2026-12-01' }));
    expect(response.statusCode).toBe(200);
    expect((body(response).days as unknown[]).length).toBe(31);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(QueryCommand).rejects(new Error('secret detail'));
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not read the calendar' });
  });

  it.each([[['admin']], [['user']], [[]]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('getCalendar handler logging', () => {
  it.each([[['user']], [['admin']]])('writes one info line with from and to, and no appointment data (groups %j)', async (groups) => {
    await handler(caller('alice', groups, { from: '2026-11-16', to: '2026-11-22' }));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'alice',
        role: groups[0],
        from: '2026-11-16',
        to: '2026-11-22',
        outcome: 'ok',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
    const log = output.join('');
    for (const secret of ['bob', 'First lesson', 'bob secret note', a.appointmentId, BOB_09.appointment.appointmentId, 'Studio', 'sub-']) {
      expect(log).not.toContain(secret);
    }
  });

  it('never sends a User another User’s username, appointment id or note', async () => {
    const response = await handler(caller('alice', ['user']));
    for (const secret of ['bob', 'bob secret note', BOB_09.appointment.appointmentId, 'sub-', 'typeNameAtBooking', 'version']) {
      expect(response.body).not.toContain(secret);
    }
  });

  it('logs a refused query without the parameters’ values beyond from and to', async () => {
    await handler(caller('alice', ['user'], { from: '2026-11-16', to: '2026-11-16', note: 'xyz' }));
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', outcome: 'invalid_request', status: 400 })]);
    expect(output.join('')).not.toContain('xyz');
  });

  it('logs a failure at error level with the reason, from and to', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', outcome: 'error', status: 500, ...DAY, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
