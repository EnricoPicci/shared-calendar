import { LoginService } from '../../../src/services/login.service';
import type { LoginResult, LoginState, Session } from '../../../src/services/login.types';
import { LogoutService, type LogoutConfig, type Resettable } from '../../../src/services/logout.service';
import type { LogoutResult, LogoutState } from '../../../src/services/logout.types';
import { RefreshService } from '../../../src/services/refresh.service';
import type { RefreshState } from '../../../src/services/refresh.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, cognitoError, cognitoTokens, json, jwt, session } from './fixtures';

// docs/FRONTEND_SERVICES.md section 20.8. Fetch stubbed with real Responses; a real
// SessionStore; the page-wide services are spies, or the real LoginService and RefreshService
// where a test is about them. Every test subscribes first, then calls. The refresh token is a
// made-up text. The tests of the time limit fake the timers RxJS uses (setInterval) and Date,
// not setImmediate, so that setImmediate still flushes the promises of fetch.

const CONFIG: LogoutConfig = { cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
const REVOKED = () => json(200, {}, 'application/x-amz-json-1.1');
const SECOND = 1000;

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

// A fetch that answers when the test says so, and the signal it was given.
function held() {
  const request = { signal: undefined as AbortSignal | undefined, answer: (_response: Response) => {}, reject: (_error: unknown) => {} };
  fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
    request.signal = init.signal ?? undefined;
    return new Promise<Response>((resolve, reject) => {
      request.answer = resolve;
      request.reject = reject;
    });
  });
  return request;
}

// What the call `i` of the fetch stub sent: the operation and the body.
function sent(i = 0) {
  const [url, init] = call(fetchMock, i);
  return { url, target: (init.headers as Record<string, string>)['X-Amz-Target'], body: JSON.parse(init.body as string) as Record<string, unknown>, keepalive: init.keepalive };
}

let fetchMock: ReturnType<typeof vi.fn>;
let consoleSpies: ReturnType<typeof vi.spyOn>[];
let store: SessionStore;
let service: LogoutService;
let login: { reset: ReturnType<typeof vi.fn<() => void>> };
let refresh: { reset: ReturnType<typeof vi.fn<() => void>> };
let results: LogoutResult[];
let states: LogoutState[];
let sessions: (Session | null)[];
let alice: Session;
// Everything a test's services published, for the check that no token is in it.
let published: unknown[];

