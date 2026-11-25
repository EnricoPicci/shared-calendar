import { AdminGetUserCommand, CognitoIdentityProviderClient, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/sendCalendarMail';

// POST /mail/calendar (docs/EMAIL_ARCHITECTURE.md sections 6.5 and 9.1). Now is 2026-11-25T23:30Z,
// already 2026-11-26 in Europe/Rome: the counter counts the local day.
const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBDocumentClient);
const lambda = mockClient(LambdaClient);
const NOW = '2026-11-25T23:30:00.000Z';
const RANGE = { from: '2026-12-01', to: '2026-12-07' };

function eventWith(lambdaContext: Record<string, string> | undefined, body?: string): APIGatewayProxyEventV2 {
  return {
    routeKey: 'POST /mail/calendar',
    requestContext: { requestId: 'req-1', ...(lambdaContext && { authorizer: { lambda: lambdaContext } }) },
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (username: string, groups: string[], body: unknown = RANGE) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, typeof body === 'string' ? body : JSON.stringify(body));
const withAddress = (email: string | null) => ({ UserCreateDate: new Date(), UserAttributes: email === null ? [] : [{ Name: 'email', Value: email }] });
const bodyOf = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
const startedWith = () => JSON.parse(new TextDecoder().decode(lambda.commandCalls(InvokeCommand)[0]!.args[0].input.Payload as Uint8Array)) as Record<string, unknown>;

let output: string[];
const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  cognito.reset();
  ddb.reset();
  lambda.reset();
  cognito.on(AdminGetUserCommand).resolves(withAddress('anna@example.com'));
  ddb.on(UpdateCommand).resolves({});
  lambda.on(InvokeCommand).resolves({ StatusCode: 202 });
  vi.stubEnv('MAIL_STAGE', 'on');
  vi.stubEnv('MAIL_TABLE', 'mail');
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.stubEnv('USER_POOL_ID', 'eu-west-1_TEST');
  vi.stubEnv('MAILER_FUNCTION', 'mailer');
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendCalendarMail handler', () => {
  it('a User: counted on the local day, the mailer started for their own appointments, 202 queued', async () => {
    const response = await handler(asCaller('alice', ['user']));

    expect(response.statusCode).toBe(202);
    expect(bodyOf(response)).toEqual({ status: 'queued' });
    expect(ddb.commandCalls(UpdateCommand)[0]!.args[0].input.Key).toEqual({ PK: 'QUOTA#sub-alice', SK: '2026-11-26' });
    expect(startedWith()).toEqual({ kind: 'mine', sub: 'sub-alice', username: 'alice', role: 'user', ...RANGE, requestId: 'req-1' });
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', route: 'POST /mail/calendar', username: 'alice', role: 'user', kind: 'mine', ...RANGE, outcome: 'queued', status: 202 })]);
    expect(output.join('')).not.toContain('anna@example.com');
  });

  it('the Administrator, admin winning over user, gets the whole calendar: the role decides, never the body', async () => {
    expect((await handler(asCaller('admin', ['user', 'admin']))).statusCode).toBe(202);
    expect(startedWith()).toMatchObject({ kind: 'calendar', role: 'admin', username: 'admin' });
    expect((await handler(asCaller('alice', ['user'], { ...RANGE, kind: 'calendar' }))).statusCode).toBe(400);
  });

  it('401 without an identity, 403 for a token in neither group, with nothing read', async () => {
    expect((await handler(eventWith(undefined))).statusCode).toBe(401);
    const response = await handler(asCaller('eve', []));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error).toBe('forbidden');
    expect([...cognito.calls(), ...ddb.calls(), ...lambda.calls()]).toHaveLength(0);
  });

  it('503 mail_unavailable unless the stage is on, before the body, the address or the count', async () => {
    for (const stage of ['off', 'domain', '']) {
      vi.stubEnv('MAIL_STAGE', stage);
      const response = await handler(asCaller('alice', ['user'], 'not json'));
      expect(response.statusCode).toBe(503);
      expect(bodyOf(response)).toEqual({ error: 'mail_unavailable', message: 'E-mail is not available yet' });
    }
    expect([...cognito.calls(), ...ddb.calls(), ...lambda.calls()]).toHaveLength(0);
  });

  it('500 when the mail table or the time zone is missing', async () => {
    vi.stubEnv('MAIL_TABLE', '');
    const response = await handler(asCaller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'E-mail is not configured' });
    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'error' });
  });

  it('400 for a body that is not JSON, or not a range of at most 366 days, with nothing read', async () => {
    expect(bodyOf(await handler(asCaller('alice', ['user'], 'not json'))).error).toBe('invalid_json');
    const tooLong = await handler(asCaller('alice', ['user'], { from: '2026-12-01', to: '2027-12-02' }));
    expect(tooLong.statusCode).toBe(400);
    expect(bodyOf(tooLong)).toEqual({ error: 'invalid_request', message: 'Invalid input: to' });
    expect((await handler(asCaller('alice', ['user'], { from: '2026-12-01', to: '2027-12-01' }))).statusCode).toBe(202);
    expect((await handler(asCaller('alice', ['user'], { from: '2026-12-08', to: '2026-12-01' }))).statusCode).toBe(400);
    expect(cognito.calls()).toHaveLength(1);
  });

  it('409 no_email_address before anything is counted', async () => {
    cognito.on(AdminGetUserCommand).resolves(withAddress(null));
    const response = await handler(asCaller('admin', ['admin']));
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'no_email_address', message: 'This account has no e-mail address' });
    expect([...ddb.calls(), ...lambda.calls()]).toHaveLength(0);
  });

  it('429 mail_limit_reached when the day has its five, without starting the mailer', async () => {
    ddb.on(UpdateCommand).rejects(new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }));
    const response = await handler(asCaller('alice', ['user']));
    expect(response.statusCode).toBe(429);
    expect(bodyOf(response)).toEqual({ error: 'mail_limit_reached', message: 'No more e-mails can be asked for today' });
    expect(lambda.calls()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ level: 'info', outcome: 'limit_reached' });
  });

  it('404 user_not_found for an account deleted while its token lives', async () => {
    cognito.on(AdminGetUserCommand).rejects(new UserNotFoundException({ message: 'User does not exist.', $metadata: {} }));
    const response = await handler(asCaller('gone', ['user']));
    expect(response.statusCode).toBe(404);
    expect(bodyOf(response).error).toBe('user_not_found');
  });

  it("500 when the mailer's start fails, the mail staying counted", async () => {
    lambda.on(InvokeCommand).resolves({ StatusCode: 500 });
    const response = await handler(asCaller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not ask for the e-mail' });
    expect(ddb.commandCalls(UpdateCommand)).toHaveLength(1);
    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'error', status: 500 });
  });
});
