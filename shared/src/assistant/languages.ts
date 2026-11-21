import { z } from 'zod';

// The languages a conversation with the assistant can be held in
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.2). Adding one is adding its entry here and its
// object of fixed texts, which `assistantTexts` then requires.
export const ASSISTANT_LANGUAGES = ['en', 'it'] as const;

/** One of the supported languages; as a schema, it accepts the entries of the list and nothing else. */
export const AssistantLanguage = z.enum(ASSISTANT_LANGUAGES);
export type AssistantLanguage = z.infer<typeof AssistantLanguage>;

// The language of a first message written in none of the supported ones, and of the screen's
// fixed sentences while there is no conversation (docs/CONVERSATIONAL_ARCHITECTURE.md sections
// 4.2 and 6.1).
export const DEFAULT_ASSISTANT_LANGUAGE: AssistantLanguage = 'en';
