import { addDays, calendarMailText, dailyMailText, localDateOf, localTimeOf, mineMailText } from '@shared-calendar/shared';
import type { Context } from 'aws-lambda';
import type { ZodError } from 'zod';
import { calendarConfig, listAppointments } from '../lib/calendarDb';
import { adminRecipients, getProfile, namesBySub, UserNotFoundError } from '../lib/cognito';
import { appointmentsFile } from '../lib/excel';
import { log } from '../lib/logger';
import { finishDailyMark, getMailSettings, takeDailyMark, type DailyTake } from '../lib/mailDb';
import { DailyEvent, isDailyEvent, MailerEvent } from '../lib/mailerEvent';
import { sendMail, XLSX_CONTENT_TYPE } from '../lib/ses';

/** What one run on demand ends with: the outcome of the log line, and the count of appointments sent. */
export type MailerResult = { outcome: 'sent' | 'invalid_event' | 'user_not_found' | 'no_email_address'; appointmentCount?: number };

/**
 * What one daily run ends with (docs/EMAIL_ARCHITECTURE.md section 6.2): the outcome of the log line
 * and, when the run went as far as the mails, how many went, the administrators skipped for want
 * of an address, and the rows of the two files.
 */
export type DailyResult = {
  outcome:
    | 'sent' // a mail to every administrator with an address
    | 'no_recipient' // the mark was taken, but no administrator has an address
    | 'invalid_event'
    | 'mail_unavailable' // the stage is not `on`
    | 'switched_off' // the daily mail is off in the settings
    | 'not_the_hour' // an earlier hour, or a later one with no mark to take again
    | 'already_sent' // the day's mark is `sent`
    | 'in_progress'; // the day's mark is `sending`, younger than ten minutes
  date?: string;
  hour?: number;
  mailCount?: number;
  skipped?: string[];
  appointmentCount?: number;
  backupCount?: number;
};

// Only the paths of what is wrong in an event, and the names of unknown fields, never a value: the
// event could hold anything.
const problemsOf = (error: ZodError) =>
  error.issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys.map((key) => [...issue.path, key].join('.')) : [issue.path.join('.') || '(root)']));

// The error's name only: a refusal of SES can quote the addresses it refused in its message, and
// Lambda writes a thrown error into the log, so the error thrown again carries the name alone.
const nameOf = (err: unknown) => {
  const reason = (err as { name?: unknown } | null)?.name;
  return typeof reason === 'string' ? reason : 'Error';
};

