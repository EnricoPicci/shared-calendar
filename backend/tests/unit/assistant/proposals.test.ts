import { assistantTexts } from '@shared-calendar/shared';
import { z } from 'zod';
import type { Proposal } from '../../../src/assistant/proposal';
import { toolsForClaude, type ReadTool, type RouteHandler, type Tool } from '../../../src/assistant/tools/tool';
import type { Conversation, StoredMessage } from '../../../src/lib/assistantDb';
import { getClaims } from '../../../src/lib/auth';

// Claude and the table are replaced, and so is every route of the calendar: the tools given to
// the core are stand-ins whose handlers are mocks. Nothing reaches a network. The core reads its
// configuration once per container, so each test loads a fresh copy.
const db = vi.hoisted(() => {
  class AssistantBusyError extends Error {}
  return {
    AssistantBusyError,
    readConversation: vi.fn(),
    readDailyUse: vi.fn(),
    startConversation: vi.fn(),
    saveStep: vi.fn(),
    takeProposal: vi.fn(),
    endConversation: vi.fn(),
  };
});
const claude = vi.hoisted(() => ({ askStep: vi.fn(), askLanguage: vi.fn(), assistantModel: vi.fn(), STEP_TIMEOUT_MS: 22_000 }));
vi.mock('../../../src/lib/assistantDb', () => db);
vi.mock('../../../src/lib/anthropic', () => claude);

let exchange: typeof import('../../../src/assistant/exchange');
let confirm: typeof import('../../../src/assistant/confirm');
let decline: typeof import('../../../src/assistant/decline');
let conversations: typeof import('../../../src/assistant/conversation');
let prompt: typeof import('../../../src/assistant/prompt');

const NOW = '2026-11-21T14:05:00.000Z';
const AT = '2026-11-21T13:00:00.000Z';
const ALICE = { sub: 'sub-alice', username: 'alice', role: 'user' as const };
const ADMIN = { sub: 'sub-admin', username: 'admin', role: 'admin' as const };
const ID = '01JD0000000000000000000001';
const PROPOSAL = '01JD00000000000000000PR0P1';
const TEXT = 'Book me Tuesday at 10';
const NOTE = 'Bring the forms';
const CLAUDE_SAID = 'I will book Wednesday at noon for you.';
const DONE = 'Done: Tuesday 24 November at 10:00.';
const USAGE = { inputTokens: 100, outputTokens: 40, cacheReadTokens: 6000, cacheWriteTokens: 300 };
const REQUEST = { requestId: 'req-9', remainingMs: null };
const IT = assistantTexts('it');
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// The stand-ins. `calendar` is a read. `book` is a change offered to Users: its confirmation
// reads its facts through the route `factsHandler`, and its change route is `bookHandler`, which
// only the confirmation is given. `block` is a change of the Administrator.
const calendarHandler = vi.fn();
const factsHandler = vi.fn();
const bookHandler = vi.fn();
const blockHandler = vi.fn();
const calendar: ReadTool = {
  definition: { name: 'calendar', description: 'The calendar of the test.', kind: 'read', roles: ['admin', 'user'], input: () => z.object({ from: z.string() }).strict(), reads: 'calendar' },
  toHandler: { handler: calendarHandler, request: (input) => ({ routeKey: 'GET /calendar', path: '/calendar', query: input as Record<string, string> }) },
  toModel: (body) => ({ fields: body as Record<string, unknown> }),
};
const change = (name: string, roles: Tool['definition']['roles']): Tool => ({
  definition: { name, description: `The ${name} of the test.`, kind: 'change', roles, input: () => z.object({ date: z.string(), note: z.string().optional() }).strict(), reads: 'calendar' },
  confirmation: {
    read: async (input, _context, route) => {
      const { date, note } = input as { date: string; note?: string };
      const answer = await route(factsHandler, { routeKey: 'GET /facts', path: '/facts', query: { date } });
      if (answer.status !== 200) return { ok: false, error: 'no_free_slot', message: 'There is no free slot then.' };
      return { ok: true, call: { routeKey: `POST /${name}`, path: `/${name}`, body: { start: date, ...(note && { note }) } }, facts: { type: (answer.body as { type: string }).type, date, note: note ?? null } };
    },
    summary: (texts, facts) => {
      const { type, date, note } = facts as { type: string; date: string; note: string | null };
      return `${texts.confirmLabel}: ${date} (${type})${note ? ` ${note}` : ''}`;
    },
  },
  toModel: (body) => ({ fields: { booked: body } }),
});
const TOOLS: Tool[] = [calendar, change('book', ['user']), change('block', ['admin'])];
const HANDLERS: Record<string, RouteHandler> = { book: bookHandler, block: blockHandler };

const markFor = (person: typeof ALICE | typeof ADMIN = ALICE) =>
  prompt.promptVersion(prompt.INSTRUCTIONS, prompt.contextBlock(person, 'Europe/Rome'), toolsForClaude(TOOLS.map((tool) => tool.definition), person.role));

const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  conversationId: ID,
  language: 'it',
  status: 'idle',
  startedAt: AT,
  lastActivityAt: AT,
  messageCount: 1,
  storedBytes: 300,
  nextSeq: 4,
  promptVersion: markFor(),
  proposal: null,
  executing: null,
  version: 3,
  expiresAt: 1795400000,
  ...over,
});

const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
const BOOK = use('toolu_book', 'book', { date: '2026-11-24', note: NOTE });
const LOOK = use('toolu_look', 'calendar', { from: '2026-11-24' });
// An answer of Claude that asks for tools, as the door to Claude gives it.
const asksFor = (...blocks: ReturnType<typeof use>[]) => ({
  kind: 'tool_requests',
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: CLAUDE_SAID }, ...blocks],
  requests: blocks.map(({ id, name, input }) => ({ id, name, input })),
  usage: USAGE,
});
const says = (text: string) => ({ kind: 'text', content: [{ type: 'text', text, citations: null }], text, usage: USAGE });
const routeAnswer = (body: unknown, statusCode = 200) => Promise.resolve({ statusCode, body: JSON.stringify(body) });

