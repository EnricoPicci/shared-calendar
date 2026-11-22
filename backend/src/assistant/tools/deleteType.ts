import { Ulid } from '@shared-calendar/shared';
import { z } from 'zod';
import { presentTypes, typeById, typeSubject } from './facts';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for DELETE /calendar/types/{typeId} (docs/CONVERSATIONAL_ARCHITECTURE.md section 3):
// the Administrator deletes an appointment type. It is a change: asked for by Claude it is never
// run, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5). This file reads the types through the handler of GET /calendar/types (`facts.ts`); the
// handler of the route that deletes is not imported here.
//
// Whether the type is still in use (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03) is not looked at
// here: no route that only reads says it, and the route that deletes checks it under the
// calendar's lock when the person confirms, so a type in use is proposed and then refused.

const Input = z.object({ typeId: Ulid.describe('The id of the appointment type to delete, as list_types gave it. Never its name, and never a guess.') }).strict();
type Input = z.infer<typeof Input>;

export const deleteTypeDefinition: ToolDefinition = {
  name: 'delete_type',
  description:
    'Deletes an appointment type. Give the id of the type, which list_types gives. ' +
    'Calling this tool deletes nothing by itself: the application shows the person the type that would be deleted, with a button to confirm and a button to decline, ' +
    'and deletes it only when the person presses the confirm button. The calendar refuses, when the person confirms, to delete a type that is still in use: ' +
    'one that a weekly pattern, the hours of a day from today on, or an appointment that has not ended refers to.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'types',
};

const parts: ChangeTool<Input, { name: string }> = {
  definition: deleteTypeDefinition,
  confirmation: {
    // The facts of a deletion: the type the id stands for, by its name. The route takes no body.
    read: async ({ typeId }, _context, route) => {
      const present = await presentTypes(route);
      if (!present.ok) return present;
      const found = typeById(present.types, typeId);
      if (!found.ok) return found;
      return {
        ok: true,
        call: { routeKey: 'DELETE /calendar/types/{typeId}', path: `/calendar/types/${typeId}`, pathParameters: { typeId } },
        subjects: [typeSubject(typeId)],
        facts: { name: found.type.name },
      };
    },
    summary: (texts, facts) => texts.changes.deleteType(facts),
  },
  // The route answers nothing when it deleted: Claude is told so in a word.
  toModel: () => ({ fields: { deleted: true } }),
};
export const deleteType = parts as Tool;
