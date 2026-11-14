import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { AppointmentSnapshot } from '../../../src/lib/calendarEvents';
import type { CalendarState } from '../../../src/lib/calendarRules';

// calendarDb.changeAppointment (plan step 50; spec 8.4, 13.4, 15.2 v11): the reads inside the locked
// attempt, the six-item transaction, the marker, the retry. AC-22: now 2026-11-10T09:00Z; alice
// moves Monday 2026-11-16 09:00 local (08:00Z) to 10:00 local (09:00Z). The module reads its
// configuration once per container, so every test imports a fresh copy.
type CalendarDb = typeof import('../../../src/lib/calendarDb');
let db: CalendarDb;

const ddb = mockClient(DynamoDBDocumentClient);
const TABLE = 'calendar-test';
const STUDIO = '01JC0000000000000000000001';
const POOL = '01JC0000000000000000000002';
const OLD_ID = '01M70NR5E0Q7R2C9T5XH3KD8MV';
const NEW_ID = '01M70NR5E0Q7R2C9T5XH3KD8NW';
const EVENT_ID = '01M70NR5E0Q7R2C9T5XH3KD8EV';
const BOOKED_AT = '2026-11-01T09:00:00.000Z';
const NOW = '2026-11-10T09:00:00.000Z';
const TODAY = '2026-11-10';
const OLD_START = '2026-11-16T08:00:00.000Z';
const OLD_END = '2026-11-16T09:00:00.000Z';
const NEW_START = '2026-11-16T09:00:00.000Z';
const NEW_END = '2026-11-16T10:00:00.000Z';
const OLD_SK = `${OLD_START}#${OLD_ID}`;
const NEW_SK = `${NEW_START}#${NEW_ID}`;
const ALICE = { username: 'alice', role: 'user' } as const;
const ADMIN = { username: 'admin', role: 'admin' } as const;
const VALUES = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };
const SETTINGS = { timeZone: 'Europe/Rome', ...VALUES, updatedAt: null, updatedBy: null };

const transactionCancelled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: `Transaction cancelled [${codes.join(', ')}]`,
    $metadata: {},
    CancellationReasons: codes.map((Code) => (Code === 'None' ? { Code } : { Code, Message: 'The conditional request failed' })),
  });
const lockBusy = () => transactionCancelled('ConditionalCheckFailed', 'None', 'None', 'None', 'None', 'None');

async function load(): Promise<CalendarDb> {
  vi.stubEnv('CALENDAR_TABLE', TABLE);
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.resetModules();
  return import('../../../src/lib/calendarDb');
}

const apptItem = (more: Record<string, unknown> = {}) => ({
  PK: 'APPT',
  SK: OLD_SK,
  userId: 'sub-alice',
  username: 'alice',
  start: OLD_START,
  end: OLD_END,
  date: '2026-11-16',
  typeId: STUDIO,
  typeNameAtBooking: 'Old studio name',
  note: 'my note',
  status: 'booked',
  createdAt: BOOKED_AT,
  createdBy: ALICE,
  updatedAt: BOOKED_AT,
  updatedBy: ALICE,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  replaces: null,
  replacedBy: null,
  version: 3,
  ...more,
});
const oldSnapshot = (more: Partial<AppointmentSnapshot> = {}): AppointmentSnapshot => {
  const { PK, SK, ...attributes } = apptItem();
  void PK;
  void SK;
  return { appointmentId: OLD_ID, ...(attributes as Omit<AppointmentSnapshot, 'appointmentId'>), ...more };
};
// The old appointment as stored after the change by `by`.
const oldAfter = (by: typeof ALICE | typeof ADMIN = ALICE) =>
  oldSnapshot({ status: 'cancelled', cancelledAt: NOW, cancelledBy: by, cancelReason: 'changed', replacedBy: NEW_ID, updatedAt: NOW, updatedBy: by, version: 4 });
