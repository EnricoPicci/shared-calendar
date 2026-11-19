import { BehaviorSubject, ReplaySubject, Subject } from 'rxjs';
import { appointmentDetail } from '../../../src/logic/appointment.detail';
import { weekModel } from '../../../src/logic/week.model';
import { WeekScreen, type WeekCalendar, type WeekState } from '../../../src/logic/week.screen';
import type { BookResult, CancelResult } from '../../../src/services/appointments.types';
import type { CalendarState } from '../../../src/services/calendar.types';
import { appointment, view, winterWeek } from './fixtures';
import { useFarBrowserZone } from './zone';

// A fake CalendarService (a subject and spies), a fake AppointmentsService (two result streams
// that replay their last value, as the real ones do), a stream for the page becoming visible
// and a fixed "now": no network, no DOM, no clock.

const NOW = '2026-11-19T10:00:00.000Z'; // Thursday; its week is Monday 16 to Sunday 22 November
const GENERAL = 'Something went wrong. Please try again.';
const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';

function screenAt(now = NOW, role: 'admin' | 'user' = 'user') {
  const state$ = new BehaviorSubject<CalendarState>({ status: 'idle' });
  const load = vi.fn<WeekCalendar['load']>();
  const reload = vi.fn<WeekCalendar['reload']>();
  const bookResult$ = new ReplaySubject<BookResult>(1);
  const cancelResult$ = new ReplaySubject<CancelResult>(1);
  const visible$ = new Subject<unknown>();
  const clock = { now };
  const screen = new WeekScreen(
    { calendarState$: state$.asObservable(), load, reload },
    { bookResult$: bookResult$.asObservable(), cancelResult$: cancelResult$.asObservable() },
    role,
    () => new Date(clock.now),
    visible$,
  );
  const states: WeekState[] = [];
  const view$ = screen.week$.subscribe((s) => states.push(s)); // the view subscribes first
  const pending = () => state$.next({ status: 'pending', from: load.mock.lastCall![0], to: load.mock.lastCall![1] });
  const succeed = (calendar = winterWeek()) => state$.next({ status: 'success', calendar });
  const fail = (reason: 'network' | 'internal_error' | 'unexpected', message = 'TypeError: Failed to fetch') => state$.next({ status: 'failure', reason, message });
  return { screen, state$, load, reload, bookResult$, cancelResult$, visible$, clock, states, view$, pending, succeed, fail, last: () => states.at(-1)! };
}

