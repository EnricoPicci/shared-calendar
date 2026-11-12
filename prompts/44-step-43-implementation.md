## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step (the agent will ask you to start or restart it).

## Brief

Implement plan step 43, "Back end: calendar table, lock and settings (first slice)", the third
step of the shared calendar, following CLAUDE.md's working rhythm: one step, its acceptance check,
an honest report, then stop for review.

Read first, in full: `CLAUDE.md`; `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built" with its row-by-row table, and step 43 itself); then
`docs/SHARED_CALENDAR_SPEC.md` v3 sections R-TIME-01 and R-TIME-04 in 5, 9 (settings), 11 (status
code rule, routes 1 and 2 of 11.1, `CalendarSettings` in 11.5), 13 (data model, all of it: the
lock of 13.4 is the core of this step), 14 (back end, all of it: functions, modules, template,
local stack, logging), 17 (security), 18.2 (journeys) and AC-01, AC-02 in 18.3; then
`docs/ARCHITECTURE.md` sections 2, 3, 4, 5, 7.1, 8, 10 and the v12 change-log entry, and
`docs/RUNBOOK.md` sections 2 and 3.

Then the code this step copies: `backend/template.yaml` (`MessagesTable`, `HelloFunction` with its
log group and role, `Globals`, `Outputs`), `backend/src/handlers/hello.ts` (the handler shape and the
`done()` log line), `backend/src/lib/db.ts` (`documentClient`), `http.ts`, `validation.ts`,
`auth.ts`, `logger.ts`, their unit tests, `backend/scripts/local-seed.sh` (table creation and
`env.local.json`), `backend/scripts/local-api.sh`, `backend/vitest.config.ts`, and
`backend/tests/integration/setup.ts` and `journeys.test.ts`. From `shared/`: `calendar/defaults.ts`
(`DEFAULT_SETTINGS`, `SETTINGS_RANGES`), `calendar/schemas.ts` (`UpdateSettingsBody`),
`calendar/types.ts` (`CalendarSettings`, `Actor`) and `isValidTimeZone` in `calendar/time.ts`.

## Where we are (2026-11-12)

- Steps 41 (`5b2633c`) and 42 (`0dc4ff0`) are done, committed and pushed (`origin/main` is at
  `0dc4ff0`). `shared/` holds the
  whole calendar contract: error codes, bodies, response types, rules. Reuse it; do not restate a
  type or a range in the back end.
- Step 42's report left spec proposals open (the appointment-list query, `upcoming` with `status`,
  the fall-back night, local-time overlap). None of them touches this step.
- An open review point from 2026-11-12: the spec's shared managed policies (14.3) against CLAUDE.md's
  hard rule "One role per function, scoped to the one user pool or table it needs". In this step
  every new role still has one function and one table, so the rule's text holds. Say in the report
  whether the rule's wording still describes the template, and propose a wording if not. The mixed
  Cognito + table role (`DeleteUserRole`) belongs to step 51, not here.

## Scope of this step

Only what step 43 lists:

- `backend/template.yaml`:
  - `CalendarTable` (13.1): keys `PK`/`SK` (S), provisioned 10/10, deletion protection, default
    encryption, no index, no stream, no TTL. Name it as `MessagesTable` is named (`calendar`).
  - Parameter `CalendarTimeZone` (default `Europe/Rome`); output `CalendarTableName`.
  - `CalendarReadPolicy` (`GetItem`, `Query`) and `CalendarWritePolicy` (`PutItem`, `UpdateItem`) as
    `AWS::IAM::ManagedPolicy`, resource the table's ARN only. Only these two: `CalendarDeletePolicy`
    and `CalendarBookPolicy` come with the routes that need them (steps 44 and 48).
  - `GetCalendarSettingsFunction` (route 1: read policy) and `UpdateCalendarSettingsFunction`
    (route 2: read and write policies), each with its own log group and role, the inline
    `write-own-logs` statement only, and the environment of 14.1 (`CALENDAR_TABLE`,
    `CALENDAR_TIME_ZONE`, `DYNAMODB_ENDPOINT: ''`). Move into `Globals` whatever SAM allows and the
    existing functions also benefit from, without changing what they get. Explain each template
    change in plain words (CLAUDE.md: the reader is not an IaC expert).
- `backend/scripts/local-seed.sh`: creates `calendar` idempotently, with the same key schema.
  `env.local.json` gains the calendar variables, once, in the env-vars file's `Parameters`
  section, so later steps add no seed lines. Check that `sam local` really applies `Parameters` to
  a function that declares the variable and has no section of its own. If it does not, say so and
  fall back to per-function sections.
- `backend/src/lib/calendarDb.ts` (13.4, 14.2): the only module that knows the item layout.
  - Configuration read once per container: `CALENDAR_TABLE`, and `CALENDAR_TIME_ZONE` checked with
    `isValidTimeZone`. An invalid zone must make **every request answer `500 internal_error`**
    (R-TIME-01), which the 5xx alarm counts. So do not throw at import time: a failed init is not a
    handled 500.
  - The lock loop: read `LOCK` (consistent, `0` if absent); run the operation's checks; then
    `TransactWriteItems` with the `LOCK` update first (`version = v + 1` if `version = v`, or
    `attribute_not_exists` on first use) and the operation's writes after it. If the transaction is
    cancelled because of the `LOCK` condition (index 0 of `CancellationReasons`), wait a random
    50–150 ms and retry, at most 3 attempts in total, then throw `ConcurrentUpdateError`. Any other
    cancellation or error is not retried. Write it generic: steps 44–51 put their own writes
    through it. Return the number of attempts, for the log line (14.5).
  - `getSettings` (the defaults of `shared` when the item is absent, `updatedAt: null`,
    `updatedBy: null`, R-SET-01) and `putSettings` (through the lock).
  - It uses `documentClient` from `db.ts`. Handlers still never import the AWS SDK.
- `backend/src/handlers/getCalendarSettings.ts` (admin and user) and `updateCalendarSettings.ts`
  (admin only; `403 forbidden` for a User; `UpdateSettingsBody` through the existing `validate()`;
  `updatedAt` = "now", computed once per request, R-TIME-04; `updatedBy` = the caller's `Actor`;
  `409 concurrent_update` from `ConcurrentUpdateError`). Both answer `CalendarSettings` with
  `timeZone` from the configuration. Shape and log line as in `hello.ts`, plus the lock attempts on
  the write. Never log the body.
- `backend/tests/integration/setup.ts`: `resetCalendarTable()` (deletes every item; refuses any
  endpoint other than `localhost`/`127.0.0.1`) and `putCalendarItem()` (direct writes, for later
  steps). New `backend/tests/integration/calendar.test.ts`, which resets the table first.
- Integration files never run in parallel, in either package: `fileParallelism: false` in the
  `integration` project of `backend/vitest.config.ts` **and** of `frontend/vitest.config.ts`, each
  with a one-line comment (every file shares one `sam local`, one DynamoDB Local and one
  cognito-local). The `unit` projects stay parallel.
- Documents, the step-43 rows of the plan's table:
  - `docs/ARCHITECTURE.md`: 5.3 (table `calendar`), section 2 (diagram and table: the table and the
    first calendar functions), 7.1 (the shared managed policies), 10 (cost: 10/10, 11/11 in total),
    section 4 and section 3 for routes 1 and 2 only, with their error codes. The step 43 sentence in
    the v12 entry.
  - `docs/RUNBOOK.md`: `CalendarTable` in the change-set check (Remove or Replace = data loss) and
    in the stack-removal procedure; `CalendarTimeZone` must not change once data exists.
  - `CLAUDE.md`: the `calendar` table in the local notes, "the calendar journeys reset the table",
    the `CALENDAR_*` variables, integration files run one at a time (and the two packages must not
    be run at the same time by hand); the folder map gains the new files.
  - `docs/FOLDER_STRUCTURE.md` if its tree lists `backend/src/lib` files. The plan's status line.

Not in this step: `http.ts`'s `conflicts` and `parseQuery` (steps 45 and 46), `calendarRules.ts` and
`calendarEvents.ts`, the other two managed policies, any change to `deleteUser` (step 51), the
throw-away users `dave`/`erin` (first needed in step 48), and anything in `shared/` or `frontend/`.
The one exception is the `fileParallelism` line in `frontend/vitest.config.ts` above, which changes
no behaviour of the services. If `shared/` turns out to need a change, stop and say why.

## How we work in this step

- **This step is the template for 19 more functions.** Prefer what copies well over what is
  clever: a reviewer reads the template, `calendarDb.ts` and the two handlers as the pattern for
  steps 44–51. When a choice will be repeated 19 times, say which one you made and why.
- **The lock is the subtle part.** Test with `aws-sdk-client-mock` and fake timers:
  - first use (`attribute_not_exists`) and a later use (`version = v`), with the exact
    `TransactWriteItems` input;
  - cancelled on `LOCK` twice, then success (3 attempts reported);
  - cancelled three times → `ConcurrentUpdateError`, no fourth attempt;
  - a cancellation on another item (not index 0), and a plain SDK error: not retried;
  - the wait stays within 50–150 ms. Fake `setTimeout`, and make the random source injectable or
    stubbed so the test sees both bounds.
  Check how the SDK reports `TransactionCanceledException` and its `CancellationReasons`, and build
  the mock from that rather than from memory.
- **Consistent reads** everywhere (13.2): the lock design relies on them.
- **Handler tests**: both roles, a token in neither group (`403`), `invalid_json`, `.strict()`
  unknown field, a missing field, a value out of range, `updatedBy`, the `409 concurrent_update`
  mapping, the invalid-zone `500`, and the log line (no body). Fix "now" with `vi.setSystemTime`.
- **The time-zone check by hand** (acceptance): `local:api` with `CalendarTimeZone=Not/AZone` must
  answer 500 to `GET /calendar/settings`. Before relying on `--parameter-overrides`, check which
  wins in `sam local`, the template value or `env.local.json`. If the env-vars file wins, the
  override has no effect while the file sets `CALENDAR_TIME_ZONE`. Then either leave
  `CALENDAR_TIME_ZONE` out of the file so the parameter is the one source (preferred if it works),
  or make the check with a temporary local change that you revert. Report how you made the check.
- **IAM**: no wildcard action or resource in the new managed policies. The existing inline
  `write-own-logs` statements end in `log-stream:*` (the log streams of the function's own group);
  the new roles copy that statement unchanged, and the acceptance `grep` covers the managed
  policies. If you think the logs statement conflicts with the hard rule, say so instead of changing
  it.
- **Integration files run one at a time, by configuration, not by luck.** Measured on 2026-11-12
  with vitest 5.0.5: this Codespace has 2 cores, so vitest uses one worker and the files already
  run one after the other. With 4 workers (any larger machine, e.g. a Mac) two files run at the same
  time, and `fileParallelism: false` on the project alone makes them sequential. The order of the
  files is still not fixed (the probe ran the second file first), so every file prepares its own
  state (resets the table, removes leftover users) and never relies on another file having run.
  The root `verify` already runs the back end's gate before the front end's. Running both
  packages' integration tests by hand in two terminals at once is not prevented: add one line
  saying so to CLAUDE.md's notes on the integration tests.
- **Restarts**: after changing `local-seed.sh`, `local:up` must run again. After every build,
  `local:api` must restart (CLAUDE.md). Ask me when either is needed; do not start or stop them
  yourself.
- **Hard rules**: 100 % lines on `backend/src/lib`; strict TypeScript; ESLint clean; no new
  dependency; no AWS command and no deploy.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 43)

- `npm run test:unit -w backend` green, 100 % lines on `backend/src/lib`, with the lock cases above.
- After `DYNAMODB_PORT=8002 npm run local:up -w backend`, http://localhost:8001 shows an empty
  `calendar` table (and `local:up` run twice in a row still succeeds).
- Journeys in `calendar.test.ts`: AC-01 (defaults, `updatedAt: null`, the zone `Europe/Rome`),
  AC-02 (User `PUT` → `403 forbidden`), and `PUT` then `GET` as the Administrator (`updatedBy`
  `{ username: 'admin', role: 'admin' }`). They pass twice in a row.
- Once, by hand: an invalid `CalendarTimeZone` gives `500 internal_error` on `GET
  /calendar/settings`; then back to normal.
- `grep` of the two managed policies shows no `*` in any action or resource.
- Both `vitest.config.ts` files set `fileParallelism: false` on the `integration` project only.
- `sam validate --lint` green; root `npm run typecheck`, `npm run lint`, `npm run test:unit` green.
- The root `DYNAMODB_PORT=8002 npm run verify` green.

Report each result, including anything you could not run, then stop for review. Do not start
step 44. This is the plan's first calendar checkpoint: commit only when I ask. Do not push and do
not deploy.
