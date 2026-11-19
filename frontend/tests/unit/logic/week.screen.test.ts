import { BehaviorSubject } from 'rxjs';
import { weekModel } from '../../../src/logic/week.model';
import { WeekScreen, type WeekCalendar, type WeekState } from '../../../src/logic/week.screen';
import type { CalendarState } from '../../../src/services/calendar.types';
import { view, winterWeek } from './fixtures';
import { useFarBrowserZone } from './zone';

// A fake CalendarService (a subject and a spy) and a fixed "now": no network, no DOM, no clock.

const NOW = '2026-11-19T10:00:00.000Z'; // Thursday; its week is Monday 16 to Sunday 22 November
const GENERAL = 'Something went wrong. Please try again.';
const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';

function screenAt(now = NOW, role: 'admin' | 'user' = 'user') {
  const state$ = new BehaviorSubject<CalendarState>({ status: 'idle' });
  const load = vi.fn<WeekCalendar['load']>();
  const clock = { now };
  const screen = new WeekScreen({ calendarState$: state$.asObservable(), load }, role, () => new Date(clock.now));
  const states: WeekState[] = [];
  const view$ = screen.week$.subscribe((s) => states.push(s)); // the view subscribes first
  const pending = () => state$.next({ status: 'pending', from: load.mock.lastCall![0], to: load.mock.lastCall![1] });
  const succeed = (calendar = winterWeek()) => state$.next({ status: 'success', calendar });
  const fail = (reason: 'network' | 'internal_error' | 'unexpected', message = 'TypeError: Failed to fetch') => state$.next({ status: 'failure', reason, message });
  return { screen, state$, load, clock, states, view$, pending, succeed, fail, last: () => states.at(-1)! };
}

