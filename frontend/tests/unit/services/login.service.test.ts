import { LoginService, type LoginConfig } from '../../../src/services/login.service';
import type { LoginResult, LoginState, Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';

// The unit tests of LoginService (docs/FRONTEND_SERVICES.md sections 6 and 9.8): the session goes
// to the store, and the outcome carries no token. The global fetch is a stub answering with real
// Response objects, so fromFetch runs unchanged. Every test subscribes first, then calls login.

const CONFIG: LoginConfig = { cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
const PASSWORD = 'Secret-Pass-1!';
// 15 minutes ahead, in seconds since the epoch: the store arms its expiry timer on it
// (docs/FRONTEND_SERVICES.md section 9.3).
const EXP = Math.floor(Date.now() / 1000) + 900;

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function jwt(claims: Record<string, unknown>): string {
  return `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(claims))}.signature`;
}
function tokens(claims: Record<string, unknown>): Response {
  return json(200, {
    AuthenticationResult: {
      AccessToken: jwt(claims),
      IdToken: 'id-token',
      RefreshToken: 'refresh-token',
      ExpiresIn: 900,
      TokenType: 'Bearer',
    },
    ChallengeParameters: {},
  });
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/x-amz-json-1.1' } });
}
function cognitoError(type: string, message: string): Response {
  return json(400, { __type: type, message });
}
const ALICE = { username: 'alice', 'cognito:groups': ['user'], exp: EXP };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// A service with both streams recorded, as a consumer would subscribe before calling login.
function subscribed() {
  const store = new SessionStore();
  const service = new LoginService(CONFIG, store);
  const results: LoginResult[] = [];
  const states: LoginState[] = [];
  const sessions: (Session | null)[] = [];
  service.loginResult$.subscribe((r) => results.push(r));
  service.loginState$.subscribe((s) => states.push(s));
  store.session$.subscribe((s) => sessions.push(s));
  return { service, store, results, states, sessions };
}

async function loginOnce(answer: Response | (() => Promise<Response>), username = 'alice') {
  fetchMock.mockImplementationOnce(typeof answer === 'function' ? answer : () => Promise.resolve(answer));
  const s = subscribed();
  s.service.login(username, PASSWORD);
  await vi.waitFor(() => expect(s.results).toHaveLength(1));
  return { ...s, result: s.results[0] as LoginResult };
}

describe('LoginService', () => {
  it('success: emits username, role and expiry, no token; state idle → pending → success', async () => {
    const { result, states } = await loginOnce(tokens(ALICE));
    expect(result).toEqual({ status: 'success', username: 'alice', role: 'user', expiresAt: new Date(EXP * 1000) });
    expect(states).toEqual([{ status: 'idle' }, { status: 'pending', username: 'alice' }, result]);
    expect(states[2]).toBe(result); // the same object in both streams
  });

  it('login writes: the store holds the session with the three tokens before the outcome is emitted', async () => {
    fetchMock.mockResolvedValueOnce(tokens(ALICE));
    const { service, store, sessions } = subscribed();
    let inStoreAtEmit: Session | null | undefined;
    service.loginResult$.subscribe(() => (inStoreAtEmit = sessions.at(-1)));
    service.login('alice', PASSWORD);
    await vi.waitFor(() => expect(inStoreAtEmit).toBeDefined());
    const expected: Session = {
      username: 'alice',
      role: 'user',
      accessToken: jwt(ALICE),
      idToken: 'id-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(EXP * 1000),
    };
    expect(inStoreAtEmit).toEqual(expected);
    expect(sessions).toEqual([null, expected]);
    store.clear(); // stops the expiry timer
  });

  it('login failure: an existing session stays in the store', async () => {
    fetchMock.mockResolvedValueOnce(tokens(ALICE)).mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'no'));
    const { service, store, results, sessions } = subscribed();
    service.login('alice', PASSWORD);
    await vi.waitFor(() => expect(results).toHaveLength(1));
    service.login('alice', 'wrong');
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results[1]?.status).toBe('failure');
    expect(sessions).toHaveLength(2);
    expect(sessions[1]?.username).toBe('alice');
    store.clear();
  });

  it('request shape: one POST to the configured URL with the InitiateAuth headers and body', async () => {
    await loginOnce(tokens(ALICE));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://cognito.test/');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-123',
      AuthParameters: { USERNAME: 'alice', PASSWORD },
    });
  });

  it('admin wins: groups user and admin give role admin', async () => {
    const { result } = await loginOnce(tokens({ ...ALICE, 'cognito:groups': ['user', 'admin'] }));
    expect(result.status === 'success' && result.role).toBe('admin');
  });

  it('no group: failure no_role, and the state ends in that failure', async () => {
    const { result, states } = await loginOnce(tokens({ username: 'bob', exp: EXP }));
    expect(result).toMatchObject({ status: 'failure', reason: 'no_role' });
    expect(states.at(-1)).toBe(result);
  });

  it('wrong password: failure invalid_credentials with Cognito message', async () => {
    const { result } = await loginOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'));
    expect(result).toEqual({ status: 'failure', reason: 'invalid_credentials', message: 'Incorrect username or password.' });
  });

  it('unknown user (UserNotFoundException, namespaced __type): failure invalid_credentials', async () => {
    const { result } = await loginOnce(cognitoError('com.amazonaws.cognito#UserNotFoundException', 'User does not exist.'));
    expect(result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
  });

  it('wrong password on cognito-local (InvalidPasswordException): failure invalid_credentials', async () => {
    const { result } = await loginOnce(cognitoError('InvalidPasswordException', 'Invalid password'));
    expect(result).toEqual({ status: 'failure', reason: 'invalid_credentials', message: 'Invalid password' });
  });

  it('throttled: failure too_many_attempts', async () => {
    const { result } = await loginOnce(cognitoError('TooManyRequestsException', 'Too many requests'));
    expect(result).toMatchObject({ status: 'failure', reason: 'too_many_attempts' });
  });

  it('password reset required: failure password_reset_required', async () => {
    const { result } = await loginOnce(cognitoError('PasswordResetRequiredException', 'Password reset required'));
    expect(result).toMatchObject({ status: 'failure', reason: 'password_reset_required' });
  });

  it('unknown error class: failure unexpected', async () => {
    const { result } = await loginOnce(cognitoError('SomethingElseException', 'Odd'));
    expect(result).toEqual({ status: 'failure', reason: 'unexpected', message: 'Odd' });
  });

  it('5xx JSON without __type or message: failure server with the status', async () => {
    const { result } = await loginOnce(json(503, {}));
    expect(result).toEqual({ status: 'failure', reason: 'server', message: 'Cognito answered 503' });
  });

  it('non-JSON 502: failure server', async () => {
    const { result } = await loginOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(result).toEqual({ status: 'failure', reason: 'server', message: 'Cognito answered 502 without JSON' });
  });

  it('JSON that is not an object: read as an empty body', async () => {
    const { result } = await loginOnce(json(400, null));
    expect(result).toEqual({ status: 'failure', reason: 'unexpected', message: 'Cognito answered 400' });
  });

  it('challenge: 200 with a ChallengeName other than NEW_PASSWORD_REQUIRED and no AuthenticationResult gives failure challenge', async () => {
    const { result } = await loginOnce(json(200, { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's' }));
    expect(result).toMatchObject({ status: 'failure', reason: 'challenge' });
  });

  it('unreadable access token: failure unexpected (not network)', async () => {
    const { result } = await loginOnce(json(200, { AuthenticationResult: { AccessToken: 'not-a-jwt' } }));
    expect(result).toMatchObject({ status: 'failure', reason: 'unexpected' });
  });

  it('access token without username or exp: failure unexpected', async () => {
    const { result } = await loginOnce(tokens({ 'cognito:groups': ['user'] }));
    expect(result).toMatchObject({ status: 'failure', reason: 'unexpected' });
  });

  it('missing id or refresh token: failure unexpected', async () => {
    const { result } = await loginOnce(json(200, { AuthenticationResult: { AccessToken: jwt(ALICE) } }));
    expect(result).toMatchObject({ status: 'failure', reason: 'unexpected' });
  });

  it('offline: fetch rejects with TypeError, failure network, and the subject is still alive', async () => {
    const { service, results } = await loginOnce(() => Promise.reject(new TypeError('fetch failed')));
    expect(results[0]).toEqual({ status: 'failure', reason: 'network', message: 'TypeError: fetch failed' });

    fetchMock.mockResolvedValueOnce(tokens(ALICE));
    service.login('alice', PASSWORD);
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results[1]?.status).toBe('success');
  });

  it('offline with a non-Error rejection: failure network with its text', async () => {
    const { result } = await loginOnce(() => Promise.reject('down'));
    expect(result).toEqual({ status: 'failure', reason: 'network', message: 'down' });
  });

  it('retry after failure: two results, the second a success (no error or complete reached the subject)', async () => {
    fetchMock
      .mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'))
      .mockResolvedValueOnce(tokens(ALICE));
    const { service, results, states } = subscribed();
    service.login('alice', 'wrong');
    await vi.waitFor(() => expect(results).toHaveLength(1));
    service.login('alice', PASSWORD);
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results.map((r) => r.status)).toEqual(['failure', 'success']);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'failure', 'pending', 'success']);
  });

  it('cancel: a second login aborts the pending request; only the second answer is emitted', async () => {
    let firstSignal: AbortSignal | undefined;
    let answerFirst: (r: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        firstSignal = init.signal ?? undefined;
        // Answers only when the test says so, even after the abort: proves the late answer is ignored.
        return new Promise<Response>((resolve) => (answerFirst = resolve));
      })
      .mockResolvedValueOnce(tokens(ALICE));
    const { service, results, states } = subscribed();

    service.login('bob', PASSWORD);
    expect(firstSignal?.aborted).toBe(false);
    service.login('alice', PASSWORD);
    expect(firstSignal?.aborted).toBe(true);

    await vi.waitFor(() => expect(results).toHaveLength(1));
    answerFirst(cognitoError('NotAuthorizedException', 'late'));
    await new Promise((r) => setTimeout(r, 10));

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: 'success', username: 'alice' });
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'pending', 'success']);
  });

  it('late subscriber: the result is replayed and the state is the current success', async () => {
    fetchMock.mockResolvedValueOnce(tokens(ALICE));
    const service = new LoginService(CONFIG, new SessionStore());
    const early: LoginResult[] = [];
    service.loginResult$.subscribe((r) => early.push(r));
    service.login('alice', PASSWORD);
    await vi.waitFor(() => expect(early).toHaveLength(1));

    const lateResults: LoginResult[] = [];
    const lateStates: LoginState[] = [];
    service.loginResult$.subscribe((r) => lateResults.push(r));
    service.loginState$.subscribe((s) => lateStates.push(s));
    expect(lateResults).toEqual(early);
    expect(lateStates).toEqual([early[0]]);
  });

  it('a subscriber before any login receives no result, and state idle', () => {
    const { results, states } = subscribed();
    expect(results).toEqual([]);
    expect(states).toEqual([{ status: 'idle' }]);
  });

  it('no leak: no state or result value contains the password or a token', async () => {
    fetchMock
      .mockResolvedValueOnce(tokens(ALICE))
      .mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const { service, results, states } = subscribed();
    for (let i = 1; i <= 3; i++) {
      service.login('alice', PASSWORD);
      await vi.waitFor(() => expect(results).toHaveLength(i));
    }
    for (const secret of [PASSWORD, jwt(ALICE), 'id-token', 'refresh-token']) {
      expect(JSON.stringify(results)).not.toContain(secret);
      expect(JSON.stringify(states)).not.toContain(secret);
    }
    expect(JSON.stringify(Object.entries(service).filter(([k]) => k === 'config'))).not.toContain(PASSWORD);
  });
});

