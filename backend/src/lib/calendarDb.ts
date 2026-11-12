import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_SETTINGS,
  isValidTimeZone,
  type Actor,
  type ApiErrorCode,
  type AppointmentStatus,
  type AvailabilityType,
  type CalendarSettings,
  type UpdateSettingsBody,
} from '@shared-calendar/shared';
import type { Refusal, TypeReferences } from './calendarRules';
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

// The saved settings, or the defaults until the first save (R-SET-01).
export async function getSettings(): Promise<CalendarSettings> {
  const { table, timeZone } = calendarConfig();
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: SETTINGS_KEY, ConsistentRead: true }));
  const values = (Item as SettingsValues | undefined) ?? { ...DEFAULT_SETTINGS, updatedAt: null, updatedBy: null };
  return { timeZone, ...pickValues(values) };
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

// Every item of one partition, or of its part from `fromSk` on (SK ≥ fromSk), in SK order:
// a consistent Query that follows LastEvaluatedKey to the end. Every query of this module uses it.
async function queryPartition(table: string, pk: string, fromSk?: string): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Item | undefined;
  do {
    const page = await documentClient.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: fromSk === undefined ? 'PK = :pk' : 'PK = :pk AND SK >= :from',
        ExpressionAttributeValues: fromSk === undefined ? { ':pk': pk } : { ':pk': pk, ':from': fromSk },
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

const refused = <C extends ApiErrorCode>(error: C) => ({ ok: false, error }) as const;

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
    if (refusal) return { write: null, result: refused(refusal.error) };
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
    if (!current) return { write: null, result: refused('type_not_found') };
    const refusal = check(types);
    if (refusal) return { write: null, result: refused(refusal.error) };
    const renamed: TypeRecord = { ...current, ...rename, updatedAt: now };
    return { write: [putType(table, renamed)], result: { ok: true, value: toAvailabilityType(renamed) } };
  });
}

// One day in milliseconds: an appointment lasts at most this long (13.2).
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What can refer to a type and is not in the past (13.2 access patterns): every pattern, the
 * overrides and one-off windows dated `today` or later (a window's SK is `<date>#<windowId>`), and
 * the appointments that started at most 24 h before `now` (none lasts longer), so every one not
 * yet ended. The filter on status and end is checkTypeDelete's.
 */
async function readTypeReferences(table: string, today: string, now: string): Promise<TypeReferences> {
  const since = new Date(Date.parse(now) - DAY_MS).toISOString();
  const [patterns, overrides, windows, appointments] = await Promise.all([
    queryPartition(table, 'PATTERN'),
    queryPartition(table, 'OVERRIDE', today),
    queryPartition(table, 'WINDOW', today),
    queryPartition(table, 'APPT', since),
  ]);
  return {
    patterns: patterns.map((p) => ({ typeId: p.typeId as string })),
    overrides: overrides.map((o) => ({
      date: o.SK as string,
      windows: ((o.windows as Item[] | undefined) ?? []).map((w) => ({ typeId: w.typeId as string })),
    })),
    windows: windows.map((w) => ({ date: w.date as string, typeId: w.typeId as string })),
    appointments: appointments.map((a) => ({
      typeId: a.typeId as string,
      status: a.status as AppointmentStatus,
      end: a.end as string,
    })),
  };
}

// The check of a delete: given what still refers to types, read inside the locked attempt.
export type TypeDeleteCheck = (refs: TypeReferences) => Refusal<'type_in_use'> | null;

/**
 * Deletes a type under the lock (R-TYPE-03): `type_not_found` if it is not there at the time of
 * the attempt, otherwise `check` decides on the references read inside the attempt. The lock
 * serializes every calendar write, so the delete needs no condition of its own.
 */
export async function deleteType(
  typeId: string,
  today: string,
  now: string,
  check: TypeDeleteCheck,
): Promise<Locked<Checked<null, 'type_not_found' | 'type_in_use'>>> {
  const { table } = calendarConfig();
  const key = { PK: TYPE_PK, SK: typeId };
  return withCalendarLock<Checked<null, 'type_not_found' | 'type_in_use'>>(async () => {
    const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }));
    if (!Item) return { write: null, result: refused('type_not_found') };
    const refusal = check(await readTypeReferences(table, today, now));
    if (refusal) return { write: null, result: refused(refusal.error) };
    return { write: [{ Delete: { TableName: table, Key: key } }], result: { ok: true, value: null } };
  });
}
