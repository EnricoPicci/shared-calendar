# Shared Calendar: windows of whole hours, slots counted from the window's start (implementation plan)

**Version:** v5 (2026-11-25): step w4 done (its "As done" note), with brief
`prompts/slot-s09-step-w4-implementation.md`; two decisions of the Product Owner added beside
decision 6 (section 2, 6a and 6b). v4 (2026-11-25): step w3 done (its "As done" note), with brief
`prompts/slot-s08-step-w3-implementation.md`; two decisions of the Product Owner added beside Q1
and Q4 (section 2). v3 (2026-11-25): steps w1 and w2 done (their "As done" notes), with brief
`prompts/slot-s07-pair-w1-w2-implementation.md`; decision 5 restated (the server's 400 names the
field), F5 and F9 corrected. v2 (2026-11-25): the proposals of F6, F7 and F10 decided by the
Product Owner, Q5 to Q8 (section 2). v1 (2026-11-25): the plan, after the Product Owner's eight
decisions of the brief and the answers to four questions of planning (section 2).
**Brief:** `prompts/slot-s06-plan-window-whole-hours.md`.
**Governed by:** `docs/SHARED_CALENDAR_SPEC.md`, `docs/ARCHITECTURE.md`,
`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
`docs/CONVERSATIONAL_ARCHITECTURE.md`. On any conflict those documents win, and this plan is
fixed. Step w1 writes the decisions below into them.
**Branch:** `slot-5min`, in its own worktree, released alone before the mail work (section 6).

---

## 1. What is asked, and the shape of the answer

Today a User books only a whole local hour, `hh:00` to `hh+1:00`, inside one effective window
(`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01, decision D32). Since `v2.4.0` a window may start on
any 5-minute step, so a window 09:05–10:05 gives a User nothing to book (`docs/RUNBOOK.md`
section 5.9).

**The change.** A window lasts a whole number of hours from any 5-minute start (09:05–11:05
yes, 09:05–10:30 no), and a User's slots are the hours counted from the start of the effective
window: 09:05–11:05 gives 09:05 and 10:05.

The rest follows:

- **The data:** nothing is migrated by code. A read-only check lists the windows stored in the
  cloud that are not whole hours; the operator deletes them in the page before the release
  (decision 7, Q3).
- **The API:** no new route, field or error code. A window that is not whole hours is
  `400 invalid_request`, with a sentence of its own. A User's start that is not a slot is
  `409 outside_availability` (Q2), checked under the lock instead of before it.
- **The front end:** in the window forms the end is chosen as an hour only, its minute that of
  the start; the week and the book dialog show what the server answers, as today.
- **The assistant:** its instructions and the descriptions of the opening hours say "whole
  hours"; a window not whole hours is explained and the nearest whole hours suggested (Q4); a
  block is widened to whole hours (Q1). The instructions change, so the conversations in
  progress end at the deploy, and the paid evaluation is run once, in the release.
- **The release:** the API, then the page, as the next minor version, `v2.5.0` (F12).

## 2. Decided before the first step

**The brief's decisions** (the Product Owner, 2026-11-25), numbered as in
`prompts/slot-s06-plan-window-whole-hours.md`:

