import { addDays, assistantTexts, localDateOf } from '@shared-calendar/shared';
import { api, createUserInNoGroup, forgetDailyUse, localDailyMessageLimit, queryAssistantPartition, removeUserIfPresent, signIn, subOf } from './setup';

// The assistant's journeys (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.2), end to end through
// sam local, with the fake Claude of the Docker stack answering for Anthropic
// (docs/ARCHITECTURE.md section 8). What the fake answers to each sentence sent here is
// fake-claude/answers.json, beside this file.
//
// Each block plays its own throw-away User, created through POST /users. A new account has a new
// `sub`, so it starts with no conversation and with all of today's messages. The file writes the
// assistant table through the API only, but for the Administrator's count of the day
// (forgetDailyUse).
//
// The calendar table is never emptied here, and nothing another file left in it is relied on.
// Each block that needs the calendar creates what it uses through the API, as the Administrator:
// one window on a day of its own (25 to 28 days after today), under a type name of its own and in
// hours no other journey opens. It removes the window and the type at the end and, should an
// interrupted run have left them, before it starts; the appointments it booked are cancelled
// first, so what stays in the table is those cancelled appointments and their events, which keep
// no slot busy. Before any block starts, the file removes what an interrupted run of any of them
// left on a day still to come.
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
const goOn = (token: string) => api('POST', '/assistant/continue', token);

// The entries of the person's conversation in progress that Claude is given, as stored: each
// message item of that conversation, in order, its content read as the JSON text it is kept as.
// A notice, which only the person reads, is left out, and so are the messages of the person's
// earlier conversations, which the partition also holds.
async function storedEntries(token: string): Promise<{ role: string; content: unknown }[]> {
  const items = await queryAssistantPartition(`CONV#${subOf(token)}`);
  const id = items.find((item) => item.SK === 'META')?.conversationId as string;
  return items.filter((item) => item.SK.startsWith(`MSG#${id}#`) && item.kind === 'model').map((item) => JSON.parse(item.content as string) as { role: string; content: unknown });
}

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

// The date `days` after today's date in the calendar's zone: the date the fake's answer file
// names as {{date+N}}.
async function dayOfJourney(days: number): Promise<string> {
  const settings = await api('GET', '/calendar/settings', adminToken);
  return addDays(localDateOf(new Date().toISOString(), settings.body?.timeZone as string), days);
}

type JourneyWindow = { typeName: string; source?: string; sourceId?: string };
type Booked = { appointmentId: string; typeName: string; start: string; username: string; status: string; note: string | null; createdBy: { username: string; role: string } };

// The type names of the journeys that use the calendar, one per block.
const JOURNEY_TYPES = ['assistant journey', 'assistant booking journey', 'assistant declining journey', 'assistant trouble journey'];

// Removes what the journeys made in the calendar under one of their type names, when it is there:
// the appointments booked under that type are cancelled, then its windows and the type are
// deleted. It looks at every day a journey can have used and that is still to come, tomorrow to
// 28 days ahead, so that what a run interrupted on an earlier date left is removed too.
async function removeFromCalendar(typeName: string): Promise<void> {
  const from = await dayOfJourney(1);
  const to = await dayOfJourney(28);
  const booked = await api('GET', `/calendar/appointments?from=${from}&to=${to}`, adminToken);
  expect(booked.status).toBe(200);
  for (const appointment of (booked.body?.appointments as Booked[]).filter((a) => a.typeName === typeName)) {
    expect((await api('POST', `/calendar/appointments/${appointment.appointmentId}/cancel`, adminToken, {})).status).toBe(200);
  }
  const view = await api('GET', `/calendar?from=${from}&to=${to}`, adminToken);
  expect(view.status).toBe(200);
  const windows = (view.body?.days as { windows: JourneyWindow[] }[]).flatMap((d) => d.windows);
  for (const window of windows.filter((w) => w.typeName === typeName && w.source === 'one_off')) {
    expect((await api('DELETE', `/calendar/windows/${window.sourceId}`, adminToken)).status).toBe(204);
  }
  const types = (await api('GET', '/calendar/types', adminToken)).body?.types as { typeId: string; name: string }[];
  for (const type of types.filter((t) => t.name === typeName)) {
    expect((await api('DELETE', `/calendar/types/${type.typeId}`, adminToken)).status).toBe(204);
  }
}

