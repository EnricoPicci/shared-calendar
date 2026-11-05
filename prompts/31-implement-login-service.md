## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
```

No AWS login is needed: this step does not touch the cloud.

## Brief

Implement the first front-end service, `LoginService`, exactly as designed in
`docs/FRONTEND_SERVICES.md` (v1, 2026-11-05), following CLAUDE.md's working rhythm. Read that
document first, in full, then `docs/FOLDER_STRUCTURE.md` sections 4, 5, 7, 8 and 9,
`docs/ARCHITECTURE.md` sections 3.1 and 6.2, and `shared/src/`. This is the first front-end
step; there is no front-end implementation plan yet, so this brief is the step definition and
its acceptance check is below.

## Where we are (2026-11-05)

- The back end is v1 (tag `v1.0.0`) in `backend/`; the contract types, `Role`/`resolveRole` and
  the username schema are in `shared/` (`@shared-calendar/shared`). Last commit `7dd8c2a`.
  Nothing after `36798a5` is pushed.
- `frontend/` does not exist. `docs/FRONTEND_SERVICES.md` designs the services layer and the
  login service; it is untracked, like `prompts/30-…` and this brief.
- No UI framework, no hosting and no Vite are chosen. They come with
  `docs/FRONTEND_ARCHITECTURE.md`, which is not written yet.

## Decisions for this step

1. **The services layer starts before the front-end architecture.** `docs/FOLDER_STRUCTURE.md`
   section 7 says nothing is created in `frontend/` until its architecture document exists. I
   override that for the services layer only: it is plain TypeScript with `rxjs` and `shared/`,
   and depends on nothing the architecture will choose. Create a **minimal** `frontend/`
   package: no framework, no Vite, no `index.html`, no `template.yaml`, no `dist/`. Record the
   exception in section 7 ("the services layer exists since <date>; everything else still waits
   for the architecture document").
2. **Assumptions 4 and 7 of `docs/FRONTEND_SERVICES.md` section 8 stand:** a success exposes
   the `Session` object, and the document keeps its name.
3. **No code beyond the design.** No refresh, no logout, no API helper, no persistence, no
   view. If implementing the design proves it wrong somewhere, stop, say so and propose the
   document change (CLAUDE.md working rhythm); do not diverge silently.

## What to create

The `frontend/` package, shaped by `docs/FOLDER_STRUCTURE.md` section 7 where it applies today:

- `frontend/package.json`: name `frontend`, `private`, `type: module`, dependencies
  `rxjs` (current 7.x) and `@shared-calendar/shared` (workspace link, `"*"` or the workspace
  protocol npm accepts), scripts `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test:unit`
  (`vitest run --coverage`), `verify` (the three in that order, stop at the first failure).
  `dev`, `build` and `deploy` are **not** defined yet (nothing to build or deploy; the root
  scripts use `--if-present`); section 7 lists them for the day the architecture arrives.
- `frontend/tsconfig.json`: extends `../tsconfig.base.json`; `lib: ["ES2022", "DOM"]`; types
  `vitest/globals` only, **no `node` types** (nothing in `frontend/src` may use a Node API;
  tests under `frontend/tests` run in Node but must also compile without its types: use
  `fetch`, `Response`, `atob`, which are in the DOM lib). Includes `src`, `tests`, `*.config.ts`.
- `frontend/vitest.config.ts`: modelled on `shared/vitest.config.ts`; two projects like the
  back end, `unit` (`tests/unit/**/*.test.ts`) and `integration` (`tests/integration/**/*.test.ts`,
  selected only when `RUN_INTEGRATION=1`, `passWithNoTests` otherwise); environment `node`,
  globals; v8 coverage on `src/**/*.ts`, 100 % lines.
- Root `package.json`: add `frontend` to `workspaces` (keep `shared` first). Run `npm install`
  **at the root only** (never inside `frontend/`), then check that the one `package-lock.json`
  gained `rxjs` and the `frontend` workspace and nothing else changed version: compare
  `npm ls --all --workspaces` before and after and report any other jump. `npm run audit -w
  backend` must stay clean (one lock file: the new dependency is audited with it).
- `.gitignore` already covers `node_modules/`, `dist/`, `coverage/` at any depth; confirm, add
  nothing.
- Source and tests, per `docs/FRONTEND_SERVICES.md` section 5:

  ```
  frontend/src/services/login.service.ts   # LoginService, LoginConfig
  frontend/src/services/login.types.ts     # Session, LoginFailureReason, LoginResult, LoginState
  frontend/src/services/jwt.ts             # decodeClaims(jwt)
  frontend/tests/unit/services/login.service.test.ts
  frontend/tests/unit/services/jwt.test.ts
  frontend/tests/integration/login.service.test.ts   # see Acceptance, points 2 and 3
  ```

  Follow sections 4.3 to 4.5 of the design: the two streams, the `next`-only subscription
  (section 3.2 explains why; put that reason in a comment at the subscription), the cancel of a
  pending attempt, the mapping table of error classes, `failure('no_role')` when
  `resolveRole` gives `null`, `Session.expiresAt` from the `exp` claim. The unit tests are the
  table of section 6, every row, as a consumer would use the service: subscribe first, then
  call.

## Hard rules for `frontend/`

- `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators` and
  `@shared-calendar/shared`. No AWS SDK, no UI framework, no Node module, nothing read from
  `import.meta.env` or `window`: configuration arrives through the constructor.
- The password exists only in the method argument and the request body. It is never stored on
  the instance, never put in a state or result value, never logged. The service logs nothing.
- Subjects never receive `error` or `complete`.
- Unit tests stub `fetch` with `vi.stubGlobal` and real `Response` objects; no network.
- No `sam`, no `aws`, no Docker command: the local stack is mine to start.

## Acceptance

1. From the root: `npm run typecheck`, `npm run lint`, `npm run test:unit` green for all three
   packages, `frontend` at 100 % line coverage on `src/`; `npm run verify -w frontend` green.
   `npm run audit -w backend` reports nothing at high or above.
2. Integration, against the local stack (I start `DYNAMODB_PORT=8002 npm run local:up -w
   backend` and `npm run local:api -w backend` when you ask): `RUN_INTEGRATION=1 npm run
   test:unit -w frontend` runs `tests/integration/login.service.test.ts`, which reads
   `CLIENT_ID` from `backend/env.local.json` (a test may use Node's `fs`; the source may not)
   and calls the real `LoginService` against `http://localhost:9229/`:
   `alice` / `Alice-Local-Pass-1!` → `success`, `role: 'user'`, `username: 'alice'`,
   `expiresAt` about 15 minutes ahead; `admin` / `Admin-Local-Pass-1!` → `role: 'admin'`;
   `alice` with a wrong password → `failure invalid_credentials`; an unknown user → the same
   failure (`PreventUserExistenceErrors`; check that cognito-local behaves the same and tell me
   if it does not).
