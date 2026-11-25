import { ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, type BookingSummary } from '@shared-calendar/shared';
import { bookAppointment, bookAppointmentDefinition } from '../../../../src/assistant/tools/bookAppointment';
import { handler as getCalendar } from '../../../../src/handlers/getCalendar';
import { handler as listUsers } from '../../../../src/handlers/listUsers';
import { forClaude, isChange, type ChangeTool, type RouteAnswer } from '../../../../src/assistant/tools/tool';

// The route GET /calendar is replaced by `route`, the function a confirmation is given to call a
// route with: no handler runs and nothing is read. The calendar's zone is Europe/Rome.
const USER = { timeZone: 'Europe/Rome', role: 'user' as const };
const ADMIN = { timeZone: 'Europe/Rome', role: 'admin' as const };
const tool = bookAppointment as ChangeTool<Record<string, unknown>, BookingSummary>;
const route = vi.fn<(handler: unknown, call: unknown) => Promise<RouteAnswer>>();

const TYPE = '01JD00000000000000000TYPE1';
// One day as GET /calendar answers a User: a window of the type "Visit" and its free slots.
const view = (date: string, windowStart: string, windowEnd: string, slotStarts: string[]) => ({
  status: 200,
  body: {
    days: [
      {
        date,
        weekday: 2,
        windows: [{ start: windowStart, end: windowEnd, typeId: TYPE, typeName: 'Visit' }],
        slots: slotStarts.map((start) => ({ start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), typeId: TYPE, capacity: 1, placesLeft: 1 })),
        busy: [],
      },
    ],
    appointments: [] as unknown[],
  },
});
// Tuesday 24 November 2026, open 09:00-12:00 local, 10:00 and 11:00 free.
const TUESDAY = view('2026-11-24', '2026-11-24T08:00:00.000Z', '2026-11-24T11:00:00.000Z', ['2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z']);
const read = (input: Record<string, unknown>) => tool.confirmation.read(input, USER, route);

