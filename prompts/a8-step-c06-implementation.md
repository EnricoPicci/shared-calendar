## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend      # with ANTHROPIC_API_KEY not set in this shell
npm run local:api -w backend                        # foreground, in a terminal of its own

# In the terminal that will start Claude Code, and only there:
read -s "ASSISTANT_TRIAL_KEY?Anthropic key: " && export ASSISTANT_TRIAL_KEY
```

- This step needs **an Anthropic API key** for the trial of the acceptance (a few cents). No
  AWS login: the step does not touch the cloud.
- The key goes in `ASSISTANT_TRIAL_KEY`, **not** in `ANTHROPIC_API_KEY`: Claude Code reads
  `ANTHROPIC_API_KEY` for itself and would bill the session to that key.
- `local:api` will need **two restarts** during the session: one for the new build with the
  real key, for the trial, and one to go back to the fake, for the journeys and `verify`. The
  session asks for each. If the trial shows a fault that needs a new build, there is a third.

## Brief

Implement plan step c06, "The other appointment changes" (`docs/CONVERSATIONAL_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review. The design points are proposed below: apply them as written, and stop if the
code or a document proves one wrong. Three of them are marked as decided with the Product
Owner: they are not reopened unless the code proves one cannot be built.

After this step, a person cancels an appointment, moves it or sets its note by conversation,
each through a proposal confirmed with the button, and "cancel both" makes one proposal of two
changes, confirmed together, each with its own outcome. Step c05 built the whole mechanism on
one tool; this step adds three tools to it and lifts the limit of one change per proposal. It
adds no route and no function.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design", "Cloud safety", "Comments" and
  "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`" (how a change tool is written, the
  stopgap rule, the rule that only `confirm.ts` runs a change), "`src/lib/`" and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, the finding F6, step c06 with the
  paragraph "What step c05 left ready", the "As done" note of step c05, and step c07 to see
  what this step must leave ready and what it must not take from it.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 3, 4.4, 5 (all of it: 5.4 with its "As
  built", **5.5 the rules of a proposal**, with the table of a proposal a confirmation took),
  6, 7.3, 7.4, 8 (all of it), 9, 11.3, 12.1 and 12.2.
- `docs/ARCHITECTURE.md`: section 4 ("The assistant's routes", and the rows of the three
  appointment routes), 5.4, 7.1.
- `docs/SHARED_CALENDAR_SPEC.md`: sections 8.3, 8.4 and 8.5, the rules R-CAN-01 to R-CAN-03,
  R-CHG-01 to R-CHG-03, R-PERM-01, R-NOTE-01 and R-NOTE-02, with the codes the three routes
  answer.
- `docs/journeys/README.md` and the project skill `explain-journey`, the pages
  `docs/journeys/backend/assistant-booking.md`, `assistant-not-confirmed.md` and
  `assistant-confirm-trouble.md`, and `docs/journeys/concepts.md` ("One local calendar,
  shared", "The life of an appointment", "A proposal, and its two buttons").

Then read the code this step builds on:
- `backend/src/assistant/`: `exchange.ts` (the branch "Claude asks for a change" and the
  check that answers "one change at a time"), `proposal.ts`, `confirm.ts`, `decline.ts`,
  `conversation.ts`, and in `tools/`: `tool.ts` (`ChangeTool`, `ToolConfirmation`),
  `bookAppointment.ts` (the model of a change tool), `run.ts` (`asksForChange`,
  `proposeChange`), `changeHandlers.ts`, `list.ts`, `result.ts` (`appointmentForModel`),
  `listAppointments.ts`.
- `backend/src/handlers/cancelAppointment.ts`, `changeAppointment.ts`,
  `updateAppointmentNote.ts` and `listAppointments.ts`, each with its test: what it reads from
  the event, what each role may do, and what it answers.
- `shared/src/assistant/`: `texts.ts` with the two language files (`changes`), `limits.ts`
  (`changesPerProposal`), `types.ts`; `shared/src/calendar/schemas.ts` (`ChangeBody`,
  `NoteBody`, `AppointmentsQuery`).
- `backend/template.yaml`: `ConfirmProposalRole`, and the roles of the three appointment
  functions.
- `eslint.config.js`: the rules on `backend/src/assistant` and on `backend/src/handlers`.
- `backend/docker/fake-claude.mjs` and `backend/tests/integration/fake-claude/answers.json`
  (it holds very long signatures: never print it whole), and
  `backend/tests/integration/assistant.test.ts`: the file's `beforeAll`, the helpers
  `dayOfJourney`, `openWindow`, `removeFromCalendar`, `JOURNEY_TYPES`, and the three blocks of
  step c05.

Anthropic's API is not written from memory. What step c05 confirmed holds (an answer with
several `tool_use` blocks is followed by one user entry with a result for each). If this step
needs anything else of the API, read it in the current documentation first (the `claude-api`
skill, then the documentation tools).

## Where we are (2026-11-21)

- Steps c00 to c05 are done and committed (c05: `527eb4c`). `main` was seven commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- A User books through the assistant: `book_appointment`, the proposal worded by the server,
  `POST /assistant/proposals/{proposalId}/confirm` and `…/decline`. Nine journeys' blocks on the
  fake, nine pages.
- What step c05 left on purpose, and this step ends:
  - **one change per proposal**: more than one change in an answer makes no proposal, and each
    gets the error result "one change at a time". The stored proposal, the screen's `actions`
    and the loop of the confirmation are lists already;
  - the paragraph "What you can do for the time being" of `INSTRUCTIONS` sends moving,
    cancelling and notes to the web pages.
- `ConfirmProposalRole` holds the `assistant` table's two sets, the read of the key, and of
  the calendar the read, write and book sets. No `CalendarDeletePolicy`, no Cognito.
- **One sentence of the plan is wrong**: the "As done" note of step c05 says step c06 brings
  `CalendarDeletePolicy`. By `docs/ARCHITECTURE.md` section 7.1 none of the three routes of
  this step deletes: cancel and note need read and write, change needs read, write and book,
  all of which the role has. Check it against the template and correct the sentence.
- The local daily limit is 10 messages a person. `alice` and `admin` keep their count from one
  run to the next within a day.
- The assistant's journeys use the days 25 to 28 from today, early in the morning, and the
  file removes what an interrupted run left from tomorrow to 28 days ahead. The calendar's
  journeys leave bookings open 30 days ahead; `GET /calendar` takes 31 days at most.
- `backend/CLAUDE.md` and the root `CLAUDE.md` have 199 lines each of their 200: a new line
  there needs room made in the same change.
- Two untracked files in `backend/`, `.verify-ok 2` and `env.local 2.json`, are strays: leave
  them alone and out of any commit.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: how the facts of an appointment are read (before a file is written)

A proposal shows facts the server reads itself (section 5.5, rule 2): for these three tools,
the appointment an id stands for. **The calendar has no route that reads one appointment by
its id**, and the core reaches the calendar through a handler only. Answer:

1. **The read.** Proposed: the confirmation calls the handler of `GET /calendar/appointments`
   with the caller's identity and finds the id in the answer. Say which selection it asks for
   (`upcoming`, or a period) and with which `status`, so that every appointment the three
   routes can act on is found, and what the Administrator's read costs when the calendar holds
   many appointments.
2. **Someone else's appointment.** A User's list holds their own only, so another person's id
   is "not found" at the proposal, as the routes answer `404` for it. Say that this is what
   the read gives, and that the plan's test ("a User proposing a change to another person's
   appointment gets the route's refusal") is met by it.
3. **What cannot be found by that read** and the routes would still accept or refuse with a
   code of their own (an appointment that has ended, one already cancelled): say what the
   person gets in each case.

Answer in a few lines and carry on if the proposal holds. **If it does not hold without a new
route, a change to a calendar handler or to `lib/calendarDb.ts`, stop and propose.**

## Design points

1. **The three tools are offered to both roles** *(decided with the Product Owner before this step)*. The architecture's section 3
   says "both" for all three, none of the three routes asks Cognito anything, and the
   Administrator may cancel, move or annotate anybody's appointment. So both roles get them in
   this step, unlike booking. The summary names the person the appointment belongs to
   whenever the caller is the Administrator, and the stopgap paragraph says what each role
   can do.
2. **The inputs.** An appointment is named by its id, which `list_appointments` and
   `get_calendar` already give Claude. Never by a date and a time.
   - `cancel_appointment`: the id. The route takes no body.
   - `change_appointment`: the id, the new day and local start time, and `occurrence` as in
     `book_appointment`. **It moves and does nothing else**: no note in its input, so the old
     note is kept (the route's absent `note`). No end, no type.
   - `set_appointment_note`: the id and the note, or an explicit way to clear it. Say how the
     input tells "clear" from "leave", since a field left out cannot mean both.
3. **The confirmations.** Each reads the appointment as the first question settles, and
   answers the request to run with the facts.
   - Cancel: the appointment's day, times and type.
   - Move: the appointment as it is and the slot it would go to (free for this person, with
     its end and the type of its window, read as `book_appointment` reads them). The type may
     differ from the old one: the summary shows both.
   - Note: the appointment, and the note as it would become. Say whether the summary also
     shows the note as it is.
   - No proposal when the appointment is not found or the new slot is not there: an error
     result with the reason, and the step goes on as after a read.
   - **Share what `book_appointment` already does** (the local time to an instant, the two
     nights the clocks change, the free slot of a day): one function, not a copy.
4. **The summaries are the server's**: one function per tool in `changes` of
   `shared/src/assistant/`, in both languages, the Italian in the formal "lei" of the others,
   with the full date as the booking's sentence writes it. Show me the sentences in both
   languages, for a User and for the Administrator, before the journeys are written.
5. **Several changes in one proposal** (section 5.5, rule 4).
   - Up to `changesPerProposal` (five) changes asked for in one answer make one proposal,
     listed in the order asked, each with its own summary.
   - **More than five** *(decided with the Product Owner before this step)*: none is proposed, and
     each gets an error result saying to ask for five at most, as the limit of one works
     today. Never the first five with the rest refused.
   - **One of them cannot be proposed** (an id that is not found among two)
     *(decided with the Product Owner before this step)*: no proposal at all. That change
     gets its error, the others a result saying nothing was proposed because another change
     of the same answer could not be, and the step goes on: Claude tells the person and asks
     again for what can be done. The person is never shown half of what they asked for.
   - Two changes of one answer that name the same appointment: say what happens, at the
     proposal or at the confirmation.
   - Lift the limit by removing the check, as step c05 wrote it to be removed. Say which
     existing tests this replaces.
6. **The confirmation of several changes.** `confirm.ts` already runs each change in order,
   through its route's handler, with the identity of the request, and gives each its outcome:
   one refused does not stop the others. Check, with five changes:
   - that the time the handlers take leaves room for the closing words, and that the answer is
     `working` without asking when it does not;
   - what a function stopped half-way leaves: the outcomes are saved once, after the last
     change, so a later request records all of them as `unknown`, the ones already made
     included. Say that this is so, and that the note for Claude (read the calendar before
     saying anything) covers it.
7. **What Claude gets of each route's answer**, made small as section 8.3 asks, after the
   words that the person pressed the confirm button. A move answers the new appointment and
   says which one it replaces.
8. **The template.** Expected: no change. `changeHandlers.ts` gains three lines, and the
   confirming function's bundle grows by the three handlers; the other five bundles must stay
   without them. Check that the lint rule's list of change handlers holds the three file
   names. Say at once if a route needs a permission the role lacks.
9. **The stopgap paragraph loses moving, cancelling and notes.** What stays in it: the
   Administrator's booking for a User, the opening hours, the types and the settings. The
   version mark moves by itself, so conversations in progress end.
10. **Logs.** Unchanged in shape: the names of the changes proposed, and per change at the
    confirmation the tool's name, the route's status and the milliseconds. Never an input, an
    appointment id's owner, a note, a summary or a text. Extend the unit test that serialises
    the lines to the three tools, with a note in the input.
11. **The fake Claude and the journeys.**
    - The fake must ask to cancel an appointment whose id it cannot know in advance. Proposed:
      a new mark that takes an appointment's id from the last result of a tool in the request
      (the first, the second), so that the scripted exchange is "list the appointments, then
      cancel them". Say what the fake had to learn, and keep it the least it can be.
    - The requests for the three tools in the fake's answers are the blocks the real model
      sent in this step's trial, with ids and dates replaced by marks.
    - **"One of the two inside the notice and refused"** needs an appointment a User may no
      longer cancel while the other still may be. The journeys book weeks ahead and never
      reset the calendar. Propose how the block gets there (for example a setting the block
      changes as the Administrator and puts back in a `finally`, which the calendar's
      journeys already do) and what a run stopped half-way leaves. If no way is safe for the
      other journeys, say so and propose another refusal to show.
    - **Days and hours**: each new block has its own throw-away User, its own type name in
      `JOURNEY_TYPES` and a day or hours no other block uses, inside what a User may book and
      what the file's clean-up looks at. Say which, and extend the clean-up if the days grow.
      A second run the same day, and a run interrupted the day before, must not meet.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c06 lists.

- **Code:** three files in `backend/src/assistant/tools/` with their lines in `list.ts` and
  `changeHandlers.ts`; what they share with `bookAppointment.ts`; `exchange.ts` and
  `tools/run.ts` (point 5); `confirm.ts` only where point 6 finds a fault; `prompt.ts` (point
  9); `shared/src/assistant/` for the texts; the fake and its answers (point 11);
  `eslint.config.js` only if a handler's name is missing.
- **Unit tests**, `lib/anthropic` and the handlers mocked where the core is tested, a fixed
  "now":
  - the facts of each confirmation: the appointment an id stands for; for a move, the old and
    the new time; the note as it would become;
  - an id that is not found gives no proposal; a User and another person's appointment;
  - each summary in both languages, word for word, for a User and for the Administrator;
  - a proposal of two and of five changes; a sixth; one that cannot be proposed among two;
    the same appointment twice;
  - at the confirmation: every change run in order, one refused does not stop the others,
    each outcome and each result; the proposal taken and left with several changes;
  - the offer of each tool by role; the log lines of point 10;
  - 100 % of the lines of `backend/src/assistant`, `backend/src/lib` and `shared/src`.
- **Journeys**, on the fake, each `describe` with its page written and checked with the skill
  `explain-journey` (a checker in a fresh context, its points answered):
  - "cancel both", confirmed together, one of the two refused: both outcomes on the proposal,
    one appointment cancelled and one still booked in the calendar's own list;
  - a move confirmed and found: the old appointment cancelled as changed, the new one booked;
  - a note set, and read back through the calendar's own route.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c06 in the v13 entry; section 4 ("The
    assistant's routes": the tools, who is offered each, several changes in one proposal);
    sections 7.1 and 12 only if something there became untrue.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v9: the status line, the change log, and each
    section where the implementation fixed a detail (5.4, 5.5 rule 4, 7.3, 8.2, 11.3, 12.1).
    A changed diagram follows `.claude/rules/diagrams.md` and is rendered on a dark page.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, the corrected sentence of step c05, an
    "As done" note under step c06, and what step c07 finds ready and must do.
  - `docs/COMMANDS.md` (the journeys' accounts and days), `docs/FOLDER_STRUCTURE.md`,
    `backend/CLAUDE.md` only if a line became untrue, `docs/journeys/README.md` and
    `docs/journeys/concepts.md`.
  - `CLAUDE.md` only if a line of it became untrue. Report the line counts of both files.

Not in this step:
- booking by the Administrator for a User, finding F6, `list_users`, any Cognito permission,
  the settings and the types (step c07); availability and blocking time (step c08);
- any new route or function, any change to a calendar handler or to `lib/calendarDb.ts`;
- the screen and anything in `frontend/` (steps c11 and c12);
- the open points P1 to P7;
- the cloud: no deploy, no `aws` command against a real account.

## How we work in this step

- **The local stack:** I start it before the session. Run
  `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself when `local-seed.sh`, the compose
  file or the wiring changes: it is idempotent and local. Do not run `local:down`.
  **`local:api` is mine: when it needs a restart, tell me and wait**, and tell me exactly what
  to do: which terminal, which command, and what word you wait for. Plan the restarts so that
  there are as few as possible, and say at each one what it is for. **Never send anything to
  the assistant to learn whether the API was restarted**: read the fake's log
  (`docker compose logs fake-claude`, in `backend/`) or wait for my word.
- **The trial with the real key**, for the acceptance, before the fake's answers are written:
  - wire the real Claude with the key given to that one command,
    `ANTHROPIC_API_KEY="$ASSISTANT_TRIAL_KEY" ASSISTANT_DAILY_MESSAGE_LIMIT=30 DYNAMODB_PORT=8002 npm run local:up -w backend`,
    never exported; ask me for the restart;
  - use the week the calendar's journeys leave in the local table if it is there, or make one
    with a script in the scratch folder that calls the local API as the Administrator; book
    what the trial needs through the calendar's own route;
  - by `curl`, as `alice`: an appointment cancelled, from the sentence to the calendar, with
    every `continue`, the proposal as the server worded it, the confirmation and the closing
    words; one moved; a note set; then "cancel both my appointments of next week", confirmed.
    Once each: a move to a slot that is not free; a request about an appointment that is not
    hers. If point 1 gives the tools to the Administrator, as `admin`: "cancel alice's
    appointment on Tuesday". Report per exchange the tools asked for with their inputs, the
    seconds of each step, the texts, and whether the calendar holds what it should;
  - **read the closing words of each exchange critically**: step c05 found there that the
    model spoke of a proposal still waiting. A fault found in the trial is fixed in this step
    and tried again;
  - cancel what the trial booked, say what stays, then `local:up` without the key, ask me for
    the restart, and **leave the stack on the fake**.
- **The key** never appears in a command's text, in your output, in a file of the repository
  or in a test, and is never an argument of a command. Read `backend/env.local.json` by the
  names of its variables, never print it. If a tool's output shows the key by accident, say so
  at once: I rotate it.
- **The stored conversations and `answers.json`** hold very long signatures: a script that
  reads them shortens every long string before it prints. Scratch scripts live in the scratch
  folder, never in the repository, and are deleted at the end.
- **Money:** a few cents. More than about thirty requests to the real model: stop and ask.
- **Hard rules:**
  - **no request of the model, and no text anybody typed, runs a change**: the only code path
    to a change handler starts at `confirmProposal`;
  - `backend/src/assistant` reaches the calendar through a handler only;
  - `@anthropic-ai/sdk` is imported only in `backend/src/lib/anthropic.ts`; the AWS SDK only
    under `backend/src/lib`;
  - IAM: no wildcard action or resource, one role per function, only what its route needs;
  - unit tests reach no network; the journeys run on the fake and refuse the real Claude;
  - the existing tests keep passing unchanged, except those of the places this step replaces.
    Say which changed and why;
  - never run the back end's and the front end's integration tests at the same time;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief, step or finding name in a comment.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan, Anthropic's documentation and this
  brief disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed
  change. The architecture wins over the plan, and the plan over this brief, except for what
  was decided with the Product Owner (point 1 and two parts of point 5). What Anthropic's API
  really does wins over all of them, and changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c06)

- The first question answered.
- The design points applied as written (any deviation reported with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- The journeys above green on the fake, run twice the same day, with their pages, each
  checked; the checker's points listed with what was done about each.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green, on the fake, on the final state.
  It empties the local `calendar` table: say so.
- **The roles' review**: `ConfirmProposalRole` statement by statement against what the four
  change routes need, and that no other assistant role changed; the bundles searched as in
  step c05, the three handlers in the confirming function's and in none of the other five.
- With the real key, the exchanges of "How we work", reported as asked there. The stack back
  on the fake, no key left in `backend/env.local.json`.
- **Checkpoint of the plan: everything a User can do by conversation works locally.** Say
  what a User still cannot do here, if anything.
- In the report: the three tools as Claude sees them (name, description, schema); a proposal
  of two changes as the screen will get it, in both languages; what a proposal of several
  changes and its confirmation cost in reads and writes of the two tables; the weight of the
  bundles before and after; what step c07 finds ready and what it must do; the scratch
  folder's scripts deleted, and what the trial and the journeys leave in the local tables.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step c07.
