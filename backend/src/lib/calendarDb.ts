import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type QueryCommandInput,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_SETTINGS,
  addDays,
  isValidTimeZone,
  toInstant,
  type Actor,
  type ApiErrorCode,
  type AppointmentStatus,
  type CancelReason,
  type OneOffInput,
  type OverrideInput,
  type PatternInput,
  type WeeklyPattern,
  type AvailabilityType,
  type CalendarSettings,
  type UpdateSettingsBody,
} from '@shared-calendar/shared';
import type { CalendarState, Refusal, StateAppointment, ViewAppointment } from './calendarRules';
import { documentClient } from './db';

// The calendar table (docs/SHARED_CALENDAR_SPEC.md 13). This is the only module that knows its
// item layout (13.2) and the lock (13.4). Every read is strongly consistent: the lock relies on it.

// ── Configuration ──────────────────────────────────────────────────────────────────────────────

export type CalendarConfig = { table: string; timeZone: string };

// A broken deployment parameter. The handlers answer 500 internal_error for every request
// (R-TIME-01), which the 5xx alarm counts. It is thrown on use, never at import: a module that
// fails to load makes the Lambda crash instead of answering.
export class CalendarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarConfigError';
  }
}

let config: CalendarConfig | CalendarConfigError | undefined;

function readConfig(): CalendarConfig | CalendarConfigError {
  const table = process.env.CALENDAR_TABLE;
  const timeZone = process.env.CALENDAR_TIME_ZONE;
  if (!table) return new CalendarConfigError('CALENDAR_TABLE is not set');
  if (!isValidTimeZone(timeZone)) {
    return new CalendarConfigError(`CALENDAR_TIME_ZONE is not a valid time zone: ${JSON.stringify(timeZone ?? null)}`);
  }
  return { table, timeZone: timeZone as string };
}

// Read once per container, on first use; a failure is kept too, so every request fails alike.
export function calendarConfig(): CalendarConfig {
  config ??= readConfig();
  if (config instanceof CalendarConfigError) throw config;
  return config;
}

// ── The calendar lock (13.4) ───────────────────────────────────────────────────────────────────

export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

// What one attempt of a locked operation decided, after its reads and checks:
// - write: the operation's items, written in one transaction after the lock update;
// - stop: a check failed; nothing is written and the result goes back to the caller as is.
export type LockedPlan<T> = { write: TransactItem[]; result: T } | { write: null; result: T };

export type Locked<T> = { result: T; attempts: number };

// The lock was busy on every attempt. The handlers answer 409 concurrent_update.
export class ConcurrentUpdateError extends Error {
  constructor(readonly attempts: number) {
    super(`The calendar lock was busy ${attempts} times in a row`);
    this.name = 'ConcurrentUpdateError';
  }
}

export const LOCK_MAX_ATTEMPTS = 3;
export const LOCK_WAIT_MS = { min: 50, max: 150 } as const;

const LOCK_KEY = { PK: 'LOCK', SK: 'LOCK' } as const;

// Codes of CancellationReasons[0] that mean "another write took the lock first": the version
// condition failed, or (real DynamoDB, two transactions at once) the item was being written.
const LOCK_BUSY = new Set(['ConditionalCheckFailed', 'TransactionConflict']);

async function readLockVersion(table: string): Promise<number> {
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: LOCK_KEY, ConsistentRead: true }));
  return (Item?.version as number | undefined) ?? 0;
}

// SET version = v + 1, if the version is still v. Version 0 means "no lock item yet".
function lockUpdate(table: string, version: number): TransactItem {
  const update = {
    TableName: table,
    Key: LOCK_KEY,
    UpdateExpression: 'SET #version = :next',
    ExpressionAttributeNames: { '#version': 'version' },
  };
  return version === 0
    ? { Update: { ...update, ConditionExpression: 'attribute_not_exists(PK)', ExpressionAttributeValues: { ':next': 1 } } }
    : {
        Update: {
          ...update,
          ConditionExpression: '#version = :current',
          ExpressionAttributeValues: { ':current': version, ':next': version + 1 },
        },
      };
}

