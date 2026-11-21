# Shared Calendar: the conversational interface (implementation plan)

| | |
|---|---|
| Status | v2, planned (2026-11-21, brief `prompts/a2-plan-implementation-conversational-interface.md`). Steps c00 to c16. **Step c00 done** 2026-11-21 (brief `prompts/a3-step-c00-implementation.md`). **Step c01 done** 2026-11-21 (brief `prompts/a4-step-c01-implementation.md`). **Step c02 done** 2026-11-21 (brief `prompts/a5-step-c02-implementation.md`). **Step c03 done** 2026-11-21 (no brief: asked for in the session of step c02). **Step c04 done** 2026-11-21 (brief `prompts/a6-step-c04-implementation.md`). **Step c05 done** 2026-11-21 (brief `prompts/a7-step-c05-implementation.md`) |
| Scope | Everything needed to go from `docs/CONVERSATIONAL_ARCHITECTURE.md` v2, a proposal, to the assistant built, tested locally, judged with the real model, shown on its screen, deployed to `shared-calendar-api` and smoke-tested |
| Not in scope | A second channel (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 16). The deployment of the front end, which is deployed nowhere today (open point P7, section 2.2). Creating and deleting users by conversation (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3.1) |
| Governed by | `docs/CONVERSATIONAL_ARCHITECTURE.md` for what is not built yet. `docs/ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md` and `docs/FRONTEND_ARCHITECTURE.md` for everything that exists, and for each part of the assistant from the step that merges it into them (section 4). On any conflict with this plan, they win |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-21 | First version: seventeen steps, numbered 70 to 86 |
| v2 | 2026-11-21 | **The steps renamed** c00 to c16, in order: c00 is the former 70, c16 the former 86. The letter and the two digits keep them apart from the numbered steps of the other plans and from the briefs in `prompts/` (`a1-…`, `a2-…`). Commits and briefs written before this version use the numbers. No step changes |

---

## 1. How to use this plan

The plan is a sequence of **steps**, named c00 to c16: a series of their own, told apart by
its letter from the numbered steps of `docs/IMPLEMENTATION_PLAN.md` and
`docs/FRONTEND_VIEW_PLAN.md`. It follows the working rhythm of `CLAUDE.md`: one step at a
time, its acceptance check, an honest report (failures included), then a stop for review. Commit
only when asked.

- Paths are from the repository root. Commands use the workspace form
  (`npm run <script> -w backend`), with `DYNAMODB_PORT=8002` on this machine.
- Every step ends with something that can be run again: a test, a journey, a command, a walk.
- Effort figures are indicative. Total: about 95 hours, some 12 working days.
- **When a step proves `docs/CONVERSATIONAL_ARCHITECTURE.md` wrong, the step stops and proposes
  the change to that document.** The code does not silently diverge from it.
- **An open point is closed in its step, in front of the Product Owner, never on the way.**
  Section 2 says which step holds which point. A step that holds one reports the evidence and a
  proposal, and the decision is the review's.
- **No cloud command before step c15.** Steps c00 to c14 need Docker and, where said, an Anthropic
  API key in the shell. Nothing is deployed, and no `aws` command that changes something is run,
  without an explicit instruction in the request of that step.
- **The calendar is not changed.** No rule, route or handler of the calendar changes in this
  plan. If a tool needs something a handler does not give, the step stops and reports it: it is
  a finding, not a task of the step.

## 2. What is settled, what is open

### 2.1 Settled before the first step

Decided in the clarification round of the brief
(`prompts/a2-plan-implementation-conversational-interface.md`):

| Question | Decision | What it means for the plan |
|---|---|---|
| Where the plan lives | A document of its own, steps named from c00 | This file. `docs/IMPLEMENTATION_PLAN.md` gets a pointer and no step |
| An Anthropic API key during the build | **Available from the start** | The assumptions about Anthropic's API are tried with one real request in step c02, and the evaluation (step c10) comes before the screen, as `docs/CONVERSATIONAL_ARCHITECTURE.md` section 19 orders it |
| Cloud deployments | **One, at the end** (step c15) | Everything is proven locally first. P2 is closed there: it has a known fix either way |
| Anthropic's data terms (P1) | A check of the deployment step | No prerequisite step. The feature is built before the terms are read; real users are not invited before |

### 2.2 The open points of the architecture, each in its step

The seven open points of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 18.2. None is decided by
this plan.

| # | Point | Step | How it is closed there |
|---|---|---|---|
| P1 | Anthropic's data terms for the account in use | c15 | The operator reads the account's settings and terms. The result is written in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.2. Until then nobody but the operator is invited |
| P2 | Whether reading the key needs `kms:Decrypt` | c15 | The deployment is made without the statement. The smoke test's exchange tells. If the key cannot be read: one statement naming the key, a second deployment, each with its own go |
| P3 | The capacity of the `assistant` table under a long conversation | c09 | A journey fills a conversation to its bound and records the read and write units of each step. The report compares them with 8 / 6 and the burst allowance and proposes to keep or lower the 100 KB bound and the 6 KB cap |
| P4 | Effort level and model | c10 | The first evaluation run, at two effort levels and on two models: quality, seconds per step, cents per exchange. The Product Owner chooses |
| P5 | Blocking time by an override the model works out | c10 | The evaluation's blocking requests. If the hours come out wrong, the tool `block_time` is proposed, and built only after the Product Owner's go, as an addition to step c10 |
| P6 | A typed "yes" drops the proposal | c13 | The walk with the real model, by the Product Owner too. If people type more than they press, the fixed list of words matched in code is proposed, and built only after the go |
| P7 | The front end is deployed nowhere | c16 | **Stays open**, on purpose: this plan does not deploy the front end. Step c12 makes the screen work locally through the dev server. Step c16 adds the assistant's routes to what `docs/FRONTEND_ARCHITECTURE.md` section 10 says a deployment must cover |

### 2.3 What planning found, each in its step

Reading the architecture against the repository brought up six points it does not settle. They
are not open points of the architecture yet. Each is raised in the step named, with a proposal,
before the code that depends on it. F1, F2, F3, F4 and F5 are closed: the "As done" notes of steps
c02, c03, c04 and c05 say how.

