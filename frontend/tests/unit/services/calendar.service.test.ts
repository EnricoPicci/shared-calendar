import type { CalendarView } from '@shared-calendar/shared';
import { CalendarService } from '../../../src/services/calendar.service';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 18.8: the per-method suite of suite.ts for `load` and `reload`
// (one pair of streams), then what only `reload` does.

const FROM = '2027-10-11';
const TO = '2027-10-17';
const VIEW: CalendarView = {
  timeZone: 'Europe/Rome',
  from: FROM,
  to: TO,
  generatedAt: '2026-11-15T09:00:00.000Z',
  days: [{ date: FROM, weekday: 1, windows: [], slots: [], busy: [] }],
  appointments: [],
};
const PATH = `/calendar?from=${FROM}&to=${TO}`;
const CODES = ['forbidden', 'invalid_request', 'internal_error'] as const;
const WRONG: MethodSpec<S>['wrong'] = [
  ['201 instead of 200', () => json(201, VIEW)],
  ['200 without timeZone', () => json(200, { ...VIEW, timeZone: undefined })],
  ['200 with from a number', () => json(200, { ...VIEW, from: 20271011 })],
  ['200 without to', () => json(200, { ...VIEW, to: undefined })],
  ['200 without days', () => json(200, { ...VIEW, days: undefined })],
  ['200 with appointments an object', () => json(200, { ...VIEW, appointments: {} })],
  ['200 empty', () => new Response(null, { status: 200 })],
];

type S = CalendarService;
const make = (store: SessionStore) => new CalendarService(CONFIG, store);

const load: MethodSpec<S> = {
  name: 'load',
  result$: (s) => s.calendarResult$,
  state$: (s) => s.calendarState$,
  call: (s) => s.load(FROM, TO),
  pending: { status: 'pending', from: FROM, to: TO },
  request: { method: 'GET', path: PATH },
  ok: () => json(200, VIEW),
  success: { status: 'success', calendar: VIEW },
  wrong: WRONG,
  codes: CODES,
  notCodes: ['invalid_json', 'concurrent_update'],
  invalid: [
    ['from after to', (s) => s.load(TO, FROM), 'to: from must not be after to'],
    ['32 days', (s) => s.load('2027-10-01', '2027-11-01'), 'to: the range spans more than 31 days'],
    ['not a real date', (s) => s.load('2027-02-29', TO), 'from: not a real date'],
    ['to missing', (s) => s.load(FROM, undefined as never), 'to: Invalid input: expected string, received undefined'],
  ],
};

// The suite's reload runs on a service whose last load was FROM..TO, so its request, pending and
// success are those of `load`. Its input errors are those of the range it reloads (below).
const reload: MethodSpec<S> = { ...load, name: 'reload', call: (s) => s.reload(), invalid: [] };

// A service that remembers the range FROM..TO as a load would, without sending or emitting
// anything: the suite counts every result from its first subscription on.
function primed(store: SessionStore): S {
  const service = make(store);
  Reflect.set(service, 'last', { from: FROM, to: TO });
  return service;
}

describe('CalendarService', () => {
  // load and reload share one pending call, so the suite has no other method to leave pending.
  describeMethod(make, load);
  describeMethod(primed, reload);

  describe('reload', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let store: SessionStore;
    let service: S;
    let results: unknown[];
    let states: unknown[];
    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      store = new SessionStore();
      store.set(session({ role: 'admin', accessToken: 'access-token-admin' }));
      service = make(store);
      results = [];
      states = [];
      service.calendarResult$.subscribe((r) => results.push(r));
      service.calendarState$.subscribe((s) => states.push(s));
    });
    afterEach(() => {
      store.clear();
      vi.unstubAllGlobals();
    });

    async function next(answer: Response, trigger: () => void): Promise<unknown> {
      fetchMock.mockResolvedValueOnce(answer);
      const before = results.length;
      trigger();
      await vi.waitFor(() => expect(results).toHaveLength(before + 1));
      return results.at(-1);
    }

    it('before any load: pending without a range, then invalid_request; fetch never called', () => {
      service.reload();
      const failure = { status: 'failure', reason: 'invalid_request', message: 'nothing loaded yet' };
      expect(results).toEqual([failure]);
      expect(states).toEqual([{ status: 'idle' }, { status: 'pending' }, failure]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('after a load: the same range again; pending carries it', async () => {
      await next(json(200, VIEW), () => service.load(FROM, TO));
      const changed = { ...VIEW, generatedAt: '2026-11-15T10:00:00.000Z' };
      expect(await next(json(200, changed), () => service.reload())).toEqual({ status: 'success', calendar: changed });
      expect(states.slice(-2)).toEqual([{ status: 'pending', from: FROM, to: TO }, results.at(-1)]);
      expect(call(fetchMock, 1)[0]).toBe(`${CONFIG.apiUrl}${PATH}`);
    });

    it('after a failed load: the same range again', async () => {
      expect(await next(json(500, { error: 'internal_error', message: 'boom' }), () => service.load(FROM, TO))).toMatchObject({ reason: 'internal_error' });
      expect(await next(json(200, VIEW), () => service.reload())).toEqual({ status: 'success', calendar: VIEW });
      expect(call(fetchMock, 1)[0]).toBe(`${CONFIG.apiUrl}${PATH}`);
    });

    it('after a load refused before sending: the same refusal again, no request', () => {
      service.load(TO, FROM);
      service.reload();
      expect(results).toEqual([
        { status: 'failure', reason: 'invalid_request', message: 'to: from must not be after to' },
        { status: 'failure', reason: 'invalid_request', message: 'to: from must not be after to' },
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('the last load wins: reload runs the range of the newest load', async () => {
      await next(json(200, VIEW), () => service.load(FROM, TO));
      await next(json(200, VIEW), () => service.load('2027-11-01', '2027-11-07'));
      await next(json(200, VIEW), () => service.reload());
      expect(call(fetchMock, 2)[0]).toBe(`${CONFIG.apiUrl}/calendar?from=2027-11-01&to=2027-11-07`);
    });

    // Both directions share one pending call (docs/FRONTEND_SERVICES.md section 8, decision 39).
    it.each([
      ['a load cancels a pending reload', () => service.reload(), () => service.load(FROM, TO)],
      ['a reload cancels a pending load', () => service.load(FROM, TO), () => service.reload()],
    ])('%s; one result', async (_name, first, second) => {
      await next(json(200, VIEW), () => service.load(FROM, TO)); // something to reload
      const signals: (AbortSignal | undefined)[] = [];
      fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
        signals.push(init.signal ?? undefined);
        return new Promise<Response>(() => {});
      });
      first();
      await next(json(200, VIEW), second);
      expect(signals[0]?.aborted).toBe(true);
      expect(results).toHaveLength(2);
    });
  });
});