// docs/FRONTEND_SERVICES.md section 4.4: back to the first state, for a sign-out.
describe('LoginService.reset', () => {
  it('after a success: idle, nothing replayed, the name in no current value, the store untouched', async () => {
    const { service, states, sessions } = await loginOnce(tokens(ALICE));
    const signedIn = sessions.at(-1);
    service.reset();
    expect(states.at(-1)).toEqual({ status: 'idle' });
    expect(sessions.at(-1)).toBe(signedIn);

    const lateResults: LoginResult[] = [];
    const lateStates: LoginState[] = [];
    service.loginResult$.subscribe((r) => lateResults.push(r));
    service.loginState$.subscribe((s) => lateStates.push(s));
    expect(lateResults).toEqual([]);
    expect(lateStates).toEqual([{ status: 'idle' }]);
    expect(JSON.stringify([lateResults, lateStates])).not.toContain('alice');
  });

  it('while pending: the request is aborted and its late answer reports nothing and signs nobody in', async () => {
    let signal: AbortSignal | undefined;
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => (answer = resolve));
    });
    const { service, results, states, sessions } = subscribed();
    service.login('alice', PASSWORD);
    service.reset();
    expect(signal?.aborted).toBe(true);
    answer(tokens(ALICE));
    await new Promise((r) => setTimeout(r, 10));
    expect(results).toEqual([]);
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'idle']);
    expect(sessions).toEqual([null]);
  });

  it('keeps the subscribers: one of before receives the next login, and nothing in between', async () => {
    fetchMock.mockResolvedValueOnce(tokens(ALICE)).mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'no'));
    const { service, results } = subscribed();
    service.login('alice', PASSWORD);
    await vi.waitFor(() => expect(results).toHaveLength(1));
    service.reset();
    expect(results).toHaveLength(1);
    service.login('alice', 'wrong');
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results.map((r) => r.status)).toEqual(['success', 'failure']);
  });

  it('before any login: idle, no result, no request', () => {
    const { service, results, states } = subscribed();
    service.reset();
    expect(results).toEqual([]);
    expect(states).toEqual([{ status: 'idle' }, { status: 'idle' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// docs/FRONTEND_SERVICES.md section 4.9: an account whose password is temporary. The challenge's
// session is a secret: no state or result holds it.
describe('LoginService, a temporary password', () => {
  const SESSION = 'challenge-session-xyz';
  const TEMPORARY = 'Temp-Pass-1!x';
  const CHOSEN = 'Chosen-Pass-2?';
  const ANNA = { username: 'anna', 'cognito:groups': ['user'], exp: EXP };
  const challenge = () => json(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: SESSION, ChallengeParameters: { userAttributes: '{}' } });

  // Signs in with the temporary password and waits for the challenge.
  async function challenged() {
    fetchMock.mockResolvedValueOnce(challenge());
    const s = subscribed();
    s.service.login('anna', TEMPORARY);
    await vi.waitFor(() => expect(s.results).toHaveLength(1));
    return s;
  }

  // The new password, and the one outcome it brings.
  async function choose(s: Awaited<ReturnType<typeof challenged>>, password: string) {
    const before = s.results.length;
    s.service.choosePassword(password);
    await vi.waitFor(() => expect(s.results).toHaveLength(before + 1));
    return s.results.at(-1) as LoginResult;
  }

  it('the sign-in: new_password_required with the username, no session in any value, the store empty; states idle, pending, the result', async () => {
    const { results, states, sessions } = await challenged();
    expect(results).toEqual([{ status: 'new_password_required', username: 'anna' }]);
    expect(states).toEqual([{ status: 'idle' }, { status: 'pending', username: 'anna' }, results[0]]);
    expect(states[2]).toBe(results[0]);
    expect(sessions).toEqual([null]);
  });

  it('a good new password: RespondToAuthChallenge with the session, state answering, then signed in as by a sign-in', async () => {
    const s = await challenged();
    fetchMock.mockResolvedValueOnce(tokens(ANNA));
    const result = await choose(s, CHOSEN);
    expect(result).toEqual({ status: 'success', username: 'anna', role: 'user', expiresAt: new Date(EXP * 1000) });
    expect(s.states.slice(3)).toEqual([{ status: 'answering', username: 'anna' }, result]);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.RespondToAuthChallenge');
    expect(JSON.parse(init.body as string)).toEqual({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: 'client-123',
      Session: SESSION,
      ChallengeResponses: { USERNAME: 'anna', NEW_PASSWORD: CHOSEN },
    });
    expect(s.sessions.at(-1)).toMatchObject({ username: 'anna', role: 'user', accessToken: jwt(ANNA), refreshToken: 'refresh-token' });
    // The challenge is closed: a second new password sends nothing.
    s.service.choosePassword(CHOSEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    s.store.clear();
  });

  it('a new password the shared rule refuses: no request, its problems, and the challenge still open', async () => {
    const s = await challenged();
    const result = await choose(s, 'short');
    expect(result).toEqual({
      status: 'new_password_required',
      username: 'anna',
      refusal: { reason: 'new_password_refused', problems: ['too_short', 'no_uppercase', 'no_digit', 'no_symbol'] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(tokens(ANNA));
    expect(await choose(s, CHOSEN)).toMatchObject({ status: 'success' });
    s.store.clear();
  });

  it("Cognito's 3 minutes are over (NotAuthorizedException): the failure session_expired, the challenge forgotten, the store empty", async () => {
    const s = await challenged();
    fetchMock.mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Invalid session for the user, session is expired.'));
    expect(await choose(s, CHOSEN)).toEqual({ status: 'failure', reason: 'session_expired', message: 'Invalid session for the user, session is expired.' });
    s.service.choosePassword(CHOSEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(s.sessions).toEqual([null]);
  });

  it.each([
    ['Cognito refuses the password', () => Promise.resolve(cognitoError('InvalidPasswordException', 'Password does not conform to policy')), 'password_refused'],
    ['too many attempts', () => Promise.resolve(cognitoError('LimitExceededException', 'Attempt limit exceeded')), 'too_many_attempts'],
    ['a server failure', () => Promise.resolve(json(500, {})), 'server'],
    ['offline', () => Promise.reject(new TypeError('fetch failed')), 'network'],
  ])('%s: still new_password_required with the refusal %s, and the challenge still open', async (_name, answer, reason) => {
    const s = await challenged();
    fetchMock.mockImplementationOnce(answer);
    const result = await choose(s, CHOSEN);
    expect(result).toMatchObject({ status: 'new_password_required', username: 'anna', refusal: { reason } });
    expect(s.sessions).toEqual([null]);
    fetchMock.mockResolvedValueOnce(tokens(ANNA));
    expect(await choose(s, CHOSEN)).toMatchObject({ status: 'success' });
    expect(JSON.parse((fetchMock.mock.calls[2] as [string, RequestInit])[1].body as string).Session).toBe(SESSION);
    s.store.clear();
  });

  it('the answer gives tokens of an account in no group: the failure no_role, the challenge closed, the store empty', async () => {
    const s = await challenged();
    fetchMock.mockResolvedValueOnce(tokens({ username: 'anna', exp: EXP }));
    expect(await choose(s, CHOSEN)).toMatchObject({ status: 'failure', reason: 'no_role' });
    s.service.choosePassword(CHOSEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(s.sessions).toEqual([null]);
  });

  it('without a challenge: choosePassword sends nothing and changes no state', () => {
    const { service, results, states } = subscribed();
    service.choosePassword(CHOSEN);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    expect(states).toEqual([{ status: 'idle' }]);
  });

  it('reset() (Cancel): idle, nothing replayed, and the challenge forgotten', async () => {
    const s = await challenged();
    s.service.reset();
    expect(s.states.at(-1)).toEqual({ status: 'idle' });
    const late: LoginResult[] = [];
    s.service.loginResult$.subscribe((r) => late.push(r));
    expect(late).toEqual([]);
    s.service.choosePassword(CHOSEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a new sign-in forgets the challenge, even before its answer', async () => {
    const s = await challenged();
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    s.service.login('anna', TEMPORARY);
    s.service.choosePassword(CHOSEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(s.states.at(-1)).toEqual({ status: 'pending', username: 'anna' });
  });

  it('a second new password while the first is on its way: the first is aborted and never reports', async () => {
    const s = await challenged();
    let signal: AbortSignal | undefined;
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => (answer = resolve));
    });
    s.service.choosePassword(CHOSEN);
    fetchMock.mockResolvedValueOnce(tokens(ANNA));
    const result = await choose(s, CHOSEN);
    expect(signal?.aborted).toBe(true);
    answer(cognitoError('NotAuthorizedException', 'late'));
    await new Promise((r) => setTimeout(r, 10));
    expect(result).toMatchObject({ status: 'success' });
    expect(s.results.map((r) => r.status)).toEqual(['new_password_required', 'success']);
    s.store.clear();
  });

  it('no leak: no state or result holds the session, a password or a token', async () => {
    const s = await challenged();
    await choose(s, 'weak');
    fetchMock.mockResolvedValueOnce(cognitoError('InvalidPasswordException', 'refused'));
    await choose(s, CHOSEN);
    fetchMock.mockResolvedValueOnce(tokens(ANNA));
    await choose(s, CHOSEN);
    for (const secret of [SESSION, TEMPORARY, CHOSEN, 'weak', jwt(ANNA), 'id-token', 'refresh-token']) {
      expect(JSON.stringify(s.results)).not.toContain(secret);
      expect(JSON.stringify(s.states)).not.toContain(secret);
    }
    s.store.clear();
  });
});