| # | Finding | Step |
|---|---|---|
| F1 | **Five things `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2 and 6.1 take from Anthropic's documentation and nobody has tried**: a line with `role: "system"` inside `messages`. Adaptive thinking with `effort: "low"`. An answer constrained to a list (the language question). The two cache marks. The two error shapes of the spending limit. If one does not hold, the design of section 7.2 changes before the core is written on it. **Closed in step c02**: tried, with a sixth (the conversation sent back exactly as stored). One did not hold, the shapes of the spending limit, and `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1 was changed | c02 |
| F2 | **Nothing enforces the two import rules** (the Anthropic SDK only in `backend/src/lib/anthropic.ts`. `backend/src/assistant` never imports `lib/calendarDb.ts`). The root `eslint.config.js` restricts imports for `frontend/src` only. Proposal: two `no-restricted-imports` rules. **The first rule is in place since step c02**. **Closed in step c04**: the second rule refuses `lib/calendarDb`, `lib/calendarRules` and `lib/calendarEvents` under `backend/src/assistant` | c02, c04 |
| F3 | **Coverage.** The back end's 100 % line threshold covers `src/lib` only. The architecture asks it for `backend/src/assistant` too (its section 12.2). The six handlers stay outside the threshold, as every handler does. **Closed in step c03**: `backend/vitest.config.ts` holds `src/assistant` to 100 % lines | c03 |
| F4 | **A handler called as a tool writes its own log line**, so one step of the assistant writes several lines with one request id, and a handler reads its environment as if it were alone in the function. Whether the lines can be told apart, and whether any handler keeps state that two calls in one function would share. **Closed in step c04**: nothing to change. The lines share the request id and differ by `route`; the only state is the calendar's configuration and the DynamoDB client, the same for every caller | c04 |
| F5 | **What the two read-only functions carry.** To build a proposal they need the change tools' definitions and their fact reading, not the change handlers. Proposal: the part that runs a change is a module only `confirmProposal` imports, so the code that writes the calendar is not even in the other two bundles. **Closed in step c05**: it holds, without touching a calendar handler or `lib/calendarDb.ts`. `tools/changeHandlers.ts` is the one module that imports a change handler, `confirm.ts` the one that imports it, `handlers/confirmProposal.ts` the one handler that imports `confirm.ts`; a lint rule refuses any other such import; after a build, the calendar's write under the lock and the booking handler are in the bundle of `ConfirmProposalFunction` and in none of the other five | c05 |
| F6 | **Booking for a User, proposed by a function without `AdminGetUser`.** The proposal's facts can only come from the users' list (`ListUsersInGroup`). Whether that is enough for the confirmation to name the person, or the proposal goes out unchecked and the route refuses at the confirmation | c07 |

## 3. What is built

| Part | Where | Steps |
|---|---|---|
| The contract: codes, `AssistantReply`, languages, limits, fixed texts | `shared/src/assistant/`, `shared/src/api.ts` | c00 |
| The table `assistant` and its module | `backend/template.yaml`, `backend/scripts/local-seed.sh`, `backend/src/lib/assistantDb.ts` | c01 |
| The model's module, the key, the fake Claude | `backend/src/lib/anthropic.ts`, `backend/docker/`, `backend/docker-compose.yml` | c02 |
| The core and the six functions | `backend/src/assistant/`, `backend/src/handlers/` | c03 to c05 |
| The tools | `backend/src/assistant/tools/` | c04 to c08 |
| The journeys and their pages | `backend/tests/integration/assistant.test.ts`, `docs/journeys/backend/` | c03 to c09 |
| The evaluation | `backend/scripts/`, `backend/tests/eval/` | c10 |
| The screen | `frontend/src/services/`, `frontend/src/logic/`, `frontend/src/views/`, `frontend/index.html` | c11 to c13 |
| The operator's tooling and the deployment | `backend/scripts/assistant-key.sh`, `backend/scripts/smoke.sh`, `docs/RUNBOOK.md` | c14, c15 |

The order: the contract, then the three modules everything stands on, then the conversation
with nothing but text, then reading, then the mechanism of a change with one change, then the
other changes. A change is built once, on the simplest case, before twelve tools depend on it.
The model is judged before the screen is built, so that the screen is built on instructions and
tools that are not going to move.

## 4. What every step does

**The gate of every step** is the root `DYNAMODB_PORT=8002 npm run verify`: the back end's gate
(typecheck, lint, audit, `sam validate --lint`, unit tests, journeys, with `shared/`), then the
front end's. It needs `npm run local:up -w backend` and `npm run local:api -w backend` running,
**with the fake Claude**: from step c02 the journeys refuse to start otherwise. `local:api` is
restarted after every step that adds a function.

Beside the gate, every step:

1. **Keeps the coverage.** 100 % lines on `shared/src`, `backend/src/lib`, `frontend/src` and,
   from step c03, `backend/src/assistant`. Unit tests reach no network: `lib/anthropic` is mocked
   in the core's tests, and the Anthropic SDK's client in the tests of `lib/anthropic` itself.
2. **Uses a fixed "now"** in the unit tests (`vi.setSystemTime`), and dates counted from the
   real today with the shared time helpers in the journeys, as the calendar's steps do.
3. **Asserts the log line.** Every test of a handler and of a step of the core asserts the log
   line and that it holds no text of a message, of an answer, of a tool's input or result
   (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.1).
4. **Adds its journeys** to `backend/tests/integration/assistant.test.ts`, one `describe` per
   theme, each with its page in `docs/journeys/backend/`, written with the project skill
   `explain-journey` in the same change. The journeys play their people with throw-away Users
   created through `POST /users`, and end those people's conversations at the start.
5. **Merges what it built** into the document that governs it from then on, in the same change:
   routes, table, roles and security rows into `docs/ARCHITECTURE.md`. The service into
   `docs/FRONTEND_SERVICES.md`. The screen into `docs/FRONTEND_ARCHITECTURE.md`. New files into
   `docs/FOLDER_STRUCTURE.md`, new commands into `docs/COMMANDS.md`. Step c00 opens the merge
   and step c16 closes it. `docs/CONVERSATIONAL_ARCHITECTURE.md` keeps what is not built yet,
   and a finding of a step is corrected there.
6. **Reports** the gate's result, the step's own checks line by line, every finding, and the
   state of the open point or finding the step holds.

The back end's calendar journeys empty the local `calendar` table and run in the same gate, one
file at a time. The assistant's journeys create the types and windows they book in, on dates of
their own, and remove them at the end.

---

## 5. Steps

### Step c00 — Shared: the contract (≈ 4 h)

**Goal:** what the back end and the screen agree on exists as types, schemas and texts, before
any code uses it.

Files, in `shared/src/assistant/` (exported by `shared/src/index.ts`), with the codes in
`shared/src/api.ts`:

- the new error codes: `assistant_busy`, `conversation_full`, `nothing_to_continue`,
  `proposal_not_found`, `assistant_limit_reached`, `assistant_unavailable`,
  `assistant_budget_reached`;
- `AssistantReply`, its `proposal` and its actions' outcomes; the body of
  `POST /assistant/messages` as a `zod` schema (1 to 2 000 characters after trimming, no other
  field);
- the supported languages (`en`, `it`) as one list;
- the limits of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.4 as defaults, like the
  calendar's;
- the fixed texts, one file per language: the three sentences of its section 6.1, "nothing was
  changed", "the answer was cut short", the step limit's sentence, the refusal's sentence, the
  labels of the two buttons, the progress lines. A test fails when a text exists in one
  language and not in the other.

The texts of each tool's confirmation are added by the step that adds the tool (c05 to c08).

Documents: `docs/CONVERSATIONAL_ARCHITECTURE.md` status "under way" and a line on where the
truth lives while the assistant is built; `docs/ARCHITECTURE.md` a change-log entry that opens
the merge; `shared/CLAUDE.md` if the new folder needs a line.

**Acceptance:** the gate green; 100 % lines on `shared/src`; `shared/` still imports only
TypeScript and `zod`; the test on the two languages passes.

**As done** (2026-11-21). As written, with these differences, each asked by the step's brief:

- the texts are one object per language of one type, `AssistantTexts`, so a text missing in
  one language already fails the typecheck. The test checks at run time what the compiler
  does not: the same keys, and no text empty;
- of "the progress lines" only the general one ("Working…") is here. The line of each read
  arrives with its tool (steps c04 to c08), like the wording of each change;
