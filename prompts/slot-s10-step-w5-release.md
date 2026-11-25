## Before opening the new session (operator)

This step releases windows of whole hours: a read-only check of the windows stored in the cloud
and their deletion by the operator, a smoke-test change run locally, the full regression kept to
the change, one paid evaluation, then, only when asked in that session, the API and the page
deployed and the documents closed. Everything happens in the worktree `shared-calendar-slot-5min`
(branch `slot-5min`), after `nvm use`, with Docker running and **no `ANTHROPIC_API_KEY` in the
shell**.

**The local stack is one per machine** and belongs to the folder that started it. The emulators
of this worktree are up from the look of step w4; `local:api` is not running. Start the stack
afresh from this worktree before part B:

```
npm run local:down -w backend                       # it holds the data of the last look
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded, with the fake Claude
npm run local:api -w backend                        # in a second terminal, left running
```

The session asks you to restart it again in part C (before the walk, since the back end's
journeys empty the `calendar` table) and twice in part D (with the real key for the paid
evaluation, then back without it). It never restarts the stack itself.

For the cloud parts (A and E):

- **The AWS login**: `aws sso login --profile shared-calendar-admin --use-device-code` and
  `export AWS_PROFILE=shared-calendar-admin`. Part A needs it for its read-only queries.
- **The tree must be clean for a deployment** (`scripts/deploy-gate.sh`): the session commits
  parts A to D first, when asked.
- The smoke test asks for the admin password at its prompt; the Anthropic key is already stored
  in the cloud, so the smoke test's exchange costs about a US cent.

## Brief

