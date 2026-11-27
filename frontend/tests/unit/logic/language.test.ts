import { firstValueFrom } from 'rxjs';
import { PageLanguage } from '../../../src/logic/language';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';
import { useFarBrowserZone } from './zone';

// The page's language (docs/MULTILANGUAGE_PLAN.md finding F4).
describe('PageLanguage', () => {
  useFarBrowserZone();

  it('holds the language it starts with and its texts, and gives them as a stream', async () => {
    const first = { language: 'en' as const, texts: PAGE_TEXTS_EN };
    const language = new PageLanguage(first);
    expect(language.state).toBe(first);
    expect(await firstValueFrom(language.state$)).toBe(first);
  });
});
