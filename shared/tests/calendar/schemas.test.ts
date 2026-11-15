import {
  AppointmentIdParam,
  AppointmentsQuery,
  BookBody,
  CalendarQuery,
  ChangeBody,
  DateParam,
  Instant,
  LocalDate,
  LocalEndTime,
  LocalTime,
  Note,
  NoteBody,
  OneOffWindowBody,
  OverrideBody,
  PatternBody,
  PatternIdParam,
  TypeBody,
  TypeIdParam,
  TypeName,
  Ulid,
  UpdateSettingsBody,
  Weekday,
  WindowBody,
  WindowIdParam,
} from '../../src/index';
import type { z } from 'zod';

// Every bound of the primitive schemas, then of the request bodies and the path and query
// parameters built on them (docs/SHARED_CALENDAR_SPEC.md R-TIME-02, section 6.1, R-BOOK-11,
// sections 11.2 and 11.4).

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

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
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

// ── Bodies and parameters ───────────────────────────────────────────────────────────────────

const STUDIO = '01JC000000000000000000STD0'; // a ULID: Crockford base32 has no I, L, O or U

// The paths of the issues of a rejection, each once, e.g. ['end'] or ['(root)']. (A malformed
// LocalDate or Instant fails both its pattern and its refinement: two issues, one path.)
function rejectedPaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) throw new Error(`accepted: ${JSON.stringify(input)}`);
  return [...new Set(result.error.issues.map((issue) => (issue.path.length === 0 ? '(root)' : issue.path.join('.'))))];
}

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('UpdateSettingsBody', () => {
  const valid = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };

  it.each([
    ['the defaults', valid],
    ['every lower bound', { cancellationNoticeHours: 0, minBookingNoticeHours: 0, bookingHorizonDays: 1, maxFutureAppointmentsPerUser: 1 }],
    ['every upper bound', { cancellationNoticeHours: 720, minBookingNoticeHours: 720, bookingHorizonDays: 365, maxFutureAppointmentsPerUser: 100 }],
  ])('accepts %s', (_case, body) => {
    expect(UpdateSettingsBody.safeParse(body)).toEqual({ success: true, data: body });
  });

  it.each([
    ['cancellationNoticeHours', -1],
    ['cancellationNoticeHours', 721],
    ['cancellationNoticeHours', 1.5],
    ['minBookingNoticeHours', -1],
    ['minBookingNoticeHours', 721],
    ['bookingHorizonDays', 0],
    ['bookingHorizonDays', 366],
    ['maxFutureAppointmentsPerUser', 0],
    ['maxFutureAppointmentsPerUser', 101],
    ['maxFutureAppointmentsPerUser', 2.5],
    ['bookingHorizonDays', '56'],
    ['bookingHorizonDays', null],
  ])('rejects %s = %j', (field, value) => {
    expect(rejectedPaths(UpdateSettingsBody, { ...valid, [field]: value })).toEqual([field]);
  });

  it.each(['cancellationNoticeHours', 'minBookingNoticeHours', 'bookingHorizonDays', 'maxFutureAppointmentsPerUser'])(
    'requires %s (R-SET-02: all four together)',
    (field) => {
      const body: Record<string, unknown> = { ...valid };
      delete body[field];
      expect(rejectedPaths(UpdateSettingsBody, body)).toEqual([field]);
    },
  );

  it('rejects an unknown field, e.g. the read-only timeZone', () => {
    expect(rejectedPaths(UpdateSettingsBody, { ...valid, timeZone: 'UTC' })).toEqual(['(root)']);
  });
});

describe('TypeBody', () => {
  it('accepts a name, trimmed', () => {
    expect(TypeBody.safeParse({ name: ' Studio ' })).toEqual({ success: true, data: { name: 'Studio' } });
  });

  it.each([
    ['an empty name', { name: '' }, ['name']],
    ['41 characters', { name: 'a'.repeat(41) }, ['name']],
    ['no name', {}, ['name']],
    ['an unknown field', { name: 'Studio', typeId: STUDIO }, ['(root)']],
  ])('rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(TypeBody, body)).toEqual(paths);
  });
});

