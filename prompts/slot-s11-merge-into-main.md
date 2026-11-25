## Before opening the new session (operator)

This session merges the branch `slot-5min` into `main`: the two plans released from it,
`docs/SLOT_STEP_PLAN.md` (`v2.4.0`) and `docs/WINDOW_HOURS_PLAN.md` (`v2.5.0`), join the mail
work (`docs/EMAIL_PLAN.md`, steps m1 to m8 done). Everything is local: no deploy, no `aws`
command, nothing pushed unless asked.

**Do it before step m9 of the mail.** Step m9 deploys from `main`. Without this merge, that
deploy would take the cloud back to quarter hours: the API would refuse the 5-minute times and
the windows of whole hours already stored, and the page would lose their lists.

1. **No mail session working in the folder `shared-calendar`** while this one runs, and nothing
   uncommitted there except, if you like, `prompts/mail-m09-stage-domain-deploy.md` (untracked;
   the merge does not touch it).
2. **The local stack is one per machine.** Stop the one of `shared-calendar-slot-5min`
   (`npm run local:down -w backend` there). The session will ask you to start it from
   `shared-calendar` after the merge, as `main`'s `docs/COMMANDS.md` says (the mail adds its
   own table and a fake mail).
3. `nvm use`, then open the session **in the folder `shared-calendar`**, on `main`. This brief is
   committed on `slot-5min` and reaches `main` with the merge; before it, read it with
   `git show slot-5min:prompts/slot-s11-merge-into-main.md`.

## Brief

Merge `slot-5min` into `main` (`git merge --no-ff slot-5min`), resolve every conflict so that
both features stand whole, check the merged code, and stop for review before committing. Follow
CLAUDE.md's working rhythm: an honest report at each pause, short messages.

