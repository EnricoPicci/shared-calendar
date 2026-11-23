import { firstValueFrom } from 'rxjs';
import { ChangePasswordService } from '../../../src/services/change-password.service';
import type { ChangePasswordConfig, ChangePasswordResult, ChangePasswordState } from '../../../src/services/change-password.types';
import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, cognitoError, json, session } from './fixtures';

// The unit tests of ChangePasswordService, docs/FRONTEND_SERVICES.md section 22.8: fetch stubbed
// with real Response objects. Every test subscribes first, then calls.

const CLOUD: ChangePasswordConfig = { cognitoUrl: 'http://cognito.test/', skipGlobalSignOut: false };
const LOCAL: ChangePasswordConfig = { cognitoUrl: 'http://cognito.test/', skipGlobalSignOut: true };
const CURRENT = 'Current-Pass-1!';
const NEXT = 'Next-Password-2?';
const ALICE = session();

// Cognito's answer to a change or a sign-out that succeeded: 200 with an empty JSON object.
function ok(): Response {
  return json(200, {}, 'application/x-amz-json-1.1');
}

let fetchMock: ReturnType<typeof vi.fn>;
// Every value either stream emitted in a test, for the leak check of each test.
let emitted: unknown[];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  emitted = [];
});
afterEach(() => {
  // No value holds either password or any token of the session (docs/FRONTEND_SERVICES.md
  // section 2, rules 6 and 9).
  const text = JSON.stringify(emitted);
  for (const secret of [CURRENT, NEXT, ALICE.accessToken, ALICE.idToken, ALICE.refreshToken]) expect(text).not.toContain(secret);
  vi.unstubAllGlobals();
});

type Run = { service: ChangePasswordService; store: SessionStore; results: ChangePasswordResult[]; states: ChangePasswordState[] };

function make(config = CLOUD, signedIn: Session | null = ALICE): Run {
  const store = new SessionStore();
  if (signedIn) store.set(signedIn);
  const service = new ChangePasswordService(config, store);
  const results: ChangePasswordResult[] = [];
  const states: ChangePasswordState[] = [];
  service.changePasswordResult$.subscribe((r) => {
    results.push(r);
    emitted.push(r);
  });
  service.changePasswordState$.subscribe((s) => {
    states.push(s);
    emitted.push(s);
  });
  return { service, store, results, states };
}

async function settled(run: Run, count = 1): Promise<ChangePasswordResult> {
  await vi.waitFor(() => expect(run.results).toHaveLength(count));
  return run.results.at(-1) as ChangePasswordResult;
}

function current(store: SessionStore): Promise<Session | null> {
  return firstValueFrom(store.session$);
}

function body(i: number): unknown {
  return JSON.parse(call(fetchMock, i)[1].body as string);
}

