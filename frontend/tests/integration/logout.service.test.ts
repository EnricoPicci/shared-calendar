import { HelloService } from '../../src/services/hello.service';
import type { Session } from '../../src/services/login.types';
import { LogoutService } from '../../src/services/logout.service';
import { RefreshService } from '../../src/services/refresh.service';
import { SessionStore } from '../../src/services/session.store';
import { API, cognito, current, outcome, signedIn } from './local';

// docs/FRONTEND_SERVICES.md section 20.9: the sign-out against the back end's local stack
// (cognito-local on 9229, the API on 3000), in order. Runs only with RUN_INTEGRATION=1. Real
// services on real stores; alice only; no table is touched and no user is created. The copy of
// alice's session the tests keep stands for a copy somebody took before the sign-out; no token
// is ever printed.

let first: SessionStore; // alice's first sign-in: the one that signs out
let second: SessionStore; // alice's second sign-in, on another computer as it were
let copy: Session; // the first session as it was before the sign-out
const stores: SessionStore[] = [];

function track(store: SessionStore): SessionStore {
  stores.push(store);
  return store;
}
// A new store holding a session somebody kept a copy of.
function storeWith(session: Session): SessionStore {
  const store = track(new SessionStore());
  store.set(session);
  return store;
}
function refresh(store: SessionStore) {
  const service = new RefreshService(cognito(), store);
  return outcome(service.refreshResult$, () => service.refresh());
}
function logout(store: SessionStore) {
  const service = new LogoutService(cognito(), store, []);
  return outcome(service.logoutResult$, () => service.logout());
}

// Explained in simple words in docs/journeys/frontend/logout.md.
describe('logout', () => {
  afterAll(async () => {
    // Signs out whatever session of this file is still alive, so that the run leaves no
    // refresh token of its own that Cognito would still take. An empty store sends nothing.
    for (const store of stores) await logout(store);
  });

  it('1. alice signs in twice: two sessions with their own refresh tokens, and the first can be renewed', async () => {
    first = track(await signedIn('alice'));
    second = track(await signedIn('alice'));
    const [a, b] = [await current(first), await current(second)];
    expect(a?.refreshToken).not.toBe(b?.refreshToken);

    expect(await refresh(first)).toMatchObject({ status: 'success', username: 'alice' });
    copy = (await current(first)) as Session;
  });

  it('2. alice signs out of the first: the store is empty when the call returns, and Cognito revoked', async () => {
    const service = new LogoutService(cognito(), first, []);
    const result = outcome(service.logoutResult$, () => {
      service.logout();
    });
    // The call has returned and its result has not been waited for.
    expect(await current(first)).toBeNull();
    // Nothing but the status: no token, no name.
    expect(await result).toEqual({ status: 'success' });
  });

  it('3. the refresh token of the session alice left makes no new session: session_rejected', async () => {
    const thief = storeWith(copy);
    expect(await refresh(thief)).toMatchObject({ status: 'failure', reason: 'session_rejected' });
    expect(await current(thief)).toBeNull();
  });

  it('4. the access token of the session alice left still passes the API: the limit that stays', async () => {
    const service = new HelloService(API, storeWith(copy));
    const result = await outcome(service.helloResult$, () => service.hello());
    expect(result).toMatchObject({ status: 'success', hello: { message: 'Hello World, I am alice' } });
  });

  it('5. the second sign-in of alice is not affected: it is renewed', async () => {
    expect(await refresh(second)).toMatchObject({ status: 'success', username: 'alice' });
  });

  it('6. a sign-out with nobody signed in: not_signed_in, no request sent', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await logout(new SessionStore())).toMatchObject({ status: 'failure', reason: 'not_signed_in' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('7. alice signs in again: a sign-out does not lock the account', async () => {
    const again = track(await signedIn('alice'));
    expect(await current(again)).toMatchObject({ username: 'alice', role: 'user' });
  });
});
