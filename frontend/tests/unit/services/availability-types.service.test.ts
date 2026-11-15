import type { AvailabilityType } from '@shared-calendar/shared';
import { AvailabilityTypesService } from '../../../src/services/availability-types.service';
import { json } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 16.8: the per-method suite of suite.ts for the four methods.

const TYPE_ID = '01JCAAAAAAAAAAAAAAAAAAAAAA';
const STUDIO: AvailabilityType = { typeId: TYPE_ID, name: 'Studio', createdAt: '2026-11-15T09:00:00.000Z', updatedAt: '2026-11-15T09:00:00.000Z' };
const POOL: AvailabilityType = { ...STUDIO, typeId: '01JCBBBBBBBBBBBBBBBBBBBBBB', name: 'Swimming Pool' };
const TOO_LONG = 'x'.repeat(41);

type S = AvailabilityTypesService;
const make = (store: ConstructorParameters<typeof AvailabilityTypesService>[1]) => new AvailabilityTypesService(CONFIG, store);

const load: MethodSpec<S> = {
  name: 'load',
  result$: (s) => s.typesResult$,
  state$: (s) => s.typesState$,
  call: (s) => s.load(),
  pending: { status: 'pending' },
  request: { method: 'GET', path: '/calendar/types' },
  ok: () => json(200, { types: [STUDIO, POOL] }),
  success: { status: 'success', types: [STUDIO, POOL] },
  wrong: [
    ['200 without types', () => json(200, {})],
    ['types not an array', () => json(200, { types: STUDIO })],
    ['an element without typeId', () => json(200, { types: [STUDIO, { name: 'x' }] })],
    ['an element null', () => json(200, { types: [null] })],
    ['201', () => json(201, { types: [] })],
  ],
  codes: ['forbidden', 'internal_error'],
};

const create: MethodSpec<S> = {
  name: 'create',
  result$: (s) => s.createResult$,
  state$: (s) => s.createState$,
  call: (s) => s.create('  Studio  '),
  pending: { status: 'pending', name: '  Studio  ' },
  request: { method: 'POST', path: '/calendar/types', body: { name: 'Studio' } }, // zod's output: trimmed
  ok: () => json(201, STUDIO),
  success: { status: 'success', type: STUDIO },
  wrong: [
    ['200 instead of 201', () => json(200, STUDIO)],
    ['201 without typeId', () => json(201, { name: 'Studio' })],
  ],
  codes: ['forbidden', 'invalid_json', 'invalid_request', 'type_name_exists', 'limit_reached', 'concurrent_update', 'internal_error'],
  notCodes: ['type_not_found', 'type_in_use'],
  invalid: [
    ['empty after trimming', (s) => s.create('   '), 'name: 1 to 40 characters'],
    ['41 characters', (s) => s.create(TOO_LONG), 'name: 1 to 40 characters'],
    ['a control character', (s) => s.create('Stu\u0007dio'), 'name: no control characters'],
  ],
};

const rename: MethodSpec<S> = {
  name: 'rename',
  result$: (s) => s.renameResult$,
  state$: (s) => s.renameState$,
  call: (s) => s.rename(TYPE_ID, ' Studio B '),
  pending: { status: 'pending', typeId: TYPE_ID, name: ' Studio B ' },
  request: { method: 'PUT', path: `/calendar/types/${TYPE_ID}`, body: { name: 'Studio B' } },
  ok: () => json(200, { ...STUDIO, name: 'Studio B' }),
  success: { status: 'success', type: { ...STUDIO, name: 'Studio B' } },
  wrong: [
    ['201 instead of 200', () => json(201, STUDIO)],
    ['200 with typeId a number', () => json(200, { ...STUDIO, typeId: 7 })],
  ],
  codes: ['forbidden', 'invalid_json', 'invalid_request', 'type_not_found', 'type_name_exists', 'concurrent_update', 'internal_error'],
  notCodes: ['limit_reached', 'type_in_use'],
  invalid: [
    ['typeId not a ULID', (s) => s.rename('../types', 'Studio'), 'typeId: expected a ULID'],
    ['both wrong: the path first', (s) => s.rename('x', ''), 'typeId: expected a ULID'],
    ['an empty name', (s) => s.rename(TYPE_ID, ''), 'name: 1 to 40 characters'],
  ],
};

const remove: MethodSpec<S> = {
  name: 'remove',
  result$: (s) => s.removeResult$,
  state$: (s) => s.removeState$,
  call: (s) => s.remove(TYPE_ID),
  pending: { status: 'pending', typeId: TYPE_ID },
  request: { method: 'DELETE', path: `/calendar/types/${TYPE_ID}` },
  ok: () => new Response(null, { status: 204 }),
  success: { status: 'success', typeId: TYPE_ID }, // the id of the call
  wrong: [
    ['200 {}', () => json(200, {})],
    ['200 empty', () => new Response(null, { status: 200 })],
  ],
  codes: ['forbidden', 'invalid_request', 'type_not_found', 'type_in_use', 'concurrent_update', 'internal_error'],
  notCodes: ['invalid_json', 'type_name_exists'],
  invalid: [['typeId lower case', (s) => s.remove(TYPE_ID.toLowerCase()), 'typeId: expected a ULID']],
};

describe('AvailabilityTypesService', () => {
  describeMethod(make, load, create);
  describeMethod(make, create, rename);
  describeMethod(make, rename, remove);
  describeMethod(make, remove, load);
});
