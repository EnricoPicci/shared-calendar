# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A shared calendar on AWS, serverless: an Administrator publishes availability, users book, cancel
and change appointments (`docs/SHARED_CALENDAR_SPEC.md`); an administrative API creates and deletes
users; a "Hello World" route for registered users proves the chain API, authorizer, Lambda,
DynamoDB works. TypeScript, AWS Lambda, API Gateway (HTTP API), Amazon Cognito, DynamoDB, deployed
with AWS SAM.

The repository is an npm-workspaces monorepo: the back end in `backend/`, the code it shares
with the browser front end (the API contract types, `Role`/`resolveRole`, the username schemas)
in `shared/` (package `@shared-calendar/shared`), and in `frontend/` the browser's services
layer (`docs/FRONTEND_SERVICES.md`) and the start of its view layer
(`docs/FRONTEND_ARCHITECTURE.md`: the build and the dev server, the shell with its navigation,
the login, the logic layer, the week calendar with booking, cancelling, the note and the change,
a User's "My appointments" and the Administrator's settings, users and, of the availability,
the types and the weekly patterns; the other views follow `docs/FRONTEND_VIEW_PLAN.md`). Layout and placement rules:
`docs/FOLDER_STRUCTURE.md`.

## Where the truth lives

- `README.md` is the entry point for a newcomer (what it is, prerequisites, the deployed
  stack's ids, everyday commands, curl examples). It summarises; it is not a source of truth.
- `docs/ARCHITECTURE.md` defines the behaviour, the API contract, the data model and
  the security rules. On any conflict, the architecture wins.
- `docs/IMPLEMENTATION_PLAN.md` defines the order of work, step by step, with an
  acceptance check per step.
- `docs/SHARED_CALENDAR_SPEC.md` specifies the shared calendar (agreed with the Product Owner,
  brief 40, not yet implemented). It is the input for the calendar's plan steps; once merged into
  `ARCHITECTURE.md` (spec section 19), the architecture wins as usual.
- `docs/FRONTEND_ARCHITECTURE.md` defines the front end's view layer (v9; the foundation, the
  week, booking, cancelling, the note, the change, "My appointments", the settings, the users
  and the availability types and weekly patterns implemented, plan steps 60 to 67): plain HTML and CSS with one TypeScript module script, the layers (services, logic,
  views, shell), the rules of a view, the shape of a dialog (its section 4, with the book
  dialog's second mode, the banner of a move, the detail dialog that two views mount, the
  shape of the list, the shape of a form whose fields are checked: a field in fault, the
  password dialog that the Escape key does not close, the shape of a dialog that confirms
  a deletion, and the availability: a form that creates and a dialog that changes, four forms
  of one shape, the conflicts list and its three places, one dialog for the deletion of a
  type or of a pattern), the
  logic layer as built (its section 5.1, with the reloads of the week,
  the detail's three actions and its one sentence, the appointment being moved, the list
  screen with its time zone read from the settings and its period, the hand-over of an
  appointment from the list to the week, the settings screen with the checks of its fields
  and the read after a save, the users screen with the check of the username, the reads
  of its list and where the generated password is and is not, and the availability screen
  with its three reads, the join of the types' names, the checks of a name and of a
  pattern's fields, and what a write says to the form or the dialog that asked), the table of screens, what the shell hands a view and
  the navigation by the hash (its section 6), and the
  tooling (its section 12: the bundle command, the dev server, the tests' environment). Hosting,
  CORS, the session across a reload, the hosting's Content-Security-Policy, logout and the size
  of the bundle are its open points (section 10).
  `docs/FRONTEND_SERVICES.md` stays the truth for the services;
  `docs/FRONTEND_VIEW_OPTIONS.md` is the record of why this option, not a source of truth.
- `docs/FRONTEND_VIEW_PLAN.md` defines the order of work for the views (brief 82): steps 60–69,
  each with its acceptance check and its browser check, ending with all the views running against
  the local stack. Steps 60 (tooling, shell, login), 61 (the logic layer, the week calendar
  read-only, the navigation, the local seed), 62 (booking and cancelling, the week loaded
  again after a write and when the tab becomes visible), 63 (the note edited in the detail,
  an appointment moved to another time) and 64 ("My appointments": the upcoming list and the
  history, the detail dialog shared by two screens, "Change" from the list handed over to the
  week), 65 (the settings: one form, its fields checked before any call), 66 (the users: the
  list, a create that shows the generated password once, a delete that asks first) and 67
  (the availability types and the weekly patterns: a form that creates, a dialog that
  changes, a delete that asks first, the list of the appointments in the way of a refused
  change) are done (2026-11-20); next step 68, the date overrides and the one-off windows.
- `docs/RENAME_PLAN.md` plans the move from the "hello-world" names to "shared-calendar" (plan
  steps 56–58: repository, new stack `shared-calendar-api`, retirement of `hello-world-api`), with
  the way back at every stage. The repository uses the new names (step 56) and the stack in use
  is `shared-calendar-api` (step 57, 2026-11-16); the old stack `hello-world-api` (profile
  `hello-admin`) stays untouched as the way back until step 58. The Hello World feature
  (`/hello`, its table `…hello-messages`) keeps its name: it proves the Lambda chain works.
- `docs/journeys/` explains the integration journeys in simple words, one page per `describe`
  block, for a new developer (format, rules and the list of pages in `docs/journeys/README.md`;
  the pages still to write, in sessions and batches, in `docs/journeys/PLAN.md`).
  Writing, checking and refreshing a page follow the project skill `.claude/skills/explain-journey/SKILL.md`.
  Not a source of truth: on any conflict the documents above and the tests win, and the page is
  fixed. When a journey changes, its page changes in the same commit; the `describe` carries the
  pointer comment `// Explained in simple words in docs/journeys/<package>/<page>.md.`
- `prompts/` holds the numbered briefs that produced those documents. Keep new briefs
  numbered in sequence.

Read both documents before changing anything.

## Working rhythm

- Implement one plan step at a time. Run the step's acceptance check, report the
  result honestly (including failures), then stop for review before the next step.
- Commit only when asked. The plan suggests checkpoints after steps 3, 6, 9 and 11.
- When the implementation proves the architecture wrong, say so and propose the
  document change rather than silently diverging.

## Hard rules from the design

- Handlers never import the AWS SDK directly. All AWS access goes through the modules
  under `backend/src/lib` (`cognito.ts`, `db.ts`). This keeps later features cheap.
- `shared/` imports no AWS SDK, no Node-only module and no DOM API: only TypeScript and `zod`.
  The API contract and the username rule live there and the back end imports them; a new error
  code or response field starts in `shared/src/api.ts`.
- Logs never contain tokens, passwords or the body of the create-user response.
- IAM policies never use a wildcard action or resource. One role per function, granting only
  what its route needs, scoped to the user pool and/or table it uses. The calendar's DynamoDB
  permissions are shared managed policies on the `calendar` table, attached per role
  (architecture 7.1).
- Every password is set as permanent. There is no forced password change and no
  e-mail sending in v1.
- The API can never create an administrator, delete one, or set its password.
- Role resolution: `admin` wins over `user`; a token in neither group gets 403.

## Comments

Applies to every comment in every file: TypeScript, JavaScript, shell, `template.yaml`, the config files.

- A comment says in plain words what the code does or why, so that it can be read without
  opening a document. A reference to the documentation backs up the comment, it does not replace it.
- A reference names the document by its path, in the same sentence as the item it points at,
  every time: `docs/FRONTEND_SERVICES.md section 10.2`, `docs/FRONTEND_SERVICES.md section 8,
  decision 30`, `docs/FRONTEND_SERVICES.md section 2, rule 9`, `docs/SHARED_CALENDAR_SPEC.md
  section 8.4`, `docs/SHARED_CALENDAR_SPEC.md R-BOOK-02`, `docs/SHARED_CALENDAR_SPEC.md decision D7`,
  `docs/SHARED_CALENDAR_SPEC.md AC-36`, `docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16`,
  `docs/ARCHITECTURE.md section 4`, `docs/IMPLEMENTATION_PLAN.md step 9`. The labelled items count
  too: requirements `F…` and `N…` (`docs/ARCHITECTURE.md N6`), assumptions `A…` and open points
  `O…` (`docs/SHARED_CALENDAR_SPEC.md section 22, assumption A5`), approved changes `P…`
  (`docs/IMPLEMENTATION_PLAN.md`), decisions `D…` and `T…`. Never a nickname
  ("spec 8.4", "architecture 5.3", "plan step 9") or a bare item ("section 9.4", "(13.2)",
  "decision 30", "R-BOOK-02"). The reference must exist in that document and say what the comment
  claims.
- No history in comments: no version tags ("v6", "spec v14"), no "brief 54", no "since step 51",
  no "revised", "formerly", "now". A comment describes the code as it is; when it changed is in git
  and in the documents' change logs.
- Test names (`describe`, `it`, `test`) are exempt from the path rule: they keep their short
  references (`'checkChange (8.4, R-CHG-01)'`, `'AC-22: …'`). Instead, each outermost `describe`
  whose names hold one gets a one-line comment above it naming the document(s), not the items:
  `// Test names: section numbers, R-… rules and AC-… scenarios are those of
  // docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).` History tags are refused in
  test names too.
- Enforced by `npm run lint` (root and `-w backend`, so also by `verify`): the ESLint rule
  `local/doc-references` (`scripts/eslint-doc-references.mjs`) on TypeScript and JavaScript, and
  `scripts/check-doc-references.mjs` on the `#` comments of shell, YAML and TOML files. Both use
  `scripts/doc-references.mjs`, which also knows the lower-case journey pages under `docs/journeys/`. The check finds references it cannot follow, an unknown document
  and history tags; whether a comment is clear stays a matter for review.

## Cloud safety

- Never run `sam deploy`, `sam delete`, or any `aws` command that creates, changes or
  deletes resources unless explicitly instructed in the current request.
- `npm run verify -w backend` (all local tests) must be green before any deployment. The deploy
  script enforces this; do not bypass it.
- Local development uses the Docker stack (DynamoDB Local, dynamodb-admin, cognito-local)
  and `sam local start-api`. No AWS account is needed until plan step 11.

## Tooling and style

- Node.js 22, TypeScript strict, esbuild bundling via SAM, vitest for tests,
  `aws-sdk-client-mock` for unit tests, `zod` for input validation.
- The back end's infrastructure is one `backend/template.yaml`. Explain infrastructure changes in plain terms:
  the reader is not an Infrastructure-as-Code expert.
- Prefer the simplest design that meets the architecture. Do not add libraries,
  abstractions or AWS services the architecture does not call for.

## Everyday commands

Node 22 is pinned in `.nvmrc`; run `nvm use` first (the machine default may be newer).
`npm ci` (or `npm install`) at the root installs every package into one root `node_modules/`
with one `package-lock.json`. Never run `npm install` inside `backend/` or `shared/`.

Commands run from the repository root. Back-end scripts take `-w backend`, with `--` before
their own arguments (`npm run smoke -w backend -- local`); from inside `backend/` the plain
form works the same. Paths below without a folder are relative to `backend/`.

- `npm run typecheck`, `npm run lint`, `npm run test:unit` at the root: every package (`shared`,
  `backend` and `frontend`), each with its own coverage threshold.
- `npm run typecheck -w backend`: `tsc --noEmit` over `src/`, `tests/` and the config files
  (`-w @shared-calendar/shared` for the shared package, which has no Node types).
- `npm run lint -w backend`: ESLint with the root flat config (`typescript-eslint` recommended, plus
  the comment rule `local/doc-references`), then `scripts/check-doc-references.mjs` on the `#`
  comments under `backend/` (section "Comments"). The root `npm run lint` does the same over the
  whole repository.
- `npm run test:unit -w backend`: vitest project `unit`, no Docker needed. Runs with v8 coverage and
  fails below 100 % line coverage on `src/lib` (HTML report in `coverage/`, git-ignored).
  `shared/` has the same 100 % threshold on `shared/src`.
- `npm run typecheck -w frontend`, `npm run lint -w frontend`, `npm run test:unit -w frontend`
  (the vitest projects `unit`, in node, and `views`, in `happy-dom`, with one coverage report:
  100 % line coverage on `frontend/src`, only `src/main.ts` left out), `npm run verify -w frontend`
  (the three in order, stops at the first failure; no Docker). The root `npm run verify` runs the
  back end's, then this.
- `npm run dev -w frontend` (`frontend/scripts/dev.mjs`; `-- <port>` for another port than 5173):
  the page on http://localhost:5173 against the local stack, foreground, for local work only.
  Needs `local:up` (it reads the client id from `backend/env.local.json` and says so when the file
  is missing) and, to sign in, `local:api`. Serves `/`, `/style.css` and `/app.js` (bundled by
  esbuild at every request: an edit shows after a reload of the page; an edit to `dev.mjs` itself
  needs a restart), passes `/api/…` on to `http://127.0.0.1:3000` and `/cognito/…` to
  `http://localhost:9229` so that the browser sees one origin (the API has no CORS), sends
  `Content-Security-Policy: default-src 'self'` with the page, listens on `127.0.0.1` only and
  never prints a request's body or headers. The console's one known report is `zod`'s `eval`
  probe (`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O5). A reload of the page signs
  out (open point O3). In a Codespace, open the forwarded port 5173: the bundle's addresses have
  no host, so any origin works.
- `npm run seed:local -w frontend` (`frontend/scripts/seed-local.mjs`): gives the local calendar
  a week to look at, through the local API (needs `local:up` + `local:api`). As `admin`: the
  types "Studio" and "Piscina" and 8 weekly patterns, valid for 60 days from today (today in the
  calendar's zone, read from the settings), so the dates the front end's integration journeys
  use (from today + 330 days) stay free. As `alice`, for herself: up to 5 appointments on free
  slots of the week of today and of the next one, some with a note; she books only what her own
  `GET /calendar` offers, so the current settings decide, and no setting is changed. It only
  adds; it does nothing at all when the type "Studio" exists already; it refuses any address but
  `localhost` and `127.0.0.1` (`SEED_API_URL`, `SEED_COGNITO_URL` for other local ports); it
  prints what it created, never a token or a password. Appointments cannot be deleted through
  the API: **after the back end's calendar journeys have emptied the table, run it again.** Its
  date arithmetic imports `shared/src/calendar/time.ts` in node (Node ≥ 22.18, type stripping),
  like the smoke test's.
- `API_URL=… COGNITO_URL=… CLIENT_ID=… npm run build -w frontend` (`frontend/scripts/build.mjs`):
  writes `frontend/dist/` (git-ignored, emptied first): `index.html`, `style.css`, `app.js`
  (minified) and `app.js.map`, and prints their sizes. The three values come from the environment
  only, never from a committed file; a missing one stops the build and is named. No deploy of the
  front end exists (hosting is open point O1), and `backend`'s `build` is another thing
  (`sam build`).
- Stopping a background `dev` by name: `pkill -f 'node scripts/dev[.]mjs'`, in a command that
  holds no other text matching it (a shell whose command line matches is killed too).
- `RUN_INTEGRATION=1 npm run test:integration -w frontend`: runs `frontend/tests/integration`
  (`login.service.test.ts`, `journeys.test.ts` and, since step 53, `calendar.test.ts`: the
  services against cognito-local on 9229 and the API on 3000, `docs/FRONTEND_SERVICES.md`
  section 14). Needs `local:up` + `local:api` running and the Codespaces iptables rule below.
  Creates and removes the throw-away users `fe-journey`, `fe-calendar` and `fe-calendar-b` (removed
  first too, so it can be rerun after a failed run). `calendar.test.ts` **never resets the local
  `calendar` table**: it works on top of what the back-end journeys and the smoke test leave, creates
  only types named `fe-calendar …` and items of those types on free dates from today + 330 days,
  books only for `fe-calendar` and `fe-calendar-b`, removes it all (and an earlier failed run's)
  before and after (the two users first: deleting a user cancels its future appointments, which
  would otherwise block deleting their pattern and type), and writes the settings back to the
  values it read (`updatedAt`/`updatedBy` stay changed). Its appointment blocks set the settings for
  their run (`bookingHorizonDays` 365, `minBookingNoticeHours` 0, no limit) to book about a year
  ahead. Until the write-back it keeps the values read in
  `frontend/tests/integration/fe-calendar-settings.local.json` (git-ignored), which the next run
  writes back first if a run was killed in between (`docs/FRONTEND_SERVICES.md` section 14.4).
  Appointments cannot be deleted through the API: the cancelled ones, their events and the two
  users' deleted-user markers stay in the local table as history, like the smoke test's. Without
  `RUN_INTEGRATION=1` it runs nothing and exits 0, like the back end's.
- `RUN_INTEGRATION=1 npm run test:integration -w backend`: the journeys of plan step 9
  (`journeys.test.ts`) and the calendar's (`calendar.test.ts`) against the running `local:up` +
  `local:api` stack. Pass the same `DYNAMODB_PORT` as `local:up` (here `DYNAMODB_PORT=8002`).
  Without `RUN_INTEGRATION=1` it runs nothing and exits 0. Removes a leftover `carol` before
  starting, so it can be rerun after a failed run. **The calendar journeys empty the local
  `calendar` table first** (helper `resetCalendarTable()`, which refuses any endpoint but
  `localhost`/`127.0.0.1`): calendar data made by hand is lost when they run.
- Integration files run one at a time, in both packages (`fileParallelism: false` on the
  `integration` projects): they share one `sam local`, one DynamoDB Local and one cognito-local.
  Their order is not fixed, so every file prepares its own state. Never run the back end's and the
  front end's integration tests at the same time by hand (two terminals): nothing prevents it.
- `npm run build -w backend`: `sam build`. Always go through npm: SAM needs the repository's
  `esbuild` on the PATH and `SAM_CLI_BETA_NODEJS_MONOREPO=1`, which the script sets. Without the
  beta, building in source runs `npm update --omit dev` per function, which strips the root's dev
  tools (`docs/FOLDER_STRUCTURE.md` 4.3; repair with `npm ci` at the root). The beta needs SAM CLI
  ≥ 1.171.0 (older ones ignore it): the script and `local-api.sh` run `scripts/check-sam.sh` first,
  which refuses an older SAM.
- `sam validate --lint` (inside `backend/`): checks `template.yaml`.
- `npm run local:up -w backend`: starts DynamoDB Local, dynamodb-admin (http://localhost:8001) and
  cognito-local, then seeds them (tables `hello-messages` and `calendar`, the latter empty; pool,
  client, groups, users `admin` / `Admin-Local-Pass-1!` and `alice` / `Alice-Local-Pass-1!`) and
  writes `env.local.json`. Idempotent; rerun it after a change to `local-seed.sh`. Set
  `DYNAMODB_PORT=8002` when another project holds port 8000.
- Calendar variables: every calendar function declares `CALENDAR_TABLE`, `CALENDAR_TIME_ZONE` and
  `DYNAMODB_ENDPOINT` in `template.yaml`. `env.local.json` sets `CALENDAR_TABLE` and
  `DYNAMODB_ENDPOINT` once, in its `Parameters` section, which `sam local` applies to every
  function declaring the variable: a new calendar function needs no seed line, unless it also calls
  Cognito (`BookAppointmentFunction` has its own section with `USER_POOL_ID`, `COGNITO_ENDPOINT` and
  the dummy credentials, like `CreateUserFunction`; `DeleteUserFunction` declares the calendar
  variables too and keeps its own section; `ListUsersFunction` has a section of its own and no
  calendar variable). `CALENDAR_TIME_ZONE`
  is deliberately not in the file (a value there would win over the template): it comes from the
  parameter `CalendarTimeZone` (default `Europe/Rome`). An invalid zone makes every calendar
  request answer 500.
- `npm run local:api -w backend`: builds and serves the API on http://127.0.0.1:3000 (foreground).
- The local functions run on the machine's CPU type: `local-api.sh` passes
  `FunctionArchitecture=x86_64` on x86 machines (the cloud stays `arm64`, the template default).
- GitHub Codespaces: the legacy iptables `FORWARD` chain drops traffic between containers on
  `shared-calendar-local` (the authorizer then times out fetching `http://cognito:9229/…/jwks.json`). After
  each Codespace start, before `local:api`: `sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT`.
- `npm run local:down -w backend`: stops the stack. The table is in memory and is lost; Cognito
  data survives in `backend/.cognito/`.
- Raw `sam local …` with Docker Desktop needs
  `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock` and dummy `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` (otherwise SAM tries the real, possibly expired, AWS login).
  `scripts/local-api.sh` does both.
- After `npm run build -w backend`, restart `npm run local:api -w backend`: it is not certain that the warm
  containers pick up the rebuilt code on their own.
- `sam local` (`warm_containers = "EAGER"`) starts extra Lambda containers besides its warm ones
  and leaves them running when it stops. `local-api.sh` removes every container labelled
  `sam.cli.container.type=lambda` on the `shared-calendar-local` network when it exits (Ctrl-C included); the
  emulators are untouched. After a `kill -9` or a closed terminal, remove them by hand:
  `docker rm -f $(docker ps -aq --filter label=sam.cli.container.type=lambda --filter network=shared-calendar-local)`.
  Local weight with 10 functions (step 44): about 0.75 GB for the whole stack, ready in about 14 s;
  with 15 calendar functions (step 47): about 1.1 GB (26 containers after the journeys; start-up not timed);
  with 25 functions (step 51): about 1.5 GB (36 containers after both packages' journeys, emulators
  included); `local:api` ready in about 11 s, build included.
- Runtime image: `samconfig.toml` sets `skip_pull_image = true` for `start-api`. Without it every warm
  container's start asks Docker for the runtime image's digest at public.ecr.aws ("Local image is
  up-to-date"), several in parallel with no timeout: 6–42 s, sometimes never completing (step 51).
  Instead `local-api.sh` runs one `docker pull public.ecr.aws/lambda/nodejs:22-<arch>` (120 s at
  most); when that brings a new base it removes `…:22-rapid-<arch>` (SAM's image: base + Lambda
  emulator), which SAM then rebuilds. Registry unreachable: a warning, the local copy is used. A raw
  `sam local start-api --config-env local` skips the lookup altogether.
- Under `sam local`, every event carries the same fake `requestContext.requestId`, so
  identical request ids in local logs are expected. In the cloud they are unique.
- cognito-local does not implement `AdminUserGlobalSignOut`. `env.local.json` sets
  `SKIP_GLOBAL_SIGN_OUT=true` for `DeleteUserFunction` so local deletes work; the cloud never
  sets it (architecture section 8, note on Cognito emulation).
- The shell is zsh: `set -- $var` does not word-split. Pass arguments explicitly.
- `npm run audit -w backend`: `npm audit --audit-level=high` (covers the whole repository: one lock file).
- `DYNAMODB_PORT=8002 npm run verify -w backend` (the root `npm run verify` runs the same): typecheck,
  lint, audit, `sam validate --lint`, unit and integration tests (sets `RUN_INTEGRATION=1`
  itself), with typecheck, lint and unit tests also for `shared`; stops at the first failure.
  Needs `local:up` + `local:api` running; never starts them. On success writes
  `.verify-ok` (`<commit> <epoch> <clean|dirty>`, git-ignored); removes it at the start.
- `npm run deploy -w backend`: refuses (exit 1, names the reason) unless `.verify-ok` is younger than
  30 minutes, names HEAD and says `clean`, and the whole repository's tree is still clean (front-end
  work in progress blocks a back-end deploy too); then `npm run build`
  and `sam deploy` with the default config env. Extra arguments go to `sam deploy`
  (first deploy of a stack: `npm run deploy -w backend -- --parameter-overrides AlertEmail=<address>`; later
  deploys reuse the stored value). Never put an e-mail address in `samconfig.toml`: the repo is
  public. Refuses any argument naming the old stack `hello-world-api` (`docs/RENAME_PLAN.md`
  section 4.2: its tables would be replaced). Real cloud action: only when explicitly asked.
- `npm run bootstrap-admin -w backend -- <stack|local>`: sets the admin password (hidden prompt, twice,
  pool policy checked first). Only sets the password. Reads stdin, so
  `printf '%s\n%s\n' "$pw" "$pw" | npm run bootstrap-admin -w backend -- local` works in tests.
- `DYNAMODB_PORT=8002 npm run smoke -w backend -- <stack|local>`: journeys 3, 4, 6, 11 with a throw-away
  `smoke-<epoch>` user and, before 11, the calendar journey of spec 18.4 (a type `smoke-<epoch>`
  and a one-off window on the first free 03:00–04:00 from 50 days ahead, booked for the user,
  listed and cancelled by it, then window and type deleted; settings never changed); 19 checks,
  PASS/FAIL each. On every exit it removes the type, window and booking and deletes the user.
  Prompts for the admin password (stdin). Leaves its message rows and, in `calendar`, the
  cancelled appointment, its events and the user's deleted-user marker (history). Its date
  arithmetic imports `shared/src/calendar/time.ts` in node (Node ≥ 22.18, type stripping).
- `npm run budget -w backend -- <stack> [--dry-run]`: creates the 1 USD monthly budget `<stack>-monthly`
  (e-mail to the stack's `AlertEmail`) through the Budgets API. Not in `template.yaml`: no
  `AWS::Budgets::Budget` in CloudFormation in `eu-north-1`. Idempotent; no local target.
- Stack targets read ids from the CloudFormation outputs (read-only `describe-stacks`) in
  `samconfig.toml`'s region unless `AWS_REGION` is set. `local` uses `env.local.json` and
  dummy credentials. After `bootstrap-admin local`, rerun `local:up` to restore
  `Admin-Local-Pass-1!`, or the integration tests fail.
- Cloud: stack `shared-calendar-api` in `eu-north-1` (the organization's policy blocks regional
  services in every other region), the one in use since plan step 57 (2026-11-16); its tables are
  `shared-calendar-api-calendar` and `shared-calendar-api-hello-messages` (locally plain `calendar`
  and `hello-messages`). The old stack `hello-world-api` stays, untouched, as the way back until
  `docs/IMPLEMENTATION_PLAN.md` step 58: nothing is deployed to it. The operator signs in
  with IAM Identity Center: `export AWS_PROFILE=shared-calendar-admin`, and when the session
  expires `aws sso login --profile shared-calendar-admin --use-device-code` (device code: the
  Codespace has no local browser callback). The old profile `hello-admin` (SSO session `hello`)
  stays beside it until step 58.
- Passwords and tokens in these scripts never go into a command-line argument (visible in
  `ps`) or a file: the two Cognito calls carrying a password go through
  `scripts/cognito.mjs` (AWS SDK, password on stdin), API calls pass the token to curl with
  `-H @-`, and JSON answers are parsed by `json_field` (node, stdin). The AWS CLI cannot
  read a request from a pipe, and its errors echo the input. Avoid bash here-strings
  (`<<<`) for secrets: bash 3.2 writes them to a temp file.
- The scripts run on macOS (bash 3.2, BSD tools) and Linux (bash 5, GNU tools) and need
  only node, the AWS CLI, curl and git: no jq. JSON is read with node or `--query`. Keep it
  that way: no `sed -i`, `stat`, `date -d`/`-v`, or other flags that differ between the two.

## Folder map

Full annotated tree: `docs/FOLDER_STRUCTURE.md` section 2.

- Root: `package.json` (workspaces `shared`, `backend`, `frontend`; delegating scripts; shared dev tools),
  the one `package-lock.json`, `tsconfig.base.json` (strictness every package extends),
  `eslint.config.js`, `.nvmrc`, `docs/`, `prompts/`, and `scripts/` (the comment check:
  `doc-references.mjs`, `eslint-doc-references.mjs`, `check-doc-references.mjs`; section "Comments").
- `backend/`: the API. `package.json` (name `backend`, scripts), `template.yaml`,
  `samconfig.toml`, `docker-compose.yml`, `tsconfig.json`, `vitest.config.ts`, and:
  - `src/handlers/`: one Lambda entry point per file.
  - `src/lib/`: back-end modules; the only place that touches the AWS SDK. `calendarDb.ts` is the
    only module that knows the `calendar` table's item layout and the calendar lock
    (`withCalendarLock`); its configuration (`calendarConfig()`) is read once per container. Its
    locked writes take the rule check as a callback (`check`), run on the data read inside the
    locked attempt; the writes that compare themselves with the rest of the calendar get the
    availability state (`CalendarState`: types, patterns, overrides and one-off windows from today,
    appointments from now − 24 h). Its availability writes: patterns, `setOverride`, `deleteOverride`,
    `createOneOffWindow`, `deleteOneOffWindow` (a window by id: the state first, the whole `WINDOW`
    partition only on a miss, to tell a past window, `date_in_past`, from an unknown one). Booking:
    `bookAppointment` (settings and state read inside the attempt; one transaction of five items:
    lock, `APPT`, `APPTID`, `EVENT`, a `ConditionCheck` on the `DELETEDUSER#<sub>` marker, whose
    failure `withCalendarLock` answers through the plan's `onConditionFailed`, without a retry).
    Appointments by id (`readAppointment`, internal: `GetItem APPTID#<id>` → `GetItem APPT`, inside
    the locked attempt; a pointer without its item is absent): `cancelAppointment` and
    `updateAppointmentNote` (check callback on the appointment or `null`; three items: lock, an
    `Update` of the changed `APPT` attributes without a condition, `EVENT`; an unchanged note writes
    nothing). `changeAppointment` (settings, state and the old appointment by id read inside the
    attempt, check callback on the three; six items: lock, an `Update` of the old `APPT` (`changed`,
    `replacedBy`), `Put` of the new `APPT` (`replaces`, built by the booking's `newAppointment`) and
    its `APPTID`, `EVENT`, the marker `ConditionCheck` on the old one's `userId`, last).
    User deletion: `markUserDeleted` (spec 10.2 v12; chunks of `DELETION_CHUNK` = 40, each under the
    lock: `APPT` from now − 24 h read inside the attempt, kept by `userId` = the `sub`, `booked`,
    `end > now`; the first chunk also writes the `DELETEDUSER#<sub>` marker, a plain `Put`; per
    appointment an `Update` with `cancelReason` `user_deleted` and `Put EVENT`; one event id per
    appointment on first sight, kept across retries and chunks).
    `listAppointments` (route 16, a read: a range `SK BETWEEN` as the view, or upcoming
    `SK ≥ now − 24 h` with `end > now`; owner by `userId` or stored `username`; status; by start).
    `calendarEvents.ts`: builds the `EVENT` item (`appointmentEvent`, the `AppointmentSnapshot` of
    the stored appointment; types `booked`, `cancelled`, `note_updated`, and `changed` with `previous`, the old
    appointment as stored after the change, a key the other types never have), pure; ids and "now" passed in. `calendarRules.ts`: the calendar's
    checks (`checkTypeName`, `checkTypeDelete`, `typeNameKey`, and `checkAvailabilityWrite` for
    every availability write: patterns, overrides, one-off windows; `checkBookingTimes`, R-BOOK-02
    before the lock, and `checkBooking`, R-BOOK-03..07 and 09 under it; `checkCancel` (R-CAN-01..03,
    R-PERM-01 by `sub`) and `checkNote` (R-NOTE-01, answers `unchanged`); `checkChange` (spec 8.4 v11:
    `checkCancel` on the old appointment, then `checkBooking` for its User on the state without it); `cancellableUntilFor` (a
    User on a booked appointment, else `null`); `calendarView`, the
    calendar view built for one caller's role from what `calendarDb.readCalendarRange` reads;
    `toResponse`, an appointment as a response), pure, no AWS, "today", "now" and the zone passed
    in; a failed check is `Refusal` (`{ error, message?, conflicts? }`, code from `ApiErrorCode`).
    `cognito.ts` also has `getUserSub` (`AdminGetUser`, the `sub`), `isPlainUser` (in `user`,
    not in `admin`) and `listPlainUsers` (`ListUsersInGroup` for both groups, every page; sorted by
    code units). `http.ts`: `parseJsonBody` for bodies, `parseQuery` for query strings (the
    object a `.strict()` query schema checks).
  - `src/handlers/`, calendar: `getCalendarSettings.ts`, `updateCalendarSettings.ts` (the pattern
    the other calendar handlers copy: claims → configuration check → role → path → body →
    `calendarDb` with the `calendarRules` check → one log line); availability types:
    `listAvailabilityTypes.ts`, `createAvailabilityType.ts`, `renameAvailabilityType.ts`,
    `deleteAvailabilityType.ts`; weekly patterns: `listPatterns.ts`, `createPattern.ts`,
    `updatePattern.ts`, `deletePattern.ts`; date overrides: `setOverride.ts`, `deleteOverride.ts`; one-off
    windows: `createOneOffWindow.ts`, `deleteOneOffWindow.ts` (all admin only; `date_in_past` from the
    path or body before the lock, except the window delete); the view: `getCalendar.ts` (`GET /calendar`, both roles);
    booking: `bookAppointment.ts` (`POST /calendar/appointments`, both roles; the checks in the order
    of spec 8.2 v9, the Administrator's target through Cognito before the lock); appointments:
    `listAppointments.ts` (`GET /calendar/appointments`, both roles, read-only, no Cognito),
    `updateAppointmentNote.ts` (`PATCH …/{appointmentId}`) and `cancelAppointment.ts`
    (`POST …/{appointmentId}/cancel`), admin or owner (someone else's is 404, spec v10 order);
    change: `changeAppointment.ts` (`POST …/{appointmentId}/change`, admin or owner, no Cognito: the
    User is the old appointment's; `checkBookingTimes` before the lock; spec 8.4 v11 order; logs
    `appointmentId` and `newAppointmentId`); users: `listUsers.ts` (`GET /users`, admin, Cognito only,
    no calendar configuration check; logs `userCount`). `deleteUser.ts` (Hello World's route) has a
    calendar part since step 51: after the admin and group checks, `calendarConfig()`, the `sub`,
    then `calendarDb.markUserDeleted` before the sign-out and delete; a failure there answers before
    any Cognito change (`409 concurrent_update` or `500`); logs `cancelledCount` and `lockAttempts`.
  - `tests/unit/`: vitest unit tests, mirroring `src/` (e.g. `tests/unit/lib/http.test.ts`).
  - `tests/integration/`: end-to-end tests against the local Docker stack: `setup.ts` (helpers,
    including `resetCalendarTable()`, `putCalendarItem()`, `getCalendarItem()`, `deleteCalendarItem()`,
    `queryCalendarPartition()`), `journeys.test.ts`
    (step 9), `calendar.test.ts` (the calendar's journeys, growing per plan step).
  - `scripts/`: shell scripts behind the npm scripts (`local-seed.sh`, `local-api.sh`,
    `verify.sh`, `deploy.sh`, `bootstrap-admin.sh`, `smoke.sh`, `budget.sh`, `check-sam.sh`; `target.sh` is
    sourced by the last three; the first two of those call `cognito.mjs`).
  - `docker/`: files for the local stack (`cognito-local-config.json`).
- `frontend/`: package `frontend`: the services layer and the view layer's foundation
  (`docs/FOLDER_STRUCTURE.md` section 7). `package.json` (deps `rxjs`, `@shared-calendar/shared`;
  dev dep `happy-dom`; scripts `dev`, `build`, `seed:local`, `typecheck`, `lint`, `test:unit`,
  `test:integration`, `verify`; no `deploy` yet), `tsconfig.json` (ES2022 + DOM + DOM.Iterable, no
  node types), `vitest.config.ts`, `src/services/` (`session.store.ts`; `cognito.ts` and `api.ts`, the
  building blocks the services share (`api.ts`: methods `GET`/`POST`/`PUT`/`PATCH`/`DELETE`,
  `query`, `conflicts` on `availability_conflict`, and the helpers `invalidRequest`,
  `unexpectedAnswer`, `hasString`); `login`, `refresh`, `hello`, `users` (with `listUsers`),
  `calendar-settings`, `availability-types`, `availability-rules`, `calendar`, `appointments` as
  `<name>.service.ts` +
  `<name>.types.ts`; `jwt.ts`), `tests/unit/services/` mirroring `src/` (plus `fixtures.ts`, and
  `suite.ts`: `describeMethod`, the unit tests every API method gets; its `other` is optional, for
  a service whose methods share one pending call), `tests/integration/`
  (`local.ts` helper with `outcome()`, `login.service.test.ts`, `journeys.test.ts`,
  `calendar.test.ts`). Calendar services (plan steps 53–54; the services layer is complete):
  `calendar-settings`, `availability-types`, `availability-rules`, `calendar` (`CalendarService`:
  `load(from, to)` and `reload()`, which re-runs the last load's range, one pair of streams and one
  pending call for both) and `appointments` (`AppointmentsService`: `list`, `book`, `cancel`,
  `change`, `updateNote`; streams `appointmentsResult$` and `updateNoteResult$`, not the spec's
  `listResult$`/`noteResult$`, `docs/FRONTEND_SERVICES.md` section 8, decision 40). One result/state
  pair per method; `pending` carries the call's arguments under the contract's names; input checked
  with the shared schemas before sending (`invalid_request` with the field, no request), zod's
  parsed output sent; nothing checked that depends on the role or on the server's data; codes per
  route from `docs/ARCHITECTURE.md` section 4. `src/`
  imports only `rxjs`, `rxjs/fetch`, `rxjs/operators` and `@shared-calendar/shared`; configuration
  comes through the constructor, the `SessionStore` as the second argument. Tokens live only in
  the `SessionStore` (rule 9): no result, state or service field holds one.
  The view layer (`docs/FRONTEND_ARCHITECTURE.md`; no framework): `index.html` (all the markup,
  everything `hidden`: the login `#login`; the frame `#app` with the header, an empty `nav`, the
  template of a navigation link and `main.screen`, which holds one element per screen: so far
  `#week`, `#appointments`, `#settings`, `#users` and `#availability`. `#week` has the toolbar, the failure (`role="alert"`), the banner `.moving` of an appointment
  being moved (its words `.moving-what`, the button `.keep`), the time zone's sentence, the
  legend, the hours, the days, its two native dialogs `dialog.book` (a form: what is booked, the
  part `.choices` for the Administrator with the lists `username`, `start` and `end` (labelled
  "For", "Start" and "End"), the note
  with `maxlength` 500, the failure; in its second mode it confirms a change: the elements
  marked `in-booking` are shown in the first mode only, the User's choice `.user` among them,
  those marked `in-change` in the second only, the old time `.old` among them), and its eight
  templates `tpl-legend-item`, `tpl-hour`, `tpl-day`,
  `tpl-window`, `tpl-busy`, `tpl-slot` and `tpl-appointment` (both `<button type="button">`),
  `tpl-option`. `#appointments` has the two buttons of its modes, `.upcoming` and `.history`
  (`aria-pressed`), the period's form `.period` (`novalidate`; the date fields `from` and `to`,
  "Show", the refusal), the failure, the sentence `.empty`, the list `.list` and the template
  `tpl-appointment-row` (an `<li>` holding one `<button type="button" class="row">` with the
  date, the time, the type, the note and the status). `#settings` has the read's failure
  `.unread` with "Try again", and the form `form.settings` (`novalidate`): four `.field`
  elements, each a label with its `<input type="number">` (`cancellationNoticeHours`,
  `minBookingNoticeHours`, `bookingHorizonDays`, `maxFutureAppointmentsPerUser`), the words of
  its range `.range` and its refusal `.refusal` (`role="alert"`), the last one also with the
  checkbox `noLimit`; then the time zone, the line `.last-saved`, the save's failure, "Settings
  saved." and "Save". No range is written in the page: the script sets the words and the
  fields' `min`, `max` and `step`. `#users` has the form `form.create` (`novalidate`): one
  `.field` with the text input `username` (`autocomplete="off"`, `autocapitalize="none"`,
  `spellcheck="false"`), its hint `.hint` and its refusal `.refusal` (`role="alert"`), then the
  create's failure and "Create user"; the read's failure `.unread` with "Try again", the
  sentence `.empty`, the list `.list` and the template `tpl-user-row` (an `<li>` with the
  username and one `<button type="button">` "Delete"); and its two native dialogs:
  `dialog.created` (`closedby="none"`: the Escape key does not close it; the heading, which
  takes the keyboard at the opening, the username, the password in `.password`, the sentence
  that it cannot be shown again, and the one button `.understood`, "I have noted the
  password") and `dialog.delete` (the question `.question`, the failure, "Keep" and "Delete
  user"). No pattern and no length of a username is written in the page. `#availability`
  has two parts, `section.types` and `section.patterns`, each with its form that creates
  (`form.create-type`: one `.field` with the text input `name`, its hint `.name-hint` and its
  refusal; `form.create-pattern`: six `.field` elements, the lists `weekday`, `start`, `end`
  and `typeId` and the date fields `validFrom` and `validUntil`, labelled "Weekday", "Start",
  "End", "Type", "Valid from" and "Valid until", the type's with its hint `.type-hint`, then
  the failure and the conflicts list `.conflicts`, hidden: the sentence `.conflicts-count`
  and the list `.conflicts-list`), the read's failure `.unread` with "Try again", the
  sentence `.empty` and its list (`ul.list`; `div.groups`); five templates, `tpl-type-row`
  (the name, "Rename", "Delete"), `tpl-pattern-group` (an `<h4>` and a `ul.list`),
  `tpl-pattern-row` (the time, the type, the validity, the word "ended", hidden, "Change",
  "Delete"), `tpl-conflict` (date, time, username) and `tpl-choice` (an `<option>`); and
  three native dialogs: `dialog.rename` (a form: the name field, its hint, its refusal, the
  failure, "Close", "Rename"), `dialog.change` (a form: the same six fields, the failure, the
  conflicts list, "Close", "Change") and `dialog.delete` ("Confirm the deletion": the
  question, the failure, the conflicts list, "Keep", "Delete"), which serves a type and a
  pattern. No list of the screen has a choice written in the page: the script sets them all.
  After `main.screen`, in no screen,
  `dialog#detail` (class `detail`: the fields, the note as a text in `.noted` or in the form
  `.note-form` with "Save note", `.booked`, `.hint`, the failure, "Change", "Cancel
  appointment"), which the view of the screen on show mounts. One module script `app.js`, one
  style sheet, nothing inline), `style.css` (also
  the six type colours `type-0` … `type-5`, the lanes `lane-0-of-2`, `lane-1-of-2`, the rows of
  the list with `is-booked`, `is-ended`, `is-cancelled`, `is-changed`, a field in fault
  (`.field input[aria-invalid="true"]`), the hint of a field hidden while its refusal shows,
  the rows of the users, the generated password in a fixed-width face, the availability's
  fields side by side while there is room, its rows (a pattern's is a grid, `is-ended` for one
  whose validity is over) and its conflicts list, the dialogs and the focus ring; a new class of the page is looked for in the style sheet first: the tests apply
  no style, and `dialog .noted` once hid a button that had taken that name; a class of the page must not hold the word `admin`: the shell's test looks
  for that name in the whole document after a sign-out),
  `src/main.ts` (the bundle's entry, one statement: the only file that knows the three constants
  `API_URL`, `COGNITO_URL`, `CLIENT_ID`, which esbuild's `define` puts in), `src/views/`:
  `shell.ts` (`runShell(config)` creates the `SessionStore`, the `LoginService` and the
  `RefreshService`, starts the refresh and calls `mountShell(root, { config, store, login })`,
  which shows the login on `null` and the frame on a session, reduced to `Person` = username and
  role before anything else sees it; `distinctUntilChanged` on the two, so a refresh mounts
  nothing and loads nothing; `enter(person)` fills the header, creates the session's objects
  (`sessionObjects`: the role, a new `CalendarService`, `AppointmentsService`, `UsersService`,
  `CalendarSettingsService`, `AvailabilityTypesService`, `AvailabilityRulesService`,
  `WeekScreen`, `AppointmentsScreen`, `SettingsScreen`, `UsersScreen` and
  `AvailabilityScreen` per
  person, dropped when the person leaves, and the stream of the page becoming visible, from the document's
  `visibilitychange`, handed to the week, the list, the users and the availability screens), fills the navigation from the table `SCREENS` (an
  entry: `hash`, `label`, `roles`, `element`, `show`, which mounts the view and then starts its
  logic object; five entries so far, `#/week` for both roles, `#/appointments`, "My
  appointments", for a User only, whose `show` also hands the view `showWeek`, a function that
  sets the address to the week's, and `#/settings`, "Settings", `#/users`, "Users", and
  `#/availability`, "Availability", for the Administrator only; `mountShell` takes another table as the optional `screens`,
  for its test) and
  follows the URL's hash (`fromEvent(window, 'hashchange')` from the current hash): an empty,
  unknown or forbidden hash shows the role's first screen and the address is put right with
  `history.replaceState`, the link on show carries `aria-current="page"`, a change of hash
  leaves one screen and mounts the next; "Sign out" only clears the store and leaves the
  address), `login.view.ts` (`mountLogin(root, login)`, with `LoginDeps`, the part of the service
  it uses; a failure is shown through `failureText(reason)`, never the service's `message`) and
  `detail.view.ts` (`mountDetail(root, { detail, appointments, change })`, with `DetailDeps`:
  how the screen answers the detail of an appointment by its id, the parts of the
  `AppointmentsService` for the note and the cancellation, and what "Change" does on that
  screen; it wires `dialog#detail` and returns `{ subscription, open }`: the view of the screen
  on show mounts it, calls `open(appointmentId)` and ends it with its own subscription; which
  appointment is shown and an "asked" for each of its two actions are local variables),
  `appointments.view.ts` (`mountAppointments(root, { screen, appointments, showWeek })`, with
  `AppointmentsDeps`: of the `AppointmentsScreen` `list$`, `upcoming`, `history`, `show`,
  `detail` and `move`; it redraws the rows only when the list object changed and sets the two
  dates only when the period object changed; a row opens the detail; "Change" there calls
  `screen.move(appointmentId)`, then `showWeek()`),
  `settings.view.ts` (`mountSettings(root, screen)`, with `SettingsDeps`: of the
  `SettingsScreen` `settings$`, `save`, `edited` and `retry`; it sets the ranges at the mount,
  fills the form only when the fields object changed, sends the fields as text at "Save",
  tells of an edit from the form's `input` and the checkbox's `change`, and at every
  notification shows or clears each field's refusal and `aria-invalid`; "No limit" disabling
  its number field is its one pure view action),
  `users.view.ts` (`mountUsers(root, { screen, users })`, with `UsersDeps`: of the
  `UsersScreen` `users$`, `create` and `retry`; of the `UsersService` `createUserState$`,
  `deleteUser` and `deleteUserState$`; it sets the hint under the field at the mount, sends
  the field as text at "Create user", redraws the rows only when the list object changed and
  empties the field only when the field object changed; **the generated password** is taken
  from `createUserState$`, for a create asked for from this mount only, put in one element
  with `textContent` when `dialog.created` opens, and taken out by the dialog's button and by
  the teardown, never by a `close` handler; the `cancel` event of that dialog is refused; a
  row's "Delete" opens `dialog.delete`, whose "Delete user" calls the service and which shows
  a failure and stays open, with whom it is about and an "asked" as local variables and no
  `close` handler),
  `availability.view.ts` (`mountAvailability(root, { screen, types, rules })`, with
  `AvailabilityDeps`: of the `AvailabilityScreen` `availability$`, `createType`, `rename`,
  `createPattern`, `change`, `retryTypes`, `retryPatterns` and `conflicts`; of the
  `AvailabilityTypesService` `remove` and `removeState$`; of the `AvailabilityRulesService`
  `deletePattern` and `deletePatternState$`. Its four forms (the two that create, the two
  dialogs) have one shape and are kept by the names of their outcomes in the stream,
  `typeCreate`, `rename`, `patternCreate`, `change`; it sets the choices of the weekday and
  of the two times and the hint of a name at the mount, sends a form's fields as text,
  redraws a list only when its object changed, fills a form that creates only when its
  fields object changed, and rebuilds the choices of the type only when theirs changed,
  putting back what was chosen (a chosen type that is gone leaves none chosen). A form that
  creates shows its outcome as it is; **a dialog shows an outcome only when it asked since
  it opened and the outcome's `about` is the id the dialog is about**, and closes when it is
  done. A row's "Rename" and "Change" open their dialog with the row's values; a row's
  "Delete" opens the one `dialog.delete`, whose button calls `types.remove` or
  `rules.deletePattern` by what the dialog is about and which listens to the state of that
  kind only. The conflicts list is drawn in the form that creates a pattern and in the
  change dialog from the stream, in the delete dialog from `screen.conflicts(…)` of the
  failure's list. No dialog has a `close` handler) and
  `week.view.ts` (`mountWeek(root, { screen, appointments, users, role })`, with `WeekDeps`: the
  parts it uses of the `WeekScreen` (`week$`, the three changes of week, `detail`, `move`,
  `keep`), of the `AppointmentsService` (`book`, `cancel`, `change`, `updateNote` and their
  state streams) and of the `UsersService` (`listUsers` and its state stream), and the role;
  copies the templates, sets `top` and `height` as properties and the lane and the type colour
  as classes, redraws the days only when the week object changed; it mounts the detail dialog
  with `screen.detail` and `screen.move`; a slot opens the book dialog, an appointment its
  detail, in which the note is saved and which can cancel it or start its move; while `week$` carries a move the banner shows, every appointment's button is disabled
  and a slot opens the book dialog as the confirmation of the change, with no list of users
  asked for; what the open book dialog is about (also the move it confirms) and
  whether its action was asked for since it opened are local variables, a result is shown only
  in the dialog that asked for it and, in the book dialog, only in the mode that asked, an
  opening resets the form and replaces what the dialog is about, a close does nothing (no
  dialog has a `close` handler: a browser sends that event after the close, perhaps after the
  next opening), a week that arrives behind an open dialog
  leaves it as it is: `docs/FRONTEND_ARCHITECTURE.md` section 4). A view is
  `mount<Name>(root, deps): Subscription` with a teardown that wipes what it put in the page.
  The logic layer, `src/logic/` (`docs/FRONTEND_ARCHITECTURE.md` section 5.1; no DOM, lint
  refuses `document` and `window` there): `texts.ts` (pure: `dateText`, `timeText`, `rangeText`,
  `dateTimeText`, `weekLabel`, `offsetText`, `offsetChangesOn`, all through `shared/`'s time
  helpers and the zone given, never the browser's; `failureText(reason)`, the failure in plain
  words, with one general sentence for a reason it does not know: a new route's codes get their
  sentences here; it has those of the login, of `GET /calendar`, of a booking, of a cancellation,
  of a change, of a note and of the list of users, which also cover the list of appointments and
  the read and the save of the settings, those of a user created and deleted
  (`user_exists`, `cannot_delete_admin`) and those of the availability (`type_name_exists`,
  `type_in_use`, `type_not_found`, `pattern_not_found`, `availability_overlap`,
  `availability_conflict`, `limit_reached`); its optional second argument says what was
  attempted, for the reasons whose words depend on it: `cancellation_notice_too_short` and
  `appointment_limit_reached` after `'change'`, `limit_reached` after `'type'` and after
  `'pattern'`, with the numbers of `CALENDAR_LIMITS`; and `longDateText`, a date with its
  year, "20 November 2026"), `week.model.ts` (pure:
  `weekModel(view, role)`, the week ready to draw: days of windows, slots, busy blocks and
  appointments, each with `top`, `height`, `time`, `lane` and `lanes`; a slot also with its
  `start`, `end`, `day`, `typeName` and the instants of its `window` (through `shared/`'s
  `effectiveWindows`), an appointment with its `appointmentId`; the hours shown, 08:00 to
  18:00 widened to hold everything; the legend; `colourOf(typeId)`, 0 to 5; on a day whose UTC
  offset changes every time carries its offset, and two blocks of one kind in the same place on
  the clock get lanes 0 and 1 of 2) , `booking.ts` (pure, for the book dialog: `bookingText(slot)`;
  `timeChoice(slot, zone)`, the Administrator's local times on the 15-minute grid over the
  slot's window; `userChoice(state)`, the names, the message and "ready" from the state of
  `listUsers`; `bookingFor(slot, zone, role, fields)`, the argument of `book`: a User sends the
  start and the note only, the Administrator the User and both instants, the slot's own while
  the times were not changed; `changeFor(slot, zone, role, fields)`, the argument of `change`
  when the dialog confirms a move: the same times, never a `username`, and the note always, as
  the field holds it), `appointment.detail.ts` (pure:
  `appointmentDetail(appointment, role, now, zone)`, the detail dialog's texts, the note as a
  text (`note`) and as a field's value (`noteValue`), `canEditNote`, `canChange`, `canCancel`
  and the one sentence, which says first what the appointment is (moved to another time,
  cancelled, ended) and, for one still to end, until when a User can change or cancel it; `movingOf(detail, role)`, the `Moving`
  copy in words of an appointment being moved: `appointmentId`, `when`, `what`, `note`),
  `appointments.model.ts` (pure, for "My appointments": `appointmentRows(appointments, now,
  zone)`, a row per appointment in the order given, with `date`, `time`, `typeName`, `note`,
  `kind` (`booked`, `ended`, `cancelled`, `changed`) and `status`, its words; `emptyText(mode)`;
  `defaultPeriod(now, zone)`, the 30 days that end today; `periodRefusal(from, to)`, the
  period's own checks with `CALENDAR_LIMITS.appointmentListDays`),
  `appointments.screen.ts` (`AppointmentsScreen(settings, appointments, week, role, now,
  visible$)`: `list$` = mode, period, loading, failure, refusal, rows, empty; `start()`,
  `upcoming()`, `history()`, `show(from, to)`, `detail(appointmentId)`, `move(appointmentId)`;
  each `start()` reads the settings for the calendar's time zone, then lists; the mode and the
  period last as long as the object, the zone and the list end with the subscription of
  `start()`; another mode or period forgets the list on show; it loads its list again at every
  result of `cancelResult$` and `updateNoteResult$` and at every notification of `visible$`,
  not for a result already there at `start()`; `move` hands the appointment's `Moving` copy and
  its date over to the `WeekScreen`),
  `settings.model.ts` (pure, for the settings form: `SETTING_FIELDS`, the four names in the
  form's order; `settingsFields(settings)`, the four values as text and `noLimit`;
  `settingsInfo(settings)`, the time zone and the line about the last save, in the calendar's
  zone; `settingRange(field)`, `min`, `max` and the words, from `SETTINGS_RANGES`;
  `settingsFor(fields)`, the body of the save or the refusals, one sentence per field in
  fault: a value is accepted when written with digits only, spaces aside, and inside its
  range),
  `settings.screen.ts` (`SettingsScreen(settings)`: `settings$` = loading, unread, fields,
  info, saving, refusals, failure, saved; `start()`, `retry()`, `save(fields)`, `edited()`;
  `start()` reads the settings; `save` checks the fields and calls `update` only when none is
  in fault; after every result of a save it reads again; `fields` becomes another object only
  at the first read and after a save that succeeded, so what was typed stays after a failure;
  no result that was there before `start()` is taken),
  `users.model.ts` (pure, for the users screen: `userRows(users)`, a row per user in the
  order given, with `username` and `deleteLabel`, the name of its button for a screen reader;
  `NO_USERS`, the sentence of an empty list; `USERNAME_HINT`, what a username is, both the
  hint under the field and its refusal; `usernameFor(text)`, the username to create, spaces
  around it removed, or the refusal, decided by the shared `Username` schema and nothing
  else; `deleteQuestion(username)`, the words of the delete dialog),
  `users.screen.ts` (`UsersScreen(users, visible$)`: `users$` = loading, unread, rows, empty,
  field, creating, refusal, failure, created; `start()`, `retry()`, `create(text)`; `start()`
  reads the list; `create` checks the text and calls `createUser` only when it is accepted;
  the list is read again at every result of a create and of a delete, a failure included,
  and at every notification of `visible$`, not for a result already there at `start()`; a
  read that fails takes the list away; the same users read again keep the same `rows`
  object; `field` becomes another object only after a create that succeeded; **no password
  passes through it**: it reads a create's result as `CreateOutcome`, a type that does not
  name one),
  `availability.model.ts` (pure, for the availability screen: `typeRows(types)`, a row per
  type in the order given, with `renameLabel` and `deleteLabel`; `NO_TYPES`;
  `TYPE_NAME_HINT`, what a name is, both the hint and the refusal, its number from
  `CALENDAR_LIMITS.typeNameLength`; `typeNameFor(text)`, the name, spaces around it removed,
  or the refusal, decided by the shared `TypeName` schema; `deleteTypeQuestion(row)`;
  `WEEKDAY_CHOICES`, `START_CHOICES` (00:00 to 23:45), `END_CHOICES` (00:15 to 24:00) and
  `typeChoices(types)`, the choices of the pattern form's lists as `{ value, label }`;
  `NO_TYPE_YET`; `PATTERN_FIELDS`, the six names in the form's order; `startingFields(today)`,
  Monday, 09:00 to 10:00, no type, valid from today; `patternFields(pattern)`, a pattern's
  fields as text; `patternFor(fields)`, the body of a create or of a change, or the refusals,
  one sentence per field in fault that starts with the words of its label: the end not after
  the start, no type, "valid from" not a date, "valid until" not a date or before "valid
  from"; `patternGroups(patterns, types, today)`, the groups Monday to Sunday, an empty
  weekday left out, a group by start, end and "valid from", a row with `time` ("09:00 –
  13:00"), `typeName` (joined from the types, `UNKNOWN_TYPE` when they do not hold it),
  `validity`, `ended` (the validity ended before today; one that ends today has not),
  `what`, `changeLabel`, `deleteLabel` and `fields`; `NO_PATTERNS`;
  `deletePatternQuestion(row)`),
  `conflicts.ts` (pure: `conflictList(conflicts, zone)`, the appointments in the way of a
  refused change of availability, by start and then by username, each with `date`, `time`
  (the offsets on a day the clocks change) and `username`, under the sentence that counts
  them; `null` for no list and for an empty one; personal data, for the page only),
  `availability.screen.ts` (`AvailabilityScreen(settings, types, rules, now, visible$)`:
  `availability$` = loading, typesUnread, types, typesEmpty, patternsUnread, groups,
  patternsEmpty, choices, typeHint, typeField, patternFields and the four outcomes
  `typeCreate`, `rename`, `patternCreate`, `change`, each an `Ask`: `about` (the id it was
  asked for, empty for a create), `busy`, `refusals`, `failure`, `conflicts`, `done`;
  `start()`, `retryTypes()`, `retryPatterns()`, `createType(text)`, `rename(typeId, text)`,
  `createPattern(fields)`, `change(patternId, fields)`, `conflicts(list)`; `start()` reads
  the settings, for the calendar's time zone, the types and the patterns at once; the
  patterns are listed once both they and the zone are known; each list fails and is tried
  again by itself, and one that could not be read again is taken off, while the types as
  last read stay as the choices and as the names in the patterns' rows; the same lists read
  again keep the same objects; a write is checked and its call made only when nothing is in
  fault; **while a write of a kind is under way another of that kind is not taken**; the
  types are read again at every result of a create, a rename and a delete of a type, the
  patterns at every result of a create, a change and a delete of a pattern, a failure
  included, the types too when a pattern's write answers `type_not_found`, and both at every
  notification of `visible$`, not for a result already there at `start()`; `typeField`
  becomes another object after a create that succeeded, `patternFields` then too and when
  the settings first say the zone; the two deletes are the view's to call) and
  `week.screen.ts`
  (`WeekScreen(calendar, appointments, role, now, visible$)`: `week$` = label, loading, failure,
  the last week loaded, and `moving`, the appointment being moved or `null`; `start()`,
  `previous()`, `next()`, `today()`, `detail(appointmentId)`, `move(appointmentId)`,
  `handOver(moving, date)`, `keep()`;
  "now" is passed in, and "today" for the week to open on is taken in `DEFAULT_TIME_ZONE`, the
  one place the default zone is used; between `start()` and the end of its subscription it
  calls `calendar.reload()` at every result of `bookResult$`, `cancelResult$`,
  `updateNoteResult$` and `changeResult$`, a failure included, and at every notification of
  `visible$`, but not for a result that was already there at `start()`; a move ends at a
  change's success, at `keep()` and at the end of that subscription, never at a refusal; an
  appointment handed over by the list screen is taken once, at the next `start()` or at once
  when started: its week is loaded and it is being moved). `scripts/` (Node, outside the browser's lint rules): `bundle.mjs` (the
  esbuild options the two share), `build.mjs`, `dev.mjs`, `seed-local.mjs`.
  `tests/unit/logic/` (project `unit`): `zone.ts`, `fixtures.ts`, `texts.test.ts`,
  `week.model.test.ts`, `booking.test.ts`, `appointment.detail.test.ts`, `week.screen.test.ts`,
  `appointments.model.test.ts`, `appointments.screen.test.ts`, `settings.model.test.ts`,
  `settings.screen.test.ts`, `users.model.test.ts`, `users.screen.test.ts`,
  `availability.model.test.ts`, `conflicts.test.ts`, `availability.screen.test.ts`. `tests/unit/views/` (project `views`): `page.ts`
  (`useRealPage()`, `find`, `submit`), `page.test.ts`, `login.view.test.ts`,
  `week.view.test.ts`, `detail.view.test.ts`, `appointments.view.test.ts`,
  `settings.view.test.ts`, `users.view.test.ts`, `availability.view.test.ts`, `shell.test.ts`. No `template.yaml` yet: the hosting
  waits for the open points of `docs/FRONTEND_ARCHITECTURE.md` section 10.
- `shared/`: package `@shared-calendar/shared`, no build step (`exports` points at
  `src/index.ts`; each consumer bundles it). `src/api.ts` (response and error body types,
  `ApiErrorCode`), `src/roles.ts` (`Role`, `resolveRole`), `src/username.ts` (the username
  pattern and zod schemas), `src/calendar/` (the shared calendar, plan steps 41–42: `time.ts`, the
  time-zone helpers with `Intl` only, never the machine's zone; `schemas.ts`, the zod schemas:
  primitives, request bodies, path and query parameters; `types.ts`, the response and event types;
  `rules.ts`, the pure rules: defined and effective windows, slots, overlap, grids,
  `cancellableUntil`; `defaults.ts`, default settings, limits and settings ranges), `src/index.ts`
  (re-exports); `tests/` mirrors `src/`.
- Generated, git-ignored: root `node_modules/`; in `backend/`: `env.local.json`, `.cognito/`,
  `.aws-sam/`, `.verify-ok`, `coverage/`; `shared/coverage/`; `frontend/coverage/`,
  `frontend/dist/`.

## Test conventions

- vitest with globals enabled (`describe`, `it`, `expect` need no import).
- `backend/vitest.config.ts` has two projects: `unit` (`tests/unit/**/*.test.ts`) and
  `integration` (`tests/integration/**/*.test.ts`). The integration project only
  selects files when `RUN_INTEGRATION=1`; otherwise it runs nothing and exits 0.
- `shared/vitest.config.ts`: one project (`tests/**/*.test.ts`), 100 % line coverage on `src/`.
  Tests of the contract itself (what a schema accepts, `resolveRole`) live there; the back end
  tests what it does with it (the 400 answer, the handlers).
- Unit tests mock AWS with `aws-sdk-client-mock`, never real endpoints.
- `frontend/vitest.config.ts`: projects `unit` and `integration` like the back end (integration
  selects files only with `RUN_INTEGRATION=1`), and `views` (`tests/unit/views/**`, environment
  `happy-dom`; `unit` stays in node and does not select that folder); `test:unit` runs `unit` and
  `views` with 100 % line coverage on `src/` (`src/main.ts` left out by name), `test:integration`
  runs `integration`, as in the back end.
  Unit tests stub `fetch` with `vi.stubGlobal` and real `Response` objects, no network, and use a
  service as a consumer would: subscribe first, then call. Tests that fake timers must fake
  `setInterval` too (RxJS's `timer` uses it), and keep test sessions within 24.8 days of the clock
  (the store's expiry `setTimeout` overflows beyond). vitest's types pull in `@types/node`,
  so the compiler does not stop a Node import in `frontend/src`; ESLint does (root
  `eslint.config.js`: only `rxjs`, `rxjs/fetch`, `rxjs/operators`, `@shared-calendar/shared` and
  relative imports, no Node globals). A new allowed import there is a design change.
- The views' tests (`docs/FRONTEND_ARCHITECTURE.md` sections 8 and 12.3): every file calls
  `useRealPage()` (`tests/unit/views/page.ts`), which loads the `<body>` of the real
  `frontend/index.html` before each test; no test writes markup of its own, so a selector that
  does not match the page fails. The mount function gets fake services: plain objects typed with
  the view's `…Deps`, whose streams are subjects the test controls and whose methods are `vi.fn`.
  The shell's test uses the real `SessionStore` (memory only). Every view's test has: each state
  of each stream, each action of the user and its call, a text with `<script>` shown as text, and
  nothing left in the page after unsubscribing. Under `happy-dom`, `import.meta.url` is not a
  `file:` URL (use `import.meta.dirname`), parsing a whole page with `DOMParser` tries to load its
  style sheet (use a `<template>`, as `pageAside()` does), and the native `<dialog>` has no Escape
  key, no inertness and no focus handling: those are for the browser check. A dialog's test
  calls `close()` for the Escape key; since a click passes through a modal dialog there, a test
  can have both dialogs open, which a person cannot. A `disabled` button's `click()` does
  nothing there, as in a browser. The fake `WeekScreen` of the view's test moves nothing by
  itself: a test starts a move by sending a state with `moving` through `week$`. The detail
  dialog's cases are in `detail.view.test.ts` and run three times (`describe.each`): mounted
  alone, by the week view and by the list's view; a new case of the dialog goes there, and the
  two views' tests keep only what is theirs (which appointment is opened, what "Change" does).
  A native date field's `value` is set and read as `YYYY-MM-DD` and emptied by `form.reset()`;
  what can be typed into it is for the browser check. A test that looks in the whole document
  (`outerHTML`) for what a person left behind looks for data, not for fixed words of the page:
  the comments of `index.html` are in it. A number field's `value` is set and read as text (a
  text that is not a number reads back empty); a checkbox's `click()` sends `change` but no
  `input` event there, so a test of an edit typed into a field sends `input` itself; a
  checkbox's `value` is always "on", so a test that reads every field of the page reads a
  checkbox by `checked` (the shell's test has `held(field)` for that). The page's fixed texts
  are in the frame's `textContent` also while hidden, so a test never looks there for a word
  the page may hold: the shell's test of a second person compares the whole page (its source
  and what every field holds, the clock standing still) with the page that person finds when
  nobody was there before. **A generated password in a test** is a made-up text, in the
  views' and the shell's tests only (the logic's fixtures hold none, and no test takes a
  snapshot); "nowhere in the document" is looked for in the whole `outerHTML`, in every
  field's value and in the address. `happy-dom` has no `cancel` event, ignores `closedby`
  and `autofocus`, and sends `close` inside `close()`: a test sends `cancel` itself to see it
  refused, and sends a `close` event itself after an opening to stand for the browser's late
  one; that Escape does not close the password dialog, and where the keyboard lands, are for
  the browser check. **A list (`<select>`) in a test**: set to a value none of its choices
  has, it reads back empty with `selectedIndex` −1, as in a browser, which is how the
  availability's forms have no type chosen; rebuilt with `replaceChildren`, and after
  `form.reset()`, it has its first choice chosen. The `textContent` of a `<label>` around a
  list holds the texts of the list's choices: a test that reads a label's words reads its
  first text node. A test helper that puts a screen's id before a selector scopes only the
  first part of a list of selectors (`#availability li, option` is every `<option>` of the
  page): count what a view left behind from the screen's element. The availability view's
  test hands the mount function a fake screen whose `conflicts` is a `vi.fn` that makes the
  rows in the calendar's zone of the test. Where the keyboard is after a dialog closes (on
  nothing, after a write that redrew the list) is for the browser check. An
  appointment id in a test that reaches a
  real service must be a ULID (the fixtures' `appt-…` ids are refused before any request);
  so must a type's and a pattern's id in the shell's test of the availability. The
  shell's test of the tab becoming visible defines `visibilityState` on the document and sends
  `visibilitychange` itself, and removes the property after each test.
- Two more ESLint rules on the front end (root `eslint.config.js`): no `innerHTML`, `outerHTML` or
  `insertAdjacentHTML` anywhere in `frontend/src`; no global `document` or `window` in
  `frontend/src/services` and `frontend/src/logic` (a parameter with that name is allowed). The
  second block repeats the Node globals, because a later `no-restricted-globals` for the same
  files replaces the earlier list.
- The logic layer's tests (`frontend/tests/unit/logic/`, project `unit`, in node, no DOM): fake
  services (plain objects: a subject for the stream, `vi.fn` for the methods; a
  `ReplaySubject(1)` for a result stream, which replays as the real one does) and a fixed "now"
  handed to the object under test, never a faked clock. Every file calls `useFarBrowserZone()`
  (`tests/unit/logic/zone.ts`) first: it sets `process.env.TZ` to `Pacific/Kiritimati` (UTC+14)
  and adds a test that the setting took, so a date or a time read in the machine's own zone is a
  wrong result. It relies on each test file running in a process of its own (vitest's default
  pool, `forks`). Calendar views for these tests and for the shell's come from
  `tests/unit/logic/fixtures.ts` (`view(monday, …)`, `appointment(…)`, `winterWeek()`). Cases to
  keep when the model changes: Rome in winter and in summer, a half-hour zone, the weeks of
  2027-10-31 (clocks back) and 2027-03-28 (forward), a window ending at 24:00, an empty week,
  the hours widened, both roles.
- The shell's test stubs the global `fetch` for the whole file (unanswered unless a test answers
  it): entering the frame creates the real `CalendarService`, which loads the week, and the real
  `AppointmentsService`, `UsersService`, `CalendarSettingsService`, `AvailabilityTypesService`
  and `AvailabilityRulesService`, which a test reaches
  through the two dialogs, the list (on `#/appointments` the first request is the settings,
  the second the list: answer them in that order), the settings (one `GET`; after a `PUT`
  another `GET`), the users (one `GET /users`; after a `POST` or a `DELETE` another) and the
  availability (on `#/availability` three requests, in this order: the settings, the types,
  the patterns; after a write to a type another `GET /calendar/types`, after a write to a
  pattern another `GET /calendar/patterns`). It resets
  the emulated page's hash before each test. `happy-dom` sends a `hashchange` on
  `history.replaceState` too, which a browser does not: harmless for the shell
  (`distinctUntilChanged` on the screen), but do not build on it.
