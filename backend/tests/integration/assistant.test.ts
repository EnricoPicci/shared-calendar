import { addDays, ASSISTANT_LIMITS, assistantTexts, localDateOf, localTimeOf, weekdayOf } from '@shared-calendar/shared';
import {
  api,
  assistantStepCost,
  createUserInNoGroup,
  forgetDailyUse,
  localDailyMessageLimit,
  queryAssistantPartition,
  removeUserIfPresent,
  reportAssistantCosts,
  setStoredPromptVersion,
  signIn,
  storedEntries,
  subOf,
  weighAssistant,
  type AssistantStepCost,
} from './setup';

// The assistant's journeys (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.2), end to end through
// sam local, with the fake Claude of the Docker stack answering for Anthropic
// (docs/ARCHITECTURE.md section 8). What the fake answers to each sentence sent here is
// fake-claude/answers.json, beside this file.
//
// Each block plays its own throw-away User, created through POST /users. A new account has a new
// `sub`, so it starts with no conversation and with all of today's messages. The file writes the
// assistant table through the API only, with two exceptions. The Administrator's count of the day
// (forgetDailyUse): the six blocks that talk as the seeded Administrator, the same account at
// every run, each start its count again and send one or two messages. And the mark of the
// instructions on one stored conversation (setStoredPromptVersion), in the block that shows what
// a deployment with other instructions does to a conversation in progress.
//
// The calendar table is never emptied here, and nothing another file left in it is relied on.
// Each block that needs the calendar creates what it uses through the API, as the Administrator:
// an extra window or a weekly pattern on a day of its own (12 to 28 days after today), under a
// type name of its own and in hours no other journey opens; the block that fills a conversation
// opens the first four hours of every day of a month, which no other block uses. It removes them and the type at the
// end and, should an interrupted run have left them, before it starts; the appointments it booked
// are cancelled first, so what stays in the table is those cancelled appointments and their
// events, which keep no slot busy. Before any block starts, the file removes what an interrupted
// run of any of them left, today or on a day still to come.
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

// The first Saturday on or after the date `days` after today's: the date the fake's answer file
// names as {{saturday+N}}. The journeys that change the hours of a whole day run on a Saturday,
// where the calendar's journeys leave nothing: on the working days they leave weekly patterns, and
// appointments in them. A calendar seeded by hand for a look at the pages may hold hours on a
// Saturday too: the journeys are run on a stack started afresh, or after the calendar's own.
async function saturdayOfJourney(days: number): Promise<string> {
  let day = await dayOfJourney(days);
  while (weekdayOf(day) !== 6) day = addDays(day, 1);
  return day;
}

type JourneyWindow = { start: string; end: string; typeName: string; source?: string; sourceId?: string };
type JourneyDay = { date: string; hasOverride?: boolean; windows: JourneyWindow[]; slots: { start: string; typeId: string }[] };
type Booked = { appointmentId: string; typeName: string; start: string; username: string; status: string; note: string | null; createdBy: { username: string; role: string } };

// The type names of the journeys that use the calendar, one per block.
const JOURNEY_TYPES = [
  'assistant journey',
  'assistant booking journey',
  'assistant declining journey',
  'assistant trouble journey',
  'assistant note journey',
  'assistant moving journey',
  'assistant cancelling journey',
  'assistant booking for a user journey',
  'assistant blocking journey',
  'assistant blocked journey',
  'assistant pattern journey',
  'assistant filling journey',
];

// Removes what the journeys made in the calendar under one of their type names, when it is there:
// the appointments booked under that type are cancelled, then the hours of its own of a day that
// hold the type, the weekly patterns of the type, its extra windows and the type are deleted. It
// looks at every day a journey can have used and that has not passed, today to 28 days ahead, so
// that what a run interrupted on an earlier date left is removed too.
async function removeFromCalendar(typeName: string): Promise<void> {
  const from = await dayOfJourney(0);
  const to = await dayOfJourney(28);
  const booked = await api('GET', `/calendar/appointments?from=${from}&to=${to}`, adminToken);
  expect(booked.status).toBe(200);
  for (const appointment of (booked.body?.appointments as Booked[]).filter((a) => a.typeName === typeName)) {
    expect((await api('POST', `/calendar/appointments/${appointment.appointmentId}/cancel`, adminToken, {})).status).toBe(200);
  }
  const view = await api('GET', `/calendar?from=${from}&to=${to}`, adminToken);
  expect(view.status).toBe(200);
  const days = view.body?.days as JourneyDay[];
  for (const day of days.filter((d) => d.windows.some((w) => w.typeName === typeName && w.source === 'override'))) {
    expect((await api('DELETE', `/calendar/overrides/${day.date}`, adminToken)).status).toBe(204);
  }
  const types = (await api('GET', '/calendar/types', adminToken)).body?.types as { typeId: string; name: string }[];
  const patterns = (await api('GET', '/calendar/patterns', adminToken)).body?.patterns as { patternId: string; typeId: string }[];
  for (const pattern of patterns.filter((p) => types.some((t) => t.name === typeName && t.typeId === p.typeId))) {
    expect((await api('DELETE', `/calendar/patterns/${pattern.patternId}`, adminToken)).status).toBe(204);
  }
  for (const window of days.flatMap((d) => d.windows).filter((w) => w.typeName === typeName && w.source === 'one_off')) {
    expect((await api('DELETE', `/calendar/windows/${window.sourceId}`, adminToken)).status).toBe(204);
  }
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

// Opens the journey's hours on its day alone with a weekly pattern, under a new type of the
// journey's name: a pattern of that day's weekday whose first and last valid day are that day.
async function openPattern(day: string, typeName: string, start: string, end: string): Promise<{ typeId: string; patternId: string }> {
  const type = await api('POST', '/calendar/types', adminToken, { name: typeName });
  expect(type.status).toBe(201);
  const typeId = type.body?.typeId as string;
  const pattern = await api('POST', '/calendar/patterns', adminToken, { weekday: weekdayOf(day), start, end, typeId, validFrom: day, validUntil: day });
  expect(pattern.status).toBe(201);
  return { typeId, patternId: pattern.body?.patternId as string };
}

// One day as the calendar's own route gives it to the Administrator, and its time zone.
async function dayOfCalendar(day: string): Promise<{ zone: string; view: JourneyDay }> {
  const res = await api('GET', `/calendar?from=${day}&to=${day}`, adminToken);
  expect(res.status).toBe(200);
  return { zone: res.body?.timeZone as string, view: (res.body?.days as JourneyDay[])[0]! };
}

// The windows of a day in wall-clock times with the name of their type, as a proposal words them:
// those that are not extra windows, and the extra ones. A window that ends at midnight ends at 24:00.
async function hoursOfDay(day: string): Promise<{ hasOverride: boolean; hours: { start: string; end: string; type: string; source?: string }[]; extras: { start: string; end: string; type: string }[] }> {
  const { zone, view } = await dayOfCalendar(day);
  const local = (w: JourneyWindow) => ({ start: localTimeOf(w.start, zone), end: localDateOf(w.end, zone) === day ? localTimeOf(w.end, zone) : '24:00', type: w.typeName });
  return {
    hasOverride: view.hasOverride === true,
    hours: view.windows.filter((w) => w.source !== 'one_off').map((w) => ({ ...local(w), source: w.source })),
    extras: view.windows.filter((w) => w.source === 'one_off').map(local),
  };
}

// After a journey of the opening hours cleared up: no weekly pattern of its type is left, and its
// day has no hours of its own.
async function expectHoursAsBefore(day: string, typeId: string): Promise<void> {
  const patterns = (await api('GET', '/calendar/patterns', adminToken)).body?.patterns as { typeId: string }[];
  expect(patterns.filter((p) => p.typeId === typeId)).toEqual([]);
  expect((await dayOfCalendar(day)).view.hasOverride).toBe(false);
}

// The requests for a tool Claude made in the person's conversation, as stored, in order.
const storedToolRequests = async (token: string) =>
  (await storedEntries(token))
    .filter((entry) => entry.role === 'assistant' && Array.isArray(entry.content))
    .flatMap((entry) => entry.content as { type: string; name: string; input: unknown }[])
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({ name: block.name, input: block.input }));