// The mailer (docs/EMAIL_ARCHITECTURE.md section 6.1). An event of the kind `daily`, from the hourly
// timer or `npm run mail:daily`, is the daily mail, below. Any other is one mail on demand, of the
// kind `calendar` (every appointment of the range, to the Administrator who asked) or `mine` (a
// User's own appointments of the range, listed in the mail and in the file). It is started in the
// background by POST /mail/calendar, or by hand with `npm run mail:send`, never by a person's
// request.
//
// The event is checked first. The address and the names are read in Cognito, never taken from the
// event, so a mail goes only to the account's own address (docs/EMAIL_ARCHITECTURE.md decision
// M10). The appointments are read through the calendar's own code, every status
// (docs/EMAIL_ARCHITECTURE.md section 6.4), and the texts are those of shared/src/mail/texts.ts.
//
// A run that cannot succeed by being tried again (an event that is not one, an account deleted
// since, no address) is a logged failure and sends nothing; any other failure is thrown, so that
// Lambda tries the run twice more and the mailer's errors count it. One log line per run
// (docs/EMAIL_ARCHITECTURE.md section 16): the kind, the recipient's username, the range, the
// count, the SES message id, the outcome; never an address, a name, a text or a file.
export const handler = async (event: unknown, context?: Pick<Context, 'awsRequestId'>): Promise<MailerResult | DailyResult> => {
  if (isDailyEvent(event)) return daily(event, context);
  const started = Date.now();
  const now = new Date(started).toISOString();
  const invocationId = context?.awsRequestId ?? 'unknown';
  const done = (result: MailerResult, fields: Record<string, unknown>): MailerResult => {
    const level = result.outcome === 'sent' ? 'info' : 'error';
    log(level, { requestId: 'unknown', invocationId, ...fields, outcome: result.outcome, durationMs: Date.now() - started });
    return result;
  };

  const parsed = MailerEvent.safeParse(event);
  if (!parsed.success) return done({ outcome: 'invalid_event' }, { problems: problemsOf(parsed.error) });
  const { kind, sub, username, role, from, to, requestId } = parsed.data;
  const fields = { requestId, kind, username, role, from, to };

  try {
    const { timeZone } = calendarConfig();
    let address: string | null;
    try {
      address = (await getProfile(username)).email;
    } catch (err) {
      if (err instanceof UserNotFoundError) return done({ outcome: 'user_not_found' }, fields);
      throw err;
    }
    if (address === null) return done({ outcome: 'no_email_address' }, fields);

    const owner = kind === 'mine' ? { userId: sub } : null;
    const [{ appointments }, names] = await Promise.all([
      listAppointments({ from, to }, { owner, status: 'all' }, now),
      kind === 'calendar' ? namesBySub() : Promise.resolve(null),
    ]);
    const fileName = kind === 'calendar' ? `calendar-${from}-to-${to}.xlsx` : `my-appointments-${from}-to-${to}.xlsx`;
    const text =
      kind === 'calendar'
        ? calendarMailText({ from, to, count: appointments.length, file: fileName })
        : mineMailText({
            from,
            to,
            file: fileName,
            appointments: appointments.map(({ appointment: a }) => ({ date: a.date, start: localTimeOf(a.start, timeZone), end: localTimeOf(a.end, timeZone), type: a.typeName, status: a.status })),
          });
    const content = await appointmentsFile(appointments, timeZone, names);
    const sesMessageId = await sendMail(address, text, [{ fileName, contentType: XLSX_CONTENT_TYPE, content }]);
    return done({ outcome: 'sent', appointmentCount: appointments.length }, { ...fields, appointmentCount: appointments.length, sesMessageId });
  } catch (err) {
    const name = nameOf(err);
    log('error', { ...fields, invocationId, outcome: 'error', reason: name, durationMs: Date.now() - started });
    throw new Error(`The mail was not sent: ${name}`);
  }
};

