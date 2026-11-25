import {
  addDays,
  ASSISTANT_LIMITS,
  assistantTexts,
  localDateOf,
  toInstant,
  type AssistantReply,
  type CalendarView,
} from '@shared-calendar/shared';
import { AppointmentsService } from '../../src/services/appointments.service';
import { AssistantService } from '../../src/services/assistant.service';
import type { AssistantCall, AssistantOutcome } from '../../src/services/assistant.types';
import { AvailabilityRulesService } from '../../src/services/availability-rules.service';
import { AvailabilityTypesService } from '../../src/services/availability-types.service';
import { CalendarService } from '../../src/services/calendar.service';
import { CalendarSettingsService } from '../../src/services/calendar-settings.service';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { refuseRealClaude } from './claude';
import { API, newUser, outcome, setPermanentPassword, signedIn, signIn } from './local';

// The assistant's journeys of docs/FRONTEND_SERVICES.md section 14.7: AssistantService against the
// back end's local stack, with the fake Claude of that stack answering for Anthropic
// (docs/ARCHITECTURE.md section 8). Runs only with RUN_INTEGRATION=1, never at the same time as
// the back end's journeys, and refuses to start when the stack is wired to the real Claude.
//
// The fake answers a sentence by its exact text, from
// backend/tests/integration/fake-claude/answers.json. The three sentences sent here are sentences
// of the back end's journeys, and each fixes what this file must prepare: the fake asks for the
// calendar of the 25th day from today, and to book 05:00 on the 26th and on the 27th. The fake
// never looks at who is asking.
//
// Each block plays a throw-away User of its own, created through UsersService. A new account has
// all of today's messages, so the daily limit is never met and nothing here touches the
// `assistant` table but through the routes.
//
// The local calendar is shared, so this file:
// - never resets the `calendar` table and never deletes or changes what it did not create;
// - opens, as the Administrator, one extra window 05:00 to 07:00 on its block's day, under a type
//   of its block's own name (`fe-assistant …`). Those early hours are the ones the back end's
//   assistant journeys open on the same days and remove at their end;
// - removes what a block made before the block starts and after it ends: first the User (deleting
//   a User cancels its future appointments, which would otherwise keep the window from being
//   deleted), then the extra windows of the block's type from today to 28 days ahead, then the
//   type. A run that failed half-way is repeated without a step by hand.
// What stays in the tables is history: the appointment the booking block made, cancelled when its
// User was deleted, with its events; the deleted-user markers; and, in the `assistant` table, the
// conversations and the day's count of accounts that no longer exist.
//
// Secrets: tokens and passwords stay in the stores and in variables; no assertion prints one.

const PREFIX = 'fe-assistant ';
// A well-formed id that names no proposal.
const NO_PROPOSAL = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
// How far ahead a block's day can lie, so that the clean-up finds what an earlier run left.
const DAYS_AHEAD = 28;

let admin: SessionStore;
let today: string;
let zone: string; // the calendar's time zone, from the settings
const stores: SessionStore[] = [];

// Fails the test with the reason when a call did not succeed; returns the success.
function ok<T extends { status: string }>(result: T, what: string): Extract<T, { status: 'success' }> {
  if (result.status !== 'success') throw new Error(`${what}: ${JSON.stringify(result)}`);
  return result as Extract<T, { status: 'success' }>;
}

// One call of the assistant's service: subscribe to its one stream first, then call, then wait for
// the one new outcome, which must say the call it answers.
async function ask(service: AssistantService, call: AssistantCall, trigger: (service: AssistantService) => void): Promise<AssistantOutcome> {
  const answered = await outcome(service.outcome$, () => trigger(service));
  expect(answered.call).toBe(call);
  return answered;
}

// The reply of a call that must succeed.
async function reply(service: AssistantService, call: Exclude<AssistantCall, 'end'>, trigger: (service: AssistantService) => void): Promise<AssistantReply> {
  const answered = await ask(service, call, trigger);
  if (answered.call === 'end' || answered.status !== 'success') throw new Error(`${call}: ${JSON.stringify(answered)}`);
  return answered.reply;
}

