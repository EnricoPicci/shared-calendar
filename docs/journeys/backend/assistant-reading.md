# The "reading the calendar (5.1, 8)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `reading the calendar (5.1, 8)` |
| Tests | 1. "a question that needs the calendar: Claude asks to read, the read is run, and the answer is "working" with the line of that read"<br>2. "the conversation, read back, says the same line while the step waits"<br>3. "another message while the step waits is refused: busy"<br>4. "continue does the next step: Claude answers from what the calendar gave, the window and the free slots of the journey"<br>5. "stored the exchange as five entries, of which the person reads two, and counted one message"<br>6. "continue with nothing to continue is refused, with a conversation that waits for the person and with none" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[availability types](../concepts.md#availability-types),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[windows and slots](../concepts.md#windows-and-slots),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- The assistant answers from the calendar: when Claude asks for a read, the server runs it with
  the person's identity, answers `working`, and `POST /assistant/continue` does the next step
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.1; `docs/ARCHITECTURE.md` section 4, "The
  assistant's routes").
- What Claude is given is small and in local time: a window as its two wall-clock times and the
  name of its type, the free slots as start times, no id
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.3).
- While a step waits, a new message is `409 assistant_busy`; `continue` with no step waiting is
  `409 nothing_to_continue` (`docs/ARCHITECTURE.md` section 4, "The assistant's error codes").
- The whole exchange is one message of the day: `continue` counts nothing
  (`docs/ARCHITECTURE.md` section 4, "The assistant's routes").

## Who takes part

- **`chat-read`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): creates `chat-read`, and prepares and removes the piece of
  calendar the block reads.
- **The fake Claude**: for the block's sentence it first asks for the tool `get_calendar`, then
  answers with the result of that tool, word for word.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any of the four
blocks that use the calendar left on a day still to come (`removeFromCalendar()` for each name of
`JOURNEY_TYPES`). The block's `beforeAll`:

1. works out **the day** (`dayOfJourney(25)`): 25 days after today's date in the calendar's
   time zone, which it reads from the settings as `admin`. It is the day the fake asks for: its script names it `{{date+25}}`,
   counted from the date the server tells Claude at the message of test 1. The two agree unless
   local midnight falls between the `beforeAll` and test 1;
2. creates `chat-read` again and signs it in (`newUser()`);
3. removes again what its own earlier run may have left (`removeFromCalendar()`): on every day
   from tomorrow to 28 days ahead, every one-off window whose type is named `assistant journey`,
   then every type of that name. The helper first cancels the booked appointments of that type;
   this block books none;
4. creates the type `assistant journey` and, on the day, a one-off window 05:00–07:00 of that
   type (`openWindow()`), and checks `201` for both. It keeps their ids.

The window gives the day two slots of one hour: 05:00 and 06:00. The day is 25 days ahead so that
a User may book it under the settings any other journey leaves (the calendar's journeys leave
bookings open 30 days ahead), and the hours are ones no journey opens on that day: the other blocks of this file open early
hours too, each on a day of its own. The `calendar` table
is not emptied: the day may hold other things, and the block looks only at its own.

## Test 1: a question that needs the calendar

`chat-read` sends `fake: what is open on the day of the journey?`.

1. There is no conversation yet, so the server asks the language: English.
2. The server asks Claude for the step. The fake answers with a request for the tool
   `get_calendar`, from the day to the day.
3. The server runs the read: it calls the code of `GET /calendar` itself, as `chat-read`. It saves
   the message, the line of the application, Claude's request and the result, in one write, and
   leaves the conversation `working`.

The test checks:

- `200`, a `conversationId`, `language` `en`, `proposal` `null`;
- `status` `working` and `activity` "Looking at the calendar…";
- `remainingToday` equal to `LIMIT` − 1;
- exactly one message: `seq` 1, from `person`, with the sentence sent. Nothing of the read is
  shown.

## Test 2: the same line, read back

`chat-read` reads the conversation with `GET /assistant/conversation`. The test checks `status`
`working`, the same `activity`, and the same one message. A screen that was reloaded in the middle
of an exchange shows the same line of progress as the one that started it.

## Test 3: no other message meanwhile

`chat-read` sends `Hello, can you hear me?`. The test checks `409 assistant_busy`: a step is
waiting, and the way on is `continue`.

## Test 4: `continue`, and the answer

