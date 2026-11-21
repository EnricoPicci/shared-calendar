# Commands and the local stack

The complete list of the repository's commands, with the notes that go with each one: what it
needs, what it leaves behind, and what to do when the local stack misbehaves. `CLAUDE.md`
("Everyday commands") holds the short list; `README.md` ("Commands") the newcomer's table;
`docs/RUNBOOK.md` what the operator does, in order. This document is the reference behind the
three. It is not a source of truth for behaviour: on any conflict `docs/ARCHITECTURE.md` and
the scripts themselves win, and this document is fixed.

---

## 1. Before any command

- Node 22 is pinned in `.nvmrc`; run `nvm use` first (the machine default may be newer).
- `npm ci` (or `npm install`) at the root installs every package into one root `node_modules/`
  with one `package-lock.json`. Never run `npm install` inside `backend/` or `shared/`.
- Commands run from the repository root. Back-end scripts take `-w backend`, with `--` before
  their own arguments (`npm run smoke -w backend -- local`); from inside `backend/` the plain
  form works the same. Paths below without a folder are relative to `backend/`.
- The shell is zsh: `set -- $var` does not word-split. Pass arguments explicitly.
- `DYNAMODB_PORT=8002` is set when another project holds port 8000 (as on the machine this was
  written on). Whatever the value, the same one goes to `local:up`, `verify`, `smoke` and the
  back end's integration tests.

## 2. Checks that need no Docker

- `npm run typecheck`, `npm run lint`, `npm run test:unit` at the root: every package (`shared`,
  `backend` and `frontend`), each with its own coverage threshold.
- `npm run typecheck -w backend`: `tsc --noEmit` over `src/`, `tests/` and the config files
  (`-w @shared-calendar/shared` for the shared package, which has no Node types).
- `npm run lint -w backend`: ESLint with the root flat config (`typescript-eslint` recommended,
  plus the comment rule `local/doc-references`), then `scripts/check-doc-references.mjs` on the
  `#` comments under `backend/` (`CLAUDE.md`, "Comments"). The root `npm run lint` does the same
  over the whole repository.
- `npm run test:unit -w backend`: vitest project `unit`. Runs with v8 coverage and fails below
  100 % line coverage on `src/lib` (HTML report in `coverage/`, git-ignored). `shared/` has the
  same 100 % threshold on `shared/src`.
- `npm run typecheck -w frontend`, `npm run lint -w frontend`, `npm run test:unit -w frontend`
  (the vitest projects `unit`, in node, and `views`, in `happy-dom`, with one coverage report:
  100 % line coverage on `frontend/src`, only `src/main.ts` left out), `npm run verify -w frontend`
  (the three in order, stops at the first failure).
- `npm run audit -w backend`: `npm audit --audit-level=high` (covers the whole repository: one
  lock file).
- `sam validate --lint` (inside `backend/`): checks `template.yaml`.

## 3. The local stack

