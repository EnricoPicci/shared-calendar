import type { ApiErrorCode, AssistantReply } from '@shared-calendar/shared';
import { AssistantService } from '../../../src/services/assistant.service';
import type {
  AssistantCall,
  AssistantConfirmFailureReason,
  AssistantContinueFailureReason,
  AssistantDeclineFailureReason,
  AssistantEndFailureReason,
  AssistantLoadFailureReason,
  AssistantOutcome,
  AssistantSendFailureReason,
} from '../../../src/services/assistant.types';
import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';
import { CONFIG } from './suite';

// docs/FRONTEND_SERVICES.md section 21.8: the six calls of AssistantService, each with the same
// tests, then what belongs to the one stream they share. The per-method suite of suite.ts is not
// used: it tests a pair of streams per method, and this service has one stream for all its calls.
// A real SessionStore; fetch stubbed with real Responses; every test subscribes first, then calls.

const ID = '01JCAAAAAAAAAAAAAAAAAAAAAA';
const AT = '2026-11-22T09:00:00.000Z';

const EMPTY: AssistantReply = { conversationId: null, language: null, status: 'idle', messages: [], activity: null, proposal: null, remainingToday: 30 };
const WORKING: AssistantReply = {
  conversationId: ID,
  language: 'en',
  status: 'working',
  messages: [{ seq: 1, from: 'person', text: 'Which slots are free?', at: AT }],
  activity: 'Looking at the calendar…',
  proposal: null,
  remainingToday: 29,
};
// A text with markup and line breaks: it must come out as it went in.
const ANSWERED: AssistantReply = {
  ...WORKING,
  status: 'idle',
  messages: [{ seq: 5, from: 'assistant', text: 'Free:\n- <b>10:00</b>\n- 11:00 ', at: AT }],
  activity: null,
};
const PROPOSED: AssistantReply = {
  ...WORKING,
  status: 'awaiting_confirmation',
  activity: null,
  proposal: {
    proposalId: ID,
    question: 'Make this change?',
    confirmLabel: 'Confirm',
    declineLabel: "Don't",
    actions: [{ summary: 'Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).', outcome: null, error: null }],
  },
};
const CONFIRMED: AssistantReply = {
  ...ANSWERED,
  proposal: { ...PROPOSED.proposal!, actions: [{ summary: 'Book an appointment.', outcome: 'refused', error: 'slot_taken' }] },
};
const DECLINED: AssistantReply = { ...ANSWERED, messages: [{ seq: 5, from: 'notice', text: 'Nothing was changed.', at: AT }] };

type S = AssistantService;
type CallSpec = {
  call: AssistantCall;
  run: (service: S) => void; // a valid call
  request: { method: string; path: string; body?: unknown }; // body: what is sent
  ok: () => Response;
  success: Record<string, unknown>;
  wrong: [string, () => Response][]; // answers outside the contract: unexpected
  codes: readonly ApiErrorCode[]; // the route's codes in docs/CONVERSATIONAL_ARCHITECTURE.md section 6
  notCodes: readonly ApiErrorCode[]; // codes of the neighbouring routes, which must stay unexpected here
  invalid?: [string, (service: S) => void, string][]; // inputs refused before any request, with the message
};

// The status each code is answered with (docs/CONVERSATIONAL_ARCHITECTURE.md section 6).
const STATUS: Partial<Record<ApiErrorCode, number>> = {
  forbidden: 403,
  invalid_json: 400,
  invalid_request: 400,
  proposal_not_found: 404,
  assistant_limit_reached: 429,
  assistant_unavailable: 503,
  assistant_budget_reached: 503,
  internal_error: 500,
};

// A reply without one of the three fields the service looks at, and other answers that are not a reply.
const notAReply = (): [string, () => Response][] => [
  ['201 instead of 200', () => json(201, ANSWERED)],
  ['200 without status', () => json(200, { ...ANSWERED, status: undefined })],
  ['200 with messages that are not a list', () => json(200, { ...ANSWERED, messages: 'none' })],
  ['200 without remainingToday', () => json(200, { ...ANSWERED, remainingToday: null })],
  ['200 empty', () => new Response(null, { status: 200 })],
];

const load: CallSpec = {
  call: 'load',
  run: (s) => s.load(),
  request: { method: 'GET', path: '/assistant/conversation' },
  ok: () => json(200, EMPTY),
  success: { call: 'load', status: 'success', reply: EMPTY },
  wrong: notAReply(),
  codes: ['forbidden', 'internal_error'],
  notCodes: ['invalid_request', 'nothing_to_continue', 'assistant_busy', 'assistant_unavailable', 'assistant_budget_reached', 'assistant_limit_reached'],
};