| # | Decision |
|---|---|
| 1 | A window lasts a whole number of hours, from any 5-minute start; for the windows of a pattern, of a date override and a one-off window. |
| 2 | A User's slots are the whole hours counted from the window's start, 60 real minutes each, inside one effective window of one type. |
| 3 | Windows of the same type that touch are joined, as today (`docs/SHARED_CALENDAR_SPEC.md` section 6.6); the slots are counted from the start of the joined window. |
| 4 | The nights the clocks change: the window is checked as whole hours on the local clock; its slots are 60 real minutes each from its start, as many as fit. |
| 5 | A window not whole hours is refused by the page's form before it is sent, and by the server with `400 invalid_request`. The sentence ("end must be a whole number of hours after start") is the shared schema's, read by the page and the assistant's tools; the server's answer names the field only, "Invalid input: end", as for every refusal of a schema (the Product Owner, 2026-11-25, at step w2: `backend/src/lib/validation.ts` never sends a schema's message). |
| 6 | In the window forms the end is chosen as an hour only; its minute follows the start's. A start chosen still sets the end one hour later. |
| 6a | A change of the start's minute alone keeps the end's hour, with the new minute, so the length chosen stays (08:05–11:05, the start changed to 08:30: 08:30–11:30); when that hour is no longer offered, the end is one hour after the start (the Product Owner, 2026-11-25, step w4). |
| 6b | A window stored that is not whole hours, opened in a form, is shown as stored (08:30–09:45, its end's minute 45 shown), and a save is refused with "End must be a whole number of hours after Start.": the Administrator sees the real end and fixes it; the end is never corrected without a word. The check of step w5 should leave none (the Product Owner, 2026-11-25, step w4). |
| 7 | Windows already stored that are not whole hours are not changed by code: a read-only check lists them in the cloud before the release. |
| 8 | Built on `slot-5min`, released alone before the mail work, as the next minor version. |

**The four questions of planning** (the Product Owner, 2026-11-25):

| # | Question | Decision |
|---|---|---|
| Q1 | A block of 10:10–10:35 inside 09:00–13:00 leaves 09:00–10:10 and 10:35–13:00, which decision 1 refuses. What does a block do? | **Widened to whole hours.** Each piece left keeps its window's own start or end, and the block grows until every piece is whole hours: 10:10–10:35 becomes 10:00–11:00, leaving 09:00–10:00 and 11:00–13:00. The assistant says which times it will use and asks before proposing. |
| Q2 | A User's start on the 5-minute step that is not a slot: which answer? | **`409 outside_availability`**, under the lock, the code the page and the assistant already explain. Before the lock a User's start must only be on the 5-minute step (`400 invalid_request` otherwise), as the Administrator's is; `end` absent or one hour later, as today. |
| Q3 | Windows stored that are not whole hours: when are they dealt with? | **Deleted before the deploy.** The operator deletes each window the check lists, in the page of `v2.4.0`, and runs the check again: it must list none before the API is deployed. |
| Q4 | The assistant asked for a window not whole hours. | **Explain, suggest, ask.** It says that a window lasts whole hours and suggests the nearest whole hours that fit inside the times asked and those that cover them (09:05–12:00 → 09:05–11:05 or 09:05–12:05); it proposes only after the person has chosen. |
| Q5 | Weekly patterns already ended that are not whole hours: deleted too? | **Deleted too.** The check lists every pattern whatever its validity; past weeks then no longer show those hours, and past appointments keep their own times (F7). |
| Q6 | Should the check also list windows of whole hours that do not start on the hour, whose slots move at the release? | **No.** It lists only the windows that must go; the slots that move are accepted (F6). |
| Q7 | The check: commands in the runbook or a script? | **Commands in `docs/RUNBOOK.md`**, read-only, run once; no script kept for a one-time job (F7). |
| Q1a | A block that already leaves whole hours (10:00–11:00 inside 09:00–13:00): does the assistant ask too? | **No.** It says the times and asks only when the block had to grow; a block that leaves whole hours is proposed at once, as before (the Product Owner, 2026-11-25, step w3). |
| Q4a | The assistant asked for a window that starts after 23:00 (23:05–24:00), which no whole hours fit. | **Say so and suggest.** A window ends on its own date, so none starts after 23:00: the assistant suggests the start moved to 23:00 (23:00–24:00), or the hour before with the same minutes (22:05–23:05). One sentence of the instructions, no request of the evaluation (the Product Owner, 2026-11-25, step w3). |
| Q8 | Should the smoke test prove the new rule in the cloud? | **Yes**, the small change of F10: its window 03:05–04:05, the slot 03:05, a window 03:05–03:50 refused; 53 lines. |

## 3. What planning found

- **F1. Where the slot on the hour is known in the code.** Two places decide, and no other:
  - `shared/src/calendar/rules.ts`, `slotsOf`: it walks to the next whole local hour and takes
    a slot only where the local minute is `00`. It becomes: from the window's start, one slot
    every 60 real minutes while one fits. That one rule gives decisions 2, 3 and 4 at once:
    the window is already joined by `effectiveWindows`, and real minutes on the nights the
    clocks change give the counts of decision 4 (01:05–04:05 is two real hours the night they
    go forward, slots at 01:05 and 03:05; four the night they go back, two of them at local
    02:05). `isWholeLocalHour` then has no user and goes.
  - `backend/src/lib/calendarRules.ts`, `checkBookingTimes`: a User's start must be a whole
    hour, before the lock ("start must be a whole hour"). It becomes the step's check, the
    Administrator's; and `checkBooking`, under the lock, adds for a User that the start is one
    of `slotsOf` of the window it found (`outside_availability`, Q2). `checkChange` reaches it
    through `checkBooking`, so a User's change follows with no code of its own.
  - Read, and needing nothing: `calendarView` (it calls `slotsOf`), `peopleIn`, `busyOf`,
    `effectiveWindows`, `checkConflicts`; the assistant's `freeSlotAt` (it looks the start up
    among the view's slots); the week's drawing (`frontend/src/logic/week.model.ts` draws the
    slots it is given, at any minute); the book dialog's hours (`windowHours` of
    `frontend/src/logic/times.ts`, built on the window's minutes).
- **F2. Where the free end of a window is allowed.** The three body schemas of
  `shared/src/calendar/schemas.ts` (`WindowBody`, `PatternBody`, `OneOffWindowBody`), which
  every handler of the availability parses; the assistant's own input of the opening hours
  (`hoursInput` with `endsAfterStart` in `backend/src/assistant/tools/facts.ts`, used by
  `create_pattern`, `update_pattern`, `set_date_override`, `create_one_off_window`); the page's
  two models (`patternFor` in `availability.model.ts`, `fieldRefusals` in `date.model.ts`) and
  its lists (`WINDOW_HOURS` in `times.ts`). **Proposed:** one pure function of `shared/`,
  `lastsWholeHours(start, end)`, true when the two local times have the same minutes (with
  `24:00` as minute `00`) and `end` is after `start`; a refinement on `end` of the three
  schemas, with the message "end must be a whole number of hours after start"; the same
  function in the tools' refinement and the page's two models. The rule is written once, as
  the step was (`docs/SLOT_STEP_PLAN.md` F1). It cannot be part of a pattern given to Claude:
  the descriptions say it in words (F8).
- **F3. The last start of a window is 23:00.** A window ends on its own date, at `24:00` at the
  latest, so a start after 23:00 has no end of whole hours: 23:05 would end at 00:05 the next
  day. The schemas refuse it through `lastsWholeHours` (no end is possible); the page's lists
  offer, for the start's hour 23, only the minute 00, as the hour 24 of an end holds only 00
  today. Follows from decision 1; nothing to decide.
- **F4. The end's lists (decision 6).** The end's minute list holds one value, the start's
  minute, so it shows it and cannot be changed; the end's hours are those after the start's,
  up to 23, and 24 only when the start's minute is 00. A start chosen sets the end one hour
  later (`endFor`, unchanged), and a change of the start's minute refills the end's minute.
  The book dialog's lists (the Administrator's custom times) do not change.
- **F5. A User's start moves under the lock (Q2).** Before the lock a User's start is checked
  on the 5-minute step only. Two scenarios change their answer: `docs/SHARED_CALENDAR_SPEC.md`
  AC-48's "alice books 10:10" was `400 invalid_request` and is `409 outside_availability`;
  the front end's journey "starts off the whole hour" (08:15, `invalid_request`) keeps its
  `invalid_request` on a time off the step (08:17) and gains the case 08:15,
  `outside_availability`. Found at step w2: AC-13 changes too (alice's 09:30 is
  `outside_availability`), and so do the handlers' unit tests of booking and change that sent a
  User's 09:30 expecting `invalid_request`. A start inside a window but not a slot, and a start outside every
  window, get the same code: the page and the assistant need no new sentence.
- **F6. A User's appointment on the hour in a window changed later.** An appointment is never
  re-checked against slots, only against windows (`docs/SHARED_CALENDAR_SPEC.md` R-AV-03). If
  the operator changes 08:30–12:00, with alice at 09:00–10:00, to 08:30–11:30, it is accepted:
  the appointment still lies inside a window of its type. Afterwards the week draws it as
  today; the slots 08:30 and 09:30 each overlap it, so it takes one place in each
  (R-SLOT-02): with a capacity of 1 both are full for the Users, `busy` for the others, and
  the Administrator may book over them (R-BOOK-13). alice may cancel it and change it to any
  slot, as today; nothing refuses it for not starting on a slot. Nothing is broken; places are
  lost. The same holds for a window of whole hours that does not start on the hour, such as
  08:30–10:30, whose slots move at the release from 09:00 to 08:30 and 09:30: accepted, not
  listed (Q6). The record in `docs/RUNBOOK.md` tells the operator, when a window must
  be changed rather than deleted, to choose whole hours that keep the old appointments on
  slot starts (09:00–12:00 rather than 08:30–11:30).
- **F7. The windows stored that are not whole hours (decision 7, Q3).** Only the cloud holds
  them; the local stack is rebuilt by the seeds. Where they can be met:
  - *Patterns*, whatever their validity: the change dialog of any pattern can open one, so the
    check lists the ended ones too, and the operator deletes them as well. A pattern ended in
    the past then no longer draws its windows in the past weeks; the appointments there keep
    their own times (assumption A3 of `docs/SHARED_CALENDAR_SPEC.md` section 22).
  - *Overrides and one-off windows dated today or later.* Those dated in the past cannot be set
    or deleted (`409 date_in_past`) and are no form's to open; they stay, and the new code
    meets them only in a past week, where `slotsOf` counts as many slots as fit and none is
    offered (`start > now`).
  - *A delete refused* (`409 availability_conflict`, an appointment inside): the operator then
    changes the window to whole hours that hold the appointment, in the same page (F6), or
    moves the appointment first.
  - **The check** reads the `calendar` table of the stack with three `aws dynamodb query`
    calls, all reads (`PK = PATTERN`; `PK = OVERRIDE` with `SK ≥ today`; `PK = WINDOW` with
    `SK ≥ today`), and filters them with a few lines of `node` that print one line per window
    whose two minutes differ (`24:00` as `00`): the kind, the id or the date, the weekday for a
    pattern, the times, the type's id; "none" when there is none. Windows of whole hours that
    do not start on the hour are not listed (Q6). Reading the table rather than the API needs no token and sees every
    pattern whatever its validity. It is not a script of the repository: it is used once, so
    it is written in `docs/RUNBOOK.md` section 5.10 with the record of the release, run on the
    Product Owner's word (root `CLAUDE.md`, "Cloud safety", forbids only commands that change
    resources, but the cloud is touched only when asked).
