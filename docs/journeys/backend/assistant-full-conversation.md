# The "a conversation filled to its bound (4.4, 9)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a conversation filled to its bound (4.4, 9)` |
| Tests | 1. "one message, step after step: the conversation grows with every step until it is full, and the exchange is stopped there with the fixed sentence"<br>2. "each answer asked for six reads: five were run, each cut at 6 KB, and the sixth was told to ask again"<br>3. "the next message is refused: conversation_full, and nothing is stored or counted for it"<br>4. "the full conversation can still be read, whole"<br>5. ""New conversation" ends it, and the next message starts an empty one" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit),
[a full conversation](../concepts.md#a-full-conversation).

## What this block proves

- A conversation is full when what is stored of it reaches 100 KB, and a message sent to a
  full conversation is refused with `409 conversation_full`
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.4; `docs/ARCHITECTURE.md` section 4, "The
  assistant's routes").
- One message cannot go on filling a conversation step after step: the size is looked at again
  after each step that reads, and the exchange is stopped with a fixed sentence when the bound
  is reached (`docs/ARCHITECTURE.md` section 4, "The assistant's routes";
  `ASSISTANT_LIMITS.conversationBytes` in `shared/src/assistant/limits.ts`).
- A result of a tool is cut at 6 KB (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.3), and
  only the first five reads of one answer of Claude are run
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.4; `ASSISTANT_LIMITS.readsPerAnswer`).
- A full conversation can still be read and ended, and the next message starts a new, small
  one. The stored size the block looks at is `storedBytes` of the `META` item
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 9).

## Who takes part

- **`chat-full`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): creates `chat-full`, and prepares and removes the month of
  calendar the block reads.
- **The fake Claude**: for the block's sentence it answers every step in the same way, with six
  requests for the tool `get_calendar`, each for the same 31 days. No model would send that:
  the answer is written by hand, to fill a conversation with the largest results a User's tools
  give.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run left in the calendar
under each name of `JOURNEY_TYPES`, this block's `assistant filling journey` among them
(`removeFromCalendar()`). The block's `beforeAll`:

1. creates `chat-full` again and signs it in (`newUser()`), and keeps its `sub`;
2. removes again what its own earlier run may have left (`removeFromCalendar()`);
3. works out the month: from the day after today to the day 31 days after today
   (`dayOfJourney(1)`, `dayOfJourney(31)`), the dates the fake's script names `{{date+1}}` and
   `{{date+31}}`;
4. creates the type `assistant filling journey` and fourteen weekly patterns of that type, two
   for each weekday, 00:00–02:00 and 02:00–04:00, each valid from the first day of the month to
   the last. It checks `201` for the type and for each pattern.

So every day of the month has two windows in the first four hours of the day, hours no other
block of the file uses. A month of such days, as a User is given it, weighs more than one result
may: each read of the block comes back cut, which test 2 checks.

`chat-full` has no conversation: the account is new. The `calendar` table is not emptied.

## Test 1: one message, until the conversation is full

`chat-full` sends `fake: read the month of the filling journey six times over`, once, and then
calls `POST /assistant/continue` for as long as the answer says `working`.

1. There is no conversation yet, so the server asks the language: English.
2. The server asks Claude for the step. The fake answers with six requests for `get_calendar`,
   from the first day of the month to the last.
3. The server looks at the first five (`runStep()` in `backend/src/assistant/exchange.ts`): it
   runs each by calling the code of `GET /calendar` as `chat-full`, and cuts each result at
   6 000 bytes (`cappedJson()`). The sixth is not run: its result is an error, `too_many_reads`,
   with a sentence that tells Claude to ask again in its next answer.
4. The server looks at the size: what was stored before plus what this step adds. Under
   100 000 bytes, it leaves the conversation `working`. It saves Claude's answer, the six
   results and that status in one write.
5. `continue`: the fake gives the same six requests again, and the conversation grows by about
   as much again.
6. At the step that brings the stored size to 100 000 bytes or more, the server still saves the
   results, adds the notice "This conversation is full. To continue, start a new one." and
   leaves the conversation `idle`: it waits for the person, not for another step.

