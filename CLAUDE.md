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
- `npm run build`: `sam build`. Always go through npm: SAM needs the project's `esbuild`
  on the PATH, which a bare `sam build` does not have.
- `sam validate --lint`: checks `template.yaml`.
- `npm run local:up`: starts DynamoDB Local, dynamodb-admin (http://localhost:8001) and
  cognito-local, then seeds them (table, pool, client, groups, users `admin` /
  `Admin-Local-Pass-1!` and `alice` / `Alice-Local-Pass-1!`) and writes `env.local.json`.
  Idempotent. Set `DYNAMODB_PORT=8002` when another project holds port 8000.
- `npm run local:api`: builds and serves the API on http://127.0.0.1:3000 (foreground).
- `npm run local:down`: stops the stack. The table is in memory and is lost; Cognito
  data survives in `.cognito/`.
- Raw `sam local …` with Docker Desktop needs
  `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock` and dummy `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` (otherwise SAM tries the real, possibly expired, AWS login).
  `scripts/local-api.sh` does both.
- The shell is zsh: `set -- $var` does not word-split. Pass arguments explicitly.

More scripts arrive in step 10; update this list when they do.

## Folder map

- `src/handlers/`: one Lambda entry point per file (filled from step 5).
- `src/lib/`: shared modules; the only place that touches the AWS SDK (step 4).
- `tests/unit/`: vitest unit tests, mirroring `src/` (e.g. `tests/unit/lib/http.test.ts`).
- `tests/integration/`: end-to-end tests against the local Docker stack (step 9).
- `scripts/`: shell scripts behind the npm scripts (`local-seed.sh`, `local-api.sh`).
- `docker/`: files for the local stack (`cognito-local-config.json`).
- Generated, git-ignored: `env.local.json`, `.cognito/`, `.aws-sam/`.
- `docs/`, `prompts/`: see "Where the truth lives".

## Test conventions

- vitest with globals enabled (`describe`, `it`, `expect` need no import).
- Two projects in `vitest.config.ts`: `unit` (`tests/unit/**/*.test.ts`) and
  `integration` (`tests/integration/**/*.test.ts`). The integration project only
  selects files when `RUN_INTEGRATION=1`; otherwise it runs nothing and exits 0.
- Unit tests mock AWS with `aws-sdk-client-mock`, never real endpoints.