- two texts more than listed above: the sentence of a conversation that is full, and the
  opening words of a proposal's question, for one change and for several;
- a refused action carries its route's error code in a field `error`, `null` on every other
  action, named in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6 at the review;
- the Italian texts address the person with the formal "lei", decided at the review
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.2);
- `docs/ARCHITECTURE.md`: v12 closed and v13 opened for the assistant's merge, and the seven
  codes listed in its section 4.

---

### Step c01 — The table and its module (≈ 6 h)

**Goal:** a conversation can be stored, read, moved from state to state and left to expire,
with no model anywhere.

Files:

- `backend/template.yaml`: `AssistantTable` (keys, time to live on `expiresAt`, 8 / 6
  provisioned, deletion protection off) and the shared permission set `AssistantTablePolicy`.
  In plain terms: one more table and one more reusable list of permissions, attached to no
  function yet;
- `backend/scripts/local-seed.sh`: the table `assistant` in DynamoDB Local; `env.local.json`
  gains `ASSISTANT_TABLE`;
- `backend/src/lib/assistantDb.ts`: the one consistent `Query` of a step; the one transaction
  of a step, conditional on `version`; starting, ending and replacing a conversation; taking a
  proposal (the conditional write of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rule
  6); the daily use; the expiry checked in code (24 hours after the last message, 48 after the
  first); the messages of an earlier conversation skipped.

Tests (unit, `aws-sdk-client-mock`): every state change; a write refused because the version
moved; two takes of one proposal; a conversation run out read as absent; `storedBytes` and
`messageCount` kept right; the daily count on the calendar's date across midnight and on the
two nights the clocks change.

**Acceptance:** the gate green; 100 % lines on `backend/src/lib`; after `local:up` the table
`assistant` is in dynamodb-admin; `sam validate --lint` passes with the new resources; the
table's row is in `docs/ARCHITECTURE.md` section 5 and the capacity total (19 / 17) in its
section 10.

**As done** (2026-11-21). As written, with these differences. The first two were decided with
the Product Owner before the step and are in `docs/CONVERSATIONAL_ARCHITECTURE.md` v4:

- two permission sets, `AssistantReadPolicy` and `AssistantWritePolicy`, instead of the one
  `AssistantTablePolicy`;
- a step reads `META` and then the current conversation's messages only (two reads), instead
  of one `Query` of the whole partition that skips the earlier conversations;
- a message's `content` is stored as JSON text, so that it comes back exactly as given;
- the day's use is added inside the step's transaction, not by a write of its own: a step is
  counted exactly when it is saved;
- the module was also tried once against DynamoDB Local, outside the tests: a mocked client
  does not check that an expression is one DynamoDB accepts.

---

### Step c02 — The model's module, the key and the fake Claude (≈ 7 h)

**Goal:** one module can ask Claude and say what came back; locally a fake answers in its
place; the architecture's assumptions about Anthropic's API are tried.

