import { BehaviorSubject } from 'rxjs';
import type { LoginState } from '../../../src/services/login.types';
import { mountLogin, type LoginDeps } from '../../../src/views/login.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the login view (docs/FRONTEND_ARCHITECTURE.md section 8): the real index.html,
// and a fake LoginService whose state stream the test controls and whose method is a spy.

const PASSWORD = 'Secret-Pass-1!';

function mounted(first: LoginState = { status: 'idle' }) {
  const state$ = new BehaviorSubject<LoginState>(first);
  const login = { loginState$: state$.asObservable(), login: vi.fn<LoginDeps['login']>() };
  const root = find('#login');
  const subscription = mountLogin(root, login);
  return {
    state$,
    login,
    root,
    subscription,
    form: find<HTMLFormElement>('#login form'),
    username: find<HTMLInputElement>('#login [name="username"]'),
    password: find<HTMLInputElement>('#login [name="password"]'),
    button: find<HTMLButtonElement>('#login button'),
    error: find('#login .error'),
  };
}

describe('mountLogin', () => {
  useRealPage();

  it('idle: the button can be pressed and there is no error', () => {
    const { button, error } = mounted();
    expect(button.disabled).toBe(false);
    expect(error.textContent).toBe('');
  });

  it('pending: the button is disabled, and what was typed stays', () => {
    const { state$, username, password, button, error } = mounted();
    username.value = 'alice';
    password.value = PASSWORD;
    state$.next({ status: 'pending', username: 'alice' });
    expect(button.disabled).toBe(true);
    expect(error.textContent).toBe('');
    expect([username.value, password.value]).toEqual(['alice', PASSWORD]);
  });

  it('failure: the reason is shown in plain words, the button is enabled again and the form is still usable', () => {
    const { state$, login, form, username, password, button, error } = mounted();
    username.value = 'alice';
    password.value = 'wrong';
    state$.next({ status: 'pending', username: 'alice' });
    state$.next({ status: 'failure', reason: 'invalid_credentials', message: 'Incorrect username or password.' });
    expect(button.disabled).toBe(false);
    // The sentence of the logic layer for the reason, not the service's message.
    expect(error.textContent).toBe('The username or the password is not correct.');
    expect(error.getAttribute('role')).toBe('alert'); // announced to a screen reader
    expect(username.value).toBe('alice'); // the name is kept for the second try

    password.value = PASSWORD;
    submit(form);
    expect(login.login).toHaveBeenLastCalledWith('alice', PASSWORD);
  });

  it('a new attempt after a failure removes the message', () => {
    const { state$, error } = mounted({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
    expect(error.textContent).toBe('The server cannot be reached. Check the connection and try again.');
    state$.next({ status: 'pending', username: 'alice' });
    expect(error.textContent).toBe('');
  });

  it('success: no error, the button enabled; the screen is changed by the shell, not by the view', () => {
    const { state$, root, button, error } = mounted();
    state$.next({ status: 'pending', username: 'alice' });
    state$.next({ status: 'success', username: 'alice', role: 'user', expiresAt: new Date(Date.now() + 900_000) });
    expect(button.disabled).toBe(false);
    expect(error.textContent).toBe('');
    expect(root.hidden).toBe(true); // as index.html has it: the view never shows or hides itself
  });

  it('submit calls login with what was typed, once, and does not let the browser reload the page', () => {
    const { login, form, username, password } = mounted();
    username.value = 'alice';
    password.value = PASSWORD;
    const { prevented } = submit(form);
    expect(prevented).toBe(true);
    expect(login.login).toHaveBeenCalledTimes(1);
    expect(login.login).toHaveBeenCalledWith('alice', PASSWORD);
  });

  it('a click on "Sign in" submits the form', () => {
    const { login, username, password, button } = mounted();
    username.value = 'admin';
    password.value = PASSWORD;
    button.click();
    expect(login.login).toHaveBeenCalledWith('admin', PASSWORD);
  });

  it('the handler changes nothing on screen: the button is disabled only when the stream says pending', () => {
    const { form, username, password, button } = mounted();
    username.value = 'alice';
    password.value = PASSWORD;
    submit(form);
    expect(button.disabled).toBe(false);
  });

  it('the service\'s message never reaches the page, with or without <script> in it', () => {
    const message = '<script>window.hacked = true</script><b>bold</b>';
    const { state$, error } = mounted();
    state$.next({ status: 'failure', reason: 'unexpected', message });
    expect(error.textContent).toBe('Something went wrong. Please try again.');
    expect(error.children).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);
    expect(document.documentElement.outerHTML).not.toContain('hacked');
  });

  it('the password never leaves the field: it is in no text and no attribute of the page', () => {
    const { state$, form, username, password } = mounted();
    username.value = 'alice';
    password.value = PASSWORD;
    submit(form);
    state$.next({ status: 'pending', username: 'alice' });
    state$.next({ status: 'failure', reason: 'invalid_credentials', message: 'Incorrect username or password.' });
    expect(document.documentElement.outerHTML).not.toContain(PASSWORD);
  });

  it('after unsubscribing the form is empty, the error gone and the stream no longer heard', () => {
    const { state$, subscription, username, password, button, error } = mounted();
    username.value = 'alice';
    password.value = PASSWORD;
    state$.next({ status: 'failure', reason: 'invalid_credentials', message: 'Incorrect username or password.' });

    subscription.unsubscribe();
    expect([username.value, password.value]).toEqual(['', '']);
    expect(error.textContent).toBe('');

    state$.next({ status: 'pending', username: 'alice' });
    state$.next({ status: 'failure', reason: 'network', message: 'late' });
    expect(button.disabled).toBe(false);
    expect(error.textContent).toBe('');
  });

  it('mounted again on the same element, it listens to the new service only', () => {
    const first = mounted();
    first.subscription.unsubscribe();
    const second = mounted();
    second.username.value = 'admin';
    second.password.value = PASSWORD;
    submit(second.form);
    expect(first.login.login).not.toHaveBeenCalled();
    expect(second.login.login).toHaveBeenCalledWith('admin', PASSWORD);
  });

  it('a notice given by the shell is said until the next "Sign in", and gone when the view is left', () => {
    const state$ = new BehaviorSubject<LoginState>({ status: 'idle' });
    const login = { loginState$: state$.asObservable(), login: vi.fn<LoginDeps['login']>() };
    const subscription = mountLogin(find('#login'), login, 'Password changed.');
    const notice = find('#login .notice');
    expect(notice.textContent).toBe('Password changed.');
    submit(find<HTMLFormElement>('#login form'));
    expect(notice.textContent).toBe('');
    subscription.unsubscribe();
    const again = mountLogin(find('#login'), login, 'Password changed.');
    again.unsubscribe();
    expect(notice.textContent).toBe('');
  });

  it('without a notice the place stays empty', () => {
    mounted();
    expect(find('#login .notice').textContent).toBe('');
  });
});
