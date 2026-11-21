## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend      # with ANTHROPIC_API_KEY not set in this shell
npm run local:api -w backend                        # foreground, in a terminal of its own

# In the terminal that will start Claude Code, and only there:
read -s "ASSISTANT_TRIAL_KEY?Anthropic key: " && export ASSISTANT_TRIAL_KEY
```

- This step needs **an Anthropic API key**, for a handful of real requests (a few cents). No
  AWS login: the step does not touch the cloud.
- The key goes in `ASSISTANT_TRIAL_KEY`, **not** in `ANTHROPIC_API_KEY`. Claude Code reads
  `ANTHROPIC_API_KEY` for itself and would start billing the session to that key. The session
  passes the key on to the one command that needs it (design point 2).
- Best: a key of a workspace of its own with a low spend limit, the one
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 11.2 recommends anyway.

## Brief

Implement plan step c02, "The model's module, the key and the fake Claude"
(`docs/CONVERSATIONAL_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. **Two stops in this step**: one after finding
F1, before any code of the repository is written (see "First: finding F1"), and one at the
end. The design points are proposed below: apply them as written, and stop if the code, a
document or Anthropic's API proves one wrong.

This step gives the back end its one door to Claude, and nothing that walks through it yet:
`backend/src/lib/anthropic.ts`, the read of the key, a fake Claude in the Docker stack, and the
proof that Anthropic's API does what `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2 takes
for granted. No function, no route, no handler and no core: step c03 is the first to call the
module.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design" (logs never contain a token or a
  password. Here: nor the key, nor a text), "Cloud safety", "Comments" and "Changing these
  files".
- `backend/CLAUDE.md`, in particular "`src/lib/`", "Writing the scripts" and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, the findings F1 and F2, step c02, and
  steps c03 and c04 to see what this step must leave ready.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` v4: sections 4.2 (the language question), 4.3 (the
  memory is append-only because of the thinking blocks), 6.1 (the three ways of not
  answering, and how the spending limit is recognised), 7 (all of it: this step builds 7.1,
  7.2 and the answers of 7.4), 10.1 (the key, the logs), 10.2, 11.1 and 11.2, 12.1 (the local
  stack) and 12.2.
- `docs/ARCHITECTURE.md`: the change log (v13), sections 8 (the local stack) and 9.
- `docs/COMMANDS.md` section 3 (the local stack and `env.local.json`).
- `docs/FOLDER_STRUCTURE.md` sections 2 and 3.

Then read the code this step builds on:
- `backend/src/lib/assistantDb.ts`: the configuration read once per container with its error
  class, "now" passed in, a module that logs nothing. `StoredMessage` and `NewMessage`, whose
  `content` is `unknown` until this step (design point 6).
- `backend/src/lib/cognito.ts` and `backend/src/lib/db.ts`: how a module of `src/lib` makes
  its one AWS client. `backend/src/lib/logger.ts`: what the logger hides by itself.
- `backend/docker-compose.yml` and `backend/docker/`: how a service of the local stack is
  declared, bound to `127.0.0.1`, and reached by name from the Lambda containers.
- `backend/scripts/local-seed.sh`, all of it, and `backend/scripts/local-api.sh`: what
  `env.local.json` gives to which function, and when it is read.
- `backend/tests/integration/setup.ts` and the `globalSetup` of `backend/vitest.config.ts`:
  where the journeys check the stack before they start.
- `eslint.config.js`: the `no-restricted-imports` block of `frontend/src`, the model for F2.
- `backend/tests/unit/lib/assistantDb.test.ts`: the conventions of a unit test of `src/lib`.

**Anthropic's API is not written from memory.** Before the trial and before the module, read
the current documentation (the `claude-api` skill, then Anthropic's own pages through the
documentation tools) for: the Messages API with the TypeScript SDK, the SDK's client options
(`timeout` in milliseconds, `maxRetries`, `baseURL`), its error classes, adaptive thinking and
`output_config.effort` on Claude Sonnet 5.5, a `role: "system"` message inside `messages`,
structured outputs (`output_config.format`), prompt caching (the marks, the smallest prefix
that is cached, the `usage` fields), the `refusal` stop reason, and the errors of the spending
limit. Where the documentation and `docs/CONVERSATIONAL_ARCHITECTURE.md` disagree, that is a
finding of F1: report it, do not pick one silently.

## Where we are (2026-11-21)

- Steps c00 and c01 are done and committed (`76f414c`, `ea0ec26`): the contract in
  `shared/src/assistant/`, the table `assistant` with its module
  `backend/src/lib/assistantDb.ts`, `docs/CONVERSATIONAL_ARCHITECTURE.md` v4,
  `docs/ARCHITECTURE.md` v13 open. Check `git status -sb` rather than trusting this line:
  `main` was three commits ahead of `origin` at the time of writing.
- The back end has no dependency that is not AWS's, `zod`, `ulid` or `aws-jwt-verify`. No file
  imports `@anthropic-ai/sdk`. The Docker stack has three services and no fake.
- The template has no assistant function: `AssistantTable` and its two permission sets are
  attached to nothing. That matters for design point 11.
- `env.local.json` already carries `ASSISTANT_TABLE` for functions that do not exist yet.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: finding F1 (before any file of the repository changes)

`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 6.1 and 7.2 take things from Anthropic's
documentation that nobody has tried. Step c03 writes the core on them, so they are tried now.

