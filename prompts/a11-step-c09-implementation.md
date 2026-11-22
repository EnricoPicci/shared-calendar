## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend      # with ANTHROPIC_API_KEY not set in this shell
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
```

- This step needs **no Anthropic key and no AWS login**: everything runs on the fake Claude and
  on the local stack. Nothing is deployed.
- **`local:api` is started through `tee`**, so that the session can search what the API wrote:
  the step's search of the logs reads `/tmp/shared-calendar-local-api.log`. Start it the same
  way at every restart of this session; each start begins the file again.
- `local:api` will need **one restart**, for the fresh stack, where the session also asks you
  for `local:down` and `local:up`. A second one only if you lower a bound or a repair changes
  code of the functions: the session says so and asks.

## Brief

Implement plan step c09, "Back end closing: capacity, logs, repeatability"
(`docs/CONVERSATIONAL_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. The design points are proposed below: apply
them as written, and stop if the code or a document proves one wrong.

After this step the back end of the assistant is finished as a whole. **Open point P3 has its
numbers**: what one step reads and writes in the `assistant` table when a conversation is as
long as it may be, against the table's 8 read and 6 write units. A search of the local API's
output finds no text of a person, no note and no key. The gate is green twice in a row and on
a fresh stack. A journey shows that a conversation started under other instructions ends.
`docs/ARCHITECTURE.md` holds everything of the assistant that is built. The step adds no tool,
no route and no function, and it is the last step before the model is judged (c10) and the
screen is built (c11).

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments" and "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`", "`src/lib/`" (`assistantDb.ts`) and
  "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 (**open point P3**), 3 and 4, step c09, the
  "As done" notes of steps c01 (the table and its module), c03, c04 and **c08 with its
  paragraph "What step c09 finds ready"**, and steps c10 and c11 to see what this step must
  leave ready and what it must not take from them.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 4.3 (the version mark), 4.4 (the limits),
  5.1 and 5.6, 8.3 (the cut of 6 KB), **9 (the table, with its last paragraph on capacity)**,
  10 (all of it: 10.1 what a log line may hold, **10.3 what `docs/ARCHITECTURE.md` section 7
  must gain**), 11, 12, 14, 15 and **18.2**.
- `docs/ARCHITECTURE.md`: the v13 entry of the change log, section 4 ("The assistant's routes"
  and "The assistant's error codes"), 5.4, 7 (7.1 the roles, the security rows, 7.3 the
  residual risks), 8, 9.2, 10 (capacity) and 11 (logging).
- `docs/journeys/README.md` and the project skill `explain-journey`, the pages
  `docs/journeys/backend/assistant-daily-limit.md` and `assistant-reading.md`, and
  `docs/journeys/concepts.md` (the assistant's ideas, the fake's marks and sentences, "One
  local calendar, shared").
- `docs/COMMANDS.md` sections 3 and 4 (the local stack, the fake, the integration tests).

Then read the code this step builds on:
- `backend/src/lib/assistantDb.ts` with its test: the two reads and the one transaction of a
  step, how `storedBytes` and `messageCount` are kept, what a `META` item holds (the proposal
  with its kept-back results included).
- `backend/src/assistant/`: `conversation.ts` (when a conversation is full, when it has run
  out, the version mark compared), `exchange.ts` (the limit of eight requests, what a step
  saves), `prompt.ts` (`promptVersion`), `config.ts`, `tools/result.ts` (`RESULT_CAP_BYTES`,
  `cappedJson`), `tools/event.ts`, and the six assistant handlers with the log line each
  writes (`backend/src/lib/logger.ts`).
- `shared/src/assistant/limits.ts`.
- `backend/template.yaml`: the `assistant` table with its capacity, the six assistant
  functions and their roles.
- `backend/scripts/local-api.sh`, `local-seed.sh` and `verify.sh`.
- `backend/tests/integration/setup.ts` (`queryAssistantPartition`, `forgetDailyUse`: the one
  place a journey touches the `assistant` table directly) and `assistant.test.ts`: its
  opening comment, the helpers, `JOURNEY_TYPES`, `removeFromCalendar`, and the eighteen blocks.
- `backend/docker/fake-claude.mjs` and `backend/tests/integration/fake-claude/answers.json`
  (it holds very long strings: never print it whole).

How DynamoDB counts read and write units is not written from memory: read it in AWS's current
documentation (the documentation tools of the session) before any number is worked out, and
name the pages in the plan's note.

## Where we are (2026-11-22)

- Steps c00 to c08 are done and committed (c08: `698ff8a`). `main` was ten commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- **Every tool of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3 exists**: twenty-one, eight
  for both roles and thirteen more for the Administrator. Eighteen blocks of journeys on the
  fake (90 tests), eighteen pages.
- **The table `assistant`**: provisioned 8 read and 6 write units; with `hello-messages` 1/1
  and `calendar` 10/10 the total is 19/17 of the always-free 25/25. A step reads `META`, then
  queries the current conversation's messages, both consistent, and writes once, in one
  transaction. `assistantDb.ts` asks DynamoDB for no consumed capacity today.
- **The bounds** (`shared/src/assistant/limits.ts`): a conversation is full at 40 messages of
  the person or 100 KB stored; a tool's result is cut at 6 KB; one message of the person takes
  eight requests to Claude at most; a proposal holds five changes at most. **No journey fills
  a conversation**, and none meets `409 conversation_full`.
- **The version mark** is worked out from the instructions, the block about the person and
  the role's tools. A conversation under another mark is over: unit tests say so, no journey
  does. No environment variable changes the mark.
- **The logs.** Each assistant handler writes one line a request, and each calendar handler
  called as a tool writes its own, with the same request id. The local API writes them to the
  terminal where `local:api` runs, mixed with SAM's own lines. The unit tests assert that the
  lines hold no text; nobody has searched the real output.
- The local daily limit is 10 messages a person. Six blocks talk as `admin`, eight messages a
  run, each block starting that account's count again (`forgetDailyUse`).
- The assistant's journeys use the days 12 to 28 from today, 04:00 to 07:00; two of them run
  on a Saturday and one on a Sunday, because the calendar's journeys leave patterns,
  appointments and an empty override on the working days. A calendar seeded with `seed:local`
  may hold hours on a Saturday and fail them: the gate is not affected.
- `CLAUDE.md` has 199 lines of its 200 and `backend/CLAUDE.md` 197: a new line in the first
  needs room made in the same change.
- Two untracked files in `backend/`, `.verify-ok 2` and `env.local 2.json`, are strays: leave
  them alone and out of any commit.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: four questions (before a file is written)

Check that every finding of the plan's section 2.3 is closed. Then answer these, in a few
lines each.

1. **Where the numbers of P3 come from.** The plan says DynamoDB returns the consumed units
   on request. The journey does not see the function's calls, and DynamoDB Local is an
   emulator. **Proposed:** the journey measures by itself, with no change to the product:
   after each step it makes the step's two reads again, on the same keys, asking for the
   consumed capacity, and works out the write from the items the step added and from the
   `META` item, by AWS's rule for a transaction. **Check first what DynamoDB Local answers to
   `ReturnConsumedCapacity`** for an item of a known size, a query of a known size and a
   transaction, against AWS's documented rule: if it does not follow the rule, every number
   is worked out from the sizes and the report says so. Say how sure each number is.
   **Decided: the product does not change for this.** `assistantDb.ts` asks for no consumed
   capacity and no log line carries units in this step; if you find the measurement cannot
   be trusted without it, say so in the report and leave it for the review.
2. **How large a conversation can really get.** The bound is checked when a message arrives,
   and a message may then take eight requests, each with several results of 6 KB, and a
   waiting proposal keeps results back in `META`. Read the code and say: the largest
   conversation that can be stored, the largest single `META` item, the largest step (read
   and write), and whether DynamoDB's limits on an item (400 KB) and on a transaction can be
   reached. **If one can, stop and tell me**: that is a finding, not a number.
3. **The conversation under another mark.** The plan says the local function is started with
   another mark. That needs a switch in the product that only a test uses, and two more
   restarts, and it cannot run in the gate. **Decided with me, a difference from the plan's
   text:** the journey changes the stored mark instead. It starts a conversation, writes another
   `promptVersion` on the person's `META` item straight in the local table (the second write a
   journey makes to that table, beside `forgetDailyUse`), and shows that the conversation is
   over: `GET` answers an empty one, the next message starts a new one, the old messages are
   not sent to Claude. It runs in every gate. Say what it proves of what the plan wants and
   what it leaves to the unit tests, and write the difference in the plan's note.
4. **What the search of the logs looks for, and in what.** Proposed: a scratch script reads
   `/tmp/shared-calendar-local-api.log` after a whole run of the journeys and looks for every
   sentence of `answers.json`'s `messages`, every other text the journeys send or expect of
   Claude, the notes they write, the summaries of the proposals, the type names of
   `JOURNEY_TYPES`, the usernames a caller names without being them, the fake's placeholder
   for the key, the two seeded passwords, and anything shaped like a token or like an
   Anthropic key. Say what is allowed to be found and why (the caller's own username, a
   tool's name, a route, an error code), and whether SAM's own lines can carry a body or an
   environment variable. **A hit is a finding: stop and tell me before repairing it.**

Answer and carry on if the proposals hold.

## Design points

1. **The journey that fills a conversation.** One block, its own throw-away User, its own
   type in `JOURNEY_TYPES`, on the fake.
   - The fake asks, for one sentence, for the largest reads a User's tools give, several in
     one answer, step after step up to the limit of eight; the journey sends that sentence
     until the server answers `409 conversation_full`. Say how many messages it takes (the
     local limit is 10 a day: stay inside it) and how long the block runs.
   - The results must be as large as the cut lets them be: give the journey's type enough
     hours on enough days for a month of `get_calendar` to reach 6 KB, in the early hours no
     other journey opens, and remove them first and last (`removeFromCalendar` clears
     patterns, a day's own hours, extra windows and the type).
   - It checks what it can check exactly: the refusal with its code, `storedBytes` against
     the bound, that the conversation can still be read and ended, and that the next
     conversation starts empty. **It asserts no number of units**: those are measured,
     written to a file in the scratch folder and reported, since an emulator's count is not
     a contract.
   - The fake learns nothing new if a scripted answer with several read requests is enough.
     Say so, or say what it learnt.
2. **The report on P3**, in the plan's note and in `docs/CONVERSATIONAL_ARCHITECTURE.md`
   section 9, in simple words:
   - per step of the filled conversation, the bytes stored, the read units and the write
     units; the worst step;
   - what a minute of busy use takes (say what "busy" is: how many people, how many steps a
     minute, from the seconds a step with the real model took in the trials of steps c05 to
     c08), against 8 and 6 a second and against the burst allowance, with AWS's rule for it
     named;
   - what happens to the person when the table throttles (which answer, which code, whether
     the SDK retries and for how long inside a function of 10 or 29 seconds);
   - a proposal: keep the bounds, or lower the 100 KB or the 6 KB, with what each would cost
     the person. **I decide.** Show me the numbers and the proposal in a short message, wait
     for my answer, then write the decision in sections 9 and 18.2. A changed bound is a
     default in `shared/src/assistant/limits.ts` (or the cap in `tools/result.ts`), with its
     tests, in this step.
3. **The search of the logs** (question 4): run it on the output of one whole run of the
   back end's journeys, all three files. Report the number of lines searched, the number of
   texts looked for and each hit. The script stays in the scratch folder.
4. **Repeatability.** The root gate twice in a row on the same stack, both green, with
   nothing done in between. Then on a fresh stack: ask me for `local:down`, `local:up` and
   `local:api`, and run it once more. Say what the second run found of the first (leftovers
   in the three tables) and why none of it matters. The gate must not depend on the day's
   count of `admin`, on what a run killed half-way left, or on the order of the blocks: say
   for each how that is ensured.
5. **The journey of the version mark**, as question 3 was answered.
6. **The documents so far.** `docs/ARCHITECTURE.md` must hold, as built: the six routes with
   their codes, the table (5.4), the six roles with what each may do (7.1), the row of the
   one secret, the threats rows and the residual risks that
   `docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.3 lists, the capacity (10), the logging
   (11) and the local stack (8). **Check each against the template and the code, line by
   line, and report what was missing or untrue**, however small. `docs/journeys/README.md`
   lists every page.
