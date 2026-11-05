import type { HelloResponse } from '@shared-calendar/shared';
import { HelloService } from '../../../src/services/hello.service';
import type { HelloResult, HelloState } from '../../../src/services/hello.types';
import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';

// docs/FRONTEND_SERVICES.md section 12.8. A real SessionStore; fetch stubbed with real Responses;
// every test subscribes first, then calls.

const HELLO: HelloResponse = { messageId: 'm-1', role: 'user', message: 'Hello World, I am alice', createdAt: '2026-11-05T10:00:00.000Z' };

let fetchMock: ReturnType<typeof vi.fn>;
let store: SessionStore;
let service: HelloService;
let results: HelloResult[];
let states: HelloState[];
let sessions: (Session | null)[];
let alice: Session;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  store = new SessionStore();
  service = new HelloService({ apiUrl: 'http://api.test' }, store);
  results = [];
  states = [];
  sessions = [];
  service.helloResult$.subscribe((r) => results.push(r));
  service.helloState$.subscribe((s) => states.push(s));
  store.session$.subscribe((s) => sessions.push(s));
  alice = session();
  store.set(alice);
});
afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

async function helloOnce(answer: Response | (() => Promise<Response>)) {
  fetchMock.mockImplementationOnce(typeof answer === 'function' ? answer : () => Promise.resolve(answer));
  const before = results.length;
  service.hello();
  await vi.waitFor(() => expect(results).toHaveLength(before + 1));
  return results.at(-1) as HelloResult;
}

describe('HelloService', () => {
  it('success: the HelloResponse; states idle → pending → success, the same object in both streams', async () => {
    const result = await helloOnce(json(201, HELLO));
    expect(result).toEqual({ status: 'success', hello: HELLO });
    expect(states).toEqual([{ status: 'idle' }, { status: 'pending' }, result]);
    expect(states[2]).toBe(result);
  });

  it("request shape: one POST to apiUrl + '/hello' with the store's token, no body", async () => {
    await helloOnce(json(201, HELLO));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://api.test/hello');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token-alice' });
    expect(init.body).toBeUndefined();
  });

  it('admin: role admin is accepted', async () => {
    const admin = { ...HELLO, role: 'admin', message: 'Hello World, the Administrator is speaking' };
    expect(await helloOnce(json(201, admin))).toEqual({ status: 'success', hello: admin });
  });

  it('forbidden: failure forbidden; the session stays', async () => {
    expect(await helloOnce(json(403, { error: 'forbidden', message: 'Not allowed for this account' }))).toEqual({
      status: 'failure',
      reason: 'forbidden',
      message: 'Not allowed for this account',
    });
    expect(sessions.at(-1)).toBe(alice);
  });

  it('token rejected: failure session_rejected; session$ gives null', async () => {
    expect(await helloOnce(json(403, { message: 'User is not authorized to access this resource' }))).toMatchObject({
      reason: 'session_rejected',
    });
    expect(sessions.at(-1)).toBeNull();
  });

  it('not signed in: pending, then failure not_signed_in; fetch never called', () => {
    store.clear();
    service.hello();
    expect(results).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' }]);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'failure']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('internal error: failure internal_error', async () => {
    expect(await helloOnce(json(500, { error: 'internal_error', message: 'Could not store the message' }))).toMatchObject({
      reason: 'internal_error',
    });
  });

  it.each([
    ['201 {}', () => json(201, {})],
    ['201 with an unknown role', () => json(201, { ...HELLO, role: 'root' })],
    ['200 HelloResponse', () => json(200, HELLO)],
    ['201 empty', () => new Response(null, { status: 201 })],
  ])('wrong body (%s): failure unexpected', async (_name, stub) => {
    expect(await helloOnce(stub())).toMatchObject({ status: 'failure', reason: 'unexpected' });
  });

  it('offline, then success: the subject is still alive', async () => {
    expect(await helloOnce(() => Promise.reject(new TypeError('fetch failed')))).toMatchObject({ reason: 'network' });
    expect(await helloOnce(json(201, HELLO))).toMatchObject({ status: 'success' });
  });

  it('cancel: a second call aborts the first; one result', async () => {
    let firstSignal: AbortSignal | undefined;
    let answerFirst: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      firstSignal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => (answerFirst = resolve));
    });
    service.hello();
    await helloOnce(json(201, HELLO));
    expect(firstSignal?.aborted).toBe(true);
    answerFirst(json(403, { message: 'late' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(results).toHaveLength(1);
    expect(sessions.at(-1)).toBe(alice);
  });

  it('late subscriber: the result is replayed; the state is the current success', async () => {
    await helloOnce(json(201, HELLO));
    const late: HelloResult[] = [];
    const lateStates: HelloState[] = [];
    service.helloResult$.subscribe((r) => late.push(r));
    service.helloState$.subscribe((s) => lateStates.push(s));
    expect(late).toEqual(results);
    expect(lateStates).toEqual([results[0]]);
  });

  it('no leak: no state or result contains the token', async () => {
    await helloOnce(json(201, HELLO));
    await helloOnce(json(500, {}));
    expect(JSON.stringify([results, states])).not.toContain(alice.accessToken);
  });
});
