// The public surface of the shared package: the API contract, the username rule and the
// calendar's time model (docs/FOLDER_STRUCTURE.md section 6). Consumers import from
// '@shared-calendar/shared' only.
export * from './api';
export * from './roles';
export * from './username';
export * from './calendar/defaults';
export * from './calendar/schemas';
export * from './calendar/time';
