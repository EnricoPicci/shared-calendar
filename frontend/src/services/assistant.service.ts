import { AssistantMessageBody, Ulid, type ApiErrorCode, type AssistantReply } from '@shared-calendar/shared';
import { Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { apiCall, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk } from './api';
import type {
  AssistantCall,
  AssistantConfirmOutcome,
  AssistantContinueOutcome,
  AssistantDeclineOutcome,
  AssistantEndOutcome,
  AssistantLoadOutcome,
  AssistantOutcome,
  AssistantSendOutcome,
} from './assistant.types';
import type { SessionStore } from './session.store';

// The person's conversation with the assistant (docs/FRONTEND_SERVICES.md section 20): the six
// routes of docs/CONVERSATIONAL_ARCHITECTURE.md section 6, for both roles. The six calls speak of
// one thing, so they notify on one stream: each outcome says which call it answers and carries
// the server's reply as given, or the reason of the failure. A call makes one request: repeating
// `continue` while the reply says `working`, and putting the replies together into the whole
// conversation, is the caller's work. The service keeps nothing but the last outcome its stream
// replays, writes no sentence and reads nothing into a message's text.

// Each route's error codes as docs/CONVERSATIONAL_ARCHITECTURE.md section 6 lists them.
const LOAD_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const END_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const SEND_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'assistant_busy',
  'conversation_full',
  'assistant_limit_reached',
  'assistant_unavailable',
  'assistant_budget_reached',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const CONTINUE_CODES = [
  'forbidden',
  'nothing_to_continue',
  'assistant_busy',
  'assistant_unavailable',
  'assistant_budget_reached',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const CONFIRM_CODES = [
  'forbidden',
  'invalid_request',
  'proposal_not_found',
  'assistant_busy',
  'assistant_unavailable',
  'assistant_budget_reached',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const DECLINE_CODES = ['forbidden', 'invalid_request', 'proposal_not_found', 'internal_error'] as const satisfies readonly ApiErrorCode[];

const CONVERSATION = '/assistant/conversation';
const proposalPath = (proposalId: string) => `/assistant/proposals/${encodeURIComponent(proposalId)}`;

// The outcomes of one call among those of the stream.
type OutcomeOf<K extends AssistantCall> = Extract<AssistantOutcome, { call: K }>;

export class AssistantService {
  // One subject for the six calls (docs/FRONTEND_SERVICES.md section 3.4).
  private readonly outcomeSubject = new ReplaySubject<AssistantOutcome>(1);
  readonly outcome$: Observable<AssistantOutcome> = this.outcomeSubject.asObservable();
  // The pending request of each call: a call made again abandons its own, never another call's.
  private readonly pending: Partial<Record<AssistantCall, Subscription>> = {};

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  // Reads the whole conversation, or an empty reply when the person has none.
  load(): void {
    this.run(
      'load',
      apiCall(this.config, this.store, { method: 'GET', path: CONVERSATION, codes: LOAD_CODES }).pipe(
        map((answer): AssistantLoadOutcome => (answer.status === 'ok' ? toReply('load', answer) : failed('load', answer))),
      ),
    );
  }

  // Ends the conversation; with none to end the server answers the same.
  end(): void {
    this.run(
      'end',
      apiCall(this.config, this.store, { method: 'DELETE', path: CONVERSATION, codes: END_CODES }).pipe(
        map((answer): AssistantEndOutcome => {
          if (answer.status !== 'ok') return failed('end', answer);
          return answer.httpStatus === 204 ? { call: 'end', status: 'success' } : failed('end', unexpectedAnswer(answer));
        }),
      ),
    );
  }

  // Sends a message of the person. The text is checked with the shared schema, which also trims
  // it: an empty or too long one is answered here, with no request.
  send(text: string): void {
    const body = AssistantMessageBody.safeParse({ text });
    this.run(
      'send',
      body.success
        ? apiCall(this.config, this.store, { method: 'POST', path: '/assistant/messages', body: body.data, codes: SEND_CODES }).pipe(
            map((answer): AssistantSendOutcome => (answer.status === 'ok' ? toReply('send', answer) : failed('send', answer))),
          )
        : of<AssistantSendOutcome>(failed('send', invalidRequest(body.error))), // no request sent
    );
  }

  // Asks for the next step of an exchange whose reply said `working`: one request, one step.
  continue(): void {
    this.run(
      'continue',
      apiCall(this.config, this.store, { method: 'POST', path: '/assistant/continue', codes: CONTINUE_CODES }).pipe(
        map((answer): AssistantContinueOutcome => (answer.status === 'ok' ? toReply('continue', answer) : failed('continue', answer))),
      ),
    );
  }

  // The person pressed the proposal's button: the only way a change is made.
  confirm(proposalId: string): void {
    const id = checkedProposalId(proposalId);
    this.run(
      'confirm',
      typeof id === 'string'
        ? apiCall(this.config, this.store, { method: 'POST', path: `${proposalPath(id)}/confirm`, codes: CONFIRM_CODES }).pipe(
            map((answer): AssistantConfirmOutcome => (answer.status === 'ok' ? toReply('confirm', answer) : failed('confirm', answer))),
          )
        : of<AssistantConfirmOutcome>(failed('confirm', id)), // no request sent
    );
  }

  // The person pressed the other button: nothing is changed.
  decline(proposalId: string): void {
    const id = checkedProposalId(proposalId);
    this.run(
      'decline',
      typeof id === 'string'
        ? apiCall(this.config, this.store, { method: 'POST', path: `${proposalPath(id)}/decline`, codes: DECLINE_CODES }).pipe(
            map((answer): AssistantDeclineOutcome => (answer.status === 'ok' ? toReply('decline', answer) : failed('decline', answer))),
          )
        : of<AssistantDeclineOutcome>(failed('decline', id)), // no request sent
    );
  }

  // Abandons the pending request of the same call, then feeds the one subject from the new one.
  private run<K extends AssistantCall>(call: K, outcome: Observable<OutcomeOf<K>>): void {
    this.pending[call]?.unsubscribe();
    // Forward `next` only: a completed subject would ignore every later call
    // (docs/FRONTEND_SERVICES.md section 3.2).
    this.pending[call] = outcome.subscribe((value) => this.outcomeSubject.next(value));
  }
}

// A failure, said to answer the call `call`.
function failed<K extends AssistantCall, C extends ApiErrorCode>(call: K, failure: ApiFailure<C>): { call: K } & ApiFailure<C> {
  return { call, ...failure };
}

// The id of a proposal as it goes into the path, or the failure of an id that is not a ULID,
// named by its field as the other services' refusals are.
function checkedProposalId(proposalId: string): string | ApiFailure<'invalid_request'> {
  const parsed = Ulid.safeParse(proposalId);
  if (parsed.success) return parsed.data;
  return invalidRequest({ issues: parsed.error.issues.map((issue) => ({ path: ['proposalId'], message: issue.message })) });
}

// The check of a reply (docs/FRONTEND_SERVICES.md section 20.5): a 200 whose body has the status,
// the list of messages and the count of the day; the rest is trusted to the contract and passed on
// as given.
function toReply<K extends AssistantCall>(call: K, answer: ApiOk): { call: K; status: 'success'; reply: AssistantReply } | ({ call: K } & ApiFailure<never>) {
  const body = answer.body as { messages?: unknown; remainingToday?: unknown } | undefined;
  if (answer.httpStatus === 200 && hasString(body, 'status') && Array.isArray(body.messages) && typeof body.remainingToday === 'number') {
    return { call, status: 'success', reply: body as unknown as AssistantReply };
  }
  return failed(call, unexpectedAnswer(answer));
}
