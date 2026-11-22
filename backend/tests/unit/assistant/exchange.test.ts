import { assistantTexts } from '@shared-calendar/shared';
import { z } from 'zod';
import { toolsForClaude, type ReadTool, type Tool } from '../../../src/assistant/tools/tool';
import type { Conversation, StoredMessage } from '../../../src/lib/assistantDb';

// Claude and the table are replaced: nothing reaches a network. The core reads its configuration
// once per container, so each test loads a fresh copy.
const db = vi.hoisted(() => {
  class AssistantBusyError extends Error {}
  return {
    AssistantBusyError,
    readConversation: vi.fn(),
    readDailyUse: vi.fn(),
    startConversation: vi.fn(),
    saveStep: vi.fn(),
    endConversation: vi.fn(),
  };
});
const claude = vi.hoisted(() => ({ askStep: vi.fn(), askLanguage: vi.fn(), assistantModel: vi.fn(), STEP_TIMEOUT_MS: 22_000 }));
vi.mock('../../../src/lib/assistantDb', () => db);
vi.mock('../../../src/lib/anthropic', () => claude);

type Exchange = typeof import('../../../src/assistant/exchange');
type Prompt = typeof import('../../../src/assistant/prompt');

let exchange: Exchange;
let prompt: Prompt;
// The tools a User is offered, as Claude is given them, and the mark the deployed instructions
// and those tools give alice.
let offered: unknown[];
let mark: string;

async function load(limit = '10'): Promise<void> {
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.stubEnv('ASSISTANT_DAILY_MESSAGE_LIMIT', limit);
  vi.resetModules();
  exchange = await import('../../../src/assistant/exchange');
  prompt = await import('../../../src/assistant/prompt');
  const { DEFINITIONS } = await import('../../../src/assistant/tools/list');
  const { toolsForClaude } = await import('../../../src/assistant/tools/tool');
  const tools = toolsForClaude(DEFINITIONS, 'user');
  offered = tools;
  mark = prompt.promptVersion(prompt.INSTRUCTIONS, prompt.contextBlock(ALICE, 'Europe/Rome'), tools);
}

const NOW = '2026-11-21T14:05:00.000Z';
const ALICE = { sub: 'sub-alice', username: 'alice', role: 'user' as const };
const ID = '01JD0000000000000000000001';
const TEXT = 'Which slots are free next week?';
const ANSWER = 'I cannot look that up here.';
const LINE_EN = "Now it is Saturday 21 November 2026 (2026-11-21), 15:05, in the calendar's time zone (Europe/Rome). The language of this conversation is English: answer in English, whatever language the person writes in.";

const USAGE = { inputTokens: 100, outputTokens: 40, cacheReadTokens: 6000, cacheWriteTokens: 300 };
const LANGUAGE_USAGE = { inputTokens: 300, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 };
const CONTENT = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: ANSWER, citations: null }];

const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  conversationId: ID,
  language: 'it',
  status: 'idle',
  startedAt: '2026-11-21T13:00:00.000Z',
  lastActivityAt: '2026-11-21T13:00:05.000Z',
  messageCount: 1,
  storedBytes: 300,
  nextSeq: 5,
  promptVersion: mark,
  proposal: null,
  executing: null,
  version: 3,
  expiresAt: 1795400000,
  ...over,
});

const AT = '2026-11-21T13:00:00.000Z';
const STORED: StoredMessage[] = [
  { seq: 1, at: AT, kind: 'model', content: { role: 'user', content: 'Buongiorno, mi sente?' } },
  { seq: 2, at: AT, kind: 'model', content: { role: 'system', content: 'An earlier line of the application.' } },
  { seq: 3, at: AT, kind: 'model', content: { role: 'assistant', content: [{ type: 'text', text: 'Buongiorno.' }] } },
  { seq: 4, at: AT, kind: 'notice', content: 'A notice, which Claude never sees.' },
];

// The person has no conversation, or the one given.
const noConversation = (version = 0) => db.readConversation.mockResolvedValue({ version, conversation: null, messages: [] });
const inConversation = (over: Partial<Conversation> = {}) =>
  db.readConversation.mockResolvedValue({ version: 3, conversation: conversation(over), messages: STORED });
const usedToday = (messages: number) => db.readDailyUse.mockResolvedValue({ messages, inputTokens: 0, outputTokens: 0 });

// What the table module gives back after a write: the conversation moved on by the step's messages.
const started = (step: { messages: unknown[]; status: string }) =>
  conversation({ language: 'en', status: step.status as Conversation['status'], nextSeq: 1 + step.messages.length, version: 1 });

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  await load();
  claude.assistantModel.mockReturnValue('claude-sonnet-5-5');
  claude.askLanguage.mockResolvedValue({ kind: 'language', language: 'en', usage: LANGUAGE_USAGE });
  claude.askStep.mockResolvedValue({ kind: 'text', content: CONTENT, text: ANSWER, usage: USAGE });
  db.startConversation.mockImplementation((_sub, _version, _start, step) => Promise.resolve(started(step)));
  db.saveStep.mockImplementation((_sub, read: Conversation, step: { messages: unknown[]; status: Conversation['status'] }) =>
    Promise.resolve({ ...read, status: step.status, nextSeq: read.nextSeq + step.messages.length, version: read.version + 1 }),
  );
  usedToday(4);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// No text of the person, of Claude or of a notice may be in what goes to the log line.
