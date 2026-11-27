import { firstValueFrom } from 'rxjs';
import { firstLanguage, PageLanguage } from '../../../src/logic/language';
import { PAGE_TEXTS } from '../../../src/texts/texts';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';
import { PAGE_TEXTS_IT } from '../../../src/texts/texts.it';
import { useFarBrowserZone } from './zone';

// The page's language (docs/MULTILANGUAGE_PLAN.md findings F4 and F11).
describe('the page\'s language', () => {
  useFarBrowserZone();

  describe('firstLanguage', () => {
    it.each([
      ['what the browser remembers, before its own languages', 'it', ['en-GB'], 'en', 'it'],
      ['the first of the browser\'s own languages that the calendar speaks', null, ['fr-FR', 'it-IT', 'en'], 'en', 'it'],
      ['a language without a region', null, ['en'], 'it', 'en'],
      ['the default, when the browser names none the calendar speaks', null, ['fr', 'de-DE'], 'it', 'it'],
      ['the default, when the browser names none at all', null, [], 'en', 'en'],
    ] as const)('%s', (_case, remembered, preferred, fallback, expected) => {
      expect(firstLanguage(remembered, preferred, fallback)).toBe(expected);
    });
  });

  describe('PageLanguage', () => {
    const memory = () => ({ read: vi.fn(() => null), write: vi.fn() });

    it('holds the language it starts with and its texts, and gives them as a stream', async () => {
      const language = new PageLanguage('en', (code) => PAGE_TEXTS[code], memory());
      expect(language.state).toEqual({ language: 'en', texts: PAGE_TEXTS_EN });
      expect(await firstValueFrom(language.state$)).toEqual({ language: 'en', texts: PAGE_TEXTS_EN });
    });

    it('a language chosen: remembered, and given with its texts', () => {
      const remembered = memory();
      const language = new PageLanguage('en', (code) => PAGE_TEXTS[code], remembered);
      const states: string[] = [];
      language.state$.subscribe((state) => states.push(state.language));
      language.choose('it');
      expect(language.state).toEqual({ language: 'it', texts: PAGE_TEXTS_IT });
      expect(states).toEqual(['en', 'it']);
      expect(remembered.write).toHaveBeenCalledWith('it');
    });

    it('the language in use chosen again: remembered, and nothing given', () => {
      const remembered = memory();
      const language = new PageLanguage('it', (code) => PAGE_TEXTS[code], remembered);
      const states: string[] = [];
      language.state$.subscribe((state) => states.push(state.language));
      language.choose('it');
      expect(states).toEqual(['it']);
      expect(remembered.write).toHaveBeenCalledWith('it');
    });

    it('the texts are those `textsOf` gives for the language', () => {
      const textsOf = vi.fn((code: 'en' | 'it') => PAGE_TEXTS[code]);
      const language = new PageLanguage('it', textsOf, memory());
      expect(textsOf).toHaveBeenCalledWith('it');
      expect(language.state.texts).toBe(PAGE_TEXTS_IT);
    });
  });
});
