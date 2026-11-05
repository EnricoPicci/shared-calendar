# Front end — The services layer, and the first service: login

| | |
|---|---|
| Status | v1 — design only; no code in `frontend/` yet (brief `prompts/30-design-first-service-class.md`) |
| Date | 2026-11-05 |
| Scope | The rules of the front end's services layer, the pattern every service follows, and the full design of `LoginService` |
| Depends on | `docs/ARCHITECTURE.md` v10 (sections 3.1, 4, 6.2), `docs/FOLDER_STRUCTURE.md` sections 7 and 8, `shared/` |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-05 | First design: services-layer rules, the service pattern, `LoginService` with `loginResult$` (ReplaySubject) and `loginState$` (BehaviorSubject). |

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

It is a design: nothing is created in `frontend/` until the front-end architecture document
exists (`docs/FOLDER_STRUCTURE.md` section 7). This document is written so that it can become the
"services layer" chapter of that architecture unchanged.

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
  | 'invalid_credentials'      // NotAuthorizedException, UserNotFoundException
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
`atob` and `JSON.parse`) and reads `username`, `cognito:groups` and `exp`. It does **not**
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
  app.start(r.session); // hands the session to the services that call the API
});

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
| logout | `RevokeToken` (optional), then `reset()` on the services | returns `loginState$` to `idle` |

The API services will share one small helper around `fromFetch` that adds the bearer header
and maps API Gateway's own 401/403/500 bodies and the handlers' `ApiErrorBody` to a typed result,
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
└── tests/unit/services/
    ├── login.service.test.ts
    └── jwt.test.ts
```

- Runtime dependency: `rxjs` (7.8 or later; `fromFetch` is in `rxjs/fetch`). Plus
  `@shared-calendar/shared`.
- `frontend/tsconfig.json` extends `tsconfig.base.json` with `lib: ["ES2022", "DOM"]` (the
  services use `fetch`, `Response`, `atob`); no Node types.
- Unit tests run with vitest in the `node` environment: Node 22 provides `fetch`, `Response`
  and `atob`, so no browser emulation (jsdom) is needed for the services layer.
- Coverage threshold: 100 % lines on `frontend/src/services`.

The folder is created only together with `docs/FRONTEND_ARCHITECTURE.md` (framework, hosting,
sign-in flow); this document then becomes, or is referenced as, its services chapter.

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
2. Manual, against the local stack (`npm run local:up -w backend` running): a scratch page or a
   vitest file run with `RUN_INTEGRATION=1` calls `new LoginService({ cognitoUrl:
   'http://localhost:9229/', clientId: <CLIENT_ID of env.local.json> }).login('alice',
   'Alice-Local-Pass-1!')` and receives `success` with `role: 'user'`; `admin` /
   `Admin-Local-Pass-1!` receives `role: 'admin'`; a wrong password receives
   `invalid_credentials`.
3. The access token of the success is accepted by `POST /hello` on `http://127.0.0.1:3000`
   (curl is enough), proving the front end's session and the back end's authorizer agree.

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
| 8 | No code until `docs/FRONTEND_ARCHITECTURE.md` exists | `docs/FOLDER_STRUCTURE.md` section 7. The brief asks for a design. |
