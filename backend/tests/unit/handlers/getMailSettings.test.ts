import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/getMailSettings';

// GET /mail/settings (docs/EMAIL_ARCHITECTURE.md section 9.1).
const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'GET /mail/settings';

function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return { routeKey: ROUTE, requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) } } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[]) => eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

let output: string[];
const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  vi.stubEnv('MAIL_STAGE', 'on');
  vi.stubEnv('MAIL_TABLE', 'mail');
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getMailSettings handler', () => {
  it('answers 200 with the defaults to the Administrator before the first save, and one log line', async () => {
    const response = await handler(caller('admin', ['admin']));
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ dailyEnabled: true, dailyHour: 7 });
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', requestId: 'req-1', route: ROUTE, username: 'admin', role: 'admin', outcome: 'ok', status: 200 })]);
  });

  it('answers the saved settings', async () => {
    ddb.on(GetCommand).resolves({ Item: { dailyEnabled: false, dailyHour: 20, updatedAt: 'x', updatedBy: 'admin' } });
    expect(body(await handler(caller('admin', ['admin'])))).toEqual({ dailyEnabled: false, dailyHour: 20 });
  });

  it.each([[['user']], [[]]])('answers 403 to groups %j, before the stage, reading nothing', async (groups) => {
    vi.stubEnv('MAIL_STAGE', 'off');
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith())).statusCode).toBe(401);
  });

  it.each(['off', 'domain', ''])('answers 503 mail_unavailable at the stage %j, reading nothing', async (stage) => {
    vi.stubEnv('MAIL_STAGE', stage);
    const response = await handler(caller('admin', ['admin']));
    expect(response.statusCode).toBe(503);
    expect(body(response)).toEqual({ error: 'mail_unavailable', message: 'E-mail is not available yet' });
    expect(ddb.calls()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'mail_unavailable' });
  });

  it('answers 500 without its table, or when DynamoDB fails', async () => {
    vi.stubEnv('MAIL_TABLE', '');
    expect(body(await handler(caller('admin', ['admin'])))).toEqual({ error: 'internal_error', message: 'Could not read the mail settings' });
    vi.stubEnv('MAIL_TABLE', 'mail');
    ddb.on(GetCommand).rejects(new Error('down'));
    const response = await handler(caller('admin', ['admin']));
    expect(response.statusCode).toBe(500);
    expect(logLines()[1]).toMatchObject({ level: 'error', outcome: 'error', reason: { name: 'Error', message: 'down' } });
  });
});