// Sends a message and does the steps that only read, until the conversation waits for the person:
// the answer of the last step, and how many steps read.
async function sayAndRead(token: string, text: string): Promise<{ body: Record<string, unknown> | undefined; reads: number }> {
  let res = await say(token, text);
  let reads = 0;
  while (res.status === 200 && res.body?.status === 'working') {
    expect(res.body.proposal).toBeNull();
    reads += 1;
    res = await goOn(token);
  }
  expect(res.status).toBe(200);
  return { body: res.body, reads };
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
  actions: [{ summary: assistantTexts('en').changes.bookAppointment({ date: day, start, end, type, note: null, secondTime: false, username: null }), outcome, error }],
});

// Books, through the calendar's own route and as the person, the slot of the journey's type that
// starts at each of the given places among that day's free slots in order of time (0 is the
// first). The appointment is the person's own, made without the assistant.
async function bookSlots(token: string, day: string, typeId: string, places: number[], note?: string): Promise<Booked[]> {
  const days = (await api('GET', `/calendar?from=${day}&to=${day}`, token)).body?.days as { slots: { start: string; typeId: string }[] }[];
  const slots = days[0]!.slots.filter((slot) => slot.typeId === typeId);
  const booked: Booked[] = [];
  for (const place of places) {
    const res = await api('POST', '/calendar/appointments', token, { start: slots[place]!.start, ...(note !== undefined && { note }) });
    expect(res.status).toBe(201);
    booked.push(res.body as unknown as Booked);
  }
  return booked;
}

// A proposal as the screen gets it, waiting: the question and the two labels are the fixed texts
// of the conversation's language, each summary is the server's own sentence.
const proposalOf = (summaries: string[], outcomes: [string | null, string | null][] = summaries.map(() => [null, null])) => ({
  proposalId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  question: summaries.length === 1 ? 'Make this change?' : `Make these ${summaries.length} changes?`,
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  actions: summaries.map((summary, index) => ({ summary, outcome: outcomes[index]![0], error: outcomes[index]![1] })),
});

// The results of tools Claude was given in the person's conversation, as stored, in order.
const storedToolResults = async (token: string) =>
  (await storedEntries(token))
    .filter((entry) => entry.role === 'user' && Array.isArray(entry.content))
    .flatMap((entry) => entry.content as { type: string; content: string }[])
    .map((block) => JSON.parse(block.content) as Record<string, unknown>);

// A request about an appointment takes two steps before the proposal: Claude asks for the list of
// the day, to learn the appointment's id, then asks for the change.
async function askForChange(token: string, text: string): Promise<Record<string, unknown> | undefined> {
  const first = await say(token, text);
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ status: 'working', activity: 'Looking at the appointments…', proposal: null });
  const second = await goOn(token);
  expect(second.status).toBe(200);
  return second.body;
}

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

