import { peopleIn, TYPE_CAPACITY, TypeName, Ulid, type AvailabilityType, type ListAppointmentsResponse, type TypeEditSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler as listAppointments } from '../../handlers/listAppointments';
import { CAPACITY, INVALID_TYPE_NAME } from './createType';
import { nameTaken, presentTypes, typeById, typeNameKey, typeNameSubject, typeSubject } from './facts';
import { typeForModel } from './result';
import { refusalOf, succeeded } from './run';
import type { CallRoute, ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for PUT /calendar/types/{typeId} (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator edits an appointment type, its name, its capacity or both
// (docs/SHARED_CALENDAR_SPEC.md R-TYPE-02). It is a change: asked for by Claude it is never run,
// it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5).
// This file reads the types through the handler of GET /calendar/types (`facts.ts`), and the
// appointments through that of GET /calendar/appointments when the capacity is lowered; the
// handler of the route that edits is not imported here.

const Input = z
  .object({
    typeId: Ulid.describe('The id of the appointment type to edit, as list_types gave it. Never its name, and never a guess.'),
    name: z.string().optional().describe('The new name of the type, 1 to 40 characters, as the person gave it. Leave it out to keep the name.'),
    capacity: CAPACITY.optional().describe(
      `The new capacity of the type, how many people it holds at the same time, ${TYPE_CAPACITY.min} to ${TYPE_CAPACITY.max}. Leave it out to keep the capacity.`,
    ),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.capacity !== undefined, { message: 'give a new name, a new capacity, or both', path: ['name'] });
type Input = z.infer<typeof Input>;

export const editTypeDefinition: ToolDefinition = {
  name: 'edit_type',
  description:
    'Edits an appointment type: its name, its capacity (how many people can be booked at the same time in its hours), or both. Give the id of the type, which list_types gives, and what changes. ' +
    'A new name shows everywhere at once, on the appointments already booked too. A lower capacity cancels nobody: a time with more people than the new capacity takes no new booking until some leave. ' +
    'Calling this tool changes nothing by itself: the application shows the person the type as it is and as it would become, with a button to confirm and a button to decline, ' +
    'and changes it only when the person presses the confirm button.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'types',
};

/**
 * Whether the type's appointments that have not ended put more people at one time than a
 * capacity: the most of them present at one instant (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02),
 * among the appointments GET /calendar/appointments lists as upcoming. Two appointments of a type
 * that overlap lie in one window of it (docs/SHARED_CALENDAR_SPEC.md R-TYPE-05), so the peak of
 * the whole list is the most people any of its times holds.
 */
async function bookedAbove(route: CallRoute, typeId: string, capacity: number): Promise<{ ok: true; above: boolean } | { ok: false; error: string; message: string }> {
  const answer = await route(listAppointments, { routeKey: 'GET /calendar/appointments', path: '/calendar/appointments', query: { upcoming: 'true', status: 'all' } });
  if (!succeeded(answer)) return { ok: false, ...refusalOf(answer, 'The appointments could not be read.') };
  const booked = (answer.body as ListAppointmentsResponse).appointments.filter((appointment) => appointment.typeId === typeId && appointment.status === 'booked');
  if (booked.length === 0) return { ok: true, above: false };
  const all = { start: booked.reduce((first, a) => (a.start < first ? a.start : first), booked[0]!.start), end: booked.reduce((last, a) => (a.end > last ? a.end : last), booked[0]!.end) };
  return { ok: true, above: peopleIn(all, booked) > capacity };
}

const parts: ChangeTool<Input, TypeEditSummary> = {
  definition: editTypeDefinition,
  confirmation: {
    // The facts of an edit: the type the id stands for, with the name and the capacity it has, and
    // what changes. A value equal to the present one counts as not given; nothing left to change
    // is not proposed. The same name with other capitals is a change, as the route takes it
    // (docs/ARCHITECTURE.md section 4, `AvailabilityType`); no other type may have the new name.
    // The route always takes the name, so it is sent, the present one when it does not change; the
    // capacity is sent only when it changes, since an absent one keeps the stored value
    // (docs/SHARED_CALENDAR_SPEC.md R-TYPE-02).
    read: async ({ typeId, name: written, capacity }, _context, route) => {
      const name = written === undefined ? null : TypeName.safeParse(written);
      if (name !== null && !name.success) return INVALID_TYPE_NAME;
      const present = await presentTypes(route);
      if (!present.ok) return present;
      const found = typeById(present.types, typeId);
      if (!found.ok) return found;
      const { type } = found;
      const newName = name !== null && name.data !== type.name ? name.data : null;
      const newCapacity = capacity !== undefined && capacity !== type.capacity ? capacity : null;
      if (newName === null && newCapacity === null) {
        return {
          ok: false,
          error: 'type_unchanged',
          message: `The type "${type.name}" already has this name and a capacity of ${type.capacity}: there is nothing to change.`,
        };
      }
      if (newName !== null && present.types.some((other) => other.typeId !== typeId && typeNameKey(other.name) === typeNameKey(newName))) return nameTaken(newName);
      let above = false;
      if (newCapacity !== null && newCapacity < type.capacity) {
        const booked = await bookedAbove(route, typeId, newCapacity);
        if (!booked.ok) return booked;
        above = booked.above;
      }
      return {
        ok: true,
        call: {
          routeKey: 'PUT /calendar/types/{typeId}',
          path: `/calendar/types/${typeId}`,
          pathParameters: { typeId },
          body: { name: newName ?? type.name, ...(newCapacity !== null && { capacity: newCapacity }) },
        },
        subjects: [typeSubject(typeId), ...(newName === null ? [] : [typeNameSubject(newName)])],
        facts: { name: type.name, newName, capacity: newCapacity === null ? null : { from: type.capacity, to: newCapacity }, bookedAbove: above },
      };
    },
    summary: (texts, facts) => texts.changes.editType(facts),
  },
  // The type as the calendar now holds it, with its name and its capacity.
  toModel: (body) => ({ fields: { type: typeForModel(body as AvailabilityType) } }),
};
export const editType = parts as Tool;
