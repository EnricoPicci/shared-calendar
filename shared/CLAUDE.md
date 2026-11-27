# shared/

Package `@shared-calendar/shared`: what the back end and the browser both import. This file
adds to the root `CLAUDE.md`, whose rules all apply here. Paths are relative to `shared/`.

- It imports no AWS SDK, no Node-only module and no DOM API: only TypeScript and `zod`. A new
  error code or response field starts in `src/api.ts`.
- No build step: `exports` points at `src/index.ts`, and each consumer bundles it.
- `src/calendar/time.ts` uses `Intl` only, never the machine's zone.
- A text a mail, a file, the invitation or the assistant shows a person is in that part's
  `texts.<language>.ts`, one object per language of `src/language/languages.ts`: a new text goes
  into every one, and the compiler finds a language that misses it. Names of days and months
  are in `src/language/formats.<language>.ts`, never asked of `Intl`.

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
  `schemas.ts`, the body of a message, with the page's language; `limits.ts`; `texts.ts`, the
  type `AssistantTexts`, with one object per language in `texts.en.ts` and `texts.it.ts`,
  the notes Claude gets of each language included.
- `src/language/`: `languages.ts`, the one list (`SUPPORTED_LANGUAGES`, `Language`, each
  language's own name, `readLanguage`, `chooseLanguage`); `formats.ts`, a language's date
  writers, with its names in `formats.en.ts` and `formats.it.ts`.
- `src/mail/`: the mail's contract. `schemas.ts`, the mail settings and `MailCalendarBody`;
  `limits.ts`; `texts.ts`, the type `MailTexts` and the functions that take a language (each
  mail's subject, text and HTML, the Excel file's words and names, the invitation), with the
  words in `texts.en.ts` and `texts.it.ts`; `mask.ts`, `maskAddress`.
- `src/index.ts`: re-exports.
- `tests/` mirrors `src/`. Generated, git-ignored: `coverage/`.

## Tests

- `vitest.config.ts`: one project (`tests/**/*.test.ts`), 100 % line coverage on `src/`.
- Tests of the contract itself (what a schema accepts, `resolveRole`) live here; the back end
  tests what it does with it (the 400 answer, the handlers).
- `npm run typecheck -w @shared-calendar/shared`: the package has no Node types.
