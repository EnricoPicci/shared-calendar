## Before opening the new session (operator)

This pair changes the shared contract and the back end, and ends with the back end's calendar
journeys against the local stack. In the worktree `shared-calendar-slot-5min` (branch
`slot-5min`), after `nvm use`, with Docker running and **no `ANTHROPIC_API_KEY` in the shell**
(the journeys refuse the real Claude):

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

Start the stack from this worktree, not from the checkout of `main`: `backend/env.local.json`
is written by `local:up` and names the local user pool, and the mail work must not be using the
same ports at that moment. No AWS login and no Anthropic key are needed. Nothing goes to the
cloud in this pair.

You will be asked once, near the end, to stop `local:api` and start it again: the session
builds the back end, and the running API serves the old build until it is restarted.

## Brief

Implement the pair of plan steps s1, "The rules in the documents", and s2, "The step in
`shared/` and in the back end" (`docs/SLOT_STEP_PLAN.md`), following CLAUDE.md's working rhythm
as the plan sets it for a pair: both steps, s1 before s2, one check at the end, an honest
report, then stop for review.

After this pair the API accepts the Administrator's times on 5-minute steps: a weekly pattern,
a one-off window and a window of a date override may start at 09:05, a custom appointment may
run 10:10 to 10:35 and last 5 minutes. A time off the step (10:07) is refused with
`400 invalid_request`, as a time off the quarter hour is today. A User still books whole-hour
slots only. The page still offers quarter hours, since it has its own step until the second
pair; the assistant is still told "the quarter hour" until step s3. Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (`shared/` imports only TypeScript and `zod`), "Cloud safety", "Comments",
  "Tooling and style" (100 % line coverage on `backend/src/lib` and `shared/src`), "Changing
  these files"; then `backend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of `.claude/rules/`
  load when a file of their paths is read.
- `docs/SLOT_STEP_PLAN.md`, all of it: the decisions S1 to S8 (section 2), **the findings
  (section 3: F1, F7 and F8 are decided; F1 to F6 shape this pair)**, the
  rules as they will read (section 4), section 5's opening (the pairs, the short check),
  **steps s1 and s2**, steps s3 and s4 to see what this pair must not take from them, and
  section 6 (the files the mail work also touches).
- `docs/SHARED_CALENDAR_SPEC.md`: the glossary row "Local time"; decisions D2 and D12 and the
  last decision of the table (D31), to number the new one after it; section 5 where it says
  how an appointment's times are held; sections 6.2 to 6.4; **section 7, R-SLOT-01 and
  R-SLOT-05**; **section 8.2, R-BOOK-02**, and 8.4 where it points at it; section 11.4 (the
  comment on `LocalTime`); section 12 (what each file of `shared/` holds); the screens' table
  (the row "Book dialog"); section 18 (18.1 the unit tests, 18.3 the acceptance scenarios, to
  number the two new ones after the last); the change log and the status line.
- `docs/ARCHITECTURE.md`: the version table and the status line; section 4, the rows of
  `PatternBody`, `BookBody` and `ChangeBody` and the paragraph on booking.
- The code: `shared/src/calendar/defaults.ts`, `schemas.ts` (`LocalTime`, `LocalEndTime`, the
  comment above the request bodies), `rules.ts` (`slotsOf`, `peopleIn`, `localMinute`,
  `isWholeLocalHour`, `isOnQuarterGrid`), `time.ts`, `shared/src/index.ts`;
  `backend/src/lib/calendarRules.ts` (`checkBookingTimes`, `QUARTER_MS`); the tests of these
  under `shared/tests/calendar/` and `backend/tests/unit/`;
  `backend/tests/integration/calendar.test.ts` and `setup.ts`; the pages
  `docs/journeys/backend/calendar-booking.md` and
  `docs/journeys/frontend/calendar-appointments.md`, and `docs/journeys/README.md`.

## Where we are (2026-11-25)

- `docs/SLOT_STEP_PLAN.md` and its brief are committed on `slot-5min` (v2 in `89fedc7`, not
  pushed; v3, with F1, F7 and F8 decided, comes with this brief). Nothing of the 5-minute step is built; no document but the plan mentions it.
- The branch started from `main` at `b3c3425`. The mail work goes on in the checkout of `main`
  and has not been merged here.

## Decided already (the Product Owner, 2026-11-25)

The decisions S1 to S8 of `docs/SLOT_STEP_PLAN.md` section 2, and the pairing of the steps.
Apply them; if the spec or the code proves one wrong, stop and tell me before going on.

## Decided for this pair (the Product Owner, 2026-11-25)

The three proposals of planning, recorded in `docs/SLOT_STEP_PLAN.md` section 3 (v3). Nothing
is left to ask before starting.

