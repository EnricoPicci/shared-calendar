import { LocalEndTime, LocalTime, TIME_STEP_MINUTES, WindowBody } from '@shared-calendar/shared';
import { clockOf, endFor, LAST_TIME, minuteOfClock, MINUTES, minutesOf, partsOf, timeOf, WINDOW_HOURS, windowHours } from '../../../src/logic/times';
import { STUDIO } from './fixtures';
import { useFarBrowserZone } from './zone';

// The pure logic of a time as two lists (docs/FRONTEND_ARCHITECTURE.md section 5.1). The hours
// of the book dialog from a real slot, and what is sent, are in booking.test.ts.

const minute = (time: string) => minuteOfClock(time);
const every = (hours: readonly string[]) => hours.flatMap((hour) => minutesOf(hour).map((m) => timeOf(hour, m)));

// Test names: S… decisions and F… findings are those of docs/SLOT_STEP_PLAN.md.
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

  describe('the hours of a form of a window', () => {
    it('a start from 00 to 23, an end from 00 to 24; with their minutes, 00:00 to 23:55 and 00:00 to 24:00', () => {
      expect([WINDOW_HOURS.starts.length, WINDOW_HOURS.starts[0], WINDOW_HOURS.starts.at(-1)]).toEqual([24, '00', '23']);
      expect([WINDOW_HOURS.ends.length, WINDOW_HOURS.ends[0], WINDOW_HOURS.ends.at(-1)]).toEqual([25, '00', '24']);
      const starts = every(WINDOW_HOURS.starts);
      const ends = every(WINDOW_HOURS.ends);
      expect([starts.length, starts[0], starts[1], starts.at(-1)]).toEqual([288, '00:00', '00:05', '23:55']);
      expect([ends.length, ends.at(-2), ends.at(-1)]).toEqual([289, '23:55', '24:00']);
      expect(LAST_TIME).toBe('24:00');
    });

    it('every time the lists can hold is on the step: the shared schemas accept each one', () => {
      for (const start of every(WINDOW_HOURS.starts)) expect(LocalTime.safeParse(start).success, start).toBe(true);
      for (const end of every(WINDOW_HOURS.ends)) expect(LocalEndTime.safeParse(end).success, end).toBe(true);
    });

    it('every pair is a window the shared schema accepts, or refuses for the order of the two times alone', () => {
      const starts = every(WINDOW_HOURS.starts);
      const ends = every(WINDOW_HOURS.ends);
      for (const start of starts) {
        for (const end of ends) {
          const parsed = WindowBody.safeParse({ start, end, typeId: STUDIO });
          if (parsed.success !== end > start) throw new Error(`${start}–${end}: ${String(parsed.success)}`);
          if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.path.join('.'))).toEqual(['end']);
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

    it('every start of a form of a window gives an end the end\'s lists hold, after the start', () => {
      const ends = every(WINDOW_HOURS.ends);
      for (const start of every(WINDOW_HOURS.starts)) {
        const end = endFor(start, LAST_TIME);
        expect(ends.includes(end) && end > start, `${start}–${end}`).toBe(true);
      }
    });
  });
});
