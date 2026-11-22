import { localDateOf, localTimeOf, toInstant, type Appointment, type AppointmentSummary, type CalendarView, type ListAppointmentsResponse } from '@shared-calendar/shared';
import { handler as getCalendar } from '../../handlers/getCalendar';
import { handler as listAppointments } from '../../handlers/listAppointments';
import { hoursAfter, localEndTime } from './result';
import { refusalOf, succeeded } from './run';
import type { CallRoute, ToolContext } from './tool';

// The facts the confirmations of the appointment changes read
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 2), shared by the tools that book, cancel,
// move and annotate: the instant a local date and time stand for, the free slot that starts at an
// instant, and the appointment an id stands for. Each is read through the handler of a route that
// only reads, with the identity of the person, so it is what that person may see.

// What could not be read, or what the facts say cannot be done: a code and a sentence for Claude.
export type NotPossible = { ok: false; error: string; message: string };

/**
 * The instant at which the clock of the calendar's zone shows a date and a time. On the night the
 * clocks go forward a time may not exist; on the night they go back a time comes twice, and
 * `occurrence` says which of the two is meant. Neither is guessed: each is an error that tells
 * Claude what to do.
 */
export function instantOf(date: string, time: string, occurrence: 'first' | 'second' | undefined, timeZone: string): { ok: true; start: string; secondTime: boolean } | NotPossible {
  // The first moment the clock of the zone shows this date and time. On the night the clocks go
  // forward a time that does not exist is moved on by the helper: it then reads differently.
  const first = toInstant(date, time, timeZone);
  if (localTimeOf(first, timeZone) !== time || localDateOf(first, timeZone) !== date) {
    return { ok: false, error: 'time_does_not_exist', message: `On ${date} the clocks go forward and the time ${time} does not exist. Use get_calendar to see the free slots of that day.` };
  }
  // On the night the clocks go back the same time comes again an hour later.
  const second = hoursAfter(first, 1);
  const twice = localTimeOf(second, timeZone) === time;
  if (twice && occurrence === undefined) {
    return {
      ok: false,
      error: 'time_comes_twice',
      message: `On ${date} the clocks go back and the time ${time} comes twice. Ask the person which of the two they mean, then give "occurrence": "first" or "second".`,
    };
  }
  if (!twice && occurrence === 'second') {
    return { ok: false, error: 'time_comes_once', message: `On ${date} the time ${time} comes only once. Leave "occurrence" out.` };
  }
  return { ok: true, start: occurrence === 'second' ? second : first, secondTime: occurrence === 'second' };
}

/**
 * The free slot that starts at an instant, as GET /calendar answers the person for that day: its
 * end as a wall-clock time and the name of the type of the hours it lies in. The route gives a
 * person only the slots that person may book, so a time outside the open hours, taken, in the
 * past or, for a User, outside the period open to bookings has no slot.
 */
export async function freeSlotAt(route: CallRoute, date: string, time: string, start: string, timeZone: string): Promise<{ ok: true; end: string; type: string } | NotPossible> {
  const answer = await route(getCalendar, { routeKey: 'GET /calendar', path: '/calendar', query: { from: date, to: date } });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The calendar could not be read.') };
  const day = (answer.body as CalendarView).days.find((candidate) => candidate.date === date);
  const slot = day?.slots.find((candidate) => candidate.start === start);
  const window = day?.windows.find((candidate) => candidate.typeId === slot?.typeId);
  if (!slot || !window) {
    return {
      ok: false,
      error: 'no_free_slot',
      message: `There is no free slot for the person on ${date} at ${time}: the time is outside the open hours, already taken, in the past, or outside the period in which a User may book. Use get_calendar to see the free slots of that day.`,
    };
  }
  return { ok: true, end: localEndTime(slot.end, date, timeZone), type: window.typeName };
}

/**
 * The appointment an id stands for, among those the person may still act on. The calendar has no
 * route that reads one appointment, so the list of GET /calendar/appointments is asked for the
 * appointments that have not ended, cancelled ones included, and the id is looked for in it. A
 * User's list holds their own appointments only: another person's id is not found, as the
 * calendar's routes answer for it (docs/SHARED_CALENDAR_SPEC.md R-PERM-01). An appointment that
 * has ended is not in the list either. A cancelled one is found and refused with the code its
 * routes answer (docs/SHARED_CALENDAR_SPEC.md R-CAN-02).
 */
export async function appointmentById(route: CallRoute, appointmentId: string): Promise<{ ok: true; appointment: Appointment } | NotPossible> {
  const answer = await route(listAppointments, { routeKey: 'GET /calendar/appointments', path: '/calendar/appointments', query: { upcoming: 'true', status: 'all' } });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The appointments could not be read.') };
  const appointment = (answer.body as ListAppointmentsResponse).appointments.find((candidate) => candidate.appointmentId === appointmentId);
  if (!appointment) {
    return {
      ok: false,
      error: 'appointment_not_found',
      message:
        'No appointment with this id is among the appointments the person can still change: it does not exist, it is not theirs, or it has already ended. ' +
        'Never guess an id: use list_appointments to find the appointment the person means.',
    };
  }
  if (appointment.status !== 'booked') {
    return { ok: false, error: 'appointment_not_active', message: 'This appointment is already cancelled: nothing can be changed about it.' };
  }
  return { ok: true, appointment };
}

/**
 * An appointment as a proposal names it: its local date and wall-clock times and the name of its
 * type. Whose it is is said to the Administrator only: a User's proposals are about their own.
 */
export function summaryOf(appointment: Appointment, { timeZone, role }: ToolContext): AppointmentSummary {
  return {
    date: appointment.date,
    start: localTimeOf(appointment.start, timeZone),
    end: localEndTime(appointment.end, appointment.date, timeZone),
    type: appointment.typeName,
    username: role === 'admin' ? appointment.username : null,
  };
}

// What two changes of one answer of Claude must not share: the appointment a change acts on, and
// the slot a change would fill.
export const appointmentSubject = (appointmentId: string) => `appointment ${appointmentId}`;
export const slotSubject = (start: string) => `slot ${start}`;
