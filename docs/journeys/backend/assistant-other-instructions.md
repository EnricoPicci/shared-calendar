# The "a conversation started under other instructions is over (4.3)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a conversation started under other instructions is over (4.3)` |
| Tests | 1. "a conversation holds a read of the settings, and Claude is sent it again with the next message"<br>2. "once its stored mark is another, the conversation is over: nothing to read, nothing to continue, the count of the day kept"<br>3. "the next message starts a new conversation, and Claude is sent nothing of the old one"<br>4. "the old messages stay in the table until they expire, and no route gives them" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the settings](../concepts.md#the-settings),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- A conversation is stored with a mark of the instructions and tools it started under. When
  the mark of the deployment is another, the conversation is over: the routes answer as if the
  person had none, and the next message starts a new one
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.3).
- Claude is sent the whole stored conversation again with every message, and nothing of a
  conversation that is over (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.3).
- Nothing is deleted: the old messages stay in the table, where no route asks for them
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 9; `docs/ARCHITECTURE.md` section 5.4).
- The day's count is the person's, not the conversation's, and is kept
  (`docs/ARCHITECTURE.md` section 5.4: the daily use is an item of its own, `USAGE#<sub>`).

## Who takes part

- **`chat-mark`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): only creates `chat-mark`.
- **The fake Claude**: for the first sentence it asks for the tool `get_settings`, then answers
  with the result of that tool, word for word. For the second sentence it answers with the last
  result of a tool that the request holds, or with "(no result of a tool in the request)" when
  the request holds none. That is how the block reads whether an earlier conversation was sent
  to Claude.
- **The test itself**, once: it writes another mark on the stored conversation, straight in
  the table. See the background below.

## Before the block starts

The file's `beforeAll` signs in `admin`; what else it does concerns the blocks that use the
calendar, not this one. The block's `beforeAll` creates `chat-mark` again and signs it in
(`newUser()`), keeps its `sub`, then calls `DELETE /assistant/conversation` and checks `204`.

The block prepares nothing in the calendar: it only reads the settings, whatever they are.

## Test 1: a conversation that holds a read

1. `chat-mark` sends `fake: read the settings of the mark journey` (the helper
   `sayAndRead()`). There is no conversation yet, so the server asks the language: English.
   Then it asks Claude for the step; the fake asks for `get_settings`, the server runs the read
   as `chat-mark` and leaves the conversation `working`. The helper checks that `proposal` is
   `null`.
2. The helper calls `POST /assistant/continue`. The fake answers with the settings as its text,
   and the helper checks `200`. The test checks that one step read, and keeps the
   `conversationId` as the old one.
3. `chat-mark` sends `fake: what was the last result you were given?`. The server sends Claude
   the conversation as stored, the request for the tool and its result included, with the new
   message after it. The fake finds the result of `get_settings` in the request and answers
   with it.

The test checks, on the answer of step 3:

- `200`, the same `conversationId`, `remainingToday` equal to `LIMIT` − 2;
- the text of its last message is JSON with `timeZone` `Europe/Rome`: the settings, as Claude
  was given them two requests earlier.

In the table, the test checks that the `META` item of `chat-mark` carries `promptVersion`, sixteen
hexadecimal characters. It keeps that mark.

The conversation now holds eight entries:

| `seq` | What | The person reads it |
|---|---|---|
| 1 | the first sentence | yes |
| 2 | the line of the application | no |
| 3 | Claude's request for `get_settings` | no |
| 4 | the result | no |
| 5 | Claude's answer, the settings | yes |
| 6 | the second sentence | yes |
| 7 | the line of the application | no |
| 8 | Claude's answer, the settings again | yes |

## Test 2: another mark, and the conversation is over

The test writes the mark `another-mark-000` on the `META` item of `chat-mark`
(`setStoredPromptVersion()`), and nothing else. Every request works out the mark of the
deployment and compares it with the stored one (`currentConversation()`); they now differ, so
the conversation is given as absent.

1. `chat-mark` reads the conversation with `GET /assistant/conversation`. The test checks the
   empty reply with `remainingToday` `LIMIT` − 2: no conversation, and the two messages of the
   day still counted.
2. `chat-mark` calls `POST /assistant/continue`. The test checks `409 nothing_to_continue`.

In the table, the test checks that the `META` item still names the old conversation and the
mark `another-mark-000`: the two requests changed nothing.

## Test 3: the next message starts a new conversation

`chat-mark` sends `fake: what was the last result you were given?` again, the sentence of test
1, step 3. This time the server finds no conversation for the request: it asks the language,
then sends Claude the message and its line of the application alone. The fake finds no result
of a tool in the request and says so. The server writes the `META` item anew, with a new
`conversationId` and the mark of the deployment (`startConversation()`).

