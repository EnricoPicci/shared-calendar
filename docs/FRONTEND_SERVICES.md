# Front end — The services layer: login, session, refresh, Hello World, users

| | |
|---|---|
| Status | v4 — `LoginService` implemented (2026-11-05, brief `prompts/31-implement-login-service.md`; design brief `prompts/30-design-first-service-class.md`). Designed, not implemented (brief `prompts/32-implement-session-and-api-services.md`, part A): `SessionStore` (section 9), the shared building blocks `cognito.ts` and `api.ts` (section 10), `RefreshService` (11), `HelloService` (12), `UsersService` (13) |
| Date | 2026-11-05 |
| Scope | The rules of the front end's services layer, the pattern every service follows, `LoginService`, the `SessionStore` that keeps the signed-in session, the token refresh, the Hello World call and the user administration |
| Depends on | `docs/ARCHITECTURE.md` v11 (sections 3, 3.1, 4, 6.2, 7.3, 8), `docs/FOLDER_STRUCTURE.md` sections 7 and 8, `shared/` |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-05 | First design: services-layer rules, the service pattern, `LoginService` with `loginResult$` (ReplaySubject) and `loginState$` (BehaviorSubject). |
| v2 | 2026-11-05 | Implemented (brief 31). Details the implementation fixed: an access token that cannot be decoded, or lacks `username` or `exp`, and a 200 without `IdToken` or `RefreshToken`, are `failure unexpected` (section 4.5); a JSON body that is not an object is read as `{}`; `decodeClaims` decodes the payload as UTF-8 (`atob` + `TextDecoder`). Found against cognito-local: it answers a wrong password with `InvalidPasswordException` (real Cognito: `NotAuthorizedException`), now also mapped to `invalid_credentials`; it issues 24-hour access tokens without `ExpiresIn`, so the 15-minute expiry is checked only in the cloud (section 7). `frontend/` exists ahead of the front-end architecture, for the services layer only (decision 8 revised; `docs/FOLDER_STRUCTURE.md` section 7). Section 5: the integration test and the tooling as built, including an ESLint guard against Node imports and globals in `frontend/src`. Section 7: the acceptance as run. |
| v3 | 2026-11-05 | Design of `SessionStore` (section 9): the one in-memory holder of the signed-in `Session`, written by `LoginService` on success, read by the API services, cleared at `expiresAt`, on logout and on an API 401. `LoginService` gains the store as a second constructor argument (section 9.4). Sections 4.6 and 4.8 point at it; decisions 9 to 13. Added as section 9 rather than inserted, so that the section numbers cited by the code and by briefs 30 and 31 stay valid. |
| v4 | 2026-11-05 | Design of the remaining services (brief 32, part A). **Correction:** an expired or invalid token is answered by API Gateway with **403** and its own body `{ "message" }`, not 401 (architecture section 4); 401 means the header is missing. The store is cleared on 401 and on a 403 without an `error` field, and left alone on a handler's 403 (`forbidden`, `cannot_delete_admin`) and on API Gateway's 500 (authorizer outage): sections 9.1, 9.3, 9.4, 9.7, decision 12. The store gains `replace(previous, next)` and `clear(only?)`, so that a late answer cannot overwrite or clear a newer session (section 9.2). Rule 6 gains its one exception: the password `POST /users` generates. New sections, appended so that cited numbers stay valid: 10, the shared building blocks (`cognito.ts`, used by `LoginService` and `RefreshService`; `api.ts`, used by `HelloService` and `UsersService`), with the **known gap** that the API has no CORS configuration (10.3); 11, `RefreshService` (cognito-local implements `REFRESH_TOKEN_AUTH`, checked 2026-11-05); 12, `HelloService`; 13, `UsersService`; 14, the integration journeys. Section 4.8 becomes pointers; decisions 14 to 27. **Tokens live only in the `SessionStore`** (rule 9, decision 28): a login success no longer carries the `Session` but `{ username, role, expiresAt }`, like a refresh success; `LoginService` writes the session to the store and emits the token-free outcome (sections 4.3, 4.6, 4.7, 6, 9.4, 9.7, 10.1; decision 4 revised). This changes `LoginService`'s public result, so its success tests change with it. |

---

## 1. Purpose

The browser front end has two layers (brief `prompts/30-design-first-service-class.md`):

- a **services layer**: plain TypeScript classes that call the remote services and publish the
  results as RxJS observables;
- a **view layer**: whatever renders the UI (plain HTML, React, Angular: not chosen yet). It
  subscribes to the services' observables and calls their methods. It never calls the network
  itself.

This document fixes the rules of the services layer, the pattern every service follows, and
designs the first service, **login** (sections 1 to 8). The later building blocks are added as
sections of their own, following the same pattern: the session store (9), the shared request
helpers (10), token refresh (11), Hello World (12), and user administration (13).

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

   **The one exception** (v4) is the password that `POST /users` *generates* for a new user.
   Showing it once to the administrator is the purpose of that call (architecture section 4),
   so it travels in the success value of `createUser`, in `createUserResult$` and
   `createUserState$`, until the next `createUser` replaces it (section 13.7). It is never
   logged, never put in a URL or an error message, and it is never the password of the person
   who is signed in.
7. **No persistence in v1.** A service holds its state in memory. Whether a session is kept in
   `sessionStorage` across a page reload is a decision for the front-end architecture document.
8. **Unit tests, no network.** vitest, the global `fetch` replaced by a stub, 100 % line
   coverage on `frontend/src/services`, like `backend/src/lib` and `shared/src`.
9. **Tokens live only in the `SessionStore`** (v4, section 9). No result, no state and no
   field of a service holds an access, id or refresh token. A service that needs one reads it
   from the store at the moment of the call and passes it straight into the request; a service
   that obtains one (login, refresh) writes it to the store and emits an outcome without it.

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

// v4: the success carries no token; the Session is in the SessionStore (rule 9, section 9.4).
export type LoginResult =
  | { status: 'success'; username: string; role: Role; expiresAt: Date }
  | { status: 'failure'; reason: LoginFailureReason; message: string }; // message: human text for the view, never the password

export type LoginState =
  | { status: 'idle' }
  | { status: 'pending'; username: string }
  | LoginResult;
