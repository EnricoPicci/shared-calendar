import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { localDateOf } from '@shared-calendar/shared';
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
  ddb.on(QueryCommand).resolves({ Items: [] });
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
    await expect(broken.listTypes()).rejects.toThrow(broken.CalendarConfigError);
    const pass = () => null;
    await expect(broken.createType({ typeId: 'T', name: 'n', nameKey: 'n' }, NOW, pass)).rejects.toThrow(broken.CalendarConfigError);
    await expect(broken.renameType('T', { name: 'n', nameKey: 'n' }, NOW, pass)).rejects.toThrow(broken.CalendarConfigError);
    await expect(broken.deleteType('T', '2026-11-12', NOW, pass)).rejects.toThrow(broken.CalendarConfigError);
    await expect(broken.listPatterns()).rejects.toThrow(broken.CalendarConfigError);
    const p = { patternId: 'P', weekday: 1, start: '08:00', end: '09:00', typeId: 'T', validFrom: '2026-11-01', validUntil: null };
    await expect(broken.createPattern(p, '2026-11-12', NOW, pass)).rejects.toThrow(broken.CalendarConfigError);
    await expect(broken.updatePattern(p, '2026-11-12', NOW, pass)).rejects.toThrow(broken.CalendarConfigError);
    await expect(broken.deletePattern('P', '2026-11-12', NOW, pass)).rejects.toThrow(broken.CalendarConfigError);
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

// ── Availability types ─────────────────────────────────────────────────────────────────────────

const STUDIO = '01JC0000000000000000000001';
const POOL = '01JC0000000000000000000002';
const NEW_ID = '01JC0000000000000000000009';
const EARLIER = '2026-11-01T08:00:00.000Z';

const typeItem = (typeId: string, name: string, at = EARLIER) => ({
  PK: 'TYPE',
  SK: typeId,
  name,
  nameKey: name.toLowerCase(),
  createdAt: at,
  updatedAt: at,
});
const queries = () => ddb.commandCalls(QueryCommand).map((call) => call.args[0].input);
const partitionQuery = (pk: string) => ({
  TableName: TABLE,
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: { ':pk': pk },
  ConsistentRead: true,
  ExclusiveStartKey: undefined,
});
const rangeQuery = (pk: string, from: string) => ({
  TableName: TABLE,
  KeyConditionExpression: 'PK = :pk AND SK >= :from',
  ExpressionAttributeValues: { ':pk': pk, ':from': from },
  ConsistentRead: true,
  ExclusiveStartKey: undefined,
});
const onTypes = (...items: object[]) =>
  ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'TYPE' } }).resolves({ Items: items });

describe('listTypes', () => {
  it('reads the TYPE partition with one consistent query', async () => {
    await db.listTypes();
    expect(queries()).toEqual([partitionQuery('TYPE')]);
  });

  it('answers the types sorted by nameKey, without PK, SK or nameKey', async () => {
    onTypes(typeItem(STUDIO, 'Studio'), typeItem(POOL, 'alpha'), typeItem(NEW_ID, 'Beta'));
    expect(await db.listTypes()).toEqual([
      { typeId: POOL, name: 'alpha', createdAt: EARLIER, updatedAt: EARLIER },
      { typeId: NEW_ID, name: 'Beta', createdAt: EARLIER, updatedAt: EARLIER },
      { typeId: STUDIO, name: 'Studio', createdAt: EARLIER, updatedAt: EARLIER },
    ]);
  });

  it('answers an empty list when there is no type (no Items in the answer)', async () => {
    ddb.on(QueryCommand).resolves({});
    expect(await db.listTypes()).toEqual([]);
  });

  it('follows LastEvaluatedKey to the last page', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [typeItem(STUDIO, 'Studio')], LastEvaluatedKey: { PK: 'TYPE', SK: STUDIO } })
      .resolvesOnce({ Items: [typeItem(POOL, 'Pool')], LastEvaluatedKey: { PK: 'TYPE', SK: POOL } })
      .resolvesOnce({ Items: [] });
    expect((await db.listTypes()).map((t) => t.name)).toEqual(['Pool', 'Studio']);
    expect(queries().map((q) => q.ExclusiveStartKey)).toEqual([undefined, { PK: 'TYPE', SK: STUDIO }, { PK: 'TYPE', SK: POOL }]);
    expect(queries().every((q) => q.ConsistentRead === true)).toBe(true);
  });

  it('propagates a DynamoDB failure', async () => {
    ddb.on(QueryCommand).rejects(new Error('network down'));
    await expect(db.listTypes()).rejects.toThrow('network down');
  });
});