- **F8. The assistant.** Its tools are the opening hours' four and they send through the
  routes' handlers, which refuse; but a refusal at the confirmation is late. The tools'
  refinement refuses at the proposal, with the sentence, so Claude reads it before the person
  sees anything. What changes:
  - `prompt.ts`: in the paragraph on blocking time, "Hours are on 5-minute steps" gains that a
    window lasts whole hours, and the rule of Q1 for a block: each piece left keeps its
    window's start or end, the block is widened until every piece is whole hours, the person
    is told the times and asked before the proposal. A sentence for the opening hours (Q4):
    a request not whole hours is explained, the nearest whole hours inside and around it
    suggested, the proposal made after the person chooses.
  - `facts.ts`, `hoursInput`: the description of `end` says "a whole number of hours after
    start: the same minutes as start, or 24:00 when start is on the hour"; its refinement
    uses `lastsWholeHours`.
  - `book_appointment` and `change_appointment` are unchanged in words: `time` is a slot's
    start found in `get_calendar`, at any minute already.
  - **The mark of the instructions changes: every conversation in progress ends at the
    deploy**, as in every plan that touched them.
  - The evaluation (`backend/tests/eval/requests.ts`): two requests rewritten, two added.
    `step-pattern-new` (English, a Sunday 14:05–16:35) becomes 14:05–17:05; `step-block`
    (Italian, 10:10–10:35 out of 09:00–13:00) gains a second message that accepts the widened
    block and checks 09:00–10:00 and 11:00–13:00 with the afternoon kept. New:
    `hours-not-whole` (English, "Open eval Visit every Tuesday from 09:05 to 12:00") and
    `hours-not-whole-it` (Italian, an extra window 10:10–11:40), each `ends: 'answer'`,
    `noProposal()`, read by hand for the suggestion. **61 requests.** The last run cost 46.59
    US cents for 59; this one about 50, said again before it is run.
