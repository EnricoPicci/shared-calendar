# Front end — The services layer: login, session, refresh, logout, Hello World, users, the shared calendar, the assistant and the change of password

| | |
|---|---|
| Status | v12 — implemented (2026-11-24, brief `prompts/e14-step-u4-implementation.md`, `docs/CAPACITY_PLAN.md` step u4): the capacity of a type (`docs/SHARED_CALENDAR_SPEC.md` v17, decisions D24 to D31) in the services: `AvailabilityTypesService.create` and `rename` take an optional `capacity` (section 16, decision 70); `AppointmentsService.book` and `change` pass `overbook` through and answer `user_busy` (section 19). v11 — implemented (2026-11-23, brief `prompts/e05-step-p3-implementation.md`, `docs/CHANGE_PASSWORD_PLAN.md` step p3): `ChangePasswordService` says its success before it clears the store (section 22.4, decision 69), so that the shell reacts while the person is still signed in. v10 — implemented (2026-11-22, brief `prompts/e03-step-p2-implementation.md`, `docs/CHANGE_PASSWORD_PLAN.md` step p2): `ChangePasswordService` (section 22), a person's change of their own password straight at Cognito, with `cognito.ts` making one request for any target of Cognito (section 10.1). v9 — implemented (2026-11-22, brief `prompts/a13-step-c11-implementation.md`, `docs/CONVERSATIONAL_PLAN.md` step c11): `AssistantService` (section 21), one stream for its six calls (section 3.4); **with it the services layer covers every route of the API again**. v8 — implemented (2026-11-21, brief `prompts/95-step-71-implementation.md`, `docs/FRONTEND_DEPLOY_PLAN.md` step 71; the design reviewed before the code): `LogoutService` (section 20), `revokeToken` and `toRevokeOutcome` in `cognito.ts` (section 10.1), `reset()` on `LoginService` and `RefreshService`; proven against cognito-local, and at the deployed page as far as the revocation answered 200 (2026-11-21, `docs/FRONTEND_DEPLOY_PLAN.md` step 72; section 20.9 says what was seen and what was not). v7 — implemented (2026-11-15, brief `prompts/56-step-54-implementation.md`, plan step 54): `CalendarService` (section 18) and `AppointmentsService` (19); the services layer was then complete for every route the API had: the assistant's six routes came later. v6 — implemented (2026-11-15, brief `prompts/54-step-53-implementation.md`, plan step 53): `api.ts` for every calendar route (section 10.2), `CalendarSettingsService` (15), `AvailabilityTypesService` (16), `AvailabilityRulesService` (17), `UsersService.listUsers` (13). v5 — implemented (2026-11-05): `LoginService` (brief `prompts/31-implement-login-service.md`; design brief `prompts/30-design-first-service-class.md`), and, by brief `prompts/32-implement-session-and-api-services.md`, `SessionStore` (section 9), the shared building blocks `cognito.ts` and `api.ts` (section 10), `RefreshService` (11), `HelloService` (12), `UsersService` (13). **The time step becomes 5 minutes** (`docs/SHARED_CALENDAR_SPEC.md` decision D32): where this document says the 15-minute grid, it is changed in step s4 of `docs/SLOT_STEP_PLAN.md`; the shared schemas the services check with already accept 5-minute times. |
| Date | 2026-11-05; v6 and v7 2026-11-15; v8 2026-11-21; v9 and v10 2026-11-22; v11 2026-11-23; v12 2026-11-24 |
| Scope | The rules of the front end's services layer, the pattern every service follows, `LoginService`, the `SessionStore` that keeps the signed-in session, the token refresh, the Hello World call and the user administration; since v6 the calendar settings, the availability types and the availability rules (patterns, overrides, one-off windows); since v7 the calendar view and the appointments; since v8 the sign-out; since v9 the conversation with the assistant; since v10 the change of one's own password; since v12 the capacity of a type |
| Depends on | `docs/ARCHITECTURE.md` v11 (sections 3, 3.1, 4, 6.2, 7.3, 8), since v6 v12 (sections 3 and 4: the calendar routes as implemented); `docs/SHARED_CALENDAR_SPEC.md` v15 section 16 (v13 when v6 was written), and for v7 sections 8, 11.1 (routes 15–20), 11.2, 11.5, 11.6; for v8 `docs/FRONTEND_ARCHITECTURE.md` section 13.7 and section 11, decision 152 (the direction for logout as v14 had it; its v15 follows this design), and `docs/ARCHITECTURE.md` section 7.3; `docs/FOLDER_STRUCTURE.md` sections 7 and 8, `shared/`; for v9 `docs/CONVERSATIONAL_ARCHITECTURE.md` v14 (sections 4.4, 5.1 to 5.5, 6, 6.1 and 13) and `docs/ARCHITECTURE.md` section 4, "The assistant's routes"; for v10 `docs/ARCHITECTURE.md` v14 (sections 5.1, 6.9, 7.3 and 8) and `docs/CHANGE_PASSWORD_PLAN.md` |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-05 | First design: services-layer rules, the service pattern, `LoginService` with `loginResult$` (ReplaySubject) and `loginState$` (BehaviorSubject). |
| v2 | 2026-11-05 | Implemented (brief 31). Details the implementation fixed: an access token that cannot be decoded, or lacks `username` or `exp`, and a 200 without `IdToken` or `RefreshToken`, are `failure unexpected` (section 4.5); a JSON body that is not an object is read as `{}`; `decodeClaims` decodes the payload as UTF-8 (`atob` + `TextDecoder`). Found against cognito-local: it answers a wrong password with `InvalidPasswordException` (real Cognito: `NotAuthorizedException`), now also mapped to `invalid_credentials`; it issues 24-hour access tokens without `ExpiresIn`, so the 15-minute expiry is checked only in the cloud (section 7). `frontend/` exists ahead of the front-end architecture, for the services layer only (decision 8 revised; `docs/FOLDER_STRUCTURE.md` section 7). Section 5: the integration test and the tooling as built, including an ESLint guard against Node imports and globals in `frontend/src`. Section 7: the acceptance as run. |
| v3 | 2026-11-05 | Design of `SessionStore` (section 9): the one in-memory holder of the signed-in `Session`, written by `LoginService` on success, read by the API services, cleared at `expiresAt`, on logout and on an API 401. `LoginService` gains the store as a second constructor argument (section 9.4). Sections 4.6 and 4.8 point at it; decisions 9 to 13. Added as section 9 rather than inserted, so that the section numbers cited by the code and by briefs 30 and 31 stay valid. |
| v4 | 2026-11-05 | Design of the remaining services (brief 32, part A). **Correction:** an expired or invalid token is answered by API Gateway with **403** and its own body `{ "message" }`, not 401 (architecture section 4); 401 means the header is missing. The store is cleared on 401 and on a 403 without an `error` field, and left alone on a handler's 403 (`forbidden`, `cannot_delete_admin`) and on API Gateway's 500 (authorizer outage): sections 9.1, 9.3, 9.4, 9.7, decision 12. The store gains `replace(previous, next)` and `clear(only?)`, so that a late answer cannot overwrite or clear a newer session (section 9.2). Rule 6 gains its one exception: the password `POST /users` generates. New sections, appended so that cited numbers stay valid: 10, the shared building blocks (`cognito.ts`, used by `LoginService` and `RefreshService`; `api.ts`, used by `HelloService` and `UsersService`), with the **known gap** that the API has no CORS configuration (10.3); 11, `RefreshService` (cognito-local implements `REFRESH_TOKEN_AUTH`, checked 2026-11-05); 12, `HelloService`; 13, `UsersService`; 14, the integration journeys. Section 4.8 becomes pointers; decisions 14 to 27. **Tokens live only in the `SessionStore`** (rule 9, decision 28): a login success no longer carries the `Session` but `{ username, role, expiresAt }`, like a refresh success; `LoginService` writes the session to the store and emits the token-free outcome (sections 4.3, 4.6, 4.7, 6, 9.4, 9.7, 10.1; decision 4 revised). This changes `LoginService`'s public result, so its success tests change with it. |
| v6 | 2026-11-15 | Implemented (brief 54, plan step 53, from `docs/SHARED_CALENDAR_SPEC.md` v13 section 16). `api.ts` (section 10.2): `ApiRequest` is a union, `GET`/`DELETE` without a body and `POST`/`PUT`/`PATCH` with one; `query` encoded with `URLSearchParams`; `ApiFailure.conflicts` with `availability_conflict` only, well-formed entries kept; three helpers for the services, `invalidRequest` (the first schema issue with its field), `unexpectedAnswer` and `hasString`. New services, appended after section 14 so that cited numbers stay valid: 15 `CalendarSettingsService`, 16 `AvailabilityTypesService`, 17 `AvailabilityRulesService`. `UsersService` gains `listUsers()` (`GET /users`), and `deleteUser` the reason `concurrent_update`, which the API answers since plan step 51 (section 13). The journeys file `frontend/tests/integration/calendar.test.ts` with the throw-away User `fe-calendar` (section 14.2). Error codes per route are architecture section 4's; spec 11.1 differed on routes 9 and 10, and its v14 corrects route 9 (decision 32). The journeys keep the settings they read in a git-ignored file until they are written back, so even a killed run is repaired by the next one (decision 35). Decisions 29–37. The unit tests share one per-method suite, `tests/unit/services/suite.ts` (section 14.1). No change to the existing services' behaviour but `deleteUser`'s new reason; no existing test changed. |
| v5 | 2026-11-05 | Implemented (brief 32, part B); acceptance in section 14.3. What the code fixed that the sketches left open: `api.ts` has two failure builders, `apiFailure(code, …)` for a route's code (and `UsersService`'s check before any request) and `transportFailure(reason, …)` for the five transport reasons, typed `ApiFailure<never>` so that it fits every route (the sketches' `failure<C>`); `toApiAnswer` reads an empty non-2xx body as `{}`, so a 403 without body is also `session_rejected`; `RefreshService` maps Cognito's reasons with a complete `Record<AuthFailureReason, RefreshFailureReason>` (section 11.5 as a table in code). Tests: the store rows "login writes" and "login failure" of section 9.8 live in `login.service.test.ts`, with the service they exercise; the unit tests share `tests/unit/services/fixtures.ts` (unsigned JWTs, `Response` builders, a session factory); RxJS's `timer` schedules with `setInterval`, so tests that fake timers must fake it (the schedule tests fake `setTimeout`, `setInterval` and `Date` only, and flush fetch promises with the real `setImmediate`); a test session must expire within 24.8 days of the clock, or the store's `setTimeout` overflows and fires at once. Section 5 points at section 14.1 for the tree. No design change. |
| v7 | 2026-11-15 | Implemented (brief 56, plan step 54, from `docs/SHARED_CALENDAR_SPEC.md` v15 section 16). New sections, appended: 18 `CalendarService` (`load(from, to)`, `reload()`, route 15) and 19 `AppointmentsService` (`list`, `book`, `cancel`, `change`, `updateNote`, routes 16–20). **The services layer is complete.** `pending` carries every argument under the contract's names (decision 38); `reload()` re-runs the last `load`'s range, answers `invalid_request` before any load, and shares one pending call with `load` (decision 39). Two stream names differ from spec 16.2, which is not edited: `appointmentsResult$` (spec: `listResult$`) and `updateNoteResult$` (spec: `noteResult$`), by decision 31 (decision 40). Success values and their checks (decision 41); validation with the shared schemas only, nothing that depends on the role or on the server's data (decision 42). Error codes of architecture section 4, which agrees with spec 11.1 on routes 15–20 (decision 44). Journeys (section 14.4): the calendar view, booking, note, change, cancel, `upcoming` and `availability_conflict` end to end; a second throw-away User `fe-calendar-b` for the anonymous `busy` (decided with the user); the appointment blocks set the settings for their run and write them back; the Users are removed before the clean-up; the cancelled appointments, their events and the two deleted-user markers stay as history (decision 43). `suite.ts`: `other` is optional, for a service whose methods share one pending call (decision 45); no existing test changed. Acceptance in section 14.6. |
| v8 | 2026-11-21 | **The sign-out**, designed (brief 95, part A), reviewed, then implemented (part B; `docs/FRONTEND_DEPLOY_PLAN.md` step 71); acceptance in section 20.10. New section 20, `LogoutService`: `logout()` puts the page-wide services back to their first state, clears the `SessionStore` at once and only then tells Cognito to revoke the refresh token (`RevokeToken`), with a time limit of 10 seconds; its result says whether Cognito revoked, and why not, and holds no token and no name. `cognito.ts` gains `revokeToken` and `toRevokeOutcome` (section 10.1). `LoginService` and `RefreshService` gain `reset()` (sections 4.4 and 11.4). Rule 9 gains its one exception: the copy of the refresh token that travels in the revocation, for at most 10 seconds after the store is cleared. The row "logout" of section 4.8 is rewritten; the rows of sections 9.4 and 9.7 follow. Found: `RevokeToken` on the wire, from AWS's API reference (section 20.1); cognito-local implements it and then refuses a refresh with the revoked token (checked 2026-11-21), so an integration journey covers it (section 20.9). What the code fixed that the design left open: the table of error types is a `Map`, so that a name every object has (`constructor`) is not taken for a type of the list; the unit tests' "no leak" runs after every test of `logout.service.test.ts` rather than as one test; the journey's `afterAll` signs out every store of the file. No difference from the reviewed design otherwise. Decisions 46 to 58: 46 to 54 are the nine points decided with the user before the design, 55 to 58 are the design's own; on review (2026-11-21) the user confirmed the `reset()` of the `RefreshService` (decision 53), `keepalive` (56) and the names `success`/`failure` (46). |
| v8, note | 2026-11-21 | After the first deployment of the page (`docs/FRONTEND_DEPLOY_PLAN.md` step 72, brief `prompts/96-step-72-implementation.md`): sections 20.1 and 20.9 say what the real Cognito answered at the deployed page (`RevokeToken` from a browser on the page's origin: 200) and what was not tried (a refresh with the revoked token; any refusal). No design and no code changed, so no new version. |
| v8, note 2 | 2026-11-21 | With the page deployed (`docs/FRONTEND_DEPLOY_PLAN.md` step 73, brief `prompts/97-step-73-implementation.md`), the text around it brought into line: section 10.3, **the CORS gap is closed**, and how (one origin; the API has no CORS configuration and needs none; Cognito answers a browser from the page's origin, as seen for the login and for `RevokeToken`); sections 1, 1.1, 4.7, 5 and 9.6 and decisions 11, 27, 54 and 57 no longer speak of a hosting or of a first deployment to come; section 20.1 says where the browser's call to `RevokeToken` is looked at. No design and no code changed, and nothing new was proven, so no new version. |
| v9 | 2026-11-22 | Implemented (brief `prompts/a13-step-c11-implementation.md`, `docs/CONVERSATIONAL_PLAN.md` step c11). New section 21, `AssistantService`: the six routes of the assistant (`load`, `end`, `send`, `continue`, `confirm`, `decline`). **One stream for the six calls**, `outcome$`, each outcome saying the call it answers: the pattern read in a wider sense, which the new section 3.4 allows and rule 4 of section 2 now names (decision 59). A call makes one request: repeating `continue` is the caller's (decision 60). Every code of a route is a reason of that route alone, as a closed list; the daily limit, the spending limit and the outage are three reasons; the service writes no sentence and keeps no conversation (decision 61). The journeys `frontend/tests/integration/assistant.test.ts` (section 14.7) reuse three sentences of the fake Claude's answers under throw-away accounts of their own, and refuse the real Claude (decision 62). **The v7 sentence "the services layer is complete" is corrected**: it was true of the routes the API had then. No existing service, test or helper changed; `suite.ts` is not used by the new tests, which test one stream. Acceptance in section 14.8. |
| v9, note | 2026-11-23 | The branch `deploy-frontend` merged into `main`, where `AssistantService` had been written at the same time. The assistant's version, first numbered v8, is v9, after the sign-out's v8; its section, first 20, is section 21, after the sign-out's 20; its decisions, first 46 to 49, are 59 to 62, after the sign-out's 46 to 58; every reference to them was changed with them. No other text changed. |
| v10 | 2026-11-22 | Implemented (brief `prompts/e03-step-p2-implementation.md`, `docs/CHANGE_PASSWORD_PLAN.md` step p2). New section 22, `ChangePasswordService`: `changePassword(current, next)` with `changePasswordResult$` and `changePasswordState$`, straight at Cognito (`ChangePassword`, then `GlobalSignOut`, then the store cleared), no route of the API. The new password checked before any request with the pool's rule of `shared/src/password.ts`, its problems named in `new_password_refused` (decision 63), the current password given again among them (decision 64); one success whatever the sign-out did (decision 65); the sign-out skipped by a value of the configuration, locally only (decision 67); the store cleared unguarded (decision 68). `cognito.ts` makes one request for any target of Cognito (section 10.1, decision 53), with no change to `LoginService` or `RefreshService` and none to their tests. The journey `frontend/tests/integration/change-password.test.ts` under the account `fe-password` (section 14.9). Acceptance in section 14.10. Written on the branch `change-password` at the same time as the sign-out and the assistant on `main`, and first numbered v9, section 21, decisions 50 to 55; on the merge into `main` (`docs/MERGE_CHANGE_PASSWORD.md`) they became v10, section 22, decisions 63 to 68, every reference changed with them. With the merge `cognitoRequest` also serves `RevokeToken` and takes the sign-out's `init` (decision 58). |
| v11 | 2026-11-23 | `docs/CHANGE_PASSWORD_PLAN.md` step p3 (brief `prompts/e05-step-p3-implementation.md`), decided by the Product Owner at the start of the step. **The order at the end of a change is reversed**: `ChangePasswordService` gives the success on both streams first and clears the store after it (section 22.4, step 6; section 22.6; decision 68 amended; new decision 69). The password screen and the shell hear the success while the person is still signed in: the screen empties its fields, the shell puts the `LoginService` and the `RefreshService` back to their first state, as at a sign-out (decision 53), and words the login's "Password changed"; then the store's `null` brings the login. The service takes no page-wide service: the shell calls the two `reset()`s. The configuration's `skipGlobalSignOut` comes from the bundle's constant `SKIP_GLOBAL_SIGN_OUT` (section 22.2). One test of the service changed with it, its name and two assertions (section 22.8). |
| v12 | 2026-11-24 | `docs/CAPACITY_PLAN.md` step u4 (brief `prompts/e14-step-u4-implementation.md`), from `docs/SHARED_CALENDAR_SPEC.md` v17 (decisions D24 to D31) and the back end as `docs/ARCHITECTURE.md` section 4 describes it. **`AvailabilityTypesService`**: `create(name, capacity?)` and `rename(typeId, name, capacity?)`, the methods keeping their names as the route keeps its path; a `capacity` left out is not sent, so a new type gets 1 and an edited one keeps its own, and today's callers work unchanged; `TypeBody` checks it before sending (0, 101 and 2.5 are `invalid_request`, no request); each `pending` carries the `capacity` given (sections 16.1, 16.3, 16.4, decision 70, decided by the Product Owner). The answer's `capacity` is passed through, not checked (section 16.5). **`AppointmentsService`**: `overbook` in `book` and `change` goes out as the caller gives it, absent staying absent; a User's `true` is the API's `403 forbidden`, already a reason; `user_busy` is a reason of both routes, between `outside_availability` and `slot_taken`, the server's order (sections 19.1, 19.3, 19.4). Unit tests (sections 16.8 and 19.8) and two journeys (section 14.4, blocks "types" and "appointments"). The status line's sentence that this document was not yet in line with the capacity is removed. |

---

## 1. Purpose

The browser front end has two layers (brief `prompts/30-design-first-service-class.md`):

- a **services layer**: plain TypeScript classes that call the remote services and publish the
  results as RxJS observables;
- a **view layer**: whatever renders the UI (chosen since: plain HTML and CSS with one
  TypeScript module script, `docs/FRONTEND_ARCHITECTURE.md`). It
  subscribes to the services' observables and calls their methods. It never calls the network
  itself.

This document fixes the rules of the services layer, the pattern every service follows, and
designs the first service, **login** (sections 1 to 8). The later building blocks are added as
sections of their own, following the same pattern: the session store (9), the shared request
helpers (10), token refresh (11), Hello World (12), and user administration (13); since v6 the
calendar settings (15), the availability types (16) and the availability rules (17); since v7 the
calendar view (18) and the appointments (19), which completed the services layer for the routes the
API had then; since v8 the sign-out (20); since v9 the conversation with the assistant (21), whose
six routes were added to the API afterwards; since v10 the change of one's own password (22), which
calls Cognito and no route.

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
bundled server of image `jagregory/cognito-local:5.3.0`). The real Cognito answers a browser
from the deployed page's address too: seen for the login and for the sign-out's `RevokeToken`
(section 10.3).

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
   section 3.2 for why. "One per remote call" is the usual shape, not a rule without exception:
   several calls that speak of the same thing may share one subject (section 3.4). That the
   subject never dies, and that a failure is a value, hold everywhere.
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

   **The one exception** (v8) is the sign-out. `LogoutService` reads the refresh token from the
   store, clears the store at once and sends the revocation after (section 20.4, decision 47).
   While that request is in flight, for at most 10 seconds, one copy of the refresh token
   exists outside the store: in the request's body and in the variables of that one call, in no
   field, no state and no result. It is dropped when the call ends or is given up.

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

### 3.4 The pattern is a guideline: one stream for several calls (v9)

Sections 3.1 to 3.3 show the usual shape, one subject (or one pair) per remote call. It is a
guideline, and may be read in a wider sense where that makes sense: for instance **one stream
shared by several calls that speak of the same thing**. What may not be given up is section 3.2:
a failure is a value, only `next` is forwarded, and the subject lives as long as the service.

The example is `AssistantService` (section 21), whose six calls notify on the one stream
`outcome$`. It made sense there because the six calls speak of one thing, the person's
conversation: five of them answer the same `AssistantReply`, each reply is the next piece of that
one conversation, and the screen shows one conversation, not six results. With a stream per call
the consumer would have to merge six streams back into the order the answers came in, which is
the order the single stream already has. So that the reasons of a route stay those of that route,
each value of a shared stream says which call it answers (section 21.3).

Where the calls do not speak of one thing (the five methods of `AppointmentsService`, each with a
result of its own that a different part of the screen shows), the usual shape stays the right one.

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

**`reset()` (v8).** The service lives as long as the page, and after a login its two
streams hold the person: `loginState$` and `loginResult$` hold the last outcome, `{ status:
'success', username, role, expiresAt }` (no token: rule 9), or the `pending` with the username
typed. `reset()` puts the service back as it was when it was created. `LogoutService` calls it
at a sign-out (section 20.4, decision 53); nothing else does.

```ts
  // The result stream's buffer of one cannot be emptied, so it is overwritten: `undefined`
  // takes the place of the last outcome and is never passed on.
  private readonly resultSubject = new ReplaySubject<LoginResult | undefined>(1);
  readonly loginResult$: Observable<LoginResult> = this.resultSubject.pipe(
    filter((result): result is LoginResult => result !== undefined),
  );

  // Back to the first state: no attempt in flight, `idle`, and no outcome to replay.
  reset(): void {
    this.pending?.unsubscribe(); // an attempt in flight is aborted and never reports
    this.pending = undefined;
    this.resultSubject.next(undefined);
    this.stateSubject.next({ status: 'idle' });
  }
```

- The subject stays one and never dies (rule 4): a consumer subscribed before the `reset()`
  stays subscribed and receives the next login's outcome; one that subscribes after it waits,
  as before the first login.
- An attempt in flight is cancelled, as a new `login` cancels it (decision 6): after a
  sign-out no late answer signs anybody in.
- `reset()` does not touch the store. With nothing to forget it changes nothing a consumer
  can see, except that `loginState$` notifies `idle` again.

| Event | `loginState$` | `loginResult$` |
|---|---|---|
| `reset()` after a success | `idle` | (nothing; a late subscriber gets nothing) |
| `reset()` while pending | `idle` (the attempt is aborted and never reports) | |
| `login` after a `reset()` | `pending`, then the outcome | the outcome |

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
- Tokens are in memory only. Persistence, if any, is a decision of the front-end architecture
  document, where it is open (`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O3): the
  hosting was decided and deployed without it.
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
| `LogoutService` (v8) | `reset()` on the page-wide `LoginService` and `RefreshService` and `SessionStore.clear()` first; then `RevokeToken` | `Session.refreshToken`, from the store, read at the press. `session$` emits `null` before the request leaves; the result says whether Cognito revoked. The services of one person's session have no `reset()`: the view layer makes new ones for each person (`docs/FRONTEND_ARCHITECTURE.md` section 6, point 4) | 20 |
| `ChangePasswordService` (v10) | `ChangePassword`, then `GlobalSignOut`, at Cognito | `Session.accessToken`, from the store; the shared `passwordProblems` | 22 |

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

`docs/FRONTEND_ARCHITECTURE.md` (the views, the hosting and the deployment) refers to this
document as the truth for the services.

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
| reset after a success (v8) | 200, then `reset()` | `loginState$` gives `idle`; a late subscriber of `loginResult$` receives nothing; no value either stream now gives holds the username; the store is untouched |
| reset while pending (v8) | first fetch pending, `reset()`, then the fetch answers 200 | the request's `signal.aborted` is `true`; no outcome on either stream; the store stays empty |
| reset keeps the subscribers (v8) | subscribe, success, `reset()`, a second login | the subscriber of before receives both outcomes and nothing in between |
| reset before any login (v8) | `reset()` | `idle`; nothing on `loginResult$`; no request |

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
| 11 | Memory only; no `sessionStorage` or `localStorage` in v3 | Rule 7. A reload means signing in again. `sessionStorage` is the candidate if that becomes annoying, decided by the front-end architecture with the hosting and its CSP; `localStorage` is excluded (tokens outlive the tab). The hosting was decided and deployed on 2026-11-21 without it: still open (`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O3). |
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
| 27 | The missing CORS configuration of the API is recorded as a known gap, not fixed | Brief 32, correction 2. It belongs to the front-end architecture (hosting); the tests run in Node, which does not apply CORS (section 10.3). Closed on 2026-11-21 without a change to the API: the page and the API share one origin (section 10.3). |
| 29 | `ApiRequest` is a union: `GET` and `DELETE` take no `body` (`body?: never`), `POST`, `PUT` and `PATCH` may; `query?: Record<string, string>` encoded with `URLSearchParams`, keys in the order given, no `?` when absent or empty | Brief 54, point 1 (spec 16.1). The compiler refuses a body where fetch would refuse it (`GET`) or the API reads none (`DELETE`). `query` is added now for step 54's routes 15 and 16; `api.test.ts` proves it. |
| 30 | `ApiFailure.conflicts` is set only with `availability_conflict` (a route code); the service keeps the entries whose `appointmentId`, `username`, `start`, `end` are strings, copied field by field; a missing or non-array list gives `[]`; the reason stays `availability_conflict` in every case | Brief 54, point 1. The view can always list what it got, and a malformed answer does not turn a known refusal into `unexpected`. Copying the four fields keeps anything else the server might add out of the view (section 17.7). |
| 31 | `pending` carries **every argument of the call under the API contract's names** from `shared/` (`typeId`, `patternId`, `windowId`, `date`, `name`, `windows`); a whole-object argument is named after its object (`settings`, `pattern`, `window`); a load with no argument carries nothing. A load's streams are named after what it loads (`settingsResult$`, `typesResult$`, `patternsResult$`, `listUsersResult$`), every other method's after the method (`updateResult$`, `createResult$`, `renameResult$`, `removeResult$`, `createPatternResult$`, …), each with its `…State$` | Brief 54, point 2; step 54 copies it. Generalises `deleteUserState$`'s `username` (decision 24) so that a view can show what is pending without keeping its own copy. The names follow spec 16.2. |
| 32 | The error codes of each route are architecture section 4's, which governs where it describes a route (architecture v12). Spec 11.1 v13 differed on two routes: route 9 (`PUT /calendar/patterns/{patternId}`) has no `limit_reached` (v13 wrote "as #8"; **spec v14 writes the list out without it**), route 10 (`DELETE /calendar/patterns/{patternId}`) no `availability_overlap` (spec footnote 1: never answered); if either arrived it would be `unexpected`. `forbidden`, `invalid_json` and `internal_error` are normal reasons. `type_not_found` is one reason for its 404 (path) and its 409 (body) | Brief 54, point 4; route 9 found while implementing, corrected in spec v14 on review. Route 10 stays as the spec's footnote explains it; section 16 of the spec is historical for these services once this document has them. One reason per meaning: the view's text is the same for both `type_not_found` statuses. |
| 33 | Validation before sending: each method parses its input with the shared schema (path first, then body, the handler's order) and on failure answers `invalid_request` with no request sent; the `message` is the first zod issue with its field, `end: end must be after start` (path joined with `.`; without a path the message alone), built by `invalidRequest` in `api.ts`; on success the service sends **zod's parsed output** (the trimmed name), not the caller's input. Nothing that only the server knows is checked (`date_in_past`, overlaps, conflicts, limits, unknown types) | Brief 54, point 5 (spec 16.4). As `UsersService` with `Username`: the front end refuses exactly what the API refuses, by construction. Sending the parsed output means the request is the one the schema accepted. `invalidRequest` takes the error's shape, so `frontend/src` still imports no `zod` (no new allowed import). |
| 34 | A success is checked by hand: the expected status (200, 201 or 204), the top-level shape (an object; the array under `types`, `patterns`, `users`) and the object's id (`typeId`, `patternId`, `windowId`, `date`; `timeZone` for the settings; each listed element's id). The rest is trusted to the contract; anything else is `unexpected`. Success values: `{ settings }`, `{ types }`, `{ type }`, `{ patterns }`, `{ pattern }`, `{ override }`, `{ window }`, `{ users }`; a delete carries the id of the call (`typeId`, `patternId`, `date`, `windowId`). No response schemas in `shared/` | Brief 54, point 3. The same depth as `UsersService`: enough to catch a wrong `apiUrl` or route, without a second, hand-kept copy of every response type. `shared/` keeps TypeScript types only for responses. |
| 35 | The calendar journeys (`calendar.test.ts`) never reset the table and never delete or change what they did not create: throw-away User `fe-calendar`; types `fe-calendar …`; dates in a 31-day band from today + 330, each block on a date with no window and no override; a clean-up of windows, overrides and patterns of its types, then its types, before and after; settings written back (also in `afterAll`), and kept until then in `fe-calendar-settings.local.json` (git-ignored) so that the next run writes them back after a killed one; a limit filled by others' data fails with a clear message. `availability_conflict` end to end waits for step 54 | Brief 54, point 6 (plan "How these steps are run": the front-end journeys create only their own items). A free date makes the overlap checks independent of the back-end journeys' patterns. The settings file (added on review of step 53): a run killed during the settings test (no `afterAll`) left the test's values, and nothing in the table says what the earlier values were, so the next run wrote those back (seen in the acceptance, section 14.5). Now the values read are written to the file before the first write and removed after the write-back; `beforeAll` and `afterAll` write back whatever the file holds and remove it. The name matches the repository's `*.local.json` ignore rule. |
| 36 | `CalendarSettingsService` and `AvailabilityTypesService` serve both roles (routes 1 and 3 are both roles'; their writes answer a User `forbidden`); `AvailabilityRulesService` and `UsersService` are the Administrator's (every route admin only), and `listUsers` joins `UsersService` | Brief 54's open questions. One service per resource, not per role: the API is the authority on roles (section 13.6), and a User needs the settings and the type names for the calendar. |
| 37 | `deleteUser` accepts `concurrent_update` | Since plan step 51 the delete cancels the User's appointments under the calendar lock, which can be busy (architecture section 4); without the code the answer was `unexpected`. The view may offer "try again". |
| 38 | `pending` carries every argument of the call under the API contract's names: `load(from, to)` → `{ from, to }`, `reload()` → the `{ from, to }` it reloads, `list(query)` → `{ query }`, `book(booking)` → `{ booking }`, `cancel(appointmentId)` → `{ appointmentId }`, `change(appointmentId, change)` → `{ appointmentId, change }`, `updateNote(appointmentId, note)` → `{ appointmentId, note }`. The arguments as given, not zod's output | Brief 56, design point 1, from decision 31. `cancelState$` and `changeState$` carrying the id is also what spec 16.3 asks. |
| 39 | `reload()` re-runs the last `load` with the `from` and `to` that load was given, whether it succeeded, failed or was refused before sending (then the same refusal comes again). Before any `load` it answers `invalid_request` "nothing loaded yet" with no request, through `idle` → `pending` → failure (decision 23); that `pending` carries nothing, since there is no range: `CalendarState` has both `{ status: 'pending'; from; to }` and `{ status: 'pending' }`. `load` and `reload` share one pair of streams and one pending call: a new call of either cancels the other's | Brief 56, design point 4. The view calls `reload()` after a write (spec 16.3) without keeping the range itself. One pending call, because both fill the same streams: two answers racing into one `calendarResult$` would let an older range land last. The range-less `pending` was not in the brief; it is the only shape that is honest when no range exists. |
| 40 | Stream names follow decision 31, not spec 16.2: `calendarResult$`/`calendarState$` (as the spec); `appointmentsResult$`/`appointmentsState$` for `list` (spec: `listResult$`; a load is named after what it loads); `bookResult$`, `cancelResult$`, `changeResult$` (as the spec); `updateNoteResult$`/`updateNoteState$` for `updateNote` (spec: `noteResult$`; a write is named after its method). The spec is not edited | Brief 56, design point 3, decided with the user. Spec 16 is historical for these services once this document has them (decision 32). |
| 41 | Success values: `{ status: 'success', calendar }`, `{ appointments }`, `{ appointment }` (book, cancel, note), `{ cancelled, booked }` (change). Checked by hand: the status (200; 201 for book and change); the top-level shape (an object; the arrays `days` and `appointments` of the view; the array under `appointments` of the list; both objects of a change); the ids (`timeZone`, `from`, `to` of the view; `appointmentId` of an appointment, of each listed one, of both halves of a change). The rest is trusted to the contract; anything else is `unexpected` | Brief 56, design point 2; decision 34 applied to routes 15–20. The view is the server's answer for the caller's role (spec 11.6): the service does not reshape or re-check it per role. |
| 42 | Validation before sending with the shared schemas only (decision 33): `CalendarQuery`, `AppointmentsQuery`, `BookBody`, `ChangeBody`, `AppointmentIdParam` then `NoteBody` (path first). What is sent is zod's parsed output: `status=booked` added by `AppointmentsQuery`'s default, the trimmed note (a blank note sent as `null`), no absent query key. Not checked, though the session knows the role: a User's whole-hour times and `end`, the Administrator's missing `username` (the API answers `invalid_request`, a route code); nor what only the server knows (notice, horizon, availability, taken slots, limits, ownership, a past start) | Brief 56, design point 5. A role-dependent check in the front end would be a second copy of R-BOOK-01/02 that can drift; the API is the authority on roles (section 13.6). |
| 43 | The appointment journeys: each appointment block sets the settings for its own run in its `beforeAll` (`bookingHorizonDays` 365, `minBookingNoticeHours` 0, `maxFutureAppointmentsPerUser` `null`, `cancellationNoticeHours` as read) and writes the values read back in its `afterAll`, with the settings file of decision 35. A second throw-away User, `fe-calendar-b`, created and removed with `fe-calendar`, is booked only by the Administrator, so that `fe-calendar`'s view has another User's appointment to show as `busy`. Both Users are removed **before** the clean-up of types and availability, in `beforeAll` and in `afterAll`. Appointments cannot be deleted through the API: the cancelled appointments, their events and the two Users' deleted-user markers stay in the local table as history | Brief 56, design point 6 (a User must book about a year ahead, the band of decision 35). `fe-calendar-b`: decided with the user during step 54; `busy` holds only *other* Users' appointments, so one User cannot prove "busy without names". The order: a booked appointment blocks deleting its pattern (`availability_conflict`) and its type (R-TYPE-03), and deleting a User cancels its future appointments first (architecture section 4), so after a failed run only that order clears everything. |
| 44 | The error codes of routes 15–20 are architecture section 4's; they agree with spec 11.1 (checked in step 54, no difference). `concurrent_update` is a normal reason of book, cancel, change and note (spec 16.3). `user_not_found` is one reason for both of its 404s, an unknown target of the Administrator's booking and a deleted User (R-BOOK-10, also on a change). `cancel` has no `invalid_json` (the route reads no body, none is sent); `list` and the view have none either (a `GET`) | Brief 56, "The step". One reason per meaning for the view, as decision 32 did for `type_not_found`. |
| 45 | `describeMethod`'s `other` is optional; without it the cancel test proves only that a second call aborts the first. The suite runs for `reload` on a service whose last range is primed without a request (`Reflect.set` of the private `last`), so its counts start clean | Step 54: `load` and `reload` share one pending call (decision 39), so the suite's "another method stays pending" does not apply to `CalendarService`; the shared-call behaviour has its own tests (section 18.8). The change keeps every existing call of the suite as it was. |
| 46 | **The sign-out is a full service**, `LogoutService`, in the pattern of section 3: `logout()`, `logoutResult$` and `logoutState$`. Its result speaks of the revocation only: `success` means Cognito answered 200, a `failure` says why Cognito did not revoke (`not_signed_in`, `token_rejected`, `not_enabled`, `too_many_attempts`, `timeout`, `network`, `server`, `unexpected`). The person is signed out of the page in every case, so no value says so. No token and no name in a state or a result; `pending` carries nothing | Decided with the user before the design (brief 95, point 1). `success`/`failure` and `idle`/`pending` are the names every other service uses (section 3.3), so a consumer reads this one like the others; what they mean here is said where the types are (section 20.3). The names were put to the user on review against `revoked`/`not_revoked` and kept (2026-11-21). |
| 47 | **Forget first, tell Cognito after.** `logout()` reads the session from the store, clears the store in the same run of the script, and sends the revocation with the refresh token it read. That copy lives in the variables of the one call and in the request's body: no field, no state, no result, nothing a caller can reach; it goes when the call ends or is given up, 10 seconds at most (decision 51). This is rule 9's one exception | Decided with the user (point 2): a slow or dead network never keeps a person signed in. It reverses the order written in `docs/FRONTEND_ARCHITECTURE.md` section 13.7 as its version 14 had it; its version 15 is corrected. The token cannot be read after the store is cleared, and must not stay in the store while Cognito is asked: so one copy, for the length of one request. |
| 48 | **The page owns the `LogoutService`**, like the `LoginService`: one for the page, created at the start-up, not among the objects made and dropped with each person. Nothing cancels a revocation in flight, not the teardown of the person who left, not a later press. Its late answer changes the service's own two streams and nothing of a session | Decided with the user (point 3). The teardown of a person's objects runs because of the sign-out itself; a service torn down there would cancel its own request. |
| 49 | **A renewal under way does not delay the sign-out, and its answer is never used.** `logout()` revokes the refresh token the store held at the press. The `RefreshService`'s call in flight is aborted by its `reset()` (decision 53), and the store's guarded write (section 9.2) would drop its answer in any case; the `null` disarms the renewal's timer. No new refresh token can come out of that renewal: with this app client (no refresh-token rotation) a refresh answers an access and an id token only, and with rotation switched on Cognito refuses `REFRESH_TOKEN_AUTH` altogether (section 20.6, with the source). What may be left at Cognito is an access and an id token that nobody received: valid at the API for their 15 minutes plus the authorizer's 5, the limit of `docs/ARCHITECTURE.md` section 7.3 | Decided with the user (point 4). Waiting for the renewal would let a slow network delay a sign-out, against decision 47. |
| 50 | **The person sees the login, and nothing about the revocation**, whether it worked or not. No view subscribes to `logoutResult$` or `logoutState$`; the failure is there for a developer and for the tests | Decided with the user (point 5). There is nothing the person could do about a failed revocation, and on the page the sign-out has happened. |
| 51 | **The revocation is given up after 10 seconds** (`REVOKE_TIMEOUT_MS = 10_000`), measured from the request to the whole answer read; the request is then aborted and the result is `failure timeout`. **Each `logout()` is a call of its own**: it never cancels an earlier one and never waits for it. The result stream gives every revocation's outcome, in the order they arrive; the state follows the latest call only, so a late outcome of an earlier call does not overwrite it | Decided with the user (point 6: "about 10 seconds"). No other service has a time limit to be in line with: they wait for `fetch`, and a new call or a teardown cancels them, which decision 48 rules out here; so the number is the brief's. A second press straight after the first finds the store empty and answers `not_signed_in` without a request. A second person's sign-out within 10 seconds of the first's sends that person's own token. |
| 52 | **Only "Sign out" revokes.** The expiry, a token the API rejected and a refresh Cognito refused clear the store as before (section 9.4) and send nothing | Decided with the user (point 7). Section 20.6 says for each why the refresh token left at Cognito is acceptable: in short, a session that ends by itself is like a tab that is closed, which no code sees. |
| 53 | **A sign-out puts the page-wide services back to their first state**: `LoginService.reset()` and `RefreshService.reset()`, called by `LogoutService`, which receives them as a list (`readonly Resettable[]`), before it clears the store. The `LogoutService` keeps its own last result until the next sign-out; it names nobody. The services of one person's session need no `reset()` | Decided with the user (point 8) for the `LoginService`. **Extended by the design to the `RefreshService`, and confirmed by the user on review (2026-11-21)**: it is page-wide too, and its success holds the username (section 11.3); without its `reset()` the aim of the decision, nothing of the person left in a service, is not met. Called by the service rather than by the view, so that whoever calls `logout()` gets all of it. Before the store is cleared, so that the login view, mounted when `session$` says `null`, finds `idle` and never the last person's outcome. |
| 54 | **The proof: unit tests, an integration journey, and the cloud at step 72.** cognito-local implements `RevokeToken`, and a refresh with the revoked token is then refused (checked 2026-11-21, section 20.1): so `frontend/tests/integration/logout.service.test.ts`, with its page under `docs/journeys/frontend/` (section 20.9). What only the cloud proves is listed there, with what the first deployment showed (the call from a browser, answered 200) and what it did not try (a refresh with the revoked token) | Decided with the user (point 9), on the branch "cognito-local revokes". |
| 55 | A failure of the revocation never carries Cognito's own `message`: the service writes `Cognito answered <status> <type>`, and names the type only when it is one of the table of section 20.5 | The design's own, for review. AWS's validation errors can quote the value they refuse, and here the only value is the refresh token. Decision 46 says no token in a result; this makes it true whatever Cognito answers. A login keeps Cognito's message as before (section 4.5): there the request's secret is the password, and nothing changes in v8. |
| 56 | The revocation is sent with `keepalive: true` | The design's own, confirmed by the user on review (2026-11-21). A person on a shared computer presses "Sign out" and closes the tab: without it the browser drops a request still in flight, and the refresh token stays valid. With it the browser finishes the request after the page is gone. `fetch`'s standard option, no new import. Not proven by the unit tests beyond the option being set; a browser's behaviour. |
| 57 | Cognito's error types for `RevokeToken` are mapped in a table of their own, `toRevokeOutcome` in `cognito.ts`: the eight of AWS's API reference for the operation, `ThrottlingException` of its common errors, and the two cognito-local answers (`NotAuthorizedException`, `ResourceNotFoundException`). A 200 is a success whatever its body | The design's own. AWS's page lists the types but does not say which one answers a token already revoked, expired or malformed, an unknown client, or revocation switched off (section 20.1): the mapping follows the types' descriptions; no refusal of the real Cognito was provoked at step 72, so none was read. The reasons differ from a login's (decision 15), so one shared table would mislead. |
| 58 | `cognito.ts` builds both requests with one function, `cognitoRequest`; `initiateAuth` keeps its signature. Since v10 the function is exported and serves the four targets, with `init` kept for the revocation's `keepalive` (decision 66) | The design's own. The address, the method, the two headers and the body's reading are the same for both calls (section 10.1); written twice they would drift. Decision 14: extracted, not copied. |
| 59 | **One stream for the conversation.** `AssistantService` has a single public stream, `outcome$` (`ReplaySubject(1)`), and each of its six calls notifies its outcome on it: the reply the server gave, or the reason of the failure, with the call it came from (`call`). No stream per call and no state stream: section 3.4. The rest of the pattern holds: a failure is a value, only `next` is forwarded, the stream lives as long as the service. The stream carries each outcome as the server gave it; putting the added messages together into the whole conversation is the logic layer's work | Decided by the Product Owner, 2026-11-22 (brief `prompts/a13-step-c11-implementation.md`). The six calls speak of one thing, five answer the same `AssistantReply`, and the screen shows one conversation. `docs/CONVERSATIONAL_ARCHITECTURE.md` section 13 said "the result and state streams of the pattern" and was corrected (its v14). |
| 60 | **The caller repeats `continue`, not the service.** A call of the service makes one HTTP request. The loop "while the status is `working`, continue" belongs to the logic layer (`docs/CONVERSATIONAL_PLAN.md` step c12); in the journeys the test repeats the call itself | Decided by the Product Owner, 2026-11-22. One call, one request, as in every other service; the loop has a limit and a line of progress to show, which are the screen's matters (`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 4.4 and 5.1). |
| 61 | **The service tells the cases apart and writes no sentence.** Each code a route answers is a reason of that route, typed as a closed list; a code the contract does not give that route is `unexpected`. `assistant_limit_reached`, `assistant_budget_reached` and `assistant_unavailable` are three reasons, never one. Choosing and showing their sentences, which are in `shared/`, is the screen's work: `frontend/src/logic/texts.ts` is not touched by the service. A message's text is passed on as written, no language is chosen, and nothing is kept beyond the last outcome the stream replays: the conversation is the server's, and after a reload the screen asks for it again | Decided by the Product Owner, 2026-11-22. `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1: the screen says what is true for each of the three, in the conversation's language. |
| 62 | **The assistant's journeys reuse the fake's sentences, under accounts of their own.** They send three sentences `backend/tests/integration/fake-claude/answers.json` already answers; each run creates its throw-away accounts through `UsersService` and deletes them, first and last. A new account has its whole day's count, so the daily limit is never met and no test touches the `assistant` table. Nothing changes in `backend/` or in the fake. The journeys refuse to start unless `backend/env.local.json` wires the fake Claude | Decided by the Product Owner, 2026-11-22, and checked before the journeys were written (section 14.7): the fake chooses by the exact text and never looks at the account; what each sentence fixes is a day and an hour, which the journeys prepare. |
| 63 | **The new password is checked before any request**, with the pool's rule kept once in `shared/src/password.ts` (`passwordProblems`, `Password`); a new password it refuses is `new_password_refused`, with the list of the conditions it misses (closed names, no sentences: `too_short`, `too_long`, `no_uppercase`, `no_lowercase`, `no_digit`, `no_symbol`, `blank`), and nothing is sent. The rule is checked before the session, as `UsersService` checks a username before the store: with nobody signed in and a refused password the answer is `new_password_refused` | Decided by the Product Owner, 2026-11-22 (`docs/CHANGE_PASSWORD_PLAN.md` finding F1). Real Cognito and the emulator answer a refused new password and a wrong current one with the same name in opposite senses (`docs/ARCHITECTURE.md` section 8); never asking Cognito to refuse a new password lets both names be read as a wrong current password. A unit test of the back end holds the rule to `backend/template.yaml` |
| 64 | **A new password equal to the current one is refused**, as the problem `same_as_current` of `new_password_refused`, after the rule's problems. That the two new passwords typed are the same is the screen's check: the service receives the new password once | Decided by the Product Owner, 2026-11-22. Cognito accepts it, since the pool keeps no password history, and a "change" to the same password would sign the person out everywhere for nothing |
| 65 | **One success, whatever the sign-out did.** After Cognito changed the password, a `GlobalSignOut` that is skipped, refused, answers 5xx or never answers gives the same `{ status: 'success' }`, which carries nothing; the store is cleared in every case | Decided by the Product Owner, 2026-11-22. The person reads only "Password changed" (the screen's sentence, `docs/CHANGE_PASSWORD_PLAN.md` step p3). The plan's sentence "a failed sign-out after a successful change is a success that says so" and the same sentence of `docs/ARCHITECTURE.md` section 6.9 were corrected to this |
| 66 | **`cognito.ts` makes one request for any target of Cognito** (`cognitoRequest`, with `readCognitoBody` and `readCognitoError` to read the answer); `initiateAuth` and `toAuthOutcome` are built on them, unchanged in behaviour | `docs/CHANGE_PASSWORD_PLAN.md` step p2. The three calls share the whole request; each service keeps its own mapping, since the same error class means different things to each (decision 15). The tests of `LoginService` and `RefreshService` did not change |
| 67 | **The sign-out everywhere is skipped by the configuration**: `ChangePasswordConfig = { cognitoUrl, skipGlobalSignOut }`, injected through the constructor (rule 3), `true` only against the local stack, whose emulator does not implement `GlobalSignOut` (`docs/ARCHITECTURE.md` section 8). No client id: neither call needs one | `docs/CHANGE_PASSWORD_PLAN.md` finding F2, as `SKIP_GLOBAL_SIGN_OUT` does for the back end's `deleteUser`. A value of the configuration rather than a guess from the URL, so that a unit test runs both ways |
| 68 | **The store is cleared unguarded** (`clear()`, not `clear(session)`), after the sign-out and, since v11, after the success is emitted (decision 69). A call made again abandons the first, as in every service (decision 6): when the first change was already made, its sign-out and its clear are abandoned too, and the screen keeps the button disabled while the state is `pending` so that this cannot happen from the page | A refresh during the change replaces the session object (section 9.2), and a guarded clear would then leave the person signed in after their password changed. The login says "Password changed", the shell's sentence (decision 69) |
| 69 | **The success comes before the store is cleared.** At the end of a change both streams say `success`, the state first, and only then is the store cleared. The service takes no page-wide service: whoever reacts to the success does it while the person is still signed in. The shell puts the `LoginService` and the `RefreshService` back to their first state then, as `LogoutService` does before it clears the store (decision 53), and words the login's "Password changed" (`docs/FRONTEND_ARCHITECTURE.md` section 6) | Decided by the Product Owner, 2026-11-23, at the start of `docs/CHANGE_PASSWORD_PLAN.md` step p3, which reversed the first order of decision 68. With the store cleared first, the person's teardown had ended every subscription of the session before the success arrived: no view and no shell code of the session could hear it, and the `reset()`s would have come after the login was mounted. Without them nothing on screen goes wrong (the login view reads only `loginState$`, whose last value is the person's own success, which shows no text, and a refresh in flight cannot write the store back, `replace` being guarded), but the person's name stays in the two services' last outcome, as decision 53 means to prevent. A change of the service rather than a subscription the shell keeps past the session's end |
| 70 | **The capacity is an optional extra value of the type calls**: `create(name, capacity?)`, `rename(typeId, name, capacity?)`. A `capacity` left out is not sent, and absent from `pending` too; one given goes out as `TypeBody` parses it | Decided by the Product Owner, 2026-11-24, at `docs/CAPACITY_PLAN.md` step u4. The route keeps its path and the body its optional field (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-02, R-TYPE-05), so the methods keep their names; the screens that rename a type keep working unchanged until they offer the capacity, and an edit by name only never resets a capacity to 1 |

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
| `LogoutService` (section 20, v8) | `clear()` | The user signs out: at the press, before Cognito is told |

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

**Only the sign-out tells Cognito** (v8, decision 52). The other writers of `null` (the expiry,
a token the API rejected, a refresh Cognito refused) clear the store and send nothing: section
20.6 says why for each.

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
the hosting and its Content-Security-Policy; it was not taken with them, and is open there
(`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O3). `localStorage` is not a candidate: the tokens would
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
  Since v8 there is one exception, bounded in time: the copy of the refresh token inside the
  sign-out's revocation request, for at most 10 seconds (rule 9; section 20.7).

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
| `cognito.ts` | `LoginService`, `RefreshService`; since v8 `LogoutService`; since v10 `ChangePasswordService` | one request for any target of Cognito, `cognitoRequest`, and the reading of its answer; the `InitiateAuth` request, the error-class mapping, `toSession`; since v8 the `RevokeToken` request and the reading of its answer |
| `api.ts` | `HelloService`, `UsersService` | the authenticated API request: token from the store, bearer header, the 401/403 rule, `ApiErrorBody` → reason |

### 10.1 `cognito.ts`: one request to Cognito, and `InitiateAuth`

**One request for any target** (v10, decision 66). Every call the front end makes to Cognito has
the shape of section 4.1: a `POST` to `cognitoUrl`, `Content-Type: application/x-amz-json-1.1`,
the action in `X-Amz-Target`, a JSON body, no signing and no secret. One function builds it for
the four targets the front end uses; `init` adds what one request needs and the others do not,
the `keepalive` of the revocation (decision 56):

```ts
export type CognitoTarget = 'InitiateAuth' | 'RevokeToken' | 'ChangePassword' | 'GlobalSignOut';

// Emits one { status, text } and completes; errors only when fetch rejects.
export function cognitoRequest(
  config: Pick<CognitoConfig, 'cognitoUrl'>,
  target: CognitoTarget,
  body: Record<string, unknown>,
  init?: RequestInit,
): Observable<{ status: number; text: string }>;

// The parsed body: an object, {} for JSON that is not an object, undefined when not JSON.
export function readCognitoBody(text: string): Record<string, unknown> | undefined;
// The error class without its namespace prefix, and the message when it is a string.
export function readCognitoError(body: Record<string, unknown>): { type: string; message?: string };
```

`initiateAuth` (below) is `cognitoRequest(config, 'InitiateAuth', { AuthFlow, ClientId,
AuthParameters })`, and `toAuthOutcome` reads the answer with the two readers: `LoginService` and
`RefreshService` behave exactly as before, and none of their tests changed. One detail is
stricter: a `message` that is not a string is replaced by `Cognito answered <status>`, as a
missing one always was. `revokeToken` (below) is `cognitoRequest(config, 'RevokeToken', { ClientId,
Token }, { keepalive: true })`, read by `toRevokeOutcome` as before. `ChangePasswordService`
(section 22) uses `cognitoRequest` and the two
readers with a mapping of its own.

**`InitiateAuth`**

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

**`RevokeToken` (v8).** The module gains the second of Cognito's calls the front end
makes, for `LogoutService` (section 20; the call on the wire is section 20.1). The request of
`initiateAuth` becomes one private function, `cognitoRequest`, which both calls use, so the
address, the method, the two headers and the reading of the body are written once.

```ts
// One call to Cognito's JSON API. Emits one { status, text } and completes; errors only when
// fetch rejects. `init` adds to the request what one call needs and the other does not.
function cognitoRequest(
  config: CognitoConfig,
  target: 'InitiateAuth' | 'RevokeToken',
  body: Record<string, unknown>,
  init: RequestInit = {},
): Observable<{ status: number; text: string }> {
  return fromFetch(config.cognitoUrl, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
    selector: (response) => response.text().then((text) => ({ status: response.status, text })),
  });
}

// initiateAuth(config, flow, parameters): unchanged for its callers; it calls cognitoRequest.

// Asks Cognito to revoke a refresh token. The app client has no secret, so the body is the
// client id and the token and nothing else. `keepalive` lets the browser finish the request
// when the page is closed straight after it was sent (decision 56).
export function revokeToken(config: CognitoConfig, refreshToken: string): Observable<{ status: number; text: string }> {
  return cognitoRequest(config, 'RevokeToken', { ClientId: config.clientId, Token: refreshToken }, { keepalive: true });
}

// Why Cognito did not revoke, as far as its answer says (section 20.5).
export type RevokeFailureReason =
  | 'token_rejected'    // UnauthorizedException, UnsupportedTokenTypeException; NotAuthorizedException (cognito-local)
  | 'not_enabled'       // UnsupportedOperationException, OperationNotEnabledException
  | 'too_many_attempts' // TooManyRequestsException, ThrottlingException
  | 'server'            // 5xx, or a failure whose body is not JSON
  | 'unexpected';       // any other __type
export type RevokeOutcome =
  | { status: 'success' }
  | { status: 'failure'; reason: RevokeFailureReason; message: string };

// Reads Cognito's answer to RevokeToken (section 20.5). The message is written here from the
// status and the error's type: Cognito's own message is never copied (decision 55). The types
// it knows are the keys of a Map, so only a type written there is ever found.
export function toRevokeOutcome(status: number, text: string): RevokeOutcome;
```

`toAuthOutcome` and `toSession` do not change. The two mappings stay apart: a login's
`NotAuthorizedException` is a wrong password, and `RevokeToken` has error types that
`InitiateAuth` never answers.

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

### 10.3 The API has no CORS configuration, and needs none

`backend/template.yaml` declares no `CorsConfiguration` on the HTTP API. A browser page served
from another origin than the API's therefore cannot call it: the preflight `OPTIONS` that the
`Authorization` header triggers is not answered with `Access-Control-Allow-*` headers, and the
browser rejects the call, which the services report as `network`.

When the services were designed this was recorded as a known gap and not fixed (decision 27),
with two ways out: the API and the page share one origin, or the HTTP API gets a
`CorsConfiguration` naming the page's origin.

**The gap is closed: one origin** (decided and deployed on 2026-11-21). The page's CloudFront
distribution passes `/api/…` on to the API with the prefix removed, as the dev server does
locally (`docs/FRONTEND_ARCHITECTURE.md` section 13.3). A browser at the page's address
therefore asks no cross-origin question of the API: the API has no CORS configuration and
needs none, and the back end did not change. Nothing in the services changed either: `apiUrl`
is `/api`, at the deployed page as under the dev server. Seen at the deployed page
(`docs/RUNBOOK.md` section 5.5): signed-in calls with `GET`, `POST`, `PUT` and `DELETE`
answered through the page's address.

What still crosses origins is Cognito, which the page calls directly. **Cognito answers a
browser from the page's origin**: seen at the deployed page for the login (`InitiateAuth`) and
for the sign-out's `RevokeToken`, answered 200 (section 20.9). The renewal of a session is the
same operation as the login, with another flow; one made by the deployed page is not yet
looked at (an open item of `docs/RUNBOOK.md` section 5.5). cognito-local answers the preflight
too (section 1.1).

The API still answers no cross-origin request: a page served from any other address than the
distribution's (a dev server that does not pass `/api` on, or the API's own address called
from a browser) meets the gap as before. The unit and integration tests run in Node, which
does not apply CORS.

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
| request, revoke (v8) | one POST to `cognitoUrl` with `Content-Type: application/x-amz-json-1.1`, `X-Amz-Target: AWSCognitoIdentityProviderService.RevokeToken`, `keepalive: true` and the body `{ ClientId, Token }` exactly: no `ClientSecret`, no `Authorization` header, the token in no address |
| request, `InitiateAuth` after the refactoring (v8) | the two rows above unchanged, and no `keepalive` |
| revoke answer 200 (v8) | `{}`, an empty body and a body that is not JSON: each `success` |
| revoke answer, each error type (v8, `it.each`) | every row of the table of section 20.5: its reason, and the message `Cognito answered <status> <type>` |
| revoke answer, namespaced type (v8) | `com.amazonaws…#UnauthorizedException` → `token_rejected` |
| revoke answer, unknown type (v8) | 400 `SomethingElseException` → `unexpected`, the message names the status only; 503 with one → `server`; a `__type` that is the name of something every object has (`constructor`) → `unexpected`, not named |
| revoke answer, not JSON (v8) | 502 HTML → `server`; 400 with JSON that is not an object → `unexpected` |
| revoke answer that quotes the request (v8) | a 400 whose `message`, and one whose `__type`, hold the token: the outcome does not contain the token |
| `cognitoRequest` (v10) | one POST with `AWSCognitoIdentityProviderService.<target>` for each of the four targets and the body as JSON, no `keepalive` unless `init` gives it; no client id needed; what `init` adds is passed on, its own method, headers and body are not |
| `readCognitoBody`, `readCognitoError` (v10) | an object as it is, other JSON as `{}`, a text that is not JSON (`''` included) as `undefined`; the class behind a namespace prefix; a message that is not a string as absent |

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
| `reset()` (v8) | `idle`; a refresh in flight is aborted and never reports | (nothing; a late subscriber gets nothing) | unchanged |

**`reset()` (v8).** Like the `LoginService`, this service lives as long as the page,
and after a renewal its streams hold `{ status: 'success', username, expiresAt }`: the name of
the person who was signed in. `reset()` is the `LoginService`'s (section 4.4), line for line:
it aborts a refresh in flight, overwrites the result stream's buffer with an `undefined` that
is never passed on, and sets the state to `idle`. It leaves the schedule of `start()` alone:
the schedule belongs to the page, and the `null` that follows a sign-out disarms its timer.
`LogoutService` calls it at a sign-out (section 20.4, decision 53).

A refresh in flight must be aborted there, not only left to the store's guarded write
(section 9.2): the guard keeps its late answer out of the store, but that answer would still
write the person's name into the two streams just emptied. With the abort, the answer is
never read. The guard stays, for a refresh that a new login overtakes.

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
| reset after a success (v8) | 200, then `reset()` | `refreshState$` gives `idle`; a late subscriber of `refreshResult$` receives nothing; no value either stream now gives holds the username; the store is untouched |
| reset while pending (v8) | refresh pending, `reset()`, then the fetch answers 200 | the request's signal is aborted; no outcome; the store still holds the session it held |
| reset keeps the schedule (v8) | `start()`, `reset()`, a session expiring in 15 min | one refresh fetch at 14 min |

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
  the service. A sign-out drops it with the service: the view layer makes a new `UsersService` for each person, so no `reset()` is needed here (section 20.6).
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
├── availability-rules.types.ts    # Patterns / CreatePattern / … / DeleteWindow …
├── calendar.service.ts            # CalendarService (18, v7)
├── calendar.types.ts              # CalendarFailureReason, CalendarResult, CalendarState
├── appointments.service.ts        # AppointmentsService (19, v7)
├── appointments.types.ts          # Appointments / Book / Cancel / Change / UpdateNote …
├── logout.service.ts              # LogoutService, LogoutConfig, Resettable (20, v8)
├── logout.types.ts                # LogoutFailureReason, LogoutResult, LogoutState
├── assistant.service.ts           # AssistantService (21, v9)
├── assistant.types.ts             # AssistantCall, AssistantOutcome, the reasons of each call
├── change-password.service.ts     # ChangePasswordService (22, v10)
└── change-password.types.ts       # ChangePasswordConfig, NewPasswordProblem, the reasons, Result, State

frontend/tests/
├── unit/services/        # one file per source file: session.store, cognito, api, jwt,
│                         # login.service, refresh.service, hello.service, users.service,
│                         # calendar-settings.service, availability-types.service,
│                         # availability-rules.service (v6); calendar.service,
│                         # appointments.service (v7); assistant.service (v9);
│                         # change-password.service (v10);
│                         # plus fixtures.ts (v5): JWT, Response and session builders,
│                         # and suite.ts (v6): the per-method suite of the API services
├── unit/integration/     # claude.test.ts (v9): the check of integration/claude.ts, no stack needed
└── integration/
    ├── local.ts           # the local stack's URLs and client id (reads backend/env.local.json);
    │                      # since v6 also `outcome()`, used by calendar.test.ts;
    │                      # since v10 `changePasswordConfig()`, the sign-out skipped
    ├── login.service.test.ts  # the same journeys; tokens read from the store (section 9.9)
    ├── journeys.test.ts   # sections 11.9, 12.9, 13.9, in order
    ├── logout.service.test.ts  # v8: section 20.9, the block `logout`
    ├── calendar.test.ts   # v6: sections 13.9 (listUsers), 15.9, 16.9, 17.9; v7: 18.9, 19.9 (section 14.4)
    ├── claude.ts          # v9: which Claude the stack is wired to; the journeys refuse the real one
    ├── assistant.test.ts  # v9: section 21.9 (section 14.7)
    └── change-password.test.ts  # v10: section 22.9 (section 14.9)
```

`local.ts`, `claude.ts` and `suite.ts` are helpers, not tests (both projects select `*.test.ts` only). Nothing
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
service's own test file. Since v7 `other` is optional: `CalendarService`'s `load` and `reload` share
one pending call, so there is no other method to leave pending, and without `other` the cancel test
checks that the second call aborts the first (decision 45).

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

### 14.4 The calendar journeys (v6, v7)

`frontend/tests/integration/calendar.test.ts` (plan step 53; since v7, plan step 54, also the
calendar view and the appointments). The local `calendar` table is shared with the back end's journeys, which empty
it at their start and leave their data at their end, and with the smoke test (spec 18.2, 18.4).
So this file, unlike the back end's, **never resets the table**, and never deletes or changes what
it did not create (decision 35):

- **Its throw-away Users** are `fe-calendar` and, since v7, `fe-calendar-b`, created and removed
  through `UsersService` as admin, before (accepting `user_not_found`) and after, as `fe-journey` in
  section 14.2. `fe-calendar` signs in and books as a real User; `fe-calendar-b` never signs in: the
  Administrator books for it, so that `fe-calendar` has another User's appointment to see as `busy`
  (decision 43). The journeys book only for these two.
- **Its types** are named `fe-calendar …`. Its patterns, overrides and one-off windows use only
  those types.
- **Its dates** lie in a band of 31 days from today + 330 (today in the calendar's zone, from the
  settings), far from the smoke test's 50–80 days and from the back-end journeys' dates. Each block
  takes a date of the band that has **no window and no override** in the Administrator's view
  (`GET /calendar` through `CalendarService`), so nothing it does not
  own can overlap there. A pattern has `validFrom` = `validUntil` = that date and its weekday.
- **Clean-up**, in `beforeAll` and `afterAll`, in this order: first the two Users (v7: deleting a
  User cancels its future appointments, architecture section 4, `DELETE /users/{username}`; a booked
  appointment would block deleting its pattern with `availability_conflict` and its type by
  R-TYPE-03); then the one-off windows of its types on the band, the band's overrides whose windows
  are all of its types (it never sets an empty override, which it could not tell apart from someone
  else's), the patterns of its types, then its types (R-TYPE-03 needs the references gone first).
  `afterAll` writes the settings back first, then removes the Users, then cleans up. A run that
  failed half-way is repeated without a manual step.
- **Settings for booking** (v7, decision 43): each appointment block (`calendar view`,
  `appointments`, `availability conflict`) reads the settings in its `beforeAll`, keeps them in the
  settings file below, and sets `bookingHorizonDays` 365, `minBookingNoticeHours` 0 and
  `maxFutureAppointmentsPerUser` `null` (`cancellationNoticeHours` keeps the value read: the body
  needs all four, and at most 720 hours cannot block a cancel 330 days ahead); its `afterAll` writes
  the values read back. Each block's test makes its own type and a pattern 08:00–12:00 local on a
  free date, books, and cancels and removes everything at its end.
- **What stays behind** (v7): appointments cannot be deleted through the API. The cancelled
  appointments (`cancelled`, `changed`, and `user_deleted` after a failed run), their events and the
  deleted-user markers of `fe-calendar` and `fe-calendar-b` stay in the local table as history, as
  the smoke test's do. Nothing booked, no type, pattern, override or window of the journeys stays.
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
| | create `fe-calendar Pool` with a capacity of 2; edit its name only; load as `fe-calendar`; remove (v12) | `success` with `capacity: 2`; `success`, the new name and still `capacity: 2` (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-02); the User's list has the capacity 2; `success` |
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
| calendar view (v7) | admin books 08:00 for `fe-calendar` and 10:00 for `fe-calendar-b` (with a note); admin loads the week; `fe-calendar` loads it; admin cancels `fe-calendar-b`'s; `fe-calendar` reloads | admin: 7 days, the window with `source` `pattern` and its `patternId`, `hasOverride: false`, `busy: []`, both appointments with their usernames and `cancellableUntil: null`. User: the window without `source`/`sourceId`, no `hasOverride`, slots 09:00 and 11:00, `busy` one bare `{ start, end }` at 10:00, only its own appointment (with `cancellableUntil`), and nowhere `fe-calendar-b`, its appointment id or its note. After the reload: `busy: []`, slots 09:00, 10:00, 11:00 |
| | load 32 days; `reload()` on a new service | `invalid_request`, `to: the range spans more than 31 days`; `invalid_request`, `nothing loaded yet`; no request sent |
| appointments (v7) | `fe-calendar` books 08:00; admin books 08:00 for `fe-calendar-b`; admin books 10:00–10:30 for `fe-calendar`; `fe-calendar` sets the note `  Bring shoes  `, changes to 09:00, changes the old one again; `upcoming` as the User and as admin with `username=fe-calendar`; the date with `status=all`; `fe-calendar` cancels, cancels again; admin cancels the other | `success` (`createdBy` the User, `cancellableUntil` set); `slot_taken`; `success` (custom end, `createdBy` admin); `success`, note trimmed; `success`, `cancelled` with `cancelReason: changed` and `replacedBy`, `booked` with `replaces` and the note kept; `appointment_not_active`; both lists the two booked ones (the User's with `cancellableUntil`, the admin's with `null`); old cancelled, two booked; `success` `cancelled` by the User; `appointment_not_active`; `upcoming` empty on that date |
| | on a type of capacity 1 (v12): `fe-calendar` books 08:00, books 08:00 again, books 09:00 with `overbook: true`, lists the date; admin books 08:00 for `fe-calendar-b`, then the same with `overbook: true`; both cancelled, the pattern and the type removed | `success`; `user_busy` (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12); `forbidden` (R-BOOK-13); only the first appointment booked on the date; `slot_taken`; `success`, `fe-calendar-b`'s 08:00–09:00 `booked` |
| | `fe-calendar` books at 08:15 | `invalid_request` from the API: one request sent (decision 42) |
| | `fe-calendar` lists with `username=fe-calendar-b`; cancels an unknown ULID; sets a 501-character note | `forbidden`; `appointment_not_found`; `invalid_request`, `note: at most 500 characters`, no request sent |
| availability conflict (v7) | `fe-calendar` books 08:00; admin sets an override with only 10:00–12:00; admin deletes the pattern; then `fe-calendar` cancels and the pattern and type are removed | `availability_conflict` with `conflicts: [{ appointmentId, username: 'fe-calendar', start, end }]`, twice; the date still has no override; the removals succeed (a cancelled appointment blocks nothing) |

`availability_conflict` end to end (v7): the block "availability conflict" above, with the booked
appointment that `AppointmentsService` makes; the unit tests prove the mapping and `conflicts`
(sections 10.4 and 17.8).

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

### 14.6 Acceptance check (v7, plan step 54)

1. `npm run verify -w frontend` green with 100 % line coverage on `frontend/src`.
2. `RUN_INTEGRATION=1 npm run test:integration -w frontend` green twice in a row, and again after
   `RUN_INTEGRATION=1 DYNAMODB_PORT=8002 npm run test:integration -w backend` (never at the same
   time); after the runs the calendar holds nothing of the journeys but the history of section
   14.4, and the settings are as before.
3. A run that fails in the middle of an appointment block, with the settings changed and an
   appointment booked, then a normal run that passes.
4. The root `DYNAMODB_PORT=8002 npm run verify` green; no diff in `backend/` or `shared/`.

**As run (2026-11-15, v7):**

1. `npm run verify -w frontend`: typecheck, lint, 639 unit tests in 13 files (450 before; none of
   them changed, `suite.ts` gained the optional `other` of decision 45), 100 % lines (branches
   99.65 %: the one of v5, in `cognito.ts`).
2. Integration (`calendar.test.ts`: 27 tests; with the two v5 files 46): green twice in a row, then
   green after the back end's 90 journeys. A read-only snapshot through the API as admin (settings
   without `updatedAt`, type names, pattern ids, the band's windows and overrides, `GET /users`, the
   booked `upcoming` appointments of `fe-calendar` and `fe-calendar-b`) was identical before and
   after each time. A read-only scan of DynamoDB Local after the run that followed the back end's
   journeys: items naming the journeys' Users were 6 cancelled `APPT`, their 12 events (5 booked, 5
   cancelled, 1 changed, 1 note updated) and the 2 deleted-user markers; no type, pattern, override
   or window.
3. Forced failures, each from a temporary untracked copy of the file in
   `frontend/tests/integration/` (so that it shares the settings file), removed after the run;
   the committed test was never edited. **Thrown** right after the `slot_taken` check of the
   "appointments" block (settings at 48 / 0 / 365 / `null`, one appointment booked): `afterAll` wrote
   the settings back, removed both Users (the appointment cancelled `user_deleted`) and cleaned
   up; the next normal run passed, snapshot identical. **Killed** (`SIGKILL` of the test worker at
   the same point, so no `afterAll`): it left the settings at 48 / 0 / 365 / `null`, the settings
   file, the type `fe-calendar Appointments`, its pattern, both Users and a booked appointment; the
   next normal run wrote the file's values back, removed the Users (cancelling the appointment),
   the pattern and the type, and passed; snapshot identical. The first run of the new file also
   failed in that block, unforced (a check that the next fix narrowed to the test's own ids): it
   left nothing either.
4. Root `DYNAMODB_PORT=8002 npm run verify`: PASSED (back end 1087 unit + 90 integration, `shared`
   377, front end 639); `git status` shows no change in `backend/` or `shared/`.

### 14.7 The assistant's journeys (v9)

`frontend/tests/integration/assistant.test.ts` (`docs/CONVERSATIONAL_PLAN.md` step c11): three
blocks, each with its page under `docs/journeys/frontend/`. They run `AssistantService` against the
local API with **the fake Claude** of the Docker stack answering for Anthropic
(`docs/ARCHITECTURE.md` section 8), and read the calendar back through `CalendarService` and
`AppointmentsService`.

- **They refuse the real Claude** (decision 62). The file's `beforeAll` calls `refuseRealClaude()`
  of `frontend/tests/integration/claude.ts` before any request: it reads `Parameters` of
  `backend/env.local.json` and throws unless `ANTHROPIC_BASE_URL` is the fake's address and
  `ANTHROPIC_API_KEY` the fake's placeholder, with a message that says what to run and holds
  neither value. The pure part, `claudeWiringProblem(parameters)`, has a unit test,
  `frontend/tests/unit/integration/claude.test.ts`, which runs in `npm run verify -w frontend`
  with no stack: the refusal is shown there, never by wiring the real Claude. The file read is
  what `local:api` was started with only if it was restarted after the last `local:up`, as for
  the back end's check (`docs/COMMANDS.md` section 4).
- **The sentences are the back end's** (decision 62). The fake answers a message by its exact
  text, from `backend/tests/integration/fake-claude/answers.json`, and never looks at who asks.
  The three sentences sent, and what each fixes:

  | Sentence | What the fake asks for | What the block prepares |
  |---|---|---|
  | `fake: what is open on the day of the journey?` | `get_calendar` for the 25th day from today, then a text that is the tool's result word for word | a window on that day |
  | `fake: book me the slot of the booking journey` | `book_appointment` on the 26th day at 05:00, then the same kind of text | a free slot at 05:00 on that day |
  | `fake: book me the slot of the declining journey` | `book_appointment` on the 27th day at 05:00 | a free slot at 05:00 on that day |

  "Today" is the date in the calendar's zone, which the fake reads from the line the server
  writes; the journeys work it out from the settings' `timeZone` with `localDateOf`. None of the
  sentences is in the fake's list for the language question, so each conversation is English.
  A User books 26 and 27 days ahead: the settings must allow it (the default horizon is 56 days,
  and the back end's journeys of the same sentences rely on the same). The journeys change no
  setting.
- **Their accounts** are `fe-assistant-read`, `fe-assistant-book` and `fe-assistant-decline`,
  one per block, created through `UsersService` as admin and removed before (accepting
  `user_not_found`) and after. A new account has a new `sub`: no conversation, and all of the
  day's messages (10 on the local stack), of which a block sends one or two. The daily limit is
  never met, and nothing reads or writes the `assistant` table but the routes.
- **Their types** are `fe-assistant reading`, `fe-assistant booking` and `fe-assistant
  declining`. Each block opens, as the Administrator, one extra window 05:00–07:00 of its type on
  its day, through `AvailabilityRulesService`. Those are the hours the back end's assistant
  journeys open on the same three days and remove at their end. When hours of somebody else lie
  there (a back-end run interrupted before its clean-up, hours opened by hand), opening the window
  fails with `availability_overlap` and the block stops in its `beforeAll`, with that reason: the
  sentence fixes the day and the hour, so the block cannot move. The repair is a run of the back
  end's journeys, or a fresh stack.
- **The `calendar` table is never emptied**, and nothing the file did not create is changed or
  deleted. Clean-up, in each block's `beforeAll` and `afterAll`: first the User (deleting a User
  cancels its future appointments, which would keep the window from being deleted), then the
  extra windows of the block's type from today to 28 days ahead (so that what a run of an earlier
  day left is found), then the type. A run that failed half-way is repeated without a manual step.
- **What stays behind**: the appointment of the booking block, cancelled `user_deleted`, with its
  events, and the three deleted-user markers of each run, in `calendar`; the conversations and the
  day's count of accounts that no longer exist, in `assistant`, which nobody reads (DynamoDB
  Local may never act on their time to live). No type, no window, nothing booked.
- **The journey repeats `continue`** (decision 60): the helper `untilTheExchangeEnds` calls it
  while the reply says `working`, at most `ASSISTANT_LIMITS.modelRequestsPerMessage` times.

| Block | Journey | Expect |
|---|---|---|
| a reading driven by continue | `load` with no conversation; `send` the sentence with spaces around it; `send` again; `load`, then `continue` while `working`; `load`; `continue`; `end`, `load` | the empty reply with the day's count; one request, `working`, the line "Looking at the calendar…", the trimmed text as the one message, the count one less; `assistant_busy`; one `continue` gives `idle` and the assistant's text, which holds the block's window 05:00–07:00 by the type's name, the free slots 05:00 and 06:00 and no id of the type; both messages in order; `nothing_to_continue`; `{ call: 'end', status: 'success' }`, the empty reply, the count kept |
| a booking confirmed | `send`; `confirm` and `decline` with `not-an-id`; `confirm` with an unknown ULID; `confirm` with the proposal's id (and `continue` while `working`); `AppointmentsService.list` and `CalendarService.load` as the User; `confirm` and `decline` again; `load` | `awaiting_confirmation` with the proposal in the server's words (the summary built with `assistantTexts('en')`), nothing booked; `invalid_request` `proposalId: expected a ULID`, no request sent; `proposal_not_found`, the proposal still waiting; `idle`, the proposal with outcome `done`, one text of the assistant; one appointment 05:00–06:00 of the block's type, booked by the User, and the day's free slots of that type only 06:00; `proposal_not_found` twice, still one appointment; the settled proposal still shown |
| a proposal declined | `send`, then the day read through `CalendarService`; `decline`; the day and the list read again; `confirm` and `decline` again; `load` | a proposal waits; `idle`, the notice "Nothing was changed.", `proposal` `null`, the day's count unchanged; the day equal to the one read before but for `generatedAt`, no appointment; `proposal_not_found` twice; the request and the notice, nothing to confirm |

### 14.8 Acceptance check (v9, `docs/CONVERSATIONAL_PLAN.md` step c11)

1. `npm run verify -w frontend` green with 100 % line coverage on `frontend/src`.
2. `RUN_INTEGRATION=1 npm run test:integration -w frontend` green against the fake Claude, twice
   in a row; the journeys refuse the real Claude, shown by the unit test of the check.
3. The root `DYNAMODB_PORT=8002 npm run verify` green; no diff in `backend/` or `shared/`.

**As run (2026-11-22, v9):**

1. `npm run verify -w frontend`: typecheck, lint, 2 234 tests in 42 files of the `unit` and
   `views` projects (2 067 before, none of them changed; 160 new in `assistant.service.test.ts`
   and 7 in `claude.test.ts`), 100 % lines (2 133 of 2 133).
2. Integration, against the fake Claude: 65 tests in 4 files (`assistant.test.ts`: 19; the three
   earlier files 46), green twice in a row, and a third time after the root gate, on the
   calendar the back end's journeys had left. A read-only look through the API after the runs
   found no type named `fe-assistant …` and no account named `fe-assistant-…`. The refusal of
   the real Claude: the seven cases of `claude.test.ts`, in item 1; the real Claude was never
   wired.
3. Root `DYNAMODB_PORT=8002 npm run verify`: PASSED (back end 1 735 unit tests and 189 journeys,
   audit clean; `shared` 437; front end 2 234); `git status` shows no change in `backend/` or
   `shared/`. Sentences of the documents and of the journey pages were corrected after that run
   (the points of the pages' check); the root `npm run typecheck` and `npm run lint` were green
   after them.


### 14.9 The change of password journey (v10)

`frontend/tests/integration/change-password.test.ts` (`docs/CHANGE_PASSWORD_PLAN.md` step p2), one
`describe`, `change password`, with its page `docs/journeys/frontend/change-password.md`. It runs
`ChangePasswordService` straight at cognito-local, as the page will, with the local configuration
of `local.ts`, `changePasswordConfig()`: the sign-out everywhere skipped (decision 67).

- **Its account** is `fe-password`, created through `UsersService` as the Administrator in
  `beforeAll` (after removing it, accepting `user_not_found`) and removed in `afterAll`, so that a
  run that failed half-way, with the account left at another password, is repeated without a step
  by hand. `admin` only creates and removes it; neither `admin` nor `alice` changes a password.
- **What stays behind**: nothing in Cognito; in the `calendar` table the deleted-user marker of
  `fe-password` of each run, as for every account deleted (`docs/ARCHITECTURE.md` section 4,
  `DELETE /users/{username}`). The calendar table is never read or emptied.

| # | Journey | Expect |
|---|---|---|
| 1 | `changePassword` with a wrong current password; the store; a sign-in with the old password | `wrong_current_password` (the emulator's `InvalidPasswordException`); the session still in the store; `success` |
| 2 | a new password the rule refuses, then the current one again (a `fetch` spy counts requests) | `new_password_refused` with `too_short`, `no_uppercase`, `no_digit`, `no_symbol`; then with `same_as_current`; no request sent; the session still in the store |
| 3 | `changePassword` with the current password and a good new one | `{ status: 'success' }`; `session$` gives `null` |
| 4 | a sign-in with the old password | `invalid_credentials` |
| 5 | a sign-in with the new password; `admin` signs in with its local password | `success` as `fe-password`, `role: 'user'`, the session in the store; `admin` `success`, its password unchanged |

### 14.10 Acceptance check (v10, `docs/CHANGE_PASSWORD_PLAN.md` step p2)

1. The root `DYNAMODB_PORT=8002 npm run verify` green, with `local:up` and `local:api` running:
   typecheck, lint, unit tests with 100 % lines on `shared/src` and `frontend/src`.
2. `RUN_INTEGRATION=1 npm run test:integration -w frontend`, the new journey with the others,
   green twice in a row; no account `fe-password` left in the local pool.
3. The back end's unit tests that hold the shared rule to `backend/template.yaml` and the password
   generator to the rule exist and pass.
4. `git status` shows no change under `backend/src` or in `backend/template.yaml`.

**As run (2026-11-22, v9):**

1. Root `DYNAMODB_PORT=8002 npm run verify`: PASSED (back end 1 737 unit tests, 1 735 before,
   and 189 journeys, audit clean; `shared` 489, 437 before; front end 2 282 tests in 43 files,
   2 234 before, of which 42 in `change-password.service.test.ts` and 6 new in
   `cognito.test.ts`; no existing test changed), 100 % lines on `frontend/src` (2 173 of 2 173)
   and `shared/src`.
2. `RUN_INTEGRATION=1 npm run test:integration -w frontend`: 70 tests in 5 files (the new
   journey's 5 with the 65 before), green twice in a row; afterwards the local pool held
   `admin` and `alice` only.
3. `backend/tests/unit/lib/password.test.ts`: the pool's policy and 2 000 generated passwords
   held to the shared rule, both green.
4. `git status`: no change under `backend/src` or in `backend/template.yaml`.

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
| `create(name, capacity?)` | `POST /calendar/types`, `{ name, capacity? }`; admin | `201` `AvailabilityType` | 400 `invalid_json` / `invalid_request`, 403 `forbidden`, 409 `type_name_exists`, `limit_reached`, `concurrent_update`, 500 |
| `rename(typeId, name, capacity?)` | `PUT /calendar/types/{typeId}`, `{ name, capacity? }`; admin | `200` `AvailabilityType` | 400 `invalid_json` / `invalid_request`, 403 `forbidden`, 404 `type_not_found`, 409 `type_name_exists`, `concurrent_update`, 500 |
| `remove(typeId)` | `DELETE /calendar/types/{typeId}`, no body; admin | `204` | 400 `invalid_request`, 403 `forbidden`, 404 `type_not_found`, 409 `type_in_use`, `concurrent_update`, 500 |

A User reads the types through this service too (route 3 is both roles'; decision 36): the view
needs their names for the calendar's legend. The three writes are the Administrator's; a User gets
`forbidden`. `rename` is the edit of a type: its name, and its capacity when one is given. A
`capacity` left out is not sent: at creation the server gives 1, at an edit it keeps the stored
one (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-02 and R-TYPE-05; decision 70). Every
`AvailabilityType` answered carries its `capacity`.

### 16.2 Configuration

As section 15.2.

### 16.3 Types (`availability-types.types.ts`)

One `…FailureReason`, `…Result` and `…State` per method, as in section 15.3: `TypesResult`
(`{ status: 'success', types }`), `CreateTypeResult` and `RenameTypeResult` (`{ …, type }`),
`RemoveTypeResult` (`{ …, typeId }`, the id of the call). `pending`: nothing, `{ name, capacity? }`,
`{ typeId, name, capacity? }`, `{ typeId }`, the `capacity` only when one was given. `type_not_found` is one reason for its 404 (a path id) and its
409 (a body id, route 8 and later): the view says "this type no longer exists" in both cases
(decision 32).

### 16.4 The class

Four pairs, `typesResult$` / `typesState$`, `createResult$` / `createState$`, `renameResult$` /
`renameState$`, `removeResult$` / `removeState$`, each cancelling only its own pending call.
Validation before sending (decision 33): `create` parses `{ name }`, with `capacity` when given,
with `TypeBody` and sends the parsed output, so `'  Studio  '` goes out as `'Studio'` while
`pending` keeps the argument as given; a capacity that is not an integer from 1 to 100 is
`invalid_request` (`capacity: Too small: expected number to be >=1`, `… Too big …`, `… expected
int …`); `rename` parses `TypeIdParam` first, then `TypeBody` with the same capacity (the handler's
order: path, then body); `remove` parses `TypeIdParam`. A failure answers `invalid_request` (`name: 1 to 40
characters`, `typeId: expected a ULID`), with no request sent. The id goes into the path through
`encodeURIComponent`. The service does not check the name's uniqueness or the limit of 20: only the
server knows the stored types. The answer's `capacity` is passed through as the rest of the type
(section 16.5).

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
case), and for `rename` with both wrong the path's message; a capacity of 0, 101 and 2.5 for both
`create` and `rename`. The capacity apart: sent when given (3, and the bounds 1 and 100), with
`pending` carrying it and the answer's `capacity` passed through; left out of the body and of
`pending` when not given, for both methods. Wrong answers: a missing or
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

---

## 18. `CalendarService` (v7)

### 18.1 The remote call

| Call | Request | Success | Errors (architecture section 4) |
|---|---|---|---|
| `load(from, to)` | `GET /calendar?from=…&to=…`, no body; **both roles** | `200` `CalendarView` | 400 `invalid_request`, 403 `forbidden` (neither group), 500 `internal_error` |
| `reload()` | the same request with the last `load`'s `from` and `to` | the same | the same; before any `load`, `invalid_request` without a request |

`from` and `to` are local dates, inclusive, at most 31 days (spec 11.2). The view is built by the
server for the caller's role (spec 11.6): the Administrator's windows carry `source` and `sourceId`
and each day `hasOverride`, its `appointments` are everyone's with names and `busy` is `[]`; a
User's windows carry neither, its `appointments` are its own (with `cancellableUntil`) and `busy`
holds the others' as bare intervals. The service passes the view on as received.

### 18.2 Configuration

As section 15.2.

### 18.3 Types (`calendar.types.ts`)

```ts
type CalendarCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'internal_error'>;
export type CalendarFailureReason = CalendarCode | TransportFailureReason;
export type CalendarResult = { status: 'success'; calendar: CalendarView } | ApiFailure<CalendarCode>;
export type CalendarState =
  | { status: 'idle' }
  | { status: 'pending'; from: string; to: string }
  | { status: 'pending' } // reload() before any load: no range (decision 39)
  | CalendarResult;
```

### 18.4 The class

One pair, `calendarResult$` / `calendarState$`, for both methods (decision 40), and one pending
call: a new `load` or `reload` cancels the pending one of either (decision 39).

- `load(from, to)` remembers `{ from, to }` as given, then parses `{ from, to }` with the shared
  `CalendarQuery` (decision 42). On failure it answers `invalid_request` with the field
  (`to: from must not be after to`, `to: the range spans more than 31 days`, `from: not a real
  date`), with no request sent; on success it sends the parsed `from` and `to` as the query.
  `pending` carries `{ from, to }`.
- `reload()` runs the remembered range again, whatever the last load's outcome (decision 39); its
  `pending` carries that range. Before any `load`: `pending` without a range, then
  `invalid_request` `nothing loaded yet`, no request.

The service does not check what the view depends on (the role, the calendar's "today"); nor does
it refresh itself after a write: the view calls `reload()` (spec 16.3).

### 18.5 Mapping the answer

| Answer | Result |
|---|---|
| the range fails `CalendarQuery`; or `reload()` before any `load` | `invalid_request`, no request |
| `200` with an object whose `timeZone`, `from`, `to` are strings and whose `days` and `appointments` are arrays | `success`, `calendar` |
| any other 2xx | `unexpected` |
| an `error` code of the route | that code |
| everything else | section 10.2 |

### 18.6 Use from the view layer

```ts
const calendar = new CalendarService({ apiUrl }, store);
calendar.calendarState$.subscribe((s) => {
  spinner.hidden = s.status !== 'pending';
  if (s.status === 'success') week.render(s.calendar); // times in s.calendar.timeZone (spec 16.8)
});
calendar.load(monday, sunday);
appointments.bookResult$.subscribe((r) => { if (r.status === 'success') calendar.reload(); });
```

A week is seven dates (`from` a Monday, `to` + 6, with `addDays` from `shared/`). After a write
that failed with `network` or `server`, the view reloads too: the server may have applied it
(spec 16.3).

### 18.7 Security notes

A User's view carries the User's own notes and appointment ids, and other Users' appointments only
as anonymous `busy` intervals (spec 17); the Administrator's carries everyone's usernames and notes,
personal data: never logged (rule 6, spec 16.5). The token rules are those of section 10.2.

### 18.8 Unit tests (`calendar.service.test.ts`)

The per-method suite of section 14.1 for `load` and for `reload`, without `other` (decision 45):
`load` with `GET /calendar?from=…&to=…`, its three codes, `invalid_json` and `concurrent_update`
→ `unexpected`, wrong answers (a 201, `timeZone`, `from` or `to` missing or not a string, `days` or
`appointments` missing or not an array, an empty 200), invalid ranges (from after to, 32 days,
`2027-02-29`, `to` missing); `reload` on a service primed with that range. Then: `reload()` before
any `load` (pending without a range, `invalid_request`, no fetch); after a successful load, after a
failed load and after a load refused before sending (the same range, or the same refusal); the
newest load's range wins; a `load` cancels a pending `reload` and a `reload` a pending `load`, one
result each.

### 18.9 Integration checks

Section 14.4, block "calendar view".

---

## 19. `AppointmentsService` (v7)

### 19.1 The remote calls

Both roles; `cancel`, `change` and `updateNote` act on the caller's own appointment, or on any for
the Administrator (someone else's is `appointment_not_found`, spec R-PERM-01). Codes from
architecture section 4, which agrees with spec 11.1 on these routes (decision 44).

| Call | Request | Success | Errors besides 403 `forbidden`, 500 `internal_error` |
|---|---|---|---|
| `list(query)` | `GET /calendar/appointments?…`, `AppointmentsQuery` | `200` `{ appointments: Appointment[] }` by start | 400 `invalid_request` · 403 `forbidden` also for a User naming another `username` |
| `book(booking)` | `POST /calendar/appointments`, `BookBody` | `201` `Appointment` | 400 `invalid_json` / `invalid_request` · 403 `forbidden` also for a User's `overbook: true` · 404 `user_not_found` · 409 `target_not_user`, `booking_in_past`, `booking_notice_too_short`, `booking_beyond_horizon`, `outside_availability`, `user_busy`, `slot_taken`, `appointment_limit_reached`, `concurrent_update` |
| `cancel(appointmentId)` | `POST /calendar/appointments/{appointmentId}/cancel`, no body | `200` `Appointment` (cancelled) | 400 `invalid_request` · 403 `cancellation_notice_too_short` · 404 `appointment_not_found` · 409 `appointment_not_active`, `concurrent_update` |
| `change(appointmentId, change)` | `POST /calendar/appointments/{appointmentId}/change`, `ChangeBody` | `201` `{ cancelled, booked }` | 400 `invalid_json` / `invalid_request` · 403 `cancellation_notice_too_short` · 404 `appointment_not_found`, `user_not_found` · 409 `appointment_not_active`, the seven booking codes of `book`, `concurrent_update` · 403 `forbidden` also for a User's `overbook: true` |
| `updateNote(appointmentId, note)` | `PATCH /calendar/appointments/{appointmentId}`, `{ note }` | `200` `Appointment` | 400 `invalid_json` / `invalid_request` · 404 `appointment_not_found` · 409 `appointment_not_active`, `concurrent_update` |

`user_not_found` is one reason for both of its 404s: an unknown target of the Administrator's
booking, and a User deleted meanwhile (R-BOOK-10, on `book` and `change`). `user_busy` is the
target User already holding an appointment that overlaps the time asked, checked before the places
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12); `slot_taken` is no place left
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-07). `overbook: true` in `BookBody` or `ChangeBody` is the
Administrator's force over the capacity, which lifts `slot_taken` and nothing else
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-13). `concurrent_update` is a
normal reason: the view may offer "try again" (spec 16.3).

### 19.2 Configuration

As section 15.2.

### 19.3 Types (`appointments.types.ts`)

One `…FailureReason`, `…Result` and `…State` per method. Success values (decision 41): `{
appointments }`, `{ appointment }` (book, cancel, note), `{ cancelled, booked }` (change). `pending`
(decision 38): `{ query }`, `{ booking }`, `{ appointmentId }`, `{ appointmentId, change }`, `{
appointmentId, note }`, the arguments as given. `list` takes an `AppointmentsQueryInput`, the
shared `AppointmentsQuery` with `status` optional (the schema's default fills it).

### 19.4 The class

Five pairs (decision 40): `appointmentsResult$` / `appointmentsState$` for `list`, `bookResult$` /
`bookState$`, `cancelResult$` / `cancelState$`, `changeResult$` / `changeState$`,
`updateNoteResult$` / `updateNoteState$`, each cancelling only its own pending call. Validation
before sending (decision 42), path first, then body:

| Method | Schemas | Sent |
|---|---|---|
| `list` | `AppointmentsQuery` | the parsed query without absent keys, in the schema's order: `status=booked` when the caller left it out |
| `book` | `BookBody` | the parsed body (the note trimmed, a blank one `null`; `overbook` as given, absent staying absent) |
| `cancel` | `AppointmentIdParam` | no body |
| `change` | `AppointmentIdParam`, then `ChangeBody` | the parsed body; no `note` key keeps the old note, `null` clears it (R-CHG-03); `overbook` as in `book` |
| `updateNote` | `AppointmentIdParam`, then `NoteBody` | `{ note }` parsed |

The messages name the field: `upcoming: expected either from and to, or upcoming=true`, `to: the
range spans more than 92 days`, `end: end must be after start`, `note: at most 500 characters`,
`appointmentId: expected a ULID`. What depends on the role (a User's whole hours and fixed `end`,
the Administrator's required `username`, a User's `overbook: true`) is sent and answered by the
API (`invalid_request`, `forbidden`, a route code); what only the server knows (notice, horizon, availability, taken slots, limits,
ownership, a start in the past) likewise.

### 19.5 Mapping the answer

| Answer | Result |
|---|---|
| the input fails its schema | `invalid_request` with the field, no request |
| `list`: `200` with an array `appointments`, every element with a string `appointmentId` | `success`, `appointments` |
| `book` `201`, `cancel` `200`, `updateNote` `200`: an object with a string `appointmentId` | `success`, `appointment` |
| `change` `201`: `cancelled` and `booked`, each an object with a string `appointmentId` | `success`, `cancelled`, `booked` |
| any other 2xx | `unexpected` |
| an `error` code of the route | that code |
| everything else | section 10.2 |

### 19.6 Use from the view layer

The book dialog, the appointment detail and "my appointments" of spec 16.8:

```ts
const appts = new AppointmentsService({ apiUrl }, store);
appts.appointmentsState$.subscribe((s) => { if (s.status === 'success') myList.render(s.appointments); });
appts.list({ upcoming: 'true' }); // a User's next appointments; status=booked by default
appts.cancelState$.subscribe((s) => {
  if (s.status === 'pending') detail.busy(s.appointmentId);
  if (s.status === 'failure' && s.reason === 'cancellation_notice_too_short') detail.explain(s.message);
  if (s.status === 'success') calendar.reload(); // no service refreshes another (spec 16.3)
});
detail.onCancel = (id) => appts.cancel(id);
```

The detail enables cancel and change while `now ≤ cancellableUntil` for a User (`null` for the
Administrator, who has no notice), and the note while the appointment is booked and not ended.

### 19.7 Security notes

Notes and usernames are personal data (spec 16.5): never logged, never put in a URL but the
Administrator's `username` filter of `list`, which is a query parameter the contract defines. The
token rules are those of section 10.2.

### 19.8 Unit tests (`appointments.service.test.ts`)

The per-method suite of section 14.1 for the five methods, each paired with the next one for the
cancel test. Per route its codes, and as `unexpected` codes of neighbouring routes (`invalid_json`
and `appointment_not_found` for `list`; the cancel and conflict codes for `book`; `invalid_json`,
`user_not_found`, `slot_taken`, `user_busy` for `cancel`; `target_not_user` for `change`;
`cancellation_notice_too_short`, `slot_taken`, `user_busy` for `updateNote`; `user_busy` for
`list` too). `user_busy` is a route code of `book` and `change`. Invalid inputs: neither or both
selections, `from` alone, 93 days, an unknown status, a bad username; an instant with seconds, end
before start, a 501-character note, a tab in the note, an unknown field; ids that are not ULIDs (for
`change` with a bad body too: the path's message), a `username` in a change, `start` or `note`
missing, an `overbook` that is not a boolean (in `book` and in `change`). Plus what is sent: `status=booked` added while `pending` keeps the query as given, an empty
list as a success, a blank note sent as `null`, a change without `note` sending none, and four
bookings sent rather than refused (a User's 08:15, no `username`, a custom `end`, a start in the
past), and a cancel with no body; `overbook` `true`, `false` and absent each sent as given by
`book` and by `change`, `pending` keeping the argument as given; a User's `overbook: true`
answered `403 forbidden` as the reason `forbidden`.

### 19.9 Integration checks

Section 14.4, blocks "calendar view", "appointments" and "availability conflict".

---

## 20. `LogoutService` (v8)

"Sign out" in two acts, in this order: **the page forgets the person at once**, and **then
Cognito is told** to revoke the refresh token, so that a copy of it, wherever it may be, can
make no new access token. The first act cannot fail. The second can, and what the service
publishes is how the second went.

The direction is `docs/FRONTEND_ARCHITECTURE.md` section 13.7 and section 11, decision 152
(revoke, and sign out whatever Cognito answers); the nine points decided before this design
are decisions 46 to 54 of section 8. One of them, decision 47, reverses the order section
13.7 wrote down in its version 14: that section and decision 152 were corrected with this
design.

### 20.1 The remote call

`RevokeToken`, one of Cognito's user pool operations, at the address the login uses
(section 4.1). Read on AWS's pages on 2026-11-21, not from memory:

```http
POST https://cognito-idp.<region>.amazonaws.com/
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityProviderService.RevokeToken

{ "ClientId": "<client id>", "Token": "<the refresh token>" }
```

| | What AWS's page says | Source |
|---|---|---|
| The body | `ClientId` and `Token` are required; `Token` is "The refresh token that you want to revoke". `ClientSecret` only "if the client has a secret": ours has none (`GenerateSecret: false`, `backend/template.yaml`). `RevokeAssociatedSessions` is optional, default `NONE`, "revokes only the token session that is associated with the refresh token": not sent | [1] |
| Success | "an HTTP 200 response with an empty HTTP body"; the page's sample answer is `{}` | [1] |
| Credentials | None of AWS's: "Amazon Cognito doesn't evaluate AWS Identity and Access Management (IAM) policies in requests for this API operation. For this operation, you can't use IAM credentials to authorize requests". No access token either: "`RevokeToken` and `GetTokensFromRefreshToken` take refresh tokens as the authorization parameter. The refresh token serves as the authorizing token, and as the target resource." And: "The RevokeToken operation and the /oauth2/revoke endpoint require no additional authorization unless your app client has a client secret." So `docs/FRONTEND_ARCHITECTURE.md` section 13.7 is confirmed: the refresh token and the client id, nothing else | [1], [3], [2] |
| The app client | "You can revoke refresh tokens only in app clients with token revocation enabled." Ours has `EnableTokenRevocation: true` (`backend/template.yaml`) | [2] |
| Errors | Eight, each with its status: `ForbiddenException` 400 (AWS WAF refused the request), `InternalErrorException` 500, `InvalidParameterException` 400, `OperationNotEnabledException` 400 ("not available in the current region or for the current user pool configuration"), `TooManyRequestsException` 400, `UnauthorizedException` 400 ("the request isn't authorized. This can happen due to an invalid access token in the request"), `UnsupportedOperationException` 400 ("an operation that isn't enabled for the user pool client"), `UnsupportedTokenTypeException` 400 ("an unsupported token is passed to an operation"). Among the errors any operation may answer: `ThrottlingException` 400 | [1], [4] |

**What the pages do not say**, and this design therefore does not rely on:

- Which error answers a refresh token that is **already revoked, expired or not a token**; an
  **unknown client id**; **revocation not enabled** for the client. The types' descriptions
  suggest `UnauthorizedException` or `UnsupportedTokenTypeException` for the first and
  `UnsupportedOperationException` for the last; the page ties none of them to a case. The
  mapping of section 20.5 gives every listed type a reason, so no answer is lost; which type
  the real Cognito sends for each case can be read at `docs/FRONTEND_DEPLOY_PLAN.md` step 72.
  **At that step (2026-11-21) none was seen:** the one revocation looked at was answered 200,
  and no refusal was provoked. The mapping still rests on the types' descriptions.
- What a second `RevokeToken` of the same token answers.
- **Whether a browser may call it from another origin.** None of the pages read ([1] to [5])
  mentions CORS or a browser. What is known is next to it, not it: Cognito answers the
  preflight of `InitiateAuth` (section 10.3, section 1.1), and `RevokeToken` is the same
  address, the same method and the same two header names, with another value in
  `X-Amz-Target`; a preflight asks about the names of the headers, not their values. It is
  looked at at the deployed page, and on purpose: if the browser
  refused the call, the result would be `network`, the person would be signed out all the
  same, and nothing on the page would show it (decision 50). **Seen on 2026-11-21: the
  browser may.** At the deployed page the request was answered 200 (section 20.9).
- The page's sample request carries an `Authorization: AWS4-HMAC-SHA256 …` header, although
  the same page says IAM credentials cannot authorize the operation. This design sends none,
  as for `InitiateAuth`.

**What revoking does and does not do**, in AWS's words ([2]):

- "When you revoke a refresh token, all access tokens that were previously issued by that
  refresh token become invalid. The other refresh tokens issued to the user are not affected."
  So a sign-out on one computer does not sign the same person out on another.
- "Revoked tokens can't be used with any Amazon Cognito API calls that require a token.
  However, revoked tokens will still be valid if they are verified using any JWT library that
  verifies the signature and expiration of the token."
- That second sentence is this API's case. The authorizer checks an access token's signature
  and expiry and asks Cognito nothing (`docs/ARCHITECTURE.md` section 7.3). **A copy of the
  access token therefore still works at the API after a sign-out**, for at most the 15 minutes
  of its validity plus the 5 minutes the authorizer remembers an answer: the limit already
  accepted for a deleted user. What the revocation ends is the making of new access tokens,
  which without it would go on for the refresh token's seven days.
- The API reference [1] says more than that in one sentence ("you can't use the revoked token
  to access Amazon Cognito user APIs, or to authorize access to your resource server"); the
  developer guide [2] says the opposite for a server that only verifies the JWT, which is
  what ours does. The guide's sentence is the one that matches how the authorizer is built.

**Checked against cognito-local (2026-11-21)**, image `jagregory/cognito-local:5.3.0`, with the
local stack's emulators running, by a script outside the repository that printed statuses and
error types and never a token:

| Call | Answer |
|---|---|
| `InitiateAuth` as `alice`, then `REFRESH_TOKEN_AUTH` with her refresh token | 200, 200 |
| `RevokeToken` with that refresh token and the client id | **200**, body `{}`, `Content-Type: application/x-amz-json-1.1` |
| `REFRESH_TOKEN_AUTH` with the revoked token | **400 `NotAuthorizedException`**, "User not authorized" |
| `RevokeToken` again with the same token; with `garbage`; with an access token | 400 `NotAuthorizedException` each |
| `RevokeToken` with an unknown client id | 400 `ResourceNotFoundException` |
| Two sign-ins of `alice`, the first one's token revoked: a refresh with the second's | 200: the other session is not affected, as in AWS's words |
| The preflight (`OPTIONS` with `Access-Control-Request-Headers: content-type,x-amz-target`) | 204, `Access-Control-Allow-Origin: *`, both headers allowed |
| A new sign-in of `alice` afterwards | 200 |

So the emulator implements the call and its consequence, and the sign-out is tested locally
end to end (section 20.9). The access token of the revoked session against the local API is
test 4 of that journey: `201`, as AWS's guide says of a server that only verifies the token.
What the emulator answers to
a second revocation (`NotAuthorizedException`) is its own choice: AWS's page does not list
that type for this operation.

Sources, read 2026-11-21:

1. `https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RevokeToken.html`
2. `https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html`
3. `https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flows-public-server-side.html`
4. `https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/CommonErrors.html`
5. `https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html`

### 20.2 Configuration

```ts
export type LogoutConfig = CognitoConfig; // the same values as LoginConfig
```

### 20.3 Types (`logout.types.ts`)

```ts
import type { RevokeFailureReason } from './cognito';

// Why Cognito did not revoke the refresh token. Never why the person was not signed out:
// the page forgets the person in every case.
export type LogoutFailureReason =
  | 'not_signed_in'    // the store was empty at the press: nothing to revoke, no request
  | RevokeFailureReason // token_rejected, not_enabled, too_many_attempts, server, unexpected (section 10.1)
  | 'timeout'          // no whole answer within 10 seconds: the request was given up
  | 'network';         // fetch rejected: offline, DNS, CORS, refused

// `success`: Cognito answered 200, the refresh token is revoked.
// `failure`: it is not known to be revoked; at Cognito it may live on, for its seven days at most.
// Neither holds a token or a name.
export type LogoutResult =
  | { status: 'success' }
  | { status: 'failure'; reason: LogoutFailureReason; message: string };

export type LogoutState = { status: 'idle' } | { status: 'pending' } | LogoutResult;
```

The names are the other services' (decision 46). What differs is what they are about: every
other result answers "did what I asked happen?", and a sign-out always happens. This one
answers "does Cognito know?".

### 20.4 The class

```ts
import { BehaviorSubject, Observable, ReplaySubject, of } from 'rxjs';
import { catchError, map, switchMap, take, tap, timeout } from 'rxjs/operators';
import { describe, revokeToken, toRevokeOutcome, type CognitoConfig } from './cognito';
import type { LogoutFailureReason, LogoutResult, LogoutState } from './logout.types';
import type { SessionStore } from './session.store';

export type LogoutConfig = CognitoConfig;

// A service that lives as long as the page and can be put back to its first state.
export type Resettable = { reset(): void };

const REVOKE_TIMEOUT_MS = 10_000; // how long Cognito is waited for

export class LogoutService {
  // Pure reactive stream: one outcome per revocation, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<LogoutResult>(1);
  readonly logoutResult$: Observable<LogoutResult> = this.resultSubject.asObservable();

  // State machine of the latest call: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<LogoutState>({ status: 'idle' });
  readonly logoutState$: Observable<LogoutState> = this.stateSubject.asObservable();

  private calls = 0; // counts the calls, so that the state follows the latest one only

  constructor(
    private readonly config: LogoutConfig,
    private readonly store: SessionStore,
    private readonly pageWide: readonly Resettable[], // the LoginService and the RefreshService
  ) {}

  logout(): void {
    const call = ++this.calls;
    this.stateSubject.next({ status: 'pending' });

    this.store.session$
      .pipe(
        take(1), // whoever is signed in at the press
        // Forget first. The page-wide services before the store: whoever reacts to the
        // store's null then finds them in their first state.
        tap(() => {
          this.pageWide.forEach((service) => service.reset());
          this.store.clear();
        }),
        // Then tell Cognito, with the refresh token read above: the one copy left.
        switchMap((session) =>
          session ? this.revoke(session.refreshToken) : of(failure('not_signed_in', 'Nobody was signed in')),
        ),
      )
      .subscribe((result) => {
        if (call === this.calls) this.stateSubject.next(result); // a later call owns the state
        this.resultSubject.next(result); // next only: section 3.2
      });
  }

  // One revocation: answered, refused, unreachable, or given up after the time limit.
  private revoke(refreshToken: string): Observable<LogoutResult> {
    return revokeToken(this.config, refreshToken).pipe(
      map(({ status, text }): LogoutResult => toRevokeOutcome(status, text)),
      timeout({
        first: REVOKE_TIMEOUT_MS,
        with: () => of(failure('timeout', `Cognito did not answer within ${REVOKE_TIMEOUT_MS / 1000} seconds`)),
      }),
      catchError((err: unknown) => of(failure('network', describe(err)))),
    );
  }
}

function failure(reason: LogoutFailureReason, message: string): LogoutResult {
  return { status: 'failure', reason, message };
}
```

Reading it:

- **Everything up to the request happens inside the call of `logout()`**, before it returns.
  `session$` is a `BehaviorSubject`'s stream: it gives its value at once, `take(1)` keeps that
  one, and the `tap` and the start of the request run in the same run of the script. When
  `logout()` returns, the page-wide services are reset, the store is empty, every subscriber
  of `session$` has been told `null` (the shell has left the person's frame and shown the
  login), and the request has left. The order inside is fixed: reset, clear, send.
- **The store is cleared without a guard** (`clear()`, not `clear(session)`): the session read
  and the session cleared are the same one, a line apart.
- **Where the refresh token is** (decision 47). `session` is the parameter of the function
  given to `switchMap`; `refreshToken` is the parameter of `revoke`; the text of the request's
  body belongs to `fetch`. No field of the service holds any of the three, and the
  subscription itself is kept in no field: nothing outside the call can reach them. They are
  released when the inner stream ends, which is when the answer has been read, when `fetch`
  rejects, or at the time limit.
- **The time limit** is RxJS's `timeout` on the stream of the answer already read: 10 seconds
  from the start of the request to the end of the body. When it fires, the stream of the
  request is unsubscribed, which aborts the `fetch` (section 4.4, point 1), and the outcome
  is `failure timeout`.
- **Nothing cancels a revocation** (decision 48). There is no `pending` field as in the other
  services: a second `logout()` does not unsubscribe the first, and the service has no
  teardown. A call ends by itself, in 10 seconds at most.
- **Two calls** (decision 51). The second finds the store empty, unless somebody signed in in
  between: then it revokes that person's token. Each outcome goes to `logoutResult$` when it
  arrives. `logoutState$` belongs to the latest call: an older call's late outcome is not
  written there.
- `catchError` is last, so that nothing can reach the subjects as an error (rule 4).
- Nothing starts in the constructor.

| Event | `logoutState$` | `logoutResult$` | `session$` |
|---|---|---|---|
| service created | `idle` | (nothing) | unchanged |
| `logout()`, someone signed in | `pending` | | `null`, before `logout()` returns |
| Cognito answers 200 | `success` | `success` | |
| Cognito answers 400 `UnauthorizedException` | `failure token_rejected` | `failure token_rejected` | |
| no answer for 10 seconds | `failure timeout` (the request is aborted) | `failure timeout` | |
| offline | `failure network` | `failure network` | |
| `logout()` with an empty store | `pending`, `failure not_signed_in`, no request | `failure not_signed_in` | (empty) |
| `logout()` twice, the first still unanswered | `pending`, `failure not_signed_in`; the first's outcome, later, is not shown | `failure not_signed_in`, then the first's outcome | `null` since the first |

### 20.5 Mapping the answer

`toRevokeOutcome(status, text)` in `cognito.ts` (section 10.1). A 200 is a success and its body
is not read further. Any other status: the body is parsed as JSON and the error's type is the
last part of `__type` after a `#`, as for `InitiateAuth` (section 4.5).

| Cognito's answer | Result | Why this reason |
|---|---|---|
| 200, any body | `success` | AWS: 200 with an empty body |
| `UnauthorizedException`, `UnsupportedTokenTypeException` | `failure token_rejected` | Cognito did not take the token: not a refresh token, or no longer one it knows |
| `NotAuthorizedException` | `failure token_rejected` | cognito-local's answer to a token already revoked or unknown |
| `UnsupportedOperationException`, `OperationNotEnabledException` | `failure not_enabled` | Revocation is switched off for the app client, or not offered: a fault of the stack's configuration, worth its own name because it means no sign-out ever revokes |
| `TooManyRequestsException`, `ThrottlingException` | `failure too_many_attempts` | As for a login |
| `InternalErrorException`; any 5xx; a body that is not JSON | `failure server` | As for a login |
| `InvalidParameterException`, `ForbiddenException`, `ResourceNotFoundException` | `failure unexpected`, the type named in the message | A request Cognito finds malformed, a web ACL in the way, or (cognito-local) an unknown client id: a wrong build, not something a sign-out can meet in normal use |
| any other `__type` below 500; JSON that is not an object | `failure unexpected`, the message names the status only | Outside what AWS's page lists |
| `fetch` rejects | `failure network` (in the service) | |
| no whole answer in 10 seconds | `failure timeout` (in the service) | |
| the store was empty | `failure not_signed_in` (in the service), no request | |

The message is written by the front end: `Cognito answered 400 UnauthorizedException`,
`Cognito answered 503`, `Cognito answered 502 without JSON`. Cognito's own `message` is never
copied, and a type outside the table is not named (decision 55).

The store is written by no row: it was cleared before the request left.

### 20.6 Use from the view layer

```ts
// Application start-up (the shell): what lives as long as the page.
const store = new SessionStore();
const login = new LoginService({ cognitoUrl, clientId }, store);
const refresh = new RefreshService({ cognitoUrl, clientId }, store);
const logout = new LogoutService({ cognitoUrl, clientId }, store, [login, refresh]);
refresh.start();

signOutButton.onclick = () => logout.logout(); // and nothing else
```

- **The view calls `logout()` and does nothing else.** It does not clear the store, does not
  wait, shows no "signing out…" and no message afterwards (decision 50). The screen changes
  because `session$` says `null`, as it does today, during the call.
- **The view is handed the method only** (`Pick<LogoutService, 'logout'>`): no view subscribes
  to `logoutResult$` or `logoutState$`. They are for a developer (a line in the console while
  working, never in the built page) and for the tests.
- **One `LogoutService` for the page** (decision 48), next to the `LoginService` and the
  `RefreshService`; it is not one of the objects made for each person.

**What is left behind after a sign-out** (decision 53):

| Where | Before `logout()` | After |
|---|---|---|
| `SessionStore` | the session with its three tokens | `null` |
| `LoginService` | `success` with `username`, `role`, `expiresAt`, in both streams (confirmed in the code: `login.types.ts`; never a token) | `idle`; nothing replayed |
| `RefreshService` | after a renewal, `success` with `username`, `expiresAt`; its timer armed | `idle`; nothing replayed; the timer disarmed by the `null` |
| the services of the person's session (calendar, appointments, users, settings, availability) | that person's data in their replayed streams | dropped with the person's objects by the view layer (`docs/FRONTEND_ARCHITECTURE.md` section 6, point 4): no `reset()` needed |
| `LogoutService` | the outcome of the sign-out before, if any | `pending`, then this sign-out's outcome: no name, no token; kept until the next sign-out |
| the one copy of the refresh token | in the store | in the request in flight; gone in 10 seconds at most |

**A renewal under way** (decision 49). The automatic refresh may have a request in flight when
the person presses "Sign out". The sign-out does not wait for it:

1. `refresh.reset()` aborts the renewal's request; its answer, if one comes, is never read.
2. The store is cleared; had the answer been read, `store.replace(started, …)` would do
   nothing, since `started` is no longer the current session (section 9.2).
3. The `null` disarms the renewal's timer (section 11.4).
4. The revocation leaves with the refresh token the store held at the press, which is also
   the one the renewal was using: a renewal never changes it (below).

Nobody is signed in again. What the renewal may have left **at Cognito**, if Cognito served it
before the abort: an access and an id token that no one received. If Cognito served it before
the revocation, they are revoked with the rest ("all access tokens that were previously
issued by that refresh token become invalid", source 2 of section 20.1) and pass the API's
authorizer for their 15 minutes plus 5 all the same, like every access token of that session;
if after, Cognito refused the renewal. **No new refresh token can come from it**: "When this
setting is disabled, token-refresh requests return new access and ID tokens only and the
original refresh token remains valid" (source 5; the app client of `backend/template.yaml`
sets no rotation), and with rotation on, "You can't authenticate with `REFRESH_TOKEN_AUTH`
in app clients with refresh token rotation enabled" (source 5). So `toAuthOutcome`'s line
that keeps a rotated refresh token (decision 21) cannot run against this pool, and if
rotation is ever switched on, the refresh itself must change before the sign-out does.

**The other ways a session ends send nothing** (decision 52):

| The session ends by | What is left at Cognito | Why no revocation |
|---|---|---|
| **Expiry** (the store's timer, section 9.3). Only when the renewal one minute earlier did not succeed: the network was down, or the computer asleep | The refresh token, until seven days after the sign-in | The person did not ask to leave. The page holds the token no more (memory only: section 9.6), exactly as after closing the tab, which no code sees and which leaves the same token for the same seven days. A revocation here would also be asked of a network that has just failed the renewal |
| **The API rejected the access token** (401, or 403 without `error`: section 9.4) | The refresh token, as above | The same. And the cause is not known to be the person's: a clock, a deployment, a fault of the authorizer's. Telling Cognito to end a session on a guess would turn a fault of ours into a sign-out everywhere it can |
| **Cognito refused the renewal** (`session_rejected`) | Nothing usable: Cognito has just said that this refresh token is dead (expired, revoked, the user deleted) | There is nothing to revoke |
| **The renewed token has no role** (`no_role`, decision 20) | The refresh token, as above | An operator took the account out of its groups: every call it could make answers 403 |

For the first two the accepted limit is the one of every tab closed without "Sign out": the
refresh token lives its seven days at Cognito and nothing in the browser holds it. "Sign out"
is how a person ends it sooner, and deleting the user is how the Administrator does
(`docs/ARCHITECTURE.md` section 6.4).

### 20.7 Security notes

- **The refresh token** is read from the store at the press and goes into the request's body
  only: never an address, a header, a state, a result, a message or a log. After the store is
  cleared, one copy exists for the length of the request, 10 seconds at most, where no caller
  can reach it (section 20.4; rule 9's exception).
- **No result can carry it**, whatever Cognito answers: a failure's message is written from
  the status and a type of a fixed list (decision 55). The `network` message is `describe`'s,
  the error's name and text, which never hold the request's body (section 10.1).
- **A failed revocation is silent on the page** (decision 50). The person is signed out of the
  page in every case; what a failure leaves is the refresh token at Cognito, held by nobody
  the page knows of, for at most seven days after the sign-in. This is what "Sign out" left
  in every case before v8.
- **The access token outlives the sign-out** at the API by up to 20 minutes, for whoever
  copied it before (section 20.1; `docs/ARCHITECTURE.md` section 7.3). The page does not hold
  it any more.
- **Only this session.** The person's other sign-ins (another browser, another computer) keep
  their refresh tokens: `RevokeAssociatedSessions` is not sent. Ending them all is the
  Administrator's delete, or a design of its own.
- **The tab closed straight after the press**: the request is sent with `keepalive`, so the
  browser finishes it (decision 56). Without an answer read, there is no result; nobody is
  there to read one.
- **The Content-Security-Policy** already allows the call: Cognito's address is in
  `connect-src` for the login (`docs/FRONTEND_ARCHITECTURE.md` section 13.4). Locally the
  call goes to `/cognito/` of the dev server, like the login.
- Nothing is logged.

### 20.8 Unit tests (`logout.service.test.ts`)

`fetch` stubbed with real `Response` objects; a real `SessionStore`; real `LoginService` and
`RefreshService` where a row needs them, spies (`{ reset: vi.fn() }`) elsewhere. Fake timers
for the time limit and the schedule (`setTimeout`, `setInterval`, `Date`: RxJS's `timeout`
schedules with `setInterval`, like `timer`). The refresh token is a made-up text. Every test
subscribes first, then calls.

| Test | Setup and stub answer | Expect |
|---|---|---|
| success | store holds `a`; 200 `{}` | `logoutResult$` gives exactly `{ status: 'success' }`; states `idle`, `pending`, `success`, the last the same object as the result |
| request shape | store holds `a` | one POST to `cognitoUrl` with `RevokeToken` in `X-Amz-Target`, the client id and `a.refreshToken` as `Token`, `keepalive: true` |
| forgotten before the answer | store holds `a`; the fetch never answers | when `logout()` returns: `session$` gives `null`, both spies' `reset` called once, the fetch already sent, the state `pending` |
| the order inside | spies that record; a subscriber of `session$` that records | `reset` of each page-wide service, then the `null`, then the fetch |
| each failure (`it.each`) | 400 `UnauthorizedException`; 400 `UnsupportedOperationException`; 400 `TooManyRequestsException`; 500 `InternalErrorException`; 502 HTML; 400 `SomethingElseException` | `token_rejected`; `not_enabled`; `too_many_attempts`; `server`; `server`; `unexpected`; in each the store is empty and stays so |
| offline | fetch rejects with `TypeError` | `failure network`; the store is empty; a second `logout()` after a new `set()` gives a second result (the subject is alive) |
| time limit | the fetch never answers | nothing at 10 s − 1 ms; at 10 s `failure timeout`, and the request's `signal.aborted` is `true` |
| answer just in time | the fetch answers 200 at 9 s | `success`; nothing more at 10 s |
| no session | empty store | `pending`, then `failure not_signed_in`; fetch never called; `reset` called all the same |
| two presses | store holds `a`; first fetch unanswered; `logout()` again | one fetch only, not aborted; the second call gives `not_signed_in`; when the first answers 200: `logoutResult$` has `not_signed_in` then `success`, and `logoutState$` still shows `not_signed_in` |
| a second person | `a` signs out, fetch unanswered; `set(c)`; `logout()` | two fetches, the first with `a`'s refresh token and the second with `c`'s; the first is not aborted; the first's late answer leaves the state at the second's outcome |
| a session that arrives after the press | `logout()` with the fetch unanswered; `set(c)`; the fetch answers (200, then in another run 400, then a rejection) | `session$` still gives `c` in each: a late answer changes nothing of a session |
| a renewal in flight | real `RefreshService`, started; store holds `a`; `refresh()` pending; `logout()`; then the refresh's fetch is answered 200 with new tokens | the refresh's signal is aborted; `session$` gives `null` and stays `null`; `refreshState$` is `idle`; the revocation carried `a.refreshToken`; advancing the clock past `a`'s expiry sends no further request |
| a renewal's answer that slips through | a `Resettable` spy instead of the `RefreshService`, so nothing is aborted; a `RefreshService` on the same store with `refresh()` pending; `logout()`; the refresh answers 200 | `session$` stays `null`: the guarded write alone is enough (section 9.2) |
| the login back in its first state | real `LoginService` after a successful login; `logout()` | `loginState$` gives `idle`; a late subscriber of `loginResult$` receives nothing; the login's `idle` came before the store's `null` |
| late subscriber | subscribe after a success | `logoutResult$` replays it; `logoutState$` gives it |
| constructor | service created with a session in the store; time advances | no fetch, no reset: nothing starts by itself |
| no leak | every row above | checked after every test of the file (`afterEach`), on everything the test's services published: no state and no result contains a refresh, an access or an id token; the `console`'s five methods, spied for the whole file, were never called. A 400 whose `message` quotes the token gives a result without it (a test of its own); the `success` test checks that no value holds the username |

The rows of `cognito.test.ts` for the request and the mapping are in section 10.4; those of
`reset()` in sections 6 and 11.8.

**The shell's test** (`docs/FRONTEND_ARCHITECTURE.md` section 8; the cases the design asks of
it, beyond the ones that must stay green):

| Test | Expect |
|---|---|
| "Sign out" calls `logout()` and nothing else | with a fake `logout` that does nothing, the store still holds the session: the shell itself clears nothing |
| "Sign out" under `runShell` | the login is back before the revocation is answered (the fetch stays unanswered); one request to `cognitoUrl` with `RevokeToken`; the form empty and usable |
| nothing left of the person | the existing test, with the real `LogoutService`: nothing of the person or of a token in the whole document, in a field or in the address, also while the revocation is unanswered |
| a second person straight after | `alice` signs out, the revocation unanswered; `admin` signs in: the frame is `admin`'s; the first revocation then answers (200, 400, a rejection): the frame is still `admin`'s, the page is the one `admin` finds alone |
| a session that ends by itself | `store.clear()` from outside: no request to `cognitoUrl` (decision 52) |

### 20.9 Integration checks

`frontend/tests/integration/logout.service.test.ts`, one `describe`, run in order against the
local stack (cognito-local on 9229, the API on 3000), with its page
`docs/journeys/frontend/logout.md`. Real services on real stores; `alice` only; no table is
touched and no user created.

| # | Journey | Expect |
|---|---|---|
| 1 | `alice` signs in twice, into stores A and B; `RefreshService` on A | two sessions with different refresh tokens; A's renewal is `success` (the token is alive before the sign-out) |
| 2 | `LogoutService` on A: `logout()` | when the call returns, `session$` of A gives `null`; the result is `{ status: 'success' }`, and it holds no token |
| 3 | a store C set to A's session as it was before the sign-out (the copy a thief would hold); `RefreshService` on C | `failure session_rejected`; `session$` of C gives `null`: **the revoked refresh token makes no new session** |
| 4 | `HelloService` on a store D set to the same copy | `201`: the access token still passes the authorizer. The limit of section 20.1, written down as a test so that it is not forgotten |
| 5 | `RefreshService` on B | `success`: the other sign-in is not affected |
| 6 | `LogoutService` on an empty store (a `fetch` spy counts requests) | `failure not_signed_in`; no request sent |
| 7 | `alice` signs in again | `success`: a sign-out does not lock the account |

`afterAll` calls `logout()` on every store of the file, so the run leaves no live refresh token
of its own in cognito-local (an empty store sends nothing; the store holding the copy sends a
revocation Cognito refuses, and no result is looked at). In the journey the service is built
with an empty list of page-wide services: what it resets is the unit tests' matter. The file
needs nothing of the other integration files and leaves them one row in `hello-messages`.

**What only the cloud proves**, at `docs/FRONTEND_DEPLOY_PLAN.md` step 72, where the plan
has the check in words a person can follow at the deployed page. **As found on 2026-11-21**,
by the operator in a browser at the page's address (`docs/RUNBOOK.md` section 5.5):

| # | What | Result |
|---|---|---|
| 1 | The browser may make the call from the page's origin (CORS, section 20.1): in the network panel the request to Cognito after "Sign out" is answered 200, not blocked | **Seen:** status 200 |
| 2 | The real Cognito answers 200 to this body (`ClientId`, `Token`), without credentials and without a secret | **Seen**, by the same request: the page sends nothing else. The answer's body was not read |
| 3 | A refresh with the revoked token is refused by the real Cognito | **Not tried.** The command for it was prepared and tested against cognito-local (200 before a revocation, `400 NotAuthorizedException` after) and not run against the real Cognito. An open item of `docs/RUNBOOK.md` section 5.5 |
| 4 | Journey 4 with real lifetimes | Not checked, as planned: it would mean waiting 20 minutes with a copied token, and it is AWS's documented behaviour |

Also not tried there: "Sign out" with the network off, and a session renewed after its
fifteen minutes (section 11; the first time a browser would renew a real session).

Not provable locally and not planned for the cloud: `keepalive` after a closed tab
(decision 56), and which error type the real Cognito gives each refusal (section 20.1).

### 20.10 Acceptance check (v8, `docs/FRONTEND_DEPLOY_PLAN.md` step 71)

1. `npm run verify -w frontend` green, 100 % line coverage on `frontend/src`.
2. Root `npm run verify` green, and `RUN_INTEGRATION=1 npm run test:integration -w frontend`
   green with the journey of section 20.9: the root `verify` runs the back end's integration
   tests, not the front end's.
3. In a browser, under `npm run dev -w frontend` against the local stack: "Sign out" shows the
   login at once, also with the local Cognito stopped; nothing of the person is left in the
   page or the address.
4. No token in a log, a result, a state or the console.
5. A refresh with the revoked token is refused, in the journey.

**As run (2026-11-21):**

1. `npm run verify -w frontend`: green. 2125 unit tests in 41 files (58 more than before the
   step, one file more), lines 100 % (2139/2139); `sam validate --lint` on the hosting's
   template green.
2. Root `DYNAMODB_PORT=8000 npm run verify`: PASSED (`shared` 377 tests, `backend` 1087 unit
   tests and its 90 journeys, then the front end's `verify`). The stamp says a dirty tree, as
   it must before a commit. The front end's integration tests are not part of it and were run
   apart: 53 tests in 4 files green, the 7 of `logout.service.test.ts` among them.
3. In headless Chromium, under the dev server: the login in the same run of the script as the
   press, both fields empty, nothing of the person or of a token in the page, a field or the
   address; one `RevokeToken` to `/cognito/`, answered 200. With the container of
   cognito-local stopped (and started again afterwards): the same for the person, the
   request answered 502, no message. `admin` straight after `alice`: the frame is `admin`'s.
   Beyond the acceptance: the request held and never answered, given up after 10 seconds
   while another person was signed in, whose frame did not change.
4. No token in any result or state (the unit tests' check after every test), none written to
   the console by the code (the spies), none in the browser's console (15 tokens seen on the
   wire were looked for). The console held `zod`'s one report, and, in the run with Cognito
   stopped only, the browser's own line about the 502.
5. Journey 3: `session_rejected`. Journey 4, the limit: the old access token answered `201`.

Not run: anything against the real Cognito (`docs/FRONTEND_DEPLOY_PLAN.md` step 72, point 5);
the walk of `docs/FRONTEND_WALK.md` in full; a closed tab (`keepalive`, decision 56).

## 21. `AssistantService` (v9)

The person's conversation with the assistant (`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 4 to
6). One service for the six routes, and **one stream for its six calls** (section 3.4, decision
59).

### 21.1 The remote calls

Both roles; a person only ever reaches their own conversation, found by the token. Codes from
`docs/CONVERSATIONAL_ARCHITECTURE.md` section 6, which agrees with `docs/ARCHITECTURE.md` section 4
on these routes.

| Call | Request | Success | Errors besides 403 `forbidden`, 500 `internal_error` |
|---|---|---|---|
| `load()` | `GET /assistant/conversation`, no body | `200` `AssistantReply` with every message, or an empty one when there is no conversation | none |
| `end()` | `DELETE /assistant/conversation`, no body | `204`; also with no conversation to end | none |
| `send(text)` | `POST /assistant/messages`, `AssistantMessageBody` | `200` `AssistantReply` with the messages the request added | 400 `invalid_json` / `invalid_request` · 409 `assistant_busy`, `conversation_full` · 429 `assistant_limit_reached` · 503 `assistant_unavailable`, `assistant_budget_reached` |
| `continue()` | `POST /assistant/continue`, no body | the same | 409 `nothing_to_continue`, `assistant_busy` · 503 `assistant_unavailable`, `assistant_budget_reached` |
| `confirm(proposalId)` | `POST /assistant/proposals/{proposalId}/confirm`, no body | the same, with the proposal and the outcome of each change | 400 `invalid_request` · 404 `proposal_not_found` · 409 `assistant_busy` · 503 `assistant_unavailable`, `assistant_budget_reached` |
| `decline(proposalId)` | `POST /assistant/proposals/{proposalId}/decline`, no body | the same, with the fixed notice and `proposal` `null` | 400 `invalid_request` · 404 `proposal_not_found` |

What the codes mean for the caller is `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 6 and 6.1.
Three points bear on the service's shape:

- **A call makes one request** (decision 60). A reply whose `status` is `working` asks for
  `continue()`; the caller makes that call, and repeats it while the status stays `working`.
- **The three codes of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1** are three reasons:
  `assistant_limit_reached` (only `send`: the person's messages of the day), and
  `assistant_budget_reached` and `assistant_unavailable` (`send`, `continue`, `confirm`). After
  either 503 of a `confirm` the changes were made and saved: a `load()` shows the proposal with
  its outcomes, and `continue()` gets the closing words.
- **A refusal of the calendar at a confirmation is not a failure of the call**: the reply is a
  success whose proposal has an action with `outcome: 'refused'` and the route's code in `error`.

### 21.2 Configuration

As section 15.2.

### 21.3 Types (`assistant.types.ts`)

The contract is `shared/`'s and is declared nowhere else: `AssistantReply` with its parts, the
schema `AssistantMessageBody`, `Ulid`, `ASSISTANT_LIMITS`, the codes of `ApiErrorCode`.

```ts
export type AssistantCall = 'load' | 'end' | 'send' | 'continue' | 'confirm' | 'decline';

// Per call: its reasons as a closed list, and its outcomes.
export type AssistantSendFailureReason = SendCode | TransportFailureReason; // and five more
export type AssistantSendOutcome =
  | { call: 'send'; status: 'success'; reply: AssistantReply }
  | { call: 'send'; status: 'failure'; reason: AssistantSendFailureReason; message: string };
export type AssistantEndOutcome =
  | { call: 'end'; status: 'success' } // a 204: nothing to carry
  | { call: 'end'; status: 'failure'; reason: AssistantEndFailureReason; message: string };

// One value of the stream.
export type AssistantOutcome =
  | AssistantLoadOutcome | AssistantEndOutcome | AssistantSendOutcome
  | AssistantContinueOutcome | AssistantConfirmOutcome | AssistantDeclineOutcome;
```

`call` is what keeps the reasons of a route those of that route on a shared stream: after
`outcome.call === 'decline'` the compiler knows that `reason` cannot be `assistant_unavailable`,
and a `switch` over the reasons of one call needs no default (the unit test holds one per call,
so a code added to a route and not handled stops the build). A failure has `status`, `reason` and
`message` as an `ApiFailure` (section 10.2), without `conflicts`, which no route of the assistant
answers. There is no `idle` and no `pending` value: the stream carries outcomes only (section
21.4).

### 21.4 The class

```ts
export class AssistantService {
  private readonly outcomeSubject = new ReplaySubject<AssistantOutcome>(1);
  readonly outcome$: Observable<AssistantOutcome> = this.outcomeSubject.asObservable();

  constructor(config: ApiConfig, store: SessionStore) {}

  load(): void;
  end(): void;
  send(text: string): void;
  continue(): void;
  confirm(proposalId: string): void;
  decline(proposalId: string): void;
}
```

- **One subject, fed by the six calls** with `next` only (section 3.2). Each call goes through
  `apiCall` (section 10.2): the token, the handling of a rejected session and of an answer
  outside the contract are its own.
- **No state stream** (section 3.3 is optional). What a form needs while a request is in flight
  is known to the logic layer that made the call, which is also the one that knows an exchange is
  still going on between two `continue` calls; a `pending` of one request would say less.
- **No memory** beyond the last outcome, which the `ReplaySubject(1)` gives a late subscriber. The
  service keeps no conversation, no proposal and no text: the conversation is the server's, and
  after a reload of the page the screen calls `load()`.
- **A call made again abandons its own pending request**, never another call's, as in every
  service. The server may still have done what the abandoned request asked.
- **Checked before sending**, with the schemas of `shared/` (decision 33):

  | Method | Schema | Sent |
  |---|---|---|
  | `send` | `AssistantMessageBody` on `{ text }` | the parsed body: the text trimmed |
  | `confirm`, `decline` | `Ulid` on the id | no body; the id in the path through `encodeURIComponent` |
  | `load`, `end`, `continue` | none | no body |

  A text that is empty after trimming or longer than `ASSISTANT_LIMITS.messageLength` answers
  `invalid_request` `text: 1 to 2000 characters`; an id that is not a ULID answers
  `invalid_request` `proposalId: expected a ULID` (the schema's message, under the field's name,
  since `shared/` has the id's schema and not one for the path). No request is sent.
- **Nothing of the model is interpreted.** A message's text, the proposal's question, labels and
  summaries and the line of progress are passed on as given. The service builds no sentence and
  chooses no language (decision 61).

### 21.5 Mapping the answer

| Answer | Outcome |
|---|---|
| the input fails its schema | `invalid_request` with the field, no request |
| `load`, `send`, `continue`, `confirm`, `decline`: `200` with an object whose `status` is a string, `messages` an array and `remainingToday` a number | `success`, `reply`: the body as received |
| `end`: `204` | `success` |
| any other 2xx | `unexpected` |
| an `error` code of the route | that code |
| an `error` code of another route (`assistant_unavailable` on `decline`, `assistant_limit_reached` on `continue`, a calendar code on `confirm`) | `unexpected` |
| everything else | section 10.2. A 503 or a 429 **without** an `error` code is API Gateway's own and stays `server`: it is none of the assistant's three reasons |

Every outcome carries the `call` it answers.

### 21.6 Use from the view layer

The view never sees the service: the logic object of the screen does
(`docs/CONVERSATIONAL_ARCHITECTURE.md` section 13, `docs/CONVERSATIONAL_PLAN.md` step c12). In
short:

```ts
const assistant = new AssistantService({ apiUrl }, store);
assistant.outcome$.subscribe((o) => {
  if (o.call === 'end') return o.status === 'success' ? conversation.clear() : conversation.explain(o);
  if (o.status === 'failure') return conversation.explain(o); // the sentence for o.call and o.reason
  if (o.call === 'load') conversation.replace(o.reply); // every message
  else conversation.add(o.reply);                       // the messages this request added
  if (o.reply.status === 'working') assistant.continue(); // the caller's loop, with its limit
});
assistant.load();
form.onSend = (text) => assistant.send(text);
```

- The replies are put together by the caller: `load` gives every message, the other calls the
  messages their request added; `status`, `activity`, `proposal` and `remainingToday` of the
  latest reply are the current ones.
- The loop on `working` stops after `ASSISTANT_LIMITS.modelRequestsPerMessage` calls, and is not
  started again after `assistant_budget_reached`
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 13).
- The sentences of the three reasons of section 21.1 are `shared/`'s fixed texts, chosen by the
  screen in the conversation's language (`reply.language` of the last reply, English when there
  is none).
- After a `confirm` whose proposal has an action `done`, the screens that show the calendar
  reload: no service refreshes another.

### 21.7 Security notes

A conversation is personal data: the person's texts, the assistant's, the notes and usernames an
answer may quote. Nothing of it is logged, put in a URL or kept by the service beyond the last
outcome, which goes with the service when the session's objects are dropped. The only thing in a
path is the proposal's id, a ULID checked first. A message's text is plain text: the service does
not read it, and the view sets it as text, never as markup. The token rules are those of section
10.2.

### 21.8 Unit tests (`assistant.service.test.ts`)

One suite of its own, run per call (the per-method suite of section 14.1 tests a pair of streams
per method): the outcome with its `call`; what is sent (the method, the path, the body or its
absence, the bearer token); **every code of the route**, each with its own reason and the session
kept; codes of neighbouring routes as `unexpected` (the three reasons of section 21.1 on `load`
and `end`; `assistant_limit_reached` and `conversation_full` on `continue` and `confirm`; the
codes of a route that asks Claude on `decline`; `slot_taken` on `send` and `confirm`); answers
that are not a reply (a 201, `status`, `messages` or `remainingToday` missing or wrong, an empty
200; a 200 for `end`); a rejected token (the store cleared); a 503 without a code (`server`);
nobody signed in (no request); the inputs refused before a request (an empty text, one of spaces
and line breaks, 2 001 characters, none; an id with an `I`, too short, with a path in it, empty);
the network failing, then a success; a second call abandoning the first and not another call's;
the replay to a late subscriber; no token in any outcome.

Then, for the one stream: the outcomes of five different calls in the order the answers came,
each with its call; a reply that says `working` passed on with no request following by itself; a
reply passed on as given (a text with markup and line breaks, a refused change with its code, a
field the service does not know); the three reasons of section 21.1 each on its own, on every
route that answers them; the same code on two routes as two outcomes, and as `unexpected` on a
third; only the last outcome replayed; no `conflicts` in a failure. The file also holds one
`switch` without a default per list of reasons, which the typecheck compiles.

`frontend/tests/unit/integration/claude.test.ts` tests the check of section 14.7.

### 21.9 Integration checks

Section 14.7, its three blocks.

---

## 22. `ChangePasswordService` (v10)

The signed-in person, User or Administrator, changes their own password, knowing the current one
(`docs/ARCHITECTURE.md` section 6.9, `docs/CHANGE_PASSWORD_PLAN.md`). The browser talks to
Cognito directly, as for the sign-in: no route of the API, no Lambda. One method, with a result
stream and a state stream (section 3.3).

### 22.1 The remote calls

Both through `cognitoRequest` (section 10.1), each with the person's access token as its only
authority: Cognito evaluates no IAM permission, and an access token from `USER_PASSWORD_AUTH`
carries the scope both need (`docs/ARCHITECTURE.md` section 6.9).

| Call | `X-Amz-Target` | Body | Success |
|---|---|---|---|
| the change | `AWSCognitoIdentityProviderService.ChangePassword` | `{ "AccessToken", "PreviousPassword", "ProposedPassword" }` | `200`, an empty body (`{}` from Cognito, possibly nothing from the emulator) |
| the sign-out everywhere | `AWSCognitoIdentityProviderService.GlobalSignOut` | `{ "AccessToken" }` | `200`; every refresh token of the person revoked |

No username is sent: Cognito changes the password of the token's owner and of nobody else, so
"only one's own" holds by construction (`docs/CHANGE_PASSWORD_PLAN.md` section 2, decision D1).
A refusal is a 400 whose body names the error class, as for `InitiateAuth` (section 4.1).

### 22.2 Configuration

```ts
export type ChangePasswordConfig = {
  cognitoUrl: string;         // the same URL as LoginConfig's
  skipGlobalSignOut: boolean; // true only against the local stack (decision 67)
};
```

Plus the `SessionStore` as the second argument. The shell creates the service in each person's
`sessionObjects` (`docs/FRONTEND_ARCHITECTURE.md` section 6) with `cognitoUrl` and
`skipGlobalSignOut` of the configuration `frontend/src/main.ts` hands it. The second comes from
the bundle's fourth constant, `SKIP_GLOBAL_SIGN_OUT` (`docs/FRONTEND_ARCHITECTURE.md` section
12.1): `true` only in the dev server's bundle, for the local stack, and `false` in every build of
`npm run build -w frontend`, which reads no variable for it; the shell takes anything but `true`
as `false`, so a cloud build always signs out.

### 22.3 Types (`change-password.types.ts`)

```ts
import type { PasswordProblem } from '@shared-calendar/shared';

export type NewPasswordProblem = PasswordProblem | 'same_as_current';

export type ChangePasswordFailureReason =
  | 'not_signed_in'          // the store is empty: no request
  | 'new_password_refused'   // the shared rule or the current password refuses it: no request
  | 'wrong_current_password' // NotAuthorizedException, InvalidPasswordException
  | 'too_many_attempts'      // LimitExceededException, TooManyRequestsException
  | 'network'                // fetch rejected
  | 'server'                 // 5xx, or a failure whose body is not JSON
  | 'unexpected';            // anything else, PasswordHistoryPolicyViolationException included

export type ChangePasswordResult =
  | { status: 'success' } // nothing more, whatever the sign-out did (decision 65)
  | { status: 'failure'; reason: 'new_password_refused'; message: string; problems: NewPasswordProblem[] }
  | { status: 'failure'; reason: Exclude<ChangePasswordFailureReason, 'new_password_refused'>; message: string };

export type ChangePasswordState = { status: 'idle' } | { status: 'pending' } | ChangePasswordResult;
```

`pending` carries nothing, unlike decision 31's rule for the API services: both arguments are
passwords (rule 6). `PasswordProblem` is the shared list of decision 63.

### 22.4 The class

```ts
export class ChangePasswordService {
  readonly changePasswordResult$: Observable<ChangePasswordResult>; // ReplaySubject(1)
  readonly changePasswordState$: Observable<ChangePasswordState>;   // BehaviorSubject, idle first
  constructor(config: ChangePasswordConfig, store: SessionStore) {}
  changePassword(current: string, next: string): void;
}
```

`changePassword(current, next)`, in order:

1. Abandons the call in flight (decision 68), then `pending`.
2. `passwordProblems(next)`, then `same_as_current` when `next === current`: any problem is
   `new_password_refused` with the list, and nothing is sent (decisions 63 and 64).
3. The session, read from the store at the moment of the call (`take(1)`, section 9.5): none is
   `not_signed_in`, and nothing is sent.
4. `ChangePassword` with the session's access token and both passwords. A refusal is mapped
   (section 22.5) and ends the call; the store is left as it is.
5. After a change, `GlobalSignOut` with the same access token, unless `skipGlobalSignOut`; its
   answer, a failure or a rejected fetch included, is not read (decision 65).
6. `{ status: 'success' }` on both streams, the state first, then `store.clear()`, unguarded
   (decisions 68 and 69).

### 22.5 Mapping the answer

| Answer of `ChangePassword` | Outcome |
|---|---|
| `200`, any body | the change is made: steps 5 and 6 of section 22.4, `success` |
| `NotAuthorizedException`, `InvalidPasswordException` | `wrong_current_password` |
| `LimitExceededException`, `TooManyRequestsException` | `too_many_attempts` |
| any other class, `PasswordHistoryPolicyViolationException`, `PasswordResetRequiredException`, `UserNotFoundException`, `InvalidParameterException` included | `unexpected` |
| 5xx without a class known above | `server` |
| a failure whose body is not JSON | `server`, `Cognito answered <status> without JSON` |
| any other 2xx | `unexpected` |
| fetch rejects | `network`, `TypeError: …` |

The class is read behind a namespace prefix; the message is Cognito's when it is a string, else
`Cognito answered <status>`. How the classes are read is `docs/ARCHITECTURE.md` section 6.9, row
2: since the rule was checked first, `InvalidPasswordException` is the emulator's wrong current
password, never a new password the pool refuses. `NotAuthorizedException` is also Cognito's
answer to an access token it no longer accepts (an account deleted meanwhile, a token revoked):
it is told as a wrong current password too, and the next API call signs a deleted person out
(`docs/CHANGE_PASSWORD_PLAN.md` finding F5). Which class real Cognito gives to which refusal is
proved only by the smoke test (`docs/CHANGE_PASSWORD_PLAN.md` step p4).

### 22.6 Use from the view layer

```ts
const changes = new ChangePasswordService({ cognitoUrl, skipGlobalSignOut }, store);
changes.changePasswordState$.subscribe((state) => {
  saveButton.disabled = state.status === 'pending'; // decision 68
  if (state.status === 'failure') hint.textContent = sentenceFor(state); // the screen's words
});
form.onsubmit = () => {
  if (newInput.value !== againInput.value) return showDifferent(); // the screen's check (decision 64)
  changes.changePassword(currentInput.value, newInput.value);
};
// The success arrives while the person is still signed in (decision 69): the screen empties its
// fields and the shell puts the page-wide services back and words "Password changed". Then the
// store is cleared: session$ gives null and the shell shows the login, which says it.
```

For hints while the person types, the screen calls `passwordProblems` of `shared/` itself, with
no service. The sentences of the reasons and of the problems are the screen's
(`docs/CHANGE_PASSWORD_PLAN.md` step p3).

### 22.7 Security notes

- **Both passwords** live in the method's arguments and in the request body only (rule 6): never
  on the instance, in `pending`, a state, a result, a message or a log. A refusal lists the names
  of the conditions missed, never the text.
- **The access token** is read from the store at the moment of the call and goes into the two
  request bodies only (rule 9); the service keeps no copy.
- **What does not end with the sign-out**: an access token already issued is accepted by the API
  until it expires, 15 minutes at most plus up to 5 minutes of the authorizer's cache
  (`docs/ARCHITECTURE.md` section 7.3). Locally the sign-out is skipped, so the person's other
  sessions stay signed in (`docs/ARCHITECTURE.md` section 8).
- A wrong current password counts towards Cognito's lockout (`too_many_attempts`), as a wrong
  sign-in does.
- Nothing is logged.

### 22.8 Unit tests (`change-password.service.test.ts`)

`fetch` stubbed with real `Response` objects; every test subscribes first, then calls; after
every test, every value either stream emitted is serialized and searched for both passwords and
the session's three tokens.

| Test | Expect |
|---|---|
| success | states `idle`, `pending`, `success`, the same object in both streams; two requests; the session still in the store while `GlobalSignOut` is sent and when each stream says `success`; `session$` gives `null` after |
| the two requests | `ChangePassword` with both headers and `{ AccessToken, PreviousPassword, ProposedPassword }`, then `GlobalSignOut` with `{ AccessToken }` |
| an empty 200 | `success` |
| skipped | one request, `ChangePassword` only; the store cleared; `success` |
| a failed sign-out | refused, unsupported, a 502, offline: `success`, the store cleared |
| a refresh during the change | the store cleared all the same |
| token at call time | the token of the session in the store when the call is made |
| every class | the four of section 22.5 with their reason and Cognito's message; five others `unexpected`; the store kept, no sign-out |
| namespace prefix | `…#NotAuthorizedException` is `wrong_current_password` |
| answers outside the contract | a 500 without a class (`server`), a 502 that is not JSON (`server`), a 400 whose JSON is not an object (`unexpected`), a message that is not a string, a 202 (`unexpected`) |
| offline, then success | `network`, the store kept; the next call succeeds |
| refused by the rule | each condition alone, a space, a tab, several at once: `new_password_refused` with the list, no request, the store kept |
| equal to the current one | `same_as_current`, no request; with the rule's problems, the rule's first |
| nobody signed in | `not_signed_in`, no request; with a refused password, `new_password_refused` |
| cancel | a second call aborts the first request; one result |
| late subscriber | the last result and the current state |
| no password on the service | no field of the instance is a string |

### 22.9 Integration checks

Section 14.9, its five journeys.
