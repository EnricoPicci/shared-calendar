# The "when Claude cannot answer (6.1, 7.4)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `when Claude cannot answer (6.1, 7.4)` |
| Tests | 1. "answers 503 when the spending limit of the Anthropic account is reached, keeps the message, and leaves the conversation waiting for its step"<br>2. "answers 503 when Anthropic is overloaded, keeps the message, and leaves the conversation waiting for its step"<br>3. "an outage in the middle of an exchange passes: continue fails once, then carries on from where the exchange was"<br>4. "answers again right after: the local stack does not remember a spending limit"<br>5. "counted every message that was saved, answered or not, and no continue" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Tests 1 and 2 are one `it.each` with two rows.

Ideas used here, explained once for all journeys:
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools).

## What this block proves

- When Claude cannot be asked, the route answers `503` with a code that says why:
  `assistant_budget_reached` for the spending limit of the Anthropic account,
  `assistant_unavailable` for an outage (`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 6.1 and
  7.4).
- The person's message is not lost: it is saved, and the conversation is left `working`, waiting
  for the step that did not happen (`docs/ARCHITECTURE.md` section 4, "The assistant's routes").
- While a step is waiting, another message is refused with `409 assistant_busy`.
- `POST /assistant/continue` is the way on after a `503`: it does the step that is waiting. While
  the trouble lasts it answers the same `503` and the step keeps waiting; once it has passed, the
  exchange carries on from where it was, and what was read before the outage is not read again.
- `continue` is not a message of the day: it counts nothing.
- The local stack forgets a spending limit at once (`docs/ARCHITECTURE.md` section 8), so the
  journeys after this one get their answers.

## Who takes part

- **`chat-down`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): only creates `chat-down`.
- **The fake Claude**: plays Anthropic refusing, for two sentences of its script, and for a third
  an outage that passes: it refuses a step once and answers it the second time.

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
4. `chat-down` calls `POST /assistant/continue`, which does the waiting step: the server asks
   Claude again with the conversation as stored. The fake answers a sentence the same way every
   time, so the error comes again. The test checks `503` with the same code and a message.
5. `chat-down` reads the conversation again. The test checks `status` `working` and the one
   message, `seq` 1, from `person`: nothing was lost and nothing was added.
6. `chat-down` calls `DELETE /assistant/conversation`, the other way out: it gives the step up.
   The test checks `204`. It also gives the next test a clean start.

The server asks Claude once and does not try again by itself: trying again is left to the
person, or to the screen.

## Test 3: an outage that passes

The sentence is `fake: an outage after the read`. The fake's script gives it two steps: at the
first Claude asks for the tool `get_settings`; the second is refused once, as overloaded, and
answered when the same request comes again, with the result of the tool as its text.

1. `chat-down` sends the sentence. The language question is answered, then the step: Claude asks
   to read the settings, the server reads them and saves the request and its result. The test
   checks `200`, `status` `working` and `activity` "Looking at the calendar's settings…".
2. `chat-down` calls `POST /assistant/continue`. The fake refuses this step. The test checks `503`
   and the code `assistant_unavailable`.
3. `chat-down` reads the conversation. The test checks `status` `working` and the same line of
   progress: the conversation still holds the read and waits for the same step.
4. `chat-down` calls `POST /assistant/continue` again. The request to Claude is the very same, and
   this time the fake answers. The test checks:
   - `200`, `status` `idle`, `activity` `null`;
   - one new message, `seq` 5, from `assistant`;
   - its text, read as JSON, holds a `timeZone` (a text) and `cancellationNoticeHours` (a number):
     it is the result of the read made in step 1.
5. In the table, the test checks that the conversation in progress holds five entries
   (`storedEntries()`, which leaves out the earlier conversations of the same partition), with the roles `user`,
   `system`, `assistant`, `user`, `assistant`: the message, the line of the application, Claude's
   request for the tool, the result, the answer. One request and one result: the failed step ran
   no read again and saved no entry.
6. `chat-down` calls `DELETE /assistant/conversation`. The test checks `204`.

Step 5 stands between two calls, as it does in the test.

## Test 4: the next message is answered

Right after the refusals, `chat-down` sends `Hello, can you hear me?`. The test checks `200`,
`status` `idle`, and two messages, from `person` and from `assistant`, the second with "Hello. I
am the assistant of the shared calendar."

In the cloud a function that saw the spending limit answers `assistant_budget_reached` for ten
minutes without asking Anthropic again. Test 1 would then make test 2 fail first (its language question would be refused as a spending
limit, and nothing saved), then test 3 and this message. The local stack
sets that memory to zero (`ASSISTANT_BUDGET_MEMORY_SECONDS` in `backend/env.local.json`), and
this test is the proof that it does.

## Test 5: what counts for the day

`chat-down` reads the conversation. The test checks `remainingToday` equal to `LIMIT` − 4: the
two messages that got a `503`, the one of test 3 and the one of test 4. A message counts when it
is saved, answered or not. The two messages refused with `409` were not saved and count nothing,
and neither do the four calls of `continue`: they are not messages.

## What the block leaves

`chat-down` is removed from cognito-local by the `afterAll`. In the `assistant` table its items
stay, under a `sub` no account has any more: a `META` holding the conversation of test 4, `idle`;
the messages of four conversations (two of them a message and its line of the application, with
no answer; one of five entries, from test 3); one item of daily use with `messages` 4.

The function remembers no spending limit, and the fake has forgotten the outage of test 3 once it
answered: the blocks after this one are not affected.

## If the block fails halfway

- A failed check in test 1 or 2 skips the rest of that test, the `DELETE` at its end included.
  When the `503` was answered, the conversation then stays `working`, and the next test's first
  message is refused with `409 assistant_busy` instead of what it expects: test 2 after test 1,
  test 3 after test 2. When the answer was a `200`, the conversation is `idle` and the next
  test's message goes into it: that test then finds other messages, or other `seq` numbers, than
  it expects. When nothing was saved (a `500`, or a `503` at the language question), the next
  test starts clean.
- If test 3 stops between its two calls of `continue`, the fake still remembers that it refused
  that request once. That request holds the time of that run, to the minute, so a later run does not send it again
  unless it reaches test 3 within that same minute;
  the memory is lost when the fake's container restarts. The conversation stays `working`, and
  test 4's message is refused with `409 assistant_busy`.
- Test 5 fails when any message before it was not saved.
- The `afterAll` removes `chat-down` whatever happened, and the next run removes it again before
  creating it, straight in cognito-local (`removeUserIfPresent()`: no deleted-user marker,
  nothing of the calendar touched). A conversation left `working` stays in the table under the
  old `sub` and is never met again.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; the status of each code in `REFUSALS`, `backend/src/assistant/conversation.ts` |
| Saving the message alone | `runStep()`, called by `sendMessage()` and by `continueExchange()`, in `backend/src/assistant/exchange.ts`: for the outcomes `budget_reached` and `unavailable` of `askStep()` it saves what the entry added (for `continue`, nothing) and leaves the status `working` |
| The read of test 3 | the tool `get_settings`, `backend/src/assistant/tools/getSettings.ts`, run by `runRead()` in `backend/src/assistant/tools/run.ts` |
| The line of progress after a read | `activityLine()` in `backend/src/assistant/conversation.ts`, with the texts `reading` of `shared/src/assistant/` |
| Which error is which | `askStep()` and the `send()` it calls in `backend/src/lib/anthropic.ts`, with the memory of a spending limit and its variable `ASSISTANT_BUDGET_MEMORY_SECONDS` |
| "Working…" | the text `working` of `assistantTexts()` in `shared/src/assistant/`, which `activityLine()` in `backend/src/assistant/conversation.ts` gives when no tool was asked for since the person's message; `showConversation()` passes it to `replyOf()` |
| The fake's errors | the three sentences in `backend/tests/integration/fake-claude/answers.json`; the step that fails once, `onceThen()` in `backend/docker/fake-claude.mjs` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `startAgain()`, `goOn()`, `storedEntries()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `localDailyMessageLimit()`, `subOf()`, `queryAssistantPartition()` |
| Constants | `HELLO`, `HELLO_ANSWER`, `LIMIT` |
