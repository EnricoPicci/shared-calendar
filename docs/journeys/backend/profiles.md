# The "profiles" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/journeys.test.ts` |
| `describe` | `profiles` |
| Tests | 1. "POST /users with the four facts creates the User; the answer is the username and the state invited only"<br>2. "POST /users without the facts, or with an e-mail that is not one, is 400 naming the fields"<br>3. "GET /users lists the User with the four facts as stored (trimmed, the e-mail lower-cased) and the state active"<br>4. "GET /me: the User reads their own facts; the Administrator reads theirs, those of the seed"<br>5. "PUT /users/profile-user as the Administrator replaces the four facts; the answer and the User's GET /me say the new ones"<br>6. "PUT /users/admin as the Administrator saves their own facts"<br>7. "PUT on a user that does not exist is 404 user_not_found; a body with a field too many is 400"<br>8. "PUT on another administrator is 403 cannot_edit_admin; that administrator's GET /me says no fact is held yet"<br>9. "PUT as a User, even on their own account, is 403 forbidden, and nothing changes" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229 and DynamoDB Local on `DYNAMODB_PORT`, which this block does not touch (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the four facts of a person](../concepts.md#the-four-facts-of-a-person).

## What this block proves

- `POST /users` needs the four facts and stores them as the shared rule makes them: trimmed, the
  e-mail lower-cased; `GET /users` answers them with the account's state (`docs/ARCHITECTURE.md`
  section 4, `docs/EMAIL_ARCHITECTURE.md` section 4.1). Its answer is the username and the state
  `invited`, never a password nor the facts (`docs/EMAIL_ARCHITECTURE.md` section 5.1).
- `GET /me` lets each person, of either role, read their own facts, `null` for a fact not held
  (`docs/EMAIL_ARCHITECTURE.md` section 4.3).
- Only the Administrator changes facts with `PUT /users/{username}`: a User's, or their own, never
  another administrator's (`docs/EMAIL_ARCHITECTURE.md` section 4.2, decision M12).

## Who takes part

- **The Administrator** (`admin`): creates `profile-user`, reads the list, changes facts. Its
  token comes from test 1 of the file (`adminToken`).
- **`profile-user`**: a plain User the block creates; it reads its own facts and tries to change
  some.
- **`profile-admin`**: a second administrator, made straight in cognito-local by
  `createSecondAdmin()`, since the API can never create one. It holds no fact.
- **`alice`**: the seed's User, only in test 9, with the token of test 1 of the file
  (`aliceToken`).

## Before the block starts

It is the last block of the file and runs after journeys 1 to 12, whose test 1 signed `admin` and
`alice` in. The block's `beforeAll` removes `profile-user` and `profile-admin` if an earlier run
left them, straight in cognito-local (`removeUserIfPresent()`): no route of the API is called,
nothing of the calendar is touched.

## Test 1: create with the four facts

