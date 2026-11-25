import {
  lastsWholeHours,
  LocalEndTime,
  overlaps,
  peopleIn,
  LocalTime,
  localDateOf,
  localTimeOf,
  TIME_STEP_MINUTES,
  toInstant,
  Ulid,
  type Appointment,
  type AppointmentSummary,
  type AvailabilityType,
  type CalendarDay,
  type CalendarSettings,
  type CalendarView,
  type HoursSummary,
  type ListAppointmentsResponse,
  type ListPatternsResponse,
  type ListTypesResponse,
  type ListUsersResponse,
  type OverCapacity,
  type PatternSummary,
  type WeeklyPattern,
  type WindowSource,
} from '@shared-calendar/shared';
import { z } from 'zod';
import { handler as getCalendar } from '../../handlers/getCalendar';
import { handler as getSettings } from '../../handlers/getCalendarSettings';
import { handler as listAppointments } from '../../handlers/listAppointments';
import { handler as listTypes } from '../../handlers/listAvailabilityTypes';
import { handler as listPatterns } from '../../handlers/listPatterns';
import { handler as listUsers } from '../../handlers/listUsers';
import { hoursAfter, localEndTime } from './result';
import { refusalOf, succeeded } from './run';
import type { CallRoute, ToolContext } from './tool';

// The facts the confirmations of the changes read (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5, rule 2), shared by the tools: the instant a local date and time stand for, the free slot
// that starts at an instant, the appointment an id stands for, the User a username names, the
// settings as they are, the appointment types, the weekly patterns and one day's hours with where
// they come from. Each is read through the handler of a route that only reads, with the identity
// of the person, so it is what that person may see.

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

// The Administrator's input of a booking and of a move that goes over the capacity of a full time
// (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13). A User's input has no such field.
export const OVERBOOK = z
  .boolean()
  .optional()
  .describe(
    'Only when the person asked to go over the capacity of a time that is full: true books it all the same. Set it only when the person asked for it, never on your own; leave it out otherwise.',
  );

// What a booking or a move asks of the slot it goes to, besides its start. `overbook` is the
// Administrator's request to go over the capacity (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13).
// `username` is the User the appointment is for, given for the Administrator only, whose view
// holds every appointment; `leaveOut` is the appointment a move takes away, left out of the
// counting as the route leaves it out (docs/SHARED_CALENDAR_SPEC.md R-CHG-01).
export type SlotAsked = { overbook: boolean; username: string | null; leaveOut: string | null };
const PLAIN_ASK: SlotAsked = { overbook: false, username: null, leaveOut: null };

// The slot a change goes to, as the proposal shows it: its end, the name of its type, the places
// it had left when it was read, and, for a booking over the capacity, the people it will hold.
export type SlotFound = { ok: true; end: string; type: string; placesLeft: number; over: OverCapacity | null };

/**
 * The slot that starts at an instant, as GET /calendar answers the person for that day: its end
 * as a wall-clock time, the name of the type of the hours it lies in, and its places left. The
 * route gives a person only the slots that person may book, so a time outside the open hours, full,
 * in the past or, for a User, outside the period open to bookings or over one of the User's own
 * appointments has no slot. The Administrator also gets the full slots
 * (docs/SHARED_CALENDAR_SPEC.md decision D30), with no place left: one is refused unless the
 * Administrator asked to go over the capacity, and then the proposal says how many people the time
 * will hold, counted at their peak with the appointments of that day
 * (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02), plus the one booked. Before the places, as the route
 * checks them, one person holds one place at a time (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12): when
 * the Administrator books for a User, or moves a User's appointment, an active appointment of that
 * User over the time is refused with the route's code.
 */
