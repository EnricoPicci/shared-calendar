## Brief

Implement plan step u6, "The assistant" (`docs/CAPACITY_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review.

After this step the assistant knows the capacity of a type (`docs/CAPACITY_PLAN.md` K7): it reads
the places left of a slot, creates and edits a type with a capacity, books several people into
one slot in one proposal while they fit, and proposes to the Administrator a booking or a change
over the capacity, the proposal saying so. The paid evaluation with the real model is run once.
Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments", "Tooling and style" (100 % line coverage on
  `backend/src/assistant`, `shared/src` and `frontend/src`); then `backend/CLAUDE.md`,
  `shared/CLAUDE.md` and `frontend/CLAUDE.md`. The rules of `.claude/rules/` load when a file of
  their paths is read.
- `docs/CAPACITY_PLAN.md`, all of it: the decisions (section 2, **K7**), the findings (section
  3, **F2, F5 and F8**), **the "As done" notes of steps u3 and u5 and "Step u6 finds ready"**,
  step u6, and step u7 to see what this step must not take from it.
- `docs/SHARED_CALENDAR_SPEC.md` v17: decisions D24 to D31; R-TYPE-02, R-TYPE-05; R-SLOT-02 to
  R-SLOT-06; R-BOOK-07, R-BOOK-12, R-BOOK-13, R-CHG-01; section 11.6.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: its status line (the sentence "Not yet in line with the
  capacity of a type", which this step removes); section 3 (the tools); 4.3 (the version mark);
  **5.5** (the rules of a proposal, **rule 4**); 6.1; 7.3 (the instructions); 8 (the tools, 8.3
  what the model sees); 12.1 and 12.2 (the fake Claude, the journeys); **12.3** (the
  evaluation); 13 (the panel).
- `docs/COMMANDS.md`, the sections on `local:up` with `ANTHROPIC_API_KEY` and on
  `npm run assistant:eval -w backend`.
- `docs/journeys/README.md` and the pages `docs/journeys/backend/assistant-*.md`; the project
  skill `explain-journey`.
- The code: `backend/src/assistant/` (`exchange.ts`: the subjects and `same_thing_twice`;
  `prompt.ts`: `INSTRUCTIONS` and `promptVersion`; `tools/facts.ts`: `freeSlotAt`,
  `slotSubject`; `tools/getCalendar.ts`, `listTypes.ts`, `result.ts` (`typeForModel`),
  `bookAppointment.ts`, `changeAppointment.ts`, `createType.ts`, `renameType.ts`, `list.ts`,
  `changeHandlers.ts`); `shared/src/assistant/texts.ts`, `texts.en.ts`, `texts.it.ts`;
  `shared/src/calendar/rules.ts` (`peopleIn`); `frontend/src/logic/assistant.model.ts`
  (`outcomeWords`) and `assistant.screen.ts`, `frontend/src/views/shell.ts` (how the panel is
  built); `backend/tests/unit/assistant/`, `backend/tests/integration/assistant.test.ts`,
  `backend/tests/integration/fake-claude/answers.json`, `backend/tests/eval/`.

## Where we are (2026-11-24)

- Steps u1 (`2f4ab56`), u2 (`85e93dd`), u3 (`9e87417`), u4 (`68d9e90`) and u5 (`41a280c`) are
  committed, not pushed. The local API and the page run the capacity.
- The assistant is as it was, with two filters added at step u3: `get_calendar` gives Claude
  only the slots with a place left as `freeSlots`, and `freeSlotAt` finds a slot only among
  them. It says nothing of a capacity or of places left; `create_type` takes a name only;
  `rename_type` a name only; no tool sends `overbook`; rule 4 refuses two changes of one answer
  into the same slot (`slotSubject`), which was right when a slot held one person.
- The panel words a refused change with `failureText(action.error)`, without the role: the
  Administrator reads the User's sentence of `user_busy`, and the sentence of `slot_taken` says
  "The calendar has been refreshed", which the panel does not do.

## Decided already (the Product Owner)

The decisions K1 to K8 and F4 to F7 of `docs/CAPACITY_PLAN.md`, written into
`docs/SHARED_CALENDAR_SPEC.md` as D24 to D31, and the decisions of steps u2 to u5. Apply them;
if the spec or the code proves one wrong, stop and tell me.

## Decided for this step (the Product Owner, 2026-11-24)

1. **Over the capacity: an input the Administrator's request sets, one proposal.**
   `book_appointment` and `change_appointment` gain, for the Administrator only (the input
   schema differs by role, as `username` does), an optional boolean `overbook`. Its description
   says: set it only when the person asked to go over the capacity of a full time; never on
   your own. Without it a full slot is refused at the proposal, as today (`no_free_slot`, its
   message saying the time is full, for the Administrator "full; it can be booked over the
   capacity if the person asks"). With it a full slot (`placesLeft` 0, which the Administrator's
   view holds) is accepted, the route is called with `overbook: true`, and the proposal's
   sentence, written by the server (`shared/src/assistant/texts.en.ts` and `texts.it.ts`), says
   so: "… (Swimming Pool). Over the capacity: it will hold 4 people, its capacity is 3." The
   people it will hold are counted with `peopleIn` of `shared/` on the Administrator's view of
   that day, plus one, so a time already over its capacity says its true number. `overbook`
   on a slot with a place left is not an error: it is sent, and the sentence says nothing more.
   A User's input has no `overbook`.
   **One person, one place, at the proposal:** when the Administrator books for a User, or
   moves a User's appointment, and that User holds another active appointment overlapping the
   time (the moved one left out), the proposal is refused at once with the code `user_busy` and
   a message naming that appointment's time and type, read from the same `GET /calendar` the
   facts already ask for (the Administrator's view holds every appointment). For a User the
   slot is not offered, as today.
2. **Rule 4, the same slot: count the places.** Several changes of one answer into one slot
   (bookings and moves into it) are proposed while they fit its places left; the first that
   does not fit, and every one after it, is refused with `same_thing_twice` and a message that
   says how many places were left. The same User twice in one slot in one answer is refused the
   same way. A change the Administrator marked `overbook` is not counted against the places. A
   move out of a slot does not free a place for another change of the same answer (keep it
   simple: the places left are those the read gave). Every other subject of rule 4 (the same
   appointment, type, pattern, date, window) is unchanged.
3. **The type tools: `create_type` with a capacity, `rename_type` becomes `edit_type`.**
   `create_type` takes an optional `capacity`, 1 to 100 (`TYPE_CAPACITY` of `shared/`), 1 when
   not given; its sentence says the capacity when it is above 1 ("Create the appointment type
   "Yoga", for 8 people at the same time."). `edit_type` takes the `typeId` and a new `name`, a
   new `capacity`, or both, at least one; a value equal to the present one counts as not given,
   and nothing left to change is refused as `rename_type`'s `name_unchanged` is today (one code
   for both, say which). Its sentence says each change ("Change the appointment type "Swimming
   Pool": capacity from 3 to 5."; with a lower capacity than the people already booked, it adds
   that nobody is cancelled, `docs/SHARED_CALENDAR_SPEC.md` R-TYPE-05). The route's body sends
   only what changes (absent `capacity` keeps the stored one, `docs/SHARED_CALENDAR_SPEC.md`
   R-TYPE-02). `list_types` and the type in a result (`typeForModel`) give `capacity`. Only the
   assistant's tool is renamed: the route, its handler `renameAvailabilityType.ts`, the
   database's functions and the page keep their names. The fake Claude's answers, the
   evaluation's requests and the journey pages follow the new name.
4. **The paid evaluation is run once in this step, with `--ceiling 1`** (US$1), after the free
   checks pass. A run cost about US$0.40; with the capacity requests about US$0.50 is expected.

## Decided in preparing this brief (yours to change when you read it)

5. **What `get_calendar` gives.** A free slot stays a time, as Claude books it; when its type's
   capacity is above 1 the time is followed by its places, the way " (second)" already is:
   `"10:00 (2 of 3 places left)"`. A window gives its type's `capacity`. The Administrator also
   gets, per day, `fullSlots`: the times of the full slots, which only `overbook` can book.
   The tool's description says what the brackets mean and that the time alone is what
   `book_appointment` takes. A User never learns who holds the other places
   (`docs/SHARED_CALENDAR_SPEC.md` D29 and R-SLOT-06).
6. **The panel's outcome line knows the role.** `failureText` is told the role in the panel too
   (`AssistantScreen` gets it as `WeekScreen` does, from the shell), so that the Administrator
   reads "This User already has an appointment at this time." for `user_busy`, and, for
   `slot_taken`, the Administrator's "This time is full: there is no place left." of step u5
   (`FULL_FOR_ADMIN`), without "refreshed", in the panel only; a User's `slot_taken` in the
   panel keeps its sentence. The panel offers no "Book anyway": the conversation does
   (decision 1).
7. **The instructions** (`prompt.ts`) gain a short paragraph: a type holds a number of people
   at the same time; a slot with places left can be booked by several people; when the person
   asks for a full time, say it is full and, for the Administrator only, that it can be booked
   over the capacity if they want, and use `overbook` only after they say so; a User never holds
   two appointments at the same time, forced or not. The mark changes (section 4.3), which ends
   the open conversations of the local stack: expected.

## The step

1. **`shared/src/assistant`:** the sentences of decisions 1 and 3 in both languages (the
   formal "lei" in Italian), with their tests.
2. **`backend/src/assistant/tools`:** decisions 1, 3 and 5 (`facts.ts`, `getCalendar.ts`,
   `listTypes.ts`, `result.ts`, `bookAppointment.ts`, `changeAppointment.ts`, `createType.ts`,
   `editType.ts` in the place of `renameType.ts`, `list.ts`, `changeHandlers.ts`).
3. **`backend/src/assistant/exchange.ts`:** decision 2, in the simplest shape (the facts of a
   booking or a move carry the slot's places left and the User; the subjects become a count).
4. **`prompt.ts`:** decision 7.
5. **`frontend/src/logic/assistant.model.ts`, `assistant.screen.ts`,
   `frontend/src/views/shell.ts`:** decision 6, with their tests.
6. **Unit tests**, 100 % lines: the `overbook` input refused in a User's request and accepted in
   the Administrator's; a full slot refused without it and proposed with it, the sentence with
   the people counted (a full slot, one already over, one with a place left); `user_busy` at the
   proposal for a booking and a move, the moved appointment left out, touching not overlapping;
   rule 4 (two into two places left; three into two; the same User twice; an overbooked one not
   counted; another slot not affected); `create_type` with and without a capacity, its bounds;
   `edit_type` with a name, a capacity, both, nothing that changes, a type not found, a name
   taken; `get_calendar`'s places, capacity and `fullSlots` for both roles, a capacity of 1
   unchanged; the panel's sentences for both roles.
7. **The journeys** (`backend/tests/integration/assistant.test.ts`, the fake's `answers.json`):
   every journey that names `rename_type` follows the new name; new journeys, against the fake:
   two Users booked into one slot of a type of capacity 2 in one proposal; the Administrator's
   booking of a full time refused, then proposed with `overbook` and confirmed, the slot over
   its capacity; `edit_type` changing a capacity. Each new or changed journey's page under
   `docs/journeys/backend/` in the same change, with the skill `explain-journey`; the journeys
   clean up after themselves.
8. **The evaluation** (`backend/tests/eval/`): the known week (`week.ts`) gains a type of
   capacity 3 with a slot partly taken; new requests in both languages: what is free (places
   said), "Swimming Pool now holds 5 people", two Users into one slot, a User asking for a full
   time (no forcing offered), the Administrator asking to book a full time and then saying
   "book anyway" (`overbook` only in the second answer), a User already busy at that time.
   `checks.ts` checks the tools, their inputs (`overbook` present or absent) and the
   proposals, never a sentence of Claude.
   **Then the paid run, once:** stop and tell me when the free checks are green. **I start the
   stack with the real key in my own terminal** (you never see or type the key); then you run
   `DYNAMODB_PORT=8002 npm run assistant:eval -w backend -- --ceiling 1 --out <scratchpad>/run.json --hand <scratchpad>/answers.txt`,
   and afterwards I put the fake back (`local:up` without the key, as `docs/COMMANDS.md` says).
   Report each request's pass or fail, the hand-read answers that matter, and the cost. A
   failure that comes from the instructions or a tool's description is fixed in this step and
   the run is **not** repeated without asking me (a second run is a second cost).
9. **Documents**, in the same change:
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: a new version (v20) in the status line and the
     change log, the sentence "Not yet in line with the capacity of a type" removed; section 3
     (`edit_type`, the capacity), 5.5 rule 4 (decision 2), 7.3 (decision 7), 8 (decisions 1,
     3 and 5), 12.3 (the requests added, the run's date, result and cost), 13 (decision 6),
     18 (the decisions, with "decided by the Product Owner" where they are).
   - `docs/ARCHITECTURE.md`: step u6's sentence in the v15 row, which stays open until step u7.
   - `docs/CAPACITY_PLAN.md`: an "As done" note under step u6 ending with what step u7 finds
     ready (the smoke test, the deployment order), and the version line (v8). F8 marked decided.
   - `docs/FRONTEND_ARCHITECTURE.md` "Failures in plain words" and section 6.1, only for
     decision 6; `docs/FOLDER_STRUCTURE.md` where it names `renameType.ts`; `docs/journeys/`
     as step 7 says. `docs/CONVERSATIONAL_PLAN.md` and the briefs are records: not rewritten.

Not in this step: the smoke test, `backend/template.yaml`, any deployment (step u7); the
calendar's routes and handlers outside `backend/src/assistant` (if one seems to need a change,
stop); `shared/src/calendar` and `shared/src/api.ts` (the contract: if it seems to need a change,
stop); the page's screens other than the panel's outcome line; `README.md`, `docs/RUNBOOK.md`;
any `aws` command; the cloud; `npm run deploy`; `npm run assistant-key`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing; a decision above that the code proves
  awkward (for example the places in `freeSlots` confusing the fake's journeys or the tool's
  input); any change outside `backend/src/assistant`, `backend/tests/unit/assistant`,
  `backend/tests/integration/assistant.test.ts` and `fake-claude/`, `backend/tests/eval`,
  `shared/src/assistant`, `shared/tests/assistant`, `frontend/src/logic`,
  `frontend/src/views/shell.ts`, `frontend/tests/unit` and `docs/`; **before the paid run**, and
  after it.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- The local stack: `local:up` and `local:api` running, with the fake Claude for everything but
  the paid run; never run the back end's and the front end's journeys at the same time. After
  `npm run build -w backend`, restart `local:api`.
- Logs and outputs never hold the key, a token or a password; the evaluation's files stay in the
  scratchpad.
- Commit only when asked. Do not push. Do not start step u7.

## Acceptance (`docs/CAPACITY_PLAN.md` step u6)

- Against the fake: the assistant gives the places left, creates a type with a capacity and
  edits it with `edit_type`, proposes two Users into one slot of capacity 2 in one proposal,
  refuses the same User twice and a full time without `overbook`, and proposes the
  Administrator's booking over the capacity with the sentence that says so; the Administrator's
  `user_busy` is refused at the proposal.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; 100 % line
  coverage on `backend/src/assistant`, `shared/src` and `frontend/src`.
- **The root `DYNAMODB_PORT=8002 npm run verify` PASSED** with `local:up` and `local:api`
  running (the fake wired); then, apart, `RUN_INTEGRATION=1 npm run test:integration -w frontend`
  passed.
- The paid evaluation run once, under US$1: each request's result and the cost said.
- `git status` shows changes in the paths of the pauses above only.
- The "As done" note holds the detail: the decisions as applied, the shape of rule 4's count,
  each test and journey added, each evaluation request and its result, the cost. Then the short
  closing message, and suggest the commit.