const BOOKED: BookResult = { status: 'success', appointment: winterWeek().appointments[0]! };
const CANCELLED: CancelResult = { status: 'success', appointment: { ...winterWeek().appointments[0]!, status: 'cancelled' } };

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

  describe('the week is loaded again after a booking or a cancellation', () => {
    it('a booking that succeeded reloads, once', () => {
      const { screen, load, reload, bookResult$ } = screenAt();
      screen.start();
      expect(reload).not.toHaveBeenCalled();
      bookResult$.next(BOOKED);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(1); // the reload is the service's: the range stays the one loaded
    });

    it.each([
      ['slot_taken', 'the slot was taken'],
      ['network', 'the server may have applied it'],
      ['invalid_request', 'even when nothing was sent'],
      ['session_rejected', 'whatever the reason'],
    ] as const)('a booking that failed with %s reloads too: %s', (reason, _why) => {
      const { screen, reload, bookResult$ } = screenAt();
      screen.start();
      bookResult$.next({ status: 'failure', reason, message: 'for a developer' });
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('a cancellation reloads at its success and at its failure', () => {
      const { screen, reload, cancelResult$ } = screenAt();
      screen.start();
      cancelResult$.next(CANCELLED);
      expect(reload).toHaveBeenCalledTimes(1);
      cancelResult$.next({ status: 'failure', reason: 'cancellation_notice_too_short', message: 'too late' });
      expect(reload).toHaveBeenCalledTimes(2);
      cancelResult$.next({ status: 'failure', reason: 'server', message: 'API answered 502' });
      expect(reload).toHaveBeenCalledTimes(3);
    });

    it('every result reloads: two bookings, two reloads', () => {
      const { screen, reload, bookResult$ } = screenAt();
      screen.start();
      bookResult$.next(BOOKED);
      bookResult$.next(BOOKED);
      expect(reload).toHaveBeenCalledTimes(2);
    });

    it('before start() nothing is reloaded and the results are not listened to', () => {
      const { reload, bookResult$, cancelResult$ } = screenAt();
      expect(bookResult$.observed).toBe(false);
      bookResult$.next(BOOKED);
      cancelResult$.next(CANCELLED);
      expect(reload).not.toHaveBeenCalled();
    });

    it('a result that was already there at start() reloads nothing; the next one does', () => {
      const { screen, load, reload, bookResult$, cancelResult$ } = screenAt();
      bookResult$.next(BOOKED);
      cancelResult$.next(CANCELLED);
      screen.start();
      expect(reload).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(1);
      cancelResult$.next(CANCELLED);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('after the subscription of start() ends nothing is reloaded; started again, the old result still reloads nothing', () => {
      const { screen, reload, bookResult$, cancelResult$ } = screenAt();
      const started = screen.start();
      bookResult$.next(BOOKED);
      expect(reload).toHaveBeenCalledTimes(1);

      started.unsubscribe();
      expect([bookResult$.observed, cancelResult$.observed]).toEqual([false, false]);
      bookResult$.next(BOOKED);
      cancelResult$.next(CANCELLED);
      expect(reload).toHaveBeenCalledTimes(1);

      screen.start();
      expect(reload).toHaveBeenCalledTimes(1);
      bookResult$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      expect(reload).toHaveBeenCalledTimes(2);
    });
  });

  describe('the week is loaded again when the page becomes visible', () => {
    it('each notification reloads, once', () => {
      const { screen, reload, visible$ } = screenAt();
      screen.start();
      visible$.next(undefined);
      expect(reload).toHaveBeenCalledTimes(1);
      visible$.next(undefined);
      visible$.next(undefined);
      expect(reload).toHaveBeenCalledTimes(3);
    });

    it('it is the week on screen that is loaded again, not the week of today', () => {
      const { screen, load, reload, visible$ } = screenAt();
      screen.start();
      screen.next();
      screen.next();
      expect(load).toHaveBeenLastCalledWith('2026-11-30', '2026-12-06');
      visible$.next(undefined);
      // The service runs its last load again; the screen asks for no other range.
      expect(reload).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(3);
      expect(load).toHaveBeenLastCalledWith('2026-11-30', '2026-12-06');
    });

    it('before start() nothing is reloaded and the stream is not listened to', () => {
      const { reload, visible$ } = screenAt();
      expect(visible$.observed).toBe(false);
      visible$.next(undefined);
      expect(reload).not.toHaveBeenCalled();
    });

    it('after the subscription of start() ends nothing is reloaded', () => {
      const { screen, reload, visible$ } = screenAt();
      screen.start().unsubscribe();
      expect(visible$.observed).toBe(false);
      visible$.next(undefined);
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe('detail(appointmentId)', () => {
    const OWN = winterWeek().appointments[0]!; // Monday 16 November, 11:00–12:00 in Rome, "First lesson"

    it('an appointment of the week on screen, ready to show, for the role and at the "now" given', () => {
      const user = screenAt('2026-11-14T10:00:00.000Z');
      user.screen.start();
      user.succeed();
      expect(user.screen.detail(OWN.appointmentId)).toEqual(appointmentDetail(OWN, 'user', new Date('2026-11-14T10:00:00.000Z'), 'Europe/Rome'));
      expect(user.screen.detail(OWN.appointmentId)).toMatchObject({
        when: 'Mon 16 Nov, 11:00–12:00',
        who: 'You',
        note: 'First lesson',
        canCancel: true,
        hint: 'It can be cancelled until Sun 15 Nov, 11:00.',
      });

      const admin = screenAt(NOW, 'admin');
      admin.screen.start();
      admin.succeed();
      expect(admin.screen.detail(OWN.appointmentId)).toMatchObject({ who: 'alice', canCancel: false, hint: 'This appointment has ended.' });
    });

    it('"now" is read when the detail is asked for, not when the week was loaded', () => {
      const { screen, clock, succeed } = screenAt('2026-11-15T09:59:00.000Z');
      screen.start();
      succeed();
      expect(screen.detail(OWN.appointmentId)!.canCancel).toBe(true);
      clock.now = '2026-11-15T10:00:00.001Z'; // the page stayed open past cancellableUntil
      expect(screen.detail(OWN.appointmentId)).toMatchObject({ canCancel: false, hint: 'It is too late to cancel this appointment.' });
    });

    it('the texts follow the zone the week names', () => {
      const { screen, succeed } = screenAt();
      screen.start();
      succeed({ ...winterWeek(), timeZone: 'Asia/Kolkata' });
      expect(screen.detail(OWN.appointmentId)!.when).toBe('Mon 16 Nov, 15:30–16:30');
    });

    it('an unknown id, and any id before a week is loaded, is null', () => {
      const { screen, succeed } = screenAt();
      expect(screen.detail(OWN.appointmentId)).toBeNull();
      screen.start();
      expect(screen.detail(OWN.appointmentId)).toBeNull();
      succeed();
      expect(screen.detail('01M6DMQ000000000000000NONE')).toBeNull();
    });

    it('after the week changed, an appointment of the week before is null and one of the new week is found', () => {
      const { screen, pending, succeed } = screenAt();
      screen.start();
      succeed();
      const later = appointment({ start: '2026-11-23T09:00:00.000Z', end: '2026-11-23T10:00:00.000Z', date: '2026-11-23' });
      screen.next();
      pending();
      // While the next week loads, the one still on screen is the one searched.
      expect(screen.detail(OWN.appointmentId)).not.toBeNull();
      succeed(view('2026-11-23', { appointments: [later] }));
      expect(screen.detail(OWN.appointmentId)).toBeNull();
      expect(screen.detail(later.appointmentId)!.when).toBe('Mon 23 Nov, 10:00–11:00');
    });

    it('after a reload that no longer holds it (cancelled meanwhile), it is null', () => {
      const { screen, succeed } = screenAt();
      screen.start();
      succeed();
      succeed({ ...winterWeek(), appointments: [] });
      expect(screen.detail(OWN.appointmentId)).toBeNull();
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
