import type { Appointment, Role } from '@shared-calendar/shared';
import type { AppointmentTexts, PageTexts } from '../texts/texts';
import { dateTimeText, offsetChangesOn, rangeText } from './texts';

// The appointment detail (docs/FRONTEND_ARCHITECTURE.md section 5): an appointment as the API
// answers it (docs/SHARED_CALENDAR_SPEC.md section 11.5) turned into what the detail dialog
// shows, with which of its three actions are offered (editing the note, "Change", "Cancel
// appointment") and the sentence about them. Pure: the page texts, "now" and the calendar's time
// zone are arguments.

export type AppointmentDetail = {
  appointmentId: string;
  when: string; // "Mon 23 Nov, 10:00–11:00"
  typeName: string;
  who: string; // the User's name for the Administrator, "You" for a User
  note: string; // the note as a text to read: "—" when there is none
  noteValue: string; // the note as the value of a field: empty when there is none
  booked: string; // "Booked by admin on Thu 19 Nov, 13:24"
  canEditNote: boolean;
  canChange: boolean;
  canCancel: boolean;
  hint: string; // what became of it, until when it can be changed or cancelled, or why it cannot; '' when there is nothing to say
};

// What the detail offers, decided at `now`; the server decides again when the call is made.
// - The note can be edited by both roles while the appointment is booked and has not ended: no
//   notice applies (docs/SHARED_CALENDAR_SPEC.md R-NOTE-01).
// - Changing and cancelling are offered together, since a change must pass the rules of a
//   cancellation for the appointment it moves (docs/SHARED_CALENDAR_SPEC.md R-CHG-01). The
//   Administrator may do both until the appointment ends (docs/SHARED_CALENDAR_SPEC.md
//   R-CAN-02). A User may while "now" is not after `cancellableUntil`, the instant the server
//   computed from its settings: exactly at it is still allowed, one millisecond later is not
//   (docs/SHARED_CALENDAR_SPEC.md R-CAN-03).
export function appointmentDetail(texts: PageTexts, appointment: Appointment, role: Role, now: Date, zone: string): AppointmentDetail {
  const admin = role === 'admin';
  const until = appointment.cancellableUntil;
  const active = appointment.status === 'booked' && now.getTime() < Date.parse(appointment.end);
  const canCancel = admin ? active : appointment.status === 'booked' && until !== null && now.getTime() <= Date.parse(until);
  const hint = sentence(texts, appointment, admin, active, canCancel, zone);
  // A User books only for themselves: a booking made in the role User is the reader's own.
  const by = !admin && appointment.createdBy.role === 'user' ? texts.appointment.byYou : appointment.createdBy.username;
  return {
    appointmentId: appointment.appointmentId,
    when: `${texts.dates.shortDate(appointment.date)}, ${rangeText(appointment.start, appointment.end, zone, offsetChangesOn(appointment.date, zone))}`,
    typeName: appointment.typeName,
    who: admin ? appointment.username : texts.appointment.you,
    note: appointment.note ?? texts.appointment.noNote,
    noteValue: appointment.note ?? '',
    booked: texts.appointment.bookedBy(by, dateTimeText(texts.dates, appointment.createdAt, zone)),
    canEditNote: active,
    canChange: canCancel,
    canCancel,
    hint,
  };
}

// The detail's one sentence, by what the appointment is. One that was cancelled says so, and
// one cancelled by a change says that it was moved (docs/SHARED_CALENDAR_SPEC.md decision D19);
// a booked one whose end has passed has ended, for both roles. Of one still to end, a User
// reads until when it can be changed or cancelled, or that it is too late; the Administrator,
// who may do both until the end, reads nothing.
function sentence(texts: PageTexts, appointment: Appointment, admin: boolean, active: boolean, canCancel: boolean, zone: string): string {
  const words: AppointmentTexts = texts.appointment;
  if (appointment.status === 'cancelled') return appointment.cancelReason === 'changed' ? words.moved : words.cancelled;
  if (!active) return words.ended;
  if (admin) return '';
  return canCancel ? words.until(dateTimeText(texts.dates, appointment.cancellableUntil!, zone)) : words.tooLate;
}

// An appointment being moved to another time, as the week's banner and the confirmation name
// it: a copy in words, taken when "Change" was pressed, so that it can be named also from a
// week that does not hold it.
export type Moving = {
  appointmentId: string;
  when: string; // "Mon 23 Nov, 11:00–12:00", the time it is moved from
  what: string; // "Mon 23 Nov, 11:00–12:00 · Studio"; for the Administrator "… · Studio · alice"
  who: string; // the User's name for the Administrator, "You" for a User: whose time the move is
  note: string; // its note, the value the confirmation's field opens with: empty when there is none
};

export function movingOf(detail: AppointmentDetail, role: Role): Moving {
  const what = `${detail.when} · ${detail.typeName}`;
  return {
    appointmentId: detail.appointmentId,
    when: detail.when,
    what: role === 'admin' ? `${what} · ${detail.who}` : what,
    who: detail.who,
    note: detail.noteValue,
  };
}