With what the block prepared, this happens before the eight requests to Claude that one message
may take: a step stores five results of more than 5 500 bytes each (test 2), more than a
quarter of the bound, so the fourth step at the latest fills the conversation.

A result weighs more in the table than its 6 000 bytes. It is a JSON text, kept inside the JSON
text of its entry, where each of its quotation marks takes two bytes.

The test checks:

- while the answer is `200` and `working`: `activity` "Looking at the calendar…";
- the last answer: `200`, `status` `idle`, `activity` `null`, `proposal` `null`,
  `remainingToday` equal to `LIMIT` − 1: the whole exchange is one message of the day;
- the last of its messages is from `notice`, with the text `conversationFull` of
  `shared/src/assistant/texts.en.ts`;
- the requests it made, the message and each `continue`, are fewer than 8
  (`ASSISTANT_LIMITS.modelRequestsPerMessage`): the exchange stopped for its size, not for its
  number of steps.

In the table, the test checks that the stored size of the conversation (`storedBytes` of the
`META` item, read by `weighAssistant()` after each request):

- was under 100 000 after the step before the last;
- is 100 000 or more after the last;
- is under 160 000: over the bound by less than one step can add, counted as twice the cut for
  each of the five reads.

## Test 2: six reads asked for, five run

Nothing is sent. In the table, the test checks that the conversation of `chat-full` holds as
many entries of results (`storedEntries()`: role `user`, with a list as content) as test 1
made requests, and that in each of them:

- there are six results;
- each of the first five is at most 6 000 bytes long and more than 5 500, is JSON with a field
  `cut` that holds "This result was too long", and holds the name `assistant filling journey`;
- the sixth is marked as an error (`is_error` `true`) and is JSON with `error`
  `too_many_reads`.

A result that is cut loses whole days from its end, and gains the line `cut`, which says how
many of the days are there and to ask for a shorter period.

## Test 3: the next message is refused

`chat-full` sends `Hello, can you hear me?`. The server checks, in order, that no step waits,
that the day has messages left, and that the conversation has room (`sendMessage()`): it has
none, and Claude is not asked.

The test checks `409` and the body `{ error: "conversation_full", message }`, the message being
any text. Then `chat-full` calls `POST /assistant/continue`, and the test checks `409
nothing_to_continue`: no step waits either.

In the table, the test checks that the stored size is the same after the refused message as
before it. That it counted nothing for the day is seen in test 4.

## Test 4: the full conversation, read back

`chat-full` reads the conversation with `GET /assistant/conversation`. The test checks:

- `200`, the `conversationId` of test 1, `status` `idle`, `remainingToday` still `LIMIT` − 1;
- exactly two messages, from `person` and from `notice`;
- the first has `seq` 1 and the block's sentence, the second the text `conversationFull`.

Of everything stored, the person reads two lines. Claude's answers hold requests and no words,
and the line of the application and the results never leave the server.

## Test 5: "New conversation"

1. `chat-full` calls `DELETE /assistant/conversation`. The test checks `204`.
2. It reads the conversation. The test checks the empty reply with `remainingToday`
   `LIMIT` − 1.
