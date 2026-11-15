import type { ApiErrorCode } from '@shared-calendar/shared';
import type { Observable } from 'rxjs';
import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';

// The unit tests every API method gets (docs/FRONTEND_SERVICES.md sections 15.8, 16.8 and 17.8;
// docs/SHARED_CALENDAR_SPEC.md section 16.6),
// written once and run per method. Not a test file: the unit project selects *.test.ts only.
// A real SessionStore; fetch stubbed with real Responses; every test subscribes first, then calls.

export const CONFIG = { apiUrl: 'http://api.test' };

type Outcome = { status: string; reason?: string; message?: string; conflicts?: unknown };

export type MethodSpec<S> = {
  name: string;
  result$: (service: S) => Observable<Outcome>;
  state$: (service: S) => Observable<unknown>;
  call: (service: S) => void; // a valid call
  // The expected pending state (docs/FRONTEND_SERVICES.md section 8, decision 31).
  pending: Record<string, unknown>;
  request: { method: string; path: string; body?: unknown }; // body: what is sent (zod's output)
  ok: () => Response;
  success: Record<string, unknown>;
  wrong: [string, () => Response][]; // answers outside the contract: unexpected
  codes: readonly ApiErrorCode[]; // the route's error codes in docs/ARCHITECTURE.md section 4
  notCodes?: readonly ApiErrorCode[]; // codes of other routes that must stay unexpected here
  invalid?: [string, (service: S) => void, string][]; // inputs refused before any request, with the message
};

type Harness<S> = {
  fetchMock: ReturnType<typeof vi.fn>;
  store: SessionStore;
  service: S;
  admin: Session;
  results: Outcome[];
  states: unknown[];
  sessions: (Session | null)[];
};

// `other` is another method of the same service: its pending call must survive this one's.
export function describeMethod<S>(make: (store: SessionStore) => S, spec: MethodSpec<S>, other: MethodSpec<S>): void {
  describe(spec.name, () => {
    const h = {} as Harness<S>;
    beforeEach(() => {
      h.fetchMock = vi.fn();
      vi.stubGlobal('fetch', h.fetchMock);
      h.store = new SessionStore();
      h.service = make(h.store);
      h.results = [];
      h.states = [];
      h.sessions = [];
      spec.result$(h.service).subscribe((r) => h.results.push(r));
      spec.state$(h.service).subscribe((s) => h.states.push(s));
      h.store.session$.subscribe((s) => h.sessions.push(s));
      h.admin = session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin' });
      h.store.set(h.admin);
    });
    afterEach(() => {
      h.store.clear();
      vi.unstubAllGlobals();
    });

    async function once(answer: Response): Promise<Outcome> {
      h.fetchMock.mockResolvedValueOnce(answer);
      const before = h.results.length;
      spec.call(h.service);
      await vi.waitFor(() => expect(h.results).toHaveLength(before + 1));
      return h.results.at(-1) as Outcome;
    }

    it('success: the success value; states idle → pending with the arguments → success, the same object', async () => {
      const result = await once(spec.ok());
      expect(result).toEqual(spec.success);
      expect(h.states).toEqual([{ status: 'idle' }, spec.pending, result]);
      expect(h.states[2]).toBe(result);
    });

    it(`request shape: one ${spec.request.method} ${spec.request.path}, bearer token, ${spec.request.body === undefined ? 'no body' : 'the parsed JSON body'}`, async () => {
      await once(spec.ok());
      expect(h.fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = call(h.fetchMock);
      expect(url).toBe(`${CONFIG.apiUrl}${spec.request.path}`);
      expect(init.method).toBe(spec.request.method);
      if (spec.request.body === undefined) {
        expect(init.headers).toEqual({ Authorization: 'Bearer access-token-admin' });
        expect(init.body).toBeUndefined();
      } else {
        expect(init.headers).toEqual({ Authorization: 'Bearer access-token-admin', 'Content-Type': 'application/json' });
        expect(JSON.parse(init.body as string)).toEqual(spec.request.body);
      }
    });

    it.each(spec.codes.map((code) => [code]))('route code %s: failure with that reason and the message', async (code) => {
      const result = await once(json(code === 'forbidden' ? 403 : code.endsWith('_not_found') ? 404 : 409, { error: code, message: `m-${code}` }));
      expect(result).toMatchObject({ status: 'failure', reason: code, message: `m-${code}` });
      expect(h.sessions.at(-1)).toBe(h.admin); // a handler's answer never clears the store
    });

    it.each((spec.notCodes ?? []).map((code) => [code]))('a code of another route (%s): unexpected', async (code) => {
      expect(await once(json(409, { error: code, message: 'm' }))).toEqual({ status: 'failure', reason: 'unexpected', message: 'm' });
    });

    it.each(spec.wrong)('wrong answer (%s): failure unexpected', async (_name, stub) => {
      expect(await once(stub())).toMatchObject({ status: 'failure', reason: 'unexpected' });
    });

    it('token rejected: failure session_rejected; session$ gives null', async () => {
      expect(await once(json(403, { message: 'Forbidden' }))).toMatchObject({ reason: 'session_rejected' });
      expect(h.sessions.at(-1)).toBeNull();
    });

    it('not signed in: pending, then failure not_signed_in; fetch never called', () => {
      h.store.clear();
      spec.call(h.service);
      expect(h.results).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' }]);
      expect(h.states).toEqual([{ status: 'idle' }, spec.pending, h.results[0]]);
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it.each(spec.invalid ?? [])('invalid input (%s): pending, then invalid_request with the field; fetch never called', (_name, invalidCall, message) => {
      invalidCall(h.service);
      expect(h.results).toEqual([{ status: 'failure', reason: 'invalid_request', message }]);
      expect(h.states).toHaveLength(3);
      expect(h.fetchMock).not.toHaveBeenCalled();
    });

    it('offline, then success: failure network, then success (the subject is alive)', async () => {
      h.fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      spec.call(h.service);
      await vi.waitFor(() => expect(h.results).toHaveLength(1));
      expect(h.results[0]).toMatchObject({ reason: 'network', message: 'TypeError: fetch failed' });
      expect(await once(spec.ok())).toEqual(spec.success);
    });

    it(`cancel: a second ${spec.name} aborts the first, not a pending ${other.name}; one result`, async () => {
      const signals: (AbortSignal | undefined)[] = [];
      const pendingForever = (_url: string, init: RequestInit) => {
        signals.push(init.signal ?? undefined);
        return new Promise<Response>(() => {});
      };
      h.fetchMock.mockImplementationOnce(pendingForever).mockImplementationOnce(pendingForever);
      other.call(h.service);
      spec.call(h.service);
      await once(spec.ok());
      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(false); // the other method's call
      expect(signals[1]?.aborted).toBe(true); // this method's first call
      expect(h.results).toHaveLength(1);
    });

    it('late subscriber: the result is replayed; the state is the current success', async () => {
      const result = await once(spec.ok());
      const late: unknown[] = [];
      const lateStates: unknown[] = [];
      spec.result$(h.service).subscribe((r) => late.push(r)).unsubscribe();
      spec.state$(h.service).subscribe((s) => lateStates.push(s)).unsubscribe();
      expect(late).toEqual([result]);
      expect(lateStates).toEqual([result]);
    });

    it('no leak: no state or result contains the token', async () => {
      await once(spec.ok());
      await once(json(409, { error: spec.codes.at(-1), message: 'm' }));
      expect(JSON.stringify([h.results, h.states])).not.toContain(h.admin.accessToken);
    });
  });
}
