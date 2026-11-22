# Shared Calendar: the conversational interface (implementation plan)

| | |
|---|---|
| Status | v2, planned (2026-11-21, brief `prompts/a2-plan-implementation-conversational-interface.md`). Steps c00 to c16. **Step c00 done** 2026-11-21 (brief `prompts/a3-step-c00-implementation.md`). **Step c01 done** 2026-11-21 (brief `prompts/a4-step-c01-implementation.md`). **Step c02 done** 2026-11-21 (brief `prompts/a5-step-c02-implementation.md`). **Step c03 done** 2026-11-21 (no brief: asked for in the session of step c02). **Step c04 done** 2026-11-21 (brief `prompts/a6-step-c04-implementation.md`). **Step c05 done** 2026-11-21 (brief `prompts/a7-step-c05-implementation.md`). **Step c06 done** 2026-11-22 (brief `prompts/a8-step-c06-implementation.md`). **Step c07 done** 2026-11-22 (brief `prompts/a9-step-c07-implementation.md`). **Step c08 done** 2026-11-22 (brief `prompts/a10-step-c08-implementation.md`). **Step c09 done** 2026-11-22 (brief `prompts/a11-step-c09-implementation.md`). **Step c10 done** 2026-11-22 (brief `prompts/a12-step-c10-implementation.md`) |
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
| P3 | The capacity of the `assistant` table under a long conversation | c09 | Measured (the "As done" note of step c09): an ordinary step 2 read and 14 write units, the largest 84 write units, a full conversation 30 read units, against 8 / 6 a second and a burst allowance of 2 400 / 1 800. **Closed: the Product Owner decided to keep the 100 KB bound and the 6 KB cap** (2026-11-22) |
| P4 | Effort level and model | c10 | **Closed** 2026-11-22: `claude-sonnet-5-5` at effort `low`, chosen by the Product Owner on three runs of the evaluation (the note under step c10) |
| P5 | Blocking time by an override the model works out | c10 | **Closed** 2026-11-22: no `block_time` tool. The nine blocking requests of the evaluation proposed the right hours (the note under step c10) |
| P6 | A typed "yes" drops the proposal | c13 | The walk with the real model, by the Product Owner too. If people type more than they press, the fixed list of words matched in code is proposed, and built only after the go |
| P7 | The front end is deployed nowhere | c16 | **Stays open**, on purpose: this plan does not deploy the front end. Step c12 makes the screen work locally through the dev server. Step c16 adds the assistant's routes to what `docs/FRONTEND_ARCHITECTURE.md` section 10 says a deployment must cover |

### 2.3 What planning found, each in its step

Reading the architecture against the repository brought up six points it does not settle. They
are not open points of the architecture yet. Each is raised in the step named, with a proposal,
before the code that depends on it. All six are closed: the "As done" notes of steps
c02, c03, c04, c05 and c07 say how.

| # | Finding | Step |
|---|---|---|
| F1 | **Five things `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2 and 6.1 take from Anthropic's documentation and nobody has tried**: a line with `role: "system"` inside `messages`. Adaptive thinking with `effort: "low"`. An answer constrained to a list (the language question). The two cache marks. The two error shapes of the spending limit. If one does not hold, the design of section 7.2 changes before the core is written on it. **Closed in step c02**: tried, with a sixth (the conversation sent back exactly as stored). One did not hold, the shapes of the spending limit, and `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1 was changed | c02 |
| F2 | **Nothing enforces the two import rules** (the Anthropic SDK only in `backend/src/lib/anthropic.ts`. `backend/src/assistant` never imports `lib/calendarDb.ts`). The root `eslint.config.js` restricts imports for `frontend/src` only. Proposal: two `no-restricted-imports` rules. **The first rule is in place since step c02**. **Closed in step c04**: the second rule refuses `lib/calendarDb`, `lib/calendarRules` and `lib/calendarEvents` under `backend/src/assistant` | c02, c04 |
| F3 | **Coverage.** The back end's 100 % line threshold covers `src/lib` only. The architecture asks it for `backend/src/assistant` too (its section 12.2). The six handlers stay outside the threshold, as every handler does. **Closed in step c03**: `backend/vitest.config.ts` holds `src/assistant` to 100 % lines | c03 |
| F4 | **A handler called as a tool writes its own log line**, so one step of the assistant writes several lines with one request id, and a handler reads its environment as if it were alone in the function. Whether the lines can be told apart, and whether any handler keeps state that two calls in one function would share. **Closed in step c04**: nothing to change. The lines share the request id and differ by `route`; the only state is the calendar's configuration and the DynamoDB client, the same for every caller | c04 |
| F5 | **What the two read-only functions carry.** To build a proposal they need the change tools' definitions and their fact reading, not the change handlers. Proposal: the part that runs a change is a module only `confirmProposal` imports, so the code that writes the calendar is not even in the other two bundles. **Closed in step c05**: it holds, without touching a calendar handler or `lib/calendarDb.ts`. `tools/changeHandlers.ts` is the one module that imports a change handler, `confirm.ts` the one that imports it, `handlers/confirmProposal.ts` the one handler that imports `confirm.ts`; a lint rule refuses any other such import; after a build, the calendar's write under the lock and the booking handler are in the bundle of `ConfirmProposalFunction` and in none of the other five | c05 |
| F6 | **Booking for a User, proposed by a function without `AdminGetUser`.** The proposal's facts can only come from the users' list (`ListUsersInGroup`). Whether that is enough for the confirmation to name the person, or the proposal goes out unchecked and the route refuses at the confirmation. **Closed in step c07**: it is enough, without a new route, a change to a handler or to `lib/cognito.ts`, or a permission beyond the plan's. The confirmation reads the users' list through the handler of `GET /users` with the Administrator's identity; a username that is not in it gets no proposal, with the route's code `user_not_found`. What that read cannot tell: an administrator's username, or an account in no group, is only "not in the list" (where the booking route would say `409 target_not_user`), so an administrator's name is not confirmed either; an account deleted between the proposal and the confirmation is refused by the route at the confirmation. What it costs: two `ListUsersInGroup` calls, one per group, for each answer of Claude that books for somebody, shared by the bookings of that answer. A User can never cause it: a User's input has no username, the list is read only when one is given, and `GET /users` refuses a User | c07 |

