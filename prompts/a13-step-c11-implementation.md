## Before opening the new session (operator, in your own terminal)

```bash
nvm use
npm run local:down -w backend                                          # a calendar with nothing left by the evaluation
DYNAMODB_PORT=8002 npm run local:up -w backend                         # no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
```

- This step needs **no Anthropic key and costs nothing**: every test runs on the fake Claude.
  The line of `local:up` must say it wired the fake. It needs **no AWS login**; nothing is
  deployed.
- The stack stays as it is for the whole step. The session asks you for a restart of
  `local:api` only if it changes something in `backend/`, which this step should not need.

## Brief

Implement plan step c11, "Front end: `AssistantService`" (`docs/CONVERSATIONAL_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review. The design points are proposed below: apply them as written, and stop if the
code or a document proves one wrong.

After this step the front end can talk to the assistant, with no screen yet. One service,
`AssistantService`, makes the six calls of the assistant's routes by the pattern every other
service follows, and turns every answer and every error code into a result the logic layer
can tell apart. Four choices about its shape are already made, below. The screen is step c12 and is not started here.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Comments" and "Changing these files".
- `frontend/CLAUDE.md`, all of it: the folder map, "Rules that are easy to break" (what `src/`
  may import, no `document` or `window` in `src/services`) and "Tests".
- `shared/CLAUDE.md`.
- `docs/CONVERSATIONAL_PLAN.md`: sections 1 to 4, step c11, step c12 to see what this step
  must not take from it, and the "As done" notes of steps c09 ("What steps c10 and c11 find
  ready") and c10 ("What step c11 finds ready").
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 4 (a conversation, its language and its
  limits), 5.1 to 5.3 (one request to Claude per HTTP request, the states, a reading driven by
  `continue`), 5.4 and 5.5 (a proposal, confirm and decline), **6 and 6.1 in full (the
  contract: the six routes, `AssistantReply`, every code and when it is answered)** and 13
  (the front end: what the screen will ask of the service).
- `docs/FRONTEND_SERVICES.md`: sections 2 (the rules), 3 (the pattern), 10.2 (`api.ts`: one
  authenticated call, the refresh, what an unexpected answer becomes), 14 (placement, the
  journeys, how they clean up) and **19 (`AppointmentsService`, the most recent service: the
  section this step's new section copies in shape)**.
- `docs/ARCHITECTURE.md` section 4, "The assistant's routes", and section 8, "The fake Claude".
- `docs/COMMANDS.md` sections 3.4 and 4: the fake Claude and its `answers.json`, the
  integration tests of both packages, what the journeys leave behind.
- `docs/journeys/README.md`, and one page of each package as a model:
  `docs/journeys/frontend/calendar-appointments.md` and
  `docs/journeys/backend/assistant-blocking.md`.

Then read the code this step builds on:
- `shared/src/api.ts` (the error codes) and `shared/src/assistant/` (`types.ts` with
  `AssistantReply`, `schemas.ts`, `limits.ts`, the texts): **the contract is already there;
  the front end imports it and declares none of it again**.
- `frontend/src/services/api.ts`, and `appointments.service.ts` with `appointments.types.ts`
  and its unit test: the shape to follow.
- `frontend/tests/integration/local.ts`, `calendar.test.ts` and `journeys.test.ts`: how a
  journey signs in, what it creates and how it removes it.
- `backend/tests/integration/assistant.test.ts`, the blocks of a reading, a booking and a
  decline, and `backend/tests/integration/fake-claude/answers.json`: the sentences the fake
  answers, the marks it understands, the accounts the back end's journeys use.
- `backend/tests/integration/setup.ts`: `claudeWiringProblem()` and `forgetDailyUse()`.

## Where we are (2026-11-22)

- Steps c00 to c10 are done and committed (`c2a4a24`). The back end of the assistant is
  complete and described in `docs/ARCHITECTURE.md`; the model is `claude-sonnet-5-5` at effort
  `low`; open points P3, P4 and P5 are closed.
- The six routes exist and are covered by the back end's journeys on the fake Claude.
- `frontend/` holds nothing of the assistant: no service, no logic, no view.
- `docs/FRONTEND_SERVICES.md` is at v7 and says the services layer is complete for every route
  of the API. That sentence becomes untrue with the assistant's routes and is corrected here.
- The local stack gives each person 10 messages a day, and the count is never reset by a
  route. The fake answers only the sentences of `answers.json`.

## Decided already (the Product Owner, 2026-11-22)

Four things are settled. Apply them; if the code or a document proves one wrong, stop and tell
me before going on.

1. **One stream for the conversation.** The service has a single public stream, and each of
   the six calls notifies its outcome on it: the reply the server gave, or the reason of the
   failure, with the call it came from. It is not one stream per call, which is what
   `docs/FRONTEND_SERVICES.md` section 3.1 shows: the six calls speak of one thing, the
   person's conversation, five of them answer the same `AssistantReply`, and the screen shows
   one conversation. The rest of the pattern holds as written: a failure is a value, only
   `next` is forwarded, the stream lives as long as the service. The stream carries each
   outcome as the server gave it; putting the added messages together into the whole
   conversation is the logic layer's work in step c12. **The document gains a note for it**
   (see "The step").
2. **The caller repeats `continue`, not the service.** A call of the service makes one HTTP
   request. The loop "while the status is `working`, continue" belongs to the logic layer of
   step c12; in this step the journey repeats the call itself.
3. **The journeys reuse the fake's sentences, under accounts of their own.** They send
   sentences `answers.json` already answers, and each run creates its throw-away accounts
   through `UsersService` and deletes them, first and last. A new account has its whole day's
   count, so the daily limit is never met and no test touches the `assistant` table. Nothing
   changes in `backend/` or in the fake. **Before writing the journeys, check that this
   holds**: what each reused sentence needs of the calendar (the name of a type, a day, its
   hours, the marks of the fake) and whether an account's name matters to the fake. If a
   sentence cannot be reused as it is, stop and tell me what is missing.
4. **The service tells the cases apart and writes no sentence.** The three codes of
   `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1 are three reasons. Choosing and showing
   their sentences, which are in `shared/`, is the screen's work in step c12:
   `frontend/src/logic/texts.ts` is not touched here.

## Design points

1. **The files.** `frontend/src/services/assistant.service.ts` and `assistant.types.ts`, and
   nothing else in `src/`. Every call goes through the shared `api.ts`: the token, the refresh
   and the handling of an unexpected answer are its own and are not written again.
2. **The six calls**, one per route of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6: read
   the conversation, end it, send a message, continue, confirm a proposal, decline a proposal.
   The names follow the other services' habits.
3. **Every code a result of its own.** For each call, each code the contract gives its route
   is a reason the logic can tell apart, typed as a closed list: a `switch` over it with no
   default must compile. On the one stream an outcome also says which call it answers, so
   that the reasons of a route stay those of that route. `assistant_limit_reached`, `assistant_budget_reached` and
   `assistant_unavailable` are three reasons, never one. A code the contract does not give
   that route is `unexpected`, as in the other services.
4. **What is refused before a request.** A text that is empty after trimming or longer than
   the limit of `shared/`, and a proposal id that is not a ULID, by the schemas of `shared/`,
   as the other services refuse a bad input. No rule is written twice.
5. **Nothing of the model is interpreted.** A message's text is passed on as written. The
   service builds no sentence and chooses no language.
6. **No memory in the service** beyond the last outcome its stream replays. The conversation is
   the server's: after a reload the screen asks for it again.
7. **Unit tests**: every call, and for every call every code of its route, the codes of
   neighbouring routes as `unexpected`, the inputs refused before a request, and what is sent
   (the method, the path, the body or its absence). `fetch` is stubbed, as in the other
   services' tests. 100 % line coverage on `frontend/src` holds.
8. **Three journeys** in `frontend/tests/integration/`, in a file of their own, against the
   fake: a reading driven by `continue`; a booking confirmed, with the appointment then read
   back through the calendar's service; a proposal declined, with the calendar unchanged. Each
   `describe` has its page in `docs/journeys/frontend/`, written and checked with the project
   skill `explain-journey`, and the pointer comment above it.
9. **The journeys refuse the real Claude**, as the back end's do, and say why. They never
   empty the `calendar` table, create what they need under names of their own and remove it,
   first and last, also after a failed run.

## The step

1. The types and the service, with their unit tests.
2. The check of decision 3, then the journeys, on the stack as it is, with their pages.
3. `docs/FRONTEND_SERVICES.md`: **a note in section 3**, where the pattern is given: the
   pattern is a guideline and may be read in a wider sense where that makes sense, for
   instance one stream shared by several calls that speak of the same thing; the note names
   `AssistantService` and its section as the example, and says in one or two sentences why it
   made sense there. Section 2's rules are checked against it and reworded if one of them
   says "one subject per remote call" as a rule with no exception. Then a new version, with a section for the service in the shape of
   section 19 (the remote calls with their codes, the types, the class, the mapping, its use
   from the view layer, security notes, unit tests, integration checks), the status line, the
   change log, the corrected sentence on the layer being complete, and section 14 for the new
   journeys.
4. The other documents:
   - `docs/CONVERSATIONAL_PLAN.md`: the status line and an "As done" note under step c11,
     which ends with what step c12 finds ready;
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: only where the step proved a sentence wrong, with
     its version and change log;
   - `docs/COMMANDS.md` section 4: the front end's new journeys, their accounts, what they
     create and leave behind;
   - `docs/FOLDER_STRUCTURE.md` and `docs/journeys/README.md` for the new files and pages;
   - `CLAUDE.md` (199 lines of 200) and `frontend/CLAUDE.md`: only if a line became untrue.
     Report the line counts.

Not in this step: anything in `frontend/src/logic` or `frontend/src/views`, `index.html` or
`style.css`; a route, a function or a tool; a change to `backend/src`; a change to the
instructions; the real Claude; the cloud. A change to `shared/` only if the contract lacks
something the service needs: stop and tell me first. No change to `answers.json` or to the fake (decision 3).

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a decision above that proves wrong; anything that would change `shared/`, `backend/` or the
  fake; a design point that proves wrong.
- **The local stack is mine**: `local:up`, `local:down` and every restart of `local:api`. Tell
  me exactly what to run, in which terminal, and the word you wait for. To know which Claude
  is wired, read whether `ANTHROPIC_BASE_URL` is in `backend/env.local.json` with a script
  that prints yes or no; **never print that file or a line of it**.
- **Never run the two packages' integration tests at the same time**, nor a gate beside them.
  The back end's calendar journeys empty the local `calendar` table: run the front end's
  journeys before the root gate, or after it on what they create themselves.
- **The log file** `/tmp/shared-calendar-local-api.log` is mine: read it with scripts that
  print counts and short lines, never whole; do not delete or empty it.
- Scratch files live in the session's scratch folder, never in the repository, and are
  deleted at the end. A shell command that holds a script goes through a file or a
  here-document. The shell is zsh.
- **A script that deletes** names what it deletes by the journeys' own accounts and types, and
  prints what it found first.
- **Hard rules that bear on this step:** `frontend/src` imports only `rxjs`, its two
  sub-paths, `@shared-calendar/shared` and relative files; no `document` or `window` in
  `src/services`; a view never sees a token, and neither does a log or a test's output; the
  API contract lives in `shared/` and is not declared again; unit tests reach no network;
  existing tests keep passing unchanged, and where one must change, say which and why.
- Comments follow CLAUDE.md "Comments": plain words, a document named by its path in the same
  sentence as the item, no brief, step or finding names, no history.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked. Do not push. Do not start step c12.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c11)

- The four decisions are written where they belong in `docs/FRONTEND_SERVICES.md`.
- `AssistantService` makes the six calls through `api.ts`; every code of
  `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6 is a reason of its own for the routes that
  answer it, the three of section 6.1 each on its own.
- `npm run verify -w frontend` green: typecheck, lint, unit tests, 100 % line coverage.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend` green against the fake, twice in a
  row, and the journeys refuse the real Claude (shown without wiring it: by the test of the
  check, not by a request).
- The three journeys have their pages, checked against the tests with `explain-journey`.
- The root gate `DYNAMODB_PORT=8002 npm run verify` green on the final state.
- `npm run typecheck` and `npm run lint` green at the root.
- The documents of "The step" updated; the scratch files deleted; the stack left on the fake.
- The "As done" note holds the detail. Then the short closing message, and suggest the commit.
