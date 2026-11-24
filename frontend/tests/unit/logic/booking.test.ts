import { BookBody, ChangeBody } from '@shared-calendar/shared';
import { bookingFor, bookingText, changeFor, timeChoice, userChoice, type BookingFields } from '../../../src/logic/booking';
import { weekModel } from '../../../src/logic/week.model';
import type { SlotBlock } from '../../../src/logic/week.model';
import { STUDIO, view } from './fixtures';
import { useFarBrowserZone } from './zone';

const z = (instant: string) => `${instant}:00.000Z`;

// A slot as the week model makes it: one day with one Studio window and one free slot in it,
// all given as instants.
function slotOf(date: string, window: [string, string], slot: [string, string], zone = 'Europe/Rome'): SlotBlock {
  const monday = new Date(Date.parse(`${date}T00:00:00Z`));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const week = view(monday.toISOString().slice(0, 10), { timeZone: zone }, [
    {
      date,
      windows: [{ start: z(window[0]), end: z(window[1]), typeId: STUDIO, typeName: 'Studio' }],
      slots: [{ start: z(slot[0]), end: z(slot[1]), typeId: STUDIO, capacity: 1, placesLeft: 1 }],
    },
  ]);
  return weekModel(week, 'admin').days.find((day) => day.date === date)!.slots[0]!;
}

