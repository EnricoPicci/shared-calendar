import {
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/deleteUser';

const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

// The event as API Gateway delivers it after the authorizer allowed the request.
// pathParameters is left out when undefined, as for a route without one.
function eventWith(lambda: Record<string, string> | undefined, pathParameters?: Record<string, string>) {
  return {
    routeKey: 'DELETE /users/{username}',
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    ...(pathParameters && { pathParameters }),
  } as unknown as APIGatewayProxyEventV2;
}

const asCaller = (username: string, groups: string[], target = 'bob') =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, { username: target });
const asAdmin = (target?: string) => asCaller('admin', ['admin'], target);

const groupsOfTarget = (...names: string[]) =>
  cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: names.map((GroupName) => ({ GroupName })) });
const notFound = () => new UserNotFoundException({ message: 'User does not exist.', $metadata: {} });

let output: string[];
beforeEach(() => {
  cognito.reset();
  groupsOfTarget('user');
  cognito.on(AdminUserGlobalSignOutCommand).resolves({});
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

describe('deleteUser handler', () => {
  it('checks the groups, signs the user out, deletes them and answers 204 without a body', async () => {
    const response = await handler(asAdmin());

    expect(response).toEqual({ statusCode: 204 });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand', 'AdminUserGlobalSignOutCommand', 'AdminDeleteUserCommand']);
    for (const command of [AdminListGroupsForUserCommand, AdminUserGlobalSignOutCommand, AdminDeleteUserCommand]) {
      expect(cognito.commandCalls(command)[0]!.args[0].input).toEqual({ UserPoolId: POOL, Username: 'bob' });
    }
  });

  it('deletes a target that is in no group', async () => {
    groupsOfTarget();
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(204);
    expect(sent()).toContain('AdminDeleteUserCommand');
  });

  it('allows a caller in both admin and user', async () => {
    const response = await handler(asCaller('admin', ['user', 'admin']));
    expect(response.statusCode).toBe(204);
  });

  it.each([[['user']], [[]], [['other']]])('answers 403 and calls nothing for caller groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 401 and calls nothing without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, { username: 'bob' }));
    expect(response.statusCode).toBe(401);
    expect(body(response).error).toBe('unauthorized');
    expect(cognito.calls()).toHaveLength(0);
  });

  it.each([[['admin']], [['admin', 'user']], [['user', 'admin']]])(
    'answers 403 cannot_delete_admin and stops after the group check for target groups %j',
    async (groups) => {
      groupsOfTarget(...groups);
      const response = await handler(asAdmin('root'));
      expect(response.statusCode).toBe(403);
      expect(body(response)).toEqual({
        error: 'cannot_delete_admin',
        message: 'Administrators cannot be deleted through the API',
      });
      expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
    },
  );

  it('answers 404 when the user does not exist, without further calls', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(notFound());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'user_not_found', message: 'No user with this username' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
  });

  it('answers 404 when the user disappears between the group check and the delete', async () => {
    cognito.on(AdminDeleteUserCommand).rejects(notFound());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(404);
    expect(body(response).error).toBe('user_not_found');
  });

  it.each([
    { name: 'no path parameter', target: undefined },
    { name: 'an empty username', target: '' },
    { name: 'a username that is too short', target: 'bo' },
    { name: 'a username that is too long', target: 'b'.repeat(33) },
    { name: 'an uppercase username', target: 'Bob' },
    { name: 'a username starting with a dot', target: '.bob' },
    { name: 'a username with a space', target: 'bob smith' },
  ])('answers 400 invalid_request and calls nothing for $name', async ({ target }) => {
    const event = target === undefined
      ? eventWith({ sub: 'sub-admin', username: 'admin', groups: '["admin"]' })
      : asAdmin(target);
    const response = await handler(event);
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 500 and does not delete when the sign-out fails', async () => {
    cognito.on(AdminUserGlobalSignOutCommand).rejects(new Error('Service unavailable'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not delete the user' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand', 'AdminUserGlobalSignOutCommand']);
  });

  it('answers 500 when the group check fails for another reason', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(new Error('Rate exceeded'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
  });

  it('answers 500 when the delete fails', async () => {
    cognito.on(AdminDeleteUserCommand).rejects(new Error('Service unavailable'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
  });
});

describe('deleteUser handler logging', () => {
  it('writes one info line naming caller and target', async () => {
    await handler(asAdmin());
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: 'DELETE /users/{username}',
        username: 'admin',
        role: 'admin',
        target: 'bob',
        outcome: 'deleted',
        status: 204,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs a forbidden caller with no target', async () => {
    await handler(asCaller('alice', ['user']));
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'info', username: 'alice', role: 'user', outcome: 'forbidden', status: 403 }));
    expect(line).not.toHaveProperty('target');
  });

  it('logs a rejected path parameter without echoing it', async () => {
    await handler(asAdmin('Not Valid'));
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'info', username: 'admin', outcome: 'invalid_request', status: 400 }));
    expect(line).not.toHaveProperty('target');
    expect(output.join('')).not.toContain('Not Valid');
  });

  it('logs an admin target as forbidden with the target', async () => {
    groupsOfTarget('admin');
    await handler(asAdmin('root'));
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', target: 'root', outcome: 'forbidden', status: 403 })]);
  });

  it('logs an unknown target as not_found', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(notFound());
    await handler(asAdmin());
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', target: 'bob', outcome: 'not_found', status: 404 })]);
  });

  it('logs a failure at error level with the reason', async () => {
    cognito.on(AdminDeleteUserCommand).rejects(new Error('Service unavailable'));
    await handler(asAdmin());
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        target: 'bob',
        outcome: 'error',
        status: 500,
        reason: { name: 'Error', message: 'Service unavailable' },
      }),
    ]);
  });
});
