import type { MeResponse } from '@shared-calendar/shared';
import { ReplaySubject } from 'rxjs';
import { MailScreen, type MailCalls, type MailMeCalls, type MailState } from '../../../src/logic/mail.screen';
import type { SendCalendarResult } from '../../../src/services/mail.types';
import type { MeResult } from '../../../src/services/me.types';
import { useFarBrowserZone } from './zone';

// A fake MailService and a fake MeService: result streams that replay their last value, as the
// real ones do, and spies. No network, no DOM.

const ALICE: MeResponse = { username: 'alice', role: 'user', givenName: 'Alice', familyName: 'Liddell', email: 'alice@example.com', address: 'Piazza 7' };
const USER_WHAT = 'Your appointments between the two dates, as an Excel file, to your own e-mail address.';
const ADMIN_WHAT = 'The whole calendar between the two dates, as an Excel file, to your own e-mail address.';
const NOTHING: MailState = { what: USER_WHAT, sending: false, sent: null, failure: null };

function screenOf(role: 'admin' | 'user' = 'user') {
  const sendCalendarResult$ = new ReplaySubject<SendCalendarResult>(1);
  const meResult$ = new ReplaySubject<MeResult>(1);
  const sendCalendar = vi.fn<MailCalls['sendCalendar']>();
  const getMe = vi.fn<MailMeCalls['getMe']>();
  const screen = new MailScreen({ sendCalendar, sendCalendarResult$ }, { getMe, meResult$ }, role);
  const states: MailState[] = [];
  screen.mail$.subscribe((s) => states.push(s));
  const queued = () => sendCalendarResult$.next({ status: 'success' });
  const refused = (reason: 'mail_limit_reached' | 'invalid_request' | 'network') => sendCalendarResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const read = (me: MeResponse) => meResult$.next({ status: 'success', me });
  return { screen, sendCalendarResult$, meResult$, sendCalendar, getMe, states, queued, refused, read, last: () => states.at(-1)! };
}

describe('MailScreen', () => {
  useFarBrowserZone();

  it('before start(): what the mail holds, for each role, and no stream heard', () => {
    const { last, sendCalendarResult$, meResult$ } = screenOf();
    expect(last()).toEqual(NOTHING);
    expect([sendCalendarResult$.observed, meResult$.observed]).toEqual([false, false]);
    expect(screenOf('admin').last()).toEqual({ ...NOTHING, what: ADMIN_WHAT });
  });

  it('send asks for the two dates, and says it is sending; once queued it reads the address, and says where the mail goes, masked', () => {
    const { screen, sendCalendar, getMe, queued, read, last } = screenOf();
    screen.start();
    screen.send('2026-11-16', '2026-11-22');
    expect(sendCalendar).toHaveBeenCalledWith({ from: '2026-11-16', to: '2026-11-22' });
    expect(last()).toEqual({ ...NOTHING, sending: true });
    queued();
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(last()).toEqual({ ...NOTHING, sending: true });
    read(ALICE);
    expect(last()).toEqual({ ...NOTHING, sent: 'On its way to a•••@example.com' });
  });

  it('an address that cannot be read, or none: the mail is said to be on its way all the same, in general words', () => {
    const { screen, queued, meResult$, read, last } = screenOf();
    screen.start();
    screen.send('2026-11-16', '2026-11-22');
    queued();
    meResult$.next({ status: 'failure', reason: 'network', message: 'for a developer' });
    expect(last().sent).toBe('On its way to your e-mail address');
    screen.send('2026-11-16', '2026-11-22');
    queued();
    read({ ...ALICE, email: null });
    expect(last().sent).toBe('On its way to your e-mail address');
  });

  it('a refusal says why, in the words of a mail; no address is read', () => {
    const { screen, refused, getMe, last } = screenOf();
    screen.start();
    screen.send('2026-11-22', '2026-11-16');
    refused('invalid_request');
    expect(last()).toEqual({ ...NOTHING, failure: 'Choose two dates, the first not after the second, at most 366 days in all.' });
    screen.send('2026-11-16', '2026-11-22');
    refused('mail_limit_reached');
    expect(last().failure).toBe('You have asked for as many e-mails as a day allows. Please try again tomorrow.');
    expect(getMe).not.toHaveBeenCalled();
  });

  it('nothing is sent again while one is under way', () => {
    const { screen, sendCalendar } = screenOf();
    screen.start();
    screen.send('2026-11-16', '2026-11-22');
    screen.send('2026-11-16', '2026-11-22');
    expect(sendCalendar).toHaveBeenCalledTimes(1);
  });

  it('reset forgets what was shown, and an answer still awaited then is not shown', () => {
    const { screen, sendCalendar, queued, refused, getMe, read, states, last } = screenOf();
    screen.start();
    screen.send('2026-11-16', '2026-11-22');
    screen.reset();
    expect(last()).toEqual(NOTHING);
    const before = states.length;
    queued();
    refused('network');
    expect(states).toHaveLength(before);
    expect(getMe).not.toHaveBeenCalled();
    // A read that is no longer awaited is not shown either.
    screen.send('2026-11-16', '2026-11-22');
    queued();
    screen.reset();
    read(ALICE);
    expect(last()).toEqual(NOTHING);
    expect(sendCalendar).toHaveBeenCalledTimes(2);
  });

  it('an answer from before start() is not heard; the end of the subscription forgets everything and hears nothing more', () => {
    const { screen, queued, getMe, read, last } = screenOf();
    queued();
    read(ALICE);
    const started = screen.start();
    expect(getMe).not.toHaveBeenCalled();
    expect(last()).toEqual(NOTHING);
    screen.send('2026-11-16', '2026-11-22');
    started.unsubscribe();
    expect(last()).toEqual(NOTHING);
    queued();
    expect(getMe).not.toHaveBeenCalled();
  });
});
