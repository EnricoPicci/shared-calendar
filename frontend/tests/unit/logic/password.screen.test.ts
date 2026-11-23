import { BehaviorSubject, ReplaySubject } from 'rxjs';
import { EMPTY_HINTS, passwordHints } from '../../../src/logic/password.model';
import { PasswordScreen, type PasswordCalls, type PasswordState } from '../../../src/logic/password.screen';
import { PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS } from '../../../src/logic/texts';
import type { ChangePasswordResult, ChangePasswordState } from '../../../src/services/change-password.types';
import { useFarBrowserZone } from './zone';

// A fake ChangePasswordService: a state stream that gives its present value, a result stream that
// replays its last one, as the real ones do, and a spy. No network, no DOM. The passwords are
// made-up texts, and no state the screen emits may hold one.

const CURRENT = 'Current-Pass-1!';
const NEXT = 'Next-Password-2?';
const RIGHT = { current: CURRENT, next: NEXT, again: NEXT };

function screenOf(state: ChangePasswordState = { status: 'idle' }) {
  const changePasswordState$ = new BehaviorSubject<ChangePasswordState>(state);
  const changePasswordResult$ = new ReplaySubject<ChangePasswordResult>(1);
  const changePassword = vi.fn<PasswordCalls['changePassword']>();
  const screen = new PasswordScreen({ changePassword, changePasswordState$, changePasswordResult$ });
  const states: PasswordState[] = [];
  screen.password$.subscribe((s) => states.push(s)); // the view subscribes first
  // An outcome as the service gives it: the state first, then the result.
  const outcome = (result: ChangePasswordResult) => {
    changePasswordState$.next(result);
    changePasswordResult$.next(result);
  };
  const pending = () => changePasswordState$.next({ status: 'pending' });
  return { screen, changePassword, changePasswordState$, changePasswordResult$, states, outcome, pending, last: () => states.at(-1)! };
}

const failed = (reason: Exclude<ChangePasswordResult & { status: 'failure' }, { reason: 'new_password_refused' }>['reason']): ChangePasswordResult => ({ status: 'failure', reason, message: 'for a developer' });

