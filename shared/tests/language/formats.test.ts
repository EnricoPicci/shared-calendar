import { dateFormats, dateNames, SUPPORTED_LANGUAGES, type DateNames } from '../../src/index';

const KINDS: (keyof DateNames)[] = ['weekdaysShort', 'weekdaysLong', 'monthsShort', 'monthsLong'];

// Test names: the section numbers are those of docs/MULTILANGUAGE_ARCHITECTURE.md.
describe('the names of days and months (10)', () => {
  it.each(SUPPORTED_LANGUAGES)('%s has 38 names, none empty and none twice within its kind', (language) => {
    const names = dateNames(language);
    expect(KINDS.map((kind) => names[kind].length)).toEqual([7, 7, 12, 12]);
    for (const kind of KINDS) {
      expect(names[kind].every((name) => name.trim().length > 0)).toBe(true);
      expect(new Set(names[kind]).size).toBe(names[kind].length);
    }
  });
});

describe('the ways a date is written (10)', () => {
  it('in English', () => {
    const en = dateFormats('en');
    expect(en.shortDate('2026-11-16')).toBe('Mon 16 Nov');
    expect(en.shortDateWithYear('2026-12-01')).toBe('Tue 1 Dec 2026');
    expect(en.longDate('2026-11-20')).toBe('20 November 2026');
    expect(en.fullDate('2026-11-24')).toBe('Tuesday 24 November 2026');
    expect(en.weekLabel('2026-11-16', '2026-11-22')).toBe('16 Nov – 22 Nov 2026');
    expect(en.weekdayName(1)).toBe('Monday');
    expect(en.weekdayName(7)).toBe('Sunday');
  });

  it('in Italian', () => {
    const it = dateFormats('it');
    expect(it.shortDate('2026-11-16')).toBe('lun 16 nov');
    expect(it.shortDateWithYear('2026-12-01')).toBe('mar 1 dic 2026');
    expect(it.longDate('2026-11-20')).toBe('20 novembre 2026');
    expect(it.fullDate('2026-11-24')).toBe('martedì 24 novembre 2026');
    expect(it.weekLabel('2026-11-16', '2026-11-22')).toBe('16 nov – 22 nov 2026');
    expect(it.weekdayName(3)).toBe('mercoledì');
  });

  it.each(SUPPORTED_LANGUAGES)('%s gives the first date of a week its year only when the week ends in another one', (language) => {
    const { weekLabel } = dateFormats(language);
    expect(weekLabel('2026-12-28', '2027-01-03')).toMatch(/^28 \S+ 2026 – 3 \S+ 2027$/);
    expect(weekLabel('2026-11-16', '2026-11-22')).not.toContain('2026 –');
  });

  it('reads a date as a local date, whatever the machine', () => {
    expect(dateFormats('en').fullDate('2027-01-01')).toBe('Friday 1 January 2027');
    expect(dateFormats('en').shortDate('2026-02-28')).toBe('Sat 28 Feb');
  });
});
