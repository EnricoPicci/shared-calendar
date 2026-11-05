# Repository layout — the monorepo

| | |
|---|---|
| Status | v1 — applied on 2026-11-04 (plan step 20) |
| Date | 2026-11-04 |
| Supersedes | `docs/ARCHITECTURE.md` section 12 ("Proposed repository layout") |
| Brief | `prompts/20-org-folders-for-client-and-server.md` (decision), `prompts/21-step-20-implementation.md` (move) |

This repository holds every part of the application: the back end that exists today (the
Hello World API, `docs/ARCHITECTURE.md`), the browser front end that will follow, and the
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
├── .nvmrc  .editorconfig  .gitignore
├── CLAUDE.md                    # guidance for Claude Code (repository-wide)
├── README.md                    # written by plan step 12
├── docs/                        # repository-wide documentation (section 8)
├── prompts/                     # the numbered briefs that produced the documents and the code
│
├── backend/                     # ── the API ──────────────────────────────────────────────
│   ├── package.json             # name "backend"; runtime deps; scripts build/verify/deploy/local:*
│   ├── template.yaml            # all back-end infrastructure (SAM)
│   ├── samconfig.toml           # SAM settings per environment (default = cloud, local = laptop)
│   ├── docker-compose.yml       # DynamoDB Local, dynamodb-admin, cognito-local
│   ├── docker/                  # files the local stack needs (cognito-local-config.json)
│   ├── tsconfig.json            # extends ../tsconfig.base.json; lib ES2022, node types
│   ├── vitest.config.ts         # projects unit + integration; 100 % line coverage on src/lib
│   ├── src/
│   │   ├── handlers/            # one Lambda entry point per file
│   │   └── lib/                 # the only place that touches the AWS SDK
│   ├── tests/
│   │   ├── unit/                # mirrors src/
│   │   └── integration/         # journeys against the local Docker stack
│   ├── scripts/                 # operator scripts (local stack, verify, deploy, smoke, budget…)
│   └── (generated, git-ignored) env.local.json  .cognito/  .aws-sam/  .verify-ok  coverage/
│
├── frontend/                    # ── the browser app (services layer only; section 7) ────
│   ├── package.json             # name "frontend"; deps rxjs, shared; typecheck/lint/test:unit/verify
│   ├── tsconfig.json            # extends ../tsconfig.base.json; lib ES2022 + DOM, no node types
│   ├── vitest.config.ts         # projects unit + integration; 100 % line coverage on src/
│   ├── src/services/            # the services layer (docs/FRONTEND_SERVICES.md): session store,
│   │                            # login, refresh, hello, users; shared cognito.ts and api.ts
│   ├── tests/
│   │   ├── unit/                # mirrors src/ (plus fixtures.ts)
│   │   └── integration/         # login and the services' journeys against the local stack
│   ├── (reserved, not yet) index.html  vite.config.ts  public/  template.yaml  scripts/
│   └── (generated, git-ignored) coverage/   (later dist/)
│
└── shared/                      # ── what both import ─────────────────────────────────────
    ├── package.json             # name "@shared-calendar/shared"; exports ./src/index.ts
    ├── tsconfig.json            # extends ../tsconfig.base.json; no node, no DOM
    ├── vitest.config.ts         # unit project; 100 % line coverage
    ├── src/
    │   ├── index.ts             # the public surface: re-exports the files below
    │   ├── api.ts               # response bodies, error body, error codes (architecture section 4)
    │   ├── roles.ts             # Role, resolveRole (architecture section 3, "admin wins")
    │   └── username.ts          # the username rule and the zod schemas built on it
    └── tests/                   # mirrors src/
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
| A tool configuration every package needs (lint rule, TypeScript strictness, Node version) | The root | One setting, one place |
| A tool configuration one package needs (Vite, SAM, vitest coverage thresholds) | That package | Each package owns its build |

Two rules carried over from the architecture, unchanged by the move:

- Handlers never import the AWS SDK; only `backend/src/lib` does.
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
Tooling that only one package uses (`aws-sdk-client-mock`, `@types/aws-lambda`, Vite, a UI
framework) is a devDependency of that package.

### 4.2 The shared package has no build step

