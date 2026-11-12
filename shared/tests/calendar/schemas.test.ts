import { Instant, LocalDate, LocalEndTime, LocalTime, Note, TypeName, Ulid, Weekday } from '../../src/index';

// Spec R-TIME-02, 6.1, R-BOOK-11, 11.2, 11.4: every bound of the primitive schemas.

describe('LocalDate', () => {
  it.each(['2026-11-12', '2028-02-29', '2000-02-29', '2026-12-31', '2027-01-01', '2026-04-30'])('accepts %s', (date) => {
    expect(LocalDate.safeParse(date)).toEqual({ success: true, data: date });
  });

  it.each([
    ['a non-leap 29 February', '2027-02-29'],
    ['29 February of a century not divisible by 400', '1900-02-29'],
    ['31 April', '2026-04-31'],
    ['month 13', '2026-13-01'],
    ['month 0', '2026-00-10'],
    ['day 0', '2026-01-00'],
    ['day 32', '2026-01-32'],
    ['no leading zeros', '2026-1-1'],
    ['a time part', '2026-11-12T00:00'],
    ['a number', 20261112],
  ])('rejects %s', (_case, date) => {
    expect(LocalDate.safeParse(date).success).toBe(false);
  });
});

describe('LocalTime and LocalEndTime', () => {
  it.each(['00:00', '08:15', '12:30', '23:45'])('both accept %s', (time) => {
    expect(LocalTime.safeParse(time).success).toBe(true);
    expect(LocalEndTime.safeParse(time).success).toBe(true);
  });

  it('accepts 24:00 as an end only', () => {
    expect(LocalEndTime.safeParse('24:00')).toEqual({ success: true, data: '24:00' });
    expect(LocalTime.safeParse('24:00').success).toBe(false);
  });

  it.each([
    ['off the 15-minute grid', '08:10'],
    ['past 24:00', '24:15'],
    ['hour 25', '25:00'],
    ['minute 60', '23:60'],
    ['one-digit hour', '8:00'],
    ['seconds', '08:00:00'],
    ['the empty string', ''],
    ['a number', 800],
  ])('both reject %s', (_case, time) => {
    expect(LocalTime.safeParse(time).success).toBe(false);
    expect(LocalEndTime.safeParse(time).success).toBe(false);
  });
});

describe('Weekday', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('accepts %i', (weekday) => {
    expect(Weekday.safeParse(weekday).success).toBe(true);
  });

  it.each([0, 8, 1.5, '1', null])('rejects %j', (weekday) => {
    expect(Weekday.safeParse(weekday).success).toBe(false);
  });
});

describe('Instant', () => {
  it.each(['2026-11-16T08:00:00.000Z', '2026-11-16T08:15:00.000Z', '2028-02-29T23:59:00.000Z'])('accepts %s', (instant) => {
    expect(Instant.safeParse(instant)).toEqual({ success: true, data: instant });
  });

  it('does not check the 15-minute grid: that is a rule on local time (R-BOOK-02)', () => {
    expect(Instant.safeParse('2026-11-16T08:07:00.000Z').success).toBe(true);
  });

  it.each([
    ['no seconds', '2026-11-16T09:00Z'],
    ['a non-zero second', '2026-11-16T09:00:01.000Z'],
    ['a non-zero millisecond', '2026-11-16T09:00:00.001Z'],
    ['a +01:00 offset', '2026-11-16T10:00:00.000+01:00'],
    ['no milliseconds', '2026-11-16T09:00:00Z'],
    ['no zone', '2026-11-16T09:00:00.000'],
    ['lower case', '2026-11-16t09:00:00.000z'],
    ['a date only', '2026-11-16'],
    ['an unreal date', '2027-02-29T09:00:00.000Z'],
    ['hour 24', '2026-11-16T24:00:00.000Z'],
    ['minute 60', '2026-11-16T09:60:00.000Z'],
    ['a number', 1_794_816_000_000],
  ])('rejects %s', (_case, instant) => {
    expect(Instant.safeParse(instant).success).toBe(false);
  });
});

describe('Ulid', () => {
  it.each(['01ARZ3NDEKTSV4RRFFQ69G5FAV', '01JCDE0000000000000000000Z'])('accepts %s', (id) => {
    expect(Ulid.safeParse(id).success).toBe(true);
  });

  it.each([
    ['lower case', '01arz3ndektsv4rrffq69g5fav'],
    ['the letter I', '01ARZ3NDEKTSV4RRFFQ69G5FAI'],
    ['the letter L', '01ARZ3NDEKTSV4RRFFQ69G5FAL'],
    ['the letter O', '01ARZ3NDEKTSV4RRFFQ69G5FAO'],
    ['the letter U', '01ARZ3NDEKTSV4RRFFQ69G5FAU'],
    ['25 characters', '01ARZ3NDEKTSV4RRFFQ69G5FA'],
    ['27 characters', '01ARZ3NDEKTSV4RRFFQ69G5FAVV'],
    ['a number', 42],
  ])('rejects %s', (_case, id) => {
    expect(Ulid.safeParse(id).success).toBe(false);
  });
});

describe('Note', () => {
  it.each([
    ['a plain note', 'First visit', 'First visit'],
    ['a line feed', 'Line one\nLine two', 'Line one\nLine two'],
    ['surrounding spaces, trimmed', '  bring the report \n', 'bring the report'],
    ['500 characters', 'a'.repeat(500), 'a'.repeat(500)],
    ['500 characters inside spaces', ` ${'a'.repeat(500)} `, 'a'.repeat(500)],
    ['250 emoji (two code units each)', '🙂'.repeat(250), '🙂'.repeat(250)],
    ['the empty string, as null', '', null],
    ['spaces only, as null', '   ', null],
    ['null', null, null],
  ])('accepts %s', (_case, note, result) => {
    expect(Note.safeParse(note)).toEqual({ success: true, data: result });
  });

  it.each([
    ['501 characters', 'a'.repeat(501)],
    ['251 emoji (502 code units)', '🙂'.repeat(251)],
    ['a tab', 'a\tb'],
    ['a carriage return', 'a\r\nb'],
    ['NUL', 'a\u0000b'],
    ['DEL', 'a\u007fb'],
    ['a C1 control character', 'a\u0085b'],
    ['a number', 42],
    ['undefined', undefined],
  ])('rejects %s', (_case, note) => {
    expect(Note.safeParse(note).success).toBe(false);
  });
});

describe('TypeName', () => {
  it.each([
    ['a plain name', 'Consultation', 'Consultation'],
    ['surrounding spaces, trimmed', '  Consultation  ', 'Consultation'],
    ['one character', 'X', 'X'],
    ['40 characters', 'a'.repeat(40), 'a'.repeat(40)],
    ['40 accented characters', 'è'.repeat(40), 'è'.repeat(40)],
    ['20 emoji (40 code units)', '🙂'.repeat(20), '🙂'.repeat(20)],
  ])('accepts %s', (_case, name, result) => {
    expect(TypeName.safeParse(name)).toEqual({ success: true, data: result });
  });

  it.each([
    ['the empty string', ''],
    ['spaces only', '   '],
    ['41 characters', 'a'.repeat(41)],
    ['21 emoji (42 code units)', '🙂'.repeat(21)],
    ['a line feed', 'a\nb'],
    ['a tab', 'a\tb'],
    ['NUL', 'a\u0000b'],
    ['null', null],
  ])('rejects %s', (_case, name) => {
    expect(TypeName.safeParse(name).success).toBe(false);
  });
});
