## Before opening the new session (operator)

This step changes what the assistant is told, runs its journeys against the fake Claude, and
ends with the paid evaluation against the real one. In the worktree `shared-calendar-slot-5min`
(branch `slot-5min`), after `nvm use`, with Docker running and **no `ANTHROPIC_API_KEY` in the
shell** for the first part (the journeys refuse the real Claude):

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

Start the stack from this worktree, and only while the mail work in the checkout of `main` is
not using it: there is one local stack on this machine, and both want port 3000.

You will be asked twice to act:

1. **To restart `local:api`** after the session has built the back end, before the journeys.
2. **To start the stack afresh with the real key, for the paid evaluation**, in your own
   terminal, as `docs/COMMANDS.md` says for `npm run assistant:eval -w backend`:
   `local:down`, `local:up` with the key, `local:api` through `tee` into
   `/tmp/shared-calendar-local-api.log`. The session never sees or types the key. Afterwards
   you put the fake back (`local:up` without the key, restart `local:api`).

**Changed on 2026-11-25, before the step was started: the paid evaluation is not run in this
step** (see "Decided for this step", decision 3). The second action above and the step's
point 7 are therefore not carried out here; they are kept as written, as the way the run is
made in step s6. Nothing goes to the AWS cloud in this step.

## Brief

Implement plan step s3, "The assistant" (`docs/SLOT_STEP_PLAN.md`), following CLAUDE.md's
working rhythm: one step, its acceptance check, an honest report, then stop for review.

