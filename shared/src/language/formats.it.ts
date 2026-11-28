import type { DateNames } from './formats';

// The names of days and months in Italian, written in lower case as Italian writes them inside a
// sentence ("lun 16 nov", "martedì 24 novembre 2026").
export const DATE_NAMES_IT: DateNames = {
  weekdaysShort: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'],
  weekdaysLong: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
  monthsShort: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  monthsLong: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
};
