import type { Session } from '../../../src/services/login.types';
import { RefreshService, type RefreshConfig } from '../../../src/services/refresh.service';
import type { RefreshResult, RefreshState } from '../../../src/services/refresh.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, cognitoError, cognitoTokens, json, jwt, session } from './fixtures';

// docs/FRONTEND_SERVICES.md section 11.8. Fetch stubbed with real Responses; every test
// subscribes first, then calls. The schedule tests fake the timers RxJS uses (setInterval) and
// Date, not setImmediate, so that setImmediate still flushes the promises of fetch.

const CONFIG: RefreshConfig = { cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
const MINUTE = 60_000;

// A Cognito refresh answer: new access and id tokens, no refresh token (section 11.1).
function refreshed(minutes = 15, claims: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Response {
  const exp = Math.floor((Date.now() + minutes * MINUTE) / 1000);
  const access = jwt({ username: 'alice', 'cognito:groups': ['user'], exp, ...claims });
  return cognitoTokens({ AccessToken: access, IdToken: 'id-token-2', ...extra });
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

let fetchMock: ReturnType<typeof vi.fn>;
let store: SessionStore;
let service: RefreshService;
let results: RefreshResult[];
let states: RefreshState[];
let sessions: (Session | null)[];
let alice: Session;

function setUp(signedIn = true) {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  store = new SessionStore();
  service = new RefreshService(CONFIG, store);
  results = [];
  states = [];
  sessions = [];
  service.refreshResult$.subscribe((r) => results.push(r));
  service.refreshState$.subscribe((s) => states.push(s));
  store.session$.subscribe((s) => sessions.push(s));
  alice = session();
  if (signedIn) store.set(alice);
}
afterEach(() => {
  service.stop();
  store.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function refreshOnce(answer: Response | (() => Promise<Response>)) {
  fetchMock.mockImplementationOnce(typeof answer === 'function' ? answer : () => Promise.resolve(answer));
  const before = results.length;
  service.refresh();
  await vi.waitFor(() => expect(results).toHaveLength(before + 1));
  return results.at(-1) as RefreshResult;
}

describe('RefreshService.refresh', () => {
  beforeEach(() => setUp());

  it('success: username and the new expiry, no token; the store holds the new session, written first', async () => {
    let inStoreAtEmit: Session | null | undefined;
    service.refreshResult$.subscribe(() => (inStoreAtEmit = sessions.at(-1)));
    const result = await refreshOnce(refreshed(15));
    const current = sessions.at(-1) as Session;
    expect(result).toEqual({ status: 'success', username: 'alice', expiresAt: current.expiresAt });
    expect(current.accessToken).not.toBe(alice.accessToken);
    expect(current.idToken).toBe('id-token-2');
    expect(current.refreshToken).toBe(alice.refreshToken);
    expect(inStoreAtEmit).toBe(current);
    expect(states).toEqual([{ status: 'idle' }, { status: 'pending' }, result]);
    expect(states[2]).toBe(result);
  });

  it("request shape: one POST with REFRESH_TOKEN_AUTH, the client id and the store's refresh token", async () => {
    await refreshOnce(refreshed());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://cognito.test/');
    expect(JSON.parse(init.body as string)).toEqual({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: 'client-123',
      AuthParameters: { REFRESH_TOKEN: 'refresh-token-alice' },
    });
  });

  it('refresh token rotated: the session holds the new one', async () => {
    await refreshOnce(refreshed(15, {}, { RefreshToken: 'rotated' }));
    expect(sessions.at(-1)?.refreshToken).toBe('rotated');
  });

  it('not signed in: failure not_signed_in, fetch never called', async () => {
    store.clear();
    service.refresh();
    expect(results).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' }]);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'failure']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejected (NotAuthorizedException): failure session_rejected, the store is cleared', async () => {
    const result = await refreshOnce(cognitoError('NotAuthorizedException', 'User not authorized'));
    expect(result).toEqual({ status: 'failure', reason: 'session_rejected', message: 'User not authorized' });
    expect(sessions.at(-1)).toBeNull();
  });

  it('no role: failure no_role, the store is cleared', async () => {
    const result = await refreshOnce(refreshed(15, { 'cognito:groups': [] }));
    expect(result).toMatchObject({ status: 'failure', reason: 'no_role' });
    expect(sessions.at(-1)).toBeNull();
  });

  it('throttled: failure too_many_attempts; the session stays', async () => {
    expect(await refreshOnce(cognitoError('TooManyRequestsException', 'slow down'))).toMatchObject({ reason: 'too_many_attempts' });
    expect(sessions.at(-1)).toBe(alice);
  });

  it('server: 503 or HTML 502 give failure server; the session stays', async () => {
    expect(await refreshOnce(json(503, {}))).toMatchObject({ reason: 'server' });
    expect(await refreshOnce(new Response('<html/>', { status: 502 }))).toMatchObject({ reason: 'server' });
    expect(sessions.at(-1)).toBe(alice);
  });

  it('offline: failure network; the session stays; the subject is still alive', async () => {
    expect(await refreshOnce(() => Promise.reject(new TypeError('fetch failed')))).toEqual({
      status: 'failure',
      reason: 'network',
      message: 'TypeError: fetch failed',
    });
    expect(sessions.at(-1)).toBe(alice);
    expect(await refreshOnce(refreshed())).toMatchObject({ status: 'success' });
  });

  it('challenge: failure unexpected', async () => {
    expect(await refreshOnce(json(200, { ChallengeName: 'SMS_MFA' }))).toMatchObject({ reason: 'unexpected' });
  });

  it('cancel: a second refresh aborts the first; one result', async () => {
    let firstSignal: AbortSignal | undefined;
    let answerFirst: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      firstSignal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => (answerFirst = resolve));
    });
    service.refresh();
    expect(firstSignal?.aborted).toBe(false);
    await refreshOnce(refreshed());
    expect(firstSignal?.aborted).toBe(true);
    answerFirst(cognitoError('NotAuthorizedException', 'late'));
    await flush();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success');
  });

  it.each([
    ['success', () => refreshed()],
    ['rejection', () => cognitoError('NotAuthorizedException', 'no')],
  ])('stale %s: a newer session set meanwhile stays', async (_name, stub) => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    service.refresh();
    const carol = session({ username: 'carol', accessToken: 'token-c' });
    store.set(carol);
    answer(stub());
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(sessions.at(-1)).toBe(carol);
  });

  it('no leak: no state or result contains a token', async () => {
    await refreshOnce(refreshed());
    const current = sessions.at(-1) as Session;
    await refreshOnce(cognitoError('NotAuthorizedException', 'no'));
    for (const secret of [current.accessToken, current.idToken, current.refreshToken, alice.accessToken]) {
      expect(JSON.stringify(results)).not.toContain(secret);
      expect(JSON.stringify(states)).not.toContain(secret);
    }
  });
});

describe('RefreshService.start / stop', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    setUp(false);
    fetchMock.mockImplementation(() => Promise.resolve(refreshed(15)));
  });

  it('schedule: nothing at 14 min − 1 ms, one refresh at 14 min', async () => {
    store.set(session({}, 15));
    service.start();
    await vi.advanceTimersByTimeAsync(14 * MINUTE - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-arm: after a successful refresh, the next one fires 14 min later', async () => {
    store.set(session({}, 15));
    service.start();
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    await flush();
    expect(results).toHaveLength(1);
    // The new token's exp is in whole seconds, so its expiry is up to 1 s before 15 min ahead.
    await vi.advanceTimersByTimeAsync(14 * MINUTE - 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('nearly expired: a session 30 s from its expiry is refreshed at once', async () => {
    store.set(session({}, 0.5));
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no session: nothing until a session exists, then scheduled', async () => {
    service.start();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fetchMock).not.toHaveBeenCalled();
    store.set(session({}, 15));
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('null disarms: after a clear nothing fires', async () => {
    store.set(session({}, 15));
    service.start();
    store.clear();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stop: no fetch at 14 min', async () => {
    store.set(session({}, 15));
    service.start();
    service.stop();
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('start twice: one fetch at 14 min', async () => {
    store.set(session({}, 15));
    service.start();
    service.start();
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('constructor: nothing starts by itself', async () => {
    store.set(session({}, 15));
    await vi.advanceTimersByTimeAsync(14 * MINUTE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
