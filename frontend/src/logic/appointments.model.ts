import { addDays, CALENDAR_LIMITS, localDateOf, type Appointment } from '@shared-calendar/shared';
import { dateText, offsetChangesOn, rangeText } from './texts';

// The list of "My appointments" ready to draw (docs/FRONTEND_ARCHITECTURE.md section 5.1): the
// appointments as the API answers them (docs/SHARED_CALENDAR_SPEC.md section 11.5) turned into
// rows of texts, the period of the history (its default and its own checks) and the sentences
// of the list. Pure: "now" and the calendar's time zone are arguments.

// What an appointment is at "now". "ended" is derived from the clock, never stored
// (docs/SHARED_CALENDAR_SPEC.md section 8.1).
export type AppointmentKind = 'booked' | 'ended' | 'cancelled' | 'changed';

export type AppointmentRow = {
  appointmentId: string;
  date: string; // "Mon 23 Nov"
  time: string; // "10:00–11:00"; with the offsets on a day the clocks change
  typeName: string;
  note: string; // empty when there is none
  kind: AppointmentKind;
  status: string; // the kind in words
};

const STATUS_IN_WORDS: Record<AppointmentKind, string> = { booked: 'Booked', ended: 'Ended', cancelled: 'Cancelled', changed: 'Changed' };

// A cancelled appointment says why only when it was moved to another time: an explicit
// cancellation and the deletion of its User are both "cancelled"
// (docs/SHARED_CALENDAR_SPEC.md decision D19). A booked one has ended when its end is not after
// "now".
function kindOf(appointment: Appointment, now: Date): AppointmentKind {
  if (appointment.status === 'cancelled') return appointment.cancelReason === 'changed' ? 'changed' : 'cancelled';
  return Date.parse(appointment.end) <= now.getTime() ? 'ended' : 'booked';
}

// One row per appointment, in the order given, which is the server's: by start.
export function appointmentRows(appointments: readonly Appointment[], now: Date, zone: string): AppointmentRow[] {
  return appointments.map((appointment) => {
    const kind = kindOf(appointment, now);
    return {
      appointmentId: appointment.appointmentId,
      date: dateText(appointment.date),
      time: rangeText(appointment.start, appointment.end, zone, offsetChangesOn(appointment.date, zone)),
      typeName: appointment.typeName,
      note: appointment.note ?? '',
      kind,
      status: STATUS_IN_WORDS[kind],
    };
  });
}

// The two lists of the screen: the appointments still to come, and all of those of a period,
// whatever became of them (docs/SHARED_CALENDAR_SPEC.md R-VIEW-01).
export type Mode = 'upcoming' | 'history';

export function emptyText(mode: Mode): string {
  return mode === 'upcoming' ? 'You have no upcoming appointments.' : 'There are no appointments in this period.';
}

// The period of the history: two local dates, both included.
export type Period = { from: string; to: string };

// How many days a period holds before the history opens on another one: these, ending today.
const DEFAULT_PERIOD_DAYS = 30;

// The period the history opens on: the 30 days that end today, today in the calendar's zone.
export function defaultPeriod(now: Date, zone: string): Period {
  const to = localDateOf(now.toISOString(), zone);
  return { from: addDays(to, 1 - DEFAULT_PERIOD_DAYS), to };
}

// Why a period typed in the form is not asked for, in plain words, or null when it can be: a
// date missing (an empty field), the first date after the last, or more days than one list may
// hold (docs/SHARED_CALENDAR_SPEC.md section 11.2). Whatever else is wrong with a date is the
// service's and the server's to say.
export function periodRefusal(from: string, to: string): string | null {
  if (from === '' || to === '') return 'Choose both dates.';
  if (from > to) return 'The first date is after the last one.';
  const days = CALENDAR_LIMITS.appointmentListDays;
  if (to > addDays(from, days - 1)) return `A period can be at most ${days} days long. Choose a shorter one.`;
  return null;
}
