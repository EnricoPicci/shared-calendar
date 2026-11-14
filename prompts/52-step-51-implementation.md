## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
sam --version                                                # 1.171.0 or newer (scripts/check-sam.sh)
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. This step
**changes the seed**: `ListUsersFunction` calls Cognito, so `local-seed.sh` gives it a section of its
own in `env.local.json` (`USER_POOL_ID`, `COGNITO_ENDPOINT`, the dummy credentials), as it does for
`CreateUserFunction`, `DeleteUserFunction` and `BookAppointmentFunction`. So `local:up` must be
rerun once the seed changes, and `local:api` restarted after it; the agent will ask you. Ctrl-C
removes the Lambda containers `sam local` leaves behind; the `LAMBDA_RUNTIME Failed to get next
invocation` lines and the Python `Exception ignored … I/O operation on closed file` messages printed
while it stops are harmless. Check `docker port hello-world-api-dynamodb-1` and tell the agent which
`DYNAMODB_PORT` the stack uses (8000 by default, 8002 if another project holds 8000; it was 8000 in
steps 47–50).

## Brief

Implement plan step 51, "Users: listing, and deletion with appointments", the eleventh step of the
shared calendar, following CLAUDE.md's working rhythm: one step, its acceptance check, an honest
report, then stop for review. One stop at the end, **plus an early stop for the spec points below**
(see "Spec points this step must settle"): present them before you change `deleteUser.ts` and
write the marker and the cancellation transactions.

This is the only calendar step that **changes an existing route** (`DELETE /users/{username}`,
Hello World's plan step 8). The architecture already describes that route as it is today, so the
architecture governs it until this step merges spec 10.2 into it (plan, "Where the truth lives",
rows for step 51). Every existing outcome of the route must stay as it is unless a point below
changes it with my approval.

Read these in full first:
- `CLAUDE.md`;
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps 41–56)": the conventions under
  "How these steps are run", the rule under "Where the truth lives while the calendar is built" with
  its row-by-row table (step 51 has rows: section 6.4 "delete user with appointments", 7.1
  `DeleteUserRole`, 7.3 residual risk, section 8 `ListUsersInGroup` note, `CLAUDE.md` local-stack
  weight, `deleteUser.ts`), step 51 itself, and steps 8 and 9 (the existing `deleteUser` and its
  journeys);
- `docs/SHARED_CALENDAR_SPEC.md` v11 sections:
  - 4 ("List Users" row), 8.1 (`cancelReason` `user_deleted`, the lifecycle), 8.2 R-BOOK-10;
  - **10.1 and 10.2** (all of it: the four steps, R-DEL-01, R-DEL-02);
  - 11 intro (the status code rule), 11.1 route 21 and the existing route's row (there is none:
    say whether 11.1 needs one), 11.3, 11.5 `UserSummary`;
  - 13.2 (the deleted-user marker, the access pattern "active appointments not yet ended"), 13.4
    (the lock, "user-deletion chunk ≤ 82");
  - 14.1 (route 21, the `deleteUser.ts` row, the environment paragraph), 14.2 (`cognito.ts`
    `listPlainUsers`), 14.3 (`DeleteUserRole`, `DeleteUserFunction` gains `CALENDAR_TABLE`), 14.4
    (cognito-local: `ListUsersInGroup` without `NextToken`, `AdminGetUser` and `sub`), 14.5;
  - 15 (15.1 "who must be told", 15.4 "including the automatic cancellations of D19");
  - 17 ("Deleted User still holding a valid token"), 18.2, 18.3 AC-29, AC-32, AC-36, 22 O2;
- `docs/ARCHITECTURE.md` sections 2, 3, 4 (`DELETE /users/{username}` and its error codes), 5.3
  (the marker row, the lock), 6.4 (the delete diagram), 6.7 and 6.8 (the model for a diagram with
  the lock), 7.1, 7.3, 8 (the note on Cognito emulation), 11 and the v12 change-log entry (steps 48
  to 50 in particular).

Then read the code this step builds on:
- `backend/src/handlers/deleteUser.ts` and `tests/unit/handlers/deleteUser.test.ts`: the current
  order (admin → path → `listGroups`: 404 / 403 `cannot_delete_admin` → sign-out → delete), the
  `SKIP_GLOBAL_SIGN_OUT` local switch, the log line (`target`);
- `backend/src/lib/cognito.ts`: `listGroups`, `getUserSub`, `isPlainUser`, `globalSignOut`,
  `deleteUser`, `UserNotFoundError`, the client and its endpoint;
