import { addDays, weekdayOf } from '@shared-calendar/shared';

// The days the evaluation's requests name (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3), all
// worked out from one date, "today" in the calendar's time zone, so that the expected input of a
// tool is a fact. Pure: no clock is read here.

// A week as its seven dates, Monday first.
export type Week = [string, string, string, string, string, string, string];

export type Days = {
  today: string;
  tomorrow: string;
  afterTomorrow: string;
  // The same weekday one week and two weeks from today.
  inOneWeek: string;
  inTwoWeeks: string;
  // The last day of today's month.
  endOfMonth: string;
  // The first Friday after today, today left out.
  comingFriday: string;
  // The week that starts on the coming Monday, which the instructions call "next week", and the
  // week after it.
  nextWeek: Week;
  weekAfter: Week;
};

const week = (monday: string): Week => [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(monday, n)) as Week;

// The first date after `date` that falls on `weekday` (1 = Monday … 7 = Sunday).
export function comingWeekday(date: string, weekday: number): string {
  const ahead = (weekday - weekdayOf(date) + 7) % 7;
  return addDays(date, ahead === 0 ? 7 : ahead);
}

export function lastDayOfMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function daysFrom(today: string): Days {
  const monday = comingWeekday(today, 1);
  return {
    today,
    tomorrow: addDays(today, 1),
    afterTomorrow: addDays(today, 2),
    inOneWeek: addDays(today, 7),
    inTwoWeeks: addDays(today, 14),
    endOfMonth: lastDayOfMonth(today),
    comingFriday: comingWeekday(today, 5),
    nextWeek: week(monday),
    weekAfter: week(addDays(monday, 7)),
  };
}

const WEEKDAYS = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
};
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
};

/** The weekday of a date as a person writes it: "Tuesday", "martedì". */
export function weekdayName(date: string, language: 'en' | 'it'): string {
  return WEEKDAYS[language][weekdayOf(date) - 1]!;
}

/** A date as a person writes it in a message: "Tuesday 8 December", "martedì 8 dicembre". */
export function written(date: string, language: 'en' | 'it'): string {
  return `${weekdayName(date, language)} ${Number(date.slice(8, 10))} ${MONTHS[language][Number(date.slice(5, 7)) - 1]}`;
}
