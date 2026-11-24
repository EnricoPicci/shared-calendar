## Before opening the new session (operator)

This step adds a journey to the smoke test, runs it against the local stack, and then, only when
asked in that session, deploys the API and the page and runs it against the cloud. In the
checkout, on `main` after `nvm use`, with Docker running and **no `ANTHROPIC_API_KEY` in the
shell**:

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded, with the fake Claude
npm run local:api -w backend                        # in a second terminal, left running
```

`local:up` without the key puts the fake Claude back in `backend/env.local.json` after the paid
evaluation of step u6; check that it did (`docs/COMMANDS.md` section 3.4).

Two things to settle before the cloud parts (B and C below), not needed for part A:

- **The tree must be clean for a deployment** (`scripts/deploy-gate.sh`). The worktree of the
  branch `whatsapp` is a folder beside the checkout, not inside it, so it does not count.
- **The AWS login**: `aws sso login --profile shared-calendar-admin --use-device-code` and
  `export AWS_PROFILE=shared-calendar-admin`. The smoke test asks for the admin password at its
  prompt; the Anthropic key is already stored, so the smoke test's exchange costs about a US
  cent.

## Brief

Implement plan step u7, "The release" (`docs/CAPACITY_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review.

After this step the capacity of a type is in use in the cloud: the smoke test proves it against
`shared-calendar-api` with a throw-away type of capacity 2, the API and the page are deployed,
the operator has taken a quick look at the deployed page, the deployment is recorded, the
documents' versions are closed and `docs/CAPACITY_PLAN.md` is finished.

The step has three parts. **Part A** is local and is done in any case. **Parts B and C touch the
cloud: each is done only when I ask for it in this session, in so many words, after the part
before it is reported.** Without that, each is reported as "not run".

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md`.
- `docs/CAPACITY_PLAN.md`, all of it: the decisions (section 2), the findings (section 3, **F10**:
  the old page against the new API), the "As done" notes of steps u1 to u6 (**u6's "Step u7
  finds ready"**), and step u7.
- `docs/SHARED_CALENDAR_SPEC.md`: the status line (v17 "not built yet") and section 3's sentence
  "designed and not built yet"; decisions D24 to D31; R-BOOK-07, R-BOOK-12, R-BOOK-13; AC-37 to AC-44; section
  18.4 (the smoke test's calendar journey).
- `docs/ARCHITECTURE.md` section 9.3 (the smoke test) and **the v15 row** of the change log,
  still open.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` the status line (v20, "not yet deployed"), section 4.3
  (a new mark of the instructions ends the conversations in progress), section 14.
