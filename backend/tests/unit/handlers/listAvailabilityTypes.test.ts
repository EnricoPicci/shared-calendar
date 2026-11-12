import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/listAvailabilityTypes').handler;
let handler: Handler;

const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'GET /calendar/types';
const AT = '2026-11-01T08:00:00.000Z';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/listAvailabilityTypes')).handler;
}

function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
  } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[]) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

const item = (typeId: string, name: string) => ({ PK: 'TYPE', SK: typeId, name, nameKey: name.toLowerCase(), createdAt: AT, updatedAt: AT });

let output: string[];
beforeEach(async () => {
  ddb.reset();
  ddb.on(QueryCommand).resolves({
    Items: [item('01JC0000000000000000000001', 'Studio'), item('01JC0000000000000000000002', 'alpha'), item('01JC0000000000000000000003', 'Beta')],
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

describe('listAvailabilityTypes handler', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
    { groups: ['user', 'admin'], role: 'admin' },
  ])('answers 200 with every type sorted by name, case-insensitively, to $role (groups $groups)', async ({ groups }) => {
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(body(response)).toEqual({
      types: [
        { typeId: '01JC0000000000000000000002', name: 'alpha', createdAt: AT, updatedAt: AT },
        { typeId: '01JC0000000000000000000003', name: 'Beta', createdAt: AT, updatedAt: AT },
        { typeId: '01JC0000000000000000000001', name: 'Studio', createdAt: AT, updatedAt: AT },
      ],
    });
  });

  it('answers an empty list when there is no type', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    expect(body(await handler(caller('alice', ['user'])))).toEqual({ types: [] });
  });

  it.each([[[]], [['other']]])('answers 403 and reads nothing for groups %j', async (groups) => {
    const response = await handler(caller('mallory', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    const response = await handler(eventWith());
    expect(response.statusCode).toBe(401);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(QueryCommand).rejects(new Error('secret detail'));
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not read the types' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('listAvailabilityTypes handler logging', () => {
  it('writes one info line without the types', async () => {
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
    expect(output.join('')).not.toContain('Studio');
  });

  it('logs a failure at error level with the reason', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