const end: CallSpec = {
  call: 'end',
  run: (s) => s.end(),
  request: { method: 'DELETE', path: '/assistant/conversation' },
  ok: () => new Response(null, { status: 204 }),
  success: { call: 'end', status: 'success' },
  wrong: [
    ['200 with a reply', () => json(200, EMPTY)],
    ['200 empty', () => new Response(null, { status: 200 })],
  ],
  codes: ['forbidden', 'internal_error'],
  notCodes: ['invalid_request', 'proposal_not_found', 'assistant_busy', 'nothing_to_continue', 'assistant_unavailable'],
};

const send: CallSpec = {
  call: 'send',
  run: (s) => s.send('  Which slots are free?  '),
  request: { method: 'POST', path: '/assistant/messages', body: { text: 'Which slots are free?' } },
  ok: () => json(200, WORKING),
  success: { call: 'send', status: 'success', reply: WORKING },
  wrong: notAReply(),
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'assistant_busy',
    'conversation_full',
    'assistant_limit_reached',
    'assistant_unavailable',
    'assistant_budget_reached',
    'internal_error',
  ],
  notCodes: ['nothing_to_continue', 'proposal_not_found', 'slot_taken'],
  invalid: [
    ['an empty text', (s) => s.send(''), 'text: 1 to 2000 characters'],
    ['a text of spaces and line breaks', (s) => s.send(' \n\t '), 'text: 1 to 2000 characters'],
    ['a text of 2 001 characters', (s) => s.send('x'.repeat(2001)), 'text: 1 to 2000 characters'],
    ['no text', (s) => s.send(undefined as never), 'text: Invalid input: expected string, received undefined'],
    ['a language not of the list', (s) => s.send('hello', 'fr' as never), 'language: Invalid option: expected one of "en"|"it"'],
  ],
};

// The same call with the page's language, which goes in the body beside the text.
const sendInItalian: CallSpec = {
  ...send,
  run: (s) => s.send('  Guten Tag  ', 'it'),
  request: { method: 'POST', path: '/assistant/messages', body: { text: 'Guten Tag', language: 'it' } },
};

const goOn: CallSpec = {
  call: 'continue',
  run: (s) => s.continue(),
  request: { method: 'POST', path: '/assistant/continue' },
  ok: () => json(200, ANSWERED),
  success: { call: 'continue', status: 'success', reply: ANSWERED },
  wrong: notAReply(),
  codes: ['forbidden', 'nothing_to_continue', 'assistant_busy', 'assistant_unavailable', 'assistant_budget_reached', 'internal_error'],
  // It is not a message of the day, and it reads no body.
  notCodes: ['assistant_limit_reached', 'conversation_full', 'invalid_json', 'invalid_request', 'proposal_not_found'],
};

const NOT_A_ULID: [string, string][] = [
  ['an id with an I', '01JCIIIIIIIIIIIIIIIIIIIIII'],
  ['an id too short', '01JC'],
  ['an id with a path in it', `${ID}/../x`],
  ['an empty id', ''],
];

const confirm: CallSpec = {
  call: 'confirm',
  run: (s) => s.confirm(ID),
  request: { method: 'POST', path: `/assistant/proposals/${ID}/confirm` },
  ok: () => json(200, CONFIRMED),
  success: { call: 'confirm', status: 'success', reply: CONFIRMED },
  wrong: notAReply(),
  codes: ['forbidden', 'invalid_request', 'proposal_not_found', 'assistant_busy', 'assistant_unavailable', 'assistant_budget_reached', 'internal_error'],
  // A refusal of the calendar is an outcome inside the reply, never the answer of this route.
  notCodes: ['nothing_to_continue', 'assistant_limit_reached', 'conversation_full', 'invalid_json', 'slot_taken'],
  invalid: NOT_A_ULID.map(([name, id]) => [name, (s) => s.confirm(id), 'proposalId: expected a ULID']),
};

const decline: CallSpec = {
  call: 'decline',
  run: (s) => s.decline(ID),
  request: { method: 'POST', path: `/assistant/proposals/${ID}/decline` },
  ok: () => json(200, DECLINED),
  success: { call: 'decline', status: 'success', reply: DECLINED },
  wrong: notAReply(),
  codes: ['forbidden', 'invalid_request', 'proposal_not_found', 'internal_error'],
  // Declining asks Claude nothing, so none of the answers of a route that asks.
  notCodes: ['assistant_busy', 'assistant_unavailable', 'assistant_budget_reached', 'nothing_to_continue', 'invalid_json'],
  invalid: NOT_A_ULID.map(([name, id]) => [name, (s) => s.decline(id), 'proposalId: expected a ULID']),
};