`chat-read` calls `POST /assistant/continue`. The server asks Claude again, with the conversation
as stored, the result included. The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`, `activity` `null`, `remainingToday` still `LIMIT` − 1;
- one new message: `seq` 5, from `assistant`;
- its text is JSON with `from` and `to` equal to the day;
- in its `days`, exactly one entry for the day, whose `windows` hold
  `{ start: "05:00", end: "07:00", type: "assistant journey" }` and whose `freeSlots` hold `05:00`
  and `06:00`. Other windows or slots that day would not fail the test;
- the text holds neither the id of the window nor the id of the type.

So what reached Claude is what a User sees of that day, in local times: the route answered
instants in UTC and ids, and the tool turned them into this.

## Test 5: what was stored, and what is shown

`chat-read` reads the conversation. The test checks two messages, `seq` 1 from `person` and
`seq` 5 from `assistant`, and `remainingToday` equal to `LIMIT` − 1: entries 2, 3 and 4 never
leave the server, and the two requests of the exchange counted as one message.

In the table, the test checks that the conversation in progress of `chat-read` holds five
message items (`storedEntries()`), with the roles `user`, `system`, `assistant`, `user`,
`assistant`, and that:

- the third holds a `tool_use` block: the tool `get_calendar` with the input
  `{ from: <the day>, to: <the day> }`;
- the fourth is one `tool_result` block whose content holds the name `assistant journey`.

The test reads the table first and the conversation after it.

## Test 6: nothing to continue

1. `chat-read` calls `POST /assistant/continue`. The conversation is `idle`. The test checks `409`
   and the body `{ error: "nothing_to_continue", message }`, the message being any text.
2. `chat-read` calls `DELETE /assistant/conversation`. The test checks `204`.
3. `chat-read` calls `continue` again, now with no conversation. The test checks `409
   nothing_to_continue`.
4. `chat-read` reads the conversation. The test checks the empty reply with `remainingToday`
   `LIMIT` − 1: the refused calls started nothing and counted nothing.

## What the block leaves

The `afterAll` removes the window and the type (`removeFromCalendar()`), then `chat-read`
from cognito-local. The `calendar` table holds nothing of the block but the calendar lock, which
its four writes moved on: a one-off window and a type are deleted for good, and the block books
nothing.

In the `assistant` table the items of `chat-read` stay, under a `sub` no account has any more: a
`META` with `conversationId` `null`, the five messages of the ended conversation, and one item of
daily use with `messages` 1.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the window cannot be created: for example
  when something else already opens 05:00–07:00 on the day. The other blocks of this file open
  these early hours on other days, and the file's `beforeAll` has removed what an interrupted
  run of theirs left; no other journey opens them.
- The tests build on one another: test 4 needs the step test 1 left waiting, test 5 the exchange
  finished, test 6 a conversation that is `idle`. So a failed test 1, or a `continue` that did
  not finish in test 4, takes the later ones down. A failed check in test 2 or 3, or in test 4
  after `continue` answered, does not: those change nothing more.
- Test 4 finds `freeSlots` empty, and fails, when a User may not book the day: bookings open
  fewer than 25 days ahead (`bookingHorizonDays`), set by hand or left by a calendar journey
  that stopped while it had lowered it.
- The `afterAll` removes the window, the type and `chat-read` whatever happened. If the run is
  stopped before it, the next run removes the window and the type first, by the name
  `assistant journey`, in the file's `beforeAll` and again in the block's: `removeFromCalendar()`
  looks at every day from tomorrow to 28 days ahead, so a run started on a later date finds them
  too.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `GET` and `DELETE /assistant/conversation`: `backend/src/handlers/getConversation.ts`, `backend/src/handlers/endConversation.ts` |
| The step | `runStep()` in `backend/src/assistant/exchange.ts`, called by `sendMessage()` and `continueExchange()`: one request to Claude, the reads, one write |
| The tool | `backend/src/assistant/tools/getCalendar.ts`: its input, the request to `GET /calendar`, and what Claude gets of the answer; run by `runRead()` in `backend/src/assistant/tools/run.ts`, with the event of `backend/src/assistant/tools/event.ts` |
| The calendar's route | `backend/src/handlers/getCalendar.ts`, called inside the assistant's function |
| The line of progress | `activityLine()` in `backend/src/assistant/conversation.ts`, with the texts `reading` of `shared/src/assistant/` |
| The two codes | `assistant_busy` and `nothing_to_continue` in `REFUSALS`, `backend/src/assistant/conversation.ts` |
| The fake's answers | the sentence, `tool-get-calendar-day` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the marks in `backend/docker/fake-claude.mjs` |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/windows`, `DELETE /calendar/windows/{windowId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `startAgain()`, `goOn()`, `storedEntries()`, `dayOfJourney()`, `openWindow()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()` |
| Constants | the block's `TYPE` and `ASK`; `JOURNEY_TYPES`, `HELLO`, `LIMIT` |
