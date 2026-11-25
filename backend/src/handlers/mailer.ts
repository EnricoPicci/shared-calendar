import { calendarMailText, localTimeOf, mineMailText } from '@shared-calendar/shared';
import type { Context } from 'aws-lambda';
import { calendarConfig, listAppointments } from '../lib/calendarDb';
import { getProfile, namesBySub, UserNotFoundError } from '../lib/cognito';
import { appointmentsFile } from '../lib/excel';
import { log } from '../lib/logger';
import { MailerEvent } from '../lib/mailerEvent';
import { sendMail, XLSX_CONTENT_TYPE } from '../lib/ses';

/** What one run ends with: the outcome of the log line, and the count of appointments sent. */
export type MailerResult = { outcome: 'sent' | 'invalid_event' | 'user_not_found' | 'no_email_address'; appointmentCount?: number };

// The mailer (docs/EMAIL_ARCHITECTURE.md section 6.1): one mail on demand, of the kind `calendar`
// (every appointment of the range, to the Administrator who asked) or `mine` (a User's own
// appointments of the range, listed in the mail and in the file). It is started in the background
// by POST /mail/calendar, or by hand with `npm run mail:send`, never by a person's request.
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
export const handler = async (event: unknown, context?: Pick<Context, 'awsRequestId'>): Promise<MailerResult> => {
  const started = Date.now();
  const now = new Date(started).toISOString();
  const invocationId = context?.awsRequestId ?? 'unknown';
  const done = (result: MailerResult, fields: Record<string, unknown>): MailerResult => {
    const level = result.outcome === 'sent' ? 'info' : 'error';
    log(level, { requestId: 'unknown', invocationId, ...fields, outcome: result.outcome, durationMs: Date.now() - started });
    return result;
  };

  const parsed = MailerEvent.safeParse(event);
  if (!parsed.success) {
    // Only the paths of what is wrong, and the names of unknown fields, never a value: the event
    // could hold anything.
    const problems = parsed.error.issues.flatMap((issue) =>
      issue.code === 'unrecognized_keys' ? issue.keys.map((key) => [...issue.path, key].join('.')) : [issue.path.join('.') || '(root)'],
    );
    return done({ outcome: 'invalid_event' }, { problems });
  }
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
    // The error's name only: a refusal of SES can quote the addresses it refused in its message, and
    // Lambda writes a thrown error into the log, so the error thrown again carries the name alone.
    const reason = (err as { name?: unknown } | null)?.name;
    const name = typeof reason === 'string' ? reason : 'Error';
    log('error', { ...fields, invocationId, outcome: 'error', reason: name, durationMs: Date.now() - started });
    throw new Error(`The mail was not sent: ${name}`);
  }
};
