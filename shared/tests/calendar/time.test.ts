import { addDays, isValidTimeZone, localDateOf, localTimeOf, toInstant, weekdayOf } from '../../src/index';

// Spec R-TIME-02, R-TIME-03, R-TIME-06. Every expectation is a fixed UTC string, so the tests
// prove the helpers do not depend on the machine's zone: they also run under TZ=America/New_York
// and TZ=Asia/Kathmandu (plan step 41).

const ROME = 'Europe/Rome';
const MINUTE_MS = 60_000;

function plusMinutes(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * MINUTE_MS).toISOString();
}

describe('toInstant', () => {
  it.each([
    ['2026-11-12', '09:00', '2026-11-12T08:00:00.000Z'], // winter, +01:00
    ['2026-07-15', '09:00', '2026-07-15T07:00:00.000Z'], // summer, +02:00
    ['2026-11-12', '00:00', '2026-11-11T23:00:00.000Z'],
    ['2026-11-12', '23:45', '2026-11-12T22:45:00.000Z'],
  ])('reads %s %s in Europe/Rome as %s', (date, time, instant) => {
    expect(toInstant(date, time, ROME)).toBe(instant);
  });

  describe('Europe/Rome spring forward, 2027-03-28 (02:00 → 03:00)', () => {
    it.each([
      ['01:00', '2027-03-28T00:00:00.000Z'], // before the gap, +01:00
      ['01:45', '2027-03-28T00:45:00.000Z'],
      ['02:00', '2027-03-28T01:00:00.000Z'], // in the gap: moved forward one hour, to 03:00
      ['02:30', '2027-03-28T01:30:00.000Z'], // in the gap: becomes 03:30
      ['02:45', '2027-03-28T01:45:00.000Z'],
      ['03:00', '2027-03-28T01:00:00.000Z'], // after the gap, +02:00
      ['03:30', '2027-03-28T01:30:00.000Z'],
    ])('%s is %s', (time, instant) => {
      expect(toInstant('2027-03-28', time, ROME)).toBe(instant);
    });

    it('02:30 reads back as local 03:30 on the same date', () => {
      const instant = toInstant('2027-03-28', '02:30', ROME);
      expect(localTimeOf(instant, ROME)).toBe('03:30');
      expect(localDateOf(instant, ROME)).toBe('2027-03-28');
    });

    it('AC-35, time half: 01:00 plus 60 real minutes is local 03:00 on the same date', () => {
      const end = plusMinutes(toInstant('2027-03-28', '01:00', ROME), 60);
      expect(end).toBe('2027-03-28T01:00:00.000Z');
      expect(localTimeOf(end, ROME)).toBe('03:00');
      expect(localDateOf(end, ROME)).toBe('2027-03-28');
    });

    it('the window 01:00–04:00 holds two real hours', () => {
      const minutes = (Date.parse(toInstant('2027-03-28', '04:00', ROME)) - Date.parse(toInstant('2027-03-28', '01:00', ROME))) / MINUTE_MS;
      expect(minutes).toBe(120);
    });
  });

  describe('Europe/Rome fall back, 2026-10-25 (03:00 → 02:00)', () => {
    it.each([
      ['01:30', '2026-10-24T23:30:00.000Z'], // before, +02:00
      ['02:00', '2026-10-25T00:00:00.000Z'], // twice: the earlier occurrence, +02:00
      ['02:30', '2026-10-25T00:30:00.000Z'], // twice: the earlier occurrence (not 01:30Z)
      ['02:45', '2026-10-25T00:45:00.000Z'],
      ['03:00', '2026-10-25T02:00:00.000Z'], // after, +01:00
    ])('%s is %s', (time, instant) => {
      expect(toInstant('2026-10-25', time, ROME)).toBe(instant);
    });

    it('both occurrences of 02:30 read back as local 02:30', () => {
      expect(localTimeOf('2026-10-25T00:30:00.000Z', ROME)).toBe('02:30');
      expect(localTimeOf('2026-10-25T01:30:00.000Z', ROME)).toBe('02:30');
    });

    it('the window 01:00–04:00 holds four real hours', () => {
      const minutes = (Date.parse(toInstant('2026-10-25', '04:00', ROME)) - Date.parse(toInstant('2026-10-25', '01:00', ROME))) / MINUTE_MS;
      expect(minutes).toBe(240);
    });
  });

  it.each([
    ['America/New_York', '2026-03-08', '02:30', '2026-03-08T07:30:00.000Z'], // gap: 03:30 EDT
    ['America/New_York', '2026-11-01', '01:30', '2026-11-01T05:30:00.000Z'], // twice: 01:30 EDT
    ['Australia/Lord_Howe', '2026-10-04', '02:15', '2026-10-03T15:45:00.000Z'], // 30-minute gap: 02:45 +11:00
    ['Australia/Lord_Howe', '2027-04-04', '01:45', '2027-04-03T14:45:00.000Z'], // 30-minute repeat: the earlier, +11:00
    ['UTC', '2027-03-28', '02:30', '2027-03-28T02:30:00.000Z'],
  ])('applies the same rule in %s: %s %s is %s', (zone, date, time, instant) => {
    expect(toInstant(date, time, zone)).toBe(instant);
  });

  describe('Asia/Kathmandu (+05:45)', () => {
    it.each([
      ['2026-11-12', '09:00', '2026-11-12T03:15:00.000Z'],
      ['2026-11-12', '00:00', '2026-11-11T18:15:00.000Z'],
      ['2026-11-12', '05:30', '2026-11-11T23:45:00.000Z'],
    ])('%s %s is %s', (date, time, instant) => {
      expect(toInstant(date, time, 'Asia/Kathmandu')).toBe(instant);
    });
  });

  describe('24:00, the end of a date', () => {
    it.each([
      ['2026-11-12', '2026-11-13'],
      ['2026-12-31', '2027-01-01'],
      ['2027-03-27', '2027-03-28'], // the night clocks go forward
      ['2026-10-24', '2026-10-25'], // the night clocks go back
    ])('24:00 on %s is 00:00 on %s', (date, next) => {
      expect(toInstant(date, '24:00', ROME)).toBe(toInstant(next, '00:00', ROME));
    });

    it('a whole spring-forward day holds 23 real hours, a fall-back day 25', () => {
      const hours = (date: string) => (Date.parse(toInstant(date, '24:00', ROME)) - Date.parse(toInstant(date, '00:00', ROME))) / 3_600_000;
      expect(hours('2027-03-28')).toBe(23);
      expect(hours('2026-10-25')).toBe(25);
      expect(hours('2026-11-12')).toBe(24);
    });
  });
});

