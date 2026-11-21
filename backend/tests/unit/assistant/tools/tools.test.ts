import type { Appointment, CalendarView } from '@shared-calendar/shared';
import { getCalendar } from '../../../../src/assistant/tools/getCalendar';
import { getSettings } from '../../../../src/assistant/tools/getSettings';
import { DEFINITIONS, TOOLS } from '../../../../src/assistant/tools/list';
import { listAppointments } from '../../../../src/assistant/tools/listAppointments';
import { listTypes } from '../../../../src/assistant/tools/listTypes';
import { appointmentForModel, cappedJson, localDateTime, localEndTime, RESULT_CAP_BYTES } from '../../../../src/assistant/tools/result';
import { forClaude, offeredTo, toolsForClaude } from '../../../../src/assistant/tools/tool';
import recorded from './recorded/routes.json';

// `recorded/routes.json` holds answers of the local API to the four routes the tools stand for,
// for a User (alice) and for the Administrator, on a week with one type ("Trial visit"), a window
// 09:00-12:00 from Monday 23 to Friday 27 November 2026, two appointments of alice and one of
// another User; and two refusals of the routes. The calendar's zone is Europe/Rome.

const ROME = 'Europe/Rome';
const USER = { timeZone: ROME, role: 'user' as const };
const ADMIN = { timeZone: ROME, role: 'admin' as const };

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the list of tools (3, 8.2)', () => {
  it('holds the four reads, each for both roles, the definitions in the same order as the tools', () => {
    expect(DEFINITIONS.map((definition) => definition.name)).toEqual(['get_settings', 'list_types', 'get_calendar', 'list_appointments']);
    expect(TOOLS.map((tool) => tool.definition)).toEqual([...DEFINITIONS]);
    for (const definition of DEFINITIONS) {
      expect(definition.kind).toBe('read');
      expect(definition.roles).toEqual(['admin', 'user']);
      expect(definition.description.length).toBeGreaterThan(80);
    }
    expect(offeredTo(DEFINITIONS, 'user')).toHaveLength(4);
  });

  it('gives Claude each tool as a name, a description and the JSON Schema of its input', () => {
    const tools = toolsForClaude(DEFINITIONS, 'user');
    expect(tools.map((tool) => Object.keys(tool))).toEqual(Array(4).fill(['name', 'description', 'input_schema']));
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

  it('give each type as its id and its name', () => {
    const result = listTypes.toModel(recorded.user.types, USER);
    expect(result).toEqual({ fields: {}, list: { name: 'types', items: [{ id: recorded.user.types.types[0]?.typeId, name: 'Trial visit' }] } });
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
    const { fields, list } = getCalendar.toModel(recorded.user.calendar, USER);
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

  it("gives the Administrator everybody's appointments", () => {
    const { list } = getCalendar.toModel(recorded.admin.calendar, ADMIN);
    expect(list?.items[2]).toMatchObject({
      date: '2026-11-25',
      appointments: [{ username: 'trialbob', start: '11:00', end: '12:00', note: 'First visit' }],
    });
    expect((list?.items[2] as { appointments: object[] }).appointments[0]).not.toHaveProperty('cancellableUntil');
  });

  it('leaves out every internal field: no instant, no type id, no source of a window, no busy time, no author', () => {
    const text = JSON.stringify(getCalendar.toModel(recorded.admin.calendar, ADMIN));
    for (const internal of ['typeId', 'sourceId', 'one_off', 'busy', 'hasOverride', 'createdBy', 'updatedAt', 'generatedAt', '.000Z']) expect(text).not.toContain(internal);
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
        slots: slots.map((slot) => ({ start: slot, end: slot, typeId: '01A' })),
        busy: [],
      },
    ],
    appointments: [],
  });

  it('the night the clocks go forward (29 March 2026): 02:00 does not exist, and the day ends at 24:00', () => {
    const view = day('2026-03-29', 7, '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', ['2026-03-28T23:00:00.000Z', '2026-03-29T00:00:00.000Z', '2026-03-29T01:00:00.000Z']);
    expect(getCalendar.toModel(view, USER).list?.items).toEqual([
      { date: '2026-03-29', weekday: 'Sunday', windows: [{ start: '00:00', end: '24:00', type: 'Visit' }], freeSlots: ['00:00', '01:00', '03:00'], appointments: [] },
    ]);
  });

  it('the night the clocks go back (25 October 2026): 02:00 comes twice, as the calendar itself has it', () => {
    const view = day('2026-10-25', 7, '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z', ['2026-10-24T23:00:00.000Z', '2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z', '2026-10-25T02:00:00.000Z']);
    expect(getCalendar.toModel(view, USER).list?.items[0]).toMatchObject({
      windows: [{ start: '00:00', end: '24:00', type: 'Visit' }],
      freeSlots: ['01:00', '02:00', '02:00', '03:00'],
    });
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