const expectNoText = (log: unknown) => {
  const line = JSON.stringify(log);
  for (const text of [TEXT, ANSWER, 'Buongiorno', 'cut short', 'cannot answer']) expect(line).not.toContain(text);
};

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('sendMessage: the first message of a conversation (4.2, 5.6)', () => {
  it('asks the language, asks Claude once, and starts the conversation with one write', async () => {
    noConversation();

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(claude.askLanguage).toHaveBeenCalledWith(TEXT, NOW);
    expect(claude.askStep).toHaveBeenCalledTimes(1);
    expect(claude.askStep).toHaveBeenCalledWith(
      {
        tools: offered,
        instructions: prompt.INSTRUCTIONS,
        context: 'The person writing to you has the username "alice" and is a User. The calendar\'s time zone is Europe/Rome.',
        conversation: [
          { role: 'user', content: TEXT },
          { role: 'system', content: LINE_EN },
        ],
      },
      NOW,
    );
    expect(db.startConversation).toHaveBeenCalledTimes(1);
    expect(db.startConversation).toHaveBeenCalledWith(
      'sub-alice',
      0,
      { language: 'en', promptVersion: mark },
      {
        messages: [
          { kind: 'model', content: { role: 'user', content: TEXT }, fromPerson: true },
          { kind: 'model', content: { role: 'system', content: LINE_EN } },
          { kind: 'model', content: { role: 'assistant', content: CONTENT } },
        ],
        status: 'idle',
        proposal: null,
        timeZone: 'Europe/Rome',
        // The step's input, cached or not, and the language question's.
        inputTokens: 100 + 6000 + 300 + 300,
        outputTokens: 40 + 10,
      },
      NOW,
    );
    expect(db.saveStep).not.toHaveBeenCalled();
    expect(db.endConversation).not.toHaveBeenCalled();

    expect(result).toEqual({
      ok: true,
      reply: {
        conversationId: ID,
        language: 'en',
        status: 'idle',
        messages: [
          { seq: 1, from: 'person', text: TEXT, at: NOW },
          { seq: 3, from: 'assistant', text: ANSWER, at: NOW },
        ],
        activity: null,
        proposal: null,
        remainingToday: 5,
      },
      log: {
        conversationId: ID,
        outcome: 'text',
        model: 'claude-sonnet-5-5',
        modelMs: 0,
        usage: { input: 100, output: 40, cacheRead: 6000, cacheWrite: 300 },
        languageUsage: { input: 300, output: 10, cacheRead: 0, cacheWrite: 0 },
        languageMs: 0,
        newConversation: true,
        tools: [],
        steps: 1,
      },
    });
    expectNoText(result.log);
  });

  it('writes the line of the application in the language Claude named', async () => {
    noConversation();
    claude.askLanguage.mockResolvedValue({ kind: 'language', language: 'it', usage: LANGUAGE_USAGE });

    await exchange.sendMessage(ALICE, 'Buongiorno, mi sente?', NOW);

    const line = claude.askStep.mock.calls[0]?.[0].conversation[1];
    expect(line).toEqual({ role: 'system', content: expect.stringContaining('The language of this conversation is Italian') });
    expect(db.startConversation.mock.calls[0]?.[2]).toEqual({ language: 'it', promptVersion: mark });
  });

  it('replaces whatever the person had before, naming the version read', async () => {
    noConversation(7);
    await exchange.sendMessage(ALICE, TEXT, NOW);
    expect(db.startConversation.mock.calls[0]?.[1]).toBe(7);
  });

  it.each([
    [{ kind: 'budget_reached' }, 'assistant_budget_reached', { outcome: 'language_budget_reached' }],
    [{ kind: 'unavailable', reason: 'timeout' }, 'assistant_unavailable', { outcome: 'language_unavailable', reason: 'timeout' }],
  ])('when the language cannot be asked (%j) nothing is saved and Claude is not asked the step', async (answer, refusal, log) => {
    noConversation();
    claude.askLanguage.mockResolvedValue(answer);

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(result).toEqual({ ok: false, refusal, log: { conversationId: null, ...log, model: 'claude-sonnet-5-5', languageMs: 0 } });
    expect(claude.askStep).not.toHaveBeenCalled();
    expect(db.startConversation).not.toHaveBeenCalled();
    expect(db.saveStep).not.toHaveBeenCalled();
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('sendMessage: a later message (4.2, 4.3)', () => {
  it('keeps the language, sends the stored conversation as stored without the notices, and saves the step', async () => {
    inConversation();

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(claude.askLanguage).not.toHaveBeenCalled();
    const sent = claude.askStep.mock.calls[0]?.[0].conversation;
    expect(sent).toEqual([
      { role: 'user', content: 'Buongiorno, mi sente?' },
      { role: 'system', content: 'An earlier line of the application.' },
      { role: 'assistant', content: [{ type: 'text', text: 'Buongiorno.' }] },
      { role: 'user', content: TEXT },
      { role: 'system', content: expect.stringContaining('The language of this conversation is Italian') },
    ]);
    // The very entries that were stored, not copies made on the way.
    expect(sent[2]).toBe(STORED[2]?.content);

    expect(db.startConversation).not.toHaveBeenCalled();
    expect(db.saveStep).toHaveBeenCalledWith(
      'sub-alice',
      conversation(),
      expect.objectContaining({ status: 'idle', inputTokens: 6400, outputTokens: 40, timeZone: 'Europe/Rome' }),
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      reply: {
        conversationId: ID,
        language: 'it',
        messages: [
          { seq: 5, from: 'person', text: TEXT, at: NOW },
          { seq: 7, from: 'assistant', text: ANSWER, at: NOW },
        ],
        remainingToday: 5,
      },
      log: { outcome: 'text', newConversation: false },
    });
    expect(result.log).not.toHaveProperty('languageUsage');
    expectNoText(result.log);
  });

  it('a conversation started under other instructions is over: the message starts a new one in its place', async () => {
    inConversation({ promptVersion: 'an-older-mark' });

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(claude.askLanguage).toHaveBeenCalledTimes(1);
    expect(claude.askStep.mock.calls[0]?.[0].conversation).toHaveLength(2);
    expect(db.startConversation).toHaveBeenCalledWith('sub-alice', 3, { language: 'en', promptVersion: mark }, expect.anything(), NOW);
    expect(db.saveStep).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, log: { newConversation: true } });
  });

  it('measures how long Claude took', async () => {
    inConversation();
    claude.askStep.mockImplementation(() => {
      vi.advanceTimersByTime(2300);
      return Promise.resolve({ kind: 'text', content: CONTENT, text: ANSWER, usage: USAGE });
    });
    expect((await exchange.sendMessage(ALICE, TEXT, NOW)).log.modelMs).toBe(2300);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('sendMessage: what stops it before Claude is asked (4.4, 6)', () => {
  const untouched = () => {
    expect(claude.askLanguage).not.toHaveBeenCalled();
    expect(claude.askStep).not.toHaveBeenCalled();
    expect(db.startConversation).not.toHaveBeenCalled();
    expect(db.saveStep).not.toHaveBeenCalled();
  };

  // A conversation that waits for a confirmation is not busy: the message drops the proposal,
  // which tests/unit/assistant/proposals.test.ts covers.
  it.each(['working'] as const)('a conversation that is %s is busy', async (status) => {
    inConversation({ status });
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toEqual({ ok: false, refusal: 'assistant_busy', log: { conversationId: ID, outcome: 'busy' } });
    untouched();
  });

  it("today's messages are all sent", async () => {
    noConversation();
    usedToday(10);
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toEqual({ ok: false, refusal: 'assistant_limit_reached', log: { conversationId: null, outcome: 'daily_limit' } });
    untouched();
  });

  it('the last message of the day is still taken', async () => {
    noConversation();
    usedToday(9);
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toMatchObject({ ok: true, reply: { remainingToday: 0 } });
  });

  it.each([{ messageCount: 40 }, { storedBytes: 100_000 }])('the conversation is full: %j', async (full) => {
    inConversation(full);
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toEqual({ ok: false, refusal: 'conversation_full', log: { conversationId: ID, outcome: 'conversation_full' } });
    untouched();
  });

  it('a conversation just under both bounds takes the message', async () => {
    inConversation({ messageCount: 39, storedBytes: 99_999 });
    expect((await exchange.sendMessage(ALICE, TEXT, NOW)).ok).toBe(true);
  });

  it('a waiting step is said before the daily limit, and the daily limit before a full conversation', async () => {
    usedToday(10);
    inConversation({ status: 'working', messageCount: 40 });
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toMatchObject({ refusal: 'assistant_busy' });
    inConversation({ messageCount: 40 });
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toMatchObject({ refusal: 'assistant_limit_reached' });
  });

  it('a broken deployment is thrown, not answered: no model, or no time zone', async () => {
    noConversation();
    claude.assistantModel.mockImplementation(() => {
      throw new Error('ASSISTANT_MODEL is not set');
    });
    await expect(exchange.sendMessage(ALICE, TEXT, NOW)).rejects.toThrow('ASSISTANT_MODEL');
    expect(db.readConversation).not.toHaveBeenCalled();

    vi.stubEnv('CALENDAR_TIME_ZONE', '');
    vi.resetModules();
    const broken = await import('../../../src/assistant/exchange');
    await expect(broken.sendMessage(ALICE, TEXT, NOW)).rejects.toMatchObject({ name: 'CoreConfigError' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: each answer of Claude (7.4)', () => {
  const savedStep = () => db.saveStep.mock.calls[0]?.[2] as { messages: { kind: string; content: unknown }[]; status: string; inputTokens: number; outputTokens: number };

  it('cut short: what there is is kept, and the fixed sentence is added in the language of the conversation', async () => {
    inConversation();
    claude.askStep.mockResolvedValue({ kind: 'cut_short', content: CONTENT, text: ANSWER, usage: USAGE });

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(savedStep().status).toBe('idle');
    expect(savedStep().messages.slice(2)).toEqual([
      { kind: 'model', content: { role: 'assistant', content: CONTENT } },
      { kind: 'notice', content: 'La risposta è stata interrotta prima della fine.' },
    ]);
    expect(result).toMatchObject({
      ok: true,
      reply: {
        status: 'idle',
        messages: [
          { seq: 5, from: 'person' },
          { seq: 7, from: 'assistant', text: ANSWER },
          { seq: 8, from: 'notice', text: 'La risposta è stata interrotta prima della fine.' },
        ],
      },
      log: { outcome: 'cut_short' },
    });
    expectNoText(result.log);
  });

  it('an answer without content stores no entry of Claude and shows none', async () => {
    inConversation();
    claude.askStep.mockResolvedValue({ kind: 'text', content: [], text: '', usage: USAGE });

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(savedStep().messages).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', messages: [{ seq: 5, from: 'person' }] } });
  });

  it('a refusal of the safety filters: the fixed sentence, the step saved for the count, the conversation ended', async () => {
    inConversation();
    claude.askStep.mockResolvedValue({ kind: 'refusal', usage: USAGE });

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    const sentence = "L'assistente non può rispondere a questa richiesta. Questa conversazione è terminata: il suo prossimo messaggio ne inizierà una nuova.";
    expect(savedStep().messages.slice(2)).toEqual([{ kind: 'notice', content: sentence }]);
    expect(savedStep().inputTokens).toBe(6400);
    // Ended with the version the save left.
    expect(db.endConversation).toHaveBeenCalledWith('sub-alice', 4);
    expect(result).toMatchObject({
      ok: true,
      reply: {
        conversationId: null,
        language: null,
        status: 'idle',
        messages: [
          { seq: 5, from: 'person', text: TEXT },
          { seq: 7, from: 'notice', text: sentence },
        ],
        remainingToday: 5,
      },
      log: { conversationId: ID, outcome: 'refusal' },
    });
  });

  it.each([
    [{ kind: 'budget_reached' }, 'assistant_budget_reached', { outcome: 'budget_reached' }],
    [{ kind: 'unavailable', reason: 'overloaded' }, 'assistant_unavailable', { outcome: 'unavailable', reason: 'overloaded' }],
  ])('Claude cannot be asked (%j): the message is saved alone, waiting for its step', async (answer, refusal, log) => {
    inConversation();
    claude.askStep.mockResolvedValue(answer);

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(savedStep().status).toBe('working');
    expect(savedStep().messages).toEqual([
      { kind: 'model', content: { role: 'user', content: TEXT }, fromPerson: true },
      { kind: 'model', content: { role: 'system', content: expect.any(String) } },
    ]);
    expect(result).toMatchObject({ ok: false, refusal, log: { conversationId: ID, ...log, model: 'claude-sonnet-5-5', newConversation: false } });
    expect(db.endConversation).not.toHaveBeenCalled();
    expectNoText(result.log);
  });

  it('counts no tokens for a step Anthropic never answered, but the language question that was', async () => {
    noConversation();
    claude.askStep.mockResolvedValue({ kind: 'unavailable', reason: 'timeout' });

    const result = await exchange.sendMessage(ALICE, TEXT, NOW);

    expect(db.startConversation.mock.calls[0]?.[3]).toMatchObject({ status: 'working', inputTokens: 300, outputTokens: 10 });
    expect(result.log).not.toHaveProperty('usage');
    expect(result.log).toHaveProperty('languageUsage', { input: 300, output: 10, cacheRead: 0, cacheWrite: 0 });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: the one write (9)', () => {
  it('another request of the same person wrote first: busy, and nothing is shown', async () => {
    inConversation();
    db.saveStep.mockRejectedValue(new db.AssistantBusyError());

    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toEqual({
      ok: false,
      refusal: 'assistant_busy',
      log: { conversationId: ID, outcome: 'lost_the_race', model: 'claude-sonnet-5-5', modelMs: 0 },
    });
  });

  it('the same at the start of a conversation', async () => {
    noConversation();
    db.startConversation.mockRejectedValue(new db.AssistantBusyError());
    expect(await exchange.sendMessage(ALICE, TEXT, NOW)).toMatchObject({ ok: false, refusal: 'assistant_busy', log: { conversationId: null } });
  });

  it('any other failure of the table is thrown', async () => {
    inConversation();
    db.saveStep.mockRejectedValue(new Error('DynamoDB is down'));
    await expect(exchange.sendMessage(ALICE, TEXT, NOW)).rejects.toThrow('DynamoDB is down');
  });
});

// The step of the one write of a test, whichever describe it is in.
const writtenStep = () => db.saveStep.mock.calls[0]?.[2] as { messages: { kind: string; content: unknown; fromPerson?: boolean }[]; status: string };

// Stand-ins for tools, given to the core in place of the deployment's: the handler of each is a
// mock, so no route of the calendar runs. `everyone` is offered to the Administrator only.
const ADMIN = { sub: 'sub-admin', username: 'admin', role: 'admin' as const };
const calendarHandler = vi.fn();
const appointmentsHandler = vi.fn();
const everyoneHandler = vi.fn();
const standIn = (name: string, handler: ReadTool['toHandler']['handler'], reads: Tool['definition']['reads'], roles: Tool['definition']['roles'] = ['admin', 'user']): Tool => ({
  definition: { name, description: `The ${name} of the test.`, kind: 'read', roles, input: () => z.object({ from: z.string() }).strict(), reads },
  toHandler: { handler, request: (input) => ({ routeKey: `GET /${name}`, path: `/${name}`, query: input as Record<string, string> }) },
  toModel: (body) => ({ fields: body as Record<string, unknown> }),
});
const READS = [standIn('calendar', calendarHandler, 'calendar'), standIn('appointments', appointmentsHandler, 'appointments')];
const WITH_ADMIN_ONLY = [...READS, standIn('everyone', everyoneHandler, 'appointments', ['admin'])];

// The mark of a conversation started with these tools, for this person.
const markFor = (tools: readonly Tool[], person: typeof ALICE | typeof ADMIN = ALICE) =>
  prompt.promptVersion(prompt.INSTRUCTIONS, prompt.contextBlock(person, 'Europe/Rome'), toolsForClaude(tools.map((tool) => tool.definition), person.role));

const REQUEST = { requestId: 'req-9', remainingMs: null };
const use = (id: string, name: string, input: unknown = { from: '2026-11-23' }) => ({ type: 'tool_use', id, name, input });
// An answer of Claude that asks for tools, as the door to Claude gives it.
const asksFor = (...blocks: ReturnType<typeof use>[]) => ({
  kind: 'tool_requests',
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Let me look.' }, ...blocks],
  requests: blocks.map(({ id, name, input }) => ({ id, name, input })),
  usage: USAGE,
});
const routeAnswer = (body: unknown, statusCode = 200) => Promise.resolve({ statusCode, body: JSON.stringify(body) });
const NOTE = 'Bring the forms';

// A conversation in which the person's last message has already taken `answers` requests to
// Claude, each a read with its result, and now waits for the next step.
const waitingAfter = (answers: number, over: Partial<Conversation> = {}) => {
  const messages: StoredMessage[] = [
    { seq: 1, at: AT, kind: 'model', content: { role: 'user', content: 'Buongiorno, mi sente?' } },
    { seq: 2, at: AT, kind: 'model', content: { role: 'assistant', content: [{ type: 'text', text: 'Buongiorno.' }] } },
    { seq: 3, at: AT, kind: 'model', content: { role: 'user', content: TEXT } },
    { seq: 4, at: AT, kind: 'model', content: { role: 'system', content: 'A line of the application.' } },
  ];
  for (let i = 0; i < answers; i++) {
    messages.push({ seq: 5 + 2 * i, at: AT, kind: 'model', content: { role: 'assistant', content: [use(`toolu_${i}`, 'calendar')] as never } });
    messages.push({ seq: 6 + 2 * i, at: AT, kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${i}`, content: '{}' }] } });
  }
  const read = conversation({ status: 'working', nextSeq: 5 + 2 * answers, promptVersion: markFor(READS), ...over });
  db.readConversation.mockResolvedValue({ version: 3, conversation: read, messages });
  return { read, messages };
};

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: Claude asks to read (5.1, 7.4, 8.1)', () => {
  beforeEach(() => {
    calendarHandler.mockImplementation(() => routeAnswer({ days: [{ date: '2026-11-24', freeSlots: ['09:00'] }] }));
    appointmentsHandler.mockImplementation(() => routeAnswer({ appointments: [{ username: 'trialbob', note: NOTE }] }));
    everyoneHandler.mockImplementation(() => routeAnswer({ everyone: true }));
  });

  it('runs every read in the order asked, for the person of the request, and saves the answer and all the results in one write', async () => {
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: markFor(READS) }), messages: STORED });
    const answer = asksFor(use('toolu_a', 'calendar'), use('toolu_b', 'appointments', { from: '2026-11-24' }));
    claude.askStep.mockResolvedValue(answer);

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, READS);

    // Each handler once, calendar before appointments, with alice's identity and the request's id.
    expect(calendarHandler).toHaveBeenCalledTimes(1);
    expect(appointmentsHandler).toHaveBeenCalledTimes(1);
    expect(calendarHandler.mock.invocationCallOrder[0]).toBeLessThan(appointmentsHandler.mock.invocationCallOrder[0] ?? 0);
    expect(calendarHandler.mock.calls[0]?.[0]).toMatchObject({
      routeKey: 'GET /calendar',
      queryStringParameters: { from: '2026-11-23' },
      requestContext: { requestId: 'req-9', authorizer: { lambda: { sub: 'sub-alice', username: 'alice', groups: '["user"]' } } },
    });
    expect(appointmentsHandler.mock.calls[0]?.[0]).toMatchObject({ queryStringParameters: { from: '2026-11-24' } });

    // One request to Claude and one write, which holds everything.
    expect(claude.askStep).toHaveBeenCalledTimes(1);
    expect(db.saveStep).toHaveBeenCalledTimes(1);
    expect(db.startConversation).not.toHaveBeenCalled();
    const step = writtenStep();
    expect(step.status).toBe('working');
    expect(step.messages).toEqual([
      { kind: 'model', content: { role: 'user', content: TEXT }, fromPerson: true },
      { kind: 'model', content: { role: 'system', content: expect.any(String) } },
      { kind: 'model', content: { role: 'assistant', content: answer.content } },
      {
        kind: 'model',
        content: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_a', content: '{"days":[{"date":"2026-11-24","freeSlots":["09:00"]}]}' },
            { type: 'tool_result', tool_use_id: 'toolu_b', content: `{"appointments":[{"username":"trialbob","note":"${NOTE}"}]}` },
          ],
        },
      },
    ]);
    // Claude's answer exactly as given: the very blocks, thinking and signature included.
    expect((step.messages[2] as { content: { content: unknown } }).content.content).toBe(answer.content);

    expect(result).toMatchObject({
      ok: true,
      reply: {
        status: 'working',
        // The line of the last read, in the language of the conversation.
        activity: 'Sto guardando gli appuntamenti…',
        // The person reads their own message and the text Claude wrote beside its requests: the
        // line of the application (6) and the results (8) are stored and not shown.
        messages: [
          { seq: 5, from: 'person', text: TEXT },
          { seq: 7, from: 'assistant', text: 'Let me look.' },
        ],
        remainingToday: 5,
      },
      log: {
        outcome: 'tool_requests',
        tools: [
          { name: 'calendar', status: 200, ms: 0 },
          { name: 'appointments', status: 200, ms: 0 },
        ],
        steps: 1,
      },
    });
  });

  it("the log line names the tools and nothing of what they were asked or answered: no note, no other person's username", async () => {
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: markFor(WITH_ADMIN_ONLY, ADMIN) }), messages: STORED });
    claude.askStep.mockResolvedValue(asksFor(use('toolu_a', 'appointments', { from: 'trialbob' }), use('toolu_b', 'made_up_by_claude')));

    const result = await exchange.sendMessage(ADMIN, TEXT, NOW, REQUEST, WITH_ADMIN_ONLY);

    const line = JSON.stringify(result.log);
    expect(line).toContain('"tools":[{"name":"appointments","status":200,"ms":0},{"name":null,"notRun":"unknown_tool"}]');
    for (const secret of [NOTE, 'trialbob', 'made_up_by_claude', 'Let me look', '2026-11-23']) expect(line).not.toContain(secret);
    expectNoText(result.log);
  });

  it('gives Claude the tools of the role only: a User is not told of a tool of the Administrator', async () => {
    noConversation();
    await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, WITH_ADMIN_ONLY);
    noConversation();
    await exchange.sendMessage(ADMIN, TEXT, NOW, REQUEST, WITH_ADMIN_ONLY);

    const names = (call: number) => (claude.askStep.mock.calls[call]?.[0].tools as { name: string }[]).map((tool) => tool.name);
    expect(names(0)).toEqual(['calendar', 'appointments']);
    expect(names(1)).toEqual(['calendar', 'appointments', 'everyone']);
    expect(claude.askStep.mock.calls[0]?.[0].tools[0]).toEqual({
      name: 'calendar',
      description: 'The calendar of the test.',
      input_schema: { type: 'object', properties: { from: { type: 'string' } }, required: ['from'], additionalProperties: false },
    });
  });

  it.each([
    ['a tool that does not exist', use('toolu_x', 'delete_everything'), 'unknown_tool', null],
    ['a tool of the Administrator, for a User', use('toolu_x', 'everyone'), 'not_offered', 'everyone'],
    ['an input the schema refuses', use('toolu_x', 'calendar', { from: 23 }), 'invalid_input', 'calendar'],
  ])('%s: Claude gets an error result, no handler is called, and the step goes on', async (_what, block, why, name) => {
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: markFor(WITH_ADMIN_ONLY) }), messages: STORED });
    claude.askStep.mockResolvedValue(asksFor(block, use('toolu_ok', 'calendar')));

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, WITH_ADMIN_ONLY);

    expect(everyoneHandler).not.toHaveBeenCalled();
    // The read asked for beside it is still run.
    expect(calendarHandler).toHaveBeenCalledTimes(1);
    const results = (writtenStep().messages[3] as { content: { content: { tool_use_id: string; is_error?: boolean; content: string }[] } }).content.content;
    expect(results.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ['toolu_x', true],
      ['toolu_ok', false],
    ]);
    // A tool of another role is told to Claude as one that does not exist; only the log tells them apart.
    expect(JSON.parse(results[0]?.content ?? '')).toMatchObject({ error: why === 'not_offered' ? 'unknown_tool' : why });
    expect(writtenStep().status).toBe('working');
    expect(result).toMatchObject({ ok: true, reply: { status: 'working' }, log: { tools: [{ name, notRun: why }, { name: 'calendar', status: 200 }] } });
  });

  it('a refusal of the route goes to Claude as a result, and the step goes on', async () => {
    waitingAfter(0);
    calendarHandler.mockImplementation(() => routeAnswer({ error: 'invalid_request', message: 'Invalid input: to' }, 400));
    claude.askStep.mockResolvedValue(asksFor(use('toolu_a', 'calendar')));

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(writtenStep().messages[1]).toEqual({
      kind: 'model',
      content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_a', content: '{"error":"invalid_request","message":"Invalid input: to"}', is_error: true }] },
    });
    expect(result).toMatchObject({ ok: true, reply: { status: 'working', activity: 'Sto guardando il calendario…' }, log: { tools: [{ name: 'calendar', status: 400 }] } });
  });

  it('an answer that stopped for tools and asks for none is an answer: nothing waits', async () => {
    waitingAfter(0);
    claude.askStep.mockResolvedValue({ ...asksFor(), requests: [] });
    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);
    expect(writtenStep()).toMatchObject({ status: 'idle', messages: [{ kind: 'model', content: { role: 'assistant' } }] });
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', activity: null }, log: { tools: [] } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: at most eight requests to Claude for one message (5.6)', () => {
  beforeEach(() => calendarHandler.mockImplementation(() => routeAnswer({ days: [] })));

  it('the seventh answer that asks to read leaves the conversation waiting', async () => {
    waitingAfter(6);
    claude.askStep.mockResolvedValue(asksFor(use('toolu_n', 'calendar')));
    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);
    expect(writtenStep().status).toBe('working');
    expect(result).toMatchObject({ ok: true, reply: { status: 'working' }, log: { outcome: 'tool_requests', steps: 7 } });
  });

  it('the eighth is still run and saved, then the fixed sentence is added and the conversation waits for the person', async () => {
    waitingAfter(7);
    claude.askStep.mockResolvedValue(asksFor(use('toolu_n', 'calendar')));

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(calendarHandler).toHaveBeenCalledTimes(1);
    expect(db.saveStep).toHaveBeenCalledTimes(1);
    const step = writtenStep();
    expect(step.status).toBe('idle');
    // Claude's requests keep their results, so the conversation can be given to Claude again.
    expect(step.messages).toEqual([
      { kind: 'model', content: { role: 'assistant', content: expect.any(Array) } },
      { kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_n', content: '{"days":[]}' }] } },
      { kind: 'notice', content: assistantTexts('it').tooManySteps },
    ]);
    expect(result).toMatchObject({
      ok: true,
      reply: { status: 'idle', activity: null, messages: [{ from: 'assistant', text: 'Let me look.' }, { seq: 21, from: 'notice', text: assistantTexts('it').tooManySteps }] },
      log: { outcome: 'step_limit', steps: 8 },
    });
  });

  it('an eighth answer in words is an answer like any other', async () => {
    waitingAfter(7);
    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', messages: [{ from: 'assistant', text: ANSWER }] }, log: { outcome: 'text', steps: 8 } });
  });

  it('counts from the last message of the person: the answers before it do not count', async () => {
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: markFor(READS) }), messages: waitingAfter(7).messages });
    claude.askStep.mockResolvedValue(asksFor(use('toolu_n', 'calendar')));
    const result = await exchange.sendMessage(ALICE, 'And the week after?', NOW, REQUEST, READS);
    expect(result).toMatchObject({ ok: true, reply: { status: 'working' }, log: { steps: 1 } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: the first five reads of one answer of Claude (4.4)', () => {
  beforeEach(() => calendarHandler.mockImplementation(() => routeAnswer({ days: [] })));

  it('the first five are run, the others are answered as not run, each request keeps its result, and the step goes on', async () => {
    waitingAfter(0);
    claude.askStep.mockResolvedValue(asksFor(...[1, 2, 3, 4, 5, 6, 7].map((n) => use(`toolu_${n}`, 'calendar'))));

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(calendarHandler).toHaveBeenCalledTimes(5);
    const results = (writtenStep().messages[1]?.content as { content: { tool_use_id: string; content: string; is_error?: boolean }[] }).content;
    expect(results.map((block) => block.tool_use_id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3', 'toolu_4', 'toolu_5', 'toolu_6', 'toolu_7']);
    expect(results.slice(0, 5).every((block) => block.content === '{"days":[]}' && block.is_error === undefined)).toBe(true);
    for (const block of results.slice(5)) {
      expect(block.is_error).toBe(true);
      expect(JSON.parse(block.content)).toEqual({ error: 'too_many_reads', message: expect.stringContaining('Only the first 5 reads of one answer are run') });
    }
    expect(result).toMatchObject({ ok: true, reply: { status: 'working' }, log: { outcome: 'tool_requests' } });
    const tools = result.log.tools as unknown[];
    expect(tools.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => ({ name: 'calendar', status: 200, ms: expect.any(Number) })));
    expect(tools.slice(5)).toEqual([{ name: 'calendar', notRun: 'too_many_reads' }, { name: 'calendar', notRun: 'too_many_reads' }]);
    expectNoText(result.log);
  });

  it('a mistaken request takes a place among the five, and a name that is no tool of the person is not logged', async () => {
    waitingAfter(0, { promptVersion: markFor(WITH_ADMIN_ONLY) });
    claude.askStep.mockResolvedValue(
      asksFor(use('toolu_x', 'made_up'), ...[1, 2, 3, 4, 5].map((n) => use(`toolu_${n}`, 'calendar')), use('toolu_y', 'made_up'), use('toolu_z', 'everyone')),
    );

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, WITH_ADMIN_ONLY);

    expect(calendarHandler).toHaveBeenCalledTimes(4);
    expect(everyoneHandler).not.toHaveBeenCalled();
    const tools = result.log.tools as unknown[];
    expect(tools[0]).toEqual({ name: null, notRun: 'unknown_tool' });
    expect(tools.slice(5)).toEqual([{ name: 'calendar', notRun: 'too_many_reads' }, { name: null, notRun: 'too_many_reads' }, { name: null, notRun: 'too_many_reads' }]);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the step: a conversation that fills up during an exchange (4.4)', () => {
  const RESULT = '{"days":[]}';
  // What the step below stores: Claude's answer and the entry of its one result.
  const added = (answer: unknown) =>
    Buffer.byteLength(JSON.stringify({ role: 'assistant', content: answer })) + Buffer.byteLength(JSON.stringify({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_n', content: RESULT }] }));

  beforeEach(() => calendarHandler.mockImplementation(() => routeAnswer({ days: [] })));

  it('one byte under the bound after the reads: the conversation waits for its next step', async () => {
    const asks = asksFor(use('toolu_n', 'calendar'));
    waitingAfter(1, { storedBytes: 100_000 - added(asks.content) - 1 });
    claude.askStep.mockResolvedValue(asks);
    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);
    expect(writtenStep().status).toBe('working');
    expect(result).toMatchObject({ ok: true, reply: { status: 'working' }, log: { outcome: 'tool_requests' } });
  });

  it('at the bound after the reads: the results are saved, the fixed sentence is added, and the conversation waits for the person', async () => {
    const asks = asksFor(use('toolu_n', 'calendar'));
    waitingAfter(1, { storedBytes: 100_000 - added(asks.content) });
    claude.askStep.mockResolvedValue(asks);

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(calendarHandler).toHaveBeenCalledTimes(1);
    const step = writtenStep();
    expect(step.status).toBe('idle');
    expect(step.messages).toEqual([
      { kind: 'model', content: { role: 'assistant', content: expect.any(Array) } },
      { kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_n', content: RESULT }] } },
      { kind: 'notice', content: assistantTexts('it').conversationFull },
    ]);
    expect(result).toMatchObject({
      ok: true,
      reply: { status: 'idle', activity: null, messages: [{ from: 'assistant' }, { from: 'notice', text: assistantTexts('it').conversationFull }] },
      log: { outcome: 'conversation_full', steps: 2 },
    });
    expectNoText(result.log);
  });

  it('the first step of a new conversation counts from nothing', async () => {
    noConversation();
    claude.askStep.mockResolvedValue(asksFor(use('toolu_n', 'calendar')));
    const result = await exchange.sendMessage(ALICE, TEXT, NOW, REQUEST, READS);
    expect(result).toMatchObject({ ok: true, reply: { status: 'working' } });
  });

  it('an answer in words past the bound is an answer like any other: the next message is the one refused', async () => {
    waitingAfter(1, { storedBytes: 150_000 });
    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', messages: [{ from: 'assistant', text: ANSWER }] }, log: { outcome: 'text' } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('sendMessage: a language question that took too long (5.6)', () => {
  // Claude's time-out and what a step needs after Claude answered.
  const ROOM = 22_000 + 2_000;

  it('with less time left than a step may take, the message is saved with its language and the step is left to continue', async () => {
    noConversation();
    const remainingMs = vi.fn(() => ROOM - 1);

    const result = await exchange.sendMessage(ALICE, TEXT, NOW, { requestId: 'req-9', remainingMs });

    expect(claude.askLanguage).toHaveBeenCalledTimes(1);
    expect(claude.askStep).not.toHaveBeenCalled();
    expect(db.startConversation).toHaveBeenCalledWith(
      'sub-alice',
      0,
      { language: 'en', promptVersion: mark },
      {
        messages: [
          { kind: 'model', content: { role: 'user', content: TEXT }, fromPerson: true },
          { kind: 'model', content: { role: 'system', content: LINE_EN } },
        ],
        status: 'working',
        proposal: null,
        timeZone: 'Europe/Rome',
        // The language question was answered, and is counted.
        inputTokens: 300,
        outputTokens: 10,
      },
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      reply: { status: 'working', activity: 'Working…', language: 'en', messages: [{ seq: 1, from: 'person', text: TEXT }], remainingToday: 5 },
      log: { outcome: 'step_left_to_continue', steps: 0, tools: [], languageUsage: { input: 300, output: 10, cacheRead: 0, cacheWrite: 0 } },
    });
    expect(result.log).not.toHaveProperty('usage');
    // The time left is read after the language question, not before.
    expect(remainingMs.mock.invocationCallOrder[0]).toBeGreaterThan(claude.askLanguage.mock.invocationCallOrder[0] ?? Infinity);
  });

  it('with exactly the time a step may take, Claude is asked', async () => {
    noConversation();
    const result = await exchange.sendMessage(ALICE, TEXT, NOW, { requestId: 'req-9', remainingMs: () => ROOM });
    expect(claude.askStep).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle' }, log: { outcome: 'text' } });
  });

  it('a later message asked no language question: the time left is not looked at', async () => {
    inConversation();
    const remainingMs = vi.fn(() => 1);
    await exchange.sendMessage(ALICE, TEXT, NOW, { requestId: 'req-9', remainingMs });
    expect(remainingMs).not.toHaveBeenCalled();
    expect(claude.askStep).toHaveBeenCalledTimes(1);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('continueExchange (POST /assistant/continue, 5.1, 6)', () => {
  it.each([
    ['there is no conversation', null, null],
    ['the conversation waits for the person', 'idle', ID],
    ['the conversation waits for a confirmation', 'awaiting_confirmation', ID],
  ] as const)('refuses when %s: nothing to continue, Claude not asked, nothing written', async (_what, status, conversationId) => {
    if (status) inConversation({ status });
    else noConversation();

    expect(await exchange.continueExchange(ALICE, NOW)).toEqual({ ok: false, refusal: 'nothing_to_continue', log: { conversationId, outcome: 'nothing_to_continue' } });
    expect(claude.askStep).not.toHaveBeenCalled();
    expect(db.saveStep).not.toHaveBeenCalled();
    expect(db.startConversation).not.toHaveBeenCalled();
  });

  it('asks Claude with the conversation as stored, results included and nothing added, and saves the answer', async () => {
    const { read, messages } = waitingAfter(1);

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(claude.askLanguage).not.toHaveBeenCalled();
    expect(claude.askStep).toHaveBeenCalledTimes(1);
    expect(claude.askStep.mock.calls[0]?.[0].conversation).toEqual(messages.map((message) => message.content));
    expect(db.saveStep).toHaveBeenCalledWith(
      'sub-alice',
      read,
      { messages: [{ kind: 'model', content: { role: 'assistant', content: CONTENT } }], status: 'idle', proposal: null, timeZone: 'Europe/Rome', inputTokens: 6400, outputTokens: 40 },
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      reply: { status: 'idle', activity: null, messages: [{ seq: 7, from: 'assistant', text: ANSWER, at: NOW }] },
      log: { outcome: 'text', steps: 2, tools: [], newConversation: false },
    });
  });

  it('is not a message of the day: nothing is counted, and the daily limit does not stop it', async () => {
    waitingAfter(1);
    usedToday(10);

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', remainingToday: 0 } });
    expect(writtenStep().messages.some((message) => message.fromPerson)).toBe(false);
  });

  it('does the step a slow language question left: the conversation holds the message only', async () => {
    const stored: StoredMessage[] = [
      { seq: 1, at: AT, kind: 'model', content: { role: 'user', content: TEXT } },
      { seq: 2, at: AT, kind: 'model', content: { role: 'system', content: LINE_EN } },
    ];
    db.readConversation.mockResolvedValue({ version: 1, conversation: conversation({ language: 'en', status: 'working', nextSeq: 3 }), messages: stored });

    const result = await exchange.continueExchange(ALICE, NOW);

    expect(claude.askStep.mock.calls[0]?.[0].conversation).toEqual(stored.map((message) => message.content));
    expect(result).toMatchObject({ ok: true, reply: { status: 'idle', messages: [{ seq: 3, from: 'assistant', text: ANSWER }] }, log: { steps: 1 } });
  });

  it.each([
    [{ kind: 'budget_reached' }, 'assistant_budget_reached'],
    [{ kind: 'unavailable', reason: 'timeout' }, 'assistant_unavailable'],
  ])('Claude cannot be asked (%j): the conversation is left waiting, and continue is the way on', async (answer, refusal) => {
    const { read } = waitingAfter(1);
    claude.askStep.mockResolvedValue(answer);

    const result = await exchange.continueExchange(ALICE, NOW, REQUEST, READS);

    expect(db.saveStep).toHaveBeenCalledWith('sub-alice', read, expect.objectContaining({ messages: [], status: 'working', inputTokens: 0, outputTokens: 0 }), NOW);
    expect(db.endConversation).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, refusal, log: { conversationId: ID, outcome: answer.kind, steps: 1 } });
  });

  it('two at once: the one that wrote second is busy, and nothing of its step is shown', async () => {
    waitingAfter(1);
    db.saveStep.mockRejectedValue(new db.AssistantBusyError());
    expect(await exchange.continueExchange(ALICE, NOW, REQUEST, READS)).toEqual({
      ok: false,
      refusal: 'assistant_busy',
      log: { conversationId: ID, outcome: 'lost_the_race', model: 'claude-sonnet-5-5', modelMs: 0 },
    });
  });

  it('a conversation started under other tools is over: there is nothing to continue', async () => {
    waitingAfter(1, { promptVersion: mark });
    expect(await exchange.continueExchange(ALICE, NOW, REQUEST, READS)).toMatchObject({ ok: false, refusal: 'nothing_to_continue', log: { conversationId: null } });
  });
});
