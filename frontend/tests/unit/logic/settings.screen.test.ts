import type { CalendarSettings } from '@shared-calendar/shared';
import { ReplaySubject } from 'rxjs';
import { settingsFields, settingsInfo, type SettingsFields } from '../../../src/logic/settings.model';
import { SettingsScreen, type SettingsCalls, type SettingsState } from '../../../src/logic/settings.screen';
import type { SettingsResult, UpdateSettingsResult } from '../../../src/services/calendar-settings.types';
import { useFarBrowserZone } from './zone';

// A fake CalendarSettingsService: two result streams that replay their last value, as the real
// ones do, and two spies. No network, no DOM.

const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const DEFAULTS: CalendarSettings = { timeZone: 'Europe/Rome', cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: null, updatedBy: null };
const SAVED: CalendarSettings = { ...DEFAULTS, cancellationNoticeHours: 48, maxFutureAppointmentsPerUser: 5, updatedAt: '2026-11-19T15:44:09.338Z', updatedBy: { username: 'admin', role: 'admin' } };
const TYPED: SettingsFields = { cancellationNoticeHours: '48', minBookingNoticeHours: '0', bookingHorizonDays: '56', maxFutureAppointmentsPerUser: '5', noLimit: false };
const BODY = { cancellationNoticeHours: 48, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 5 };
const START: SettingsState = { loading: false, unread: null, fields: null, info: null, saving: false, refusals: {}, failure: null, saved: false };

function screenOf() {
  const settingsResult$ = new ReplaySubject<SettingsResult>(1);
  const updateResult$ = new ReplaySubject<UpdateSettingsResult>(1);
  const load = vi.fn<SettingsCalls['load']>();
  const update = vi.fn<SettingsCalls['update']>();
  const screen = new SettingsScreen({ load, update, settingsResult$: settingsResult$.asObservable(), updateResult$: updateResult$.asObservable() });
  const states: SettingsState[] = [];
  screen.settings$.subscribe((s) => states.push(s)); // the view subscribes first
  const read = (settings = DEFAULTS) => settingsResult$.next({ status: 'success', settings });
  const unread = (reason: 'network' | 'forbidden' | 'internal_error' = 'network') => settingsResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const answered = (settings = SAVED) => updateResult$.next({ status: 'success', settings });
  const refused = (reason: 'concurrent_update' | 'network' | 'invalid_request' | 'forbidden' = 'network') => updateResult$.next({ status: 'failure', reason, message: 'for a developer' });
  // Started, with the settings read.
  const shown = (settings = DEFAULTS) => {
    const started = screen.start();
    read(settings);
    return started;
  };
  return { screen, settingsResult$, updateResult$, load, update, states, read, unread, answered, refused, shown, last: () => states.at(-1)! };
}

