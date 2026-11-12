import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// The module reads its configuration once per container, so every test imports a fresh copy
// after setting the environment.
type CalendarDb = typeof import('../../../src/lib/calendarDb');
let db: CalendarDb;

const ddb = mockClient(DynamoDBDocumentClient);
const TABLE = 'calendar-test';
const NOW = '2026-11-12T09:30:00.000Z';
const ADMIN = { username: 'admin', role: 'admin' } as const;
const VALUES = { cancellationNoticeHours: 48, minBookingNoticeHours: 2, bookingHorizonDays: 30, maxFutureAppointmentsPerUser: 3 };

// What DynamoDB answers when a transaction is cancelled: one reason per item, in item order
// (checked against DynamoDB Local on 2026-11-12: the SDK throws TransactionCanceledException).
const cancelled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: `Transaction cancelled, please refer cancellation reasons for specific reasons [${codes.join(', ')}]`,
    $metadata: {},
    CancellationReasons: codes.map((Code) => (Code === 'None' ? { Code } : { Code, Message: 'The conditional request failed' })),
  });

const lockBusy = () => cancelled('ConditionalCheckFailed', 'None');

async function load(env: Record<string, string> = {}): Promise<CalendarDb> {
  vi.stubEnv('CALENDAR_TABLE', TABLE);
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  return import('../../../src/lib/calendarDb');
}

const lockItem = (version: number) => ({ Item: { PK: 'LOCK', SK: 'LOCK', version } });
const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);

