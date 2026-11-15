import { DEFAULT_SETTINGS, type Role } from '@shared-calendar/shared';
import {
  checkBooking,
  checkBookingTimes,
  type BookingInput,
  type CalendarState,
  type StateAppointment,
} from '../../../src/lib/calendarRules';

// The booking rules of docs/SHARED_CALENDAR_SPEC.md section 8.2, pure. The dates of
// docs/SHARED_CALENDAR_SPEC.md section 18.3: now 2026-11-10T09:00Z (Tuesday, 10:00 local),
// Europe/Rome (UTC+1 in November); pattern Mon 08:00–12:00 Studio from 2026-11-01
// (docs/SHARED_CALENDAR_SPEC.md AC-04), so Monday 2026-11-16 has the window 07:00Z–11:00Z and
// "09:00 local" is 08:00Z.

const ZONE = 'Europe/Rome';
const NOW = '2026-11-10T09:00:00.000Z';
const TODAY = '2026-11-10';
const STUDIO = '01JC0000000000000000000001';
const POOL = '01JC0000000000000000000002';
const GONE = '01JC0000000000000000000099';
const P1 = '01JC00000000000000000000P1';
const ALICE = 'sub-alice';
const BOB = 'sub-bob';

const ac04 = { patternId: P1, weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };
const state = (more: Partial<CalendarState> = {}): CalendarState => ({
  types: [{ typeId: STUDIO }, { typeId: POOL }],
  patterns: [ac04],
  overrides: [],
  oneOffs: [],
  appointments: [],
  ...more,
});
const appt = (start: string, end: string, more: Partial<StateAppointment> = {}): StateAppointment => ({
  appointmentId: 'A1',
  userId: ALICE,
  username: 'alice',
  start,
  end,
  date: start.slice(0, 10),
  typeId: STUDIO,
  status: 'booked',
  ...more,
});
const SETTINGS = { ...DEFAULT_SETTINGS };

type Request = Partial<Omit<BookingInput, 'settings'>> & { settings?: Partial<BookingInput['settings']> };
const book = (start: string, end: string, more: Request = {}) =>
  checkBooking({
    start,
    end,
    role: 'user',
    userId: ALICE,
    state: state(),
    now: NOW,
    today: TODAY,
    zone: ZONE,
    ...more,
    settings: { ...SETTINGS, ...more.settings },
  });
const studio = (start: string, end: string) => ({ window: { start, end, typeId: STUDIO } });
const refused = (error: string) => expect.objectContaining({ error });