// Explained in simple words in docs/journeys/backend/assistant-note.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a note set through the assistant (5.4, 5.5)', () => {
  const TYPE = 'assistant note journey';
  const ASK = 'fake: add a note to my appointment of the note journey';
  // The day the fake asks the list of: {{date+22}} of its answer file. The appointment is at 05:00.
  let day: string;
  let token: string;
  let appointmentId: string;
  let proposalId: string;
  const summary = () =>
    assistantTexts('en').changes.setAppointmentNote({
      appointment: { date: day, start: '05:00', end: '06:00', type: TYPE, username: null },
      note: 'bring the documents',
      previous: 'first note',
    });

  beforeAll(async () => {
    day = await dayOfJourney(22);
    token = await newUser('chat-note');
    await removeFromCalendar(TYPE);
    const { typeId } = await openWindow(day, TYPE, '05:00', '07:00');
    appointmentId = (await bookSlots(token, day, typeId, [0], 'first note'))[0]!.appointmentId;
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-note');
  });

  it('a request for a note: Claude reads the appointments, then asks for the change by the id it read, and the proposal shows the new note and the one it replaces', async () => {
    const body = await askForChange(token, ASK);
    expect(body).toMatchObject({ status: 'awaiting_confirmation', activity: null, proposal: proposalOf([summary()]), remainingToday: LIMIT - 1 });
    expect(summary()).toContain('"bring the documents"');
    expect(summary()).toContain('"first note"');
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
    // Nothing is changed yet.
    expect((await appointmentsOf(token)).map((appointment) => appointment.note)).toEqual(['first note']);
  });

  it('confirm sets it: the proposal is shown as done, and Claude is told the appointment with its new note', async () => {
    const res = await confirm(token, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...proposalOf([summary()], [['done', null]]), proposalId } });
    const messages = res.body?.messages as { from: string; text: string }[];
    expect(messages.map((message) => message.from)).toEqual(['assistant']);
    // The fake answers with the result of the change, word for word: what Claude was given.
    const given = JSON.parse(messages[0]?.text ?? '') as { outcome: string; message: string; appointment: Record<string, unknown> };
    expect(given.outcome).toBe('done');
    expect(given.message).toContain('pressed the confirm button');
    expect(given.appointment).toMatchObject({ id: appointmentId, date: day, start: '05:00', note: 'bring the documents', status: 'booked' });
  });

  it("the calendar's own route gives the note back, on the same appointment", async () => {
    const booked = await appointmentsOf(token);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ appointmentId, note: 'bring the documents', status: 'booked' });
  });

  it('Claude asked for the change with the id of the list and the note, and nothing else', async () => {
    const stored = await storedEntries(token);
    expect(stored.map((entry) => entry.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    expect(stored[2]?.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'list_appointments', input: { from: day, to: day } })]);
    expect(stored[4]?.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'set_appointment_note', input: { appointmentId, note: 'bring the documents' } })]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-move.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('an appointment moved through the assistant (5.4, 5.5)', () => {
  const TYPE = 'assistant moving journey';
  const ASK = 'fake: move my appointment of the moving journey';
  // The day the fake asks the list of and moves within: {{date+23}} of its answer file. The
  // appointment is at 04:00 and the fake asks to move it to 06:00.
  let day: string;
  let token: string;
  let oldId: string;
  let newId: string;
  let proposalId: string;
  const summary = () =>
    assistantTexts('en').changes.changeAppointment({
      appointment: { date: day, start: '04:00', end: '05:00', type: TYPE, username: null },
      to: { date: day, start: '06:00', end: '07:00', type: TYPE, secondTime: false },
    });

  beforeAll(async () => {
    day = await dayOfJourney(23);
    token = await newUser('chat-move');
    await removeFromCalendar(TYPE);
    const { typeId } = await openWindow(day, TYPE, '04:00', '07:00');
    oldId = (await bookSlots(token, day, typeId, [0], 'keep this note'))[0]!.appointmentId;
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-move');
  });

  it('a request to move: the proposal names the old time and the new one, and nothing is moved', async () => {
    const body = await askForChange(token, ASK);
    expect(body).toMatchObject({ status: 'awaiting_confirmation', proposal: proposalOf([summary()]), remainingToday: LIMIT - 1 });
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
    expect((await appointmentsOf(token)).map((appointment) => appointment.appointmentId)).toEqual([oldId]);
  });

  it('confirm moves it: Claude is told the new appointment, with a new id and the note kept, and which one it replaces', async () => {
    const res = await confirm(token, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...proposalOf([summary()], [['done', null]]), proposalId } });
    const messages = res.body?.messages as { from: string; text: string }[];
    const given = JSON.parse(messages[0]?.text ?? '') as { outcome: string; appointment: Record<string, unknown>; replaced: Record<string, unknown> };
    expect(given.outcome).toBe('done');
    expect(given.appointment).toMatchObject({ date: day, start: '06:00', end: '07:00', type: TYPE, note: 'keep this note', status: 'booked' });
    expect(given.replaced).toEqual({ id: oldId, date: day, start: '04:00', end: '05:00', status: 'cancelled' });
    newId = given.appointment.id as string;
    expect(newId).not.toBe(oldId);
  });

  it("the calendar's own route finds the appointment at its new time, and the old one cancelled as changed", async () => {
    const booked = await appointmentsOf(token);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ appointmentId: newId, typeName: TYPE, status: 'booked', note: 'keep this note' });

    const all = (await api('GET', `/calendar/appointments?from=${day}&to=${day}&status=all`, token)).body?.appointments as (Booked & { cancelReason?: string })[];
    expect(all.map((appointment) => [appointment.appointmentId, appointment.status, appointment.cancelReason ?? null])).toEqual([
      [oldId, 'cancelled', 'changed'],
      [newId, 'booked', null],
    ]);
  });

  it('Claude asked for the move with the id of the list, a day and a time, and nothing else', async () => {
    const stored = await storedEntries(token);
    expect(stored[4]?.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'change_appointment', input: { appointmentId: oldId, date: day, time: '06:00' } })]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-cancel-both.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('two cancellations in one proposal (5.4, 5.5 rule 4)', () => {
  const TYPE = 'assistant cancelling journey';
  const ASK = 'fake: cancel both my appointments of the cancelling journey';
  // The day the fake asks the list of: {{date+24}} of its answer file. The two appointments are at
  // 04:00 and 06:00.
  let day: string;
  let token: string;
  let early: Booked;
  let late: Booked;
  let proposalId: string;
  const summaries = () =>
    [
      ['04:00', '05:00'],
      ['06:00', '07:00'],
    ].map(([start, end]) => assistantTexts('en').changes.cancelAppointment({ date: day, start: start!, end: end!, type: TYPE, username: null }));

  beforeAll(async () => {
    day = await dayOfJourney(24);
    token = await newUser('chat-cancel');
    await removeFromCalendar(TYPE);
    const { typeId } = await openWindow(day, TYPE, '04:00', '07:00');
    [early, late] = (await bookSlots(token, day, typeId, [0, 2])) as [Booked, Booked];
  });

  afterAll(async () => {
    await removeFromCalendar(TYPE);
    await removeUserIfPresent('chat-cancel');
  });

  it('"cancel both": Claude asks for two changes in one answer, and one proposal holds both, each in its own sentence', async () => {
    const body = await askForChange(token, ASK);
    expect(body).toMatchObject({ status: 'awaiting_confirmation', proposal: proposalOf(summaries()), remainingToday: LIMIT - 1 });
    expect((body?.proposal as { question: string }).question).toBe('Make these 2 changes?');
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
    expect(await appointmentsOf(token)).toHaveLength(2);

    // One answer of Claude with the two requests, the ids those of the list it was given.
    const stored = await storedEntries(token);
    expect(stored[4]?.content).toEqual([
      expect.objectContaining({ type: 'tool_use', name: 'cancel_appointment', input: { appointmentId: early.appointmentId } }),
      expect.objectContaining({ type: 'tool_use', name: 'cancel_appointment', input: { appointmentId: late.appointmentId } }),
    ]);
  });

  it('confirmed while the first is inside the notice for cancelling: the calendar refuses that one and cancels the other, and each line of the proposal has its own outcome', async () => {
    // The Administrator sets the notice to a number of whole hours that ends between the two
    // appointments: the first, two hours earlier, is inside it, the second is not. The setting
    // is put back whatever happens.
    const before = (await api('GET', '/calendar/settings', adminToken)).body as Record<string, unknown>;
    const settings = {
      cancellationNoticeHours: before.cancellationNoticeHours,
      minBookingNoticeHours: before.minBookingNoticeHours,
      bookingHorizonDays: before.bookingHorizonDays,
      maxFutureAppointmentsPerUser: before.maxFutureAppointmentsPerUser,
    };
    const hoursToTheFirst = (Date.parse(early.start) - Date.now()) / 3_600_000;
    let res: Awaited<ReturnType<typeof confirm>>;
    try {
      expect((await api('PUT', '/calendar/settings', adminToken, { ...settings, cancellationNoticeHours: Math.floor(hoursToTheFirst) + 1 })).status).toBe(200);
      res = await confirm(token, proposalId);
    } finally {
      expect((await api('PUT', '/calendar/settings', adminToken, settings)).status).toBe(200);
    }

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'idle',
      proposal: {
        ...proposalOf(summaries(), [
          ['refused', 'cancellation_notice_too_short'],
          ['done', null],
        ]),
        proposalId,
      },
    });
    expect((res.body?.messages as { from: string }[]).map((message) => message.from)).toEqual(['assistant']);
  });

  it('Claude is given one result for each change, in the order it asked: the refusal with its code, and the cancelled appointment', async () => {
    const results = await storedToolResults(token);
    expect(results).toHaveLength(3);
    expect(results[1]).toEqual({ error: 'cancellation_notice_too_short', message: expect.any(String) });
    expect(results[2]).toMatchObject({ outcome: 'done', appointment: { id: late.appointmentId, start: '06:00', status: 'cancelled' } });
  });

  it("the calendar's own route shows the first appointment still booked and the second cancelled", async () => {
    const all = (await api('GET', `/calendar/appointments?from=${day}&to=${day}&status=all`, token)).body?.appointments as Booked[];
    expect(all.map((appointment) => [appointment.appointmentId, appointment.status])).toEqual([
      [early.appointmentId, 'booked'],
      [late.appointmentId, 'cancelled'],
    ]);
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

// Explained in simple words in docs/journeys/backend/assistant-admin-tools-refused.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe("a User is not offered the Administrator's tools (3, 7.4)", () => {
  // The fake answers this sentence with a request for update_settings, whoever sends it.
  const ASK = 'fake: change a setting, which a User cannot';
  const FOR_A_USER = 'get_settings, list_types, get_calendar, list_appointments, book_appointment, cancel_appointment, change_appointment, set_appointment_note';
  let token: string;
  let before: Record<string, unknown> | undefined;

  beforeAll(async () => {
    token = await newUser('chat-notadmin');
    before = (await api('GET', '/calendar/settings', adminToken)).body;
  });

  afterAll(async () => {
    await removeUserIfPresent('chat-notadmin');
  });

  it('Claude asks for a tool of the Administrator: no proposal is made, and the exchange goes on', async () => {
    const res = await say(token, ASK);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'working', activity: assistantTexts('en').working, proposal: null, remainingToday: LIMIT - 1 });
  });

  it('Claude was answered as for a tool that does not exist, with the tools of a User and none of the Administrator', async () => {
    const res = await goOn(token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: null });
    // The fake answers with the result it was given, word for word.
    const messages = res.body?.messages as { from: string; text: string }[];
    expect(JSON.parse(messages[0]?.text ?? '')).toEqual({ error: 'unknown_tool', message: `There is no tool with this name. The tools are: ${FOR_A_USER}.` });
    expect(await storedToolResults(token)).toEqual([{ error: 'unknown_tool', message: `There is no tool with this name. The tools are: ${FOR_A_USER}.` }]);
  });

  it('the settings are as they were, and there is nothing to confirm', async () => {
    expect((await api('GET', '/calendar/settings', adminToken)).body).toEqual(before);
    expect((await conversation(token)).body).toMatchObject({ status: 'idle', proposal: null });
    expect(await confirm(token, NO_PROPOSAL)).toMatchObject({ status: 404, body: { error: 'proposal_not_found' } });
  });
});

