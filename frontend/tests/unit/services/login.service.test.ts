import { LoginService, type LoginConfig } from '../../../src/services/login.service';
import type { LoginResult, LoginState } from '../../../src/services/login.types';

// docs/FRONTEND_SERVICES.md section 6. The global fetch is a stub answering with real Response
// objects, so fromFetch runs unchanged. Every test subscribes first, then calls login.

const CONFIG: LoginConfig = { cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
const PASSWORD = 'Secret-Pass-1!';
const EXP = 1_900_000_000; // seconds since the epoch

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
  const service = new LoginService(CONFIG);
  const results: LoginResult[] = [];
  const states: LoginState[] = [];
  service.loginResult$.subscribe((r) => results.push(r));
  service.loginState$.subscribe((s) => states.push(s));
  return { service, results, states };
}

async function loginOnce(answer: Response | (() => Promise<Response>), username = 'alice') {
  fetchMock.mockImplementationOnce(typeof answer === 'function' ? answer : () => Promise.resolve(answer));
  const s = subscribed();
  s.service.login(username, PASSWORD);
  await vi.waitFor(() => expect(s.results).toHaveLength(1));
  return { ...s, result: s.results[0] as LoginResult };
}

describe('LoginService', () => {
  it('success: emits a session with username, role and expiry; state idle → pending → success', async () => {
    const { result, states } = await loginOnce(tokens(ALICE));
    expect(result).toEqual({
      status: 'success',
      session: {
        username: 'alice',
        role: 'user',
        accessToken: jwt(ALICE),
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(EXP * 1000),
      },
    });
    expect(states).toEqual([{ status: 'idle' }, { status: 'pending', username: 'alice' }, result]);
    expect(states[2]).toBe(result); // the same object in both streams
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
    expect(result.status === 'success' && result.session.role).toBe('admin');
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

  it('challenge: 200 with ChallengeName and no AuthenticationResult gives failure challenge', async () => {
    const { result } = await loginOnce(json(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's' }));
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
    expect(results[0]).toMatchObject({ status: 'success', session: { username: 'alice' } });
    expect(states.map((s) => s.status)).toEqual(['idle', 'pending', 'pending', 'success']);
  });

  it('late subscriber: the result is replayed and the state is the current success', async () => {
    fetchMock.mockResolvedValueOnce(tokens(ALICE));
    const service = new LoginService(CONFIG);
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

  it('no leak: no state or result value contains the password', async () => {
    fetchMock
      .mockResolvedValueOnce(tokens(ALICE))
      .mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const { service, results, states } = subscribed();
    for (let i = 1; i <= 3; i++) {
      service.login('alice', PASSWORD);
      await vi.waitFor(() => expect(results).toHaveLength(i));
    }
    expect(JSON.stringify(results)).not.toContain(PASSWORD);
    expect(JSON.stringify(states)).not.toContain(PASSWORD);
    expect(JSON.stringify(Object.entries(service).filter(([k]) => k === 'config'))).not.toContain(PASSWORD);
  });
});
