import { z } from 'zod';
import { getClaims } from '../../../../src/lib/auth';
import type { ToolCaller } from '../../../../src/assistant/tools/event';
import { runRead } from '../../../../src/assistant/tools/run';
import type { Tool } from '../../../../src/assistant/tools/tool';
import recorded from './recorded/routes.json';

const NOW = '2026-11-21T14:05:00.000Z';
const ALICE: ToolCaller = { sub: 'sub-alice', username: 'alice', role: 'user', requestId: 'req-7' };
const ADMIN: ToolCaller = { sub: 'sub-admin', username: 'admin', role: 'admin', requestId: 'req-8' };
const USER_CONTEXT = { timeZone: 'Europe/Rome', role: 'user' as const };

// Stand-ins for tools: the handler is a mock, so no route runs.
const handler = vi.fn();
const fake = (name: string, over: Partial<Tool['definition']> = {}): Tool => ({
  definition: {
    name,
    description: 'A tool of the test.',
    kind: 'read',
    roles: ['admin', 'user'],
    input: () => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
    reads: 'calendar',
    ...over,
  },
  toHandler: { handler, request: (input) => ({ routeKey: 'GET /calendar', path: '/calendar', query: input as Record<string, string> }) },
  toModel: (body) => ({ fields: { got: body } }),
});
const TOOLS = [fake('look'), fake('look_at_everyone', { roles: ['admin'], reads: 'appointments' }), fake('book', { kind: 'change' })];
const ask = (name: string, input: unknown = { from: '2026-11-23' }) => ({ id: 'toolu_1', name, input });
const answer = (statusCode: number, body: unknown) => ({ statusCode, body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  handler.mockResolvedValue(answer(200, { days: 7 }));
});
afterEach(() => vi.useRealTimers());

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('runRead (7.4, 8.1)', () => {
  it("calls the route's handler with the person's identity and the request's id, and gives its answer as the result", async () => {
    handler.mockImplementation(() => {
      vi.advanceTimersByTime(35);
      return Promise.resolve(answer(200, { days: 7 }));
    });

    const outcome = await runRead(ask('look'), TOOLS, ALICE, USER_CONTEXT, NOW);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0];
    expect(getClaims(event)).toEqual({ ok: true, value: { sub: 'sub-alice', username: 'alice', groups: ['user'] } });
    expect(event).toMatchObject({ routeKey: 'GET /calendar', queryStringParameters: { from: '2026-11-23' }, requestContext: { requestId: 'req-7' } });
    expect(outcome).toEqual({
      result: { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"got":{"days":7}}' },
      log: { name: 'look', status: 200, ms: 35 },
      reads: 'calendar',
    });
  });

  it('a tool that does not exist: an error result that names the tools of the role, no handler called, no made-up name in the log', async () => {
    const outcome = await runRead(ask('delete_everything'), TOOLS, ALICE, USER_CONTEXT, NOW);

    expect(handler).not.toHaveBeenCalled();
    expect(outcome.result).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: JSON.stringify({ error: 'unknown_tool', message: 'There is no tool with this name. The tools are: look, book.' }),
      is_error: true,
    });
    expect(outcome.log).toEqual({ name: null, notRun: 'unknown_tool' });
    expect(outcome.reads).toBeNull();
  });

  it("a tool of the Administrator asked for a User: the same sentence, which does not confirm the name, and no handler called", async () => {
    const outcome = await runRead(ask('look_at_everyone'), TOOLS, ALICE, USER_CONTEXT, NOW);

    expect(handler).not.toHaveBeenCalled();
    expect(JSON.parse(outcome.result.content)).toEqual({ error: 'not_offered', message: 'There is no tool with this name. The tools are: look, book.' });
    expect(outcome.result.is_error).toBe(true);
    expect(outcome.log).toEqual({ name: 'look_at_everyone', notRun: 'not_offered' });

    const forAdmin = await runRead(ask('look_at_everyone'), TOOLS, ADMIN, { ...USER_CONTEXT, role: 'admin' }, NOW);
    expect(forAdmin.log).toMatchObject({ name: 'look_at_everyone', status: 200 });
    expect(forAdmin.reads).toBe('appointments');
  });

  it('a tool that changes the calendar is never run as a read', async () => {
    const outcome = await runRead(ask('book'), TOOLS, ALICE, USER_CONTEXT, NOW);
    expect(handler).not.toHaveBeenCalled();
    expect(outcome.result.is_error).toBe(true);
    expect(outcome.log).toEqual({ name: 'book', notRun: 'not_a_read' });
  });

  it.each([
    [{ from: 'next Monday' }, 'from: '],
    [{ from: '2026-11-23', username: 'bob' }, 'the input: '],
    [null, 'the input: '],
  ])('an input the schema refuses (%j): an error result that says what is wrong and what is expected, no handler called', async (input, where) => {
    const outcome = await runRead(ask('look', input), TOOLS, ALICE, USER_CONTEXT, NOW);

    expect(handler).not.toHaveBeenCalled();
    const said = JSON.parse(outcome.result.content) as { error: string; message: string };
    expect(said.error).toBe('invalid_input');
    expect(said.message).toContain(where);
    expect(said.message).toContain('"additionalProperties":false');
    expect(outcome.result.is_error).toBe(true);
    expect(outcome.log).toEqual({ name: 'look', notRun: 'invalid_input' });
  });

  it("a refusal of the route is a result: its code and its message, marked as an error", async () => {
    for (const refusal of [recorded.refusals.calendar, recorded.refusals.appointments]) {
      handler.mockResolvedValue(answer(refusal.status, refusal.body));
      const outcome = await runRead(ask('look'), TOOLS, ALICE, USER_CONTEXT, NOW);
      expect(outcome.result).toEqual({ type: 'tool_result', tool_use_id: 'toolu_1', content: JSON.stringify(refusal.body), is_error: true });
      expect(outcome.log).toEqual({ name: 'look', status: refusal.status, ms: 0 });
      expect(outcome.reads).toBe('calendar');
    }
  });

  it('gives of a refusal the code and the message only', async () => {
    handler.mockResolvedValue(answer(409, { error: 'slot_taken', message: 'Taken', conflicts: [{ username: 'bob' }] }));
    const outcome = await runRead(ask('look'), TOOLS, ALICE, USER_CONTEXT, NOW);
    expect(outcome.result.content).toBe('{"error":"slot_taken","message":"Taken"}');
  });

  it.each([
    ['answers 500 without a body', () => Promise.resolve({ statusCode: 500 }), 500],
    ['answers a body that is not JSON', () => Promise.resolve(answer(502, '<html>')), 502],
    ['answers no status at all', () => Promise.resolve({}), 500],
    ['throws', () => Promise.reject(new Error('the table is gone')), 500],
  ])('a route that %s is told to Claude as a failure, with nothing of what went wrong', async (_what, behaviour, status) => {
    handler.mockImplementation(behaviour);
    const outcome = await runRead(ask('look'), TOOLS, ALICE, USER_CONTEXT, NOW);
    expect(outcome.result).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: '{"error":"internal_error","message":"The calendar could not be read."}',
      is_error: true,
    });
    expect(outcome.log).toMatchObject({ name: 'look', status });
  });
});
