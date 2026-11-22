import { TypeName, Ulid, type AvailabilityType } from '@shared-calendar/shared';
import { z } from 'zod';
import { INVALID_TYPE_NAME } from './createType';
import { nameTaken, presentTypes, typeById, typeNameKey, typeNameSubject, typeSubject } from './facts';
import { typeForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for PUT /calendar/types/{typeId} (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator renames an appointment type. It is a change: asked for by Claude it is never run,
// it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5).
// This file reads the types through the handler of GET /calendar/types (`facts.ts`); the handler
// of the route that renames is not imported here.

const Input = z
  .object({
    typeId: Ulid.describe('The id of the appointment type to rename, as list_types gave it. Never its name, and never a guess.'),
    name: z.string().describe('The new name of the type, 1 to 40 characters, as the person gave it.'),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const renameTypeDefinition: ToolDefinition = {
  name: 'rename_type',
  description:
    'Renames an appointment type. Give the id of the type, which list_types gives, and its new name. The new name shows everywhere at once, on the appointments already booked too. ' +
    'Calling this tool renames nothing by itself: the application shows the person the old name and the new one, with a button to confirm and a button to decline, ' +
    'and renames only when the person presses the confirm button.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'types',
};

const parts: ChangeTool<Input, { from: string; to: string }> = {
  definition: renameTypeDefinition,
  confirmation: {
    // The facts of a rename: the type the id stands for, with the name it has, and that no other
    // type has the new one. The name the type already has is not proposed; the same name with
    // other capitals is, as the route takes it (docs/ARCHITECTURE.md section 4, `AvailabilityType`).
    read: async ({ typeId, name: written }, _context, route) => {
      const name = TypeName.safeParse(written);
      if (!name.success) return INVALID_TYPE_NAME;
      const present = await presentTypes(route);
      if (!present.ok) return present;
      const found = typeById(present.types, typeId);
      if (!found.ok) return found;
      if (found.type.name === name.data) {
        return { ok: false, error: 'name_unchanged', message: `The type already has the name "${name.data}": there is nothing to rename.` };
      }
      if (present.types.some((type) => type.typeId !== typeId && typeNameKey(type.name) === typeNameKey(name.data))) return nameTaken(name.data);
      return {
        ok: true,
        call: { routeKey: 'PUT /calendar/types/{typeId}', path: `/calendar/types/${typeId}`, pathParameters: { typeId }, body: { name: name.data } },
        subjects: [typeSubject(typeId), typeNameSubject(name.data)],
        facts: { from: found.type.name, to: name.data },
      };
    },
    summary: (texts, facts) => texts.changes.renameType(facts),
  },
  // The type as the calendar now holds it, with its new name.
  toModel: (body) => ({ fields: { type: typeForModel(body as AvailabilityType) } }),
};
export const renameType = parts as Tool;