## 3. What is built

| Part | Where | Steps |
|---|---|---|
| The contract: codes, `AssistantReply`, languages, limits, fixed texts | `shared/src/assistant/`, `shared/src/api.ts` | c00 |
| The table `assistant` and its module | `backend/template.yaml`, `backend/scripts/local-seed.sh`, `backend/src/lib/assistantDb.ts` | c01 |
| The model's module, the key, the fake Claude | `backend/src/lib/anthropic.ts`, `backend/docker/`, `backend/docker-compose.yml` | c02 |
| The core and the six functions | `backend/src/assistant/`, `backend/src/handlers/` | c03 to c06 |
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
  key, and the calendar's read, write and book sets. No Cognito statement: step c07 brings it.
  No `CalendarDeletePolicy` either: no appointment route needs it (cancelling, moving and a
  note update items), so step c06 adds nothing to the role.
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

**As done** (2026-11-22). As written, with these differences and findings:

- **the template did not change.** `confirmProposal`'s role already held what the three routes
  need (the calendar's read, write and book sets); none needs `CalendarDeletePolicy`. The three
  handlers are in the confirming function's bundle and in none of the other five (searched
  after the build). The lint rule's list already held their names;
- **the appointment an id stands for is read through the list**: the code of
  `GET /calendar/appointments` with `upcoming=true&status=all` and the caller's identity. No
  route reads one appointment, and none was added. An id of another person's appointment is
  therefore not found at the proposal (`appointment_not_found`, the routes' code): the test "a
  User proposing a change to another person's appointment gets the route's refusal" is met by
  that error, not by the route answering. An appointment that has ended is not found either;
- **decided with the Product Owner:** the three tools are offered to both roles, and the
  sentence names whose appointment it is for the Administrator; more than five changes in one
  answer propose none; one change that cannot be proposed means no proposal at all;
  `book_appointment`'s description no longer says "one booking at a time";
- **decided in the step:** two changes of one answer on the same appointment, or into the same
  slot, are not proposed; a change that changes nothing is not proposed; `note` is required, a
  text or `null`; the changes of one answer share one reading of the calendar; three sentences
  added to the instructions' paragraph on changes (name an appointment by its id; several
  changes in one answer, five at most; say which were made and which refused);
- **the tests of the one-change limit are replaced** by six of rule 4 (two changes, five, a
  sixth, one that cannot be proposed, a refused input, the same thing twice) and four of a
  confirmation of several;
- **the fake's new mark** `{{appointment-id-N}}`, and three journeys on days 22 to 24, each
  with its User and its type. The "cancel both" journey changes the notice for cancelling as
  the Administrator for the time of the confirmation and puts it back in a `finally`: a run
  killed in between leaves the local setting changed;
- **the trial with the real model** (`claude-sonnet-5-5`, 22 requests): as `alice`, a
  cancellation (list 3.4 s, request 1.4 s, closing words 1.3 s), a move (three steps of 1.3 to
  2.1 s), a note (1.7 s) and "cancel both my appointments of next week" (one answer with two
  requests, one proposal of two, both done) each worked at the first try. A move to a taken
  slot was not asked for: Claude read the day and offered the free times. An id of another
  person's appointment was not asked for either: Claude read alice's list, did not find it,
  and said so. As `admin`, "cancel alice's appointment" made the proposal "Cancel the
  appointment of alice on …". No fault was found. **Seen, not changed:** in the move Claude
  first asked `list_appointments` for a period of a year, which the route refuses, and asked
  again for the day; the tool's own errors `no_free_slot` and `appointment_not_found` were
  not provoked, as the model read first.

---

### Step c07 — The Administrator: users' list, settings, types, booking for a User (≈ 6 h)

**Goal:** the Administrator's simpler tools.

**First: finding F6**, on what the confirmation of a booking for a User can show.

What step c06 left ready: the three other appointment tools are offered to the Administrator
already, with whose appointment it is in the sentence; a proposal holds up to five changes of
any tools; `tools/facts.ts` has the shared reads of a confirmation (a local time to an
instant, the free slot at an instant, the appointment of an id) and `run.ts` the one reading
per answer; the fake can take an appointment's id from a list.

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

**As done** (2026-11-22). As written, with these differences and findings:

- **finding F6 is closed** (section 2.3): the confirmation of a booking for a User checks the
  username against the users' list, read through the handler of `GET /users`;
- **a tool of the other role is now answered exactly as a tool that does not exist.** The
  result held the code `not_offered` where a made-up name got `unknown_tool`, which told the
  two apart against `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.4. Both get `unknown_tool`
  and the same sentence; only the log line says `not_offered`. Found in the step, agreed by the
  Product Owner;
- **the three functions that run tools had no user pool in their environment**: the template
  gives them `USER_POOL_ID` and `COGNITO_ENDPOINT`, and `scripts/local-seed.sh` a section each
  in `env.local.json` (the pool, cognito-local's address, placeholder credentials);
- **the roles**, reviewed statement by statement. `SendAssistantMessageRole` and
  `ContinueAssistantRole` gained one statement, `cognito-idp:ListUsersInGroup` on the user
  pool: it lets them read who the Users are, and nothing else of Cognito.
  `ConfirmProposalRole` gained that statement, a second one with `cognito-idp:AdminGetUser` and
  `cognito-idp:AdminListGroupsForUser` on the user pool (the booking route looks up the User it
  books for and checks the account is a plain User), and `CalendarDeletePolicy` (deleting a
  type deletes an item of the `calendar` table). No wildcard, no other resource. The other
  three assistant roles did not change;
- **the bundles**, after a build, read from their source maps: the confirming function holds
  the four new change handlers with the four of the appointments, and no handler of patterns,
  overrides or windows; the other five hold no change handler. `lib/cognito.ts` creates its
  client when it is loaded, so the bundler keeps it and Cognito's SDK in all six, the three
  that never call it included (about 130 KB each). Weights before and after, in bytes:
  `sendAssistantMessage` 1 730 262 → 1 867 010, `continueAssistant` 1 728 151 → 1 864 898,
  `confirmProposal` 1 872 241 → 1 893 485, `declineProposal` 1 036 825 → 1 166 032,
  `getConversation` 1 031 926 → 1 161 133, `endConversation` 1 012 742 → 1 136 026;
- **decided with the Product Owner:** the sentences of the five new proposals in both
  languages, the settings named in the words of the settings page; a confirmation of
  `update_settings` writes the four values read at the proposal, so a setting it does not name,
  changed from the web page in between, goes back to the value read (as the web form does);
- **decided in the step:**
  - the Administrator books a free hourly slot for a User, as a User does: no free start and
    end times by conversation. None of the booking notice, the horizon and the limit of
    upcoming appointments binds the Administrator's booking, so none is looked at;
  - `book_appointment` has a second description sentence only the Administrator is given, so a
    User's tools name neither a username nor `list_users`;
  - `list_patterns` asks two routes, the patterns and the types, to give each pattern its
    type's name: a read tool may name a second route (`also`);
  - a type is named by its id. At the proposal: an unknown id is `type_not_found`, a name
    another type has is `type_name_exists` (the route's codes), the name the type already has
    is `name_unchanged`, a name the route would refuse `invalid_name`; a rename that only
    changes capitals is proposed, as the route takes it. **A type in use is found only at the
    confirmation** (`refused`, `type_in_use`): no read route says whether a type is in use.
    The limit of 20 types is left to the route too;
  - settings: an input out of range is refused by the schema, an input that changes nothing is
    `settings_unchanged`. Claude is told in the tool's description that the time zone is not a
    setting it can change;
  - two changes of one answer on the same type, to the same type name, or two of the settings,
    are not proposed;
  - the instructions: the stopgap paragraph lost the settings, the types and the
    Administrator's booking and keeps the opening hours; one sentence says a type is named by
    its id and a User by the exact username, one that a type in use cannot be deleted;
- **tests changed, and why.** `tools/run.test.ts` and `exchange.test.ts`: the result's code of
  a tool of the other role. `prompt.test.ts`: the stopgap paragraph. `proposals.test.ts`: the
  block "book_appointment and the roles" (the Administrator was not offered it) is replaced by
  "the tools and the roles", and the list of change handlers holds eight.
  `tools/bookAppointment.test.ts` and `tools/tools.test.ts`: the roles, the two schemas, the
  list of fourteen tools. `shared/tests/assistant/texts.test.ts` and the journeys' helper: a
  booking's facts hold a username, or none;
- **the journeys**, three blocks. A User of its own is refused `update_settings`. The settings
  block asks, as `admin`, for a booking horizon of 57 days and puts the settings back at its
  end: no journey books further than 28 days ahead, so a run killed in between leaves a
  horizon of 57 that fails no block, and the next run starts from 56. The booking for a User
  uses day 21, 05:00 to 07:00, its own type and User. No new mark in the fake. The journeys
  send three messages a run as `admin`, each block starting the count of the day again. What
  they leave in the local tables: the cancelled appointment of the booking block with its
  events, the ended conversations, and the settings as they were. Their three pages were
  written and then checked in a fresh context: five points, none serious, each answered in
  the pages;
- **the trial with the real model** (`claude-sonnet-5-5`, 29 requests). As `admin`: "who are
  the users?" (the list, 3.4 s and 1.5 s); "book alice on Thursday 26 November at 14:00" (the
  day read, then the request with the username, 1.5 s each; confirmed, found in alice's list
  as booked by `admin`); "book giovanna …" (no tool asked for: Claude had the list and said she
  is no User; in a new conversation it read the list and the day first, and said the same);
  the cancellation notice raised to 72 hours and put back by conversation; a type created,
  renamed and deleted, the id taken from the result of the creation; a type in use deleted
  (proposed, refused at the confirmation with `type_in_use`, and Claude said why); "create the
  type Trial yoga and set the booking horizon to 40 days" (one answer with two requests, one
  proposal of two, both done). As `alice`: "change the cancellation notice to 1 hour" and "who
  are the users?" were each answered in words, with no tool asked for, saying only the
  Administrator can. No fault was found. **Seen, not changed:** the tool's own
  `user_not_found` was not provoked, as the model read the list first; of a type in use Claude
  said "weekly opening hours or appointments" where a one-off window held it.

What step c08 finds ready: a read tool can ask two routes; `tools/facts.ts` reads the present
types and finds one by id (`presentTypes`, `typeById`), and `result.ts` makes a type and the
settings small for the model; `list_patterns` gives each pattern with its id; the three roles
can list the Users, and `ConfirmProposalRole` holds every calendar policy
(`CalendarReadPolicy`, `CalendarWritePolicy`, `CalendarBookPolicy`, `CalendarDeletePolicy`);
the stopgap paragraph of `INSTRUCTIONS` holds the opening hours alone, which step c08 removes
with the paragraph.

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

**As done** (2026-11-22, brief `prompts/a10-step-c08-implementation.md`). The step as planned;
every tool of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3 exists and the stopgap paragraph
of `INSTRUCTIONS` is gone. No route, function, role or permission was added, and no calendar
handler or module of `backend/src/lib` was touched.

- **the three questions of the brief**, answered before the tools were written:
  - *what the Administrator's reads give.* `get_calendar` gives the Administrator each
    window's `source`, the `id` of an extra window and `hasOverride` per day, and keeps a day
    closed by hours of its own. A type's id comes from `list_types`. A User's result is the
    same, byte for byte. It adds 20 bytes a day, about 20 a window and 34 for an extra
    window's id, inside the cut of 6 KB. **The version marks of both roles change**: the
    Administrator's by the tools and the description, a User's by the instructions alone;
  - *a block over an extra window.* It holds without a new route: the day's own hours, the
    deletion of the window and a new window for the part that stays open, in one proposal.
    Section 3 of the architecture gained the sentence. P5 was not judged;
  - *appointments in the way.* Nothing is looked for before the confirmation. There the
    change is `refused`, and Claude gets the code, the message and each appointment as its id,
    username, local date and times, cut like every list (`refusalForModel` in
    `tools/result.ts`, used by `confirm.ts` for any refusal that carries the list);
- **decided with the Product Owner:** the sentences of the seven proposals in both languages,
  with the words of the web pages ("weekly pattern", "this day's own hours", "extra window");
  **`delete_one_off_window` takes the window's date beside its id**, a difference from the
  brief: no route reads or lists one window, so the confirmation looks for it in its day;
- **decided in the step:**
  - a weekday is an English word in a pattern's input, a number never; `update_pattern` takes
    the whole pattern and must name its last day, a date or `null`;
  - checked at the proposal: an unknown pattern, window or type; a date already past, judged
    against `generatedAt` of the calendar's own answer; two stretches of one override that
    overlap each other; a change that changes nothing (`pattern_unchanged`,
    `override_unchanged`); hours to take away that the date does not have. **Left to the
    route**: an overlap with other open hours, the appointments in the way, the limits. They
    are only true under the route's lock, and a deletion of the same proposal may remove what
    stands in the way;
  - hours equal to those the patterns give are proposed: the date then has hours of its own;
  - the longest sentence of a day (ten stretches as it is, ten as it would become, ten extra
    windows, type names of 40 characters) is 1 847 characters in English and 1 870 in Italian;
  - two changes of one answer on the same pattern, the hours of the same date, the same extra
    window, or twice the same new pattern or window, are not proposed; the hours of a date and
    an extra window of that date are two things;
  - the instructions: the stopgap paragraph is replaced by one sentence in the paragraph on
    changes ("offer only what you have a tool for"); a paragraph on where the hours of a day
    come from and the words to use for them; the paragraph on blocking, rewritten;
- **tests changed, and why.** `prompt.test.ts`: the rows of the stopgap paragraph and its two
  tests are replaced by rows for the opening hours and blocking and one test that no stopgap
  is left. `proposals.test.ts`: the list of the Administrator's tools holds thirteen and the
  list of change handlers fifteen. `tools/tools.test.ts`: the list of twenty-one tools; the
  test "leaves out every internal field", which read the Administrator's view, is replaced by
  one that sets the Administrator's result beside a User's. No other existing test changed.
  New: `tools/availabilityTools.test.ts` (59 tests), a block as one proposal with its refusal
  and its log lines, the refusal's list and its cut, the sentences word for word;
- **the template and the bundles.** The seven routes need the calendar's read set with the
  write or the delete set, which `ConfirmProposalRole` held: no role changed. Read from the
  source maps: the confirming function's bundle holds the fifteen change handlers, the other
  five none. Weights before and after, in bytes: `sendAssistantMessage` 1 867 010 →
  1 886 302, `continueAssistant` 1 864 898 → 1 884 190, `confirmProposal` 1 893 485 →
  1 930 712, `declineProposal` 1 166 032 → 1 178 455, `getConversation` 1 161 133 →
  1 173 556, `endConversation` 1 136 026 → 1 138 787;
- **the journeys**, three blocks, each with a type of its own. A block proposed, confirmed and
  the free slots read back; a block over the appointment of a User of its own
  (`chat-in-the-way`), refused with the appointment named; a pattern created and deleted. The
  fake learnt two marks: `{{id:LIST:NAME}}`, the id of a type or a pattern by its name in the
  list the request holds, and `{{saturday+N}}`. **The two blocking journeys run on a
  Saturday**: an override takes the place of every pattern of its day, and the calendar's
  journeys leave patterns, and appointments in them, on the working days, so on another day
  the fake's fixed hours were refused. Their hours come from a weekly pattern valid on that
  one day. **The pattern journey opens a Sunday**, 12 to 18 days ahead: the calendar's journeys
  leave an empty override on a Monday of those weeks, found by the subagent that wrote the
  pages. A calendar seeded by hand (`seed:local`) may hold hours on a Saturday: the journeys
  are run on a stack started afresh or after the calendar's own, as the gate does. The journeys send eight messages a run as `admin` (three before), each block
  starting the count of the day again. `removeFromCalendar` also deletes the hours of its own
  of a day that hold the journey's type and the patterns of the type, looks from today and no
  longer from tomorrow, and each block checks at its end that none is left. What they leave in the local tables: the cancelled appointment of
  the refused block with its events, and the ended conversations. Run twice the same day,
  green both times. Their three pages were written by one subagent and checked by another in a
  fresh context: nine points, none wrong, each answered in the pages (one was a rule of the
  spec cited by the wrong number in the architecture);
- **the trial with the real model** (`claude-sonnet-5-5`, 47 requests). A type of the trial
  with two weekly patterns on Saturdays, 09:00–12:00 and 14:00–18:00, and one appointment of
  `alice`. **The three blocking requests, the hours as they came:**
  - "Block Saturday 28 November from 10:00 to 11:00": the day read, the types read, then
    09:00–10:00, 11:00–12:00, 14:00–18:00. Right. 5.8 s to the proposal, 1.6 s to confirm;
  - "I am away from 9 until 15: block that time": the day read, then 15:00–18:00. Right
    (3.2 s);
  - "Close Saturday 19 December": the day read, then an empty list. Right (3.7 s).

  Then: a block over `alice`'s appointment was **not proposed**: Claude saw the appointment in
  the day it had read, said so, and offered to move or cancel it. Asked to propose it all the
  same, it did; the confirmation was refused with `availability_conflict`, and Claude named
  the appointment and what to do. A second block on the day already blocked kept the first
  (four stretches, right). "Open Saturday 19 December again as usual": `delete_date_override`.
  An extra window created; a block over half of it: the window deleted and a new one for the
  half that stays, in one proposal of two, with no override, as that day had no other hours;
  the window deleted. A pattern created, its end moved and deleted, in Italian, the id taken
  from the result of the creation. As `alice`, "block Tuesday afternoon": answered in words,
  no tool asked for. **One fault, fixed and tried again:** in Italian Claude said "pattern"
  where the pages say "orario settimanale"; the instructions now give the words of the pages
  in both languages, and the second try used them. **Seen, not changed:** after taking a
  day's own hours away Claude said the day "should now be open as usual", as the result only
  says the hours were deleted; the real model asked for the list of patterns before no
  deletion, which the journey's fake does. **A mistake of the session, with no lasting
  effect:** the script that deleted the trial's data also deleted the override of 2026-12-07,
  a leftover of the calendar's journeys in the local table, which their next run makes again.

What step c09 finds ready: every tool exists, so the log lines and the capacity can be judged
on the whole set; the journeys run twice a day as they are, with eight messages of `admin` a
run under a local limit of 10, each block starting the count again; `removeFromCalendar` clears
appointments, a day's own hours, patterns, extra windows and the type. What step c10 finds
ready: blocking by `set_date_override` gave the right hours in each of the six requests
tried, the two with a window cut in two and the one over an extra window included, which is
what open point P5 asks; the words the model uses for the opening hours are fixed in the
instructions; a refusal names the appointments in the way.

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

**As done** (2026-11-22, brief `prompts/a11-step-c09-implementation.md`). No tool, route,
function, role or permission was added. The step differed from its text in these points:

- **Two limits were added to the product, decided by the Product Owner in the session.** The
  brief asked whether anything bounds the size of one stored item. Nothing did: the results of
  one answer are one item (or part of `META` when a proposal keeps them back), an answer may
  ask for any number of reads, and at about 66 results of 6 KB the item passes DynamoDB's
  400 KB, which DynamoDB Local refuses as AWS does (tried: 390 KB accepted, 410 KB refused).
  And the 100 KB bound was looked at only when a message arrived, so one message could add
  eight steps to a conversation just under it. Decided: (1) only the first five requests of one
  answer that are not changes are looked at, the others get the error result `too_many_reads`
  and Claude is told to ask again, a few at a time (`readsPerAnswer` in
  `shared/src/assistant/limits.ts`); the Product Owner asked whether the person should be told
  instead, and chose this way, in which Claude tells the person when a shorter period is
  needed; (2) after a step whose reads were run, a conversation at its bound stops the exchange
  with the fixed sentence `conversationFull`, which both languages already had. The Product
  Owner asked whether to send Claude only the last 100 KB instead, and decided against
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 17). The instructions did not change, so no
  conversation in progress is ended by this step.
- **The mark journey writes the mark in the table**, it does not start the local function with
  another one: `setStoredPromptVersion()` changes `promptVersion` on the stored `META` item.
  Through the routes it proves that such a conversation reads as empty, that the next message
  starts a new one and that the old messages are not sent to Claude. That the mark moves with
  the instructions, the person's block and the tools stays with the unit tests of
  `backend/src/assistant/prompt.ts`.
- **The log search found two lines' worth of a username**, not nothing: see below.

**Tests.** No existing test was changed or replaced. Added: two `describe` blocks of
`backend/tests/unit/assistant/exchange.test.ts` (the five reads; a conversation that fills up
during an exchange), one expected value in `shared/tests/assistant/limits.test.ts`, and two
journeys with their pages, `docs/journeys/backend/assistant-full-conversation.md` and
`docs/journeys/backend/assistant-other-instructions.md`, each written by one subagent and
checked by another; the checker found no wrong check and seven small points (an order of
events, which tests depend on which, three references, one order of checks), all applied but
one: `POST /users` stays out of a page's table of routes, as on the other pages.

**P3, the numbers.** How obtained: DynamoDB Local 3.3.1 answers `ReturnConsumedCapacity` by
AWS's rule in every case tried (consistent and eventual reads of 0.1 to 30 KB, a query of five
items, a missing item, a transaction of two puts and an update, which it counts twice). The
filling journey repeats the three reads of a step with the units asked for, and works the
write units out from the size of the items by AWS's rule, since the write is made by the
function. With `ASSISTANT_CAPACITY_FILE` set, it wrote these (the same in three runs but for a
few bytes):

| Request | Stored after | Read (bytes, units) | Written (items, bytes, largest item) | Write units |
|---|---|---|---|---|
| The message, first step | 37 288 | 0, 2 | 6, 38 266, 36 224 | 84 |
| `continue` | 74 258 | 38 266, 12 | 3, 37 551, 36 224 | 78 |
| `continue`, which fills the conversation and stops | 111 286 | 75 524, 21 | 4, 37 754, 36 224 | 80 |
| A message refused, and `GET` | 111 286 | 112 982, 30 | 0 | 0 |
| `DELETE` | 0 | 112 982, 30 | 1, 290 | 1 |
| A message in the new conversation | 2 199 | 374, 2 | 5, 3 029, 2 060 | 14 |

- A result cut at 6 000 bytes weighs about 7.2 KB stored: it is JSON text inside the JSON text
  of its entry, and every quotation mark takes two bytes. Five of them are one item of 36 KB.
- Worked out, not measured: a message arriving just under the bound and one full step leave
  about 138 KB, 36 units to read. A proposal that keeps five full results back holds them in
  `META`, about 41 KB: about 82 units to write it, about 40 to take it at the confirmation and
  160 to 230 for the outcomes. `storedBytes` does not count what `META` keeps back.
- **A busy minute.** In the trials with the real model a step took 1.3 to 5.8 seconds and
  stored about a kilobyte: 14 write units every three seconds, under the 6 a second. Two
  people at once pass it, and the largest step takes fourteen seconds of capacity by itself.
  The allowance covers both: DynamoDB keeps up to 300 seconds of unused capacity, 2 400 read
  and 1 800 write units here, about twenty of the largest steps in a row.
- **When the table throttles**: the installed SDK (`@aws-sdk/client-dynamodb` 3.1158.0) makes
  four attempts for DynamoDB, waiting between them; then the handler answers
  `500 internal_error` and nothing of the step is saved. A cancelled transaction is not tried
  again and still uses its units. How sure: the bytes and units are measured; the throttling
  is read from AWS's pages and from the SDK's code, since DynamoDB Local ignores the capacity.
- **Proposed, and decided by the Product Owner at the review: keep 100 KB and 6 KB.**
- AWS's pages used, in the Amazon DynamoDB Developer Guide: "DynamoDB read and write
  operations" (`read-write-operations.html`), "Provisioned capacity mode"
  (`provisioned-capacity-mode.html`), "Understanding DynamoDB item sizes and formats"
  (`CapacityUnitCalculations.html`), "Burst and adaptive capacity"
  (`burst-adaptive-capacity.html`), "Amazon DynamoDB Transactions: how it works"
  (`transaction-apis.html`), "DynamoDB local usage notes" (`DynamoDBLocal.UsageNotes.html`),
  "Programming Amazon DynamoDB with JavaScript" (`programming-with-javascript.html`).

**The log search.** One whole run of the gate with the output of `local:api` kept in a file:
12 027 lines, 890 of them the handlers' log lines. Looked for: 327 texts (every sentence and
answer of `answers.json`, the tool input and the signature of a thought it holds, every text
the three journey files send or write as a note, a type name or a password, the placeholder of
the key) and six shapes (a token, a bearer header, a key of Anthropic, a body, a tool's input,
a tool's result), and each throw-away username on a line of another caller. **No text of a
person, of Claude or of a note, no password, token or key.** Two usernames were found, three
lines: `target` in the lines of `POST /users` and of the Administrator's
`POST /calendar/appointments`, which name the account the Administrator acts on, as
`docs/ARCHITECTURE.md` section 11 describes. Nothing was repaired. SAM's own lines hold no
body and no environment variable. The same search on the fresh stack's run gave the same.

**Repeatability.** `DYNAMODB_PORT=8002 npm run verify` green three times on the final code:
twice in a row on one stack, then on a stack started again (1 706 unit tests of the back end and its 189 journeys,
437 tests of `shared` and 2 067 of the front end, 100 % of the lines, audit clean). What the second run found of the first: in `calendar` nothing more, the same 96 items
after each run (the calendar's journeys empty the table, and the assistant's remove their
windows, patterns and types; the cancelled appointments of the assistant's journeys go with
the next emptying); in `assistant` the conversations and daily use of accounts that no longer
exist (218 message and `META` items and 15 of daily use a run), which nobody reads since every
run's throw-away User has a new `sub`; in `hello-messages` three rows a run, which no test
counts. The gate does not depend on:

- **the Administrator's count of the day**: every block that talks as `admin` first deletes
  that account's items of daily use (`forgetDailyUse()`) and ends its conversation;
- **a run killed half-way**: each block removes its users first, the file removes what any
  block left in the calendar before the first starts (by `JOURNEY_TYPES`), and the settings
  block sets its starting value itself;
- **the order of the blocks**: each has its own account, type and day or hours; the filling
  block opens 00:00–04:00, which no other opens, and deletes its fourteen patterns at its end.

**`docs/ARCHITECTURE.md` against the template and the code.** Untrue and corrected: the six
route rows stood outside the route table; a decline never answers `assistant_busy`; three
functions, not two, read the key and declare the local variables; the assistant's permission
sets were said to be attached to no role; `CalendarDeletePolicy` serves four deletions, not
one; the fake has six marks, not three; `AssistantBusyError` is answered differently by each
route; the template's and the logger's sizes. Missing and added: the confirmation's `409`; the
proposal routes among those of both roles; the assistant in section 2; the control "a change
needs the person", four threats and three residual risks from
`docs/CONVERSATIONAL_ARCHITECTURE.md` section 10; the log lines of every assistant route with
all their outcomes and fields; the read of the day's use; the environment of the six
functions; Parameter Store and Anthropic in the cost table; the two 503 as alarms. A stale
comment of `backend/template.yaml` on the confirming role was corrected too.

**`CLAUDE.md` and `backend/CLAUDE.md`**: no line became untrue; unchanged, 199 and 197 lines.

What steps c10 and c11 find ready: the back end complete and described in
`docs/ARCHITECTURE.md`; a gate that can be repeated; the limits that bound what the real model
can make a step cost, with `too_many_reads` as a result the evaluation may meet; the reply's
status `idle` with the notice of a full conversation as one more end of an exchange for the
screen.

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

**As done (2026-11-22).** The command exists, the three runs were made, P4 and P5 are closed,
and the cost is measured. The step spent **2.19 USD** at Anthropic, of the 20 agreed.

**The five answers, agreed before any code.** (1) The evaluation drives the routes; the tools
and their inputs come from the stored conversation, the model, the effort, the milliseconds
and the tokens from the log line of each step. (2) The effort is a variable of the three
functions that ask Claude, `ASSISTANT_EFFORT`, empty in the template and so `low`; the model
and the effort of a run are named in the shell that runs `local:up`. (3) The known week: two
types and two accounts whose names start with "eval", made through the API and removed by
those names; the command refuses a calendar that holds another type. (4) The count of the day
of the account that asks is cleared before each request; no local setting changes. (5) A
ceiling of 20 USD for the step, 4, 6 and 0.50 for the three runs. All are written in
`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 7.2 and 12.3.

