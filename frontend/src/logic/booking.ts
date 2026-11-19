import { localDateOf, localTimeOf, toInstant, type BookBody, type ChangeBody, type Role } from '@shared-calendar/shared';
import type { ListUsersState } from '../services/users.types';
import { failureText } from './texts';
import type { SlotBlock } from './week.model';

// The book dialog's logic (docs/FRONTEND_ARCHITECTURE.md section 5): what is being booked in
// words, the times and the Users the Administrator may choose, and the way from what the dialog
// holds to the argument of AppointmentsService.book or, when the dialog confirms the move of an
// appointment, of AppointmentsService.change. Pure. Whether a booking or a change is allowed is
// the server's to say (docs/FRONTEND_SERVICES.md section 8, decision 42): nothing is checked
// here.

const DAY_MINUTES = 24 * 60;
const GRID = 15; // the Administrator's times are on 15-minute steps (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02)

// "Mon 23 Nov, 10:00–11:00 · Studio": the slot's day, time and type.
export function bookingText(slot: SlotBlock): string {
  return `${slot.day}, ${slot.time} · ${slot.typeName}`;
}

// The local times, `HH:mm`, the Administrator may choose from, and the two that are chosen when
// the dialog opens: the slot's own.
export type TimeChoice = { starts: string[]; ends: string[]; start: string; end: string };

// Minutes on the clock of the slot's day at `instant`; midnight at the end of the day is 24:00.
function minuteOf(instant: string, date: string, zone: string): number {
  if (localDateOf(instant, zone) > date) return DAY_MINUTES;
  const time = localTimeOf(instant, zone);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// Every 15-minute step on the clock from the start to the end of the window that holds the
// slot: a start may be any but the last, an end any but the first. A window 08:30–12:00 gives
// the starts 08:30 … 11:45 and the ends 08:45 … 12:00.
export function timeChoice(slot: SlotBlock, zone: string): TimeChoice {
  const date = localDateOf(slot.start, zone);
  const from = minuteOf(slot.window.start, date, zone);
  const to = minuteOf(slot.window.end, date, zone);
  const steps = Array.from({ length: Math.max(0, (to - from) / GRID) + 1 }, (_, i) => clock(from + i * GRID));
  return {
    starts: steps.slice(0, -1),
    ends: steps.slice(1),
    start: clock(minuteOf(slot.start, date, zone)),
    end: clock(minuteOf(slot.end, date, zone)),
  };
}

// The Users the Administrator may book for, from the state of UsersService.listUsers: the names
// for the picker, what to say beside it, and whether a User can be chosen yet.
export type UserChoice = { usernames: string[]; message: string; ready: boolean };

export function userChoice(state: ListUsersState): UserChoice {
  if (state.status === 'pending') return { usernames: [], message: 'Loading the users…', ready: false };
  if (state.status === 'failure') return { usernames: [], message: failureText(state.reason), ready: false };
  if (state.status === 'idle') return { usernames: [], message: '', ready: false };
  const usernames = state.users.map((user) => user.username);
  if (usernames.length === 0) return { usernames, message: 'There is no User to book for.', ready: false };
  return { usernames, message: '', ready: true };
}

// What the dialog's form holds. For a User only the note counts.
export type BookingFields = { note: string; username: string; start: string; end: string };

// The times of a booking or of a change. A User sends the slot's start and nothing else about
// the time (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02). The Administrator sends both instants: the
// slot's own while the two times are the ones the dialog opened with, which names the slot
// without ambiguity also in the hour repeated when the clocks go back; otherwise the two chosen
// times on the slot's day, where a time in the repeated hour is its earlier occurrence
// (docs/SHARED_CALENDAR_SPEC.md R-TIME-03).
function timesFor(slot: SlotBlock, zone: string, role: Role, fields: Pick<BookingFields, 'start' | 'end'>): { start: string; end?: string } {
  if (role !== 'admin') return { start: slot.start };
  const own = timeChoice(slot, zone);
  if (fields.start === own.start && fields.end === own.end) return { start: slot.start, end: slot.end };
  const date = localDateOf(slot.start, zone);
  return { start: toInstant(date, fields.start, zone), end: toInstant(date, fields.end, zone) };
}

// The argument of AppointmentsService.book. A blank note is left out. A User sends nothing
// about the person; the Administrator sends the User chosen
// (docs/SHARED_CALENDAR_SPEC.md R-BOOK-01).
export function bookingFor(slot: SlotBlock, zone: string, role: Role, fields: BookingFields): BookBody {
  const note = fields.note.trim();
  const noted = note === '' ? {} : { note };
  const times = timesFor(slot, zone, role, fields);
  return role === 'admin' ? { ...times, username: fields.username, ...noted } : { ...times, ...noted };
}

// The argument of AppointmentsService.change, when the dialog confirms the move of an
// appointment to `slot`. Never a User: the new appointment is for the User of the old one
// (docs/SHARED_CALENDAR_SPEC.md section 8.4). The note is always sent, as the field holds it:
// the field opens with the old appointment's note, so left alone it stays, edited it changes,
// and emptied it is cleared, since the shared schema makes a blank note `null`
// (docs/SHARED_CALENDAR_SPEC.md R-CHG-03).
export function changeFor(slot: SlotBlock, zone: string, role: Role, fields: Pick<BookingFields, 'note' | 'start' | 'end'>): ChangeBody {
  return { ...timesFor(slot, zone, role, fields), note: fields.note };
}
