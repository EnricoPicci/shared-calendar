# frontend/

Package `frontend`: the browser's services layer and its view layer, both complete; it runs
locally and is deployed nowhere. This file adds to the root `CLAUDE.md`, whose rules all apply
here. Paths in this file are relative to `frontend/`.

What each file holds is in the documents, not here: the services in
`docs/FRONTEND_SERVICES.md`; the page, the views and the shell in
`docs/FRONTEND_ARCHITECTURE.md` sections 4 and 6; the logic layer in its section 5.1 (one row
per file); the sizes in its section 7.1. The layout: `docs/FOLDER_STRUCTURE.md` section 7. The
commands in full (`dev`, `seed:local`, `build`, the integration tests): `docs/COMMANDS.md`
sections 4 and 5.

After a change to the view layer, the check to repeat is the walk, `docs/FRONTEND_WALK.md`, by
hand in a browser; when a screen changes what one of its checks says, the check changes in the
same commit. The rules for the views' tests, the page and the style sheet load on their own
when those files are touched (`.claude/rules/frontend-views.md`).

## Folder map

- `package.json` (deps `rxjs`, `@shared-calendar/shared`; dev dep `happy-dom`; scripts `dev`,
  `build`, `seed:local`, `typecheck`, `lint`, `test:unit`, `test:integration`, `verify`; no
  `deploy`), `tsconfig.json` (ES2022 + DOM + DOM.Iterable, no node types), `vitest.config.ts`.
  No `template.yaml`: the hosting waits for the open points of `docs/FRONTEND_ARCHITECTURE.md`
  section 10.
- `src/services/`: `session.store.ts`; `cognito.ts`, `api.ts` and `jwt.ts`, the building
  blocks; then one `<name>.service.ts` + `<name>.types.ts` per service: `login`, `refresh`,
  `hello`, `users`, `calendar-settings`, `availability-types`, `availability-rules`,
  `calendar`, `appointments`. One result/state pair per method; input checked with the shared
  schemas before sending. Tokens live only in the `SessionStore`: no result, state or service
  field holds one.
- `index.html`: all the markup, everything `hidden`: the login `#login`; the frame `#app` with
  the header, the navigation and `main.screen`, which holds one element per screen (`#week`,
  `#appointments`, `#settings`, `#users`, `#availability`), each with its dialogs and its
  `<template>`s; and `dialog#detail`, in no screen. One module script `app.js`, one style
  sheet, nothing inline. No range, pattern, length or choice of a list is written in the page:
  the script sets them.
- `style.css`: the one style sheet.
- `src/main.ts`: the bundle's entry, one statement, the only file that knows `API_URL`,
  `COGNITO_URL` and `CLIENT_ID`.
