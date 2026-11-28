import { dailyFields, dailyFor, dailyRange, hourText } from '../../../src/logic/daily-mail.model';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// The settings' "Daily e-mail" (docs/FRONTEND_ARCHITECTURE.md section 5.1).
describe('daily-mail.model', () => {
  useFarBrowserZone();

  it('dailyFields: the switch as it is, the hour as 07:00', () => {
    expect(dailyFields({ dailyEnabled: true, dailyHour: 7 })).toEqual({ dailyEnabled: true, dailyHour: '07:00' });
    expect(dailyFields({ dailyEnabled: false, dailyHour: 23 })).toEqual({ dailyEnabled: false, dailyHour: '23:00' });
    expect(dailyFields({ dailyEnabled: true, dailyHour: 0 })).toEqual({ dailyEnabled: true, dailyHour: '00:00' });
  });

  it.each([
    ['07:00', 7],
    ['7', 7],
    ['7:00', 7],
    [' 00 ', 0],
    ['23:00', 23],
  ])('dailyFor takes %j as the hour %i', (typed, hour) => {
    expect(dailyFor(PAGE_TEXTS_EN.settings, { dailyEnabled: false, dailyHour: typed })).toEqual({ body: { dailyEnabled: false, dailyHour: hour } });
  });

  it.each(['24:00', '7:30', '-1', '', 'seven', '7.5', '007:00', '1e1'])('dailyFor refuses %j, also with the mail switched off', (typed) => {
    expect(dailyFor(PAGE_TEXTS_EN.settings, { dailyEnabled: false, dailyHour: typed })).toEqual({ refusal: PAGE_TEXTS_EN.settings.daily.refusal });
  });

  it('the words: the hour, the range with and without the zone, the refusal', () => {
    expect(hourText(9)).toBe('09:00');
    expect(dailyRange(PAGE_TEXTS_EN.settings, 'Europe/Rome')).toBe("A whole hour, from 00:00 to 23:00, in the calendar's time zone, Europe/Rome.");
    expect(dailyRange(PAGE_TEXTS_EN.settings, null)).toBe("A whole hour, from 00:00 to 23:00, in the calendar's time zone.");
    expect(PAGE_TEXTS_EN.settings.daily.refusal).toBe('The hour must be a whole hour from 00:00 to 23:00, such as 07:00.');
  });
});
