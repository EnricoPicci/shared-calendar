import {
  TIME_STEP_MINUTES,
  cancellableUntil,
  definedWindows,
  effectiveWindows,
  isOnTimeStep,
  isWholeLocalHour,
  localDateOf,
  localTimeOf,
  overlaps,
  peopleIn,
  slotsOf,
  toInstantWindows,
  type OneOffInput,
  type OverrideInput,
  type PatternInput,
} from '../../src/index';

// docs/SHARED_CALENDAR_SPEC.md sections 6.5, 6.6 and 7, R-BOOK-02, R-CAN-03, and the acceptance
// scenarios AC-04, AC-07, AC-08 and AC-35 of its section 18.3, at the level of the pure functions.
// Every expectation is a fixed UTC string, so the tests also run under TZ=America/New_York and
// TZ=Asia/Kathmandu.

const ROME = 'Europe/Rome';
const KATHMANDU = 'Asia/Kathmandu'; // +05:45, no daylight-saving time
const STUDIO = '01JC000000000000000000STD0';
const POOL = '01JC000000000000000000P000';
const P1 = '01JC00000000000000000PAT01';
const W1 = '01JC00000000000000000WND01';
const W2 = '01JC00000000000000000WND02';

// docs/SHARED_CALENDAR_SPEC.md AC-04: every Monday 08:00–12:00 Studio, from 2026-11-01, no end.
const MONDAY_STUDIO: PatternInput = { patternId: P1, weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };

// definedWindows → toInstantWindows → effectiveWindows → slotsOf: what the back end will do per date.
function effectiveOf(date: string, patterns: PatternInput[], override: OverrideInput | null, oneOffs: OneOffInput[], zone = ROME) {
  return effectiveWindows(toInstantWindows(date, definedWindows(date, patterns, override, oneOffs), zone));
}
function slotStartsOf(date: string, patterns: PatternInput[], override: OverrideInput | null, oneOffs: OneOffInput[], zone = ROME) {
  return effectiveOf(date, patterns, override, oneOffs, zone).flatMap((w) => slotsOf(w, zone).map((s) => s.start));
}
// Element `i` of a list, failing the test when it is missing (the compiler's noUncheckedIndexedAccess).
function nth<T>(list: readonly T[], i = 0): T {
  const item = list[i];
  if (item === undefined) throw new Error(`no element ${i} in ${JSON.stringify(list)}`);
  return item;
}
// The one effective window of a date with a single window start–end, for slotsOf.
function windowOf(date: string, start: string, end: string, zone = ROME) {
  return nth(effectiveOf(date, [], { date, windows: [{ start, end, typeId: STUDIO }] }, [], zone));
}