3. Same test file: the access token of alice's success, sent as `Authorization: Bearer` to
   `POST http://127.0.0.1:3000/hello`, is answered `201` with `message: "Hello World, I am
   alice"`: the front end's session and the back end's authorizer agree. (Needs the iptables
   rule above: the authorizer fetches the JWKS from the `cognito` container.)
4. `DYNAMODB_PORT=8002 npm run verify -w backend` is still green: the back end is untouched
   by the new workspace (expected diff in `backend/`: none).
5. Documents: `docs/FRONTEND_SERVICES.md` status line "v1 implemented (<date>)" and a v2
   change-log row for anything the implementation changed in the design; `docs/FOLDER_STRUCTURE.md`
   section 2 tree (what `frontend/` really contains, the rest still "reserved"), section 5
   (root scripts now cover three packages), section 7 (the exception of decision 1), section
   9 (`frontend/coverage/` exists, `frontend/dist/` not yet); CLAUDE.md folder map, everyday
   commands (`-w frontend` forms, the integration run) and test conventions; `README.md`: one
   line in its documents table pointing at `docs/FRONTEND_SERVICES.md`, nothing more.
6. `git status` shows only: the new `frontend/` files, the root `package.json` and
   `package-lock.json`, the documents of point 5, and the two untracked files that were already
   there (`docs/FRONTEND_SERVICES.md`, `prompts/30-…`, plus this brief).

Report each result, including anything you could not run, then stop for review. When I ask,
commit; do not push and do not deploy.
