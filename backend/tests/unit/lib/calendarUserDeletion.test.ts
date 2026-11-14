import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// calendarDb's part of a user deletion (plan step 51; spec 10.2 v12, 13.2, 13.4): the deleted-user
// marker and the cancellation of the User's active appointments not yet ended, in chunks of 40,
// each under the lock. The module reads its configuration once per container, so every test
// imports a fresh copy.
type CalendarDb = typeof import('../../../src/lib/calendarDb');
let db: CalendarDb;

const ddb = mockClient(DynamoDBDocumentClient);
const TABLE = 'calendar-test';
const TYPE = '01JC0000000000000000000001';
const NOW = '2026-11-15T08:00:00.000Z';
const SINCE = '2026-11-14T08:00:00.000Z';
const BOOKED_AT = '2026-11-10T09:00:00.000Z';
const ADMIN = { username: 'admin', role: 'admin' } as const;
const DAVE = { username: 'dave', role: 'user' } as const;
const USER = { userId: 'sub-dave', username: 'dave' };

const cancelledTx = (...codes: string[]) =>
  new TransactionCanceledException({
    message: `Transaction cancelled [${codes.join(', ')}]`,
    $metadata: {},
    CancellationReasons: codes.map((Code) => (Code === 'None' ? { Code } : { Code, Message: 'The conditional request failed' })),
  });
const lockBusy = () => cancelledTx('ConditionalCheckFailed', 'None');

async function load(): Promise<CalendarDb> {
  vi.stubEnv('CALENDAR_TABLE', TABLE);
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.resetModules();
  return import('../../../src/lib/calendarDb');
}

// Ids sort as their number, so the SK order is the order of `n`.
const idOf = (n: number) => `01M70NR5E0Q7R2C9T5XH3K${String(n).padStart(4, '0')}`;
// An appointment item with every attribute of architecture 5.3; n-th hour from 2026-11-15T06:00Z.
const apptItem = (n: number, more: Record<string, unknown> = {}) => {
  const start = new Date(Date.parse('2026-11-15T06:00:00.000Z') + n * 3_600_000).toISOString();
  const end = (more.end as string | undefined) ?? new Date(Date.parse(start) + 3_600_000).toISOString();
  return {
    PK: 'APPT',
    SK: `${start}#${idOf(n)}`,
    userId: 'sub-dave',
    username: 'dave',
    start,
    end,
    date: start.slice(0, 10),
    typeId: TYPE,
    typeNameAtBooking: 'Studio',
    note: 'my note',
    status: 'booked',
    createdAt: BOOKED_AT,
    createdBy: DAVE,
    updatedAt: BOOKED_AT,
    updatedBy: DAVE,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    replaces: null,
    replacedBy: null,
    version: 1,
    ...more,
  };
};

const queries = () => ddb.commandCalls(QueryCommand).map((call) => call.args[0].input);
const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);
const sizes = () => transactions().map((t) => t.TransactItems!.length);
const updatedKeys = (index: number) =>
  transactions()[index]!.TransactItems!.flatMap((item) => (item.Update && item.Update.Key!.PK === 'APPT' ? [item.Update.Key!.SK as string] : []));
const eventIds = () =>
  transactions().flatMap((t) => t.TransactItems!.flatMap((item) => (item.Put && item.Put.Item!.PK === 'EVENT' ? [item.Put.Item!.eventId as string] : [])));

// Each new event id in turn: EV0001, EV0002, ...
let counter = 0;
const newEventId = vi.fn(() => `01M70NR5E0Q7R2C9T5XHEV${String(++counter).padStart(4, '0')}`);

