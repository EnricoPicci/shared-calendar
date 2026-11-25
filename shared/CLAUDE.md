# shared/

Package `@shared-calendar/shared`: what the back end and the browser both import. This file
adds to the root `CLAUDE.md`, whose rules all apply here. Paths are relative to `shared/`.

- It imports no AWS SDK, no Node-only module and no DOM API: only TypeScript and `zod`. A new
  error code or response field starts in `src/api.ts`.
- No build step: `exports` points at `src/index.ts`, and each consumer bundles it.
- `src/calendar/time.ts` uses `Intl` only, never the machine's zone.

## Folder map

- `src/api.ts`: response and error body types, `ApiErrorCode`.
- `src/roles.ts`: `Role`, `resolveRole`.
- `src/user.ts`: the username pattern and schemas; the four facts of a person (`UserProfile`,
  `PROFILE_LIMITS`), `CreateUserBody`, `UpdateUserBody`, `UserSummary`, `MeResponse`.
- `src/password.ts`: the pool's password rule (`PASSWORD_POLICY`, `PASSWORD_SYMBOLS`,
  `passwordProblems`, `Password`); a unit test of the back end holds it to
  `backend/template.yaml`, so a change of the pool's policy is a change of both.
- `src/calendar/`: the shared calendar. `time.ts`, the time-zone helpers; `schemas.ts`, the zod
  schemas: primitives, request bodies, path and query parameters; `types.ts`, the response and
  event types; `rules.ts`, the pure rules: defined and effective windows, slots, overlap,
  the people in an interval (`peopleIn`), the 5-minute step (`isOnTimeStep`), windows of whole
  hours (`lastsWholeHours`), `cancellableUntil`; `defaults.ts`, default
  settings, limits, settings ranges and the type's capacity range.
- `src/assistant/`: the assistant's contract. `types.ts`, `AssistantReply` and its parts;
  `schemas.ts`, the body of a message; `limits.ts`; `languages.ts`, the list `en`, `it`;
  `texts.ts`, the type `AssistantTexts`, with one object per language in `texts.en.ts` and
  `texts.it.ts`: a new text goes into both.
- `src/mail/`: the mail's contract. `schemas.ts`, the mail settings and `MailCalendarBody`;
  `limits.ts`; `texts.ts`, a mail's subject, text and HTML per kind; `mask.ts`, `maskAddress`.
- `src/index.ts`: re-exports.
- `tests/` mirrors `src/`. Generated, git-ignored: `coverage/`.

## Tests

- `vitest.config.ts`: one project (`tests/**/*.test.ts`), 100 % line coverage on `src/`.
- Tests of the contract itself (what a schema accepts, `resolveRole`) live here; the back end
  tests what it does with it (the 400 answer, the handlers).
- `npm run typecheck -w @shared-calendar/shared`: the package has no Node types.
