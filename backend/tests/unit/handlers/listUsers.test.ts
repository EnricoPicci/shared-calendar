import { CognitoIdentityProviderClient, ListUsersInGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// GET /users (docs/SHARED_CALENDAR_SPEC.md section 10.1; docs/SHARED_CALENDAR_SPEC.md section 11.1,
// route 21). Handler tests reload the module per test, like the others.
type Handler = typeof import('../../../src/handlers/listUsers').handler;
let handler: Handler;

const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

function eventWith(lambda: Record<string, string> | undefined) {
  return {
    routeKey: 'GET /users',
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (username: string, groups: string[]) => eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

const member = (Username: string) => ({ Username, UserCreateDate: new Date('2026-11-10T09:00:00.000Z') });

let output: string[];
beforeEach(async () => {
  cognito.reset();
  cognito.on(ListUsersInGroupCommand, { GroupName: 'user' }).resolves({ Users: [member('erin'), member('alice'), member('dave'), member('both')] });
  cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({ Users: [member('admin'), member('both')] });
  vi.stubEnv('USER_POOL_ID', POOL);
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.resetModules();
  ({ handler } = await import('../../../src/handlers/listUsers'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<Handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;

describe('listUsers handler', () => {
  it('answers 200 with the plain Users, sorted by username, admins excluded', async () => {
    const response = await handler(asCaller('admin', ['admin']));
    expect(response.statusCode).toBe(200);
    const createdAt = '2026-11-10T09:00:00.000Z';
    expect(body(response)).toEqual({
      users: [
        { username: 'alice', createdAt },
        { username: 'dave', createdAt },
        { username: 'erin', createdAt },
      ],
    });
  });

  it('allows a caller in both admin and user', async () => {
    expect((await handler(asCaller('admin', ['user', 'admin']))).statusCode).toBe(200);
  });

  it.each([[['user']], [[]]])('answers 403 forbidden and calls nothing for caller groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(undefined))).statusCode).toBe(401);
  });

  it('answers 500 internal_error on a Cognito failure', async () => {
    cognito.on(ListUsersInGroupCommand).rejects(new Error('Rate exceeded'));
    const response = await handler(asCaller('admin', ['admin']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not list the users' });
    expect(logLines()).toEqual([expect.objectContaining({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'Rate exceeded' } })]);
  });
});

describe('listUsers handler logging', () => {
  it('writes one info line with the number of users, never their names', async () => {
    await handler(asCaller('admin', ['admin']));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: 'GET /users',
        username: 'admin',
        role: 'admin',
        userCount: 3,
        outcome: 'listed',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
    for (const name of ['alice', 'dave', 'erin']) expect(output.join('')).not.toContain(name);
  });

  it('logs a forbidden caller', async () => {
    await handler(asCaller('alice', ['user']));
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', username: 'alice', outcome: 'forbidden', status: 403 })]);
  });
});
