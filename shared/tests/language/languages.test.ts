import { chooseLanguage, Language, LANGUAGE_OWN_NAMES, readLanguage, SUPPORTED_LANGUAGES } from '../../src/index';

// The one list of languages (docs/MULTILANGUAGE_ARCHITECTURE.md sections 4.1 and 5).
describe('the supported languages', () => {
  it('are English and Italian', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'it']);
  });

  it('each have their own name, written in that language', () => {
    expect(LANGUAGE_OWN_NAMES).toEqual({ en: 'English', it: 'Italiano' });
  });

  it.each(SUPPORTED_LANGUAGES)('the schema accepts %s', (language) => {
    expect(Language.safeParse(language)).toEqual({ success: true, data: language });
  });

  it.each([['a third language', 'fr'], ['upper case', 'EN'], ['a longer tag', 'it-IT'], ['an empty string', ''], ['null', null]])(
    'the schema rejects %s',
    (_case, language) => {
      expect(Language.safeParse(language).success).toBe(false);
    },
  );
});

describe('reading a stored language', () => {
  it.each(SUPPORTED_LANGUAGES)('takes %s as it is', (language) => {
    expect(readLanguage(language)).toBe(language);
  });

  it.each([['a missing value', undefined], ['null', null], ['a word not in the list', 'klingon'], ['a tag with a region', 'it-IT'], ['upper case', 'IT'], ['a number', 1]])(
    'takes %s as none yet',
    (_case, value) => {
      expect(readLanguage(value)).toBeNull();
    },
  );
});

describe("choosing among a browser's languages", () => {
  it('takes a tag with a region as its language', () => {
    expect(chooseLanguage(['it-IT'])).toBe('it');
  });

  it('takes the first supported one in the order of preference', () => {
    expect(chooseLanguage(['de', 'it', 'en'])).toBe('it');
    expect(chooseLanguage(['en-GB', 'it'])).toBe('en');
  });

  it('reads a tag in any case', () => {
    expect(chooseLanguage(['IT-it'])).toBe('it');
  });

  it('answers none when no language is ours, or the browser gives none', () => {
    expect(chooseLanguage(['de-DE', 'fr'])).toBeNull();
    expect(chooseLanguage([])).toBeNull();
  });
});
