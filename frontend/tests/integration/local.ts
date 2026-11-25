import { readFileSync } from 'node:fs';
import { firstValueFrom, type Observable } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import type { ApiConfig } from '../../src/services/api';
import type { ChangePasswordConfig } from '../../src/services/change-password.types';
import type { CognitoConfig } from '../../src/services/cognito';
import { LoginService } from '../../src/services/login.service';
import type { LoginResult, Session } from '../../src/services/login.types';
import { SessionStore } from '../../src/services/session.store';
import type { NewUser } from '../../src/services/users.service';

// The back end's local stack (docs/FRONTEND_SERVICES.md section 14): cognito-local on 9229 and
// the API of `npm run local:api -w backend` on 3000. A helper, not a test file. Tests may use
// Node's fs; the services may not (they receive the client id by injection).

const ENV_FILE = new URL('../../../backend/env.local.json', import.meta.url);

export const API: ApiConfig = { apiUrl: 'http://127.0.0.1:3000' };

export function cognito(): CognitoConfig {
  const env = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { AuthorizerFunction: { CLIENT_ID: string } };
  return { cognitoUrl: 'http://localhost:9229/', clientId: env.AuthorizerFunction.CLIENT_ID };
}

// The change of one's own password against the local stack: the sign-out everywhere is skipped,
// since the Cognito emulator does not implement GlobalSignOut (docs/ARCHITECTURE.md section 8).
export function changePasswordConfig(): ChangePasswordConfig {
  return { cognitoUrl: cognito().cognitoUrl, skipGlobalSignOut: true };
}

export const PASSWORDS = { alice: 'Alice-Local-Pass-1!', admin: 'Admin-Local-Pass-1!' };

// Gives an account a temporary password, as an invitation does (docs/EMAIL_ARCHITECTURE.md
// section 14.1): AdminSetUserPassword with Permanent false, so that its next sign-in gets the
// challenge NEW_PASSWORD_REQUIRED. cognito-local takes the administrator's calls unsigned, so a
// plain request does it. The password goes into the body and nowhere else.
export async function setTemporaryPassword(username: string, password: string): Promise<void> {
  const env = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { AuthorizerFunction: { USER_POOL_ID: string } };
  const response = await fetch(cognito().cognitoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.AdminSetUserPassword' },
    body: JSON.stringify({ UserPoolId: env.AuthorizerFunction.USER_POOL_ID, Username: username, Password: password, Permanent: false }),
  });
  if (response.status !== 200) throw new Error(`could not give ${username} a temporary password: ${response.status}`);
}

// What "Create user" sends for a throw-away User of a journey: the username and four facts made
// from it (docs/EMAIL_ARCHITECTURE.md section 4.1). The e-mail is at example.com, a domain kept
// for examples, so no mail could ever reach a real person.
export function newUser(username: string): NewUser {
  return { username, givenName: 'Throw', familyName: `Away ${username}`, email: `${username.toLowerCase()}@example.com`, address: `Via di Prova 1\n00100 Roma` };
}

// A real LoginService fills the given store; subscribe first, then call, then wait for the one
// outcome. Checks that the state machine ends on the same object as the result stream.
export async function signIn(username: string, password: string, store = new SessionStore()): Promise<{ result: LoginResult; store: SessionStore }> {
  const service = new LoginService(cognito(), store);
  const outcome = firstValueFrom(service.loginResult$);
  const state = firstValueFrom(service.loginState$.pipe(skip(1), filter((s) => s.status !== 'pending')));
  service.login(username, password);
  const [result, finalState] = await Promise.all([outcome, state]);
  expect(finalState).toBe(result);
  return { result, store };
}

// The store's current value (BehaviorSubject: emits at once).
export function current(store: SessionStore): Promise<Session | null> {
  return firstValueFrom(store.session$);
}

// Signs in and returns the store, failing the test if the login did not succeed.
export async function signedIn(username: keyof typeof PASSWORDS): Promise<SessionStore> {
  const { result, store } = await signIn(username, PASSWORDS[username]);
  if (result.status !== 'success') throw new Error(`${username} could not sign in: ${result.status === 'failure' ? result.reason : ''}`);
  return store;
}

// Subscribe first, then call, then wait for the one new outcome (the ReplaySubject replays the
// previous one at once, which is counted before the call). Used by calendar.test.ts.
export async function outcome<T>(result$: Observable<T>, trigger: () => void): Promise<T> {
  const values: T[] = [];
  const subscription = result$.subscribe((v) => values.push(v));
  const before = values.length;
  trigger();
  await vi.waitFor(() => expect(values).toHaveLength(before + 1), { timeout: 30_000, interval: 50 });
  subscription.unsubscribe();
  return values.at(-1) as T;
}
