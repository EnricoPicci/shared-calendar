# The "time blocked through the assistant (3, 5.4, 5.5)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `time blocked through the assistant (3, 5.4, 5.5)` |
| Tests | 1. "a request to block an hour: Claude reads the day and the types, then asks for the hours that are left, and the proposal shows the day as it is and as it would become"<br>2. "confirm blocks it: the proposal is shown as done, and Claude is told the day's own hours as saved"<br>3. "the calendar's own route shows the day with hours of its own, and the hour from 05:00 is no longer a free slot"<br>4. "asked what is free that day, Claude reads it again and is given the two hours left, each from the hours of the day itself"<br>5. "Claude asked for the day, the types and the hours of the day with the id of the type it read in the list, then for the day again, and nothing else" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the calendar lock](../concepts.md#the-calendar-lock),
[availability types](../concepts.md#availability-types),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[a one-day pattern and a one-off window](../concepts.md#a-one-day-pattern-and-a-one-off-window-alike-but-not-the-same),
[windows and slots](../concepts.md#windows-and-slots),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the Administrator's tools](../concepts.md#the-administrators-tools),
[the opening hours through the assistant](../concepts.md#the-opening-hours-through-the-assistant),
[the Administrator's conversation in the journeys](../concepts.md#the-administrators-conversation-in-the-journeys),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- The Administrator can block time by conversation. Blocking has no route of its own: Claude
  reads the day, takes the hour out, and asks the tool `set_date_override` for the hours that
  are left (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3).
- Claude asking changes nothing: the answer is a proposal, worded by the server from the day
  and the types it read itself, which shows the day as it is and as it would become
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rules 1 and 2).
- The day gets hours of its own only at `POST /assistant/proposals/{proposalId}/confirm`,
  which runs the code of `PUT /calendar/overrides/{date}` with the identity of the
  Administrator (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4). They take the place of
  what the weekly pattern gave that day (`docs/SHARED_CALENDAR_SPEC.md` R-OVR-01), and the
  blocked hour is no longer a free slot, in the calendar's own route as in what Claude reads.

## Who takes part

- **The Administrator** (`admin`): the person of this block, the one who talks to the
  assistant and confirms. It also prepares and removes the piece of calendar the block works
  on, and reads the day through the calendar's own route. It is the seeded account, the same
  at every run. No throw-away User takes part.
- **The fake Claude**: for the block's first sentence it asks, one step after the other, for
  `get_calendar` on the day, for `list_types`, and for `set_date_override` on the day with the
  hours 04:00–05:00 and 06:00–07:00; then it answers with the last result of a tool it was
  given, word for word. For the second sentence it asks for `get_calendar` on the day, then
  answers with that result. The type's name is written in its script, where it stands for
  the type's id (`{{id:types:assistant blocking journey}}`): the block must give its type
  that name.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any block that
uses the calendar left, today or on a day still to come (`removeFromCalendar()` for each name
of `JOURNEY_TYPES`). The block's `beforeAll`:

1. works out **the day** (`saturdayOfJourney(12)`): the first Saturday on or after the date 12
   days after today's date in the calendar's time zone, which it reads from the settings as
   `admin`. So the day is 12 to 18 days ahead. It is the day the fake asks about: its script
   names it `{{saturday+12}}`, counted from the date the server tells Claude at each message.
   The two agree unless local midnight falls between the `beforeAll` and a message;
2. removes again what its own earlier run may have left (`removeFromCalendar()`), on every day
   from today to 28 days ahead: under the type name `assistant blocking journey` it cancels
   the booked appointments, deletes the hours of its own of each day that hold the type, the
   weekly patterns of the type and its one-off windows, then the types of that name;
3. creates the type `assistant blocking journey` and a weekly pattern of it, 04:00–07:00, on
   the weekday of the day, valid from the day to the day (`openPattern()`), and checks `201`
   for both. The pattern therefore opens these hours on that one Saturday;
4. reads the day through `GET /calendar`, as `admin` (`hoursOfDay()`), and checks that its
   hours hold 04:00–07:00 of the type, from a pattern;
5. builds the sentence the proposal must show (`summary`), with the same function of `shared/`
   the server uses (`assistantTexts('en').changes.setDateOverride`): the day; as it is now,
   every window the day has that is not an extra window, said to come from the weekly
   patterns (a Saturday that already had hours of its own would have failed step 4, as it
   shows no window from a pattern); as it would
   become, the block's constant `LEFT`, 04:00–05:00 and 06:00–07:00 of the type; and the
   day's extra windows, if it has any;
6. starts the Administrator's count of the day again (`forgetDailyUse()`) and ends their
   conversation (`DELETE /assistant/conversation`, checked `204`).

The pattern gives the day three slots of one hour: 04:00, 05:00 and 06:00. The Administrator
has no conversation and all of the day's messages.

**Why a Saturday, and why a pattern.** Hours of its own replace every window the weekly
patterns give a day, and leave its extra windows open. So the block opens its hours with a
pattern, not with a one-off window as the booking blocks do; and it needs a day on which the
patterns are its own alone, or confirming would also close somebody else's hours. The
calendar's journeys leave weekly patterns, and appointments in them, on the working days,
and one pattern on one Sunday; none on a Saturday. The `calendar` table is not emptied all the same: the
`beforeAll` words the proposal from the day as it finds it.

## Test 1: a request to block an hour

`admin` sends `fake: block an hour of the day of the blocking journey`, and the test calls
`POST /assistant/continue` for as long as the reply is `working` (`sayAndRead()`). It takes
three requests:

1. **`POST /assistant/messages`.** There is no conversation, so the server asks the language:
   English. Then it asks Claude for the step. The fake asks for `get_calendar`, from the day to
   the day. The server runs the read: the code of `GET /calendar`, as `admin`. The reply is
   `working`.
2. **`POST /assistant/continue`.** The fake writes "I need the type id." and asks for
   `list_types`. The server runs the code of `GET /calendar/types`. The reply is `working`
   again.
3. **`POST /assistant/continue`.** The fake asks for `set_date_override`: the day, and the two
   stretches 04:00–05:00 and 06:00–07:00, each with the id of the type named
   `assistant blocking journey` in the list of step 2. The server saves no hours. It checks
   that the two stretches do not overlap, then reads the facts itself, as `admin`: the day
   (`presentDay()`, the code of `GET /calendar`) and the types (`presentTypes()`), to give
   each stretch the name of its type. It saves Claude's request and the proposal in one write.

| The day | Its hours | Free slots of the type |
|---|---|---|
| as it is | 04:00–07:00, from the weekly pattern | 04:00, 05:00, 06:00 |
| as it would become | 04:00–05:00 and 06:00–07:00, the day's own hours | 04:00, 06:00 |

The test checks:

- each `working` reply has `proposal` `null`, and there are two of them (`reads` is 2);
- the last reply is `200`, with `status` `awaiting_confirmation`, `activity` `null` and
  `remainingToday` equal to `LIMIT` − 1: the two `continue` are not messages of the day;
- the proposal (`proposalOf()`): a `proposalId` that is a ULID, `question` "Make this change?",
  `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and `error`
  are `null` and whose `summary` is the sentence built in the `beforeAll`;
- that this sentence holds "for this day only. As it is now (" and "As it would become:
  04:00–05:00 (assistant blocking journey), 06:00–07:00 (assistant blocking journey).": the
  person reads the day before and after;
- nothing is changed yet: the day's hours, read again through `GET /calendar`, still hold
  04:00–07:00 of the type, from a pattern.

The test keeps the `proposalId`.

## Test 2: confirm

`admin` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `PUT /calendar/overrides/{date}` with the stored body, the two
   stretches, as `admin`. The route checks the role, the date and the hours again, looks under
   the calendar lock for an overlap with an extra window of the date and then for appointments
   the new hours would leave outside them, finds none, and saves the day's own hours.
3. It saves the outcome and the result Claude will read, then asks Claude for the closing
   words. The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`;
- the same proposal, same id, same summary, its action now with `outcome` `done` and `error`
  `null`;
- the text of the first message of the reply is JSON that holds `outcome` `done`, `date` the
  day, and `hoursOfItsOwn` with the two stretches 04:00–05:00 and 06:00–07:00.

So Claude is given the day's own hours as the calendar now holds them, as two times each
(`toModel` of the tool).

## Test 3: the calendar's own route

`admin` reads the day with `GET /calendar` (`hoursOfDay()`, then `dayOfCalendar()`). The test
checks that:

- the day has `hasOverride` `true`;
- its windows that are not extra windows are exactly the two of `LEFT`, each of the type and
  with `source` `override`: the pattern's window 04:00–07:00 is gone from this day;
- the free slots of the block's type start, in local time, at exactly 04:00 and 06:00.

The pattern itself is untouched: it is the day that no longer follows it. The assistant takes
no part in this test.

## Test 4: asked what is free that day

`admin` sends `fake: what is free on the day of the blocking journey?`, again with
`sayAndRead()`. The conversation goes on, so no language is asked. The settled proposal of
test 2 leaves the replies at this message.

1. **`POST /assistant/messages`.** The fake asks for `get_calendar` on the day. The server runs
   the read; the reply is `working`.
2. **`POST /assistant/continue`.** The fake answers with the result it was given, as its text.

The test checks:

- one `working` reply (`reads` is 1), with `proposal` `null`;
- the last reply is `200`, with `status` `idle`, `proposal` `null` and `remainingToday` equal
  to `LIMIT` − 2;
- the text of the last message of the reply is JSON whose `days` is exactly one day: `date`
  the day, a `weekday` (any text), `hasOverride` `true`, `windows` the two of `LEFT` each with
  `source` `override`, `freeSlots` `["04:00", "06:00"]` and `appointments` empty.

So what Claude reads agrees with the calendar's own route: 05:00 is not offered any more.
This check names the whole day, not only the block's part of it: it holds as long as the
Saturday has no extra window and no booked appointment of anybody.

## Test 5: what Claude asked for

This test calls no route of the assistant. In the table, the test checks that the requests
for a tool stored in the Administrator's conversation in progress (`storedToolRequests()`)
are exactly four, in this order:

1. `get_calendar`, `{ from: <the day>, to: <the day> }`;
2. `list_types`, `{}`;
3. `set_date_override`, `{ date: <the day>, windows }`, the two stretches each as `start`,
   `end` and `typeId`, the id of the type the `beforeAll` created;
4. `get_calendar`, for the day again.

The id of a type is made by the server, and no script can hold it: that the third request
names the right one shows that the fake took it from the list of the second, as Claude must.
Claude gave times and an id; the names of the types and the day as it is, which the proposal
showed, came from the calendar.

## What the block leaves

The `afterAll` ends the Administrator's conversation, then removes from the calendar what
holds the block's type (`removeFromCalendar()`): the day's own hours
(`DELETE /calendar/overrides/{date}`), the weekly pattern, and the type. Then it checks
(`expectHoursAsBefore()`) that no weekly pattern of the block's type is left and that the day
has `hasOverride` `false`.

- **The `calendar` table**: nothing of the block. It booked nothing, so no appointment and no
  event; the override, the pattern and the type are deleted for good. Each of the block's
  writes moved the `version` of the calendar lock on.
- **The `assistant` table**: the Administrator's `META` with `conversationId` `null` (the
  conversation is ended), the entries of the ended conversation beside those of the
  Administrator's earlier conversations, and one item of daily use with `messages` 2, which
  stays until a block next calls `forgetDailyUse()`.

## If the block fails halfway

- The `beforeAll` fails, and every test with it, when the pattern cannot be created: for
  example when an extra window somebody else left already covers part of 04:00–07:00 on the
  day.
- The tests build on one another: test 2 needs the `proposalId` of test 1, tests 3 and 4 the
  confirmation of test 2, test 5 the four requests of tests 1 and 4. A failed test 1 takes
  them down.
- Test 1 gets no proposal when the fake's type name is not a type: for example when the
  block's `TYPE` and the script of the fake no longer agree. The mark is then left as it is,
  the tool's input is refused (`invalid_input`) and that step's reply is `working`; the next
  `continue` gets the fake's last step, a text, so the test ends with no proposal and fails
  on the number of reads.
- **A Saturday that is not empty.** The proposal says what it would do to the whole day, so
  with other weekly patterns on that Saturday (the front end's `seed:local` creates one,
  10:00–12:00) test 1 still passes: the `beforeAll` builds its sentence from the day as it is.
  Confirming then closes those hours too, for this day. If an appointment lies in them, the
  route refuses with `availability_conflict` and test 2 fails; if `GET /calendar` lists any
  booked appointment on the day, test 4 fails. A Saturday that already has hours of its own
  fails the `beforeAll`.
- A failed check skips the rest of its test, never the way back: the `afterAll` ends the
  conversation and removes the day's own hours, the pattern and the type whatever happened.
- If the run is stopped before the `afterAll`, the next run removes them first, in the file's
  `beforeAll` and again in the block's. `removeFromCalendar()` finds the day's own hours by
  looking at every day from today to 28 days ahead, and the patterns and the type by the
  type's name, wherever their dates are. Hours of its own left on a day that has since
  passed are not looked at, and need not be: only hours dated today or later keep a type
  from being deleted.
- A run stopped while the proposal waits leaves the Administrator's conversation
  `awaiting_confirmation`. The next block that talks as the Administrator, and the next run of
  this one, end the conversation before they start.
- The block removes no User: it created none.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts`; `DELETE /assistant/conversation`: `backend/src/handlers/endConversation.ts` |
| The reads | `runStep()` in `backend/src/assistant/exchange.ts`, with `runRead()` of `backend/src/assistant/tools/run.ts`; the tools `backend/src/assistant/tools/getCalendar.ts` (what the Administrator is given of a day) and `backend/src/assistant/tools/listTypes.ts` |
| The proposal made | `runStep()`, with `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tool | `backend/src/assistant/tools/setDateOverride.ts`: its input, the facts it reads, the body to send, and what Claude gets of the route's answer |
| The facts | `presentDay()`, `presentTypes()` and `hoursOf()` in `backend/src/assistant/tools/facts.ts` |
| The summary | `changes.setDateOverride` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handler of the change, `set_date_override` in `CHANGE_HANDLERS`, `backend/src/assistant/tools/changeHandlers.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts`; `toModel` in `backend/src/assistant/tools/setDateOverride.ts` |
| The calendar's routes | `backend/src/handlers/getCalendar.ts`, `backend/src/handlers/listAvailabilityTypes.ts` and `backend/src/handlers/setOverride.ts`, called inside the assistant's functions; `GET /calendar` also by the test |
| The fake's answers | the two sentences, `tool-get-calendar-saturday12`, `tool-list-types`, `tool-override-saturday12-block-0500` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the marks `{{saturday+N}}` and `{{id:LIST:NAME}}` in `backend/docker/fake-claude.mjs` |
| Preparing the calendar | `POST /calendar/types`, `POST /calendar/patterns`, `DELETE /calendar/overrides/{date}`, `DELETE /calendar/patterns/{patternId}`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/patterns`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin` |
| Test helpers | in the file: `sayAndRead()`, `say()`, `goOn()`, `confirm()`, `startAgain()`, `proposalOf()`, `storedToolRequests()`, `storedEntries()`, `saturdayOfJourney()`, `dayOfJourney()`, `openPattern()`, `hoursOfDay()`, `dayOfCalendar()`, `expectHoursAsBefore()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `forgetDailyUse()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()`, `localTimeOf()`, `weekdayOf()`, `assistantTexts()` |
| Constants | the block's `TYPE`, `ASK`, `ASK_FREE` and `LEFT`; `JOURNEY_TYPES`, `LIMIT` |