// The new appointment as stored.
const newStored = (more: Partial<AppointmentSnapshot> = {}): AppointmentSnapshot => ({
  appointmentId: NEW_ID,
  userId: 'sub-alice',
  username: 'alice',
  start: NEW_START,
  end: NEW_END,
  date: '2026-11-16',
  typeId: STUDIO,
  typeNameAtBooking: 'Studio',
  note: 'my note',
  status: 'booked',
  createdAt: NOW,
  createdBy: ALICE,
  updatedAt: NOW,
  updatedBy: ALICE,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  replaces: OLD_ID,
  replacedBy: null,
  version: 1,
  ...more,
});
const withoutVersionAndUser = ({ userId, version, typeNameAtBooking, ...rest }: AppointmentSnapshot, typeName: string) => {
  void userId;
  void version;
  void typeNameAtBooking;
  return { ...rest, typeName };
};

const gets = () => ddb.commandCalls(GetCommand).map((call) => call.args[0].input);
const queries = () => ddb.commandCalls(QueryCommand).map((call) => call.args[0].input);
const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);
const onPointer = () => ddb.on(GetCommand, { Key: { PK: `APPTID#${OLD_ID}`, SK: 'APPTID' } });
const onAppt = () => ddb.on(GetCommand, { Key: { PK: 'APPT', SK: OLD_SK } });
const onTypes = () => ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'TYPE' } });
const onAppts = () => ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } });
const typeItem = (typeId: string, name: string) => ({ PK: 'TYPE', SK: typeId, name, nameKey: name.toLowerCase(), createdAt: BOOKED_AT, updatedAt: BOOKED_AT });

const change = (more: Partial<Parameters<CalendarDb['changeAppointment']>[0]> = {}) => ({
  appointmentId: OLD_ID,
  newAppointmentId: NEW_ID,
  eventId: EVENT_ID,
  start: NEW_START,
  end: NEW_END,
  note: undefined,
  by: ALICE,
  ...more,
});
const studio = () => ({ window: { typeId: STUDIO } });

