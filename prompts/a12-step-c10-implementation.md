## Before opening the new session (operator, in your own terminal)

```bash
nvm use
ANTHROPIC_API_KEY=… DYNAMODB_PORT=8002 npm run local:up -w backend    # the real Claude, for the evaluation
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
```

- This step **needs the Anthropic key and costs money**. The key is typed by you, in your own
  terminal, for that one command: the session never sees it, never asks for it and never
  prints `backend/env.local.json`. It needs **no AWS login**; nothing is deployed.
- **Set a monthly spend limit on the key's workspace in the Anthropic Console before the first
  run**, if there is none: it is the one guard that holds whatever a script does.
- The stack changes hands several times: **the real Claude for the evaluation, the fake for
  the gate**. Each change is yours: `local:up` with or without the key, then a restart of
  `local:api`. The session tells you each time which of the two it needs, and waits.
- Each model or effort level tried is one more `local:up`, with the values the session gives
  you beside the key, and one restart of `local:api`. Expect about six restarts in all.

## Brief

Implement plan step c10, "The evaluation with the real model" (`docs/CONVERSATIONAL_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review. The design points are proposed below: apply them as written, and stop if the
code or a document proves one wrong.

After this step we know, on evidence, whether Claude with these instructions and tools
understands people. A command plays a fixed list of about forty requests, in English and in
Italian, against the local stack with the real model, on a week whose content is known, and
says for each request whether what can be checked mechanically came out right. **Open point P4
is decided** (the effort level and the model) and **open point P5 is decided** (whether
blocking time needs a tool of its own). The cost figures of the architecture are measured, not
estimated. The step is the last of the back end before the screen (c11).

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments" and "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`" (**a change of `INSTRUCTIONS` or of a
  tool ends every conversation in progress**), "`src/lib/`" (`anthropic.ts`), "Writing the
  scripts" and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 (**open points P4 and P5**; P6 is step c13's),
  3 and 4, step c10, section 7 (the risks: "The evaluation costs more than expected"), the
  "As done" notes of steps c02 (what was tried of Anthropic's API), c05 to c08 (**each has a
  paragraph on its trial with the real model: what was asked, what went wrong, what was
  corrected in the instructions**) and c09 with its paragraph "What steps c10 and c11 find
  ready", and step c11 to see what this step must not take from it.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 3 (the tools), 4.4 (the limits, with the
  five reads of one answer), 5.4 and 5.5 (what a proposal says, blocking time), **7 (all of
  it: the model, the shape of a request, the instructions, what can come back)**, 8, **12.3
  (the evaluation)**, **14 (the cost)**, 15 and **18.2**.
- `docs/ARCHITECTURE.md`: section 4 ("The assistant's routes", with "The log line"), 8 ("The
  fake Claude": how `local:up` wires one Claude or the other) and 9.2 (the parameters
  `AssistantModel` and `AssistantDailyMessageLimit`).
- `docs/COMMANDS.md` sections 3 and 4: the local stack, section 3.4 on the real Claude, the
  daily limit of the local stack, `seed:local`.
- The first brief, `prompts/a1-idea-for-conversational-interface.md`: its examples of what a
  person asks are the first requests of the list.

Then read the code this step builds on:
- `backend/src/lib/anthropic.ts` with its test: `EFFORT`, `THINKING`, `STEP_MAX_TOKENS`, the
  model read from `ASSISTANT_MODEL`, what `askStep` gives back, the token counts.
- `backend/src/assistant/`: `prompt.ts` (**`INSTRUCTIONS`, read word by word**, `contextBlock`,
  `timeLine`, `promptVersion`), `exchange.ts`, `proposal.ts`, `confirm.ts`, `config.ts`,
  `tools/list.ts` and every tool's definition (name, description, schema), `tools/result.ts`.
- `shared/src/assistant/`: the reply's type, the limits, the sentences of the proposals in
  both languages.