// What the screen will do in its logic layer: while a reply says `working`, call `continue` again,
// one request each, at most as many times as one message may take. Returns the last reply, every
// message the steps added and how many times it continued.
async function untilTheExchangeEnds(service: AssistantService, first: AssistantReply): Promise<{ last: AssistantReply; added: AssistantReply['messages']; continues: number }> {
  let last = first;
  const added = [...first.messages];
  let continues = 0;
  while (last.status === 'working') {
    if (continues === ASSISTANT_LIMITS.modelRequestsPerMessage) throw new Error('the exchange did not end within the steps one message may take');
    last = await reply(service, 'continue', (s) => s.continue());
    added.push(...last.messages);
    continues += 1;
  }
  return { last, added, continues };
}

async function removeUser(username: string): Promise<void> {
  const s = new UsersService(API, admin);
  const result = await outcome(s.deleteUserResult$, () => s.deleteUser(username));
  if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${username}: ${result.reason}`);
}

function loadCalendar(store: SessionStore, from: string, to: string) {
  const s = new CalendarService(API, store);
  return outcome(s.calendarResult$, () => s.load(from, to));
}

// Removes the extra windows of the type of that name, from today to DAYS_AHEAD days ahead, then
// the type. Nothing to do when the type does not exist.
async function removeFromCalendar(typeName: string): Promise<void> {
  const types = new AvailabilityTypesService(API, admin);
  const mine = ok(await outcome(types.typesResult$, () => types.load()), 'load types').types.filter((t) => t.name === typeName);
  if (mine.length === 0) return;
  const ids = new Set(mine.map((t) => t.typeId));
  const rules = new AvailabilityRulesService(API, admin);
  const view = ok(await loadCalendar(admin, today, addDays(today, DAYS_AHEAD)), 'load the days of the journeys').calendar;
  for (const window of view.days.flatMap((d) => d.windows).filter((w) => w.source === 'one_off' && ids.has(w.typeId))) {
    ok(await outcome(rules.deleteWindowResult$, () => rules.deleteWindow(window.sourceId as string)), `delete window ${window.sourceId}`);
  }
  for (const type of mine) ok(await outcome(types.removeResult$, () => types.remove(type.typeId)), `remove type ${type.name}`);
}

// Prepares a block: its day, `days` after today; its type and its window 05:00 to 07:00 on that
// day; its User, created anew and signed in. What an earlier run left is removed first.
async function open(username: string, typeName: string, days: number): Promise<{ day: string; typeId: string; user: SessionStore }> {
  await removeUser(username);
  await removeFromCalendar(typeName);
  const day = addDays(today, days);
  const types = new AvailabilityTypesService(API, admin);
  const typeId = ok(await outcome(types.createResult$, () => types.create(typeName)), `create type ${typeName}`).type.typeId;
  const rules = new AvailabilityRulesService(API, admin);
  // Refused with availability_overlap when hours somebody else opened lie there: the sentences of
  // the fake fix the day and the hour, so the block cannot move elsewhere.
  ok(await outcome(rules.createWindowResult$, () => rules.createWindow({ date: day, start: '05:00', end: '07:00', typeId })), `open 05:00 to 07:00 on ${day}`);
  const users = new UsersService(API, admin);
  ok(await outcome(users.createUserResult$, () => users.createUser(newUser(username))), `create ${username}`);
  const signed = await signIn(username, await setPermanentPassword(username));
  ok(signed.result, `${username} signs in`);
  stores.push(signed.store);
  return { day, typeId, user: signed.store };
}

async function close(username: string, typeName: string): Promise<void> {
  await removeUser(username);
  await removeFromCalendar(typeName);
}

// The block's day as the given person's calendar shows it.
async function dayOf(store: SessionStore, day: string): Promise<CalendarView> {
  return ok(await loadCalendar(store, day, day), `load ${day}`).calendar;
}

// The person's own booked appointments that have not ended.
async function upcoming(store: SessionStore) {
  const s = new AppointmentsService(API, store);
  return ok(await outcome(s.appointmentsResult$, () => s.list({ upcoming: 'true' })), 'list the appointments').appointments;
}

// A proposal of one booking as the service passes it on: the question and the two labels are the
// fixed texts of the conversation's language, the summary is the server's own sentence.
const bookingProposal = (day: string, type: string, outcomeOfIt: 'done' | null = null) => ({
  proposalId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  question: 'Make this change?',
  confirmLabel: 'Confirm',
  declineLabel: "Don't",
  actions: [
    {
      summary: assistantTexts('en').changes.bookAppointment({ date: day, start: '05:00', end: '06:00', type, note: null, secondTime: false, username: null }),
      outcome: outcomeOfIt,
      error: null,
    },
  ],
});

// Runs `fn` with a fetch spy and checks that no request left.
async function noRequest<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(globalThis, 'fetch');
  try {
    const result = await fn();
    expect(spy).not.toHaveBeenCalled();
    return result;
  } finally {
    spy.mockRestore();
  }
}

beforeAll(async () => {
  refuseRealClaude(); // before any request
  admin = await signedIn('admin');
  stores.push(admin);
  const settings = new CalendarSettingsService(API, admin);
  zone = ok(await outcome(settings.settingsResult$, () => settings.load()), 'load settings').settings.timeZone;
  // The fake works its dates out from today's date in the calendar's zone, as the server states it.
  today = localDateOf(new Date().toISOString(), zone);
}, 180_000);

afterAll(() => {
  for (const store of stores) store.clear(); // stops the expiry timers
});

// Explained in simple words in docs/journeys/frontend/assistant-reading.md.
describe('a reading driven by continue', () => {
  const USER = 'fe-assistant-read';
  const TYPE = `${PREFIX}reading`;
  const ASK = 'fake: what is open on the day of the journey?';
  let day: string;
  let typeId: string;
  let user: SessionStore;
  let assistant: AssistantService;
  let atFirst: number; // the messages a new account may send today

  beforeAll(async () => {
    ({ day, typeId, user } = await open(USER, TYPE, 25));
    assistant = new AssistantService(API, user);
  }, 180_000);

  afterAll(() => close(USER, TYPE), 180_000);

  it('load, with no conversation yet: an empty reply, with the messages the person may still send today', async () => {
    const empty = await reply(assistant, 'load', (s) => s.load());
    expect(empty).toEqual({ conversationId: null, language: null, status: 'idle', messages: [], activity: null, proposal: null, remainingToday: expect.any(Number) });
    atFirst = empty.remainingToday;
    expect(atFirst).toBeGreaterThan(0);
  });

  it('send: one request, and the reply says working with the line of the read; the service does not continue by itself', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    try {
      const first = await reply(assistant, 'send', (s) => s.send(`  ${ASK}\n`));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(first).toEqual({
        conversationId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
        language: 'en',
        status: 'working',
        // The text was trimmed before it was sent; nothing of the read is shown.
        messages: [{ seq: expect.any(Number), from: 'person', text: ASK, at: expect.any(String) }],
        activity: 'Looking at the calendar…',
        proposal: null,
        remainingToday: atFirst - 1,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('send again while the step waits: assistant_busy, a reason of its own', async () => {
    expect(await ask(assistant, 'send', (s) => s.send('Hello, can you hear me?'))).toMatchObject({ call: 'send', status: 'failure', reason: 'assistant_busy' });
  });

  it('continue, repeated by the caller while the reply says working: one more request ends the exchange, with the answer made from what the calendar gave', async () => {
    const waiting = await reply(assistant, 'load', (s) => s.load());
    expect(waiting).toMatchObject({ status: 'working', activity: 'Looking at the calendar…' });

    const { last, added, continues } = await untilTheExchangeEnds(assistant, { ...waiting, messages: [] });
    expect(continues).toBe(1);
    expect(last).toMatchObject({ status: 'idle', activity: null, proposal: null, remainingToday: atFirst - 1 });
    expect(added.map((m) => m.from)).toEqual(['assistant']);

    // The fake answers with the result of the tool, word for word: what Claude was given. The
    // service passes the text on as written, so it is still the JSON the server wrote.
    const given = JSON.parse(added[0]?.text ?? '') as { days: { date: string; windows: object[]; freeSlots: string[] }[] };
    const days = given.days.filter((d) => d.date === day);
    expect(days).toHaveLength(1);
    // Whatever else that day holds is not looked at.
    expect(days[0]?.windows).toContainEqual({ start: '05:00', end: '07:00', type: TYPE });
    expect(days[0]?.freeSlots).toEqual(expect.arrayContaining(['05:00', '06:00']));
    // Nothing internal reaches a User: no id of the type.
    expect(added[0]?.text).not.toContain(typeId);
  });

  it('load: the whole conversation, the person\'s message and the answer, in order', async () => {
    const whole = await reply(assistant, 'load', (s) => s.load());
    expect(whole).toMatchObject({ status: 'idle', language: 'en', remainingToday: atFirst - 1 });
    expect(whole.messages.map((m) => m.from)).toEqual(['person', 'assistant']);
    expect(whole.messages[0]?.text).toBe(ASK);
    expect(whole.messages[0]?.seq).toBeLessThan(whole.messages[1]?.seq ?? 0);
  });

  it('continue with nothing to continue: nothing_to_continue', async () => {
    expect(await ask(assistant, 'continue', (s) => s.continue())).toMatchObject({ call: 'continue', status: 'failure', reason: 'nothing_to_continue' });
  });

  it('end: the conversation is over, a load gives the empty reply again, and the day\'s count is kept', async () => {
    expect(await ask(assistant, 'end', (s) => s.end())).toEqual({ call: 'end', status: 'success' });
    expect(await reply(assistant, 'load', (s) => s.load())).toEqual({
      conversationId: null,
      language: null,
      status: 'idle',
      messages: [],
      activity: null,
      proposal: null,
      remainingToday: atFirst - 1,
    });
  });
});

// Explained in simple words in docs/journeys/frontend/assistant-booking.md.
describe('a booking confirmed', () => {
  const USER = 'fe-assistant-book';
  const TYPE = `${PREFIX}booking`;
  const ASK = 'fake: book me the slot of the booking journey';
  let day: string;
  let typeId: string;
  let user: SessionStore;
  let assistant: AssistantService;
  let proposalId: string;

  beforeAll(async () => {
    ({ day, typeId, user } = await open(USER, TYPE, 26));
    assistant = new AssistantService(API, user);
  }, 180_000);

  afterAll(() => close(USER, TYPE), 180_000);

  it('send: the reply holds the proposal in the words of the server, and nothing is booked', async () => {
    const asked = await reply(assistant, 'send', (s) => s.send(ASK));
    expect(asked).toMatchObject({ language: 'en', status: 'awaiting_confirmation', activity: null, proposal: bookingProposal(day, TYPE) });
    expect(asked.messages.map((m) => [m.from, m.text])).toEqual([['person', ASK]]);
    proposalId = asked.proposal?.proposalId as string;
    expect(await upcoming(user)).toEqual([]);
  });

  it('confirm and decline with an id that is not one: invalid_request, no request sent', async () => {
    expect(await noRequest(() => ask(assistant, 'confirm', (s) => s.confirm('not-an-id')))).toEqual({
      call: 'confirm',
      status: 'failure',
      reason: 'invalid_request',
      message: 'proposalId: expected a ULID',
    });
    expect(await noRequest(() => ask(assistant, 'decline', (s) => s.decline('not-an-id')))).toMatchObject({ call: 'decline', reason: 'invalid_request' });
  });

  it('confirm with the id of no proposal: proposal_not_found, and the proposal keeps waiting', async () => {
    expect(await ask(assistant, 'confirm', (s) => s.confirm(NO_PROPOSAL))).toMatchObject({ call: 'confirm', status: 'failure', reason: 'proposal_not_found' });
    expect(await reply(assistant, 'load', (s) => s.load())).toMatchObject({ status: 'awaiting_confirmation', proposal: { proposalId } });
    expect(await upcoming(user)).toEqual([]);
  });

  it('confirm: the booking is made, the proposal comes back with its outcome done, and Claude\'s closing words follow', async () => {
    const confirmed = await reply(assistant, 'confirm', (s) => s.confirm(proposalId));
    const { last, added } = await untilTheExchangeEnds(assistant, confirmed);
    expect(last).toMatchObject({ status: 'idle', activity: null, proposal: { ...bookingProposal(day, TYPE, 'done'), proposalId } });
    expect(added.map((m) => m.from)).toEqual(['assistant']);
  });

  it('the calendar\'s own services show the appointment: in the person\'s list and in the day, whose slot at 05:00 is no longer free', async () => {
    const start = toInstant(day, '05:00', zone);
    const booked = await upcoming(user);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({
      start,
      end: toInstant(day, '06:00', zone),
      date: day,
      typeId,
      typeName: TYPE,
      username: USER,
      status: 'booked',
      note: null,
      createdBy: { username: USER, role: 'user' },
    });

    const view = await dayOf(user, day);
    expect(view.appointments.map((a) => a.appointmentId)).toEqual([booked[0]?.appointmentId]);
    const slots = view.days[0]?.slots.filter((s) => s.typeId === typeId).map((s) => s.start);
    expect(slots).toEqual([toInstant(day, '06:00', zone)]);
  });

  it('the same proposal cannot be confirmed or declined again, and nothing more is booked', async () => {
    expect(await ask(assistant, 'confirm', (s) => s.confirm(proposalId))).toMatchObject({ call: 'confirm', status: 'failure', reason: 'proposal_not_found' });
    expect(await ask(assistant, 'decline', (s) => s.decline(proposalId))).toMatchObject({ call: 'decline', status: 'failure', reason: 'proposal_not_found' });
    expect(await upcoming(user)).toHaveLength(1);
  });

  it('load: the settled proposal is still shown, with its outcome', async () => {
    expect(await reply(assistant, 'load', (s) => s.load())).toMatchObject({ status: 'idle', proposal: { proposalId, actions: [{ outcome: 'done', error: null }] } });
  });
});

// Explained in simple words in docs/journeys/frontend/assistant-declined.md.
describe('a proposal declined', () => {
  const USER = 'fe-assistant-decline';
  const TYPE = `${PREFIX}declining`;
  const ASK = 'fake: book me the slot of the declining journey';
  let day: string;
  let user: SessionStore;
  let assistant: AssistantService;
  let proposalId: string;
  let before: CalendarView;
  let left: number; // the messages left today after the one request

  // The day without the instant the view was made at, which differs at every read.
  const withoutItsInstant = (view: CalendarView) => ({ ...view, generatedAt: null });

  beforeAll(async () => {
    ({ day, user } = await open(USER, TYPE, 27));
    assistant = new AssistantService(API, user);
  }, 180_000);

  afterAll(() => close(USER, TYPE), 180_000);

  it('send: a proposal waits, and the day is read as it is before any answer to it', async () => {
    const asked = await reply(assistant, 'send', (s) => s.send(ASK));
    expect(asked).toMatchObject({ status: 'awaiting_confirmation', proposal: bookingProposal(day, TYPE) });
    proposalId = asked.proposal?.proposalId as string;
    left = asked.remainingToday;
    before = await dayOf(user, day);
    expect(before.appointments).toEqual([]);
  });

  it('decline: the fixed notice, no proposal any more, the conversation waits for the person, and it is not a message of the day', async () => {
    const declined = await reply(assistant, 'decline', (s) => s.decline(proposalId));
    expect(declined).toMatchObject({ status: 'idle', activity: null, proposal: null, remainingToday: left });
    expect(declined.messages.map((m) => [m.from, m.text])).toEqual([['notice', 'Nothing was changed.']]);
  });

  it('the calendar is unchanged: the same day, slot for slot, and no appointment of the person', async () => {
    expect(withoutItsInstant(await dayOf(user, day))).toEqual(withoutItsInstant(before));
    expect(await upcoming(user)).toEqual([]);
  });

  it('the declined proposal is gone: it can be neither confirmed nor declined again', async () => {
    expect(await ask(assistant, 'confirm', (s) => s.confirm(proposalId))).toMatchObject({ call: 'confirm', status: 'failure', reason: 'proposal_not_found' });
    expect(await ask(assistant, 'decline', (s) => s.decline(proposalId))).toMatchObject({ call: 'decline', status: 'failure', reason: 'proposal_not_found' });
    expect(await upcoming(user)).toEqual([]);
  });

  it('load: the request and the notice, and nothing to confirm', async () => {
    const whole = await reply(assistant, 'load', (s) => s.load());
    expect(whole).toMatchObject({ status: 'idle', proposal: null, remainingToday: left });
    expect(whole.messages.map((m) => [m.from, m.text])).toEqual([
      ['person', ASK],
      ['notice', 'Nothing was changed.'],
    ]);
  });
});