describe('WeekScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is loaded; the stream says the week of today, with no week and no failure', () => {
      const { load, states, state$ } = screenAt();
      expect(load).not.toHaveBeenCalled();
      expect(state$.observed).toBe(false);
      expect(states).toEqual([{ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: null }]);
    });

    it('a change of week changes the label and still loads nothing', () => {
      const { screen, load, last } = screenAt();
      screen.next();
      expect(last()).toEqual({ label: '23 Nov – 29 Nov 2026', loading: false, failure: null, week: null });
      expect(load).not.toHaveBeenCalled();
    });
  });

  describe('the first week', () => {
    it('start() loads the week of "now", Monday to Sunday, at once', () => {
      const { screen, load } = screenAt();
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith('2026-11-16', '2026-11-22');
    });

    it.each([
      // Sunday 22:00 in Rome; already Monday 11:00 in the browser's zone of the test (UTC+14).
      ['the browser is in the next week', '2026-11-22T21:00:00.000Z', '2026-11-16', '2026-11-22'],
      // Monday 00:30 in Rome; still Sunday in UTC.
      ['UTC is in the week before', '2026-11-15T23:30:00.000Z', '2026-11-16', '2026-11-22'],
      // Summer: Monday 01:00 in Rome (UTC+2) is Sunday 23:00 UTC.
      ['summer time counts', '2027-07-04T23:00:00.000Z', '2027-07-05', '2027-07-11'],
      ['a Monday is its own week', '2026-11-16T12:00:00.000Z', '2026-11-16', '2026-11-22'],
      ['a Sunday belongs to the week that ends with it', '2026-11-22T12:00:00.000Z', '2026-11-16', '2026-11-22'],
    ])('is the week of "now" in the default zone, Europe/Rome: %s', (_name, now, from, to) => {
      const { screen, load } = screenAt(now);
      screen.start();
      expect(load).toHaveBeenCalledWith(from, to);
    });

    it.each([
      ['2026-12-02T10:00:00.000Z', '30 Nov – 6 Dec 2026', '2026-11-30', '2026-12-06'],
      ['2026-12-30T10:00:00.000Z', '28 Dec 2026 – 3 Jan 2027', '2026-12-28', '2027-01-03'],
    ])('a week that starts in one month or year and ends in the next (%s)', (now, label, from, to) => {
      const { screen, load, last } = screenAt(now);
      screen.start();
      expect(last().label).toBe(label);
      expect(load).toHaveBeenCalledWith(from, to);
    });
  });

  describe('loading', () => {
    it('pending: loading, no week yet; success: the week ready to draw, for the role given', () => {
      const user = screenAt();
      user.screen.start();
      user.pending();
      expect(user.last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: true, failure: null, week: null });
      user.succeed();
      expect(user.last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: weekModel(winterWeek(), 'user') });
      expect(user.last().week!.days[0]!.appointments[0]!.who).toBe('You');

      const admin = screenAt(NOW, 'admin');
      admin.screen.start();
      admin.succeed();
      expect(admin.last().week!.days[0]!.appointments[0]!.who).toBe('alice');
    });

    it('the idle state of the service changes nothing', () => {
      const { screen, states } = screenAt();
      screen.start();
      expect(states).toHaveLength(1);
    });

    it('a notification that is not a new week keeps the same week object, so the view need not redraw', () => {
      const { screen, pending, succeed, fail, last } = screenAt();
      screen.start();
      succeed();
      const week = last().week;
      screen.next();
      pending();
      expect(last().week).toBe(week);
      fail('network');
      expect(last().week).toBe(week);
    });
  });

  describe('previous, next, today', () => {
    it('next and previous load the neighbouring weeks at once', () => {
      const { screen, load } = screenAt();
      screen.start();
      screen.next();
      expect(load).toHaveBeenLastCalledWith('2026-11-23', '2026-11-29');
      screen.next();
      expect(load).toHaveBeenLastCalledWith('2026-11-30', '2026-12-06');
      screen.previous();
      screen.previous();
      screen.previous();
      expect(load).toHaveBeenLastCalledWith('2026-11-09', '2026-11-15');
      expect(load).toHaveBeenCalledTimes(6);
    });

    it('while the next week loads, the last one stays, with loading and the new label, in one notification', () => {
      const { screen, states, pending, succeed, last } = screenAt();
      screen.start();
      pending();
      succeed();
      const first = last().week;
      const before = states.length;

      screen.next();
      pending();
      expect(states.slice(before)).toEqual([{ label: '23 Nov – 29 Nov 2026', loading: true, failure: null, week: first }]);

      const second = view('2026-11-23');
      succeed(second);
      expect(last()).toEqual({ label: '23 Nov – 29 Nov 2026', loading: false, failure: null, week: weekModel(second, 'user') });
    });

    it('today returns to the week of "now", read again at that moment', () => {
      const { screen, load, clock, pending, last } = screenAt();
      screen.start();
      screen.next();
      screen.next();
      clock.now = '2026-11-23T08:00:00.000Z'; // the page stayed open into the next week
      screen.today();
      pending();
      expect(load).toHaveBeenLastCalledWith('2026-11-23', '2026-11-29');
      expect(last().label).toBe('23 Nov – 29 Nov 2026');
    });

    it('today on the week of today loads it again', () => {
      const { screen, load } = screenAt();
      screen.start();
      screen.today();
      expect(load).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenLastCalledWith('2026-11-16', '2026-11-22');
    });
  });

  describe('failures', () => {
    it('a first load that fails: no week, the failure in plain words, never the service\'s message', () => {
      const { screen, pending, fail, last } = screenAt();
      screen.start();
      pending();
      fail('network', 'TypeError: Failed to fetch');
      expect(last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: false, failure: UNREACHABLE, week: null });
    });

    it('a failed load keeps the last week and carries the failure', () => {
      const { screen, pending, succeed, fail, last } = screenAt();
      screen.start();
      succeed();
      const week = last().week;
      screen.next();
      pending();
      fail('internal_error', 'boom');
      expect(last()).toEqual({
        label: '23 Nov – 29 Nov 2026',
        loading: false,
        failure: 'Something went wrong on the server. Please try again in a moment.',
        week,
      });
    });

    it('a second failure replaces the first; the failure stays while the next load is pending', () => {
      const { screen, pending, fail, last } = screenAt();
      screen.start();
      fail('network');
      screen.today();
      pending();
      expect(last()).toMatchObject({ loading: true, failure: UNREACHABLE });
      fail('unexpected', 'API answered 200 with an unexpected body');
      expect(last()).toMatchObject({ loading: false, failure: GENERAL });
    });

    it('a failure, then a load that succeeds: the failure is gone and the week is there', () => {
      const { screen, pending, succeed, fail, last } = screenAt();
      screen.start();
      fail('network');
      screen.today();
      pending();
      succeed();
      expect(last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: weekModel(winterWeek(), 'user') });
    });
  });

  describe('after the subscription of start() ends', () => {
    it('nothing is loaded and the service is no longer heard', () => {
      const { screen, state$, load, states, succeed } = screenAt();
      const started = screen.start();
      expect(state$.observed).toBe(true);
      started.unsubscribe();
      expect(state$.observed).toBe(false);

      screen.next();
      screen.previous();
      screen.today();
      expect(load).toHaveBeenCalledTimes(1);
      succeed();
      expect(states.at(-1)!.week).toBeNull();
    });

    it('started again, it loads the week it was left on and shows what the service last answered', () => {
      const { screen, load, succeed, last } = screenAt();
      const started = screen.start();
      screen.next();
      succeed(view('2026-11-23'));
      started.unsubscribe();

      screen.start();
      expect(load).toHaveBeenLastCalledWith('2026-11-23', '2026-11-29');
      expect(last().week).toEqual(weekModel(view('2026-11-23'), 'user'));
    });
  });

  it('a late subscriber gets the current state at once', () => {
    const { screen, succeed } = screenAt();
    screen.start();
    succeed();
    const late: WeekState[] = [];
    screen.week$.subscribe((s) => late.push(s));
    expect(late).toHaveLength(1);
    expect(late[0]!.week).not.toBeNull();
  });
});
