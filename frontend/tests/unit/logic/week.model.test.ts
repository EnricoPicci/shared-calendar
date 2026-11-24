import type { CalendarView } from '@shared-calendar/shared';
import { colourOf, placesOf, weekModel } from '../../../src/logic/week.model';
import { appointment, POOL, STUDIO, view, winterWeek } from './fixtures';
import { useFarBrowserZone } from './zone';

const z = (instant: string) => `${instant}:00.000Z`;
// A percentage of the hours shown, as the model writes it.
const percent = (minutes: number, shown: number) => `${(minutes / shown) * 100}%`;
const FULL = { lane: 0, lanes: 1 };

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('weekModel', () => {
  useFarBrowserZone();

  describe('a week in Europe/Rome in winter (the example of 11.6), for a User', () => {
    const model = weekModel(winterWeek(), 'user');
    const monday = model.days[0]!;

    it('names the time zone and shows 08:00 to 18:00, one label per hour', () => {
      expect(model.timeZone).toBe('Europe/Rome');
      expect(model.hours).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    });

    it('has the seven days with their labels, and marks today from generatedAt', () => {
      expect(model.days.map((day) => day.label)).toEqual(['Mon 16 Nov', 'Tue 17 Nov', 'Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov']);
      expect(model.days.map((day) => day.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
      expect(model.days.map((day) => day.today)).toEqual([false, true, false, false, false, false, false]);
    });

    it('places the windows by their local clock: 08:00–12:00 and 14:00–18:00 of ten hours', () => {
      expect(monday.windows).toEqual([
        { top: '0%', height: '40%', time: '08:00–12:00', ...FULL, typeName: 'Studio', colour: colourOf(STUDIO) },
        { top: '60%', height: '40%', time: '14:00–18:00', ...FULL, typeName: 'Swimming Pool', colour: colourOf(POOL) },
      ]);
    });

    it('places the free slots, each with its type\'s colour', () => {
      expect(monday.slots).toEqual([
        {
          top: '0%',
          height: '10%',
          time: '08:00–09:00',
          ...FULL,
          colour: colourOf(STUDIO),
          start: z('2026-11-16T07:00'),
          end: z('2026-11-16T08:00'),
          day: 'Mon 16 Nov',
          typeName: 'Studio',
          window: { start: z('2026-11-16T07:00'), end: z('2026-11-16T11:00') },
          places: 'free',
          full: false,
          tab: null,
        },
        {
          top: '60%',
          height: '10%',
          time: '14:00–15:00',
          ...FULL,
          colour: colourOf(POOL),
          start: z('2026-11-16T13:00'),
          end: z('2026-11-16T14:00'),
          day: 'Mon 16 Nov',
          typeName: 'Swimming Pool',
          window: { start: z('2026-11-16T13:00'), end: z('2026-11-16T17:00') },
          places: 'free',
          full: false,
          tab: null,
        },
      ]);
    });

    it('other people\'s time is a busy block with a place and a time, and nothing else', () => {
      expect(monday.busy).toEqual([{ top: '10%', height: '10%', time: '09:00–10:00', ...FULL }]);
    });

    it('the User\'s own appointment says "You", with its type and its note', () => {
      expect(monday.appointments).toEqual([
        { top: '30%', height: '10%', time: '11:00–12:00', ...FULL, appointmentId: 'appt-2026-11-16T10:00:00.000Z', who: 'You', typeName: 'Studio', note: 'First lesson', colour: colourOf(STUDIO), beside: false },
      ]);
    });

    it('the legend has the types met in the week, by name', () => {
      expect(model.legend).toEqual([
        { name: 'Studio', colour: colourOf(STUDIO) },
        { name: 'Swimming Pool', colour: colourOf(POOL) },
      ]);
    });

    it('the other days are empty', () => {
      for (const day of model.days.slice(1)) expect([day.windows, day.slots, day.busy, day.appointments, day.groups]).toEqual([[], [], [], [], []]);
    });
  });

  describe('for the Administrator', () => {
    it('every appointment carries its User\'s name; a missing note is an empty text', () => {
      const week = view('2026-11-16', {
        appointments: [
          appointment({ start: z('2026-11-16T08:00'), end: z('2026-11-16T09:00'), date: '2026-11-16', username: 'alice', note: 'First lesson' }),
          appointment({ start: z('2026-11-16T09:15'), end: z('2026-11-16T10:00'), date: '2026-11-16', username: 'bob', typeId: POOL, typeName: 'Swimming Pool' }),
          appointment({ start: z('2026-11-18T08:00'), end: z('2026-11-18T09:00'), date: '2026-11-18', username: 'carol' }),
        ],
      });
      const model = weekModel(week, 'admin');
      expect(model.days[0]!.appointments.map((a) => [a.who, a.time, a.typeName, a.note])).toEqual([
        ['alice', '09:00–10:00', 'Studio', 'First lesson'],
        ['bob', '10:15–11:00', 'Swimming Pool', ''],
      ]);
      expect(model.days[2]!.appointments.map((a) => a.who)).toEqual(['carol']);
      expect(model.days[0]!.appointments[1]).toMatchObject({ top: percent(135, 600), height: percent(45, 600) });
      // A type met only in an appointment (its window was removed) is in the legend too.
      expect(model.legend.map((type) => type.name)).toEqual(['Studio', 'Swimming Pool']);
    });

    it('the same view for a User would say "You": the name comes from the role, not from the data', () => {
      const week = view('2026-11-16', { appointments: [appointment({ start: z('2026-11-16T08:00'), end: z('2026-11-16T09:00'), date: '2026-11-16', username: 'alice' })] });
      expect(weekModel(week, 'user').days[0]!.appointments[0]!.who).toBe('You');
      expect(JSON.stringify(weekModel(week, 'user'))).not.toContain('alice');
    });
  });

  it('a week in Europe/Rome in summer: the same instants are an hour later on the clock', () => {
    const week = view('2027-07-05', { generatedAt: z('2027-07-01T09:00') }, [
      {
        date: '2027-07-05',
        windows: [{ start: z('2027-07-05T07:00'), end: z('2027-07-05T11:00'), typeId: STUDIO, typeName: 'Studio' }],
        slots: [{ start: z('2027-07-05T07:00'), end: z('2027-07-05T08:00'), typeId: STUDIO, capacity: 1, placesLeft: 1 }],
      },
    ]);
    const day = weekModel(week, 'user').days[0]!;
    expect(day.label).toBe('Mon 5 Jul');
    expect(day.windows[0]).toMatchObject({ top: '10%', height: '40%', time: '09:00–13:00' });
    expect(day.slots[0]).toMatchObject({ top: '10%', height: '10%', time: '09:00–10:00' });
  });

  it('a calendar zone with a half-hour offset (Asia/Kolkata): times, places and today follow that zone', () => {
    // 09:00–11:00 in Kolkata is 03:30–05:30 UTC; generatedAt is Tuesday 01:30 there, still Monday in UTC.
    const week = view('2026-11-16', { timeZone: 'Asia/Kolkata', generatedAt: z('2026-11-16T20:00') }, [
      {
        date: '2026-11-16',
        windows: [{ start: z('2026-11-16T03:30'), end: z('2026-11-16T05:30'), typeId: STUDIO, typeName: 'Studio' }],
        slots: [{ start: z('2026-11-16T03:30'), end: z('2026-11-16T04:30'), typeId: STUDIO, capacity: 1, placesLeft: 1 }],
      },
    ]);
    const model = weekModel(week, 'user');
    expect(model.timeZone).toBe('Asia/Kolkata');
    expect(model.days[0]!.windows[0]).toMatchObject({ top: '10%', height: '20%', time: '09:00–11:00' });
    expect(model.days[0]!.slots[0]).toMatchObject({ top: '10%', height: '10%', time: '09:00–10:00' });
    expect(model.days.map((day) => day.today)).toEqual([false, true, false, false, false, false, false]);
  });

  it('today is the date of generatedAt in the calendar\'s zone, not in UTC nor in the browser\'s', () => {
    // Sunday 23:30 UTC is Monday 00:30 in Rome and Monday 13:30 in the browser's zone of the test.
    expect(weekModel(view('2026-11-16', { generatedAt: z('2026-11-15T23:30') }), 'user').days.map((day) => day.today).indexOf(true)).toBe(0);
    // Monday 22:30 UTC is still Monday in Rome; it is already Tuesday in the browser's zone.
    expect(weekModel(view('2026-11-16', { generatedAt: z('2026-11-16T22:30') }), 'user').days.map((day) => day.today).indexOf(true)).toBe(0);
    // A week that does not hold today marks no day.
    expect(weekModel(view('2026-11-23', { generatedAt: z('2026-11-16T22:30') }), 'user').days.some((day) => day.today)).toBe(false);
  });

  it('a week with nothing in it: seven empty days, 08:00 to 18:00, no legend', () => {
    const model = weekModel(view('2026-11-16'), 'admin');
    expect(model.hours).toHaveLength(10);
    expect(model.legend).toEqual([]);
    expect(model.days).toHaveLength(7);
    expect(model.days.every((day) => day.windows.length + day.slots.length + day.busy.length + day.appointments.length === 0)).toBe(true);
  });

  it('a window ending at 24:00: the hours go on to midnight and the time says 24:00', () => {
    const week = view('2026-11-16', {}, [
      { date: '2026-11-16', windows: [{ start: z('2026-11-16T19:00'), end: z('2026-11-16T23:00'), typeId: STUDIO, typeName: 'Studio' }] },
    ]);
    const model = weekModel(week, 'admin');
    expect(model.hours).toHaveLength(16);
    expect(model.hours.at(-1)).toBe('23:00');
    expect(model.days[0]!.windows[0]).toMatchObject({ top: percent(12 * 60, 16 * 60), height: percent(4 * 60, 16 * 60), time: '20:00–24:00' });
  });

  it('the hours are widened to whole hours before 08:00 and after 18:00, for every day of the week', () => {
    const week = view('2026-11-16', { appointments: [appointment({ start: z('2026-11-20T18:00'), end: z('2026-11-20T19:45'), date: '2026-11-20' })] }, [
      { date: '2026-11-17', windows: [{ start: z('2026-11-17T05:30'), end: z('2026-11-17T08:00'), typeId: STUDIO, typeName: 'Studio' }] },
      { date: '2026-11-18', busy: [{ start: z('2026-11-18T08:00'), end: z('2026-11-18T09:00') }] },
    ]);
    const model = weekModel(week, 'admin');
    // 06:30 on Tuesday opens the day at 06:00; 20:45 on Friday closes it at 21:00.
    expect(model.hours[0]).toBe('06:00');
    expect(model.hours.at(-1)).toBe('20:00');
    expect(model.hours).toHaveLength(15);
    expect(model.days[1]!.windows[0]).toMatchObject({ top: percent(30, 900), height: percent(150, 900), time: '06:30–09:00' });
    expect(model.days[2]!.busy[0]).toMatchObject({ top: percent(180, 900), height: percent(60, 900) });
    expect(model.days[4]!.appointments[0]).toMatchObject({ top: percent(780, 900), height: percent(105, 900), time: '19:00–20:45' });
  });

  describe('the week of 2027-10-31, when the clocks go back in Europe/Rome (R-SLOT-01)', () => {
    // A window 01:00–04:00 local on Sunday holds four real hours and four slots.
    const slot = (start: string, end: string) => ({ start: z(start), end: z(end), typeId: STUDIO, capacity: 1, placesLeft: 1 });
    const week: CalendarView = view('2027-10-25', { generatedAt: z('2027-10-20T09:00') }, [
      {
        date: '2027-10-30',
        slots: [slot('2027-10-30T07:00', '2027-10-30T08:00')],
      },
      {
        date: '2027-10-31',
        windows: [{ start: z('2027-10-30T23:00'), end: z('2027-10-31T03:00'), typeId: STUDIO, typeName: 'Studio' }],
        slots: [
          slot('2027-10-30T23:00', '2027-10-31T00:00'),
          slot('2027-10-31T00:00', '2027-10-31T01:00'),
          slot('2027-10-31T01:00', '2027-10-31T02:00'),
          slot('2027-10-31T02:00', '2027-10-31T03:00'),
        ],
      },
    ]);
    const model = weekModel(week, 'user');
    const sunday = model.days[6]!;
    const shown = 17 * 60; // 01:00 to 18:00

    it('the hours start at 01:00', () => {
      expect(model.hours[0]).toBe('01:00');
      expect(model.hours).toHaveLength(17);
    });

    it('every time of that day carries its offset; the two slots at 02:00 are told apart by it', () => {
      expect(sunday.slots.map((s) => s.time)).toEqual([
        '01:00 +02:00 – 02:00 +02:00',
        '02:00 +02:00 – 02:00 +01:00',
        '02:00 +01:00 – 03:00 +01:00',
        '03:00 +01:00 – 04:00 +01:00',
      ]);
      expect(sunday.windows[0]!.time).toBe('01:00 +02:00 – 04:00 +01:00');
    });

    it('the two are in the same place on the clock, side by side, the earlier on the left', () => {
      const [, first, second] = sunday.slots;
      expect(first).toMatchObject({ top: percent(60, shown), height: percent(60, shown), lane: 0, lanes: 2 });
      expect(second).toMatchObject({ top: percent(60, shown), height: percent(60, shown), lane: 1, lanes: 2 });
    });

    it('the slots before and after keep the whole width, and the window is three hours of clock', () => {
      expect(sunday.slots[0]).toMatchObject({ top: '0%', height: percent(60, shown), ...FULL });
      expect(sunday.slots[3]).toMatchObject({ top: percent(120, shown), height: percent(60, shown), ...FULL });
      expect(sunday.windows[0]).toMatchObject({ top: '0%', height: percent(180, shown), ...FULL });
    });

    it('no other day of the week carries an offset', () => {
      expect(model.days[5]!.slots[0]!.time).toBe('09:00–10:00');
    });

    it('appointments and busy blocks in the repeated hour are told apart the same way', () => {
      const repeated = [
        { start: z('2027-10-31T00:00'), end: z('2027-10-31T01:00') },
        { start: z('2027-10-31T01:00'), end: z('2027-10-31T02:00') },
      ];
      const users = weekModel(view('2027-10-25', {}, [{ date: '2027-10-31', busy: repeated }]), 'user').days[6]!;
      expect(users.busy.map((b) => [b.time, b.lane, b.lanes])).toEqual([
        ['02:00 +02:00 – 02:00 +01:00', 0, 2],
        ['02:00 +01:00 – 03:00 +01:00', 1, 2],
      ]);
      // Given in the other order, the earlier one is still on the left.
      const appointments = [...repeated].reverse().map((r, i) => appointment({ ...r, date: '2027-10-31', username: ['bob', 'alice'][i]! }));
      const admins = weekModel(view('2027-10-25', { appointments }), 'admin').days[6]!;
      expect(admins.appointments.map((a) => [a.who, a.time, a.lane, a.lanes])).toEqual([
        ['bob', '02:00 +01:00 – 03:00 +01:00', 1, 2],
        ['alice', '02:00 +02:00 – 02:00 +01:00', 0, 2],
      ]);
    });

    it('an appointment across the repeated hour that ends, on the clock, before it starts gets its real length', () => {
      // 02:30 +02:00 to 02:15 +01:00: 45 real minutes.
      const a = appointment({ start: z('2027-10-31T00:30'), end: z('2027-10-31T01:15'), date: '2027-10-31' });
      const day = weekModel(view('2027-10-25', { appointments: [a] }), 'admin').days[6]!;
      // The hours shown start at 02:00: 16 hours.
      expect(day.appointments[0]).toMatchObject({ top: percent(30, 960), height: percent(45, 960), time: '02:30 +02:00 – 02:15 +01:00', ...FULL });
    });

    it('a block that reaches midnight across the repeated hour stops at the end of the day', () => {
      // An odd answer, not one the calendar gives: 23:30 to 23:30 on the clock, 25 real hours.
      const odd = { start: z('2027-10-30T21:30'), end: z('2027-10-31T22:30') };
      const day = weekModel(view('2027-10-25', {}, [{ date: '2027-10-30', busy: [odd] }]), 'user').days[5]!;
      expect(day.busy[0]).toMatchObject({ top: percent(15.5 * 60, 16 * 60), height: percent(30, 16 * 60) });
    });
  });

  describe('the week of 2027-03-28, when the clocks go forward in Europe/Rome (R-TIME-03)', () => {
    // A window 01:00–04:00 local holds two real hours: the slots 01:00–03:00 and 03:00–04:00.
    const week = view('2027-03-22', { generatedAt: z('2027-03-20T09:00') }, [
      {
        date: '2027-03-28',
        windows: [{ start: z('2027-03-28T00:00'), end: z('2027-03-28T02:00'), typeId: STUDIO, typeName: 'Studio' }],
        slots: [
          { start: z('2027-03-28T00:00'), end: z('2027-03-28T01:00'), typeId: STUDIO, capacity: 1, placesLeft: 1 },
          { start: z('2027-03-28T01:00'), end: z('2027-03-28T02:00'), typeId: STUDIO, capacity: 1, placesLeft: 1 },
        ],
      },
    ]);
    const sunday = weekModel(week, 'user').days[6]!;
    const shown = 17 * 60;

    it('the times carry their offsets, and no block is in the missing hour', () => {
      expect(sunday.slots.map((s) => s.time)).toEqual(['01:00 +01:00 – 03:00 +02:00', '03:00 +02:00 – 04:00 +02:00']);
    });

    it('the blocks follow the clock, one under the other, each the whole width', () => {
      expect(sunday.slots[0]).toMatchObject({ top: '0%', height: percent(120, shown), ...FULL });
      expect(sunday.slots[1]).toMatchObject({ top: percent(120, shown), height: percent(60, shown), ...FULL });
    });
  });

  describe('what the dialogs need', () => {
    it('an appointment carries its id, for both roles', () => {
      const a = appointment({ appointmentId: '01M6DMQ0000000000000000001', start: z('2026-11-16T08:00'), end: z('2026-11-16T09:00'), date: '2026-11-16' });
      for (const role of ['admin', 'user'] as const) {
        expect(weekModel(view('2026-11-16', { appointments: [a] }), role).days[0]!.appointments[0]!.appointmentId).toBe('01M6DMQ0000000000000000001');
      }
    });

    it('a slot\'s window is the whole stretch of its type: two windows that touch are one (6.6)', () => {
      // Studio 08:30–10:30 and 10:30–12:00 local, then Swimming Pool from 12:00: the slot
      // 10:00–11:00 lies across the first two.
      const week = view('2026-11-16', {}, [
        {
          date: '2026-11-16',
          windows: [
            { start: z('2026-11-16T07:30'), end: z('2026-11-16T09:30'), typeId: STUDIO, typeName: 'Studio' },
            { start: z('2026-11-16T09:30'), end: z('2026-11-16T11:00'), typeId: STUDIO, typeName: 'Studio' },
            { start: z('2026-11-16T11:00'), end: z('2026-11-16T13:00'), typeId: POOL, typeName: 'Swimming Pool' },
          ],
          slots: [
            { start: z('2026-11-16T09:00'), end: z('2026-11-16T10:00'), typeId: STUDIO, capacity: 1, placesLeft: 1 },
            { start: z('2026-11-16T11:00'), end: z('2026-11-16T12:00'), typeId: POOL, capacity: 1, placesLeft: 1 },
          ],
        },
      ]);
      const [studio, pool] = weekModel(week, 'admin').days[0]!.slots;
      expect(studio!.window).toEqual({ start: z('2026-11-16T07:30'), end: z('2026-11-16T11:00') });
      expect(pool!.window).toEqual({ start: z('2026-11-16T11:00'), end: z('2026-11-16T13:00') });
      expect([studio!.typeName, pool!.typeName]).toEqual(['Studio', 'Swimming Pool']);
    });

    it('a slot that no window of the answer holds is its own window, and its type has no name', () => {
      const week = view('2026-11-16', {}, [{ date: '2026-11-17', slots: [{ start: z('2026-11-17T08:00'), end: z('2026-11-17T09:00'), typeId: STUDIO, capacity: 1, placesLeft: 1 }] }]);
      expect(weekModel(week, 'user').days[1]!.slots[0]).toMatchObject({
        day: 'Tue 17 Nov',
        typeName: '',
        window: { start: z('2026-11-17T08:00'), end: z('2026-11-17T09:00') },
      });
    });

    it('the two slots at 02:00 of 2027-10-31 carry their own instants, an hour apart, in one window', () => {
      const slot = (start: string, end: string) => ({ start: z(start), end: z(end), typeId: STUDIO, capacity: 1, placesLeft: 1 });
      const week = view('2027-10-25', {}, [
        {
          date: '2027-10-31',
          windows: [{ start: z('2027-10-30T23:00'), end: z('2027-10-31T03:00'), typeId: STUDIO, typeName: 'Studio' }],
          slots: [slot('2027-10-31T00:00', '2027-10-31T01:00'), slot('2027-10-31T01:00', '2027-10-31T02:00')],
        },
      ]);
      const slots = weekModel(week, 'user').days[6]!.slots;
      expect(slots.map((s) => [s.start, s.end])).toEqual([
        [z('2027-10-31T00:00'), z('2027-10-31T01:00')],
        [z('2027-10-31T01:00'), z('2027-10-31T02:00')],
      ]);
      expect(slots.map((s) => s.day)).toEqual(['Sun 31 Oct', 'Sun 31 Oct']);
      expect(slots[1]!.window).toEqual({ start: z('2027-10-30T23:00'), end: z('2027-10-31T03:00') });
    });
  });

  describe('the places of a slot (R-SLOT-02, R-SLOT-04, 16.8)', () => {
    const slot = (capacity: number, placesLeft: number) => ({ start: z('2026-11-16T08:00'), end: z('2026-11-16T09:00'), typeId: POOL, capacity, placesLeft });
    const slotOf = (capacity: number, placesLeft: number, role: 'admin' | 'user') =>
      weekModel(view('2026-11-16', {}, [{ date: '2026-11-16', slots: [slot(capacity, placesLeft)] }]), role).days[0]!.slots[0]!;

    it('a capacity of 1 says "free", as a slot always did', () => {
      expect(slotOf(1, 1, 'user')).toMatchObject({ places: 'free', full: false, time: '09:00–10:00' });
    });

    it('a capacity of 3 with 2 left says so, for a User and for the Administrator', () => {
      for (const role of ['user', 'admin'] as const) expect(slotOf(3, 2, role)).toMatchObject({ places: '2 of 3 places left', full: false });
      expect(slotOf(3, 1, 'user').places).toBe('1 of 3 places left');
    });

    it('the Administrator\'s full slot, at 0 places left, is "Full" and marked full, whatever its capacity', () => {
      expect(slotOf(3, 0, 'admin')).toMatchObject({ places: 'Full', full: true });
      expect(slotOf(1, 0, 'admin')).toMatchObject({ places: 'Full', full: true });
    });

    it('placesOf never answers a negative number of places', () => {
      expect(placesOf(2, -1)).toEqual({ places: 'Full', full: true });
    });
  });

  describe('a slot that appointments overlap: a tab beside them (16.8)', () => {
    // Monday 2026-11-16 in Rome, UTC+1: the slot 09:00–10:00 local, of capacity 3.
    const slot = (placesLeft: number, from = '08:00', to = '09:00') => ({ start: z(`2026-11-16T${from}`), end: z(`2026-11-16T${to}`), typeId: POOL, capacity: 3, placesLeft });
    const booked = (username: string, from = '08:00', to = '09:00') =>
      appointment({ appointmentId: `appt-${username}`, start: z(`2026-11-16T${from}`), end: z(`2026-11-16T${to}`), date: '2026-11-16', username, typeId: POOL, typeName: 'Swimming Pool' });
    const dayOf = (slots: ReturnType<typeof slot>[], appointments: ReturnType<typeof booked>[]) =>
      weekModel(view('2026-11-16', { appointments }, [{ date: '2026-11-16', slots }]), 'admin').days[0]!;

    it('a slot with no appointment over it is drawn whole: no tab; an appointment with no slot under it leaves no room', () => {
      const day = dayOf([slot(3)], [booked('alice', '10:00', '11:00')]);
      expect([day.slots[0]!.tab, day.appointments[0]!.beside]).toEqual([null, false]);
    });

    it('a slot with places left under an appointment is a tab "2 left"; the appointment leaves it room', () => {
      const day = dayOf([slot(2)], [booked('alice')]);
      expect([day.slots[0]!.tab, day.slots[0]!.places, day.appointments[0]!.beside]).toEqual(['2 left', '2 of 3 places left', true]);
    });

    it('a full slot under its three appointments is a tab "Full"; the three, side by side, leave it room', () => {
      const day = dayOf([slot(0)], ['alice', 'bob', 'carol'].map((who) => booked(who)));
      expect([day.slots[0]!.tab, day.slots[0]!.full]).toEqual(['Full', true]);
      expect(day.appointments.map((a) => [a.lane, a.lanes, a.beside])).toEqual([
        [0, 3, true],
        [1, 3, true],
        [2, 3, true],
      ]);
    });

    it('a group over a full slot leaves it room too; a group with no slot under it does not', () => {
      const four = ['a', 'b', 'c', 'd'].map((who) => booked(who));
      expect(dayOf([slot(0)], four).groups[0]!.beside).toBe(true);
      expect(dayOf([slot(0, '12:00', '13:00')], four).groups[0]!.beside).toBe(false);
    });

    it('a slot and an appointment that only touch do not overlap', () => {
      const day = dayOf([slot(3, '09:00', '10:00')], [booked('alice')]);
      expect([day.slots[0]!.tab, day.appointments[0]!.beside]).toEqual([null, false]);
    });
  });

  describe('the Administrator\'s appointments that overlap (16.8)', () => {
    // Monday 2026-11-16 in Rome, UTC+1: 10:00 local is 09:00Z. Each appointment a User of its own.
    const at = (from: string, to: string, username: string, typeName = 'Swimming Pool') =>
      appointment({ appointmentId: `appt-${username}`, start: z(`2026-11-16T${from}`), end: z(`2026-11-16T${to}`), date: '2026-11-16', username, typeId: POOL, typeName });
    const dayOf = (appointments: ReturnType<typeof at>[], role: 'admin' | 'user' = 'admin') => weekModel(view('2026-11-16', { appointments }), role).days[0]!;
    const columns = (day: ReturnType<typeof dayOf>) => day.appointments.map((a) => [a.who, a.lane, a.lanes]);
    const shown = 600; // 08:00 to 18:00

    it('one appointment alone keeps the whole width', () => {
      const day = dayOf([at('09:00', '10:00', 'alice')]);
      expect(columns(day)).toEqual([['alice', 0, 1]]);
      expect(day.groups).toEqual([]);
    });

    it('two at the same time stand side by side, the order of the answer kept', () => {
      expect(columns(dayOf([at('09:00', '10:00', 'bob'), at('09:00', '10:00', 'alice')]))).toEqual([
        ['bob', 0, 2],
        ['alice', 1, 2],
      ]);
    });

    it('three that overlap are three columns; the earliest takes the leftmost', () => {
      const day = dayOf([at('09:30', '10:00', 'carol'), at('09:00', '10:00', 'alice'), at('09:15', '10:00', 'bob')]);
      expect(columns(day)).toEqual([
        ['carol', 2, 3],
        ['alice', 0, 3],
        ['bob', 1, 3],
      ]);
      expect(day.groups).toEqual([]);
    });

    it('four that overlap are one block over their span, which lists them by start', () => {
      const day = dayOf([at('09:00', '10:00', 'dan'), at('09:00', '10:00', 'alice'), at('08:30', '09:30', 'bob'), at('09:15', '10:45', 'carol')]);
      expect(day.appointments).toEqual([]);
      expect(day.groups).toEqual([
        {
          top: percent(90, shown),
          height: percent(135, shown),
          time: '09:30–11:45',
          lane: 0,
          lanes: 1,
          what: '4 people · Swimming Pool',
          when: 'Mon 16 Nov, 09:30–11:45',
          colour: colourOf(POOL),
          rows: [
            { appointmentId: 'appt-bob', time: '09:30–10:30', who: 'bob' },
            { appointmentId: 'appt-dan', time: '10:00–11:00', who: 'dan' },
            { appointmentId: 'appt-alice', time: '10:00–11:00', who: 'alice' },
            { appointmentId: 'appt-carol', time: '10:15–11:45', who: 'carol' },
          ],
          beside: false,
        },
      ]);
    });

    it('a chain of four whose peak is two is two columns, side by side, not one block', () => {
      // 10:00–10:30, 10:15–10:45, 10:30–11:00, 10:45–11:15 local.
      const day = dayOf([at('09:00', '09:30', 'a'), at('09:15', '09:45', 'b'), at('09:30', '10:00', 'c'), at('09:45', '10:15', 'd')]);
      expect(columns(day)).toEqual([
        ['a', 0, 2],
        ['b', 1, 2],
        ['c', 0, 2],
        ['d', 1, 2],
      ]);
      expect(day.groups).toEqual([]);
    });

    it('appointments that touch are not chained: each keeps the whole width', () => {
      expect(columns(dayOf([at('09:00', '10:00', 'alice'), at('10:00', '11:00', 'bob'), at('08:00', '09:00', 'carol')]))).toEqual([
        ['alice', 0, 1],
        ['bob', 0, 1],
        ['carol', 0, 1],
      ]);
    });

    it('a chain is apart from the next one: four at 10:00 are a block, two at 14:00 side by side', () => {
      const four = ['a', 'b', 'c', 'd'].map((who) => at('09:00', '10:00', who));
      const day = dayOf([...four, at('13:00', '14:00', 'e'), at('13:30', '14:00', 'f')]);
      expect(day.groups.map((g) => [g.what, g.time])).toEqual([['4 people · Swimming Pool', '10:00–11:00']]);
      expect(columns(day)).toEqual([
        ['e', 0, 2],
        ['f', 1, 2],
      ]);
    });

    it('two chains of four are two blocks, each with its own count', () => {
      const day = dayOf([...['a', 'b', 'c', 'd', 'e'].map((who) => at('09:00', '10:00', who)), ...['f', 'g', 'h', 'i'].map((who) => at('13:00', '14:00', who))]);
      expect(day.groups.map((g) => [g.what, g.rows.length])).toEqual([
        ['5 people · Swimming Pool', 5],
        ['4 people · Swimming Pool', 4],
      ]);
    });

    it('a User\'s week draws no block: a User\'s own appointments never overlap (R-BOOK-12)', () => {
      const day = dayOf(['a', 'b', 'c', 'd'].map((who) => at('09:00', '10:00', who)), 'user');
      expect(day.groups).toEqual([]);
      expect(day.appointments).toHaveLength(4);
    });
  });

  describe('colourOf', () => {
    it('is one of the six colours, and the same for the same id', () => {
      for (const id of [STUDIO, POOL, '', 'x']) {
        expect(colourOf(id)).toBe(colourOf(id));
        expect([0, 1, 2, 3, 4, 5]).toContain(colourOf(id));
      }
    });
  });
});