`shared/package.json` points its `exports` straight at `./src/index.ts`. Every consumer
already compiles TypeScript itself (esbuild through SAM for the Lambdas, Vite for the
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
  layout.
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
npm run bootstrap-admin -w backend -- hello-world-api
npm run smoke -w backend -- hello-world-api
npm run budget -w backend -- hello-world-api
```

`cd backend && npm run <script> …` is the same thing (drop `-w backend` and the `--` before the
arguments). `CLAUDE.md`, `README.md` and `docs/RUNBOOK.md` use these forms.

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

What stays out of `shared/`: the DynamoDB item shape (`MessageItem`), the authorizer context,
the logger, the password generator (server-side secret handling), and everything that imports
`aws-lambda` types or the AWS SDK.

---

## 7. The front-end folder, reserved

The front end is a browser single-page application in TypeScript built to static files
(decided 2026-11-04; framework not chosen yet). Its own architecture document will fix the
framework, the hosting and the sign-in flow. This section only fixes what the folder must look
like so that it fits the repository on day one:

- `frontend/package.json`, name `frontend`, depends on `@shared-calendar/shared`; scripts
  `dev`, `build`, `typecheck`, `lint`, `test:unit`, `verify`, `deploy`, so that the root
  scripts of section 5 pick it up with no change.
- Builds to `frontend/dist/` (git-ignored). Nothing in `backend/` is touched by a front-end
  build or deploy, and the other way round.
- Its hosting (an S3 bucket behind CloudFront, or equivalent) is a **separate** SAM template
  and stack, `frontend/template.yaml`, so that the back-end stack `hello-world-api` is never
  changed by a UI release. The front end reads the back end's `ApiUrl`, `UserPoolId` and
  `UserPoolClientId` from the back-end stack outputs at build time (the way
  `backend/scripts/target.sh` does), never from a file committed in the repository.
- Local development: the front end's dev server points at `http://127.0.0.1:3000` (the local
  API of `npm run local:api -w backend`) and `http://localhost:9229` (cognito-local), so the
  whole application runs on the laptop, which keeps requirement N5 true for the UI too.
- It validates input with the same `shared/` schemas the API uses, so a username the UI
  accepts is one the API accepts.

Nothing else is created in `frontend/` until its architecture document exists; the folder is
named here so that no one puts browser code anywhere else in the meantime. **The one exception:
the services layer exists since 2026-11-05** (brief `prompts/31-implement-login-service.md`,
design `docs/FRONTEND_SERVICES.md`): plain TypeScript with `rxjs` and `shared/`, which depends on
nothing the architecture will choose. Hence a minimal package (`package.json`, `tsconfig.json`,
`vitest.config.ts`, `src/services/`, `tests/`) with `typecheck`, `lint`, `test:unit` and `verify`.
Everything else still waits for the architecture document: no framework, no Vite, no
`index.html`, no `template.yaml`, no `dist/`, and no `dev`, `build` or `deploy` script (the root
scripts use `--if-present`, so their absence is not an error).

---

## 8. Documentation and prompts

`docs/` and `prompts/` stay at the root: they are the history and the truth of the whole
repository, they cross-reference each other, and `CLAUDE.md` points at them.

- A document about one component carries the component in its name:
  `docs/FRONTEND_ARCHITECTURE.md`, `docs/FRONTEND_IMPLEMENTATION_PLAN.md`. The existing
  back-end documents keep their names (`ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`,
  `RUNBOOK.md`) to break no link; the day the front-end documents arrive they may be renamed
  with a `BACKEND_` prefix in one commit that also fixes every reference.
- Repository-wide documents have no prefix: this one, `AWS_ACCOUNTS.md`, `NEW_ACCOUNT.md`.
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
| `frontend/dist/` (not yet: no build until the front-end architecture) | frontend | Vite |

---

## 10. How it was applied

Applied on 2026-11-04 as plan step 20 (brief `prompts/21-step-20-implementation.md`): every
file moved with `git mv`, so `git log --follow` shows its history from before the move. The
lock file was carried over rather than regenerated, so no dependency version changed.
`docs/ARCHITECTURE.md` v10 records the move and points here for the layout.