// Monday 2026-11-16 in local hours.
const MON_0900 = '2026-11-16T08:00:00.000Z';
const MON_1000 = '2026-11-16T09:00:00.000Z';
const MON_1100 = '2026-11-16T10:00:00.000Z';
const MON_1200 = '2026-11-16T11:00:00.000Z';
const MON_1300 = '2026-11-16T12:00:00.000Z';

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('checkBookingTimes (R-BOOK-02)', () => {
  describe('a User', () => {
    it('accepts a whole local hour and fills in end = start + 60 min', () => {
      expect(checkBookingTimes(MON_0900, undefined, 'user', ZONE)).toEqual({ start: MON_0900, end: MON_1000 });
    });

    it('accepts end = start + 60 min given explicitly', () => {
      expect(checkBookingTimes(MON_0900, MON_1000, 'user', ZONE)).toEqual({ start: MON_0900, end: MON_1000 });
    });

    it('AC-13: refuses 09:30 local (not a whole hour)', () => {
      expect(checkBookingTimes('2026-11-16T08:30:00.000Z', undefined, 'user', ZONE)).toEqual({
        error: 'invalid_request',
        message: 'Invalid input: start must be a whole hour',
      });
    });

    it.each([
      ['30 minutes', '2026-11-16T08:30:00.000Z'],
      ['two hours', MON_1100],
    ])('refuses an end other than start + 60 min (%s)', (_name, end) => {
      expect(checkBookingTimes(MON_0900, end, 'user', ZONE)).toEqual({ error: 'invalid_request', message: 'Invalid input: end must be one hour after start' });
    });

    it('follows the local clock, not UTC: Asia/Kathmandu (+05:45) 09:00 local is 03:15Z', () => {
      expect(checkBookingTimes('2026-11-16T03:15:00.000Z', undefined, 'user', 'Asia/Kathmandu')).toEqual({
        start: '2026-11-16T03:15:00.000Z',
        end: '2026-11-16T04:15:00.000Z',
      });
      expect(checkBookingTimes(MON_0900, undefined, 'user', 'Asia/Kathmandu')).toEqual(refused('invalid_request'));
    });

    it('accepts both 02:00 starts of the night clocks go back, each one real hour long', () => {
      expect(checkBookingTimes('2026-10-25T00:00:00.000Z', undefined, 'user', ZONE)).toEqual({ start: '2026-10-25T00:00:00.000Z', end: '2026-10-25T01:00:00.000Z' });
      expect(checkBookingTimes('2026-10-25T01:00:00.000Z', undefined, 'user', ZONE)).toEqual({ start: '2026-10-25T01:00:00.000Z', end: '2026-10-25T02:00:00.000Z' });
    });
  });

  describe('the Administrator (R-BOOK-08 custom times)', () => {
    it('AC-14: accepts 09:15–10:00 local', () => {
      expect(checkBookingTimes('2026-11-16T08:15:00.000Z', MON_1000, 'admin', ZONE)).toEqual({ start: '2026-11-16T08:15:00.000Z', end: MON_1000 });
    });

    it('fills in end = start + 60 min, from any 15-minute step', () => {
      expect(checkBookingTimes('2026-11-16T08:45:00.000Z', undefined, 'admin', ZONE)).toEqual({
        start: '2026-11-16T08:45:00.000Z',
        end: '2026-11-16T09:45:00.000Z',
      });
    });

    it('accepts exactly 15 minutes', () => {
      expect(checkBookingTimes(MON_0900, '2026-11-16T08:15:00.000Z', 'admin', ZONE)).toEqual({ start: MON_0900, end: '2026-11-16T08:15:00.000Z' });
    });

    it('refuses a start off the 15-minute grid', () => {
      expect(checkBookingTimes('2026-11-16T08:10:00.000Z', undefined, 'admin', ZONE)).toEqual({
        error: 'invalid_request',
        message: 'Invalid input: start must be on a 15-minute step',
      });
    });

    it('refuses an end off the 15-minute grid', () => {
      expect(checkBookingTimes(MON_0900, '2026-11-16T08:50:00.000Z', 'admin', ZONE)).toEqual({
        error: 'invalid_request',
        message: 'Invalid input: end must be on a 15-minute step',
      });
    });

    it('refuses less than 15 minutes (the schema already refuses an end not after start)', () => {
      expect(checkBookingTimes(MON_1000, MON_0900, 'admin', ZONE)).toEqual({
        error: 'invalid_request',
        message: 'Invalid input: an appointment lasts at least 15 minutes',
      });
    });
  });
});