// The lock update is always item 0 of the transaction, so its reason is index 0.
function lockWasBusy(err: unknown): boolean {
  return err instanceof TransactionCanceledException && LOCK_BUSY.has(err.CancellationReasons?.[0]?.Code ?? '');
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 50 to 150 ms inclusive, so that two writers that collided do not collide again.
export function lockWaitMs(random: () => number = Math.random): number {
  return LOCK_WAIT_MS.min + Math.floor(random() * (LOCK_WAIT_MS.max - LOCK_WAIT_MS.min + 1));
}

// Runs one calendar write under the lock (13.4): read the lock version, let `attempt` read what
// its rules need and check them, then write the lock update and the attempt's items in one
// transaction. If another write took the lock in between, wait and start again from the reads,
// at most LOCK_MAX_ATTEMPTS times in total. Any other failure is thrown at once.
export async function withCalendarLock<T>(attempt: () => Promise<LockedPlan<T>>): Promise<Locked<T>> {
  const { table } = calendarConfig();
  for (let attempts = 1; ; attempts++) {
    const version = await readLockVersion(table);
    const plan = await attempt();
    if (plan.write === null) return { result: plan.result, attempts };
    try {
      await documentClient.send(new TransactWriteCommand({ TransactItems: [lockUpdate(table, version), ...plan.write] }));
      return { result: plan.result, attempts };
    } catch (err) {
      if (!lockWasBusy(err)) throw err;
      if (attempts === LOCK_MAX_ATTEMPTS) throw new ConcurrentUpdateError(attempts);
      await wait(lockWaitMs());
    }
  }
}

// ── Settings (spec section 9) ──────────────────────────────────────────────────────────────────

const SETTINGS_KEY = { PK: 'SETTINGS', SK: 'SETTINGS' } as const;

type SettingsValues = Omit<CalendarSettings, 'timeZone'>;

// The item's own fields, picked one by one so that PK and SK never reach a response, and nothing
// but these fields reaches the item.
function pickValues(values: SettingsValues): SettingsValues {
  return {
    cancellationNoticeHours: values.cancellationNoticeHours,
    minBookingNoticeHours: values.minBookingNoticeHours,
    bookingHorizonDays: values.bookingHorizonDays,
    maxFutureAppointmentsPerUser: values.maxFutureAppointmentsPerUser,
    updatedAt: values.updatedAt,
    updatedBy: values.updatedBy,
  };
}

async function readSettings(table: string, timeZone: string): Promise<CalendarSettings> {
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: SETTINGS_KEY, ConsistentRead: true }));
  const values = (Item as SettingsValues | undefined) ?? { ...DEFAULT_SETTINGS, updatedAt: null, updatedBy: null };
  return { timeZone, ...pickValues(values) };
}

// The saved settings, or the defaults until the first save (R-SET-01).
export async function getSettings(): Promise<CalendarSettings> {
  const { table, timeZone } = calendarConfig();
  return readSettings(table, timeZone);
}

// Replaces the four editable values together (R-SET-02), under the lock. The time zone is a
// deployment parameter and is never stored.
export async function putSettings(values: UpdateSettingsBody, by: Actor, now: string): Promise<Locked<CalendarSettings>> {
  const { table, timeZone } = calendarConfig();
  const stored = pickValues({ ...values, updatedAt: now, updatedBy: by });
  return withCalendarLock(async () => ({
    write: [{ Put: { TableName: table, Item: { ...SETTINGS_KEY, ...stored } } }],
    result: { timeZone, ...stored },
  }));
}

// ── Reads ──────────────────────────────────────────────────────────────────────────────────────

type Item = Record<string, unknown>;

