import { DEFAULT_SETTINGS, SETTINGS_RANGES, UpdateSettingsBody, type CalendarSettings } from '@shared-calendar/shared';
import { SETTING_FIELDS, settingRange, settingsFields, settingsFor, settingsInfo, type SettingsFields } from '../../../src/logic/settings.model';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

const DEFAULTS: CalendarSettings = { timeZone: 'Europe/Rome', ...DEFAULT_SETTINGS, updatedAt: null, updatedBy: null };
const SAVED: CalendarSettings = {
  timeZone: 'Europe/Rome',
  cancellationNoticeHours: 48,
  minBookingNoticeHours: 2,
  bookingHorizonDays: 30,
  maxFutureAppointmentsPerUser: 5,
  updatedAt: '2026-11-19T15:44:09.338Z',
  updatedBy: { username: 'admin', role: 'admin' },
};
const TYPED: SettingsFields = { cancellationNoticeHours: '24', minBookingNoticeHours: '0', bookingHorizonDays: '56', maxFutureAppointmentsPerUser: '5', noLimit: false };
const body = (over: Partial<SettingsFields> = {}) => settingsFor(PAGE_TEXTS_EN.settings, { ...TYPED, ...over });
const refusals = (over: Partial<SettingsFields>) => {
  const checked = body(over);
  return 'refusals' in checked ? checked.refusals : null;
};

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('the settings form', () => {
  useFarBrowserZone();

  describe('settingsFields: what the fields are filled with', () => {
    it('the defaults (R-SET-01): the three numbers as text, no limit as the checkbox with an empty field', () => {
      expect(settingsFields(DEFAULTS)).toEqual({ cancellationNoticeHours: '24', minBookingNoticeHours: '0', bookingHorizonDays: '56', maxFutureAppointmentsPerUser: '', noLimit: true });
    });

    it('saved settings with a limit: the four numbers as text, the checkbox not ticked', () => {
      expect(settingsFields(SAVED)).toEqual({ cancellationNoticeHours: '48', minBookingNoticeHours: '2', bookingHorizonDays: '30', maxFutureAppointmentsPerUser: '5', noLimit: false });
    });

    it('what it gives is accepted back as it is', () => {
      for (const settings of [DEFAULTS, SAVED]) {
        const four = Object.fromEntries(SETTING_FIELDS.map((field) => [field, settings[field]]));
        expect(settingsFor(PAGE_TEXTS_EN.settings, settingsFields(settings))).toEqual({ body: four });
      }
    });
  });

  describe('settingsInfo: what the form says beside the fields', () => {
    it('never saved: the time zone, and that these are the defaults', () => {
      expect(settingsInfo(PAGE_TEXTS_EN, DEFAULTS)).toEqual({ timeZone: 'Europe/Rome', lastSaved: 'These are the default settings: nobody has saved them yet.' });
    });

    it('saved: who and when, in the calendar\'s zone, not the browser\'s', () => {
      // 15:44 UTC is 16:44 in Rome in winter; in the browser's zone of the test it is already Friday.
      expect(settingsInfo(PAGE_TEXTS_EN, SAVED)).toEqual({ timeZone: 'Europe/Rome', lastSaved: 'Last saved by admin on Thu 19 Nov, 16:44' });
    });

    it('in summer, in a half-hour zone, and late in the evening', () => {
      expect(settingsInfo(PAGE_TEXTS_EN, { ...SAVED, updatedAt: '2027-07-05T08:15:00.000Z' }).lastSaved).toBe('Last saved by admin on Mon 5 Jul, 10:15');
      expect(settingsInfo(PAGE_TEXTS_EN, { ...SAVED, timeZone: 'Asia/Kolkata' })).toEqual({ timeZone: 'Asia/Kolkata', lastSaved: 'Last saved by admin on Thu 19 Nov, 21:14' });
      // 23:30 in Rome on Thursday: Friday in UTC is still to come, Friday in the browser is under way.
      expect(settingsInfo(PAGE_TEXTS_EN, { ...SAVED, updatedAt: '2026-11-19T22:30:00.000Z' }).lastSaved).toBe('Last saved by admin on Thu 19 Nov, 23:30');
    });

    it('a name with markup is handed over as it is; a moment without a name counts as never saved', () => {
      expect(settingsInfo(PAGE_TEXTS_EN, { ...SAVED, updatedBy: { username: '<b>x</b>', role: 'admin' } }).lastSaved).toBe('Last saved by <b>x</b> on Thu 19 Nov, 16:44');
      expect(settingsInfo(PAGE_TEXTS_EN, { ...SAVED, updatedBy: null }).lastSaved).toBe('These are the default settings: nobody has saved them yet.');
    });
  });

  describe('settingRange: the range of a field (9)', () => {
    it('the ends are those of shared/, for every field', () => {
      for (const field of SETTING_FIELDS) {
        const { min, max } = settingRange(PAGE_TEXTS_EN.settings, field);
        expect({ min, max }, field).toEqual(SETTINGS_RANGES[field]);
      }
      expect([...SETTING_FIELDS].sort()).toEqual(Object.keys(SETTINGS_RANGES).sort());
    });

    it('in words: what the field counts, and from where to where', () => {
      expect(SETTING_FIELDS.map((field) => settingRange(PAGE_TEXTS_EN.settings, field).words)).toEqual(['hours, from 0 to 720', 'hours, from 0 to 720', 'days, from 1 to 365', 'appointments, from 1 to 100']);
    });
  });

  describe('settingsFor: from the fields to the body of the save', () => {
    it('the four values as numbers (R-SET-02)', () => {
      expect(body()).toEqual({ body: { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 5 } });
    });

    it('"No limit" ticked: null, whatever the limit\'s field holds', () => {
      for (const held of ['', '5', '0', '101', 'abc', '2.5']) {
        expect(body({ noLimit: true, maxFutureAppointmentsPerUser: held }), held).toEqual({
          body: { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null },
        });
      }
    });

    it('"No limit" not ticked and the field empty: a field in fault, never "no limit"', () => {
      expect(refusals({ maxFutureAppointmentsPerUser: '' })).toEqual({ maxFutureAppointmentsPerUser: 'Maximum upcoming appointments per person must be a whole number from 1 to 100.' });
    });

    it.each(SETTING_FIELDS)('%s: its lowest and its highest value are accepted, the next ones refused', (field) => {
      const { min, max } = SETTINGS_RANGES[field];
      for (const value of [min, max]) {
        const checked = body({ [field]: String(value) });
        expect('body' in checked && checked.body[field], String(value)).toBe(value);
      }
      for (const value of [min - 1, max + 1]) expect(Object.keys(refusals({ [field]: String(value) }) ?? {}), String(value)).toEqual([field]);
    });

    it('a refusal names the field in the words of its label and says the range', () => {
      expect(refusals({ cancellationNoticeHours: '721', minBookingNoticeHours: 'x', bookingHorizonDays: '0', maxFutureAppointmentsPerUser: '101' })).toEqual({
        cancellationNoticeHours: 'Cancellation notice must be a whole number from 0 to 720.',
        minBookingNoticeHours: 'Minimum booking notice must be a whole number from 0 to 720.',
        bookingHorizonDays: 'Booking horizon must be a whole number from 1 to 365.',
        maxFutureAppointmentsPerUser: 'Maximum upcoming appointments per person must be a whole number from 1 to 100.',
      });
    });

    it('two fields in fault are both said, and the others are not', () => {
      expect(Object.keys(refusals({ cancellationNoticeHours: '', bookingHorizonDays: '400' })!)).toEqual(['cancellationNoticeHours', 'bookingHorizonDays']);
    });

    it.each([
      ['24', 24],
      [' 24 ', 24],
      ['024', 24],
      ['0', 0],
    ])('the text "%s" is accepted, as %d', (text, value) => {
      expect(body({ cancellationNoticeHours: text })).toMatchObject({ body: { cancellationNoticeHours: value } });
    });

    it.each(['24.0', '24.5', '1e2', '-1', '+1', '', '   ', 'abc', '24 hours', '2 4', '0x10', 'Infinity', '٢٤'])('the text "%s" is refused: not a whole number written with digits', (text) => {
      expect(refusals({ cancellationNoticeHours: text })).toEqual({ cancellationNoticeHours: 'Cancellation notice must be a whole number from 0 to 720.' });
    });

    it('a number too long to be exact is refused by its range', () => {
      expect(refusals({ bookingHorizonDays: '99999999999999999999999' })).toHaveProperty('bookingHorizonDays');
    });

    it('every body it gives is one the shared schema accepts', () => {
      const inputs: Partial<SettingsFields>[] = [{}, { noLimit: true }, { cancellationNoticeHours: ' 720 ' }, { minBookingNoticeHours: '720', bookingHorizonDays: '1' }, { bookingHorizonDays: '365', maxFutureAppointmentsPerUser: '100' }, { maxFutureAppointmentsPerUser: '1' }, { cancellationNoticeHours: '000' }];
      for (const input of inputs) {
        const checked = body(input);
        expect('body' in checked, JSON.stringify(input)).toBe(true);
        if ('body' in checked) expect(UpdateSettingsBody.safeParse(checked.body).success, JSON.stringify(input)).toBe(true);
      }
    });

    it('and what it refuses, the shared schema would refuse too, or could not read', () => {
      for (const [field, value] of [['cancellationNoticeHours', 721], ['minBookingNoticeHours', -1], ['bookingHorizonDays', 0], ['maxFutureAppointmentsPerUser', 101], ['bookingHorizonDays', 24.5]] as const) {
        expect(refusals({ [field]: String(value) }), field).not.toBeNull();
        expect(UpdateSettingsBody.safeParse({ ...{ cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 5 }, [field]: value }).success, field).toBe(false);
      }
    });
  });
});
