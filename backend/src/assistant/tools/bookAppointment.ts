import { LocalDate, LocalTime, localDateOf, localTimeOf, Note, toInstant, type Appointment, type BookingSummary, type CalendarView } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler as getCalendar } from '../../handlers/getCalendar';
import { appointmentForModel, hoursAfter, localEndTime } from './result';
import { refusalOf, succeeded } from './run';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/appointments (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): a User
// books an appointment for themself. It is a change: asked for by Claude it is never run, it
// becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This
// file holds what building the proposal needs and reads the calendar through the handler of
// GET /calendar; the handler of the booking route is not imported here, so the functions that
// build a proposal do not carry it.
//
// Offered to Users only: the route asks the Administrator for the username of the User the
// appointment is for, which this tool's input does not have.

const Input = z
  .object({
    date: LocalDate.describe("The day of the appointment, a date of the calendar's time zone as YYYY-MM-DD."),
    time: LocalTime.describe(
      'The time the appointment starts, a wall-clock time of the calendar\'s time zone as HH:mm (24-hour clock). It must be one of the "freeSlots" get_calendar gives for that day.',
    ),
    occurrence: z
      .enum(['first', 'second'])
      .optional()
      .describe(
        'Only on the one night a year when the clocks go back and the same time comes twice: which of the two is meant. ' +
          'Give "second" for the free slot get_calendar writes with " (second)" after its time, "first" for the other. Leave it out on every other day.',
      ),
    note: z.string().optional().describe('A short note of the person for this appointment, at most 500 characters. Leave it out when the person gave none.'),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const bookAppointmentDefinition: ToolDefinition = {
  name: 'book_appointment',
  description:
    'Books an appointment for the person, in a free slot of the calendar. A slot lasts one hour and its type is the type of the hours it lies in, so give only the day and the start time, ' +
    'and the note if the person gave one. Calling this tool books nothing by itself: the application shows the person what would be booked, with a button to confirm and a button to decline, ' +
    'and books only when the person presses the confirm button. Ask for one booking at a time. Use get_calendar first when you do not know which times are free. ' +
    "All dates and times are in the calendar's time zone.",
  kind: 'change',
  roles: ['user'],
  input: () => Input,
  reads: 'calendar',
};

const parts: ChangeTool<Input, BookingSummary> = {
  definition: bookAppointmentDefinition,
  confirmation: {
    // The facts of a booking: that the slot is there and free for this person, and the type of
    // the hours it lies in. They are what GET /calendar answers this person for that day.
    read: async ({ date, time, occurrence, note: written }, { timeZone }, route) => {
      // The first moment the clock of the zone shows this date and time. On the night the clocks
      // go forward a time that does not exist is moved on by the helper: it then reads differently.
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
      const start = occurrence === 'second' ? second : first;

      // The note as the route will take it: trimmed, and no note at all when nothing is left.
      const note = Note.safeParse(written ?? null);
      if (!note.success) {
        return { ok: false, error: 'invalid_note', message: 'The note is not valid: at most 500 characters, and no control characters except a line break.' };
      }

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
      return {
        ok: true,
        call: { routeKey: 'POST /calendar/appointments', path: '/calendar/appointments', body: { start, ...(note.data !== null && { note: note.data }) } },
        facts: { date, start: time, end: localEndTime(slot.end, date, timeZone), type: window.typeName, note: note.data, secondTime: occurrence === 'second' },
      };
    },
    summary: (texts, facts) => texts.changes.bookAppointment(facts),
  },
  // The appointment as booked, with its id, which a later change will name.
  toModel: (body, { timeZone }) => ({ fields: { appointment: appointmentForModel(body as Appointment, timeZone) } }),
};
export const bookAppointment = parts as Tool;
