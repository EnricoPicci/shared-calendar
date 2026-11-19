import type { Appointment, Role } from '@shared-calendar/shared';
import { dateText, dateTimeText, offsetChangesOn, rangeText } from './texts';

// The appointment detail (docs/FRONTEND_ARCHITECTURE.md section 5): an appointment as the API
// answers it (docs/SHARED_CALENDAR_SPEC.md section 11.5) turned into what the detail dialog
// shows, with whether "Cancel appointment" is offered and the sentence under it. Pure: "now" and
// the calendar's time zone are arguments.

export type AppointmentDetail = {
  appointmentId: string;
  when: string; // "Mon 23 Nov, 10:00–11:00"
  typeName: string;
  who: string; // the User's name for the Administrator, "You" for a User
  note: string; // "—" when there is none
  booked: string; // "Booked by admin on Thu 19 Nov, 13:24"
  canCancel: boolean;
  hint: string; // until when it can be cancelled, or why it cannot; '' when there is nothing to say
};

// Whether cancelling is offered. The Administrator may cancel until the appointment ends
// (docs/SHARED_CALENDAR_SPEC.md R-CAN-02). A User may cancel while "now" is not after
// `cancellableUntil`, the instant the server computed from its settings: exactly at it is still
// allowed, one millisecond later is not (docs/SHARED_CALENDAR_SPEC.md R-CAN-03). The server
// decides again when the call is made.
export function appointmentDetail(appointment: Appointment, role: Role, now: Date, zone: string): AppointmentDetail {
  const admin = role === 'admin';
  const until = appointment.cancellableUntil;
  const canCancel =
    appointment.status === 'booked' &&
    (admin ? now.getTime() < Date.parse(appointment.end) : until !== null && now.getTime() <= Date.parse(until));
  const hint = admin
    ? canCancel
      ? ''
      : 'This appointment has ended.'
    : canCancel
      ? `It can be cancelled until ${dateTimeText(until!, zone)}.`
      : 'It is too late to cancel this appointment.';
  // A User books only for themselves: a booking made in the role User is the reader's own.
  const by = !admin && appointment.createdBy.role === 'user' ? 'you' : appointment.createdBy.username;
  return {
    appointmentId: appointment.appointmentId,
    when: `${dateText(appointment.date)}, ${rangeText(appointment.start, appointment.end, zone, offsetChangesOn(appointment.date, zone))}`,
    typeName: appointment.typeName,
    who: admin ? appointment.username : 'You',
    note: appointment.note ?? '—',
    booked: `Booked by ${by} on ${dateTimeText(appointment.createdAt, zone)}`,
    canCancel,
    hint,
  };
}
