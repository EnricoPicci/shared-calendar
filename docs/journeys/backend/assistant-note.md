# The "a note set through the assistant (5.4, 5.5)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a note set through the assistant (5.4, 5.5)` |
| Tests | 1. "a request for a note: Claude reads the appointments, then asks for the change by the id it read, and the proposal shows the new note and the one it replaces"<br>2. "confirm sets it: the proposal is shown as done, and Claude is told the appointment with its new note"<br>3. "the calendar's own route gives the note back, on the same appointment"<br>4. "Claude asked for the change with the id of the list and the note, and nothing else" |
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

- Claude names an appointment by its id and by nothing else
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.2, `set_appointment_note`). It learns the
  id by reading the list of appointments first, as the tool's description tells it
  (`backend/src/assistant/tools/setAppointmentNote.ts`).
- Claude asking for a note changes nothing: the answer is a proposal, worded by the server from
  the appointment it read itself, with the new note and the note it replaces
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4, "The appointment an id stands for is read
  through the list", and section 5.5, rules 1 and 2).
- The note is set only by `POST /assistant/proposals/{proposalId}/confirm`, which runs the code
  of the note's own route, `PATCH /calendar/appointments/{appointmentId}`
  (`docs/SHARED_CALENDAR_SPEC.md` section 8.5), and Claude is then given the appointment with
  its new note (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4).

## Who takes part

- **`chat-note`**: a throw-away User, the person of this block. They book the appointment
  themself, through the calendar's own route, before the conversation starts.
- **The Administrator** (`admin`): creates `chat-note`, and prepares and removes the piece of
  calendar the block uses.
- **The fake Claude**: for the block's sentence it answers in three steps. First it asks for the
  tool `list_appointments`, for one day. Then it asks for the tool `set_appointment_note`, with
  the id of the first appointment of the list it was given (its mark `{{appointment-id-1}}`) and
  the note `bring the documents`. Last, it answers with the last result of a tool it was given,
  word for word.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any block that
uses the calendar left on a day still to come (`removeFromCalendar()` for each name of
`JOURNEY_TYPES`). The block's `beforeAll`:

1. works out **the day** (`dayOfJourney(22)`): 22 days after today's date in the calendar's time
   zone, which it reads from the settings as `admin`. It is the day the fake asks the list of:
   its script names it `{{date+22}}`, counted from the date the server tells Claude at the
   message of test 1. The two agree unless local midnight falls between the `beforeAll` and
   test 1;
2. creates `chat-note` again and signs it in (`newUser()`);
3. removes again what its own earlier run may have left (`removeFromCalendar()`), on every day
   from tomorrow to 28 days ahead: it cancels the booked appointments whose type is named
   `assistant note journey`, deletes the one-off windows of that type, then the types of that
   name;
4. creates the type `assistant note journey` and, on the day, a one-off window 05:00–07:00 of
   that type (`openWindow()`), and checks `201` for both;
5. books, as `chat-note` and through `POST /calendar/appointments`, the first free slot of that
   type on the day, with the note `first note` (`bookSlots()`), checks `201`, and keeps the
   appointment's id.

So the block starts with one appointment of `chat-note`, at 05:00 on the day, booked without the
assistant, with the note `first note`. `chat-note` is a new account: it has no other appointment
and no conversation. The `calendar` table is not emptied: the day may hold other things, and the
block looks only at its own.

## Test 1: a request for a note

`chat-note` sends `fake: add a note to my appointment of the note journey`
(`askForChange()`). The proposal comes after two requests.

1. `POST /assistant/messages`. There is no conversation yet, so the server asks the language:
   English. Then it asks Claude for the step. The fake asks for `list_appointments`, from the
   day to the day. The server runs this read: it calls the code of `GET /calendar/appointments`
   as `chat-note`, which lists a User's own booked appointments of that day. It saves the
   message, the line of the application, Claude's request and the result.
2. `POST /assistant/continue`. The server asks Claude again, now with the list. The fake asks
   for `set_appointment_note`: the id of the first appointment of that list, and the note
   `bring the documents`.