Write **one throw-away script in the scratch folder**, not in the repository. It may install
`@anthropic-ai/sdk` in the scratch folder for itself. It sends real requests with the key of
design point 2 and prints, per line below, what was sent in short, what came back, and
"holds" or "does not hold":

| # | Assumption | How it is tried |
|---|---|---|
| 1 | A message with `role: "system"` inside `messages`, after the person's message, is accepted and obeyed | A line saying the time now and "answer in Italian", after an English question. Also: where the line may stand (after a `user` message, last or followed by an `assistant` turn) is what the stored conversation of section 7.2 produces at every step |
| 2 | Adaptive thinking with `effort: "low"`, `max_tokens` 8 000 | Accepted, and the answer arrives well inside 22 seconds. Report the seconds |
| 3 | The language question: an answer constrained to the list `en`, `it` | Structured output with that list. Three messages: English, Italian, and a third language, which must give `en` (section 4.2, rule 1). Report the request used, since section 4.2 does not fix it |
| 4 | The two cache marks | A request with the fixed part long enough to be cached (find the model's minimum in the documentation and say it), then a second step of the same conversation: its `usage` reports cached input read |
| 5 | The conversation sent back **exactly as stored** is accepted | The second request of line 4 carries the first answer's content blocks untouched, thinking blocks included, after a round trip through `JSON.stringify` and `JSON.parse`, which is what the table does to them. Then a third step. This is the assumption of section 4.3 |
| 6 | The two error shapes of the spending limit | They cannot be provoked. Read from the documentation and from the SDK's types: status 429 with the detail `enforced_spend_limit_reached`, and status 402 `billing_error`. Report the exact place of the detail in the error the SDK throws, and what tells that 429 from an ordinary one |

- Lines 1 to 5 on `claude-sonnet-5-5`. Then lines 1 to 3 once more on `claude-opus-5-5` and
  `claude-haiku-5-5`, the two other values `AssistantModel` allows (section 7.1 says all three
  accept what section 7.2 sends: that is an assumption too).
- Also provoke, since it costs nothing: a wrong key (the 401 the module must turn into
  `unavailable`).
- **Keep the answers.** The bodies that came back (a text answer, the language answer, the 401)
  are what the fake will give back: save them in the scratch folder, with nothing of the key
  in them.
- **Money:** a few cents in all. If a line would need more than about twenty requests, stop
  and ask.

**Then stop and report F1, line by line.** If every line holds, I say go and the step
continues. If one does not hold, the step stops there with a proposal for
`docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2 (or 4.2, 4.3, 6.1), and nothing else is
written. The script is deleted at the end of the step. What it found is written in section 7.2.

## Design points

Proposed with this brief. Point 11 moves something the plan puts in this step to step c03:
it was decided with the Product Owner before this step, and it is marked. None of the open
points P1 to P7 is closed here. Of the findings, this step holds F1 and the first half of F2.

1. **One dependency**, `@anthropic-ai/sdk`, in `backend/package.json`, at the current major
   with a caret like the others, installed from the repository root (`npm install -w backend`,
   one `package-lock.json`). `npm audit --audit-level=high` stays green. It is bundled by
   esbuild like every other dependency: say in the report what it adds to a function's size.
   One more, AWS's: `@aws-sdk/client-ssm`, for point 8.
2. **The key in this session.** It is in `ASSISTANT_TRIAL_KEY`. It is never printed, never an
   argument of a command (visible in `ps`), never written to a file by you, never in a test.
   The scratch script reads it from the environment. The one place it must be called
   `ANTHROPIC_API_KEY` is the acceptance's trial of `local:up` (see "How we work"): there it is
   given to that one command, `ANTHROPIC_API_KEY="$ASSISTANT_TRIAL_KEY" … npm run local:up …`,
   and never exported.
3. **The module's configuration**, read once per container on first use, with an error class of
   its own, like `assistantDb.ts`: the model (`ASSISTANT_MODEL`), the key's source (point 8),
   the address (`ANTHROPIC_BASE_URL`, used only when not empty: the cloud never sets it). The
   client is made with a time-out of 22 seconds and no retry
   (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2). No streaming: one request, one answer,
   inside 22 seconds.
4. **Two functions and no more.**
   - *A step*: takes the tools, the fixed instructions and the context block, the stored
     conversation, and gives back one of the answers of point 5. It adds the thinking, the
     effort, `max_tokens` and the two cache marks itself: they are the module's, not the
     caller's. The tools arrive already in the API's shape. Their list is empty until step c04.
   - *The language question*: takes one text, gives back a language of `shared/` or one of the
     two failures of point 5. An answer outside the list, or one that cannot be read, is `en`
     (`DEFAULT_ASSISTANT_LANGUAGE`), as section 4.2 says for another language.
   - What the instructions say, how the line with the time is worded, which tools exist: none
     of it is here. This module knows Anthropic, not the calendar.
5. **What comes back is one closed list**, a TypeScript union the core of step c03 can switch
   on, taken from `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.4: `text`, `tool requests`,
   `cut short`, `refusal`, `unavailable`, `budget reached`. With it:
   - for the first three, **the answer's content exactly as Anthropic gave it**, to be stored
     and sent back untouched (F1, line 5), and what the core needs read out of it (the text.
     The tool requests: id, name, input);
   - the token counts for the log: input, output, cached input read and written;
   - for `unavailable`, a reason from a short fixed list (time-out, connection, overloaded,
     rate limit, key missing, key refused, other), for the log line of step c03. Never
     Anthropic's message, never a header.
   - The module never throws for something Anthropic did or failed to do. It throws only its
     configuration error.
6. **The type of what is stored.** The module exports the type of one entry of the
   conversation as it is sent to Anthropic (the person's message, the application's line with
   `role: "system"`, Claude's answer, later the tool results), made from the SDK's own types,
   not redefined. `assistantDb.ts` uses it for the `content` of a `model` message through a
   type-only import of `./anthropic.js`, in place of `unknown`. It still stores it as JSON text
   and looks inside nothing. If a test of `assistantDb` must change for it, say which and why.
7. **The spending limit**, exactly as `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1 says
   and as F1's line 6 found it: the 429 with the detail `enforced_spend_limit_reached` and the
   402 are `budget reached`. Any other 429 is `unavailable`. Told apart by the SDK's error
   classes and the error's own fields, never by matching the words of a message. Once seen,
   the module answers `budget reached` for **ten minutes** without asking Anthropic, both
   functions alike. The memory is the container's (a variable of the module), with "now"
   passed in, as everywhere in `src/lib`.
8. **The key.** From `ANTHROPIC_API_KEY` when it is set and not empty. Otherwise from Parameter
   Store, the `SecureString` whose name is in `ANTHROPIC_KEY_PARAMETER`
   (`/<stack>/anthropic-api-key` in the cloud, set by the template in step c03), read with
   decryption and kept ten minutes.
   - The read is one more module, `backend/src/lib/parameters.ts`, with the one client it
     needs. It knows nothing of Anthropic: it reads one named parameter.
   - Neither set, the parameter missing, or the read refused: `unavailable`, reason "key
     missing". No exception reaches the caller.
   - A key Anthropic refuses (401) is `unavailable`, reason "key refused", and the key kept in
     memory is dropped, so that a rotated key is picked up at the next request and not ten
     minutes later.
   - Nothing reads Parameter Store in this step outside the unit tests, where the client is
     mocked: there is no cloud here. P2 (`kms:Decrypt`) stays open for step c15.
9. **Refusal** (`stop_reason: "refusal"`) comes back as `refusal`, with nothing to store.
   Anthropic's automatic fallback to another model is **not** switched on, whatever the
   documentation suggests as a default: section 7.4 decided it and says why.
10. **The module logs nothing**, like `assistantDb.ts`. What the log needs it gives back
    (point 5). A unit test proves that no result of the module, serialised, holds the key, a
    text of the conversation or Anthropic's error message, with an error object from the SDK
    that carries all three.
11. **The two template parameters move to step c03** *(differs from
    `docs/CONVERSATIONAL_PLAN.md` step c02: decided with the Product Owner before this step)*.
    The plan puts `AssistantModel`, `AssistantDailyMessageLimit` and "`ANTHROPIC_API_KEY`
    declared empty" in this step. But a variable is declared on a function, and the first
    assistant function is step c03's: until then nothing would read the two parameters. So
    they are added in step c03, with the function that reads them, and
    `backend/template.yaml` does not change in this step.
12. **The fake Claude** (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.1):
    - one small script of plain Node, no dependency, in `backend/docker/`, and one service in
      `backend/docker-compose.yml` on the official Node 22 image with a pinned tag, on the
      stack's network, its port bound to `127.0.0.1` only (9230 unless it is taken);
    - it answers `POST /v1/messages` and nothing else. It never calls anything;
    - **what it answers is data, not code**: a file of scripted answers that the journeys own,
      beside them under `backend/tests/integration/`, mounted read-only and read again at
      every request, so that a journey and the answers it needs are read together and a change
      needs no restart of the stack;
    - an answer is chosen by the text of the person's **last** message (an exact text or a
      marker inside it: choose one and say why). A request that is the language question is
      recognised by its shape and answered by its own entries. A text nobody scripted gets one
      fixed, recognisable answer, not an error;
    - the answers are **the ones recorded in F1**, cut down, not invented: a finished text, the
      language answers, and Anthropic's errors as the fake must give them (the 429 of the
      spending limit, the 402, an ordinary 429, a 529 for an outage, a 401). The tool requests
      come in step c04 with the journeys that need them;
    - it has no key to check, and it logs one line per request without the body.
    - The module is run against the fake once in this step, from a scratch script on the
      host: a text, the language question, each error. That is the proof the fake speaks well
      enough for the SDK, before any journey exists.
13. **`local:up` wires one or the other.** `local-seed.sh` writes into `env.local.json`, under
    "Parameters":
    - by default `ANTHROPIC_BASE_URL` (the fake, by its service name) and a placeholder key
      that is plainly not a key;
    - with `ANTHROPIC_API_KEY` set in the shell: the real key and **no** base URL. The script
      says in one line which of the two it wired, never the key.
    - The real key then sits in `env.local.json`, which is generated and git-ignored: that is
      section 12.1's design. Check that the file is ignored, and say in `docs/COMMANDS.md`
      that a `local:up` without the variable takes the key out again.
    - No function declares these variables yet (point 11), so they reach nobody until step
      c03: say so in the script's comment, as it does for `ASSISTANT_TABLE`.
14. **The journeys refuse the real Claude.** The integration set-up reads `env.local.json`
    before any journey and stops with a clear message when the stack is not wired to the fake.
    It covers every journey, the calendar's too: one rule, no list of exceptions. It reads the
    file, which is what `local:api` was started with only if `local:api` was restarted after
    the last `local:up`: say so in the message.
15. **F2, first half**: a `no-restricted-imports` rule in the root `eslint.config.js` so that
    `@anthropic-ai/sdk` (and its sub-paths) is imported only by
    `backend/src/lib/anthropic.ts`, with its unit test as the one other place if the mock
    needs it. Show the rule refusing an import written on purpose in a handler, then remove
    it. The second half (`backend/src/assistant` never imports `lib/calendarDb.ts`) is step
    c04's.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c02 lists, less point 11.

- **Code:** `backend/package.json` and the lock (point 1), `backend/src/lib/anthropic.ts`
  (points 3 to 10), `backend/src/lib/parameters.ts` (point 8), `backend/src/lib/assistantDb.ts`
  (point 6, types only), `backend/docker/` and `backend/docker-compose.yml` (point 12), the
  scripted answers under `backend/tests/integration/`, `backend/scripts/local-seed.sh` (point
  13), the integration set-up (point 14), `eslint.config.js` (point 15).
- **Tests**, unit, the SDK's client and the Parameter Store client mocked, a fixed "now":
  - each of the six answers of point 5, from the response or the error that produces it;
  - the request as sent: the model, thinking and effort, `max_tokens`, the two cache marks
    where section 7.2 puts them, the conversation untouched, 22 seconds and no retry;
  - each error mapped: time-out, no connection, 500, 529, 401, an ordinary 429
    (`unavailable`), the 429 of the spending limit and the 402 (`budget reached`);
  - the ten minutes of the spending limit: one second before and one after. Anthropic not
    asked in between. The language question bound by them too;
  - the key: from the variable. From Parameter Store when the variable is empty. Kept ten
    minutes. Dropped after a 401. Missing, and the read refused;
  - the language question: each language, an answer outside the list, an answer that is not
    what was asked for;
  - the token counts given back, cached ones included;
  - point 10's test of what never leaves the module;
  - the configuration: a variable missing, and the error kept for the next call.
  - `parameters.ts` has its own test file. 100 % of the lines of both modules.
- **Documents:**
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v5: the status line and the change log. **Section
    7.2 with what F1 found**, line by line, in place of what was assumed. Sections 4.2, 6.1,
    7.4 and 12.1 wherever the implementation fixed a detail (the request of the language
    question, the exact place of the spending limit's detail, the fake's port and where its
    answers live).
  - `docs/CONVERSATIONAL_PLAN.md`: the status line (step c02 done, with its date and this
    brief), F1 and the first half of F2 marked as closed where the plan lists them, an "As
    done" note under step c02 for point 11 and anything else that differed, and step c03's
    list completed with what moved to it.
  - `docs/ARCHITECTURE.md`: the sentence of step c02 in the v13 entry. Section 8: the fourth
    service of the local stack, and the two ways `local:up` wires Claude. The rule that the
    Anthropic SDK is imported in one module only, where the same rule for the AWS SDK is
    written.
  - `docs/COMMANDS.md`: `local:up` with and without the key, what it leaves in
    `env.local.json`, the fake's address and how to ask it something with `curl`, the journeys'
    refusal. `docs/FOLDER_STRUCTURE.md`: the new files. `backend/CLAUDE.md`: one entry each for
    `anthropic.ts` and `parameters.ts` under "`src/lib/`", `docker/` in the folder map, as
    short as they allow.
  - `CLAUDE.md` only if a line of it became untrue. It has 199 lines of its 200: a new line
    there makes room for itself in the same change. Report its line count.

Not in this step:
- any function, route, handler or role. `backend/template.yaml` (point 11);
- `backend/src/assistant/`: the core, the instructions, the line with the time, the limits
  (step c03). The tools (step c04);
- any journey of the assistant and any page under `docs/journeys/` (from step c03);
- the script `assistant-key` and anything of `docs/RUNBOOK.md` (step c14);
- the evaluation, the choice of the model and of the effort level, P4 (step c10);
- anything in `shared/` or `frontend/`. If the module needs something `shared/` does not
  give, stop and say what;
- the open points P1 to P7 and the findings F3 to F6. If this step runs into one, report what
  you saw and leave it to its step;
- the cloud: no deploy, no `aws` command against a real account, no parameter written to
  Parameter Store.

## How we work in this step

- **The local stack:** I start it, before the session. After you change `docker-compose.yml`
  or `local-seed.sh`, run `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself: it is
  idempotent and local. Do not run `local:down`. `local:api` is mine: if it needs a restart,
  tell me and wait.
- **The trial with the real key**, for the acceptance: run `local:up` once with the key given
  to that command alone (point 2), show the line saying the real Claude is wired, show that
  `RUN_INTEGRATION=1 npm run test:integration -w backend` refuses to start, then run `local:up`
  again without the key and show the fake wired and no key left in `env.local.json` (show the
  names of its variables, not their values). **Leave the stack on the fake.** `local:api` need
  not be restarted for this: no function reads these variables yet.
- **The key** never appears in a command's text, in your output, in a file of the repository
  or in a test. If a tool's output shows it by accident, say so at once: I rotate it.
- **Hard rules:**
  - `@anthropic-ai/sdk` is imported only in `backend/src/lib/anthropic.ts`. The AWS SDK only
    under `backend/src/lib`;
  - unit tests reach no network: neither Anthropic nor the fake;
  - the existing tests keep passing unchanged, except what point 6 may require. Say which;
  - the shell script runs on macOS (bash 3.2) and Linux: no flag that differs between the two;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief, step or finding name in a comment;
  - the Docker change is explained in plain terms, in the compose file's comments and in the
    report.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan, Anthropic's documentation and this
  brief disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed
  change. The architecture wins over the plan, and the plan over this brief, except for point
  11, which the Product Owner decided before this step. What Anthropic's API really does wins over all of them, and
  changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c02)

- **The report of F1, line by line**, given at the first stop and repeated in the final
  report: per line, holds or not, with what was seen. The three models. The seconds a step
  took. What the trial cost, from the token counts.
- The design points applied as written (any deviation reported with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root. `npm run
  audit -w backend` green.
- 100 % line coverage of `backend/src/lib`, the two new modules included.
- The lint rule of F2 shown refusing an import outside the module.
- After `local:up`, `docker compose ps` shows the fake running, and a `curl` to it gets a
  scripted answer: show both. A second `local:up` changes nothing.
- The module against the fake, from the scratch script: a text, the language question, the
  spending limit, an outage, each with the answer of point 5 it produced.
- With the real key, `local:up` wires the real Claude and the journeys refuse to start. Then
  the fake is wired again (see "How we work").
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green, on the fake. It runs the back
  end's calendar journeys, which empty the local `calendar` table: say so in the report.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.2 says what was found, not what was assumed.
- In the report: what the module exports, one line each. The union of point 5 as the core of
  step c03 will read it. What step c03 must do that this step left to it (the two template
  parameters, the variables on the function, the permission to read the key). In plain words,
  what the Docker stack gained. The scratch folder's scripts deleted.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step c03.
