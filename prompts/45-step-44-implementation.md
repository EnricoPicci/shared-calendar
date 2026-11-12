## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step (the agent will ask you to start or restart it, and to time one start of `local:api`).

## Brief

Implement plan step 44, "Availability types and the template checkpoint", the fourth step of the
shared calendar, following CLAUDE.md's working rhythm: one step, its acceptance check, an honest
report, then stop for review. This step has **two stops**: one after the O2 / local-weight report
(the Product Owner decides T2), and the usual one at the end.

Read first, in full: `CLAUDE.md`; `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built" with its row-by-row table, and step 44 itself); then
`docs/SHARED_CALENDAR_SPEC.md` v4 sections 6.1 (types, R-TYPE-01..04), R-TIME-04 in 5, 11 (status
code rule, routes 3–6 of 11.1, 11.2 `TypeIdParam`, 11.3, `TypeBody` in 11.4, `AvailabilityType` in
11.5), 13 (all of it, in particular the access patterns of 13.2), 14 (all of it), 17, 18.2, AC-03
and AC-28 in 18.3, 20 (decision T2) and 22 (O2); then `docs/ARCHITECTURE.md` sections 2, 3, 4, 5.3,
7.1 and the v12 change-log entry.

Then the code this step copies, all from step 43 (commit `4bad8c9`): `backend/template.yaml`
(`CalendarTable`, the two managed policies, `GetCalendarSettingsFunction` and
`UpdateCalendarSettingsFunction` with their log groups and roles), `backend/src/lib/calendarDb.ts`
(`calendarConfig`, `withCalendarLock`, the settings functions), the two settings handlers and their
unit tests, `backend/tests/unit/lib/calendarDb.test.ts`, `backend/src/handlers/deleteUser.ts` (a
path parameter through `validate()`), `backend/tests/integration/setup.ts` (`resetCalendarTable`,
`putCalendarItem`, `getCalendarItem`) and `calendar.test.ts`. From `shared/`: `TypeName`, `TypeBody`
and `TypeIdParam` in `calendar/schemas.ts`, `AvailabilityType` and `ListTypesResponse` in
`calendar/types.ts`, `CALENDAR_LIMITS.types` in `calendar/defaults.ts`, `localDateOf` in
`calendar/time.ts`.

## Where we are (2026-11-12)

- Steps 41, 42 and 43 are done and committed (`4bad8c9` is step 43, the first calendar
  checkpoint). Check `git status -sb` for the push state rather than assuming it.
- Step 43 set the pattern every calendar function copies. Keep it unless this step proves it wrong
  (then say so):
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path parameter → body → `calendarDb` → one log line (`done()`, as `hello.ts`), with
    `lockAttempts` on writes and never a body;
  - `withCalendarLock(attempt)`: `attempt` does the consistent reads and the checks and returns
    `{ write: [...], result }` or `{ write: null, result }` (a failed check: nothing written). It is
    re-run on fresh reads after a busy lock. A busy lock is index 0 of `CancellationReasons` with
    `ConditionalCheckFailed` or `TransactionConflict`;
  - handler unit tests reload the module per test (`vi.resetModules()`), because the configuration
    is read once per container.
- CLAUDE.md's IAM rule was reworded in step 43 to describe the shared managed policies. Spec v4:
  `env.local.json` sets the calendar variables once in its `Parameters` section and never
  `CALENDAR_TIME_ZONE`, so this step needs no change to `local-seed.sh` and no `local:up` rerun.
- Spec proposals from step 42 are still open (the appointment-list query, `upcoming` with
  `status`, the fall-back night, local-time overlap). None of them touches this step.

## Part 1: routes 3–6

Only what step 44 lists:

- `backend/template.yaml`:
  - `CalendarDeletePolicy` (`AWS::IAM::ManagedPolicy`: `DeleteItem`, `UpdateItem`; resource the
    table's ARN only), next to the other two, with a comment in plain words.
  - Four functions, each with its log group and role, copied from the step 43 blocks:
    `ListAvailabilityTypesFunction` (`GET /calendar/types`: read), `CreateAvailabilityTypeFunction`
    (`POST /calendar/types`: read + write), `RenameAvailabilityTypeFunction`
    (`PUT /calendar/types/{typeId}`: read + write), `DeleteAvailabilityTypeFunction`
    (`DELETE /calendar/types/{typeId}`: read + delete). Handler and log group names as spec 14.1.
- `backend/src/lib/calendarDb.ts`:
  - The `TYPE` item of 13.2 (`name`, `nameKey`, `createdAt`, `updatedAt`) and `listTypes()`.
  - Create, rename and delete under the lock. Uniqueness on `nameKey` is checked among **all types
    read inside the locked attempt** (never from a read made before the lock), and so is the limit
    of 20 (`CALENDAR_LIMITS.types`). Rename and delete answer `type_not_found` (404, path) when the
    type is not there at the time of the attempt.
  - The reads R-TYPE-03 needs, with the access patterns of 13.2: every pattern (`PK = PATTERN`, any
    validity), overrides and one-off windows dated today or later (`SK ≥ today`; a window's SK is
    `<date>#<id>`), and active appointments not yet ended (`PK = APPT, SK ≥ now − 24 h`, then
    `status = booked` and `end > now` in code). Those partitions stay empty until steps 45–48, but
    reading them now keeps the check complete. Every `Query` is consistent and follows
    `LastEvaluatedKey` to the end (one paging helper, used by every query of this module).
  - Keep the item layout in this module only. How the rules reach the lock loop is your choice;
    the step 43 report expected calendarDb functions that take the rule check as a callback, so the
    rules stay out of calendarDb and the handlers stay thin. Say which shape you chose and why: steps
    45–51 copy it.
