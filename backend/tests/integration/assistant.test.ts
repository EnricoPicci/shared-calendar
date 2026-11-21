import { api, createUserInNoGroup, forgetDailyUse, localDailyMessageLimit, queryAssistantPartition, removeUserIfPresent, signIn, subOf } from './setup';

// The assistant's journeys (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.2), end to end through
// sam local, with the fake Claude of the Docker stack answering for Anthropic
// (docs/ARCHITECTURE.md section 8). What the fake answers to each sentence sent here is
// fake-claude/answers.json, beside this file.
//
// Each block plays its own throw-away User, created through POST /users. A new account has a new
// `sub`, so it starts with no conversation and with all of today's messages. The file never
// touches the calendar table, and writes the assistant table through the API only, but for the
// Administrator's count of the day (forgetDailyUse).
//
// Secrets: tokens and passwords stay in variables; no assertion prints one.

const ADMIN_PASSWORD = 'Admin-Local-Pass-1!';
const LIMIT = localDailyMessageLimit();

let adminToken: string;

// Creates the throw-away User again (an earlier, interrupted run may have left it) and signs in.
async function newUser(username: string): Promise<string> {
  await removeUserIfPresent(username);
  const created = await api('POST', '/users', adminToken, { username });
  expect(created.status).toBe(201);
  return signIn(username, created.body?.password as string);
}

const say = (token: string, text: string) => api('POST', '/assistant/messages', token, { text });
const conversation = (token: string) => api('GET', '/assistant/conversation', token);
const startAgain = (token: string) => api('DELETE', '/assistant/conversation', token);

// What the routes answer while the person has no conversation.
const none = (remainingToday: number) => ({
  conversationId: null,
  language: null,
  status: 'idle',
  messages: [],
  activity: null,
  proposal: null,
  remainingToday,
});

const HELLO = 'Hello, can you hear me?';
const HELLO_ANSWER = 'Hello. I am the assistant of the shared calendar.';

beforeAll(async () => {
  adminToken = await signIn('admin', ADMIN_PASSWORD);
});

