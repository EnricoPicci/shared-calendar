import { handler as bookAppointment } from '../../handlers/bookAppointment';
import { handler as cancelAppointment } from '../../handlers/cancelAppointment';
import { handler as changeAppointment } from '../../handlers/changeAppointment';
import { handler as setAppointmentNote } from '../../handlers/updateAppointmentNote';
import type { RouteHandler } from './tool';

// The handlers of the routes that change the calendar, by the name of the tool that stands for
// each (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 1). This is the only module of the
// assistant that imports one of them, and only the confirmation of a proposal imports this
// module (`npm run lint` refuses both imports anywhere else): the functions that read free text
// and ask Claude do not carry the code that changes the calendar.
export const CHANGE_HANDLERS: Readonly<Record<string, RouteHandler>> = {
  book_appointment: bookAppointment,
  cancel_appointment: cancelAppointment,
  change_appointment: changeAppointment,
  set_appointment_note: setAppointmentNote,
};