**First, before any code: finding F1.** One throw-away script in the scratch folder sends real
requests with the operator's key and reports, for each of the five assumptions, what Anthropic
answered: the `role: "system"` line inside `messages`; adaptive thinking with `effort: "low"`
on `claude-sonnet-5-5`; the constrained answer of the language question; the two cache marks
(the second request reports cached input); and, read from Anthropic's documentation since they
cannot be provoked, the two error shapes of the spending limit. **If one does not hold the step
stops** with a proposal for `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2. The script is
not kept; what it found is written in that section.

Files:

- `backend/package.json`: the dependency `@anthropic-ai/sdk`, the first that is not AWS's;
  `npm audit` stays green;
- `backend/src/lib/anthropic.ts`: the only import of the SDK. One function for a step (tools,
  system, messages, thinking, `max_tokens`, cache marks, 22 seconds, no retry) and one for the
  language question. What comes back as one of: text, tool requests, cut short, refusal,
  unavailable, budget reached. The spending limit told apart exactly as
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1 says, and remembered for ten minutes. The
  token counts given back for the log;
- the key: from `ANTHROPIC_API_KEY` when set, else from Parameter Store, kept ten minutes. The
  read of Parameter Store is one more module of `backend/src/lib`, with the one new AWS client
  it needs;
- `backend/template.yaml`: the parameters `AssistantModel` (three allowed values) and
  `AssistantDailyMessageLimit`; `ANTHROPIC_API_KEY` declared empty;
- **the fake Claude**: a small Node script and its service in `backend/docker-compose.yml`. It
  answers the Messages API's address with scripted answers chosen by the text of the person's
  last message, and as Anthropic does for the spending limit and for an outage. Its scripts
  are data the journeys' file owns, so a journey and the answers it needs are read together;
- `local:up`: writes `ANTHROPIC_BASE_URL` and a placeholder key into `env.local.json`, or the
  real key and no base URL when `ANTHROPIC_API_KEY` is set in the shell. The journeys' set-up
  refuses to start when the stack is wired to the real Claude;
- **finding F2**, first half: the lint rule that keeps the SDK inside `lib/anthropic.ts`.

Tests (unit, the SDK's client mocked): every kind of answer; each error mapped to its code; an
ordinary 429 is `unavailable`, not `budget`; the ten minutes; no key, text or token in a log.

**Acceptance:** the gate green; 100 % lines on `backend/src/lib`; the report of F1, line by
line; `local:up` shows the fake running and a `curl` to it gets a scripted answer; with a real
key in the shell, `local:up` wires the real Claude and the journeys refuse to start.

**As done** (2026-11-21). As written, with these differences:

- **F1 was tried as six assumptions, not five**, on the three models `AssistantModel` allows.
  The sixth is that the conversation sent back exactly as stored is accepted. Five hold. The
  shapes of the spending limit did not: the step stopped there, and
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1 was changed with the Product Owner before
  any code was written. Its section 7.2 holds the results, line by line;
- **the two template parameters and the declaration of `ANTHROPIC_API_KEY` moved to step
  c03**, decided with the Product Owner before the step. A variable is declared on a function,
  and the first assistant function is step c03's: `backend/template.yaml` did not change here;
- the end of the conversation is marked for the cache by the request-level mark, which
  Anthropic places on the last entry, so the stored conversation is sent without a change;
- the module gives `unavailable` a reason for the log, among them one the list of this step
  did not have, "request refused", for a 400 that is not the spending limit;
- the model comes from the variable `ASSISTANT_MODEL`, the name of the Parameter Store
  parameter from `ANTHROPIC_KEY_PARAMETER`. A missing model is the module's one configuration
  error. A missing key is `unavailable`, not an error;
- the fake chooses an answer by the exact text of the person's last message, and the step of
  the exchange by the answers of Claude that follow it in the request, so it keeps nothing
  between two requests. Its file holds no tool request yet: they come in step c04;
- the module was run against the fake from the host, and once against the real API, outside
  the tests: a mocked client does not prove that the fake speaks well enough for the SDK.

---

### Step c03 — The conversation, text only (≈ 7 h)

**Goal:** a person writes, Claude answers in text, the conversation is remembered, the limits
hold. No tool yet. The first end-to-end path, and the place where the core's shape is fixed.

Files:

- `backend/src/assistant/`: the core's one step (`docs/CONVERSATIONAL_ARCHITECTURE.md` section
  5.6, the branch "Claude answers with text"); `prompt.ts` with the fixed instructions and
  their version mark; the context block; the line with the time now and the language; the
  language question at the first message; the limits (length, per day, per conversation); cut
  short and refusal; the 503 of each kind with the person's message saved;
- handlers `getConversation.ts`, `endConversation.ts`, `sendAssistantMessage.ts`, each with its
  function, role, log group and route in `backend/template.yaml`. `sendAssistantMessage` gets
  29 seconds, the assistant table and, in the cloud only, the read of the key. In plain terms:
  three more functions, none of which can touch the calendar yet;
- what step c02 left to this one, in `backend/template.yaml`: the parameters `AssistantModel`
  (three allowed values) and `AssistantDailyMessageLimit`. On the function that asks Claude,
  the variables `backend/src/lib/anthropic.ts` reads: `ASSISTANT_MODEL` from the parameter,
  `ANTHROPIC_KEY_PARAMETER` with the name `/<stack>/anthropic-api-key`, and `ANTHROPIC_API_KEY`
  and `ANTHROPIC_BASE_URL` declared empty, so that `env.local.json` can fill them locally and
  the cloud never does. Its role's statement `ssm:GetParameter` on that one parameter;
- **finding F3**: `backend/vitest.config.ts` puts `src/assistant` under the 100 % threshold;
  `CLAUDE.md` and `backend/CLAUDE.md` say so.

Tests: the core with `lib/anthropic` mocked, every branch; the three handlers; a conversation
whose version mark is not the deployed one is ended and a new one started.

Journeys: a text exchange read back with `GET`; Italian set by the first message and kept when
the person then writes in English; "New conversation"; the daily limit (a low limit given to
the local function); the spending limit and an outage at a message, each with its code and the
message kept; a token in neither group gets 403.

**Acceptance:** the gate green; the journeys above with their pages; with the real key, one
exchange by hand through `curl` in English and one in Italian, reported; the routes are in
`docs/ARCHITECTURE.md` section 4.

**As done** (2026-11-21). As written, with these differences:

- **the spending limit's memory can be shortened by a variable**,
  `ASSISTANT_BUDGET_MEMORY_SECONDS`, which only the local stack sets, to 0. Without it the
  journey that plays a spending limit left the function answering "budget reached" for ten
  minutes, to every journey after it and to the next run. `backend/src/lib/anthropic.ts`, of
  step c02, reads it. The cloud keeps the ten minutes;
- **the low limit of the local function is 10 messages a day**, written by `local:up` into
  `env.local.json`, with `ASSISTANT_DAILY_MESSAGE_LIMIT` in the shell for another value. The
  journeys read it from the file;
- **the version mark is worked out**, not written in `prompt.ts`: a hash of the instructions,
  the block about the person and the tools. Nobody can forget to move it, and a person whose
  role changes starts a new conversation;
- **a language question that cannot be asked saves nothing**: there is no conversation yet to
  save the message in. The 503 is answered and the person sends the message again;
- **a conversation left waiting for its step has no way on but "New conversation"** until
  `continueAssistant` exists (step c04): a message while it waits answers `assistant_busy`, as
  the contract says. The journeys end such a conversation;
- **a request for a tool, which this step never offers, is answered as `assistant_unavailable`**
  with the message saved and the step left to do. Step c04 replaces this with the error result
  of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.4;
- the core is four files: `config.ts`, `prompt.ts`, `conversation.ts` (reading, showing and
  ending, without the Anthropic SDK, so the two functions that never ask Claude do not carry
  it) and `exchange.ts` (a message and its one step);
- the fake Claude gained one thing an answer can ask of it: the text `{{application-line}}` is
  replaced by the last line of the application in the request. It lets the Italian journey read
  what Claude was told when the person wrote in English;
- the journey "a conversation whose version mark is not the deployed one" stays a unit test
  here; step c09 plays it as a journey;
- **found, for step c04:** a first message asks Claude twice in one request, the language
  question and the step, each allowed 22 seconds, in a function of 29. When both are slow the
  function is stopped and nothing is saved. Proposal for step c04, where `continue` exists:
  after a slow language question, save the message and answer `working`.

---

### Step c04 — Reading: the tools mechanism and the four read tools (≈ 8 h)

**Goal:** "which slots are free next week?" is answered from the calendar, step by step.

Files:

- `backend/src/assistant/tools/`: what a tool is (its four parts,
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.2); the event built for a handler with the
  caller's identity; the JSON Schema made from the `zod` schema; the result made small, in
  local dates and times, capped at 6 KB; a refusal as a result;
- the tools `get_settings`, `list_types`, `get_calendar`, `list_appointments`;
- the core: the branch "Claude asks only to read", the tools offered by role, a tool unknown or
  not of the role or with a wrong input, the limit of 8 requests per message, the progress
  line;
- handler `continueAssistant.ts` with its function and role; the two functions get
  `CalendarReadPolicy` and the calendar's environment;
- **finding F2**, second half: the lint rule that keeps `lib/calendarDb.ts` out of
  `backend/src/assistant`;
- **finding F4**, raised before the tools are written: what the handlers' own log lines look
  like inside a step, and whether any handler keeps state between calls.

Tests: each tool's parts; local time in and out on the two nights the clocks change; a result
over the cap cut with its line; the step limit; a User's request never names an
Administrator's tool.

Journeys: a read exchange with `continue` whose answer holds a slot the journey created;
`continue` with nothing to continue; a second message while a step waits (`assistant_busy`);
an outage in the middle, then `continue` carries on.

**Acceptance:** the gate green; the journeys with their pages; with the real key, "which slots
are free next week?" and "quali appuntamenti ho?" by hand against a seeded week, with the tools
asked for and the seconds per step reported.

**As done** (2026-11-21). As written, with these differences and findings:

- **finding F4: nothing to change.** A read handler's log line carries the route it stands for
  (`GET /calendar`) and the request id it was given, which is the one of the assistant's
  request: the two lines of a step share the id and differ by `route`. The handler's line names
  the person and says nothing of the assistant. The handlers keep no state between calls but
  the calendar's configuration, read once per container and the same for everyone. They read
  `CALENDAR_TABLE`, `CALENDAR_TIME_ZONE` and `DYNAMODB_ENDPOINT`; none uses Cognito;
- **finding F2 closed**: the lint rule also refuses `lib/calendarRules` and
  `lib/calendarEvents` under `backend/src/assistant`. Nothing there needs them;
- **decided by the Product Owner: `continue` is not a message of the day**, and the daily limit
  never refuses it. An exchange that started is not stopped half-way;
- **decided by the Product Owner: a slow language question leaves the step to `continue`** (the
  finding of step c03). The threshold is what Lambda says the function has left, against
  Claude's 22 seconds plus 2;
- **decided by the Product Owner: the instructions say what works.** `INSTRUCTIONS` gained the
  paragraph "What you can do for the time being": only looking things up works here, and
  booking, moving, cancelling, notes, opening hours, types and settings are done from the web
  pages for the time being. **This paragraph is a stopgap. Every later step that brings a tool
  takes its ability out of the paragraph, and the step that brings the last tool removes it**;
  only the list of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3.1 stays in the web pages.
  The paragraphs on changes and on blocking time were kept, with a sentence that they apply to
  a change that has a tool, so that no later step writes them again;
- the tools are nine files in `backend/src/assistant/tools/`: `tool.ts`, the four tools,
  `list.ts`, `event.ts`, `result.ts`, `run.ts`. **A tool is written as a plain object**: built
  through a helper function, the bundler kept the calendar's handlers in `getConversation` and
  `endConversation`, which only read the definitions;
- **the limit of eight is counted from the stored conversation**, Claude's answers since the
  person's last message. The eighth answer that still asks to read has its reads run and saved
  before the fixed sentence, because Anthropic refuses a conversation in which a request for a
  tool has no result;
- **a tool of another role is answered like a tool that does not exist**; of two `continue` at
  once, the loser answers `409 assistant_busy`;
- the line of progress is read from the conversation (the last tool asked for), so `GET` and
  the step agree without anything new stored;
- the night the clocks go back, `get_calendar` shows a local time twice, as the calendar does.
  A step that books must tell the two apart;
- **the fake Claude remembers one thing**: a step written `{ "once", "then" }` fails the first
  time a request comes and answers the second. Without it an outage that passes cannot be
  played: the request after the outage is the same request. Its two new marks are `{{date+N}}`
  and `{{last-tool-result}}`. The two tool requests in its file are the blocks the real model
  sent in this step's trial; the envelope around them is written in the shape of the recorded
  answers, since only Claude's content is stored;
- **the reading journey's day is 25 days ahead, 05:00–07:00**, not far ahead: the calendar's
  journeys leave bookings open 30 days, and beyond that a User is shown no slot;
- the access journey gained `POST /assistant/continue` (401 and 403);
- the trial with the real model (`claude-sonnet-5-5`), against a week made through the API and
  removed after: "Which slots are free next week?" asked `get_calendar` for Monday to Sunday,
  4.2 s then 2.1 s; "Quali appuntamenti ho?" asked `list_appointments` with no input, 2.5 s then
  1.7 s, answered in Italian with the formal "lei"; the Administrator's question about another
  person asked `list_appointments` with that `username` and `get_settings` in one answer, 3.3 s
  then 2.2 s. All three answers were right, and the two English ones added, without being asked,
  that changes are done from the web pages for now.

---

### Step c05 — A change: the proposal and booking (≈ 9 h, the largest step)

**Goal:** the whole mechanism of a change, on one tool, `book_appointment`: proposed, shown in
the server's words, confirmed with a button, run once, or declined, or dropped.

**First: finding F5**, which decides the layout of the files below.

What step c04 left ready: what a tool is, with its fourth part typed and empty
(`ToolConfirmation` in `backend/src/assistant/tools/tool.ts`) and its kind `change`, which
`runRead` already refuses to run; the event built for any route, body and path parameters
included; `continue`; the definitions kept apart from the handlers. What this step must also do:
give `ToolConfirmation` its shape; **take booking out of the stopgap paragraph of
`INSTRUCTIONS`**; tell the two 02:00 of the night the clocks go back apart in a booking's input;
decide what `continue` answers while a proposal waits (today `409 nothing_to_continue`).

Files:

- the core: the branch "Claude asks for a change"; the proposal built from the checked input
  and the facts read (the slot, its type), with the fixed texts; no proposal when the facts
  cannot be read; reads asked for in the same answer run and kept back; a message while a
  proposal waits drops it and tells Claude nothing was changed;
- `book_appointment`, its four parts, its confirmation texts in both languages in `shared/`;
- handler `confirmProposal.ts`: takes the proposal, runs the change through the route's
  handler, saves the outcome, asks Claude for the closing words; "outcome unknown" when a
  taken proposal was never finished. Its role is the only one with the calendar's write, delete
  and book permission sets and Cognito's `AdminGetUser` and `AdminListGroupsForUser`;
- handler `declineProposal.ts`.

Tests: every rule of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, one by one; a proposal
taken and not finished; the 503 after a confirmed change, with the outcome saved.

Journeys, those of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.2: a booking proposed,
confirmed and found in the calendar; a decline; a message that drops a proposal, a typed "yes"
included; a slot taken between proposal and confirmation, shown as refused; two confirmations
at once, one appointment; the spending limit after a confirmed change.

**Acceptance:** the gate green; the journeys with their pages; **a review of the three roles in
`backend/template.yaml`**, statement by statement, reported as a table: `sendAssistantMessage`
and `continueAssistant` hold no write on the calendar; no wildcard; with the real key, one
booking by hand from the sentence to the appointment.

**As done** (2026-11-21). As written, with these differences and findings:

- **finding F5 holds** (section 2.3), and decided the layout: `proposal.ts` (the stored shape,
  what Claude is told when a proposal is settled), `confirm.ts`, `decline.ts`,
  `tools/bookAppointment.ts`, `tools/changeHandlers.ts`. A tool is now one of two shapes,
  `ReadTool` and `ChangeTool`: a change tool has no "to the handler" part, its confirmation
  answers the facts and the request to run together, and the request is stored and run as
  stored;
- **decided with the Product Owner: `book_appointment` is offered to Users only.** The
  Administrator's booking for a User is step c07, with finding F6;
- **decided with the Product Owner: `confirmProposal`'s role holds what a User's booking
  needs**, not what this step's text lists: the assistant table's two sets, the read of the
  key, and the calendar's read, write and book sets. No `CalendarDeletePolicy` and no Cognito
  statement: step c06 brings the first with the changes that need it, step c07 the second.
  `sendAssistantMessage` and `continueAssistant` gained nothing;
- **decided with the Product Owner: the stored proposal is a list from the start**, of which
  one change is accepted: more than one in an answer makes no proposal, and each gets the error
  "one change at a time";
- **the night the clocks go back**: `get_calendar` writes the second of two equal free times as
  "02:00 (second)", and `book_appointment` takes an optional `occurrence`, `first` or `second`;
  a time that comes twice asked without it is an error that tells Claude to ask. A time the day
  does not have is an error too;
- **a proposal a confirmation took**: under way (taken less than 31 seconds ago, the function's
  29 plus 2) a message and `continue` answer `409 assistant_busy`; left (older) the next message
  or `continue` records each change as `unknown` first. A second `confirm` and a `decline`
  answer `404` in both cases, `GET` shows `working`, `DELETE` ends the conversation;
- **`continue` while a proposal waits stays `409 nothing_to_continue`**; a settled proposal is
  shown until the person's next message;
- **a change whose route failed** (a status of 500 or more, or a handler that threw) has the
  outcome `unknown`, not `refused`: nobody knows whether the write happened;
- **the stopgap paragraph of `INSTRUCTIONS`** is one for both roles: a User can book for
  themself; moving, cancelling, notes, opening hours, types and settings are done from the web
  pages, and so is the Administrator's booking for a User;
- **the local wiring needed no change**: the two functions get their environment from the
  `Parameters` block of `env.local.json`, which `local:up` already writes;
- **the fake Claude learnt nothing new**: the text of the person's last message and the count of
  Claude's answers since it are enough. Five booking answers were added, each the block the real
  model sent, with the date as a mark and the hour of its journey;
- **the journeys** are three new blocks, each with its own User, its own day (26, 27 and 28 days
  ahead, 05:00–07:00, and 04:00–07:00 for the third) and its own type name; they cancel what
  they booked and remove their window and type before and after. The file first removes what an
  interrupted run of any block left on a day from tomorrow to 28 days ahead: the blocks open
  the same early hours on neighbouring days, and a window left by one would stand in the way of
  another a day later. The access journey gained the
  two routes;
- **found in the trial with the real model** (`claude-sonnet-5-5`, 15 requests): after a
  confirmed booking, Claude's closing words said the booking still waited for the person's
  confirmation, because the result it was given held the appointment and nothing about the
  button. **Fixed in this step**: the result of a change that was made starts with "the person
  pressed the confirm button and the change was made". After the fix: "book me Wednesday at 9,
  note: bring the documents" read the day (4.1 s), asked for the booking (1.8 s), and after the
  confirmation said what was booked (2.0 s). A decline asked Claude nothing. A typed "yes" made
  Claude ask for the same booking again, and nothing was booked (open point P6 of
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 18.2). A slot taken between the proposal and
  the confirmation was shown `refused` with `slot_taken`. The Administrator asking to book a
  User was told that it is done from the web pages. The model never asked to book a slot it had
  just read as busy, so the tool's own "no free slot" error was not seen in the trial.

---

### Step c06 — The other appointment changes (≈ 6 h)

**Goal:** cancel, move and note; several changes in one proposal.

What step c05 left ready: the whole mechanism on one tool. A change tool is a definition, a
confirmation (`read` answers the facts and the request to run, `summary` words them through a
function of `shared/src/assistant/`) and what Claude gets of the route's answer; its handler is
one line in `tools/changeHandlers.ts`. The stored proposal and the screen's `actions` are lists
already, and the confirmation runs each change in order with its own outcome. What this step
must also do: lift the limit of one change per proposal (`asksForChange` and the branch of the
step in `exchange.ts`), with the limit of five; give `confirmProposal`'s role
`CalendarDeletePolicy` if one of the three routes needs it; take moving, cancelling and notes
out of the stopgap paragraph of `INSTRUCTIONS`; extend the lint rule's list of change handlers
only if a handler's file name is not in it.

Files: `cancel_appointment`, `change_appointment`, `set_appointment_note`, each with its four
parts and its texts in both languages; a proposal of up to five changes, listed one by one,
run in order, each with its outcome; a sixth change refused to the model.

Tests: the facts of each confirmation (the appointment an id stands for; for a move, the old
and the new time); an id that does not exist gives no proposal; one change refused does not
stop the others; a User proposing a change to another person's appointment gets the route's
refusal.

Journeys: "cancel both", confirmed together, one of the two inside the notice and refused; a
move confirmed and found; a note set.

**Acceptance:** the gate green; the journeys with their pages. Checkpoint: everything a User
can do by conversation works locally.

---

### Step c07 — The Administrator: users' list, settings, types, booking for a User (≈ 6 h)

**Goal:** the Administrator's simpler tools.

**First: finding F6**, on what the confirmation of a booking for a User can show.

What step c05 left ready: `book_appointment` exists for Users, with its roles list holding
`user` alone and its input without a username; a unit test shows that an Administrator's
request to Claude never names it. `confirmProposal`'s role has no Cognito statement, and the
booking handler asks Cognito only when the Administrator books for a User: this step gives the
role `AdminGetUser` and `AdminListGroupsForUser`, and takes the Administrator's booking out of
the stopgap paragraph of `INSTRUCTIONS`.

Files: `list_users`, `list_patterns`, `update_settings`, `create_type`, `rename_type`,
`delete_type`, with their texts; `book_appointment` for a named User; the three functions get
Cognito's `ListUsersInGroup` on the user pool.

Tests: each tool; a settings proposal shows the values as they are and as they would become; a
type in use refused at the confirmation.

Journeys: **a User not offered an Administrator's tool** (the fake asks for one: the core
refuses before any handler is called); a setting changed and read back, then put back; a
booking for a User found in that User's list.

**Acceptance:** the gate green; the journeys with their pages; the roles' review of step c05
repeated for what changed.

---

### Step c08 — The Administrator: availability and blocking time (≈ 8 h)

**Goal:** patterns, date overrides, one-off windows, and "block Tuesday from 14:00 to 16:00".

Files: `create_pattern`, `update_pattern`, `delete_pattern`, `set_date_override`,
`delete_date_override`, `create_one_off_window`, `delete_one_off_window`, with their texts;
the confirmation of an override shows the day as it is and as it would become; the
instructions' part on blocking time; a route's refusal with its list of appointments in the
way made small for the model.

Blocking is built here as `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3 describes it: the
model works out what is left of the day. Whether that is good enough is open point P5, judged
in step c10, not here.

