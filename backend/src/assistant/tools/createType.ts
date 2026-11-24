import { TYPE_CAPACITY, TypeName, type AvailabilityType, type TypeSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { nameTaken, presentTypes, typeNameKey, typeNameSubject } from './facts';
import { typeForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/types (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator creates an appointment type, with the number of people it holds at the same time
// (docs/SHARED_CALENDAR_SPEC.md R-TYPE-05). It is a change: asked for by Claude it is never run,
// it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5).
// This file reads the types through the handler of GET /calendar/types (`facts.ts`); the handler
// of the route that creates is not imported here.

export const INVALID_TYPE_NAME = { ok: false, error: 'invalid_name', message: 'The name is not valid: 1 to 40 characters, and no control characters.' } as const;

// The capacity a type's tools take: a whole number within the range the routes take.
export const CAPACITY = z.number().int().min(TYPE_CAPACITY.min).max(TYPE_CAPACITY.max);

const Input = z
  .object({
    name: z.string().describe('The name of the new appointment type, 1 to 40 characters, as the person gave it.'),
    capacity: CAPACITY.optional().describe(
      `How many people the type holds at the same time, ${TYPE_CAPACITY.min} to ${TYPE_CAPACITY.max}. Leave it out when the person did not say: the type then holds ${TYPE_CAPACITY.default}.`,
    ),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const createTypeDefinition: ToolDefinition = {
  name: 'create_type',
  description:
    'Creates an appointment type with the name given and, when the person gave one, its capacity: how many people can be booked at the same time in its hours. Names are unique, and two names that differ only in their capitals count as the same. ' +
    'Calling this tool creates nothing by itself: the application shows the person the type that would be created, with a button to confirm and a button to decline, ' +
    'and creates it only when the person presses the confirm button. A new type opens no hours: hours are opened for a type from the web pages.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'types',
};

const parts: ChangeTool<Input, TypeSummary> = {
  definition: createTypeDefinition,
  confirmation: {
    // The facts of a new type: the name as the route will take it (trimmed), and that no type has
    // it yet, and its capacity, the route's default when none is given and then not sent. How many
    // types the calendar may hold is the route's to check, at the confirmation.
    read: async ({ name: written, capacity }, _context, route) => {
      const name = TypeName.safeParse(written);
      if (!name.success) return INVALID_TYPE_NAME;
      const present = await presentTypes(route);
      if (!present.ok) return present;
      if (present.types.some((type) => typeNameKey(type.name) === typeNameKey(name.data))) return nameTaken(name.data);
      return {
        ok: true,
        call: { routeKey: 'POST /calendar/types', path: '/calendar/types', body: { name: name.data, ...(capacity !== undefined && { capacity }) } },
        subjects: [typeNameSubject(name.data)],
        facts: { name: name.data, capacity: capacity ?? TYPE_CAPACITY.default },
      };
    },
    summary: (texts, facts) => texts.changes.createType(facts),
  },
  // The type as created, with its id, which a later change will name.
  toModel: (body) => ({ fields: { type: typeForModel(body as AvailabilityType) } }),
};
export const createType = parts as Tool;
