import { ASSISTANT_SETTING_NAMES, SETTINGS_RANGES, type CalendarSettings, type SettingChange, type SettingsSummary } from '@shared-calendar/shared';
import { z } from 'zod';
import { presentSettings, SETTINGS_SUBJECT } from './facts';
import { settingsForModel } from './result';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for PUT /calendar/settings (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the
// Administrator changes the rules every booking and cancellation follows. It is a change: asked
// for by Claude it is never run, it becomes a proposal the person confirms
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). The route takes the four settings together
// (docs/SHARED_CALENDAR_SPEC.md R-SET-02); the tool takes only those to change, and this file
// reads the others through the handler of GET /calendar/settings (`facts.ts`). The handler of the
// route that saves is not imported here.

// A whole number within the range the route accepts for the setting.
const within = ({ min, max }: { min: number; max: number }) => z.number().int().min(min).max(max);

const Input = z
  .object({
    cancellationNoticeHours: within(SETTINGS_RANGES.cancellationNoticeHours)
      .optional()
      .describe('Cancellation notice: how many hours before its start a User can still cancel or move an appointment. A whole number from 0 to 720.'),
    minBookingNoticeHours: within(SETTINGS_RANGES.minBookingNoticeHours)
      .optional()
      .describe('Minimum booking notice: how many hours ahead of now a User must book. A whole number from 0 to 720.'),
    bookingHorizonDays: within(SETTINGS_RANGES.bookingHorizonDays).optional().describe('Booking horizon: how many days ahead bookings are open to Users. A whole number from 1 to 365.'),
    maxFutureAppointmentsPerUser: within(SETTINGS_RANGES.maxFutureAppointmentsPerUser)
      .nullable()
      .optional()
      .describe('Maximum upcoming appointments per person: how many future appointments one User may hold at a time. A whole number from 1 to 100, or null for no limit.'),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, { message: 'give at least one setting to change' });
type Input = z.infer<typeof Input>;

export const updateSettingsDefinition: ToolDefinition = {
  name: 'update_settings',
  description:
    "Changes the calendar's settings. Give only the settings the person wants changed, each with its new value: the others stay as they are. " +
    'Calling this tool changes nothing by itself: the application shows the person each setting as it is and as it would become, with a button to confirm and a button to decline, ' +
    'and saves only when the person presses the confirm button. To change several settings, give them all in one call. ' +
    "The calendar's time zone is not a setting that can be changed, here or in the web pages: it is set when the calendar is installed.",
  kind: 'change',
  roles: ['admin'],
  input: () => Input,
  reads: 'settings',
};

const parts: ChangeTool<Input, SettingsSummary> = {
  definition: updateSettingsDefinition,
  confirmation: {
    // The facts of a change to the settings: the four values as they are. The route is sent all
    // four, those not named as they were read; the proposal shows only those that would change.
    read: async (input, _context, route) => {
      const present = await presentSettings(route);
      if (!present.ok) return present;
      const { settings } = present;
      const changes: SettingChange[] = [];
      for (const setting of ASSISTANT_SETTING_NAMES) {
        const to = input[setting];
        if (to !== undefined && to !== settings[setting]) changes.push({ setting, from: settings[setting], to });
      }
      if (changes.length === 0) {
        return { ok: false, error: 'settings_unchanged', message: 'The settings already have exactly these values: there is nothing to change.' };
      }
      const body = Object.fromEntries(ASSISTANT_SETTING_NAMES.map((setting) => [setting, input[setting] === undefined ? settings[setting] : input[setting]]));
      return { ok: true, call: { routeKey: 'PUT /calendar/settings', path: '/calendar/settings', body }, subjects: [SETTINGS_SUBJECT], facts: { changes } };
    },
    summary: (texts, facts) => texts.changes.updateSettings(facts),
  },
  // The settings as the calendar now holds them.
  toModel: (body) => ({ fields: { settings: settingsForModel(body as CalendarSettings) } }),
};
export const updateSettings = parts as Tool;