**What Anthropic accepts**, read on 2026-11-22: the page "Effort"
(`https://platform.claude.com/docs/en/build-with-claude/effort`), for the five levels and
that the two models take them; the page "Pricing"
(`https://platform.claude.com/docs/en/about-claude/pricing`), for the prices in
`backend/tests/eval/cost.ts`.

**The list**: 51 requests, 55 messages, 28 in English and 23 in Italian (the brief said about forty). By kind:
the first brief's examples 5, relative dates 7, readings 5, changes 10, blocking 9,
ambiguity 3, the web pages 3, the other role 3, an order in a note 3, the other language
later 3. One request confirms its proposal, the block over an appointment, whose check is the
calendar's refusal.

**The runs** (the table is in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.1):

| Run | Passed | Cents |
|---|---|---|
| Four requests on Haiku, to try the command | 4 of 4 | 0.4 |
| `claude-haiku-5-5`, `low` | 45 of 51 | 2.7 |
| Its six failures again | 3 of 6 | 0.3 |
| `claude-sonnet-5-5`, `low` | 51 of 51 | 39.6 |
| `claude-sonnet-5-5`, `medium` | 50 of 51 | 36.7 |
| Its failure again | 0 of 1 | 0.9 |
| Sonnet `low`, the corrected list | 51 of 51 | 38.9 |
| The 14 requests that name dates, after the first sentence | 14 of 14 | 13.8 |
| The whole list after the second sentence | 51 of 51 | 39.2 |
| The 9 blocking requests, after the type's id in the reading | 9 of 9 | 10.8 |
| **The final run, on the final state** | **51 of 51** | **35.4** |

