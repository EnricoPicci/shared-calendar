# The "change password" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/change-password.test.ts` |
| `describe` | `change password` |
| Tests | 1. "a wrong current password is refused: nothing changes, the old password still signs in"<br>2. "a new password the rule refuses, or the current one again, sends nothing"<br>3. "the change succeeds, with the sign-out skipped as locally configured, and the store is empty"<br>4. "the old password no longer signs in"<br>5. "the new password signs in, and the change is the account's own" |
| Runs against | the local stack: cognito-local on port 9229, and the API on port 3000 for creating and removing the account (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[the deleted-user marker](../concepts.md#the-deleted-user-marker).

## What this block proves

- A signed-in person changes their own password with `ChangePasswordService`, straight at
  Cognito, with no route of the API: a wrong current password changes nothing, and after a
  change only the new password signs in (`docs/ARCHITECTURE.md` section 6.9).
- A new password that breaks the pool's rule, or equals the current one, never reaches Cognito
  (`docs/FRONTEND_SERVICES.md` section 8, decisions 50 and 51).
- After a change the session is gone from the store, with the sign-out everywhere skipped as the
  local stack must (`docs/FRONTEND_SERVICES.md` section 8, decisions 52 and 54).

## Who takes part

- **`fe-password`**: a plain User the block creates. It signs in, changes its password, and signs
  in again. It is the only account whose password changes.
- **The Administrator** (`admin`): creates and removes `fe-password` through `UsersService`, and
  signs in once more at the end. Its password is never changed.
- **cognito-local**, the local stand-in for Cognito. It differs from Cognito in two ways that
  matter here (`docs/ARCHITECTURE.md` section 8): it answers a wrong current password with
  `InvalidPasswordException` (real Cognito: `NotAuthorizedException`; the service reads both as a
  wrong current password), and it cannot sign a person out everywhere (`GlobalSignOut`).

## Before the block starts

The block's `beforeAll` signs the Administrator in and removes `fe-password` if an earlier run
left it (accepting `user_not_found`). Then it creates `fe-password` through `UsersService`, keeps
the password the API generated (`firstPassword`), and signs `fe-password` in into a store of its
own, `user`. Every test that changes the password uses that store: its session is the one the
change ends.

Each call of the block makes a new `ChangePasswordService` with the local configuration,
`changePasswordConfig()` of `frontend/tests/integration/local.ts`: cognito-local's address, and
`skipGlobalSignOut: true`.

## Test 1: a wrong current password

`fe-password` calls `changePassword()` with its password plus one letter as the current one, and
a good new password. The request leaves; cognito-local refuses it. The test checks that:

- the result is a failure with the reason `wrong_current_password`;
- the store `user` still holds the session of `fe-password`: a refusal does not sign anybody out;
- a sign-in with the first password still succeeds, as `fe-password`: nothing changed.

## Test 2: refused before sending

The test puts a spy on `fetch`, then calls `changePassword()` twice with the right current
password. The test checks that:

- the new password `short` gives `new_password_refused` with the problems `too_short`,
  `no_uppercase`, `no_digit`, `no_symbol`: the names of what the shared rule
  (`shared/src/password.ts`) finds missing. `short` has lower-case letters and no blank, so those
  two problems are not listed;
- the current password given again as the new one gives `new_password_refused` with the one
  problem `same_as_current`: Cognito would accept it, since the pool keeps no password history,
  so the service refuses it itself;
- `fetch` was never called: both refusals are the service's, before any request;
- after the spy is removed, the store `user` still holds the session.

## Test 3: the change succeeds

`fe-password` calls `changePassword()` with the first password and the new one,
`Fe-Password-New-2?`. The service sends `ChangePassword` with the access token of the store; the
local configuration skips `GlobalSignOut`; then the service empties the store. The test checks
that:

- the result is exactly `{ status: 'success' }`: a success carries nothing;
- the store `user` holds no session any more: the person must sign in again.

## Test 4: the old password

A sign-in of `fe-password` with the first password. The test checks that it fails with
`invalid_credentials`: cognito-local holds the new password only.

## Test 5: the new password

A sign-in of `fe-password` with the new password. The test checks that it succeeds as
`fe-password` with `role: 'user'`, and that its store holds the session. Then the Administrator
signs in with the local password of `admin`, and the test checks that it succeeds with
`role: 'admin'`: the change touched only the account whose token was sent, since
`ChangePassword` names no user.

## What the block leaves

The block's `afterAll` removes `fe-password` through `UsersService` (`DELETE /users/{username}`)
and clears every store it opened. Nothing of the block stays in Cognito. In the `calendar` table
the deletion leaves the deleted-user marker of `fe-password`, one per run; it booked nothing, so
nothing is cancelled. The passwords of `admin` and `alice` are as `local:up` set them.

## If the block fails halfway

A failed test does not stop the block, and the later tests depend on the earlier ones:

- tests 1 and 2 need the store `user` of the `beforeAll`;
- tests 4 and 5 need the change of test 3. Without it, test 4's sign-in with the first password
  succeeds and test 5's with the new one fails.

A failure anywhere may leave `fe-password` at either password. The `afterAll` removes it all the
same, and should the run be killed first, the next run's `beforeAll` removes it before creating
it anew. So the block is repeated without a step by hand.

## Where in the code

| What | Where |
|---|---|
| The change | `ChangePasswordService.changePassword(current, next)` (`frontend/src/services/change-password.service.ts`) on `changePasswordResult$` → Cognito's `ChangePassword`, then `GlobalSignOut` unless skipped; no route of the API |
| The rule | `passwordProblems()` and `Password` in `shared/src/password.ts` |
| Signing in | `signIn()` of `frontend/tests/integration/local.ts` → `LoginService.login()` on `loginResult$` → Cognito's `InitiateAuth` |
| The account | `UsersService.createUser()` on `createUserResult$` → `POST /users`; `deleteUser()` on `deleteUserResult$` → `DELETE /users/{username}` (helper `removeThrowaway()`) |
| The local configuration | `changePasswordConfig()` of `frontend/tests/integration/local.ts` |
| Helpers and constants | `change()`, `signInAs()`; `THROWAWAY` (`fe-password`), `NEW_PASSWORD` |
