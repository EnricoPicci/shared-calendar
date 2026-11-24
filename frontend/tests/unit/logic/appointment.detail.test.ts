import { appointmentDetail, movingOf } from '../../../src/logic/appointment.detail';
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
        noteValue: 'First lesson',
        booked: 'Booked by you on Thu 19 Nov, 13:24',
        canEditNote: true,
        canChange: true,
        canCancel: true,
        hint: 'It can be changed or cancelled until Sun 22 Nov, 10:00.',
      });
    });

    it('the Administrator: the User\'s name, who booked it by name, and no sentence while it can be cancelled', () => {
      expect(appointmentDetail(FOR_ADMIN, 'admin', BEFORE, 'Europe/Rome')).toEqual({
        appointmentId: '01M6DMQ0000000000000000001',
        when: 'Mon 23 Nov, 10:00–11:00',
        typeName: 'Studio',
        who: 'alice',
        note: 'First lesson',
        noteValue: 'First lesson',
        booked: 'Booked by alice on Thu 19 Nov, 13:24',
        canEditNote: true,
        canChange: true,
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
      expect(detail.hint).toBe('It can be changed or cancelled until Sun 22 Nov, 14:30.');
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
      expect(detail.hint).toBe('It can be changed or cancelled until Sat 30 Oct, 03:00.');
    });
  });

  describe('"Cancel appointment" for a User (R-CAN-03)', () => {
    it('exactly at cancellableUntil it is still offered', () => {
      expect(appointmentDetail(ALICES, 'user', at('2026-11-22T09:00:00.000Z'), 'Europe/Rome')).toMatchObject({
        canCancel: true,
        hint: 'It can be changed or cancelled until Sun 22 Nov, 10:00.',
      });
    });

    it('one millisecond later it is not, and the sentence says it is too late', () => {
      expect(appointmentDetail(ALICES, 'user', at('2026-11-22T09:00:00.001Z'), 'Europe/Rome')).toMatchObject({
        canCancel: false,
        hint: 'It is too late to change or cancel this appointment.',
      });
    });

    it('in progress, it is too late; ended, at its end and after, the sentence says that it has ended', () => {
      expect(appointmentDetail(ALICES, 'user', at('2026-11-23T09:30:00.000Z'), 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'It is too late to change or cancel this appointment.' });
      expect(appointmentDetail(ALICES, 'user', at('2026-11-23T09:59:59.999Z'), 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'It is too late to change or cancel this appointment.' });
      for (const now of ['2026-11-23T10:00:00.000Z', '2026-12-01T10:00:00.000Z']) {
        expect(appointmentDetail(ALICES, 'user', at(now), 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'This appointment has ended.' });
      }
    });

    it('without a cancellableUntil nothing is offered', () => {
      expect(appointmentDetail(FOR_ADMIN, 'user', BEFORE, 'Europe/Rome')).toMatchObject({ canCancel: false, hint: 'It is too late to change or cancel this appointment.' });
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
  describe('the note (R-NOTE-01)', () => {
    it('with a note: the text to read and the value of the field are the note', () => {
      expect(appointmentDetail(ALICES, 'user', BEFORE, 'Europe/Rome')).toMatchObject({ note: 'First lesson', noteValue: 'First lesson' });
    });

    it('without a note: a dash to read, an empty value for the field', () => {
      for (const [one, role] of [[ALICES, 'user'], [FOR_ADMIN, 'admin']] as const) {
        expect(appointmentDetail({ ...one, note: null }, role, BEFORE, 'Europe/Rome')).toMatchObject({ note: '—', noteValue: '', canEditNote: true });
      }
    });

    it('a note with markup or line feeds is handed over as it is', () => {
      const note = '<b>bold</b>\nsecond line';
      expect(appointmentDetail({ ...ALICES, note }, 'user', BEFORE, 'Europe/Rome')).toMatchObject({ note, noteValue: note });
    });

    it('can be edited by both roles until the appointment ends: no notice applies', () => {
      for (const now of ['2026-11-20T08:00:00.000Z', '2026-11-22T09:00:00.001Z', '2026-11-23T09:30:00.000Z', '2026-11-23T09:59:59.999Z']) {
        expect(appointmentDetail(ALICES, 'user', at(now), 'Europe/Rome').canEditNote, now).toBe(true);
        expect(appointmentDetail(FOR_ADMIN, 'admin', at(now), 'Europe/Rome').canEditNote, now).toBe(true);
      }
    });

    it('cannot once the appointment has ended: at its end and after', () => {
      for (const now of ['2026-11-23T10:00:00.000Z', '2026-12-01T10:00:00.000Z']) {
        expect(appointmentDetail(ALICES, 'user', at(now), 'Europe/Rome').canEditNote, now).toBe(false);
        expect(appointmentDetail(FOR_ADMIN, 'admin', at(now), 'Europe/Rome').canEditNote, now).toBe(false);
      }
    });
  });

  describe('the three actions together', () => {
    const offered = (one: typeof ALICES, role: 'admin' | 'user', now: string) => {
      const { canEditNote, canChange, canCancel, hint } = appointmentDetail(one, role, at(now), 'Europe/Rome');
      return { canEditNote, canChange, canCancel, hint };
    };
    const UNTIL = 'It can be changed or cancelled until Sun 22 Nov, 10:00.';
    const TOO_LATE = 'It is too late to change or cancel this appointment.';
    const ENDED = 'This appointment has ended.';

    it('a User, exactly at cancellableUntil: all three (R-CAN-03, R-CHG-01)', () => {
      expect(offered(ALICES, 'user', '2026-11-22T09:00:00.000Z')).toEqual({ canEditNote: true, canChange: true, canCancel: true, hint: UNTIL });
    });

    it('a User, one millisecond later: the note only, and the sentence adds nothing about the note', () => {
      expect(offered(ALICES, 'user', '2026-11-22T09:00:00.001Z')).toEqual({ canEditNote: true, canChange: false, canCancel: false, hint: TOO_LATE });
    });

    it('an appointment in progress: the Administrator may change and cancel, both may edit the note', () => {
      const now = '2026-11-23T09:30:00.000Z';
      expect(offered(FOR_ADMIN, 'admin', now)).toEqual({ canEditNote: true, canChange: true, canCancel: true, hint: '' });
      expect(offered(ALICES, 'user', now)).toEqual({ canEditNote: true, canChange: false, canCancel: false, hint: TOO_LATE });
    });

    it('the Administrator inside the User\'s notice: all three, and no sentence', () => {
      expect(offered(FOR_ADMIN, 'admin', '2026-11-23T08:59:00.000Z')).toEqual({ canEditNote: true, canChange: true, canCancel: true, hint: '' });
    });

    it('an appointment that has ended: nothing, for either role', () => {
      for (const now of ['2026-11-23T10:00:00.000Z', '2026-11-24T10:00:00.000Z']) {
        expect(offered(FOR_ADMIN, 'admin', now)).toEqual({ canEditNote: false, canChange: false, canCancel: false, hint: ENDED });
        expect(offered(ALICES, 'user', now)).toEqual({ canEditNote: false, canChange: false, canCancel: false, hint: ENDED });
      }
    });

    it('a cancelled appointment: nothing, for either role, also before its time', () => {
      const cancelled = { status: 'cancelled' as const, cancellableUntil: null };
      expect(offered({ ...ALICES, ...cancelled }, 'user', '2026-11-20T08:00:00.000Z')).toMatchObject({ canEditNote: false, canChange: false, canCancel: false });
      expect(offered({ ...FOR_ADMIN, ...cancelled }, 'admin', '2026-11-20T08:00:00.000Z')).toMatchObject({ canEditNote: false, canChange: false, canCancel: false });
      // Even if a cancelled one still carried the instant, nothing would be offered.
      expect(offered({ ...ALICES, status: 'cancelled' }, 'user', '2026-11-20T08:00:00.000Z')).toMatchObject({ canChange: false, canCancel: false });
    });

    it('a cancelled appointment says that it was cancelled, to both roles, before its time and after it', () => {
      const cancelled = { status: 'cancelled' as const, cancelReason: 'cancelled' as const, cancellableUntil: null };
      for (const now of ['2026-11-20T08:00:00.000Z', '2026-11-23T09:30:00.000Z', '2026-12-01T10:00:00.000Z']) {
        expect(offered({ ...ALICES, ...cancelled }, 'user', now)).toEqual({ canEditNote: false, canChange: false, canCancel: false, hint: 'This appointment was cancelled.' });
        expect(offered({ ...FOR_ADMIN, ...cancelled }, 'admin', now)).toEqual({ canEditNote: false, canChange: false, canCancel: false, hint: 'This appointment was cancelled.' });
      }
    });

    it('one cancelled by a change says that it was moved, to both roles', () => {
      const changed = { status: 'cancelled' as const, cancelReason: 'changed' as const, cancellableUntil: null, replacedBy: '01M6DMQ0000000000000000002' };
      for (const now of ['2026-11-20T08:00:00.000Z', '2026-12-01T10:00:00.000Z']) {
        expect(offered({ ...ALICES, ...changed }, 'user', now)).toEqual({ canEditNote: false, canChange: false, canCancel: false, hint: 'This appointment was moved to another time.' });
        expect(offered({ ...FOR_ADMIN, ...changed }, 'admin', now)).toEqual({ canEditNote: false, canChange: false, canCancel: false, hint: 'This appointment was moved to another time.' });
      }
    });

    it('one cancelled because its User was deleted, or with no reason given, was cancelled', () => {
      for (const cancelReason of ['user_deleted', null] as const) {
        expect(offered({ ...FOR_ADMIN, status: 'cancelled', cancelReason }, 'admin', '2026-11-20T08:00:00.000Z').hint).toBe('This appointment was cancelled.');
      }
    });

    it('"Change" is offered exactly when "Cancel appointment" is', () => {
      for (const now of ['2026-11-20T08:00:00.000Z', '2026-11-22T09:00:00.000Z', '2026-11-22T09:00:00.001Z', '2026-11-23T09:30:00.000Z', '2026-11-23T10:00:00.000Z']) {
        for (const [one, role] of [[ALICES, 'user'], [FOR_ADMIN, 'admin']] as const) {
          const detail = appointmentDetail(one, role, at(now), 'Europe/Rome');
          expect(detail.canChange, `${role} ${now}`).toBe(detail.canCancel);
        }
      }
    });
  });

  describe('movingOf: the appointment as the banner and the confirmation name it', () => {
    it('a User: the time it is moved from, the time with the type, the note', () => {
      expect(movingOf(appointmentDetail(ALICES, 'user', BEFORE, 'Europe/Rome'), 'user')).toEqual({
        appointmentId: '01M6DMQ0000000000000000001',
        when: 'Mon 23 Nov, 10:00–11:00',
        what: 'Mon 23 Nov, 10:00–11:00 · Studio',
        who: 'You',
        note: 'First lesson',
      });
    });

    it('the Administrator: the same, with the User\'s name, which also says whose time the move is', () => {
      expect(movingOf(appointmentDetail(FOR_ADMIN, 'admin', BEFORE, 'Europe/Rome'), 'admin')).toEqual({
        appointmentId: '01M6DMQ0000000000000000001',
        when: 'Mon 23 Nov, 10:00–11:00',
        what: 'Mon 23 Nov, 10:00–11:00 · Studio · alice',
        who: 'alice',
        note: 'First lesson',
      });
    });

    it('without a note the field\'s value is empty, not a dash; the texts are in the calendar\'s zone', () => {
      const moving = movingOf(appointmentDetail({ ...ALICES, note: null }, 'user', BEFORE, 'Asia/Kolkata'), 'user');
      expect(moving).toMatchObject({ when: 'Mon 23 Nov, 14:30–15:30', what: 'Mon 23 Nov, 14:30–15:30 · Studio', note: '' });
    });
  });
});
