## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
sam --version                                                # 1.171.0 or newer (scripts/check-sam.sh)
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. This step
adds no function and does not change the seed, so no restart is needed for the code. **One restart is
needed for AC-36**: `local:api` must run with its output captured to a file. The agent will ask you
and name the file; the command is then
`npm run local:api -w backend 2>&1 | tee <file>`. Since commit `be9cd03`, `local:api` makes one
registry lookup per start (`docker pull` of the Lambda base image) and is ready in about 11 s; a
`WARNING: could not check … at the registry` line only means the local copy is used. Ctrl-C removes
the Lambda containers `sam local` leaves behind; the `LAMBDA_RUNTIME Failed to get next invocation`
lines and the Python `Exception ignored … I/O operation on closed file` messages printed while it
stops are harmless. Check `docker port hello-world-api-dynamodb-1` and tell the agent which
`DYNAMODB_PORT` the stack uses (8000 by default, 8002 if another project holds 8000; it was 8002 in
step 51).

## Brief

Implement plan step 52, "Back end closing: smoke test, logs, repeatability", the twelfth step of
the shared calendar, following CLAUDE.md's working rhythm: one step, its acceptance check, an honest
report, then stop for review. One stop at the end, **plus an early stop for the spec points below**
(see "Spec points this step must settle"): present them before you change `smoke.sh`.