**Faults of the list, corrected, not counted against a model.** A User's cancellation named
Monday's appointment, which on a Sunday is inside the 24 hours of notice: the model rightly
refused; the request names Thursday's. Three checks on a weekday that can be read in two ways
took one day only: a model that reads both and offers both is right.

**Haiku's failures that held**: a type renamed to "Lezione" when "eval Lezione" was asked,
twice; "Close the Tuesday afternoon" proposed for one Tuesday without asking, twice, the first
time with the type's name in the place of its id; a cancellation asked about in words
("Lo annullo?") instead of proposed, once on the corrected request. One answer that said it
could not tell today's date passed when played again. **No request fails on the chosen
model.**

**P5, read one by one** on Sonnet `low`, each day as it was and as the proposal would make it:

| Asked | The day as it was | Proposed |
|---|---|---|
| Tuesday 15:00–16:00 | Visit 09–13, Lesson 15–18 | Visit 09–13, Lesson 16–18 |
| A whole Monday | Visit 09–13 | no hours |
| "La mattina" of a Tuesday | Visit 09–13, Lesson 15–18 | Lesson 15–18 |
| Thursday 10:00–11:00 | Visit 09–13, Lesson 15–18 | Visit 09–10, Visit 11–13, Lesson 15–18 |
| Thursday 12:00–16:00, over two windows | Visit 09–13, Lesson 15–18 | Visit 09–12, Lesson 16–18 |
| Saturday 11:00–12:00, in an extra window | extra window Lesson 10–12 | that window deleted, one created 10–11 |
| Wednesday 11:00–12:00, a day with its own hours | own hours Visit 10–12 | own hours Visit 10–11 |
| Sunday 10:00–12:00, a day with no hours | nothing | no proposal: "nothing to block" |
| Tuesday 09:00–11:00, over an appointment | Visit 09–13 with an appointment at 09:00, Lesson 15–18 | Visit 11–13, Lesson 15–18; refused by the calendar at the confirmation, and the appointment named |