7. **Logs.** Unchanged, unless question 4 found something.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c09 lists.

- **Code:** the two journeys in `backend/tests/integration/assistant.test.ts` with their
  helpers in `setup.ts`; the fake's answers; `shared/src/assistant/limits.ts` or
  `tools/result.ts` only if I lower a bound; other product code only if the search of the
  logs found something and I said how to repair it.
- **Unit tests:** only for product code that changed. 100 % of the lines of
  `backend/src/assistant`, `backend/src/lib` and `shared/src`, as before.
- **Journeys**, on the fake, each `describe` with its page written and checked with the skill
  `explain-journey` (one subagent writes, another checks in a fresh context, its points
  answered):
  - a conversation filled to its bound, refused with `conversation_full`, read, ended, and
    the next one started;
  - a conversation under another mark is over.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c09 in the v13 entry, and what design point 6
    found missing.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v12: the status line, the change log, section 9
    (the numbers in place of "the plan measures it"), 18.2 (P3 with its decision), 4.4 if a
    bound changed, 12.1 and 12.2 for the journeys and the journey's second write to the
    table.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, P3 in section 2.2, an "As done" note
    under step c09, and what steps c10 and c11 find ready.
  - `docs/COMMANDS.md` (the journeys' accounts and blocks; `tee` for `local:api` when the
    output is to be searched), `docs/FOLDER_STRUCTURE.md` only if a file was added,
    `docs/journeys/README.md` and `docs/journeys/concepts.md`.
  - `CLAUDE.md` and `backend/CLAUDE.md` only if a line became untrue. Report the line counts
    of both.

