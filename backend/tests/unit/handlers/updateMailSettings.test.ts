import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/updateMailSettings';

// PUT /mail/settings (docs/EMAIL_ARCHITECTURE.md section 9.1).
const ddb = mockClient(DynamoDBDocumentClient);
const ROUTE = 'PUT /mail/settings';

function eventWith(lambda: Record<string, string> | undefined, rawBody?: string): APIGatewayProxyEventV2 {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    ...(rawBody !== undefined && { body: rawBody }),
  } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[], value: unknown = { dailyEnabled: false, dailyHour: 18 }) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, JSON.stringify(value));

let output: string[];
const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;

beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
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

describe('updateMailSettings handler', () => {
  it('saves both values with the username and answers 200 with them, and one log line', async () => {
    const response = await handler(caller('admin', ['admin']));
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ dailyEnabled: false, dailyHour: 18 });
    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input.Item).toMatchObject({ PK: 'SETTINGS', SK: 'SETTINGS', dailyEnabled: false, dailyHour: 18, updatedBy: 'admin' });
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', route: ROUTE, username: 'admin', role: 'admin', outcome: 'updated', status: 200, dailyEnabled: false, dailyHour: 18 }),
    ]);
  });

  it.each([
    [{ dailyEnabled: true, dailyHour: 24 }, 'dailyHour'],
    [{ dailyEnabled: true, dailyHour: 6.5 }, 'dailyHour'],
    [{ dailyEnabled: 'yes', dailyHour: 6 }, 'dailyEnabled'],
    [{ dailyEnabled: true, dailyHour: 6, to: 'x@example.com' }, 'to'],
  ])('answers 400 for %j, writing nothing', async (value, field) => {
    const response = await handler(caller('admin', ['admin'], value));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: `Invalid input: ${field}` });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 400 invalid_json for a body that is not JSON', async () => {
    const response = await handler(eventWith({ sub: 's', username: 'admin', groups: '["admin"]' }, '{'));
    expect(response.statusCode).toBe(400);
  });

  it('answers 403 to a User before the stage and the body, writing nothing', async () => {
    vi.stubEnv('MAIL_STAGE', 'off');
    const response = await handler(caller('alice', ['user'], 'not even a body'));
    expect(response.statusCode).toBe(403);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(undefined, '{}'))).statusCode).toBe(401);
  });

  it('answers 503 mail_unavailable at a stage other than on, before the body', async () => {
    vi.stubEnv('MAIL_STAGE', 'domain');
    const response = await handler(caller('admin', ['admin'], { dailyHour: 99 }));
    expect(response.statusCode).toBe(503);
    expect(body(response)).toEqual({ error: 'mail_unavailable', message: 'E-mail is not available yet' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 500 without its table, or when DynamoDB fails', async () => {
    vi.stubEnv('MAIL_TABLE', '');
    expect(body(await handler(caller('admin', ['admin'])))).toEqual({ error: 'internal_error', message: 'E-mail is not configured' });
    vi.stubEnv('MAIL_TABLE', 'mail');
    ddb.on(PutCommand).rejects(new Error('down'));
    expect(body(await handler(caller('admin', ['admin'])))).toEqual({ error: 'internal_error', message: 'Could not save the mail settings' });
  });
});
