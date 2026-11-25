import { BehaviorSubject } from 'rxjs';
import { SETTING_FIELDS, settingsFor, type SettingsFields } from '../../../src/logic/settings.model';
import type { DailyMailState } from '../../../src/logic/daily-mail.screen';
import type { SettingsState } from '../../../src/logic/settings.screen';
import { mountDailyMail, mountSettings, type DailyMailDeps, type SettingsDeps } from '../../../src/views/settings.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the settings view (docs/FRONTEND_ARCHITECTURE.md section 8): the real
// index.html and a fake SettingsScreen whose stream the test controls and whose methods are
// spies. What is accepted and the words of a refusal are checked in the logic layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
const FIELDS: SettingsFields = { cancellationNoticeHours: '24', minBookingNoticeHours: '0', bookingHorizonDays: '56', maxFutureAppointmentsPerUser: '5', noLimit: false };
const NO_LIMIT: SettingsFields = { ...FIELDS, maxFutureAppointmentsPerUser: '', noLimit: true };
const INFO = { timeZone: 'Europe/Rome', lastSaved: 'Last saved by carol on Thu 19 Nov, 16:44' };
const TOO_FAR = 'Booking horizon must be a whole number from 1 to 365.';

const state = (over: Partial<SettingsState> = {}): SettingsState => ({ loading: false, unread: null, fields: null, info: null, saving: false, refusals: {}, failure: null, saved: false, ...over });
const read = (over: Partial<SettingsState> = {}) => state({ fields: FIELDS, info: INFO, ...over });