describe('createType', () => {
  const studio = { typeId: NEW_ID, name: 'Studio', nameKey: 'studio' };

  it('reads the types after the lock, then writes the lock update and the whole TYPE item', async () => {
    const check = vi.fn(() => null);
    const locked = await db.createType(studio, NOW, check);
    expect(locked).toEqual({
      result: { ok: true, value: { typeId: NEW_ID, name: 'Studio', createdAt: NOW, updatedAt: NOW } },
      attempts: 1,
    });
    // Lock first, then the types (inside the attempt).
    expect(ddb.calls().map((call) => call.args[0].constructor.name)).toEqual(['GetCommand', 'QueryCommand', 'TransactWriteCommand']);
    expect(queries()).toEqual([partitionQuery('TYPE')]);
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[0]!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    expect(items[1]).toEqual({
      Put: {
        TableName: TABLE,
        Item: { PK: 'TYPE', SK: NEW_ID, name: 'Studio', nameKey: 'studio', createdAt: NOW, updatedAt: NOW },
      },
    });
  });

  it('gives the check every type read inside the attempt, with its nameKey', async () => {
    onTypes(typeItem(POOL, 'Pool'));
    const check = vi.fn(() => null);
    await db.createType(studio, NOW, check);
    expect(check).toHaveBeenCalledWith([{ typeId: POOL, name: 'Pool', nameKey: 'pool', createdAt: EARLIER, updatedAt: EARLIER }]);
  });

  it('writes nothing when the check refuses', async () => {
    const locked = await db.createType(studio, NOW, () => ({ error: 'limit_reached' as const }));
    expect(locked).toEqual({ result: { ok: false, error: 'limit_reached' }, attempts: 1 });
    expect(transactions()).toHaveLength(0);
  });

  it('re-reads the types on a retry: a name taken in between is refused, not duplicated', async () => {
    vi.useFakeTimers();
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [] })
      .resolves({ Items: [typeItem(POOL, 'STUDIO')] });
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    // The real rule, as the handler passes it.
    const { checkTypeName } = await import('../../../src/lib/calendarRules');
    const check = vi.fn((types: { typeId: string; nameKey: string }[]) => checkTypeName('Studio', types));

    const pending = db.createType(studio, NOW, check);
    await vi.runAllTimersAsync();

    expect(await pending).toEqual({ result: { ok: false, error: 'type_name_exists' }, attempts: 2 });
    expect(check).toHaveBeenCalledTimes(2);
    expect(queries()).toHaveLength(2);
    // The first transaction lost the lock; no second one was sent.
    expect(transactions()).toHaveLength(1);
  });

  it('writes the same typeId on every attempt', async () => {
    vi.useFakeTimers();
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const pending = db.createType(studio, NOW, () => null);
    await vi.runAllTimersAsync();
    await pending;
    expect(transactions().map((t) => t.TransactItems![1]!.Put!.Item!.SK)).toEqual([NEW_ID, NEW_ID]);
  });
});