Read these first, from **both** sides where they differ:
- `CLAUDE.md` (main's), in particular "Hard rules from the design", "Cloud safety", "Comments",
  "Changing these files" (the merge touches `frontend/CLAUDE.md` and `.claude/rules/`).
- `docs/SLOT_STEP_PLAN.md` section 6 and `docs/WINDOW_HOURS_PLAN.md` section 6 (on `slot-5min`):
  what the merge meets and how each shared file resolves.
- `docs/EMAIL_PLAN.md` (on `main`): its version line, section 4 (the rows of the documents each
  step closes, steps m9 and m10, which name version numbers and record sections that this merge
  moves), its "As done" notes.
- `git show v2.5.0:docs/RUNBOOK.md` sections 5.9 and 5.10: the two releases' records.

## Where we are (2026-11-25)

- `slot-5min` at `f41fafb`, pushed, tags `v2.4.0` and `v2.5.0` pushed: the cloud runs `v2.5.0`.
  Its base on `main` is `b3c3425`.
- `main` at `b3181b3` (mail step m8 part C), 10 commits after the base, local and pushed.
- A trial merge (`git merge-tree`, nothing written) gives **17 files in conflict**:
  - code and tests: `frontend/src/views/week.view.ts`, `shared/src/calendar/schemas.ts`,
    `backend/scripts/smoke.sh`, `backend/tests/eval/requests.ts`,
    `frontend/tests/unit/views/page.test.ts`;
  - rules: `.claude/rules/frontend-views.md`, `frontend/CLAUDE.md`;
  - documents: `docs/ARCHITECTURE.md`, `docs/SHARED_CALENDAR_SPEC.md`,
    `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/FRONTEND_ARCHITECTURE.md`,
    `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_WALK.md`, `docs/RUNBOOK.md`, `docs/COMMANDS.md`,
    `docs/FOLDER_STRUCTURE.md`.
  Some files merge without a conflict and may still be wrong together (`frontend/index.html`,
  `frontend/style.css`, `docs/journeys/`, the integration tests): typecheck and the tests decide.

## Decided already (the Product Owner)

1. **What is released keeps its numbers.** `slot-5min`'s versions and records are in the cloud
   and in tags; the mail's, not released, take the next ones. So, for example:
   `docs/ARCHITECTURE.md` v16 and v17 are the two plans', the mail's row becomes v18;
   `docs/SHARED_CALENDAR_SPEC.md` v19 and v20 are theirs, the mail's v19 becomes v21;
   `docs/RUNBOOK.md` sections 5.9 and 5.10 are theirs, the mail's record (planned as 5.9)
   becomes 5.11. Each other document the same way, reading its change log on both sides. Every
   reference to a renumbered version or section follows, in documents, in `docs/EMAIL_PLAN.md`
   (its steps m9 and m10 and section 4) and in briefs not yet run; finished briefs under
   `prompts/` are history and stay as written. `grep -rn` for each old number before calling it
   done.
2. **Both features whole, nothing dropped.** Where both sides changed the same lines, the result
   holds both: for example the week view's teardown clears the time lists of `slot-5min` and the
   mail's texts; `shared/src/calendar/schemas.ts` imports `Username` from `main`'s `../user`
   (the file was renamed there) and keeps `TIME_STEP_MINUTES` and `lastsWholeHours`.
3. **No change of behaviour.** The merge decides nothing new. If two rules truly contradict, stop
   and ask.

## The merge

1. `git merge --no-ff slot-5min` on `main` in `shared-calendar`. Resolve file by file. For the
   counts that both sides moved, work from the base (`b3c3425`), not from either side:
   - `page.test.ts`: the fields were 42 at the base, 60 on `main` (+18), 52 on `slot-5min`
     (+10): 70 after the merge, if no field is counted twice; the failures 53, 73 and 53: 73.
     Run the test to confirm, do not trust the arithmetic.
   - `.claude/rules/frontend-views.md`: one wording, no number that the test already holds.
   - The evaluation (`backend/tests/eval/requests.ts`): the lists joined, the mail's requests and
     the four of the two plans (`step-pattern-new`, `step-block`, `hours-not-whole`,
     `hours-not-whole-it`); the count in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3 and
     `docs/COMMANDS.md` from `-- --list`, not from arithmetic.
   - The smoke test: the calendar journey of `slot-5min` (its window 03:05–04:05, the refused
     03:05–03:50, the 5-minute custom times, the capacity journey on 03:00–04:00) and the mail's
     lines (the invitation, a mail) both kept; the header and `docs/RUNBOOK.md` section 2 give
     the new total, counted from a local run.
   - `docs/FRONTEND_WALK.md`: `slot-5min`'s section 11 (checks 157 to 170, as v9 leaves them) and
     the mail's sections, numbered so that no two checks share a number; section 8's rows of both.
2. Comments keep `.claude/rules/comments.md`: no version or step numbers in code.
3. Every `CLAUDE.md` and rule file touched stays within "Changing these files" (root `CLAUDE.md`).

## The check (the full regression: this is new code)

4. `npm ci` at the root if `package-lock.json` changed, then `npm run typecheck`, `npm run lint`,
   `npm run test:unit` (100 % line coverage kept).
5. Ask me to start the local stack from `shared-calendar` (decision of the operator's step 2).
   Then `DYNAMODB_PORT=8002 npm run verify` at the root, then, apart,
   `RUN_INTEGRATION=1 npm run test:integration -w frontend`, then
   `npm run smoke -w backend -- local`. Never two suites at once.
6. **The walk, kept to where the two features meet**: ask me to restart the stack, then
   `seed:local` and `dev`. The week (the book dialog's time lists beside the mail's button, a
   short appointment, check 167), the availability's forms (section 11 at 1280 × 800, 169 at
   390 × 844), and the mail's screens that share `index.html` with them. Each check yes or no; a
   defect is a pause.
7. **The paid evaluation, once, on my word, cost said first** (about 55 US cents for the joined
   list), on the stack started with the real key, then back to the fake. Read by hand the four
   requests of the two plans and the mail's whatever their result. If I say no, it is reported
   as not run and owed before step m9.
8. **The documents**: the version rows of the merge where a document's change log asks for one;
   the "As done" or merge note in `docs/WINDOW_HOURS_PLAN.md` section 6 and in
   `docs/EMAIL_PLAN.md` (what it now builds on); `README.md` section "Versions" unchanged except
   for what the merge must say.

Not in this step: any deploy, `npm run budget`, `npm run assistant-key`, any `aws` command, step
m9, pushing (only when I ask), the branches `whatsapp` and `presentation`.

## How we work

- **Messages to me are short.** One or two simple sentences, then what I must decide or do.
- **The pauses:** a conflict where the two sides contradict; a test that fails after the merge;
  each start or restart of the local stack (I do it); the cost of the evaluation; a defect of
  the walk; the end, before the commit.
- Commit only when asked: one merge commit, its message saying what each conflict became. Then
  stop.

## Acceptance

- `git status` clean after the commit; `main` holds both features; no conflict marker anywhere
  (`git grep -n '^<<<<<<<\|^>>>>>>>'` empty).
- typecheck, lint, unit tests with 100 % line coverage, the root `verify`, the front end's
  journeys and the local smoke test green, with their counts reported.
- The walk's checks where the features meet, each yes or no.
- The evaluation run once and reported, or reported as not run.
- Every renumbered version and record section followed by its references (decision 1).
