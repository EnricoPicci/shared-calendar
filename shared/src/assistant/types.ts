import type { ApiErrorCode } from '../api';
import type { AssistantLanguage } from './languages';

// What the assistant's routes answer (docs/CONVERSATIONAL_ARCHITECTURE.md section 6). Types only:
// the server builds these values and the screen shows them.

// What the conversation waits for: the person (`idle`), the next step of the exchange, which the
// client asks for with `continue` (`working`), or the person's answer to a proposal.
export type AssistantStatus = 'idle' | 'working' | 'awaiting_confirmation';

// One thing a person reads in the conversation: their own text, the assistant's, or a fixed
// notice of the server. `seq` orders the messages of one conversation, `at` is the instant it
// was written. `text` is plain text, shown as written.
export type AssistantMessage = { seq: number; from: 'person' | 'assistant' | 'notice'; text: string; at: string };

// One change of a proposal, in the server's words. `outcome` is null until the proposal is
// confirmed, then `done`, `refused` by the route, or `unknown` when the function stopped before
// saving it. A refused change carries the error code its route answered; every other has null.
export type AssistantProposalAction =
  | { summary: string; outcome: null | 'done' | 'unknown'; error: null }
  | { summary: string; outcome: 'refused'; error: ApiErrorCode };

// The changes the person is asked to confirm together, with the question and the labels of the
// two buttons, all in the conversation's language.
export type AssistantProposal = {
  proposalId: string;
  question: string;
  confirmLabel: string;
  declineLabel: string;
  actions: AssistantProposalAction[];
};

// The answer of every route of the assistant but the one that ends the conversation.
export type AssistantReply = {
  // A ULID, or null when the person has no conversation.
  conversationId: string | null;
  // Null before the first message, which sets it for the whole conversation.
  language: AssistantLanguage | null;
  status: AssistantStatus;
  // The messages this request added, or all of them from the route that reads the conversation.
  messages: AssistantMessage[];
  // While `working`, one line of progress in the conversation's language; otherwise null.
  activity: string | null;
  // The proposal waiting for an answer or just settled; otherwise null.
  proposal: AssistantProposal | null;
  // The messages the person may still send today.
  remainingToday: number;
};
