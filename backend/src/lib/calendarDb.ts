import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_SETTINGS,
  isValidTimeZone,
  type Actor,
  type CalendarSettings,
  type UpdateSettingsBody,
} from '@shared-calendar/shared';
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
