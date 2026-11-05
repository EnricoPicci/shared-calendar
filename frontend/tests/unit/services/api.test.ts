import type { ApiErrorCode } from '@shared-calendar/shared';
import { firstValueFrom } from 'rxjs';
import { apiCall, type ApiConfig, type ApiFailure, type ApiOk, type ApiRequest } from '../../../src/services/api';
import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';

// docs/FRONTEND_SERVICES.md section 10.4. A real SessionStore; fetch stubbed with real Responses.

const CONFIG: ApiConfig = { apiUrl: 'http://api.test' };
const HELLO: ApiRequest<'forbidden' | 'internal_error'> = { method: 'POST', path: '/hello', codes: ['forbidden', 'internal_error'] };
const CREATE: ApiRequest<'user_exists'> = { method: 'POST', path: '/users', body: { username: 'carol' }, codes: ['user_exists'] };

let fetchMock: ReturnType<typeof vi.fn>;
let store: SessionStore;
let sessions: (Session | null)[];
let alice: Session;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  store = new SessionStore();
  sessions = [];
  store.session$.subscribe((s) => sessions.push(s));
  alice = session();
  store.set(alice);
});
afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

function answer<C extends ApiErrorCode>(stub: Response, request: ApiRequest<C> = HELLO as unknown as ApiRequest<C>) {
  fetchMock.mockResolvedValueOnce(stub);
  return firstValueFrom(apiCall(CONFIG, store, request));
}

describe('apiCall', () => {
  it('request shape, no body: URL, method, bearer token of the store; no Content-Type, no body', async () => {
    await answer(json(201, {}));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://api.test/hello');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token-alice' });
    expect(init.body).toBeUndefined();
  });

  it('request shape, body: Content-Type application/json and the JSON body', async () => {
    await answer(json(201, {}), CREATE);
    const [, init] = call(fetchMock);
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token-alice', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ username: 'carol' });
  });

  it('the token is read at the moment of the call', async () => {
    await answer(json(201, {}));
    store.set(session({ accessToken: 'token-b' }));
    await answer(json(201, {}));
    expect((call(fetchMock, 0)[1].headers as Record<string, string>).Authorization).toBe('Bearer access-token-alice');
    expect((call(fetchMock, 1)[1].headers as Record<string, string>).Authorization).toBe('Bearer token-b');
  });

  it('not signed in: not_signed_in, fetch never called', async () => {
    store.clear();
    expect(await firstValueFrom(apiCall(CONFIG, store, HELLO))).toEqual({
      status: 'failure',
      reason: 'not_signed_in',
      message: 'Nobody is signed in',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('2xx JSON: ok with the parsed body and the status', async () => {
    expect(await answer(json(201, { a: 1 }))).toEqual({ status: 'ok', httpStatus: 201, body: { a: 1 } });
  });

  it('2xx empty: ok with body undefined', async () => {
    expect(await answer(new Response(null, { status: 204 }))).toEqual({ status: 'ok', httpStatus: 204, body: undefined });
  });

  it('token rejected (403 without error): session_rejected, the store is cleared', async () => {
    expect(await answer(json(403, { message: 'Forbidden' }))).toEqual({ status: 'failure', reason: 'session_rejected', message: 'Forbidden' });
    expect(sessions.at(-1)).toBeNull();
  });

  it('header missing (401): session_rejected, the store is cleared', async () => {
    expect(await answer(json(401, { message: 'Unauthorized' }))).toMatchObject({ reason: 'session_rejected', message: 'Unauthorized' });
    expect(sessions.at(-1)).toBeNull();
  });

  it('401 whatever the body: session_rejected', async () => {
    expect(await answer(new Response('<html/>', { status: 401 }))).toEqual({
      status: 'failure',
      reason: 'session_rejected',
      message: 'API answered 401',
    });
  });

  it("handler's 403: forbidden with the message; the session stays", async () => {
    expect(await answer(json(403, { error: 'forbidden', message: 'Not allowed' }))).toEqual({
      status: 'failure',
      reason: 'forbidden',
      message: 'Not allowed',
    });
    expect(sessions.at(-1)).toBe(alice);
  });

  it('a code in the route list: that code', async () => {
    expect(await answer(json(409, { error: 'user_exists', message: 'exists' }), CREATE)).toMatchObject({ reason: 'user_exists' });
  });

  it('a code not in the route list: unexpected', async () => {
    const outcome = await answer(json(409, { error: 'user_exists', message: 'exists' }));
    expect(outcome).toEqual({ status: 'failure', reason: 'unexpected', message: 'exists' });
  });

  it('authorizer outage (500 without error): server; the session stays', async () => {
    expect(await answer(json(500, { message: 'Internal Server Error' }))).toMatchObject({ reason: 'server' });
    expect(sessions.at(-1)).toBe(alice);
  });

  it('throttled (429 without error): server', async () => {
    expect(await answer(json(429, { message: 'Too Many Requests' }))).toMatchObject({ reason: 'server', message: 'Too Many Requests' });
  });

  it('not JSON: server', async () => {
    expect(await answer(new Response('<html>Bad Gateway</html>', { status: 502 }))).toEqual({
      status: 'failure',
      reason: 'server',
      message: 'API answered 502 without JSON',
    });
  });

  it('JSON that is not an object: read as {}', async () => {
    expect(await answer(json(400, null))).toEqual({ status: 'failure', reason: 'unexpected', message: 'API answered 400' });
  });

  it('other (404 from API Gateway): unexpected', async () => {
    expect(await answer(json(404, { message: 'Not Found' }))).toMatchObject({ reason: 'unexpected', message: 'Not Found' });
  });

  it('offline: network; the session stays', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await firstValueFrom(apiCall(CONFIG, store, HELLO))).toEqual({
      status: 'failure',
      reason: 'network',
      message: 'TypeError: fetch failed',
    });
    expect(sessions.at(-1)).toBe(alice);
  });

  it('stale rejection: a 403 to an old token leaves the newer session', async () => {
    let answerFirst: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerFirst = resolve)));
    const outcome = firstValueFrom(apiCall(CONFIG, store, HELLO));
    const carol = session({ username: 'carol', accessToken: 'token-c' });
    store.set(carol);
    answerFirst(json(403, { message: 'Forbidden' }));
    expect(await outcome).toMatchObject({ reason: 'session_rejected' });
    expect(sessions.at(-1)).toBe(carol);
  });

  it('no leak: no outcome contains the access token', async () => {
    const outcomes: (ApiOk | ApiFailure<ApiErrorCode>)[] = [];
    for (const stub of [json(201, {}), json(403, { error: 'forbidden' }), json(500, {}), new Response('x', { status: 502 })]) {
      store.set(alice);
      outcomes.push(await answer(stub));
    }
    expect(JSON.stringify(outcomes)).not.toContain(alice.accessToken);
  });
});
