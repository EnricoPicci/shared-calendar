import { LocalDate, LocalTime, Ulid, type ChangeAppointmentResponse, type MoveSummary, type Role } from '@shared-calendar/shared';
import { z } from 'zod';
import { appointmentById, appointmentSubject, freeSlotAt, instantOf, OVERBOOK, slotKey, summaryOf } from './facts';
import { appointmentForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/appointments/{appointmentId}/change
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): an appointment is moved to another free slot,
// a User's own or, for the Administrator, anybody's. It moves and does nothing else: its input has
// no note, and the route keeps the note of an appointment whose change names none
// (docs/SHARED_CALENDAR_SPEC.md R-CHG-03). It is a change: asked for by Claude it is never run, it
// becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This
// file reads the appointment and the new slot through two handlers that only read (`facts.ts`);
// the handler of the change route is not imported here. The Administrator's input also has
// `overbook`, to move an appointment into a time that is full (docs/SHARED_CALENDAR_SPEC.md
// R-CHG-01 and R-BOOK-13); a User's has none.

const fields = {
    appointmentId: Ulid.describe('The id of the appointment to move, as list_appointments or get_calendar gave it. Never a date or a time, and never a guess.'),
    date: LocalDate.describe("The day the appointment is moved to, a date of the calendar's time zone as YYYY-MM-DD."),
    time: LocalTime.describe(
      'The time the appointment will start, a wall-clock time of the calendar\'s time zone as HH:mm (24-hour clock). It must be one of the "freeSlots" get_calendar gives for that day.',
    ),
    occurrence: z
      .enum(['first', 'second'])
      .optional()
      .describe(
        'Only on the one night a year when the clocks go back and the same time comes twice: which of the two is meant. ' +
          'Give "second" for the free slot get_calendar writes with " (second)" after its time, "first" for the other. Leave it out on every other day.',
      ),
};
const UserInput = z.object(fields).strict();
const AdminInput = z.object({ ...fields, overbook: OVERBOOK }).strict();
const INPUTS: Record<Role, z.ZodType> = { user: UserInput, admin: AdminInput };
// What either schema gives: `overbook` is there for the Administrator only.
type Input = z.infer<typeof UserInput> & { overbook?: boolean };

export const changeAppointmentDefinition: ToolDefinition = {
  name: 'change_appointment',
  description:
    "Moves an appointment that has not ended to another free slot: one of the person's own for a User, anybody's for the Administrator. Give the id of the appointment and the day and start time of the free slot it goes to. " +
    'A slot lasts one hour and its type is the type of the hours it lies in, so the type may change with the move. The note of the appointment is kept: to change a note use set_appointment_note. ' +
    'Calling this tool moves nothing by itself: the application shows the person the appointment and where it would go, with a button to confirm and a button to decline, ' +
    'and moves it only when the person presses the confirm button. Use get_calendar first when you do not know which times are free. ' +
    'A User can move an appointment only up to a number of hours before its start ("cancellableUntil" in the list). ' +
    "All dates and times are in the calendar's time zone.",
  descriptionForAdmin: 'A time that is full ("fullSlots" in get_calendar) is refused, unless the person asked to move the appointment there over the capacity: only then give "overbook": true.',
  kind: 'change',
  roles: ['admin', 'user'],
  input: (role) => INPUTS[role],
  reads: 'calendar',
};

const parts: ChangeTool<Input, MoveSummary> = {
  definition: changeAppointmentDefinition,
  confirmation: {
    // The facts of a move: the appointment the id stands for, and the slot it would go to, free
    // for this person, with its end and the type of its hours. The route is sent the new start
    // alone: no end, and no note, so the old note is kept; and `overbook` when the Administrator
    // asked for it. For the Administrator the appointment's User must hold no other appointment
    // at the new time, the moved one left out (docs/SHARED_CALENDAR_SPEC.md R-CHG-01).
    read: async ({ appointmentId, date, time, occurrence, overbook }, context, route) => {
      const when = instantOf(date, time, occurrence, context.timeZone);
      if (!when.ok) return when;
      const found = await appointmentById(route, appointmentId);
      if (!found.ok) return found;
      if (found.appointment.start === when.start) {
        return { ok: false, error: 'same_time', message: `The appointment already starts on ${date} at ${time}: there is nothing to move.` };
      }
      const forced = overbook === true;
      const admin = context.role === 'admin';
      const slot = await freeSlotAt(route, date, time, when.start, context.timeZone, { overbook: forced, username: admin ? found.appointment.username : null, leaveOut: appointmentId });
      if (!slot.ok) return slot;
      return {
        ok: true,
        call: {
          routeKey: 'POST /calendar/appointments/{appointmentId}/change',
          path: `/calendar/appointments/${appointmentId}/change`,
          pathParameters: { appointmentId },
          body: { start: when.start, ...(forced && { overbook: true }) },
        },
        subjects: [appointmentSubject(appointmentId)],
        place: { slot: slotKey(when.start), left: slot.placesLeft, who: admin ? found.appointment.username : '', overbook: forced },
        facts: { appointment: summaryOf(found.appointment, context), to: { date, start: time, end: slot.end, type: slot.type, secondTime: when.secondTime, over: slot.over } },
      };
    },
    summary: (texts, facts) => texts.changes.changeAppointment(facts),
  },
  // The new appointment, with its id, and the one it replaces, which the calendar keeps as
  // cancelled.
  toModel: (body, { timeZone }) => {
    const { booked, cancelled } = body as ChangeAppointmentResponse;
    const { id, date, start, end, status } = appointmentForModel(cancelled, timeZone);
    return { fields: { appointment: appointmentForModel(booked, timeZone), replaced: { id, date, start, end, status } } };
  },
};
export const changeAppointment = parts as Tool;