beforeEach(() => {
  vi.resetAllMocks();
  route.mockResolvedValue(TUESDAY);
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('book_appointment: what Claude is given (3, 8.2)', () => {
  it('is a change, offered to both roles, and holds no handler of the booking route', () => {
    expect(bookAppointmentDefinition).toMatchObject({ name: 'book_appointment', kind: 'change', roles: ['admin', 'user'], reads: 'calendar' });
    expect(isChange(bookAppointment)).toBe(true);
    expect(bookAppointment).not.toHaveProperty('toHandler');
  });

  it("the Administrator's input has a required username, a User's has none: the two schemas", () => {
    const admin = forClaude(bookAppointmentDefinition, 'admin').input_schema;
    expect(Object.keys(admin.properties as object)).toEqual(['username', 'date', 'time', 'occurrence', 'note', 'overbook']);
    expect(admin.required).toEqual(['username', 'date', 'time']);
    expect(admin.additionalProperties).toBe(false);

    const forAdmin = bookAppointmentDefinition.input('admin');
    expect(forAdmin.safeParse({ username: 'alice', date: '2026-11-24', time: '10:00' }).success).toBe(true);
    // The route refuses an Administrator's booking that names nobody, so the schema does too.
    expect(forAdmin.safeParse({ date: '2026-11-24', time: '10:00' }).success).toBe(false);
    expect(forAdmin.safeParse({ username: 'Not A Username', date: '2026-11-24', time: '10:00' }).success).toBe(false);
    expect(bookAppointmentDefinition.input('user').safeParse({ username: 'alice', date: '2026-11-24', time: '10:00' }).success).toBe(false);
  });

  it("overbook is in the Administrator's input only, a boolean, and the Administrator alone is told when to give it", () => {
    const forAdmin = bookAppointmentDefinition.input('admin');
    expect(forAdmin.safeParse({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: true }).success).toBe(true);
    expect(forAdmin.safeParse({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: false }).success).toBe(true);
    expect(forAdmin.safeParse({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: 'true' }).success).toBe(false);
    // A User's request with overbook is refused by the schema, before anything is read.
    expect(bookAppointmentDefinition.input('user').safeParse({ date: '2026-11-24', time: '10:00', overbook: true }).success).toBe(false);
    const property = (forClaude(bookAppointmentDefinition, 'admin').input_schema.properties as Record<string, { type: string; description: string }>).overbook!;
    expect(property.type).toBe('boolean');
    expect(property.description).toContain('never on your own');
    expect(forClaude(bookAppointmentDefinition, 'admin').description).toContain('"overbook": true');
    expect(forClaude(bookAppointmentDefinition, 'user').description).not.toContain('overbook');
  });

  it('only the Administrator is told about booking for a User', () => {
    const forUser = forClaude(bookAppointmentDefinition, 'user').description;
    const forAdmin = forClaude(bookAppointmentDefinition, 'admin').description;
    expect(forUser).toBe(bookAppointmentDefinition.description);
    expect(forUser).not.toContain('username');
    expect(forAdmin).toBe(`${bookAppointmentDefinition.description} ${bookAppointmentDefinition.descriptionForAdmin}`);
    expect(forAdmin).toContain('list_users');
  });

  it('asks for a day and a start time, with an optional note and an optional occurrence: no end, no type, no username', () => {
    const schema = forClaude(bookAppointmentDefinition, 'user').input_schema;
    expect(Object.keys(schema.properties as object)).toEqual(['date', 'time', 'occurrence', 'note']);
    expect(schema.required).toEqual(['date', 'time']);
    expect(schema.additionalProperties).toBe(false);
    expect((schema.properties as Record<string, unknown>).occurrence).toMatchObject({ type: 'string', enum: ['first', 'second'] });
  });

  it('the description says that calling the tool books nothing by itself', () => {
    expect(bookAppointmentDefinition.description).toContain('books nothing by itself');
    expect(bookAppointmentDefinition.description).toContain('confirm');
  });

  it('the description says that several bookings are asked for in one answer', () => {
    expect(bookAppointmentDefinition.description).toContain('call this tool once for each in the same answer');
  });

  it('refuses an end, a type, a username, a time off the grid and a date that is not one', () => {
    const input = bookAppointmentDefinition.input('user');
    expect(input.safeParse({ date: '2026-11-24', time: '10:00' }).success).toBe(true);
    expect(input.safeParse({ date: '2026-11-24', time: '10:00', note: 'x', occurrence: 'second' }).success).toBe(true);
    for (const extra of [{ end: '11:00' }, { typeId: TYPE }, { username: 'bob' }]) {
      expect(input.safeParse({ date: '2026-11-24', time: '10:00', ...extra }).success).toBe(false);
    }
    expect(input.safeParse({ date: '2026-11-24', time: '10:07' }).success).toBe(false);
    expect(input.safeParse({ date: '24/11/2026', time: '10:00' }).success).toBe(false);
    expect(input.safeParse({ date: '2026-11-24' }).success).toBe(false);
    expect(input.safeParse({ date: '2026-11-24', time: '10:00', occurrence: 'third' }).success).toBe(false);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('book_appointment: the facts of the confirmation (5.5 rule 2)', () => {
  it('reads the day through the handler of GET /calendar, and gives what the route will be sent and what the proposal shows', async () => {
    const result = await read({ date: '2026-11-24', time: '10:00' });

    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(getCalendar, { routeKey: 'GET /calendar', path: '/calendar', query: { from: '2026-11-24', to: '2026-11-24' } });
    expect(result).toEqual({
      ok: true,
      call: { routeKey: 'POST /calendar/appointments', path: '/calendar/appointments', body: { start: '2026-11-24T09:00:00.000Z' } },
      // The place it takes, which the exchange counts against the other changes of the answer.
      place: { slot: 'slot 2026-11-24T09:00:00.000Z', left: 1, who: '', overbook: false },
      facts: { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', note: null, secondTime: false, username: null, over: null },
    });
  });

  it('the note goes to the route trimmed, and is shown as it is sent; a note of spaces is no note', async () => {
    expect(await read({ date: '2026-11-24', time: '10:00', note: '  Bring the forms \n' })).toMatchObject({
      call: { body: { start: '2026-11-24T09:00:00.000Z', note: 'Bring the forms' } },
      facts: { note: 'Bring the forms' },
    });
    const empty = await read({ date: '2026-11-24', time: '10:00', note: '   ' });
    expect(empty).toMatchObject({ ok: true, facts: { note: null } });
    expect(empty.ok && empty.call.body).toEqual({ start: '2026-11-24T09:00:00.000Z' });
  });

  it('a note the route would refuse is refused here, and the calendar is not read', async () => {
    expect(await read({ date: '2026-11-24', time: '10:00', note: 'x'.repeat(501) })).toMatchObject({ ok: false, error: 'invalid_note' });
    expect(await read({ date: '2026-11-24', time: '10:00', note: 'a\u0007b' })).toMatchObject({ ok: false, error: 'invalid_note' });
    expect(route).not.toHaveBeenCalled();
  });

  it.each([
    ['a time outside the open hours', '14:00'],
    ['a slot that is not free', '09:00'],
    ['a time on the 5-minute step that is no whole hour, inside the open hours', '10:10'],
  ])('no proposal for %s: Claude is told there is no free slot', async (_what, time) => {
    expect(bookAppointmentDefinition.input('user').safeParse({ date: '2026-11-24', time }).success).toBe(true);
    const result = await read({ date: '2026-11-24', time });
    expect(result).toMatchObject({ ok: false, error: 'no_free_slot' });
    expect(result.ok === false && result.message).toContain('get_calendar');
    // Only the day was read: nothing that changes the calendar was called.
    expect(route.mock.calls.map(([, call]) => (call as { routeKey: string }).routeKey)).toEqual(['GET /calendar']);
  });

  it('no proposal for a full slot the Administrator is given with no place left (D30 of docs/SHARED_CALENDAR_SPEC.md)', async () => {
    const full = structuredClone(TUESDAY);
    full.body.days[0]!.slots[1]!.placesLeft = 0;
    route.mockResolvedValue(full);
    const refused = await read({ date: '2026-11-24', time: '11:00' });
    expect(refused).toMatchObject({ ok: false, error: 'no_free_slot' });
    // The message says the time is full, and when it can be booked all the same.
    expect(refused.ok === false && refused.message).toContain('is full: its 1 place is taken');
    expect(refused.ok === false && refused.message).toContain('"overbook": true');
    expect(await read({ date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: true });
  });

  it('no proposal for a day the calendar does not give, or a slot whose hours are not in the answer', async () => {
    route.mockResolvedValue({ status: 200, body: { days: [] } });
    expect(await read({ date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: false, error: 'no_free_slot' });
    const withoutWindow = structuredClone(TUESDAY);
    withoutWindow.body.days[0]!.windows = [];
    route.mockResolvedValue(withoutWindow);
    expect(await read({ date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: false, error: 'no_free_slot' });
  });

  it('no proposal when the calendar cannot be read: the refusal of the route, or a failure without one', async () => {
    route.mockResolvedValue({ status: 400, body: { error: 'invalid_request', message: 'Invalid input: from' } });
    expect(await read({ date: '2026-11-24', time: '10:00' })).toEqual({ ok: false, error: 'invalid_request', message: 'Invalid input: from' });
    route.mockResolvedValue({ status: 500, body: null });
    expect(await read({ date: '2026-11-24', time: '10:00' })).toEqual({ ok: false, error: 'internal_error', message: 'The calendar could not be read.' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('book_appointment for a User, by the Administrator (5.4, 5.5 rule 2)', () => {
  const USERS = { status: 200, body: { users: [{ username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' }, { username: 'bob', createdAt: '2026-11-02T10:00:00.000Z' }] } };
  const asAdmin = (input: Record<string, unknown>) => tool.confirmation.read(input, ADMIN, route);
  // The users' list for GET /users, the day for GET /calendar.
  const routes = (users: RouteAnswer = USERS) => route.mockImplementation((_handler, call) => Promise.resolve((call as { routeKey: string }).routeKey === 'GET /users' ? users : TUESDAY));

  it('the Administrator asking for 10:10, on the 5-minute step but no whole hour, gets no proposal: a custom time stays in the web pages', async () => {
    routes();
    expect(bookAppointmentDefinition.input('admin').safeParse({ username: 'alice', date: '2026-11-24', time: '10:10' }).success).toBe(true);
    expect(await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:10' })).toMatchObject({ ok: false, error: 'no_free_slot' });
    expect(route.mock.calls.map(([, call]) => (call as { routeKey: string }).routeKey)).toEqual(['GET /users', 'GET /calendar']);
  });

  it('reads the users through the handler of GET /users, then the day, and sends the route the username', async () => {
    routes();
    const result = await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00', note: 'First visit' });

    expect(route.mock.calls).toEqual([
      [listUsers, { routeKey: 'GET /users', path: '/users' }],
      [getCalendar, { routeKey: 'GET /calendar', path: '/calendar', query: { from: '2026-11-24', to: '2026-11-24' } }],
    ]);
    expect(result).toEqual({
      ok: true,
      call: { routeKey: 'POST /calendar/appointments', path: '/calendar/appointments', body: { start: '2026-11-24T09:00:00.000Z', username: 'alice', note: 'First visit' } },
      place: { slot: 'slot 2026-11-24T09:00:00.000Z', left: 1, who: 'alice', overbook: false },
      facts: { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', note: 'First visit', secondTime: false, username: 'alice', over: null },
    });
  });

  it('a username that is not in the list makes no proposal: the code of the route, and the day is not read', async () => {
    routes();
    const result = await asAdmin({ username: 'carol', date: '2026-11-24', time: '10:00' });
    expect(result).toMatchObject({ ok: false, error: 'user_not_found' });
    expect(result.ok === false && result.message).toContain('list_users');
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('no proposal when the users cannot be read: the refusal of the route, or a failure without one', async () => {
    routes({ status: 403, body: { error: 'forbidden', message: 'Admins only' } });
    expect(await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00' })).toEqual({ ok: false, error: 'forbidden', message: 'Admins only' });
    routes({ status: 500, body: null });
    expect(await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00' })).toEqual({ ok: false, error: 'internal_error', message: 'The users could not be read.' });
  });

  it("a User's booking never reads the users", async () => {
    await read({ date: '2026-11-24', time: '10:00' });
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).not.toHaveBeenCalledWith(listUsers, expect.anything());
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('book_appointment: the two nights the clocks change (8.3)', () => {
  // Sunday 25 October 2026 in Europe/Rome: 02:00 comes at 00:00Z and again at 01:00Z.
  const BACK = view('2026-10-25', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z', ['2026-10-24T23:00:00.000Z', '2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z', '2026-10-25T02:00:00.000Z']);

  it('clocks back: a time that comes twice is not guessed, Claude is told to ask which', async () => {
    route.mockResolvedValue(BACK);
    const result = await read({ date: '2026-10-25', time: '02:00' });
    expect(result).toMatchObject({ ok: false, error: 'time_comes_twice' });
    expect(result.ok === false && result.message).toContain('"occurrence"');
    expect(route).not.toHaveBeenCalled();
  });

  it('clocks back: "first" books the earlier instant, "second" the later, and the proposal says which', async () => {
    route.mockResolvedValue(BACK);
    expect(await read({ date: '2026-10-25', time: '02:00', occurrence: 'first' })).toMatchObject({
      call: { body: { start: '2026-10-25T00:00:00.000Z' } },
      facts: { start: '02:00', end: '02:00', secondTime: false },
    });
    expect(await read({ date: '2026-10-25', time: '02:00', occurrence: 'second' })).toMatchObject({
      call: { body: { start: '2026-10-25T01:00:00.000Z' } },
      facts: { start: '02:00', end: '03:00', secondTime: true },
    });
  });

  it('clocks back: a time of that night that comes once takes "first" or nothing, never "second"', async () => {
    route.mockResolvedValue(BACK);
    expect(await read({ date: '2026-10-25', time: '01:00' })).toMatchObject({ ok: true, call: { body: { start: '2026-10-24T23:00:00.000Z' } } });
    expect(await read({ date: '2026-10-25', time: '01:00', occurrence: 'first' })).toMatchObject({ ok: true });
    expect(await read({ date: '2026-10-25', time: '03:00', occurrence: 'second' })).toMatchObject({ ok: false, error: 'time_comes_once' });
  });

  it('on any other day "second" is refused', async () => {
    expect(await read({ date: '2026-11-24', time: '10:00', occurrence: 'second' })).toMatchObject({ ok: false, error: 'time_comes_once' });
    expect(route).not.toHaveBeenCalled();
  });

  it('clocks forward (29 March 2026): a time that does not exist is an error, not moved to another', async () => {
    for (const time of ['02:00', '02:30']) {
      const result = await read({ date: '2026-03-29', time });
      expect(result).toMatchObject({ ok: false, error: 'time_does_not_exist' });
    }
    expect(route).not.toHaveBeenCalled();
  });

  it('clocks forward: the times around the gap are booked as they read', async () => {
    route.mockResolvedValue(view('2026-03-29', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', ['2026-03-29T00:00:00.000Z', '2026-03-29T01:00:00.000Z']));
    expect(await read({ date: '2026-03-29', time: '01:00' })).toMatchObject({ call: { body: { start: '2026-03-29T00:00:00.000Z' } }, facts: { start: '01:00', end: '03:00' } });
    expect(await read({ date: '2026-03-29', time: '03:00' })).toMatchObject({ call: { body: { start: '2026-03-29T01:00:00.000Z' } }, facts: { start: '03:00', end: '04:00' } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('book_appointment: the words of the proposal and the result (5.5 rule 2, 8.3)', () => {
  const FACTS: BookingSummary = { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', note: 'Bring the forms', secondTime: false, username: null, over: null };

  it('the summary is the fixed text of the language, filled with the facts', () => {
    expect(tool.confirmation.summary(ASSISTANT_TEXTS_EN, FACTS)).toBe('Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). Note: "Bring the forms"');
    expect(tool.confirmation.summary(ASSISTANT_TEXTS_IT, FACTS)).toBe('Prenotare un appuntamento per martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit). Nota: «Bring the forms»');
  });

  it('the summary of a booking by the Administrator names the person', () => {
    expect(tool.confirmation.summary(ASSISTANT_TEXTS_EN, { ...FACTS, username: 'alice' })).toBe(
      'Book an appointment for alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). Note: "Bring the forms"',
    );
    expect(tool.confirmation.summary(ASSISTANT_TEXTS_IT, { ...FACTS, username: 'alice' })).toBe(
      'Prenotare per alice un appuntamento per martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit). Nota: «Bring the forms»',
    );
  });

  it('gives Claude the appointment as booked, in local times, with its id', () => {
    const appointment = {
      appointmentId: '01JD0000000000000000APPT01',
      username: 'alice',
      date: '2026-11-24',
      start: '2026-11-24T09:00:00.000Z',
      end: '2026-11-24T10:00:00.000Z',
      typeId: TYPE,
      typeName: 'Visit',
      status: 'booked',
      note: 'Bring the forms',
      cancellableUntil: '2026-11-23T09:00:00.000Z',
    };
    const { fields } = tool.toModel(appointment, USER);
    expect(fields.appointment).toMatchObject({ id: '01JD0000000000000000APPT01', date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md; R-… rules and D…
// decisions those of docs/SHARED_CALENDAR_SPEC.md.
describe('book_appointment and the capacity of a type (8.2, R-BOOK-07, R-BOOK-12, R-BOOK-13)', () => {
  const USERS = { status: 200, body: { users: [{ username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' }, { username: 'bob', createdAt: '2026-11-02T10:00:00.000Z' }] } };
  const asAdmin = (input: Record<string, unknown>) => tool.confirmation.read(input, ADMIN, route);
  // An active appointment of the day, as the Administrator's view gives it.
  const appointment = (id: string, username: string, start: string, end: string, status = 'booked') => ({
    appointmentId: id,
    username,
    date: '2026-11-24',
    start,
    end,
    typeId: TYPE,
    typeName: 'Swimming Pool',
    status,
  });
  // Tuesday's 10:00 (09:00Z) of a type that holds 3, with these appointments and places left.
  const pool = (placesLeft: number, appointments: unknown[]) => {
    const day = structuredClone(TUESDAY);
    day.body.days[0]!.windows[0]!.typeName = 'Swimming Pool';
    for (const slot of day.body.days[0]!.slots) Object.assign(slot, { capacity: 3, placesLeft: 3 });
    day.body.days[0]!.slots[0]!.placesLeft = placesLeft;
    day.body.appointments = appointments;
    return day;
  };
  const THREE = [
    appointment('A1', 'bob', '2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z'),
    appointment('A2', 'carol', '2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z'),
    appointment('A3', 'dan', '2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z'),
  ];
  const routes = (day: RouteAnswer) => route.mockImplementation((_handler, call) => Promise.resolve((call as { routeKey: string }).routeKey === 'GET /users' ? USERS : day));

  it('a full slot is refused without overbook, and proposed with it: the route is sent overbook, the sentence says the people it will hold', async () => {
    routes(pool(0, THREE));
    expect(await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: false, error: 'no_free_slot' });
    const result = await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: true });
    expect(result).toMatchObject({
      ok: true,
      call: { body: { start: '2026-11-24T09:00:00.000Z', username: 'alice', overbook: true } },
      place: { slot: 'slot 2026-11-24T09:00:00.000Z', left: 0, who: 'alice', overbook: true },
      facts: { type: 'Swimming Pool', over: { people: 4, capacity: 3 } },
    });
    expect(result.ok && tool.confirmation.summary(ASSISTANT_TEXTS_EN, result.facts)).toBe(
      'Book an appointment for alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Swimming Pool). Over the capacity: it will hold 4 people, its capacity is 3.',
    );
  });

  it('a time already over its capacity says its true number; cancelled appointments and touching ones are not counted', async () => {
    const more = [
      ...THREE,
      appointment('A4', 'erin', '2026-11-24T09:30:00.000Z', '2026-11-24T10:00:00.000Z'),
      appointment('A5', 'fred', '2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z', 'cancelled'),
      appointment('A6', 'gina', '2026-11-24T10:00:00.000Z', '2026-11-24T11:00:00.000Z'),
    ];
    routes(pool(0, more));
    expect(await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: true })).toMatchObject({ ok: true, facts: { over: { people: 5, capacity: 3 } } });
  });

  it('overbook on a slot with a place left is not an error: it is sent, and the sentence says nothing more', async () => {
    routes(pool(1, THREE.slice(0, 2)));
    const result = await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: true });
    expect(result).toMatchObject({ ok: true, call: { body: { overbook: true } }, place: { left: 1, overbook: true }, facts: { over: null } });
    // overbook false is not sent.
    const plain = await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00', overbook: false });
    expect(plain.ok && plain.call.body).toEqual({ start: '2026-11-24T09:00:00.000Z', username: 'alice' });
  });

  it('user_busy at the proposal: the User the Administrator books for holds an appointment over the time, named by its time and type, overbook or not', async () => {
    routes(pool(2, [appointment('A1', 'alice', '2026-11-24T09:30:00.000Z', '2026-11-24T10:30:00.000Z'), appointment('A2', 'alice', '2026-11-24T09:15:00.000Z', '2026-11-24T09:45:00.000Z')]));
    for (const overbook of [false, true]) {
      const result = await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00', overbook });
      expect(result).toMatchObject({ ok: false, error: 'user_busy' });
      // The earliest of the two is named.
      expect(result.ok === false && result.message).toContain('alice already has an appointment at this time: on 2026-11-24 from 10:15 to 10:45 (Swimming Pool)');
    }
  });

  it('user_busy is not met by an appointment that touches the time, a cancelled one, or another User\'s', async () => {
    routes(
      pool(2, [
        appointment('A1', 'alice', '2026-11-24T08:00:00.000Z', '2026-11-24T09:00:00.000Z'),
        appointment('A2', 'alice', '2026-11-24T10:00:00.000Z', '2026-11-24T11:00:00.000Z'),
        appointment('A3', 'alice', '2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z', 'cancelled'),
        appointment('A4', 'bob', '2026-11-24T09:00:00.000Z', '2026-11-24T10:00:00.000Z'),
      ]),
    );
    expect(await asAdmin({ username: 'alice', date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: true, place: { left: 2 } });
  });

  it("a User's booking of a slot with places left takes one place, as the person asking", async () => {
    route.mockResolvedValue(pool(2, []));
    expect(await read({ date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: true, place: { slot: 'slot 2026-11-24T09:00:00.000Z', left: 2, who: '', overbook: false }, facts: { over: null } });
  });
});
