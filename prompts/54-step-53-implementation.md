## Brief

Implement plan step 53, "Front end: `api.ts` and the settings, types and availability services",
the thirteenth step of the shared calendar and the first one in `frontend/`, following CLAUDE.md's
working rhythm: one step, its acceptance check, an honest report, then stop for review. One stop at
the end. The design points are already decided (see "Design points (decided 2026-11-15)"): there is
no early stop for them.

This step adds no route, no function and no table item type, and changes nothing in `backend/` or
`shared/`. It extends `api.ts`, adds three services (`CalendarSettingsService`,
`AvailabilityTypesService`, `AvailabilityRulesService`), adds `listUsers()` to the existing
`UsersService`, and adds a front-end journeys file for them. Every existing service keeps its
behaviour, its streams and its tests unchanged, with one exception: `deleteUser` accepts
`concurrent_update` (see "The step"). Step 54 (`CalendarService`, `AppointmentsService`)
will build on what this step settles, so the conventions chosen here are the ones every later
service copies.

Read these in full first:
- `CLAUDE.md` (in particular: the folder map's `frontend/` entry, the front-end test conventions:
  subscribe first, then call; fake `setInterval` with the timers; the 24.8-day limit; the ESLint
  import rule, and that a new allowed import is a design change; the integration notes: files run
  one at a time, never at the same time as the back end's);
- `docs/FRONTEND_SERVICES.md` v5, all of it: rules 1–9 (section 2), the service pattern (section 3,
  and why 3.2 forwards `next` only), `api.ts` and its mapping table (10.2), the CORS gap (10.3),
  `HelloService` and `UsersService` (sections 12 and 13: the shape this step copies), placement and
  journeys (section 14), and the decisions table (section 8, decisions 1–28);
- `docs/SHARED_CALENDAR_SPEC.md` v13 section **16** (all of it: 16.1 `api.ts`, 16.2 the services
  table, 16.3 behaviour, 16.4 validation before sending, 16.5, 16.6 unit tests, 16.7 journeys, 16.8
  the future views), and the parts it rests on: 9 (settings and ranges), 6.1–6.5 (types, patterns,
  overrides, one-off windows, R-AV-01), 6.7 (`availability_conflict` and its `conflicts` list), 10.1
  (`GET /users`), 11 (11.1 routes 1–14 and 21 with their error codes, 11.2 path parameters, 11.3 the
  error codes and the `conflicts` extension, 11.4 request bodies, 11.5 response types), 18.2 (what
  the journeys may do to the local calendar);
- `docs/ARCHITECTURE.md` section 4 (the calendar routes as implemented: **it governs** where it
  describes a route, per the v12 rule; compare its error codes per route with spec 11.1 and report
  any difference), section 3 (who can call what), the v12 change-log entry;
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar": the conventions under "How these
  steps are run" (in particular the front-end journeys: "do not reset the table … create only items
  scoped to their own types and dates, and remove them at the end"), the row-by-row table under
  "Where the truth lives" (step 53 has the row `docs/FRONTEND_SERVICES.md` "`api.ts` changes (16.1);
  settings, types and availability-rules services; `listUsers`"), step 53 itself and step 54;
- `docs/FOLDER_STRUCTURE.md` sections 7 and 8 (the front end's placement and its exception).

Then read the code this step builds on:
- `frontend/src/services/`: `api.ts` (`ApiConfig`, `ApiRequest`, `apiCall`, `toApiAnswer`,
  `apiFailure`, `transportFailure`), `users.service.ts` and `users.types.ts` (two independent pairs
  of streams, validation before sending, a delete success carrying its argument), `hello.service.ts`,
  `session.store.ts`;
- `frontend/tests/unit/services/`: `api.test.ts`, `users.service.test.ts`, `hello.service.test.ts`,
  `fixtures.ts` (how `fetch` is stubbed with real `Response` objects);
- `frontend/tests/integration/`: `local.ts`, `journeys.test.ts` (the `outcome()` helper, the
  throw-away `fe-journey` removed before and after);
- `shared/src/api.ts` (`ApiErrorCode`, `ApiErrorBody` with `conflicts`, `AppointmentConflict`,
  `UserSummary`, `ListUsersResponse`), `shared/src/calendar/schemas.ts` (the request bodies and path
  parameters the services validate with), `shared/src/calendar/types.ts` (the response types the
  success values carry), `shared/src/calendar/defaults.ts`;
- `backend/tests/integration/calendar.test.ts`, only to see what the back-end journeys leave in the
  local `calendar` table (they empty it at their start, not at their end) and which settings they
  leave behind (`NEW_VALUES`: the settings are not back at the defaults after them).

## Where we are (2026-11-14)

- Steps 41–52 are done and committed: `4572019` is step 52 (spec v13, the smoke test's calendar
  journey, "back end complete"). Check `git status -sb` rather than trusting this line; at the time
  of writing `main` was three commits ahead of `origin` (steps 51, 52 and the local-API fix
  `be9cd03`).
- The back end has all 21 calendar routes plus Hello World's. Root
  `DYNAMODB_PORT=8002 npm run verify` was green three times at the end of step 52 (1087 + 377 +
  90 + 129 tests); the front-end journeys (19 tests, two files) passed after the back end's.
- `frontend/` is still the services layer only: `api.ts` knows `POST` and `DELETE`, no query
  string, no `conflicts`. `FRONTEND_SERVICES.md` is v5. The CORS gap (10.3) is still open: the
  services are proven in Node (unit tests and journeys), not in a browser.
- The local `calendar` table, when this step starts, holds whatever the last back-end journeys and
  smoke runs left: their own items, the smoke test's cancelled appointments at 03:00 local about 50
  days ahead, deleted-user markers, and settings at the journeys' `NEW_VALUES`. The front-end
  journeys must work on top of that, and on top of a table that a failed earlier front-end run left
  half-cleaned.
- In the agent's non-interactive shell, Node 22 is the default (`~/.nvm`); if `node -v` is not 22,
  run `source ~/.nvm/nvm.sh && nvm use`. DynamoDB Local is on port 8002 here; check `docker ps`
  before passing `DYNAMODB_PORT`.

## Design points (decided 2026-11-15)

The seven design points were decided with the user before this brief was handed over. Apply them
as written; do not re-open them. If the code proves one of them wrong, stop and say so with a
proposal.

1. **`api.ts` (16.1).**
   - `ApiRequest` becomes a union, so the compiler refuses a body where fetch would: `GET` and
     `DELETE` take no `body`; `POST`, `PUT` and `PATCH` may.
   - `query?: Record<string, string>` is added now, encoded with `URLSearchParams`: no `?` when it
     is absent or empty, keys in the order given. No route of this step uses it; `api.test.ts`
     proves it, step 54 uses it.
   - `ApiFailure` gains an optional `conflicts?: AppointmentConflict[]` (on every `ApiFailure<C>`),
     set only when the reason is `availability_conflict`. The service keeps the well-formed entries
     (`appointmentId`, `username`, `start`, `end` all strings) and drops the others; a missing or
     non-array `conflicts` gives `[]`. The failure stays `availability_conflict` in every case.
   - The mapping table of 10.2 is otherwise unchanged; the existing services and their tests need
     no edit.
2. **`pending` and the stream names.**
   - Rule (step 54 copies it): **`pending` carries every argument of the call, under the API
     contract's names** from `shared/` (`typeId`, `patternId`, `windowId`, `date`, `name`,
     `windows`); a whole-object argument is named after its object (`settings`, `pattern`,
     `window`). A load with no arguments carries nothing. Examples: `create(name)` →
     `{ status: 'pending', name }`; `rename(id, name)` → `{ typeId, name }`; `updatePattern(id, p)`
     → `{ patternId, pattern }`; `setOverride(date, windows)` → `{ date, windows }`;
     `createWindow(w)` → `{ window }`; `update(s)` → `{ settings }`; `deleteWindow(id)` →
     `{ windowId }`.
   - Names: a load is named after what it loads (`settingsResult$`/`settingsState$`,
     `typesResult$`/`typesState$`, `patternsResult$`/`patternsState$`,
     `listUsersResult$`/`listUsersState$` as 16.2 gives); every other method after itself
     (`updateResult$`, `createResult$`, `renameResult$`, `removeResult$`, `createPatternResult$`,
     `updatePatternResult$`, `deletePatternResult$`, `setOverrideResult$`, `deleteOverrideResult$`,
     `createWindowResult$`, `deleteWindowResult$`, each with its `…State$`).
3. **Success values.** `{ status: 'success', settings }`, `{ … types }`, `{ … type }`,
   `{ … patterns }`, `{ … pattern }`, `{ … override }`, `{ … window }`, `{ … users }`; a delete
   carries the id of the call (`typeId`, `patternId`, `date`, `windowId`). **What is checked**
   before a success, by hand as `UsersService` does: the expected HTTP status (200, 201 or 204),
   the top-level shape (an object; the array under `types`, `patterns` or `users`) and the object's
   id (`typeId`, `patternId`, `windowId`, `date`; for the settings `timeZone`; for each listed
   element its id). The rest is trusted to the contract. Anything else answers `unexpected`. No
   response schemas in `shared/` (it has TypeScript types only, and that stays so).
4. **Error codes per route** are those of architecture section 4, which governs. The one
   difference from spec 11.1: route 10 (`DELETE /calendar/patterns/{patternId}`) does **not**
   accept `availability_overlap` (spec footnote 1: it never happens); if it ever arrived it would
   be `unexpected`. Report this difference in the step's report and in `FRONTEND_SERVICES.md`; the
   spec is not edited for it. `forbidden`, `invalid_json` and `internal_error` are normal reasons,
   as in `UsersService`. `type_not_found` is one reason for both its 404 (path) and its 409 (body).
5. **Validation before sending (16.4).** Each method parses its input with the shared schema
   (`UpdateSettingsBody`, `TypeBody` + `TypeIdParam`, `PatternBody` + `PatternIdParam`,
   `OverrideBody` + `DateParam`, `OneOffWindowBody`, `WindowIdParam`); on failure it answers
   `invalid_request` with no request sent. The `message` is the **first zod issue with its field**,
   for example `end: end must be after start` (the field path joined with `.`; without a path, the
   issue's message alone). On success the service sends **zod's parsed output** (the trimmed name,
   …), not the caller's input. The service does not check what only the server knows:
   `date_in_past`, overlaps, conflicts, limits, unknown types.
6. **The journeys, `frontend/tests/integration/calendar.test.ts`**, with the throw-away User
   `fe-calendar`, created and removed through `UsersService` (before and after, as `fe-journey`).
   - **Settings**: read first, written, then written back with the values read, also after a
     failure (`afterAll`). `updatedAt`/`updatedBy` stay changed; that is acceptable locally.
   - **Types**: named with the prefix `fe-calendar `. A clean-up first removes what a failed
     earlier run left: its one-off windows, overrides and patterns (on its own dates and types),
     then its types (R-TYPE-03).
   - **Dates**: about a year ahead (from today + 330 days), far from the smoke test's 50–80 days
     and from the back-end journeys' dates. A pattern has `validFrom` = `validUntil` (one date);
     an override only on a date of this band.
   - **Limits** (20 types, 50 patterns, 10 one-off windows per date): if data the test does not
     own already fills one, the test fails with a clear message; it never deletes what it did not
     create.
   - **Refusals proven end to end**: `availability_overlap`, `type_in_use`, `date_in_past`,
     `invalid_request` with no request sent, a User's `forbidden` (as `fe-calendar`).
     **`availability_conflict` waits for step 54** (it needs a booked appointment, step 54's
     service); here the unit tests prove its mapping and `conflicts`.
   - Every block prepares its own state; the file does not rely on the order of the files.
7. **`FRONTEND_SERVICES.md` v6.** 10.2 amended for `api.ts`; new sections after 14, in the shape
   of sections 12 and 13: **15** `CalendarSettingsService`, **16** `AvailabilityTypesService`,
   **17** `AvailabilityRulesService`; `listUsers` in section 13; the new journeys file in section
   14; new decisions from 29 (the points above); the change-log row and the status line. Spec 16
   stays as it is (historical for these services once v6 has them).

If anything else is unclear or contradictory while you read, stop and tell me, with a proposal. For
example: 16.2 calls the rules service "Administrator" but some of its routes' types are read by
Users too (route 3 is both roles: which service a User uses for the types); `CalendarSettingsService`
is used by both roles (route 1) but `update` is admin only; `GET /users` is admin only while
`UsersService` is the admin's service anyway.

## The step

Only what step 53 lists.

- `frontend/src/services/api.ts`: 16.1 as settled in point 1.
- `calendar-settings.service.ts` / `.types.ts`, `availability-types.service.ts` / `.types.ts`,
  `availability-rules.service.ts` / `.types.ts`: the pattern of section 3 without exception, as
  settled in points 2–5. `users.service.ts` / `.types.ts` gain `listUsers()` and its pair.
  One existing behaviour changes, a gap left by step 51: `DELETE /users/{username}` can answer
  `409 concurrent_update` since then (architecture section 4), so `deleteUser`'s codes
  (`DELETE_CODES`) and `DeleteUserFailureReason` gain `concurrent_update`, with a unit test, and
  `FRONTEND_SERVICES.md` section 13 says so. No other existing service or test changes.
- Unit tests in `frontend/tests/unit/services/`, mirroring `src/` (16.6): per method, success;
  request shape (method, path, query, body); every route error code; `session_rejected`;
  `not_signed_in`; `invalid_request` with no request sent; network failure then success; a new call
  cancels the same method's pending call and no other method's; late subscriber. `api.test.ts`
  gains the new methods, `query` and `conflicts`. 100 % line coverage on `frontend/src`.
- `frontend/tests/integration/calendar.test.ts` as settled in point 6.
- Documents:
  - `docs/FRONTEND_SERVICES.md` v6 as settled in point 7;
  - `docs/SHARED_CALENDAR_SPEC.md` v14, only if a point changes section 16 (with its change-log
    row); otherwise unchanged;
  - `CLAUDE.md`: the `frontend/` entry of the folder map (the new services and the journeys file)
    and the `test:integration -w frontend` line (the new file, `fe-calendar`, what it changes in the
    local calendar: the settings written back, nothing reset);
  - the plan's status line.

Not in this step:
- `CalendarService`, `AppointmentsService` and their journeys (step 54);
- any view, framework, Vite, `index.html`, `template.yaml` or `dist/` in `frontend/` (they wait for
  `docs/FRONTEND_ARCHITECTURE.md`); the CORS gap (10.3) stays open;
- anything in `backend/` or `shared/`. If a point needs a change there (a missing schema, an error
  code, a response type), stop and say why first;
- a new dependency or a new allowed import in `eslint.config.js` (a design change: CLAUDE.md);
- the cloud: no deploy, no AWS command.

### Tests

- Unit: as listed above, `npm run verify -w frontend` green (typecheck, lint, unit tests with 100 %
  line coverage on `frontend/src`). The existing tests keep passing unchanged; if one must change,
  say which and why.
- Integration: `RUN_INTEGRATION=1 npm run test:integration -w frontend` green **twice in a row**,
  the second run right after the first (proves the clean-up and the reruns), and once more after
  the back-end journeys (`RUN_INTEGRATION=1 DYNAMODB_PORT=8002 npm run test:integration -w backend`
  first, then the front end's; never at the same time). After the runs, show that the journeys left
  nothing of their own in the calendar (no `fe-calendar` type, pattern, override or window; the
  settings equal to what they were before the run), read through the API or DynamoDB Local.
- One run with a forced failure in the middle of the new journeys file (say how you force it
  without editing the committed test, for example a temporary copy in the scratchpad or an
  environment variable only that run sets), then a normal run that passes: proves that a failed run
  can be repeated.

## How we work in this step

- **Restarts**: none should be needed (no function changes). If `local:api` or `local:up` must be
  restarted, ask me; do not start or stop the stack yourself.
- **Hard rules**:
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators` and
    `@shared-calendar/shared` (and relative files); no Node module, no DOM-only API beyond `fetch`
    through `fromFetch`;
  - rule 9: no token in any result, state or service field; rule 6: nothing logged;
  - a service never errors or completes its subjects (section 3.2): `next` only;
  - the journeys never reset the calendar table, never delete or change anything they did not
    create (the settings are written back), and remove `fe-calendar` on every run;
  - no AWS command and no deploy.
- **When the spec, the plan, the architecture or `FRONTEND_SERVICES.md` disagree, or one is
  unclear**, stop and tell me, with a proposed change. Do not edit any of them silently.

## Acceptance (plan step 53)

- The decided design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green with 100 % line coverage on `frontend/src`.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend` green twice in a row, and again after the
  back-end journeys; the forced-failure run followed by a passing run; nothing of the journeys left
  in the calendar, settings as before.
- The root `DYNAMODB_PORT=8002 npm run verify` green (back end unchanged, front end included).
- `docs/FRONTEND_SERVICES.md` v6, `CLAUDE.md` and the plan's status line updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push and do not deploy. Do not start step 54.
