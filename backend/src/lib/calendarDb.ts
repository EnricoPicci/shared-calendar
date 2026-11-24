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
  TYPE_CAPACITY,
  addDays,
  isValidTimeZone,
  localDateOf,
  toInstant,
  type Actor,
  type Appointment,
  type ApiErrorCode,
  type AppointmentStatus,
  type CancelReason,
  type OneOffInput,
  type OverrideInput,
  type PatternInput,
  type WeeklyPattern,
  type AvailabilityType,
  type CalendarSettings,
  type DateOverride,
  type OneOffWindow,
  type UpdateSettingsBody,
  type WindowBody,
} from '@shared-calendar/shared';
import { appointmentEvent, type AppointmentSnapshot, type EventInput } from './calendarEvents';
import type { CalendarState, NoteRefusal, Refusal, StateAppointment, ViewAppointment } from './calendarRules';
import { documentClient } from './db';

// The calendar table (docs/SHARED_CALENDAR_SPEC.md section 13). This is the only module that knows
// its item layout (docs/SHARED_CALENDAR_SPEC.md section 13.2) and the lock
// (docs/SHARED_CALENDAR_SPEC.md section 13.4). Every read is strongly consistent: the lock relies
// on it.

// ── Configuration ──────────────────────────────────────────────────────────────────────────────

export type CalendarConfig = { table: string; timeZone: string };

// A broken deployment parameter. The handlers answer 500 internal_error for every request
// (docs/SHARED_CALENDAR_SPEC.md R-TIME-01), which the 5xx alarm counts. It is thrown on use, never
// at import: a module that fails to load makes the Lambda crash instead of answering.
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

// ── The calendar lock (docs/SHARED_CALENDAR_SPEC.md section 13.4) ──────────────────────────────

export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

// What one attempt of a locked operation decided, after its reads and checks:
// - write: the operation's items, written in one transaction after the lock update. When one of
//   them carries a condition the checks cannot see beforehand (a booking's deleted-user marker,
//   docs/SHARED_CALENDAR_SPEC.md R-BOOK-10), `onConditionFailed` names it (its index in `write`)
//   and the result to answer if that condition fails: the transaction is cancelled, nothing is
//   written, and there is no retry;
// - stop: a check failed; nothing is written and the result goes back to the caller as is.
export type LockedPlan<T> =
  | { write: TransactItem[]; result: T; onConditionFailed?: { item: number; result: T } }
  | { write: null; result: T };

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

// Whether the transaction was cancelled because the condition of item `index` failed.
function conditionFailedAt(err: unknown, index: number): boolean {
  return err instanceof TransactionCanceledException && err.CancellationReasons?.[index]?.Code === 'ConditionalCheckFailed';
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 50 to 150 ms inclusive, so that two writers that collided do not collide again.
export function lockWaitMs(random: () => number = Math.random): number {
  return LOCK_WAIT_MS.min + Math.floor(random() * (LOCK_WAIT_MS.max - LOCK_WAIT_MS.min + 1));
}

// Runs one calendar write under the lock (docs/SHARED_CALENDAR_SPEC.md section 13.4): read the lock
// version, let `attempt` read what its rules need and check them, then write the lock update and
// the attempt's items in one transaction. If another write took the lock in between, wait and start
// again from the reads, at most LOCK_MAX_ATTEMPTS times in total. The lock is looked at first: when
// it was lost, any other reason in the same answer is stale and the retry re-reads. Otherwise a
// failed condition the plan named answers its result (`onConditionFailed`), and any other failure
// is thrown at once.
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
      if (lockWasBusy(err)) {
        if (attempts === LOCK_MAX_ATTEMPTS) throw new ConcurrentUpdateError(attempts);
        await wait(lockWaitMs());
        continue;
      }
      // The plan's items follow the lock update, so item i of `write` is reason i + 1.
      const failed = plan.onConditionFailed;
      if (failed && conditionFailedAt(err, failed.item + 1)) return { result: failed.result, attempts };
      throw err;
    }
  }
}

// ── Settings (docs/SHARED_CALENDAR_SPEC.md section 9) ──────────────────────────────────────────

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

// The saved settings, or the defaults until the first save (docs/SHARED_CALENDAR_SPEC.md R-SET-01).
export async function getSettings(): Promise<CalendarSettings> {
  const { table, timeZone } = calendarConfig();
  return readSettings(table, timeZone);
}

// Replaces the four editable values together (docs/SHARED_CALENDAR_SPEC.md R-SET-02), under the
// lock. The time zone is a deployment parameter and is never stored.
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

// ── Availability types (docs/SHARED_CALENDAR_SPEC.md section 6.1) ────────────────────────────────
// Item TYPE / <typeId> of docs/SHARED_CALENDAR_SPEC.md section 13.2.

const TYPE_PK = 'TYPE';

/** A type as stored: the response fields plus `nameKey`, the key uniqueness is checked on. */
export type TypeRecord = AvailabilityType & { nameKey: string };

