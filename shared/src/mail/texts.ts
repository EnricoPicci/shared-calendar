import type { AppointmentStatus, CancelReason } from '../calendar/types';
import type { Language } from '../language/languages';
import { MAIL_TEXTS_EN } from './texts.en';
import { MAIL_TEXTS_IT } from './texts.it';

// The texts of the mails the mailer sends and of the Excel files it attaches, in each language of
// the calendar (docs/MULTILANGUAGE_ARCHITECTURE.md section 8, docs/EMAIL_ARCHITECTURE.md section
// 6.6 and decision M17). A mail is a subject, a plain-text body and an HTML body with the same
// words, marked with its language. The invitation is Cognito's mail, worded here and answered to
// Cognito by the invitation function (docs/MULTILANGUAGE_ARCHITECTURE.md section 7).

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

/** The columns of an Excel file, in their order. */
export const EXCEL_COLUMNS = ['date', 'start', 'end', 'type', 'username', 'givenName', 'familyName', 'status', 'cancelReason', 'note', 'bookedAt'] as const;
export type ExcelColumn = (typeof EXCEL_COLUMNS)[number];

/** The invitation: where Cognito puts the username and the temporary password, and the page's address. */
export type InvitationFacts = { username: string; password: string; page: string };

/** A mail before it is put together: its subject, its paragraphs, and the items of a list after the first paragraph. */
export type MailParts = { subject: string; paragraphs: string[]; items?: string[] };

// The words of one language: one object of this type per language, so that a language with a text
// missing does not compile. A text that carries a value is a function of that value.
export type MailTexts = {
  // The last line of every mail: `noreply@` receives nothing, the Reply-To does.
  footer: string;
  // The invitation's words, put together around the username, the password and the page's link.
  invitation: {
    subject: string;
    hello: string;
    username: string;
    password: string;
    // The sentence that holds the page's link: the words before it and after it.
    signIn: { before: string; after: string };
    unexpected: string;
  };
  // The three mails, from their facts.
  daily: (facts: DailyMailFacts) => MailParts;
  calendar: (facts: CalendarMailFacts) => MailParts;
  mine: (facts: MineMailFacts) => MailParts;
  // The words of an appointment's status and of the reason of a cancellation, in a mail's list and
  // in a file.
  statuses: Record<AppointmentStatus, string>;
  reasons: Record<CancelReason, string>;
  // The files: the headings of the columns, the sheet's name (31 characters at most, Excel's
  // limit), and the four file names, in plain letters, digits and `-` (docs/MULTILANGUAGE_ARCHITECTURE.md
  // decision L3).
  headings: Record<ExcelColumn, string>;
  sheet: string;
  files: {
    calendar: (from: string, to: string) => string;
    mine: (from: string, to: string) => string;
    next7Days: (date: string) => string;
    backup: (from: string) => string;
  };
};

const MAIL_TEXTS: Record<Language, MailTexts> = { en: MAIL_TEXTS_EN, it: MAIL_TEXTS_IT };

/** The words of the mails and the files of a language. */
export function mailTexts(language: Language): MailTexts {
  return MAIL_TEXTS[language];
}

// Text that goes into the HTML body: the five characters HTML gives a meaning, written as entities,
// so that a type's name or a file name is shown as typed and never read as markup.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A mail made of paragraphs, and of one list where `items` is given, after the first paragraph,
// with the footer last. The plain text puts a blank line between paragraphs and "- " before an
// item. The HTML is one block marked with the mail's language, so that a reader pronounces it
// rightly.
function mail(language: Language, { subject, paragraphs, items }: MailParts): MailText {
  const [first, ...rest] = [...paragraphs, mailTexts(language).footer];
  const textList = items === undefined ? [] : [items.map((item) => `- ${item}`).join('\n')];
  const htmlList = items === undefined ? [] : [`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`];
  const text = [first!, ...textList, ...rest].join('\n\n') + '\n';
  const html = `<div lang="${language}">${[`<p>${escapeHtml(first!)}</p>`, ...htmlList, ...rest.map((p) => `<p>${escapeHtml(p)}</p>`)].join('\n')}</div>`;
  return { subject, text, html };
}

/**
 * The invitation, a subject and an HTML body: Cognito sends no plain text with it. The username and
 * the password are what Cognito gives in their place, `{username}` and `{####}`, which it fills in
 * after; the password never passes through this code.
 */
export function invitationMailText(language: Language, { username, password, page }: InvitationFacts): { subject: string; html: string } {
  const words = mailTexts(language);
  const { invitation: say } = words;
  const link = `<a href="${escapeHtml(page)}">${escapeHtml(page)}</a>`;
  const paragraphs = [
    escapeHtml(say.hello),
    `${escapeHtml(say.username)}: ${escapeHtml(username)}<br>${escapeHtml(say.password)}: ${escapeHtml(password)}`,
    `${escapeHtml(say.signIn.before)}${link}${escapeHtml(say.signIn.after)}`,
    escapeHtml(say.unexpected),
    escapeHtml(words.footer),
  ];
  return { subject: say.subject, html: `<div lang="${language}">${paragraphs.map((p) => `<p>${p}</p>`).join('\n')}</div>` };
}

/** The daily mail to the Administrator, with its two files (docs/EMAIL_ARCHITECTURE.md section 6.3). */
export function dailyMailText(language: Language, facts: DailyMailFacts): MailText {
  return mail(language, mailTexts(language).daily(facts));
}

/** The whole calendar between two dates, to the Administrator who asked. */
export function calendarMailText(language: Language, facts: CalendarMailFacts): MailText {
  return mail(language, mailTexts(language).calendar(facts));
}

/** A User's own appointments between two dates, listed in the mail and in the file. */
export function mineMailText(language: Language, facts: MineMailFacts): MailText {
  return mail(language, mailTexts(language).mine(facts));
}
