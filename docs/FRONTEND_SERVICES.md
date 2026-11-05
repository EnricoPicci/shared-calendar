# Front end — The services layer, and the first service: login

| | |
|---|---|
| Status | v3 — `LoginService` implemented (2026-11-05, brief `prompts/31-implement-login-service.md`; design brief `prompts/30-design-first-service-class.md`); `SessionStore` designed, not implemented (section 9) |
| Date | 2026-11-05 |
| Scope | The rules of the front end's services layer, the pattern every service follows, the full design of `LoginService`, and the `SessionStore` that keeps the signed-in session |
| Depends on | `docs/ARCHITECTURE.md` v11 (sections 3.1, 4, 6.2, 8), `docs/FOLDER_STRUCTURE.md` sections 7 and 8, `shared/` |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-05 | First design: services-layer rules, the service pattern, `LoginService` with `loginResult$` (ReplaySubject) and `loginState$` (BehaviorSubject). |
| v2 | 2026-11-05 | Implemented (brief 31). Details the implementation fixed: an access token that cannot be decoded, or lacks `username` or `exp`, and a 200 without `IdToken` or `RefreshToken`, are `failure unexpected` (section 4.5); a JSON body that is not an object is read as `{}`; `decodeClaims` decodes the payload as UTF-8 (`atob` + `TextDecoder`). Found against cognito-local: it answers a wrong password with `InvalidPasswordException` (real Cognito: `NotAuthorizedException`), now also mapped to `invalid_credentials`; it issues 24-hour access tokens without `ExpiresIn`, so the 15-minute expiry is checked only in the cloud (section 7). `frontend/` exists ahead of the front-end architecture, for the services layer only (decision 8 revised; `docs/FOLDER_STRUCTURE.md` section 7). Section 5: the integration test and the tooling as built, including an ESLint guard against Node imports and globals in `frontend/src`. Section 7: the acceptance as run. |
| v3 | 2026-11-05 | Design of `SessionStore` (section 9): the one in-memory holder of the signed-in `Session`, written by `LoginService` on success, read by the API services, cleared at `expiresAt`, on logout and on an API 401. `LoginService` gains the store as a second constructor argument (section 9.4). Sections 4.6 and 4.8 point at it; decisions 9 to 13. Added as section 9 rather than inserted, so that the section numbers cited by the code and by briefs 30 and 31 stay valid. |

---

## 1. Purpose

The browser front end has two layers (brief `prompts/30-design-first-service-class.md`):

- a **services layer**: plain TypeScript classes that call the remote services and publish the
  results as RxJS observables;
- a **view layer**: whatever renders the UI (plain HTML, React, Angular: not chosen yet). It
  subscribes to the services' observables and calls their methods. It never calls the network
  itself.

This document fixes the rules of the services layer, the pattern every service follows, and
designs the first service, **login**. Later services (Hello World, create user, delete user,
token refresh) will be added as sections of this document, following the same pattern.

The services layer is implemented in `frontend/src/services/` (v2). It was created ahead of the
front-end architecture document, as the one exception of `docs/FOLDER_STRUCTURE.md` section 7:
it is plain TypeScript with `rxjs` and `shared/`, and depends on nothing that document will
choose. This document is written so that it can become the "services layer" chapter of that
architecture unchanged.

### 1.1 What "login" is in this system

The back end has **no login endpoint**. Sign-in is a direct call from the client to Amazon
Cognito, flow `USER_PASSWORD_AUTH`, which answers with three JWTs (`docs/ARCHITECTURE.md`
sections 3.1 and 6.2). The API then wants the **access token** as `Authorization: Bearer …` on
every call. Locally the same call goes to the Cognito emulator (cognito-local on port 9229),
which speaks the same protocol and sets the CORS headers a browser needs (checked in the
bundled server of image `jagregory/cognito-local:5.3.0`).

So the login service talks to Cognito, not to API Gateway, but it is still "a service that calls
a remote service and exposes the result", and it follows the same pattern as every other one.

---

## 2. Rules of the services layer

1. **Pure TypeScript.** A service is a class with a constructor, private subjects, public
   observables and public methods. No UI framework import, no decorator, no global singleton.
   The view layer creates the instance (or a dependency-injection container does, if the chosen
   framework has one).
2. **Dependencies: `rxjs` and `@shared-calendar/shared` only.** No AWS SDK in the browser:
   every remote call is plain HTTP through RxJS's `fromFetch` (`rxjs/fetch`), which wraps the
   browser's `fetch`. The shared package gives the API contract types, `Role`/`resolveRole` and
   the username schema, so the front end and the back end agree by construction.
