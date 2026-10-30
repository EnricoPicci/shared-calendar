# Hello World API — Implementation Plan

| | |
|---|---|
| Status | v1 — derived from `docs/ARCHITECTURE.md` v2 (2026-10-27), aligned with v4 (2026-10-28) |
| Date | 2026-10-28 |
| Scope | Everything needed to go from an empty repository to a deployed, smoke-tested v1 |

---

## 1. How to use this plan

The plan is a sequence of **steps**. Each step lists what to build, the files it touches, and an **acceptance check** that must pass before moving on. Steps are ordered so that every step produces something runnable or testable; nothing is "wired later".

Conventions used throughout:

- Paths are relative to the repository root. The layout is the one in architecture section 12.
- "Unit" tests run with `vitest` and no Docker. "Integration" tests need the local Docker stack (architecture section 8).
- Effort figures are indicative, for a developer who knows TypeScript but is new to SAM. Total: roughly 3 working days.
- The architecture document is the source of truth for behaviour. Where this plan quotes a value (token lifetime, password policy, IAM action), the architecture wins if they ever differ.

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
| `Budget` | `AWS::Budgets::Budget` | 1 USD monthly, e-mail notification to parameter `AlertEmail` |
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
2. `npm run deploy -- --guided` once (the gate applies to the first deployment too): stack `hello-world-api`, region of choice, parameters `AdminUsername`, `AlertEmail`; accept the IAM capability prompt; save to `samconfig.toml`.
3. `npm run bootstrap-admin hello-world-api` and choose the admin password.
4. `npm run smoke hello-world-api`.
5. Confirm the SNS subscription e-mail ("AWS Notification - Subscription Confirmation") sent to `AlertEmail`; until then the error alarms send nothing. Then, in the AWS console, open Billing → Budgets and check that `hello-world-api-monthly` exists with a 1 USD limit and `AlertEmail` as recipient (budget alerts need no confirmation).
6. In the AWS console, open DynamoDB → `hello-messages` → Explore items: the two smoke-test rows are visible (N4 in the cloud).
7. Record `ApiUrl`, `UserPoolId`, `UserPoolClientId` in the README (they are not secrets).

**Acceptance:** smoke test PASS; `sam list stack-outputs` shows the four outputs; AWS Cost Explorer forecast for the month is 0 USD apart from the API Gateway fraction of a cent.

---

### Step 12 — Documentation and hand-over (≈ 2 h)

- `README.md`: purpose, prerequisites, the five everyday commands (`local:up`, `local:api`, `verify`, `deploy`, `smoke`), how to sign in with curl and call each endpoint, how the admin creates and deletes users, where to look at the data (dynamodb-admin locally, console in the cloud), how to rotate the admin password.
- `docs/ARCHITECTURE.md`: update the status line to "implemented, v1" and fix anything the implementation proved different.
- Tag the commit `v1.0.0`.

**Acceptance:** a colleague can follow the README from clone to a passing `npm run verify` without asking questions.

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
```

Suggested checkpoints to commit and, if wanted, push: after step 3 (local stack runs), after step 6 (first end-to-end call works locally), after step 9 (all tests green), after step 11 (deployed).

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

---

## 6. Out of scope for v1 (follow-ups, in suggested order)

1. **Admin-driven password reset** `POST /users/{username}/password` (architecture 7.4 option A, ≈ 1 h): copy `createUser`, drop the create and group calls, keep `setPermanentPassword`.
2. Self-service password change documentation (option B, client-side only).
3. Forgot-password with e-mail (option C).
4. GitHub Actions workflow running `verify` on every push (needs Docker-in-CI; the local stack already works headless).
5. Listing a user's messages (`GET /messages`) with the `byUser` GSI.
6. MFA and SRP sign-in, both pool-side switches.

---

## 7. Definition of done for v1

- All twelve steps' acceptance checks pass.
- `npm run verify` is green on a clean clone.
- The stack is deployed, the smoke test passes, the alarm e-mail subscription is confirmed and the budget is visible in the Budgets console.
- `docs/ARCHITECTURE.md` reflects what was built; commit tagged `v1.0.0`.
