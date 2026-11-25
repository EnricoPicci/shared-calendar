# The "first sign-in with a temporary password" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/login.service.test.ts` |
| `describe` | `first sign-in with a temporary password` |
| Tests | 1. "the temporary password gives the state "a new password is needed", the username only, and no token"<br>2. "a too-weak new password is refused before any request, and the challenge stays open"<br>3. "a good new password signs the person in: the store holds the session, and GET /me answers the User"<br>4. "the temporary password then no longer signs in, and the new one does" |
| Runs against | the local stack: cognito-local on port 9229, and the API on port 3000 for creating and removing the account and for `GET /me` (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the four facts of a person](../concepts.md#the-four-facts-of-a-person),
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[the deleted-user marker](../concepts.md#the-deleted-user-marker).

## What this block proves

- An account whose password is temporary gets no token at its sign-in: Cognito answers with the
  challenge `NEW_PASSWORD_REQUIRED`, and `LoginService` says "a new password is needed" with the
  username only (`docs/FRONTEND_SERVICES.md` section 4.9, `docs/EMAIL_ARCHITECTURE.md` section 5.1).
- A new password that breaks the pool's rule never reaches Cognito, and the challenge stays open
  for another try (`docs/EMAIL_ARCHITECTURE.md` section 5.2).
- A good new password answers the challenge with `RespondToAuthChallenge` and signs the person in
  as any sign-in does; afterwards only the new password signs in.

## Who takes part

- **`fe-first`**: a plain User the block creates and then gives a temporary password. It signs in
  with it, chooses a password of its own, and signs in again.
- **The Administrator** (`admin`): creates and removes `fe-first` through `UsersService`.
- **One `LoginService`**, made once for the whole block with cognito-local's configuration
  (`cognito()` of `frontend/tests/integration/local.ts`) and a store of its own. The same service
  runs tests 1 to 3, because it holds the open challenge: the session Cognito gives with the
  challenge stays inside it, never in a state or a result.
- **cognito-local**, the local stand-in for Cognito. It gives the challenge and takes the answer,
  but checks neither the challenge's session nor the pool's rule for the new password
  (`docs/EMAIL_ARCHITECTURE.md` section 14.1). So the end of Cognito's 3 minutes for the challenge
  cannot happen here: it is proved by the unit tests only.

## Before the block starts

The tests of the file before the block sign `alice` and `admin` in; they change nothing this block
uses.

The block's `beforeAll` signs the Administrator in and removes `fe-first` if an earlier run left
it (accepting `user_not_found`). Then it creates `fe-first` through `UsersService.createUser()`,
with the four facts `newUser()` makes from the username (the e-mail `fe-first@example.com`). The
API answers with a permanent password, which the block does not use: the helper
`setTemporaryPassword()` of `frontend/tests/integration/local.ts` then gives the account the
temporary password `Fe-First-Temp-1!`, with Cognito's `AdminSetUserPassword` and `Permanent:
false`, as an invitation would. cognito-local takes that administrator's call unsigned. The
account is now one that must choose its own password at its next sign-in.

## Test 1: the challenge

The block's service signs in as `fe-first` with the temporary password. The test checks that:

- the result is exactly `{ status: 'new_password_required', username: 'fe-first' }`: the username
  and nothing else, no token and no session;
- the service's state is that same object;
- the store holds no session: nobody is signed in yet.

## Test 2: a too-weak new password

The test puts a spy on `fetch`, then calls `choosePassword('weak')` on the same service. The test
checks that:

- the result is `new_password_required` again, for `fe-first`, with the refusal
  `new_password_refused` and the problems `too_short`, `no_uppercase`, `no_digit`, `no_symbol`:
  the names of what the shared rule (`shared/src/password.ts`) finds missing. `weak` has lower-case
  letters and no blank, so those two problems are not listed;
- `fetch` was never called: the service refused it before any request;
- after the spy is removed, the store still holds no session.

The challenge is still open: the next test answers it with the same session.

## Test 3: a good new password

The same service calls `choosePassword('Fe-First-Chosen-2?')`. It sends `RespondToAuthChallenge`
with the username, the new password and the session it kept; cognito-local answers with the
three tokens, and the service puts the session in the store, as a sign-in does. The test checks
that:

- the result is a `success` as `fe-first` with `role: 'user'`;
- the store holds a session as `fe-first`, role `user`;
- `GET /me`, called with that session's access token, answers `200` with the username
  `fe-first`, the role `user` and the e-mail `fe-first@example.com`: the API's authorizer takes
  the token, and it is the account's own.

## Test 4: the old and the new password

Two sign-ins of `fe-first`, each with a service and a store of its own (`signIn()` of
`frontend/tests/integration/local.ts`). The test checks that:

- with the temporary password the sign-in fails with `invalid_credentials`: cognito-local holds
  the new password only;
- with the new password it succeeds as `fe-first`, `role: 'user'`, with no challenge.

## What the block leaves

The block's `afterAll` removes `fe-first` through `UsersService` (`DELETE /users/{username}`) and
clears every store it opened. Nothing of the block stays in Cognito. In the `calendar` table the
deletion leaves the deleted-user marker of `fe-first`, one per run; it booked nothing, so nothing
is cancelled. The passwords of `admin` and `alice` are untouched.

## If the block fails halfway

A failed test does not stop the block, and the later tests depend on the earlier ones:

- test 2 needs the challenge test 1 opened in the block's service; without it, `choosePassword()`
  does nothing, and the test fails when `outcome()` has waited 30 seconds for a result that never
  comes;
- test 3 needs that challenge still open; test 4 needs the change of test 3, without which the
  temporary password still gets the challenge and the new one is refused.

A failure anywhere may leave `fe-first` with its temporary password or with the new one. The
`afterAll` removes it all the same, and should the run be killed first, the next run's
`beforeAll` removes it before creating it anew. So the block is repeated without a step by hand.

## Where in the code

| What | Where |
|---|---|
| The sign-in | `LoginService.login(username, password)` (`frontend/src/services/login.service.ts`) on `loginResult$` and `loginState$` → Cognito's `InitiateAuth`; the answer read by `toSignInOutcome()` of `frontend/src/services/cognito.ts` |
| The new password | `LoginService.choosePassword(newPassword)` on `loginResult$` → Cognito's `RespondToAuthChallenge` (`respondToNewPassword()`, read by `toChallengeOutcome()`); no route of the API |
| The rule | `passwordProblems()` in `shared/src/password.ts` |
| The temporary password | `setTemporaryPassword()` of `frontend/tests/integration/local.ts` → Cognito's `AdminSetUserPassword`, `Permanent: false` |
| The account | `UsersService.createUser()` on `createUserResult$` → `POST /users`; `deleteUser()` on `deleteUserResult$` → `DELETE /users/{username}` (helper `removeFirst()`) |
| `GET /me` | a plain `fetch` with the access token of the store |
| Helpers and constants | `next()`, `outcome()`, `signIn()`, `signedIn()`, `newUser()`; `FIRST` (`fe-first`), `TEMPORARY`, `CHOSEN` |
