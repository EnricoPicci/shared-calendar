import { ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, type AppointmentSummary, type MoveSummary, type NoteSummary } from '@shared-calendar/shared';
import { cancelAppointment, cancelAppointmentDefinition } from '../../../../src/assistant/tools/cancelAppointment';
import { changeAppointment, changeAppointmentDefinition } from '../../../../src/assistant/tools/changeAppointment';
import { setAppointmentNote, setAppointmentNoteDefinition } from '../../../../src/assistant/tools/setAppointmentNote';
import { forClaude, isChange, type ChangeTool, type RouteAnswer, type ToolCall, type ToolContext } from '../../../../src/assistant/tools/tool';
import { handler as getCalendar } from '../../../../src/handlers/getCalendar';
import { handler as listAppointments } from '../../../../src/handlers/listAppointments';

// The two routes the three tools read their facts through are replaced by `route`, the function
// a confirmation is given to call a route with: no handler runs and nothing is read. The
// calendar's zone is Europe/Rome.
const USER: ToolContext = { timeZone: 'Europe/Rome', role: 'user' };
const ADMIN: ToolContext = { timeZone: 'Europe/Rome', role: 'admin' };
const route = vi.fn<(handler: unknown, call: ToolCall) => Promise<RouteAnswer>>();

const VISIT = '01JD00000000000000000TYPE1';
const CHECKUP = '01JD00000000000000000TYPE2';
const TUESDAY = '01JD0000000000000000APPT01';
const WEDNESDAY = '01JD0000000000000000APPT02';
const CANCELLED = '01JD0000000000000000APPT03';
const UNKNOWN = '01JD0000000000000000APPT99';

// The appointments GET /calendar/appointments answers the person, those that have not ended,
// cancelled ones included: Tuesday 24 November 2026 at 10:00 with a note, Wednesday at 11:00
// without, and one cancelled.
const appointment = (appointmentId: string, day: number, hourUtc: string, over: Record<string, unknown> = {}) => ({
  appointmentId,
  username: 'alice',
  date: `2026-11-${day}`,
  start: `2026-11-${day}T${hourUtc}:00:00.000Z`,
  end: `2026-11-${day}T${String(Number(hourUtc) + 1).padStart(2, '0')}:00:00.000Z`,
  typeId: VISIT,
  typeName: 'Visit',
  note: null,
  status: 'booked',
  cancellableUntil: `2026-11-${day - 1}T${hourUtc}:00:00.000Z`,
  ...over,
});
const LIST = { status: 200, body: { appointments: [appointment(TUESDAY, 24, '09', { note: 'First visit' }), appointment(WEDNESDAY, 25, '10'), appointment(CANCELLED, 26, '09', { status: 'cancelled', cancellableUntil: null })] } };
// Thursday 26 November 2026, open 09:00-12:00 local under the type "Checkup", 09:00 and 11:00 free.
const THURSDAY = {
  status: 200,
  body: {
    days: [
      {
        date: '2026-11-26',
        weekday: 4,
        windows: [{ start: '2026-11-26T08:00:00.000Z', end: '2026-11-26T11:00:00.000Z', typeId: CHECKUP, typeName: 'Checkup' }],
        slots: ['08', '10'].map((hour) => ({ start: `2026-11-26T${hour}:00:00.000Z`, end: `2026-11-26T${String(Number(hour) + 1).padStart(2, '0')}:00:00.000Z`, typeId: CHECKUP, capacity: 1, placesLeft: 1 })),
        busy: [],
      },
    ],
  },
};
const LIST_CALL = { routeKey: 'GET /calendar/appointments', path: '/calendar/appointments', query: { upcoming: 'true', status: 'all' } };

const cancel = cancelAppointment as ChangeTool<Record<string, unknown>, AppointmentSummary>;
const move = changeAppointment as ChangeTool<Record<string, unknown>, MoveSummary>;
const note = setAppointmentNote as ChangeTool<Record<string, unknown>, NoteSummary>;
const DEFINITIONS = [cancelAppointmentDefinition, changeAppointmentDefinition, setAppointmentNoteDefinition];
// One valid input of each tool about the appointment with this id.
const inputs = (appointmentId: string): [ChangeTool<Record<string, unknown>, unknown>, Record<string, unknown>][] => [
  [cancel as never, { appointmentId }],
  [move as never, { appointmentId, date: '2026-11-26', time: '09:00' }],
  [note as never, { appointmentId, note: 'Bring the forms' }],
];

