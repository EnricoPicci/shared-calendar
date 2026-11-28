import { readLanguage, type Language } from '@shared-calendar/shared';

// What this browser remembers of the page's language (docs/MULTILANGUAGE_PLAN.md finding F11):
// one entry of the browser's storage, so that the sign-in screen is in the language last used
// here. The storage is handed in by the entry file. A storage that refuses, as in a private
// window, or that holds a word not in the list counts as remembering nothing; a write it refuses
// is forgotten in silence: the language is then the browser's again at the next visit.

// The name of the one entry.
export const LANGUAGE_KEY = 'shared-calendar.language';

// The two methods of the browser's storage that the memory uses.
export type LanguageStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class LanguageMemory {
  constructor(private readonly storage: LanguageStorage | null) {}

  /** The language this browser remembers, or null. */
  read(): Language | null {
    try {
      return readLanguage(this.storage?.getItem(LANGUAGE_KEY));
    } catch {
      return null;
    }
  }

  /** Remembers `language` in this browser. */
  write(language: Language): void {
    try {
      this.storage?.setItem(LANGUAGE_KEY, language);
    } catch {
      // A storage that refuses: nothing is remembered.
    }
  }
}