describe('SettingsScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is read, no stream is listened to, and the state is empty', () => {
      const { load, update, states, settingsResult$, updateResult$ } = screenOf();
      expect(load).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect([settingsResult$.observed, updateResult$.observed]).toEqual([false, false]);
      expect(states).toEqual([START]);
    });

    it('save(), retry() and edited() do nothing', () => {
      const { screen, load, update, states } = screenOf();
      screen.save(TYPED);
      screen.save({ ...TYPED, bookingHorizonDays: '' });
      screen.retry();
      screen.edited();
      expect([load.mock.calls.length, update.mock.calls.length, states.length]).toEqual([0, 0, 1]);
    });
  });

  describe('reading', () => {
    it('start() reads the settings, once, and says it is loading, with no form yet', () => {
      const { screen, load, last } = screenOf();
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, loading: true });
    });

    it('the settings arrive: the fields to fill, and what the form says beside them', () => {
      const { shown, last } = screenOf();
      shown(SAVED);
      expect(last()).toEqual({ ...START, fields: settingsFields(SAVED), info: settingsInfo(SAVED) });
      expect(last().info).toEqual({ timeZone: 'Europe/Rome', lastSaved: 'Last saved by admin on Thu 19 Nov, 16:44' });
    });

    it('a failed read: why, in plain words, never the service\'s message, and no form', () => {
      const { screen, unread, last } = screenOf();
      screen.start();
      unread('network');
      expect(last()).toEqual({ ...START, unread: UNREACHABLE });
    });

    it('retry() reads again; the failure stays while it is under way, and goes when the settings arrive', () => {
      const { screen, load, unread, read, last } = screenOf();
      screen.start();
      unread('internal_error');
      screen.retry();
      expect(load).toHaveBeenCalledTimes(2);
      expect(last()).toEqual({ ...START, loading: true, unread: 'Something went wrong on the server. Please try again in a moment.' });
      unread('forbidden');
      expect(last()).toEqual({ ...START, unread: 'Your account is not allowed to do this.' });
      screen.retry();
      read();
      expect(last()).toEqual({ ...START, fields: settingsFields(DEFAULTS), info: settingsInfo(DEFAULTS) });
    });

    it('settings that were already answered before start() are not this start\'s: the read is made and waited for', () => {
      const { screen, load, read, last } = screenOf();
      read(SAVED); // asked for by another screen of the session, earlier
      screen.start();
      expect(load).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, loading: true });
      read(DEFAULTS);
      expect(last().fields).toEqual(settingsFields(DEFAULTS));
    });
  });

  describe('save(fields)', () => {
    it('with every field right: the four values go to the service, once, and the screen says it is saving', () => {
      const { screen, update, load, shown, last } = screenOf();
      shown();
      const { fields } = last();
      screen.save(TYPED);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(BODY);
      expect(load).toHaveBeenCalledTimes(1);
      expect(last()).toMatchObject({ saving: true, refusals: {}, failure: null, saved: false });
      expect(last().fields).toBe(fields); // the form is not filled again: what was typed stays
    });

    it('"No limit" ticked: null goes', () => {
      const { screen, update, shown } = screenOf();
      shown();
      screen.save({ ...TYPED, noLimit: true, maxFutureAppointmentsPerUser: '' });
      expect(update).toHaveBeenCalledWith({ ...BODY, maxFutureAppointmentsPerUser: null });
    });

    it('with a field in fault: its refusal, no call, and everything else as it was', () => {
      const { screen, update, load, shown, states, last } = screenOf();
      shown(SAVED);
      const before = last();
      screen.save({ ...TYPED, bookingHorizonDays: '366', maxFutureAppointmentsPerUser: '' });
      expect(update).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({
        ...before,
        refusals: {
          bookingHorizonDays: 'Booking horizon must be a whole number from 1 to 365.',
          maxFutureAppointmentsPerUser: 'Maximum upcoming appointments per person must be a whole number from 1 to 100.',
        },
      });
      expect(last().fields).toBe(before.fields);
      expect(states.filter((s) => s.saving)).toHaveLength(0);
    });

    it('the refusals go at the next save that is sent, and are replaced by the next ones', () => {
      const { screen, shown, last } = screenOf();
      shown();
      screen.save({ ...TYPED, bookingHorizonDays: '' });
      screen.save({ ...TYPED, cancellationNoticeHours: 'x' });
      expect(Object.keys(last().refusals)).toEqual(['cancellationNoticeHours']);
      screen.save(TYPED);
      expect(last().refusals).toEqual({});
    });

    it('a save that succeeds: "saved", the form filled with what the server answers, and the settings read again', () => {
      const { screen, load, shown, answered, read, last } = screenOf();
      shown();
      const first = last().fields;
      screen.save(TYPED);
      answered(SAVED);
      expect(last()).toEqual({ ...START, saved: true, fields: settingsFields(SAVED), info: settingsInfo(SAVED) });
      expect(last().fields).not.toBe(first);
      expect(load).toHaveBeenCalledTimes(2);

      // The read that follows brings the line about the last save up to date and fills nothing.
      const filled = last().fields;
      read({ ...SAVED, updatedAt: '2026-11-19T16:00:00.000Z' });
      expect(last().fields).toBe(filled);
      expect(last().info!.lastSaved).toBe('Last saved by admin on Thu 19 Nov, 17:00');
      expect(last().saved).toBe(true);
    });

    it('a save that fails: why, in plain words, the settings read again all the same, and the form not filled again', () => {
      const { screen, load, shown, refused, read, last } = screenOf();
      shown();
      const fields = last().fields;
      screen.save(TYPED);
      refused('network');
      expect(last()).toMatchObject({ saving: false, saved: false, failure: UNREACHABLE });
      expect(load).toHaveBeenCalledTimes(2);
      // The server had applied it: the line says so, and what was typed is left alone.
      read(SAVED);
      expect(last().fields).toBe(fields);
      expect(last().info).toEqual(settingsInfo(SAVED));
      expect(last().failure).toBe(UNREACHABLE);
    });

    it.each([
      ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
      ['invalid_request', 'The request was not accepted. Check what you entered and try again.'],
      ['forbidden', 'Your account is not allowed to do this.'],
    ] as const)('refused with %s: its sentence, and the next save can be made', (reason, sentence) => {
      const { screen, update, shown, refused, answered, last } = screenOf();
      shown();
      screen.save(TYPED);
      refused(reason);
      expect(last().failure).toBe(sentence);
      screen.save(TYPED);
      expect(update).toHaveBeenCalledTimes(2);
      expect(last()).toMatchObject({ saving: true, failure: null });
      answered();
      expect(last()).toMatchObject({ saving: false, saved: true, failure: null });
    });

    it('the read that follows a save fails: nothing is said of it, and the form stays', () => {
      const { screen, shown, answered, refused, unread, last } = screenOf();
      shown();
      screen.save(TYPED);
      answered(SAVED);
      unread('network');
      expect(last()).toEqual({ ...START, saved: true, fields: settingsFields(SAVED), info: settingsInfo(SAVED) });
      screen.save(TYPED);
      refused('network');
      unread('network');
      expect(last()).toMatchObject({ unread: null, failure: UNREACHABLE });
      expect(last().fields).not.toBeNull();
    });

    it('a second save while one is under way goes to the service, which keeps the last', () => {
      const { screen, update, shown, answered, last } = screenOf();
      shown();
      screen.save(TYPED);
      screen.save({ ...TYPED, bookingHorizonDays: '30' });
      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenLastCalledWith({ ...BODY, bookingHorizonDays: 30 });
      expect(last().saving).toBe(true);
      answered({ ...SAVED, bookingHorizonDays: 30 });
      expect(last()).toMatchObject({ saving: false, saved: true });
      expect(last().fields!.bookingHorizonDays).toBe('30');
    });

    it('"saved" goes at the next save, sent or refused, and at an edit', () => {
      const made = screenOf();
      made.shown();
      made.screen.save(TYPED);
      made.answered();
      made.screen.save(TYPED);
      expect(made.last().saved).toBe(false);
      made.answered();
      made.screen.save({ ...TYPED, bookingHorizonDays: '' });
      expect(made.last().saved).toBe(false);

      made.screen.save(TYPED);
      made.answered();
      const before = made.states.length;
      made.screen.edited();
      expect(made.last().saved).toBe(false);
      made.screen.edited(); // nothing more to say
      expect(made.states).toHaveLength(before + 1);
    });

    it('a save answered before start() is not this start\'s: nothing is said and nothing read for it', () => {
      const { screen, load, answered, read, last } = screenOf();
      answered(SAVED);
      screen.start();
      read();
      expect(load).toHaveBeenCalledTimes(1);
      expect(last()).toEqual({ ...START, fields: settingsFields(DEFAULTS), info: settingsInfo(DEFAULTS) });
    });
  });

  describe('after the subscription of start() ends', () => {
    it('everything is forgotten, no stream is heard, and nothing is read or saved', () => {
      const { screen, settingsResult$, updateResult$, load, update, shown, answered, read, last } = screenOf();
      const started = shown(SAVED);
      screen.save({ ...TYPED, bookingHorizonDays: '' });
      started.unsubscribe();
      expect(last()).toEqual(START);
      expect([settingsResult$.observed, updateResult$.observed]).toEqual([false, false]);
      screen.save(TYPED);
      screen.retry();
      answered();
      read();
      expect([load.mock.calls.length, update.mock.calls.length]).toEqual([1, 0]);
      expect(last()).toEqual(START);
    });

    it('started again, the settings are read again and fill the form', () => {
      const { screen, load, shown, read, last } = screenOf();
      shown(DEFAULTS).unsubscribe();
      screen.start();
      expect(load).toHaveBeenCalledTimes(2);
      expect(last()).toEqual({ ...START, loading: true });
      read(SAVED);
      expect(last().fields).toEqual(settingsFields(SAVED));
    });

    it('left while a save was under way, its late answer is not the next start\'s', () => {
      const { screen, load, shown, answered, read, last } = screenOf();
      const started = shown();
      screen.save(TYPED);
      started.unsubscribe();
      answered(SAVED);
      screen.start();
      read(SAVED);
      expect(last()).toMatchObject({ saved: false, saving: false });
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  it('a late subscriber gets the current state at once', () => {
    const { screen, shown } = screenOf();
    shown();
    const late: SettingsState[] = [];
    screen.settings$.subscribe((s) => late.push(s));
    expect(late).toHaveLength(1);
    expect(late[0]!.fields).not.toBeNull();
  });
});
