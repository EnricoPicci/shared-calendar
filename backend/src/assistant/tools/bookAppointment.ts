import { LocalDate, LocalTime, Note, Username, type Appointment, type BookingSummary, type Role } from '@shared-calendar/shared';
import { z } from 'zod';
import { freeSlotAt, instantOf, OVERBOOK, plainUser, slotKey } from './facts';
import { appointmentForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/appointments (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): a User
// books an appointment for themself, the Administrator for a User. It is a change: asked for by Claude it is never run, it
// becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This
// file holds what building the proposal needs and reads the calendar through the handler of
// GET /calendar (`facts.ts`); the handler of the booking route is not imported here, so the
// functions that build a proposal do not carry it.
//
// The input differs by role, as the route's body does (docs/SHARED_CALENDAR_SPEC.md R-BOOK-01):
// the Administrator must name the User the appointment is for, and a User's input has no
// username at all. The Administrator books a free slot of one hour, like a User: the custom times
// the route also takes from the Administrator stay in the web pages. The Administrator's input also
// has `overbook`, to book a time that is full over its capacity (docs/SHARED_CALENDAR_SPEC.md
// R-BOOK-13); a User's has none, as the route refuses it from a User.

const fields = {
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
};
const UserInput = z.object(fields).strict();
const AdminInput = z
  .object({ username: Username.describe('The username of the User the appointment is for, exactly as list_users gives it. Never a guess.'), ...fields, overbook: OVERBOOK })
  .strict();
const INPUTS: Record<Role, z.ZodType> = { user: UserInput, admin: AdminInput };
// What either schema gives: `username` and `overbook` are there for the Administrator only.
type Input = z.infer<typeof UserInput> & { username?: string; overbook?: boolean };

export const bookAppointmentDefinition: ToolDefinition = {
  name: 'book_appointment',
  description:
    'Books an appointment for the person, in a free slot of the calendar. A slot lasts one hour and its type is the type of the hours it lies in, so give only the day and the start time, ' +
    'and the note if the person gave one. Calling this tool books nothing by itself: the application shows the person what would be booked, with a button to confirm and a button to decline, ' +
    'and books only when the person presses the confirm button. To book several appointments, call this tool once for each in the same answer: they are shown and confirmed together. Use get_calendar first when you do not know which times are free. ' +
    "All dates and times are in the calendar's time zone.",
  descriptionForAdmin:
    'As the Administrator you book for a User, never for yourself: give the username of that User in "username", exactly as list_users gives it. ' +
    'The limits a User books under (the minimum notice, the booking horizon, the highest number of future appointments) do not apply to a booking you make. ' +
    'A time that is full ("fullSlots" in get_calendar) is refused, unless the person asked to book it over the capacity: only then give "overbook": true.',
  kind: 'change',
  roles: ['admin', 'user'],
  input: (role) => INPUTS[role],
  reads: 'calendar',
};

const parts: ChangeTool<Input, BookingSummary> = {
  definition: bookAppointmentDefinition,
  confirmation: {
    // The facts of a booking: that the slot is there and has a place for this person, and the type
    // of the hours it lies in. They are what GET /calendar answers this person for that day. For
    // the Administrator also the person: that the username names a User, as GET /users lists them,
    // and holds no appointment at that time; and, over the capacity, how many people the time will
    // hold. `overbook` is sent to the route as asked, also for a time with a place left.
    read: async ({ date, time, occurrence, note: written, username, overbook }, { timeZone }, route) => {
      const when = instantOf(date, time, occurrence, timeZone);
      if (!when.ok) return when;
      const { start } = when;

      // The note as the route will take it: trimmed, and no note at all when nothing is left.
      const note = Note.safeParse(written ?? null);
      if (!note.success) {
        return { ok: false, error: 'invalid_note', message: 'The note is not valid: at most 500 characters, and no control characters except a line break.' };
      }

      if (username !== undefined) {
        const user = await plainUser(route, username);
        if (!user.ok) return user;
      }
      const forced = overbook === true;
      const slot = await freeSlotAt(route, date, time, start, timeZone, { overbook: forced, username: username ?? null, leaveOut: null });
      if (!slot.ok) return slot;
      return {
        ok: true,
        call: {
          routeKey: 'POST /calendar/appointments',
          path: '/calendar/appointments',
          body: { start, ...(username !== undefined && { username }), ...(note.data !== null && { note: note.data }), ...(forced && { overbook: true }) },
        },
        place: { slot: slotKey(start), left: slot.placesLeft, who: username ?? '', overbook: forced },
        facts: { date, start: time, end: slot.end, type: slot.type, note: note.data, secondTime: when.secondTime, username: username ?? null, over: slot.over },
      };
    },
    summary: (texts, facts) => texts.changes.bookAppointment(facts),
  },
  // The appointment as booked, with its id, which a later change will name.
  toModel: (body, { timeZone }) => ({ fields: { appointment: appointmentForModel(body as Appointment, timeZone) } }),
};
export const bookAppointment = parts as Tool;