This step closes the back end. It adds no route, no function and no table item type. It changes one
existing script (`backend/scripts/smoke.sh`, Hello World's plan step 10), which an operator runs
after every deploy (`docs/RUNBOOK.md` section 2). Every existing check of the smoke test must keep
its outcome and its line, unless a point below changes it with my approval. Step 55 will run the
same script against the cloud, so whatever it does locally it must also be able to do there, with
the operator's normal login and nothing else.

Read these in full first:
- `CLAUDE.md` (in particular: the script portability rules, how passwords and tokens travel in the
  scripts, `smoke`, `verify`, the local-stack notes and the "Runtime image" note);
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps 41–56)": the conventions under
  "How these steps are run", the rule under "Where the truth lives while the calendar is built" with
  its row-by-row table (step 52 has the rows `docs/RUNBOOK.md` "Smoke test's calendar journey" and
  `backend/scripts/smoke.sh` 18.4; AC-36 and the smoke test in the acceptance table near the top),
  step 52 itself, step 55 (what will reuse this script), and steps 9 and 10 (the journeys the smoke
  test repeats, and the script's first version);
- `docs/SHARED_CALENDAR_SPEC.md` v12 sections:
  - **18.4** (the smoke journey, all of it), 18.2, 18.3 AC-36;
  - 9 (the settings and their ranges: `bookingHorizonDays`, `minBookingNoticeHours`,
    `cancellationNoticeHours`, `maxFutureAppointmentsPerUser`), 6.1 (types: the name rule, R-TYPE-03
    `type_in_use`), 6.4, 6.5 and 6.7 (one-off windows, combining sources, conflicts), 7 (slots), 8.2
    (booking for a User, the order of the checks), 8.3 (cancel, `cancellableUntil`), 8.6 (listing,
    `upcoming`);
  - 11.1 (the routes the journey calls: settings, types, one-off windows, the view, booking,
    listing, cancel), 11.2 to 11.4 (parameters, error codes, request bodies);
  - 5 (the time model: local dates and times, DST), 14.5 (logging: what never reaches a log line),
    R-NOTE-02;
- `docs/ARCHITECTURE.md` section 9.3 (the smoke test), section 4 (the calendar routes as they are
  now), the logging rules, and the v12 change-log entry;
- `docs/RUNBOOK.md` (all of it: sections 2 and 3 run the smoke test; section 5 records step 11's
  "10/10 PASS").

Then read the code this step builds on:
- `backend/scripts/smoke.sh`, `scripts/target.sh` (`load_target`, `json_field`, `idp`, `ddb`,
  `cognito`, `die`), `scripts/cognito.mjs`: how a token reaches curl (`-H @-`), how answers are read
  (`field`), what is printed on a failure (`error_code`, never a body that may hold a password), the
  `cleanup` trap and the `created`/`deleted` flags;
- `backend/tests/integration/calendar.test.ts`: the journeys that create a one-off window, book for
  a User, list `upcoming`, cancel, delete a window and a type (the request bodies and answers the
  smoke test will send and read); its note texts (the AC-36 search below needs them);
- the handlers of the routes the smoke journey calls and their `done()` log lines, to know what a
  correct local log contains: `createAvailabilityType.ts`, `createOneOffWindow.ts`,
  `bookAppointment.ts`, `listAppointments.ts`, `cancelAppointment.ts`, `deleteOneOffWindow.ts`,
  `deleteAvailabilityType.ts`, `getCalendarSettings.ts`; and `deleteUser.ts` since step 51 (the smoke
  test's journey 11 now writes a `DELETEDUSER` marker and cancels what the throw-away user still has
  booked);
- `shared/src/calendar/time.ts` (local date and time in a zone, without the machine's zone) and
  `shared/src/calendar/defaults.ts` (default settings, ranges).

## Where we are (2026-11-14)

- Steps 41–51 are done and committed: `f08c480` is step 51 (spec v12), `be9cd03` the local start-up
  fix (one registry lookup per `local:api` start, `skip_pull_image`). Check `git status -sb` rather
  than trusting this line; at the time of writing `main` was three commits ahead of `origin` (steps
  50, 51 and the fix).
- The back end has all 21 calendar routes plus Hello World's. Root `verify` was green once at the end
  of step 51; the journeys (90 back-end tests, 19 front-end tests) passed several times on SAM
  1.172.1 with 25 functions.
- `smoke.sh` today: journeys 4, 6, 3 and 11 of plan step 9 with a throw-away `smoke-<epoch>` user,
  plus two direct reads of its `hello-messages` rows; 10 checks (RUNBOOK section 5). Since step 51,
  its journey 11 (`DELETE /users/smoke-…`) also writes a marker in the `calendar` table. The smoke
  test has not been run since step 51.
- What the journeys leave behind locally: `calendar.test.ts` empties the `calendar` table at its
  start and restores the settings at the end of every block. Locally the smoke test therefore meets
  the default settings, unless a journey failed half-way; in the cloud it meets whatever the
  Administrator configured, and real availability and appointments.
- In the agent's non-interactive shell, Node 22 is the default (`~/.nvm`); if `node -v` is not 22,
  run `source ~/.nvm/nvm.sh && nvm use`.

## Spec points this step must settle

Present each point with a proposed change. Do not edit the spec, the architecture or the runbook
until I approve.

1. **Finding the date (decided: search, do not guess).** 18.4's "03:00–04:00 local, 50 days ahead"
   can be defeated by the settings (`bookingHorizonDays` may be below 50, range 1–365;
   `minBookingNoticeHours` and `cancellationNoticeHours` up to 720 h). The smoke test therefore
   does not pick a date and hope: before creating anything, it reads the rules and finds a date
   they allow. Never change the settings from the smoke test: in the cloud they are the
   Administrator's.
   - Read `GET /calendar/settings` as the admin. The usable range of start instants:
     - earliest: now + the larger of `minBookingNoticeHours` and `cancellationNoticeHours` (the
       user must still be allowed to cancel, R-CAN), plus a safety margin;
     - latest: what `bookingHorizonDays` allows (R-BOOK: say exactly how the horizon is counted,
       from the spec and `checkBooking`, so the script and the back end agree).
   - The hour stays 03:00–04:00 local. The preferred date is still 50 days ahead when it lies in
     the range; otherwise the search starts at the earliest date of the range.
   - Propose: the safety margin (for example one day); "local" in which zone (the settings
     answer's `timeZone`, or the deployment's `CalendarTimeZone` if the answer has none); how the
     date arithmetic is done (node with `Intl` only, like `shared/src/calendar/time.ts`; no
     `date -d`/`-v`, CLAUDE.md; never the machine's zone); and what a DST day does (a zone where
     03:00 does not exist or occurs twice that day: skip it).
   - What the script prints when the range is empty (for example a cancellation notice of 720 h
     with a horizon of 14 days): one FAIL line that names the settings that block the journey and
     their values, then no calendar journey (the other checks still run, and the user is still
     deleted). Propose its wording; the runbook explains it (the operator decides, the test never
     changes the settings).
2. **Finding a free hour on that date (decided: look first).** In the cloud a pattern, an override,
   another one-off window or an appointment may already cover 03:00–04:00, and the window would
   then be refused (6.4, 6.5, 6.7). So the script reads the real calendar before creating anything:
   `GET /calendar` as the admin over the usable range from point 1 (at most 31 days per call:
   several calls if the range is longer, but say how many days it searches at most), and takes the
   first date, starting from the preferred one, on which nothing covers 03:00–04:00 local. Propose:
   - which fields of the view answer show that the hour is free (windows of every source, and
     appointments, booked or not, that overlap it), so that the one-off window cannot conflict;
   - the search limit and order (forward from the preferred date, then backward to the earliest?);
   - whether the search is a check line of its own ("found a free hour on <date>"), and the FAIL
     line when none is found in the limit (it names the range searched; no calendar journey);
   - the remaining race (a booking or a window created by someone else between the read and the
     write): the window or the booking then answers 409; the script reports FAIL with the code and
     cleans up (point 5), no retry.
3. **The journey, step by step, and what each step checks.** As the admin: create the type
   `smoke-<epoch>` (does it satisfy the type-name rule and its 40-character limit? the same epoch as
   the user), create the one-off window, book it for the throw-away user (route 16 body for a User;
   which `start`/`end`); as the user: `upcoming` shows it (which fields are compared: id, start, type,
   status), then cancel it (the answer: `status`, `cancelReason`); as the admin: delete the window,
   then the type (R-TYPE-03: the cancelled appointment does not block; the window must go first).
   Propose the exact check lines (wording in the style of the existing ones, PASS/FAIL each) and the
   new total, which RUNBOOK sections 2, 3 and 5 should state. Say where the journey goes in the
   script: after journey 3 (the user exists and has a token) and before journey 11 (the plan: "run
   before the journey that deletes the throw-away user").
4. **A note on the booking?** 18.4 books without one. A note with a recognisable text would let
   step 55 search CloudWatch for it (AC-36 in the cloud) as this step searches the local log.
   Propose yes or no; if yes, the text (it must never be printed by the script either) and where the
   check of its absence from the logs is described (RUNBOOK for step 55; nothing automatic in the
   cloud).
5. **Clean-up on every exit.** Today the trap deletes the throw-away user straight in Cognito if the
   API did not. The calendar journey adds a type, a window and an appointment. Propose what the trap
   does when a check fails half-way or on Ctrl-C: through the API with the admin token still in a
   shell variable (cancel the appointment if booked, delete the window, delete the type), in which
   order, and what it prints when a clean-up call fails (the ids to remove by hand, never a body).
   Note that journey 11 now cancels whatever the throw-away user still has booked (step 51): say
   whether the trap relies on that. Say what stays behind by design: the cancelled appointment, its
   `APPTID`, its events and the `DELETEDUSER` marker, as history (18.4: "The appointment and its
   events stay as history, as the smoke test's messages do").
6. **What the script prints and reads.** No calendar answer body is printed, on success or failure
   (it may hold a note): the status and the error code only, as `error_code` does today. Calendar
   checks go through the API only, or also read `calendar` items directly with `ddb` as the hello
   rows do (for example the two `EVENT` items)? Propose one and say what it costs in the cloud
   (the operator's permissions, the keys the script must know).
7. **AC-36 end to end, locally** (the plan: capture `local:api`'s output, search it for the
   journeys' note text and any request or response body; zero hits is the pass). Propose the exact
   search: the note texts used in `calendar.test.ts` and in the front end's journeys and the smoke
   test (if point 4 adds one); JSON keys that appear only in bodies (`"note"`, `"password"`,
   `"windows"`, `"conflicts"`, …: say which, and check that none of them also appears in a legitimate
   log line, for example a field name); bearer tokens (`eyJ`); the throw-away users' passwords
   cannot be known in advance: say how the search still covers the create-user response body. Say
   which runs the captured file must contain (the back-end journeys, the front-end journeys and the
   local smoke test), and that `sam local`'s own lines (`START`, `END`, `REPORT`, the access log with
   paths and query strings) are not bodies. If the search finds anything, stop and tell me before
   changing any handler.

If anything else is unclear or contradictory while you read, stop and tell me, with a proposal. For
example: the spec calls 18.4 "Smoke test (cloud)" while the plan runs it locally first; the smoke
test's local run writes to the local `calendar` table, which the next journeys empty (fine?); the
front-end journeys create calendar items of their own and do not reset the table.

## The step

Only what step 52 lists.

- `backend/scripts/smoke.sh`: the calendar journey of 18.4 as settled in points 1–6, run after
  journey 3 and before journey 11; its clean-up in the trap; the header comment (what the script
  runs, what it leaves behind). It needs only node, curl and the AWS CLI, with CLAUDE.md's portability
  rules (bash 3.2 and 5, BSD and GNU tools, no jq, no `sed -i`, `stat`, `date -d`/`-v`, no
  here-strings for secrets). Tokens travel as today (`-H @-`), never as an argument or in a file. If
  node computes the date, it reads its inputs from stdin or arguments that hold no secret.
- `docs/RUNBOOK.md`: the smoke test's calendar lines (sections 2 and 3: what the new lines check,
  the new total, what stays behind in the `calendar` table and how to recognise it; what to do when
  the calendar journey fails because of the settings or real availability, point 1–2; for step 55,
  the AC-36 check in CloudWatch if point 4 adds a note).
- AC-36 end to end, locally, as settled in point 7.
- Documents:
  - `docs/ARCHITECTURE.md`: section 9.3 (the smoke test gains the calendar journey), the step 52
    sentence in the v12 entry;
  - `docs/SHARED_CALENDAR_SPEC.md` v13, only what you and I settle in points 1–7, with its
    change-log row (18.4 at least, if any point changes it);
  - `CLAUDE.md`: the `smoke` line in "Everyday commands" (what it now runs and leaves behind);
  - the plan's status line ("back end complete").

Not in this step:
- anything in `frontend/` (the front-end journeys run only as a check);
- the cloud: no deploy, no AWS command against a stack, no `npm run smoke -w backend -- <stack>`
  (step 55);
- any handler change. If the AC-36 search or the smoke test finds a defect in a handler, stop and
  tell me first.

`shared/` should need no change. If a point needs one, stop and say why first.

### Tests

- `smoke.sh` has no unit tests (Hello World's step 10 did not either). Prove it by running it:
  - `DYNAMODB_PORT=<port> npm run smoke -w backend -- local` all PASS, twice in a row (two throw-away
    users, two types);
  - one run with a forced failure in the middle of the calendar journey (say how you force it
    without editing the committed script, for example an environment variable only the test run sets,
    or a temporary copy in the scratchpad), showing FAIL, the clean-up lines, exit 1, and afterwards
    no `smoke-…` type, no one-off window and no booked appointment left (read through the API or
    DynamoDB Local), the throw-away user gone;
  - one run interrupted with Ctrl-C (or `kill -INT`) during the calendar journey, same checks;
  - the date logic of points 1 and 2 with fixed inputs (default settings: 50 days; a horizon below
    50; a long notice; an empty range; a DST date in the zone; a preferred date already covered at
    03:00), run as a small node check in the scratchpad, not committed unless I ask;
  - one local run where 03:00–04:00 on the preferred date is already taken (a one-off window
    created by hand through the API before the run, removed after), showing that the script picks
    another date and still passes;
  - `bash -n` and `shellcheck` clean.
- The admin password reaches the script on stdin
  (`printf '%s\n' 'Admin-Local-Pass-1!' | DYNAMODB_PORT=… npm run smoke -w backend -- local`),
  never as an argument of the script.

## How we work in this step

- **Restarts**: ask me before `local:api` must be restarted with its output captured (point 7); do
  not start or stop the stack yourself. Name the file to `tee` into (outside the repository).
- **Hard rules**:
  - no secret (password, token) printed, passed as a command-line argument or written to disk; no
    calendar answer body printed;
  - the smoke test never changes the calendar settings, never deletes or changes anything it did
    not create, and deletes the throw-away user on every exit;
  - no wildcard action or resource (no template change is expected at all);
  - no AWS command and no deploy;
  - the script stays portable (CLAUDE.md).
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 52)

- The seven spec points presented and decided before `smoke.sh` changes.
- `DYNAMODB_PORT=<port> npm run smoke -w backend -- local`: every line PASS, twice in a row; the
  forced-failure and interrupt runs leave nothing of the calendar journey behind but the history of
  point 5.
- The AC-36 search over `local:api`'s captured output (back-end journeys, front-end journeys, the
  local smoke test) finds nothing; report the exact commands and the hit counts.
- The front-end journeys are still green: `RUN_INTEGRATION=1 npm run test:integration -w frontend`,
  run after the back end's, never at the same time.
- `bash -n` and `shellcheck` clean on `smoke.sh`; `sam validate --lint`, the root
  `npm run typecheck`, `npm run lint` and `npm run test:unit` green.
- The root `DYNAMODB_PORT=<port> npm run verify` green **twice in a row**.

Report each result, including anything you could not run, then stop for review. This is the
plan's "back end complete" checkpoint: suggest the commit, but commit only when I ask. Do not push
and do not deploy. Do not start step 53.
