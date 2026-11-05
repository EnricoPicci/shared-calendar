## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
```

No AWS login is needed: this step does not touch the cloud.

## Brief

Implement `SessionStore`, `RefreshService`, `HelloService` and `UsersService` in `frontend/`.
Every `*Service` class follows the pattern that `LoginService` defines and implements
(`docs/FRONTEND_SERVICES.md` sections 2, 3 and 4). `SessionStore` is not a service (it makes no
remote call) and follows section 9.

Only `SessionStore` is designed today. The three services are sketched in one table (section
4.8). So this step has **two parts with a stop between them**, following CLAUDE.md's working
rhythm: first the design (part A), then, after my review, the code (part B).

Read first, in full: `docs/FRONTEND_SERVICES.md` (v3), `frontend/src/services/` and its tests,
`shared/src/`. Then `docs/ARCHITECTURE.md` sections 3, 3.1, 4, 7.3 and 8 (the Cognito emulation
note), and `docs/FOLDER_STRUCTURE.md` sections 2 and 7.

## Where we are (2026-11-05)

- The back end is v1 (tag `v1.0.0`). `LoginService` is implemented in `frontend/src/services/`
  (commit `e8ec1e9`), with unit tests and an integration test against the local stack. The
  ESLint guard (`da1000a`) allows `frontend/src` to import only `rxjs`, `rxjs/fetch`,
  `rxjs/operators`, `@shared-calendar/shared` and relative paths.
- `SessionStore` is designed in `docs/FRONTEND_SERVICES.md` section 9 (v3, commit `94fc556`) and
  not implemented. Last commit `94fc556`; nothing after `36798a5` is pushed.
- No UI framework, no hosting and no Vite yet; `frontend/` is still the services layer only
  (`docs/FOLDER_STRUCTURE.md` section 7).

## The pattern every `*Service` follows (from `LoginService`)

1. A plain class. Its configuration (URLs, ids) is one object, the first constructor argument.
   Services that need the session take the `SessionStore` as the second argument.
2. **One pair of streams per remote call:**
   - `<call>Result$`: a `ReplaySubject(1)` that carries outcomes only;
   - `<call>State$`: a `BehaviorSubject` that goes `idle` → `pending` → outcome.

   The outcome is the same object in both streams. A service with two remote calls
   (`UsersService`) has two pairs.
3. Methods return `void`. The consumer subscribes first, then calls.
4. Every outcome, success or failure, is a value of a typed union. The subjects never receive
   `error` or `complete`. The subscription forwards `next` only, and a comment there says why
   (section 3.2).
5. A new call cancels the pending call of the same kind: the fetch is aborted and its answer
   discarded.
6. HTTP goes only through `fromFetch`, with the body read in the `selector`. A rejected fetch
   becomes a `network` failure; a body that is not JSON becomes a `server` failure.
7. Nothing is logged. No token or password appears in a URL or in an error message.

## Corrections the design must make first

1. **Section 9.4 is wrong about 401 and 403.** Architecture section 4 says API Gateway answers
   an **expired or invalid token with 403** and its own body `{ "message": "…" }`. It answers
   **401** only when the `Authorization` header is missing. A 403 from a handler (wrong role,
   `cannot_delete_admin`) has the `ApiErrorBody` shape `{ "error", "message" }`. The rule
   becomes:

   | Answer | Meaning | Store |
   |---|---|---|
   | 403 with API Gateway's body, without an `error` field | Token rejected | `clear()` |
   | 401 | Header missing: cannot happen when a session exists | `clear()` |
   | 403 with an `error` field | Role or target refused; the token is fine | Unchanged |
   | 500 with API Gateway's body | Authorizer outage (architecture section 4): not the caller's fault | Unchanged |

   Fix sections 9.4 and 9.7 and the related decision rows.
2. **The API has no CORS configuration** (`backend/template.yaml` has no `CorsConfiguration`). A
   browser page on another origin cannot call it. The tests run in Node, so this step is not
   blocked, but the document must say so in a short "Known gap" note. Fixing it belongs to the
   front-end architecture (same-origin hosting behind CloudFront, or CORS on the HTTP API). Do
   not change the back end.

## Decisions for this step

These are my choices. The design records them as decisions with the reason.

1. **Shared building blocks, extracted rather than copied.**
   - `frontend/src/services/cognito.ts` holds what `LoginService` and `RefreshService` share:
     the `InitiateAuth` request, the error-class mapping, and `toSession`.
   - `frontend/src/services/api.ts` holds the API helper announced in section 4.8:
     - it reads the token from the store with `take(1)` and adds the bearer header;
     - it applies the 401/403 table above and maps `ApiErrorBody.error` to the failure reason;
     - with no session, it answers `not_signed_in` without sending a request.

   `LoginService` is refactored onto `cognito.ts` with **no change in behaviour**: its unit and
   integration tests stay green unchanged, except for the second constructor argument of
   section 9.4.
2. **`LoginService(config, store)`** writes the session to the store before it emits, as section
   9.4 says.
3. **`RefreshService`**:
   - `refresh(): void` calls `InitiateAuth` with `REFRESH_TOKEN_AUTH` and
     `AuthParameters.REFRESH_TOKEN` taken from the store.
   - Cognito's answer carries no new refresh token; the new `Session` keeps the old one.
   - On success it calls `store.set(newSession)`.
   - On `NotAuthorizedException` (the refresh token is expired or revoked, for example because
     the user was deleted) it calls `store.clear()`.
   - On a `network` or `server` failure it leaves the store alone: the session expires on its
     own if nothing recovers.
   - **Automatic refresh:**
     - `start()` subscribes to `session$` and schedules `refresh()` 60 seconds before each
       `expiresAt`;
     - `stop()` cancels the schedule;
     - nothing starts in the constructor.

   The view calls `start()` once at application start-up.
4. **`HelloService`**: `hello(): void` → `POST /hello` with no body. A success carries the
   `HelloResponse` from `shared/`.
5. **`UsersService`**: `createUser(username)` and `deleteUser(username)`, two pairs of streams.
   - Before any request, the username is checked with the shared `Username` schema (imported
     from `@shared-calendar/shared`, never from `zod`). An invalid name is the failure
     `invalid_request`, with no request sent.
   - A create success carries `CreateUserResponse`, **including the generated password**. This
     is the one exception to rule 6: showing that password once to the administrator is the
     purpose of the call (architecture section 4).
   - Write the exception into rule 6. The password lives only in that success value, in both
     streams, until the next `createUser` replaces it; it is never logged.
   - A delete success is the 204: no body.
6. **Failure reasons** are typed per service. Where a reason is an API error code, it is
   `ApiErrorCode` from `shared/`, not a second list. Add `not_signed_in`, `session_rejected`,
   `network`, `server` and `unexpected` as the transport-level reasons.
7. **Placement**: one file per class, `<name>.service.ts` / `session.store.ts`, with types in
   `<name>.types.ts` where `LoginService` does it that way. The tests mirror `src/`.

## Part A — design (then stop)

Write in `docs/FRONTEND_SERVICES.md` (v4):

- The two corrections above.
- One section per new building block, **appended after section 9** so that the section numbers
  cited by code and briefs stay valid:
  - 10, the shared building blocks;
  - 11, `RefreshService`;
  - 12, `HelloService`;
  - 13, `UsersService`.
- Each section follows the outline of section 4:
  - the remote call;
  - configuration;
  - types;
  - the class, as a code sketch that visibly follows the pattern above;
  - the mapping table;
  - use from the view layer;
  - security notes;
  - a unit-test table (every row a behaviour, written as a consumer: subscribe first, then call);
  - the integration checks.
- **Check before designing:** does cognito-local implement `REFRESH_TOKEN_AUTH`? Use one curl
  against the running stack, after I start it. If it does not, say so and propose how
  `RefreshService` is tested locally.
- Update the status line, the change log (v4), section 4.8 (the table becomes pointers to
  sections 11 to 13), and the decisions table.

Report what you decided beyond this brief. **Stop for review. Commit only when I ask.**

## Part B — implementation (after my approval of part A)

Implement exactly the v4 design. If implementing it proves the design wrong somewhere, stop,
say so and propose the document change. Do not diverge silently.

```
frontend/src/services/session.store.ts
frontend/src/services/cognito.ts            # shared by LoginService and RefreshService
frontend/src/services/api.ts                # shared by HelloService and UsersService
frontend/src/services/refresh.service.ts
frontend/src/services/hello.service.ts      (+ hello.types.ts if the design says so)
frontend/src/services/users.service.ts      (+ users.types.ts if the design says so)
frontend/tests/unit/services/<one test file per source file>
frontend/tests/integration/<one file per service, or one journeys file: the design decides>
```

## Hard rules for `frontend/` (unchanged from brief 31, plus the store)

- `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`, `@shared-calendar/shared`
  and relative paths. The ESLint guard must pass unchanged; do not widen it.
- Configuration arrives through the constructor. Nothing is read from `import.meta.env`,
  `window` or storage.
- Tokens live only in the `SessionStore`. No service keeps a copy on the instance: they read the
  store at the moment of the call.
- No password of a user who signs in appears in any state, result, log or URL. The generated
  password of `createUser` appears only as decision 5 allows.
- Subjects never receive `error` or `complete`.
- Unit tests stub `fetch` with `vi.stubGlobal` and real `Response` objects, and use
  `vi.useFakeTimers()` for the store's expiry and the refresh schedule. No network.
- No new dependency.
- No `sam`, no `aws`, no Docker command: the local stack is mine to start. Ask when you need it.
- No change in `backend/` or `shared/`. If the design needs a new contract type in `shared/`,
  stop and propose it.

## Acceptance (part B)

1. From the root, `npm run typecheck`, `npm run lint` and `npm run test:unit` are green for all
   three packages, with `frontend` at 100 % line coverage on `src/`. `npm run verify -w
   frontend` is green. `npm run audit -w backend` reports nothing at high or above. The lock
   file is unchanged.
2. Integration (`RUN_INTEGRATION=1 npm run test:unit -w frontend`, against
   `DYNAMODB_PORT=8002 npm run local:up -w backend` and `npm run local:api -w backend`). Every
   service gets its token from a real `SessionStore` that a real `LoginService` filled.
   - **Store:** after alice's login, `session$` gives her session.
   - **Hello:** alice → `201`, `Hello World, I am alice`. admin → `Hello World, the
     Administrator is speaking`.
   - **Users (as admin):**
     - create a throw-away user (a name distinct from the back end's `carol`, removed again on
       every exit) → success with a password;
     - that user signs in with `LoginService` and says hello;
     - creating it again → `user_exists`;
     - `Bob` → `invalid_request` with no request sent;
     - deleting `admin` → `cannot_delete_admin`;
     - deleting the throw-away user → success, after which it cannot sign in;
     - deleting it again → `user_not_found`.
   - **Users (as alice):** create → `forbidden`, and the session stays.
   - **Token rejected:** a store holding a session whose access token is garbage, with a future
     `expiresAt` → `POST /hello` is `session_rejected`, and `session$` gives `null`.
   - **Refresh** (as part A found possible locally): after alice's login, `refresh()` → the store
     holds a new access token, which `POST /hello` accepts, and the refresh token is unchanged.
     A garbage refresh token → failure, and the store is cleared.
3. `DYNAMODB_PORT=8002 npm run verify -w backend` is still green, with no diff in `backend/` or
   `shared/`. The front end's throw-away user must not break the back end's journeys.
4. Documents:
   - `docs/FRONTEND_SERVICES.md` v5 "implemented", with a change-log row for anything the code
     changed in the design;
   - `docs/FOLDER_STRUCTURE.md` section 2 tree;
   - CLAUDE.md folder map and test conventions;
   - `README.md` only if a line there becomes false.
5. `git status` shows only `frontend/` files, the documents of point 4 and this brief.

Report each result, including anything you could not run, then stop for review. Commit when I
ask (suggested checkpoints: after part A, after part B). Do not push and do not deploy.