- `backend/src/lib/calendarDb.ts` (last commit `ae86f0b`): `calendarConfig` and
  `CalendarConfigError`, `withCalendarLock` and `LockedPlan`, `readState` and the `APPT` query from
  `now − 24 h`, `readAppointment`, `cancelled()`, `appointmentUpdate`, `eventPut`, `markerCheck`,
  `deletedUserKey`, `cancelAppointment` (the model for a cancel under the lock);
- `backend/src/lib/calendarEvents.ts`: `appointmentEvent` (`appointment.cancelled`, no `previous`);
- `backend/template.yaml`: `DeleteUserFunction` and `DeleteUserRole` (inline Cognito statement),
  `BookAppointmentFunction` (the model for a function that calls Cognito and the table),
  `CalendarReadPolicy`, `CalendarWritePolicy`;
- `backend/scripts/local-seed.sh`: the `env.local.json` sections;
- `backend/tests/integration/setup.ts` (`removeUserIfPresent` goes straight to cognito-local and
  writes no marker), `journeys.test.ts` (step 9: `carol` is deleted through the API) and
  `calendar.test.ts` (the comments at the top of each block);
- `frontend/src/services/users.service.ts` and its integration journey (`fe-journey` is deleted
  through the API): only to check that nothing changes for it.

From `shared/`:
- `UserSummary`, `ListUsersResponse` in `api.ts`; `ApiErrorCode` (is `concurrent_update` already
  allowed on any route? it is a calendar code);
- `UsernameParam`, `Username` in `username.ts`.

## Where we are (2026-11-14)

- Steps 41–50 are done and committed (`ae86f0b` is step 50, spec v11). Check `git status -sb`
  rather than trusting this line; at the time of writing `main` was one commit ahead of `origin`.
- After step 50 the appointment routes are complete. The deleted-user marker is checked by booking
  and changing (a `ConditionCheck`, the transaction's last item, `404 user_not_found` without a
  retry) but **nothing writes it yet**: this step does.
- The shape steps 43–50 set. Keep it unless this step proves it wrong, and if it does, say so:
  - handler order: claims → `calendarConfig()` (500 if the zone is broken) → role → path → body →
    checks that need no data → `calendarDb` with the `calendarRules` check → one log line (`done()`);
  - every calendar write takes the lock (`withCalendarLock`) and runs its check on the data read
    **inside** the locked attempt; an `APPT` item is changed with an `Update` of the changed
    attributes, without a condition of its own; every appointment change writes its `EVENT` in the
    same transaction (15.4: "No path writes appointments silently");
  - ids are made once per request, outside the lock loop (here: one event id per cancelled
    appointment, so a retry of a chunk must reuse the same ones);
  - `calendarDb.ts` is the only module that knows the item layout; `cognito.ts` the only one that
    calls Cognito; handlers import neither SDK;
  - `now` is read once per request;
  - handler unit tests reload the module per test (`vi.resetModules()`).
- What the journeys leave behind: `calendar.test.ts` empties the table at its start; every block
  creates and removes its own `dave` and `erin` with `removeUserIfPresent` (Cognito only, **no
  marker**), and leaves their appointments as history under earlier `sub`s (Wednesdays, Thursdays,
  Fridays, one ended dated yesterday). Integration files run one at a time in any order, so
  `journeys.test.ts` may run before or after `calendar.test.ts`.
- In the agent's non-interactive shell, Node 22 is the default (`~/.nvm`); if `node -v` is not 22,
  run `source ~/.nvm/nvm.sh && nvm use`.

## Spec points this step must settle

Present each point with a proposed change. Do not edit the spec or the architecture until I approve.

1. **The order of `DELETE /users/{username}`, old and new.** Today: admin (403) → path (400) →
   `AdminListGroupsForUser` (404 `user_not_found`, 403 `cannot_delete_admin`) → sign-out → delete.
   10.2 adds, after "the current checks" and before the sign-out: the `sub` (`AdminGetUser`), the
   marker, the cancellations. Propose the numbered order with each answer, and say:
   - whether the time-zone check (`calendarConfig()`, R-TIME-01) applies to this route, and where:
     a broken `CalendarTimeZone` would then make **user deletion** answer 500. Before the role (as
     every calendar handler), after the admin and Cognito checks, or not at all (the route needs no
     zone)? Say what 14.1's "environment of every calendar function" and 14.3's "gains
     `CALENDAR_TABLE`" mean here: `calendarConfig()` needs `CALENDAR_TIME_ZONE`, and `db.ts` needs
     `DYNAMODB_ENDPOINT` locally. Propose the variables `DeleteUserFunction` declares;
   - what a lost lock three times in a row answers: `409 concurrent_update` (a new code on an
     existing route: architecture section 4, the front end's `UsersService`) or `500` (R-DEL-01:
     "the Administrator retries")?
   - that a target in no group (deletable today) gets a marker too.
