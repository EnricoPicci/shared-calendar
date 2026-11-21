import { LocalDate, localTimeOf, type CalendarView } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler } from '../../handlers/getCalendar';
import { appointmentForModel, localEndTime, slotTime } from './result';
import type { ReadTool, ToolDefinition } from './tool';

// The tool for GET /calendar (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): what a period of the
// calendar looks like to the person, day by day. Both roles: the route builds the view for the
// caller's role, so a User gets the slots a User may book and their own appointments, the
// Administrator every appointment.

// The dates are local dates, as the route takes them: nothing is converted on the way in. The
// route refuses a period that ends before it starts or is longer than 31 days.
const Input = z
  .object({
    from: LocalDate.describe("The first day of the period, a date of the calendar's time zone as YYYY-MM-DD."),
    to: LocalDate.describe('The last day of the period, included, as YYYY-MM-DD. At most 30 days after "from".'),
  })
  .strict();

export const getCalendarDefinition: ToolDefinition = {
  name: 'get_calendar',
  description:
    'Reads the calendar of a period of at most 31 days, day by day. For each day: the hours open for appointments ("windows", each with its type), ' +
    'the start times that are still free and that the person may book ("freeSlots", each free slot lasts one hour), and the appointments that start on that day ' +
    "(the person's own for a User, everybody's for the Administrator). A day that is not in the answer has no open hours and no appointments. " +
    'On the one night a year when the clocks go back, a time comes twice: the second of the two free slots is then written with " (second)" after it. ' +
    'Use it for every question about free times or about what a day or a week looks like. All dates and times are in the calendar\'s time zone.',
  kind: 'read',
  roles: ['admin', 'user'],
  input: () => Input,
  reads: 'calendar',
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const parts: ReadTool<z.infer<typeof Input>> = {
  definition: getCalendarDefinition,
  toHandler: { handler, request: ({ from, to }) => ({ routeKey: 'GET /calendar', path: '/calendar', query: { from, to } }) },
  // A day as its windows, its free slot starts and its appointments, in wall-clock times. The days
  // with nothing on them are left out, which keeps a month of mostly closed days small; where a
  // window comes from, the busy time of other people and the ids of the types stay out.
  toModel: (body, { timeZone }) => {
    const view = body as CalendarView;
    const days = view.days
      .map((day) => ({
        date: day.date,
        weekday: WEEKDAYS[day.weekday - 1],
        windows: day.windows.map((window) => ({
          start: localTimeOf(window.start, timeZone),
          end: localEndTime(window.end, day.date, timeZone),
          type: window.typeName,
        })),
        freeSlots: day.slots.map((slot) => slotTime(slot.start, timeZone)),
        appointments: view.appointments.filter((appointment) => appointment.date === day.date).map((appointment) => appointmentForModel(appointment, timeZone)),
      }))
      .filter((day) => day.windows.length > 0 || day.appointments.length > 0);
    return { fields: { from: view.from, to: view.to }, list: { name: 'days', items: days } };
  },
};
export const getCalendar = parts as ReadTool;
