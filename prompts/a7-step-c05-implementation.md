## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend      # with ANTHROPIC_API_KEY not set in this shell
npm run local:api -w backend                        # foreground, in a terminal of its own

# In the terminal that will start Claude Code, and only there:
read -s "ASSISTANT_TRIAL_KEY?Anthropic key: " && export ASSISTANT_TRIAL_KEY
```

- This step needs **an Anthropic API key** for the booking by hand of the acceptance (a few
  cents). No AWS login: the step does not touch the cloud.
- The key goes in `ASSISTANT_TRIAL_KEY`, **not** in `ANTHROPIC_API_KEY`: Claude Code reads
  `ANTHROPIC_API_KEY` for itself and would bill the session to that key.
- `local:api` will need **two restarts** during the session, as in step c04: one for the two
  new functions on the fake, one around the trial with the real key. The session asks for each.

## Brief

Implement plan step c05, "A change: the proposal and booking" (`docs/CONVERSATIONAL_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review. The design points are proposed below, those already decided marked so: apply
them as written, and stop if the code or a document proves one wrong.

After this step, a User writes "book me Tuesday at 10", sees a question written by the server
with two buttons, and the appointment exists only after the button "Confirm" was pressed:
`POST /assistant/proposals/{proposalId}/confirm` runs the booking route's own handler with the
caller's identity, once. Declining, or writing instead of pressing, changes nothing. The whole
mechanism of a change is built here on one tool, `book_appointment`; the other change tools
are steps c06 to c08.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design", "Cloud safety", "Comments" and
  "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`" (the stopgap rule, how a tool is
  written), "`src/lib/`", "A new calendar function" and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, the findings F5 and F6, step c05 with
  the paragraph "What step c04 left ready", the "As done" note of step c04, and steps c06 and
  c07 to see what this step must leave ready and what it must not take from them.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 3, 4.4, 5 (all of it: 5.2 the states, 5.4 a
  change, **5.5 the rules of a proposal**, 5.6 the diagram), 6 and 6.1, 7.3 and 7.4, 8 (all of
  it), 9 (the attributes `proposal` and `executing`), 10.1, 11.1 and 11.3, 12.1 and 12.2.
- `docs/ARCHITECTURE.md`: section 4 ("The assistant's routes", the codes, and the row of
  `POST /calendar/appointments`), 5.4, 7.1, 8.
- `docs/SHARED_CALENDAR_SPEC.md`: section 8.2 and the rules R-BOOK-01 to R-BOOK-11, with the
  codes the booking route answers.
