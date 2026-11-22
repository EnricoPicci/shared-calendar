import type { ApiErrorCode, AssistantReply } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// What AssistantService notifies on its one stream (docs/FRONTEND_SERVICES.md section 20.3): the
// outcome of each of its six calls, with the call it answers. The reply itself is the shared
// AssistantReply, passed on as the server gave it; the error codes are those each route answers
// in docs/CONVERSATIONAL_ARCHITECTURE.md section 6.

// The six calls, one per route of the assistant.
export type AssistantCall = 'load' | 'end' | 'send' | 'continue' | 'confirm' | 'decline';

type Common = 'forbidden' | 'internal_error';
// The two answers of a route that could not ask Claude, for a reason that is not the person's
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1). With the daily limit of `send` they are
// three reasons, never one: the screen says a different sentence for each.
type CannotAsk = 'assistant_unavailable' | 'assistant_budget_reached';

// GET /assistant/conversation and DELETE /assistant/conversation.
type LoadCode = Extract<ApiErrorCode, Common>;
type EndCode = Extract<ApiErrorCode, Common>;
// POST /assistant/messages.
type SendCode = Extract<
  ApiErrorCode,
  Common | 'invalid_json' | 'invalid_request' | 'assistant_busy' | 'conversation_full' | 'assistant_limit_reached' | CannotAsk
>;
// POST /assistant/continue.
type ContinueCode = Extract<ApiErrorCode, Common | 'nothing_to_continue' | 'assistant_busy' | CannotAsk>;
// POST /assistant/proposals/{proposalId}/confirm.
type ConfirmCode = Extract<ApiErrorCode, Common | 'invalid_request' | 'proposal_not_found' | 'assistant_busy' | CannotAsk>;
// POST /assistant/proposals/{proposalId}/decline.
type DeclineCode = Extract<ApiErrorCode, Common | 'invalid_request' | 'proposal_not_found'>;

// The reasons of each call, as closed lists: a `switch` over one of them needs no default.
export type AssistantLoadFailureReason = LoadCode | TransportFailureReason;
export type AssistantEndFailureReason = EndCode | TransportFailureReason;
export type AssistantSendFailureReason = SendCode | TransportFailureReason;
export type AssistantContinueFailureReason = ContinueCode | TransportFailureReason;
export type AssistantConfirmFailureReason = ConfirmCode | TransportFailureReason;
export type AssistantDeclineFailureReason = DeclineCode | TransportFailureReason;

// A reply of the server: every message of the conversation from `load`, the messages the request
// added from the other calls.
type Replied<K extends AssistantCall> = { call: K; status: 'success'; reply: AssistantReply };
// A failure of the call `K` with the codes of its route. Never the field `conflicts` of the
// calendar's failures: no route of the assistant answers the code that carries it.
type Failed<K extends AssistantCall, C extends ApiErrorCode> = { call: K } & Omit<ApiFailure<C>, 'conflicts'>;

export type AssistantLoadOutcome = Replied<'load'> | Failed<'load', LoadCode>;
// The route answers 204 with no body: the success says only that the conversation is ended.
export type AssistantEndOutcome = { call: 'end'; status: 'success' } | Failed<'end', EndCode>;
export type AssistantSendOutcome = Replied<'send'> | Failed<'send', SendCode>;
export type AssistantContinueOutcome = Replied<'continue'> | Failed<'continue', ContinueCode>;
export type AssistantConfirmOutcome = Replied<'confirm'> | Failed<'confirm', ConfirmCode>;
export type AssistantDeclineOutcome = Replied<'decline'> | Failed<'decline', DeclineCode>;

// One value of the stream. `call` narrows it to the outcomes of that call, so the reasons of a
// route stay those of that route.
export type AssistantOutcome =
  | AssistantLoadOutcome
  | AssistantEndOutcome
  | AssistantSendOutcome
  | AssistantContinueOutcome
  | AssistantConfirmOutcome
  | AssistantDeclineOutcome;
