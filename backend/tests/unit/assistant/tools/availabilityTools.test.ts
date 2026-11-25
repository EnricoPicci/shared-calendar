import { ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, TIME_STEP_MINUTES, toInstant, type DayChangeSummary, type PatternSummary, type WindowSummary } from '@shared-calendar/shared';
import { createOneOffWindow, createOneOffWindowDefinition } from '../../../../src/assistant/tools/createOneOffWindow';
import { createPattern, createPatternDefinition } from '../../../../src/assistant/tools/createPattern';
import { deleteDateOverride, deleteDateOverrideDefinition } from '../../../../src/assistant/tools/deleteDateOverride';
import { deleteOneOffWindow, deleteOneOffWindowDefinition } from '../../../../src/assistant/tools/deleteOneOffWindow';
import { deletePattern, deletePatternDefinition } from '../../../../src/assistant/tools/deletePattern';
import { TOOLS } from '../../../../src/assistant/tools/list';
import { proposeChange, runRead } from '../../../../src/assistant/tools/run';
import { setDateOverride, setDateOverrideDefinition } from '../../../../src/assistant/tools/setDateOverride';
import { forClaude, isChange, offeredTo, type ChangeTool, type RouteAnswer, type ToolCall } from '../../../../src/assistant/tools/tool';
import { updatePattern, updatePatternDefinition } from '../../../../src/assistant/tools/updatePattern';
import { handler as getCalendarHandler } from '../../../../src/handlers/getCalendar';
import { handler as listTypesHandler } from '../../../../src/handlers/listAvailabilityTypes';
import { handler as listPatternsHandler } from '../../../../src/handlers/listPatterns';

// The Administrator's tools that change the opening hours. The routes they read through are
// replaced by `route`, the function a confirmation is given to call a route with: no handler runs
// and nothing is read. "Now" is Saturday 21 November 2026 in Europe/Rome, as the calendar's view
// states it; the day the tests change is Tuesday 24.
const ZONE = 'Europe/Rome';
const ADMIN = { timeZone: ZONE, role: 'admin' as const };
const NOW = '2026-11-21T14:05:00.000Z';
const DAY = '2026-11-24';

const VISIT = '01JD00000000000000000TYPE1';
const CALL = '01JD00000000000000000TYPE2';
const NOBODY = '01JD00000000000000000TYPE9';
const MORNING = '01JD000000000000000000PAT1';
const AFTERNOON = '01JD000000000000000000PAT2';
const NO_PATTERN = '01JD000000000000000000PAT9';
const EXTRA = '01JD000000000000000000W1ND';
const NO_WINDOW = '01JD000000000000000000W9ND';
const STAMP = '2026-11-01T10:00:00.000Z';

const type = (typeId: string, name: string) => ({ typeId, name, createdAt: STAMP, updatedAt: STAMP });
const TYPES = { status: 200, body: { types: [type(CALL, 'Phone call'), type(VISIT, 'Visit')] } };
const pattern = (patternId: string, start: string, end: string, over: Record<string, unknown> = {}) => ({
  patternId,
  weekday: 2,
  start,
  end,
  typeId: VISIT,
  validFrom: '2026-11-02',
  validUntil: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
});
const PATTERNS = { status: 200, body: { patterns: [pattern(MORNING, '09:00', '12:00'), pattern(AFTERNOON, '14:00', '18:00')] } };
const FAILED = { status: 500, body: null };
const FORBIDDEN = { status: 403, body: { error: 'forbidden', message: 'Admins only' } };

// A window of the day as GET /calendar answers the Administrator: instants, the type, the source.
const window = (start: string, end: string, source: 'pattern' | 'override' | 'one_off', sourceId: string, typeId = VISIT) => ({
  start: toInstant(DAY, start, ZONE),
  end: toInstant(DAY, end, ZONE),
  typeId,
  typeName: typeId === VISIT ? 'Visit' : 'Phone call',
  source,
  sourceId,
});
const view = (hasOverride: boolean, windows: ReturnType<typeof window>[], date = DAY) => ({
  status: 200,
  body: { timeZone: ZONE, from: date, to: date, generatedAt: NOW, days: [{ date, weekday: 2, windows, slots: [], busy: [], hasOverride }], appointments: [] },
});
// The day as the two patterns give it, the same day with hours of its own, the day closed, and
// each with the extra window of the evening.
const OF_PATTERNS = view(false, [window('09:00', '12:00', 'pattern', MORNING), window('14:00', '18:00', 'pattern', AFTERNOON)]);
const OVERRIDDEN = view(true, [window('09:00', '12:00', 'override', DAY), window('16:00', '18:00', 'override', DAY)]);
const CLOSED = view(true, []);
const EVENING = window('19:00', '20:00', 'one_off', EXTRA, CALL);
const WITH_EXTRA = view(false, [...OF_PATTERNS.body.days[0]!.windows, EVENING]);
const CLOSED_WITH_EXTRA = view(true, [EVENING]);

const route = vi.fn<(handler: unknown, call: ToolCall) => Promise<RouteAnswer>>();
// What each read route answers in a test, by its route key.
const answers = (day: RouteAnswer, patterns: RouteAnswer = PATTERNS, types: RouteAnswer = TYPES) =>
  route.mockImplementation((_handler, call) => Promise.resolve(call.routeKey === 'GET /calendar' ? day : call.routeKey === 'GET /calendar/patterns' ? patterns : types));