// Explained in simple words in docs/journeys/backend/assistant-settings.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a setting changed through the assistant (3, 5.4, 5.5)', () => {
  const ASK = 'fake: set the booking horizon of the settings journey';
  // The value the fake asks for. No journey of this file books further ahead than 28 days, and
  // the other files' journeys write the settings they need, so a run that stops before the
  // settings are put back leaves a horizon that refuses none of them.
  const ASKED = 57;
  type Settings = { cancellationNoticeHours: number; minBookingNoticeHours: number; bookingHorizonDays: number; maxFutureAppointmentsPerUser: number | null };
  const writable = (body: Record<string, unknown> | undefined): Settings => {
    const { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser } = body as Settings;
    return { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser };
  };
  const readSettings = async () => writable((await api('GET', '/calendar/settings', adminToken)).body);
  let before: Settings;
  let summary: string;
  let proposalId: string;

  beforeAll(async () => {
    before = await readSettings();
    // A run stopped before the end left the asked value: there would be nothing to change.
    if (before.bookingHorizonDays === ASKED) {
      before = { ...before, bookingHorizonDays: 56 };
      expect((await api('PUT', '/calendar/settings', adminToken, before)).status).toBe(200);
    }
    summary = assistantTexts('en').changes.updateSettings({ changes: [{ setting: 'bookingHorizonDays', from: before.bookingHorizonDays, to: ASKED }] });
    await forgetDailyUse(subOf(adminToken));
    expect((await startAgain(adminToken)).status).toBe(204);
  });

  afterAll(async () => {
    // Whatever happened above, the settings go back to what they were.
    expect((await api('PUT', '/calendar/settings', adminToken, before)).status).toBe(200);
    await startAgain(adminToken);
  });

  it('a request to change a setting: the proposal shows that setting as it is and as it would become, and nothing is changed', async () => {
    const res = await say(adminToken, ASK);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ language: 'en', status: 'awaiting_confirmation', activity: null, proposal: proposalOf([summary]), remainingToday: LIMIT - 1 });
    expect(summary).toMatch(/^Change the settings\. Booking horizon: from \d+ days? to 57 days\.$/);
    proposalId = (res.body?.proposal as { proposalId: string }).proposalId;
    expect(await readSettings()).toEqual(before);
  });

  it('confirm changes it: the proposal is shown as done, and Claude is told the settings as saved', async () => {
    const res = await confirm(adminToken, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...proposalOf([summary], [['done', null]]), proposalId } });
    const messages = res.body?.messages as { from: string; text: string }[];
    const given = JSON.parse(messages[0]?.text ?? '') as { outcome: string; settings: Record<string, unknown> };
    expect(given.outcome).toBe('done');
    expect(given.settings).toEqual({ timeZone: expect.any(String), ...before, bookingHorizonDays: ASKED });
  });

  it("the calendar's own route gives the new value back, the other settings as they were, changed by the Administrator", async () => {
    const read = (await api('GET', '/calendar/settings', adminToken)).body;
    expect(writable(read)).toEqual({ ...before, bookingHorizonDays: ASKED });
    expect(read?.updatedBy).toEqual({ username: 'admin', role: 'admin' });
  });

  it('Claude asked for the one setting, and nothing else', async () => {
    const stored = await storedEntries(adminToken);
    expect(stored.map((entry) => entry.role)).toEqual(['user', 'system', 'assistant', 'user', 'assistant']);
    expect(stored[2]?.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'update_settings', input: { bookingHorizonDays: ASKED } })]);
  });

  it("put back through the calendar's own route, the settings are as before the journey", async () => {
    expect((await api('PUT', '/calendar/settings', adminToken, before)).status).toBe(200);
    expect(await readSettings()).toEqual(before);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-booking-for-user.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the Administrator books for a User through the assistant (3, 5.4, 5.5)', () => {
  const TYPE = 'assistant booking for a user journey';
  const ASK = 'fake: book the slot of the journey for its User';
  // The User the fake asks to book for, by the username its answer file holds.
  const USER = 'chat-booked';
  // The day the fake asks to book on: {{date+21}} of its answer file, at 05:00.
  let day: string;
  let userToken: string;
  let summary: string;
  let proposalId: string;
  let appointmentId: string;

  beforeAll(async () => {
    day = await dayOfJourney(21);
    userToken = await newUser(USER);
    await removeFromCalendar(TYPE);
    await openWindow(day, TYPE, '05:00', '07:00');
    summary = assistantTexts('en').changes.bookAppointment({ date: day, start: '05:00', end: '06:00', type: TYPE, note: null, secondTime: false, username: USER });
    await forgetDailyUse(subOf(adminToken));
    expect((await startAgain(adminToken)).status).toBe(204);
  });

  afterAll(async () => {
    await startAgain(adminToken);
    await removeFromCalendar(TYPE);
    await removeUserIfPresent(USER);
  });

  it('a request to book for a User: the proposal names the person, and nothing is booked', async () => {
    const res = await say(adminToken, ASK);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'awaiting_confirmation', activity: null, proposal: proposalOf([summary]), remainingToday: LIMIT - 1 });
    expect(summary).toContain(`Book an appointment for ${USER} on `);
    proposalId = (res.body?.proposal as { proposalId: string }).proposalId;
    expect(await appointmentsOf(userToken)).toEqual([]);
  });

  it('confirm books it: the proposal is shown as done, and Claude is told the appointment and whose it is', async () => {
    const res = await confirm(adminToken, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...proposalOf([summary], [['done', null]]), proposalId } });
    const messages = res.body?.messages as { from: string; text: string }[];
    const given = JSON.parse(messages[0]?.text ?? '') as { outcome: string; appointment: Record<string, unknown> };
    expect(given.outcome).toBe('done');
    expect(given.appointment).toMatchObject({ date: day, start: '05:00', end: '06:00', type: TYPE, username: USER, note: null, status: 'booked' });
    appointmentId = given.appointment.id as string;
  });

  it("the User finds the appointment in their own list, through the calendar's own route, booked by the Administrator", async () => {
    const booked = await appointmentsOf(userToken);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ appointmentId, typeName: TYPE, username: USER, status: 'booked', note: null, createdBy: { username: 'admin', role: 'admin' } });
  });

  it('Claude asked for the booking with the username, a day and a time, and nothing else', async () => {
    const stored = await storedEntries(adminToken);
    expect(stored[2]?.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'book_appointment', input: { username: USER, date: day, time: '05:00' } })]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-blocking.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('time blocked through the assistant (3, 5.4, 5.5)', () => {
  const TYPE = 'assistant blocking journey';
  const ASK = 'fake: block an hour of the day of the blocking journey';
  const ASK_FREE = 'fake: what is free on the day of the blocking journey?';
  // What the fake asks to leave of the day: its answer file's hours around 05:00 to 06:00.
  const LEFT = [
    { start: '04:00', end: '05:00', type: TYPE },
    { start: '06:00', end: '07:00', type: TYPE },
  ];
  // The day the fake asks to block on: {{saturday+12}} of its answer file.
  let day: string;
  let typeId: string;
  let summary: string;
  let proposalId: string;

  beforeAll(async () => {
    day = await saturdayOfJourney(12);
    await removeFromCalendar(TYPE);
    ({ typeId } = await openPattern(day, TYPE, '04:00', '07:00'));
    // The day as it is: the journey's three hours, with whatever else the local calendar holds on it.
    const { hasOverride, hours, extras } = await hoursOfDay(day);
    expect(hours).toContainEqual({ start: '04:00', end: '07:00', type: TYPE, source: 'pattern' });
    const now = { from: hasOverride ? ('own' as const) : ('patterns' as const), windows: hours.map(({ start, end, type }) => ({ start, end, type })) };
    summary = assistantTexts('en').changes.setDateOverride({ date: day, now, then: { from: 'own', windows: LEFT }, extras });
    await forgetDailyUse(subOf(adminToken));
    expect((await startAgain(adminToken)).status).toBe(204);
  });

  afterAll(async () => {
    await startAgain(adminToken);
    await removeFromCalendar(TYPE);
    await expectHoursAsBefore(day, typeId);
  });

  it('a request to block an hour: Claude reads the day and the types, then asks for the hours that are left, and the proposal shows the day as it is and as it would become', async () => {
    const { body, reads } = await sayAndRead(adminToken, ASK);
    expect(reads).toBe(2);
    expect(body).toMatchObject({ status: 'awaiting_confirmation', activity: null, proposal: proposalOf([summary]), remainingToday: LIMIT - 1 });
    expect(summary).toContain('for this day only. As it is now (');
    expect(summary).toContain(`As it would become: 04:00–05:00 (${TYPE}), 06:00–07:00 (${TYPE}).`);
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
    // Nothing is changed yet: the day has its three hours from the pattern.
    expect((await hoursOfDay(day)).hours).toContainEqual({ start: '04:00', end: '07:00', type: TYPE, source: 'pattern' });
  });

  it("confirm blocks it: the proposal is shown as done, and Claude is told the day's own hours as saved", async () => {
    const res = await confirm(adminToken, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...proposalOf([summary], [['done', null]]), proposalId } });
    const messages = res.body?.messages as { from: string; text: string }[];
    expect(JSON.parse(messages[0]?.text ?? '')).toMatchObject({
      outcome: 'done',
      date: day,
      hoursOfItsOwn: [
        { start: '04:00', end: '05:00' },
        { start: '06:00', end: '07:00' },
      ],
    });
  });

  it("the calendar's own route shows the day with hours of its own, and the hour from 05:00 is no longer a free slot", async () => {
    const { hasOverride, hours } = await hoursOfDay(day);
    expect(hasOverride).toBe(true);
    expect(hours).toEqual(LEFT.map((window) => ({ ...window, source: 'override' })));
    const { zone, view } = await dayOfCalendar(day);
    expect(view.slots.filter((slot) => slot.typeId === typeId).map((slot) => localTimeOf(slot.start, zone))).toEqual(['04:00', '06:00']);
  });

  it('asked what is free that day, Claude reads it again and is given the two hours left, each from the hours of the day itself', async () => {
    const { body, reads } = await sayAndRead(adminToken, ASK_FREE);
    expect(reads).toBe(1);
    expect(body).toMatchObject({ status: 'idle', proposal: null, remainingToday: LIMIT - 2 });
    // The fake answers with the result it was given, word for word.
    const messages = body?.messages as { from: string; text: string }[];
    const given = JSON.parse(messages.at(-1)?.text ?? '') as { days: Record<string, unknown>[] };
    expect(given.days).toEqual([{ date: day, weekday: expect.any(String), hasOverride: true, windows: LEFT.map((window) => ({ ...window, typeId, source: 'override' })), freeSlots: ['04:00', '06:00'], appointments: [] }]);
  });

  it('Claude asked for the day, the types and the hours of the day with the id of the type it read in the list, then for the day again, and nothing else', async () => {
    const windows = LEFT.map(({ start, end }) => ({ start, end, typeId }));
    expect(await storedToolRequests(adminToken)).toEqual([
      { name: 'get_calendar', input: { from: day, to: day } },
      { name: 'list_types', input: {} },
      { name: 'set_date_override', input: { date: day, windows } },
      { name: 'get_calendar', input: { from: day, to: day } },
    ]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-blocking-refused.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a block over an appointment is refused by the calendar (3, 5.4, 8.3)', () => {
  const TYPE = 'assistant blocked journey';
  const ASK = 'fake: block an hour that somebody booked';
  const USER = 'chat-in-the-way';
  // The day the fake asks to block on: {{saturday+19}} of its answer file, from 05:00 to 06:00.
  let day: string;
  let typeId: string;
  let userToken: string;
  let appointmentId: string;
  let summary: string;
  let proposalId: string;

  beforeAll(async () => {
    day = await saturdayOfJourney(19);
    userToken = await newUser(USER);
    await removeFromCalendar(TYPE);
    ({ typeId } = await openPattern(day, TYPE, '04:00', '07:00'));
    // The User books the hour from 05:00, the second free slot of the journey's type.
    appointmentId = (await bookSlots(userToken, day, typeId, [1]))[0]!.appointmentId;
    const { hasOverride, hours, extras } = await hoursOfDay(day);
    const now = { from: hasOverride ? ('own' as const) : ('patterns' as const), windows: hours.map(({ start, end, type }) => ({ start, end, type })) };
    const then = [
      { start: '04:00', end: '05:00', type: TYPE },
      { start: '06:00', end: '07:00', type: TYPE },
    ];
    summary = assistantTexts('en').changes.setDateOverride({ date: day, now, then: { from: 'own', windows: then }, extras });
    await forgetDailyUse(subOf(adminToken));
    expect((await startAgain(adminToken)).status).toBe(204);
  });

  afterAll(async () => {
    await startAgain(adminToken);
    await removeFromCalendar(TYPE);
    await expectHoursAsBefore(day, typeId);
    await removeUserIfPresent(USER);
  });

  it('the block is proposed all the same: the server looks for no appointment before the confirmation', async () => {
    const { body, reads } = await sayAndRead(adminToken, ASK);
    expect(reads).toBe(2);
    expect(body).toMatchObject({ status: 'awaiting_confirmation', proposal: proposalOf([summary]), remainingToday: LIMIT - 1 });
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
  });

  it('confirm: the calendar refuses, the proposal is shown as refused with the code, and Claude is told which appointment is in the way, whose it is and when', async () => {
    const res = await confirm(adminToken, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { ...proposalOf([summary], [['refused', 'availability_conflict']]), proposalId } });
    // The fake answers with the result it was given, word for word.
    const messages = res.body?.messages as { from: string; text: string }[];
    expect(JSON.parse(messages[0]?.text ?? '')).toEqual({
      error: 'availability_conflict',
      message: '1 appointment would fall outside the availability',
      conflicts: [{ id: appointmentId, username: USER, date: day, start: '05:00', end: '06:00' }],
    });
  });

  it("the calendar's own route shows the day as it was, from its pattern, and the appointment still booked", async () => {
    const { hasOverride, hours } = await hoursOfDay(day);
    expect(hasOverride).toBe(false);
    expect(hours).toContainEqual({ start: '04:00', end: '07:00', type: TYPE, source: 'pattern' });
    expect(await appointmentsOf(userToken)).toMatchObject([{ appointmentId, status: 'booked' }]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-pattern.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a weekly pattern created and deleted through the assistant (3, 5.4, 5.5)', () => {
  const TYPE = 'assistant pattern journey';
  const ASK = 'fake: open the weekly pattern of the pattern journey';
  const ASK_DELETE = 'fake: delete the weekly pattern of the pattern journey';
  // What the fake asks for: every Sunday from 04:00 to 06:00, valid from {{date+12}} to
  // {{date+18}} of its answer file, seven days that hold one Sunday, a weekday on which the calendar's journeys leave no hours of a day's own.
  let from: string;
  let until: string;
  let sunday: string;
  let typeId: string;
  let facts: { weekday: number; start: string; end: string; type: string; validFrom: string; validUntil: string };
  let proposalId: string;
  let patternId: string;
  const patternsOfJourney = async () => ((await api('GET', '/calendar/patterns', adminToken)).body?.patterns as { patternId: string; typeId: string }[]).filter((p) => p.typeId === typeId);

  beforeAll(async () => {
    from = await dayOfJourney(12);
    until = await dayOfJourney(18);
    sunday = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(from, n)).find((date) => weekdayOf(date) === 7)!;
    await removeFromCalendar(TYPE);
    const type = await api('POST', '/calendar/types', adminToken, { name: TYPE });
    expect(type.status).toBe(201);
    typeId = type.body?.typeId as string;
    facts = { weekday: 7, start: '04:00', end: '06:00', type: TYPE, validFrom: from, validUntil: until };
    await forgetDailyUse(subOf(adminToken));
    expect((await startAgain(adminToken)).status).toBe(204);
  });

  afterAll(async () => {
    await startAgain(adminToken);
    await removeFromCalendar(TYPE);
    expect((await api('GET', '/calendar/types', adminToken)).body?.types).not.toContainEqual(expect.objectContaining({ name: TYPE }));
  });

  it('a request for a weekly pattern: Claude reads the types, then asks for the pattern, and the proposal names its weekday, hours, type and dates; nothing is created', async () => {
    const { body, reads } = await sayAndRead(adminToken, ASK);
    expect(reads).toBe(1);
    const summary = assistantTexts('en').changes.createPattern(facts);
    expect(summary).toContain(`Create a weekly pattern: every Sunday, from 04:00 to 06:00 (${TYPE}), valid from `);
    expect(body).toMatchObject({ status: 'awaiting_confirmation', proposal: proposalOf([summary]), remainingToday: LIMIT - 1 });
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
    expect(await patternsOfJourney()).toEqual([]);
  });

  it('confirm creates it: Claude is told the pattern with its id, and the calendar opens those hours on the one Sunday between its dates', async () => {
    const res = await confirm(adminToken, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { proposalId, actions: [{ outcome: 'done', error: null }] } });
    const messages = res.body?.messages as { from: string; text: string }[];
    const given = JSON.parse(messages[0]?.text ?? '') as { outcome: string; pattern: Record<string, unknown> };
    expect(given).toMatchObject({ outcome: 'done', pattern: { weekday: 'Sunday', start: '04:00', end: '06:00', validFrom: from, validUntil: until } });
    patternId = given.pattern.id as string;
    expect(await patternsOfJourney()).toMatchObject([{ patternId, weekday: 7, start: '04:00', end: '06:00', validFrom: from, validUntil: until }]);
    expect((await hoursOfDay(sunday)).hours).toContainEqual({ start: '04:00', end: '06:00', type: TYPE, source: 'pattern' });
  });

  it('a request to delete it: Claude reads the patterns, then asks for the deletion by the id it read, and the proposal names the pattern in full', async () => {
    const { body, reads } = await sayAndRead(adminToken, ASK_DELETE);
    expect(reads).toBe(1);
    const summary = assistantTexts('en').changes.deletePattern(facts);
    expect(summary).toContain('Delete the weekly pattern: every Sunday, from 04:00 to 06:00');
    expect(body).toMatchObject({ status: 'awaiting_confirmation', proposal: proposalOf([summary]), remainingToday: LIMIT - 2 });
    proposalId = (body?.proposal as { proposalId: string }).proposalId;
    expect(await patternsOfJourney()).toHaveLength(1);
  });

  it('confirm deletes it: Claude is told so, the pattern is gone and the Sunday has those hours no more', async () => {
    const res = await confirm(adminToken, proposalId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'idle', proposal: { proposalId, actions: [{ outcome: 'done', error: null }] } });
    const messages = res.body?.messages as { from: string; text: string }[];
    expect(JSON.parse(messages.at(-1)?.text ?? '')).toMatchObject({ outcome: 'done', deleted: true });
    expect(await patternsOfJourney()).toEqual([]);
    expect((await hoursOfDay(sunday)).hours.filter((window) => window.type === TYPE)).toEqual([]);
  });

  it('Claude asked for the pattern with a weekday in words and the id of the type, and for the deletion with the id of the pattern, and nothing else', async () => {
    expect(await storedToolRequests(adminToken)).toEqual([
      { name: 'list_types', input: {} },
      { name: 'create_pattern', input: { weekday: 'Sunday', start: '04:00', end: '06:00', typeId, validFrom: from, validUntil: until } },
      { name: 'list_patterns', input: {} },
      { name: 'delete_pattern', input: { patternId } },
    ]);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-full-conversation.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a conversation filled to its bound (4.4, 9)', () => {
  const TYPE = 'assistant filling journey';
  const USER = 'chat-full';
  // The fake answers this sentence, at every step, with six requests for the same 31 days.
  const ASK = 'fake: read the month of the filling journey six times over';
  const FULL = assistantTexts('en').conversationFull;
  // The most one result of a tool weighs: the cut of docs/CONVERSATIONAL_ARCHITECTURE.md section 8.3.
  const RESULT_CAP = 6000;
  let token: string;
  let sub: string;
  let typeId: string;
  let full: Record<string, unknown> | undefined;
  // What each request cost the table, for the file of measurements; nothing of it is asserted.
  const costs: AssistantStepCost[] = [];
  const sizes: number[] = [];

  // Does one request to the assistant and notes what the table read and wrote for it.
  async function measured<T>(step: string, request: () => Promise<T>, transaction = true): Promise<T> {
    const before = await weighAssistant(sub);
    const res = await request();
    const after = await weighAssistant(sub);
    costs.push(assistantStepCost(step, before, after, transaction));
    sizes.push(after.storedBytes);
    return res;
  }

  beforeAll(async () => {
    token = await newUser(USER);
    sub = subOf(token);
    await removeFromCalendar(TYPE);
    // The month the fake asks for, 1 to 31 days after today: two windows a day, 00:00 to 02:00
    // and 02:00 to 04:00, from fourteen weekly patterns valid on those days alone. A month of such
    // days weighs more than one result may, so each read comes back cut.
    const from = await dayOfJourney(1);
    const to = await dayOfJourney(31);
    const type = await api('POST', '/calendar/types', adminToken, { name: TYPE });
    expect(type.status).toBe(201);
    typeId = type.body?.typeId as string;
    for (let weekday = 1; weekday <= 7; weekday++) {
      for (const [start, end] of [['00:00', '02:00'], ['02:00', '04:00']]) {
        expect((await api('POST', '/calendar/patterns', adminToken, { weekday, start, end, typeId, validFrom: from, validUntil: to })).status).toBe(201);
      }
    }
  });

  afterAll(async () => {
    reportAssistantCosts(costs);
    await removeFromCalendar(TYPE);
    const patterns = (await api('GET', '/calendar/patterns', adminToken)).body?.patterns as { typeId: string }[];
    expect(patterns.filter((p) => p.typeId === typeId)).toEqual([]);
    await removeUserIfPresent(USER);
  });

  it('one message, step after step: the conversation grows with every step until it is full, and the exchange is stopped there with the fixed sentence', async () => {
    let res = await measured('message', () => say(token, ASK));
    let steps = 1;
    while (res.status === 200 && res.body?.status === 'working') {
      expect(res.body.activity).toBe('Looking at the calendar…');
      res = await measured('continue', () => goOn(token));
      steps += 1;
    }
    expect(res.status).toBe(200);
    full = res.body;
    expect(full).toMatchObject({ status: 'idle', activity: null, proposal: null, remainingToday: LIMIT - 1 });
    expect((full?.messages as { from: string; text: string }[]).at(-1)).toMatchObject({ from: 'notice', text: FULL });
    // Stopped for its size, before the message had used all its requests to Claude.
    expect(steps).toBeLessThan(ASSISTANT_LIMITS.modelRequestsPerMessage);

    // Under the bound before the last step, at or over it after, and over by less than one step.
    // A step of five full results stores more than five times the cut: a result is a text kept
    // inside the text of its entry, where each of its quotation marks takes two bytes.
    expect(sizes.at(-2)).toBeLessThan(ASSISTANT_LIMITS.conversationBytes);
    expect(sizes.at(-1)).toBeGreaterThanOrEqual(ASSISTANT_LIMITS.conversationBytes);
    expect(sizes.at(-1)).toBeLessThan(ASSISTANT_LIMITS.conversationBytes + 2 * ASSISTANT_LIMITS.readsPerAnswer * RESULT_CAP);
  });

  it('each answer asked for six reads: five were run, each cut at 6 KB, and the sixth was told to ask again', async () => {
    const entries = (await storedEntries(token)).filter((entry) => entry.role === 'user' && Array.isArray(entry.content));
    expect(entries.length).toBe(sizes.length);
    for (const entry of entries) {
      const results = entry.content as { content: string; is_error?: boolean }[];
      expect(results).toHaveLength(ASSISTANT_LIMITS.readsPerAnswer + 1);
      for (const result of results.slice(0, ASSISTANT_LIMITS.readsPerAnswer)) {
        // As large as a result may be: the month is cut at a whole day, with the line that says so.
        expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(RESULT_CAP);
        expect(Buffer.byteLength(result.content, 'utf8')).toBeGreaterThan(RESULT_CAP - 500);
        expect(JSON.parse(result.content)).toMatchObject({ cut: expect.stringContaining('This result was too long') });
        expect(result.content).toContain(TYPE);
      }
      expect(results.at(-1)?.is_error).toBe(true);
      expect(JSON.parse(results.at(-1)?.content ?? '')).toMatchObject({ error: 'too_many_reads' });
    }
  });

  it('the next message is refused: conversation_full, and nothing is stored or counted for it', async () => {
    const res = await measured('message refused', () => say(token, HELLO));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'conversation_full', message: expect.any(String) });
    expect(sizes.at(-1)).toBe(sizes.at(-2));
    // No step waits either.
    expect(await goOn(token)).toMatchObject({ status: 409, body: { error: 'nothing_to_continue' } });
  });

  it('the full conversation can still be read, whole', async () => {
    const res = await measured('read', () => conversation(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ conversationId: full?.conversationId, status: 'idle', remainingToday: LIMIT - 1 });
    const messages = res.body?.messages as { seq: number; from: string; text: string }[];
    // Of everything stored the person reads two lines: their message and the fixed sentence.
    expect(messages.map((message) => message.from)).toEqual(['person', 'notice']);
    expect(messages[0]).toMatchObject({ seq: 1, text: ASK });
    expect(messages[1]?.text).toBe(FULL);
  });

  it('"New conversation" ends it, and the next message starts an empty one', async () => {
    expect((await measured('end', () => startAgain(token), false)).status).toBe(204);
    expect((await conversation(token)).body).toEqual(none(LIMIT - 1));

    const res = await measured('message, new conversation', () => say(token, HELLO));
    expect(res.status).toBe(200);
    expect(res.body?.conversationId).not.toBe(full?.conversationId);
    expect(res.body).toMatchObject({ status: 'idle', messages: [{ seq: 1, from: 'person', text: HELLO }, { seq: 3, from: 'assistant', text: HELLO_ANSWER }], remainingToday: LIMIT - 2 });
    expect(sizes.at(-1)).toBeLessThan(5000);
  });
});

