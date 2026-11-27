import type { CalendarSettings } from '@shared-calendar/shared';
import { ReplaySubject, Subject } from 'rxjs';
import { appointmentDetail, movingOf } from '../../../src/logic/appointment.detail';
import { appointmentRows } from '../../../src/logic/appointments.model';
import { AppointmentsScreen, type ListAppointments, type ListSettings, type ListState, type ListWeek } from '../../../src/logic/appointments.screen';
import type { AppointmentsResult, CancelResult, UpdateNoteResult } from '../../../src/services/appointments.types';
import type { SettingsResult } from '../../../src/services/calendar-settings.types';
import { appointment } from './fixtures';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// A fake CalendarSettingsService and a fake AppointmentsService (result streams that replay
// their last value, as the real ones do, and spies), a fake WeekScreen (a spy), a stream for
// the page becoming visible and a fixed "now": no network, no DOM, no clock.

const NOW = '2026-11-19T10:00:00.000Z'; // Thursday 19 November 2026, 11:00 in Rome
const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const z = (instant: string) => `${instant}:00.000Z`;

const SETTINGS: CalendarSettings = {
  timeZone: 'Europe/Rome',
  cancellationNoticeHours: 24,
  minBookingNoticeHours: 0,
  bookingHorizonDays: 56,
  maxFutureAppointmentsPerUser: null,
  updatedAt: null,
  updatedBy: null,
};

// Monday 23 November, 10:00–11:00 in Rome: it can be changed until Sunday 22 at 10:00.
const BOOKED = appointment({ appointmentId: 'booked', start: z('2026-11-23T09:00'), end: z('2026-11-23T10:00'), date: '2026-11-23', note: 'First lesson', cancellableUntil: z('2026-11-22T09:00') });
// Monday 16 November: over at "now".
const ENDED = appointment({ appointmentId: 'ended', start: z('2026-11-16T09:00'), end: z('2026-11-16T10:00'), date: '2026-11-16', cancellableUntil: z('2026-11-15T09:00') });
const CANCELLED = appointment({ appointmentId: 'cancelled', start: z('2026-11-17T09:00'), end: z('2026-11-17T10:00'), date: '2026-11-17', status: 'cancelled', cancelReason: 'cancelled' });
const CHANGED = appointment({ appointmentId: 'changed', start: z('2026-11-18T09:00'), end: z('2026-11-18T10:00'), date: '2026-11-18', status: 'cancelled', cancelReason: 'changed' });
const ALL = [ENDED, CANCELLED, CHANGED, BOOKED];

const UPCOMING = { upcoming: 'true' };
const LAST_30_DAYS = { from: '2026-10-21', to: '2026-11-19' };
const START: ListState = { mode: 'upcoming', period: null, loading: false, failure: null, refusal: null, rows: null, empty: null };

function screenAt(now = NOW, role: 'admin' | 'user' = 'user') {
  const settingsResult$ = new ReplaySubject<SettingsResult>(1);
  const appointmentsResult$ = new ReplaySubject<AppointmentsResult>(1);
  const cancelResult$ = new ReplaySubject<CancelResult>(1);
  const updateNoteResult$ = new ReplaySubject<UpdateNoteResult>(1);
  const visible$ = new Subject<unknown>();
  const load = vi.fn<ListSettings['load']>();
  const list = vi.fn<ListAppointments['list']>();
  const handOver = vi.fn<ListWeek['handOver']>();
  const clock = { now };
  const screen = new AppointmentsScreen(
    { load, settingsResult$: settingsResult$.asObservable() },
    { list, appointmentsResult$: appointmentsResult$.asObservable(), cancelResult$: cancelResult$.asObservable(), updateNoteResult$: updateNoteResult$.asObservable() },
    { handOver },
    role,
    () => new Date(clock.now),
    visible$,
  );
  const states: ListState[] = [];
  const view$ = screen.list$.subscribe((s) => states.push(s)); // the view subscribes first
  const zone = (timeZone = 'Europe/Rome') => settingsResult$.next({ status: 'success', settings: { ...SETTINGS, timeZone } });
  const answer = (appointments = ALL) => appointmentsResult$.next({ status: 'success', appointments });
  const fail = (reason: 'network' | 'internal_error' | 'invalid_request' = 'network') => appointmentsResult$.next({ status: 'failure', reason, message: 'for a developer' });
  // Started, the zone known and the upcoming list answered.
  const listed = (appointments = ALL) => {
    const started = screen.start();
    zone();
    answer(appointments);
    return started;
  };
  return { screen, settingsResult$, appointmentsResult$, cancelResult$, updateNoteResult$, visible$, load, list, handOver, clock, states, view$, zone, answer, fail, listed, last: () => states.at(-1)! };
}