All right. Haiku was right in all nine too.

**Read by hand** on the final run: the refusals of what the web pages keep and of the
Administrator's tools say where to go; the note that gives an order is quoted as text and not
acted on in the three requests, also when the person says "do whatever needs doing"; a message
in the other language is answered in the conversation's language, and the proposal's sentence
is in it; the ambiguous requests get a question. Two things are left as they are. Asked for a
new password, the model names an option of the sign-in page that does not exist: nobody can
change a password today, and the Product Owner asked to leave the case until that feature is
built. Beside a call that proposes a change the model sometimes writes one short sentence
("No extra windows and no appointments, so I can close the day."), shown above the proposal:
harmless, sometimes in English in an Italian conversation.

**The instructions**, each change shown to the Product Owner first: "next week" on a Sunday
starts tomorrow (a refusal named 1 December for "Tuesday of next week", twice; right after the
change); nothing is written beside a call that only reads. The second did not remove the note
"I need type ids.": its cause was that the Administrator's `get_calendar` named a window's
type and not its id. **`get_calendar` now gives the Administrator the id** (decided by the
Product Owner): a block went from three steps to two. Three tests of
`backend/tests/unit/assistant/tools/tools.test.ts` changed for it, and one journey, the reading
after a block, with its page (`docs/journeys/backend/assistant-blocking.md`); the sentence
stays. The fake Claude still asks for `list_types` before a block, as the real model did when
its answers were recorded: a path that remains valid, no longer the usual one.