2. **The marker write.** 10.2 lists it as its own step 2; 13.4 counts a chunk as at most 82 items
   (lock + marker + 40 × (`Update APPT` + `Put EVENT`)), which puts the marker in the first chunk.
   Propose one: the marker in its own locked transaction (lock + `Put`), then the chunks; or the
   marker in the first chunk. Say why, what a User with no appointments writes, and what happens to a
   booking that runs at the same moment (it must either be cancelled by this deletion or refused by
   the marker; never survive it). Repeat-safety (R-DEL-01): a plain `Put` that overwrites
   `deletedAt`/`deletedBy` on a retry, or `attribute_not_exists` so the first deletion's record is
   kept? The marker's attributes: `username`, `deletedAt`, `deletedBy` (`{ username, role }`).
3. **Which appointments, and how they are cancelled.**
   - 10.2 says "every active appointment of the User with `end > now`", which includes one **in
     progress**; AC-29 says "both future ones". Confirm that one in progress is cancelled too (and
     what an ended one keeps).
   - Selected by `userId` = the target's `sub`, never by `username` (an earlier account with the same
     name keeps its appointments: R-DEL-02, the history the earlier journeys leave). The read: the
     `APPT` query from `now − 24 h` inside each locked attempt, filtered in code; a chunk re-reads,
     so a retry or the next chunk sees what the previous one cancelled.
   - What each cancelled one stores: `status` `cancelled`, `cancelReason` `user_deleted`,
     `cancelledAt`/`updatedAt` now, `cancelledBy`/`updatedBy` the Administrator, `version` + 1, the
     same `Update` as a cancel (reuse `cancelled()` with a new reason).
   - The event: `appointment.cancelled` (15.1 lists no `appointment.user_deleted`; the reason is on
     the snapshot), `actor` the Administrator, `recipients` the deleted User (`userId`, `username`)
     and the Administrator. Confirm, and say whether a notifier can still reach a deleted account's
     address (15.1: the `email` hangs off the `sub`, which Cognito no longer has). Proposal only;
     notifications are out of scope.
   - Event ids: made once per request, outside the lock loop, but the number of appointments is only
     known inside it. Propose how a retry writes the same ids (for example ids made per appointment
     id on first sight, kept across attempts).
4. **Chunks** (40 appointments, 82 items). Each chunk under the lock as its own transaction, the
   next chunk re-reading. Say what the response is when chunk 2 fails after chunk 1 was written
   (R-DEL-01: 500, before any Cognito change; the retry finds the rest), and confirm the tests: 41
   appointments give two transactions; 0 give one (the marker only, or none, depending on point 2).
5. **`GET /users` (route 21, 10.1).**
   - `ListUsersInGroup` for `user` and for `admin`, each following `NextToken`; the members of
     `user` minus those of `admin`; sorted by username (say how: code-unit order, or `localeCompare`
     without a locale, as `typeNameKey` did); `createdAt` from `UserCreateDate` as an ISO instant.
   - A User in no group is not listed (it cannot be booked for: R-BOOK-01 `target_not_user`).
   - Errors: `403 forbidden` for a User or a token in neither group; `500 internal_error`. No query
     parameter, no paging of the answer (≤ 10 users, N6). Does the time-zone check apply? (It reads
     no calendar data and declares no calendar variable.)
   - The log line: the count of users only, never the names.
6. **What the existing route answers and logs.** The `204` stays. The log line gains, for example,
   `cancelledCount` and `lockAttempts` (say the names, and what `lockAttempts` means over several
   chunks); never the target's `sub`. Say whether `docs/ARCHITECTURE.md` section 4's row for
   `DELETE /users/{username}` changes (new codes, new behaviour) and whether `docs/FRONTEND_SERVICES.md`
   needs a note for step 53 (do not edit it now).
7. **The section 6.4 diagram.** The plan gives it to this step: show the `sub`, the marker, the
   locked chunks with their events, and that a failure there answers 500 before any Cognito change.
   Keep it as short as 6.7. Also the 7.3 residual-risk sentence (the deleted User's still-valid
   token: the marker closes the window for the calendar; other reads for up to 20 minutes) and the
   section 8 note on `ListUsersInGroup` (one answer, no `NextToken`, locally).

