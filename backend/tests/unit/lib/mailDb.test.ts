import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { countMailRequest, mailConfig, MailConfigError } from '../../../src/lib/mailDb';

// The table `mail` (docs/EMAIL_ARCHITECTURE.md section 10.1).
const ddb = mockClient(DynamoDBDocumentClient);
const NOW = '2026-11-25T10:00:00.000Z';

beforeEach(() => {
  ddb.reset();
  vi.stubEnv('MAIL_TABLE', 'mail');
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mailConfig', () => {
  it('answers the table and the time zone', () => {
    expect(mailConfig()).toEqual({ table: 'mail', timeZone: 'Europe/Rome' });
  });

  it('throws MailConfigError without MAIL_TABLE', () => {
    vi.stubEnv('MAIL_TABLE', '');
    expect(() => mailConfig()).toThrow(MailConfigError);
    expect(() => mailConfig()).toThrow('MAIL_TABLE is not set');
  });

  it('throws MailConfigError for a time zone that is not one, or none', () => {
    vi.stubEnv('CALENDAR_TIME_ZONE', 'Mars/Olympus');
    expect(() => mailConfig()).toThrow('CALENDAR_TIME_ZONE is not a valid time zone: "Mars/Olympus"');
    delete process.env.CALENDAR_TIME_ZONE;
    expect(() => mailConfig()).toThrow('CALENDAR_TIME_ZONE is not a valid time zone: null');
  });
});

describe('countMailRequest', () => {
  it('adds one to the counter of the sub and the local date, below the limit, kept two days', async () => {
    ddb.on(UpdateCommand).resolves({});

    await expect(countMailRequest('sub-alice', '2026-11-25', NOW)).resolves.toBe(true);

    expect(ddb.commandCalls(UpdateCommand)[0]!.args[0].input).toEqual({
      TableName: 'mail',
      Key: { PK: 'QUOTA#sub-alice', SK: '2026-11-25' },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, expiresAt = :expiresAt',
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
      ExpressionAttributeNames: { '#count': 'count' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':limit': 5, ':expiresAt': Date.parse(NOW) / 1000 + 2 * 86_400 },
    });
  });

  it('answers false when the condition fails: the day has its five', async () => {
    ddb.on(UpdateCommand).rejects(new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} }));
    await expect(countMailRequest('sub-alice', '2026-11-25', NOW)).resolves.toBe(false);
  });

  it('throws any other failure as it came', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
    ddb.on(UpdateCommand).rejects(denied);
    await expect(countMailRequest('sub-alice', '2026-11-25', NOW)).rejects.toBe(denied);
  });

  it('throws MailConfigError, calling nothing, without its table', async () => {
    vi.stubEnv('MAIL_TABLE', '');
    await expect(countMailRequest('sub-alice', '2026-11-25', NOW)).rejects.toBeInstanceOf(MailConfigError);
    expect(ddb.calls()).toHaveLength(0);
  });
});