beforeEach(async () => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
  db = await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('calendarConfig', () => {
  it('reads the table and the time zone', () => {
    expect(db.calendarConfig()).toEqual({ table: TABLE, timeZone: 'Europe/Rome' });
  });

  it('reads the environment once per container', () => {
    db.calendarConfig();
    vi.stubEnv('CALENDAR_TIME_ZONE', 'Asia/Kathmandu');
    expect(db.calendarConfig().timeZone).toBe('Europe/Rome');
  });

  it.each([
    { name: 'an unknown zone', zone: 'Not/AZone', message: 'CALENDAR_TIME_ZONE is not a valid time zone: "Not/AZone"' },
    { name: 'an empty zone', zone: '', message: 'CALENDAR_TIME_ZONE is not a valid time zone: ""' },
  ])('throws CalendarConfigError on use, not on import, for $name', async ({ zone, message }) => {
    const broken = await load({ CALENDAR_TIME_ZONE: zone });
    expect(() => broken.calendarConfig()).toThrow(broken.CalendarConfigError);
    expect(() => broken.calendarConfig()).toThrow(message);
  });

  it('throws when the zone is missing', async () => {
    vi.stubEnv('CALENDAR_TABLE', TABLE);
    delete process.env.CALENDAR_TIME_ZONE;
    vi.resetModules();
    const broken = await import('../../../src/lib/calendarDb');
    expect(() => broken.calendarConfig()).toThrow('CALENDAR_TIME_ZONE is not a valid time zone: null');
  });

  it('throws when the table is not set', async () => {
    const broken = await load({ CALENDAR_TABLE: '' });
    expect(() => broken.calendarConfig()).toThrow('CALENDAR_TABLE is not set');
  });

  it('keeps failing once it has failed, so every request answers alike', async () => {
    const broken = await load({ CALENDAR_TIME_ZONE: 'Not/AZone' });
    expect(() => broken.calendarConfig()).toThrow(broken.CalendarConfigError);
    vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
    expect(() => broken.calendarConfig()).toThrow(broken.CalendarConfigError);
  });

  it('makes every read and write fail before calling DynamoDB', async () => {
    const broken = await load({ CALENDAR_TIME_ZONE: 'Not/AZone' });
    await expect(broken.getSettings()).rejects.toThrow(broken.CalendarConfigError);
    await expect(broken.putSettings(VALUES, ADMIN, NOW)).rejects.toThrow(broken.CalendarConfigError);
    expect(ddb.calls()).toHaveLength(0);
  });
});

describe('withCalendarLock', () => {
  const write = [{ Put: { TableName: TABLE, Item: { PK: 'X', SK: 'X' } } }];

  it('reads the lock with a consistent read', async () => {
    await db.withCalendarLock(async () => ({ write, result: 'done' }));
    expect(ddb.commandCalls(GetCommand)[0]!.args[0].input).toEqual({
      TableName: TABLE,
      Key: { PK: 'LOCK', SK: 'LOCK' },
      ConsistentRead: true,
    });
  });

  it('creates the lock on first use, before the operation’s writes', async () => {
    const locked = await db.withCalendarLock(async () => ({ write, result: 'done' }));
    expect(locked).toEqual({ result: 'done', attempts: 1 });
    expect(transactions()).toEqual([
      {
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: { PK: 'LOCK', SK: 'LOCK' },
              UpdateExpression: 'SET #version = :next',
              ConditionExpression: 'attribute_not_exists(PK)',
              ExpressionAttributeNames: { '#version': 'version' },
              ExpressionAttributeValues: { ':next': 1 },
            },
          },
          ...write,
        ],
      },
    ]);
  });

  it('moves the version on by one if it is unchanged, on a later use', async () => {
    ddb.on(GetCommand, { Key: { PK: 'LOCK', SK: 'LOCK' } }).resolves(lockItem(7));
    await db.withCalendarLock(async () => ({ write, result: 'done' }));
    expect(transactions()).toEqual([
      {
        TransactItems: [
          {
            Update: {
              TableName: TABLE,
              Key: { PK: 'LOCK', SK: 'LOCK' },
              UpdateExpression: 'SET #version = :next',
              ConditionExpression: '#version = :current',
              ExpressionAttributeNames: { '#version': 'version' },
              ExpressionAttributeValues: { ':current': 7, ':next': 8 },
            },
          },
          ...write,
        ],
      },
    ]);
  });

  it('writes nothing when the operation stops after its checks', async () => {
    const attempt = vi.fn(async () => ({ write: null, result: 'type_name_exists' }));
    expect(await db.withCalendarLock(attempt)).toEqual({ result: 'type_name_exists', attempts: 1 });
    expect(transactions()).toHaveLength(0);
  });

  it('retries from the reads after the lock was taken twice, and reports 3 attempts', async () => {
    vi.useFakeTimers();
    ddb
      .on(GetCommand)
      .resolvesOnce(lockItem(1))
      .resolvesOnce(lockItem(2))
      .resolves(lockItem(3));
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).rejectsOnce(lockBusy()).resolves({});
    const attempt = vi.fn(async () => ({ write, result: 'done' }));

    const locked = db.withCalendarLock(attempt);
    await vi.runAllTimersAsync();

    expect(await locked).toEqual({ result: 'done', attempts: 3 });
    // Each attempt re-reads the lock and re-runs the operation's reads and checks.
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(transactions().map((input) => input.TransactItems![0]!.Update!.ExpressionAttributeValues)).toEqual([
      { ':current': 1, ':next': 2 },
      { ':current': 2, ':next': 3 },
      { ':current': 3, ':next': 4 },
    ]);
  });

  it('gives up after 3 attempts with ConcurrentUpdateError, and makes no fourth', async () => {
    vi.useFakeTimers();
    ddb.on(TransactWriteCommand).rejects(lockBusy());

    const locked = db.withCalendarLock(async () => ({ write, result: 'done' }));
    const failed = expect(locked).rejects.toEqual(expect.objectContaining({ name: 'ConcurrentUpdateError', attempts: 3 }));
    await vi.runAllTimersAsync();
    await failed;

    await expect(locked).rejects.toBeInstanceOf(db.ConcurrentUpdateError);
    expect(transactions()).toHaveLength(3);
    expect(ddb.commandCalls(GetCommand)).toHaveLength(3);
  });

  it('also retries when real DynamoDB reports the lock item in another transaction', async () => {
    vi.useFakeTimers();
    ddb.on(TransactWriteCommand).rejectsOnce(cancelled('TransactionConflict', 'None')).resolves({});
    const locked = db.withCalendarLock(async () => ({ write, result: 'done' }));
    await vi.runAllTimersAsync();
    expect(await locked).toEqual({ result: 'done', attempts: 2 });
  });

  it('does not retry a condition that failed on another item', async () => {
    const otherItem = cancelled('None', 'ConditionalCheckFailed');
    ddb.on(TransactWriteCommand).rejects(otherItem);
    await expect(db.withCalendarLock(async () => ({ write, result: 'done' }))).rejects.toBe(otherItem);
    expect(transactions()).toHaveLength(1);
  });

  it('does not retry a cancellation without reasons', async () => {
    const noReasons = new TransactionCanceledException({ message: 'cancelled', $metadata: {} });
    ddb.on(TransactWriteCommand).rejects(noReasons);
    await expect(db.withCalendarLock(async () => ({ write, result: 'done' }))).rejects.toBe(noReasons);
    expect(transactions()).toHaveLength(1);
  });

  it('does not retry a plain SDK error', async () => {
    const throttled = Object.assign(new Error('Rate exceeded'), { name: 'ProvisionedThroughputExceededException' });
    ddb.on(TransactWriteCommand).rejects(throttled);
    await expect(db.withCalendarLock(async () => ({ write, result: 'done' }))).rejects.toBe(throttled);
    expect(transactions()).toHaveLength(1);
  });

  it('does not retry when reading the lock fails', async () => {
    ddb.on(GetCommand).rejects(new Error('network down'));
    const attempt = vi.fn(async () => ({ write, result: 'done' }));
    await expect(db.withCalendarLock(attempt)).rejects.toThrow('network down');
    expect(attempt).not.toHaveBeenCalled();
  });

  it.each([
    { random: 0, waitMs: 50 },
    { random: 0.999999, waitMs: 150 },
  ])('waits $waitMs ms before the next attempt when the random source gives $random', async ({ random, waitMs }) => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(random);
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});

    const locked = db.withCalendarLock(async () => ({ write, result: 'done' }));
    await vi.advanceTimersByTimeAsync(waitMs - 1);
    expect(transactions()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transactions()).toHaveLength(2);
    expect(await locked).toEqual({ result: 'done', attempts: 2 });
  });
});