// The key condition of queryPartition: the whole partition, SK ≥ from, or SK BETWEEN from AND to
// (both inclusive, as DynamoDB defines BETWEEN).
function keyCondition(pk: string, fromSk?: string, toSk?: string): Pick<QueryCommandInput, 'KeyConditionExpression' | 'ExpressionAttributeValues'> {
  if (fromSk === undefined) return { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': pk } };
  if (toSk === undefined) return { KeyConditionExpression: 'PK = :pk AND SK >= :from', ExpressionAttributeValues: { ':pk': pk, ':from': fromSk } };
  return {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
    ExpressionAttributeValues: { ':pk': pk, ':from': fromSk, ':to': toSk },
  };
}

// Every item of one partition, or of its part from `fromSk` on (SK ≥ fromSk), or between `fromSk`
// and `toSk` (both inclusive), in SK order: a consistent Query that follows LastEvaluatedKey to the
// end. Every query of this module uses it.
async function queryPartition(table: string, pk: string, fromSk?: string, toSk?: string): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Item | undefined;
  do {
    const page = await documentClient.send(
      new QueryCommand({
        TableName: table,
        ...keyCondition(pk, fromSk, toSk),
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

// What a locked write that checks rules answers: the stored object, or the refusal of a check
// (nothing written). `T` is the stored object; `C` the error codes the operation can answer.
export type Checked<T, C extends ApiErrorCode> = { ok: true; value: T } | ({ ok: false } & Refusal<C>);

// A refusal as the caller gets it: the check's code, and its message and conflicts if it gave any.
const refused = <C extends ApiErrorCode>(refusal: Refusal<C>) => ({ ok: false as const, ...refusal });
const notFound = <C extends ApiErrorCode>(error: C) => refused({ error });

// ── Availability types (spec 6.1; item TYPE / <typeId> of 13.2) ────────────────────────────────

const TYPE_PK = 'TYPE';

/** A type as stored: the response fields plus `nameKey`, the key uniqueness is checked on. */
export type TypeRecord = AvailabilityType & { nameKey: string };

function toTypeRecord(item: Item): TypeRecord {
  return {
    typeId: item.SK as string,
    name: item.name as string,
    nameKey: item.nameKey as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

// The response shape: no PK, SK or nameKey.
function toAvailabilityType(type: TypeRecord): AvailabilityType {
  return { typeId: type.typeId, name: type.name, createdAt: type.createdAt, updatedAt: type.updatedAt };
}

// The whole item, for create and rename alike: the id is the SK and is not repeated.
function putType(table: string, type: TypeRecord): TransactItem {
  return {
    Put: {
      TableName: table,
      Item: { PK: TYPE_PK, SK: type.typeId, name: type.name, nameKey: type.nameKey, createdAt: type.createdAt, updatedAt: type.updatedAt },
    },
  };
}

async function readTypes(table: string): Promise<TypeRecord[]> {
  return (await queryPartition(table, TYPE_PK)).map(toTypeRecord);
}

/** Every type, sorted by `nameKey` (so `alpha` comes before `Beta`). */
export async function listTypes(): Promise<AvailabilityType[]> {
  const { table } = calendarConfig();
  const types = await readTypes(table);
  return types.sort((a, b) => (a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0)).map(toAvailabilityType);
}

// The check of a create or rename: given every type read inside the locked attempt.
export type TypeNameCheck<C extends ApiErrorCode> = (types: TypeRecord[]) => Refusal<C> | null;

/**
 * Creates a type under the lock (R-TYPE-01). `check` sees every type read inside the attempt, so
 * a name taken by a write that came first is seen on the retry. `typeId` is generated by the
 * caller once per request, so a retry does not change it.
 */
export async function createType<C extends ApiErrorCode>(
  type: { typeId: string; name: string; nameKey: string },
  now: string,
  check: TypeNameCheck<C>,
): Promise<Locked<Checked<AvailabilityType, C>>> {
  const { table } = calendarConfig();
  const created: TypeRecord = { ...type, createdAt: now, updatedAt: now };
  return withCalendarLock<Checked<AvailabilityType, C>>(async () => {
    const refusal = check(await readTypes(table));
    if (refusal) return { write: null, result: refused(refusal) };
    return { write: [putType(table, created)], result: { ok: true, value: toAvailabilityType(created) } };
  });
}

/**
 * Renames a type under the lock (R-TYPE-02): `type_not_found` if it is not there at the time of
 * the attempt, otherwise `check` decides. The whole item is written again (Put), from the one read
 * inside the attempt, which the lock keeps current.
 */
export async function renameType<C extends ApiErrorCode>(
  typeId: string,
  rename: { name: string; nameKey: string },
  now: string,
  check: TypeNameCheck<C>,
): Promise<Locked<Checked<AvailabilityType, C | 'type_not_found'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<AvailabilityType, C | 'type_not_found'>>(async () => {
    const types = await readTypes(table);
    const current = types.find((t) => t.typeId === typeId);
    if (!current) return { write: null, result: notFound('type_not_found') };
    const refusal = check(types);
    if (refusal) return { write: null, result: refused(refusal) };
    const renamed: TypeRecord = { ...current, ...rename, updatedAt: now };
    return { write: [putType(table, renamed)], result: { ok: true, value: toAvailabilityType(renamed) } };
  });
}

// One day in milliseconds: an appointment lasts at most this long (13.2).
const DAY_MS = 24 * 60 * 60 * 1000;

const PATTERN_PK = 'PATTERN';

function toPattern(item: Item): WeeklyPattern {
  return {
    patternId: item.SK as string,
    weekday: item.weekday as number,
    start: item.start as string,
    end: item.end as string,
    typeId: item.typeId as string,
    validFrom: item.validFrom as string,
    validUntil: (item.validUntil as string | null | undefined) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

// The id after the first '#' of an SK `<date or instant>#<id>`.
const idOf = (sk: string) => sk.slice(sk.indexOf('#') + 1);

// An override item (OVERRIDE / <date>): its date and windows, as the rules read them.
function toOverride(item: Item): OverrideInput {
  return {
    date: item.SK as string,
    windows: ((item.windows as Item[] | undefined) ?? []).map((w) => ({
      start: w.start as string,
      end: w.end as string,
      typeId: w.typeId as string,
    })),
  };
}

// A one-off window item (WINDOW / <date>#<windowId>), as the rules read it.
function toOneOff(item: Item): OneOffInput {
  return {
    windowId: idOf(item.SK as string),
    date: item.date as string,
    start: item.start as string,
    end: item.end as string,
    typeId: item.typeId as string,
  };
}

/**
 * The availability state of a locked attempt (13.2 access patterns, all consistent): every type
 * and every pattern; the overrides and one-off windows dated `today` or later (a window's SK is
 * `<date>#<windowId>`, so it sorts at or after `today`); the appointments that started at most
 * 24 h before `now` (none lasts longer), so every one not yet ended. Filtering on status and end is
 * the rules'. Only the fields the rules read are mapped.
 */
type ReadState = Omit<CalendarState, 'types' | 'patterns'> & { types: TypeRecord[]; patterns: WeeklyPattern[] };

async function readState(table: string, today: string, now: string): Promise<ReadState> {
  const since = new Date(Date.parse(now) - DAY_MS).toISOString();
  const [types, patterns, overrides, oneOffs, appointments] = await Promise.all([
    queryPartition(table, TYPE_PK),
    queryPartition(table, PATTERN_PK),
    queryPartition(table, 'OVERRIDE', today),
    queryPartition(table, 'WINDOW', today),
    queryPartition(table, 'APPT', since),
  ]);
  return {
    types: types.map(toTypeRecord),
    patterns: patterns.map(toPattern),
    overrides: overrides.map(toOverride),
    oneOffs: oneOffs.map(toOneOff),
    appointments: appointments.map(
      (a): StateAppointment => ({
        appointmentId: idOf(a.SK as string),
        username: a.username as string,
        start: a.start as string,
        end: a.end as string,
        date: a.date as string,
        typeId: a.typeId as string,
        status: a.status as AppointmentStatus,
      }),
    ),
  };
}

/** The check of a write that compares it with the rest of the calendar, read inside the locked attempt. */
export type StateCheck<C extends ApiErrorCode> = (state: CalendarState) => Refusal<C> | null;

/**
 * Deletes a type under the lock (R-TYPE-03): `type_not_found` if it is not there at the time of
 * the attempt, otherwise `check` decides on the state read inside the attempt. The lock
 * serializes every calendar write, so the delete needs no condition of its own.
 */
export async function deleteType<C extends ApiErrorCode>(
  typeId: string,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<null, C | 'type_not_found'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<null, C | 'type_not_found'>>(async () => {
    const state = await readState(table, today, now);
    if (!state.types.some((t) => t.typeId === typeId)) return { write: null, result: notFound('type_not_found') };
    const refusal = check(state);
    if (refusal) return { write: null, result: refused(refusal) };
    return { write: [{ Delete: { TableName: table, Key: { PK: TYPE_PK, SK: typeId } } }], result: { ok: true, value: null } };
  });
}

// ── Weekly patterns (spec 6.2; item PATTERN / <patternId> of 13.2) ─────────────────────────────

const byWeekdayThenStart = (a: WeeklyPattern, b: WeeklyPattern) =>
  a.weekday - b.weekday || cmp(a.start, b.start) || cmp(a.validFrom, b.validFrom) || cmp(a.patternId, b.patternId);
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every pattern, by weekday, then start (11.1); then validity and id, so the order is stable. */
export async function listPatterns(): Promise<WeeklyPattern[]> {
  const { table } = calendarConfig();
  return (await queryPartition(table, PATTERN_PK)).map(toPattern).sort(byWeekdayThenStart);
}

// The whole item, for create and update alike: the id is the SK and is not repeated.
function putPattern(table: string, p: WeeklyPattern): TransactItem {
  return {
    Put: {
      TableName: table,
      Item: {
        PK: PATTERN_PK,
        SK: p.patternId,
        weekday: p.weekday,
        start: p.start,
        end: p.end,
        typeId: p.typeId,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
    },
  };
}

/**
 * Creates a pattern under the lock (R-PAT-03/04, R-AV-01..05). `check` sees the state read inside
 * the attempt, before the write. `pattern.patternId` is generated by the caller once per request.
 */
export async function createPattern<C extends ApiErrorCode>(
  pattern: PatternInput,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<WeeklyPattern, C>>> {
  const { table } = calendarConfig();
  const created: WeeklyPattern = { ...pattern, createdAt: now, updatedAt: now };
  return withCalendarLock<Checked<WeeklyPattern, C>>(async () => {
    const refusal = check(await readState(table, today, now));
    if (refusal) return { write: null, result: refused(refusal) };
    return { write: [putPattern(table, created)], result: { ok: true, value: created } };
  });
}

/**
 * Replaces a pattern (full replacement, R-PAT-03) under the lock: `pattern_not_found` if it is not
 * there at the time of the attempt, otherwise `check` decides. `createdAt` is kept.
 */
export async function updatePattern<C extends ApiErrorCode>(
  pattern: PatternInput,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<WeeklyPattern, C | 'pattern_not_found'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<WeeklyPattern, C | 'pattern_not_found'>>(async () => {
    const state = await readState(table, today, now);
    const current = state.patterns.find((p) => p.patternId === pattern.patternId);
    if (!current) return { write: null, result: notFound('pattern_not_found') };
    const refusal = check(state);
    if (refusal) return { write: null, result: refused(refusal) };
    const updated: WeeklyPattern = { ...pattern, createdAt: current.createdAt, updatedAt: now };
    return { write: [putPattern(table, updated)], result: { ok: true, value: updated } };
  });
}

/** Deletes a pattern under the lock: `pattern_not_found` if it is not there, otherwise `check` decides (R-AV-03). */
export async function deletePattern<C extends ApiErrorCode>(
  patternId: string,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<null, C | 'pattern_not_found'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<null, C | 'pattern_not_found'>>(async () => {
    const state = await readState(table, today, now);
    if (!state.patterns.some((p) => p.patternId === patternId)) return { write: null, result: notFound('pattern_not_found') };
    const refusal = check(state);
    if (refusal) return { write: null, result: refused(refusal) };
    return { write: [{ Delete: { TableName: table, Key: { PK: PATTERN_PK, SK: patternId } } }], result: { ok: true, value: null } };
  });
}

// ── The calendar view (spec 11.6; reads of 13.2, no lock) ──────────────────────────────────────

const APPT_PK = 'APPT';

// The appointment item (APPT / <start instant>#<appointmentId>, spec 8.1 and 13.2; attribute names
// in architecture 5.3). Step 48 writes it; the view reads it. The id is the SK after '#' and is not
// repeated. `note`, `cancelledAt`, `cancelledBy`, `cancelReason`, `replaces` and `replacedBy` are
// null (stored as NULL) until set; a missing attribute reads as null too. `version` is internal.
function toViewAppointment(item: Item, typeNames: ReadonlyMap<string, string>): ViewAppointment {
  const typeId = item.typeId as string;
  return {
    userId: item.userId as string,
    appointment: {
      appointmentId: idOf(item.SK as string),
      username: item.username as string,
      start: item.start as string,
      end: item.end as string,
      date: item.date as string,
      typeId,
      // The type's current name; the snapshot taken at booking once the type is gone (R-TYPE-03).
      typeName: typeNames.get(typeId) ?? (item.typeNameAtBooking as string),
      note: (item.note as string | null | undefined) ?? null,
      status: item.status as AppointmentStatus,
      createdAt: item.createdAt as string,
      createdBy: toActor(item.createdBy as Item),
      updatedAt: item.updatedAt as string,
      updatedBy: toActor(item.updatedBy as Item),
      cancelledAt: (item.cancelledAt as string | null | undefined) ?? null,
      cancelledBy: item.cancelledBy ? toActor(item.cancelledBy as Item) : null,
      cancelReason: (item.cancelReason as CancelReason | null | undefined) ?? null,
      replaces: (item.replaces as string | null | undefined) ?? null,
      replacedBy: (item.replacedBy as string | null | undefined) ?? null,
    },
  };
}

// An actor map, picked field by field so nothing else stored with it reaches a response.
function toActor(item: Item): Actor {
  return { username: item.username as string, role: item.role as Actor['role'] };
}

/** What one calendar view reads (11.6): the inputs of calendarView, except the request's own. */
export type CalendarRange = {
  settings: CalendarSettings;
  types: AvailabilityType[];
  patterns: WeeklyPattern[];
  overrides: OverrideInput[];
  oneOffs: OneOffInput[];
  appointments: ViewAppointment[];
};

/**
 * The reads of the calendar view of `from`..`to` (local dates, inclusive), consistent and without
 * the lock (a read): the settings, every type, every pattern, the overrides `SK BETWEEN from AND
 * to`, the one-off windows `SK BETWEEN from AND to#~`, and the appointments that start in the
 * range, every status. The range starts at the local midnight of `from` and ends, exclusive, at
 * the local midnight after `to`. An appointment's SK is `<start>#<id>` and instants have one
 * length, so `SK BETWEEN <rangeStart> AND <rangeEnd>` takes exactly the starts with
 * rangeStart ≤ start < rangeEnd: one starting at rangeEnd has the SK `<rangeEnd>#…`, which sorts
 * after `<rangeEnd>` (spec 13.2, v7).
 */
export async function readCalendarRange(from: string, to: string): Promise<CalendarRange> {
  const { table, timeZone } = calendarConfig();
  const rangeStart = toInstant(from, '00:00', timeZone);
  const rangeEnd = toInstant(addDays(to, 1), '00:00', timeZone);
  const [settings, types, patterns, overrides, oneOffs, appointments] = await Promise.all([
    readSettings(table, timeZone),
    readTypes(table),
    queryPartition(table, PATTERN_PK),
    queryPartition(table, 'OVERRIDE', from, to),
    queryPartition(table, 'WINDOW', from, `${to}#~`),
    queryPartition(table, APPT_PK, rangeStart, rangeEnd),
  ]);
  const typeNames = new Map(types.map((t) => [t.typeId, t.name]));
  return {
    settings,
    types: types.map(toAvailabilityType),
    patterns: patterns.map(toPattern),
    overrides: overrides.map(toOverride),
    oneOffs: oneOffs.map(toOneOff),
    appointments: appointments.map((a) => toViewAppointment(a, typeNames)),
  };
}
