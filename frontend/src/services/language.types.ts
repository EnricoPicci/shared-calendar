import type { Language } from '@shared-calendar/shared';

// The types of LanguageService (docs/MULTILANGUAGE_PLAN.md finding F11).

export type LanguageFailureReason =
  | 'not_signed_in' // the store is empty: no request
  | 'session_rejected' // NotAuthorizedException: Cognito no longer takes the access token
  | 'too_many_attempts' // LimitExceededException, TooManyRequestsException
  | 'network' // fetch rejected: offline, DNS, CORS, refused
  | 'server' // 5xx, or a failure whose body is not JSON
  | 'unexpected'; // any other answer

// The read: the account's language, or null when it holds none or a word that is not a language
// of the calendar (docs/MULTILANGUAGE_ARCHITECTURE.md section 4.1). No value holds a token, and
// nothing of the account but its language is kept.
export type LanguageReadResult = { status: 'success'; language: Language | null } | { status: 'failure'; reason: LanguageFailureReason; message: string };

// The write: the language now stored.
export type LanguageWriteResult = { status: 'success'; language: Language } | { status: 'failure'; reason: LanguageFailureReason; message: string };

export type LanguageWriteState = { status: 'idle' } | { status: 'pending'; language: Language } | LanguageWriteResult;
