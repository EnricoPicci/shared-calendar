## Brief

Implement plan step u3, "The back end" (`docs/CAPACITY_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review.

After this step the API built locally does what `docs/SHARED_CALENDAR_SPEC.md` v17 says about
the capacity of a type: a type is created and edited with a capacity, a slot says its capacity
and its places left, a booking or a change is refused `409 slot_taken` only when no place is
left and `409 user_busy` when the User already holds an appointment at that time, the
Administrator may go over the capacity with `overbook: true`, `busy` is the time that is full,
and the Administrator's view holds the full slots. The front end's services and screens (steps
u4, u5) and the assistant (step u6) are not started here. Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (handlers never import the AWS SDK; a new response field starts in
  `shared/`), "Cloud safety", "Comments" (the reference form), "Tooling and style" (100 % line
  coverage on `backend/src/lib`, `backend/src/assistant`, `shared/src` and `frontend/src`); then
  `backend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of `.claude/rules/` load when a file of
  their paths is read.
- `docs/CAPACITY_PLAN.md`, all of it: the decisions (section 2), the findings (section 3: F1 to
  F5, F7, F9, F10), the rules (section 4), **the "As done" note of step u2 and its "Step u3 finds
  ready"**, step u3, and steps u4 to u6 to see what this step must not take from them.
- `docs/SHARED_CALENDAR_SPEC.md` v17: decisions D24 to D31; the glossary rows "Capacity",
  "People in an interval", "Places left", "Free slot"; section 6.1 (R-TYPE-02, R-TYPE-05);
  **section 7, R-SLOT-02 to R-SLOT-06 and the worked example**; **section 8.2 (R-BOOK-07,
  R-BOOK-12, R-BOOK-13, the order of the checks)**; **section 8.4 (R-CHG-01, the order of the
  checks)**; R-VIEW-01; sections 11.1 to 11.6 (the 11.6 example byte for byte); 13.2; 18.1;
  **AC-37 to AC-44 of 18.3**.
- `docs/ARCHITECTURE.md`: the v15 row, section 4 (the paragraph "The capacity of a type" and the
  rows of the type, booking, change and view routes), section 5.3 (the `TYPE` item).
- The code: `shared/src/calendar/types.ts`, `rules.ts` (`slotsOf`, `overlaps`, `peopleIn`),
  `defaults.ts` (`TYPE_CAPACITY`), `schemas.ts`; `backend/src/lib/calendarRules.ts`
  (`checkBooking`, `checkChange`, `calendarView`), `backend/src/lib/calendarDb.ts` (the `TYPE`
  item); the handlers `createAvailabilityType.ts`, `renameAvailabilityType.ts`,
  `listAvailabilityTypes.ts`, `bookAppointment.ts`, `changeAppointment.ts`, `getCalendar.ts`;
  `backend/src/assistant/tools/getCalendar.ts` and `facts.ts`; their tests under
  `backend/tests/unit/`; `backend/tests/integration/calendar.test.ts` and its pages under
  `docs/journeys/backend/`, with `docs/journeys/concepts.md`.

## Where we are (2026-11-24)

- Steps u1 (`2f4ab56`) and u2 (`85e93dd`) are committed, not pushed. `shared/` holds
  `TYPE_CAPACITY`, `TypeBody.capacity`, `BookBody.overbook`, `ChangeBody.overbook`, the code
  `user_busy` and `peopleIn`. No handler reads them.
- **The root `verify` is red** on two back-end unit tests that compare the view with the example
  of `docs/SHARED_CALENDAR_SPEC.md` section 11.6, read from the document:
  `backend/tests/unit/lib/calendarView.test.ts` and
  `backend/tests/unit/handlers/getCalendar.test.ts`. The example has `"capacity": 1,
  "placesLeft": 1` on each slot; the back end does not produce them yet. This step turns them
  green, with no change to the example.
- **Known gap from step u2:** the schemas accept `capacity` and `overbook`, the handlers drop
  them; a User's `overbook: true` is not refused. This step closes it.
- A trial of the three response fields as required types (2026-11-24) broke the typecheck in:
  `shared/src/calendar/rules.ts` (`slotsOf` returns `Slot`), `backend/src/lib/calendarDb.ts`
  (three places), `backend/tests/unit/assistant/tools/tools.test.ts`, and eleven test files of
  the front end (`frontend/tests/unit/logic/fixtures.ts`, `week.model.test.ts`,
  `date.model.test.ts`, `date.screen.test.ts`, `availability.model.test.ts`,
  `availability.screen.test.ts`, `booking.test.ts`,
  `frontend/tests/unit/services/availability-types.service.test.ts`,
  `frontend/tests/unit/views/availability.view.test.ts`, `date.view.test.ts`, `shell.test.ts`).
  Nothing under `frontend/src` broke.

## Decided already (the Product Owner, 2026-11-24)

The decisions K1 to K8 and the findings F4 to F7 of `docs/CAPACITY_PLAN.md`, written into
`docs/SHARED_CALENDAR_SPEC.md` as D24 to D31; the two decisions of step u2 (the response fields
here; the gap accepted until here). Apply them; if the spec or the code proves one wrong, stop
and tell me before going on.

## Decided for this step (the Product Owner, 2026-11-24)

1. **The front end's test data follow the contract.** The three response fields are required,
   so this step adds `capacity: 1` and `placesLeft: 1` (or what a test needs) to the front end's
   **test fixtures only**, as far as its typecheck and tests ask. Nothing under `frontend/src`
   changes; what the page does with the fields is steps u4 and u5. Report each file touched.
2. **The assistant keeps today's behaviour.** Once the Administrator's view holds full slots
   (`docs/SHARED_CALENDAR_SPEC.md` decision D30), `backend/src/assistant/tools/getCalendar.ts`
   would list them as `freeSlots` and `facts.ts` would accept a booking into one. This step
   changes those two files only so that they take the slots with `placesLeft > 0`, with their
   tests: the assistant then sees exactly what it sees today. No change to its instructions,
   texts, marks, tools' descriptions or the fake Claude; capacity and `overbook` in the assistant
   are step u6. If anything else in `backend/src/assistant` would change what the assistant
   sees or does, stop and tell me.
3. **The architecture now, the spec at the release.** In this step `docs/ARCHITECTURE.md`
   section 4 describes the type, booking, change and view routes as the back end now runs them.
   `docs/SHARED_CALENDAR_SPEC.md` keeps its "not built yet" sentences and its status line until
   the release (step u7 of `docs/CAPACITY_PLAN.md`): until then no person can use the capacity.

## The step

1. **`shared/src/calendar/types.ts`:** `AvailabilityType.capacity`, `Slot.capacity`,
   `Slot.placesLeft`, required, with comments in the style of the others
   (`docs/SHARED_CALENDAR_SPEC.md` section 11.5, section 11.6, R-SLOT-02, decision D30). The
   comment on `CalendarDay.slots` and `busy` restated (the Administrator's full slots; `busy` as
   R-SLOT-06). `slotsOf` in `shared/src/calendar/rules.ts` returns the slot's times and type
   only (a type of its own, e.g. `Pick<Slot, 'start' | 'end' | 'typeId'>`): the capacity and the
   places left are the view's to add. Its tests keep passing.
2. **`backend/src/lib/calendarDb.ts`:** `capacity` written on the `TYPE` item at creation (the
   body's, or `TYPE_CAPACITY.default`) and at an edit only when the body has one; read back as
   `TYPE_CAPACITY.default` when the item has none (`docs/SHARED_CALENDAR_SPEC.md` section 13.2,
   `docs/CAPACITY_PLAN.md` F10). With `aws-sdk-client-mock` tests: an old item without the
   attribute, an edit without `capacity` not writing it.
3. **The type handlers** (`createAvailabilityType.ts`, `renameAvailabilityType.ts`: the file
   keeps its name, the route its path): the capacity of the body as R-TYPE-05 and section 11.4;
   the answers carry `capacity`. A lowered capacity touches no appointment (D28).
4. **`backend/src/lib/calendarRules.ts`:**
   - `checkBooking` and `checkChange`: R-BOOK-12 (`user_busy`, the target User's own active
     appointments, the old one of a change left out, never lifted), then R-BOOK-07 by `peopleIn`
     against the capacity of the effective window's type (`slot_taken`, lifted by `overbook` for
     the Administrator only), in the order of `docs/SHARED_CALENDAR_SPEC.md` sections 8.2 and
     8.4. `overbook: true` on a slot with a place left books as without it.
   - `calendarView`: each slot's `capacity` and `placesLeft` (`max(0, capacity − people)`); a
     User's slots: a place left, none of their own appointments overlapping (R-SLOT-03); the
     Administrator's: also the full ones with `placesLeft: 0` (R-SLOT-04, D30); `busy` as
     R-SLOT-06 (the capacity of the window there, 1 where none of an existing type holds the
     time; the User's own times taken out).
   - Unit tests for every rule id touched and for AC-37 to AC-44 at the level of the rules, with
     a fixed "now"; the 11.6 example byte for byte.
5. **`bookAppointment.ts` and `changeAppointment.ts`:** R-BOOK-13, a User sending `overbook:
   true` is `403 forbidden`, at the place of the order of sections 8.2 (step 2) and 8.4 (step 3);
   `overbook` passed to the rules; the handlers' tests for `user_busy`, `slot_taken` with and
   without `overbook`, and the 403. The log line stays without the note.
6. **The assistant**, decision 2 only.
7. **`backend/tests/integration/calendar.test.ts`:** a new `describe` for AC-37 to AC-44
   (three people into a capacity of 3, the fourth refused, the Administrator forcing, the same
   User twice refused even forced, a User's `overbook` 403, the peak of D25 with custom times,
   the capacity lowered under three people, a type created and renamed without `capacity`),
   leaving the calendar as the next journeys expect. An existing journey whose expectation
   changes with v17 (for example `busy` where two appointments touch, R-SLOT-06) changes only as
   far as the spec asks: report each one.
8. **The front end's test fixtures**, decision 1 only.
9. **Documents**, in the same change:
   - `docs/journeys/backend/`: a page for the new `describe` and a line in
     `docs/journeys/README.md`, written and checked with the project skill `explain-journey`;
     every changed journey's page brought up to date the same way; `docs/journeys/concepts.md`
     where an idea changes (slots and their places, `busy`).
   - `docs/ARCHITECTURE.md`: section 4, the rows of the type, booking, change and view routes as
     the back end now runs them, and the paragraph "The capacity of a type" brought in line;
     section 5.3 if the `TYPE` row needs it; step u3's sentence in the v15 row (still open).
   - `docs/SHARED_CALENDAR_SPEC.md`: only where the code proves it wrong or unclear, after
     telling me. Its "not built yet" sentences and status line stay (decision 3).
   - `docs/CAPACITY_PLAN.md`: an "As done" note under step u3 that ends with what step u4 finds
     ready, and the version line.

Not in this step: anything under `frontend/src`; the front end's services, screens, texts and
journeys' behaviour (`RUN_INTEGRATION=1 npm run test:integration -w frontend` must still pass
unchanged); the assistant beyond decision 2; `backend/template.yaml` (no new route, function,
role or permission: F1 to F10 say none is needed; if one seems needed, stop); the smoke test;
`README.md`, `docs/RUNBOOK.md`, `docs/FRONTEND_*`, `docs/CONVERSATIONAL_*`; any `aws` command;
the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing on a rule; an existing test whose
  expectation would change beyond what v17 asks; any change outside `shared/`, `backend/`,
  `docs/` and the front end's test fixtures; anything in the assistant beyond decision 2; a
  change to `backend/template.yaml`.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- After `npm run build -w backend`, restart `local:api`. The journeys empty the local `calendar`
  table.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step u4.

## Acceptance (`docs/CAPACITY_PLAN.md` step u3)

- The three response fields are in `shared/src/calendar/types.ts`, required, and the back end
  fills them in; the two tests of the 11.6 example pass with the example unchanged.
- The rules, the handlers and the journey cover R-BOOK-07, R-BOOK-12, R-BOOK-13, R-CHG-01's
  adjustments, R-SLOT-02 to R-SLOT-06, R-TYPE-05 and AC-37 to AC-44; 100 % line coverage kept.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root.
- **The root `DYNAMODB_PORT=8002 npm run verify` PASSED**, with `local:up` and `local:api`
  running (after a build and a restart of `local:api`); then, apart,
  `RUN_INTEGRATION=1 npm run test:integration -w frontend` passed.
- `git status` shows changes under `shared/`, `backend/` (not `template.yaml`), `docs/` and the
  front end's test fixtures only.
- The "As done" note holds the detail: each existing test or journey changed and why, each front
  end fixture touched, the assistant's two files. Then the short closing message, and suggest the
  commit.
