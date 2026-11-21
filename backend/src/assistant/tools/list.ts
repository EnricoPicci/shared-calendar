import { getCalendar, getCalendarDefinition } from './getCalendar';
import { getSettings, getSettingsDefinition } from './getSettings';
import { listAppointments, listAppointmentsDefinition } from './listAppointments';
import { listTypes, listTypesDefinition } from './listTypes';
import type { Tool, ToolDefinition } from './tool';

// The tools of the assistant (docs/CONVERSATIONAL_ARCHITECTURE.md section 3), in the order Claude
// is given them. The order is part of what a conversation started with: changing it, like changing
// a description or a schema, ends the conversations in progress.

// The definitions alone, for the functions that never run a tool: they need them to work out the
// mark of a conversation and its line of progress, and must not carry the calendar's handlers.
export const DEFINITIONS: readonly ToolDefinition[] = [getSettingsDefinition, listTypesDefinition, getCalendarDefinition, listAppointmentsDefinition];

// The tools whole, for the functions that run them.
export const TOOLS: readonly Tool[] = [getSettings, listTypes, getCalendar, listAppointments];
