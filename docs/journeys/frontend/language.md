# The "the language of a person" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/language.test.ts` |
| `describe` | `the language of a person` |
| Tests | 1. "a new account holds no language"<br>2. "the person writes Italian with their own token, and reads it back"<br>3. "a change to English replaces it"<br>4. "the writes stay in the person's own account: alice's language is as it was"<br>5. "a word that is no language of the calendar, written by hand at Cognito, reads as none"<br>6. "the id token of a new sign-in does not carry the language: it is read with GetUser"<br>7. "the Administrator's routes refuse a language: it is the person's own to choose"<br>8. "nobody signed in: nothing is sent" |
| Runs against | the local stack: cognito-local on port 9229, and the API on port 3000 for creating and removing the account and for test 7 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the four facts of a person](../concepts.md#the-four-facts-of-a-person),
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[the deleted-user marker](../concepts.md#the-deleted-user-marker).

## What this block proves

- A signed-in person reads and writes their own language with `LanguageService`, straight at
  Cognito with their own access token, as the attribute `locale` of their account, and no route
  of the API is involved (`docs/MULTILANGUAGE_PLAN.md` finding F11).
- Only a language of the calendar counts: a word that is not one reads as none
  (`docs/MULTILANGUAGE_ARCHITECTURE.md` section 4.1).
- The id token does not carry the language, so the page reads it with `GetUser`
  (`docs/MULTILANGUAGE_PLAN.md` finding F8).
- The Administrator's routes `PUT /users/{username}` and `POST /users` refuse a field
  `language`: the language is the person's own to choose.

## Who takes part

- **`fe-language`**: a plain User the block creates. It reads and writes its own language.
- **`alice`**, the local User: only signs in and reads the language of that account, to show that
  `fe-language`'s writes do not reach another account.
- **The Administrator** (`admin`): creates and removes `fe-language` through `UsersService`, and
  sends the two requests of test 7.
- **cognito-local**, the local stand-in for Cognito. Like Cognito it accepts any word as
  `locale`. Unlike Cognito it ignores the app client's list of attributes a person may write
  (`docs/MULTILANGUAGE_PLAN.md` finding F8): that a person's token can write `locale` and
  nothing else is not tried here, only in the cloud.

## Before the block starts

The block's `beforeAll` signs the Administrator in and removes `fe-language` if an earlier run
left it (accepting `user_not_found`). It creates `fe-language` through `UsersService`, gives it a
permanent password straight in cognito-local (`setPermanentPassword()`,
[a new User's password](../concepts.md#the-people-of-the-local-stack)), and signs it in into a
store of its own, `user`.

Each read and each write of the block makes a new `LanguageService` on cognito-local's address
(`cognito()` of `frontend/tests/integration/local.ts`) and the store it is given.

## Test 1: a new account

`fe-language` reads its language. The test checks that the result is a success with
`language: null`: the creation through `POST /users` stores no language.

## Test 2: Italian written and read back

`fe-language` writes `it`: the service sends `UpdateUserAttributes` with the store's access
token and the one attribute `locale`. The test checks that the result is a success with
`language: 'it'`, and that a read then gives `language: 'it'`.

## Test 3: a change

`fe-language` writes `en`. The test checks that the write succeeds with `language: 'en'` and
that a read gives `en`: a write replaces the language held.

## Test 4: the person's own account only

`alice` signs in into a store of their own, and reads their language. Then `fe-language` writes
`it`. The test checks that alice's first read succeeded, and that a second read of theirs gives
exactly the same result: `UpdateUserAttributes` names no user, so Cognito writes the account
whose token was sent and no other. Alice's language is whatever that account held before (none,
unless someone set one by hand).

## Test 5: a word that is not a language of the calendar

The test sends `UpdateUserAttributes` by hand, with `fe-language`'s token and `locale` set to
`fr`, a word the page never writes. The test checks that cognito-local answers 200 (it accepts
any word), and that a read through the service then gives `language: null`: the service keeps
only `en` and `it`.

## Test 6: not in the id token

`fe-language` writes `it`, then signs in again into a new store, with the same password set
once more by `setPermanentPassword()`. The test checks that the claims
of the new session's id token have no `locale`, and that a read with that session gives
`language: 'it'`: the language is in the account, but only `GetUser` gives it to the page.

## Test 7: the Administrator's routes refuse a language

The Administrator sends two requests by hand, with their own token, since `UsersService` would
refuse the bodies before sending: `PUT /users/fe-language` with the four facts and
`language: 'it'`, and `POST /users` with a new account `fe-language-new` and `language: 'it'`.
The test checks that both answer 400 `invalid_request`: the two bodies' schemas, `UpdateUserBody`
and `CreateUserBody` of `shared/src/user.ts`, are strict and take no field they do not name. So the refusal is the API's, and `fe-language-new` is never created.

## Test 8: nobody signed in

The test puts a spy on `fetch` and reads the language with an empty store. The test checks that
the result is a failure with the reason `not_signed_in` and that `fetch` was never called: the
service sends nothing without a session.

## What the block leaves

The block's `afterAll` removes `fe-language` through `UsersService` (`DELETE /users/{username}`)
and clears every store it opened. Nothing of the block stays in Cognito: `alice`'s account is as
it was. In the `calendar` table the deletion leaves the deleted-user marker of `fe-language`, one
per run; it booked nothing, so nothing is cancelled.

## If the block fails halfway

A failed test does not stop the block. Tests 2 to 7 need the `beforeAll`'s account and store;
test 3 checks a change only after test 2's write, and test 5 counts on nothing before it. A
failure may leave `fe-language` with any language; the `afterAll` removes it all the same, and
should the run be killed first, the next run's `beforeAll` removes it before creating it anew.
If test 7's `POST /users` were ever accepted, `fe-language-new` would stay behind, since nothing
removes it.

## Where in the code

| What | Where |
|---|---|
| The read | `LanguageService.read()` (`frontend/src/services/language.service.ts`) on `readResult$` → Cognito's `GetUser`; no route of the API |
| The write | `LanguageService.write(language)` on `writeResult$` (and `writeState$`) → Cognito's `UpdateUserAttributes` with `locale` |
| Which words count | `readLanguage()` of `@shared-calendar/shared` |
| The routes that refuse | `PUT /users/{username}` (`backend/src/handlers/updateUser.ts`), `POST /users` (`backend/src/handlers/createUser.ts`), helper `asAdmin()` |
| The account | `UsersService.createUser()` on `createUserResult$` → `POST /users`; `deleteUser()` on `deleteUserResult$` → `DELETE /users/{username}` (helper `removeThrowaway()`) |
| Helpers and constants | `read()`, `write()`, `asAdmin()`; `signIn()`, `signedIn()`, `setPermanentPassword()`, `cognito()` of `frontend/tests/integration/local.ts`; `THROWAWAY` (`fe-language`) |
