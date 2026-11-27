import { Language, SUPPORTED_LANGUAGES } from '../language/languages';

// The languages a conversation with the assistant can be held in
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.2): the calendar's one list of languages
// (docs/MULTILANGUAGE_ARCHITECTURE.md decision L9), under the assistant's own names.
export const ASSISTANT_LANGUAGES = SUPPORTED_LANGUAGES;

/** One of the supported languages; as a schema, it accepts the entries of the list and nothing else. */
export const AssistantLanguage = Language;
export type AssistantLanguage = Language;

// The language of a first message written in none of the supported ones, and of the screen's
// fixed sentences while there is no conversation (docs/CONVERSATIONAL_ARCHITECTURE.md sections
// 4.2 and 6.1).
export const DEFAULT_ASSISTANT_LANGUAGE: AssistantLanguage = 'en';
