import { BehaviorSubject } from 'rxjs';
import type { LoginState } from '../../../src/services/login.types';
import { mountLogin, type LoginDeps } from '../../../src/views/login.view';
import { find, submit, useRealPage } from './page';
import { PageLanguage } from '../../../src/logic/language';
import { fillPage } from '../../../src/views/page-texts';
import { PAGE_TEXTS } from '../../../src/texts/texts';

// The DOM test of the login view (docs/FRONTEND_ARCHITECTURE.md section 8): the real index.html,
// and a fake LoginService whose state stream the test controls and whose method is a spy.

const PASSWORD = 'Secret-Pass-1!';

// The page's language, English first, with a browser's memory whose writes the test sees; the
// page's fixed texts filled again at each change, as the shell does.
function pageLanguage() {
  const memory = { read: () => null, write: vi.fn() };
  const language = new PageLanguage('en', (code) => PAGE_TEXTS[code], memory);
  language.state$.subscribe((state) => fillPage(document, state.texts.html, state.language));
  return { language, memory };
}

function mounted(first: LoginState = { status: 'idle' }) {
  const state$ = new BehaviorSubject<LoginState>(first);
  const login = { loginState$: state$.asObservable(), login: vi.fn<LoginDeps['login']>() };
  const root = find('#login');
  const { language, memory } = pageLanguage();
  const subscription = mountLogin(root, login, language);
  return {
    state$,
    login,
    root,
    language,
    memory,
    subscription,
    choice: find('#login label.language'),
    languages: find<HTMLSelectElement>('#login [name="language"]'),
    form: find<HTMLFormElement>('#login form.sign-in'),
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
    const { language } = pageLanguage();
    const subscription = mountLogin(find('#login'), login, language, (texts) => texts.password.changed);
    const notice = find('#login .notice');
    expect(notice.textContent).toBe('Password changed.');
    submit(find<HTMLFormElement>('#login form'));
    expect(notice.textContent).toBe('');
    subscription.unsubscribe();
    const again = mountLogin(find('#login'), login, language, (texts) => texts.password.changed);
    again.unsubscribe();
    expect(notice.textContent).toBe('');
  });

  it('a new password asked for: the sign-in form hidden, the temporary password wiped, the username kept', () => {
    const { state$, form, username, password } = mounted();
    username.value = 'anna';
    password.value = PASSWORD;
    state$.next({ status: 'pending', username: 'anna' });
    state$.next({ status: 'new_password_required', username: 'anna' });
    expect(form.hidden).toBe(true);
    expect([username.value, password.value]).toEqual(['anna', '']);
    password.value = 'typed meanwhile';
    state$.next({ status: 'answering', username: 'anna' });
    expect(form.hidden).toBe(true);
    expect(password.value).toBe('typed meanwhile'); // wiped once, on the way in
  });

  it('back from "Choose your password" (the 3 minutes over): the form with the username, its sentence, the keyboard on the password', () => {
    const { state$, form, username, password, error } = mounted();
    username.value = 'anna';
    state$.next({ status: 'new_password_required', username: 'anna' });
    state$.next({ status: 'failure', reason: 'session_expired', message: 'Invalid session for the user, session is expired.' });
    expect(form.hidden).toBe(false);
    expect(username.value).toBe('anna');
    expect(error.textContent).toBe('This took too long. Please sign in again.');
    expect(document.activeElement).toBe(password);
  });

  it('back by Cancel: the form, no sentence, the keyboard on the password', () => {
    const { state$, form, password, error } = mounted();
    expect(document.activeElement).not.toBe(password);
    state$.next({ status: 'new_password_required', username: 'anna' });
    state$.next({ status: 'idle' });
    expect(form.hidden).toBe(false);
    expect(error.textContent).toBe('');
    expect(document.activeElement).toBe(password);
  });

  it('back from "Choose your password": the keyboard is given to the password once its form is shown', () => {
    const { state$, form, password } = mounted();
    state$.next({ status: 'new_password_required', username: 'anna' });
    // happy-dom lets a field of a hidden form take the keyboard, a browser does not: so the test
    // looks at whether the form was shown when the field was given it.
    const shownAtFocus: boolean[] = [];
    password.addEventListener('focus', () => shownAtFocus.push(!form.hidden));
    state$.next({ status: 'idle' });
    expect(shownAtFocus).toEqual([true]);
  });

  it('left while a new password is asked for: the form is shown again for the next time', () => {
    const { state$, form, subscription } = mounted();
    state$.next({ status: 'new_password_required', username: 'anna' });
    subscription.unsubscribe();
    expect(form.hidden).toBe(false);
  });

  it('without a notice the place stays empty', () => {
    mounted();
    expect(find('#login .notice').textContent).toBe('');
  });

  // The choice of language before sign-in (docs/MULTILANGUAGE_PLAN.md finding F4).
  describe('the choice of language', () => {
    const choose = (languages: HTMLSelectElement, code: string) => {
      languages.value = code;
      languages.dispatchEvent(new Event('change'));
    };

    it('offers each language under its own name, marked as being in it, the one in use chosen', () => {
      const { languages } = mounted();
      expect([...languages.options].map((option) => [option.value, option.textContent, option.lang])).toEqual([
        ['en', 'English', 'en'],
        ['it', 'Italiano', 'it'],
      ]);
      expect(languages.value).toBe('en');
    });

    it('Italian chosen: the page in Italian, what was typed kept, the failure line worded again, the choice remembered', () => {
      const { state$, languages, username, password, error, memory } = mounted();
      username.value = 'anna';
      password.value = PASSWORD;
      state$.next({ status: 'failure', reason: 'invalid_credentials', message: 'Incorrect username or password.' });
      expect(error.textContent).toBe('The username or the password is not correct.');
      choose(languages, 'it');
      expect(error.textContent).toBe('Il nome utente o la password non sono corretti.');
      expect(find('#login button').textContent).toBe('Accedi');
      expect(document.documentElement.lang).toBe('it');
      expect([username.value, password.value, languages.value]).toEqual(['anna', PASSWORD, 'it']);
      expect(memory.write).toHaveBeenCalledWith('it');
    });

    it('the notice is worded again in the language chosen', () => {
      const state$ = new BehaviorSubject<LoginState>({ status: 'idle' });
      const { language } = pageLanguage();
      const subscription = mountLogin(find('#login'), { loginState$: state$.asObservable(), login: vi.fn() }, language, (texts) => texts.password.changed);
      choose(find<HTMLSelectElement>('#login [name="language"]'), 'it');
      expect(find('#login .notice').textContent).toBe('Password modificata.');
      subscription.unsubscribe();
    });

    it('a value that is no language of the calendar changes nothing', () => {
      const { languages, language, memory } = mounted();
      languages.append(Object.assign(document.createElement('option'), { value: 'tlh', textContent: 'Klingon' }));
      choose(languages, 'tlh');
      expect(language.state.language).toBe('en');
      expect(memory.write).not.toHaveBeenCalled();
    });

    it('is not offered while "Choose your password" is on show, and is again on the way back', () => {
      const { state$, choice } = mounted();
      expect(choice.hidden).toBe(false);
      state$.next({ status: 'new_password_required', username: 'anna' });
      expect(choice.hidden).toBe(true);
      state$.next({ status: 'idle' });
      expect(choice.hidden).toBe(false);
    });

    it('left: the list emptied and shown, no language chosen any more by it', () => {
      const { state$, subscription, choice, languages, language } = mounted();
      state$.next({ status: 'new_password_required', username: 'anna' });
      subscription.unsubscribe();
      expect([choice.hidden, languages.options.length]).toEqual([false, 0]);
      languages.append(Object.assign(document.createElement('option'), { value: 'it', textContent: 'Italiano' }));
      choose(languages, 'it');
      expect(language.state.language).toBe('en');
    });
  });
});