- `docs/journeys/README.md` and the project skill `explain-journey`, the six pages
  `docs/journeys/backend/assistant-*.md` and `docs/journeys/concepts.md` ("One local calendar,
  shared", "The assistant in the journeys", "Steps, `continue` and the tools").

Then read the code this step builds on:
- `backend/src/assistant/`: the four files of the core and the nine of `tools/`.
  `tools/tool.ts` holds the place of the fourth part (`ToolConfirmation`, empty) and the kind
  `change`; `tools/run.ts` refuses to run a change (`not_a_read`); `exchange.ts` holds the
  branch that this step splits in two (reads only, or a change among the requests).
- `backend/src/lib/assistantDb.ts`: `StoredProposal`, `Executing`, `takeProposal()`,
  `saveStep()` (what it does with `proposal` and `executing`), `endConversation()`. They were
  written in step c01 for this step: say what holds as it is and what must change.
- `backend/src/handlers/bookAppointment.ts` with its test: what it reads from the event, from
  the environment and from Cognito, and for which role.
- `backend/src/handlers/continueAssistant.ts` with its test: the model for the two handlers.
- `shared/src/assistant/`: `types.ts` (`AssistantProposal`, its actions and outcomes),
  the texts (`proposalQuestion`, `confirmLabel`, `declineLabel`, `nothingChanged`), `limits.ts`
  (`changesPerProposal`), `schemas.ts`; `shared/src/api.ts` (`proposal_not_found`).
- `shared/src/calendar/`: the time helpers, in particular what turns a local date and time
  into an instant, and what they do with a local time that happens twice or never.
- `backend/template.yaml`: `ContinueAssistantFunction` with its role, `BookAppointmentFunction`
  with its role, and the calendar's shared permission sets.
- `backend/docker/fake-claude.mjs` and `backend/tests/integration/fake-claude/answers.json`
  (it holds very long signatures: never print it whole), `backend/tests/integration/setup.ts`
  and `assistant.test.ts`, in particular the block "reading the calendar".
- `eslint.config.js`: the two rules on `backend/src/assistant`.

Anthropic's API is not written from memory. Before writing, read in the current documentation
(the `claude-api` skill, then the documentation tools): what must follow an answer that holds
several `tool_use` blocks; whether a user entry may hold `tool_result` blocks and then text;
whether two user entries may follow one another. Design points 5, 6 and 7 depend on it.

## Where we are (2026-11-21)

- Steps c00 to c04 are done and committed (c04: `aea0f1b`). `main` was six commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- The assistant reads the calendar: four read tools, `POST /assistant/continue`, the limit of
  eight requests per message, seven journeys' blocks on the fake with six pages.
- What step c04 left on purpose, and this step ends for booking:
  - a request for a change tool cannot happen (none is offered); `runRead` would answer it as
    an error result;
  - the paragraph "What you can do for the time being" of `INSTRUCTIONS` sends every change to
    the web pages;
  - `ToolConfirmation` is an empty type;
  - `continue` answers `409 nothing_to_continue` whenever the status is not `working`.
- The table module already knows `proposal` and `executing`, and `shared/` already holds the
  proposal's types, its three fixed texts and the code `proposal_not_found`. Nothing uses them.
- The local daily limit is 10 messages a person. `alice` and `admin` keep their count from one
  run to the next within a day.
- `backend/CLAUDE.md` and the root `CLAUDE.md` have 199 lines each of their 200: a new line
  there needs room made in the same change.
- Two untracked files in `backend/`, `.verify-ok 2` and `env.local 2.json`, are strays: leave
  them alone and out of any commit.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: finding F5 (before a file is written)

The two functions that ask Claude must build a proposal, so they need a change tool's
definition and the facts its confirmation shows. They must not carry the code that changes the
calendar. Read how a tool is written today (a plain object that holds its route's handler) and
answer:

1. **The layout.** Proposed: a change tool's file is split so that its definition, its input
   and its confirmation (the facts, read through a **read** route's handler) are in what the
   two functions import, and the part that calls the change route's handler is in a module
   only `confirmProposal` imports. Say what the split is, file by file, and what `Tool` and
   `list.ts` become.
2. **The proof.** After the build, the bundles of `sendAssistantMessage`, `continueAssistant`,
   `declineProposal`, `getConversation` and `endConversation` hold nothing of
   `bookAppointment`'s handler nor of the calendar's write functions. Say how you looked.
3. **A rule that keeps it so.** Propose a lint rule, or say why none can be written.

Answer in a few lines and carry on if the proposal holds. **If it does not hold without
changing a calendar handler or `lib/calendarDb.ts`, stop and propose.**

## Design points

1. **`book_appointment` is offered to Users only in this step** *(decided with the Product Owner before this step)*. The route asks the Administrator for the
   `username` of the User the appointment is for, and "booking for a named User" with finding
   F6 is step c07's. The Administrator's request to Claude does not name the tool. The unit
   test of step c04 that proves "a User's request never names an Administrator's tool" gets its
   mirror on a real tool.
   - **Input**: the day and the start as a local date and a local time of the calendar's time
     zone, an optional note. No end (a slot lasts an hour), no type (the window decides it), no
     `username`.
   - **The night the clocks go back** a local time happens twice. Propose how the input tells
     the two apart and how `get_calendar` then shows them, with the helpers of
     `shared/src/calendar/`, before writing the tool. A local time that does not exist (the
     night the clocks go forward) is an error result.
2. **The fourth part**: `ToolConfirmation` gets its shape. It reads the facts a proposal shows
   (rule 2 of section 5.5) and names the fixed text that words them. For a booking: that the
   slot is there and free for this person, and the type of its window, read by calling the
   handler of `GET /calendar` in-process with the caller's identity, never `lib/calendarDb.ts`.
   - **The summary is the server's**: a text of `shared/src/assistant/` in both languages,
     filled with the day, the two times, the type and the note as they will be sent to the
     route. Nothing of Claude's own words. The Italian in the formal "lei" of the others.
   - **No proposal when the facts cannot be read** or say the change cannot be made (no such
     slot, already taken): Claude gets an error result with the reason, and the step goes on
     as a read step does.
3. **The branch "Claude asks for a change"** in the core, beside the read branch:
   - no change is run. Every read asked for in the same answer is run, in the order asked,
     and its result **kept back** in the proposal, not shown to Claude yet;
   - Claude's answer is saved exactly as given, with the proposal, in **one write**; the
     status becomes `awaiting_confirmation`; the reply holds `proposal` with its id (a ULID),
     the question, the two labels and its actions, each with `outcome: null`;
   - **the stored proposal is a list of changes from the start**, of one element in this
     step *(decided with the Product Owner before this step)*. More than one change in one answer is step c06's: here each of them is answered to
     Claude with an error result saying to ask for one change at a time, and the step goes on.
     Write it so that step c06 removes a check, not a structure;
   - a change tool that does not exist, is not of the role, or has a wrong input is answered
     as step c04 does. The count of requests per message does not change.
4. **`POST /assistant/proposals/{proposalId}/confirm`**, handler `confirmProposal.ts`, no body:
   - `400 invalid_request` when the id is not a ULID; `404 proposal_not_found` when it is not
     the one waiting, was settled or dropped, or there is no conversation;
   - it takes the proposal with `takeProposal()`: of two at once, one wins and the other gets
     `404 proposal_not_found`;
   - it runs the change through the route's handler, with the identity **of this request**,
     never one stored with the proposal;
   - **it saves the outcome before it asks Claude**: the results of the changes and the
     kept-back reads, as the one entry that answers Claude's request, the proposal with each
     `outcome` (`done`, or `refused` with the route's code), the status `working`. Then it asks
     Claude for the closing words, as one more step through `runStep`;
   - a 503 of either kind at the closing words leaves the change made and saved, the status
     `working`, and `continue` gets the words. When the function's remaining time no longer
     holds a step, it answers `working` without asking, as the slow language question does;
   - it is not a message of the day and the daily limit never refuses it.
5. **`POST /assistant/proposals/{proposalId}/decline`**, handler `declineProposal.ts`, no body:
   the same two refusals. It answers Claude's request with results saying the person declined
   and nothing was changed (with the kept-back reads), adds the notice `nothingChanged`, and
   leaves the conversation `idle`. **It never asks Claude**: the function has no key and 10
   seconds. Check with Anthropic's documentation that the next message of the person can
   follow that entry.
6. **A message while a proposal waits drops it** (rule 5 of section 5.5). The proposal is
   settled as in point 5, the person's message is added, and Claude is asked: one write, one
   request. A typed "yes" is such a message. It counts as a message of the day. When the
   message itself is refused (the daily limit, a full conversation, an invalid body) nothing
   is saved and **the proposal keeps waiting**.
7. **A proposal taken and never finished** (rule 6) *(decided with the Product Owner before this step)*. `executing` is found set by a
   later request: while it is younger than the function's 29 seconds plus a margin, the
   request is refused as `409 assistant_busy` (a confirmation may still be running); once
   older, the request settles it first, each change `unknown`, with a result telling Claude to
   read the calendar before saying anything about it. Say which requests can meet it (a
   message, `continue`, a second `confirm`, `decline`, `GET`, `DELETE`) and what each does.
8. **`continue` and `GET` with a proposal.** `continue` while a proposal waits stays
   `409 nothing_to_continue`: the way on is one of the two buttons or a message. `GET` gives
   the waiting proposal, and the settled one with its outcomes until the next step replaces
   it. Say exactly when a settled proposal stops being shown.
9. **The template.**
   - `ConfirmProposalFunction`: its role, log group and route, 29 seconds; the `assistant`
     table's two permission sets, the read of the key, and of the calendar **only what a
     booking by a User needs** *(decided with the Product Owner before this step)*: the plan's wording gives the role everything at once, but
     a role grants what its route needs, so `CalendarDeletePolicy` and Cognito's two actions
     arrive with the first tool that needs them, in steps c06 and c07. Say at once if the
     route needs one of them for a User. Write the difference in the "As done" note.
   - `DeclineProposalFunction`: 10 seconds, the `assistant` table, nothing of the calendar,
     no key.
   - `SendAssistantMessageFunction` and `ContinueAssistantFunction` gain no permission.
   - `local:up` gives the two new functions their environment.
10. **The stopgap paragraph loses booking, for Users.** The Administrator's request still says
    that booking is done from the web pages. Say how the instructions do that (the paragraph
    is common to both roles today) while staying one paragraph that the last tool's step
    removes. The version mark moves by itself.
11. **Logs.** The line of `confirmProposal` holds the proposal's id and, per change, the tool's
    name, the status the route answered and its milliseconds; the line of a step that made a
    proposal holds the names of the changes proposed. Never an input, a note, a summary or a
    text. A unit test serialises each line with a note in the input and finds none of it.
12. **The fake Claude and the journeys.**
    - The request for `book_appointment` in the fake's answers is the block the real model
      sent in this step's trial, with the date replaced by the mark `{{date+N}}`.
    - The same sentence is answered differently after a proposal was dropped or confirmed:
      check that the fake's way of choosing (the count of Claude's answers since the person's
      last message) is enough, and say what it had to learn if not.
    - **The calendar**: the journeys never reset it. An appointment cannot be deleted, only
      cancelled, and a window that holds one may not be removable. Say what each block leaves
      in the `calendar` table, clean up what can be cleaned (before and after, as the reading
      block does), and choose days and hours so that the blocks, the reading block and a
      second run on the same day do not meet. Each block keeps its own throw-away User.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c05 lists.

- **Code:** `backend/src/assistant/tools/` (F5, points 1 and 2), `exchange.ts` and
  `conversation.ts` (points 3 to 8), `prompt.ts` (point 10), the two handlers,
  `backend/src/lib/assistantDb.ts` only where point 7 or 8 needs it, `backend/template.yaml`
  and the local wiring (point 9), `shared/src/assistant/` for the booking's texts,
  `eslint.config.js` if F5 gives a rule, the fake and its answers (point 12).
- **Unit tests**, `lib/anthropic` and the handlers mocked where the core is tested, a fixed
  "now":
  - every rule of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, one by one, named so;
  - the tool's parts; the two nights the clocks change; the summary in both languages;
  - no proposal when the facts cannot be read; reads in the same answer run and kept back;
    two changes in one answer;
  - `confirmProposal` and `declineProposal`: each answer and each refusal, the race, the
    outcome saved before Claude is asked, the 503 after a confirmed change, a refused change;
  - a message that drops a proposal; a refused message that leaves it waiting;
  - a proposal taken and not finished, on each side of the age of point 7;
  - the log lines of point 11;
  - 100 % of the lines of `backend/src/assistant`, `backend/src/lib` and `shared/src`.
- **Journeys**, on the fake, each `describe` with its page written and checked with the skill
  `explain-journey` (a checker in a fresh context, its points answered):
  - a booking proposed, confirmed and found in the calendar through the calendar's own route;
  - a decline: nothing in the calendar;
  - a message that drops a proposal, a typed "yes" included;
  - a slot taken between the proposal and the confirmation, shown as refused with its code;
  - two confirmations at once: one appointment;
  - the spending limit after a confirmed change, then `continue`;
  - the access block gains the two routes.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c05 in the v13 entry; section 4 (the two
    routes, "The assistant's routes", the row of `proposal_not_found`); section 5.4 if the
    stored proposal got its shape; sections 7.1, 9.2 and 12 where they name the functions.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v8: the status line, the change log, and each
    section where the implementation fixed a detail (5.4, 5.5, 5.6, 6, 8.2, 9, 11.3). A
    changed diagram follows `.claude/rules/diagrams.md` and is rendered on a dark page.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, F5 closed, an "As done" note under step
    c05, and what steps c06 and c07 find ready and must do.
  - `docs/COMMANDS.md` (the two routes by `curl`), `docs/FOLDER_STRUCTURE.md`,
    `backend/CLAUDE.md` (how a change tool is written, in the room made for it),
    `docs/journeys/README.md` and `docs/journeys/concepts.md`.
  - `CLAUDE.md` only if a line of it became untrue. Report the line counts of both files.

Not in this step:
- `cancel_appointment`, `change_appointment`, `set_appointment_note` and a proposal of several
  changes (step c06);
- booking by the Administrator, finding F6, any Cognito permission (step c07);
- any change to a calendar handler or to `lib/calendarDb.ts`;
- the screen and anything in `frontend/` (step c12);
- the open points P1 to P7, P6 in particular (a typed "yes"): this step builds the rule as
  the architecture states it; report what the trial showed and leave the decision to step c13;
- the cloud: no deploy, no `aws` command against a real account.

## How we work in this step

- **The local stack:** I start it before the session. Run
  `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself when `local-seed.sh`, the compose
  file or the wiring changes: it is idempotent and local. Do not run `local:down`.
  **`local:api` is mine: when it needs a restart, tell me and wait.** Plan the restarts so that
  there are as few as possible, and say at each one what it is for. **Never send anything to
  the assistant to learn whether the API was restarted**: read the fake's log
  (`docker compose logs fake-claude`, in `backend/`) or wait for my word.
- **The trial with the real key**, for the acceptance:
  - wire the real Claude with the key given to that one command,
    `ANTHROPIC_API_KEY="$ASSISTANT_TRIAL_KEY" ASSISTANT_DAILY_MESSAGE_LIMIT=30 DYNAMODB_PORT=8002 npm run local:up -w backend`,
    never exported; ask me for the restart;
  - make a week yourself, with a script in the scratch folder that calls the local API as the
    Administrator (a type, windows on the days of next week); remove what can be removed when
    the trial is over, and say what stays;
  - by `curl`, as `alice`: a booking from the sentence to the appointment, with every
    `continue`, the proposal as the server worded it, the confirmation, the closing words, and
    the appointment read through `GET /calendar/appointments`. Then once: the same request
    declined; a typed "yes" in place of the button; a request for a slot that is not free.
    As `admin`: "book alice on Tuesday at 10", to read what the model says while it has no
    tool for it. Report per exchange the tools asked for with their inputs, the seconds of
    each step, the texts, and whether the calendar holds what it should;
  - then `local:up` without the key, ask me for the restart, and **leave the stack on the
    fake**.
- **The key** never appears in a command's text, in your output, in a file of the repository
  or in a test, and is never an argument of a command. Read `backend/env.local.json` by the
  names of its variables, never print it. If a tool's output shows the key by accident, say so
  at once: I rotate it.
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
  change. The architecture wins over the plan, and the plan over this brief, except for the
  four points marked as decided with the Product Owner (1, 3, 7 and 9). What Anthropic's
  API really does wins over all of them, and changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c05)

- F5 answered, with the layout, the proof and the rule.
- The design points applied as written (any deviation reported with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- The journeys above green on the fake, with their pages, each checked; the checker's points
  listed with what was done about each.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green, on the fake. It empties the local
  `calendar` table: say so.
- **A review of the roles of the assistant's functions in `backend/template.yaml`**, statement
  by statement, as a table: `sendAssistantMessage`, `continueAssistant` and `declineProposal`
  hold no write on the calendar; `confirmProposal` holds what a booking needs and no more; no
  wildcard anywhere.
- With the real key, the exchanges of "How we work", reported as asked there. The stack back
  on the fake, no key left in `backend/env.local.json`.
- `docs/ARCHITECTURE.md` section 4 holds the two routes.
- In the report: `book_appointment` as Claude sees it (name, description, schema) and a
  proposal as the screen will get it, in both languages; what a proposal, a confirmation and a
  decline cost in reads and writes of the two tables; the weight of the bundles before and
  after; in plain words, what the template gained; what steps c06 and c07 find ready and what
  each must do; the scratch folder's scripts deleted, and what the trial and the journeys
  leave in the local tables.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step c06.
