import { weekdayOf } from '../calendar/time';
import type { AssistantTexts } from './texts';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// A local date written out in full: "Tuesday 24 November 2026".
const fullDate = (date: string) => `${WEEKDAYS[weekdayOf(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

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
    bookAppointment: ({ date, start, end, type, note, secondTime }) =>
      `Book an appointment on ${fullDate(date)}, from ${start} to ${end} (${type}).` +
      (secondTime ? ` This is the second ${start} of that night: the clocks go back.` : '') +
      (note === null ? '' : ` Note: "${note}"`),
  },
  working: 'Working…',
  reading: {
    settings: "Looking at the calendar's settings…",
    types: 'Looking at the appointment types…',
    calendar: 'Looking at the calendar…',
    appointments: 'Looking at the appointments…',
  },
};
