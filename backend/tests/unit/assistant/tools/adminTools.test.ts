import { ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, type SettingsSummary } from '@shared-calendar/shared';
import { createType, createTypeDefinition } from '../../../../src/assistant/tools/createType';
import { deleteType, deleteTypeDefinition } from '../../../../src/assistant/tools/deleteType';
import { listPatterns, listPatternsDefinition } from '../../../../src/assistant/tools/listPatterns';
import { listUsers, listUsersDefinition } from '../../../../src/assistant/tools/listUsers';
import { renameType, renameTypeDefinition } from '../../../../src/assistant/tools/renameType';
import { forClaude, isChange, type ChangeTool, type RouteAnswer } from '../../../../src/assistant/tools/tool';
import { updateSettings, updateSettingsDefinition } from '../../../../src/assistant/tools/updateSettings';
import { handler as getSettingsHandler } from '../../../../src/handlers/getCalendarSettings';
import { handler as listTypesHandler } from '../../../../src/handlers/listAvailabilityTypes';
import { handler as listPatternsHandler } from '../../../../src/handlers/listPatterns';
import { handler as listUsersHandler } from '../../../../src/handlers/listUsers';

// The Administrator's tools. The routes they read through are replaced by `route`, the function a
// confirmation is given to call a route with: no handler runs and nothing is read.
const ADMIN = { timeZone: 'Europe/Rome', role: 'admin' as const };
const route = vi.fn<(handler: unknown, call: unknown) => Promise<RouteAnswer>>();

