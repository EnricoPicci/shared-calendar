import { Ulid, type PatternSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { patternById, patternSubject, patternSummaryOf, presentPatterns, presentTypes } from './facts';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for DELETE /calendar/patterns/{patternId} (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 3): the Administrator deletes a weekly pattern. It is a change: asked for by Claude it is never
// run, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5). This file reads the patterns and the types through the handlers of GET /calendar/patterns
// and GET /calendar/types (`facts.ts`); the handler of the route that deletes is not imported
// here. Appointments the deletion would leave outside the open hours
// (docs/SHARED_CALENDAR_SPEC.md R-AV-03) are the route's to find, under the calendar's lock, when
// the person confirms.

const Input = z.object({ patternId: Ulid.describe('The id of the weekly pattern to delete, as list_patterns gave it. Never a guess.') }).strict();
type Input = z.infer<typeof Input>;

export const deletePatternDefinition: ToolDefinition = {
  name: 'delete_pattern',
  description:
    'Deletes a weekly pattern, on every week it holds on. Give the id of the pattern, which list_patterns gives. ' +
    'To close one date only, do not delete the pattern: set the hours of that date with set_date_override. ' +
    'Calling this tool deletes nothing by itself: the application shows the person the pattern that would be deleted, with a button to confirm and a button to decline, ' +
    'and deletes it only when the person presses the confirm button. The calendar refuses, when the person confirms, to delete a pattern while an appointment that has not ended lies in its hours.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'patterns',
};

const parts: ChangeTool<Input, PatternSummary> = {
  definition: deletePatternDefinition,
  confirmation: {
    // The facts of a deletion: the pattern the id stands for, with the name of its type. The
    // route takes no body.
    read: async ({ patternId }, _context, route) => {
      const present = await presentPatterns(route);
      if (!present.ok) return present;
      const found = patternById(present.patterns, patternId);
      if (!found.ok) return found;
      const types = await presentTypes(route);
      if (!types.ok) return types;
      const named = patternSummaryOf(found.pattern, types.types);
      if (!named.ok) return named;
      return {
        ok: true,
        call: { routeKey: 'DELETE /calendar/patterns/{patternId}', path: `/calendar/patterns/${patternId}`, pathParameters: { patternId } },
        subjects: [patternSubject(patternId)],
        facts: named.summary,
      };
    },
    summary: (texts, facts) => texts.changes.deletePattern(facts),
  },
  // The route answers nothing when it deleted: Claude is told so in a word.
  toModel: () => ({ fields: { deleted: true } }),
};
export const deletePattern = parts as Tool;