// Test names: section numbers, R-… rules and AC-… scenarios are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).
describe('checkBooking (R-BOOK-03..09)', () => {
  describe('the acceptance scenarios (18.3)', () => {
    it('AC-10: alice books Monday 09:00 local: inside the Studio window', () => {
      expect(book(MON_0900, MON_1000)).toEqual(studio('2026-11-16T07:00:00.000Z', MON_1200));
    });

    it('AC-11: bob books the same slot: slot_taken', () => {
      expect(book(MON_0900, MON_1000, { userId: BOB, state: state({ appointments: [appt(MON_0900, MON_1000)] }) })).toEqual({
        error: 'slot_taken',
        message: 'The time is already booked',
      });
    });

    it('AC-14: the Administrator books alice 09:15–10:00 local', () => {
      expect(book('2026-11-16T08:15:00.000Z', MON_1000, { role: 'admin' })).toEqual(studio('2026-11-16T07:00:00.000Z', MON_1200));
    });

    it('AC-15: after AC-14, alice books 09:00 local: slot_taken (partial overlap)', () => {
      const ac14 = appt('2026-11-16T08:15:00.000Z', MON_1000);
      expect(book(MON_0900, MON_1000, { state: state({ appointments: [ac14] }) })).toEqual(refused('slot_taken'));
    });

    it('AC-16: alice books 12:00 local, outside the window: outside_availability', () => {
      expect(book(MON_1200, MON_1300)).toEqual({ error: 'outside_availability', message: 'The time is not inside the availability' });
    });

    describe('AC-17: horizon 7, now 2026-11-10', () => {
      const MON_23 = '2026-11-23T08:00:00.000Z';
      it('alice books 2026-11-23 09:00: booking_beyond_horizon', () => {
        expect(book(MON_23, '2026-11-23T09:00:00.000Z', { settings: { bookingHorizonDays: 7 } })).toEqual({
          error: 'booking_beyond_horizon',
          message: 'The start is too far ahead',
        });
      });
      it('the last date of the horizon, 2026-11-17, is still bookable', () => {
        const tuesday = state({ patterns: [{ ...ac04, weekday: 2 }] });
        expect(book('2026-11-17T08:00:00.000Z', '2026-11-17T09:00:00.000Z', { state: tuesday, settings: { bookingHorizonDays: 7 } })).not.toHaveProperty('error');
      });
      it('the Administrator books the same for alice (exempt)', () => {
        expect(book(MON_23, '2026-11-23T09:00:00.000Z', { role: 'admin', settings: { bookingHorizonDays: 7 } })).not.toHaveProperty('error');
      });
    });

    describe('AC-18: notice 48 h, now 2026-11-15T10:00 local', () => {
      const now = '2026-11-15T09:00:00.000Z';
      it('alice books 2026-11-16 09:00 (23 h ahead): booking_notice_too_short', () => {
        expect(book(MON_0900, MON_1000, { now, today: '2026-11-15', settings: { minBookingNoticeHours: 48 } })).toEqual({
          error: 'booking_notice_too_short',
          message: 'Not enough notice before the start',
        });
      });
      it('exactly the notice is enough (≥)', () => {
        expect(book(MON_0900, MON_1000, { now: '2026-11-14T08:00:00.000Z', today: '2026-11-14', settings: { minBookingNoticeHours: 48 } })).not.toHaveProperty('error');
      });
      it('the Administrator is exempt', () => {
        expect(book(MON_0900, MON_1000, { role: 'admin', now, today: '2026-11-15', settings: { minBookingNoticeHours: 48 } })).not.toHaveProperty('error');
      });
    });

    describe('AC-19: limit 1, alice holds one future appointment', () => {
      const held = state({ appointments: [appt(MON_1000, MON_1100)] });
      it('alice books another: appointment_limit_reached', () => {
        expect(book(MON_0900, MON_1000, { state: held, settings: { maxFutureAppointmentsPerUser: 1 } })).toEqual({
          error: 'appointment_limit_reached',
          message: 'The maximum number of future appointments is reached',
        });
      });
      it('the Administrator books for alice (exempt)', () => {
        expect(book(MON_0900, MON_1000, { role: 'admin', state: held, settings: { maxFutureAppointmentsPerUser: 1 } })).not.toHaveProperty('error');
      });
      it('bob is not limited by alice’s appointment: the count is by userId', () => {
        expect(book(MON_0900, MON_1000, { userId: BOB, state: held, settings: { maxFutureAppointmentsPerUser: 1 } })).not.toHaveProperty('error');
      });
      it('a same username with another sub (a later account) does not count', () => {
        const former = state({ appointments: [appt(MON_1000, MON_1100, { userId: 'sub-old-alice' })] });
        expect(book(MON_0900, MON_1000, { state: former, settings: { maxFutureAppointmentsPerUser: 1 } })).not.toHaveProperty('error');
      });
      it('no limit when the setting is null (the default)', () => {
        expect(book(MON_0900, MON_1000, { state: held })).not.toHaveProperty('error');
      });
    });
  });

  describe('R-BOOK-03: the start is in the future, for both roles', () => {
    it.each<Role>(['user', 'admin'])('%s: a start at now is booking_in_past', (role) => {
      const now = MON_0900;
      expect(book(MON_0900, MON_1000, { role, now, today: '2026-11-16' })).toEqual({ error: 'booking_in_past', message: 'The start is not in the future' });
    });
    it('one minute later is fine (notice 0)', () => {
      expect(book(MON_0900, MON_1000, { now: '2026-11-16T07:59:00.000Z', today: '2026-11-16' })).not.toHaveProperty('error');
    });
  });

  describe('R-BOOK-06: inside one effective window', () => {
    it('AC-08: a User books 12:00 local inside the window merged across a pattern and a one-off window', () => {
      const merged = state({ oneOffs: [{ windowId: 'W1', date: '2026-11-16', start: '12:00', end: '13:00', typeId: STUDIO }] });
      expect(book(MON_1200, MON_1300, { state: merged })).toEqual(studio('2026-11-16T07:00:00.000Z', MON_1300));
    });

    it('AC-08: the Administrator books 11:30–12:30 across the join of the two sources', () => {
      const merged = state({ oneOffs: [{ windowId: 'W1', date: '2026-11-16', start: '12:00', end: '13:00', typeId: STUDIO }] });
      expect(book('2026-11-16T10:30:00.000Z', '2026-11-16T11:30:00.000Z', { role: 'admin', state: merged })).toEqual(studio('2026-11-16T07:00:00.000Z', MON_1300));
    });

    it('touching windows of different types do not merge: across them is outside', () => {
      const touching = state({ oneOffs: [{ windowId: 'W1', date: '2026-11-16', start: '12:00', end: '13:00', typeId: POOL }] });
      expect(book('2026-11-16T10:30:00.000Z', '2026-11-16T11:30:00.000Z', { role: 'admin', state: touching })).toEqual(refused('outside_availability'));
      expect(book(MON_1200, MON_1300, { state: touching })).toEqual({ window: { start: MON_1200, end: MON_1300, typeId: POOL } });
    });

    it('the appointment ending exactly at the window’s end is inside', () => {
      expect(book(MON_1100, MON_1200)).toEqual(studio('2026-11-16T07:00:00.000Z', MON_1200));
    });

    it('follows an override: an empty one leaves no window', () => {
      expect(book(MON_0900, MON_1000, { state: state({ overrides: [{ date: '2026-11-16', windows: [] }] }) })).toEqual(refused('outside_availability'));
    });

    it('a window of a type that no longer exists is left out, as in the view', () => {
      expect(book(MON_0900, MON_1000, { state: state({ patterns: [{ ...ac04, typeId: GONE }] }) })).toEqual(refused('outside_availability'));
    });

    it('never across local midnight: the next date’s windows are not joined', () => {
      const late = state({ patterns: [{ ...ac04, start: '22:00', end: '24:00' }, { ...ac04, patternId: 'P2', weekday: 2, start: '00:00', end: '02:00' }] });
      // Monday 23:30 local to Tuesday 00:30 local.
      expect(book('2026-11-16T22:30:00.000Z', '2026-11-16T23:30:00.000Z', { role: 'admin', state: late })).toEqual(refused('outside_availability'));
    });

    it('the night clocks go back: both 02:00 slots are bookable, as distinct instants', () => {
      const night = state({ patterns: [{ ...ac04, weekday: 7, start: '01:00', end: '04:00', validFrom: '2026-10-01' }] });
      const at = { now: '2026-10-20T09:00:00.000Z', today: '2026-10-20' };
      const first = '2026-10-25T00:00:00.000Z'; // 02:00 +02:00
      const second = '2026-10-25T01:00:00.000Z'; // 02:00 +01:00
      const window = { window: { start: '2026-10-24T23:00:00.000Z', end: '2026-10-25T03:00:00.000Z', typeId: STUDIO } };
      expect(book(first, second, { ...at, state: night })).toEqual(window);
      expect(book(second, '2026-10-25T02:00:00.000Z', { ...at, state: night })).toEqual(window);
      // The first one booked does not take the second.
      const one = state({ ...night, appointments: [appt(first, second, { date: '2026-10-25' })] });
      expect(book(second, '2026-10-25T02:00:00.000Z', { ...at, userId: BOB, state: one })).toEqual(window);
    });
  });

  describe('R-BOOK-07: no active appointment overlaps', () => {
    it('R-SLOT-05: the Administrator’s 10:00–10:30 makes the 10:00 slot not free for a User', () => {
      const half = state({ appointments: [appt(MON_1000, '2026-11-16T09:30:00.000Z', { userId: BOB })] });
      expect(book(MON_1000, MON_1100, { state: half })).toEqual(refused('slot_taken'));
      // The remaining half hour is the Administrator's, with custom times.
      expect(book('2026-11-16T09:30:00.000Z', MON_1100, { role: 'admin', state: half })).not.toHaveProperty('error');
    });

    it('a touching appointment does not overlap', () => {
      expect(book(MON_1000, MON_1100, { state: state({ appointments: [appt(MON_0900, MON_1000)] }) })).not.toHaveProperty('error');
    });

    it('a cancelled appointment never blocks', () => {
      expect(book(MON_0900, MON_1000, { userId: BOB, state: state({ appointments: [appt(MON_0900, MON_1000, { status: 'cancelled' })] }) })).not.toHaveProperty('error');
    });

    it('applies to the Administrator too', () => {
      expect(book(MON_0900, MON_1000, { role: 'admin', state: state({ appointments: [appt(MON_0900, MON_1000)] }) })).toEqual(refused('slot_taken'));
    });
  });

  describe('R-BOOK-09: counts only booked appointments that start after now', () => {
    const limit = { maxFutureAppointmentsPerUser: 1 };
    it('an ended one does not count', () => {
      const ended = state({ appointments: [appt('2026-11-09T08:00:00.000Z', '2026-11-09T09:00:00.000Z')] });
      expect(book(MON_0900, MON_1000, { state: ended, settings: limit })).not.toHaveProperty('error');
    });
    it('one in progress does not count (start ≤ now)', () => {
      const inProgress = state({ appointments: [appt('2026-11-10T08:30:00.000Z', '2026-11-10T09:30:00.000Z')] });
      expect(book(MON_0900, MON_1000, { state: inProgress, settings: limit })).not.toHaveProperty('error');
    });
    it('a cancelled one does not count', () => {
      const cancelled = state({ appointments: [appt(MON_1000, MON_1100, { status: 'cancelled' })] });
      expect(book(MON_0900, MON_1000, { state: cancelled, settings: limit })).not.toHaveProperty('error');
    });
    it('below the limit is fine: 1 held, limit 2', () => {
      expect(book(MON_0900, MON_1000, { state: state({ appointments: [appt(MON_1000, MON_1100)] }), settings: { maxFutureAppointmentsPerUser: 2 } })).not.toHaveProperty('error');
    });
  });

  describe('the order: a request that breaks two neighbouring rules gets the earlier one’s code', () => {
    it('R-BOOK-03 before R-BOOK-04: booking_in_past', () => {
      expect(book(MON_0900, MON_1000, { now: MON_1000, today: '2026-11-16', settings: { minBookingNoticeHours: 48 } })).toEqual({
        error: 'booking_in_past',
        message: 'The start is not in the future',
      });
    });

    it('R-BOOK-04 before R-BOOK-05: notice 720 h and horizon 7, booking 13 days ahead', () => {
      const MON_23 = '2026-11-23T08:00:00.000Z';
      expect(book(MON_23, '2026-11-23T09:00:00.000Z', { settings: { minBookingNoticeHours: 720, bookingHorizonDays: 7 } })).toEqual(refused('booking_notice_too_short'));
    });

    it('R-BOOK-05 before R-BOOK-06: too far and outside the availability', () => {
      expect(book('2026-11-23T11:00:00.000Z', '2026-11-23T12:00:00.000Z', { settings: { bookingHorizonDays: 7 } })).toEqual(refused('booking_beyond_horizon'));
    });

    it('R-BOOK-06 before R-BOOK-07: outside the availability and overlapping an appointment', () => {
      expect(book(MON_1200, MON_1300, { state: state({ appointments: [appt(MON_1200, MON_1300, { userId: BOB })] }) })).toEqual(refused('outside_availability'));
    });

    it('R-BOOK-07 before R-BOOK-09: taken and over the limit', () => {
      const s = state({ appointments: [appt(MON_0900, MON_1000, { userId: BOB }), appt(MON_1000, MON_1100)] });
      expect(book(MON_0900, MON_1000, { state: s, settings: { maxFutureAppointmentsPerUser: 1 } })).toEqual(refused('slot_taken'));
    });
  });
});