Tests: each tool; the day before and after in the confirmation, for a day of patterns, a day
already overridden and a day closed; an empty list closes the day.

Journeys: a block proposed (the fake gives the hours left), confirmed, the day's free slots
read back; a block over an appointment, refused with the appointment named; a pattern created
and deleted.

**Acceptance:** the gate green; the journeys with their pages; with the real key, three
blocking requests by hand, the proposed hours reported as they came. Checkpoint: every tool of
`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3 exists.

---

### Step c09 — Back end closing: capacity, logs, repeatability (≈ 5 h)

**Goal:** the back end is finished as a whole; **open point P3** has its numbers.

- **P3.** A journey fills one conversation to its bound, with the largest results the tools
  give, and records the consumed read and write units of every step (DynamoDB returns them on
  request). The report gives the worst step and the units a minute of busy use takes, against
  8 / 6 and the burst allowance, and proposes: keep the bounds, or lower the 100 KB or the
  6 KB. The Product Owner decides; a changed bound is a default in `shared/`.
- **The logs.** After the whole run of the journeys, a search of the local API's output for the
  texts the journeys sent, the notes they wrote and the key's placeholder finds nothing.
- **Repeatability.** The gate twice in a row on the same stack, both green; then on a fresh
  stack.
- **A conversation under a new version mark** ends, by journey: the local function is started
  with another mark.
- **The documents so far:** `docs/ARCHITECTURE.md` holds the six routes, the table, the six
  roles, the security rows and residual risks of `docs/CONVERSATIONAL_ARCHITECTURE.md` section
  10.3; `docs/journeys/README.md` lists every new page.

**Acceptance:** the gate green twice; P3's numbers and the decision taken at the review written
in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 9 and 18.2; the log search empty.

---

### Step c10 — The evaluation with the real model (≈ 8 h, needs the key, costs money)

**Goal:** to know whether Claude, with these instructions and tools, understands people; **open
points P4 and P5** decided on evidence.

Files:

- the list: about forty requests in English and in Italian, each with what can be checked
  mechanically (the tools asked for, the dates, whether a proposal came out and what it says):
  the brief's examples, relative dates, ambiguity that must produce a question, blocking a
  time window, a request for something the web pages keep, a note that tries to give orders;
- a seed of a known week, so that an expected answer is a fact;
- the command `npm run assistant:eval -w backend`, **outside** `verify`: it refuses to run
  without a real key and against anything but the local stack, and prints, per request, pass
  or fail, the steps, the seconds and the tokens, then the totals and the cost.

**Before the first run** the step states what it will spend at most, and waits for the go.

The runs, and what each decides:

- **P4**: the list at `effort: "low"` and at one level above on `claude-sonnet-5-5`, and once
  on `claude-haiku-5-5`. A table: requests passed, seconds per step, cents per exchange. The
  Product Owner chooses the effort and the model; the template's default follows.
- **P5**: the blocking requests, read one by one. If the hours are wrong in any of them, the
  step proposes `block_time` (a composed tool; the interval taken out of the day's windows by
  a pure function in `shared/`). **Built only after the go**, as an addition to this step of
  about 4 hours, with its tests, its journey and a second run of the blocking requests.
- The instructions are corrected where a failure shows they are unclear, and the list run
  again. A change of the instructions moves their version mark.
- The cost figures of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 14, estimates today, are
  replaced by the measured ones.

**Acceptance:** the gate green (the evaluation is not part of it); the run's table in the
report; the requests that still fail listed with the reason each is accepted or not; P4 and P5
written as decided in `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 7.1, 7.2 and 18;
`docs/COMMANDS.md` has the command and when to run it.