The Administrator sends `POST /users` with the username, the facts of `withFacts('profile-user')`,
a first name with spaces around it (` Throw `) and the e-mail `Profile-User@Example.com`. The
test checks that the answer is `201` with exactly `{ username: 'profile-user', status: 'invited' }`:
no password, and the facts are not answered. Cognito made a temporary password for the invitation,
which the journey never sees, so the test sets one of its own, straight in cognito-local
(`setPasswordOf()`, [a new User's password](../concepts.md#the-people-of-the-local-stack)). Then
`profile-user` signs in with it; the token is kept for the later tests.

## Test 2: refused facts

Two `POST /users` for `profile-bare`, an account that is never created. The test checks that:

- a body with the username only is `400` with exactly `{ error: 'invalid_request', message:
  'Invalid input: givenName, familyName, email, address' }`: the message names the four missing
  fields and holds no value;
- a body with every fact but the e-mail `not-an-address` is answered `{ error: 'invalid_request',
  message: 'Invalid input: email' }`.

## Test 3: the list

The Administrator calls `GET /users`. The test checks that the answer is `200` and that the row of
`profile-user` is exactly its username, a `createdAt`, `status: 'active'` and the facts of
`factsOf('profile-user')` with the e-mail `profile-user@example.com`. So the server stored the
first name trimmed (`Throw`) and the e-mail lower-cased. `active` is the state of an account whose
password is set as permanent: test 1 set it, as the User's first sign-in would. Before that the
account was `invited`.

## Test 4: each one reads their own

Two `GET /me`. The test checks that:

- with the token of `profile-user` the answer is `200` and exactly the username, `role: 'user'`
  and the same facts as test 3;
- with the Administrator's token it is exactly `username: 'admin'`, `role: 'admin'` and the facts
  the seed gives `admin` (`backend/scripts/local-seed.sh`): Ada Lovelace, `admin@example.com`,
  an address on two lines.

## Test 5: the Administrator changes a User's facts

The Administrator sends `PUT /users/profile-user` with four new facts (`CHANGED`). The test checks
that the answer is `200` and exactly the account as `GET /users` shows it, with the new facts and
`status: 'active'`, and that `GET /me` with the token of `profile-user` now answers the new facts:
the change is seen by the person at once, with the same token.

## Test 6: the Administrator saves their own

`PUT /users/admin` with the seed's facts of `admin`. The test checks that the answer is `200` with
that username and those facts. Saving the same values leaves the local stack as it was.

## Test 7: an unknown user, a field too many

The test checks that `PUT /users/profile-nobody` is `404` with `error: 'user_not_found'`, and that
`PUT /users/profile-user` with a `username` added to the four facts is `400` with exactly
`{ error: 'invalid_request', message: 'Invalid input: username' }`: the body is strict, and the
username is the path's, never the body's.

## Test 8: another administrator

`createSecondAdmin()` makes `profile-admin` in the group `admin`, with a permanent password and no
fact. The test checks that:

- `PUT /users/profile-admin` by `admin` is `403` with exactly `{ error: 'cannot_edit_admin',
  message: "Another administrator's details cannot be changed" }`;
- `profile-admin` signs in, and its `GET /me` is exactly its username, `role: 'admin'` and `null`
  for each of the four facts: an account made before the facts existed reads them as not held.

## Test 9: a User may change nothing

With the token of `profile-user`, `PUT` on its own account and on `alice`, each with the seed's
facts of `admin`. The test checks that both are `403` with `error: 'forbidden'`, that `alice`'s
own `PUT /users/alice` is `403` too, and that `GET /me` of `profile-user` still says the facts of
test 5: nothing changed. The role is checked before anything else of the request.

## What the block leaves

The `afterAll` removes `profile-user` and `profile-admin` straight in cognito-local. Nothing of
the block stays: `admin`'s facts are those of the seed (test 6 saved them unchanged), `alice`'s
were never changed, and the `calendar` table is not touched.

## If the block fails halfway

A failed test does not stop the block. Tests 4, 5 and 9 need the token of test 1, and test 9
expects the facts test 5 wrote. No test changes `admin`'s facts to other values, so a failure
leaves them as the seed set them. The `afterAll` removes both accounts all the same, and should
the run be killed first, the next run's `beforeAll` removes them before anything else.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /users` (`backend/src/handlers/createUser.ts`), `GET /users` (`listUsers.ts`), `PUT /users/{username}` (`updateUser.ts`), `GET /me` (`getMe.ts`) |
| Cognito | `createUser`, `listPlainUsers`, `listGroups`, `getProfile`, `updateProfile`, `asUserSummary`, `asMe` in `backend/src/lib/cognito.ts` |
| The rules of the facts | `CreateUserBody`, `UpdateUserBody`, `PROFILE_LIMITS` in `shared/src/user.ts` |
| Helpers | `withFacts()`, `factsOf()`, `setPasswordOf()`, `createSecondAdmin()`, `removeUserIfPresent()`, `signIn()`, `api()` in `backend/tests/integration/setup.ts` |
| Constants | `USER` (`profile-user`), `OTHER_ADMIN` (`profile-admin`), `OTHER_ADMIN_PASSWORD`, `ADMIN_FACTS`, `CHANGED` |