3. The server sets no note. It reads the appointment the id stands for
   (`appointmentById()`): it calls the code of `GET /calendar/appointments` again, as
   `chat-note`, for the appointments that have not ended, and looks for the id in the answer.
   It finds the appointment, booked, with the note `first note`. The new note differs from it,
   so the change can be proposed. The server saves Claude's request and the proposal in one
   write.

The test checks:

- after the first request (inside `askForChange()`): `200`, `status` `working`, `activity`
  "Looking at the appointments…", `proposal` `null`;
- after the second: `200` (inside `askForChange()`), `status` `awaiting_confirmation`,
  `activity` `null`, `remainingToday` equal to `LIMIT` − 1: `continue` is not a message;
- the proposal (`proposalOf()`): a `proposalId` that is a ULID, `question` "Make this change?",
  `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and `error`
  are `null` and whose `summary` is the sentence the shared texts make for a note: the
  appointment on the day, 05:00 to 06:00, of the type `assistant note journey`, with no username
  (a User's proposals are about their own appointments), the note `bring the documents` and the
  previous note `first note`. The test builds the expected sentence with the same function of
  `shared/` the server uses (`assistantTexts('en').changes.setAppointmentNote`), so it checks
  the facts in it, not its wording;
- that this expected sentence holds `"bring the documents"` and `"first note"`, each between
  double quotes: the person sees the note as it would become and the one it replaces;
- nothing is changed yet: `GET /calendar/appointments?upcoming=true` gives `chat-note` one
  appointment, whose note is still `first note` (`appointmentsOf()`).

The test keeps the `proposalId`.

## Test 2: confirm

`chat-note` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `PATCH /calendar/appointments/{appointmentId}` with the stored request,
   the body `{ note: "bring the documents" }`, as `chat-note`. The route checks again that the
   appointment is theirs, booked and not ended, and writes the note.
3. It saves the outcome and the result Claude will read, then asks Claude for the closing words.
   The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`;
- the same proposal, same id, same summary, its action now with `outcome` `done` and `error`
  `null`;
- exactly one new message, from `assistant`;
- its text is JSON with `outcome` `done`, a `message` that holds "pressed the confirm button",
  and an `appointment` with `id` the id kept in the `beforeAll`, the day, `start` `05:00`,
  `note` `bring the documents`, `status` `booked`.

So Claude is told that the person confirmed and the change was made, and it is given the
appointment as the calendar now holds it: the same appointment, with the new note.

## Test 3: the calendar's own route

`chat-note` lists their appointments with `GET /calendar/appointments?upcoming=true`
(`appointmentsOf()`). The server lists a User's own booked appointments that have not ended.
The test checks exactly one, with the id kept in the `beforeAll`, `note` `bring the documents`
and `status` `booked`: the note was set on the appointment that was there, and no other was
made.

## Test 4: what Claude asked for

This test calls no route of the assistant. In the table, the test checks that the conversation
of `chat-note` holds seven entries (`storedEntries()`), with the roles `user`, `system`,
`assistant`, `user`, `assistant`, `user`, `assistant`, and that:

- the third is one `tool_use` block: the tool `list_appointments` with the input
  `{ from: <the day>, to: <the day> }`;
- the fifth is one `tool_use` block: the tool `set_appointment_note` with the input
  `{ appointmentId: <the id kept in the beforeAll>, note: "bring the documents" }`, and no
  other field.

The seven entries are, in order: the message, the line of the application, Claude's request for
the list, the list, Claude's request for the change, the result of the change stored at the
confirmation, and the closing words. The test looks at the content of the third and the fifth
only.

The fifth entry is the point of the test. The fake's script holds no id: it holds the mark
`{{appointment-id-1}}`, which the fake replaces with the id of the first appointment in the
list it was given. That the stored id equals the one the booking route answered in the
`beforeAll` shows that the id went from the calendar to Claude through the list, and back to
the server in the request for the change.

## What the block leaves