describe('WindowBody', () => {
  it.each([
    ['08:00', '12:00'],
    ['00:00', '00:15'],
    ['23:45', '24:00'],
    ['00:00', '24:00'],
  ])('accepts %s–%s', (start, end) => {
    const body = { start, end, typeId: STUDIO };
    expect(WindowBody.safeParse(body)).toEqual({ success: true, data: body });
  });

  it.each([
    ['end before start', { start: '12:00', end: '08:00', typeId: STUDIO }, ['end']],
    ['end equal to start', { start: '08:00', end: '08:00', typeId: STUDIO }, ['end']],
    ['24:00 as a start', { start: '24:00', end: '24:00', typeId: STUDIO }, ['start']],
    ['off the 15-minute grid', { start: '08:10', end: '09:00', typeId: STUDIO }, ['start']],
    ['a typeId that is not a ULID', { start: '08:00', end: '09:00', typeId: 'studio' }, ['typeId']],
    ['no typeId', { start: '08:00', end: '09:00' }, ['typeId']],
    ['an unknown field', { start: '08:00', end: '09:00', typeId: STUDIO, date: '2026-11-16' }, ['(root)']],
  ])('rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(WindowBody, body)).toEqual(paths);
  });

  it('reports a malformed time once, without a second message about the order', () => {
    expect(rejectedPaths(WindowBody, { start: 'noon', end: '08:00', typeId: STUDIO })).toEqual(['start']);
  });
});

describe('PatternBody', () => {
  const valid = { weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };

  it.each([
    ['no end (validUntil null)', valid],
    ['validUntil after validFrom', { ...valid, validUntil: '2026-12-31' }],
    ['validUntil equal to validFrom (one date)', { ...valid, validUntil: '2026-11-01' }],
    ['Sunday until 24:00', { ...valid, weekday: 7, end: '24:00' }],
  ])('accepts %s', (_case, body) => {
    expect(PatternBody.safeParse(body)).toEqual({ success: true, data: body });
  });

  it.each([
    ['validUntil before validFrom', { ...valid, validUntil: '2026-10-31' }, ['validUntil']],
    ['end before start', { ...valid, start: '12:00', end: '08:00' }, ['end']],
    ['weekday 0', { ...valid, weekday: 0 }, ['weekday']],
    ['weekday 8', { ...valid, weekday: 8 }, ['weekday']],
    ['an unreal validFrom', { ...valid, validFrom: '2027-02-29' }, ['validFrom']],
    ['validUntil absent (null is required to mean "no end")', { ...valid, validUntil: undefined }, ['validUntil']],
    ['an unknown field', { ...valid, patternId: STUDIO }, ['(root)']],
  ])('rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(PatternBody, body)).toEqual(paths);
  });
});

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('OverrideBody', () => {
  const window = (hour: number) => ({ start: `${String(hour).padStart(2, '0')}:00`, end: `${String(hour).padStart(2, '0')}:30`, typeId: STUDIO });
  const windows = (count: number) => Array.from({ length: count }, (_, i) => window(i + 8));

  it.each([0, 1, 10])('accepts %i windows', (count) => {
    expect(OverrideBody.safeParse({ windows: windows(count) })).toEqual({ success: true, data: { windows: windows(count) } });
  });

  it('rejects 11 windows', () => {
    expect(rejectedPaths(OverrideBody, { windows: windows(11) })).toEqual(['windows']);
  });

  it('does not check overlap among its windows: that is 409 availability_overlap (R-AV-01)', () => {
    expect(OverrideBody.safeParse({ windows: [window(8), window(8)] }).success).toBe(true);
  });

  it.each([
    ['a window with end before start', { windows: [{ start: '12:00', end: '08:00', typeId: STUDIO }] }, ['windows.0.end']],
    ['a window with an unknown field', { windows: [{ ...window(8), source: 'override' }] }, ['windows.0']],
    ['no windows field', {}, ['windows']],
    ['windows not a list', { windows: window(8) }, ['windows']],
    ['an unknown field', { windows: [], date: '2026-11-16' }, ['(root)']],
  ])('rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(OverrideBody, body)).toEqual(paths);
  });
});

