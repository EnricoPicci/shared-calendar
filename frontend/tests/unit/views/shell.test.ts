import { BehaviorSubject, firstValueFrom, Observable, Subscription } from 'rxjs';
import type { LoginState, Session } from '../../../src/services/login.types';
import { LogoutService } from '../../../src/services/logout.service';
import { SessionStore } from '../../../src/services/session.store';
import type { LoginDeps } from '../../../src/views/login.view';
import { mountShell, runShell, SCREENS, type Screen } from '../../../src/views/shell';
import { appointment, STUDIO, view, winterWeek } from '../logic/fixtures';
import { call, cognitoError, cognitoTokens, json, jwt, session } from '../services/fixtures';
import { find, loadPage, submit, useRealPage } from './page';

// The DOM test of the shell (docs/FRONTEND_ARCHITECTURE.md sections 6 and 8): the real
// index.html, the real SessionStore (memory only, no remote call), a fake LoginService, the real
// LogoutService, and the global fetch a stub: entering the frame creates the real API services, whose first call
// stays unanswered unless a test answers it.

const CONFIG = { apiUrl: 'http://api.test', cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
// A call that is never answered.
const unanswered = () => new Promise<Response>(() => {});

const ALICE = session();
const ADMIN = session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin', idToken: 'id-token-admin', refreshToken: 'refresh-token-admin' });
const TOKENS = [ALICE, ADMIN].flatMap((s) => [s.accessToken, s.idToken, s.refreshToken]);

const html = () => document.documentElement.outerHTML;
// A user as GET /users answers one: the username, the creation date, the state and four facts
// made from the username.
const summary = (username: string, createdAt = '2026-11-01T10:00:00.000Z') => ({
  username,
  createdAt,
  status: 'active',
  givenName: `Given-${username}`,
  familyName: `Family-${username}`,
  email: `${username}@example.com`,
  address: `Street of ${username}`,
});
// What a field of the page holds: its value, or for a checkbox, whose value never changes,
// whether it is ticked.
const held = (field: HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement) => (field instanceof HTMLInputElement && field.type === 'checkbox' ? (field.checked ? 'ticked' : '') : field.value);

let shell: Subscription | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(unanswered);
  vi.stubGlobal('fetch', fetchMock);
  // The emulated page keeps its address from one test to the next: each starts without a hash.
  window.history.replaceState(null, '', window.location.pathname);
});
afterEach(() => {
  shell?.unsubscribe();
  shell = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// The requests sent to the API, as [address, Authorization header].
const apiCalls = () =>
  (fetchMock.mock.calls as [string, RequestInit][])
    .filter(([url]) => url.startsWith(CONFIG.apiUrl))
    .map(([url, init]) => [url, (init.headers as Record<string, string>).Authorization]);
const cognitoCalls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url === CONFIG.cognitoUrl);

function mounted(first: Session | null = null, screens?: readonly Screen[]) {
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
  // The real sign-out service on the test's store: its request to Cognito stays unanswered
  // unless a test answers it. The fake login has nothing to put back.
  const logout = new LogoutService(CONFIG, store, []);
  shell = mountShell(document.body, { config: CONFIG, store, login, logout, ...(screens ? { screens } : {}) });
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

  it('"Sign out" calls the sign-out service and nothing else: the shell itself clears nothing', () => {
    const store = new SessionStore();
    store.set(ALICE);
    const logout = { logout: vi.fn<() => void>() };
    const login: LoginDeps = { loginState$: new BehaviorSubject<LoginState>({ status: 'idle' }), login: vi.fn<LoginDeps['login']>() };
    shell = mountShell(document.body, { config: CONFIG, store, login, logout });

    find('#app .sign-out').click();
    expect(logout.logout).toHaveBeenCalledTimes(1);
    expect(logout.logout).toHaveBeenCalledWith();
    // The service of this test does nothing, so the person is still there.
    expect(find('#app').hidden).toBe(false);
    expect(find('#app .username').textContent).toBe('alice');
    expect(cognitoCalls()).toHaveLength(0);
  });

  it('"Sign out" tells Cognito once, with the person\'s refresh token, and the login is back before any answer', () => {
    const { loginRoot, signOut } = mounted(ALICE);
    signOut.click();
    expect(loginRoot.hidden).toBe(false);
    expect(cognitoCalls()).toHaveLength(1);
    const [, init] = cognitoCalls()[0]!;
    expect((init.headers as Record<string, string>)['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.RevokeToken');
    expect(JSON.parse(String(init.body))).toEqual({ ClientId: 'client-123', Token: ALICE.refreshToken });
  });

  it('a session that ends by itself tells Cognito nothing', () => {
    const { store, loginRoot } = mounted(ALICE);
    store.clear();
    expect(loginRoot.hidden).toBe(false);
    expect(cognitoCalls()).toHaveLength(0);
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

  it('a second person signing in sees nothing of the first: the page is the one that person finds when nobody was there before', () => {
    // The clock stands still, so that the week's label is the same in both.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
    // The whole page as a person finds it: its source, and what every field holds.
    const page = () => ({ source: html(), fields: [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held) });

    // The Administrator, alone on a fresh page.
    mounted(ADMIN);
    const alone = page();
    expect(alone.source).toContain('Administrator');
    shell?.unsubscribe();
    loadPage();

    // A User first, then the Administrator.
    const { store, username, role, signOut } = mounted(ALICE);
    expect(role.textContent).toBe('User');
    expect(page()).not.toEqual(alone);
    signOut.click();
    store.set(ADMIN);
    expect(username.textContent).toBe('admin');
    expect(role.textContent).toBe('Administrator');
    expect(html()).not.toContain('alice');
    expect(page()).toEqual(alone);
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

  const EXP = Math.floor(Date.now() / 1000) + 900;

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

  it('a temporary password: "Choose your password" in the login\'s place; a good new password answers the challenge and shows the frame', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'challenge-session' }));
    shell = runShell(CONFIG);
    signIn('anna', 'Temp-Pass-1!x');
    await vi.waitFor(() => expect(find('#login .first-password').hidden).toBe(false));
    expect(find('#login form.sign-in').hidden).toBe(true);
    expect(find('#login .first-password .account').textContent).toBe('anna');
    expect(find<HTMLInputElement>('#login [name="password"]').value).toBe('');

    const form = find<HTMLFormElement>('#login form.new-password');
    find<HTMLInputElement>('#login [name="next"]').value = 'Chosen-Pass-2?';
    find<HTMLInputElement>('#login [name="again"]').value = 'Chosen-Pass-2?';
    form.dispatchEvent(new Event('input', { bubbles: true }));
    expect(find<HTMLButtonElement>('#login .new-password .submit').disabled).toBe(false);
    fetchMock.mockResolvedValueOnce(tokensFor('anna', 'user'));
    submit(form);

    await vi.waitFor(() => expect(find('#app').hidden).toBe(false));
    const [, init] = call(fetchMock, 1);
    expect(JSON.parse(String(init.body))).toEqual({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: 'client-123',
      Session: 'challenge-session',
      ChallengeResponses: { USERNAME: 'anna', NEW_PASSWORD: 'Chosen-Pass-2?' },
    });
    expect(find('#app .username').textContent).toBe('anna');
    expect(find('#login').hidden).toBe(true);
    // Left with the login: the screen hidden and empty, nothing of the two passwords or the session in the page.
    expect(find('#login .first-password').hidden).toBe(true);
    expect(find('#login form.sign-in').hidden).toBe(false);
    for (const secret of ['Temp-Pass-1!x', 'Chosen-Pass-2?', 'challenge-session', 'refresh-token']) expect(html()).not.toContain(secret);
    for (const field of document.querySelectorAll<HTMLInputElement>('#login input')) expect(field.value).toBe('');
  });

  it('a temporary password, then Cancel: back to the sign-in with the username, nothing sent', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'challenge-session' }));
    shell = runShell(CONFIG);
    signIn('anna', 'Temp-Pass-1!x');
    await vi.waitFor(() => expect(find('#login .first-password').hidden).toBe(false));
    find<HTMLButtonElement>('#login .new-password .cancel').click();
    expect(find('#login .first-password').hidden).toBe(true);
    expect(find('#login form.sign-in').hidden).toBe(false);
    expect(find<HTMLInputElement>('#login [name="username"]').value).toBe('anna');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a wrong password shows the failure and stays at the login; the next try signs in', async () => {
    fetchMock.mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'Incorrect username or password.'));
    shell = runShell(CONFIG);
    signIn('admin', 'wrong');
    await vi.waitFor(() => expect(find('#login .error').textContent).toBe('The username or the password is not correct.'));
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

  it('sign out with Cognito silent: the login at once, one revocation sent, and no token in the page, a field or the address', async () => {
    fetchMock.mockResolvedValueOnce(tokensFor('alice', 'user'));
    shell = runShell(CONFIG);
    signIn('alice', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(find('#app').hidden).toBe(false));
    const before = cognitoCalls().length;

    // The request that tells Cognito is never answered.
    find('#app .sign-out').click();
    expect(find('#login').hidden).toBe(false);
    expect(find('#app').hidden).toBe(true);
    expect(cognitoCalls()).toHaveLength(before + 1);
    expect(JSON.parse(String(cognitoCalls().at(-1)![1].body))).toEqual({ ClientId: 'client-123', Token: 'refresh-token' });

    const fields = [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held);
    for (const left of ['alice', 'refresh-token', 'id-token', 'Secret-Pass-1!']) {
      expect(html()).not.toContain(left);
      expect(fields.join('\n')).not.toContain(left);
      expect(window.location.href).not.toContain(left);
    }
  });

  it.each([
    ['200', (answer: (r: Response) => void) => answer(json(200, {}))],
    ['a refusal', (answer: (r: Response) => void) => answer(cognitoError('UnauthorizedException', 'no'))],
    ['no network', (_answer: (r: Response) => void, reject: (e: unknown) => void) => reject(new TypeError('fetch failed'))],
  ])('a second person signs in while the first one\'s sign-out is still unanswered: the frame is theirs, also after %s', async (_name, settle) => {
    // Cognito answers each sign-in; the revocation waits for the test.
    let answer: (r: Response) => void = () => {};
    let reject: (e: unknown) => void = () => {};
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url !== CONFIG.cognitoUrl) return unanswered();
      const body = JSON.parse(String(init.body)) as { AuthParameters?: { USERNAME: string } };
      if (body.AuthParameters) return Promise.resolve(tokensFor(body.AuthParameters.USERNAME, body.AuthParameters.USERNAME === 'admin' ? 'admin' : 'user'));
      return new Promise<Response>((resolve, refuse) => {
        answer = resolve;
        reject = refuse;
      });
    });
    shell = runShell(CONFIG);
    signIn('alice', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(find('#app .username').textContent).toBe('alice'));
    find('#app .sign-out').click();

    signIn('admin', 'Secret-Pass-1!');
    await vi.waitFor(() => expect(find('#app .role').textContent).toBe('Administrator'));
    const page = html();
    expect(page).not.toContain('alice');

    // The first person's revocation ends, one way or another: nothing of the page changes.
    settle(answer, reject);
    await new Promise((r) => setTimeout(r, 20));
    expect(find('#app').hidden).toBe(false);
    expect(find('#app .username').textContent).toBe('admin');
    expect(html()).toBe(page);
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
    expect(cognitoCalls()).toHaveLength(2);
    expect(JSON.parse(String(cognitoCalls()[1]![1].body))).toMatchObject({ AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: 'client-123' });
    expect(find('#app').hidden).toBe(false);
    // The renewed session is the same person: the week was asked for once, at the sign-in.
    expect(apiCalls()).toHaveLength(1);

    // Ending the shell stops the schedule: no further refresh is asked for.
    shell?.unsubscribe();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(cognitoCalls()).toHaveLength(2);
  });

  it('after the sign-in the week of today is asked of the configured API and drawn', async () => {
    fetchMock.mockResolvedValueOnce(tokensFor('alice', 'user'));
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    shell = runShell(CONFIG);
    signIn('alice', 'Secret-Pass-1!');

    await vi.waitFor(() => expect(document.querySelectorAll('#week .day')).toHaveLength(7));
    expect(apiCalls()).toHaveLength(1);
    expect(apiCalls()[0]![0]).toMatch(/^http:\/\/api\.test\/calendar\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/);
    expect(window.location.hash).toBe('#/week');
    expect(html()).not.toContain('refresh-token');
  });
});

