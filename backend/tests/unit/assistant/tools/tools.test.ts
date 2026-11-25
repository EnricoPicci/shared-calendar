import type { Appointment, CalendarView } from '@shared-calendar/shared';
import { getCalendar } from '../../../../src/assistant/tools/getCalendar';
import { getSettings } from '../../../../src/assistant/tools/getSettings';
import { DEFINITIONS, TOOLS } from '../../../../src/assistant/tools/list';
import { listAppointments } from '../../../../src/assistant/tools/listAppointments';
import { listTypes } from '../../../../src/assistant/tools/listTypes';
import { appointmentForModel, cappedJson, localDateTime, localEndTime, refusalForModel, RESULT_CAP_BYTES } from '../../../../src/assistant/tools/result';
import { forClaude, offeredTo, toolsForClaude } from '../../../../src/assistant/tools/tool';
import recorded from './recorded/routes.json';

// `recorded/routes.json` holds answers of the local API to the four routes the tools stand for,
// for a User (alice) and for the Administrator, on a week with one type ("Trial visit"), a window
// 09:00-12:00 from Monday 23 to Friday 27 November 2026, two appointments of alice and one of
// another User; and two refusals of the routes. The calendar's zone is Europe/Rome.

const ROME = 'Europe/Rome';
const USER = { timeZone: ROME, role: 'user' as const };
const ADMIN = { timeZone: ROME, role: 'admin' as const };
// The types GET /calendar/types answers, which get_calendar asks after the calendar: one type, of
// capacity 1.
const TYPES = recorded.user.types;

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the list of tools (3, 8.2)', () => {
  it('holds the four reads, the four appointment changes and the mail for both roles, then the two reads and the eleven changes of the Administrator, the definitions in the same order as the tools', () => {
    const FOR_BOTH = ['get_settings', 'list_types', 'get_calendar', 'list_appointments', 'book_appointment', 'cancel_appointment', 'change_appointment', 'set_appointment_note', 'send_calendar_mail'];
    const FOR_ADMIN = [
      'list_users',
      'list_patterns',
      'update_settings',
      'create_type',
      'edit_type',
      'delete_type',
      'create_pattern',
      'update_pattern',
      'delete_pattern',
      'set_date_override',
      'delete_date_override',
      'create_one_off_window',
      'delete_one_off_window',
    ];
    expect(DEFINITIONS.map((definition) => definition.name)).toEqual([...FOR_BOTH, ...FOR_ADMIN]);
    expect(TOOLS.map((tool) => tool.definition)).toEqual([...DEFINITIONS]);
    for (const definition of DEFINITIONS.slice(0, 4)) {
      expect(definition.kind).toBe('read');
      expect(definition.roles).toEqual(['admin', 'user']);
      expect(definition.description.length).toBeGreaterThan(80);
    }
    for (const definition of DEFINITIONS.slice(4, 9)) expect(definition).toMatchObject({ kind: 'change', roles: ['admin', 'user'] });
    for (const definition of DEFINITIONS.slice(9, 11)) expect(definition).toMatchObject({ kind: 'read', roles: ['admin'] });
    for (const definition of DEFINITIONS.slice(11)) expect(definition).toMatchObject({ kind: 'change', roles: ['admin'] });
    // A User is offered none of the Administrator's tools; the Administrator is offered every tool.
    expect(offeredTo(DEFINITIONS, 'user').map((definition) => definition.name)).toEqual(FOR_BOTH);
    expect(offeredTo(DEFINITIONS, 'admin').map((definition) => definition.name)).toEqual([...FOR_BOTH, ...FOR_ADMIN]);
  });

  it('gives Claude each tool as a name, a description and the JSON Schema of its input', () => {
    const tools = toolsForClaude(DEFINITIONS, 'user');
    expect(tools.map((tool) => Object.keys(tool))).toEqual(Array(9).fill(['name', 'description', 'input_schema']));
    expect(tools[0]?.input_schema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    expect(tools[1]?.input_schema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    expect(tools[2]?.input_schema).toEqual({
      type: 'object',
      properties: {
        from: { type: 'string', pattern: expect.any(String), description: expect.stringContaining('first day') },
        to: { type: 'string', pattern: expect.any(String), description: expect.stringContaining('last day') },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    });
    expect(tools[3]?.input_schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(tools[3]?.input_schema).not.toHaveProperty('required');
    expect(Object.keys(tools[3]?.input_schema.properties as object)).toEqual(['from', 'to', 'status']);
    expect((tools[3]?.input_schema.properties as Record<string, unknown>).status).toMatchObject({ type: 'string', enum: ['booked', 'cancelled', 'all'] });
  });

  it("offers `username` in the input of list_appointments to the Administrator only", () => {
    const of = (role: 'admin' | 'user') => Object.keys(forClaude(listAppointments.definition, role).input_schema.properties as object);
    expect(of('admin')).toEqual(['from', 'to', 'status', 'username']);
    expect(of('user')).not.toContain('username');
    expect(listAppointments.definition.input('user').safeParse({ username: 'bob' }).success).toBe(false);
    expect(listAppointments.definition.input('admin').safeParse({ username: 'bob' }).success).toBe(true);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('get_settings and list_types (3, 8.3)', () => {
  it('ask their route for nothing and take no input', () => {
    expect(getSettings.toHandler.request({}, USER)).toEqual({ routeKey: 'GET /calendar/settings', path: '/calendar/settings' });
    expect(listTypes.toHandler.request({}, USER)).toEqual({ routeKey: 'GET /calendar/types', path: '/calendar/types' });
    expect(getSettings.definition.input('user').safeParse({ anything: 1 }).success).toBe(false);
    expect(listTypes.definition.input('admin').safeParse({}).success).toBe(true);
  });

  it('give the settings without who saved them', () => {
    expect(getSettings.toModel(recorded.user.settings, USER)).toEqual({
      fields: { timeZone: 'Europe/Rome', cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null },
    });
  });

  it('give each type as its id, its name and its capacity', () => {
    const result = listTypes.toModel(recorded.user.types, USER);
    expect(result).toEqual({ fields: {}, list: { name: 'types', items: [{ id: recorded.user.types.types[0]?.typeId, name: 'Trial visit', capacity: 1 }] } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('get_calendar (3, 8.3)', () => {
  it('asks the route for the two local dates as given: nothing is converted on the way in', () => {
    expect(getCalendar.toHandler.request({ from: '2026-11-23', to: '2026-11-29' }, USER)).toEqual({
      routeKey: 'GET /calendar',
      path: '/calendar',
      query: { from: '2026-11-23', to: '2026-11-29' },
    });
    // The two nights the clocks change in Rome, in 2026: the dates stay the dates.
    for (const night of ['2026-03-29', '2026-10-25']) {
      expect(getCalendar.toHandler.request({ from: night, to: night }, USER).query).toEqual({ from: night, to: night });
    }
  });

  it('refuses an input that is not two dates, before any route is asked', () => {
    const input = getCalendar.definition.input('user');
    expect(input.safeParse({ from: '2026-11-23' }).success).toBe(false);
    expect(input.safeParse({ from: 'Monday', to: '2026-11-29' }).success).toBe(false);
    expect(input.safeParse({ from: '2026-11-23', to: '2026-11-29', username: 'bob' }).success).toBe(false);
  });

  it("gives a User the days with open hours, their free slots and the User's own appointments, in local time", () => {
    const { fields, list } = getCalendar.toModel(recorded.user.calendar, USER, TYPES);
    expect(fields).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(list?.name).toBe('days');
    // Saturday and Sunday have nothing on them and are left out.
    expect((list?.items as { date: string }[]).map((day) => day.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
    expect(list?.items[1]).toEqual({
      date: '2026-11-24',
      weekday: 'Tuesday',
      windows: [{ start: '09:00', end: '12:00', type: 'Trial visit' }],
      // 10:00 is alice's own appointment.
      freeSlots: ['09:00', '11:00'],
      appointments: [
        {
          id: recorded.user.calendar.appointments[0]?.appointmentId,
          date: '2026-11-24',
          start: '10:00',
          end: '11:00',
          type: 'Trial visit',
          username: 'alice',
          note: 'Bring the forms',
          status: 'booked',
          cancellableUntil: '2026-11-23 10:00',
        },
      ],
    });
    // Wednesday 11:00 is another person's: not free, and nothing says whose it is.
    expect(list?.items[2]).toMatchObject({ freeSlots: ['09:00', '10:00'], appointments: [] });
  });

  it('gives the Administrator the free slots only: the full ones the route also gives are left out', () => {
    const { list } = getCalendar.toModel(recorded.admin.calendar, ADMIN, TYPES);
    // Tuesday 10:00 is alice's appointment: the route gives the Administrator that slot with no
    // place left, and the model is not told it is free.
    expect(recorded.admin.calendar.days[1]!.slots.map((slot) => slot.placesLeft)).toEqual([1, 0, 1]);
    expect(list?.items[1]).toMatchObject({ date: '2026-11-24', freeSlots: ['09:00', '11:00'] });
  });

  it("gives the Administrator everybody's appointments", () => {
    const { list } = getCalendar.toModel(recorded.admin.calendar, ADMIN, TYPES);
    expect(list?.items[2]).toMatchObject({
      date: '2026-11-25',
      appointments: [{ username: 'trialbob', start: '11:00', end: '12:00', note: 'First visit' }],
    });
    expect((list?.items[2] as { appointments: object[] }).appointments[0]).not.toHaveProperty('cancellableUntil');
  });

  it("leaves out every internal field: no instant, no busy time, no author; and for a User, no type id, no source of a window and no word on the day's own hours", () => {
    const forAdmin = JSON.stringify(getCalendar.toModel(recorded.admin.calendar, ADMIN, TYPES));
    for (const internal of ['sourceId', 'busy', 'createdBy', 'updatedAt', 'generatedAt', '.000Z']) expect(forAdmin).not.toContain(internal);
    // The very answer the route gave the Administrator, turned into a User's result: none of it.
    const forUser = JSON.stringify(getCalendar.toModel(recorded.admin.calendar, USER, TYPES));
    for (const internal of ['typeId', 'sourceId', 'source', 'one_off', 'hasOverride', recorded.admin.calendar.days[0]!.windows[0]!.sourceId]) expect(forUser).not.toContain(internal);
  });

  it("the Administrator's result and a User's, side by side: the Administrator alone gets the id of each window's type, where each window comes from, the id of an extra window, and whether the day has hours of its own", () => {
    const window = (start: string, end: string, source: 'pattern' | 'override' | 'one_off', sourceId: string) => ({ start, end, typeId: '01A', typeName: 'Visit', source, sourceId });
    const view: CalendarView = {
      timeZone: ROME,
      from: '2026-11-23',
      to: '2026-11-26',
      generatedAt: '2026-11-21T10:00:00.000Z',
      days: [
        { date: '2026-11-23', weekday: 1, hasOverride: false, slots: [], busy: [], windows: [window('2026-11-23T08:00:00.000Z', '2026-11-23T11:00:00.000Z', 'pattern', '01PATTERN'), window('2026-11-23T14:00:00.000Z', '2026-11-23T15:00:00.000Z', 'one_off', '01WINDOW')] },
        { date: '2026-11-24', weekday: 2, hasOverride: true, slots: [], busy: [], windows: [window('2026-11-24T08:00:00.000Z', '2026-11-24T10:00:00.000Z', 'override', '2026-11-24')] },
        // A day closed by hours of its own, and a day with nothing on it at all.
        { date: '2026-11-25', weekday: 3, hasOverride: true, slots: [], busy: [], windows: [] },
        { date: '2026-11-26', weekday: 4, hasOverride: false, slots: [], busy: [], windows: [] },
      ],
      appointments: [],
    };
    expect(getCalendar.toModel(view, ADMIN, TYPES).list?.items).toEqual([
      {
        date: '2026-11-23',
        weekday: 'Monday',
        hasOverride: false,
        windows: [
          { start: '09:00', end: '12:00', type: 'Visit', typeId: '01A', source: 'pattern' },
          { start: '15:00', end: '16:00', type: 'Visit', typeId: '01A', source: 'one_off', id: '01WINDOW' },
        ],
        freeSlots: [],
        appointments: [],
      },
      { date: '2026-11-24', weekday: 'Tuesday', hasOverride: true, windows: [{ start: '09:00', end: '11:00', type: 'Visit', typeId: '01A', source: 'override' }], freeSlots: [], appointments: [] },
      // Kept for the Administrator: the day is closed by hours of its own, which can be taken away.
      { date: '2026-11-25', weekday: 'Wednesday', hasOverride: true, windows: [], freeSlots: [], appointments: [] },
    ]);
    expect(getCalendar.toModel(view, USER, TYPES).list?.items).toEqual([
      {
        date: '2026-11-23',
        weekday: 'Monday',
        windows: [
          { start: '09:00', end: '12:00', type: 'Visit' },
          { start: '15:00', end: '16:00', type: 'Visit' },
        ],
        freeSlots: [],
        appointments: [],
      },
      { date: '2026-11-24', weekday: 'Tuesday', windows: [{ start: '09:00', end: '11:00', type: 'Visit' }], freeSlots: [], appointments: [] },
    ]);
  });

  it("what the Administrator's result adds: 20 bytes a day and 57 to 60 a window, 34 more for an extra window; the description says it to the Administrator only", () => {
    const admin = JSON.stringify(getCalendar.toModel(recorded.admin.calendar, ADMIN, TYPES).list?.items);
    const user = JSON.stringify(getCalendar.toModel(recorded.admin.calendar, USER, TYPES).list?.items);
    // Five days, each with one extra window: 20 + 57 + 34 bytes each, 38 of the 57 the type's id;
    // and the three days with a full slot of one hour each, `,"fullSlots":["10:00"]`, 22 bytes.
    const full = (getCalendar.toModel(recorded.admin.calendar, ADMIN, TYPES).list?.items as { fullSlots?: string[] }[]).filter((day) => day.fullSlots !== undefined);
    expect(full.map((day) => day.fullSlots!.length)).toEqual([1, 1, 1]);
    expect(admin.length - user.length).toBe(5 * (20 + 57 + 34) + 3 * 22);
    expect(forClaude(getCalendar.definition, 'admin').description).toContain('"typeId"');
    const forAdmin = forClaude(getCalendar.definition, 'admin').description ?? '';
    const forUser = forClaude(getCalendar.definition, 'user').description ?? '';
    expect(forAdmin).toContain('"hasOverride"');
    expect(forAdmin).toContain('"one_off"');
    expect(forAdmin.startsWith(forUser)).toBe(true);
    for (const word of ['typeId', 'source', 'override', 'one_off', 'hasOverride']) expect(forUser).not.toContain(word);
  });

  // A day open from midnight to midnight, with slots around the change of the clocks.
  const day = (date: string, weekday: number, start: string, end: string, slots: string[]): CalendarView => ({
    timeZone: ROME,
    from: date,
    to: date,
    generatedAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        date,
        weekday: weekday as 7,
        windows: [{ start, end, typeId: '01A', typeName: 'Visit' }],
        slots: slots.map((slot) => ({ start: slot, end: slot, typeId: '01A', capacity: 1, placesLeft: 1 })),
        busy: [],
      },
    ],
    appointments: [],
  });

  it('the night the clocks go forward (29 March 2026): 02:00 does not exist, and the day ends at 24:00', () => {
    const view = day('2026-03-29', 7, '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', ['2026-03-28T23:00:00.000Z', '2026-03-29T00:00:00.000Z', '2026-03-29T01:00:00.000Z']);
    expect(getCalendar.toModel(view, USER, TYPES).list?.items).toEqual([
      { date: '2026-03-29', weekday: 'Sunday', windows: [{ start: '00:00', end: '24:00', type: 'Visit' }], freeSlots: ['00:00', '01:00', '03:00'], appointments: [] },
    ]);
  });

  it('the night the clocks go back (25 October 2026): 02:00 comes twice, and the second one says so', () => {
    const view = day('2026-10-25', 7, '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z', ['2026-10-24T23:00:00.000Z', '2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z', '2026-10-25T02:00:00.000Z']);
    expect(getCalendar.toModel(view, USER, TYPES).list?.items[0]).toMatchObject({
      windows: [{ start: '00:00', end: '24:00', type: 'Visit' }],
      freeSlots: ['01:00', '02:00', '02:00 (second)', '03:00'],
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md; R-… rules and D…
// decisions those of docs/SHARED_CALENDAR_SPEC.md.
describe('get_calendar and the capacity of a type (8.3, R-SLOT-02, D29, D30)', () => {
  const POOL = '01JD00000000000000000TYPE3';
  const slot = (start: string, placesLeft: number, capacity = 3) => ({ start, end: start, typeId: POOL, capacity, placesLeft });
  // Tuesday 24 November 2026, a window 09:00-12:00 of the Swimming Pool, which holds 3: 09:00 with
  // 2 places left, 10:00 with 3, 11:00 full.
  const view = (slots: ReturnType<typeof slot>[]): CalendarView => ({
    timeZone: ROME,
    from: '2026-11-24',
    to: '2026-11-24',
    generatedAt: '2026-11-21T10:00:00.000Z',
    days: [{ date: '2026-11-24', weekday: 2, slots, busy: [], windows: [{ start: '2026-11-24T08:00:00.000Z', end: '2026-11-24T11:00:00.000Z', typeId: POOL, typeName: 'Swimming Pool' }] }],
    appointments: [],
  });
  const types = (capacity: number) => ({ types: [{ typeId: POOL, name: 'Swimming Pool', capacity, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' }] });
  const POOL_DAY = view([slot('2026-11-24T08:00:00.000Z', 2), slot('2026-11-24T09:00:00.000Z', 3), slot('2026-11-24T10:00:00.000Z', 0)]);

  it('asks GET /calendar/types after the calendar, for the capacities', () => {
    expect(getCalendar.toHandler.also?.call).toEqual({ routeKey: 'GET /calendar/types', path: '/calendar/types' });
  });

  it("a User: the window's capacity, each free slot with its places left, no full slot and nobody's name", () => {
    // A User is never given a full slot by the route (docs/SHARED_CALENDAR_SPEC.md decision D30); here it is, and it stays out.
    expect(getCalendar.toModel(POOL_DAY, USER, types(3)).list?.items).toEqual([
      {
        date: '2026-11-24',
        weekday: 'Tuesday',
        windows: [{ start: '09:00', end: '12:00', type: 'Swimming Pool', capacity: 3 }],
        freeSlots: ['09:00 (2 of 3 places left)', '10:00 (3 of 3 places left)'],
        appointments: [],
      },
    ]);
  });

  it("the Administrator: the same, and the day's full slots apart, as fullSlots", () => {
    expect(getCalendar.toModel(POOL_DAY, ADMIN, types(3)).list?.items[0]).toMatchObject({
      windows: [{ start: '09:00', end: '12:00', type: 'Swimming Pool', capacity: 3, typeId: POOL }],
      freeSlots: ['09:00 (2 of 3 places left)', '10:00 (3 of 3 places left)'],
      fullSlots: ['11:00'],
    });
  });

  it('a capacity of 1 reads as before: a free slot is its time, a window has no capacity, and a day with no full slot no fullSlots', () => {
    const single = view([slot('2026-11-24T08:00:00.000Z', 1, 1), slot('2026-11-24T09:00:00.000Z', 1, 1)]);
    for (const context of [USER, ADMIN]) {
      const [day] = getCalendar.toModel(single, context, types(1)).list?.items as Record<string, unknown>[];
      expect(day!.freeSlots).toEqual(['09:00', '10:00']);
      expect(day!.windows).toEqual([expect.not.objectContaining({ capacity: expect.anything() })]);
      expect(day).not.toHaveProperty('fullSlots');
    }
  });

  it('a window whose type is not among those read holds one person', () => {
    expect(getCalendar.toModel(POOL_DAY, USER, { types: [] }).list?.items[0]).toMatchObject({ windows: [{ start: '09:00', end: '12:00', type: 'Swimming Pool' }] });
  });

  it('the description says what the brackets mean, and that the time alone is booked; fullSlots to the Administrator only', () => {
    const forUser = forClaude(getCalendar.definition, 'user').description ?? '';
    const forAdmin = forClaude(getCalendar.definition, 'admin').description ?? '';
    expect(forUser).toContain('"10:00 (2 of 3 places left)"');
    expect(forUser).toContain('its time alone, without the brackets');
    expect(forUser).not.toContain('fullSlots');
    expect(forAdmin).toContain('"fullSlots"');
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('list_appointments (3, 8.3)', () => {
  const request = (input: object) => listAppointments.toHandler.request(input as never, ADMIN).query;

  it('asks for the upcoming ones when no period is given, for the period when it is', () => {
    expect(listAppointments.toHandler.request({}, USER)).toEqual({ routeKey: 'GET /calendar/appointments', path: '/calendar/appointments', query: { upcoming: 'true' } });
    expect(request({ from: '2026-11-23', to: '2026-11-29' })).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(request({ status: 'all', username: 'trialbob' })).toEqual({ upcoming: 'true', status: 'all', username: 'trialbob' });
    expect(request({ from: '2026-03-29', to: '2026-10-25', status: 'cancelled' })).toEqual({ from: '2026-03-29', to: '2026-10-25', status: 'cancelled' });
  });

  it('refuses half a period, an unknown status and a date that is not one', () => {
    for (const role of ['admin', 'user'] as const) {
      const input = listAppointments.definition.input(role);
      expect(input.safeParse({}).success).toBe(true);
      expect(input.safeParse({ from: '2026-11-23', to: '2026-11-29', status: 'booked' }).success).toBe(true);
      expect(input.safeParse({ from: '2026-11-23' }).success).toBe(false);
      expect(input.safeParse({ to: '2026-11-23' }).success).toBe(false);
      expect(input.safeParse({ status: 'pending' }).success).toBe(false);
      expect(input.safeParse({ from: '23/11/2026', to: '2026-11-29' }).success).toBe(false);
    }
  });

  it("gives a User's own appointments with the moment up to which each can be cancelled", () => {
    const { list } = listAppointments.toModel(recorded.user.appointments, USER);
    expect(list?.name).toBe('appointments');
    expect(list?.items).toEqual([
      expect.objectContaining({ date: '2026-11-24', start: '10:00', end: '11:00', username: 'alice', note: 'Bring the forms', cancellableUntil: '2026-11-23 10:00' }),
      expect.objectContaining({ date: '2026-11-26', start: '09:00', end: '10:00', username: 'alice', note: null, cancellableUntil: '2026-11-25 09:00' }),
    ]);
  });

  it("gives the Administrator everybody's, by start", () => {
    const { list } = listAppointments.toModel(recorded.admin.appointments, ADMIN);
    expect((list?.items as { username: string }[]).map((appointment) => appointment.username)).toEqual(['alice', 'trialbob', 'alice']);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('local times out (8.3)', () => {
  const appointment = (over: Partial<Appointment>): Appointment => ({ ...(recorded.user.appointments.appointments[0] as Appointment), ...over });

  it('an appointment across the hour that comes twice keeps its two wall-clock times', () => {
    const result = appointmentForModel(appointment({ date: '2026-10-25', start: '2026-10-25T00:00:00.000Z', end: '2026-10-25T01:00:00.000Z', cancellableUntil: '2026-10-24T00:00:00.000Z' }), ROME);
    expect(result).toMatchObject({ date: '2026-10-25', start: '02:00', end: '02:00', cancellableUntil: '2026-10-24 02:00' });
  });

  it('an appointment across the hour that does not exist jumps it', () => {
    const result = appointmentForModel(appointment({ date: '2026-03-29', start: '2026-03-29T00:00:00.000Z', end: '2026-03-29T01:00:00.000Z' }), ROME);
    expect(result).toMatchObject({ start: '01:00', end: '03:00' });
  });

  it('an end at the midnight that closes the day is 24:00, and only then', () => {
    expect(localEndTime('2026-11-24T23:00:00.000Z', '2026-11-24', ROME)).toBe('24:00');
    expect(localEndTime('2026-11-23T23:00:00.000Z', '2026-11-24', ROME)).toBe('00:00');
    expect(localEndTime('2026-11-24T22:30:00.000Z', '2026-11-24', ROME)).toBe('23:30');
    expect(localDateTime('2026-06-30T22:30:00.000Z', ROME)).toBe('2026-07-01 00:30');
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the cap of a result (8.3)', () => {
  const items = (count: number, note: string) => Array.from({ length: count }, (_, i) => ({ id: `appointment-${i}`, note }));
  const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

  it('leaves a result that fits as it is', () => {
    expect(cappedJson({ fields: { from: 'a' }, list: { name: 'days', items: [1, 2] } })).toBe('{"from":"a","days":[1,2]}');
    expect(cappedJson({ fields: { timeZone: ROME } })).toBe('{"timeZone":"Europe/Rome"}');
  });

  it('cuts a list that does not fit at a whole item, and tells Claude to ask for a shorter period', () => {
    const all = items(120, 'Porta i moduli, è già la terza volta');
    const text = cappedJson({ fields: {}, list: { name: 'appointments', items: all } });
    expect(bytes(JSON.stringify({ appointments: all }))).toBeGreaterThan(RESULT_CAP_BYTES);
    expect(bytes(text)).toBeLessThanOrEqual(RESULT_CAP_BYTES);
    const result = JSON.parse(text) as { appointments: unknown[]; cut: string };
    // Whole items, the first ones, in order; and as many as fit.
    expect(result.appointments).toEqual(all.slice(0, result.appointments.length));
    expect(result.appointments.length).toBeGreaterThan(40);
    expect(result.cut).toBe(`This result was too long: only the first ${result.appointments.length} of 120 appointments are here. Ask again for a shorter period to get the others.`);
  });

  it('counts bytes, not characters', () => {
    const text = cappedJson({ fields: {}, list: { name: 'appointments', items: items(40, 'è'.repeat(100)) } });
    expect(text.length).toBeLessThan(RESULT_CAP_BYTES - 1000);
    expect(bytes(text)).toBeLessThanOrEqual(RESULT_CAP_BYTES);
    expect(JSON.parse(text)).toHaveProperty('cut');
  });

  it('gives no item at all when even the first is too long', () => {
    const result = JSON.parse(cappedJson({ fields: { from: 'a' }, list: { name: 'days', items: ['x'.repeat(RESULT_CAP_BYTES)] } })) as { days: unknown[]; cut: string };
    expect(result.days).toEqual([]);
    expect(result.cut).toContain('only the first 0 of 1 days');
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('a refusal as Claude sees it (8.3)', () => {
  const REFUSAL = { error: 'availability_conflict', message: '2 appointments would fall outside the availability' };
  const conflict = (n: number) => ({ appointmentId: `01JD0000000000000000APPT${String(n).padStart(2, '0')}`, username: 'alice', start: '2026-11-24T09:00:00.000Z', end: '2026-11-24T10:00:00.000Z' });

  it('is the code and the message alone when the route listed no appointment', () => {
    expect(refusalForModel(REFUSAL, { ...REFUSAL }, ROME)).toEqual({ fields: REFUSAL });
    expect(refusalForModel(REFUSAL, null, ROME)).toEqual({ fields: REFUSAL });
    expect(refusalForModel(REFUSAL, { ...REFUSAL, conflicts: 'two' }, ROME)).toEqual({ fields: REFUSAL });
    expect(cappedJson(refusalForModel(REFUSAL, null, ROME))).toBe(JSON.stringify(REFUSAL));
  });

  it('gives each appointment in the way as its id, whose it is, its local date and its wall-clock times', () => {
    const result = refusalForModel(REFUSAL, { ...REFUSAL, conflicts: [conflict(1)] }, ROME);
    expect(result.fields).toEqual(REFUSAL);
    expect(result.list).toMatchObject({ name: 'conflicts', items: [{ id: '01JD0000000000000000APPT01', username: 'alice', date: '2026-11-24', start: '10:00', end: '11:00' }] });
    expect(cappedJson(result)).not.toContain('.000Z');
  });

  it('a list too long is cut at a whole appointment like every list, and Claude is told how to see the others', () => {
    const text = cappedJson(refusalForModel(REFUSAL, { ...REFUSAL, conflicts: Array.from({ length: 200 }, (_, n) => conflict(n)) }, ROME));
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(RESULT_CAP_BYTES);
    const cut = JSON.parse(text) as { error: string; conflicts: unknown[]; cut: string };
    expect(cut.error).toBe('availability_conflict');
    expect(cut.conflicts.length).toBeGreaterThan(40);
    expect(cut.cut).toBe(`This result was too long: only the first ${cut.conflicts.length} of 200 conflicts are here. Use list_appointments to see the others.`);
  });
});
