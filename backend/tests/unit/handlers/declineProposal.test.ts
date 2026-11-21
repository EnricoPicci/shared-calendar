import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../../src/handlers/declineProposal';

// The core is replaced: these tests are about what the handler makes of a request and of the
// core's answer, and about its log line.
const core = vi.hoisted(() => ({ declineProposal: vi.fn() }));
vi.mock('../../../src/assistant/decline', () => core);

const ROUTE = 'POST /assistant/proposals/{proposalId}/decline';
const NOW = '2026-11-21T14:05:00.000Z';
const PROPOSAL = '01JD00000000000000000PR0P1';
const NOTE = 'Bring the forms';
const SUMMARY = `Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). Note: "${NOTE}"`;

// The event as API Gateway delivers it after the authorizer allowed the request.
function eventWith(lambda: Record<string, string> | undefined, proposalId: string | null = PROPOSAL, body?: string): APIGatewayProxyEventV2 {
  return {
    routeKey: ROUTE,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters: proposalId === null ? undefined : { proposalId },
    body,
  } as unknown as APIGatewayProxyEventV2;
}
const caller = (username: string, groups: string[], proposalId: string | null = PROPOSAL, body?: string) =>
  eventWith({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) }, proposalId, body);

// What the core answers: the reply holds the proposal in the server's words, the log line must not.
const REPLY = {
  conversationId: '01JD0000000000000000000001',
  language: 'en',
  status: 'idle',
  messages: [{ seq: 8, from: 'assistant', text: 'Done.', at: NOW }],
  activity: null,
  proposal: { proposalId: PROPOSAL, question: 'Shall I?', confirmLabel: 'Confirm', declineLabel: "Don't", actions: [{ summary: SUMMARY, outcome: 'done', error: null }] },
  remainingToday: 5,
};
const CORE_LOG = { conversationId: '01JD0000000000000000000001', outcome: 'text', proposalId: PROPOSAL, changes: [{ name: 'book_appointment', status: 201, ms: 40 }] };

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
  core.declineProposal.mockResolvedValue({ ok: true, reply: REPLY, log: CORE_LOG });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const body = (response: Awaited<ReturnType<typeof handler>>) => JSON.parse(response.body ?? '') as Record<string, unknown>;
// The one log line, which must hold nothing of the proposal's wording, the note among it.
const logLine = () => {
  expect(output).toHaveLength(1);
  for (const text of [NOTE, 'Visit', 'Tuesday', 'Done.', 'Shall I?']) expect(output[0]).not.toContain(text);
  return JSON.parse(output[0] ?? '') as Record<string, unknown>;
};

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('declineProposal handler (5.5, 6)', () => {
  it.each([
    { groups: ['user'], role: 'user' },
    { groups: ['admin'], role: 'admin' },
    { groups: ['user', 'admin'], role: 'admin' },
  ])("gives the core the identity of the token ($role), the proposal's id and the request's now, and answers its reply", async ({ groups, role }) => {
    const response = await handler(caller('alice', groups));

    expect(core.declineProposal).toHaveBeenCalledWith({ sub: 'sub-alice', username: 'alice', role }, PROPOSAL, NOW);
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(body(response)).toEqual(REPLY);
    expect(logLine()).toEqual({ timestamp: NOW, level: 'info', requestId: 'req-1', route: ROUTE, username: 'alice', role, ...CORE_LOG, status: 200, durationMs: 0 });
  });

  it.each([undefined, '', '{ not json', JSON.stringify({ confirm: true, note: NOTE })])('takes no body: whatever is sent (%j) is not read', async (sent) => {
    const response = await handler(caller('alice', ['user'], PROPOSAL, sent));
    expect(response.statusCode).toBe(200);
    expect(core.declineProposal).toHaveBeenCalledTimes(1);
  });

  it.each([null, '', 'yes', '01jd00000000000000000pr0p1', `${PROPOSAL}0`, '../conversation'])('answers 400 invalid_request to a proposal id that is not a ULID (%j), and the core is not called', async (proposalId) => {
    const response = await handler(eventWith({ sub: 'sub-alice', username: 'alice', groups: '["user"]' }, proposalId));
    expect(response.statusCode).toBe(400);
    expect(body(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: proposalId' });
    expect(core.declineProposal).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'invalid_request', username: 'alice', role: 'user', status: 400 });
  });

  it.each([
    ['proposal_not_found', 404, 'proposal_not_found', 'info'],
  ])('answers the refusal %s with %i and logs the outcome', async (refusal, status, outcome, level) => {
    core.declineProposal.mockResolvedValue({ ok: false, refusal, log: { conversationId: null, outcome, proposalId: PROPOSAL } });

    const response = await handler(caller('alice', ['user']));

    expect(response.statusCode).toBe(status);
    expect(body(response)).toEqual({ error: refusal, message: expect.any(String) });
    expect(logLine()).toMatchObject({ level, username: 'alice', role: 'user', conversationId: null, outcome, proposalId: PROPOSAL, status });
  });

  it('answers 401 without the identity of the authorizer', async () => {
    const response = await handler(eventWith(undefined));
    expect(response.statusCode).toBe(401);
    expect(core.declineProposal).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'unauthorized', status: 401 });
  });

  it('answers 403 to a token in neither group, before the proposal id is looked at', async () => {
    const response = await handler(caller('mallory', ['guests'], 'not-a-ulid'));
    expect(response.statusCode).toBe(403);
    expect(body(response)).toEqual({ error: 'forbidden', message: expect.any(String) });
    expect(core.declineProposal).not.toHaveBeenCalled();
    expect(logLine()).toMatchObject({ outcome: 'forbidden', username: 'mallory', role: null, status: 403 });
  });

  it('answers 500 when the core throws, with the reason in the log and not in the answer', async () => {
    core.declineProposal.mockRejectedValue(new Error('ASSISTANT_TABLE is not set'));

    const response = await handler(caller('alice', ['user']));

    expect(response.statusCode).toBe(500);
    expect(body(response)).toEqual({ error: 'internal_error', message: 'The assistant could not decline' });
    expect(logLine()).toMatchObject({ level: 'error', outcome: 'error', status: 500, reason: { name: 'Error', message: 'ASSISTANT_TABLE is not set' } });
  });
});
