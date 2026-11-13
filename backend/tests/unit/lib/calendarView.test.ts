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

// calendarView (calendarRules.ts): pure, "now" and the zone passed in. The view of spec 11.6, the
// slots of section 7, R-VIEW-01..03 and the privacy of section 17.

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

describe('calendarView: the 11.6 example', () => {
  it('reproduces the spec’s example byte for byte (User alice, 2026-11-16, now 2026-11-10T09:00Z)', () => {
    expect(JSON.stringify(view())).toBe(specExample());
  });

  it('gives the Administrator the same day with sources, hasOverride, no busy, every appointment with its username and no cancellableUntil', () => {
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
          { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', typeId: STUDIO },
          { start: '2026-11-16T09:00:00.000Z', end: '2026-11-16T10:00:00.000Z', typeId: STUDIO },
          { start: '2026-11-16T13:00:00.000Z', end: '2026-11-16T14:00:00.000Z', typeId: POOL },
          { start: '2026-11-16T14:00:00.000Z', end: '2026-11-16T15:00:00.000Z', typeId: POOL },
          { start: '2026-11-16T15:00:00.000Z', end: '2026-11-16T16:00:00.000Z', typeId: POOL },
          { start: '2026-11-16T16:00:00.000Z', end: '2026-11-16T17:00:00.000Z', typeId: POOL },
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

  it('takes away a slot partly occupied by the Administrator’s 10:00–10:30 booking, for both roles (R-SLOT-05)', () => {
    const half = appt('sub-bob', BOB_APPT, '2026-11-16T09:00:00.000Z', '2026-11-16T09:30:00.000Z');
    expect(localSlots(view({ appointments: [half] }))).toEqual(['08:00', '09:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
    expect(localSlots(admin({ appointments: [half] }))).toEqual(['08:00', '09:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
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

  it('leaves out a past window whose type was deleted (R-VIEW-03, v7); the override still counts for hasOverride', () => {
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

describe('calendarView: clock changes and the range', () => {
  it('AC-35, spring forward (2027-03-28): window 01:00–04:00 gives slots 01:00 and 03:00 local, each 60 real minutes', () => {
    const more = { from: '2027-03-28', to: '2027-03-28', patterns: [pattern('S', 7, '01:00', '04:00')], appointments: [] };
    const v = admin(more);
    expect(v.days[0]!.windows.map((w) => [w.start, w.end])).toEqual([['2027-03-28T00:00:00.000Z', '2027-03-28T02:00:00.000Z']]);
    expect(localSlots(v)).toEqual(['01:00', '03:00']);
    expect(v.days[0]!.slots.map((s) => Date.parse(s.end) - Date.parse(s.start))).toEqual([HOUR, HOUR]);
    // Beyond the User's horizon (56 days from 2026-11-10): the window, no slots (R-SLOT-03).
    expect(view(more).days[0]!.windows).toHaveLength(1);
    expect(view(more).days[0]!.slots).toEqual([]);
  });

  it('leaves out a window that holds no real time on the spring-forward night (02:30–03:00)', () => {
    const v = admin({ from: '2027-03-28', to: '2027-03-28', patterns: [pattern('S', 7, '02:30', '03:00')], appointments: [] });
    expect(v.days[0]!.windows).toEqual([]);
  });

  it('fall back (2026-10-25): window 01:00–04:00 gives four slots, two at local 02:00 an hour apart (R-SLOT-01, v7)', () => {
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