describe('renameType', () => {
  const rename = { name: 'Gym', nameKey: 'gym' };

  it('writes the whole item again with the new name, keeping createdAt', async () => {
    onTypes(typeItem(STUDIO, 'Studio'), typeItem(POOL, 'Pool'));
    const check = vi.fn(() => null);
    const locked = await db.renameType(STUDIO, rename, NOW, check);
    expect(locked).toEqual({
      result: { ok: true, value: { typeId: STUDIO, name: 'Gym', createdAt: EARLIER, updatedAt: NOW } },
      attempts: 1,
    });
    expect(queries()).toEqual([partitionQuery('TYPE')]);
    expect(check).toHaveBeenCalledWith([
      { typeId: STUDIO, name: 'Studio', nameKey: 'studio', createdAt: EARLIER, updatedAt: EARLIER },
      { typeId: POOL, name: 'Pool', nameKey: 'pool', createdAt: EARLIER, updatedAt: EARLIER },
    ]);
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({
      Put: { TableName: TABLE, Item: { PK: 'TYPE', SK: STUDIO, name: 'Gym', nameKey: 'gym', createdAt: EARLIER, updatedAt: NOW } },
    });
  });

  it('answers type_not_found, without calling the check or writing, when the type is not there', async () => {
    onTypes(typeItem(POOL, 'Pool'));
    const check = vi.fn(() => null);
    expect(await db.renameType(STUDIO, rename, NOW, check)).toEqual({ result: { ok: false, error: 'type_not_found' }, attempts: 1 });
    expect(check).not.toHaveBeenCalled();
    expect(transactions()).toHaveLength(0);
  });

  it('writes nothing when the check refuses', async () => {
    onTypes(typeItem(STUDIO, 'Studio'), typeItem(POOL, 'Pool'));
    const locked = await db.renameType(STUDIO, { name: 'pool', nameKey: 'pool' }, NOW, () => ({ error: 'type_name_exists' as const }));
    expect(locked).toEqual({ result: { ok: false, error: 'type_name_exists' }, attempts: 1 });
    expect(transactions()).toHaveLength(0);
  });

  it('answers type_not_found on a retry if the type was deleted in between', async () => {
    vi.useFakeTimers();
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [typeItem(STUDIO, 'Studio')] })
      .resolves({ Items: [] });
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const pending = db.renameType(STUDIO, rename, NOW, () => null);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ result: { ok: false, error: 'type_not_found' }, attempts: 2 });
    expect(transactions()).toHaveLength(1);
  });
});

