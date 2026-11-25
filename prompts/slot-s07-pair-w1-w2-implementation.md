## Before opening the new session (operator)

This pair changes the shared contract and the back end, and ends with some of the back end's
calendar journeys against the local stack. In the worktree `shared-calendar-slot-5min` (branch
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

Implement the pair of plan steps w1, "The rules in the documents", and w2, "The rule in
`shared/` and in the back end" (`docs/WINDOW_HOURS_PLAN.md`), following CLAUDE.md's working
rhythm as the plan sets it for a pair: both steps, w1 before w2, one check at the end, an
honest report, then stop for review.

After this pair the API refuses a window that is not a whole number of hours (a weekly
pattern, a window of a date override, a one-off window) with `400 invalid_request`, and a
User's slots are the hours counted from the start of the effective window: 09:05–11:05 gives
09:05 and 10:05. A User's start on the 5-minute step that is not a slot is refused under the
lock with `409 outside_availability`; a start off the step is still `400 invalid_request`. The
page and the assistant are not changed yet (steps w3 and w4). Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (`shared/` imports only TypeScript and `zod`), "Cloud safety", "Comments",
  "Tooling and style" (100 % line coverage on `backend/src/lib` and `shared/src`), "Changing
  these files"; then `backend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of `.claude/rules/`
  load when a file of their paths is read.
- `docs/WINDOW_HOURS_PLAN.md`, all of it: the decisions 1 to 8 and Q1 to Q8 (section 2),
  **the findings (section 3: F1, F2, F3, F5, F6, F7 and F9 shape this pair)**, the rules as
  they will read (section 4), section 5's opening (the pair, **how a step is checked**),
  **steps w1 and w2**, steps w3 and w4 to see what this pair must not take from them, and
  section 6.
- `docs/SHARED_CALENDAR_SPEC.md`: the glossary ("Slot", "Window", "Local time"); decision D32
  and the last row of the decisions' table, to number the new one after it; **section 5,
  R-TIME-02 and R-TIME-03**; sections 6.2 to 6.6; **section 7, R-SLOT-01 to R-SLOT-05**;
  **section 8.2** (R-BOOK-02, R-BOOK-06, the order of the checks) and 8.4 where it points at
  them; sections 11.4, 11.6 and 11.7; section 12; the row of the window forms in 16.8; section
  18 (18.1, **18.3 with AC-13, AC-45 to AC-48**, 18.4); the change log and the status line.
- `docs/ARCHITECTURE.md`: the version table and the status line; section 4, the rows of the
  window bodies and the paragraph on booking.
- The code: `shared/src/calendar/rules.ts` (`slotsOf`, `effectiveWindows`, `isWholeLocalHour`,
  `isOnTimeStep`), `schemas.ts` (`windowFields`, `WindowBody`, `PatternBody`,
  `OneOffWindowBody`, the comment above the request bodies), `shared/src/index.ts`;
  `backend/src/lib/calendarRules.ts` (`checkBookingTimes`, `checkBooking`, `checkChange`,
  `calendarView`); their tests under `shared/tests/calendar/` and `backend/tests/unit/`;
  `backend/tests/integration/calendar.test.ts` and `setup.ts`; the pages
  `docs/journeys/backend/calendar-time-step.md` and `calendar-booking.md`, and
  `docs/journeys/README.md`.

## Where we are (2026-11-25)

- `v2.4.0` is deployed from this branch and tagged locally (`042142e`); nothing pushed.
- `docs/WINDOW_HOURS_PLAN.md` v2 and its brief are committed (`5fa29f9`). Nothing of the rule
  is built; no document but the plan mentions it.
- The mail work goes on in the checkout of `main` and has not been merged here.

## Decided already (the Product Owner, 2026-11-25)

Decisions 1 to 8 and Q1 to Q8 of `docs/WINDOW_HOURS_PLAN.md` section 2. Apply them; if the
spec or the code proves one wrong, stop and tell me before going on. The proposals of section
3 that this pair builds are accepted with the plan:

1. **F2, the rule is written once:** `lastsWholeHours(start, end)` in `shared/`, true when the
   two local times have the same minutes (`24:00` counting as minute `00`) and `end` is after
   `start`; a refinement on `end` of the three window bodies, message "end must be a whole
   number of hours after start". The assistant's tools and the page use it in steps w3 and w4.
2. **F3, the last start is 23:00:** no code of its own; `lastsWholeHours` refuses 23:05 with
   any end. Say it in the spec (6.2).
3. **F1 and F5, a User's start:** `checkBookingTimes` holds a User's start to the 5-minute step
   (as the Administrator's), and `end` absent or one hour later as today; `checkBooking` adds,
   for a User only, that `start` is the start of one of `slotsOf` of the window it found, else
   `outside_availability` with the message it already has. `isWholeLocalHour` goes.

## Step w1 — the rules in the documents

1. **`docs/SHARED_CALENDAR_SPEC.md` v20:** everything listed in `docs/WINDOW_HOURS_PLAN.md`
   section 4.
   - **Decision D33** after D32: decisions 1 to 4 and 7, Q1, Q2 and Q3, why, nothing migrated
     by code, the slot keeps its 60 real minutes. D32's sentence "no slot starts at 09:05"
     now contradicts D33: restate it to point at D33, not as history.
   - The glossary; R-TIME-02's row of the local time, **which still says `00, 15, 30, 45`**
     (missed by D32: correct it to the 5-minute step); R-TIME-03's example; 6.2 (whole hours,
     no start after 23:00), 6.6's two examples; R-SLOT-01 restated with its new examples, the
     two nights of decision 4; R-BOOK-02, R-BOOK-06, the order of the checks in 8.2 and 8.4;
     11.4; 11.7 if an example holds a window not whole hours; 12; 16.8's rows of the window
     forms, "not built yet".
   - Section 18: 18.1; **AC-13** (alice's 09:30 is no longer "not a whole hour": it is on the
     step and not a slot, so `409 outside_availability`; the plan's F5 missed it); AC-45
     rewritten (08:05–12:05, slots 08:05 to 11:05); AC-48 (alice's 10:10,
     `outside_availability`); **AC-49 to AC-52** after the last: a window not whole hours
     refused for a pattern, an override and a one-off window, nothing stored; joined windows
     09:05–10:05 and 10:05–12:05 giving 09:05, 10:05, 11:05; a User books 09:05; the two
     nights of decision 4 (unit tests only: the local stack cannot move its clock). 18.4 is
     step w5's: leave it.
   - The change log, and the status line: v20 specified; the server's part built in this
     pair, the page's and the assistant's not yet.
   - Search the whole document for "whole hour", "hh:00", "on the hour", "09:00, 10:00",
     "08:30", "08:05", "10:30" and "R-SLOT-01": the list of section 4 is from planning and
     may miss a line. A "whole hours" about something else (the notice settings) stays.
2. **`docs/ARCHITECTURE.md`:** a v17 row, open, and the status line; section 4, the rows of
   the window bodies and the paragraph on booking. **Do not number the row for good:** the mail
   work adds its own on `main`; say in the report that the merge may change it.
3. **`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
   `docs/CONVERSATIONAL_ARCHITECTURE.md`:** one sentence at the end of the status line each,
   that windows of whole hours reach the page in step w4 (the two front-end documents) or the
   assistant in step w3 of `docs/WINDOW_HOURS_PLAN.md`. Nothing else in them now.
4. `npm run lint` green. No diagram should need a change; if one does, render it on a dark
   page (`.claude/rules/diagrams.md`).

No stop here: go on to step w2.

## Step w2 — the rule in `shared/` and in the back end

1. **`shared/src/calendar/rules.ts`:** `lastsWholeHours`; `slotsOf` counted from the window's
   start, one slot every 60 real minutes while one fits (F1); `isWholeLocalHour` removed, and
   its export. Comments in plain words with their references (`docs/SHARED_CALENDAR_SPEC.md`
   R-SLOT-01, decision D33).
2. **`shared/src/calendar/schemas.ts`:** the refinement of `WindowBody`, `PatternBody` and
   `OneOffWindowBody` on `end`, after the order check, so that a malformed time or an end not
   after the start is still said once by itself; the comment above the request bodies.
   Mind an import cycle between `schemas.ts` and `rules.ts`: if there is one, put the function
   where both can read it, and say where in the report.
3. **`backend/src/lib/calendarRules.ts`:** `checkBookingTimes` and `checkBooking` as decided
   above; their comments. No handler changes: check that none names the whole hour.
4. **Tests**, 100 % line coverage kept on `shared/src` and `backend/src/lib`; only the cases
   the rule adds or moves (the plan's "How a step is checked"):
   - `shared/tests/calendar/`: `slotsOf` on 09:05–11:05, on joined 09:05–10:05 and
     10:05–12:05, on 01:05–04:05 the night the clocks go forward (01:05, 03:05) and the night
     they go back (four, two at local 02:05), on a leftover 08:30–12:00 (08:30, 09:30, 10:30);
     the existing cases of 08:05–12:00 and 10:10–10:50 rewritten or removed, not kept as a
     second copy. `lastsWholeHours` and the three schemas on 09:05–11:05, 09:05–10:30,
     23:00–24:00, 23:05–24:00, 08:00–24:00, and the message on `end`. The tests of
     `isWholeLocalHour` go; those of `isOnTimeStep` stay.
   - `backend/tests/unit/lib/`: a User on 09:05 in a window 09:05–11:05 (booked), 09:00 and
     09:10 in it (`outside_availability`), 09:07 (`invalid_request`, the step), a User's change
     to 09:05; AC-13 and AC-48 as restated. The handlers' tests whose windows are not whole
     hours move to whole hours (F9); `bookAppointment.test.ts` and `changeAppointment.test.ts`
     of the handlers expect the new answers.
   - **Not here:** the assistant's tests are step w3's. If one fails, change in it only the
     example (a window's times, an expected code), so that the gate is green, and report
     which; what the tools tell Claude does not change. `bookAppointment.test.ts` and
     `appointmentChanges.test.ts` of the assistant, which ask for 10:10 and 09:10 and expect
     `no_free_slot`, should pass as they are.
   - **Nothing under `frontend/` changes in this pair.** If a front-end unit test fails on the
     shared schema's new refusal, stop and tell me.
5. **The journeys** in `backend/tests/integration/calendar.test.ts`:
   - "times on 5-minute steps (AC-45 to AC-48)" becomes "times on 5-minute steps and windows
     of whole hours (AC-45 to AC-52)", on its own Saturday and `step-alice` as now: the pattern
     08:05–12:05 and its four slots, the one-off window moved to whole hours, a window not whole
     hours refused for each of the three kinds with nothing stored, joined windows, `step-alice`
     booking 09:05 (or the first slot the block offers) and refused 09:10 with
     `outside_availability`.
   - In the other blocks, only what the rule moves: AC-13 in "booking (route 17)"; the window
     11:30–14:00 in "weekly patterns (routes 7–10)" (an overlap expected, which would now be a
     400 first) and 11:00–12:30 in "date overrides and one-off windows (routes 11–14)", each to
     whole hours that keep the test's point.
   - The pages, written and checked with the project skill `explain-journey`:
     `docs/journeys/backend/calendar-time-step.md`, `calendar-booking.md`, and the pages of the
     two other blocks if they name the moved windows; `docs/journeys/README.md` if a title
     changes.
6. **Documents**, in the same change:
   - `docs/SHARED_CALENDAR_SPEC.md`: section 12 (`lastsWholeHours`, `isWholeLocalHour` gone);
     "not built yet" taken away from the server's parts.
   - `docs/ARCHITECTURE.md`: this pair's sentence in the open row.
   - `shared/CLAUDE.md` and `backend/CLAUDE.md` only if a name they hold changed; follow
     "Changing these files" of `CLAUDE.md`.
   - `docs/WINDOW_HOURS_PLAN.md`: an "As done" note under step w1 and one under step w2, the
     second ending with what steps w3 and w4 find ready; F5 and F9 corrected where this pair
     found more than they list (AC-13, the handlers' booking tests); the version line.

**Known gap, accepted:** until step w4 the page can still send a window not whole hours and gets
the server's `invalid_request` in its own words; until step w3 the assistant is not told the
rule, and its tools would propose such a window that the confirmation then refuses. Nothing is
deployed in between. Say it in the "As done" note.

Not in this pair: any file under `frontend/`; `backend/src/assistant` (the instructions,
`hoursInput`); `backend/tests/eval`; `backend/scripts/smoke.sh`; `backend/template.yaml`;
`README.md`, `docs/RUNBOOK.md`, `docs/FRONTEND_WALK.md`, `docs/COMMANDS.md`; the body of
`docs/FRONTEND_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md` and
`docs/CONVERSATIONAL_ARCHITECTURE.md` beyond their one sentence; the records of finished work
(`docs/SLOT_STEP_PLAN.md`, the old briefs); any `aws` command; the cloud.

## How we work in this pair

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing on a rule; any change the pair seems to
  need in a file listed under "Not in this pair"; a front-end test failing; and the restart of
  `local:api` below.
- **Before the journeys:** run `npm run build -w backend` (never a raw `sam build`), then ask
  me to restart `local:api`, and wait for my word. Do not stop or start it yourself.
- **Only the changed journeys, run alone:**
  `DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend --
  tests/integration/calendar.test.ts -t '<describe>'`, one per changed block. If a block
  needs what an earlier block of the file left (the AC fixtures of "booking (route 17)" do),
  run `tests/integration/calendar.test.ts` whole instead, and say so. Never the assistant's or
  the other journeys' files, never the root `verify`.
- The back end's calendar journeys empty the local `calendar` table. Do not run the back end's
  and the front end's integration tests at the same time.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or
  why, each reference with the document's path in the same sentence, no step or brief
  numbers, no "formerly on the hour".
- Commit only when asked. Do not push. Do not start step w3.

## Acceptance (`docs/WINDOW_HOURS_PLAN.md` steps w1 and w2)

- The spec states windows of whole hours and slots from the window's start, with D33, AC-13
  and AC-45 to AC-52; the architecture has its open row; the three other documents have their
  sentence.
- `shared/` and the back end refuse a window not whole hours with `400 invalid_request`, count
  the slots from the effective window's start, refuse a User's start that is not a slot with
  `409 outside_availability`; the rule is written once; `isWholeLocalHour` is gone.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept.
- The changed journeys green against the local stack restarted on the new build, with their
  pages.
- `git status` shows changes under `shared/`, `backend/src/lib`, `backend/tests`, `docs/` and
  this brief only, plus `shared/CLAUDE.md` or `backend/CLAUDE.md` if a name changed.
- The "As done" notes hold the detail, the known gap included. Then the short closing
  message, and suggest the commit.