// Monday 23 November 2026 in Rome (UTC+1): a window 08:30–12:00, the slot 10:00–11:00.
const winter = () => slotOf('2026-11-23', ['2026-11-23T07:30', '2026-11-23T11:00'], ['2026-11-23T09:00', '2026-11-23T10:00']);
const fields = (over: Partial<BookingFields> = {}): BookingFields => ({ note: '', username: '', start: '', end: '', ...over });
// What the Administrator's dialog holds when nothing was touched.
const untouched = (slot: SlotBlock, zone = 'Europe/Rome', over: Partial<BookingFields> = {}): BookingFields => {
  const { start, end } = timeChoice(slot, zone);
  return fields({ username: 'alice', start, end, ...over });
};

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('booking', () => {
  useFarBrowserZone();

  describe('bookingText', () => {
    it('says the day, the time and the type', () => {
      expect(bookingText(winter())).toBe('Mon 23 Nov, 10:00–11:00 · Studio');
    });

    it('on the night the clocks go back, the time carries its offsets as the week does', () => {
      const second = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T01:00', '2027-10-31T02:00']);
      expect(bookingText(second)).toBe('Sun 31 Oct, 02:00 +01:00 – 03:00 +01:00 · Studio');
    });
  });

  describe('timeChoice', () => {
    const quarters = (from: string, count: number) => {
      const start = Number(from.slice(0, 2)) * 60 + Number(from.slice(3));
      return Array.from({ length: count }, (_, i) => `${String(Math.floor((start + i * 15) / 60)).padStart(2, '0')}:${String((start + i * 15) % 60).padStart(2, '0')}`);
    };

    it('a window 08:30–12:00: the starts 08:30 to 11:45, the ends 08:45 to 12:00, set to the slot\'s own', () => {
      const choice = timeChoice(winter(), 'Europe/Rome');
      expect(choice.starts).toEqual(quarters('08:30', 14));
      expect(choice.ends).toEqual(quarters('08:45', 14));
      expect([choice.starts[0], choice.starts.at(-1), choice.ends[0], choice.ends.at(-1)]).toEqual(['08:30', '11:45', '08:45', '12:00']);
      expect([choice.start, choice.end]).toEqual(['10:00', '11:00']);
    });

    it('a window ending at 24:00: the last end is 24:00, the last start 23:45', () => {
      // 20:00–24:00 local, the slot 23:00–24:00.
      const slot = slotOf('2026-11-23', ['2026-11-23T19:00', '2026-11-23T23:00'], ['2026-11-23T22:00', '2026-11-23T23:00']);
      const choice = timeChoice(slot, 'Europe/Rome');
      expect([choice.starts[0], choice.starts.at(-1), choice.ends[0], choice.ends.at(-1)]).toEqual(['20:00', '23:45', '20:15', '24:00']);
      expect([choice.start, choice.end]).toEqual(['23:00', '24:00']);
    });

    it('in summer and in a half-hour zone the times are the calendar\'s clock', () => {
      // Rome in summer (UTC+2): 09:00–12:00 local.
      const summer = slotOf('2027-07-05', ['2027-07-05T07:00', '2027-07-05T10:00'], ['2027-07-05T08:00', '2027-07-05T09:00']);
      expect(timeChoice(summer, 'Europe/Rome')).toMatchObject({ start: '10:00', end: '11:00' });
      expect(timeChoice(summer, 'Europe/Rome').starts[0]).toBe('09:00');
      // Kolkata (UTC+5:30): 09:00–11:00 local.
      const kolkata = slotOf('2026-11-23', ['2026-11-23T03:30', '2026-11-23T05:30'], ['2026-11-23T03:30', '2026-11-23T04:30'], 'Asia/Kolkata');
      expect(timeChoice(kolkata, 'Asia/Kolkata')).toEqual({ starts: quarters('09:00', 8), ends: quarters('09:15', 8), start: '09:00', end: '10:00' });
    });

    it('on the night the clocks go back the repeated hour is there once: both slots at 02:00 open on 02:00–03:00', () => {
      const first = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T00:00', '2027-10-31T01:00']);
      const second = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T01:00', '2027-10-31T02:00']);
      expect(timeChoice(first, 'Europe/Rome').starts).toEqual(quarters('01:00', 12));
      expect(timeChoice(first, 'Europe/Rome')).toMatchObject({ start: '02:00', end: '02:00' });
      expect(timeChoice(second, 'Europe/Rome')).toMatchObject({ start: '02:00', end: '03:00' });
    });
  });

  describe('userChoice', () => {
    it('before any list and while one loads: no name, not ready; loading says so', () => {
      expect(userChoice({ status: 'idle' })).toEqual({ usernames: [], message: '', ready: false });
      expect(userChoice({ status: 'pending' })).toEqual({ usernames: [], message: 'Loading the users…', ready: false });
    });

    it('a list: the names in the order received, ready', () => {
      const users = [
        { username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' },
        { username: 'bob', createdAt: '2026-11-02T10:00:00.000Z' },
      ];
      expect(userChoice({ status: 'success', users })).toEqual({ usernames: ['alice', 'bob'], message: '', ready: true });
    });

    it('an empty list says that there is no User to book for', () => {
      expect(userChoice({ status: 'success', users: [] })).toEqual({ usernames: [], message: 'There is no User to book for.', ready: false });
    });

    it('a failed list is said in plain words, never with the service\'s message', () => {
      expect(userChoice({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' })).toEqual({
        usernames: [],
        message: 'The server cannot be reached. Check the connection and try again.',
        ready: false,
      });
    });
  });

  describe('bookingFor, a User (R-BOOK-01, R-BOOK-02)', () => {
    it('sends the slot\'s start only: no end, no username, no note', () => {
      expect(bookingFor(winter(), 'Europe/Rome', 'user', fields())).toEqual({ start: z('2026-11-23T09:00') });
    });

    it('a note is trimmed; a blank one is left out', () => {
      expect(bookingFor(winter(), 'Europe/Rome', 'user', fields({ note: '  First lesson\n ' }))).toEqual({ start: z('2026-11-23T09:00'), note: 'First lesson' });
      expect(bookingFor(winter(), 'Europe/Rome', 'user', fields({ note: ' \n\t ' }))).toEqual({ start: z('2026-11-23T09:00') });
    });

    it('whatever else the form holds is not sent', () => {
      const body = bookingFor(winter(), 'Europe/Rome', 'user', fields({ username: 'bob', start: '08:30', end: '12:00' }));
      expect(body).toEqual({ start: z('2026-11-23T09:00') });
    });

    it('each of the two slots at 02:00 of 2027-10-31 is booked by its own instant', () => {
      const first = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T00:00', '2027-10-31T01:00']);
      const second = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T01:00', '2027-10-31T02:00']);
      expect(bookingFor(first, 'Europe/Rome', 'user', fields())).toEqual({ start: z('2027-10-31T00:00') });
      expect(bookingFor(second, 'Europe/Rome', 'user', fields())).toEqual({ start: z('2027-10-31T01:00') });
    });
  });

  describe('bookingFor, the Administrator', () => {
    it('times not touched: the User, the slot\'s own start and end, the note', () => {
      const slot = winter();
      expect(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { note: ' For Alice ' }))).toEqual({
        start: z('2026-11-23T09:00'),
        end: z('2026-11-23T10:00'),
        username: 'alice',
        note: 'For Alice',
      });
      expect(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot))).toEqual({ start: z('2026-11-23T09:00'), end: z('2026-11-23T10:00'), username: 'alice' });
    });

    it('a custom start and end in Rome in winter: 10:15–10:45 local', () => {
      const slot = winter();
      expect(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { start: '10:15', end: '10:45' }))).toEqual({
        start: z('2026-11-23T09:15'),
        end: z('2026-11-23T09:45'),
        username: 'alice',
      });
    });

    it('only one of the two changed: both are taken from the form', () => {
      const slot = winter();
      expect(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { end: '12:00' }))).toMatchObject({ start: z('2026-11-23T09:00'), end: z('2026-11-23T11:00') });
      expect(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { start: '08:30' }))).toMatchObject({ start: z('2026-11-23T07:30'), end: z('2026-11-23T10:00') });
    });

    it('a custom start and end in Rome in summer and in a half-hour zone', () => {
      const summer = slotOf('2027-07-05', ['2027-07-05T07:00', '2027-07-05T10:00'], ['2027-07-05T08:00', '2027-07-05T09:00']);
      expect(bookingFor(summer, 'Europe/Rome', 'admin', untouched(summer, 'Europe/Rome', { start: '09:30', end: '10:15' }))).toMatchObject({
        start: z('2027-07-05T07:30'),
        end: z('2027-07-05T08:15'),
      });
      const kolkata = slotOf('2026-11-23', ['2026-11-23T03:30', '2026-11-23T05:30'], ['2026-11-23T03:30', '2026-11-23T04:30'], 'Asia/Kolkata');
      expect(bookingFor(kolkata, 'Asia/Kolkata', 'admin', untouched(kolkata, 'Asia/Kolkata', { start: '09:15', end: '10:45' }))).toMatchObject({
        start: z('2026-11-23T03:45'),
        end: z('2026-11-23T05:15'),
      });
    });

    it('an end at 24:00 is midnight at the end of the slot\'s day', () => {
      const slot = slotOf('2026-11-23', ['2026-11-23T19:00', '2026-11-23T23:00'], ['2026-11-23T22:00', '2026-11-23T23:00']);
      expect(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { start: '23:30' }))).toMatchObject({ start: z('2026-11-23T22:30'), end: z('2026-11-23T23:00') });
    });

    it('an end not after the start is handed over as chosen, and the shared schema refuses it', () => {
      const slot = winter();
      for (const [start, end] of [['11:00', '10:00'], ['10:30', '10:30']] as const) {
        const body = bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { start, end }));
        const parsed = BookBody.safeParse(body);
        expect(parsed.success).toBe(false);
        expect(parsed.error!.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([['end', 'end must be after start']]);
      }
      // And what is handed over when the times are in order passes it.
      expect(BookBody.safeParse(bookingFor(slot, 'Europe/Rome', 'admin', untouched(slot))).success).toBe(true);
    });

    it('the two slots at 02:00 of 2027-10-31, times not touched: each by its own instants', () => {
      const first = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T00:00', '2027-10-31T01:00']);
      const second = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T01:00', '2027-10-31T02:00']);
      expect(bookingFor(first, 'Europe/Rome', 'admin', untouched(first))).toMatchObject({ start: z('2027-10-31T00:00'), end: z('2027-10-31T01:00') });
      expect(bookingFor(second, 'Europe/Rome', 'admin', untouched(second))).toMatchObject({ start: z('2027-10-31T01:00'), end: z('2027-10-31T02:00') });
    });

    it('known limit: a custom time in the repeated hour is its earlier occurrence (R-TIME-03)', () => {
      const second = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T01:00', '2027-10-31T02:00']);
      // From the later 02:00 slot, 02:15–02:45 is sent as 02:15 +02:00 to 02:45 +02:00.
      expect(bookingFor(second, 'Europe/Rome', 'admin', untouched(second, 'Europe/Rome', { start: '02:15', end: '02:45' }))).toMatchObject({
        start: z('2027-10-31T00:15'),
        end: z('2027-10-31T00:45'),
      });
    });
  });
  describe('changeFor, a User (R-CHG-01, R-CHG-03)', () => {
    it('sends the slot\'s start and the note: no end, never a username', () => {
      const body = changeFor(winter(), 'Europe/Rome', 'user', fields({ note: 'First lesson' }));
      expect(body).toEqual({ start: z('2026-11-23T09:00'), note: 'First lesson' });
      expect(Object.keys(body).sort()).toEqual(['note', 'start']);
    });

    it('whatever else the form holds is not sent', () => {
      const body = changeFor(winter(), 'Europe/Rome', 'user', fields({ note: 'x', username: 'bob', start: '08:30', end: '12:00' }));
      expect(body).toEqual({ start: z('2026-11-23T09:00'), note: 'x' });
    });

    it('the note is always there, as the field holds it: untouched, edited, emptied', () => {
      const old = 'First lesson';
      expect(changeFor(winter(), 'Europe/Rome', 'user', fields({ note: old }))).toHaveProperty('note', old);
      expect(changeFor(winter(), 'Europe/Rome', 'user', fields({ note: 'Second lesson' }))).toHaveProperty('note', 'Second lesson');
      expect(changeFor(winter(), 'Europe/Rome', 'user', fields({ note: '' }))).toHaveProperty('note', '');
      expect(changeFor(winter(), 'Europe/Rome', 'user', fields({ note: '  \n ' }))).toHaveProperty('note', '  \n ');
    });

    it('the shared schema, which the service applies, trims the note and makes a blank one null, which clears it', () => {
      const parsed = (note: string) => ChangeBody.parse(changeFor(winter(), 'Europe/Rome', 'user', fields({ note })));
      expect(parsed('')).toEqual({ start: z('2026-11-23T09:00'), note: null });
      expect(parsed('  \n ')).toEqual({ start: z('2026-11-23T09:00'), note: null });
      expect(parsed('  Second lesson ')).toEqual({ start: z('2026-11-23T09:00'), note: 'Second lesson' });
    });

    it('each of the two slots at 02:00 of 2027-10-31 is its own instant', () => {
      const second = slotOf('2027-10-31', ['2027-10-30T23:00', '2027-10-31T03:00'], ['2027-10-31T01:00', '2027-10-31T02:00']);
      expect(changeFor(second, 'Europe/Rome', 'user', fields())).toEqual({ start: z('2027-10-31T01:00'), note: '' });
    });
  });

  describe('changeFor, the Administrator', () => {
    it('times not touched: the slot\'s own start and end, the note, and no username even when the form holds one', () => {
      const slot = winter();
      const body = changeFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { note: 'For Alice' }));
      expect(body).toEqual({ start: z('2026-11-23T09:00'), end: z('2026-11-23T10:00'), note: 'For Alice' });
      expect(body).not.toHaveProperty('username');
    });

    it('a custom start and end in Rome in winter: 10:15–10:45 local', () => {
      const slot = winter();
      expect(changeFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { start: '10:15', end: '10:45' }))).toEqual({
        start: z('2026-11-23T09:15'),
        end: z('2026-11-23T09:45'),
        note: '',
      });
    });

    it('a custom start and end in Rome in summer and in a half-hour zone', () => {
      const summer = slotOf('2027-07-05', ['2027-07-05T07:00', '2027-07-05T10:00'], ['2027-07-05T08:00', '2027-07-05T09:00']);
      expect(changeFor(summer, 'Europe/Rome', 'admin', untouched(summer, 'Europe/Rome', { start: '09:30', end: '10:15', note: 'n' }))).toEqual({
        start: z('2027-07-05T07:30'),
        end: z('2027-07-05T08:15'),
        note: 'n',
      });
      const kolkata = slotOf('2026-11-23', ['2026-11-23T03:30', '2026-11-23T05:30'], ['2026-11-23T03:30', '2026-11-23T04:30'], 'Asia/Kolkata');
      expect(changeFor(kolkata, 'Asia/Kolkata', 'admin', untouched(kolkata, 'Asia/Kolkata', { start: '09:15', end: '10:45' }))).toEqual({
        start: z('2026-11-23T03:45'),
        end: z('2026-11-23T05:15'),
        note: '',
      });
    });

    it('only one of the two changed: both are taken from the form', () => {
      const slot = winter();
      expect(changeFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { end: '12:00' }))).toMatchObject({ start: z('2026-11-23T09:00'), end: z('2026-11-23T11:00') });
    });

    it('the note untouched, edited and emptied: the key is always there', () => {
      const slot = winter();
      for (const note of ['First lesson', 'Second lesson', '']) {
        expect(changeFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { note }))).toHaveProperty('note', note);
      }
    });

    it('an end not after the start is handed over as chosen, and the shared schema refuses it', () => {
      const slot = winter();
      const parsed = ChangeBody.safeParse(changeFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { start: '11:00', end: '10:00' })));
      expect(parsed.success).toBe(false);
      expect(parsed.error!.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([['end', 'end must be after start']]);
      expect(ChangeBody.safeParse(changeFor(slot, 'Europe/Rome', 'admin', untouched(slot))).success).toBe(true);
    });

    it('what is handed over never fails the schema for a key it does not know', () => {
      const slot = winter();
      const body = changeFor(slot, 'Europe/Rome', 'admin', untouched(slot, 'Europe/Rome', { username: 'bob' }));
      expect(ChangeBody.safeParse(body).success).toBe(true);
    });
  });
});
