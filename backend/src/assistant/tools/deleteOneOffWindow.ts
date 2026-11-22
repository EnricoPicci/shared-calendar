import { LocalDate, Ulid, type WindowSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { namedHours, presentDay, windowSubject } from './facts';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for DELETE /calendar/windows/{windowId} (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 3): the Administrator deletes an extra window. It is a change: asked for by Claude it is never
// run, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5). The calendar has no route that reads one window or lists them all
// (docs/SHARED_CALENDAR_SPEC.md section 11.1, the notes on the route design): the window is looked
// for in the day it is on, read through the handler of GET /calendar (`facts.ts`), so the tool
// takes the date beside the id. The handler of the route that deletes is not imported here.
// Appointments the deletion would leave outside the open hours (docs/SHARED_CALENDAR_SPEC.md
// R-AV-03) are the route's to find when the person confirms.

const Input = z
  .object({
    date: LocalDate.describe('The date the window is on, as YYYY-MM-DD: the date of the day get_calendar showed it in.'),
    windowId: Ulid.describe('The id of the extra window to delete, as get_calendar gave it for a window whose "source" is "one_off". Never a guess.'),
  })
  .strict();
type Input = z.infer<typeof Input>;

export const deleteOneOffWindowDefinition: ToolDefinition = {
  name: 'delete_one_off_window',
  description:
    'Deletes an extra window: hours that were added on one date. Give the date and the id of the window, which get_calendar gives for the windows whose "source" is "one_off". ' +
    'An extra window cannot be changed: to change its hours, delete it and create another, both in the same answer, the deletion first. ' +
    'Calling this tool deletes nothing by itself: the application shows the person the window that would be deleted, with a button to confirm and a button to decline, ' +
    'and deletes it only when the person presses the confirm button. The calendar refuses, when the person confirms, to delete a window while an appointment that has not ended lies in its hours.',
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'calendar',
};

const parts: ChangeTool<Input, WindowSummary> = {
  definition: deleteOneOffWindowDefinition,
  confirmation: {
    // The facts of a deletion: the extra window the id stands for among those of its date, with
    // its hours and the name of its type. The route takes no body.
    read: async ({ date, windowId }, { timeZone }, route) => {
      const day = await presentDay(route, date, timeZone);
      if (!day.ok) return day;
      const window = day.windows.find((candidate) => candidate.source === 'one_off' && candidate.sourceId === windowId);
      if (!window) {
        return {
          ok: false,
          error: 'window_not_found',
          message: `There is no extra window with this id on ${date}. Never guess an id: use get_calendar for that day, and take the id of the window whose "source" is "one_off".`,
        };
      }
      return {
        ok: true,
        call: { routeKey: 'DELETE /calendar/windows/{windowId}', path: `/calendar/windows/${windowId}`, pathParameters: { windowId } },
        subjects: [windowSubject(windowId)],
        facts: { date, ...namedHours(window) },
      };
    },
    summary: (texts, facts) => texts.changes.deleteOneOffWindow(facts),
  },
  // The route answers nothing when it deleted: Claude is told so in a word.
  toModel: () => ({ fields: { deleted: true } }),
};
export const deleteOneOffWindow = parts as Tool;
