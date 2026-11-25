import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  UnsupportedUserStateException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/resendInvitation';

// POST /users/{username}/invitation (docs/EMAIL_ARCHITECTURE.md sections 5.3 and 9.1). Its success
// is reached here only: cognito-local does not support the resend.
const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';
const ROUTE = 'POST /users/{username}/invitation';

const FACTS = { givenName: 'Bob', familyName: 'Bianchi', email: 'bob.bianchi@example.com', address: 'Via Po 2' };
const attributes = [
  { Name: 'sub', Value: 'sub-bob' },
  { Name: 'given_name', Value: FACTS.givenName },
  { Name: 'family_name', Value: FACTS.familyName },
  { Name: 'email', Value: FACTS.email },
  { Name: 'address', Value: FACTS.address },
];
const CREATED = new Date('2026-11-10T09:00:00.000Z');
const account = (status: string) => ({ Username: 'bob', UserCreateDate: CREATED, UserStatus: status, UserAttributes: attributes }) as never;

function eventWith(lambda: Record<string, string> | undefined, username: string | undefined) {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters: username === undefined ? undefined : { username },
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (caller: string, groups: string[], target: string | undefined = 'bob') =>
  eventWith({ sub: `sub-${caller}`, username: caller, groups: JSON.stringify(groups) }, target);
const asAdmin = (target: string | undefined = 'bob') => asCaller('admin', ['admin'], target);

let output: string[];
beforeEach(() => {
  cognito.reset();
  cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'user' }] });
  cognito.on(AdminGetUserCommand).resolves(account('FORCE_CHANGE_PASSWORD'));
  cognito.on(AdminCreateUserCommand).resolves({});
  vi.stubEnv('USER_POOL_ID', POOL);
  vi.stubEnv('MAIL_STAGE', 'on');
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

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
const sent = () => cognito.calls().map((call) => (call.args[0] as object).constructor.name);
const notFound = () => new UserNotFoundException({ message: 'User does not exist.', $metadata: {} });

describe('resendInvitation handler', () => {
  it('sends the invitation again to an invited User and answers 202 invited', async () => {
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(202);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(body(response)).toEqual({ username: 'bob', status: 'invited' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand', 'AdminGetUserCommand', 'AdminCreateUserCommand']);
    expect(cognito.commandCalls(AdminCreateUserCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      MessageAction: 'RESEND',
      DesiredDeliveryMediums: ['EMAIL'],
    });
  });

  it.each([['off'], ['domain'], [undefined]])('answers 503 mail_unavailable and calls nothing at stage %s', async (stage) => {
    vi.stubEnv('MAIL_STAGE', stage);
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(503);
    expect(body(response)).toEqual({ error: 'mail_unavailable', message: 'E-mail is not available yet' });
    expect(cognito.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 forbidden and calls nothing for groups %j, before the stage', async (groups) => {
    vi.stubEnv('MAIL_STAGE', 'off');
    const response = await handler(asCaller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 401 and calls nothing without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, 'bob'));
    expect(response.statusCode).toBe(401);
    expect(cognito.calls()).toHaveLength(0);
  });

  it.each([['Bob'], ['bo'], [undefined]])('answers 400 invalid_request and calls nothing for the path %s', async (target) => {
    const response = await handler(eventWith({ sub: 'sub-admin', username: 'admin', groups: '["admin"]' }, target));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe('invalid_request');
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 404 user_not_found for an unknown username', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(notFound());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'user_not_found', message: 'No user with this username' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
  });

  it('answers 404 when the account disappears before the resend', async () => {
    cognito.on(AdminCreateUserCommand).rejects(notFound());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(404);
  });

  it.each([[['admin']], [['user', 'admin']]])('answers 403 cannot_edit_admin for an administrator in %j, the caller included', async (groups) => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: groups.map((GroupName) => ({ GroupName })) });
    const response = await handler(asAdmin('admin'));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'cannot_edit_admin', message: 'An administrator is never sent an invitation' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
  });

  it.each([['CONFIRMED'], ['RESET_REQUIRED']])('answers 409 not_invited, sending nothing, for an account in %s', async (status) => {
    cognito.on(AdminGetUserCommand).resolves(account(status));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'not_invited', message: 'This user has already chosen a password' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand', 'AdminGetUserCommand']);
  });

  it('answers 409 not_invited when Cognito refuses the resend for an account that became active meanwhile', async () => {
    cognito.on(AdminCreateUserCommand).rejects(new UnsupportedUserStateException({ message: 'unsupported state', $metadata: {} }));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(409);
    expect(body(response).error).toBe('not_invited');
  });

  it('answers 500 when the resend fails for another reason, as cognito-local does', async () => {
    cognito.on(AdminCreateUserCommand).rejects(Object.assign(new Error('Unsupported'), { name: 'UnsupportedError' }));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not send the invitation' });
  });
});

describe('resendInvitation handler logging', () => {
  it('writes one info line naming caller and target, without a fact', async () => {
    await handler(asAdmin());
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        target: 'bob',
        outcome: 'resent',
        status: 202,
        durationMs: expect.any(Number),
      },
    ]);
    for (const fact of Object.values(FACTS)) expect(output.join('')).not.toContain(fact);
  });

  it.each([
    { name: 'the stage', arrange: () => vi.stubEnv('MAIL_STAGE', 'domain'), outcome: 'mail_unavailable', level: 'error', status: 503 },
    { name: 'an unknown User', arrange: () => cognito.on(AdminListGroupsForUserCommand).rejects(notFound()), outcome: 'not_found', level: 'info', status: 404 },
    { name: 'an active User', arrange: () => cognito.on(AdminGetUserCommand).resolves(account('CONFIRMED')), outcome: 'not_invited', level: 'info', status: 409 },
    {
      name: 'an administrator',
      arrange: () => cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'admin' }] }),
      outcome: 'forbidden',
      level: 'info',
      status: 403,
    },
  ])('logs the refusal of $name as $outcome', async ({ arrange, outcome, level, status }) => {
    arrange();
    await handler(asAdmin());
    expect(logLines()).toEqual([expect.objectContaining({ level, username: 'admin', outcome, status })]);
  });

  it('logs a failure at error level with its reason', async () => {
    cognito.on(AdminCreateUserCommand).rejects(new Error('Service unavailable'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'error', target: 'bob', outcome: 'error', status: 500, reason: { name: 'Error', message: 'Service unavailable' } }),
    ]);
  });
});
