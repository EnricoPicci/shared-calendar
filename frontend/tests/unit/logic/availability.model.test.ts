import { CALENDAR_LIMITS, PatternBody, TYPE_CAPACITY, TypeBody, type AvailabilityType, type WeeklyPattern } from '@shared-calendar/shared';
import {
  deletePatternQuestion,
  deleteTypeQuestion,
  END_CHOICES,
  NO_PATTERNS,
  NO_TYPE_YET,
  NO_TYPES,
  PATTERN_FIELDS,
  patternFields,
  patternFor,
  patternGroups,
  START_CHOICES,
  startingFields,
  STARTING_TYPE,
  TYPE_CAPACITY_HINT,
  TYPE_NAME_HINT,
  typeChoices,
  typeFor,
  typeNameFor,
  typeRows,
  UNKNOWN_TYPE,
  WEEKDAY_CHOICES,
  type PatternFields,
} from '../../../src/logic/availability.model';
import { POOL, STUDIO } from './fixtures';
import { useFarBrowserZone } from './zone';

const SCRIPT = '<script>alert(1)</script>';
const type = (typeId: string, name: string): AvailabilityType => ({ typeId, name, capacity: 1, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' });
const TYPES = [type(POOL, 'Piscina'), type(STUDIO, 'Studio')];
let made = 0;
const pattern = (over: Partial<WeeklyPattern> = {}): WeeklyPattern => ({
  patternId: `01M6PATTERN${String(++made).padStart(15, '0')}`,
  weekday: 1,
  start: '09:00',
  end: '13:00',
  typeId: STUDIO,
  validFrom: '2026-11-20',
  validUntil: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...over,
});
const TODAY = '2026-11-20';
const FIELDS: PatternFields = { weekday: '3', start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: '' };

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('availability.model', () => {
  useFarBrowserZone();

  describe('typeRows (6.1)', () => {
    it('several types: one row each, in the server\'s order, with the names of its two buttons', () => {
      expect(typeRows(TYPES)).toEqual([
        { typeId: POOL, name: 'Piscina', places: '', editLabel: 'Edit Piscina', deleteLabel: 'Delete Piscina', fields: { name: 'Piscina', capacity: '1' } },
        { typeId: STUDIO, name: 'Studio', places: '', editLabel: 'Edit Studio', deleteLabel: 'Delete Studio', fields: { name: 'Studio', capacity: '1' } },
      ]);
      // Not sorted again here: the order given is kept.
      expect(typeRows([...TYPES].reverse()).map((row) => row.name)).toEqual(['Studio', 'Piscina']);
    });

    it('one type, and none', () => {
      expect(typeRows([type(STUDIO, 'Studio')])).toHaveLength(1);
      expect(typeRows([])).toEqual([]);
      expect(NO_TYPES).toBe('There are no types yet.');
    });

    it('a name containing <script> is kept as text, in the row and in the names of its buttons', () => {
      expect(typeRows([type(STUDIO, SCRIPT)])).toEqual([
        { typeId: STUDIO, name: SCRIPT, places: '', editLabel: `Edit ${SCRIPT}`, deleteLabel: `Delete ${SCRIPT}`, fields: { name: SCRIPT, capacity: '1' } },
      ]);
    });

    it('the words of the dialog that deletes a type name it', () => {
      expect(deleteTypeQuestion(typeRows(TYPES)[1]!)).toBe('Delete the type Studio? This cannot be undone.');
    });
  });

  describe('a type\'s capacity in its row (6.1, D24)', () => {
    it('"· 3 places" beside the name only for a capacity above one; the dialog opens with the capacity as text', () => {
      const rows = typeRows([{ ...type(POOL, 'Piscina'), capacity: 3 }, type(STUDIO, 'Studio'), { ...type(STUDIO, 'Grande'), capacity: 100 }]);
      expect(rows.map((row) => [row.places, row.fields])).toEqual([
        ['· 3 places', { name: 'Piscina', capacity: '3' }],
        ['', { name: 'Studio', capacity: '1' }],
        ['· 100 places', { name: 'Grande', capacity: '100' }],
      ]);
    });
  });

  describe('typeFor (6.1, R-TYPE-01, D24)', () => {
    it('a name and a capacity within the bounds: both, the capacity a number, spaces around either removed', () => {
      expect(typeFor({ name: ' Piscina ', capacity: ' 3 ' })).toEqual({ type: { name: 'Piscina', capacity: 3 } });
      expect(typeFor({ name: 'Uno', capacity: '1' })).toEqual({ type: { name: 'Uno', capacity: 1 } });
      expect(typeFor({ name: 'Cento', capacity: '100' })).toEqual({ type: { name: 'Cento', capacity: 100 } });
    });

    it.each(['0', '101', '2.5', '', '  ', '-1', '3e1', 'three'])('a capacity of "%s" is refused, in the words of the hint', (capacity) => {
      expect(typeFor({ name: 'Sala', capacity })).toEqual({ refusals: { capacity: TYPE_CAPACITY_HINT } });
    });

    it('every value it accepts the shared schema accepts too, and the two bounds outside it refuses', () => {
      for (const capacity of [TYPE_CAPACITY.min, 7, TYPE_CAPACITY.max]) {
        const checked = typeFor({ name: 'Sala', capacity: String(capacity) });
        expect('type' in checked && TypeBody.safeParse(checked.type).success).toBe(true);
      }
      for (const capacity of [TYPE_CAPACITY.min - 1, TYPE_CAPACITY.max + 1]) expect(TypeBody.safeParse({ name: 'Sala', capacity }).success).toBe(false);
    });

    it('a name in fault and a capacity in fault are both refused; a name alone in fault is the only refusal', () => {
      expect(typeFor({ name: '', capacity: '0' })).toEqual({ refusals: { name: TYPE_NAME_HINT, capacity: TYPE_CAPACITY_HINT } });
      expect(typeFor({ name: '', capacity: '3' })).toEqual({ refusals: { name: TYPE_NAME_HINT } });
    });

    it('the hint says the bounds of shared/', () => {
      expect(TYPE_CAPACITY_HINT).toBe('How many people at the same time: a whole number from 1 to 100.');
      expect(TYPE_CAPACITY_HINT.match(/\d+/g)).toEqual([String(TYPE_CAPACITY.min), String(TYPE_CAPACITY.max)]);
    });

    it('a new type starts with no name and the default capacity', () => {
      expect(STARTING_TYPE).toEqual({ name: '', capacity: String(TYPE_CAPACITY.default) });
    });
  });

  describe('typeNameFor (6.1, R-TYPE-01)', () => {
    const FORTY = 'a'.repeat(40);

    it.each([
      ['Studio', 'Studio'],
      [' Studio ', 'Studio'],
      ['\tStudio\n', 'Studio'],
      ['Sala  grande', 'Sala  grande'],
      ['studio', 'studio'],
      [FORTY, FORTY],
      [` ${FORTY} `, FORTY],
      ['x', 'x'],
      [SCRIPT, SCRIPT],
      ['Città · Sala 2', 'Città · Sala 2'],
    ])('"%s" is a name: "%s" is what is sent, and the shared body accepts it', (text, name) => {
      expect(typeNameFor(text)).toEqual({ name });
      expect(TypeBody.parse({ name })).toEqual({ name });
    });

    it.each([
      ['an empty field', ''],
      ['spaces only', '   '],
      ['41 characters', 'a'.repeat(41)],
      ['a tab inside', 'Sala\tgrande'],
      ['a line break inside', 'Sala\ngrande'],
    ])('%s is refused with the hint\'s own words, as the shared body refuses it', (_what, text) => {
      expect(typeNameFor(text)).toEqual({ refusal: TYPE_NAME_HINT });
      expect(TypeBody.safeParse({ name: text }).success).toBe(false);
    });

    it('the hint says the length of shared/, and no other number', () => {
      expect(CALENDAR_LIMITS.typeNameLength).toBe(40);
      expect(TYPE_NAME_HINT).toBe('A name has 1 to 40 characters, with no tab in it.');
      expect(TYPE_NAME_HINT.match(/\d+/g)).toEqual(['1', String(CALENDAR_LIMITS.typeNameLength)]);
    });

    it('a name that exists is not this check\'s to refuse: "studio" and "Studio" both pass', () => {
      expect([typeNameFor('studio'), typeNameFor('Studio')]).toEqual([{ name: 'studio' }, { name: 'Studio' }]);
    });
  });

  describe('the choices of the pattern form (6.2)', () => {
    it('the weekdays are Monday to Sunday, numbered 1 to 7 as the API numbers them', () => {
      expect(WEEKDAY_CHOICES.map(({ value, label }) => `${value} ${label}`)).toEqual(['1 Monday', '2 Tuesday', '3 Wednesday', '4 Thursday', '5 Friday', '6 Saturday', '7 Sunday']);
    });

    it('a start is one of the 96 steps from 00:00 to 23:45, an end one of the 96 from 00:15 to 24:00', () => {
      expect([START_CHOICES.length, START_CHOICES[0]!.value, START_CHOICES[1]!.value, START_CHOICES.at(-1)!.value]).toEqual([96, '00:00', '00:15', '23:45']);
      expect([END_CHOICES.length, END_CHOICES[0]!.value, END_CHOICES.at(-2)!.value, END_CHOICES.at(-1)!.value]).toEqual([96, '00:15', '23:45', '24:00']);
      for (const { value, label } of [...START_CHOICES, ...END_CHOICES]) expect(label).toBe(value);
    });

    it('every start with every later end is a body the shared schema accepts: nothing off the grid can be chosen', () => {
      for (const start of START_CHOICES) {
        const end = END_CHOICES.find((choice) => choice.value > start.value)!;
        expect(PatternBody.safeParse({ weekday: 1, start: start.value, end: end.value, typeId: STUDIO, validFrom: TODAY, validUntil: null }).success, start.value).toBe(true);
      }
      for (const end of END_CHOICES) expect(PatternBody.safeParse({ weekday: 7, start: '00:00', end: end.value, typeId: STUDIO, validFrom: TODAY, validUntil: null }).success, end.value).toBe(true);
    });

    it('the types to choose from: their ids as values, their names as labels, in the order given; a name with <script> as text', () => {
      expect(typeChoices(TYPES)).toEqual([{ value: POOL, label: 'Piscina' }, { value: STUDIO, label: 'Studio' }]);
      expect(typeChoices([type(STUDIO, SCRIPT)])).toEqual([{ value: STUDIO, label: SCRIPT }]);
      expect(typeChoices([])).toEqual([]);
      expect(NO_TYPE_YET).toBe('Create a type first: a pattern needs one.');
    });
  });

  describe('the fields of a pattern', () => {
    it('the form that creates starts on Monday, 09:00 to 10:00, no type chosen, valid from today with no end', () => {
      expect(startingFields('2026-11-20')).toEqual({ weekday: '1', start: '09:00', end: '10:00', typeId: '', validFrom: '2026-11-20', validUntil: '' });
      expect(Object.keys(startingFields('2026-11-20'))).toEqual([...PATTERN_FIELDS]);
    });

    it('while today is not known, "valid from" starts empty', () => {
      expect(startingFields(null).validFrom).toBe('');
    });

    it('the fields of an existing pattern, with and without an end', () => {
      expect(patternFields(pattern({ weekday: 6, start: '10:00', end: '12:00', typeId: POOL, validFrom: '2026-11-20', validUntil: '2027-01-19' }))).toEqual({
        weekday: '6', start: '10:00', end: '12:00', typeId: POOL, validFrom: '2026-11-20', validUntil: '2027-01-19',
      });
      expect(patternFields(pattern()).validUntil).toBe('');
    });

    it.each([
      pattern(),
      pattern({ weekday: 7, start: '00:00', end: '24:00', typeId: POOL, validFrom: '2020-01-01', validUntil: '2020-01-01' }),
      pattern({ weekday: 4, start: '22:15', end: '23:45', validUntil: '2030-12-31' }),
    ])('the fields of pattern %# sent back unchanged make the same body', (existing) => {
      const { weekday, start, end, typeId, validFrom, validUntil } = existing;
      expect(patternFor(patternFields(existing))).toEqual({ pattern: { weekday, start, end, typeId, validFrom, validUntil } });
    });
  });

  describe('patternFor (6.2)', () => {
    const accepted = (fields: PatternFields) => {
      const checked = patternFor(fields);
      if (!('pattern' in checked)) throw new Error(`refused: ${JSON.stringify(checked.refusals)}`);
      // The shared schema has the last word: what the logic accepts, it accepts, unchanged.
      expect(PatternBody.parse(checked.pattern)).toEqual(checked.pattern);
      return checked.pattern;
    };
    const refusals = (over: Partial<PatternFields>) => {
      const checked = patternFor({ ...FIELDS, ...over });
      if (!('refusals' in checked)) throw new Error('accepted');
      // What the logic refuses, the shared schema refuses too.
      const { weekday, validUntil, ...rest } = { ...FIELDS, ...over };
      expect(PatternBody.safeParse({ ...rest, weekday: Number(weekday), validUntil: validUntil === '' ? null : validUntil }).success).toBe(false);
      return checked.refusals;
    };

    it('six good fields: the body, the weekday as a number, "valid until" empty as null', () => {
      expect(accepted(FIELDS)).toEqual({ weekday: 3, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null });
    });

    it('with an end of validity; the same day as the start of validity is allowed; an end at 24:00; a start in the past', () => {
      expect(accepted({ ...FIELDS, validUntil: '2027-01-19' }).validUntil).toBe('2027-01-19');
      expect(accepted({ ...FIELDS, validUntil: '2026-11-20' }).validUntil).toBe('2026-11-20');
      expect(accepted({ ...FIELDS, start: '23:45', end: '24:00' }).end).toBe('24:00');
      // "Today" is not a rule here (docs/SHARED_CALENDAR_SPEC.md R-PAT-03).
      expect(accepted({ ...FIELDS, validFrom: '2019-01-01', validUntil: '2019-12-31' }).validFrom).toBe('2019-01-01');
    });

    it.each([
      ['equal to the start', '09:00', '09:00'],
      ['before the start', '09:00', '08:45'],
      ['00:15 after a start at 23:45', '23:45', '00:15'],
    ])('an end %s is refused, the End field alone', (_what, start, end) => {
      expect(refusals({ start, end })).toEqual({ end: 'End must be later than Start.' });
    });

    it('no type chosen is refused, the Type field alone', () => {
      expect(refusals({ typeId: '' })).toEqual({ typeId: 'Type must be chosen.' });
    });

    it.each([[''], ['2026-02-30'], ['20/11/2026'], ['2026-11-20T00:00']])('"valid from" as "%s" is refused, that field alone', (validFrom) => {
      expect(refusals({ validFrom })).toEqual({ validFrom: 'Valid from must be a date.' });
    });

    it.each([['2027-02-29'], ['tomorrow']])('"valid until" as "%s" is not a date: refused, that field alone', (validUntil) => {
      expect(refusals({ validUntil })).toEqual({ validUntil: 'Valid until must be a date, or left empty.' });
    });

    it('"valid until" before "valid from" is refused, that field alone', () => {
      expect(refusals({ validUntil: '2026-11-19' })).toEqual({ validUntil: 'Valid until must not be before Valid from.' });
    });

    it('every field in fault is said, each with its own sentence', () => {
      expect(refusals({ start: '10:00', end: '10:00', typeId: '', validFrom: '', validUntil: 'x' })).toEqual({
        end: 'End must be later than Start.',
        typeId: 'Type must be chosen.',
        validFrom: 'Valid from must be a date.',
        validUntil: 'Valid until must be a date, or left empty.',
      });
      // With "valid from" not a date, a good "valid until" is not compared with it.
      expect(refusals({ validFrom: '', validUntil: '2026-01-01' })).toEqual({ validFrom: 'Valid from must be a date.' });
      expect(refusals({ end: '08:00', validUntil: '2026-01-01' })).toEqual({ end: 'End must be later than Start.', validUntil: 'Valid until must not be before Valid from.' });
    });
  });

  describe('patternGroups (6.2)', () => {
    const texts = (patterns: WeeklyPattern[], types: AvailabilityType[] | null = TYPES, today = TODAY) =>
      patternGroups(patterns, types, today).map((group) => [group.weekday, group.rows.map((row) => `${row.time} ${row.typeName}${row.ended ? ' (ended)' : ''}`)]);

    it('no pattern: no group, and the sentence of an empty list', () => {
      expect(patternGroups([], TYPES, TODAY)).toEqual([]);
      expect(NO_PATTERNS).toBe('There are no weekly patterns yet.');
    });

    it('one pattern: its group, with its hours, its type\'s name, its validity, the names of its buttons and its fields', () => {
      const one = pattern();
      expect(patternGroups([one], TYPES, TODAY)).toEqual([
        {
          weekday: 'Monday',
          rows: [
            {
              patternId: one.patternId,
              time: '09:00 – 13:00',
              typeName: 'Studio',
              validity: 'from 20 November 2026',
              ended: false,
              what: 'Monday 09:00 – 13:00 Studio',
              changeLabel: 'Change Monday 09:00 – 13:00 Studio',
              deleteLabel: 'Delete Monday 09:00 – 13:00 Studio',
              fields: { weekday: '1', start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: '' },
            },
          ],
        },
      ]);
    });

    it('patterns of several weekdays given out of order: Monday to Sunday, a weekday with none left out', () => {
      const given = [pattern({ weekday: 6, start: '10:00', end: '12:00', typeId: POOL }), pattern({ weekday: 2, start: '15:00', end: '18:00', typeId: POOL }), pattern({ weekday: 7 }), pattern({ weekday: 1 }), pattern({ weekday: 2 })];
      expect(texts(given)).toEqual([
        ['Monday', ['09:00 – 13:00 Studio']],
        ['Tuesday', ['09:00 – 13:00 Studio', '15:00 – 18:00 Piscina']],
        ['Saturday', ['10:00 – 12:00 Piscina']],
        ['Sunday', ['09:00 – 13:00 Studio']],
      ]);
      // The list given is left as it was.
      expect(given.map((p) => p.weekday)).toEqual([6, 2, 7, 1, 2]);
    });

    it('on one weekday: by start, then by end, then by the first date of validity', () => {
      const rows = patternGroups(
        [
          pattern({ start: '14:00', end: '15:00' }),
          pattern({ start: '09:00', end: '12:00', validFrom: '2027-01-01' }),
          pattern({ start: '09:00', end: '12:00', validFrom: '2026-01-01', validUntil: '2026-12-31' }),
          pattern({ start: '09:00', end: '10:00', validFrom: '2028-01-01' }),
          pattern({ start: '00:00', end: '24:00', validFrom: '2019-01-01', validUntil: '2019-01-31' }),
        ],
        TYPES,
        TODAY,
      )[0]!.rows;
      expect(rows.map((row) => `${row.time} ${row.validity}`)).toEqual([
        '00:00 – 24:00 from 1 January 2019 to 31 January 2019',
        '09:00 – 10:00 from 1 January 2028',
        '09:00 – 12:00 from 1 January 2026 to 31 December 2026',
        '09:00 – 12:00 from 1 January 2027',
        '14:00 – 15:00 from 20 November 2026',
      ]);
    });

    it('an end at 24:00 is shown as 24:00', () => {
      expect(texts([pattern({ start: '20:00', end: '24:00' })])).toEqual([['Monday', ['20:00 – 24:00 Studio']]]);
    });

    it('ended: a validity that ended yesterday; not one that ends today, has no end, or starts in the future', () => {
      const rows = patternGroups(
        [
          pattern({ start: '08:00', validFrom: '2026-01-01', validUntil: '2026-11-19' }),
          pattern({ start: '09:00', validFrom: '2026-01-01', validUntil: '2026-11-20' }),
          pattern({ start: '10:00', validFrom: '2026-01-01' }),
          pattern({ start: '11:00', validFrom: '2027-03-01', validUntil: '2027-03-31' }),
        ],
        TYPES,
        TODAY,
      )[0]!.rows;
      expect(rows.map((row) => row.ended)).toEqual([true, false, false, false]);
      // An ended pattern stays in the list, with its buttons: it still holds its type
      // (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03).
      expect(rows[0]!.deleteLabel).toBe('Delete Monday 08:00 – 13:00 Studio');
    });

    it('"today" is the date given, a text: one day later, the pattern that ended today has ended', () => {
      const until = pattern({ validFrom: '2026-01-01', validUntil: '2026-11-20' });
      expect(patternGroups([until], TYPES, '2026-11-20')[0]!.rows[0]!.ended).toBe(false);
      expect(patternGroups([until], TYPES, '2026-11-21')[0]!.rows[0]!.ended).toBe(true);
    });

    it('a type that the list of types does not hold, and no list of types at all: a fixed word in the place of the name', () => {
      const other = '01M6ZZZZZZZZZZZZZZZZZZZZZZ';
      expect(UNKNOWN_TYPE).toBe('Unknown type');
      expect(texts([pattern({ typeId: other }), pattern({ start: '14:00', end: '15:00' })])).toEqual([['Monday', ['09:00 – 13:00 Unknown type', '14:00 – 15:00 Studio']]]);
      expect(texts([pattern()], null)).toEqual([['Monday', ['09:00 – 13:00 Unknown type']]]);
      // Its fields still hold its type's id: the dialog that changes it will have none chosen.
      expect(patternGroups([pattern({ typeId: other })], TYPES, TODAY)[0]!.rows[0]!.fields.typeId).toBe(other);
    });

    it('a type\'s name containing <script> is kept as text, in the row and in the names of its buttons', () => {
      const row = patternGroups([pattern()], [type(STUDIO, SCRIPT)], TODAY)[0]!.rows[0]!;
      expect([row.typeName, row.changeLabel]).toEqual([SCRIPT, `Change Monday 09:00 – 13:00 ${SCRIPT}`]);
    });

    it('the words of the dialog that deletes a pattern say which one, with its validity, and what follows', () => {
      const [first, second] = patternGroups([pattern({ weekday: 2, start: '15:00', end: '18:00', typeId: POOL, validUntil: '2027-01-19' }), pattern({ weekday: 5 })], TYPES, TODAY).map((group) => group.rows[0]!);
      expect(deletePatternQuestion(first!)).toBe('Delete the pattern Tuesday 15:00 – 18:00 Piscina, from 20 November 2026 to 19 January 2027? Its hours will no longer be open for booking. This cannot be undone.');
      expect(deletePatternQuestion(second!)).toBe('Delete the pattern Friday 09:00 – 13:00 Studio, from 20 November 2026? Its hours will no longer be open for booking. This cannot be undone.');
    });
  });
});
