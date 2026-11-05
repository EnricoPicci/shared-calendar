import type { Observable } from 'rxjs';
import { HelloService } from '../../src/services/hello.service';
import type { Session } from '../../src/services/login.types';
import { RefreshService } from '../../src/services/refresh.service';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, cognito, current, signedIn, signIn } from './local';

// docs/FRONTEND_SERVICES.md section 14.2: the services against the back end's local stack, in
// order. Every service gets its token from a real SessionStore that a real LoginService filled.
// Runs only with RUN_INTEGRATION=1. The throw-away user `fe-journey` is removed before and after
// (decision 26). Its generated password stays in a variable; assertions look at its presence only.

const THROWAWAY = 'fe-journey';

let alice: SessionStore; // store A
let admin: SessionStore; // store B
let aliceAtLogin: Session;
let throwawayPassword = '';
const stores: SessionStore[] = [];

// Subscribe first, then call, then wait for the one new outcome (the ReplaySubject replays the
// previous one at once, which is counted before the call).
async function outcome<T>(result$: Observable<T>, trigger: () => void): Promise<T> {
  const values: T[] = [];
  const subscription = result$.subscribe((v) => values.push(v));
  const before = values.length;
  trigger();
  await vi.waitFor(() => expect(values).toHaveLength(before + 1), { timeout: 30_000, interval: 50 });
  subscription.unsubscribe();
  return values.at(-1) as T;
}

function hello(store: SessionStore) {
  const service = new HelloService(API, store);
  return outcome(service.helloResult$, () => service.hello());
}
function createUser(store: SessionStore, username: string) {
  const service = new UsersService(API, store);
  return outcome(service.createUserResult$, () => service.createUser(username));
}
function deleteUser(store: SessionStore, username: string) {
  const service = new UsersService(API, store);
  return outcome(service.deleteUserResult$, () => service.deleteUser(username));
}
function track(store: SessionStore): SessionStore {
  stores.push(store);
  return store;
}

// A run that failed half-way leaves fe-journey behind; journey 4 would then get user_exists.
async function removeThrowaway(): Promise<void> {
  const store = await signedIn('admin');
  const result = await deleteUser(store, THROWAWAY);
  store.clear();
  if (result.status === 'failure' && result.reason !== 'user_not_found') {
    throw new Error(`could not remove ${THROWAWAY}: ${result.reason}`);
  }
}

beforeAll(removeThrowaway);
afterAll(async () => {
  for (const store of stores) store.clear(); // stops the expiry timers
  await removeThrowaway();
});

it('1. alice signs in: session$ gives her session', async () => {
  alice = track(await signedIn('alice'));
  const session = await current(alice);
  expect(session).toMatchObject({ username: 'alice', role: 'user' });
  aliceAtLogin = session as Session;
});

it('2. hello as alice: 201, Hello World, I am alice', async () => {
  const result = await hello(alice);
  expect(result).toMatchObject({ status: 'success', hello: { role: 'user', message: 'Hello World, I am alice' } });
});

it('3. hello as admin: Hello World, the Administrator is speaking', async () => {
  admin = track(await signedIn('admin'));
  const result = await hello(admin);
  expect(result).toMatchObject({ status: 'success', hello: { role: 'admin', message: 'Hello World, the Administrator is speaking' } });
});

it(`4. admin creates ${THROWAWAY}: success with a password`, async () => {
  const result = await createUser(admin, THROWAWAY);
  if (result.status !== 'success') throw new Error(`expected success, got ${result.reason}`);
  expect(result.user.username).toBe(THROWAWAY);
  expect(result.user.password.length).toBeGreaterThanOrEqual(16);
  throwawayPassword = result.user.password;
});

it(`5. ${THROWAWAY} signs in with that password and says hello`, async () => {
  const { result, store } = await signIn(THROWAWAY, throwawayPassword);
  track(store);
  expect(result).toMatchObject({ status: 'success', username: THROWAWAY, role: 'user' });
  expect(await hello(store)).toMatchObject({ status: 'success', hello: { message: `Hello World, I am ${THROWAWAY}` } });
});

it(`6. creating ${THROWAWAY} again: user_exists`, async () => {
  expect(await createUser(admin, THROWAWAY)).toMatchObject({ status: 'failure', reason: 'user_exists' });
});

it('7. creating Bob: invalid_request, no request sent', async () => {
  const spy = vi.spyOn(globalThis, 'fetch');
  try {
    expect(await createUser(admin, 'Bob')).toMatchObject({ status: 'failure', reason: 'invalid_request' });
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

it('8. deleting admin: cannot_delete_admin, the session stays', async () => {
  const before = await current(admin);
  expect(await deleteUser(admin, 'admin')).toMatchObject({ status: 'failure', reason: 'cannot_delete_admin' });
  expect(await current(admin)).toBe(before);
});

it(`9. alice creates ${THROWAWAY}: forbidden, her session stays`, async () => {
  const before = await current(alice);
  expect(await createUser(alice, THROWAWAY)).toMatchObject({ status: 'failure', reason: 'forbidden' });
  expect(await current(alice)).toBe(before);
});

it(`10. admin deletes ${THROWAWAY}: success; it can no longer sign in`, async () => {
  expect(await deleteUser(admin, THROWAWAY)).toEqual({ status: 'success', username: THROWAWAY });
  const { result } = await signIn(THROWAWAY, throwawayPassword);
  expect(result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
});

it(`11. deleting ${THROWAWAY} again: user_not_found`, async () => {
  expect(await deleteUser(admin, THROWAWAY)).toMatchObject({ status: 'failure', reason: 'user_not_found' });
});

it('12. a garbage access token: session_rejected, and session$ gives null', async () => {
  const store = track(new SessionStore());
  store.set({ ...aliceAtLogin, accessToken: 'garbage', expiresAt: new Date(Date.now() + 10 * 60_000) });
  expect(await hello(store)).toMatchObject({ status: 'failure', reason: 'session_rejected' });
  expect(await current(store)).toBeNull();
});

it('13. alice refreshes: a new access token that /hello accepts; the refresh token is unchanged', async () => {
  const service = new RefreshService(cognito(), alice);
  const result = await outcome(service.refreshResult$, () => service.refresh());
  expect(result).toMatchObject({ status: 'success', username: 'alice' });
  const session = (await current(alice)) as Session;
  expect(session.accessToken).not.toBe(aliceAtLogin.accessToken);
  expect(session.refreshToken).toBe(aliceAtLogin.refreshToken);
  expect(await hello(alice)).toMatchObject({ status: 'success', hello: { message: 'Hello World, I am alice' } });
});

it('14. a garbage refresh token: session_rejected, and the store is cleared', async () => {
  const store = track(new SessionStore());
  store.set({ ...aliceAtLogin, refreshToken: 'garbage' });
  const service = new RefreshService(cognito(), store);
  expect(await outcome(service.refreshResult$, () => service.refresh())).toMatchObject({
    status: 'failure',
    reason: 'session_rejected',
  });
  expect(await current(store)).toBeNull();
});
