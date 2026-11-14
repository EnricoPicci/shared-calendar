# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A small serverless back end on AWS: a "Hello World" API for registered users and an
administrative API to create and delete users. TypeScript, AWS Lambda, API Gateway
(HTTP API), Amazon Cognito, DynamoDB, deployed with AWS SAM.

The repository is an npm-workspaces monorepo: the back end in `backend/`, the code it shares
with the browser front end (the API contract types, `Role`/`resolveRole`, the username schemas)
in `shared/` (package `@shared-calendar/shared`), and in `frontend/` only the browser's services
layer (`docs/FRONTEND_SERVICES.md`; the rest of the front end waits for its architecture
document). Layout and placement rules: `docs/FOLDER_STRUCTURE.md`.

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
- `npm run lint -w backend`: ESLint with the root flat config (`typescript-eslint` recommended).
- `npm run test:unit -w backend`: vitest project `unit`, no Docker needed. Runs with v8 coverage and
  fails below 100 % line coverage on `src/lib` (HTML report in `coverage/`, git-ignored).
  `shared/` has the same 100 % threshold on `shared/src`.
- `npm run typecheck -w frontend`, `npm run lint -w frontend`, `npm run test:unit -w frontend`
  (100 % line coverage on `frontend/src`), `npm run verify -w frontend` (the three in order, stops
  at the first failure; no Docker). The root `npm run verify` runs the back end's, then this.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend`: runs `frontend/tests/integration`
  (`login.service.test.ts`, and `journeys.test.ts`: the services against cognito-local on 9229
  and the API on 3000, `docs/FRONTEND_SERVICES.md` section 14). Needs `local:up` + `local:api`
  running and the Codespaces iptables rule below. Creates and removes the throw-away user
  `fe-journey` (removed first too, so it can be rerun after a failed run). Without
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
  `hello-local` (the authorizer then times out fetching `http://cognito:9229/…/jwks.json`). After
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
  `sam.cli.container.type=lambda` on the `hello-local` network when it exits (Ctrl-C included); the
  emulators are untouched. After a `kill -9` or a closed terminal, remove them by hand:
  `docker rm -f $(docker ps -aq --filter label=sam.cli.container.type=lambda --filter network=hello-local)`.
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
  public. Real cloud action: only when explicitly asked.
- `npm run bootstrap-admin -w backend -- <stack|local>`: sets the admin password (hidden prompt, twice,
  pool policy checked first). Only sets the password. Reads stdin, so
  `printf '%s\n%s\n' "$pw" "$pw" | npm run bootstrap-admin -w backend -- local` works in tests.
- `DYNAMODB_PORT=8002 npm run smoke -w backend -- <stack|local>`: journeys 3, 4, 6, 11 with a throw-away
  `smoke-<epoch>` user, PASS/FAIL per check, deletes the user on every exit. Prompts for the
  admin password (stdin). Leaves its message rows in the table (history).
- `npm run budget -w backend -- <stack> [--dry-run]`: creates the 1 USD monthly budget `<stack>-monthly`
  (e-mail to the stack's `AlertEmail`) through the Budgets API. Not in `template.yaml`: no
  `AWS::Budgets::Budget` in CloudFormation in `eu-north-1`. Idempotent; no local target.
- Stack targets read ids from the CloudFormation outputs (read-only `describe-stacks`) in
  `samconfig.toml`'s region unless `AWS_REGION` is set. `local` uses `env.local.json` and
  dummy credentials. After `bootstrap-admin local`, rerun `local:up` to restore
  `Admin-Local-Pass-1!`, or the integration tests fail.
- Cloud: stack `hello-world-api` in `eu-north-1` (the organization's policy blocks regional
  services in every other region). The operator signs in with IAM Identity Center:
  `export AWS_PROFILE=hello-admin`, and when the session expires
  `aws sso login --profile hello-admin --use-device-code` (device code: the Codespace has no
  local browser callback).
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
  `eslint.config.js`, `.nvmrc`, `docs/`, `prompts/`.
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
- `frontend/`: package `frontend`, the services layer only (exception in `docs/FOLDER_STRUCTURE.md`
  section 7). `package.json` (deps `rxjs`, `@shared-calendar/shared`; scripts `typecheck`, `lint`,
  `test:unit`, `verify`; no `dev`/`build`/`deploy` yet), `tsconfig.json` (ES2022 + DOM, no node
  types), `vitest.config.ts`, `src/services/` (`session.store.ts`; `cognito.ts` and `api.ts`, the
  building blocks the services share; `login`, `refresh`, `hello`, `users` as `<name>.service.ts`
  + `<name>.types.ts`; `jwt.ts`), `tests/unit/services/` mirroring `src/` (plus `fixtures.ts`),
  `tests/integration/` (`local.ts` helper, `login.service.test.ts`, `journeys.test.ts`). `src/`
  imports only `rxjs`, `rxjs/fetch`, `rxjs/operators` and `@shared-calendar/shared`; configuration
  comes through the constructor, the `SessionStore` as the second argument. Tokens live only in
  the `SessionStore` (rule 9): no result, state or service field holds one.
  No framework, Vite, `index.html`, `template.yaml` or `dist/` until `docs/FRONTEND_ARCHITECTURE.md`.
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
  `.aws-sam/`, `.verify-ok`, `coverage/`; `shared/coverage/`; `frontend/coverage/`.

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
  selects files only with `RUN_INTEGRATION=1`); `test:unit` runs `unit` with 100 % line coverage on
  `src/`, `test:integration` runs `integration`, as in the back end.
  Unit tests stub `fetch` with `vi.stubGlobal` and real `Response` objects, no network, and use a
  service as a consumer would: subscribe first, then call. Tests that fake timers must fake
  `setInterval` too (RxJS's `timer` uses it), and keep test sessions within 24.8 days of the clock
  (the store's expiry `setTimeout` overflows beyond). vitest's types pull in `@types/node`,
  so the compiler does not stop a Node import in `frontend/src`; ESLint does (root
  `eslint.config.js`: only `rxjs`, `rxjs/fetch`, `rxjs/operators`, `@shared-calendar/shared` and
  relative imports, no Node globals). A new allowed import there is a design change.
