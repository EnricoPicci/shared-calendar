import { readdirSync, readFileSync } from 'node:fs';
import { pad, PADDED_CLOSE, PADDED_OPEN, padded } from '../../../src/texts/padded';
import { PAGE_TEXT_BUDGETS, type PageTexts } from '../../../src/texts/texts';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// The checks of the page texts (docs/MULTILANGUAGE_ARCHITECTURE.md section 5.2): every text is
// there and answers, every budgeted text is within its budget, the padded test language marks
// every text. The page's keys are checked against index.html in tests/unit/views/page-texts.test.ts.

// The languages of the page, each with its texts. The padded test language is not one of them: a
// budget does not bind it.
const LANGUAGES: [string, PageTexts][] = [['en', PAGE_TEXTS_EN]];

// The sample values each function text is called with, by its path: a new function text needs
// its line here, or the test that every function answers fails.
const SAMPLES: Record<string, unknown[]> = {
  'failures.typeLimit': [20],
  'failures.patternLimit': [100],
  'failures.windowLimit': [5],
  'failures.messageRefused': [2000],
  'failures.mailRefused': [31],
  'password.problems.too_short': [12],
  'week.placesLeft': [2, 3],
  'week.tabLeft': [2],
  'week.people': [5],
  'week.busyFor': ['alice', '10:00–11:00 · Studio'],
  'week.busyYou': ['10:00–11:00 · Studio'],
  'appointment.bookedBy': ['admin', 'Thu 19 Nov, 13:24'],
  'appointment.until': ['Sun 22 Nov, 10:00'],
  'mail.sentTo': ['a•••@example.com'],
  'list.periodTooLong': [92],
  'profile.givenName': [100],
  'profile.familyName': [100],
  'profile.email': [254],
  'profile.address': [500],
  'users.edit': ['alice'],
  'users.resend': ['alice'],
  'users.remove': ['alice'],
  'users.inviteQuestion': ['anna@example.com'],
  'users.invitedAnswer': ['anna@example.com'],
  'users.deleteQuestion': ['alice'],
  'password.problems.too_long': [256],
  'password.problems.no_symbol': ['^ $ * .'],
  'dates.shortDate': ['2026-11-16'],
  'dates.shortDateWithYear': ['2026-12-01'],
  'dates.longDate': ['2026-11-20'],
  'dates.fullDate': ['2026-11-24'],
  'dates.weekLabel': ['2026-12-28', '2027-01-03'],
  'dates.weekdayName': [3],
};

type Leaf = { path: string; value: unknown };

// Every text of an object of texts, by its path: the strings and the functions.
function leaves(value: unknown, path = ''): Leaf[] {
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, inner]) => leaves(inner, path === '' ? key : `${path}.${key}`));
  return [{ path, value }];
}

// The text of a leaf: a string as it is, a function's answer to its samples.
const textOf = ({ path, value }: Leaf) => (typeof value === 'function' ? (value as (...args: unknown[]) => unknown)(...SAMPLES[path]!) : value);

describe('the page texts', () => {
  it.each(LANGUAGES)('%s: every text is a string or a function, none empty', (_language, texts) => {
    for (const leaf of leaves(texts)) {
      expect(['string', 'function'], leaf.path).toContain(typeof leaf.value);
      if (typeof leaf.value === 'string') expect(leaf.value.trim(), leaf.path).not.toBe('');
    }
  });

  it.each(LANGUAGES)('%s: every function answers its sample values with a text that is not empty', (_language, texts) => {
    for (const leaf of leaves(texts).filter((l) => typeof l.value === 'function')) {
      expect(SAMPLES[leaf.path], `no sample values for ${leaf.path}`).toBeDefined();
      const text = textOf(leaf);
      expect(typeof text, leaf.path).toBe('string');
      expect((text as string).trim(), leaf.path).not.toBe('');
    }
  });

  it('every sample is for a function text that exists', () => {
    const functions = leaves(PAGE_TEXTS_EN).filter((l) => typeof l.value === 'function').map((l) => l.path);
    expect(Object.keys(SAMPLES).sort()).toEqual(functions.sort());
  });
});

// Test names: the section number is that of docs/MULTILANGUAGE_ARCHITECTURE.md.
describe('the length budgets (6.3)', () => {
  const budgets = leaves(PAGE_TEXT_BUDGETS);

  it('every budget is a whole number for a text that exists', () => {
    const texts = new Map(leaves(PAGE_TEXTS_EN).map((leaf) => [leaf.path, leaf]));
    for (const { path, value } of budgets) {
      expect(texts.has(path), path).toBe(true);
      expect(Number.isInteger(value) && (value as number) > 0, path).toBe(true);
    }
  });

  it.each(LANGUAGES)('%s: every budgeted text is within its budget', (_language, texts) => {
    const all = new Map(leaves(texts).map((leaf) => [leaf.path, leaf]));
    for (const { path, value } of budgets) expect((textOf(all.get(path)!) as string).length, path).toBeLessThanOrEqual(value as number);
  });
});

// Test names: the section number is that of docs/MULTILANGUAGE_ARCHITECTURE.md.
describe('the padded test language (6.3)', () => {
  it('puts a text between the marks, a third longer', () => {
    expect(pad('Sign out')).toBe(`${PADDED_OPEN}Sign out···${PADDED_CLOSE}`);
    expect(pad('Week')).toBe(`${PADDED_OPEN}Week··${PADDED_CLOSE}`);
  });

  it('marks every text of the English page, a string or a function\'s answer, and keeps the shape', () => {
    const marked = leaves(padded(PAGE_TEXTS_EN));
    expect(marked.map((leaf) => leaf.path)).toEqual(leaves(PAGE_TEXTS_EN).map((leaf) => leaf.path));
    for (const leaf of marked) expect(textOf(leaf), leaf.path).toMatch(new RegExp(`^${PADDED_OPEN}[^]+·+${PADDED_CLOSE}$`));
    expect(padded(PAGE_TEXTS_EN).dates.shortDate('2026-11-16')).toBe(pad('Mon 16 Nov'));
  });

  it('keeps a list as a list and anything that is not a text as it is', () => {
    const odd = padded({ list: ['a'], count: 3 } as unknown as PageTexts) as unknown as { list: string[]; count: number };
    expect(odd).toEqual({ list: [pad('a')], count: 3 });
  });
});

// While the screens are moved onto the page texts group by group
// (docs/MULTILANGUAGE_PLAN.md decision D6), the files of the logic layer and the views not yet
// moved take the English texts straight. The list only shortens; the last group leaves the shell
// alone in it, which starts the page in a language.
describe('the files that take the English texts straight', () => {
  const SRC = `${import.meta.dirname}/../../../src`;
  const inFolder = (folder: string) =>
    readdirSync(`${SRC}/${folder}`)
      .filter((name) => name.endsWith('.ts') && readFileSync(`${SRC}/${folder}/${name}`, 'utf8').includes("from '../texts/texts.en'"))
      .map((name) => `${folder}/${name}`);

  it('are those not yet moved, and no other', () => {
    expect([...inFolder('logic'), ...inFolder('views')].sort()).toEqual([
      'logic/assistant.model.ts',
      'logic/availability.model.ts',
      'logic/availability.screen.ts',
      'logic/conflicts.ts',
      'logic/daily-mail.screen.ts',
      'logic/date.model.ts',
      'logic/date.screen.ts',
      'logic/settings.model.ts',
      'logic/settings.screen.ts',
      'views/availability.view.ts',
      'views/shell.ts',
    ]);
  });
});
