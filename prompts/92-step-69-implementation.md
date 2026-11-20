## Brief

Implement plan step 69, "Closing" (`docs/FRONTEND_VIEW_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review.

One stop at the end. Six choices were made with me while this brief was written (section
"Settled before the start"). There is no early stop.

This step writes no new screen. It finishes the view layer as a whole and makes the repository
say so: one written walk through every screen, run from a fresh local stack; a look at the page
without a mouse; what the code became, with the verdict on the fallback; the documents; and
the throw-away prototypes deleted. It changes nothing in `backend/`, `shared/` or
`frontend/src/services/`, and nothing in the cloud. In `frontend/src/views/`,
`frontend/src/logic/`, `frontend/index.html` and `frontend/style.css` it changes only what the
walk or the keyboard pass proves wrong, and what settled point 3 says.

Read these in full first:
- `CLAUDE.md`, in particular the "Comments" section, "Tooling and style", the folder map's
  `frontend/` entry, the commands `dev`, `build`, `seed:local` and `verify`, and the test
  conventions.
- `docs/FRONTEND_VIEW_PLAN.md`, all of it: section 4 (what every step checks), the browser
  check of every step from 60 to 68 (the walk is made of them), step 69, sections 6 to 8.
- `docs/FRONTEND_ARCHITECTURE.md` v10, all of it: the status line and the change log, the
  thirteen rules of a view (section 3), section 4, section 5.1, section 6, the fallback and
  its three conditions (section 7), section 8 (everything the tests cannot see and the
  browser must), section 10 (the open points), the decisions that say "no condition of
  section 7 was met" (42, 52, 65, 76, 88, 107, 127) and those that say "to settle at the
  review" (106, 123), and section 12.
- `docs/FRONTEND_VIEW_OPTIONS.md`: what it says of the trial and of the prototypes.
- `docs/SHARED_CALENDAR_SPEC.md` section 16.8: what the views were asked to do. The walk
  shows each of its lines, or the report says which one is not built and where that was
  decided.
- `prototypes/README.md` and `prototypes/view-plain/LOADING_SEQUENCE.md` (387 lines), before
  they are deleted.

Then read the code the step measures and walks through: `frontend/index.html`,
`frontend/style.css`, every file of `frontend/src/views/` and of `frontend/src/logic/`, and
`frontend/scripts/`.

## Where we are (2026-11-20)

- Step 68 is committed and pushed (`f2ade74`): every screen of `docs/FRONTEND_VIEW_PLAN.md`
  section 3 exists. `npm run verify -w frontend` is green (2061 tests, 100 % lines); the root
  `lint` and `typecheck` too. Check `git status -sb` rather than trusting this line.
- The sizes at the end of step 68, to check and not to assume: `week.view.ts` 312 lines,
  `shell.ts` 303, `availability.view.ts` 213, `date.view.ts` 174, `users.view.ts` 172,
  `availability.parts.ts` 158, `detail.view.ts` 134, `appointments.view.ts` 117,
  `settings.view.ts` 110, `login.view.ts` 39; `index.html` 601, `style.css` 253; `app.js`
  575 kB, 128 kB compressed.
- `prototypes/` holds 18 tracked files (`README.md`, `package.json`, `package-lock.json`,
  `tsconfig.json`, `seed.mjs`, `serve.mjs`, `common/`, `view-plain/`, `view-lit/`) and an
  untracked `node_modules/` with `lit-html`. `docs/FRONTEND_VIEW_OPTIONS.md` and
  `docs/FRONTEND_VIEW_PLAN.md` name the folder; look for every other mention yourself, in
  documents, comments, configuration and ignore files.
- The root `npm run verify` runs the back end's `verify` (typecheck, lint, audit,
  `sam validate --lint`, unit and integration tests) and then the front end's. Its calendar
  journeys **empty the local `calendar` table**. It needs the stack running and
  `DYNAMODB_PORT=8002` as in `CLAUDE.md`.
- The Codespace has no browser. The checks of steps 60 to 68 ran in Playwright's headless
  Chromium, installed outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
  The lessons of those checks are in `docs/FRONTEND_ARCHITECTURE.md` section 8 and in the
  brief of step 68 (`prompts/91-step-68-implementation.md`, "Where we are"). Three to keep in
  front: wait until no request is under way, not for a fixed time; a button the page does not
  offer cannot be pressed, so a line that times out may be the script's fault; a line that
  failed is run again alone, not the whole walk.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; it goes into the step's commit.

## Settled before the start

Apply them as written.

1. **The walk is a document of its own**, `docs/FRONTEND_WALK.md`, not a section of the
   architecture: a numbered list of checks, each one line a person can do by hand and say
   "yes" or "no" to. `docs/FRONTEND_ARCHITECTURE.md` points to it from section 8, and
   `CLAUDE.md` names it in "Where the truth lives" as the check to repeat after a later
   change. It is not a source of truth: on a conflict the architecture and the tests win,
   and the walk is fixed.
2. **The walk stays a written list** (`docs/FRONTEND_VIEW_PLAN.md` section 8, decision 6). The
   script that runs it in the headless browser stays outside the repository. No end-to-end
   test tool is added.
3. **Two wordings left "to settle at the review" are settled now.**
   - The sentence of an overlap among the windows of "this day only" is said **once, under
     "Start"**; "End" is marked in fault with no sentence of its own
     (`docs/FRONTEND_ARCHITECTURE.md` section 11, decision 123). This needs a field that can
     be in fault without words: propose the smallest change, in the logic layer's refusals
     and in `say`, and say what it is before the report's other points.
   - A pattern's and a window's hours stay "09:00 – 13:00" and an appointment's time stays
     "09:00–10:00" (decision 106): two forms, on purpose. The decision loses its last
     sentence.
4. **The verdict on the fallback is yours to propose and mine to take.** Write it in
   `docs/FRONTEND_ARCHITECTURE.md` section 7 as a proposal, with its numbers, and say in the
   report which way you lean and why. Whatever it is, **no `lit-html` is added in this
   step** and no view is rewritten: if the verdict is that a view should move, that is a
   step of its own.
5. **`prototypes/view-plain/LOADING_SEQUENCE.md` is not kept as a page.** What of it is
   still true of the real code and is said nowhere in `docs/FRONTEND_ARCHITECTURE.md` goes
   into that document, in the section it belongs to, in a few paragraphs at most, rewritten
   for `frontend/` (its file names, its screens). Its sequence diagrams are kept only if one
   of them, redrawn for the real shell, says something section 6 does not. The report lists
   what was carried over, and what was left behind and why.
6. **`docs/FRONTEND_VIEW_OPTIONS.md` stays, as the record of why this option**, with every
   mention of a file of `prototypes/` turned into words that are true after the deletion:
   that the trial's code was removed at this step and is in git history, with the commit
   that last held it. The same for any other document. The plan's own text of step 69 keeps
   naming the folder it deletes.

## Design points

Apply them as written; if the code or a document proves one wrong, stop and say so with a
proposal.

1. **Order of work, because of the table.** The root `verify` empties the local calendar and
   the walk needs one. So:
   - first everything that needs no stack: settled point 3, the measurements, the keyboard
     and screen-reader reading of the markup, the documents' first draft, the deletion of
     `prototypes/`, with `npm run verify -w frontend` green after each change of code;
   - then ask me for a fresh local stack (`local:down`, `local:up`, the iptables rule,
     `local:api`): I start it;
   - then the root `DYNAMODB_PORT=8002 npm run verify`, once, on that fresh stack;
   - then `npm run seed:local -w frontend`, which the fresh and emptied table needs: this
     brief is the permission to run it, once, after the root `verify`;
   - then the walk, on the seeded stack; then the documents' last numbers.
2. **The walk.**
   - One list, in the order a person would follow: the login; then everything a User does;
     then everything the Administrator does; then what concerns both (one person after
     another in the same page, the tab shown again, a call that cannot reach the server, an
     address typed by hand, a reload of the page).
   - Made from the browser checks of steps 60 to 68: every line of every one of them is in
     the walk or the report says why it is not (said twice, replaced by a later step's line,
     only meaningful while that step was being built).
   - Each check says what to do and what must be seen, in words a person who did not write
     the code can follow, with the seed's own names ("Studio", "Piscina", `alice`). Where a
     check needs something the seed does not hold (a type, a date with no appointment, a
     second user), the walk says how to make it and how to remove it.
   - It says what it needs before it starts (the stack, the seed, the two accounts), what it
     leaves behind (cancelled appointments and their events: they cannot be deleted through
     the API), and that it changes none of the seed's types, patterns or appointments and
     writes the settings back as it found them.
   - A short last part lists what only a real browser and a person can check, which the
     headless run cannot: a real tab switch, a real phone, a screen reader's voice, the
     native date picker.
   - **Run twice**: at a desktop width and at a phone width (390 px), the whole list each
     time, as `alice` and as `admin`. The phone run may skip a check only where the width
     cannot change the answer (a request's body, for example), and the walk marks those.
   - Everything a run made is removed in a `finally`, through the API, whatever happened;
     every name a run writes carries the tag of the run.
3. **Reading the page without a mouse.** Four things, each checked over the whole page and
   reported as a table (screen or dialog, what was found, what was changed):
   - **every field has its label**: every `input`, `select` and `textarea` of `index.html`
     has an accessible name (a `<label>` around it or for it, or `aria-label`), and every
     button whose text does not say what it acts on gets one from the script. A test of
     `page.test.ts` holds the first half from now on;
   - **every dialog takes and gives back the focus**: for each of the page's dialogs, where
     the keyboard is when it opens, that Tab stays inside it, and where the keyboard is
     after each way it closes. `docs/FRONTEND_ARCHITECTURE.md` section 8 already says some
     of it per step: bring it into one table there. Where the keyboard ends on nothing
     (after a row is redrawn or gone), say so, and say whether one more Tab reaches the
     next sensible thing. **Do not add focus management of our own** to mend it: if you
     think a case needs it, say which and why, and stop short of writing it;
   - **every failure is announced**: every element that shows a failure or a refusal has
     `role="alert"`, and every "Loading…" `role="status"`. A test of `page.test.ts` holds
     it from now on;
   - **everything is reachable by keyboard**: in the walk's desktop run, every action of
     every screen is done once by keyboard only (Tab, Shift+Tab, Enter, the space bar,
     Escape, the arrow keys and typing in a list), and the walk marks those checks.
   A defect found here is fixed in this step if the fix is markup, a style or a few lines of
   a view, with its test; anything larger is reported and left.
4. **What the code became.** One table in `docs/FRONTEND_ARCHITECTURE.md` (propose where: a
   closing part of section 7, or a short section of its own) and in the report:
   - per view file: its lines, how many of them look a node up or copy a template, how many
     streams it listens to, how many dialogs it wires;
   - `availability.parts.ts`, `shell.ts`, `index.html` (lines, screens, dialogs, templates)
     and `style.css`;
   - per file of `logic/`: its lines, and for the whole layer the lines of code against the
     lines of the views, since the plan's bet was that the rules would live there;
   - the tests: how many per layer (services, logic, views, shell);
   - the bundle: `app.js` plain and compressed at every step from 60 to 69, from the
     figures section 12.1 already holds, and what share of it is `zod`, measured again now.
   Say how each number was counted, so that it can be counted again the same way.
5. **The verdict on the fallback** (settled point 4), in section 7:
   - for each of the three conditions, the view that came closest and how close, with the
     decisions that recorded it step by step;
   - `availability.parts.ts` named for what it is: helpers of our own that two views
     import, against rule 12's "two small helpers" (decision 127). Say plainly whether
     rule 12 should be reworded to allow what was built, or what was built should change
     to fit the rule, and what each would cost;
   - whether `lit-html` was needed anywhere (it was not added: say whether that was right),
     and which view would be the first to need it and at what change;
   - "when to think again altogether" (the last paragraph of section 7) read once more
     against what the interface became.
6. **The documents.**
   - `docs/FRONTEND_ARCHITECTURE.md` v11: the status line says **implemented**; a reader who
     starts today must not need the change log to know what is true, so the text that says
     "so far", "the steps that follow", "step 68 reuses" and the like is brought to the
     present tense; section 4's descriptions agree with the code as it is (settled point 3
     included); section 8 gains the pointer to the walk and the table of the dialogs and
     the focus; section 10 is read again line by line: each open point says what is true of
     it today, and its closing sentence says that these are now the only things between
     the front end and a deployment; the decisions table gains this step's; the change log
     gains v11. **Do not renumber sections or decisions**: comments in the code point at
     them (`npm run lint` checks the references).
   - `docs/FRONTEND_VIEW_PLAN.md`: the status line says the plan is **done**, with the date;
     step 69's text says what was done where it differs from what was planned; a change log
     line. The plan stays in the repository as the record of the order of work.
   - `docs/FRONTEND_WALK.md`: new (settled point 1).
   - `docs/FRONTEND_VIEW_OPTIONS.md`: settled point 6, and its status line if it still
     speaks of the trial as present.
   - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 without `prototypes/`, section 7
     brought to "the view layer is complete", and whatever else names the folder.
   - `README.md`: "The page, locally" read once as a newcomer would, shortened where the
     steps piled sentences on it, with a pointer to the walk.
   - `CLAUDE.md`: the opening paragraph, "Where the truth lives" (the architecture at v11
     and implemented, the plan done, the walk), the folder map (no `prototypes/`; whatever
     this step changed), the test conventions (whatever was learnt). The `frontend/` entry
     of the folder map has grown with every step: do not rewrite it in this step; if you
     think it should be cut down, say so in the report with a proposal.
   - `docs/journeys/`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`,
     `docs/FRONTEND_SERVICES.md`: not changed, unless one names a file this step deletes.
7. **The deletion of `prototypes/`.**
   - `git rm -r prototypes`, and the untracked `prototypes/node_modules/` removed from the
     disk. Look at what is there before removing it, and remove nothing else.
   - Before it: settled point 5. After it: no comment, document, script, configuration or
     ignore file names a path that no longer exists. Search the whole repository for the
     folder's name and for each deleted file's name; `prompts/` is left as it is (the
     briefs are the record of what was asked at the time), and the report says so.
   - The root `package.json`, `package-lock.json`, `eslint.config.js`, `tsconfig.base.json`
     and `.gitignore` are checked for a mention; the lock file must not change unless the
     folder was in it, and if it was, say so before touching it.
   - The report names the commit that last held the folder.
8. **Tests.** New tests only where design point 3 or settled point 3 asks for one. The
   existing tests keep passing unchanged, except those of the overlap sentence (settled
   point 3): say which cases changed and what changed in each. Everything stays inside the
   100 % line coverage; `src/main.ts` stays the one file left out.

## The step

What `docs/FRONTEND_VIEW_PLAN.md` step 69 lists.

- **Settled point 3**: the overlap sentence once, with its tests in the logic and in the
  view; decision 106 closed.
- **The walk**: `docs/FRONTEND_WALK.md` written, then run twice from a fresh, seeded local
  stack (design points 1 and 2).
- **Reading the page without a mouse** (design point 3), with the two tests of
  `page.test.ts` and whatever small fixes it brings.
- **What the code became** and **the verdict on the fallback** (design points 4 and 5).
- **The documents** (design point 6).
- **The throw-away material goes** (design point 7).

Not in this step:
- any new screen, field, button or sentence that the walk or the keyboard pass does not
  prove necessary; any change to how a screen works;
- `lit-html`, a rewrite of a view, or a reshaping of `availability.parts.ts`, whatever the
  verdict says (settled point 4);
- focus management of our own (design point 3);
- the open points of `docs/FRONTEND_ARCHITECTURE.md` section 10: hosting, CORS, the session
  across a reload, the Content-Security-Policy of the hosting, logout as a service, the size
  of the bundle. They are described as they stand, not worked on;
- an automated end-to-end test, or anything of the headless run in the repository;
- anything in `backend/`, `shared/` or `frontend/src/services/`; the front end's integration
  journeys; `docs/journeys/`;
- plan step 58 and plan step 59 of `docs/IMPLEMENTATION_PLAN.md`;
- any new dependency;
- the cloud: no deploy, no AWS command.

## How we work in this step

- **The local stack:** I start and stop it. Ask me once, when design point 1 reaches it,
  for a fresh one; do not start or stop it yourself. The dev server you may start and stop
  (stop it as `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local `calendar` table:** the root `verify` empties it, once, before the seed and
  the walk; nothing else may empty it. Never run the back end's or the front end's
  integration journeys by themselves in this step, and never anything of them while the
  walk is under way. The walk never changes or deletes what the seed made. If a run is cut
  short, the first thing to do is to remove the run's own, by its tag and its dates.
- **The deletion:** `prototypes/` only, after you have listed what it holds. Nothing else is
  deleted in this step without asking me.
- **Hard rules:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5), for every line this step changes;
  - no section and no decision of a document is renumbered;
  - no token, password or conflict's name is printed by the walk's script or kept in a
    screenshot; a generated password is read into a variable and never printed;
  - comments follow CLAUDE.md "Comments"; lint must pass, at the root too;
  - no AWS command and no deploy.
- **When a document disagrees with the code, or two documents with each other**, the code and
  the tests say what is true of the view layer today: fix the document and list the fix in
  the report. When the disagreement is about what the code *should* do, stop and tell me.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 69)

- The settled points applied as settled and the design points as written (any deviation
  reported with its reason).
- The root `DYNAMODB_PORT=8002 npm run verify` green, on a fresh local stack: the back end's
  checks and the front end's. Report the numbers of tests and the coverage of each package.
- The whole walk passes, line by line, at a desktop width and at a phone width, with
  everything it made removed; the report says what stays in the local table as history, and
  hands me, as a list, what only a person can check.
- The four tables: the labels, the dialogs and the focus, the announcements, the keyboard;
  with what was fixed and what was left.
- What the code became, as a table, and the verdict on the fallback, as a proposal with the
  way you lean.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 68's (575 kB, 128 kB).
- `prototypes/` is gone; no comment or document in the repository refers to a deleted file
  (`prompts/` aside); what was carried over from `LOADING_SEQUENCE.md` is listed.
- The documents updated; `docs/FRONTEND_ARCHITECTURE.md` says "implemented" and the plan
  says "done".
- Which existing test cases changed, and what changed in each.
- `npm run audit -w backend` reported.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start anything after step 69: the
view layer's plan ends here.
