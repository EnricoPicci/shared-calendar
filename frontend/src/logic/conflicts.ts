import { localDateOf, type AppointmentConflict } from '@shared-calendar/shared';
import { offsetChangesOn, rangeText } from './texts';
import { PAGE_TEXTS_EN } from '../texts/texts.en';

// The conflicts list (docs/FRONTEND_ARCHITECTURE.md section 5.1): the appointments that a
// change of availability would leave outside it, which the server names when it refuses the
// change (docs/SHARED_CALENDAR_SPEC.md section 6.7), turned into rows ready to draw. Pure. The
// rows hold usernames and times, personal data: they are for the page only, never for a log
// (docs/FRONTEND_SERVICES.md section 17.7).

// A row: the appointment's date and time in the calendar's time zone, and its User.
export type ConflictRow = { date: string; time: string; username: string };

// The sentence above the rows, which says how many appointments are in the way, and the rows.
export type ConflictList = { sentence: string; rows: ConflictRow[] };

// The list to draw, by start and then by username, or null when the failure names no
// appointment: the failure's own sentence then stands alone. On a day whose UTC offset changes
// a time carries its offset, as in the week (docs/SHARED_CALENDAR_SPEC.md section 16.8).
export function conflictList(conflicts: readonly AppointmentConflict[] | undefined, zone: string): ConflictList | null {
  if (conflicts === undefined || conflicts.length === 0) return null;
  const rows = [...conflicts]
    .sort((a, b) => a.start.localeCompare(b.start) || a.username.localeCompare(b.username))
    .map(({ start, end, username }) => {
      const date = localDateOf(start, zone);
      return { date: PAGE_TEXTS_EN.dates.shortDate(date), time: rangeText(start, end, zone, offsetChangesOn(date, zone)), username };
    });
  return { sentence: rows.length === 1 ? '1 appointment is in the way:' : `${rows.length} appointments are in the way:`, rows };
}
