import { toInstant } from '@shared-calendar/shared';
import { cancellableUntilFor, checkCancel, checkNote, type Caller, type CheckedAppointment } from '../../../src/lib/calendarRules';

// checkCancel (docs/SHARED_CALENDAR_SPEC.md R-CAN-01 to R-CAN-03 and R-PERM-01) and checkNote
// (docs/SHARED_CALENDAR_SPEC.md R-NOTE-01 and R-PERM-01), pure, in the order of
// docs/SHARED_CALENDAR_SPEC.md sections 8.3 and 8.5, on the exact dates of
// docs/SHARED_CALENDAR_SPEC.md section 18.3: Europe/Rome, the appointment 2026-11-16 09:00 local,
// now 2026-11-15T09:00 (docs/SHARED_CALENDAR_SPEC.md AC-20) or 09:01 (docs/SHARED_CALENDAR_SPEC.md
// AC-21) local.

const ZONE = 'Europe/Rome';
const START = toInstant('2026-11-16', '09:00', ZONE); // 08:00Z
const END = toInstant('2026-11-16', '10:00', ZONE);
const AC20_NOW = toInstant('2026-11-15', '09:00', ZONE); // exactly 24 h before
const AC21_NOW = toInstant('2026-11-15', '09:01', ZONE);
const NOTICE = { cancellationNoticeHours: 24 };

const ALICE: Caller = { role: 'user', sub: 'sub-alice' };
const BOB: Caller = { role: 'user', sub: 'sub-bob' };
const ADMIN: Caller = { role: 'admin', sub: 'sub-admin' };
const appt = (more: Partial<CheckedAppointment> = {}): CheckedAppointment => ({ userId: 'sub-alice', start: START, end: END, status: 'booked', ...more });
const at = (date: string, time: string) => toInstant(date, time, ZONE);

