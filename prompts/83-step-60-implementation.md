## Brief

Implement plan step 60, "Foundation: tooling, shell and login" (`docs/FRONTEND_VIEW_PLAN.md`),
the first step of the view layer, following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. One stop at the end. The design points are
already decided (see "Design points"): there is no early stop for them.

This step gives `frontend/` its build and dev-server commands, the test environment for the
views, two lint rules, and the first two pieces of the view layer: the shell and the login view.
At its end a person signs in and out in a browser, against the local stack. It changes nothing in
`backend/`, `shared/` or `frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry and the front-end test conventions;
  - the rule on passwords and tokens, and "Logs never contain tokens, passwords…".
- `docs/FRONTEND_ARCHITECTURE.md` v1, all of it. It is the source of truth for this step: the
  layers (section 2), the thirteen rules of a view (section 3), the shape of a view with the login
  as its example (section 4), the shell (section 6), the tests (section 8), the folders
  (section 9), the open points (section 10).
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1, 2 and 4 (how the steps are run, what is settled, what
  every step does), step 60, and step 61 to see what this step must leave ready.
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules; rules 3, 5, 6 and 9 above all), section 3 (the
  pattern), section 4.6, sections 9.5 and 9.6 (who reads the session, memory only), section 10.3
  (the CORS gap), section 11.6 (the refresh, from the view layer).
- `docs/FOLDER_STRUCTURE.md` sections 2, 4.1 and 7.

Then read the code this step builds on:
- `frontend/src/services/`: `session.store.ts`, `login.service.ts` and `login.types.ts`,
  `refresh.service.ts`.
- `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/tsconfig.json`, the root
  `eslint.config.js` and `package.json`.
- `frontend/tests/unit/services/` (`fixtures.ts`, one service test) for the conventions, and
  `frontend/tests/integration/local.ts` for how a test file reads a file with `node:fs` without
  Node types in the package.
- `prototypes/` (throw-away, the trial this step turns into the real thing): `serve.mjs`,
  `common/app.ts`, `view-plain/index.html`, `view-plain/login.view.ts`, `common/style.css`, and
  `view-plain/LOADING_SEQUENCE.md`. Take what is right; do not import from it, and do not copy
  what `docs/FRONTEND_ARCHITECTURE.md` says differently.

## Where we are (2026-11-16)

- The services layer is complete (plan step 54). `docs/FRONTEND_ARCHITECTURE.md` v1 and
  `docs/FRONTEND_VIEW_PLAN.md` v1 are committed (`413c41a`, `c7f13bd`). Check `git status -sb`
  rather than trusting this line: `main` was ahead of `origin` at the time of writing.
- `frontend/` holds only the services, their unit tests and their integration journeys. No
  `index.html`, no script, no view.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is still to do and is independent of
  this step. Do not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Design points

Decided with the plan (`docs/FRONTEND_VIEW_PLAN.md` section 2): esbuild; `happy-dom` with the
views inside the 100 % line coverage; English only. The points below complete them. Apply them as
written; if the code proves one wrong, stop and say so with a proposal.

1. **The configuration reaches the bundle as three constants**, `API_URL`, `COGNITO_URL` and
   `CLIENT_ID`, put in by esbuild's `define`, declared and read in `frontend/src/main.ts` only,
   which hands them to the shell as one plain object (`docs/FRONTEND_SERVICES.md` section 2,
   rule 3). No other file of `frontend/src` knows where the configuration comes from.
   - `dev`: `CLIENT_ID` from `backend/env.local.json` (`AuthorizerFunction.CLIENT_ID`); the two
     URLs are the dev server's own origin with `/api` and `/cognito/`.
   - `build`: the three values from environment variables of the same names. A missing one stops
     the build and is named. Nothing is written in a committed file.
2. **The built files**: `frontend/dist/index.html`, `frontend/dist/style.css`,
   `frontend/dist/app.js` (one module script, minified, with a separate source map).
   `index.html` refers to `app.js` and `style.css` by these names in the source too, so that the
   dev server and the build serve the same page.
3. **The dev server** (`frontend/scripts/dev.mjs`, Node, no dependency beyond esbuild): port 5173
   by default; serves `/`, `/style.css` and `/app.js` and nothing else from the disk; bundles
   again at every request for `/app.js`; passes `/api/…` on to `http://127.0.0.1:3000` and
   `/cognito/…` to `http://localhost:9229`; sends `Content-Security-Policy: default-src 'self'`
   with the page and `cache-control: no-store` with everything. It says clearly, when it starts,
   if `backend/env.local.json` is missing (`npm run local:up -w backend` first). It never logs a
   request body or a header.
4. **The views' tests get their environment from a vitest project of their own**, `views`
   (`tests/unit/views/**/*.test.ts`, environment `happy-dom`); the `unit` project stays in `node`
   and no longer selects that folder; `test:unit` runs both, with one coverage report. If vitest
   offers a simpler supported way to give one folder another environment, use it and say so.
5. **`src/main.ts` is the one file left out of the coverage, by name.** It is one statement and
   needs the three constants of point 1. Everything else in `frontend/src` stays at 100 % lines.
6. **A test helper loads the real page**: `frontend/tests/unit/views/page.ts` reads
   `frontend/index.html` and puts its `<body>` into the emulated document before each test. No
   view test writes markup of its own.
