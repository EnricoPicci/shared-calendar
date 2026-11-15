import { DEFAULT_SETTINGS, toInstant } from '@shared-calendar/shared';
import { checkChange, type CalendarState, type Caller, type ChangeInput, type StateAppointment } from '../../../src/lib/calendarRules';

// checkChange (docs/SHARED_CALENDAR_SPEC.md section 8.4, R-CHG-01), pure, on the exact dates of
// docs/SHARED_CALENDAR_SPEC.md section 18.3: Europe/Rome (UTC+1 in November), the pattern Mon
// 08:00–12:00 Studio from 2026-11-01 (docs/SHARED_CALENDAR_SPEC.md AC-04), alice holds Monday
// 2026-11-16 09:00 local. "Enough notice" is now 2026-11-10T09:00Z; the notice case is now
// 2026-11-15T09:01 local (docs/SHARED_CALENDAR_SPEC.md AC-21).

const ZONE = 'Europe/Rome';
const NOW = '2026-11-10T09:00:00.000Z';
const TODAY = '2026-11-10';
const LATE_NOW = toInstant('2026-11-15', '09:01', ZONE);
const STUDIO = '01JC0000000000000000000001';
const POOL = '01JC0000000000000000000002';
const OLD_ID = '01JC00000000000000000000A1';
const OTHER_ID = '01JC00000000000000000000B1';

const at = (time: string, date = '2026-11-16') => toInstant(date, time, ZONE);
const H0900 = at('09:00');
const H1000 = at('10:00');
const H1030 = at('10:30');
const H1100 = at('11:00');

const ALICE: Caller = { role: 'user', sub: 'sub-alice' };
const BOB: Caller = { role: 'user', sub: 'sub-bob' };
const ADMIN: Caller = { role: 'admin', sub: 'sub-admin' };

const ac04 = { patternId: 'P1', weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };
const stateAppt = (id: string, start: string, end: string, more: Partial<StateAppointment> = {}): StateAppointment => ({
  appointmentId: id,
  userId: 'sub-alice',
  username: 'alice',
  start,
  end,
  date: start.slice(0, 10),
  typeId: STUDIO,
  status: 'booked',
  ...more,
});
const OLD = stateAppt(OLD_ID, H0900, H1000);
const state = (more: Partial<CalendarState> = {}): CalendarState => ({
  types: [{ typeId: STUDIO }, { typeId: POOL }],
  patterns: [ac04],
  overrides: [],
  oneOffs: [],
  appointments: [OLD],
  ...more,
});
const old = { appointmentId: OLD_ID, userId: 'sub-alice', start: H0900, end: H1000, status: 'booked' as const };

type Request = Partial<Omit<ChangeInput, 'settings'>> & { settings?: Partial<ChangeInput['settings']> };
const change = (start: string, end: string, more: Request = {}) =>
  checkChange({
    appointment: old,
    caller: ALICE,
    start,
    end,
    state: state(),
    now: NOW,
    today: TODAY,
    zone: ZONE,
    ...more,
    settings: { ...DEFAULT_SETTINGS, ...more.settings },
  });
const studio = { window: { start: at('08:00'), end: at('12:00'), typeId: STUDIO } };
const refused = (error: string) => expect.objectContaining({ error });

