# The "booking through the assistant (5.4, 5.5, 6)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `booking through the assistant (5.4, 5.5, 6)` |
| Tests | 1. "a request to book: Claude asks for the change, nothing is booked, and the answer holds the proposal in the words of the server"<br>2. "the conversation, read back, shows the same proposal waiting, and there is no step to continue"<br>3. "an id that is not one is refused, and so is the id of no proposal: the proposal keeps waiting"<br>4. "confirm books it: the proposal is shown as done, and Claude is told the person confirmed and what was booked"<br>5. "the calendar's own route shows the appointment, booked by the User themself"<br>6. "the same proposal cannot be confirmed or declined again, and nothing more is booked"<br>7. "stored the exchange as five entries, counted one message, and shows the settled proposal until the next message" |
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
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- Claude asking to book changes nothing: the answer is a proposal, worded by the server from
  facts it read itself (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rules 1 and 2).
- The appointment exists only after `POST /assistant/proposals/{proposalId}/confirm`, which runs
  the booking route's own code with the identity of the person, and it runs once
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4 and section 5.5, rule 6;
  `docs/ARCHITECTURE.md` section 4, "The assistant's routes").
- The two refusals of the proposal routes: `400 invalid_request` and `404 proposal_not_found`
  (`docs/ARCHITECTURE.md` section 4, "The assistant's error codes").
- A settled proposal is shown until the person's next message, and the whole exchange is one
  message of the day (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 6).

## Who takes part

- **`chat-book`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): creates `chat-book`, and prepares and removes the piece of
  calendar the block books in.
- **The fake Claude**: for the block's sentence it first asks for the tool `book_appointment`,
  then answers with the last result of a tool it was given, word for word. For
  `Hello, can you hear me?`, in test 7, it answers its greeting.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any of the four
blocks that use the calendar left on a day still to come (`removeFromCalendar()` for each name of
`JOURNEY_TYPES`). The block's `beforeAll`:

1. works out **the day** (`dayOfJourney(26)`): 26 days after today's date in the calendar's time
   zone, which it reads from the settings as `admin`. It is the day the fake asks to book on: its
   script names it `{{date+26}}`, counted from the date the server tells Claude at the message of
   test 1. The two agree unless local midnight falls between the `beforeAll` and test 1;
2. creates `chat-book` again and signs it in (`newUser()`);
3. removes again what its own earlier run may have left (`removeFromCalendar()`), on every day
   from tomorrow to 28 days ahead: it cancels the booked appointments whose type is named
   `assistant booking journey`, deletes the one-off windows of that type, then the types of that
   name;
4. creates the type `assistant booking journey` and, on the day, a one-off window 05:00–07:00 of
   that type (`openWindow()`), and checks `201` for both.

The window gives the day two slots of one hour, 05:00 and 06:00. The day is 26 days ahead so that
a User may book it under the settings any other journey leaves (the calendar's journeys leave
bookings open 30 days ahead). The `calendar` table is not emptied: the day may hold other things,
and the block looks only at its own.

## Test 1: a request to book

`chat-book` sends `fake: book me the slot of the booking journey`.

1. There is no conversation yet, so the server asks the language: English.
2. The server asks Claude for the step. The fake answers with a request for the tool
   `book_appointment`: the day, at `05:00`.
3. The server books nothing. It reads the day through the code of `GET /calendar`, as
   `chat-book`, finds the free slot that starts at 05:00, and takes its end and the name of its
   type. It saves the message, the line of the application, Claude's request and the proposal in
   one write.

The test checks:

- `200` and the whole reply: a `conversationId`, `language` `en`, `status`
  `awaiting_confirmation`, `activity` `null`, `remainingToday` equal to `LIMIT` − 1;
- exactly one message: `seq` 1, from `person`, with the sentence sent;
- the proposal (`bookingProposal()`): a `proposalId` that is a ULID, `question` "Make this
  change?", `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and
  `error` are `null` and whose `summary` is the sentence the shared texts make for that day,
  05:00 to 06:00, of the type `assistant booking journey`, without a note. The test builds the
  expected sentence with the same function of `shared/` the server uses
  (`assistantTexts('en').changes.bookAppointment`), so it checks the facts in it, not its
  wording;
- `chat-book` has no appointment: `GET /calendar/appointments?upcoming=true` answers an empty
  list (`appointmentsOf()`).

The test keeps the `proposalId`.

## Test 2: the proposal, read back

`chat-book` reads the conversation. The test checks `status` `awaiting_confirmation`, `activity`
`null`, and the same proposal with the id of test 1. Then `chat-book` calls
`POST /assistant/continue`: the test checks `409 nothing_to_continue`. The conversation waits for
the person, not for Claude.

## Test 3: ids that name no proposal

`chat-book` calls `confirm` and `decline` with `not-an-id`, then with a well-formed id that names
no proposal (`NO_PROPOSAL`). The test checks:

- `400 invalid_request` for the two calls with `not-an-id`;
- `404` and the body `{ error: "proposal_not_found", message }` for the two with `NO_PROPOSAL`,
  the message being any text;
- the conversation still `awaiting_confirmation` with the proposal of test 1;
- still no appointment.

## Test 4: confirm

`chat-book` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `POST /calendar/appointments` with the stored request, as `chat-book`.
   The route checks everything again and books.
