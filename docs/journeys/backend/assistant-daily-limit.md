# The "the daily limit (4.4, 6.1)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `the daily limit (4.4, 6.1)` |
| Tests | 1. "takes today's messages one by one, counting down to none left"<br>2. "refuses the next one with 429, and the conversation is as it was"<br>3. "a new conversation does not give the messages back" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- A person may send a fixed number of messages a day, and the one after is refused with
  `429 assistant_limit_reached` (`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 4.4 and 6.1;
  `docs/ARCHITECTURE.md` section 4, "The assistant's routes").
- The refusal changes nothing in the conversation.
- The count is the person's, not the conversation's: a new conversation does not reset it.

## Who takes part

- **`chat-limit`**: a throw-away User, who uses up a whole day of messages.
- **The Administrator** (`admin`): only creates `chat-limit`.
- **The fake Claude**: answers every message with its sentence for a text nobody scripted.

## Before the block starts

The file's `beforeAll` signs in `admin`. The block's `beforeAll` creates `chat-limit` again and
signs it in (`newUser()`), then calls `DELETE /assistant/conversation` and checks `204`.

`LIMIT` is what `local:up` wrote into `backend/env.local.json`, read by
`localDailyMessageLimit()`: 10 by default. The function in `sam local` reads the same file, so
the test and the server agree on the number. The block needs `LIMIT` at 40 or below: a
conversation is full at 40 messages, and above that the forty-first message of test 1 would be
refused for that reason instead.

## Test 1: the day's messages, one by one

`chat-limit` sends `LIMIT` messages, `Message 1 of today` to `Message <LIMIT> of today`, each with
`POST /assistant/messages`. After each one the test checks `200` and `remainingToday` equal to
`LIMIT` minus the messages sent so far. The last answer says 0.

All of them go into one conversation. The first also costs the language question.

## Test 2: one too many

1. `chat-limit` reads the conversation with `GET /assistant/conversation` and the test keeps the
   body as `before`. The test checks `status` `idle`, `remainingToday` 0, and `2 × LIMIT`
   messages: each message of the person and its answer.
2. `chat-limit` sends `One too many`. The test checks `429` and the body
   `{ error: "assistant_limit_reached", message }`, the message being any text.
3. It reads the conversation again. The test checks that the body equals `before`, field by
   field: the refused message was not saved.

The server checks the limit before it asks Claude anything, so the refusal costs nothing.

## Test 3: a new conversation is no way round

`chat-limit` calls `DELETE /assistant/conversation` (the test checks `204`) and sends
`Hello, can you hear me?`. The test checks `429`. Then it reads the conversation and checks the
empty reply with `remainingToday` 0: the refused message started no conversation.

## What the block leaves

`chat-limit` is removed from cognito-local by the `afterAll`. In the `assistant` table its items
stay, under a `sub` no account has any more: a `META` with no conversation (`conversationId`
`null`), the `3 × LIMIT` messages of the ended conversation (each message of the person, its line
of the application and its answer), and one item of daily use with `messages` equal to `LIMIT`.

## If the block fails halfway

- Test 1 stops at the first message that fails; the messages before it are sent. Test 2 then
  fails on `remainingToday` and stops before it sends `One too many`. Test 3 expects the day to be
  used up, and fails as well.
- The `afterAll` removes `chat-limit` whatever happened, and the next run removes it again before
  creating it, straight in cognito-local (`removeUserIfPresent()`: no deleted-user marker,
  nothing of the calendar touched). **This is what lets the block run many times a day**: the day's
  count is stored under the `sub`, and the new account has a new one.

## Where in the code

| What | Where |
|---|---|
| The route | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts` |
| The check | `sendMessage()` in `backend/src/assistant/exchange.ts`: the day's use against the limit, after the check that the conversation is waiting for the person and before the check of room in the conversation |
| The limit | `coreConfig()` in `backend/src/assistant/config.ts`, from `ASSISTANT_DAILY_MESSAGE_LIMIT`; `remaining()` in `backend/src/assistant/conversation.ts` |
| The count | `readDailyUse()` in `backend/src/lib/assistantDb.ts` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `startAgain()`, `none()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `localDailyMessageLimit()` |
| Constants | `LIMIT`, `HELLO` |
