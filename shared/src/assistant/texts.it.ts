import { weekdayOf } from '../calendar/time';
import type { AppointmentSummary, AssistantTexts } from './texts';

const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// A local date written out in full: "martedì 24 novembre 2026".
const fullDate = (date: string) => `${WEEKDAYS[weekdayOf(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

// An existing appointment as a sentence names it: "l'appuntamento di alice di martedì 24 novembre
// 2026, dalle 10:00 alle 11:00 (Visit)", without "di alice" when it is the person's own.
const theAppointment = ({ date, start, end, type, username }: AppointmentSummary) =>
  `l'appuntamento${username === null ? '' : ` di ${username}`} di ${fullDate(date)}, dalle ${start} alle ${end} (${type})`;

// The fixed texts in Italian, key by key the ones of the English object. The person is addressed
// with the formal "lei" throughout. The second button is not "Annulla": in a calendar that word
// would read as cancelling the appointment.
export const ASSISTANT_TEXTS_IT: AssistantTexts = {
  cannotAnswer: {
    assistant_limit_reached:
      "Ha raggiunto il limite di messaggi all'assistente per oggi. Sarà di nuovo disponibile domani. Può comunque fare tutto dalle altre pagine.",
    assistant_budget_reached:
      "L'assistente ha raggiunto il suo limite di spesa e per ora non può rispondere. Il suo calendario non ne risente: può comunque fare tutto dalle altre pagine.",
    assistant_unavailable:
      "L'assistente non è disponibile in questo momento. Riprovi tra poco. Può comunque fare tutto dalle altre pagine.",
  },
  nothingChanged: 'Non è stato modificato nulla.',
  answerCutShort: 'La risposta è stata interrotta prima della fine.',
  tooManySteps:
    "L'assistente non è riuscito a completare questa richiesta. Provi a formularla in un altro modo, per esempio chiedendo una cosa alla volta.",
  refused:
    "L'assistente non può rispondere a questa richiesta. Questa conversazione è terminata: il suo prossimo messaggio ne inizierà una nuova.",
  conversationFull: 'Questa conversazione è piena. Per continuare, ne inizi una nuova.',
  proposalQuestion: (changes) => (changes === 1 ? 'Conferma questa modifica?' : `Conferma queste ${changes} modifiche?`),
  confirmLabel: 'Conferma',
  declineLabel: 'Non lo faccia',
  changes: {
    bookAppointment: ({ date, start, end, type, note, secondTime }) =>
      `Prenotare un appuntamento per ${fullDate(date)}, dalle ${start} alle ${end} (${type}).` +
      (secondTime ? ` È la seconda volta che quella notte l'orologio segna le ${start}: torna l'ora solare.` : '') +
      (note === null ? '' : ` Nota: «${note}»`),
    cancelAppointment: (appointment) => `Annullare ${theAppointment(appointment)}.`,
    changeAppointment: ({ appointment, to }) =>
      `Spostare ${theAppointment(appointment)}, a ${fullDate(to.date)}, dalle ${to.start} alle ${to.end} (${to.type}).` +
      (to.secondTime ? ` È la seconda volta che quella notte l'orologio segna le ${to.start}: torna l'ora solare.` : ''),
    setAppointmentNote: ({ appointment, note, previous }) =>
      note === null
        ? `Togliere la nota del${theAppointment(appointment)}. La nota è: «${previous ?? ''}»`
        : `Impostare la nota del${theAppointment(appointment)}: «${note}»` + (previous === null ? '' : ` Sostituisce la nota: «${previous}»`),
  },
  working: 'Ci sto lavorando…',
  reading: {
    settings: 'Sto guardando le impostazioni del calendario…',
    types: 'Sto guardando i tipi di appuntamento…',
    calendar: 'Sto guardando il calendario…',
    appointments: 'Sto guardando gli appuntamenti…',
  },
};
