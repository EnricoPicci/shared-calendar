# The "a proposal that is not confirmed (5.5, 6)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a proposal that is not confirmed (5.5, 6)` |
| Tests | 1. "decline: nothing is booked, a notice says so, Claude is not asked, and the conversation waits for the person"<br>2. "the same request again makes a new proposal"<br>3. "a message that is refused while the proposal waits changes nothing: the proposal keeps waiting"<br>4. "a typed "yes" confirms nothing: the proposal is dropped, Claude asks again, and a new proposal waits"<br>5. "any other message drops the proposal too, and is answered as usual" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the deleted-user marker](../concepts.md#the-deleted-user-marker),
[the calendar lock](../concepts.md#the-calendar-lock),
[windows and slots](../concepts.md#windows-and-slots),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- Declining changes nothing, answers a fixed notice and does not ask Claude
  (`docs/ARCHITECTURE.md` section 4, "The assistant's routes").
- Writing instead of pressing drops the proposal, a typed "yes" included: no text is a
  confirmation (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rules 1 and 5).
- A message that is refused saves nothing, and the proposal keeps waiting
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rule 5).
- A declined or dropped proposal is gone: its id answers `404 proposal_not_found`
  (`docs/ARCHITECTURE.md` section 4, "The assistant's error codes").

## Who takes part

- **`chat-decline`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): creates `chat-decline`, and prepares and removes the piece of
  calendar the proposals are about.
- **The fake Claude**: for the block's sentence, and for `yes`, it asks for the tool
  `book_appointment`. For `Hello, can you hear me?` it answers its greeting.
- **The test itself**, reading the `assistant` table directly.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any of the four
blocks that use the calendar left on a day still to come (`removeFromCalendar()` for each name of
`JOURNEY_TYPES`). The block's `beforeAll` works out **the day**, 27 days
after today in the calendar's time zone (`dayOfJourney(27)`, the fake's `{{date+27}}`), creates
`chat-decline` again and signs it in, removes again what its own earlier run may have left under the type name
`assistant declining journey` (`removeFromCalendar()`, every day from tomorrow to 28 days ahead), then creates that
type and a one-off window 05:00–07:00 of it on the day (`openWindow()`).

The block books nothing: in every test the slot at 05:00 stays free, which is why the same
proposal can be made again and again.

## Test 1: decline

1. `chat-decline` sends `fake: book me the slot of the declining journey`. The fake asks for
   `book_appointment`, the day at `05:00`, and the server answers a proposal. The test checks
   `status` `awaiting_confirmation` and the proposal for that day, 05:00 to 06:00, of the type
   `assistant declining journey` (`bookingProposal()`).
2. `chat-decline` calls `POST /assistant/proposals/{proposalId}/decline` with its id. The server
   saves that the change was declined, and the notice, in one write. It does not ask Claude.
3. `chat-decline` calls `confirm` with the same id.

The test checks:

- for the decline: `200`, `status` `idle`, `activity` `null`, `proposal` `null`,
  `remainingToday` `LIMIT` − 1, and exactly one message: `seq` 5, from `notice`, "Nothing was
  changed.";
- `chat-decline` has no appointment (`appointmentsOf()`);
- for the confirmation after it: `404 proposal_not_found`.

In the table, the test checks that:

- the conversation holds four entries for Claude (`storedEntries()`), with the roles `user`,
  `system`, `assistant`, `user`: the last is the result of the declined change, and no answer of
  Claude follows it. The notice is stored too, as `seq` 5, but it is not an entry for Claude;
