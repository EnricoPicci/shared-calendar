import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../../src/handlers/continueAssistant';

// The core is replaced: these tests are about what the handler makes of a request and of the
// core's answer, and about its log line.
const core = vi.hoisted(() => ({ continueExchange: vi.fn() }));
vi.mock('../../../src/assistant/exchange', () => core);

const ROUTE = 'POST /assistant/continue';
const NOW = '2026-11-21T14:05:00.000Z';
const TEXT = 'Which slots are free next week?';
const ANSWER = 'I cannot look that up here.';

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda: Record<string, string> | undefined, body?: string): APIGatewayProxyEventV2 {
  return { routeKey: ROUTE, requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) }, body } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[], body?: string) => eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, body);

const REPLY = {
  conversationId: '01JD0000000000000000000001',
  language: 'en',
  status: 'idle',
  messages: [
    { seq: 3, from: 'assistant', text: ANSWER, at: NOW },
  ],
  activity: null,
  proposal: null,
  remainingToday: 5,
};
const STEP_LOG = {
  conversationId: '01JD0000000000000000000001',
  outcome: 'text',
  steps: 2,
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
  core.continueExchange.mockResolvedValue({ ok: true, reply: REPLY, log: STEP_LOG });
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
describe('continueAssistant handler (5.1, 6)', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
    { groups: ['user', 'admin'], role: 'admin' },
  ])("gives the core the identity of the token ($role), the request's now and its id, and answers its reply", async ({ groups, role }) => {
    const response = await handler(caller('alice', groups));

    expect(core.continueExchange).toHaveBeenCalledWith({ sub: 'sub-alice', username: 'alice', role }, NOW, { requestId: 'req-1', remainingMs: null });
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

  it.each([undefined, '', '{ not json', JSON.stringify({ text: TEXT })])('takes no body: whatever is sent (%j) is not read', async (sent) => {
    const response = await handler(caller('alice', ['user'], sent));
    expect(response.statusCode).toBe(200);
    expect(core.continueExchange).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['nothing_to_continue', 409, 'nothing_to_continue', 'info'],
    ['assistant_busy', 409, 'lost_the_race', 'info'],
    ['assistant_unavailable', 503, 'unavailable', 'error'],
    ['assistant_budget_reached', 503, 'budget_reached', 'error'],
  ])('answers the refusal %s with %i and logs the outcome of the step', async (refusal, status, outcome, level) => {
    core.continueExchange.mockResolvedValue({ ok: false, refusal, log: { conversationId: null, outcome, reason: 'overloaded' } });

    const response = await handler(caller('alice', ['user']));

    expect(response.statusCode).toBe(status);
    expect(body(response)).toEqual({ error: refusal, message: expect.any(String) });
    expect(logLine()).toMatchObject({ level, username: 'alice', role: 'user', conversationId: null, outcome, reason: 'overloaded', status });
  });

  it('answers 401 without the identity of the authorizer', async () => {
    const response = await handler(eventWith(undefined));
    expect(response.statusCode).toBe(401);
    expect(core.continueExchange).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'unauthorized', status: 401 });
  });

  it('answers 403 to a token in neither group', async () => {
    const response = await handler(caller('mallory', ['guests']));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: expect.any(String) });
    expect(core.continueExchange).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'forbidden', username: 'mallory', role: null, status: 403 });
  });

  it('answers 500 when the core throws, with the reason in the log and not in the answer', async () => {
    core.continueExchange.mockRejectedValue(new Error('ASSISTANT_MODEL is not set'));

    const response = await handler(caller('alice', ['user']));

    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The assistant could not go on' });
    expect(logLine()).toMatchObject({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'ASSISTANT_MODEL is not set' } });
  });

  it('measures the whole request', async () => {
    core.continueExchange.mockImplementation(() => {
      vi.advanceTimersByTime(2500);
      return Promise.resolve({ ok: true, reply: REPLY, log: STEP_LOG });
    });
    await handler(caller('alice', ['user']));
    expect(logLine()).toMatchObject({ durationMs: 2500 });
  });
});
