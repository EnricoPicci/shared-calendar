import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { AppointmentSnapshot } from '../../../src/lib/calendarEvents';

// calendarDb's appointment reads and writes: the list (docs/SHARED_CALENDAR_SPEC.md section 11.1,
// route 16), the lookup by id through the pointer (docs/SHARED_CALENDAR_SPEC.md section 13.2), the
// cancel (docs/SHARED_CALENDAR_SPEC.md section 8.3) and the note (docs/SHARED_CALENDAR_SPEC.md
// section 8.5) under the lock (docs/SHARED_CALENDAR_SPEC.md section 13.4). The module reads its
// configuration once per container, so every test imports a fresh copy.
type CalendarDb = typeof import('../../../src/lib/calendarDb');
let db: CalendarDb;

const ddb = mockClient(DynamoDBDocumentClient);
const TABLE = 'calendar-test';
const STUDIO = '01JC0000000000000000000001';
const APPT_ID = '01M70NR5E0Q7R2C9T5XH3KD8MV';
const EVENT_ID = '01M70NR5E0Q7R2C9T5XH3KD8EV';
const BOOKED_AT = '2026-11-10T09:00:00.000Z';
// The scenario of docs/SHARED_CALENDAR_SPEC.md AC-20: now 2026-11-15T09:00 local (08:00Z); the
// appointment 2026-11-16 09:00 local (08:00Z).
const NOW = '2026-11-15T08:00:00.000Z';
const START = '2026-11-16T08:00:00.000Z';
const END = '2026-11-16T09:00:00.000Z';
const SK = `${START}#${APPT_ID}`;
const ALICE = { username: 'alice', role: 'user' } as const;
const ADMIN = { username: 'admin', role: 'admin' } as const;
const VALUES = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };

const cancelled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: `Transaction cancelled [${codes.join(', ')}]`,
    $metadata: {},
    CancellationReasons: codes.map((Code) => (Code === 'None' ? { Code } : { Code, Message: 'The conditional request failed' })),
  });
const lockBusy = () => cancelled('ConditionalCheckFailed', 'None', 'None');

async function load(): Promise<CalendarDb> {
  vi.stubEnv('CALENDAR_TABLE', TABLE);
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.resetModules();
  return import('../../../src/lib/calendarDb');
}

/** Every attribute of the appointment item (docs/ARCHITECTURE.md section 5.3), as a booking writes it. */
const apptItem = (more: Record<string, unknown> = {}) => ({
  PK: 'APPT',
  SK,
  userId: 'sub-alice',
  username: 'alice',
  start: START,
  end: END,
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
  version: 1,
  ...more,
});
// The same appointment as the module hands it to the check: the stored attributes, with the id.
const snapshot = (more: Partial<AppointmentSnapshot> = {}): AppointmentSnapshot => {
  const attributes = Object.fromEntries(Object.entries(apptItem()).filter(([key]) => key !== 'PK' && key !== 'SK'));
  return { appointmentId: APPT_ID, ...(attributes as Omit<AppointmentSnapshot, 'appointmentId'>), ...more };
};
// The response fields (docs/SHARED_CALENDAR_SPEC.md section 11.5) but cancellableUntil.
const response = (more: Record<string, unknown> = {}) => ({
  appointmentId: APPT_ID,
  username: 'alice',
  start: START,
  end: END,
  date: '2026-11-16',
  typeId: STUDIO,
  typeName: 'Studio',
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
  ...more,
});
const SETTINGS = { timeZone: 'Europe/Rome', ...VALUES, updatedAt: null, updatedBy: null };