// Test names: the architecture is docs/ARCHITECTURE.md, which reads Cognito's errors.
describe('ChangePasswordService', () => {
  describe('a change that succeeds', () => {
    it('ChangePassword, then GlobalSignOut, then the store cleared, then the one success', async () => {
      const run = make();
      let sessionAtSignOut: Session | null | undefined;
      fetchMock.mockResolvedValueOnce(ok()).mockImplementationOnce(async () => {
        sessionAtSignOut = await current(run.store);
        return ok();
      });
      run.service.changePassword(CURRENT, NEXT);
      const result = await settled(run);

      expect(result).toEqual({ status: 'success' });
      expect(run.states).toEqual([{ status: 'idle' }, { status: 'pending' }, { status: 'success' }]);
      expect(run.states.at(-1)).toBe(result);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sessionAtSignOut).toBe(ALICE); // the store is cleared after the sign-out, not before
      expect(await current(run.store)).toBeNull();
    });

    it('sends ChangePassword with the token of the store and both passwords, then GlobalSignOut with the token', async () => {
      const run = make();
      fetchMock.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok());
      run.service.changePassword(CURRENT, NEXT);
      await settled(run);

      const [url, init] = call(fetchMock, 0);
      expect(url).toBe('http://cognito.test/');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ChangePassword',
      });
      expect(body(0)).toEqual({ AccessToken: ALICE.accessToken, PreviousPassword: CURRENT, ProposedPassword: NEXT });

      const [signOutUrl, signOut] = call(fetchMock, 1);
      expect(signOutUrl).toBe('http://cognito.test/');
      expect(signOut.method).toBe('POST');
      expect(signOut.headers).toEqual({
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.GlobalSignOut',
      });
      expect(body(1)).toEqual({ AccessToken: ALICE.accessToken });
    });

    it('a 200 with an empty body, as the local emulator may give, is a change too', async () => {
      const run = make(LOCAL);
      fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'success' });
    });

    it('the sign-out skipped by the configuration: one request, the store cleared, the same success', async () => {
      const run = make(LOCAL);
      fetchMock.mockResolvedValueOnce(ok());
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'success' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(call(fetchMock, 0)[1].headers).toMatchObject({ 'X-Amz-Target': 'AWSCognitoIdentityProviderService.ChangePassword' });
      expect(await current(run.store)).toBeNull();
    });

    it.each([
      ['refused', () => cognitoError('NotAuthorizedException', 'Access Token has been revoked')],
      ['not supported', () => cognitoError('UnsupportedOperation', 'Unsupported')],
      ['a server error', () => new Response('<html>502</html>', { status: 502 })],
      ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ])('a sign-out that fails (%s) is the same success, with the store cleared', async (_case, answer) => {
      const run = make();
      fetchMock.mockResolvedValueOnce(ok()).mockImplementationOnce(async () => answer());
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'success' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await current(run.store)).toBeNull();
    });

    it('clears the store even when a refresh replaced the session during the change', async () => {
      const run = make(LOCAL);
      const refreshed = session({ accessToken: 'access-token-refreshed' });
      fetchMock.mockImplementationOnce(async () => {
        run.store.replace(ALICE, refreshed);
        return ok();
      });
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'success' });
      expect(await current(run.store)).toBeNull();
    });

    it('reads the token at the moment of the call', async () => {
      const run = make(LOCAL);
      const bob = session({ username: 'bob', accessToken: 'access-token-bob' });
      run.store.set(bob);
      fetchMock.mockResolvedValueOnce(ok());
      run.service.changePassword(CURRENT, NEXT);
      await settled(run);
      expect(body(0)).toMatchObject({ AccessToken: 'access-token-bob' });
    });
  });

  describe('Cognito refuses the change (architecture 6.9, row 2): the store is kept, no sign-out', () => {
    it.each([
      ['NotAuthorizedException', 'wrong_current_password'],
      ['InvalidPasswordException', 'wrong_current_password'],
      ['LimitExceededException', 'too_many_attempts'],
      ['TooManyRequestsException', 'too_many_attempts'],
      ['PasswordHistoryPolicyViolationException', 'unexpected'],
      ['PasswordResetRequiredException', 'unexpected'],
      ['UserNotFoundException', 'unexpected'],
      ['InvalidParameterException', 'unexpected'],
      ['SomethingElseException', 'unexpected'],
    ])('%s: %s with Cognito\'s message', async (type, reason) => {
      const run = make();
      fetchMock.mockResolvedValueOnce(cognitoError(type, 'Cognito says no'));
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'failure', reason, message: 'Cognito says no' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await current(run.store)).toBe(ALICE);
    });

    it('reads the error class behind a namespace prefix', async () => {
      const run = make();
      fetchMock.mockResolvedValueOnce(json(400, { __type: 'com.amazonaws.cognito#NotAuthorizedException', message: 'Incorrect username or password.' }));
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toMatchObject({ reason: 'wrong_current_password' });
    });

    it.each([
      ['a 500 without an error class', () => json(500, {}), 'server', 'Cognito answered 500'],
      ['a 502 that is not JSON', () => new Response('<html>bad gateway</html>', { status: 502 }), 'server', 'Cognito answered 502 without JSON'],
      ['a 400 whose JSON is not an object', () => json(400, null), 'unexpected', 'Cognito answered 400'],
      ['a 400 whose message is not a string', () => json(400, { __type: 'NotAuthorizedException', message: 42 }), 'wrong_current_password', 'Cognito answered 400'],
      ['a 2xx that is not 200', () => json(202, {}), 'unexpected', 'Cognito answered 202'],
    ])('%s: %s', async (_case, answer, reason, message) => {
      const run = make();
      fetchMock.mockImplementationOnce(async () => answer());
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'failure', reason, message });
      expect(await current(run.store)).toBe(ALICE);
    });

    it('offline: network, the store kept; the next call succeeds (the subject is alive)', async () => {
      const run = make(LOCAL);
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok());
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(await current(run.store)).toBe(ALICE);
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run, 2)).toEqual({ status: 'success' });
    });
  });

  describe('refused before any request', () => {
    it.each([
      ['too short', 'Next-Pass-2', ['too_short']],
      ['too long', `Next-Pass-2${'x'.repeat(246)}`, ['too_long']],
      ['no upper-case letter', 'next-password-2?', ['no_uppercase']],
      ['no lower-case letter', 'NEXT-PASSWORD-2?', ['no_lowercase']],
      ['no digit', 'Next-Password-?', ['no_digit']],
      ['no symbol', 'NextPassword22', ['no_symbol']],
      ['a space', 'Next Password-2?', ['blank']],
      ['a tab', 'Next\tPassword-2?', ['blank']],
      ['several', 'next', ['too_short', 'no_uppercase', 'no_digit', 'no_symbol']],
    ])('a new password with %s: new_password_refused with what it misses, nothing sent, the store kept', async (_case, next, problems) => {
      const run = make();
      run.service.changePassword(CURRENT, next);
      const result = await settled(run);
      expect(result).toEqual({ status: 'failure', reason: 'new_password_refused', message: `The new password is refused: ${problems.join(', ')}`, problems });
      expect(run.states).toEqual([{ status: 'idle' }, { status: 'pending' }, result]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await current(run.store)).toBe(ALICE);
    });

    it('a new password equal to the current one: same_as_current, nothing sent', async () => {
      const run = make();
      run.service.changePassword(CURRENT, CURRENT);
      expect(await settled(run)).toMatchObject({ reason: 'new_password_refused', problems: ['same_as_current'] });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('equal to the current one and against the rule: both said, the rule first', async () => {
      const run = make();
      run.service.changePassword('short', 'short');
      expect(await settled(run)).toMatchObject({ problems: ['too_short', 'no_uppercase', 'no_digit', 'no_symbol', 'same_as_current'] });
    });

    it('nobody signed in: not_signed_in, nothing sent', async () => {
      const run = make(CLOUD, null);
      run.service.changePassword(CURRENT, NEXT);
      const result = await settled(run);
      expect(result).toEqual({ status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' });
      expect(run.states).toEqual([{ status: 'idle' }, { status: 'pending' }, result]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('nobody signed in and a refused new password: the rule answers first', async () => {
      const run = make(CLOUD, null);
      run.service.changePassword(CURRENT, 'short');
      expect(await settled(run)).toMatchObject({ reason: 'new_password_refused' });
    });
  });

  describe('the pattern', () => {
    it('a second call abandons the first: its request is aborted, one result', async () => {
      const run = make(LOCAL);
      fetchMock.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(ok());
      run.service.changePassword(CURRENT, NEXT);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      run.service.changePassword(CURRENT, NEXT);
      expect(await settled(run)).toEqual({ status: 'success' });
      expect((call(fetchMock, 0)[1].signal as AbortSignal).aborted).toBe(true);
      expect(run.results).toHaveLength(1);
    });

    it('a late subscriber gets the last result and the current state', async () => {
      const run = make();
      fetchMock.mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'));
      run.service.changePassword(CURRENT, NEXT);
      const result = await settled(run);
      expect(await firstValueFrom(run.service.changePasswordResult$)).toBe(result);
      expect(await firstValueFrom(run.service.changePasswordState$)).toBe(result);
    });

    it('the service keeps neither password on itself', async () => {
      const run = make(LOCAL);
      fetchMock.mockResolvedValueOnce(ok());
      run.service.changePassword(CURRENT, NEXT);
      await settled(run);
      // Its fields are the two subjects, their streams, the configuration, the store and the
      // subscription in flight: no string among them, so no password.
      expect(Object.values(run.service).filter((value) => typeof value === 'string')).toEqual([]);
      expect(Object.keys(run.service).sort()).toEqual(
        ['changePasswordResult$', 'changePasswordState$', 'config', 'pending', 'resultSubject', 'stateSubject', 'store'].sort(),
      );
    });
  });
});
