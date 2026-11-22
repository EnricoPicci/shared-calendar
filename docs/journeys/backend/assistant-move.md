# The "an appointment moved through the assistant (5.4, 5.5)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `an appointment moved through the assistant (5.4, 5.5)` |
| Tests | 1. "a request to move: the proposal names the old time and the new one, and nothing is moved"<br>2. "confirm moves it: Claude is told the new appointment, with a new id and the note kept, and which one it replaces"<br>3. "the calendar's own route finds the appointment at its new time, and the old one cancelled as changed"<br>4. "Claude asked for the move with the id of the list, a day and a time, and nothing else" |
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
[a change cancels one appointment and books another](../concepts.md#a-change-cancels-one-appointment-and-books-another),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- Claude asking to move an appointment moves nothing. The answer is a proposal that names the
  appointment as it is and the slot it would go to, worded by the server from facts it read
  itself (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4, "A move", and section 5.5, rules 1
  and 2).
- Claude names the appointment by its id and nothing else
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.2, `change_appointment`). It learns the id
  by reading the list of appointments first, as the tool's description tells it
  (`backend/src/assistant/tools/changeAppointment.ts`).
- The move is made only by `POST /assistant/proposals/{proposalId}/confirm`, which runs the code
  of the calendar's change route. So it is a change like any other: the old appointment stays,
  cancelled with the reason `changed`, and a new one is booked with a new id
  (`docs/SHARED_CALENDAR_SPEC.md` section 8.4, R-CHG-02).
- The tool has no note, so the route keeps the note the appointment has
  (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-03), and Claude is given the new appointment and the one
  it replaces (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.2, "What Claude gets of a move").

## Who takes part

- **`chat-move`**: a throw-away User, the person of this block. They book an appointment through
  the calendar's own route, then ask the assistant to move it.
- **The Administrator** (`admin`): creates `chat-move`, and prepares and removes the piece of
  calendar the block uses.
- **The fake Claude**: for the block's sentence it answers in three steps. First a request for
  the tool `list_appointments`, for the one day of the block. Then a request for the tool
  `change_appointment`, with the id of the first appointment of that list, the same day and the
  time `06:00`. Then, as its text, the last result of a tool it was given, word for word.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any block that
uses the calendar left on a day still to come (`removeFromCalendar()` for each name of
`JOURNEY_TYPES`). The block's `beforeAll`:

1. works out **the day** (`dayOfJourney(23)`): 23 days after today's date in the calendar's time
   zone, which it reads from the settings as `admin`. It is the day the fake asks about: its
   script names it `{{date+23}}`, counted from the date the server tells Claude at the message of
   test 1. The two agree unless local midnight falls between the `beforeAll` and test 1;
2. creates `chat-move` again and signs it in (`newUser()`);
3. removes again what its own earlier run may have left (`removeFromCalendar()`), on every day
   from tomorrow to 28 days ahead: it cancels the booked appointments whose type is named
   `assistant moving journey`, deletes the one-off windows of that type, then the types of that
   name;
4. creates the type `assistant moving journey` and, on the day, a one-off window 04:00–07:00 of
   that type (`openWindow()`), and checks `201` for both;
5. books, as `chat-move` and through `POST /calendar/appointments`, the first free slot of that
   type on the day, with the note `keep this note` (`bookSlots()` with the place 0), and checks
   `201`. It keeps the appointment's id as `oldId`.

The window gives the day three slots of one hour. `bookSlots()` reads them with `GET /calendar`
as `chat-move`, in order of time, so place 0 is 04:00:

| Slot of the day | Before the block's tests |
|---|---|
| 04:00–05:00 | booked by `chat-move`, note `keep this note` (`oldId`) |
| 05:00–06:00 | free |
| 06:00–07:00 | free |

The appointment is made without the assistant, so `chat-move` has no conversation yet. The
`calendar` table is not emptied: the day may hold other things, and the block looks only at its
own.