describe('OneOffWindowBody', () => {
  const valid = { date: '2026-11-09', start: '15:00', end: '17:00', typeId: STUDIO };

  it('accepts a window on a date', () => {
    expect(OneOffWindowBody.safeParse(valid)).toEqual({ success: true, data: valid });
  });

  it('does not know "today": a past date is 409 date_in_past, decided by the back end', () => {
    expect(OneOffWindowBody.safeParse({ ...valid, date: '2000-01-01' }).success).toBe(true);
  });

  it.each([
    ['end before start', { ...valid, end: '14:00' }, ['end']],
    ['no date', { ...valid, date: undefined }, ['date']],
    ['an unreal date', { ...valid, date: '2026-11-31' }, ['date']],
    ['an unknown field', { ...valid, windowId: STUDIO }, ['(root)']],
  ])('rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(OneOffWindowBody, body)).toEqual(paths);
  });
});

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('BookBody and ChangeBody', () => {
  const start = '2026-11-16T08:00:00.000Z';

  it.each([
    ['a start only (a User: end is start + 60 min)', { start }, { start }],
    ['start, end, username and note', { start, end: '2026-11-16T08:45:00.000Z', username: 'alice', note: ' First lesson ' }, { start, end: '2026-11-16T08:45:00.000Z', username: 'alice', note: 'First lesson' }],
    ['a null note', { start, note: null }, { start, note: null }],
    ['an empty note, as null', { start, note: '' }, { start, note: null }],
  ])('BookBody accepts %s', (_case, body, data) => {
    expect(BookBody.safeParse(body)).toEqual({ success: true, data });
  });

  it('does not check the grid or the length: they depend on the role and the zone (R-BOOK-02)', () => {
    expect(BookBody.safeParse({ start: '2026-11-16T08:07:00.000Z', end: '2026-11-16T08:08:00.000Z' }).success).toBe(true);
  });

  it.each([
    ['end before start', { start, end: '2026-11-16T07:00:00.000Z' }, ['end']],
    ['end equal to start', { start, end: start }, ['end']],
    ['no start', { end: start }, ['start']],
    ['a start with an offset', { start: '2026-11-16T09:00:00.000+01:00' }, ['start']],
    ['an invalid username', { start, username: 'Alice' }, ['username']],
    ['a note of 501 characters', { start, note: 'a'.repeat(501) }, ['note']],
    ['an unknown field', { start, typeId: STUDIO }, ['(root)']],
  ])('BookBody rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(BookBody, body)).toEqual(paths);
  });

  it('ChangeBody keeps "note absent" (keep the old note) apart from "note: null" (clear it), R-CHG-03', () => {
    expect(ChangeBody.parse({ start })).toEqual({ start });
    expect(ChangeBody.parse({ start, note: null })).toEqual({ start, note: null });
  });

  it.each([
    ['a username: the User of a change never changes (8.4)', { start, username: 'alice' }, ['(root)']],
    ['end before start', { start, end: '2026-11-16T07:45:00.000Z' }, ['end']],
  ])('ChangeBody rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(ChangeBody, body)).toEqual(paths);
  });
});

describe('NoteBody', () => {
  it.each([
    [{ note: 'Bring the report' }, { note: 'Bring the report' }],
    [{ note: null }, { note: null }],
    [{ note: '  ' }, { note: null }],
  ])('accepts %j', (body, data) => {
    expect(NoteBody.safeParse(body)).toEqual({ success: true, data });
  });

  it.each([
    ['no note field', {}, ['note']],
    ['a control character', { note: 'a\tb' }, ['note']],
    ['an unknown field', { note: null, start: '2026-11-16T08:00:00.000Z' }, ['(root)']],
  ])('rejects %s', (_case, body, paths) => {
    expect(rejectedPaths(NoteBody, body)).toEqual(paths);
  });
});