// A service with both streams and the store recorded, on a new store with alice signed in, or
// on a store the test made; the page-wide services are the two spies unless the test brings
// its own.
function setUp(signedIn = true, pageWide?: readonly Resettable[], shared = new SessionStore()) {
  store = shared;
  login = { reset: vi.fn<() => void>() };
  refresh = { reset: vi.fn<() => void>() };
  service = new LogoutService(CONFIG, store, pageWide ?? [login, refresh]);
  results = [];
  states = [];
  sessions = [];
  service.logoutResult$.subscribe((r) => results.push(r));
  service.logoutState$.subscribe((s) => states.push(s));
  store.session$.subscribe((s) => sessions.push(s));
  alice = session();
  if (signedIn) store.set(alice);
  published.push(results, states);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  published = [];
});
afterEach(() => {
  // No leak, for every test of the file: nothing published holds a token, and nothing was
  // written to the console.
  const text = JSON.stringify(published);
  for (const secret of ['refresh-token', 'access-token', 'id-token']) expect(text).not.toContain(secret);
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  store.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function logoutOnce(answer: Response | (() => Promise<Response>)) {
  fetchMock.mockImplementationOnce(typeof answer === 'function' ? answer : () => Promise.resolve(answer));
  const before = results.length;
  service.logout();
  await vi.waitFor(() => expect(results).toHaveLength(before + 1));
  return results.at(-1) as LogoutResult;
}

describe('LogoutService.logout', () => {
  it('success: the result says so and nothing else; state idle → pending → success, the same object', async () => {
    setUp();
    const result = await logoutOnce(REVOKED());
    expect(result).toEqual({ status: 'success' });
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'success']);
    expect(states.at(-1)).toBe(result);
    expect(JSON.stringify([results, states])).not.toContain('alice');
  });

  it('request shape: one POST of RevokeToken with the client id and the refresh token of the store, keepalive', async () => {
    setUp();
    await logoutOnce(REVOKED());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()).toEqual({
      url: 'http://cognito.test/',
      target: 'AWSCognitoIdentityProviderService.RevokeToken',
      body: { ClientId: 'client-123', Token: alice.refreshToken },
      keepalive: true,
    });
  });

  it('forgotten before the answer: when logout() returns the store is empty, the services are reset and the request has left', () => {
    setUp();
    held();
    service.logout();
    expect(sessions).toEqual([null, alice, null]);
    expect(login.reset).toHaveBeenCalledTimes(1);
    expect(refresh.reset).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending']);
    expect(results).toEqual([]);
  });

  it('the order inside: the page-wide services are reset, then the store says null, then the request leaves', () => {
    const order: string[] = [];
    setUp(true, [{ reset: () => order.push('reset login') }, { reset: () => order.push('reset refresh') }]);
    store.session$.subscribe((s) => order.push(s ? 'session' : 'null'));
    fetchMock.mockImplementationOnce(() => {
      order.push('fetch');
      return new Promise<Response>(() => {});
    });
    order.length = 0;
    service.logout();
    expect(order).toEqual(['reset login', 'reset refresh', 'null', 'fetch']);
  });

  it.each([
    ['token_rejected', () => cognitoError('UnauthorizedException', 'no'), 'Cognito answered 400 UnauthorizedException'],
    ['not_enabled', () => cognitoError('UnsupportedOperationException', 'no'), 'Cognito answered 400 UnsupportedOperationException'],
    ['too_many_attempts', () => cognitoError('TooManyRequestsException', 'no'), 'Cognito answered 400 TooManyRequestsException'],
    ['server', () => json(500, { __type: 'InternalErrorException' }), 'Cognito answered 500 InternalErrorException'],
    ['server', () => new Response('<html>Bad Gateway</html>', { status: 502 }), 'Cognito answered 502 without JSON'],
    ['unexpected', () => cognitoError('SomethingElseException', 'no'), 'Cognito answered 400'],
  ])('failure %s: the reason and a message of our own, and the person is signed out all the same', async (reason, stub, message) => {
    setUp();
    const result = await logoutOnce(stub());
    expect(result).toEqual({ status: 'failure', reason, message });
    expect(states.at(-1)).toBe(result);
    expect(sessions.at(-1)).toBeNull();
  });

  it('a failure whose message quotes the token: the result does not hold it', async () => {
    setUp();
    const result = await logoutOnce(cognitoError('InvalidParameterException', `Value '${alice.refreshToken}' at 'token' failed to satisfy constraint`));
    expect(result).toEqual({ status: 'failure', reason: 'unexpected', message: 'Cognito answered 400 InvalidParameterException' });
  });

  it('offline: failure network, the person signed out, and the subject still alive for the next sign-out', async () => {
    setUp();
    const result = await logoutOnce(() => Promise.reject(new TypeError('fetch failed')));
    expect(result).toEqual({ status: 'failure', reason: 'network', message: 'TypeError: fetch failed' });
    expect(sessions.at(-1)).toBeNull();

    store.set(session({ username: 'carol', refreshToken: 'refresh-token-carol' }));
    expect(await logoutOnce(REVOKED())).toEqual({ status: 'success' });
    expect(results).toHaveLength(2);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'failure', 'pending', 'success']);
  });

  it('no session: pending, then failure not_signed_in; no request; the services are reset all the same', () => {
    setUp(false);
    service.logout();
    expect(results).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody was signed in' }]);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'failure']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(login.reset).toHaveBeenCalledTimes(1);
    expect(refresh.reset).toHaveBeenCalledTimes(1);
  });

  it('two presses: one request, never aborted; the state stays with the second call when the first answers', async () => {
    setUp();
    const first = held();
    service.logout();
    service.logout();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.signal?.aborted).toBe(false);
    expect(results).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody was signed in' }]);

    first.answer(REVOKED());
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results.map((r) => r.status)).toEqual(['failure', 'success']);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'pending', 'failure']);
  });

  it('a second person: each sign-out sends its own token, and the first one\'s late answer leaves the state at the second\'s', async () => {
    setUp();
    const first = held();
    service.logout();
    const carol = session({ username: 'carol', refreshToken: 'refresh-token-carol' });
    store.set(carol);
    expect(await logoutOnce(REVOKED())).toEqual({ status: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(0).body.Token).toBe(alice.refreshToken);
    expect(sent(1).body.Token).toBe(carol.refreshToken);
    expect(first.signal?.aborted).toBe(false);

    first.answer(cognitoError('UnauthorizedException', 'no'));
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results.map((r) => r.status)).toEqual(['success', 'failure']);
    expect(states.at(-1)).toEqual({ status: 'success' });
  });

  it.each([
    ['200', (request: ReturnType<typeof held>) => request.answer(REVOKED())],
    ['400', (request: ReturnType<typeof held>) => request.answer(cognitoError('UnauthorizedException', 'no'))],
    ['a rejection', (request: ReturnType<typeof held>) => request.reject(new TypeError('fetch failed'))],
  ])('a session that arrives after the press stays, whatever the late answer: %s', async (_name, settle) => {
    setUp();
    const request = held();
    service.logout();
    const carol = session({ username: 'carol', refreshToken: 'refresh-token-carol' });
    store.set(carol);
    settle(request);
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(sessions.at(-1)).toBe(carol);
  });

  it('late subscriber: the result is replayed and the state is the current one', async () => {
    setUp();
    const result = await logoutOnce(REVOKED());
    const lateResults: LogoutResult[] = [];
    const lateStates: LogoutState[] = [];
    service.logoutResult$.subscribe((r) => lateResults.push(r));
    service.logoutState$.subscribe((s) => lateStates.push(s));
    expect(lateResults).toEqual([result]);
    expect(lateStates).toEqual([result]);
  });
});

