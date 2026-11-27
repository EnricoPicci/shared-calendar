import type { Language } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable } from 'rxjs';
import type { PageTexts } from '../texts/texts';

// The page's language, page-wide (docs/MULTILANGUAGE_PLAN.md finding F4): the language in use and
// its page texts, made once by the shell at the start. The shell fills the page from it and hands
// the texts to the logic objects it makes for a person; they keep them for their life
// (docs/MULTILANGUAGE_PLAN.md decisions D1 and D2).

/** A language and its page texts. `language` is what the page's `<html lang>` says. */
export type PageLanguageState = { language: Language; texts: PageTexts };

export class PageLanguage {
  private readonly current: BehaviorSubject<PageLanguageState>;

  /** The language in use, from the one the page starts with. */
  readonly state$: Observable<PageLanguageState>;

  constructor(first: PageLanguageState) {
    this.current = new BehaviorSubject(first);
    this.state$ = this.current.asObservable();
  }

  /** The language in use now. */
  get state(): PageLanguageState {
    return this.current.value;
  }
}