export async function freeSlotAt(route: CallRoute, date: string, time: string, start: string, timeZone: string, asked: SlotAsked = PLAIN_ASK): Promise<SlotFound | NotPossible> {
  const answer = await route(getCalendar, { routeKey: 'GET /calendar', path: '/calendar', query: { from: date, to: date } });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The calendar could not be read.') };
  const view = answer.body as CalendarView;
  const day = view.days.find((candidate) => candidate.date === date);
  const slot = day?.slots.find((candidate) => candidate.start === start);
  const window = day?.windows.find((candidate) => candidate.typeId === slot?.typeId);
  if (!slot || !window) {
    return {
      ok: false,
      error: 'no_free_slot',
      message: `There is no free slot for the person on ${date} at ${time}: the time is outside the open hours, full, in the past, or outside the period in which a User may book. Use get_calendar to see the free slots of that day.`,
    };
  }
  // The active appointments of the day that count in the slot: the one a move takes away is not
  // among them.
  const present = view.appointments.filter((appointment) => appointment.status === 'booked' && appointment.appointmentId !== asked.leaveOut);
  const busy = present.filter((appointment) => appointment.username === asked.username && overlaps(appointment, slot)).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  if (busy) {
    const from = localTimeOf(busy.start, timeZone);
    const to = localEndTime(busy.end, busy.date, timeZone);
    return {
      ok: false,
      error: 'user_busy',
      message:
        `${busy.username} already has an appointment at this time: on ${busy.date} from ${from} to ${to} (${busy.typeName}). ` +
        'A person holds one place at a time, also over the capacity. To move that appointment instead, use change_appointment on it.',
    };
  }
  // The route counted a moved appointment that lies over the slot: without it, the places are
  // counted again from the day's appointments.
  const movedHere = view.appointments.some((appointment) => appointment.appointmentId === asked.leaveOut && appointment.status === 'booked' && overlaps(appointment, slot));
  const people = peopleIn(slot, present);
  const placesLeft = movedHere ? Math.max(0, slot.capacity - people) : slot.placesLeft;
  if (placesLeft === 0 && !asked.overbook) {
    return {
      ok: false,
      error: 'no_free_slot',
      message:
        `The time on ${date} at ${time} is full: its ${slot.capacity} ${slot.capacity === 1 ? 'place is' : 'places are'} taken. ` +
        'It can be booked over the capacity if the person asks for it: only then give "overbook": true. Otherwise use get_calendar to see the free slots of that day.',
    };
  }
  return { ok: true, end: localEndTime(slot.end, date, timeZone), type: window.typeName, placesLeft, over: placesLeft === 0 ? { people: people + 1, capacity: slot.capacity } : null };
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

/**
 * Whether a username names a User the Administrator can book for, as GET /users answers: the
 * accounts that are Users and not administrators. A name that is not in that list is not found,
 * whatever the reason: no such account, an administrator's account, or an account in no group. The
 * list cannot tell the three apart and the answer does not either, so an administrator's username
 * is never confirmed. Only the Administrator can ask: the route refuses a User.
 */
export async function plainUser(route: CallRoute, username: string): Promise<{ ok: true } | NotPossible> {
  const answer = await route(listUsers, { routeKey: 'GET /users', path: '/users' });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The users could not be read.') };
  if (!(answer.body as ListUsersResponse).users.some((user) => user.username === username)) {
    return { ok: false, error: 'user_not_found', message: `There is no User with the username "${username}". Use list_users to see the Users an appointment can be booked for, and ask the person which one they mean.` };
  }
  return { ok: true };
}

/** The settings as they are, as GET /calendar/settings answers. */
export async function presentSettings(route: CallRoute): Promise<{ ok: true; settings: CalendarSettings } | NotPossible> {
  const answer = await route(getSettings, { routeKey: 'GET /calendar/settings', path: '/calendar/settings' });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The settings could not be read.') };
  return { ok: true, settings: answer.body as CalendarSettings };
}

/** The appointment types, as GET /calendar/types answers. */
export async function presentTypes(route: CallRoute): Promise<{ ok: true; types: AvailabilityType[] } | NotPossible> {
  const answer = await route(listTypes, { routeKey: 'GET /calendar/types', path: '/calendar/types' });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The appointment types could not be read.') };
  return { ok: true, types: (answer.body as ListTypesResponse).types };
}

/** The type an id stands for among the types read, or the refusal the types' routes answer. */
export function typeById(types: AvailabilityType[], typeId: string): { ok: true; type: AvailabilityType } | NotPossible {
  const type = types.find((candidate) => candidate.typeId === typeId);
  if (!type) {
    return { ok: false, error: 'type_not_found', message: 'There is no appointment type with this id. Never guess an id: use list_types to find the type the person means.' };
  }
  return { ok: true, type };
}

/**
 * What two type names are compared by: trimmed, in lower case. Two names that differ only in
 * their capitals are one name to the calendar (docs/ARCHITECTURE.md section 4, `AvailabilityType`).
 */
export const typeNameKey = (name: string): string => name.trim().toLowerCase();

/** The refusal for a name another type has. */
export const nameTaken = (name: string): NotPossible => ({
  ok: false,
  error: 'type_name_exists',
  message: `An appointment type with the name "${name}" already exists; names that differ only in their capitals count as the same. Tell the person, and ask for another name.`,
});

// The hours of a window as the tools that change the opening hours take them from Claude: two
// wall-clock times on the step of TIME_STEP_MINUTES and the id of an appointment type
// (docs/SHARED_CALENDAR_SPEC.md section 11.4, decision D32). The words give Claude the step with
// its first and last minute; the pattern of LocalTime holds every minute allowed. That the hours
// last a whole number of hours (docs/SHARED_CALENDAR_SPEC.md decision D33) is no pattern of one
// field: the description of `end` says it in words, and `WHOLE_HOURS` below refuses the rest.
// "minutes 00, 05, 10 and so on up to 55": the first three minutes of the step and the last.
const minuteSaid = (step: number) => String(step * TIME_STEP_MINUTES).padStart(2, '0');
const STEP_MINUTES_SAID = `minutes ${[0, 1, 2].map(minuteSaid).join(', ')} and so on up to ${minuteSaid(60 / TIME_STEP_MINUTES - 1)}`;

export const hoursInput = {
  start: LocalTime.describe(`When the hours start: a wall-clock time as HH:mm, on a ${TIME_STEP_MINUTES}-minute step (${STEP_MINUTES_SAID}).`),
  end: LocalEndTime.describe(
    'When the hours end, as HH:mm: a whole number of hours after "start", so with the same minutes as "start" (09:05 to 11:05), or "24:00" for the midnight that closes the day when "start" is on the hour.',
  ),
  typeId: Ulid.describe('The id of the appointment type of these hours, as list_types gave it. Never its name, and never a guess.'),
};

// The hours must end after they start. Times written HH:mm compare as text, and "24:00" comes last.
export const endsAfterStart = (hours: { start: string; end: string }): boolean => hours.start < hours.end;
export const END_AFTER_START = { message: 'end must be after start', path: ['end'] };

// The hours last a whole number of hours on the local clock (docs/SHARED_CALENDAR_SPEC.md decision
// D33), with the sentence of the shared window schemas, so that Claude reads it at the proposal and
// not at the person's confirmation. It runs only when nothing before it failed (`when`), so an end
// not after the start is said once, by the order check.
export const lastsWholeHoursOf = (hours: { start: string; end: string }): boolean => lastsWholeHours(hours.start, hours.end);
export const WHOLE_HOURS = {
  message: 'end must be a whole number of hours after start',
  path: ['end'],
  when: (payload: { issues: readonly unknown[] }) => payload.issues.length === 0,
};

/** The weekly patterns, as GET /calendar/patterns answers the Administrator. */
export async function presentPatterns(route: CallRoute): Promise<{ ok: true; patterns: WeeklyPattern[] } | NotPossible> {
  const answer = await route(listPatterns, { routeKey: 'GET /calendar/patterns', path: '/calendar/patterns' });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The weekly patterns could not be read.') };
  return { ok: true, patterns: (answer.body as ListPatternsResponse).patterns };
}

/** The pattern an id stands for among the patterns read, or the refusal the patterns' routes answer. */
export function patternById(patterns: WeeklyPattern[], patternId: string): { ok: true; pattern: WeeklyPattern } | NotPossible {
  const pattern = patterns.find((candidate) => candidate.patternId === patternId);
  if (!pattern) {
    return { ok: false, error: 'pattern_not_found', message: 'There is no weekly pattern with this id. Never guess an id: use list_patterns to find the pattern the person means.' };
  }
  return { ok: true, pattern };
}

/**
 * Some hours as a proposal names them: the two times as given and the name of the type the id
 * stands for among the types read. A type that is not there is the refusal its routes answer.
 */
export function hoursOf<Hours extends { start: string; end: string; typeId: string }>(hours: Hours, types: AvailabilityType[]): { ok: true; hours: HoursSummary } | NotPossible {
  const found = typeById(types, hours.typeId);
  if (!found.ok) return found;
  return { ok: true, hours: { start: hours.start, end: hours.end, type: found.type.name } };
}

/** A weekly pattern as a proposal names it, with the name of its type among the types read. */
export function patternSummaryOf(
  pattern: { weekday: number; start: string; end: string; typeId: string; validFrom: string; validUntil: string | null },
  types: AvailabilityType[],
): { ok: true; summary: PatternSummary } | NotPossible {
  const named = hoursOf(pattern, types);
  if (!named.ok) return named;
  return { ok: true, summary: { ...named.hours, weekday: pattern.weekday, validFrom: pattern.validFrom, validUntil: pattern.validUntil } };
}

// A window of a day as the confirmations compare and name it: wall-clock times, the id and the
// name of its type, where it comes from, and the id of its source (of an extra window, its own).
export type DayWindow = HoursSummary & { typeId: string; source: WindowSource | undefined; sourceId: string | undefined };

/**
 * One date as GET /calendar answers the Administrator for it: whether it has hours of its own, and
 * its windows in wall-clock times, each with where it comes from. A date before today is the
 * refusal the routes that change a date's hours answer (docs/SHARED_CALENDAR_SPEC.md R-AV-02):
 * "today" is the local date of the moment the route built its answer at.
 */
export async function presentDay(route: CallRoute, date: string, timeZone: string): Promise<{ ok: true; hasOverride: boolean; windows: DayWindow[] } | NotPossible> {
  const answer = await route(getCalendar, { routeKey: 'GET /calendar', path: '/calendar', query: { from: date, to: date } });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The calendar could not be read.') };
  const view = answer.body as CalendarView;
  if (date < localDateOf(view.generatedAt, timeZone)) {
    return { ok: false, error: 'date_in_past', message: `${date} is in the past: the opening hours of a day that has passed cannot be changed.` };
  }
  const day: CalendarDay | undefined = view.days.find((candidate) => candidate.date === date);
  const windows = (day?.windows ?? []).map((window) => ({
    start: localTimeOf(window.start, timeZone),
    end: localEndTime(window.end, date, timeZone),
    type: window.typeName,
    typeId: window.typeId,
    source: window.source,
    sourceId: window.sourceId,
  }));
  return { ok: true, hasOverride: day?.hasOverride === true, windows };
}

/** A window of a day as a proposal names it: its hours and the name of its type. */
export const namedHours = ({ start, end, type }: HoursSummary): HoursSummary => ({ start, end, type });

// What two changes of one answer of Claude must not share: the appointment a change acts on, the
// settings, a type, the name a type would get, a weekly pattern, the
// hours a date has of its own, and an extra window. A pattern or an extra window still to be
// created is the weekday or the date with the hours it would open, and for a pattern its two
// dates: two that share all of it are one asked for twice.
export const appointmentSubject = (appointmentId: string) => `appointment ${appointmentId}`;
export const SETTINGS_SUBJECT = 'settings';
export const typeSubject = (typeId: string) => `type ${typeId}`;
export const typeNameSubject = (name: string) => `type name ${typeNameKey(name)}`;
export const patternSubject = (patternId: string) => `pattern ${patternId}`;
export const newPatternSubject = (pattern: { weekday: number; start: string; end: string; validFrom: string; validUntil: string | null }) =>
  `new pattern ${pattern.weekday} ${pattern.start}-${pattern.end} ${pattern.validFrom} ${pattern.validUntil ?? ''}`;
export const overrideSubject = (date: string) => `override ${date}`;
export const windowSubject = (windowId: string) => `window ${windowId}`;
export const newWindowSubject = (window: { date: string; start: string; end: string }) => `new window ${window.date} ${window.start}-${window.end}`;


// The slot a booking or a move takes a place in, as the exchange counts the places
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 4).
export const slotKey = (start: string) => `slot ${start}`;
