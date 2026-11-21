# The "who may talk to the assistant (6)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `who may talk to the assistant (6)` |
| Tests | 1. "GET /assistant/conversation without a token is 401 (API Gateway answers)"<br>2. "DELETE /assistant/conversation without a token is 401 (API Gateway answers)"<br>3. "POST /assistant/messages without a token is 401 (API Gateway answers)"<br>4. "POST /assistant/continue without a token is 401 (API Gateway answers)"<br>5. "POST /assistant/proposals/01ARZ3NDEKTSV4RRFFQ69G5FAV/confirm without a token is 401 (API Gateway answers)"<br>6. "POST /assistant/proposals/01ARZ3NDEKTSV4RRFFQ69G5FAV/decline without a token is 401 (API Gateway answers)"<br>7. "GET /assistant/conversation with the token of an account in neither group is 403"<br>8. "DELETE /assistant/conversation with the token of an account in neither group is 403"<br>9. "POST /assistant/messages with the token of an account in neither group is 403"<br>10. "POST /assistant/continue with the token of an account in neither group is 403"<br>11. "POST /assistant/proposals/01ARZ3NDEKTSV4RRFFQ69G5FAV/confirm with the token of an account in neither group is 403"<br>12. "POST /assistant/proposals/01ARZ3NDEKTSV4RRFFQ69G5FAV/decline with the token of an account in neither group is 403"<br>13. "stored nothing for that account"<br>14. "the Administrator has a conversation of their own, like a User" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Tests 1 to 6 are one `it.each` with a row per route, and so are tests 7 to 12. The id in the two
proposal routes is the file's `NO_PROPOSAL`, a well-formed id that names no proposal.

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- The six routes of the assistant are for the Administrator and for Users, and for nobody else
  (`docs/ARCHITECTURE.md` section 4, which lists the six).
- Without a token the answer is `401`; with a valid token of an account in neither group it is
  `403`, the rule of role resolution of `docs/ARCHITECTURE.md` section 3, and nothing is stored.
- The Administrator talks to the assistant as a User does.

## Who takes part

- **`chat-nobody`**: a throw-away account that is in neither group, `admin` nor `user`. It can
  sign in, and its token is valid, but it has no role.
- **The Administrator** (`admin`), with the token of the file's `beforeAll`.
- **The fake Claude**: answers the Administrator's message.
- **The test itself**, reading the `assistant` table directly and, for the Administrator's count of
  the day, deleting from it.

## Before the block starts

The file's `beforeAll` signs in `admin`; what else it does concerns the blocks that use the
calendar, not this one.

**The block's `beforeAll`** removes `chat-nobody` if an earlier run left it, then creates it with
`createUserInNoGroup()`: straight in cognito-local, with a permanent password, in no group. The
API cannot make such an account, since `POST /users` always puts the new user in the group
`user`. Then it signs `chat-nobody` in.

## Tests 1 to 6: no token

Each of the six routes is called with no `Authorization` header (`POST /assistant/messages` with a valid body, the other three `POST`s with none, as they take none). The
test checks `401`. The handler never runs: the API answers before it, as for every route
(`docs/ARCHITECTURE.md` section 4, "Conventions").

## Tests 7 to 12: a token with no role

Each of the six routes is called with the token of `chat-nobody` (`POST /assistant/messages` with a valid body, the other three `POST`s with none). The
token is valid, so the request reaches the handler; the handler finds no role in it and refuses.
The test checks `403` and the body `{ error: "forbidden", message }`, the message being any text.

## Test 13: nothing stored

In the table, the test checks that the partition `CONV#<sub>` of `chat-nobody` is empty: the
refusal came before the conversation was read or written, for the message of test 9 too. The role is checked before the id of a proposal is looked at, so
tests 11 and 12 answer `403`, not `404`.

## Test 14: the Administrator's own conversation

1. The test deletes the Administrator's items of daily use in the table (`forgetDailyUse()`).
   `admin` is a seeded account, the same at every run, so its count of the day would grow run
   after run until the message below were refused with `429`. It is the only write the file makes
   to the table directly.
2. `admin` calls `DELETE /assistant/conversation`. The test checks `204`. A conversation left by
   an earlier run, or by hand, is ended.
3. `admin` sends `Hello, can you hear me?`. The test checks `200`, `language` `en`, and two
   messages: `seq` 1 from `person`, `seq` 3 from `assistant` with "Hello. I am the assistant of
   the shared calendar."
4. `admin` calls `DELETE /assistant/conversation` again. The test checks `204`.

## What the block leaves

`chat-nobody` is removed from cognito-local by the `afterAll`; it never had an item in the table.

The Administrator is left with no conversation: its `META` holds `conversationId` `null`. The
three messages of the ended conversation stay in its partition, with those of earlier runs. Its daily use for today says `messages` 1.

**Someone who was talking to the assistant as `admin` on the local stack loses that conversation
when this block runs**, and their count of the day starts again.

## If the block fails halfway

- A failed check skips the rest of its test only; the tests of this block do not depend on one
  another, but for test 13, which reads what tests 7 to 12 must not have written.
- If test 14 fails after the message, the Administrator's conversation is not ended. The next
  run's test 14 ends it first.
- The `afterAll` removes `chat-nobody` whatever happened, and the next run removes it again before
  creating it (`removeUserIfPresent()`, straight in cognito-local: no deleted-user marker, nothing
  of the calendar touched).

## Where in the code

| What | Where |
|---|---|
| The role check | `resolveRole()` of `shared/`, called on the token's claims before anything else by `backend/src/handlers/getConversation.ts`, `backend/src/handlers/endConversation.ts`, `backend/src/handlers/sendAssistantMessage.ts`, `backend/src/handlers/continueAssistant.ts`, `backend/src/handlers/confirmProposal.ts` and `backend/src/handlers/declineProposal.ts`: no role, `403 forbidden` |
| The `401` | the API, before any handler |
| Test helpers | in the file: `say()`, `startAgain()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `createUserInNoGroup()`, `subOf()`, `queryAssistantPartition()`, `forgetDailyUse()` |
| Constants | `NOBODY_PASSWORD`, `HELLO`, `HELLO_ANSWER`, `NO_PROPOSAL`; the file's `adminToken` |
