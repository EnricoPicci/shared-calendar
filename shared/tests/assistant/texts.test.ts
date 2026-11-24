import {
  ASSISTANT_LANGUAGES,
  ASSISTANT_READ_KINDS,
  ASSISTANT_LIMITS,
  ASSISTANT_TEXTS_EN,
  ASSISTANT_TEXTS_IT,
  assistantTexts,
  type AssistantCannotAnswerCode,
  type AssistantTexts,
} from '../../src/index';

// A booking as its proposal words it: a Tuesday, with a note and without, and the second 02:00 of
// the night the clocks go back in Europe/Rome.
const BOOKING = { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', note: null, secondTime: false, username: null, over: null };
const BOOKING_WITH_NOTE = { ...BOOKING, note: 'Bring the documents' };
// The same booking made by the Administrator for a User.
const BOOKING_FOR_ALICE = { ...BOOKING_WITH_NOTE, username: 'alice' };
const BOOKING_SECOND_TIME = { date: '2026-10-25', start: '02:00', end: '03:00', type: 'Visit', note: null, secondTime: true, username: null, over: null };
// The Administrator's booking for alice over the capacity of a type that holds 3: the time will
// hold 4 people.
const BOOKING_OVER = { ...BOOKING_FOR_ALICE, type: 'Swimming Pool', over: { people: 4, capacity: 3 } };

// An appointment as the proposal of a change names it: a User's own, which names nobody, and
// alice's as the Administrator is shown it. A move to a slot of another type, and to the second
// 02:00 of the night the clocks go back. A note set, set over another, and removed.
const OWN = { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', username: null };
const OF_ALICE = { ...OWN, username: 'alice' };
const TO = { date: '2026-11-26', start: '09:00', end: '10:00', type: 'Checkup', secondTime: false, over: null };
const TO_SECOND_TIME = { date: '2026-10-25', start: '02:00', end: '03:00', type: 'Visit', secondTime: true, over: null };
const TO_OVER = { ...TO, type: 'Swimming Pool', over: { people: 5, capacity: 3 } };

// A type created with the capacity of 1 and with 8; an edited type: renamed, its capacity raised,
// both, and its capacity lowered below the people already booked.
const TYPE_ONE = { name: 'Phone call', capacity: 1 };
const TYPE_EIGHT = { name: 'Yoga', capacity: 8 };
const RENAMED = { name: 'Visit', newName: 'Check-up', capacity: null, bookedAbove: false };
const RAISED = { name: 'Swimming Pool', newName: null, capacity: { from: 3, to: 5 }, bookedAbove: false };
const BOTH = { name: 'Swimming Pool', newName: 'Pool', capacity: { from: 3, to: 5 }, bookedAbove: false };
const LOWERED = { name: 'Swimming Pool', newName: null, capacity: { from: 3, to: 1 }, bookedAbove: true };
const NOTE_SET = { appointment: OWN, note: 'Bring the documents', previous: null };
const NOTE_REPLACED = { appointment: OF_ALICE, note: 'Bring the documents', previous: 'First visit' };
const NOTE_REMOVED = { appointment: OWN, note: null, previous: 'First visit' };

// Changes to the settings as their proposal words them: one setting, every setting at once with
// a limit set where there was none, and values of one hour, one day and no limit.
const ONE_SETTING = { changes: [{ setting: 'cancellationNoticeHours' as const, from: 24, to: 72 }] };
const ALL_SETTINGS = {
  changes: [
    { setting: 'cancellationNoticeHours' as const, from: 24, to: 1 },
    { setting: 'minBookingNoticeHours' as const, from: 0, to: 2 },
    { setting: 'bookingHorizonDays' as const, from: 56, to: 1 },
    { setting: 'maxFutureAppointmentsPerUser' as const, from: null, to: 3 },
  ],
};
const LIMIT_LIFTED = { changes: [{ setting: 'maxFutureAppointmentsPerUser' as const, from: 1, to: null }] };

// A weekly pattern as its proposal words it: one with no end, and one that ends, at midnight.
const PATTERN = { weekday: 2, start: '09:00', end: '12:00', type: 'Visit', validFrom: '2026-12-01', validUntil: null };
const PATTERN_ENDING = { ...PATTERN, start: '14:00', end: '24:00', validUntil: '2026-12-31' };

// The hours of one date as the proposal of a change to them words them. A day of patterns with
// an hour blocked. A day that has hours of its own, closed, with an extra window. A closed day
// opened, with two extra windows. A day the patterns give nothing to. A day that goes back to the
// patterns, and one the patterns give nothing to.
const MORNING = { start: '09:00', end: '12:00', type: 'Visit' };
const AFTERNOON = { start: '14:00', end: '18:00', type: 'Visit' };
const LATE = { start: '16:00', end: '18:00', type: 'Visit' };
const EXTRA = { start: '19:00', end: '20:00', type: 'Phone call' };
const SECOND_EXTRA = { start: '21:00', end: '22:00', type: 'Phone call' };
const DAY = '2026-11-24';
const BLOCKED = { date: DAY, now: { from: 'patterns' as const, windows: [MORNING, AFTERNOON] }, then: { from: 'own' as const, windows: [MORNING, LATE] }, extras: [] };
const CLOSED = { date: DAY, now: { from: 'own' as const, windows: [MORNING, LATE] }, then: { from: 'own' as const, windows: [] }, extras: [EXTRA] };
const OPENED = { date: DAY, now: { from: 'own' as const, windows: [] }, then: { from: 'own' as const, windows: [MORNING] }, extras: [EXTRA, SECOND_EXTRA] };
const NO_PATTERN_HOURS = { date: DAY, now: { from: 'patterns' as const, windows: [] }, then: { from: 'own' as const, windows: [MORNING] }, extras: [] };
const BACK_TO_PATTERNS = { date: DAY, now: { from: 'own' as const, windows: [] }, then: { from: 'patterns' as const, windows: [MORNING, AFTERNOON] }, extras: [] };
const BACK_TO_NOTHING = { date: DAY, now: { from: 'own' as const, windows: [LATE] }, then: { from: 'patterns' as const, windows: [] }, extras: [EXTRA] };
const WINDOW = { date: DAY, ...EXTRA };

// The arguments each text that is a function is tried with: every number of changes a proposal
// may hold, and each shape of a booking. A new function among the texts needs its entry here, or
// the test below fails.
const SAMPLES: Record<string, unknown[][]> = {
  proposalQuestion: Array.from({ length: ASSISTANT_LIMITS.changesPerProposal }, (_, i) => [i + 1]),
  'changes.bookAppointment': [[BOOKING], [BOOKING_WITH_NOTE], [BOOKING_SECOND_TIME], [BOOKING_FOR_ALICE], [BOOKING_OVER]],
  'changes.cancelAppointment': [[OWN], [OF_ALICE]],
  'changes.changeAppointment': [[{ appointment: OWN, to: TO }], [{ appointment: OF_ALICE, to: TO }], [{ appointment: OWN, to: TO_SECOND_TIME }], [{ appointment: OF_ALICE, to: TO_OVER }]],
  'changes.setAppointmentNote': [[NOTE_SET], [NOTE_REPLACED], [NOTE_REMOVED]],
  'changes.updateSettings': [[ONE_SETTING], [ALL_SETTINGS], [LIMIT_LIFTED]],
  'changes.createType': [[TYPE_ONE], [TYPE_EIGHT]],
  'changes.editType': [[RENAMED], [RAISED], [BOTH], [LOWERED]],
  'changes.deleteType': [[{ name: 'Visit' }]],
  'changes.createPattern': [[PATTERN], [PATTERN_ENDING]],
  'changes.updatePattern': [[{ from: PATTERN, to: PATTERN_ENDING }]],
  'changes.deletePattern': [[PATTERN], [PATTERN_ENDING]],
  'changes.setDateOverride': [[BLOCKED], [CLOSED], [OPENED], [NO_PATTERN_HOURS]],
  'changes.deleteDateOverride': [[BACK_TO_PATTERNS], [BACK_TO_NOTHING]],
  'changes.createOneOffWindow': [[WINDOW]],
  'changes.deleteOneOffWindow': [[WINDOW]],
};

// Every text of one language as `path -> the strings it gives`: a string as itself, a function
// called with each of its samples, a group of texts opened key by key.
function flatten(texts: object, prefix = ''): Map<string, unknown[]> {
  const out = new Map<string, unknown[]>();
  for (const [key, value] of Object.entries(texts)) {
    const path = prefix + key;
    if (typeof value === 'function') {
      out.set(path, (SAMPLES[path] ?? []).map((args) => (value as (...a: unknown[]) => unknown)(...args)));
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of flatten(value, `${path}.`)) out.set(k, v);
    } else {
      out.set(path, [value]);
    }
  }
  return out;
}

const CANNOT_ANSWER_CODES: AssistantCannotAnswerCode[] = ['assistant_limit_reached', 'assistant_budget_reached', 'assistant_unavailable'];

// Test names: the architecture is docs/CONVERSATIONAL_ARCHITECTURE.md, and its section 6.1 gives the
// three sentences of an assistant that cannot answer.
describe('assistantTexts', () => {
  it('gives each language its own object', () => {
    expect(assistantTexts('en')).toBe(ASSISTANT_TEXTS_EN);
    expect(assistantTexts('it')).toBe(ASSISTANT_TEXTS_IT);
  });

  it.each(ASSISTANT_LANGUAGES)('%s has every text of English, and no other', (language) => {
    expect([...flatten(assistantTexts(language)).keys()].sort()).toEqual([...flatten(ASSISTANT_TEXTS_EN).keys()].sort());
  });

  it.each(ASSISTANT_LANGUAGES)('every text of %s is a non-empty string, whatever its arguments', (language) => {
    for (const [path, values] of flatten(assistantTexts(language))) {
      expect(values.length, `${path} was tried with no sample`).toBeGreaterThan(0);
      for (const value of values) {
        expect(typeof value, path).toBe('string');
        expect((value as string).trim(), path).not.toBe('');
      }
    }
  });

  it('no text is the same in the two languages', () => {
    const it_ = flatten(ASSISTANT_TEXTS_IT);
    for (const [path, values] of flatten(ASSISTANT_TEXTS_EN)) expect(it_.get(path), path).not.toEqual(values);
  });

  it.each(ASSISTANT_LANGUAGES)('in %s each code that stops the assistant has its own sentence', (language) => {
    const sentences = CANNOT_ANSWER_CODES.map((code) => assistantTexts(language).cannotAnswer[code]);
    for (const sentence of sentences) expect(sentence).toMatch(/\S/);
    expect(new Set(sentences).size).toBe(CANNOT_ANSWER_CODES.length);
    expect(Object.keys(assistantTexts(language).cannotAnswer).sort()).toEqual([...CANNOT_ANSWER_CODES].sort());
  });

  it('the English sentences are those of architecture section 6.1, word for word', () => {
    expect(ASSISTANT_TEXTS_EN.cannotAnswer).toEqual({
      assistant_limit_reached:
        "You have reached today's limit of messages to the assistant. It will be available again tomorrow. Everything can still be done from the other pages.",
      assistant_budget_reached:
        'The assistant has reached its spending limit and cannot answer for now. Your calendar is not affected: everything can still be done from the other pages.',
      assistant_unavailable:
        'The assistant is not available at the moment. Please try again in a little while. Everything can still be done from the other pages.',
    });
  });

  it.each(ASSISTANT_LANGUAGES)('the question of %s tells one change from several, and names how many', (language) => {
    const { proposalQuestion }: AssistantTexts = assistantTexts(language);
    expect(proposalQuestion(1)).not.toMatch(/\d/);
    expect(proposalQuestion(3)).toContain('3');
    expect(proposalQuestion(3)).not.toBe(proposalQuestion(2));
  });

  it.each(ASSISTANT_LANGUAGES)('in %s each kind of read has its own line of progress, none the general one', (language) => {
    const { reading, working } = assistantTexts(language);
    expect(Object.keys(reading).sort()).toEqual([...ASSISTANT_READ_KINDS].sort());
    const lines = ASSISTANT_READ_KINDS.map((kind) => reading[kind]);
    expect(new Set([...lines, working]).size).toBe(ASSISTANT_READ_KINDS.length + 1);
    for (const line of lines) expect(line.endsWith('…')).toBe(true);
  });

  it('a booking is worded with its day in full, its two times, its type and its note: English', () => {
    const { bookAppointment } = ASSISTANT_TEXTS_EN.changes;
    expect(bookAppointment(BOOKING)).toBe('Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).');
    expect(bookAppointment(BOOKING_WITH_NOTE)).toBe('Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). Note: "Bring the documents"');
    expect(bookAppointment(BOOKING_SECOND_TIME)).toBe(
      'Book an appointment on Sunday 25 October 2026, from 02:00 to 03:00 (Visit). This is the second 02:00 of that night: the clocks go back.',
    );
  });

  it('the same in Italian, without addressing the person', () => {
    const { bookAppointment } = ASSISTANT_TEXTS_IT.changes;
    expect(bookAppointment(BOOKING)).toBe('Prenotare un appuntamento per martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit).');
    expect(bookAppointment(BOOKING_WITH_NOTE)).toBe('Prenotare un appuntamento per martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit). Nota: «Bring the documents»');
    expect(bookAppointment(BOOKING_SECOND_TIME)).toBe(
      "Prenotare un appuntamento per domenica 25 ottobre 2026, dalle 02:00 alle 03:00 (Visit). È la seconda volta che quella notte l'orologio segna le 02:00: torna l'ora solare.",
    );
  });

  it('a cancellation names the appointment, and whose it is for the Administrator only: both languages', () => {
    expect(ASSISTANT_TEXTS_EN.changes.cancelAppointment(OWN)).toBe('Cancel the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).');
    expect(ASSISTANT_TEXTS_EN.changes.cancelAppointment(OF_ALICE)).toBe('Cancel the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit).');
    expect(ASSISTANT_TEXTS_IT.changes.cancelAppointment(OWN)).toBe("Annullare l'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit).");
    expect(ASSISTANT_TEXTS_IT.changes.cancelAppointment(OF_ALICE)).toBe("Annullare l'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit).");
  });

  it('a move names the appointment as it is and the slot it goes to, each with its type: both languages', () => {
    const en = ASSISTANT_TEXTS_EN.changes.changeAppointment;
    const it_ = ASSISTANT_TEXTS_IT.changes.changeAppointment;
    expect(en({ appointment: OWN, to: TO })).toBe(
      'Move the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to Thursday 26 November 2026, from 09:00 to 10:00 (Checkup).',
    );
    expect(en({ appointment: OF_ALICE, to: TO })).toBe(
      'Move the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to Thursday 26 November 2026, from 09:00 to 10:00 (Checkup).',
    );
    expect(en({ appointment: OWN, to: TO_SECOND_TIME })).toBe(
      'Move the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to Sunday 25 October 2026, from 02:00 to 03:00 (Visit). This is the second 02:00 of that night: the clocks go back.',
    );
    expect(it_({ appointment: OWN, to: TO })).toBe(
      "Spostare l'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit), a giovedì 26 novembre 2026, dalle 09:00 alle 10:00 (Checkup).",
    );
    expect(it_({ appointment: OF_ALICE, to: TO })).toBe(
      "Spostare l'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit), a giovedì 26 novembre 2026, dalle 09:00 alle 10:00 (Checkup).",
    );
    expect(it_({ appointment: OWN, to: TO_SECOND_TIME })).toBe(
      "Spostare l'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit), a domenica 25 ottobre 2026, dalle 02:00 alle 03:00 (Visit). È la seconda volta che quella notte l'orologio segna le 02:00: torna l'ora solare.",
    );
  });

  it('a note is shown as it would become, with the note it replaces or removes: both languages', () => {
    const en = ASSISTANT_TEXTS_EN.changes.setAppointmentNote;
    const it_ = ASSISTANT_TEXTS_IT.changes.setAppointmentNote;
    expect(en(NOTE_SET)).toBe('Set the note of the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to: "Bring the documents"');
    expect(en(NOTE_REPLACED)).toBe(
      'Set the note of the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to: "Bring the documents" It replaces the note: "First visit"',
    );
    expect(en(NOTE_REMOVED)).toBe('Remove the note of the appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). The note is: "First visit"');
    expect(it_(NOTE_SET)).toBe("Impostare la nota dell'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit): «Bring the documents»");
    expect(it_(NOTE_REPLACED)).toBe(
      "Impostare la nota dell'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit): «Bring the documents» Sostituisce la nota: «First visit»",
    );
    expect(it_(NOTE_REMOVED)).toBe("Togliere la nota dell'appuntamento di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit). La nota è: «First visit»");
  });

  it('a booking by the Administrator names the User it is for: both languages', () => {
    expect(ASSISTANT_TEXTS_EN.changes.bookAppointment(BOOKING_FOR_ALICE)).toBe(
      'Book an appointment for alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit). Note: "Bring the documents"',
    );
    expect(ASSISTANT_TEXTS_IT.changes.bookAppointment(BOOKING_FOR_ALICE)).toBe(
      'Prenotare per alice un appuntamento per martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit). Nota: «Bring the documents»',
    );
  });

  it('a change to the settings shows each changed setting as it is and as it would become, in the words of the settings page: English', () => {
    const { updateSettings } = ASSISTANT_TEXTS_EN.changes;
    expect(updateSettings(ONE_SETTING)).toBe('Change the settings. Cancellation notice: from 24 hours to 72 hours.');
    expect(updateSettings(ALL_SETTINGS)).toBe(
      'Change the settings. Cancellation notice: from 24 hours to 1 hour. Minimum booking notice: from 0 hours to 2 hours. ' +
        'Booking horizon: from 56 days to 1 day. Maximum upcoming appointments per person: from no limit to 3 appointments.',
    );
    expect(updateSettings(LIMIT_LIFTED)).toBe('Change the settings. Maximum upcoming appointments per person: from 1 appointment to no limit.');
  });

  it('the same in Italian, without addressing the person', () => {
    const { updateSettings } = ASSISTANT_TEXTS_IT.changes;
    expect(updateSettings(ONE_SETTING)).toBe("Modificare le impostazioni. Preavviso per l'annullamento: da 24 ore a 72 ore.");
    expect(updateSettings(ALL_SETTINGS)).toBe(
      "Modificare le impostazioni. Preavviso per l'annullamento: da 24 ore a 1 ora. Preavviso minimo per la prenotazione: da 0 ore a 2 ore. " +
        'Orizzonte di prenotazione: da 56 giorni a 1 giorno. Numero massimo di appuntamenti futuri per persona: da nessun limite a 3 appuntamenti.',
    );
    expect(updateSettings(LIMIT_LIFTED)).toBe('Modificare le impostazioni. Numero massimo di appuntamenti futuri per persona: da 1 appuntamento a nessun limite.');
  });

  it('a type created, edited and deleted is named by its name; a capacity above 1 is said: both languages', () => {
    const en = ASSISTANT_TEXTS_EN.changes;
    const it_ = ASSISTANT_TEXTS_IT.changes;
    expect(en.createType(TYPE_ONE)).toBe('Create the appointment type "Phone call".');
    expect(en.createType(TYPE_EIGHT)).toBe('Create the appointment type "Yoga", for 8 people at the same time.');
    expect(en.deleteType({ name: 'Visit' })).toBe('Delete the appointment type "Visit".');
    expect(it_.createType(TYPE_ONE)).toBe('Creare il tipo di appuntamento «Phone call».');
    expect(it_.createType(TYPE_EIGHT)).toBe('Creare il tipo di appuntamento «Yoga», per 8 persone contemporaneamente.');
    expect(it_.deleteType({ name: 'Visit' })).toBe('Eliminare il tipo di appuntamento «Visit».');
  });

  it('an edited type says each change: a name alone as a rename, a capacity with both numbers, and that nobody is cancelled when it goes below the people booked', () => {
    const en = ASSISTANT_TEXTS_EN.changes.editType;
    const it_ = ASSISTANT_TEXTS_IT.changes.editType;
    expect(en(RENAMED)).toBe('Rename the appointment type "Visit" to "Check-up".');
    expect(en(RAISED)).toBe('Change the appointment type "Swimming Pool": capacity from 3 to 5.');
    expect(en(BOTH)).toBe('Change the appointment type "Swimming Pool": name to "Pool", capacity from 3 to 5.');
    expect(en(LOWERED)).toBe(
      'Change the appointment type "Swimming Pool": capacity from 3 to 1. Nobody already booked is cancelled: where more people are booked than the new capacity, nobody else can book until some leave.',
    );
    expect(it_(RENAMED)).toBe('Rinominare il tipo di appuntamento «Visit» in «Check-up».');
    expect(it_(RAISED)).toBe('Modificare il tipo di appuntamento «Swimming Pool»: capienza da 3 a 5.');
    expect(it_(BOTH)).toBe('Modificare il tipo di appuntamento «Swimming Pool»: nome in «Pool», capienza da 3 a 5.');
    expect(it_(LOWERED)).toBe(
      'Modificare il tipo di appuntamento «Swimming Pool»: capienza da 3 a 1. Nessuna prenotazione esistente viene annullata: dove le persone prenotate sono più della nuova capienza, nessun altro può prenotare finché qualcuno non lascia il posto.',
    );
  });

  it('a booking and a move over the capacity say how many people the time will hold and its capacity: both languages', () => {
    expect(ASSISTANT_TEXTS_EN.changes.bookAppointment(BOOKING_OVER)).toBe(
      'Book an appointment for alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Swimming Pool). Over the capacity: it will hold 4 people, its capacity is 3. Note: "Bring the documents"',
    );
    expect(ASSISTANT_TEXTS_IT.changes.bookAppointment(BOOKING_OVER)).toBe(
      'Prenotare per alice un appuntamento per martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Swimming Pool). Oltre la capienza: ospiterà 4 persone, la sua capienza è 3. Nota: «Bring the documents»',
    );
    expect(ASSISTANT_TEXTS_EN.changes.changeAppointment({ appointment: OF_ALICE, to: TO_OVER })).toBe(
      'Move the appointment of alice on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit), to Thursday 26 November 2026, from 09:00 to 10:00 (Swimming Pool). Over the capacity: it will hold 5 people, its capacity is 3.',
    );
    expect(ASSISTANT_TEXTS_IT.changes.changeAppointment({ appointment: OF_ALICE, to: TO_OVER })).toBe(
      "Spostare l'appuntamento di alice di martedì 24 novembre 2026, dalle 10:00 alle 11:00 (Visit), a giovedì 26 novembre 2026, dalle 09:00 alle 10:00 (Swimming Pool). Oltre la capienza: ospiterà 5 persone, la sua capienza è 3.",
    );
  });

  it('a weekly pattern is named by its weekday, its hours, its type and its dates, in both languages', () => {
    const en = ASSISTANT_TEXTS_EN.changes;
    const it_ = ASSISTANT_TEXTS_IT.changes;
    expect(en.createPattern(PATTERN)).toBe('Create a weekly pattern: every Tuesday, from 09:00 to 12:00 (Visit), valid from Tuesday 1 December 2026, with no end.');
    expect(it_.createPattern(PATTERN)).toBe('Creare un orario settimanale: ogni martedì, dalle 09:00 alle 12:00 (Visit), valido da martedì 1 dicembre 2026, senza scadenza.');
    expect(en.deletePattern(PATTERN_ENDING)).toBe('Delete the weekly pattern: every Tuesday, from 14:00 to 24:00 (Visit), valid from Tuesday 1 December 2026 until Thursday 31 December 2026.');
    expect(it_.deletePattern(PATTERN_ENDING)).toBe("Eliminare l'orario settimanale: ogni martedì, dalle 14:00 alle 24:00 (Visit), valido da martedì 1 dicembre 2026 fino a giovedì 31 dicembre 2026.");
  });

  it('a change to a weekly pattern shows it as it is and as it would become, in both languages', () => {
    expect(ASSISTANT_TEXTS_EN.changes.updatePattern({ from: PATTERN, to: PATTERN_ENDING })).toBe(
      'Change a weekly pattern. As it is now: every Tuesday, from 09:00 to 12:00 (Visit), valid from Tuesday 1 December 2026, with no end. ' +
        'As it would become: every Tuesday, from 14:00 to 24:00 (Visit), valid from Tuesday 1 December 2026 until Thursday 31 December 2026.',
    );
    expect(ASSISTANT_TEXTS_IT.changes.updatePattern({ from: PATTERN, to: PATTERN_ENDING })).toBe(
      "Modificare un orario settimanale. Com'è ora: ogni martedì, dalle 09:00 alle 12:00 (Visit), valido da martedì 1 dicembre 2026, senza scadenza. " +
        'Come diventerebbe: ogni martedì, dalle 14:00 alle 24:00 (Visit), valido da martedì 1 dicembre 2026 fino a giovedì 31 dicembre 2026.',
    );
  });

  it('new hours for a day of patterns show the day as it is, from the patterns, and as it would become', () => {
    expect(ASSISTANT_TEXTS_EN.changes.setDateOverride(BLOCKED)).toBe(
      'Set the hours of Tuesday 24 November 2026, for this day only. As it is now (from the weekly patterns): 09:00–12:00 (Visit), 14:00–18:00 (Visit). ' +
        'As it would become: 09:00–12:00 (Visit), 16:00–18:00 (Visit).',
    );
    expect(ASSISTANT_TEXTS_IT.changes.setDateOverride(BLOCKED)).toBe(
      "Impostare gli orari di martedì 24 novembre 2026, solo per questo giorno. Com'è ora (dagli orari settimanali): 09:00–12:00 (Visit), 14:00–18:00 (Visit). " +
        'Come diventerebbe: 09:00–12:00 (Visit), 16:00–18:00 (Visit).',
    );
    expect(ASSISTANT_TEXTS_EN.changes.setDateOverride(NO_PATTERN_HOURS)).toContain('As it is now (from the weekly patterns): no hours. As it would become: 09:00–12:00 (Visit).');
    expect(ASSISTANT_TEXTS_IT.changes.setDateOverride(NO_PATTERN_HOURS)).toContain("Com'è ora (dagli orari settimanali): nessun orario. Come diventerebbe: 09:00–12:00 (Visit).");
  });

  it('a day that has hours of its own is closed with no hours, and its extra window is said to stay', () => {
    expect(ASSISTANT_TEXTS_EN.changes.setDateOverride(CLOSED)).toBe(
      "Set the hours of Tuesday 24 November 2026, for this day only. As it is now (this day's own hours): 09:00–12:00 (Visit), 16:00–18:00 (Visit). " +
        'As it would become: not available. The extra window 19:00–20:00 (Phone call) of this day is not changed.',
    );
    expect(ASSISTANT_TEXTS_IT.changes.setDateOverride(CLOSED)).toBe(
      "Impostare gli orari di martedì 24 novembre 2026, solo per questo giorno. Com'è ora (orari propri di questo giorno): 09:00–12:00 (Visit), 16:00–18:00 (Visit). " +
        'Come diventerebbe: non disponibile. La finestra aggiuntiva 19:00–20:00 (Phone call) di questo giorno non cambia.',
    );
  });

  it('a closed day is opened, and several extra windows are said to stay', () => {
    expect(ASSISTANT_TEXTS_EN.changes.setDateOverride(OPENED)).toBe(
      "Set the hours of Tuesday 24 November 2026, for this day only. As it is now (this day's own hours): not available. As it would become: 09:00–12:00 (Visit). " +
        'The extra windows 19:00–20:00 (Phone call), 21:00–22:00 (Phone call) of this day are not changed.',
    );
    expect(ASSISTANT_TEXTS_IT.changes.setDateOverride(OPENED)).toBe(
      "Impostare gli orari di martedì 24 novembre 2026, solo per questo giorno. Com'è ora (orari propri di questo giorno): non disponibile. Come diventerebbe: 09:00–12:00 (Visit). " +
        'Le finestre aggiuntive 19:00–20:00 (Phone call), 21:00–22:00 (Phone call) di questo giorno non cambiano.',
    );
  });

  it('a day that goes back to the weekly patterns shows its own hours and those the patterns would give it', () => {
    expect(ASSISTANT_TEXTS_EN.changes.deleteDateOverride(BACK_TO_PATTERNS)).toBe(
      "Go back to the weekly patterns on Tuesday 24 November 2026. As it is now (this day's own hours): not available. " +
        'As it would become (from the weekly patterns): 09:00–12:00 (Visit), 14:00–18:00 (Visit).',
    );
    expect(ASSISTANT_TEXTS_IT.changes.deleteDateOverride(BACK_TO_PATTERNS)).toBe(
      "Tornare agli orari settimanali per martedì 24 novembre 2026. Com'è ora (orari propri di questo giorno): non disponibile. " +
        'Come diventerebbe (dagli orari settimanali): 09:00–12:00 (Visit), 14:00–18:00 (Visit).',
    );
    expect(ASSISTANT_TEXTS_EN.changes.deleteDateOverride(BACK_TO_NOTHING)).toBe(
      "Go back to the weekly patterns on Tuesday 24 November 2026. As it is now (this day's own hours): 16:00–18:00 (Visit). " +
        'As it would become (from the weekly patterns): no hours. The extra window 19:00–20:00 (Phone call) of this day is not changed.',
    );
  });

  it('an extra window is named by its date, its hours and its type, in both languages', () => {
    expect(ASSISTANT_TEXTS_EN.changes.createOneOffWindow(WINDOW)).toBe('Create an extra window on Tuesday 24 November 2026, from 19:00 to 20:00 (Phone call).');
    expect(ASSISTANT_TEXTS_IT.changes.createOneOffWindow(WINDOW)).toBe('Creare una finestra aggiuntiva per martedì 24 novembre 2026, dalle 19:00 alle 20:00 (Phone call).');
    expect(ASSISTANT_TEXTS_EN.changes.deleteOneOffWindow(WINDOW)).toBe('Delete the extra window of Tuesday 24 November 2026, from 19:00 to 20:00 (Phone call).');
    expect(ASSISTANT_TEXTS_IT.changes.deleteOneOffWindow(WINDOW)).toBe('Eliminare la finestra aggiuntiva di martedì 24 novembre 2026, dalle 19:00 alle 20:00 (Phone call).');
  });

  it('the longest sentence of a day (ten stretches of hours as it is, ten as it would become, ten extra windows, the longest names) stays under 2 000 characters', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ start: `${String(i * 2).padStart(2, '0')}:15`, end: `${String(i * 2 + 1).padStart(2, '0')}:45`, type: 'W'.repeat(40) }));
    const longest = { date: '2026-09-30', now: { from: 'own' as const, windows: ten }, then: { from: 'own' as const, windows: ten }, extras: ten };
    expect(ASSISTANT_TEXTS_EN.changes.setDateOverride(longest)).toHaveLength(1847);
    expect(ASSISTANT_TEXTS_IT.changes.setDateOverride(longest)).toHaveLength(1870);
  });
});