---

### Step c11 — Front end: `AssistantService` (≈ 5 h)

**Goal:** the six calls, by the pattern of `docs/FRONTEND_SERVICES.md`.

Files: `frontend/src/services/assistant.service.ts` and `assistant.types.ts`, through the
shared `api.ts`; every code of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6 turned into a
result the logic can tell apart, the three of its section 6.1 each on its own.

Tests: unit, every call and every code. Journeys in `frontend/tests/integration/`, against the
fake: a read exchange driven by `continue`; a booking confirmed; a decline. Each with its page
in `docs/journeys/frontend/`. The two packages' journeys are never run at the same time.

Documents: `docs/FRONTEND_SERVICES.md`, a section for the service.

**Acceptance:** `npm run verify -w frontend` green; `RUN_INTEGRATION=1 npm run test:integration
-w frontend` green against the fake; the root gate green.

---

### Step c12 — Front end: the screen (≈ 9 h)

**Goal:** the screen "Assistant", for both roles, running in a browser against the local stack.

**First, with the Product Owner, before any code**, as the view layer's steps did: the choices
about the screen that no document has made. At least: where the screen sits in the navigation;
what a settled proposal looks like in the list of messages; what the input does while a step
is working; what is shown when the conversation has run out or is full; where the line about
Anthropic stands and what it says; whether "New conversation" asks first. The step's text is
then rewritten with what was decided.

