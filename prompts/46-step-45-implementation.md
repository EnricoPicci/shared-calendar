## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. The agent
will ask you to restart `local:api` once the four new functions exist. Ctrl-C now removes the Lambda
containers `sam local` leaves behind (step 44), so a restart needs nothing else.

## Brief

Implement plan step 45, "Weekly patterns, overlap and conflict checks", the fifth step of the shared
calendar, following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report,
then stop for review. One stop, at the end.

Read first, in full: `CLAUDE.md`; `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built" with its row-by-row table, and step 45 itself); then
`docs/SHARED_CALENDAR_SPEC.md` v5 sections 5 (the time model, in particular R-TIME-03 and R-TIME-04),
6 (all of it: 6.2 patterns and R-PAT-01..04, 6.3 and 6.4 for the sources the checks combine, 6.5
with R-AV-01 and R-AV-02 and its table, 6.6, 6.7 with R-AV-03..05), 8.1 (the appointment fields the
conflict check reads), 11 (status code rule, routes 7–10 of 11.1, 11.2 `PatternIdParam`, 11.3 with
the `conflicts` extension, `PatternBody` in 11.4, `WeeklyPattern` in 11.5), 13 (all of it, in
particular the access patterns of 13.2), 14 (all of it), 17, 18.1, 18.2, AC-04, AC-05, AC-25..28
in 18.3; then `docs/ARCHITECTURE.md` sections 2, 3, 4, 5.3, 6, 7.1 and the v12 change-log entry.

Then the code this step copies, all from step 44 (commit `a8d314a`): `backend/template.yaml` (the
three managed policies and the four availability-type functions with their log groups and roles),
`backend/src/lib/calendarDb.ts` (`queryPartition`, `Checked`, the type functions and
`readTypeReferences`), `backend/src/lib/calendarRules.ts` (`Refusal`, `checkTypeName`,
`checkTypeDelete`), `backend/src/lib/http.ts` (`error()`), the four type handlers and their unit
tests, `backend/tests/unit/lib/calendarDb.test.ts`, `calendarRules.test.ts`,
`backend/tests/integration/setup.ts` and `calendar.test.ts`. From `shared/`: `PatternBody`,
`PatternIdParam`, `WindowBody`, `OverrideBody`, `OneOffWindowBody` in `calendar/schemas.ts`;
`WeeklyPattern`, `ListPatternsResponse`, `DateOverride`, `OneOffWindow`, `Appointment` in
`calendar/types.ts`; `definedWindows`, `toInstantWindows`, `effectiveWindows`, `overlaps` and the
input types in `calendar/rules.ts`; `AppointmentConflict` and `ApiErrorBody` in `api.ts`;
`CALENDAR_LIMITS.patterns`; `localDateOf`, `weekdayOf`, `addDays` in `calendar/time.ts`.

## Where we are (2026-11-12)

- Steps 41–44 are done and committed (`a8d314a` is step 44). Check `git status -sb` for the push
  state rather than assuming it.
- The PO confirmed T2 at step 44 (spec 22, O2): one function per route stays. No checkpoint in this
  step; the second local-weight measurement is step 51's.
- Step 44 set the shape steps 45–51 copy. Keep it unless this step proves it wrong (then say so):
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path parameter → body → `calendarDb` with the `calendarRules` check → one log line (`done()`),
    with `lockAttempts` on writes and the resource id (here `patternId`) where there is one, never
    a body;
  - a `calendarDb` write function takes the rule check as a callback (`check`), runs it on the data
    read **inside** the locked attempt, and returns `Locked<Checked<T, C>>`:
    `{ ok: true, value } | { ok: false, error }`. "Not found" (`pattern_not_found`) comes from what
    the attempt read, not from a rule. A rule returns `Refusal` (`{ error }`) or `null`; `Refusal`
    was made an object so that this step can add `conflicts`;
  - the handler maps each code to its status of spec 11.3 with a small table;
  - writes put the **whole item** (`Put`), built by one function shared by create and update;
    deletes carry no condition (the lock serializes every calendar write);
  - every `Query` goes through `queryPartition` (consistent, follows `LastEvaluatedKey`);
  - new ids are generated once per request, outside the lock loop; `now` once per request, and
    "today" = `localDateOf(now, timeZone)`;
  - handler unit tests reload the module per test (`vi.resetModules()`).
- Local stack: `local-api.sh` removes the Lambda containers on exit. In the agent's non-interactive
  shell the default Node is 24: `source /usr/local/share/nvm/nvm.sh && nvm use` before running tests.
- Spec proposals from step 42 still open: the appointment-list query, `upcoming` with `status`, the
  fall-back night. None touches this step. The fourth one does: see "Overlap in local times" below.

## The step

Only what step 45 lists.

- `backend/template.yaml`: four functions, each with its log group and role, copied from the step 44
  blocks: `ListPatternsFunction` (`GET /calendar/patterns`, **admin only**: read),
  `CreatePatternFunction` (`POST /calendar/patterns`: read + write), `UpdatePatternFunction`
  (`PUT /calendar/patterns/{patternId}`: read + write), `DeletePatternFunction`
  (`DELETE /calendar/patterns/{patternId}`: read + delete). Handler and log-group names as spec 14.1.
  No new policy.
- `backend/src/lib/calendarDb.ts`:
  - the `PATTERN` item of 13.2 (`weekday`, `start`, `end`, `typeId`, `validFrom`, `validUntil`,
    `createdAt`, `updatedAt`; the id is the SK only) and `listPatterns()`, sorted by weekday, then
    start (spec 11.1);
  - **one read of the availability state** inside the locked attempt, replacing step 44's
    `readTypeReferences` rather than adding a second set of queries: all types, all patterns,
    overrides and one-off windows dated today or later (`SK ≥ today`), and appointments from
    `now − 24 h` (`SK ≥ now − 24 h`; the rules keep `status = booked` and `end > now`). An
    appointment lies inside one date and so cannot still be running on a date before today, which
    is why "today or later" is enough for the conflict check too. The fields mapped are those the
    rules read, in the shapes of `shared`'s rule inputs (an override's date from its SK, an
    appointment's `appointmentId` and `username` for `conflicts`). `checkTypeDelete` takes this state
    as it is, or a narrowed view of it; its tests must stay green.
  - `createPattern`, `updatePattern` (full replacement, `pattern_not_found` if absent at the time of
    the attempt, `createdAt` kept), `deletePattern` (`pattern_not_found` likewise), all under the
    lock with the check callback.
- `backend/src/lib/calendarRules.ts`: `checkAvailabilityWrite(write, state, today, now, zone)`. It
  covers **every row of the table in 6.5 and the deletes of 6.7** (pattern create, update, delete;
  override set and delete; one-off create and delete), so that step 47 only adds routes. Each kind
  is unit-tested now. It returns, in this order (report the order you chose if you change it):
  `type_not_found` (409: a `typeId` in the body that is not an existing type, R-TYPE-04),
  `limit_reached` (50 patterns on create, R-PAT-04; the one-off limit of 10 per date is step 47's,
  but you may add it here if it falls out naturally), `availability_overlap` (R-AV-01, R-AV-02),
  `availability_conflict` with `conflicts` (R-AV-03, R-AV-04). Build on `definedWindows`,
  `toInstantWindows`, `effectiveWindows` and `overlaps` from `shared`; do not re-implement them.
  The conflict check computes the calendar **as it would be after the write** for the date of each
  active appointment (`status = booked`, `end > now`, one in progress included) and requires it to
  lie entirely inside one effective window **of its own type** (so a type change of the window is a
  conflict, an extension never is).
- `backend/src/lib/http.ts`: `error()` accepts an optional `conflicts` (`AppointmentConflict[]`).
  It reaches the response body only, never the log line (spec 14.5: it holds other people's
  usernames).
- Handlers `listPatterns.ts` (admin), `createPattern.ts` (201), `updatePattern.ts` (200),
  `deletePattern.ts` (204). `PatternBody` and `PatternIdParam` through `validate()`.
- Integration: the pattern journeys in `calendar.test.ts` (after the type journeys).
- Documents, the step-45 rows of the plan's table: `docs/ARCHITECTURE.md` section 2 (diagram and
  2.1: the four functions), section 3 (who can call: all four are admin only), section 4 (routes
  7–10, their error codes, the `WeeklyPattern` shape, the list order, the `conflicts` field of the
  error body and when it is set), section 5.3 (the `PATTERN` item and the state read), section 6
  (the new diagram "availability edit with conflict"), 7.1 (the roles of the four functions) and
  the step 45 sentence in the v12 entry; `CLAUDE.md` folder map (the handlers, and what
  `calendarRules.ts` now holds); the plan's status line.

Not in this step: the routes for overrides and one-off windows (step 47, although their checks are
written and tested now), the calendar view (step 46), appointments (step 48; the conflict check reads
the `APPT` partition, which stays empty end to end until then), `parseQuery`, `CalendarBookPolicy`,
`deleteUser`, the users `dave`/`erin`, and anything in `shared/` or `frontend/`. If `shared/` turns
out to need a change, stop and say why.

### Decisions to make and report (each will be copied by step 47)

- **Overlap in local times (open step-42 proposal).** R-AV-01 does not say whether windows are
  compared as local times or as instants. They differ on the night clocks go forward: in
  `Europe/Rome` on 2027-03-28, `02:00–02:30` becomes `01:00Z–01:30Z` and overlaps `03:00–04:00`
  (`01:00Z–02:00Z`) as instants, but not as local times. Compare **local times** (`overlaps()` on the
  local times of one date, which its comment allows): it is date-independent, which a pattern check
  over months needs, and it is what the Administrator typed. Propose the sentence for R-AV-01 in the
  report; do not edit the spec until I approve. The conflict check stays in instants (appointments
  are instants), through `toInstantWindows` and `effectiveWindows`.
- **The shape of `write` and of the state.** One discriminated union for the six kinds (for example
  `{ kind: 'pattern', before, after }` with `null` for create or delete). Step 47 copies it, so say
  why you chose it.
- **The pattern-against-one-off check** (6.5, first row). "Every date from today on within the
  pattern's validity that has no override" is unbounded when `validUntil` is `null`. Iterate over
  the one-off windows read (dated today or later) instead of over dates: a window on a date with
  the pattern's weekday, inside its validity, on a date without an override.
- **Pattern against pattern.** Same weekday and intersecting validity, whatever the dates (spec:
  "an overlap on any date is an overlap"), so two patterns valid only in the past still clash. An
  update compares against every pattern **but itself**.
- **The 409 messages.** `availability_overlap` "names the date and both windows" (6.5). For two
  patterns, say which weekday and the first date of the shared validity, or explain the wording
  you chose. `availability_conflict`: "N appointments would fall outside the availability"; the
  message holds no username.
- **The `Refusal` extension.** `availability_conflict` carries `conflicts`; say how `Refusal` and
  `Checked` carry it to the handler without an `any`, and how the handler passes it to `error()`.

### Tests

- Unit (`aws-sdk-client-mock`, fake clock with `vi.setSystemTime`), with the scenario dates of
  18.3 (AC-04: pattern Mon 08:00–12:00 Studio from 2026-11-01, now 2026-11-10):
  - `checkAvailabilityWrite`, every row of 6.5 and each delete of 6.7: overlap and no overlap,
    touching windows allowed (also with different types), validity intersections (inclusive
    `validUntil`, open end on either side, disjoint periods), an update that does not clash with
    its own old version, the spring-forward pair above (no overlap in local times), R-AV-02 (a past
    one-off window is ignored), a one-off on a date with an override ignored by the pattern check,
    the limit of 50 (the 50th allowed, the 51st refused), `type_not_found`;
  - conflicts: AC-25 (an override `[]` on the appointment's date), AC-26 (the pattern's type
    changed), AC-27 (the pattern extended to 07:00–12:00: no conflict), deleting the pattern, an
    appointment in progress counts, an ended one and a cancelled one do not, an appointment on a
    DST date, several conflicts listed in start order;
  - `calendarDb`: the exact queries of the state read (keys, `ConsistentRead`, the bounds for today
    and `now − 24 h` in `Europe/Rome` across midnight UTC), the exact transaction of each write, a
    refusal that writes nothing, the retry re-reading the state, `pattern_not_found` on update and
    delete; `checkTypeDelete` and the type functions still green on the new state read;
  - `http.error()` with and without `conflicts`;
  - handlers: the admin role (a User is 403 on all four, including the list), a token in neither
    group, `invalid_json`, `.strict()`, the cross-field rules (`end` after `start`, `validUntil`
    before `validFrom`), an invalid `patternId` (400), unknown id (404), each 409 with its body
    (`conflicts` included), the invalid-zone 500, and the log line with `patternId`, without the
    body and without `conflicts` (assert that no username of a conflict reaches the output).
- Journeys (`calendar.test.ts`, after the type journeys):
  - **Rewrite step 44's AC-28 journey.** It writes a bare `PATTERN` item (only `typeId`) with
    `putCalendarItem()`; with `GET /calendar/patterns` in place that item is not a valid pattern.
    Create the pattern through `POST /calendar/patterns` instead: deleting its type is 409
    `type_in_use`, and after `DELETE` of the pattern (204) the type deletes with 204 (AC-28 end to
    end, as the plan's step 45 says).
  - AC-05 (`Mon 08:00–12:00 Studio` then `Mon 11:00–13:00 Pool`, same validity: 409
    `availability_overlap`); touching windows allowed; the list in weekday-then-start order;
    update as full replacement (a field left out of the body is a 400, not "kept"); unknown id
    (404); a User `GET` and `POST` (403); `type_not_found` for an unknown `typeId` in the body.
    Fixed dates are fine here: a pattern's `validFrom` may lie in the past (A4), and no appointment
    exists yet.
  - AC-25..27 end to end come in step 48, the first step where appointments exist.
  - They must pass twice in a row.

## How we work in this step

- **Restarts**: after the template changes, `local:api` must restart (CLAUDE.md). Ask me; do not
  start or stop the stack yourself. `local:up` is not needed unless you change `local-seed.sh`.
- **Hard rules**: 100 % lines on `backend/src/lib`; strict TypeScript; ESLint clean; no new
  dependency; no wildcard action or resource (`grep` the three managed policies); no AWS command and
  no deploy; logs never carry a body, a name or `conflicts`.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 45)

- `npm run test:unit -w backend` green, 100 % lines on `backend/src/lib`, with the cases above:
  every 6.5 row, AC-25..27 at unit level, `conflicts` in the body and never in the log line.
- Journeys: AC-05, AC-28 end to end (409, then 204 after the pattern is deleted), list order, update
  as full replacement, unknown id (404), User calls (403); the settings and type journeys still
  green. They pass twice in a row.
- `grep` of the three managed policies shows no `*` in any action or resource.
- `sam validate --lint`; root `npm run typecheck`, `npm run lint`, `npm run test:unit` green.
- The root `DYNAMODB_PORT=8002 npm run verify` green.
- The R-AV-01 local-time proposal presented, with its sentence for the spec.

Report each result, including anything you could not run, then stop for review. Do not start
step 46. Commit only when I ask. Do not push and do not deploy.
