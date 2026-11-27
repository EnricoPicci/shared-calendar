import type { CalendarSettings } from '@shared-calendar/shared';
import { ReplaySubject } from 'rxjs';
import { DailyMailScreen, type DailyMailCalls, type DailyMailState } from '../../../src/logic/daily-mail.screen';
import type { SettingsResult } from '../../../src/services/calendar-settings.types';
import type { MailSettingsResult, UpdateMailSettingsResult } from '../../../src/services/mail-settings.types';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// A fake MailSettingsService and the result stream of a fake CalendarSettingsService: result
// streams that replay their last value, as the real ones do, and two spies. No network, no DOM.

const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const UNAVAILABLE = 'E-mail is not available yet.';
const CALENDAR: CalendarSettings = { timeZone: 'Europe/Rome', cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: null, updatedBy: null };
const START: DailyMailState = { loading: false, unavailable: null, unread: null, fields: null, timeZone: null, saving: false, refusal: null, failure: null, saved: false };
const SHOWN = { dailyEnabled: true, dailyHour: '07:00' };

function screenOf() {
  const settingsResult$ = new ReplaySubject<MailSettingsResult>(1);
  const updateResult$ = new ReplaySubject<UpdateMailSettingsResult>(1);
  const calendarResult$ = new ReplaySubject<SettingsResult>(1);
  const getSettings = vi.fn<DailyMailCalls['getSettings']>();
  const updateSettings = vi.fn<DailyMailCalls['updateSettings']>();
  const screen = new DailyMailScreen(
    { getSettings, updateSettings, settingsResult$: settingsResult$.asObservable(), updateResult$: updateResult$.asObservable() },
    { settingsResult$: calendarResult$.asObservable() },
    PAGE_TEXTS_EN,
  );
  const states: DailyMailState[] = [];
  screen.daily$.subscribe((s) => states.push(s));
  const read = (dailyEnabled = true, dailyHour = 7) => settingsResult$.next({ status: 'success', settings: { dailyEnabled, dailyHour } });
  const unread = (reason: 'network' | 'mail_unavailable' | 'forbidden' = 'network') => settingsResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const answered = (dailyEnabled = false, dailyHour = 18) => updateResult$.next({ status: 'success', settings: { dailyEnabled, dailyHour } });
  const refused = (reason: 'network' | 'mail_unavailable' | 'invalid_request' = 'network') => updateResult$.next({ status: 'failure', reason, message: 'for a developer' });
  const shown = () => {
    const started = screen.start();
    read();
    return started;
  };
  return { screen, settingsResult$, updateResult$, calendarResult$, getSettings, updateSettings, states, read, unread, answered, refused, shown, last: () => states.at(-1)! };
}

describe('DailyMailScreen', () => {
  useFarBrowserZone();

  it('before start(): nothing read, nothing listened to; save(), retry() and edited() do nothing', () => {
    const { screen, getSettings, updateSettings, states, settingsResult$, calendarResult$ } = screenOf();
    screen.save(SHOWN);
    screen.retry();
    screen.edited();
    expect([getSettings.mock.calls.length, updateSettings.mock.calls.length, settingsResult$.observed, calendarResult$.observed]).toEqual([0, 0, false, false]);
    expect(states).toEqual([START]);
  });

  it('start() reads once and says it is loading; the settings arrive as the two fields', () => {
    const { screen, getSettings, read, last } = screenOf();
    screen.start();
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(last()).toEqual({ ...START, loading: true });
    read(false, 23);
    expect(last()).toEqual({ ...START, fields: { dailyEnabled: false, dailyHour: '23:00' } });
  });

  it('a result that came before the start is not heard, but the time zone known is taken', () => {
    const { screen, read, calendarResult$, last } = screenOf();
    read();
    calendarResult$.next({ status: 'success', settings: CALENDAR });
    screen.start();
    expect(last()).toEqual({ ...START, loading: true, timeZone: 'Europe/Rome' });
  });

  it('the time zone comes with the calendar settings, whenever they are read; a failure of theirs changes nothing', () => {
    const { shown, calendarResult$, last } = screenOf();
    shown();
    calendarResult$.next({ status: 'failure', reason: 'network', message: 'x' });
    expect(last()).toEqual({ ...START, fields: SHOWN });
    calendarResult$.next({ status: 'success', settings: { ...CALENDAR, timeZone: 'Asia/Kathmandu' } });
    expect(last().timeZone).toBe('Asia/Kathmandu');
  });

  it('503 mail_unavailable: "not available yet" in place of the fields, no way to try again', () => {
    const { screen, unread, last } = screenOf();
    screen.start();
    unread('mail_unavailable');
    expect(last()).toEqual({ ...START, unavailable: UNAVAILABLE });
  });

  it('another failure says why, with the way to try again, until a read succeeds', () => {
    const { screen, unread, read, getSettings, last } = screenOf();
    screen.start();
    unread('network');
    expect(last()).toEqual({ ...START, unread: UNREACHABLE });
    screen.retry();
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(last().loading).toBe(true);
    read();
    expect(last()).toEqual({ ...START, fields: SHOWN });
  });

  it('save: an hour that is not one is refused and nothing is sent', () => {
    const { screen, shown, updateSettings, last } = screenOf();
    shown();
    screen.save({ dailyEnabled: true, dailyHour: '24:00' });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(last()).toEqual({ ...START, fields: SHOWN, refusal: PAGE_TEXTS_EN.settings.daily.refusal });
  });

  it('save: both values sent; the answer fills the fields, says saved, and the settings are read again; an edit ends "saved"', () => {
    const { screen, shown, updateSettings, answered, getSettings, read, last } = screenOf();
    shown();
    screen.save({ dailyEnabled: false, dailyHour: '18' });
    expect(updateSettings).toHaveBeenCalledWith({ dailyEnabled: false, dailyHour: 18 });
    expect(last()).toEqual({ ...START, fields: SHOWN, saving: true });
    answered();
    const filled = { dailyEnabled: false, dailyHour: '18:00' };
    expect(last()).toEqual({ ...START, fields: filled, saved: true });
    expect(getSettings).toHaveBeenCalledTimes(2);
    // The read after the save does not fill the fields again: the same object stays.
    const before = last().fields;
    read(false, 18);
    expect(last().fields).toBe(before);
    screen.edited();
    expect(last().saved).toBe(false);
    screen.edited();
    expect(last().saved).toBe(false);
  });

  it('a failed save says why and keeps what was typed; a read failing after it changes nothing', () => {
    const { screen, shown, refused, unread, last } = screenOf();
    shown();
    screen.save(SHOWN);
    refused('network');
    expect(last()).toEqual({ ...START, fields: SHOWN, failure: UNREACHABLE });
    unread('network');
    expect(last()).toEqual({ ...START, fields: SHOWN, failure: UNREACHABLE });
  });

  it('a save answered 503 mail_unavailable: "not available yet" in place of the fields', () => {
    const { screen, shown, refused, last } = screenOf();
    shown();
    screen.save(SHOWN);
    refused('mail_unavailable');
    expect(last()).toEqual({ ...START, unavailable: UNAVAILABLE });
  });

  it('the end of the subscription forgets everything; the next start reads again', () => {
    const { shown, getSettings, last, settingsResult$ } = screenOf();
    shown().unsubscribe();
    expect(last()).toEqual(START);
    expect(settingsResult$.observed).toBe(false);
    shown();
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(last().fields).toEqual(SHOWN);
  });
});