// An item written before the capacity existed has no `capacity` and holds one person, the
// default, so nothing is migrated (docs/SHARED_CALENDAR_SPEC.md section 13.2).
function toTypeRecord(item: Item): TypeRecord {
  return {
    typeId: item.SK as string,
    name: item.name as string,
    nameKey: item.nameKey as string,
    capacity: (item.capacity as number | undefined) ?? TYPE_CAPACITY.default,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

// The response shape: no PK, SK or nameKey.
function toAvailabilityType(type: TypeRecord): AvailabilityType {
  return { typeId: type.typeId, name: type.name, capacity: type.capacity, createdAt: type.createdAt, updatedAt: type.updatedAt };
}

// The whole item, for create and edit alike: the id is the SK and is not repeated. `capacity` is
// left off when `withCapacity` is false: an edit without one of an item that has none keeps it so.
function putType(table: string, type: TypeRecord, withCapacity = true): TransactItem {
  return {
    Put: {
      TableName: table,
      Item: {
        PK: TYPE_PK,
        SK: type.typeId,
        name: type.name,
        nameKey: type.nameKey,
        ...(withCapacity && { capacity: type.capacity }),
        createdAt: type.createdAt,
        updatedAt: type.updatedAt,
      },
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
 * Creates a type under the lock (docs/SHARED_CALENDAR_SPEC.md R-TYPE-01). `check` sees every type
 * read inside the attempt, so a name taken by a write that came first is seen on the retry.
 * `typeId` is generated by the caller once per request, so a retry does not change it. A capacity
 * left out is the default, 1 (docs/SHARED_CALENDAR_SPEC.md R-TYPE-05).
 */
export async function createType<C extends ApiErrorCode>(
  type: { typeId: string; name: string; nameKey: string; capacity?: number },
  now: string,
  check: TypeNameCheck<C>,
): Promise<Locked<Checked<AvailabilityType, C>>> {
  const { table } = calendarConfig();
  const { capacity = TYPE_CAPACITY.default, ...named } = type;
  const created: TypeRecord = { ...named, capacity, createdAt: now, updatedAt: now };
  return withCalendarLock<Checked<AvailabilityType, C>>(async () => {
    const refusal = check(await readTypes(table));
    if (refusal) return { write: null, result: refused(refusal) };
    return { write: [putType(table, created)], result: { ok: true, value: toAvailabilityType(created) } };
  });
}

/**
 * Edits a type under the lock (docs/SHARED_CALENDAR_SPEC.md R-TYPE-02): `type_not_found` if it is
 * not there at the time of the attempt, otherwise `check` decides. The whole item is written again
 * (Put), from the one read inside the attempt, which the lock keeps current. A capacity left out
 * keeps the stored one (docs/SHARED_CALENDAR_SPEC.md section 11.4); a capacity lowered touches no
 * appointment (docs/SHARED_CALENDAR_SPEC.md decision D28).
 */
export async function renameType<C extends ApiErrorCode>(
  typeId: string,
  rename: { name: string; nameKey: string; capacity?: number },
  now: string,
  check: TypeNameCheck<C>,
): Promise<Locked<Checked<AvailabilityType, C | 'type_not_found'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<AvailabilityType, C | 'type_not_found'>>(async () => {
    const items = await queryPartition(table, TYPE_PK);
    const types = items.map(toTypeRecord);
    const current = types.find((t) => t.typeId === typeId);
    if (!current) return { write: null, result: notFound('type_not_found') };
    const refusal = check(types);
    if (refusal) return { write: null, result: refused(refusal) };
    const { capacity = current.capacity, ...named } = rename;
    const renamed: TypeRecord = { ...current, ...named, capacity, updatedAt: now };
    const stored = items.find((item) => item.SK === typeId)!.capacity !== undefined;
    return {
      write: [putType(table, renamed, stored || rename.capacity !== undefined)],
      result: { ok: true, value: toAvailabilityType(renamed) },
    };
  });
}

// One day in milliseconds: an appointment lasts at most this long (docs/SHARED_CALENDAR_SPEC.md
// section 13.2).
const DAY_MS = 24 * 60 * 60 * 1000;

const PATTERN_PK = 'PATTERN';
const OVERRIDE_PK = 'OVERRIDE';
const WINDOW_PK = 'WINDOW';

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
 * The availability state of a locked attempt (the access patterns of docs/SHARED_CALENDAR_SPEC.md
 * section 13.2, all consistent): every type
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
    queryPartition(table, OVERRIDE_PK, today),
    queryPartition(table, WINDOW_PK, today),
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
        userId: a.userId as string,
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
 * Deletes a type under the lock (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03): `type_not_found` if it is
 * not there at the time of the attempt, otherwise `check` decides on the state read inside the
 * attempt. The lock serializes every calendar write, so the delete needs no condition of its own.
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

// ── Weekly patterns (docs/SHARED_CALENDAR_SPEC.md section 6.2) ───────────────────────────────────
// Item PATTERN / <patternId> of docs/SHARED_CALENDAR_SPEC.md section 13.2.

const byWeekdayThenStart = (a: WeeklyPattern, b: WeeklyPattern) =>
  a.weekday - b.weekday || cmp(a.start, b.start) || cmp(a.validFrom, b.validFrom) || cmp(a.patternId, b.patternId);
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every pattern, by weekday, then start (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 7); then
 * validity and id, so the order is stable.
 */
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
 * Creates a pattern under the lock (docs/SHARED_CALENDAR_SPEC.md R-PAT-03, R-PAT-04 and R-AV-01 to
 * R-AV-05). `check` sees the state read inside the attempt, before the write. `pattern.patternId`
 * is generated by the caller once per request.
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
 * Replaces a pattern (full replacement, docs/SHARED_CALENDAR_SPEC.md R-PAT-03) under the lock:
 * `pattern_not_found` if it is not there at the time of the attempt, otherwise `check` decides.
 * `createdAt` is kept.
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

/**
 * Deletes a pattern under the lock: `pattern_not_found` if it is not there, otherwise `check`
 * decides (docs/SHARED_CALENDAR_SPEC.md R-AV-03).
 */
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

// ── Date overrides (docs/SHARED_CALENDAR_SPEC.md section 6.3) ────────────────────────────────────
// Item OVERRIDE / <date> of docs/SHARED_CALENDAR_SPEC.md section 13.2.


// An actor map as stored (updatedBy, createdBy): picked field by field.
const actorItem = (by: Actor): Actor => ({ username: by.username, role: by.role });

/**
 * Sets the override of `date` under the lock (docs/SHARED_CALENDAR_SPEC.md R-OVR-01 and R-OVR-02):
 * a `Put` of the whole item, so a date that already has one gets it replaced. The windows are
 * stored and answered sorted by start (docs/SHARED_CALENDAR_SPEC.md section 6.3); each one picked
 * field by field. `updatedBy` is stored, never answered. `date` is
 * today or later (the handler answers date_in_past before the lock), so the state read inside the
 * attempt holds the date's current override and one-off windows.
 */
export async function setOverride<C extends ApiErrorCode>(
  date: string,
  windows: readonly WindowBody[],
  by: Actor,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<DateOverride, C>>> {
  const { table } = calendarConfig();
  const sorted = windows.map((w) => ({ start: w.start, end: w.end, typeId: w.typeId })).sort((a, b) => cmp(a.start, b.start));
  const stored: DateOverride = { date, windows: sorted, updatedAt: now };
  return withCalendarLock<Checked<DateOverride, C>>(async () => {
    const refusal = check(await readState(table, today, now));
    if (refusal) return { write: null, result: refused(refusal) };
    return {
      write: [{ Put: { TableName: table, Item: { PK: OVERRIDE_PK, SK: date, windows: sorted, updatedAt: now, updatedBy: actorItem(by) } } }],
      result: { ok: true, value: stored },
    };
  });
}

/**
 * Deletes the override of `date` under the lock, so the patterns apply again
 * (docs/SHARED_CALENDAR_SPEC.md R-OVR-02):
 * `override_not_found` if the date has none at the time of the attempt, otherwise `check` decides.
 * `date` is today or later (date_in_past is the handler's, before the lock).
 */
export async function deleteOverride<C extends ApiErrorCode>(
  date: string,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<null, C | 'override_not_found'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<null, C | 'override_not_found'>>(async () => {
    const state = await readState(table, today, now);
    if (!state.overrides.some((o) => o.date === date)) return { write: null, result: notFound('override_not_found') };
    const refusal = check(state);
    if (refusal) return { write: null, result: refused(refusal) };
    return { write: [{ Delete: { TableName: table, Key: { PK: OVERRIDE_PK, SK: date } } }], result: { ok: true, value: null } };
  });
}

// ── One-off windows (docs/SHARED_CALENDAR_SPEC.md section 6.4) ───────────────────────────────────
// Item WINDOW / <date>#<windowId> of docs/SHARED_CALENDAR_SPEC.md section 13.2.


/**
 * Creates a one-off window under the lock (docs/SHARED_CALENDAR_SPEC.md R-ONE-01 and R-ONE-03): a
 * `Put` of the item with SK
 * `<date>#<windowId>`. `window.windowId` is generated by the caller once per request, so a retry
 * writes the same id. `createdBy` is stored, never answered. `window.date` is today or later (the
 * handler answers date_in_past before the lock).
 */
export async function createOneOffWindow<C extends ApiErrorCode>(
  window: OneOffInput,
  by: Actor,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<OneOffWindow, C>>> {
  const { table } = calendarConfig();
  const created: OneOffWindow = {
    windowId: window.windowId,
    date: window.date,
    start: window.start,
    end: window.end,
    typeId: window.typeId,
    createdAt: now,
  };
  return withCalendarLock<Checked<OneOffWindow, C>>(async () => {
    const refusal = check(await readState(table, today, now));
    if (refusal) return { write: null, result: refused(refusal) };
    const { windowId, ...item } = created;
    return {
      write: [{ Put: { TableName: table, Item: { PK: WINDOW_PK, SK: `${created.date}#${windowId}`, ...item, createdBy: actorItem(by) } } }],
      result: { ok: true, value: created },
    };
  });
}

/**
 * Deletes a one-off window under the lock. The path names only its id and the SK starts with its
 * date, so it is looked for in the state read inside the attempt (the windows dated today or
 * later). On a miss the whole WINDOW partition is read in the same attempt: a window found there
 * is dated before today and answers `date_in_past` (docs/SHARED_CALENDAR_SPEC.md R-ONE-02: past
 * availability is not edited); otherwise `window_not_found`. Only then does `check` decide.
 */
export async function deleteOneOffWindow<C extends ApiErrorCode>(
  windowId: string,
  today: string,
  now: string,
  check: StateCheck<C>,
): Promise<Locked<Checked<null, C | 'window_not_found' | 'date_in_past'>>> {
  const { table } = calendarConfig();
  return withCalendarLock<Checked<null, C | 'window_not_found' | 'date_in_past'>>(async () => {
    const state = await readState(table, today, now);
    const current = state.oneOffs.find((w) => w.windowId === windowId);
    if (!current) {
      const past = (await queryPartition(table, WINDOW_PK)).some((item) => idOf(item.SK as string) === windowId);
      return { write: null, result: refused({ error: past ? ('date_in_past' as const) : ('window_not_found' as const) }) };
    }
    const refusal = check(state);
    if (refusal) return { write: null, result: refused(refusal) };
    return {
      write: [{ Delete: { TableName: table, Key: { PK: WINDOW_PK, SK: `${current.date}#${windowId}` } } }],
      result: { ok: true, value: null },
    };
  });
}

// ── The calendar view (docs/SHARED_CALENDAR_SPEC.md section 11.6) ────────────────────────────────
// Reads of docs/SHARED_CALENDAR_SPEC.md section 13.2, no lock.

const APPT_PK = 'APPT';

// The appointment item (APPT / <start instant>#<appointmentId>, docs/SHARED_CALENDAR_SPEC.md
// sections 8.1 and 13.2; attribute names in docs/ARCHITECTURE.md section 5.3). The booking writes
// it; the view reads it. The id is the SK after '#' and is not repeated. `note`, `cancelledAt`,
// `cancelledBy`, `cancelReason`, `replaces` and `replacedBy` are null (stored as NULL) until set; a
// missing attribute reads as null too. `version` is internal.
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
      // The type's current name; the snapshot taken at booking once the type is gone
      // (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03).
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

/**
 * What one calendar view reads (docs/SHARED_CALENDAR_SPEC.md section 11.6): the inputs of
 * calendarView, except the request's own.
 */
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
 * after `<rangeEnd>` (docs/SHARED_CALENDAR_SPEC.md section 13.2).
 */
export async function readCalendarRange(from: string, to: string): Promise<CalendarRange> {
  const { table, timeZone } = calendarConfig();
  const rangeStart = toInstant(from, '00:00', timeZone);
  const rangeEnd = toInstant(addDays(to, 1), '00:00', timeZone);
  const [settings, types, patterns, overrides, oneOffs, appointments] = await Promise.all([
    readSettings(table, timeZone),
    readTypes(table),
    queryPartition(table, PATTERN_PK),
    queryPartition(table, OVERRIDE_PK, from, to),
    queryPartition(table, WINDOW_PK, from, `${to}#~`),
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

// ── Booking (docs/SHARED_CALENDAR_SPEC.md section 8.2) ───────────────────────────────────────────
// The APPT, APPTID, EVENT and DELETEDUSER items of docs/SHARED_CALENDAR_SPEC.md section 13.2.

/** What the handler decided before the lock: the ids (made once per request), the User, the times. */
export type NewBooking = {
  appointmentId: string;
  eventId: string;
  /** The Cognito `sub` of the User the appointment is for: the token's, or AdminGetUser's. */
  userId: string;
  username: string;
  /** The times docs/SHARED_CALENDAR_SPEC.md R-BOOK-02 accepted, `end` filled in. */
  start: string;
  end: string;
  /** Trimmed; an empty note is null (docs/SHARED_CALENDAR_SPEC.md R-BOOK-11). */
  note: string | null;
  by: Actor;
};

/**
 * The booking check (calendarRules.checkBooking), on the settings and the state read inside the
 * locked attempt: a refusal, or the effective window that holds the appointment.
 */
export type BookingCheck<C extends ApiErrorCode> = (state: CalendarState, settings: CalendarSettings) => Refusal<C> | { window: { typeId: string } };

/**
 * A stored appointment as the handler answers it: the response fields but `cancellableUntil`, and
 * the settings read with it (the handler works `cancellableUntil` out from them).
 */
export type StoredAppointment = { appointment: Omit<Appointment, 'cancellableUntil'>; settings: CalendarSettings };

const deletedUserKey = (sub: string) => ({ PK: `DELETEDUSER#${sub}`, SK: 'DELETEDUSER' });

/**
 * Books an appointment under the lock (docs/SHARED_CALENDAR_SPEC.md sections 8.2 and 13.4). Inside
 * each attempt it reads the settings and the availability state (types, patterns, overrides and
 * one-off windows from today, appointments from now − 24 h), and `check` decides on them, so a
 * retry re-reads and re-checks. Then one transaction of five items: the lock update; `Put APPT`
 * (`SK` `<start>#<appointmentId>`, the attributes of docs/ARCHITECTURE.md section 5.3, `version` 1,
 * `updatedAt`/`updatedBy` = `createdAt`/`createdBy`); `Put APPTID` (the pointer, `sk`); `Put EVENT`
 * (`appointment.booked`, calendarEvents); and a `ConditionCheck` that `DELETEDUSER#<userId>` does
 * not exist (docs/SHARED_CALENDAR_SPEC.md R-BOOK-10), whose failure answers `user_not_found`
 * without a retry. The type's name is the appointment's `typeName` and its snapshot.
 */
export async function bookAppointment<C extends ApiErrorCode>(
  booking: NewBooking,
  today: string,
  now: string,
  check: BookingCheck<C>,
): Promise<Locked<Checked<StoredAppointment, C | 'user_not_found'>>> {
  const { table, timeZone } = calendarConfig();
  const { appointmentId, eventId, userId, username, start, end, note, by } = booking;
  const date = localDateOf(start, timeZone);
  return withCalendarLock<Checked<StoredAppointment, C | 'user_not_found'>>(async () => {
    const [settings, state] = await Promise.all([readSettings(table, timeZone), readState(table, today, now)]);
    const outcome = check(state, settings);
    if ('error' in outcome) return { write: null, result: refused(outcome) };
    // The check found the window among the existing types only, so the type is there.
    const type = state.types.find((t) => t.typeId === outcome.window.typeId)!;
    const stored = newAppointment({ appointmentId, userId, username, start, end, date, type, note, by, now, replaces: null });
    const marker = 3;
    return {
      write: [
        ...putAppointment(table, stored),
        eventPut(table, { type: 'appointment.booked', eventId, occurredAt: now, actor: by, appointment: stored }),
        markerCheck(table, userId),
      ],
      onConditionFailed: { item: marker, result: notFound('user_not_found') },
      result: { ok: true, value: { appointment: toResponseFields(stored, type.name), settings } },
    };
  });
}

// A new appointment as stored (docs/SHARED_CALENDAR_SPEC.md sections 8.1 and 13.2): `booked`,
// `version` 1, created and updated now by `by`, the cancellation fields null; `replaces` the old id
// in a change, else null. The booking and the change both build it here, so the attribute list is
// written once.
function newAppointment(a: {
  appointmentId: string;
  userId: string;
  username: string;
  start: string;
  end: string;
  date: string;
  type: { typeId: string; name: string };
  note: string | null;
  by: Actor;
  now: string;
  replaces: string | null;
}): AppointmentSnapshot {
  return {
    appointmentId: a.appointmentId,
    userId: a.userId,
    username: a.username,
    start: a.start,
    end: a.end,
    date: a.date,
    typeId: a.type.typeId,
    typeNameAtBooking: a.type.name,
    note: a.note,
    status: 'booked',
    createdAt: a.now,
    createdBy: actorItem(a.by),
    updatedAt: a.now,
    updatedBy: actorItem(a.by),
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    replaces: a.replaces,
    replacedBy: null,
    version: 1,
  };
}

// `Put APPT` (`SK` `<start>#<appointmentId>`, the id not repeated) and `Put APPTID` (the pointer).
function putAppointment(table: string, stored: AppointmentSnapshot): TransactItem[] {
  const sk = `${stored.start}#${stored.appointmentId}`;
  const { appointmentId, ...attributes } = stored;
  return [
    { Put: { TableName: table, Item: { PK: APPT_PK, SK: sk, ...attributes } } },
    { Put: { TableName: table, Item: { PK: `APPTID#${appointmentId}`, SK: 'APPTID', sk } } },
  ];
}

const eventPut = (table: string, event: EventInput): TransactItem => ({ Put: { TableName: table, Item: appointmentEvent(event) } });

// The check of docs/SHARED_CALENDAR_SPEC.md R-BOOK-10: the User has not been deleted. Last item of
// a booking and of a change.
const markerCheck = (table: string, userId: string): TransactItem => ({
  ConditionCheck: { TableName: table, Key: deletedUserKey(userId), ConditionExpression: 'attribute_not_exists(PK)' },
});

// The response fields of a stored appointment (docs/SHARED_CALENDAR_SPEC.md section 11.5) but
// `cancellableUntil`: no userId, no version.
function toResponseFields(a: AppointmentSnapshot, typeName: string): Omit<Appointment, 'cancellableUntil'> {
  return {
    appointmentId: a.appointmentId,
    username: a.username,
    start: a.start,
    end: a.end,
    date: a.date,
    typeId: a.typeId,
    typeName,
    note: a.note,
    status: a.status,
    createdAt: a.createdAt,
    createdBy: a.createdBy,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy,
    cancelledAt: a.cancelledAt,
    cancelledBy: a.cancelledBy,
    cancelReason: a.cancelReason,
    replaces: a.replaces,
    replacedBy: a.replacedBy,
  };
}

// ── Listing (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16) ────────────────────────────────
// Reads of docs/SHARED_CALENDAR_SPEC.md section 13.2, no lock.

/**
 * Which appointments docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16 selects: those dated
 * `from`..`to` (local dates, inclusive), or the upcoming ones.
 */
export type AppointmentSelection = { from: string; to: string } | { upcoming: true };

/**
 * The filters of docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16: the owner, either by `userId`
 * (a User caller: the token's `sub`) or by the stored `username` (the Administrator's filter: every
 * account booked under that name, earlier deleted ones included), or neither (the Administrator,
 * everything); and the status.
 */
export type AppointmentFilter = {
  owner: { userId: string } | { username: string } | null;
  status: AppointmentStatus | 'all';
};

/**
 * What docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16 answers before `cancellableUntil`: the
 * appointments, sorted by start, and the settings.
 */
export type AppointmentList = { appointments: ViewAppointment[]; settings: CalendarSettings };

/**
 * The appointments of docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16, consistent and without
 * the lock (a read), with the settings and every type (for `typeName`):
 * - a range: `Query PK = APPT, SK BETWEEN <local midnight of from> AND <local midnight after to>`,
 *   the upper bound exclusive as in the view (readCalendarRange). An appointment never crosses
 *   midnight, so these are also the ones that overlap the range;
 * - upcoming: `Query PK = APPT, SK ≥ now − 24 h` (none lasts longer), keeping those with
 *   `end > now` (a time selection only; `status` filters it as it filters a range).
 * Then the owner and the status filter, in code; sorted by start, then id (the SK order).
 */
export async function listAppointments(selection: AppointmentSelection, filter: AppointmentFilter, now: string): Promise<AppointmentList> {
  const { table, timeZone } = calendarConfig();
  const query =
    'upcoming' in selection
      ? queryPartition(table, APPT_PK, new Date(Date.parse(now) - DAY_MS).toISOString())
      : queryPartition(table, APPT_PK, toInstant(selection.from, '00:00', timeZone), toInstant(addDays(selection.to, 1), '00:00', timeZone));
  const [settings, types, items] = await Promise.all([readSettings(table, timeZone), readTypes(table), query]);
  const { owner, status } = filter;
  const kept = items
    .filter((item) => !('upcoming' in selection) || (item.end as string) > now)
    .filter((item) => owner === null || ('userId' in owner ? item.userId === owner.userId : item.username === owner.username))
    .filter((item) => status === 'all' || item.status === status)
    .sort((a, b) => cmp(a.SK as string, b.SK as string));
  const typeNames = new Map(types.map((t) => [t.typeId, t.name]));
  return { appointments: kept.map((item) => toViewAppointment(item, typeNames)), settings };
}

// ── Cancelling and the note (docs/SHARED_CALENDAR_SPEC.md sections 8.3 and 8.5) ──────────────────
// Items APPTID, APPT, EVENT of docs/SHARED_CALENDAR_SPEC.md section 13.2.

/** An appointment write by id: the ids the handler made once per request, and who writes. */
export type AppointmentChange = { appointmentId: string; eventId: string; by: Actor };

// The APPT item as stored, every attribute but the keys, picked one by one through the view's
// mapper (the event snapshot); the response-only `typeName` it adds is left out.
function toSnapshot(item: Item): AppointmentSnapshot {
  const { userId, appointment } = toViewAppointment(item, new Map());
  const { appointmentId, username, start, end, date, typeId, note, status, createdAt, createdBy, updatedAt, updatedBy } = appointment;
  const { cancelledAt, cancelledBy, cancelReason, replaces, replacedBy } = appointment;
  return {
    appointmentId, userId, username, start, end, date, typeId,
    typeNameAtBooking: item.typeNameAtBooking as string,
    note, status, createdAt, createdBy, updatedAt, updatedBy,
    cancelledAt, cancelledBy, cancelReason, replaces, replacedBy,
    version: item.version as number,
  };
}

/**
 * An appointment by id (docs/SHARED_CALENDAR_SPEC.md sections 13.2 and 13.3): `GetItem APPTID#<id>`
 * for the pointer, then `GetItem APPT / <sk>`, both consistent. `null` when there is no pointer,
 * and also when the pointer names no item: that cannot happen through the API (the two are written
 * in one transaction and an appointment is never deleted), so it is treated as absent rather than
 * as an error.
 */
async function readAppointment(table: string, appointmentId: string): Promise<AppointmentSnapshot | null> {
  const pointer = await documentClient.send(
    new GetCommand({ TableName: table, Key: { PK: `APPTID#${appointmentId}`, SK: 'APPTID' }, ConsistentRead: true }),
  );
  if (!pointer.Item) return null;
  const { Item } = await documentClient.send(
    new GetCommand({ TableName: table, Key: { PK: APPT_PK, SK: pointer.Item.sk as string }, ConsistentRead: true }),
  );
  return Item ? toSnapshot(Item) : null;
}

// The type's current name, or the snapshot once the type is gone (docs/SHARED_CALENDAR_SPEC.md
// R-TYPE-03 and section 8.1).
async function typeNameOf(table: string, a: AppointmentSnapshot): Promise<string> {
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: { PK: TYPE_PK, SK: a.typeId }, ConsistentRead: true }));
  return (Item?.name as string | undefined) ?? a.typeNameAtBooking;
}

// `Update APPT` with SET on the changed attributes only (an attribute this code does not know is
// kept), no condition of its own (every appointment write takes the lock).
function appointmentUpdate(table: string, after: AppointmentSnapshot, set: Record<string, unknown>): TransactItem {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const parts = Object.entries(set).map(([attribute, value]) => {
    names[`#${attribute}`] = attribute;
    values[`:${attribute}`] = value;
    return `#${attribute} = :${attribute}`;
  });
  return {
    Update: {
      TableName: table,
      Key: { PK: APPT_PK, SK: `${after.start}#${after.appointmentId}` },
      UpdateExpression: `SET ${parts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

// The two items of a cancel or a note (docs/SHARED_CALENDAR_SPEC.md section 13.4) after the lock
// update: the `Update APPT`, and `Put
// EVENT` with the snapshot after the change.
function appointmentWrite(table: string, after: AppointmentSnapshot, set: Record<string, unknown>, event: EventInput): TransactItem[] {
  return [appointmentUpdate(table, after, set), eventPut(table, event)];
}

// The old appointment of a cancel or a change, or one cancelled by a user deletion, as stored after
// it (docs/SHARED_CALENDAR_SPEC.md sections 8.3, 8.4 and 10.2): `cancelled` now by `by` with
// `reason`, `version` + 1; `replacedBy` the new id in a change. `set` is what the `Update` writes:
// exactly the attributes that changed.
function cancelled(
  before: AppointmentSnapshot,
  by: Actor,
  now: string,
  reason: CancelReason,
  replacedBy?: string,
): { after: AppointmentSnapshot; set: Record<string, unknown> } {
  const set: Record<string, unknown> = {
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: by,
    cancelReason: reason,
    ...(replacedBy === undefined ? {} : { replacedBy }),
    updatedAt: now,
    updatedBy: by,
    version: before.version + 1,
  };
  return { after: { ...before, ...set } as AppointmentSnapshot, set };
}

/** The cancel check (calendarRules.checkCancel) on the appointment read inside the attempt, or null. */
export type CancelCheck<C extends ApiErrorCode> = (appointment: AppointmentSnapshot | null, settings: CalendarSettings) => Refusal<C> | null;

/**
 * Cancels an appointment under the lock (docs/SHARED_CALENDAR_SPEC.md section 8.3). Inside each
 * attempt: the pointer and the settings, then the `APPT` item; `check` decides on them, so a retry
 * re-reads and re-checks (an appointment cancelled meanwhile answers what the check says of it).
 * Then one transaction of three items: the lock update; `Update APPT` SET `status` `cancelled`,
 * `cancelledAt` and `updatedAt` now, `cancelledBy` and `updatedBy` the caller, `cancelReason`
 * `cancelled`, `version` + 1; `Put EVENT` `appointment.cancelled`. Answers the appointment as
 * stored after the cancel.
 */
export async function cancelAppointment<C extends ApiErrorCode>(
  change: AppointmentChange,
  now: string,
  check: CancelCheck<C>,
): Promise<Locked<Checked<StoredAppointment, C>>> {
  const { table, timeZone } = calendarConfig();
  return withCalendarLock<Checked<StoredAppointment, C>>(async () => {
    const [settings, before] = await Promise.all([readSettings(table, timeZone), readAppointment(table, change.appointmentId)]);
    const refusal = check(before, settings);
    if (refusal) return { write: null, result: refused(refusal) };
    const by = actorItem(change.by);
    // The check refuses a missing appointment, so it is there.
    const { after, set } = cancelled(before!, by, now, 'cancelled');
    return {
      write: appointmentWrite(table, after, set, { type: 'appointment.cancelled', eventId: change.eventId, occurredAt: now, actor: by, appointment: after }),
      result: { ok: true, value: { appointment: toResponseFields(after, await typeNameOf(table, after)), settings } },
    };
  });
}

/** The note check (calendarRules.checkNote) on the appointment read inside the attempt, or null. */
export type NoteCheck = (appointment: AppointmentSnapshot | null) => NoteRefusal | { unchanged: boolean };

/** What a note write answers: the appointment, and whether it was written (`unchanged`: nothing was). */
export type NotedAppointment = StoredAppointment & { unchanged: boolean };

/**
 * Sets or clears the note of an appointment under the lock (docs/SHARED_CALENDAR_SPEC.md section
 * 8.5). Inside each attempt: the pointer and the settings, then the `APPT` item; `check` decides. A
 * note equal to the stored one writes nothing, not even the lock: the stored appointment is
 * answered as it is. Otherwise one transaction of three items: the lock update; `Update APPT` SET
 * `note`, `updatedAt` now, `updatedBy` the caller, `version` + 1; `Put EVENT`
 * `appointment.note_updated`. `note` is already trimmed, an empty one `null`
 * (docs/SHARED_CALENDAR_SPEC.md R-BOOK-11).
 */
export async function updateAppointmentNote(
  change: AppointmentChange & { note: string | null },
  now: string,
  check: NoteCheck,
): Promise<Locked<Checked<NotedAppointment, NoteRefusal['error']>>> {
  const { table, timeZone } = calendarConfig();
  return withCalendarLock<Checked<NotedAppointment, NoteRefusal['error']>>(async () => {
    const [settings, before] = await Promise.all([readSettings(table, timeZone), readAppointment(table, change.appointmentId)]);
    const outcome = check(before);
    if ('error' in outcome) return { write: null, result: refused(outcome) };
    // The check refuses a missing appointment, so it is there.
    const stored = before!;
    const typeName = await typeNameOf(table, stored);
    if (outcome.unchanged) {
      return { write: null, result: { ok: true, value: { appointment: toResponseFields(stored, typeName), settings, unchanged: true } } };
    }
    const by = actorItem(change.by);
    const after: AppointmentSnapshot = { ...stored, note: change.note, updatedAt: now, updatedBy: by, version: stored.version + 1 };
    const set = { note: change.note, updatedAt: now, updatedBy: by, version: after.version };
    return {
      write: appointmentWrite(table, after, set, { type: 'appointment.note_updated', eventId: change.eventId, occurredAt: now, actor: by, appointment: after }),
      result: { ok: true, value: { appointment: toResponseFields(after, typeName), settings, unchanged: false } },
    };
  });
}

// ── Changing (docs/SHARED_CALENDAR_SPEC.md section 8.4) ──────────────────────────────────────────
// The APPTID, APPT, EVENT and DELETEDUSER items of docs/SHARED_CALENDAR_SPEC.md section 13.2.

/** What the handler decided before the lock: the ids (made once per request), the new times, the note. */
export type NewChange = {
  /** The old appointment, from the path. */
  appointmentId: string;
  newAppointmentId: string;
  eventId: string;
  /** The times docs/SHARED_CALENDAR_SPEC.md R-BOOK-02 accepted, `end` filled in. */
  start: string;
  end: string;
  /**
   * As docs/SHARED_CALENDAR_SPEC.md R-CHG-03 says: `undefined` keeps the old note; otherwise the
   * new one, trimmed, an empty one null.
   */
  note: string | null | undefined;
  by: Actor;
};

/**
 * The change check (calendarRules.checkChange), on the old appointment (or null), the state and the
 * settings read inside the locked attempt: a refusal, or the effective window of the new appointment.
 */
export type ChangeCheck<C extends ApiErrorCode> = (
  appointment: AppointmentSnapshot | null,
  state: CalendarState,
  settings: CalendarSettings,
) => Refusal<C> | { window: { typeId: string } };

/** What a change answers before `cancellableUntil`: both appointments as stored, and the settings. */
export type ChangedAppointments = {
  cancelled: Omit<Appointment, 'cancellableUntil'>;
  booked: Omit<Appointment, 'cancellableUntil'>;
  settings: CalendarSettings;
};

/**
 * Changes an appointment under the lock (docs/SHARED_CALENDAR_SPEC.md sections 8.4 and 13.4).
 * Inside each attempt it reads the settings, the availability state and the old appointment by id
 * (pointer, then `APPT`), and `check` decides on them, so a retry re-reads and re-checks. Then one
 * transaction of six items: the lock update; `Update` of the old `APPT` (cancelled, `cancelReason`
 * `changed`, `replacedBy` the new id, `version` + 1); `Put` of the new `APPT` (`replaces` the old
 * id, the old one's User, the note of docs/SHARED_CALENDAR_SPEC.md R-CHG-03, the window's type) and
 * its `APPTID`; `Put EVENT` `appointment.changed` with `previous`, the old one as stored after the
 * change; the `ConditionCheck` on the User's marker (docs/SHARED_CALENDAR_SPEC.md R-BOOK-10), whose
 * failure answers `user_not_found` without a retry. Each `typeName` is the current name from the
 * state's types, or the snapshot once the type is gone.
 */
export async function changeAppointment<C extends ApiErrorCode>(
  change: NewChange,
  today: string,
  now: string,
  check: ChangeCheck<C>,
): Promise<Locked<Checked<ChangedAppointments, C | 'user_not_found'>>> {
  const { table, timeZone } = calendarConfig();
  const { newAppointmentId, eventId, start, end } = change;
  const by = actorItem(change.by);
  return withCalendarLock<Checked<ChangedAppointments, C | 'user_not_found'>>(async () => {
    const [settings, state, before] = await Promise.all([
      readSettings(table, timeZone),
      readState(table, today, now),
      readAppointment(table, change.appointmentId),
    ]);
    const outcome = check(before, state, settings);
    if ('error' in outcome) return { write: null, result: refused(outcome) };
    // The check refuses a missing appointment and finds the window among the existing types only.
    const old = before!;
    const type = state.types.find((t) => t.typeId === outcome.window.typeId)!;
    const booked = newAppointment({
      appointmentId: newAppointmentId,
      userId: old.userId,
      username: old.username,
      start,
      end,
      date: localDateOf(start, timeZone),
      type,
      note: change.note === undefined ? old.note : change.note,
      by,
      now,
      replaces: old.appointmentId,
    });
    const { after, set } = cancelled(old, by, now, 'changed', newAppointmentId);
    const oldTypeName = state.types.find((t) => t.typeId === after.typeId)?.name ?? after.typeNameAtBooking;
    const marker = 4;
    return {
      write: [
        appointmentUpdate(table, after, set),
        ...putAppointment(table, booked),
        eventPut(table, { type: 'appointment.changed', eventId, occurredAt: now, actor: by, appointment: booked, previous: after }),
        markerCheck(table, old.userId),
      ],
      onConditionFailed: { item: marker, result: notFound('user_not_found') },
      result: {
        ok: true,
        value: { cancelled: toResponseFields(after, oldTypeName), booked: toResponseFields(booked, type.name), settings },
      },
    };
  });
}

// ── Deleting a User (docs/SHARED_CALENDAR_SPEC.md section 10.2) ──────────────────────────────────
// The DELETEDUSER marker, APPT and EVENT items of docs/SHARED_CALENDAR_SPEC.md section 13.2.

/** The account being deleted: its Cognito `sub` (the appointments' `userId`) and its username. */
export type DeletedUser = { userId: string; username: string };

/**
 * What a user deletion did in the calendar: the appointments it cancelled, and the lock attempts
 * over every chunk.
 */
export type UserDeletion = { cancelledCount: number; attempts: number };

/**
 * Appointments cancelled per transaction: two items each, plus the lock and the marker, ≤ 82
 * (docs/SHARED_CALENDAR_SPEC.md section 13.4).
 */
export const DELETION_CHUNK = 40;

/**
 * Writes the deleted-user marker and cancels the User's active appointments not yet ended
 * (docs/SHARED_CALENDAR_SPEC.md section 10.2, steps 2 and 3), in chunks, each under the lock as its
 * own transaction. Inside each attempt it reads `APPT` from now − 24 h and keeps, in code, those
 * with `userId` = the User's `sub` (never the username: an earlier account with the same name keeps
 * its own, docs/SHARED_CALENDAR_SPEC.md R-DEL-02), `status` `booked` and `end > now`, one in
 * progress included; an ended or cancelled one is left as it is. The first chunk writes the lock
 * update, `Put DELETEDUSER#<sub>` (`username`, `deletedAt`, `deletedBy`; a plain Put, so a repeated
 * deletion writes it again) and up to 40 × (`Update APPT` cancelled with `cancelReason`
 * `user_deleted`, `Put EVENT` `appointment.cancelled`); each later chunk the lock update and the
 * next 40. A chunk re-reads, so a retry or the next chunk skips what is already cancelled.
 * `newEventId` is called once per appointment, on first sight: a retry writes the same event id. A
 * failure in any chunk is thrown (ConcurrentUpdateError after three lost locks); the chunks already
 * written stay written, and a repeated deletion finds the rest (docs/SHARED_CALENDAR_SPEC.md
 * R-DEL-01).
 */
export async function markUserDeleted(user: DeletedUser, by: Actor, now: string, newEventId: () => string): Promise<UserDeletion> {
  const { table } = calendarConfig();
  const actor = actorItem(by);
  const since = new Date(Date.parse(now) - DAY_MS).toISOString();
  const eventIds = new Map<string, string>();
  const eventIdOf = (appointmentId: string) => {
    if (!eventIds.has(appointmentId)) eventIds.set(appointmentId, newEventId());
    return eventIds.get(appointmentId)!;
  };
  const marker: TransactItem = {
    Put: { TableName: table, Item: { ...deletedUserKey(user.userId), username: user.username, deletedAt: now, deletedBy: actor } },
  };
  let cancelledCount = 0;
  let attempts = 0;
  for (let first = true; ; first = false) {
    const chunk = await withCalendarLock(async () => {
      const items = await queryPartition(table, APPT_PK, since);
      const active = items
        .filter((item) => item.userId === user.userId && item.status === 'booked' && (item.end as string) > now)
        .map(toSnapshot);
      const taken = active.slice(0, DELETION_CHUNK);
      const writes = taken.flatMap((before) => {
        const { after, set } = cancelled(before, actor, now, 'user_deleted');
        const event: EventInput = { type: 'appointment.cancelled', eventId: eventIdOf(after.appointmentId), occurredAt: now, actor, appointment: after };
        return appointmentWrite(table, after, set, event);
      });
      const result = { count: taken.length, more: active.length > taken.length };
      return writes.length === 0 && !first ? { write: null, result } : { write: first ? [marker, ...writes] : writes, result };
    });
    cancelledCount += chunk.result.count;
    attempts += chunk.attempts;
    if (!chunk.result.more) return { cancelledCount, attempts };
  }
}