Not in this step:
- any new tool, route or function; any change to a calendar handler or to
  `lib/calendarDb.ts`, `lib/calendarRules.ts` or `lib/cognito.ts`;
- a change to the table's capacity in `backend/template.yaml`: P3 moves the bounds, not the
  units, unless I say otherwise at the review;
- the evaluation, the effort level, the model and blocking by a new tool (step c10, open
  points P4 and P5);
- the screen and anything in `frontend/` (steps c11 and c12);
- the open points P1, P2, P4, P5, P6 and P7;
- the real Claude: no key, no request to Anthropic;
- the cloud: no deploy, no `aws` command against a real account.

## How we work in this step

- **Messages to me are short.** At the end of a task, and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. No tables and no long
  report in the console. The detail the acceptance asks for goes into the "As done" note of
  the plan; give me more only when I ask.
- **The pauses, as few as possible.** One for the decision on P3, with the answers to the
  four questions and any question of yours in the same short message. One for the fresh
  stack. Say at each what it is for.
- **The local stack:** I start it before the session, `local:api` through `tee` as written
  at the top. Run `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself when
  `local-seed.sh`, the compose file or the wiring changes: it is idempotent and local. **Do
  not run `local:down`**: for the fresh stack, ask me. **`local:api` is mine: when it needs a
  restart, tell me and wait**, and tell me exactly what to do: which terminal, which command
  (with its `tee`), and what word you wait for. **Never send anything to the assistant to
  learn whether the API was restarted**: read the fake's log (`docker compose logs
  fake-claude`, in `backend/`), the log file, or wait for my word. After a change to
  `backend/docker/fake-claude.mjs`: `docker compose restart fake-claude`, in `backend/`.
- **The log file** `/tmp/shared-calendar-local-api.log` is read by scripts that print counts
  and the lines that hit, each cut to a short length; never print it whole. It is mine: do
  not delete or empty it.
- **The stored conversations and `answers.json`** hold very long strings: a script that
  reads them shortens every long string before it prints. Scratch scripts and the file of
  measured units live in the scratch folder, never in the repository, and are deleted at the
  end, after the numbers are in the plan's note. A shell command that holds a script goes
  through a file or a here-document, not through `node -e '…'` with quotes in it.
- **A script that deletes** from a local table or through a route names what it deletes by
  the journey's own type, id or account, never by a period or a kind alone, and prints what
  it found before it deletes.
- **The journey pages** are written by one subagent and checked by another in a fresh
  context, as the skill says, while the documents are written in the main session.
- **Hard rules:**
  - **no request of the model, and no text anybody typed, runs a change**: the only code path
    to a change handler starts at `confirmProposal`;
  - **the assistant can never create a user, delete one, or reach an administrator's
    account**;
  - `backend/src/assistant` reaches the calendar and Cognito through a handler only;
  - `@anthropic-ai/sdk` is imported only in `backend/src/lib/anthropic.ts`; the AWS SDK only
    under `backend/src/lib` (the journeys' `setup.ts` may use it, as it does);
  - logs never hold a text, a tool's input or result, a token, a password or the key;
  - unit tests reach no network; the journeys run on the fake and refuse the real Claude;
  - the existing tests keep passing unchanged, except those of the places this step replaces.
    Note which changed and why;
  - never run the back end's and the front end's integration tests at the same time;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief, step or finding name in a comment.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan, AWS's documentation and this brief
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change.
  The architecture wins over the plan, and the plan over this brief. What DynamoDB really
  does wins over all of them, and changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c09)

- The four questions answered, and the answers written where they belong in
  `docs/CONVERSATIONAL_ARCHITECTURE.md`.
- The design points applied as written (any deviation noted with its reason).
- **P3's numbers** and my decision, in `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 9 and
  18.2 and in the plan's section 2.2.
- **The search of the logs empty**, or each hit reported and settled with me.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- The two journeys green on the fake, with their pages, each checked, the checker's points
  answered.
- **The root gate, `DYNAMODB_PORT=8002 npm run verify`, green twice in a row on the same
  stack, then once on a fresh stack**, on the final state.
- `docs/ARCHITECTURE.md` checked against what is built, and what was missing added.
- The scratch folder's scripts and files deleted; the stack on the fake, the local settings
  as they were before the session.
- **In the plan's "As done" note**, not in the console: the differences from the step's
  text, what was decided and by whom, the tests replaced, the numbers of P3 with how each
  was obtained and how sure it is, the result of the search, what the three runs of the gate
  showed, what the journeys leave in the local tables, and what steps c10 and c11 find
  ready.

Then stop for review, with the short closing message of "How we work": what was done, what
failed or could not be run, and what I must decide. Suggest the commit, but commit only when I
ask. Do not push. Do not start step c10.