- `backend/src/lib/calendarRules.ts` (new, pure, no AWS): `checkTypeName` (uniqueness and limit,
  for create and rename; a rename that keeps its own name or only changes its case is allowed) and
  `checkTypeDelete` (R-TYPE-03, with "today" and "now" passed in). Their result names the error code
  from `shared`'s `ApiErrorCode`; the handler maps it to the status of spec 11.3.
- Handlers `listAvailabilityTypes.ts` (admin, user; sorted by name), `createAvailabilityType.ts`
  (201), `renameAvailabilityType.ts` (200), `deleteAvailabilityType.ts` (204). `TypeBody` and
  `TypeIdParam` through `validate()`. `now` once per request, and "today" =
  `localDateOf(now, timeZone)` (R-TIME-04). The new `typeId` (a ULID, `ulid` is already a
  dependency) is generated once per request, outside the lock loop, so a retry does not change it.
  Log `typeId` where there is one (14.5).
- Integration: the type journeys in `calendar.test.ts` (the file already resets the table first).
- Documents, the step-44 rows of the plan's table: `docs/ARCHITECTURE.md` section 2 (diagram and
  2.1: the four functions), section 3 (who can call), section 4 (routes 3–6 with their error codes
  and the `AvailabilityType` shape), 5.3 (the `TYPE` item), 7.1 (`CalendarDeletePolicy` in the
  calendar sentence) and the step 44 sentence in the v12 entry; `CLAUDE.md` folder map
  (`calendarRules.ts`, the handlers); `docs/FOLDER_STRUCTURE.md` if its tree should name
  `calendarRules.ts`; the plan's status line.

Not in this step: patterns, overrides, windows or appointments (only the reads R-TYPE-03 needs),
`http.ts`'s `conflicts` and `parseQuery`, `CalendarBookPolicy`, `deleteUser`, the users `dave`/`erin`,
and anything in `shared/` or `frontend/`. If `shared/` turns out to need a change, stop and say why.

### Decisions to make and report (each will be copied)

- **`nameKey`**: the trimmed name lower-cased with `toLowerCase()` (no locale). It is a back-end
  rule (the front end cannot check uniqueness without the list, and spec 16.4 does not ask for it),
  so it lives in `calendarRules.ts`. If you see a case where this differs from "compared
  case-insensitively" in a way that matters (for example `ß`), say so; do not add Unicode case
  folding on your own.
- **Sort order of the list**: spec 11.1 says "by name". Sort by `nameKey`, so that `alpha` and
  `Beta` sort as a person expects. Say so in architecture section 4.
- **Rename write**: `Put` (the whole item) or `Update`. Both are covered by the policies; choose
  the one that copies best to patterns (step 45) and say why.
- **Delete inside the transaction**: the lock already serializes writes, so no condition on the
  `TYPE` item is needed. If you add one anyway, remember that its failure is a cancellation on
  index 1, which `withCalendarLock` correctly does not retry, and map it explicitly.

### Tests