After this step the assistant is told that the opening hours lie on 5-minute steps, in its
instructions and in the tools that change the opening hours, so that "open Tuesdays from 09:05"
or "block 10:10 to 10:35" is proposed as asked and not rounded to a quarter hour. It still
books and moves appointments on free slots only, whole hours: the Administrator's custom times
stay in the web pages. The evaluation gains two requests and is run once with the real model.
Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (the logging rule: no text of a conversation in a log; the assistant changes
  the calendar only through `confirmProposal`), "Cloud safety" (**`npm run assistant-key` is
  never run**), "Comments", "Tooling and style" (100 % line coverage on
  `backend/src/assistant`); then `backend/CLAUDE.md` (its part on `src/assistant/` and on the
  assistant's journeys) and `shared/CLAUDE.md`. The rules of `.claude/rules/` load when a file
  of their paths is read.
- `docs/SLOT_STEP_PLAN.md`, all of it: the decisions (section 2, **S8**), the findings
  (section 3, **F6 and F11**), **the "As done" note of step s2 and its "Step s3 finds
  ready"**, step s3, and steps s4 to s6 to see what this step must not take from them; section
  6 (the mail work also changes the instructions).
- `docs/SHARED_CALENDAR_SPEC.md`: decision D32; R-SLOT-01 with its example of the window that
  opens at 08:05; R-BOOK-02.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: its status line (the last sentence, "The time step
  becomes 5 minutes", which this step removes); section 3 (the tools); 4.3 (the mark of the
  instructions); **7.3** (the instructions, and "What the evaluation changed"); **8.2** (each
  tool's four parts: the line on the weekly pattern's start and end "on the quarter hour") and
  8.3; 12.1 and 12.2 (the fake Claude, the journeys); **12.3** (the evaluation, and the record
  of its last run); the version table.
- `docs/COMMANDS.md`, the notes on `local:up` with `ANTHROPIC_API_KEY` and on
  `npm run assistant:eval -w backend`.
- The code: `backend/src/assistant/prompt.ts` (`INSTRUCTIONS`, the paragraph "Blocking time";
  `promptVersion`); `backend/src/assistant/tools/facts.ts` (`hoursInput`, `freeSlotAt`);
  the tools built on them, `createPattern.ts`, `updatePattern.ts`, `setDateOverride.ts`,
  `createOneOffWindow.ts`, `bookAppointment.ts`, `changeAppointment.ts`; `tools/tool.ts` (how a
  schema becomes what Claude is given); their tests under `backend/tests/unit/assistant/`;
  `backend/tests/integration/assistant.test.ts` and `fake-claude/answers.json`;
  `backend/tests/eval/` (`requests.ts`, `checks.ts`, `week.ts`, `run.ts`) and its tests under
  `backend/tests/unit/eval/`.

## Where we are (2026-11-25)

- Steps s1 and s2 are committed (`94cb7b7`, not pushed): the rule is in the spec (v19,
  decision D32); `shared/` holds `TIME_STEP_MINUTES` and a `LocalTime` on 5-minute steps; the
  server books and opens on them. The page still offers quarter hours.
- **The pattern Claude is given for a time already allows 5-minute times**, since the tools
  are built on `LocalTime`; only the words still say "the quarter hour". So the mark of the
  instructions changed in the first pair already.
- Three assertions of the assistant's tool tests had their example time moved off the step in
  the first pair (`09:07`, `19:07`, `10:07`); their names still say "the quarter hour".

## Decided already (the Product Owner, 2026-11-25)

The decisions S1 to S8 and the findings F1 to F11 of `docs/SLOT_STEP_PLAN.md`, written into
`docs/SHARED_CALENDAR_SPEC.md` as D32. Apply them; if the code proves one wrong, stop and tell
me before going on.

## Decided for this step (the Product Owner, 2026-11-25)

1. **Only the words about the opening hours change.** The sentence of the instructions and the
   two descriptions of `hoursInput`. The descriptions of `time` in `book_appointment` and
   `change_appointment` stay as they are ("It must be one of the freeSlots"): they are still
   true, and every changed word is a risk for the evaluation.
2. **No new journey on the fake Claude.** The tools do the same as before with one more value
   allowed, which the unit tests prove; the assistant's journeys are run as they are, to show
   that nothing broke.
3. **Two requests more in the evaluation** (S8). **The paid run is not made in this step:**
   the mail work's step m6 adds a tool to the assistant, so the assistant that is deployed
   is the merged one, and the run is made once on it, in step s6, part B
   (`docs/SLOT_STEP_PLAN.md`). Point 7 below and the acceptance line on the evaluation's
   result do not apply here; the step ends with the journeys on the fake Claude and the
   evaluation's list printed for free. `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3
   records that no run was made, and why.

## The step

1. **`backend/src/assistant/prompt.ts`.** In the paragraph "Blocking time", "Hours are on the
   quarter hour." becomes one sentence that says the step and gives the minutes as an example,
   in the plain style of the rest: "Hours are on 5-minute steps: 10:05, 10:10 and so on." or
   words of that kind. Nothing else in `INSTRUCTIONS` changes. If the sentence reads badly
   where it stands, propose another place before moving it.
2. **`backend/src/assistant/tools/facts.ts`.** The two descriptions of `hoursInput`: `start`
   "on a 5-minute step (minutes 00, 05, 10 and so on up to 55)", `end` the same, or "24:00"
   for the midnight that closes the day. Its comment. Do not write the number 5 into a
   comparison in code: `TIME_STEP_MINUTES` of `@shared-calendar/shared` is the step; in a
   sentence for Claude the number may be built from it or written, as reads best, and the
   test of point 3 holds it to the constant either way.
3. **The unit tests** under `backend/tests/unit/assistant/`, 100 % line coverage kept:
   - the tools of the opening hours (`create_pattern`, `update_pattern`, `set_date_override`,
     `create_one_off_window`): `09:05` and an end at `11:55` accepted, `09:07` refused; the
     names of the tests that still say "the quarter hour" say the step; what Claude is given
     for `start` and `end` holds a description that names the step of `TIME_STEP_MINUTES` and
     no longer "quarter";
   - **`book_appointment` and `change_appointment` asked for `10:10`**: the schema lets the
     time through, and the tool answers the refusal of `freeSlotAt` (`no_free_slot`), with
     nothing proposed and no route that changes the calendar called. One test for a User and
     one for the Administrator booking for a User, and the same for a move (F6);
   - `prompt.test.ts`: the instructions name the 5-minute step and not the quarter hour.
4. **The journeys.** Search `backend/tests/integration/assistant.test.ts` and
   `fake-claude/answers.json` for a time or a sentence that depends on the quarter hour.
   Planning found none; if you find one, change it with its page under `docs/journeys/`
   (the project skill `explain-journey`) and report it. Otherwise no journey changes.
5. **The evaluation**, `backend/tests/eval/`:
   - **Two requests**, of a kind of their own or of the kinds they belong to, as reads best in
     `requests.ts`:
     - in English, the Administrator opens a weekly pattern on 5-minute times, on a weekday and
       hours where the known week has no window of that weekday (read `week.ts`), for example
       "Open eval Lesson every Sunday from 14:05 to 16:35, from … on": the check is the
       proposal of `create_pattern` with `start` and `end` exactly as asked;
     - in Italian, the Administrator blocks 10:10 to 10:35 on a day of the known week that has
       a window over that time and no appointment in it: the check is the proposal of
       `set_date_override` with the pieces that are left, cut at 10:10 and 10:35, in the
       style of the request `block-hour`.
   - `checks.ts` only if a check is missing for them; never a sentence of Claude.
   - The unit tests of the evaluation and `-- --list`, which costs nothing, show the two new
     requests and their checks.
6. **Build and the free checks:** `npm run typecheck`, `npm run lint`, `npm run test:unit`;
   `npm run build -w backend`; then **ask me to restart `local:api`** and wait. Then the
   back end's journeys, the assistant's among them:
   `DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend`.
7. **The paid run, once.** Stop and tell me when point 6 is green, and say the cost you
   expect (the last run was 45.20 US cents for 57 requests). **I start the stack afresh with
   the real key in my own terminal**; then you run
   `DYNAMODB_PORT=8002 npm run assistant:eval -w backend -- --ceiling 1 --out <scratchpad>/run.json --hand <scratchpad>/answers.txt`.
   Afterwards I put the fake back. Report each failed request with its check, the two new
   requests whatever their result, the hand-read answers that matter, and the cost.
   - A request that fails is played again alone before it is believed
     (`-- --only <id>`, a few cents): say so and do it.
   - A failure that comes from the new sentence or the new descriptions is fixed in this
     step, and **the whole run is not repeated without asking me**: a second run is a second
     cost.
   - A failure of a request that has nothing to do with the step is reported, not fixed here.
8. **Documents**, in the same change:
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: a new version row; the status line without the
     sentence the first pair added; section 7.3 where it tells what the instructions say about
     blocking; section 8.2, the weekly pattern's start and end; section 12.3: the number of
     requests and of messages, how many in each language, the two new ones named, and **the
     record of this run** in the style of the last one (the date, the ceiling, the model and
     effort, passed of played, the steps, the cost, what was read by hand). Say that the mark
     of the instructions changes, which ends the conversations in progress at the deploy.
   - `docs/COMMANDS.md`: the number of requests of `assistant:eval`, and its cost if the run
     shows another.
   - `docs/ARCHITECTURE.md`: this step's sentence in the open version row of the 5-minute
     step.
   - `docs/SHARED_CALENDAR_SPEC.md`: the status line, where it says the assistant still
     offers quarter hours.
   - `docs/SLOT_STEP_PLAN.md`: an "As done" note under step s3, ending with what the pair s4
     with s5 and step s6 find ready, and the version line. The note says whether the
     evaluation must be run again when the branch meets the mail work (section 6 of the
     plan): it must, if the mail work changed the instructions or a tool meanwhile.

Not in this step: any file under `frontend/`; `shared/src/calendar` and
`backend/src/lib` (done in the first pair); the handlers; `backend/template.yaml`;
`backend/scripts/smoke.sh`; `README.md`, `docs/RUNBOOK.md`, `docs/FRONTEND_*`,
`docs/FRONTEND_WALK.md`; the model, the effort and the limits of the assistant; any tool's
name, any new tool; any `aws` command; the cloud; `npm run deploy`; `npm run assistant-key`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the restart of `local:api` (point 6); the paid run (point 7), before it and
  before any second run; a journey that turns out to depend on the quarter hour; any change
  the step seems to need in a file listed under "Not in this step".
- Do not stop, start or restart the local stack yourself, and never run the evaluation
  together with the integration tests.
- Logs and outputs never hold the key, a token or a password. The evaluation's two files go
  to the scratchpad, never into the repository; they hold texts of conversations, so quote
  from them in the report only what is needed, and nothing of them into a log.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or
  why, each reference with the document's path in the same sentence, no step or brief
  numbers, no "formerly the quarter hour".
- Commit only when asked. Do not push. Do not start the pair s4 with s5.

## Acceptance (`docs/SLOT_STEP_PLAN.md` step s3)

- The instructions and the two descriptions of `hoursInput` say the 5-minute step; no
  "quarter hour" is left in what Claude is given, nor in `backend/src/assistant`.
- The unit tests prove that the tools of the opening hours take 5-minute times and that
  `book_appointment` and `change_appointment` refuse 10:10 as no free slot.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept.
- The back end's journeys green on the fake Claude, on the new build.
- The evaluation played once, under US$1: the result of each failed request and of the two
  new ones, and the cost, said and recorded in `docs/CONVERSATIONAL_ARCHITECTURE.md` section
  12.3.
- `git status` shows changes under `backend/src/assistant`, `backend/tests` and `docs/` only.
- The "As done" note holds the detail. Then the short closing message, and suggest the commit.