// The first day of the month before a local date's: the backup's first date
// (docs/EMAIL_ARCHITECTURE.md section 6.3). On 26 November 2026 it is 1 October 2026.
function firstOfLastMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`;
}

// The daily mail (docs/EMAIL_ARCHITECTURE.md sections 6.2 and 6.3), started every hour by the timer,
// sent at most once a day to every administrator with an address. The run goes in this order, the
// first stop deciding:
// 1. the event, then the stage: anything but `on` stops before anything is read, so a stack whose
//    mail is not ready never calls SES;
// 2. the settings: switched off stops;
// 3. the hour in the calendar's time zone, with the day's mark. At the chosen hour the mark is
//    written when absent; at a later hour of the same day only a mark to take again lets the run go
//    on, so that a failed mail is tried again later that day; either way a mark is taken again from
//    `failed`, or from `sending` older than ten minutes. An earlier hour stops;
// 4. the administrators: each one with an address gets a mail of their own, so that nobody sees
//    another's address; one without is skipped, named in the log line;
// 5. the two files: the next 7 days, booked only, and the backup from the 1st of last month, every
//    status, read up to today plus 366 days, beyond any booking horizon;
// 6. the mails, with the text of shared/src/mail/texts.ts, then the mark `sent`.
// Any failure after the mark sets it `failed` and is thrown, so that Lambda tries the run again and
// the mailer's error alarm counts it; the retry finds the mark `failed` and takes it. One log line
// per run (docs/EMAIL_ARCHITECTURE.md section 16): the outcome, the date, the hour, the mails sent
// and skipped, the rows of the two files; never an address or a name.
async function daily(event: unknown, context?: Pick<Context, 'awsRequestId'>): Promise<DailyResult> {
  const started = Date.now();
  const invocationId = context?.awsRequestId ?? 'unknown';
  const done = (result: DailyResult, fields: Record<string, unknown> = {}): DailyResult => {
    const level = result.outcome === 'invalid_event' ? 'error' : result.outcome === 'no_recipient' ? 'warn' : 'info';
    log(level, { requestId: invocationId, invocationId, kind: 'daily', ...fields, ...result, durationMs: Date.now() - started });
    return result;
  };

  const parsed = DailyEvent.safeParse(event);
  if (!parsed.success) return done({ outcome: 'invalid_event' }, { problems: problemsOf(parsed.error) });
  if (parsed.data.now !== undefined && process.env.MAIL_ALLOW_NOW !== 'true') return done({ outcome: 'invalid_event' }, { problems: ['now'] });
  if (process.env.MAIL_STAGE !== 'on') return done({ outcome: 'mail_unavailable' });
  // "Now" is read once per run, or given by the event where that is allowed; the moment the mark
  // is finished is the clock's, or that same given "now".
  const given = parsed.data.now;
  const now = given ?? new Date(started).toISOString();
  const finished = () => given ?? new Date().toISOString();

  let date: string | undefined;
  let mark: { startedAt: string } | undefined;
  let mailCount = 0;
  try {
    const { timeZone } = calendarConfig();
    date = localDateOf(now, timeZone);
    const hour = Number(localTimeOf(now, timeZone).slice(0, 2));
    const settings = await getMailSettings();
    if (!settings.dailyEnabled) return done({ outcome: 'switched_off', date, hour });
    if (hour < settings.dailyHour) return done({ outcome: 'not_the_hour', date, hour });

    const take: DailyTake = hour === settings.dailyHour ? 'hour' : 'retry';
    const taken = await takeDailyMark(date, take, now);
    if (!taken.taken) {
      const outcome = taken.state === 'sent' ? 'already_sent' : taken.state === 'sending' ? 'in_progress' : 'not_the_hour';
      return done({ outcome, date, hour });
    }
    mark = { startedAt: taken.startedAt };

    const admins = await adminRecipients();
    const recipients = admins.flatMap((a) => (a.email === null ? [] : [a.email]));
    const skipped = admins.filter((a) => a.email === null).map((a) => a.username);
    if (recipients.length === 0) {
      await finishDailyMark(date, mark.startedAt, { state: 'sent', sesMessageIds: [], appointmentCount: 0, backupCount: 0 }, finished());
      return done({ outcome: 'no_recipient', date, hour, mailCount: 0, skipped });
    }

    const lastOfNext = addDays(date, 6);
    const backupFrom = firstOfLastMonth(date);
    const [{ appointments }, names] = await Promise.all([listAppointments({ from: backupFrom, to: addDays(date, 366) }, { owner: null, status: 'all' }, now), namesBySub()]);
    const next = appointments.filter(({ appointment: a }) => a.status === 'booked' && a.date >= date! && a.date <= lastOfNext);
    const nextFile = `calendar-next-7-days-${date}.xlsx`;
    const backupFile = `calendar-backup-from-${backupFrom}.xlsx`;
    const [nextContent, backupContent] = await Promise.all([appointmentsFile(next, timeZone, names), appointmentsFile(appointments, timeZone, names)]);
    const text = dailyMailText({ date, nextCount: next.length, backupFrom, nextFile, backupFile });
    const files = [
      { fileName: nextFile, contentType: XLSX_CONTENT_TYPE, content: nextContent },
      { fileName: backupFile, contentType: XLSX_CONTENT_TYPE, content: backupContent },
    ];

    const sesMessageIds: string[] = [];
    for (const recipient of recipients) {
      sesMessageIds.push(await sendMail(recipient, text, files));
      mailCount += 1;
    }
    const counts = { appointmentCount: next.length, backupCount: appointments.length };
    const kept = await finishDailyMark(date, mark.startedAt, { state: 'sent', sesMessageIds, ...counts }, finished());
    return done({ outcome: 'sent', date, hour, mailCount, skipped, ...counts }, { sesMessageIds, ...(!kept && { markTakenOver: true }) });
  } catch (err) {
    const name = nameOf(err);
    if (date !== undefined && mark !== undefined) {
      // The mark goes to `failed`, so that the retry takes it at once; should that write fail too,
      // the mark stays `sending` and is taken again after ten minutes.
      await finishDailyMark(date, mark.startedAt, { state: 'failed' }, finished()).catch(() => false);
    }
    log('error', { requestId: invocationId, invocationId, kind: 'daily', date, mailCount, outcome: 'error', reason: name, durationMs: Date.now() - started });
    throw new Error(`The daily mail was not sent: ${name}`);
  }
}
