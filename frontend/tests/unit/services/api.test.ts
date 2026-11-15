import type { ApiErrorCode } from '@shared-calendar/shared';
import { firstValueFrom } from 'rxjs';
import { apiCall, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk, type ApiRequest } from '../../../src/services/api';
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

// v6 (spec 16.1, decisions 29–30): the methods GET, PUT and PATCH, the query string, conflicts.

describe('apiCall, v6', () => {
  it.each([
    ['GET', undefined],
    ['PUT', { name: 'x' }],
    ['PATCH', { note: null }],
  ] as const)('%s: that method; a body only when given', async (method, body) => {
    const request = { method, path: '/calendar/types', codes: [], ...(body === undefined ? {} : { body }) } as ApiRequest<never>;
    await answer(json(200, {}), request);
    const [, init] = call(fetchMock);
    expect(init.method).toBe(method);
    expect(init.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(body);
  });

  it('the compiler refuses a body on GET and DELETE', () => {
    // @ts-expect-error GET takes no body
    const get: ApiRequest<never> = { method: 'GET', path: '/x', body: {}, codes: [] };
    // @ts-expect-error DELETE takes no body
    const del: ApiRequest<never> = { method: 'DELETE', path: '/x', body: {}, codes: [] };
    expect([get.method, del.method]).toEqual(['GET', 'DELETE']);
  });

  it.each([
    ['absent', undefined, 'http://api.test/calendar'],
    ['empty', {}, 'http://api.test/calendar'],
    ['two keys, in the order given', { to: '2026-11-22', from: '2026-11-16' }, 'http://api.test/calendar?to=2026-11-22&from=2026-11-16'],
    ['encoded', { username: 'a b&c=d', note: 'é/?' }, 'http://api.test/calendar?username=a+b%26c%3Dd&note=%C3%A9%2F%3F'],
  ])('query %s: %s', async (_name, query, url) => {
    await answer(json(200, {}), { method: 'GET', path: '/calendar', query, codes: [] });
    expect(call(fetchMock)[0]).toBe(url);
  });

  const CONFLICT = { appointmentId: '01JCZZZZZZZZZZZZZZZZZZZZZZ', username: 'alice', start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z' };
  const CONFLICT_ROUTE: ApiRequest<'availability_conflict' | 'availability_overlap'> = {
    method: 'DELETE',
    path: '/calendar/windows/x',
    codes: ['availability_conflict', 'availability_overlap'],
  };
  function conflict(conflicts: unknown) {
    return answer(json(409, { error: 'availability_conflict', message: 'm', conflicts }), CONFLICT_ROUTE);
  }

  it('availability_conflict: the conflicts list', async () => {
    expect(await conflict([CONFLICT])).toEqual({ status: 'failure', reason: 'availability_conflict', message: 'm', conflicts: [CONFLICT] });
  });

  it('availability_conflict: malformed entries dropped, extra fields not copied', async () => {
    const outcome = await conflict([
      { ...CONFLICT, note: 'private' },
      { ...CONFLICT, end: 1 },
      { appointmentId: 'x', username: 'y', start: 'z' },
      null,
      'alice',
    ]);
    expect(outcome).toMatchObject({ reason: 'availability_conflict', conflicts: [CONFLICT] });
  });

  it.each([
    ['missing', undefined],
    ['not an array', { 0: CONFLICT }],
    ['null', null],
  ])('availability_conflict, conflicts %s: []', async (_name, conflicts) => {
    expect(await conflict(conflicts)).toMatchObject({ reason: 'availability_conflict', conflicts: [] });
  });

  it('another code: no conflicts field, even when the body has one', async () => {
    const outcome = await answer(json(409, { error: 'availability_overlap', message: 'm', conflicts: [CONFLICT] }), CONFLICT_ROUTE);
    expect(outcome).toEqual({ status: 'failure', reason: 'availability_overlap', message: 'm' });
  });

  it('availability_conflict outside the route list: unexpected, no conflicts', async () => {
    const outcome = await answer(json(409, { error: 'availability_conflict', message: 'm', conflicts: [CONFLICT] }));
    expect(outcome).toEqual({ status: 'failure', reason: 'unexpected', message: 'm' });
  });
});

describe('invalidRequest, hasString, unexpectedAnswer', () => {
  it('the first issue with its field path joined by "."', () => {
    expect(invalidRequest({ issues: [{ path: ['windows', 1, 'end'], message: 'end must be after start' }, { path: ['x'], message: 'y' }] })).toEqual({
      status: 'failure',
      reason: 'invalid_request',
      message: 'windows.1.end: end must be after start',
    });
  });

  it('without a path: the message alone', () => {
    expect(invalidRequest({ issues: [{ path: [], message: 'Unrecognized key: "x"' }] }).message).toBe('Unrecognized key: "x"');
  });

  it('no issue at all (never from zod): a generic message', () => {
    expect(invalidRequest({ issues: [] }).message).toBe('invalid input');
  });

  it.each([
    [{ id: 'a' }, true],
    [{ id: 1 }, false],
    [{}, false],
    [null, false],
    ['id', false],
    [undefined, false],
  ])('hasString(%j, "id"): %s', (value, expected) => {
    expect(hasString(value, 'id')).toBe(expected);
  });

  it('unexpectedAnswer names the status', () => {
    expect(unexpectedAnswer({ status: 'ok', httpStatus: 202, body: {} })).toEqual({
      status: 'failure',
      reason: 'unexpected',
      message: 'API answered 202 with an unexpected body',
    });
  });
});
