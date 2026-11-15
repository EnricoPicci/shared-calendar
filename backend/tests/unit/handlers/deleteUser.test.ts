import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

// The handler's modules read their configuration once per container (calendarConfig), so every
// test imports a fresh copy after setting the environment.
type Handler = typeof import('../../../src/handlers/deleteUser').handler;
let handler: Handler;

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBDocumentClient);
const POOL = 'eu-west-1_TEST';
const TABLE = 'calendar-test';
const NOW = '2026-11-15T08:00:00.000Z';
const SUB = 'sub-of-bob-0000';

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

const notFound = () => new UserNotFoundException({ message: 'User does not exist.', $metadata: {} });
const lockBusy = () =>
  new TransactionCanceledException({
    message: 'Transaction cancelled [ConditionalCheckFailed, None]',
    $metadata: {},
    CancellationReasons: [{ Code: 'ConditionalCheckFailed', Message: 'The conditional request failed' }, { Code: 'None' }],
  });

// One booked appointment of bob, not yet ended, and one of an earlier account named bob.
const appt = (n: number, userId: string) => ({
  PK: 'APPT',
  SK: `2026-11-16T0${n}:00:00.000Z#01M70NR5E0Q7R2C9T5XH3K000${n}`,
  userId,
  username: 'bob',
  start: `2026-11-16T0${n}:00:00.000Z`,
  end: `2026-11-16T0${n + 1}:00:00.000Z`,
  date: '2026-11-16',
  typeId: '01JC0000000000000000000001',
  typeNameAtBooking: 'Studio',
  note: 'a private note',
  status: 'booked',
  createdAt: '2026-11-10T09:00:00.000Z',
  createdBy: { username: 'bob', role: 'user' },
  updatedAt: '2026-11-10T09:00:00.000Z',
  updatedBy: { username: 'bob', role: 'user' },
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  replaces: null,
  replacedBy: null,
  version: 1,
});

// Every AWS call in the order the handler sent it, across both clients.
let trace: string[];
const traced = (name: string, answer: () => unknown) => async () => {
  trace.push(name);
  return answer();
};
const groupsOfTarget = (...names: string[]) =>
  cognito.on(AdminListGroupsForUserCommand).callsFake(traced('AdminListGroupsForUser', () => ({ Groups: names.map((GroupName) => ({ GroupName })) })));
const fails = (err: unknown) => async () => {
  throw err;
};