// Opens the journey's window on its day under a new type of the journey's name.
async function openWindow(day: string, typeName: string, start: string, end: string): Promise<{ typeId: string; windowId: string }> {
  const type = await api('POST', '/calendar/types', adminToken, { name: typeName });
  expect(type.status).toBe(201);
  const typeId = type.body?.typeId as string;
  const window = await api('POST', '/calendar/windows', adminToken, { date: day, start, end, typeId });
  expect(window.status).toBe(201);
  return { typeId, windowId: window.body?.windowId as string };
}

const confirm = (token: string, proposalId: string) => api('POST', `/assistant/proposals/${proposalId}/confirm`, token);
const decline = (token: string, proposalId: string) => api('POST', `/assistant/proposals/${proposalId}/decline`, token);
// The person's own appointments that have not ended, booked ones only, as the calendar's route gives them.
const appointmentsOf = async (token: string) => (await api('GET', '/calendar/appointments?upcoming=true', token)).body?.appointments as Booked[];

// A proposal of one booking as the screen gets it: the question and the two labels are the fixed
// texts of the conversation's language, the summary is the server's own sentence.
const bookingProposal = (day: string, start: string, end: string, type: string, outcome: string | null = null, error: string | null = null) => ({
  proposalId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  question: 'Make this change?',
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  actions: [{ summary: assistantTexts('en').changes.bookAppointment({ date: day, start, end, type, note: null, secondTime: false }), outcome, error }],
});

// A well-formed id that names no proposal.
const NO_PROPOSAL = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

const HELLO = 'Hello, can you hear me?';
const HELLO_ANSWER = 'Hello. I am the assistant of the shared calendar.';

