import { definedWindows, LocalDate, type DayChangeSummary, type HoursSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { hoursOf, namedHours, overrideSubject, presentDay, presentPatterns, presentTypes } from './facts';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for DELETE /calendar/overrides/{date} (docs/CONVERSATIONAL_ARCHITECTURE.md section 3):
// the Administrator takes away the hours a date has of its own, so that the weekly patterns apply
// on it again (docs/SHARED_CALENDAR_SPEC.md R-OVR-02). It is a change: asked for by Claude it is
// never run, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md
// section 5.5). This file reads the day, the patterns and the types through the handlers of GET
// /calendar, GET /calendar/patterns and GET /calendar/types (`facts.ts`); the handler of the route
// that deletes is not imported here. Appointments the patterns' hours would leave outside them,
// and an overlap of those hours with an extra window, are the route's to find when the person
// confirms.

const Input = z.object({ date: LocalDate.describe("The date that goes back to the weekly patterns, a date of the calendar's time zone as YYYY-MM-DD, today or later.") }).strict();
type Input = z.infer<typeof Input>;

export const deleteDateOverrideDefinition: ToolDefinition = {
  name: 'delete_date_override',
  description:
    'Takes away the hours a date has of its own, so that the weekly patterns apply on that date again: it opens a day that was closed or blocked "as usual". ' +
    'Only for a date that get_calendar shows with "hasOverride" true. Extra windows of the date are not touched. ' +
    'Calling this tool changes nothing by itself: the application shows the person the day as it is and as it would become, with a button to confirm and a button to decline, ' +
    'and changes it only when the person presses the confirm button.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'calendar',
};

const parts: ChangeTool<Input, DayChangeSummary> = {
  definition: deleteDateOverrideDefinition,
  confirmation: {
    // The facts of a date going back to the patterns: the hours it has of its own, and those the
    // patterns that hold on that date would give it. A date without hours of its own has nothing
    // to take away. The route takes no body.
    read: async ({ date }, { timeZone }, route) => {
      const day = await presentDay(route, date, timeZone);
      if (!day.ok) return day;
      if (!day.hasOverride) {
        return { ok: false, error: 'override_not_found', message: `${date} has no hours of its own: the weekly patterns already apply on it. There is nothing to take away.` };
      }
      const patterns = await presentPatterns(route);
      if (!patterns.ok) return patterns;
      const types = await presentTypes(route);
      if (!types.ok) return types;
      const then: HoursSummary[] = [];
      for (const window of definedWindows(date, patterns.patterns, null, [])) {
        const named = hoursOf(window, types.types);
        if (!named.ok) return named;
        then.push(named.hours);
      }
      return {
        ok: true,
        call: { routeKey: 'DELETE /calendar/overrides/{date}', path: `/calendar/overrides/${date}`, pathParameters: { date } },
        subjects: [overrideSubject(date)],
        facts: {
          date,
          now: { from: 'own', windows: day.windows.filter((window) => window.source !== 'one_off').map(namedHours) },
          then: { from: 'patterns', windows: then },
          extras: day.windows.filter((window) => window.source === 'one_off').map(namedHours),
        },
      };
    },
    summary: (texts, facts) => texts.changes.deleteDateOverride(facts),
  },
  // The route answers nothing when it deleted: Claude is told so in a word.
  toModel: () => ({ fields: { deleted: true } }),
};
export const deleteDateOverride = parts as Tool;
