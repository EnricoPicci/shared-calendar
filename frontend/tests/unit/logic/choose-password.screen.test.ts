import { BehaviorSubject } from 'rxjs';
import { ChoosePasswordScreen, type ChoosePasswordCalls, type ChoosePasswordState } from '../../../src/logic/choose-password.screen';
import { EMPTY_NEW_HINTS, newPasswordHints } from '../../../src/logic/password.model';
import { PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS } from '../../../src/logic/texts';
import type { LoginState } from '../../../src/services/login.types';
import { useFarBrowserZone } from './zone';

// The screen "Choose your password" of a first sign-in, with a fake LoginService: a state stream
// that gives its present value, as the real one does, and spies. No network, no DOM. The
// passwords are made-up texts, and no state the screen emits may hold one.

const NEXT = 'Next-Password-2?';
const RIGHT = { next: NEXT, again: NEXT };
const ASKED: LoginState = { status: 'new_password_required', username: 'anna' };

function screenOf(state: LoginState = { status: 'idle' }) {
  const loginState$ = new BehaviorSubject<LoginState>(state);
  const choosePassword = vi.fn<ChoosePasswordCalls['choosePassword']>();
  const reset = vi.fn<ChoosePasswordCalls['reset']>();
  const screen = new ChoosePasswordScreen({ loginState$, choosePassword, reset });
  const states: ChoosePasswordState[] = [];
  screen.choose$.subscribe((s) => states.push(s)); // the view subscribes first
  return { screen, loginState$, choosePassword, reset, states, last: () => states.at(-1)! };
}