3. **Configuration is injected.** URLs, ids and the like arrive through the constructor as one
   plain object. Nothing is read from `import.meta.env`, `window` or a file inside a service, so a
   unit test constructs a service with any configuration it likes. The values come from the
   back-end stack outputs at build time, or from `backend/env.local.json` locally
   (`docs/FOLDER_STRUCTURE.md` section 7).
4. **One subject per remote call, and the subject never dies.** Each remote call has a private
   `ReplaySubject(1)` and a public observable derived from it. The pipeline maps every outcome,
   success or failure, into a *value*; the subject receives neither `error` nor `complete`. See
   section 3.2 for why.
5. **Subscribe first, then call.** The consumer subscribes to the result observable and then
   calls the method that triggers the remote call. The method returns `void`: the result travels
   only through the observable. With `ReplaySubject(1)` a consumer that subscribes late still
   receives the last result, so the order is a convention, not a trap.
6. **Secrets stay in the request.** A password exists only in the method argument and the
   request body: never stored on the instance, never logged, never put in an observable, a URL
   or an error message. Tokens never appear in URLs.
7. **No persistence in v1.** A service holds its state in memory. Whether a session is kept in
   `sessionStorage` across a page reload is a decision for the front-end architecture document.
8. **Unit tests, no network.** vitest, the global `fetch` replaced by a stub, 100 % line
   coverage on `frontend/src/services`, like `backend/src/lib` and `shared/src`.

---

## 3. The service pattern

### 3.1 Shape

```ts
export class SomethingService {
  // 1. the private subject, one per remote call
  private readonly resultSubject = new ReplaySubject<SomethingResult>(1);
  // 2. the public observable
  readonly result$: Observable<SomethingResult> = this.resultSubject.asObservable();

  constructor(private readonly config: SomethingConfig) {}

  // 3. the trigger: builds the HTTP observable, maps it to a result, feeds the subject
  doSomething(input: Input): void {
    fromFetch(url, init)
      .pipe(/* response → SomethingResult, errors → SomethingResult */)
      .subscribe((result) => this.resultSubject.next(result));
  }
}
```

### 3.2 Why not `pipe(...).subscribe(resultSubject)` literally

The brief writes the last line as `httpObservable.pipe(…).subscribe(resultSubject)`. Passing the
subject itself as the observer forwards all three notifications, and two of them are fatal for
a subject that must serve many calls:

- **`complete`.** An HTTP observable emits one value and completes. `subscribe(subject)` would
  call `subject.complete()` after the first call; a completed subject ignores every later `next`.
  The second login would never be notified to anyone.
- **`error`.** If the pipeline let an error through, `subject.error()` would terminate the
  subject for good. A wrong password is a normal outcome of a login, not the end of the
  service.

Hence rule 4: the pipeline turns every failure into a value (`catchError` → `of(failure)`), and
the subscription forwards **only `next`** (`subscribe((v) => subject.next(v))`). The subject
lives as long as the service.

### 3.3 Two observables when the view wants a state machine

Some calls deserve a second, richer stream. The login is one: a form wants to disable its
button while the request is in flight, which the result stream cannot say because it only
carries outcomes. For such services the pattern adds:

- **`result$`** on a `ReplaySubject(1)`: the pure reactive stream. It emits *outcomes* only (one
  per call), has no initial value and never emits "nothing happened yet". A consumer that
  subscribes before the first call simply waits.
- **`state$`** on a `BehaviorSubject`: the state machine. It starts at `idle`, goes to `pending`
  when the method is called, then to the outcome. It always has a current value, so a view can
  render from it immediately.

Both are fed by the same pipeline; the outcome value is the same object in both streams. The
view picks the one it needs. The `BehaviorSubject` is exposed only as an observable: its
synchronous `.value` is not part of the API, so consumers cannot slip into reading state
imperatively.

---

## 4. `LoginService`

### 4.1 The remote call

Cognito's user-pool API is JSON over HTTPS with the action named in a header; `InitiateAuth`
with `USER_PASSWORD_AUTH` needs no request signing and no secret (the app client has
`GenerateSecret: false`).

