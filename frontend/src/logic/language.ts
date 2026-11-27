import { chooseLanguage, type Language } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable } from 'rxjs';
import type { PageTexts } from '../texts/texts';

// The page's language, page-wide (docs/MULTILANGUAGE_PLAN.md finding F4): the language in use and
// its page texts, made once by the shell at the start. The shell fills the page from it and hands
// the texts to the logic objects it makes for a person; they keep them for their life
// (docs/MULTILANGUAGE_PLAN.md decisions D1 and D2). Before sign-in the person may choose another
// language: the stream then gives it, and this browser remembers it.

/** A language and its page texts. `language` is what the page's `<html lang>` says. */
export type PageLanguageState = { language: Language; texts: PageTexts };

// What the page's language uses of the browser's memory (src/services/language-memory.ts).
export type LanguageMemoryCalls = { read(): Language | null; write(language: Language): void };

// The language the page starts in, before anyone signs in (docs/MULTILANGUAGE_PLAN.md finding
// F11): the one this browser remembers; else the first of the browser's own languages, in its
// order of preference, that the calendar speaks (`it-IT` counts as `it`); else the default built
// into the bundle.
export function firstLanguage(remembered: Language | null, preferred: readonly string[], fallback: Language): Language {
  return remembered ?? chooseLanguage(preferred) ?? fallback;
}

export class PageLanguage {
  private readonly current: BehaviorSubject<PageLanguageState>;

  /** The language in use, from the one the page starts with, and every change after it. */
  readonly state$: Observable<PageLanguageState>;

  // `textsOf` gives the page texts of a language; `memory` is this browser's.
  constructor(
    first: Language,
    private readonly textsOf: (language: Language) => PageTexts,
    private readonly memory: LanguageMemoryCalls,
  ) {
    this.current = new BehaviorSubject({ language: first, texts: textsOf(first) });
    this.state$ = this.current.asObservable();
  }

  /** The language in use now. */
  get state(): PageLanguageState {
    return this.current.value;
  }

  /** Another language, chosen by the person: remembered by this browser, and given to the stream when it differs. */
  choose(language: Language): void {
    this.memory.write(language);
    if (language !== this.current.value.language) this.current.next({ language, texts: this.textsOf(language) });
  }
}