describe('ChoosePasswordScreen', () => {
  useFarBrowserZone();

  it('before start(): the LoginService is not listened to; typing, "Choose password" and Cancel do nothing', () => {
    const { screen, loginState$, choosePassword, reset, states } = screenOf(ASKED);
    expect(loginState$.observed).toBe(false);
    screen.typed(RIGHT);
    screen.choose(RIGHT);
    screen.cancel();
    expect(choosePassword).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ username: null, hints: EMPTY_NEW_HINTS, pending: false, blocked: true, failure: null });
  });

  it('started on a sign-in that asks for nothing: hidden, and typing changes nothing', () => {
    const { screen, states, last } = screenOf();
    screen.start();
    screen.typed(RIGHT);
    screen.choose(RIGHT);
    expect(last().username).toBeNull();
    expect(last().hints).toEqual(EMPTY_NEW_HINTS);
    expect(states).toHaveLength(1);
  });

  it('a new password asked for: open for the account, empty fields, the hints of two empty fields, the button disabled', () => {
    const { screen, loginState$, last } = screenOf();
    screen.start();
    const before = last().emptied;
    loginState$.next(ASKED);
    expect(last()).toMatchObject({ username: 'anna', hints: EMPTY_NEW_HINTS, pending: false, blocked: true, failure: null });
    expect(last().emptied).not.toBe(before);
  });

  it('started while a new password is already asked for: open at once', () => {
    const { screen, last } = screenOf(ASKED);
    screen.start();
    expect(last().username).toBe('anna');
  });

  it('the hints follow the two fields as the password screen words them; the button is enabled only when none stands', () => {
    const { screen, last } = screenOf(ASKED);
    screen.start();
    screen.typed({ next: 'Next', again: '' });
    expect(last().hints).toEqual(newPasswordHints({ next: 'Next', again: '' }));
    expect(last().blocked).toBe(true);
    screen.typed({ next: NEXT, again: 'Next' });
    expect(last().hints.again).toBe(PASSWORD_TEXTS.differ);
    screen.typed(RIGHT);
    expect(last().hints).toEqual({ next: [], again: null });
    expect(last().blocked).toBe(false);
  });

  it('"Choose password" with a hint standing: the hints are shown and nothing is sent', () => {
    const { screen, choosePassword, last } = screenOf(ASKED);
    screen.start();
    screen.choose({ next: 'short', again: 'short' });
    expect(choosePassword).not.toHaveBeenCalled();
    expect(last().hints.next).toContain(PASSWORD_PROBLEM_TEXT.too_short);
  });

  it('"Choose password" with no hint: the new password once to the service; while it is on its way the button is disabled and a second press sends nothing', () => {
    const { screen, loginState$, choosePassword, last } = screenOf(ASKED);
    screen.start();
    screen.choose(RIGHT);
    expect(choosePassword).toHaveBeenCalledExactlyOnceWith(NEXT);
    loginState$.next({ status: 'answering', username: 'anna' });
    expect(last()).toMatchObject({ username: 'anna', pending: true, blocked: true });
    screen.choose(RIGHT);
    expect(choosePassword).toHaveBeenCalledTimes(1);
  });

  it('the shared rule refused it at the service: its problems under the new password, the fields kept', () => {
    const { screen, loginState$, last } = screenOf(ASKED);
    screen.start();
    screen.choose(RIGHT);
    const emptied = last().emptied;
    loginState$.next({ status: 'answering', username: 'anna' });
    loginState$.next({ ...ASKED, refusal: { reason: 'new_password_refused', problems: ['no_symbol'] } });
    expect(last()).toMatchObject({ pending: false, blocked: true, failure: null, hints: { next: [PASSWORD_PROBLEM_TEXT.no_symbol], again: null } });
    expect(last().emptied).toBe(emptied);
  });

  it.each([
    ['password_refused', 'This password was not accepted. Please choose another one.'],
    ['network', 'The server cannot be reached. Check the connection and try again.'],
  ] as const)('refused with %s: its sentence under the form, until the next attempt; the fields kept', (reason, sentence) => {
    const { screen, loginState$, choosePassword, last } = screenOf(ASKED);
    screen.start();
    screen.typed(RIGHT);
    const emptied = last().emptied;
    loginState$.next({ status: 'answering', username: 'anna' });
    loginState$.next({ ...ASKED, refusal: { reason, message: 'for a developer' } });
    expect(last()).toMatchObject({ pending: false, blocked: false, failure: sentence });
    expect(last().emptied).toBe(emptied);
    screen.choose(RIGHT);
    expect(last().failure).toBeNull();
    expect(choosePassword).toHaveBeenCalledTimes(1);
  });

  it.each<[string, LoginState]>([
    ['signed in', { status: 'success', username: 'anna', role: 'user', expiresAt: new Date('2027-01-01T00:00:00Z') }],
    ['the 3 minutes over', { status: 'failure', reason: 'session_expired', message: 'for a developer' }],
    ['Cancel', { status: 'idle' }],
  ])('closed (%s): hidden, the fields emptied, the hints and the sentence gone', (_name, state) => {
    const { screen, loginState$, last } = screenOf(ASKED);
    screen.start();
    screen.typed({ next: 'Next', again: '' });
    loginState$.next({ ...ASKED, refusal: { reason: 'server', message: 'x' } });
    const emptied = last().emptied;
    loginState$.next(state);
    expect(last()).toMatchObject({ username: null, hints: EMPTY_NEW_HINTS, pending: false, failure: null });
    expect(last().emptied).not.toBe(emptied);
  });

  it('Cancel: reset() of the service', () => {
    const { screen, reset } = screenOf(ASKED);
    screen.start();
    screen.cancel();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('the subscription of start() ended: the service is left and everything forgotten', () => {
    const { screen, loginState$, last } = screenOf(ASKED);
    const started = screen.start();
    screen.typed({ next: 'Next', again: '' });
    started.unsubscribe();
    expect(loginState$.observed).toBe(false);
    expect(last()).toMatchObject({ username: null, hints: EMPTY_NEW_HINTS, failure: null });
  });

  it('no state holds a password typed', () => {
    const { screen, loginState$, states } = screenOf(ASKED);
    screen.start();
    screen.typed({ next: 'Typed-Pass', again: 'Typed-Again' });
    screen.choose(RIGHT);
    loginState$.next({ ...ASKED, refusal: { reason: 'server', message: 'x' } });
    for (const secret of ['Typed-Pass', 'Typed-Again', NEXT]) expect(JSON.stringify(states)).not.toContain(secret);
  });
});