- the results of tools stored so far (the block's `storedResults()`) are one, with `outcome`
  `declined`.

## Test 2: the same request again

`chat-decline` sends the same sentence. It is a new message of the person, so the fake starts
again at its first answer and asks for the same booking. The test checks `status`
`awaiting_confirmation`, the same proposal for the day, and `remainingToday` `LIMIT` − 2. It
keeps the new `proposalId`.

## Test 3: a refused message does not drop the proposal

`chat-decline` sends a message of spaces only. The test checks `400 invalid_request`, then reads
the conversation and checks `status` `awaiting_confirmation`, the proposal with the id of test 2,
and `remainingToday` still `LIMIT` − 2.

## Test 4: a typed "yes"

`chat-decline` sends `yes` while the proposal of test 2 waits.

1. The server drops the proposal: it stores, as the result of the change Claude had asked for,
   that the person did not press the button and nothing was changed.
2. In the same request it adds the message `yes` and asks Claude. The fake answers `yes` with a
   request for the same booking, as the real model did when this was tried.
3. The server makes a new proposal, with a new id.

The test checks:

- `200`, `status` `awaiting_confirmation`, the proposal for the day, `remainingToday`
  `LIMIT` − 3;
- exactly one message, from `person`, with the text `yes`;
- the `proposalId` is not the one of test 2;
- `chat-decline` has no appointment;
- `confirm` with the id of test 2 answers `404 proposal_not_found`.

In the table, the test checks that the stored results now have the outcomes `declined`,
`not_confirmed`, in that order. The test keeps the new `proposalId`.

So typing "yes" books nothing. It costs a message of the day and brings the buttons back.

## Test 5: any other message

`chat-decline` sends `Hello, can you hear me?` while the proposal of test 4 waits. The server
drops the proposal the same way and the fake answers its greeting.

The test checks:

- `200`, `status` `idle`, `proposal` `null`, `remainingToday` `LIMIT` − 4;
- two messages: the person's, then the assistant's "Hello. I am the assistant of the shared
  calendar.";
- `confirm` with the id of test 4 answers `404 proposal_not_found`;
- `chat-decline` has no appointment.

In the table, the test checks that the stored results now have the outcomes `declined`,
`not_confirmed`, `not_confirmed`.

## What the block leaves

The `afterAll` deletes the window and the type (`removeFromCalendar()`, which finds no
appointment to cancel), then removes `chat-decline` from cognito-local. The `calendar` table holds
nothing of the block but the calendar lock, which its writes moved on.

In the `assistant` table the items of `chat-decline` stay, under a `sub` no account has any more:
a `META` with the conversation still open, `status` `idle` and `proposal` `null`, its entries and
its one notice, and one item of daily use with `messages` 4.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the window cannot be created: for example
  when something else already opens 05:00–07:00 on the day. The other blocks of this file open
  these early hours on other days, and the file's `beforeAll` has removed what an interrupted
  run of theirs left; no other journey opens them.
- The tests build on one another through the conversation: test 3 and test 4 need the proposal
  of test 2, test 5 the one of test 4, and the counts of the day and of the stored results add
  up from test 1. A test 1 that fails before its decline went through, or a failed test 2, takes
  the later ones down; a failed check after the decline changes nothing for them.
- No test gets a proposal when a User may not book the day: bookings open fewer than 27 days
  ahead (`bookingHorizonDays`), set by hand or left by a calendar journey that stopped while it
  had lowered it.
- The `afterAll` deletes and removes whatever happened; if the run is stopped before it, the
  next run removes the window and the type first, in the file's `beforeAll` and again in the
  block's: `removeFromCalendar()` looks at every day from tomorrow to 28 days ahead, so a run
  started on a later date finds them too. `chat-decline` is removed
  with `removeUserIfPresent()`, straight in cognito-local: no deleted-user marker, nothing
  cancelled.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/proposals/{proposalId}/decline`: `backend/src/handlers/declineProposal.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts`; `GET /assistant/conversation`: `backend/src/handlers/getConversation.ts` |
| Declining | `declineProposal()` in `backend/src/assistant/decline.ts` |
| Dropping | `sendMessage()` in `backend/src/assistant/exchange.ts` |
| What Claude is told | `notRunResult()` and `settledWithout()` in `backend/src/assistant/proposal.ts`: the outcomes `declined` and `not_confirmed` |
| The notice | `nothingChanged` in `shared/src/assistant/texts.en.ts` |
| The body of a message | `AssistantMessageBody` in `shared/src/assistant/` |
| The fake's answers | the sentence, `yes`, `tool-book-day27-0500` and `text-hello` in `backend/tests/integration/fake-claude/answers.json` |
| Test helpers | in the file: `newUser()`, `say()`, `conversation()`, `confirm()`, `decline()`, `appointmentsOf()`, `bookingProposal()`, `storedEntries()`, `dayOfJourney()`, `openWindow()`, `removeFromCalendar()`, the block's `proposalIdOf()` and `storedResults()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()` |
| Constants | the block's `TYPE` and `ASK`; `JOURNEY_TYPES`, `HELLO`, `HELLO_ANSWER`, `LIMIT` |
