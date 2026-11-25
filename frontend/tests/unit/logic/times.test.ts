import { lastsWholeHours, LocalEndTime, LocalTime, TIME_STEP_MINUTES, WindowBody } from '@shared-calendar/shared';
import { clockOf, endAfter, endFor, LAST_TIME, minuteOfClock, MINUTES, minutesOf, partsOf, startMinutesOf, timeOf, WINDOW_STARTS, windowEnds, windowHours } from '../../../src/logic/times';
import { STUDIO } from './fixtures';
import { useFarBrowserZone } from './zone';

// The pure logic of a time as two lists (docs/FRONTEND_ARCHITECTURE.md section 5.1). The hours
// of the book dialog from a real slot, and what is sent, are in booking.test.ts.

const minute = (time: string) => minuteOfClock(time);
const every = (hours: readonly string[], minutes = minutesOf) => hours.flatMap((hour) => minutes(hour).map((m) => timeOf(hour, m)));
// Every start a form of a window offers, and every end it offers for one start.
const starts = every(WINDOW_STARTS, startMinutesOf);
const endsOf = (start: string) => {
  const { hours, minute } = windowEnds(start);
  return every(hours, () => [minute]);
};

// Test names: S… decisions and F… findings are those of docs/SLOT_STEP_PLAN.md, except in the
// two blocks on a form of a window, whose F… findings are those of docs/WINDOW_HOURS_PLAN.md and
// whose D… decision is one of docs/SHARED_CALENDAR_SPEC.md.
describe('times', () => {
  useFarBrowserZone();

  describe('the minutes', () => {
    it('are every step of the hour of shared/: 00, 05 … 55, twelve of them', () => {
      expect(TIME_STEP_MINUTES).toBe(5);
      expect(MINUTES).toEqual(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
    });

    it('the hour 24 has only 00; every other hour all twelve', () => {
      expect(minutesOf('24')).toEqual(['00']);
      for (const hour of ['00', '09', '23']) expect(minutesOf(hour)).toBe(MINUTES);
    });
  });

  describe('a time taken apart and put together', () => {
    it('gives the hour and the minute, and back the same text', () => {
      for (const time of ['00:00', '09:05', '23:55', '24:00']) {
        const { hour, minute: m } = partsOf(time);
        expect([hour, m, timeOf(hour, m)]).toEqual([time.slice(0, 2), time.slice(3), time]);
      }
    });

    it('a list with nothing chosen gives an empty time', () => {
      expect([timeOf('', '05'), timeOf('09', ''), timeOf('', '')]).toEqual(['', '', '']);
    });

    it('minutes and the clock, both ways, 24:00 included', () => {
      expect([minute('00:00'), minute('09:05'), minute('24:00')]).toEqual([0, 545, 1440]);
      expect([clockOf(0), clockOf(545), clockOf(1440)]).toEqual(['00:00', '09:05', '24:00']);
    });
  });

  describe('the times of a form of a window (D33, F3, F4)', () => {
    it('a start from 00:00 to 23:00: every hour all twelve minutes, the hour 23 only 00', () => {
      expect([WINDOW_STARTS.length, WINDOW_STARTS[0], WINDOW_STARTS.at(-1)]).toEqual([24, '00', '23']);
      expect(startMinutesOf('23')).toEqual(['00']);
      for (const hour of ['00', '09', '22']) expect(startMinutesOf(hour)).toBe(MINUTES);
      expect([starts.length, starts[0], starts[1], starts.at(-2), starts.at(-1)]).toEqual([277, '00:00', '00:05', '22:55', '23:00']);
      expect(LAST_TIME).toBe('24:00');
    });

    it('a start 08:05: the end\'s hours 09 to 23, one minute, 05; 24 is not offered', () => {
      expect(windowEnds('08:05')).toEqual({ hours: ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'], minute: '05' });
    });

    it('a start 08:00: the end\'s hours 09 to 24, the minute 00', () => {
      const { hours, minute } = windowEnds('08:00');
      expect([hours[0], hours.at(-1), hours.length, minute]).toEqual(['09', '24', 16, '00']);
    });

    it('a start 23:00: the hour 24 alone, so the end 24:00; a start 22:30: the hour 23 alone', () => {
      expect([windowEnds('23:00'), windowEnds('22:30')]).toEqual([{ hours: ['24'], minute: '00' }, { hours: ['23'], minute: '30' }]);
    });

    it('every start offered has an end offered, and every end offered for it makes a window the shared schema accepts', () => {
      for (const start of starts) {
        const ends = endsOf(start);
        expect(ends.length, start).toBeGreaterThan(0);
        for (const end of ends) {
          expect(LocalTime.safeParse(start).success && LocalEndTime.safeParse(end).success, `${start}–${end}`).toBe(true);
          if (!WindowBody.safeParse({ start, end, typeId: STUDIO }).success || !lastsWholeHours(start, end)) throw new Error(`${start}–${end}`);
        }
      }
    });
  });

  describe('the end after a start chosen (F4)', () => {
    it('the start\'s hour chosen: one hour later; 08:05 gives 09:05, 23:00 gives 24:00', () => {
      expect([endAfter('08:05', '12:05', 'hour'), endAfter('23:00', '12:05', 'hour')]).toEqual(['09:05', '24:00']);
    });

    it('the start\'s minute changed from 05 to 30: the end keeps its hour and takes the minute, 08:30–11:30', () => {
      expect(endAfter('08:30', '11:05', 'minute')).toBe('11:30');
    });

    it('the start\'s minute changed when the end\'s hour is no longer offered: one hour after the start', () => {
      expect([endAfter('08:05', '24:00', 'minute'), endAfter('08:30', '08:00', 'minute')]).toEqual(['09:05', '09:30']);
    });

    it('every start offered, its hour or its minute chosen from any end offered, gives an end offered for it', () => {
      for (const start of starts) {
        for (const before of ['09:00', '12:05', '24:00']) {
          for (const changed of ['hour', 'minute'] as const) {
            const end = endAfter(start, before, changed);
            if (!endsOf(start).includes(end)) throw new Error(`${start} ${before} ${changed}: ${end}`);
          }
        }
      }
    });
  });

  describe('the hours of the book dialog (F8)', () => {
    it('a window 08:05–12:00: the starts 08 to 11, the ends 08 to 12', () => {
      expect(windowHours(minute('08:05'), minute('12:00'))).toEqual({ starts: ['08', '09', '10', '11'], ends: ['08', '09', '10', '11', '12'] });
    });

    it('a window that ends at 24:00: the ends reach 24, the starts 23', () => {
      const { starts, ends } = windowHours(minute('20:00'), minute('24:00'));
      expect([starts.at(-1), ends.at(-1)]).toEqual(['23', '24']);
    });

    it('a window 10:10–10:50, which holds no slot: the hour 10 for both', () => {
      expect(windowHours(minute('10:10'), minute('10:50'))).toEqual({ starts: ['10'], ends: ['10'] });
    });

    it('a window that ends on a whole hour has no start in that hour', () => {
      expect(windowHours(minute('08:00'), minute('11:00')).starts).toEqual(['08', '09', '10']);
      expect(windowHours(minute('08:00'), minute('11:05')).starts).toEqual(['08', '09', '10', '11']);
    });
  });

  describe('the end a start sets (S1, S3)', () => {
    it('one hour later on the clock', () => {
      for (const [start, end] of [['09:00', '10:00'], ['09:05', '10:05'], ['00:00', '01:00'], ['22:55', '23:55'], ['23:00', '24:00']]) expect(endFor(start!, LAST_TIME), start).toBe(end);
    });

    it('in a form of a window, never past 24:00: 23:30 and 23:55 give 24:00', () => {
      expect([endFor('23:30', LAST_TIME), endFor('23:55', LAST_TIME)]).toEqual(['24:00', '24:00']);
    });

    it('in the book dialog, never past the end of the window: 11:40 in a window that ends at 12:00 gives 12:00, 10:10 gives 11:10', () => {
      expect([endFor('11:40', '12:00'), endFor('10:10', '12:00'), endFor('11:00', '12:00')]).toEqual(['12:00', '11:10', '12:00']);
    });

    it('a start at or after the end of the window, outside it: one hour later, up to 24:00, so the end stays after the start', () => {
      expect([endFor('12:00', '12:00'), endFor('12:30', '12:00'), endFor('23:30', '12:00')]).toEqual(['13:00', '13:30', '24:00']);
    });
  });
});
