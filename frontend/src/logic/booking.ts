import { localDateOf, localTimeOf, toInstant, type Appointment, type BookBody, type ChangeBody, type Role } from '@shared-calendar/shared';
import type { ListUsersState } from '../services/users.types';
import type { Moving } from './appointment.detail';
import { failureText, offsetChangesOn, rangeText } from './texts';
import { clockOf, DAY_MINUTES, minuteOfClock, windowHours, type TimeHours } from './times';
import type { SlotBlock } from './week.model';

// The book dialog's logic (docs/FRONTEND_ARCHITECTURE.md section 5): what is being booked in
// words, the times and the Users the Administrator may choose, and the way from what the dialog
// holds to the argument of AppointmentsService.book or, when the dialog confirms the move of an
// appointment, of AppointmentsService.change, and what the dialog says when the server refuses
// one. Pure. Whether a booking or a change is allowed is the server's to say
// (docs/FRONTEND_SERVICES.md section 8, decision 42): nothing is checked here.

// "Mon 23 Nov, 10:00–11:00 · Studio": the slot's day, time and type.
export function bookingText(slot: SlotBlock): string {
  return `${slot.day}, ${slot.time} · ${slot.typeName}`;
}

// What the Administrator's two times offer: the hours of a start and of an end (each hour with
// the minutes of src/logic/times.ts), the two times chosen when the dialog opens, which are the
// slot's own, and `last`, the end of the window that holds the slot, which a chosen start never
// pushes the end past (docs/SHARED_CALENDAR_SPEC.md R-BOOK-08).
export type TimeChoice = TimeHours & { start: string; end: string; last: string };

// Minutes on the clock of the slot's day at `instant`; midnight at the end of the day is 24:00.
function minuteOf(instant: string, date: string, zone: string): number {
  if (localDateOf(instant, zone) > date) return DAY_MINUTES;
  return minuteOfClock(localTimeOf(instant, zone));
}

// The hours the window that holds the slot touches (windowHours of src/logic/times.ts): a
// window 08:05–12:00 gives the starts 08 to 11 and the ends 08 to 12.
export function timeChoice(slot: SlotBlock, zone: string): TimeChoice {
  const date = localDateOf(slot.start, zone);
  const from = minuteOf(slot.window.start, date, zone);
  const to = minuteOf(slot.window.end, date, zone);
  return {
    ...windowHours(from, to),
    start: clockOf(minuteOf(slot.start, date, zone)),
    end: clockOf(minuteOf(slot.end, date, zone)),
    last: clockOf(to),
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
// (docs/SHARED_CALENDAR_SPEC.md R-BOOK-01). `overbook` is the Administrator's "Book anyway",
// sent only when true (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13).
export function bookingFor(slot: SlotBlock, zone: string, role: Role, fields: BookingFields, overbook = false): BookBody {
  const note = fields.note.trim();
  const noted = note === '' ? {} : { note };
  const times = timesFor(slot, zone, role, fields);
  const forced = overbook ? { overbook } : {};
  return role === 'admin' ? { ...times, username: fields.username, ...noted, ...forced } : { ...times, ...noted, ...forced };
}

// The argument of AppointmentsService.change, when the dialog confirms the move of an
// appointment to `slot`. Never a User: the new appointment is for the User of the old one
// (docs/SHARED_CALENDAR_SPEC.md section 8.4). The note is always sent, as the field holds it:
// the field opens with the old appointment's note, so left alone it stays, edited it changes,
// and emptied it is cleared, since the shared schema makes a blank note `null`
// (docs/SHARED_CALENDAR_SPEC.md R-CHG-03). `overbook` is the Administrator's "Change anyway".
export function changeFor(slot: SlotBlock, zone: string, role: Role, fields: Pick<BookingFields, 'note' | 'start' | 'end'>, overbook = false): ChangeBody {
  return { ...timesFor(slot, zone, role, fields), note: fields.note, ...(overbook ? { overbook } : {}) };
}

// What the book dialog asked, kept from its "Book" or "Change" until its answer: the slot, the
// calendar's time zone, the fields as they were sent, and the appointment being moved, or null.
export type Asked = { slot: SlotBlock; zone: string; fields: BookingFields; moving: Moving | null };

// What the dialog says when the server refuses: the sentence, and whether "Book anyway" (or
// "Change anyway") is offered under it.
export type Refusal = { text: string; offer: boolean };

// The Administrator's refusal for a time that is full, which "Book anyway, over the capacity?"
// follows in the page: the week is read again, but the time is still the one to book.
export const FULL_FOR_ADMIN = 'This time is full: there is no place left.';

// The interval asked for: the two instants the Administrator sent, or a User's slot, whose end
// the server takes as the slot's (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02).
function intervalOf({ slot, zone, fields }: Asked, role: Role): { start: string; end: string } {
  const times = timesFor(slot, zone, role, fields);
  return { start: times.start, end: times.end ?? slot.end };
}

// The appointment that a refusal `user_busy` met (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12), found
// among `appointments`, those of the week on show: one of the target User's that overlaps the
// time asked, the earliest if several do; null when the week shows none. On a change the
// appointment being moved is left out, as the server leaves it out
// (docs/SHARED_CALENDAR_SPEC.md R-CHG-01). The target User is the one chosen in the dialog, or
// the moved appointment's; a User's week holds the User's own appointments only.
export function inTheWay(appointments: readonly Appointment[], role: Role, asked: Asked): Appointment | null {
  const { start, end } = intervalOf(asked, role);
  const who = asked.moving?.who ?? asked.fields.username;
  const found = appointments
    .filter((a) => a.appointmentId !== asked.moving?.appointmentId && (role !== 'admin' || a.username === who))
    .filter((a) => Date.parse(a.start) < Date.parse(end) && Date.parse(start) < Date.parse(a.end))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return found[0] ?? null;
}

// What the dialog says about a refused booking or change.
// - `slot_taken` for the Administrator: the time is full, and the same request may be sent
//   again over the capacity (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13). A User's is the sentence
//   of every page, with the week read again.
// - `user_busy` names the appointment in the way, its time and its type, when the week on show
//   holds it; the person opens it and changes it. Nothing is offered: the force does not lift
//   the rule (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12).
// - Everything else is failureText's, with what was attempted and who attempted it.
export function refusalOf(reason: string, asked: Asked, role: Role, appointments: readonly Appointment[]): Refusal {
  if (reason === 'slot_taken' && role === 'admin') return { text: FULL_FOR_ADMIN, offer: true };
  const found = reason === 'user_busy' ? inTheWay(appointments, role, asked) : null;
  if (found !== null) {
    const what = `${rangeText(found.start, found.end, asked.zone, offsetChangesOn(found.date, asked.zone))} · ${found.typeName}`;
    const text =
      role === 'admin'
        ? `${found.username} already has an appointment at this time (${what}).`
        : `You already have an appointment at this time (${what}); open it to change it.`;
    return { text, offer: false };
  }
  return { text: failureText(reason, asked.moving === null ? undefined : 'change', role), offer: false };
}