describe('localDateOf and localTimeOf', () => {
  it.each([
    ['2026-11-12T08:00:00.000Z', ROME, '2026-11-12', '09:00'],
    ['2026-11-12T23:00:00.000Z', ROME, '2026-11-13', '00:00'], // midnight is 00:00, never 24:00
    ['2026-11-12T22:59:00.000Z', ROME, '2026-11-12', '23:59'],
    ['2026-12-31T23:30:00.000Z', ROME, '2027-01-01', '00:30'], // across a year boundary
    ['2026-11-12T03:15:00.000Z', 'Asia/Kathmandu', '2026-11-12', '09:00'],
    ['2026-11-11T18:15:00.000Z', 'Asia/Kathmandu', '2026-11-12', '00:00'],
    ['2026-11-11T18:14:00.000Z', 'Asia/Kathmandu', '2026-11-11', '23:59'],
    ['2026-11-12T03:00:00.000Z', 'America/New_York', '2026-11-11', '22:00'],
    ['2026-11-12T00:00:00.000Z', 'UTC', '2026-11-12', '00:00'],
    ['2026-11-12T08:00:30.500Z', ROME, '2026-11-12', '09:00'], // a server timestamp with seconds
  ])('%s in %s is %s %s', (instant, zone, date, time) => {
    expect(localDateOf(instant, zone)).toBe(date);
    expect(localTimeOf(instant, zone)).toBe(time);
  });

  it('round-trips every quarter hour of an ordinary day in three zones', () => {
    for (const zone of [ROME, 'Asia/Kathmandu', 'America/New_York']) {
      for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        const instant = toInstant('2026-11-12', time, zone);
        expect([localDateOf(instant, zone), localTimeOf(instant, zone)]).toEqual(['2026-11-12', time]);
      }
    }
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2026-11-16', 1], // Monday
    ['2026-11-12', 4], // Thursday
    ['2026-11-15', 7], // Sunday
    ['2027-03-28', 7], // Sunday, the spring-forward day
    ['2028-02-29', 2], // a leap day, Tuesday
    ['2026-12-31', 4], // across a year boundary: Thursday …
    ['2027-01-01', 5], // … Friday
    ['2027-01-03', 7], // … Sunday
    ['2027-01-04', 1], // … Monday
    ['0001-01-01', 1], // a year below 100 is not read as 19xx
  ])('%s is weekday %i', (date, weekday) => {
    expect(weekdayOf(date)).toBe(weekday);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-11-12', 0, '2026-11-12'],
    ['2026-11-12', 1, '2026-11-13'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2027-03-01', -1, '2027-02-28'],
    ['2027-03-27', 1, '2027-03-28'], // across the DST change: still one calendar day
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-11-12', 56, '2027-01-07'], // the default booking horizon
    ['2026-11-12', -365, '2025-11-12'],
    ['0050-01-01', 1, '0050-01-02'],
  ])('%s plus %i days is %s', (date, n, result) => {
    expect(addDays(date, n)).toBe(result);
  });
});

describe('isValidTimeZone', () => {
  it.each(['Europe/Rome', 'Asia/Kathmandu', 'America/New_York', 'UTC'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each([
    ['the empty string', ''],
    ['an unknown zone', 'Mars/Olympus'],
    ['surrounding spaces', ' Europe/Rome'],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { timeZone: 'Europe/Rome' }],
  ])('rejects %s', (_case, zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});