- `npm run local:up -w backend`: starts DynamoDB Local, dynamodb-admin (http://localhost:8001),
  cognito-local and the fake Claude, then seeds them (tables `hello-messages`, `calendar` and `assistant`, the last two empty;
  pool, client, groups, users `admin` / `Admin-Local-Pass-1!` and `alice` /
  `Alice-Local-Pass-1!`) and writes `env.local.json`. Idempotent; rerun it after a change to
  `local-seed.sh`. Its last line but one says which Claude it wired: the fake, or the real one
  when `ANTHROPIC_API_KEY` is set in the shell (section 3.4).
- `npm run local:api -w backend`: builds and serves the API on http://127.0.0.1:3000
  (foreground). Ready in about 11 s, build included.
- `npm run local:down -w backend`: stops the stack. The table is in memory and is lost; Cognito
  data survives in `backend/.cognito/`.
- `npm run build -w backend`: `sam build`. Always go through npm: SAM needs the repository's
  `esbuild` on the PATH and `SAM_CLI_BETA_NODEJS_MONOREPO=1`, which the script sets. Without the
  beta, building in source runs `npm update --omit dev` per function, which strips the root's
  dev tools (`docs/FOLDER_STRUCTURE.md` section 4.3; repair with `npm ci` at the root). The beta
  needs SAM CLI ≥ 1.171.0 (older ones ignore it): the script and `local-api.sh` run
  `scripts/check-sam.sh` first, which refuses an older SAM.
- After `npm run build -w backend`, restart `npm run local:api -w backend`: it is not certain
  that the warm containers pick up the rebuilt code on their own.

### 3.1 What differs from the cloud

- The local functions run on the machine's CPU type: `local-api.sh` passes
  `FunctionArchitecture=x86_64` on x86 machines (the cloud stays `arm64`, the template default).
- Under `sam local`, every event carries the same fake `requestContext.requestId`, so identical
  request ids in local logs are expected. In the cloud they are unique.
- cognito-local does not implement `AdminUserGlobalSignOut`. `env.local.json` sets
  `SKIP_GLOBAL_SIGN_OUT=true` for `DeleteUserFunction` so local deletes work; the cloud never
  sets it (`docs/ARCHITECTURE.md` section 8, note on Cognito emulation).
- The tables are plain `calendar`, `hello-messages` and `assistant`; in the cloud they carry the
  stack's name (`shared-calendar-api-calendar`, `shared-calendar-api-hello-messages`; the
  assistant's table is in the template and not deployed yet).
- The `assistant` table has its time to live on `expiresAt`, as in the cloud, but DynamoDB Local
  may never delete an expired item: old conversations stay visible in dynamodb-admin. The code
  does not depend on the deletion (`docs/ARCHITECTURE.md` section 5.4).

### 3.2 The calendar's variables

Every calendar function declares `CALENDAR_TABLE`, `CALENDAR_TIME_ZONE` and `DYNAMODB_ENDPOINT`
in `template.yaml`. `env.local.json` sets `CALENDAR_TABLE` and `DYNAMODB_ENDPOINT` once, in its
`Parameters` section, which `sam local` applies to every function declaring the variable: a new
calendar function needs no seed line, unless it also calls Cognito (`BookAppointmentFunction`
has its own section with `USER_POOL_ID`, `COGNITO_ENDPOINT` and the dummy credentials, like
`CreateUserFunction`; `DeleteUserFunction` declares the calendar variables too and keeps its own
section; `ListUsersFunction` has a section of its own and no calendar variable).
`CALENDAR_TIME_ZONE` is deliberately not in the file (a value there would win over the
template): it comes from the parameter `CalendarTimeZone` (default `Europe/Rome`). An invalid
zone makes every calendar request answer 500.

`env.local.json` also sets, in `Parameters`, what the assistant's functions declare:
`ASSISTANT_TABLE` (and the `DYNAMODB_ENDPOINT` above), the two variables of section 3.4, and two
settings only the local stack makes (`docs/ARCHITECTURE.md` section 8):

- `ASSISTANT_DAILY_MESSAGE_LIMIT`: **10 messages a person a day**, not the template's 30, so
  that a journey can reach the limit. For a long session by hand:
  `ASSISTANT_DAILY_MESSAGE_LIMIT=30 DYNAMODB_PORT=8002 npm run local:up -w backend`, then restart
  `local:api`. `local:up` says the value on its last line but two. The count is per person and
  per day and is never reset: when `alice` has used hers, wait for tomorrow or raise the limit.
- `ASSISTANT_BUDGET_MEMORY_SECONDS`: 0, so that a spending limit answered by the fake Claude is
  not remembered for ten minutes by the function.

### 3.3 When the local stack misbehaves

- **GitHub Codespaces.** The legacy iptables `FORWARD` chain drops traffic between containers on
  `shared-calendar-local` (the authorizer then times out fetching
  `http://cognito:9229/…/jwks.json`). After each Codespace start, before `local:api`:
  `sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT`.
- **Raw `sam local …` with Docker Desktop** needs
  `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock` and dummy `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` (otherwise SAM tries the real, possibly expired, AWS login).
  `scripts/local-api.sh` does both.
- **Leftover Lambda containers.** `sam local` (`warm_containers = "EAGER"`) starts extra Lambda
  containers besides its warm ones and leaves them running when it stops. `local-api.sh` removes
  every container labelled `sam.cli.container.type=lambda` on the `shared-calendar-local`
  network when it exits (Ctrl-C included); the emulators are untouched. After a `kill -9` or a
  closed terminal, remove them by hand:
  `docker rm -f $(docker ps -aq --filter label=sam.cli.container.type=lambda --filter network=shared-calendar-local)`.
- **Weight.** Measured with 25 functions, three fewer than the template holds: about 1.5 GB for the whole stack (36
  containers after both packages' journeys, emulators included).
- **The runtime image.** `samconfig.toml` sets `skip_pull_image = true` for `start-api`. Without
  it every warm container's start asks Docker for the runtime image's digest at public.ecr.aws
  ("Local image is up-to-date"), several in parallel with no timeout: 6–42 s, sometimes never
  completing. Instead `local-api.sh` runs one `docker pull public.ecr.aws/lambda/nodejs:22-<arch>`
  (120 s at most); when that brings a new base it removes `…:22-rapid-<arch>` (SAM's image: base
  + Lambda emulator), which SAM then rebuilds. Registry unreachable: a warning, the local copy
  is used. A raw `sam local start-api --config-env local` skips the lookup altogether.
- **After `bootstrap-admin local`**, rerun `local:up` to restore `Admin-Local-Pass-1!`, or the
  integration tests fail.

### 3.4 Claude: the fake and the real one

- **By default `local:up` wires the fake Claude**, the service `fake-claude` of the Docker
  stack (`docs/ARCHITECTURE.md` section 8). It writes into `env.local.json`, under `Parameters`,
  `ANTHROPIC_BASE_URL` (`http://fake-claude:9230`, the fake as the Lambda containers reach it)
  and `ANTHROPIC_API_KEY` with a placeholder that is plainly not a key.
- **With `ANTHROPIC_API_KEY` set for that one command, it wires the real Claude**:
  `ANTHROPIC_API_KEY=… DYNAMODB_PORT=8002 npm run local:up -w backend`. `env.local.json` then
  holds the real key and no `ANTHROPIC_BASE_URL`. The file is git-ignored and readable by its
  owner only. The script never prints the key, and refuses one holding a character that is not
  a letter, a digit, `-` or `_`. Do not `export` the variable: **a `local:up` without it takes
  the key out of the file again**, and that is the way back to the fake.
- Either way, restart `local:api` afterwards: it reads `env.local.json` only when it starts.
- `SendAssistantMessageFunction` declares the two variables, empty, in `template.yaml`: that is
  what lets the file fill them. In the cloud they stay empty and the key comes from Parameter
  Store.
- **Talking to the assistant by hand**, with a token (`TOKEN=…`, an access token of `alice`):

  ```
  curl -s -X POST http://127.0.0.1:3000/assistant/messages -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d '{"text":"Hello, can you hear me?"}'
  curl -s -X POST http://127.0.0.1:3000/assistant/continue -H "authorization: Bearer $TOKEN"
  curl -s http://127.0.0.1:3000/assistant/conversation -H "authorization: Bearer $TOKEN"
  curl -s -X DELETE http://127.0.0.1:3000/assistant/conversation -H "authorization: Bearer $TOKEN"
  ```

  When an answer says `"status":"working"`, a step is still to do: call `continue`, again and
  again, until the status is `idle`. `continue` takes no body, is also the way on after a 503,
  and answers `409 nothing_to_continue` when no step waits.
  With the fake, only the sentences of `answers.json` get an answer of their own.
- **Asking the fake by hand**, from the host on http://localhost:9230:

  ```
  curl -s -X POST http://localhost:9230/v1/messages -H 'content-type: application/json' \
    -d '{"messages":[{"role":"user","content":"What is the date today, and which weekday is it?"}]}'
  ```

  It answers `POST /v1/messages` only. What it answers is
  `backend/tests/integration/fake-claude/answers.json`, read again at every request: a change
  to that file needs no restart. A text the file does not script gets "Fake Claude: no answer
  is scripted for this message." A sentence's entry lists one answer per step of its exchange,
  and an answer may ask for a tool. Two marks besides `{{application-line}}`: `{{date+N}}`,
  anywhere in an answer, becomes the date N days after the date the application's last line
  states (so a tool's input can name a day the journey prepared); `{{last-tool-result}}`, in a
  text, becomes the last result of a tool in the request. A step written
  `{ "once": "error-overloaded", "then": "…" }` fails the first time and answers the second
  time the same request comes: the only thing the fake remembers, lost when its container
  restarts. Its log, one line per request: `docker compose logs fake-claude`
  (in `backend/`). After a change to the script `backend/docker/fake-claude.mjs`:
  `docker compose restart fake-claude`.

## 4. The integration tests and the deploy gate

- `RUN_INTEGRATION=1 npm run test:integration -w backend`: the journeys of
  `docs/IMPLEMENTATION_PLAN.md` step 9 (`journeys.test.ts`), the calendar's
  (`calendar.test.ts`) and the assistant's (`assistant.test.ts`: against the fake Claude, with
  the throw-away accounts `chat-text`, `chat-lingua`, `chat-read`, `chat-limit`, `chat-down` and
  `chat-nobody`, removed first and last; it never empties the `calendar` table: its one block
  that reads the calendar creates the type `assistant journey` and a window 05:00–07:00 on the
  25th day from today through the API, and removes both first and last; what it
  leaves in the `assistant` table stays there, under accounts that no longer exist) against the running `local:up` +
  `local:api` stack. Pass the same
  `DYNAMODB_PORT` as `local:up`. Without `RUN_INTEGRATION=1` it runs nothing and exits 0.
  Removes a leftover `carol` before starting, so it can be rerun after a failed run. **The
  journeys refuse to start when `env.local.json` wires the real Claude** (section 3.4), every
  one of them, the calendar's too: run `local:up` without `ANTHROPIC_API_KEY`, then restart
  `local:api`. The check reads the file, which is what `local:api` was started with only if it
  was restarted after the last `local:up`. **The
  calendar journeys empty the local `calendar` table first** (helper `resetCalendarTable()`,
  which refuses any endpoint but `localhost`/`127.0.0.1`): calendar data made by hand is lost
  when they run.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend`: runs `frontend/tests/integration`
  (`login.service.test.ts`, `journeys.test.ts` and `calendar.test.ts`: the services against
  cognito-local on 9229 and the API on 3000, `docs/FRONTEND_SERVICES.md` section 14). Needs
  `local:up` + `local:api` running and, in a Codespace, the iptables rule of section 3.3.
  Without `RUN_INTEGRATION=1` it runs nothing and exits 0, like the back end's. Creates and
  removes the throw-away users `fe-journey`, `fe-calendar` and `fe-calendar-b` (removed first
  too, so it can be rerun after a failed run). `calendar.test.ts` **never resets the local
  `calendar` table**:
  - it works on top of what the back-end journeys and the smoke test leave, creates only types
    named `fe-calendar …` and items of those types on free dates from today + 330 days, and
    books only for `fe-calendar` and `fe-calendar-b`;
  - it removes it all (and an earlier failed run's) before and after, the two users first:
    deleting a user cancels its future appointments, which would otherwise block deleting their
    pattern and type;
  - its appointment blocks set the settings for their run (`bookingHorizonDays` 365,
    `minBookingNoticeHours` 0, no limit) to book about a year ahead, and it writes the settings
    back to the values it read (`updatedAt`/`updatedBy` stay changed). Until the write-back it
    keeps the values read in `frontend/tests/integration/fe-calendar-settings.local.json`
    (git-ignored), which the next run writes back first if a run was killed in between
    (`docs/FRONTEND_SERVICES.md` section 14.4);
  - appointments cannot be deleted through the API: the cancelled ones, their events and the
    two users' deleted-user markers stay in the local table as history, like the smoke test's.
- Integration files run one at a time, in both packages (`fileParallelism: false` on the
  `integration` projects): they share one `sam local`, one DynamoDB Local and one cognito-local.
  Their order is not fixed, so every file prepares its own state. Never run the back end's and
  the front end's integration tests at the same time by hand (two terminals): nothing prevents
  it.
- `DYNAMODB_PORT=8002 npm run verify -w backend`: typecheck, lint, audit, `sam validate --lint`,
  unit and integration tests (sets `RUN_INTEGRATION=1` itself), with typecheck, lint and unit
  tests also for `shared`; stops at the first failure. Needs `local:up` + `local:api` running;
  never starts them. On success writes `.verify-ok` (`<commit> <epoch> <clean|dirty>`,
  git-ignored); removes it at the start.
- The root `npm run verify` runs the back end's `verify`, then the front end's.

## 5. The front end

- `npm run dev -w frontend` (`frontend/scripts/dev.mjs`; `-- <port>` for another port than
  5173): the page on http://localhost:5173 against the local stack, foreground, for local work
  only.
  - Needs `local:up` (it reads the client id from `backend/env.local.json` and says so when the
    file is missing) and, to sign in, `local:api`.
  - Serves `/`, `/style.css` and `/app.js` (bundled by esbuild at every request: an edit shows
    after a reload of the page; an edit to `dev.mjs` itself needs a restart).
  - Passes `/api/…` on to `http://127.0.0.1:3000` and `/cognito/…` to `http://localhost:9229` so
    that the browser sees one origin (the API has no CORS), sends
    `Content-Security-Policy: default-src 'self'` with the page, listens on `127.0.0.1` only and
    never prints a request's body or headers.
  - The console's one known report is `zod`'s `eval` probe (`docs/FRONTEND_ARCHITECTURE.md`
    section 10, open point O5). A reload of the page signs out
    (`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O3).
  - In a Codespace, open the forwarded port 5173: the bundle's addresses have no host, so any
    origin works.
- Stopping a background `dev` by name: `pkill -f 'node scripts/dev[.]mjs'`, in a command that
  holds no other text matching it (a shell whose command line matches is killed too).
- `npm run seed:local -w frontend` (`frontend/scripts/seed-local.mjs`): gives the local calendar
  a week to look at, through the local API (needs `local:up` + `local:api`).
  - As `admin`: the types "Studio" and "Piscina" and 8 weekly patterns, valid for 60 days from
    today (today in the calendar's zone, read from the settings), so the dates the front end's
    integration journeys use (from today + 330 days) stay free.
  - As `alice`, for herself: up to 5 appointments on free slots of the week of today and of the
    next one, some with a note; she books only what her own `GET /calendar` offers, so the
    current settings decide, and no setting is changed.
  - It only adds; it does nothing at all when the type "Studio" exists already; it refuses any
    address but `localhost` and `127.0.0.1` (`SEED_API_URL`, `SEED_COGNITO_URL` for other local
    ports); it prints what it created, never a token or a password. Appointments cannot be
    deleted through the API.
  - **After the back end's calendar journeys the seed does nothing**: they empty the table and
    then leave their own data in it, a type named "Studio" among them. The seed's calendar comes
    back with a new stack (`local:down`, `local:up`, `local:api`: the table is in memory) and
    then `seed:local`; so the root `verify` and a walk through the pages
    (`docs/FRONTEND_WALK.md`) need a restart between them.
  - Its date arithmetic imports `shared/src/calendar/time.ts` in node (Node ≥ 22.18, type
    stripping), like the smoke test's.
- `API_URL=… COGNITO_URL=… CLIENT_ID=… npm run build -w frontend` (`frontend/scripts/build.mjs`):
  writes `frontend/dist/` (git-ignored, emptied first): `index.html`, `style.css`, `app.js`
  (minified) and `app.js.map`, and prints their sizes. The three values come from the
  environment only, never from a committed file; a missing one stops the build and is named. No
  deploy of the front end exists (hosting is `docs/FRONTEND_ARCHITECTURE.md` section 10, open
  point O1), and `backend`'s `build` is another thing (`sam build`).

## 6. The cloud and the operator's scripts

Every command of this section that names a stack acts on a real AWS account. `CLAUDE.md`
("Cloud safety") says when Claude Code may run one: only when explicitly asked.

- **The stack in use:** `shared-calendar-api` in `eu-north-1` (the organization's policy blocks
  regional services in every other region); its tables are `shared-calendar-api-calendar` and
  `shared-calendar-api-hello-messages`. The old stack `hello-world-api` stays, untouched, as the
  way back until `docs/IMPLEMENTATION_PLAN.md` step 58: nothing is deployed to it.
- **Signing in:** the operator signs in with IAM Identity Center:
  `export AWS_PROFILE=shared-calendar-admin`, and when the session expires
  `aws sso login --profile shared-calendar-admin --use-device-code` (device code: the Codespace
  has no local browser callback). The old profile `hello-admin` (SSO session `hello`) stays
  beside it until `docs/IMPLEMENTATION_PLAN.md` step 58.
- **Targets.** A stack target reads its ids from the CloudFormation outputs (read-only
  `describe-stacks`) in `samconfig.toml`'s region unless `AWS_REGION` is set. `local` uses
  `env.local.json` and dummy credentials.
- `npm run deploy -w backend`: refuses (exit 1, names the reason) unless `.verify-ok` is younger
  than 30 minutes, names HEAD and says `clean`, and the whole repository's tree is still clean
  (front-end work in progress blocks a back-end deploy too); then `npm run build` and
  `sam deploy` with the default config env. Extra arguments go to `sam deploy` (first deploy of
  a stack: `npm run deploy -w backend -- --parameter-overrides AlertEmail=<address>`; later
  deploys reuse the stored value). Never put an e-mail address in `samconfig.toml`: the repo is
  public. Refuses any argument naming the old stack `hello-world-api` (`docs/RENAME_PLAN.md`
  section 4.2: its tables would be replaced).
- `npm run bootstrap-admin -w backend -- <stack|local>`: sets the admin password (hidden prompt,
  twice, pool policy checked first). Only sets the password. Reads stdin, so
  `printf '%s\n%s\n' "$pw" "$pw" | npm run bootstrap-admin -w backend -- local` works in tests.
- `DYNAMODB_PORT=8002 npm run smoke -w backend -- <stack|local>`: journeys 3, 4, 6 and 11 of
  `docs/IMPLEMENTATION_PLAN.md` step 9 with a throw-away `smoke-<epoch>` user and, before the
  last, the calendar journey of `docs/SHARED_CALENDAR_SPEC.md` section 18.4 (a type
  `smoke-<epoch>` and a one-off window on the first free 03:00–04:00 from 50 days ahead, booked
  for the user, listed and cancelled by it, then window and type deleted; settings never
  changed); 19 checks, PASS/FAIL each. On every exit it removes the type, window and booking and
  deletes the user. Prompts for the admin password (stdin). Leaves its message rows and, in
  `calendar`, the cancelled appointment, its events and the user's deleted-user marker
  (history). Its date arithmetic imports `shared/src/calendar/time.ts` in node (Node ≥ 22.18,
  type stripping).
- `npm run budget -w backend -- <stack> [--dry-run]`: creates the 1 USD monthly budget
  `<stack>-monthly` (e-mail to the stack's `AlertEmail`) through the Budgets API. Not in
  `template.yaml`: no `AWS::Budgets::Budget` in CloudFormation in `eu-north-1`. Idempotent; no
  local target.

The rules for writing these scripts (how a password travels, what runs on both macOS and Linux)
are in `backend/CLAUDE.md`, "Writing the scripts".
