import { localDateOf, localTimeOf, type CancelReason } from '@shared-calendar/shared';
import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/node';
import type { ViewAppointment } from './calendarRules';

// The Excel files the mailer attaches (docs/EMAIL_ARCHITECTURE.md section 6.3). This is the only
// file that imports the Excel library, write-excel-file (`npm run lint` refuses it elsewhere, its
// unit test excepted), so that only the mailer's bundle carries it. A file is made in memory and
// never stored.

/** A person's first and last name, by the `sub` an appointment stores as its `userId`. */
export type NamesBySub = ReadonlyMap<string, { givenName: string; familyName: string }>;

// The name columns are the Administrator's only: a User's file holds their own appointments and
// no name of anybody (docs/EMAIL_ARCHITECTURE.md section 6.3).
const HEADINGS = ['Date', 'Start', 'End', 'Type', 'Username', 'First name', 'Last name', 'Status', 'Cancelled because', 'Note', 'Booked at'];
const NAME_COLUMNS = ['First name', 'Last name'];
const WIDTHS: Record<string, number> = { Date: 12, Start: 7, End: 7, Type: 20, Username: 16, 'First name': 16, 'Last name': 16, Status: 10, 'Cancelled because': 17, Note: 40, 'Booked at': 17 };

// Why a cancelled appointment was cancelled, in the words of the file.
const REASONS: Record<CancelReason, string> = { cancelled: 'cancelled', changed: 'changed', user_deleted: 'user deleted' };

/**
 * One sheet, "Appointments": a row of headings, then one row per appointment in the order given
 * (the mailer gives them by start). Dates and times are local to the calendar's time zone, as on
 * the pages; "Booked at" is the creation instant as a local date and time. Every cell is text, so
 * that Excel shows a date and a time as written and changes no note into a number. With `names`
 * the file has the two name columns, empty for an account that no longer exists; without, it has
 * none.
 */
export async function appointmentsFile(appointments: readonly ViewAppointment[], timeZone: string, names: NamesBySub | null): Promise<Buffer> {
  const headings = HEADINGS.filter((heading) => names !== null || !NAME_COLUMNS.includes(heading));
  const rows: SheetData = [
    headings.map((heading) => ({ value: heading, fontWeight: 'bold' as const })),
    ...appointments.map(({ userId, appointment: a }): Row => {
      const person = names?.get(userId);
      const cells: Record<string, string> = {
        Date: a.date,
        Start: localTimeOf(a.start, timeZone),
        End: localTimeOf(a.end, timeZone),
        Type: a.typeName,
        Username: a.username,
        'First name': person?.givenName ?? '',
        'Last name': person?.familyName ?? '',
        Status: a.status,
        'Cancelled because': a.cancelReason === null ? '' : REASONS[a.cancelReason],
        Note: a.note ?? '',
        'Booked at': `${localDateOf(a.createdAt, timeZone)} ${localTimeOf(a.createdAt, timeZone)}`,
      };
      return headings.map((heading) => cells[heading]);
    }),
  ];
  return writeXlsxFile(rows, { sheet: 'Appointments', columns: headings.map((heading) => ({ width: WIDTHS[heading] })), stickyRowsCount: 1 }).toBuffer();
}
