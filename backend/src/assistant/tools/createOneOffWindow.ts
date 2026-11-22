import { LocalDate, type OneOffWindow, type WindowSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { END_AFTER_START, endsAfterStart, hoursInput, hoursOf, newWindowSubject, presentDay, presentTypes } from './facts';
import { windowForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /calendar/windows (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator adds an extra window, hours open on one date on top of whatever else that date
// has (docs/SHARED_CALENDAR_SPEC.md R-ONE-01). It is a change: asked for by Claude it is never
// run, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5). This file reads the day and the types through the handlers of GET /calendar and GET
// /calendar/types (`facts.ts`); the handler of the route that creates is not imported here.
//
// Whether the window overlaps other hours of the date, and whether the date already has its ten
// extra windows (docs/SHARED_CALENDAR_SPEC.md R-AV-01 and R-ONE-03), are the route's to find when
// the person confirms: a window in the way may be deleted by another change of the same proposal.

const Input = z
  .object({ date: LocalDate.describe("The date of the window, a date of the calendar's time zone as YYYY-MM-DD, today or later."), ...hoursInput })
  .strict()
  .refine(endsAfterStart, END_AFTER_START);
type Input = z.infer<typeof Input>;

export const createOneOffWindowDefinition: ToolDefinition = {
  name: 'create_one_off_window',
  description:
    'Adds an extra window: hours open for appointments on one date only, on top of what the weekly patterns or the hours of that date give. Use it to open a day or some hours once. ' +
    'Calling this tool creates nothing by itself: the application shows the person the window that would be created, with a button to confirm and a button to decline, ' +
    'and creates it only when the person presses the confirm button. The calendar refuses, when the person confirms, a window that overlaps other open hours of that date.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'calendar',
};

const parts: ChangeTool<Input, WindowSummary> = {
  definition: createOneOffWindowDefinition,
  confirmation: {
    // The facts of a new extra window: that its date has not passed, which reading the day tells,
    // and the name of its type.
    read: async ({ date, start, end, typeId }, { timeZone }, route) => {
      const day = await presentDay(route, date, timeZone);
      if (!day.ok) return day;
      const present = await presentTypes(route);
      if (!present.ok) return present;
      const named = hoursOf({ start, end, typeId }, present.types);
      if (!named.ok) return named;
      return {
        ok: true,
        call: { routeKey: 'POST /calendar/windows', path: '/calendar/windows', body: { date, start, end, typeId } },
        subjects: [newWindowSubject({ date, start, end })],
        facts: { date, ...named.hours },
      };
    },
    summary: (texts, facts) => texts.changes.createOneOffWindow(facts),
  },
  // The window as the calendar now holds it, with the id a deletion will name.
  toModel: (body) => ({ fields: { window: windowForModel(body as OneOffWindow) } }),
};
export const createOneOffWindow = parts as Tool;