beforeAll(async () => {
  adminToken = await signIn('admin', ADMIN_PASSWORD);
  // The blocks open the same early hours on neighbouring days, so what an interrupted run of one
  // left could stand in the way of another a day later: all of it is removed before any starts.
  for (const typeName of JOURNEY_TYPES) await removeFromCalendar(typeName);
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

// Explained in simple words in docs/journeys/backend/assistant-reading.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('reading the calendar (5.1, 8)', () => {
  const TYPE = 'assistant journey';
  const ASK = 'fake: what is open on the day of the journey?';
  // The day the fake asks the calendar for: 25 days after today's date in the calendar's zone,
  // the date its answer file names as {{date+25}}. 05:00 to 07:00 are hours no other journey opens.
  let day: string;
  let token: string;
  let typeId: string;
  let windowId: string;

  beforeAll(async () => {
    day = await dayOfJourney(25);
    token = await newUser('chat-read');
    await removeFromCalendar(TYPE);
    ({ typeId, windowId } = await openWindow(day, TYPE, '05:00', '07:00'));
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-read');
  });

  it('a question that needs the calendar: Claude asks to read, the read is run, and the answer is "working" with the line of that read', async () => {
    const res = await say(token, ASK);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      conversationId: expect.any(String),
      language: 'en',
      status: 'working',
      activity: 'Looking at the calendar…',
      proposal: null,
      remainingToday: LIMIT - 1,
    });
    // Nothing of the read is shown: the person's message only.
    expect(res.body?.messages).toEqual([{ seq: 1, from: 'person', text: ASK, at: expect.any(String) }]);
  });

  it('the conversation, read back, says the same line while the step waits', async () => {
    const res = await conversation(token);
    expect(res.body).toMatchObject({ status: 'working', activity: 'Looking at the calendar…' });
    expect(res.body?.messages).toEqual([{ seq: 1, from: 'person', text: ASK, at: expect.any(String) }]);
  });

  it('another message while the step waits is refused: busy', async () => {
    expect(await say(token, HELLO)).toMatchObject({ status: 409, body: { error: 'assistant_busy' } });
  });

  it('continue does the next step: Claude answers from what the calendar gave, the window and the free slots of the journey', async () => {
    const res = await goOn(token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', activity: null, remainingToday: LIMIT - 1 });
    const messages = res.body?.messages as { seq: number; from: string; text: string }[];
    expect(messages.map((message) => [message.seq, message.from])).toEqual([[5, 'assistant']]);

    // The fake answers with the result of the tool, word for word: what Claude was given.
    const given = JSON.parse(messages[0]?.text ?? '') as { from: string; to: string; days: { date: string; windows: object[]; freeSlots: string[] }[] };
    expect(given.from).toBe(day);
    expect(given.to).toBe(day);
    const days = given.days.filter((d) => d.date === day);
    expect(days).toHaveLength(1);
    // Local times, the type by its name; whatever else that day holds is not looked at.
    expect(days[0]?.windows).toContainEqual({ start: '05:00', end: '07:00', type: TYPE });
    expect(days[0]?.freeSlots).toEqual(expect.arrayContaining(['05:00', '06:00']));
    // Nothing internal: no id of the window or of the type.
    expect(messages[0]?.text).not.toContain(windowId);
    expect(messages[0]?.text).not.toContain(typeId);
  });

  it('stored the exchange as five entries, of which the person reads two, and counted one message', async () => {
    const stored = await storedEntries(token);
    expect(stored.map((entry) => entry.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    // Claude's request for the tool, and its result in an entry of its own.
    expect(stored[2]?.content).toContainEqual(expect.objectContaining({ type: 'tool_use', name: 'get_calendar', input: { from: day, to: day } }));
    expect(stored[3]?.content).toEqual([expect.objectContaining({ type: 'tool_result', content: expect.stringContaining(TYPE) })]);

    const read = (await conversation(token)).body;
    expect((read?.messages as { seq: number; from: string }[]).map((message) => [message.seq, message.from])).toEqual([
      [1, 'person'],
      [5, 'assistant'],
    ]);
    expect(read?.remainingToday).toBe(LIMIT - 1);
  });

  it('continue with nothing to continue is refused, with a conversation that waits for the person and with none', async () => {
    expect(await goOn(token)).toEqual({ status: 409, body: { error: 'nothing_to_continue', message: expect.any(String) } });
    expect((await startAgain(token)).status).toBe(204);
    expect(await goOn(token)).toMatchObject({ status: 409, body: { error: 'nothing_to_continue' } });
    expect((await conversation(token)).body).toEqual(none(LIMIT - 1));
  });
});

// Explained in simple words in docs/journeys/backend/assistant-booking.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('booking through the assistant (5.4, 5.5, 6)', () => {
  const TYPE = 'assistant booking journey';
  const ASK = 'fake: book me the slot of the booking journey';
  // The day the fake asks to book on: {{date+26}} of its answer file, at 05:00.
  let day: string;
  let token: string;
  let proposalId: string;
  let appointmentId: string;

  beforeAll(async () => {
    day = await dayOfJourney(26);
    token = await newUser('chat-book');
    await removeFromCalendar(TYPE);
    await openWindow(day, TYPE, '05:00', '07:00');
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-book');
  });

  it('a request to book: Claude asks for the change, nothing is booked, and the answer holds the proposal in the words of the server', async () => {
    const res = await say(token, ASK);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      conversationId: expect.any(String),
      language: 'en',
      status: 'awaiting_confirmation',
      messages: [{ seq: 1, from: 'person', text: ASK, at: expect.any(String) }],
      activity: null,
      proposal: bookingProposal(day, '05:00', '06:00', TYPE),
      remainingToday: LIMIT - 1,
    });
    proposalId = (res.body?.proposal as { proposalId: string }).proposalId;
    expect(await appointmentsOf(token)).toEqual([]);
  });

  it('the conversation, read back, shows the same proposal waiting, and there is no step to continue', async () => {
    const read = (await conversation(token)).body;
    expect(read).toMatchObject({ status: 'awaiting_confirmation', activity: null, proposal: { ...bookingProposal(day, '05:00', '06:00', TYPE), proposalId } });
    expect(await goOn(token)).toMatchObject({ status: 409, body: { error: 'nothing_to_continue' } });
  });

  it('an id that is not one is refused, and so is the id of no proposal: the proposal keeps waiting', async () => {
    expect(await confirm(token, 'not-an-id')).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(await decline(token, 'not-an-id')).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect(await confirm(token, NO_PROPOSAL)).toEqual({ status: 404, body: { error: 'proposal_not_found', message: expect.any(String) } });
    expect(await decline(token, NO_PROPOSAL)).toEqual({ status: 404, body: { error: 'proposal_not_found', message: expect.any(String) } });
    expect((await conversation(token)).body).toMatchObject({ status: 'awaiting_confirmation', proposal: { proposalId } });
    expect(await appointmentsOf(token)).toEqual([]);
  });

  it('confirm books it: the proposal is shown as done, and Claude is told the person confirmed and what was booked', async () => {
    const res = await confirm(token, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'idle',
      activity: null,
      proposal: { ...bookingProposal(day, '05:00', '06:00', TYPE, 'done'), proposalId },
      remainingToday: LIMIT - 1,
    });
    const messages = res.body?.messages as { seq: number; from: string; text: string }[];
    expect(messages.map((message) => [message.seq, message.from])).toEqual([[5, 'assistant']]);
    // The fake answers with the result of the change, word for word: what Claude was given.
    const given = JSON.parse(messages[0]?.text ?? '') as { outcome: string; message: string; appointment: Record<string, unknown> };
    expect(given.outcome).toBe('done');
    expect(given.message).toContain('pressed the confirm button');
    expect(given.appointment).toMatchObject({ date: day, start: '05:00', end: '06:00', type: TYPE, username: 'chat-book', note: null, status: 'booked' });
    appointmentId = given.appointment.id as string;
  });

  it("the calendar's own route shows the appointment, booked by the User themself", async () => {
    const booked = await appointmentsOf(token);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ appointmentId, typeName: TYPE, username: 'chat-book', status: 'booked', note: null, createdBy: { username: 'chat-book', role: 'user' } });
  });

  it('the same proposal cannot be confirmed or declined again, and nothing more is booked', async () => {
    expect(await confirm(token, proposalId)).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });
    expect(await decline(token, proposalId)).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });
    expect(await appointmentsOf(token)).toHaveLength(1);
  });

  it('stored the exchange as five entries, counted one message, and shows the settled proposal until the next message', async () => {
    const stored = await storedEntries(token);
    expect(stored.map((entry) => entry.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    expect(stored[2]?.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'book_appointment', input: { date: day, time: '05:00' } })]);
    expect(stored[3]?.content).toEqual([expect.objectContaining({ type: 'tool_result', content: expect.stringContaining('"outcome":"done"') })]);

    expect((await conversation(token)).body).toMatchObject({ status: 'idle', proposal: { proposalId, actions: [{ outcome: 'done', error: null }] }, remainingToday: LIMIT - 1 });
    expect((await say(token, HELLO)).body).toMatchObject({ status: 'idle', proposal: null, remainingToday: LIMIT - 2 });
    expect((await conversation(token)).body?.proposal).toBeNull();
  });
});

