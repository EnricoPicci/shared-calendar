import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/updateUser';

// PUT /users/{username} (docs/EMAIL_ARCHITECTURE.md sections 4.2 and 9.1).
const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

const BEFORE = { givenName: 'Bob', familyName: 'Bianchi', email: 'bob@example.com', address: 'Via Po 2' };
const AFTER = { givenName: 'Roberto', familyName: 'Bianchi', email: 'roberto.bianchi@example.com', address: 'Via Po 2' };
const attributes = (facts: Record<string, string>) => [
  { Name: 'sub', Value: 'sub-bob' },
  { Name: 'given_name', Value: facts.givenName },
  { Name: 'family_name', Value: facts.familyName },
  { Name: 'email', Value: facts.email },
  { Name: 'address', Value: facts.address },
];
const CREATED = new Date('2026-11-10T09:00:00.000Z');

function eventWith(lambda: Record<string, string> | undefined, username: string | undefined, body?: string) {
  return {
    routeKey: 'PUT /users/{username}',
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters: username === undefined ? undefined : { username },
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (caller: string, groups: string[], target: string | undefined, body: string | undefined = JSON.stringify(AFTER)) =>
  eventWith({ sub: `sub-${caller}`, username: caller, groups: JSON.stringify(groups) }, target, body);
const asAdmin = (target = 'bob', body?: string) => asCaller('admin', ['admin'], target, body);

let output: string[];
beforeEach(() => {
  cognito.reset();
  cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'user' }] });
  cognito.on(AdminGetUserCommand).resolves({ Username: 'bob', UserCreateDate: CREATED, UserStatus: 'CONFIRMED', UserAttributes: attributes(BEFORE) });
  cognito.on(AdminUpdateUserAttributesCommand).resolves({});
  vi.stubEnv('USER_POOL_ID', POOL);
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

