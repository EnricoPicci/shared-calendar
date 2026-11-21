# Repository layout — the monorepo

| | |
|---|---|
| Status | v1 — applied on 2026-11-04 (plan step 20) |
| Date | 2026-11-04 |
| Supersedes | `docs/ARCHITECTURE.md` section 12 ("Proposed repository layout") |
| Brief | `prompts/20-org-folders-for-client-and-server.md` (decision), `prompts/21-step-20-implementation.md` (move) |

This repository holds every part of the application: the back end that exists today (the
shared calendar's API, with its Hello World route, `docs/ARCHITECTURE.md`), the browser front end (`docs/FRONTEND_ARCHITECTURE.md`), and the
code both of them share. This document fixes **which folder holds what**, so that a reader
can tell the three apart at a glance, and the rules for putting a new file in the right place.
It is written for a reader who knows TypeScript but is not an expert in monorepo tooling:
every mechanism is explained in plain terms.

---

## 1. The three components

| Component | Folder | What it is | Runs where |
|---|---|---|---|
| **Back end** | `backend/` | The API: Lambda functions, the SAM template that declares them, the local Docker stack, the operator scripts | AWS Lambda (cloud), Docker containers (laptop) |
| **Front end** | `frontend/` | A single-page application in TypeScript, built to static files | The user's browser; the files are served from static hosting |
| **Shared** | `shared/` | What both need to agree on: the API contract (request and response shapes, error codes, roles) and the username rule | Bundled into whichever of the two imports it; never deployed on its own |

Everything else at the root is repository-wide: documentation, the prompts that produced it,
and the tooling configuration that every component uses (Node version, lint rules, editor
settings, git ignores).

Rule of thumb: **a file belongs to the component that would break if it were deleted.** A file
that only the API needs goes in `backend/`; one that only the browser needs goes in
`frontend/`; one that both need goes in `shared/`; one that the repository as a whole needs
stays at the root.

---

## 2. The tree

```
.
├── package.json                 # workspaces root: lists backend, frontend, shared; delegating scripts
├── package-lock.json            # the ONE lock file of the repository
├── tsconfig.base.json           # TypeScript strictness shared by every package (each extends it)
├── eslint.config.js             # lint rules for every package
├── scripts/                     # repository-wide checks: the comment rule of CLAUDE.md ("Comments")
├── .nvmrc  .editorconfig  .gitignore
├── CLAUDE.md                    # guidance for Claude Code (repository-wide, kept short; each
│                                # package has its own: backend/, frontend/, shared/CLAUDE.md)
├── .claude/                     # the project skill explain-journey, and rules/: guidance that
│                                # loads when a file matching the rule's paths is read
├── README.md                    # written by plan step 12
├── docs/                        # repository-wide documentation (section 8)
│   └── journeys/                # the integration journeys explained in simple words (section 8)
├── prompts/                     # the numbered briefs that produced the documents and the code
│
├── backend/                     # ── the API ──────────────────────────────────────────────
│   ├── package.json             # name "backend"; runtime deps; scripts build/verify/deploy/local:*
│   ├── template.yaml            # all back-end infrastructure (SAM)
│   ├── samconfig.toml           # SAM settings per environment (default = cloud, local = laptop)
│   ├── docker-compose.yml       # DynamoDB Local, dynamodb-admin, cognito-local, the fake Claude
│   ├── docker/                  # files the local stack needs (cognito-local-config.json;
│   │                            # fake-claude.mjs: the script of the fake Claude, plain Node)
│   ├── tsconfig.json            # extends ../tsconfig.base.json; lib ES2022, node types
│   ├── vitest.config.ts         # projects unit + integration; 100 % line coverage on src/lib
│   │                            # and src/assistant
│   ├── src/
│   │   ├── handlers/            # one Lambda entry point per file
│   │   ├── assistant/           # the assistant's core (docs/ARCHITECTURE.md section 12): takes an
│   │   │                        # identity and a text, never an HTTP request; reaches the table and
│   │   │                        # Claude through lib/ only
│   │   └── lib/                 # the only place that touches the AWS SDK (calendarDb.ts:
│   │                            # the calendar table's item layout and lock; calendarRules.ts:
│   │                            # the calendar's checks, pure, no AWS; assistantDb.ts: the
│   │                            # assistant table's item layout, its reads and conditional writes;
│   │                            # anthropic.ts: the one door to Claude, the only file that imports
│   │                            # the Anthropic SDK; parameters.ts: one read of Parameter Store)
│   ├── tests/
│   │   ├── unit/                # mirrors src/
│   │   └── integration/         # journeys against the local Docker stack; fake-claude/answers.json:
│   │                            # the scripted answers of the fake Claude, owned by the journeys
│   ├── scripts/                 # operator scripts (local stack, verify, deploy, smoke, budget…)
│   └── (generated, git-ignored) env.local.json  .cognito/  .aws-sam/  .verify-ok  coverage/
│
├── frontend/                    # ── the browser app (section 7) ─────────────────────────
│   ├── package.json             # name "frontend"; deps rxjs, shared; dev dep happy-dom;
│   │                            # dev/build/seed:local/typecheck/lint/test:unit/verify
│   ├── tsconfig.json            # extends ../tsconfig.base.json; lib ES2022 + DOM, no node types
│   ├── vitest.config.ts         # projects unit (node) + views (happy-dom) + integration;
│   │                            # 100 % line coverage on src/ (src/main.ts left out)
│   ├── index.html               # all the markup of every view and of its dialogs
│   │                            # (docs/FRONTEND_ARCHITECTURE.md)
│   ├── style.css                # the one style sheet
│   ├── scripts/                 # Node scripts: bundle.mjs (shared esbuild options), build.mjs, dev.mjs,
│   │                            # seed-local.mjs (a week to look at, in the local calendar)
│   ├── src/
│   │   ├── main.ts              # the entry file of the bundle: the configuration, then the shell
│   │   ├── services/            # the services layer (docs/FRONTEND_SERVICES.md): session store,
│   │   │                        # login, refresh, hello, users, the calendar's; cognito.ts and api.ts
│   │   ├── logic/               # between the services and the views, no DOM: texts.ts (dates, times,
│   │   │                        # failures in plain words), week.model.ts, week.screen.ts,
│   │   │                        # booking.ts, appointment.detail.ts, appointments.model.ts,
│   │   │                        # appointments.screen.ts, settings.model.ts, settings.screen.ts,
│   │   │                        # users.model.ts, users.screen.ts, availability.model.ts,
│   │   │                        # conflicts.ts, availability.screen.ts, date.model.ts,
│   │   │                        # date.screen.ts
│   │   └── views/               # shell.ts (with the table of screens) and one <name>.view.ts per
│   │                            # view: login.view.ts, week.view.ts, appointments.view.ts,
│   │                            # settings.view.ts, users.view.ts, availability.view.ts and
│   │                            # date.view.ts (two views of one screen, with what they share
│   │                            # in availability.parts.ts); detail.view.ts, the appointment's
│   │                            # dialog that two views mount
│   ├── tests/
│   │   ├── unit/                # mirrors src/ (plus services/fixtures.ts, logic/zone.ts and
│   │   │                        # logic/fixtures.ts, views/page.ts)
│   │   └── integration/         # login and the services' journeys against the local stack
│   ├── (reserved, not yet) template.yaml
│   └── (generated, git-ignored) coverage/  dist/
│
└── shared/                      # ── what both import ─────────────────────────────────────
    ├── package.json             # name "@shared-calendar/shared"; exports ./src/index.ts
    ├── tsconfig.json            # extends ../tsconfig.base.json; no node, no DOM
    ├── vitest.config.ts         # unit project; 100 % line coverage
    ├── src/
    │   ├── index.ts             # the public surface: re-exports the files below
    │   ├── api.ts               # response bodies, error body, error codes (architecture section 4)
    │   ├── roles.ts             # Role, resolveRole (architecture section 3, "admin wins")
    │   ├── username.ts          # the username rule and the zod schemas built on it
    │   ├── calendar/            # the shared calendar's contract (docs/SHARED_CALENDAR_SPEC.md 12):
    │   │                        # time.ts (time-zone helpers, Intl only), schemas.ts (primitives,
    │   │                        # bodies, parameters), types.ts (responses, events), rules.ts (pure
    │   │                        # availability and slot rules), defaults.ts (defaults, limits, ranges)
    │   └── assistant/           # the assistant's contract (docs/CONVERSATIONAL_ARCHITECTURE.md 6):
    │                            # types.ts (AssistantReply and its parts), schemas.ts (the body of
    │                            # a message), limits.ts, languages.ts (en, it), texts.ts with
    │                            # texts.en.ts and texts.it.ts (the fixed texts, one object each)
    └── tests/                   # mirrors src/ (tests/calendar/ and tests/assistant/ too)
```

Names are plain words, as in the brief, rather than the `apps/` + `packages/` convention: with
three folders the extra level would add nesting without adding information.

---

## 3. Where does a file go?

| You are adding… | Put it in | Because |
|---|---|---|
| A Lambda handler, a module it uses, its unit test | `backend/src/handlers`, `backend/src/lib`, `backend/tests/unit` | Runs in Lambda only |
| An AWS resource, an IAM statement, an alarm | `backend/template.yaml` | The back end's infrastructure is one file |
| A script that deploys, seeds, verifies or inspects the API | `backend/scripts` | It reads `samconfig.toml`, `env.local.json` or the stack outputs, all of which live in `backend/` |
| A screen, a component, a browser-side store | `frontend/src` | Runs in the browser only |
| The bucket and CDN that serve the front end | `frontend/template.yaml` | A separate stack: deploying the UI must never touch the API's resources |
| A request or response shape, an error code, a role name, a validation rule that both the API and the UI must apply identically | `shared/src` | One definition, two consumers; a change there is a contract change and must be visible as such in review |
| A type that only one side uses (a DynamoDB item, an authorizer context, a React prop type) | That side's `src` | Putting it in `shared/` would suggest a contract that does not exist |
| A document about one component | `docs/` with the component in the file name (`FRONTEND_ARCHITECTURE.md`) | Section 8 |
| A page that explains an integration journey | `docs/journeys/backend` or `docs/journeys/frontend`, format in `docs/journeys/README.md` | Section 8 |
| A tool configuration every package needs (lint rule, TypeScript strictness, Node version) | The root | One setting, one place |
| A check that runs over every package (the comment check of CLAUDE.md, "Comments") | `scripts/` at the root | It reads every package's files; `npm run lint` (root and `-w backend`) runs it |
| A tool configuration one package needs (SAM, vitest projects and coverage thresholds) | That package | Each package owns its build |

Two rules carried over from the architecture, unchanged by the move:

- Handlers never import the AWS SDK; only `backend/src/lib` does.
- The Anthropic SDK is imported only by `backend/src/lib/anthropic.ts` and its unit test
  (`docs/ARCHITECTURE.md` section 12; `npm run lint` refuses it anywhere else).
- `shared/` imports **no** AWS SDK, no Node-only module (`node:crypto`, `node:fs`…), no DOM
  API and no UI framework. Allowed: TypeScript, `zod`. Anything else is a design discussion,
  because it would be bundled into both the Lambda functions and the browser.

---

## 4. How the pieces fit together

### 4.1 npm workspaces, in plain words

The root `package.json` has a `workspaces` field naming the three folders. One `npm install`
at the root installs every package's dependencies into **one** root `node_modules/` and one
`package-lock.json`, and creates a symbolic link `node_modules/@shared-calendar/shared ->
../shared`. That link is why `backend/` and `frontend/` can write
`import { HelloResponse } from '@shared-calendar/shared'` as if it were a published library,
while editing `shared/src` takes effect immediately with no publish and no copy.

Each package keeps its own `package.json` with its own runtime dependencies and scripts.
`npm run <script> -w backend` (or `cd backend && npm run <script>`) runs a package's script
with the package folder as the working directory, which is what the back-end scripts expect.

Tooling that every package uses the same way (`typescript`, `eslint`, `vitest`, `esbuild`) is
a devDependency of the **root**, so there is exactly one version of each in the repository.
Tooling that only one package uses (`aws-sdk-client-mock`, `@types/aws-lambda`, `happy-dom`) is
a devDependency of that package.

### 4.2 The shared package has no build step

`shared/package.json` points its `exports` straight at `./src/index.ts`. Every consumer
already compiles TypeScript itself (esbuild through SAM for the Lambdas, esbuild for the
browser, vitest for the tests), so the shared code is bundled from source and there is no
`dist/` to keep in sync and no "forgot to rebuild shared" class of bug. The price is that
every consumer must be a bundler; a plain `node shared/src/x.ts` would not run, and that is
fine, because `shared/` is never executed on its own.

### 4.3 SAM builds in place, with its workspace support

By default `sam build` copies the function sources to a scratch folder, installs the
dependencies there and runs esbuild. From that folder the root `node_modules/` and the
`shared/` link are out of reach, and npm would even look for `@shared-calendar/shared` on the
public registry. Three settings in `backend/` make the build work in the monorepo:

- `build_in_source = true` in `samconfig.toml`: SAM runs esbuild inside `backend/` itself,
  where the link resolves; esbuild follows it to `shared/src` and bundles the code into each
  function, as it always did with `src/lib`.
- `SAM_CLI_BETA_NODEJS_MONOREPO=1`, set by the `build` script of `backend/package.json` and by
  `scripts/local-api.sh`: SAM's beta support for npm workspaces. It runs one `npm install` at the
  repository root from the lock file (keeping the development tools) and then bundles each
  function without an install of its own. Without it, building in source runs `npm update
  --omit dev` once per function, in parallel: in a workspace that strips the root's development
  tools (esbuild, TypeScript, vitest) and re-resolves versions. Found while applying this
  layout. The beta exists only from SAM CLI 1.171.0: an older SAM ignores the variable without a
  word and takes that per-function path (found 2026-11-14 with 1.170.0: the npm warning
  `backend in filter set, but no workspace folder present`, then a failed build). So both callers
  first run `scripts/check-sam.sh`, which refuses a SAM older than 1.171.0 before any npm step.
- `cached = false` in `samconfig.toml`: the beta does not apply to cached builds. The build
  only bundles, so caching saved little.

`template.yaml` does not change: `CodeUri: ./` and the `EntryPoints` stay relative to
`backend/`, where the template lives. The beta is a SAM feature under AWS's beta terms and may
change with a SAM upgrade. If it breaks, `npm run build -w backend` fails, and `verify` with it,
before anything is deployed. The alternatives considered were pointing `CodeUri` at the
repository root (SAM copies the whole repository per function) and a `makefile` build that runs
esbuild directly; the second is the fallback if the beta goes away.

### 4.4 One lock file, one audit, one Node version

`package-lock.json` at the root covers all three packages; `npm audit` run from any package
folder audits the whole repository. `.nvmrc` at the root pins Node 22 for everything.

### 4.5 The deploy gate still holds

`backend/scripts/verify.sh` and `deploy.sh` keep working unchanged in spirit: `verify` writes
`backend/.verify-ok` with the commit and whether the tree was clean, and `deploy` refuses
without it. `git status` reports the whole repository, so uncommitted front-end work also
blocks a back-end deploy. That is intended: the gate's promise is "what is deployed is a
committed state of the repository", and a monorepo has one commit history.

---

## 5. Everyday commands

From the repository root, once, after cloning or after a dependency change:

```
nvm use
npm install                      # all three packages, one lock file
```

Repository-wide (root scripts that run the same-named script in every package that has it):

| Command | Does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` in every package (`shared`, `backend`, `frontend`) |
| `npm run lint` | `eslint .` from the root, one rule set, every package |
| `npm run test:unit` | unit tests of every package, each with its own coverage threshold |
| `npm run verify` | `backend`'s verify, then `frontend`'s (typecheck, lint, unit tests) |

Back-end operator commands keep their names and arguments; they are run in the back-end
workspace:

```
npm run local:up -w backend
npm run local:api -w backend
DYNAMODB_PORT=8002 npm run verify -w backend
npm run deploy -w backend -- --parameter-overrides AlertEmail=<address>   # first deploy only
npm run bootstrap-admin -w backend -- shared-calendar-api
npm run smoke -w backend -- shared-calendar-api
npm run budget -w backend -- shared-calendar-api
```

`cd backend && npm run <script> …` is the same thing (drop `-w backend` and the `--` before the
arguments). `CLAUDE.md`, `README.md`, `docs/COMMANDS.md` and `docs/RUNBOOK.md` use these forms.

---

## 6. What `shared/` holds on day one

The back end is the only consumer today, so the first content of `shared/` is extracted from
`backend/src/lib`, with its tests. The front end will import the same files unchanged.

| File | Contents | Extracted from |
|---|---|---|
| `shared/src/username.ts` | `USERNAME_PATTERN` (the regex of architecture section 4), the `Username` zod schema, `CreateUserBody` and `UsernameParam` schemas and their inferred types | `backend/src/lib/validation.ts` (the `validate()` helper stays in the back end: it builds an HTTP response) |
| `shared/src/roles.ts` | `type Role = 'admin' \| 'user'`, `resolveRole(groups)` with the admin-wins rule | `backend/src/lib/auth.ts` (`getClaims` and `requireGroup` stay: they read an API Gateway event) |
| `shared/src/api.ts` | `HelloResponse`, `CreateUserResponse`, `ApiErrorBody` and the `ApiErrorCode` union: `unauthorized`, `forbidden`, `invalid_json`, `invalid_request`, `user_exists`, `user_not_found`, `cannot_delete_admin`, `internal_error` | New: these shapes were only implicit in the handlers and in architecture section 4 |
| `shared/src/index.ts` | Re-exports the three files above; the only module consumers import | New |

The back end then uses the contract rather than restating it: `error()` in `http.ts` accepts an
`ApiErrorCode` instead of any string, and the two `201` bodies are typed with `HelloResponse`
and `CreateUserResponse`. A new error code or response field therefore starts life in
`shared/`, where the front end sees it.

Since then, plan step 41 (2026-11-12) added `shared/src/calendar/` for the shared calendar
(`docs/SHARED_CALENDAR_SPEC.md` section 12): `time.ts` (local date and time ↔ instant in the
calendar time zone, with the built-in `Intl` API only, decision T6), `schemas.ts` (the primitive
zod schemas: dates, times, weekday, instant, ULID, note, type name) and `defaults.ts` (default
settings and count limits). It imports only `zod` and its own files, like the rest of `shared/`.
Plan step 42 (2026-11-12) completed the contract: `api.ts` gained the calendar's error codes, the
`conflicts` field of the error body and `UserSummary`; `calendar/schemas.ts` the request bodies and
the path and query parameters; `calendar/types.ts` (new, types only) the response and event types;
`calendar/rules.ts` (new) the pure functions both sides use (defined and effective windows, slots,
overlap, the local-time grids, `cancellableUntil`); `calendar/defaults.ts` the settings ranges.

Step c00 of `docs/CONVERSATIONAL_PLAN.md` (2026-11-21) added `shared/src/assistant/` for the
assistant (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 6): `types.ts` (`AssistantReply`, its
messages, its proposal and the outcome of each action, types only), `schemas.ts` (the body of
`POST /assistant/messages`), `limits.ts` (the limits of a conversation), `languages.ts` (the list
`en`, `it`, its default and its schema) and the fixed texts: `texts.ts` (the type `AssistantTexts`
and `assistantTexts(language)`), `texts.en.ts` and `texts.it.ts` (one object of that type each).
`api.ts` gained the assistant's seven error codes. A text the server or the screen says in the
conversation's language goes into both language files. The words of the front end's own pages do
not: they stay English, in `frontend/`.

What stays out of `shared/`: the DynamoDB item shape (`MessageItem`), the authorizer context,
the logger, the password generator (server-side secret handling), and everything that imports
`aws-lambda` types or the AWS SDK.

---

## 7. The front-end folder

The front end is a browser single-page application in TypeScript built to static files
(decided 2026-11-04). Its own architecture document, `docs/FRONTEND_ARCHITECTURE.md`, fixes the
view layer (2026-11-16: plain HTML and CSS with one TypeScript module script, no framework; the
folders for the views in its section 9; 2026-11-19: the build and the dev server, its section 12)
and will fix the hosting, which is among its open points (its section 10: they are the only
things between the front end and a deployment). This section only fixes what the folder
must look like so that it fits the repository:

- `frontend/package.json`, name `frontend`, depends on `@shared-calendar/shared`; scripts
  `dev`, `build`, `typecheck`, `lint`, `test:unit`, `verify`, `deploy`, so that the root
  scripts of section 5 pick it up with no change.
- Builds to `frontend/dist/` (git-ignored). Nothing in `backend/` is touched by a front-end
  build or deploy, and the other way round. The build is `frontend/scripts/build.mjs` (esbuild,
  already a development dependency of the root): no Vite, no configuration file of a tool. It
  takes the API's URL, Cognito's URL and the client id from three environment variables
  (`docs/FRONTEND_ARCHITECTURE.md` section 12.1).
- Its hosting (an S3 bucket behind CloudFront, or equivalent) is a **separate** SAM template
  and stack, `frontend/template.yaml`, so that the back-end stack `shared-calendar-api` is never
  changed by a UI release. The front end reads the back end's `ApiUrl`, `UserPoolId` and
  `UserPoolClientId` from the back-end stack outputs at build time (the way
  `backend/scripts/target.sh` does), never from a file committed in the repository.
- Local development: the front end's dev server (`npm run dev -w frontend`,
  `frontend/scripts/dev.mjs`) passes `/api` on to `http://127.0.0.1:3000` (the local API of
  `npm run local:api -w backend`) and `/cognito` to `http://localhost:9229` (cognito-local), and
  reads the client id from `backend/env.local.json`, so the whole application runs on the laptop,
  which keeps requirement N5 true for the UI too.
