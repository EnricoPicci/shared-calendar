import { weekdayOf } from '../calendar/time';
import type { AppointmentSummary, AssistantSettingName, AssistantTexts, DayHours, HoursSummary, OverCapacity, PatternSummary, SettingChange, TypeEditSummary } from './texts';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A local date written out in full: "Tuesday 24 November 2026".
const fullDate = (date: string) => `${WEEKDAYS[weekdayOf(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

// An existing appointment as a sentence names it: "the appointment of alice on Tuesday 24 November
// 2026, from 10:00 to 11:00 (Visit)", without "of alice" when it is the person's own.
const theAppointment = ({ date, start, end, type, username }: AppointmentSummary) =>
  `the appointment${username === null ? '' : ` of ${username}`} on ${fullDate(date)}, from ${start} to ${end} (${type})`;

// A setting in the words of its label on the settings page, and what it counts, one and several.
const SETTINGS: Record<AssistantSettingName, { name: string; one: string; many: string }> = {
  cancellationNoticeHours: { name: 'Cancellation notice', one: 'hour', many: 'hours' },
  minBookingNoticeHours: { name: 'Minimum booking notice', one: 'hour', many: 'hours' },
  bookingHorizonDays: { name: 'Booking horizon', one: 'day', many: 'days' },
  maxFutureAppointmentsPerUser: { name: 'Maximum upcoming appointments per person', one: 'appointment', many: 'appointments' },
};

// One setting as it is and as it would become: "Cancellation notice: from 24 hours to 72 hours."
const settingChange = ({ setting, from, to }: SettingChange) => {
  const { name, one, many } = SETTINGS[setting];
  const value = (count: number | null) => (count === null ? 'no limit' : `${count} ${count === 1 ? one : many}`);
  return `${name}: from ${value(from)} to ${value(to)}.`;
};

// A weekly pattern as a sentence names it: "every Tuesday, from 09:00 to 12:00 (Visit), valid from
// Tuesday 1 December 2026, with no end".
const thePattern = ({ weekday, start, end, type, validFrom, validUntil }: PatternSummary) =>
  `every ${WEEKDAYS[weekday - 1]}, from ${start} to ${end} (${type}), valid from ${fullDate(validFrom)}` + (validUntil === null ? ', with no end' : ` until ${fullDate(validUntil)}`);

// Some hours in a list: "09:00–12:00 (Visit)".
const hours = ({ start, end, type }: HoursSummary) => `${start}–${end} (${type})`;

// Where the hours of a day come from, in the words of the page of a single date.
const FROM_PATTERNS = 'from the weekly patterns';
const OWN_HOURS = "this day's own hours";

// The hours of a day, one after the other. A day the weekly patterns give nothing to has no hours.
// A day whose own hours are none is not available.
const dayHours = ({ from, windows }: DayHours) => (windows.length > 0 ? windows.map(hours).join(', ') : from === 'own' ? 'not available' : 'no hours');

// The day as it is, with where its hours come from, and as it would become. What it would become
// says where the hours come from only when the day goes back to the weekly patterns.
const dayNow = (day: DayHours) => `As it is now (${day.from === 'own' ? OWN_HOURS : FROM_PATTERNS}): ${dayHours(day)}.`;
const dayThen = (day: DayHours) => `As it would become${day.from === 'own' ? '' : ` (${FROM_PATTERNS})`}: ${dayHours(day)}.`;

// The extra windows of the day, which a change to the day's own hours leaves as they are.
const extraWindows = (extras: HoursSummary[]) =>
  extras.length === 0 ? '' : extras.length === 1 ? ` The extra window ${hours(extras[0]!)} of this day is not changed.` : ` The extra windows ${extras.map(hours).join(', ')} of this day are not changed.`;

// A booking or a move over the capacity of its type: " Over the capacity: it will hold 4 people,
// its capacity is 3." Nothing when it stays within it.
const overCapacity = (over: OverCapacity | null | undefined) => (over === null || over === undefined ? '' : ` Over the capacity: it will hold ${over.people} people, its capacity is ${over.capacity}.`);

// An edited type: a new name alone keeps the words of a rename; a capacity says both numbers.
const editedType = ({ name, newName, capacity, bookedAbove }: TypeEditSummary) => {
  const kept = bookedAbove ? ' Nobody already booked is cancelled: where more people are booked than the new capacity, nobody else can book until some leave.' : '';
  if (capacity === null) return `Rename the appointment type "${name}" to "${newName ?? name}".`;
  const parts = [...(newName === null ? [] : [`name to "${newName}"`]), `capacity from ${capacity.from} to ${capacity.to}`];
  return `Change the appointment type "${name}": ${parts.join(', ')}.${kept}`;
};

// The fixed texts in English. The three sentences of `cannotAnswer` are those of
// docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1, word for word.
export const ASSISTANT_TEXTS_EN: AssistantTexts = {
  cannotAnswer: {
    assistant_limit_reached:
      "You have reached today's limit of messages to the assistant. It will be available again tomorrow. Everything can still be done from the other pages.",
    assistant_budget_reached:
      'The assistant has reached its spending limit and cannot answer for now. Your calendar is not affected: everything can still be done from the other pages.',
    assistant_unavailable:
      'The assistant is not available at the moment. Please try again in a little while. Everything can still be done from the other pages.',
  },
  nothingChanged: 'Nothing was changed.',
  answerCutShort: 'The answer was cut short.',
  tooManySteps:
    'The assistant could not complete this request. Please try putting it differently, for example by asking for one thing at a time.',
  refused: 'The assistant cannot answer this request. This conversation has ended: your next message will start a new one.',
  conversationFull: 'This conversation is full. To continue, start a new one.',
  proposalQuestion: (changes) => (changes === 1 ? 'Make this change?' : `Make these ${changes} changes?`),
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  changes: {
    bookAppointment: ({ date, start, end, type, note, secondTime, username, over }) =>
      `Book an appointment${username === null ? '' : ` for ${username}`} on ${fullDate(date)}, from ${start} to ${end} (${type}).` +
      (secondTime ? ` This is the second ${start} of that night: the clocks go back.` : '') +
      overCapacity(over) +
      (note === null ? '' : ` Note: "${note}"`),
    cancelAppointment: (appointment) => `Cancel ${theAppointment(appointment)}.`,
    changeAppointment: ({ appointment, to }) =>
      `Move ${theAppointment(appointment)}, to ${fullDate(to.date)}, from ${to.start} to ${to.end} (${to.type}).` +
      (to.secondTime ? ` This is the second ${to.start} of that night: the clocks go back.` : '') +
      overCapacity(to.over),
    setAppointmentNote: ({ appointment, note, previous }) =>
      note === null
        ? `Remove the note of ${theAppointment(appointment)}. The note is: "${previous ?? ''}"`
        : `Set the note of ${theAppointment(appointment)}, to: "${note}"` + (previous === null ? '' : ` It replaces the note: "${previous}"`),
    updateSettings: ({ changes }) => ['Change the settings.', ...changes.map(settingChange)].join(' '),
    createType: ({ name, capacity }) => `Create the appointment type "${name}"${capacity > 1 ? `, for ${capacity} people at the same time` : ''}.`,
    editType: editedType,
    deleteType: ({ name }) => `Delete the appointment type "${name}".`,
    createPattern: (pattern) => `Create a weekly pattern: ${thePattern(pattern)}.`,
    updatePattern: ({ from, to }) => `Change a weekly pattern. As it is now: ${thePattern(from)}. As it would become: ${thePattern(to)}.`,
    deletePattern: (pattern) => `Delete the weekly pattern: ${thePattern(pattern)}.`,
    setDateOverride: ({ date, now, then, extras }) => `Set the hours of ${fullDate(date)}, for this day only. ${dayNow(now)} ${dayThen(then)}${extraWindows(extras)}`,
    deleteDateOverride: ({ date, now, then, extras }) => `Go back to the weekly patterns on ${fullDate(date)}. ${dayNow(now)} ${dayThen(then)}${extraWindows(extras)}`,
    createOneOffWindow: ({ date, start, end, type }) => `Create an extra window on ${fullDate(date)}, from ${start} to ${end} (${type}).`,
    deleteOneOffWindow: ({ date, start, end, type }) => `Delete the extra window of ${fullDate(date)}, from ${start} to ${end} (${type}).`,
  },
  working: 'Working…',
  reading: {
    settings: "Looking at the calendar's settings…",
    types: 'Looking at the appointment types…',
    calendar: 'Looking at the calendar…',
    appointments: 'Looking at the appointments…',
    users: 'Looking at the users…',
    patterns: 'Looking at the weekly patterns…',
  },
};