// Two calls of the same kind are never next to each other: each spec's cancel test pairs it with
// the next one, which must be another call.
const ALL = [load, end, send, goOn, sendInItalian, confirm, decline];

type Harness = {
  fetchMock: ReturnType<typeof vi.fn>;
  store: SessionStore;
  service: S;
  admin: Session;
  outcomes: AssistantOutcome[];
  sessions: (Session | null)[];
};

function harness(): Harness {
  const h = {} as Harness;
  beforeEach(() => {
    h.fetchMock = vi.fn();
    vi.stubGlobal('fetch', h.fetchMock);
    h.store = new SessionStore();
    h.service = new AssistantService(CONFIG, h.store);
    h.outcomes = [];
    h.sessions = [];
    h.service.outcome$.subscribe((o) => h.outcomes.push(o));
    h.store.session$.subscribe((s) => h.sessions.push(s));
    h.admin = session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin' });
    h.store.set(h.admin);
  });
  afterEach(() => {
    h.store.clear();
    vi.unstubAllGlobals();
  });
  return h;
}

// Makes the call against one stubbed answer and waits for its outcome on the stream.
async function once(h: Harness, spec: CallSpec, answer: Response): Promise<AssistantOutcome> {
  h.fetchMock.mockResolvedValueOnce(answer);
  const before = h.outcomes.length;
  spec.run(h.service);
  await vi.waitFor(() => expect(h.outcomes).toHaveLength(before + 1));
  return h.outcomes.at(-1) as AssistantOutcome;
}