// The navigation by the URL's hash (docs/FRONTEND_ARCHITECTURE.md section 6, point 6) and what
// belongs to one person's session (docs/FRONTEND_ARCHITECTURE.md section 6, points 4 and 5),
// with the real table of screens and the real CalendarService behind the stubbed fetch.
describe('the navigation', () => {
  useRealPage();

  // Thursday 19 November 2026, 11:00 in Rome: the week of Monday 16.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
  });

  const WEEK_URL = 'http://api.test/calendar?from=2026-11-16&to=2026-11-22';
  const links = () => [...document.querySelectorAll<HTMLAnchorElement>('#app .nav a')];
  const days = () => [...document.querySelectorAll<HTMLElement>('#week .day')];
  const weekDrawn = () => vi.waitFor(() => expect(days()).toHaveLength(7));
  // The Administrator's view of the same week: everyone's appointments, with names.
  const adminWeek = () => ({ ...winterWeek(), appointments: winterWeek().appointments.map((a) => ({ ...a, username: 'bob', note: 'Bob\'s note' })) });

  it.each([
    ['a User', ALICE, 'access-token-alice', [['Week', '#/week', 'page'], ['My appointments', '#/appointments', null], ['My details', '#/me', null], ['Password', '#/password', null]]],
    ['the Administrator', ADMIN, 'access-token-admin', [['Week', '#/week', 'page'], ['Settings', '#/settings', null], ['Users', '#/users', null], ['Availability', '#/availability', null], ['My details', '#/me', null], ['Password', '#/password', null]]],
  ])('the first screen of %s is the week: the address, the links of the role with the week\'s marked, the week of today loaded', async (_name, who, token, navigation) => {
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    const { store } = mounted();
    expect(links()).toHaveLength(0);
    expect(find('#week').hidden).toBe(true);

    store.set(who);
    expect(window.location.hash).toBe('#/week');
    expect(links().map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual(navigation);
    expect(find('#week').hidden).toBe(false);
    expect([find('#appointments').hidden, find('#settings').hidden, find('#users').hidden, find('#availability').hidden]).toEqual([true, true, true, true]);
    // Mounted first, then started: the view was listening when the load began.
    expect(find('#week .week-label').textContent).toBe('16 Nov – 22 Nov 2026');
    expect(find('#week .loading').hidden).toBe(false);
    expect(apiCalls()).toEqual([[WEEK_URL, `Bearer ${token}`]]);

    await weekDrawn();
    expect(find('#week .loading').hidden).toBe(true);
    expect(find('#week .zone-name').textContent).toBe('Europe/Rome');
  });

  it('the Administrator sees names, a User sees "You"', async () => {
    fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
    mounted(ADMIN);
    await weekDrawn();
    expect(find('#week .appointment .who').textContent).toBe('bob');

    shell?.unsubscribe();
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    mounted(ALICE);
    await weekDrawn();
    expect(find('#week .appointment .who').textContent).toBe('You');
  });

  it.each(['', '#', '#/nothing', '#/week/', '#week'])('the address "%s" shows the week and is put right, without a new step in the history', (hash) => {
    window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    const steps = window.history.length;
    mounted(ALICE);
    expect(window.location.hash).toBe('#/week');
    expect(window.history.length).toBe(steps);
    expect(find('#week').hidden).toBe(false);
    expect(links()[0]!.getAttribute('aria-current')).toBe('page');
  });

  it('an unknown address typed while the week is on show is put right, and the week is neither left nor loaded again', async () => {
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    mounted(ALICE);
    await weekDrawn();
    const drawn = days()[0];

    window.location.hash = '#/nothing';
    await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
    expect(find('#week').hidden).toBe(false);
    expect(days()[0]).toBe(drawn);
    expect(apiCalls()).toHaveLength(1);
  });

  it('a refreshed session loads nothing again and redraws nothing', async () => {
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    const { store } = mounted(ALICE);
    await weekDrawn();
    const drawn = days();
    const link = links()[0];

    store.set(session({ accessToken: 'access-token-2', idToken: 'id-token-2', expiresAt: new Date(Date.now() + 3_600_000) }));
    expect(apiCalls()).toHaveLength(1);
    expect(days()).toEqual(drawn);
    expect(days()[0]).toBe(drawn[0]);
    expect(links()[0]).toBe(link);

    // The next call carries the new token: the service reads it from the store at that moment.
    find('#week .next').click();
    expect(apiCalls()[1]).toEqual(['http://api.test/calendar?from=2026-11-23&to=2026-11-29', 'Bearer access-token-2']);
  });

  it('sign out and in as another person: no link, no week and no name of the first is left', async () => {
    fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
    const { store, signOut } = mounted();
    const before = html(); // the page at the login, before anyone signed in
    store.set(ADMIN);
    await weekDrawn();
    expect(html()).toContain('Bob\'s note');

    signOut.click();
    expect(window.location.hash).toBe('#/week'); // signing out leaves the address as it is
    expect(links()).toHaveLength(0);
    expect(days()).toHaveLength(0);
    expect(find('#week').hidden).toBe(true);
    for (const gone of ['bob', 'Bob\'s note', 'admin', 'Studio', '16 Nov', 'Europe/Rome']) expect(html()).not.toContain(gone);
    expect(html()).toBe(before);

    // The next person gets services of their own: nothing is replayed from the first one's.
    store.set(ALICE);
    expect(days()).toHaveLength(0);
    expect(find('#week .zone').hidden).toBe(true);
    expect(apiCalls()).toEqual([
      [WEEK_URL, 'Bearer access-token-admin'],
      [WEEK_URL, 'Bearer access-token-alice'],
    ]);
    for (const gone of ['bob', 'Bob\'s note', 'admin']) expect(html()).not.toContain(gone);
    expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments', 'My details', 'Password']);
  });

  it('a failed load shows the failure in plain words; "Today" asks again', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mounted(ALICE);
    await vi.waitFor(() => expect(find('#week .failure').hidden).toBe(false));
    expect(find('#week .failure').textContent).toBe('The server cannot be reached. Check the connection and try again.');
    expect(html()).not.toContain('Failed to fetch');

    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    find('#week .today').click();
    await weekDrawn();
    expect(find('#week .failure').hidden).toBe(true);
  });

  it('ending the shell leaves the screen: the week is emptied and hidden, the address no longer followed', async () => {
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    mounted(ALICE);
    await weekDrawn();
    shell?.unsubscribe();
    expect(days()).toHaveLength(0);
    expect(find('#week').hidden).toBe(true);
    expect(links()).toHaveLength(0);

    window.location.hash = '#/nothing';
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(window.location.hash).toBe('#/nothing');
  });

  // Booking and cancelling with the real services of the session behind the stubbed fetch
  // (docs/FRONTEND_ARCHITECTURE.md section 6, point 4): the week is loaded again by the week
  // screen, at every result.
  describe('booking and cancelling', () => {
    const OWN = winterWeek().appointments[0]!;
    const calls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl));
    const book = () => find<HTMLDialogElement>('#week dialog.book');
    const detail = () => find<HTMLDialogElement>('dialog.detail');

    it('a User books a slot: the call, the dialog closed on its success, and the week loaded again', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      await weekDrawn();

      fetchMock.mockResolvedValueOnce(json(201, OWN));
      find('#week .slot').click();
      expect(book().open).toBe(true);
      find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value = 'First lesson';
      submit(find<HTMLFormElement>('#week dialog.book form'));
      expect(find<HTMLButtonElement>('#week dialog.book .submit').disabled).toBe(true);

      await vi.waitFor(() => expect(book().open).toBe(false));
      const [url, init] = calls()[1]!;
      expect([url, init.method]).toEqual(['http://api.test/calendar/appointments', 'POST']);
      expect(JSON.parse(String(init.body))).toEqual({ start: '2026-11-16T07:00:00.000Z', note: 'First lesson' });
      // The third call is the same week again.
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]).toEqual([WEEK_URL, 'Bearer access-token-alice']);
      // A User's view never asks for the list of users.
      expect(apiCalls().some(([address]) => address!.includes('/users'))).toBe(false);
    });

    it('a booking that is refused: the sentence in the dialog, still open, and the week loaded again all the same', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      await weekDrawn();

      fetchMock.mockResolvedValueOnce(json(409, { error: 'slot_taken', message: 'the slot overlaps another appointment' }));
      fetchMock.mockResolvedValueOnce(json(200, { ...winterWeek(), days: winterWeek().days.map((day) => ({ ...day, slots: [] })) }));
      find('#week .slot').click();
      submit(find<HTMLFormElement>('#week dialog.book form'));

      await vi.waitFor(() => expect(find('#week dialog.book .error').textContent).toBe('This time is full: there is no place left. The calendar has been refreshed: please choose another time.'));
      expect(book().open).toBe(true);
      await vi.waitFor(() => expect(document.querySelectorAll('#week .slot')).toHaveLength(0));
      expect(apiCalls()[2]).toEqual([WEEK_URL, 'Bearer access-token-alice']);
      expect(book().open).toBe(true);
      expect(html()).not.toContain('overlaps');
    });

    it('a User cancels an appointment from its detail: the call, the dialog closed, the week loaded again', async () => {
      // 14 November: the appointment of Monday 16 can still be cancelled.
      vi.setSystemTime(new Date('2026-11-14T10:00:00.000Z'));
      const week = 'http://api.test/calendar?from=2026-11-09&to=2026-11-15';
      const id = '01M6DMQ0000000000000000001';
      fetchMock.mockResolvedValueOnce(json(200, { ...winterWeek(), appointments: [{ ...OWN, appointmentId: id }] }));
      mounted(ALICE);
      await weekDrawn();

      find('#week .appointment').click();
      expect(detail().open).toBe(true);
      expect(find('dialog.detail .hint').textContent).toBe('It can be changed or cancelled until Sun 15 Nov, 11:00.');
      fetchMock.mockResolvedValueOnce(json(200, { ...OWN, status: 'cancelled' }));
      find('dialog.detail .cancel').click();

      await vi.waitFor(() => expect(detail().open).toBe(false));
      const [url, init] = calls()[1]!;
      expect([url, init.method, init.body]).toEqual([`http://api.test/calendar/appointments/${id}/cancel`, 'POST', undefined]);
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]![0]).toBe(week);
    });

    it('the Administrator\'s book dialog asks for the Users of the session\'s own service and books for the one chosen', async () => {
      fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
      mounted(ADMIN);
      await weekDrawn();

      fetchMock.mockResolvedValueOnce(json(200, { users: [summary('alice', '2026-11-01T10:00:00.000Z'), summary('bob', '2026-11-02T10:00:00.000Z')] }));
      find('#week .slot').click();
      expect(apiCalls()[1]).toEqual(['http://api.test/users', 'Bearer access-token-admin']);
      const picker = find<HTMLSelectElement>('#week dialog.book [name="username"]');
      await vi.waitFor(() => expect(picker.options).toHaveLength(2));

      picker.value = 'bob';
      fetchMock.mockResolvedValueOnce(json(201, { ...OWN, username: 'bob' }));
      submit(find<HTMLFormElement>('#week dialog.book form'));
      await vi.waitFor(() => expect(book().open).toBe(false));
      expect(JSON.parse(String(calls()[2]![1].body))).toEqual({ start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', username: 'bob' });
      expect(apiCalls()[3]).toEqual([WEEK_URL, 'Bearer access-token-admin']);
    });

    it('signing out with a dialog open leaves nothing: both closed, no note, no name, the page as before anyone signed in', async () => {
      fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
      const { store, signOut } = mounted();
      const before = html();
      store.set(ADMIN);
      await weekDrawn();

      fetchMock.mockResolvedValueOnce(json(200, { users: [summary('carol', '2026-11-01T10:00:00.000Z')] }));
      find('#week .slot').click();
      await vi.waitFor(() => expect(find<HTMLSelectElement>('#week dialog.book [name="username"]').options).toHaveLength(1));
      find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value = 'A private note';
      find('#week .appointment').click(); // the emulated page lets a click through a modal dialog
      expect([book().open, detail().open]).toEqual([true, true]);
      expect(html()).toContain('carol');
      expect(find('dialog.detail .note').textContent).toBe('Bob\'s note');

      signOut.click();
      expect([book().open, detail().open]).toEqual([false, false]);
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('');
      for (const gone of ['carol', 'bob', 'Bob\'s note', 'A private note', 'Studio']) expect(html()).not.toContain(gone);
      expect(html()).toBe(before);

      // The next person opens the same dialogs empty.
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      store.set(ALICE);
      await weekDrawn();
      find('#week .slot').click();
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('');
      expect(find('#week dialog.book .choices').hidden).toBe(true);
      expect(find('#week dialog.book').textContent).not.toContain('carol');
    });
  });

  // The note and the change with the real services of the session behind the stubbed fetch: the
  // week screen loads the week again at every result, and holds the move, which ends with the
  // person's session (docs/FRONTEND_ARCHITECTURE.md section 6, point 4).
  describe('the note and the change', () => {
    const ID = '01M6DMQ0000000000000000001';
    const NEW_ID = '01M6DMQ0000000000000000002';
    const OWN = { ...winterWeek().appointments[0]!, appointmentId: ID };
    // Saturday 14 November: the week on screen is Monday 9 to Sunday 15, and the appointment of
    // Monday 16 that the fixture answers can still be changed.
    const WEEK_OF_14 = 'http://api.test/calendar?from=2026-11-09&to=2026-11-15';
    const calls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl));
    const book = () => find<HTMLDialogElement>('#week dialog.book');
    const detail = () => find<HTMLDialogElement>('dialog.detail');
    const banner = () => find('#week .moving');
    const noteField = () => find<HTMLTextAreaElement>('dialog.detail [name="note"]');
    const week = (over: object = {}) => ({ ...winterWeek(), appointments: [OWN], ...over });
    const entered = async (who = ALICE, answer: object = week()) => {
      vi.setSystemTime(new Date('2026-11-14T10:00:00.000Z'));
      fetchMock.mockResolvedValueOnce(json(200, answer));
      const made = mounted(who);
      await weekDrawn();
      return made;
    };

    it('a note saved: the call, the dialog closed on its success, and the week loaded again', async () => {
      await entered();
      find('#week .appointment').click();
      expect(noteField().value).toBe('First lesson');
      noteField().value = ' Second lesson ';
      fetchMock.mockResolvedValueOnce(json(200, { ...OWN, note: 'Second lesson' }));
      fetchMock.mockResolvedValueOnce(json(200, week({ appointments: [{ ...OWN, note: 'Second lesson' }] })));
      submit(find<HTMLFormElement>('dialog.detail .note-form'));
      expect(find<HTMLButtonElement>('dialog.detail .note-form .submit').disabled).toBe(true);

      await vi.waitFor(() => expect(detail().open).toBe(false));
      const [url, init] = calls()[1]!;
      expect([url, init.method]).toEqual([`http://api.test/calendar/appointments/${ID}`, 'PATCH']);
      expect(JSON.parse(String(init.body))).toEqual({ note: 'Second lesson' });
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]).toEqual([WEEK_OF_14, 'Bearer access-token-alice']);
      await vi.waitFor(() => expect(find('#week .appointment .note').textContent).toBe('Second lesson'));
    });

    it('an emptied note is sent as null; a note refused is said in the dialog, still open, and the week is loaded again all the same', async () => {
      await entered();
      find('#week .appointment').click();
      noteField().value = '   ';
      fetchMock.mockResolvedValueOnce(json(409, { error: 'appointment_not_active', message: 'the appointment was cancelled' }));
      submit(find<HTMLFormElement>('dialog.detail .note-form'));

      await vi.waitFor(() => expect(find('dialog.detail .error').textContent).toBe('This appointment has already been cancelled, or it has ended.'));
      expect(JSON.parse(String(calls()[1]![1].body))).toEqual({ note: null });
      expect(detail().open).toBe(true);
      expect(noteField().value).toBe('   ');
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]![0]).toBe(WEEK_OF_14);
      expect(html()).not.toContain('was cancelled');
    });

    it('a User changes an appointment: the banner, the confirmation, the call, the dialog closed, the move over and the week loaded again', async () => {
      await entered();
      find('#week .appointment').click();
      find('dialog.detail .change').click();
      expect(detail().open).toBe(false);
      expect(banner().hidden).toBe(false);
      expect(find('#week .moving p').textContent).toBe('Moving: Mon 16 Nov, 11:00–12:00 · Studio. Choose a free time.');
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(true);
      expect(apiCalls()).toHaveLength(1); // starting a move asks nothing of the server

      find('#week .slot').click();
      expect(book().open).toBe(true);
      expect(find('#week dialog.book .old').textContent).toBe('Mon 16 Nov, 11:00–12:00');
      expect(find('#week dialog.book .what').textContent).toBe('Mon 16 Nov, 08:00–09:00 · Studio');
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('First lesson');

      const moved = { ...OWN, appointmentId: NEW_ID, start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', replaces: ID };
      fetchMock.mockResolvedValueOnce(json(201, { cancelled: { ...OWN, status: 'cancelled', cancelReason: 'changed', replacedBy: NEW_ID }, booked: moved }));
      fetchMock.mockResolvedValueOnce(json(200, week({ appointments: [moved] })));
      submit(find<HTMLFormElement>('#week dialog.book form'));
      expect(find<HTMLButtonElement>('#week dialog.book .submit').disabled).toBe(true);

      await vi.waitFor(() => expect(book().open).toBe(false));
      const [url, init] = calls()[1]!;
      expect([url, init.method]).toEqual([`http://api.test/calendar/appointments/${ID}/change`, 'POST']);
      expect(JSON.parse(String(init.body))).toEqual({ start: '2026-11-16T07:00:00.000Z', note: 'First lesson' });
      // The move is over because the week screen heard the result, and the week is asked again.
      expect(banner().hidden).toBe(true);
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]).toEqual([WEEK_OF_14, 'Bearer access-token-alice']);
      await vi.waitFor(() => expect(find('#week .appointment .time').textContent).toBe('08:00–09:00'));
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(false);
      expect(apiCalls().some(([address]) => address!.includes('/users'))).toBe(false);
    });

    it('a change that is refused: the sentence in the confirmation, the week loaded again, and the banner still there after closing', async () => {
      await entered();
      find('#week .appointment').click();
      find('dialog.detail .change').click();
      find('#week .slot').click();

      fetchMock.mockResolvedValueOnce(json(403, { error: 'cancellation_notice_too_short', message: 'Too late to change this appointment' }));
      fetchMock.mockResolvedValueOnce(json(200, week()));
      submit(find<HTMLFormElement>('#week dialog.book form'));
      await vi.waitFor(() => expect(find('#week dialog.book .error').textContent).toBe('It is too late to change this appointment.'));
      expect(book().open).toBe(true);
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]![0]).toBe(WEEK_OF_14);

      await vi.waitFor(() => expect(find('#week .loading').hidden).toBe(true));
      expect(book().open).toBe(true);
      book().close();
      expect(banner().hidden).toBe(false);
      // The week drawn again behind the dialog has its appointment disabled: the move goes on.
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(true);

      find('#week .keep').click();
      expect(banner().hidden).toBe(true);
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(false);
      expect(apiCalls()).toHaveLength(3); // giving up asks nothing of the server
    });

    it('the Administrator changes a User\'s appointment: no list of users is asked for, and no username is sent', async () => {
      await entered(ADMIN, week({ appointments: [{ ...OWN, username: 'bob', cancellableUntil: null }] }));
      find('#week .appointment').click();
      find('dialog.detail .change').click();
      expect(find('#week .moving p').textContent).toBe('Moving: Mon 16 Nov, 11:00–12:00 · Studio · bob. Choose a free time.');
      find('#week .slot').click();
      expect(find('#week dialog.book .user').hidden).toBe(true);
      expect(apiCalls()).toHaveLength(1);

      fetchMock.mockResolvedValueOnce(json(201, { cancelled: OWN, booked: { ...OWN, appointmentId: NEW_ID } }));
      submit(find<HTMLFormElement>('#week dialog.book form'));
      await vi.waitFor(() => expect(book().open).toBe(false));
      expect(JSON.parse(String(calls()[1]![1].body))).toEqual({ start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', note: 'First lesson' });
      expect(apiCalls().some(([address]) => address!.includes('/users'))).toBe(false);
    });

    it('while moving, the tab hidden and shown again loads the week again and leaves the banner and the open confirmation as they are', async () => {
      await entered();
      find('#week .appointment').click();
      find('dialog.detail .change').click();
      find('#week .slot').click();
      find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value = 'Typed';

      fetchMock.mockResolvedValueOnce(json(200, week({ days: winterWeek().days.map((day) => ({ ...day, slots: [] })) })));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete (document as { visibilityState?: string }).visibilityState;
      await vi.waitFor(() => expect(document.querySelectorAll('#week .slot')).toHaveLength(0));
      expect(apiCalls()).toHaveLength(2);
      expect(banner().hidden).toBe(false);
      expect(book().open).toBe(true);
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('Typed');
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(true);
    });

    it('signing out while an appointment is being moved leaves nothing: no banner, no dialog, no note, the page as before anyone signed in; the next person moves nothing', async () => {
      vi.setSystemTime(new Date('2026-11-14T10:00:00.000Z'));
      fetchMock.mockResolvedValueOnce(json(200, week({ appointments: [{ ...OWN, username: 'bob', note: 'Bob\'s note', cancellableUntil: null }] })));
      const { store, signOut } = mounted();
      const before = html();
      store.set(ADMIN);
      await weekDrawn();

      find('#week .appointment').click();
      find<HTMLTextAreaElement>('dialog.detail [name="note"]').value = 'Typed in the detail';
      find('dialog.detail .change').click();
      find('#week .slot').click();
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('Bob\'s note');
      find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value = 'A private note';
      expect([banner().hidden, book().open]).toEqual([false, true]);
      expect(html()).toContain('· bob');

      signOut.click();
      expect([banner().hidden, book().open, detail().open]).toEqual([true, false, false]);
      const fields = [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held);
      expect(fields.every((value) => value === '')).toBe(true);
      for (const gone of ['bob', 'Bob\'s note', 'A private note', 'Typed in the detail', 'Mon 16 Nov', 'Studio']) expect(html()).not.toContain(gone);
      expect(html()).toBe(before);

      // The next person: no banner, every appointment enabled, and a slot opens a booking.
      fetchMock.mockResolvedValueOnce(json(200, week()));
      store.set(ALICE);
      await weekDrawn();
      expect(banner().hidden).toBe(true);
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(false);
      find('#week .slot').click();
      expect(find('#week dialog.book .old').textContent).toBe('');
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('');
      expect([...document.querySelectorAll<HTMLElement>('#week dialog.book .in-change')].every((element) => element.hidden)).toBe(true);
      find('#week dialog.book .close').click();
      find('#week .appointment').click();
      expect(noteField().value).toBe('First lesson');
    });

    it('the same person signing in again after a move left half-way moves nothing: the session\'s objects were dropped', async () => {
      const { store, signOut } = await entered();
      find('#week .appointment').click();
      find('dialog.detail .change').click();
      expect(banner().hidden).toBe(false);
      signOut.click();

      fetchMock.mockResolvedValueOnce(json(200, week()));
      store.set(ALICE);
      await weekDrawn();
      expect(banner().hidden).toBe(true);
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(false);
    });
  });

  // The page becoming visible again (docs/FRONTEND_ARCHITECTURE.md section 6): the shell turns
  // the document's visibilitychange into the stream the week screen reloads on.
  describe('the tab hidden and shown again', () => {
    const becomes = (visibility: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    afterEach(() => {
      // Back to the emulated document's own property.
      delete (document as { visibilityState?: string }).visibilityState;
    });

    it('hidden alone loads nothing; shown again, the week on screen is loaded once more', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      await weekDrawn();
      find('#week .next').click();
      expect(apiCalls()).toHaveLength(2);

      becomes('hidden');
      expect(apiCalls()).toHaveLength(2);
      becomes('visible');
      expect(apiCalls()).toHaveLength(3);
      // The week on screen, not the week of today.
      expect(apiCalls()[2]).toEqual(['http://api.test/calendar?from=2026-11-23&to=2026-11-29', 'Bearer access-token-alice']);
      becomes('hidden');
      becomes('visible');
      expect(apiCalls()).toHaveLength(4);
    });

    it('with a dialog open the week is loaded again and the dialog stays as it is', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      await weekDrawn();
      find('#week .slot').click();
      find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value = 'First lesson';

      fetchMock.mockResolvedValueOnce(json(200, { ...winterWeek(), days: winterWeek().days.map((day) => ({ ...day, slots: [] })) }));
      becomes('hidden');
      becomes('visible');
      await vi.waitFor(() => expect(document.querySelectorAll('#week .slot')).toHaveLength(0));
      expect(find<HTMLDialogElement>('#week dialog.book').open).toBe(true);
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('First lesson');
    });

    it('nothing is loaded at the login, nor after signing out', async () => {
      const { store, signOut } = mounted();
      becomes('hidden');
      becomes('visible');
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      store.set(ALICE);
      await weekDrawn();
      signOut.click();
      becomes('hidden');
      becomes('visible');
      expect(apiCalls()).toHaveLength(1);
    });

    it('a second person\'s return to the tab loads that person\'s week only, once', async () => {
      const { store, signOut } = mounted(ADMIN);
      signOut.click();
      store.set(ALICE);
      expect(apiCalls()).toHaveLength(2);
      becomes('hidden');
      becomes('visible');
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]![1]).toBe('Bearer access-token-alice');
    });
  });

  // A table with one more screen, whose mount is a spy: what the shell does with any entry of
  // its table, seen from the entry's side (what it is called with, when it is left). The entry
  // is the Administrator's only, and is shown on the week's element. The real second screen
  // has its own block below.
  describe('with a screen of the test\'s own, for the Administrator only', () => {
    const other = () => {
      const left = vi.fn();
      const show = vi.fn<Screen['show']>(() => new Subscription(left));
      const screen: Screen = { hash: '#/other', label: 'Other', roles: ['admin'], element: '#week', show };
      return { screens: [...SCREENS, screen], show, left };
    };
    const current = () => links().map((a) => [a.textContent, a.getAttribute('aria-current')]);

    it('the navigation has the links of the role, in the table\'s order', () => {
      const { screens } = other();
      mounted(ADMIN, screens);
      expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ['Week', '#/week'],
        ['Settings', '#/settings'],
        ['Users', '#/users'],
        ['Availability', '#/availability'],
        ['My details', '#/me'], ['Password', '#/password'],
        ['Other', '#/other'],
      ]);
      // "My appointments" is in the table too, and is not the Administrator's.
      shell?.unsubscribe();
      mounted(ALICE, screens);
      expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments', 'My details', 'Password']);
    });

    it('a change of address leaves the screen on show and mounts the next; the link marked follows', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      const { screens, show, left } = other();
      mounted(ADMIN, screens);
      await weekDrawn();
      expect(current()).toEqual([['Week', 'page'], ['Settings', null], ['Users', null], ['Availability', null], ['My details', null], ['Password', null], ['Other', null]]);

      window.location.hash = '#/other';
      await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
      expect(show.mock.calls[0]![0]).toBe(find('#week'));
      expect(days()).toHaveLength(0); // the week view was left, and cleaned up after itself
      expect(find('#week').hidden).toBe(false); // the element is the other screen's now
      expect(current()).toEqual([['Week', null], ['Settings', null], ['Users', null], ['Availability', null], ['My details', null], ['Password', null], ['Other', 'page']]);
      expect(left).not.toHaveBeenCalled();

      // Back: the other screen is left, the week mounted and loaded again.
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      links()[0]!.click();
      await weekDrawn();
      expect(left).toHaveBeenCalledTimes(1);
      expect(current()).toEqual([['Week', 'page'], ['Settings', null], ['Users', null], ['Availability', null], ['My details', null], ['Password', null], ['Other', null]]);
      expect(apiCalls()).toHaveLength(2);
    });

    it('an address the role may not see shows the role\'s first screen, and the address is put right', () => {
      const { screens, show } = other();
      window.history.replaceState(null, '', `${window.location.pathname}#/other`);
      mounted(ALICE, screens);
      expect(window.location.hash).toBe('#/week');
      expect(show).not.toHaveBeenCalled();
      expect(find('#week .week-label').textContent).toBe('16 Nov – 22 Nov 2026');
    });

    it('signing out leaves the address; the next person starts from their first screen if it is not theirs to see', () => {
      const { screens, show, left } = other();
      window.history.replaceState(null, '', `${window.location.pathname}#/other`);
      const { store, signOut } = mounted(ADMIN, screens);
      expect(show).toHaveBeenCalledTimes(1);
      expect(apiCalls()).toHaveLength(0); // the week was never shown, so never loaded

      signOut.click();
      expect(left).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe('#/other');
      expect(find('#week').hidden).toBe(true);

      store.set(ALICE);
      expect(window.location.hash).toBe('#/week');
      expect(show).toHaveBeenCalledTimes(1);
      expect(apiCalls()).toHaveLength(1);

      // And the same address is theirs to see for the next Administrator.
      signOut.click();
      window.history.replaceState(null, '', `${window.location.pathname}#/other`);
      store.set(ADMIN);
      expect(window.location.hash).toBe('#/other');
      expect(show).toHaveBeenCalledTimes(2);
    });
  });
  // "My appointments", the real second screen (docs/FRONTEND_ARCHITECTURE.md section 6): its
  // address, for a User only; the settings read for the time zone, then the list; the detail
  // dialog shared with the week; the hand-over of an appointment to the week; and each screen
  // found again as it was left, with the real services of the session behind the stubbed fetch.
  describe('"My appointments", the second screen', () => {
    const ID = '01M6DMQ0000000000000000001';
    const NEW_ID = '01M6DMQ0000000000000000002';
    const SETTINGS_URL = 'http://api.test/calendar/settings';
    const UPCOMING_URL = 'http://api.test/calendar/appointments?upcoming=true&status=booked';
    const HISTORY_URL = 'http://api.test/calendar/appointments?from=2026-10-21&to=2026-11-19&status=all';
    const LATER_WEEK_URL = 'http://api.test/calendar?from=2026-12-07&to=2026-12-13';
    const BEARER = 'Bearer access-token-alice';
    const settings = (timeZone = 'Europe/Rome') =>
      json(200, { timeZone, cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: null, updatedBy: null });
    // Monday 7 December, 10:00–11:00 in Rome: three weeks after the week of "now".
    const LATER = appointment({ appointmentId: ID, start: '2026-12-07T09:00:00.000Z', end: '2026-12-07T10:00:00.000Z', date: '2026-12-07', note: 'First lesson', cancellableUntil: '2026-12-06T09:00:00.000Z' });
    const GONE = appointment({ appointmentId: NEW_ID, start: '2026-11-10T09:00:00.000Z', end: '2026-11-10T10:00:00.000Z', date: '2026-11-10', status: 'cancelled', cancelReason: 'changed' });
    const list = (appointments: object[] = [LATER]) => json(200, { appointments });
    // The week of the appointment, with a free slot on its Monday, 08:00–09:00.
    const laterWeek = (appointments: object[] = [LATER]) =>
      view('2026-12-07', { appointments: appointments as never }, [
        {
          date: '2026-12-07',
          windows: [{ start: '2026-12-07T07:00:00.000Z', end: '2026-12-07T11:00:00.000Z', typeId: STUDIO, typeName: 'Studio' }],
          slots: [{ start: '2026-12-07T07:00:00.000Z', end: '2026-12-07T08:00:00.000Z', typeId: STUDIO, capacity: 1, placesLeft: 1 }],
        },
      ]);

    const calls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl));
    const rows = () => [...document.querySelectorAll<HTMLElement>('#appointments .row')];
    const listed = (count = 1) => vi.waitFor(() => expect(rows()).toHaveLength(count));
    const pressed = () => ['.upcoming', '.history'].map((selector) => find(`#appointments ${selector}`).getAttribute('aria-pressed'));
    const current = () => links().map((a) => [a.textContent, a.getAttribute('aria-current')]);
    const detail = () => find<HTMLDialogElement>('dialog.detail');
    const banner = () => find('#week .moving');
    const at = (hash: string) => window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    // A User who arrives on the list's address, with the list answered.
    const onList = async (appointments: object[] = [LATER]) => {
      at('#/appointments');
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list(appointments));
      const made = mounted(ALICE);
      await listed(appointments.length);
      return made;
    };
    const becomesVisible = () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    afterEach(() => {
      delete (document as { visibilityState?: string }).visibilityState;
    });

    it('a User on #/appointments: the address stays, its link is the one marked, the list is shown and the week is neither shown nor loaded', async () => {
      at('#/appointments');
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      mounted(ALICE);
      expect(window.location.hash).toBe('#/appointments');
      expect(current()).toEqual([['Week', null], ['My appointments', 'page'], ['My details', null], ['Password', null]]);
      expect([find('#week').hidden, find('#appointments').hidden]).toEqual([true, false]);
      // Mounted first, then started: the view was listening when the first read began.
      expect(find('#appointments .loading').hidden).toBe(false);
      expect(pressed()).toEqual(['true', 'false']);

      await listed();
      expect(rows()[0]!.textContent).toBe('Mon 7 Dec 10:00–11:00 Studio First lesson Booked');
      expect(find('#appointments .loading').hidden).toBe(true);
      expect(days()).toHaveLength(0);
    });

    it('the list asks the settings, then the list, each with the person\'s token, and nothing else', async () => {
      at('#/appointments');
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      mounted(ALICE);
      // The list waits for the zone: one request so far.
      expect(apiCalls()).toEqual([[SETTINGS_URL, BEARER]]);
      await listed();
      expect(apiCalls()).toEqual([
        [SETTINGS_URL, BEARER],
        [UPCOMING_URL, BEARER],
      ]);
      expect(calls().map(([, init]) => init.method)).toEqual(['GET', 'GET']);
      for (const token of TOKENS) expect(html()).not.toContain(token);
    });

    it('the times of the list are in the zone the settings name, not in the default one', async () => {
      at('#/appointments');
      fetchMock.mockResolvedValueOnce(settings('Asia/Kolkata'));
      fetchMock.mockResolvedValueOnce(list());
      mounted(ALICE);
      await listed();
      expect(rows()[0]!.querySelector('.time')!.textContent).toBe('14:30–15:30');
      rows()[0]!.click();
      expect(find('dialog.detail .when').textContent).toBe('Mon 7 Dec, 14:30–15:30');
    });

    it('a failed read of the settings is said in the place of the list; choosing a mode tries again', async () => {
      at('#/appointments');
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      mounted(ALICE);
      await vi.waitFor(() => expect(find('#appointments .failure').hidden).toBe(false));
      expect(find('#appointments .failure').textContent).toBe('The server cannot be reached. Check the connection and try again.');
      expect(apiCalls()).toHaveLength(1);
      expect(html()).not.toContain('Failed to fetch');

      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      find('#appointments .upcoming').click();
      await listed();
      expect(find('#appointments .failure').hidden).toBe(true);
      expect(apiCalls().map(([address]) => address)).toEqual([SETTINGS_URL, SETTINGS_URL, UPCOMING_URL]);
    });

    it('#/appointments typed by the Administrator shows the week, and the address is put right', async () => {
      at('#/appointments');
      fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
      mounted(ADMIN);
      expect(window.location.hash).toBe('#/week');
      expect(current()).toEqual([['Week', 'page'], ['Settings', null], ['Users', null], ['Availability', null], ['My details', null], ['Password', null]]);
      expect([find('#week').hidden, find('#appointments').hidden]).toEqual([false, true]);
      await weekDrawn();
      expect(apiCalls()).toEqual([[WEEK_URL, 'Bearer access-token-admin']]);

      // Typed again while the week is on show: put right again, and nothing is asked.
      window.location.hash = '#/appointments';
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      expect(find('#appointments').hidden).toBe(true);
      expect(apiCalls()).toHaveLength(1);
    });

    it('"History" loads the 30 days that end today at once, with every status; "Show" loads another period; a period refused asks nothing', async () => {
      await onList();
      fetchMock.mockResolvedValueOnce(list([GONE, LATER]));
      find('#appointments .history').click();
      expect(apiCalls()[2]).toEqual([HISTORY_URL, BEARER]);
      await listed(2);
      expect(pressed()).toEqual(['false', 'true']);
      expect(rows().map((button) => button.querySelector('.status')!.textContent)).toEqual(['Changed', 'Booked']);
      const from = find<HTMLInputElement>('#appointments [name="from"]');
      const to = find<HTMLInputElement>('#appointments [name="to"]');
      expect([from.value, to.value]).toEqual(['2026-10-21', '2026-11-19']);

      from.value = '2026-09-01';
      to.value = '2026-12-02'; // 93 days
      submit(find<HTMLFormElement>('#appointments .period'));
      expect(find('#appointments .refusal').textContent).toBe('A period can be at most 92 days long. Choose a shorter one.');
      expect(apiCalls()).toHaveLength(3);
      expect(rows()).toHaveLength(2);

      fetchMock.mockResolvedValueOnce(list([]));
      to.value = '2026-09-30';
      submit(find<HTMLFormElement>('#appointments .period'));
      expect(apiCalls()[3]).toEqual(['http://api.test/calendar/appointments?from=2026-09-01&to=2026-09-30&status=all', BEARER]);
      expect(find('#appointments .refusal').textContent).toBe('');
      await vi.waitFor(() => expect(find('#appointments .empty').textContent).toBe('There are no appointments in this period.'));
      expect(rows()).toHaveLength(0);
    });

    it('a cancellation from the list: the call, the dialog closed, and the list loaded again, the settings not read again', async () => {
      await onList();
      rows()[0]!.click();
      expect(detail().open).toBe(true);
      expect(find('dialog.detail .hint').textContent).toBe('It can be changed or cancelled until Sun 6 Dec, 10:00.');

      fetchMock.mockResolvedValueOnce(json(200, { ...LATER, status: 'cancelled', cancelReason: 'cancelled' }));
      fetchMock.mockResolvedValueOnce(list([]));
      find('dialog.detail .cancel').click();
      await vi.waitFor(() => expect(detail().open).toBe(false));
      const [url, init] = calls()[2]!;
      expect([url, init.method, init.body]).toEqual([`http://api.test/calendar/appointments/${ID}/cancel`, 'POST', undefined]);
      expect(apiCalls()).toHaveLength(4);
      expect(apiCalls()[3]).toEqual([UPCOMING_URL, BEARER]);
      await vi.waitFor(() => expect(find('#appointments .empty').textContent).toBe('You have no upcoming appointments.'));
      expect(rows()).toHaveLength(0);
    });

    it('a cancellation that is refused: the sentence in the dialog, still open, and the list loaded again all the same', async () => {
      await onList();
      rows()[0]!.click();
      fetchMock.mockResolvedValueOnce(json(403, { error: 'cancellation_notice_too_short', message: '23 h < 24 h' }));
      fetchMock.mockResolvedValueOnce(list());
      find('dialog.detail .cancel').click();
      await vi.waitFor(() => expect(find('dialog.detail .error').textContent).toBe('It is too late to cancel this appointment.'));
      expect(detail().open).toBe(true);
      expect(apiCalls()).toHaveLength(4);
      expect(apiCalls()[3]![0]).toBe(UPCOMING_URL);
      expect(html()).not.toContain('23 h');
    });

    it('a note saved from the list: the call, the dialog closed, and the row follows the list loaded again', async () => {
      await onList();
      rows()[0]!.click();
      find<HTMLTextAreaElement>('dialog.detail [name="note"]').value = ' Second lesson ';
      fetchMock.mockResolvedValueOnce(json(200, { ...LATER, note: 'Second lesson' }));
      fetchMock.mockResolvedValueOnce(list([{ ...LATER, note: 'Second lesson' }]));
      submit(find<HTMLFormElement>('dialog.detail .note-form'));
      await vi.waitFor(() => expect(detail().open).toBe(false));
      const [url, init] = calls()[2]!;
      expect([url, init.method]).toEqual([`http://api.test/calendar/appointments/${ID}`, 'PATCH']);
      expect(JSON.parse(String(init.body))).toEqual({ note: 'Second lesson' });
      await vi.waitFor(() => expect(rows()[0]!.querySelector('.note')!.textContent).toBe('Second lesson'));
      expect(apiCalls()).toHaveLength(4);
    });

    it('with the history on show, the tab shown again loads the same period again', async () => {
      await onList();
      fetchMock.mockResolvedValueOnce(list([GONE]));
      find('#appointments .history').click();
      await vi.waitFor(() => expect(rows()[0]!.querySelector('.status')!.textContent).toBe('Changed'));

      fetchMock.mockResolvedValueOnce(list([GONE, LATER]));
      becomesVisible();
      expect(apiCalls()).toHaveLength(4);
      expect(apiCalls()[3]).toEqual([HISTORY_URL, BEARER]);
      await listed(2);
      // The week is not on show: it is not loaded.
      expect(apiCalls().some(([address]) => address!.includes('/calendar?'))).toBe(false);
    });

    it('"Change" from the list: the address becomes the week\'s, the week shown is the appointment\'s, and the banner names it', async () => {
      await onList();
      rows()[0]!.click();
      fetchMock.mockResolvedValueOnce(json(200, laterWeek()));
      find('dialog.detail .change').click();
      expect(detail().open).toBe(false);

      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      await weekDrawn();
      expect(current()).toEqual([['Week', 'page'], ['My appointments', null], ['My details', null], ['Password', null]]);
      // The week of Monday 7 December, not the week of today; and the list was left clean.
      expect(apiCalls()).toHaveLength(3);
      expect(apiCalls()[2]).toEqual([LATER_WEEK_URL, BEARER]);
      expect(find('#week .week-label').textContent).toBe('7 Dec – 13 Dec 2026');
      expect([find('#week').hidden, find('#appointments').hidden]).toEqual([false, true]);
      expect(rows()).toHaveLength(0);
      expect(banner().hidden).toBe(false);
      expect(find('#week .moving p').textContent).toBe('Moving: Mon 7 Dec, 10:00–11:00 · Studio. Choose a free time.');
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(true);
    });

    it('a change started from the list is confirmed in the week: the call, the move over, the week loaded again, and the person stays in the week', async () => {
      await onList();
      rows()[0]!.click();
      fetchMock.mockResolvedValueOnce(json(200, laterWeek()));
      find('dialog.detail .change').click();
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      await weekDrawn();

      find('#week .slot').click();
      expect(find('#week dialog.book .old').textContent).toBe('Mon 7 Dec, 10:00–11:00');
      expect(find('#week dialog.book .what').textContent).toBe('Mon 7 Dec, 08:00–09:00 · Studio');
      expect(find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value).toBe('First lesson');
      const moved = { ...LATER, appointmentId: NEW_ID, start: '2026-12-07T07:00:00.000Z', end: '2026-12-07T08:00:00.000Z', replaces: ID };
      fetchMock.mockResolvedValueOnce(json(201, { cancelled: { ...LATER, status: 'cancelled', cancelReason: 'changed', replacedBy: NEW_ID }, booked: moved }));
      fetchMock.mockResolvedValueOnce(json(200, laterWeek([moved])));
      submit(find<HTMLFormElement>('#week dialog.book form'));

      await vi.waitFor(() => expect(find<HTMLDialogElement>('#week dialog.book').open).toBe(false));
      const [url, init] = calls()[3]!;
      expect([url, init.method]).toEqual([`http://api.test/calendar/appointments/${ID}/change`, 'POST']);
      expect(JSON.parse(String(init.body))).toEqual({ start: '2026-12-07T07:00:00.000Z', note: 'First lesson' });
      expect(banner().hidden).toBe(true);
      expect(apiCalls()[4]).toEqual([LATER_WEEK_URL, BEARER]);
      await vi.waitFor(() => expect(find('#week .appointment .time').textContent).toBe('08:00–09:00'));
      expect(window.location.hash).toBe('#/week');
      expect(apiCalls()).toHaveLength(5);
    });

    it('back to the list while the banner shows: the list is as usual, and the week, shown again, moves nothing', async () => {
      await onList();
      rows()[0]!.click();
      fetchMock.mockResolvedValueOnce(json(200, laterWeek()));
      find('dialog.detail .change').click();
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      await weekDrawn();
      expect(banner().hidden).toBe(false);

      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      links()[1]!.click();
      await listed();
      expect(window.location.hash).toBe('#/appointments');
      expect(banner().hidden).toBe(true);
      expect(find('#week .moving-what').textContent).toBe('');
      expect(days()).toHaveLength(0);
      rows()[0]!.click();
      expect(detail().open).toBe(true);
      expect(find<HTMLElement>('dialog.detail .change').hidden).toBe(false);
      detail().close();

      // The week again: the week it was left on, no banner, and its appointment can be clicked.
      fetchMock.mockResolvedValueOnce(json(200, laterWeek()));
      links()[0]!.click();
      await weekDrawn();
      expect(apiCalls().at(-1)).toEqual([LATER_WEEK_URL, BEARER]);
      expect(banner().hidden).toBe(true);
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(false);
      find('#week .appointment').click();
      expect(detail().open).toBe(true);
    });

    it('week, list, week, list: each screen is found where it was left, and nothing is left over or doubled', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      await weekDrawn();
      fetchMock.mockResolvedValueOnce(json(200, view('2026-11-23')));
      find('#week .next').click();
      await vi.waitFor(() => expect(find('#week .loading').hidden).toBe(true));

      // To the list: the week is left clean.
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      links()[1]!.click();
      await listed();
      expect([find('#week').hidden, find('#appointments').hidden]).toEqual([true, false]);
      expect(days()).toHaveLength(0);
      expect(find('#week .week-label').textContent).toBe('');
      expect(current()).toEqual([['Week', null], ['My appointments', 'page'], ['My details', null], ['Password', null]]);
      fetchMock.mockResolvedValueOnce(list([GONE, LATER]));
      find('#appointments .history').click();
      await listed(2);

      // To the week: the week it was on, and the list is left clean.
      fetchMock.mockResolvedValueOnce(json(200, view('2026-11-23')));
      links()[0]!.click();
      await vi.waitFor(() => expect(find('#week').hidden).toBe(false));
      expect(apiCalls().at(-1)).toEqual(['http://api.test/calendar?from=2026-11-23&to=2026-11-29', BEARER]);
      expect(find('#week .week-label').textContent).toBe('23 Nov – 29 Nov 2026');
      await weekDrawn();
      expect([find('#week').hidden, find('#appointments').hidden]).toEqual([false, true]);
      expect(rows()).toHaveLength(0);
      expect(pressed()).toEqual(['false', 'false']);
      expect(find<HTMLInputElement>('#appointments [name="from"]').value).toBe('');
      expect(document.querySelectorAll('#app .nav a')).toHaveLength(4);

      // To the list: the history again, over the period it was on, read after the settings.
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list([GONE, LATER]));
      links()[1]!.click();
      await listed(2);
      expect(pressed()).toEqual(['false', 'true']);
      expect(find<HTMLInputElement>('#appointments [name="from"]').value).toBe('2026-10-21');
      expect(find<HTMLInputElement>('#appointments [name="to"]').value).toBe('2026-11-19');
      expect(apiCalls().map(([address]) => address)).toEqual([
        WEEK_URL,
        'http://api.test/calendar?from=2026-11-23&to=2026-11-29',
        SETTINGS_URL,
        UPCOMING_URL,
        HISTORY_URL,
        'http://api.test/calendar?from=2026-11-23&to=2026-11-29',
        SETTINGS_URL,
        HISTORY_URL,
      ]);
      expect(days()).toHaveLength(0);
      expect(document.querySelectorAll('dialog[open]')).toHaveLength(0);
    });

    it('signing out on the list with the detail open leaves nothing; the Administrator, then the same User again, see nothing of it', async () => {
      at('#/appointments');
      const { store, signOut } = mounted();
      const before = html(); // the page at the login, before anyone signed in
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      store.set(ALICE);
      await listed();
      fetchMock.mockResolvedValueOnce(list([GONE, LATER]));
      find('#appointments .history').click();
      await listed(2);
      rows()[1]!.click();
      find<HTMLTextAreaElement>('dialog.detail [name="note"]').value = 'A private note';
      expect(detail().open).toBe(true);
      expect(html()).toContain('First lesson');

      signOut.click();
      expect(detail().open).toBe(false);
      expect(rows()).toHaveLength(0);
      expect(find('#appointments').hidden).toBe(true);
      const fields = [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held);
      expect(fields.every((value) => value === '')).toBe(true);
      for (const gone of ['alice', 'First lesson', 'A private note', 'Mon 7 Dec', 'Studio', 'Changed']) expect(html()).not.toContain(gone);
      expect(links()).toHaveLength(0);
      expect(html()).toBe(before);
      expect(window.location.hash).toBe('#/appointments'); // signing out leaves the address

      // The Administrator: the address is not theirs, the week is shown, and no list is asked.
      const asked = apiCalls().length;
      store.set(ADMIN);
      expect(window.location.hash).toBe('#/week');
      expect(rows()).toHaveLength(0);
      expect(apiCalls().slice(asked)).toEqual([[WEEK_URL, 'Bearer access-token-admin']]);
      for (const gone of ['alice', 'First lesson', 'A private note']) expect(html()).not.toContain(gone);
      signOut.click();

      // The same User again: new objects, so the list opens on "upcoming", after the settings.
      at('#/appointments');
      fetchMock.mockResolvedValueOnce(settings());
      fetchMock.mockResolvedValueOnce(list());
      store.set(ALICE);
      expect(pressed()).toEqual(['true', 'false']);
      await listed();
      expect(apiCalls().slice(asked + 1).map(([address]) => address)).toEqual([SETTINGS_URL, UPCOMING_URL]);
      expect(find<HTMLElement>('#appointments .period').hidden).toBe(true);
      rows()[0]!.click();
      expect(find<HTMLTextAreaElement>('dialog.detail [name="note"]').value).toBe('First lesson');
    });

    it('a hand-over that is never taken ends with the session: the next person\'s week moves nothing', async () => {
      const { store, signOut } = await onList();
      rows()[0]!.click();
      find('dialog.detail .change').click();
      signOut.click(); // before the change of address is followed
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));

      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      store.set(ALICE);
      await weekDrawn();
      expect(apiCalls().at(-1)).toEqual([WEEK_URL, BEARER]);
      expect(banner().hidden).toBe(true);
      expect(find<HTMLButtonElement>('#week .appointment').disabled).toBe(false);
    });
  });
  // The settings, the Administrator's second screen (docs/FRONTEND_ARCHITECTURE.md section 6):
  // its address, for the Administrator only; the read, the save and the read that follows, with
  // the real service of the session behind the stubbed fetch; and nothing of it left behind.
  describe('the settings, the Administrator\'s second screen', () => {
    const SETTINGS_URL = 'http://api.test/calendar/settings';
    const BEARER = 'Bearer access-token-admin';
    const stored = (over: object = {}) => ({
      timeZone: 'Europe/Rome',
      cancellationNoticeHours: 24,
      minBookingNoticeHours: 0,
      bookingHorizonDays: 56,
      maxFutureAppointmentsPerUser: null,
      updatedAt: '2026-11-19T15:44:09.338Z',
      updatedBy: { username: 'carol', role: 'admin' },
      ...over,
    });
    const MAIL_SETTINGS_URL = 'http://api.test/mail/settings';
    // The requests of the calendar's settings and the screens around them: the daily e-mail's
    // part reads its own settings beside them, said in its own tests.
    const ofMail = (url: string) => url === MAIL_SETTINGS_URL;
    const calls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl) && !ofMail(url));
    const settingsCalls = () => apiCalls().filter(([url]) => !ofMail(url!));
    const at = (hash: string) => window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    const field = (name: string) => find<HTMLInputElement>(`#settings [name="${name}"]`);
    const form = () => find<HTMLFormElement>('#settings form.settings');
    const shown = () => vi.waitFor(() => expect(form().hidden).toBe(false));
    const current = () => links().map((a) => [a.textContent, a.getAttribute('aria-current')]);
    // The Administrator on the settings' address, with the settings read.
    const onSettings = async (answer: object = stored()) => {
      at('#/settings');
      fetchMock.mockResolvedValueOnce(json(200, answer));
      const made = mounted(ADMIN);
      await shown();
      return made;
    };

    it('the Administrator on #/settings: the address stays, its link is the one marked, the two requests are the settings and the daily e-mail\'s with the person\'s token, and the form holds them', async () => {
      at('#/settings');
      fetchMock.mockResolvedValueOnce(json(200, stored()));
      mounted(ADMIN);
      expect(window.location.hash).toBe('#/settings');
      expect(current()).toEqual([['Week', null], ['Settings', 'page'], ['Users', null], ['Availability', null], ['My details', null], ['Password', null]]);
      expect([find('#week').hidden, find('#appointments').hidden, find('#settings').hidden]).toEqual([true, true, false]);
      // Mounted first, then started: the view was listening when the read began.
      expect(find('#settings .loading').hidden).toBe(false);
      expect(form().hidden).toBe(true);

      await shown();
      expect(apiCalls()).toEqual([[SETTINGS_URL, BEARER], [MAIL_SETTINGS_URL, BEARER]]);
      expect(calls()[0]![1].method).toBe('GET');
      expect(['cancellationNoticeHours', 'minBookingNoticeHours', 'bookingHorizonDays', 'maxFutureAppointmentsPerUser'].map((name) => field(name).value)).toEqual(['24', '0', '56', '']);
      expect([field('noLimit').checked, field('maxFutureAppointmentsPerUser').disabled]).toEqual([true, true]);
      expect(find('#settings .zone-name').textContent).toBe('Europe/Rome');
      expect(find('#settings .last-saved').textContent).toBe('Last saved by carol on Thu 19 Nov, 16:44');
      expect(find('#settings .loading').hidden).toBe(true);
      for (const token of TOKENS) expect(html()).not.toContain(token);
    });

    it('#/settings typed by a User shows the week, the address is put right, and the settings are not asked for', async () => {
      at('#/settings');
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      expect(window.location.hash).toBe('#/week');
      expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments', 'My details', 'Password']);
      expect([find('#week').hidden, find('#settings').hidden]).toEqual([false, true]);
      await weekDrawn();
      window.location.hash = '#/settings';
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      expect(find('#settings').hidden).toBe(true);
      expect(apiCalls()).toEqual([[WEEK_URL, 'Bearer access-token-alice']]);
    });

    it('a failed read is said in the place of the form; "Try again" reads again', async () => {
      at('#/settings');
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      mounted(ADMIN);
      await vi.waitFor(() => expect(find('#settings .unread').hidden).toBe(false));
      expect(find('#settings .unread .error').textContent).toBe('The server cannot be reached. Check the connection and try again.');
      expect(form().hidden).toBe(true);
      expect(html()).not.toContain('Failed to fetch');

      fetchMock.mockResolvedValueOnce(json(200, stored()));
      find('#settings .retry').click();
      await shown();
      expect(find('#settings .unread').hidden).toBe(true);
      expect(settingsCalls().map(([address]) => address)).toEqual([SETTINGS_URL, SETTINGS_URL]);
    });

    it('a save: the PUT with the four values, "Settings saved.", the form filled with the answer, and the settings read again', async () => {
      await onSettings();
      field('cancellationNoticeHours').value = ' 48 ';
      field('noLimit').click();
      field('maxFutureAppointmentsPerUser').value = '5';
      const saved = stored({ cancellationNoticeHours: 48, maxFutureAppointmentsPerUser: 5, updatedAt: '2026-11-19T16:00:00.000Z', updatedBy: { username: 'admin', role: 'admin' } });
      fetchMock.mockResolvedValueOnce(json(200, saved));
      fetchMock.mockResolvedValueOnce(json(200, saved));
      submit(form());
      expect(find<HTMLButtonElement>('#settings .submit').disabled).toBe(true);

      await vi.waitFor(() => expect(find('#settings .saved').hidden).toBe(false));
      const [url, init] = calls()[1]!;
      expect([url, init.method, (init.headers as Record<string, string>).Authorization]).toEqual([SETTINGS_URL, 'PUT', BEARER]);
      expect(JSON.parse(String(init.body))).toEqual({ cancellationNoticeHours: 48, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 5 });
      expect(field('cancellationNoticeHours').value).toBe('48');
      expect(find<HTMLButtonElement>('#settings .submit').disabled).toBe(false);
      await vi.waitFor(() => expect(settingsCalls()).toHaveLength(3));
      expect([calls()[2]![0], calls()[2]![1].method]).toEqual([SETTINGS_URL, 'GET']);
      expect(find('#settings .last-saved').textContent).toBe('Last saved by admin on Thu 19 Nov, 17:00');

      // An edit takes the sentence away.
      field('bookingHorizonDays').value = '30';
      field('bookingHorizonDays').dispatchEvent(new Event('input', { bubbles: true }));
      expect(find('#settings .saved').hidden).toBe(true);
    });

    it('"No limit" ticked sends null', async () => {
      await onSettings(stored({ maxFutureAppointmentsPerUser: 5 }));
      expect([field('noLimit').checked, field('maxFutureAppointmentsPerUser').value]).toEqual([false, '5']);
      field('noLimit').click();
      fetchMock.mockResolvedValueOnce(json(200, stored()));
      submit(form());
      await vi.waitFor(() => expect(find('#settings .saved').hidden).toBe(false));
      expect(JSON.parse(String(calls()[1]![1].body)).maxFutureAppointmentsPerUser).toBeNull();
    });

    it('a value out of range is refused under its field, with no request sent', async () => {
      await onSettings();
      field('bookingHorizonDays').value = '366';
      field('minBookingNoticeHours').value = '';
      submit(form());
      const refusal = (name: string) => field(name).closest('.field')!.querySelector('.refusal')!.textContent;
      expect(refusal('bookingHorizonDays')).toBe('Booking horizon must be a whole number from 1 to 365.');
      expect(refusal('minBookingNoticeHours')).toBe('Minimum booking notice must be a whole number from 0 to 720.');
      expect(field('bookingHorizonDays').getAttribute('aria-invalid')).toBe('true');
      expect(settingsCalls()).toHaveLength(1);
      expect(find<HTMLButtonElement>('#settings .submit').disabled).toBe(false);
      expect(find('#settings .saved').hidden).toBe(true);
    });

    it('a save the server refuses: the sentence, the settings read again, and the typed values still in the form after that read', async () => {
      await onSettings();
      field('bookingHorizonDays').value = '30';
      fetchMock.mockResolvedValueOnce(json(409, { error: 'concurrent_update', message: 'the lock was held' }));
      fetchMock.mockResolvedValueOnce(json(200, stored({ updatedAt: '2026-11-19T16:30:00.000Z', updatedBy: { username: 'dave', role: 'admin' } })));
      submit(form());
      await vi.waitFor(() => expect(find('#settings .failure').textContent).toBe('The calendar was being changed at the same moment. Please try again.'));
      await vi.waitFor(() => expect(find('#settings .last-saved').textContent).toBe('Last saved by dave on Thu 19 Nov, 17:30'));
      expect(settingsCalls()).toHaveLength(3);
      expect(field('bookingHorizonDays').value).toBe('30');
      expect(find('#settings .saved').hidden).toBe(true);
      expect(html()).not.toContain('lock was held');

      // The next try goes, and succeeds.
      fetchMock.mockResolvedValueOnce(json(200, stored({ bookingHorizonDays: 30 })));
      submit(form());
      await vi.waitFor(() => expect(find('#settings .saved').hidden).toBe(false));
      expect(find('#settings .failure').textContent).toBe('');
    });

    it('week, settings, week, settings: nothing left over or doubled, the week where it was left, and values typed and not saved are gone', async () => {
      fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
      mounted(ADMIN);
      await weekDrawn();
      fetchMock.mockResolvedValueOnce(json(200, view('2026-11-23')));
      find('#week .next').click();
      await vi.waitFor(() => expect(find('#week .loading').hidden).toBe(true));

      fetchMock.mockResolvedValueOnce(json(200, stored()));
      links()[1]!.click();
      await shown();
      expect([find('#week').hidden, find('#settings').hidden]).toEqual([true, false]);
      expect(days()).toHaveLength(0);
      expect(current()).toEqual([['Week', null], ['Settings', 'page'], ['Users', null], ['Availability', null], ['My details', null], ['Password', null]]);
      field('bookingHorizonDays').value = '30';
      field('noLimit').click();
      field('minBookingNoticeHours').value = '';
      submit(form()); // a refusal on show

      fetchMock.mockResolvedValueOnce(json(200, view('2026-11-23')));
      links()[0]!.click();
      await vi.waitFor(() => expect(find('#week').hidden).toBe(false));
      await weekDrawn();
      expect(find('#week .week-label').textContent).toBe('23 Nov – 29 Nov 2026');
      expect([find('#settings').hidden, form().hidden, field('bookingHorizonDays').value, field('noLimit').checked]).toEqual([true, true, '', false]);
      expect(find('#settings').textContent).not.toContain('carol');
      expect(find('#settings').textContent).not.toContain('must be');

      fetchMock.mockResolvedValueOnce(json(200, stored()));
      links()[1]!.click();
      await shown();
      expect([field('bookingHorizonDays').value, field('minBookingNoticeHours').value, field('noLimit').checked]).toEqual(['56', '0', true]);
      expect(document.querySelectorAll('#settings [aria-invalid]')).toHaveLength(0);
      expect(settingsCalls().map(([address]) => address)).toEqual([
        WEEK_URL,
        'http://api.test/calendar?from=2026-11-23&to=2026-11-29',
        SETTINGS_URL,
        'http://api.test/calendar?from=2026-11-23&to=2026-11-29',
        SETTINGS_URL,
      ]);
      expect(days()).toHaveLength(0);
      expect(document.querySelectorAll('#app .nav a')).toHaveLength(6);
    });

    it('signing out on the settings with values typed and a refusal on show leaves nothing; a User then sees nothing of it, and "My appointments" still reads the settings, then the list', async () => {
      at('#/settings');
      const { store, signOut } = mounted();
      const before = html(); // the page at the login, before anyone signed in
      fetchMock.mockResolvedValueOnce(json(200, stored({ maxFutureAppointmentsPerUser: 7 })));
      store.set(ADMIN);
      await shown();
      field('cancellationNoticeHours').value = '999';
      field('bookingHorizonDays').value = '31';
      field('noLimit').click();
      submit(form());
      expect(html()).toContain('Cancellation notice must be');
      expect(html()).toContain('carol');

      signOut.click();
      const fields = [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held);
      expect(fields.every((value) => value === '')).toBe(true);
      for (const gone of ['carol', 'Europe/Rome', 'must be', 'from 0 to 720', 'aria-invalid']) expect(html()).not.toContain(gone);
      expect(html()).toBe(before);
      expect(window.location.hash).toBe('#/settings'); // signing out leaves the address

      // A User: the address is not theirs. Their list reads the settings, then the list.
      const asked = settingsCalls().length;
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      store.set(ALICE);
      expect(window.location.hash).toBe('#/week');
      await weekDrawn();
      fetchMock.mockResolvedValueOnce(json(200, stored()));
      fetchMock.mockResolvedValueOnce(json(200, { appointments: [] }));
      links()[1]!.click();
      await vi.waitFor(() => expect(find('#appointments .empty').hidden).toBe(false));
      expect(settingsCalls().slice(asked)).toEqual([
        [WEEK_URL, 'Bearer access-token-alice'],
        [SETTINGS_URL, 'Bearer access-token-alice'],
        ['http://api.test/calendar/appointments?upcoming=true&status=booked', 'Bearer access-token-alice'],
      ]);
      expect([find('#settings').hidden, form().hidden]).toEqual([true, true]);
      expect(html()).not.toContain('carol');
    });
    // The daily e-mail, a part of the settings with a service of its own
    // (docs/EMAIL_ARCHITECTURE.md section 11): read beside the calendar's settings, after them,
    // and saved apart; "not available yet" in a stack where e-mail is not on; a failure of either
    // read hides nothing of the other.
    const daily = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#settings .daily-mail ${selector}`);
    // Answers each request by its address: the calendar's settings and the daily e-mail's.
    const answerBoth = (calendar: () => Response, mail: () => Response) =>
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        if (url === SETTINGS_URL) return calendar();
        if (url === MAIL_SETTINGS_URL) return init.method === 'PUT' ? json(200, JSON.parse(String(init.body))) : mail();
        return unanswered();
      });

    it('the daily e-mail: its two fields filled from GET /mail/settings, the hour as 07:00 with the calendar\'s time zone; a save is a PUT of both, "Daily e-mail saved.", read again', async () => {
      answerBoth(() => json(200, stored()), () => json(200, { dailyEnabled: true, dailyHour: 7 }));
      at('#/settings');
      mounted(ADMIN);
      await vi.waitFor(() => expect(daily('form').hidden).toBe(false));
      await shown();
      expect([daily<HTMLInputElement>('[name="dailyEnabled"]').checked, daily<HTMLInputElement>('[name="dailyHour"]').value]).toEqual([true, '07:00']);
      expect(daily('.range').textContent).toBe("A whole hour, from 00:00 to 23:00, in the calendar's time zone, Europe/Rome.");

      daily<HTMLInputElement>('[name="dailyEnabled"]').click();
      daily<HTMLInputElement>('[name="dailyHour"]').value = '18';
      submit(daily<HTMLFormElement>('form'));
      await vi.waitFor(() => expect(daily('.saved').hidden).toBe(false));
      const put = calls().length; // the calendar's requests only
      const mail = (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => ofMail(url));
      expect(mail.map(([, init]) => [init.method, (init.headers as Record<string, string>).Authorization])).toEqual([
        ['GET', BEARER],
        ['PUT', BEARER],
        ['GET', BEARER],
      ]);
      expect(JSON.parse(String(mail[1]![1].body))).toEqual({ dailyEnabled: false, dailyHour: 18 });
      expect(daily<HTMLInputElement>('[name="dailyHour"]').value).toBe('18:00');
      expect(put).toBe(1); // the calendar's settings were not saved
    });

    it('the daily e-mail: an hour that is not a whole hour is refused under it, with no request sent', async () => {
      answerBoth(() => json(200, stored()), () => json(200, { dailyEnabled: true, dailyHour: 7 }));
      at('#/settings');
      mounted(ADMIN);
      await vi.waitFor(() => expect(daily('form').hidden).toBe(false));
      daily<HTMLInputElement>('[name="dailyHour"]').value = '7:30';
      submit(daily<HTMLFormElement>('form'));
      expect(daily('.refusal').textContent).toBe('The hour must be a whole hour from 00:00 to 23:00, such as 07:00.');
      expect(daily('[name="dailyHour"]').getAttribute('aria-invalid')).toBe('true');
      expect((fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => ofMail(url))).toHaveLength(1);
    });

    it('503 mail_unavailable: the daily e-mail says "E-mail is not available yet" in place of its fields, and the calendar\'s settings are there', async () => {
      answerBoth(() => json(200, stored()), () => json(503, { error: 'mail_unavailable', message: 'E-mail is not available yet' }));
      at('#/settings');
      mounted(ADMIN);
      await shown();
      await vi.waitFor(() => expect(daily('.unavailable').hidden).toBe(false));
      expect(daily('.unavailable').textContent).toBe('E-mail is not available yet.');
      expect([daily('form').hidden, daily('.unread').hidden, daily('.loading').hidden]).toEqual([true, true, true]);
    });

    it('a failed read of the calendar\'s settings hides nothing of the daily e-mail, said without a time zone', async () => {
      answerBoth(() => json(500, { error: 'internal_error', message: 'x' }), () => json(200, { dailyEnabled: false, dailyHour: 6 }));
      at('#/settings');
      mounted(ADMIN);
      await vi.waitFor(() => expect(find('#settings .unread').hidden).toBe(false));
      await vi.waitFor(() => expect(daily('form').hidden).toBe(false));
      expect(form().hidden).toBe(true);
      expect(daily<HTMLInputElement>('[name="dailyHour"]').value).toBe('06:00');
      expect(daily('.range').textContent).toBe("A whole hour, from 00:00 to 23:00, in the calendar's time zone.");
    });
  });

  // The users, the Administrator's third screen (docs/FRONTEND_ARCHITECTURE.md section 6), with
  // the real UsersService of the session behind the stubbed fetch: the same one the week's book
  // dialog asks for its list. The passwords here are made up for the stub's answers.
  describe('the users, the Administrator\'s third screen', () => {
    const USERS_URL = 'http://api.test/users';
    const BEARER = 'Bearer access-token-admin';
    const PASSWORD = 'Xk3-made.up_Pass!7';
    const usersOf = (...usernames: string[]) => json(200, { users: usernames.map((username) => summary(username)) });
    const calls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl));
    const sent = () => calls().map(([url, init]) => `${init.method} ${url.slice(CONFIG.apiUrl.length)}`);
    const at = (hash: string) => window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    const names = () => [...document.querySelectorAll('#users .list .username')].map((name) => name.textContent);
    const listed = (...usernames: string[]) => vi.waitFor(() => expect(names()).toEqual(usernames));
    const field = () => find<HTMLInputElement>('#users [name="username"]');
    const form = () => find<HTMLFormElement>('#users form.create');
    const created = () => find<HTMLDialogElement>('#users dialog.created');
    const remove = () => find<HTMLDialogElement>('#users dialog.delete');
    const current = () => links().map((a) => [a.textContent, a.getAttribute('aria-current')]);
    const fields = () => [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held);
    // Whether a text is in the page's source, in a field or in the address.
    const anywhere = (text: string) => html().includes(text) || fields().some((value) => value.includes(text)) || window.location.href.includes(text);
    // The Administrator on the users' address, with the list read.
    const onUsers = async (...usernames: string[]) => {
      at('#/users');
      fetchMock.mockResolvedValueOnce(usersOf(...usernames));
      const made = mounted(ADMIN);
      await listed(...usernames);
      return made;
    };
    // Types a username and four good facts into the create form.
    function typeIn(username: string) {
      field().value = username;
      const facts = summary(username.trim());
      for (const name of ['givenName', 'familyName', 'email', 'address'] as const) find<HTMLInputElement>(`#users form.create [name="${name}"]`).value = facts[name];
    }
    // Types a name and presses "Create user"; the server creates it and then lists `after`.
    const create = async (username: string, after: string[], password = PASSWORD) => {
      fetchMock.mockResolvedValueOnce(json(201, { username, password }));
      fetchMock.mockResolvedValueOnce(usersOf(...after));
      typeIn(username);
      submit(form());
      await vi.waitFor(() => expect(created().open).toBe(true));
      await listed(...after);
    };
    const becomesVisible = () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    afterEach(() => {
      // Back to the emulated document's own property.
      delete (document as { visibilityState?: string }).visibilityState;
    });

    it('the Administrator on #/users: the address stays, its link is the one marked, the one request is the list with the person\'s token, and the rows are the users', async () => {
      at('#/users');
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'bob'));
      mounted(ADMIN);
      expect(window.location.hash).toBe('#/users');
      expect(current()).toEqual([['Week', null], ['Settings', null], ['Users', 'page'], ['Availability', null], ['My details', null], ['Password', null]]);
      expect([find('#week').hidden, find('#appointments').hidden, find('#settings').hidden, find('#users').hidden]).toEqual([true, true, true, false]);
      // Mounted first, then started: the view was listening when the read began.
      expect(find('#users .loading').hidden).toBe(false);

      await listed('alice', 'bob');
      expect(apiCalls()).toEqual([[USERS_URL, BEARER]]);
      expect(sent()).toEqual(['GET /users']);
      expect(find('#users .loading').hidden).toBe(true);
      expect(find('#users .field .hint').textContent).toMatch(/^A username has 3 to 32 characters/);
      for (const token of TOKENS) expect(html()).not.toContain(token);
    });

    it('#/users typed by a User shows the week, the address is put right, and the users are not asked for', async () => {
      at('#/users');
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      expect(window.location.hash).toBe('#/week');
      expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments', 'My details', 'Password']);
      expect([find('#week').hidden, find('#users').hidden]).toEqual([false, true]);
      await weekDrawn();
      window.location.hash = '#/users';
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      expect(find('#users').hidden).toBe(true);
      expect(apiCalls()).toEqual([[WEEK_URL, 'Bearer access-token-alice']]);
    });

    it('a failed read is said in the place of the list; "Try again" reads again', async () => {
      at('#/users');
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      mounted(ADMIN);
      await vi.waitFor(() => expect(find('#users .unread').hidden).toBe(false));
      expect(find('#users .unread .error').textContent).toBe('The server cannot be reached. Check the connection and try again.');
      expect(html()).not.toContain('Failed to fetch');

      fetchMock.mockResolvedValueOnce(usersOf('alice'));
      find('#users .retry').click();
      await listed('alice');
      expect(find('#users .unread').hidden).toBe(true);
      expect(sent()).toEqual(['GET /users', 'GET /users']);
    });

    it('a create: the POST with the username, the password shown once in its dialog, the field emptied, and the list read again', async () => {
      await onUsers('alice');
      fetchMock.mockResolvedValueOnce(json(201, { username: 'carol', password: PASSWORD }));
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'carol'));
      typeIn(' carol ');
      submit(form());
      expect(find<HTMLButtonElement>('#users .submit').disabled).toBe(true);

      await vi.waitFor(() => expect(created().open).toBe(true));
      const [url, init] = calls()[1]!;
      expect([url, init.method, (init.headers as Record<string, string>).Authorization]).toEqual([USERS_URL, 'POST', BEARER]);
      const carol = summary('carol');
      expect(JSON.parse(String(init.body))).toEqual({ username: 'carol', givenName: carol.givenName, familyName: carol.familyName, email: carol.email, address: carol.address });
      expect([find('#users dialog.created .username').textContent, find('#users dialog.created .password').textContent]).toEqual(['carol', PASSWORD]);
      await listed('alice', 'carol');
      expect(sent()).toEqual(['GET /users', 'POST /users', 'GET /users']);
      expect([field().value, find<HTMLButtonElement>('#users .submit').disabled]).toEqual(['', false]);
      // The password is in the dialog and nowhere else; the address never held it.
      expect(html().split(PASSWORD)).toHaveLength(2);
      expect(fields().some((value) => value.includes(PASSWORD))).toBe(false);
      expect(calls().some(([address]) => address.includes(PASSWORD))).toBe(false);

      find('#users dialog.created .understood').click();
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      expect(names()).toEqual(['alice', 'carol']);
    });

    it('a text that is not a username is refused under the field, with no request sent', async () => {
      await onUsers('alice');
      for (const text of ['Bob', 'ab', '', 'alice smith']) {
        field().value = text;
        submit(form());
        expect(find('#users .field .refusal').textContent, text).toMatch(/^A username has 3 to 32 characters/);
        expect(field().getAttribute('aria-invalid'), text).toBe('true');
        expect(field().value, text).toBe(text);
      }
      expect(sent()).toEqual(['GET /users']);
      expect(find<HTMLButtonElement>('#users .submit').disabled).toBe(false);
      expect(created().open).toBe(false);
    });

    it('a username that exists: the server\'s refusal in plain words, the field not marked, what was typed kept, and the list read again', async () => {
      await onUsers('alice');
      fetchMock.mockResolvedValueOnce(json(409, { error: 'user_exists', message: 'User account already exists' }));
      fetchMock.mockResolvedValueOnce(usersOf('alice'));
      typeIn('alice');
      submit(form());
      await vi.waitFor(() => expect(find('#users form.create .failure').textContent).toBe('A user with this username exists already. Choose another username.'));
      await vi.waitFor(() => expect(sent()).toEqual(['GET /users', 'POST /users', 'GET /users']));
      expect([field().value, field().hasAttribute('aria-invalid'), created().open]).toEqual(['alice', false, false]);
      expect(html()).not.toContain('already exists');

      // The next try, with another name, goes.
      await create('carol', ['alice', 'carol']);
      expect(find('#users form.create .failure').textContent).toBe('');
    });

    it('a delete: the dialog names the user, "Keep" asks nothing, "Delete user" sends the DELETE, the dialog closes and the list is read again', async () => {
      await onUsers('alice', 'bob');
      find('#users .list li:nth-child(2) .ask-delete').click();
      expect(remove().open).toBe(true);
      expect(find('#users dialog.delete .question').textContent).toBe('Delete bob? Their future appointments will be cancelled. This cannot be undone.');
      find('#users dialog.delete .keep').click();
      expect(remove().open).toBe(false);
      expect(sent()).toEqual(['GET /users']);

      find('#users .list li:nth-child(2) .ask-delete').click();
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      fetchMock.mockResolvedValueOnce(usersOf('alice'));
      find('#users dialog.delete .submit').click();
      expect(find<HTMLButtonElement>('#users dialog.delete .submit').disabled).toBe(true);
      await vi.waitFor(() => expect(remove().open).toBe(false));
      await listed('alice');
      expect(sent()).toEqual(['GET /users', 'DELETE /users/bob', 'GET /users']);
      expect((calls()[1]![1].headers as Record<string, string>).Authorization).toBe(BEARER);
    });

    it('a delete the server refuses: the sentence in the dialog, still open, the list read again all the same, and "Delete user" works again', async () => {
      await onUsers('alice', 'bob');
      find('#users .list li:nth-child(2) .ask-delete').click();
      fetchMock.mockResolvedValueOnce(json(409, { error: 'concurrent_update', message: 'the lock was held' }));
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'bob'));
      find('#users dialog.delete .submit').click();
      await vi.waitFor(() => expect(find('#users dialog.delete .error').textContent).toBe('The calendar was being changed at the same moment. Please try again.'));
      await vi.waitFor(() => expect(sent()).toEqual(['GET /users', 'DELETE /users/bob', 'GET /users']));
      await vi.waitFor(() => expect(find('#users .loading').hidden).toBe(true));
      expect([remove().open, find<HTMLButtonElement>('#users dialog.delete .submit').disabled]).toEqual([true, false]);
      expect(html()).not.toContain('lock was held');

      // The user was gone already: the server says so, and the list that follows shows it.
      fetchMock.mockResolvedValueOnce(json(404, { error: 'user_not_found' }));
      fetchMock.mockResolvedValueOnce(usersOf('alice'));
      find('#users dialog.delete .submit').click();
      await vi.waitFor(() => expect(find('#users dialog.delete .error').textContent).toBe('This user no longer exists.'));
      await listed('alice');
      expect(remove().open).toBe(true);
    });

    it('with the password dialog open, the tab shown again reads the list again and leaves the dialog and its password as they are', async () => {
      await onUsers('alice');
      await create('carol', ['alice', 'carol']);
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'carol', 'dave'));
      becomesVisible();
      await listed('alice', 'carol', 'dave');
      expect(sent()).toEqual(['GET /users', 'POST /users', 'GET /users', 'GET /users']);
      expect([created().open, find('#users dialog.created .password').textContent]).toEqual([true, PASSWORD]);
    });

    it('users, week, users: nothing left over or doubled, the password dialog not opened again, and the book dialog\'s list asked for at its opening, with the user just created', async () => {
      await onUsers('alice');
      await create('carol', ['alice', 'carol']);
      find('#users dialog.created .understood').click();

      // The week: the users screen is left and emptied.
      fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
      links()[0]!.click();
      await weekDrawn();
      expect([find('#users').hidden, names(), field().value]).toEqual([true, [], '']);
      expect(anywhere(PASSWORD)).toBe(false);
      expect(anywhere('carol')).toBe(false);

      // The book dialog asks for its list itself, as before, and holds the new user.
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'carol'));
      find('#week .slot').click();
      const picker = find<HTMLSelectElement>('#week dialog.book [name="username"]');
      await vi.waitFor(() => expect([...picker.options].map((option) => option.value)).toEqual(['alice', 'carol']));
      find<HTMLDialogElement>('#week dialog.book').close();

      // Back: the list is read again, not taken from what the book dialog was answered, and
      // the create of the first visit, which the session's service still holds, opens nothing.
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'carol', 'dave'));
      links()[2]!.click();
      await listed('alice', 'carol', 'dave');
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
      expect(sent()).toEqual(['GET /users', 'POST /users', 'GET /users', 'GET /calendar?from=2026-11-16&to=2026-11-22', 'GET /users', 'GET /users']);
      expect(document.querySelectorAll('#app .nav a')).toHaveLength(6);
      expect(days()).toHaveLength(0);

      // A new create on this visit shows its own password.
      await create('erin', ['alice', 'carol', 'dave', 'erin'], 'Zq9-other.one_Pass?2');
      expect(find('#users dialog.created .password').textContent).toBe('Zq9-other.one_Pass?2');
      expect(anywhere(PASSWORD)).toBe(false);
    });

    it('signing out with the password dialog open leaves the password nowhere in the document; the next person sees nothing of the first, and the same Administrator again is not shown it', async () => {
      at('#/users');
      const { store, signOut } = mounted();
      const before = html(); // the page at the login, before anyone signed in
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'bob'));
      store.set(ADMIN);
      await listed('alice', 'bob');
      await create('carol', ['alice', 'bob', 'carol']);
      field().value = 'dave';
      find('#users .list li:nth-child(2) .ask-delete').click(); // the emulated page lets a click through a modal dialog
      expect([created().open, remove().open]).toEqual([true, true]);
      expect(anywhere(PASSWORD)).toBe(true);

      signOut.click();
      expect([created().open, remove().open]).toEqual([false, false]);
      for (const gone of [PASSWORD, 'carol', 'bob', 'dave', 'alice', 'A username has', 'Delete bob']) expect(anywhere(gone), gone).toBe(false);
      expect(fields().every((value) => value === '')).toBe(true);
      expect(html()).toBe(before);
      expect(window.location.hash).toBe('#/users'); // signing out leaves the address

      // A User: the address is not theirs, and nothing of the users is asked or shown.
      const asked = apiCalls().length;
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      store.set(ALICE);
      expect(window.location.hash).toBe('#/week');
      await weekDrawn();
      expect(apiCalls().slice(asked)).toEqual([[WEEK_URL, 'Bearer access-token-alice']]);
      expect([find('#users').hidden, names()]).toEqual([true, []]);
      for (const gone of [PASSWORD, 'carol', 'bob']) expect(anywhere(gone), gone).toBe(false);

      // The same Administrator again: a session of its own, whose service never created anyone.
      signOut.click();
      at('#/users');
      fetchMock.mockResolvedValueOnce(usersOf('alice', 'bob', 'carol'));
      store.set(ADMIN);
      await listed('alice', 'bob', 'carol');
      expect(created().open).toBe(false);
      expect(anywhere(PASSWORD)).toBe(false);
    });
  });
  // The availability, the first screen that uses two services at once, and a third for the
  // calendar's time zone: the real services of the session behind the stubbed fetch.
  describe('the availability, the Administrator\'s fourth screen', () => {
    const BEARER = 'Bearer access-token-admin';
    const STAMPS = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
    const POOL = '01M6DMMJZ04FZ6M1H8QJ0C3BNA';
    const SALA = '01M6DN5A1A0000000000000000';
    const P1 = '01M6PATTERN000000000000001';
    const P2 = '01M6PATTERN000000000000002';
    const type = (typeId: string, name: string) => ({ typeId, name, capacity: 1, ...STAMPS });
    const pattern = (patternId: string, over: object = {}) => ({ patternId, weekday: 1, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null, ...STAMPS, ...over });
    const TYPES = [type(POOL, 'Piscina'), type(STUDIO, 'Studio')];
    const PATTERNS = [pattern(P1), pattern(P2, { weekday: 2, start: '15:00', end: '18:00', typeId: POOL })];
    const settings = (timeZone = 'Europe/Rome') => json(200, { timeZone, cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: null, updatedBy: null });
    const typesOf = (list: object[] = TYPES) => json(200, { types: list });
    const patternsOf = (list: object[] = PATTERNS) => json(200, { patterns: list });
    const calls = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl));
    const sent = () => calls().map(([url, init]) => `${init.method} ${url.slice(CONFIG.apiUrl.length)}`);
    const READS = ['GET /calendar/settings', 'GET /calendar/types', 'GET /calendar/patterns'];
    const bodyOf = (index: number) => JSON.parse(String(calls()[index]![1].body)) as unknown;
    const at = (hash: string) => window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#availability ${selector}`);
    const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...document.querySelectorAll<T>(`#availability ${selector}`)];
    // How many rows and choices the script has put in the screen.
    const drawn = () => find('#availability').querySelectorAll('li, option, .groups section').length;
    const typeNames = () => all('.types .list .name').map((name) => name.textContent);
    const rows = () => all('.patterns .groups section').map((section) => `${section.querySelector('h4')!.textContent}: ${[...section.querySelectorAll('li')].map((item) => `${item.querySelector('.time')!.textContent} ${item.querySelector('.type-name')!.textContent}`).join(', ')}`);
    const typesListed = (...names: string[]) => vi.waitFor(() => expect(typeNames()).toEqual(names));
    const patternsListed = (...texts: string[]) => vi.waitFor(() => expect(rows()).toEqual(texts));
    const quiet = () => vi.waitFor(() => expect(one('.loading').hidden).toBe(true));
    const field = (formOf: string, name: string) => one<HTMLInputElement | HTMLSelectElement>(`${formOf} [name="${name}"]`);
    const set = (formOf: string, values: Record<string, string>) => {
      for (const [name, value] of Object.entries(values)) field(formOf, name).value = value;
    };
    const dialog = (name: 'rename' | 'change' | 'delete') => one<HTMLDialogElement>(`dialog.${name}`);
    const current = () => links().map((a) => [a.textContent, a.getAttribute('aria-current')]);
    const fields = () => [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map(held);
    const anywhere = (text: string) => html().includes(text) || fields().some((value) => value.includes(text));
    const MONDAY = 'Monday: 09:00 – 13:00 Studio';
    const TUESDAY = 'Tuesday: 15:00 – 18:00 Piscina';
    // The Administrator on the availability's address, with its three reads answered.
    const onAvailability = async () => {
      at('#/availability');
      fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
      const made = mounted(ADMIN);
      await patternsListed(MONDAY, TUESDAY);
      await quiet();
      return made;
    };
    const conflict = { error: 'availability_conflict', message: '1 appointment would fall outside the availability', conflicts: [{ appointmentId: '01M6APPT000000000000000001', username: 'alice', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' }] };
    const becomesVisible = () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    afterEach(() => {
      // Back to the emulated document's own property.
      delete (document as { visibilityState?: string }).visibilityState;
    });

    it('the Administrator on #/availability: the address stays, its link is the one marked, the three requests carry the person\'s token, and the two lists are drawn', async () => {
      at('#/availability');
      fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
      mounted(ADMIN);
      expect(window.location.hash).toBe('#/availability');
      expect(current()).toEqual([['Week', null], ['Settings', null], ['Users', null], ['Availability', 'page'], ['My details', null], ['Password', null]]);
      expect([find('#week').hidden, find('#appointments').hidden, find('#settings').hidden, find('#users').hidden, find('#availability').hidden]).toEqual([true, true, true, true, false]);
      // Mounted first, then started: the view was listening when the reads began.
      expect(one('.loading').hidden).toBe(false);

      await typesListed('Piscina', 'Studio');
      await patternsListed(MONDAY, TUESDAY);
      await quiet();
      expect(apiCalls()).toEqual([
        ['http://api.test/calendar/settings', BEARER],
        ['http://api.test/calendar/types', BEARER],
        ['http://api.test/calendar/patterns', BEARER],
      ]);
      expect(sent()).toEqual(READS);
      // The form that creates a pattern starts on today in the calendar's zone, with the types to choose from and none chosen.
      expect([field('form.create-pattern', 'validFrom').value, field('form.create-pattern', 'typeId').value, [...field('form.create-pattern', 'typeId').querySelectorAll('option')].map((option) => option.textContent)]).toEqual(['2026-11-19', '', ['Piscina', 'Studio']]);
      expect(one('form.create-type .hint').textContent).toBe('A name has 1 to 40 characters, with no tab in it.');
      for (const token of TOKENS) expect(html()).not.toContain(token);
    });

    it('"today" is the calendar\'s: in a zone where it is already tomorrow, the form starts on tomorrow', async () => {
      // 10:00 UTC on Thursday 19 November is 23:00 on that day in Auckland; 12:30 UTC is Friday there.
      vi.setSystemTime(new Date('2026-11-19T12:30:00.000Z'));
      at('#/availability');
      fetchMock.mockResolvedValueOnce(settings('Pacific/Auckland')).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
      mounted(ADMIN);
      await vi.waitFor(() => expect(field('form.create-pattern', 'validFrom').value).toBe('2026-11-20'));
    });

    it('#/availability typed by a User shows the week, the address is put right, and none of its routes is asked for', async () => {
      at('#/availability');
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      mounted(ALICE);
      expect(window.location.hash).toBe('#/week');
      expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments', 'My details', 'Password']);
      expect([find('#week').hidden, find('#availability').hidden]).toEqual([false, true]);
      await weekDrawn();
      window.location.hash = '#/availability';
      await vi.waitFor(() => expect(window.location.hash).toBe('#/week'));
      expect(find('#availability').hidden).toBe(true);
      expect(apiCalls()).toEqual([[WEEK_URL, 'Bearer access-token-alice']]);
      expect(drawn()).toBe(0);
    });

    it('a failed read of one list is said in its place and leaves the other; its "Try again" reads it again, and only it', async () => {
      at('#/availability');
      fetchMock.mockResolvedValueOnce(settings()).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(patternsOf());
      mounted(ADMIN);
      await vi.waitFor(() => expect(one('.types .unread').hidden).toBe(false));
      expect(one('.types .unread .error').textContent).toBe('The server cannot be reached. Check the connection and try again.');
      await patternsListed('Monday: 09:00 – 13:00 Unknown type', 'Tuesday: 15:00 – 18:00 Unknown type');
      expect([one('.patterns .unread').hidden, html().includes('Failed to fetch')]).toEqual([true, false]);

      fetchMock.mockResolvedValueOnce(typesOf());
      one('.types .retry').click();
      await typesListed('Piscina', 'Studio');
      await patternsListed(MONDAY, TUESDAY);
      expect(one('.types .unread').hidden).toBe(true);
      expect(sent()).toEqual([...READS, 'GET /calendar/types']);
    });

    it('a type is created: the POST with the name, spaces removed, the field emptied, and the types read again; it is in the list and among the types of both pattern forms', async () => {
      await onAvailability();
      fetchMock.mockResolvedValueOnce(json(201, type(SALA, 'Sala'))).mockResolvedValueOnce(typesOf([TYPES[0]!, type(SALA, 'Sala'), TYPES[1]!]));
      field('form.create-type', 'name').value = ' Sala ';
      submit(one<HTMLFormElement>('form.create-type'));
      expect(one<HTMLButtonElement>('form.create-type .submit').disabled).toBe(true);
      await typesListed('Piscina', 'Sala', 'Studio');
      expect(sent()).toEqual([...READS, 'POST /calendar/types', 'GET /calendar/types']);
      expect([bodyOf(3), (calls()[3]![1].headers as Record<string, string>).Authorization]).toEqual([{ name: 'Sala', capacity: 1 }, BEARER]);
      expect([field('form.create-type', 'name').value, one<HTMLButtonElement>('form.create-type .submit').disabled]).toEqual(['', false]);
      for (const formOf of ['form.create-pattern', 'dialog.change']) expect([...field(formOf, 'typeId').querySelectorAll('option')].map((option) => option.textContent), formOf).toEqual(['Piscina', 'Sala', 'Studio']);
    });

    it('a capacity is sent as the field holds it, a number; one out of its bounds is refused under its field with no request', async () => {
      await onAvailability();
      for (const text of ['0', '101', '2.5', '']) {
        field('form.create-type', 'name').value = 'Vasca';
        field('form.create-type', 'capacity').value = text;
        submit(one<HTMLFormElement>('form.create-type'));
        expect(field('form.create-type', 'capacity').closest('.field')!.querySelector('.refusal')!.textContent, text).toBe('How many people at the same time: a whole number from 1 to 100.');
      }
      expect(sent()).toEqual(READS);
      fetchMock.mockResolvedValueOnce(json(201, { ...type(SALA, 'Vasca'), capacity: 3 })).mockResolvedValueOnce(typesOf([TYPES[0]!, TYPES[1]!, { ...type(SALA, 'Vasca'), capacity: 3 }]));
      field('form.create-type', 'capacity').value = '3';
      submit(one<HTMLFormElement>('form.create-type'));
      await typesListed('Piscina', 'Studio', 'Vasca');
      expect(bodyOf(3)).toEqual({ name: 'Vasca', capacity: 3 });
      expect(one('.types .list li:nth-child(3) .places').textContent).toBe('· 3 places');
      expect(field('form.create-type', 'capacity').value).toBe('1');
    });

    it('a name that is not one is refused under its field with no request; a name that exists is the server\'s to refuse, in plain words, and what was typed stays', async () => {
      await onAvailability();
      for (const text of ['', '   ', 'a'.repeat(41)]) {
        field('form.create-type', 'name').value = text;
        submit(one<HTMLFormElement>('form.create-type'));
        expect(one('form.create-type .refusal').textContent, text).toBe('A name has 1 to 40 characters, with no tab in it.');
        expect(field('form.create-type', 'name').getAttribute('aria-invalid'), text).toBe('true');
      }
      expect(sent()).toEqual(READS);

      fetchMock.mockResolvedValueOnce(json(409, { error: 'type_name_exists', message: 'a type named "Studio" exists' })).mockResolvedValueOnce(typesOf());
      field('form.create-type', 'name').value = 'studio';
      submit(one<HTMLFormElement>('form.create-type'));
      await vi.waitFor(() => expect(one('form.create-type .failure').textContent).toBe('A type with this name exists already. Choose another name.'));
      await vi.waitFor(() => expect(sent()).toEqual([...READS, 'POST /calendar/types', 'GET /calendar/types']));
      expect([field('form.create-type', 'name').value, field('form.create-type', 'name').hasAttribute('aria-invalid'), html().includes('a type named')]).toEqual(['studio', false, false]);
    });

    it('a type is edited: the dialog opens with its name and its capacity, "Close" asks nothing, a refused name stays in the dialog, a good one sends the PUT, the dialog closes, and the patterns\' rows say the new name with no read of the patterns', async () => {
      await onAvailability();
      one('.types .list li:nth-child(2) .ask-rename').click();
      expect([dialog('rename').open, field('dialog.rename', 'name').value, field('dialog.rename', 'capacity').value]).toEqual([true, 'Studio', '1']);
      one('dialog.rename .close').click();
      expect([dialog('rename').open, sent()]).toEqual([false, READS]);

      one('.types .list li:nth-child(2) .ask-rename').click();
      fetchMock.mockResolvedValueOnce(json(409, { error: 'type_name_exists', message: 'exists' })).mockResolvedValueOnce(typesOf());
      field('dialog.rename', 'name').value = 'Piscina';
      submit(one<HTMLFormElement>('dialog.rename form'));
      await vi.waitFor(() => expect(one('dialog.rename .failure').textContent).toBe('A type with this name exists already. Choose another name.'));
      expect([dialog('rename').open, field('dialog.rename', 'name').value, one('form.create-type .failure').textContent]).toEqual([true, 'Piscina', '']);
      await quiet();

      fetchMock.mockResolvedValueOnce(json(200, type(STUDIO, 'Sala'))).mockResolvedValueOnce(typesOf([TYPES[0]!, type(STUDIO, 'Sala')]));
      field('dialog.rename', 'name').value = 'Sala';
      submit(one<HTMLFormElement>('dialog.rename form'));
      await vi.waitFor(() => expect(dialog('rename').open).toBe(false));
      await typesListed('Piscina', 'Sala');
      await patternsListed('Monday: 09:00 – 13:00 Sala', TUESDAY);
      expect(sent()).toEqual([...READS, `PUT /calendar/types/${STUDIO}`, 'GET /calendar/types', `PUT /calendar/types/${STUDIO}`, 'GET /calendar/types']);
      expect(bodyOf(5)).toEqual({ name: 'Sala', capacity: 1 });
    });

    it('a type is deleted: the dialog names it, "Keep" asks nothing; in use, the server\'s refusal says why and the dialog stays open; then the DELETE, the dialog closes and the types are read again', async () => {
      await onAvailability();
      one('.types .list li:nth-child(2) .ask-delete').click();
      expect([dialog('delete').open, one('dialog.delete .question').textContent]).toEqual([true, 'Delete the type Studio? This cannot be undone.']);
      one('dialog.delete .keep').click();
      expect([dialog('delete').open, sent()]).toEqual([false, READS]);

      one('.types .list li:nth-child(2) .ask-delete').click();
      fetchMock.mockResolvedValueOnce(json(409, { error: 'type_in_use', message: 'the type is referenced by 5 patterns' })).mockResolvedValueOnce(typesOf());
      one('dialog.delete .submit').click();
      await vi.waitFor(() => expect(one('dialog.delete .error').textContent).toMatch(/^This type is in use, so it cannot be deleted\./));
      await vi.waitFor(() => expect(sent()).toEqual([...READS, `DELETE /calendar/types/${STUDIO}`, 'GET /calendar/types']));
      await quiet();
      expect([dialog('delete').open, one<HTMLButtonElement>('dialog.delete .submit').disabled, html().includes('referenced by')]).toEqual([true, false, false]);

      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(typesOf([TYPES[0]!]));
      one('dialog.delete .submit').click();
      await vi.waitFor(() => expect(dialog('delete').open).toBe(false));
      await typesListed('Piscina');
      expect(sent().slice(5)).toEqual([`DELETE /calendar/types/${STUDIO}`, 'GET /calendar/types']);
      expect((calls()[5]![1].headers as Record<string, string>).Authorization).toBe(BEARER);
      // The pattern that still names it shows the fixed word, with no read of the patterns.
      await patternsListed('Monday: 09:00 – 13:00 Unknown type', TUESDAY);
    });

    it('a pattern is created: the POST with its body, the patterns read again, the row under its weekday, and the form back to its starting values', async () => {
      await onAvailability();
      const created = pattern('01M6PATTERN000000000000003', { weekday: 3, start: '20:00', end: '24:00', typeId: POOL, validFrom: '2026-12-01', validUntil: '2026-12-31' });
      fetchMock.mockResolvedValueOnce(json(201, created)).mockResolvedValueOnce(patternsOf([...PATTERNS, created]));
      set('form.create-pattern', { weekday: '3', start: '20:00', end: '24:00', typeId: POOL, validFrom: '2026-12-01', validUntil: '2026-12-31' });
      submit(one<HTMLFormElement>('form.create-pattern'));
      expect(one<HTMLButtonElement>('form.create-pattern .submit').disabled).toBe(true);
      await patternsListed(MONDAY, TUESDAY, 'Wednesday: 20:00 – 24:00 Piscina');
      expect(sent()).toEqual([...READS, 'POST /calendar/patterns', 'GET /calendar/patterns']);
      expect(bodyOf(3)).toEqual({ weekday: 3, start: '20:00', end: '24:00', typeId: POOL, validFrom: '2026-12-01', validUntil: '2026-12-31' });
      expect(['weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil'].map((name) => field('form.create-pattern', name).value)).toEqual(['1', '09:00', '10:00', '', '2026-11-19', '']);
      expect(one<HTMLButtonElement>('form.create-pattern .submit').disabled).toBe(false);
    });

    it('fields in fault are refused under them with no request; an overlap is the server\'s to refuse, in plain words, and what was chosen stays', async () => {
      await onAvailability();
      set('form.create-pattern', { start: '10:00', end: '10:00', validFrom: '', validUntil: '' });
      submit(one<HTMLFormElement>('form.create-pattern'));
      expect(all('form.create-pattern .refusal').map((refusal) => refusal.textContent)).toEqual(['', '', 'End must be later than Start.', 'Type must be chosen.', 'Valid from must be a date.', '']);
      expect(all('form.create-pattern [aria-invalid="true"]').map((each) => (each as HTMLInputElement).name)).toEqual(['end', 'typeId', 'validFrom']);
      expect(sent()).toEqual(READS);

      fetchMock.mockResolvedValueOnce(json(409, { error: 'availability_overlap', message: '2026-11-23: 09:00–13:00 overlaps 10:00–11:00' })).mockResolvedValueOnce(patternsOf());
      const chosen = { weekday: '1', start: '10:00', end: '11:00', typeId: POOL, validFrom: '2026-11-20', validUntil: '' };
      set('form.create-pattern', chosen);
      submit(one<HTMLFormElement>('form.create-pattern'));
      await vi.waitFor(() => expect(one('form.create-pattern .failure').textContent).toBe('Another window of the same day covers part of these hours, whatever its type. Choose other hours.'));
      await vi.waitFor(() => expect(sent()).toEqual([...READS, 'POST /calendar/patterns', 'GET /calendar/patterns']));
      expect(Object.keys(chosen).map((name) => field('form.create-pattern', name).value)).toEqual(Object.values(chosen));
      expect([all('form.create-pattern [aria-invalid="true"]').length, html().includes('overlaps')]).toEqual([0, false]);
    });

    it('a pattern is changed: the dialog opens with its six values, "Change" sends the PUT with the whole body, the dialog closes and the patterns are read again', async () => {
      await onAvailability();
      one('.patterns .groups section:nth-child(2) .ask-change').click();
      expect(dialog('change').open).toBe(true);
      expect(['weekday', 'start', 'end', 'typeId', 'validFrom', 'validUntil'].map((name) => field('dialog.change', name).value)).toEqual(['2', '15:00', '18:00', POOL, '2026-11-20', '']);

      const changed = pattern(P2, { weekday: 2, start: '15:00', end: '19:00', typeId: POOL, validUntil: '2027-01-19' });
      fetchMock.mockResolvedValueOnce(json(200, changed)).mockResolvedValueOnce(patternsOf([PATTERNS[0]!, changed]));
      set('dialog.change', { end: '19:00', validUntil: '2027-01-19' });
      submit(one<HTMLFormElement>('dialog.change form'));
      await vi.waitFor(() => expect(dialog('change').open).toBe(false));
      await patternsListed(MONDAY, 'Tuesday: 15:00 – 19:00 Piscina');
      expect(sent()).toEqual([...READS, `PUT /calendar/patterns/${P2}`, 'GET /calendar/patterns']);
      expect(bodyOf(3)).toEqual({ weekday: 2, start: '15:00', end: '19:00', typeId: POOL, validFrom: '2026-11-20', validUntil: '2027-01-19' });
      expect(one('.patterns .groups section:nth-child(2) .validity').textContent).toBe('from 20 November 2026 to 19 January 2027');
    });

    it('a change with appointments in the way: the 409 is said in the dialog, still open, with its list in the calendar\'s zone; the patterns are read again all the same, and no id of an appointment reaches the page', async () => {
      await onAvailability();
      one('.patterns .groups section:nth-child(1) .ask-change').click();
      fetchMock.mockResolvedValueOnce(json(409, conflict)).mockResolvedValueOnce(patternsOf());
      set('dialog.change', { end: '09:30' });
      submit(one<HTMLFormElement>('dialog.change form'));
      await vi.waitFor(() => expect(one('dialog.change .failure').textContent).toBe('This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.'));
      expect(one('dialog.change .conflicts').hidden).toBe(false);
      expect(one('dialog.change .conflicts-count').textContent).toBe('1 appointment is in the way:');
      expect(all('dialog.change .conflicts-list li').map((row) => [...row.children].map((part) => part.textContent))).toEqual([['Mon 23 Nov', '09:00–10:00', 'alice']]);
      await vi.waitFor(() => expect(sent()).toEqual([...READS, `PUT /calendar/patterns/${P1}`, 'GET /calendar/patterns']));
      await quiet();
      expect([dialog('change').open, field('dialog.change', 'end').value, anywhere('01M6APPT'), anywhere('would fall outside')]).toEqual([true, '09:30', false, false]);
      // Nothing of it in the form that creates.
      expect([one('form.create-pattern .failure').textContent, one('form.create-pattern .conflicts').hidden]).toEqual(['', true]);
    });

    it('a pattern is deleted: the dialog names it; with an appointment in the way the 409 is said there with its list; then the DELETE, the dialog closes and the patterns are read again', async () => {
      await onAvailability();
      one('.patterns .groups section:nth-child(1) .ask-delete').click();
      expect(one('dialog.delete .question').textContent).toBe('Delete the pattern Monday 09:00 – 13:00 Studio, from 20 November 2026? Its hours will no longer be open for booking. This cannot be undone.');
      fetchMock.mockResolvedValueOnce(json(409, conflict)).mockResolvedValueOnce(patternsOf());
      one('dialog.delete .submit').click();
      await vi.waitFor(() => expect(all('dialog.delete .conflicts-list li').map((row) => [...row.children].map((part) => part.textContent))).toEqual([['Mon 23 Nov', '09:00–10:00', 'alice']]));
      expect([dialog('delete').open, one('dialog.delete .error').textContent.startsWith('This would leave booked appointments')]).toEqual([true, true]);
      await vi.waitFor(() => expect(sent()).toEqual([...READS, `DELETE /calendar/patterns/${P1}`, 'GET /calendar/patterns']));
      await quiet();

      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(patternsOf([PATTERNS[1]!]));
      one('dialog.delete .submit').click();
      await vi.waitFor(() => expect(dialog('delete').open).toBe(false));
      await patternsListed(TUESDAY);
      expect(sent().slice(5)).toEqual([`DELETE /calendar/patterns/${P1}`, 'GET /calendar/patterns']);
      expect(anywhere('alice')).toBe(false);
    });

    it('with the change dialog open, the tab shown again reads both lists again, not the settings, and leaves what is chosen in the dialog', async () => {
      await onAvailability();
      one('.patterns .groups section:nth-child(2) .ask-change').click();
      set('dialog.change', { weekday: '5', typeId: STUDIO });
      fetchMock.mockResolvedValueOnce(typesOf([...TYPES, type(SALA, 'Zeta')])).mockResolvedValueOnce(patternsOf([PATTERNS[0]!]));
      becomesVisible();
      await typesListed('Piscina', 'Studio', 'Zeta');
      await patternsListed(MONDAY);
      expect(sent()).toEqual([...READS, 'GET /calendar/types', 'GET /calendar/patterns']);
      expect([dialog('change').open, field('dialog.change', 'weekday').value, field('dialog.change', 'typeId').value, field('dialog.change', 'start').value]).toEqual([true, '5', STUDIO, '15:00']);
    });

    it('availability, week, availability: nothing left over or doubled, everything read again, and what was typed and not sent is gone', async () => {
      await onAvailability();
      field('form.create-type', 'name').value = 'Sala';
      set('form.create-pattern', { weekday: '4', typeId: POOL });
      one('.types .list li:nth-child(1) .ask-rename').click();

      // The week: the availability is left and emptied.
      fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
      links()[0]!.click();
      await weekDrawn();
      expect([find('#availability').hidden, dialog('rename').open, drawn(), field('form.create-type', 'name').value]).toEqual([true, false, 0, '']);
      expect(anywhere('Piscina')).toBe(false);

      // Back: the three reads again, one row each, the lists of the forms filled once.
      fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
      links()[3]!.click();
      await patternsListed(MONDAY, TUESDAY);
      await typesListed('Piscina', 'Studio');
      expect(sent()).toEqual([...READS, 'GET /calendar?from=2026-11-16&to=2026-11-22', ...READS]);
      expect([days().length, document.querySelectorAll('#app .nav a').length]).toEqual([0, 6]);
      expect([field('form.create-pattern', 'weekday').querySelectorAll('option').length, field('form.create-pattern', 'typeId').querySelectorAll('option').length]).toEqual([7, 2]);
      expect([field('form.create-type', 'name').value, field('form.create-pattern', 'weekday').value, field('form.create-pattern', 'typeId').value, dialog('rename').open]).toEqual(['', '1', '', false]);
    });

    it('signing out with a dialog open and a conflicts list on show leaves nothing: the page as before anyone signed in; a User then sees nothing of it and asks for none of its routes', async () => {
      at('#/availability');
      const { store, signOut } = mounted();
      const before = html(); // the page at the login, before anyone signed in
      fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
      store.set(ADMIN);
      await patternsListed(MONDAY, TUESDAY);
      await quiet();
      field('form.create-type', 'name').value = 'Sala segreta';
      one('.patterns .groups section:nth-child(1) .ask-change').click();
      fetchMock.mockResolvedValueOnce(json(409, conflict)).mockResolvedValueOnce(patternsOf());
      submit(one<HTMLFormElement>('dialog.change form'));
      await vi.waitFor(() => expect(all('dialog.change .conflicts-list li')).toHaveLength(1));
      await quiet();
      one('.types .list li:nth-child(1) .ask-delete').click(); // the emulated page lets a click through a modal dialog
      expect([dialog('change').open, dialog('delete').open, anywhere('alice')]).toEqual([true, true, true]);

      signOut.click();
      expect([dialog('change').open, dialog('delete').open]).toEqual([false, false]);
      for (const gone of ['Piscina', 'Studio', 'Sala segreta', 'alice', 'Mon 23 Nov', 'admin', STUDIO, POOL, P1, '2026-11-20']) expect(anywhere(gone), gone).toBe(false);
      expect(fields().every((value) => value === '')).toBe(true);
      expect(html()).toBe(before);
      expect(window.location.hash).toBe('#/availability'); // signing out leaves the address

      const asked = apiCalls().length;
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      store.set(ALICE);
      expect(window.location.hash).toBe('#/week');
      await weekDrawn();
      expect(apiCalls().slice(asked)).toEqual([[WEEK_URL, 'Bearer access-token-alice']]);
      expect([find('#availability').hidden, drawn()]).toEqual([true, 0]);
      for (const gone of ['Piscina', 'Sala segreta', 'Mon 23 Nov']) expect(anywhere(gone), gone).toBe(false);
    });

    describe('a single date, the screen\'s third part', () => {
      const DATE = '2026-11-23'; // a Monday: the first of the two patterns gives it 09:00 to 13:00 of Studio
      const W1 = '01M6W1ND0W0000000000000001';
      const DAY_URL = `/calendar?from=${DATE}&to=${DATE}`;
      const GET_DAY = `GET ${DAY_URL}`;
      // An hour of that Monday on Rome's clock, as an instant.
      const hour = (local: number) => `${DATE}T${String(local - 1).padStart(2, '0')}:00:00.000Z`;
      const seen = (start: number, end: number, typeId: string, typeName: string, source: string, sourceId: string) => ({ start: hour(start), end: hour(end), typeId, typeName, source, sourceId });
      const BY_PATTERN = seen(9, 13, STUDIO, 'Studio', 'pattern', P1);
      const EXTRA = seen(18, 20, POOL, 'Piscina', 'one_off', W1);
      const dayOf = (windows: object[] = [BY_PATTERN], hasOverride = false) =>
        json(200, { timeZone: 'Europe/Rome', from: DATE, to: DATE, generatedAt: '2026-11-19T10:00:00.000Z', days: [{ date: DATE, weekday: 1, windows, slots: [], busy: [], hasOverride }], appointments: [] });
      const part = <T extends HTMLElement = HTMLElement>(selector: string) => one<T>(`.one-date ${selector}`);
      const lines = (list: string) => all(`.one-date .${list} > li`).map((item) => `${item.querySelector('.time')!.textContent} ${item.querySelector('.type-name')!.textContent}`);
      const which = (sentence: string) => vi.waitFor(() => expect(part('.which').textContent).toBe(sentence));
      const APPLY = 'The weekly patterns apply on this day.';
      const OWN = 'This day has its own windows, in the place of the weekly patterns.';
      const CLOSED = 'This day is not available: the weekly patterns do not apply.';
      const confirmIt = () => one<HTMLButtonElement>('dialog.delete .submit').click();
      // The Administrator on the availability, with the Monday shown as `first` answers it.
      const onDate = async (first: Response = dayOf()) => {
        const made = await onAvailability();
        field('.one-date form.choose', 'date').value = DATE;
        fetchMock.mockResolvedValueOnce(first);
        submit(part<HTMLFormElement>('form.choose'));
        await vi.waitFor(() => expect(part('.date-words').textContent).toBe('Monday 23 November 2026'));
        return made;
      };
      // "This day only" on that Monday, with one window added after the pattern's.
      const drafting = async () => {
        const made = await onDate();
        part('.edit').click();
        set('.one-date form.add-draft', { start: '14:00', end: '16:00', typeId: POOL });
        submit(part<HTMLFormElement>('form.add-draft'));
        expect(lines('draft-rows')).toEqual(['09:00 – 13:00 Studio', '14:00 – 16:00 Piscina']);
        return made;
      };

      it('#/availability makes its three requests and no fourth: the date field is on today, the calendar\'s, and nothing of a day is shown', async () => {
        await onAvailability();
        expect(sent()).toEqual(READS);
        expect([field('.one-date form.choose', 'date').value, part('.shown').hidden, part('.loading').hidden]).toEqual(['2026-11-19', true, true]);
        expect([...field('.one-date form.add-window', 'typeId').querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Piscina', 'Studio']);
      });

      it('a date shown asks GET /calendar for that date alone, with the person\'s token; the week, shown afterwards, loads its own week once, through its own service', async () => {
        await onDate();
        expect(sent()).toEqual([...READS, GET_DAY]);
        expect(apiCalls().at(-1)).toEqual([`http://api.test${DAY_URL}`, BEARER]);
        expect([lines('given-rows'), part('.which').textContent, lines('own-rows'), part('.extras .none').textContent]).toEqual([['09:00 – 13:00 Studio'], APPLY, [], 'This day has no extra windows.']);

        fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
        links()[0]!.click();
        await weekDrawn();
        expect(sent()).toEqual([...READS, GET_DAY, 'GET /calendar?from=2026-11-16&to=2026-11-22']);
      });

      it('a date before today is refused under the field with no request, and nothing is shown for it', async () => {
        await onAvailability();
        field('.one-date form.choose', 'date').value = '2026-11-18';
        submit(part<HTMLFormElement>('form.choose'));
        expect([part('form.choose .refusal').textContent, part('.shown').hidden, sent()]).toEqual(['A date before today cannot be changed. The week shows what a past day had.', true, READS]);
      });

      it('while the settings could not be read, "Show" is refused with that failure and no request; after "Try again" it goes', async () => {
        at('#/availability');
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
        mounted(ADMIN);
        await typesListed('Piscina', 'Studio');
        await quiet();
        field('.one-date form.choose', 'date').value = DATE;
        submit(part<HTMLFormElement>('form.choose'));
        expect([part('form.choose .refusal').textContent, sent()]).toEqual(['The server cannot be reached. Check the connection and try again.', READS]);

        fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(patternsOf());
        one('.patterns .retry').click();
        await patternsListed(MONDAY, TUESDAY);
        expect([part('form.choose .refusal').textContent, field('.one-date form.choose', 'date').value]).toEqual(['', '2026-11-19']);
        field('.one-date form.choose', 'date').value = DATE;
        fetchMock.mockResolvedValueOnce(dayOf());
        submit(part<HTMLFormElement>('form.choose'));
        await which(APPLY);
      });

      it('a draft saved: nothing is sent before "Save this day"; then one PUT with the whole list, and the day read again', async () => {
        await drafting();
        expect(sent()).toEqual([...READS, GET_DAY]);
        const own = [seen(9, 13, STUDIO, 'Studio', 'override', DATE), seen(14, 16, POOL, 'Piscina', 'override', DATE)];
        fetchMock.mockResolvedValueOnce(json(200, { date: DATE, windows: [], updatedAt: STAMPS.updatedAt })).mockResolvedValueOnce(dayOf(own, true));
        part('.save').click();
        await which(OWN);
        expect(sent().slice(4)).toEqual([`PUT /calendar/overrides/${DATE}`, GET_DAY]);
        expect(bodyOf(4)).toEqual({ windows: [{ start: '09:00', end: '13:00', typeId: STUDIO }, { start: '14:00', end: '16:00', typeId: POOL }] });
        expect([part('.draft').hidden, lines('own-rows'), lines('given-rows'), part('.back').hidden]).toEqual([true, ['09:00 – 13:00 Studio', '14:00 – 16:00 Piscina'], ['09:00 – 13:00 Studio'], false]);
      });

      it('a save refused with 409 availability_conflict: the sentence and the appointment in the way, in the calendar\'s zone, under the windows, which stay; the day is read again', async () => {
        await drafting();
        fetchMock.mockResolvedValueOnce(json(409, conflict)).mockResolvedValueOnce(dayOf());
        part('.save').click();
        await vi.waitFor(() => expect(all('.one-date .draft .conflicts-list li')).toHaveLength(1));
        expect(part('.save-failure').textContent).toBe('This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.');
        expect([...all('.one-date .draft .conflicts-list li')[0]!.children].map((each) => each.textContent)).toEqual(['Mon 23 Nov', '09:00–10:00', 'alice']);
        await vi.waitFor(() => expect(sent().slice(4)).toEqual([`PUT /calendar/overrides/${DATE}`, GET_DAY]));
        expect([part('.draft').hidden, lines('draft-rows').length]).toEqual([false, 2]);
        // The server's own words never reach the page.
        expect(anywhere('would fall outside')).toBe(false);
      });

      it('date_in_past from the server (a page left open over midnight) is said in plain words, and the draft stays', async () => {
        await drafting();
        fetchMock.mockResolvedValueOnce(json(409, { error: 'date_in_past', message: 'the date is before today' })).mockResolvedValueOnce(dayOf());
        part('.save').click();
        await vi.waitFor(() => expect(part('.save-failure').textContent).toBe('This date is now in the past, so it can no longer be changed.'));
        expect([lines('draft-rows').length, anywhere('the date is before today')]).toEqual([2, false]);
      });

      it('"not available": the dialog asks; confirmed, one PUT with no window, then the read; the day says it is not available', async () => {
        await onDate();
        part('.make-closed').click();
        expect([dialog('delete').open, one('dialog.delete h3').textContent, one('dialog.delete .question').textContent.startsWith('Make Monday 23 November 2026 not available?'), sent().length]).toEqual([true, 'Please confirm', true, 4]);
        fetchMock.mockResolvedValueOnce(json(200, { date: DATE, windows: [], updatedAt: STAMPS.updatedAt })).mockResolvedValueOnce(dayOf([], true));
        confirmIt();
        await which(CLOSED);
        expect([dialog('delete').open, sent().slice(4), bodyOf(4)]).toEqual([false, [`PUT /calendar/overrides/${DATE}`, GET_DAY], { windows: [] }]);
      });

      it('back to the weekly patterns: the dialog asks; confirmed, the DELETE, then the read; the day says the patterns apply', async () => {
        await onDate(dayOf([], true));
        part('.back').click();
        expect(one('dialog.delete .question').textContent.startsWith('Back to the weekly patterns for Monday 23 November 2026?')).toBe(true);
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(dayOf());
        confirmIt();
        await which(APPLY);
        expect([dialog('delete').open, sent().slice(4), part('.back').hidden]).toEqual([false, [`DELETE /calendar/overrides/${DATE}`, GET_DAY], true]);
      });

      it('an extra window created and deleted: the POST with the date on show, then the read; the DELETE by its id after the dialog, then the read', async () => {
        await onDate();
        set('.one-date form.add-window', { start: '18:00', end: '20:00', typeId: POOL });
        fetchMock.mockResolvedValueOnce(json(201, { windowId: W1, date: DATE, start: '18:00', end: '20:00', typeId: POOL, createdAt: STAMPS.createdAt })).mockResolvedValueOnce(dayOf([BY_PATTERN, EXTRA]));
        submit(part<HTMLFormElement>('form.add-window'));
        await vi.waitFor(() => expect(lines('extra-rows')).toEqual(['18:00 – 20:00 Piscina']));
        expect([sent().slice(4), bodyOf(4)]).toEqual([['POST /calendar/windows', GET_DAY], { date: DATE, start: '18:00', end: '20:00', typeId: POOL }]);
        // The form is back on its starting values.
        expect([field('.one-date form.add-window', 'start').value, field('.one-date form.add-window', 'typeId').value]).toEqual(['09:00', '']);

        part('.extra-rows .ask-delete').click();
        expect(one('dialog.delete .question').textContent.startsWith('Delete the extra window 18:00 – 20:00 Piscina of Monday 23 November 2026?')).toBe(true);
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(dayOf());
        confirmIt();
        await vi.waitFor(() => expect(lines('extra-rows')).toEqual([]));
        expect([dialog('delete').open, sent().slice(6)]).toEqual([false, [`DELETE /calendar/windows/${W1}`, GET_DAY]]);
      });

      it('a pattern deleted in the screen\'s second part while a date is on show: the patterns and the day are both read again, and the day\'s two descriptions follow', async () => {
        await onDate();
        one('.patterns .groups section:nth-child(1) .ask-delete').click();
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(patternsOf([PATTERNS[1]!])).mockResolvedValueOnce(dayOf([]));
        confirmIt();
        await patternsListed(TUESDAY);
        await vi.waitFor(() => expect(part('.given .none').textContent).toBe('The weekly patterns give no hours on this day.'));
        expect(sent().slice(4)).toEqual([`DELETE /calendar/patterns/${P1}`, 'GET /calendar/patterns', GET_DAY]);
        expect([lines('given-rows'), part('.which').textContent]).toEqual([[], APPLY]);
      });

      it('the tab shown again with a draft open: the two lists and the day are read again, and the draft keeps its windows', async () => {
        await drafting();
        fetchMock.mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf()).mockResolvedValueOnce(dayOf([BY_PATTERN, EXTRA]));
        becomesVisible();
        await vi.waitFor(() => expect(lines('extra-rows')).toEqual(['18:00 – 20:00 Piscina']));
        expect(sent().slice(4)).toEqual(['GET /calendar/types', 'GET /calendar/patterns', GET_DAY]);
        expect(lines('draft-rows')).toEqual(['09:00 – 13:00 Studio', '14:00 – 16:00 Piscina']);
      });

      it('availability, week, availability: nothing left over or doubled, the draft gone, no date shown and no request for one', async () => {
        await drafting();
        fetchMock.mockResolvedValueOnce(json(200, adminWeek()));
        links()[0]!.click();
        await weekDrawn();
        expect([find('#availability').hidden, drawn(), field('.one-date form.choose', 'date').value]).toEqual([true, 0, '']);
        for (const gone of ['Piscina', 'Monday 23 November']) expect(anywhere(gone), gone).toBe(false);

        fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
        links()[3]!.click();
        await patternsListed(MONDAY, TUESDAY);
        await quiet();
        expect(sent()).toEqual([...READS, GET_DAY, 'GET /calendar?from=2026-11-16&to=2026-11-22', ...READS]);
        expect([part('.shown').hidden, part('.draft').hidden, lines('draft-rows'), field('.one-date form.choose', 'date').value]).toEqual([true, true, [], '2026-11-19']);
        expect([field('.one-date form.add-draft', 'start').querySelectorAll('option').length, field('.one-date form.add-window', 'typeId').querySelectorAll('option').length]).toEqual([96, 2]);
      });

      it('signing out with a draft open and a conflicts list on show leaves nothing: the page as before anyone signed in; a User then asks for none of the routes of a date', async () => {
        at('#/availability');
        const { store, signOut } = mounted();
        const before = html(); // the page at the login, before anyone signed in
        fetchMock.mockResolvedValueOnce(settings()).mockResolvedValueOnce(typesOf()).mockResolvedValueOnce(patternsOf());
        store.set(ADMIN);
        await patternsListed(MONDAY, TUESDAY);
        await quiet();
        field('.one-date form.choose', 'date').value = DATE;
        fetchMock.mockResolvedValueOnce(dayOf([BY_PATTERN, EXTRA]));
        submit(part<HTMLFormElement>('form.choose'));
        await which(APPLY);
        part('.edit').click();
        fetchMock.mockResolvedValueOnce(json(409, conflict)).mockResolvedValueOnce(dayOf([BY_PATTERN, EXTRA]));
        part('.save').click();
        await vi.waitFor(() => expect(all('.one-date .draft .conflicts-list li')).toHaveLength(1));
        await vi.waitFor(() => expect(part('.loading').hidden).toBe(true));
        part('.extra-rows .ask-delete').click();
        expect([part('.draft').hidden, dialog('delete').open, anywhere('alice'), anywhere('Monday 23 November 2026')]).toEqual([false, true, true, true]);

        signOut.click();
        expect(dialog('delete').open).toBe(false);
        for (const gone of ['Piscina', 'Studio', 'alice', 'Mon 23 Nov', 'Monday 23 November', 'admin', STUDIO, POOL, W1, DATE, '2026-11-19']) expect(anywhere(gone), gone).toBe(false);
        expect(fields().every((value) => value === '')).toBe(true);
        expect(html()).toBe(before);

        const asked = apiCalls().length;
        fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
        store.set(ALICE);
        await weekDrawn();
        expect(apiCalls().slice(asked)).toEqual([[WEEK_URL, 'Bearer access-token-alice']]);
        expect(sent().filter((request) => request.includes('/overrides') || request.includes('/windows'))).toEqual([`PUT /calendar/overrides/${DATE}`]);
        expect([find('#availability').hidden, drawn()]).toEqual([true, 0]);
      });
    });
  });

  describe('the assistant\'s panel, which is no screen', () => {
    const PROPOSAL_ID = '01M6DMQ0000000000000000009';
    const BEARER = { alice: 'Bearer access-token-alice', admin: 'Bearer access-token-admin' };
    const panel = () => find('#assistant');
    const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#assistant ${selector}`);
    const field = () => one<HTMLInputElement>('[name="message"]');
    const texts = () => [...document.querySelectorAll('#assistant .message .text')].map((text) => text.textContent);
    const at = (hash: string) => window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
    const current = () => links().find((a) => a.getAttribute('aria-current') === 'page')!.textContent;
    const settings = (over: object = {}) => ({ timeZone: 'Europe/Rome', cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: null, updatedBy: null, ...over });
    const reply = (over: object = {}) => ({ conversationId: '01M6DMQ0000000000000000008', language: 'en', status: 'idle', messages: [], activity: null, proposal: null, remainingToday: 9, ...over });
    const said = (seq: number, from: string, text: string) => ({ seq, from, text, at: '2026-11-19T10:00:00.000Z' });
    const proposal = (outcome: string | null) => ({ proposalId: PROPOSAL_ID, question: 'Shall I make this change?', confirmLabel: 'Confirm', declineLabel: "Don't", actions: [{ summary: 'Book an appointment.', outcome, error: null }] });
    const NO_CONVERSATION = reply({ conversationId: null, language: null, remainingToday: 10 });
    // The requests to the API, as "METHOD path", and those of them that are the assistant's.
    const requests = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl)).map(([url, init]) => `${init.method} ${url.slice(CONFIG.apiUrl.length)}`);
    const toTheAssistant = () => requests().filter((request) => request.includes(' /assistant'));
    const count = (start: string) => requests().filter((request) => request.startsWith(start)).length;
    // The API answers by what is asked: every screen's reads, and the assistant's routes as the
    // test says. What a test does not name stays unanswered.
    const api = (assistant: Record<string, () => object> = {}, calendarSettings: () => object = settings) => {
      const answers: Record<string, () => Response> = {
        'GET /calendar/settings': () => json(200, calendarSettings()),
        'GET /calendar/appointments': () => json(200, { appointments: [] }),
        'GET /calendar/types': () => json(200, { types: [] }),
        'GET /calendar/patterns': () => json(200, { patterns: [] }),
        'GET /calendar?': () => json(200, winterWeek()),
        'GET /users': () => json(200, { users: [] }),
        ...Object.fromEntries(Object.entries(assistant).map(([request, body]) => [request, () => json(200, body())])),
      };
      fetchMock.mockImplementation((url: string, init: RequestInit) => {
        const request = `${init.method} ${url.slice(CONFIG.apiUrl.length)}`;
        const answer = Object.entries(answers).find(([start]) => request.startsWith(start));
        return answer ? Promise.resolve(answer[1]()) : unanswered();
      });
    };
    const openPanel = async (first: object = NO_CONVERSATION) => {
      field().focus();
      await vi.waitFor(() => expect(one<HTMLButtonElement>('.send').disabled).toBe(false));
      return first;
    };

    it.each([
      ['a User', ALICE, ['Week', 'My appointments', 'My details', 'Password']],
      ['the Administrator', ADMIN, ['Week', 'Settings', 'Users', 'Availability', 'My details', 'Password']],
    ])('the login has none; for %s it is at the bottom of every screen, collapsed, with no link of its own and no request made', async (_name, who, screens) => {
      api();
      const { store } = mounted();
      expect(panel().hidden).toBe(true);
      store.set(who);
      expect(links().map((a) => a.textContent)).toEqual(screens);
      for (const [i, screen] of screens.entries()) {
        links()[i]!.click();
        await vi.waitFor(() => expect(current()).toBe(screen));
        expect([panel().hidden, panel().classList.contains('open'), one('.talk').hidden], screen).toEqual([false, false, true]);
        expect(panel().closest('[hidden]'), screen).toBeNull();
      }
      expect(toTheAssistant()).toEqual([]);
      expect(window.location.hash).not.toContain('assistant');
    });

    it('the first opening reads the conversation with the person\'s token, once; the field typed in and the open panel are kept from screen to screen, with no other request to the assistant', async () => {
      api({ 'GET /assistant/conversation': () => reply({ messages: [said(1, 'person', 'hello'), said(2, 'assistant', 'Hello, alice.')] }) });
      mounted(ALICE);
      await weekDrawn();
      field().focus();
      expect(panel().classList.contains('open')).toBe(true);
      await vi.waitFor(() => expect(texts()).toEqual(['hello', 'Hello, alice.']));
      expect(apiCalls().filter(([url]) => url!.includes('/assistant'))).toEqual([['http://api.test/assistant/conversation', BEARER.alice]]);
      expect(one('.remaining').textContent).toBe('9 messages left today');

      field().value = 'a question half typed';
      const rows = [...document.querySelectorAll('#assistant .message')];
      links()[1]!.click();
      await vi.waitFor(() => expect(current()).toBe('My appointments'));
      links()[0]!.click();
      await vi.waitFor(() => expect(current()).toBe('Week'));
      expect([panel().hidden, panel().classList.contains('open'), field().value]).toEqual([false, true, 'a question half typed']);
      // The very rows: the view was not mounted again.
      expect([...document.querySelectorAll('#assistant .message')]).toEqual(rows);
      expect(toTheAssistant()).toEqual(['GET /assistant/conversation']);
    });

    it('signing out takes the panel with the session: hidden, collapsed, the conversation and what was typed gone, the page as before anyone signed in', async () => {
      api({ 'GET /assistant/conversation': () => reply({ messages: [said(1, 'person', 'a private question'), said(2, 'assistant', 'A private answer.')] }) });
      const { store, signOut } = mounted();
      const before = html();
      store.set(ALICE);
      await weekDrawn();
      field().focus();
      await vi.waitFor(() => expect(texts()).toHaveLength(2));
      field().value = 'typed and never sent';

      signOut.click();
      expect([panel().hidden, panel().classList.contains('open'), field().value, texts()]).toEqual([true, false, '', []]);
      expect(html()).toBe(before);
      expect(html()).not.toContain('a private question');
    });

    it('the next person finds it collapsed and empty, and its first opening reads that person\'s conversation; the first person, back, reads their own again', async () => {
      const conversations: Record<string, object> = {
        [BEARER.alice]: reply({ messages: [said(1, 'person', 'a question of alice'), said(2, 'assistant', 'An answer for alice.')] }),
        [BEARER.admin]: NO_CONVERSATION,
      };
      fetchMock.mockImplementation((url: string, init: RequestInit) => {
        if (url.endsWith('/assistant/conversation')) return Promise.resolve(json(200, conversations[(init.headers as Record<string, string>).Authorization!]));
        return url.includes('/calendar?') ? Promise.resolve(json(200, winterWeek())) : unanswered();
      });
      const { store, signOut } = mounted(ALICE);
      field().focus();
      await vi.waitFor(() => expect(texts()).toHaveLength(2));
      field().value = 'typed by alice';
      signOut.click();

      store.set(ADMIN);
      expect([panel().hidden, panel().classList.contains('open'), field().value, texts()]).toEqual([false, false, '', []]);
      for (const hers of ['a question of', 'An answer for', 'typed by']) expect(html()).not.toContain(hers);
      // By the heading: the emulated page leaves the keyboard in the field although the panel
      // was hidden meanwhile, so the field would not take it again.
      one('.toggle').click();
      await vi.waitFor(() => expect(one('.remaining').textContent).toBe('10 messages left today'));
      expect([texts(), one<HTMLButtonElement>('.end').disabled]).toEqual([[], true]);
      for (const hers of ['a question of', 'An answer for', 'typed by']) expect(html()).not.toContain(hers);
      signOut.click();

      store.set(ALICE);
      expect(texts()).toEqual([]);
      one('.toggle').click();
      await vi.waitFor(() => expect(texts()).toEqual(['a question of alice', 'An answer for alice.']));
      expect(apiCalls().filter(([url]) => url!.includes('/assistant')).map(([, bearer]) => bearer)).toEqual([BEARER.alice, BEARER.admin, BEARER.alice]);
    });

    it('a message is sent, the step that follows is asked for by itself, and the answer is shown', async () => {
      api({
        'GET /assistant/conversation': () => NO_CONVERSATION,
        'POST /assistant/messages': () => reply({ status: 'working', activity: 'Looking at the calendar…', messages: [said(1, 'person', 'what is open?')] }),
        'POST /assistant/continue': () => reply({ messages: [said(2, 'assistant', 'Tuesday is open.')] }),
      });
      mounted(ALICE);
      await weekDrawn();
      await openPanel();
      field().value = 'what is open?';
      submit(one<HTMLFormElement>('.compose'));
      await vi.waitFor(() => expect(texts()).toEqual(['what is open?', 'Tuesday is open.']));
      expect(toTheAssistant()).toEqual(['GET /assistant/conversation', 'POST /assistant/messages', 'POST /assistant/continue']);
      expect([field().value, one('.progress').textContent, one('.news').textContent]).toEqual(['', '', 'Tuesday is open.']);
      const sent = (fetchMock.mock.calls as [string, RequestInit][]).find(([url]) => url.endsWith('/assistant/messages'))!;
      expect(JSON.parse(sent[1].body as string)).toEqual({ text: 'what is open?' });
    });

    it('a change confirmed with the week on show: the week is loaded again by itself, once, under the open panel', async () => {
      api({
        'GET /assistant/conversation': () => reply({ status: 'awaiting_confirmation', proposal: proposal(null), messages: [said(1, 'person', 'book it')] }),
        [`POST /assistant/proposals/${PROPOSAL_ID}/confirm`]: () => reply({ status: 'working', proposal: proposal('done') }),
        'POST /assistant/continue': () => reply({ proposal: proposal('done'), messages: [said(2, 'assistant', 'Booked.')] }),
      });
      mounted(ALICE);
      await weekDrawn();
      await openPanel();
      expect([count('GET /calendar?'), one('.confirm').textContent, one('.decline').textContent]).toEqual([1, 'Confirm', "Don't"]);

      one('.confirm').click();
      await vi.waitFor(() => expect(texts()).toEqual(['book it', 'Booked.']));
      expect(count('GET /calendar?')).toBe(2);
      expect(requests().at(-2)).toBe('GET /calendar?from=2026-11-16&to=2026-11-22');
      expect([one('.proposal .actions').hidden, one('.proposed .outcome').textContent, panel().classList.contains('open')]).toEqual([true, 'Done', true]);
      expect(document.activeElement).toBe(field());
    });

    it('a proposal declined loads nothing again', async () => {
      api({
        'GET /assistant/conversation': () => reply({ status: 'awaiting_confirmation', proposal: proposal(null), messages: [said(1, 'person', 'book it')] }),
        [`POST /assistant/proposals/${PROPOSAL_ID}/decline`]: () => reply({ messages: [said(2, 'notice', 'Nothing was changed.')] }),
      });
      mounted(ALICE);
      await weekDrawn();
      await openPanel();
      one('.decline').click();
      await vi.waitFor(() => expect(texts()).toEqual(['book it', 'Nothing was changed.']));
      expect([count('GET /calendar?'), one('.proposal').hidden]).toEqual([1, true]);
    });

    it('a change confirmed with "My appointments" on show: the list is loaded again, and the week when it is shown next', async () => {
      at('#/appointments');
      api({
        'GET /assistant/conversation': () => reply({ status: 'awaiting_confirmation', proposal: proposal(null) }),
        [`POST /assistant/proposals/${PROPOSAL_ID}/confirm`]: () => reply({ proposal: proposal('done'), messages: [said(2, 'assistant', 'Booked.')] }),
      });
      mounted(ALICE);
      await vi.waitFor(() => expect(find('#appointments .empty').hidden).toBe(false));
      await openPanel();
      expect([count('GET /calendar/appointments'), count('GET /calendar?')]).toEqual([1, 0]);
      one('.confirm').click();
      await vi.waitFor(() => expect(count('GET /calendar/appointments')).toBe(2));
      links()[0]!.click();
      await weekDrawn();
      expect(count('GET /calendar?')).toBe(1);
    });

    it('a change confirmed with the settings on show: they are read again and the form is filled with what the server holds', async () => {
      at('#/settings');
      let horizon = 56;
      api(
        {
          'GET /assistant/conversation': () => reply({ status: 'awaiting_confirmation', proposal: proposal(null) }),
          [`POST /assistant/proposals/${PROPOSAL_ID}/confirm`]: () => {
            horizon = 90; // what the confirmed change did
            return reply({ proposal: proposal('done'), messages: [said(2, 'assistant', 'Changed.')] });
          },
        },
        () => settings({ bookingHorizonDays: horizon }),
      );
      mounted(ADMIN);
      const horizonField = () => find<HTMLInputElement>('#settings [name="bookingHorizonDays"]');
      await vi.waitFor(() => expect(horizonField().value).toBe('56'));
      await openPanel();
      find<HTMLInputElement>('#settings [name="cancellationNoticeHours"]').value = '99'; // typed, not saved
      one('.confirm').click();
      await vi.waitFor(() => expect(horizonField().value).toBe('90'));
      expect(count('GET /calendar/settings')).toBe(2);
      expect(find<HTMLInputElement>('#settings [name="cancellationNoticeHours"]').value).toBe('24');
      expect(find('#settings form.settings').hidden).toBe(false);

      // Leaving the settings ends what was started for them: nothing is read behind the week.
      links()[0]!.click();
      await weekDrawn();
      expect(count('GET /calendar/settings')).toBe(2);
    });

    it('a change confirmed with the availability on show: its lists are read again', async () => {
      at('#/availability');
      api({
        'GET /assistant/conversation': () => reply({ status: 'awaiting_confirmation', proposal: proposal(null) }),
        [`POST /assistant/proposals/${PROPOSAL_ID}/confirm`]: () => reply({ proposal: proposal('done'), messages: [said(2, 'assistant', 'Created.')] }),
      });
      mounted(ADMIN);
      await vi.waitFor(() => expect([count('GET /calendar/types'), count('GET /calendar/patterns')]).toEqual([1, 1]));
      await openPanel();
      one('.confirm').click();
      await vi.waitFor(() => expect([count('GET /calendar/types'), count('GET /calendar/patterns')]).toEqual([2, 2]));
    });

    it('ending the shell takes the panel with it', async () => {
      api({ 'GET /assistant/conversation': () => reply({ messages: [said(1, 'person', 'hello')] }) });
      mounted(ALICE);
      field().focus();
      await vi.waitFor(() => expect(texts()).toEqual(['hello']));
      shell?.unsubscribe();
      expect([panel().hidden, texts(), panel().classList.contains('open')]).toEqual([true, [], false]);
    });
  });
});

