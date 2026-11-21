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
const BOOKING = { date: '2026-11-24', start: '10:00', end: '11:00', type: 'Visit', note: null, secondTime: false };
const BOOKING_WITH_NOTE = { ...BOOKING, note: 'Bring the documents' };
const BOOKING_SECOND_TIME = { date: '2026-10-25', start: '02:00', end: '03:00', type: 'Visit', note: null, secondTime: true };

// The arguments each text that is a function is tried with: every number of changes a proposal
// may hold, and each shape of a booking. A new function among the texts needs its entry here, or
// the test below fails.
const SAMPLES: Record<string, unknown[][]> = {
  proposalQuestion: Array.from({ length: ASSISTANT_LIMITS.changesPerProposal }, (_, i) => [i + 1]),
  'changes.bookAppointment': [[BOOKING], [BOOKING_WITH_NOTE], [BOOKING_SECOND_TIME]],
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
});
