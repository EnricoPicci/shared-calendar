import {
  ASSISTANT_LIMITS,
  assistantTexts,
  DEFAULT_ASSISTANT_LANGUAGE,
  type AssistantLanguage,
  type AssistantMessage,
  type AssistantProposal,
  type AssistantProposalAction,
  type AssistantReply,
  type AssistantStatus,
  type Role,
} from '@shared-calendar/shared';
import type {
  AssistantConfirmFailureReason,
  AssistantContinueFailureReason,
  AssistantDeclineFailureReason,
  AssistantEndFailureReason,
  AssistantLoadFailureReason,
  AssistantSendFailureReason,
} from '../services/assistant.types';
import { failureText } from './texts';
import { PAGE_TEXTS_EN } from '../texts/texts.en';

// Pure functions for the assistant's panel (docs/FRONTEND_ARCHITECTURE.md section 5.1): the
// conversation put together from the server's replies and made ready to draw, the proposal with
// what became of each of its changes, the line that counts the messages left, and what the panel
// says and does when a call fails, reason by reason.

// The longest message a person can send, for the field's own limit.
export const MESSAGE_LENGTH = ASSISTANT_LIMITS.messageLength;

// How many times in a row the panel asks for the next step of one exchange before it gives up:
// the requests to Claude one message may take (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.4).
export const STEPS_AT_MOST = ASSISTANT_LIMITS.modelRequestsPerMessage;

// Said when an exchange is still not over after that many steps.
export const COULD_NOT_FINISH = 'The assistant could not finish. Please ask again, in other words.';

// The progress line while a call is away and the server named no activity.
export const NO_ACTIVITY = '…';

// One message ready to draw: who wrote it, in words, beside its kind, so that the three kinds
// are told apart without colour.
export type ShownMessage = { seq: number; from: AssistantMessage['from']; who: string; text: string };

const WHO: Record<AssistantMessage['from'], string> = { person: 'You', assistant: 'Assistant', notice: 'Notice' };

export function messageRows(messages: readonly AssistantMessage[]): ShownMessage[] {
  return messages.map(({ seq, from, text }) => ({ seq, from, who: WHO[from], text }));
}

// The conversation with the messages of one more reply: a message already held (its `seq`
// tells) is not added again, and the order is that of `seq`.
export function joined(held: readonly AssistantMessage[], added: readonly AssistantMessage[]): AssistantMessage[] {
  const known = new Set(held.map((message) => message.seq));
  return [...held, ...added.filter((message) => !known.has(message.seq))].sort((a, b) => a.seq - b.seq);
}

// The text of the last message the person wrote, or null when there is none.
export function lastOfPerson(messages: readonly AssistantMessage[]): string | null {
  return messages.filter((message) => message.from === 'person').at(-1)?.text ?? null;
}

// What a reply added that a screen reader should say: the assistant's texts and the server's
// notices among the messages not yet held, or else the line of progress. Null when there is
// neither.
export function newsOf(held: readonly AssistantMessage[], reply: AssistantReply): string | null {
  const known = new Set(held.map((message) => message.seq));
  const said = reply.messages.filter((message) => message.from !== 'person' && !known.has(message.seq)).map((message) => message.text);
  return said.length > 0 ? said.join('\n') : reply.activity;
}

// A proposal ready to draw. `outcome` is what became of a change, in words, empty while the
// proposal waits. `buttons` says whether the two buttons are offered, shown but out of use
// while a call is away, or gone: a proposal that no longer waits for the person has none.
export type ShownProposal = {
  question: string;
  confirmLabel: string;
  declineLabel: string;
  actions: readonly { summary: string; outcome: string }[];
  buttons: 'offered' | 'disabled' | 'none';
};

// What became of one change. A refused change carries the error code of its route
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 6): it is said with the sentence the other
// screens have for that code, for the role of the person, so that the Administrator reads that
// the User booked for is busy (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12). A full time is said to
// the Administrator without "The calendar has been refreshed": the panel reads no calendar; the
// conversation offers to book over the capacity (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13).
function outcomeWords(action: AssistantProposalAction, role: Role): string {
  switch (action.outcome) {
    case null:
      return '';
    case 'done':
      return 'Done';
    case 'refused':
      return `Not done. ${role === 'admin' && action.error === 'slot_taken' ? PAGE_TEXTS_EN.week.fullForAdmin : failureText(PAGE_TEXTS_EN.failures, action.error, undefined, role)}`;
    case 'unknown':
      return 'It is not known whether this was done. Please check the calendar.';
  }
}

export function proposalShown(proposal: AssistantProposal | null, status: AssistantStatus, away: boolean, role: Role): ShownProposal | null {
  if (proposal === null) return null;
  return {
    question: proposal.question,
    confirmLabel: proposal.confirmLabel,
    declineLabel: proposal.declineLabel,
    actions: proposal.actions.map((action) => ({ summary: action.summary, outcome: outcomeWords(action, role) })),
    buttons: status !== 'awaiting_confirmation' ? 'none' : away ? 'disabled' : 'offered',
  };
}

// Whether a reply shows a change that was made: the screens then show stale data.
export function changeMade(reply: AssistantReply): boolean {
  return reply.proposal !== null && reply.proposal.actions.some((action) => action.outcome === 'done');
}

