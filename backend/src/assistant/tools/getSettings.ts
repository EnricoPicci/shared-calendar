import type { CalendarSettings } from '@shared-calendar/shared';
import { z } from 'zod';
import { handler } from '../../handlers/getCalendarSettings';
import type { Tool, ToolDefinition } from './tool';

// The tool for GET /calendar/settings (docs/CONVERSATIONAL_ARCHITECTURE.md section 3): the rules
// every booking and cancellation follows. Both roles; the route answers them alike.

const Input = z.object({}).strict();

export const getSettingsDefinition: ToolDefinition = {
  name: 'get_settings',
  description:
    "Reads the calendar's settings: the time zone, how many hours before its start an appointment can still be cancelled or moved by a User, " +
    'how many hours ahead of now a User must book, how many days ahead bookings are open to Users, and how many future appointments one User may hold at a time ' +
    '(null means no limit). Use it when the person asks about these rules, or to explain why a booking or a cancellation was refused.',
  kind: 'read',
  roles: ['admin', 'user'],
  input: () => Input,
  reads: 'settings',
};

const parts: Tool<z.infer<typeof Input>> = {
  definition: getSettingsDefinition,
  toHandler: { handler, request: () => ({ routeKey: 'GET /calendar/settings', path: '/calendar/settings' }) },
  // Who saved the settings last, and when, is not something an answer needs.
  toModel: (body) => {
    const settings = body as CalendarSettings;
    return {
      fields: {
        timeZone: settings.timeZone,
        cancellationNoticeHours: settings.cancellationNoticeHours,
        minBookingNoticeHours: settings.minBookingNoticeHours,
        bookingHorizonDays: settings.bookingHorizonDays,
        maxFutureAppointmentsPerUser: settings.maxFutureAppointmentsPerUser,
      },
    };
  },
};
export const getSettings = parts as Tool;
