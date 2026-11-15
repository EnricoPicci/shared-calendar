# Front end — The services layer: login, session, refresh, Hello World, users, calendar settings and availability

| | |
|---|---|
| Status | v6 — implemented (2026-11-15, brief `prompts/54-step-53-implementation.md`, plan step 53): `api.ts` for every calendar route (section 10.2), `CalendarSettingsService` (15), `AvailabilityTypesService` (16), `AvailabilityRulesService` (17), `UsersService.listUsers` (13); `CalendarService` and `AppointmentsService` follow in plan step 54. v5 — implemented (2026-11-05): `LoginService` (brief `prompts/31-implement-login-service.md`; design brief `prompts/30-design-first-service-class.md`), and, by brief `prompts/32-implement-session-and-api-services.md`, `SessionStore` (section 9), the shared building blocks `cognito.ts` and `api.ts` (section 10), `RefreshService` (11), `HelloService` (12), `UsersService` (13). Logout is not designed yet |
| Date | 2026-11-05; v6 2026-11-15 |
| Scope | The rules of the front end's services layer, the pattern every service follows, `LoginService`, the `SessionStore` that keeps the signed-in session, the token refresh, the Hello World call and the user administration; since v6 the calendar settings, the availability types and the availability rules (patterns, overrides, one-off windows) |
| Depends on | `docs/ARCHITECTURE.md` v11 (sections 3, 3.1, 4, 6.2, 7.3, 8), since v6 v12 (sections 3 and 4: the calendar routes as implemented); `docs/SHARED_CALENDAR_SPEC.md` v15 section 16 (v13 when v6 was written); `docs/FOLDER_STRUCTURE.md` sections 7 and 8, `shared/` |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-05 | First design: services-layer rules, the service pattern, `LoginService` with `loginResult$` (ReplaySubject) and `loginState$` (BehaviorSubject). |
| v2 | 2026-11-05 | Implemented (brief 31). Details the implementation fixed: an access token that cannot be decoded, or lacks `username` or `exp`, and a 200 without `IdToken` or `RefreshToken`, are `failure unexpected` (section 4.5); a JSON body that is not an object is read as `{}`; `decodeClaims` decodes the payload as UTF-8 (`atob` + `TextDecoder`). Found against cognito-local: it answers a wrong password with `InvalidPasswordException` (real Cognito: `NotAuthorizedException`), now also mapped to `invalid_credentials`; it issues 24-hour access tokens without `ExpiresIn`, so the 15-minute expiry is checked only in the cloud (section 7). `frontend/` exists ahead of the front-end architecture, for the services layer only (decision 8 revised; `docs/FOLDER_STRUCTURE.md` section 7). Section 5: the integration test and the tooling as built, including an ESLint guard against Node imports and globals in `frontend/src`. Section 7: the acceptance as run. |
| v3 | 2026-11-05 | Design of `SessionStore` (section 9): the one in-memory holder of the signed-in `Session`, written by `LoginService` on success, read by the API services, cleared at `expiresAt`, on logout and on an API 401. `LoginService` gains the store as a second constructor argument (section 9.4). Sections 4.6 and 4.8 point at it; decisions 9 to 13. Added as section 9 rather than inserted, so that the section numbers cited by the code and by briefs 30 and 31 stay valid. |
| v4 | 2026-11-05 | Design of the remaining services (brief 32, part A). **Correction:** an expired or invalid token is answered by API Gateway with **403** and its own body `{ "message" }`, not 401 (architecture section 4); 401 means the header is missing. The store is cleared on 401 and on a 403 without an `error` field, and left alone on a handler's 403 (`forbidden`, `cannot_delete_admin`) and on API Gateway's 500 (authorizer outage): sections 9.1, 9.3, 9.4, 9.7, decision 12. The store gains `replace(previous, next)` and `clear(only?)`, so that a late answer cannot overwrite or clear a newer session (section 9.2). Rule 6 gains its one exception: the password `POST /users` generates. New sections, appended so that cited numbers stay valid: 10, the shared building blocks (`cognito.ts`, used by `LoginService` and `RefreshService`; `api.ts`, used by `HelloService` and `UsersService`), with the **known gap** that the API has no CORS configuration (10.3); 11, `RefreshService` (cognito-local implements `REFRESH_TOKEN_AUTH`, checked 2026-11-05); 12, `HelloService`; 13, `UsersService`; 14, the integration journeys. Section 4.8 becomes pointers; decisions 14 to 27. **Tokens live only in the `SessionStore`** (rule 9, decision 28): a login success no longer carries the `Session` but `{ username, role, expiresAt }`, like a refresh success; `LoginService` writes the session to the store and emits the token-free outcome (sections 4.3, 4.6, 4.7, 6, 9.4, 9.7, 10.1; decision 4 revised). This changes `LoginService`'s public result, so its success tests change with it. |
| v6 | 2026-11-15 | Implemented (brief 54, plan step 53, from `docs/SHARED_CALENDAR_SPEC.md` v13 section 16). `api.ts` (section 10.2): `ApiRequest` is a union, `GET`/`DELETE` without a body and `POST`/`PUT`/`PATCH` with one; `query` encoded with `URLSearchParams`; `ApiFailure.conflicts` with `availability_conflict` only, well-formed entries kept; three helpers for the services, `invalidRequest` (the first schema issue with its field), `unexpectedAnswer` and `hasString`. New services, appended after section 14 so that cited numbers stay valid: 15 `CalendarSettingsService`, 16 `AvailabilityTypesService`, 17 `AvailabilityRulesService`. `UsersService` gains `listUsers()` (`GET /users`), and `deleteUser` the reason `concurrent_update`, which the API answers since plan step 51 (section 13). The journeys file `frontend/tests/integration/calendar.test.ts` with the throw-away User `fe-calendar` (section 14.2). Error codes per route are architecture section 4's; spec 11.1 differed on routes 9 and 10, and its v14 corrects route 9 (decision 32). The journeys keep the settings they read in a git-ignored file until they are written back, so even a killed run is repaired by the next one (decision 35). Decisions 29–37. The unit tests share one per-method suite, `tests/unit/services/suite.ts` (section 14.1). No change to the existing services' behaviour but `deleteUser`'s new reason; no existing test changed. |
| v5 | 2026-11-05 | Implemented (brief 32, part B); acceptance in section 14.3. What the code fixed that the sketches left open: `api.ts` has two failure builders, `apiFailure(code, …)` for a route's code (and `UsersService`'s check before any request) and `transportFailure(reason, …)` for the five transport reasons, typed `ApiFailure<never>` so that it fits every route (the sketches' `failure<C>`); `toApiAnswer` reads an empty non-2xx body as `{}`, so a 403 without body is also `session_rejected`; `RefreshService` maps Cognito's reasons with a complete `Record<AuthFailureReason, RefreshFailureReason>` (section 11.5 as a table in code). Tests: the store rows "login writes" and "login failure" of section 9.8 live in `login.service.test.ts`, with the service they exercise; the unit tests share `tests/unit/services/fixtures.ts` (unsigned JWTs, `Response` builders, a session factory); RxJS's `timer` schedules with `setInterval`, so tests that fake timers must fake it (the schedule tests fake `setTimeout`, `setInterval` and `Date` only, and flush fetch promises with the real `setImmediate`); a test session must expire within 24.8 days of the clock, or the store's `setTimeout` overflows and fires at once. Section 5 points at section 14.1 for the tree. No design change. |

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
helpers (10), token refresh (11), Hello World (12), and user administration (13); since v6 the
calendar settings (15), the availability types (16) and the availability rules (17). The calendar
view and the appointments follow (plan step 54).

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
document's name carries the component). The files as built since v5 are listed in section 14.1;
v2 had `login.service.ts`, `login.types.ts`, `jwt.ts` and their tests.

- Runtime dependency: `rxjs` (7.8 or later; `fromFetch` is in `rxjs/fetch`). Plus
  `@shared-calendar/shared`, which brings `zod` with its `Username` schema (section 13): the
  front end uses `zod` only through the shared package.
- `frontend/tsconfig.json` extends `tsconfig.base.json` with `lib: ["ES2022", "DOM"]` (the
  services use `fetch`, `Response`, `atob`); no Node types.
- Unit tests run with vitest in the `node` environment: Node 22 provides `fetch`, `Response`
  and `atob`, so no browser emulation (jsdom) is needed for the services layer.
- Coverage threshold: 100 % lines on `frontend/src` (today: the services).
- `frontend/vitest.config.ts` has two projects like the back end: `unit` and `integration`, the
  second selecting files only when `RUN_INTEGRATION=1`. `npm run test:unit -w frontend` runs `unit`, with
  coverage; `npm run test:integration -w frontend` runs `integration`, as in the back end.
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
| 29 | `ApiRequest` is a union: `GET` and `DELETE` take no `body` (`body?: never`), `POST`, `PUT` and `PATCH` may; `query?: Record<string, string>` encoded with `URLSearchParams`, keys in the order given, no `?` when absent or empty | Brief 54, point 1 (spec 16.1). The compiler refuses a body where fetch would refuse it (`GET`) or the API reads none (`DELETE`). `query` is added now for step 54's routes 15 and 16; `api.test.ts` proves it. |
| 30 | `ApiFailure.conflicts` is set only with `availability_conflict` (a route code); the service keeps the entries whose `appointmentId`, `username`, `start`, `end` are strings, copied field by field; a missing or non-array list gives `[]`; the reason stays `availability_conflict` in every case | Brief 54, point 1. The view can always list what it got, and a malformed answer does not turn a known refusal into `unexpected`. Copying the four fields keeps anything else the server might add out of the view (section 17.7). |
| 31 | `pending` carries **every argument of the call under the API contract's names** from `shared/` (`typeId`, `patternId`, `windowId`, `date`, `name`, `windows`); a whole-object argument is named after its object (`settings`, `pattern`, `window`); a load with no argument carries nothing. A load's streams are named after what it loads (`settingsResult$`, `typesResult$`, `patternsResult$`, `listUsersResult$`), every other method's after the method (`updateResult$`, `createResult$`, `renameResult$`, `removeResult$`, `createPatternResult$`, …), each with its `…State$` | Brief 54, point 2; step 54 copies it. Generalises `deleteUserState$`'s `username` (decision 24) so that a view can show what is pending without keeping its own copy. The names follow spec 16.2. |
| 32 | The error codes of each route are architecture section 4's, which governs where it describes a route (architecture v12). Spec 11.1 v13 differed on two routes: route 9 (`PUT /calendar/patterns/{patternId}`) has no `limit_reached` (v13 wrote "as #8"; **spec v14 writes the list out without it**), route 10 (`DELETE /calendar/patterns/{patternId}`) no `availability_overlap` (spec footnote 1: never answered); if either arrived it would be `unexpected`. `forbidden`, `invalid_json` and `internal_error` are normal reasons. `type_not_found` is one reason for its 404 (path) and its 409 (body) | Brief 54, point 4; route 9 found while implementing, corrected in spec v14 on review. Route 10 stays as the spec's footnote explains it; section 16 of the spec is historical for these services once this document has them. One reason per meaning: the view's text is the same for both `type_not_found` statuses. |
| 33 | Validation before sending: each method parses its input with the shared schema (path first, then body, the handler's order) and on failure answers `invalid_request` with no request sent; the `message` is the first zod issue with its field, `end: end must be after start` (path joined with `.`; without a path the message alone), built by `invalidRequest` in `api.ts`; on success the service sends **zod's parsed output** (the trimmed name), not the caller's input. Nothing that only the server knows is checked (`date_in_past`, overlaps, conflicts, limits, unknown types) | Brief 54, point 5 (spec 16.4). As `UsersService` with `Username`: the front end refuses exactly what the API refuses, by construction. Sending the parsed output means the request is the one the schema accepted. `invalidRequest` takes the error's shape, so `frontend/src` still imports no `zod` (no new allowed import). |
| 34 | A success is checked by hand: the expected status (200, 201 or 204), the top-level shape (an object; the array under `types`, `patterns`, `users`) and the object's id (`typeId`, `patternId`, `windowId`, `date`; `timeZone` for the settings; each listed element's id). The rest is trusted to the contract; anything else is `unexpected`. Success values: `{ settings }`, `{ types }`, `{ type }`, `{ patterns }`, `{ pattern }`, `{ override }`, `{ window }`, `{ users }`; a delete carries the id of the call (`typeId`, `patternId`, `date`, `windowId`). No response schemas in `shared/` | Brief 54, point 3. The same depth as `UsersService`: enough to catch a wrong `apiUrl` or route, without a second, hand-kept copy of every response type. `shared/` keeps TypeScript types only for responses. |
| 35 | The calendar journeys (`calendar.test.ts`) never reset the table and never delete or change what they did not create: throw-away User `fe-calendar`; types `fe-calendar …`; dates in a 31-day band from today + 330, each block on a date with no window and no override; a clean-up of windows, overrides and patterns of its types, then its types, before and after; settings written back (also in `afterAll`), and kept until then in `fe-calendar-settings.local.json` (git-ignored) so that the next run writes them back after a killed one; a limit filled by others' data fails with a clear message. `availability_conflict` end to end waits for step 54 | Brief 54, point 6 (plan "How these steps are run": the front-end journeys create only their own items). A free date makes the overlap checks independent of the back-end journeys' patterns. The settings file (added on review of step 53): a run killed during the settings test (no `afterAll`) left the test's values, and nothing in the table says what the earlier values were, so the next run wrote those back (seen in the acceptance, section 14.5). Now the values read are written to the file before the first write and removed after the write-back; `beforeAll` and `afterAll` write back whatever the file holds and remove it. The name matches the repository's `*.local.json` ignore rule. |
| 36 | `CalendarSettingsService` and `AvailabilityTypesService` serve both roles (routes 1 and 3 are both roles'; their writes answer a User `forbidden`); `AvailabilityRulesService` and `UsersService` are the Administrator's (every route admin only), and `listUsers` joins `UsersService` | Brief 54's open questions. One service per resource, not per role: the API is the authority on roles (section 13.6), and a User needs the settings and the type names for the calendar. |
| 37 | `deleteUser` accepts `concurrent_update` | Since plan step 51 the delete cancels the User's appointments under the calendar lock, which can be busy (architecture section 4); without the code the answer was `unexpected`. The view may offer "try again". |

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
  // Only with `availability_conflict` (v6): the body's well-formed entries, [] when it has none.
  conflicts?: AppointmentConflict[];
};
// A 2xx. `body` is the parsed JSON, or undefined when the body is empty (the 204 of a delete).
export type ApiOk = { status: 'ok'; httpStatus: number; body: unknown };

// A union (v6, decision 29): the compiler refuses a body where fetch would (GET) or the API reads none (DELETE).
type ApiRequestBase<C extends ApiErrorCode> = {
  path: string;                    // '/hello', '/users', '/calendar/types/<encoded typeId>'
  query?: Record<string, string>;  // URLSearchParams, keys in the order given; no '?' when absent or empty
  codes: readonly C[];             // the route's error codes (architecture section 4)
};
export type ApiRequest<C extends ApiErrorCode> =
  | (ApiRequestBase<C> & { method: 'GET' | 'DELETE'; body?: never })
  | (ApiRequestBase<C> & { method: 'POST' | 'PUT' | 'PATCH'; body?: unknown }); // body sent as JSON
```

`AppointmentConflict` is the shared type of spec 6.7 (`{ appointmentId, username, start, end }`,
all strings). v5 had `method: 'POST' | 'DELETE'` and neither `query` nor `conflicts`; the services
of v5 needed no edit for the change.

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
      const query = new URLSearchParams(request.query).toString(); // v6
      return fromFetch(config.apiUrl + request.path + (query === '' ? '' : `?${query}`), {
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
| any status, `error` is `availability_conflict` and in `request.codes` (v6) | `availability_conflict` with `conflicts`: the entries of the body's `conflicts` whose four fields are strings, copied field by field (nothing else of an entry); `[]` when `conflicts` is missing or not an array | unchanged |
| any status, `error` is one of `request.codes` | that code, with the body's `message` (403 `forbidden`, 403 `cannot_delete_admin`, 400 `invalid_request`, 404 `user_not_found`, 409 `user_exists`, 500 `internal_error`, …); no `conflicts` field, even when the body has one | unchanged |
| any status, `error` not in `request.codes` | `unexpected` | unchanged |
| 5xx without `error` (API Gateway's 500 at an authorizer outage; 502, 503, 504) | `server` | unchanged |
| 429 without `error` (stage throttling, 5 req/s) | `server` | unchanged |
| anything else (e.g. 404 `{ "message": "Not Found" }`: a wrong `apiUrl` or path) | `unexpected` | unchanged |

The message is the body's `message` when it is a string, otherwise `API answered <status>`. A JSON
body that is not an object is read as `{}`, as in section 4.5.

The handlers' 401 `unauthorized` (claims missing in the authorizer's context, which cannot happen
behind API Gateway) is caught by the 401 row first: every 401 means the token cannot be used.

**Helpers for the services** (v6). Three small exports that every calendar service uses, so the
services keep only their subjects, their pipelines and their shape checks:

| Export | What it does |
|---|---|
| `invalidRequest(error)` | The failure of a check made before any request (decision 33): `invalid_request` with the first issue of a shared schema's error, `<field>: <message>`, the field path joined with `.` (`windows.1.end: end must be after start`); an issue without a path gives its message alone (`Unrecognized key: "timeZone"`). It takes the error's shape (`{ issues: { path, message }[] }`), not zod's type: `frontend/src` may not import `zod` (section 5). |
| `unexpectedAnswer(answer)` | `unexpected`, `API answered <status> with an unexpected body`: a 2xx that fails a service's shape check (decision 34). `HelloService` and `UsersService`' create and delete keep their own identical lines (v5). |
| `hasString(value, key)` | Whether a parsed body is an object with a string `key`: the shape checks of decision 34. |

**Security notes**

- The token is read from the store at the moment of the call and goes only into the
  `Authorization` header: never into the URL, the outcome or a message.
- A path parameter is passed through `encodeURIComponent` by the caller (section 13), after the
  shared schema has accepted it (`Username`; since v6 `TypeIdParam`, `PatternIdParam`,
  `WindowIdParam`, `DateParam`). Query values go through `URLSearchParams`, which encodes them.
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
| `GET`, `PUT`, `PATCH` (v6) | 200 | that method; a body only for `PUT`/`PATCH` when given |
| no body on `GET`/`DELETE` (v6) | — | `// @ts-expect-error` on both: the compiler refuses them |
| query (v6) | 200 | absent and `{}`: no `?`; two keys in the order given; values encoded (`a b&c=d` → `a+b%26c%3Dd`) |
| conflicts (v6) | 409 `availability_conflict` | the list; malformed entries dropped and extra fields not copied; missing, `null` or not an array → `[]` |
| no conflicts elsewhere (v6) | 409 `availability_overlap` with a `conflicts` field | no `conflicts` on the failure; `availability_conflict` outside the route list → `unexpected`, no `conflicts` |
| helpers (v6) | — | `invalidRequest` with a path, without a path, with no issue; `hasString` on objects and non-objects; `unexpectedAnswer` names the status |

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
| `deleteUser(username)` | `DELETE /users/{username}`, no body | `204`, no body | 400 `invalid_request`, 403 `forbidden` / `cannot_delete_admin`, 404 `user_not_found`, 409 `concurrent_update` (v6), 500 `internal_error` |
| `listUsers()` (v6) | `GET /users`, no body | `200` `ListUsersResponse` `{ users: UserSummary[] }`, the plain Users sorted by username, never an administrator (spec 10.1) | 403 `forbidden`, 500 `internal_error` |

All through `apiCall` (section 10.2), so the token rules of section 9.4 apply. Since plan step 51
a delete first cancels the User's future appointments under the calendar lock (architecture
section 4), which can be busy: `409 concurrent_update`, before any Cognito change; the view may
offer "try again" (v6, decision 37). Every route of this section is admin only, so `UsersService`
stays the Administrator's service; `listUsers` feeds the "book for a User" choice (spec 16.8).

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
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'cannot_delete_admin' | 'user_not_found' | 'concurrent_update' | 'internal_error'>
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

