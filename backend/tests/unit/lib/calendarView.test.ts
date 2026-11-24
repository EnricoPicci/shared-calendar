import { localTimeOf, type CalendarView } from '@shared-calendar/shared';
import { calendarView, type CalendarViewInput } from '../../../src/lib/calendarRules';
import {
  ALICE_11,
  ALICE_APPT,
  BOB_09,
  BOB_APPT,
  DEFAULTS,
  EXAMPLE,
  NOW,
  PATTERNS,
  POOL,
  P_POOL,
  P_STUDIO,
  STUDIO,
  ZONE,
  appt,
  specExample,
} from './calendarView.fixtures';

// calendarView (calendarRules.ts): pure, with "now" and the zone passed in. Covers the view of
// docs/SHARED_CALENDAR_SPEC.md section 11.6, the slots of docs/SHARED_CALENDAR_SPEC.md section 7,
// docs/SHARED_CALENDAR_SPEC.md R-VIEW-01 to R-VIEW-03, and the privacy rules of
// docs/SHARED_CALENDAR_SPEC.md section 17.

const view = (more: Partial<CalendarViewInput> = {}): CalendarView => calendarView({ ...EXAMPLE, ...more });
const admin = (more: Partial<CalendarViewInput> = {}) => view({ role: 'admin', callerSub: 'sub-admin', ...more });
const slotStarts = (v: CalendarView, day = 0) => v.days[day]!.slots.map((s) => s.start);
const localSlots = (v: CalendarView, day = 0) => v.days[day]!.slots.map((s) => localTimeOf(s.start, ZONE));
const HOUR = 60 * 60 * 1000;

/** One pattern on `weekday`, `start`–`end` Studio, valid from 2026-01-01. */
const pattern = (patternId: string, weekday: number, start: string, end: string, typeId = STUDIO) => ({
  patternId,
  weekday,
  start,
  end,
  typeId,
  validFrom: '2026-01-01',
  validUntil: null,
});