| | Cloud | Local |
|---|---|---|
| URL | `https://cognito-idp.eu-north-1.amazonaws.com/` | `http://localhost:9229/` |
| Method | `POST` | same |
| Headers | `Content-Type: application/x-amz-json-1.1`, `X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth` | same |
| Body | `{ "AuthFlow": "USER_PASSWORD_AUTH", "ClientId": "<client id>", "AuthParameters": { "USERNAME": "alice", "PASSWORD": "…" } }` | same |

Success, HTTP 200:

```json
{ "AuthenticationResult": { "AccessToken": "eyJ…", "IdToken": "eyJ…", "RefreshToken": "eyJ…", "ExpiresIn": 900, "TokenType": "Bearer" }, "ChallengeParameters": {} }
```

Failure, HTTP 400 (Cognito's client errors are all 400), with the error class in the body and in
the `x-amzn-ErrorType` header:

```json
{ "__type": "NotAuthorizedException", "message": "Incorrect username or password." }
```

Facts the design relies on:

- The pool has `PreventUserExistenceErrors: ENABLED`, so an unknown username is answered
  exactly like a wrong password. The service does not distinguish them either.
- Every password is permanent (architecture v2), so Cognito never answers with a challenge in
  v1. The service still handles a challenge answer defensively, as a failure.
- The request's content type is not one of the "simple" ones, so the browser sends a CORS
  preflight (`OPTIONS`). Cognito and cognito-local both answer it.
- `fetch` rejects only when no HTTP answer arrives (offline, DNS, refused connection, CORS
  rejection, abort). An HTTP 4xx or 5xx is a resolved response. The pipeline handles both paths.

### 4.2 Configuration

```ts
export type LoginConfig = {
  cognitoUrl: string; // 'https://cognito-idp.eu-north-1.amazonaws.com/' or 'http://localhost:9229/'
  clientId: string;   // UserPoolClientId output of the back-end stack, or CLIENT_ID of env.local.json
};
```

### 4.3 Types

```ts
import type { Role } from '@shared-calendar/shared';

// What a signed-in user is, for the whole front end.
export type Session = {
  username: string;     // claim `username` of the access token: the <UserName> of the Hello message
  role: Role;           // from claim `cognito:groups`, resolved with the shared "admin wins" rule
  accessToken: string;  // sent as Authorization: Bearer on every API call
  idToken: string;
  refreshToken: string; // for the later refresh service (REFRESH_TOKEN_AUTH, 7 days)
  expiresAt: Date;      // claim `exp` of the access token (15 minutes)
};

export type LoginFailureReason =
  | 'invalid_credentials'      // NotAuthorizedException, UserNotFoundException (InvalidPasswordException locally)
  | 'too_many_attempts'        // TooManyRequestsException, LimitExceededException
  | 'password_reset_required'  // PasswordResetRequiredException (cannot happen in v1; mapped anyway)
  | 'challenge'                // 200 without AuthenticationResult (cannot happen in v1)
  | 'no_role'                  // signed in, but in neither group: the API would answer 403 to everything
  | 'network'                  // fetch rejected: offline, DNS, CORS, refused
  | 'server'                   // HTTP 5xx, or a body that is not JSON
  | 'unexpected';              // any other __type

export type LoginResult =
  | { status: 'success'; session: Session }
  | { status: 'failure'; reason: LoginFailureReason; message: string }; // message: human text for the view, never the password

export type LoginState =
  | { status: 'idle' }
  | { status: 'pending'; username: string }
  | LoginResult;
```

`Session` is a front-end type, not a shared one: the back end never sees it. `Role` and
`resolveRole` come from `shared/`, so the front end classifies a token exactly as the API does.

### 4.4 The class

```ts
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { catchError, map, tap } from 'rxjs/operators';

export class LoginService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<LoginResult>(1);
  readonly loginResult$: Observable<LoginResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<LoginState>({ status: 'idle' });
  readonly loginState$: Observable<LoginState> = this.stateSubject.asObservable();

  // The attempt in flight, so that a new attempt can cancel it.
  private pending?: Subscription;

  constructor(private readonly config: LoginConfig) {}

  login(username: string, password: string): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending', username });

    this.pending = fromFetch(this.config.cognitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.config.clientId,
        AuthParameters: { USERNAME: username, PASSWORD: password },
      }),
      // Read the body inside the stream, so that unsubscribing also abandons the body read.
      selector: (response) => response.text().then((text) => ({ status: response.status, text })),
    }).pipe(
      map(({ status, text }) => toLoginResult(status, text)),
      catchError((err: unknown) => of(failure('network', describe(err)))),
      tap((result) => this.stateSubject.next(result)),
    ).subscribe((result) => this.resultSubject.next(result)); // next only: see section 3.2
  }
}
```

Reading the pipeline:

1. `fromFetch` sends the request. It creates an `AbortController` and aborts the request when
   the subscription is unsubscribed: that is what `this.pending?.unsubscribe()` relies on.
2. `selector` reads the body as text, with the status. Text rather than `response.json()`, so
   that a non-JSON answer (a proxy's HTML 502) does not throw in the wrong place.
3. `map` → `toLoginResult` turns status and body into a `LoginResult` (section 4.5).
4. `catchError` turns a rejected fetch into the `network` failure. After this operator the
   stream can no longer error.
5. `tap` feeds the state machine, `subscribe` feeds the result stream. Same value, same moment.

Sequence for the cases of interest:

| Event | `loginState$` | `loginResult$` |
|---|---|---|
| service created | `idle` | (nothing) |
| `login('alice', pw)` | `pending alice` | |
| Cognito answers 200 | `success` | `success` |
| `login('alice', wrong)` | `pending alice` | |
| Cognito answers 400 NotAuthorized | `failure invalid_credentials` | `failure invalid_credentials` |
| `login` again while pending | `pending` (the first attempt is aborted and never reports) | |
| late subscriber | current state at once | last outcome at once |

### 4.5 Mapping the answer

```ts
// The two bodies Cognito can answer with (section 4.1).
type InitiateAuthResponse = {
  AuthenticationResult?: { AccessToken?: string; IdToken?: string; RefreshToken?: string; ExpiresIn?: number };
  ChallengeName?: string;
};
type CognitoError = { __type?: string; message?: string };

function failure(reason: LoginFailureReason, message: string): LoginResult {
  return { status: 'failure', reason, message };
}
// For the network failure: the error name and text, which never include the request body.
function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

const REASON_BY_TYPE: Record<string, LoginFailureReason> = {
  NotAuthorizedException: 'invalid_credentials',
  UserNotFoundException: 'invalid_credentials',
  InvalidPasswordException: 'invalid_credentials', // cognito-local's wrong password; never from real InitiateAuth
  TooManyRequestsException: 'too_many_attempts',
  LimitExceededException: 'too_many_attempts',
  PasswordResetRequiredException: 'password_reset_required',
};

function toLoginResult(status: number, text: string): LoginResult {
  let body: unknown;
  try { body = JSON.parse(text); } catch { return failure('server', `Cognito answered ${status} without JSON`); }

  if (status === 200) {
    const auth = (body as InitiateAuthResponse).AuthenticationResult;
    if (!auth?.AccessToken) return failure('challenge', 'Cognito asked for a challenge');
    return toSession(auth);   // success, or failure('no_role')
  }
  const type = String((body as CognitoError).__type ?? '').split('#').pop() ?? '';
  const reason = REASON_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected');
  return failure(reason, (body as CognitoError).message ?? `Cognito answered ${status}`);
}
```

`toSession` decodes the access token's payload (the middle base64url part of the JWT, with
`atob`, `TextDecoder` for UTF-8 and `JSON.parse`) and reads `username`, `cognito:groups` and `exp`.
A token that cannot be decoded, or has no `username` or `exp`, and a 200 without `IdToken` or
`RefreshToken`, give `failure('unexpected')`: inside `map`, never a thrown error, which
`catchError` would misreport as `network`. A JSON body that is not an object (`null`) is read
as `{}`. It does **not**
verify the signature: the browser only displays these claims, and the API verifies the token
on every call (architecture section 7). If `resolveRole(groups)` returns `null`, the outcome is
`failure('no_role')`: the account is authenticated but can do nothing, and the view should say
so rather than show an empty application.

The message of a failure is for humans (Cognito's own text when there is one). It never contains
the password, and the service never logs anything.

### 4.6 Use from the view layer

Framework-agnostic sketch of a login form:

```ts
const login = new LoginService({ cognitoUrl, clientId });

// 1. subscribe first
login.loginState$.subscribe((state) => {
  submitButton.disabled = state.status === 'pending';
  if (state.status === 'failure') errorBox.textContent = state.message;
});
login.loginResult$.pipe(filter((r) => r.status === 'success')).subscribe((r) => {
  app.start(r.session); // v3: the session is also in the SessionStore (section 9); the app may
});                     // react to session$ instead

// 2. then trigger
form.onsubmit = () => login.login(usernameInput.value, passwordInput.value);
```

A view that only cares about outcomes uses `loginResult$`; a view that renders a form uses
`loginState$`; both may be used together, as above.

The service does not validate the username against the shared `Username` schema: Cognito is the
authority for sign-in, and a round trip for an obviously malformed name costs nothing. The form
may use the schema for an early hint if it wishes.

### 4.7 Security notes

- The password lives in the method argument and the request body only (rule 6). It is not kept
  on the instance, not in `pending`, not in any state or result value.
- Tokens are in memory only. Persistence, if any, is decided by the front-end architecture
  document together with the hosting (the CloudFront origin decides the CORS and CSP story).
- Nothing is logged by the service. If the front end later adds a logger, the `Session` and the
  request body are excluded by design, as the back end excludes tokens (CLAUDE.md hard rules).
- The JWT is decoded without verification only to display claims; authorization always happens
  server-side.

### 4.8 Out of scope, designed to come next

| Later service | Cognito / API call | Consumes |
|---|---|---|
| `RefreshService` | `InitiateAuth` with `REFRESH_TOKEN_AUTH` (`ALLOW_REFRESH_TOKEN_AUTH` is enabled) | `Session.refreshToken`; emits a new `Session` before `expiresAt` |
| `HelloService` | `POST /hello` | `Session.accessToken`; result typed with `HelloResponse` from `shared/` |
| `UsersService` | `POST /users`, `DELETE /users/{username}` | `Session.accessToken`; `CreateUserResponse`, `ApiErrorBody` from `shared/` |
| logout | `RevokeToken` (optional), then `SessionStore.clear()` and `reset()` on the services | `session$` emits `null` (section 9); returns `loginState$` to `idle` |

The API services will share one small helper around `fromFetch` that reads the access token
from the `SessionStore` (section 9.5), adds the bearer header and maps API Gateway's own 401/403/500 bodies and the handlers' `ApiErrorBody` to a typed result,
following section 3 exactly.

---

## 5. Placement and tooling

Per `docs/FOLDER_STRUCTURE.md` section 7 (what the folder must look like) and section 8 (this
document's name carries the component):

```
frontend/
├── src/services/
│   ├── login.service.ts     # LoginService, LoginConfig
│   ├── login.types.ts       # Session, LoginFailureReason, LoginResult, LoginState
│   └── jwt.ts               # decodeClaims(jwt): the base64url payload decoder
└── tests/
    ├── unit/services/
    │   ├── login.service.test.ts
    │   └── jwt.test.ts
    └── integration/
        └── login.service.test.ts   # against the local stack, RUN_INTEGRATION=1 only
```

- Runtime dependency: `rxjs` (7.8 or later; `fromFetch` is in `rxjs/fetch`). Plus
  `@shared-calendar/shared`.
- `frontend/tsconfig.json` extends `tsconfig.base.json` with `lib: ["ES2022", "DOM"]` (the
  services use `fetch`, `Response`, `atob`); no Node types.
- Unit tests run with vitest in the `node` environment: Node 22 provides `fetch`, `Response`
  and `atob`, so no browser emulation (jsdom) is needed for the services layer.
- Coverage threshold: 100 % lines on `frontend/src` (today: the services).
- `frontend/vitest.config.ts` has two projects like the back end: `unit` and `integration`, the
  second selecting files only when `RUN_INTEGRATION=1`. `npm run test:unit -w frontend` runs both.
- The compiler does not fully enforce "no Node types": vitest's own type declarations reference
  `@types/node`, so `node:fs` and `process` type-check in `frontend/` even with
  `types: ["vitest/globals"]`. ESLint enforces the rule instead: for `frontend/src/**`,
  `no-restricted-imports` allows only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
  `@shared-calendar/shared` and relative paths, and `no-restricted-globals` rejects `process`,
  `Buffer`, `global`, `require`, `__dirname`, `__filename` (root `eslint.config.js`). Tests are not
  covered: the integration test uses `node:fs` to read `backend/env.local.json`.

When `docs/FRONTEND_ARCHITECTURE.md` (framework, hosting, sign-in flow) is written, this document
becomes, or is referenced as, its services chapter.

---

## 6. Unit tests of `LoginService`

The global `fetch` is replaced with `vi.stubGlobal('fetch', vi.fn())` and answers with real
`Response` objects, so `fromFetch` runs unchanged. The tests subscribe first, then call
`login`, as a consumer would.

| Test | Stub answer | Expect |
|---|---|---|
| success | 200 with three tokens, access token's payload `{ username: 'alice', 'cognito:groups': ['user'], exp }` | `loginResult$` emits `success` with `username: 'alice'`, `role: 'user'`, `expiresAt` from `exp`; `loginState$` emitted `idle`, `pending`, `success` in this order |
| request shape | any | fetch called once with the URL from config, `POST`, both headers, body with `USER_PASSWORD_AUTH`, the client id and the credentials |
| admin wins | groups `['user', 'admin']` | `role: 'admin'` |
| no group | groups absent | `failure no_role`; `loginState$` ends in `failure` |
| wrong password | 400 `NotAuthorizedException` | `failure invalid_credentials` with Cognito's message |
| throttled | 400 `TooManyRequestsException` | `failure too_many_attempts` |
| unknown error class | 400 `SomethingElseException` | `failure unexpected` |
| non-JSON 502 | 502, HTML body | `failure server` |
| challenge | 200 with `ChallengeName`, no `AuthenticationResult` | `failure challenge` |
| offline | fetch rejects with `TypeError` | `failure network`; the subject is still alive |
| retry after failure | wrong password, then correct one | two results on `loginResult$`; the second is `success` (proves neither `error` nor `complete` reached the subject) |
| cancel | first fetch pending, `login` called again | the first request's `signal.aborted` is `true`; only the second answer is emitted |
| late subscriber | subscribe after a success | `loginResult$` replays the success; `loginState$` gives the current `success` |
| no leak | success and failure answers | no state or result value contains the password string |

`jwt.test.ts`: decodes a known payload, handles base64url characters (`-`, `_`) and missing
padding, and throws on a string that is not a JWT (which `toSession` maps to `failure
unexpected`).

---

## 7. Acceptance check (for the implementation step that will follow)

1. `npm run typecheck -w frontend`, `npm run lint -w frontend`, `npm run test:unit -w frontend`
   green, 100 % line coverage on `src/services`.
2. Against the local stack (`DYNAMODB_PORT=8002 npm run local:up -w backend` and
   `npm run local:api -w backend` running), `RUN_INTEGRATION=1 npm run test:unit -w frontend`
   runs `tests/integration/login.service.test.ts`, which calls `new LoginService({ cognitoUrl:
   'http://localhost:9229/', clientId: <CLIENT_ID of env.local.json> }).login('alice',
   'Alice-Local-Pass-1!')` and receives `success` with `role: 'user'`; `admin` /
   `Admin-Local-Pass-1!` receives `role: 'admin'`; a wrong password receives
   `invalid_credentials`, and so does an unknown user. `expiresAt` equals the access token's
   `exp`; cognito-local issues 24-hour tokens, so the 15-minute validity of architecture
   section 3.1 is a cloud property, not checked locally.
3. The access token of the success is accepted by `POST /hello` on `http://127.0.0.1:3000`
   (same test file), proving the front end's session and the back end's authorizer agree.

---

## 8. Decisions and assumptions

| # | Decision | Why |
|---|---|---|
| 1 | Raw HTTP with `fromFetch`, no AWS SDK in the browser | Chosen in the clarification round. Same code for cloud and emulator, smallest bundle, literally "an RxJS http observable". |
| 2 | Two streams: `loginResult$` (ReplaySubject 1) and `loginState$` (BehaviorSubject) | Chosen in the clarification round: pure reactive outcomes, plus a state machine for forms (section 3.3). |
| 3 | The subject receives `next` only; failures are values | Section 3.2. A login must be repeatable. |
| 4 | Success exposes a `Session` (tokens, expiry, username, role), not just the access token | Assumed, the recommended option of the clarification round. The view needs username and role to render, and the refresh service needs the refresh token. Can be narrowed later without changing the pattern. |
| 5 | In neither group → `failure no_role` | A session that cannot call anything is more useful as an explained failure than as a success the API then rejects with 403. |
| 6 | A new `login` cancels the pending one | Simplest defined behaviour; avoids a stale answer landing after a newer one. Alternative (ignore the new call while pending) can be chosen by the view by disabling the button on `pending`. |
| 7 | Document name `docs/FRONTEND_SERVICES.md` | Assumed, the recommended option: one document for the services layer, later services added as sections; name follows `docs/FOLDER_STRUCTURE.md` section 8. |
| 8 | ~~No code until `docs/FRONTEND_ARCHITECTURE.md` exists~~ Revised in v2: the services layer is created before it; everything else in `frontend/` still waits | Brief 31, decision 1: the services layer depends on nothing the architecture will choose. Recorded in `docs/FOLDER_STRUCTURE.md` section 7. |
| 9 | One `SessionStore` holds the signed-in `Session`; nobody else keeps a copy of a token | Section 9.1. One place to refresh, expire or clear; every consumer sees the change. No state library: a `BehaviorSubject` is enough. |
| 10 | `LoginService` writes to the store itself (store injected), before it emits the outcome | Section 9.4. The view does not have to wire login to the store, and a view reacting to `success` already finds the session there. |
| 11 | Memory only; no `sessionStorage` or `localStorage` in v3 | Rule 7. A reload means signing in again. `sessionStorage` is the candidate if that becomes annoying, decided by the front-end architecture with the hosting and its CSP; `localStorage` is excluded (tokens outlive the tab). |
| 12 | The store clears itself at `expiresAt` | Section 9.3. The view learns of the expiry on time instead of from a 401. `RefreshService` will replace the session before then, which re-arms the timer. |
| 13 | `session$` is `Session \| null`, without a reason for `null` | Assumed, the simplest option. If the view needs to say "your session expired" rather than show the bare form, the value becomes a small union (`signed_in` / `signed_out` with `reason: 'logout' \| 'expired' \| 'rejected'`) without changing who writes or reads it. |

---

## 9. `SessionStore`: the signed-in session

### 9.1 Purpose

`LoginService` produces a `Session` (section 4.3), but only as the value of one outcome. The rest
of the front end needs a lasting answer to "who is signed in, and with which token": the view to
choose between the login form and the application, the API services to put the access token in
the `Authorization: Bearer` header of every call.

`SessionStore` is that answer: **one** small object holding the current `Session`, or `null`
when nobody is signed in. Every service that needs the token reads it from the store at the
moment of the call; nobody keeps a copy. Refreshing the token, logging out or expiring then
happens in one place, and every consumer sees it.

It is not a service in the sense of section 3: it makes no remote call. It follows the same
rules otherwise: plain TypeScript, a private subject, a public observable, created by the view
layer (the application's start-up code) and passed to the services through their constructors
(rule 1: no global singleton).

Two kinds of state stay separate:

| Stream | Answers | Lives |
|---|---|---|
| `LoginService.loginState$` | How did the last *login attempt* go? (idle, pending, success, failure) | Per attempt |
| `SessionStore.session$` | *Is someone signed in*, and as whom, with which token? | From a successful login until expiry, logout or a 401 |

After an expiry `loginState$` still shows the last attempt's `success`: the view decides "signed in
or not" from `session$` only.

### 9.2 The class

```ts
import { BehaviorSubject, Observable, Subscription, timer } from 'rxjs';
import type { Session } from './login.types';

export class SessionStore {
  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  readonly session$: Observable<Session | null> = this.sessionSubject.asObservable();

  // Clears the session at its expiry; re-armed by every set(), cancelled by clear().
  private expiry?: Subscription;

  set(session: Session): void {
    this.expiry?.unsubscribe();
    if (session.expiresAt.getTime() <= Date.now()) {
      this.clear(); // never publish a session that is already dead
      return;
    }
    this.sessionSubject.next(session);
    this.expiry = timer(session.expiresAt).subscribe(() => this.clear());
  }

  clear(): void {
    this.expiry?.unsubscribe();
    this.expiry = undefined;
    if (this.sessionSubject.getValue() !== null) this.sessionSubject.next(null);
  }
}
```

- `BehaviorSubject`, not `ReplaySubject`: "nobody is signed in" is a real, current value, and a
  view must be able to render at once (section 3.3).
- Only `session$` is public. The subject's synchronous `.value` stays private, as for
  `loginState$` (section 3.3): consumers read the token reactively (section 9.5).
- `clear()` emits only on a real change, so logout after an expiry does not emit `null` twice.
- Like every subject of the layer, `sessionSubject` never receives `error` or `complete`.

### 9.3 Expiry

`set()` arms an RxJS `timer` for `expiresAt` (the access token's `exp` claim, section 4.5); when it
fires, the store clears itself and `session$` emits `null`. The view then shows the login form at
the moment the token stops working, instead of discovering it from a failed API call.

- Every `set()` re-arms the timer, so the later `RefreshService` (section 4.8) only has to call
  `set()` with the new session before `expiresAt`.
- The expiry compares with the browser's clock. A wrong clock clears too early or too late; the
  API's 401 (section 9.5) is the backstop, and the server's check is the only one that matters
  for security.
- `setTimeout`, under `timer`, holds at most about 24.8 days. Cloud tokens live 15 minutes and
  cognito-local's 24 hours (`docs/ARCHITECTURE.md` section 8), far below.

### 9.4 Who writes

| Writer | Call | When |
|---|---|---|
| `LoginService` | `set(session)` | A login succeeds |
| the store itself | `clear()` | `expiresAt` is reached |
| `RefreshService` (later) | `set(newSession)` | Before `expiresAt` |
| logout (later) | `clear()` | The user signs out |
| the API helper (later) | `clear()` | The API answers **401**: the token is expired or invalid (e.g. the browser's clock ran late). Not on 403: the token is valid, the role is not enough. |

`LoginService` changes in one place: it receives the store as a second constructor argument,
`new LoginService(config, store)`, and its pipeline writes the session before it emits:

```ts
tap((result) => {
  if (result.status === 'success') this.store.set(result.session); // first: the store
  this.stateSubject.next(result);                                    // then the two streams
}),
```

A view reacting to `success` on `loginResult$` or `loginState$` therefore already finds the
session in `session$`. A failed attempt does not touch the store: a session already present
stays until expiry or logout.

### 9.5 Who reads

- **The view** subscribes to `session$`: `null` → the login form; a session → the application,
  with `username` and `role` for the header and for which actions to offer (admin or user).
- **The API services** (`HelloService`, `UsersService`, later) read the token when the call is
  made, not when the service is built, through the shared helper of section 4.8:

  ```ts
  this.store.session$.pipe(
    take(1), // the current session, at the moment of the call
    switchMap((session) =>
      session
        ? fromFetch(url, { method, headers: { Authorization: `Bearer ${session.accessToken}` } })
        : of(notSignedIn), // a failure value, never an error (rule 4)
    ),
  )
  ```

### 9.6 Storage: memory only

The session lives in the `BehaviorSubject`, in memory. A page reload or a new tab means signing in
again. This is rule 7 and the safest choice: nothing is left in the browser for an injected script
to read later.

If reloads become a nuisance, `sessionStorage` is the candidate (survives a reload, dies with
the tab): the store would read it in its constructor and write it in `set()` and `clear()`; nobody
else would change. That decision belongs to the front-end architecture document, together with
the hosting and its Content-Security-Policy. `localStorage` is not a candidate: the tokens would
outlive the tab by up to the refresh token's 7 days.

### 9.7 Security notes

- The store holds tokens; it logs nothing and is never attached to `window` or to a global.
- It never holds a password: it receives a `Session`, which has none (section 4.7).
- A deleted user's access token keeps working until its `exp`: the authorizer checks signature
  and expiry, not revocation (architecture section 7.3). The store's expiry then signs the front
  end out, and the later `RefreshService` fails because the delete revoked the refresh token. So a
  deleted user is out at the latest 15 minutes after the delete, as the architecture accepts.

### 9.8 Placement and unit tests

```
frontend/src/services/session.store.ts              # SessionStore
frontend/tests/unit/services/session.store.test.ts
```

`login.service.ts` and its tests change for the second constructor argument. The tests use
`vi.useFakeTimers()` for the expiry (RxJS's `timer` uses `setTimeout`); 100 % line coverage stays.

| Test | Expect |
|---|---|
| initial | `session$` gives `null` at once |
| set | `session$` gives the session; a late subscriber gets it too |
| expiry | at `expiresAt` (fake clock) `session$` gives `null`; one millisecond before, still the session |
| re-arm | `set(a)`, then `set(b)` with a later expiry: nothing at `a`'s expiry, `null` at `b`'s |
| already expired | `set()` with `expiresAt` in the past: `null`, never the dead session |
| clear | `session$` gives `null`; the timer is cancelled (advancing past `expiresAt` emits nothing) |
| clear twice | one `null` only |
| login writes | `LoginService` success: the store holds the session, and it is there when `loginResult$` emits |
| login failure | a failure leaves an existing session in place |

### 9.9 Acceptance check (for the implementation step)

1. `npm run verify -w frontend` green, 100 % line coverage on `frontend/src`.
2. With `RUN_INTEGRATION=1` (local stack running), the integration test of section 7 also checks
   that after alice's login the store's `session$` gives her session, and the `POST /hello` call
   uses the token read from the store.
3. No new dependency; the ESLint guard of section 5 still passes.
