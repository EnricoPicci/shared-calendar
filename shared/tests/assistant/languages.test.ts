import { ASSISTANT_LANGUAGES, AssistantLanguage, DEFAULT_ASSISTANT_LANGUAGE } from '../../src/index';

// The languages of a conversation (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.2).
describe('the assistant languages', () => {
  it('are English and Italian', () => {
    expect(ASSISTANT_LANGUAGES).toEqual(['en', 'it']);
  });

  it('default to English, which is in the list', () => {
    expect(DEFAULT_ASSISTANT_LANGUAGE).toBe('en');
    expect(ASSISTANT_LANGUAGES).toContain(DEFAULT_ASSISTANT_LANGUAGE);
  });

  it.each(ASSISTANT_LANGUAGES)('the schema accepts %s', (language) => {
    expect(AssistantLanguage.safeParse(language)).toEqual({ success: true, data: language });
  });

  it.each([['a third language', 'fr'], ['upper case', 'EN'], ['a longer tag', 'it-IT'], ['an empty string', ''], ['null', null]])(
    'the schema rejects %s',
    (_case, language) => {
      expect(AssistantLanguage.safeParse(language).success).toBe(false);
    },
  );
});
