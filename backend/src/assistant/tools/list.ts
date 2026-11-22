import { bookAppointment, bookAppointmentDefinition } from './bookAppointment';
import { cancelAppointment, cancelAppointmentDefinition } from './cancelAppointment';
import { changeAppointment, changeAppointmentDefinition } from './changeAppointment';
import { createType, createTypeDefinition } from './createType';
import { deleteType, deleteTypeDefinition } from './deleteType';
import { getCalendar, getCalendarDefinition } from './getCalendar';
import { getSettings, getSettingsDefinition } from './getSettings';
import { listAppointments, listAppointmentsDefinition } from './listAppointments';
import { listPatterns, listPatternsDefinition } from './listPatterns';
import { listTypes, listTypesDefinition } from './listTypes';
import { listUsers, listUsersDefinition } from './listUsers';
import { renameType, renameTypeDefinition } from './renameType';
import { setAppointmentNote, setAppointmentNoteDefinition } from './setAppointmentNote';
import type { Tool, ToolDefinition } from './tool';
import { updateSettings, updateSettingsDefinition } from './updateSettings';

// The tools of the assistant (docs/CONVERSATIONAL_ARCHITECTURE.md section 3), in the order Claude
// is given them. The order is part of what a conversation started with: changing it, like changing
// a description or a schema, ends the conversations in progress.

// The definitions alone, for the functions that never run a tool: they need them to work out the
// mark of a conversation and its line of progress, and must not carry the calendar's handlers.
export const DEFINITIONS: readonly ToolDefinition[] = [
  getSettingsDefinition,
  listTypesDefinition,
  getCalendarDefinition,
  listAppointmentsDefinition,
  bookAppointmentDefinition,
  cancelAppointmentDefinition,
  changeAppointmentDefinition,
  setAppointmentNoteDefinition,
  listUsersDefinition,
  listPatternsDefinition,
  updateSettingsDefinition,
  createTypeDefinition,
  renameTypeDefinition,
  deleteTypeDefinition,
];

// The tools whole, for the functions that run the reads and build the proposals. A tool that
// changes the calendar is here without the handler of its route, which is in `changeHandlers.ts`.
export const TOOLS: readonly Tool[] = [
  getSettings,
  listTypes,
  getCalendar,
  listAppointments,
  bookAppointment,
  cancelAppointment,
  changeAppointment,
  setAppointmentNote,
  listUsers,
  listPatterns,
  updateSettings,
  createType,
  renameType,
  deleteType,
];