Implement step w5, "The release" (`docs/WINDOW_HOURS_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report at each pause, then stop for review.

After this step a window lasts a whole number of hours in the cloud, and a User's slots are
counted from the window's start: no window stored in `shared-calendar-api` is not whole hours,
the smoke test proves the rule there (53 lines), the real model has been measured on the words of
step w3, the API and the page are deployed, the operator has taken a quick look at the deployed
page, the release is recorded in `docs/RUNBOOK.md` section 5.10, the documents' versions are
closed, `docs/WINDOW_HOURS_PLAN.md` is finished and the release is tagged `v2.5.0`.

The step has six parts, as the plan's step w5 names them. **Parts B, C and D are local** and are
done in any case, the paid run of part D only on my word. **Parts A and E touch the cloud: each
is done only when I ask for it in this session, in so many words.** Part A's queries are
read-only, but the cloud is touched only when asked. Part F follows E. Without my word, a cloud
part is reported as "not run".

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md` and
  `frontend/CLAUDE.md`.
- `docs/WINDOW_HOURS_PLAN.md`, all of it: the decisions (section 2, with 6a, 6b, Q3, Q5 to Q8),
  the findings (section 3, **F6** a window changed rather than deleted, **F7** the check,
  **F8** the evaluation, **F10** the smoke test, **F11** the walk, **F12** a minor version and the
  way back), the "As done" notes of steps w1 to w4 (**w4's "What step w5 finds ready"**), step
  w5, and section 6 (released alone, merged into `main` afterwards).
- `docs/SHARED_CALENDAR_SPEC.md`: the status line (v20, "not deployed"), decision D33, 6.2,
  R-SLOT-01, R-BOOK-06, AC-49 to AC-52, section 18.4 (the smoke test's calendar journey).
- `docs/ARCHITECTURE.md` section 9.3 (the smoke test) and **the v17 row**, still open.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: the status line (v23), section 4.3 (a new mark of the
  instructions ends the conversations in progress), **section 12.3** (61 requests, no run yet, the
  last run's record), section 14.
- `docs/COMMANDS.md` sections 3.4 (the fake and the real Claude, `assistant:eval`), 5 and 6.
- `docs/RUNBOOK.md` sections 1, 2 (with 2.1 to 2.3 and the count of the smoke test's lines), 3.2,
  and **5.9** (the last record: the shape of a record, and what it says of a roll-back).
- `README.md`: the deployed stacks, the smoke test's row, **section "Versions"**.
- `docs/FRONTEND_WALK.md`: section 1 (what the walk needs and leaves), the checks the plan names
  for step w5 part C, and section 11 as step w4 left it (v8).
- The code: `backend/scripts/smoke.sh` in full (the rules of its header: tokens and passwords
  only in shell variables and pipes, the cleanup on every exit, what stays by design, how it
  picks its date and hour, and how the capacity journey reuses the calendar journey's date),
  `scripts/deploy-gate.sh`, `backend/scripts/deploy.sh`, `frontend/scripts/deploy.sh`,
  `backend/tests/eval/` (the requests and their checks).

## Where we are (2026-11-25)

- The plan `docs/WINDOW_HOURS_PLAN.md` v5 and its steps w1 to w4 are on `slot-5min`, committed
  (`5fa29f9`, `571ad49`, `c20fe22`, `e302668`), not pushed. No code of the mail work is on the
  branch.
- The deployed stacks run `v2.4.0`, tagged locally on `042142e`, not pushed. The smoke test passes
  52 lines in the cloud (`docs/RUNBOOK.md` section 5.9).
- No route, body field, error code, table item or function changed in the plan, and
  `backend/template.yaml` did not change: the deployment of the API should change the functions'
  code and nothing else. Its change set says so, or it is a pause.
- The cloud may hold windows that are not whole hours: the release of `v2.4.0` was looked at
  with windows 09:05–11:00, 09:05–10:05 and 11:10–12:00 (`docs/RUNBOOK.md` section 5.9), and the
  operator may have saved others. Part A finds out.
- The mark of the assistant's instructions changed in step w3: the deployment of the API ends
  every conversation in progress (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.3).
- The evaluation lists 61 requests, 67 messages; **it has not been run on the words of step
  w3**. The last run, of `v2.4.0`, passed 59 of 59 for 46.59 US cents.

## Decided already (the Product Owner)

Decisions 1 to 8, Q1 to Q8, 6a, 6b, Q1a and Q4a of `docs/WINDOW_HOURS_PLAN.md` section 2. Apply
them; if a document or the code proves one wrong, stop and tell me before going on. For this step:

1. **Released alone, `v2.5.0`** (decision 8, F12): from `slot-5min` as it is, before the mail
   work; `main` is not merged in, and the merge into `main` is not part of this step.
2. **The windows stored that are not whole hours are deleted before the API is deployed** (Q3,
   Q5, Q6, Q7): the check lists every pattern whatever its validity, and the overrides and one-off
   windows dated today or later; windows of whole hours that do not start on the hour are not
   listed. **The operator deletes each one by hand in the page of `v2.4.0`**; where a delete is
   refused with `409 availability_conflict`, the window is changed to whole hours that hold the
   appointment (F6) or the appointment moved first. The check is run again and must list none
   before the API is deployed, and once more in part E.
3. **The API first, then the page**: the page of `v2.4.0` against the new API is refused a
   window not whole hours in plain words; the new page against the old API would offer only
   what the old API accepts.
4. **The smoke test (Q8, F10)**: in the calendar journey, its one-off window becomes 03:05–04:05
   and the User's slot 03:05 (the date search looks for that span free); the Administrator's
   03:10–03:35 and the refused 03:07 stay; one line more, a one-off window 03:05–03:50 refused
   `400 invalid_request` with nothing written. **53 lines.** The capacity journey (03:00–04:00)
   does not change.
5. **The paid evaluation runs once, in part D, on this branch**, only on my word, the cost said
   first (about 50 US cents). The four requests of F8 (`step-pattern-new`, `step-block`,
   `hours-not-whole`, `hours-not-whole-it`) are read by hand whatever their result. A failure that
   comes from the words of step w3 is fixed before part E, in `backend/src/assistant` only, and
   the run is made again only on my word.
6. **When to deploy is the operator's choice**, and nobody is told beforehand. The deployment of
   the API ends every assistant conversation in progress; with about ten people that is accepted.
7. **At the deployed page, only a quick look**, by the operator, by hand, from a short list the
   session gives, each answered yes or no: as the Administrator, a throw-away type and User
   created on the page; on a free future day, a window 09:05–11:05 of that type saved, and
   09:05–10:30 that cannot be entered (the end's minute is 05 alone); as the User, that day
   offering 09:05 and 10:05; then the window, the User and the type deleted. **Everything made is
   deleted.** Claude does not drive the browser at the deployed page and never sees the admin
   password.

## Decided for this step (the Product Owner, 2026-11-25)

1. **Nothing is pushed**, neither the branch nor the tag. Do not push, and do not ask to.
2. **The tag** `v2.5.0` is made locally on the commit that closes the documents, the last of the
   plan, as `README.md` section "Versions" says.
3. **The check of part A runs directly** once part A is asked for: the session writes it into
   `docs/RUNBOOK.md` section 5.10, runs it, and shows its commands with what they found. It only
   reads.
4. **The walk does check 166 in full**, so that check 168 is walked as written: `alice` sees one
   slot of Sunday, 11:05, and books it.

## The step

### Part A: the windows in the cloud (only when asked)

1. **Write the check** into `docs/RUNBOOK.md` section 5.10, with the record of the release to
   come (F7, Q7): three read-only `aws dynamodb query` calls on the stack's `calendar` table
   (`PK = PATTERN`; `PK = OVERRIDE` with `SK` from today; `PK = WINDOW` with `SK` from today), the
   table's name read from the stack's outputs or resources, and a few lines of `node` that print
   one line per window whose two minutes differ (`24:00` as `00`), with its kind, its id or date,
   the weekday for a pattern, the times and the type's id; "none" when there is none. It reads
   the table, so it needs no token and sees every pattern whatever its validity. Read the item
   shapes in `backend/src/lib/calendarDb.ts` before writing it; a shape that the plan does not
   expect is a pause. No script is added to the repository.
2. **Run it** against `shared-calendar-api` (decision 3 of this step) and show me its commands
   and its lines.
3. **I delete each window listed** in the page of `v2.4.0` (or change it, decision 2). The
   session gives me, for each, where it is on the page (a pattern's row, a date's "This day
   only", an extra window) and what to press.
4. **Run it again**: it must list none. Until it does, part E does not start.

### Part B: the smoke test, locally (in any case)

5. **`backend/scripts/smoke.sh`**, decision 4 of this step: the calendar journey's window
   03:05–04:05, the date search on that span, the User's slot 03:05, the new line for 03:05–03:50,
   each line starting with `calendar:`. The capacity journey runs only after the calendar journey
   has ended and deleted its window, so their two windows never exist together; but it uses the
   same date for 03:00–04:00, so the date search looks for the whole span 03:00–04:05 free, and
   its message and the header say so. The header comment says the new lines and the count. No
   answer body is printed (status and error code only); the cleanup runs on every exit.
6. **Run `npm run smoke -w backend -- local`**: every line PASS (the local SKIP lines stay).
7. **The documents, in the same change**: `docs/RUNBOOK.md` section 2.1 (the window and the slot,
   the new line, the count where section 2 says 52), `docs/SHARED_CALENDAR_SPEC.md` 18.4,
   `docs/ARCHITECTURE.md` section 9.3 if it lists the journey's lines, `docs/COMMANDS.md`
   (`smoke`), `README.md` (the smoke test's row), and the "As done" note of step w5 (part B).

### Part C: the full regression, once (local)

8. **The gate**: `DYNAMODB_PORT=8002 npm run verify` at the root, then, apart,
   `RUN_INTEGRATION=1 npm run test:integration -w frontend`. Never two suites at once.
9. **The walk, kept to the change** (the plan's step w5 part C). Ask me to restart the stack, then
   run `npm run seed:local -w frontend` and the page (`npm run dev -w frontend`, in the
   background, stopped with `pkill -f 'node scripts/dev[.]mjs'`). At 1280 × 800: the pattern forms
   71, 73, 74, 76; a date 83, 85, 86, 87, 90, 91; the book dialog 9, 42, 43, 45; section 11, 157 to
   168 and 170, **with check 166 done in full**, so that 168 is walked as written (`alice` sees one
   slot, 11:05). At 390 × 844, check 169 only, in a browser whose viewport really is that wide
   (headless Chromium driven by a script kept in the scratchpad, or my Chrome window made narrow
   by me when asked). **28 checks.** Each yes or no; a check that proves inexact is corrected in
   the walk, a defect of the page is a pause. Record what was not walked, and why, as the plan
   says. Keep the screenshots in the scratchpad.

### Part D: the paid evaluation, once (local, on my word)

10. Say its cost first (about 50 US cents for 61 requests). On my word, ask me to restart the
    stack with the real key (`docs/COMMANDS.md` section 3.4), then run
    `DYNAMODB_PORT=8002 npm run assistant:eval -w backend -- --ceiling 4 --out run.json --hand answers.txt`
    with the run's files in the scratchpad. Read the four requests of decision 5 by hand,
    whatever their result: whether the model kept 14:05–17:05, asked before widening the block
    and then set 09:00–10:00 and 11:00–13:00, and, for the two windows not whole hours, explained
    and suggested whole hours inside and around without proposing. Then ask me to restart the
    stack without the key, and check that `backend/env.local.json` has the fake Claude again.
11. **The documents**: `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3 (the run: the date, the
    result, the cost, the four requests read by hand) and its status line;
    `docs/FRONTEND_WALK.md` (its status, a change-log row for the walk of part C, any check
    corrected); the "As done" note of step w5 (parts C and D).

### Part E: the deploy (only when asked, after A, B, C and D)

12. Commit parts A to D first (when I ask), so the tree is clean. Run the check of part A once
    more: it lists none.
13. `DYNAMODB_PORT=8002 npm run verify` (the stamp lasts 30 minutes), then
    `npm run deploy -w backend` in a terminal set up as `docs/RUNBOOK.md` section 1 says
    (`AWS_PROFILE` set in it), kept with `script -q`. **Read the change set before anyone answers
    `y`**: it should hold the functions' code and `HttpApi`'s `Body`, as in 5.9. A Remove or
    Replace of a table or of the user pool, or any new resource, is a pause: answer N and tell me.
    The conversations in progress end.
14. `npm run smoke -w backend -- shared-calendar-api`, the operator typing the admin password at
    the prompt: **53 PASS**, the new line among them.
15. The log search of `docs/RUNBOOK.md` section 2: no password, no token, no note, no text of a
    conversation in the logs.
16. `npm run deploy -w frontend`, behind its gate, within the same 30 minutes or after a new
    `verify`. Keep the release's lines (the files, their sizes, the invalidation) for the record.
17. The quick look at the deployed page, decision 7 of this step: the session gives me the list,
    I do it by hand and answer yes or no to each.

### Part F: the documents closed (after E)

18. - `docs/RUNBOOK.md` section 5.10: the record of this release in the shape of 5.9 (the check
      and what it listed, the commit deployed, the change set, the smoke test's lines, the
      release, the quick look, the cost), and **F12's way back**: a roll-back to `v2.4.0` is
      possible at any time, its slots on the hour come back, and the windows deleted in part A do
      not;
    - `docs/ARCHITECTURE.md` closes v17 (its row no longer "open", the sentence of step w5). Its
      number stays provisional until the merge with `main` (`docs/WINDOW_HOURS_PLAN.md` section 6);
    - `docs/SHARED_CALENDAR_SPEC.md`: the status line (v20 built and deployed);
    - `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md`,
      `docs/FRONTEND_ARCHITECTURE.md`: their status lines, where they say not deployed;
    - `README.md` section "Versions": the row of `v2.5.0`, its commit, "Windows of whole hours
      (`docs/WINDOW_HOURS_PLAN.md`)", `docs/RUNBOOK.md` section 5.10;
    - `docs/WINDOW_HOURS_PLAN.md`: the "As done" note of step w5 and the version line saying the
      plan is finished, with what the merge into `main` will meet (section 6).
19. Commit when I ask, then `git tag -a v2.5.0` on that commit, with a one-line message.

Not in this step: the merge with `main` or anything of the mail work; anything in `shared/`,
`frontend/src` or either `template.yaml` (a finding there is a pause, not a fix); `backend/src`
beyond the assistant's words under decision 5; `npm run assistant-key`, `npm run budget`; any
`aws` command that creates, changes or deletes a resource (the windows of part A are deleted by
me, in the page); the branches `whatsapp` and `presentation`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a decision above that the code proves wrong; the lines of the check of part
  A, and each run again; each restart
  of the local stack (I do it); the cost of the evaluation, before it runs; a request of the
  evaluation that fails; the end of part D (I decide on E); a change set that holds more than the
  functions' code and `HttpApi`'s `Body`; a smoke line that fails in the cloud; the quick look; a
  defect found by the walk or the look; two documents that disagree (the architecture wins over
  the plan, the plan over this brief).
- **Cloud safety** (`CLAUDE.md`): only read-only `aws` commands, and only in parts A and E;
  `npm run deploy -w backend` and `npm run deploy -w frontend` only in part E, when asked; never
  bypass the gate. The smoke test creates and deletes its own Users, type, window and
  appointments through the API, which is what it is for.
- **The local stack**: never stop, start or restart it yourself; ask me. The dev server is yours
  to start and stop.
- Tokens and passwords: in shell variables and pipes only, never an argument, a file, a log or
  the output; the smoke test's header states the rule, and the changed code keeps it. The local
  test accounts of `CLAUDE.md` may be typed into the local page only.
- Comments follow `.claude/rules/comments.md`: plain words, each reference with the document's
  path in the same sentence, no step or brief number.
- Commit only when asked. Never push (decision 1 of this step).

## Acceptance (`docs/WINDOW_HOURS_PLAN.md` step w5)

- The check of part A written in `docs/RUNBOOK.md` section 5.10, run, and listing none before the
  API is deployed, or reported as not run.
- `npm run smoke -w backend -- local` green, 53 lines.
- `DYNAMODB_PORT=8002 npm run verify` green at the root, with `local:up` and `local:api` running;
  then, apart, the front end's journeys green.
- The 28 checks of the walk, each yes or no, and what was not walked recorded with why.
- The paid evaluation run once and reported, the four requests read by hand, or reported as not
  run.
- The API deployed with a change set of code only, the smoke test against `shared-calendar-api`
  53 PASS, the log search clean, the page released and the quick look each yes or no, or
  reported as not run.
- `git status` shows no change under `shared/`, `frontend/src` or in either `template.yaml`.
- The documents listed are updated and closed, the tag `v2.5.0` made locally; the "As done" note
  holds the detail. Then the short closing message.