const gets = () => ddb.commandCalls(GetCommand).map((call) => call.args[0].input);
const queries = () => ddb.commandCalls(QueryCommand).map((call) => call.args[0].input);
const transactions = () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input);
const onPointer = () => ddb.on(GetCommand, { Key: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID' } });
const onAppt = () => ddb.on(GetCommand, { Key: { PK: 'APPT', SK } });
const onType = () => ddb.on(GetCommand, { Key: { PK: 'TYPE', SK: STUDIO } });

beforeEach(async () => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
  onPointer().resolves({ Item: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID', sk: SK } });
  onAppt().resolves({ Item: apptItem() });
  onType().resolves({ Item: { PK: 'TYPE', SK: STUDIO, name: 'Studio', nameKey: 'studio' } });
  db = await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Listing ──────────────────────────────────────────────────────────────────────────────────

// Test names: route numbers are those of docs/SHARED_CALENDAR_SPEC.md (routes in its section 11.1).
describe('listAppointments (route 16)', () => {
  const studio = { PK: 'TYPE', SK: STUDIO, name: 'Studio', nameKey: 'studio', createdAt: BOOKED_AT, updatedAt: BOOKED_AT };
  const item = (start: string, id: string, more: Record<string, unknown> = {}) => {
    const end = new Date(Date.parse(start) + 3_600_000).toISOString();
    return apptItem({ SK: `${start}#${id}`, start, end, ...more });
  };
  const onAppts = (...items: object[]) => ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } }).resolves({ Items: items });
  const ids = (list: { appointments: { appointment: { appointmentId: string } }[] }) => list.appointments.map((a) => a.appointment.appointmentId);
  const every = { owner: null, status: 'all' } as const;

  beforeEach(() => {
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'TYPE' } }).resolves({ Items: [studio] });
  });

  it('a range: the settings, every type and APPT BETWEEN the local midnight of from and the one after to, consistent', async () => {
    await db.listAppointments({ from: '2026-11-16', to: '2026-12-31' }, every, NOW);
    expect(gets()).toEqual([{ TableName: TABLE, Key: { PK: 'SETTINGS', SK: 'SETTINGS' }, ConsistentRead: true }]);
    expect(queries()).toEqual([
      {
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
        // Rome is UTC+1 in winter: local midnight of 2026-11-16 and of 2027-01-01.
        ExpressionAttributeValues: { ':pk': 'APPT', ':from': '2026-11-15T23:00:00.000Z', ':to': '2026-12-31T23:00:00.000Z' },
        ConsistentRead: true,
        ExclusiveStartKey: undefined,
      },
      { TableName: TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'TYPE' }, ConsistentRead: true, ExclusiveStartKey: undefined },
    ]);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('a range across the change to summer time: each bound is its own date’s local midnight', async () => {
    await db.listAppointments({ from: '2027-03-01', to: '2027-04-30' }, every, NOW);
    const appt = queries().find((q) => q.ExpressionAttributeValues![':pk'] === 'APPT')!;
    expect(appt.ExpressionAttributeValues).toEqual({ ':pk': 'APPT', ':from': '2027-02-28T23:00:00.000Z', ':to': '2027-04-30T22:00:00.000Z' });
  });

  it('upcoming: APPT with SK ≥ now − 24 h, keeping only those with end > now (one in progress included)', async () => {
    onAppts(
      item('2026-11-14T09:00:00.000Z', 'A1'), // ended yesterday
      item('2026-11-15T07:00:00.000Z', 'A2'), // ends exactly now: ended
      item('2026-11-15T07:30:00.000Z', 'A3'), // in progress
      item('2026-11-16T08:00:00.000Z', 'A4'),
    );
    const list = await db.listAppointments({ upcoming: true }, every, NOW);
    const appt = queries().find((q) => q.ExpressionAttributeValues![':pk'] === 'APPT')!;
    expect(appt).toEqual({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND SK >= :from',
      ExpressionAttributeValues: { ':pk': 'APPT', ':from': '2026-11-14T08:00:00.000Z' },
      ConsistentRead: true,
      ExclusiveStartKey: undefined,
    });
    expect(ids(list)).toEqual(['A3', 'A4']);
  });

  it('a range keeps an ended appointment: "ended" is not a status', async () => {
    onAppts(item('2026-11-14T09:00:00.000Z', 'A1'));
    const list = await db.listAppointments({ from: '2026-11-14', to: '2026-11-14' }, { owner: null, status: 'booked' }, NOW);
    expect(ids(list)).toEqual(['A1']);
  });

  it('filters on status: booked, cancelled, all; upcoming with a status filters the time selection', async () => {
    onAppts(item('2026-11-16T08:00:00.000Z', 'B1'), item('2026-11-16T09:00:00.000Z', 'C1', { status: 'cancelled', cancelReason: 'cancelled' }));
    const range = { from: '2026-11-16', to: '2026-11-16' };
    expect(ids(await db.listAppointments(range, { owner: null, status: 'booked' }, NOW))).toEqual(['B1']);
    expect(ids(await db.listAppointments(range, { owner: null, status: 'cancelled' }, NOW))).toEqual(['C1']);
    expect(ids(await db.listAppointments(range, every, NOW))).toEqual(['B1', 'C1']);
    expect(ids(await db.listAppointments({ upcoming: true }, { owner: null, status: 'cancelled' }, NOW))).toEqual(['C1']);
  });

  it('filters on the owner: by userId (a User), or by the stored username (the Administrator’s filter)', async () => {
    onAppts(
      item('2026-11-16T08:00:00.000Z', 'D1', { userId: 'sub-old-dave', username: 'dave' }),
      item('2026-11-16T09:00:00.000Z', 'D2', { userId: 'sub-new-dave', username: 'dave' }),
      item('2026-11-16T10:00:00.000Z', 'E1', { userId: 'sub-erin', username: 'erin' }),
    );
    const range = { from: '2026-11-16', to: '2026-11-16' };
    expect(ids(await db.listAppointments(range, { owner: { userId: 'sub-new-dave' }, status: 'all' }, NOW))).toEqual(['D2']);
    // The name means every account booked under it, an earlier deleted one included
    // (docs/SHARED_CALENDAR_SPEC.md section 11.1, the notes on route 16).
    expect(ids(await db.listAppointments(range, { owner: { username: 'dave' }, status: 'all' }, NOW))).toEqual(['D1', 'D2']);
    expect(ids(await db.listAppointments(range, { owner: { username: 'nobody' }, status: 'all' }, NOW))).toEqual([]);
    expect(ids(await db.listAppointments(range, every, NOW))).toEqual(['D1', 'D2', 'E1']);
  });

  it('sorts by start, then id, whatever order the items come in', async () => {
    onAppts(item('2026-11-16T10:00:00.000Z', 'Z9'), item('2026-11-16T08:00:00.000Z', 'B2'), item('2026-11-16T08:00:00.000Z', 'B1'));
    expect(ids(await db.listAppointments({ from: '2026-11-16', to: '2026-11-16' }, every, NOW))).toEqual(['B1', 'B2', 'Z9']);
  });

  it('follows every page of the APPT query', async () => {
    ddb
      .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } })
      .resolvesOnce({ Items: [item('2026-11-16T08:00:00.000Z', 'P1')], LastEvaluatedKey: { PK: 'APPT', SK: 'x' } })
      .resolves({ Items: [item('2026-11-16T09:00:00.000Z', 'P2')] });
    expect(ids(await db.listAppointments({ from: '2026-11-16', to: '2026-11-16' }, every, NOW))).toEqual(['P1', 'P2']);
    expect(queries().filter((q) => q.ExpressionAttributeValues![':pk'] === 'APPT').map((q) => q.ExclusiveStartKey)).toEqual([undefined, { PK: 'APPT', SK: 'x' }]);
  });

  it('answers the response fields with the owner’s userId apart, the current type name (or the snapshot), and the settings', async () => {
    onAppts(item(START, APPT_ID), item('2026-11-16T10:00:00.000Z', 'GONE', { typeId: 'DELETED-TYPE' }));
    const list = await db.listAppointments({ from: '2026-11-16', to: '2026-11-16' }, every, NOW);
    expect(list.settings).toEqual(SETTINGS);
    expect(list.appointments[0]).toEqual({ userId: 'sub-alice', appointment: response() });
    expect(list.appointments[1]!.appointment.typeName).toBe('Old studio name');
    expect(list.appointments[0]!.appointment).not.toHaveProperty('version');
  });
});

