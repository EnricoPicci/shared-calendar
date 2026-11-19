import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import type { LoginState, Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import type { LoginDeps } from '../../../src/views/login.view';
import { mountShell, runShell, SCREENS, type Screen } from '../../../src/views/shell';
import { appointment, STUDIO, view, winterWeek } from '../logic/fixtures';
import { call, cognitoError, cognitoTokens, json, jwt, session } from '../services/fixtures';
import { find, submit, useRealPage } from './page';

// The DOM test of the shell (docs/FRONTEND_ARCHITECTURE.md sections 6 and 8): the real
// index.html, the real SessionStore (memory only, no remote call), a fake LoginService, and the
// global fetch a stub: entering the frame creates the real API services, whose first call
// stays unanswered unless a test answers it.

const CONFIG = { apiUrl: 'http://api.test', cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
// A call that is never answered.
const unanswered = () => new Promise<Response>(() => {});

const ALICE = session();
const ADMIN = session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin', idToken: 'id-token-admin', refreshToken: 'refresh-token-admin' });
const TOKENS = [ALICE, ADMIN].flatMap((s) => [s.accessToken, s.idToken, s.refreshToken]);

const html = () => document.documentElement.outerHTML;

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
  shell = mountShell(document.body, { config: CONFIG, store, login, ...(screens ? { screens } : {}) });
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
    ['a User', ALICE, 'access-token-alice', [['Week', '#/week', 'page'], ['My appointments', '#/appointments', null]]],
    ['the Administrator', ADMIN, 'access-token-admin', [['Week', '#/week', 'page']]],
  ])('the first screen of %s is the week: the address, the links of the role with the week\'s marked, the week of today loaded', async (_name, who, token, navigation) => {
    fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
    const { store } = mounted();
    expect(links()).toHaveLength(0);
    expect(find('#week').hidden).toBe(true);

    store.set(who);
    expect(window.location.hash).toBe('#/week');
    expect(links().map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual(navigation);
    expect(find('#week').hidden).toBe(false);
    expect(find('#appointments').hidden).toBe(true);
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
    expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments']);
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

      await vi.waitFor(() => expect(find('#week dialog.book .error').textContent).toBe('This time has just been taken. The calendar has been refreshed: please choose another time.'));
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

      fetchMock.mockResolvedValueOnce(json(200, { users: [{ username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' }, { username: 'bob', createdAt: '2026-11-02T10:00:00.000Z' }] }));
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

      fetchMock.mockResolvedValueOnce(json(200, { users: [{ username: 'carol', createdAt: '2026-11-01T10:00:00.000Z' }] }));
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
      const fields = [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map((field) => field.value);
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
        ['Other', '#/other'],
      ]);
      // "My appointments" is in the table before it, and is not the Administrator's.
      shell?.unsubscribe();
      mounted(ALICE, screens);
      expect(links().map((a) => a.textContent)).toEqual(['Week', 'My appointments']);
    });

    it('a change of address leaves the screen on show and mounts the next; the link marked follows', async () => {
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      const { screens, show, left } = other();
      mounted(ADMIN, screens);
      await weekDrawn();
      expect(current()).toEqual([['Week', 'page'], ['Other', null]]);

      window.location.hash = '#/other';
      await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
      expect(show.mock.calls[0]![0]).toBe(find('#week'));
      expect(days()).toHaveLength(0); // the week view was left, and cleaned up after itself
      expect(find('#week').hidden).toBe(false); // the element is the other screen's now
      expect(current()).toEqual([['Week', null], ['Other', 'page']]);
      expect(left).not.toHaveBeenCalled();

      // Back: the other screen is left, the week mounted and loaded again.
      fetchMock.mockResolvedValueOnce(json(200, winterWeek()));
      links()[0]!.click();
      await weekDrawn();
      expect(left).toHaveBeenCalledTimes(1);
      expect(current()).toEqual([['Week', 'page'], ['Other', null]]);
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
          slots: [{ start: '2026-12-07T07:00:00.000Z', end: '2026-12-07T08:00:00.000Z', typeId: STUDIO }],
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
      expect(current()).toEqual([['Week', null], ['My appointments', 'page']]);
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
      expect(current()).toEqual([['Week', 'page']]);
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
      expect(current()).toEqual([['Week', 'page'], ['My appointments', null]]);
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
      expect(current()).toEqual([['Week', null], ['My appointments', 'page']]);
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
      expect(document.querySelectorAll('#app .nav a')).toHaveLength(2);

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
      const fields = [...document.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>('textarea, select, input')].map((field) => field.value);
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
});