```

`Session` is a front-end type, not a shared one: the back end never sees it. Since v4 only the
`SessionStore` holds one; the login success repeats the three fields a view needs at once
(`username`, `role`, `expiresAt`) and none of the tokens. `Role` and
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

Since v4 the request and the mapping of section 4.5 live in `cognito.ts`, shared with
`RefreshService`; the constructor also takes the `SessionStore`, the session goes to the store,
and the success emitted on both streams carries no token (sections 9.4 and 10.1). Everything else
is unchanged; the sketch above shows the v1 shape in one piece.

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
const login = new LoginService({ cognitoUrl, clientId }, store); // v4: the store of section 9

// 1. subscribe first
login.loginState$.subscribe((state) => {
  submitButton.disabled = state.status === 'pending';
  if (state.status === 'failure') errorBox.textContent = state.message;
});
login.loginResult$.pipe(filter((r) => r.status === 'success')).subscribe((r) => {
  welcome.textContent = `Signed in as ${r.username}`; // no token here (rule 9)
});
// Signed in or not, and the session itself: from the store only (section 9.5).
store.session$.subscribe((session) => (session ? app.show(session) : app.showLogin()));

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
- Tokens go from Cognito's answer into the `SessionStore` and nowhere else (rule 9): the login
  outcome on `loginResult$` and `loginState$` carries `username`, `role` and `expiresAt` only.
- Tokens are in memory only. Persistence, if any, is decided by the front-end architecture
  document together with the hosting (the CloudFront origin decides the CORS and CSP story).
- Nothing is logged by the service. If the front end later adds a logger, the `Session` and the
  request body are excluded by design, as the back end excludes tokens (CLAUDE.md hard rules).
- The JWT is decoded without verification only to display claims; authorization always happens
  server-side.

### 4.8 The services that follow

| Building block | Remote call | Consumes | Section |
|---|---|---|---|
| `SessionStore` | none | the `Session` of a login or a refresh | 9 |
| `cognito.ts`, `api.ts` | `InitiateAuth`; any API route | shared by the services below | 10 |
| `RefreshService` | `InitiateAuth` with `REFRESH_TOKEN_AUTH` | `Session.refreshToken`, from the store | 11 |
| `HelloService` | `POST /hello` | `Session.accessToken`, from the store; `HelloResponse` | 12 |
| `UsersService` | `POST /users`, `DELETE /users/{username}` | `Session.accessToken`, from the store; `CreateUserResponse`, `Username` | 13 |
| logout (not designed yet) | `RevokeToken` (optional), then `SessionStore.clear()` and `reset()` on the services | `session$` emits `null`; returns the services' states to `idle` | — |

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
| success | 200 with three tokens, access token's payload `{ username: 'alice', 'cognito:groups': ['user'], exp }` | `loginResult$` emits exactly `{ status: 'success', username: 'alice', role: 'user', expiresAt }` with `expiresAt` from `exp`; `loginState$` emitted `idle`, `pending`, `success` in this order; the store holds the session with the three tokens (v4) |
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
| no leak | success and failure answers | no state or result value contains the password string, nor any of the three tokens (v4, rule 9) |

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
| 4 | ~~Success exposes a `Session` (tokens, expiry, username, role), not just the access token~~ Revised in v4: the success exposes `username`, `role` and `expiresAt`; the `Session` goes to the `SessionStore` only | v1: assumed, the recommended option of the clarification round. v4: the user's decision that the store is the only holder of tokens (decision 28). The view still gets username and role at once; the refresh service reads the refresh token from the store. |
| 5 | In neither group → `failure no_role` | A session that cannot call anything is more useful as an explained failure than as a success the API then rejects with 403. |
| 6 | A new `login` cancels the pending one | Simplest defined behaviour; avoids a stale answer landing after a newer one. Alternative (ignore the new call while pending) can be chosen by the view by disabling the button on `pending`. |
| 7 | Document name `docs/FRONTEND_SERVICES.md` | Assumed, the recommended option: one document for the services layer, later services added as sections; name follows `docs/FOLDER_STRUCTURE.md` section 8. |
| 8 | ~~No code until `docs/FRONTEND_ARCHITECTURE.md` exists~~ Revised in v2: the services layer is created before it; everything else in `frontend/` still waits | Brief 31, decision 1: the services layer depends on nothing the architecture will choose. Recorded in `docs/FOLDER_STRUCTURE.md` section 7. |
| 9 | One `SessionStore` holds the signed-in `Session`; nobody else keeps a copy of a token | Section 9.1. One place to refresh, expire or clear; every consumer sees the change. No state library: a `BehaviorSubject` is enough. |
| 10 | `LoginService` writes to the store itself (store injected), before it emits the outcome | Section 9.4. The view does not have to wire login to the store, and a view reacting to `success` already finds the session there. |
| 11 | Memory only; no `sessionStorage` or `localStorage` in v3 | Rule 7. A reload means signing in again. `sessionStorage` is the candidate if that becomes annoying, decided by the front-end architecture with the hosting and its CSP; `localStorage` is excluded (tokens outlive the tab). |
| 12 | The store clears itself at `expiresAt` | Section 9.3. The view learns of the expiry on time instead of from a rejected API call (API Gateway's 403, section 9.4; corrected in v4, v3 said 401). `RefreshService` replaces the session before then, which re-arms the timer. |
| 13 | `session$` is `Session \| null`, without a reason for `null` | Assumed, the simplest option. If the view needs to say "your session expired" rather than show the bare form, the value becomes a small union (`signed_in` / `signed_out` with `reason: 'logout' \| 'expired' \| 'rejected'`) without changing who writes or reads it. |
| 14 | The shared building blocks are modules of functions (`cognito.ts`, `api.ts`), not a base class | Brief 32, decision 1: extracted, not copied. Each service still declares its own subjects and pipeline, so the pattern of section 3 stays visible in every class; the modules only build a request and map an answer. |
| 15 | `cognito.ts` maps Cognito's error classes once, to a neutral `not_authorized`; each service names it | One table for both flows. A wrong password (`invalid_credentials`) and a dead refresh token (`session_rejected`) are the same Cognito answer with a different meaning for the view (sections 10.1, 11.5). |
| 16 | The store's writes are guarded: `replace(previous, next)`, `clear(only)` | Section 9.2. A late answer must not revive a session after logout or clear a newer one. Beyond brief 32; the store's public surface grows by one method and one optional argument. |
| 17 | 401, and 403 without `error`, mean "token rejected" and clear the store; a handler's 403 and API Gateway's 500 do not | Brief 32, correction 1; architecture section 4. Section 9.4. |
| 18 | Every request answered with one per-route list of error codes, typed against `ApiErrorCode`; a code outside the list is `unexpected` | Brief 32, decision 6: failure reasons typed per service, from `shared/`, not a second list. The list is the route's row of architecture section 4, and `satisfies readonly ApiErrorCode[]` stops it from inventing a code (section 10.2). |
| 19 | A refresh success carries `username` and `expiresAt`, no token | Rule 9: tokens live only in the store. The view takes the session from `session$` (section 11.3). |
| 20 | A refreshed token in neither group clears the store (`no_role`) | Beyond brief 32. The API would answer 403 to every call; same reasoning as decision 5. Only an operator removing a user's groups by hand can cause it. |
| 21 | A refresh keeps the old refresh token, unless Cognito's answer carries a new one | Brief 32, decision 3, plus forward compatibility: with refresh-token rotation (off in this pool) Cognito would send a new one, and keeping the old would break the next refresh. |
| 22 | Automatic refresh: `start()` arms one refresh 60 s before each session's `expiresAt`; no retry | Brief 32, decision 3. A failed refresh for `network` or `server` leaves the session, which expires on its own (section 11.4). A retry loop would add policy (how often, how long) that nothing asks for yet. |
| 23 | Every call goes `idle` → `pending` → outcome, even when it is answered without a request (`not_signed_in`, an invalid username) | One state machine for the view, whatever the cause. The outcome follows `pending` synchronously. |
| 24 | A delete success carries the username of the call | The 204 has no body; the view needs to know which row to remove, also after a newer call (section 13.3). |
| 25 | 5xx and 429 without an `error` field are `server`; any other answer outside the contract is `unexpected` | 429 is the stage throttling (5 req/s, architecture section 7.1): try again later, like a 5xx. The rest would be a bug or a wrong `apiUrl` (section 10.2). |
| 26 | Integration: one ordered journeys file (`journeys.test.ts`) next to the login file; a fixed throw-away user `fe-journey`, removed before and after through `UsersService` itself | Mirrors the back end's journeys. No AWS SDK in `frontend/` tests; a fixed name with removal at both ends survives a crashed run (section 14). |
| 28 | The `SessionStore` is the only place that holds tokens (rule 9); no result, state or service field carries one | The user's decision on reviewing v4 part A. One holder means one place to clear: after logout or expiry no replayed stream still holds a token. It changes `LoginService`'s success (decision 4). |
| 27 | The missing CORS configuration of the API is recorded as a known gap, not fixed | Brief 32, correction 2. It belongs to the front-end architecture (hosting); the tests run in Node, which does not apply CORS (section 10.3). |

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
| `SessionStore.session$` | *Is someone signed in*, and as whom, with which token? | From a successful login until expiry, logout, or a rejection of the token by the API or of the refresh token by Cognito (section 9.4) |

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

  // v4. set(), but only if `previous` is still the current session (RefreshService, section 11).
  replace(previous: Session, next: Session): void {
    if (this.sessionSubject.getValue() === previous) this.set(next);
  }

  // v4. With an argument, clears only if that session is still the current one (section 10.2).
  clear(only?: Session): void {
    const current = this.sessionSubject.getValue();
    if (only !== undefined && current !== only) return;
    this.expiry?.unsubscribe();
    this.expiry = undefined;
    if (current !== null) this.sessionSubject.next(null);
  }
}
```

- `BehaviorSubject`, not `ReplaySubject`: "nobody is signed in" is a real, current value, and a
  view must be able to render at once (section 3.3).
- Only `session$` is public. The subject's synchronous `.value` stays private, as for
  `loginState$` (section 3.3): consumers read the token reactively (section 9.5).