If anything else is unclear or contradictory while you read, stop and tell me, with a proposal. For
example: the existing `deleteUser` unit tests mock Cognito only and will need DynamoDB mocked too;
`journeys.test.ts`'s `carol` and the front end's `fe-journey` are now deleted through a route that
writes to the calendar table (a marker each, under the lock), while `calendar.test.ts` may empty the
table before or after; `removeUserIfPresent` writes no marker (fine for throw-away users: a new
account gets a new `sub`, R-DEL-02); the local-weight measurement now has 25 functions.

## The step

Only what step 51 lists.

- `backend/template.yaml`:
  - `ListUsersFunction` (`GET /users`, admin), with its log group and role: one inline Cognito
    statement `cognito-idp:ListUsersInGroup` on the user pool's ARN only, no table policy;
    `USER_POOL_ID`, `COGNITO_ENDPOINT`;
  - `DeleteUserRole` gains `CalendarReadPolicy` and `CalendarWritePolicy`, and `AdminGetUser` in its
    inline Cognito statement; `DeleteUserFunction` gains the variables of point 1. Check the role
    against spec 14.1 (GetItem, Query, PutItem, UpdateItem; AdminGetUser added): every action should
    be used; say so if one is not.
- `backend/scripts/local-seed.sh`: the `ListUsersFunction` section of `env.local.json`; nothing else
  unless point 1 needs it.
- `backend/src/lib/cognito.ts`: `listPlainUsers()` (both groups, every page).
- `backend/src/lib/calendarDb.ts`: the marker write and the chunked cancellation of point 2–4, each
  under the lock, the check of which appointments in code on the data read inside the attempt;
  reuse `cancelled()`, `appointmentUpdate`, `eventPut`, `deletedUserKey`; no new copy of the `APPT`
  attribute list.
- `backend/src/handlers/deleteUser.ts`: the order of point 1; the four steps of 10.2; R-DEL-01 (a
  failure in steps 2–3 answers 500 and makes no Cognito change); every existing outcome kept.
- Handler `backend/src/handlers/listUsers.ts`.
- Integration: in `calendar.test.ts`, a last block "users (route 21, deletion)" with its own
  throw-away `dave` and `erin` (removed first and at the end), its own type, pattern and settings on
  a weekday no earlier block books on (Tuesdays: the pattern journeys create a Tuesday pattern and
  delete it again in AC-28; no appointment is ever booked there), restored at the end. Write down at its top what the
  earlier blocks leave behind and which part you rely on.
- Documents, the step-51 rows of the plan's table:
  - `docs/ARCHITECTURE.md`: section 2 (diagram and 2.1: `listUsers`; `deleteUser` reaches the table),
    section 3 (`GET /users`: admin), section 4 (`GET /users`; `DELETE /users/{username}`'s new
    behaviour and any new code, in the settled order), 5.3 (the marker is written; the deletion's
    reads and transactions), 6.4 (the diagram of point 7), 7.1 (`DeleteUserRole`, `ListUsersRole`),
    7.3 (the residual risk), 8 (the `ListUsersInGroup` note), the step 51 sentence in the v12 entry;
  - `docs/SHARED_CALENDAR_SPEC.md` v12, only what you and I settle in points 1–7, with its
    change-log row;
  - `CLAUDE.md`: the folder map (`listUsers.ts`, the new `cognito.ts` and `calendarDb.ts` functions,
    `deleteUser.ts`'s calendar part), the `env.local.json` note (a fourth function with its own
    Cognito section), the local-weight line (measurement 2, 25 functions: memory and start-up; the
    fallback if one is needed);
  - the plan's status line.

Not in this step:
- the smoke test (step 52), even though `smoke.sh` deletes its user through the changed route: run
  it locally only if I ask;
- anything in `frontend/` (if point 1 or 6 adds a code to `DELETE /users/{username}`, say what step
  53 must do);
- the cloud: no deploy, no AWS command.

`shared/` should need no change: `UserSummary`, `ListUsersResponse` and every error code exist since
step 42. If a point changes the contract, or anything else turns out to need a change in `shared/`,
stop and say why first.

### Tests

