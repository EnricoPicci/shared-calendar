## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend      # with ANTHROPIC_API_KEY not set in this shell
npm run local:api -w backend                        # foreground, in a terminal of its own

# In the terminal that will start Claude Code, and only there:
read -s "ASSISTANT_TRIAL_KEY?Anthropic key: " && export ASSISTANT_TRIAL_KEY
```

- This step needs **an Anthropic API key** for the exchanges by hand of the acceptance (a few
  cents). No AWS login: the step does not touch the cloud.
- The key goes in `ASSISTANT_TRIAL_KEY`, **not** in `ANTHROPIC_API_KEY`: Claude Code reads
  `ANTHROPIC_API_KEY` for itself and would bill the session to that key.
- `local:api` will need **two restarts** during the session, as in step c03: one for the new
  function on the fake, one around the trial with the real key. The session asks for each.

## Brief

Implement plan step c04, "Reading: the tools mechanism and the four read tools"
(`docs/CONVERSATIONAL_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. The design points are proposed below, three of them already decided and marked so: apply
them as written, and stop if the code or a document proves one wrong.

After this step, "which slots are free next week?" is answered from the calendar: Claude asks
for a read, the function runs the route's own handler with the caller's identity, saves the
result and answers `working`; `POST /assistant/continue` does the next step, until Claude
answers in text. Nothing changes the calendar yet: the change tools, the proposal and the
confirmation are step c05's.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design", "Cloud safety", "Comments" and
  "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`", "`src/lib/`", "A new calendar
  function" and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, the findings F2 and F4, step c04, the
  "As done" note of step c03 (what it left to this step), and step c05 to see what this step
  must leave ready.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 3 (what the assistant can do, per role), 4.4,
  5.1 to 5.3 and 5.6 (the branch "Claude asks only to read"), 6 and 6.1 (`continue`, the
  codes), 7.2 to 7.4 (the request, the instructions, what can come back, the error result for
  a tool that cannot be run), 8 (all of it), 10.1, 11.1 and 11.3, 12.1 and 12.2.
- `docs/ARCHITECTURE.md`: section 4 ("The assistant's routes" and the rows of the four calendar
  routes the tools call), 5.4, 7.1, 8.
- `docs/SHARED_CALENDAR_SPEC.md`: the sections of the four routes read here (settings, types,
  the calendar view, the list of appointments), for what each answers to which role.
