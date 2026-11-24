import { BehaviorSubject, ReplaySubject, Subject } from 'rxjs';
import { appointmentDetail } from '../../../src/logic/appointment.detail';
import { weekModel } from '../../../src/logic/week.model';
import { WeekScreen, type WeekCalendar, type WeekState } from '../../../src/logic/week.screen';
import type { BookResult, CancelResult, ChangeResult, UpdateNoteResult } from '../../../src/services/appointments.types';
import type { CalendarState } from '../../../src/services/calendar.types';
import { appointment, view, winterWeek } from './fixtures';
import { useFarBrowserZone } from './zone';

// A fake CalendarService (a subject and spies), a fake AppointmentsService (four result streams
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
  const updateNoteResult$ = new ReplaySubject<UpdateNoteResult>(1);
  const changeResult$ = new ReplaySubject<ChangeResult>(1);
  const visible$ = new Subject<unknown>();
  const clock = { now };
  const screen = new WeekScreen(
    { calendarState$: state$.asObservable(), load, reload },
    {
      bookResult$: bookResult$.asObservable(),
      cancelResult$: cancelResult$.asObservable(),
      updateNoteResult$: updateNoteResult$.asObservable(),
      changeResult$: changeResult$.asObservable(),
    },
    role,
    () => new Date(clock.now),
    visible$,
  );
  const states: WeekState[] = [];
  const view$ = screen.week$.subscribe((s) => states.push(s)); // the view subscribes first
  const pending = () => state$.next({ status: 'pending', from: load.mock.lastCall![0], to: load.mock.lastCall![1] });
  const succeed = (calendar = winterWeek()) => state$.next({ status: 'success', calendar });
  const fail = (reason: 'network' | 'internal_error' | 'unexpected', message = 'TypeError: Failed to fetch') => state$.next({ status: 'failure', reason, message });
  return { screen, state$, load, reload, bookResult$, cancelResult$, updateNoteResult$, changeResult$, visible$, clock, states, view$, pending, succeed, fail, last: () => states.at(-1)! };
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
      expect(states).toEqual([{ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: null, moving: null }]);
    });

    it('a change of week changes the label and still loads nothing', () => {
      const { screen, load, last } = screenAt();
      screen.next();
      expect(last()).toEqual({ label: '23 Nov – 29 Nov 2026', loading: false, failure: null, week: null, moving: null });
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
      expect(user.last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: true, failure: null, week: null, moving: null });
      user.succeed();
      expect(user.last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: weekModel(winterWeek(), 'user'), moving: null });
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
      expect(states.slice(before)).toEqual([{ label: '23 Nov – 29 Nov 2026', loading: true, failure: null, week: first, moving: null }]);

      const second = view('2026-11-23');
      succeed(second);
      expect(last()).toEqual({ label: '23 Nov – 29 Nov 2026', loading: false, failure: null, week: weekModel(second, 'user'), moving: null });
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
      expect(last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: false, failure: UNREACHABLE, week: null, moving: null });
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
        moving: null,
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
      expect(last()).toEqual({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: weekModel(winterWeek(), 'user'), moving: null });
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

  describe('refusal(reason, asked)', () => {
    const OWN = winterWeek().appointments[0]!; // Monday 16 November, 11:00–12:00 in Rome
    // A slot of the week over the User's own appointment, as the book dialog would have sent it.
    const asked = () => {
      const slot = weekModel(winterWeek(), 'user').days[0]!.slots[0]!;
      return { slot: { ...slot, start: OWN.start, end: OWN.end }, zone: 'Europe/Rome', fields: { note: '', username: '', start: '', end: '' }, moving: null };
    };

    it('user_busy names the appointment in the way, looked for in the last week loaded', () => {
      const { screen, succeed } = screenAt();
      screen.start();
      expect(screen.refusal('user_busy', asked())).toEqual({ text: 'You already have an appointment at this time. To move it, change that appointment instead.', offer: false });
      succeed();
      expect(screen.refusal('user_busy', asked())).toEqual({ text: 'You already have an appointment at this time (11:00–12:00 · Studio); open it to change it.', offer: false });
    });

    it('the role is the screen\'s: the Administrator is offered "Book anyway" after slot_taken, a User is not', () => {
      expect(screenAt(NOW, 'admin').screen.refusal('slot_taken', asked())).toEqual({ text: 'This time is full: there is no place left.', offer: true });
      expect(screenAt(NOW, 'user').screen.refusal('slot_taken', asked()).offer).toBe(false);
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
        hint: 'It can be changed or cancelled until Sun 15 Nov, 11:00.',
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
      expect(screen.detail(OWN.appointmentId)).toMatchObject({ canCancel: false, hint: 'It is too late to change or cancel this appointment.' });
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
  describe('the week is loaded again after a note saved or a change', () => {
    const OWN = winterWeek().appointments[0]!;
    const NOTED: UpdateNoteResult = { status: 'success', appointment: { ...OWN, note: 'Second lesson' } };
    const CHANGED: ChangeResult = { status: 'success', cancelled: { ...OWN, status: 'cancelled', cancelReason: 'changed' }, booked: OWN };

    it('a note saved reloads at its success and at its failure', () => {
      const { screen, load, reload, updateNoteResult$ } = screenAt();
      screen.start();
      updateNoteResult$.next(NOTED);
      expect(reload).toHaveBeenCalledTimes(1);
      updateNoteResult$.next({ status: 'failure', reason: 'appointment_not_active', message: 'ended' });
      expect(reload).toHaveBeenCalledTimes(2);
      updateNoteResult$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(reload).toHaveBeenCalledTimes(3);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('a change reloads at its success and at its failure', () => {
      const { screen, load, reload, changeResult$ } = screenAt();
      screen.start();
      changeResult$.next(CHANGED);
      expect(reload).toHaveBeenCalledTimes(1);
      changeResult$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      expect(reload).toHaveBeenCalledTimes(2);
      changeResult$.next({ status: 'failure', reason: 'invalid_request', message: 'end: end must be after start' });
      expect(reload).toHaveBeenCalledTimes(3);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('before start() neither is listened to; a result that was already there at start() reloads nothing; the next one does', () => {
      const { screen, reload, updateNoteResult$, changeResult$ } = screenAt();
      expect([updateNoteResult$.observed, changeResult$.observed]).toEqual([false, false]);
      updateNoteResult$.next(NOTED);
      changeResult$.next(CHANGED);
      screen.start();
      expect(reload).not.toHaveBeenCalled();
      updateNoteResult$.next(NOTED);
      changeResult$.next(CHANGED);
      expect(reload).toHaveBeenCalledTimes(2);
    });

    it('after the subscription of start() ends nothing is reloaded; started again, the old results still reload nothing', () => {
      const { screen, reload, updateNoteResult$, changeResult$ } = screenAt();
      const started = screen.start();
      started.unsubscribe();
      expect([updateNoteResult$.observed, changeResult$.observed]).toEqual([false, false]);
      updateNoteResult$.next(NOTED);
      changeResult$.next(CHANGED);
      expect(reload).not.toHaveBeenCalled();
      screen.start();
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe('moving an appointment to another time', () => {
    const OWN = winterWeek().appointments[0]!; // Monday 16 November, 11:00–12:00 in Rome, "First lesson"
    const EARLY = '2026-11-14T10:00:00.000Z'; // Saturday: the appointment can still be changed
    const MOVING = { appointmentId: OWN.appointmentId, when: 'Mon 16 Nov, 11:00–12:00', what: 'Mon 16 Nov, 11:00–12:00 · Studio', who: 'You', note: 'First lesson' };
    const CHANGED: ChangeResult = { status: 'success', cancelled: { ...OWN, status: 'cancelled', cancelReason: 'changed' }, booked: OWN };
    const refused = (reason: 'booking_notice_too_short' | 'slot_taken' | 'appointment_not_found' | 'appointment_not_active' | 'cancellation_notice_too_short' | 'user_not_found' | 'network'): ChangeResult => ({
      status: 'failure',
      reason,
      message: 'for a developer',
    });
    // A screen started on the week of Monday 9 November with the winter week's data, and the
    // appointment's move started.
    const movingOwn = (role: 'admin' | 'user' = 'user') => {
      const made = screenAt(EARLY, role);
      const started = made.screen.start();
      made.succeed();
      made.screen.move(OWN.appointmentId);
      return { ...made, started };
    };

    it('nothing is being moved at the start, nor after a week is loaded', () => {
      const { screen, succeed, states } = screenAt(EARLY);
      screen.start();
      succeed();
      expect(states.every((state) => state.moving === null)).toBe(true);
    });

    it('move() of an appointment of the week on screen: the stream names it in words, in one notification, and loads nothing', () => {
      const { screen, load, reload, succeed, states, last } = screenAt(EARLY);
      screen.start();
      succeed();
      const before = states.length;
      const week = last().week;
      screen.move(OWN.appointmentId);
      expect(states).toHaveLength(before + 1);
      expect(last()).toEqual({ label: '9 Nov – 15 Nov 2026', loading: false, failure: null, week, moving: MOVING });
      expect(last().week).toBe(week); // the same week object: the view need not redraw
      expect(load).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
    });

    it('for the Administrator the words carry the User\'s name', () => {
      const { last } = movingOwn('admin');
      expect(last().moving).toEqual({ ...MOVING, what: 'Mon 16 Nov, 11:00–12:00 · Studio · alice', who: 'alice' });
    });

    it('an appointment without a note is moved with an empty note', () => {
      const { screen, succeed, last } = screenAt(EARLY);
      screen.start();
      succeed({ ...winterWeek(), appointments: [{ ...OWN, note: null }] });
      screen.move(OWN.appointmentId);
      expect(last().moving).toEqual({ ...MOVING, note: '' });
    });

    it('nothing starts for an unknown appointment, for one that cannot be changed at this moment, or before start()', () => {
      const unknown = screenAt(EARLY);
      unknown.screen.start();
      unknown.succeed();
      unknown.screen.move('01M6DMQ000000000000000NONE');
      expect(unknown.last().moving).toBeNull();

      const late = screenAt(EARLY);
      late.screen.start();
      late.succeed();
      late.clock.now = '2026-11-15T10:00:00.001Z'; // one millisecond past cancellableUntil
      const before = late.states.length;
      late.screen.move(OWN.appointmentId);
      expect(late.last().moving).toBeNull();
      expect(late.states).toHaveLength(before);

      const early = screenAt(EARLY);
      early.screen.move(OWN.appointmentId);
      expect(early.last().moving).toBeNull();
      // Started, left and with its week still known: not started is not started.
      const left = screenAt(EARLY);
      const started = left.screen.start();
      left.succeed();
      started.unsubscribe();
      left.screen.move(OWN.appointmentId);
      expect(left.last().moving).toBeNull();
    });

    it('a change that succeeds ends the move and loads the week again', () => {
      const { reload, changeResult$, states, last } = movingOwn();
      const before = states.length;
      changeResult$.next(CHANGED);
      expect(last().moving).toBeNull();
      expect(states).toHaveLength(before + 1);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['booking_notice_too_short', 'about the new time'],
      ['slot_taken', 'about the new time'],
      ['appointment_not_found', 'about the old appointment'],
      ['appointment_not_active', 'about the old appointment'],
      ['cancellation_notice_too_short', 'about the old appointment'],
      ['user_not_found', 'about the old appointment'],
      ['network', 'about neither'],
    ] as const)('a change refused with %s (%s) keeps the move, and loads the week again', (reason, _about) => {
      const { reload, changeResult$, last } = movingOwn();
      changeResult$.next(refused(reason));
      expect(last().moving).toEqual(MOVING);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('a refusal, then a success: the move ends at the success', () => {
      const { changeResult$, last } = movingOwn();
      changeResult$.next(refused('slot_taken'));
      changeResult$.next(refused('slot_taken'));
      expect(last().moving).toEqual(MOVING);
      changeResult$.next(CHANGED);
      expect(last().moving).toBeNull();
    });

    it('keep() ends the move, in one notification, and loads nothing; a second keep() notifies nothing', () => {
      const { screen, load, reload, states, last } = movingOwn();
      const week = last().week;
      const before = states.length;
      screen.keep();
      expect(last()).toEqual({ label: '9 Nov – 15 Nov 2026', loading: false, failure: null, week, moving: null });
      screen.keep();
      expect(states).toHaveLength(before + 1);
      expect(load).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
    });

    it('keep() with nothing being moved notifies nothing', () => {
      const { screen, succeed, states } = screenAt(EARLY);
      screen.start();
      succeed();
      const before = states.length;
      screen.keep();
      expect(states).toHaveLength(before);
    });

    it('the end of the subscription of start() ends the move; started again, nothing is being moved', () => {
      const { screen, started, last } = movingOwn();
      started.unsubscribe();
      expect(last().moving).toBeNull();
      screen.start();
      expect(last().moving).toBeNull();
      const late: WeekState[] = [];
      screen.week$.subscribe((state) => late.push(state));
      expect(late[0]!.moving).toBeNull();
    });

    it('a change that succeeded before start() ends nothing: only a result that arrives while started does', () => {
      const made = screenAt(EARLY);
      made.changeResult$.next(CHANGED);
      made.screen.start();
      made.succeed();
      made.screen.move(OWN.appointmentId);
      expect(made.last().moving).toEqual(MOVING);
    });

    it('a reload keeps the move: while it is pending, at its success and at its failure', () => {
      const { state$, bookResult$, pending, succeed, fail, last } = movingOwn();
      bookResult$.next(BOOKED); // someone books meanwhile in this page: the week is loaded again
      state$.next({ status: 'pending' });
      expect(last()).toMatchObject({ loading: true, moving: MOVING });
      succeed();
      expect(last()).toMatchObject({ loading: false, moving: MOVING });
      pending();
      fail('network');
      expect(last()).toMatchObject({ failure: UNREACHABLE, moving: MOVING });
    });

    it('a reload that no longer holds the appointment keeps the move, with the words of the copy', () => {
      const { succeed, last } = movingOwn();
      succeed({ ...winterWeek(), appointments: [] });
      expect(last().moving).toEqual(MOVING);
      succeed({ ...winterWeek(), timeZone: 'Asia/Kolkata', appointments: [{ ...OWN, note: 'Another note' }] });
      expect(last().moving).toEqual(MOVING);
    });

    it('a notification of visible$ loads the week again and keeps the move', () => {
      const { reload, visible$, succeed, last } = movingOwn();
      visible$.next(undefined);
      expect(reload).toHaveBeenCalledTimes(1);
      succeed();
      expect(last().moving).toEqual(MOVING);
    });

    it('the other writes\' results keep the move: a booking, a cancellation, a note saved', () => {
      const { bookResult$, cancelResult$, updateNoteResult$, last } = movingOwn();
      bookResult$.next(BOOKED);
      cancelResult$.next(CANCELLED);
      updateNoteResult$.next({ status: 'success', appointment: OWN });
      expect(last().moving).toEqual(MOVING);
    });

    it('a move to another week and back keeps the move, and the words are still those of the copy', () => {
      const { screen, load, pending, succeed, last } = movingOwn();
      screen.next();
      pending();
      expect(last()).toMatchObject({ label: '16 Nov – 22 Nov 2026', loading: true, moving: MOVING });
      succeed(view('2026-11-16')); // a week that does not hold the appointment
      expect(last()).toMatchObject({ label: '16 Nov – 22 Nov 2026', loading: false, moving: MOVING });
      expect(screen.detail(OWN.appointmentId)).toBeNull(); // the week on screen no longer has it
      screen.next();
      succeed(view('2026-11-23', { timeZone: 'Asia/Kolkata' }));
      expect(last().moving).toEqual(MOVING);
      screen.previous();
      screen.previous();
      screen.today();
      succeed();
      expect(load).toHaveBeenCalledTimes(6);
      expect(last()).toMatchObject({ label: '9 Nov – 15 Nov 2026', moving: MOVING });
    });

    it('a change that succeeds while another week is on screen ends the move', () => {
      const { screen, changeResult$, succeed, last } = movingOwn();
      screen.next();
      succeed(view('2026-11-16'));
      changeResult$.next(CHANGED);
      expect(last()).toMatchObject({ label: '16 Nov – 22 Nov 2026', moving: null });
    });

    it('after a move ended another can start, also of another appointment', () => {
      const other = appointment({ start: '2026-11-17T09:00:00.000Z', end: '2026-11-17T10:00:00.000Z', date: '2026-11-17', cancellableUntil: '2026-11-16T09:00:00.000Z' });
      const { screen, succeed, last } = movingOwn();
      screen.keep();
      succeed({ ...winterWeek(), appointments: [OWN, other] });
      screen.move(other.appointmentId);
      expect(last().moving).toEqual({ appointmentId: other.appointmentId, when: 'Tue 17 Nov, 10:00–11:00', what: 'Tue 17 Nov, 10:00–11:00 · Studio', who: 'You', note: '' });
    });
  });

  describe('an appointment handed over by another screen', () => {
    // An appointment of Monday 7 December, three weeks after the week of "now".
    const HANDED = { appointmentId: '01M6DMQ0000000000000000009', when: 'Mon 7 Dec, 10:00–11:00', what: 'Mon 7 Dec, 10:00–11:00 · Studio', who: 'You', note: 'Handed over' };
    const CHANGED: ChangeResult = { status: 'success', cancelled: { ...BOOKED.appointment, status: 'cancelled', cancelReason: 'changed' }, booked: BOOKED.appointment };

    it('before start() it loads nothing and the stream says nothing of it', () => {
      const { screen, load, states } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      expect(load).not.toHaveBeenCalled();
      expect(states).toHaveLength(1);
      expect(states[0]!.moving).toBeNull();
    });

    it('it is taken at the next start(): the week of the appointment is loaded, not the week of today, and the banner\'s words are those handed over', () => {
      const { screen, load, pending, succeed, last } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith('2026-12-07', '2026-12-13');
      expect(last()).toEqual({ label: '7 Dec – 13 Dec 2026', loading: false, failure: null, week: null, moving: HANDED });
      pending();
      succeed(view('2026-12-07'));
      expect(last()).toEqual({ label: '7 Dec – 13 Dec 2026', loading: false, failure: null, week: weekModel(view('2026-12-07'), 'user'), moving: HANDED });
    });

    it.each([
      ['a Monday', '2026-12-07'],
      ['a Thursday', '2026-12-10'],
      ['a Sunday', '2026-12-13'],
    ])('the week is the one that holds the date, %s', (_name, date) => {
      const { screen, load } = screenAt();
      screen.handOver(HANDED, date);
      screen.start();
      expect(load).toHaveBeenCalledWith('2026-12-07', '2026-12-13');
    });

    it('not the week it was left on either; the week shown meanwhile is the one the service last answered', () => {
      const { screen, load, succeed, last } = screenAt();
      const started = screen.start();
      screen.previous();
      succeed(view('2026-11-09'));
      started.unsubscribe();

      screen.handOver(HANDED, '2026-12-07');
      screen.start();
      expect(load).toHaveBeenLastCalledWith('2026-12-07', '2026-12-13');
      expect(last()).toMatchObject({ label: '7 Dec – 13 Dec 2026', moving: HANDED });
    });

    it('it is taken once: after the screen is left, the next start() moves nothing and loads the week it was left on', () => {
      const { screen, load, last } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      const started = screen.start();
      started.unsubscribe();
      expect(last().moving).toBeNull();

      screen.start();
      expect(last().moving).toBeNull();
      expect(load).toHaveBeenLastCalledWith('2026-12-07', '2026-12-13');
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('made while the screen is started, it is taken at once: its week loaded, the appointment being moved', () => {
      const { screen, load, succeed, states, last } = screenAt();
      screen.start();
      succeed();
      const before = states.length;
      screen.handOver(HANDED, '2026-12-07');
      expect(load).toHaveBeenCalledTimes(2);
      expect(load).toHaveBeenLastCalledWith('2026-12-07', '2026-12-13');
      expect(states).toHaveLength(before + 1);
      expect(last()).toMatchObject({ label: '7 Dec – 13 Dec 2026', moving: HANDED });
      // And it is not taken a second time.
      screen.keep();
      screen.start().unsubscribe();
      expect(last().moving).toBeNull();
    });

    it('a second hand-over before the start replaces the first', () => {
      const { screen, load, last } = screenAt();
      screen.handOver({ ...HANDED, appointmentId: 'first' }, '2026-11-30');
      screen.handOver(HANDED, '2026-12-07');
      screen.start();
      expect(load).toHaveBeenCalledWith('2026-12-07', '2026-12-13');
      expect(last().moving).toEqual(HANDED);
    });

    it('the move it starts is like any other: any week, a reload and a refusal keep it', () => {
      const { screen, changeResult$, visible$, succeed, last } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      screen.start();
      succeed(view('2026-12-07'));
      screen.next();
      screen.today();
      succeed();
      visible$.next(undefined);
      changeResult$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      expect(last()).toMatchObject({ label: '16 Nov – 22 Nov 2026', moving: HANDED });
    });

    it('it ends at a change that succeeds, which also loads the week again', () => {
      const { screen, reload, changeResult$, last } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      screen.start();
      changeResult$.next(CHANGED);
      expect(last().moving).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('it ends at keep()', () => {
      const { screen, last } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      screen.start();
      screen.keep();
      expect(last()).toMatchObject({ label: '7 Dec – 13 Dec 2026', moving: null });
    });

    it('it ends at the end of the subscription of start()', () => {
      const { screen, last } = screenAt();
      screen.handOver(HANDED, '2026-12-07');
      screen.start().unsubscribe();
      expect(last().moving).toBeNull();
    });

    it('it replaces a move started in the week', () => {
      const { screen, succeed, last } = screenAt('2026-11-14T10:00:00.000Z');
      screen.start();
      succeed();
      screen.move(winterWeek().appointments[0]!.appointmentId);
      expect(last().moving).not.toBeNull();
      screen.handOver(HANDED, '2026-12-07');
      expect(last().moving).toEqual(HANDED);
    });
  });
});
