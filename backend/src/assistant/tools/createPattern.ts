import { LocalDate, type PatternSummary, type WeeklyPattern } from '@shared-calendar/shared';
import { z } from 'zod';
import { END_AFTER_START, endsAfterStart, lastsWholeHoursOf, WHOLE_HOURS, hoursInput, newPatternSubject, patternSummaryOf, presentTypes } from './facts';
import { patternForModel, WEEKDAY_NAMES } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/patterns (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator creates a weekly pattern, which opens the same hours on one weekday week after
// week (docs/SHARED_CALENDAR_SPEC.md section 6.2). It is a change: asked for by Claude it is never
// run, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5). This file reads the types through the handler of GET /calendar/types (`facts.ts`); the
// handler of the route that creates is not imported here.
//
// Whether the new hours overlap other hours, whether appointments would be left outside the open
// hours and whether the calendar already holds its fifty patterns (docs/SHARED_CALENDAR_SPEC.md
// R-AV-01, R-AV-03 and R-PAT-04) are not looked at here: no route that only reads gives the extra
// windows and the appointments of every week to come, and the answer is only true under the
// calendar's lock, where the route checks all three when the person confirms.

// What a pattern is made of, as Claude gives it: the fields of the route's body with the weekday
// as a word. The two orders the route asks for are checked here too.
export const patternInput = {
  weekday: z.enum(WEEKDAY_NAMES).describe('The weekday the pattern opens, in English: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday or Sunday.'),
  ...hoursInput,
  validFrom: LocalDate.describe("The first date the pattern holds on, a date of the calendar's time zone as YYYY-MM-DD. Today's date when the person names none."),
};
export const untilNotBeforeFrom = (pattern: { validFrom: string; validUntil?: string | null }): boolean => pattern.validUntil == null || pattern.validFrom <= pattern.validUntil;
export const UNTIL_NOT_BEFORE_FROM = { message: 'validUntil must not be before validFrom', path: ['validUntil'] };

const Input = z
  .object({
    ...patternInput,
    validUntil: LocalDate.nullable().optional().describe('The last date the pattern holds on, included, as YYYY-MM-DD. Null or left out: the pattern has no end.'),
  })
  .strict()
  .refine(endsAfterStart, END_AFTER_START)
  .refine(lastsWholeHoursOf, WHOLE_HOURS)
  .refine(untilNotBeforeFrom, UNTIL_NOT_BEFORE_FROM);
type Input = z.infer<typeof Input>;

export const createPatternDefinition: ToolDefinition = {
  name: 'create_pattern',
  description:
    'Creates a weekly pattern: the same hours open for appointments on one weekday, every week from its first date to its last, for one appointment type. ' +
    'One pattern is one stretch of hours: a morning and an afternoon are two patterns, two calls. ' +
    'Calling this tool creates nothing by itself: the application shows the person the pattern that would be created, with a button to confirm and a button to decline, ' +
    'and creates it only when the person presses the confirm button. The calendar refuses, when the person confirms, hours that overlap other open hours on a date. ' +
    "All dates and times are in the calendar's time zone.",
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'patterns',
};

const parts: ChangeTool<Input, PatternSummary> = {
  definition: createPatternDefinition,
  confirmation: {
    // The facts of a new pattern: the name of its type. The route is sent the weekday as its
    // number, 1 for Monday, and a pattern without an end as null.
    read: async ({ weekday, start, end, typeId, validFrom, validUntil }, _context, route) => {
      const present = await presentTypes(route);
      if (!present.ok) return present;
      const body = { weekday: WEEKDAY_NAMES.indexOf(weekday) + 1, start, end, typeId, validFrom, validUntil: validUntil ?? null };
      const named = patternSummaryOf(body, present.types);
      if (!named.ok) return named;
      return { ok: true, call: { routeKey: 'POST /calendar/patterns', path: '/calendar/patterns', body }, subjects: [newPatternSubject(body)], facts: named.summary };
    },
    summary: (texts, facts) => texts.changes.createPattern(facts),
  },
  // The pattern as the calendar now holds it, with the id a later change will name.
  toModel: (body) => ({ fields: { pattern: patternForModel(body as WeeklyPattern) } }),
};
export const createPattern = parts as Tool;
