## Before opening the new session (operator)

This step changes the page: the four window forms, their logic and their tests, one front-end
journey and the documents of the front end. Its check runs that one journey and a look at one
width, so it needs **the local stack of this worktree**, started on your go-ahead, and **no AWS
login and no Anthropic key**. In the worktree `shared-calendar-slot-5min` (branch `slot-5min`),
run `nvm use`, then open the session. The session asks before it starts, stops or restarts the
stack; if you prefer to run `local:api` yourself, say so.

## Brief

Implement step w4, "The page: the end chosen as an hour", of `docs/WINDOW_HOURS_PLAN.md`,
following CLAUDE.md's working rhythm: one step, its check, an honest report, then stop for
review.

After this step, the end of a window in the page's four window forms is chosen as an hour
only: its minute is the start's. Those forms are the pattern's form and its change dialog, "This
day only" and "Extra windows". A window that is not whole hours can then hardly be entered. If
one still reaches a model, the model refuses it through the shared rule, in the words of the end's
label. The book dialog does not change. A User's booking at 08:15 in a window that starts on the
hour is `409 outside_availability`, and the front end's journey says so. **Nothing is deployed:**
the release is step w5.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Comments",
  "Tooling and style" (100 % line coverage on `frontend/src`), "What goes wrong most often" (the
  back end's journeys empty the `calendar` table; restart the stack, then `seed:local`, before a
  look); then `frontend/CLAUDE.md` and `.claude/rules/` files that load with the views.
- `docs/WINDOW_HOURS_PLAN.md`: section 2 (decisions 1, 5 and 6, Q1a, Q4a); section 3, **F3, F4,
  F5, F9 and F11**; section 5's opening ("How a step is checked"); **step w4**; the "As done"
  notes of steps w2 and w3 (what this step finds ready: `lastsWholeHours` exported from
  `@shared-calendar/shared`, the shared sentence, the front-end files w2 left); step w5, to see
  what this step must not take from it.
- `docs/SHARED_CALENDAR_SPEC.md`: decision D33, section 6.2 (no start after 23:00), 16.8 (the
  rows of the window forms, "not built yet"), the status line.
- `docs/FRONTEND_ARCHITECTURE.md`: the status line and the version table; section 4 (a time as
  two lists), 5.1 (the row of `times.ts`), 11, decisions 195 to 200.
- `docs/FRONTEND_WALK.md`: section 11 (checks 157 to 170), check 87, the version table.
- `docs/FRONTEND_SERVICES.md`: decision 42 and section 19 (`AppointmentsService`), where they
  name a User's "whole-hour" times; the status line.
- The code: `frontend/src/logic/times.ts` (`MINUTES`, `minutesOf`, `WINDOW_HOURS`, `LAST_TIME`,
  `windowHours`, `endFor`); `frontend/src/views/time.parts.ts` (`timeLists`, `startSetsEnd`);
  `availability.view.ts` and `date.view.ts` (where they offer `WINDOW_HOURS` and call
  `startSetsEnd`); `frontend/src/logic/availability.model.ts` (`END_NOT_LATER`, `patternFor`) and
  `date.model.ts` (`fieldRefusals`, used by `draftAdd` and `windowFor`); the week's book dialog,
  to leave it as it is; `frontend/src/services/appointments.service.ts` (its comment on a User's
  "whole hours"); their unit tests under `frontend/tests/unit/logic` and `views` (`times.test.ts`,
  `availability.model.test.ts`, `date.model.test.ts`, `time.parts.test.ts`,
  `availability.view.test.ts`, `availability.parts.test.ts`, `date.view.test.ts`,
  `shell.test.ts`); `frontend/tests/integration/calendar.test.ts`, block "appointments", the test
  "starts off the whole hour", with its page `docs/journeys/frontend/calendar-appointments.md`.

## Where we are (2026-11-25)

- `v2.4.0` is deployed from this branch and tagged locally (`042142e`); nothing pushed.
- Steps w1 and w2 are committed (`571ad49`) and step w3 too (`c20fe22`, plan v4). The server
  refuses a window not whole hours with `400 invalid_request`, "Invalid input: end", and a User's
  start that is not a slot with `409 outside_availability`. The assistant knows the rule; its
  paid run waits for step w5.
- Step w2 changed front-end unit tests in three files, in their examples only (`times.test.ts`,
  `availability.model.test.ts`, `shell.test.ts`), and nothing under `frontend/src`; this step
  rewrites them as the new lists require.
