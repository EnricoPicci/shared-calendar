// The public surface of the shared package: the API contract, the username rule, the
// calendar's contract, time model and rules, and the assistant's contract and fixed texts
// (docs/FOLDER_STRUCTURE.md section 6). Consumers import from '@shared-calendar/shared' only.
export * from './api';
export * from './roles';
export * from './username';
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