describe('LogoutService, the time limit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    setUp();
  });

  it('nothing at 10 s − 1 ms; at 10 s failure timeout, and the request is aborted', async () => {
    const request = held();
    service.logout();
    await vi.advanceTimersByTimeAsync(10 * SECOND - 1);
    expect(results).toEqual([]);
    expect(request.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(results).toEqual([{ status: 'failure', reason: 'timeout', message: 'Cognito did not answer within 10 seconds' }]);
    expect(states.at(-1)).toBe(results[0]);
    expect(request.signal?.aborted).toBe(true);
    // The answer that comes after all is not read.
    request.answer(REVOKED());
    await flush();
    expect(results).toHaveLength(1);
  });

  it('an answer just in time is a success, and nothing more happens at the limit', async () => {
    const request = held();
    service.logout();
    await vi.advanceTimersByTimeAsync(9 * SECOND);
    request.answer(REVOKED());
    await flush();
    expect(results).toEqual([{ status: 'success' }]);
    await vi.advanceTimersByTimeAsync(5 * SECOND);
    expect(results).toHaveLength(1);
    expect(request.signal?.aborted).toBe(false);
  });

  it('constructor: nothing starts by itself', async () => {
    await vi.advanceTimersByTimeAsync(60 * SECOND);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(login.reset).not.toHaveBeenCalled();
    expect(sessions.at(-1)).toBe(alice);
    expect(states).toEqual([{ status: 'idle' }]);
  });
});

describe('LogoutService with the real page-wide services', () => {
  // A Cognito renewal answer: new access and id tokens, no refresh token.
  const renewed = () => cognitoTokens({ AccessToken: jwt({ username: 'alice', 'cognito:groups': ['user'], exp: Math.floor(Date.now() / 1000) + 900 }), IdToken: 'id-token-2' });

  it('a renewal in flight: it is aborted, nobody is signed in again, and the revocation carries the token of the press', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    store = new SessionStore();
    const renewal = new RefreshService(CONFIG, store);
    const renewalStates: RefreshState[] = [];
    renewal.refreshState$.subscribe((s) => renewalStates.push(s));
    published.push(renewalStates);
    renewal.start();
    setUp(true, [renewal], store);

    // The automatic renewal leaves one minute before the expiry and is not answered.
    const refreshRequest = held();
    await vi.advanceTimersByTimeAsync(14 * 60 * SECOND);
    expect(sent(0).target).toBe('AWSCognitoIdentityProviderService.InitiateAuth');

    fetchMock.mockResolvedValueOnce(REVOKED());
    service.logout();
    expect(refreshRequest.signal?.aborted).toBe(true);
    expect(sent(1).body).toEqual({ ClientId: 'client-123', Token: alice.refreshToken });
    expect(sessions.at(-1)).toBeNull();

    refreshRequest.answer(renewed());
    await flush();
    expect(sessions.at(-1)).toBeNull();
    expect(renewalStates.at(-1)).toEqual({ status: 'idle' });
    expect(results).toEqual([{ status: 'success' }]);

    // The renewal's timer is disarmed: past the expiry nothing more is asked.
    await vi.advanceTimersByTimeAsync(60 * 60 * SECOND);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    renewal.stop();
  });

  it('a renewal\'s answer that slips through: the store\'s guarded write alone keeps everybody signed out', async () => {
    store = new SessionStore();
    // A RefreshService the sign-out does not know of, so nothing aborts its request.
    const renewal = new RefreshService(CONFIG, store);
    setUp(true, [], store);
    const refreshRequest = held();
    renewal.refresh();

    await logoutOnce(REVOKED());
    expect(refreshRequest.signal?.aborted).toBe(false);
    refreshRequest.answer(renewed());
    await flush();
    expect(sessions.at(-1)).toBeNull();
  });

  it('the login is back in its first state, before the store says null', async () => {
    store = new SessionStore();
    const signIn = new LoginService(CONFIG, store);
    fetchMock.mockResolvedValueOnce(cognitoTokens({ AccessToken: jwt({ username: 'alice', 'cognito:groups': ['user'], exp: Math.floor(Date.now() / 1000) + 900 }), IdToken: 'id-token-1', RefreshToken: 'refresh-token-1' }));
    const signInStates: LoginState[] = [];
    signIn.loginState$.subscribe((s) => signInStates.push(s));
    published.push(signInStates);
    signIn.login('alice', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(signInStates.at(-1)?.status).toBe('success'));
    setUp(false, [signIn], store);

    // What the login's state is at the moment the store says null: what a login view mounted
    // then would find.
    let atNull: LoginState | undefined;
    store.session$.subscribe((s) => {
      if (s === null) atNull = signInStates.at(-1);
    });
    await logoutOnce(REVOKED());
    expect(atNull).toEqual({ status: 'idle' });
    expect(signInStates.at(-1)).toEqual({ status: 'idle' });
    const late: LoginResult[] = [];
    signIn.loginResult$.subscribe((r) => late.push(r));
    expect(late).toEqual([]);
  });
});
