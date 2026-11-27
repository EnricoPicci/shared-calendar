# The "the language of a conversation (4.2)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `the language of a conversation (4.2)` |
| Tests | 1. "is set by the first message: Italian"<br>2. "stays Italian when the person then writes in English: Claude is told so again"<br>3. "is asked again for a new conversation: English this time"<br>4. "a first message in none of the languages, from a page in Italian: an Italian conversation, told its notes"<br>5. "the same from a page that sends no language: an English one"<br>6. "a language not of the list is refused, and nothing is started" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- The first message of a conversation sets its language
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.2).
- Writing later in the other language does not switch it: at every message the server tells
  Claude the conversation's language again, as an instruction of the application
  (`docs/ARCHITECTURE.md` section 4, "The assistant's routes").
- The language belongs to the conversation, not to the person: a new conversation is asked again.
- A first message in none of the calendar's languages takes the language the page sent with it,
  English when the page sent none; the line after that first message carries the notes of the
  language, how to address the person and the application's own words
  (`docs/MULTILANGUAGE_ARCHITECTURE.md` section 9).
- The route refuses a language that is not one of the list, before anything is asked or stored.

## Who takes part

- **`chat-lingua`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): only creates `chat-lingua`.
- **The fake Claude**: answers the language question and the messages from its script. For
  the German sentence of tests 4 to 6 its script answers the language question with `none`, as
  the real model is told to for a language the calendar does not have.

## Before the block starts

The file's `beforeAll` signs in `admin`; what else it does concerns the blocks that use the
calendar, not this one. The block's `beforeAll` creates `chat-lingua` again and
signs it in (`newUser()`: `removeUserIfPresent()`, `POST /users` checked `201`, `setPasswordOf()`,
`signIn()`), then
calls `DELETE /assistant/conversation` and checks `204`. A new account has no conversation, so the
block does not depend on the block before it.

## Test 1: Italian, from the first message

`chat-lingua` sends `Buongiorno, mi sente?` with `POST /assistant/messages`. There is no
conversation, so the server asks Claude for the language first; the fake's script says Italian
for this text. The test checks `200`, `language` `it`, and two messages: `seq` 1 from `person`
with the text sent, `seq` 3 from `assistant` with "Buongiorno. Sono l'assistente del calendario
condiviso."

## Test 2: an English message in the Italian conversation

`chat-lingua` sends `fake: say the line of the application`, an English sentence. For this text
the fake answers with the line of the application it received in the request, after the words
"The application told me: ". It is the journey's way of seeing what the server told Claude, which
a reply never shows.

The test checks:

- `200`, and `language` still `it`;
- the text of the message from `assistant` starts with "The application told me: Now it is ";
- it contains "The language of this conversation is Italian: answer in Italian, whatever language
  the person writes in.";
- `GET /assistant/conversation` answers `language` `it` too.

The fake does not answer in Italian here: it is a script, not a model. The block proves that the
instruction reaches Claude, not that a model obeys it.

No language question is asked for this message: the server asks it only when it starts a
conversation.

## Test 3: a new conversation, English

`chat-lingua` calls `DELETE /assistant/conversation` (the test checks `204`), then sends
`Hello, can you hear me?`. The server starts a new conversation and asks for the language again;
the fake says English. The test checks `language` `en` and two messages numbered 1 and 3, the
second with "Hello. I am the assistant of the shared calendar."

## Test 4: a German first message, from a page in Italian

`chat-lingua` ends the conversation (`DELETE /assistant/conversation`, `204`), then sends
`Guten Tag, hören Sie mich?` with the field `language` `it` beside the text, as the page sends
its own language. The server asks the language question; the fake's script answers `none`. The
server then takes the page's language. For this text the fake answers with the line of the
application, as in test 2. The test checks:

- `200`, and `language` `it`;
- the line says "The language of this conversation is Italian: answer in Italian";
- it holds the notes of Italian that follow a first message: the formal "lei", and
  `"orario settimanale"`, one of the application's three words for the opening hours.

## Test 5: the same, from a page that sends no language

`chat-lingua` ends the conversation again and sends the same German sentence with no `language`
field, as an older page would. The fake answers `none` again; the server takes English. The test
checks `200`, `language` `en`, and a line that says "The language of this conversation is
English: answer in English" and holds `"weekly pattern"`, the English word of the notes.

## Test 6: a language the calendar does not have

`chat-lingua` ends the conversation and sends the German sentence with `language` `de`. The test
checks `400` with the error `invalid_request`, and that `GET /assistant/conversation` then
answers `conversationId` null: the body is checked before the language question, so nothing was
asked, started or counted.

## What the block leaves

`chat-lingua` is removed from cognito-local by the `afterAll`. In the `assistant` table its items
stay, under a `sub` no account has any more: a `META` naming no conversation, `idle` (test 6 left
it so); the six messages of the Italian conversation and the three of each of the other three;
one item of daily use with `messages` 5 (the refused message of test 6 is not counted).

## If the block fails halfway

- A failed check skips the rest of its test only. Test 2 needs the Italian conversation of test
  1: if test 1 did not start one, test 2 fails on the language. Tests 3 to 6 each end whatever
  conversation there is and stand on their own.
- The `afterAll` removes `chat-lingua` whatever happened, and the next run removes it again
  before creating it, straight in cognito-local (`removeUserIfPresent()`: no deleted-user marker,
  nothing of the calendar touched). The new account has a new `sub`, so nothing of a failed run
  is seen again.

## Where in the code

| What | Where |
|---|---|
| The route | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`, then `sendMessage()` in `backend/src/assistant/exchange.ts`, which asks the language only when there is no conversation |
| The language question | `askLanguage()` in `backend/src/lib/anthropic.ts`, which answers null for `none` |
| The page's language | the optional field `language` of `AssistantMessageBody` in `shared/src/assistant/schemas.ts` |
| The line of the application | `timeLine()` in `backend/src/assistant/prompt.ts`; the notes of each language in `shared/src/assistant/texts.en.ts` and `texts.it.ts` |
| The fake's part | `withApplicationLine()` in `backend/docker/fake-claude.mjs`; the texts and the languages in `backend/tests/integration/fake-claude/answers.json` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `startAgain()`; in `backend/tests/integration/setup.ts`: `api()`, `setPasswordOf()`, `signIn()`, `removeUserIfPresent()` |
| Constants | `HELLO`, `HELLO_ANSWER` |
