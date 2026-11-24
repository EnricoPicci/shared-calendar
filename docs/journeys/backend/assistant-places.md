# The "the places of a type through the assistant (3, 5.5 rule 4, 7.3)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `the places of a type through the assistant (3, 5.5 rule 4, 7.3)` |
| Tests | 1. "get_calendar gives the places left of a free slot, and the capacity of its window"<br>2. "the same User twice into one slot in one answer is refused, and nothing is proposed"<br>3. "two Users into the slot of two places in one answer make one proposal, and confirm books both"<br>4. "a third User into the full time without "overbook" is refused before any proposal, with the words that the Administrator may go over the capacity"<br>5. "the same booking with "overbook" is proposed with the people it will hold, and confirm books it over the capacity"<br>6. "a User who already holds a place at that time is refused at the proposal: user_busy, naming that appointment's time and type" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[availability types](../concepts.md#availability-types),
[windows and slots](../concepts.md#windows-and-slots),
[places in a slot](../concepts.md#places-in-a-slot),
[the life of an appointment](../concepts.md#the-life-of-an-appointment),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the Administrator's tools](../concepts.md#the-administrators-tools),
[places through the assistant](../concepts.md#places-through-the-assistant),
[the Administrator's conversation in the journeys](../concepts.md#the-administrators-conversation-in-the-journeys),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- `get_calendar` tells Claude the places left of a slot and the capacity of its window
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3).
- Several bookings into one slot, asked for in one answer, are proposed together while they fit
  its places; the same User twice is never proposed (`docs/CONVERSATIONAL_ARCHITECTURE.md`
  section 5.5, rule 4; `docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12).
- A full time is refused before any proposal, unless the Administrator asks for it with
  `overbook`; then the proposal says it goes over the capacity, and the confirmation books it
  (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-07, R-BOOK-13).
- The Administrator's booking for a User who already holds an appointment at that time is
  refused at the proposal with `user_busy` (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12).

## Who takes part

- **The Administrator** (`admin`): the person of this block, who talks to the assistant and
  confirms, in one conversation from test 1 to test 6. It also creates the three Users and the
  piece of calendar, and removes them.
- **`chat-cap-one`, `chat-cap-two`, `chat-cap-three`**: three throw-away Users the bookings are
  for. They never talk to the assistant. Their names are written in the fake's script.
- **The fake Claude**: for each sentence of the block it asks for one tool, or two in one
  answer, then answers with the last result of a tool it was given, word for word. These answers
  are written by hand for the journey, not recorded from the real model.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any block left
(`removeFromCalendar()` for each name of `JOURNEY_TYPES`, this block's
`assistant places journey` among them). The block's `beforeAll`:

1. works out **the day** (`dayOfJourney(20)`): 20 days after today in the calendar's time zone,
   the day the fake's script names `{{date+20}}`;
2. creates the three Users again (`newUser()`);
3. removes again what its own earlier run may have left (`removeFromCalendar()`);
4. creates the type `assistant places journey` with a **capacity of 2**, and on the day a one-off
   window 05:00–06:00 of that type, checking `201` for both;
5. starts the Administrator's count of the day again (`forgetDailyUse()`) and ends their
   conversation (checked `204`).

The day has one slot of this type, 05:00–06:00, with 2 places and nobody in it.

## Test 1: the places of a free slot

`admin` sends `fake: what is free on the day of the capacity journey?` and drives the steps with
`continue` until the conversation waits (`sayAndRead()`). The fake asks for `get_calendar` for
the day, then answers with its result. The test reads that result and checks that, on the day:

- the windows hold one from 05:00 to 06:00 of the block's type with `capacity` 2;
- `freeSlots` holds `05:00 (2 of 2 places left)`.

## Test 2: the same User twice

`admin` sends `fake: book the first User of the capacity journey twice`. The fake asks for two
`book_appointment` in one answer, both for `chat-cap-one` on the day at 05:00. The server reads
the facts of each: both are possible on their own. Then rule 4 counts the places of the answer:
the second puts the same person into the same slot, so it is refused with `same_thing_twice`,
and the first is not proposed either (`not_proposed`). Claude is told so, and the fake answers
with that last result.

The test checks the conversation ends `idle` with no proposal, that the text Claude was given
has `error` `same_thing_twice` and a message holding "a person holds one place at a time", and
that the day holds no booked appointment of the block's type.

## Test 3: two Users into two places

`admin` sends `fake: book both Users of the capacity journey`: two `book_appointment` in one
answer, for `chat-cap-one` and `chat-cap-two` at 05:00. Two places are left, so both fit.

The test checks `200`, `awaiting_confirmation` and a proposal of two actions (`proposalOf()`),
each worded by `assistantTexts('en').changes.bookAppointment` for its User, with no
over-capacity sentence. It confirms: `200`, `idle`, both actions `done`. The day then holds the
booked appointments of `chat-cap-one` and `chat-cap-two`.

## Test 4: the full time, without `overbook`

`admin` sends `fake: book the third User of the capacity journey`: one `book_appointment` for
`chat-cap-three` at 05:00, without `overbook`. The slot has no place left, so the tool refuses
it before any proposal with `no_free_slot`. The test checks `idle`, no proposal, and that the
text Claude was given has `error` `no_free_slot` and a message holding "It can be booked over
the capacity if the person asks for it": the words that let Claude offer it to the
Administrator.

## Test 5: the full time, with `overbook`

`admin` sends `fake: book the third User of the capacity journey anyway`: the same booking with
`overbook: true`.

1. The tool reads the slot: full, but `overbook` is given, so it proposes. The people counted in
   the slot are the 2 booked, plus this one: 3.
2. The proposal's sentence ends "Over the capacity: it will hold 3 people, its capacity is 2."
   The test checks the sentence built with `assistantTexts('en')` holds those words, and the
   proposal holds it.
3. The test confirms: `done`. The route was called with `overbook: true`, the Administrator's
   right (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-13).

The day then holds three booked appointments of the type. In the table, the test checks that of
the six requests for `book_appointment` the conversation stores, only the last has
`overbook: true`.

## Test 6: a User already there

`admin` sends `fake: book the first User of the capacity journey again`: `chat-cap-one` at
05:00, without `overbook`. The tool finds, in the day's appointments of `GET /calendar`, the
appointment `chat-cap-one` holds from test 3, and refuses at the proposal with `user_busy`. The
test checks `idle`, no proposal, and a message holding "chat-cap-one already has an appointment
at this time: on <the day> from 05:00 to 06:00 (assistant places journey)". The three
appointments are unchanged.

## What the block leaves

The `afterAll` ends the Administrator's conversation, cancels the three appointments, deletes
the window and the type (`removeFromCalendar()`), then removes the three Users from
cognito-local.

| In the `calendar` table | State |
|---|---|
| the appointments of `chat-cap-one`, `chat-cap-two`, `chat-cap-three`, the day, 05:00–06:00 | `cancelled`, booked and cancelled by `admin`, with their pointer items |
| events | one booking and one cancellation for each |
| the window and the type | deleted for good |

In the `assistant` table the Administrator's ended conversation stays, with one item of daily
use counting six messages.

## If the block fails halfway

- The `beforeAll` fails when the window cannot be created, for example when something else
  opens 05:00–06:00 on the day.
- The tests build on one another: test 4 needs the two places taken in test 3, test 5 the full
  slot, test 6 the appointment of `chat-cap-one`. A failed test 3 makes tests 4 to 6 fail too.
- The `afterAll` cleans up whatever happened; a run stopped before it is cleaned up by the next
  run's `removeFromCalendar()`, in the file's `beforeAll` and the block's. The Users are removed
  with `removeUserIfPresent()`, straight in cognito-local: nothing is cancelled by it.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`, `POST /assistant/continue`, `POST /assistant/proposals/{proposalId}/confirm`, `DELETE /assistant/conversation`: `backend/src/handlers/` |
| Rule 4 and the places | `Places` and `runStep()` in `backend/src/assistant/exchange.ts` |
| The tools | `backend/src/assistant/tools/getCalendar.ts` (`freeSlots`, `capacity`, `fullSlots`); `backend/src/assistant/tools/bookAppointment.ts` (`overbook` in `AdminInput`, the `place` it returns) |
| The facts | `freeSlotAt()` in `backend/src/assistant/tools/facts.ts`: `no_free_slot`, `user_busy`, the people counted with `peopleIn()` |
| The sentence | `changes.bookAppointment` in `shared/src/assistant/texts.en.ts`, with its `over` part |
| The fake's answers | the six sentences, `tool-get-calendar-day20`, `tool-book-capacity-…` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json` |
| Test helpers | in the file: `newUser()`, `say()`, `sayAndRead()`, `confirm()`, `startAgain()`, `proposalOf()`, `storedToolRequests()`, `lastSaid()`, `dayOfJourney()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `removeUserIfPresent()`, `forgetDailyUse()`, `subOf()` |
| Constants | the block's `TYPE`, `ONE`, `TWO`, `THREE`; `JOURNEY_TYPES` |
