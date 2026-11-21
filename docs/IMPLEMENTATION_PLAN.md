# Shared Calendar — Implementation Plan

| | |
|---|---|
| Status | v1 — derived from `docs/ARCHITECTURE.md` v2 (2026-10-27), aligned with v4 (2026-10-28). **Steps 1–12 done** (step 12 on 2026-11-04, tag `v1.0.0`); step 20, monorepo move, done 2026-11-04. **Shared calendar: steps 41–59 planned** (2026-11-10, brief 41, from `docs/SHARED_CALENDAR_SPEC.md` v2); step 41 done 2026-11-12 (brief 42); step 42 done 2026-11-12 (brief 43); step 43 done 2026-11-12 (brief 44); step 44 done 2026-11-12 (brief 45; O2 checked, PO confirmed T2); step 45 done 2026-11-12 (brief 46); step 46 done 2026-11-13 (brief 47; spec v7); step 47 done 2026-11-13 (brief 48; spec v8; availability complete); step 48 done 2026-11-14 (brief 49; spec v9; booking and the event log); step 49 done 2026-11-14 (brief 50; spec v10; listing, note and cancel); step 50 done 2026-11-14 (brief 51; spec v11; change; appointments complete); step 51 done 2026-11-14 (brief 52; spec v12; `GET /users`, user deletion with appointments); step 52 done 2026-11-14 (brief 53; spec v13; smoke test's calendar journey, AC-36 locally): **back end complete**; step 53 done 2026-11-15 (brief 54; `FRONTEND_SERVICES.md` v6; spec v14; `api.ts`, settings, types and availability-rules services, `listUsers`); step 54 done 2026-11-15 (brief 56; `FRONTEND_SERVICES.md` v7; `CalendarService`, `AppointmentsService`): **services layer complete**; step 55 done 2026-11-16 (brief 70; commit `340d9b0` deployed to `hello-world-api`, smoke test 19/19 PASS in the cloud, `docs/RUNBOOK.md` section 5.2): **shared calendar deployed**; 2026-11-16: rename to "shared-calendar" planned as steps 56–58 (`docs/RENAME_PLAN.md`), documentation and hand-over renumbered 56 → 59; step 56 done 2026-11-16 (brief 71; repository renamed, local stack on `shared-calendar-local`, no cloud change); step 57 done 2026-11-16 (brief 72; commit `4e22058` deployed as the new stack `shared-calendar-api`, smoke test 19/19 PASS, `docs/RUNBOOK.md` section 5.4): **new stack in use**, `hello-world-api` kept as the way back until step 58 |
| Date | 2026-10-28; calendar steps added 2026-11-10 |
| Scope | Everything needed to go from an empty repository to a deployed, smoke-tested v1; then the shared calendar (steps 41–59), from its specification to a deployed, smoke-tested feature |

---

## 1. How to use this plan

The plan is a sequence of **steps**. Each step lists what to build, the files it touches, and an **acceptance check** that must pass before moving on. Steps are ordered so that every step produces something runnable or testable; nothing is "wired later".

Conventions used throughout:

- Paths are relative to `backend/` since the monorepo move of 2026-11-04 (step 20, `docs/FOLDER_STRUCTURE.md`); the plan was written when the back end was the whole repository. Commands run in the back-end workspace: `npm run <script> -w backend` from the root, or the plain form from inside `backend/`.
- "Unit" tests run with `vitest` and no Docker. "Integration" tests need the local Docker stack (architecture section 8).
- Effort figures are indicative, for a developer who knows TypeScript but is new to SAM. Total: roughly 3 working days.
- The architecture document is the source of truth for behaviour. Where this plan quotes a value (token lifetime, password policy, IAM action), the architecture wins if they ever differ.
- The shared calendar (steps 41–59) has its own conventions, paths from the repository root, and the rule for which document governs while it is built: section 3, "Shared calendar".
- The steps after 59 are in documents of their own: the view layer (steps 60–69) in `docs/FRONTEND_VIEW_PLAN.md`, the conversational interface (steps c00–c16) in `docs/CONVERSATIONAL_PLAN.md`.

### 1.1 Requirement traceability

| Requirement (architecture 1.1) | Delivered by step |
|---|---|
| F1 Hello World, role-dependent message | 6, 9 |
| F2 Create / delete users | 7, 8, 9 |
| F3 Roles via Cognito groups | 2, 4, 5 |
| F4 Permanent passwords, upgrade path kept cheap | 4 (`password.ts`, `cognito.ts`), 7, 10 |
| N1 AWS, Lambda, TypeScript | 1, 2 |
| N2 Security | 2 (IAM, throttling), 4, 5, 7, 8, 11 |
| N3 Free tier, ≈ 0 cost | 2 (provisioned 1/1, retention), 11 (budget alarm) |
| N4 DB inspection UI | 3 |
| N5 Local tests gate the deployment | 3, 9, 10 |
| N6 Minimal load | 2 (throttling, memory sizing) |

#### Shared calendar (steps 41–59)

Every id of `docs/SHARED_CALENDAR_SPEC.md` v2 and the step that delivers it. "Unit" means proven
by unit tests with a fixed clock; the journeys prove the same scenario on dates relative to today.

| Spec ids | Step |
|---|---|
| **Rules** | |
| R-TIME-01 (zone parameter, cold-start check), R-TIME-04 (one "now" per request) | 43 (every later handler follows) |
| R-TIME-02, R-TIME-03, R-TIME-06 | 41 |
| R-TIME-05 (weeks start on Monday) | **none**: view layer only (spec 5); the API works with date ranges. Input for `FRONTEND_ARCHITECTURE.md` |
| R-SET-01..03 | 43 |
| R-TYPE-01, R-TYPE-02 | 44 |
| R-TYPE-03 | 44 (unit), 45 (pattern reference, end to end), 48 (appointment reference) |
| R-TYPE-04 | 45, 47, 48 |
| R-PAT-01 | 42, 46 |
| R-PAT-02..04 | 45 |
| R-OVR-01..03, R-ONE-01..03 | 42 (rules), 47 |
| R-AV-01, R-AV-02 | 45 (patterns), 47 (overrides, one-off windows) |
| R-AV-03, R-AV-04 | 45 (unit), 48 (end to end) |
| R-AV-05 | 43 (lock), 45 |
| R-SLOT-01, R-SLOT-02 | 42, 46 |
| R-SLOT-03, R-SLOT-04 | 46 |
| R-SLOT-05 | 48 |
| R-BOOK-01..09, R-BOOK-11 | 48 |
| R-BOOK-10 | 48 (unit, marker check), 51 (end to end) |
| R-CAN-01..03, R-NOTE-01..02, R-PERM-01 | 49 (R-PERM-01 also 50) |
| R-CHG-01..03 | 50 |
| R-VIEW-01..03 | 46 (view), 49 (list and history) |
| R-DEL-01..02 | 51 |
| Section 15 (event items), 14.5 (logging), 17 (security) | 48–51 (events); every handler step (log line); 43–51 (IAM) |
| **Decisions** | |
| D1, T5, T6 | 41, 43 (D1 also 55, confirmed before the first deploy) |
| D2 | 41, 42, 48 |
| D3 | 44 |
| D4 | 45 |
| D5 | 47 |
| D6 | 45, 47 |
| D7 | 45, 48 |
| D8, T4, T11, T12 | 42, 46 |
| D9 | 46 |
| D10, D11, D12, D18, T9 | 48 |
| D13 | 42, 48, 49 |
| D14 | 51 |
| D15, D17, T7 | 49 |
| D16, T8 | 50 |
| D19 | 51 |
| D20 (one calendar) | 43 (one `LOCK`, one `SETTINGS` item) |
| D21, T1, T3 | 43 |
| D22 | 42 (31-day range), 53–54 (services); UI out of scope |
| D23 | 43 |
| T2 (one function per route) | 43 (model), **44 (O2 checkpoint, PO decision)** |
| T10 | 48, 51 |
| **Routes** | |
| 1–2 | 43 |
| 3–6 | 44 |
| 7–10 | 45 |
| 15 | 46 |
| 11–14 | 47 |
| 17 | 48 |
| 16, 18, 19 | 49 |
| 20 | 50 |
| 21, and the changed `DELETE /users/{username}` | 51 |
| Front-end services of section 16 | 53 (`api.ts`, settings, types, rules, `listUsers`), 54 (calendar, appointments) |
| **Acceptance scenarios** | |
| AC-01, AC-02 | 43 |
| AC-03 | 44 |
| AC-05 | 45 |
| AC-28 | 44 (unit), 45 |
| AC-04, AC-33, AC-35 | 42 (rules), 46 |
| AC-06 … AC-09 | 47 (AC-08 also 42) |
| AC-10 … AC-19, AC-34 | 48 |
| AC-25 … AC-27 | 45 (unit), 48 |
| AC-20, AC-21, AC-30, AC-31 | 49 |
| AC-22 … AC-24 | 50 |
| AC-29, AC-32 | 51 |
| AC-36 | every handler step (log-line assertion), 52 (local), 55 (cloud) |
| Smoke test (18.4) | 52 (local), 55 (cloud) |
| **Open point** O2 | 44 |

Nothing in the spec is without a step except, by design: R-TIME-05 and the view needs of 16.8
(the user interface is out of scope, spec 1.3); the future notifier of 15.3; the follow-ups of
spec 21 (section 6 below); and the CORS gap, which waits for `FRONTEND_ARCHITECTURE.md`.

---

## 2. Prerequisites (step 0)

Install and verify once, before step 1. Everything runs on macOS and Linux; the scripts need nothing beyond this table and a POSIX base system (bash, sed, date).

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 LTS | `node -v` |
| npm | bundled with Node | `npm -v` |
| git | any | `git --version` |
| curl | ≥ 7.55 (any current distribution) | `curl --version` |
| Docker Desktop (macOS) or Docker Engine with the Compose v2 plugin (Linux) | current | `docker info`, `docker compose version` |
| AWS SAM CLI | ≥ 1.80 (Lambda authorizer support in `sam local`) | `sam --version` |
| AWS CLI v2 | current | `aws --version` |
| An AWS account + a named CLI profile with permission to create CloudFormation stacks, Lambda, API Gateway, Cognito, DynamoDB, IAM roles, CloudWatch, Budgets | | `aws sts get-caller-identity --profile <profile>` |

**Acceptance:** all commands above succeed. No AWS resources are created in this step.

---

## 3. Steps

### Step 1 — Repository scaffold (≈ 2 h)

**Goal:** a TypeScript project that compiles, lints and runs an empty test suite.

Files

- `package.json` with scripts (final list in step 10; start with `build`, `typecheck`, `lint`, `test:unit`).
- `tsconfig.json`: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict true`, `noUncheckedIndexedAccess true`, `types: ["node", "vitest/globals"]`.
- `eslint.config.js` (flat config, `typescript-eslint` recommended).
- `vitest.config.ts` with two projects: `unit` (`tests/unit/**`) and `integration` (`tests/integration/**`, run only when `RUN_INTEGRATION=1`).
- `.gitignore` extended with `node_modules/`, `.aws-sam/`, `dist/`, `.env*`, `*.local.json` (this includes `env.local.json`, which step 3's seed script generates with machine-specific ids).
- `.editorconfig`, `.nvmrc` (`22`).
- `src/` and `tests/` folders with a placeholder test.

Dependencies

```
npm i @aws-sdk/client-cognito-identity-provider @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb aws-jwt-verify zod ulid
npm i -D typescript esbuild vitest aws-sdk-client-mock @types/aws-lambda @types/node eslint typescript-eslint
```

**Acceptance:** `npm run typecheck`, `npm run lint` and `npm run test:unit` all pass on a clean checkout.

---

### Step 2 — Infrastructure template (≈ 4 h)

**Goal:** `template.yaml` describing the whole system, validated by SAM, not yet deployed.

Resources to declare (names are the logical IDs to use):

| Logical ID | Type | Key settings |
|---|---|---|
| `UserPool` | `AWS::Cognito::UserPool` | `AdminCreateUserConfig.AllowAdminCreateUserOnly: true`; password policy min 12, require upper/lower/number/symbol; `Schema` with optional `email` attribute (unused in v1, kept for the forgot-password upgrade); `UserPoolTier: ESSENTIALS`; `DeletionProtection: ACTIVE` |
| `UserPoolClient` | `AWS::Cognito::UserPoolClient` | `GenerateSecret: false`; `ExplicitAuthFlows: [ALLOW_USER_PASSWORD_AUTH, ALLOW_REFRESH_TOKEN_AUTH]`; `AccessTokenValidity: 15` min, `IdTokenValidity: 15` min, `RefreshTokenValidity: 7` days with `TokenValidityUnits`; `PreventUserExistenceErrors: ENABLED` |
| `AdminGroup`, `UserGroup` | `AWS::Cognito::UserPoolGroup` | names `admin`, `user` |
| `AdminUser` | `AWS::Cognito::UserPoolUser` | `Username: !Ref AdminUsername`, `MessageAction: SUPPRESS` |
| `AdminUserToGroup` | `AWS::Cognito::UserPoolUserToGroupAttachment` | admin → `admin` |
| `MessagesTable` | `AWS::DynamoDB::Table` | PK `messageId` (S); `ProvisionedThroughput 1/1`; `DeletionProtectionEnabled: true`; `SSESpecification` default |
| `HttpApi` | `AWS::Serverless::HttpApi` | `Auth.DefaultAuthorizer: JwtLambdaAuthorizer` (type Lambda, `Identity.Headers: [Authorization]`, `AuthorizerPayloadFormatVersion: 2.0`, `EnableSimpleResponses: true`, `AuthorizerResultTtlInSeconds: 300`); `DefaultRouteSettings` `ThrottlingBurstLimit: 10`, `ThrottlingRateLimit: 5`; access logging to a log group |
| `AuthorizerFunction` | `AWS::Serverless::Function` | handler `src/handlers/authorizer.ts`; env `USER_POOL_ID`, `CLIENT_ID`, optional `JWKS_URI`, `COGNITO_ISSUER`; **no** IAM policies beyond logging |
| `HelloFunction` | `AWS::Serverless::Function` | route `POST /hello`; env `MESSAGES_TABLE`, optional `DYNAMODB_ENDPOINT`; policy `DynamoDBWritePolicy`-equivalent limited to `dynamodb:PutItem` on the table ARN |
| `CreateUserFunction` | `AWS::Serverless::Function` | route `POST /users`; env `USER_POOL_ID`, optional `COGNITO_ENDPOINT`; inline policy allowing `cognito-idp:AdminCreateUser`, `AdminSetUserPassword`, `AdminAddUserToGroup`, `AdminDeleteUser` on the pool ARN |
| `DeleteUserFunction` | `AWS::Serverless::Function` | route `DELETE /users/{username}`; policy `cognito-idp:AdminListGroupsForUser`, `AdminUserGlobalSignOut`, `AdminDeleteUser` on the pool ARN |
| `*LogGroup` (one per function) | `AWS::Logs::LogGroup` | `RetentionInDays: 14` |
| `AlarmTopic` | `AWS::SNS::Topic` | e-mail subscription to `AlertEmail` (architecture section 11) |
| `Api5xxAlarm` | `AWS::CloudWatch::Alarm` | `AWS/ApiGateway` metric `5xx` for the `HttpApi` > 0 over 5 min, `TreatMissingData: notBreaching`, action → `AlarmTopic` |
| `AuthorizerErrorsAlarm` | `AWS::CloudWatch::Alarm` | `AWS/Lambda` metric `Errors` for `AuthorizerFunction` > 0 over 5 min, `TreatMissingData: notBreaching`, action → `AlarmTopic` |

Global function settings (`Globals.Function`): `Runtime: nodejs22.x`, `Architectures: [arm64]`, `MemorySize: 256`, `Timeout: 10`, `Tracing: Disabled`. Each function carries `Metadata.BuildMethod: esbuild` with `BuildProperties: { Minify: true, Target: es2022, Format: esm, OutExtension: [.js=.mjs], Sourcemap: true, EntryPoints: [<handler file>] }`. The functions that bundle the AWS SDK (`hello`, `createUser`, `deleteUser`) also get `Banner: [js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);]`: the SDK is CommonJS and calls `require()`, which an ES module bundle does not have, so without the banner the function crashes when it loads (found in step 6; unit tests cannot catch it because they run the TypeScript source, not the bundle). The authorizer bundles only ESM code and does not need it.

Parameters: `AdminUsername` (default `admin`), `AlertEmail`, `Stage` (default `prod`). Outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `MessagesTableName`.

Also create `samconfig.toml` with a `[default.deploy.parameters]` section (stack name `hello-world-api`, region, `capabilities = "CAPABILITY_IAM"`, `resolve_s3 = true`) and a `[local]` environment.

**Acceptance:** `sam validate --lint` passes; `sam build` succeeds with empty handler files that export a `handler`; reviewing the template shows no wildcard `*` in any IAM action or resource.

---

### Step 3 — Local stack (≈ 3 h)

**Goal:** the API runs on the laptop against emulators, with the database visible in a browser.

Files

- `docker-compose.yml` with three services on a named network `hello-local`:
  - `dynamodb` → `amazon/dynamodb-local`, host port `${DYNAMODB_PORT:-8000}` (override when another project already uses 8000), command `-jar DynamoDBLocal.jar -sharedDb -inMemory`.
  - `dynamodb-admin` → `aaronshaf/dynamodb-admin`, port `8001`, env `DYNAMO_ENDPOINT=http://dynamodb:8000`.
  - `cognito` → `jagregory/cognito-local`, port `9229`, volume `./.cognito:/app/.cognito` (gitignored). `local:up` first copies `docker/cognito-local-config.json` to `.cognito/config.json`: it allows plain (non-e-mail) usernames and fixes the token issuer to `http://localhost:9229/<poolId>`, two emulator defaults that differ from what we need.
  - Images are pinned to exact versions; all ports are bound to `127.0.0.1` only.
- `scripts/local-seed.sh` (idempotent, uses the AWS CLI with dummy credentials and `--endpoint-url`):
  0. check that `localhost:${DYNAMODB_PORT:-8000}` and `localhost:9229` are published by *this* project's `dynamodb` and `cognito` containers and that both are attached to `hello-local`; otherwise stop with an error naming the fix. When another project already holds the port, Docker can leave our container running with no port and no network, and the seed would silently fill the other project's emulator (found in step 6);
  1. create table `hello-messages` on DynamoDB Local with the same key schema as the template;
  2. create user pool `local_pool` and an app client on cognito-local, enable `USER_PASSWORD_AUTH`;
  3. create groups `admin` and `user`;
  4. create user `admin` in group `admin` with a permanent password `Admin-Local-Pass-1!`;
  5. create user `alice` in group `user` with a permanent password `Alice-Local-Pass-1!`;
  6. write the generated pool id and client id into `env.local.json`.
- `env.local.json`: per-function env for `sam local`, pointing `DYNAMODB_ENDPOINT` to `http://dynamodb:8000`, `COGNITO_ENDPOINT` to `http://cognito:9229`, `JWKS_URI` to `http://cognito:9229/<poolId>/.well-known/jwks.json`, `COGNITO_ISSUER` to `http://localhost:9229/<poolId>` (the `iss` claim names the address the token was *requested* from, i.e. the host, not the address the Lambda uses to fetch the keys), plus dummy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` so the SDK does not look for real credentials.
- npm scripts: `local:up` (copy the emulator config, `docker compose up -d`, seed), `local:down`, `local:api` (`scripts/local-api.sh`: finds the Docker socket, sets dummy AWS credentials, then `sam build` and `sam local start-api` with the `[local]` settings of `samconfig.toml`: `--docker-network hello-local --env-vars env.local.json --warm-containers EAGER`).

Note on hostnames: handlers run inside SAM's containers and reach the emulators by service name on the Docker network; tests run on the host and reach them on `localhost`. The seed script and the tests therefore use `localhost:${DYNAMODB_PORT:-8000}` and `localhost:9229`, while `env.local.json` uses the service names.

**Acceptance:** after `npm run local:up`, `http://localhost:8001` shows an empty `hello-messages` table; `aws cognito-idp initiate-auth --endpoint-url http://localhost:9229 …` for `alice` returns tokens; `npm run local:api` prints the three mounted routes.

---

### Step 4 — Shared libraries with unit tests (≈ 4 h)

**Goal:** the small, reusable pieces every handler depends on, each fully unit-tested before any handler exists.

| File | Contents | Tests (`tests/unit/lib/*.test.ts`) |
|---|---|---|
| `src/lib/http.ts` | `ok(status, body)`, `noContent()`, `error(status, code, message)` returning API Gateway v2 results with JSON body and `content-type`; `parseJsonBody(event)` → `unknown` or 400 error | status codes, body shape, invalid JSON → 400 |
| `src/lib/validation.ts` | `zod` schemas: `CreateUserBody { username }` with regex `^[a-z0-9][a-z0-9._-]{2,31}$` and `.strict()`; `UsernameParam`; helper `validate(schema, value)` returning a typed result or a 400 error | accepts valid names, rejects uppercase, short, long, unknown fields |
| `src/lib/auth.ts` | `Claims` type; `getClaims(event)` reading the authorizer context (`sub`, `username`, `groups` as a JSON array string); `resolveRole(groups)` → `'admin' | 'user' | null` with admin precedence; `requireGroup(claims, 'admin')` → 403 error or void | the four group combinations of architecture section 3; missing context → 401 |
| `src/lib/password.ts` | `generatePassword()`: 16 chars from `crypto.randomInt`, guaranteed ≥ 1 upper, lower, digit, symbol, shuffled | length, character classes, 1 000 samples all satisfy the policy, no two equal |
| `src/lib/logger.ts` | `log(level, fields)` → single-line JSON on stdout with `requestId`; a `redact` list (`password`, `authorization`) applied to every field | redaction, shape |
| `src/lib/db.ts` | `DocumentClient` built once per container (endpoint from `DYNAMODB_ENDPOINT` when set); `putMessage(item)` | with `aws-sdk-client-mock`: item shape, table name from env |
| `src/lib/cognito.ts` | `CognitoIdentityProviderClient` built once (endpoint from `COGNITO_ENDPOINT` when set); functions `createUser(username)`, `setPermanentPassword(username, password)`, `addToGroup(username, group)`, `listGroups(username)`, `globalSignOut(username)`, `deleteUser(username)`; maps SDK errors to typed `UserExistsError`, `UserNotFoundError` | with `aws-sdk-client-mock`: correct commands and parameters (`MessageAction: SUPPRESS`, `Permanent: true`), error mapping |

Design rule to enforce in review: handlers never import the AWS SDK directly, only these modules. This is what keeps the password-reset upgrade (architecture 7.4) to a copy of `createUser`.

**Acceptance:** `npm run test:unit` green with 100 % line coverage on `src/lib` (enable `vitest --coverage` with `@vitest/coverage-v8`).

---

### Step 5 — Authorizer (≈ 3 h)

**Goal:** `src/handlers/authorizer.ts` verifying Cognito access tokens identically in the cloud and locally.

Behaviour

1. Read the `Authorization` header (case-insensitive), require the `Bearer ` prefix.
2. Verify with `aws-jwt-verify`:
   - cloud: `CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' })`;
   - local (when `JWKS_URI` is set): `JwtRsaVerifier.create({ issuer: COGNITO_ISSUER, jwksUri: JWKS_URI, audience: null, customJwtCheck })` where `customJwtCheck` enforces `client_id === CLIENT_ID` and `token_use === 'access'`.
   - Local key download: the library's default fetcher only accepts `https://` addresses, and cognito-local serves its JWKS over plain HTTP. The local verifier therefore gets its own `SimpleJwksCache` whose fetcher uses Node's built-in `fetch` with a 3-second timeout (`AbortSignal.timeout`). Only the download changes; every check stays in the library. The cloud verifier keeps the default HTTPS-only fetcher, because `JWKS_URI` is empty there.
   - The verifier instance is created once at module load so the JWKS cache lives across invocations.
3. On success return the simple response `{ isAuthorized: true, context: { sub, username, groups: JSON.stringify(groups ?? []) } }`.
4. When the token is missing, malformed or fails any check, return `{ isAuthorized: false }` and log the reason at `warn` level without the token.
5. When the signing keys cannot be downloaded (the library's `FetchError`; the local fetcher throws the same error), log at `error` level and rethrow: the client gets 500 and the authorizer `Errors` alarm fires (architecture v4, section 4).

Tests (`tests/unit/handlers/authorizer.test.ts`): generate an RSA key pair in the test, serve a fake JWKS through the verifier's `cacheJwks()` hook, sign tokens with `node:crypto` (no extra dependency) and cover, for both the cloud and the local verifier: valid token, expired, wrong issuer, wrong client id, id token instead of access token, missing header, malformed header, groups absent. For the local verifier also cover the key download with a stubbed global `fetch`: success over `http://`; an error status, a timeout and a connection error all crash; an unknown key id with the server reachable still denies. For the cloud verifier, a `FetchError` from `verify` crashes.

**Acceptance:** unit tests green; with the local stack up, `curl -H "Authorization: Bearer <alice token>" -X POST localhost:3000/hello` reaches the (still empty) hello handler instead of returning 403, a garbage token returns 403, and a request without `Authorization` header returns 401.

---

### Step 6 — `hello` handler (≈ 2 h)

**Goal:** `src/handlers/hello.ts` implementing architecture section 6.5.

**Why `hello` comes before the user-management handlers.** This is a deliberate choice: Hello World is the simplest end-to-end slice, so proving it first validates the authorizer, the local stack and the DynamoDB wiring before the more involved `createUser` and `deleteUser` handlers arrive.

**Which users are used, given that `createUser` does not exist yet.** None are needed by the unit tests: the handler reads its identity from the authorizer context, which the tests build by hand (`groups: ["user"]`, `["admin"]`, both, none) with DynamoDB mocked. The local end-to-end checks use the two accounts that step 3's seed script creates directly in the Cognito emulator with the AWS CLI, bypassing our API: `admin` (group `admin`) and `alice` (group `user`). These two remain fixed fixtures that no test deletes; the `createUser` Lambda is first exercised in step 7 with a separate account.

1. `getClaims` → 401 if absent.
2. `resolveRole(groups)` → 403 `{ error: "forbidden" }` if `null`.
3. Build the message: `admin` → `Hello World, the Administrator is speaking`; `user` → `Hello World, I am ${username}`.
4. `messageId = ulid()`, `createdAt = new Date().toISOString()`.
5. `putMessage({ messageId, userId: sub, userName: username, role, message, createdAt })`.
6. Return `201 { messageId, role, message, createdAt }`.

Tests: the four group combinations, DynamoDB failure → 500 with generic body, stored item shape.

**Acceptance:** unit tests green; locally, calling `/hello` as `alice` returns `Hello World, I am alice`, as `admin` returns the Administrator message, and both rows appear in dynamodb-admin with the right `role`.

---

### Step 7 — `createUser` handler (≈ 3 h)

**Goal:** `src/handlers/createUser.ts` implementing architecture section 6.3 including rollback.

1. `requireGroup(claims, 'admin')` → 403.
2. `parseJsonBody` + `validate(CreateUserBody)` → 400.
3. `password = generatePassword()`.
4. `createUser(username)`; on `UserExistsError` → 409.
5. `try { setPermanentPassword(username, password); addToGroup(username, 'user') } catch { deleteUser(username) (best effort, logged); return 500 }`.
6. Return `201 { username, password }`. The logger must never receive the response body (pass only `{ username }` to the log).

Tests: happy path with exact command sequence, 403 for a `user`-only caller, 400 cases, 409, rollback when `setPermanentPassword` fails, rollback when `addToGroup` fails, rollback itself failing still returns 500.

**Acceptance:** unit tests green; locally, `POST /users {"username":"bob"}` as admin returns a password, `bob` can sign in with it immediately (no challenge), and a second identical call returns 409.

---

### Step 8 — `deleteUser` handler (≈ 2 h)

**Goal:** `src/handlers/deleteUser.ts` implementing architecture section 6.4.

1. `requireGroup(claims, 'admin')` → 403.
2. `validate(UsernameParam, pathParameters.username)` → 400.
3. `listGroups(username)`; `UserNotFoundError` → 404; contains `admin` → 403 `{ error: "cannot_delete_admin" }`.
4. `globalSignOut(username)` then `deleteUser(username)`.
5. Return `204`.

Tests: happy path with command order, 403 for non-admin caller, 403 for admin target (including dual-membership target), 404, 400 for invalid path.

**Acceptance:** unit tests green; locally, deleting `bob` returns 204, deleting him again returns 404, deleting `admin` returns 403, and bob's old messages are still in the table.

---

### Step 9 — Integration tests (≈ 4 h)

**Goal:** the journeys of architecture section 6 proven end-to-end on the laptop.

Setup (`tests/integration/setup.ts`): assumes `npm run local:up` and `npm run local:api` are running (a `globalSetup` checks both ports and fails fast with a clear message); a helper `signIn(username, password)` calls cognito-local's `InitiateAuth` and returns the access token; a helper `api(method, path, token, body)` wraps `fetch` against `http://127.0.0.1:3000`; a helper `scanMessages()` reads DynamoDB Local directly.

Test cases (`tests/integration/journeys.test.ts`), in order:

| # | Journey | Expectation |
|---|---|---|
| 1 | Sign in as `alice` and `admin` | tokens returned, no challenge |
| 2 | `/hello` without token / with garbage token | 401 / 403 |
| 3 | `/hello` as `alice` | 201, `role: user`, message `Hello World, I am alice`, row in table |
| 4 | `/hello` as `admin` | 201, `role: admin`, Administrator message, row in table |
| 5 | `POST /users` as `alice` | 403 |
| 6 | `POST /users` as `admin` with `{username:"carol"}` | 201 with password; `carol` can sign in; `/hello` as carol works |
| 7 | `POST /users` again with `carol` | 409 |
| 8 | `POST /users` with `{username:"Bad Name"}` | 400 |
| 9 | `DELETE /users/carol` as `alice` | 403 |
| 10 | `DELETE /users/admin` as `admin` | 403 |
| 11 | `DELETE /users/carol` as `admin` | 204; sign-in as carol now fails; her message row still exists |
| 12 | `DELETE /users/carol` again | 404 |

**Acceptance:** `RUN_INTEGRATION=1 npm run test:integration` green twice in a row (proves the suite cleans up after itself or tolerates leftovers).

---

### Step 10 — Scripts, verification gate and operator tooling (≈ 3 h)

**Goal:** one command to prove the system, one to deploy that refuses to run without the proof.

`package.json` scripts (final):

| Script | Does |
|---|---|
| `build` | `sam build` |
| `typecheck` / `lint` / `audit` | `tsc --noEmit` / `eslint .` / `npm audit --audit-level=high` |
| `test:unit` / `test:integration` | vitest projects |
| `local:up` / `local:down` / `local:api` | step 3 |
| `verify` | `scripts/verify.sh`: `typecheck && lint && audit && sam validate --lint && test:unit && test:integration` (with `RUN_INTEGRATION=1`) — writes `.verify-ok` (`<commit> <epoch seconds> <clean|dirty>`) on success |
| `deploy` | `scripts/deploy.sh`: refuses unless `.verify-ok` exists, is younger than 30 minutes, matches the current `git rev-parse HEAD`, says `clean`, and the tree is still clean; then `npm run build && sam deploy` (the `default` config env; extra arguments go to `sam deploy`) |
| `bootstrap-admin` | `scripts/bootstrap-admin.sh <stack|local>` |
| `smoke` | `scripts/smoke.sh <stack|local>` |

`scripts/bootstrap-admin.sh`: reads `UserPoolId` from the stack outputs (or from `env.local.json` with `local`), prompts for the password with `read -s`, confirms it twice, checks the pool policy, then calls `AdminSetUserPassword` with `Permanent: true`. Never echoes the password, never writes it to disk, never passes it as a command-line argument: the call goes through `scripts/cognito.mjs` (the project's AWS SDK) with the password on a pipe, because the AWS CLI accepts a request only as arguments or as a regular file.

`scripts/smoke.sh`: reads outputs, prompts for the admin password, signs in, runs journeys 3, 4, 6, 11 of step 9 against the real API (or, with `local`, the local stack) with a throw-away username `smoke-<timestamp>`, prints PASS/FAIL per check, exits non-zero on any failure, and deletes the throw-away user on every exit.

**Acceptance:** `npm run verify` passes; `npm run deploy` without a prior `verify` prints the refusal and exits 1; `bootstrap-admin local` followed by sign-in works against the emulator.

---

### Step 11 — First cloud deployment (≈ 2 h, needs the AWS account)

0. Pick the region before the deploy and check it read-only: `aws cloudformation describe-stacks --stack-name hello-world-api --region <region>` must answer "does not exist", not `AccessDenied … explicit deny in a service control policy`. An account created by the console's multi-account setup sits in an AWS Organization whose policy allows regional services in one region only (here `eu-north-1`). Put that region in `samconfig.toml` and in the CLI profile, and commit before step 1.
1. `npm run verify` on a clean, committed tree (must be green and say "clean tree").
2. `npm run deploy -- --parameter-overrides AlertEmail=<alert address>` (the gate applies to the first deployment too). `samconfig.toml` holds the other settings (stack `hello-world-api`, region, IAM capability, `AdminUsername` `admin`, `FunctionArchitecture` `arm64`) but not the address, because the repository is public: CloudFormation stores it with the stack and later deploys reuse it. In step 11 the first deploy was `--guided`, which wrote the address into `samconfig.toml`; it was removed before pushing. If `--guided` is ever used, do not save its answers with the address in them.
3. `npm run bootstrap-admin hello-world-api` and choose the admin password.
4. `npm run smoke hello-world-api`.
5. `npm run budget hello-world-api -- --dry-run`, then `npm run budget hello-world-api`: creates the 1 USD monthly budget `hello-world-api-monthly` that e-mails `AlertEmail` (architecture 9.2). Not in `template.yaml`, because CloudFormation does not offer `AWS::Budgets::Budget` in every region (`Unrecognized resource types` in `eu-north-1`). Idempotent.
6. Confirm the SNS subscription e-mail ("AWS Notification - Subscription Confirmation") sent to `AlertEmail`; until then the error alarms send nothing. Do it the same day: AWS deletes an unconfirmed e-mail subscription after about two days (in step 11 it was gone within 65 h of the deploy), and a later deploy does not recreate it, because CloudFormation sees no change to the topic. Check with `aws sns list-subscriptions-by-topic` (a confirmed one shows an ARN, not `PendingConfirmation`); if the list is empty, subscribe again by hand: `aws sns subscribe --topic-arn <AlarmTopic ARN> --protocol email --notification-endpoint <AlertEmail>`, then confirm. Then, in the AWS console, open Billing → Budgets and check that `hello-world-api-monthly` exists with a 1 USD limit and `AlertEmail` as recipient (budget alerts need no confirmation).
7. In the AWS console, open DynamoDB → `hello-messages` → Explore items: the two smoke-test rows are visible (N4 in the cloud).
8. `ApiUrl`, `UserPoolId`, `UserPoolClientId` go into the README, which step 12 writes (they are not secrets). Until then `sam list stack-outputs --stack-name hello-world-api` shows them.

**Acceptance:** smoke test PASS; `sam list stack-outputs` shows the four outputs; AWS Cost Explorer forecast for the month is 0 USD apart from the API Gateway fraction of a cent.

---

### Step 12 — Documentation and hand-over (≈ 2 h)

- `README.md`: purpose, prerequisites, the deployed stack's `ApiUrl`, `UserPoolId` and `UserPoolClientId` (from step 11), the five everyday commands (`local:up`, `local:api`, `verify`, `deploy`, `smoke`), how to sign in with curl and call each endpoint, how the admin creates and deletes users, where to look at the data (dynamodb-admin locally, console in the cloud), how to rotate the admin password.
- `docs/ARCHITECTURE.md`: update the status line to "implemented, v1" and fix anything the implementation proved different.
- Tag the commit `v1.0.0`.

**Acceptance:** a colleague can follow the README from clone to a passing `npm run verify` without asking questions.

---

### Step 20 — Monorepo move (done 2026-11-04)

**Goal:** the repository shows its three components at a glance: `backend/` (everything built in steps 1–12), `frontend/` (reserved for the browser app), `shared/` (the API contract and the username rule, extracted from `src/lib`). npm workspaces, one lock file, `docs/` and `prompts/` stay at the root.

- Layout and the rules for it: `docs/FOLDER_STRUCTURE.md` (decided 2026-11-04, brief 20; applied by brief 21, `prompts/21-step-20-implementation.md`).
- Numbered 20, not 13, to leave 13–19 for back-end follow-ups (section 6).
- What the implementation found: `sam build --build-in-source` alone runs an `npm update --omit dev` per function, which in a workspace strips the root's development tools. The build therefore uses SAM's beta npm-workspace support (`SAM_CLI_BETA_NODEJS_MONOREPO=1`, `cached = false`; `docs/FOLDER_STRUCTURE.md` 4.3). The lock file was carried over, not regenerated, so every resolved dependency version is unchanged.

**Acceptance:** `npm install` at the root, then `DYNAMODB_PORT=8002 npm run verify -w backend` green against the local stack, and `npm run build -w backend` producing bundles that contain the shared code. Then the architecture gets a change-log line, `CLAUDE.md` and `docs/RUNBOOK.md` switch to the workspace command form, and this plan's path convention (section 1) is updated.

---

### Shared calendar (steps 41–59)

Planned 2026-11-10 (brief 41) from `docs/SHARED_CALENDAR_SPEC.md` v2. Numbered from 41 like the
spec's outline (section 21). The PO confirmed assumptions A1–A8 before planning. The spec changes
approved during planning are in its change log (v2).

#### How these steps are run

- **Paths** are relative to the repository root, since these steps touch `shared/`, `backend/` and
  `frontend/`. Commands use the workspace form (`npm run <script> -w backend`).
- **The gate in every step** is the root `DYNAMODB_PORT=8002 npm run verify`: the back end's gate
  (typecheck, lint, audit, `sam validate --lint`, unit and integration tests, with `shared/`), then
  the front end's. It needs `npm run local:up -w backend` and `npm run local:api -w backend`
  running. Restart `local:api` after every step that adds a function, because it is not certain
  the warm containers pick up a rebuild. The three 100 % line-coverage thresholds (`shared/src`,
  `backend/src/lib`, `frontend/src`) hold at the end of every step.
- **Integration journeys grow with the routes.** Each route step adds its journeys to
  `backend/tests/integration/calendar.test.ts`, so its acceptance check is a command that can be
  rerun. Hello World used manual `curl` checks per step and wrote the journeys in step 9. Here the
  journeys are part of `verify`, so every later step re-proves the earlier ones. The outline's
  separate journeys step (48) is therefore spread over steps 43–51, and what remains of it is step 52.
- **A fixed "now"** (spec 18.3, approved change P1). Every acceptance scenario is proven in the
  handler's unit tests, with `vi.setSystemTime` and the exact dates of the scenario. It is proven
  again in the journeys with dates counted from the real today, computed with the shared time
  helpers and never with fixed UTC offsets. Settings are chosen there to make timing rules
  decidable (for example a 720 h notice). The journeys of AC-29 and AC-31 write an appointment
  that has already ended directly into DynamoDB Local.
- **Test users and test data** (spec 18.2, approved changes P2 and P3). The back-end calendar
  journeys empty the local `calendar` table at the start. The helper refuses any endpoint other than
  `localhost`/`127.0.0.1`. The scenarios' `alice` and `bob` are played by the throw-away Users
  `dave` and `erin`, which the journeys create through `POST /users` and remove both at the start
  and at the end. The seeded `alice` and `admin` stay fixtures. The front-end journeys do not reset
  the table. Like the smoke test, they create only items scoped to their own types and dates, and
  remove them at the end.
- **Handlers** follow `hello.ts`: claims → role → validate (shared schemas) → `calendarRules` →
  `calendarDb` → response, plus one log line without the note or any body (spec 14.5). Every handler
  test asserts that log line, which is how AC-36 is proven step by step.
- **Efforts** are indicative, for the developer who built Hello World. Total: roughly 80 hours,
  about 10 working days.

#### Where the truth lives while the calendar is built

**Decision: the spec merges into `docs/ARCHITECTURE.md` one part per step.** Each step merges the
part of spec section 19 that it implements, in the same change as the code. Steps 41 and 59 open and
close the merge.

- *Why not merge first.* The architecture would describe 21 routes that do not exist, and its
  status line, "v1 implemented", would stop being true for a week or more. Every finding during
  implementation would also have to be corrected in a document already presented as the truth.
- *Why not merge last.* Until the end, two documents would disagree about existing behaviour. The
  spec changes `DELETE /users/{username}` (10.2), the IAM pattern (shared managed policies, 14.3)
  and the cost figures (10/10 capacity). Under CLAUDE.md's rule ("the architecture wins"), steps 43
  and 51 would then contradict the governing document.
- *Per step*, the architecture always describes what exists. The reviewer sees code and document
  together, and a finding is fixed where it belongs.

**What governs in the meantime.** Step 41 opens version v12 of the architecture's change log with
this rule: *the shared calendar (F5) is being implemented in plan steps 41–59; a calendar matter
that the architecture does not yet describe is governed by `docs/SHARED_CALENDAR_SPEC.md`;
whatever the architecture already describes, including everything Hello World does, is governed by
the architecture.* A step that changes existing behaviour (43: IAM pattern and cost; 51:
`deleteUser`) merges that change in the same step, so the code never contradicts the architecture.
When a step proves the spec wrong, the CLAUDE.md working rhythm applies: say so, propose the
change, and edit the spec and the architecture only after approval. Each merging step adds its
sentence to the v12 change-log entry. Step 59 closes v12 and marks the spec as historical.

Spec section 19, row by row:

| Document / code (spec 19) | Change | Step |
|---|---|---|
| `docs/ARCHITECTURE.md` | Governance rule, F5 "in progress" in 1.1, v12 opened | 41 |
| | 5.3 table `calendar`; section 2 diagram and table (table, first calendar functions); 7.1 shared managed policies; 10 cost (10/10, 11/11 in total) | 43 |
| | Section 4 routes, their error codes, and section 3 who-can-call rows, for the routes of each step | 43, 44, 45, 46, 47, 48, 49, 50, 51 |
| | Section 4 `conflicts` field; section 6 diagram "availability edit with conflict" | 45 |
| | Section 6 "book" diagram; 7.1 `CalendarBookPolicy` and Cognito row; section 8 note on cognito-local `AdminGetUser` | 48 |
| | Section 6 "change" diagram | 50 |
| | Section 6.4 "delete user with appointments"; 7.1 `DeleteUserRole`; 7.3 residual risk (marker); section 8 `ListUsersInGroup` note | 51 |
| | Section 14 assumptions A1–A8 (confirmed); status line; v12 closed; anything the implementation proved different | 59 |
| `docs/IMPLEMENTATION_PLAN.md` | These steps (brief 41); the status line after each step | 41–59 |
| `docs/FRONTEND_SERVICES.md` | `api.ts` changes (16.1); settings, types and availability-rules services; `listUsers` | 53 |
| | `CalendarService`, `AppointmentsService`; behaviour of 16.3 | 54 |
| `docs/FOLDER_STRUCTURE.md` | `shared/src/calendar/` | 41 |
| `docs/RUNBOOK.md` (added in spec v2) | `CalendarTable` in the change-set check and the stack-removal procedure; `CalendarTimeZone` must not change once data exists | 43 |
| | Smoke test's calendar journey | 52 |
| | Deployment record | 55 |
| `CLAUDE.md` | Local notes: `calendar` table, journeys reset the table, `CALENDAR_*` variables | 43 |
| | Local-stack weight and its fallback, if one is applied | 51 |
| | "Where the truth lives" (spec merged), folder map, commands | 59 |
| `README.md` | New routes, curl examples, the `calendar` table | 59 |
| `shared/src/api.ts` | Error codes, `conflicts`, `UserSummary` (11.3) | 42 |
| `backend/src/handlers/deleteUser.ts` | 10.2 | 51 |
| `backend/template.yaml` | Table, parameter, policies and functions, per route step | 43–51 |
| `backend/scripts/local-seed.sh` | 14.4 | 43 |
| `backend/scripts/smoke.sh` | 18.4 | 52 |

#### Differences from the spec's outline (section 21) and why

| Outline | Plan | Why |
|---|---|---|
| 41 shared (all) | **41** time model · **42** contract and rules | The full shared package is about 1 300 lines with its tests, too much for one review. The DST code (`time.ts`) is the subtlest part of the feature and deserves a review of its own. |
| 42 table + `calendarDb` | merged into **43** with the settings routes (1, 2) | A table and a lock with no route can be tested only by mocks. The two settings routes are the smallest end-to-end slice. They prove the table, the time-zone check, the shared policies, the local environment and the journeys file before 19 more functions copy the pattern, which is what step 6 did for Hello World. |
| 43 settings + types | types alone in **44**, ending with the **O2 / local-weight checkpoint** | This is the first point where 6 calendar functions show the template's real size, and it comes before most functions exist. |
| 44 patterns + overrides + windows (8 routes) | **45** patterns · **47** overrides and one-off windows | 8 routes plus the overlap and conflict logic is too big for one review. Overrides and windows have no list route (11.1), so only the calendar view can show them. |
| 45 calendar view | moved to **46**, between patterns and overrides | It makes step 47's acceptance (AC-06 to AC-09) observable through the API. |
| 46 appointments (5 routes, AC-10 to AC-31, AC-34) | **48** book · **49** list, note, cancel · **50** change | Booking is one ordered list of checks (R-BOOK-01..11) and stays in one step. Cancel and note are small and share the lookup by id. Change reuses both and has the largest transaction, so it is reviewed alone. |
| 47 `GET /users` + `deleteUser` | **51**, unchanged, plus the second local-weight measurement | It must follow booking: AC-29 needs appointments. |
| 48 integration journeys + smoke | journeys spread over 43–51; what remains is **52** | Each step proves itself, and `verify` re-proves everything (see above). |
| 49 front-end services · 50 front-end journeys | **53** `api.ts` + settings, types, rules, users · **54** calendar + appointments, each with its journeys | Five services are too big for one review. A service step without its journeys would end untested against the real API. |
| 51 docs + deployment | **55** deployment · **59** documents and hand-over (after the rename, steps 56–58, `docs/RENAME_PLAN.md`) | Most documents are merged per step. Deployment needs explicit instruction and has an acceptance of its own (smoke in the cloud). The final documents record what deployment found, as steps 11 and 12 did. |

The back end comes before the front end. The contract can still move during steps 43–51 (the O2
decision, findings), and the services should target a stable contract. The CORS gap
(`FRONTEND_SERVICES.md` 10.3) means the browser cannot use the routes earlier anyway.

---

### Step 41 — Shared: the time model (≈ 4 h)

**Goal:** the time helpers of R-TIME-06, the primitive schemas and the defaults in `shared/`,
tested on daylight-saving days. The documentation rule for the calendar is set.

Files

- `shared/src/calendar/time.ts`: `toInstant(date, time, zone)` with the "compatible" rule of
  R-TIME-03, `localDateOf`, `localTimeOf`, `weekdayOf` (ISO, 1 = Monday), `addDays`, and
  `isValidTimeZone` (used by the back end's cold-start check in step 43). Only `Intl`, no date
  library (T6).
- `shared/src/calendar/schemas.ts`: the primitives only, `LocalDate` (a real calendar date),
  `LocalTime` (15-minute grid), `LocalEndTime` (also `24:00`), `Weekday`, `Instant` (exact
  `toISOString` form, seconds and milliseconds zero), `Ulid`, `Note`, `TypeName`.
- `shared/src/calendar/defaults.ts`: the default settings (section 9) and the limits of A5.
- `shared/src/index.ts`: re-exports.
- `docs/ARCHITECTURE.md`: change log v12 opened with the governance rule above; F5 in 1.1 as "in
  progress". `docs/FOLDER_STRUCTURE.md`: the `shared/src/calendar/` folder.

Tests (`shared/tests/calendar/time.test.ts`, `schemas.test.ts`)

- `Europe/Rome` spring forward (2027-03-28: 02:30 becomes 03:30), fall back (2026-10-25: 02:30 takes
  the earlier occurrence), and a zone with a non-whole-hour offset (`Asia/Kathmandu`, +05:45).
- `24:00` as an end only, a leap day (2028-02-29 valid, 2027-02-29 invalid), weekday across a year
  boundary.
- `Instant` rejects `…T09:00Z`, a non-zero second and a `+01:00` offset. `Note` rejects 501
  characters and control characters, but accepts a line feed.

**Acceptance:** `npm run test:unit -w @shared-calendar/shared` green with 100 % lines, the DST cases
included. The time half of AC-35 is proven at helper level: 01:00 + 60 real minutes on 2027-03-28 is
03:00 local. The root `verify` is green.

---

### Step 42 — Shared: contract and rules (≈ 5 h)

**Goal:** the whole calendar contract (11.2–11.6) and the pure rules of section 12 in `shared/`,
before any handler uses them.

Files

- `shared/src/api.ts`: the 20 error codes of 11.3, `AppointmentConflict`, the optional
  `conflicts` field of `ApiErrorBody`, `UserSummary`, `ListUsersResponse`.
- `shared/src/calendar/types.ts`: the response types of 11.5 and 11.6, `Actor`,
  `CalendarEventType`.
- `shared/src/calendar/schemas.ts`: the bodies and queries of 11.2 and 11.4, `.strict()`, with the
  cross-field rules (`start < end`, `validFrom ≤ validUntil`, spans ≤ 31 or 92 days, `upcoming`
  exclusive with `from`/`to`).
- `shared/src/calendar/rules.ts`: `definedWindows`, `effectiveWindows`, `slotsOf`, `overlaps`,
  `isWholeLocalHour`, `isOnQuarterGrid`, `cancellableUntil`.

Tests: every schema bound. Pattern validity edges (inclusive `validUntil`, open end). An override
replaces the patterns, including the empty list. One-off windows add on an override day. Adjacent
windows merge only when they have the same type. Slots of a window 08:30–12:00 (09, 10, 11) and of
08:00–08:45 (none). The DST day 01:00–04:00 gives two slots. Touching windows do not overlap.

The widened `ApiErrorCode` must not break the front end's typed failure unions. The root `npm run
typecheck` proves it. If an exhaustive mapping needs a new branch, the step adds it with no change
in behaviour.

**Acceptance:** shared unit tests 100 %. The rule tests contain AC-04 (window and slots of
2026-11-16), AC-08 (merge and the 12:00 slot) and AC-35 (two slots) at the level of the pure
functions. Root `npm run typecheck` and `verify` green.

---

### Step 43 — Back end: calendar table, lock and settings (first slice) (≈ 6 h)

**Goal:** the first end-to-end calendar slice: table, time-zone parameter, the lock of 13.4, routes
1 and 2, and the journeys file. It is the model the other 19 functions copy.

Files

- `backend/template.yaml`:
  - `CalendarTable` (13.1: `PK`/`SK`, provisioned 10/10, deletion protection, default encryption,
    no index, no stream), parameter `CalendarTimeZone` (default `Europe/Rome`, A1), output
    `CalendarTableName`;
  - `CalendarReadPolicy` and `CalendarWritePolicy` (`AWS::IAM::ManagedPolicy`, resource: the
    table's ARN only);
  - `GetCalendarSettingsFunction` and `UpdateCalendarSettingsFunction`, each with its log group and
    its role (inline `write-own-logs` only), using `Globals` as far as SAM allows (14.3).
- `backend/scripts/local-seed.sh`: creates `calendar` idempotently. `env.local.json` gains
  `CALENDAR_TABLE` and `DYNAMODB_ENDPOINT` once, in the env-vars file's `Parameters` section,
  which `sam local` applies to every function declaring the variable. Later steps then add no seed
  lines. `CALENDAR_TIME_ZONE` comes from the `CalendarTimeZone` parameter only: a value in the file
  would override it (spec 14.4, v4).
- `backend/src/lib/calendarDb.ts`:
  - configuration read once per container: `CALENDAR_TABLE`, plus `CALENDAR_TIME_ZONE` checked with
    `isValidTimeZone` (an invalid zone makes every request answer 500, R-TIME-01);
  - the lock loop of 13.4: at most 3 attempts, 50–150 ms random wait, `ConcurrentUpdateError`.
    It tells a failure of the `LOCK` condition from other condition failures by the index in
    `CancellationReasons`;
  - `getSettings` (defaults when absent, R-SET-01) and `putSettings`.
- `backend/src/handlers/getCalendarSettings.ts`, `updateCalendarSettings.ts` (R-SET-01..03; `now`
  computed once per request, R-TIME-04).
- `backend/tests/integration/setup.ts`: `resetCalendarTable()` (refuses a non-local endpoint) and
  `putCalendarItem()` (direct writes, for later steps). New `calendar.test.ts`.
- Documents: the step-43 rows of the table above (architecture 2, 5.3, 7.1, 10; RUNBOOK; CLAUDE.md).

Tests: `calendarDb` with `aws-sdk-client-mock`:
- the lock on first use (`attribute_not_exists`) and on later uses;
- cancelled twice then success;
- three times, then `concurrent_update`;
- a non-lock cancellation is not retried;
- the wait is bounded (fake timers).

Handlers: both roles, a token in neither group (403), validation (`.strict()`, missing field,
range), `updatedBy`, and the log line.

**Acceptance:**
- unit tests green, 100 % on `backend/src/lib`;
- after `local:up`, http://localhost:8001 shows an empty `calendar` table;
- journeys: AC-01 (defaults, `updatedAt: null`), AC-02 (User `PUT` → 403), and `PUT` then `GET`
  as the Administrator;
- once, by hand: `local:api` with `CalendarTimeZone=Not/AZone` answers 500 to `GET
  /calendar/settings`;
- `grep` of the new policies shows no `*` in any action or resource;
- `sam validate --lint` and the root `verify` green.

---

### Step 44 — Availability types and the template checkpoint (≈ 5 h + PO review)

**Goal:** routes 3–6, then the explicit check of open point O2 and the first measurement of the
local stack's weight, while only 6 of the 21 calendar functions exist.

Files

- `backend/template.yaml`: four functions; `CalendarDeletePolicy`.
- `calendarDb.ts`: type writes under the lock (uniqueness on `nameKey` among all types read inside
  the locked attempt), plus the reads that R-TYPE-03 needs: patterns, overrides and one-off windows
  from today on, and active appointments not yet ended. Those partitions stay empty until steps
  45–48, but reading them now keeps the check complete.
- `backend/src/lib/calendarRules.ts` (new): `checkTypeName`, `checkTypeDelete`.
- Handlers `listAvailabilityTypes.ts`, `createAvailabilityType.ts`, `renameAvailabilityType.ts`,
  `deleteAvailabilityType.ts`.

Tests:
- R-TYPE-01..04, including the limit of 20;
- `checkTypeDelete`: a pattern, a future override and a future appointment block the delete
  (AC-28 at unit level); yesterday's override and an ended appointment do not.

Journeys: AC-03, list sorted by name, rename, delete of an unused type (204), unknown id (404).

**Checkpoint O2 and local weight (part of the acceptance).**
1. *Template size.* Count the lines of one calendar function (function, `Metadata`, log group,
   role) and of the shared policies. Extrapolate to 21 functions plus the `deleteUser` changes,
   and compare with the spec's estimate (+1 450).
2. *Readability.* A reviewer reads one function block and the policies, and answers: "can I say
   what this function may do in under a minute, without opening another file?"
3. *Local weight, measurement 1* (10 functions): time from `npm run local:api` to the first answer,
   the memory sum from `docker stats --no-stream`, and `free -m`. Extrapolate to 25 functions on
   this Codespace (2 cores, 7 GB).
4. *Decision.* Present 1–3 to the PO. Either T2 stands and the plan continues, or the PO switches to
   one function per resource. That is a spec change (T2, 14.1, 14.3) and steps 45–51 are re-cut
   before they start. The weight is an input to this decision but not a reason on its own: the
   cloud design does not follow the laptop. **Stop until the PO answers.** Record the answer in
   spec 22 (O2) and in the architecture's v12 entry.

The fallback for the local stack's weight is decided here too. If the extrapolation exceeds about
5 GB of memory or 3 minutes of start-up:
1. switch `warm_containers` in `samconfig.toml` `[local]` from `EAGER` to `LAZY`, so each container
   starts on its first call and the journeys pay one cold start per function;
2. if that is still too heavy, use a 4-core, 16 GB Codespace machine type.

The 10 s timeout must still hold for a cold start under `LAZY`.

**Acceptance:** AC-03 and the type journeys green; root `verify` green; the O2 report presented and
the PO's T2 decision recorded.

---

### Step 45 — Weekly patterns, overlap and conflict checks (≈ 6 h)

**Goal:** routes 7–10 with the full availability-write check (R-AV-01..05), which steps 47–48 reuse.

Files

- `backend/template.yaml`: four functions.
- `calendarDb.ts`: pattern items; reads of one-off windows in a date range and of active
  appointments not yet ended (13.2, `SK ≥ now − 24 h`).
- `calendarRules.ts`: `checkAvailabilityWrite(write, state, now)`. It covers every row of the table
  in 6.5, so the override and one-off kinds used in step 47 are tested now. It checks the calendar
  "as it would be after the write" against active appointments (R-AV-03, R-AV-04).
- `backend/src/lib/http.ts`: `error()` accepts `conflicts`.
- Handlers `listPatterns.ts`, `createPattern.ts`, `updatePattern.ts`, `deletePattern.ts`.

Tests:
- every 6.5 row; touching windows allowed; validity intersections, open-ended included;
- R-AV-02 (past one-offs ignored); limit 50 (R-PAT-04);
- conflicts: an override `[]` (AC-25), a type change (AC-26), an extension (AC-27), an appointment
  in progress counts, an ended one does not;
- `conflicts` is in the body, never in the log line.

Journeys: AC-05. AC-28 end to end: the type used by a pattern gives 409, and after the pattern is
deleted the type deletes with 204. Also: list order (weekday, start), update as full replacement,
unknown id (404). AC-25..27 end to end come in step 48, the first step where appointments exist.

**Acceptance:** AC-05 and AC-28 journeys; AC-25..27 in unit tests; root `verify` green.

---

### Step 46 — The calendar view (≈ 5 h)

**Goal:** route 15, the read that every later step uses to observe the calendar.

Files

- `backend/template.yaml`: `GetCalendarFunction`.
- `http.ts`: `parseQuery()`.
- `calendarDb.ts`: range reads of overrides, one-off windows and appointments.
- Handler `getCalendar.ts`, which returns:
  - the defined windows, unmerged (T11);
  - the slots from the effective windows minus active appointments: R-SLOT-03 for a User,
    R-SLOT-04 for the Administrator;
  - `busy` for Users;
  - `source`, `sourceId` and `hasOverride` for the Administrator;
  - the appointments array (all for the Administrator, own for a User);
  - `generatedAt`.

Tests: the example of 11.6, byte for byte, with the clock fixed at 2026-11-10T09:00Z. The
Administrator's view of the same day. A past date shows its windows with no slots (R-VIEW-03, A3).
Ranges: `from > to`, 32 days, invalid date.

Journeys: AC-04 (a pattern; the next Monday at least 8 days ahead), AC-33, AC-35 (the next
spring-forward Sunday in the calendar zone, found with the shared helpers; two slots of 60 real
minutes).

**Acceptance:** AC-04, AC-33 and AC-35 journeys; root `verify` green.

---

### Step 47 — Date overrides and one-off windows (≈ 5 h)

**Goal:** routes 11–14, observed through the view.

Files: four functions in `template.yaml`; override and window writes in `calendarDb.ts`; handlers
`setOverride.ts`, `deleteOverride.ts`, `createOneOffWindow.ts`, `deleteOneOffWindow.ts`. The checks
come from step 45.

Tests: `date_in_past` (yesterday, and today accepted), limits of 10 windows, R-OVR-01..03,
R-ONE-01..03, `override_not_found`, `window_not_found`.

Journeys:
- AC-06, AC-07, AC-08 (the merged window offers 12:00), AC-09;
- deleting an override brings the patterns back;
- deleting an override whose returning pattern window would overlap a one-off window of that date
  answers 409 `availability_overlap` (6.5, last row).

**Acceptance:** AC-06 to AC-09 journeys; root `verify` green. Checkpoint: availability is complete.

---

### Step 48 — Booking and the event log (≈ 7 h, the largest step)

**Goal:** route 17 with every rule of 8.2 and the event of section 15.

Files

- `backend/template.yaml`: `BookAppointmentFunction` with `CalendarBookPolicy`, an inline Cognito
  statement (`AdminGetUser`, `AdminListGroupsForUser`, pool ARN only), and `USER_POOL_ID`,
  `COGNITO_ENDPOINT`.
- `backend/src/lib/cognito.ts`: `getUserSub(username)`, `isPlainUser(username)`.
- `backend/src/lib/calendarEvents.ts` (new, pure): the event item of 15.2, `schemaVersion: 1`.
- `calendarRules.ts`: `checkBooking`, R-BOOK-01..11 in table order with the Administrator's
  exemptions.
- `calendarDb.ts`: the booking transaction (lock, `APPT`, `APPTID` pointer, `EVENT`, and a
  `ConditionCheck` that `DELETEDUSER#<sub>` does not exist). A failed marker check answers
  `user_not_found` (R-BOOK-10).
- Handler `bookAppointment.ts`, including `cancellableUntil` and `typeNameAtBooking`.

Why not split: R-BOOK-01..11 are one ordered list where the first failure decides the answer. A
booking step with half the rules would accept bookings that the next step would refuse.

Tests:
- every R-BOOK row for both roles, and the order of the checks;
- AC-10 to AC-19 with their exact dates;
- AC-34: the first transaction is cancelled on the lock, the re-read finds the slot taken, and the
  answer is 409 `slot_taken`;
- the marker answers 404; the event shape; the note is absent from the log line.

Journeys (`dave` and `erin` created here):
- AC-10, with the event read from the table;
- AC-11, AC-12 (`erin`'s view has the busy interval, and the response text contains neither
  `dave` nor the appointment id);
- AC-13 to AC-16;
- AC-17 (horizon 7, a slot 8 or more days ahead);
- AC-18 (notice 720 h);
- AC-19 (limit 1);
- AC-25 to AC-27 end to end;
- AC-34 with `Promise.all` (one 201, one 409, spec v2 wording).

The settings are restored at the end.

**Acceptance:** the journeys above and the unit tests; root `verify` green.

---

### Step 49 — Listing, note and cancel (≈ 6 h)

**Goal:** routes 16, 18 and 19, and the ownership rule R-PERM-01.

Files:
- `template.yaml`: three functions;
- `calendarDb.ts`: lookup by id through the pointer, the cancel transaction (3 items) and the
  note transaction (3 items), each with its event;
- `calendarRules.ts`: `checkCancel`, `checkNote`;
- handlers `listAppointments.ts`, `updateAppointmentNote.ts`, `cancelAppointment.ts`.

Tests:
- AC-20 and AC-21 on their exact instants: exactly 24 h before is allowed, one minute later is
  refused;
- AC-30 (404, not 403), AC-31;
- the Administrator cancels an appointment in progress;
- every query variant of route 16: a range up to 92 days, `upcoming`, `username` (403 for a User
  naming someone else), `status`;
- R-NOTE-01..02.

Journeys:
- AC-20; AC-21 (notice 720 h; then the Administrator cancels);
- AC-30; AC-31 (an ended appointment written directly);
- a User's history with `status=all` (A6);
- the note is edited and its event written;
- the slot is free again in the view after a cancel.

**Acceptance:** the journeys above; root `verify` green.

---

### Step 50 — Change (≈ 5 h)

**Goal:** route 20, atomic cancel and book (D16).

Files:
- `template.yaml`: `ChangeAppointmentFunction` with `CalendarBookPolicy`;
- `calendarRules.ts`: `checkChange`, which reuses `checkCancel` and `checkBooking` with the two
  adjustments of R-CHG-01;
- `calendarDb.ts`: the change transaction (6 items, one `appointment.changed` event with
  `previous`);
- handler `changeAppointment.ts`.

Tests: AC-22 to AC-24; the note is carried over or cleared (R-CHG-03); the notice applies to the
old appointment and the booking rules to the new one; the limit does not count the old one; a
failure leaves the old appointment `booked`.

**Acceptance:** AC-22 to AC-24 journeys; root `verify` green. Checkpoint: appointments are complete.

---

### Step 51 — Users: listing, and deletion with appointments (≈ 5 h)

**Goal:** route 21 and the new behaviour of `DELETE /users/{username}` (10.2). This is the only
step that changes an existing route.

Files

- `backend/template.yaml`: `ListUsersFunction` (inline `ListUsersInGroup`, pool ARN only).
  `DeleteUserRole` gains `CalendarReadPolicy`, `CalendarWritePolicy` and `AdminGetUser`.
  `DeleteUserFunction` gains `CALENDAR_TABLE`.
- `cognito.ts`: `listPlainUsers()`, both groups with pagination.
- `calendarDb.ts`: `markUserDeleted`, `cancelFutureAppointmentsOf(userId)` in transactions of at
  most 40 appointments, each under the lock.
- `deleteUser.ts`: steps 1–4 of 10.2 (marker and cancellations before any Cognito change); R-DEL-01.
- Handler `listUsers.ts`.

Tests:
- pagination over several pages; the admin is excluded; sorted by username;
- 41 appointments give two transactions;
- a failure before Cognito answers 500 and makes no Cognito call;
- a repeated delete is idempotent;
- the existing `deleteUser` cases keep their outcomes.

Journeys:
- AC-32: `alice`, `dave` and `erin` are listed, `admin` is not;
- AC-29: `dave` with two future appointments and one past one written directly. `dave`'s token is
  taken before the delete. After the delete, two appointments are `cancelled`/`user_deleted` with
  two events, the past one is unchanged, and booking with the old token answers 404
  `user_not_found`;
- step 9's `carol` journeys still pass.

*Local weight, measurement 2* (25 functions): the measurements of step 44. If needed, apply the
fallback chosen there and record it in `CLAUDE.md`.

**Acceptance:** AC-29 and AC-32 journeys; the measurement recorded; root `verify` green.

---

### Step 52 — Back end closing: smoke test, logs, repeatability (≈ 4 h)

**Goal:** the back end is complete and provably repeatable.

- `backend/scripts/smoke.sh`: the calendar journey of 18.4, run before the journey that deletes the
  throw-away user. It needs only node, curl and the AWS CLI, with the portability rules of
  CLAUDE.md.
- `docs/RUNBOOK.md`: the smoke test's calendar lines.
- AC-36 end to end. Run the journeys with `local:api`'s output captured to a file in the
  scratchpad, then search the file for the journeys' note text and for any request or response
  body. Zero hits is the pass.

**Acceptance:** root `DYNAMODB_PORT=8002 npm run verify` green **twice in a row**;
`DYNAMODB_PORT=8002 npm run smoke -w backend -- local` all PASS; the AC-36 search finds nothing.
Checkpoint: the back end is complete.

---

### Step 53 — Front end: `api.ts` and the settings, types and availability services (≈ 6 h)

**Goal:** 16.1 and the Administrator's management services, following `FRONTEND_SERVICES.md`
section 3 without exception.

Files

- `frontend/src/services/api.ts`: methods `GET`, `PUT`, `PATCH`; `query` through
  `URLSearchParams`; `conflicts` on `ApiFailure`.
- `calendar-settings.service.ts`/`.types.ts`, `availability-types.service.ts`/`.types.ts`,
  `availability-rules.service.ts`/`.types.ts`; `users.service.ts` gains `listUsers()`.
- `frontend/tests/integration/calendar.test.ts` (new): the throw-away User `fe-calendar` is created
  and removed through `UsersService`; it covers settings, types, patterns, overrides, windows and
  `listUsers`, on dates and types owned by the test.
- `docs/FRONTEND_SERVICES.md` (v6): the sections for 16.1 and these services.

Tests (16.6): success; request shape (method, path, query, body); every route error code;
`session_rejected`; `not_signed_in`; `invalid_request` with no request sent (16.4); network failure
then success; cancel of a pending call; late subscriber.

**Acceptance:** `npm run verify -w frontend` green with 100 % on `frontend/src`;
`RUN_INTEGRATION=1 npm run test:integration -w frontend` green; root `verify` green.

---

### Step 54 — Front end: `CalendarService` and `AppointmentsService` (≈ 6 h)

**Goal:** the services of routes 15–20, with the behaviour of 16.3.

Files: `calendar.service.ts`/`.types.ts`, `appointments.service.ts`/`.types.ts`, their unit tests,
the remaining journeys in `frontend/tests/integration/calendar.test.ts`, and `FRONTEND_SERVICES.md`
(v7, or the same v6 if step 53 is not yet reviewed).

Journeys: load a week; book a free slot; edit the note; change; cancel; `upcoming`; an override
refused with `availability_conflict` exposes `conflicts`.

**Acceptance:** as in step 53. Checkpoint: the services layer is complete.

---

### Step 55 — Cloud deployment (≈ 2 h, needs explicit instruction)

**Needs explicit instruction from the PO, in the request that starts the step** (CLAUDE.md, cloud
safety):
- `npm run deploy -w backend`, the stack update;
- `npm run smoke -w backend -- hello-world-api`, which creates and deletes a real user and writes
  rows;
- any `aws` command that changes a resource, for example re-subscribing the alarm e-mail.

Read-only commands (`describe-stacks`, stack outputs, logs) need only an SSO session.

1. Confirm A1 one last time: `CalendarTimeZone` = `Europe/Rome`. After the first calendar data
   exists it cannot be changed (spec 1.3).
2. Commit; on a clean tree, root `DYNAMODB_PORT=8002 npm run verify` green, less than 30 minutes
   before the deploy.
3. `npm run deploy -w backend`, without `AlertEmail`: SAM reuses the stored value. This is the
   first update since step 11, so the reuse is untested. If the deploy asks for the address or
   fails on it, pass `--parameter-overrides AlertEmail=<address>` on the command line, never in
   `samconfig.toml`.
4. Review the change set (RUNBOOK):
   - *Add* for `CalendarTable`, the 21 functions with their roles, log groups and permissions, and
     the 4 managed policies (89 resources);
   - *Modify* for `DeleteUserFunction`, `DeleteUserRole`, the API (the routes are part of its
     definition, not resources of their own) and the other three functions' code;
   - **any Remove or Replace of `MessagesTable`, `CalendarTable`, `UserPool` or `AdminUser`: answer
     N** and investigate.
5. `npm run smoke -w backend -- hello-world-api`.
6. Console checks:
   - the `calendar` table holds the smoke appointment and its two events, with deletion protection
     on and capacity 10/10;
   - the `BookAppointmentFunction` logs contain no note and no body (AC-36 in the cloud);
   - `sam list stack-outputs` shows `CalendarTableName`;
   - the alarms are unchanged;
   - the Cost Explorer forecast is still about 0 USD (11/11 provisioned units, inside the free
     25/25).
7. `docs/RUNBOOK.md`: the deployment record.

**Acceptance:** smoke test all PASS in the cloud, including the calendar journey of 18.4; the
console checks of item 6. Checkpoint: deployed.

---

### Step 56 — Rename the repository to "shared-calendar" (≈ 2 h, no cloud change)

What, why and how to go back: `docs/RENAME_PLAN.md` (decisions R1–R8, section 5). In short: the
template names its tables after the stack, `samconfig.toml` names the new stack
`shared-calendar-api`, the local Docker network and compose project, the AWS CLI profile and every
document follow; `deploy.sh` refuses the old stack's name. The Hello World feature keeps its name.
The operator stops the local stack before the change, adds the new profile beside the old one and
restarts the local stack after it (`docs/RENAME_PLAN.md` section 5.3).

**Acceptance:** `docs/RENAME_PLAN.md` section 5.2.

---

### Step 57 — Deploy the new stack `shared-calendar-api` (≈ 2 h, needs explicit instruction)

**Needs explicit instruction from the PO**, like step 55: the first deploy of a new stack (with
`AlertEmail`), `bootstrap-admin`, `budget`, `smoke`. The old stack is not touched. Run it soon after
step 56: in between, the repository names a stack that does not exist yet.

The procedure is `docs/RENAME_PLAN.md` section 6.1 (which follows `docs/RUNBOOK.md` section 3).

**Acceptance:** change set only Add; stack `CREATE_COMPLETE` with five outputs; subscription
confirmed the same day; budget `shared-calendar-api-monthly`; smoke test 19/19 PASS; the read-only
checks of step 55 on the new stack; `README.md` ids and `docs/RUNBOOK.md` record updated.

---

### Step 58 — Retire the old stack `hello-world-api` (≈ 1 h, needs explicit instruction)

**When the PO decides**, after the new stack has run without problems for a while (one week as a
minimum). After this step there is no way back to the old stack (`docs/RENAME_PLAN.md`
section 4.3). Every cloud command needs its own go: lifting deletion protection on `hello-messages`,
`calendar` and the user pool, deleting the stack, deleting the budget `hello-world-api-monthly`.
The procedure is `docs/RENAME_PLAN.md` section 6.3.

**Acceptance:** `describe-stacks --stack-name hello-world-api` answers that the stack does not
exist; the budget is gone; the new stack's smoke test still passes; the old profile removed from
`~/.aws/config`; `docs/RENAME_PLAN.md` status "done".

---

### Step 59 — Documentation and hand-over (≈ 3 h)

- `docs/ARCHITECTURE.md`: close v12; status "v1 and shared calendar implemented"; section 14 with
  A1–A8 as confirmed; anything the implementation proved different.
- `docs/SHARED_CALENDAR_SPEC.md`: status "merged into ARCHITECTURE v12; historical: the
  architecture wins".
- `README.md`: the calendar routes, curl examples (view a week, book, cancel), where to see the
  `calendar` table.
- `CLAUDE.md`: "Where the truth lives", the folder map (new handlers, `lib` modules,
  `shared/src/calendar/`, front-end services), commands.
- This plan: status line. Proposed tag `v1.1.0` (new routes, compatible API), only when instructed.

**Acceptance:**
- a colleague can follow the README from a clone to booking an appointment locally with curl;
- no document still calls the calendar "not implemented";
- every row of the calendar traceability table (section 1.1) points to a step whose acceptance
  passed.

---

## 4. Order of work and checkpoints

```
0 prerequisites
1 scaffold ──► 2 template ──► 3 local stack ──► 4 libs ──► 5 authorizer ──► 6 hello
                                                                   │
                                            7 createUser ◄─────────┘
                                            8 deleteUser
                                            9 integration tests
                                            10 scripts + gate
                                            11 first deployment     (checkpoint: smoke PASS)
                                            12 docs + tag v1.0.0
                                            20 monorepo move        (done; backend/, shared/)
```

Suggested checkpoints to commit and, if wanted, push: after step 3 (local stack runs), after step 6 (first end-to-end call works locally), after step 9 (all tests green), after step 11 (deployed).

Shared calendar:

```
41 time model ──► 42 contract + rules                               (shared/)
        │
        ▼
43 table + lock + settings ──► 44 types ══ O2 / weight checkpoint: STOP for the PO (T2)
        │
        ▼
45 patterns ──► 46 calendar view ──► 47 overrides + one-off windows   (availability complete)
        │
        ▼
48 book ──► 49 list, note, cancel ──► 50 change ──► 51 users + deleteUser
        │
        ▼
52 smoke, logs, verify twice                                          (back end complete)
        │
        ▼
53 api.ts + management services ──► 54 calendar + appointments services
        │
        ▼
55 cloud deployment (explicit instruction) ──► 56–58 rename to shared-calendar ──► 59 documents + tag
```

The order is strict: each step uses what the previous ones built. The back end comes first so the
front-end services target a stable contract.

Suggested calendar checkpoints to commit (and push, if wanted):

| After step | Why |
|---|---|
| 43 | First calendar slice runs end to end; the pattern for every other function is set |
| 44 | Before the T2 decision: a clean base if the PO re-cuts steps 45–51 |
| 47 | Availability complete |
| 50 | Appointments complete |
| 52 | Back end complete, `verify` green twice |
| 54 | Services layer complete |
| 55 | Deployed (the deploy needs a clean, committed tree anyway) |
| 56 | Repository renamed (`docs/RENAME_PLAN.md` section 5); the commit to revert to go back to stage 0 |
| 57 | New stack `shared-calendar-api` deployed |
| 58 | Old stack retired |

---

## 5. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| cognito-local differs from real Cognito for one of the six admin APIs used | medium | Adapter in `cognito.ts` is unit-tested against the real SDK command shapes; step 11's smoke test runs the same journeys against real Cognito before declaring v1 done |
| `sam local` Lambda authorizer behaves differently from the deployed one (SAM's own disclaimer) | low | Authorizer logic is covered by unit tests with real RSA-signed tokens; smoke test covers the deployed path |
| `AWS::Cognito::UserPoolUser` cannot be updated in place (CloudFormation replaces it) | low | Never change `AdminUsername` after the first deploy; documented in README |
| Operator forgets `bootstrap-admin` after the first deploy | medium | `smoke.sh` fails fast with a hint; README step list |
| `npm audit` fails the gate on a transitive advisory with no fix | medium | Gate uses `--audit-level=high`; a documented override requires a comment in `deploy.sh` with the advisory id and a date |
| Docker network name clashes on the developer machine | low | Network name is configurable through `LOCAL_NETWORK` env in scripts |

Shared calendar (steps 41–59):

| Risk | Likelihood | Mitigation |
|---|---|---|
| 25 functions under `sam local start-api` with `EAGER` warm containers are too heavy for the Codespace (2 cores, 7 GB) | medium | Measured in step 44 (10 functions, extrapolated) and step 51 (25). Fallback: `warm_containers = LAZY`, then a 4-core / 16 GB machine type. The cloud design does not change for the laptop |
| The template becomes hard to review (open point O2) | medium | Explicit checkpoint in step 44, with only 6 calendar functions; the PO decides on T2 before steps 45–51 |
| Time-zone code is wrong on DST days or in unusual zones | medium | One implementation in `shared/` (step 41), tested on spring-forward, fall-back and a +05:45 zone; AC-35 end to end in step 46; journeys compute dates with the same helpers, never with fixed offsets |
| DynamoDB Local reports transaction cancellations differently from the cloud (`CancellationReasons`), so the lock retry or the deleted-user check misbehaves only in the cloud | low | Unit tests use the documented SDK shapes; the journeys exercise the real local path; the cloud smoke test books and cancels. A cloud-only difference is a finding for step 55 |
| Deleting a User with many appointments needs up to 82 items per transaction (164 write units against 10 provisioned) | low | DynamoDB's burst capacity (up to 5 minutes of unused capacity) absorbs it; if throttled, the answer is 500 before any Cognito change and the delete is safe to repeat (R-DEL-01) |
| A fixed-"now" scenario passes in unit tests but the relative-date journey drifts (week boundaries, DST weeks) | low | Journeys derive every date from the shared helpers and pick dates at least 8 days ahead; both proofs are required for each AC |
| The back-end journeys empty the local `calendar` table, losing hand-made test data | low | Approved (spec 18.2, v2); the table is in-memory anyway; the reset refuses any non-local endpoint |
| The stored `AlertEmail` is not reused by the first update since step 11 | low | Step 55 item 3: pass it on the command line, never in `samconfig.toml` |
| Widening `ApiErrorCode` breaks the front end's typed failure unions | low | Step 42 runs the root `typecheck` over all three packages |
| The change set of step 55 replaces a stateful resource | low | RUNBOOK change-set check (extended in step 43): any Remove/Replace of a table, the pool or the admin user is answered N |

---

## 6. Out of scope for v1 (follow-ups, in suggested order)

1. **Admin-driven password reset** `POST /users/{username}/password` (architecture 7.4 option A, ≈ 1 h): copy `createUser`, drop the create and group calls, keep `setPermanentPassword`.
2. Self-service password change documentation (option B, client-side only).
3. Forgot-password with e-mail (option C).
4. GitHub Actions workflow running `verify` on every push (needs Docker-in-CI; the local stack already works headless).
5. Listing a user's messages (`GET /messages`) with the `byUser` GSI.
6. MFA and SRP sign-in, both pool-side switches.

Shared calendar follow-ups (spec 21), not in steps 41–59:

1. E-mail notifications (spec section 15.3): DynamoDB Streams on `calendar`, a notifier Lambda, Amazon SES. The event items written since step 48 are its input.
2. Date-range closures as one operation.
3. Fortnightly and monthly patterns.
4. Per-User settings.
5. A "force" option for availability changes that cancels the affected appointments through the normal path.
6. Per-day locks instead of the global lock, if load ever grows (spec 13.4, T3).
7. The user interface: `docs/FRONTEND_ARCHITECTURE.md`, the views of spec 16.8, R-TIME-05, and the CORS gap.

---

## 7. Definition of done for v1

- All twelve steps' acceptance checks pass.
- `npm run verify` is green on a clean clone.
- The stack is deployed, the smoke test passes, the alarm e-mail subscription is confirmed and the budget is visible in the Budgets console.
- `docs/ARCHITECTURE.md` reflects what was built; commit tagged `v1.0.0`.

Shared calendar (steps 41–59) is done when:

- every acceptance check of steps 41–59 has passed, including the PO's T2 decision in step 44;
- root `npm run verify` is green on a clean clone, with 100 % line coverage on `shared/src`, `backend/src/lib` and `frontend/src`, and the front-end journeys green with `RUN_INTEGRATION=1`;
- the stack is deployed and the smoke test, with its calendar journey, passes in the cloud;
- `docs/ARCHITECTURE.md` v12 describes the calendar, and the spec is marked historical; every row of the calendar traceability table (section 1.1) is delivered.