## Test 1: a request to move

`chat-move` sends `fake: move my appointment of the moving journey`, then calls
`POST /assistant/continue` once (the helper `askForChange()`). A request about an appointment
takes two steps before the proposal, because Claude must first learn the appointment's id.

1. There is no conversation yet, so the server asks the language: English.
2. The server asks Claude for the first step. The fake asks for the tool `list_appointments`,
   from the day to the day. It is a read, so the server runs it: it calls the code of
   `GET /calendar/appointments` as `chat-move`. That route gives a User their own appointments
   only, and booked ones unless asked otherwise, so the list holds one appointment, the one at
   04:00, with its id. The server answers `working`.
3. `POST /assistant/continue`: the server asks Claude again, now with the list. The fake asks for
   the tool `change_appointment`. Its script holds the mark `{{appointment-id-1}}`, which the
   fake replaces with the id of the first appointment of the list it was just given: `oldId`.
   The day is `{{date+23}}` again and the time `06:00`.
4. The server moves nothing. It reads the facts itself, as `chat-move` (`read` of
   `backend/src/assistant/tools/changeAppointment.ts`, with the functions of
   `backend/src/assistant/tools/facts.ts`):
   - the instant the day and `06:00` stand for (`instantOf()`);
   - the appointment the id stands for (`appointmentById()`): the calendar has no route that
     reads one appointment, so the server calls the code of `GET /calendar/appointments` for the
     person's appointments that have not ended, cancelled ones included, and looks for the id in
     the answer. It finds the appointment, booked. It starts at 04:00, not at 06:00, so there is
     something to move;
   - the slot it would go to (`freeSlotAt()`): through the code of `GET /calendar` for the day,
     the free slot that starts at 06:00, with its end, 07:00, and the name of its type.
5. It saves Claude's request and the proposal in one write. What the proposal stores to run later
   is the request for the change route, with the new start as its whole body: no end and no
   note.

The test checks:

- `200` for the message, with `status` `working`, `activity` "Looking at the appointments…" and
  `proposal` `null` (inside `askForChange()`);
- `200` for `continue`, with `status` `awaiting_confirmation` and `remainingToday` equal to
  `LIMIT` − 1: `continue` is not a message of the day;