1. **F1, the step is written once.** The constant `TIME_STEP_MINUTES` in
   `shared/src/calendar/defaults.ts`, read by the schema, the rule, the back end's check and,
   in the second pair, the page; `isOnQuarterGrid` is renamed `isOnTimeStep`.
2. **F7, a short block beside the next** (built in step s5, written into the documents now).
   A block of the week is never lower than 15 minutes' worth (S7); a block that starts inside
   the drawn height of another stands side by side with it, as the week already draws
   appointments that overlap. The people in a slot and the block of four or more follow the
   real times only.
3. **F8, the book dialog with a list of hours and a list of minutes** (built in step s4,
   written into the documents now). The hours are those the slot's window touches, the
   minutes all twelve whatever the hour; a pair outside the window is the server's to refuse
   with `outside_availability`; with the hour 24 the minutes hold only 00.

## Step s1 — the rules in the documents

1. **`docs/SHARED_CALENDAR_SPEC.md`, a new version:** everything listed in
   `docs/SLOT_STEP_PLAN.md` section 4.
   - The glossary, D2 and D12 restated; **one new decision after the last of the table**, the
     step: 5 minutes, why, the slot unchanged, nothing migrated (F2), one constant (F1).
   - Sections 6.2 to 6.4, the comment of 11.4, R-BOOK-02's column of the Administrator
     (`end − start ≥ 5 min`, S6). R-SLOT-01 keeps its words and gains the example of the
     window 08:05 to 12:00 with its three slots, and the sentence of F4: the 55 minutes before
     09:00 are open hours in which no slot starts.
   - The row "Book dialog" of the screens' table: each time chosen as an hour and a minute,
     "from" drives "to" (S1 to S5, F8), pointing at
     `docs/FRONTEND_ARCHITECTURE.md` for the detail.
   - Section 18: the unit tests of the grid restated; two acceptance scenarios, numbered after
     the last: the window 08:05 to 12:00 and its slots; the Administrator's 10:10 to 10:35
     accepted, a 5-minute appointment accepted, 10:07 refused with `400 invalid_request`, a
     User's 10:10 refused as today.
   - The change log, and the status line: this version is specified; the server's part is
     built in this pair, the page's and the assistant's are not yet. Head the parts that the
     page does not do yet with the sentence "not built yet", as version v17 did, and take that
     sentence away from the server's parts in step s2.
   - Search the whole document for "15-minute", "15 min", "quarter" and "grid": the list above
     is from planning and may miss a line. A "15 minutes" that is about something else (the
     access token) stays.
2. **`docs/ARCHITECTURE.md`:** a new version row, open, and the status line; in section 4 the
   rows of `PatternBody`, `BookBody` and `ChangeBody` where they name the step. **Do not
   number the version row for good:** the mail work adds its own row on `main`
   (`docs/SLOT_STEP_PLAN.md` section 6); take the next free number and say in the report that
   the merge may change it.
