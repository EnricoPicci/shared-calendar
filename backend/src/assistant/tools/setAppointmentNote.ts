import { Note, Ulid, type Appointment, type NoteSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { appointmentById, appointmentSubject, summaryOf } from './facts';
import { appointmentForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for PATCH /calendar/appointments/{appointmentId}
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the note of an appointment is set or removed,
// on a User's own appointment or, for the Administrator, on anybody's. It is a change: asked for
// by Claude it is never run, it becomes a proposal the person confirms
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This file reads the appointment through the
// handler of GET /calendar/appointments (`facts.ts`); the handler of the note's route is not
// imported here.

// `note` is always given: a text sets the note, null removes it. A field left out could not tell
// "remove" from "leave", and a text of spaces alone would remove the note without saying so, so
// neither is accepted.
const Input = z
  .object({
    appointmentId: Ulid.describe('The id of the appointment, as list_appointments or get_calendar gave it. Never a date or a time, and never a guess.'),
    note: z
      .string()
      .refine((text) => text.trim() !== '', 'give null to remove the note, not an empty text')
      .nullable()
      .describe('The whole new note, at most 500 characters: it replaces the note the appointment has. Give null, not an empty text, to remove the note.'),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const setAppointmentNoteDefinition: ToolDefinition = {
  name: 'set_appointment_note',
  description:
    "Sets or removes the note of an appointment that has not ended: one of the person's own for a User, anybody's for the Administrator. Give the id of the appointment and the whole new note, or null to remove the note. " +
    'The new note replaces the old one: to add to a note, give the old text with the addition. ' +
    'Calling this tool changes nothing by itself: the application shows the person the appointment and the note as it would become, with a button to confirm and a button to decline, ' +
    'and saves it only when the person presses the confirm button.',
  kind: 'change',
  roles: ['admin', 'user'],
  input: () => Input,
  reads: 'appointments',
};

const parts: ChangeTool<Input, NoteSummary> = {
  definition: setAppointmentNoteDefinition,
  confirmation: {
    // The facts of a note: the appointment the id stands for, the note as the route will take it
    // (trimmed) and the note the appointment has. A note equal to the one it has is not proposed:
    // the route would write nothing.
    read: async ({ appointmentId, note: written }, context, route) => {
      const note = Note.safeParse(written);
      if (!note.success) {
        return { ok: false, error: 'invalid_note', message: 'The note is not valid: at most 500 characters, and no control characters except a line break.' };
      }
      const found = await appointmentById(route, appointmentId);
      if (!found.ok) return found;
      const previous = found.appointment.note;
      if (note.data === previous) {
        return { ok: false, error: 'note_unchanged', message: previous === null ? 'The appointment has no note: there is nothing to remove.' : 'The appointment already has exactly this note: there is nothing to change.' };
      }
      return {
        ok: true,
        call: { routeKey: 'PATCH /calendar/appointments/{appointmentId}', path: `/calendar/appointments/${appointmentId}`, pathParameters: { appointmentId }, body: { note: note.data } },
        subjects: [appointmentSubject(appointmentId)],
        facts: { appointment: summaryOf(found.appointment, context), note: note.data, previous },
      };
    },
    summary: (texts, facts) => texts.changes.setAppointmentNote(facts),
  },
  // The appointment as the calendar now holds it, with its note.
  toModel: (body, { timeZone }) => ({ fields: { appointment: appointmentForModel(body as Appointment, timeZone) } }),
};
export const setAppointmentNote = parts as Tool;
