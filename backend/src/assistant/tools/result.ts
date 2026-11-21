import { localDateOf, localTimeOf, type Appointment } from '@shared-calendar/shared';
import type { ToolResult } from './tool';

// What Claude is given of a route's answer (docs/CONVERSATIONAL_ARCHITECTURE.md section 8.3):
// dates and wall-clock times of the calendar's zone, never instants, only the fields an answer to
// the person needs, and never more than a bounded size. The conversions are those of the shared
// time helpers, which know the two nights a year the clocks change.

// The most a result may weigh as JSON text, in UTF-8 bytes (6 KB): a conversation is read whole at
// every step and sent whole to Claude.
export const RESULT_CAP_BYTES = 6000;

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

/**
 * The JSON text of a result, at most RESULT_CAP_BYTES long. A result that is a list and weighs
 * more is cut at a whole item, from the end, and gains a line that tells Claude how many items are
 * missing and to ask for a shorter period. A result without a list is never cut: its tool keeps it
 * small by construction.
 */
export function cappedJson(result: ToolResult): string {
  const { fields, list } = result;
  if (!list) return JSON.stringify(fields);
  const whole = JSON.stringify({ ...fields, [list.name]: list.items });
  if (bytes(whole) <= RESULT_CAP_BYTES) return whole;
  for (let kept = list.items.length - 1; ; kept--) {
    const cut = JSON.stringify({
      ...fields,
      [list.name]: list.items.slice(0, kept),
      cut: `This result was too long: only the first ${kept} of ${list.items.length} ${list.name} are here. Ask again for a shorter period to get the others.`,
    });
    if (bytes(cut) <= RESULT_CAP_BYTES || kept === 0) return cut;
  }
}

/** A date and time of the calendar's zone, "YYYY-MM-DD HH:mm", for an instant. */
export function localDateTime(instant: string, zone: string): string {
  return `${localDateOf(instant, zone)} ${localTimeOf(instant, zone)}`;
}

/**
 * The wall-clock time at which something that started on the local date `date` ends. An end at
 * the midnight that closes that date is "24:00", as the calendar writes the end of a window.
 */
export function localEndTime(end: string, date: string, zone: string): string {
  const time = localTimeOf(end, zone);
  return time === '00:00' && localDateOf(end, zone) > date ? '24:00' : time;
}

/**
 * An appointment as Claude sees it: its id, which a later change will name, its local date and
 * times, the name of its type, whose it is, its note and its status. For a User, also the moment
 * up to which they may cancel or move it. Who created and updated it, and when, stays out.
 */
export function appointmentForModel(appointment: Appointment, zone: string): Record<string, unknown> {
  return {
    id: appointment.appointmentId,
    date: appointment.date,
    start: localTimeOf(appointment.start, zone),
    end: localEndTime(appointment.end, appointment.date, zone),
    type: appointment.typeName,
    username: appointment.username,
    note: appointment.note,
    status: appointment.status,
    ...(appointment.cancellableUntil !== null && { cancellableUntil: localDateTime(appointment.cancellableUntil, zone) }),
  };
}
