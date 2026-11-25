## Before opening the new session (operator)

This step releases times on 5-minute steps: a smoke-test journey run locally, the full
regression, one paid evaluation, then, only when asked in that session, the API and the page
deployed and the documents closed. Everything happens in the worktree
`shared-calendar-slot-5min` (branch `slot-5min`), after `nvm use`, with Docker running and
**no `ANTHROPIC_API_KEY` in the shell**.

**The local stack is one per machine** and belongs to the folder that started it
(`docs/SLOT_STEP_PLAN.md`, the "As done" note of step s3). The mail work in the checkout of
`main` must leave it free for parts A and B. Start it afresh from this worktree:

```
npm run local:down -w backend                       # it still holds the data of the last look
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded, with the fake Claude
npm run local:api -w backend                        # in a second terminal, left running
```

The session will ask you to restart it twice more in part B: once before the walk (the
back end's journeys empty the `calendar` table, and the walk needs the seed), and once with the
real key for the paid evaluation, then back without it. It never restarts the stack itself.

Two things to settle before the cloud parts (C and D below), not needed for parts A and B:

- **The tree must be clean for a deployment** (`scripts/deploy-gate.sh`): the session commits
  parts A and B first, when asked.
- **The AWS login**: `aws sso login --profile shared-calendar-admin --use-device-code` and
  `export AWS_PROFILE=shared-calendar-admin`. The smoke test asks for the admin password at its
  prompt; the Anthropic key is already stored in the cloud, so the smoke test's exchange costs
  about a US cent.

## Brief

Implement plan step s6, "The release" (`docs/SLOT_STEP_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report at each pause, then stop for review.

After this step the Administrator's windows and custom appointment times are on 5-minute steps
in the cloud: the smoke test proves it against `shared-calendar-api`, the real model has been
measured on the assistant's new words, the API and the page are deployed, the operator has taken
a quick look at the deployed page, the deployment is recorded, the documents' versions are
closed, `docs/SLOT_STEP_PLAN.md` is finished and the release is tagged `v2.4.0`.

The step has four parts. **Parts A and B are local** and are done in any case, the paid run of
part B only on my word. **Parts C and D touch the cloud: each is done only when I ask for it in
this session, in so many words, after the part before it is reported.** Without that, each is
reported as "not run".

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md` and
  `frontend/CLAUDE.md`.
- `docs/SLOT_STEP_PLAN.md`, all of it: the decisions (section 2), the findings (section 3,
  **F9** the API first, **F10** no way back without care, **F11** the assistant), the "As done"
  notes of steps s1 to s5 (**s3's** on the evaluation not run and on the one local stack,
  **s5's "Step s6 finds ready"**), step s6 and **section 6, rewritten in v8: this plan is
  released alone, before the mail work, and merged into `main` afterwards.**
- `docs/SHARED_CALENDAR_SPEC.md`: the status line (v19, "not deployed"), decision D32, R-BOOK-02,
  AC-45 to AC-48, section 18.4 (the smoke test's calendar journey).
- `docs/ARCHITECTURE.md` section 9.3 (the smoke test) and **the v16 row** of the change log,
  still open.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: the status line (v22), section 4.3 (a new mark of the
  instructions ends the conversations in progress), **section 12.3** (the evaluation, the last
  run's record, the two requests of step s3), section 14.
- `docs/COMMANDS.md` sections 3.4 (the fake and the real Claude, `assistant:eval`), 5 and 6.
- `docs/RUNBOOK.md` sections 1, 2 (with 2.1 to 2.3, the smoke test's journeys, and the count of
  its lines), 3.2, and **5.8** (the last record: the shape of a record).
- `README.md`: the deployed stacks, the smoke test's row, **section "Versions"**.
- `docs/FRONTEND_WALK.md` whole, with its section 1 (what the walk needs and leaves) and
  **section 11** (checks 157 to 170, never walked at a real phone width).
- The code: `backend/scripts/smoke.sh` in full (the rules of its header: tokens and passwords
  only in shell variables and pipes, the cleanup on every exit, what stays by design, how it
  picks its date and hour), `scripts/deploy-gate.sh`, `backend/scripts/deploy.sh`,
  `frontend/scripts/deploy.sh`, `backend/tests/eval/` (the requests and their checks).

## Where we are (2026-11-25)

- Steps s1 to s5 are on `slot-5min`, committed (`94cb7b7`, `26ee22e`, `ffce069`), not pushed.
  The branch's base is `b3c3425` on `main`: no code of the mail work is on it.
- `main` holds the mail work's steps m1 to m4, local only, and the mail session is at step m5.
  None of it is part of this release.
- No route, body field, error code, table item or function changed in the plan, and
  `backend/template.yaml` did not change: the deployment of the API should change the
  functions' code and nothing else. Its change set says so, or it is a pause.
- The deployed stacks run `v2.3.0` (`a8b3a2b`). The smoke test passes 49 lines in the cloud
  (`docs/RUNBOOK.md` section 2).
- The mark of the assistant's instructions changed in step s3: the deployment of the API ends
  every conversation in progress (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.3).
- The evaluation lists 59 requests, 64 messages; **it has not been run on the words of step
  s3**. The last run passed 57 of 57.
- `docs/FRONTEND_WALK.md` section 11 was looked at in Chrome at 1280 wide; the phone width was
  only emulated (the window could not be resized).

## Decided already (the Product Owner)

Apply them; if a document proves one wrong, stop and tell me before going on.

1. **Released alone, `v2.4.0`** (`docs/SLOT_STEP_PLAN.md` section 6, open point O1, decided
   2026-11-25): from `slot-5min` as it is, before the mail work; `main` is not merged in, and
   the merge into `main` is not part of this step.
2. **The API first, then the page** (`docs/SLOT_STEP_PLAN.md` F9): the page of today works
   against the new API; the new page against the old API would have its 5-minute times
   refused.
3. **The smoke test creates and deletes everything it uses**, as its journeys do today. It
   never changes the settings, a real type or a real person's appointment.
4. **The paid evaluation runs once, in part B, on this branch**, only on my word, the cost said
   first. A failure that comes from the sentence or the descriptions of step s3 is fixed before
   part C, in `backend/src/assistant` only, and the run is made again only on my word.
5. **The cloud runs (parts C and D) only when asked in this session.**
6. **The look at the deployed page uses a throw-away User and a throw-away type**, created on
   the page by the Administrator and deleted at the end; never a real person's account or a
   real type. Claude does not drive the browser at the deployed page and never sees the admin
   password.

## Decided for this step (the Product Owner, 2026-11-25)

1. **Nothing is pushed**, neither the branch nor the tag. Do not push, and do not ask to.
2. **The smoke test's new lines go into the calendar journey**, on its date, in its window
   03:00–04:00, after its User's cancellation and before the window is deleted: the
   Administrator books a custom time on the 5-minute step for the throw-away User
   (`201`, its times read back exactly), then cancels it; and a time off the step
   (a minute such as 03:07) is refused `400 invalid_request` with nothing written. No other
   journey changes.
3. **The full walk runs at a real phone width**, 390 × 844, in a browser whose viewport really
   is that wide (headless Chromium driven by a script, as the walk's v5 run was, or my Chrome
   window made narrow by me when asked), not by narrowing the page with a script.
4. **When to deploy is the operator's choice**, and nobody is told beforehand. The deployment
   of the API ends every assistant conversation in progress; with about ten people that is
   accepted.
5. **At the deployed page, only a quick look**, by the operator, by hand. The session gives me
   a short list and I answer yes or no to each: as the Administrator, create a throw-away type
   and User on the page, open a window of that type on a free future day from 09:05 to 11:00,
   see its first slot at 10:00, book 10:10 to 10:15 for the User from the book dialog (a start
   chosen sets the end one hour later; then the end changed), see it drawn as a short block,
   then cancel it and delete the window, the User and the type. **Everything made is deleted**,
   so no 5-minute time stays in the cloud and a roll-back stays possible (F10).
6. **The tag** `v2.4.0` is made locally on the commit that closes the documents, the last of
   the plan, as `README.md` section "Versions" says.

## The step

### Part A: the smoke test, locally (in any case)

1. **`backend/scripts/smoke.sh`** gains the lines of decision 2 of this step, each starting
   with `calendar:`. The header comment says them and the new count. No answer body is printed
   (status and error code only); the cleanup runs on every exit and cancels the new
   appointment if a stop comes halfway.
2. **Run `npm run smoke -w backend -- local`**: every line PASS (the local SKIP lines stay).
3. **The documents, in the same change**: `docs/RUNBOOK.md` section 2.1 (the new lines, what
   stays by design, the calendar lock's `version` per run, the count of lines where section 2
   says 49), `docs/ARCHITECTURE.md` section 9.3 if it lists the journey's lines,
   `docs/COMMANDS.md` (`smoke`), `README.md` (the smoke test's row), and the "As done" note of
   step s6 (part A now).

### Part B: the full regression and the paid evaluation (local)

4. **The gate**: `DYNAMODB_PORT=8002 npm run verify` at the root, then, apart,
   `RUN_INTEGRATION=1 npm run test:integration -w frontend`. Never two suites at once.
5. **The walk.** Ask me to restart the stack (`local:down`, `local:up`, `local:api`), then run
   `npm run seed:local -w frontend` and the page (`npm run dev -w frontend`, in the background,
   stopped with `pkill -f 'node scripts/dev[.]mjs'`). Walk `docs/FRONTEND_WALK.md` whole at
   1280 × 800 and at 390 × 844 (decision 3 of this step), as `alice`, `admin` and the Users the
   walk makes, with its cleanups. The assistant's checks run against the fake Claude. Each
   check yes or no; a check that proves inexact is corrected in the walk, a defect of the page
   is a pause. Keep the screenshots in the scratchpad.
6. **The paid evaluation**, on my word, after you have said its cost. Ask me to restart the
   stack with the real key (`docs/COMMANDS.md` section 3.4), then run
   `DYNAMODB_PORT=8002 npm run assistant:eval -w backend -- --ceiling 4 --out run.json --hand answers.txt`
   with the run's files in the scratchpad. Read `step-pattern-new` and `step-block` by hand
   whatever their result, and say whether the model kept 14:05, 16:35, 10:10 and 10:35 to the
   minute. Then ask me to restart the stack without the key, and check that
   `backend/env.local.json` has the fake Claude again.
7. **The documents**: `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3 (the run: the date,
   the result, the cost, the two requests read by hand) and its status line;
   `docs/FRONTEND_WALK.md` (its status, a change-log row for the run at both widths, any check
   corrected); the "As done" note of step s6 (part B).

### Part C: the API deployed and proven (only when asked)

8. Commit parts A and B first (when I ask), so the tree is clean. Then
   `DYNAMODB_PORT=8002 npm run verify` (the stamp lasts 30 minutes), and
   `npm run deploy -w backend` in a terminal set up as `docs/RUNBOOK.md` section 1 says, kept
   with `script -q -c "…" /tmp/deploy.txt`. **Read the change set before anyone answers `y`**:
   it should hold the functions' code only. A Remove or Replace of a table or of the user pool,
   or any new resource, is a pause: answer N and tell me.
9. `npm run smoke -w backend -- shared-calendar-api`, the operator typing the admin password at
   the prompt: every line PASS, the new lines among them.
10. The log search of `docs/RUNBOOK.md` section 2: no password, no token, no note, no text of a
    conversation in the logs.

### Part D: the page released, looked at, the documents closed (only when asked, after part C)

11. `npm run deploy -w frontend`, behind its gate, within the same 30 minutes or after a new
    `verify`. Keep the release's lines (the files, their sizes, the invalidation) for the
    record.
12. The quick look at the deployed page, as decision 5 of this step says: the session gives me
    the list, I do it by hand and answer yes or no to each.
13. **Closing the documents:**
    - `docs/RUNBOOK.md` section 5 gains the record of this release, **5.9**, in the shape of
      5.8: the commit deployed, the change set, the smoke test's lines, the release, the quick
      look, the cost, and **F10**: a roll-back is possible only while no 5-minute time is
      stored, and what to look for first;
    - `docs/ARCHITECTURE.md` closes v16 (its row no longer "open", the steps' sentence of s6);
    - `docs/SHARED_CALENDAR_SPEC.md`: the status line (v19 built and deployed);
    - `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md`,
      `docs/FRONTEND_ARCHITECTURE.md`: their status lines, where they say not deployed;
    - `README.md` section "Versions": the row of `v2.4.0`, its commit, "Times on 5-minute
      steps (`docs/SLOT_STEP_PLAN.md`)", `docs/RUNBOOK.md` section 5.9;
    - `docs/SLOT_STEP_PLAN.md`: the "As done" note of step s6 and the version line saying the
      plan is finished, with what the merge into `main` will meet (section 6).
14. Commit when I ask, then `git tag -a v2.4.0` on that commit, with a one-line message.

Not in this step: the merge with `main` or anything of the mail work; anything in `shared/`,
`frontend/src` or either `template.yaml` (a finding there is a pause, not a fix);
`backend/src` beyond the assistant's words under decision 4; `npm run assistant-key`,
`npm run budget`; the branches `whatsapp` and `presentation`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a decision above that the code proves wrong; each restart of the local stack
  (I do it); the cost of the evaluation, before it runs; a request of the evaluation that
  fails; the end of part B (I decide on C); a change set that holds more than the functions'
  code; a smoke line that fails in the cloud; the end of part C (I decide on D); a defect found
  by the walk or the look; two documents that disagree (the architecture wins over the plan,
  the plan over this brief).
- **Cloud safety** (`CLAUDE.md`): no `aws` command that creates, changes or deletes a
  resource; `npm run deploy -w backend` only in part C and `npm run deploy -w frontend` only in
  part D, each when asked; never bypass the gate. The smoke test creates and deletes its own
  Users, type, window and appointments through the API, which is what it is for.
- **The local stack**: never stop, start or restart it yourself; ask me. The dev server is
  yours to start and stop.
- Tokens and passwords: in shell variables and pipes only, never an argument, a file, a log or
  the output; the smoke test's header states the rule, and the new code keeps it. The local
  test accounts of `CLAUDE.md` may be typed into the local page only.
- Comments follow `.claude/rules/comments.md`: plain words, each reference with the document's
  path in the same sentence, no step or brief number.
- Commit only when asked. Never push (decision 1 of this step).

## Acceptance (`docs/SLOT_STEP_PLAN.md` step s6)

- `npm run smoke -w backend -- local` green, the new lines among them.
- `DYNAMODB_PORT=8002 npm run verify` green at the root, with `local:up` and `local:api`
  running; then, apart, the front end's journeys green.
- `docs/FRONTEND_WALK.md` walked whole at both widths, each check yes or no.
- The paid evaluation run once and reported, the two requests of step s3 read by hand, or
  reported as not run.
- The API deployed with a change set of code only, and the smoke test against
  `shared-calendar-api` green, or reported as not run.
- The page released and the quick look each yes or no, or reported as not run.
- `git status` shows no change under `shared/`, `frontend/src` or in either `template.yaml`.
- The documents listed are updated and closed, the tag `v2.4.0` made locally; the "As done"
  note holds the detail. Then the short closing message.