The `afterAll` cancels the appointment as `admin`, deletes the window and the type
(`removeFromCalendar()`), then removes `chat-note` from cognito-local.

| In the `calendar` table | State |
|---|---|
| the appointment of `chat-note`, the day, 05:00–06:00 | `cancelled`, booked by `chat-note`, cancelled by `admin`, its note `bring the documents`; its pointer item too |
| events | one for the booking, one for the note, one for the cancellation |
| the window and the type | deleted for good |

A cancelled appointment keeps no slot busy, so the next run finds 05:00 free again. In the
`assistant` table the items of `chat-note` stay, under a `sub` no account has any more: a `META`
with the conversation still open, `idle`, and the settled proposal (no later message removed
it), its seven entries, and one item of daily use with `messages` 1.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the window cannot be created (for example
  when something else already opens 05:00–07:00 on the day), or when `chat-note` cannot book:
  `GET /calendar` gives a User only the slots that User may book, so with bookings open fewer
  than 22 days ahead (`bookingHorizonDays`, set by hand or left by a calendar journey that
  stopped while it had lowered it) `bookSlots()` finds no slot of the type.
- The tests build on one another: test 2 needs the proposal of test 1, test 3 the confirmation
  of test 2, and test 4 the whole exchange. A failed test 1 takes the others down. A failed
  check in test 3 changes nothing for test 4.
- A failed check inside `askForChange()` after the first request leaves the conversation
  `working`, with no proposal: test 2 then has no id to confirm.
- The `afterAll` cancels, deletes and removes whatever happened. If the run is stopped before
  it, the next run removes the appointment, the window and the type first, in the file's
  `beforeAll` and again in the block's: `removeFromCalendar()` looks at every day from tomorrow
  to 28 days ahead, so a run started on a later date finds them too. What was left on a day
  that has since become today or passed is not looked at.
- `chat-note` is removed with `removeUserIfPresent()`, straight in cognito-local: no
  deleted-user marker is written and nothing is cancelled by it. The cancellation is the
  Administrator's, in `removeFromCalendar()`.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts` |
| The read, then the proposal | `runStep()` in `backend/src/assistant/exchange.ts`, with `runRead()`, `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tools | `backend/src/assistant/tools/listAppointments.ts`; `backend/src/assistant/tools/setAppointmentNote.ts`: its input, the facts it reads, the request to run, and what Claude gets of the route's answer |
| The appointment an id stands for | `appointmentById()` and `summaryOf()` in `backend/src/assistant/tools/facts.ts` |
| The summary | `changes.setAppointmentNote` in `shared/src/assistant/texts.en.ts` |
| The line of progress | `reading.appointments` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handler of the change, `set_appointment_note` in `CHANGE_HANDLERS`, `backend/src/assistant/tools/changeHandlers.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts`; `appointmentForModel()` in `backend/src/assistant/tools/result.ts` |
| The calendar's routes | `backend/src/handlers/listAppointments.ts` and `backend/src/handlers/updateAppointmentNote.ts`, called inside the assistant's functions; `POST /calendar/appointments`: `backend/src/handlers/bookAppointment.ts` |
| The fake's answers | the sentence, `tool-list-appointments-day22`, `tool-set-note-first` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the mark `{{appointment-id-N}}` in `backend/docker/fake-claude.mjs` |
| Creating the User | `POST /users`, as `admin` (`newUser()`) |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/windows`, `POST /calendar/appointments/{appointmentId}/cancel`, `DELETE /calendar/windows/{windowId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin`; `GET /calendar` and `POST /calendar/appointments`, as `chat-note` (`bookSlots()`) |
| Test helpers | in the file: `newUser()`, `bookSlots()`, `askForChange()`, `say()`, `goOn()`, `confirm()`, `appointmentsOf()`, `proposalOf()`, `storedEntries()`, `dayOfJourney()`, `openWindow()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()`, `assistantTexts()` |
| Constants | the block's `TYPE` and `ASK`; `JOURNEY_TYPES`, `LIMIT` |
