# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A small serverless back end on AWS: a "Hello World" API for registered users and an
administrative API to create and delete users. TypeScript, AWS Lambda, API Gateway
(HTTP API), Amazon Cognito, DynamoDB, deployed with AWS SAM.

## Where the truth lives

- `docs/ARCHITECTURE.md` defines the behaviour, the API contract, the data model and
  the security rules. On any conflict, the architecture wins.
- `docs/IMPLEMENTATION_PLAN.md` defines the order of work, step by step, with an
  acceptance check per step.
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
  under `src/lib` (`cognito.ts`, `db.ts`). This keeps later features cheap.
- Logs never contain tokens, passwords or the body of the create-user response.
- IAM policies never use a wildcard action or resource. One role per function, scoped
  to the one user pool or table it needs.
- Every password is set as permanent. There is no forced password change and no
  e-mail sending in v1.
- The API can never create an administrator, delete one, or set its password.
- Role resolution: `admin` wins over `user`; a token in neither group gets 403.

## Cloud safety

- Never run `sam deploy`, `sam delete`, or any `aws` command that creates, changes or
  deletes resources unless explicitly instructed in the current request.
- `npm run verify` (all local tests) must be green before any deployment. The deploy
  script enforces this; do not bypass it.
- Local development uses the Docker stack (DynamoDB Local, dynamodb-admin, cognito-local)
  and `sam local start-api`. No AWS account is needed until plan step 11.

## Tooling and style

- Node.js 22, TypeScript strict, esbuild bundling via SAM, vitest for tests,
  `aws-sdk-client-mock` for unit tests, `zod` for input validation.
- Infrastructure is one `template.yaml`. Explain infrastructure changes in plain terms:
  the reader is not an Infrastructure-as-Code expert.
- Prefer the simplest design that meets the architecture. Do not add libraries,
  abstractions or AWS services the architecture does not call for.

## Everyday commands

Node 22 is pinned in `.nvmrc`; run `nvm use` first (the machine default may be newer).

- `npm run typecheck`: `tsc --noEmit` over `src/`, `tests/` and the config files.
- `npm run lint`: ESLint flat config with `typescript-eslint` recommended rules.
- `npm run test:unit`: vitest project `unit`, no Docker needed. Runs with v8 coverage and
  fails below 100 % line coverage on `src/lib` (HTML report in `coverage/`, git-ignored).
- `RUN_INTEGRATION=1 npm run test:integration`: the journeys of plan step 9 against the
  running `local:up` + `local:api` stack. Pass the same `DYNAMODB_PORT` as `local:up`
  (here `DYNAMODB_PORT=8002`). Without `RUN_INTEGRATION=1` it runs nothing and exits 0.
  Removes a leftover `carol` before starting, so it can be rerun after a failed run.
- `npm run build`: `sam build`. Always go through npm: SAM needs the project's `esbuild`
  on the PATH, which a bare `sam build` does not have.
- `sam validate --lint`: checks `template.yaml`.
- `npm run local:up`: starts DynamoDB Local, dynamodb-admin (http://localhost:8001) and
  cognito-local, then seeds them (table, pool, client, groups, users `admin` /
  `Admin-Local-Pass-1!` and `alice` / `Alice-Local-Pass-1!`) and writes `env.local.json`.
  Idempotent. Set `DYNAMODB_PORT=8002` when another project holds port 8000.
- `npm run local:api`: builds and serves the API on http://127.0.0.1:3000 (foreground).
- The local functions run on the machine's CPU type: `local-api.sh` passes
  `FunctionArchitecture=x86_64` on x86 machines (the cloud stays `arm64`, the template default).
- GitHub Codespaces: the legacy iptables `FORWARD` chain drops traffic between containers on
  `hello-local` (the authorizer then times out fetching `http://cognito:9229/…/jwks.json`). After
  each Codespace start, before `local:api`: `sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT`.
- `npm run local:down`: stops the stack. The table is in memory and is lost; Cognito
  data survives in `.cognito/`.
- Raw `sam local …` with Docker Desktop needs
  `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock` and dummy `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` (otherwise SAM tries the real, possibly expired, AWS login).
  `scripts/local-api.sh` does both.
- After `npm run build`, restart `npm run local:api`: it is not certain that the warm
  containers pick up the rebuilt code on their own.
- Under `sam local`, every event carries the same fake `requestContext.requestId`, so
  identical request ids in local logs are expected. In the cloud they are unique.
- cognito-local does not implement `AdminUserGlobalSignOut`. `env.local.json` sets
  `SKIP_GLOBAL_SIGN_OUT=true` for `DeleteUserFunction` so local deletes work; the cloud never
  sets it (architecture section 8, note on Cognito emulation).
- The shell is zsh: `set -- $var` does not word-split. Pass arguments explicitly.
- `npm run audit`: `npm audit --audit-level=high`.
- `DYNAMODB_PORT=8002 npm run verify`: typecheck, lint, audit, `sam validate --lint`, unit
  and integration tests (sets `RUN_INTEGRATION=1` itself), stopping at the first failure.
  Needs `local:up` + `local:api` running; never starts them. On success writes
  `.verify-ok` (`<commit> <epoch> <clean|dirty>`, git-ignored); removes it at the start.
- `npm run deploy`: refuses (exit 1, names the reason) unless `.verify-ok` is younger than
  30 minutes, names HEAD and says `clean`, and the tree is still clean; then `npm run build`
  and `sam deploy` with the default config env. Extra arguments go to `sam deploy`
  (`npm run deploy -- --guided`). Real cloud action: only when explicitly asked.
- `npm run bootstrap-admin <stack|local>`: sets the admin password (hidden prompt, twice,
  pool policy checked first). Only sets the password. Reads stdin, so
  `printf '%s\n%s\n' "$pw" "$pw" | npm run bootstrap-admin local` works in tests.
- `DYNAMODB_PORT=8002 npm run smoke <stack|local>`: journeys 3, 4, 6, 11 with a throw-away
  `smoke-<epoch>` user, PASS/FAIL per check, deletes the user on every exit. Prompts for the
  admin password (stdin). Leaves its message rows in the table (history).
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

- `src/handlers/`: one Lambda entry point per file (filled from step 5).
- `src/lib/`: shared modules; the only place that touches the AWS SDK (step 4).
- `tests/unit/`: vitest unit tests, mirroring `src/` (e.g. `tests/unit/lib/http.test.ts`).
- `tests/integration/`: end-to-end tests against the local Docker stack (step 9).
- `scripts/`: shell scripts behind the npm scripts (`local-seed.sh`, `local-api.sh`,
  `verify.sh`, `deploy.sh`, `bootstrap-admin.sh`, `smoke.sh`; `target.sh` is sourced by
  the last two, which call `cognito.mjs`).
- `docker/`: files for the local stack (`cognito-local-config.json`).
- Generated, git-ignored: `env.local.json`, `.cognito/`, `.aws-sam/`, `.verify-ok`.
- `docs/`, `prompts/`: see "Where the truth lives".

## Test conventions

- vitest with globals enabled (`describe`, `it`, `expect` need no import).
- Two projects in `vitest.config.ts`: `unit` (`tests/unit/**/*.test.ts`) and
  `integration` (`tests/integration/**/*.test.ts`). The integration project only
  selects files when `RUN_INTEGRATION=1`; otherwise it runs nothing and exits 0.
- Unit tests mock AWS with `aws-sdk-client-mock`, never real endpoints.
