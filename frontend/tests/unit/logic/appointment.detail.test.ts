import { appointmentDetail } from '../../../src/logic/appointment.detail';
import { appointment } from './fixtures';
import { useFarBrowserZone } from './zone';

const z = (instant: string) => `${instant}:00.000Z`;
const at = (instant: string) => new Date(instant);

// Monday 23 November 2026, 10:00–11:00 in Rome, booked by alice herself on Thursday 19 at 13:24;
// with the default notice of 24 hours she may cancel until Sunday 22 at 10:00.
const ALICES = appointment({
  appointmentId: '01M6DMQ0000000000000000001',
  start: z('2026-11-23T09:00'),
  end: z('2026-11-23T10:00'),
  date: '2026-11-23',
  note: 'First lesson',
  createdAt: '2026-11-19T12:24:31.412Z',
  cancellableUntil: z('2026-11-22T09:00'),
});
// The same appointment as the Administrator receives it: no cancellableUntil.
const FOR_ADMIN = { ...ALICES, cancellableUntil: null };
const BEFORE = at('2026-11-20T08:00:00.000Z');

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('appointmentDetail', () => {
  useFarBrowserZone();

  describe('the fields', () => {
    it('a User: when, the type, "You", the note, who booked it and when', () => {
      expect(appointmentDetail(ALICES, 'user', BEFORE, 'Europe/Rome')).toEqual({
        appointmentId: '01M6DMQ0000000000000000001',
        when: 'Mon 23 Nov, 10:00–11:00',
        typeName: 'Studio',
        who: 'You',
        note: 'First lesson',
        booked: 'Booked by you on Thu 19 Nov, 13:24',
        canCancel: true,
        hint: 'It can be cancelled until Sun 22 Nov, 10:00.',
      });
    });

    it('the Administrator: the User\'s name, who booked it by name, and no sentence while it can be cancelled', () => {
      expect(appointmentDetail(FOR_ADMIN, 'admin', BEFORE, 'Europe/Rome')).toEqual({
        appointmentId: '01M6DMQ0000000000000000001',
        when: 'Mon 23 Nov, 10:00–11:00',
        typeName: 'Studio',
        who: 'alice',
        note: 'First lesson',
        booked: 'Booked by alice on Thu 19 Nov, 13:24',
        canCancel: true,
        hint: '',
      });
    });

    it('an appointment without a note shows a dash', () => {
      expect(appointmentDetail({ ...ALICES, note: null }, 'user', BEFORE, 'Europe/Rome').note).toBe('—');
      expect(appointmentDetail({ ...FOR_ADMIN, note: null }, 'admin', BEFORE, 'Europe/Rome').note).toBe('—');
    });

    it('one booked by the Administrator for a User says so to both', () => {
      const byAdmin = { createdBy: { username: 'admin', role: 'admin' as const } };
      expect(appointmentDetail({ ...ALICES, ...byAdmin }, 'user', BEFORE, 'Europe/Rome')).toMatchObject({ who: 'You', booked: 'Booked by admin on Thu 19 Nov, 13:24' });
      expect(appointmentDetail({ ...FOR_ADMIN, ...byAdmin }, 'admin', BEFORE, 'Europe/Rome')).toMatchObject({ who: 'alice', booked: 'Booked by admin on Thu 19 Nov, 13:24' });
    });

    it('the texts are in the calendar\'s zone, not the browser\'s: the same appointment in Kolkata', () => {
      const detail = appointmentDetail(ALICES, 'user', BEFORE, 'Asia/Kolkata');
      expect(detail.when).toBe('Mon 23 Nov, 14:30–15:30');
      expect(detail.booked).toBe('Booked by you on Thu 19 Nov, 17:54');
      expect(detail.hint).toBe('It can be cancelled until Sun 22 Nov, 14:30.');
    });

    it('a custom length and a summer date', () => {
      const summer = appointment({ start: z('2027-07-05T08:15'), end: z('2027-07-05T08:45'), date: '2027-07-05', createdAt: z('2027-07-01T07:05') });
      expect(appointmentDetail(summer, 'admin', at(z('2027-07-02T08:00')), 'Europe/Rome')).toMatchObject({
        when: 'Mon 5 Jul, 10:15–10:45',
        booked: 'Booked by alice on Thu 1 Jul, 09:05',
      });
    });

    it('on the night the clocks go back the times carry their offsets', () => {
      const second = appointment({ start: z('2027-10-31T01:00'), end: z('2027-10-31T02:00'), date: '2027-10-31', cancellableUntil: z('2027-10-30T01:00') });
      const detail = appointmentDetail(second, 'user', at(z('2027-10-20T08:00')), 'Europe/Rome');
      expect(detail.when).toBe('Sun 31 Oct, 02:00 +01:00 – 03:00 +01:00');
      expect(detail.hint).toBe('It can be cancelled until Sat 30 Oct, 03:00.');
    });
  });

  describe('"Cancel appointment" for a User (R-CAN-03)', () => {
    it('exactly at cancellableUntil it is still offered', () => {
      expect(appointmentDetail(ALICES, 'user', at('2026-11-22T09:00:00.000Z'), 'Europe/Rome')).toMatchObject({
        canCancel: true,
        hint: 'It can be cancelled until Sun 22 Nov, 10:00.',
      });
    });

    it('one millisecond later it is not, and the sentence says it is too late', () => {
      expect(appointmentDetail(ALICES, 'user', at('2026-11-22T09:00:00.001Z'), 'Europe/Rome')).toMatchObject({
        canCancel: false,
        hint: 'It is too late to cancel this appointment.',
      });
    });

    it('in progress or ended, it is too late', () => {
      for (const now of ['2026-11-23T09:30:00.000Z', '2026-11-23T10:00:00.000Z', '2026-12-01T10:00:00.000Z']) {
        expect(appointmentDetail(ALICES, 'user', at(now), 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'It is too late to cancel this appointment.' });
      }
    });

    it('without a cancellableUntil nothing is offered', () => {
      expect(appointmentDetail(FOR_ADMIN, 'user', BEFORE, 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'It is too late to cancel this appointment.' });
    });
  });

  describe('"Cancel appointment" for the Administrator (R-CAN-02)', () => {
    it('is offered inside the User\'s notice and while the appointment is in progress', () => {
      for (const now of ['2026-11-22T09:00:00.001Z', '2026-11-23T08:59:00.000Z', '2026-11-23T09:30:00.000Z', '2026-11-23T09:59:59.999Z']) {
        expect(appointmentDetail(FOR_ADMIN, 'admin', at(now), 'Europe/Rome')).toMatchObject({ canCancel: true, hint: '' });
      }
    });

    it('is not once it has ended: at its end and after', () => {
      for (const now of ['2026-11-23T10:00:00.000Z', '2026-11-24T10:00:00.000Z']) {
        expect(appointmentDetail(FOR_ADMIN, 'admin', at(now), 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'This appointment has ended.' });
      }
    });
  });

  it('a cancelled appointment is never offered for cancelling, to either role', () => {
    const cancelled = { ...ALICES, status: 'cancelled' as const };
    expect(appointmentDetail(cancelled, 'user', BEFORE, 'Europe/Rome').canCancel).toBe(false);
    expect(appointmentDetail(cancelled, 'admin', BEFORE, 'Europe/Rome').canCancel).toBe(false);
  });
});