- `src/views/`: `shell.ts` (`runShell`, `mountShell`, the table `SCREENS`, `sessionObjects`:
  new services and logic objects per person, a second `CalendarService` for a single date,
  never the week's); one `<name>.view.ts` per view, `mount<Name>(root, deps): Subscription`:
  `login`, `week`, `appointments`, `settings`, `users`, `availability` and `date` (two views of
  one screen); `detail.view.ts`, the dialog two views mount; `availability.parts.ts`, the
  helpers the availability's two views share, with `mountConfirm`.
- `src/logic/`: pure models (`texts.ts`, `week.model.ts`, `booking.ts`,
  `appointment.detail.ts`, `appointments.model.ts`, `settings.model.ts`, `users.model.ts`,
  `availability.model.ts`, `conflicts.ts`, `date.model.ts`) and one class per screen with one
  stream and `start()` (`week.screen.ts`, `appointments.screen.ts`, `settings.screen.ts`,
  `users.screen.ts`, `availability.screen.ts`, `date.screen.ts`).
- `scripts/` (Node, outside the browser's lint rules): `bundle.mjs`, `build.mjs`, `dev.mjs`,
  `seed-local.mjs`.
- `tests/unit/services/`, `tests/unit/logic/` (project `unit`, in node; `zone.ts`,
  `fixtures.ts`) and `tests/unit/views/` (project `views`, `happy-dom`; `page.ts`,
  `page.test.ts`, `shell.test.ts`) mirror `src/`; `tests/integration/` (`local.ts`,
  `login.service.test.ts`, `journeys.test.ts`, `calendar.test.ts`) runs the services against
  the local stack.
- Generated, git-ignored: `coverage/`, `dist/`.

## Rules that are easy to break

- `src/` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`, `@shared-calendar/shared` and
  relative files, and uses no Node global. vitest's types pull in `@types/node`, so the
  compiler does not stop a Node import in `src/`; ESLint does (root `eslint.config.js`). A new
  allowed import there is a design change: propose it first.
- No `innerHTML`, `outerHTML` or `insertAdjacentHTML` anywhere in `src/`; text goes in through
  `textContent`.
- No global `document` or `window` in `src/services` and `src/logic` (a parameter with that
  name is allowed). In `eslint.config.js` the block for those folders repeats the Node globals,
  because a later `no-restricted-globals` for the same files replaces the earlier list.
- A view never sees a token.
- No dialog has a `close` handler. A result is shown only in the dialog that asked for it.
- A teardown wipes what the view put in the page.
- The generated password is in one element of `dialog.created` and nowhere else, and never
  passes through the logic layer.
- `src/logic/` has no DOM, gets "now" passed in, and reads dates and times through `shared/`'s
  helpers in the calendar's zone, never the machine's.
- A new route's failure codes get their sentences in `src/logic/texts.ts` (`failureText`).

## Tests

- `vitest.config.ts`: projects `unit` and `integration` like the back end (integration selects
  files only with `RUN_INTEGRATION=1`), and `views` (`tests/unit/views/**`, environment
  `happy-dom`; `unit` stays in node and does not select that folder). `test:unit` runs `unit`
  and `views` with 100 % line coverage on `src/` (`src/main.ts` left out by name);
  `test:integration` runs `integration`.
- The services' unit tests stub `fetch` with `vi.stubGlobal` and real `Response` objects, no
  network, and use a service as a consumer would: subscribe first, then call.
- Tests that fake timers must fake `setInterval` too (RxJS's `timer` uses it), and keep test
  sessions within 24.8 days of the clock (the store's expiry `setTimeout` overflows beyond).
- An id that reaches a real service must be a ULID: the fixtures' `appt-…` ids are refused
  before any request.
- A comment of a test that names a fixture by a letter and a number, as the labelled items of
  the documents are named, is refused by lint: say it in words.
- The integration tests never reset the local `calendar` table and clean up after themselves;
  what they create, change and leave behind: `docs/COMMANDS.md` section 4.
- When a journey changes, its page under `docs/journeys/` changes in the same commit; the
  `describe` carries the pointer comment
  `// Explained in simple words in docs/journeys/<package>/<page>.md.` (format and list of
  pages: `docs/journeys/README.md`; the project skill `explain-journey` writes, checks and
  refreshes a page).
- Stopping a background `dev`: `pkill -f 'node scripts/dev[.]mjs'`, in a command that holds no
  other text matching it (a shell whose command line matches is killed too).

### The logic layer's tests

`tests/unit/logic/`, project `unit`, in node, no DOM.

- Fake services: plain objects, a subject for the stream, `vi.fn` for the methods; a
  `ReplaySubject(1)` for a result stream, which replays as the real one does. A fixed "now" is
  handed to the object under test, never a faked clock.
- Every file calls `useFarBrowserZone()` (`tests/unit/logic/zone.ts`) first: it sets
  `process.env.TZ` to `Pacific/Kiritimati` (UTC+14) and adds a test that the setting took, so a
  date or a time read in the machine's own zone is a wrong result. It relies on each test file
  running in a process of its own (vitest's default pool, `forks`).
- Calendar views for these tests and for the shell's come from `tests/unit/logic/fixtures.ts`
  (`view(monday, …)`, `appointment(…)`, `winterWeek()`).
- Cases to keep when the model changes: Rome in winter and in summer, a half-hour zone, the
  weeks of 2027-10-31 (clocks back) and 2027-03-28 (forward), a window ending at 24:00, an
  empty week, the hours widened, both roles.