function describeCall(spec: CallSpec, other: CallSpec): void {
  describe(spec.call, () => {
    const h = harness();

    it('success: one outcome on the stream, with the call it answers and what the server gave', async () => {
      expect(await once(h, spec, spec.ok())).toEqual(spec.success);
      expect(h.outcomes).toHaveLength(1);
    });

    it(`request shape: one ${spec.request.method} ${spec.request.path}, bearer token, ${spec.request.body === undefined ? 'no body' : 'the parsed JSON body'}`, async () => {
      await once(h, spec, spec.ok());
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = call(h.fetchMock);
      expect(url).toBe(`${CONFIG.apiUrl}${spec.request.path}`);
      expect(init.method).toBe(spec.request.method);
      if (spec.request.body === undefined) {
        expect(init.headers).toEqual({ Authorization: 'Bearer access-token-admin' });
        expect(init.body).toBeUndefined();
      } else {
        expect(init.headers).toEqual({ Authorization: 'Bearer access-token-admin', 'Content-Type': 'application/json' });
        expect(JSON.parse(init.body as string)).toEqual(spec.request.body);
      }
    });

    it.each(spec.codes.map((code) => [code]))('route code %s: a failure of this call with that reason and the message', async (code) => {
      const outcome = await once(h, spec, json(STATUS[code] ?? 409, { error: code, message: `m-${code}` }));
      expect(outcome).toEqual({ call: spec.call, status: 'failure', reason: code, message: `m-${code}` });
      expect(h.sessions.at(-1)).toBe(h.admin); // a handler's answer never clears the store
    });

    it.each(spec.notCodes.map((code) => [code]))('a code of another route (%s): unexpected', async (code) => {
      const outcome = await once(h, spec, json(STATUS[code] ?? 409, { error: code, message: 'm' }));
      expect(outcome).toEqual({ call: spec.call, status: 'failure', reason: 'unexpected', message: 'm' });
    });

    it.each(spec.wrong)('wrong answer (%s): failure unexpected', async (_name, stub) => {
      expect(await once(h, spec, stub())).toMatchObject({ call: spec.call, status: 'failure', reason: 'unexpected' });
    });

    it('token rejected: failure session_rejected; session$ gives null', async () => {
      expect(await once(h, spec, json(403, { message: 'Forbidden' }))).toMatchObject({ call: spec.call, reason: 'session_rejected' });
      expect(h.sessions.at(-1)).toBeNull();
    });

    it('a 503 of API Gateway itself, without a code: server, none of the three reasons of the assistant', async () => {
      expect(await once(h, spec, json(503, { message: 'Service Unavailable' }))).toEqual({
        call: spec.call,
        status: 'failure',
        reason: 'server',
        message: 'Service Unavailable',
      });
    });

    it('not signed in: failure not_signed_in; fetch never called', () => {
      h.store.clear();
      spec.run(h.service);
      expect(h.outcomes).toEqual([{ call: spec.call, status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' }]);
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it.each(spec.invalid ?? [])('invalid input (%s): invalid_request with the field; fetch never called', (_name, invalidCall, message) => {
      invalidCall(h.service);
      expect(h.outcomes).toEqual([{ call: spec.call, status: 'failure', reason: 'invalid_request', message }]);
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it('offline, then success: failure network, then success (the subject is alive)', async () => {
      h.fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      spec.run(h.service);
      await vi.waitFor(() => expect(h.outcomes).toHaveLength(1));
      expect(h.outcomes[0]).toEqual({ call: spec.call, status: 'failure', reason: 'network', message: 'TypeError: fetch failed' });
      expect(await once(h, spec, spec.ok())).toEqual(spec.success);
    });

    it(`cancel: a second ${spec.call} abandons the first, not a pending ${other.call}; one outcome`, async () => {
      const signals: (AbortSignal | undefined)[] = [];
      const pendingForever = (_url: string, init: RequestInit) => {
        signals.push(init.signal ?? undefined);
        return new Promise<Response>(() => {});
      };
      h.fetchMock.mockImplementationOnce(pendingForever);
      other.run(h.service);
      h.fetchMock.mockImplementationOnce(pendingForever);
      spec.run(h.service);
      await once(h, spec, spec.ok());
      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(false); // the other call's request
      expect(signals[1]?.aborted).toBe(true); // this call's first request
      expect(h.outcomes).toHaveLength(1);
    });

    it('late subscriber: the last outcome is replayed', async () => {
      const outcome = await once(h, spec, spec.ok());
      const late: AssistantOutcome[] = [];
      h.service.outcome$.subscribe((o) => late.push(o)).unsubscribe();
      expect(late).toEqual([outcome]);
      expect(late[0]).toBe(outcome);
    });

    it('no leak: no outcome contains the token', async () => {
      await once(h, spec, spec.ok());
      await once(h, spec, json(500, { error: 'internal_error', message: 'm' }));
      expect(JSON.stringify(h.outcomes)).not.toContain(h.admin.accessToken);
    });
  });
}

// The sentence a screen could choose for each reason of each call. Every `switch` is over a closed
// list and has no default: the file compiles only while each reason of each route is named, and
// only for the routes that answer it.
function transport(reason: 'not_signed_in' | 'session_rejected' | 'network' | 'server' | 'unexpected'): string {
  return `transport: ${reason}`;
}
function loadReason(reason: AssistantLoadFailureReason | AssistantEndFailureReason): string {
  switch (reason) {
    case 'forbidden':
    case 'internal_error':
      return reason;
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return transport(reason);
  }
}
function sendReason(reason: AssistantSendFailureReason): string {
  switch (reason) {
    case 'assistant_limit_reached':
      return 'the daily limit';
    case 'assistant_budget_reached':
      return 'the spending limit';
    case 'assistant_unavailable':
      return 'not available';
    case 'assistant_busy':
    case 'conversation_full':
    case 'invalid_json':
    case 'invalid_request':
    case 'forbidden':
    case 'internal_error':
      return reason;
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return transport(reason);
  }
}
function continueReason(reason: AssistantContinueFailureReason): string {
  switch (reason) {
    case 'assistant_budget_reached':
      return 'the spending limit';
    case 'assistant_unavailable':
      return 'not available';
    case 'nothing_to_continue':
    case 'assistant_busy':
    case 'forbidden':
    case 'internal_error':
      return reason;
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return transport(reason);
  }
}
function confirmReason(reason: AssistantConfirmFailureReason): string {
  switch (reason) {
    case 'assistant_budget_reached':
      return 'the spending limit';
    case 'assistant_unavailable':
      return 'not available';
    case 'proposal_not_found':
    case 'assistant_busy':
    case 'invalid_request':
    case 'forbidden':
    case 'internal_error':
      return reason;
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return transport(reason);
  }
}
function declineReason(reason: AssistantDeclineFailureReason): string {
  switch (reason) {
    case 'proposal_not_found':
    case 'invalid_request':
    case 'forbidden':
    case 'internal_error':
      return reason;
    case 'not_signed_in':
    case 'session_rejected':
    case 'network':
    case 'server':
    case 'unexpected':
      return transport(reason);
  }
}
// What a consumer of the one stream does: the call first, which narrows the reasons to its route's.
function told(outcome: AssistantOutcome): string {
  switch (outcome.call) {
    case 'load':
      return outcome.status === 'success' ? `${outcome.reply.messages.length} messages` : loadReason(outcome.reason);
    case 'end':
      return outcome.status === 'success' ? 'ended' : loadReason(outcome.reason);
    case 'send':
      return outcome.status === 'success' ? outcome.reply.status : sendReason(outcome.reason);
    case 'continue':
      return outcome.status === 'success' ? outcome.reply.status : continueReason(outcome.reason);
    case 'confirm':
      return outcome.status === 'success' ? outcome.reply.status : confirmReason(outcome.reason);
    case 'decline':
      return outcome.status === 'success' ? outcome.reply.status : declineReason(outcome.reason);
  }
}

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('AssistantService', () => {
  ALL.forEach((spec, i) => describeCall(spec, ALL[(i + 1) % ALL.length] as CallSpec));

  describe('one stream for the six calls', () => {
    const h = harness();

    it('the outcomes of different calls arrive on the same stream, in the order the answers came, each with its call', async () => {
      await once(h, send, json(200, WORKING));
      await once(h, goOn, json(200, PROPOSED));
      await once(h, confirm, json(200, CONFIRMED));
      await once(h, end, new Response(null, { status: 204 }));
      await once(h, load, json(200, EMPTY));
      expect(h.outcomes.map((o) => [o.call, o.status])).toEqual([
        ['send', 'success'],
        ['continue', 'success'],
        ['confirm', 'success'],
        ['end', 'success'],
        ['load', 'success'],
      ]);
      expect(h.outcomes.map(told)).toEqual(['working', 'awaiting_confirmation', 'idle', 'ended', '0 messages']);
    });

    it('a call makes one request: a reply that says working is passed on, and no continue follows by itself', async () => {
      expect(await once(h, send, json(200, WORKING))).toMatchObject({ reply: { status: 'working', activity: 'Looking at the calendar…' } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      expect(h.outcomes).toHaveLength(1);
    });

    it('the reply is passed on as given: a text with markup and line breaks, a refused change with its code, fields the service does not know', async () => {
      const outcome = await once(h, goOn, json(200, { ...CONFIRMED, somethingNew: 1 }));
      expect(outcome).toEqual({ call: 'continue', status: 'success', reply: { ...CONFIRMED, somethingNew: 1 } });
    });

    it('the three reasons of 6.1 stay three, on the routes that answer them', async () => {
      const reasons: string[] = [];
      for (const [spec, code] of [
        [send, 'assistant_limit_reached'],
        [send, 'assistant_budget_reached'],
        [send, 'assistant_unavailable'],
        [goOn, 'assistant_budget_reached'],
        [goOn, 'assistant_unavailable'],
        [confirm, 'assistant_budget_reached'],
        [confirm, 'assistant_unavailable'],
      ] as const) {
        reasons.push(told(await once(h, spec, json(STATUS[code] ?? 409, { error: code, message: 'm' }))));
      }
      expect(reasons).toEqual([
        'the daily limit',
        'the spending limit',
        'not available',
        'the spending limit',
        'not available',
        'the spending limit',
        'not available',
      ]);
    });

    it('a failure says which call it answers: the same code on two routes is two outcomes', async () => {
      const busy = () => json(409, { error: 'assistant_busy', message: 'm' });
      expect(told(await once(h, send, busy()))).toBe('assistant_busy');
      expect(told(await once(h, goOn, busy()))).toBe('assistant_busy');
      expect(told(await once(h, decline, busy()))).toBe('transport: unexpected');
      expect(h.outcomes.map((o) => o.call)).toEqual(['send', 'continue', 'decline']);
    });

    it('no memory but the last outcome: the next outcome replaces it, and a late subscriber gets nothing of the conversation', async () => {
      await once(h, send, json(200, WORKING));
      await once(h, end, new Response(null, { status: 204 }));
      const late: AssistantOutcome[] = [];
      h.service.outcome$.subscribe((o) => late.push(o)).unsubscribe();
      expect(late).toEqual([{ call: 'end', status: 'success' }]);
    });

    it('the id goes into the path encoded (a valid ULID is unchanged), and no body is sent', async () => {
      await once(h, decline, json(200, DECLINED));
      const [url, init] = call(h.fetchMock);
      expect(url).toBe(`${CONFIG.apiUrl}/assistant/proposals/${ID}/decline`);
      expect(init.body).toBeUndefined();
    });

    it('a failure never carries the calendar\'s list of conflicts', async () => {
      const outcome = await once(h, confirm, json(409, { error: 'assistant_busy', message: 'm', conflicts: [] }));
      expect(outcome).toEqual({ call: 'confirm', status: 'failure', reason: 'assistant_busy', message: 'm' });
    });
  });
});
