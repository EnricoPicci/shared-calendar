import { CALENDAR_LIMITS } from '@shared-calendar/shared';
import { dateText, dateTimeText, failureText, longDateText, offsetChangesOn, offsetText, rangeText, timeText, weekLabel } from '../../../src/logic/texts';
import { useFarBrowserZone } from './zone';

describe('texts', () => {
  useFarBrowserZone();

  describe('dateText', () => {
    it.each([
      ['2026-11-16', 'Mon 16 Nov'],
      ['2026-11-22', 'Sun 22 Nov'],
      ['2027-01-01', 'Fri 1 Jan'],
      ['2028-02-29', 'Tue 29 Feb'],
      ['2026-09-05', 'Sat 5 Sep'],
    ])('%s is "%s", whatever the browser\'s zone', (date, text) => {
      expect(dateText(date)).toBe(text);
    });
  });

  describe('longDateText', () => {
    it.each([
      ['2026-11-20', '20 November 2026'],
      ['2027-01-01', '1 January 2027'],
      ['2028-02-29', '29 February 2028'],
      ['2026-12-31', '31 December 2026'],
    ])('%s is "%s": the day, the whole month and the year, whatever the browser\'s zone', (date, text) => {
      expect(longDateText(date)).toBe(text);
    });
  });

  describe('weekLabel', () => {
    it.each([
      ['2026-11-16', '2026-11-22', '16 Nov – 22 Nov 2026'],
      ['2026-11-30', '2026-12-06', '30 Nov – 6 Dec 2026'],
      ['2026-12-28', '2027-01-03', '28 Dec 2026 – 3 Jan 2027'],
    ])('%s to %s is "%s"', (monday, sunday, label) => {
      expect(weekLabel(monday, sunday)).toBe(label);
    });
  });

  describe('offsetText', () => {
    it.each([
      ['2026-11-16T08:00:00.000Z', 'Europe/Rome', '+01:00'],
      ['2027-07-05T08:00:00.000Z', 'Europe/Rome', '+02:00'],
      ['2026-11-16T08:00:00.000Z', 'Asia/Kolkata', '+05:30'],
      ['2026-11-16T08:00:00.000Z', 'America/St_Johns', '-03:30'],
      ['2027-07-05T08:00:00.000Z', 'America/St_Johns', '-02:30'],
      ['2026-11-16T08:00:00.000Z', 'America/New_York', '-05:00'],
      ['2026-11-16T08:00:00.000Z', 'UTC', '+00:00'],
      ['2026-11-16T08:00:00.000Z', 'Pacific/Kiritimati', '+14:00'],
      // An instant that is not on a whole minute: the offset is still the zone's.
      ['2026-11-10T09:00:42.123Z', 'Europe/Rome', '+01:00'],
      // Either side of the night the clocks go back, and of the one they go forward.
      ['2027-10-31T00:59:00.000Z', 'Europe/Rome', '+02:00'],
      ['2027-10-31T01:00:00.000Z', 'Europe/Rome', '+01:00'],
      ['2027-03-28T00:59:00.000Z', 'Europe/Rome', '+01:00'],
      ['2027-03-28T01:00:00.000Z', 'Europe/Rome', '+02:00'],
    ])('%s in %s is %s', (instant, zone, offset) => {
      expect(offsetText(instant, zone)).toBe(offset);
    });
  });

  describe('timeText', () => {
    it('is the clock of the zone given: Rome in winter and in summer, a half-hour zone', () => {
      expect(timeText('2026-11-16T08:00:00.000Z', 'Europe/Rome')).toBe('09:00');
      expect(timeText('2027-07-05T08:00:00.000Z', 'Europe/Rome')).toBe('10:00');
      expect(timeText('2026-11-16T08:00:00.000Z', 'Asia/Kolkata')).toBe('13:30');
    });

    it('with the offset, tells apart the two 02:00 of the night the clocks go back', () => {
      expect(timeText('2027-10-31T00:00:00.000Z', 'Europe/Rome', true)).toBe('02:00 +02:00');
      expect(timeText('2027-10-31T01:00:00.000Z', 'Europe/Rome', true)).toBe('02:00 +01:00');
    });
  });

  describe('rangeText', () => {
    it('is start–end on the clock of the zone given', () => {
      expect(rangeText('2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z', 'Europe/Rome')).toBe('09:00–10:00');
      expect(rangeText('2026-11-16T03:30:00.000Z', '2026-11-16T04:15:00.000Z', 'Asia/Kolkata')).toBe('09:00–09:45');
    });

    it('an end at midnight of the next day is 24:00; a start at midnight stays 00:00', () => {
      expect(rangeText('2026-11-16T19:00:00.000Z', '2026-11-16T23:00:00.000Z', 'Europe/Rome')).toBe('20:00–24:00');
      expect(rangeText('2026-11-15T23:00:00.000Z', '2026-11-16T00:00:00.000Z', 'Europe/Rome')).toBe('00:00–01:00');
    });

    it('with the offsets, both ends carry theirs', () => {
      expect(rangeText('2027-10-31T00:00:00.000Z', '2027-10-31T01:00:00.000Z', 'Europe/Rome', true)).toBe('02:00 +02:00 – 02:00 +01:00');
      expect(rangeText('2027-10-31T20:00:00.000Z', '2027-10-31T23:00:00.000Z', 'Europe/Rome', true)).toBe('21:00 +01:00 – 24:00 +01:00');
    });
  });

  describe('offsetChangesOn', () => {
    it.each([
      ['2027-10-31', 'Europe/Rome', true], // the clocks go back
      ['2027-03-28', 'Europe/Rome', true], // the clocks go forward
      ['2027-10-30', 'Europe/Rome', false],
      ['2027-11-01', 'Europe/Rome', false],
      ['2027-10-31', 'Asia/Kolkata', false], // a zone without daylight saving time
    ])('%s in %s: %s', (date, zone, changes) => {
      expect(offsetChangesOn(date, zone)).toBe(changes);
    });
  });

  describe('dateTimeText', () => {
    it('is the day and the time on the clock of the zone given, whatever the browser\'s zone', () => {
      expect(dateTimeText('2026-11-23T09:00:00.000Z', 'Europe/Rome')).toBe('Mon 23 Nov, 10:00');
      expect(dateTimeText('2027-07-05T08:00:00.000Z', 'Europe/Rome')).toBe('Mon 5 Jul, 10:00');
      expect(dateTimeText('2026-11-19T12:24:31.412Z', 'Europe/Rome')).toBe('Thu 19 Nov, 13:24');
    });

    it('the day is the one of the zone given: late evening in UTC is the next day in Kolkata', () => {
      expect(dateTimeText('2026-11-22T23:00:00.000Z', 'Europe/Rome')).toBe('Mon 23 Nov, 00:00');
      expect(dateTimeText('2026-11-22T20:00:00.000Z', 'Asia/Kolkata')).toBe('Mon 23 Nov, 01:30');
      expect(dateTimeText('2026-11-22T20:00:00.000Z', 'Europe/Rome')).toBe('Sun 22 Nov, 21:00');
    });

    it('on a day whose offset changes the time carries its offset', () => {
      expect(dateTimeText('2027-10-31T00:00:00.000Z', 'Europe/Rome')).toBe('Sun 31 Oct, 02:00 +02:00');
      expect(dateTimeText('2027-10-31T01:00:00.000Z', 'Europe/Rome')).toBe('Sun 31 Oct, 02:00 +01:00');
      expect(dateTimeText('2027-10-30T01:00:00.000Z', 'Europe/Rome')).toBe('Sat 30 Oct, 03:00');
    });
  });

  describe('failureText', () => {
    const REASONS = [
      'network',
      'server',
      'unexpected',
      'not_signed_in',
      'session_rejected',
      'forbidden',
      'invalid_request',
      'internal_error',
      'invalid_credentials',
      'too_many_attempts',
      'password_reset_required',
      'challenge',
      'no_role',
      // Booking, cancelling and the list of users.
      'invalid_json',
      'slot_taken',
      'booking_in_past',
      'booking_notice_too_short',
      'booking_beyond_horizon',
      'outside_availability',
      'appointment_limit_reached',
      'user_not_found',
      'target_not_user',
      'concurrent_update',
      'appointment_not_found',
      'appointment_not_active',
      'cancellation_notice_too_short',
      // Creating and deleting a user.
      'user_exists',
      'cannot_delete_admin',
      // The availability types and the weekly patterns.
      'type_name_exists',
      'type_in_use',
      'type_not_found',
      'pattern_not_found',
      'availability_overlap',
      'availability_conflict',
      'limit_reached',
    ];

    it.each(REASONS)('%s has a sentence: a capital, a full stop, no code (no underscore) and no technical word', (reason) => {
      const text = failureText(reason);
      expect(text).toMatch(/^[A-Z].*\.$/);
      expect(text).not.toMatch(/_|fetch|TypeError|HTTP|API|JSON|token|\d{3}/);
    });

    it('every reason but "unexpected" has a sentence of its own', () => {
      const own = REASONS.filter((reason) => reason !== 'unexpected').map((reason) => failureText(reason));
      expect(new Set(own).size).toBe(own.length);
      expect(own).not.toContain(failureText('unexpected'));
    });

    it('a reason without a sentence gets the general one, also when it is the name of something every object has', () => {
      const general = 'Something went wrong. Please try again.';
      expect(failureText('no_such_reason')).toBe(general);
      expect(failureText('')).toBe(general);
      expect(failureText('constructor')).toBe(general);
      expect(failureText('unexpected')).toBe(general);
    });

    it('slot_taken says that the calendar has been refreshed', () => {
      expect(failureText('slot_taken')).toBe('This time has just been taken. The calendar has been refreshed: please choose another time.');
    });

    it('a username that exists says so and what to do; an Administrator that cannot be deleted says so', () => {
      expect(failureText('user_exists')).toBe('A user with this username exists already. Choose another username.');
      expect(failureText('cannot_delete_admin')).toBe('An Administrator cannot be deleted.');
    });

    it('the availability: a name that exists, a type or a pattern that is gone, a type in use with what "in use" means, an overlap whatever the type, and the appointments in the way', () => {
      expect(failureText('type_name_exists')).toBe('A type with this name exists already. Choose another name.');
      expect(failureText('type_not_found')).toBe('This type no longer exists.');
      expect(failureText('pattern_not_found')).toBe('This pattern no longer exists.');
      expect(failureText('type_in_use')).toBe('This type is in use, so it cannot be deleted. A type is in use while a weekly pattern, a date of today or later or an upcoming appointment uses it.');
      expect(failureText('availability_overlap')).toBe('Another window of the same day covers part of these hours, whatever its type. Choose other hours.');
      expect(failureText('availability_conflict')).toBe('This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.');
    });

    it('says the same for a wrong password and an unknown user: both are invalid_credentials', () => {
      expect(failureText('invalid_credentials')).toBe('The username or the password is not correct.');
    });
  });
  describe('failureText, after what was attempted', () => {
    it('cancellation_notice_too_short after a change says that it is too late to change', () => {
      expect(failureText('cancellation_notice_too_short', 'change')).toBe('It is too late to change this appointment.');
    });

    it('appointment_limit_reached after a change says that the appointment cannot be moved; after a booking, and with nothing said, it stays as it is', () => {
      const booking = 'You have as many upcoming appointments as the calendar allows. Cancel one to book another.';
      expect(failureText('appointment_limit_reached', 'change')).toBe('You have more upcoming appointments than the calendar now allows, so this one cannot be moved. Cancel one first.');
      expect(failureText('appointment_limit_reached')).toBe(booking);
      expect(failureText('appointment_limit_reached', undefined)).toBe(booking);
    });

    it('without the second argument, after a cancellation, it stays as it is', () => {
      expect(failureText('cancellation_notice_too_short')).toBe('It is too late to cancel this appointment.');
      expect(failureText('cancellation_notice_too_short', undefined)).toBe('It is too late to cancel this appointment.');
    });

    it('invalid_request says to check what was entered, whatever was attempted', () => {
      const sentence = 'The request was not accepted. Check what you entered and try again.';
      expect(failureText('invalid_request')).toBe(sentence);
      expect(failureText('invalid_request', 'change')).toBe(sentence);
      expect(failureText('invalid_request', 'type')).toBe(sentence);
      expect(failureText('invalid_request', 'pattern')).toBe(sentence);
    });

    it('every other reason has the same sentence after a change, an unknown one the general sentence', () => {
      const others = [
        'network', 'server', 'unexpected', 'not_signed_in', 'session_rejected', 'forbidden', 'invalid_request', 'internal_error', 'invalid_json',
        'slot_taken', 'booking_in_past', 'booking_notice_too_short', 'booking_beyond_horizon', 'outside_availability',
        'user_not_found', 'concurrent_update', 'appointment_not_found', 'appointment_not_active', 'user_exists', 'cannot_delete_admin',
        'type_in_use', '', 'constructor',
      ];
      for (const reason of others) expect(failureText(reason, 'change'), reason).toBe(failureText(reason));
    });

    it('the sentences after a change are sentences like the others', () => {
      for (const reason of ['cancellation_notice_too_short', 'appointment_limit_reached']) {
        const text = failureText(reason, 'change');
        expect(text, reason).toMatch(/^[A-Z].*\.$/);
        expect(text, reason).not.toMatch(/_|fetch|TypeError|HTTP|API|JSON|token|\d{3}/);
      }
    });

    it('limit_reached says how many the calendar holds, of what was being created, with the numbers of shared/', () => {
      expect(failureText('limit_reached', 'type')).toBe(`The calendar can hold ${CALENDAR_LIMITS.types} types at most. Delete one to create another.`);
      expect(failureText('limit_reached', 'pattern')).toBe(`The calendar can hold ${CALENDAR_LIMITS.patterns} weekly patterns at most. Delete one to create another.`);
      expect([CALENDAR_LIMITS.types, CALENDAR_LIMITS.patterns]).toEqual([20, 50]);
      expect(failureText('limit_reached', 'type')).toContain(' 20 types ');
      expect(failureText('limit_reached', 'pattern')).toContain(' 50 weekly patterns ');
      // With nothing said of what was attempted, and after a change of an appointment, no number.
      expect(failureText('limit_reached')).toBe('The calendar cannot hold more of these. Delete one to create another.');
      expect(failureText('limit_reached', 'change')).toBe(failureText('limit_reached'));
    });

    it('every other reason has the same sentence whether a type or a pattern was being written; the sentences of a change are not theirs', () => {
      const others = [
        'network', 'server', 'unexpected', 'forbidden', 'invalid_request', 'invalid_json', 'internal_error', 'concurrent_update',
        'type_name_exists', 'type_in_use', 'type_not_found', 'pattern_not_found', 'availability_overlap', 'availability_conflict',
        'cancellation_notice_too_short', 'appointment_limit_reached', '', 'constructor',
      ];
      for (const attempt of ['type', 'pattern'] as const) for (const reason of others) expect(failureText(reason, attempt), `${attempt} ${reason}`).toBe(failureText(reason));
    });
  });
});
