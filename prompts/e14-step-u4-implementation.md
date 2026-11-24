## Brief

Implement plan step u4, "The front end's services" (`docs/CAPACITY_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

After this step the front end's services speak the capacity's contract: the types' service sends
and receives a type's `capacity`, `AppointmentsService.book` and `change` pass `overbook`
through, and `user_busy` is a reason of both, with its sentence in `frontend/src/logic/texts.ts`.
The screens do not use any of it yet: what the page shows and offers (the places left, "Book
anyway?", the capacity field, the week's groups) is step u5. Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments", "Tooling and style" (100 % line coverage on
  `frontend/src`); then `frontend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of
  `.claude/rules/` load when a file of their paths is read.
- `docs/CAPACITY_PLAN.md`, all of it: the decisions (section 2), the findings (section 3), the
  rules (section 4), **the "As done" note of step u3 and its "Step u4 finds ready"**, step u4,
  and step u5 to see what this step must not take from it (the step u5 bullet on `user_busy`
  among them).
- `docs/SHARED_CALENDAR_SPEC.md` v17: decisions D24 to D31; R-TYPE-05; R-BOOK-07, R-BOOK-12,
  R-BOOK-13 and the orders of sections 8.2 and 8.4; sections 11.1, 11.4 to 11.6; **section 16**
  (the services, and 16.8, the needs of the views, which say what step u5 will ask of these
  services); AC-15 and AC-37 to AC-44.
- `docs/ARCHITECTURE.md` section 4: the rows of the type, booking and change routes and the
  paragraph "The capacity of a type", as the back end now runs them.
- `docs/FRONTEND_SERVICES.md`: sections 2, 3, 8 (the decisions), 10.2 (`apiCall`,
  `invalidRequest`), 14 (the tests, **14.4 the calendar journeys**), **16**
  (`AvailabilityTypesService`) and **19** (`AppointmentsService`); its status line, which holds
  the sentence "Not yet in line with the capacity of a type" that this step removes.
- `docs/FRONTEND_ARCHITECTURE.md`: section 5.1, the rows of `texts.ts` and the paragraph
  "Failures in plain words" (`failureText`), and how the screens call `create`, `rename`,
  `book` and `change` today.
- The code: `frontend/src/services/availability-types.service.ts` and `.types.ts`,
  `appointments.service.ts` and `.types.ts`, `api.ts`; `frontend/src/logic/texts.ts`; every
  caller of `create`, `rename`, `book` and `change` under `frontend/src/logic/`; their tests
  under `frontend/tests/unit/`; `frontend/tests/integration/calendar.test.ts` (blocks "types"
  and "appointments") with `local.ts`, and their pages under `docs/journeys/frontend/`, with
  `docs/journeys/concepts.md`.

## Where we are (2026-11-24)

- Steps u1 (`2f4ab56`), u2 (`85e93dd`) and u3 (`9e87417`) are committed. The local API runs the
  capacity: types carry `capacity`, slots `capacity` and `placesLeft`, `user_busy` comes before
  `slot_taken`, and a User's `overbook: true` is `403 forbidden`.
- `shared/` already requires `AvailabilityType.capacity`, `Slot.capacity`, `Slot.placesLeft`;
  `TypeBody` takes `capacity?` (1–100, `TYPE_CAPACITY`), `BookBody` and `ChangeBody` take
  `overbook?`; `user_busy` is an `ApiErrorCode`.
- Under `frontend/src` nothing changed yet: `AvailabilityTypesService.create(name)` and
  `rename(typeId, name)` send `{ name }` only; the booking codes of `appointments.service.ts`
  and `appointments.types.ts` do not hold `user_busy`, so today the service answers it as
  `unexpected`; `failureText` has no sentence for it.
- The front end's tests already carry `capacity: 1` and `placesLeft: 1` in their fixtures (step
  u3), and its journeys pass, the "calendar view" block comparing the two fields.

## Decided already (the Product Owner)

The decisions K1 to K8 and F4 to F7 of `docs/CAPACITY_PLAN.md`, written into
`docs/SHARED_CALENDAR_SPEC.md` as D24 to D31, and the decisions of steps u2 and u3 (AC-15 answers
`user_busy`; on `user_busy` the page will name the appointment in the way and point to changing
it, in step u5). Apply them; if the spec or the code proves one wrong, stop and tell me.

## Decided for this step (the Product Owner, 2026-11-24)

1. **The type calls take the capacity as an optional extra value:** `create(name, capacity?)`
   and `rename(typeId, name, capacity?)`. The methods keep their names, as the route keeps its
   path. A `capacity` left out is not sent, so a new type gets 1 and an edited type keeps its
   own (`docs/SHARED_CALENDAR_SPEC.md` decision D28); today's callers keep working unchanged.
   Each `pending` state carries the `capacity` given.
2. **The sentence of `user_busy`:** "You already have an appointment at this time. To move it,
   change that appointment instead." The Administrator also meets `user_busy` when booking for a
   User; if `failureText` can tell who attempted (as it does for other codes), the
   Administrator's sentence is "This User already has an appointment at this time." Step u5 will
   add the name of the appointment in the way.
