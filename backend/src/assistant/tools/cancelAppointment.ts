import { Ulid, type Appointment, type AppointmentSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { appointmentById, appointmentSubject, summaryOf } from './facts';
import { appointmentForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/appointments/{appointmentId}/cancel
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): a User cancels an appointment of their own, the
// Administrator anybody's. It is a change: asked for by Claude it is never run, it becomes a
// proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This file reads
// the appointment through the handler of GET /calendar/appointments (`facts.ts`); the handler of
// the cancel route is not imported here.

const Input = z
  .object({
    appointmentId: Ulid.describe('The id of the appointment to cancel, as list_appointments or get_calendar gave it. Never a date or a time, and never a guess.'),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const cancelAppointmentDefinition: ToolDefinition = {
  name: 'cancel_appointment',
  description:
    "Cancels an appointment that has not ended: one of the person's own for a User, anybody's for the Administrator. Give the id of the appointment, which list_appointments and get_calendar give. " +
    'Calling this tool cancels nothing by itself: the application shows the person which appointment would be cancelled, with a button to confirm and a button to decline, ' +
    'and cancels only when the person presses the confirm button. To cancel several appointments, call this tool once for each in the same answer: they are shown and confirmed together. ' +
    'A User can cancel only up to a number of hours before the start ("cancellableUntil" in the list); the calendar refuses a later cancellation when the person confirms.',
  kind: 'change',
  roles: ['admin', 'user'],
  input: () => Input,
  reads: 'appointments',
};

const parts: ChangeTool<Input, AppointmentSummary> = {
  definition: cancelAppointmentDefinition,
  confirmation: {
    // The facts of a cancellation: the appointment the id stands for, among those the person may
    // still act on. The route takes no body.
    read: async ({ appointmentId }, context, route) => {
      const found = await appointmentById(route, appointmentId);
      if (!found.ok) return found;
      return {
        ok: true,
        call: { routeKey: 'POST /calendar/appointments/{appointmentId}/cancel', path: `/calendar/appointments/${appointmentId}/cancel`, pathParameters: { appointmentId } },
        subjects: [appointmentSubject(appointmentId)],
        facts: summaryOf(found.appointment, context),
      };
    },
    summary: (texts, facts) => texts.changes.cancelAppointment(facts),
  },
  // The appointment as the calendar now holds it: cancelled.
  toModel: (body, { timeZone }) => ({ fields: { appointment: appointmentForModel(body as Appointment, timeZone) } }),
};
export const cancelAppointment = parts as Tool;