// GET /users (v6): the plain Users, never an administrator (spec 10.1).
type ListUsersCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type ListUsersFailureReason = ListUsersCode | TransportFailureReason;
export type ListUsersResult = { status: 'success'; users: UserSummary[] } | ApiFailure<ListUsersCode>;
export type ListUsersState = { status: 'idle' } | { status: 'pending' } | ListUsersResult;
```

The v6 types write a failure as `ApiFailure<Code>` rather than spelling out its fields: the same
object `apiCall` produces, so the result types cannot drift from it (sections 15–17 do the same).

`invalid_request` is both the API's code and the outcome of the check made before any request
(section 13.4): the same name, because it is the same rule (the shared `Username` schema).

### 13.4 The class

```ts
import { Username, type ApiErrorCode } from '@shared-calendar/shared';

const CREATE_CODES = ['forbidden', 'invalid_json', 'invalid_request', 'user_exists', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const DELETE_CODES = ['forbidden', 'invalid_request', 'cannot_delete_admin', 'user_not_found', 'concurrent_update', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const LIST_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[]; // v6
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
- The pairs are independent: a create, a delete and a list can be pending together.
- **`listUsers()`** (v6) is the third pair, `listUsersResult$` / `listUsersState$`, in the shape
  of `HelloService.hello()`: no argument, so its `pending` carries nothing (decision 31); it
  cancels a pending list only. Its success is `{ status: 'success', users }`.

### 13.5 Mapping the answer

| Answer | `createUser` | `deleteUser` |
|---|---|---|
| the username fails `Username` | `invalid_request`, no request | `invalid_request`, no request |
| `201` with `username` and `password` strings | `success`, `user: { username, password }` | — |
| `204` | — | `success`, `username` of the call |
| `200` with an array `users` whose every element has a string `username` (v6) | `listUsers`: `success`, `users` | |
| any other 2xx | `unexpected` | `unexpected` |
| an `error` code of the route | that code (`user_exists`, `forbidden`, …) | that code (`user_not_found`, `cannot_delete_admin`, `concurrent_update` (v6), …) |
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
| delete, busy lock (v6) | 409 `{ error: 'concurrent_update' }` | `failure concurrent_update` with the message; the session stays |
| `listUsers` (v6) | 200 `{ users }` and the rest | the per-method suite of section 14.1 (`suite.ts`): success, request shape (`GET /users`, no body), both route codes, `user_not_found` → `unexpected`, wrong answers (no `users`, an element without `username`, a 201), `session_rejected`, `not_signed_in`, network then success, cancel (a pending `deleteUser` survives), late subscriber, no leak |

### 13.9 Integration checks

As admin (section 14): create `fe-journey` → `success` with a password; `fe-journey` signs in with
`LoginService` and says hello; create it again → `user_exists`; `Bob` → `invalid_request` with no
request sent; delete `admin` → `cannot_delete_admin`; delete `fe-journey` → `success`, after which
its sign-in is `invalid_credentials`; delete it again → `user_not_found`. As alice: create →
`forbidden`, and `session$` still gives her session.

`listUsers` (v6, `calendar.test.ts`): as admin, the list contains `fe-calendar` and `alice`, never
`admin`; as `fe-calendar`, `forbidden`.

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
├── users.service.ts      # UsersService (13; listUsers since v6)
├── users.types.ts        # Create/Delete/ListUsers FailureReason, Result, State
├── calendar-settings.service.ts   # CalendarSettingsService (15, v6)
├── calendar-settings.types.ts     # Settings / UpdateSettings FailureReason, Result, State
├── availability-types.service.ts  # AvailabilityTypesService (16, v6)
├── availability-types.types.ts    # Types / CreateType / RenameType / RemoveType …
├── availability-rules.service.ts  # AvailabilityRulesService (17, v6)
└── availability-rules.types.ts    # Patterns / CreatePattern / … / DeleteWindow …

frontend/tests/
├── unit/services/        # one file per source file: session.store, cognito, api, jwt,
│                         # login.service, refresh.service, hello.service, users.service,
│                         # calendar-settings.service, availability-types.service,
│                         # availability-rules.service (v6);
│                         # plus fixtures.ts (v5): JWT, Response and session builders,
│                         # and suite.ts (v6): the per-method suite of the API services
└── integration/
    ├── local.ts           # the local stack's URLs and client id (reads backend/env.local.json);
    │                      # since v6 also `outcome()`, used by calendar.test.ts
    ├── login.service.test.ts  # the same journeys; tokens read from the store (section 9.9)
    ├── journeys.test.ts   # sections 11.9, 12.9, 13.9, in order
    └── calendar.test.ts   # v6: sections 13.9 (listUsers), 15.9, 16.9, 17.9 (section 14.4)
```

`local.ts` and `suite.ts` are helpers, not tests (both projects select `*.test.ts` only). Nothing
new in `package.json`, `tsconfig.json`, `vitest.config.ts` or the ESLint guard (v6 included).

**`suite.ts`** (v6). Every API method of sections 13 (`listUsers`), 15, 16 and 17 is tested by one
function, `describeMethod(make, spec, other)`, so that the list of spec 16.6 is the same for each
method and cannot be forgotten for one. A `MethodSpec` names the method's streams, a valid call,
the expected `pending`, the request (method, path, body as sent), a success stub and value, the
answers outside the contract, the route's codes (architecture section 4), codes of other routes
that must stay `unexpected`, and the inputs refused before any request with their messages. The
suite runs, per method: success (states `idle` → `pending` with the arguments → the same success
object); request shape; **every route code** (`it.each`), the session kept; the other routes'
codes → `unexpected`; the wrong answers → `unexpected`; `session_rejected` (the store cleared);
`not_signed_in` (no fetch); each invalid input → `invalid_request` with the field, no fetch;
network then success; **cancel**: a second call aborts the first, while a pending call of `other`
(another method of the same service) is not aborted; late subscriber; no token in any value.
Behaviour that only some methods have (the conflicts list, `deleteUser`'s v5 tests) stays in the
service's own test file.

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

### 14.3 Acceptance check

1. From the root, `npm run typecheck`, `npm run lint` and `npm run test:unit` green for the three
   packages; `frontend` at 100 % line coverage on `src/`; `npm run verify -w frontend` green;
   `npm run audit -w backend` nothing at high or above; the lock file unchanged.
2. `RUN_INTEGRATION=1 npm run test:unit -w frontend` against `DYNAMODB_PORT=8002 npm run local:up
   -w backend` and `npm run local:api -w backend`: the login file (section 9.9) and the 14
   journeys green.
3. `DYNAMODB_PORT=8002 npm run verify -w backend` still green, no diff in `backend/` or `shared/`.

**As run (2026-11-05, v5):**

1. Root `npm run typecheck`, `npm run lint`, `npm run test:unit`: green for `shared` (26 tests),
   `backend` (180) and `frontend` (129 unit tests in 8 files); `frontend` at 100 % lines
   (178/178; branches 131/132: the `?? ''` after `split('#').pop()`, which cannot be reached).
   `npm run verify -w frontend` green. `npm run audit -w backend`: 0 vulnerabilities. The lock
   file is unchanged; no dependency added.
2. `RUN_INTEGRATION=1 npm run test:unit -w frontend` against the local stack: 148 tests, of which
   the login file's 5 and the 14 journeys; run twice in a row, green both times (the removal of
   `fe-journey` at both ends makes it rerunnable).
3. `DYNAMODB_PORT=8002 npm run verify -w backend`: PASSED, with the back end's 13 journeys after
   the front end's; `git status` shows no change in `backend/` or `shared/`.

### 14.4 The calendar journeys (v6)

`frontend/tests/integration/calendar.test.ts` (plan step 53; step 54 adds the calendar view and
the appointments). The local `calendar` table is shared with the back end's journeys, which empty
it at their start and leave their data at their end, and with the smoke test (spec 18.2, 18.4).
So this file, unlike the back end's, **never resets the table**, and never deletes or changes what
it did not create (decision 35):

- **Its throw-away User** is `fe-calendar`, created and removed through `UsersService` as admin,
  before (accepting `user_not_found`) and after, as `fe-journey` in section 14.2.
- **Its types** are named `fe-calendar …`. Its patterns, overrides and one-off windows use only
  those types.
- **Its dates** lie in a band of 31 days from today + 330 (today in the calendar's zone, from the
  settings), far from the smoke test's 50–80 days and from the back-end journeys' dates. Each block
  takes a date of the band that has **no window and no override** in the Administrator's view
  (`GET /calendar` through `apiCall`, since `CalendarService` is step 54's), so nothing it does not
  own can overlap there. A pattern has `validFrom` = `validUntil` = that date and its weekday.
- **Clean-up**, in `beforeAll` and `afterAll`: the one-off windows of its types on the band, the
  band's overrides whose windows are all of its types (it never sets an empty override, which it
  could not tell apart from someone else's), the patterns of its types, then its types (R-TYPE-03
  needs the references gone first). A run that failed half-way is repeated without a manual step.
- **Settings**: read first, written with other values, read back as a User, then written back with
  the values read; `afterAll` writes them back too when a failure came between. `updatedAt` and
  `updatedBy` stay changed, which is acceptable locally. The values read are kept in
  `frontend/tests/integration/fe-calendar-settings.local.json` (git-ignored by `*.local.json`)
  from before the first write until the write-back; `beforeAll` and `afterAll` write back whatever
  that file holds and remove it, so a run **killed** in that test (no `afterAll`) is repaired by
  the next run. The file exists only while the settings are not the ones read.
- **Limits**: before creating a type or a pattern it counts those it does not own; if they fill the
  limit (20 types, 50 patterns) the test fails with a message that says so. A free date has no
  one-off window, so the limit of 10 per date cannot be reached by others' data.
- Every `describe` block creates the state it needs; the file does not rely on the order of the
  files. Runs only with `RUN_INTEGRATION=1`, never at the same time as the back end's journeys.

| Block | Journey | Expect |
|---|---|---|
| settings | admin loads, updates to other values, `fe-calendar` loads, admin writes the read values back | `success` each time; the update's `updatedBy` is the admin; the User reads the new values; the four values are back |
| | `fe-calendar` updates | `forbidden`; the settings unchanged |
| | admin updates with `bookingHorizonDays: 0` | `invalid_request`, `bookingHorizonDays: …`; no request sent |
| types | create `  fe-calendar Studio  `, create `fe-calendar STUDIO`, rename, load as `fe-calendar`, remove, remove again | `success` with the trimmed name; `type_name_exists`; `success`; the User's list has the new name; `success` with the `typeId`; `type_not_found` |
| | rename an unknown ULID | `type_not_found` (404) |
| | `fe-calendar` creates a type | `forbidden` |
| | create `   ` | `invalid_request`, `name: 1 to 40 characters`; no request sent |
| patterns | create on a free date, load, create an overlapping one, update, remove the type, delete, delete again | `success`; listed; `availability_overlap`; `success`; `type_in_use`; `success` with the `patternId`; `pattern_not_found` |
| | create with an unknown `typeId` | `type_not_found` (409) |
| | `fe-calendar` loads the patterns | `forbidden` |
| overrides | set two windows in reverse order, set two overlapping ones, delete, delete again | `success`, windows sorted by start; `availability_overlap`; `success` with the date; `override_not_found` |
| | set on yesterday | `date_in_past` |
| | `fe-calendar` sets one | `forbidden` |
| one-off windows | create, create an overlapping one, remove the type, delete, delete again | `success`; `availability_overlap`; `type_in_use`; `success` with the `windowId`; `window_not_found` |
| | create on yesterday | `date_in_past` |
| | create with `end` before `start` | `invalid_request`, `end: end must be after start`; no request sent |
| users | admin lists; `fe-calendar` lists | the list has `fe-calendar` and `alice`, not `admin`; `forbidden` |

`availability_conflict` needs a booked appointment, which only step 54's `AppointmentsService`
makes: its end-to-end proof waits for step 54; here the unit tests prove the mapping and
`conflicts` (sections 10.4 and 17.8).

### 14.5 Acceptance check (v6, plan step 53)

1. `npm run verify -w frontend` green with 100 % line coverage on `frontend/src`.
2. `RUN_INTEGRATION=1 npm run test:integration -w frontend` green twice in a row, and again after
   `RUN_INTEGRATION=1 DYNAMODB_PORT=8002 npm run test:integration -w backend` (never at the same
   time); after the runs the calendar holds nothing of `fe-calendar` and the settings are as before.
3. A run with a forced failure in the middle of `calendar.test.ts`, then a normal run that passes.
4. The root `DYNAMODB_PORT=8002 npm run verify` green; no diff in `backend/` or `shared/`.

**As run (2026-11-15, v6):**

1. `npm run verify -w frontend`: typecheck, lint, 450 unit tests in 11 files (129 before; none of
   them changed), 100 % lines (branches 99.58 %: the one of v5, in `cognito.ts`).
2. Integration (`calendar.test.ts`: 18 tests; with the two v5 files 37): green twice in a row, then
   green after the back end's 90 journeys. A read-only snapshot through the API (settings, types,
   patterns, the band's view, `GET /users`) taken before and after was identical each time.
3. Forced failure, from a temporary copy of the file outside the repository (with its own vitest
   configuration), never by editing the committed test. **Thrown**: after the settings update the
   copy makes a type, a pattern, an override, two one-off windows (one on the override's date), and
   throws: `afterAll` wrote the settings back and removed everything; the next normal run passed,
   snapshot identical. **Killed** (`SIGKILL` of the test worker at the same point, so no `afterAll`):
   the next normal run removed the type, the pattern, the override, both windows and `fe-calendar`,
   and passed; the **settings stayed at the copy's values**, which the next run took as "the values
   read". They were put back by hand (`PUT /calendar/settings` with the values of the snapshot).
   Hence the settings file (decision 35). **Killed again, with the file**: the file held the values
   read (48 / 2 / 30 / `null`) and the settings the copy's (700 / 7 / 300 / 77); the next normal run
   wrote the file's values back, removed the file and passed; snapshot identical. The thrown
   variant, repeated with the file: `afterAll` wrote them back and removed it; snapshot identical.
4. Root `DYNAMODB_PORT=8002 npm run verify`: PASSED (back end 1087 unit + 90 integration, `shared`
   377, front end 450); `git status` shows no change in `backend/` or `shared/`.

---

## 15. `CalendarSettingsService` (v6)

### 15.1 The remote calls

| Call | Request | Success | Errors (architecture section 4) |
|---|---|---|---|
| `load()` | `GET /calendar/settings`, no body; **both roles** | `200` `CalendarSettings` | 403 `forbidden` (neither group), 500 `internal_error` |
| `update(settings)` | `PUT /calendar/settings`, body `UpdateSettingsBody` (all four values); **admin only** | `200` `CalendarSettings` | 400 `invalid_json` / `invalid_request`, 403 `forbidden`, 409 `concurrent_update`, 500 `internal_error` |

`CalendarSettings` and `UpdateSettingsBody` are the shared types (spec 9, 11.4, 11.5). Both roles
use the one service (decision 36): a User needs the settings to explain the rules (notice,
horizon), and calling `update` as a User is answered `forbidden` by the API, as any admin route.

### 15.2 Configuration

`ApiConfig = { apiUrl }`, plus the `SessionStore` as the second argument, as for `HelloService`.

### 15.3 Types (`calendar-settings.types.ts`)

```ts
type LoadCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type SettingsFailureReason = LoadCode | TransportFailureReason;
export type SettingsResult = { status: 'success'; settings: CalendarSettings } | ApiFailure<LoadCode>;
export type SettingsState = { status: 'idle' } | { status: 'pending' } | SettingsResult;

type UpdateCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'concurrent_update' | 'internal_error'>;
export type UpdateSettingsFailureReason = UpdateCode | TransportFailureReason;
export type UpdateSettingsResult = { status: 'success'; settings: CalendarSettings } | ApiFailure<UpdateCode>;
export type UpdateSettingsState = { status: 'idle' } | { status: 'pending'; settings: UpdateSettingsBody } | UpdateSettingsResult;
```

### 15.4 The class

Two pairs, in the shape of `UsersService` (section 13.4): `settingsResult$` / `settingsState$`
for `load()`, `updateResult$` / `updateState$` for `update(settings)` (decision 31 for the names).
Each method cancels its own pending call only.

- `load()` has no argument: `pending` carries nothing.
- `update(settings)`: `pending` carries `{ settings }`, the argument as given. The service parses
  it with the shared `UpdateSettingsBody`; on failure it answers `invalid_request` with
  `invalidRequest` (section 10.2: `bookingHorizonDays: Too big: expected number to be <=365`, or
  `Unrecognized key: "timeZone"` for a field the body may not carry), with no request sent. On
  success it sends zod's parsed output (decision 33).

### 15.5 Mapping the answer

| Answer | `load` | `update` |
|---|---|---|
| the input fails `UpdateSettingsBody` | — | `invalid_request` with the field, no request |
| `200` with an object whose `timeZone` is a string | `success`, `settings` | `success`, `settings` |
| any other 2xx | `unexpected` | `unexpected` |
| an `error` code of the route | that code | that code (`concurrent_update`, …) |
| everything else | the transport rows of section 10.2 | the same |

What is checked is the status and the object's identifying field, `timeZone` (decision 34); the
other fields are trusted to the contract.

### 15.6 Use from the view layer

```ts
const settings = new CalendarSettingsService({ apiUrl }, store);
settings.settingsState$.subscribe((s) => { if (s.status === 'success') form.fill(s.settings); });
settings.updateState$.subscribe((s) => {
  saveButton.disabled = s.status === 'pending';
  if (s.status === 'failure') formError.textContent = s.message; // concurrent_update: offer "try again"
});
settings.load();
saveButton.onclick = () => settings.update(form.values());
```

After a write fails with `network` or `server` the server may still have applied it (spec 16.3):
the view loads again before showing the outcome as certain.

### 15.7 Security notes

No secret: settings are not personal data. The token rules are those of section 10.2.

### 15.8 Unit tests (`calendar-settings.service.test.ts`)

The per-method suite of section 14.1 for both methods. `load`: `GET /calendar/settings`, no body;
codes `forbidden`, `internal_error`; `concurrent_update` and `invalid_request` → `unexpected`;
wrong answers (no `timeZone`, a 201, an empty 200). `update`: `PUT` with the JSON body; its five
codes; `type_not_found` → `unexpected`; wrong answers (`timeZone` a number, a 204); invalid inputs
with their messages: out of range, not an integer, a missing field, an unknown field (no path).

### 15.9 Integration checks

Section 14.4, block "settings".

---

## 16. `AvailabilityTypesService` (v6)

### 16.1 The remote calls

| Call | Request | Success | Errors (architecture section 4) |
|---|---|---|---|
| `load()` | `GET /calendar/types`; **both roles** | `200` `{ types: AvailabilityType[] }`, by name | 403 `forbidden`, 500 `internal_error` |
| `create(name)` | `POST /calendar/types`, `{ name }`; admin | `201` `AvailabilityType` | 400 `invalid_json` / `invalid_request`, 403 `forbidden`, 409 `type_name_exists`, `limit_reached`, `concurrent_update`, 500 |
| `rename(typeId, name)` | `PUT /calendar/types/{typeId}`, `{ name }`; admin | `200` `AvailabilityType` | 400 `invalid_json` / `invalid_request`, 403 `forbidden`, 404 `type_not_found`, 409 `type_name_exists`, `concurrent_update`, 500 |
| `remove(typeId)` | `DELETE /calendar/types/{typeId}`, no body; admin | `204` | 400 `invalid_request`, 403 `forbidden`, 404 `type_not_found`, 409 `type_in_use`, `concurrent_update`, 500 |

A User reads the types through this service too (route 3 is both roles'; decision 36): the view
needs their names for the calendar's legend. The three writes are the Administrator's; a User gets
`forbidden`.

### 16.2 Configuration

As section 15.2.

### 16.3 Types (`availability-types.types.ts`)

One `…FailureReason`, `…Result` and `…State` per method, as in section 15.3: `TypesResult`
(`{ status: 'success', types }`), `CreateTypeResult` and `RenameTypeResult` (`{ …, type }`),
`RemoveTypeResult` (`{ …, typeId }`, the id of the call). `pending`: nothing, `{ name }`,
`{ typeId, name }`, `{ typeId }`. `type_not_found` is one reason for its 404 (a path id) and its
409 (a body id, route 8 and later): the view says "this type no longer exists" in both cases
(decision 32).

### 16.4 The class

Four pairs, `typesResult$` / `typesState$`, `createResult$` / `createState$`, `renameResult$` /
`renameState$`, `removeResult$` / `removeState$`, each cancelling only its own pending call.
Validation before sending (decision 33): `create` parses `{ name }` with `TypeBody` and sends the
parsed output, so `'  Studio  '` goes out as `'Studio'` while `pending` keeps the argument as
given; `rename` parses `TypeIdParam` first, then `TypeBody` (the handler's order: path, then
body); `remove` parses `TypeIdParam`. A failure answers `invalid_request` (`name: 1 to 40
characters`, `typeId: expected a ULID`), with no request sent. The id goes into the path through
`encodeURIComponent`. The service does not check the name's uniqueness or the limit of 20: only the
server knows the stored types.

### 16.5 Mapping the answer

| Answer | `load` | `create` / `rename` | `remove` |
|---|---|---|---|
| the input fails the schema | — | `invalid_request`, no request | `invalid_request`, no request |
| the expected status (`200`, `201` / `200`, `204`) and shape | `success`, `types`: an array whose every element has a string `typeId` | `success`, `type`: an object with a string `typeId` | `success`, `typeId` of the call |
| any other 2xx | `unexpected` | `unexpected` | `unexpected` |
| an `error` code of the route | that code | that code | that code (`type_in_use`, …) |
| everything else | section 10.2 | section 10.2 | section 10.2 |

### 16.6 Use from the view layer

```ts
const types = new AvailabilityTypesService({ apiUrl }, store);
types.typesState$.subscribe((s) => { if (s.status === 'success') typeList.render(s.types); });
types.removeResult$.subscribe((r) => {
  if (r.status === 'success') types.load(); // no service refreshes another, nor itself (spec 16.3)
  if (r.status === 'failure' && r.reason === 'type_in_use') alert.show('Remove its windows first');
});
types.load();
```

### 16.7 Security notes

No secret, no personal data. The token rules are those of section 10.2.

### 16.8 Unit tests (`availability-types.service.test.ts`)

The per-method suite of section 14.1 for the four methods, each with its route's codes and, as
`unexpected`, codes of the neighbouring routes (`type_not_found` and `type_in_use` for `create`,
`limit_reached` for `rename`, `invalid_json` for `remove`). Invalid inputs: an empty name after
trimming, 41 characters, a control character; a `typeId` that is not a ULID (`../types`, lower
case), and for `rename` with both wrong the path's message. Wrong answers: a missing or
non-array `types`, an element without `typeId` or `null`, a 200 where a 201 is due and back, a 200
for a delete.

### 16.9 Integration checks

Section 14.4, block "types".

---

## 17. `AvailabilityRulesService` (v6)

### 17.1 The remote calls

All admin only (a User gets `forbidden`). Codes from architecture section 4 (decision 32).

| Call | Request | Success | Errors besides 403 `forbidden`, 500 `internal_error` |
|---|---|---|---|
| `loadPatterns()` | `GET /calendar/patterns` | `200` `{ patterns: WeeklyPattern[] }` | — |
| `createPattern(pattern)` | `POST /calendar/patterns`, `PatternBody` | `201` `WeeklyPattern` | 400 `invalid_json` / `invalid_request` · 409 `type_not_found`, `limit_reached`, `availability_overlap`, `availability_conflict`, `concurrent_update` |
| `updatePattern(patternId, pattern)` | `PUT /calendar/patterns/{patternId}`, `PatternBody` | `200` `WeeklyPattern` | 400 `invalid_json` / `invalid_request` · 404 `pattern_not_found` · 409 `type_not_found`, `availability_overlap`, `availability_conflict`, `concurrent_update` |
| `deletePattern(patternId)` | `DELETE /calendar/patterns/{patternId}` | `204` | 400 `invalid_request` · 404 `pattern_not_found` · 409 `availability_conflict`, `concurrent_update` |
| `setOverride(date, windows)` | `PUT /calendar/overrides/{date}`, `{ windows }` | `200` `DateOverride` | 400 `invalid_json` / `invalid_request` · 409 `date_in_past`, `type_not_found`, `availability_overlap`, `availability_conflict`, `concurrent_update` |
| `deleteOverride(date)` | `DELETE /calendar/overrides/{date}` | `204` | 400 `invalid_request` · 404 `override_not_found` · 409 `date_in_past`, `availability_overlap`, `availability_conflict`, `concurrent_update` |
| `createWindow(window)` | `POST /calendar/windows`, `OneOffWindowBody` | `201` `OneOffWindow` | 400 `invalid_json` / `invalid_request` · 409 `date_in_past`, `type_not_found`, `limit_reached`, `availability_overlap`, `concurrent_update` |
| `deleteWindow(windowId)` | `DELETE /calendar/windows/{windowId}` | `204` | 400 `invalid_request` · 404 `window_not_found` · 409 `date_in_past`, `availability_conflict`, `concurrent_update` |

Architecture section 4 governs. `updatePattern` has no `limit_reached` (an update never adds a
pattern; spec v14 says so, v13 wrote "as #8") and `deletePattern` no `availability_overlap` (spec
11.1 lists it, with footnote 1: it never happens). Either code, if it ever arrived, would
be `unexpected`. Overrides and one-off windows have no list route: the Administrator's calendar
view (route 15, `CalendarService`, step 54) carries them with their source and id (spec 11.1).

### 17.2 Configuration

As section 15.2.

### 17.3 Types (`availability-rules.types.ts`)

One `…FailureReason`, `…Result` and `…State` per method. Success values: `{ patterns }`,
`{ pattern }` (create and update), `{ override }`, `{ window }`, and for the deletes the id of the
call: `{ patternId }`, `{ date }`, `{ windowId }`. `pending` (decision 31): nothing, `{ pattern }`,
`{ patternId, pattern }`, `{ patternId }`, `{ date, windows }`, `{ date }`, `{ window }`,
`{ windowId }`. A failure is `ApiFailure<Code>`, so on the six routes that can answer
`availability_conflict` the view finds `conflicts` on it (section 10.2):

```ts
rules.deleteWindowResult$.subscribe((r) => {
  if (r.status === 'failure' && r.reason === 'availability_conflict') conflictList.render(r.conflicts ?? []);
});
```

### 17.4 The class

Eight pairs named after their methods (`patternsResult$` / `patternsState$` for the load,
`createPatternResult$` / `createPatternState$`, …, `deleteWindowResult$` / `deleteWindowState$`),
each cancelling only its own pending call. Validation before sending (decision 33), path first,
then body:

| Method | Schemas |
|---|---|
| `createPattern` | `PatternBody` |
| `updatePattern` | `PatternIdParam`, then `PatternBody` |
| `deletePattern` | `PatternIdParam` |
| `setOverride` | `DateParam`, then `OverrideBody` (`{ windows }`) |
| `deleteOverride` | `DateParam` |
| `createWindow` | `OneOffWindowBody` |
| `deleteWindow` | `WindowIdParam` |

The messages name the field: `end: end must be after start`, `windows.1.end: end must be after
start`, `validUntil: validUntil must not be before validFrom`, `date: not a real date`. The
schemas decide only what is malformed by itself (`shared/src/calendar/schemas.ts`); the service
does not check what only the server knows (`date_in_past`, which needs the calendar's "today";
overlaps, conflicts, limits, unknown types).

### 17.5 Mapping the answer

| Answer | Result |
|---|---|
| the input fails its schema | `invalid_request` with the field, no request |
| `loadPatterns`: `200` with an array `patterns`, every element with a string `patternId` | `success`, `patterns` |
| `createPattern` `201`, `updatePattern` `200`: an object with a string `patternId` | `success`, `pattern` |
| `setOverride` `200`: an object with a string `date` | `success`, `override` |
| `createWindow` `201`: an object with a string `windowId` | `success`, `window` |
| a delete's `204` | `success` with the id of the call |
| any other 2xx | `unexpected` |
| `availability_conflict` (routes that list it) | that reason, with `conflicts` |
| another `error` code of the route | that code |
| everything else | section 10.2 |

### 17.6 Use from the view layer

The availability-management screens of spec 16.8: a patterns list grouped by weekday from
`patternsState$`, per-date editors that call `setOverride` / `deleteOverride` and
`createWindow` / `deleteWindow`, and the conflicts list when a change is refused. To change a
pattern "from next month on", the view calls `updatePattern` (setting `validUntil`) and then
`createPattern` (spec 6.2); to "edit" a one-off window, `deleteWindow` then `createWindow`
(R-ONE-02). After a success the view reloads the calendar view (spec 16.3).

### 17.7 Security notes

`conflicts` carries usernames and appointment times, personal data: never logged (rule 6), and
only the Administrator receives it (spec 6.7). `toConflicts` copies the four contract fields of
each entry and nothing else, so an unexpected field of the server's answer does not reach the view.

### 17.8 Unit tests (`availability-rules.service.test.ts`)

The per-method suite of section 14.1 for the eight methods, each paired with the next one for the
cancel test. Per route its codes, and as `unexpected` the codes of neighbouring routes, among them
`limit_reached` for `updatePattern` and `availability_overlap` for `deletePattern` (decision 32),
and `availability_conflict` for `createWindow` (R-AV-04: a new window never conflicts). Invalid
inputs per method (end before start, off the grid, weekday 8, `validUntil` before `validFrom`, an
unknown field, ids that are not ULIDs, `2027-02-29`, a date with a time, 11 windows, `end`
`24:15`, `start` `24:00`, a missing `typeId`). Plus, for the six routes that list it, a 409
`availability_conflict` with a `conflicts` list: the failure carries the list.

### 17.9 Integration checks

Section 14.4, blocks "patterns", "overrides" and "one-off windows". `availability_conflict` end to
end waits for step 54.