- `clear()` emits only on a real change, so logout after an expiry does not emit `null` twice.
- Like every subject of the layer, `sessionSubject` never receives `error` or `complete`.
- **Guarded writes (v4).** A refresh or an API call reads the session when it starts and acts on
  the answer when it arrives, possibly after a logout or a new login. `replace(previous, next)`
  and `clear(only)` act only if the session the call started from is still the current one
  (compared by identity: the store holds the very object it was given). Without the guard, a
  refresh answering after a logout would sign the user in again, and a 403 to an old token would
  sign out the user who has just signed in anew.

### 9.3 Expiry

`set()` arms an RxJS `timer` for `expiresAt` (the access token's `exp` claim, section 4.5); when it
fires, the store clears itself and `session$` emits `null`. The view then shows the login form at
the moment the token stops working, instead of discovering it from a failed API call.

- Every `set()` re-arms the timer (`replace()` goes through `set()`), so `RefreshService`
  (section 11) only has to replace the session before `expiresAt`.
- The expiry compares with the browser's clock. A wrong clock clears too early or too late; API
  Gateway's 403 to an expired token (section 9.4) is the backstop, and the server's check is the
  only one that matters for security.
- `setTimeout`, under `timer`, holds at most about 24.8 days. Cloud tokens live 15 minutes and
  cognito-local's 24 hours (`docs/ARCHITECTURE.md` section 8), far below.

### 9.4 Who writes

| Writer | Call | When |
|---|---|---|
| `LoginService` | `set(session)` | A login succeeds |
| the store itself | `clear()` | `expiresAt` is reached |
| `RefreshService` (section 11) | `replace(old, new)` | A refresh succeeds, before `expiresAt` |
| `RefreshService` (section 11) | `clear(old)` | Cognito rejects the refresh token (`NotAuthorizedException`: expired or revoked, e.g. the user was deleted), or the new token has no role |
| the API helper (section 10.2) | `clear(used)` | The API rejects the token: see the table below |
| logout (later) | `clear()` | The user signs out |

**When an API answer clears the store** (corrected in v4; v3 wrongly said "on 401"). Architecture
section 4: API Gateway answers an **expired or invalid token with 403** and its own body
`{ "message": "…" }` (the HTTP API's fixed answer when the Lambda authorizer denies), and **401**
only when the `Authorization` header is missing. A handler's 403 has the `ApiErrorBody` shape
`{ "error", "message" }`. So the `error` field, not the status alone, tells the two 403s apart:

| Answer | Meaning | Store |
|---|---|---|
| 403 with API Gateway's body, without an `error` field | Token rejected (expired, invalid, wrong client) | `clear(used)` |
| 401 | Header missing: cannot happen when a session exists, so the session is not usable either | `clear(used)` |
| 403 with an `error` field (`forbidden`, `cannot_delete_admin`) | Role or target refused; the token is fine | Unchanged |
| 500 with API Gateway's body | Authorizer outage (architecture section 4): not the caller's fault | Unchanged |

`used` is the session whose access token was sent (guarded write, section 9.2).

`LoginService` changes in two places: it receives the store as a second constructor argument,
`new LoginService(config, store)`, and on success it writes the session to the store and emits an
outcome **without the tokens** (rule 9, v4). The store is written first:

```ts
map(({ status, text }) => this.settle(toAuthOutcome(status, text))), // writes the store (section 10.1)
```

A view reacting to `success` on `loginResult$` or `loginState$` therefore already finds the
session in `session$`, and it is the only place to find it. A failed attempt does not touch the store: a session already present
stays until expiry or logout.

### 9.5 Who reads

- **The view** subscribes to `session$`: `null` → the login form; a session → the application,
  with `username` and `role` for the header and for which actions to offer (admin or user).
- **The API services** (`HelloService`, `UsersService`) read the token when the call is
  made, not when the service is built, through the shared helper of section 10.2:

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
  end out, and `RefreshService` fails (and clears the store) because the delete revoked the
  refresh token. So a deleted user is out at the latest 15 minutes after the delete, as the
  architecture accepts. Locally the delete does not revoke the refresh token
  (`SKIP_GLOBAL_SIGN_OUT`, architecture section 8).
- **Only a rejected token clears the store** (section 9.4, v4): a 401, or a 403 without an
  `error` field. A handler's 403 leaves it: clearing there would sign an administrator out for
  trying to delete another administrator. API Gateway's 500 leaves it too: an authorizer outage
  would otherwise turn into every user losing the session.
- The guarded writes (section 9.2) keep a late answer from reviving a session after logout, or
  from clearing a newer one.
- **The store is the only holder of tokens** (rule 9, decision 28). The services' replayed
  streams (`loginResult$`, `refreshResult$`, and the states) carry `username`, `role` and
  `expiresAt` at most, so clearing the store removes every token from the front end. Until v3 a
  login success carried the `Session`, which `loginResult$` kept replaying after a logout.

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
| replace | `set(a)`, `replace(a, b)`: `session$` gives `b`; the timer follows `b`'s expiry |
| replace, stale | `set(a)`, `set(c)`, `replace(a, b)`: nothing changes, `session$` still gives `c` |
| clear(only), stale | `set(a)`, `set(c)`, `clear(a)`: nothing changes; `clear(c)` gives `null` |
| login writes | `LoginService` success: the store holds the session, and it is there when `loginResult$` emits |
| login failure | a failure leaves an existing session in place |

### 9.9 Acceptance check (for the implementation step)

1. `npm run verify -w frontend` green, 100 % line coverage on `frontend/src`.
2. With `RUN_INTEGRATION=1` (local stack running), the integration test of section 7 also checks
   that after alice's login the store's `session$` gives her session, and the `POST /hello` call
   uses the token read from the store. Its checks on the tokens (`expiresAt` equals the access
   token's `exp`, id and refresh token present) read them from the store, since the login
   outcome no longer carries them (v4); the outcome is checked to hold no token.
3. No new dependency; the ESLint guard of section 5 still passes.

---

## 10. Shared building blocks

Two modules of plain functions, not classes (decision 14). They are what the services have in
common; each service still owns its subjects and its pipeline, so section 3 stays readable in
every class.

| Module | Used by | Holds |
|---|---|---|
| `cognito.ts` | `LoginService`, `RefreshService` | the `InitiateAuth` request, the error-class mapping, `toSession` |
| `api.ts` | `HelloService`, `UsersService` | the authenticated API request: token from the store, bearer header, the 401/403 rule, `ApiErrorBody` → reason |

### 10.1 `cognito.ts`: `InitiateAuth`

**The remote call** is the one of section 4.1, with one of two flows:

| Flow | `AuthParameters` | `AuthenticationResult` of the 200 |
|---|---|---|
| `USER_PASSWORD_AUTH` (login) | `USERNAME`, `PASSWORD` | `AccessToken`, `IdToken`, `RefreshToken` |
| `REFRESH_TOKEN_AUTH` (refresh) | `REFRESH_TOKEN` | `AccessToken`, `IdToken`; **no** `RefreshToken` (the pool has no refresh-token rotation) |

**Configuration**: `CognitoConfig = { cognitoUrl: string; clientId: string }` (section 4.2).
`LoginConfig` and `RefreshConfig` are this type under the service's name.

**Types and functions**

```ts
import { Observable } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import type { Session } from './login.types';

export type CognitoConfig = { cognitoUrl: string; clientId: string };

// Cognito's failures before a service names them for its view (decision 15).
export type AuthFailureReason =
  | 'not_authorized'          // NotAuthorizedException, UserNotFoundException, InvalidPasswordException (cognito-local)
  | 'too_many_attempts'       // TooManyRequestsException, LimitExceededException
  | 'password_reset_required' // PasswordResetRequiredException
  | 'challenge'               // 200 without AuthenticationResult
  | 'no_role'                 // the access token is in neither group
  | 'server'                  // 5xx, or a body that is not JSON
  | 'unexpected';             // any other __type; an access token whose claims cannot be read
// Internal to the two Cognito services: the session in a success goes straight to the store,
// and only a token-free outcome reaches a subject (rule 9).
export type AuthOutcome =
  | { status: 'success'; session: Session }
  | { status: 'failure'; reason: AuthFailureReason; message: string };

// The request. Emits one { status, text } and completes; errors only when fetch rejects.
export function initiateAuth(
  config: CognitoConfig,
  flow: 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH',
  parameters: Record<string, string>,
): Observable<{ status: number; text: string }> {
  return fromFetch(config.cognitoUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({ AuthFlow: flow, ClientId: config.clientId, AuthParameters: parameters }),
    // Read the body inside the stream, so that unsubscribing also abandons the body read.
    selector: (response) => response.text().then((text) => ({ status: response.status, text })),
  });
}

// The mapping of section 4.5, unchanged, messages included. `refreshToken` is kept when the
// answer carries none (the refresh flow, decision 21); without it, a missing RefreshToken is
// `unexpected`, as for the login.
export function toAuthOutcome(status: number, text: string, refreshToken?: string): AuthOutcome;

// For the network failure: the error name and text, which never include the request body.
export function describe(err: unknown): string;
```

`toSession` (section 4.5) moves here, private to the module, with the one change that it
takes the refresh token to keep.

**`LoginService` after the refactoring.** The request and the mapping are unchanged. Two
things change: the second constructor argument, and the success, which writes the session to the
store and emits `{ username, role, expiresAt }` (rule 9). The unit and integration tests change
for those two only: the success tests read the tokens from the store, and "no leak" also checks
that no outcome contains a token.

```ts
export type LoginConfig = CognitoConfig;

export class LoginService {
  // … the two subjects and `pending`, as in section 4.4 …
  constructor(private readonly config: LoginConfig, private readonly store: SessionStore) {}

  login(username: string, password: string): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending', username });
    this.pending = initiateAuth(this.config, 'USER_PASSWORD_AUTH', { USERNAME: username, PASSWORD: password })
      .pipe(
        map(({ status, text }) => this.settle(toAuthOutcome(status, text))),
        catchError((err: unknown) => of(failure('network', describe(err)))),
        tap((result) => this.stateSubject.next(result)),
      )
      .subscribe((result) => this.resultSubject.next(result)); // next only: section 3.2
  }

  // Writes the session to the store first (section 9.4), then returns the outcome for the
  // streams, without any token (rule 9).
  private settle(outcome: AuthOutcome): LoginResult {
    if (outcome.status === 'success') {
      const { username, role, expiresAt } = outcome.session;
      this.store.set(outcome.session);
      return { status: 'success', username, role, expiresAt };
    }
    // For a login, Cognito's "not authorized" is a wrong username or password.
    if (outcome.reason === 'not_authorized') return { ...outcome, reason: 'invalid_credentials' };
    return outcome as LoginResult; // every other AuthFailureReason is also a LoginFailureReason
  }
}
```

### 10.2 `api.ts`: one authenticated API call

**The remote call**: any route of architecture section 4, on the API's base URL, with
`Authorization: Bearer <access token>`, and `Content-Type: application/json` when there is a
body.

**Configuration**

```ts
export type ApiConfig = {
  apiUrl: string; // ApiUrl output of the back-end stack (no trailing slash), or 'http://127.0.0.1:3000'
};
```

**Types**

```ts
import type { ApiErrorCode } from '@shared-calendar/shared';

// The reasons every API call can fail with, whatever the route (brief 32, decision 6).
export type TransportFailureReason =
  | 'not_signed_in'    // the store is empty: no request is sent
  | 'session_rejected' // 401, or 403 without an `error` field: the store is cleared (section 9.4)
  | 'network'          // fetch rejected: offline, DNS, CORS, refused
  | 'server'           // 5xx or 429 without an `error` field, or a body that is not JSON
  | 'unexpected';      // any other answer outside the contract

// C: the error codes the route can answer with, from the shared ApiErrorCode (decision 18).
export type ApiFailure<C extends ApiErrorCode> = {
  status: 'failure';
  reason: C | TransportFailureReason;
  message: string; // the API's own text when there is one; never a token
};
// A 2xx. `body` is the parsed JSON, or undefined when the body is empty (the 204 of a delete).
export type ApiOk = { status: 'ok'; httpStatus: number; body: unknown };

export type ApiRequest<C extends ApiErrorCode> = {
  method: 'POST' | 'DELETE';
  path: string;         // '/hello', '/users', '/users/<encoded username>'
  body?: unknown;       // sent as JSON
  codes: readonly C[];  // the route's error codes (architecture section 4)
};
```

**The function**

```ts
// Never errors and completes after one value: the services feed their subjects from it with
// `next` only (section 3.2).
export function apiCall<C extends ApiErrorCode>(
  config: ApiConfig,
  store: SessionStore,
  request: ApiRequest<C>,
): Observable<ApiOk | ApiFailure<C>> {
  return store.session$.pipe(
    take(1), // the current session, at the moment of the call (section 9.5)
    switchMap((session) => {
      if (!session) return of(failure<C>('not_signed_in', 'Nobody is signed in'));
      const hasBody = request.body !== undefined;
      return fromFetch(config.apiUrl + request.path, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: hasBody ? JSON.stringify(request.body) : undefined,
        selector: (response) => response.text().then((text) => ({ status: response.status, text })),
      }).pipe(
        map(({ status, text }) => toApiAnswer(status, text, request.codes)),
        tap((answer) => {
          // Section 9.4: only a rejected token clears, and only the session that was used.
          if (answer.status === 'failure' && answer.reason === 'session_rejected') store.clear(session);
        }),
        catchError((err: unknown) => of(failure<C>('network', describe(err)))),
      );
    }),
  );
}
```

`describe` is the one of `cognito.ts` (section 10.1), imported from there.

**Mapping the answer** (`toApiAnswer`, in this order):

| Answer | Outcome | Store |
|---|---|---|
| no session in the store | `not_signed_in`, no request sent | (already empty) |
| fetch rejects | `network`, `TypeError: …` | unchanged |
| 401, any body | `session_rejected` | `clear(used)` |
| 2xx, empty body | `ok`, `body: undefined` | unchanged |
| 2xx, JSON body | `ok`, the parsed body (the service checks its shape) | unchanged |
| any status, non-empty body that is not JSON | `server`, `API answered 502 without JSON` | unchanged |
| 403 without a string `error` field | `session_rejected` (API Gateway: token expired or invalid) | `clear(used)` |
| any status, `error` is one of `request.codes` | that code, with the body's `message` (403 `forbidden`, 403 `cannot_delete_admin`, 400 `invalid_request`, 404 `user_not_found`, 409 `user_exists`, 500 `internal_error`, …) | unchanged |
| any status, `error` not in `request.codes` | `unexpected` | unchanged |
| 5xx without `error` (API Gateway's 500 at an authorizer outage; 502, 503, 504) | `server` | unchanged |
| 429 without `error` (stage throttling, 5 req/s) | `server` | unchanged |
| anything else (e.g. 404 `{ "message": "Not Found" }`: a wrong `apiUrl` or path) | `unexpected` | unchanged |

The message is the body's `message` when it is a string, otherwise `API answered <status>`. A JSON
body that is not an object is read as `{}`, as in section 4.5.

The handlers' 401 `unauthorized` (claims missing in the authorizer's context, which cannot happen
behind API Gateway) is caught by the 401 row first: every 401 means the token cannot be used.

**Security notes**

- The token is read from the store at the moment of the call and goes only into the
  `Authorization` header: never into the URL, the outcome or a message.
- A path parameter is passed through `encodeURIComponent` by the caller (section 13), after the
  shared `Username` schema has accepted it.
- Nothing is logged.

### 10.3 Known gap: the API has no CORS configuration

`backend/template.yaml` declares no `CorsConfiguration` on the HTTP API. A browser page served
from another origin (the front end's future CloudFront domain, or a dev server on another port)
therefore cannot call it: the preflight `OPTIONS` that the `Authorization` header triggers is not
answered with `Access-Control-Allow-*` headers, and the browser rejects the call, which the
services report as `network`.

This step is not blocked: the unit and integration tests run in Node, which does not apply CORS.
Fixing the gap is a decision of the front-end architecture document, together with the hosting:
either the API and the page share one origin (CloudFront in front of both, the API under a path),
or the HTTP API gets a `CorsConfiguration` naming the page's origin. The back end is not changed
by this design (decision 27). Cognito and cognito-local already answer the preflight (section 1.1).

### 10.4 Unit tests

`cognito.test.ts` (most of the mapping is already exercised through `login.service.test.ts`,
section 6, which stays unchanged):

| Test | Expect |
|---|---|
| request, password flow | one POST to `cognitoUrl` with both headers and `{ AuthFlow: 'USER_PASSWORD_AUTH', ClientId, AuthParameters }` |
| request, refresh flow | the same with `REFRESH_TOKEN_AUTH` and `{ REFRESH_TOKEN }` |
| refresh answer without `RefreshToken` | success; the session keeps the refresh token passed in |
| refresh answer with a `RefreshToken` | success; the session has the new one (decision 21) |
| no `RefreshToken` and none passed in | `failure unexpected` (the login case) |
| `NotAuthorizedException`, `UserNotFoundException`, `InvalidPasswordException` | `failure not_authorized` |
| `describe` | an `Error` gives `Name: message`; anything else its string |

`api.test.ts` (every row subscribes to `apiCall(...)` first, with a real `SessionStore`):

| Test | Stub answer | Expect |
|---|---|---|
| request shape, no body | 201 | one fetch: `apiUrl + path`, the method, `Authorization: Bearer <token of the store>`, no `Content-Type`, no body |
| request shape, body | 201 | `Content-Type: application/json` and the JSON body |
| token read at call time | — | `set(a)`, call, `set(b)`, call: the first request carries `a`'s token, the second `b`'s |
| not signed in | — | `not_signed_in`; fetch never called |
| 2xx JSON | 201 `{…}` | `ok` with the parsed body and `httpStatus` |
| 2xx empty | 204 | `ok`, `body: undefined` |
| token rejected | 403 `{ message: 'Forbidden' }` | `session_rejected`; `session$` gives `null` |
| header missing | 401 `{ message: 'Unauthorized' }` | `session_rejected`; `session$` gives `null` |
| handler's 403 | 403 `{ error: 'forbidden', message }` | `forbidden` with the message; the session stays |
| code in the list | 409 `{ error: 'user_exists', message }` | `user_exists` |
| code not in the list | 409 `{ error: 'user_exists' }` with `codes: ['forbidden']` | `unexpected` |
| authorizer outage | 500 `{ message: 'Internal Server Error' }` | `server`; the session stays |
| throttled | 429 `{ message: 'Too Many Requests' }` | `server` |
| not JSON | 502 HTML | `server`, `API answered 502 without JSON` |
| JSON that is not an object | 400 `null` | `unexpected`, `API answered 400` |
| other | 404 `{ message: 'Not Found' }` | `unexpected` |
| offline | fetch rejects | `network`; the session stays |
| stale rejection | first request pending; `set(c)`; the first answers 403 without `error` | `session_rejected`, and `session$` still gives `c` |
| no leak | all of the above | no outcome contains the access token |

---

## 11. `RefreshService`

### 11.1 The remote call

`InitiateAuth` with `REFRESH_TOKEN_AUTH` (section 10.1), the app client allowing it
(`ALLOW_REFRESH_TOKEN_AUTH`):

```json
{ "AuthFlow": "REFRESH_TOKEN_AUTH", "ClientId": "<client id>", "AuthParameters": { "REFRESH_TOKEN": "eyJ…" } }
```

Success, HTTP 200, without a refresh token:

```json
{ "AuthenticationResult": { "AccessToken": "eyJ…", "IdToken": "eyJ…", "ExpiresIn": 900, "TokenType": "Bearer" }, "ChallengeParameters": {} }
```

A refresh token that is expired, revoked (the user was deleted: `AdminUserGlobalSignOut`,
architecture section 6.4) or not one at all: HTTP 400 `NotAuthorizedException`.

**Checked against cognito-local (2026-11-05)**, with the local stack running: it implements
`REFRESH_TOKEN_AUTH`. After alice's login, a refresh answered 200 with a new `AccessToken` and
`IdToken` (different `jti` and `iat`, `exp` 24 hours ahead), without `RefreshToken`, like the
cloud, and `POST /hello` accepted the new token (`201`, `Hello World, I am alice`). A garbage
refresh token answered 400 `{ "__type": "NotAuthorizedException", "message": "User not
authorized" }`, without the `x-amzn-ErrorType` header (the mapping reads `__type`). So
`RefreshService` is tested locally like `LoginService`, with no stand-in. One difference stays:
locally a deleted user's refresh token is not revoked (`SKIP_GLOBAL_SIGN_OUT`, architecture
section 8), so "a deleted user cannot refresh" is a cloud property.

### 11.2 Configuration

```ts
export type RefreshConfig = CognitoConfig; // the same values as LoginConfig
```

### 11.3 Types (`refresh.types.ts`)

```ts
export type RefreshFailureReason =
  | 'not_signed_in'     // the store is empty: nothing to refresh, no request
  | 'session_rejected'  // NotAuthorizedException, UserNotFoundException: refresh token expired, revoked or unknown
  | 'no_role'           // the new access token is in neither group (decision 20)
  | 'too_many_attempts' // TooManyRequestsException, LimitExceededException
  | 'network'           // fetch rejected
  | 'server'            // 5xx, or a body that is not JSON
  | 'unexpected';       // anything else, including a challenge or PasswordResetRequiredException

// A success carries no token: the new session is in the store (decision 19).
export type RefreshResult =
  | { status: 'success'; username: string; expiresAt: Date }
  | { status: 'failure'; reason: RefreshFailureReason; message: string };

export type RefreshState = { status: 'idle' } | { status: 'pending' } | RefreshResult;
```

### 11.4 The class

```ts
const REFRESH_LEAD_MS = 60_000; // refresh one minute before the access token expires

export class RefreshService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<RefreshResult>(1);
  readonly refreshResult$: Observable<RefreshResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<RefreshState>({ status: 'idle' });
  readonly refreshState$: Observable<RefreshState> = this.stateSubject.asObservable();

  private pending?: Subscription;  // the refresh in flight, cancelled by a new one
  private schedule?: Subscription; // the automatic refresh, between start() and stop()

  constructor(private readonly config: RefreshConfig, private readonly store: SessionStore) {}

  refresh(): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending' });

    this.pending = this.store.session$
      .pipe(
        take(1), // the refresh token of the current session, read now (section 9.5)
        switchMap((session) =>
          session
            ? initiateAuth(this.config, 'REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: session.refreshToken }).pipe(
                map(({ status, text }) => this.settle(session, toAuthOutcome(status, text, session.refreshToken))),
                catchError((err: unknown) => of(failure('network', describe(err)))),
              )
            : of(failure('not_signed_in', 'Nobody is signed in')),
        ),
        tap((result) => this.stateSubject.next(result)),
      )
      .subscribe((result) => this.resultSubject.next(result)); // next only: section 3.2
  }

  // Automatic refresh: 60 s before each session's expiry, re-armed by every new session.
  start(): void {
    this.stop();
    this.schedule = this.store.session$
      .pipe(switchMap((s) => (s ? timer(new Date(s.expiresAt.getTime() - REFRESH_LEAD_MS)) : EMPTY)))
      .subscribe(() => this.refresh());
  }

  stop(): void {
    this.schedule?.unsubscribe();
    this.schedule = undefined;
  }

  // Writes the store first (guarded, section 9.2), then returns the outcome for the streams.
  private settle(started: Session, outcome: AuthOutcome): RefreshResult {
    if (outcome.status === 'success') {
      this.store.replace(started, outcome.session);
      return { status: 'success', username: outcome.session.username, expiresAt: outcome.session.expiresAt };
    }
    const reason = REASON[outcome.reason];
    if (reason === 'session_rejected' || reason === 'no_role') this.store.clear(started);
    return failure(reason, outcome.message);
  }
}
```

Reading it:

- `refresh()` follows `LoginService.login()` line by line: cancel, `pending`, request, map,
  `catchError` to `network`, `tap` to the state, `next` only to the result. The one addition is
  `take(1)` on the store, as in the API helper (section 10.2).
- `start()` uses `switchMap` on `session$`: every new session (a login, a successful refresh)
  cancels the old timer and arms a new one; `null` (logout, expiry, rejection) disarms it. A
  `timer` with a date in the past fires at once, so a session that is less than a minute from
  its expiry is refreshed immediately.
- `start()` twice is the same as once. `stop()` cancels the schedule, not a refresh in flight.
- **One attempt per session, no retry** (decision 22). After a `network` or `server` failure the
  session stays until its expiry, when the store clears it and the view shows the login form.
- Nothing starts in the constructor. The application calls `start()` once at start-up.

| Event | `refreshState$` | `refreshResult$` | `session$` |
|---|---|---|---|
| service created | `idle` | (nothing) | unchanged |
| `refresh()` | `pending` | | |
| Cognito answers 200 | `success` | `success` | the new session (after it, the streams) |
| `refresh()`, Cognito answers 400 `NotAuthorizedException` | `pending`, `failure session_rejected` | `failure session_rejected` | `null` |
| `refresh()`, offline | `pending`, `failure network` | `failure network` | unchanged |
| `refresh()` with an empty store | `pending`, `failure not_signed_in` | `failure not_signed_in` | (empty) |

### 11.5 Mapping the answer

| `AuthOutcome` (section 10.1) | `RefreshResult` | Store |
|---|---|---|
| `success` | `success` with `username`, `expiresAt` | `replace(started, new)`; the refresh token is kept (decision 21) |
| `not_authorized` | `session_rejected` | `clear(started)` |
| `no_role` | `no_role` | `clear(started)` |
| `too_many_attempts` | `too_many_attempts` | unchanged |
| `server` | `server` | unchanged |
| `challenge`, `password_reset_required`, `unexpected` | `unexpected` | unchanged |
| fetch rejects | `network` | unchanged |
| empty store | `not_signed_in`, no request | (empty) |

If a logout or a new login happens while the refresh is in flight, the guarded write leaves the
store alone; the outcome still reports what Cognito answered.

### 11.6 Use from the view layer

```ts
// Application start-up: one store, shared by every service.
const store = new SessionStore();
const login = new LoginService({ cognitoUrl, clientId }, store);
const refresh = new RefreshService({ cognitoUrl, clientId }, store);
refresh.start(); // once: every session is refreshed one minute before it expires

store.session$.subscribe((session) => (session ? app.show(session) : app.showLogin()));
```

The view rarely subscribes to `refreshResult$` or `refreshState$`: what matters to it is
`session$`, which carries the new session or `null`. The streams are there for a status line, or
for a view that wants to say why the session ended.

### 11.7 Security notes

- The refresh token is read from the store at the moment of the call and goes only into the
  request body: never in a URL, a state, a result or a message. The service keeps no copy: `settle`
  receives the session it started from as an argument.
- A refresh result carries no token (decision 19, rule 9).
- A rejected refresh token signs the user out at once (`clear`), which is how a deleted user is
  signed out in the cloud at the next refresh (section 9.7).
- Nothing is logged.

### 11.8 Unit tests (`refresh.service.test.ts`)

`fetch` stubbed with real `Response` objects; `vi.useFakeTimers()` for the schedule and the
store's expiry. Every test subscribes first, then calls.

| Test | Setup and stub answer | Expect |
|---|---|---|
| success | store holds `a`; 200 with new tokens, no `RefreshToken` | `refreshResult$` gives `success` with `username` and the new `expiresAt`; `session$` gives the new session with the new access token and `a`'s refresh token; states `idle`, `pending`, `success`; the store was written before the result was emitted |
| request shape | store holds `a` | one POST with `REFRESH_TOKEN_AUTH`, the client id and `a.refreshToken` |
| refresh token rotated | 200 with a `RefreshToken` | the session holds the new refresh token |
| not signed in | empty store | `failure not_signed_in`; fetch never called |
| rejected | 400 `NotAuthorizedException` | `failure session_rejected`; `session$` gives `null` |
| no role | 200, new token without groups | `failure no_role`; `session$` gives `null` |
| throttled | 400 `TooManyRequestsException` | `failure too_many_attempts`; the session stays |
| server | 503, or HTML 502 | `failure server`; the session stays |
| offline | fetch rejects | `failure network`; the session stays; a second `refresh()` gives a second result (the subject is alive) |
| challenge | 200 with `ChallengeName` | `failure unexpected` |
| cancel | first refresh pending, `refresh()` again | the first request's signal is aborted; one result |
| stale success | refresh pending; `set(c)`; 200 arrives | `session$` still gives `c` |
| stale rejection | refresh pending; `set(c)`; 400 `NotAuthorizedException` arrives | `session$` still gives `c` |
| schedule | session expiring in 15 min; `start()` | no fetch at 14 min − 1 ms; one refresh fetch at 14 min |
| re-arm | after the scheduled refresh succeeds (new `exp` 15 min later) | the next refresh fires 14 min after the first |
| nearly expired | session expiring in 30 s; `start()` | refresh at once |
| no session | `start()` with an empty store, then a login's `set()` | nothing until the session exists; then scheduled |
| stop | `start()`, `stop()` | no fetch at 14 min |
| start twice | `start()`, `start()` | one fetch at 14 min |
| constructor | service created, store holds a session, time advances past 14 min | no fetch: nothing starts by itself |
| no leak | all outcomes | no state or result contains a token |

### 11.9 Integration checks

In `frontend/tests/integration/journeys.test.ts` (section 14): after alice's login, `refresh()`
gives `success`; the store holds an access token different from the login's, which `POST /hello`
accepts through `HelloService`, and the same refresh token. A store holding alice's session with
`refreshToken: 'garbage'`: `refresh()` gives `failure session_rejected`, and `session$` gives
`null`.

---

## 12. `HelloService`

### 12.1 The remote call

`POST /hello` with no body (architecture section 4), through `apiCall` (section 10.2). Success:
`201` with `HelloResponse` from `shared/`: `{ messageId, role, message, createdAt }`.

### 12.2 Configuration

`ApiConfig = { apiUrl }` (section 10.2), plus the `SessionStore` as the second argument.

### 12.3 Types (`hello.types.ts`)

```ts
import type { ApiErrorCode, HelloResponse } from '@shared-calendar/shared';
import type { TransportFailureReason } from './api';

// Architecture section 4: a handler answers 403 forbidden (in neither group) or 500.
export type HelloFailureReason = Extract<ApiErrorCode, 'forbidden' | 'internal_error'> | TransportFailureReason;

export type HelloResult =
  | { status: 'success'; hello: HelloResponse }
  | { status: 'failure'; reason: HelloFailureReason; message: string };

export type HelloState = { status: 'idle' } | { status: 'pending' } | HelloResult;
```

### 12.4 The class

```ts
const HELLO_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];

export class HelloService {
  private readonly resultSubject = new ReplaySubject<HelloResult>(1);
  readonly helloResult$: Observable<HelloResult> = this.resultSubject.asObservable();

  private readonly stateSubject = new BehaviorSubject<HelloState>({ status: 'idle' });
  readonly helloState$: Observable<HelloState> = this.stateSubject.asObservable();

  private pending?: Subscription;

  constructor(private readonly config: ApiConfig, private readonly store: SessionStore) {}

  hello(): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending' });

    this.pending = apiCall(this.config, this.store, { method: 'POST', path: '/hello', codes: HELLO_CODES })
      .pipe(
        // apiCall never errors: the network failure is already a value (section 10.2).
        map((answer) => (answer.status === 'ok' ? toHelloResult(answer) : answer)),
        tap((result) => this.stateSubject.next(result)),
      )
      .subscribe((result) => this.resultSubject.next(result)); // next only: section 3.2
  }
}
```

### 12.5 Mapping the answer

| Answer | `HelloResult` |
|---|---|
| `201` with `messageId`, `message`, `createdAt` strings and `role` `admin` or `user` | `success` with the body as `HelloResponse` |
| any other 2xx | `failure unexpected`, `API answered <status> with an unexpected body` |
| 403 `forbidden` | `failure forbidden` (a token in neither group); the session stays |
| 500 `internal_error` | `failure internal_error` |
| everything else | the transport rows of section 10.2 (`not_signed_in`, `session_rejected`, `network`, `server`, `unexpected`) |

The body's shape is checked field by field, without a schema library: a 2xx that is not the
contract would otherwise reach the view as a `HelloResponse` it is not.

### 12.6 Use from the view layer

```ts
const hello = new HelloService({ apiUrl }, store);
hello.helloState$.subscribe((state) => {
  button.disabled = state.status === 'pending';
  if (state.status === 'success') messageBox.textContent = state.hello.message;
  if (state.status === 'failure') messageBox.textContent = state.message;
});
button.onclick = () => hello.hello();
```

A `session_rejected` failure needs no handling of its own: the store is already empty, and the
view's `session$` subscription shows the login form.

### 12.7 Security notes

The token comes from the store at the moment of the call (section 10.2); the service keeps none.
The result carries the API's answer only. Nothing is logged.

### 12.8 Unit tests (`hello.service.test.ts`)

| Test | Stub answer | Expect |
|---|---|---|
| success | 201 `HelloResponse` | `helloResult$` gives `success` with the body; states `idle`, `pending`, `success`, the same object in both streams |
| request shape | 201 | one `POST` to `apiUrl + '/hello'` with the store's token, no body |
| forbidden | 403 `{ error: 'forbidden' }` | `failure forbidden`; `session$` still gives the session |
| token rejected | 403 `{ message }` | `failure session_rejected`; `session$` gives `null` |
| not signed in | (empty store) | `pending`, then `failure not_signed_in`; fetch never called |
| internal error | 500 `{ error: 'internal_error' }` | `failure internal_error` |
| wrong body | 201 `{}` | `failure unexpected` |
| offline, then success | fetch rejects, then 201 | `failure network`, then `success` (the subject is alive) |
| cancel | first call pending, `hello()` again | the first signal is aborted; one result |
| late subscriber | subscribe after a success | the result is replayed; the state is the current `success` |

### 12.9 Integration checks

Alice's session → `201`, `Hello World, I am alice`, `role: 'user'`. Admin's session → `Hello
World, the Administrator is speaking`, `role: 'admin'`. A store holding alice's session with
`accessToken: 'garbage'` and a future `expiresAt` → `failure session_rejected`, and `session$`
gives `null`.

---

## 13. `UsersService`

### 13.1 The remote calls

| Call | Request | Success | Errors (architecture section 4) |
|---|---|---|---|
| `createUser(username)` | `POST /users`, body `{ "username": "…" }` | `201` `CreateUserResponse` `{ username, password }` | 400 `invalid_json` / `invalid_request`, 403 `forbidden`, 409 `user_exists`, 500 `internal_error` |
| `deleteUser(username)` | `DELETE /users/{username}`, no body | `204`, no body | 400 `invalid_request`, 403 `forbidden` / `cannot_delete_admin`, 404 `user_not_found`, 500 `internal_error` |

Both through `apiCall` (section 10.2), so the token rules of section 9.4 apply.

### 13.2 Configuration

`ApiConfig = { apiUrl }`, plus the `SessionStore` as the second argument, as for `HelloService`.

### 13.3 Types (`users.types.ts`)

```ts
import type { ApiErrorCode, CreateUserResponse } from '@shared-calendar/shared';
import type { TransportFailureReason } from './api';

export type CreateUserFailureReason =
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'user_exists' | 'internal_error'>
  | TransportFailureReason;
export type DeleteUserFailureReason =
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'cannot_delete_admin' | 'user_not_found' | 'internal_error'>
  | TransportFailureReason;

// The success carries the generated password: the one exception of rule 6 (section 13.7).
export type CreateUserResult =
  | { status: 'success'; user: CreateUserResponse }
  | { status: 'failure'; reason: CreateUserFailureReason; message: string };
export type CreateUserState = { status: 'idle' } | { status: 'pending'; username: string } | CreateUserResult;

// The 204 has no body; the success names the account of the call (decision 24).
export type DeleteUserResult =
  | { status: 'success'; username: string }
  | { status: 'failure'; reason: DeleteUserFailureReason; message: string };
export type DeleteUserState = { status: 'idle' } | { status: 'pending'; username: string } | DeleteUserResult;
```

`invalid_request` is both the API's code and the outcome of the check made before any request
(section 13.4): the same name, because it is the same rule (the shared `Username` schema).

### 13.4 The class

```ts
import { Username, type ApiErrorCode } from '@shared-calendar/shared';

const CREATE_CODES = ['forbidden', 'invalid_json', 'invalid_request', 'user_exists', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const DELETE_CODES = ['forbidden', 'invalid_request', 'cannot_delete_admin', 'user_not_found', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const INVALID_USERNAME =
  'A username has 3 to 32 characters: lowercase letters, digits, ".", "_" or "-", starting with a letter or a digit';

export class UsersService {
  // Pair 1: create.
  private readonly createResultSubject = new ReplaySubject<CreateUserResult>(1);
  readonly createUserResult$: Observable<CreateUserResult> = this.createResultSubject.asObservable();
  private readonly createStateSubject = new BehaviorSubject<CreateUserState>({ status: 'idle' });
  readonly createUserState$: Observable<CreateUserState> = this.createStateSubject.asObservable();
  private pendingCreate?: Subscription;

  // Pair 2: delete.
  private readonly deleteResultSubject = new ReplaySubject<DeleteUserResult>(1);
  readonly deleteUserResult$: Observable<DeleteUserResult> = this.deleteResultSubject.asObservable();
  private readonly deleteStateSubject = new BehaviorSubject<DeleteUserState>({ status: 'idle' });
  readonly deleteUserState$: Observable<DeleteUserState> = this.deleteStateSubject.asObservable();
  private pendingDelete?: Subscription;

  constructor(private readonly config: ApiConfig, private readonly store: SessionStore) {}

  createUser(username: string): void {
    this.pendingCreate?.unsubscribe(); // cancels a pending create only, never a delete
    this.createStateSubject.next({ status: 'pending', username });

    const call: Observable<CreateUserResult> = Username.safeParse(username).success
      ? apiCall(this.config, this.store, { method: 'POST', path: '/users', body: { username }, codes: CREATE_CODES })
          .pipe(map((answer) => (answer.status === 'ok' ? toCreateResult(answer) : answer)))
      : of(failure('invalid_request', INVALID_USERNAME)); // no request sent

    this.pendingCreate = call
      .pipe(tap((result) => this.createStateSubject.next(result)))
      .subscribe((result) => this.createResultSubject.next(result)); // next only: section 3.2
  }

  deleteUser(username: string): void {
    this.pendingDelete?.unsubscribe(); // cancels a pending delete only, never a create
    this.deleteStateSubject.next({ status: 'pending', username });

    const call: Observable<DeleteUserResult> = Username.safeParse(username).success
      ? apiCall(this.config, this.store, {
          method: 'DELETE',
          path: `/users/${encodeURIComponent(username)}`,
          codes: DELETE_CODES,
        }).pipe(map((answer) => (answer.status === 'ok' ? toDeleteResult(answer, username) : answer)))
      : of(failure('invalid_request', INVALID_USERNAME)); // no request sent

    this.pendingDelete = call
      .pipe(tap((result) => this.deleteStateSubject.next(result)))
      .subscribe((result) => this.deleteResultSubject.next(result)); // next only: section 3.2
  }
}
```

- `Username` comes from `@shared-calendar/shared`, never from `zod` directly (the ESLint guard of
  section 5 would reject `zod`). So the front end rejects exactly what the API rejects, and
  `Bob` never leaves the browser.
- The two pairs are independent: a create and a delete can be pending together.

### 13.5 Mapping the answer

| Answer | `createUser` | `deleteUser` |
|---|---|---|
| the username fails `Username` | `invalid_request`, no request | `invalid_request`, no request |
| `201` with `username` and `password` strings | `success`, `user: { username, password }` | — |
| `204` | — | `success`, `username` of the call |
| any other 2xx | `unexpected` | `unexpected` |
| an `error` code of the route | that code (`user_exists`, `forbidden`, …) | that code (`user_not_found`, `cannot_delete_admin`, …) |
| everything else | the transport rows of section 10.2 | the transport rows of section 10.2 |

`forbidden` and `cannot_delete_admin` are handler 403s with an `error` field: the session stays
(section 9.4).

### 13.6 Use from the view layer

```ts
const users = new UsersService({ apiUrl }, store);

users.createUserState$.subscribe((state) => {
  createButton.disabled = state.status === 'pending';
  // Shown once; the view drops it from the screen when the administrator closes the dialog.
  if (state.status === 'success') passwordDialog.show(state.user.username, state.user.password);
  if (state.status === 'failure') createError.textContent = state.message;
});
users.deleteUserResult$.subscribe((r) => {
  if (r.status === 'success') userList.remove(r.username);
});

createButton.onclick = () => users.createUser(usernameInput.value);
deleteButton.onclick = () => users.deleteUser(selectedUsername);
```

The view offers these actions only when `session.role === 'admin'`; the API is the authority and
answers `forbidden` otherwise.

### 13.7 Security notes

- **The generated password** (rule 6, the exception). It arrives in the `201` body and lives only
  in the create success value. That value is held by `createUserState$` until the next
  `createUser` call (its `pending` replaces it) and by `createUserResult$` until the next
  `createUser` outcome. It is never logged, never in a URL or a message, never stored elsewhere by
  the service. The later logout `reset()` drops it too.
- No password of the person signed in is involved.
- The token rules are those of section 10.2. The username goes into the path only after the
  shared schema has accepted it, and through `encodeURIComponent`.
- The front-end check is a convenience; the API validates again (architecture section 4).

### 13.8 Unit tests (`users.service.test.ts`)

| Test | Stub answer | Expect |
|---|---|---|
| create success | 201 `{ username, password }` | `createUserResult$` gives `success` with both; states `idle`, `pending carol`, `success` |
| create request shape | 201 | one `POST` to `apiUrl + '/users'`, bearer token from the store, `Content-Type: application/json`, body `{ "username": "carol" }` |
| create invalid name | — | `createUser('Bob')`: `pending`, then `failure invalid_request`; fetch never called |
| create exists | 409 `{ error: 'user_exists' }` | `failure user_exists` |
| create forbidden | 403 `{ error: 'forbidden' }` | `failure forbidden`; the session stays |
| create wrong body | 201 `{ username }` without password | `failure unexpected` |
| delete success | 204 | `deleteUserResult$` gives `success` with the username |
| delete request shape | 204 | one `DELETE` to `apiUrl + '/users/carol'`, bearer token, no body, no `Content-Type` |
| delete invalid name | — | `deleteUser('../admin')`: `failure invalid_request`; fetch never called |
| delete admin | 403 `{ error: 'cannot_delete_admin' }` | `failure cannot_delete_admin`; the session stays |
| delete unknown | 404 `{ error: 'user_not_found' }` | `failure user_not_found` |
| delete wrong status | 200 `{}` | `failure unexpected` |
| token rejected | 403 `{ message }` | `failure session_rejected`; `session$` gives `null` |
| not signed in | (empty store) | `failure not_signed_in`; fetch never called |
| independent pairs | create pending, then `deleteUser` | the create is not aborted; both results arrive on their own streams |
| cancel | create pending, `createUser` again | the first signal is aborted; one create result |
| retry after failure | 409, then 201 | two results, the second `success` |
| password only where allowed | create success | the password appears in the create success value only: not in the delete streams, not in the store |

### 13.9 Integration checks

As admin (section 14): create `fe-journey` → `success` with a password; `fe-journey` signs in with
`LoginService` and says hello; create it again → `user_exists`; `Bob` → `invalid_request` with no
request sent; delete `admin` → `cannot_delete_admin`; delete `fe-journey` → `success`, after which
its sign-in is `invalid_credentials`; delete it again → `user_not_found`. As alice: create →
`forbidden`, and `session$` still gives her session.

---

## 14. Placement and integration journeys

### 14.1 Placement

```
frontend/src/services/
├── session.store.ts      # SessionStore (section 9)
├── cognito.ts            # CognitoConfig, initiateAuth, toAuthOutcome, describe (10.1)
├── api.ts                # ApiConfig, apiCall, TransportFailureReason, ApiFailure (10.2)
├── jwt.ts                # decodeClaims (unchanged)
├── login.service.ts      # LoginService, LoginConfig (refactored onto cognito.ts)
├── login.types.ts        # Session, LoginFailureReason, LoginResult, LoginState (unchanged)
├── refresh.service.ts    # RefreshService, RefreshConfig (11)
├── refresh.types.ts      # RefreshFailureReason, RefreshResult, RefreshState
├── hello.service.ts      # HelloService (12)
├── hello.types.ts        # HelloFailureReason, HelloResult, HelloState
├── users.service.ts      # UsersService (13)
└── users.types.ts        # Create/DeleteUser FailureReason, Result, State

frontend/tests/
├── unit/services/        # one file per source file: session.store, cognito, api, jwt,
│                         # login.service, refresh.service, hello.service, users.service
└── integration/
    ├── local.ts           # the local stack's URLs and client id (reads backend/env.local.json)
    ├── login.service.test.ts  # the same journeys; tokens read from the store (section 9.9)
    └── journeys.test.ts   # sections 11.9, 12.9, 13.9, in order
```

`local.ts` is a helper, not a test (the integration project selects `*.test.ts` only). Nothing
new in `package.json`, `tsconfig.json`, `vitest.config.ts` or the ESLint guard.

### 14.2 The journeys

`frontend/tests/integration/journeys.test.ts`, run in order like the back end's journeys. Every
service gets its token from a real `SessionStore` that a real `LoginService` filled. Throw-away
user: `fe-journey` (distinct from the back end's `carol` and the smoke test's `smoke-<epoch>`),
removed in `beforeAll` and `afterAll` through `UsersService` as admin, accepting
`user_not_found`, so that a crashed run leaves nothing behind for the next one (decision 26).

| # | Journey | Expect |
|---|---|---|
| 1 | alice signs in into store A | `session$` gives her session (`username: 'alice'`, `role: 'user'`) |
| 2 | `HelloService` on store A | `201`, `Hello World, I am alice` |
| 3 | admin signs in into store B; `HelloService` on B | `Hello World, the Administrator is speaking` |
| 4 | `UsersService` on B: create `fe-journey` | `success` with a non-empty password |
| 5 | `fe-journey` signs in into store C with that password; hello | `success`; `Hello World, I am fe-journey` |
| 6 | create `fe-journey` again | `user_exists` |
| 7 | create `Bob` (a `fetch` spy counts requests) | `invalid_request`; no request sent |
| 8 | delete `admin` | `cannot_delete_admin`; store B unchanged |
| 9 | `UsersService` on A (alice): create `fe-journey` | `forbidden`; store A still gives alice's session |
| 10 | delete `fe-journey` on B | `success`; its sign-in is now `invalid_credentials` |
| 11 | delete `fe-journey` again | `user_not_found` |
| 12 | store D set to alice's session with `accessToken: 'garbage'`, future `expiresAt`; hello | `session_rejected`; `session$` of D gives `null` |
| 13 | `RefreshService` on store A | `success`; A's access token differs from the login's, A's refresh token is the same; hello on A gives `201` |
| 14 | store E set to alice's session with `refreshToken: 'garbage'`; refresh | `session_rejected`; `session$` of E gives `null` |

Journey 13 needs the `REFRESH_TOKEN_AUTH` of cognito-local, checked in section 11.1.

### 14.3 Acceptance check (for the implementation step)

1. From the root, `npm run typecheck`, `npm run lint` and `npm run test:unit` green for the three
   packages; `frontend` at 100 % line coverage on `src/`; `npm run verify -w frontend` green;
   `npm run audit -w backend` nothing at high or above; the lock file unchanged.
2. `RUN_INTEGRATION=1 npm run test:unit -w frontend` against `DYNAMODB_PORT=8002 npm run local:up
   -w backend` and `npm run local:api -w backend`: the login file (section 9.9) and the 14
   journeys green.
3. `DYNAMODB_PORT=8002 npm run verify -w backend` still green, no diff in `backend/` or `shared/`.
