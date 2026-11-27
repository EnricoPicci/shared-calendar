import { dateFormats } from '../language/formats';
import type { MailTexts } from './texts';

// The mails and the Excel files in Italian (docs/MULTILANGUAGE_ARCHITECTURE.md section 8), in
// the formal "lei" (docs/MULTILANGUAGE_ARCHITECTURE.md decision L14).

// A local date written short, with its year: "mar 1 dic 2026".
const shortDate = dateFormats('it').shortDateWithYear;

// "1 appuntamento", "3 appuntamenti".
const appointments = (count: number) => `${count} appuntament${count === 1 ? 'o' : 'i'}`;

const STATUSES = { booked: 'prenotato', cancelled: 'annullato' } as const;

export const MAIL_TEXTS_IT: MailTexts = {
  footer: "Questa è un'e-mail automatica. Le risposte arrivano all'Amministratore del calendario.",
  daily: ({ date, nextCount, backupFrom, nextFile, backupFile }) => ({
    subject: `Calendario: prossimi 7 giorni e copia di sicurezza, ${shortDate(date)}`,
    paragraphs: [
      nextCount === 1 ? "Nei prossimi 7 giorni c'è 1 appuntamento." : `Nei prossimi 7 giorni ci sono ${appointments(nextCount)}.`,
      `In allegato: ${nextFile}, gli appuntamenti prenotati da oggi per 7 giorni; ${backupFile}, la copia di sicurezza.`,
      `La copia di sicurezza comprende ogni appuntamento dal ${shortDate(backupFrom)} in poi.`,
    ],
  }),
  calendar: ({ from, to, count, file }) => ({
    subject: `Calendario, dal ${shortDate(from)} al ${shortDate(to)}`,
    paragraphs: [`Il calendario dal ${shortDate(from)} al ${shortDate(to)} contiene ${appointments(count)}, prenotati e annullati.`, `In allegato: ${file}.`],
  }),
  mine: ({ from, to, appointments: lines, file }) => {
    const subject = `I suoi appuntamenti, dal ${shortDate(from)} al ${shortDate(to)}`;
    if (lines.length === 0) return { subject, paragraphs: ['Non ha appuntamenti in questo periodo.', `In allegato: ${file}.`] };
    return {
      subject,
      paragraphs: [`I suoi appuntamenti dal ${shortDate(from)} al ${shortDate(to)}:`, `In allegato: ${file}, lo stesso elenco.`],
      items: lines.map((a) => `${shortDate(a.date)}, ${a.start}–${a.end}, ${a.type}, ${STATUSES[a.status]}`),
    };
  },
  statuses: STATUSES,
  reasons: { cancelled: 'annullato', changed: 'spostato', user_deleted: 'utente eliminato' },
  headings: {
    date: 'Data',
    start: 'Inizio',
    end: 'Fine',
    type: 'Tipo',
    username: 'Nome utente',
    givenName: 'Nome',
    familyName: 'Cognome',
    status: 'Stato',
    cancelReason: 'Motivo dell\'annullamento',
    note: 'Nota',
    bookedAt: 'Prenotato il',
  },
  sheet: 'Appuntamenti',
  files: {
    calendar: (from, to) => `calendario-dal-${from}-al-${to}.xlsx`,
    mine: (from, to) => `miei-appuntamenti-dal-${from}-al-${to}.xlsx`,
    next7Days: (date) => `calendario-prossimi-7-giorni-${date}.xlsx`,
    backup: (from) => `calendario-copia-dal-${from}.xlsx`,
  },
};
