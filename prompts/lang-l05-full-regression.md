## Before opening the new session (operator)

This step is phase B's item 7 of `docs/MULTILANGUAGE_PLAN.md`: the full regression, once, on the
merged code that items 8 and 9 will deploy. It is local only. Everything happens in the worktree
`shared-calendar-multilanguage` (branch `multilanguage`), after `nvm use`, with Docker running
and **no `ANTHROPIC_API_KEY` in the shell**: the assistant's checks run against the fake Claude,
and no paid evaluation is owed (the merge did not change the assistant's instructions).

**The local stack is one per machine** and belongs to the folder that started it. The checkout
of `main` (the mail work, part B of `docs/EMAIL_PLAN.md` step m10) must leave it free. Start it
afresh from this worktree, three terminals left running:

```
npm run local:down -w backend                       # whatever stack runs now, from any folder
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded, with the fake Claude
npm run local:api -w backend                        # second terminal
npm run local:lambda -w backend                     # third terminal: the mailer
```

The session will ask you to restart it once more, before the walk: the back end's journeys empty
the `calendar` table, and the walk needs the seed. It never restarts the stack itself.

## Brief

Run phase B's item 7 of `docs/MULTILANGUAGE_PLAN.md`, "The full regression, once, on what will be
deployed", following CLAUDE.md's working rhythm: an honest report at each pause, short messages,
then stop for review. After it, the merged branch is proven locally as a whole: the gate, every
journey of both packages, the smoke test and the walk, each with its result, and the defects
found, if any, reported before anything is fixed.

Read these first:
- `CLAUDE.md`, in particular "Working rhythm", "Cloud safety", "What goes wrong most often";
  then `backend/CLAUDE.md` and `frontend/CLAUDE.md`.
- `docs/MULTILANGUAGE_PLAN.md`: phase B's items 6 to 9, **item 6's "As done" note** (the merge,
  what item 7 finds ready), section 8 (the Product Owner's look) and the "As done" notes of
  steps l4, l5 and l8.
- `docs/FRONTEND_WALK.md` whole: section 1 (what the walk needs and leaves, the run's tag, the
  two dates), **section 18** (checks 220 to 240, the languages, never walked yet), and the checks
  the languages changed (179, 182, 183, 219).
- `docs/COMMANDS.md` sections 3.4 (the fake Claude), 3.5 (the fake mail and `local:lambda`), 4
  (the integration tests) and 5 (the dev server, `?padded`).
- `docs/RUNBOOK.md` section 2 (the smoke test and the count of its lines) and 2.4 (its Users,
  invitation and mail; what the local stack prints instead).
- `backend/scripts/smoke.sh`'s header: what it makes, what it deletes, what it prints locally.

## Where we are (2026-11-28; measure again at the start)

- `multilanguage` at `f6755c7`, the merge of `main` at `ef6ddc4` (part A of
  `docs/EMAIL_PLAN.md` step m10, `v3.0.0`); nothing pushed. `main` is not moved in this step.
- Green after the merge: typecheck, lint, the unit tests (673 shared, 2090 back end, 3293 front
  end, 100 % line coverage on each). **No journey, no smoke test and no walk has run on the
  merged code.**
- The local stack runs at `MailStage` `on` with the fake mail; cognito-local calls no trigger,
  so the invitation in Italian is not seen locally (item 8 sees it in the cloud).
- The walk has 240 checks; section 18 has never been walked, and checks 223 (the browser's own
  languages) and the phone width need the operator's hands (the browser window could not be
  narrowed to 390 by script in phase B's item 3).

## Decided already (the Product Owner, 2026-11-28)

**The walk's extent**, about a third of `docs/FRONTEND_WALK.md`:

1. **Section 18 whole, in Italian, at 1280 × 800 and at 390 × 844.** It opens every screen in
   Italian, the longer language, and holds what only a browser shows: the first sign-in writing
   the language, the page switching before the frame shows, the dialogs.
2. **Checks 179, 182, 183 and 219 at both widths**, the checks the languages changed.
3. **A look at every screen in English at 1280 × 800**, not check by check: each screen and
   each of its dialogs opened once, its words in place, nothing cut or out of line. Every word
   of the page moved from `index.html` into keys, and the words beside a field into a
   `<span>`; the tests prove each key finds its word, not that the screen looks right.
4. **Not walked: the behaviour checks of sections 2 to 17 in English.** The languages changed
   no behaviour, the merge brought no page code, and the unit tests and the journeys of the
   gate prove it. The risk left: a fault of the English layout at 390 on a screen section 18
   does not open; small, since Italian at 390 is the harder case for the same screens.

**How it is walked:**

5. **At 390 × 844, a headless Chromium driven by a script** (Playwright, whose browsers are
   already on this machine), with a viewport that really is that wide; the script also sets the
   browser's own languages for check 223. The script and its screenshots stay in the
   scratchpad, never in the repository; I look at the screenshots. **Fetching the npm package
   `playwright` with `npx`, the version whose Chromium is already cached on this machine, is
   allowed** (from the npm registry, into npx's cache, nothing added to the repository); the
   session says the version it fetched. No other download: a browser that is not cached is a
   pause.
6. **At 1280 × 800, my Chrome** through Claude in Chrome, in a new tab, as in phase B's item 3.

## The step

1. **The gate.** `DYNAMODB_PORT=8002 npm run verify` at the root (the back end's gate with its
   journeys, then the front end's). Then, apart, never at the same time:
   `RUN_INTEGRATION=1 npm run test:integration -w frontend`. Report the counts of each.
2. **The smoke test, locally.** `npm run smoke -w backend -- local`: every line PASS, the local
   `SKIP` lines as `docs/RUNBOOK.md` sections 2.2 and 2.4 say; report the count. The smoke test
   creates and deletes what it uses.
3. **The walk.** Ask me to restart the stack (`local:down`, `local:up`, `local:api`,
   `local:lambda`), then `npm run seed:local -w frontend` and the page (`npm run dev -w frontend`,
   in the background, stopped with `pkill -f 'node scripts/dev[.]mjs'`). Walk what was decided,
   as `alice`, `admin` and the Users the walk makes, with its cleanups and a tag for the run.
   Each check yes or no. A check that proves inexact is corrected in the walk; **a defect of the
   page is a pause, not a fix**. Screenshots in the scratchpad, never in the repository. The
   two widths as decisions 5 and 6 say; never a width imitated by narrowing the page with a
   script.
4. **The documents.** `docs/FRONTEND_WALK.md`: its status and a change-log row for the run (what
   was walked, at which widths, the result), any check corrected. `docs/MULTILANGUAGE_PLAN.md`:
   item 7's "As done" note (the counts of the gate, the journeys and the smoke test; what the walk
   covered and found; what item 8 finds ready) and the version line.

Not in this step: any deploy, any `aws` command, `npm run budget`, `npm run assistant-key`, the
paid evaluation (none is owed); a fix of a defect found (a pause); moving `main`; pushing; the
branches `gdpr`, `multi-calendar`, `whatsapp` and `presentation`.

## How we work in this step

- **Messages to me are short.** One or two simple sentences on what was done, then plainly what I
  must decide or do.
- **The pauses:** each restart of the local stack (I do
  it); a test, journey or smoke line that fails; a defect found by the walk; two documents that
  disagree (the architecture wins over the plan, the plan over this brief); the end, before the
  commit.
- **The local stack**: never stop, start or restart it yourself; ask me. The dev server is yours
  to start and stop.
- The local test accounts of `CLAUDE.md` may be typed into the local page only; a password is
  never written into a file, a log or the output.
- Comments, if any code is touched, follow `.claude/rules/comments.md`.
- Commit only when asked: one commit with the documents of point 4. Never push.

## Acceptance

- `DYNAMODB_PORT=8002 npm run verify` green at the root, then the front end's journeys green,
  apart, with their counts.
- `npm run smoke -w backend -- local` green, with its count.
- The walk walked to the extent decided, each check yes or no, the English look screen by
  screen yes or no.
- Every defect found reported, none fixed in this step.
- `git status` after the commit clean; no change under `shared/`, `backend/src`, `frontend/src`
  or in either `template.yaml` unless a pause decided one.
- The documents of point 4 updated. Then the short closing message.
