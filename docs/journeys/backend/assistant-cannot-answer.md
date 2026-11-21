# The "when Claude cannot answer (6.1, 7.4)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `when Claude cannot answer (6.1, 7.4)` |
| Tests | 1. "answers 503 when the spending limit of the Anthropic account is reached, keeps the message, and leaves the conversation waiting for its step"<br>2. "answers 503 when Anthropic is overloaded, keeps the message, and leaves the conversation waiting for its step"<br>3. "answers again right after: the local stack does not remember a spending limit"<br>4. "counted the two messages that got no answer: they were saved" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Tests 1 and 2 are one `it.each` with two rows.

Ideas used here, explained once for all journeys:
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- When Claude cannot be asked, the route answers `503` with a code that says why:
  `assistant_budget_reached` for the spending limit of the Anthropic account,
  `assistant_unavailable` for an outage (`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 6.1 and
  7.4).
- The person's message is not lost: it is saved, and the conversation is left `working`, waiting
  for the step that did not happen (`docs/ARCHITECTURE.md` section 4, "The assistant's routes").
- While a step is waiting, another message is refused with `409 assistant_busy`.
- The local stack forgets a spending limit at once (`docs/ARCHITECTURE.md` section 8), so the
  journeys after this one get their answers.

## Who takes part

- **`chat-down`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): only creates `chat-down`.
- **The fake Claude**: plays Anthropic refusing, for two sentences of its script.

## Before the block starts

The file's `beforeAll` signs in `admin`. The block's `beforeAll` creates `chat-down` again and
signs it in (`newUser()`), then calls `DELETE /assistant/conversation` and checks `204`.

## Tests 1 and 2: a 503, twice

The same story with two sentences:

| Test | `chat-down` writes | The fake answers the step with | The code checked |
|---|---|---|---|
| 1 | `fake: a spending limit of our own` | the error Anthropic gives when the account's own spending limit is reached | `assistant_budget_reached` |
| 2 | `fake: overloaded` | the error Anthropic gives when it is overloaded | `assistant_unavailable` |

1. `chat-down` sends the sentence with `POST /assistant/messages`. There is no conversation, so
   the server first asks the language; the fake answers English, without error. Then the server
   asks for the step, and the fake answers the error. The test checks `503` and the body
   `{ error: <the code>, message }`, the message being any text.
2. `chat-down` reads the conversation with `GET /assistant/conversation`. The test checks:
   - a `conversationId`, and `language` `en`: the conversation was started;
   - `status` `working`, and `activity` "Working…", the line of progress in the conversation's
     language;
   - exactly one message: `seq` 1, from `person`, with the sentence sent. No answer follows it.
3. `chat-down` sends `Hello, can you hear me?`. The test checks `409 assistant_busy`: the step of
   the first message is still to do, and no other message is taken meanwhile.
4. `chat-down` calls `DELETE /assistant/conversation`. The test checks `204`. This is the way on
   that exists: no route does a waiting step yet. It also gives test 2 a clean start.

The server asks Claude once and does not try again by itself: trying again is left to the
person, or to the screen.

## Test 3: the next message is answered

Right after the two refusals, `chat-down` sends `Hello, can you hear me?`. The test checks `200`,
`status` `idle`, and two messages, from `person` and from `assistant`, the second with "Hello. I
am the assistant of the shared calendar."

In the cloud a function that saw the spending limit answers `assistant_budget_reached` for ten
minutes without asking Anthropic again. Test 1 would then make this message fail. The local stack
sets that memory to zero (`ASSISTANT_BUDGET_MEMORY_SECONDS` in `backend/env.local.json`), and
this test is the proof that it does.

## Test 4: the unanswered messages count

`chat-down` reads the conversation. The test checks `remainingToday` equal to `LIMIT` − 3: the
two messages that got a `503` and the one of test 3. A message counts when it is saved, answered
or not. The two messages refused with `409` were not saved and count nothing.

## What the block leaves

`chat-down` is removed from cognito-local by the `afterAll`. In the `assistant` table its items
stay, under a `sub` no account has any more: a `META` holding the conversation of test 3, `idle`;
the messages of three conversations (two of them a message and its line of the application, with
no answer); one item of daily use with `messages` 3.

The fake keeps nothing between two requests, and the function remembers no spending limit: the
blocks after this one are not affected.

## If the block fails halfway

- A failed check in test 1 or 2 skips the rest of that test, the `DELETE` at its end included.
  When the `503` was answered, the conversation then stays `working`, and the next test's first
  message is refused with `409 assistant_busy` instead of what it expects: test 2 after test 1,
  test 3 after test 2. When the answer was not a `503`, the conversation is `idle` and the next
  test's message goes into it: that test then finds more messages than it expects.
  Test 4 fails when any message before it was not saved.
- The `afterAll` removes `chat-down` whatever happened, and the next run removes it again before
  creating it, straight in cognito-local (`removeUserIfPresent()`: no deleted-user marker,
  nothing of the calendar touched). A conversation left `working` stays in the table under the
  old `sub` and is never met again.

## Where in the code

| What | Where |
|---|---|
| The route | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; the status of each code in `REFUSALS`, `backend/src/assistant/conversation.ts` |
| Saving the message alone | `runStep()`, called by `sendMessage()`, in `backend/src/assistant/exchange.ts`: for the outcomes `budget_reached` and `unavailable` of `askStep()` it saves what the person added and leaves the status `working` |
| Which error is which | `askStep()` and the `send()` it calls in `backend/src/lib/anthropic.ts`, with the memory of a spending limit and its variable `ASSISTANT_BUDGET_MEMORY_SECONDS` |
| "Working…" | `assistantTexts()` in `shared/src/assistant/`, used by `replyOf()` in `backend/src/assistant/conversation.ts` |
| The fake's errors | the two sentences in `backend/tests/integration/fake-claude/answers.json` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `startAgain()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `localDailyMessageLimit()` |
| Constants | `HELLO`, `HELLO_ANSWER`, `LIMIT` |