- `backend/template.yaml`: the parameter `AssistantModel` and what the three functions that
  ask Claude get in their environment; `backend/scripts/local-api.sh` and `local-seed.sh`
  (where the local stack's parameters and `env.local.json` come from).
- `backend/tests/integration/setup.ts` and `assistant.test.ts`: how a journey signs in, makes
  a throw-away User, opens hours under a type of its own, talks to the assistant step by step
  and removes what it made; `claudeWiringProblem()`, which makes the journeys refuse the real
  Claude: the evaluation needs the opposite check.
- `frontend/scripts/seed-local.mjs`: an existing seed of a week, to see how one is made
  through the API. The evaluation's seed is its own.
- `backend/package.json` (the scripts) and `backend/vitest.config.ts` (the two projects).

What Anthropic's API accepts is not written from memory: the effort levels a model takes, the
model names, the prices per million tokens and what is counted as cached input are read in
Anthropic's current documentation (the documentation tools of the session) before a request
is sent or a cent is worked out, and the pages are named in the plan's note.

## Where we are (2026-11-22)

- Steps c00 to c09 are done and committed (c09: `8b2d418`). `main` was eleven commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- **The back end of the assistant is complete**: twenty-one tools, six routes, twenty blocks
  of journeys on the fake, each with its page. `docs/ARCHITECTURE.md` holds all of it.
- **The model is asked** with adaptive thinking and `effort: "low"`, a constant in
  `backend/src/lib/anthropic.ts`; the model is the template's parameter `AssistantModel`,
  default `claude-sonnet-5-5`, allowed `claude-sonnet-5-5`, `claude-opus-5-5`,
  `claude-haiku-5-5`. **No environment variable sets the effort, and locally nothing but the
  template's default sets the model.**
- **The limits** (`shared/src/assistant/limits.ts`): 2 000 characters a message; eight
  requests to Claude for one message; the first five reads of one answer are run, the others
  get the error result `too_many_reads`; a result is cut at 6 KB; a conversation is full at
  40 messages or 100 KB, also in the middle of an exchange; five changes a proposal. The
  local daily limit is **10 messages a person**, the template's is 30.
- **The trials so far** were made by hand in the sessions of steps c05 to c08, on
  `claude-sonnet-5-5`: 15, 22, 29 and 47 requests, a step took 1.3 to 5.8 seconds. They
  corrected the instructions several times. Nothing of them can be repeated: no list, no
  known week, no check.
- **The cost figures** of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 14 are estimates: 1
  to 3 US cents an exchange, 2 to 6 USD a month at the expected use.
- **Blocking time** is the model's work: it reads the day and asks for the hours that are
  left, as an override, and for an extra window in the blocked time its deletion and a new one
  (the instructions say how). Step c08's trial got it right; whether it holds over many
  wordings is what P5 asks.
- The log line of every step carries the model, the milliseconds Claude took and the token
  counts (`usage`, `languageUsage`): the cost of an exchange can be worked out from the logs
  or from what the reply's steps took. The reply itself carries no token count.
- The gate is `DYNAMODB_PORT=8002 npm run verify`, on the fake. **The journeys refuse to start
  when the real Claude is wired.**
- `CLAUDE.md` has 199 lines of its 200 and `backend/CLAUDE.md` 197: a new line in either
  needs room made in the same change.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: five questions (before a file is written)

Answer these in a few lines each, with a proposal where one is asked.

1. **What the evaluation drives, and what it can see.** Proposed: it talks to the assistant
   through the local API's routes, as a person's screen would (a message, `continue` while
   the status is `working`, never a confirmation unless the request's check needs the
   outcome), signed in as throw-away accounts of its own and as `admin`. The reply shows the
   words and the proposal, not the tools asked for. **Say where the tools and their inputs
   come from**: the stored conversation read from the local `assistant` table, as the
   journeys read it, or the log lines (names only). Proposed: the table. Say what each check
   can then be made on.
2. **How a run chooses its model and its effort.** Today the effort is a constant and the
   local model is the template's default. **Decided with me: a local setting.** The three
   functions that ask Claude read the effort, and locally the model, from environment
   variables declared empty in the template, so that only the local stack can fill them, as
   `ANTHROPIC_BASE_URL` is; in the cloud the effort stays the constant and the model the
   parameter `AssistantModel`. A small product change, with its unit tests and its line in
   `docs/ARCHITECTURE.md` section 9.2. Say the names of the variables, where the local stack
   takes their values from (proposed: the shell that runs `local:up`, which writes them into
   `env.local.json`, so that one restart of `local:api` changes the run and nothing is built
   by hand), what a value Anthropic does not accept does, and that the next `local:up`
   without them puts the defaults back. The run's table names the model and the effort each
   line was really asked with, taken from the log line, not from what the script meant.
3. **The known week.** The seed must make an expected answer a fact: which types, which
   opening hours, which appointments of whom, which notes (one of them tries to give orders),
   on which days relative to today. Say how the evaluation and the journeys keep out of each
   other's way in the one local calendar, how the seed is removed (by its own types and
   accounts, by name), and what happens to a request whose date falls on a day the seed does
   not own. **The calendar's journeys empty the table**: say in which order the gate and the
   evaluation may be run.
