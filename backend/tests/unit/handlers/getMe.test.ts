import { AdminGetUserCommand, CognitoIdentityProviderClient, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/getMe';

// GET /me (docs/EMAIL_ARCHITECTURE.md sections 4.2 and 9.1).
const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

const FACTS = { givenName: 'Alice', familyName: 'Verdi', email: 'alice@example.com', address: 'Piazza Duomo 1\n20100 Milano' };
const attributes = [
  { Name: 'sub', Value: 'sub-alice' },
  { Name: 'given_name', Value: FACTS.givenName },
  { Name: 'family_name', Value: FACTS.familyName },
  { Name: 'email', Value: FACTS.email },
  { Name: 'email_verified', Value: 'true' },
  { Name: 'address', Value: FACTS.address },
];

function eventWith(lambda: Record<string, string> | undefined) {
  return {
    routeKey: 'GET /me',
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
  } as unknown as APIGatewayProxyEventV2;
}
const asCaller = (username: string, groups: string[]) => eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

let output: string[];
beforeEach(() => {
  cognito.reset();
  cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: new Date('2026-11-10T09:00:00.000Z'), UserStatus: 'CONFIRMED', UserAttributes: attributes });
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

const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;

describe('getMe handler', () => {
  it("answers a User's own facts, read by the token's username", async () => {
    const response = await handler(asCaller('alice', ['user']));
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ username: 'alice', role: 'user', ...FACTS });
    expect(cognito.commandCalls(AdminGetUserCommand)[0]!.args[0].input).toEqual({ UserPoolId: POOL, Username: 'alice' });
  });

  it('answers the Administrator, admin winning over user', async () => {
    expect(body(await handler(asCaller('admin', ['user', 'admin'])))).toMatchObject({ username: 'admin', role: 'admin' });
  });

  it('answers null for each fact the account does not hold yet', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: new Date(), UserAttributes: [{ Name: 'sub', Value: 'sub-admin' }] });
    expect(body(await handler(asCaller('admin', ['admin'])))).toEqual({ username: 'admin', role: 'admin', givenName: null, familyName: null, email: null, address: null });
  });

  it('answers 403 forbidden and calls nothing for a token in neither group', async () => {
    const response = await handler(asCaller('eve', []));
    expect(response.statusCode).toBe(403);
    expect(body(response).error).toBe('forbidden');
    expect(cognito.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventWith(undefined))).statusCode).toBe(401);
  });

  it('answers 404 user_not_found for an account deleted while its token lives', async () => {
    cognito.on(AdminGetUserCommand).rejects(new UserNotFoundException({ message: 'User does not exist.', $metadata: {} }));
    const response = await handler(asCaller('gone', ['user']));
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'user_not_found', message: 'No user with this username' });
  });

  it('answers 500 on any other failure, and logs it at error level', async () => {
    cognito.on(AdminGetUserCommand).rejects(new Error('boom'));
    const response = await handler(asCaller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not read the details' });
    expect(JSON.parse(output[0]!)).toMatchObject({ level: 'error', outcome: 'error', reason: { message: 'boom' } });
  });

  it('writes one log line with the caller, never a fact', async () => {
    await handler(asCaller('alice', ['user']));
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)).toEqual({
      timestamp: expect.any(String),
      level: 'info',
      requestId: 'req-1',
      route: 'GET /me',
      username: 'alice',
      role: 'user',
      outcome: 'ok',
      status: 200,
      durationMs: expect.any(Number),
    });
    for (const value of ['Verdi', 'example.com', 'Duomo']) expect(output.join('')).not.toContain(value);
  });
});
