import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { countMailRequest, finishDailyMark, getMailSettings, mailConfig, MailConfigError, putMailSettings, takeDailyMark } from '../../../src/lib/mailDb';

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

const conditionFailed = () => new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
const KEPT_400_DAYS = Date.parse(NOW) / 1000 + 400 * 86_400;

describe('getMailSettings and putMailSettings', () => {
  it('answers the defaults, switched on at 07:00, until the first save, with a consistent read', async () => {
    ddb.on(GetCommand).resolves({});
    await expect(getMailSettings()).resolves.toEqual({ dailyEnabled: true, dailyHour: 7 });
    expect(ddb.commandCalls(GetCommand)[0]!.args[0].input).toEqual({ TableName: 'mail', Key: { PK: 'SETTINGS', SK: 'SETTINGS' }, ConsistentRead: true });
  });

  it('answers the two values saved, never who saved them', async () => {
    ddb.on(GetCommand).resolves({ Item: { PK: 'SETTINGS', SK: 'SETTINGS', dailyEnabled: false, dailyHour: 18, updatedAt: NOW, updatedBy: 'admin' } });
    await expect(getMailSettings()).resolves.toEqual({ dailyEnabled: false, dailyHour: 18 });
  });

  it('saves both values with the moment and the username, in one write, and answers them', async () => {
    ddb.on(PutCommand).resolves({});
    await expect(putMailSettings({ dailyEnabled: false, dailyHour: 6 }, 'admin', NOW)).resolves.toEqual({ dailyEnabled: false, dailyHour: 6 });
    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input).toEqual({
      TableName: 'mail',
      Item: { PK: 'SETTINGS', SK: 'SETTINGS', dailyEnabled: false, dailyHour: 6, updatedAt: NOW, updatedBy: 'admin' },
    });
  });

  it('calls nothing without its table', async () => {
    vi.stubEnv('MAIL_TABLE', '');
    await expect(getMailSettings()).rejects.toBeInstanceOf(MailConfigError);
    await expect(putMailSettings({ dailyEnabled: true, dailyHour: 7 }, 'admin', NOW)).rejects.toBeInstanceOf(MailConfigError);
    expect(ddb.calls()).toHaveLength(0);
  });
});

// Test names: section numbers are those of docs/EMAIL_ARCHITECTURE.md.
describe('takeDailyMark (6.2)', () => {
  const AGAIN = '#state = :failed OR (#state = :sending AND startedAt < :staleBefore)';

  it('at the chosen hour: writes the mark sending, if absent or to take again, kept 400 days', async () => {
    ddb.on(PutCommand).resolves({});
    await expect(takeDailyMark('2026-11-25', 'hour', NOW)).resolves.toEqual({ taken: true, startedAt: NOW });
    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input).toEqual({
      TableName: 'mail',
      Item: { PK: 'DAILY', SK: '2026-11-25', state: 'sending', startedAt: NOW, expiresAt: KEPT_400_DAYS },
      ConditionExpression: `attribute_not_exists(PK) OR ${AGAIN}`,
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':failed': 'failed', ':sending': 'sending', ':staleBefore': '2026-11-25T09:50:00.000Z' },
    });
    expect(ddb.commandCalls(GetCommand)).toHaveLength(0);
  });

  it('at a later hour: takes only a mark to take again, never writes an absent one', async () => {
    ddb.on(PutCommand).resolves({});
    await takeDailyMark('2026-11-25', 'retry', NOW);
    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input.ConditionExpression).toBe(AGAIN);
  });

  it.each([
    [{ Item: { PK: 'DAILY', SK: '2026-11-25', state: 'sent' } }, 'sent'],
    [{ Item: { PK: 'DAILY', SK: '2026-11-25', state: 'sending' } }, 'sending'],
    [{}, null],
  ])('when the condition fails, reads the mark to say what stopped the run: %j', async (read, state) => {
    ddb.on(PutCommand).rejects(conditionFailed());
    ddb.on(GetCommand).resolves(read);
    await expect(takeDailyMark('2026-11-25', 'retry', NOW)).resolves.toEqual({ taken: false, state });
    expect(ddb.commandCalls(GetCommand)[0]!.args[0].input).toEqual({ TableName: 'mail', Key: { PK: 'DAILY', SK: '2026-11-25' }, ConsistentRead: true });
  });

  it('throws any other failure as it came', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
    ddb.on(PutCommand).rejects(denied);
    await expect(takeDailyMark('2026-11-25', 'hour', NOW)).rejects.toBe(denied);
  });
});

// Test names: section numbers are those of docs/EMAIL_ARCHITECTURE.md.
describe('finishDailyMark (6.2)', () => {
  const STARTED = '2026-11-25T09:59:00.000Z';

  it('sent: the message ids and the counts, only while the mark is still this run\'s own', async () => {
    ddb.on(UpdateCommand).resolves({});
    await expect(finishDailyMark('2026-11-25', STARTED, { state: 'sent', sesMessageIds: ['m1', 'm2'], appointmentCount: 3, backupCount: 40 }, NOW)).resolves.toBe(true);
    expect(ddb.commandCalls(UpdateCommand)[0]!.args[0].input).toEqual({
      TableName: 'mail',
      Key: { PK: 'DAILY', SK: '2026-11-25' },
      UpdateExpression: 'SET #state = :state, finishedAt = :now, expiresAt = :expiresAt, sesMessageIds = :ids, appointmentCount = :count, backupCount = :backup',
      ConditionExpression: '#state = :sending AND startedAt = :startedAt',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':state': 'sent', ':now': NOW, ':expiresAt': KEPT_400_DAYS, ':sending': 'sending', ':startedAt': STARTED, ':ids': ['m1', 'm2'], ':count': 3, ':backup': 40 },
    });
  });

  it('failed: the state and the moment only', async () => {
    ddb.on(UpdateCommand).resolves({});
    await finishDailyMark('2026-11-25', STARTED, { state: 'failed' }, NOW);
    const input = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.UpdateExpression).toBe('SET #state = :state, finishedAt = :now, expiresAt = :expiresAt');
    expect(input.ExpressionAttributeValues).toEqual({ ':state': 'failed', ':now': NOW, ':expiresAt': KEPT_400_DAYS, ':sending': 'sending', ':startedAt': STARTED });
  });

  it('answers false when another run took the mark meanwhile, and throws any other failure', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailed());
    await expect(finishDailyMark('2026-11-25', STARTED, { state: 'failed' }, NOW)).resolves.toBe(false);
    const denied = new Error('denied');
    ddb.on(UpdateCommand).rejects(denied);
    await expect(finishDailyMark('2026-11-25', STARTED, { state: 'failed' }, NOW)).rejects.toBe(denied);
  });
});