// Test names: section numbers, R-… rules and AC-… scenarios are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).
describe('definedWindows (6.5)', () => {
  describe('pattern validity (R-PAT-01)', () => {
    it.each([
      ['validFrom itself (a Monday)', '2026-11-02', true],
      ['a later Monday, no end', '2030-12-30', true],
      ['the Monday before validFrom', '2026-10-26', false],
      ['another weekday', '2026-11-03', false],
    ])('open end: %s → %s', (_case, date, applies) => {
      expect(definedWindows(date, [MONDAY_STUDIO], null, []).length).toBe(applies ? 1 : 0);
    });

    it.each([
      ['validFrom', '2026-11-02', true],
      ['validUntil itself (inclusive)', '2026-11-30', true],
      ['the Monday after validUntil', '2026-12-07', false],
    ])('bounded 2026-11-02..2026-11-30: %s', (_case, date, applies) => {
      const bounded = { ...MONDAY_STUDIO, validFrom: '2026-11-02', validUntil: '2026-11-30' };
      expect(definedWindows(date, [bounded], null, []).length).toBe(applies ? 1 : 0);
    });

    it('a pattern valid on one date only', () => {
      const single = { ...MONDAY_STUDIO, validFrom: '2026-11-16', validUntil: '2026-11-16' };
      expect(definedWindows('2026-11-16', [single], null, []).length).toBe(1);
      expect(definedWindows('2026-11-23', [single], null, []).length).toBe(0);
    });
  });

  it('gives each window its source and id, sorted by start (11.6)', () => {
    const afternoon: PatternInput = { ...MONDAY_STUDIO, patternId: '01JC00000000000000000PAT02', start: '14:00', end: '18:00', typeId: POOL };
    const evening: OneOffInput = { windowId: W1, date: '2026-11-16', start: '19:00', end: '20:00', typeId: STUDIO };
    expect(definedWindows('2026-11-16', [afternoon, MONDAY_STUDIO], null, [evening])).toEqual([
      { start: '08:00', end: '12:00', typeId: STUDIO, source: 'pattern', sourceId: P1 },
      { start: '14:00', end: '18:00', typeId: POOL, source: 'pattern', sourceId: '01JC00000000000000000PAT02' },
      { start: '19:00', end: '20:00', typeId: STUDIO, source: 'one_off', sourceId: W1 },
    ]);
  });

  it('an override replaces the patterns (R-OVR-01, AC-06)', () => {
    const override = { date: '2026-11-16', windows: [{ start: '09:00', end: '12:00', typeId: STUDIO }] };
    expect(definedWindows('2026-11-16', [MONDAY_STUDIO], override, [])).toEqual([
      { start: '09:00', end: '12:00', typeId: STUDIO, source: 'override', sourceId: '2026-11-16' },
    ]);
  });

  it('AC-07: an empty override means no pattern availability that day', () => {
    expect(definedWindows('2026-11-23', [MONDAY_STUDIO], { date: '2026-11-23', windows: [] }, [])).toEqual([]);
    expect(slotStartsOf('2026-11-23', [MONDAY_STUDIO], { date: '2026-11-23', windows: [] }, [])).toEqual([]);
  });

  it('one-off windows add on an override day, also on an empty override (R-ONE-01, R-OVR-03)', () => {
    const oneOff: OneOffInput = { windowId: W1, date: '2026-11-23', start: '15:00', end: '17:00', typeId: POOL };
    expect(definedWindows('2026-11-23', [MONDAY_STUDIO], { date: '2026-11-23', windows: [] }, [oneOff])).toEqual([
      { start: '15:00', end: '17:00', typeId: POOL, source: 'one_off', sourceId: W1 },
    ]);
  });

  it('ignores an override and one-off windows of other dates', () => {
    const otherOverride = { date: '2026-11-23', windows: [] };
    const otherOneOff: OneOffInput = { windowId: W2, date: '2026-11-17', start: '15:00', end: '17:00', typeId: POOL };
    expect(definedWindows('2026-11-16', [MONDAY_STUDIO], otherOverride, [otherOneOff])).toEqual([
      { start: '08:00', end: '12:00', typeId: STUDIO, source: 'pattern', sourceId: P1 },
    ]);
  });

  it('accepts stored items with extra attributes as they are', () => {
    const item = { PK: 'PATTERN', SK: P1, createdAt: '2026-11-01T10:00:00.000Z', ...MONDAY_STUDIO };
    expect(definedWindows('2026-11-16', [item], null, [])).toHaveLength(1);
  });
});

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('toInstantWindows', () => {
  it('AC-04: the window of 2026-11-16 is 07:00Z–11:00Z, with its source', () => {
    expect(toInstantWindows('2026-11-16', definedWindows('2026-11-16', [MONDAY_STUDIO], null, []), ROME)).toEqual([
      { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T11:00:00.000Z', typeId: STUDIO, source: 'pattern', sourceId: P1 },
    ]);
  });

  it('reads 24:00 as midnight at the end of the date', () => {
    const w = nth(toInstantWindows('2026-11-16', [{ start: '23:00', end: '24:00', typeId: STUDIO, source: 'override', sourceId: '2026-11-16' }], ROME));
    expect([w.start, w.end]).toEqual(['2026-11-16T22:00:00.000Z', '2026-11-16T23:00:00.000Z']);
  });

  it('keeps the input order of windows with the same start', () => {
    const windows = [
      { start: '09:00', end: '11:00', typeId: POOL, source: 'one_off' as const, sourceId: W2 },
      { start: '09:00', end: '10:00', typeId: STUDIO, source: 'one_off' as const, sourceId: W1 },
    ];
    expect(toInstantWindows('2026-11-16', windows, ROME).map((w) => w.sourceId)).toEqual([W2, W1]);
  });

  it('sorts by instant', () => {
    const windows = [
      { start: '14:00', end: '15:00', typeId: POOL, source: 'one_off' as const, sourceId: W2 },
      { start: '09:00', end: '10:00', typeId: STUDIO, source: 'one_off' as const, sourceId: W1 },
    ];
    expect(toInstantWindows('2026-11-16', windows, ROME).map((w) => w.sourceId)).toEqual([W1, W2]);
  });
});

// Test names: section numbers and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md
// (scenarios in its section 18.3).
describe('effectiveWindows (6.6)', () => {
  it('AC-08: a one-off window 12:00–13:00 Studio merges into one window 08:00–13:00 local', () => {
    const oneOff: OneOffInput = { windowId: W1, date: '2026-11-16', start: '12:00', end: '13:00', typeId: STUDIO };
    const effective = effectiveOf('2026-11-16', [MONDAY_STUDIO], null, [oneOff]);
    expect(effective).toEqual([{ start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T12:00:00.000Z', typeId: STUDIO }]);
    expect(localTimeOf(nth(effective).start, ROME)).toBe('08:00');
    expect(localTimeOf(nth(effective).end, ROME)).toBe('13:00');
  });

  it('6.6 example: 08:00–10:30 and 10:30–12:00 Studio form one window, which offers 10:00', () => {
    const override = { date: '2026-11-16', windows: [{ start: '08:00', end: '10:30', typeId: STUDIO }] };
    const oneOff: OneOffInput = { windowId: W1, date: '2026-11-16', start: '10:30', end: '12:00', typeId: STUDIO };
    expect(slotStartsOf('2026-11-16', [], override, [oneOff])).toEqual([
      '2026-11-16T07:00:00.000Z',
      '2026-11-16T08:00:00.000Z',
      '2026-11-16T09:00:00.000Z', // 10:00 local: exists only because the windows merged
      '2026-11-16T10:00:00.000Z',
    ]);
  });

  it('merges a chain of three, in any input order', () => {
    const w = (start: string, end: string) => ({ start, end, typeId: STUDIO });
    expect(effectiveWindows([w('2026-11-16T09:00:00.000Z', '2026-11-16T10:00:00.000Z'), w('2026-11-16T07:00:00.000Z', '2026-11-16T08:00:00.000Z'), w('2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z')])).toEqual([
      w('2026-11-16T07:00:00.000Z', '2026-11-16T10:00:00.000Z'),
    ]);
  });

  it('keeps adjacent windows of different types apart', () => {
    const studio = { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T11:00:00.000Z', typeId: STUDIO };
    const pool = { start: '2026-11-16T11:00:00.000Z', end: '2026-11-16T12:00:00.000Z', typeId: POOL };
    expect(effectiveWindows([pool, studio])).toEqual([studio, pool]);
  });

  it('keeps windows of the same type apart when there is a gap', () => {
    const a = { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', typeId: STUDIO };
    const b = { start: '2026-11-16T08:15:00.000Z', end: '2026-11-16T09:00:00.000Z', typeId: STUDIO };
    expect(effectiveWindows([a, b])).toEqual([a, b]);
  });

  it('does not change its input', () => {
    const input = [
      { start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z', typeId: STUDIO },
      { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', typeId: STUDIO },
    ];
    const copy = structuredClone(input);
    effectiveWindows(input);
    expect(input).toEqual(copy);
  });

  describe('spring forward, 2027-03-28 in Europe/Rome (02:00 → 03:00)', () => {
    it('drops a window that lies in the skipped hour and ends at 03:00: it holds no real time', () => {
      const override = { date: '2027-03-28', windows: [{ start: '02:00', end: '03:00', typeId: POOL }, { start: '02:30', end: '03:00', typeId: STUDIO }] };
      expect(effectiveOf('2027-03-28', [], override, [])).toEqual([]);
    });

    it('still merges 01:00–02:00, 02:00–03:00 and 03:00–04:00 Studio into 00:00Z–02:00Z', () => {
      const windows = [
        { start: '01:00', end: '02:00', typeId: STUDIO },
        { start: '02:00', end: '03:00', typeId: STUDIO }, // 01:00Z–01:00Z: no real time
        { start: '03:00', end: '04:00', typeId: STUDIO },
      ];
      expect(effectiveOf('2027-03-28', [], { date: '2027-03-28', windows }, [])).toEqual([
        { start: '2027-03-28T00:00:00.000Z', end: '2027-03-28T02:00:00.000Z', typeId: STUDIO },
      ]);
    });
  });
});

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('slotsOf (R-SLOT-01)', () => {
  it('AC-04: the window 08:00–12:00 on 2026-11-16 gives the slots 07, 08, 09, 10Z', () => {
    expect(slotsOf(windowOf('2026-11-16', '08:00', '12:00'), ROME)).toEqual(
      ['07', '08', '09', '10'].map((h) => ({ start: `2026-11-16T${h}:00:00.000Z`, end: `2026-11-16T${String(Number(h) + 1).padStart(2, '0')}:00:00.000Z`, typeId: STUDIO })),
    );
  });

  it('AC-08: the merged window 08:00–13:00 offers the 12:00 slot', () => {
    const oneOff: OneOffInput = { windowId: W1, date: '2026-11-16', start: '12:00', end: '13:00', typeId: STUDIO };
    const starts = slotStartsOf('2026-11-16', [MONDAY_STUDIO], null, [oneOff]);
    expect(starts).toContain('2026-11-16T11:00:00.000Z');
    expect(starts.map((s) => localTimeOf(s, ROME))).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00']);
  });

  it('08:30–12:00 gives 09:00, 10:00 and 11:00 local', () => {
    expect(slotsOf(windowOf('2026-11-16', '08:30', '12:00'), ROME).map((s) => localTimeOf(s.start, ROME))).toEqual(['09:00', '10:00', '11:00']);
  });

  it('08:00–08:45 gives none', () => {
    expect(slotsOf(windowOf('2026-11-16', '08:00', '08:45'), ROME)).toEqual([]);
  });

  it('a window ending at 24:00: its last slot is 23:00–24:00', () => {
    const slots = slotsOf(windowOf('2026-11-16', '22:00', '24:00'), ROME);
    expect(slots.at(-1)).toEqual({ start: '2026-11-16T22:00:00.000Z', end: '2026-11-16T23:00:00.000Z', typeId: STUDIO });
    expect(localDateOf(nth(slots, 1).end, ROME)).toBe('2026-11-17'); // ends at midnight
    expect(slots).toHaveLength(2);
  });

  it('AC-35, spring forward (2027-03-28): 01:00–04:00 gives two slots, local 01:00 (ending at 03:00) and 03:00', () => {
    const slots = slotsOf(windowOf('2027-03-28', '01:00', '04:00'), ROME);
    expect(slots).toEqual([
      { start: '2027-03-28T00:00:00.000Z', end: '2027-03-28T01:00:00.000Z', typeId: STUDIO },
      { start: '2027-03-28T01:00:00.000Z', end: '2027-03-28T02:00:00.000Z', typeId: STUDIO },
    ]);
    expect(slots.map((s) => `${localTimeOf(s.start, ROME)}–${localTimeOf(s.end, ROME)}`)).toEqual(['01:00–03:00', '03:00–04:00']);
  });

  it('fall back (2026-10-25): 01:00–04:00 holds four real hours and gives four slots, two at local 02:00', () => {
    const slots = slotsOf(windowOf('2026-10-25', '01:00', '04:00'), ROME);
    expect(slots.map((s) => s.start)).toEqual([
      '2026-10-24T23:00:00.000Z', // 01:00 +02:00
      '2026-10-25T00:00:00.000Z', // 02:00 +02:00 (summer time)
      '2026-10-25T01:00:00.000Z', // 02:00 +01:00 (winter time): another real hour
      '2026-10-25T02:00:00.000Z', // 03:00 +01:00
    ]);
    expect(slots.map((s) => localTimeOf(s.start, ROME))).toEqual(['01:00', '02:00', '02:00', '03:00']);
    // The two 02:00 slots cannot hold the same booking.
    expect(overlaps(nth(slots, 1), nth(slots, 2))).toBe(false);
  });

  it('Asia/Kathmandu (+05:45): a whole local hour is not a whole UTC hour', () => {
    const slots = slotsOf(windowOf('2026-11-16', '08:00', '12:00', KATHMANDU), KATHMANDU);
    expect(slots.map((s) => s.start)).toEqual(['2026-11-16T02:15:00.000Z', '2026-11-16T03:15:00.000Z', '2026-11-16T04:15:00.000Z', '2026-11-16T05:15:00.000Z']);
  });

  it('Asia/Kathmandu: a window starting at a quarter past finds the next whole local hour', () => {
    expect(slotsOf(windowOf('2026-11-16', '08:15', '10:00', KATHMANDU), KATHMANDU).map((s) => localTimeOf(s.start, KATHMANDU))).toEqual(['09:00']);
  });

  it('D32: a window that opens at 08:05 gives the slots 09:00, 10:00 and 11:00, and none at 08:05', () => {
    const slots = slotsOf(windowOf('2026-11-16', '08:05', '12:00', ROME), ROME);
    expect(slots.map((s) => localTimeOf(s.start, ROME))).toEqual(['09:00', '10:00', '11:00']);
    expect(slots.every((s) => Date.parse(s.end) - Date.parse(s.start) === 60 * 60_000)).toBe(true);
  });

  it('D32: a window that closes at 11:55 loses its last hour, and 10:10–10:50 holds no slot', () => {
    expect(slotsOf(windowOf('2026-11-16', '08:00', '11:55', ROME), ROME).map((s) => localTimeOf(s.start, ROME))).toEqual(['08:00', '09:00', '10:00']);
    expect(slotsOf(windowOf('2026-11-16', '10:10', '10:50', ROME), ROME)).toEqual([]);
  });

  it('D32, the night clocks go back: a window 01:05–03:55 gives the two slots at local 02:00', () => {
    // 01:05 +02:00 is 23:05Z; 03:55 +01:00 is 02:55Z: the hours 02:00 (twice) lie inside, 01:00 and 03:00 do not.
    const slots = slotsOf(windowOf('2026-10-25', '01:05', '03:55', ROME), ROME);
    expect(slots.map((s) => s.start)).toEqual(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']);
  });
});

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('overlaps (R-SLOT-02, R-AV-01)', () => {
  const at = (start: string, end: string) => ({ start: `2026-11-16T${start}:00.000Z`, end: `2026-11-16T${end}:00.000Z` });

  it.each([
    ['touching windows (one ends where the next starts)', at('08:00', '09:00'), at('09:00', '10:00'), false],
    ['touching, the other way round', at('09:00', '10:00'), at('08:00', '09:00'), false],
    ['apart', at('08:00', '09:00'), at('10:00', '11:00'), false],
    ['a partial overlap (AC-15: 09:15–10:00 and 09:00–10:00)', at('09:15', '10:00'), at('09:00', '10:00'), true],
    ['one inside the other', at('08:00', '12:00'), at('09:00', '10:00'), true],
    ['identical', at('09:00', '10:00'), at('09:00', '10:00'), true],
  ])('%s → %s', (_case, a, b, expected) => {
    expect(overlaps(a, b)).toBe(expected);
    expect(overlaps(b, a)).toBe(expected);
  });

  it('local times of one date, with 24:00 last', () => {
    expect(overlaps({ start: '22:00', end: '24:00' }, { start: '23:00', end: '23:30' })).toBe(true);
    expect(overlaps({ start: '12:00', end: '24:00' }, { start: '08:00', end: '12:00' })).toBe(false);
  });
});

// Test names: R-… rules and D… decisions are those of docs/SHARED_CALENDAR_SPEC.md.
describe('peopleIn (R-SLOT-02, D25)', () => {
  const at = (start: string, end: string) => ({ start: `2026-11-16T${start}:00.000Z`, end: `2026-11-16T${end}:00.000Z` });
  const slot = at('10:00', '11:00');

  it.each([
    ['no appointment', [], 0],
    ['one inside', [at('10:15', '10:45')], 1],
    ['two that touch', [at('10:00', '10:30'), at('10:30', '11:00')], 1],
    ['D25, the pair that leaves a place in a capacity of 2: 10:00–10:30 and 10:30–11:00', [at('10:30', '11:00'), at('10:00', '10:30')], 1],
    ['D25, the pair that fills a capacity of 2: 10:00–10:30 and 10:15–11:00', [at('10:00', '10:30'), at('10:15', '11:00')], 2],
    ['one that only touches the start of the interval', [at('09:00', '10:00')], 0],
    ['one that only touches the end of the interval', [at('11:00', '12:00')], 0],
    ['one that covers the whole interval', [at('09:00', '12:00')], 1],
    ['three nested', [at('09:00', '12:00'), at('10:00', '11:00'), at('10:15', '10:30')], 3],
    ['three in a row, each touching the next, and one across them', [at('10:00', '10:15'), at('10:15', '10:30'), at('10:30', '11:00'), at('09:30', '11:30')], 2],
    ['the same appointment twice (the caller passes what is counted)', [at('10:00', '11:00'), at('10:00', '11:00')], 2],
    ['D32, three of 5 minutes that touch', [at('10:10', '10:15'), at('10:15', '10:20'), at('10:20', '10:25')], 1],
    ['D32, 10:10–10:35 with 10:30–10:40: together for 5 minutes', [at('10:10', '10:35'), at('10:30', '10:40')], 2],
  ])('%s → %s', (_case, appointments, expected) => {
    expect(peopleIn(slot, appointments)).toBe(expected);
  });

  it('the order of the list does not matter', () => {
    const list = [at('10:45', '11:00'), at('09:00', '10:30'), at('10:15', '10:50'), at('10:30', '10:45'), at('10:00', '10:20')];
    const counts = [list, [...list].reverse(), [list[2], list[0], list[4], list[1], list[3]]].map((l) => peopleIn(slot, l as typeof list));
    expect(counts).toEqual([3, 3, 3]);
  });

  it('the night clocks go back (Europe/Rome, 2026-10-25): two appointments at local 02:00, an hour apart, are never together', () => {
    // 02:00 +02:00 is 00:00Z, 02:00 +01:00 is 01:00Z: the same local time, two real hours that touch.
    const first = { start: '2026-10-25T00:00:00.000Z', end: '2026-10-25T01:00:00.000Z' };
    const second = { start: '2026-10-25T01:00:00.000Z', end: '2026-10-25T02:00:00.000Z' };
    expect([first.start, second.start].map((t) => localTimeOf(t, ROME))).toEqual(['02:00', '02:00']);
    expect(peopleIn({ start: first.start, end: second.end }, [first, second])).toBe(1);
    expect(peopleIn(first, [first, second])).toBe(1);
    expect(peopleIn(second, [first, { ...second, end: '2026-10-25T01:30:00.000Z' }, second])).toBe(2);
  });
});

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('isWholeLocalHour and isOnTimeStep (R-BOOK-02)', () => {
  it.each([
    ['2026-11-16T08:00:00.000Z', ROME, true, true], // 09:00
    ['2026-11-16T08:15:00.000Z', ROME, false, true], // 09:15
    ['2026-11-16T08:45:00.000Z', ROME, false, true],
    ['2026-11-16T08:05:00.000Z', ROME, false, true], // 09:05
    ['2026-11-16T08:10:00.000Z', ROME, false, true],
    ['2026-11-16T08:55:00.000Z', ROME, false, true],
    ['2026-11-16T08:07:00.000Z', ROME, false, false],
    ['2026-11-16T08:01:00.000Z', ROME, false, false],
    ['2026-11-16T08:00:30.000Z', ROME, false, false], // a second: never on a grid
    ['2026-11-16T08:05:30.000Z', ROME, false, false],
    ['2026-11-16T08:00:00.001Z', ROME, false, false],
    ['2026-11-16T03:15:00.000Z', KATHMANDU, true, true], // 09:00
    ['2026-11-16T03:00:00.000Z', KATHMANDU, false, true], // 08:45
    ['2026-11-16T03:30:00.000Z', 'Asia/Kolkata', true, true], // +05:30: 09:00
    ['2026-11-16T03:20:00.000Z', KATHMANDU, false, true], // +05:45: 09:05
    ['2026-11-16T03:22:00.000Z', KATHMANDU, false, false], // 09:07
    // The night clocks go back in Europe/Rome: local 02:05 and 02:55 come twice, an hour apart.
    ['2026-10-25T00:05:00.000Z', ROME, false, true], // 02:05 +02:00
    ['2026-10-25T01:05:00.000Z', ROME, false, true], // 02:05 +01:00
    ['2026-10-25T00:55:00.000Z', ROME, false, true],
    ['2026-10-25T01:55:00.000Z', ROME, false, true],
    ['2026-10-25T01:00:00.000Z', ROME, true, true], // the second 02:00
    // The night they go forward (2026-03-29): 01:55 is the last step before 03:00.
    ['2026-03-29T00:55:00.000Z', ROME, false, true], // 01:55 +01:00
    ['2026-03-29T01:05:00.000Z', ROME, false, true], // 03:05 +02:00
    ['2026-03-29T01:07:00.000Z', ROME, false, false],
  ])('%s in %s: whole hour %s, on the step %s', (instant, zone, whole, onStep) => {
    expect(isWholeLocalHour(instant, zone)).toBe(whole);
    expect(isOnTimeStep(instant, zone)).toBe(onStep);
  });

  it('the step is 5 minutes and divides the hour, so every whole hour lies on it (D32)', () => {
    expect(TIME_STEP_MINUTES).toBe(5);
    expect(60 % TIME_STEP_MINUTES).toBe(0);
  });
});

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('cancellableUntil (R-CAN-03)', () => {
  it('11.7: 24 h before 2026-11-16T09:00Z is 2026-11-15T09:00Z', () => {
    expect(cancellableUntil({ start: '2026-11-16T09:00:00.000Z' }, { cancellationNoticeHours: 24 })).toBe('2026-11-15T09:00:00.000Z');
  });

  it.each([
    [0, '2026-11-16T09:00:00.000Z'],
    [720, '2026-10-17T09:00:00.000Z'],
  ])('%i hours', (hours, expected) => {
    expect(cancellableUntil({ start: '2026-11-16T09:00:00.000Z' }, { cancellationNoticeHours: hours })).toBe(expected);
  });

  it('counts real hours across a clock change: 24 h before 10:00 local on 2026-10-25 is 11:00 local the day before', () => {
    const start = '2026-10-25T09:00:00.000Z'; // 10:00 +01:00
    const until = cancellableUntil({ start }, { cancellationNoticeHours: 24 });
    expect(until).toBe('2026-10-24T09:00:00.000Z');
    expect(localTimeOf(until, ROME)).toBe('11:00'); // +02:00 on the 24th
  });
});