- `docs/journeys/README.md` and the project skill `explain-journey`, and the five pages
  `docs/journeys/backend/assistant-*.md` with `docs/journeys/concepts.md` ("The assistant in
  the journeys").

Then read the code this step builds on:
- `backend/src/assistant/`: all four files. `exchange.ts` holds the one step and the three
  places this step replaces (design points 4, 5 and 9).
- `backend/src/lib/anthropic.ts`: `askStep()`, the answer `tool_requests` (id, name, input),
  the type of an entry of the conversation, how a tool is given to it.
- `backend/src/lib/assistantDb.ts`: `saveStep()`, the statuses, `AssistantBusyError`.
- The four handlers the tools call, and what each reads from the event and from the
  environment: settings, types, the calendar view, the list of appointments. Find them by
  their routes in `backend/template.yaml`.
- `backend/src/handlers/sendAssistantMessage.ts` with its test: the model for the new handler.
- `shared/src/assistant/` (the texts: is there a line of progress per kind of read?) and
  `shared/src/calendar/` (the time helpers the tools must use).
- `backend/docker/fake-claude.mjs` and `backend/tests/integration/fake-claude/answers.json`:
  how an answer is chosen per step, and the mark `{{application-line}}`.
- `backend/tests/integration/assistant.test.ts` and `backend/tests/integration/setup.ts`.
- `eslint.config.js`: the rule that keeps the Anthropic SDK in one module, the model for F2.

Anthropic's API is not written from memory: for the shape of a tool definition, of a
`tool_use` block and of the `tool_result` that answers it (an error result included), read the
current documentation (the `claude-api` skill, then the documentation tools) before writing.

## Where we are (2026-11-21)

- Steps c00 to c03 are done and committed (c03: `7486c67`). `main` was five commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- The assistant talks in text. Three routes, three functions, the core in
  `backend/src/assistant/` under the 100 % threshold, five journeys on the fake with their
  pages.
- What step c03 left on purpose, and this step ends:
  - a request for a tool is answered as `assistant_unavailable`, reason `tool_not_offered`;
  - a conversation left `working` after a 503 has no way on but "New conversation";
  - a first message asks Claude twice (the language, then the step), each allowed 22 seconds,
    in a function of 29.
- The instructions (`INSTRUCTIONS` in `prompt.ts`) describe the finished assistant: with the
  real key the model says it can book and cancel. See design point 10.
- The local daily limit is 10 messages a person. `alice` and `admin` keep their count from one
  run to the next within a day; the journeys reset `admin`'s only.
- Two untracked files in `backend/`, `.verify-ok 2` and `env.local 2.json`, are strays: leave
  them alone and out of any commit.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: finding F4 (before a tool is written)

A handler called as a tool runs inside another function. Read the four handlers and what they
import, and answer, with the file and name of each thing found:

1. **The log lines.** A step that runs a tool writes the handler's own line and the
   assistant's, with one request id. Can the two be told apart as they are? What does the
   handler's line say about who called it?
2. **State.** Does any of the four handlers, or a module it uses, keep something between two
   calls (a configuration read once, a client, a cache) that would be wrong when the handler
   is called twice in one invocation, or for two different people in one warm container?
3. **The environment.** Which variables each handler reads, so that the two functions that run
   tools declare exactly those.

If nothing is wrong, say so in one paragraph and carry on: the full answer goes in the final
report. **If a handler keeps state that a second call would get wrong, or the lines cannot be
told apart without changing a calendar handler, stop and propose**: this step changes no
calendar handler without a go.

## Design points

1. **A tool is four parts** (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.2), of which a
   read tool has three: the definition (name, description for the model, the input's `zod`
   schema, the roles it is offered to, read or change), "to the handler", "to the model". One
   file per tool under `backend/src/assistant/tools/`, one file for what a tool is, one for the
   list. The type already has the place for the fourth part, so that step c05 adds a change
   tool without touching the read ones.
2. **The handler is called in-process** (section 8.1): the core builds the event API Gateway
   would have built (route, path and query parameters, body, and the authorizer's identity made
   from the `Identity` of the request in progress: `sub`, username, groups) and calls the
   route's exported `handler`. It never calls the API over HTTP and never imports
   `lib/calendarDb.ts`. One function builds the event for every tool; a unit test compares it
   with a recorded event of `sam local` for the same route, field by field where a handler
   reads it.
3. **The four tools**: `get_settings`, `list_types`, `get_calendar`, `list_appointments`, each
   on its route. Section 3 offers all four to both roles; where a route answers differently
   to the Administrator (other people's appointments, a `username` filter), the tool's input
   offers that only to the Administrator, and the route decides anyway.
   - **Local dates and times in and out** (section 8.3), converted by the helpers of
     `shared/src/calendar/`, never by arithmetic of the tool's own.
   - **The result is small**: only what an answer needs, the internal fields left out, capped
     at 6 KB of JSON; a longer one is cut at a whole item, with a line telling the model to ask
     for a shorter period.
   - **A refusal of the route is a result**: its code and message, marked as an error.
   - The JSON Schema given to Claude is made from the `zod` schema, not written twice. Say how
     (what `zod` offers at the installed version) and show the four schemas in the report.
4. **The branch "Claude asks only to read"** (section 5.6), in place of `tool_not_offered`:
   the function runs every read asked for in that answer, in the order asked, saves Claude's
   answer exactly as given and one entry with all the results, in **one write**, leaves the
   conversation `working` and answers `200` with `status: "working"` and the line of progress.
   - **What cannot be run is answered to Claude, not to the person**: a tool that does not
     exist, one not offered to the role, an input the schema refuses. Each becomes the error
     result of section 7.4, and the step goes on. No handler is called for it.
   - **A User's request never names an Administrator's tool**: the list given to Claude is
     made per role. The four tools of this step are for both roles, so the unit test gives the
     core a list with one more tool, of its own, for the Administrator only, and reads the
     request sent for a User. No journey can play it before step c07 brings such a tool.
   - **The limit of 8 requests to Claude per message of the person** (section 4.4): counted
     from the stored conversation, not kept in a variable. At the limit the assistant stops
     with the fixed sentence asking to put the request differently, as a notice, and the
     conversation is `idle`. If `shared/` has no such text, add it there first.
5. **`POST /assistant/continue`**, handler `continueAssistant.ts`: no body. It does the next
   step of a conversation that is `working`, through the same `runStep` as a message.
   - `409 nothing_to_continue` when the conversation is not `working` or there is none.
   - Two `continue` at once: one wins, the other gets `409 assistant_busy`, as for a message.
   - **It is the way on after a 503**: the person's message is already saved, `continue` asks
     Claude again. It does not count as a message of the day, and it is not refused by the
     daily limit: the message was counted when it was saved *(decided with the Product Owner
     before this step)*.
   - The 503 of each kind leaves the conversation `working`, as a message does.
6. **The slow language question** *(found in step c03; decided with the Product Owner before
   this step)*. When the language
   question took so long that a step of 22 seconds no longer fits in the function's time, the
   function saves the message with its language and answers `working` without asking for the
   step: the screen's `continue` asks. The threshold is worked out from the function's
   remaining time (`context.getRemainingTimeInMillis()`), not a number of its own. A unit test
   on each side of it.
7. **The line of progress** (`activity`): one fixed text per kind of read, in both languages,
   in `shared/src/assistant/` with the other texts, chosen from the tools just run (the last
   one when several). If `shared/` has no such texts, add them there first, with their tests,
   the Italian in the formal "lei" style of the others. `GET /assistant/conversation` gives the
   same line while the conversation is `working`.
8. **What a person reads.** `shown()` keeps hiding the entries that carry tool requests and
   tool results. An answer of Claude that holds both text and a tool request shows its text.
   Check the `seq` numbers a person then sees, and say so in `docs/journeys/concepts.md`.
9. **The template.** `ContinueAssistantFunction` with its role, log group and route, 29
   seconds, the `assistant` table's two permission sets and the read of the key, as
   `SendAssistantMessageFunction`. **Both functions gain `CalendarReadPolicy`** and the
   variables F4's point 3 found, and nothing else of the calendar: no write, no Cognito. If a
   read handler needs a Cognito permission, stop and say which, before adding it.
   `GetConversationFunction` and `EndConversationFunction` do not change. Explain the change
   in plain terms in the report, with what the two bundles weigh before and after.
10. **The instructions say what works** *(decided with the Product Owner before this step)*. `INSTRUCTIONS` is
    changed so that the model offers only what its tools can do: reading the settings, the
    types, the free slots and the appointments. For a booking, a change or a cancellation it
    says that this is done from the web pages for the time being. **This sentence is a stopgap,
    not the design**: the finished assistant sends nobody to a web page for anything it is meant
    to do. Each step that brings a tool takes its ability out of the sentence, and the step
    that brings the last tool removes the sentence; what then stays in the web pages is only
    what `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3.1 lists. Write this rule in the "As
    done" note of step c04 in `docs/CONVERSATIONAL_PLAN.md` and in `backend/CLAUDE.md`
    ("`src/assistant/`"), so that the later steps find it. The version mark changes by itself,
    and the conversations in progress end: that is its purpose.
11. **F2, second half**: a `no-restricted-imports` rule in the root `eslint.config.js` so that
    nothing under `backend/src/assistant` imports `lib/calendarDb.ts` (nor `calendarRules.ts`,
    nor `calendarEvents.ts`: say if one of them must stay allowed, and why). Show the rule
    refusing an import written on purpose, then remove it.
12. **The fake Claude learns tools.**
    - Answers that are tool requests, scripted per step as the file already allows: first step
      the request, second step the text.
    - **Dates.** A scripted request cannot hold a fixed date: the journey's slot is days ahead
      of the real today. One more mark the fake replaces, in the style of
      `{{application-line}}`: propose its form (a date so many days after the date of the
      application's line, for instance) and say why.
    - **The answer must hold what the tool returned**: a mark replaced by the last tool result
      of the request, so that a journey can read in the assistant's text the slot it created.
    - The tool request bodies are recorded from the real model in this step's trial, cut down,
      not invented.
13. **The journeys and the calendar.** The assistant's journeys now read the `calendar` table,
    which the back end's calendar journeys empty and the front end's share.
    - They never reset it. They create what they need through the API as the Administrator (a
      type of their own name, a one-off window on a date far ahead, in a band of dates no
      other journey uses: read `docs/journeys/concepts.md`, "One local calendar, shared", and
      say which band) and remove it at the end and before the start.
    - Each block keeps its own throw-away User, as now.
    - The integration files run one at a time and in no fixed order: no block relies on what
      `calendar.test.ts` left.
14. **Logs.** The assistant's line gains the tools run (names only, with the status each
    route answered and its milliseconds) and the count of steps of the message. Never an
    input, never a result, never a text. A unit test serialises the line with a note and a
    username of another person in the tool's result, and finds neither.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c04 lists, with point 6 and point 10 added.

- **Code:** `backend/src/assistant/tools/` (points 1 to 3), `exchange.ts` and
  `conversation.ts` (points 4 to 8), `prompt.ts` (point 10),
  `backend/src/handlers/continueAssistant.ts` (point 5), `backend/template.yaml` (point 9),
  `shared/src/assistant/` only for point 7, `eslint.config.js` (point 11),
  `backend/docker/fake-claude.mjs` and the scripted answers (point 12),
  `backend/tests/integration/setup.ts` and `assistant.test.ts` (point 13).
- **Unit tests**, `lib/anthropic` and the handlers mocked where the core is tested, a fixed
  "now":
  - each tool's parts: the event it builds, the result it makes from a recorded answer of its
    route, a refusal of the route as a result;
  - local time in and out on the two nights the clocks change;
  - a result over the cap, cut at a whole item with its line;
  - the tools offered per role; a tool unknown, not of the role, with a wrong input;
  - the limit of 8; the slow language question; several reads in one answer; one write;
  - `continueAssistant`: each answer and each refusal, the 503 kept `working`, the race;
  - what a person reads of a conversation with tools in it;
  - the log line of point 14.
  - 100 % of the lines of `backend/src/assistant`, `backend/src/lib` and `shared/src`.
- **Journeys**, on the fake, each `describe` with its page written and checked with the skill
  `explain-journey` (a checker in a fresh context, its points answered):
  - a read exchange with `continue`, whose answer holds a slot the journey created;
  - `continue` with nothing to continue;
  - a second message while a step waits (`assistant_busy`);
  - an outage in the middle, then `continue` carries on.
  - **The block "when Claude cannot answer" of step c03 changes**: after a 503, `continue` is
    the way on. Its page changes in the same commit. So does `concepts.md`.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c04 in the v13 entry; section 4, the row of
    `POST /assistant/continue`, the paragraph "The assistant's routes" (the read branch,
    `continue`, the limit of 8, the tools per role, the log line) and the row of
    `nothing_to_continue`; section 7.1 (the roles); section 9.2 and 12 where they name the
    functions and the folder.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v7: the status line, the change log, and each
    section where the implementation fixed a detail (5.1, 5.6, 7.3, 7.4, 8.2, 8.3, 12.1).
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, F2 and F4 closed where the plan lists
    them, an "As done" note under step c04, and step c05's list completed with what this step
    left to it.
  - `docs/COMMANDS.md` (the new route by `curl`, the journeys and the calendar, the fake's two
    new marks), `docs/FOLDER_STRUCTURE.md`, `backend/CLAUDE.md` ("`src/assistant/`": the tools
    folder, how to add a tool). `docs/journeys/README.md`: the new pages.
  - `CLAUDE.md` only if a line of it became untrue. It has 199 lines of its 200. Report the
    line counts of both `CLAUDE.md` files.

Not in this step:
- any change to the calendar: the change tools, the proposal, `confirmProposal`,
  `declineProposal`, the status `awaiting_confirmation` (step c05 and after);
- any change to a calendar handler or to `lib/calendarDb.ts`, unless F4 forces one and I said
  go;
- the screen and anything in `frontend/` (step c12);
- the evaluation, the choice of the model and of the effort (step c10);
- the open points P1 to P7 and the findings F5 and F6: if this step runs into one, report what
  you saw and leave it to its step;
- the cloud: no deploy, no `aws` command against a real account.

## How we work in this step

- **The local stack:** I start it before the session. Run
  `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself when `local-seed.sh`, the compose
  file or the wiring changes: it is idempotent and local. Do not run `local:down`.
  **`local:api` is mine: when it needs a restart, tell me and wait.** Plan the restarts so that
  there are as few as possible, and say at each one what it is for.
- **The trial with the real key**, for the acceptance:
  - wire the real Claude with the key given to that one command,
    `ANTHROPIC_API_KEY="$ASSISTANT_TRIAL_KEY" ASSISTANT_DAILY_MESSAGE_LIMIT=30 DYNAMODB_PORT=8002 npm run local:up -w backend`,
    never exported; ask me for the restart;
  - **make the week yourself**, with a script in the scratch folder that calls the local API
    as the Administrator: a type, windows on the days of next week, two appointments of
    `alice`, one of another User. Not `seed:local`: after the calendar journeys it does
    nothing. Remove what the script made when the trial is over;
  - by `curl`, as `alice`: "Which slots are free next week?", with every `continue` until
    `idle`; then, in a new conversation, "Quali appuntamenti ho?". Once more as `admin`, a
    question that needs another person's appointments. Report per exchange the tools asked
    for with their inputs, the seconds of each step, the answer, and whether it is right
    against what the script made;
  - then `local:up` without the key, ask me for the restart, and **leave the stack on the
    fake**.
- **The key** never appears in a command's text, in your output, in a file of the repository
  or in a test, and is never an argument of a command. Read `backend/env.local.json` by the
  names of its variables, never print it. If a tool's output shows the key by accident, say so
  at once: I rotate it.
- **Money:** a few cents. More than about thirty requests to the real model: stop and ask.
- **Hard rules:**
  - `backend/src/assistant` reaches the calendar through a handler only;
  - `@anthropic-ai/sdk` is imported only in `backend/src/lib/anthropic.ts`; the AWS SDK only
    under `backend/src/lib`;
  - unit tests reach no network; the journeys run on the fake and refuse the real Claude;
  - the existing tests keep passing unchanged, except those of the three places this step
    replaces. Say which changed and why;
  - never run the back end's and the front end's integration tests at the same time;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief, step or finding name in a comment;
  - a new or changed Mermaid diagram follows `.claude/rules/diagrams.md` and is rendered on a
    dark page before it is called done.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan, Anthropic's documentation and this
  brief disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed
  change. The architecture wins over the plan, and the plan over this brief, except for points
  6 and 10 and the daily count of point 5, which the Product Owner decided before this step. What Anthropic's API really does wins over all of them,
  and changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c04)

- F4 answered, point by point, with what was read.
- The design points applied as written (any deviation reported with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- The lint rule of F2 shown refusing an import of `lib/calendarDb.ts` under
  `backend/src/assistant`.
- The journeys above green on the fake, with their pages, each checked; the checker's points
  listed with what was done about each.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green, on the fake. It empties the local
  `calendar` table: say so.
- With the real key, the exchanges of "How we work", reported as asked there. The stack back
  on the fake, no key left in `backend/env.local.json`.
- `docs/ARCHITECTURE.md` section 4 holds the route `POST /assistant/continue`.
- In the report: the four tools as Claude sees them (name, description, schema); what a step
  that reads costs in reads and writes of the two tables; the weight of the two bundles; in
  plain words, what the template gained; what step c05 finds ready and what it must do; the
  scratch folder's scripts deleted, and what the trial left in the local tables.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step c05.