beforeEach(async () => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
  onPointer().resolves({ Item: { PK: `APPTID#${OLD_ID}`, SK: 'APPTID', sk: OLD_SK } });
  onAppt().resolves({ Item: apptItem() });
  onTypes().resolves({ Items: [typeItem(STUDIO, 'Studio'), typeItem(POOL, 'Pool')] });
  onAppts().resolves({ Items: [apptItem()] });
  db = await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('changeAppointment (8.4, 13.4 v11)', () => {
  it('reads inside the attempt, consistently: the lock, the settings, the pointer, the old APPT, and the state', async () => {
    await db.changeAppointment(change(), TODAY, NOW, studio);
    expect(gets().map((g) => [g.Key, g.ConsistentRead])).toEqual([
      [{ PK: 'LOCK', SK: 'LOCK' }, true],
      [{ PK: 'SETTINGS', SK: 'SETTINGS' }, true],
      [{ PK: `APPTID#${OLD_ID}`, SK: 'APPTID' }, true],
      [{ PK: 'APPT', SK: OLD_SK }, true],
    ]);
    // The availability state of 13.2: TYPE, PATTERN whole; OVERRIDE, WINDOW from today; APPT from now − 24 h.
    expect(queries().map((q) => [q.ExpressionAttributeValues, q.ConsistentRead])).toEqual([
      [{ ':pk': 'TYPE' }, true],
      [{ ':pk': 'PATTERN' }, true],
      [{ ':pk': 'OVERRIDE', ':from': TODAY }, true],
      [{ ':pk': 'WINDOW', ':from': TODAY }, true],
      [{ ':pk': 'APPT', ':from': '2026-11-09T09:00:00.000Z' }, true],
    ]);
  });

  it('hands the check the old appointment as stored, the state and the settings', async () => {
    const check = vi.fn(studio);
    await db.changeAppointment(change(), TODAY, NOW, check);
    const [appointment, state, settings] = check.mock.calls[0]! as unknown as [AppointmentSnapshot, CalendarState, unknown];
    expect(appointment).toEqual(oldSnapshot());
    expect(state.appointments).toEqual([
      { appointmentId: OLD_ID, userId: 'sub-alice', username: 'alice', start: OLD_START, end: OLD_END, date: '2026-11-16', typeId: STUDIO, status: 'booked' },
    ]);
    expect(state.types.map((t) => t.typeId)).toEqual([STUDIO, POOL]);
    expect(settings).toEqual(SETTINGS);
  });

  it('no pointer hands the check null; a refusal is answered as is and nothing is written', async () => {
    onPointer().resolves({});
    const check = vi.fn((_a: AppointmentSnapshot | null) => ({ error: 'appointment_not_found' as const, message: 'No appointment with this id' }));
    const { result } = await db.changeAppointment(change(), TODAY, NOW, check);
    expect(check.mock.calls[0]![0]).toBeNull();
    expect(result).toEqual({ ok: false, error: 'appointment_not_found', message: 'No appointment with this id' });
    expect(transactions()).toHaveLength(0);
  });

  it('writes the exact six-item transaction: lock, Update old APPT, Put new APPT, Put APPTID, Put EVENT, marker', async () => {
    await db.changeAppointment(change(), TODAY, NOW, studio);
    expect(transactions()).toHaveLength(1);
    const [lock, update, put, pointer, event, marker, ...rest] = transactions()[0]!.TransactItems!;
    expect(rest).toEqual([]);
    expect(lock!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    expect(update).toEqual({
      Update: {
        TableName: TABLE,
        Key: { PK: 'APPT', SK: OLD_SK },
        UpdateExpression:
          'SET #status = :status, #cancelledAt = :cancelledAt, #cancelledBy = :cancelledBy, #cancelReason = :cancelReason, #replacedBy = :replacedBy, #updatedAt = :updatedAt, #updatedBy = :updatedBy, #version = :version',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#cancelledAt': 'cancelledAt',
          '#cancelledBy': 'cancelledBy',
          '#cancelReason': 'cancelReason',
          '#replacedBy': 'replacedBy',
          '#updatedAt': 'updatedAt',
          '#updatedBy': 'updatedBy',
          '#version': 'version',
        },
        ExpressionAttributeValues: {
          ':status': 'cancelled',
          ':cancelledAt': NOW,
          ':cancelledBy': ALICE,
          ':cancelReason': 'changed',
          ':replacedBy': NEW_ID,
          ':updatedAt': NOW,
          ':updatedBy': ALICE,
          ':version': 4,
        },
      },
    });
    expect(update!.Update!.ConditionExpression).toBeUndefined();
    const { appointmentId, ...attributes } = newStored();
    void appointmentId;
    expect(put).toEqual({ Put: { TableName: TABLE, Item: { PK: 'APPT', SK: NEW_SK, ...attributes } } });
    expect(pointer).toEqual({ Put: { TableName: TABLE, Item: { PK: `APPTID#${NEW_ID}`, SK: 'APPTID', sk: NEW_SK } } });
    expect(event).toEqual({
      Put: {
        TableName: TABLE,
        Item: {
          PK: 'EVENT',
          SK: `${NOW}#${EVENT_ID}`,
          eventId: EVENT_ID,
          type: 'appointment.changed',
          occurredAt: NOW,
          actor: ALICE,
          recipients: { userId: 'sub-alice', username: 'alice', administrator: true },
          appointment: newStored(),
          previous: oldAfter(),
          schemaVersion: 1,
        },
      },
    });
    expect(marker).toEqual({
      ConditionCheck: { TableName: TABLE, Key: { PK: 'DELETEDUSER#sub-alice', SK: 'DELETEDUSER' }, ConditionExpression: 'attribute_not_exists(PK)' },
    });
  });

  it('answers both appointments as stored, each with the current name of its type, and the settings', async () => {
    const { result, attempts } = await db.changeAppointment(change(), TODAY, NOW, studio);
    expect(attempts).toBe(1);
    expect(result).toEqual({
      ok: true,
      value: {
        cancelled: withoutVersionAndUser(oldAfter(), 'Studio'),
        booked: withoutVersionAndUser(newStored(), 'Studio'),
        settings: SETTINGS,
      },
    });
  });

  it('the new one takes the window’s type and its current name; the old one’s gone type answers its snapshot', async () => {
    onTypes().resolves({ Items: [typeItem(POOL, 'Pool')] });
    const { result } = await db.changeAppointment(change(), TODAY, NOW, () => ({ window: { typeId: POOL } }));
    expect(result.ok && result.value.cancelled.typeName).toBe('Old studio name');
    expect(result.ok && result.value.booked).toMatchObject({ typeId: POOL, typeName: 'Pool' });
    expect(transactions()[0]!.TransactItems![2]!.Put!.Item).toMatchObject({ typeId: POOL, typeNameAtBooking: 'Pool' });
  });

  it('R-CHG-03: the note absent is kept, null clears it, a string replaces it', async () => {
    const notes: unknown[] = [];
    for (const note of [undefined, null, 'new note']) {
      ddb.resetHistory();
      const { result } = await db.changeAppointment(change({ note }), TODAY, NOW, studio);
      notes.push([result.ok && result.value.booked.note, transactions()[0]!.TransactItems![2]!.Put!.Item!.note]);
    }
    expect(notes).toEqual([
      ['my note', 'my note'],
      [null, null],
      ['new note', 'new note'],
    ]);
  });

  it('the Administrator’s change: the caller is the actor, the User stays the old one’s; the actor copied field by field', async () => {
    const by = { username: 'admin', role: 'admin', extra: 'x' } as unknown as typeof ADMIN;
    await db.changeAppointment(change({ by }), TODAY, NOW, studio);
    const items = transactions()[0]!.TransactItems!;
    expect(items[1]!.Update!.ExpressionAttributeValues![':cancelledBy']).toEqual(ADMIN);
    expect(items[2]!.Put!.Item).toMatchObject({ userId: 'sub-alice', username: 'alice', createdBy: ADMIN, updatedBy: ADMIN });
    expect(items[4]!.Put!.Item).toMatchObject({ actor: ADMIN, previous: oldAfter(ADMIN) });
    expect(items[5]!.ConditionCheck!.Key).toEqual({ PK: 'DELETEDUSER#sub-alice', SK: 'DELETEDUSER' });
  });

  it('R-BOOK-10: a failed marker check answers user_not_found without a retry', async () => {
    ddb.on(TransactWriteCommand).rejects(transactionCancelled('None', 'None', 'None', 'None', 'None', 'ConditionalCheckFailed'));
    const { result, attempts } = await db.changeAppointment(change(), TODAY, NOW, studio);
    expect(result).toEqual({ ok: false, error: 'user_not_found' });
    expect(attempts).toBe(1);
    expect(transactions()).toHaveLength(1);
  });

  it('a retry re-reads and re-checks: the old one cancelled by someone else meanwhile answers what the check says', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy());
    onAppt().resolvesOnce({ Item: apptItem() }).resolves({ Item: apptItem({ status: 'cancelled', version: 4 }) });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const check = vi.fn((a: AppointmentSnapshot | null) => (a!.status === 'booked' ? studio() : { error: 'appointment_not_active' as const }));
      const pending = db.changeAppointment(change(), TODAY, NOW, check);
      await vi.runAllTimersAsync();
      const { result, attempts } = await pending;
      expect(attempts).toBe(2);
      expect(check).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: false, error: 'appointment_not_active' });
      expect(transactions()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a retry re-reads the state: the new slot taken meanwhile answers slot_taken, nothing more written', async () => {
    const taken = { ...apptItem(), SK: `${NEW_START}#X`, userId: 'sub-bob', username: 'bob', start: NEW_START, end: NEW_END };
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy());
    onAppts().resolvesOnce({ Items: [apptItem()] }).resolves({ Items: [apptItem(), taken] });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const check = vi.fn((_a: AppointmentSnapshot | null, state: CalendarState) =>
        state.appointments.some((a) => a.userId === 'sub-bob') ? { error: 'slot_taken' as const } : studio(),
      );
      const pending = db.changeAppointment(change(), TODAY, NOW, check);
      await vi.runAllTimersAsync();
      const { result, attempts } = await pending;
      expect(attempts).toBe(2);
      expect(result).toEqual({ ok: false, error: 'slot_taken' });
      expect(transactions()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('three lost attempts answer ConcurrentUpdateError', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const pending = db.changeAppointment(change(), TODAY, NOW, studio).catch((err: unknown) => err);
      await vi.runAllTimersAsync();
      const err = await pending;
      expect(err).toBeInstanceOf(db.ConcurrentUpdateError);
      expect((err as InstanceType<CalendarDb['ConcurrentUpdateError']>).attempts).toBe(3);
      expect(transactions()).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
