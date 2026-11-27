import { dateFormats } from '../language/formats';
import type { MailTexts } from './texts';

// The mails and the Excel files in English (docs/MULTILANGUAGE_ARCHITECTURE.md section 8).

// A local date written short, with its year: "Tue 1 Dec 2026".
const shortDate = dateFormats('en').shortDateWithYear;

// "1 appointment", "3 appointments".
const appointments = (count: number) => `${count} appointment${count === 1 ? '' : 's'}`;

const STATUSES = { booked: 'booked', cancelled: 'cancelled' } as const;

export const MAIL_TEXTS_EN: MailTexts = {
  footer: "This is an automatic e-mail. Replies reach the calendar's Administrator.",
  daily: ({ date, nextCount, backupFrom, nextFile, backupFile }) => ({
    subject: `Calendar: next 7 days and backup, ${shortDate(date)}`,
    paragraphs: [
      `The next 7 days hold ${appointments(nextCount)}.`,
      `Attached: ${nextFile}, the appointments booked from today for 7 days; ${backupFile}, the backup.`,
      `The backup covers every appointment from ${shortDate(backupFrom)} onwards.`,
    ],
  }),
  calendar: ({ from, to, count, file }) => ({
    subject: `Calendar, ${shortDate(from)} to ${shortDate(to)}`,
    paragraphs: [`The calendar from ${shortDate(from)} to ${shortDate(to)} holds ${appointments(count)}, booked and cancelled.`, `Attached: ${file}.`],
  }),
  mine: ({ from, to, appointments: lines, file }) => {
    const subject = `Your appointments, ${shortDate(from)} to ${shortDate(to)}`;
    if (lines.length === 0) return { subject, paragraphs: ['You have no appointments in this period.', `Attached: ${file}.`] };
    return {
      subject,
      paragraphs: [`Your appointments from ${shortDate(from)} to ${shortDate(to)}:`, `Attached: ${file}, the same list.`],
      items: lines.map((a) => `${shortDate(a.date)}, ${a.start}–${a.end}, ${a.type}, ${STATUSES[a.status]}`),
    };
  },
  statuses: STATUSES,
  reasons: { cancelled: 'cancelled', changed: 'changed', user_deleted: 'user deleted' },
  headings: {
    date: 'Date',
    start: 'Start',
    end: 'End',
    type: 'Type',
    username: 'Username',
    givenName: 'First name',
    familyName: 'Last name',
    status: 'Status',
    cancelReason: 'Cancelled because',
    note: 'Note',
    bookedAt: 'Booked at',
  },
  sheet: 'Appointments',
  files: {
    calendar: (from, to) => `calendar-${from}-to-${to}.xlsx`,
    mine: (from, to) => `my-appointments-${from}-to-${to}.xlsx`,
    next7Days: (date) => `calendar-next-7-days-${date}.xlsx`,
    backup: (from) => `calendar-backup-from-${from}.xlsx`,
  },
};
