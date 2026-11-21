import type { Conversation, StoredMessage } from '../../../src/lib/assistantDb';

// The table module is replaced: these tests are about what the core makes of a conversation, not
// about how it is stored. The core reads its configuration once per container, so each test loads
// a fresh copy.
const db = vi.hoisted(() => {
  class AssistantBusyError extends Error {}
  return { AssistantBusyError, readConversation: vi.fn(), readDailyUse: vi.fn(), endConversation: vi.fn() };
});
vi.mock('../../../src/lib/assistantDb', () => db);

type Core = typeof import('../../../src/assistant/conversation');

async function load(limit = '10'): Promise<Core> {
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.stubEnv('ASSISTANT_DAILY_MESSAGE_LIMIT', limit);
  vi.resetModules();
  return import('../../../src/assistant/conversation');
}

const NOW = '2026-11-21T14:05:00.000Z';
const ALICE = { sub: 'sub-alice', username: 'alice', role: 'user' as const };

// The mark the deployed instructions give alice: read from the module under test, never written here.
async function markOf(core: Core): Promise<string> {
  db.readConversation.mockResolvedValueOnce({ version: 0, conversation: null, messages: [] });
  return (await core.currentConversation(ALICE, NOW, { timeZone: 'Europe/Rome', dailyMessageLimit: 10 })).mark;
}

const conversation = (over: Partial<Conversation> = {}): Conversation => ({
  conversationId: '01JD0000000000000000000001',
  language: 'it',
  status: 'idle',
  startedAt: '2026-11-21T13:00:00.000Z',
  lastActivityAt: '2026-11-21T13:00:05.000Z',
  messageCount: 1,
  storedBytes: 300,
  nextSeq: 4,
  promptVersion: 'set-in-each-test',
  proposal: null,
  executing: null,
  version: 3,
  expiresAt: 1795400000,
  ...over,
});

