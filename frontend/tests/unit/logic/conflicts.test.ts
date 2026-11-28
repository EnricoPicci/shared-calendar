import type { AppointmentConflict } from '@shared-calendar/shared';
import { conflictList } from '../../../src/logic/conflicts';
import { useFarBrowserZone } from './zone';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

const conflict = (username: string, start: string, end: string): AppointmentConflict => ({ appointmentId: `appt-${start}-${username}`, username, start, end });

// Test names: section numbers are those of docs/SHARED_CALENDAR_SPEC.md.
describe('conflictList (6.7)', () => {
  useFarBrowserZone();

  it('no list and an empty list are nothing to draw: the failure\'s sentence stands alone', () => {
    expect(conflictList(PAGE_TEXTS_EN, undefined, 'Europe/Rome')).toBeNull();
    expect(conflictList(PAGE_TEXTS_EN, [], 'Europe/Rome')).toBeNull();
  });

  it('one appointment: its date, its time and its User in the calendar\'s zone, and a sentence in the singular', () => {
    // Monday 23 November 2026, 09:00 to 10:00 in Rome (UTC+1 in winter).
    expect(conflictList(PAGE_TEXTS_EN, [conflict('alice', '2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z')], 'Europe/Rome')).toEqual({
      sentence: '1 appointment is in the way:',
      rows: [{ date: 'Mon 23 Nov', time: '09:00–10:00', username: 'alice' }],
    });
  });

  it('several, given out of order: by start, then by username, and the sentence counts them', () => {
    const list = conflictList(PAGE_TEXTS_EN, 
      [
        conflict('carol', '2026-11-30T08:00:00.000Z', '2026-11-30T09:00:00.000Z'),
        conflict('bob', '2026-11-23T08:00:00.000Z', '2026-11-23T08:30:00.000Z'),
        conflict('alice', '2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z'),
        conflict('dave', '2026-11-23T07:00:00.000Z', '2026-11-23T08:00:00.000Z'),
      ],
      'Europe/Rome',
    )!;
    expect(list.sentence).toBe('4 appointments are in the way:');
    expect(list.rows.map((row) => `${row.date} ${row.time} ${row.username}`)).toEqual([
      'Mon 23 Nov 08:00–09:00 dave',
      'Mon 23 Nov 09:00–10:00 alice',
      'Mon 23 Nov 09:00–09:30 bob',
      'Mon 30 Nov 09:00–10:00 carol',
    ]);
  });

  it('the list given is left as it was', () => {
    const given = [conflict('bob', '2026-11-30T08:00:00.000Z', '2026-11-30T09:00:00.000Z'), conflict('alice', '2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z')];
    conflictList(PAGE_TEXTS_EN, given, 'Europe/Rome');
    expect(given.map((c) => c.username)).toEqual(['bob', 'alice']);
  });

  it('Rome in summer is two hours ahead of UTC; the date is the calendar\'s, not UTC\'s nor the browser\'s', () => {
    // 22:30 UTC on Monday 5 July 2027 is 00:30 on Tuesday 6 July in Rome: not UTC's date.
    expect(conflictList(PAGE_TEXTS_EN, [conflict('alice', '2027-07-05T22:30:00.000Z', '2027-07-05T23:30:00.000Z')], 'Europe/Rome')!.rows).toEqual([{ date: 'Tue 6 Jul', time: '00:30–01:30', username: 'alice' }]);
    // 11:00 UTC on that Monday is 13:00 on Monday in Rome, and 01:00 on Tuesday in the browser's zone.
    expect(conflictList(PAGE_TEXTS_EN, [conflict('alice', '2027-07-05T11:00:00.000Z', '2027-07-05T12:00:00.000Z')], 'Europe/Rome')!.rows).toEqual([{ date: 'Mon 5 Jul', time: '13:00–14:00', username: 'alice' }]);
    // The same instant in another calendar zone is another date and time.
    expect(conflictList(PAGE_TEXTS_EN, [conflict('alice', '2027-07-05T22:30:00.000Z', '2027-07-05T23:30:00.000Z')], 'America/New_York')!.rows).toEqual([{ date: 'Mon 5 Jul', time: '18:30–19:30', username: 'alice' }]);
  });

  it('an appointment that ends at midnight ends at 24:00', () => {
    expect(conflictList(PAGE_TEXTS_EN, [conflict('alice', '2026-11-23T22:00:00.000Z', '2026-11-23T23:00:00.000Z')], 'Europe/Rome')!.rows[0]!.time).toBe('23:00–24:00');
  });

  it('on the night the clocks go back the two hours with the same name are told apart by their offsets; the day before carries none', () => {
    const list = conflictList(PAGE_TEXTS_EN, 
      [
        conflict('bob', '2027-10-31T01:00:00.000Z', '2027-10-31T02:00:00.000Z'),
        conflict('alice', '2027-10-31T00:00:00.000Z', '2027-10-31T01:00:00.000Z'),
        conflict('carol', '2027-10-30T07:00:00.000Z', '2027-10-30T08:00:00.000Z'),
      ],
      'Europe/Rome',
    )!;
    expect(list.rows).toEqual([
      { date: 'Sat 30 Oct', time: '09:00–10:00', username: 'carol' },
      { date: 'Sun 31 Oct', time: '02:00 +02:00 – 02:00 +01:00', username: 'alice' },
      { date: 'Sun 31 Oct', time: '02:00 +01:00 – 03:00 +01:00', username: 'bob' },
    ]);
  });

  it('a username containing <script> is kept as text, as it is', () => {
    const name = '<script>alert(1)</script>';
    expect(conflictList(PAGE_TEXTS_EN, [conflict(name, '2026-11-23T08:00:00.000Z', '2026-11-23T09:00:00.000Z')], 'Europe/Rome')!.rows[0]!.username).toBe(name);
  });
});
