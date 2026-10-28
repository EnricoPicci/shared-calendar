import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { putMessage, type MessageItem } from '../../../src/lib/db';

const ddb = mockClient(DynamoDBDocumentClient);

const item: MessageItem = {
  messageId: '01JB6AAAAAAAAAAAAAAAAAAAAA',
  userId: 'sub-1',
  userName: 'alice',
  role: 'user',
  message: 'Hello World, I am alice',
  createdAt: '2026-10-28T09:00:00.000Z',
};

beforeEach(() => {
  ddb.reset();
  vi.stubEnv('MESSAGES_TABLE', 'hello-messages-test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('putMessage', () => {
  it('puts the item unchanged into the table named by MESSAGES_TABLE', async () => {
    ddb.on(PutCommand).resolves({});
    await putMessage(item);
    const calls = ddb.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toEqual({ TableName: 'hello-messages-test', Item: item });
  });

  it('propagates a DynamoDB failure', async () => {
    ddb.on(PutCommand).rejects(new Error('ProvisionedThroughputExceededException'));
    await expect(putMessage(item)).rejects.toThrow('ProvisionedThroughputExceededException');
  });

  it('fails clearly when MESSAGES_TABLE is not set', async () => {
    vi.stubEnv('MESSAGES_TABLE', '');
    await expect(putMessage(item)).rejects.toThrow('MESSAGES_TABLE is not set');
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe('client endpoint', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('uses DYNAMODB_ENDPOINT when it is set', async () => {
    vi.stubEnv('DYNAMODB_ENDPOINT', 'http://dynamodb:8000');
    vi.resetModules();
    const { documentClient } = await import('../../../src/lib/db');
    const endpoint = await documentClient.config.endpoint?.();
    expect(endpoint?.hostname).toBe('dynamodb');
    expect(endpoint?.port).toBe(8000);
  });

  it('leaves the SDK default when DYNAMODB_ENDPOINT is empty, as in the cloud', async () => {
    vi.stubEnv('DYNAMODB_ENDPOINT', '');
    vi.resetModules();
    const { documentClient } = await import('../../../src/lib/db');
    expect(documentClient.config.endpoint).toBeUndefined();
  });
});
