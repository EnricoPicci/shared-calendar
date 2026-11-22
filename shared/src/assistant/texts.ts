import type { ApiErrorCode } from '../api';
import type { AssistantLanguage } from './languages';
import { ASSISTANT_TEXTS_EN } from './texts.en';
import { ASSISTANT_TEXTS_IT } from './texts.it';

// The three codes that stop the assistant without anything being wrong with the person's request
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1).
export type AssistantCannotAnswerCode = Extract<
  ApiErrorCode,
  'assistant_limit_reached' | 'assistant_budget_reached' | 'assistant_unavailable'
>;

// The texts the server and the screen say themselves, never the model: one object of this type
// per language, so that a language with a text missing does not compile. A text that carries a
// value is a function of that value.
export type AssistantTexts = {
  // What the person reads where the answer would have been, by the error code of the route
  // (docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1). None promises a moment the server cannot
  // know, such as when a spending limit is raised.
  cannotAnswer: Record<AssistantCannotAnswerCode, string>;
  // The notice after a proposal is declined, or dropped because the person wrote instead.
  nothingChanged: string;
  // Added to an answer that reached the model's output limit (docs/CONVERSATIONAL_ARCHITECTURE.md
  // section 7.4).
  answerCutShort: string;
  // Said when one message has used all its requests to Claude
  // (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.4).
  tooManySteps: string;
  // Said when Anthropic's safety filters refuse to answer; the conversation is then ended
  // (docs/CONVERSATIONAL_ARCHITECTURE.md section 7.4).
  refused: string;
  // Said when the conversation can take no more messages.
  conversationFull: string;
  // The opening words of a proposal's question, for the number of changes it lists.
  proposalQuestion: (changes: number) => string;
  // The labels of a proposal's two buttons.
  confirmLabel: string;
  declineLabel: string;
  // What a proposal says of each change it holds, one text per kind of change: the server's own
  // words for what will be done, filled with the facts the server read
  // (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 2).
  changes: {
    bookAppointment: (booking: BookingSummary) => string;
    cancelAppointment: (appointment: AppointmentSummary) => string;
    changeAppointment: (move: MoveSummary) => string;
    setAppointmentNote: (change: NoteSummary) => string;
    updateSettings: (change: SettingsSummary) => string;
    createType: (type: { name: string }) => string;
    renameType: (rename: { from: string; to: string }) => string;
    deleteType: (type: { name: string }) => string;
  };
  // The line of progress of a step that has none of its own.
  working: string;
  // The line of progress after a read, by what was read: the screen shows it while the next step
  // is asked for.
  reading: Record<AssistantReadKind, string>;
};

// What the proposal of a booking shows: the day as a local date, the two wall-clock times, the
// name of the type the slot belongs to and the note, as they will be sent to the route.
// `secondTime` marks the second of the two times a clock shows the same hour on the night the
// clocks go back. `username` is the User the appointment is for when the Administrator books it,
// and null when a User books for themself: the sentence then names nobody.
export type BookingSummary = { date: string; start: string; end: string; type: string; note: string | null; secondTime: boolean; username: string | null };

// An existing appointment as a proposal names it: its day as a local date, its two wall-clock
// times and the name of its type. `username` is whose it is, given only when the person asked is
// not its owner: the Administrator. For a User, whose proposals are about their own appointments,
// it is null and the sentence names nobody.
export type AppointmentSummary = { date: string; start: string; end: string; type: string; username: string | null };

// What the proposal of a move shows: the appointment as it is, and the slot it would go to, with
// the type of the hours that slot lies in, which may differ from the appointment's. `secondTime`
// is as in a booking.
export type MoveSummary = { appointment: AppointmentSummary; to: { date: string; start: string; end: string; type: string; secondTime: boolean } };

// What the proposal of a note shows: the appointment, the note as it would become (null: no note)
// and the note it has, which the new one replaces.
export type NoteSummary = { appointment: AppointmentSummary; note: string | null; previous: string | null };

// The settings the Administrator can change (docs/SHARED_CALENDAR_SPEC.md section 9), in the order
// the settings page lists them.
export const ASSISTANT_SETTING_NAMES = ['cancellationNoticeHours', 'minBookingNoticeHours', 'bookingHorizonDays', 'maxFutureAppointmentsPerUser'] as const;
export type AssistantSettingName = (typeof ASSISTANT_SETTING_NAMES)[number];

// What the proposal of a change to the settings shows: each setting that would change, with its
// value as it is and as it would become, and no setting that stays as it is. A value is a number
// of hours, of days or of appointments; null is "no limit", which only the highest number of
// future appointments can be.
export type SettingChange = { setting: AssistantSettingName; from: number | null; to: number | null };
export type SettingsSummary = { changes: SettingChange[] };

// What a read tool of the assistant looks at: each kind has its own line of progress
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.1).
export const ASSISTANT_READ_KINDS = ['settings', 'types', 'calendar', 'appointments', 'users', 'patterns'] as const;
export type AssistantReadKind = (typeof ASSISTANT_READ_KINDS)[number];

const TEXTS: Record<AssistantLanguage, AssistantTexts> = { en: ASSISTANT_TEXTS_EN, it: ASSISTANT_TEXTS_IT };

/** The fixed texts of one language. */
export function assistantTexts(language: AssistantLanguage): AssistantTexts {
  return TEXTS[language];
}