function mounted(first: SettingsState = state()) {
  const settings$ = new BehaviorSubject<SettingsState>(first);
  const screen = {
    settings$: settings$.asObservable(),
    save: vi.fn<SettingsDeps['save']>(),
    edited: vi.fn<SettingsDeps['edited']>(),
    retry: vi.fn<SettingsDeps['retry']>(),
  };
  const root = find('#settings');
  const subscription = mountSettings(root, screen);
  return { settings$, screen, root, subscription };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#settings ${selector}`);
const field = (name: string) => one<HTMLInputElement>(`[name="${name}"]`);
const values = () => SETTING_FIELDS.map((name) => field(name).value);
const noLimit = () => field('noLimit');
const limit = () => field('maxFutureAppointmentsPerUser');
const form = () => one<HTMLFormElement>('form.settings');
const refusalOf = (name: string) => field(name).closest('.field')!.querySelector<HTMLElement>('.refusal')!;
const html = () => document.documentElement.outerHTML;

describe('mountSettings', () => {
  useRealPage();

  describe('the states of settings$', () => {
    it('nothing yet: no form, no "Loading…", no failure', () => {
      mounted();
      expect([form().hidden, one('.loading').hidden, one('.unread').hidden]).toEqual([true, true, true]);
    });

    it('reading: "Loading…" is shown, and no form yet', () => {
      mounted(state({ loading: true }));
      expect(one('.loading').hidden).toBe(false);
      expect(one('.loading').getAttribute('role')).toBe('status');
      expect(form().hidden).toBe(true);
    });

    it('a read that failed: why, announced, in the place of the form, with "Try again"', () => {
      mounted(state({ unread: FAILURE }));
      expect(one('.unread').hidden).toBe(false);
      expect(one('.unread .error').textContent).toBe(FAILURE);
      expect(one('.unread .error').getAttribute('role')).toBe('alert');
      expect(one('.retry').textContent).toBe('Try again');
      expect(form().hidden).toBe(true);
    });

    it('the settings: the form with the four values, the checkbox, the time zone and who saved last', () => {
      mounted(read());
      expect(form().hidden).toBe(false);
      expect(one('.unread').hidden).toBe(true);
      expect(values()).toEqual(['24', '0', '56', '5']);
      expect([noLimit().checked, limit().disabled]).toEqual([false, false]);
      expect(one('.zone-name').textContent).toBe('Europe/Rome');
      expect(one('.zone-name').parentElement!.textContent).toBe('Time zone: Europe/Rome. It is set when the calendar is installed and cannot be changed here.');
      expect(one('.last-saved').textContent).toBe('Last saved by carol on Thu 19 Nov, 16:44');
      expect([one('.saved').hidden, one('.failure').textContent, one<HTMLButtonElement>('.submit').disabled]).toEqual([true, '', false]);
    });

    it('settings with no limit: the checkbox ticked, its field empty and out of use', () => {
      mounted(read({ fields: NO_LIMIT }));
      expect([noLimit().checked, limit().value, limit().disabled]).toEqual([true, '', true]);
    });

    it('each field has its range in words under it and as the native field\'s own limits, from the logic layer', () => {
      mounted(read());
      const ranges = SETTING_FIELDS.map((name) => field(name).closest('.field')!.querySelector('.range')!.textContent);
      expect(ranges).toEqual(['hours, from 0 to 720', 'hours, from 0 to 720', 'days, from 1 to 365', 'appointments, from 1 to 100']);
      expect(SETTING_FIELDS.map((name) => [field(name).type, field(name).min, field(name).max, field(name).step])).toEqual([
        ['number', '0', '720', '1'],
        ['number', '0', '720', '1'],
        ['number', '1', '365', '1'],
        ['number', '1', '100', '1'],
      ]);
    });

    it('saving: "Save" is disabled, and what is typed stays', () => {
      const { settings$ } = mounted(read());
      field('bookingHorizonDays').value = '30';
      settings$.next(read({ saving: true }));
      expect(one<HTMLButtonElement>('.submit').disabled).toBe(true);
      expect(field('bookingHorizonDays').value).toBe('30');
      settings$.next(read());
      expect(one<HTMLButtonElement>('.submit').disabled).toBe(false);
    });

    it('saved: the sentence, announced; gone when the stream says so', () => {
      const { settings$ } = mounted(read({ saved: true }));
      expect(one('.saved').hidden).toBe(false);
      expect(one('.saved').textContent).toBe('Settings saved.');
      expect(one('.saved').getAttribute('role')).toBe('status');
      settings$.next(read());
      expect(one('.saved').hidden).toBe(true);
    });

    it('a save that failed: why, announced, beside "Save"; gone when the stream says so', () => {
      const { settings$ } = mounted(read({ failure: FAILURE }));
      expect(one('.failure').textContent).toBe(FAILURE);
      expect(one('.failure').getAttribute('role')).toBe('alert');
      expect(one('.failure').closest('form')).toBe(form());
      settings$.next(read());
      expect(one('.failure').textContent).toBe('');
    });
  });

  describe('a field in fault', () => {
    it('its sentence is under it, announced, and the field is marked; the other fields are not', () => {
      mounted(read({ refusals: { bookingHorizonDays: TOO_FAR } }));
      expect(refusalOf('bookingHorizonDays').textContent).toBe(TOO_FAR);
      expect(refusalOf('bookingHorizonDays').getAttribute('role')).toBe('alert');
      expect(SETTING_FIELDS.map((name) => field(name).getAttribute('aria-invalid'))).toEqual([null, null, 'true', null]);
      expect(SETTING_FIELDS.filter((name) => refusalOf(name).textContent !== '')).toEqual(['bookingHorizonDays']);
    });

    it('two fields in fault are both said, each under its own field', () => {
      mounted(read({ refusals: { cancellationNoticeHours: 'First.', maxFutureAppointmentsPerUser: 'Last.' } }));
      expect(SETTING_FIELDS.map((name) => refusalOf(name).textContent)).toEqual(['First.', '', '', 'Last.']);
      expect(SETTING_FIELDS.map((name) => field(name).getAttribute('aria-invalid'))).toEqual(['true', null, null, 'true']);
    });

    it('it goes when the stream says so, and what was typed stays all along', () => {
      const { settings$ } = mounted(read());
      field('bookingHorizonDays').value = '400';
      settings$.next(read({ refusals: { bookingHorizonDays: TOO_FAR } }));
      expect(field('bookingHorizonDays').value).toBe('400');
      settings$.next(read());
      expect(refusalOf('bookingHorizonDays').textContent).toBe('');
      expect(field('bookingHorizonDays').hasAttribute('aria-invalid')).toBe(false);
      expect(field('bookingHorizonDays').value).toBe('400');
    });

    it('every refusal of the logic layer starts with the words of its field\'s label in the page', () => {
      mounted(read());
      const checked = settingsFor({ cancellationNoticeHours: '', minBookingNoticeHours: '', bookingHorizonDays: '', maxFutureAppointmentsPerUser: '', noLimit: false });
      const refusals = 'refusals' in checked ? checked.refusals : {};
      for (const name of SETTING_FIELDS) {
        const label = field(name).closest('label')!.textContent.trim();
        expect(refusals[name], name).toMatch(new RegExp(`^${label} must be `));
      }
    });
  });

  describe('the user\'s actions', () => {
    it('"Save" calls save() with the four fields as text and the checkbox, once, and changes nothing on screen by itself', () => {
      const { screen } = mounted(read());
      field('cancellationNoticeHours').value = '48';
      field('bookingHorizonDays').value = '400';
      const before = html();
      const { prevented } = submit(form());
      expect(prevented).toBe(true);
      expect(screen.save).toHaveBeenCalledTimes(1);
      expect(screen.save).toHaveBeenCalledWith({ cancellationNoticeHours: '48', minBookingNoticeHours: '0', bookingHorizonDays: '400', maxFutureAppointmentsPerUser: '5', noLimit: false });
      expect(html()).toBe(before);
      expect(one<HTMLButtonElement>('.submit').disabled).toBe(false);
    });

    it('an emptied field goes as an empty text: the view checks nothing', () => {
      const { screen } = mounted(read());
      field('minBookingNoticeHours').value = '';
      submit(form());
      expect(screen.save.mock.lastCall![0].minBookingNoticeHours).toBe('');
      expect(SETTING_FIELDS.every((name) => refusalOf(name).textContent === '')).toBe(true);
    });

    it('"No limit" ticked takes the number field out of use, and unticked gives it back, with what it held', () => {
      mounted(read());
      noLimit().click();
      expect([noLimit().checked, limit().disabled, limit().value]).toEqual([true, true, '5']);
      noLimit().click();
      expect([noLimit().checked, limit().disabled, limit().value]).toEqual([false, false, '5']);
    });

    it('"Save" with "No limit" ticked says so, and still hands the field\'s text over', () => {
      const { screen } = mounted(read());
      noLimit().click();
      submit(form());
      expect(screen.save).toHaveBeenCalledWith({ ...FIELDS, noLimit: true });
    });

    it('typing in a field and ticking the checkbox each tell the screen of an edit; a notification does not', () => {
      const { screen, settings$ } = mounted(read({ saved: true }));
      settings$.next(read({ saved: true, saving: true }));
      expect(screen.edited).not.toHaveBeenCalled();
      field('bookingHorizonDays').value = '30';
      field('bookingHorizonDays').dispatchEvent(new Event('input', { bubbles: true }));
      expect(screen.edited).toHaveBeenCalledTimes(1);
      noLimit().click();
      expect(screen.edited.mock.calls.length).toBeGreaterThanOrEqual(2);
      // The sentence goes because the stream says so, not because of the edit itself.
      expect(one('.saved').hidden).toBe(false);
    });

    it('"Try again" calls retry(), once, and nothing else', () => {
      const { screen } = mounted(state({ unread: FAILURE }));
      one('.retry').click();
      expect(screen.retry).toHaveBeenCalledTimes(1);
      expect(screen.save).not.toHaveBeenCalled();
      expect(one('.unread').hidden).toBe(false);
    });
  });

  describe('filling the form', () => {
    it('the form is filled only when the fields are another object: a value being typed is left alone by a notification', () => {
      const { settings$ } = mounted(read());
      field('bookingHorizonDays').value = '30';
      noLimit().click();
      settings$.next(read({ saving: true }));
      settings$.next(read({ failure: FAILURE }));
      settings$.next(read({ info: { ...INFO, lastSaved: 'Last saved by dave on Fri 20 Nov, 09:00' } }));
      expect(field('bookingHorizonDays').value).toBe('30');
      expect([noLimit().checked, limit().disabled]).toEqual([true, true]);
      // What the form says beside the fields follows every notification.
      expect(one('.last-saved').textContent).toBe('Last saved by dave on Fri 20 Nov, 09:00');
    });

    it('another object fills it again: after a save, with what the server answered', () => {
      const { settings$ } = mounted(read());
      field('bookingHorizonDays').value = ' 30 ';
      noLimit().click();
      settings$.next(read({ fields: { ...FIELDS, bookingHorizonDays: '30' }, saved: true }));
      expect(values()).toEqual(['24', '0', '30', '5']);
      expect([noLimit().checked, limit().disabled]).toEqual([false, false]);
      settings$.next(read({ fields: NO_LIMIT }));
      expect([limit().value, noLimit().checked, limit().disabled]).toEqual(['', true, true]);
    });
  });

  it('a name and a time zone containing <script> are shown as text; so are the sentences', () => {
    mounted(read({ info: { timeZone: SCRIPT, lastSaved: SCRIPT }, failure: SCRIPT, refusals: { bookingHorizonDays: SCRIPT } }));
    for (const element of [one('.zone-name'), one('.last-saved'), one('.failure'), refusalOf('bookingHorizonDays')]) {
      expect(element.textContent).toBe(SCRIPT);
      expect(element.children).toHaveLength(0);
    }
    mounted(state({ unread: SCRIPT }));
    expect(one('.unread .error').textContent).toBe(SCRIPT);
    expect(document.querySelectorAll('#settings script, #settings b')).toHaveLength(0);
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it: every field emptied, no name, no sentence', () => {
      const before = html();
      const { subscription } = mounted(read({ saved: true, saving: true, failure: FAILURE, refusals: { bookingHorizonDays: TOO_FAR, cancellationNoticeHours: 'x' } }));
      field('minBookingNoticeHours').value = '12';
      noLimit().click();
      expect(html()).not.toBe(before);

      subscription.unsubscribe();
      expect(values()).toEqual(['', '', '', '']);
      expect([noLimit().checked, limit().disabled, one<HTMLButtonElement>('.submit').disabled]).toEqual([false, false, false]);
      expect([form().hidden, one('.saved').hidden, one('.loading').hidden, one('.unread').hidden]).toEqual([true, true, true, true]);
      expect(find('#settings').textContent).not.toContain('carol');
      expect(html()).not.toContain('carol');
      expect(html()).not.toContain('Europe/Rome');
      expect(html()).toBe(before);
    });

    it('after a read that failed: the sentence is gone', () => {
      const before = html();
      const { subscription } = mounted(state({ unread: FAILURE, loading: true }));
      subscription.unsubscribe();
      expect(html()).toBe(before);
    });

    it('the stream is no longer heard, and the buttons reach nothing', () => {
      const { settings$, screen, subscription } = mounted(read());
      subscription.unsubscribe();
      expect(settings$.observed).toBe(false);
      settings$.next(read({ saved: true, failure: FAILURE }));
      expect(values()).toEqual(['', '', '', '']);
      expect(one('.failure').textContent).toBe('');
      expect(screen.save).not.toHaveBeenCalled();
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(read());
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });

    it('mounted again on the same element, it listens to the new screen only and is filled again', () => {
      const first = mounted(read());
      first.subscription.unsubscribe();
      const second = mounted(read({ fields: NO_LIMIT }));
      expect(values()).toEqual(['24', '0', '56', '']);
      submit(form());
      expect(first.screen.save).not.toHaveBeenCalled();
      expect(second.screen.save).toHaveBeenCalledWith(NO_LIMIT);
    });
  });
});