3. It sends `Hello, can you hear me?`. The server finds no conversation, asks the language and
   then Claude, and the fake answers its greeting. The test checks `200`, a `conversationId`
   other than that of test 1, `status` `idle`, two messages (`seq` 1 from `person` with the
   text sent, `seq` 3 from `assistant` with "Hello. I am the assistant of the shared
   calendar.") and `remainingToday` equal to `LIMIT` − 2.

In the table, the test checks that the stored size of the new conversation is under 5 000
bytes: nothing of the full one came with it.

## What the block leaves

The `afterAll` removes the fourteen patterns and the type (`removeFromCalendar()`), checks that
no weekly pattern of the type is left, and removes `chat-full` from cognito-local. The
`calendar` table holds nothing of the block but the calendar lock, which its writes moved on:
the block books nothing.

In the `assistant` table the items of `chat-full` stay, under a `sub` no account has any more:
a `META` that names the second conversation, still in progress, with its three messages; the
messages of the full conversation, which nothing asks for any more; and one item of daily use
with `messages` 2.

The `afterAll` also hands the measurements to `reportAssistantCosts()`: see the background
below.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when a pattern cannot be created: for example
  when something else opens hours between 00:00 and 04:00 on a day of the month. No block of
  this file does; a calendar seeded by hand may.
- The tests build on one another. Tests 2, 3 and 4 need the full conversation of test 1, and
  tests 2 and 3 use the sizes the requests before them left; tests 4 and 5 use the id of the
  full conversation. A test 1 that stops
  before the conversation is full takes the later ones down.
- Test 2 only reads. A failed check in it changes nothing for the tests after it.
- The `afterAll` removes the patterns, the type and `chat-full` whatever happened. If the run
  is stopped before it, the next run removes the patterns and the type first, by the name
  `assistant filling journey`, in the file's `beforeAll` and again in the block's, and creates
  `chat-full` again: a new account has a new `sub`, so it starts with no conversation.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `GET` and `DELETE /assistant/conversation`: `backend/src/handlers/getConversation.ts`, `backend/src/handlers/endConversation.ts` |
| The refusal | `sendMessage()` in `backend/src/assistant/exchange.ts`: `messageCount` and `storedBytes` of the conversation against `ASSISTANT_LIMITS`, after the check of the day's use; `conversation_full` in `REFUSALS`, `backend/src/assistant/conversation.ts` |
| The stop after a step | `runStep()` in `backend/src/assistant/exchange.ts`: after the results of the reads, first the count of requests to Claude, then the stored size with this step's messages (`storedBytesOf()`), which adds the notice |
| The reads of one answer | `runStep()`: the requests that are not changes are counted, and those after the fifth get `notRun()` of `backend/src/assistant/tools/run.ts` with `too_many_reads` |
| The limits | `conversationBytes`, `readsPerAnswer`, `modelRequestsPerMessage` in `ASSISTANT_LIMITS`, `shared/src/assistant/limits.ts` |
| The cut | `cappedJson()` and `RESULT_CAP_BYTES` in `backend/src/assistant/tools/result.ts`; the days of a result: `backend/src/assistant/tools/getCalendar.ts` |
| The stored size | `messageItems()`, `startConversation()` and `saveStep()` in `backend/src/lib/assistantDb.ts`: the bytes of each `content` as the JSON text it is stored as, added up in `storedBytes` |
| The fixed sentence | `conversationFull` in `shared/src/assistant/texts.en.ts` |
| The fake's answers | the sentence and `tool-get-calendar-month-six-times` in `backend/tests/integration/fake-claude/answers.json`; the marks in `backend/docker/fake-claude.mjs` |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/patterns`, `DELETE /calendar/patterns/{patternId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/patterns`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin` |
| Test helpers | in the block: `measured()`; in the file: `newUser()`, `say()`, `goOn()`, `conversation()`, `startAgain()`, `storedEntries()`, `none()`, `dayOfJourney()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `weighAssistant()`, `assistantStepCost()`, `reportAssistantCosts()`, `itemBytes()`, `localDailyMessageLimit()` |
| Constants | the block's `TYPE`, `USER`, `ASK`, `FULL`, `RESULT_CAP`; `JOURNEY_TYPES`, `HELLO`, `HELLO_ANSWER`, `LIMIT` |

## Background: what each request cost the table

Every request of tests 1, 3, 4 and 5 that the block makes through `measured()` is weighed.
Before and after it, `weighAssistant()` reads the items of `chat-full` in the `assistant` table
as the functions read them, and asks DynamoDB Local what the reads consumed.
`assistantStepCost()` works out from the two what the request read and wrote, in bytes and in
DynamoDB's read and write units. The sizes the tests compare are the `storedBytes` these
readings give.

None of the costs is asserted: DynamoDB Local is an emulator, and its count is no contract. The
`afterAll` writes them, one line of JSON for each request, to the file named by the environment
variable `ASSISTANT_CAPACITY_FILE`; without the variable nothing is written.