- the proposal (`proposalOf()`): a `proposalId` that is a ULID, `question` "Make this change?",
  `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and `error` are
  `null` and whose `summary` is the sentence the shared texts make for a move: the appointment of
  the day from 04:00 to 05:00, of the type `assistant moving journey`, moved to the same day from
  06:00 to 07:00, of the same type. The test builds the expected sentence with the same function
  of `shared/` the server uses (`assistantTexts('en').changes.changeAppointment`), so it checks
  the facts in it, not its wording. It gives that function `username` `null`: a User's proposal
  does not say whose the appointment is, since it is their own (`summaryOf()`);
- nothing is moved: `GET /calendar/appointments?upcoming=true` as `chat-move` still answers
  exactly one appointment, with the id `oldId` (`appointmentsOf()`).

The test keeps the `proposalId`.

## Test 2: confirm

`chat-move` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `POST /calendar/appointments/{appointmentId}/change` with the stored
   request, as `chat-move`. The route checks everything again, the old appointment as a
   cancellation and the new time as a booking, and then
   [cancels one appointment and books another](../concepts.md#a-change-cancels-one-appointment-and-books-another)
   in one transaction. The request names no note, so the new appointment gets the old one's.
   The route answers `201` with the two halves, `cancelled` and `booked`.
3. The server saves the outcome and the result Claude will read: the words that the person
   confirmed, then `appointment`, the new one, and `replaced`, five fields of the old one
   (`toModel` of `backend/src/assistant/tools/changeAppointment.ts`).
4. It asks Claude for the closing words. The fake answers with that result as its text.

The test checks:

- `200` and `status` `idle`;
- the same proposal, same id, same summary, its action now with `outcome` `done` and `error`
  `null`;
- the text of the first new message is JSON with `outcome` `done`;
- its `appointment` has the day, `start` `06:00`, `end` `07:00`, `type`
  `assistant moving journey`, `note` `keep this note` and `status` `booked`;
- its `replaced` is exactly `{ id: oldId, date: <the day>, start: "04:00", end: "05:00",
  status: "cancelled" }`, and nothing more;
- the id of `appointment` is not `oldId`.

So Claude is told what the calendar now holds, in local times: a new appointment, and which one
it stands in place of. The test keeps the new id from that text as `newId`.

| Slot of the day | After test 2 |
|---|---|
| 04:00–05:00 | free again; the appointment `oldId` is `cancelled`, reason `changed` |
| 05:00–06:00 | free |
| 06:00–07:00 | booked by `chat-move`, note `keep this note` (`newId`) |

## Test 3: the calendar's own route

`chat-move` reads their appointments twice, through the calendar's route and without the
assistant.

First `GET /calendar/appointments?upcoming=true`: the server lists a User's own booked
appointments that have not ended. The test checks exactly one, with the id `newId`, `typeName`
`assistant moving journey`, `status` `booked` and `note` `keep this note`.

Then `GET /calendar/appointments` from the day to the day with `status=all`, which adds the
cancelled ones. The server lists a User's appointments by the `sub` of the token, sorted by
start. `chat-move` is a new account with a new `sub`, so the list holds only what this run made,
whatever earlier runs left on the day. The test checks the id, the `status` and the
`cancelReason` of each, in order:

| Appointment | `status` | `cancelReason` |
|---|---|---|
| `oldId`, at 04:00 | `cancelled` | `changed` |
| `newId`, at 06:00 | `booked` | none |

The old appointment of a change is cancelled with the reason `changed`, where a plain
cancellation has `cancelled` (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-02).

## Test 4: what Claude asked for

In the table, the test checks that the fifth entry of the conversation of `chat-move`
(`storedEntries()`) is one `tool_use` block: the tool `change_appointment` with the input
`{ appointmentId: oldId, date: <the day>, time: "06:00" }`, and no other field.

The id in it is the one the server made at the booking of the `beforeAll`. The fake's script
cannot hold it: the fake took it from the list of step 2 of test 1, as the real Claude must. The
input has no note, no end and no type: the tool only moves
(`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.2).

After test 2 the conversation holds seven such entries. The test looks at the fifth only:

| Entry | Role | What it is |
|---|---|---|
| 1 | `user` | the sentence of test 1 |
| 2 | `system` | the line of the application |
| 3 | `assistant` | Claude's request for `list_appointments` |
| 4 | `user` | the result of the list |
| 5 | `assistant` | Claude's request for `change_appointment` |
| 6 | `user` | the result of the change, saved at the confirmation |
| 7 | `assistant` | the closing words |

## What the block leaves

The `afterAll` runs `removeFromCalendar()`: as `admin` it cancels the booked appointment of the
type, which is the new one, deletes the window and the type, then removes `chat-move` from
cognito-local.

| In the `calendar` table | State |
|---|---|
| the appointment `oldId`, the day, 04:00–05:00 | `cancelled` with the reason `changed`, booked and cancelled by `chat-move`, `replacedBy` the new id; its pointer item too |
| the appointment `newId`, the day, 06:00–07:00 | `cancelled` with the reason `cancelled`, made by `chat-move`, cancelled by `admin`, `replaces` the old id; its pointer item too |
| events | one for the booking, one for the change, one for the cancellation |
| the window and the type | deleted for good |

