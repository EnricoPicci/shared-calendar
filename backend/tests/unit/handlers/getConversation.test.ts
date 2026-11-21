import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../../src/handlers/getConversation';

// The core is replaced: these tests are about the handler and its log line.
const core = vi.hoisted(() => ({ showConversation: vi.fn() }));
vi.mock('../../../src/assistant/conversation', () => core);

const ROUTE = 'GET /assistant/conversation';
const NOW = '2026-11-21T14:05:00.000Z';
const TEXT = 'Which slots are free next week?';

function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return { routeKey: ROUTE, requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) } } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[]) => eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

const REPLY = {
  conversationId: '01JD0000000000000000000001',
  language: 'en',
  status: 'idle',
  messages: [{ seq: 1, from: 'person', text: TEXT, at: NOW }],
  activity: null,
  proposal: null,
  remainingToday: 9,
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
  core.showConversation.mockResolvedValue({ reply: REPLY, log: { conversationId: REPLY.conversationId, outcome: 'shown' } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
const logLine = () => {
  expect(output).toHaveLength(1);
  expect(output[0]).not.toContain(TEXT);
  return JSON.parse(output[0] as string) as Record<string, unknown>;
};

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('getConversation handler (6)', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
  ])("answers the caller's own conversation to $role, found by the token's sub", async ({ groups, role }) => {
    const response = await handler(caller('alice', groups));

    expect(core.showConversation).toHaveBeenCalledWith({ sub: 'sub-alice', username: 'alice', role }, NOW);
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual(REPLY);
    expect(logLine()).toEqual({
      timestamp: NOW,
      level: 'info',
      requestId: 'req-1',
      route: ROUTE,
      username: 'alice',
      role,
      conversationId: REPLY.conversationId,
      outcome: 'shown',
      status: 200,
      durationMs: 0,
    });
  });

  it('answers 401 without the identity of the authorizer', async () => {
    expect((await handler(eventWith())).statusCode).toBe(401);
    expect(core.showConversation).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'unauthorized', status: 401 });
  });

  it('answers 403 to a token in neither group', async () => {
    const response = await handler(caller('mallory', []));
    expect(response.statusCode).toBe(403);
    expect(body(response).error).toBe('forbidden');
    expect(core.showConversation).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'forbidden', username: 'mallory', role: null });
  });

  it('answers 500 when the conversation cannot be read', async () => {
    core.showConversation.mockRejectedValue(new Error('ASSISTANT_TABLE is not set'));
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'Could not read the conversation' });
    expect(logLine()).toMatchObject({ level: 'error', outcome: 'error', status: 500, reason: { message: 'ASSISTANT_TABLE is not set' } });
  });
});