const VISIT = '01JD00000000000000000TYPE1';
const CHECKUP = '01JD00000000000000000TYPE2';
const NOBODY = '01JD00000000000000000TYPE9';
const type = (typeId: string, name: string) => ({ typeId, name, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' });
const TYPES = { status: 200, body: { types: [type(CHECKUP, 'Checkup'), type(VISIT, 'Visit')] } };
const SETTINGS = {
  status: 200,
  body: { timeZone: 'Europe/Rome', cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: '2026-11-01T10:00:00.000Z', updatedBy: { username: 'admin', role: 'admin' } },
};
const FAILED = { status: 500, body: null };
const FORBIDDEN = { status: 403, body: { error: 'forbidden', message: 'Admins only' } };

const reading = <Facts>(tool: unknown) => {
  const change = tool as ChangeTool<Record<string, unknown>, Facts>;
  return { change, read: (input: Record<string, unknown>) => change.confirmation.read(input, ADMIN, route) };
};

beforeEach(() => {
  vi.resetAllMocks();
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe("the Administrator's two reads (3, 8.3)", () => {
  it('list_users: for the Administrator only, no input, the usernames and nothing else of an account', () => {
    expect(listUsersDefinition).toMatchObject({ name: 'list_users', kind: 'read', roles: ['admin'], reads: 'users' });
    expect(forClaude(listUsersDefinition, 'admin').input_schema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    expect(listUsers.toHandler.handler).toBe(listUsersHandler);
    expect(listUsers.toHandler.request({}, ADMIN)).toEqual({ routeKey: 'GET /users', path: '/users' });
    const result = listUsers.toModel({ users: [{ username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' }, { username: 'bob', createdAt: '2026-11-02T10:00:00.000Z' }] }, ADMIN);
    expect(result).toEqual({ fields: {}, list: { name: 'users', items: ['alice', 'bob'] } });
  });

  it('list_patterns: for the Administrator only, reads the patterns and then the types, and gives each pattern with its id and the name of its type', () => {
    expect(listPatternsDefinition).toMatchObject({ name: 'list_patterns', kind: 'read', roles: ['admin'], reads: 'patterns' });
    expect(forClaude(listPatternsDefinition, 'admin').input_schema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
    expect(listPatterns.toHandler.handler).toBe(listPatternsHandler);
    expect(listPatterns.toHandler.request({}, ADMIN)).toEqual({ routeKey: 'GET /calendar/patterns', path: '/calendar/patterns' });
    expect(listPatterns.toHandler.also).toEqual({ handler: listTypesHandler, call: { routeKey: 'GET /calendar/types', path: '/calendar/types' } });

    const pattern = (patternId: string, weekday: number, typeId: string, validUntil: string | null) => ({
      patternId,
      weekday,
      start: '09:00',
      end: '24:00',
      typeId,
      validFrom: '2026-11-02',
      validUntil,
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    });
    const result = listPatterns.toModel({ patterns: [pattern('01JD000000000000000000PAT1', 1, VISIT, null), pattern('01JD000000000000000000PAT2', 7, NOBODY, '2026-12-31')] }, ADMIN, TYPES.body);
    expect(result).toEqual({
      fields: {},
      list: {
        name: 'patterns',
        items: [
          { id: '01JD000000000000000000PAT1', weekday: 'Monday', start: '09:00', end: '24:00', type: 'Visit', validFrom: '2026-11-02', validUntil: null },
          // A type that is not in the list has no name to give.
          { id: '01JD000000000000000000PAT2', weekday: 'Sunday', start: '09:00', end: '24:00', type: null, validFrom: '2026-11-02', validUntil: '2026-12-31' },
        ],
      },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('update_settings (3, 5.5 rule 2, 8.2)', () => {
  const { change, read } = reading<SettingsSummary>(updateSettings);
  const input = updateSettingsDefinition.input('admin');

  it('is a change for the Administrator only, and holds no handler of the route that saves', () => {
    expect(updateSettingsDefinition).toMatchObject({ name: 'update_settings', kind: 'change', roles: ['admin'], reads: 'settings' });
    expect(isChange(updateSettings)).toBe(true);
    expect(updateSettings).not.toHaveProperty('toHandler');
    expect(updateSettingsDefinition.description).toContain('changes nothing by itself');
    expect(updateSettingsDefinition.description).toContain('time zone is not a setting that can be changed');
  });

  it('takes any of the four settings, none of them required, and nothing else: not the time zone', () => {
    const schema = forClaude(updateSettingsDefinition, 'admin').input_schema;
    expect(Object.keys(schema.properties as object)).toEqual(['cancellationNoticeHours', 'minBookingNoticeHours', 'bookingHorizonDays', 'maxFutureAppointmentsPerUser']);
    expect(schema).not.toHaveProperty('required');
    expect(schema.additionalProperties).toBe(false);
    expect(input.safeParse({ cancellationNoticeHours: 72 }).success).toBe(true);
    expect(input.safeParse({ cancellationNoticeHours: 0, minBookingNoticeHours: 720, bookingHorizonDays: 365, maxFutureAppointmentsPerUser: null }).success).toBe(true);
    expect(input.safeParse({ timeZone: 'Europe/Paris' }).success).toBe(false);
    expect(input.safeParse({ cancellationNoticeHours: 72, timeZone: 'Europe/Paris' }).success).toBe(false);
  });

  it.each([
    ['no setting at all', {}],
    ['a notice above its range', { cancellationNoticeHours: 721 }],
    ['a notice below its range', { minBookingNoticeHours: -1 }],
    ['a horizon of no days', { bookingHorizonDays: 0 }],
    ['a limit above its range', { maxFutureAppointmentsPerUser: 101 }],
    ['a limit of no appointments', { maxFutureAppointmentsPerUser: 0 }],
    ['half an hour', { cancellationNoticeHours: 1.5 }],
    ['a number as text', { bookingHorizonDays: '40' }],
    ['no limit for a setting that must have a value', { bookingHorizonDays: null }],
  ])('the schema refuses %s', (_what, value) => {
    expect(input.safeParse(value).success).toBe(false);
  });

  it('reads the settings through the handler of GET /calendar/settings, sends the route all four, and shows only those that change, as they are and as they would become', async () => {
    route.mockResolvedValue(SETTINGS);
    const result = await read({ cancellationNoticeHours: 72, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 3 });

    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(getSettingsHandler, { routeKey: 'GET /calendar/settings', path: '/calendar/settings' });
    expect(result).toEqual({
      ok: true,
      call: {
        routeKey: 'PUT /calendar/settings',
        path: '/calendar/settings',
        body: { cancellationNoticeHours: 72, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 3 },
      },
      subjects: ['settings'],
      // The horizon was named with the value it has: it is not a change, and is not shown.
      facts: {
        changes: [
          { setting: 'cancellationNoticeHours', from: 24, to: 72 },
          { setting: 'maxFutureAppointmentsPerUser', from: null, to: 3 },
        ],
      },
    });
  });

  it('a limit is lifted with null', async () => {
    route.mockResolvedValue({ status: 200, body: { ...SETTINGS.body, maxFutureAppointmentsPerUser: 5 } });
    expect(await read({ maxFutureAppointmentsPerUser: null })).toMatchObject({
      call: { body: { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null } },
      facts: { changes: [{ setting: 'maxFutureAppointmentsPerUser', from: 5, to: null }] },
    });
  });

  it('no proposal when every setting named has the value it already has', async () => {
    route.mockResolvedValue(SETTINGS);
    expect(await read({ cancellationNoticeHours: 24, maxFutureAppointmentsPerUser: null })).toMatchObject({ ok: false, error: 'settings_unchanged' });
  });

  it('no proposal when the settings cannot be read: the refusal of the route, or a failure without one', async () => {
    route.mockResolvedValue(FORBIDDEN);
    expect(await read({ cancellationNoticeHours: 72 })).toEqual({ ok: false, error: 'forbidden', message: 'Admins only' });
    route.mockResolvedValue(FAILED);
    expect(await read({ cancellationNoticeHours: 72 })).toEqual({ ok: false, error: 'internal_error', message: 'The settings could not be read.' });
  });

  it('the summary is the fixed text of the language, and Claude is given the settings as saved', () => {
    const facts: SettingsSummary = { changes: [{ setting: 'cancellationNoticeHours', from: 24, to: 72 }] };
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, facts)).toBe('Change the settings. Cancellation notice: from 24 hours to 72 hours.');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, facts)).toBe("Modificare le impostazioni. Preavviso per l'annullamento: da 24 ore a 72 ore.");
    expect(change.toModel({ ...SETTINGS.body, cancellationNoticeHours: 72 }, ADMIN)).toEqual({
      fields: { settings: { timeZone: 'Europe/Rome', cancellationNoticeHours: 72, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null } },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('create_type (3, 5.5 rule 2)', () => {
  const { change, read } = reading<{ name: string }>(createType);

  it('is a change for the Administrator only: a name and nothing else', () => {
    expect(createTypeDefinition).toMatchObject({ name: 'create_type', kind: 'change', roles: ['admin'], reads: 'types' });
    expect(createType).not.toHaveProperty('toHandler');
    expect(createTypeDefinition.description).toContain('creates nothing by itself');
    const schema = forClaude(createTypeDefinition, 'admin').input_schema;
    expect(Object.keys(schema.properties as object)).toEqual(['name']);
    expect(schema.required).toEqual(['name']);
    expect(createTypeDefinition.input('admin').safeParse({ name: 'Phone call', typeId: VISIT }).success).toBe(false);
  });

  it('reads the types through the handler of GET /calendar/types and sends the route the name, trimmed', async () => {
    route.mockResolvedValue(TYPES);
    expect(await read({ name: '  Phone call ' })).toEqual({
      ok: true,
      call: { routeKey: 'POST /calendar/types', path: '/calendar/types', body: { name: 'Phone call' } },
      subjects: ['type name phone call'],
      facts: { name: 'Phone call' },
    });
    expect(route).toHaveBeenCalledWith(listTypesHandler, { routeKey: 'GET /calendar/types', path: '/calendar/types' });
  });

  it('no proposal for a name a type already has, whatever its capitals: the code of the route', async () => {
    route.mockResolvedValue(TYPES);
    expect(await read({ name: 'Visit' })).toMatchObject({ ok: false, error: 'type_name_exists' });
    expect(await read({ name: ' VISIT' })).toMatchObject({ ok: false, error: 'type_name_exists' });
  });

  it('a name the route would refuse is refused here, and the types are not read', async () => {
    for (const name of ['   ', 'x'.repeat(41), 'a\u0007b']) expect(await read({ name })).toMatchObject({ ok: false, error: 'invalid_name' });
    expect(route).not.toHaveBeenCalled();
  });

  it('no proposal when the types cannot be read', async () => {
    route.mockResolvedValue(FAILED);
    expect(await read({ name: 'Phone call' })).toEqual({ ok: false, error: 'internal_error', message: 'The appointment types could not be read.' });
  });

  it('the summary is the fixed text of the language, and Claude is given the new type with its id', () => {
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, { name: 'Phone call' })).toBe('Create the appointment type "Phone call".');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, { name: 'Phone call' })).toBe('Creare il tipo di appuntamento «Phone call».');
    expect(change.toModel(type(NOBODY, 'Phone call'), ADMIN)).toEqual({ fields: { type: { id: NOBODY, name: 'Phone call' } } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('rename_type (3, 5.5 rule 2)', () => {
  const { change, read } = reading<{ from: string; to: string }>(renameType);

  it('is a change for the Administrator only: the id of the type and its new name, never the old name', () => {
    expect(renameTypeDefinition).toMatchObject({ name: 'rename_type', kind: 'change', roles: ['admin'], reads: 'types' });
    expect(renameType).not.toHaveProperty('toHandler');
    expect(renameTypeDefinition.description).toContain('renames nothing by itself');
    const schema = forClaude(renameTypeDefinition, 'admin').input_schema;
    expect(schema.required).toEqual(['typeId', 'name']);
    expect(renameTypeDefinition.input('admin').safeParse({ typeId: 'Visit', name: 'Check-up' }).success).toBe(false);
  });

  it('finds the type among those read, and shows the name it has and the new one', async () => {
    route.mockResolvedValue(TYPES);
    expect(await read({ typeId: VISIT, name: ' Check-up ' })).toEqual({
      ok: true,
      call: { routeKey: 'PUT /calendar/types/{typeId}', path: `/calendar/types/${VISIT}`, pathParameters: { typeId: VISIT }, body: { name: 'Check-up' } },
      subjects: [`type ${VISIT}`, 'type name check-up'],
      facts: { from: 'Visit', to: 'Check-up' },
    });
  });

  it('the same name with other capitals is a rename, as the route takes it', async () => {
    route.mockResolvedValue(TYPES);
    expect(await read({ typeId: VISIT, name: 'VISIT' })).toMatchObject({ ok: true, facts: { from: 'Visit', to: 'VISIT' } });
  });

  it.each([
    ['an id that names no type', { typeId: NOBODY, name: 'Check-up' }, 'type_not_found'],
    ['the name the type has', { typeId: VISIT, name: ' Visit ' }, 'name_unchanged'],
    ["another type's name, whatever its capitals", { typeId: VISIT, name: 'checkup' }, 'type_name_exists'],
  ])('no proposal for %s', async (_what, given, error) => {
    route.mockResolvedValue(TYPES);
    expect(await read(given)).toMatchObject({ ok: false, error });
  });

  it('a name the route would refuse is refused here, and no proposal when the types cannot be read', async () => {
    expect(await read({ typeId: VISIT, name: '' })).toMatchObject({ ok: false, error: 'invalid_name' });
    expect(route).not.toHaveBeenCalled();
    route.mockResolvedValue(FORBIDDEN);
    expect(await read({ typeId: VISIT, name: 'Check-up' })).toEqual({ ok: false, error: 'forbidden', message: 'Admins only' });
  });

  it('the summary is the fixed text of the language, and Claude is given the type with its new name', () => {
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, { from: 'Visit', to: 'Check-up' })).toBe('Rename the appointment type "Visit" to "Check-up".');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, { from: 'Visit', to: 'Check-up' })).toBe('Rinominare il tipo di appuntamento «Visit» in «Check-up».');
    expect(change.toModel(type(VISIT, 'Check-up'), ADMIN)).toEqual({ fields: { type: { id: VISIT, name: 'Check-up' } } });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('delete_type (3, 5.5 rule 2)', () => {
  const { change, read } = reading<{ name: string }>(deleteType);

  it('is a change for the Administrator only: the id of the type, and the description says a type in use is refused at the confirmation', () => {
    expect(deleteTypeDefinition).toMatchObject({ name: 'delete_type', kind: 'change', roles: ['admin'], reads: 'types' });
    expect(deleteType).not.toHaveProperty('toHandler');
    expect(deleteTypeDefinition.description).toContain('deletes nothing by itself');
    expect(deleteTypeDefinition.description).toContain('still in use');
    expect(forClaude(deleteTypeDefinition, 'admin').input_schema.required).toEqual(['typeId']);
  });

  it('finds the type among those read and names it; whether it is in use is not looked at', async () => {
    route.mockResolvedValue(TYPES);
    expect(await read({ typeId: VISIT })).toEqual({
      ok: true,
      call: { routeKey: 'DELETE /calendar/types/{typeId}', path: `/calendar/types/${VISIT}`, pathParameters: { typeId: VISIT } },
      subjects: [`type ${VISIT}`],
      facts: { name: 'Visit' },
    });
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('no proposal for an id that names no type, nor when the types cannot be read', async () => {
    route.mockResolvedValue(TYPES);
    const result = await read({ typeId: NOBODY });
    expect(result).toMatchObject({ ok: false, error: 'type_not_found' });
    expect(result.ok === false && result.message).toContain('list_types');
    route.mockResolvedValue(FAILED);
    expect(await read({ typeId: VISIT })).toMatchObject({ ok: false, error: 'internal_error' });
  });

  it('the summary is the fixed text of the language, and Claude is told the type was deleted', () => {
    expect(change.confirmation.summary(ASSISTANT_TEXTS_EN, { name: 'Visit' })).toBe('Delete the appointment type "Visit".');
    expect(change.confirmation.summary(ASSISTANT_TEXTS_IT, { name: 'Visit' })).toBe('Eliminare il tipo di appuntamento «Visit».');
    // The route answers 204 without a body.
    expect(change.toModel(null, ADMIN)).toEqual({ fields: { deleted: true } });
  });
});