- It validates input with the same `shared/` schemas the API uses, so a username the UI
  accepts is one the API accepts.

What exists:

- **The services layer, since 2026-11-05** (brief `prompts/31-implement-login-service.md`, design
  `docs/FRONTEND_SERVICES.md`): plain TypeScript with `rxjs` and `shared/`, in `src/services/`,
  with `typecheck`, `lint`, `test:unit` and `verify`.
- **The foundation of the view layer, since 2026-11-19** (`docs/FRONTEND_VIEW_PLAN.md` step 60,
  design `docs/FRONTEND_ARCHITECTURE.md`): `index.html`, `style.css`, `src/main.ts`, `src/views/`
  (the shell and the login view), `scripts/` (the build and the dev server), the scripts `dev`
  and `build`, and `happy-dom` for the views' tests, the package's one development dependency of
  its own (section 4.1).
- **The logic layer and the week calendar, since 2026-11-19** (`docs/FRONTEND_VIEW_PLAN.md` step
  61): `src/logic/` (`texts.ts`, `week.model.ts`, `week.screen.ts`: plain TypeScript and RxJS,
  no DOM), `src/views/week.view.ts`, the navigation by the URL's hash in `src/views/shell.ts`,
  and `scripts/seed-local.mjs` with the script `seed:local`, which gives the local calendar two
  types, a few weekly patterns and a few appointments through the local API.