Files, in the order of `docs/FRONTEND_VIEW_PLAN.md` section 4:

- logic `frontend/src/logic/assistant.screen.ts`: the conversation on show; sending; the loop
  that calls `continue` while the status is `working`, at most the limit; the proposal waiting
  and settled; the three sentences of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1, the
  spending limit without a `continue`; the week and the list told to reload after an action
  `done`. No DOM;
- the markup in `frontend/index.html`, the styles in `frontend/style.css`, one markup for a
  phone and a desktop;
- the view `frontend/src/views/assistant.view.ts`, by the rules of
  `docs/FRONTEND_ARCHITECTURE.md` section 3: every text set as plain text, the live region,
  Enter sends;
- the shell: the address, the navigation entry, the session's objects made and dropped with
  the session;
- `frontend/scripts/dev.mjs` passes `/assistant` on to the local API, as it does the other
  paths. This is what open point P7 means locally; P7 itself stays open (step c16).

Tests: the logic's, without a DOM; the view's DOM test against the real `index.html`, with a
text containing `<script>` shown as text and nothing left behind on leaving.

**Browser check**, against the fake, as `alice` and as `admin`, at a desktop and at a phone
width: a read with its progress line; a booking confirmed, then the week shows it without a
reload of the page; a decline; a message that drops a proposal; each of the three sentences
of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1; a reload of the page shows the same
conversation; signing out and in as someone else shows nothing of the first person's; the
console shows no error.

**Acceptance:** `npm run verify -w frontend` green with 100 % lines on `frontend/src`; the
browser check line by line; the earlier screens' checks in short (sign in, the week, one
booking and its cancellation); `docs/FRONTEND_ARCHITECTURE.md` has the screen.

---

### Step c13 — The walk, with the real model (≈ 5 h, needs the key)

**Goal:** the screen is walked by people, with the real Claude; **open point P6** decided.

- `docs/FRONTEND_WALK.md` gains the assistant's checks: those of step c12 against the fake, as
  the check to repeat after a change, and a short list to do with the real model.
- **Reading the screen without a mouse**: a new message announced, the proposal's two buttons
  reached in order, the focus after a confirmation and after a decline.
- **P6.** The Product Owner, and whoever else is at hand, uses the assistant locally with the
  real model for a session each, in both languages. The step records how often a proposal was
  answered by typing instead of pressing, and what happened next. If typing is the habit, the
  step proposes the fixed list of words matched in code, never through the model
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 18.2). **Built only after the go**, as an
  addition of about 3 hours in the back end, with its tests and journey.
- What the walk shows about the instructions goes back through the evaluation of step c10, not
  straight into `prompt.ts`.

**Acceptance:** the root gate green on a fresh stack; then, on a second fresh stack, the seed
and the whole walk, line by line; P6 written as decided in
`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 5.5 and 18.

---

### Step c14 — Before the deployment: the key's script, the smoke test, the runbook (≈ 4 h, no cloud change)

**Goal:** everything the operator needs for step c15 exists and is tried as far as it can be
without the cloud.

- `backend/scripts/assistant-key.sh` and `npm run assistant-key -w backend -- <stack>`: asks
  for the key with hidden input and stores it as the `SecureString`
  `/<stack>/anthropic-api-key`. The key is never an argument, never printed, never on disk.
  It refuses the old stack `hello-world-api`. It can only be run in step c15.
- `backend/scripts/smoke.sh` gains one exchange of the assistant, a read, as the throw-away
  user: a message, `continue` until `idle`, the conversation ended. Status and code printed,
  never a text. `npm run smoke -w backend -- local` passes against the fake.
- `backend/scripts/deploy.sh`: the two new parameters reach the deployment.
- `docs/RUNBOOK.md`: the order for the operator. On Anthropic's side: a workspace of its own,
  its key, **the monthly spend limit**. On ours: deploy, the key's script, the smoke test,
  what to do when the 5xx alarm arrives for the assistant (the log line's outcome tells an
  outage from the spending limit), how to rotate the key.
- `docs/COMMANDS.md`: the new commands with their notes.

**Acceptance:** the gate green; `smoke local` passes with the new exchange; the script's
refusals tried (no stack, the old stack); the runbook's section read through by the Product
Owner.

---

### Step c15 — Cloud deployment (≈ 3 h, needs explicit instruction)

**Each cloud command needs its own go in the request of this step.** The target is the stack
`shared-calendar-api`, profile `shared-calendar-admin`, region `eu-north-1`. Nothing goes to
`hello-world-api`.

In order:

1. **P1, first.** The operator reads the Anthropic account's settings and terms: how long
   requests are kept, and that they are not used to train models. The result is written in
   `docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.2. If the terms are not acceptable the
   step stops here, before anything is deployed.
2. On Anthropic's side, by the operator: the workspace, its key, the monthly spend limit.
3. The gate green on a clean tree, then `npm run deploy -w backend`: one table, six functions
   with their roles and routes, two parameters. The change set is read before it is run:
   nothing existing is replaced.
