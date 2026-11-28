import { weekdayOf } from '../calendar/time';
import type { Language } from './languages';
import { DATE_NAMES_EN } from './formats.en';
import { DATE_NAMES_IT } from './formats.it';

// The names of days and months of each language, written out here and not asked of the runtime
// (`Intl`), so that they read the same in every browser and in Lambda
// (docs/MULTILANGUAGE_ARCHITECTURE.md decision L10), and the ways a local date `YYYY-MM-DD` is
// written with them (docs/MULTILANGUAGE_ARCHITECTURE.md section 10). Every language keeps the
// calendar's conventions: the day before the month, the week from Monday
// (docs/MULTILANGUAGE_ARCHITECTURE.md decision L15); only the words change.

type Seven = readonly [string, string, string, string, string, string, string];
type Twelve = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

/** The 38 names of one language: the days from Monday and the months from January, short and long. */
export type DateNames = {
  weekdaysShort: Seven;
  weekdaysLong: Seven;
  monthsShort: Twelve;
  monthsLong: Twelve;
};

/** The ways a local date is written in one language; the examples are English. */
export type DateFormats = {
  /** "Mon 16 Nov". */
  shortDate: (date: string) => string;
  /** "Tue 1 Dec 2026". */
  shortDateWithYear: (date: string) => string;
  /** "20 November 2026". */
  longDate: (date: string) => string;
  /** "Tuesday 24 November 2026". */
  fullDate: (date: string) => string;
  /** The seven days from a Monday: "16 Nov – 22 Nov 2026", the first with its year only when the week ends in another one. */
  weekLabel: (monday: string, sunday: string) => string;
  /** The name of a weekday, 1 for Monday to 7 for Sunday: "Monday". */
  weekdayName: (weekday: number) => string;
};

const day = (date: string) => Number(date.slice(8, 10));
const month = (date: string) => Number(date.slice(5, 7)) - 1;
const year = (date: string) => date.slice(0, 4);

// The writers of a language whose dates follow the calendar's conventions, from its names.
function formatsOf(names: DateNames): DateFormats {
  const weekdayShort = (date: string) => names.weekdaysShort[weekdayOf(date) - 1]!;
  const monthShort = (date: string) => names.monthsShort[month(date)]!;
  return {
    shortDate: (date) => `${weekdayShort(date)} ${day(date)} ${monthShort(date)}`,
    shortDateWithYear: (date) => `${weekdayShort(date)} ${day(date)} ${monthShort(date)} ${year(date)}`,
    longDate: (date) => `${day(date)} ${names.monthsLong[month(date)]} ${year(date)}`,
    fullDate: (date) => `${names.weekdaysLong[weekdayOf(date) - 1]} ${day(date)} ${names.monthsLong[month(date)]} ${year(date)}`,
    weekLabel: (monday, sunday) =>
      `${day(monday)} ${monthShort(monday)}${year(monday) === year(sunday) ? '' : ` ${year(monday)}`} – ${day(sunday)} ${monthShort(sunday)} ${year(sunday)}`,
    weekdayName: (weekday) => names.weekdaysLong[weekday - 1]!,
  };
}

const NAMES: Record<Language, DateNames> = { en: DATE_NAMES_EN, it: DATE_NAMES_IT };
const FORMATS: Record<Language, DateFormats> = { en: formatsOf(DATE_NAMES_EN), it: formatsOf(DATE_NAMES_IT) };

/** The names of days and months of one language. */
export function dateNames(language: Language): DateNames {
  return NAMES[language];
}

/** The ways one language writes a date. */
export function dateFormats(language: Language): DateFormats {
  return FORMATS[language];
}