// Test names: section numbers and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md
// (scenarios in its section 18.3).
describe('calendarView: the 11.6 example', () => {
  it('reproduces the spec’s example byte for byte (User alice, 2026-11-16, now 2026-11-10T09:00Z)', () => {
    expect(JSON.stringify(view())).toBe(specExample());
  });

  it('gives the Administrator the same day with sources, hasOverride, the full slots with no place left (D30), no busy, every appointment with its username and no cancellableUntil', () => {
    const v = admin();
    expect(v.days).toEqual([
      {
        date: '2026-11-16',
        weekday: 1,
        windows: [
          { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T11:00:00.000Z', typeId: STUDIO, typeName: 'Studio', source: 'pattern', sourceId: P_STUDIO },
          { start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T17:00:00.000Z', typeId: POOL, typeName: 'Swimming Pool', source: 'pattern', sourceId: P_POOL },
        ],
        slots: [
          { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', typeId: STUDIO, capacity: 1, placesLeft: 1 },
          { start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z', typeId: STUDIO, capacity: 1, placesLeft: 0 },
          { start: '2026-11-16T09:00:00.000Z', end: '2026-11-16T10:00:00.000Z', typeId: STUDIO, capacity: 1, placesLeft: 1 },
          { start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T11:00:00.000Z', typeId: STUDIO, capacity: 1, placesLeft: 0 },
          { start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T14:00:00.000Z', typeId: POOL, capacity: 1, placesLeft: 1 },
          { start: '2026-11-16T14:00:00.000Z', end: '2026-11-16T15:00:00.000Z', typeId: POOL, capacity: 1, placesLeft: 1 },
          { start: '2026-11-16T15:00:00.000Z', end: '2026-11-16T16:00:00.000Z', typeId: POOL, capacity: 1, placesLeft: 1 },
          { start: '2026-11-16T16:00:00.000Z', end: '2026-11-16T17:00:00.000Z', typeId: POOL, capacity: 1, placesLeft: 1 },
        ],
        busy: [],
        hasOverride: false,
      },
    ]);
    expect(v.appointments.map((a) => [a.appointmentId, a.username, a.note, a.cancellableUntil])).toEqual([
      [BOB_APPT, 'bob', 'bob secret note', null],
      [ALICE_APPT, 'alice', 'First lesson', null],
    ]);
  });

  it('leaves the admin-only fields absent for a User, not null or false', () => {
    const day = view().days[0]!;
    expect(day).not.toHaveProperty('hasOverride');
    for (const w of day.windows) {
      expect(w).not.toHaveProperty('source');
      expect(w).not.toHaveProperty('sourceId');
    }
  });

  it('never gives a User another User’s username, appointment id or note (section 17, AC-12)', () => {
    const json = JSON.stringify(view());
    expect(json).not.toContain('bob');
    expect(json).not.toContain(BOB_APPT);
    expect(json).not.toContain('sub-');
    expect(view().days[0]!.busy).toEqual([{ start: BOB_09.appointment.start, end: BOB_09.appointment.end }]);
  });

  it('decides ownership by userId, not by username (a username can be given to a new User)', () => {
    const formerAlice = appt('sub-old-alice', '01M70N0000000000000000000A', '2026-11-16T09:00:00.000Z', '2026-11-16T10:00:00.000Z', {
      username: 'alice',
    });
    const v = view({ appointments: [formerAlice] });
    expect(v.appointments).toEqual([]);
    expect(v.days[0]!.busy).toEqual([{ start: '2026-11-16T09:00:00.000Z', end: '2026-11-16T10:00:00.000Z' }]);
  });

  it('sorts busy intervals and appointments by start, whatever order they come in', () => {
    const late = appt('sub-bob', '01M70N0000000000000000000B', '2026-11-16T14:00:00.000Z', '2026-11-16T15:00:00.000Z');
    const v = view({ appointments: [late, ALICE_11, BOB_09] });
    expect(v.days[0]!.busy.map((b) => b.start)).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-16T14:00:00.000Z']);
    expect(admin({ appointments: [late, ALICE_11, BOB_09] }).appointments.map((a) => a.start)).toEqual([
      '2026-11-16T08:00:00.000Z',
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T14:00:00.000Z',
    ]);
  });
});

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('calendarView: which slots are offered', () => {
  it('shows a past date with its windows and no slots (R-VIEW-03), to both roles', () => {
    for (const v of [view({ from: '2026-11-09', to: '2026-11-09', appointments: [] }), admin({ from: '2026-11-09', to: '2026-11-09', appointments: [] })]) {
      expect(v.days[0]!.windows).toHaveLength(2);
      expect(v.days[0]!.slots).toEqual([]);
    }
  });

  it('offers today only the slots that start after now (start = now is not offered)', () => {
    // Tuesday 2026-11-10, 09:00–13:00 local; now is 10:00 local.
    const v = admin({ from: '2026-11-10', to: '2026-11-10', patterns: [pattern('P', 2, '09:00', '13:00')], appointments: [] });
    expect(localSlots(v)).toEqual(['11:00', '12:00']);
  });

  it('applies the minimum notice to a User: exactly at the notice is offered, one hour short is not (R-SLOT-03); not to the Administrator (R-SLOT-04)', () => {
    // Tuesday 2026-11-10 10:00–15:00 local = 09:00Z–14:00Z; now 09:00Z; notice 2 h.
    const more = {
      from: '2026-11-10',
      to: '2026-11-10',
      patterns: [pattern('P', 2, '10:00', '15:00')],
      appointments: [],
      settings: { ...DEFAULTS, minBookingNoticeHours: 2 },
    };
    expect(slotStarts(view(more))).toEqual(['2026-11-10T11:00:00.000Z', '2026-11-10T12:00:00.000Z', '2026-11-10T13:00:00.000Z']);
    expect(slotStarts(admin(more))).toEqual([
      '2026-11-10T10:00:00.000Z',
      '2026-11-10T11:00:00.000Z',
      '2026-11-10T12:00:00.000Z',
      '2026-11-10T13:00:00.000Z',
    ]);
    // One hour short of the notice: the 10:00Z slot is 1 h ahead.
    expect(Date.parse('2026-11-10T10:00:00.000Z') - Date.parse(NOW)).toBe(HOUR);
  });

  it('applies the horizon to a User: the last day of the horizon is offered, the day after is not; the Administrator gets both', () => {
    // today 2026-11-10 + 7 days = Tuesday 2026-11-17; Wednesday 2026-11-18 is beyond.
    const more = {
      from: '2026-11-17',
      to: '2026-11-18',
      patterns: [pattern('T', 2, '08:00', '09:00'), pattern('W', 3, '08:00', '09:00')],
      appointments: [],
      settings: { ...DEFAULTS, bookingHorizonDays: 7 },
    };
    const v = view(more);
    expect([slotStarts(v, 0), slotStarts(v, 1)]).toEqual([['2026-11-17T07:00:00.000Z'], []]);
    expect(v.days[1]!.windows).toHaveLength(1);
    const a = admin(more);
    expect([slotStarts(a, 0), slotStarts(a, 1)]).toEqual([['2026-11-17T07:00:00.000Z'], ['2026-11-18T07:00:00.000Z']]);
  });

  it('compares the horizon on the local date: 23:00Z on the last day is already the next local date', () => {
    // Tuesday 2026-11-17 23:00–24:00 local = 22:00Z–23:00Z: still the 17th; horizon 7 → offered.
    const more = { from: '2026-11-17', to: '2026-11-17', patterns: [pattern('T', 2, '23:00', '24:00')], appointments: [], settings: { ...DEFAULTS, bookingHorizonDays: 7 } };
    expect(slotStarts(view(more))).toEqual(['2026-11-17T22:00:00.000Z']);
    // Wednesday 00:00–01:00 local = 2026-11-17T23:00Z: the 18th locally → not offered.
    const wed = { ...more, from: '2026-11-18', to: '2026-11-18', patterns: [pattern('W', 3, '00:00', '01:00')] };
    expect(slotStarts(view(wed))).toEqual([]);
  });

  it('takes away from a User a slot partly occupied by the Administrator’s 10:00–10:30 booking; the Administrator sees it with no place left (R-SLOT-05, D30)', () => {
    const half = appt('sub-bob', BOB_APPT, '2026-11-16T09:00:00.000Z', '2026-11-16T09:30:00.000Z');
    expect(localSlots(view({ appointments: [half] }))).toEqual(['08:00', '09:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
    expect(admin({ appointments: [half] }).days[0]!.slots.map((s) => [localTimeOf(s.start, ZONE), s.placesLeft])).toEqual([
      ['08:00', 1],
      ['09:00', 1],
      ['10:00', 0],
      ['11:00', 1],
      ['14:00', 1],
      ['15:00', 1],
      ['16:00', 1],
      ['17:00', 1],
    ]);
    expect(view({ appointments: [half] }).days[0]!.busy).toEqual([{ start: '2026-11-16T09:00:00.000Z', end: '2026-11-16T09:30:00.000Z' }]);
  });

  it('ignores a cancelled appointment: not busy, not listed, its slot free', () => {
    const cancelledBob = appt('sub-bob', BOB_APPT, '2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z', { status: 'cancelled', cancelReason: 'cancelled' });
    const cancelledAlice = appt('sub-alice', ALICE_APPT, '2026-11-16T10:00:00.000Z', '2026-11-16T11:00:00.000Z', { status: 'cancelled', cancelReason: 'changed' });
    const v = view({ appointments: [cancelledBob, cancelledAlice] });
    expect(v.days[0]!.busy).toEqual([]);
    expect(v.appointments).toEqual([]);
    expect(localSlots(v)).toEqual(['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
    expect(admin({ appointments: [cancelledBob, cancelledAlice] }).appointments).toEqual([]);
  });

  it('lists an ended booked appointment as active (it is still status booked)', () => {
    const ended = appt('sub-alice', ALICE_APPT, '2026-11-09T07:00:00.000Z', '2026-11-09T08:00:00.000Z');
    const v = view({ from: '2026-11-09', to: '2026-11-09', appointments: [ended] });
    expect(v.appointments.map((a) => [a.appointmentId, a.cancellableUntil])).toEqual([[ALICE_APPT, '2026-11-08T07:00:00.000Z']]);
  });
});

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('calendarView: windows', () => {
  it('shows a pattern and a touching one-off of the same type as two windows, and merges them for the slots (AC-08)', () => {
    const oneOff = { windowId: '01M6DN0000000000000000W001', date: '2026-11-16', start: '12:00', end: '13:00', typeId: STUDIO };
    const v = admin({ patterns: [PATTERNS[0]!], oneOffs: [oneOff], appointments: [] });
    expect(v.days[0]!.windows.map((w) => [w.start, w.end, w.source, w.sourceId])).toEqual([
      ['2026-11-16T07:00:00.000Z', '2026-11-16T11:00:00.000Z', 'pattern', P_STUDIO],
      ['2026-11-16T11:00:00.000Z', '2026-11-16T12:00:00.000Z', 'one_off', oneOff.windowId],
    ]);
    expect(localSlots(v)).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00']);
  });

  it('keeps touching windows of different types apart: no slot across them', () => {
    const v = admin({ patterns: [pattern('A', 1, '08:00', '08:30'), pattern('B', 1, '08:30', '10:00', POOL)], appointments: [] });
    expect(v.days[0]!.windows).toHaveLength(2);
    expect(localSlots(v)).toEqual(['09:00']);
  });

  it('shows an override with no windows as hasOverride true and no windows; a User sees only the empty day', () => {
    const more = { overrides: [{ date: '2026-11-16', windows: [] }], appointments: [] };
    expect(admin(more).days[0]).toEqual({ date: '2026-11-16', weekday: 1, windows: [], slots: [], busy: [], hasOverride: true });
    expect(view(more).days[0]).toEqual({ date: '2026-11-16', weekday: 1, windows: [], slots: [], busy: [] });
  });

  it('shows an override’s windows instead of the patterns, with the date as sourceId', () => {
    const v = admin({ overrides: [{ date: '2026-11-16', windows: [{ start: '09:00', end: '12:00', typeId: STUDIO }] }], appointments: [] });
    expect(v.days[0]!.windows).toEqual([
      { start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T11:00:00.000Z', typeId: STUDIO, typeName: 'Studio', source: 'override', sourceId: '2026-11-16' },
    ]);
  });

  it('applies an override to its own date only: the next Monday keeps the pattern (R-OVR-01, AC-06)', () => {
    const v = admin({
      from: '2026-11-16',
      to: '2026-11-23',
      patterns: [PATTERNS[0]!],
      overrides: [{ date: '2026-11-16', windows: [{ start: '09:00', end: '12:00', typeId: STUDIO }] }],
      appointments: [],
    });
    expect([v.days[0], v.days[7]].map((d) => [d!.date, d!.hasOverride, d!.windows.map((w) => [w.source, localTimeOf(w.start, ZONE)])])).toEqual([
      ['2026-11-16', true, [['override', '09:00']]],
      ['2026-11-23', false, [['pattern', '08:00']]],
    ]);
  });

  it('adds a one-off window on a date with an empty override (R-ONE-01, R-OVR-03)', () => {
    const oneOff = { windowId: '01M6DN0000000000000000W003', date: '2026-11-16', start: '09:00', end: '10:00', typeId: POOL };
    const v = admin({ patterns: [PATTERNS[0]!], overrides: [{ date: '2026-11-16', windows: [] }], oneOffs: [oneOff], appointments: [] });
    expect(v.days[0]!.windows.map((w) => [w.source, w.sourceId])).toEqual([['one_off', oneOff.windowId]]);
    expect(localSlots(v)).toEqual(['09:00']);
  });

  it('leaves out a past window whose type was deleted (R-VIEW-03); the override still counts for hasOverride', () => {
    const GONE = '01M6DN0000000000000000GONE';
    const more = {
      from: '2026-11-02',
      to: '2026-11-03',
      overrides: [
        { date: '2026-11-02', windows: [{ start: '08:00', end: '09:00', typeId: GONE }, { start: '10:00', end: '11:00', typeId: STUDIO }] },
        { date: '2026-11-03', windows: [{ start: '08:00', end: '09:00', typeId: GONE }] },
      ],
      oneOffs: [{ windowId: '01M6DN0000000000000000W002', date: '2026-11-02', start: '14:00', end: '15:00', typeId: GONE }],
      appointments: [],
    };
    const v = admin(more);
    expect(v.days.map((d) => [d.windows.map((w) => w.typeId), d.hasOverride])).toEqual([
      [[STUDIO], true],
      [[], true],
    ]);
    expect(JSON.stringify(view(more))).not.toContain(GONE);
  });
});

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('calendarView: clock changes and the range', () => {
  it('AC-35, spring forward (2027-03-28): window 01:00–04:00 gives slots 01:00 and 03:00 local, each 60 real minutes', () => {
    const more = { from: '2027-03-28', to: '2027-03-28', patterns: [pattern('S', 7, '01:00', '04:00')], appointments: [] };
    const v = admin(more);
    expect(v.days[0]!.windows.map((w) => [w.start, w.end])).toEqual([['2027-03-28T00:00:00.000Z', '2027-03-28T02:00:00.000Z']]);
    expect(localSlots(v)).toEqual(['01:00', '03:00']);
    expect(v.days[0]!.slots.map((s) => Date.parse(s.end) - Date.parse(s.start))).toEqual([HOUR, HOUR]);
    // Beyond the User's horizon (56 days from 2026-11-10): the window, no slots
    // (docs/SHARED_CALENDAR_SPEC.md R-SLOT-03).
    expect(view(more).days[0]!.windows).toHaveLength(1);
    expect(view(more).days[0]!.slots).toEqual([]);
  });

  it('leaves out a window that holds no real time on the spring-forward night (02:30–03:00)', () => {
    const v = admin({ from: '2027-03-28', to: '2027-03-28', patterns: [pattern('S', 7, '02:30', '03:00')], appointments: [] });
    expect(v.days[0]!.windows).toEqual([]);
  });

  it('fall back (2026-10-25): window 01:00–04:00 gives four slots, two at local 02:00 an hour apart (R-SLOT-01)', () => {
    const more = { from: '2026-10-25', to: '2026-10-25', now: '2026-10-20T09:00:00.000Z', patterns: [pattern('S', 7, '01:00', '04:00')], appointments: [] };
    for (const v of [view(more), admin(more)]) {
      expect(slotStarts(v)).toEqual(['2026-10-24T23:00:00.000Z', '2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z', '2026-10-25T02:00:00.000Z']);
      expect(localSlots(v)).toEqual(['01:00', '02:00', '02:00', '03:00']);
      expect(v.days[0]!.slots.every((s) => Date.parse(s.end) - Date.parse(s.start) === HOUR)).toBe(true);
    }
  });

  it('ignores an appointment starting exactly at the next local midnight: it belongs to the day after the range', () => {
    const midnight = appt('sub-alice', ALICE_APPT, '2026-11-16T23:00:00.000Z', '2026-11-17T00:00:00.000Z', { date: '2026-11-17' });
    const otherMidnight = appt('sub-bob', BOB_APPT, '2026-11-16T23:00:00.000Z', '2026-11-17T00:00:00.000Z', { date: '2026-11-17' });
    const v = view({ appointments: [midnight, otherMidnight] });
    expect(v.appointments).toEqual([]);
    expect(v.days[0]!.busy).toEqual([]);
  });

  it('gives one day per date across the clock change, each bounded by its local midnights (a 23-hour Sunday)', () => {
    const allDay = [6, 7, 1].map((weekday) => pattern(`D${weekday}`, weekday, '00:00', '24:00'));
    const monday = appt('sub-bob', BOB_APPT, '2027-03-28T22:30:00.000Z', '2027-03-28T23:30:00.000Z', { date: '2027-03-29' });
    const v = view({ from: '2027-03-27', to: '2027-03-29', patterns: allDay, appointments: [monday], settings: { ...DEFAULTS, bookingHorizonDays: 365 } });
    expect(v.days.map((d) => [d.date, d.weekday, d.windows[0]!.start, d.windows[0]!.end])).toEqual([
      ['2027-03-27', 6, '2027-03-26T23:00:00.000Z', '2027-03-27T23:00:00.000Z'],
      ['2027-03-28', 7, '2027-03-27T23:00:00.000Z', '2027-03-28T22:00:00.000Z'],
      ['2027-03-29', 1, '2027-03-28T22:00:00.000Z', '2027-03-29T22:00:00.000Z'],
    ]);
    expect(v.days.map((d) => d.slots.length)).toEqual([24, 23, 22]);
    expect(v.days.map((d) => d.busy.length)).toEqual([0, 0, 1]);
  });

  it('answers the range, the zone and generatedAt = now', () => {
    const v = view({ from: '2026-11-16', to: '2026-11-22' });
    expect([v.timeZone, v.from, v.to, v.generatedAt]).toEqual([ZONE, '2026-11-16', '2026-11-22', NOW]);
    expect(v.days.map((d) => [d.date, d.weekday])).toEqual([
      ['2026-11-16', 1],
      ['2026-11-17', 2],
      ['2026-11-18', 3],
      ['2026-11-19', 4],
      ['2026-11-20', 5],
      ['2026-11-21', 6],
      ['2026-11-22', 7],
    ]);
  });
});

// The capacity of a type in the view: the example's Monday, the Swimming Pool open 14:00–18:00
// local (13:00Z–17:00Z). `inPool` books a User there, `capacity` is the Pool's.
const withPool = (capacity: number) => [
  { typeId: STUDIO, name: 'Studio', capacity: 1 },
  { typeId: POOL, name: 'Swimming Pool', capacity },
];
const inPool = (who: string, n: number, start = '2026-11-16T13:00:00.000Z', end = '2026-11-16T14:00:00.000Z') =>
  appt(`sub-${who}`, `01M70N00000000000000000P${String(n).padStart(2, '0')}`, start, end, { typeId: POOL, typeName: 'Swimming Pool', username: who });
const poolSlots = (v: CalendarView) =>
  v.days[0]!.slots.filter((s) => s.typeId === POOL).map((s) => [localTimeOf(s.start, ZONE), s.capacity, s.placesLeft]);
const asUser = (who: string, more: Partial<CalendarViewInput>) => view({ callerSub: `sub-${who}`, ...more });

// Test names: R-… rules, decisions D… and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md
// (scenarios in its section 18.3).
describe('calendarView: the capacity of a type (R-SLOT-02 to R-SLOT-06)', () => {
  it('AC-37: alice and bob in a capacity of 3: carol gets the slot 13:00Z with capacity 3 and 1 place left, and nothing busy', () => {
    const v = asUser('carol', { types: withPool(3), appointments: [inPool('alice', 1), inPool('bob', 2)] });
    expect(poolSlots(v)).toEqual([
      ['14:00', 3, 1],
      ['15:00', 3, 3],
      ['16:00', 3, 3],
      ['17:00', 3, 3],
    ]);
    expect(v.days[0]!.busy).toEqual([]);
    expect(JSON.stringify(v)).not.toContain('alice');
  });

  it('AC-38: three people: dan does not get 13:00Z and sees 13:00Z–14:00Z busy', () => {
    const v = asUser('dan', { types: withPool(3), appointments: [inPool('alice', 1), inPool('bob', 2), inPool('carol', 3)] });
    expect(poolSlots(v).map(([time]) => time)).toEqual(['15:00', '16:00', '17:00']);
    expect(v.days[0]!.busy).toEqual([{ start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T14:00:00.000Z' }]);
  });

  it('AC-39: four people, one forced: the Administrator gets 13:00Z with no place left, never a negative number (D30)', () => {
    const four = [inPool('alice', 1), inPool('bob', 2), inPool('carol', 3), inPool('dan', 4)];
    expect(poolSlots(admin({ types: withPool(3), appointments: four }))[0]).toEqual(['14:00', 3, 0]);
  });

  it('AC-43: the capacity lowered to 1 under three people: the Administrator’s 13:00Z has 0 places, 14:00Z has 1', () => {
    const three = [inPool('alice', 1), inPool('bob', 2), inPool('carol', 3)];
    expect(poolSlots(admin({ types: withPool(1), appointments: three })).slice(0, 2)).toEqual([
      ['14:00', 1, 0],
      ['15:00', 1, 1],
    ]);
  });

  it('R-SLOT-03: a User never gets a slot that overlaps their own appointment, even with places left; others get it', () => {
    const more = { types: withPool(3), appointments: [inPool('alice', 1)] };
    expect(poolSlots(asUser('alice', more))[0]).toEqual(['15:00', 3, 3]);
    expect(poolSlots(asUser('bob', more))[0]).toEqual(['14:00', 3, 2]);
  });

  it('D25: two halves that touch leave a place in a capacity of 2; two that overlap fill it', () => {
    const touching = [inPool('alice', 1, '2026-11-16T13:00:00.000Z', '2026-11-16T13:30:00.000Z'), inPool('bob', 2, '2026-11-16T13:30:00.000Z', '2026-11-16T14:00:00.000Z')];
    expect(poolSlots(asUser('carol', { types: withPool(2), appointments: touching }))[0]).toEqual(['14:00', 2, 1]);
    expect(asUser('carol', { types: withPool(2), appointments: touching }).days[0]!.busy).toEqual([]);
    const overlapping = [touching[0]!, inPool('bob', 2, '2026-11-16T13:15:00.000Z', '2026-11-16T14:00:00.000Z')];
    expect(poolSlots(asUser('carol', { types: withPool(2), appointments: overlapping }))[0]).toEqual(['15:00', 2, 2]);
    expect(poolSlots(admin({ types: withPool(2), appointments: overlapping }))[0]).toEqual(['14:00', 2, 0]);
  });

  describe('R-SLOT-06: busy is the time that is full', () => {
    it('only the part at the capacity is busy: 13:30Z–14:00Z where two people meet in a capacity of 2', () => {
      const more = { types: withPool(2), appointments: [inPool('bob', 1), inPool('carol', 2, '2026-11-16T13:30:00.000Z', '2026-11-16T14:30:00.000Z')] };
      const v = asUser('dan', more);
      expect(v.days[0]!.busy).toEqual([{ start: '2026-11-16T13:30:00.000Z', end: '2026-11-16T14:00:00.000Z' }]);
      expect(poolSlots(v)[0]).toEqual(['15:00', 2, 1]);
    });

    it('with a capacity of 1, two other people’s appointments that touch make one interval', () => {
      const carol = appt('sub-carol', '01M70N0000000000000000000C', '2026-11-16T09:00:00.000Z', '2026-11-16T10:00:00.000Z');
      expect(view({ appointments: [BOB_09, carol] }).days[0]!.busy).toEqual([{ start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T10:00:00.000Z' }]);
    });

    it('takes the User’s own times out, also from the middle of a full time', () => {
      // bob and carol fill 13:00Z–15:00Z in a capacity of 2; alice was booked into it for 13:30Z–14:00Z.
      const more = {
        types: withPool(2),
        appointments: [
          inPool('bob', 1, '2026-11-16T13:00:00.000Z', '2026-11-16T15:00:00.000Z'),
          inPool('carol', 2, '2026-11-16T13:00:00.000Z', '2026-11-16T15:00:00.000Z'),
          appt('sub-alice', ALICE_APPT, '2026-11-16T13:30:00.000Z', '2026-11-16T14:00:00.000Z', { typeId: POOL }),
        ],
      };
      expect(view(more).days[0]!.busy).toEqual([
        { start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T13:30:00.000Z' },
        { start: '2026-11-16T14:00:00.000Z', end: '2026-11-16T15:00:00.000Z' },
      ]);
    });

    it('counts the User’s own appointment among the people: alice and bob fill a capacity of 2, so carol sees busy and alice does not', () => {
      const more = { types: withPool(2), appointments: [inPool('alice', 1), inPool('bob', 2)] };
      expect(asUser('carol', more).days[0]!.busy).toEqual([{ start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T14:00:00.000Z' }]);
      expect(asUser('alice', more).days[0]!.busy).toEqual([]);
      expect(asUser('bob', more).days[0]!.busy).toEqual([]);
    });

    it('applies a capacity of 1 where no window holds the time: an appointment left outside the availability is busy', () => {
      // 12:00–13:00 local lies in no window of the example; one appointment there fills it.
      const outside = appt('sub-bob', BOB_APPT, '2026-11-16T11:00:00.000Z', '2026-11-16T12:00:00.000Z');
      expect(view({ types: withPool(3), appointments: [outside] }).days[0]!.busy).toEqual([{ start: '2026-11-16T11:00:00.000Z', end: '2026-11-16T12:00:00.000Z' }]);
    });

    it('applies a capacity of 1 under the window of a deleted type', () => {
      // The Pool's pattern is still there, its type is not: its window is left out.
      const more = { types: [{ typeId: STUDIO, name: 'Studio', capacity: 1 }], appointments: [inPool('bob', 1)] };
      expect(view(more).days[0]!.windows.map((w) => w.typeId)).toEqual([STUDIO]);
      expect(view(more).days[0]!.busy).toEqual([{ start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T14:00:00.000Z' }]);
    });

    it('gives the Administrator no busy, whatever the capacity', () => {
      const three = [inPool('alice', 1), inPool('bob', 2), inPool('carol', 3)];
      expect(admin({ types: withPool(3), appointments: three }).days[0]!.busy).toEqual([]);
    });
  });
});