// Explained in simple words in docs/journeys/backend/assistant-other-instructions.md.
// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a conversation started under other instructions is over (4.3)', () => {
  const USER = 'chat-mark';
  const ASK = 'fake: read the settings of the mark journey';
  // The fake answers with the last result of a tool that the request holds, or says there is none.
  const ASK_LAST = 'fake: what was the last result you were given?';
  const NO_RESULT = '(no result of a tool in the request)';
  // A mark no deployment works out: sixteen characters, as a real one, but not hexadecimal.
  const OTHER_MARK = 'another-mark-000';
  let token: string;
  let sub: string;
  let oldId: string;
  let mark: string;

  const meta = async () => (await queryAssistantPartition(`CONV#${sub}`)).find((item) => item.SK === 'META');

  beforeAll(async () => {
    token = await newUser(USER);
    sub = subOf(token);
    expect((await startAgain(token)).status).toBe(204);
  });

  afterAll(async () => {
    await removeUserIfPresent(USER);
  });

  it('a conversation holds a read of the settings, and Claude is sent it again with the next message', async () => {
    const read = await sayAndRead(token, ASK);
    expect(read.reads).toBe(1);
    oldId = read.body?.conversationId as string;

    const res = await say(token, ASK_LAST);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ conversationId: oldId, remainingToday: LIMIT - 2 });
    const answer = (res.body?.messages as { from: string; text: string }[]).at(-1);
    expect(JSON.parse(answer?.text ?? '')).toMatchObject({ timeZone: 'Europe/Rome' });

    mark = (await meta())?.promptVersion as string;
    expect(mark).toMatch(/^[0-9a-f]{16}$/);
  });

  it('once its stored mark is another, the conversation is over: nothing to read, nothing to continue, the count of the day kept', async () => {
    await setStoredPromptVersion(sub, OTHER_MARK);
    expect((await conversation(token)).body).toEqual(none(LIMIT - 2));
    expect(await goOn(token)).toMatchObject({ status: 409, body: { error: 'nothing_to_continue' } });
    // Reading changed nothing: the conversation is still stored, under the other mark.
    expect(await meta()).toMatchObject({ conversationId: oldId, promptVersion: OTHER_MARK });
  });

  it('the next message starts a new conversation, and Claude is sent nothing of the old one', async () => {
    const res = await say(token, ASK_LAST);
    expect(res.status).toBe(200);
    expect(res.body?.conversationId).not.toBe(oldId);
    expect(res.body).toMatchObject({
      language: 'en',
      status: 'idle',
      messages: [
        { seq: 1, from: 'person', text: ASK_LAST },
        { seq: 3, from: 'assistant', text: NO_RESULT },
      ],
      remainingToday: LIMIT - 3,
    });
    // The new conversation carries the mark of the instructions in use, and holds its own three entries.
    expect(await meta()).toMatchObject({ conversationId: res.body?.conversationId, promptVersion: mark, messageCount: 1, nextSeq: 4 });
    expect((await storedEntries(token)).map((entry) => entry.role)).toEqual(['user', 'system', 'assistant']);
  });

  it('the old messages stay in the table until they expire, and no route gives them', async () => {
    const items = await queryAssistantPartition(`CONV#${sub}`);
    expect(items.filter((item) => item.SK.startsWith(`MSG#${oldId}#`)).length).toBeGreaterThan(0);
    const read = (await conversation(token)).body;
    expect((read?.messages as unknown[]).length).toBe(2);
  });
});
