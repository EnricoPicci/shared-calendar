import type { AvailabilityType } from '@shared-calendar/shared';
import type { Observable } from 'rxjs';
import { AvailabilityTypesService } from '../../../src/services/availability-types.service';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 16.8: the per-method suite of suite.ts for the four methods,
// then the capacity: sent when given, left out when not, refused before sending when out of range.

const TYPE_ID = '01JCAAAAAAAAAAAAAAAAAAAAAA';
const STUDIO: AvailabilityType = { typeId: TYPE_ID, name: 'Studio', capacity: 1, createdAt: '2026-11-15T09:00:00.000Z', updatedAt: '2026-11-15T09:00:00.000Z' };
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
    ['a capacity of 0', (s) => s.create('Studio', 0), 'capacity: Too small: expected number to be >=1'],
    ['a capacity of 101', (s) => s.create('Studio', 101), 'capacity: Too big: expected number to be <=100'],
    ['a capacity of 2.5', (s) => s.create('Studio', 2.5), 'capacity: Invalid input: expected int, received number'],
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
    ['a capacity of 0', (s) => s.rename(TYPE_ID, 'Studio', 0), 'capacity: Too small: expected number to be >=1'],
    ['a capacity of 101', (s) => s.rename(TYPE_ID, 'Studio', 101), 'capacity: Too big: expected number to be <=100'],
    ['a capacity of 2.5', (s) => s.rename(TYPE_ID, 'Studio', 2.5), 'capacity: Invalid input: expected int, received number'],
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

  describe('the capacity', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let store: SessionStore;
    let service: S;
    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      store = new SessionStore();
      store.set(session({ username: 'admin', role: 'admin' }));
      service = make(store);
    });
    afterEach(() => {
      store.clear();
      vi.unstubAllGlobals();
    });

    // Runs one call against a stubbed answer: the body sent, the pending state and the result.
    async function run(result$: Observable<unknown>, state$: Observable<unknown>, trigger: () => void, answer: Response) {
      fetchMock.mockResolvedValueOnce(answer);
      const results: unknown[] = [];
      const states: unknown[] = [];
      result$.subscribe((r) => results.push(r));
      state$.subscribe((s) => states.push(s));
      trigger();
      await vi.waitFor(() => expect(results).toHaveLength(1));
      const [, init] = call(fetchMock);
      return { body: JSON.parse(init.body as string) as unknown, pending: states[1], result: results[0] };
    }

    const POOL_3: AvailabilityType = { ...POOL, capacity: 3 };

    it('create with a capacity sends it, pending carries it, the answer passes it through', async () => {
      const { body, pending, result } = await run(service.createResult$, service.createState$, () => service.create(' Swimming Pool ', 3), json(201, POOL_3));
      expect(body).toEqual({ name: 'Swimming Pool', capacity: 3 });
      expect(pending).toEqual({ status: 'pending', name: ' Swimming Pool ', capacity: 3 });
      expect(result).toEqual({ status: 'success', type: POOL_3 });
    });

    it('create without a capacity sends none, and pending has no key capacity: the server gives 1', async () => {
      const { body, pending } = await run(service.createResult$, service.createState$, () => service.create('Studio'), json(201, STUDIO));
      expect(body).toEqual({ name: 'Studio' });
      expect(pending).not.toHaveProperty('capacity');
    });

    it('the bounds 1 and 100 are sent', async () => {
      expect((await run(service.createResult$, service.createState$, () => service.create('Studio', 1), json(201, STUDIO))).body).toEqual({ name: 'Studio', capacity: 1 });
      fetchMock.mockClear();
      expect((await run(service.createResult$, service.createState$, () => service.create('Studio', 100), json(201, STUDIO))).body).toEqual({ name: 'Studio', capacity: 100 });
    });

    it('rename with a capacity sends it, pending carries it, the answer passes it through', async () => {
      const { body, pending, result } = await run(service.renameResult$, service.renameState$, () => service.rename(POOL.typeId, 'Swimming Pool', 3), json(200, POOL_3));
      expect(body).toEqual({ name: 'Swimming Pool', capacity: 3 });
      expect(pending).toEqual({ status: 'pending', typeId: POOL.typeId, name: 'Swimming Pool', capacity: 3 });
      expect(result).toEqual({ status: 'success', type: POOL_3 });
    });

    it('rename without a capacity sends none: the type keeps its own, which the answer carries', async () => {
      const { body, pending, result } = await run(service.renameResult$, service.renameState$, () => service.rename(POOL.typeId, 'Pool'), json(200, { ...POOL_3, name: 'Pool' }));
      expect(body).toEqual({ name: 'Pool' });
      expect(pending).toEqual({ status: 'pending', typeId: POOL.typeId, name: 'Pool' });
      expect(result).toEqual({ status: 'success', type: { ...POOL_3, name: 'Pool' } });
    });

    it('a capacity out of range: pending carries it as given, then invalid_request, no request', async () => {
      const states: unknown[] = [];
      service.createState$.subscribe((s) => states.push(s));
      service.create('Studio', 0);
      expect(states[1]).toEqual({ status: 'pending', name: 'Studio', capacity: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
