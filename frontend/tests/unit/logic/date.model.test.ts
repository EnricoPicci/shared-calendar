import { CALENDAR_LIMITS, OneOffWindowBody, OverrideBody, toInstant, type AvailabilityType, type CalendarDay, type CalendarWindow, type WeeklyPattern, type WindowBody } from '@shared-calendar/shared';
import {
  dateFor,
  dateWords,
  DATE_NEEDED,
  dayModel,
  DRAFT_EMPTY,
  DRAFT_FULL,
  draftAdd,
  draftModel,
  NO_EXTRAS,
  NO_PATTERN_HOURS,
  NOT_AVAILABLE,
  IN_FAULT_TOO,
  OVERLAPS_DRAFT,
  OWN_WINDOWS,
  PAST_DATE,
  PATTERNS_APPLY,
  PATTERNS_NOT_KNOWN,
  STARTING_WINDOW,
  startingWindows,
  windowFor,
  type WindowFields,
} from '../../../src/logic/date.model';
import { POOL, STUDIO } from './fixtures';
import { useFarBrowserZone } from './zone';

const ROME = 'Europe/Rome';
const STAMPS = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const TYPES: AvailabilityType[] = [
  { typeId: POOL, name: 'Piscina', ...STAMPS },
  { typeId: STUDIO, name: 'Studio', ...STAMPS },
];
const pattern = (patternId: string, over: Partial<WeeklyPattern> = {}): WeeklyPattern => ({ patternId: `01M6PATTERN00000000000000${patternId}`, weekday: 1, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null, ...STAMPS, ...over });
const MONDAY = '2026-11-23';
const W1 = '01M6W1ND0W0000000000000001';
const W2 = '01M6W1ND0W0000000000000002';
// A window of the Administrator's calendar view: local times of `date` turned into instants,
// as the server does.
const seen = (date: string, start: string, end: string, typeId: string, typeName: string, source?: CalendarWindow['source'], sourceId?: string, zone = ROME): CalendarWindow => ({
  start: toInstant(date, start, zone),
  end: toInstant(date, end, zone),
  typeId,
  typeName,
  ...(source === undefined ? {} : { source, sourceId: sourceId ?? date }),
});
const dayOf = (date: string, windows: CalendarWindow[], hasOverride?: boolean): CalendarDay => ({ date, weekday: 1, windows, slots: [], busy: [], ...(hasOverride === undefined ? {} : { hasOverride }) });
const lines = (rows: { time: string; typeName: string }[]) => rows.map((row) => `${row.time} ${row.typeName}`);
const fields = (start: string, end: string, typeId = STUDIO): WindowFields => ({ start, end, typeId });
const window = (start: string, end: string, typeId = STUDIO): WindowBody => ({ start, end, typeId });

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('date.model', () => {
  useFarBrowserZone();

  describe('dateFor: the date chosen, checked before any call', () => {
    it('an empty field and a text that is not a date are refused with the same sentence', () => {
      for (const text of ['', '2026-11', '23/11/2026', '2026-02-30', 'tomorrow']) expect(dateFor(text, '2026-11-20'), text).toEqual({ refusal: DATE_NEEDED });
    });

    it('a date before today is refused (R-AV-02); today and tomorrow are accepted', () => {
      expect(dateFor('2026-11-19', '2026-11-20')).toEqual({ refusal: PAST_DATE });
      expect(dateFor('2025-12-31', '2026-01-01')).toEqual({ refusal: PAST_DATE });
      expect(dateFor('2026-11-20', '2026-11-20')).toEqual({ date: '2026-11-20' });
      expect(dateFor('2026-11-21', '2026-11-20')).toEqual({ date: '2026-11-21' });
    });

    it('the sentence of a past date says that it cannot be changed', () => {
      expect(PAST_DATE).toBe('A date before today cannot be changed. The week shows what a past day had.');
    });
  });

  it('dateWords: a date with its weekday and its year, whatever the browser\'s zone', () => {
    expect([dateWords('2026-11-23'), dateWords('2027-01-03'), dateWords('2028-02-29')]).toEqual(['Monday 23 November 2026', 'Sunday 3 January 2027', 'Tuesday 29 February 2028']);
  });

  describe('dayModel: the day as the weekly patterns give it', () => {
    const given = (patterns: WeeklyPattern[] | null, date = MONDAY, types: AvailabilityType[] | null = TYPES) => {
      const model = dayModel(date, patterns, types, dayOf(date, []), ROME);
      return [lines(model.patterns), model.patternsNone];
    };

    it('no pattern that day: the sentence, and no row', () => {
      expect(given([])).toEqual([[], NO_PATTERN_HOURS]);
      expect(given([pattern('1', { weekday: 2 })])).toEqual([[], NO_PATTERN_HOURS]);
    });

    it('one pattern: its hours, written as a pattern\'s are, and its type', () => {
      expect(given([pattern('1')])).toEqual([['09:00 – 13:00 Studio'], null]);
    });

    it('two patterns: by start, whatever the order they came in', () => {
      expect(given([pattern('2', { start: '15:00', end: '18:00', typeId: POOL }), pattern('1')])).toEqual([['09:00 – 13:00 Studio', '15:00 – 18:00 Piscina'], null]);
    });

    it('a pattern not yet valid on the date, and one no longer valid, give nothing; one that starts or ends on the date does', () => {
      expect(given([pattern('1', { validFrom: '2026-11-24' }), pattern('2', { validFrom: '2026-01-01', validUntil: '2026-11-22' })])).toEqual([[], NO_PATTERN_HOURS]);
      expect(given([pattern('1', { validFrom: MONDAY }), pattern('2', { start: '14:00', end: '15:00', validFrom: '2026-01-01', validUntil: MONDAY })])).toEqual([['09:00 – 13:00 Studio', '14:00 – 15:00 Studio'], null]);
    });

    it('an end at midnight is "24:00"', () => {
      expect(given([pattern('1', { start: '20:00', end: '24:00' })])).toEqual([['20:00 – 24:00 Studio'], null]);
    });

    it('a type the types do not hold, and no list of types at all, are "Unknown type"', () => {
      expect(given([pattern('1', { typeId: '01M6UNKNOWN000000000000000' })])).toEqual([['09:00 – 13:00 Unknown type'], null]);
      expect(given([pattern('1')], MONDAY, null)).toEqual([['09:00 – 13:00 Unknown type'], null]);
    });

    it('while the patterns could not be read, the sentence says so and no row is made up', () => {
      expect(given(null)).toEqual([[], PATTERNS_NOT_KNOWN]);
    });

    it('the nights the clocks go back and forward: the patterns\' hours are local times, and nothing moves', () => {
      const night = pattern('1', { weekday: 7, start: '01:00', end: '04:00', validFrom: '2027-01-01' });
      expect(given([night], '2027-10-31')).toEqual([['01:00 – 04:00 Studio'], null]);
      expect(given([night], '2027-03-28')).toEqual([['01:00 – 04:00 Studio'], null]);
    });
  });

  describe('dayModel: the day as it is now, from the Administrator\'s calendar view', () => {
    const now = (day: CalendarDay, zone = ROME) => {
      const model = dayModel(day.date, [pattern('1')], TYPES, day, zone);
      return { which: model.which, own: lines(model.own), extras: lines(model.extras), extrasNone: model.extrasNone, hasOverride: model.hasOverride };
    };

    it('no override and no extra window: the weekly patterns apply, and "Back to the weekly patterns" is not offered', () => {
      expect(now(dayOf(MONDAY, [seen(MONDAY, '09:00', '13:00', STUDIO, 'Studio', 'pattern', 'p1')], false))).toEqual({ which: PATTERNS_APPLY, own: [], extras: [], extrasNone: NO_EXTRAS, hasOverride: false });
    });

    it('an override with windows: the day has its own, listed in order with the names the server gives', () => {
      const day = dayOf(MONDAY, [seen(MONDAY, '10:00', '12:00', STUDIO, 'Studio', 'override'), seen(MONDAY, '14:00', '24:00', POOL, 'Piscina', 'override')], true);
      expect(now(day)).toEqual({ which: OWN_WINDOWS, own: ['10:00 – 12:00 Studio', '14:00 – 24:00 Piscina'], extras: [], extrasNone: NO_EXTRAS, hasOverride: true });
    });

    it('an override with no window: the day is not available', () => {
      expect(now(dayOf(MONDAY, [], true))).toEqual({ which: NOT_AVAILABLE, own: [], extras: [], extrasNone: NO_EXTRAS, hasOverride: true });
    });

    it('extra windows are listed apart, with and without an override', () => {
      const extra = seen(MONDAY, '18:00', '20:00', POOL, 'Piscina', 'one_off', W1);
      expect(now(dayOf(MONDAY, [seen(MONDAY, '09:00', '13:00', STUDIO, 'Studio', 'pattern', 'p1'), extra], false))).toEqual({ which: PATTERNS_APPLY, own: [], extras: ['18:00 – 20:00 Piscina'], extrasNone: null, hasOverride: false });
      expect(now(dayOf(MONDAY, [extra], true))).toEqual({ which: NOT_AVAILABLE, own: [], extras: ['18:00 – 20:00 Piscina'], extrasNone: null, hasOverride: true });
    });

    it('an extra window carries its id, the name of its button and the question before its deletion', () => {
      const model = dayModel(MONDAY, [], TYPES, dayOf(MONDAY, [seen(MONDAY, '18:00', '20:00', POOL, 'Piscina', 'one_off', W1)], false), ROME);
      expect(model.extras).toEqual([
        {
          windowId: W1,
          time: '18:00 – 20:00',
          typeName: 'Piscina',
          deleteLabel: 'Delete the extra window 18:00 – 20:00 Piscina',
          question: 'Delete the extra window 18:00 – 20:00 Piscina of Monday 23 November 2026? Its hours will no longer be open for booking. This cannot be undone.',
        },
      ]);
    });

    it('the date in words, and the two questions about the day', () => {
      const model = dayModel(MONDAY, [], TYPES, dayOf(MONDAY, [], false), ROME);
      expect(model.date).toBe('Monday 23 November 2026');
      expect(model.closeQuestion).toBe('Make Monday 23 November 2026 not available? No hours of the weekly patterns, and none of its own, will be open for booking on this day. Its extra windows stay.');
      expect(model.reopenQuestion).toBe('Back to the weekly patterns for Monday 23 November 2026? What was set for this day only will be removed. Its extra windows stay.');
    });

    it('a view whose windows say no source and whose day says no override (a User\'s, which cannot arrive here): the patterns apply, and no window is listed as the day\'s own or as extra', () => {
      const day = dayOf(MONDAY, [seen(MONDAY, '09:00', '13:00', STUDIO, 'Studio')]);
      expect(now(day)).toEqual({ which: PATTERNS_APPLY, own: [], extras: [], extrasNone: NO_EXTRAS, hasOverride: false });
      expect(startingWindows(MONDAY, day, ROME)).toEqual([]);
    });

    it('the times are the calendar\'s, not the browser\'s: a half-hour zone', () => {
      const zone = 'Asia/Kolkata';
      const day = dayOf(MONDAY, [seen(MONDAY, '09:30', '11:00', STUDIO, 'Studio', 'override', MONDAY, zone)], true);
      expect(now(day, zone).own).toEqual(['09:30 – 11:00 Studio']);
    });
  });

  describe('startingWindows: what "this day only" starts from', () => {
    it('on a day with no override, the windows the weekly patterns give it, as local times, by start; the extra ones are left out', () => {
      const day = dayOf(
        MONDAY,
        [seen(MONDAY, '15:00', '18:00', POOL, 'Piscina', 'pattern', 'p2'), seen(MONDAY, '09:00', '13:00', STUDIO, 'Studio', 'pattern', 'p1'), seen(MONDAY, '19:00', '20:00', POOL, 'Piscina', 'one_off', W1)],
        false,
      );
      expect(startingWindows(MONDAY, day, ROME)).toEqual([window('09:00', '13:00'), window('15:00', '18:00', POOL)]);
    });

    it('on a day with an override, the override\'s own; an end at midnight is "24:00"', () => {
      const day = dayOf(MONDAY, [seen(MONDAY, '10:00', '12:00', STUDIO, 'Studio', 'override'), seen(MONDAY, '20:00', '24:00', POOL, 'Piscina', 'override')], true);
      expect(startingWindows(MONDAY, day, ROME)).toEqual([window('10:00', '12:00'), window('20:00', '24:00', POOL)]);
    });

    it('a day that is not available starts with no window', () => {
      expect(startingWindows(MONDAY, dayOf(MONDAY, [seen(MONDAY, '19:00', '20:00', POOL, 'Piscina', 'one_off', W2)], true), ROME)).toEqual([]);
    });

    it('what it starts from is a body the shared schema accepts unchanged', () => {
      const day = dayOf(MONDAY, [seen(MONDAY, '10:00', '12:00', STUDIO, 'Studio', 'override'), seen(MONDAY, '20:00', '24:00', POOL, 'Piscina', 'override')], true);
      const windows = startingWindows(MONDAY, day, ROME);
      expect(OverrideBody.parse({ windows })).toEqual({ windows });
    });

    it('the night the clocks go back: the hours read back as they were written', () => {
      const day = dayOf('2027-10-31', [seen('2027-10-31', '01:00', '04:00', STUDIO, 'Studio', 'override')], true);
      expect(startingWindows('2027-10-31', day, ROME)).toEqual([window('01:00', '04:00')]);
    });

    it('the night the clocks go forward: a window across the missing hour reads back from where the clock resumes, and one inside it that holds no time is left out', () => {
      const day = dayOf('2027-03-28', [seen('2027-03-28', '02:00', '04:00', STUDIO, 'Studio', 'override'), seen('2027-03-28', '02:00', '03:00', POOL, 'Piscina', 'override')], true);
      expect(startingWindows('2027-03-28', day, ROME)).toEqual([window('03:00', '04:00')]);
    });
  });

  describe('draftModel: the windows being put together, ready to draw', () => {
    it('a row per window, in the order given, with its hours, its type and the name of its "Remove" button', () => {
      expect(draftModel([window('09:00', '13:00'), window('15:00', '24:00', POOL)], TYPES)).toEqual({
        rows: [
          { time: '09:00 – 13:00', typeName: 'Studio', removeLabel: 'Remove 09:00 – 13:00 Studio' },
          { time: '15:00 – 24:00', typeName: 'Piscina', removeLabel: 'Remove 15:00 – 24:00 Piscina' },
        ],
        empty: null,
      });
    });

    it('none left: the sentence says what saving would do', () => {
      expect(draftModel([], TYPES)).toEqual({ rows: [], empty: DRAFT_EMPTY });
    });

    it('a type the types do not hold, and no list of types, are "Unknown type"', () => {
      expect(draftModel([window('09:00', '10:00', '01M6UNKNOWN000000000000000')], TYPES).rows[0]!.typeName).toBe('Unknown type');
      expect(draftModel([window('09:00', '10:00')], null).rows[0]!.typeName).toBe('Unknown type');
    });
  });

  describe('draftAdd: "Add"', () => {
    const DRAFT = [window('09:00', '12:00'), window('14:00', '16:00', POOL)];

    it('a window in free hours is added, and the list stays by start', () => {
      expect(draftAdd(DRAFT, fields('12:30', '13:30'))).toEqual({ windows: [window('09:00', '12:00'), window('12:30', '13:30'), window('14:00', '16:00', POOL)] });
      expect(draftAdd(DRAFT, fields('07:00', '08:00', POOL))).toEqual({ windows: [window('07:00', '08:00', POOL), ...DRAFT] });
      expect(draftAdd([], fields('20:00', '24:00'))).toEqual({ windows: [window('20:00', '24:00')] });
    });

    it('the list given is left as it was', () => {
      const before = [...DRAFT];
      draftAdd(DRAFT, fields('07:00', '08:00'));
      expect(DRAFT).toEqual(before);
    });

    it('the end not after the start, and no type chosen, are refused under their fields, both at once, with the sentences of a pattern\'s form', () => {
      expect(draftAdd(DRAFT, fields('18:00', '18:00'))).toEqual({ refusals: { end: 'End must be later than Start.' } });
      expect(draftAdd(DRAFT, fields('18:00', '17:00', ''))).toEqual({ refusals: { end: 'End must be later than Start.', typeId: 'Type must be chosen.' } });
      expect(draftAdd(DRAFT, fields('18:00', '19:00', ''))).toEqual({ refusals: { typeId: 'Type must be chosen.' } });
    });

    it('a window that overlaps one of the list is refused, whatever its type (R-AV-01): "Start" and "End" are both in fault, and the sentence, which names both, is said once, under "Start"', () => {
      const refused = { refusals: { start: OVERLAPS_DRAFT, end: '' } };
      expect([IN_FAULT_TOO, OVERLAPS_DRAFT.startsWith('Start and End ')]).toEqual(['', true]);
      for (const [start, end] of [['11:00', '13:00'], ['08:00', '09:15'], ['10:00', '11:00'], ['08:00', '17:00'], ['15:45', '24:00']] as const) {
        expect(draftAdd(DRAFT, fields(start, end)), `${start}–${end}`).toEqual(refused);
        expect(draftAdd(DRAFT, fields(start, end, POOL)), `${start}–${end} Piscina`).toEqual(refused);
      }
    });

    it('a window that touches another, before or after, of the same type or not, is accepted (R-AV-01)', () => {
      expect(draftAdd(DRAFT, fields('12:00', '14:00'))).toEqual({ windows: [window('09:00', '12:00'), window('12:00', '14:00'), window('14:00', '16:00', POOL)] });
      expect(draftAdd(DRAFT, fields('16:00', '24:00', POOL))).toEqual({ windows: [...DRAFT, window('16:00', '24:00', POOL)] });
    });

    it('the eleventh window is refused as the form\'s failure, with the number of shared/; the tenth is accepted', () => {
      const hour = (n: number) => `${String(n).padStart(2, '0')}:00`;
      const nine = Array.from({ length: 9 }, (_, i) => window(hour(i), hour(i + 1)));
      const ten = draftAdd(nine, fields('09:00', '10:00'));
      expect('windows' in ten && ten.windows.length).toBe(CALENDAR_LIMITS.overrideWindowsPerDate);
      expect(draftAdd('windows' in ten ? ten.windows : [], fields('10:00', '11:00'))).toEqual({ failure: DRAFT_FULL });
      expect(DRAFT_FULL).toBe('A day can have 10 windows of its own at most. Remove one to add another.');
    });

    it('every list it makes is a body the shared schema accepts unchanged, an empty one too', () => {
      const added = draftAdd(DRAFT, fields('16:00', '24:00'));
      const windows = 'windows' in added ? added.windows : [];
      expect(OverrideBody.parse({ windows })).toEqual({ windows });
      expect(OverrideBody.parse({ windows: [] })).toEqual({ windows: [] });
    });

    it('what it refuses for a field, the shared schema refuses too', () => {
      expect(OverrideBody.safeParse({ windows: [fields('18:00', '18:00')] }).success).toBe(false);
      expect(OverrideBody.safeParse({ windows: [fields('18:00', '19:00', '')] }).success).toBe(false);
    });
  });

  describe('windowFor: an extra window\'s body from its form', () => {
    it('the three fields and the date on show, as a body the shared schema accepts unchanged', () => {
      const made = windowFor(MONDAY, fields('18:00', '24:00', POOL));
      expect(made).toEqual({ window: { date: MONDAY, start: '18:00', end: '24:00', typeId: POOL } });
      expect(OneOffWindowBody.parse('window' in made && made.window)).toEqual('window' in made && made.window);
    });

    it('the end not after the start and no type chosen are refused under their fields, both at once; the schema refuses them too', () => {
      expect(windowFor(MONDAY, fields('18:00', '17:45'))).toEqual({ refusals: { end: 'End must be later than Start.' } });
      expect(windowFor(MONDAY, fields('18:00', '19:00', ''))).toEqual({ refusals: { typeId: 'Type must be chosen.' } });
      expect(windowFor(MONDAY, fields('18:00', '18:00', ''))).toEqual({ refusals: { end: 'End must be later than Start.', typeId: 'Type must be chosen.' } });
      expect(OneOffWindowBody.safeParse({ date: MONDAY, ...fields('18:00', '17:45') }).success).toBe(false);
      expect(OneOffWindowBody.safeParse({ date: MONDAY, ...fields('18:00', '19:00', '') }).success).toBe(false);
    });
  });

  it('a form that adds a window starts on 09:00 to 10:00 with no type chosen', () => {
    expect(STARTING_WINDOW).toEqual({ start: '09:00', end: '10:00', typeId: '' });
  });
});