// ── The lookup by id, cancel and note ────────────────────────────────────────────────────────

// Test names: section numbers are those of docs/SHARED_CALENDAR_SPEC.md.
describe('cancelAppointment (8.3, 13.4)', () => {
  const change = { appointmentId: APPT_ID, eventId: EVENT_ID, by: ALICE };
  const allow = () => null;

  it('reads the lock, the settings and the pointer, then the APPT item, consistently, inside the attempt', async () => {
    await db.cancelAppointment(change, NOW, allow);
    const keys = gets().map((g) => [g.Key, g.ConsistentRead]);
    expect(keys).toEqual([
      [{ PK: 'LOCK', SK: 'LOCK' }, true],
      [{ PK: 'SETTINGS', SK: 'SETTINGS' }, true],
      [{ PK: `APPTID#${APPT_ID}`, SK: 'APPTID' }, true],
      [{ PK: 'APPT', SK }, true],
      [{ PK: 'TYPE', SK: STUDIO }, true],
    ]);
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(0);
  });

  it('hands the check the appointment as stored, with its id, and the settings', async () => {
    const check = vi.fn(allow);
    await db.cancelAppointment(change, NOW, check);
    expect(check).toHaveBeenCalledWith(snapshot(), SETTINGS);
  });

  it('the lookup: no pointer hands the check null (absent), and nothing is written', async () => {
    onPointer().resolves({});
    const check = vi.fn(() => ({ error: 'appointment_not_found' as const, message: 'No appointment with this id' }));
    const { result } = await db.cancelAppointment(change, NOW, check);
    expect(check).toHaveBeenCalledWith(null, SETTINGS);
    expect(result).toEqual({ ok: false, error: 'appointment_not_found', message: 'No appointment with this id' });
    expect(gets().some((g) => g.Key!.PK === 'APPT')).toBe(false);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('the lookup: a pointer without its APPT item is absent too (it cannot happen: both are written in one transaction, never deleted)', async () => {
    onAppt().resolves({});
    const check = vi.fn(() => ({ error: 'appointment_not_found' as const }));
    await db.cancelAppointment(change, NOW, check);
    expect(check).toHaveBeenCalledWith(null, SETTINGS);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('writes the exact three-item transaction: lock, Update APPT (the cancel attributes, no condition), Put EVENT', async () => {
    await db.cancelAppointment(change, NOW, allow);
    expect(transactions()).toHaveLength(1);
    const [lock, appt, event, ...rest] = transactions()[0]!.TransactItems!;
    expect(rest).toEqual([]);
    expect(lock!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    expect(appt).toEqual({
      Update: {
        TableName: TABLE,
        Key: { PK: 'APPT', SK },
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
          ':cancelledBy': ALICE,
          ':cancelReason': 'cancelled',
          ':updatedAt': NOW,
          ':updatedBy': ALICE,
          ':version': 2,
        },
      },
    });
    const after = snapshot({ status: 'cancelled', cancelledAt: NOW, cancelledBy: ALICE, cancelReason: 'cancelled', updatedAt: NOW, updatedBy: ALICE, version: 2 });
    expect(event).toEqual({
      Put: {
        TableName: TABLE,
        Item: {
          PK: 'EVENT',
          SK: `${NOW}#${EVENT_ID}`,
          eventId: EVENT_ID,
          type: 'appointment.cancelled',
          occurredAt: NOW,
          actor: ALICE,
          recipients: { userId: 'sub-alice', username: 'alice', administrator: true },
          appointment: after,
          schemaVersion: 1,
        },
      },
    });
  });

  it('answers the appointment as stored after the cancel, with the current type name, and the settings', async () => {
    const { result, attempts } = await db.cancelAppointment({ ...change, by: ADMIN }, NOW, allow);
    expect(attempts).toBe(1);
    expect(result).toEqual({
      ok: true,
      value: {
        appointment: response({ status: 'cancelled', cancelledAt: NOW, cancelledBy: ADMIN, cancelReason: 'cancelled', updatedAt: NOW, updatedBy: ADMIN }),
        settings: SETTINGS,
      },
    });
  });

  it('answers the snapshot name when the type is gone, and copies the actor field by field', async () => {
    onType().resolves({});
    const by = { username: 'admin', role: 'admin', extra: 'x' } as unknown as typeof ADMIN;
    const { result } = await db.cancelAppointment({ ...change, by }, NOW, allow);
    expect(result.ok && result.value.appointment.typeName).toBe('Old studio name');
    expect(transactions()[0]!.TransactItems![1]!.Update!.ExpressionAttributeValues![':cancelledBy']).toEqual(ADMIN);
  });

  it('a retry re-reads and re-checks: cancelled by someone else between two attempts answers what the check says, nothing written', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy());
    onAppt().resolvesOnce({ Item: apptItem() }).resolves({ Item: apptItem({ status: 'cancelled', version: 2 }) });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const check = vi.fn((a: AppointmentSnapshot | null) => (a!.status === 'booked' ? null : { error: 'appointment_not_active' as const }));
      const pending = db.cancelAppointment(change, NOW, check);
      await vi.runAllTimersAsync();
      const { result, attempts } = await pending;
      expect(attempts).toBe(2);
      expect(check).toHaveBeenCalledTimes(2);
      expect(check.mock.calls[1]![0]).toMatchObject({ status: 'cancelled', version: 2 });
      expect(result).toEqual({ ok: false, error: 'appointment_not_active' });
      expect(transactions()).toHaveLength(1);
      expect(gets().filter((g) => g.Key!.PK === 'APPT')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('three lost attempts answer ConcurrentUpdateError', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const pending = db.cancelAppointment(change, NOW, allow).catch((err: unknown) => err);
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

// Test names: section numbers are those of docs/SHARED_CALENDAR_SPEC.md.
describe('updateAppointmentNote (8.5, 13.4)', () => {
  const change = (note: string | null) => ({ appointmentId: APPT_ID, eventId: EVENT_ID, by: ALICE, note });
  const changed = () => ({ unchanged: false });

  it('reads like the cancel, inside the attempt, and hands the check the stored appointment', async () => {
    const check = vi.fn(changed);
    await db.updateAppointmentNote(change('Bring shoes'), NOW, check);
    expect(check).toHaveBeenCalledWith(snapshot());
    expect(gets().map((g) => g.Key)).toEqual([
      { PK: 'LOCK', SK: 'LOCK' },
      { PK: 'SETTINGS', SK: 'SETTINGS' },
      { PK: `APPTID#${APPT_ID}`, SK: 'APPTID' },
      { PK: 'APPT', SK },
      { PK: 'TYPE', SK: STUDIO },
    ]);
  });

  it('writes the exact three-item transaction: lock, Update APPT (note, updatedAt, updatedBy, version), Put EVENT', async () => {
    await db.updateAppointmentNote(change('Bring shoes'), NOW, changed);
    const [lock, appt, event, ...rest] = transactions()[0]!.TransactItems!;
    expect(rest).toEqual([]);
    expect(lock!.Update!.Key).toEqual({ PK: 'LOCK', SK: 'LOCK' });
    expect(appt).toEqual({
      Update: {
        TableName: TABLE,
        Key: { PK: 'APPT', SK },
        UpdateExpression: 'SET #note = :note, #updatedAt = :updatedAt, #updatedBy = :updatedBy, #version = :version',
        ExpressionAttributeNames: { '#note': 'note', '#updatedAt': 'updatedAt', '#updatedBy': 'updatedBy', '#version': 'version' },
        ExpressionAttributeValues: { ':note': 'Bring shoes', ':updatedAt': NOW, ':updatedBy': ALICE, ':version': 2 },
      },
    });
    expect(event!.Put!.Item).toEqual({
      PK: 'EVENT',
      SK: `${NOW}#${EVENT_ID}`,
      eventId: EVENT_ID,
      type: 'appointment.note_updated',
      occurredAt: NOW,
      actor: ALICE,
      recipients: { userId: 'sub-alice', username: 'alice', administrator: true },
      appointment: snapshot({ note: 'Bring shoes', updatedAt: NOW, updatedBy: ALICE, version: 2 }),
      schemaVersion: 1,
    });
  });

  it('answers the appointment after the change and the settings; null clears the note', async () => {
    const { result } = await db.updateAppointmentNote(change(null), NOW, changed);
    expect(result).toEqual({
      ok: true,
      value: { appointment: response({ note: null, updatedAt: NOW, updatedBy: ALICE }), settings: SETTINGS, unchanged: false },
    });
    expect(transactions()[0]!.TransactItems![1]!.Update!.ExpressionAttributeValues![':note']).toBeNull();
  });

  it('an unchanged note writes nothing, not even the lock, and answers the stored appointment', async () => {
    const { result, attempts } = await db.updateAppointmentNote(change('my note'), NOW, () => ({ unchanged: true }));
    expect(attempts).toBe(1);
    expect(result).toEqual({ ok: true, value: { appointment: response(), settings: SETTINGS, unchanged: true } });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('a refusal of the check is answered as is, nothing written', async () => {
    onPointer().resolves({});
    const check = vi.fn(() => ({ error: 'appointment_not_found' as const, message: 'No appointment with this id' }));
    const { result } = await db.updateAppointmentNote(change('x'), NOW, check);
    expect(check).toHaveBeenCalledWith(null);
    expect(result).toEqual({ ok: false, error: 'appointment_not_found', message: 'No appointment with this id' });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('a retry re-reads: the appointment ended or was cancelled meanwhile answers appointment_not_active', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(lockBusy());
    onAppt().resolvesOnce({ Item: apptItem() }).resolves({ Item: apptItem({ status: 'cancelled', version: 2 }) });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const check = vi.fn((a: AppointmentSnapshot | null) => (a!.status === 'booked' ? { unchanged: false } : { error: 'appointment_not_active' as const }));
      const pending = db.updateAppointmentNote(change('x'), NOW, check);
      await vi.runAllTimersAsync();
      const { result, attempts } = await pending;
      expect(attempts).toBe(2);
      expect(result).toEqual({ ok: false, error: 'appointment_not_active' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('three lost attempts answer ConcurrentUpdateError', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    try {
      const pending = db.updateAppointmentNote(change('x'), NOW, changed).catch((err: unknown) => err);
      await vi.runAllTimersAsync();
      expect(await pending).toBeInstanceOf(db.ConcurrentUpdateError);
      expect(transactions()).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