const EARLIER: StoredMessage[] = [
  { seq: 1, at: AT, kind: 'model', content: { role: 'user', content: 'Buongiorno.' } },
  { seq: 2, at: AT, kind: 'model', content: { role: 'system', content: 'A line of the application.' } },
  { seq: 3, at: AT, kind: 'model', content: { role: 'assistant', content: [{ type: 'text', text: 'Buongiorno.' }] } },
];
// An idle conversation of the person.
const idle = (person: typeof ALICE | typeof ADMIN = ALICE) =>
  db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: markFor(person) }), messages: EARLIER });

const SUMMARY = `${IT.confirmLabel}: 2026-11-24 (Visit) ${NOTE}`;
const KEPT = { type: 'tool_result' as const, tool_use_id: 'toolu_look', content: '{"days":1}' };
const STORED_PROPOSAL: Proposal = {
  proposalId: PROPOSAL,
  changes: [{ toolUseId: 'toolu_book', tool: 'book', call: { routeKey: 'POST /book', path: '/book', body: { start: '2026-11-24', note: NOTE } }, summary: SUMMARY, outcome: null, error: null }],
  keptBack: [KEPT],
};
const WAITING_MESSAGES: StoredMessage[] = [
  ...EARLIER,
  { seq: 4, at: AT, kind: 'model', content: { role: 'user', content: TEXT } },
  { seq: 5, at: AT, kind: 'model', content: { role: 'system', content: 'A line of the application.' } },
  { seq: 6, at: AT, kind: 'model', content: { role: 'assistant', content: [{ type: 'text', text: CLAUDE_SAID }, LOOK, BOOK] as never } },
];
// A conversation whose proposal waits for the person: Claude asked to look and to book in one
// answer, the look was run and its result kept back. `taken` ms ago a confirmation took it.
const waiting = (over: Partial<Conversation> = {}, taken?: number) => {
  const executing = taken === undefined ? null : { proposalId: PROPOSAL, at: new Date(Date.parse(NOW) - taken).toISOString() };
  const read = conversation({ status: 'awaiting_confirmation', proposal: STORED_PROPOSAL, executing, messageCount: 2, nextSeq: 7, ...over });
  db.readConversation.mockResolvedValue({ version: read.version, conversation: read, messages: WAITING_MESSAGES });
  return read;
};

const steps = () => db.saveStep.mock.calls.map((call) => call[2] as { messages: { kind: string; content: unknown; fromPerson?: boolean }[]; status: string; proposal: Proposal | null });
const entriesGiven = () => (claude.askStep.mock.calls[0]?.[0] as { conversation: unknown[] }).conversation;
const untouched = () => {
  expect(claude.askStep).not.toHaveBeenCalled();
  expect(db.saveStep).not.toHaveBeenCalled();
  expect(db.takeProposal).not.toHaveBeenCalled();
};
const noChangeRun = () => {
  expect(bookHandler).not.toHaveBeenCalled();
  expect(blockHandler).not.toHaveBeenCalled();
};

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.stubEnv('ASSISTANT_DAILY_MESSAGE_LIMIT', '10');
  vi.resetModules();
  exchange = await import('../../../src/assistant/exchange');
  confirm = await import('../../../src/assistant/confirm');
  decline = await import('../../../src/assistant/decline');
  conversations = await import('../../../src/assistant/conversation');
  prompt = await import('../../../src/assistant/prompt');
  claude.assistantModel.mockReturnValue('claude-sonnet-5-5');
  claude.askStep.mockResolvedValue(says(DONE));
  db.readDailyUse.mockResolvedValue({ messages: 4, inputTokens: 0, outputTokens: 0 });
  db.saveStep.mockImplementation((_sub, read: Conversation, step: { messages: unknown[]; status: Conversation['status']; proposal: Proposal | null }) =>
    Promise.resolve({ ...read, status: step.status, proposal: step.proposal, executing: null, nextSeq: read.nextSeq + step.messages.length, version: read.version + 1 }),
  );
  db.takeProposal.mockImplementation((_sub, read: Conversation, proposalId: string, now: string) =>
    Promise.resolve(read.proposal?.proposalId === proposalId && read.executing === null ? { ...read, executing: { proposalId, at: now }, version: read.version + 1 } : null),
  );
  calendarHandler.mockImplementation(() => routeAnswer({ days: 1 }));
  factsHandler.mockImplementation(() => routeAnswer({ type: 'Visit' }));
  bookHandler.mockImplementation(() => routeAnswer({ appointmentId: 'appt-1' }, 201));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// What must never be in a log line: a note, the wording of a proposal, a text of the person or of
// Claude, what a route was sent or answered.
const expectNoText = (log: unknown) => {
  const line = JSON.stringify(log);
  for (const text of [NOTE, 'Visit', TEXT, CLAUDE_SAID, DONE, '2026-11-24', 'appt-1', IT.confirmLabel]) expect(line).not.toContain(text);
};