// The availability state every check of a locked attempt reads (deleteType, the pattern writes).
describe('the state read inside a locked attempt', () => {
  // 23:30 UTC is already the next day in Europe/Rome (UTC+1 in November): "today" is the local date.
  const LATE = '2026-11-16T23:30:00.000Z';
  const TODAY = localDateOf(LATE, 'Europe/Rome');

  beforeEach(() => {
    onTypes(typeItem(STUDIO, 'Studio'));
  });

  it('computes today in the calendar zone across midnight UTC', () => {
    expect(TODAY).toBe('2026-11-17');
  });

  it('runs five consistent queries: types and patterns whole, overrides and windows from today, appointments from now − 24 h', async () => {
    await db.deleteType(STUDIO, TODAY, LATE, () => null);
    expect(ddb.commandCalls(GetCommand).map((call) => call.args[0].input)).toEqual([
      { TableName: TABLE, Key: { PK: 'LOCK', SK: 'LOCK' }, ConsistentRead: true },
    ]);
    expect(queries()).toEqual([
      partitionQuery('TYPE'),
      partitionQuery('PATTERN'),
      rangeQuery('OVERRIDE', '2026-11-17'),
      // A window's SK is <date>#<windowId>: every one dated today or later sorts at or after today.
      rangeQuery('WINDOW', '2026-11-17'),
      rangeQuery('APPT', '2026-11-15T23:30:00.000Z'),
    ]);
  });

  it('maps only the fields the rules read: ids from the SK, an override’s date from its SK', async () => {
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'PATTERN' } }).resolves({
      Items: [
        { PK: 'PATTERN', SK: 'P1', weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-01-01', validUntil: '2026-02-01', createdAt: EARLIER, updatedAt: EARLIER },
        { PK: 'PATTERN', SK: 'P2', weekday: 2, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-01-01', validUntil: null, createdAt: EARLIER, updatedAt: EARLIER },
      ],
    });
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'OVERRIDE' } }).resolves({
      Items: [
        { PK: 'OVERRIDE', SK: '2026-11-20', windows: [{ start: '09:00', end: '10:00', typeId: POOL }], updatedAt: EARLIER },
        { PK: 'OVERRIDE', SK: '2026-11-21', updatedAt: EARLIER },
      ],
    });
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'WINDOW' } }).resolves({
      Items: [{ PK: 'WINDOW', SK: '2026-11-18#W1', date: '2026-11-18', start: '09:00', end: '10:00', typeId: STUDIO, createdAt: EARLIER }],
    });
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } }).resolves({
      Items: [
        {
          PK: 'APPT',
          SK: '2026-11-18T08:00:00.000Z#A1',
          username: 'alice',
          start: '2026-11-18T08:00:00.000Z',
          end: '2026-11-18T09:00:00.000Z',
          date: '2026-11-18',
          typeId: STUDIO,
          status: 'booked',
          note: 'private',
        },
      ],
    });
    const check = vi.fn(() => null);
    await db.deleteType(STUDIO, TODAY, LATE, check);
    expect(check).toHaveBeenCalledWith({
      types: [{ typeId: STUDIO, name: 'Studio', nameKey: 'studio', createdAt: EARLIER, updatedAt: EARLIER }],
      patterns: [
        { patternId: 'P1', weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-01-01', validUntil: '2026-02-01', createdAt: EARLIER, updatedAt: EARLIER },
        { patternId: 'P2', weekday: 2, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-01-01', validUntil: null, createdAt: EARLIER, updatedAt: EARLIER },
      ],
      overrides: [
        { date: '2026-11-20', windows: [{ start: '09:00', end: '10:00', typeId: POOL }] },
        { date: '2026-11-21', windows: [] },
      ],
      oneOffs: [{ windowId: 'W1', date: '2026-11-18', start: '09:00', end: '10:00', typeId: STUDIO }],
      // No note: the rules never read it.
      appointments: [
        {
          appointmentId: 'A1',
          username: 'alice',
          start: '2026-11-18T08:00:00.000Z',
          end: '2026-11-18T09:00:00.000Z',
          date: '2026-11-18',
          typeId: STUDIO,
          status: 'booked',
        },
      ],
    });
  });

  it('reads a pattern stored without validUntil as open-ended', async () => {
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'PATTERN' } }).resolves({
      Items: [{ PK: 'PATTERN', SK: 'P1', weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-01-01' }],
    });
    const check = vi.fn(() => null);
    await db.deleteType(STUDIO, TODAY, LATE, check);
    expect(check).toHaveBeenCalledWith(expect.objectContaining({ patterns: [expect.objectContaining({ validUntil: null })] }));
  });

  it('follows LastEvaluatedKey on every query', async () => {
    ddb
      .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } })
      .resolvesOnce({ Items: [{ PK: 'APPT', SK: 'a#1', typeId: POOL, status: 'booked', end: LATE }], LastEvaluatedKey: { PK: 'APPT', SK: 'a#1' } })
      .resolvesOnce({ Items: [{ PK: 'APPT', SK: 'b#2', typeId: STUDIO, status: 'booked', end: LATE }] });
    const check = vi.fn(() => null);
    await db.deleteType(STUDIO, TODAY, LATE, check);
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({ appointments: [expect.objectContaining({ appointmentId: '1' }), expect.objectContaining({ appointmentId: '2' })] }),
    );
    expect(queries().filter((q) => q.ExpressionAttributeValues![':pk'] === 'APPT').map((q) => q.ExclusiveStartKey)).toEqual([
      undefined,
      { PK: 'APPT', SK: 'a#1' },
    ]);
  });
});

