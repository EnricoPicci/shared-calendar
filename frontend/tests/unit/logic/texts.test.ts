import { CALENDAR_LIMITS, PASSWORD_PROBLEMS, PASSWORD_SYMBOLS } from '@shared-calendar/shared';
import { dateText, dateTimeText, failureText, longDateText, MAIL_TEXTS, offsetChangesOn, offsetText, PASSWORD_PROBLEM_TEXT, PASSWORD_TEXTS, rangeText, timeText, weekLabel } from '../../../src/logic/texts';
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
      'session_expired',
      'password_refused',
      // Booking, cancelling and the list of users.
      'invalid_json',
      'slot_taken',
      'user_busy',
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

    it('a mail refused before the request names the two dates and the most days; the other reasons of a mail keep their sentence', () => {
      expect(failureText('invalid_request', 'mail')).toBe('Choose two dates, the first not after the second, at most 366 days in all.');
      expect(failureText('mail_unavailable', 'mail')).toBe('E-mail is not available yet.');
      expect(failureText('mail_limit_reached', 'mail')).toBe(failureText('mail_limit_reached'));
    });

    it('slot_taken says that the time is full, for any capacity, and that the calendar has been refreshed', () => {
      expect(failureText('slot_taken')).toBe('This time is full: there is no place left. The calendar has been refreshed: please choose another time.');
    });

    it('user_busy says that the person already has an appointment then, and points to changing it', () => {
      expect(failureText('user_busy')).toBe('You already have an appointment at this time. To move it, change that appointment instead.');
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

    it('the first sign-in: the 3 minutes over lead back to the sign-in; a new password Cognito refused asks for another', () => {
      expect(failureText('session_expired')).toBe('This took too long. Please sign in again.');
      expect(failureText('password_refused')).toBe('This password was not accepted. Please choose another one.');
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
        'slot_taken', 'user_busy', 'booking_in_past', 'booking_notice_too_short', 'booking_beyond_horizon', 'outside_availability',
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

    it('limit_reached after an extra window says how many a day holds, with the number of shared/', () => {
      expect(failureText('limit_reached', 'window')).toBe(`A day can hold ${CALENDAR_LIMITS.oneOffWindowsPerDate} extra windows at most. Delete one to add another.`);
      expect(failureText('limit_reached', 'window')).toContain(' 10 extra windows ');
    });

    it('availability_overlap after the way back to the weekly patterns says what overlaps what; everywhere else it says to choose other hours', () => {
      expect(failureText('availability_overlap', 'patterns-back')).toBe('The hours the weekly patterns give this day overlap one of its extra windows. Delete that extra window first.');
      for (const attempt of [undefined, 'window', 'pattern'] as const) expect(failureText('availability_overlap', attempt), attempt).toBe('Another window of the same day covers part of these hours, whatever its type. Choose other hours.');
    });

    it('every other reason has the same sentence whether an extra window was being added or the weekly patterns brought back', () => {
      const others = ['network', 'server', 'forbidden', 'invalid_request', 'internal_error', 'concurrent_update', 'date_in_past', 'override_not_found', 'window_not_found', 'type_not_found', 'availability_conflict', '', 'constructor'];
      for (const reason of others) {
        expect(failureText(reason, 'window'), reason).toBe(failureText(reason));
        expect(failureText(reason, 'patterns-back'), reason).toBe(failureText(reason));
      }
      expect(failureText('limit_reached', 'patterns-back')).toBe(failureText('limit_reached'));
    });
  });

  describe('failureText, who attempted', () => {
    const USERS = 'You already have an appointment at this time. To move it, change that appointment instead.';
    const ADMINS = 'This User already has an appointment at this time.';

    it('user_busy is about the User booked for: the Administrator reads that the User has an appointment then', () => {
      expect(failureText('user_busy', undefined, 'admin')).toBe(ADMINS);
      expect(failureText('user_busy', 'change', 'admin')).toBe(ADMINS);
    });

    it('a User, and nobody named, read the User\'s sentence', () => {
      expect(failureText('user_busy', undefined, 'user')).toBe(USERS);
      expect(failureText('user_busy', 'change', 'user')).toBe(USERS);
      expect(failureText('user_busy')).toBe(USERS);
    });

    it('what was attempted comes before who attempted', () => {
      expect(failureText('cancellation_notice_too_short', 'change', 'admin')).toBe('It is too late to change this appointment.');
    });

    it('every other reason has the same sentence for the Administrator', () => {
      for (const reason of ['slot_taken', 'booking_in_past', 'outside_availability', 'user_not_found', 'network', '', 'constructor']) {
        expect(failureText(reason, undefined, 'admin'), reason).toBe(failureText(reason));
      }
    });
  });

  describe('failureText, a single date', () => {
    it.each([
      ['date_in_past', 'This date is now in the past, so it can no longer be changed.'],
      ['override_not_found', 'This day no longer has windows of its own: the weekly patterns apply.'],
      ['window_not_found', 'This extra window no longer exists.'],
    ])('%s has a sentence of its own, not the general one', (reason, sentence) => {
      expect(failureText(reason)).toBe(sentence);
      expect(failureText(reason)).not.toBe(failureText('no such reason'));
    });
  });

  describe('the change of one\'s own password', () => {
    it('one sentence per condition of the shared rule, and one for the current password again', () => {
      expect(Object.keys(PASSWORD_PROBLEM_TEXT).sort()).toEqual([...PASSWORD_PROBLEMS, 'same_as_current'].sort());
      expect(PASSWORD_PROBLEM_TEXT).toEqual({
        too_short: 'At least 12 characters.',
        too_long: 'At most 256 characters.',
        no_uppercase: 'An upper-case letter, A to Z.',
        no_lowercase: 'A lower-case letter, a to z.',
        no_digit: 'A digit, 0 to 9.',
        no_symbol: 'One of these symbols: ^ $ * . [ ] { } ( ) ? " ! @ # % & / \\ , > < \' : ; | _ ~ ` = + -',
        blank: 'No space, and no other blank character.',
        same_as_current: 'Not the same as the current password.',
      });
    });

    it('the sentence of a missing symbol lists the 32 symbols, each once', () => {
      const listed = PASSWORD_PROBLEM_TEXT.no_symbol.slice('One of these symbols: '.length).split(' ');
      expect(listed).toEqual([...PASSWORD_SYMBOLS]);
      expect(listed).toHaveLength(32);
    });

    it('every reason of the service but the refused new password has a sentence of its own', () => {
      expect(failureText('wrong_current_password')).toBe('The current password is not correct.');
      expect(failureText('too_many_attempts')).toBe('Too many attempts. Please wait a few minutes and try again.');
      expect(failureText('network')).toBe('The server cannot be reached. Check the connection and try again.');
      expect(failureText('server')).toBe('The server is not answering as it should. Please try again in a moment.');
      expect(failureText('unexpected')).toBe('Something went wrong. Please try again.');
      expect(failureText('not_signed_in')).toBe('You are not signed in. Please sign in again.');
    });

    it('the other words of the screen and of the login', () => {
      expect(PASSWORD_TEXTS).toEqual({
        currentEmpty: 'Type the password you use now.',
        againEmpty: 'Type the new password once more.',
        differ: 'The two new passwords are not the same.',
        changed: 'Password changed.',
      });
    });
  });

  describe('MAIL_TEXTS', () => {
    it('says what the mail holds for each role, and where it goes: the address masked, or in general words', () => {
      expect(MAIL_TEXTS.what.admin).toMatch(/^The whole calendar /);
      expect(MAIL_TEXTS.what.user).toMatch(/^Your appointments /);
      expect(MAIL_TEXTS.sent('alice@example.com')).toBe('On its way to a•••@example.com');
      expect(MAIL_TEXTS.sent(null)).toBe('On its way to your e-mail address');
    });
  });
});