// The messages the person may still send today, as the line by the field says it.
export function remainingText(left: number): string {
  if (left <= 0) return 'No messages left today';
  return left === 1 ? '1 message left today' : `${left} messages left today`;
}

// The sentence for the day's limit, also said when a reply counts no message left.
export function dayLimitText(language: AssistantLanguage | null): string {
  return assistantTexts(language ?? DEFAULT_ASSISTANT_LANGUAGE).cannotAnswer.assistant_limit_reached;
}

// What the panel does about a call that failed.
// - `say` is the sentence of the failure line.
// - `then` is what follows: nothing; the conversation read again without going on with the
//   exchange (`read`); or read again and, when it waits for a step, continued (`read-on`).
// - `stop` closes the field: until the page is loaded again (`day`) or until "New
//   conversation" (`full`).
// - `made` says that changes may have been made although no reply shows them: the screens
//   load again.
export type Trouble = { say: string; then: 'nothing' | 'read' | 'read-on'; stop: 'no' | 'day' | 'full'; made: boolean };

const plain = (say: string): Trouble => ({ say, then: 'nothing', stop: 'no', made: false });

// The three reasons for which the assistant cannot answer without anything being wrong with
// the request (docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1): the sentence of shared/, in the
// conversation's language, and in English while there is no conversation.
const cannotAnswer = (code: 'assistant_limit_reached' | 'assistant_budget_reached' | 'assistant_unavailable', language: AssistantLanguage | null) =>
  assistantTexts(language ?? DEFAULT_ASSISTANT_LANGUAGE).cannotAnswer[code];

// Each function below is one `switch` over the closed list of reasons of its call, with no
// default: a code added to a route and not named here does not compile.

export function loadTrouble(reason: AssistantLoadFailureReason | AssistantEndFailureReason): Trouble {
  switch (reason) {
    case 'forbidden':
    case 'internal_error':
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return plain(failureText(PAGE_TEXTS_EN.failures, reason));
  }
}

export function sendTrouble(reason: AssistantSendFailureReason, language: AssistantLanguage | null): Trouble {
  switch (reason) {
    case 'assistant_limit_reached':
      return { ...plain(cannotAnswer(reason, language)), stop: 'day' };
    // The server may have saved and counted the message before it failed to ask Claude
    // (docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1): the conversation is read again, so that
    // the messages left today and the conversation itself are the server's, and Claude is not
    // asked again by the panel itself.
    case 'assistant_budget_reached':
    case 'assistant_unavailable':
      return { ...plain(cannotAnswer(reason, language)), then: 'read' };
    case 'conversation_full':
      return { ...plain(assistantTexts(language ?? DEFAULT_ASSISTANT_LANGUAGE).conversationFull), stop: 'full' };
    // A step of the conversation waits, or a confirmation is under way: the conversation is
    // read again and the step that waits is asked for.
    case 'assistant_busy':
      return { ...plain(failureText(PAGE_TEXTS_EN.failures, reason)), then: 'read-on' };
    case 'invalid_json':
    case 'invalid_request':
      return plain(failureText(PAGE_TEXTS_EN.failures, reason, 'message'));
    case 'forbidden':
    case 'internal_error':
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return plain(failureText(PAGE_TEXTS_EN.failures, reason));
  }
}

export function continueTrouble(reason: AssistantContinueFailureReason, language: AssistantLanguage | null): Trouble {
  switch (reason) {
    case 'assistant_budget_reached':
    case 'assistant_unavailable':
      return plain(cannotAnswer(reason, language));
    case 'nothing_to_continue':
    case 'assistant_busy':
      return { ...plain(failureText(PAGE_TEXTS_EN.failures, reason)), then: 'read-on' };
    case 'forbidden':
    case 'internal_error':
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return plain(failureText(PAGE_TEXTS_EN.failures, reason));
  }
}

export function confirmTrouble(reason: AssistantConfirmFailureReason, language: AssistantLanguage | null): Trouble {
  switch (reason) {
    // The changes were made and saved, and only the closing words are missing
    // (docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1): the conversation is read again to show
    // each outcome, and Claude is not asked again by the panel itself.
    case 'assistant_budget_reached':
    case 'assistant_unavailable':
      return { ...plain(cannotAnswer(reason, language)), then: 'read' };
    // The changes were made and their outcomes are not saved
    // (docs/CONVERSATIONAL_ARCHITECTURE.md section 6): no reply will show them.
    case 'assistant_busy':
      return { ...plain(failureText(PAGE_TEXTS_EN.failures, reason)), then: 'read-on', made: true };
    case 'proposal_not_found':
      return { ...plain(failureText(PAGE_TEXTS_EN.failures, reason)), then: 'read-on' };
    case 'invalid_request':
    case 'forbidden':
    case 'internal_error':
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return plain(failureText(PAGE_TEXTS_EN.failures, reason));
  }
}

export function declineTrouble(reason: AssistantDeclineFailureReason): Trouble {
  switch (reason) {
    case 'proposal_not_found':
      return { ...plain(failureText(PAGE_TEXTS_EN.failures, reason)), then: 'read-on' };
    case 'invalid_request':
    case 'forbidden':
    case 'internal_error':
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return plain(failureText(PAGE_TEXTS_EN.failures, reason));
  }
}