describe('updateUser handler', () => {
  it('replaces the four facts and answers the User as GET /users shows it', async () => {
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ username: 'bob', createdAt: '2026-11-10T09:00:00.000Z', status: 'active', ...AFTER });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand', 'AdminGetUserCommand', 'AdminUpdateUserAttributesCommand']);
    expect(cognito.commandCalls(AdminUpdateUserAttributesCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      UserAttributes: [
        { Name: 'given_name', Value: 'Roberto' },
        { Name: 'family_name', Value: 'Bianchi' },
        { Name: 'email', Value: 'roberto.bianchi@example.com' },
        { Name: 'address', Value: 'Via Po 2' },
        { Name: 'email_verified', Value: 'true' },
      ],
    });
  });

  it('trims the facts and lower-cases the e-mail before storing them', async () => {
    await handler(asAdmin('bob', JSON.stringify({ ...AFTER, givenName: ' Roberto ', email: 'Roberto.Bianchi@Example.com' })));
    const stored = cognito.commandCalls(AdminUpdateUserAttributesCommand)[0]!.args[0].input.UserAttributes;
    expect(stored).toContainEqual({ Name: 'given_name', Value: 'Roberto' });
    expect(stored).toContainEqual({ Name: 'email', Value: 'roberto.bianchi@example.com' });
  });

  it('keeps the state of an invited User in the answer', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: CREATED, UserStatus: 'FORCE_CHANGE_PASSWORD', UserAttributes: attributes(BEFORE) });
    expect(body(await handler(asAdmin())).status).toBe('invited');
  });

  it("lets the Administrator change their own facts, even those not set yet", async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'admin' }] });
    cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: CREATED, UserStatus: 'CONFIRMED', UserAttributes: [{ Name: 'sub', Value: 'sub-admin' }] });
    const response = await handler(asAdmin('admin'));
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ username: 'admin', createdAt: '2026-11-10T09:00:00.000Z', status: 'active', ...AFTER });
  });

  it("refuses another administrator's facts with 403 cannot_edit_admin, before reading them", async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'user' }, { GroupName: 'admin' }] });
    const response = await handler(asAdmin('second-admin'));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'cannot_edit_admin', message: "Another administrator's details cannot be changed" });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
  });

  it('changes an account in no group, as the delete does', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({});
    expect((await handler(asAdmin())).statusCode).toBe(200);
  });

  it.each([
    ['the group check', () => cognito.on(AdminListGroupsForUserCommand).rejects(notFound())],
    ['the read', () => cognito.on(AdminGetUserCommand).rejects(notFound())],
    ['the update', () => cognito.on(AdminUpdateUserAttributesCommand).rejects(notFound())],
  ])('answers 404 user_not_found when %s finds no account', async (_step, failing) => {
    failing();
    const response = await handler(asAdmin('ghost'));
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'user_not_found', message: 'No user with this username' });
  });

  it('answers 500 on any other Cognito failure', async () => {
    cognito.on(AdminUpdateUserAttributesCommand).rejects(new Error('Service unavailable'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not change the user' });
  });

  it.each([[['user']], [[]]])('answers 403 forbidden and calls nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups, 'alice'));
    expect(response.statusCode).toBe(403);
    expect(body(response).error).toBe('forbidden');
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 401 and calls nothing without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, 'bob', JSON.stringify(AFTER)));
    expect(response.statusCode).toBe(401);
    expect(cognito.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'no username in the path', target: undefined, raw: JSON.stringify(AFTER), code: 'invalid_request' },
    { name: 'a bad username in the path', target: 'Bob', raw: JSON.stringify(AFTER), code: 'invalid_request' },
    { name: 'no body', target: 'bob', raw: undefined, code: 'invalid_json' },
    { name: 'three facts of four', target: 'bob', raw: JSON.stringify({ ...AFTER, address: undefined }), code: 'invalid_request' },
    { name: 'a username in the body', target: 'bob', raw: JSON.stringify({ ...AFTER, username: 'eve' }), code: 'invalid_request' },
    { name: 'an e-mail that is not one', target: 'bob', raw: JSON.stringify({ ...AFTER, email: 'bob' }), code: 'invalid_request' },
  ])('answers 400 $code and calls nothing for $name', async ({ target, raw, code }) => {
    const response = await handler(eventWith({ sub: 'sub-admin', username: 'admin', groups: '["admin"]' }, target, raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    expect(cognito.calls()).toHaveLength(0);
  });
});

describe('updateUser handler logging', () => {
  it('writes one line with the caller, the target and the names of the changed facts, never a value', async () => {
    await handler(asAdmin());
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: 'PUT /users/{username}',
        username: 'admin',
        role: 'admin',
        target: 'bob',
        changed: ['givenName', 'email'],
        outcome: 'updated',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
    for (const value of ['Roberto', 'Bianchi', 'example.com', 'Via Po']) expect(output.join('')).not.toContain(value);
  });

  it('logs an unchanged save with an empty list', async () => {
    await handler(asAdmin('bob', JSON.stringify(BEFORE)));
    expect(logLines()[0]).toMatchObject({ outcome: 'updated', changed: [] });
  });

  it('logs a rejected body with the target, without its values', async () => {
    await handler(asAdmin('bob', JSON.stringify({ ...AFTER, email: 'typed-wrong@' })));
    expect(logLines()[0]).toMatchObject({ outcome: 'invalid_request', target: 'bob', status: 400 });
    expect(output.join('')).not.toContain('typed-wrong');
  });

  it('logs a refused administrator and a failure with its reason at error level', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: [{ GroupName: 'admin' }] });
    await handler(asAdmin('second-admin'));
    cognito.on(AdminListGroupsForUserCommand).rejects(new Error('boom'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', target: 'second-admin', outcome: 'forbidden', status: 403 }),
      expect.objectContaining({ level: 'error', target: 'bob', outcome: 'error', status: 500, reason: { name: 'Error', message: 'boom' } }),
    ]);
  });
});