describe('deleteType', () => {
  const TODAY = '2026-11-16';

  beforeEach(() => {
    onTypes(typeItem(STUDIO, 'Studio'));
  });

  it('deletes the TYPE item after the lock, with no condition', async () => {
    const locked = await db.deleteType(STUDIO, TODAY, NOW, () => null);
    expect(locked).toEqual({ result: { ok: true, value: null }, attempts: 1 });
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[0]!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    // No condition: the lock already serializes every calendar write.
    expect(items[1]).toEqual({ Delete: { TableName: TABLE, Key: { PK: 'TYPE', SK: STUDIO } } });
  });

  it('answers type_not_found, without calling the check or writing, when the type is not there', async () => {
    const check = vi.fn(() => null);
    expect(await db.deleteType(POOL, TODAY, NOW, check)).toEqual({ result: { ok: false, error: 'type_not_found' }, attempts: 1 });
    expect(check).not.toHaveBeenCalled();
    expect(transactions()).toHaveLength(0);
  });

  it('writes nothing when the check refuses', async () => {
    const locked = await db.deleteType(STUDIO, TODAY, NOW, () => ({ error: 'type_in_use' as const }));
    expect(locked).toEqual({ result: { ok: false, error: 'type_in_use' }, attempts: 1 });
    expect(transactions()).toHaveLength(0);
  });

  it('re-reads the state on a retry', async () => {
    vi.useFakeTimers();
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    ddb
      .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'PATTERN' } })
      .resolvesOnce({ Items: [] })
      .resolves({ Items: [{ PK: 'PATTERN', SK: 'P1', typeId: STUDIO }] });
    const check = vi.fn((refs: { patterns: readonly { typeId: string }[] }) =>
      refs.patterns.length > 0 ? { error: 'type_in_use' as const } : null,
    );
    const pending = db.deleteType(STUDIO, TODAY, NOW, check);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ result: { ok: false, error: 'type_in_use' }, attempts: 2 });
    expect(check).toHaveBeenCalledTimes(2);
    expect(transactions()).toHaveLength(1);
  });
});

// ── Weekly patterns ────────────────────────────────────────────────────────────────────────────

const P1 = '01JC00000000000000000000P1';
const P2 = '01JC00000000000000000000P2';
const P3 = '01JC00000000000000000000P3';
const fields = { weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };
const patternItem = (patternId: string, more: Record<string, unknown> = {}) => ({
  PK: 'PATTERN',
  SK: patternId,
  ...fields,
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...more,
});
const onPatterns = (...items: object[]) =>
  ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'PATTERN' } }).resolves({ Items: items });

describe('listPatterns', () => {
  it('reads the PATTERN partition with one consistent query', async () => {
    await db.listPatterns();
    expect(queries()).toEqual([partitionQuery('PATTERN')]);
  });

  it('answers the patterns by weekday, then start, then validity and id, without PK and SK', async () => {
    onPatterns(
      patternItem(P3, { weekday: 2, start: '07:00', end: '08:00' }),
      patternItem(P2, { start: '12:00', end: '13:00' }),
      patternItem('01JC00000000000000000000P5', { start: '07:00', end: '08:00', validFrom: '2027-01-01' }),
      patternItem('01JC00000000000000000000P4', { start: '07:00', end: '08:00', validFrom: '2026-01-01', validUntil: '2026-06-30' }),
      patternItem('01JC00000000000000000000P6', { start: '07:00', end: '08:00', validFrom: '2026-01-01', validUntil: '2026-06-30' }),
    );
    const listed = await db.listPatterns();
    expect(listed.map((p) => p.patternId)).toEqual([
      '01JC00000000000000000000P4',
      '01JC00000000000000000000P6',
      '01JC00000000000000000000P5',
      P2,
      P3,
    ]);
    expect(listed[3]).toEqual({ patternId: P2, ...fields, start: '12:00', end: '13:00', createdAt: EARLIER, updatedAt: EARLIER });
  });
});

describe('createPattern', () => {
  const TODAY = '2026-11-12';

  it('reads the state after the lock, then writes the lock update and the whole PATTERN item', async () => {
    const check = vi.fn(() => null);
    const locked = await db.createPattern({ patternId: P1, ...fields }, TODAY, NOW, check);
    expect(locked).toEqual({ result: { ok: true, value: { patternId: P1, ...fields, createdAt: NOW, updatedAt: NOW } }, attempts: 1 });
    expect(check).toHaveBeenCalledTimes(1);
    expect(queries().map((q) => q.ExpressionAttributeValues![':pk'])).toEqual(['TYPE', 'PATTERN', 'OVERRIDE', 'WINDOW', 'APPT']);
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[0]!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    // validUntil null is stored as null: the item always has every field of 13.2.
    expect(items[1]).toEqual({
      Put: { TableName: TABLE, Item: { PK: 'PATTERN', SK: P1, ...fields, createdAt: NOW, updatedAt: NOW } },
    });
  });

  it('writes nothing and passes the check’s message and conflicts on when it refuses', async () => {
    const conflicts = [{ appointmentId: 'A1', username: 'alice', start: NOW, end: NOW }];
    const refusal = { error: 'availability_conflict' as const, message: '1 appointment would fall outside the availability', conflicts };
    const locked = await db.createPattern({ patternId: P1, ...fields }, TODAY, NOW, () => refusal);
    expect(locked).toEqual({ result: { ok: false, ...refusal }, attempts: 1 });
    expect(transactions()).toHaveLength(0);
  });

  it('re-reads the state on a retry: a clash made in between is refused, and the same id is written otherwise', async () => {
    vi.useFakeTimers();
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    const check = vi.fn((state: { patterns: readonly unknown[] }) => (state.patterns.length > 0 ? { error: 'availability_overlap' as const } : null));
    ddb
      .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'PATTERN' } })
      .resolvesOnce({ Items: [] })
      .resolves({ Items: [patternItem(P2)] });
    const pending = db.createPattern({ patternId: P1, ...fields }, TODAY, NOW, check);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ result: { ok: false, error: 'availability_overlap' }, attempts: 2 });
    expect(check).toHaveBeenCalledTimes(2);
    expect(transactions()).toHaveLength(1);
  });
});