- `docs/RUNBOOK.md` sections 1, 2 (with **2.1, the smoke test's calendar journey**, and 2.2),
  3.2, and 5.5 to 5.7 (the records of earlier releases: the shape of a record).
- `docs/COMMANDS.md` sections 5 and 6; `README.md` (the deployed stacks, the smoke test's row).
- `docs/FRONTEND_WALK.md` section 10 (checks 134 to 156); it has no section for the deployed
  page.
- The code: `backend/scripts/smoke.sh` in full (the rules of its header: tokens and passwords
  only in shell variables and pipes, the cleanup on every exit, what stays by design, how it
  picks a free hour), `backend/scripts/cognito.mjs`, `scripts/deploy-gate.sh`,
  `backend/scripts/deploy.sh`, `frontend/scripts/deploy.sh`.

## Where we are (2026-11-24)

- Steps u1 (`2f4ab56`) to u6 (`c1cbfe7`) are on `main`, committed, not pushed. The capacity
  of a type is built in the API, the page and the assistant, and proven locally; the paid
  evaluation passed 57 of 57 (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3).
- `backend/template.yaml` did not change in the plan: the deployment of the API should change
  the functions' code and nothing else. Its change set says so, or it is a pause.
- The deployed stacks run the code before step u1. The smoke test passes 33 lines in the
  cloud (`docs/RUNBOOK.md` section 2).
- The mark of the assistant's instructions changed in step u6: the deployment of the API ends
  every conversation in progress (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.3).

## Decided already (the Product Owner)

Apply them; if a document proves one wrong, stop and tell me before going on.

1. **The order of `docs/CAPACITY_PLAN.md` step u7**: the gate on a clean tree;
   `npm run deploy -w backend`; the smoke test against `shared-calendar-api`;
   `npm run deploy -w frontend`; a quick look at the deployed page. The API first is safe
   (F10).
2. **The smoke test creates and deletes everything it uses**: its throw-away Users, a
   throw-away type of capacity 2 and its window. It never changes the settings, a real type or
   a real person's appointment, and never forces a booking on a real slot.
3. **The cloud runs (parts B and C) only when asked in this session.**
4. **The look at the deployed page uses throw-away Users and a throw-away type**, created on the
   page by the Administrator and deleted at the end; never a real person's account or a real
   type.

## Decided for this step (the Product Owner, 2026-11-24)

1. **Nothing is pushed.** Steps u1 to u7 stay committed on this computer only, also during
   and after the deployment. Do not push, and do not ask to.
2. **Three throw-away Users.** The smoke test's throw-away user and two more, made the same
   way, through `POST /users`, named after it with `-b` and `-c` (`smoke-<epoch>-b`,
   `smoke-<epoch>-c`), and removed through `DELETE /users/{username}` like it, on every exit,
   a stop halfway included.
3. **The same day and hour as the calendar journey, after it.** The capacity journey runs
   right after the calendar journey of `docs/RUNBOOK.md` section 2.1, on its date and in its
   hour, 03:00–04:00, once that journey has deleted its window and type. The hour was found
   free of any window and active appointment, and the calendar journey's cancelled appointment
   blocks nothing, so the new window overlaps no real one (`docs/SHARED_CALENDAR_SPEC.md`
   R-AV-01). No second search for a free hour.
4. **A User's `overbook: true` is checked too**: `403 forbidden`, and nothing written
   (`docs/SHARED_CALENDAR_SPEC.md` AC-41).
5. **When to deploy is the operator's choice**, and nobody is told beforehand. The deployment
   of the API ends every assistant conversation in progress; with about ten people that is
   accepted. Part B starts only when I ask for it.
6. **At the deployed page, only a quick look**, by the operator, by hand: no repeat of the walk
   of `docs/FRONTEND_WALK.md` section 10. The session gives me a short list, and I answer yes
   or no to each: as the Administrator, create a throw-away type of capacity 2 and a throw-away
   User on the page, open a window of that type on a free future day, see a slot of it say its
   places, then delete the window, the User and the type. Claude does not drive the browser
   and never sees the admin password.

Still to report at the end of part A (not a decision): the smoke test's new lines, each
starting with `capacity:`, the new count of lines (33 today), and what stays in the `calendar`
table by design, as `docs/RUNBOOK.md` section 2.1 lists for the calendar journey.

## The step

### Part A: local (in any case)

1. **`backend/scripts/smoke.sh`** gains the capacity journey, as the decisions say:
   - a throw-away type `smoke-cap-<epoch>` of capacity 2 and its window;
   - two Users booked into one slot: `201` both; a User's `GET /calendar` shows the slot with
     `capacity` 2 and `placesLeft` 0 or not at all, as `docs/SHARED_CALENDAR_SPEC.md` R-SLOT-03
     says;
   - a third User refused `409 slot_taken`;
   - the Administrator booking the third with `overbook: true`: `201`;
   - the Administrator booking the first again, `overbook` or not: `409 user_busy`;
   - a User sending `overbook: true`: `403 forbidden`, nothing written (`docs/SHARED_CALENDAR_SPEC.md`
     AC-41);
   - every appointment cancelled, the window and the type deleted, the Users removed.
   The header comment says the journey, its lines and the new count. No answer body is printed
   (status and error code only); the cleanup runs on every exit.
2. **Run `npm run smoke -w backend -- local`**: every line PASS (the two local SKIP lines
   stay). Then the gate: `DYNAMODB_PORT=8002 npm run verify` at the root, and, apart,
   `RUN_INTEGRATION=1 npm run test:integration -w frontend`. Never two suites at once.
3. **The documents, in the same change** (the cloud's results are added in parts B and C):
   - `docs/ARCHITECTURE.md` section 9.3 (the new journey) and the v15 row's sentence of step u7;
   - `docs/RUNBOOK.md`: a section beside 2.1 and 2.2 for the capacity journey (its lines, what
     stays by design, when it fails), and the count of lines where section 2 says 33;
   - `docs/COMMANDS.md` (`smoke`), `README.md` (the smoke test's row; the capacity in the
     screens' table if it is not there);
   - `docs/CAPACITY_PLAN.md`: the "As done" note under u7 (part A now, B and C when done) and
     the version line.

### Part B: the API deployed and proven (only when asked)

4. Commit part A first (when I ask), so the tree is clean. Then `DYNAMODB_PORT=8002 npm run
   verify` (the stamp for 30 minutes), and `npm run deploy -w backend` in a terminal set up as
   `docs/RUNBOOK.md` section 1 says, kept with `script -q -c "…" /tmp/deploy.txt`. **The
   change set is read before anyone answers `y`**: it should hold the functions' code only. A
   Remove or Replace of a table or of the user pool, or any new resource, is a pause: answer N
   and tell me.
5. `npm run smoke -w backend -- shared-calendar-api`, the operator typing the admin password
   at the prompt: every line PASS, the capacity journey among them.
6. The log search of `docs/RUNBOOK.md` section 2: no password, no token, no text of a
   conversation in the logs.

### Part C: the page released and looked at (only when asked, after part B)

7. `npm run deploy -w frontend`, behind its gate, within the same 30 minutes or after a new
   `verify`. The release's lines (the files, their sizes, the invalidation) are kept for the
   record.
8. The quick look at the deployed page, as decision 6 of this step says: the session gives
   me the list, I do it by hand and answer yes or no to each; everything made for it is
   deleted at the end, from the page.
9. **Closing the documents:**
   - `docs/RUNBOOK.md` section 5 gains the record of this release (the commit deployed, the
     change set, the smoke test's lines, the release, the quick look, the cost), in the shape of
     sections 5.5 to 5.7;
   - `docs/ARCHITECTURE.md` closes v15 (its row no longer "open");
   - `docs/SHARED_CALENDAR_SPEC.md`: the status line, and section 3's "designed and not
     built yet" and every other such mark of decisions D24 to D31, now built and deployed;
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: the status line (v20 deployed);
   - `docs/FRONTEND_SERVICES.md` and `docs/FRONTEND_ARCHITECTURE.md`: their status lines, if
     they say the capacity is not deployed;
   - `docs/FRONTEND_WALK.md`, if a check proved inexact at the deployed page;
   - `docs/CAPACITY_PLAN.md`: the "As done" note, and the version line saying the plan is
     finished.

Not in this step: anything in `backend/src`, `frontend/src`, `shared/src` or either
`template.yaml` (a finding there is a pause, not a fix); `npm run assistant-key`,
`npm run budget`; the paid evaluation; the branch `whatsapp`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a decision above that the code proves wrong; the end of part A (I decide on B); a change set that
  holds more than the functions' code; a smoke line that fails in the cloud; the end of part B
  (I decide on C); a change that would be needed outside `backend/scripts`, the documents and
  `README.md`; two documents that disagree (the architecture wins over the plan, the plan over
  this brief).
- **Cloud safety** (`CLAUDE.md`): no `aws` command that creates, changes or deletes a
  resource; `npm run deploy -w backend` only in part B and `npm run deploy -w frontend` only in
  part C, each when asked; never bypass the gate. The smoke test creates and deletes its own
  Users and type through the API, which is what it is for.
- Tokens and passwords: in shell variables and pipes only, never an argument, a file, a log or
  the output; the smoke test's header states the rule, and the new code keeps it.
- Comments follow `.claude/rules/comments.md`: plain words, each reference with the document's
  path in the same sentence, no step or brief number.
- Commit only when asked. Never push (decision 1 of this step).

## Acceptance (`docs/CAPACITY_PLAN.md` step u7)

- `DYNAMODB_PORT=8002 npm run verify` green at the root, with `local:up` and `local:api`
  running; then, apart, the front end's journeys green.
- `npm run smoke -w backend -- local` green, the capacity journey's lines among them.
- The API deployed with a change set of code only, and the smoke test against
  `shared-calendar-api` green, or reported as not run.
- The page released and the quick look at the deployed page each yes or no, or reported as
  not run.
- `git status` shows no change under `backend/src`, `frontend/src`, `shared/src` or in either
  `template.yaml`.
- The documents listed are updated and closed; the "As done" note holds the detail. Then the
  short closing message, and suggest the commit.
