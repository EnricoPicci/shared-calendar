import { EXCEL_COLUMNS, localDateOf, localTimeOf, mailTexts, type ExcelColumn, type Language } from '@shared-calendar/shared';
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
const NAME_COLUMNS: readonly ExcelColumn[] = ['givenName', 'familyName'];
// The width of each column in characters, at least that of its heading in the file's language.
const WIDTHS: Record<ExcelColumn, number> = { date: 12, start: 7, end: 7, type: 20, username: 16, givenName: 16, familyName: 16, status: 10, cancelReason: 17, note: 40, bookedAt: 17 };

/**
 * One sheet, named in the file's language: a row of headings, then one row per appointment in the
 * order given (the mailer gives them by start). The headings, the status and the reason of a
 * cancellation are words of the language (docs/MULTILANGUAGE_ARCHITECTURE.md decision L3); the
 * dates and times are not, so that they sort and filter rightly in any Excel
 * (docs/MULTILANGUAGE_ARCHITECTURE.md section 8). Dates and times are local to the calendar's time
 * zone, as on the pages; the booking's column is the creation instant as a local date and time.
 * Every cell is text, so that Excel shows a date and a time as written and changes no note into a
 * number. With `names` the file has the two name columns, empty for an account that no longer
 * exists; without, it has none.
 */
export async function appointmentsFile(language: Language, appointments: readonly ViewAppointment[], timeZone: string, names: NamesBySub | null): Promise<Buffer> {
  const words = mailTexts(language);
  const columns = EXCEL_COLUMNS.filter((column) => names !== null || !NAME_COLUMNS.includes(column));
  const rows: SheetData = [
    columns.map((column) => ({ value: words.headings[column], fontWeight: 'bold' as const })),
    ...appointments.map(({ userId, appointment: a }): Row => {
      const person = names?.get(userId);
      const cells: Record<ExcelColumn, string> = {
        date: a.date,
        start: localTimeOf(a.start, timeZone),
        end: localTimeOf(a.end, timeZone),
        type: a.typeName,
        username: a.username,
        givenName: person?.givenName ?? '',
        familyName: person?.familyName ?? '',
        status: words.statuses[a.status],
        cancelReason: a.cancelReason === null ? '' : words.reasons[a.cancelReason],
        note: a.note ?? '',
        bookedAt: `${localDateOf(a.createdAt, timeZone)} ${localTimeOf(a.createdAt, timeZone)}`,
      };
      return columns.map((column) => cells[column]);
    }),
  ];
  const widths = columns.map((column) => ({ width: Math.max(WIDTHS[column], words.headings[column].length) }));
  return writeXlsxFile(rows, { sheet: words.sheet, columns: widths, stickyRowsCount: 1 }).toBuffer();
}