// Test names: section numbers, R-… rules and AC-… scenarios are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).
describe('checkCancel', () => {
  it('pins the instants of 18.3 (Rome is UTC+1 in November)', () => {
    expect([START, AC20_NOW, AC21_NOW]).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-15T08:00:00.000Z', '2026-11-15T08:01:00.000Z']);
  });

  it('AC-20: alice cancels exactly 24 h before: allowed (≥)', () => {
    expect(checkCancel(appt(), ALICE, NOTICE, AC20_NOW)).toBeNull();
  });

  it('AC-21: one minute later alice is refused 403 cancellation_notice_too_short; the Administrator may', () => {
    expect(checkCancel(appt(), ALICE, NOTICE, AC21_NOW)).toEqual({ error: 'cancellation_notice_too_short', message: 'Too late to cancel this appointment' });
    expect(checkCancel(appt(), ADMIN, NOTICE, AC21_NOW)).toBeNull();
  });

  it('compares to the millisecond: one millisecond past start − notice is refused', () => {
    expect(checkCancel(appt(), ALICE, NOTICE, '2026-11-15T08:00:00.001Z')).toMatchObject({ error: 'cancellation_notice_too_short' });
    expect(checkCancel(appt(), ALICE, NOTICE, '2026-11-15T07:59:59.999Z')).toBeNull();
  });

  it('the notice comes from the settings: 0 h lets a User cancel until the start itself', () => {
    expect(checkCancel(appt(), ALICE, { cancellationNoticeHours: 0 }, START)).toBeNull();
    expect(checkCancel(appt(), ALICE, { cancellationNoticeHours: 0 }, '2026-11-16T08:00:00.001Z')).toMatchObject({ error: 'cancellation_notice_too_short' });
    // 720 real hours across the end of summer time: 10:00 local on 2026-10-17 (UTC+2), not 09:00,
    // because notice counts real hours (docs/SHARED_CALENDAR_SPEC.md section 22, assumption A2).
    expect(checkCancel(appt(), ALICE, { cancellationNoticeHours: 720 }, at('2026-10-17', '10:00'))).toBeNull();
    expect(checkCancel(appt(), ALICE, { cancellationNoticeHours: 720 }, at('2026-10-17', '10:01'))).toMatchObject({ error: 'cancellation_notice_too_short' });
  });

  it('R-CAN-01: no appointment is 404 appointment_not_found, for both roles', () => {
    for (const caller of [ALICE, ADMIN]) {
      expect(checkCancel(null, caller, NOTICE, AC20_NOW)).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
    }
  });

  it('AC-30 / R-PERM-01: bob cancelling alice’s appointment is 404, not 403; ownership is the sub', () => {
    expect(checkCancel(appt(), BOB, NOTICE, AC20_NOW)).toMatchObject({ error: 'appointment_not_found' });
  });

  it('R-CAN-02: a cancelled appointment is 409 appointment_not_active, for both roles', () => {
    for (const caller of [ALICE, ADMIN]) {
      expect(checkCancel(appt({ status: 'cancelled' }), caller, NOTICE, AC20_NOW)).toEqual({
        error: 'appointment_not_active',
        message: 'The appointment is cancelled or has ended',
      });
    }
  });

  it('AC-31: an ended appointment (end ≤ now) is 409 appointment_not_active, also for the Administrator', () => {
    expect(checkCancel(appt(), ADMIN, NOTICE, END)).toMatchObject({ error: 'appointment_not_active' });
    expect(checkCancel(appt(), ADMIN, NOTICE, at('2026-11-17', '09:00'))).toMatchObject({ error: 'appointment_not_active' });
  });

  it('in progress (start ≤ now < end): the Administrator cancels; a User is refused by R-CAN-03, not R-CAN-02', () => {
    const during = at('2026-11-16', '09:30');
    expect(checkCancel(appt(), ADMIN, NOTICE, during)).toBeNull();
    expect(checkCancel(appt(), ALICE, NOTICE, during)).toMatchObject({ error: 'cancellation_notice_too_short' });
    expect(checkCancel(appt(), ADMIN, NOTICE, '2026-11-16T08:59:59.999Z')).toBeNull();
  });

  describe('the order: a request that breaks two rules gets the earlier one’s code', () => {
    it('someone else’s cancelled or ended appointment is 404, never telling its status', () => {
      expect(checkCancel(appt({ status: 'cancelled' }), BOB, NOTICE, AC20_NOW)).toMatchObject({ error: 'appointment_not_found' });
      expect(checkCancel(appt(), BOB, NOTICE, at('2026-11-17', '09:00'))).toMatchObject({ error: 'appointment_not_found' });
    });

    it('a cancelled or ended appointment past the notice is 409, not 403', () => {
      expect(checkCancel(appt({ status: 'cancelled' }), ALICE, NOTICE, AC21_NOW)).toMatchObject({ error: 'appointment_not_active' });
      expect(checkCancel(appt(), ALICE, NOTICE, at('2026-11-17', '09:00'))).toMatchObject({ error: 'appointment_not_active' });
    });
  });
});

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('checkNote', () => {
  const noted = (more: Partial<CheckedAppointment & { note: string | null }> = {}) => ({ ...appt(), note: 'old', ...more });

  it('R-NOTE-01: the owner and the Administrator may edit an active appointment; no notice applies', () => {
    expect(checkNote(noted(), 'new', ALICE, AC21_NOW)).toEqual({ unchanged: false });
    expect(checkNote(noted(), 'new', ADMIN, AC21_NOW)).toEqual({ unchanged: false });
    // In progress: still active and not ended.
    expect(checkNote(noted(), 'new', ALICE, at('2026-11-16', '09:30'))).toEqual({ unchanged: false });
  });

  it('a note equal to the stored one is unchanged (null too)', () => {
    expect(checkNote(noted(), 'old', ALICE, AC20_NOW)).toEqual({ unchanged: true });
    expect(checkNote(noted({ note: null }), null, ALICE, AC20_NOW)).toEqual({ unchanged: true });
    expect(checkNote(noted(), null, ALICE, AC20_NOW)).toEqual({ unchanged: false });
  });

  it('no appointment, or someone else’s, is 404 appointment_not_found (R-PERM-01)', () => {
    expect(checkNote(null, 'x', ADMIN, AC20_NOW)).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
    expect(checkNote(noted(), 'x', BOB, AC20_NOW)).toMatchObject({ error: 'appointment_not_found' });
  });

  it('a cancelled or ended appointment is 409 appointment_not_active, for both roles', () => {
    for (const caller of [ALICE, ADMIN]) {
      expect(checkNote(noted({ status: 'cancelled' }), 'x', caller, AC20_NOW)).toMatchObject({ error: 'appointment_not_active' });
      expect(checkNote(noted(), 'x', caller, END)).toMatchObject({ error: 'appointment_not_active' });
    }
  });

  it('the order: someone else’s ended appointment is 404; an unchanged note on an ended one is still 409', () => {
    expect(checkNote(noted(), 'x', BOB, END)).toMatchObject({ error: 'appointment_not_found' });
    expect(checkNote(noted(), 'old', ALICE, END)).toMatchObject({ error: 'appointment_not_active' });
  });
});

// Test names: section numbers are those of docs/SHARED_CALENDAR_SPEC.md.
describe('cancellableUntilFor (8.1, 11.5)', () => {
  it('a User on a booked appointment: start − notice, also once that moment has passed', () => {
    expect(cancellableUntilFor({ start: START, status: 'booked' }, 'user', NOTICE)).toBe('2026-11-15T08:00:00.000Z');
  });

  it('null on a cancelled appointment, and in every answer to the Administrator', () => {
    expect(cancellableUntilFor({ start: START, status: 'cancelled' }, 'user', NOTICE)).toBeNull();
    expect(cancellableUntilFor({ start: START, status: 'booked' }, 'admin', NOTICE)).toBeNull();
  });
});
