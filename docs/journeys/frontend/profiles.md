# The "profiles" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/profiles.test.ts` |
| `describe` | `profiles` |
| Tests | 1. "the Administrator creates fe-profile with four facts, and the list shows them, the account active"<br>2. "fe-profile reads their own facts, as a User"<br>3. "the Administrator reads their own facts, those of the seed"<br>4. "the Administrator changes the four facts of fe-profile; the answer and fe-profile's own read say the new ones"<br>5. "the Administrator saves their own facts"<br>6. "a user that does not exist: user_not_found"<br>7. "fe-profile cannot change facts, not even their own: forbidden, the session kept"<br>8. "a fact that is not one is refused before any request" |
| Runs against | the local stack: the API on port 3000 and cognito-local on port 9229 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the four facts of a person](../concepts.md#the-four-facts-of-a-person),
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[the deleted-user marker](../concepts.md#the-deleted-user-marker).

## What this block proves

- `UsersService` creates a User with the four facts, lists them, and changes them with
  `updateUser()`; `MeService` reads one's own facts, for either role (`docs/FRONTEND_SERVICES.md`
  sections 13 and 23).
- Only the Administrator may change facts: a User's `updateUser()` is `forbidden` and the session
  stays (`docs/EMAIL_ARCHITECTURE.md` section 4.2).
- A fact the shared rule refuses never leaves the browser (`docs/FRONTEND_SERVICES.md` section
  13.1).

## Who takes part

- **The Administrator** (`admin`): creates, lists, changes and removes `fe-profile`, and reads and
  saves their own facts.
- **`fe-profile`**: a plain User the block creates; it reads its own facts and tries to change
  them.

## Before the block starts

The `beforeAll` signs `admin` in (`signedIn('admin')`) and removes `fe-profile` if an earlier run
left it, through `UsersService.deleteUser()`, accepting `user_not_found`.

## Test 1: create, then list

The Administrator calls `createUser(newUser('fe-profile'))`: the username and the facts of the
helper `newUser()` of `frontend/tests/integration/local.ts` (Throw, Away fe-profile,
`fe-profile@example.com`, an address on two lines). The test throws unless the result is a
success. The creation answers no password, so the test sets one straight in cognito-local
(`setPermanentPassword()`, [a new User's password](../concepts.md#the-people-of-the-local-stack)),
signs `fe-profile` in with it and keeps its store. Then
`listUsers()`. The test checks that the row of `fe-profile` holds the same four facts and
`status: 'active'` (the password just set is permanent, so the account waits for no first
sign-in), and that no row is `admin`: the list holds plain Users only.

## Test 2: a User reads their own

`getMe()` with the store of `fe-profile`. The test checks that the result is exactly a success
with `username: 'fe-profile'`, `role: 'user'` and the four facts of test 1.

## Test 3: the Administrator reads their own

`getMe()` with the Administrator's store. The test checks that the result is exactly a success
with `username: 'admin'`, `role: 'admin'` and the facts the seed gives `admin`
(`backend/scripts/local-seed.sh`).

## Test 4: the Administrator changes a User's facts

`updateUser('fe-profile', …)` as the Administrator, with four new facts whose e-mail is written
`Changed@Example.com`. The service sends what the shared rule makes of them, the e-mail
lower-cased. The test checks that:

- the result is a success whose `user` holds `fe-profile`, the new facts with the e-mail
  `changed@example.com`, and `status: 'active'`;
- `getMe()` with the store of `fe-profile` now gives the new facts: the person sees the change at
  once, with the same session.

## Test 5: the Administrator saves their own

`updateUser('admin', …)` with the seed's facts. The test checks that the result is a success with
that username and those facts: the local stack is left as it was found.

## Test 6: an unknown user

`updateUser('fe-nobody-here', …)` as the Administrator. The username passes the shared rule, so
the request leaves; the API answers, and the test checks the reason `user_not_found`.

## Test 7: a User may change nothing

`updateUser('fe-profile', …)` with the store of `fe-profile` itself. The test checks the reason
`forbidden`, and that a `getMe()` with the same store still succeeds: a `forbidden` from a route
is the API's refusal, not a rejected token, so the session stays.

## Test 8: refused before sending

With a spy on `fetch`, `updateUser('fe-profile', …)` as the Administrator with the e-mail
`not-an-address`. The test checks the reason `invalid_request` and that `fetch` was never called:
the service refused the body with the shared rule (`UpdateUserBody`) before any request.

## What the block leaves

The `afterAll` removes `fe-profile` through `UsersService.deleteUser()` (`DELETE /users/{username}`)
and clears every store it opened. Nothing stays in Cognito; `admin`'s facts are those of the seed.
In the `calendar` table the deletion leaves the deleted-user marker of `fe-profile`, one per run;
it booked nothing, so nothing is cancelled.

## If the block fails halfway

A failed test does not stop the block. Tests 2, 4 and 7 need the store of test 1; test 7's
`getMe()` would still pass after a failed test 4. A failed test 5 may leave `admin` with the seed's
facts unsaved, which changes nothing, since it only writes them again. The `afterAll` removes
`fe-profile` all the same, and should the run be killed first, the next run's `beforeAll` does.

## Where in the code

| What | Where |
|---|---|
| Create | `UsersService.createUser(user)` on `createUserResult$` → `POST /users` |
| List | `UsersService.listUsers()` on `listUsersResult$` → `GET /users` |
| Change | `UsersService.updateUser(username, profile)` on `updateUserResult$` → `PUT /users/{username}` |
| Remove | `UsersService.deleteUser(username)` on `deleteUserResult$` → `DELETE /users/{username}` (helper `removeThrowaway()`) |
| Read one's own | `MeService.getMe()` on `meResult$` → `GET /me` (`frontend/src/services/me.service.ts`) |
| The rules of the facts | `CreateUserBody`, `UpdateUserBody` in `shared/src/user.ts` |
| Helpers and constants | `newUser()`, `setPermanentPassword()`, `signIn()`, `signedIn()`, `outcome()` of `frontend/tests/integration/local.ts`; `me()`, `update()`; `THROWAWAY` (`fe-profile`), `ADMIN_FACTS`, `CHANGED` |