- **F9. The tests the rule moves.** Found by a search of the repository for windows whose two
  minutes differ, and by the tests that will fail; the list is the start, not the end:
  - `shared/tests/calendar/rules.test.ts` (08:00–10:30 with 10:30–12:00, the example of section
    6.6; `slotsOf` on 08:05–12:00, 10:10–10:50, 01:05–03:55) and `schemas.test.ts`.
  - `backend/tests/unit/handlers/createPattern.test.ts`, `createOneOffWindow.test.ts`,
    `backend/tests/unit/lib/calendarRules.test.ts` (the User's whole hour, AC-48),
    `backend/tests/unit/assistant/tools/availabilityTools.test.ts` (09:05–11:55, 19:05–20:10),
    `backend/tests/unit/assistant/proposals.test.ts` (14:00–14:30).
  - `backend/tests/integration/calendar.test.ts`: the journey "times on 5-minute steps (AC-45
    to AC-48)" (its pattern 08:05–12:00, its one-off 13:05–14:10), and two windows of other
    journeys, 11:30–14:00 (an overlap expected, which would now be a 400 first) and
    11:00–12:30.
  - `frontend/tests/unit/logic/availability.model.test.ts`, `date.view.test.ts`,
    `availability.parts.test.ts`, which send windows; `frontend/tests/integration/calendar.test.ts`,
    the User's 08:15 (F5).
  - Left as they are: front-end fixtures of a calendar view that hold a window not whole hours
    (`booking.test.ts`, the week's): such a window can still come back from the server, in a
    past week (F7), so they stay true. Changed only if a test fails.
  - The seeds: `frontend/scripts/seed-local.mjs` and `backend/scripts/local-seed.sh` hold
    whole-hour windows only (09:00–13:00, 15:00–18:00, 10:00–12:00). Nothing to change.
  - Found at step w2: `backend/tests/unit/handlers/setOverride.test.ts` and `updatePattern.test.ts`
    (windows 14:30–16:00, 11:00–12:30, 09:30–12:00, ten of 30 minutes, an end 13:30),
    `bookAppointment.test.ts` and `changeAppointment.test.ts` (a User's 09:30),
    `backend/tests/unit/lib/calendarView.test.ts` (08:00–08:30 beside 08:30–10:00); AC-09 of
    `docs/SHARED_CALENDAR_SPEC.md` and its journey (11:00–12:30). The two tests of the assistant
    named above did not fail: their windows reach no shared schema until step w3. Four front-end
    unit tests failed on the shared schema and were changed in their examples only, on the
    Product Owner's word: `times.test.ts` and `availability.model.test.ts` (every pair of the lists,
    and a pattern 23:45–24:00), `shell.test.ts` (a pattern's end 09:30); step w4 rewrites them.
- **F10. The smoke test.** `backend/scripts/smoke.sh`, calendar journey: its one-off window
  03:00–04:00 and the User's slot 03:00 become 03:05–04:05 and 03:05 (the date search looks
  for that span free), which proves a slot counted from a 5-minute start in the cloud; the
  Administrator's 03:10–03:35 and the refused 03:07 stay. One line more: a one-off window
  03:05–03:50 refused `400 invalid_request`, nothing written. **53 lines.** The capacity
  journey (03:00–04:00) does not change.
- **F11. The walk.** Checks made wrong, by number (`docs/FRONTEND_WALK.md`): 87 (12:00 to
  14:30 cannot be entered: becomes 12:00 to 14:00, which still overlaps); in section 11, 158
  (an end of 12:00 after 08:05), 159 (23:30), 160 to 168 and 170 (the pattern 08:05–12:00, its
  slots from 09:00, the times booked from them). They are rewritten, the numbers kept, on a
  Sunday pattern 08:05–12:05 whose slots are 08:05, 09:05, 10:05 and 11:05; 168 gains alice
  booking the one slot left free. 157 says that the end's minute is shown and is not a choice.
  **No check is added**: the walk keeps 170 checks.
- **F12. A minor version, and the way back.** No route, field or code changes. Bodies valid
  today are refused (windows not whole hours), but no client of ours sends one after the page
  is deployed, and the API goes first, as always: the page of `v2.4.0` against the new API is
  refused such a window in plain words. Tag `v2.5.0`. A roll-back to `v2.4.0` is possible at
  any time: it reads every window the new code stores, and its slots on the hour simply come
  back; the windows deleted before the release do not.

## 4. The rules as they will read

For step w1 to write into `docs/SHARED_CALENDAR_SPEC.md` (v20, a decision after D32):

- **D33 — Windows of whole hours.** Decisions 1 to 4 and 7, Q1, Q2 and Q3: why (a User's hour
  from any 5-minute start, found at the release of D32), that nothing is migrated by code,
  and that the slot keeps its 60 real minutes.
- **The glossary**, "Slot" and "Window".
- **R-TIME-02** (the row of the local time, which still says `00, 15, 30, 45`, left from D32)
  and **R-TIME-03**'s example, with a window from a 5-minute start.
- **6.2** (and through it 6.3 and 6.4): `end` is `start` plus a whole number of hours on the
  local clock; a window cannot start after 23:00.
- **6.6**: its example 08:00–10:30 with 10:30–12:00 becomes 08:00–10:00 with 10:00–12:00, and
  a second one, 09:05–10:05 with 10:05–12:05, giving 09:05, 10:05 and 11:05.
- **R-SLOT-01**: a slot starts at the start of the effective window or a whole number of real
  hours after it; the examples 08:30–12:00, 08:00–08:45, 08:05–12:00 and 10:10–10:50 become
  windows that cannot be saved, replaced by 08:05–11:05 (08:05, 09:05, 10:05) and the two
  nights of decision 4. R-SLOT-05's example stays (10:00–10:30 in the slot 10:00–11:00).
- **R-BOOK-02**, the User's column: `start` on the 5-minute step, the start of a slot
  (R-BOOK-06); **R-BOOK-06**: for a User, also the start of a slot of that window, else
  `outside_availability`; the order of the checks in **8.2** and **8.4**.
- **11.4**: the comment of the three window bodies; **11.6**: its example keeps its values (its
  windows are whole hours on the hour). **11.7** where an example has a window not whole hours.
- **12**: `lastsWholeHours`; `isWholeLocalHour` gone.
- **16.8**: the rows of the window forms (the end as an hour, its minute the start's).
- **18.1** the unit tests; **18.3**: AC-45 rewritten (08:05–12:05, slots 08:05 to 11:05), AC-48
  (alice's 10:10 answers `outside_availability`), and AC-49 to AC-52: a window not whole hours
  refused for a pattern, an override and a one-off window; joined windows; a User books
  09:05; the two nights; **18.4** the smoke test's 53 lines.

For `docs/ARCHITECTURE.md`: a v17 row, open; section 4, the rows of the window bodies and the
paragraph on booking. For `docs/FRONTEND_ARCHITECTURE.md`: a decision after 200 for the end's
lists (F3, F4), section 4 and the row of `times.ts` in 5.1. For
`docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 7.3, 8.2 and 12.3, a version row.

## 5. Steps

Five steps, four stops. **Steps w1 and w2 are a pair**: one brief, one check, one stop. Steps
w3 and w4 stand alone: w3 changes the assistant's instructions, w4 the page. Step w5 is the
release. After each stop an honest report, then the review; commit only when asked. Each step
merges what it built into the governing documents in the same change, keeps 100 % line
coverage, and changes the page under `docs/journeys/` of a journey it changes (the project
skill `explain-journey`). Each step has its brief, `prompts/slot-s07-…` onwards.

**How a step is checked** (the Product Owner's decision): `npm run typecheck`, `npm run lint`,
`npm run test:unit`, and only the journeys the step adds or changes, run alone
(`DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend --
tests/integration/calendar.test.ts -t '<describe>'`; if a block needs what an earlier block of
its file left, that one file is run, never the whole suite). No root `verify`, no full walk.
A step that changes a screen looks only at what it changes, at one width, with the handful of
checks it names. New tests cover the new rule and the cases it moves (F9), not a second copy
of what is tested. The local stack is started from this worktree (`docs/SLOT_STEP_PLAN.md`
step s3, "one local stack, two checkouts"), after the Product Owner's go-ahead.

### Step w1 — The rules in the documents (documents only; a pair with w2)

- `docs/SHARED_CALENDAR_SPEC.md` v20: section 4 above, the change log, the status line saying
  D33 is specified and not built.
- `docs/ARCHITECTURE.md`: the v17 row, open; section 4 as above.
- `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
  `docs/CONVERSATIONAL_ARCHITECTURE.md`: one sentence each in the status line, "changed in
  step w3 / w4 of `docs/WINDOW_HOURS_PLAN.md`".

**Check:** `npm run lint`. No stop: step w2 follows.

### Step w2 — The rule in `shared/` and in the back end (a pair with w1)

- `shared/src/calendar/rules.ts`: `lastsWholeHours`; `slotsOf` counted from the window's start
  (F1); `isWholeLocalHour` removed. `schemas.ts`: the refinement of the three window bodies
  (F2, F3).
- `backend/src/lib/calendarRules.ts`: `checkBookingTimes`, a User's start on the step;
  `checkBooking`, a User's start one of the window's slots, `outside_availability` (F5, Q2).
  The handlers of patterns, overrides and one-off windows need nothing: the schemas refuse.
- Tests (F9): `slotsOf` on 09:05–11:05, joined 09:05–10:05 with 10:05–12:05, 01:05–04:05 on
  the two nights, a leftover window 08:30–12:00 (08:30, 09:30, 10:30); `lastsWholeHours` and
  the three schemas on 09:05–11:05, 09:05–10:30, 23:00–24:00, 23:05–24:00, 08:00–24:00;
  `checkBooking` for a User on 09:05 (booked), 09:00 in that window and 09:10
  (`outside_availability`), 09:07 (`invalid_request`), a change to 09:05; the handlers'
  examples moved to whole hours. Two tests of the assistant change only their example windows
  (`availabilityTools.test.ts`, `proposals.test.ts`); nothing under `backend/src/assistant`.
- `backend/tests/integration/calendar.test.ts`: the journey "times on 5-minute steps" becomes
  "times on 5-minute steps and windows of whole hours (AC-45 to AC-52)", with its page
  `docs/journeys/backend/calendar-time-step.md`; the two windows of other journeys (F9) moved
  to whole hours, and their pages if they name them. `shared/CLAUDE.md` and
  `backend/CLAUDE.md` where they name the grids.

Between w2 and w4 the page can still send a window not whole hours and gets the server's
`invalid_request` in its own words. Nothing is deployed in between.

**As done (step w1, 2026-11-25).** `docs/SHARED_CALENDAR_SPEC.md` v20: decision D33 after D32,
whose sentence on the slot now points at it; the glossary ("Window", "Slot"), D2, D8 and the table
of section 4; R-TIME-02's local time corrected to the 5-minute step (left from D32) and R-TIME-03's
example (01:05–04:05); 6.2 (whole hours, no start after 23:00); R-AV-01's example of the night the
clocks go forward made whole hours (02:00–03:00); 6.6 with both examples; R-SLOT-01 restated, with
08:05–11:05, a leftover 08:30–12:00 and the two nights; R-BOOK-02, R-BOOK-06 and the orders of 8.2
and 8.4; 11.4 and 11.7; 12; 16.8 ("not built yet"); 18.1; AC-09 (11:00–13:00, found by the search),
AC-13, AC-45, AC-48, AC-49 to AC-52; the change log and the status line. 11.6 needed nothing.
`docs/ARCHITECTURE.md`: the v17 row, open, the status line, the three window bodies and the
paragraph on booking of section 4, and the User's row of the roles' table. **The v17 number is
provisional**: the mail work adds its own row on `main`, and the merge may renumber it. The three
other documents have their sentence. No diagram changed.

**As done (step w2, 2026-11-25).** `shared/src/calendar/rules.ts`: `lastsWholeHours(start, end)`;
`slotsOf(window)` counts one slot every 60 real minutes from the window's start and no longer takes
a zone (its one caller, `calendarView`, changed with it); `isWholeLocalHour` removed;
`isOnTimeStep` keeps its tests. `schemas.ts`: a refinement on `end` of `WindowBody`, `PatternBody`
and `OneOffWindowBody`, after the order check and only when it passed, so an end not after the
start is said once. `schemas.ts` imports `lastsWholeHours` from `rules.ts`; `rules.ts` reaches
`schemas.ts` only through type imports of `types.ts`, so there is no cycle at run time and the
function stays in `rules.ts`. `backend/src/lib/calendarRules.ts`: `checkBookingTimes` holds both
roles' start to the step; `checkBooking` refuses a User's start that is no slot of the window found
with `outside_availability`; `checkChange` follows through it. No handler named the whole hour.
**Decision 5 corrected:** the 400 says "Invalid input: end" (section 2). Tests: the cases of the
rule in `shared/` and `backend/tests/unit/lib/` (`calendarBooking`, `calendarChange`,
`calendarView`), the handlers' tests of F9; four front-end unit tests in their examples only (F9),
nothing under `frontend/src`. The journey "times on 5-minute steps and windows of whole hours
(AC-45 to AC-52)" rewritten: the pattern 08:05–12:05 and its four slots, the refusals of AC-49
with nothing stored, a one-off window 12:05–13:05 joined to the pattern and one 14:05–15:05 apart,
`step-alice` booking 09:05 and refused 09:10 and 10:10; AC-13, AC-09 and the weekly patterns'
overlap (11:00–14:00) moved. The whole `tests/integration/calendar.test.ts` run once on the new
build (the AC fixtures of "booking (route 17)" come from earlier blocks): 97 passed. Pages
`docs/journeys/backend/calendar-time-step.md` and `calendar-booking.md`, the README's title and
the section "Windows and slots" of `docs/journeys/concepts.md`. Checked: typecheck, lint, test:unit
green at the root, 100 % line coverage kept. **The known gap, accepted:** until step w4 the page can
still send a window not whole hours and gets the server's `invalid_request` in its own words;
until step w3 the assistant is not told the rule, and its tools would propose such a window that
the confirmation then refuses. Nothing is deployed in between. **What steps w3 and w4 find ready:**
`lastsWholeHours` exported from `@shared-calendar/shared`; the three schemas refuse on `end` with
the message "end must be a whole number of hours after start"; the server answers a User's start
that is not a slot with `outside_availability`, which the page and the assistant already explain.
Step w4 also finds `frontend/src/services/appointments.service.ts`, whose comment still names a
User's "whole hours", and the front-end page `docs/journeys/frontend/calendar-appointments.md`.

**Check, for the pair, then the stop:** the short check; the changed journeys run alone, after
`npm run build -w backend` and a restart of `local:api`.

### Step w3 — The assistant

- `backend/src/assistant/prompt.ts` and `tools/facts.ts` (F8); their unit tests: the words
  given to Claude, 09:05–11:05 accepted and 09:05–10:30 refused by the four tools with the
  sentence, having only read.
- The fake Claude's answers and the assistant's journeys: none holds a window not whole hours
  (05:00–07:00, 14:00, 04:00, 06:00); none changes, unless a test fails.
- `backend/tests/eval/requests.ts`: the four requests of F8; `checks.ts` only if `step-block`'s
  second message needs it.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 7.3, 8.2, 12.3 (61 requests, no run yet),
  a version row; `docs/COMMANDS.md` (61 requests).
- **No paid run in this step**: it is run once, in step w5, on the code that is deployed.

**Check:** the short check; `npm run assistant:eval -w backend -- --list` (61 requests, costs
nothing). No journey changes, so none is run. Then the stop.

**As done (step w3, 2026-11-25).** `backend/src/assistant/tools/facts.ts`: the description of
`end` in `hoursInput` says in words "a whole number of hours after "start", so with the same
minutes as "start" (09:05 to 11:05), or "24:00" for the midnight that closes the day when
"start" is on the hour"; `lastsWholeHoursOf` with `WHOLE_HOURS` (the shared sentence on `end`,
run only when nothing before it failed) beside `endsAfterStart`, used by the four tools, so a
refusal says one sentence and comes before anything is read. `backend/src/assistant/prompt.ts`:
in "The opening hours", whole hours from any 5-minute start, Q4 and Q4a; in "Blocking time", Q1
with Q1a. The fake Claude's answers and the assistant's journeys hold whole hours only (04:00–05:00,
06:00–07:00, 04:00–06:00, 05:00–07:00, 04:00–07:00): none changed. Unit tests: the new sentences of
the instructions and the description of `end`; each of the four tools accepts 09:05–11:05 and
08:00–24:00 and refuses 09:05–10:30 and 23:05–24:00 at the proposal with the sentence on `end`,
reading nothing; an end not after the start said once. `availabilityTools.test.ts` (09:05–12:05,
19:05–20:05) and `proposals.test.ts` (an extra window 14:00–16:00 of which 14:00–15:00 is kept)
moved to whole hours. The evaluation: `step-pattern-new` 14:05–17:05; `step-block` with a second
message, "Va bene, proceda.", checked with `notBefore` of `checks.ts` (no `set_date_override`
before it), which needed no change; `hours-not-whole` and `hours-not-whole-it` (an extra window on
Sunday of next week, a day with no hours). **61 requests, 67 messages: 33 requests in English, 28
in Italian.** `docs/CONVERSATIONAL_ARCHITECTURE.md` v23 (status line, sections 7.3, 8.2, 12.3),
`docs/COMMANDS.md`, the v17 row of `docs/ARCHITECTURE.md`, the status line of
`docs/SHARED_CALENDAR_SPEC.md`. Checked: typecheck, lint, test:unit green at the root (back end
1 873 tests), 100 % line coverage kept; `--list` shows 61 requests. **The mark of the
instructions changed: every conversation in progress ends at the deploy.** **What steps w4 and w5
find ready:** the assistant complete and not evaluated; step w4 touches nothing of it. Step w5
part D runs the evaluation once on the deployed code, about 50 US cents (the last run, of
`v2.4.0`, cost 46.59 for 59), the cost said again before it is run, and reads the four requests by
hand.

### Step w4 — The page: the end chosen as an hour

- `frontend/src/logic/times.ts`: the start's minutes in hour 23 only 00 (F3); the end's hours
  for a start and its one minute (F4); `endFor` unchanged. `availability.model.ts` and
  `date.model.ts`: the refusal of a window not whole hours, through `lastsWholeHours`, in the
  words of the end's label ("End must be a whole number of hours after Start."), which the
  lists make rare but the shared rule keeps.
- `frontend/src/views/time.parts.ts`, `availability.view.ts`, `date.view.ts`: the end's lists
  follow the start's minute in the four window forms (the pattern's form and dialog, "This day
  only" and "Extra windows"); the book dialog is unchanged.
- Unit tests of the logic and the two views: 08:05 → end 09:05 with one minute; the end's hour
  12 → 12:05, the start kept; the start's minute changed from 05 to 30 → the end follows; hour
  23 → minute 00 only, end 24:00; a pattern's dialog opened on 08:05–12:05 as it is.
- `frontend/tests/integration/calendar.test.ts`: the User's 08:17 and 08:15 (F5), and its page.
- `docs/FRONTEND_ARCHITECTURE.md` (section 4 above); `docs/FRONTEND_WALK.md`: the checks of
  F11 rewritten, a version row; `docs/FRONTEND_SERVICES.md` where it names a User's whole
  hours (section 19, `AppointmentsService`).

**Check:** the short check; the front end's changed journey alone
(`RUN_INTEGRATION=1 npm run test:integration -w frontend -- tests/integration/calendar.test.ts
-t '<describe>'`); **a look at one width** (1280) on the local stack after `seed:local`, five
checks: the new 158 and 159 (the end's lists), 160 (a Sunday pattern 08:05–12:05 saved), 163
(its four slots in the week), the new 168 (alice books 11:05). Then the stop.

**As done (step w4, 2026-11-25).** `frontend/src/logic/times.ts`: `WINDOW_STARTS` and
`startMinutesOf` (the hour 23 has 00 only, F3), `windowEnds` (the end's hours after the start's,
24 only with a start on the hour, and its one minute, F4) and `endAfter` (a new start's hour: one
hour later through `endFor`, unchanged; a new minute alone: the end's hour kept, decision 6a);
`WINDOW_HOURS` removed. `frontend/src/views/time.parts.ts`: `timeLists` takes the minutes of an
hour as a parameter of `offer`, tells `chosen` which list the person changed, has `written` for a
time set by the script, and shows a time it does not offer as it is (decision 6b); `windowTimes`
wires the four forms of a window in `availability.view.ts` and `date.view.ts`; the book dialog
keeps `startSetsEnd` and all twelve minutes. `availability.model.ts`: `END_NOT_WHOLE_HOURS` and
`endRefusal` (through `lastsWholeHours`, after the order check and only when it passed), used by
`patternFor` and by `fieldRefusals` of `date.model.ts`. Unit tests: the logic's cases of the
brief; the four forms' lists after a choice of the start's hour and minute, a dialog opened on
08:05–12:05 and on a stored 08:30–09:45 (09:45 shown, the save refused) and on 23:30–24:00;
`times.test.ts` and `availability.model.test.ts` rewritten for the new lists, `shell.test.ts`
left as w2 made it (10:00–13:00 still holds). The journey "starts off a slot" (block
"appointments"): on a bookable date, 08:17 `invalid_request` and 08:15 `outside_availability`, two
requests sent; its page `docs/journeys/frontend/calendar-appointments.md`. Documents:
`docs/FRONTEND_ARCHITECTURE.md` v25 (section 4, 5.1, decisions 92, 201 and 202);
`docs/FRONTEND_WALK.md` v8, still 170 checks, with 73 and 86 also rewritten (they asked for an end
not later than the start, which the lists can no longer hold; F11 had not listed them);
`docs/FRONTEND_SERVICES.md` decision 42, section 19 and the status line;
`frontend/src/services/appointments.service.ts`'s comment; `docs/SHARED_CALENDAR_SPEC.md` 16.8 and
the status line; the v17 row of `docs/ARCHITECTURE.md`. Checked: typecheck, lint, test:unit green
at the root, 100 % line coverage kept; the journey alone, 6 passed; the look at 1280 × 800 as
`admin` and `alice`, the five checks yes (168 without the appointments of 166, so `alice` saw four
slots and booked 11:05), what it made removed. **What step w5 finds ready:** the page, the API and
the assistant complete on `slot-5min`, nothing deployed; the read-only check of part A, the smoke
test's 53 lines (F10), the full regression, the paid evaluation and the release are all its own.

### Step w5 — The release

Nothing here is run without an explicit instruction in the request of the step (root
`CLAUDE.md`, "Cloud safety").

- **A. The windows in the cloud (F7, Q3).** The read-only check, written into
  `docs/RUNBOOK.md` section 5.10, run against `shared-calendar-api` on the Product Owner's
  word. The operator deletes each window listed in the page of `v2.4.0` (or changes it to whole
  hours where a delete is refused, F6), and the check is run again: it lists none.
- **B. The smoke test (F10)**, run locally (`npm run smoke -w backend -- local`): 53 lines.
- **C. The full regression, once,** on `slot-5min` as it is: the root
  `DYNAMODB_PORT=8002 npm run verify`, the front end's journeys
  (`RUN_INTEGRATION=1 npm run test:integration -w frontend`), the smoke test. **The walk, kept
  to the change**, at 1280 × 800: the pattern forms 71, 73, 74, 76; a date 83, 85, 86, 87, 90,
  91; the book dialog 9, 42, 43, 45; section 11, 157 to 168 and 170. And at 390 × 844 check 169
  only. **28 checks**, 27 at one width and one at the phone width. Recorded as not walked, with
  why: sections 2, 3 (but 9), 5 to 10 and the rest of 4 hold no window form, no date and no
  book dialog, and no file of theirs changed since the full walk of `v2.4.0`.
- **D. The paid evaluation, once**, on the Product Owner's word, the cost said first (about
  50 US cents), on a stack started afresh with the real key by the Product Owner:
  `npm run assistant:eval -w backend`. The four requests of F8 read by hand whatever their
  result; the run in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3. A failure from the
  words of step w3 is fixed before part E.
- **E. The deploy.** The check of part A once more (it lists none); the API, the smoke test
  there, the log search; then the page; a quick look by the operator: a window 09:05–11:05
  offering 09:05 and 10:05, a window 09:05–10:30 that cannot be entered. **The conversations
  in progress end.**
- **F. The documents closed:** the status lines, `docs/RUNBOOK.md` section 5.10 (the record,
  with F12's way back), `README.md` section "Versions", the tag `v2.5.0`, made locally.

**Check:** C and D green before E; the check of A empty before the API is deployed; the smoke
test green in the cloud; the operator's look.

## 6. Beside the mail work

As `docs/SLOT_STEP_PLAN.md` section 6, with one release more. `main` carries the mail work
(`docs/EMAIL_PLAN.md`, release v3.0.0), whose code must not reach the cloud before its own
release; `slot-5min` holds none of it. This plan is released from `slot-5min` as `v2.5.0`;
the merge of `slot-5min` into `main` follows, in a session of its own, and carries both plans.

- **Files both touch,** besides those of `docs/SLOT_STEP_PLAN.md` section 6:
  `docs/SHARED_CALENDAR_SPEC.md` (this plan's v20 and D33 come first),
  `docs/ARCHITECTURE.md` (this plan's v17 row closed and kept; the mail's takes the next),
  `backend/src/assistant/prompt.ts` and `tools/facts.ts`, `backend/tests/eval/requests.ts`
  (the lists joined; the counts in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3 and
  `docs/COMMANDS.md`), `docs/RUNBOOK.md` section 5 (5.9 and 5.10 first),
  `docs/FRONTEND_WALK.md` (section 11 as this plan leaves it).
- **The assistant.** This plan's paid run judges its own change (step w5, part D). The mail's
  step m6 runs the evaluation again on code that holds both.