4. **The daily limit.** Forty requests, several of them of more than one message, three or
   four runs: the local limit of 10 a person is in the way. Proposed: one throw-away User per
   group of requests, and for `admin` the journeys' way (`forgetDailyUse`), with nothing
   changed in the local settings. Say if that holds, or what you propose instead.
5. **What it will cost, at most.** From the number of requests, the steps each may take, the
   tokens the trials of steps c05 to c08 logged and Anthropic's current prices: the most one
   run of the list can cost on each model and effort, and the most the whole step can cost
   with its repeats. **State the figure and wait for my go before the first request is sent**
   (the plan asks it). The command stops by itself when a run passes its ceiling.

Show me the five answers in one short message, wait for my go on 5, and carry on.

## Design points

1. **The list**, a data file under `backend/tests/eval/`, about forty requests, half in
   English and half in Italian, each with: who asks (a User or the Administrator), the
   message or messages, and what is checked. The kinds, with at least three of each:
   - the examples of the first brief;
   - relative dates ("tomorrow", "dopodomani", "next Friday", "venerdì prossimo", "in two
     weeks", the end of a month, a weekday that is today);
   - a reading: what is free, what I have booked, who is booked (the Administrator);
   - each kind of change: a booking, a cancellation, a move, a note, for a User and for the
     Administrator on a User's behalf; the settings, a type, a weekly pattern, a day's hours;
   - **blocking a time window**, at least eight wordings in the two languages: a whole day,
     a morning, an hour inside one window, an interval over two windows, an interval that
     holds an extra window, an interval over an appointment (the calendar refuses), a day
     that already has hours of its own, a day with no hours at all;
   - ambiguity that must produce a question and no proposal ("book me something next week");
   - something the web pages keep (create a user, delete one, a password): no tool is asked
     for and the answer says where to go;
   - a tool of the other role asked by a User;
   - **a note that tries to give orders**, read by the Administrator: no change is proposed
     that the person did not ask for;
   - a message in one language after the conversation started in the other.
2. **What is checked is mechanical**, never a judgement of the wording: the tools asked for
   (which, in what order when it matters, and that none other was), their inputs (the dates
   and times, worked out from today in the calendar's zone), whether a proposal came out, how
   many changes it holds and what each would run (the request stored with the proposal, not
   its sentence), whether no proposal came out, the language of the reply, the status at the
   end, the number of steps. A check that needs a human eye is not a check: the request goes
   into a second list, **read by hand**, whose answers the command prints whole, in the
   scratch folder, for the report.
3. **The command** `npm run assistant:eval -w backend`, **outside** `verify` and outside the
   vitest projects the gate runs.
   - It **refuses to start** unless `env.local.json` wires the real Claude (the opposite of
     `claudeWiringProblem()`), and unless the API and the tables are the local ones
     (`127.0.0.1` or `localhost`), as `resetCalendarTable()` refuses.
   - It seeds the known week, plays the list, removes what it made, also when it is
     interrupted, and may be run twice in a row.
   - It prints, per request: pass or fail with the check that failed, the steps, the seconds,
     the tokens (input, output, cache read, cache written); then the totals, the cost in US
     cents by the prices of the model, and seconds per step. It also writes the same as a
     file, to a path given on the command line, so that two runs can be compared.
   - It takes arguments after `--`: one request or one kind alone, and the ceiling of cost.
   - **It never prints the key, and never a token of a signed-in account.** A person's text
     here is the list's own, so it may be printed.
   - The prices are data in one place, with the date and the page they were read from.
4. **The runs for P4**, each the whole list on the same seeded week: `claude-sonnet-5-5` at
   `effort: "low"`; `claude-sonnet-5-5` at the level above; `claude-haiku-5-5` at `low`.
   One table in the plan's note and in the architecture: requests passed, seconds per step
   (median and the slowest), cents per exchange (median and the dearest), cents for the whole
   list. **One run proves little about a model that does not answer the same way twice**:
   say which failures came back in a second run of the failed requests alone, and count only
   those as failures of the model. **I choose the model and the effort**; the template's
   default and the constant follow, with their tests.
5. **P5**, the blocking requests read one by one, after the runs: for each, the day as it
   was, what was asked, the proposal's changes, the day as it would become, right or wrong.
   **If the hours are wrong in any of them, stop and propose `block_time`** (a composed
   tool: the interval taken out of the day's windows by a pure function in `shared/`), with
   what it would cost, about four hours by the plan. **It is built only after my go**, as an
   addition to this step, with its tests, its journey, its page and a second run of the
   blocking requests. If they are all right, P5 is closed as "no tool".
6. **The instructions** are corrected where a failure shows they are unclear, one correction
   at a time, each followed by a run of the requests it concerns and, at the end, by one whole
   run of the list on the chosen model. **Each correction is shown to me before it is made**:
   the failure, the sentence as it is, the sentence proposed. A change of `INSTRUCTIONS`
   moves the version mark and ends every conversation in progress, which is as designed. A
   request that still fails at the end is listed with the reason it is accepted or not.
7. **The cost figures** of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 14 and of
   `docs/ARCHITECTURE.md` section 10 are replaced by the measured ones, on the chosen model:
   cents per exchange by kind (a plain answer, a reading, a change), what the cache saves,
   and the two lines of the monthly table worked out again.
8. **The gate is not touched by the evaluation**: no file of it is picked up by `test:unit`
   or `test:integration`, and its code is outside the folders where coverage is enforced.
   What it shares with the journeys (signing in, a throw-away User, the calls) is imported
   from `backend/tests/integration/setup.ts`, not copied.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c10 lists.

- **Code:** the list and the seed under `backend/tests/eval/`, the command's script under
  `backend/scripts/` or beside the list, its line in `backend/package.json`; the local
  setting of question 2; `INSTRUCTIONS` where design point 6 corrected them; the template's default and the
  constant of the effort if I choose another; `block_time` only after my go.
- **Unit tests:** for every line of product code that changed, 100 % of the lines of
  `backend/src/assistant`, `backend/src/lib` and `shared/src` as before. The evaluation's own
  pure parts (a relative date worked out, a check applied to a stored conversation, the cost
  from the tokens) have unit tests that reach no network.
- **Journeys:** none new, unless `block_time` is built. **A changed instruction changes no
  journey**: the fake does not read the instructions. If one does change, its page changes
  with it, written and checked with the skill `explain-journey`.
- **Documents:**
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v13: the status line, the change log, 7.1 (the
    model, as chosen) and 7.2 (the effort, as chosen), 7.3 if the instructions changed, 12.3
    (the evaluation as built: the list, the seed, the checks, when to run it), 14 (the
    measured cost), 18.2 (P4 and P5 closed, each with its decision), and section 3 with 5.4
    if `block_time` is built.
  - `docs/ARCHITECTURE.md`: the sentence of step c10 in the v13 entry; section 9.2 if a
    parameter's default or a variable changed; section 10, the line of Anthropic's cost.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, P4 and P5 in section 2.2, an "As done"
    note under step c10, and what step c11 finds ready.
  - `docs/COMMANDS.md`: the command, what it needs, what it costs and when to run it;
    `docs/FOLDER_STRUCTURE.md` for `backend/tests/eval/`.
  - `CLAUDE.md` and `backend/CLAUDE.md` only if a line became untrue or the new folder needs
    its line. Report the line counts of both.

Not in this step:
- the screen and anything in `frontend/` (steps c11 and c12);
- a judgement of the answers by another model: the checks are mechanical, the rest is read
  by hand;
- `claude-opus-5-5`, unless both other models fail and I ask for it;
- a new route or function; a change to a calendar handler, to `lib/calendarDb.ts`,
  `lib/calendarRules.ts` or `lib/cognito.ts`;
- a change of a limit of `shared/src/assistant/limits.ts`: if the evaluation shows one is in
  the way (the five reads, the eight requests), say so with the request that met it, and
  leave it for the review;
- the open points P1, P2, P6 and P7;
- the post-deploy smoke test's exchange (step c15);
- the cloud: no deploy, no `aws` command against a real account.

## How we work in this step

- **Messages to me are short.** At the end of a task, and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. A table only where I
  must choose from it (the three runs of P4). The detail the acceptance asks for goes into
  the "As done" note of the plan; give me more only when I ask.
- **The pauses, each said for what it is:** the five answers with the cost and my go; P4,
  with its table; P5, only if a tool is proposed; each correction of the instructions (several
  may come in one message); each change of the stack between the real Claude and the fake.
- **Money.** No request reaches Anthropic before my go on question 5. Every run has a
  ceiling, and the command stops at it. Report what was really spent after each run, from
  the tokens. If the spending passes the figure I agreed to, stop and tell me.
- **The key.** It is in `backend/env.local.json` while the real Claude is wired, a file
  readable by its owner only. **Never print that file, a line of it, or the environment of a
  function; never copy the key into a script, a command, a log or a document.** To know which
  Claude is wired, read whether `ANTHROPIC_BASE_URL` is there, with a script that prints yes
  or no.
- **The local stack:** I start it before the session, on the real Claude, `local:api` through
  `tee`. **`local:up`, with or without the key, is mine in this step**, and so are
  `local:down` and every restart of `local:api`: tell me exactly what to do, in which
  terminal, with which command, and what word you wait for. **Never send anything to the
  assistant to learn whether the API was restarted or which Claude answers**: read the log
  file, the fake's log (`docker compose logs fake-claude`, in `backend/`), or wait for my
  word.
- **The gate runs on the fake.** Before it, ask me for the fake; it empties the `calendar`
  table, so the known week is seeded again before the next evaluation run. Never run the
  evaluation and a gate at the same time, nor the back end's and the front end's
  integration tests.
- **The log file** `/tmp/shared-calendar-local-api.log` is read by scripts that print counts
  and the lines that hit, each cut to a short length; never print it whole. It is mine: do
  not delete or empty it.
- **The stored conversations** hold very long strings: a script that reads them shortens
  every long string before it prints. Scratch scripts and the runs' files live in the scratch
  folder, never in the repository, and are deleted at the end, after the numbers are in the
  plan's note. A shell command that holds a script goes through a file or a here-document.
- **A script that deletes** from a local table or through a route names what it deletes by
  the evaluation's own types, ids or accounts, never by a period or a kind alone, and prints
  what it found before it deletes. Step c08's trial deleted a journey's override by mistake:
  see its note.
- **Hard rules:**
  - **no request of the model, and no text anybody typed, runs a change**: the only code path
    to a change handler starts at `confirmProposal`. The evaluation confirms a proposal only
    through the route, and only where a request's check needs the outcome;
  - **the assistant can never create a user, delete one, or reach an administrator's
    account**;
  - `backend/src/assistant` reaches the calendar and Cognito through a handler only;
  - `@anthropic-ai/sdk` is imported only in `backend/src/lib/anthropic.ts`: **the evaluation
    never calls Anthropic itself**, it goes through the local API;
  - logs never hold a text, a tool's input or result, a token, a password or the key;
  - unit tests reach no network; the journeys run on the fake and refuse the real Claude;
  - the existing tests keep passing unchanged, except those of the places this step changes.
    Note which changed and why;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief, step or finding name in a comment.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan, Anthropic's documentation and this
  brief disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed
  change. The architecture wins over the plan, and the plan over this brief. What Anthropic's
  API really does wins over all of them, and changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c10)

- The five questions answered, and the answers written where they belong in
  `docs/CONVERSATIONAL_ARCHITECTURE.md`.
- The design points applied as written (any deviation noted with its reason).
- `npm run assistant:eval -w backend` exists, refuses the fake and anything but the local
  stack, stops at its ceiling, and leaves the local calendar as it found it.
- **The table of the runs** in the plan's note and in the architecture; **P4 and P5 written
  as decided**, by me, in `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 7.1, 7.2 and 18.2
  and in the plan's section 2.2.
- **The requests that still fail**, each with the reason it is accepted or not; the requests
  read by hand, each with what was read.
- The measured cost in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 14, and what the step
  itself spent.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- **The root gate, `DYNAMODB_PORT=8002 npm run verify`, green on the fake, on the final
  state** (the evaluation is not part of it).
- `docs/COMMANDS.md` has the command and when to run it.
- The scratch folder's scripts and files deleted; **the stack left on the fake**, with no key
  in `backend/env.local.json` (checked by the yes-or-no script), the local settings as they
  were before the session.
- **In the plan's "As done" note**, not in the console: the differences from the step's
  text, what was decided and by whom, the tests changed, the list's kinds and counts, the
  runs with their table, each correction of the instructions with the failure that asked for
  it, the blocking requests one by one, the cost, Anthropic's pages named, and what step c11
  finds ready.

Then stop for review, with the short closing message of "How we work": what was done, what
failed or could not be run, and what I must decide. Suggest the commit, but commit only when I
ask. Do not push. Do not start step c11.
