import type { AppointmentStatus } from '../calendar/types';
import { weekdayOf } from '../calendar/time';

// The texts of the mails the mailer sends, in English (docs/EMAIL_ARCHITECTURE.md section 6.6 and
// decision M17), as pure functions: each gives a subject, a plain-text body and an HTML body with
// the same words. The invitation is not here: Cognito sends it from the pool's own template.

/** One mail's words. */
export type MailText = { subject: string; text: string; html: string };

/** One appointment as a line of a User's mail: its local date and times, its type, its status. */
export type MailLine = { date: string; start: string; end: string; type: string; status: AppointmentStatus };

/** The daily mail: today's date, the count of the next 7 days, the backup's first date, the two files. */
export type DailyMailFacts = { date: string; nextCount: number; backupFrom: string; nextFile: string; backupFile: string };

/** The Administrator's calendar on demand: the dates asked, the count, the file. */
export type CalendarMailFacts = { from: string; to: string; count: number; file: string };

/** A User's own appointments on demand: the dates asked, the appointments in order, the file. */
export type MineMailFacts = { from: string; to: string; appointments: MailLine[]; file: string };

/** The last line of every mail: `noreply@` receives nothing, the Reply-To does. */
export const MAIL_FOOTER = "This is an automatic e-mail. Replies reach the calendar's Administrator.";

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A local date written short: "Tue 1 Dec 2026".
const shortDate = (date: string) => `${WEEKDAYS[weekdayOf(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

// "1 appointment", "3 appointments".
const appointments = (count: number) => `${count} appointment${count === 1 ? '' : 's'}`;

// Text that goes into the HTML body: the five characters HTML gives a meaning, written as entities,
// so that a type's name or a file name is shown as typed and never read as markup.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A mail made of paragraphs, and of one list where `items` is given, after the first paragraph,
// with the footer last. The plain text puts a blank line between paragraphs and "- " before an item.
function mail(subject: string, paragraphs: string[], items?: string[]): MailText {
  const [first, ...rest] = [...paragraphs, MAIL_FOOTER];
  const textList = items === undefined ? [] : [items.map((item) => `- ${item}`).join('\n')];
  const htmlList = items === undefined ? [] : [`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`];
  const text = [first!, ...textList, ...rest].join('\n\n') + '\n';
  const html = [`<p>${escapeHtml(first!)}</p>`, ...htmlList, ...rest.map((p) => `<p>${escapeHtml(p)}</p>`)].join('\n');
  return { subject, text, html };
}

/** The daily mail to the Administrator, with its two files (docs/EMAIL_ARCHITECTURE.md section 6.3). */
export function dailyMailText({ date, nextCount, backupFrom, nextFile, backupFile }: DailyMailFacts): MailText {
  return mail(`Calendar: next 7 days and backup, ${shortDate(date)}`, [
    `The next 7 days hold ${appointments(nextCount)}.`,
    `Attached: ${nextFile}, the appointments booked from today for 7 days; ${backupFile}, the backup.`,
    `The backup covers every appointment from ${shortDate(backupFrom)} onwards.`,
  ]);
}

/** The whole calendar between two dates, to the Administrator who asked. */
export function calendarMailText({ from, to, count, file }: CalendarMailFacts): MailText {
  return mail(`Calendar, ${shortDate(from)} to ${shortDate(to)}`, [
    `The calendar from ${shortDate(from)} to ${shortDate(to)} holds ${appointments(count)}, booked and cancelled.`,
    `Attached: ${file}.`,
  ]);
}

/** A User's own appointments between two dates, listed in the mail and in the file. */
export function mineMailText({ from, to, appointments: lines, file }: MineMailFacts): MailText {
  const subject = `Your appointments, ${shortDate(from)} to ${shortDate(to)}`;
  if (lines.length === 0) return mail(subject, ['You have no appointments in this period.', `Attached: ${file}.`]);
  const items = lines.map((a) => `${shortDate(a.date)}, ${a.start}–${a.end}, ${a.type}, ${a.status}`);
  return mail(subject, [`Your appointments from ${shortDate(from)} to ${shortDate(to)}:`, `Attached: ${file}, the same list.`], items);
}
