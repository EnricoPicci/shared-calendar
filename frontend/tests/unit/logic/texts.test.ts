import { dateText, failureText, offsetText, rangeText, timeText, weekLabel } from '../../../src/logic/texts';
import { useFarBrowserZone } from './zone';

describe('texts', () => {
  useFarBrowserZone();

  describe('dateText', () => {
    it.each([
      ['2026-11-16', 'Mon 16 Nov'],
      ['2026-11-22', 'Sun 22 Nov'],
      ['2027-01-01', 'Fri 1 Jan'],
      ['2028-02-29', 'Tue 29 Feb'],
      ['2026-09-05', 'Sat 5 Sep'],
    ])('%s is "%s", whatever the browser\'s zone', (date, text) => {
      expect(dateText(date)).toBe(text);
    });
  });

  describe('weekLabel', () => {
    it.each([
      ['2026-11-16', '2026-11-22', '16 Nov – 22 Nov 2026'],
      ['2026-11-30', '2026-12-06', '30 Nov – 6 Dec 2026'],
      ['2026-12-28', '2027-01-03', '28 Dec 2026 – 3 Jan 2027'],
    ])('%s to %s is "%s"', (monday, sunday, label) => {
      expect(weekLabel(monday, sunday)).toBe(label);
    });
  });

  describe('offsetText', () => {
    it.each([
      ['2026-11-16T08:00:00.000Z', 'Europe/Rome', '+01:00'],
      ['2027-07-05T08:00:00.000Z', 'Europe/Rome', '+02:00'],
      ['2026-11-16T08:00:00.000Z', 'Asia/Kolkata', '+05:30'],
      ['2026-11-16T08:00:00.000Z', 'America/St_Johns', '-03:30'],
      ['2027-07-05T08:00:00.000Z', 'America/St_Johns', '-02:30'],
      ['2026-11-16T08:00:00.000Z', 'America/New_York', '-05:00'],
      ['2026-11-16T08:00:00.000Z', 'UTC', '+00:00'],
      ['2026-11-16T08:00:00.000Z', 'Pacific/Kiritimati', '+14:00'],
      // An instant that is not on a whole minute: the offset is still the zone's.
      ['2026-11-10T09:00:42.123Z', 'Europe/Rome', '+01:00'],
      // Either side of the night the clocks go back, and of the one they go forward.
      ['2027-10-31T00:59:00.000Z', 'Europe/Rome', '+02:00'],
      ['2027-10-31T01:00:00.000Z', 'Europe/Rome', '+01:00'],
      ['2027-03-28T00:59:00.000Z', 'Europe/Rome', '+01:00'],
      ['2027-03-28T01:00:00.000Z', 'Europe/Rome', '+02:00'],
    ])('%s in %s is %s', (instant, zone, offset) => {
      expect(offsetText(instant, zone)).toBe(offset);
    });
  });

  describe('timeText', () => {
    it('is the clock of the zone given: Rome in winter and in summer, a half-hour zone', () => {
      expect(timeText('2026-11-16T08:00:00.000Z', 'Europe/Rome')).toBe('09:00');
      expect(timeText('2027-07-05T08:00:00.000Z', 'Europe/Rome')).toBe('10:00');
      expect(timeText('2026-11-16T08:00:00.000Z', 'Asia/Kolkata')).toBe('13:30');
    });

    it('with the offset, tells apart the two 02:00 of the night the clocks go back', () => {
      expect(timeText('2027-10-31T00:00:00.000Z', 'Europe/Rome', true)).toBe('02:00 +02:00');
      expect(timeText('2027-10-31T01:00:00.000Z', 'Europe/Rome', true)).toBe('02:00 +01:00');
    });
  });

  describe('rangeText', () => {
    it('is start–end on the clock of the zone given', () => {
      expect(rangeText('2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z', 'Europe/Rome')).toBe('09:00–10:00');
      expect(rangeText('2026-11-16T03:30:00.000Z', '2026-11-16T04:15:00.000Z', 'Asia/Kolkata')).toBe('09:00–09:45');
    });

    it('an end at midnight of the next day is 24:00; a start at midnight stays 00:00', () => {
      expect(rangeText('2026-11-16T19:00:00.000Z', '2026-11-16T23:00:00.000Z', 'Europe/Rome')).toBe('20:00–24:00');
      expect(rangeText('2026-11-15T23:00:00.000Z', '2026-11-16T00:00:00.000Z', 'Europe/Rome')).toBe('00:00–01:00');
    });

    it('with the offsets, both ends carry theirs', () => {
      expect(rangeText('2027-10-31T00:00:00.000Z', '2027-10-31T01:00:00.000Z', 'Europe/Rome', true)).toBe('02:00 +02:00 – 02:00 +01:00');
      expect(rangeText('2027-10-31T20:00:00.000Z', '2027-10-31T23:00:00.000Z', 'Europe/Rome', true)).toBe('21:00 +01:00 – 24:00 +01:00');
    });
  });

  describe('failureText', () => {
    const REASONS = [
      'network',
      'server',
      'unexpected',
      'not_signed_in',
      'session_rejected',
      'forbidden',
      'invalid_request',
      'internal_error',
      'invalid_credentials',
      'too_many_attempts',
      'password_reset_required',
      'challenge',
      'no_role',
    ];

    it.each(REASONS)('%s has a sentence: a capital, a full stop, no code (no underscore) and no technical word', (reason) => {
      const text = failureText(reason);
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(/_|fetch|TypeError|HTTP|API|JSON|token|\d{3}/);
    });

    it('every reason but "unexpected" has a sentence of its own', () => {
      const own = REASONS.filter((reason) => reason !== 'unexpected').map(failureText);
      expect(new Set(own).size).toBe(own.length);
      expect(own).not.toContain(failureText('unexpected'));
    });

    it('a reason without a sentence gets the general one, also when it is the name of something every object has', () => {
      const general = 'Something went wrong. Please try again.';
      expect(failureText('slot_taken')).toBe(general);
      expect(failureText('')).toBe(general);
      expect(failureText('constructor')).toBe(general);
      expect(failureText('unexpected')).toBe(general);
    });

    it('says the same for a wrong password and an unknown user: both are invalid_credentials', () => {
      expect(failureText('invalid_credentials')).toBe('The username or the password is not correct.');
    });
  });
});
