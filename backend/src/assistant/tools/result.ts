import { localDateOf, localTimeOf, type Appointment, type AvailabilityType, type CalendarSettings, type OneOffWindow, type WeeklyPattern } from '@shared-calendar/shared';
import { z } from 'zod';
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
      cut: `This result was too long: only the first ${kept} of ${list.items.length} ${list.name} are here. ${list.rest ?? 'Ask again for a shorter period to get the others.'}`,
    });
    if (bytes(cut) <= RESULT_CAP_BYTES || kept === 0) return cut;
  }
}

/** A date and time of the calendar's zone, "YYYY-MM-DD HH:mm", for an instant. */
export function localDateTime(instant: string, zone: string): string {
  return `${localDateOf(instant, zone)} ${localTimeOf(instant, zone)}`;
}

const HOUR_MS = 3_600_000;

/** The instant `hours` after an instant. */
export function hoursAfter(instant: string, hours: number): string {
  return new Date(Date.parse(instant) + hours * HOUR_MS).toISOString();
}

/**
 * Whether an instant is the second of the two moments at which the clock of the zone shows the
 * same time, on the night the clocks go back: an hour earlier the clock showed that time already.
 */
export function isSecondTime(instant: string, zone: string): boolean {
  return localTimeOf(hoursAfter(instant, -1), zone) === localTimeOf(instant, zone);
}

/**
 * The start of a free slot as Claude sees it: its wall-clock time, followed by " (second)" for
 * the second of two slots that start at the same wall-clock time, so that the two can be told
 * apart when one of them is booked.
 */
export function slotTime(start: string, zone: string): string {
  return localTimeOf(start, zone) + (isSecondTime(start, zone) ? ' (second)' : '');
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

/**
 * The settings as Claude sees them: the time zone and the four values the Administrator can
 * change. Who saved them last, and when, is not something an answer needs.
 */
export function settingsForModel(settings: CalendarSettings): Record<string, unknown> {
  return {
    timeZone: settings.timeZone,
    cancellationNoticeHours: settings.cancellationNoticeHours,
    minBookingNoticeHours: settings.minBookingNoticeHours,
    bookingHorizonDays: settings.bookingHorizonDays,
    maxFutureAppointmentsPerUser: settings.maxFutureAppointmentsPerUser,
  };
}

/** An appointment type as Claude sees it: its id, which a later change will name, and its name. */
export const typeForModel = (type: AvailabilityType): Record<string, unknown> => ({ id: type.typeId, name: type.name });

// The weekdays as Claude reads and writes them, Monday first: the calendar counts them from 1.
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * A weekly pattern as Claude sees it after a change to it: its id, its weekday in words, its hours
 * and the two dates it holds between. Its times are wall-clock times already.
 */
export const patternForModel = (pattern: WeeklyPattern): Record<string, unknown> => ({
  id: pattern.patternId,
  weekday: WEEKDAY_NAMES[pattern.weekday - 1],
  start: pattern.start,
  end: pattern.end,
  validFrom: pattern.validFrom,
  validUntil: pattern.validUntil,
});

/** An extra window as Claude sees it once created: its id, which a deletion will name, its date and its hours. */
export const windowForModel = (window: OneOffWindow): Record<string, unknown> => ({ id: window.windowId, date: window.date, start: window.start, end: window.end });

// The appointments a refused change to the opening hours would have left outside them, as the
// route lists them (docs/SHARED_CALENDAR_SPEC.md R-AV-03).
const Conflicts = z.object({ conflicts: z.array(z.object({ appointmentId: z.string(), username: z.string(), start: z.string(), end: z.string() })) });

/**
 * A route's refusal as Claude sees it: the error code and the message, and, when the route listed
 * the appointments in the way of a change to the opening hours, each of them as its id, whose it
 * is, its local date and its wall-clock times. The list is cut like every list. Only the
 * Administrator can cause such a refusal, so only the Administrator's conversation ever holds it.
 */
export function refusalForModel(refusal: { error: string; message: string }, body: unknown, zone: string): ToolResult {
  const listed = Conflicts.safeParse(body);
  if (!listed.success) return { fields: refusal };
  const items = listed.data.conflicts.map(({ appointmentId, username, start, end }) => {
    const date = localDateOf(start, zone);
    return { id: appointmentId, username, date, start: localTimeOf(start, zone), end: localEndTime(end, date, zone) };
  });
  return { fields: refusal, list: { name: 'conflicts', items, rest: 'Use list_appointments to see the others.' } };
}
