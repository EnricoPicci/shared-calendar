import { LocalDate, Ulid, type PatternSummary, type WeeklyPattern } from '@shared-calendar/shared';
import { z } from 'zod';
import { patternInput, UNTIL_NOT_BEFORE_FROM, untilNotBeforeFrom } from './createPattern';
import { END_AFTER_START, endsAfterStart, lastsWholeHoursOf, WHOLE_HOURS, patternById, patternSubject, patternSummaryOf, presentPatterns, presentTypes } from './facts';
import { patternForModel, WEEKDAY_NAMES } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for PUT /calendar/patterns/{patternId} (docs/CONVERSATIONAL_ARCHITECTURE.md section 3):
// the Administrator changes a weekly pattern. The route replaces the whole pattern
// (docs/SHARED_CALENDAR_SPEC.md R-PAT-03), so the tool takes the whole pattern as it would become.
// It is a change: asked for by Claude it is never run, it becomes a proposal the person confirms
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This file reads the patterns and the types
// through the handlers of GET /calendar/patterns and GET /calendar/types (`facts.ts`); the handler
// of the route that changes is not imported here. An overlap and appointments left outside the
// open hours are the route's to find, under the calendar's lock, when the person confirms.

const Input = z
  .object({
    patternId: Ulid.describe('The id of the weekly pattern to change, as list_patterns gave it. Never a guess.'),
    ...patternInput,
    // Required, so that an end is never removed by leaving the field out.
    validUntil: LocalDate.nullable().describe('The last date the pattern holds on, included, as YYYY-MM-DD, or null for a pattern with no end.'),
  })
  .strict()
  .refine(endsAfterStart, END_AFTER_START)
  .refine(lastsWholeHoursOf, WHOLE_HOURS)
  .refine(untilNotBeforeFrom, UNTIL_NOT_BEFORE_FROM);
type Input = z.infer<typeof Input>;

export const updatePatternDefinition: ToolDefinition = {
  name: 'update_pattern',
  description:
    'Changes a weekly pattern. Give the id of the pattern, which list_patterns gives, and the whole pattern as it must become: ' +
    'every field, those that stay the same with the value list_patterns gave, the type as its id, which list_types gives. ' +
    'Calling this tool changes nothing by itself: the application shows the person the pattern as it is and as it would become, with a button to confirm and a button to decline, ' +
    'and changes it only when the person presses the confirm button. The calendar refuses, when the person confirms, a change that would leave an appointment outside the open hours, ' +
    'and hours that overlap other open hours on a date.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'patterns',
};

const SAME_FIELDS = ['weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil'] as const;

const parts: ChangeTool<Input, { from: PatternSummary; to: PatternSummary }> = {
  definition: updatePatternDefinition,
  confirmation: {
    // The facts of a change to a pattern: the pattern the id stands for, as it is, and the names
    // of the type it has and of the type it would get. A pattern that would stay exactly as it is
    // is not proposed.
    read: async ({ patternId, weekday, ...rest }, _context, route) => {
      const present = await presentPatterns(route);
      if (!present.ok) return present;
      const found = patternById(present.patterns, patternId);
      if (!found.ok) return found;
      const body = { weekday: WEEKDAY_NAMES.indexOf(weekday) + 1, ...rest };
      if (SAME_FIELDS.every((field) => found.pattern[field] === body[field])) {
        return { ok: false, error: 'pattern_unchanged', message: 'The pattern already is exactly this: there is nothing to change.' };
      }
      const types = await presentTypes(route);
      if (!types.ok) return types;
      const from = patternSummaryOf(found.pattern, types.types);
      if (!from.ok) return from;
      const to = patternSummaryOf(body, types.types);
      if (!to.ok) return to;
      return {
        ok: true,
        call: { routeKey: 'PUT /calendar/patterns/{patternId}', path: `/calendar/patterns/${patternId}`, pathParameters: { patternId }, body },
        subjects: [patternSubject(patternId)],
        facts: { from: from.summary, to: to.summary },
      };
    },
    summary: (texts, facts) => texts.changes.updatePattern(facts),
  },
  // The pattern as the calendar now holds it.
  toModel: (body) => ({ fields: { pattern: patternForModel(body as WeeklyPattern) } }),
};
export const updatePattern = parts as Tool;
