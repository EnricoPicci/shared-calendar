import { CALENDAR_LIMITS, LocalDate, overlaps, type DateOverride, type DayChangeSummary, type HoursSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { END_AFTER_START, endsAfterStart, lastsWholeHoursOf, WHOLE_HOURS, hoursInput, hoursOf, namedHours, overrideSubject, presentDay, presentTypes } from './facts';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for PUT /calendar/overrides/{date} (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator gives one date hours of its own, which take the place of what the weekly patterns
// give that date (docs/SHARED_CALENDAR_SPEC.md R-OVR-01). No hours at all closes the day as far as
// the patterns go. It is how time is blocked. It is a change: asked for by Claude it is never run,
// it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5).
// This file reads the day and the types through the handlers of GET /calendar and GET
// /calendar/types (`facts.ts`); the handler of the route that saves is not imported here.
//
// Appointments the new hours would leave outside them, and an overlap with an extra window of the
// date (docs/SHARED_CALENDAR_SPEC.md R-AV-03 and R-AV-01), are the route's to find, under the
// calendar's lock, when the person confirms: an extra window in the way may be deleted by another
// change of the same proposal, before this one is run.

const Input = z
  .object({
    date: LocalDate.describe("The date whose hours are set, a date of the calendar's time zone as YYYY-MM-DD, today or later."),
    windows: z
      .array(z.object(hoursInput).strict().refine(endsAfterStart, END_AFTER_START).refine(lastsWholeHoursOf, WHOLE_HOURS))
      .max(CALENDAR_LIMITS.overrideWindowsPerDate)
      .describe('All the hours the date will have in the place of the weekly patterns, at most 10 stretches that do not overlap. An empty list closes the day.'),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const setDateOverrideDefinition: ToolDefinition = {
  name: 'set_date_override',
  description:
    'Sets the hours of one date, for that day only: they take the place of everything the weekly patterns give that date, and of the hours the date already had of its own. ' +
    'Give all the hours the day must have, those that stay as they are included; an empty list closes the day. Extra windows of the date ("one_off") are not touched by it: they stay open. ' +
    'It is also how time is blocked: read the day with get_calendar, take the blocked time out of its hours, and give what is left. ' +
    'Calling this tool changes nothing by itself: the application shows the person the day as it is and as it would become, with a button to confirm and a button to decline, ' +
    'and saves only when the person presses the confirm button. The calendar refuses, when the person confirms, hours that would leave an appointment outside them, and names those appointments.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'calendar',
};

const byStart = (a: { start: string }, b: { start: string }) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
const sameHours = (a: { start: string; end: string; typeId: string }, b: { start: string; end: string; typeId: string }) => a.start === b.start && a.end === b.end && a.typeId === b.typeId;

const parts: ChangeTool<Input, DayChangeSummary> = {
  definition: setDateOverrideDefinition,
  confirmation: {
    // The facts of new hours for a date: the day as it is (what the patterns give it, or the
    // hours it has of its own, and its extra windows) and the name of each type. Two of the new
    // stretches that overlap, and hours equal to those the date has of its own, are not proposed.
    read: async ({ date, windows: given }, { timeZone }, route) => {
      const windows = [...given].sort(byStart);
      const clash = windows.find((window, index) => index > 0 && overlaps(windows[index - 1]!, window));
      if (clash) {
        return { ok: false, error: 'availability_overlap', message: `The hours given overlap each other at ${clash.start}. Give stretches that do not overlap; one may start when another ends.` };
      }
      const day = await presentDay(route, date, timeZone);
      if (!day.ok) return day;
      const present = await presentTypes(route);
      if (!present.ok) return present;
      const then: HoursSummary[] = [];
      for (const window of windows) {
        const named = hoursOf(window, present.types);
        if (!named.ok) return named;
        then.push(named.hours);
      }
      const base = day.windows.filter((window) => window.source !== 'one_off');
      if (day.hasOverride && base.length === windows.length && base.every((window, index) => sameHours(window, windows[index]!))) {
        return { ok: false, error: 'override_unchanged', message: `${date} already has exactly these hours of its own: there is nothing to change.` };
      }
      return {
        ok: true,
        call: { routeKey: 'PUT /calendar/overrides/{date}', path: `/calendar/overrides/${date}`, pathParameters: { date }, body: { windows } },
        subjects: [overrideSubject(date)],
        facts: {
          date,
          now: { from: day.hasOverride ? 'own' : 'patterns', windows: base.map(namedHours) },
          then: { from: 'own', windows: then },
          extras: day.windows.filter((window) => window.source === 'one_off').map(namedHours),
        },
      };
    },
    summary: (texts, facts) => texts.changes.setDateOverride(facts),
  },
  // The date and its own hours as the calendar now holds them.
  toModel: (body) => {
    const { date, windows } = body as DateOverride;
    return { fields: { date, hoursOfItsOwn: windows.map(({ start, end }) => ({ start, end })) } };
  },
};
export const setDateOverride = parts as Tool;