const CANCEL_OK: CancelResult = { status: 'success', appointment: { ...BOOKED, status: 'cancelled' } };
const NOTE_OK: UpdateNoteResult = { status: 'success', appointment: { ...BOOKED, note: 'Second lesson' } };

describe('AppointmentsScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is asked for and no stream is listened to; the screen is on "upcoming", with no list', () => {
      const { load, list, states, settingsResult$, appointmentsResult$, cancelResult$, updateNoteResult$, visible$ } = screenAt();
      expect(load).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect([settingsResult$, appointmentsResult$, cancelResult$, updateNoteResult$, visible$].map((s) => s.observed)).toEqual([false, false, false, false, false]);
      expect(states).toEqual([START]);
    });

    it('a change of mode changes the state and still asks for nothing', () => {
      const { screen, load, list, last } = screenAt();
      screen.history();
      expect(last()).toEqual({ ...START, mode: 'history' });
      screen.upcoming();
      expect(last()).toEqual(START);
      expect(load).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('the zone comes from the settings, before the first list', () => {
    it('start() reads the settings, once, says it is loading, and asks for no list yet', () => {
      const { screen, load, list, last } = screenAt();
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();
      expect(last()).toEqual({ ...START, loading: true });
    });

    it('once the zone is known the upcoming list is asked for, and the settings are not read again', () => {
      const { screen, load, list, zone, last } = screenAt();
      screen.start();
      zone();
      expect(list).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledWith(UPCOMING);
      expect(load).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, loading: true });
    });

    it('the list arrives: its rows, in the zone the settings named', () => {
      const rome = screenAt();
      rome.listed([BOOKED]);
      expect(rome.last()).toEqual({ ...START, rows: appointmentRows([BOOKED], new Date(NOW), 'Europe/Rome') });
      expect(rome.last().rows![0]).toMatchObject({ date: 'Mon 23 Nov', time: '10:00–11:00', status: 'Booked' });

      const kolkata = screenAt();
      kolkata.screen.start();
      kolkata.zone('Asia/Kolkata');
      kolkata.answer([BOOKED]);
      expect(kolkata.last().rows![0]).toMatchObject({ time: '14:30–15:30' });
    });

    it('a failed read: the failure in plain words in the place of the list, never the service\'s message, and no list asked for', () => {
      const { screen, settingsResult$, list, last } = screenAt();
      screen.start();
      settingsResult$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(last()).toEqual({ ...START, failure: UNREACHABLE });
      expect(list).not.toHaveBeenCalled();
    });

    it.each(['upcoming', 'history'] as const)('after a failed read, choosing %s tries the settings again; their answer then loads that list', (mode) => {
      const { screen, settingsResult$, load, list, zone, answer, last } = screenAt();
      screen.start();
      settingsResult$.next({ status: 'failure', reason: 'internal_error', message: 'boom' });
      screen[mode]();
      expect(load).toHaveBeenCalledTimes(2);
      expect(list).not.toHaveBeenCalled();
      // The failure stays while the next try is pending.
      expect(last()).toMatchObject({ mode, loading: true, failure: 'Something went wrong on the server. Please try again in a moment.' });

      zone();
      expect(list).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledWith(mode === 'upcoming' ? UPCOMING : { ...LAST_30_DAYS, status: 'all' });
      answer([]);
      expect(last()).toMatchObject({ loading: false, failure: null, rows: [] });
    });

    it('a second failed read replaces the first', () => {
      const { screen, settingsResult$, last } = screenAt();
      screen.start();
      settingsResult$.next({ status: 'failure', reason: 'network', message: 'x' });
      screen.upcoming();
      settingsResult$.next({ status: 'failure', reason: 'forbidden', message: 'x' });
      expect(last()).toMatchObject({ loading: false, failure: 'Your account is not allowed to do this.' });
    });

    it('the settings answered before start() are not this start\'s: the read is made again and waited for', () => {
      const { screen, load, list, zone } = screenAt();
      zone();
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();
      zone();
      expect(list).toHaveBeenCalledTimes(1);
    });

    it('a list answered while the zone is not known is an earlier one\'s, and is not shown', () => {
      const { screen, answer, last } = screenAt();
      screen.start();
      answer([BOOKED]);
      expect(last()).toEqual({ ...START, loading: true });
    });
  });

  describe('the two modes', () => {
    it('history, the first time: the 30 days that end today, loaded at once with every status', () => {
      const { screen, list, listed, last } = screenAt();
      listed();
      screen.history();
      expect(list).toHaveBeenLastCalledWith({ ...LAST_30_DAYS, status: 'all' });
      expect(last()).toEqual({ ...START, mode: 'history', period: LAST_30_DAYS, loading: true });
    });

    it.each([
      // Thursday 23:30 in Rome: already Friday in the browser's zone of the test (UTC+14).
      ['the browser is on the next day', '2026-11-19T22:30:00.000Z', 'Europe/Rome', '2026-10-21', '2026-11-19'],
      // Friday 00:30 in Rome: still Thursday in UTC.
      ['UTC is on the day before', '2026-11-19T23:30:00.000Z', 'Europe/Rome', '2026-10-22', '2026-11-20'],
      // The zone the settings name, not the default one: Friday 00:30 in Kolkata, Thursday 20:00 in Rome.
      ['the calendar is in another zone', '2026-11-19T19:00:00.000Z', 'Asia/Kolkata', '2026-10-22', '2026-11-20'],
    ])('today, for the default period, is the date of "now" in the calendar\'s zone: %s', (_name, now, timeZone, from, to) => {
      const { screen, list, zone } = screenAt(now);
      screen.start();
      zone(timeZone);
      screen.history();
      expect(list).toHaveBeenLastCalledWith({ from, to, status: 'all' });
    });

    it('the history answered: every status in words, in the server\'s order', () => {
      const { screen, listed, answer, last } = screenAt();
      listed();
      screen.history();
      answer(ALL);
      expect(last().rows!.map((row) => [row.appointmentId, row.status])).toEqual([
        ['ended', 'Ended'],
        ['cancelled', 'Cancelled'],
        ['changed', 'Changed'],
        ['booked', 'Booked'],
      ]);
      expect(last()).toMatchObject({ mode: 'history', period: LAST_30_DAYS, loading: false, empty: null });
    });

    it('an empty list says so, with the sentence of its mode', () => {
      const { screen, listed, answer, last } = screenAt();
      listed([]);
      expect(last()).toMatchObject({ rows: [], empty: 'You have no upcoming appointments.' });
      screen.history();
      answer([]);
      expect(last()).toMatchObject({ rows: [], empty: 'There are no appointments in this period.' });
      screen.upcoming();
      answer([BOOKED]);
      expect(last().empty).toBeNull();
    });

    it('another mode forgets the list on show, which is not its own, in the notification that says it is loading', () => {
      const { screen, listed, states, last } = screenAt();
      listed();
      const before = states.length;
      screen.history();
      expect(states).toHaveLength(before + 1);
      expect(last()).toMatchObject({ mode: 'history', loading: true, rows: null, empty: null });
      expect(screen.detail('booked')).toBeNull();
    });

    it('the same mode chosen again loads it again and keeps the list meanwhile', () => {
      const { screen, list, listed, last } = screenAt();
      listed();
      const rows = last().rows;
      screen.upcoming();
      expect(list).toHaveBeenCalledTimes(2);
      expect(list).toHaveBeenLastCalledWith(UPCOMING);
      expect(last()).toMatchObject({ loading: true });
      expect(last().rows).toBe(rows);
      expect(screen.detail('booked')).not.toBeNull();
    });

    it('a change of mode while a load is under way: the list asked for last is the one shown', () => {
      const { screen, list, zone, answer, last } = screenAt();
      screen.start();
      zone();
      screen.history(); // the upcoming list has not been answered
      expect(list).toHaveBeenCalledTimes(2);
      // The service drops the call it replaced: the one answer that arrives is the history's.
      answer([CANCELLED]);
      expect(last()).toMatchObject({ mode: 'history', loading: false });
      expect(last().rows!.map((row) => row.status)).toEqual(['Cancelled']);
    });

    it('back to the history: the period it was on, not the default one again', () => {
      const { screen, list, listed, clock } = screenAt();
      listed();
      screen.show('2026-09-01', '2026-09-30');
      screen.upcoming();
      clock.now = '2026-11-25T10:00:00.000Z';
      screen.history();
      expect(list).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30', status: 'all' });
    });
  });

  describe('show(from, to): the period of the history', () => {
    const inHistory = () => {
      const made = screenAt();
      made.listed();
      made.screen.history();
      made.answer(ALL);
      return made;
    };

    it('another period is loaded at once, and the list of the period before is forgotten', () => {
      const { screen, list, last } = inHistory();
      screen.show('2026-09-01', '2026-12-01');
      expect(list).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-12-01', status: 'all' });
      expect(last()).toEqual({ ...START, mode: 'history', period: { from: '2026-09-01', to: '2026-12-01' }, loading: true });
    });

    it('a period may hold future dates', () => {
      const { screen, list } = inHistory();
      screen.show('2026-12-01', '2027-01-31');
      expect(list).toHaveBeenLastCalledWith({ from: '2026-12-01', to: '2027-01-31', status: 'all' });
    });

    it('the same period shown again loads it again, keeps the list and keeps the same period object', () => {
      const { screen, list, last } = inHistory();
      const { period, rows } = last();
      screen.show(LAST_30_DAYS.from, LAST_30_DAYS.to);
      expect(list).toHaveBeenCalledTimes(3);
      expect(last().period).toBe(period);
      expect(last().rows).toBe(rows);
      expect(last().loading).toBe(true);
    });

    it.each([
      ['a date missing', '', '2026-11-19', 'Choose both dates.'],
      ['the other date missing', '2026-11-01', '', 'Choose both dates.'],
      ['the first date after the last', '2026-11-19', '2026-11-01', 'The first date is after the last one.'],
      ['a period of 93 days', '2026-09-01', '2026-12-02', 'A period can be at most 92 days long. Choose a shorter one.'],
    ])('%s is refused in plain words: no call, and the list, the period and the mode stay', (_name, from, to, sentence) => {
      const { screen, list, states, last } = inHistory();
      const shown = last();
      const before = states.length;
      screen.show(from, to);
      expect(list).toHaveBeenCalledTimes(2);
      expect(states).toHaveLength(before + 1);
      expect(last()).toEqual({ ...shown, refusal: sentence });
      expect(last().rows).toBe(shown.rows);
      expect(last().period).toBe(shown.period);
    });

    it('a refusal goes at the next period accepted and at a change of mode; a reload leaves it', () => {
      const { screen, visible$, answer, last } = inHistory();
      screen.show('', '');
      visible$.next(undefined);
      answer(ALL);
      expect(last().refusal).toBe('Choose both dates.');
      screen.show('2026-11-01', '2026-11-19');
      expect(last().refusal).toBeNull();
      screen.show('', '');
      screen.upcoming();
      expect(last().refusal).toBeNull();
    });

    it('a period the service refuses is the service\'s to say: its failure in plain words', () => {
      const { screen, fail, last } = inHistory();
      screen.show('2026-11-01', '2026-11-19');
      fail('invalid_request');
      expect(last()).toMatchObject({ loading: false, failure: 'The request was not accepted. Check what you entered and try again.' });
    });
  });

  describe('failures of the list', () => {
    it('a first list that fails: no list, the failure in plain words', () => {
      const { screen, zone, fail, last } = screenAt();
      screen.start();
      zone();
      fail('network');
      expect(last()).toEqual({ ...START, failure: UNREACHABLE });
    });

    it('a list loaded again that fails keeps the last list and carries the failure; the detail still answers', () => {
      const { screen, listed, fail, last } = screenAt();
      listed();
      const rows = last().rows;
      screen.upcoming();
      fail('internal_error');
      expect(last()).toMatchObject({ loading: false, failure: 'Something went wrong on the server. Please try again in a moment.' });
      expect(last().rows).toBe(rows);
      expect(screen.detail('booked')).not.toBeNull();
    });

    it('the failure stays while the next load is pending, and goes at a success', () => {
      const { screen, listed, fail, answer, last } = screenAt();
      listed();
      screen.upcoming();
      fail('network');
      screen.upcoming();
      expect(last()).toMatchObject({ loading: true, failure: UNREACHABLE });
      answer([BOOKED]);
      expect(last()).toMatchObject({ loading: false, failure: null });
    });
  });

  describe('the list is loaded again', () => {
    it('after a cancellation, at its success and at its failure', () => {
      const { list, cancelResult$, listed } = screenAt();
      listed();
      cancelResult$.next(CANCEL_OK);
      expect(list).toHaveBeenCalledTimes(2);
      cancelResult$.next({ status: 'failure', reason: 'cancellation_notice_too_short', message: 'too late' });
      expect(list).toHaveBeenCalledTimes(3);
      cancelResult$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(list).toHaveBeenCalledTimes(4);
      expect(list).toHaveBeenLastCalledWith(UPCOMING);
    });

    it('after a note saved, at its success and at its failure', () => {
      const { list, updateNoteResult$, listed } = screenAt();
      listed();
      updateNoteResult$.next(NOTE_OK);
      expect(list).toHaveBeenCalledTimes(2);
      updateNoteResult$.next({ status: 'failure', reason: 'appointment_not_active', message: 'ended' });
      expect(list).toHaveBeenCalledTimes(3);
    });

    it('at every notification of the page becoming visible', () => {
      const { list, visible$, listed } = screenAt();
      listed();
      visible$.next(undefined);
      visible$.next(undefined);
      expect(list).toHaveBeenCalledTimes(3);
    });

    it('it is the list on show that is loaded again: the history over its period, and the list stays meanwhile', () => {
      const { screen, list, load, cancelResult$, visible$, listed, answer, last } = screenAt();
      listed();
      screen.show('2026-09-01', '2026-09-30');
      answer(ALL);
      const rows = last().rows;
      cancelResult$.next(CANCEL_OK);
      expect(list).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30', status: 'all' });
      expect(last()).toMatchObject({ loading: true });
      expect(last().rows).toBe(rows);
      visible$.next(undefined);
      expect(list).toHaveBeenCalledTimes(4);
      // The settings are read once for a start, whatever is loaded again.
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('a result that was already there at start() loads nothing again; the next one does', () => {
      const { screen, list, load, cancelResult$, updateNoteResult$, zone } = screenAt();
      cancelResult$.next(CANCEL_OK);
      updateNoteResult$.next(NOTE_OK);
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      zone();
      expect(list).toHaveBeenCalledTimes(1);
      updateNoteResult$.next(NOTE_OK);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('while the zone is not known, a notification reads the settings again', () => {
      const { screen, load, list, visible$ } = screenAt();
      screen.start();
      visible$.next(undefined);
      expect(load).toHaveBeenCalledTimes(2);
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('after the subscription of start() ends', () => {
    it('nothing is asked for and no stream is heard; the state has no list, no failure and no refusal', () => {
      const made = screenAt();
      const started = made.listed();
      made.screen.history();
      made.fail('network');
      made.screen.show('', '');
      started.unsubscribe();
      expect(made.last()).toEqual({ ...START, mode: 'history', period: LAST_30_DAYS });
      expect([made.settingsResult$, made.appointmentsResult$, made.cancelResult$, made.updateNoteResult$, made.visible$].map((s) => s.observed)).toEqual([false, false, false, false, false]);

      const calls = [made.load.mock.calls.length, made.list.mock.calls.length];
      made.cancelResult$.next(CANCEL_OK);
      made.updateNoteResult$.next(NOTE_OK);
      made.visible$.next(undefined);
      made.zone();
      made.answer(ALL);
      made.screen.upcoming();
      made.screen.history();
      made.screen.show('2026-09-01', '2026-09-30');
      expect([made.load.mock.calls.length, made.list.mock.calls.length]).toEqual(calls);
      expect(made.last()).toEqual({ ...START, mode: 'history', period: { from: '2026-09-01', to: '2026-09-30' } });
      expect(made.screen.detail('booked')).toBeNull();
    });

    it('started again: the settings read again, then the mode and the period it was left on', () => {
      const { screen, load, list, listed, zone, answer, last } = screenAt();
      const started = listed();
      screen.show('2026-09-01', '2026-09-30');
      answer(ALL);
      started.unsubscribe();

      screen.start();
      expect(load).toHaveBeenCalledTimes(2);
      expect(list).toHaveBeenCalledTimes(2);
      expect(last()).toEqual({ ...START, mode: 'history', period: { from: '2026-09-01', to: '2026-09-30' }, loading: true });
      zone();
      expect(list).toHaveBeenCalledTimes(3);
      expect(list).toHaveBeenLastCalledWith({ from: '2026-09-01', to: '2026-09-30', status: 'all' });
      answer([CHANGED]);
      expect(last().rows!.map((row) => row.status)).toEqual(['Changed']);
    });

    it('left on "upcoming", it starts again on "upcoming"; the old results still load nothing', () => {
      const { screen, list, cancelResult$, listed, zone } = screenAt();
      const started = listed();
      cancelResult$.next(CANCEL_OK);
      started.unsubscribe();
      screen.start();
      zone();
      expect(list).toHaveBeenCalledTimes(3);
      expect(list).toHaveBeenLastCalledWith(UPCOMING);
    });
  });

  describe('detail(appointmentId)', () => {
    it('an appointment of the list, ready to show, at the "now" given and in the zone of the settings', () => {
      const { screen, listed } = screenAt();
      listed();
      expect(screen.detail('booked')).toEqual(appointmentDetail(PAGE_TEXTS_EN, BOOKED, 'user', new Date(NOW), 'Europe/Rome'));
      expect(screen.detail('booked')).toMatchObject({
        when: 'Mon 23 Nov, 10:00–11:00',
        who: 'You',
        canEditNote: true,
        canChange: true,
        canCancel: true,
        hint: 'It can be changed or cancelled until Sun 22 Nov, 10:00.',
      });
    });

    it.each([
      ['ended', 'This appointment has ended.'],
      ['cancelled', 'This appointment was cancelled.'],
      ['changed', 'This appointment was moved to another time.'],
    ])('an appointment that %s: its sentence, and nothing offered', (id, hint) => {
      const { screen, listed } = screenAt();
      listed();
      expect(screen.detail(id)).toMatchObject({ canEditNote: false, canChange: false, canCancel: false, hint });
    });

    it('"now" is read when the detail is asked for, not when the list was loaded', () => {
      const { screen, clock, listed } = screenAt();
      listed();
      clock.now = '2026-11-22T09:00:00.001Z'; // the page stayed open past cancellableUntil
      expect(screen.detail('booked')).toMatchObject({ canChange: false, canEditNote: true, hint: 'It is too late to change or cancel this appointment.' });
    });

    it('the texts follow the zone the settings name', () => {
      const { screen, zone, answer } = screenAt();
      screen.start();
      zone('Asia/Kolkata');
      answer(ALL);
      expect(screen.detail('booked')!.when).toBe('Mon 23 Nov, 14:30–15:30');
    });

    it('an id the list does not hold, and any id before a list is loaded, is null', () => {
      const { screen, zone, answer } = screenAt();
      expect(screen.detail('booked')).toBeNull();
      screen.start();
      zone();
      expect(screen.detail('booked')).toBeNull();
      answer([ENDED]);
      expect(screen.detail('booked')).toBeNull();
      expect(screen.detail('ended')).not.toBeNull();
    });

    it('for the role given: the Administrator would read the User\'s name', () => {
      const { screen, listed } = screenAt(NOW, 'admin');
      listed();
      expect(screen.detail('booked')).toMatchObject({ who: 'alice', hint: '' });
    });
  });

  describe('move(appointmentId): the hand-over to the week screen', () => {
    it('hands over the appointment\'s copy in words, made in the zone of the settings, and its date', () => {
      const { screen, handOver, list, listed } = screenAt();
      listed();
      screen.move('booked');
      expect(handOver).toHaveBeenCalledTimes(1);
      expect(handOver).toHaveBeenCalledWith(
        { appointmentId: 'booked', when: 'Mon 23 Nov, 10:00–11:00', what: 'Mon 23 Nov, 10:00–11:00 · Studio', who: 'You', note: 'First lesson' },
        '2026-11-23',
      );
      expect(handOver.mock.calls[0]![0]).toEqual(movingOf(appointmentDetail(PAGE_TEXTS_EN, BOOKED, 'user', new Date(NOW), 'Europe/Rome'), 'user'));
      expect(list).toHaveBeenCalledTimes(1); // handing over asks nothing of the server
    });

    it('the words follow the zone the settings name', () => {
      const { screen, handOver, zone, answer } = screenAt();
      screen.start();
      zone('Asia/Kolkata');
      answer(ALL);
      screen.move('booked');
      expect(handOver.mock.calls[0]![0]).toMatchObject({ when: 'Mon 23 Nov, 14:30–15:30' });
    });

    it('nothing is handed over for an appointment the list does not hold, or that cannot be changed at this moment', () => {
      const { screen, handOver, clock, listed } = screenAt();
      screen.move('booked'); // before any list
      listed();
      screen.move('unknown');
      for (const id of ['ended', 'cancelled', 'changed']) screen.move(id);
      clock.now = '2026-11-22T09:00:00.001Z'; // one millisecond past cancellableUntil
      screen.move('booked');
      expect(handOver).not.toHaveBeenCalled();
    });
  });

  it('a late subscriber gets the current state at once', () => {
    const { screen, listed } = screenAt();
    listed();
    const late: ListState[] = [];
    screen.list$.subscribe((s) => late.push(s));
    expect(late).toHaveLength(1);
    expect(late[0]!.rows).toHaveLength(4);
  });
});
