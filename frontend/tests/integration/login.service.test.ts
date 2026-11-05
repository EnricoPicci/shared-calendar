import { readFileSync } from 'node:fs';
import type { HelloResponse } from '@shared-calendar/shared';
import { decodeClaims } from '../../src/services/jwt';
import { firstValueFrom } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import { LoginService } from '../../src/services/login.service';
import type { LoginResult } from '../../src/services/login.types';

// docs/FRONTEND_SERVICES.md section 7, against the back end's local stack:
// `DYNAMODB_PORT=8002 npm run local:up -w backend` (cognito-local on 9229, writes env.local.json)
// and `npm run local:api -w backend` (the API on 3000). Runs only with RUN_INTEGRATION=1.
// A test may use Node's fs; the service under test may not (it gets the client id by injection).

const COGNITO_URL = 'http://localhost:9229/';
const API_URL = 'http://127.0.0.1:3000';
const ENV_FILE = new URL('../../../backend/env.local.json', import.meta.url);

function clientId(): string {
  const env = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { AuthorizerFunction: { CLIENT_ID: string } };
  return env.AuthorizerFunction.CLIENT_ID;
}

// One fresh service per sign-in; subscribe first (skipping nothing: the ReplaySubject is empty),
// then call, then wait for the one outcome.
async function signIn(username: string, password: string): Promise<LoginResult> {
  const service = new LoginService({ cognitoUrl: COGNITO_URL, clientId: clientId() });
  const outcome = firstValueFrom(service.loginResult$);
  const state = firstValueFrom(service.loginState$.pipe(skip(1), filter((s) => s.status !== 'pending')));
  service.login(username, password);
  const [result, finalState] = await Promise.all([outcome, state]);
  expect(finalState).toBe(result);
  return result;
}

let aliceToken = '';

// cognito-local issues 24-hour access tokens and ignores the pool's 15-minute validity
// (docs/ARCHITECTURE.md section 8, note on Cognito emulation). The 15 minutes are a cloud property;
// here the check is that expiresAt is the token's own `exp`, in the future.
it('alice signs in: success, role user, expiry from the exp claim', async () => {
  const result = await signIn('alice', 'Alice-Local-Pass-1!');
  if (result.status !== 'success') throw new Error(`expected success, got ${JSON.stringify(result)}`);
  expect(result.session.username).toBe('alice');
  expect(result.session.role).toBe('user');
  const exp = decodeClaims(result.session.accessToken).exp as number;
  expect(result.session.expiresAt.getTime()).toBe(exp * 1000);
  const minutesAhead = (result.session.expiresAt.getTime() - Date.now()) / 60_000;
  expect(minutesAhead).toBeGreaterThan(0);
  expect(minutesAhead).toBeLessThanOrEqual(24 * 60);
  expect(result.session.idToken).not.toBe('');
  expect(result.session.refreshToken).not.toBe('');
  aliceToken = result.session.accessToken;
});

it('admin signs in: role admin', async () => {
  const result = await signIn('admin', 'Admin-Local-Pass-1!');
  expect(result).toMatchObject({ status: 'success', session: { username: 'admin', role: 'admin' } });
});

// cognito-local answers InvalidPasswordException here (real Cognito: NotAuthorizedException);
// the service maps both to invalid_credentials.
it('alice with a wrong password: failure invalid_credentials', async () => {
  const result = await signIn('alice', 'Wrong-Pass-1!');
  expect(result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
});

it('an unknown user: the same failure as a wrong password', async () => {
  const result = await signIn('nobody-here', 'Whatever-Pass-1!');
  expect(result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
});

it("alice's access token is accepted by POST /hello: the session and the authorizer agree", async () => {
  expect(aliceToken).not.toBe('');
  const res = await fetch(`${API_URL}/hello`, { method: 'POST', headers: { Authorization: `Bearer ${aliceToken}` } });
  expect(res.status).toBe(201);
  const body = (await res.json()) as HelloResponse;
  expect(body.message).toBe('Hello World, I am alice');
  expect(body.role).toBe('user');
});