describe('lockWaitMs', () => {
  it.each([
    [0, 50],
    [0.5, 100],
    [0.999999, 150],
  ])('maps the random value %d to %d ms', (random, ms) => {
    expect(db.lockWaitMs(() => random)).toBe(ms);
  });
});

describe('getSettings', () => {
  it('answers the defaults with no author until the first save (R-SET-01)', async () => {
    expect(await db.getSettings()).toEqual({
      timeZone: 'Europe/Rome',
      cancellationNoticeHours: 24,
      minBookingNoticeHours: 0,
      bookingHorizonDays: 56,
      maxFutureAppointmentsPerUser: null,
      updatedAt: null,
      updatedBy: null,
    });
    expect(ddb.commandCalls(GetCommand)[0]!.args[0].input).toEqual({
      TableName: TABLE,
      Key: { PK: 'SETTINGS', SK: 'SETTINGS' },
      ConsistentRead: true,
    });
  });

  it('answers the saved item without its keys, with the zone of the configuration', async () => {
    ddb.on(GetCommand).resolves({
      Item: { PK: 'SETTINGS', SK: 'SETTINGS', ...VALUES, updatedAt: NOW, updatedBy: ADMIN },
    });
    expect(await db.getSettings()).toEqual({ timeZone: 'Europe/Rome', ...VALUES, updatedAt: NOW, updatedBy: ADMIN });
  });

  it('propagates a DynamoDB failure', async () => {
    ddb.on(GetCommand).rejects(new Error('network down'));
    await expect(db.getSettings()).rejects.toThrow('network down');
  });
});

describe('putSettings', () => {
  it('writes the settings item after the lock, and answers what it stored', async () => {
    const locked = await db.putSettings(VALUES, ADMIN, NOW);
    expect(locked).toEqual({
      result: { timeZone: 'Europe/Rome', ...VALUES, updatedAt: NOW, updatedBy: ADMIN },
      attempts: 1,
    });
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[0]!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    // The time zone is a deployment parameter, never stored.
    expect(items[1]).toEqual({
      Put: { TableName: TABLE, Item: { PK: 'SETTINGS', SK: 'SETTINGS', ...VALUES, updatedAt: NOW, updatedBy: ADMIN } },
    });
  });

  it('stores an unlimited appointment count as null', async () => {
    await db.putSettings({ ...VALUES, maxFutureAppointmentsPerUser: null }, ADMIN, NOW);
    expect(transactions()[0]!.TransactItems![1]!.Put!.Item!.maxFutureAppointmentsPerUser).toBeNull();
  });

  it('throws ConcurrentUpdateError when the lock stays busy', async () => {
    vi.useFakeTimers();
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const locked = db.putSettings(VALUES, ADMIN, NOW);
    const failed = expect(locked).rejects.toBeInstanceOf(db.ConcurrentUpdateError);
    await vi.runAllTimersAsync();
    await failed;
  });
});