- `docs/ARCHITECTURE.md` holds a v17 row, open, whose number the merge with `main` may change.

## Decided already (the Product Owner, 2026-11-25)

Decisions 1 to 8, Q1 to Q8, Q1a and Q4a of `docs/WINDOW_HOURS_PLAN.md` section 2. Apply them; if
the code or a test proves one wrong, stop and tell me before going on. For this step:

1. **The end's lists (decision 6, F4).** In the four window forms the end's minute list holds
   one value, the start's minute: it shows it and offers no other. The end's hours are those
   after the start's hour, up to 23, and 24 only when the start's minute is 00. A start chosen
   by the person still sets the end one hour later (`endFor`, unchanged). A change of the
   start's minute alone keeps the end's hour and gives it the new minute (08:05–11:05, the start
   changed to 08:30: 08:30–11:30), so the length chosen stays; when that hour is no longer
   offered, the end is one hour after the start (the Product Owner, 2026-11-25).
2. **The start's lists (F3).** In a window form the start's hour 23 offers the minute 00 only,
   as the hour 24 of an end does today; every other hour keeps its twelve minutes.
3. **The rule is written once (F2).** `patternFor` and `fieldRefusals` refuse a window not whole
   hours through `lastsWholeHours` of `shared/`, after the order check and only when it passed,
   with the sentence "End must be a whole number of hours after Start." under the end. The lists
   make it rare; the shared rule keeps it.
4. **The book dialog is unchanged** (`windowHours`, all twelve minutes, the Administrator's
   custom times): only the four window forms change.
5. **A stored window not whole hours, opened in a form** (the Product Owner, 2026-11-25). The check
   of step w5 deletes every such window before the release, so this should not happen. If it
   does, the form shows the window as stored, 08:30–09:45 with its end's minute 45 shown, and a
   save is refused with the sentence of point 3 above. The Administrator sees the real end and fixes
   it. The end is never corrected without a word.
6. **The journey (F5).** In the test "starts off the whole hour", the User's 08:17 keeps
   `invalid_request` (off the step) and the case 08:15 is added, `outside_availability` (on the
   step, no slot). Rename it to say both, and change its page in the same change.

## The step

1. **`frontend/src/logic/times.ts`:** what a window form offers, pure. The start's minutes for
   an hour, 00 only in hour 23. The end's hours and its one minute for a start. `endFor`
   unchanged. Keep `WINDOW_HOURS` only if something still needs it.
2. **`frontend/src/views/time.parts.ts`, `availability.view.ts`, `date.view.ts`:** the end's
   lists follow the start in the four window forms. That covers a choice by the person (hour or
   minute of the start), a form filled by the script, and a dialog opened on a pattern. A value
   set by the script still sends no `change` (decision 197). The book dialog keeps
   `timeLists` as it is. If `timeLists` needs a second way of offering minutes, give it as a
   parameter; do not copy it.
3. **`availability.model.ts` and `date.model.ts`:** the refusal of point 3 of "Decided already", one constant
   beside `END_NOT_LATER`.
4. **Unit tests**, 100 % line coverage kept on `frontend/src`; only the cases the rule adds or
   moves:
   - logic: a start 08:05 gives the end 09:05 and one minute, 05; the end's hour 12 gives 12:05,
     the start kept; the start's minute changed from 05 to 30 moves the end's minute; a start
     in hour 23 offers 00 only, its end 24:00; a start 08:00 offers the end's hour 24, a start
     08:05 does not; the refusal of 09:05–10:30 under the end, said once after an end before the
     start;
   - views: the four forms' lists after a choice of the start's hour and of its minute; a
     pattern's dialog opened on 08:05–12:05 shows it as it is, and one opened on 08:30–09:45 shows
     09:45 and is refused at the save (point 5 of "Decided already"); a change of the start's
     minute alone keeps the end's hour (point 1); the book dialog still offers all twelve
     minutes;
   - the tests step w2 changed in their examples only (`times.test.ts`,
     `availability.model.test.ts`, `shell.test.ts`): rewrite them for the new lists, or keep
     what still holds.
5. **The journey:** `frontend/tests/integration/calendar.test.ts`, point 6 of "Decided already", with its page
   `docs/journeys/frontend/calendar-appointments.md`, written and checked with the project skill
   `explain-journey`. That page's table of the day (a slot "is a whole hour") and its "Test 3"
   say what holds now.
