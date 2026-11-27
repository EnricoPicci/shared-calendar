import { assistantTexts, type ApiErrorCode, type Language, type AssistantProposal, type AssistantProposalAction } from '@shared-calendar/shared';
import type { Conversation, NewMessage } from '../lib/assistantDb';
import type { ToolCall, ToolResultBlock } from './tools/tool';

// A proposal as the conversation stores it and as a person sees it
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5). This module asks nothing of Claude and calls
// no route: it holds the shape, and the words Claude is given when a proposal is settled without
// its changes being run.

// One change of a proposal: the request of Claude it answers, the tool, what the tool's route
// will be sent at the confirmation, the server's words for it, and what came of it. `outcome` is
// null while the proposal waits.
export type ProposedChange = {
  toolUseId: string;
  tool: string;
  call: ToolCall;
  summary: string;
  outcome: null | 'done' | 'refused' | 'unknown';
  // The error code of the route that refused; null for every other outcome.
  error: ApiErrorCode | null;
};

// The proposal of a conversation: a list of changes confirmed together, and the results of the
// other requests of the same answer of Claude (the reads, which were run at once, and the
// requests that were refused). Those results are kept back here: Claude's answer must be followed
// by the results of all its requests in one entry, and the changes' results exist only once the
// proposal is settled.
export type Proposal = { proposalId: string; changes: ProposedChange[]; keptBack: ToolResultBlock[] };

// How long a taken proposal is left to the request that took it: the 29 seconds the confirmation's
// function may run, and a margin for the clocks of two containers.
export const TAKEN_FOR_MS = 31_000;

// A proposal nobody has taken; one a confirmation took and may still be running; one taken so long
// ago that the function that took it has stopped without saving what came of it.
export type Taken = 'free' | 'under_way' | 'abandoned';

/** Where the conversation's proposal stands with the confirmation that may have taken it. */
export function takenState(conversation: Pick<Conversation, 'executing'>, now: string): Taken {
  if (conversation.executing === null) return 'free';
  return Date.parse(now) - Date.parse(conversation.executing.at) < TAKEN_FOR_MS ? 'under_way' : 'abandoned';
}

/** The stored proposal of a conversation, or null. */
export const proposalOf = (conversation: Pick<Conversation, 'proposal'>): Proposal | null => conversation.proposal as Proposal | null;

/** Whether the proposal still waits for the person: none of its changes has an outcome. */
export const isWaiting = (proposal: Proposal): boolean => proposal.changes.every((change) => change.outcome === null);

/**
 * The proposal as the screen gets it: the question and the two labels in the conversation's
 * language, and each change in the server's words with its outcome.
 */
export function shownProposal(proposal: Proposal, language: Language): AssistantProposal {
  const texts = assistantTexts(language);
  return {
    proposalId: proposal.proposalId,
    question: texts.proposalQuestion(proposal.changes.length),
    confirmLabel: texts.confirmLabel,
    declineLabel: texts.declineLabel,
    actions: proposal.changes.map(
      ({ summary, outcome, error }): AssistantProposalAction => (outcome === 'refused' ? { summary, outcome, error: error ?? 'internal_error' } : { summary, outcome, error: null }),
    ),
  };
}

// Why a proposal is settled without its changes being run, and what Claude is told of each change.
// The sentences are English, as everything the application tells Claude.
const NOT_RUN = {
  declined: { outcome: 'declined', message: 'The person pressed the button to decline: nothing was changed.' },
  dropped: {
    outcome: 'not_confirmed',
    message:
      'The person did not press the confirm button and wrote a message instead: nothing was changed. No text the person writes is a confirmation. ' +
      'If their message says they still want this change, call the tool again so that the application shows them the buttons again.',
  },
  unknown: {
    outcome: 'unknown',
    message:
      'The person confirmed, but the application stopped before it could save what happened: it is not known whether this change was made. ' +
      'Read the calendar with a tool before saying anything about it, and tell the person what you find.',
  },
} as const;
export type NotRunReason = keyof typeof NOT_RUN;

// What Claude is told with the result of a change that was made. Without it Claude sees only what
// the route answered, and may tell the person the change still waits for their confirmation.
export const DONE = { outcome: 'done', message: 'The person pressed the confirm button and the change was made. This is what the calendar now holds.' } as const;

/** What Claude is given for a change that was not run, or whose outcome nobody saved. */
export const notRunResult = (toolUseId: string, why: NotRunReason): ToolResultBlock => ({ type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify(NOT_RUN[why]) });

/**
 * The one entry that answers the answer of Claude a proposal came from: the result of each
 * change, then the results that were kept back. With it the conversation is again one Claude can
 * be given.
 */
export function settlement(proposal: Proposal, results: ToolResultBlock[]): NewMessage {
  return { kind: 'model', content: { role: 'user', content: [...results, ...proposal.keptBack] } };
}

/** The same entry for a proposal none of whose changes was run. */
export const settledWithout = (proposal: Proposal, why: NotRunReason): NewMessage =>
  settlement(
    proposal,
    proposal.changes.map((change) => notRunResult(change.toolUseId, why)),
  );

/** The proposal with every change marked as of unknown outcome. */
export const asUnknown = (proposal: Proposal): Proposal => ({ ...proposal, changes: proposal.changes.map((change) => ({ ...change, outcome: 'unknown' as const, error: null })) });