beforeEach(async () => {
  ddb.reset();
  counter = 0;
  newEventId.mockClear();
  ddb.on(GetCommand).resolves({ Item: { PK: 'LOCK', SK: 'LOCK', version: 7 } });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
  db = await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const marker = {
  Put: {
    TableName: TABLE,
    Item: { PK: 'DELETEDUSER#sub-dave', SK: 'DELETEDUSER', username: 'dave', deletedAt: NOW, deletedBy: ADMIN },
  },
};

describe('markUserDeleted (10.2, 13.4)', () => {
  it('no appointment: one transaction of two items, the lock update and the marker (a plain Put, no condition)', async () => {
    const result = await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    expect(result).toEqual({ cancelledCount: 0, attempts: 1 });
    expect(transactions()).toHaveLength(1);
    const [lock, put, ...rest] = transactions()[0]!.TransactItems!;
    expect(rest).toEqual([]);
    expect(lock!.Update).toMatchObject({ Key: { PK: 'LOCK', SK: 'LOCK' }, ConditionExpression: '#version = :current', ExpressionAttributeValues: { ':current': 7, ':next': 8 } });
    expect(put).toEqual(marker);
    expect(newEventId).not.toHaveBeenCalled();
  });

  it('reads the lock and APPT from now − 24 h, consistently, inside the attempt, and nothing else', async () => {
    await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    expect(ddb.commandCalls(GetCommand).map((c) => c.args[0].input)).toEqual([{ TableName: TABLE, Key: { PK: 'LOCK', SK: 'LOCK' }, ConsistentRead: true }]);
    expect(queries()).toEqual([
      {
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND SK >= :from',
        ExpressionAttributeValues: { ':pk': 'APPT', ':from': SINCE },
        ConsistentRead: true,
        ExclusiveStartKey: undefined,
      },
    ]);
  });

  it('selects by userId, booked and end > now: one in progress is cancelled; an ended, a cancelled one and another account’s with the same name are left alone', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        apptItem(0, { end: '2026-11-15T07:30:00.000Z' }), // ended (06:00–07:30, now 08:00)
        apptItem(1, { end: '2026-11-15T08:00:00.000Z' }), // ends exactly now: ended
        apptItem(2, { end: '2026-11-15T09:00:00.000Z' }), // in progress (08:00–09:00)
        apptItem(3, { status: 'cancelled', cancelReason: 'cancelled' }),
        apptItem(4, { userId: 'sub-earlier-dave' }), // an earlier account named dave (R-DEL-02)
        apptItem(5),
      ],
    });
    const result = await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    expect(result).toEqual({ cancelledCount: 2, attempts: 1 });
    expect(updatedKeys(0)).toEqual([apptItem(2).SK, apptItem(5).SK]);
  });

  it('writes the exact items of a chunk: lock, marker, then per appointment Update APPT (user_deleted) and Put EVENT appointment.cancelled', async () => {
    ddb.on(QueryCommand).resolves({ Items: [apptItem(4)] });
    await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    const [lock, put, appt, event, ...rest] = transactions()[0]!.TransactItems!;
    expect(rest).toEqual([]);
    expect(lock!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    expect(put).toEqual(marker);
    expect(appt).toEqual({
      Update: {
        TableName: TABLE,
        Key: { PK: 'APPT', SK: apptItem(4).SK },
        UpdateExpression:
          'SET #status = :status, #cancelledAt = :cancelledAt, #cancelledBy = :cancelledBy, #cancelReason = :cancelReason, #updatedAt = :updatedAt, #updatedBy = :updatedBy, #version = :version',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#cancelledAt': 'cancelledAt',
          '#cancelledBy': 'cancelledBy',
          '#cancelReason': 'cancelReason',
          '#updatedAt': 'updatedAt',
          '#updatedBy': 'updatedBy',
          '#version': 'version',
        },
        ExpressionAttributeValues: {
          ':status': 'cancelled',
          ':cancelledAt': NOW,
          ':cancelledBy': ADMIN,
          ':cancelReason': 'user_deleted',
          ':updatedAt': NOW,
          ':updatedBy': ADMIN,
          ':version': 2,
        },
      },
    });
    const attributes = Object.fromEntries(Object.entries(apptItem(4)).filter(([key]) => key !== 'PK' && key !== 'SK'));
    const after = {
      appointmentId: idOf(4),
      ...attributes,
      status: 'cancelled',
      cancelledAt: NOW,
      cancelledBy: ADMIN,
      cancelReason: 'user_deleted',
      updatedAt: NOW,
      updatedBy: ADMIN,
      version: 2,
    };
    expect(event).toEqual({
      Put: {
        TableName: TABLE,
        Item: {
          PK: 'EVENT',
          SK: `${NOW}#01M70NR5E0Q7R2C9T5XHEV0001`,
          eventId: '01M70NR5E0Q7R2C9T5XHEV0001',
          type: 'appointment.cancelled',
          occurredAt: NOW,
          actor: ADMIN,
          recipients: { userId: 'sub-dave', username: 'dave', administrator: true },
          appointment: after,
          schemaVersion: 1,
        },
      },
    });
  });

  it('copies the actor field by field', async () => {
    const by = { username: 'admin', role: 'admin', extra: 'x' } as unknown as typeof ADMIN;
    await db.markUserDeleted(USER, by, NOW, newEventId);
    expect(transactions()[0]!.TransactItems![1]!.Put!.Item!.deletedBy).toEqual(ADMIN);
  });

  it('41 appointments: two transactions, 82 items (lock, marker, 40 × 2) then 3 (lock, 1 × 2), the second re-reading', async () => {
    const all = Array.from({ length: 41 }, (_, i) => apptItem(i + 3));
    const after40 = all.map((item, i) => (i < 40 ? { ...item, status: 'cancelled', cancelReason: 'user_deleted', version: 2 } : item));
    ddb.on(QueryCommand).resolvesOnce({ Items: all }).resolves({ Items: after40 });
    const result = await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    expect(result).toEqual({ cancelledCount: 41, attempts: 2 });
    expect(sizes()).toEqual([82, 3]);
    expect(queries()).toHaveLength(2);
    expect(updatedKeys(0)).toEqual(all.slice(0, 40).map((item) => item.SK));
    expect(updatedKeys(1)).toEqual([all[40]!.SK]);
    expect(transactions()[1]!.TransactItems!.some((item) => item.Put?.Item?.PK === 'DELETEDUSER#sub-dave')).toBe(false);
    expect(new Set(eventIds()).size).toBe(41);
  });

  it('40 appointments: one transaction of 82 items and no second read', async () => {
    ddb.on(QueryCommand).resolves({ Items: Array.from({ length: 40 }, (_, i) => apptItem(i + 3)) });
    const result = await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    expect(result).toEqual({ cancelledCount: 40, attempts: 1 });
    expect(sizes()).toEqual([82]);
    expect(queries()).toHaveLength(1);
  });

  it('a later chunk that finds nothing left (cancelled by someone else meanwhile) writes nothing', async () => {
    const all = Array.from({ length: 41 }, (_, i) => apptItem(i + 3));
    ddb.on(QueryCommand).resolvesOnce({ Items: all }).resolves({ Items: all.map((item) => ({ ...item, status: 'cancelled' })) });
    const result = await db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    expect(result).toEqual({ cancelledCount: 40, attempts: 2 });
    expect(sizes()).toEqual([82]);
  });

  it('a retry re-reads: one cancelled by someone else between two attempts is not cancelled twice, and the same event ids are written', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy()).resolves({});
    ddb.on(QueryCommand)
      .resolvesOnce({ Items: [apptItem(3), apptItem(4)] })
      .resolves({ Items: [apptItem(3, { status: 'cancelled', cancelReason: 'cancelled', version: 2 }), apptItem(4)] });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    const pending = db.markUserDeleted(USER, ADMIN, NOW, newEventId);
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result).toEqual({ cancelledCount: 1, attempts: 2 });
    expect(updatedKeys(0)).toEqual([apptItem(3).SK, apptItem(4).SK]);
    expect(updatedKeys(1)).toEqual([apptItem(4).SK]);
    const [first, second] = [eventIds().slice(0, 2), eventIds().slice(2)];
    expect(second).toEqual([first[1]]);
    expect(newEventId).toHaveBeenCalledTimes(2);
    expect(transactions()[1]!.TransactItems![1]).toEqual(marker);
  });

  it('three lost attempts answer ConcurrentUpdateError', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    const pending = db.markUserDeleted(USER, ADMIN, NOW, newEventId).catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    const err = await pending;
    expect(err).toBeInstanceOf(db.ConcurrentUpdateError);
    expect((err as InstanceType<CalendarDb['ConcurrentUpdateError']>).attempts).toBe(3);
    expect(transactions()).toHaveLength(3);
  });

  it('a failure in the second chunk is thrown; the first chunk stays written', async () => {
    const all = Array.from({ length: 41 }, (_, i) => apptItem(i + 3));
    const after40 = all.map((item, i) => (i < 40 ? { ...item, status: 'cancelled' } : item));
    ddb.on(QueryCommand).resolvesOnce({ Items: all }).resolves({ Items: after40 });
    ddb.on(TransactWriteCommand).resolvesOnce({}).rejects(new Error('throttled'));
    await expect(db.markUserDeleted(USER, ADMIN, NOW, newEventId)).rejects.toThrow('throttled');
    expect(sizes()).toEqual([82, 3]);
  });
});