// Test names: section numbers, R-… rules and AC-… scenarios are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).
describe('checkChange (8.4, R-CHG-01)', () => {
  it('AC-22: alice moves 09:00 to 10:00 the same day: allowed, the window is Studio', () => {
    expect(change(H1000, H1100)).toEqual(studio);
  });

  it('AC-23: 10:00 taken by bob: 409 slot_taken', () => {
    const taken = state({ appointments: [OLD, stateAppt(OTHER_ID, H1000, H1100, { userId: 'sub-bob', username: 'bob' })] });
    expect(change(H1000, H1100, { state: taken })).toEqual({ error: 'slot_taken', message: 'The time is already booked' });
  });

  it('AC-24: the Administrator extends 09:00–10:00 to 09:00–10:30 over its own old time: allowed', () => {
    expect(change(H0900, H1030, { caller: ADMIN })).toEqual(studio);
  });

  it('the old appointment is ignored by id only: another one at the same time still overlaps', () => {
    const twin = stateAppt(OTHER_ID, H0900, H1000, { userId: 'sub-bob' });
    expect(change(H0900, H1030, { caller: ADMIN, state: state({ appointments: [OLD, twin] }) })).toEqual(refused('slot_taken'));
  });

  it('a change to exactly the old times is allowed', () => {
    expect(change(H0900, H1000)).toEqual(studio);
  });

  describe('the old appointment: the cancel rules (R-CAN-01..03)', () => {
    it('the notice applies to the old one: a User at 09:01 the day before is 403, with a change’s wording', () => {
      expect(change(H1000, H1100, { now: LATE_NOW, today: '2026-11-15' })).toEqual({
        error: 'cancellation_notice_too_short',
        message: 'Too late to change this appointment',
      });
    });

    it('the Administrator is exempt from the notice', () => {
      expect(change(H1000, H1100, { caller: ADMIN, now: LATE_NOW, today: '2026-11-15' })).toEqual(studio);
    });

    it('someone else’s appointment is 404 appointment_not_found; no appointment too', () => {
      expect(change(H1000, H1100, { caller: BOB })).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
      expect(change(H1000, H1100, { appointment: null, caller: ADMIN })).toEqual(refused('appointment_not_found'));
    });

    it('a cancelled, an already changed or an ended appointment is 409 appointment_not_active', () => {
      expect(change(H1000, H1100, { appointment: { ...old, status: 'cancelled' } })).toEqual(refused('appointment_not_active'));
      expect(change(H1000, H1100, { caller: ADMIN, now: H1000, today: '2026-11-16' })).toEqual(refused('appointment_not_active'));
    });

    it('the Administrator changes one in progress only to a future start (R-BOOK-03)', () => {
      const during = at('09:30');
      expect(change(H1000, H1100, { caller: ADMIN, now: during, today: '2026-11-16' })).toEqual(studio);
      expect(change(H0900, H1030, { caller: ADMIN, now: during, today: '2026-11-16' })).toEqual(refused('booking_in_past'));
    });
  });

  describe('the new appointment: the booking rules (R-BOOK-03..09)', () => {
    it('booking_notice_too_short: the minimum notice for a User; the Administrator exempt', () => {
      expect(change(H1000, H1100, { settings: { minBookingNoticeHours: 200 } })).toEqual(refused('booking_notice_too_short'));
      expect(change(H1000, H1100, { caller: ADMIN, settings: { minBookingNoticeHours: 200 } })).toEqual(studio);
    });

    it('booking_beyond_horizon: the horizon for a User; the Administrator exempt', () => {
      expect(change(H1000, H1100, { settings: { bookingHorizonDays: 5 } })).toEqual(refused('booking_beyond_horizon'));
      expect(change(H1000, H1100, { caller: ADMIN, settings: { bookingHorizonDays: 5 } })).toEqual(studio);
    });

    it('outside_availability, for both roles', () => {
      expect(change(at('12:00'), at('13:00'))).toEqual(refused('outside_availability'));
      expect(change(at('11:30'), at('12:30'), { caller: ADMIN })).toEqual(refused('outside_availability'));
    });

    it('the new one takes the type of its own window, which may differ from the old one’s', () => {
      const pool = { ...ac04, patternId: 'P2', weekday: 2, typeId: POOL };
      const tuesday = (t: string) => at(t, '2026-11-17');
      expect(change(tuesday('09:00'), tuesday('10:00'), { state: state({ patterns: [ac04, pool] }) })).toEqual({
        window: { start: tuesday('08:00'), end: tuesday('12:00'), typeId: POOL },
      });
    });

    it('the limit does not count the old one: at limit 1 alice moves her only future appointment', () => {
      expect(change(H1000, H1100, { settings: { maxFutureAppointmentsPerUser: 1 } })).toEqual(studio);
    });

    it('the limit still counts her other future appointments', () => {
      const another = stateAppt(OTHER_ID, at('09:00', '2026-11-23'), at('10:00', '2026-11-23'));
      const limited = { state: state({ appointments: [OLD, another] }), settings: { maxFutureAppointmentsPerUser: 1 } };
      expect(change(H1000, H1100, limited)).toEqual(refused('appointment_limit_reached'));
      expect(change(H1000, H1100, { ...limited, caller: ADMIN })).toEqual(studio);
    });

    it('the limit is counted on the old appointment’s User, not on the caller (the Administrator is exempt anyway)', () => {
      const bobs = stateAppt(OTHER_ID, at('09:00', '2026-11-23'), at('10:00', '2026-11-23'), { userId: 'sub-bob' });
      expect(change(H1000, H1100, { state: state({ appointments: [OLD, bobs] }), settings: { maxFutureAppointmentsPerUser: 1 } })).toEqual(studio);
    });
  });

  describe('the order (8.4): the old appointment’s code wins', () => {
    const taken = state({ appointments: [OLD, stateAppt(OTHER_ID, H1000, H1100, { userId: 'sub-bob' })] });

    it('someone else’s appointment and a taken slot: 404, not 409', () => {
      expect(change(H1000, H1100, { caller: BOB, state: taken })).toEqual(refused('appointment_not_found'));
    });

    it('too late on the old one and a taken slot: 403, not 409', () => {
      expect(change(H1000, H1100, { state: taken, now: LATE_NOW, today: '2026-11-15' })).toEqual(refused('cancellation_notice_too_short'));
    });

    it('a cancelled old one outside availability: 409 appointment_not_active, not outside_availability', () => {
      expect(change(at('12:00'), at('13:00'), { appointment: { ...old, status: 'cancelled' } })).toEqual(refused('appointment_not_active'));
    });
  });
});