// Explained in simple words in docs/journeys/backend/assistant-text.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a conversation in text (5.6, 6)', () => {
  let token: string;
  let conversationId: string;

  beforeAll(async () => {
    token = await newUser('chat-text');
    // Nothing to end yet: the route answers 204 all the same.
    expect((await startAgain(token)).status).toBe(204);
  });

  afterAll(async () => {
    await removeUserIfPresent('chat-text');
  });

  it('has no conversation at first', async () => {
    const res = await conversation(token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(none(LIMIT));
  });

  it('refuses a message that is not one, and starts no conversation for it', async () => {
    expect(await api('POST', '/assistant/messages', token)).toMatchObject({ status: 400, body: { error: 'invalid_json' } });
    expect(await say(token, '   ')).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(await say(token, 'a'.repeat(2001))).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(await api('POST', '/assistant/messages', token, { text: HELLO, language: 'it' })).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect((await conversation(token)).body).toEqual(none(LIMIT));
  });

  it("answers the person's message with Claude's text", async () => {
    const res = await say(token, HELLO);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      conversationId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      language: 'en',
      status: 'idle',
      messages: [
        { seq: 1, from: 'person', text: HELLO, at: expect.any(String) },
        { seq: 3, from: 'assistant', text: HELLO_ANSWER, at: expect.any(String) },
      ],
      activity: null,
      proposal: null,
      remainingToday: LIMIT - 1,
    });
    conversationId = res.body?.conversationId as string;
  });

  it('reads the conversation back', async () => {
    const res = await conversation(token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      conversationId,
      language: 'en',
      status: 'idle',
      messages: [
        { seq: 1, from: 'person', text: HELLO },
        { seq: 3, from: 'assistant', text: HELLO_ANSWER },
      ],
      remainingToday: LIMIT - 1,
    });
  });

  it('stored three entries for it, the middle one being the line of the application, and counted one message today', async () => {
    const sub = subOf(token);
    const items = await queryAssistantPartition(`CONV#${sub}`);
    expect(items.map((item) => item.SK)).toEqual(['META', `MSG#${conversationId}#000001`, `MSG#${conversationId}#000002`, `MSG#${conversationId}#000003`]);
    expect(items[0]).toMatchObject({ conversationId, language: 'en', status: 'idle', messageCount: 1, nextSeq: 4, proposal: null });

    const entries = items.slice(1).map((item) => JSON.parse(item.content as string) as { role: string; content: unknown });
    expect(entries.map((entry) => entry.role)).toEqual(['user', 'system', 'assistant']);
    expect(entries[0]?.content).toBe(HELLO);
    expect(entries[1]?.content).toMatch(/^Now it is \w+ \d{1,2} \w+ \d{4} \(\d{4}-\d{2}-\d{2}\), \d{2}:\d{2}, in the calendar's time zone \(Europe\/Rome\)\. The language of this conversation is English/);
    // Claude's answer as Anthropic gave it, its thinking block included.
    expect((entries[2]?.content as { type: string }[]).map((block) => block.type)).toEqual(['thinking', 'text']);

    const usage = await queryAssistantPartition(`USAGE#${sub}`);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ messages: 1 });
    expect(usage[0]?.inputTokens).toBeGreaterThan(0);
  });

  it('goes on in the same conversation', async () => {
    const res = await say(token, 'And once more?');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      conversationId,
      messages: [
        { seq: 4, from: 'person', text: 'And once more?' },
        { seq: 6, from: 'assistant', text: 'Fake Claude: no answer is scripted for this message.' },
      ],
      remainingToday: LIMIT - 2,
    });
    expect(((await conversation(token)).body?.messages as unknown[]).length).toBe(4);
  });

  it('"New conversation" ends it: nothing to read, today\'s count kept, and the next message starts another', async () => {
    expect(await startAgain(token)).toEqual({ status: 204, body: undefined });
    expect((await conversation(token)).body).toEqual(none(LIMIT - 2));
    // Ending twice is not an error.
    expect((await startAgain(token)).status).toBe(204);

    const res = await say(token, HELLO);
    expect(res.status).toBe(200);
    expect(res.body?.conversationId).not.toBe(conversationId);
    expect(res.body).toMatchObject({ messages: [{ seq: 1, from: 'person' }, { seq: 3, from: 'assistant' }], remainingToday: LIMIT - 3 });
    expect(((await conversation(token)).body?.messages as unknown[]).length).toBe(2);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-language.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the language of a conversation (4.2)', () => {
  let token: string;

  beforeAll(async () => {
    token = await newUser('chat-lingua');
    expect((await startAgain(token)).status).toBe(204);
  });

  afterAll(async () => {
    await removeUserIfPresent('chat-lingua');
  });

  it('is set by the first message: Italian', async () => {
    const res = await say(token, 'Buongiorno, mi sente?');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      language: 'it',
      messages: [
        { seq: 1, from: 'person', text: 'Buongiorno, mi sente?' },
        { seq: 3, from: 'assistant', text: "Buongiorno. Sono l'assistente del calendario condiviso." },
      ],
    });
  });

  it('stays Italian when the person then writes in English: Claude is told so again', async () => {
    const res = await say(token, 'fake: say the line of the application');
    expect(res.status).toBe(200);
    expect(res.body?.language).toBe('it');
    const answer = (res.body?.messages as { from: string; text: string }[]).find((message) => message.from === 'assistant');
    expect(answer?.text).toMatch(/^The application told me: Now it is /);
    expect(answer?.text).toContain('The language of this conversation is Italian: answer in Italian, whatever language the person writes in.');
    expect((await conversation(token)).body?.language).toBe('it');
  });

  it('is asked again for a new conversation: English this time', async () => {
    expect((await startAgain(token)).status).toBe(204);
    const res = await say(token, HELLO);
    expect(res.body).toMatchObject({ language: 'en', messages: [{ seq: 1 }, { seq: 3, text: HELLO_ANSWER }] });
  });
});

