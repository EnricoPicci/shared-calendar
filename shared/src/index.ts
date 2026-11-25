// The public surface of the shared package: the API contract, the user account (the username rule
// and the four facts), the password rule, the calendar's contract, time model and rules, the
// assistant's contract and fixed texts, and e-mail's contract and texts (docs/FOLDER_STRUCTURE.md
// section 6). Consumers import from '@shared-calendar/shared' only.
export * from './api';
export * from './password';
export * from './roles';
export * from './user';
export * from './assistant/languages';
export * from './assistant/limits';
export * from './assistant/schemas';
export * from './assistant/texts';
export * from './assistant/texts.en';
export * from './assistant/texts.it';
export * from './assistant/types';
export * from './calendar/defaults';
export * from './calendar/rules';
export * from './calendar/schemas';
export * from './calendar/time';
export * from './calendar/types';
export * from './mail/limits';
export * from './mail/mask';
export * from './mail/schemas';
export * from './mail/texts';