- Unit (`aws-sdk-client-mock`, fake clock with `vi.setSystemTime`):
  - R-TYPE-01..04 at the level of `calendarRules`: a duplicate in another case (AC-03 at unit
    level), the 20th type allowed and the 21st refused, a rename to its own name in another case
    allowed, a rename to another type's name refused;
  - `checkTypeDelete`: a pattern (any validity, also one that ended), an override dated today, a
    future one-off window and a booked appointment not yet ended block the delete (AC-28 at unit
    level); yesterday's override, an appointment that has ended and a cancelled future appointment
    do not;
  - `calendarDb`: the exact queries (keys, `ConsistentRead`, the `SK` bounds for today and for
    now − 24 h, computed in `Europe/Rome` across midnight UTC), paging over `LastEvaluatedKey`, the
    exact transaction of each write, a check failure that writes nothing, and the retry
    re-reading the types (a name taken between two attempts gives `type_name_exists`, not a
    duplicate);
  - handlers: both roles, a token in neither group, `invalid_json`, `.strict()`, an invalid
    `typeId` in the path (400), unknown id (404), each 409, the invalid-zone 500, and the log line
    with `typeId` and without the body or the name.
- Journeys (`calendar.test.ts`, after the settings journeys): create two types; AC-03 (`studio`
  when `Studio` exists → 409 `type_name_exists`); the list sorted by name, as admin and as alice;
  rename; delete of an unused type (204, gone from the list); unknown id → 404 `type_not_found`;
  a User `POST` → 403. And AC-28 end to end: write a `PATTERN` item that references a type with
  `putCalendarItem()` (only the attributes of spec 13.2 that the check reads) and expect 409
  `type_in_use`. They must pass twice in a row.

## Part 2: the template checkpoint (O2) and local weight, measurement 1

Do this once part 1 is green, with all 10 functions present (4 Hello World, 6 calendar).

1. **Template size.** Count the lines of one calendar function block (function with `Metadata`,
   log group, role, and its comment) and of the shared policies. For reference: step 43 took the
   template from 559 to 767 lines, and one step-43 function block is about 64 lines. Extrapolate to
   21 calendar functions plus the `deleteUser` changes of step 51 and the fourth policy, and
   compare with the spec's estimate (+1 450).
2. **Readability.** Put one function block and the policies side by side in the report, so that I
   can answer the question myself: "can I say what this function may do in under a minute, without
   opening another file?" Do not answer it for me.
3. **Local weight.** I start `local:api` and you measure. Write me a one-line command in a file in
   your scratchpad (I copy it) that prints the start epoch and then runs `npm run local:api -w
   backend`. Once I give you that epoch, poll until `GET /calendar/settings` answers 200, then report
   the time from start to first answer, the memory sum of `docker stats --no-stream` (every
   container: the emulators and the Lambda containers), and `free -m`. Extrapolate to 25 functions
   on this Codespace (2 cores, about 7.9 GB). Say how you extrapolated (per-container average, fixed
   part).
4. **Fallback.** `samconfig.toml` `[local]` uses `warm_containers = "EAGER"`. If the extrapolation
   exceeds about 5 GB or 3 minutes, propose switching to `LAZY` (one cold start per function, paid
   by the first journey that calls it), and check that a cold start still fits the 10 s timeout.
   Propose; do not switch until I say so. The bigger machine type is the second fallback.

**Then STOP** and present 1–4 as the O2 report. I take it to the Product Owner. Either T2 stands and
the plan continues, or the PO switches to one function per resource: that is a spec change (T2,
14.1, 14.3) and steps 45–51 are re-cut before they start. The weight is an input to the decision,
not a reason on its own. When I give you the answer, record it in spec 22 (O2) and in the
architecture's v12 entry, and, if a fallback was approved, apply it and note it in CLAUDE.md.

## How we work in this step

- **Restarts**: after every build, `local:api` must restart (CLAUDE.md). Ask me; do not start or
  stop the stack yourself. `local:up` is not needed unless you change `local-seed.sh`.
- **Hard rules**: 100 % lines on `backend/src/lib` (now including `calendarRules.ts`); strict
  TypeScript; ESLint clean; no new dependency; no wildcard action or resource (`grep` the three
  managed policies); no AWS command and no deploy.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 44)

- `npm run test:unit -w backend` green, 100 % lines on `backend/src/lib`, with the cases above.
- Journeys: AC-03, AC-28, list sorted by name, rename, delete of an unused type (204), unknown id
  (404), User `POST` (403); the settings journeys still green. They pass twice in a row.
- `grep` of the three managed policies shows no `*` in any action or resource.
- `sam validate --lint`; root `npm run typecheck`, `npm run lint`, `npm run test:unit` green.
- The root `DYNAMODB_PORT=8002 npm run verify` green.
- The O2 report presented (part 2) and, after my answer, the PO's T2 decision recorded in spec 22
  and the v12 entry.

Report each result, including anything you could not run, then stop for review. Do not start
step 45. Commit only when I ask. Do not push and do not deploy.
