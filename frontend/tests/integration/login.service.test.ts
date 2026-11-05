import type { HelloResponse } from '@shared-calendar/shared';
import { decodeClaims } from '../../src/services/jwt';
import type { Session } from '../../src/services/login.types';
import { API, current, PASSWORDS, signIn } from './local';

// docs/FRONTEND_SERVICES.md sections 7 and 9.9, against the back end's local stack:
// `DYNAMODB_PORT=8002 npm run local:up -w backend` (cognito-local on 9229, writes env.local.json)
// and `npm run local:api -w backend` (the API on 3000). Runs only with RUN_INTEGRATION=1.
// v4: the session, with its tokens, is read from the SessionStore; the outcome carries none.

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
