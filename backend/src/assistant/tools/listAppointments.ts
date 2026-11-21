import { LocalDate, Username, type ListAppointmentsResponse, type Role } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler } from '../../handlers/listAppointments';
import { appointmentForModel } from './result';
import type { Tool, ToolDefinition } from './tool';

// The tool for GET /calendar/appointments (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// appointments of a period, or the upcoming ones. Both roles. A User only ever gets their own, by
// the route's own check; the Administrator gets everybody's and may ask for one person's, so only
// the Administrator's input has `username`.

const fields = {
  from: LocalDate.optional().describe(
    "The first day of the period, a date of the calendar's time zone as YYYY-MM-DD. Give \"from\" and \"to\" together, or neither: with neither, the answer holds the upcoming appointments.",
  ),
  to: LocalDate.optional().describe('The last day of the period, included, as YYYY-MM-DD. At most 91 days after "from".'),
  status: z
    .enum(['booked', 'cancelled', 'all'])
    .optional()
    .describe('Which appointments: "booked" (the default) for those that stand, "cancelled" for the cancelled ones, "all" for both.'),
};
const BOTH_OR_NEITHER = 'give "from" and "to" together, or neither';
const bothOrNeither = (input: { from?: string; to?: string }) => (input.from === undefined) === (input.to === undefined);

const UserInput = z.object(fields).strict().refine(bothOrNeither, { message: BOTH_OR_NEITHER, path: ['to'] });
const AdminInput = z
  .object({ ...fields, username: Username.optional().describe('Only the appointments of the User with this username. Leave it out for everybody\'s.') })
  .strict()
  .refine(bothOrNeither, { message: BOTH_OR_NEITHER, path: ['to'] });
const INPUTS: Record<Role, z.ZodType> = { user: UserInput, admin: AdminInput };

export const listAppointmentsDefinition: ToolDefinition = {
  name: 'list_appointments',
  description:
    "Lists appointments with their id, date, start and end time, type, username, note and status, sorted by start: the person's own for a User, everybody's for the Administrator. " +
    'Either those that start in a period of at most 92 days ("from" and "to"), or, with no period, the upcoming ones. Cancelled appointments only on request ("status"). ' +
    'Use it when the person asks which appointments they have, or to find the appointment a request is about. All dates and times are in the calendar\'s time zone.',
  kind: 'read',
  roles: ['admin', 'user'],
  input: (role) => INPUTS[role],
  reads: 'appointments',
};

const parts: Tool<z.infer<typeof AdminInput>> = {
  definition: listAppointmentsDefinition,
  toHandler: {
    handler,
    request: ({ from, to, status, username }) => ({
      routeKey: 'GET /calendar/appointments',
      path: '/calendar/appointments',
      query: {
        ...(from !== undefined && to !== undefined ? { from, to } : { upcoming: 'true' }),
        ...(status !== undefined && { status }),
        ...(username !== undefined && { username }),
      },
    }),
  },
  toModel: (body, { timeZone }) => ({
    fields: {},
    list: { name: 'appointments', items: (body as ListAppointmentsResponse).appointments.map((appointment) => appointmentForModel(appointment, timeZone)) },
  }),
};
export const listAppointments = parts as Tool;