let output: string[];
beforeEach(async () => {
  cognito.reset();
  ddb.reset();
  trace = [];
  groupsOfTarget('user');
  cognito.on(AdminGetUserCommand).callsFake(traced('AdminGetUser', () => ({ Username: 'bob', UserAttributes: [{ Name: 'sub', Value: SUB }] })));
  cognito.on(AdminUserGlobalSignOutCommand).callsFake(traced('AdminUserGlobalSignOut', () => ({})));
  cognito.on(AdminDeleteUserCommand).callsFake(traced('AdminDeleteUser', () => ({})));
  ddb.on(GetCommand).callsFake(traced('GetItem', () => ({})));
  ddb.on(QueryCommand).callsFake(traced('Query', () => ({ Items: [appt(8, SUB), appt(9, 'sub-earlier-bob')] })));
  ddb.on(TransactWriteCommand).callsFake(traced('TransactWriteItems', () => ({})));
  vi.stubEnv('USER_POOL_ID', POOL);
  vi.stubEnv('CALENDAR_TABLE', TABLE);
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.resetModules();
  ({ handler } = await import('../../../src/handlers/deleteUser'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<Handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
// Cognito command names in the order the handler sent them.
const sent = () => cognito.calls().map((call) => (call.args[0] as object).constructor.name);
const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);
const FULL_ORDER = ['AdminListGroupsForUser', 'AdminGetUser', 'GetItem', 'Query', 'TransactWriteItems', 'AdminUserGlobalSignOut', 'AdminDeleteUser'];

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('deleteUser handler', () => {
  it('checks the groups, reads the sub, writes the calendar under the lock, signs the user out, deletes them: 204 without a body', async () => {
    const response = await handler(asAdmin());

    expect(response).toEqual({ statusCode: 204 });
    expect(trace).toEqual(FULL_ORDER);
    expect(cognito.calls().map((call) => (call.args[0] as { input: unknown }).input)).toEqual(
      Array.from({ length: 4 }, () => ({ UserPoolId: POOL, Username: 'bob' })),
    );
  });

  it('writes the marker keyed by the sub and cancels the target’s appointment by sub only (an earlier bob keeps his), as the Administrator', async () => {
    await handler(asAdmin());
    expect(transactions()).toHaveLength(1);
    const [lock, marker, update, event, ...rest] = transactions()[0]!.TransactItems!;
    expect(rest).toEqual([]);
    expect(lock!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    expect(marker!.Put!.Item).toEqual({
      PK: `DELETEDUSER#${SUB}`,
      SK: 'DELETEDUSER',
      username: 'bob',
      deletedAt: NOW,
      deletedBy: { username: 'admin', role: 'admin' },
    });
    expect(update!.Update!.Key).toEqual({ PK: 'APPT', SK: appt(8, SUB).SK });
    expect(update!.Update!.ExpressionAttributeValues).toMatchObject({ ':cancelReason': 'user_deleted', ':cancelledBy': { username: 'admin', role: 'admin' } });
    expect(event!.Put!.Item).toMatchObject({ type: 'appointment.cancelled', occurredAt: NOW, actor: { username: 'admin', role: 'admin' } });
    expect(event!.Put!.Item!.eventId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('a repeated delete is idempotent: the marker is written again and nothing is cancelled twice', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ ...appt(8, SUB), status: 'cancelled', cancelReason: 'user_deleted', version: 2 }] });
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(204);
    expect(transactions()).toHaveLength(1);
    expect(transactions()[0]!.TransactItems!.map((item) => Object.keys(item)[0])).toEqual(['Update', 'Put']);
    expect(transactions()[0]!.TransactItems![1]!.Put!.Item!.PK).toBe(`DELETEDUSER#${SUB}`);
  });

  it('deletes a target that is in no group, with its marker and cancellations too', async () => {
    groupsOfTarget();
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(204);
    expect(trace).toEqual(FULL_ORDER);
  });

  it('allows a caller in both admin and user', async () => {
    const response = await handler(asCaller('admin', ['user', 'admin']));
    expect(response.statusCode).toBe(204);
  });

  it.each([[['user']], [[]], [['other']]])('answers 403 and calls nothing for caller groups %j', async (groups) => {
    const response = await handler(asCaller('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(trace).toEqual([]);
  });

  it('answers 401 and calls nothing without an authorizer context', async () => {
    const response = await handler(eventWith(undefined, { username: 'bob' }));
    expect(response.statusCode).toBe(401);
    expect(body(response).error).toBe('unauthorized');
    expect(trace).toEqual([]);
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
      // No calendar write ever happens for an administrator.
      expect(trace).toEqual(['AdminListGroupsForUser']);
    },
  );

  it('answers 404 when the user does not exist, without further calls', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(notFound());
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(404);
    expect(body(response)).toEqual({ error: 'user_not_found', message: 'No user with this username' });
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 404 when the user disappears between the group check and AdminGetUser, before any calendar write', async () => {
    cognito.on(AdminGetUserCommand).callsFake(traced('AdminGetUser', fails(notFound())));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(404);
    expect(trace).toEqual(['AdminListGroupsForUser', 'AdminGetUser']);
  });

  it('answers 404 when the user disappears between the group check and the delete', async () => {
    cognito.on(AdminDeleteUserCommand).callsFake(fails(notFound()));
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
    expect(trace).toEqual([]);
  });

  it('answers 500 and does not delete when the sign-out fails', async () => {
    cognito.on(AdminUserGlobalSignOutCommand).callsFake(traced('AdminUserGlobalSignOut', fails(new Error('Service unavailable'))));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not delete the user' });
    expect(trace).toEqual(FULL_ORDER.slice(0, -1));
  });

  it('skips the sign-out locally (SKIP_GLOBAL_SIGN_OUT) and still writes the calendar and deletes', async () => {
    vi.stubEnv('SKIP_GLOBAL_SIGN_OUT', 'true');
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(204);
    expect(trace).toEqual(FULL_ORDER.filter((name) => name !== 'AdminUserGlobalSignOut'));
  });

  it('the time-zone check sits after the Cognito checks: a broken CalendarTimeZone answers 500 before AdminGetUser', async () => {
    vi.stubEnv('CALENDAR_TIME_ZONE', 'Not/AZone');
    vi.resetModules();
    ({ handler } = await import('../../../src/handlers/deleteUser'));
    expect((await handler(asCaller('alice', ['user']))).statusCode).toBe(403);
    groupsOfTarget('admin');
    expect((await handler(asAdmin('root'))).statusCode).toBe(403);
    groupsOfTarget('user');
    trace = [];
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not delete the user' });
    expect(trace).toEqual(['AdminListGroupsForUser']);
  });

  it.each([
    { name: 'the marker transaction', mock: () => ddb.on(TransactWriteCommand).callsFake(traced('TransactWriteItems', fails(new Error('throttled')))) },
    { name: 'the appointment read', mock: () => ddb.on(QueryCommand).callsFake(traced('Query', fails(new Error('throttled')))) },
  ])('a failure in $name answers 500 and makes no sign-out and no delete (R-DEL-01)', async ({ mock }) => {
    mock();
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not delete the user' });
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)).toHaveLength(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
  });

  it('a failure in the second chunk answers 500 and makes no sign-out and no delete', async () => {
    const many = Array.from({ length: 41 }, (_, i) => ({
      ...appt(8, SUB),
      SK: `2026-11-16T08:00:00.000Z#01M70NR5E0Q7R2C9T5XH3K${String(i).padStart(4, '0')}`,
    }));
    ddb.on(QueryCommand).resolvesOnce({ Items: many }).resolves({ Items: many.map((a, i) => (i < 40 ? { ...a, status: 'cancelled' } : a)) });
    ddb.on(TransactWriteCommand).resolvesOnce({}).rejects(new Error('throttled'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(transactions()).toHaveLength(2);
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)).toHaveLength(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
  });

  it('three lost locks answer 409 concurrent_update and make no sign-out and no delete', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(new Date(NOW));
    const pending = handler(asAdmin());
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(body(response)).toEqual({ error: 'concurrent_update', message: 'The calendar is busy; try again' });
    expect(transactions()).toHaveLength(3);
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)).toHaveLength(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', target: 'bob', outcome: 'conflict', status: 409, lockAttempts: 3 })]);
  });

  it('answers 500 when the group check fails for another reason', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(new Error('Rate exceeded'));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
    expect(sent()).toEqual(['AdminListGroupsForUserCommand']);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 500 when the delete fails', async () => {
    cognito.on(AdminDeleteUserCommand).callsFake(fails(new Error('Service unavailable')));
    const response = await handler(asAdmin());
    expect(response.statusCode).toBe(500);
  });
});

describe('deleteUser handler logging', () => {
  it('writes one info line naming caller and target, the cancelled count and the lock attempts; no sub, no note', async () => {
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
        cancelledCount: 1,
        lockAttempts: 1,
        outcome: 'deleted',
        status: 204,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toContain(SUB);
    expect(output.join('')).not.toContain('a private note');
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
    cognito.on(AdminDeleteUserCommand).callsFake(fails(new Error('Service unavailable')));
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
