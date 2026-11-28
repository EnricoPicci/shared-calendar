import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../../src/handlers/sendAssistantMessage';

// The core is replaced: these tests are about what the handler makes of a request and of the
// core's answer, and about its log line.
const core = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('../../../src/assistant/exchange', () => core);

const ROUTE = 'POST /assistant/messages';
const NOW = '2026-11-21T14:05:00.000Z';
const TEXT = 'Which slots are free next week?';
const ANSWER = 'I cannot look that up here.';

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda: Record<string, string> | undefined, body?: string): APIGatewayProxyEventV2 {
  return { routeKey: ROUTE, requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) }, body } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[], body: unknown = { text: TEXT }) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, typeof body === 'string' ? body : JSON.stringify(body));

const REPLY = {
  conversationId: '01JD0000000000000000000001',
  language: 'en',
  status: 'idle',
  messages: [
    { seq: 1, from: 'person', text: TEXT, at: NOW },
    { seq: 3, from: 'assistant', text: ANSWER, at: NOW },
  ],
  activity: null,
  proposal: null,
  remainingToday: 5,
};
const STEP_LOG = {
  conversationId: '01JD0000000000000000000001',
  outcome: 'text',
  model: 'claude-sonnet-5-5',
  modelMs: 2300,
  usage: { input: 100, output: 40, cacheRead: 6000, cacheWrite: 300 },
  newConversation: true,
  tools: [],
};

let output: string[];
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  core.sendMessage.mockResolvedValue({ ok: true, reply: REPLY, log: STEP_LOG });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
// The one log line, which must hold no text of the person or of Claude.
const logLine = () => {
  expect(output).toHaveLength(1);
  expect(output[0]).not.toContain(TEXT);
  expect(output[0]).not.toContain(ANSWER);
  return logLines()[0];
};

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('sendAssistantMessage handler (6)', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
    { groups: ['user', 'admin'], role: 'admin' },
  ])('gives the core the identity of the token ($role), the trimmed text and the request\'s now, and answers its reply', async ({ groups, role }) => {
    const response = await handler(caller('alice', groups, { text: `  ${TEXT}\n` }));

    expect(core.sendMessage).toHaveBeenCalledWith({ sub: 'sub-alice', username: 'alice', role }, { text: TEXT }, NOW, { requestId: 'req-1', remainingMs: null });
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(body(response)).toEqual(REPLY);
    expect(logLine()).toEqual({
      timestamp: NOW,
      level: 'info',
      requestId: 'req-1',
      route: ROUTE,
      username: 'alice',
      role,
      ...STEP_LOG,
      status: 200,
      durationMs: 0,
    });
  });

  it.each([
    ['assistant_busy', 409, 'busy', 'info'],
    ['conversation_full', 409, 'conversation_full', 'info'],
    ['assistant_limit_reached', 429, 'daily_limit', 'info'],
    ['assistant_unavailable', 503, 'unavailable', 'error'],
    ['assistant_budget_reached', 503, 'budget_reached', 'error'],
  ])('answers the refusal %s with %i and logs the outcome of the step', async (refusal, status, outcome, level) => {
    core.sendMessage.mockResolvedValue({ ok: false, refusal, log: { conversationId: null, outcome, reason: 'overloaded' } });

    const response = await handler(caller('alice', ['user']));

    expect(response.statusCode).toBe(status);
    expect(body(response)).toEqual({ error: refusal, message: expect.any(String) });
    expect(logLine()).toMatchObject({ level, username: 'alice', role: 'user', conversationId: null, outcome, reason: 'overloaded', status });
  });

  it('answers 401 without the identity of the authorizer', async () => {
    const response = await handler(eventWith(undefined, JSON.stringify({ text: TEXT })));
    expect(response.statusCode).toBe(401);
    expect(core.sendMessage).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'unauthorized', status: 401 });
  });

  it('answers 403 to a token in neither group', async () => {
    const response = await handler(caller('mallory', ['guests']));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: expect.any(String) });
    expect(core.sendMessage).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'forbidden', username: 'mallory', role: null, status: 403 });
  });

  it.each([
    ['no body', undefined, 'invalid_json'],
    ['a body that is not JSON', '{ text', 'invalid_json'],
    ['an empty text', { text: '   ' }, 'invalid_request'],
    ['a text of 2 001 characters', { text: 'a'.repeat(2001) }, 'invalid_request'],
    ['a text that is not a string', { text: 7 }, 'invalid_request'],
    ['another field', { text: TEXT, locale: 'it' }, 'invalid_request'],
    ['a language not of the list', { text: TEXT, language: 'fr' }, 'invalid_request'],
    ['a language with a region', { text: TEXT, language: 'it-IT' }, 'invalid_request'],
  ])('answers 400 for %s and never reaches the core', async (_what, sent, code) => {
    const event = sent === undefined ? eventWith({ sub: 'sub-alice', username: 'alice', groups: '["user"]' }) : caller('alice', ['user'], sent);
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(body(response).error).toBe(code);
    expect(core.sendMessage).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'invalid_request', status: 400, username: 'alice' });
  });

  it('gives the core the page\'s language with the text', async () => {
    const response = await handler(caller('alice', ['user'], { text: TEXT, language: 'it' }));

    expect(core.sendMessage).toHaveBeenCalledWith({ sub: 'sub-alice', username: 'alice', role: 'user' }, { text: TEXT, language: 'it' }, NOW, { requestId: 'req-1', remainingMs: null });
    expect(response.statusCode).toBe(200);
  });

  it('takes a text of exactly 2 000 characters', async () => {
    const response = await handler(caller('alice', ['user'], { text: 'a'.repeat(2000) }));
    expect(response.statusCode).toBe(200);
  });

  it('answers 500 when the core throws, with the reason in the log and not in the answer', async () => {
    core.sendMessage.mockRejectedValue(new Error('ASSISTANT_MODEL is not set'));

    const response = await handler(caller('alice', ['user']));

    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The assistant could not handle the message' });
    expect(logLine()).toMatchObject({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'ASSISTANT_MODEL is not set' } });
  });

  it("gives the core the time the function may still run, as Lambda's context says it", async () => {
    await handler(caller('alice', ['user']), { getRemainingTimeInMillis: () => 12_345 } as never);
    const request = core.sendMessage.mock.calls[0]?.[3] as { requestId: string; remainingMs: () => number };
    expect(request.requestId).toBe('req-1');
    expect(request.remainingMs()).toBe(12_345);
  });

  it('measures the whole request', async () => {
    core.sendMessage.mockImplementation(() => {
      vi.advanceTimersByTime(2500);
      return Promise.resolve({ ok: true, reply: REPLY, log: STEP_LOG });
    });
    await handler(caller('alice', ['user']));
    expect(logLine()).toMatchObject({ durationMs: 2500 });
  });
});
