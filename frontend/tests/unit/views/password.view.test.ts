import { BehaviorSubject } from 'rxjs';
import { EMPTY_HINTS } from '../../../src/logic/password.model';
import type { PasswordState } from '../../../src/logic/password.screen';
import { PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS } from '../../../src/logic/texts';
import { mountPassword, type PasswordDeps } from '../../../src/views/password.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the password view (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html, and a fake PasswordScreen whose stream the test controls and whose methods are
// spies. The passwords are made-up texts.

const CURRENT = 'Current-Pass-1!';
const NEXT = 'Next-Password-2?';
const START: PasswordState = { hints: EMPTY_HINTS, pending: false, blocked: true, wrongCurrent: null, failure: null, emptied: {} };
const RIGHT: Partial<PasswordState> = { hints: { current: null, next: [], again: null }, blocked: false };

function mounted() {
  const state$ = new BehaviorSubject<PasswordState>(START);
  const screen = { password$: state$.asObservable(), typed: vi.fn<PasswordDeps['typed']>(), change: vi.fn<PasswordDeps['change']>() };
  const subscription = mountPassword(find('#password'), screen);
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#password ${selector}`);
  const next = (change: Partial<PasswordState>) => state$.next({ ...state$.getValue(), ...change });
  const fill = () => {
    one<HTMLInputElement>('[name="current"]').value = CURRENT;
    one<HTMLInputElement>('[name="next"]').value = NEXT;
    one<HTMLInputElement>('[name="again"]').value = NEXT;
  };
  const values = () => ['current', 'next', 'again'].map((name) => one<HTMLInputElement>(`[name="${name}"]`).value);
  return {
    state$,
    screen,
    subscription,
    one,
    next,
    fill,
    values,
    form: one<HTMLFormElement>('form.change-password'),
    submitButton: one<HTMLButtonElement>('.submit'),
    needs: () => [...document.querySelectorAll('#password .needs li')].map((li) => li.textContent),
  };
}

