import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_MAIL_SETTINGS, isValidTimeZone, MAIL_LIMITS, type MailSettings } from '@shared-calendar/shared';
import { documentClient } from './db';

// The table `mail` (docs/EMAIL_ARCHITECTURE.md section 10.1). This is the only module that knows
// its item layout: the daily mail's settings, the daily mark, the counts of the mails on demand. It
// holds no personal data: no address, no name, only a person's `sub` and the username of the last
// person who saved the settings. It logs nothing, and "now" is passed in.

/** Where the table is, and the calendar's time zone, whose local day the counters count. */
export type MailConfig = { table: string; timeZone: string };

// A broken deployment parameter: the handler answers 500 internal_error. Thrown on use, never at
// import, as for the calendar's configuration.
export class MailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailConfigError';
  }
}

/** MAIL_TABLE and CALENDAR_TIME_ZONE, read on every call: two variables, nothing to keep. */
export function mailConfig(): MailConfig {
  const table = process.env.MAIL_TABLE;
  const timeZone = process.env.CALENDAR_TIME_ZONE;
  if (!table) throw new MailConfigError('MAIL_TABLE is not set');
  if (!isValidTimeZone(timeZone)) throw new MailConfigError(`CALENDAR_TIME_ZONE is not a valid time zone: ${JSON.stringify(timeZone ?? null)}`);
  return { table, timeZone: timeZone as string };
}

// A counter lives two days after the day it counts, then DynamoDB deletes it by itself (time to
// live, docs/EMAIL_ARCHITECTURE.md section 10.1). Nothing relies on that deletion: a counter is
// read by its date, so yesterday's never counts today.
const COUNTER_KEPT_SECONDS = 2 * 24 * 60 * 60;

/**
 * Counts one mail on demand for a person on a local date (the item `QUOTA#<sub>` / `<date>`), in
 * one conditional write: the count goes up only while it is below the day's limit
 * (docs/EMAIL_ARCHITECTURE.md section 6.5). Two requests at the same moment cannot both take the
 * last place. Answers false, writing nothing, when the day's mails are used up.
 */
export async function countMailRequest(sub: string, date: string, now: string): Promise<boolean> {
  const { table } = mailConfig();
  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: `QUOTA#${sub}`, SK: date },
        UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, expiresAt = :expiresAt',
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':limit': MAIL_LIMITS.mailsPerDay,
          ':expiresAt': Math.floor(Date.parse(now) / 1000) + COUNTER_KEPT_SECONDS,
        },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

// ── The daily mail's settings (docs/EMAIL_ARCHITECTURE.md sections 9.1 and 10.1) ─────────────────

const SETTINGS_KEY = { PK: 'SETTINGS', SK: 'SETTINGS' } as const;

/**
 * The daily mail's settings: those saved last, or the defaults (switched on, at 07:00) until the
 * Administrator first saves them. Only the two values are answered: who saved them, and when, stay
 * in the table.
 */
export async function getMailSettings(): Promise<MailSettings> {
  const { table } = mailConfig();
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: SETTINGS_KEY, ConsistentRead: true }));
  if (!Item) return { ...DEFAULT_MAIL_SETTINGS };
  return { dailyEnabled: Item.dailyEnabled as boolean, dailyHour: Item.dailyHour as number };
}

/**
 * Saves the daily mail's settings, with the moment and the Administrator's username, in one write
 * that replaces the earlier ones: the last save wins, as two saves of the same form would. Answers
 * the settings saved.
 */
export async function putMailSettings(settings: MailSettings, by: string, now: string): Promise<MailSettings> {
  const { table } = mailConfig();
  const saved = { dailyEnabled: settings.dailyEnabled, dailyHour: settings.dailyHour };
  await documentClient.send(new PutCommand({ TableName: table, Item: { ...SETTINGS_KEY, ...saved, updatedAt: now, updatedBy: by } }));
  return saved;
}

// ── The daily mark (docs/EMAIL_ARCHITECTURE.md section 6.2) ──────────────────────────────────────

/** Where a day's daily mail stands: being sent, sent, or failed and waiting to be tried again. */
export type DailyState = 'sending' | 'sent' | 'failed';