// Explained in simple words in docs/journeys/backend/assistant-daily-limit.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the daily limit (4.4, 6.1)', () => {
  let token: string;

  beforeAll(async () => {
    token = await newUser('chat-limit');
    expect((await startAgain(token)).status).toBe(204);
  });

  afterAll(async () => {
    await removeUserIfPresent('chat-limit');
  });

  it("takes today's messages one by one, counting down to none left", async () => {
    for (let sent = 1; sent <= LIMIT; sent++) {
      const res = await say(token, `Message ${sent} of today`);
      expect(res.status).toBe(200);
      expect(res.body?.remainingToday).toBe(LIMIT - sent);
    }
  });

  it('refuses the next one with 429, and the conversation is as it was', async () => {
    const before = (await conversation(token)).body;
    expect(before).toMatchObject({ status: 'idle', remainingToday: 0 });
    expect((before?.messages as unknown[]).length).toBe(2 * LIMIT);

    const res = await say(token, 'One too many');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'assistant_limit_reached', message: expect.any(String) });
    expect((await conversation(token)).body).toEqual(before);
  });

  it('a new conversation does not give the messages back', async () => {
    expect((await startAgain(token)).status).toBe(204);
    expect((await say(token, HELLO)).status).toBe(429);
    expect((await conversation(token)).body).toEqual(none(0));
  });
});

// Explained in simple words in docs/journeys/backend/assistant-cannot-answer.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('when Claude cannot answer (6.1, 7.4)', () => {
  let token: string;

  beforeAll(async () => {
    token = await newUser('chat-down');
    expect((await startAgain(token)).status).toBe(204);
  });

  afterAll(async () => {
    await removeUserIfPresent('chat-down');
  });

  it.each([
    ['the spending limit of the Anthropic account is reached', 'fake: a spending limit of our own', 'assistant_budget_reached'],
    ['Anthropic is overloaded', 'fake: overloaded', 'assistant_unavailable'],
  ])('answers 503 when %s, keeps the message, and leaves the conversation waiting for its step', async (_when, text, code) => {
    const res = await say(token, text);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: code, message: expect.any(String) });

    const kept = (await conversation(token)).body;
    expect(kept).toMatchObject({
      conversationId: expect.any(String),
      language: 'en',
      status: 'working',
      messages: [{ seq: 1, from: 'person', text }],
      activity: 'Working…',
    });
    expect((kept?.messages as unknown[]).length).toBe(1);

    // The step is still to do: another message is not taken meanwhile.
    expect(await say(token, HELLO)).toMatchObject({ status: 409, body: { error: 'assistant_busy' } });

    expect((await startAgain(token)).status).toBe(204);
  });

  it('answers again right after: the local stack does not remember a spending limit', async () => {
    const res = await say(token, HELLO);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', messages: [{ from: 'person' }, { from: 'assistant', text: HELLO_ANSWER }] });
  });

  it('counted the two messages that got no answer: they were saved', async () => {
    expect((await conversation(token)).body?.remainingToday).toBe(LIMIT - 3);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-who-may.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('who may talk to the assistant (6)', () => {
  const NOBODY_PASSWORD = 'Nobody-Local-Pass-1!';
  let nobodyToken: string;

  beforeAll(async () => {
    await removeUserIfPresent('chat-nobody');
    await createUserInNoGroup('chat-nobody', NOBODY_PASSWORD);
    nobodyToken = await signIn('chat-nobody', NOBODY_PASSWORD);
  });

  afterAll(async () => {
    await removeUserIfPresent('chat-nobody');
  });

  it.each([
    ['GET', '/assistant/conversation', undefined],
    ['DELETE', '/assistant/conversation', undefined],
    ['POST', '/assistant/messages', { text: HELLO }],
  ])('%s %s without a token is 401 (API Gateway answers)', async (method, path, body) => {
    const res = await api(method, path, undefined, body);
    expect(res.status).toBe(401);
  });

  it.each([
    ['GET', '/assistant/conversation', undefined],
    ['DELETE', '/assistant/conversation', undefined],
    ['POST', '/assistant/messages', { text: HELLO }],
  ])('%s %s with the token of an account in neither group is 403', async (method, path, body) => {
    const res = await api(method, path, nobodyToken, body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden', message: expect.any(String) });
  });

  it('stored nothing for that account', async () => {
    expect(await queryAssistantPartition(`CONV#${subOf(nobodyToken)}`)).toEqual([]);
  });

  it('the Administrator has a conversation of their own, like a User', async () => {
    // The seeded Administrator is the same account at every run: its count of today starts again.
    await forgetDailyUse(subOf(adminToken));
    expect((await startAgain(adminToken)).status).toBe(204);
    const res = await say(adminToken, HELLO);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ language: 'en', messages: [{ seq: 1, from: 'person' }, { seq: 3, from: 'assistant', text: HELLO_ANSWER }] });
    expect((await startAgain(adminToken)).status).toBe(204);
  });
});
