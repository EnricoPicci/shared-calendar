# Shared Calendar: times on 5-minute steps, and "from" drives "to" (implementation plan)

**Version:** v2 (2026-11-25): steps s1 with s2 and s4 with s5 are built as pairs, one brief,
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

  **Proposed:** one constant for the step, in `shared/src/calendar/defaults.ts`, read by all of
  them, and `isOnQuarterGrid` renamed after what it checks. Two copies of `GRID = 15` in the
  front end and a third number in the back end are how a step ends up different in two places.
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
  A block drawn taller than its time may reach over the start of the next one; step s5 decides
  what is drawn then (proposed: the next block is drawn on top from its own start, so the
  short one keeps at least its true height visible) and shows it to the Product Owner.
- **F8. Two short lists change the book dialog.** Today the dialog offers exactly the times
  of the slot's window: nothing outside it can be chosen. With a list of hours and a list of
  minutes, a pair outside the window can be put together (window 08:05 to 12:00, hour 08,
  minute 00). **Proposed:** the hours are those the window touches; the minutes are all
  twelve; a pair outside the window is refused by the server with `outside_availability`,
  which the dialog already says in plain words: whether a booking is allowed stays the
  server's to say (`docs/FRONTEND_SERVICES.md` section 8, decision 42). An end not after the
  start is refused by the shared schema before anything is sent, as today in the window forms.
  With the hour 24 the list of minutes holds only 00. S3's "the end of the window" is computed
  from the window, not from a list.
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
- The proposals of F1, F7 and F8 are put to the Product Owner at the start of the pair's
  brief, before anything is written, and written as decided.

**Check:** `npm run lint`; a changed diagram is rendered on a dark page
(`.claude/rules/diagrams.md`). No stop: step s2 follows, and the review is of both.

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
- **The paid evaluation**, only on the Product Owner's word in the request of this step, the
  cost said first: `npm run assistant:eval -w backend` on the local stack wired to the real
  model. Its result is written into `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: the instructions of section 7.3, the tools of
  section 8, the evaluation's count of requests, a new version row.

**Check:** the short check; the assistant's journeys on the fake Claude; the evaluation's
result, read by hand for the two new requests.

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

### Step s5 — The week: a short appointment (a pair with s4)

- `frontend/src/logic/week.model.ts`: a block's height is at least 15 minutes' worth (S7);
  what is drawn when the next block starts inside that height, as decided at the start of
  the first pair (F7).
  The block that groups four or more appointments and the lanes side by side follow the same
  rule.
- Its unit tests; `docs/FRONTEND_ARCHITECTURE.md`; a check in `docs/FRONTEND_WALK.md` (an
  appointment 10:10 to 10:15 that can be read and opened, beside one that starts at 10:15).

**Check, for the pair, then the stop:** the short check; the front end's journeys if one
changed; a look, in a browser on the local stack after `seed:local`, on a desktop width and a
phone width: the three places that choose a time, with "from" driving "to", and the week with
a 5-minute, a 10-minute and a 15-minute appointment made there, alone and one after the other.

### Step s6 — The release

Nothing here is run without an explicit instruction in the request of the step (root
`CLAUDE.md`, "Cloud safety").

- **A.** `backend/scripts/smoke.sh`: in the calendar's journey, the Administrator books a
  5-minute time and a time off the step is refused. Run locally
  (`npm run smoke -w backend -- local`).
- **B.** The branch brought in line with `main` (section 6). The full regression: the root
  `DYNAMODB_PORT=8002 npm run verify`, every journey, `docs/FRONTEND_WALK.md`, the smoke test.
- **C.** The API deployed, the smoke test there; then the page; a look by the operator.
- **D.** The documents closed: the status lines, `docs/RUNBOOK.md` section 5 (a new record,
  with F10), `README.md` section "Versions", the tag.

**Check:** B green before C; the smoke test green in the cloud; the operator's look.

## 6. Beside the mail work

`main` carries the mail work (`docs/EMAIL_PLAN.md`), whose release is v3.0.0.

- **Files both touch.** `docs/ARCHITECTURE.md` (each adds a version row and edits section 4),
  `shared/src/api.ts` (the mail adds codes; this plan adds none, so no conflict is expected
  there), `backend/template.yaml` (this plan does not touch it), `README.md` section
  "Versions", `docs/RUNBOOK.md` section 5, `docs/FRONTEND_WALK.md`, `frontend/index.html`.
  The version row and the number of the RUNBOOK's record are given at the merge, not before.
- **The assistant.** The mail's step m6 also changes the instructions and runs the paid
  evaluation. Whichever of the two is merged second runs the evaluation again on the merged
  instructions; released together, one run serves both.
- **Open point O1, for step s6: the order and the tag.** Released before the mail's first
  deploy, this is `v2.4.0`. Released after it, it is `v3.1.0`. The Product Owner decides at
  step s6, when the state of the mail work is known.