const AT = '2026-11-21T13:00:00.000Z';
const MESSAGES: StoredMessage[] = [
  { seq: 1, at: AT, kind: 'model', content: { role: 'user', content: 'Buongiorno, mi sente?' } },
  { seq: 2, at: AT, kind: 'model', content: { role: 'system', content: 'Now it is Saturday. The language is Italian.' } },
  {
    seq: 3,
    at: AT,
    kind: 'model',
    content: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'Buongiorno.' }] },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  db.readDailyUse.mockResolvedValue({ messages: 4, inputTokens: 0, outputTokens: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('shown: what a person reads of a stored message (6)', () => {
  let core: Core;
  beforeAll(async () => {
    core = await load();
  });

  it("the person's own text, the assistant's text and a notice", () => {
    expect(core.shown(MESSAGES[0] as StoredMessage)).toEqual({ seq: 1, from: 'person', text: 'Buongiorno, mi sente?', at: AT });
    expect(core.shown(MESSAGES[2] as StoredMessage)).toEqual({ seq: 3, from: 'assistant', text: 'Buongiorno.', at: AT });
    expect(core.shown({ seq: 4, at: AT, kind: 'notice', content: 'The answer was cut short.' })).toEqual({ seq: 4, from: 'notice', text: 'The answer was cut short.', at: AT });
  });

  it('never the line of the application, the results of tools, or an answer without text', () => {
    expect(core.shown(MESSAGES[1] as StoredMessage)).toBeNull();
    expect(core.shown({ seq: 5, at: AT, kind: 'model', content: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Free: 10:00' }] } })).toBeNull();
    expect(
      core.shown({ seq: 6, at: AT, kind: 'model', content: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_calendar', input: {} }] } }),
    ).toBeNull();
    expect(core.shown({ seq: 7, at: AT, kind: 'model', content: { role: 'assistant', content: 'a plain text, a shape the core never stores' } })).toBeNull();
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('showConversation (GET /assistant/conversation, 6)', () => {
  it('answers an empty reply when the person has no conversation, with the messages left today', async () => {
    const core = await load();
    db.readConversation.mockResolvedValue({ version: 0, conversation: null, messages: [] });

    const { reply, log } = await core.showConversation(ALICE, NOW);

    expect(reply).toEqual({ conversationId: null, language: null, status: 'idle', messages: [], activity: null, proposal: null, remainingToday: 6 });
    expect(log).toEqual({ conversationId: null, outcome: 'shown' });
    expect(db.readConversation).toHaveBeenCalledWith('sub-alice', NOW);
    expect(db.readDailyUse).toHaveBeenCalledWith('sub-alice', NOW, 'Europe/Rome');
  });

  it('answers every message a person reads, in order, and nothing else', async () => {
    const core = await load();
    const mark = await markOf(core);
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: mark }), messages: MESSAGES });

    const { reply, log } = await core.showConversation(ALICE, NOW);

    expect(reply).toEqual({
      conversationId: '01JD0000000000000000000001',
      language: 'it',
      status: 'idle',
      messages: [
        { seq: 1, from: 'person', text: 'Buongiorno, mi sente?', at: AT },
        { seq: 3, from: 'assistant', text: 'Buongiorno.', at: AT },
      ],
      activity: null,
      proposal: null,
      remainingToday: 6,
    });
    expect(log).toEqual({ conversationId: '01JD0000000000000000000001', outcome: 'shown' });
    expect(JSON.stringify(log)).not.toContain('Buongiorno');
  });

  it('says a line of progress, in the language of the conversation, while a step waits', async () => {
    const core = await load();
    const mark = await markOf(core);
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: mark, status: 'working' }), messages: MESSAGES.slice(0, 2) });

    const { reply } = await core.showConversation(ALICE, NOW);

    expect(reply.status).toBe('working');
    expect(reply.activity).toBe('Ci sto lavorando…');
  });

  it('treats a conversation started under other instructions as over (4.3)', async () => {
    const core = await load();
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: 'an-older-mark' }), messages: MESSAGES });

    const { reply, log } = await core.showConversation(ALICE, NOW);

    expect(reply.conversationId).toBeNull();
    expect(reply.messages).toEqual([]);
    expect(log.conversationId).toBeNull();
  });

  it('never says fewer than zero messages left', async () => {
    const core = await load('3');
    db.readConversation.mockResolvedValue({ version: 0, conversation: null, messages: [] });
    expect((await core.showConversation(ALICE, NOW)).reply.remainingToday).toBe(0);
  });

  it('gives the same mark to the same person and another to another role', async () => {
    const core = await load();
    const mark = await markOf(core);
    expect(await markOf(core)).toBe(mark);
    db.readConversation.mockResolvedValueOnce({ version: 0, conversation: null, messages: [] });
    const admin = await core.currentConversation({ ...ALICE, role: 'admin' }, NOW, { timeZone: 'Europe/Rome', dailyMessageLimit: 10 });
    expect(admin.mark).not.toBe(mark);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('closeConversation (DELETE /assistant/conversation, 6)', () => {
  it('ends the conversation that was read, naming its version', async () => {
    const core = await load();
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation(), messages: MESSAGES });

    expect(await core.closeConversation(ALICE, NOW)).toEqual({ conversationId: '01JD0000000000000000000001', outcome: 'ended' });
    expect(db.endConversation).toHaveBeenCalledWith('sub-alice', 3);
  });

  it('ends a conversation started under other instructions too: its mark is not looked at', async () => {
    const core = await load();
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation({ promptVersion: 'an-older-mark' }), messages: [] });

    expect((await core.closeConversation(ALICE, NOW)).outcome).toBe('ended');
  });

  it('writes nothing when there is none to end', async () => {
    const core = await load();
    db.readConversation.mockResolvedValue({ version: 5, conversation: null, messages: [] });

    expect(await core.closeConversation(ALICE, NOW)).toEqual({ conversationId: null, outcome: 'nothing_to_end' });
    expect(db.endConversation).not.toHaveBeenCalled();
  });

  it('reads again and tries again when a step of the same person was being saved', async () => {
    const core = await load();
    db.readConversation
      .mockResolvedValueOnce({ version: 3, conversation: conversation(), messages: [] })
      .mockResolvedValueOnce({ version: 4, conversation: conversation({ version: 4 }), messages: [] });
    db.endConversation.mockRejectedValueOnce(new db.AssistantBusyError()).mockResolvedValueOnce(undefined);

    expect((await core.closeConversation(ALICE, NOW)).outcome).toBe('ended');
    expect(db.endConversation).toHaveBeenNthCalledWith(2, 'sub-alice', 4);
  });

  it('gives up after three tries, and at once for any other failure', async () => {
    const core = await load();
    db.readConversation.mockResolvedValue({ version: 3, conversation: conversation(), messages: [] });
    db.endConversation.mockRejectedValue(new db.AssistantBusyError());
    await expect(core.closeConversation(ALICE, NOW)).rejects.toBeInstanceOf(db.AssistantBusyError);
    expect(db.endConversation).toHaveBeenCalledTimes(3);

    db.endConversation.mockReset().mockRejectedValue(new Error('DynamoDB is down'));
    await expect(core.closeConversation(ALICE, NOW)).rejects.toThrow('DynamoDB is down');
    expect(db.endConversation).toHaveBeenCalledTimes(1);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the refusals (6)', () => {
  it('each has the status its route answers', async () => {
    const { REFUSALS } = await load();
    expect(Object.fromEntries(Object.entries(REFUSALS).map(([code, { status }]) => [code, status]))).toEqual({
      assistant_busy: 409,
      conversation_full: 409,
      assistant_limit_reached: 429,
      assistant_unavailable: 503,
      assistant_budget_reached: 503,
    });
  });
});