// Explained in simple words in docs/journeys/backend/assistant-not-confirmed.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a proposal that is not confirmed (5.5, 6)', () => {
  const TYPE = 'assistant declining journey';
  const ASK = 'fake: book me the slot of the declining journey';
  // The day the fake asks to book on: {{date+27}} of its answer file, at 05:00.
  let day: string;
  let token: string;
  let proposalId: string;

  const proposalIdOf = (body: Record<string, unknown> | undefined) => (body?.proposal as { proposalId: string }).proposalId;
  // The results of tools Claude was given, as stored, in order.
  const storedResults = async () =>
    (await storedEntries(token))
      .filter((entry) => entry.role === 'user' && Array.isArray(entry.content))
      .flatMap((entry) => entry.content as { type: string; content: string }[])
      .map((block) => JSON.parse(block.content) as { outcome: string });

  beforeAll(async () => {
    day = await dayOfJourney(27);
    token = await newUser('chat-decline');
    await removeFromCalendar(TYPE);
    await openWindow(day, TYPE, '05:00', '07:00');
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-decline');
  });

  it('decline: nothing is booked, a notice says so, Claude is not asked, and the conversation waits for the person', async () => {
    const asked = await say(token, ASK);
    expect(asked.body).toMatchObject({ status: 'awaiting_confirmation', proposal: bookingProposal(day, '05:00', '06:00', TYPE) });

    const res = await decline(token, proposalIdOf(asked.body));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', activity: null, proposal: null, remainingToday: LIMIT - 1 });
    expect(res.body?.messages).toEqual([{ seq: 5, from: 'notice', text: 'Nothing was changed.', at: expect.any(String) }]);

    // What Claude will read at its next step: the change was declined. No answer of Claude follows.
    expect((await storedEntries(token)).map((entry) => entry.role)).toEqual(['user', 'system', 'assistant', 'user']);
    expect((await storedResults()).map((result) => result.outcome)).toEqual(['declined']);
    expect(await appointmentsOf(token)).toEqual([]);
    // A declined proposal is gone: it can be neither confirmed nor declined again.
    expect(await confirm(token, proposalIdOf(asked.body))).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });
  });

  it('the same request again makes a new proposal', async () => {
    const res = await say(token, ASK);
    expect(res.body).toMatchObject({ status: 'awaiting_confirmation', proposal: bookingProposal(day, '05:00', '06:00', TYPE), remainingToday: LIMIT - 2 });
    proposalId = proposalIdOf(res.body);
  });

  it('a message that is refused while the proposal waits changes nothing: the proposal keeps waiting', async () => {
    expect(await say(token, '   ')).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
    expect((await conversation(token)).body).toMatchObject({ status: 'awaiting_confirmation', proposal: { proposalId }, remainingToday: LIMIT - 2 });
  });

  it('a typed "yes" confirms nothing: the proposal is dropped, Claude asks again, and a new proposal waits', async () => {
    const res = await say(token, 'yes');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'awaiting_confirmation', proposal: bookingProposal(day, '05:00', '06:00', TYPE), remainingToday: LIMIT - 3 });
    expect(res.body?.messages).toEqual([{ seq: expect.any(Number), from: 'person', text: 'yes', at: expect.any(String) }]);
    expect(proposalIdOf(res.body)).not.toBe(proposalId);
    expect(await appointmentsOf(token)).toEqual([]);

    // The dropped proposal is gone, and Claude was told it was not confirmed.
    expect(await confirm(token, proposalId)).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });
    expect((await storedResults()).map((result) => result.outcome)).toEqual(['declined', 'not_confirmed']);
    proposalId = proposalIdOf(res.body);
  });

  it('any other message drops the proposal too, and is answered as usual', async () => {
    const res = await say(token, HELLO);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: null, remainingToday: LIMIT - 4 });
    expect((res.body?.messages as { from: string; text: string }[]).map((message) => [message.from, message.text])).toEqual([
      ['person', HELLO],
      ['assistant', HELLO_ANSWER],
    ]);
    expect((await storedResults()).map((result) => result.outcome)).toEqual(['declined', 'not_confirmed', 'not_confirmed']);
    expect(await confirm(token, proposalId)).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });
    expect(await appointmentsOf(token)).toEqual([]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-confirm-trouble.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a confirmation that meets trouble (5.4, 7.4)', () => {
  const TYPE = 'assistant trouble journey';
  // The day the fake asks to book on: {{date+28}} of its answer file, at 04:00, 05:00 and 06:00,
  // one hour for each of the three troubles.
  let day: string;
  let token: string;
  let rivalToken: string;
  let typeId: string;

  const propose = async (text: string): Promise<string> => {
    const res = await say(token, text);
    expect(res.body).toMatchObject({ status: 'awaiting_confirmation' });
    return (res.body?.proposal as { proposalId: string }).proposalId;
  };

  beforeAll(async () => {
    day = await dayOfJourney(28);
    token = await newUser('chat-trouble');
    rivalToken = await newUser('chat-rival');
    await removeFromCalendar(TYPE);
    ({ typeId } = await openWindow(day, TYPE, '04:00', '07:00'));
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-trouble');
    await removeUserIfPresent('chat-rival');
  });

  it('the slot is taken between the proposal and the confirmation: the booking is refused by the calendar, shown as refused with its code, and Claude is told', async () => {
    const proposalId = await propose('fake: book me the slot somebody else takes');
    // Somebody else books the proposed hour through the calendar's own route.
    const slots = ((await api('GET', `/calendar?from=${day}&to=${day}`, rivalToken)).body?.days as { slots: { start: string; typeId: string }[] }[])[0]!.slots;
    const first = slots.find((slot) => slot.typeId === typeId)!;
    expect((await api('POST', '/calendar/appointments', rivalToken, { start: first.start })).status).toBe(201);

    const res = await confirm(token, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...bookingProposal(day, '04:00', '05:00', TYPE, 'refused', 'slot_taken'), proposalId } });
    const messages = res.body?.messages as { from: string; text: string }[];
    expect(messages.map((message) => message.from)).toEqual(['assistant']);
    expect(JSON.parse(messages[0]?.text ?? '')).toMatchObject({ error: 'slot_taken' });
    expect(await appointmentsOf(token)).toEqual([]);
    expect(await appointmentsOf(rivalToken)).toHaveLength(1);
    expect((await startAgain(token)).status).toBe(204);
  });

  it('two confirmations of one proposal at the same moment: one books, the other finds no proposal, and there is one appointment', async () => {
    const proposalId = await propose('fake: book me the slot confirmed twice');
    const answers = await Promise.all([confirm(token, proposalId), confirm(token, proposalId)]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 404]);
    expect(answers.find((answer) => answer.status === 404)?.body).toMatchObject({ error: 'proposal_not_found' });
    expect(answers.find((answer) => answer.status === 200)?.body).toMatchObject({ proposal: { proposalId, actions: [{ outcome: 'done' }] } });
    expect(await appointmentsOf(token)).toHaveLength(1);
    expect((await startAgain(token)).status).toBe(204);
  });

  it("Anthropic's spending limit is met after the change was made: the booking stays, the answer is 503, and continue gets the closing words without booking again", async () => {
    const proposalId = await propose('fake: book me a slot when the money runs out');
    const res = await confirm(token, proposalId);
    expect(res).toEqual({ status: 503, body: { error: 'assistant_budget_reached', message: expect.any(String) } });

    // The change was made and saved before Claude was asked: two appointments, and the proposal done.
    expect(await appointmentsOf(token)).toHaveLength(2);
    expect((await conversation(token)).body).toMatchObject({ status: 'working', proposal: { proposalId, actions: [{ outcome: 'done', error: null }] } });
    expect(await confirm(token, proposalId)).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });

    const next = await goOn(token);
    expect(next.status).toBe(200);
    expect(next.body).toMatchObject({ status: 'idle', proposal: { proposalId, actions: [{ outcome: 'done' }] } });
    const messages = next.body?.messages as { from: string; text: string }[];
    expect(JSON.parse(messages[0]?.text ?? '')).toMatchObject({ outcome: 'done', appointment: { date: day, start: '06:00' } });
    expect(await appointmentsOf(token)).toHaveLength(2);
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

    // `continue` is the way on. The trouble has not passed: the same 503, and the step still waits.
    expect(await goOn(token)).toEqual({ status: 503, body: { error: code, message: expect.any(String) } });
    expect((await conversation(token)).body).toMatchObject({ status: 'working', messages: [{ seq: 1, from: 'person', text }] });

    // Giving the step up is the other way out.
    expect((await startAgain(token)).status).toBe(204);
  });

  it('an outage in the middle of an exchange passes: continue fails once, then carries on from where the exchange was', async () => {
    const text = 'fake: an outage after the read';
    // The first step goes well: Claude asks for the settings, and they are read.
    const first = await say(token, text);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'working', activity: "Looking at the calendar's settings…" });

    // The second step meets the outage. Nothing is lost: the read and its result are kept.
    expect(await goOn(token)).toMatchObject({ status: 503, body: { error: 'assistant_unavailable' } });
    expect((await conversation(token)).body).toMatchObject({ status: 'working', activity: "Looking at the calendar's settings…" });

    // The same call again, once Anthropic answers: the exchange ends with what the read gave.
    const third = await goOn(token);
    expect(third.status).toBe(200);
    expect(third.body).toMatchObject({ status: 'idle', activity: null });
    const messages = third.body?.messages as { seq: number; from: string; text: string }[];
    expect(messages.map((message) => [message.seq, message.from])).toEqual([[5, 'assistant']]);
    expect(JSON.parse(messages[0]?.text ?? '')).toMatchObject({ timeZone: expect.any(String), cancellationNoticeHours: expect.any(Number) });

    // The settings were read once: the step that failed did not run the read again.
    const roles = (await storedEntries(token)).map((entry) => entry.role);
    expect(roles).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    expect((await startAgain(token)).status).toBe(204);
  });

  it('answers again right after: the local stack does not remember a spending limit', async () => {
    const res = await say(token, HELLO);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', messages: [{ from: 'person' }, { from: 'assistant', text: HELLO_ANSWER }] });
  });

  it('counted every message that was saved, answered or not, and no continue', async () => {
    // Two that got no answer, the one of the outage that passed, and the hello: four.
    expect((await conversation(token)).body?.remainingToday).toBe(LIMIT - 4);
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
    ['POST', '/assistant/continue', undefined],
    ['POST', `/assistant/proposals/${NO_PROPOSAL}/confirm`, undefined],
    ['POST', `/assistant/proposals/${NO_PROPOSAL}/decline`, undefined],
  ])('%s %s without a token is 401 (API Gateway answers)', async (method, path, body) => {
    const res = await api(method, path, undefined, body);
    expect(res.status).toBe(401);
  });

  it.each([
    ['GET', '/assistant/conversation', undefined],
    ['DELETE', '/assistant/conversation', undefined],
    ['POST', '/assistant/messages', { text: HELLO }],
    ['POST', '/assistant/continue', undefined],
    ['POST', `/assistant/proposals/${NO_PROPOSAL}/confirm`, undefined],
    ['POST', `/assistant/proposals/${NO_PROPOSAL}/decline`, undefined],
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