3. **`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
   `docs/CONVERSATIONAL_ARCHITECTURE.md`:** one sentence at the end of the status line each,
   that the step becomes 5 minutes in step s4 (the two front-end documents) or s3 (the
   assistant's) of `docs/SLOT_STEP_PLAN.md`. Nothing else in them now.
4. `npm run lint` green. No diagram should need a change; if one does, render it on a dark
   page (`.claude/rules/diagrams.md`).

No stop here: go on to step s2.

## Step s2 — the step in `shared/` and in the back end

1. **`shared/src/calendar/defaults.ts`:** `TIME_STEP_MINUTES`, 5, with a comment in plain
   words and its reference (`docs/SHARED_CALENDAR_SPEC.md` decision D2).
2. **`shared/src/calendar/schemas.ts`:** `LocalTime` accepts `00:00` to `23:55` with the
   minutes 00, 05 … 55; its message says "5-minute"; the comments that name the grid.
   `LocalEndTime` follows by itself: check that `24:00` is still the only time past 23:55, and
   that `24:05` is refused.
3. **`shared/src/calendar/rules.ts`:** `isOnTimeStep`, built on the constant; an
   instant with seconds is still on no grid. `isWholeLocalHour` and `slotsOf` do not change.
   The export of `shared/src/index.ts` follows the rename.
4. **`backend/src/lib/calendarRules.ts`:** `checkBookingTimes` uses the renamed check; the
   minimum length is one step; the three messages say "5-minute step" and "at least 5 minutes"
   (F5). The User's branch does not change. No handler changes: check that none names the
   step.
5. **Tests**, 100 % line coverage kept on `shared/src` and `backend/src/lib`:
   - Every test that uses a time on the 5-minute step as its example of a refusal (F6:
     `08:10`, `09:10`, `12:05`, `10:10`, and the instants `…T08:10`, `…T08:50`, `…T09:05`,
     `…T09:10`) takes a time off it (`08:07`), and its file gains the opposite case, the old
     example accepted. Find them by running the tests after the change, not from the plan's
     list alone.
   - **Not here, and expected to stay as they are:** the tests of the assistant's tools under
     `backend/tests/unit/assistant/` are step s3's. If one of them fails after this change
     (`availabilityTools.test.ts` and `bookAppointment.test.ts` quote off-step times), change
     in it only the example time, so that the gate is green, and report which; what the tools
     tell Claude does not change in this pair.
   - New in `shared/tests/calendar/`: `LocalTime` on `00:05`, `23:55`, `08:07`, `24:05`;
     `slotsOf` on the window 08:05 to 12:00 (09:00, 10:00, 11:00) and on 10:10 to 10:50 (no
     slot); the grid check on 02:05 and 02:55 of the two nights the clocks change in
     `Europe/Rome`, and in a zone whose offset is not a whole hour (`Asia/Kathmandu`);
     `peopleIn` with appointments 5 minutes long that touch.
   - New in `backend/tests/unit/lib/`: `checkBookingTimes` for the Administrator on 10:10 to
     10:35, on exactly 5 minutes, on an `end` left out from a start at 10:10 (11:10), on 10:07.
   - `frontend/tests/unit/services/availability-rules.service.test.ts` quotes the schema's
     message: its expectation follows, and its example time. **Nothing under `frontend/src`
     changes in this pair.**
6. **The journey.** In `backend/tests/integration/calendar.test.ts`, a `describe` block of its
   own for the two acceptance scenarios of step s1, on dates of its own, in the style of the
   blocks beside it. Its page under `docs/journeys/backend/`, written and checked with the
   project skill `explain-journey`, and its line in `docs/journeys/README.md`. In the pages
   `docs/journeys/backend/calendar-booking.md` and
   `docs/journeys/frontend/calendar-appointments.md`, the words "15-minute" where they state
   the rule; their tests do not change.
7. **Documents**, in the same change:
   - `docs/SHARED_CALENDAR_SPEC.md`: section 12, the rows of `rules.ts` and `defaults.ts`; the
     "not built yet" taken away from the server's parts.
   - `docs/ARCHITECTURE.md`: this pair's sentence in the open version row.
   - `shared/CLAUDE.md` and `backend/CLAUDE.md` only if a name they hold changed; follow
     "Changing these files" of `CLAUDE.md`.
   - `docs/FOLDER_STRUCTURE.md` if it names the check.
   - `docs/SLOT_STEP_PLAN.md`: an "As done" note under step s1 and one under step s2, the
     second ending with what step s3 and the pair s4 with s5 find ready; the version line.

**Known gap, accepted:** between this pair and the next ones the server accepts 5-minute times
that the page cannot offer and the assistant is not told about. Nothing is deployed in
between. Say it in the "As done" note.

Not in this pair: any file under `frontend/src`; `backend/src/assistant` (the instructions,
`hoursInput`); `backend/tests/eval`; `backend/scripts/smoke.sh`; `backend/template.yaml`;
`README.md`, `docs/RUNBOOK.md`, `docs/FRONTEND_WALK.md`; the body of
`docs/FRONTEND_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md` and
`docs/CONVERSATIONAL_ARCHITECTURE.md` beyond their one sentence; the records of finished work
(`docs/IMPLEMENTATION_PLAN.md`, `docs/FRONTEND_VIEW_PLAN.md`, the old briefs), which keep
saying what was true when they were written; any `aws` command; the cloud.

## How we work in this pair

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing on a
  rule; any change the pair seems to need in a file listed under "Not in this pair"; and the
  restart of `local:api` below.
- **Before the journeys:** run `npm run build -w backend` (never a raw `sam build`), then ask
  me to restart `local:api`, and wait for my word. Do not stop or start it yourself.
- The back end's calendar journeys empty the local `calendar` table. Do not run the back
  end's and the front end's integration tests at the same time.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or
  why, each reference with the document's path in the same sentence, no step or brief
  numbers, no "formerly 15".
- Commit only when asked. Do not push. Do not start step s3.

## Acceptance (`docs/SLOT_STEP_PLAN.md` steps s1 and s2)

- The spec states the 5-minute step, with its new decision and its two scenarios; the
  architecture has its open row; the three other documents have their sentence.
- `shared/` and the back end accept the Administrator's times on 5-minute steps and a length
  of 5 minutes, refuse a time off the step with `400 invalid_request`, and the step is written
  once.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept.
- `DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend` green, with
  `local:up` running and `local:api` restarted on the new build; the new journey among them,
  with its page.
- `git status` shows changes under `shared/`, `backend/src/lib`, `backend/tests`, `docs/` and
  the one front-end test only, plus `shared/CLAUDE.md` or `backend/CLAUDE.md` if a name
  changed.
- The "As done" notes hold the detail, the known gap included. Then the short closing
  message, and suggest the commit.