const routesAsked = () => route.mock.calls.map(([, call]) => call.routeKey);

const reading = <Facts>(tool: unknown) => {
  const change = tool as ChangeTool<Record<string, unknown>, Facts>;
  return { change, read: (input: Record<string, unknown>) => change.confirmation.read(input, ADMIN, route) };
};

const VISIT_MORNING = { start: '09:00', end: '12:00', type: 'Visit' };
const VISIT_AFTERNOON = { start: '14:00', end: '18:00', type: 'Visit' };
const VISIT_LATE = { start: '16:00', end: '18:00', type: 'Visit' };
const CALL_EVENING = { start: '19:00', end: '20:00', type: 'Phone call' };

beforeEach(() => {
  vi.resetAllMocks();
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the seven tools of the opening hours and the roles (3, 7.4)', () => {
  const SEVEN = ['create_pattern', 'update_pattern', 'delete_pattern', 'set_date_override', 'delete_date_override', 'create_one_off_window', 'delete_one_off_window'];
  const definitions = [
    createPatternDefinition,
    updatePatternDefinition,
    deletePatternDefinition,
    setDateOverrideDefinition,
    deleteDateOverrideDefinition,
    createOneOffWindowDefinition,
    deleteOneOffWindowDefinition,
  ];

  it('each is a change offered to the Administrator alone, holds no handler of a route that changes, and says that calling it changes nothing by itself', () => {
    expect(definitions.map((definition) => definition.name)).toEqual(SEVEN);
    for (const definition of definitions) {
      expect(definition).toMatchObject({ kind: 'change', roles: ['admin'] });
      expect(definition.description).toContain('nothing by itself');
      expect(definition.description).toContain('presses the confirm button');
    }
    for (const tool of [createPattern, updatePattern, deletePattern, setDateOverride, deleteDateOverride, createOneOffWindow, deleteOneOffWindow]) {
      expect(isChange(tool)).toBe(true);
      expect(tool).not.toHaveProperty('toHandler');
    }
    expect(offeredTo(definitions, 'user')).toEqual([]);
    expect(definitions.slice(0, 3).map((definition) => definition.reads)).toEqual(['patterns', 'patterns', 'patterns']);
    expect(definitions.slice(3).map((definition) => definition.reads)).toEqual(['calendar', 'calendar', 'calendar', 'calendar']);
  });

  it.each(SEVEN)('a User who names %s is answered as for a tool that does not exist: nothing is read and no handler is called', async (name) => {
    const user = { sub: 'sub-alice', username: 'alice', role: 'user' as const, requestId: 'req-1' };
    const tool = TOOLS.find((candidate) => candidate.definition.name === name) as ChangeTool;
    const read = vi.spyOn(tool.confirmation, 'read');
    const request = { id: 'toolu_1', name, input: { date: DAY, windows: [] } };

    const proposed = await proposeChange(request, TOOLS, user, { timeZone: ZONE, role: 'user' }, ASSISTANT_TEXTS_EN, NOW);
    expect(proposed).toMatchObject({ ok: false, outcome: { log: { name, notRun: 'not_offered' }, result: { is_error: true } } });
    const told = JSON.parse((proposed as { outcome: { result: { content: string } } }).outcome.result.content) as { error: string; message: string };
    expect(told.error).toBe('unknown_tool');
    expect(told.message).not.toContain(name);
    expect(await runRead(request, TOOLS, user, { timeZone: ZONE, role: 'user' }, NOW)).toMatchObject({ log: { name, notRun: 'not_offered' } });
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('create_pattern (3, 5.5 rule 2, 8.2)', () => {
  const { change, read } = reading<PatternSummary>(createPattern);
  const input = createPatternDefinition.input('admin');
  const ASKED = { weekday: 'Tuesday', start: '09:00', end: '12:00', typeId: VISIT, validFrom: '2026-12-01' };

  it('takes a weekday as a word, hours on the 5-minute step that may end at 24:00, the id of a type and the dates; the last date may be left out', () => {
    const schema = forClaude(createPatternDefinition, 'admin').input_schema;
    expect(Object.keys(schema.properties as object)).toEqual(['weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil']);
    expect(schema.required).toEqual(['weekday', 'start', 'end', 'typeId', 'validFrom']);
    expect((schema.properties as Record<string, { enum?: string[] }>).weekday?.enum).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    expect(schema.additionalProperties).toBe(false);
    expect(input.safeParse(ASKED).success).toBe(true);
    expect(input.safeParse({ ...ASKED, end: '24:00', validUntil: '2026-12-01' }).success).toBe(true);
    expect(input.safeParse({ ...ASKED, validUntil: null }).success).toBe(true);
    expect(input.safeParse({ ...ASKED, start: '09:05', end: '12:05' }).success).toBe(true);
  });

  it('Claude is told the step of the hours in words, with the pattern of every minute allowed (D32 of docs/SHARED_CALENDAR_SPEC.md)', () => {
    const properties = forClaude(createPatternDefinition, 'admin').input_schema.properties as Record<string, { description: string; pattern?: string; anyOf?: { pattern?: string }[] }>;
    expect(properties.start!.description).toBe(`When the hours start: a wall-clock time as HH:mm, on a ${TIME_STEP_MINUTES}-minute step (minutes 00, 05, 10 and so on up to 55).`);
    expect(properties.end!.description).toBe(
      'When the hours end, as HH:mm: a whole number of hours after "start", so with the same minutes as "start" (09:05 to 11:05), or "24:00" for the midnight that closes the day when "start" is on the hour.',
    );
    expect(properties.start!.pattern).toContain('00|05|10|15|20|25|30|35|40|45|50|55');
    expect(JSON.stringify(properties)).not.toContain('quarter');
  });

  it.each([
    ['a weekday as a number', { weekday: 2 }],
    ['a weekday in Italian', { weekday: 'martedì' }],
    ['a start off the 5-minute step', { start: '09:07' }],
    ['an end off the 5-minute step', { end: '11:58' }],
    ['a start at 24:00', { start: '24:00' }],
    ['an end that is not after the start', { end: '09:00' }],
    ['the name of a type', { typeId: 'Visit' }],
    ['a date that does not exist', { validFrom: '2027-02-29' }],
    ['a last date before the first', { validUntil: '2026-11-30' }],
    ['a field the route does not have', { note: 'x' }],
  ])('the schema refuses %s', (_what, over) => {
    expect(input.safeParse({ ...ASKED, ...over }).success).toBe(false);
  });

  it('reads the types alone, and sends the route the weekday as its number and a pattern with no end as null', async () => {
    answers(OF_PATTERNS);
    expect(await read(ASKED)).toEqual({
      ok: true,
      call: { routeKey: 'POST /calendar/patterns', path: '/calendar/patterns', body: { weekday: 2, start: '09:00', end: '12:00', typeId: VISIT, validFrom: '2026-12-01', validUntil: null } },
      subjects: ['new pattern 2 09:00-12:00 2026-12-01 '],
      facts: { weekday: 2, start: '09:00', end: '12:00', type: 'Visit', validFrom: '2026-12-01', validUntil: null },
    });
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(listTypesHandler, { routeKey: 'GET /calendar/types', path: '/calendar/types' });
  });

  it('a pattern that ends, on a Sunday, to midnight', async () => {
    answers(OF_PATTERNS);
    expect(await read({ ...ASKED, weekday: 'Sunday', end: '24:00', validUntil: '2026-12-31' })).toMatchObject({
      call: { body: { weekday: 7, end: '24:00', validUntil: '2026-12-31' } },
      subjects: ['new pattern 7 09:00-24:00 2026-12-01 2026-12-31'],
      facts: { weekday: 7, end: '24:00', validUntil: '2026-12-31' },
    });
  });

  it('no proposal for a type that does not exist, nor when the types cannot be read', async () => {
    answers(OF_PATTERNS);
    expect(await read({ ...ASKED, typeId: NOBODY })).toMatchObject({ ok: false, error: 'type_not_found' });
    answers(OF_PATTERNS, PATTERNS, FAILED);
    expect(await read(ASKED)).toEqual({ ok: false, error: 'internal_error', message: 'The appointment types could not be read.' });
  });

  it('the summary is the fixed text of the language, and Claude is given the new pattern with its id', () => {
    const facts = { weekday: 2, start: '09:00', end: '12:00', type: 'Visit', validFrom: '2026-12-01', validUntil: null };
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe('Create a weekly pattern: every Tuesday, from 09:00 to 12:00 (Visit), valid from Tuesday 1 December 2026, with no end.');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toBe('Creare un orario settimanale: ogni martedì, dalle 09:00 alle 12:00 (Visit), valido da martedì 1 dicembre 2026, senza scadenza.');
    expect(change.toModel(pattern(MORNING, '09:00', '12:00'), ADMIN)).toEqual({
      fields: { pattern: { id: MORNING, weekday: 'Tuesday', start: '09:00', end: '12:00', validFrom: '2026-11-02', validUntil: null } },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('update_pattern (3, 5.5 rule 2, 8.2)', () => {
  const { change, read } = reading<{ from: PatternSummary; to: PatternSummary }>(updatePattern);
  const input = updatePatternDefinition.input('admin');
  const ASKED = { patternId: MORNING, weekday: 'Tuesday', start: '10:00', end: '12:00', typeId: VISIT, validFrom: '2026-11-02', validUntil: null };

  it('takes the id and the whole pattern: the last date must be given, a date or null', () => {
    const schema = forClaude(updatePatternDefinition, 'admin').input_schema;
    expect(schema.required).toEqual(['patternId', 'weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil']);
    expect(input.safeParse(ASKED).success).toBe(true);
    expect(input.safeParse({ ...ASKED, validUntil: undefined }).success).toBe(false);
    expect(input.safeParse({ ...ASKED, patternId: 'the morning one' }).success).toBe(false);
    expect(input.safeParse({ ...ASKED, end: '10:00' }).success).toBe(false);
    expect(input.safeParse({ ...ASKED, validUntil: '2026-11-01' }).success).toBe(false);
  });

  it('reads the patterns and the types, and shows the pattern as it is and as it would become', async () => {
    answers(OF_PATTERNS);
    expect(await read({ ...ASKED, typeId: CALL, validUntil: '2026-12-31' })).toEqual({
      ok: true,
      call: {
        routeKey: 'PUT /calendar/patterns/{patternId}',
        path: `/calendar/patterns/${MORNING}`,
        pathParameters: { patternId: MORNING },
        body: { weekday: 2, start: '10:00', end: '12:00', typeId: CALL, validFrom: '2026-11-02', validUntil: '2026-12-31' },
      },
      subjects: [`pattern ${MORNING}`],
      facts: {
        from: { weekday: 2, start: '09:00', end: '12:00', type: 'Visit', validFrom: '2026-11-02', validUntil: null },
        to: { weekday: 2, start: '10:00', end: '12:00', type: 'Phone call', validFrom: '2026-11-02', validUntil: '2026-12-31' },
      },
    });
    expect(route).toHaveBeenCalledWith(listPatternsHandler, { routeKey: 'GET /calendar/patterns', path: '/calendar/patterns' });
    expect(routesAsked()).toEqual(['GET /calendar/patterns', 'GET /calendar/types']);
  });

  it.each([
    ['an id that names no pattern', { patternId: NO_PATTERN }, 'pattern_not_found'],
    ['a pattern that would stay exactly as it is', { start: '09:00' }, 'pattern_unchanged'],
    ['a type that does not exist', { typeId: NOBODY }, 'type_not_found'],
  ])('no proposal for %s', async (_what, over, error) => {
    answers(OF_PATTERNS);
    expect(await read({ ...ASKED, ...over })).toMatchObject({ ok: false, error });
  });

  it('no proposal when the patterns or the types cannot be read, nor when the type the pattern has is not among the types', async () => {
    answers(OF_PATTERNS, FORBIDDEN);
    expect(await read(ASKED)).toEqual({ ok: false, error: 'forbidden', message: 'Admins only' });
    answers(OF_PATTERNS, FAILED);
    expect(await read(ASKED)).toEqual({ ok: false, error: 'internal_error', message: 'The weekly patterns could not be read.' });
    answers(OF_PATTERNS, PATTERNS, FAILED);
    expect(await read(ASKED)).toMatchObject({ ok: false, error: 'internal_error' });
    answers(OF_PATTERNS, { status: 200, body: { patterns: [pattern(MORNING, '09:00', '12:00', { typeId: NOBODY })] } });
    expect(await read(ASKED)).toMatchObject({ ok: false, error: 'type_not_found' });
  });

  it('the summary is the fixed text of the language, and Claude is given the pattern as saved', () => {
    const facts = {
      from: { weekday: 2, start: '09:00', end: '12:00', type: 'Visit', validFrom: '2026-11-02', validUntil: null },
      to: { weekday: 2, start: '10:00', end: '12:00', type: 'Visit', validFrom: '2026-11-02', validUntil: null },
    };
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe(
      'Change a weekly pattern. As it is now: every Tuesday, from 09:00 to 12:00 (Visit), valid from Monday 2 November 2026, with no end. ' +
        'As it would become: every Tuesday, from 10:00 to 12:00 (Visit), valid from Monday 2 November 2026, with no end.',
    );
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toContain("Com'è ora: ogni martedì, dalle 09:00 alle 12:00 (Visit)");
    expect(change.toModel(pattern(MORNING, '10:00', '12:00', { weekday: 7 }), ADMIN)).toEqual({
      fields: { pattern: { id: MORNING, weekday: 'Sunday', start: '10:00', end: '12:00', validFrom: '2026-11-02', validUntil: null } },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('delete_pattern (3, 5.5 rule 2)', () => {
  const { change, read } = reading<PatternSummary>(deletePattern);

  it('takes the id alone, finds the pattern among those read and names it', async () => {
    expect(forClaude(deletePatternDefinition, 'admin').input_schema.required).toEqual(['patternId']);
    answers(OF_PATTERNS);
    expect(await read({ patternId: AFTERNOON })).toEqual({
      ok: true,
      call: { routeKey: 'DELETE /calendar/patterns/{patternId}', path: `/calendar/patterns/${AFTERNOON}`, pathParameters: { patternId: AFTERNOON } },
      subjects: [`pattern ${AFTERNOON}`],
      facts: { weekday: 2, start: '14:00', end: '18:00', type: 'Visit', validFrom: '2026-11-02', validUntil: null },
    });
  });

  it('no proposal for an id that names no pattern, nor when the patterns or the types cannot be read, nor for a type that is not there', async () => {
    answers(OF_PATTERNS);
    const result = await read({ patternId: NO_PATTERN });
    expect(result).toMatchObject({ ok: false, error: 'pattern_not_found' });
    expect(result.ok === false && result.message).toContain('list_patterns');
    answers(OF_PATTERNS, FAILED);
    expect(await read({ patternId: AFTERNOON })).toMatchObject({ ok: false, error: 'internal_error' });
    answers(OF_PATTERNS, PATTERNS, FAILED);
    expect(await read({ patternId: AFTERNOON })).toMatchObject({ ok: false, error: 'internal_error' });
    answers(OF_PATTERNS, PATTERNS, { status: 200, body: { types: [] } });
    expect(await read({ patternId: AFTERNOON })).toMatchObject({ ok: false, error: 'type_not_found' });
  });

  it('the summary is the fixed text of the language, and Claude is told the pattern was deleted', () => {
    const facts = { weekday: 2, start: '14:00', end: '18:00', type: 'Visit', validFrom: '2026-11-02', validUntil: '2026-12-31' };
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe('Delete the weekly pattern: every Tuesday, from 14:00 to 18:00 (Visit), valid from Monday 2 November 2026 until Thursday 31 December 2026.');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toBe("Eliminare l'orario settimanale: ogni martedì, dalle 14:00 alle 18:00 (Visit), valido da lunedì 2 novembre 2026 fino a giovedì 31 dicembre 2026.");
    expect(change.toModel(null, ADMIN)).toEqual({ fields: { deleted: true } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('set_date_override (3, 5.5 rule 2, 8.2)', () => {
  const { change, read } = reading<DayChangeSummary>(setDateOverride);
  const input = setDateOverrideDefinition.input('admin');
  // The afternoon blocked from 14:00 to 16:00: what is left of the day.
  const LEFT = [
    { start: '09:00', end: '12:00', typeId: VISIT },
    { start: '16:00', end: '18:00', typeId: VISIT },
  ];

  it('takes a date and a list of none to ten stretches of hours, each with the id of its type', () => {
    const schema = forClaude(setDateOverrideDefinition, 'admin').input_schema;
    expect(schema.required).toEqual(['date', 'windows']);
    expect((schema.properties as Record<string, { maxItems?: number }>).windows?.maxItems).toBe(10);
    expect(input.safeParse({ date: DAY, windows: LEFT }).success).toBe(true);
    expect(input.safeParse({ date: DAY, windows: [] }).success).toBe(true);
    expect(input.safeParse({ date: DAY }).success).toBe(false);
    expect(input.safeParse({ date: DAY, windows: Array(11).fill(LEFT[0]) }).success).toBe(false);
    expect(input.safeParse({ date: DAY, windows: [{ start: '12:00', end: '09:00', typeId: VISIT }] }).success).toBe(false);
    expect(input.safeParse({ date: DAY, windows: [{ start: '09:00', end: '12:00', type: 'Visit' }] }).success).toBe(false);
  });

  it('a day of patterns: reads the day and the types, shows the day as the patterns give it and as it would become, and sends the route the hours sorted', async () => {
    answers(OF_PATTERNS);
    expect(await read({ date: DAY, windows: [LEFT[1], LEFT[0]] })).toEqual({
      ok: true,
      call: { routeKey: 'PUT /calendar/overrides/{date}', path: `/calendar/overrides/${DAY}`, pathParameters: { date: DAY }, body: { windows: LEFT } },
      subjects: [`override ${DAY}`],
      facts: { date: DAY, now: { from: 'patterns', windows: [VISIT_MORNING, VISIT_AFTERNOON] }, then: { from: 'own', windows: [VISIT_MORNING, VISIT_LATE] }, extras: [] },
    });
    expect(route).toHaveBeenCalledWith(getCalendarHandler, { routeKey: 'GET /calendar', path: '/calendar', query: { from: DAY, to: DAY } });
    expect(routesAsked()).toEqual(['GET /calendar', 'GET /calendar/types']);
  });

  it('a day already overridden: the day as it is holds its own hours', async () => {
    answers(OVERRIDDEN);
    expect(await read({ date: DAY, windows: [{ start: '09:00', end: '11:00', typeId: CALL }] })).toMatchObject({
      ok: true,
      facts: { now: { from: 'own', windows: [VISIT_MORNING, VISIT_LATE] }, then: { from: 'own', windows: [{ start: '09:00', end: '11:00', type: 'Phone call' }] }, extras: [] },
    });
  });

  it('a day closed: it is shown as having no hours of its own, and is opened by giving some', async () => {
    answers(CLOSED);
    expect(await read({ date: DAY, windows: LEFT })).toMatchObject({ ok: true, facts: { now: { from: 'own', windows: [] }, then: { from: 'own', windows: [VISIT_MORNING, VISIT_LATE] } } });
  });

  it('an empty list closes the day: the route is sent no hours, and the day would have none', async () => {
    answers(OF_PATTERNS);
    expect(await read({ date: DAY, windows: [] })).toMatchObject({
      ok: true,
      call: { body: { windows: [] } },
      facts: { now: { from: 'patterns', windows: [VISIT_MORNING, VISIT_AFTERNOON] }, then: { from: 'own', windows: [] }, extras: [] },
    });
  });

  it('a day with an extra window: the window is in neither list of hours, and is named apart as what stays', async () => {
    answers(WITH_EXTRA);
    expect(await read({ date: DAY, windows: [] })).toMatchObject({
      ok: true,
      facts: { now: { from: 'patterns', windows: [VISIT_MORNING, VISIT_AFTERNOON] }, then: { from: 'own', windows: [] }, extras: [CALL_EVENING] },
    });
    answers(CLOSED_WITH_EXTRA);
    expect(await read({ date: DAY, windows: LEFT })).toMatchObject({ ok: true, facts: { now: { from: 'own', windows: [] }, extras: [CALL_EVENING] } });
  });

  it('a day the calendar gives no hours to is shown as having none from the patterns', async () => {
    answers({ status: 200, body: { ...OF_PATTERNS.body, days: [] } });
    expect(await read({ date: DAY, windows: LEFT })).toMatchObject({ ok: true, facts: { now: { from: 'patterns', windows: [] } } });
  });

  it('no proposal for two stretches that overlap, found before anything is read; two that touch are fine', async () => {
    answers(OF_PATTERNS);
    const overlapping = await read({
      date: DAY,
      windows: [
        { start: '10:00', end: '12:00', typeId: VISIT },
        { start: '09:00', end: '10:15', typeId: CALL },
      ],
    });
    expect(overlapping).toMatchObject({ ok: false, error: 'availability_overlap' });
    expect(route).not.toHaveBeenCalled();
    const touching = await read({
      date: DAY,
      windows: [
        { start: '09:00', end: '10:00', typeId: VISIT },
        { start: '10:00', end: '12:00', typeId: CALL },
      ],
    });
    expect(touching.ok).toBe(true);
  });

  it.each([
    ['a date in the past', OF_PATTERNS, { date: '2026-11-20', windows: LEFT }, 'date_in_past'],
    ['a type that does not exist', OF_PATTERNS, { date: DAY, windows: [{ start: '09:00', end: '12:00', typeId: NOBODY }] }, 'type_not_found'],
    ['hours equal to those the date has of its own', OVERRIDDEN, { date: DAY, windows: LEFT }, 'override_unchanged'],
    ['no hours for a day that is closed already', CLOSED, { date: DAY, windows: [] }, 'override_unchanged'],
  ])('no proposal for %s', async (_what, day, asked, error) => {
    answers(day);
    expect(await read(asked)).toMatchObject({ ok: false, error });
  });

  it('today is not the past, and hours equal to those the patterns give are still a change: the day gets hours of its own', async () => {
    answers(view(false, [], '2026-11-21'));
    expect((await read({ date: '2026-11-21', windows: [] })).ok).toBe(true);
    answers(OF_PATTERNS);
    const same = [
      { start: '09:00', end: '12:00', typeId: VISIT },
      { start: '14:00', end: '18:00', typeId: VISIT },
    ];
    expect((await read({ date: DAY, windows: same })).ok).toBe(true);
    // The same hours for another type are a change of a day that has hours of its own too.
    answers(OVERRIDDEN);
    expect((await read({ date: DAY, windows: [LEFT[0], { ...LEFT[1], typeId: CALL }] })).ok).toBe(true);
  });

  it('no proposal when the day or the types cannot be read', async () => {
    answers(FORBIDDEN);
    expect(await read({ date: DAY, windows: LEFT })).toEqual({ ok: false, error: 'forbidden', message: 'Admins only' });
    answers(FAILED);
    expect(await read({ date: DAY, windows: LEFT })).toEqual({ ok: false, error: 'internal_error', message: 'The calendar could not be read.' });
    answers(OF_PATTERNS, PATTERNS, FAILED);
    expect(await read({ date: DAY, windows: LEFT })).toMatchObject({ ok: false, error: 'internal_error' });
  });

  it('the summary is the fixed text of the language, and Claude is given the date and its own hours as saved', () => {
    const facts: DayChangeSummary = { date: DAY, now: { from: 'patterns', windows: [VISIT_MORNING, VISIT_AFTERNOON] }, then: { from: 'own', windows: [VISIT_MORNING, VISIT_LATE] }, extras: [] };
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe(
      'Set the hours of Tuesday 24 November 2026, for this day only. As it is now (from the weekly patterns): 09:00–12:00 (Visit), 14:00–18:00 (Visit). ' +
        'As it would become: 09:00–12:00 (Visit), 16:00–18:00 (Visit).',
    );
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toContain('Come diventerebbe: 09:00–12:00 (Visit), 16:00–18:00 (Visit).');
    expect(change.toModel({ date: DAY, windows: LEFT, updatedAt: STAMP }, ADMIN)).toEqual({
      fields: {
        date: DAY,
        hoursOfItsOwn: [
          { start: '09:00', end: '12:00' },
          { start: '16:00', end: '18:00' },
        ],
      },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('delete_date_override (3, 5.5 rule 2)', () => {
  const { change, read } = reading<DayChangeSummary>(deleteDateOverride);

  it('reads the day, the patterns and the types, and shows the hours the day has of its own and those the patterns of that weekday would give it', async () => {
    // A pattern of another weekday, one that has ended and one still to start give the day nothing.
    const patterns = {
      status: 200,
      body: {
        patterns: [
          ...PATTERNS.body.patterns,
          pattern('01JD000000000000000000PAT3', '07:00', '08:00', { weekday: 3 }),
          pattern('01JD000000000000000000PAT4', '07:00', '08:00', { validUntil: '2026-11-23' }),
          pattern('01JD000000000000000000PAT5', '07:00', '08:00', { validFrom: '2026-11-25' }),
        ],
      },
    };
    answers(view(true, [window('09:00', '12:00', 'override', DAY), EVENING]), patterns);
    expect(await read({ date: DAY })).toEqual({
      ok: true,
      call: { routeKey: 'DELETE /calendar/overrides/{date}', path: `/calendar/overrides/${DAY}`, pathParameters: { date: DAY } },
      subjects: [`override ${DAY}`],
      facts: { date: DAY, now: { from: 'own', windows: [VISIT_MORNING] }, then: { from: 'patterns', windows: [VISIT_MORNING, VISIT_AFTERNOON] }, extras: [CALL_EVENING] },
    });
    expect(routesAsked()).toEqual(['GET /calendar', 'GET /calendar/patterns', 'GET /calendar/types']);
  });

  it('a closed day whose weekday has no pattern goes back to no hours', async () => {
    answers(CLOSED, { status: 200, body: { patterns: [] } });
    expect(await read({ date: DAY })).toMatchObject({ ok: true, facts: { now: { from: 'own', windows: [] }, then: { from: 'patterns', windows: [] } } });
  });

  it('no proposal for a date without hours of its own, nor for a date in the past: the codes of the route', async () => {
    answers(OF_PATTERNS);
    expect(await read({ date: DAY })).toMatchObject({ ok: false, error: 'override_not_found' });
    expect(routesAsked()).toEqual(['GET /calendar']);
    answers(OVERRIDDEN);
    expect(await read({ date: '2026-11-20' })).toMatchObject({ ok: false, error: 'date_in_past' });
  });

  it('no proposal when the day, the patterns or the types cannot be read, nor when a pattern names a type that is not there', async () => {
    answers(FAILED);
    expect(await read({ date: DAY })).toMatchObject({ ok: false, error: 'internal_error' });
    answers(CLOSED, FAILED);
    expect(await read({ date: DAY })).toEqual({ ok: false, error: 'internal_error', message: 'The weekly patterns could not be read.' });
    answers(CLOSED, PATTERNS, FAILED);
    expect(await read({ date: DAY })).toMatchObject({ ok: false, error: 'internal_error' });
    answers(CLOSED, PATTERNS, { status: 200, body: { types: [] } });
    expect(await read({ date: DAY })).toMatchObject({ ok: false, error: 'type_not_found' });
  });

  it('the summary is the fixed text of the language, and Claude is told the hours were taken away', () => {
    const facts: DayChangeSummary = { date: DAY, now: { from: 'own', windows: [] }, then: { from: 'patterns', windows: [VISIT_MORNING, VISIT_AFTERNOON] }, extras: [] };
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe(
      "Go back to the weekly patterns on Tuesday 24 November 2026. As it is now (this day's own hours): not available. " +
        'As it would become (from the weekly patterns): 09:00–12:00 (Visit), 14:00–18:00 (Visit).',
    );
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toContain('Tornare agli orari settimanali per martedì 24 novembre 2026.');
    expect(change.toModel(null, ADMIN)).toEqual({ fields: { deleted: true } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('create_one_off_window (3, 5.5 rule 2)', () => {
  const { change, read } = reading<WindowSummary>(createOneOffWindow);
  const input = createOneOffWindowDefinition.input('admin');
  const ASKED = { date: DAY, start: '19:00', end: '20:00', typeId: CALL };

  it('takes a date, hours and the id of a type', () => {
    expect(forClaude(createOneOffWindowDefinition, 'admin').input_schema.required).toEqual(['date', 'start', 'end', 'typeId']);
    expect(input.safeParse(ASKED).success).toBe(true);
    expect(input.safeParse({ ...ASKED, end: '24:00' }).success).toBe(true);
    expect(input.safeParse({ ...ASKED, end: '19:00' }).success).toBe(false);
    expect(input.safeParse({ ...ASKED, start: '19:07' }).success).toBe(false);
    expect(input.safeParse({ ...ASKED, start: '19:05', end: '20:05' }).success).toBe(true);
    expect(input.safeParse({ ...ASKED, weekday: 'Tuesday' }).success).toBe(false);
  });

  it('reads the day, to know its date has not passed, and the types, and sends the route the window as asked', async () => {
    answers(OF_PATTERNS);
    expect(await read(ASKED)).toEqual({
      ok: true,
      call: { routeKey: 'POST /calendar/windows', path: '/calendar/windows', body: ASKED },
      subjects: [`new window ${DAY} 19:00-20:00`],
      facts: { date: DAY, ...CALL_EVENING },
    });
    expect(routesAsked()).toEqual(['GET /calendar', 'GET /calendar/types']);
  });

  it('no proposal for a date in the past, a type that does not exist, or when the day or the types cannot be read', async () => {
    answers(OF_PATTERNS);
    expect(await read({ ...ASKED, date: '2026-11-20' })).toMatchObject({ ok: false, error: 'date_in_past' });
    expect(await read({ ...ASKED, typeId: NOBODY })).toMatchObject({ ok: false, error: 'type_not_found' });
    answers(FAILED);
    expect(await read(ASKED)).toMatchObject({ ok: false, error: 'internal_error' });
    answers(OF_PATTERNS, PATTERNS, FORBIDDEN);
    expect(await read(ASKED)).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('the summary is the fixed text of the language, and Claude is given the new window with its id', () => {
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, { date: DAY, ...CALL_EVENING })).toBe('Create an extra window on Tuesday 24 November 2026, from 19:00 to 20:00 (Phone call).');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, { date: DAY, ...CALL_EVENING })).toBe('Creare una finestra aggiuntiva per martedì 24 novembre 2026, dalle 19:00 alle 20:00 (Phone call).');
    expect(change.toModel({ windowId: EXTRA, ...ASKED, createdAt: STAMP }, ADMIN)).toEqual({ fields: { window: { id: EXTRA, date: DAY, start: '19:00', end: '20:00' } } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('delete_one_off_window (3, 5.5 rule 2)', () => {
  const { change, read } = reading<WindowSummary>(deleteOneOffWindow);

  it('takes the date and the id, finds the extra window among those of its day and names it', async () => {
    expect(forClaude(deleteOneOffWindowDefinition, 'admin').input_schema.required).toEqual(['date', 'windowId']);
    answers(WITH_EXTRA);
    expect(await read({ date: DAY, windowId: EXTRA })).toEqual({
      ok: true,
      call: { routeKey: 'DELETE /calendar/windows/{windowId}', path: `/calendar/windows/${EXTRA}`, pathParameters: { windowId: EXTRA } },
      subjects: [`window ${EXTRA}`],
      facts: { date: DAY, ...CALL_EVENING },
    });
    expect(routesAsked()).toEqual(['GET /calendar']);
  });

  it('no proposal for an id that names no extra window of that day (the id of a pattern is not one), a date in the past, or a day that cannot be read', async () => {
    answers(WITH_EXTRA);
    const result = await read({ date: DAY, windowId: NO_WINDOW });
    expect(result).toMatchObject({ ok: false, error: 'window_not_found' });
    expect(result.ok === false && result.message).toContain('get_calendar');
    expect(await read({ date: DAY, windowId: MORNING })).toMatchObject({ ok: false, error: 'window_not_found' });
    expect(await read({ date: '2026-11-20', windowId: EXTRA })).toMatchObject({ ok: false, error: 'date_in_past' });
    answers(FAILED);
    expect(await read({ date: DAY, windowId: EXTRA })).toMatchObject({ ok: false, error: 'internal_error' });
  });

  it('the summary is the fixed text of the language, and Claude is told the window was deleted', () => {
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, { date: DAY, ...CALL_EVENING })).toBe('Delete the extra window of Tuesday 24 November 2026, from 19:00 to 20:00 (Phone call).');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, { date: DAY, ...CALL_EVENING })).toBe('Eliminare la finestra aggiuntiva di martedì 24 novembre 2026, dalle 19:00 alle 20:00 (Phone call).');
    expect(change.toModel(null, ADMIN)).toEqual({ fields: { deleted: true } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md, D33 is a decision of
// docs/SHARED_CALENDAR_SPEC.md.
describe('the four tools that open hours take only whole hours (8.2, D33)', () => {
  const ADMIN_CALLER = { sub: 'sub-admin', username: 'admin', role: 'admin' as const, requestId: 'req-1' };
  // Each tool's input with the hours given, as Claude would ask for them.
  const FOUR: [string, (hours: { start: string; end: string }) => Record<string, unknown>][] = [
    ['create_pattern', (hours) => ({ weekday: 'Tuesday', ...hours, typeId: VISIT, validFrom: '2026-12-01' })],
    ['update_pattern', (hours) => ({ patternId: MORNING, weekday: 'Tuesday', ...hours, typeId: VISIT, validFrom: '2026-11-02', validUntil: null })],
    ['set_date_override', (hours) => ({ date: DAY, windows: [{ ...hours, typeId: VISIT }] })],
    ['create_one_off_window', (hours) => ({ date: DAY, ...hours, typeId: VISIT })],
  ];
  const tool = (name: string) => TOOLS.find((candidate) => candidate.definition.name === name) as ChangeTool;
  // What the proposal tells Claude when the input is refused, with nothing read.
  const refusedWith = async (name: string, input: Record<string, unknown>) => {
    const read = vi.spyOn(tool(name).confirmation, 'read');
    const proposed = await proposeChange({ id: 'toolu_1', name, input }, TOOLS, ADMIN_CALLER, ADMIN, ASSISTANT_TEXTS_EN, NOW);
    expect(proposed).toMatchObject({ ok: false, outcome: { log: { name, notRun: 'invalid_input' }, result: { is_error: true } } });
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
    // The problems found, without the JSON Schema that follows them.
    const { message } = JSON.parse((proposed as { outcome: { result: { content: string } } }).outcome.result.content) as { message: string };
    return message.split(' It must match this JSON Schema')[0]!;
  };

  it.each(FOUR)('%s takes 09:05-11:05, a whole number of hours from a 5-minute start', (name, input) => {
    expect(tool(name).definition.input('admin').safeParse(input({ start: '09:05', end: '11:05' })).success).toBe(true);
    expect(tool(name).definition.input('admin').safeParse(input({ start: '08:00', end: '24:00' })).success).toBe(true);
  });

  it.each(FOUR)('%s refuses 09:05-10:30 at the proposal with the shared sentence on end, having read nothing', async (name, input) => {
    const message = await refusedWith(name, input({ start: '09:05', end: '10:30' }));
    // One problem only, the shared sentence on the field end.
    expect(message).toMatch(/ \((windows\.0\.)?end: end must be a whole number of hours after start\)\.$/);
    expect(route).not.toHaveBeenCalled();
  });

  it.each(FOUR)('%s refuses 23:05-24:00: no window starts after 23:00', async (name, input) => {
    expect(await refusedWith(name, input({ start: '23:05', end: '24:00' }))).toContain('end must be a whole number of hours after start');
  });

  it.each(FOUR)('%s says an end not after the start once, by the order check', async (name, input) => {
    const message = await refusedWith(name, input({ start: '10:30', end: '09:05' }));
    expect(message).toContain('end must be after start');
    expect(message).not.toContain('whole number of hours');
  });
});