// The settings' "Daily e-mail": the same real page, a fake DailyMailScreen.
describe('mountDailyMail', () => {
  useRealPage();

  const REFUSAL = 'The hour must be a whole hour from 00:00 to 23:00, such as 07:00.';
  const DAILY = { dailyEnabled: true, dailyHour: '07:00' };
  const dailyState = (over: Partial<DailyMailState> = {}): DailyMailState => ({
    loading: false, unavailable: null, unread: null, fields: null, timeZone: null, saving: false, refusal: null, failure: null, saved: false, ...over,
  });
  const part = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#settings .daily-mail ${selector}`);
  const enabled = () => part<HTMLInputElement>('[name="dailyEnabled"]');
  const hour = () => part<HTMLInputElement>('[name="dailyHour"]');
  const dailyForm = () => part<HTMLFormElement>('form.daily');
  function shown(first: DailyMailState = dailyState()) {
    const daily$ = new BehaviorSubject<DailyMailState>(first);
    const screen = { daily$: daily$.asObservable(), save: vi.fn<DailyMailDeps['save']>(), edited: vi.fn<DailyMailDeps['edited']>(), retry: vi.fn<DailyMailDeps['retry']>() };
    const subscription = mountDailyMail(find('#settings'), screen);
    return { daily$, screen, subscription };
  }

  it('nothing yet: no form, no "Loading…", nothing said; the range without a zone', () => {
    shown();
    expect([dailyForm().hidden, part('.loading').hidden, part('.unavailable').hidden, part('.unread').hidden]).toEqual([true, true, true, true]);
    expect(part('.range').textContent).toBe("A whole hour, from 00:00 to 23:00, in the calendar's time zone.");
  });

  it('reading: its own "Loading…", not the settings\' one', () => {
    shown(dailyState({ loading: true }));
    expect([part('.loading').hidden, find('#settings .toolbar .loading').hidden]).toEqual([false, true]);
  });

  it('not available yet: the sentence in place of the form, and no "Try again"', () => {
    shown(dailyState({ unavailable: 'E-mail is not available yet.' }));
    expect([part('.unavailable').hidden, part('.unavailable').textContent, dailyForm().hidden, part('.unread').hidden]).toEqual([false, 'E-mail is not available yet.', true, true]);
  });

  it('a read that failed: why, with "Try again", which calls retry()', () => {
    const { screen } = shown(dailyState({ unread: FAILURE }));
    expect([part('.unread').hidden, part('.unread .error').textContent]).toEqual([false, FAILURE]);
    part('.retry').click();
    expect(screen.retry).toHaveBeenCalledTimes(1);
  });

  it('read: the switch and the hour filled, the range with the zone; filled again only for another object', () => {
    const { daily$ } = shown(dailyState({ fields: DAILY, timeZone: 'Europe/Rome' }));
    expect([dailyForm().hidden, enabled().checked, hour().value]).toEqual([false, true, '07:00']);
    expect(part('.range').textContent).toBe("A whole hour, from 00:00 to 23:00, in the calendar's time zone, Europe/Rome.");
    hour().value = '9';
    daily$.next({ ...daily$.getValue(), saving: true });
    expect(hour().value).toBe('9');
    daily$.next(dailyState({ fields: { dailyEnabled: false, dailyHour: '18:00' } }));
    expect([enabled().checked, hour().value]).toEqual([false, '18:00']);
  });

  it('"Save daily e-mail" sends what the fields hold, as typed; an edit or a switch says so', () => {
    const { screen } = shown(dailyState({ fields: DAILY }));
    enabled().click();
    expect(screen.edited).toHaveBeenCalled();
    screen.edited.mockClear();
    hour().value = ' 6 ';
    hour().dispatchEvent(new Event('input', { bubbles: true }));
    expect(screen.edited).toHaveBeenCalledTimes(1);
    submit(dailyForm());
    expect(screen.save).toHaveBeenCalledWith({ dailyEnabled: false, dailyHour: ' 6 ' });
  });

  it('a refusal under the hour, marked; a failure; "saved"; the button off while saving', () => {
    const { daily$ } = shown(dailyState({ fields: DAILY, refusal: REFUSAL, failure: FAILURE, saving: true }));
    expect([part('.refusal').textContent, hour().getAttribute('aria-invalid'), part('.failure').textContent, part<HTMLButtonElement>('.submit').disabled]).toEqual([REFUSAL, 'true', FAILURE, true]);
    daily$.next(dailyState({ fields: DAILY, saved: true }));
    expect([part('.refusal').textContent, hour().hasAttribute('aria-invalid'), part('.saved').hidden, part<HTMLButtonElement>('.submit').disabled]).toEqual(['', false, false, false]);
  });

  it('a zone and the sentences containing <script> are shown as text', () => {
    shown(dailyState({ fields: DAILY, timeZone: SCRIPT, failure: SCRIPT, refusal: SCRIPT, unavailable: SCRIPT }));
    expect(part('.failure').textContent).toBe(SCRIPT);
    expect(part('.range').textContent).toContain(SCRIPT);
    expect(document.querySelectorAll('#settings script, #settings b')).toHaveLength(0);
  });

  it('nothing left in the page after unsubscribing, and the settings view beside it untouched', () => {
    const before = find('#settings').outerHTML;
    const { subscription } = shown(dailyState({ fields: DAILY, timeZone: 'Europe/Rome', refusal: REFUSAL, failure: FAILURE, saved: true, saving: true, unread: FAILURE, unavailable: 'x', loading: true }));
    hour().value = '23';
    subscription.unsubscribe();
    expect(find('#settings').outerHTML).toBe(before);
    expect([hour().value, enabled().checked]).toEqual(['', false]);
    expect(html()).not.toContain('Europe/Rome');
  });
});