- Unit (`aws-sdk-client-mock` for DynamoDB and Cognito, fake clock with `vi.setSystemTime`):
  - `cognito.ts`: `listPlainUsers` over several pages of both groups (`NextToken`), the admin
    excluded, a member of both groups excluded, sorted by username, `createdAt` as ISO;
  - `calendarDb`:
    - the marker write (keys, attributes, the condition of point 2) under the lock;
    - the reads inside each locked attempt (the `APPT` query from `now − 24 h`), the selection by
      `userId`, `booked` and `end > now` (one in progress included, an ended one and another
      account's with the same `username` left alone);
    - the exact items of one chunk (lock, `Update APPT` with `cancelReason` `user_deleted`,
      `Put EVENT` `appointment.cancelled`, the order);
    - 41 appointments give two transactions of the right sizes; 0 give the writes of point 2;
    - a retry that re-reads (an appointment cancelled by someone else between two attempts is not
      cancelled twice) and reuses the same event ids;
    - three lost attempts answering what point 1 decides;
  - handler `deleteUser`:
    - every existing case keeps its outcome (403 for a User, 400 path, 404 unknown, 403
      `cannot_delete_admin`, the sign-out skip locally, 500 on a Cognito failure, the log line);
    - the order of point 1, including where the time-zone check sits;
    - a failure in the marker or a chunk answers 500 and makes **no** sign-out and no delete call;
    - a repeated delete is idempotent (the marker written again or kept, nothing cancelled twice);
    - the log line: `target`, the count, the attempts; no `sub`, no note;
  - handler `listUsers`: the role cases (a User `403`, a token in neither group `403`), `200` with
    the users, `500` on a Cognito failure, the log line without names.
- Journeys (`calendar.test.ts`, the last block). Dates come from the real today, computed with the
  shared helpers, never with fixed offsets:
  - AC-32: `GET /users` lists `alice`, `dave` and `erin` and not `admin`, sorted; a User gets `403`.
    Other leftover accounts may exist (another file's throw-away users): assert on these, not on an
    exact list;
  - AC-29: `dave` with two future appointments (booked through the API on Tuesdays) and one ended
    appointment written directly (dated yesterday, as AC-31 did). `dave`'s token is taken before the
    delete. `DELETE /users/dave` as the Administrator: `204`; read from the table: both future ones
    `cancelled` / `user_deleted` with `cancelledBy` the Administrator, two `appointment.cancelled`
    events, the ended one unchanged, the marker `DELETEDUSER#<sub>` present; `dave`'s old token
    booking a free slot answers `404 user_not_found`; `erin`'s appointments untouched; the freed
    slots appear in `erin`'s view;
  - an earlier account named `dave` (the earlier blocks' history) keeps its appointments: the
    deletion selects by `sub`;
  - the settings restored at the end; the throw-away users removed;
  - they must pass twice in a row, and step 9's `carol` journeys and the front end's `fe-journey`
    journeys must still pass.

## How we work in this step

- **Restarts**: after the seed changes, `local:up` must be rerun, then `local:api` restarted
  (CLAUDE.md). Ask me; do not start or stop the stack yourself.
- **Hard rules**:
  - 100 % lines on `backend/src/lib`;
  - strict TypeScript, ESLint clean, no new dependency;
  - no wildcard action or resource;
  - handlers do not import the AWS SDK: Cognito through `cognito.ts`, the table through
    `calendarDb.ts`;
  - the API can never delete an administrator (the existing `cannot_delete_admin` check stays
    first, before any calendar write);
  - no AWS command and no deploy;
  - no `sub`, note, request body or username list reaches a log line.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 51)

- The seven spec points presented and decided before `deleteUser.ts` changes and before the marker
  and cancellation transactions are written.
- `npm run test:unit -w backend` is green, with 100 % lines on `backend/src/lib` and the cases above.
- The journeys pass twice in a row: AC-29 and AC-32, and every earlier journey (Hello World's step 9
  journeys with `carol`; the calendar's settings, types, patterns, view, overrides and windows,
  booking, listing, note and cancel, change) is still green. Run
  `RUN_INTEGRATION=1 npm run test:integration -w backend` with the stack's `DYNAMODB_PORT`.
- The front-end journeys are still green: `RUN_INTEGRATION=1 npm run test:integration -w frontend`,
  run after the back end's, never at the same time.
- `grep` of the four managed policies shows no `*` in any action or resource. `DeleteUserRole` has
  exactly `CalendarReadPolicy`, `CalendarWritePolicy` and its inline Cognito statement with
  `AdminGetUser` added; `ListUsersRole` has only `ListUsersInGroup` on the pool's ARN.
- The local-weight measurement 2 recorded in `CLAUDE.md` (memory of the whole stack after the
  journeys, start-up time if measured), with the fallback if one is needed.
- `sam validate --lint` passes, and the root `npm run typecheck`, `npm run lint` and
  `npm run test:unit` are green.
- The root `npm run verify` is green (with the stack's `DYNAMODB_PORT`).

Report each result, including anything you could not run, then stop for review. Do not start step
52. Commit only when I ask. Do not push and do not deploy.