3. **The sentence of `slot_taken` changes** to: "This time is full: there is no place left. The
   calendar has been refreshed: please choose another time." It holds for a capacity of 1 and
   above.

## The step

1. **Read the decisions of this step** (section above) and apply them as written.
2. **`AvailabilityTypesService`:** `capacity` sent on create and edit, as decided; checked
   before sending with `TypeBody` (a capacity of 0, 101 or 2.5 is `invalid_request` with no
   request); the answer's `type` and `types` checked as today, the `capacity` passed through.
3. **`AppointmentsService`:** `overbook` in `book` and `change` passed through as the caller
   gives it (absent stays absent); `user_busy` among the codes of both routes and in the reason
   types; the `403` of a User's `overbook` is `forbidden`, already a reason.
4. **`frontend/src/logic/texts.ts`:** the sentences of `user_busy` and `slot_taken`, decisions 2
   and 3. No other change under `frontend/src/logic` or `frontend/src/views`, except what the
   typecheck asks of a caller, with no change of what the screen does. If a screen would have to
   behave differently, stop and tell me.
5. **Unit tests:** the per-method suites of `docs/FRONTEND_SERVICES.md` section 14.1 for what
   changed: `capacity` sent, left out, refused before sending; `overbook` sent as `true`, `false`
   and absent; `user_busy` as a reason of `book` and `change` and `unexpected` where a route does
   not answer it; the sentence in `texts.ts`'s tests. 100 % line coverage on `frontend/src` kept.
6. **The front end's journeys** (`frontend/tests/integration/calendar.test.ts`): in the block
   "types", a type created with a capacity of 2 and edited by name only keeps 2; in the block
   "appointments", a User booking over its own appointment gets `user_busy`, a User's
   `overbook: true` gets `forbidden` with no appointment written, and the Administrator books a
   full slot with `overbook: true`. They follow the journeys' rules: the table is never reset,
   the block's own types, dates and accounts, everything cleaned up
   (`docs/FRONTEND_SERVICES.md` section 14.4). Each changed block's page under
   `docs/journeys/frontend/` brought up to date with the project skill `explain-journey`
   (a block without a page gets none in this step: say which).
7. **Documents**, in the same change:
   - `docs/FRONTEND_SERVICES.md`: a new version (v12) in the status line and the change log; the
     sentence "Not yet in line with the capacity of a type" removed; sections 16 and 19 (the
     calls, the types, validation, the unit tests), section 8 (decision 1 above as a decision of
     the services), section 14.4 (the journeys' rows).
   - `docs/FRONTEND_ARCHITECTURE.md`: only the sentences that list `failureText`'s codes, if one
     does; its status sentence on the capacity stays until step u5.
   - `docs/ARCHITECTURE.md`: step u4's sentence in the v15 row (still open).
   - `docs/SHARED_CALENDAR_SPEC.md` section 16: only where the services as built prove it wrong,
     after telling me.
   - `docs/CAPACITY_PLAN.md`: an "As done" note under step u4 that ends with what step u5 finds
     ready, and the version line.

Not in this step: what any screen shows or offers (the places left, the full slots, "Book
anyway?", the capacity field of the types' form, the week's side-by-side blocks, the naming of
the appointment on `user_busy`): step u5. The assistant's panel and `backend/src/assistant`:
step u6. Anything under `backend/` or `shared/src` (if the contract seems to need a change, stop);
`docs/FRONTEND_WALK.md` beyond the checks that quote the sentence of `slot_taken` (they change
with it, in the same commit; the views' tests that quote it too); `README.md`, `docs/RUNBOOK.md`, `docs/CONVERSATIONAL_*`; any `aws`
command; the cloud; `npm run deploy`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing; a screen whose
  behaviour would change; any change outside `frontend/src/services`, `frontend/src/logic/texts.ts`,
  `frontend/tests` and `docs/`; a change the contract in `shared/` would need.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- The local stack: `local:up` and `local:api` running; the back end's journeys empty the local
  `calendar` table, so run the front end's journeys after them, never at the same time.
- Commit only when asked. Do not push. Do not start step u5.

## Acceptance (`docs/CAPACITY_PLAN.md` step u4)

- `AvailabilityTypesService` sends `capacity` when given and checks it before sending;
  `AppointmentsService` passes `overbook` through and answers `user_busy` as a reason of `book`
  and `change`; `failureText` has its sentence. No screen behaves differently.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; 100 % line
  coverage on `frontend/src`.
- **The root `DYNAMODB_PORT=8002 npm run verify` PASSED** with `local:up` and `local:api`
  running; then, apart, `RUN_INTEGRATION=1 npm run test:integration -w frontend` passed with the
  new checks.
- `git status` shows changes under `frontend/src/services`, `frontend/src/logic/texts.ts` (and a
  caller only if the typecheck asked), `frontend/tests` and `docs/` only.
- The "As done" note holds the detail: the three decisions as applied, each test and journey changed or
  added, each page refreshed. Then the short closing message, and suggest the commit.