describe('path parameters', () => {
  it.each([
    ['typeId', TypeIdParam],
    ['patternId', PatternIdParam],
    ['windowId', WindowIdParam],
    ['appointmentId', AppointmentIdParam],
  ] as const)('%s: a ULID', (field, schema) => {
    expect(schema.safeParse({ [field]: STUDIO })).toEqual({ success: true, data: { [field]: STUDIO } });
    expect(rejectedPaths(schema, { [field]: 'not-a-ulid' })).toEqual([field]);
    expect(rejectedPaths(schema, {})).toEqual([field]);
  });

  it('date: a real local date', () => {
    expect(DateParam.safeParse({ date: '2026-11-16' })).toEqual({ success: true, data: { date: '2026-11-16' } });
    expect(rejectedPaths(DateParam, { date: '2026-02-30' })).toEqual(['date']);
    expect(rejectedPaths(DateParam, { date: '16-11-2026' })).toEqual(['date']);
  });
});

describe('CalendarQuery (GET /calendar)', () => {
  it.each([
    ['one date', '2026-11-16', '2026-11-16'],
    ['a week', '2026-11-16', '2026-11-22'],
    ['31 days', '2026-11-01', '2026-12-01'],
    ['31 days across a year end', '2026-12-15', '2027-01-14'],
    ['31 days across a leap day', '2028-02-10', '2028-03-11'],
  ])('accepts %s', (_case, from, to) => {
    expect(CalendarQuery.safeParse({ from, to })).toEqual({ success: true, data: { from, to } });
  });

  it.each([
    ['32 days', { from: '2026-11-01', to: '2026-12-02' }, ['to']],
    ['AC-33: 2026-11-01 to 2026-12-15', { from: '2026-11-01', to: '2026-12-15' }, ['to']],
    ['from after to', { from: '2026-11-16', to: '2026-11-15' }, ['to']],
    ['no to', { from: '2026-11-16' }, ['to']],
    ['no parameters', {}, ['from', 'to']],
    ['an unreal date', { from: '2026-11-31', to: '2026-12-01' }, ['from']],
    ['an unknown parameter', { from: '2026-11-16', to: '2026-11-16', upcoming: 'true' }, ['(root)']],
  ])('rejects %s', (_case, query, paths) => {
    expect(rejectedPaths(CalendarQuery, query)).toEqual(paths);
  });
});

describe('AppointmentsQuery (GET /calendar/appointments)', () => {
  it.each([
    ['a range, status defaulting to booked', { from: '2026-11-01', to: '2026-11-30' }, { from: '2026-11-01', to: '2026-11-30', status: 'booked' }],
    ['92 days', { from: '2026-11-01', to: '2027-01-31' }, { from: '2026-11-01', to: '2027-01-31', status: 'booked' }],
    ['upcoming=true', { upcoming: 'true' }, { upcoming: 'true', status: 'booked' }],
    ['upcoming with a username and status all', { upcoming: 'true', username: 'alice', status: 'all' }, { upcoming: 'true', username: 'alice', status: 'all' }],
    ['a range with status cancelled', { from: '2026-11-01', to: '2026-11-01', status: 'cancelled' }, { from: '2026-11-01', to: '2026-11-01', status: 'cancelled' }],
  ])('accepts %s', (_case, query, data) => {
    expect(AppointmentsQuery.safeParse(query)).toEqual({ success: true, data });
  });

  it.each([
    ['93 days', { from: '2026-11-01', to: '2027-02-01' }, ['to']],
    ['from after to', { from: '2026-11-02', to: '2026-11-01' }, ['to']],
    ['upcoming together with from', { upcoming: 'true', from: '2026-11-01' }, ['upcoming']],
    ['upcoming together with from and to', { upcoming: 'true', from: '2026-11-01', to: '2026-11-02' }, ['upcoming']],
    ['from without to', { from: '2026-11-01' }, ['upcoming']],
    ['to without from', { to: '2026-11-01' }, ['upcoming']],
    ['neither a range nor upcoming', {}, ['upcoming']],
    ['upcoming=false', { upcoming: 'false' }, ['upcoming']],
    ['upcoming=1', { upcoming: '1' }, ['upcoming']],
    ['an unknown status', { upcoming: 'true', status: 'ended' }, ['status']],
    ['an invalid username', { upcoming: 'true', username: 'A' }, ['username']],
    ['an unknown parameter', { upcoming: 'true', limit: '10' }, ['(root)']],
  ])('rejects %s', (_case, query, paths) => {
    expect(rejectedPaths(AppointmentsQuery, query)).toEqual(paths);
  });
});