describe('updatePattern', () => {
  const TODAY = '2026-11-12';
  const changed = { ...fields, start: '07:00', typeId: POOL, validUntil: '2026-12-31' };

  it('writes the whole item again, keeping createdAt', async () => {
    onPatterns(patternItem(P1), patternItem(P2, { weekday: 2 }));
    const check = vi.fn(() => null);
    const locked = await db.updatePattern({ patternId: P1, ...changed }, TODAY, NOW, check);
    expect(locked).toEqual({
      result: { ok: true, value: { patternId: P1, ...changed, createdAt: EARLIER, updatedAt: NOW } },
      attempts: 1,
    });
    expect(transactions()[0]!.TransactItems![1]).toEqual({
      Put: { TableName: TABLE, Item: { PK: 'PATTERN', SK: P1, ...changed, createdAt: EARLIER, updatedAt: NOW } },
    });
  });

  it('answers pattern_not_found, without calling the check or writing, when the pattern is not there', async () => {
    onPatterns(patternItem(P2));
    const check = vi.fn(() => null);
    expect(await db.updatePattern({ patternId: P1, ...changed }, TODAY, NOW, check)).toEqual({
      result: { ok: false, error: 'pattern_not_found' },
      attempts: 1,
    });
    expect(check).not.toHaveBeenCalled();
    expect(transactions()).toHaveLength(0);
  });

  it('writes nothing when the check refuses', async () => {
    onPatterns(patternItem(P1));
    const refusal = { error: 'availability_overlap' as const, message: 'On 2026-11-16 …' };
    expect(await db.updatePattern({ patternId: P1, ...changed }, TODAY, NOW, () => refusal)).toEqual({
      result: { ok: false, ...refusal },
      attempts: 1,
    });
    expect(transactions()).toHaveLength(0);
  });
});

describe('deletePattern', () => {
  const TODAY = '2026-11-12';

  it('deletes the PATTERN item after the lock, with no condition', async () => {
    onPatterns(patternItem(P1));
    expect(await db.deletePattern(P1, TODAY, NOW, () => null)).toEqual({ result: { ok: true, value: null }, attempts: 1 });
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ Delete: { TableName: TABLE, Key: { PK: 'PATTERN', SK: P1 } } });
  });

  it('answers pattern_not_found when the pattern is not there', async () => {
    const check = vi.fn(() => null);
    expect(await db.deletePattern(P1, TODAY, NOW, check)).toEqual({ result: { ok: false, error: 'pattern_not_found' }, attempts: 1 });
    expect(check).not.toHaveBeenCalled();
    expect(transactions()).toHaveLength(0);
  });

  it('writes nothing when the check refuses', async () => {
    onPatterns(patternItem(P1));
    const refusal = { error: 'availability_conflict' as const, message: '1 appointment would fall outside the availability', conflicts: [] };
    expect(await db.deletePattern(P1, TODAY, NOW, () => refusal)).toEqual({ result: { ok: false, ...refusal }, attempts: 1 });
    expect(transactions()).toHaveLength(0);
  });
});
