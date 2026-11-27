import { z } from 'zod';

// The one list of the languages the calendar speaks: the pages, the mails, the invitation and the
// assistant (docs/MULTILANGUAGE_ARCHITECTURE.md decision L9). Adding one is adding its entry here
// and its own name below; the compiler then asks for every object of texts it still misses
// (docs/MULTILANGUAGE_ARCHITECTURE.md section 5.3).
export const SUPPORTED_LANGUAGES = ['en', 'it'] as const;

/** One of the supported languages; as a schema, it accepts the entries of the list and nothing else. */
export const Language = z.enum(SUPPORTED_LANGUAGES);
export type Language = z.infer<typeof Language>;

/** Each language under its own name, as a person who speaks it looks for it in a list of languages. */
export const LANGUAGE_OWN_NAMES: Record<Language, string> = { en: 'English', it: 'Italiano' };

/**
 * A stored language as every reader takes it (docs/MULTILANGUAGE_ARCHITECTURE.md section 4.1): a
 * value of the list, or `null` for "none yet" when it is missing or is any other word, which Cognito
 * does not refuse. The reader then uses the default.
 */
export function readLanguage(value: unknown): Language | null {
  const parsed = Language.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The first of a browser's languages, in its order of preference, that the calendar speaks, or
 * `null` when none is. A tag with a region counts as its language: `it-IT` is `it`.
 */
export function chooseLanguage(preferred: readonly string[]): Language | null {
  for (const tag of preferred) {
    const language = readLanguage(tag.split('-')[0]!.toLowerCase());
    if (language !== null) return language;
  }
  return null;
}