6. **Documents**, in the same change:
   - `docs/FRONTEND_ARCHITECTURE.md`: a version row (v25); section 4 (the end's lists in the
     window forms); the row of `times.ts` in 5.1; a decision after 200 for the end's lists and
     the start's hour 23 (F3, F4); the status line.
   - `docs/FRONTEND_WALK.md`: the checks of F11 rewritten, numbers kept, **no check added**
     (170 checks). 87 becomes 12:00 to 14:00, which still overlaps. 157 says the end's minute is
     shown and is not a choice. 158, 159, 160 to 168 and 170 are on a Sunday pattern 08:05–12:05,
     whose slots are 08:05, 09:05, 10:05 and 11:05; 168 gains alice booking the one slot left
     free. Add a version row.
   - `docs/FRONTEND_SERVICES.md`: decision 42, section 19 and the line near
     "`appointmentId: expected a ULID`" where they name a User's whole-hour times (a User's start
     is a slot's start, decided by the server); the status line's sentence of step w1 replaced
     (no service changes; the page's part built in step w4).
   - `frontend/src/services/appointments.service.ts`: its comment, the same correction, in plain
     words (`.claude/rules/comments.md`).
   - `docs/SHARED_CALENDAR_SPEC.md`: 16.8 no longer "not built yet" for the window forms; the
     status line (the page's part built).
   - `docs/ARCHITECTURE.md`: this step's sentence in the open v17 row.
   - `docs/WINDOW_HOURS_PLAN.md`: the two decisions of this brief (the end's hour kept, a stored
     window shown as stored) in section 2, beside decision 6 of the plan; an "As done" note under
     step w4, ending with what step w5 finds ready; the version line.

Not in this step: any file under `backend/` or `shared/`; the assistant; `backend/scripts/smoke.sh`;
`docs/RUNBOOK.md` (section 5.10 is step w5's); `README.md`; `docs/CONVERSATIONAL_ARCHITECTURE.md`;
the records of finished work (`docs/SLOT_STEP_PLAN.md`, the old briefs); any `aws` command; the
cloud; a deploy; the full regression (`verify`, every journey, the whole walk).

## How we work in this step

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do.
- **The pauses:** the plan, the spec or the code disagreeing on a rule. Any change the step seems
  to need in a file listed under "Not in this step". A front-end test that fails on something
  other than its example. **Before starting, stopping or restarting the local stack:** ask me
  first.
- **The check:** `npm run typecheck`, `npm run lint` and `npm run test:unit` at the root; then,
  on the local stack after my go-ahead, the front end's changed journey alone:
  `RUN_INTEGRATION=1 npm run test:integration -w frontend -- tests/integration/calendar.test.ts -t '<describe>'`.
  Then a restart of the stack, `seed:local`, `npm run dev -w frontend`, and **a look at 1280 wide**
  in Chrome as admin and alice. Five checks of the walk as rewritten: 158 and 159 (the end's
  lists), 160 (a Sunday pattern 08:05–12:05 saved), 163 (its four slots in the week), 168
  (alice books 11:05). Remove what the look made, or say what is left.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- Commit only when asked. Do not push. Do not start step w5.

## Acceptance (`docs/WINDOW_HOURS_PLAN.md` step w4)

- In the four window forms the end is chosen as an hour, its minute the start's. The start's
  hour 23 offers 00 only. A start chosen sets the end one hour later. The book dialog is
  unchanged.
- `patternFor` and `fieldRefusals` refuse 09:05–10:30 through `lastsWholeHours`, with "End must
  be a whole number of hours after Start.", said once.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept. The front end's changed journey passes alone (08:17 `invalid_request`, 08:15
  `outside_availability`), and its page follows.
- The five checks of the look are yes at 1280 wide.
- `docs/FRONTEND_ARCHITECTURE.md` v25, `docs/FRONTEND_WALK.md` (170 checks), the corrected
  lines of `docs/FRONTEND_SERVICES.md`, 16.8 and the status line of
  `docs/SHARED_CALENDAR_SPEC.md`, the v17 row of `docs/ARCHITECTURE.md` and the plan's "As done"
  note hold the detail.
- `git status` shows changes under `frontend/src`, `frontend/tests`, `docs/` and this brief
  only.
- Then the short closing message, and suggest the commit.
