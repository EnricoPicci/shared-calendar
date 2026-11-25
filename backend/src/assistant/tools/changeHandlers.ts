import { handler as bookAppointment } from '../../handlers/bookAppointment';
import { handler as cancelAppointment } from '../../handlers/cancelAppointment';
import { handler as changeAppointment } from '../../handlers/changeAppointment';
import { handler as createType } from '../../handlers/createAvailabilityType';
import { handler as createOneOffWindow } from '../../handlers/createOneOffWindow';
import { handler as createPattern } from '../../handlers/createPattern';
import { handler as deleteType } from '../../handlers/deleteAvailabilityType';
import { handler as deleteOneOffWindow } from '../../handlers/deleteOneOffWindow';
import { handler as deleteDateOverride } from '../../handlers/deleteOverride';
import { handler as deletePattern } from '../../handlers/deletePattern';
import { handler as editType } from '../../handlers/renameAvailabilityType';
import { handler as sendCalendarMail } from '../../handlers/sendCalendarMail';
import { handler as setDateOverride } from '../../handlers/setOverride';
import { handler as setAppointmentNote } from '../../handlers/updateAppointmentNote';
import { handler as updateSettings } from '../../handlers/updateCalendarSettings';
import { handler as updatePattern } from '../../handlers/updatePattern';
import type { RouteHandler } from './tool';

// The handlers of the routes that change the calendar, and of the one that sends a mail, by the
// name of the tool that stands for each (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule
// 1). This is the only module of the assistant that imports one of them, and only the
// confirmation of a proposal imports this module (`npm run lint` refuses both imports anywhere
// else): the functions that read free text and ask Claude carry neither the code that changes the
// calendar nor the code that starts the mailer.
export const CHANGE_HANDLERS: Readonly<Record<string, RouteHandler>> = {
  book_appointment: bookAppointment,
  cancel_appointment: cancelAppointment,
  change_appointment: changeAppointment,
  set_appointment_note: setAppointmentNote,
  send_calendar_mail: sendCalendarMail,
  update_settings: updateSettings,
  create_type: createType,
  edit_type: editType,
  delete_type: deleteType,
  create_pattern: createPattern,
  update_pattern: updatePattern,
  delete_pattern: deletePattern,
  set_date_override: setDateOverride,
  delete_date_override: deleteDateOverride,
  create_one_off_window: createOneOffWindow,
  delete_one_off_window: deleteOneOffWindow,
};
