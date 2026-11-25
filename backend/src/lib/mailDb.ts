import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isValidTimeZone, MAIL_LIMITS } from '@shared-calendar/shared';
import { documentClient } from './db';

// The table `mail` (docs/EMAIL_ARCHITECTURE.md section 10.1). This is the only module that knows
// its item layout. It holds no personal data: no address, no name, only a person's `sub`.

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