The test checks:

- `200`, a `conversationId` other than the old one;
- `language` `en`, `status` `idle`, `remainingToday` equal to `LIMIT` − 3;
- exactly two messages: `seq` 1 from `person` with the sentence, `seq` 3 from `assistant` with
  "(no result of a tool in the request)".

In the table, the test checks that:

- the `META` item names the new conversation, with `promptVersion` equal to the mark kept in
  test 1, `messageCount` 1 and `nextSeq` 4;
- the conversation in progress holds three entries (`storedEntries()`), with the roles `user`,
  `system`, `assistant`.

## Test 4: the old messages are still there

`chat-mark` reads the conversation, and the test checks that it has two messages: those of
the new conversation. The old ones are stored and no route gives them: the server asks the
table only for the messages of the conversation the `META` item names (`readConversation()`).

In the table, the test checks (before that read, in its code) that the partition of `chat-mark`
holds at least one message item of the old conversation (`SK` beginning `MSG#<the old id>#`).

## What the block leaves

`chat-mark` is removed from cognito-local by the `afterAll`. In the `assistant` table its items
stay, under a `sub` no account has any more: a `META` that names the second conversation, still
in progress, with its three messages; the eight messages of the first conversation; and one
item of daily use with `messages` 3. Nothing is left in the `calendar` table.

## If the block fails halfway

- The tests build on one another: test 2 needs the conversation of test 1 and its
  `conversationId`, test 3 the mark kept at the end of test 1, test 4 the old id. A failed
  test 1 takes the later ones down. `setStoredPromptVersion()` itself fails when `chat-mark`
  has no stored conversation.
- Should the write of test 2 not happen, the message of test 3 goes into the old conversation
  and the fake answers with the settings: test 3 fails on the `conversationId` and on the text.
- The block needs three of the day's messages: `LIMIT` at 3 or above.
- The `afterAll` removes `chat-mark` whatever happened, and the next run removes it again
  before creating it, straight in cognito-local (`removeUserIfPresent()`: no deleted-user
  marker, nothing of the calendar touched). The new account has a new `sub`, so a conversation
  left with the other mark is never met again.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `GET` and `DELETE /assistant/conversation`: `backend/src/handlers/getConversation.ts`, `backend/src/handlers/endConversation.ts` |
| The mark | `promptVersion()` in `backend/src/assistant/prompt.ts`: the first sixteen hexadecimal characters of a SHA-256 hash of the instructions, the block about the person and the tools offered |
| The comparison | `currentConversation()` in `backend/src/assistant/conversation.ts`, called by `showConversation()`, by `sendMessage()` and `continueExchange()` of `backend/src/assistant/exchange.ts`, and by the confirmation and the decline of a proposal (`backend/src/assistant/confirm.ts`, `backend/src/assistant/decline.ts`), which this block does not call |
| The new conversation | `runStep()` in `backend/src/assistant/exchange.ts`, which calls `startConversation()` of `backend/src/lib/assistantDb.ts` when the request has no conversation; `readConversation()` there asks only for the messages of the conversation `META` names |
| The tool | `get_settings`, run by `runRead()` in `backend/src/assistant/tools/run.ts`; what Claude gets: `settingsForModel()` in `backend/src/assistant/tools/result.ts` |
| The fake's answers | the two sentences, `tool-get-settings` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the mark `{{last-tool-result}}` in `backend/docker/fake-claude.mjs` |
| Test helpers | in the block: `meta()`; in the file: `newUser()`, `say()`, `goOn()`, `sayAndRead()`, `conversation()`, `startAgain()`, `storedEntries()`, `none()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `setStoredPromptVersion()`, `localDailyMessageLimit()` |
| Constants | the block's `USER`, `ASK`, `ASK_LAST`, `NO_RESULT`, `OTHER_MARK`; `LIMIT` |

## Background: the mark, and why the test writes it

Claude's stored answers are accepted back by Anthropic only after the text they were given
under. So a conversation is valid only under the instructions, the block about the person
(username, role, time zone) and the tools it started with, and the server stores a mark of the
three on the `META` item, as `promptVersion` (`docs/CONVERSATIONAL_ARCHITECTURE.md` section
4.3). The mark is worked out, not written by hand: a deployment that changes the instructions
or a tool changes it, and every conversation in progress ends.

No route can produce that state, and a journey cannot deploy other instructions. So the test
changes the other side of the comparison: it writes on the stored conversation a mark no
deployment works out, sixteen characters that are not hexadecimal. It is one of the two writes
the journeys make to the `assistant` table directly; `setStoredPromptVersion()` refuses to write
when the person has no stored conversation.