beforeEach(() => {
  vi.resetAllMocks();
  route.mockImplementation((_handler, call) => Promise.resolve(call.routeKey === 'GET /calendar' ? THURSDAY : LIST));
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('cancel_appointment, change_appointment and set_appointment_note: what Claude is given (3, 8.2)', () => {
  it('each is a change, offered to both roles, and holds no handler of its route', () => {
    expect(DEFINITIONS.map((definition) => definition.name)).toEqual(['cancel_appointment', 'change_appointment', 'set_appointment_note']);
    for (const definition of DEFINITIONS) expect(definition).toMatchObject({ kind: 'change', roles: ['admin', 'user'] });
    for (const tool of [cancelAppointment, changeAppointment, setAppointmentNote]) {
      expect(isChange(tool)).toBe(true);
      expect(tool).not.toHaveProperty('toHandler');
    }
  });

  it('each description says that calling the tool changes nothing by itself', () => {
    for (const definition of DEFINITIONS) {
      expect(definition.description).toMatch(/Calling this tool \w+ nothing by itself/);
      expect(definition.description).toContain('presses the confirm button');
    }
  });

  it('the schemas are the same for both roles: an appointment is named by its id, never by a date', () => {
    for (const definition of DEFINITIONS) expect(forClaude(definition, 'admin')).toEqual(forClaude(definition, 'user'));
    expect(forClaude(cancelAppointmentDefinition, 'user').input_schema).toEqual({
      type: 'object',
      properties: { appointmentId: { type: 'string', pattern: expect.any(String), description: expect.stringContaining('The id of the appointment') } },
      required: ['appointmentId'],
      additionalProperties: false,
    });
    const moving = forClaude(changeAppointmentDefinition, 'user').input_schema;
    expect(Object.keys(moving.properties as object)).toEqual(['appointmentId', 'date', 'time', 'occurrence']);
    expect(moving.required).toEqual(['appointmentId', 'date', 'time']);
    const noting = forClaude(setAppointmentNoteDefinition, 'user').input_schema;
    expect(Object.keys(noting.properties as object)).toEqual(['appointmentId', 'note']);
    expect(noting.required).toEqual(['appointmentId', 'note']);
    // A text or null: the schema says so to Claude.
    expect((noting.properties as Record<string, unknown>).note).toMatchObject({ type: ['string', 'null'] });
  });

  it('refuse an id that is not one, a missing id and a field they do not have', () => {
    for (const [tool, input] of inputs(TUESDAY)) {
      const schema = tool.definition.input('user');
      expect(schema.safeParse(input).success).toBe(true);
      expect(schema.safeParse({ ...input, appointmentId: 'tuesday-at-ten' }).success).toBe(false);
      expect(schema.safeParse({ ...input, appointmentId: undefined }).success).toBe(false);
      expect(schema.safeParse({ ...input, username: 'bob' }).success).toBe(false);
    }
  });

  it('a move takes no note, no end and no type; a note must be said: a text, or null to remove it, never an empty text or nothing', () => {
    const moving = changeAppointmentDefinition.input('user');
    for (const extra of [{ note: 'x' }, { end: '11:00' }, { typeId: VISIT }]) expect(moving.safeParse({ appointmentId: TUESDAY, date: '2026-11-26', time: '09:00', ...extra }).success).toBe(false);
    expect(moving.safeParse({ appointmentId: TUESDAY, date: '2026-11-26', time: '09:00', occurrence: 'second' }).success).toBe(true);
    const noting = setAppointmentNoteDefinition.input('admin');
    expect(noting.safeParse({ appointmentId: TUESDAY, note: null }).success).toBe(true);
    expect(noting.safeParse({ appointmentId: TUESDAY }).success).toBe(false);
    expect(noting.safeParse({ appointmentId: TUESDAY, note: '' }).success).toBe(false);
    expect(noting.safeParse({ appointmentId: TUESDAY, note: '  \n ' }).success).toBe(false);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md, and the R-… rules
// are those of docs/SHARED_CALENDAR_SPEC.md.
describe('the appointment an id stands for (5.5 rule 2)', () => {
  it('is looked for among the appointments that have not ended, cancelled ones included, as GET /calendar/appointments answers the person', async () => {
    for (const [tool, input] of inputs(TUESDAY)) {
      route.mockClear();
      expect(await tool.confirmation.read(input, USER, route)).toMatchObject({ ok: true });
      expect(route).toHaveBeenCalledWith(listAppointments, LIST_CALL);
    }
  });

  it('an id that is not in that list gives no proposal: unknown, ended, or another person\'s for a User, whose list holds their own only (R-PERM-01)', async () => {
    for (const [tool, input] of inputs(UNKNOWN)) {
      const result = await tool.confirmation.read(input, USER, route);
      expect(result).toMatchObject({ ok: false, error: 'appointment_not_found' });
      expect(result.ok === false && result.message).toContain('list_appointments');
    }
    // The day a move would go to is not read for an appointment that is not found.
    expect(route).not.toHaveBeenCalledWith(getCalendar, expect.anything());
  });

  it('a cancelled appointment gives no proposal, with the code its routes answer (R-CAN-02)', async () => {
    for (const [tool, input] of inputs(CANCELLED)) expect(await tool.confirmation.read(input, USER, route)).toMatchObject({ ok: false, error: 'appointment_not_active' });
  });

  it('no proposal when the appointments cannot be read: the refusal of the route, or a failure without one', async () => {
    route.mockResolvedValue({ status: 403, body: { error: 'forbidden', message: 'Not allowed for this account' } });
    expect(await cancel.confirmation.read({ appointmentId: TUESDAY }, USER, route)).toEqual({ ok: false, error: 'forbidden', message: 'Not allowed for this account' });
    route.mockResolvedValue({ status: 500, body: null });
    expect(await cancel.confirmation.read({ appointmentId: TUESDAY }, USER, route)).toEqual({ ok: false, error: 'internal_error', message: 'The appointments could not be read.' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('cancel_appointment: the facts, the words and the result (5.5 rule 2, 8.3)', () => {
  it("gives what the route will be sent, no body, and the appointment's day, times and type; whose it is for the Administrator only", async () => {
    expect(await cancel.confirmation.read({ appointmentId: TUESDAY }, USER, route)).toEqual({
      ok: true,
      call: { routeKey: 'POST /calendar/appointments/{appointmentId}/cancel', path: `/calendar/appointments/${TUESDAY}/cancel`, pathParameters: { appointmentId: TUESDAY } },
      subjects: [`appointment ${TUESDAY}`],
      facts: { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null },
    });
    expect(await cancel.confirmation.read({ appointmentId: TUESDAY }, ADMIN, route)).toMatchObject({ facts: { date: '2026-11-24', start: '10:00', username: 'alice' } });
  });

  it('the summary is the fixed text of the language, for a User and for the Administrator', () => {
    const own: AppointmentSummary = { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null };
    expect(cancel.confirmation.summary(ASSISTANT_TEXTS_EN, own)).toBe('Cancel the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).');
    expect(cancel.confirmation.summary(ASSISTANT_TEXTS_IT, own)).toBe("Annullare l'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit).");
    expect(cancel.confirmation.summary(ASSISTANT_TEXTS_EN, { ...own, username: 'alice' })).toBe('Cancel the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).');
    expect(cancel.confirmation.summary(ASSISTANT_TEXTS_IT, { ...own, username: 'alice' })).toBe("Annullare l'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit).");
  });

  it('gives Claude the appointment as the calendar now holds it: cancelled, in local times', () => {
    const { fields } = cancel.toModel(appointment(TUESDAY, 24, '09', { status: 'cancelled', cancellableUntil: null }), USER);
    expect(fields).toEqual({ appointment: { id: TUESDAY, date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: 'alice', note: null, status: 'cancelled' } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md, and the R-… rules
// are those of docs/SHARED_CALENDAR_SPEC.md.
describe('change_appointment: the facts, the words and the result (5.5 rule 2, 8.3)', () => {
  const read = (input: Record<string, unknown>, context = USER) => move.confirmation.read(input, context, route);

  it('reads the appointment and the day it goes to, and gives the old time, the new slot with its end and its type, and a request with the new start alone (R-CHG-03: the note is kept)', async () => {
    const result = await read({ appointmentId: TUESDAY, date: '2026-11-26', time: '09:00' });

    expect(route).toHaveBeenCalledTimes(2);
    expect(route).toHaveBeenCalledWith(listAppointments, LIST_CALL);
    expect(route).toHaveBeenCalledWith(getCalendar, { routeKey: 'GET /calendar', path: '/calendar', query: { from: '2026-11-26', to: '2026-11-26' } });
    expect(result).toEqual({
      ok: true,
      call: {
        routeKey: 'POST /calendar/appointments/{appointmentId}/change',
        path: `/calendar/appointments/${TUESDAY}/change`,
        pathParameters: { appointmentId: TUESDAY },
        body: { start: '2026-11-26T08:00:00.000Z' },
      },
      subjects: [`appointment ${TUESDAY}`, 'slot 2026-11-26T08:00:00.000Z'],
      facts: {
        appointment: { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null },
        to: { date: '2026-11-26', start: '09:00', end: '10:00', type: 'Checkup', secondTime: false },
      },
    });
  });

  it('names whose appointment it is for the Administrator', async () => {
    expect(await read({ appointmentId: TUESDAY, date: '2026-11-26', time: '09:00' }, ADMIN)).toMatchObject({ facts: { appointment: { username: 'alice' } } });
  });

  it.each([
    ['a slot that is not free', '10:00'],
    ['a time outside the open hours', '15:00'],
  ])('no proposal for %s: Claude is told there is no free slot', async (_what, time) => {
    const result = await read({ appointmentId: TUESDAY, date: '2026-11-26', time });
    expect(result).toMatchObject({ ok: false, error: 'no_free_slot' });
    expect(result.ok === false && result.message).toContain('get_calendar');
  });

  it('no proposal for the time the appointment already has, and the calendar is not read for it', async () => {
    expect(await read({ appointmentId: TUESDAY, date: '2026-11-24', time: '10:00' })).toMatchObject({ ok: false, error: 'same_time' });
    expect(route).not.toHaveBeenCalledWith(getCalendar, expect.anything());
  });

  it('no proposal when the day cannot be read', async () => {
    route.mockImplementation((_handler, call) => Promise.resolve(call.routeKey === 'GET /calendar' ? { status: 500, body: null } : LIST));
    expect(await read({ appointmentId: TUESDAY, date: '2026-11-26', time: '09:00' })).toEqual({ ok: false, error: 'internal_error', message: 'The calendar could not be read.' });
  });

  it('the two nights the clocks change are told as in a booking, before anything is read', async () => {
    expect(await read({ appointmentId: TUESDAY, date: '2026-03-29', time: '02:00' })).toMatchObject({ ok: false, error: 'time_does_not_exist' });
    expect(await read({ appointmentId: TUESDAY, date: '2026-10-25', time: '02:00' })).toMatchObject({ ok: false, error: 'time_comes_twice' });
    expect(await read({ appointmentId: TUESDAY, date: '2026-11-26', time: '09:00', occurrence: 'second' })).toMatchObject({ ok: false, error: 'time_comes_once' });
    expect(route).not.toHaveBeenCalled();
  });

  it('the second of two equal times is the later instant, and the proposal says which', async () => {
    const night = structuredClone(THURSDAY);
    night.body.days[0]!.date = '2026-10-25';
    night.body.days[0]!.windows[0] = { start: '2026-10-24T22:00:00.000Z', end: '2026-10-25T23:00:00.000Z', typeId: CHECKUP, typeName: 'Checkup' };
    night.body.days[0]!.slots = [{ start: '2026-10-25T01:00:00.000Z', end: '2026-10-25T02:00:00.000Z', typeId: CHECKUP, capacity: 1, placesLeft: 1 }];
    route.mockImplementation((_handler, call) => Promise.resolve(call.routeKey === 'GET /calendar' ? night : LIST));
    expect(await read({ appointmentId: TUESDAY, date: '2026-10-25', time: '02:00', occurrence: 'second' })).toMatchObject({
      call: { body: { start: '2026-10-25T01:00:00.000Z' } },
      facts: { to: { start: '02:00', end: '03:00', secondTime: true } },
    });
  });

  it('the summary is the fixed text of the language, for a User and for the Administrator', () => {
    const facts: MoveSummary = {
      appointment: { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null },
      to: { date: '2026-11-26', start: '09:00', end: '10:00', type: 'Checkup', secondTime: false },
    };
    const ofAlice = { ...facts, appointment: { ...facts.appointment, username: 'alice' } };
    expect(move.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe(
      'Move the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to Thursday 26 November 2026, from 09:00 to 10:00 (Checkup).',
    );
    expect(move.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toBe(
      "Spostare l'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit), a giovedì 26 novembre 2026, dalle 09:00 alle 10:00 (Checkup).",
    );
    expect(move.confirmation.summary(ASSISTANT_TEXTS_EN, ofAlice)).toBe(
      'Move the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to Thursday 26 November 2026, from 09:00 to 10:00 (Checkup).',
    );
    expect(move.confirmation.summary(ASSISTANT_TEXTS_IT, ofAlice)).toBe(
      "Spostare l'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit), a giovedì 26 novembre 2026, dalle 09:00 alle 10:00 (Checkup).",
    );
  });

  it('gives Claude the new appointment with its id, and which one it replaces', () => {
    const cancelled = appointment(TUESDAY, 24, '09', { status: 'cancelled', cancellableUntil: null, note: 'First visit' });
    const booked = appointment(WEDNESDAY, 26, '08', { typeName: 'Checkup', note: 'First visit' });
    expect(move.toModel({ cancelled, booked }, USER).fields).toEqual({
      appointment: { id: WEDNESDAY, date: '2026-11-26', start: '09:00', end: '10:00', type: 'Checkup', username: 'alice', note: 'First visit', status: 'booked', cancellableUntil: '2026-11-25 09:00' },
      replaced: { id: TUESDAY, date: '2026-11-24', start: '10:00', end: '11:00', status: 'cancelled' },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('set_appointment_note: the facts, the words and the result (5.5 rule 2, 8.3)', () => {
  const read = (input: Record<string, unknown>, context = USER) => note.confirmation.read(input, context, route);
  const call = (appointmentId: string, body: unknown) => ({ routeKey: 'PATCH /calendar/appointments/{appointmentId}', path: `/calendar/appointments/${appointmentId}`, pathParameters: { appointmentId }, body });

  it('gives the note as it would become, trimmed as the route takes it, and the note it replaces', async () => {
    expect(await read({ appointmentId: TUESDAY, note: '  Bring the forms \n' })).toEqual({
      ok: true,
      call: call(TUESDAY, { note: 'Bring the forms' }),
      subjects: [`appointment ${TUESDAY}`],
      facts: { appointment: { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null }, note: 'Bring the forms', previous: 'First visit' },
    });
    expect(await read({ appointmentId: WEDNESDAY, note: 'Bring the forms' }, ADMIN)).toMatchObject({
      facts: { appointment: { date: '2026-11-25', start: '11:00', end: '12:00', username: 'alice' }, note: 'Bring the forms', previous: null },
    });
  });

  it('null removes the note: the route is sent null, and the proposal shows the note that goes', async () => {
    expect(await read({ appointmentId: TUESDAY, note: null })).toMatchObject({ ok: true, call: call(TUESDAY, { note: null }), facts: { note: null, previous: 'First visit' } });
  });

  it('a note that changes nothing is not proposed: the same text, or nothing to remove', async () => {
    const same = await read({ appointmentId: TUESDAY, note: ' First visit ' });
    expect(same).toMatchObject({ ok: false, error: 'note_unchanged' });
    expect(same.ok === false && same.message).toContain('already has exactly this note');
    const none = await read({ appointmentId: WEDNESDAY, note: null });
    expect(none).toMatchObject({ ok: false, error: 'note_unchanged' });
    expect(none.ok === false && none.message).toContain('nothing to remove');
  });

  it('a note the route would refuse is refused here, and nothing is read', async () => {
    expect(await read({ appointmentId: TUESDAY, note: 'x'.repeat(501) })).toMatchObject({ ok: false, error: 'invalid_note' });
    expect(await read({ appointmentId: TUESDAY, note: 'a\u0007b' })).toMatchObject({ ok: false, error: 'invalid_note' });
    expect(route).not.toHaveBeenCalled();
  });

  it('the summary is the fixed text of the language: a note set, set over another, and removed', () => {
    const own = { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null };
    const set: NoteSummary = { appointment: own, note: 'Bring the forms', previous: null };
    const replaced: NoteSummary = { appointment: { ...own, username: 'alice' }, note: 'Bring the forms', previous: 'First visit' };
    const removed: NoteSummary = { appointment: own, note: null, previous: 'First visit' };
    expect(note.confirmation.summary(ASSISTANT_TEXTS_EN, set)).toBe('Set the note of the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to: "Bring the forms"');
    expect(note.confirmation.summary(ASSISTANT_TEXTS_IT, set)).toBe("Impostare la nota dell'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit): «Bring the forms»");
    expect(note.confirmation.summary(ASSISTANT_TEXTS_EN, replaced)).toBe(
      'Set the note of the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to: "Bring the forms" It replaces the note: "First visit"',
    );
    expect(note.confirmation.summary(ASSISTANT_TEXTS_IT, replaced)).toBe(
      "Impostare la nota dell'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit): «Bring the forms» Sostituisce la nota: «First visit»",
    );
    expect(note.confirmation.summary(ASSISTANT_TEXTS_EN, removed)).toBe('Remove the note of the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). The note is: "First visit"');
    expect(note.confirmation.summary(ASSISTANT_TEXTS_IT, removed)).toBe("Togliere la nota dell'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit). La nota è: «First visit»");
  });

  it('gives Claude the appointment with its note as saved', () => {
    expect(note.toModel(appointment(TUESDAY, 24, '09', { note: 'Bring the forms' }), USER).fields).toMatchObject({ appointment: { id: TUESDAY, note: 'Bring the forms', status: 'booked' } });
  });
});
