import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../../src/handlers/endConversation';

// The core is replaced: these tests are about the handler and its log line.
const core = vi.hoisted(() => ({ closeConversation: vi.fn() }));
vi.mock('../../../src/assistant/conversation', () => core);

const ROUTE = 'DELETE /assistant/conversation';
const NOW = '2026-11-21T14:05:00.000Z';
const ID = '01JD0000000000000000000001';

function eventWith(lambda?: Record<string, string>): APIGatewayProxyEventV2 {
  return { routeKey: ROUTE, requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) } } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[]) => eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

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
  core.closeConversation.mockResolvedValue({ conversationId: ID, outcome: 'ended' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const logLine = () => {
  expect(output).toHaveLength(1);
  return JSON.parse(output[0] as string) as Record<string, unknown>;
};

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('endConversation handler (6)', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
  ])("ends the caller's own conversation for $role and answers 204 with no body", async ({ groups, role }) => {
    const response = await handler(caller('alice', groups));

    expect(core.closeConversation).toHaveBeenCalledWith({ sub: 'sub-alice', username: 'alice', role }, NOW);
    expect(response).toEqual({ statusCode: 204 });
    expect(logLine()).toEqual({
      timestamp: NOW,
      level: 'info',
      requestId: 'req-1',
      route: ROUTE,
      username: 'alice',
      role,
      conversationId: ID,
      outcome: 'ended',
      status: 204,
      durationMs: 0,
    });
  });

  it('answers the same 204 when there was none to end', async () => {
    core.closeConversation.mockResolvedValue({ conversationId: null, outcome: 'nothing_to_end' });
    expect(await handler(caller('alice', ['user']))).toEqual({ statusCode: 204 });
    expect(logLine()).toMatchObject({ outcome: 'nothing_to_end', conversationId: null, status: 204 });
  });

  it('answers 401 without the identity of the authorizer', async () => {
    expect((await handler(eventWith())).statusCode).toBe(401);
    expect(core.closeConversation).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'unauthorized' });
  });

  it('answers 403 to a token in neither group', async () => {
    const response = await handler(caller('mallory', ['guests']));
    expect(response.statusCode).toBe(403);
    expect(core.closeConversation).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'forbidden', username: 'mallory', role: null });
  });

  it('answers 500 when the conversation cannot be ended', async () => {
    core.closeConversation.mockRejectedValue(new Error('DynamoDB is down'));
    const response = await handler(caller('alice', ['user']));
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body ?? '')).toEqual({ error: 'internal_error', message: 'Could not end the conversation' });
    expect(logLine()).toMatchObject({ level: 'error', outcome: 'error', status: 500 });
  });
});