// Test names: the rules are those of docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, and the
// other section numbers are those of the same document.
describe('the rules of a proposal (5.5)', () => {
  it('rule 1, the model cannot make a change: a change Claude asks for is not run, it is saved as a proposal and the conversation waits', async () => {
    idle();
    const answer = asksFor(BOOK);
    claude.askStep.mockResolvedValue(answer);

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    noChangeRun();
    // Claude's answer exactly as given and the proposal, in one write; no entry of results yet.
    expect(db.saveStep).toHaveBeenCalledTimes(1);
    const [step] = steps();
    expect(step?.status).toBe('awaiting_confirmation');
    expect(step?.messages).toEqual([
      { kind: 'model', content: { role: 'user', content: TEXT }, fromPerson: true },
      { kind: 'model', content: { role: 'system', content: expect.any(String) } },
      { kind: 'model', content: { role: 'assistant', content: answer.content } },
    ]);
    expect((step?.messages[2] as { content: { content: unknown } }).content.content).toBe(answer.content);
    expect(step?.proposal).toEqual({ ...STORED_PROPOSAL, proposalId: expect.stringMatching(ULID), keptBack: [] });
    expect(result).toMatchObject({
      ok: true,
      reply: {
        status: 'awaiting_confirmation',
        activity: null,
        proposal: {
          proposalId: step?.proposal?.proposalId,
          question: IT.proposalQuestion(1),
          confirmLabel: IT.confirmLabel,
          declineLabel: IT.declineLabel,
          actions: [{ summary: SUMMARY, outcome: null, error: null }],
        },
      },
    });
  });

  it('rule 1: no sentence typed by anybody is a confirmation, a typed "yes" runs nothing', async () => {
    waiting();
    await exchange.sendMessage(ALICE, 'yes', NOW, REQUEST, TOOLS);
    noChangeRun();
    expect(db.takeProposal).not.toHaveBeenCalled();
  });

  it('rule 1: `continue` runs nothing either, a proposal that waits has nothing to continue', async () => {
    waiting();
    expect(await exchange.continueExchange(ALICE, NOW, REQUEST, TOOLS)).toEqual({ ok: false, refusal: 'nothing_to_continue', log: { conversationId: ID, outcome: 'nothing_to_continue' } });
    noChangeRun();
    untouched();
  });

  it("rule 2, the confirmation is written by the server: its words come from the checked input and from facts read with the person's identity, never from Claude's text", async () => {
    idle();
    claude.askStep.mockResolvedValue(asksFor(BOOK));

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    expect(factsHandler).toHaveBeenCalledTimes(1);
    const event = factsHandler.mock.calls[0]?.[0];
    expect(getClaims(event)).toEqual({ ok: true, value: { sub: 'sub-alice', username: 'alice', groups: ['user'] } });
    expect(event).toMatchObject({ routeKey: 'GET /facts', queryStringParameters: { date: '2026-11-24' }, requestContext: { requestId: 'req-9' } });
    const proposal = result.ok ? result.reply.proposal : null;
    expect(proposal?.actions[0]?.summary).toBe(SUMMARY);
    expect(JSON.stringify(proposal)).not.toContain('Wednesday');
    // What will be run is stored with the proposal, exactly.
    expect(steps()[0]?.proposal?.changes[0]?.call).toEqual({ routeKey: 'POST /book', path: '/book', body: { start: '2026-11-24', note: NOTE } });
  });

  it('rule 2: when the facts cannot be read there is no proposal, Claude gets the reason and the step goes on like a read', async () => {
    idle();
    factsHandler.mockImplementation(() => routeAnswer({ error: 'x', message: 'y' }, 409));
    claude.askStep.mockResolvedValue(asksFor(BOOK));

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    noChangeRun();
    const [step] = steps();
    expect(step?.status).toBe('working');
    expect(step?.proposal).toBeNull();
    expect(step?.messages[3]).toEqual({
      kind: 'model',
      content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_book', content: '{"error":"no_free_slot","message":"There is no free slot then."}', is_error: true }] },
    });
    expect(result).toMatchObject({ ok: true, reply: { status: 'working', proposal: null }, log: { outcome: 'tool_requests', tools: [{ name: 'book', notRun: 'not_possible', status: 409, ms: 0 }] } });
    expect(result.log).not.toHaveProperty('proposed');
  });

  it('rule 3, confirming does not skip a check: the route runs again at that moment, and its refusal is the outcome shown', async () => {
    waiting();
    bookHandler.mockImplementation(() => routeAnswer({ error: 'slot_taken', message: 'That slot was taken' }, 409));

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);

    expect(bookHandler).toHaveBeenCalledTimes(1);
    const [outcome] = steps();
    expect(outcome?.proposal?.changes[0]).toMatchObject({ outcome: 'refused', error: 'slot_taken' });
    expect((outcome?.messages[0]?.content as { content: unknown[] }).content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_book',
      content: '{"error":"slot_taken","message":"That slot was taken"}',
      is_error: true,
    });
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', proposal: { proposalId: PROPOSAL, actions: [{ summary: SUMMARY, outcome: 'refused', error: 'slot_taken' }] } } });
  });

  it('rule 4, one proposal at a time: the stored proposal is a list of changes, and the reads of the same answer are run at once and kept back', async () => {
    idle();
    const answer = asksFor(LOOK, BOOK);
    claude.askStep.mockResolvedValue(answer);

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    expect(calendarHandler).toHaveBeenCalledTimes(1);
    const [step] = steps();
    expect(Array.isArray(step?.proposal?.changes)).toBe(true);
    expect(step?.proposal?.changes).toHaveLength(1);
    expect(step?.proposal?.keptBack).toEqual([KEPT]);
    // The result of the read is not in the conversation yet: Claude's answer is its last entry.
    expect(step?.messages).toHaveLength(3);
    expect(step?.messages[2]?.content).toEqual({ role: 'assistant', content: answer.content });
    expect(result).toMatchObject({
      log: {
        outcome: 'proposal',
        proposed: ['book'],
        tools: [
          { name: 'calendar', status: 200, ms: 0 },
          { name: 'book', status: 200, ms: 0, proposed: true },
        ],
      },
    });
  });

  it('rule 4: asked for several changes in one answer, each is answered "one change at a time", none is proposed, and the step goes on', async () => {
    idle();
    claude.askStep.mockResolvedValue(asksFor(BOOK, LOOK, use('toolu_book2', 'book', { date: '2026-11-25' })));

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    noChangeRun();
    expect(factsHandler).not.toHaveBeenCalled();
    const [step] = steps();
    expect(step?.status).toBe('working');
    expect(step?.proposal).toBeNull();
    const results = (step?.messages[3]?.content as { content: { tool_use_id: string; content: string; is_error?: boolean }[] }).content;
    expect(results.map((result) => result.tool_use_id)).toEqual(['toolu_book', 'toolu_look', 'toolu_book2']);
    for (const refused of [results[0], results[2]]) {
      expect(JSON.parse(refused!.content)).toMatchObject({ error: 'one_change_at_a_time' });
      expect(refused!.is_error).toBe(true);
    }
    expect(results[1]).toEqual(KEPT);
    expect(result).toMatchObject({ ok: true, reply: { status: 'working', proposal: null }, log: { tools: [{ name: 'book', notRun: 'one_change_at_a_time' }, { name: 'calendar', status: 200 }, { name: 'book', notRun: 'one_change_at_a_time' }] } });
  });

  it('rule 5, writing instead of pressing drops the proposal: Claude is told nothing was changed and reads the new message, in one write and one request', async () => {
    waiting();
    claude.askStep.mockResolvedValue(says('At eleven, then?'));

    const result = await exchange.sendMessage(ALICE, 'no, at eleven', NOW, REQUEST, TOOLS);

    noChangeRun();
    expect(claude.askStep).toHaveBeenCalledTimes(1);
    expect(db.saveStep).toHaveBeenCalledTimes(1);
    const [step] = steps();
    expect(step?.status).toBe('idle');
    expect(step?.proposal).toBeNull();
    const dropped = { type: 'tool_result', tool_use_id: 'toolu_book', content: expect.stringContaining('nothing was changed') };
    expect(step?.messages).toEqual([
      { kind: 'model', content: { role: 'user', content: [dropped, KEPT] } },
      { kind: 'model', content: { role: 'user', content: 'no, at eleven' }, fromPerson: true },
      { kind: 'model', content: { role: 'system', content: expect.any(String) } },
      { kind: 'model', content: { role: 'assistant', content: expect.any(Array) } },
    ]);
    expect(JSON.parse((step?.messages[0]?.content as { content: { content: string }[] }).content[0]!.content)).toMatchObject({ outcome: 'not_confirmed', message: expect.stringContaining('No text the person writes is a confirmation') });
    // Claude is given the stored conversation, then the results, the message and the line.
    expect(entriesGiven().slice(-4, -1)).toEqual([WAITING_MESSAGES[5]!.content, { role: 'user', content: [dropped, KEPT] }, { role: 'user', content: 'no, at eleven' }]);
    // It is a message of the day.
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', proposal: null, remainingToday: 5, messages: [{ from: 'person', text: 'no, at eleven' }, { from: 'assistant', text: 'At eleven, then?' }] }, log: { droppedProposal: true } });
  });

  it('rule 5: after a typed "yes" Claude can only propose again, and the buttons are shown again', async () => {
    waiting();
    claude.askStep.mockResolvedValue(asksFor(use('toolu_again', 'book', { date: '2026-11-24', note: NOTE })));

    const result = await exchange.sendMessage(ALICE, 'yes', NOW, REQUEST, TOOLS);

    noChangeRun();
    const [step] = steps();
    expect(step?.status).toBe('awaiting_confirmation');
    expect(step?.proposal?.proposalId).not.toBe(PROPOSAL);
    expect(step?.proposal?.changes[0]?.toolUseId).toBe('toolu_again');
    expect(result).toMatchObject({ ok: true, reply: { status: 'awaiting_confirmation', proposal: { actions: [{ outcome: null }] } } });
  });

  it('rule 6, a confirmation runs once: of two at the same moment, the one that does not take the proposal finds none and runs nothing', async () => {
    waiting();
    db.takeProposal.mockResolvedValue(null);

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);

    expect(result).toEqual({ ok: false, refusal: 'proposal_not_found', log: { conversationId: ID, outcome: 'proposal_not_found' } });
    noChangeRun();
    expect(db.saveStep).not.toHaveBeenCalled();
    expect(claude.askStep).not.toHaveBeenCalled();
  });

  it('rule 6: taken and never finished, the next step records "outcome unknown" and Claude is told to read the calendar before saying anything', async () => {
    waiting({}, 31_000);

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, TOOLS);

    noChangeRun();
    const [step] = steps();
    const told = (step?.messages[0]?.content as { content: { tool_use_id: string; content: string }[] }).content;
    expect(told[0]?.tool_use_id).toBe('toolu_book');
    expect(JSON.parse(told[0]!.content)).toEqual({ outcome: 'unknown', message: expect.stringContaining('Read the calendar with a tool before saying anything about it') });
    expect(told[1]).toEqual(KEPT);
    expect(step?.proposal?.changes[0]).toMatchObject({ outcome: 'unknown', error: null });
    expect(claude.askStep).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', proposal: { actions: [{ outcome: 'unknown', error: null }] } }, log: { settledUnknown: true } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: Claude asks for a change (5.4, 7.4)', () => {
  it("a change of the other role is answered like a tool that does not exist, and nothing is proposed", async () => {
    idle();
    claude.askStep.mockResolvedValue(asksFor(use('toolu_block', 'block', { date: '2026-11-24' })));

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    noChangeRun();
    expect(factsHandler).not.toHaveBeenCalled();
    expect(steps()[0]).toMatchObject({ status: 'working', proposal: null });
    expect(result.log).toMatchObject({ tools: [{ name: 'block', notRun: 'not_offered' }] });
  });

  it('a change with an input its schema refuses is answered with what is expected, and nothing is proposed', async () => {
    idle();
    claude.askStep.mockResolvedValue(asksFor(use('toolu_book', 'book', { date: '2026-11-24', end: '11:00' })));

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    expect(factsHandler).not.toHaveBeenCalled();
    expect(steps()[0]).toMatchObject({ status: 'working', proposal: null });
    expect(result.log).toMatchObject({ tools: [{ name: 'book', notRun: 'invalid_input' }] });
  });

  it('the Administrator is proposed the change of the Administrator, worded in the language of the conversation', async () => {
    idle(ADMIN);
    claude.askStep.mockResolvedValue(asksFor(use('toolu_block', 'block', { date: '2026-11-24' })));

    const result = await exchange.sendMessage(ADMIN, TEXT, NOW, REQUEST, TOOLS);

    expect(getClaims(factsHandler.mock.calls[0]?.[0])).toMatchObject({ value: { username: 'admin', groups: ['admin'] } });
    expect(result).toMatchObject({ ok: true, reply: { proposal: { actions: [{ summary: `${IT.confirmLabel}: 2026-11-24 (Visit)` }] } }, log: { proposed: ['block'] } });
  });

  it('a proposal at the first message of a conversation is started with it, in one write', async () => {
    db.readConversation.mockResolvedValue({ version: 0, conversation: null, messages: [] });
    claude.askLanguage.mockResolvedValue({ kind: 'language', language: 'en', usage: USAGE });
    claude.askStep.mockResolvedValue(asksFor(BOOK));
    db.startConversation.mockImplementation((_sub, _version, _start, step: { messages: unknown[]; status: Conversation['status'] }) =>
      Promise.resolve(conversation({ language: 'en', status: step.status, nextSeq: 1 + step.messages.length, version: 1 })),
    );

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);

    expect(db.startConversation.mock.calls[0]?.[3]).toMatchObject({ status: 'awaiting_confirmation', proposal: { changes: [{ tool: 'book' }] } });
    expect(result).toMatchObject({ ok: true, reply: { status: 'awaiting_confirmation', proposal: { confirmLabel: assistantTexts('en').confirmLabel } } });
  });

  it('the count of requests for a message is unchanged: the eighth answer may still make a proposal', async () => {
    const messages: StoredMessage[] = [...EARLIER, { seq: 4, at: AT, kind: 'model', content: { role: 'user', content: TEXT } }];
    for (let i = 0; i < 7; i++) {
      messages.push({ seq: 5 + 2 * i, at: AT, kind: 'model', content: { role: 'assistant', content: [use(`toolu_${i}`, 'calendar', {})] as never } });
      messages.push({ seq: 6 + 2 * i, at: AT, kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${i}`, content: '{}' }] } });
    }
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ status: 'working', nextSeq: 19 }), messages });
    claude.askStep.mockResolvedValue(asksFor(BOOK));

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, TOOLS);

    expect(result).toMatchObject({ ok: true, reply: { status: 'awaiting_confirmation' }, log: { steps: 8, outcome: 'proposal' } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('book_appointment and the roles (3)', () => {
  it("a User's request names book_appointment, the Administrator's never does", async () => {
    const { DEFINITIONS } = await import('../../../src/assistant/tools/list');
    const real = (person: typeof ALICE | typeof ADMIN) => prompt.promptVersion(prompt.INSTRUCTIONS, prompt.contextBlock(person, 'Europe/Rome'), toolsForClaude(DEFINITIONS, person.role));
    const namesGiven = () => (claude.askStep.mock.calls.at(-1)?.[0] as { tools: { name: string }[] }).tools.map((tool) => tool.name);

    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: real(ALICE) }), messages: EARLIER });
    await exchange.sendMessage(ALICE, TEXT, NOW);
    expect(namesGiven()).toContain('book_appointment');

    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: real(ADMIN) }), messages: EARLIER });
    await exchange.sendMessage(ADMIN, 'Book alice on Tuesday at 10', NOW);
    expect(namesGiven()).toEqual(['get_settings', 'list_types', 'get_calendar', 'list_appointments']);
  });

  it('asked for by Claude for the Administrator all the same, book_appointment is answered as a tool that does not exist: no proposal', async () => {
    const { DEFINITIONS } = await import('../../../src/assistant/tools/list');
    const mark = prompt.promptVersion(prompt.INSTRUCTIONS, prompt.contextBlock(ADMIN, 'Europe/Rome'), toolsForClaude(DEFINITIONS, 'admin'));
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: mark }), messages: EARLIER });
    claude.askStep.mockResolvedValue(asksFor(use('toolu_book', 'book_appointment', { date: '2026-11-24', time: '10:00' })));

    const result = await exchange.sendMessage(ADMIN, 'Book alice on Tuesday at 10', NOW);

    expect(steps()[0]).toMatchObject({ status: 'working', proposal: null });
    expect(result).toMatchObject({ ok: true, reply: { proposal: null }, log: { tools: [{ name: 'book_appointment', notRun: 'not_offered' }] } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a message while a proposal waits (5.5 rule 5, 6)', () => {
  it.each([
    ['the daily limit is reached', () => db.readDailyUse.mockResolvedValue({ messages: 10, inputTokens: 0, outputTokens: 0 }), {}, 'assistant_limit_reached'],
    ['the conversation is full of messages', () => undefined, { messageCount: 60 }, 'conversation_full'],
  ])('refused because %s: nothing is saved and the proposal keeps waiting', async (_why, arrange, over, refusal) => {
    waiting(over);
    arrange();
    expect(await exchange.sendMessage(ALICE, 'no, at eleven', NOW, REQUEST, TOOLS)).toMatchObject({ ok: false, refusal });
    untouched();
    noChangeRun();
  });

  it('Claude cannot be asked: the proposal is dropped all the same, the message kept, and the step left to continue', async () => {
    waiting();
    claude.askStep.mockResolvedValue({ kind: 'unavailable', reason: 'timeout' });

    const result = await exchange.sendMessage(ALICE, 'no, at eleven', NOW, REQUEST, TOOLS);

    expect(result).toMatchObject({ ok: false, refusal: 'assistant_unavailable' });
    expect(steps()[0]).toMatchObject({ status: 'working', proposal: null });
    expect(steps()[0]?.messages).toHaveLength(3);
  });

  it('a confirmation took the proposal less than 31 seconds ago: the conversation is busy and nothing is written', async () => {
    waiting({}, 30_999);
    expect(await exchange.sendMessage(ALICE, 'and now?', NOW, REQUEST, TOOLS)).toEqual({ ok: false, refusal: 'assistant_busy', log: { conversationId: ID, outcome: 'busy' } });
    untouched();
  });

  it('a confirmation took it 31 seconds ago or more and never finished: the message settles it with the outcome unknown, then is read', async () => {
    waiting({}, 31_000);

    const result = await exchange.sendMessage(ALICE, 'and now?', NOW, REQUEST, TOOLS);

    noChangeRun();
    const [step] = steps();
    expect(JSON.parse((step?.messages[0]?.content as { content: { content: string }[] }).content[0]!.content)).toMatchObject({ outcome: 'unknown' });
    expect(step?.messages[1]).toEqual({ kind: 'model', content: { role: 'user', content: 'and now?' }, fromPerson: true });
    expect(step?.proposal).toBeNull();
    expect(result).toMatchObject({ ok: true, reply: { proposal: null } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('continue and a proposal (5.5 rule 6, 6)', () => {
  it('a confirmation took the proposal less than 31 seconds ago: busy, nothing asked and nothing written', async () => {
    waiting({}, 30_999);
    expect(await exchange.continueExchange(ALICE, NOW, REQUEST, TOOLS)).toEqual({ ok: false, refusal: 'assistant_busy', log: { conversationId: ID, outcome: 'busy' } });
    untouched();
  });

  it('after a confirmation whose closing words are still owed, it asks Claude and the settled proposal stays shown', async () => {
    const settled: Proposal = { ...STORED_PROPOSAL, changes: [{ ...STORED_PROPOSAL.changes[0]!, outcome: 'done' }] };
    const read = conversation({ status: 'working', proposal: settled, nextSeq: 8 });
    db.readConversation.mockResolvedValue({ version: 3, conversation: read, messages: WAITING_MESSAGES });

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, TOOLS);

    expect(steps()[0]?.proposal).toEqual(settled);
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', proposal: { actions: [{ outcome: 'done' }] }, messages: [{ from: 'assistant', text: DONE }] } });
    expect(result.log).not.toHaveProperty('proposed');
  });

  it("a settled proposal stops being shown at the person's next message", async () => {
    const settled: Proposal = { ...STORED_PROPOSAL, changes: [{ ...STORED_PROPOSAL.changes[0]!, outcome: 'done' }] };
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ proposal: settled }), messages: EARLIER });

    const result = await exchange.sendMessage(ALICE, 'Thank you', NOW, REQUEST, TOOLS);

    expect(steps()[0]?.proposal).toBeNull();
    expect(result).toMatchObject({ ok: true, reply: { proposal: null }, log: {} });
    expect(result.log).not.toHaveProperty('droppedProposal');
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('confirmProposal (POST /assistant/proposals/{proposalId}/confirm, 5.4, 6)', () => {
  it("takes the proposal, runs the change with the identity of this request and exactly what was stored, saves the outcome, then asks Claude for the closing words", async () => {
    const read = waiting();
    bookHandler.mockImplementation(() => {
      vi.advanceTimersByTime(40);
      return routeAnswer({ appointmentId: 'appt-1' }, 201);
    });

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);

    expect(db.takeProposal).toHaveBeenCalledWith('sub-alice', read, PROPOSAL, NOW);
    expect(bookHandler).toHaveBeenCalledTimes(1);
    const event = bookHandler.mock.calls[0]?.[0];
    expect(getClaims(event)).toEqual({ ok: true, value: { sub: 'sub-alice', username: 'alice', groups: ['user'] } });
    expect(event).toMatchObject({ routeKey: 'POST /book', body: JSON.stringify({ start: '2026-11-24', note: NOTE }), requestContext: { requestId: 'req-9' } });

    // Two writes: the outcome, on the conversation as taken, then the closing words.
    expect(db.saveStep).toHaveBeenCalledTimes(2);
    const [outcome, closing] = steps();
    expect(db.saveStep.mock.calls[0]?.[1]).toMatchObject({ executing: { proposalId: PROPOSAL, at: NOW }, version: 4 });
    expect(outcome).toEqual({
      messages: [{ kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_book', content: JSON.stringify({ outcome: 'done', message: 'The person pressed the confirm button and the change was made. This is what the calendar now holds.', booked: { appointmentId: 'appt-1' } }) }, KEPT] } }],
      status: 'working',
      proposal: { ...STORED_PROPOSAL, changes: [{ ...STORED_PROPOSAL.changes[0], outcome: 'done', error: null }] },
      timeZone: 'Europe/Rome',
    });
    expect(closing).toMatchObject({ status: 'idle', proposal: { changes: [{ outcome: 'done' }] } });
    expect(closing?.messages).toEqual([{ kind: 'model', content: { role: 'assistant', content: says(DONE).content } }]);
    // Claude is given the conversation with the outcome as its last entry, and nothing added.
    expect(entriesGiven().at(-1)).toEqual(outcome?.messages[0]?.content);
    expect(entriesGiven()).toHaveLength(WAITING_MESSAGES.length + 1);

    expect(result).toEqual({
      ok: true,
      reply: {
        conversationId: ID,
        language: 'it',
        status: 'idle',
        messages: [{ seq: 8, from: 'assistant', text: DONE, at: NOW }],
        activity: null,
        proposal: { proposalId: PROPOSAL, question: IT.proposalQuestion(1), confirmLabel: IT.confirmLabel, declineLabel: IT.declineLabel, actions: [{ summary: SUMMARY, outcome: 'done', error: null }] },
        // Not a message of the day: nothing was counted.
        remainingToday: 6,
      },
      log: expect.objectContaining({ conversationId: ID, outcome: 'text', proposalId: PROPOSAL, changes: [{ name: 'book', status: 201, ms: 40 }] }),
    });
  });

  it('saves the outcome before Claude is asked', async () => {
    waiting();
    await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);
    const order = (mock: { mock: { invocationCallOrder: number[] } }, call = 0) => mock.mock.invocationCallOrder[call] ?? 0;
    expect(order(db.takeProposal)).toBeLessThan(order(bookHandler));
    expect(order(bookHandler)).toBeLessThan(order(db.saveStep));
    expect(order(db.saveStep)).toBeLessThan(order(claude.askStep));
    expect(order(claude.askStep)).toBeLessThan(order(db.saveStep, 1));
  });

  it.each([
    ['assistant_unavailable', { kind: 'unavailable', reason: 'timeout' }],
    ['assistant_budget_reached', { kind: 'budget_reached' }],
  ])('503 %s at the closing words: the change stays made and saved, and the conversation waits for `continue`', async (refusal, answer) => {
    waiting();
    claude.askStep.mockResolvedValue(answer);

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);

    expect(bookHandler).toHaveBeenCalledTimes(1);
    const [outcome, closing] = steps();
    expect(outcome).toMatchObject({ status: 'working', proposal: { changes: [{ outcome: 'done' }] } });
    expect(closing).toMatchObject({ status: 'working', messages: [], proposal: { changes: [{ outcome: 'done' }] } });
    expect(result).toMatchObject({ ok: false, refusal, log: { proposalId: PROPOSAL, changes: [{ name: 'book', status: 201 }] } });
  });

  it('with too little time left for a step, Claude is not asked: the outcome is saved and the answer says `working`', async () => {
    waiting();

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, { requestId: 'req-9', remainingMs: () => 23_999 }, TOOLS, HANDLERS);

    expect(claude.askStep).not.toHaveBeenCalled();
    expect(db.saveStep).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      reply: expect.objectContaining({ status: 'working', activity: IT.reading.calendar, messages: [], proposal: expect.objectContaining({ actions: [{ summary: SUMMARY, outcome: 'done', error: null }] }) }),
      log: { conversationId: ID, proposalId: PROPOSAL, changes: [{ name: 'book', status: 201, ms: 0 }], outcome: 'closing_words_left_to_continue' },
    });
  });

  it('with exactly the time a step may take, Claude is asked', async () => {
    waiting();
    await confirm.confirmProposal(ALICE, PROPOSAL, NOW, { requestId: 'req-9', remainingMs: () => 24_000 }, TOOLS, HANDLERS);
    expect(claude.askStep).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the person has no conversation', () => db.readConversation.mockResolvedValue({ version: 0, conversation: null, messages: [] })],
    ['the conversation waits for no confirmation', () => idle()],
    ['the proposal was settled and the conversation waits for its closing words', () => waiting({ status: 'working' })],
    ['another proposal is the one waiting', () => waiting({ proposal: { ...STORED_PROPOSAL, proposalId: '01JD00000000000000000THER1' } })],
    ['a confirmation has taken it already, a moment ago', () => waiting({}, 1_000)],
    ['a confirmation took it long ago and never finished', () => waiting({}, 60_000)],
    ['the conversation started under other tools', () => waiting({ promptVersion: 'another-deployment' })],
  ])('404 proposal_not_found when %s: nothing is run and nothing is written', async (_when, arrange) => {
    arrange();
    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);
    expect(result).toMatchObject({ ok: false, refusal: 'proposal_not_found' });
    noChangeRun();
    expect(db.saveStep).not.toHaveBeenCalled();
    expect(claude.askStep).not.toHaveBeenCalled();
  });

  it.each([
    ['answers 500', () => routeAnswer({ error: 'internal_error', message: 'Something broke' }, 500)],
    ['throws', () => Promise.reject(new Error('the table is gone'))],
  ])('a change route that %s: whether the change was made is not known, and Claude is told to read the calendar', async (_what, behaviour) => {
    waiting();
    bookHandler.mockImplementation(behaviour);

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);

    const [outcome] = steps();
    expect(outcome?.proposal?.changes[0]).toMatchObject({ outcome: 'unknown', error: null });
    expect(JSON.parse((outcome?.messages[0]?.content as { content: { content: string }[] }).content[0]!.content)).toMatchObject({ outcome: 'unknown' });
    expect(result).toMatchObject({ ok: true, reply: { proposal: { actions: [{ outcome: 'unknown', error: null }] } }, log: { changes: [{ name: 'book', status: 500 }] } });
  });

  it('a stored change whose tool has no change route in this deployment is not run: its outcome is unknown', async () => {
    waiting();
    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, {});
    noChangeRun();
    expect(result).toMatchObject({ ok: true, reply: { proposal: { actions: [{ outcome: 'unknown' }] } } });
  });

  it('a refusal of the route without a code of its own is shown as an internal error', async () => {
    waiting();
    bookHandler.mockImplementation(() => Promise.resolve({ statusCode: 403, body: '{"message":"Forbidden"}' }));
    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);
    expect(result).toMatchObject({ ok: true, reply: { proposal: { actions: [{ outcome: 'refused', error: 'internal_error' }] } } });
  });

  it('the conversation was ended while the change ran: the change was run, there is nowhere to save it, and the answer is busy', async () => {
    waiting();
    db.saveStep.mockRejectedValue(new db.AssistantBusyError());

    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);

    expect(bookHandler).toHaveBeenCalledTimes(1);
    expect(claude.askStep).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, refusal: 'assistant_busy', log: { conversationId: ID, proposalId: PROPOSAL, changes: [{ name: 'book', status: 201, ms: 0 }], outcome: 'outcome_not_saved' } });
  });

  it('any other failure of the table is thrown', async () => {
    waiting();
    db.saveStep.mockRejectedValue(new Error('DynamoDB is down'));
    await expect(confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS)).rejects.toThrow('DynamoDB is down');
  });

  it('the deployment has a change route for book_appointment, and only for it', async () => {
    const { CHANGE_HANDLERS } = await import('../../../src/assistant/tools/changeHandlers');
    const { handler } = await import('../../../src/handlers/bookAppointment');
    expect(CHANGE_HANDLERS).toEqual({ book_appointment: handler });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('declineProposal (POST /assistant/proposals/{proposalId}/decline, 5.5, 6)', () => {
  const definitions = TOOLS.map((tool) => tool.definition);

  it('answers Claude\'s request with "declined, nothing was changed" and the results kept back, adds the fixed sentence, and leaves the conversation idle', async () => {
    const read = waiting();

    const result = await decline.declineProposal(ALICE, PROPOSAL, NOW, definitions);

    noChangeRun();
    expect(claude.askStep).not.toHaveBeenCalled();
    expect(db.takeProposal).not.toHaveBeenCalled();
    expect(db.saveStep).toHaveBeenCalledTimes(1);
    expect(db.saveStep).toHaveBeenCalledWith(
      'sub-alice',
      read,
      {
        messages: [
          { kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_book', content: JSON.stringify({ outcome: 'declined', message: 'The person pressed the button to decline: nothing was changed.' }) }, KEPT] } },
          { kind: 'notice', content: IT.nothingChanged },
        ],
        status: 'idle',
        proposal: null,
        timeZone: 'Europe/Rome',
      },
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      reply: { conversationId: ID, language: 'it', status: 'idle', messages: [{ seq: 8, from: 'notice', text: IT.nothingChanged, at: NOW }], activity: null, proposal: null, remainingToday: 6 },
      log: { conversationId: ID, outcome: 'declined', proposalId: PROPOSAL },
    });
  });

  it.each([
    ['the person has no conversation', () => db.readConversation.mockResolvedValue({ version: 0, conversation: null, messages: [] })],
    ['the conversation waits for no confirmation', () => idle()],
    ['the proposal was settled already', () => waiting({ status: 'working' })],
    ['another proposal is the one waiting', () => waiting({ proposal: { ...STORED_PROPOSAL, proposalId: '01JD00000000000000000THER1' } })],
    ['a confirmation has taken it, a moment ago', () => waiting({}, 1_000)],
    ['a confirmation took it long ago and never finished', () => waiting({}, 60_000)],
  ])('404 proposal_not_found when %s: nothing is written', async (_when, arrange) => {
    arrange();
    expect(await decline.declineProposal(ALICE, PROPOSAL, NOW, definitions)).toMatchObject({ ok: false, refusal: 'proposal_not_found', log: { outcome: 'proposal_not_found' } });
    expect(db.saveStep).not.toHaveBeenCalled();
  });

  it('another request wrote first, a confirmation among them: the proposal is no longer there to decline', async () => {
    waiting();
    db.saveStep.mockRejectedValue(new db.AssistantBusyError());
    expect(await decline.declineProposal(ALICE, PROPOSAL, NOW, definitions)).toEqual({ ok: false, refusal: 'proposal_not_found', log: { conversationId: ID, outcome: 'lost_the_race', proposalId: PROPOSAL } });
  });

  it('any other failure of the table is thrown', async () => {
    waiting();
    db.saveStep.mockRejectedValue(new Error('DynamoDB is down'));
    await expect(decline.declineProposal(ALICE, PROPOSAL, NOW, definitions)).rejects.toThrow('DynamoDB is down');
  });

  it('with the tools of the deployment, a conversation of other tools has no proposal', async () => {
    waiting();
    expect(await decline.declineProposal(ALICE, PROPOSAL, NOW)).toMatchObject({ ok: false, refusal: 'proposal_not_found' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('GET /assistant/conversation and a proposal (6)', () => {
  const definitions = TOOLS.map((tool) => tool.definition);
  const show = async () => (await conversations.showConversation(ALICE, NOW, definitions)).reply;

  it('shows the proposal that waits, with its buttons and no outcome', async () => {
    waiting();
    expect(await show()).toMatchObject({ status: 'awaiting_confirmation', activity: null, proposal: { proposalId: PROPOSAL, confirmLabel: IT.confirmLabel, actions: [{ summary: SUMMARY, outcome: null, error: null }] } });
  });

  it('shows the settled proposal with its outcomes', async () => {
    const settled: Proposal = { ...STORED_PROPOSAL, changes: [{ ...STORED_PROPOSAL.changes[0]!, outcome: 'refused', error: 'slot_taken' }] };
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ proposal: settled }), messages: WAITING_MESSAGES });
    expect(await show()).toMatchObject({ status: 'idle', proposal: { actions: [{ summary: SUMMARY, outcome: 'refused', error: 'slot_taken' }] } });
  });

  it('a proposal a confirmation is running is shown as a step under way, not as waiting', async () => {
    waiting({}, 30_999);
    expect(await show()).toMatchObject({ status: 'working', activity: expect.any(String), proposal: { actions: [{ outcome: null }] } });
  });

  it('a proposal taken and never finished is shown with the outcome unknown, the conversation as waiting for its step', async () => {
    waiting({}, 31_000);
    expect(await show()).toMatchObject({ status: 'working', proposal: { actions: [{ summary: SUMMARY, outcome: 'unknown', error: null }] } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the log lines of a proposal (10.1)', () => {
  it('the step that made a proposal names the changes proposed, and nothing of their input or wording', async () => {
    idle();
    claude.askStep.mockResolvedValue(asksFor(LOOK, BOOK));
    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS);
    expect(result.log).toMatchObject({ proposalId: expect.stringMatching(ULID), proposed: ['book'] });
    expectNoText(result.log);
  });

  it("the confirmation's line holds the proposal's id and, for each change, the tool, the route's status and the time: no input, no note, no summary, no text", async () => {
    waiting();
    const result = await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS);
    expect(result.log).toMatchObject({ proposalId: PROPOSAL, changes: [{ name: 'book', status: 201, ms: 0 }] });
    expectNoText(result.log);
  });

  it('nor do the lines of a refused change, a decline, a dropped proposal and one settled as unknown', async () => {
    waiting();
    bookHandler.mockImplementation(() => routeAnswer({ error: 'slot_taken', message: `No: ${NOTE}` }, 409));
    expectNoText((await confirm.confirmProposal(ALICE, PROPOSAL, NOW, REQUEST, TOOLS, HANDLERS)).log);
    waiting();
    expectNoText((await decline.declineProposal(ALICE, PROPOSAL, NOW, TOOLS.map((tool) => tool.definition))).log);
    waiting();
    expectNoText((await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, TOOLS)).log);
    waiting({}, 40_000);
    expectNoText((await exchange.continueExchange(ALICE, NOW, REQUEST, TOOLS)).log);
  });
});