A cancelled appointment keeps no slot busy, so the next run finds the three slots free again. In
the `assistant` table the items of `chat-move` stay, under a `sub` no account has any more: a
`META` with the conversation still open, `status` `idle` and the settled proposal, since no
message came after the confirmation; its seven entries; and one item of daily use with
`messages` 1.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the window cannot be created: for example
  when something else already opens hours between 04:00 and 07:00 on the day. The other blocks
  of this file open these early hours on other days, and the file's `beforeAll` has removed what
  an interrupted run of theirs left.
- The `beforeAll` also fails when `chat-move` may not book the day: `bookSlots()` reads the
  slots as the User, and `GET /calendar` gives a User only the slots they may book. The day is
  23 days ahead; the calendar's journeys leave bookings open 30 days ahead
  (`bookingHorizonDays`), but a lower value set by hand, or left by a calendar journey that
  stopped while it had lowered it, leaves no slot to book.
- The tests build on one another: test 2 needs the proposal of test 1, test 3 the `newId` of
  test 2, test 4 the entry that test 1 stored. A failed test 1 takes the others down. A failed
  check in test 3 changes nothing for test 4.
- Test 2 gets `outcome` `refused`, and fails, when a User may no longer change the appointment:
  the notice for cancelling (`cancellationNoticeHours`) is longer than the time left before the
  appointment, some 23 days. The proposal of test 1 is still made: the notice is not checked at the proposal,
  only by the route at the confirmation (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4,
  "What is not checked at the proposal").
- The `afterAll` cancels, deletes and removes whatever happened. If the run is stopped before
  it, the next run removes the booked appointment, the window and the type first, in the file's
  `beforeAll` and again in the block's: `removeFromCalendar()` looks at every day from tomorrow
  to 28 days ahead, so a run started on a later date finds them too. What was left on a day that
  has since become today or passed is not looked at.
- `chat-move` is removed with `removeUserIfPresent()`, straight in cognito-local: no
  deleted-user marker is written and nothing is cancelled by it. The cancellation of the new
  appointment is the Administrator's, in `removeFromCalendar()`.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts` |
| The read and the proposal | `runStep()` in `backend/src/assistant/exchange.ts`, with `runRead()`, `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tools | `backend/src/assistant/tools/listAppointments.ts`; `backend/src/assistant/tools/changeAppointment.ts`: its input, the facts it reads, the request to run, and what Claude gets of the route's answer |
| The facts | `instantOf()`, `appointmentById()`, `freeSlotAt()` and `summaryOf()` in `backend/src/assistant/tools/facts.ts` |
| The summary | `changes.changeAppointment` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handler of the change in `CHANGE_HANDLERS`, `backend/src/assistant/tools/changeHandlers.ts`; taking the proposal: `takeProposal()` in `backend/src/lib/assistantDb.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts`; `appointmentForModel()` in `backend/src/assistant/tools/result.ts` |
| The calendar's routes | `backend/src/handlers/listAppointments.ts`, `backend/src/handlers/getCalendar.ts` and `backend/src/handlers/changeAppointment.ts`, called inside the assistant's functions; the write of a change: `changeAppointment()` in `backend/src/lib/calendarDb.ts` |
| The fake's answers | the sentence, `tool-list-appointments-day23`, `tool-change-first-day23-0600` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the mark `{{appointment-id-1}}`: `appointmentId()` in `backend/docker/fake-claude.mjs` |
| Creating the User | `POST /users`, as `admin` (`newUser()`) |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/windows`, `POST /calendar/appointments/{appointmentId}/cancel`, `DELETE /calendar/windows/{windowId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin`; `GET /calendar` and `POST /calendar/appointments`, as `chat-move` (`bookSlots()`) |
| Test helpers | in the file: `newUser()`, `say()`, `goOn()`, `askForChange()`, `confirm()`, `appointmentsOf()`, `proposalOf()`, `storedEntries()`, `bookSlots()`, `dayOfJourney()`, `openWindow()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()`, `assistantTexts()` |
| Constants | the block's `TYPE` and `ASK`; `JOURNEY_TYPES`, `LIMIT` |
