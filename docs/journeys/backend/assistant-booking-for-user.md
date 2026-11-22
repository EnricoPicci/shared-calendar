# The "the Administrator books for a User through the assistant (3, 5.4, 5.5)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `the Administrator books for a User through the assistant (3, 5.4, 5.5)` |
| Tests | 1. "a request to book for a User: the proposal names the person, and nothing is booked"<br>2. "confirm books it: the proposal is shown as done, and Claude is told the appointment and whose it is"<br>3. "the User finds the appointment in their own list, through the calendar's own route, booked by the Administrator"<br>4. "Claude asked for the booking with the username, a day and a time, and nothing else" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the deleted-user marker](../concepts.md#the-deleted-user-marker),
[why a pointer item](../concepts.md#why-a-pointer-item),
[the event log](../concepts.md#the-event-log),
[the settings](../concepts.md#the-settings),
[availability types](../concepts.md#availability-types),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[windows and slots](../concepts.md#windows-and-slots),
[the life of an appointment](../concepts.md#the-life-of-an-appointment),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the Administrator's tools](../concepts.md#the-administrators-tools),
[the Administrator's conversation in the journeys](../concepts.md#the-administrators-conversation-in-the-journeys),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- The tool `book_appointment` is offered to both roles
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3), with an input that differs by role as the
  body of the booking route does (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-01): the Administrator
  names the User the appointment is for.
- Claude asking to book changes nothing: the answer is a proposal, worded by the server from
  facts it read itself, and for the Administrator the sentence says whose appointment it would
  be (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rules 1 and 2).
- The appointment exists only after `POST /assistant/proposals/{proposalId}/confirm`, which
  runs the code of `POST /calendar/appointments` with the identity of the Administrator
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4). It is the User's appointment, booked by
  the Administrator.

## Who takes part

- **The Administrator** (`admin`): the person of this block, the one who talks to the
  assistant and confirms. It also creates `chat-booked`, and prepares and removes the piece of
  calendar the block books in. It is the seeded account, the same at every run.
- **`chat-booked`**: a throw-away User, the one the appointment is for. They never talk to the
  assistant: they only read their own appointments, through the calendar's own route.
- **The fake Claude**: for the block's sentence it first asks for the tool `book_appointment`,
  with the username `chat-booked`, a day and the time `05:00`, then answers with the last
  result of a tool it was given, word for word. The username is written in its script: the
  block must call its User by that name.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any block that
uses the calendar left on a day still to come (`removeFromCalendar()` for each name of
`JOURNEY_TYPES`). The block's `beforeAll`:

1. works out **the day** (`dayOfJourney(21)`): 21 days after today's date in the calendar's
   time zone, which it reads from the settings as `admin`. It is the day the fake asks to book
   on: its script names it `{{date+21}}`, counted from the date the server tells Claude at the
   message of test 1. The two agree unless local midnight falls between the `beforeAll` and
   test 1;
2. creates `chat-booked` again and signs it in (`newUser()`);
3. removes again what its own earlier run may have left (`removeFromCalendar()`), on every day
   from tomorrow to 28 days ahead: it cancels the booked appointments whose type is named
   `assistant booking for a user journey`, deletes the one-off windows of that type, then the
   types of that name;
4. creates the type `assistant booking for a user journey` and, on the day, a one-off window
   05:00–07:00 of that type (`openWindow()`), and checks `201` for both;
5. builds the sentence the proposal must show (`summary`), with the same function of `shared/`
   the server uses (`assistantTexts('en').changes.bookAppointment`): the day, 05:00 to 06:00,
   the type, no note, and the username `chat-booked`;
6. starts the Administrator's count of the day again (`forgetDailyUse()`) and ends their
   conversation (`DELETE /assistant/conversation`, checked `204`).

The window gives the day two slots of one hour, 05:00 and 06:00. `chat-booked` is a new
account with no appointment. The Administrator has no conversation and all of the day's
messages. The `calendar` table is not emptied: the day may hold other things, and the block
looks only at its own.

## Test 1: a request to book for a User

`admin` sends `fake: book the slot of the journey for its User`.

1. There is no conversation, so the server asks the language: English.
2. The server asks Claude for the step. The fake answers with a request for the tool
   `book_appointment`: `{ username: "chat-booked", date: <the day>, time: "05:00" }`.
3. The server books nothing. It reads two facts, both as `admin`:
   - **the person** (`plainUser()`): it calls the code of `GET /users`, the route that lists
     the Users an Administrator can book for, and looks for the username in the answer.
     `chat-booked` is there;
   - **the slot** (`freeSlotAt()`): it calls the code of `GET /calendar` for the day, finds the
     free slot that starts at 05:00, and takes its end and the name of its type.
4. It saves the message, the line of the application, Claude's request and the proposal in one
   write.

The test checks:

- `200`, `status` `awaiting_confirmation`, `activity` `null`, `remainingToday` equal to
  `LIMIT` − 1;
- the proposal (`proposalOf()`): a `proposalId` that is a ULID, `question` "Make this change?",
  `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and `error`
  are `null` and whose `summary` is the sentence built in the `beforeAll`;
- that this sentence holds "Book an appointment for chat-booked on ": the Administrator reads
  whose appointment they are about to make. A User's own booking has no "for …";
- nothing is booked: `GET /calendar/appointments?upcoming=true`, as `chat-booked`, answers an
  empty list (`appointmentsOf()`).

The test keeps the `proposalId`.

## Test 2: confirm

`admin` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `POST /calendar/appointments` with the stored request, the body
   `{ start, username: "chat-booked" }`, as `admin`. The route checks everything again, the
   account of `chat-booked` among it, and books on that account.
3. It saves the outcome and the result Claude will read, then asks Claude for the closing
   words. The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`;
- the same proposal, same id, same summary, its action now with `outcome` `done` and `error`
  `null`;
- the text of the first message of the reply is JSON with `outcome` `done` and an
  `appointment` with the day, `start` `05:00`, `end` `06:00`, `type`
  `assistant booking for a user journey`, `username` `chat-booked`, `note` `null`, `status`
  `booked`.

So Claude is given the appointment as the calendar now holds it, in local times, with the name
of the User it belongs to. The test keeps the appointment's id from that text.

## Test 3: the User's own list

`chat-booked` lists their appointments with `GET /calendar/appointments?upcoming=true`
(`appointmentsOf()`). The server lists a User's own booked appointments that have not ended,
by the `sub` of the token; `chat-booked` is a new account, so the list holds what this block
made and nothing else. The test checks exactly one, with the id Claude was given, `typeName`
`assistant booking for a user journey`, `username` `chat-booked`, `status` `booked`, `note`
`null`, and `createdBy` `{ username: "admin", role: "admin" }`: the appointment is the User's,
and it was booked as the Administrator, not as the assistant.

## Test 4: what Claude asked for

This test calls no route of the assistant. In the table, the test checks that the third entry
of the Administrator's conversation in progress (`storedEntries()`) is one `tool_use` block:
the tool `book_appointment` with the input
`{ username: "chat-booked", date: <the day>, time: "05:00" }`, and no other field.

The first two entries are the message and the line of the application. Claude gave a name, a
day and a time; the end of the slot and its type, which the proposal showed, came from the
calendar.

## What the block leaves

The `afterAll` ends the Administrator's conversation, cancels the appointment as `admin`,
deletes the window and the type (`removeFromCalendar()`), then removes `chat-booked` from
cognito-local.

| In the `calendar` table | State |
|---|---|
| the appointment of `chat-booked`, the day, 05:00–06:00 | `cancelled`, booked by `admin`, cancelled by `admin`; its pointer item too |
| events | one for the booking, one for the cancellation |
| the window and the type | deleted for good |

A cancelled appointment keeps no slot busy, so the next run finds 05:00 free again. In the
`assistant` table the Administrator's items stay: the `META` with `conversationId` `null` (the
conversation is ended), the five entries of the ended conversation beside those of the
Administrator's earlier conversations, and one item of daily use with `messages` 1, which stays
until a block next calls `forgetDailyUse()`. `chat-booked` has
no item there: they never talked to the assistant.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the window cannot be created: for
  example when something else already opens 05:00–07:00 on the day. The other blocks of this
  file open these early hours on other days, and the file's `beforeAll` has removed what an
  interrupted run of theirs left.
- The tests build on one another: test 2 needs the proposal of test 1, test 3 the appointment
  of test 2. A failed test 1 takes them down. Test 4 needs only the message of test 1.
- The settings cannot stand in the way of test 1, unlike in the blocks where a User books: the
  Administrator is exempt from the booking horizon, the minimum notice and the limit of future
  appointments (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-04, R-BOOK-05, R-BOOK-09), and
  `GET /calendar` gives them every free slot that is still to come.
- Test 1 gets no proposal when the fake's username is not a User: for example when the block's
  `USER` and the script of the fake no longer agree. Claude then gets the error
  `user_not_found`, and the reply is `working`.
- The `afterAll` ends, cancels, deletes and removes whatever happened. If the run is stopped
  before it, the next run removes the appointment, the window and the type first, in the file's
  `beforeAll` and again in the block's: `removeFromCalendar()` looks at every day from tomorrow
  to 28 days ahead, so a run started on a later date finds them too. What was left on a day
  that has since become today or passed is not looked at. The next run also ends the
  Administrator's conversation before it starts.
- `chat-booked` is removed with `removeUserIfPresent()`, straight in cognito-local: no
  deleted-user marker is written and nothing is cancelled by it. The cancellation is the
  Administrator's, in `removeFromCalendar()`, which runs first.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts`; `DELETE /assistant/conversation`: `backend/src/handlers/endConversation.ts` |
| The proposal made | `runStep()` in `backend/src/assistant/exchange.ts`, with `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tool | `backend/src/assistant/tools/bookAppointment.ts`: its input for each role (`AdminInput`, `UserInput`), the facts it reads, the request to run, and what Claude gets of the route's answer |
| The facts | `plainUser()`, `freeSlotAt()` and `instantOf()` in `backend/src/assistant/tools/facts.ts` |
| The summary | `changes.bookAppointment` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handler of the change, `book_appointment` in `CHANGE_HANDLERS`, `backend/src/assistant/tools/changeHandlers.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts`; `appointmentForModel()` in `backend/src/assistant/tools/result.ts` |
| The calendar's routes | `backend/src/handlers/listUsers.ts`, `backend/src/handlers/getCalendar.ts` and `backend/src/handlers/bookAppointment.ts`, called inside the assistant's functions; `GET /calendar/appointments`: `backend/src/handlers/listAppointments.ts` |
| The fake's answers | the sentence, `tool-book-for-user-day21-0500` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the mark `{{date+N}}` in `backend/docker/fake-claude.mjs` |
| Creating the User | `POST /users`, as `admin` (`newUser()`) |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/windows`, `POST /calendar/appointments/{appointmentId}/cancel`, `DELETE /calendar/windows/{windowId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin` |
| Test helpers | in the file: `newUser()`, `say()`, `confirm()`, `startAgain()`, `appointmentsOf()`, `proposalOf()`, `storedEntries()`, `dayOfJourney()`, `openWindow()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `forgetDailyUse()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()`, `assistantTexts()` |
| Constants | the block's `TYPE`, `ASK` and `USER`; `JOURNEY_TYPES`, `LIMIT` |