describe('mountPassword', () => {
  useRealPage();

  it('at the start: the hints of an empty form under the three fields, the button disabled', () => {
    const { one, needs, submitButton } = mounted();
    expect(one('.current-field .hint').textContent).toBe(PASSWORD_TEXTS.currentEmpty);
    expect(needs()).toEqual(EMPTY_HINTS.next);
    expect(one('.again-field .hint').textContent).toBe(PASSWORD_TEXTS.againEmpty);
    expect(submitButton.disabled).toBe(true);
  });

  it('the hints follow the stream; the list of what is missing is redrawn only when it changes', () => {
    const { next, one, needs, submitButton } = mounted();
    next({ hints: { current: null, next: [PASSWORD_PROBLEM_TEXT.no_digit], again: PASSWORD_TEXTS.differ } });
    expect(one('.current-field .hint').textContent).toBe('');
    expect(needs()).toEqual([PASSWORD_PROBLEM_TEXT.no_digit]);
    const item = one('.needs li');
    next({ pending: false });
    expect(one('.needs li')).toBe(item);
    expect(one('.again-field .hint').textContent).toBe(PASSWORD_TEXTS.differ);
    next(RIGHT);
    expect([needs(), one('.again-field .hint').textContent, submitButton.disabled]).toEqual([[], '', false]);
  });

  it('typing hands the three fields to the screen at every keystroke', () => {
    const { fill, form, screen } = mounted();
    fill();
    form.dispatchEvent(new Event('input', { bubbles: true }));
    expect(screen.typed).toHaveBeenLastCalledWith({ current: CURRENT, next: NEXT, again: NEXT });
  });

  it('"Change password" hands the three fields to the screen and does not let the browser reload the page', () => {
    const { fill, form, screen, next, submitButton } = mounted();
    fill();
    next(RIGHT);
    expect(submit(form).prevented).toBe(true);
    expect(screen.change).toHaveBeenCalledWith({ current: CURRENT, next: NEXT, again: NEXT });
    screen.change.mockClear();
    submitButton.click();
    expect(screen.change).toHaveBeenCalledTimes(1);
  });

  it('pending: the button disabled; what was typed stays', () => {
    const { fill, next, values, submitButton } = mounted();
    fill();
    next({ ...RIGHT, pending: true, blocked: true });
    expect(submitButton.disabled).toBe(true);
    expect(values()).toEqual([CURRENT, NEXT, NEXT]);
  });

  it('a wrong current password: said under the field, which is marked, and the three fields emptied', () => {
    const { fill, next, values, one } = mounted();
    fill();
    next({ ...RIGHT, wrongCurrent: 'The current password is not correct.', hints: EMPTY_HINTS, blocked: true, emptied: {} });
    expect(values()).toEqual(['', '', '']);
    expect(one('.current-field .refusal').textContent).toBe('The current password is not correct.');
    expect(one('[name="current"]').getAttribute('aria-invalid')).toBe('true');
    next({ wrongCurrent: null });
    expect(one('[name="current"]').hasAttribute('aria-invalid')).toBe(false);
  });

  it('a success: the three fields emptied', () => {
    const { fill, next, values } = mounted();
    fill();
    next({ hints: EMPTY_HINTS, emptied: {} });
    expect(values()).toEqual(['', '', '']);
  });

  it('another failure: said under the form, what was typed kept', () => {
    const { fill, next, values, one } = mounted();
    fill();
    next({ ...RIGHT, failure: 'The server cannot be reached. Check the connection and try again.' });
    expect(one('form.change-password .failure').textContent).toBe('The server cannot be reached. Check the connection and try again.');
    expect(values()).toEqual([CURRENT, NEXT, NEXT]);
  });

  it('a field typed in before the mount is left alone by the first state', () => {
    find<HTMLInputElement>('#password [name="current"]').value = CURRENT;
    const { values } = mounted();
    expect(values()[0]).toBe(CURRENT);
  });

  it('a text with <script> is shown as text', () => {
    const { next, one } = mounted();
    next({ failure: '<script>window.hacked = true</script>', hints: { current: null, next: ['<b>bold</b>'], again: null } });
    expect(one('form.change-password .failure').children).toHaveLength(0);
    expect(one('.needs li').children).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('the fields keep their autocomplete values and their type, and no password reaches an attribute or a text of the page', () => {
    const { fill, form, next, one } = mounted();
    fill();
    form.dispatchEvent(new Event('input', { bubbles: true }));
    submit(form);
    next({ ...RIGHT, failure: 'Something went wrong. Please try again.' });
    expect(['current', 'next', 'again'].map((name) => [one(`[name="${name}"]`).getAttribute('type'), one(`[name="${name}"]`).getAttribute('autocomplete')])).toEqual([
      ['password', 'current-password'],
      ['password', 'new-password'],
      ['password', 'new-password'],
    ]);
    for (const secret of [CURRENT, NEXT]) {
      expect(document.documentElement.outerHTML).not.toContain(secret);
      expect(window.location.href).not.toContain(encodeURIComponent(secret));
    }
  });

  it('after unsubscribing nothing is left: the fields empty, every sentence gone, the stream no longer heard', () => {
    const { fill, next, subscription, values, one, needs, submitButton, state$ } = mounted();
    fill();
    next({ ...RIGHT, wrongCurrent: 'x', failure: 'y', hints: { current: 'a', next: ['b'], again: 'c' } });
    subscription.unsubscribe();
    expect(values()).toEqual(['', '', '']);
    expect(needs()).toEqual([]);
    for (const selector of ['.current-field .hint', '.current-field .refusal', '.again-field .hint', 'form.change-password .failure']) expect(one(selector).textContent, selector).toBe('');
    expect(one('[name="current"]').hasAttribute('aria-invalid')).toBe(false);
    expect(submitButton.disabled).toBe(false);
    state$.next({ ...START, failure: 'late' });
    expect(one('form.change-password .failure').textContent).toBe('');
    for (const secret of [CURRENT, NEXT]) expect(document.documentElement.outerHTML).not.toContain(secret);
  });
});
