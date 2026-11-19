import { BehaviorSubject, Observable, type Subscription } from 'rxjs';
import type { LoginState, Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import type { LoginDeps } from '../../../src/views/login.view';
import { mountShell, runShell } from '../../../src/views/shell';
import { call, cognitoError, cognitoTokens, jwt, session } from '../services/fixtures';
import { find, submit, useRealPage } from './page';

// The DOM test of the shell (docs/FRONTEND_ARCHITECTURE.md sections 6 and 8): the real
// index.html, the real SessionStore (memory only, no remote call) and a fake LoginService.

const ALICE = session();
const ADMIN = session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin', idToken: 'id-token-admin', refreshToken: 'refresh-token-admin' });
const TOKENS = [ALICE, ADMIN].flatMap((s) => [s.accessToken, s.idToken, s.refreshToken]);

const html = () => document.documentElement.outerHTML;

let shell: Subscription | undefined;
afterEach(() => {
  shell?.unsubscribe();
  shell = undefined;
});

function mounted(first: Session | null = null) {
  const store = new SessionStore();
  if (first) store.set(first);
  const state$ = new BehaviorSubject<LoginState>({ status: 'idle' });
  // Counts the mounts of the login view: each one subscribes once.
  let loginMounts = 0;
  const login: LoginDeps = {
    loginState$: new Observable<LoginState>((subscriber) => {
      loginMounts++;
      return state$.subscribe(subscriber);
    }),
    login: vi.fn<LoginDeps['login']>(),
  };
  shell = mountShell(document.body, { store, login });
  return {
    store,
    state$,
    login,
    loginMounts: () => loginMounts,
    loginRoot: find('#login'),
    frame: find('#app'),
    username: find('#app .username'),
    role: find('#app .role'),
    signOut: find<HTMLButtonElement>('#app .sign-out'),
  };
}

describe('mountShell', () => {
  useRealPage();

  it('null: shows and mounts the login, hides the frame', () => {
    const { login, loginRoot, frame, loginMounts } = mounted();
    expect(loginRoot.hidden).toBe(false);
    expect(frame.hidden).toBe(true);
    expect(loginMounts()).toBe(1);

    find<HTMLInputElement>('#login [name="username"]').value = 'alice';
    find<HTMLInputElement>('#login [name="password"]').value = 'Secret-Pass-1!';
    submit(find<HTMLFormElement>('#login form'));
    expect(login.login).toHaveBeenCalledWith('alice', 'Secret-Pass-1!');
  });

  it('a User signs in: the frame with the name and "User", the login hidden and left empty', () => {
    const { store, state$, loginRoot, frame, username, role } = mounted();
    find<HTMLInputElement>('#login [name="username"]').value = 'alice';
    find<HTMLInputElement>('#login [name="password"]').value = 'Secret-Pass-1!';
    state$.next({ status: 'pending', username: 'alice' });

    store.set(ALICE);
    expect(loginRoot.hidden).toBe(true);
    expect(frame.hidden).toBe(false);
    expect(username.textContent).toBe('alice');
    expect(role.textContent).toBe('User');
    // The login view was left: what was typed is wiped.
    expect(find<HTMLInputElement>('#login [name="username"]').value).toBe('');
    expect(find<HTMLInputElement>('#login [name="password"]').value).toBe('');
    expect(html()).not.toContain('Secret-Pass-1!');
  });

  it('the Administrator signs in: the frame with the name and "Administrator"', () => {
    const { store, frame, username, role } = mounted();
    store.set(ADMIN);
    expect(frame.hidden).toBe(false);
    expect(username.textContent).toBe('admin');
    expect(role.textContent).toBe('Administrator');
  });

  it('a session already in the store when the shell starts shows the frame at once, without the login', () => {
    const { loginRoot, frame, username, loginMounts } = mounted(ALICE);
    expect(loginRoot.hidden).toBe(true);
    expect(frame.hidden).toBe(false);
    expect(username.textContent).toBe('alice');
    expect(loginMounts()).toBe(0);
  });

  it('no token reaches the document', () => {
    const { store } = mounted();
    store.set(ALICE);
    for (const token of TOKENS) expect(html()).not.toContain(token);
  });

  it('a username containing markup is shown as text', () => {
    const { store, username } = mounted();
    store.set(session({ username: '<script>window.hacked = true</script>' }));
    expect(username.textContent).toBe('<script>window.hacked = true</script>');
    expect(username.children).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('a refreshed session (same username and role) mounts nothing again', () => {
    const { store, frame, username, role, loginMounts } = mounted(ALICE);
    // A mark the shell would overwrite if it entered the frame a second time.
    username.textContent = 'still here';
    store.set(session({ accessToken: 'access-token-2', idToken: 'id-token-2', expiresAt: new Date(Date.now() + 3_600_000) }));
    expect(username.textContent).toBe('still here');
    expect(role.textContent).toBe('User');
    expect(frame.hidden).toBe(false);
    expect(loginMounts()).toBe(0);
  });

  it('"Sign out" clears the store, and the login is back', () => {
    const { store, loginRoot, frame, signOut, loginMounts } = mounted(ALICE);
    const sessions: (Session | null)[] = [];
    store.session$.subscribe((s) => sessions.push(s));

    signOut.click();
    expect(sessions).toEqual([ALICE, null]);
    expect(loginRoot.hidden).toBe(false);
    expect(frame.hidden).toBe(true);
    expect(loginMounts()).toBe(1);
  });

  it('after signing out, nothing of the session is left in the document', () => {
    const { store, username, role, signOut } = mounted();
    const before = html();
    store.set(ALICE);
    expect(html()).toContain('alice');

    signOut.click();
    expect(username.textContent).toBe('');
    expect(role.textContent).toBe('');
    expect(html()).not.toContain('alice');
    for (const token of TOKENS) expect(html()).not.toContain(token);
    // The page is as it was before anyone signed in.
    expect(html()).toBe(before);
  });

  it('a session that ends by itself (expiry, a rejected refresh) returns to the login like "Sign out"', () => {
    const { store, loginRoot, frame, username } = mounted(ALICE);
    store.clear();
    expect(loginRoot.hidden).toBe(false);
    expect(frame.hidden).toBe(true);
    expect(username.textContent).toBe('');
  });

  it('a second person signing in sees nothing of the first', () => {
    const { store, username, role, signOut } = mounted(ALICE);
    signOut.click();
    store.set(ADMIN);
    expect(username.textContent).toBe('admin');
    expect(role.textContent).toBe('Administrator');
    expect(html()).not.toContain('alice');
    expect(find('#app').textContent).not.toContain('User');
  });

  it('another person replacing the session without a sign-out gets a frame of their own', () => {
    const { store, username, role, loginMounts } = mounted(ALICE);
    store.set(ADMIN);
    expect(username.textContent).toBe('admin');
    expect(role.textContent).toBe('Administrator');
    expect(html()).not.toContain('alice');
    expect(loginMounts()).toBe(0);
  });

  it('the same name with another role is another frame', () => {
    const { store, role } = mounted(ALICE);
    store.set(session({ role: 'admin' }));
    expect(role.textContent).toBe('Administrator');
  });

  it('ending the shell leaves the view on screen and hides everything', () => {
    const { store, state$, loginRoot, frame, username } = mounted(ALICE);
    shell?.unsubscribe();
    expect([loginRoot.hidden, frame.hidden]).toEqual([true, true]);
    expect(username.textContent).toBe('');

    store.clear(); // no longer heard
    expect(loginRoot.hidden).toBe(true);
    expect(state$.observed).toBe(false);
  });

  it('ending the shell at the login leaves the login view', () => {
    const { state$, loginRoot } = mounted();
    find<HTMLInputElement>('#login [name="username"]').value = 'alice';
    expect(state$.observed).toBe(true);
    shell?.unsubscribe();
    expect(state$.observed).toBe(false);
    expect(loginRoot.hidden).toBe(true);
    expect(find<HTMLInputElement>('#login [name="username"]').value).toBe('');
  });
});

// The start-up with the real services: the global fetch is a stub, as in the services' tests.
describe('runShell', () => {
  useRealPage();

  const CONFIG = { apiUrl: 'http://api.test', cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
  const EXP = Math.floor(Date.now() / 1000) + 900;

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function signIn(username: string, password: string) {
    find<HTMLInputElement>('#login [name="username"]').value = username;
    find<HTMLInputElement>('#login [name="password"]').value = password;
    submit(find<HTMLFormElement>('#login form'));
  }
  const tokensFor = (username: string, group: string, exp = EXP) =>
    cognitoTokens({ AccessToken: jwt({ username, 'cognito:groups': [group], exp }), IdToken: 'id-token', RefreshToken: 'refresh-token' });

  it('starts at the login, with no request sent', () => {
    shell = runShell(CONFIG);
    expect(find('#login').hidden).toBe(false);
    expect(find('#app').hidden).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signing in posts to the configured Cognito with the configured client, then shows the frame', async () => {
    fetchMock.mockResolvedValueOnce(tokensFor('alice', 'user'));
    shell = runShell(CONFIG);
    signIn('alice', 'Secret-Pass-1!');

    await vi.waitFor(() => expect(find('#app').hidden).toBe(false));
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://cognito.test/');
    expect(JSON.parse(String(init.body))).toEqual({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-123',
      AuthParameters: { USERNAME: 'alice', PASSWORD: 'Secret-Pass-1!' },
    });
    expect(find('#app .username').textContent).toBe('alice');
    expect(find('#app .role').textContent).toBe('User');
    expect(find('#login').hidden).toBe(true);
    expect(html()).not.toContain('Secret-Pass-1!');
    expect(html()).not.toContain('refresh-token');
  });

  it('a wrong password shows the failure and stays at the login; the next try signs in', async () => {
    fetchMock.mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'));
    shell = runShell(CONFIG);
    signIn('admin', 'wrong');
    await vi.waitFor(() => expect(find('#login .error').textContent).toBe('Incorrect username or password.'));
    expect(find('#login').hidden).toBe(false);
    expect(find<HTMLButtonElement>('#login button').disabled).toBe(false);

    fetchMock.mockResolvedValueOnce(tokensFor('admin', 'admin'));
    signIn('admin', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(find('#app .role').textContent).toBe('Administrator'));
  });

  it('sign out, then the login again: the form is empty, usable, and shows no old failure', async () => {
    fetchMock.mockResolvedValueOnce(tokensFor('alice', 'user'));
    shell = runShell(CONFIG);
    signIn('alice', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(find('#app').hidden).toBe(false));

    find('#app .sign-out').click();
    expect(find('#login').hidden).toBe(false);
    expect(find<HTMLInputElement>('#login [name="username"]').value).toBe('');
    expect(find<HTMLInputElement>('#login [name="password"]').value).toBe('');
    expect(find<HTMLButtonElement>('#login button').disabled).toBe(false);
    expect(find('#login .error').textContent).toBe('');
    expect(html()).not.toContain('alice');
  });

  it('the automatic refresh runs: one minute before the expiry the session is renewed and the frame stays', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const exp = Math.floor(Date.now() / 1000) + 900;
    fetchMock.mockResolvedValueOnce(tokensFor('alice', 'user', exp));
    shell = runShell(CONFIG);
    signIn('alice', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(find('#app').hidden).toBe(false));

    fetchMock.mockResolvedValueOnce(cognitoTokens({ AccessToken: jwt({ username: 'alice', 'cognito:groups': ['user'], exp: exp + 900 }), IdToken: 'id-token-2' }));
    await vi.advanceTimersByTimeAsync(14 * 60_000 + 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(call(fetchMock, 1)[1].body))).toMatchObject({ AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: 'client-123' });
    expect(find('#app').hidden).toBe(false);

    // Ending the shell stops the schedule: no further refresh is asked for.
    shell?.unsubscribe();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