describe('PasswordScreen', () => {
  useFarBrowserZone();

  it('before start(): no stream is listened to; typing and "Change password" do nothing', () => {
    const { screen, changePassword, changePasswordState$, changePasswordResult$, states } = screenOf();
    expect([changePasswordState$.observed, changePasswordResult$.observed]).toEqual([false, false]);
    screen.typed(RIGHT);
    screen.change(RIGHT);
    expect(changePassword).not.toHaveBeenCalled();
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ hints: EMPTY_HINTS, pending: false, blocked: true, wrongCurrent: null, failure: null });
  });

  it('started: the hints of an empty form, the button disabled, nothing asked', () => {
    const { screen, changePassword, last } = screenOf();
    screen.start();
    expect(last()).toMatchObject({ hints: EMPTY_HINTS, pending: false, blocked: true, wrongCurrent: null, failure: null });
    expect(changePassword).not.toHaveBeenCalled();
  });

  describe('while typing', () => {
    it('the hints follow the fields; the button is enabled only when none stands', () => {
      const { screen, last } = screenOf();
      screen.start();
      screen.typed({ current: CURRENT, next: 'Next', again: '' });
      expect(last().hints).toEqual(passwordHints({ current: CURRENT, next: 'Next', again: '' }));
      expect(last().blocked).toBe(true);
      screen.typed({ current: CURRENT, next: NEXT, again: 'Next' });
      expect(last().hints.again).toBe(PASSWORD_TEXTS.differ);
      expect(last().blocked).toBe(true);
      screen.typed(RIGHT);
      expect(last().hints).toEqual({ current: null, next: [], again: null });
      expect(last().blocked).toBe(false);
    });

    it('the new one equal to the current: said, and the button disabled', () => {
      const { screen, last } = screenOf();
      screen.start();
      screen.typed({ current: NEXT, next: NEXT, again: NEXT });
      expect(last().hints.next).toEqual([PASSWORD_PROBLEM_TEXT.same_as_current]);
      expect(last().blocked).toBe(true);
    });
  });

  describe('"Change password"', () => {
    it('with a hint standing: the hints shown, nothing asked', () => {
      const { screen, changePassword, last } = screenOf();
      screen.start();
      screen.change({ current: CURRENT, next: NEXT, again: 'other' });
      expect(changePassword).not.toHaveBeenCalled();
      expect(last().hints.again).toBe(PASSWORD_TEXTS.differ);
    });

    it('with none: the current and the new password, once each, the new one again not sent', () => {
      const { screen, changePassword } = screenOf();
      screen.start();
      screen.change(RIGHT);
      expect(changePassword).toHaveBeenCalledTimes(1);
      expect(changePassword).toHaveBeenCalledWith(CURRENT, NEXT);
    });

    it('while a change is under way the button is disabled and a second one is not asked', () => {
      const { screen, changePassword, pending, last } = screenOf();
      screen.start();
      screen.typed(RIGHT);
      screen.change(RIGHT);
      pending();
      expect(last()).toMatchObject({ pending: true, blocked: true });
      screen.change(RIGHT);
      expect(changePassword).toHaveBeenCalledTimes(1);
    });

    it('a change still under way when the screen is shown again keeps the button disabled', () => {
      const { screen, last } = screenOf({ status: 'pending' });
      screen.typed(RIGHT);
      screen.start();
      expect(last()).toMatchObject({ pending: true, blocked: true });
    });
  });

  describe('the outcome', () => {
    it('a success: the fields emptied, the empty form\'s hints', () => {
      const { screen, outcome, last } = screenOf();
      screen.start();
      screen.typed(RIGHT);
      const before = last().emptied;
      screen.change(RIGHT);
      outcome({ status: 'success' });
      expect(last().emptied).not.toBe(before);
      expect(last()).toMatchObject({ hints: EMPTY_HINTS, pending: false, wrongCurrent: null, failure: null });
    });

    it('a wrong current password: said under its field, the three fields emptied', () => {
      const { screen, outcome, last } = screenOf();
      screen.start();
      const before = last().emptied;
      screen.change(RIGHT);
      outcome(failed('wrong_current_password'));
      expect(last().wrongCurrent).toBe('The current password is not correct.');
      expect(last().failure).toBeNull();
      expect(last().emptied).not.toBe(before);
      expect(last().hints).toEqual(EMPTY_HINTS);
    });

    it.each([
      ['too_many_attempts', 'Too many attempts. Please wait a few minutes and try again.'],
      ['network', 'The server cannot be reached. Check the connection and try again.'],
      ['server', 'The server is not answering as it should. Please try again in a moment.'],
      ['unexpected', 'Something went wrong. Please try again.'],
      ['not_signed_in', 'You are not signed in. Please sign in again.'],
    ] as const)('%s: said under the form, what was typed kept', (reason, sentence) => {
      const { screen, outcome, last } = screenOf();
      screen.start();
      screen.typed(RIGHT);
      const before = last().emptied;
      screen.change(RIGHT);
      outcome(failed(reason));
      expect(last()).toMatchObject({ failure: sentence, wrongCurrent: null, blocked: false });
      expect(last().emptied).toBe(before);
    });

    it('a new password the service refused: its problems under the new field', () => {
      const { screen, outcome, last } = screenOf();
      screen.start();
      screen.typed(RIGHT);
      outcome({ status: 'failure', reason: 'new_password_refused', message: 'for a developer', problems: ['no_digit', 'same_as_current'] });
      expect(last().hints.next).toEqual([PASSWORD_PROBLEM_TEXT.no_digit, PASSWORD_PROBLEM_TEXT.same_as_current]);
      expect(last().blocked).toBe(true);
    });

    it('the failures last until the next change asked for', () => {
      const { screen, outcome, last } = screenOf();
      screen.start();
      screen.change(RIGHT);
      outcome(failed('network'));
      screen.typed(RIGHT);
      expect(last().failure).not.toBeNull();
      screen.change(RIGHT);
      expect(last().failure).toBeNull();
    });

    it('a result from before the start is not heard', () => {
      const { screen, changePasswordResult$, last } = screenOf();
      changePasswordResult$.next(failed('network'));
      screen.start();
      expect(last().failure).toBeNull();
    });
  });

  it('the end of the subscription forgets everything and hears nothing more', () => {
    const { screen, outcome, states, last } = screenOf();
    const started = screen.start();
    screen.change(RIGHT);
    outcome(failed('network'));
    started.unsubscribe();
    expect(last()).toMatchObject({ hints: EMPTY_HINTS, pending: false, blocked: true, failure: null, wrongCurrent: null });
    const count = states.length;
    outcome(failed('server'));
    screen.typed(RIGHT);
    expect(states).toHaveLength(count);
  });

  it('no state holds a password', () => {
    const { screen, outcome, states } = screenOf();
    screen.start();
    screen.typed({ current: CURRENT, next: 'Next', again: '' });
    screen.typed(RIGHT);
    screen.change(RIGHT);
    outcome(failed('wrong_current_password'));
    const text = JSON.stringify(states);
    for (const secret of [CURRENT, NEXT, 'Next']) expect(text).not.toContain(secret);
    expect(Object.values(screen).filter((value) => typeof value === 'string')).toEqual([]);
  });
});
