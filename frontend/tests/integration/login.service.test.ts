import type { HelloResponse, MeResponse } from '@shared-calendar/shared';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { decodeClaims } from '../../src/services/jwt';
import { LoginService } from '../../src/services/login.service';
import type { LoginResult, Session } from '../../src/services/login.types';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, cognito, current, newUser, outcome, PASSWORDS, setTemporaryPassword, signedIn, signIn } from './local';

// docs/FRONTEND_SERVICES.md sections 7 and 9.9, against the back end's local stack:
// `DYNAMODB_PORT=8002 npm run local:up -w backend` (cognito-local on 9229, writes env.local.json)
// and `npm run local:api -w backend` (the API on 3000). Runs only with RUN_INTEGRATION=1.
// The session, with its tokens, is read from the SessionStore; the outcome carries none.

let aliceSession: Session | null = null;

// cognito-local issues 24-hour access tokens and ignores the pool's 15-minute validity
// (docs/ARCHITECTURE.md section 8, note on Cognito emulation). The 15 minutes are a cloud property;
// here the check is that expiresAt is the token's own `exp`, in the future.
it('alice signs in: success, role user, no token in the outcome; the store holds her session', async () => {
  const { result, store } = await signIn('alice', PASSWORDS.alice);
  if (result.status !== 'success') throw new Error(`expected success, got ${JSON.stringify(result)}`);
  expect(Object.keys(result).sort()).toEqual(['expiresAt', 'role', 'status', 'username']);
  expect(result.username).toBe('alice');
  expect(result.role).toBe('user');

  const session = await current(store);
  if (!session) throw new Error('the store is empty after a successful login');
  expect(session).toMatchObject({ username: 'alice', role: 'user', expiresAt: result.expiresAt });
  const exp = decodeClaims(session.accessToken).exp as number;
  expect(session.expiresAt.getTime()).toBe(exp * 1000);
  const minutesAhead = (session.expiresAt.getTime() - Date.now()) / 60_000;
  expect(minutesAhead).toBeGreaterThan(0);
  expect(minutesAhead).toBeLessThanOrEqual(24 * 60);
  expect(session.idToken).not.toBe('');
  expect(session.refreshToken).not.toBe('');
  aliceSession = session;
  store.clear(); // stops the expiry timer
});

it('admin signs in: role admin', async () => {
  const { result, store } = await signIn('admin', PASSWORDS.admin);
  expect(result).toMatchObject({ status: 'success', username: 'admin', role: 'admin' });
  store.clear();
});

// cognito-local answers InvalidPasswordException here (real Cognito: NotAuthorizedException);
// the service maps both to invalid_credentials.
it('alice with a wrong password: failure invalid_credentials, the store stays empty', async () => {
  const { result, store } = await signIn('alice', 'Wrong-Pass-1!');
  expect(result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
  expect(await current(store)).toBeNull();
});

it('an unknown user: the same failure as a wrong password', async () => {
  const { result } = await signIn('nobody-here', 'Whatever-Pass-1!');
  expect(result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
});

it("the store's access token is accepted by POST /hello: the session and the authorizer agree", async () => {
  if (!aliceSession) throw new Error('alice did not sign in');
  const res = await fetch(`${API.apiUrl}/hello`, { method: 'POST', headers: { Authorization: `Bearer ${aliceSession.accessToken}` } });
  expect(res.status).toBe(201);
  const body = (await res.json()) as HelloResponse;
  expect(body.message).toBe('Hello World, I am alice');
  expect(body.role).toBe('user');
});

// The first sign-in of an account whose password is temporary (docs/FRONTEND_SERVICES.md section
// 4.9, docs/EMAIL_ARCHITECTURE.md section 5.1): the challenge NEW_PASSWORD_REQUIRED, a new password
// of the person's own, then signed in. It plays a throw-away User of its own, `fe-first`, created
// through UsersService as the Administrator and given a temporary password by a helper, removed
// before and after, so that a run that failed half-way is repeated without a step by hand.
// cognito-local checks neither the challenge's session nor the pool's rule for the new password
// (docs/EMAIL_ARCHITECTURE.md section 14.1): an expired session is only in the unit tests.
//
// Secrets: the passwords stay in constants and the session inside the service; no assertion
// prints one.
const FIRST = 'fe-first';
const TEMPORARY = 'Fe-First-Temp-1!';
const CHOSEN = 'Fe-First-Chosen-2?';

// Explained in simple words in docs/journeys/frontend/first-sign-in.md.
describe('first sign-in with a temporary password', () => {
  let admin: SessionStore;
  const store = new SessionStore(); // the person's, filled when the new password is taken
  const service = new LoginService(cognito(), store); // one service: it holds the open challenge
  const stores: SessionStore[] = [store];

  async function removeFirst(): Promise<void> {
    const users = new UsersService(API, admin);
    const result = await outcome(users.deleteUserResult$, () => users.deleteUser(FIRST));
    if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${FIRST}: ${result.reason}`);
  }

  // The next outcome of the shared service after `trigger`, when it is not a step on the way.
  function next(trigger: () => void): Promise<LoginResult> {
    return outcome(service.loginResult$, trigger);
  }

  beforeAll(async () => {
    admin = await signedIn('admin');
    stores.push(admin);
    await removeFirst();
    const users = new UsersService(API, admin);
    const created = await outcome(users.createUserResult$, () => users.createUser(newUser(FIRST)));
    if (created.status !== 'success') throw new Error(`could not create ${FIRST}: ${JSON.stringify(created)}`);
    await setTemporaryPassword(FIRST, TEMPORARY);
  });

  afterAll(async () => {
    await removeFirst();
    for (const each of stores) each.clear(); // stops the expiry timers
  });

  it('1. the temporary password gives the state "a new password is needed", the username only, and no token', async () => {
    const result = await next(() => service.login(FIRST, TEMPORARY));
    expect(result).toEqual({ status: 'new_password_required', username: FIRST });
    expect(await firstValueFrom(service.loginState$)).toBe(result);
    expect(await current(store)).toBeNull();
  });

  it('2. a too-weak new password is refused before any request, and the challenge stays open', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const result = await next(() => service.choosePassword('weak'));
      expect(result).toEqual({
        status: 'new_password_required',
        username: FIRST,
        refusal: { reason: 'new_password_refused', problems: ['too_short', 'no_uppercase', 'no_digit', 'no_symbol'] },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
    expect(await current(store)).toBeNull();
  });

  it('3. a good new password signs the person in: the store holds the session, and GET /me answers the User', async () => {
    const result = await next(() => service.choosePassword(CHOSEN));
    expect(result).toMatchObject({ status: 'success', username: FIRST, role: 'user' });
    const session = await firstValueFrom(store.session$.pipe(filter((s): s is Session => s !== null)));
    expect(session).toMatchObject({ username: FIRST, role: 'user' });
    const res = await fetch(`${API.apiUrl}/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    expect(res.status).toBe(200);
    expect((await res.json()) as MeResponse).toMatchObject({ username: FIRST, role: 'user', email: `${FIRST}@example.com` });
  });

  it('4. the temporary password then no longer signs in, and the new one does', async () => {
    const old = await signIn(FIRST, TEMPORARY);
    stores.push(old.store);
    expect(old.result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
    const chosen = await signIn(FIRST, CHOSEN);
    stores.push(chosen.store);
    expect(chosen.result).toMatchObject({ status: 'success', username: FIRST, role: 'user' });
  });
});
