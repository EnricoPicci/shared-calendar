import { CALENDAR_LIMITS, type Appointment } from '@shared-calendar/shared';
import { appointmentRows, defaultPeriod, emptyText, periodRefusal } from '../../../src/logic/appointments.model';
import { appointment } from './fixtures';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

const z = (instant: string) => `${instant}:00.000Z`;
const at = (instant: string) => new Date(instant);

// Monday 23 November 2026, 10:00–11:00 in Rome.
const MONDAY = appointment({ appointmentId: '01M6DMQ0000000000000000001', start: z('2026-11-23T09:00'), end: z('2026-11-23T10:00'), date: '2026-11-23', note: 'First lesson' });
const BEFORE = at('2026-11-20T08:00:00.000Z');
const row = (over: Partial<Appointment> = {}, now = BEFORE, zone = 'Europe/Rome') => appointmentRows(PAGE_TEXTS_EN, [{ ...MONDAY, ...over }], now, zone)[0]!;

// Test names: section numbers are those of docs/SHARED_CALENDAR_SPEC.md.
describe('appointmentRows', () => {
  useFarBrowserZone();

  it('a row: the id, the date, the time, the type, the note and the status in words', () => {
    expect(appointmentRows(PAGE_TEXTS_EN, [MONDAY], BEFORE, 'Europe/Rome')).toEqual([
      { appointmentId: '01M6DMQ0000000000000000001', date: 'Mon 23 Nov', time: '10:00–11:00', typeName: 'Studio', note: 'First lesson', kind: 'booked', status: 'Booked' },
    ]);
  });

  it('without a note the row\'s note is empty; a note with markup or line feeds is handed over as it is', () => {
    expect(row({ note: null }).note).toBe('');
    expect(row({ note: '<b>bold</b>\nsecond line' }).note).toBe('<b>bold</b>\nsecond line');
  });

  describe('the status in words (8.1)', () => {
    it('booked and still to end: "Booked", also while it is in progress', () => {
      expect(row({}, at('2026-11-23T09:30:00.000Z'))).toMatchObject({ kind: 'booked', status: 'Booked' });
    });

    it('booked and ending exactly at "now": "Ended"; ending one millisecond later: "Booked"', () => {
      const now = at('2026-11-23T10:00:00.000Z');
      expect(row({}, now)).toMatchObject({ kind: 'ended', status: 'Ended' });
      expect(row({ end: '2026-11-23T10:00:00.001Z' }, now)).toMatchObject({ kind: 'booked', status: 'Booked' });
      expect(row({}, at('2026-12-01T10:00:00.000Z'))).toMatchObject({ kind: 'ended', status: 'Ended' });
    });

    it('cancelled: "Cancelled", before its time and after it', () => {
      const cancelled = { status: 'cancelled' as const, cancelReason: 'cancelled' as const };
      expect(row(cancelled)).toMatchObject({ kind: 'cancelled', status: 'Cancelled' });
      expect(row(cancelled, at('2026-12-01T10:00:00.000Z'))).toMatchObject({ kind: 'cancelled', status: 'Cancelled' });
    });

    it('cancelled by a change: "Changed"', () => {
      expect(row({ status: 'cancelled', cancelReason: 'changed', replacedBy: '01M6DMQ0000000000000000002' })).toMatchObject({ kind: 'changed', status: 'Changed' });
    });

    it('cancelled because its User was deleted, or with no reason given: "Cancelled"', () => {
      expect(row({ status: 'cancelled', cancelReason: 'user_deleted' })).toMatchObject({ kind: 'cancelled', status: 'Cancelled' });
      expect(row({ status: 'cancelled', cancelReason: null })).toMatchObject({ kind: 'cancelled', status: 'Cancelled' });
    });
  });

  describe('the date and the time are in the calendar\'s zone, not the browser\'s', () => {
    it('Rome in winter and in summer', () => {
      expect(row()).toMatchObject({ date: 'Mon 23 Nov', time: '10:00–11:00' });
      expect(row({ start: z('2027-07-05T08:15'), end: z('2027-07-05T08:45'), date: '2027-07-05' })).toMatchObject({ date: 'Mon 5 Jul', time: '10:15–10:45' });
    });

    it('a half-hour zone', () => {
      expect(row({}, BEFORE, 'Asia/Kolkata')).toMatchObject({ date: 'Mon 23 Nov', time: '14:30–15:30' });
    });

    it('an appointment late in the evening is on its own date, whatever day it is in the browser or in UTC', () => {
      // 23:00–24:00 in Rome on Monday 23: already Tuesday in the browser's zone of the test.
      expect(row({ start: z('2026-11-23T22:00'), end: z('2026-11-23T23:00') })).toMatchObject({ date: 'Mon 23 Nov', time: '23:00–24:00' });
      // 00:00–01:00 in Rome on Tuesday 24: still Monday in UTC.
      expect(row({ start: z('2026-11-23T23:00'), end: z('2026-11-24T00:00'), date: '2026-11-24' })).toMatchObject({ date: 'Tue 24 Nov', time: '00:00–01:00' });
    });

    it('on the night the clocks go back the two hours with the same name carry their offsets', () => {
      const first = { start: z('2027-10-31T00:00'), end: z('2027-10-31T01:00'), date: '2027-10-31' };
      const second = { start: z('2027-10-31T01:00'), end: z('2027-10-31T02:00'), date: '2027-10-31' };
      const rows = appointmentRows(PAGE_TEXTS_EN, [{ ...MONDAY, ...first }, { ...MONDAY, ...second }], BEFORE, 'Europe/Rome');
      expect(rows.map((r) => [r.date, r.time])).toEqual([
        ['Sun 31 Oct', '02:00 +02:00 – 02:00 +01:00'],
        ['Sun 31 Oct', '02:00 +01:00 – 03:00 +01:00'],
      ]);
    });
  });

  it('the order is the one given, which is the server\'s; an empty list gives no row', () => {
    const later = { ...MONDAY, appointmentId: 'b', start: z('2026-11-24T09:00'), end: z('2026-11-24T10:00'), date: '2026-11-24' };
    const earlier = { ...MONDAY, appointmentId: 'a' };
    expect(appointmentRows(PAGE_TEXTS_EN, [later, earlier], BEFORE, 'Europe/Rome').map((r) => r.appointmentId)).toEqual(['b', 'a']);
    expect(appointmentRows(PAGE_TEXTS_EN, [], BEFORE, 'Europe/Rome')).toEqual([]);
  });
});