**The code.** `backend/src/lib/anthropic.ts` reads the effort (`assistantEffort`), and the
step's log line carries it: the tests of `exchange.test.ts`, `proposals.test.ts` and
`anthropic.test.ts` changed for that field. `backend/scripts/local-seed.sh` takes the model
and the effort from the shell. `backend/tests/integration/setup.ts` exports `API_URL`,
`realClaudeWired` and `storedEntries`, moved out of `assistant.test.ts`, which the evaluation
imports. `backend/tests/eval/` holds the evaluation, outside the gate and outside the folders
whose coverage is enforced; its pure parts (dates, checks, cost) have unit tests in
`backend/tests/unit/eval/`, a reading of "the gate stays untouched": they reach nothing and
cost nothing. `backend/scripts/assistant-eval.sh` bundles it with the repository's esbuild.
No template default changed: the model chosen is the default there was.

**`shared/src/assistant/limits.ts`**: nothing in the runs asks for a change. The longest
exchange took 3 steps of the 8 allowed, and no answer met `too_many_reads`.

**`CLAUDE.md` and `backend/CLAUDE.md`**: 199 and 197 lines, as before. One line of
`backend/CLAUDE.md` gained the bad `ASSISTANT_EFFORT` as a second configuration error.

What step c11 finds ready: the model and the effort settled; a `get_calendar` whose
Administrator's result carries the type's id; the evaluation to run again when the walk of
step c13 shows something about the instructions.

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
