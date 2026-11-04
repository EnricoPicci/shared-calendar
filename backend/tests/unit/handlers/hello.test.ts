import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../src/handlers/hello';

const ddb = mockClient(DynamoDBDocumentClient);

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    routeKey: 'POST /hello',
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
  } as unknown as APIGatewayProxyEventV2;
}

const caller = (username: string, groups: string[]) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

let output: string[];
beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
  vi.stubEnv('MESSAGES_TABLE', 'hello-messages-test');
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

describe('hello handler', () => {
  it.each([
    { groups: ['user'], role: 'user', message: 'Hello World, I am alice' },
    { groups: ['admin'], role: 'admin', message: 'Hello World, the Administrator is speaking' },
    { groups: ['user', 'admin'], role: 'admin', message: 'Hello World, the Administrator is speaking' },
  ])('answers 201 as $role for groups $groups', async ({ groups, role, message }) => {
    const response = await handler(caller('alice', groups));
    expect(response.statusCode).toBe(201);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    const result = body(response);
    expect(result).toEqual({ messageId: expect.stringMatching(ULID), role, message, createdAt: expect.any(String) });
    expect(new Date(result.createdAt as string).toISOString()).toBe(result.createdAt);
  });

  it('stores exactly the item it returns', async () => {
    const response = await handler(caller('alice', ['user']));
    const { messageId, createdAt } = body(response);
    const calls = ddb.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toEqual({
      TableName: 'hello-messages-test',
      Item: { messageId, userId: 'sub-alice', userName: 'alice', role: 'user', message: 'Hello World, I am alice', createdAt },
    });
  });

  it('gives every message a new id', async () => {
    const first = body(await handler(caller('alice', ['user'])));
    const second = body(await handler(caller('alice', ['user'])));
    expect(first.messageId).not.toBe(second.messageId);
  });

  it.each([[[]], [['other']]])('answers 403 and stores nothing for groups %j', async (groups) => {
    const response = await handler(caller('mallory', groups));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('answers 401 and stores nothing without an authorizer context', async () => {
    const response = await handler(eventWith());
    expect(response.statusCode).toBe(401);
    expect(body(response).error).toBe('unauthorized');
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(PutCommand).rejects(new Error('ProvisionedThroughputExceededException: secret detail'));
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not store the message' });
  });
});

describe('hello handler logging', () => {
  it('writes one info line with the outcome of a successful call', async () => {
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: 'POST /hello',
        username: 'alice',
        role: 'user',
        outcome: 'created',
        status: 201,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('logs a forbidden call with a null role', async () => {
    await handler(caller('mallory', []));
    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', username: 'mallory', role: null, outcome: 'forbidden', status: 403 }),
    ]);
  });

  it('logs an unauthorized call without a username', async () => {
    await handler(eventWith());
    const [line] = logLines();
    expect(line).toEqual(expect.objectContaining({ level: 'info', outcome: 'unauthorized', status: 401 }));
    expect(line).not.toHaveProperty('username');
  });

  it('logs a DynamoDB failure at error level with the reason', async () => {
    ddb.on(PutCommand).rejects(new Error('ProvisionedThroughputExceededException'));
    await handler(caller('alice', ['user']));
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'error',
        username: 'alice',
        outcome: 'error',
        status: 500,
        reason: { name: 'Error', message: 'ProvisionedThroughputExceededException' },
      }),
    ]);
  });
});
