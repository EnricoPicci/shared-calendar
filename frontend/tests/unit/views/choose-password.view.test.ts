import { BehaviorSubject } from 'rxjs';
import type { ChoosePasswordState } from '../../../src/logic/choose-password.screen';


import { mountChoosePassword, type ChoosePasswordDeps } from '../../../src/views/choose-password.view';
import { find, submit, useRealPage } from './page';
import { EMPTY_NEW_HINTS, PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS } from '../logic/password.words';

// The DOM test of the view "Choose your password" (docs/FRONTEND_ARCHITECTURE.md section 8): the
// real index.html, and a fake ChoosePasswordScreen whose stream the test controls and whose
// methods are spies. The passwords are made-up texts.

const NEXT = 'Next-Password-2?';
const CLOSED: ChoosePasswordState = { username: null, hints: EMPTY_NEW_HINTS, pending: false, blocked: true, failure: null, emptied: {} };

function mounted(first: ChoosePasswordState = CLOSED) {
  const state$ = new BehaviorSubject<ChoosePasswordState>(first);
  const screen = {
    choose$: state$.asObservable(),
    typed: vi.fn<ChoosePasswordDeps['typed']>(),
    choose: vi.fn<ChoosePasswordDeps['choose']>(),
    cancel: vi.fn<ChoosePasswordDeps['cancel']>(),
  };
  const subscription = mountChoosePassword(find('#login'), screen);
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#login ${selector}`);
  const next = (change: Partial<ChoosePasswordState>) => state$.next({ ...state$.getValue(), ...change });
  const open = () => next({ username: 'anna', emptied: {} });
  const fill = (again = NEXT) => {
    one<HTMLInputElement>('.new-password [name="next"]').value = NEXT;
    one<HTMLInputElement>('.new-password [name="again"]').value = again;
  };
  const values = () => ['next', 'again'].map((name) => one<HTMLInputElement>(`.new-password [name="${name}"]`).value);
  return {
    state$,
    screen,
    subscription,
    one,
    next,
    open,
    fill,
    values,
    section: one('.first-password'),
    form: one<HTMLFormElement>('form.new-password'),
    submitButton: one<HTMLButtonElement>('.new-password .submit'),
    needs: () => [...document.querySelectorAll('#login .new-password .needs li')].map((li) => li.textContent),
  };
}

describe('mountChoosePassword', () => {
  useRealPage();

  it('closed: the screen hidden', () => {
    const { section } = mounted();
    expect(section.hidden).toBe(true);
  });

  it('opened: shown with the account, the hints of two empty fields, the button disabled, the keyboard on the new password', () => {
    const { open, section, one, needs, submitButton } = mounted();
    open();
    expect(section.hidden).toBe(false);
    expect(one('.first-password .account').textContent).toBe('anna');
    expect(needs()).toEqual(EMPTY_NEW_HINTS.next);
    expect(one('.new-password .again-field .hint').textContent).toBe(PASSWORD_TEXTS.againEmpty);
    expect(submitButton.disabled).toBe(true);
    expect(document.activeElement).toBe(one('.new-password [name="next"]'));
  });

  it('every keystroke hands the two fields to the screen', () => {
    const { open, fill, form, screen } = mounted();
    open();
    fill('Next');
    form.dispatchEvent(new Event('input', { bubbles: true }));
    expect(screen.typed).toHaveBeenCalledWith({ next: NEXT, again: 'Next' });
  });

  it('the hints follow the stream; the list of what is missing is redrawn only when it changes', () => {
    const { open, next, one, needs, submitButton } = mounted();
    open();
    next({ hints: { next: [PASSWORD_PROBLEM_TEXT.no_digit], again: PASSWORD_TEXTS.differ } });
    expect(needs()).toEqual([PASSWORD_PROBLEM_TEXT.no_digit]);
    const item = one('.new-password .needs li');
    next({ failure: null });
    expect(one('.new-password .needs li')).toBe(item);
    expect(one('.new-password .again-field .hint').textContent).toBe(PASSWORD_TEXTS.differ);
    next({ hints: { next: [], again: null }, blocked: false });
    expect(needs()).toEqual([]);
    expect(one('.new-password .again-field .hint').textContent).toBe('');
    expect(submitButton.disabled).toBe(false);
  });

  it('"Choose password": the two fields to the screen, and the browser does not send the form', () => {
    const { open, fill, form, screen } = mounted();
    open();
    fill();
    expect(submit(form).prevented).toBe(true);
    expect(screen.choose).toHaveBeenCalledWith({ next: NEXT, again: NEXT });
  });

  it('"Cancel": the screen is told, nothing is sent', () => {
    const { open, one, screen } = mounted();
    open();
    one<HTMLButtonElement>('.new-password .cancel').click();
    expect(screen.cancel).toHaveBeenCalledOnce();
    expect(screen.choose).not.toHaveBeenCalled();
  });

  it('a failure: its sentence under the form, announced; the fields kept', () => {
    const { open, next, fill, values, one } = mounted();
    open();
    fill();
    next({ failure: 'This password was not accepted. Please choose another one.' });
    const failure = one('.new-password .failure');
    expect(failure.textContent).toBe('This password was not accepted. Please choose another one.');
    expect(failure.getAttribute('role')).toBe('alert');
    expect(values()).toEqual([NEXT, NEXT]);
  });

  it('closed again: hidden, the fields emptied, the account gone', () => {
    const { open, next, fill, values, section, one } = mounted();
    open();
    fill();
    next({ username: null, emptied: {} });
    expect(section.hidden).toBe(true);
    expect(values()).toEqual(['', '']);
    expect(one('.first-password .account').textContent).toBe('');
  });

  it('a text with <script> is shown as text', () => {
    const { next, one } = mounted();
    next({ username: '<script>x</script>', failure: '<b>no</b>', hints: { next: ['<i>a</i>'], again: '<u>b</u>' } });
    expect(one('.first-password .account').textContent).toBe('<script>x</script>');
    expect(one('.first-password .account').children).toHaveLength(0);
    expect(one('.new-password .failure').children).toHaveLength(0);
    expect(one('.new-password .needs li').textContent).toBe('<i>a</i>');
    expect(one('.new-password .needs li').children).toHaveLength(0);
  });

  it('left: the passwords, the account and every sentence wiped, the screen hidden, nothing listened to', () => {
    const { open, next, fill, values, subscription, state$, section, one, needs, submitButton } = mounted();
    open();
    fill();
    next({ hints: { next: ['x'], again: 'y' }, failure: 'z' });
    subscription.unsubscribe();
    expect(state$.observed).toBe(false);
    expect(section.hidden).toBe(true);
    expect(values()).toEqual(['', '']);
    expect(needs()).toEqual([]);
    for (const selector of ['.first-password .account', '.new-password .again-field .hint', '.new-password .failure']) expect(one(selector).textContent, selector).toBe('');
    expect(submitButton.disabled).toBe(false);
    expect(document.body.outerHTML).not.toContain(NEXT);
  });
});