4. The smoke test **before the key is set**: the assistant's exchange answers
   `503 assistant_unavailable` and every other check passes. This proves that a missing key
   harms nothing else.
5. `npm run assistant-key -w backend -- shared-calendar-api`.
6. The smoke test again. **P2 is closed here**: if the exchange passes, no `kms:Decrypt`
   statement is needed, and the document says so. If the function's log shows the key could
   not be decrypted, the statement naming that one key is added, usable only through Parameter
   Store, the gate run, and a second deployment made with its own go.
7. One exchange by hand in each language, as the Administrator, against the cloud; the log
   lines of those steps read: the fields of `docs/CONVERSATIONAL_ARCHITECTURE.md` section
   10.1 and no text.

**Acceptance:** the smoke test PASS on every line, in the cloud; P1 and P2 written as closed
in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 18.2; the deployment recorded in
`docs/RUNBOOK.md` section 5 with the commit; the Anthropic Console shows the spend limit; the
AWS bill's forecast is unchanged.

---

### Step c16 — Documentation and hand-over (≈ 3 h)

**Goal:** the repository says what exists, in one place each.

- `docs/ARCHITECTURE.md`: the merge closed; the assistant in the overview, the contract, the
  data model, the security design ("one secret" in place of "no secrets"), the deployment, the
  cost with Anthropic as the first real cost, the observability.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: status "implemented and merged; the architecture wins";
  every open point with its outcome.
- **P7**, recorded as still open: `docs/FRONTEND_ARCHITECTURE.md` section 10 says that a
  deployment of the front end must cover the `/assistant` routes with the same origin or CORS
  answer as the others. Nothing is built for it.
- `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/FOLDER_STRUCTURE.md`,
  `docs/COMMANDS.md`, `docs/RUNBOOK.md`, `README.md`: in line with what was built.
- `CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `shared/CLAUDE.md`: the new hard
  rules (only `confirmProposal` writes the calendar; `backend/src/assistant` reaches the
  calendar through a handler; the Anthropic SDK in one module; no text of a conversation in a
  log; the journeys only against the fake), by the rules of `CLAUDE.md`'s section "Changing
  these files", this file kept under 200 lines.
- This plan: status "done", and where a step differed from its text, an "As done" note under
  it.

**Acceptance:** the root gate green; `npm run lint` green (the comment rule finds no reference
to a section that moved); no document says the assistant is a proposal; the check of
`CLAUDE.md`'s last section run and reported.

---

## 6. Order of work and checkpoints

```
c00 contract ─► c01 table ─► c02 model, key, fake ─► c03 text only ─► c04 reading
                                                                      │
   c09 back end closing ◄─ c08 availability ◄─ c07 admin ◄─ c06 changes ◄─ c05 proposal, booking
        │
        ▼
c10 evaluation ─► c11 service ─► c12 screen ─► c13 walk ─► c14 before deploying ─► c15 deployment ─► c16 hand-over
```

The steps are done in this order. Two moves are possible if the review asks:

- steps c11 and c12 need only step c06, so the screen can come before the Administrator's tools.
  Step c13, the walk with the real model, still waits for step c10;
- steps c07 and c08 can change places.

Suggested commits: after step c02 (the three modules), c04 (reading works), c06 (everything a User
does), c09 (the back end), c10 (the model judged), c13 (the screen), c15 (deployed), c16.

| Open point | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|---|---|---|---|---|---|---|
| Step | c15 | c15 | c09 | c10 | c10 | c13 | c16, stays open |

## 7. Risks

| Risk | What is done about it |
|---|---|
| An assumption about Anthropic's API does not hold (F1) | Tried with real requests in step c02, before the core is written. The step stops if one fails |
| The fake Claude drifts from the real one, and the journeys prove a behaviour the model never has | The fake's answers are copied from real ones recorded in step c02; every step from c03 to c08 does its main path once by hand with the real key; step c10 judges the real model on forty requests |
| The proposal mechanism is wrong and twelve tools are built on it | Step c05 builds it on one tool, with every rule of section 5.5 tested, before step c06 adds the next |
| A read-only function ends up able to write the calendar | The roles are reviewed statement by statement at steps c05 and c07; finding F5 keeps the code that writes out of those bundles |
| A step takes more than 29 seconds locally, where a container starts cold | Step c04 reports the seconds per step locally and with the real model. A cold start is the local stack's, not the cloud's; the journeys' time-out is 60 seconds |
| The evaluation costs more than expected | Step c10 states its ceiling before the first run and waits for the go; the workspace's spend limit holds whatever happens |
| The model words blocked time wrongly (P5) and nobody notices | The confirmation shows the day as it is and as it would become, in the server's words (step c08); step c10 reads the blocking requests one by one |
| Text of a conversation reaches a log | Every test asserts the log line (section 4); the search of step c09 over a whole run; the cloud's lines read in step c15 |
| The back end's calendar journeys and the assistant's disturb each other on one local table | One file at a time, as today; the assistant's journeys own their types, dates and people (section 4) |
| `CLAUDE.md` outgrows its 200 lines with the new rules | Step c16 moves what concerns one package into that package's file and reports what moved |
| The spending limit is never set, and the daily limits are the only bound | It is a line of the runbook (step c14) and a line of step c15's acceptance |

## 8. Decisions and assumptions

| # | Decision or assumption | Why |
|---|---|---|
| 1 | The plan is a document of its own, steps c00 to c16 | Clarification round. The letter keeps "step cNN" apart from the numbered steps of the other plans, in briefs and commits |
| 2 | The key is available from the start; one deployment at the end; P1 in the deployment step | Clarification round (section 2.1) |
| 3 | The nine items of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 19 became seventeen steps | Its items 4 and 5 are each several days of work. A step is one thing that can be reviewed: text only, then reading, then one change, then the others |
| 4 | The script `assistant-key` is written in step c14, not with the model's module (item 3 of that outline) | It can only be run against the cloud. Written beside the deployment it is tried a step after it is written, not twelve |
| 5 | The mechanism of a change is built on `book_appointment` alone (step c05) | The riskiest part of the design gets a step to itself and the simplest tool that exercises all of it |
| 6 | The evaluation comes after all the tools and before the screen | It judges the instructions and the tools as a whole, and what it changes would otherwise change under the screen |
| 7 | Every step from c03 to c08 does its main path once by hand with the real model | The fake proves the code, not the model. A surprise is cheaper in the step that causes it than in step c10 |
| 8 | The assistant's journeys are one new file with one `describe` per theme, each with its page | As the calendar's; the pages are part of the step (`CLAUDE.md`) |
| 9 | Each step merges what it built into the governing documents | `docs/CONVERSATIONAL_ARCHITECTURE.md` section 1 asks it, as the calendar did with its specification |
| 10 | `block_time` (P5) and the typed confirmation (P6) are not planned as steps | Each exists only if its evidence asks for it. Planned as steps they would be built by default |
| 11 | Assumed: the old stack `hello-world-api` may still exist at step c15 | `docs/IMPLEMENTATION_PLAN.md` step 58 is the Product Owner's to call. Nothing here depends on it or touches it |
| 12 | Assumed: about ten people, as everywhere in the project | The capacity of step c09 and the cost of step c10 are judged against it |