7. **The lint rules**, in the root `eslint.config.js`:
   - no `innerHTML`, `outerHTML` or `insertAdjacentHTML` in `frontend/src`
     (`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 5);
   - no global `document` or `window` in `frontend/src/logic` and `frontend/src/services`
     (`docs/FRONTEND_ARCHITECTURE.md` section 2). The services already have parameters named
     `window`: the rule is on the global, and they must pass unchanged. A later block for a rule
     replaces an earlier one for the same files, so the existing ban on Node globals must still
     hold there: prove both with a throw-away line, removed after.
   - `frontend/scripts/*.mjs` run in Node: they are outside the browser's rules, and the comment
     rule applies to them.
8. **`happy-dom` is a development dependency of `frontend`** (`docs/FOLDER_STRUCTURE.md`
   section 4.1: a tool one package uses belongs to that package), installed from the root
   (`npm install -D happy-dom -w frontend`), never inside `frontend/`. It is the only new
   dependency. Report its version and what `npm run audit -w backend` says after it.
9. **The shell** (`frontend/src/views/shell.ts`), as `docs/FRONTEND_ARCHITECTURE.md` section 6,
   points 1 to 5: no navigation yet (that is step 61). Signed out: the login. Signed in: the
   frame, with the username, "Administrator" or "User", and "Sign out", which clears the
   `SessionStore`. The frame's header is filled and emptied by the shell. Step 61 must be able to
   add the navigation and the first screen without rewriting it: say in the report how.
10. **The login view** (`frontend/src/views/login.view.ts`) as in
    `docs/FRONTEND_ARCHITECTURE.md` section 4. The failure's text is the service's `message` for
    now: the texts in plain words come with the logic layer in step 61. Say in the report which
    messages a person can actually see at the login and whether any of them needs better words.
11. **`frontend/src/logic/` is not created in this step**: nothing here needs it.

## The step

Only what `docs/FRONTEND_VIEW_PLAN.md` step 60 lists.

- **Tooling:** `frontend/scripts/build.mjs` and `dev.mjs`; the scripts `build` and `dev` in
  `frontend/package.json`; `happy-dom`; `frontend/vitest.config.ts`; `DOM.Iterable` in
  `frontend/tsconfig.json`; the two lint rules.
- **`happy-dom` and the native `<dialog>`, tried first** (`docs/FRONTEND_VIEW_PLAN.md` section 7):
  before any view, a throw-away test that calls `showModal()` and `close()`, sends the Escape key
  and reads `open`. Report what works there and what will have to be checked in the browser only.
  The test is not kept.
- **The page:** `frontend/index.html` (the login element; the frame: header, an empty navigation,
  an empty main area; everything `hidden`) and `frontend/style.css`, usable on a phone and on a
  desktop. No inline script, style or handler.
- **The code:** `src/main.ts`, `src/views/shell.ts`, `src/views/login.view.ts`.
- **The tests**, in `frontend/tests/unit/views/`, with fake services (plain objects, subjects the
  test controls, spies):
  - login: every state of `loginState$` (idle, pending, failure, success); submit calls `login`
    with what was typed and does not reload the page; a failure message containing `<script>` is
    shown as text; after unsubscribing the form is empty and the error gone;
  - shell: `null` shows the login and hides the frame; a session shows the frame with the name
    and the role in words, for both roles; a refreshed session (same username and role) mounts
    nothing again; "Sign out" clears the store; after signing out, nothing of the session is left
    in the document; a second person signing in sees nothing of the first.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v2: the open points O4, O6 and O8 decided, with the details
    this step fixed (the design points above); section 9 and the decisions table brought in line;
    the status line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 60 done, with its date).
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2, section 7, and section 9 (`frontend/dist/`,
    made by esbuild).
  - `CLAUDE.md`: the commands `dev` and `build`, the `test:unit -w frontend` line, the folder map's
    `frontend/` entry, the test conventions for the views.
  - `README.md`: how to see the page locally, in a few lines.

Not in this step:
- the week calendar, the navigation, `frontend/src/logic/`, any other screen (step 61 onwards);
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change there,
  stop and say why first;
- any dependency other than `happy-dom`; `lit-html`; Vite; an end-to-end test tool in the
  repository;
- hosting, CORS on the API, a `template.yaml` in `frontend/`, logout as a service, the session in
  `sessionStorage`: they stay open points;
- deleting `prototypes/` (step 69);
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width:

1. the page loads with only the login on screen;
2. a wrong password shows the failure and leaves the form usable;
3. while the call is pending the button is disabled;
4. `alice` signs in: the header says `alice` and "User";
5. "Sign out" returns to the login with an empty form;
6. `admin` signs in: the header says `admin` and "Administrator"; nothing of `alice` is on the
   page;
7. a reload of the page returns to the login (open point O3, expected);
8. the console shows no error and no violation of the Content-Security-Policy other than the
   known one of `zod` (`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O5); the network
   panel shows no request to another origin.

Run it in a headless browser if you have one without adding anything to the repository (say which
and where it was installed), and report line by line. Whatever you could not check yourself, hand
to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server of this step you may start and stop.
- **Hard rules:**
  - the thirteen rules of `docs/FRONTEND_ARCHITECTURE.md` section 3;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the document or a log; the password exists only in the form and in
    the call's argument (`docs/FRONTEND_SERVICES.md` section 2, rules 6 and 9);
  - the existing tests keep passing unchanged; if one must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - the scripts run on macOS and Linux with node only;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan or `docs/FRONTEND_SERVICES.md` disagree, or one
  is unclear or proves wrong**, stop and tell me, with a proposed change. Do not edit the rules
  silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 60)

- The design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint with the new rules, the services' tests
  unchanged, the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The two lint rules shown to bite, each with a throw-away line.
- `npm run build -w frontend` writes `frontend/dist/` (git-ignored); the report gives the size of
  `app.js`, plain and compressed. Without the three variables it stops and names the missing one.
- The browser check, line by line.
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 61.
