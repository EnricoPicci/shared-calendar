import { comingWeekday, daysFrom, lastDayOfMonth, weekdayName, written } from '../../eval/dates';

// The days the evaluation's requests name, worked out from one date
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3).
describe('the days of the evaluation', () => {
  it('counts from a Sunday: next week starts tomorrow', () => {
    const days = daysFrom('2026-11-22');

    expect(days).toMatchObject({ tomorrow: '2026-11-23', afterTomorrow: '2026-11-24', inOneWeek: '2026-11-29', inTwoWeeks: '2026-12-06', endOfMonth: '2026-11-30', comingFriday: '2026-11-27' });
    expect(days.nextWeek).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(days.weekAfter[0]).toBe('2026-11-30');
    expect(days.weekAfter[6]).toBe('2026-12-06');
  });

  it('counts from a Monday: next week is the week of the coming Monday, seven days on', () => {
    const days = daysFrom('2026-11-23');

    expect(days.nextWeek[0]).toBe('2026-11-30');
    expect(days.comingFriday).toBe('2026-11-27');
  });

  it('on a Friday the coming Friday is a week away, and is the Friday of next week', () => {
    const days = daysFrom('2026-11-27');

    expect(days.comingFriday).toBe('2026-12-04');
    expect(days.nextWeek[4]).toBe('2026-12-04');
  });

  it('crosses a month and a year', () => {
    expect(daysFrom('2026-12-30')).toMatchObject({ tomorrow: '2026-12-31', afterTomorrow: '2027-01-01', endOfMonth: '2026-12-31' });
    expect(daysFrom('2026-12-30').nextWeek[0]).toBe('2027-01-04');
  });

  it('finds the last day of a month, February of a leap year too', () => {
    expect(lastDayOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12-31')).toBe('2026-12-31');
  });

  it('finds the first date after a date that falls on a weekday, never the date itself', () => {
    expect(comingWeekday('2026-11-22', 7)).toBe('2026-11-29');
    expect(comingWeekday('2026-11-22', 3)).toBe('2026-11-25');
  });

  it('writes a date as a person does, in both languages', () => {
    expect(written('2026-12-08', 'en')).toBe('Tuesday 8 December');
    expect(written('2026-12-08', 'it')).toBe('martedì 8 dicembre');
    expect(weekdayName('2026-11-22', 'en')).toBe('Sunday');
    expect(weekdayName('2026-11-22', 'it')).toBe('domenica');
  });
});
