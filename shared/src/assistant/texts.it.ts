import { weekdayOf } from '../calendar/time';
import type { AppointmentSummary, AssistantSettingName, AssistantTexts, DayHours, HoursSummary, PatternSummary, SettingChange } from './texts';

const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// A local date written out in full: "martedì 24 novembre 2026".
const fullDate = (date: string) => `${WEEKDAYS[weekdayOf(date) - 1]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

// An existing appointment as a sentence names it: "l'appuntamento di alice di martedì 24 novembre
// 2026, dalle 10:00 alle 11:00 (Visit)", without "di alice" when it is the person's own.
const theAppointment = ({ date, start, end, type, username }: AppointmentSummary) =>
  `l'appuntamento${username === null ? '' : ` di ${username}`} di ${fullDate(date)}, dalle ${start} alle ${end} (${type})`;

// A setting by its name, and what it counts, one and several.
const SETTINGS: Record<AssistantSettingName, { name: string; one: string; many: string }> = {
  cancellationNoticeHours: { name: "Preavviso per l'annullamento", one: 'ora', many: 'ore' },
  minBookingNoticeHours: { name: 'Preavviso minimo per la prenotazione', one: 'ora', many: 'ore' },
  bookingHorizonDays: { name: 'Orizzonte di prenotazione', one: 'giorno', many: 'giorni' },
  maxFutureAppointmentsPerUser: { name: 'Numero massimo di appuntamenti futuri per persona', one: 'appuntamento', many: 'appuntamenti' },
};

// One setting as it is and as it would become: "Preavviso per l'annullamento: da 24 ore a 72 ore."
const settingChange = ({ setting, from, to }: SettingChange) => {
  const { name, one, many } = SETTINGS[setting];
  const value = (count: number | null) => (count === null ? 'nessun limite' : `${count} ${count === 1 ? one : many}`);
  return `${name}: da ${value(from)} a ${value(to)}.`;
};

// A weekly pattern as a sentence names it: "ogni martedì, dalle 09:00 alle 12:00 (Visit), valido da
// martedì 1 dicembre 2026, senza scadenza".
const thePattern = ({ weekday, start, end, type, validFrom, validUntil }: PatternSummary) =>
  `ogni ${WEEKDAYS[weekday - 1]}, dalle ${start} alle ${end} (${type}), valido da ${fullDate(validFrom)}` + (validUntil === null ? ', senza scadenza' : ` fino a ${fullDate(validUntil)}`);

// Some hours in a list: "09:00–12:00 (Visit)".
const hours = ({ start, end, type }: HoursSummary) => `${start}–${end} (${type})`;

// Where the hours of a day come from.
const FROM_PATTERNS = 'dagli orari settimanali';
const OWN_HOURS = 'orari propri di questo giorno';

// The hours of a day, one after the other. A day the weekly patterns give nothing to has no hours.
// A day whose own hours are none is not available.
const dayHours = ({ from, windows }: DayHours) => (windows.length > 0 ? windows.map(hours).join(', ') : from === 'own' ? 'non disponibile' : 'nessun orario');

// The day as it is, with where its hours come from, and as it would become. What it would become
// says where the hours come from only when the day goes back to the weekly patterns.
const dayNow = (day: DayHours) => `Com'è ora (${day.from === 'own' ? OWN_HOURS : FROM_PATTERNS}): ${dayHours(day)}.`;
const dayThen = (day: DayHours) => `Come diventerebbe${day.from === 'own' ? '' : ` (${FROM_PATTERNS})`}: ${dayHours(day)}.`;

// The extra windows of the day, which a change to the day's own hours leaves as they are.
const extraWindows = (extras: HoursSummary[]) =>
  extras.length === 0 ? '' : extras.length === 1 ? ` La finestra aggiuntiva ${hours(extras[0]!)} di questo giorno non cambia.` : ` Le finestre aggiuntive ${extras.map(hours).join(', ')} di questo giorno non cambiano.`;

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
    bookAppointment: ({ date, start, end, type, note, secondTime, username }) =>
      `Prenotare${username === null ? '' : ` per ${username}`} un appuntamento per ${fullDate(date)}, dalle ${start} alle ${end} (${type}).` +
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
    updateSettings: ({ changes }) => ['Modificare le impostazioni.', ...changes.map(settingChange)].join(' '),
    createType: ({ name }) => `Creare il tipo di appuntamento «${name}».`,
    renameType: ({ from, to }) => `Rinominare il tipo di appuntamento «${from}» in «${to}».`,
    deleteType: ({ name }) => `Eliminare il tipo di appuntamento «${name}».`,
    createPattern: (pattern) => `Creare un orario settimanale: ${thePattern(pattern)}.`,
    updatePattern: ({ from, to }) => `Modificare un orario settimanale. Com'è ora: ${thePattern(from)}. Come diventerebbe: ${thePattern(to)}.`,
    deletePattern: (pattern) => `Eliminare l'orario settimanale: ${thePattern(pattern)}.`,
    setDateOverride: ({ date, now, then, extras }) => `Impostare gli orari di ${fullDate(date)}, solo per questo giorno. ${dayNow(now)} ${dayThen(then)}${extraWindows(extras)}`,
    deleteDateOverride: ({ date, now, then, extras }) => `Tornare agli orari settimanali per ${fullDate(date)}. ${dayNow(now)} ${dayThen(then)}${extraWindows(extras)}`,
    createOneOffWindow: ({ date, start, end, type }) => `Creare una finestra aggiuntiva per ${fullDate(date)}, dalle ${start} alle ${end} (${type}).`,
    deleteOneOffWindow: ({ date, start, end, type }) => `Eliminare la finestra aggiuntiva di ${fullDate(date)}, dalle ${start} alle ${end} (${type}).`,
  },
  working: 'Ci sto lavorando…',
  reading: {
    settings: 'Sto guardando le impostazioni del calendario…',
    types: 'Sto guardando i tipi di appuntamento…',
    calendar: 'Sto guardando il calendario…',
    appointments: 'Sto guardando gli appuntamenti…',
    users: 'Sto guardando gli utenti…',
    patterns: 'Sto guardando gli orari settimanali…',
  },
};
