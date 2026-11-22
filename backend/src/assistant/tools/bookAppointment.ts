import { LocalDate, LocalTime, Note, type Appointment, type BookingSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { freeSlotAt, instantOf, slotSubject } from './facts';
import { appointmentForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/appointments (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): a User
// books an appointment for themself. It is a change: asked for by Claude it is never run, it
// becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This
// file holds what building the proposal needs and reads the calendar through the handler of
// GET /calendar (`facts.ts`); the handler of the booking route is not imported here, so the
// functions that build a proposal do not carry it.
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
    'and books only when the person presses the confirm button. To book several appointments, call this tool once for each in the same answer: they are shown and confirmed together. Use get_calendar first when you do not know which times are free. ' +
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
      const when = instantOf(date, time, occurrence, timeZone);
      if (!when.ok) return when;
      const { start } = when;

      // The note as the route will take it: trimmed, and no note at all when nothing is left.
      const note = Note.safeParse(written ?? null);
      if (!note.success) {
        return { ok: false, error: 'invalid_note', message: 'The note is not valid: at most 500 characters, and no control characters except a line break.' };
      }

      const slot = await freeSlotAt(route, date, time, start, timeZone);
      if (!slot.ok) return slot;
      return {
        ok: true,
        call: { routeKey: 'POST /calendar/appointments', path: '/calendar/appointments', body: { start, ...(note.data !== null && { note: note.data }) } },
        subjects: [slotSubject(start)],
        facts: { date, start: time, end: slot.end, type: slot.type, note: note.data, secondTime: when.secondTime },
      };
    },
    summary: (texts, facts) => texts.changes.bookAppointment(facts),
  },
  // The appointment as booked, with its id, which a later change will name.
  toModel: (body, { timeZone }) => ({ fields: { appointment: appointmentForModel(body as Appointment, timeZone) } }),
};
export const bookAppointment = parts as Tool;
