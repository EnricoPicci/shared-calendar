import { readFileSync } from 'node:fs';
import { firstValueFrom } from 'rxjs';
import { filter, skip } from 'rxjs/operators';
import type { ApiConfig } from '../../src/services/api';
import type { CognitoConfig } from '../../src/services/cognito';
import { LoginService } from '../../src/services/login.service';
import type { LoginResult, Session } from '../../src/services/login.types';
import { SessionStore } from '../../src/services/session.store';

// The back end's local stack (docs/FRONTEND_SERVICES.md section 14): cognito-local on 9229 and
// the API of `npm run local:api -w backend` on 3000. A helper, not a test file. Tests may use
// Node's fs; the services may not (they receive the client id by injection).

const ENV_FILE = new URL('../../../backend/env.local.json', import.meta.url);

export const API: ApiConfig = { apiUrl: 'http://127.0.0.1:3000' };

export function cognito(): CognitoConfig {
  const env = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { AuthorizerFunction: { CLIENT_ID: string } };
  return { cognitoUrl: 'http://localhost:9229/', clientId: env.AuthorizerFunction.CLIENT_ID };
}

export const PASSWORDS = { alice: 'Alice-Local-Pass-1!', admin: 'Admin-Local-Pass-1!' };

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
