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
const claude = vi.hoisted(() => ({ askStep: vi.fn(), askLanguage: vi.fn(), assistantModel: vi.fn() }));
vi.mock('../../../src/lib/assistantDb', () => db);
vi.mock('../../../src/lib/anthropic', () => claude);

type Exchange = typeof import('../../../src/assistant/exchange');
type Prompt = typeof import('../../../src/assistant/prompt');

let exchange: Exchange;
let prompt: Prompt;
// The mark the deployed instructions give alice.
let mark: string;

async function load(limit = '10'): Promise<void> {
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.stubEnv('ASSISTANT_DAILY_MESSAGE_LIMIT', limit);
  vi.resetModules();
  exchange = await import('../../../src/assistant/exchange');
  prompt = await import('../../../src/assistant/prompt');
  mark = prompt.promptVersion(prompt.INSTRUCTIONS, prompt.contextBlock(ALICE, 'Europe/Rome'), []);
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
        tools: [],
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

  it.each(['working', 'awaiting_confirmation'] as const)('a conversation that is %s is busy', async (status) => {
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
    [
      { kind: 'tool_requests', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_calendar', input: {} }], requests: [], usage: USAGE },
      'assistant_unavailable',
      { outcome: 'tool_requests', reason: 'tool_not_offered' },
    ],
  ])('Claude cannot be asked, or asks what was not offered (%j): the message is saved alone, waiting for its step', async (answer, refusal, log) => {
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
