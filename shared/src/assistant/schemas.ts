import { z } from 'zod';
import { Language } from '../language/languages';
import { ASSISTANT_LIMITS } from './limits';

/**
 * The body of POST /assistant/messages (docs/CONVERSATIONAL_ARCHITECTURE.md section 6): the
 * person's text, trimmed, 1 to 2 000 characters after trimming, and, optionally, the page's
 * language, one of the list, which the server uses for a first message written in none of them
 * (docs/MULTILANGUAGE_ARCHITECTURE.md section 9); no other field. The length is
 * the JavaScript string length (UTF-16 code units, what a textarea's maxlength counts), as for the
 * calendar's texts. The id of a proposal in a path is checked with the calendar's `Ulid`.
 */
export const AssistantMessageBody = z
  .object({
    text: z
      .string()
      .trim()
      .refine((s) => s.length >= 1 && s.length <= ASSISTANT_LIMITS.messageLength, `1 to ${ASSISTANT_LIMITS.messageLength} characters`),
    language: Language.optional(),
  })
  .strict();
export type AssistantMessageBody = z.infer<typeof AssistantMessageBody>;