// A run that was cut off leaves its mark `sending`; another run may take it again only once it is
// this old, longer than the mailer's 30 seconds by far, so that two runs never send at once
// (docs/EMAIL_ARCHITECTURE.md section 6.2).
export const DAILY_STALE_MS = 10 * 60 * 1000;

// A daily mark is kept 400 days after its last write, then DynamoDB deletes it by itself (time to
// live, docs/EMAIL_ARCHITECTURE.md section 10.1): the marks show which days' mails went.
const MARK_KEPT_SECONDS = 400 * 24 * 60 * 60;
const expiresAt = (now: string) => Math.floor(Date.parse(now) / 1000) + MARK_KEPT_SECONDS;

/**
 * When a run may take the day's mark: `hour` at the chosen hour, where a mark that is absent is
 * written; `retry` at a later hour of the same day, where only a mark to take again lets it go on.
 * In both, a mark is taken again from `failed`, or from `sending` older than ten minutes
 * (docs/EMAIL_ARCHITECTURE.md section 6.2).
 */
export type DailyTake = 'hour' | 'retry';

/** What taking the mark gave: the run's own mark, or the state that stopped it (`null`: no mark). */
export type DailyTaken = { taken: true; startedAt: string } | { taken: false; state: DailyState | null };

/**
 * Takes the daily mark of a local date for this run, in one conditional write: the mark becomes
 * `sending`, started now, only when the rule of `take` allows it. Two runs at the same moment
 * cannot both take it. When the condition fails, the mark is read to say what stopped the run.
 */
export async function takeDailyMark(date: string, take: DailyTake, now: string): Promise<DailyTaken> {
  const { table } = mailConfig();
  const again = '#state = :failed OR (#state = :sending AND startedAt < :staleBefore)';
  try {
    await documentClient.send(
      new PutCommand({
        TableName: table,
        Item: { PK: 'DAILY', SK: date, state: 'sending', startedAt: now, expiresAt: expiresAt(now) },
        ConditionExpression: take === 'hour' ? `attribute_not_exists(PK) OR ${again}` : again,
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: { ':failed': 'failed', ':sending': 'sending', ':staleBefore': new Date(Date.parse(now) - DAILY_STALE_MS).toISOString() },
      }),
    );
    return { taken: true, startedAt: now };
  } catch (err) {
    if (!(err instanceof ConditionalCheckFailedException)) throw err;
  }
  const { Item } = await documentClient.send(new GetCommand({ TableName: table, Key: { PK: 'DAILY', SK: date }, ConsistentRead: true }));
  return { taken: false, state: Item ? (Item.state as DailyState) : null };
}

/** How the run that took a mark ended: sent, with each mail's SES message id and the counts, or failed. */
export type DailyOutcome =
  | { state: 'sent'; sesMessageIds: string[]; appointmentCount: number; backupCount: number }
  | { state: 'failed' };

/**
 * Writes how the run ended on its mark, in one conditional write: only while the mark is still
 * this run's own, `sending` since `startedAt`. Answers false, writing nothing, when another run
 * took the mark meanwhile (this one was then more than ten minutes long).
 */
export async function finishDailyMark(date: string, startedAt: string, outcome: DailyOutcome, now: string): Promise<boolean> {
  const { table } = mailConfig();
  const sent = outcome.state === 'sent';
  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: table,
        Key: { PK: 'DAILY', SK: date },
        UpdateExpression: sent
          ? 'SET #state = :state, finishedAt = :now, expiresAt = :expiresAt, sesMessageIds = :ids, appointmentCount = :count, backupCount = :backup'
          : 'SET #state = :state, finishedAt = :now, expiresAt = :expiresAt',
        ConditionExpression: '#state = :sending AND startedAt = :startedAt',
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: {
          ':state': outcome.state,
          ':now': now,
          ':expiresAt': expiresAt(now),
          ':sending': 'sending',
          ':startedAt': startedAt,
          ...(sent && { ':ids': outcome.sesMessageIds, ':count': outcome.appointmentCount, ':backup': outcome.backupCount }),
        },
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}