describe('emptyText', () => {
  it('one sentence per mode', () => {
    expect(emptyText(PAGE_TEXTS_EN.list, 'upcoming')).toBe('You have no upcoming appointments.');
    expect(emptyText(PAGE_TEXTS_EN.list, 'history')).toBe('There are no appointments in this period.');
  });
});

describe('defaultPeriod', () => {
  it('the 30 days that end today, both included', () => {
    expect(defaultPeriod(at('2026-11-19T10:00:00.000Z'), 'Europe/Rome')).toEqual({ from: '2026-10-21', to: '2026-11-19' });
  });

  it.each([
    // Thursday 23:30 in Rome: already Friday afternoon in the browser's zone of the test.
    ['the browser is on the next day', '2026-11-19T22:30:00.000Z', 'Europe/Rome', '2026-11-19'],
    // Friday 00:30 in Rome: still Thursday in UTC.
    ['UTC is on the day before', '2026-11-19T23:30:00.000Z', 'Europe/Rome', '2026-11-20'],
    // Summer: Monday 01:00 in Rome (UTC+2) is Sunday 23:00 UTC.
    ['summer time counts', '2027-07-04T23:00:00.000Z', 'Europe/Rome', '2027-07-05'],
    ['another calendar zone has its own today', '2026-11-19T19:00:00.000Z', 'Asia/Kolkata', '2026-11-20'],
  ])('today is the date of "now" in the calendar\'s zone: %s', (_name, now, zone, today) => {
    expect(defaultPeriod(at(now), zone).to).toBe(today);
  });

  it('a period across a month and a year', () => {
    expect(defaultPeriod(at('2027-01-10T10:00:00.000Z'), 'Europe/Rome')).toEqual({ from: '2026-12-12', to: '2027-01-10' });
  });

  it('is within what one list may hold', () => {
    const { from, to } = defaultPeriod(at('2026-11-19T10:00:00.000Z'), 'Europe/Rome');
    expect(periodRefusal(PAGE_TEXTS_EN.list, from, to)).toBeNull();
  });
});

describe('periodRefusal', () => {
  const LIMIT = CALENDAR_LIMITS.appointmentListDays;

  it('a date missing: one sentence, whichever is missing', () => {
    for (const [from, to] of [['', '2026-11-19'], ['2026-11-01', ''], ['', '']] as const) expect(periodRefusal(PAGE_TEXTS_EN.list, from, to)).toBe('Choose both dates.');
  });

  it('the first date after the last', () => {
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2026-11-20', '2026-11-19')).toBe('The first date is after the last one.');
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2027-01-01', '2026-12-31')).toBe('The first date is after the last one.');
  });

  it('one day is a period', () => {
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2026-11-19', '2026-11-19')).toBeNull();
  });

  it('as many days as the limit of shared/ are accepted, one more is refused, with the number in the sentence', () => {
    expect(LIMIT).toBe(92);
    // 1 September to 1 December 2026 is 92 days, both included.
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2026-09-01', '2026-12-01')).toBeNull();
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2026-09-01', '2026-12-02')).toBe(`A period can be at most ${LIMIT} days long. Choose a shorter one.`);
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2026-09-01', '2026-12-02')).toBe('A period can be at most 92 days long. Choose a shorter one.');
  });

  it('a period may hold future dates, and may be across a year', () => {
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2026-12-15', '2027-03-01')).toBeNull();
    expect(periodRefusal(PAGE_TEXTS_EN.list, '2030-01-01', '2030-03-01')).toBeNull();
  });
});