- **Booking and cancelling, since 2026-11-19** (`docs/FRONTEND_VIEW_PLAN.md` step 62):
  `src/logic/booking.ts` and `src/logic/appointment.detail.ts`, the two dialogs of the week (the
  book dialog and an appointment's detail) in `index.html` and `src/views/week.view.ts`, and in
  `src/views/shell.ts` the `AppointmentsService` and the `UsersService` of each session. No new
  file outside those two, no new script and no new dependency.
- **"My appointments", since 2026-11-19** (`docs/FRONTEND_VIEW_PLAN.md` step 64):
  `src/logic/appointments.model.ts` and `src/logic/appointments.screen.ts`,
  `src/views/appointments.view.ts`, and `src/views/detail.view.ts`: the appointment's detail,
  moved out of `week.view.ts` because two views now mount it (its dialog is in `index.html`
  after the screens, in none of them). In `src/views/shell.ts` the second entry of the table
  of screens and the `CalendarSettingsService` of each session. No new script and no new
  dependency.
- **The settings, since 2026-11-19** (`docs/FRONTEND_VIEW_PLAN.md` step 65):
  `src/logic/settings.model.ts` and `src/logic/settings.screen.ts`,
  `src/views/settings.view.ts`, and in `src/views/shell.ts` the third entry of the table of
  screens. No new script and no new dependency.
- **The users, since 2026-11-20** (`docs/FRONTEND_VIEW_PLAN.md` step 66):
  `src/logic/users.model.ts` and `src/logic/users.screen.ts`, `src/views/users.view.ts` (the
  form, the list and the screen's two dialogs, the password's and the delete's, which are in
  `index.html` inside the screen's element), and in `src/views/shell.ts` the fourth entry of
  the table of screens. No new script and no new dependency.
- **The availability types and the weekly patterns, since 2026-11-20**
  (`docs/FRONTEND_VIEW_PLAN.md` step 67): `src/logic/availability.model.ts`,
  `src/logic/conflicts.ts` (the appointments in the way of a refused change, which the next
  step uses too) and `src/logic/availability.screen.ts`, `src/views/availability.view.ts` (the
  two forms, the two lists and the screen's three dialogs, which are in `index.html` inside
  the screen's element), and in `src/views/shell.ts` the fifth entry of the table of screens
  with the `AvailabilityTypesService` and the `AvailabilityRulesService` of each session. No
  new script and no new dependency.
- **A single date of the availability, since 2026-11-20** (`docs/FRONTEND_VIEW_PLAN.md`
  step 68; date overrides and one-off windows): `src/logic/date.model.ts` and
  `src/logic/date.screen.ts`, the screen's second logic object; `src/views/date.view.ts`,
  the screen's second view, for its third part; `src/views/availability.parts.ts`, what the
  screen's two views share (the look-up of a form, the choices of a list, the conflicts
  list, and the one dialog that confirms). The same entry of the table of screens mounts
  both views and starts both objects, and each session has a second `CalendarService` for
  this part. No new script and no new dependency.

**The view layer is complete** (2026-11-20, `docs/FRONTEND_VIEW_PLAN.md` step 69): every screen
of that plan's section 3 exists, and the plan is done. The folder holds nothing of the trial
that came before the choice: its two prototypes were in a folder `prototypes/` at the root,
outside the workspaces, and were deleted at that step (they are in git history; commit
`f2ade74` is the last that holds them). The walk through every screen in a browser, the check
to repeat after a later change, is `docs/FRONTEND_WALK.md`; the script that ran it in a
headless browser is not in the repository, and no end-to-end test tool is.

What still waits for the open points of `docs/FRONTEND_ARCHITECTURE.md` section 10: the hosting,
so no `template.yaml` and no `deploy` script (the root scripts use `--if-present`, so their
absence is not an error).

---

## 8. Documentation and prompts

`docs/` and `prompts/` stay at the root: they are the history and the truth of the whole
repository, they cross-reference each other, and `CLAUDE.md` points at them.

- A document about one component carries the component in its name:
  `docs/FRONTEND_ARCHITECTURE.md`, `docs/FRONTEND_IMPLEMENTATION_PLAN.md`. The existing
  back-end documents keep their names (`ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`,
  `RUNBOOK.md`) to break no link; the day the front-end documents arrive they may be renamed
  with a `BACKEND_` prefix in one commit that also fixes every reference.
- Repository-wide documents have no prefix: this one, `AWS_ACCOUNTS.md`, `NEW_ACCOUNT.md`,
  `COMMANDS.md` (every command with its notes, and the local stack's quirks).
- Guidance for Claude Code is not in `docs/`: the root `CLAUDE.md` holds what every session
  needs, `backend/CLAUDE.md`, `frontend/CLAUDE.md` and `shared/CLAUDE.md` what concerns one
  package, `.claude/rules/` what concerns some kinds of file. The root file's last section
  ("Changing these files") says what goes where.
- `docs/journeys/` explains the integration journeys in simple words, one page per `describe`
  block, for a developer new to the project. These pages are not a source of truth: they explain
  the tests, and the documents above win. `docs/journeys/README.md` holds the format and the list
  of pages, `PLAN.md` the plan of the pages still to write, `concepts.md` the ideas several pages
  share.
- `prompts/` keeps one numbered sequence for the whole repository, whichever component a brief
  concerns.

---

## 9. Generated and ignored files

The root `.gitignore` patterns (`node_modules/`, `.aws-sam/`, `dist/`, `coverage/`,
`.cognito/`, `*.local.json`, `.verify-ok`, `.env*`) have no leading slash, so they match at any
depth and need no change. After the move the generated files appear here:

| File or folder | Where | Written by |
|---|---|---|
| `node_modules/` | root only (hoisted) | `npm install` |
| `backend/env.local.json` | backend | `local-seed.sh` |
| `backend/.cognito/` | backend | cognito-local (volume `./.cognito` of `backend/docker-compose.yml`) |
| `backend/.aws-sam/` | backend | `sam build` |
| `backend/.verify-ok` | backend | `verify.sh` |
| `backend/coverage/`, `shared/coverage/`, `frontend/coverage/` | each package | vitest |
| `frontend/dist/` | frontend | esbuild (`npm run build -w frontend`, `frontend/scripts/build.mjs`) |

---

## 10. How it was applied

Applied on 2026-11-04 as plan step 20 (brief `prompts/21-step-20-implementation.md`): every
file moved with `git mv`, so `git log --follow` shows its history from before the move. The
lock file was carried over rather than regenerated, so no dependency version changed.
`docs/ARCHITECTURE.md` v10 records the move and points here for the layout.
