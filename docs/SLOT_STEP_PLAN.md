# Shared Calendar: times on 5-minute steps, and "from" drives "to" (implementation plan)

**Version:** v9 (2026-11-25): **the plan is finished**: step s6 done, the API and the page deployed from `slot-5min`, tag `v2.4.0` (`docs/RUNBOOK.md` section 5.9); the merge into `main` meets what section 6 lists. A new rule decided by the Product Owner at the release (a User's hour starting on any 5-minute step) is planned apart. v8 (2026-11-25): open point O1 decided by the Product Owner: this plan is released alone, from its branch, as `v2.4.0`, before the mail work; the merge into `main` follows the release. Step s6 part B and section 6 rewritten; brief `prompts/slot-s05-step-s6-release.md`. v7 (2026-11-25): the pair s4 with s5 done, the page's times as an hour and a minute, a start that sets the end, and a short appointment drawn 15 minutes tall; looked at in a browser on the local stack. v6 (2026-11-25): the two points left to the pair s4 with s5 decided by the
Product Owner before it starts, under F7 (more than three columns are one block, whatever the
reason) and F8 (the two lists of a time in a group named "Start" or "End"). v5 (2026-11-25): step s3 done, the assistant's words and two requests more in
its evaluation; **the paid run of the evaluation moved to step s6, part B**, on the code
merged with the mail work (the Product Owner's decision). v4 (2026-11-25): steps s1 and s2 done, the first pair: the rule in the
governing documents (`docs/SHARED_CALENDAR_SPEC.md` v19, `docs/ARCHITECTURE.md` v16 open) and
the step in `shared/` and the back end, the back end's journeys green. v3 (2026-11-25): the three proposals of planning, F1, F7 and F8, decided by the
Product Owner; F7 changed: a short block and the one that follows it stand side by side. v2
(2026-11-25): steps s1 with s2 and s4 with s5 are built as pairs, one brief,
one check and one stop each (decided by the Product Owner); four stops instead of six. v1
(2026-11-25): the plan, after the Product Owner's answers to eight questions (section 2). No
step done.
**Brief:** `prompts/slot-s01-plan-5-minute-steps.md`.
**Governed by:** `docs/SHARED_CALENDAR_SPEC.md`, `docs/ARCHITECTURE.md`,
`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
`docs/CONVERSATIONAL_ARCHITECTURE.md`. On any conflict those documents win, and this plan is
fixed. Step s1 writes the decisions below into them.
**Branch:** `slot-5min`, in its own worktree, beside the mail work on `main` (section 6).

---

## 1. What is asked, and the shape of the answer

Two changes, planned together.

**The step.** The Administrator's times, which are the start and the end of a weekly pattern,
of a one-off window, of a window of a date override and of a custom appointment, lie today on
15-minute steps (`docs/SHARED_CALENDAR_SPEC.md` decisions D2 and D12, R-BOOK-02, section 6.2).
They move to **5-minute steps**: a window may open at 09:05, an appointment may run 10:10 to
10:35.

**What stays.** A User books only whole-hour slots, and a slot is exactly 60 real minutes that
start on a whole local hour (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01). Slots do not start
every 5 minutes: a window 08:05 to 12:00 yields the slots 09:00, 10:00 and 11:00.

**"From" drives "to".** In the page only: every time the Administrator chooses a "from" time,
the page sets the "to" time one hour later. Changing "to" never touches "from".

The rest follows:

- **The data:** nothing changes and nothing is migrated (F2).
- **The API:** no new route, field or error code. The same bodies accept more times; three
  messages of `400 invalid_request` change their words. `backend/template.yaml` does not change.
- **The front end:** a time is chosen with two short lists, hours and minutes, in the three
  places that have a "from" and a "to"; the "from" drives the "to" there; the week draws a very
  short appointment at a height that can still be read and pressed.
- **The assistant:** its instructions and the tools that change the opening hours say "5-minute
  steps" instead of "the quarter hour"; the paid evaluation gains two requests and is run again.
- **The release:** the API, then the page. Every client of today keeps working, so it is the
  next minor version (F9).

## 2. Decided before the first step

Decided by the Product Owner on 2026-11-25.

| # | Question | Decision |
|---|---|---|
| S1 | How "to" follows "from" | **Only "from" drives.** A choice of "from" sets "to" one hour later, every time. A change of "to" never moves "from", so any length is entered by choosing "from" first and "to" second. The rule "a change of 'to' moves 'from' one hour earlier" was considered and dropped: the two together would allow only lengths of one hour. |
| S2 | Where it applies | **Every place with a "from" and a "to":** the forms that create and change a weekly pattern, the forms of a window on the page of a date, the Administrator's times in the dialog that books or moves an appointment. |
| S3 | When one hour later is not possible | **The nearest allowed time:** 24:00 in a form of a window ("from" 23:30 gives "to" 24:00), the end of the window that holds the slot in the dialog ("from" 11:40 in a window that ends at 12:00 gives "to" 12:00). |
| S4 | A form that opens with times in it | **Shown as they are** (the change of a pattern, the dialog with the slot's own hour): only a choice of "from" by the person sets "to". |
| S5 | How the page offers a time | **Two short lists per time:** the hours (00 to 23, and 24 for an end) and the minutes (00, 05 … 55). One long list (288 entries) and the browser's time field (Safari and the iPhone ignore its step, and it cannot hold 24:00) were considered and dropped. |
| S6 | The shortest custom appointment | **5 minutes:** one step, as today's minimum is one step. |
| S7 | A very short appointment in the week | **A minimum height:** a block is never drawn lower than 15 minutes' worth. Its text says the true times. |
| S8 | The assistant's evaluation | **Two requests more**, one in English and one in Italian, that need a 5-minute time; then the whole evaluation is run before the deploy. |

## 3. What planning found

- **F1. Where the step is known in the code.** Five places, and no other:
  - `shared/src/calendar/schemas.ts`: `LocalTime`, a regular expression whose minutes are
    `00|15|30|45`, with the message "expected HH:mm on the 15-minute grid"; `LocalEndTime` is
    built on it. Every body with a window uses them.
  - `shared/src/calendar/rules.ts`: `isOnQuarterGrid`, the minute of the local clock `% 15`.
  - `backend/src/lib/calendarRules.ts`: `checkBookingTimes`, the Administrator's `start` and
    `end` through `isOnQuarterGrid`, and `QUARTER_MS`, the minimum length; three messages.
  - `backend/src/assistant/prompt.ts` ("Hours are on the quarter hour", in the paragraph on
    blocking time) and `backend/src/assistant/tools/facts.ts` (`hoursInput`, the descriptions
    of `start` and `end` that the tools of the opening hours give Claude).
  - `frontend/src/logic/availability.model.ts` (`GRID`, `START_CHOICES`, `END_CHOICES`) and
    `frontend/src/logic/booking.ts` (`GRID`, `timeChoice`).

  **Decided** (the Product Owner, 2026-11-25): the step is written once, the constant
  `TIME_STEP_MINUTES` in `shared/src/calendar/defaults.ts`, read by all of them, and
  `isOnQuarterGrid` is renamed `isOnTimeStep`. Two copies of `GRID = 15` in the front end and
  a third number in the back end are how a step ends up different in two places.
- **F2. Nothing to migrate.** Appointments are stored as instants, windows as local times
  `HH:mm`; no key, index or item of the `calendar` table is built on the step. Every stored
  time lies on the 15-minute grid, which is part of the 5-minute grid. Nothing is read through
  `LocalTime` on the way out of the table, so nothing stored can be refused.
- **F3. What does not depend on the step,** read in the code:
  - *The people in an interval* (`peopleIn`): it sorts starts and ends as instants. No step.
  - *The merging of windows* (`effectiveWindows`): two windows merge when one ends at the
    instant the other starts. No step.
  - *The slots* (`slotsOf`): from a start that is not a whole local hour it walks
    `60 − minute` minutes to the next one, whatever the minute is. A window 08:05 to 12:00
    gives 09:00, 10:00, 11:00 with no change of code; step s2 adds this case to its tests.
  - *The night the clocks change:* `toInstant` and `localTimeOf` work on any minute. The
    existing tests go through the quarter hours of those nights; step s2 adds times such as
    02:05 and 02:55 on both nights.
  - *The week's drawing* (`frontend/src/logic/week.model.ts`): top and height are computed
    from minutes. No step; but see F7.
- **F4. The slot stays clear, with one thing to say in the documents.** A window 08:05 to
  12:00 has 55 minutes, 08:05 to 09:00, in which no slot starts: open hours that only the
  Administrator can book, with custom times. A window 10:10 to 10:50 yields no slot at all.
  Both exist today (08:15 to 12:00; 10:15 to 10:45) and R-SLOT-01 already decides them; they
  only become more likely. Step s1 adds the example 08:05 to R-SLOT-01. No rule changes.
- **F5. The messages change, the codes do not.** A time off the step is still
  `400 invalid_request`. Three messages name the step: the schema's ("expected HH:mm on the
  15-minute grid") and two of `checkBookingTimes` ("start must be on a 15-minute step", the
  same for `end`), plus "an appointment lasts at least 15 minutes". They become "5-minute" and
  "at least 5 minutes". No client reads a message to decide anything: the page shows its own
  sentence for `invalid_request`.
- **F6. The tests use today's off-step times as examples of a refusal.** `08:10`, `09:10`,
  `12:05`, `19:05` and `10:10` are refused in about a dozen unit tests of `shared/`,
  `backend/` and `frontend/`; with the new step they are valid. Each becomes a time off the
  5-minute step (`08:07`), and each file gains the opposite case (`08:05` accepted). One of
  them is not about the step: `backend/tests/unit/assistant/tools/bookAppointment.test.ts`
  expects the assistant's `book_appointment` to refuse the time `10:10` at its schema. That
  tool books a free slot, a whole hour; with the wider `LocalTime` the time `10:10` passes the
  schema and must then be refused as "not a free slot" by `freeSlotAt`. Step s3 proves it.
- **F7. The week has no minimum height for a block.** One hour is `3.25rem`; 15 minutes are
  about 13 pixels, 5 minutes about 4. **Decided** (S7): never lower than 15 minutes' worth.
  A block drawn taller than its time may reach over the start of the next one: 10:10 to 10:15
  is drawn down to 10:25, and another appointment may start at 10:15. **Decided** (the Product
  Owner, 2026-11-25, changing the plan's proposal): the two stand **side by side**, as the
  week already draws appointments that overlap (`columnsOf` in
  `frontend/src/logic/week.model.ts`); each one's text says its true times. The proposal, the
  next block drawn on top, would have left a strip of 4 pixels of the short one, which the
  minimum height was meant to avoid. The people in a slot are counted on the real times, as
  today. **Decided** (the Product Owner, 2026-11-25, before the pair s4 with s5): **more than
  three columns are one block, whatever made them**, a real overlap or the drawn height of
  short appointments, as the Administrator's week does today; the block opens the list of its
  appointments, each with its true times. Known and accepted: the block counts the
  appointments it holds, so in a rare case it says "4 people" of appointments that are not all
  there at the same moment. The other choice, a block only for a real overlap, would have
  drawn four or more narrow columns, hard to read and to press at the phone width.
- **F8. Two short lists change the book dialog.** Today the dialog offers exactly the times
  of the slot's window: nothing outside it can be chosen. With a list of hours and a list of
  minutes, a pair outside the window can be put together (window 08:05 to 12:00, hour 08,
  minute 00). **Decided** (the Product Owner, 2026-11-25): the hours are those the window
  touches; the minutes are all twelve, whatever the hour; a pair outside the window is
  refused by the server with `outside_availability`,
  which the dialog already says in plain words: whether a booking is allowed stays the
  server's to say (`docs/FRONTEND_SERVICES.md` section 8, decision 42). An end not after the
  start is refused by the shared schema before anything is sent, as today in the window forms.
  With the hour 24 the list of minutes holds only 00. S3's "the end of the window" is computed
  from the window, not from a list. **Decided** (the Product Owner, 2026-11-25, before the
  pair s4 with s5): **the words of the two lists.** The two lists of a time stand in a group
  named "Start" or "End", a `<fieldset>` with its `<legend>`; each list is inside a `<label>`
  whose words, "Hour" and "Minute", a screen reader says and the eye does not see; a colon
  between them is hidden from the screen reader. On screen: `Start [09] : [05]`. The lists
  are named `start-hour`, `start-minute`, `end-hour` and `end-minute`. The other choices, four
  visible labels or the letters "h" and "min", made the forms wider or less clear when read
  aloud.
- **F9. A minor version.** A time valid today stays valid; a body, a route, a code and a
  field are as they were. The page of today works against the new API. The new page against
  the API of today would have its 5-minute times refused, so the API is deployed first, as
  always. The tag is the next minor one (`README.md` section "Versions"); which number that is
  depends on the mail work (section 6).
- **F10. No way back without care.** Once a window at 09:05 or an appointment at 10:10 is
  stored, the API of today still reads it, but the page of today cannot show its time in a
  list. A roll-back after the release is possible only while no such time was saved. Step s6
  writes this into the record of the deployment.
- **F11. The assistant.** It never books custom times (they stay in the web pages), so
  `book_appointment` and `change_appointment` keep their meaning. What changes is what it is
  told about the opening hours: the sentence of `prompt.ts` and the two descriptions of
  `hoursInput`. That changes the mark of the instructions, which **ends every conversation in
  progress** at the deploy, as in every plan that touched them, and calls for the evaluation
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3): about 45 US cents a run, a little more
  with S8's two requests. It is run on the Product Owner's word, the cost said first.

## 4. The rules as they will read

For step s1 to write into `docs/SHARED_CALENDAR_SPEC.md` (a new version, and decisions after
D31):

- **Glossary, "Local time":** `HH:mm`, in 5-minute steps.
- **D2 — Granularity.** Windows and the Administrator's custom appointment times use 5-minute
  steps. Users only book whole hours.
- **D12 — Administrator's custom times.** Inside one window, 5-minute steps, at least 5
  minutes (S6).
- **A new decision, the step:** why 5 minutes, that the slot did not change, that nothing was
  migrated (F2), and that the step is one constant (F1).
- **Section 6.2 and the windows of 6.3 and 6.4:** start and end on 5-minute steps.
- **R-SLOT-01:** unchanged; the example of the window 08:05 to 12:00 added (F4).
- **R-SLOT-05** (partial occupation): unchanged; its example may stay.
- **R-BOOK-02 — Times, the Administrator's column:** `start` and `end` on 5-minute local
  steps; `end` defaults to `start + 60 min`; `end − start ≥ 5 min`. The User's column is
  unchanged.
- **Section 11.4:** the comment on `LocalTime`, "on the 5-minute grid".
- **The screens' table** (the row of the book dialog): custom start and end on a 5-minute
  grid, each chosen as an hour and a minute; "from" drives "to" (S1 to S5).
- **Section 18:** the unit tests of the grid restated; two acceptance scenarios: the window
  08:05 to 12:00 and its three slots; the Administrator's 10:10 to 10:35 accepted, 10:07
  refused with `400 invalid_request`, a User's 10:10 refused as today.

For `docs/FRONTEND_ARCHITECTURE.md` (written in steps s4 and s5): decisions 37 and 92 of its
section 11 restated for the two short lists (S5, F8); new decisions for "from" drives "to"
(S1 to S4) and for the minimum height (S7, F7); the logic layer's list of section 5.1.

## 5. Steps

Six steps, four stops. **Steps s1 with s2 and steps s4 with s5 are built as pairs:** one
brief, one check and one stop for each pair, the first step of the pair done before the
second. Step s3 and step s6 stand alone: s3 holds the paid evaluation and ends the open
conversations, s6 holds the full regression and the deploy. No more than a pair at a time: a
failure must still point at one part, the server, the assistant or the page.

After each stop an honest report, then the review; commit only when asked. The check of a step is the short one of the root `CLAUDE.md`, "Working rhythm":
`npm run typecheck`, `npm run lint`, `npm run test:unit`, the journeys the step adds or
changes, a look at the screens it changes. The full regression runs once, in step s6. Every
step keeps 100 % line coverage and merges what it built into the governing document in the
same change. A changed integration journey changes its page under `docs/journeys/` in the
same commit (the project skill `explain-journey`). Each pair and each single step has its
brief, `prompts/slot-s02-…` onwards.

### Step s1 — The rules in the documents (documents only; a pair with s2)

- `docs/SHARED_CALENDAR_SPEC.md`: section 4 above, the new decision, the change log, the
  status line saying the version is specified and not built.
- `docs/ARCHITECTURE.md`: a new version row, open; the rows of section 4 that name the grid
  (`PatternBody`, `BookBody`, `ChangeBody`) and its two sequence diagrams' "times on the
  role's grid", which stay true as they are.
- `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md` and
  `docs/CONVERSATIONAL_ARCHITECTURE.md`: only a line each, "changed in step s3 / s4 of
  `docs/SLOT_STEP_PLAN.md`", so that no document says something false meanwhile.
- F1, F7 and F8 are decided (section 3): nothing to ask.

**Check:** `npm run lint`; a changed diagram is rendered on a dark page
(`.claude/rules/diagrams.md`). No stop: step s2 follows, and the review is of both.

**As done (2026-11-25).** Documents only. Brief
`prompts/slot-s02-pair-s1-s2-implementation.md`, which also records F1, F7 and F8 as decided.

- *`docs/SHARED_CALENDAR_SPEC.md` v19.* **Decision D32, the time step**, in a table of its own
  after D31: 5 minutes, the slot unchanged, nothing migrated, the step written once. D2 and
  D12 restated and pointing at it; the glossary's "Local time"; the sentence of section 5 on
  the rules of the local time; the row `start`, `end` of 6.2 (6.3 and 6.4 say "as for
  patterns" and needed nothing); R-SLOT-01 keeps its words and gains the window 08:05–12:00,
  the 55 minutes in which no slot starts, and 10:10–10:50 with no slot (F4); R-BOOK-02's
  column of the Administrator; the comment of 11.4; section 12 (`isOnTimeStep`,
  `TIME_STEP_MINUTES`); the row "Book dialog" of 16.8, which says how the page will offer a
  time and that it is not built yet; 18.1; **AC-45 to AC-48** in 18.3 (the plan asked for two
  scenarios; they are four rows: the window at 08:05, 10:10–10:35, five minutes, the two
  refusals). The change log and the status line.
- *`docs/ARCHITECTURE.md`.* The status line and the date; **a v16 row, open** (its number may
  change at the merge with the mail work, section 6); in section 4 the row of `PatternBody`
  and the paragraph on booking, which named the 15-minute grid. The rows of `BookBody` and
  `ChangeBody` say "the role's grid" and stay as they are.
- *The three other documents.* `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`
  and `docs/CONVERSATIONAL_ARCHITECTURE.md`: one sentence at the end of the status line each.
- *Checked:* `npm run lint` green. No diagram changed.

### Step s2 — The step in `shared/` and in the back end (a pair with s1)

- `shared/src/calendar/defaults.ts`: the step, 5 minutes, one constant (F1).
- `shared/src/calendar/schemas.ts`: `LocalTime` accepts the minutes 00, 05 … 55; its message.
- `shared/src/calendar/rules.ts`: the grid check renamed and built on the constant.
- `backend/src/lib/calendarRules.ts`: `checkBookingTimes` on the new check, the minimum of
  one step, the three messages (F5).
- The tests of F6 in `shared/tests/`, `backend/tests/unit/` and the one expectation of
  `frontend/tests/unit/services/availability-rules.service.test.ts` that quotes the schema's
  message (a test's text only; nothing under `frontend/src` changes in this step). New cases:
  `slotsOf` on 08:05 to 12:00; 02:05 and 02:55 on the two nights the clocks change (F3);
  `peopleIn` with 5-minute appointments.
- `backend/tests/integration/calendar.test.ts`: a journey for the two scenarios of section 4,
  and its page under `docs/journeys/backend/`; the words "15-minute" in the pages
  `docs/journeys/backend/calendar-booking.md` and
  `docs/journeys/frontend/calendar-appointments.md`.
- `shared/CLAUDE.md` and `backend/CLAUDE.md` where they name the check.

The page keeps offering quarter hours until step s4: it has its own `GRID`. Between the two
steps the server accepts more than the page can ask, which harms nothing.

**Check, for the pair, then the stop:** the short check; the back end's calendar journeys
(`DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend`, with `local:up`
and `local:api` running, after `npm run build -w backend` and a restart of `local:api`).

**As done (2026-11-25).** Changes under `shared/`, `backend/src/lib`, `backend/tests`,
`docs/` and one test of the front end; nothing under `frontend/src` or `backend/src/assistant`,
nothing deployed, no `aws` command run.

- *`shared/src/calendar/defaults.ts`:* `TIME_STEP_MINUTES = 5`, the one place the step is
  written (F1).
- *`shared/src/calendar/schemas.ts`:* `LocalTime` accepts `00:00` to `23:55` on the step. It
  stays a regular expression, built from the constant (the minutes `00|05|…|55`), and not a
  check in code: the assistant's tools hand this schema to Claude, and only a regular
  expression reaches Claude as a pattern. Its message says "5-minute". `LocalEndTime` follows:
  `24:00` is still the only time past 23:55, `24:05` is refused.
- *`shared/src/calendar/rules.ts`:* `isOnQuarterGrid` is `isOnTimeStep`, on the constant; an
  instant with seconds is on no step. `slotsOf`, `peopleIn`, `effectiveWindows` and the time
  helpers did not change (F3 holds).
- *`backend/src/lib/calendarRules.ts`:* `checkBookingTimes` uses `isOnTimeStep`; the shortest
  appointment is one step; the three messages are built from the constant ("start must be on
  a 5-minute step", the same for `end`, "an appointment lasts at least 5 minutes"). No handler
  names the step.
- *Tests.* `shared/tests/calendar/`: `LocalTime` on 00:05, 08:10, 23:55, 08:07, 08:01, 24:05;
  `slotsOf` on 08:05–12:00, on a window closing at 11:55, on 10:10–10:50 and on 01:05–03:55
  of the night the clocks go back; `isOnTimeStep` on and off the step, in `Asia/Kathmandu`,
  on 02:05 and 02:55 of the night the clocks go back (both occurrences) and around the hour
  skipped in spring; `peopleIn` with 5-minute appointments. `backend/tests/unit/lib/`:
  `checkBookingTimes` on AC-46, AC-47 and AC-48, an `end` left out from 10:10, the two 02:05
  of the night the clocks go back, a User held to the whole hour. The handlers' tests: five
  examples of a refusal moved off the 5-minute step (F6), and two accepted cases added (a
  pattern 08:05–11:55; 10:10–10:35 and five minutes booked).
- *Two files of the assistant's tests, the example time only* (as the brief allowed):
  `backend/tests/unit/assistant/tools/availabilityTools.test.ts` (`09:10` and `19:05` became
  `09:07` and `19:07`) and `bookAppointment.test.ts` (`10:10` became `10:07`). What the tools
  tell Claude in words did not change.
- *One test of the front end:* `frontend/tests/unit/services/availability-rules.service.test.ts`
  quotes the schema's message and an off-step time; both follow.
- *The journey:* `times on 5-minute steps (AC-45 to AC-48)` in
  `backend/tests/integration/calendar.test.ts`, seven tests on the Saturday the capacity's
  journey leaves empty, with a User of its own, `step-alice`; besides the four scenarios it
  books 08:05–08:55, the open time in which no slot starts, and has a pattern, a one-off
  window and a day's own hours off the step refused. Its page
  `docs/journeys/backend/calendar-time-step.md`, listed in `docs/journeys/README.md`; the
  words "15-minute" in `docs/journeys/backend/calendar-booking.md` and
  `docs/journeys/frontend/calendar-appointments.md`.
- *Found: the pattern of the assistant's tools changes already here.* The tools of the
  opening hours and of a booking are built on `LocalTime`, so the pattern Claude is given for
  a time now allows 5-minute times, while the words of `hoursInput` and of the instructions
  still say "the quarter hour" until step s3. The mark of the instructions therefore changes
  with this pair, not only with step s3. Nothing is deployed in between.
- *Known gap, accepted:* the server accepts 5-minute times that the page cannot offer and the
  assistant is not told about, until steps s3 to s5.
- *Checked:* `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root
  (544 tests in `shared/`, 1 836 in `backend/`, 2 705 in `frontend/`, 100 % line coverage
  kept). `DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend`, with
  `local:up` and `local:api` started from this worktree on the new build: 3 files, 215 tests
  passed, the seven of the new journey among them.

**Step s3 finds ready:** `TIME_STEP_MINUTES` and a `LocalTime` that already accepts 5-minute
times in the tools' schemas; to do there, the words (`prompt.ts`, `hoursInput`), the proof
that `book_appointment` and `change_appointment` answer "not a free slot" for 10:10, and the
evaluation. **The pair s4 with s5 finds ready:** `TIME_STEP_MINUTES` to build the lists of
hours and minutes on, in place of the two `GRID` constants; the shared schemas the services
check with accept 5-minute times, and the server books them.

### Step s3 — The assistant

- `backend/src/assistant/prompt.ts`: "Hours are on 5-minute steps" in the paragraph on
  blocking time. `backend/src/assistant/tools/facts.ts`: the two descriptions of `hoursInput`
  and its comment.
- The unit tests of the tools (`availabilityTools.test.ts`, `bookAppointment.test.ts`,
  `changeAppointment.test.ts`): 09:05 accepted by the tools of the opening hours, 09:07
  refused; `book_appointment` and `change_appointment` asked for 10:10 answer "not a free
  slot" (F6).
- The assistant's journeys and the fake Claude's answers
  (`backend/tests/integration/fake-claude/answers.json`): changed only if one of them names a
  quarter hour as a limit; none was found in planning.
- `backend/tests/eval/requests.ts` and `checks.ts`: S8's two requests, for example "open
  Tuesdays from 09:05 to 12:00" in English and a block of 10:10 to 10:35 in Italian, each
  checked on the times of the request stored in its proposal.
- **The paid evaluation is not run in this step** (decided by the Product Owner, 2026-11-25):
  it is run once in step s6, part B, on the code merged with the mail work, which adds a tool
  of its own to the assistant. A run here would judge an assistant that is never deployed, and
  would be paid again after the merge.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: the instructions of section 7.3, the tools of
  section 8, the evaluation's count of requests, a new version row.

**Check:** the short check; the back end's journeys, the assistant's among them, on the fake
Claude; the evaluation's list printed with the two new requests (`-- --list`, which costs
nothing).

**As done (2026-11-25).** Changes under `backend/src/assistant`, `backend/tests` and `docs/`
only; nothing deployed, no `aws` command run, nothing paid. Brief
`prompts/slot-s03-step-s3-implementation.md`, changed before the step started to leave the
paid run out.

- *`backend/src/assistant/prompt.ts`:* in the paragraph on blocking time, "Hours are on the
  quarter hour." is "Hours are on 5-minute steps: 10:05, 10:10 and so on." Nothing else of the
  instructions changed.
- *`backend/src/assistant/tools/facts.ts`:* the two descriptions of `hoursInput`, built on
  `TIME_STEP_MINUTES`: `start` "on a 5-minute step (minutes 00, 05, 10 and so on up to 55)",
  `end` "on a 5-minute step, or 24:00". They serve `create_pattern`, `update_pattern`,
  `set_date_override` and `create_one_off_window`. The descriptions of `time` in
  `book_appointment` and `change_appointment` are as they were.
- *Unit tests:* what Claude is given for `start` and `end` (the two sentences, the pattern
  with every fifth minute, no "quarter"); 09:05 to 11:55 and 19:05 to 20:10 accepted, 09:07
  and an end at 11:58 refused; **`book_appointment` asked for 10:10** by a User and by the
  Administrator for a User, and **`change_appointment` asked for 09:10**: the schema lets the
  time through and the tool answers `no_free_slot`, having only read (F6 holds); the
  instructions name the 5-minute step and no longer the quarter hour.
- *The journeys:* none names a quarter hour as a limit, in
  `backend/tests/integration/assistant.test.ts` or in the fake Claude's answers; none changed.
- *The evaluation:* two requests in `backend/tests/eval/requests.ts`, `step-pattern-new`
  (English: "Open eval Lesson every Sunday from 14:05 to 16:35", checked on the body of
  `create_pattern`) and `step-block` (Italian: a block from 10:10 to 10:35 on the Tuesday of
  the week after, checked on the three pieces `set_date_override` is given). `checks.ts`
  needed nothing. The list prints 59 requests, 64 messages. **Not run with the real model.**
- *Documents:* `docs/CONVERSATIONAL_ARCHITECTURE.md` v22 (the row, the status line, sections
  7.3, 8.2 and 12.3, which says that no run was made and why); `docs/COMMANDS.md` (59
  requests); the open row of `docs/ARCHITECTURE.md`; the status line of
  `docs/SHARED_CALENDAR_SPEC.md`; this plan's steps s3 and s6 and section 6.
- *Open until step s6:* nothing yet says whether the real model keeps a time such as 10:10
  to the minute, or reads the new sentence as meant.
- *Checked:* `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root
  (544 tests in `shared/`, 1 843 in `backend/`, 2 705 in `frontend/`, 100 % line coverage
  kept). `DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend`, on the
  fake Claude, with the stack started from this worktree on the new build: 3 files, 215 tests
  passed. `npm run assistant:eval -w backend -- --list`: 59 requests, 64 messages.
- *Found on the way: one local stack, two checkouts.* The emulators belong to the folder
  that started them: `local:up` from the checkout of `main` gives Cognito another user pool
  than the one this worktree's `backend/env.local.json` names, and every journey then fails
  at its first call ("User Pool … not found", all tests skipped). Before the journeys here:
  `local:down`, `local:up` and `local:api` from this worktree, while the mail work is not
  using the stack. `local:down` from here leaves the mail work's fake mail container running
  and says the network is still in use, which is harmless.

**The pair s4 with s5 finds ready:** nothing of this step; the page does not depend on it.
**Step s6 finds ready:** the two requests in the list, to be joined with the mail work's at
the merge; the paid run to make, with what to read by hand (part B).

### Step s4 — The page: hours and minutes, and "from" drives "to" (a pair with s5)

- `frontend/src/logic/`: the choices of a time as hours and minutes on the shared step, for a
  window form (00:00 to 23:55, an end up to 24:00) and for the book dialog (the hours of the
  slot's window, F8); a time put together from its two lists and taken apart into them; the
  rule of S1 to S4 as one pure function, "the 'to' for this 'from', within these bounds",
  used by the three places. The two `GRID` constants go.
- `frontend/index.html`, `frontend/src/views/availability.view.ts`, `date.view.ts`,
  `week.view.ts`: two lists per time; a change of either list of "from" by the person sets
  both lists of "to"; a change of "to" does nothing else; a form filled by the page (S4)
  sets nothing. `frontend/style.css`: the two lists of a time on one line.
- What is sent does not change: `HH:mm` in a window's body, the two instants in a booking,
  the slot's own instants while the dialog's times were left as it opened.
- The unit tests of the logic and of the three views (S1: a "from" chosen twice sets "to"
  twice; "to" changed, "from" stays; S3 at 23:30 and at the end of a window; S4 for the change
  of a pattern and for the dialog; the hour 24).
- `docs/FRONTEND_ARCHITECTURE.md` (section 4 above), `docs/FRONTEND_SERVICES.md` where it
  names the grid, `docs/FRONTEND_WALK.md`: the checks that choose a time (its checks 42, 43
  and 45, the pattern and the window forms), and new ones for "from" drives "to".

**Check:** `npm run typecheck` and `npm run test:unit`, so that step s5 starts from green.
No stop: step s5 follows.

**As done (2026-11-25).** Changes under `frontend/`, `docs/` and `.claude/rules/` only;
nothing deployed, no `aws` command run. Brief `prompts/slot-s04-pair-s4-s5-implementation.md`.

- *`frontend/src/logic/times.ts`, new:* the minutes of an hour on `TIME_STEP_MINUTES` (only 00
  for the hour 24), a time taken apart and put together, the hours of a form of a window
  (`WINDOW_HOURS`: starts 00 to 23, ends 00 to 24) and of the book dialog (`windowHours`, the
  hours the window touches, F8), and `endFor`, the rule of S1 and S3: one hour later, never
  past the last time allowed; a start at or after that last time gets one hour later, up to
  24:00, so that the server's refusal is `outside_availability` and not an end before the
  start. `availability.model.ts` lost `START_CHOICES`, `END_CHOICES` and its `GRID`;
  `booking.ts` lost its `GRID`, and `timeChoice` gives the hours, the slot's times and the
  window's end.
- *`frontend/src/views/time.parts.ts`, new:* the two lists of one time in a form, found by
  `<name>-hour` and `<name>-minute`, and `startSetsEnd`. Handlers are properties (`onchange`),
  so a value set by the script sends nothing (S4). `availability.parts.ts`: a field with no
  element of its name is a time; a refusal marks both its lists.
- *`frontend/index.html`:* the ten times of the five places are each a `fieldset.clock` with a
  legend and two lists inside labels whose words are for a screen reader only (`.unseen`).
  The class is `clock`, not `time` as the brief's example had it: `.time` already holds a
  block's text. `style.css`: the group on one row, the colon between, `.unseen`. The page
  counts 52 fields, `#availability` 31.
- *Unit tests:* `times.test.ts` (every pair of the window's lists through `WindowBody`, every
  start's end within the lists), `time.parts.test.ts`, and the three views' tests with the
  page's and the shell's: a start chosen twice sets the end twice, an end changed leaves the
  start, 23:30 gives 24:00, the hour 24, 11:40 in a window to 12:00 gives 12:00, a pattern's
  dialog and the book dialog open with their times as they are, 10:10–10:35 booked, a time
  outside the window refused in the dialog's words.
- *Documents:* `docs/FRONTEND_ARCHITECTURE.md` v24 (sections 4, 5.1 with twenty-one files,
  7.1, decisions 37 and 92 restated, 195 to 200); `docs/FRONTEND_WALK.md` v6 (section 11,
  checks 42, 43, 45, 76 and 86); the status lines of `docs/FRONTEND_SERVICES.md` and
  `docs/SHARED_CALENDAR_SPEC.md`, whose row "Book dialog" of section 16.8 is no longer "not
  built yet"; the open row of `docs/ARCHITECTURE.md`; `docs/FOLDER_STRUCTURE.md`,
  `frontend/CLAUDE.md`, `.claude/rules/frontend-views.md` (the counts).

### Step s5 — The week: a short appointment (a pair with s4)

- `frontend/src/logic/week.model.ts`: a block's height is at least 15 minutes' worth (S7);
  a block that starts inside the drawn height of another stands side by side with it (F7),
  while the people counted and the block of four or more follow the real times only.
  The block that groups four or more appointments and the lanes side by side follow the same
  rule.
- Its unit tests; `docs/FRONTEND_ARCHITECTURE.md`; a check in `docs/FRONTEND_WALK.md` (an
  appointment 10:10 to 10:15 that can be read and opened, beside one that starts at 10:15).

**Check, for the pair, then the stop:** the short check; the front end's journeys if one
changed; a look, in a browser on the local stack after `seed:local`, on a desktop width and a
phone width: the three places that choose a time, with "from" driving "to", and the week with
a 5-minute, a 10-minute and a 15-minute appointment made there, alone and one after the other (side by side where a short one is followed at
once).

**As done (2026-11-25).**

- *`frontend/src/logic/week.model.ts`:* `SHORTEST_DRAWN` (15); an appointment is placed by its
  drawn span, at least 15 minutes from its start and never past the last hour shown (23:55 is
  drawn 23:45 to 24:00). The columns and the chains take the drawn spans, for both roles, so
  10:10–10:15 and 10:15–11:00 stand side by side; four columns or more become one group, the
  Administrator's only, over the drawn span (v6, F7). A slot's tab and `beside` keep the true
  times. An appointment drawn at that least height is marked `short`.
- *Found in the look:* a 15-minute block is about 12 pixels tall, and its line of text, with
  the block's padding, was cut in half. The class `short` (`week.view.ts`, `style.css`) takes
  the padding off and sets the line to the letters' height: the time and the User can be read.
  Beside another block, a short one's half width shows only "10:10–"; its detail and its name
  for a screen reader say the whole time.
- *Known, not changed:* a short block drawn taller than it is may cover up to ten minutes of
  the top of the free slot that follows it, where the slot's time is written; the slot stays
  pressable below. Not met in the look: the seed and the walk book short appointments in
  slots already full.
- *Unit tests:* 10:10–10:15 alone, followed at 10:15, at 10:25 and at 10:40; three 5-minute
  blocks and a fourth; 15 minutes or more unchanged; 23:55; a User's week; four columns as a
  group over the drawn span; the tab on the true times; Kolkata; the night the clocks go back;
  the mark `short`.
- *The look:* Chrome, against the local stack after `seed:local`, as `admin` and `alice`, at
  1280 wide: the five places with two lists each; start sets end with the keyboard (08:05 →
  09:05), an end changed leaving the start, 23:30 → 24:00 with only 00; a Sunday pattern
  08:05–12:00 and its slots from 09:00; 10:10–10:35 booked from the dialog; 08:00 refused in
  the dialog's words; 11:40 → 12:00; 09:00–09:05, 09:30–09:40, 10:10–10:15 beside 10:15–11:00,
  11:00–11:15; `alice`'s week the same, "You". The browser's window could not be made narrower:
  the phone width was looked at with the body held to 390 pixels and the style sheet's phone
  rules applied by a script, the two lists fitting in every form and dialog; a real phone
  width is still to be seen. The pattern and the appointments made stay in the local stack.
  Screenshots in the session's scratchpad, not in the repository.
- *Checked:* `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root
  (544 tests in `shared/`, 1 843 in `backend/`, 2 775 in `frontend/`, 100 % line coverage
  kept). No file under `frontend/src/services` or `frontend/tests/integration` changed, so the
  front end's journeys were not run.

**Step s6 finds ready:** the page and the server on 5-minute steps, unit tests green, the walk's
section 11 to run whole at both widths in the full regression (a real phone width among them);
the assistant's paid run (part B) still to make on the merged code.

### Step s6 — The release

Nothing here is run without an explicit instruction in the request of the step (root
`CLAUDE.md`, "Cloud safety").

- **A.** `backend/scripts/smoke.sh`: in the calendar's journey, the Administrator books a
  5-minute time and a time off the step is refused. Run locally
  (`npm run smoke -w backend -- local`).
- **B.** On the branch `slot-5min` as it is, not merged with `main` (section 6). The full
  regression: the root `DYNAMODB_PORT=8002 npm run verify`, every journey,
  `docs/FRONTEND_WALK.md`, the smoke test. **Then the paid evaluation, once**, on this branch
  and only on the Product Owner's word, the cost said first (about 50 US cents):
  `npm run assistant:eval -w backend` on a stack started afresh with the real key by the
  Product Owner. The two requests of step s3 are read
  by hand whatever their result; the run is recorded in
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3. A failure that comes from the sentence
  or the descriptions of step s3 is fixed before part C.
- **C.** The API deployed, the smoke test there; then the page; a look by the operator.
- **D.** The documents closed: the status lines, `docs/RUNBOOK.md` section 5 (a new record,
  with F10), `README.md` section "Versions", the tag.

**Check:** B green before C; the smoke test green in the cloud; the operator's look.

**As done (2026-11-25).** Brief `prompts/slot-s05-step-s6-release.md`, with the Product
Owner's decisions for this step: nothing pushed; the smoke test's new lines in the calendar
journey; the walk at a real phone width; the deploy when the operator chooses; a quick look by
hand at the deployed page, everything made there deleted; the tag made locally.

- *Part A, the smoke test.* `backend/scripts/smoke.sh`: in the calendar journey, after the
  user's own cancellation and before the window is deleted, three lines in the same window:
  the Administrator books 03:10–03:35 for the throw-away user (`201`, both instants read back
  exactly), cancels it (`200`), and 03:07–03:35 is refused `400 invalid_request`, the user's
  appointments with `status=all` holding none at 03:07. The times are the hour's start plus
  10, 35 and 7 real minutes, which the journey's date search keeps to an hour of 60 real
  minutes. The clean-up looks an unanswered booking up by the start it sent, so a stop halfway
  cancels the new appointment as it does the first. **52 lines** (12 of the calendar journey);
  the calendar lock's `version` goes up by 9 for that journey, 21 per run; one more cancelled
  appointment per run stays as history. Documents: `docs/RUNBOOK.md` sections 2 and 2.1 (the
  lines, a failure that means the API is not on the step), `docs/ARCHITECTURE.md` section 9.3,
  `docs/SHARED_CALENDAR_SPEC.md` section 18.4 (its items 3 and 5, and the v19 row; the brief
  did not name it, but it specifies the journey's lines), `docs/COMMANDS.md`, `README.md`.
  *Checked:* `npm run smoke -w backend -- local`: 52 lines, 50 PASS and the 2 SKIP of
  `GlobalSignOut`.
- *Part B, the full regression.* On `slot-5min` as it is (`ffce069` with the changes of part
  A). `DYNAMODB_PORT=8002 npm run verify` at the root green: `shared/` 544 tests, the back end
  1 843 unit tests and its 215 journeys, the front end 2 775 unit tests, 100 % line coverage
  kept; then, apart, `RUN_INTEGRATION=1 npm run test:integration -w frontend`: 6 files, 79
  tests passed.
- *Part B, the walk.* `docs/FRONTEND_WALK.md` walked whole at 1280 × 800 and at a real
  390 × 844 viewport, in headless Chromium driven by a script outside the repository, on the
  stack restarted by the Product Owner and seeded: every check yes at both widths (the record
  and its exceptions in the walk's v7 row). **One defect found and fixed** with the Product
  Owner's agreement: at the phone width the four time lists of "This day only" were 47 pixels
  wide and cut their values; `frontend/style.css` gives the fields of a date's window at least
  9rem (`docs/FRONTEND_ARCHITECTURE.md` section 7.1). Not under `frontend/src`. After the fix,
  sections 4 and 11 walked again at both widths and `npm run verify -w frontend` green.
  Checks 102 and 169 of the walk corrected. Screenshots in the session's scratchpad.
- *Part B, the paid evaluation.* On the Product Owner's word, the stack restarted by them with
  the real key: `npm run assistant:eval -w backend -- --ceiling 4`, 59 of 59 passed, 117
  steps, 46.59 US cents, `claude-sonnet-5-5` at effort `low`. Read by hand: `step-pattern-new`
  proposed a Sunday pattern 14:05–16:35 from 2026-12-06, `step-block` that day's hours as
  09:00–10:10 and 10:35–13:00 with the afternoon kept; every minute kept.
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3 and its status line record the run.
- *Part C, the API.* On the Product Owner's word: the gate again at `259e0d6`, the deployment
  with a change set of 31 Modify, code only (the first attempt stopped before AWS for want of
  `AWS_PROFILE` in the operator's terminal), the smoke test against `shared-calendar-api` 52
  PASS, the log search clean. The record: `docs/RUNBOOK.md` section 5.9.
- *Part D, the page.* The gate again, `npm run deploy -w frontend` with no change to the
  hosting and its four checks PASS; the quick look by the Product Owner, seven yes. A first
  try with windows of 09:05–10:05 and 11:10–12:00 offered a User no slot, as R-SLOT-01 says;
  **the Product Owner then decided a new rule**, to be planned apart as the next release: a
  User books one hour that may start on any 5-minute step, the week shows each free stretch as
  one block with a start list in the book dialog, a window is never shorter than 60 minutes,
  and the windows already shorter are listed in the cloud before that release and removed by
  hand. Documents closed: `docs/RUNBOOK.md` section 5.9 (with F10, what to look for before a
  roll-back), `docs/ARCHITECTURE.md` v16, the status lines of `docs/SHARED_CALENDAR_SPEC.md`,
  `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md` and
  `docs/FRONTEND_ARCHITECTURE.md`, `README.md` section "Versions". Tag `v2.4.0` on the commit
  of this record, made locally; nothing pushed. Nothing changed under `shared/`, `frontend/src`
  or either `template.yaml` in this step.

## 6. Beside the mail work

`main` carries the mail work (`docs/EMAIL_PLAN.md`), whose release is v3.0.0. Its steps m1 to
m4 are on `main`, built for the local stack only: a new table, the mailer and changes to
`backend/template.yaml` that must not reach the cloud before its step m9.

- **The order, decided (open point O1, the Product Owner, 2026-11-25).** This plan is released
  first and alone, from the branch `slot-5min`, whose base (`b3c3425`) holds no code of the
  mail: the deployment changes the functions' code and nothing else. Its tag is `v2.4.0`.
  Merging `main` in before the release would deploy the mail's half-built resources, and the
  one evaluation over both changes of the assistant, the reason for merging first, cannot be
  had yet: the mail's tool comes in its step m6.
- **The merge follows the release**, in a session of its own, when the mail work's checkout of
  `main` has nothing uncommitted: `slot-5min` into `main`. **Files both touch.**
  `docs/ARCHITECTURE.md` (each adds a version row and edits section 4; this plan's row, v16,
  is closed by then and keeps its number, the mail's takes the next), `shared/src/api.ts`
  (the mail adds codes; this plan adds none), `README.md` section "Versions", `docs/RUNBOOK.md`
  section 5 (this plan's record comes first), `docs/FRONTEND_WALK.md` (this plan's section 11
  and checks 157 to 170 come first), `frontend/index.html`, `backend/scripts/smoke.sh`.
- **The assistant.** This plan's change of the assistant (step s3) is judged by its own paid
  run in step s6, part B. At the merge the lists of requests of the two branches are joined
  (`backend/tests/eval/requests.ts`), with the counts in
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3 and `docs/COMMANDS.md`; the mail's step
  m6 then runs the evaluation on code that holds both changes.
