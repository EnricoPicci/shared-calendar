import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InvalidPasswordException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/createUser';
import { PASSWORD_LENGTH } from '../../../src/lib/password';

const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda: Record<string, string> | undefined, body?: string, isBase64Encoded = false) {
  return {
    routeKey: 'POST /users',
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    body,
    isBase64Encoded,
  } as unknown as APIGatewayProxyEventV2;
}

const asCaller = (username: string, groups: string[], body?: string) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, body);
const asAdmin = (body = JSON.stringify({ username: 'bob' })) => asCaller('admin', ['admin'], body);

const exists = () => new UsernameExistsException({ message: 'User account already exists', $metadata: {} });
const badPassword = () => new InvalidPasswordException({ message: 'Password does not conform to policy', $metadata: {} });

let output: string[];
beforeEach(() => {
  cognito.reset();
  cognito.on(AdminCreateUserCommand).resolves({});
  cognito.on(AdminSetUserPasswordCommand).resolves({});
  cognito.on(AdminAddUserToGroupCommand).resolves({});
  cognito.on(AdminDeleteUserCommand).resolves({});
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
// Command names in the order the handler sent them.
const sent = () => cognito.calls().map((call) => (call.args[0] as object).constructor.name);

describe('createUser handler', () => {
  it('creates the user, sets a permanent password, adds the user group and returns the password', async () => {
    const response = await handler(asAdmin());

    expect(response.statusCode).toBe(201);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const result = body(response);
    expect(result).toEqual({ username: 'bob', password: expect.any(String) });
    expect(result.password).toHaveLength(PASSWORD_LENGTH);

    expect(sent()).toEqual(['AdminCreateUserCommand', 'AdminSetUserPasswordCommand', 'AdminAddUserToGroupCommand']);
    expect(cognito.commandCalls(AdminCreateUserCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      MessageAction: 'SUPPRESS',
    });
    expect(cognito.commandCalls(AdminSetUserPasswordCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      Password: result.password,
      Permanent: true,
    });
    expect(cognito.commandCalls(AdminAddUserToGroupCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      GroupName: 'user',
    });
  });

  it('generates a new password for every user', async () => {
    const first = body(await handler(asAdmin()));
    const second = body(await handler(asAdmin(JSON.stringify({ username: 'carol' }))));
    expect(first.password).not.toBe(second.password);
  });

  it('accepts a base64-encoded body', async () => {
    const encoded = Buffer.from(JSON.stringify({ username: 'bob' })).toString('base64');
    const response = await handler(
      eventWith({ sub: 'sub-admin', username: 'admin', groups: '["admin"]' }, encoded, true),
    );
    expect(response.statusCode).toBe(201);
  });

  it('allows a caller in both admin and user', async () => {
    const response = await handler(asCaller('admin', ['user', 'admin'], JSON.stringify({ username: 'bob' })));
    expect(response.statusCode).toBe(201);
  });

  it.each([[['user']], [[]], [['other']]])('answers 403 and calls nothing for groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups, JSON.stringify({ username: 'bob' })));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 401 and calls nothing without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, JSON.stringify({ username: 'bob' })));
    expect(response.statusCode).toBe(401);
    expect(body(response).error).toBe('unauthorized');
    expect(cognito.calls()).toHaveLength(0);
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json' },
    { name: 'malformed JSON', raw: '{"username":', code: 'invalid_json' },
    { name: 'a JSON array', raw: '["bob"]', code: 'invalid_request' },
    { name: 'a missing username', raw: '{}', code: 'invalid_request' },
    { name: 'a username that is not a string', raw: '{"username":42}', code: 'invalid_request' },
    { name: 'a username that is too short', raw: '{"username":"bo"}', code: 'invalid_request' },
    { name: 'a username that is too long', raw: JSON.stringify({ username: 'b'.repeat(33) }), code: 'invalid_request' },
    { name: 'an uppercase username', raw: '{"username":"Bob"}', code: 'invalid_request' },
    { name: 'a username starting with a dot', raw: '{"username":".bob"}', code: 'invalid_request' },
    { name: 'an extra group field', raw: '{"username":"bob","group":"admin"}', code: 'invalid_request' },
  ])('answers 400 $code and calls nothing for $name', async ({ raw, code }) => {
    // asCaller rather than asAdmin, whose default body would replace an undefined one.
    const response = await handler(asCaller('admin', ['admin'], raw));
    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 409 when the username exists, without touching the existing account', async () => {
    cognito.on(AdminCreateUserCommand).rejects(exists());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'user_exists', message: 'A user with this username already exists' });
    expect(sent()).toEqual(['AdminCreateUserCommand']);
  });

  it('answers 500 without a rollback when AdminCreateUser fails for another reason', async () => {
    cognito.on(AdminCreateUserCommand).rejects(Object.assign(new Error('Rate exceeded'), { name: 'TooManyRequestsException' }));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not create the user' });
    expect(sent()).toEqual(['AdminCreateUserCommand']);
  });

  it('deletes the account and answers 500 when setting the password fails', async () => {
    cognito.on(AdminSetUserPasswordCommand).rejects(badPassword());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not create the user' });
    expect(sent()).toEqual(['AdminCreateUserCommand', 'AdminSetUserPasswordCommand', 'AdminDeleteUserCommand']);
    expect(cognito.commandCalls(AdminDeleteUserCommand)[0]!.args[0].input).toEqual({ UserPoolId: POOL, Username: 'bob' });
  });

  it('deletes the account and answers 500 when adding to the group fails', async () => {
    cognito.on(AdminAddUserToGroupCommand).rejects(new Error('Service unavailable'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not create the user' });
    expect(sent()).toEqual([
      'AdminCreateUserCommand',
      'AdminSetUserPasswordCommand',
      'AdminAddUserToGroupCommand',
      'AdminDeleteUserCommand',
    ]);
  });

  it('still answers 500 when the rollback itself fails', async () => {
    cognito.on(AdminAddUserToGroupCommand).rejects(new Error('Service unavailable'));
    cognito.on(AdminDeleteUserCommand).rejects(new Error('Delete failed too'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not create the user' });
  });
});

describe('createUser handler logging', () => {
  it('writes one info line naming caller and target, without the password', async () => {
    const response = await handler(asAdmin());
    const { password } = body(response);
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: 'POST /users',
        username: 'admin',
        role: 'admin',
        target: 'bob',
        outcome: 'created',
        status: 201,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toContain(password as string);
  });

  it('logs a forbidden call with the caller and no target', async () => {
    await handler(asCaller('alice', ['user'], JSON.stringify({ username: 'bob' })));
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'info', username: 'alice', role: 'user', outcome: 'forbidden', status: 403 }));
    expect(line).not.toHaveProperty('target');
  });

  it('logs a rejected body without echoing the rejected username', async () => {
    await handler(asAdmin('{"username":"Not Valid"}'));
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'info', username: 'admin', outcome: 'invalid_request', status: 400 }));
    expect(line).not.toHaveProperty('target');
    expect(output.join('')).not.toContain('Not Valid');
  });

  it('logs a conflict with the target', async () => {
    cognito.on(AdminCreateUserCommand).rejects(exists());
    await handler(asAdmin());
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', target: 'bob', outcome: 'conflict', status: 409 })]);
  });

  it('logs a failure with a successful rollback at error level', async () => {
    cognito.on(AdminSetUserPasswordCommand).rejects(badPassword());
    await handler(asAdmin());
    const [line] = logLines();
    expect(line).toEqual(
      expect.objectContaining({
        level: 'error',
        target: 'bob',
        outcome: 'error',
        status: 500,
        reason: { name: 'InvalidPasswordException', message: 'Password does not conform to policy' },
        rollback: 'deleted',
      }),
    );
    expect(line).not.toHaveProperty('rollbackReason');
  });

  it('logs a failed rollback with both reasons', async () => {
    cognito.on(AdminAddUserToGroupCommand).rejects(new Error('Service unavailable'));
    cognito.on(AdminDeleteUserCommand).rejects(new Error('Delete failed too'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        outcome: 'error',
        status: 500,
        reason: { name: 'Error', message: 'Service unavailable' },
        rollback: 'failed',
        rollbackReason: { name: 'Error', message: 'Delete failed too' },
      }),
    ]);
  });

  it('logs a create failure without rollback fields', async () => {
    cognito.on(AdminCreateUserCommand).rejects(new Error('Rate exceeded'));
    await handler(asAdmin());
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'error', target: 'bob', outcome: 'error', status: 500 }));
    expect(line).not.toHaveProperty('rollback');
  });
});