3. It saves the outcome and the result Claude will read, then asks Claude for the closing words.
   The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`, `activity` `null`, `remainingToday` still `LIMIT` − 1;
- the same proposal, same id, its action now with `outcome` `done` and `error` `null`;
- one new message: `seq` 5, from `assistant`;
- its text is JSON with `outcome` `done`, a `message` that holds "pressed the confirm button",
  and an `appointment` with the day, `start` `05:00`, `end` `06:00`, `type`
  `assistant booking journey`, `username` `chat-book`, `note` `null`, `status` `booked`.

So Claude is told two things: that the person confirmed and the change was made, and what the
calendar now holds, in local times. The test keeps the appointment's id from that text.

## Test 5: the calendar's own route

`chat-book` lists their appointments with `GET /calendar/appointments?upcoming=true`. The server
lists a User's own booked appointments that have not ended. The test checks exactly one, with the
id Claude was given, `typeName` `assistant booking journey`, `username` `chat-book`, `status`
`booked`, `note` `null`, and `createdBy` `{ username: "chat-book", role: "user" }`: the booking
was made as the User, not as the assistant or the Administrator.

## Test 6: once only

`chat-book` calls `confirm`, then `decline`, with the same id. The test checks
`404 proposal_not_found` for both, and that the list of test 5 still holds one appointment.

## Test 7: what was stored, and how long the proposal is shown

1. `chat-book` reads the conversation. The test checks `status` `idle`, the proposal with the id
   of test 1 and its action `done`, and `remainingToday` `LIMIT` − 1: the message, the
   confirmation and the closing words counted as one message.
2. `chat-book` sends `Hello, can you hear me?`. The test checks `status` `idle`, `proposal`
   `null` and `remainingToday` `LIMIT` − 2.
3. `chat-book` reads the conversation again. The test checks `proposal` `null`.

In the table, the test checks first, before step 1, that the conversation of `chat-book` holds
five entries (`storedEntries()`), with the roles `user`, `system`, `assistant`, `user`,
`assistant`, and that:

- the third is one `tool_use` block: the tool `book_appointment` with the input
  `{ date: <the day>, time: "05:00" }`;
- the fourth is one `tool_result` block whose content holds `"outcome":"done"`.

## What the block leaves

The `afterAll` cancels the appointment as `admin`, deletes the window and the type
(`removeFromCalendar()`), then removes `chat-book` from cognito-local.

| In the `calendar` table | State |
|---|---|
| the appointment of `chat-book`, the day, 05:00–06:00 | `cancelled`, booked by `chat-book`, cancelled by `admin`; its pointer item too |
| events | one for the booking, one for the cancellation |
| the window and the type | deleted for good |

A cancelled appointment keeps no slot busy, so the next run finds 05:00 free again. In the
`assistant` table the items of `chat-book` stay, under a `sub` no account has any more: a `META`
with the conversation of test 7 still open and `proposal` `null`, its eight entries, and one item
of daily use with `messages` 2.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the window cannot be created: for example
  when something else already opens 05:00–07:00 on the day. The other blocks of this file open
  these early hours on other days, and the file's `beforeAll` has removed what an interrupted
  run of theirs left; no other journey opens them.
- The tests build on one another: tests 2 to 4 need the proposal of test 1, tests 5 to 7 the
  confirmation of test 4. A failed test 1 takes the others down. A failed check in test 2, 3, 5
  or 6 changes nothing for the later ones.
- Test 1 gets no proposal, and fails, when a User may not book the day: bookings open fewer than
  26 days ahead (`bookingHorizonDays`), set by hand or left by a calendar journey that stopped
  while it had lowered it. The server then finds no free slot at 05:00 and Claude gets an error
  instead.
- The `afterAll` cancels, deletes and removes whatever happened. If the run is stopped before
  it, the next run removes the appointment, the window and the type first, in the file's `beforeAll` and again in the block's:
  `removeFromCalendar()` looks at every day from tomorrow to 28 days ahead, so a run started on
  a later date finds them too. What was left on a day that has since become today or passed is
  not looked at.
- `chat-book` is removed with `removeUserIfPresent()`, straight in cognito-local: no
  deleted-user marker is written and nothing is cancelled by it. The cancellation is the
  Administrator's, in `removeFromCalendar()`.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts`; `POST /assistant/proposals/{proposalId}/decline`: `backend/src/handlers/declineProposal.ts`; `POST /assistant/continue`, `GET /assistant/conversation`: `backend/src/handlers/continueAssistant.ts`, `backend/src/handlers/getConversation.ts` |
| The proposal made | `runStep()` in `backend/src/assistant/exchange.ts`, with `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tool | `backend/src/assistant/tools/bookAppointment.ts`: its input, the facts it reads through `GET /calendar`, the request to run, and what Claude gets of the route's answer |
| The summary | `changes.bookAppointment` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handler of the change in `backend/src/assistant/tools/changeHandlers.ts`; taking the proposal: `takeProposal()` in `backend/src/lib/assistantDb.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts` |
| The calendar's routes | `backend/src/handlers/getCalendar.ts` and `backend/src/handlers/bookAppointment.ts`, called inside the assistant's functions; `GET /calendar/appointments`: `backend/src/handlers/listAppointments.ts` |
| The codes | `proposal_not_found` and `nothing_to_continue` in `REFUSALS`, `backend/src/assistant/conversation.ts` |
| The fake's answers | the sentence, `tool-book-day26-0500`, `text-last-tool-result` and `text-hello` in `backend/tests/integration/fake-claude/answers.json` |
| Creating the User | `POST /users`, as `admin` (`newUser()`) |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/windows`, `POST /calendar/appointments/{appointmentId}/cancel`, `DELETE /calendar/windows/{windowId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `goOn()`, `confirm()`, `decline()`, `appointmentsOf()`, `bookingProposal()`, `storedEntries()`, `dayOfJourney()`, `openWindow()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()`, `assistantTexts()` |
| Constants | the block's `TYPE` and `ASK`; `JOURNEY_TYPES`, `NO_PROPOSAL`, `HELLO`, `LIMIT` |