// "My details", the screen before the password for both roles (docs/EMAIL_ARCHITECTURE.md
// section 11), with the real MeService and UsersService of the session behind the stubbed fetch.
describe('"My details", for both roles', () => {
  useRealPage();

  const ADA = { username: 'admin', role: 'admin', givenName: 'Ada', familyName: 'Lovelace', email: 'ada@example.com', address: 'Via dei Calcoli 1' };
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#me ${selector}`);
  const values = () => [...document.querySelectorAll('#me .details dd')].map((value) => value.textContent);
  const sent = () => (fetchMock.mock.calls as [string, RequestInit][]).filter(([url]) => url.startsWith(CONFIG.apiUrl)).map(([url, init]) => `${init.method} ${url.slice(CONFIG.apiUrl.length)}`);
  const links = () => [...document.querySelectorAll<HTMLAnchorElement>('#app .nav a')];
  const at = (hash: string) => window.history.replaceState(null, '', `${window.location.pathname}${hash}`);

  it('is the row just before the password, for both roles, at #/me', () => {
    const row = SCREENS.at(-2)!;
    expect([row.hash, row.label, row.roles, row.element]).toEqual(['#/me', 'My details', ['admin', 'user'], '#me']);
  });

  it('a User on #/me: one GET /me with the person\'s token, the details shown, no Edit, and the sentence that says whom to ask', async () => {
    at('#/me');
    fetchMock.mockResolvedValueOnce(json(200, { username: 'alice', role: 'user', givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Piazza 7' }));
    mounted(ALICE);
    expect(links().at(-2)!.getAttribute('aria-current')).toBe('page');
    await vi.waitFor(() => expect(one('.details').hidden).toBe(false));
    expect(apiCalls()).toEqual([['http://api.test/me', 'Bearer access-token-alice']]);
    expect(values()).toEqual(['alice', 'User', 'Alice', 'Liddell', 'alice@example.com', 'Piazza 7']);
    expect([one('.ask-edit').hidden, one('.user-only').hidden]).toEqual([true, false]);
  });

  it('the Administrator without facts yet: "Not set"; Edit, Save: the PUT on the own account, the dialog closed, the details read again', async () => {
    at('#/me');
    fetchMock.mockResolvedValueOnce(json(200, { username: 'admin', role: 'admin', givenName: null, familyName: null, email: null, address: null }));
    mounted(ADMIN);
    await vi.waitFor(() => expect(one('.details').hidden).toBe(false));
    expect(values().slice(2)).toEqual(['Not set', 'Not set', 'Not set', 'Not set']);
    one('.ask-edit').click();
    expect(one<HTMLDialogElement>('dialog.edit').open).toBe(true);
    for (const [name, value] of Object.entries({ givenName: 'Ada', familyName: 'Lovelace', email: 'Ada@Example.com', address: 'Via dei Calcoli 1' })) one<HTMLInputElement>(`dialog.edit [name="${name}"]`).value = value;
    fetchMock.mockResolvedValueOnce(json(200, { ...ADA, createdAt: '2026-11-01T10:00:00.000Z', status: 'active' }));
    fetchMock.mockResolvedValueOnce(json(200, ADA));
    submit(one<HTMLFormElement>('dialog.edit form'));
    await vi.waitFor(() => expect(values()).toEqual(['admin', 'Administrator', 'Ada', 'Lovelace', 'ada@example.com', 'Via dei Calcoli 1']));
    expect(one<HTMLDialogElement>('dialog.edit').open).toBe(false);
    expect(sent()).toEqual(['GET /me', 'PUT /users/admin', 'GET /me']);
    const put = (fetchMock.mock.calls as [string, RequestInit][])[1]![1];
    expect(JSON.parse(String(put.body))).toEqual({ givenName: 'Ada', familyName: 'Lovelace', email: 'ada@example.com', address: 'Via dei Calcoli 1' });
  });

  it('signing out leaves no fact of the person in the page', async () => {
    at('#/me');
    fetchMock.mockResolvedValueOnce(json(200, ADA));
    const { store } = mounted(ADMIN);
    await vi.waitFor(() => expect(values()[2]).toBe('Ada'));
    one('.ask-edit').click();
    store.clear();
    expect(one<HTMLDialogElement>('dialog.edit').open).toBe(false);
    for (const gone of ['Lovelace', 'ada@example.com', 'Calcoli']) expect(document.documentElement.outerHTML.includes(gone) || [...document.querySelectorAll<HTMLInputElement>('input, textarea')].some((field) => field.value.includes(gone)), gone).toBe(false);
  });
});

describe('the password, the last screen of both roles', () => {
  useRealPage();

  const CURRENT = 'Current-Pass-1!';
  const NEXT = 'Next-Password-2?';
  const target = (init: RequestInit) => (init.headers as Record<string, string>)['X-Amz-Target']!.split('.').at(-1);
  // The requests of the change, without the RevokeToken of a "Sign out".
  const changeCalls = () =>
    cognitoCalls()
      .map(([, init]) => [target(init), JSON.parse(init.body as string).AccessToken])
      .filter(([name]) => name !== 'RevokeToken');
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#password ${selector}`);
  const links = () => [...document.querySelectorAll<HTMLAnchorElement>('#app .nav a')];

  // The shell with the page-wide services as spies, and the configuration of the test.
  function shown(who: Session, skipGlobalSignOut?: boolean) {
    const store = new SessionStore();
    store.set(who);
    const state$ = new BehaviorSubject<LoginState>({ status: 'idle' });
    const login: LoginDeps = { loginState$: state$.asObservable(), login: vi.fn<LoginDeps['login']>() };
    const pageWide = [{ reset: vi.fn() }, { reset: vi.fn() }];
    // What the store holds when each page-wide service is put back: the person, still signed in.
    const atReset: (Session | null)[] = [];
    pageWide[0]!.reset.mockImplementation(() => {
      void firstValueFrom(store.session$).then((s) => atReset.push(s));
    });
    const config = skipGlobalSignOut === undefined ? CONFIG : { ...CONFIG, skipGlobalSignOut };
    shell = mountShell(document.body, { config, store, login, logout: new LogoutService(CONFIG, store, []), pageWide });
    window.location.hash = '#/password';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return { store, pageWide, atReset };
  }

  const fill = (current = CURRENT, next = NEXT, again = NEXT) => {
    one<HTMLInputElement>('[name="current"]').value = current;
    one<HTMLInputElement>('[name="next"]').value = next;
    one<HTMLInputElement>('[name="again"]').value = again;
    one('form.change-password').dispatchEvent(new Event('input', { bubbles: true }));
  };
  const answerCognito = (...answers: (() => Response)[]) => {
    fetchMock.mockImplementation(async (url: string) => (url === CONFIG.cognitoUrl ? answers.shift()!() : unanswered()));
  };
  const ok = () => json(200, {}, 'application/x-amz-json-1.1');

  it('is the last row of the table, for both roles, at #/password', () => {
    const row = SCREENS.at(-1)!;
    expect([row.hash, row.label, row.roles, row.element]).toEqual(['#/password', 'Password', ['admin', 'user'], '#password']);
  });

  it.each([
    ['a User', ALICE],
    ['the Administrator', ADMIN],
  ])('%s on #/password: the address stays, its link is the last and the one marked, the form is shown and nothing is asked', (_name, who) => {
    shown(who);
    expect(window.location.hash).toBe('#/password');
    expect(links().at(-1)!.textContent).toBe('Password');
    expect(links().at(-1)!.getAttribute('aria-current')).toBe('page');
    expect(find('#password').hidden).toBe(false);
    expect(find('#week').hidden).toBe(true);
    expect(cognitoCalls()).toHaveLength(0);
    expect(one<HTMLButtonElement>('.submit').disabled).toBe(true);
  });

  it('the hints follow the typing; the two new passwords that differ are said and the button stays disabled', () => {
    shown(ALICE);
    fill(CURRENT, 'Next', '');
    expect([...document.querySelectorAll('#password .needs li')].map((li) => li.textContent)).toEqual(['At least 12 characters.', 'A digit, 0 to 9.', expect.stringMatching(/^One of these symbols/)]);
    fill(CURRENT, NEXT, 'Next-Password-2');
    expect(one('.again-field .hint').textContent).toBe('The two new passwords are not the same.');
    expect(one<HTMLButtonElement>('.submit').disabled).toBe(true);
    fill();
    expect(one<HTMLButtonElement>('.submit').disabled).toBe(false);
  });

  it.each([
    ['a User', ALICE],
    ['the Administrator', ADMIN],
  ])('a change by %s: ChangePassword and GlobalSignOut with the person\'s own token, the page-wide services put back while still signed in, then the login says "Password changed"', async (_name, who) => {
    const { store, pageWide, atReset } = shown(who);
    answerCognito(ok, ok);
    fill();
    one<HTMLButtonElement>('.submit').click();
    expect(one<HTMLButtonElement>('.submit').disabled).toBe(true); // pending
    await vi.waitFor(() => expect(find('#login').hidden).toBe(false));
    expect(changeCalls()).toEqual([
      ['ChangePassword', who.accessToken],
      ['GlobalSignOut', who.accessToken],
    ]);
    expect(pageWide.map((service) => service.reset.mock.calls.length)).toEqual([1, 1]);
    await vi.waitFor(() => expect(atReset).toEqual([who]));
    expect(await firstValueFrom(store.session$)).toBeNull();
    expect(find('#app').hidden).toBe(true);
    expect(find('#login .notice').textContent).toBe('Password changed.');
    // Nothing of the change is left in the page: the three fields empty, no password anywhere.
    expect(['current', 'next', 'again'].map((name) => one<HTMLInputElement>(`[name="${name}"]`).value)).toEqual(['', '', '']);
    for (const secret of [CURRENT, NEXT, ...TOKENS]) expect(html()).not.toContain(secret);
  });

  it('the notice is said once: gone at the next "Sign in", and not said after the next sign-out', async () => {
    const { store } = shown(ALICE);
    answerCognito(ok, ok);
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(find('#login .notice').textContent).toBe('Password changed.'));
    submit(find<HTMLFormElement>('#login form'));
    expect(find('#login .notice').textContent).toBe('');
    store.set(ALICE);
    find<HTMLButtonElement>('#app .sign-out').click();
    expect(find('#login').hidden).toBe(false);
    expect(find('#login .notice').textContent).toBe('');
  });

  it('with skipGlobalSignOut true, as against the local stack: ChangePassword alone, and the same success', async () => {
    shown(ALICE, true);
    answerCognito(ok);
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(find('#login .notice').textContent).toBe('Password changed.'));
    expect(changeCalls()).toEqual([['ChangePassword', ALICE.accessToken]]);
  });

  it('with skipGlobalSignOut false, as in a build for the cloud: the sign-out everywhere is sent', async () => {
    shown(ALICE, false);
    answerCognito(ok, ok);
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(cognitoCalls()).toHaveLength(2));
    expect(changeCalls().map(([name]) => name)).toEqual(['ChangePassword', 'GlobalSignOut']);
  });

  it('a wrong current password: said under the field, the three fields emptied, the person still signed in and nothing put back', async () => {
    const { store, pageWide } = shown(ALICE);
    answerCognito(() => cognitoError('NotAuthorizedException', 'Incorrect username or password.'));
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(one('.current-field .refusal').textContent).toBe('The current password is not correct.'));
    expect(['current', 'next', 'again'].map((name) => one<HTMLInputElement>(`[name="${name}"]`).value)).toEqual(['', '', '']);
    expect(await firstValueFrom(store.session$)).toBe(ALICE);
    expect(pageWide[0]!.reset).not.toHaveBeenCalled();
    expect(changeCalls()).toEqual([['ChangePassword', ALICE.accessToken]]);
  });

  it('each person has a service of their own: a second person\'s change carries that person\'s token, and the first one\'s failure is not shown to them', async () => {
    const { store } = shown(ALICE);
    answerCognito(() => cognitoError('LimitExceededException', 'Attempt limit exceeded'));
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(one('form.change-password .failure').textContent).not.toBe(''));
    find<HTMLButtonElement>('#app .sign-out').click();
    store.set(ADMIN);
    window.location.hash = '#/password';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(one('form.change-password .failure').textContent).toBe('');
    answerCognito(ok, ok);
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(find('#login .notice').textContent).toBe('Password changed.'));
    expect(changeCalls().map(([, token]) => token)).toEqual([ALICE.accessToken, ADMIN.accessToken, ADMIN.accessToken]);
  });

  it('signing out with the three fields typed in and a failure on show leaves nothing in the page', async () => {
    shown(ALICE);
    answerCognito(() => json(500, { __type: 'InternalErrorException', message: 'boom' }));
    fill();
    one<HTMLButtonElement>('.submit').click();
    await vi.waitFor(() => expect(one('form.change-password .failure').textContent).not.toBe(''));
    fill();
    find<HTMLButtonElement>('#app .sign-out').click();
    expect(find('#password').hidden).toBe(true);
    expect(['current', 'next', 'again'].map((name) => one<HTMLInputElement>(`[name="${name}"]`).value)).toEqual(['', '', '']);
    expect(document.querySelectorAll('#password .needs li')).toHaveLength(0);
    for (const selector of ['.current-field .hint', '.again-field .hint', 'form.change-password .failure']) expect(one(selector).textContent, selector).toBe('');
    for (const secret of [CURRENT, NEXT]) expect(html()).not.toContain(secret);
  });

  it('leaving the screen for the week empties the three fields', async () => {
    shown(ALICE);
    fill();
    links()[0]!.click();
    await vi.waitFor(() => expect(find('#password').hidden).toBe(true));
    expect(['current', 'next', 'again'].map((name) => one<HTMLInputElement>(`[name="${name}"]`).value)).toEqual(['', '', '']);
  });
});
