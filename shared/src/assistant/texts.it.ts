import { dateFormats } from '../language/formats';
import type { AppointmentSummary, AssistantSettingName, AssistantTexts, DayHours, HoursSummary, MailSummary, OverCapacity, PatternSummary, SettingChange, TypeEditSummary } from './texts';

// A local date written out in full, "martedì 24 novembre 2026", and the name of a weekday.
const { fullDate, weekdayName } = dateFormats('it');

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
  `ogni ${weekdayName(weekday)}, dalle ${start} alle ${end} (${type}), valido da ${fullDate(validFrom)}` + (validUntil === null ? ', senza scadenza' : ` fino a ${fullDate(validUntil)}`);

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

// A booking or a move over the capacity of its type: " Oltre la capienza: ospiterà 4 persone, la
// sua capienza è 3." Nothing when it stays within it.
const overCapacity = (over: OverCapacity | null | undefined) => (over === null || over === undefined ? '' : ` Oltre la capienza: ospiterà ${over.people} persone, la sua capienza è ${over.capacity}.`);

// An edited type: a new name alone keeps the words of a rename; a capacity says both numbers.
const editedType = ({ name, newName, capacity, bookedAbove }: TypeEditSummary) => {
  const kept = bookedAbove
    ? ' Nessuna prenotazione esistente viene annullata: dove le persone prenotate sono più della nuova capienza, nessun altro può prenotare finché qualcuno non lascia il posto.'
    : '';
  if (capacity === null) return `Rinominare il tipo di appuntamento «${name}» in «${newName ?? name}».`;
  const parts = [...(newName === null ? [] : [`nome in «${newName}»`]), `capienza da ${capacity.from} a ${capacity.to}`];
  return `Modificare il tipo di appuntamento «${name}»: ${parts.join(', ')}.${kept}`;
};

// A mail on demand: what it holds, by the person's role, and its range, one date or two.
const mailOf = ({ from, to, kind, address }: MailSummary) =>
  `Inviare ${kind === 'calendar' ? 'il calendario' : 'i suoi appuntamenti'} ${from === to ? `di ${fullDate(from)}` : `da ${fullDate(from)} a ${fullDate(to)}`} all'indirizzo ${address}.`;

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
    bookAppointment: ({ date, start, end, type, note, secondTime, username, over }) =>
      `Prenotare${username === null ? '' : ` per ${username}`} un appuntamento per ${fullDate(date)}, dalle ${start} alle ${end} (${type}).` +
      (secondTime ? ` È la seconda volta che quella notte l'orologio segna le ${start}: torna l'ora solare.` : '') +
      overCapacity(over) +
      (note === null ? '' : ` Nota: «${note}»`),
    cancelAppointment: (appointment) => `Annullare ${theAppointment(appointment)}.`,
    changeAppointment: ({ appointment, to }) =>
      `Spostare ${theAppointment(appointment)}, a ${fullDate(to.date)}, dalle ${to.start} alle ${to.end} (${to.type}).` +
      (to.secondTime ? ` È la seconda volta che quella notte l'orologio segna le ${to.start}: torna l'ora solare.` : '') +
      overCapacity(to.over),
    setAppointmentNote: ({ appointment, note, previous }) =>
      note === null
        ? `Togliere la nota del${theAppointment(appointment)}. La nota è: «${previous ?? ''}»`
        : `Impostare la nota del${theAppointment(appointment)}: «${note}»` + (previous === null ? '' : ` Sostituisce la nota: «${previous}»`),
    updateSettings: ({ changes }) => ['Modificare le impostazioni.', ...changes.map(settingChange)].join(' '),
    createType: ({ name, capacity }) => `Creare il tipo di appuntamento «${name}»${capacity > 1 ? `, per ${capacity} persone contemporaneamente` : ''}.`,
    editType: editedType,
    deleteType: ({ name }) => `Eliminare il tipo di appuntamento «${name}».`,
    createPattern: (pattern) => `Creare un orario settimanale: ${thePattern(pattern)}.`,
    updatePattern: ({ from, to }) => `Modificare un orario settimanale. Com'è ora: ${thePattern(from)}. Come diventerebbe: ${thePattern(to)}.`,
    deletePattern: (pattern) => `Eliminare l'orario settimanale: ${thePattern(pattern)}.`,
    setDateOverride: ({ date, now, then, extras }) => `Impostare gli orari di ${fullDate(date)}, solo per questo giorno. ${dayNow(now)} ${dayThen(then)}${extraWindows(extras)}`,
    deleteDateOverride: ({ date, now, then, extras }) => `Tornare agli orari settimanali per ${fullDate(date)}. ${dayNow(now)} ${dayThen(then)}${extraWindows(extras)}`,
    createOneOffWindow: ({ date, start, end, type }) => `Creare una finestra aggiuntiva per ${fullDate(date)}, dalle ${start} alle ${end} (${type}).`,
    deleteOneOffWindow: ({ date, start, end, type }) => `Eliminare la finestra aggiuntiva di ${fullDate(date)}, dalle ${start} alle ${end} (${type}).`,
    sendCalendarMail: mailOf,
  },
  working: 'Ci sto lavorando…',
  reading: {
    settings: 'Sto guardando le impostazioni del calendario…',
    types: 'Sto guardando i tipi di appuntamento…',
    calendar: 'Sto guardando il calendario…',
    appointments: 'Sto guardando gli appuntamenti…',
    users: 'Sto guardando gli utenti…',
    patterns: 'Sto guardando gli orari settimanali…',
    details: 'Sto guardando i suoi dati…',
  },
};
