# The "a weekly pattern created and deleted through the assistant (3, 5.4, 5.5)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a weekly pattern created and deleted through the assistant (3, 5.4, 5.5)` |
| Tests | 1. "a request for a weekly pattern: Claude reads the types, then asks for the pattern, and the proposal names its weekday, hours, type and dates; nothing is created"<br>2. "confirm creates it: Claude is told the pattern with its id, and the calendar opens those hours on the one Sunday between its dates"<br>3. "a request to delete it: Claude reads the patterns, then asks for the deletion by the id it read, and the proposal names the pattern in full"<br>4. "confirm deletes it: Claude is told so, the pattern is gone and the Sunday has those hours no more"<br>5. "Claude asked for the pattern with a weekday in words and the id of the type, and for the deletion with the id of the pattern, and nothing else" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the calendar lock](../concepts.md#the-calendar-lock),
[availability types](../concepts.md#availability-types),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[windows never overlap](../concepts.md#windows-never-overlap),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the Administrator's tools](../concepts.md#the-administrators-tools),
[the opening hours through the assistant](../concepts.md#the-opening-hours-through-the-assistant),
[the Administrator's conversation in the journeys](../concepts.md#the-administrators-conversation-in-the-journeys),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- The Administrator can create and delete a weekly pattern by conversation, with the tools
  `create_pattern` and `delete_pattern` (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3).
  Claude names the type and the pattern by their ids, which it reads in the lists first, and
  the weekday by a word.
- Claude asking changes nothing: each answer is a proposal, worded by the server from the
  types and the patterns it read itself, which names the pattern in full
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rules 1 and 2).
- The pattern is created, and later deleted, only at
  `POST /assistant/proposals/{proposalId}/confirm`, which runs the code of
  `POST /calendar/patterns` and of `DELETE /calendar/patterns/{patternId}` with the identity
  of the Administrator (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4). While it exists
  it opens its hours on the dates of its weekday between its two dates
  (`docs/SHARED_CALENDAR_SPEC.md` R-PAT-01).

## Who takes part

- **The Administrator** (`admin`): the person of this block, the one who talks to the
  assistant and confirms twice. It also creates and removes the type, and reads the patterns
  and the Sunday through the calendar's own routes. It is the seeded account, the same at
  every run. No throw-away User takes part.
- **The fake Claude**: for the first sentence it asks for `list_types`, then for
  `create_pattern`: Sunday, 04:00–06:00, the type, valid from the day 12 days after today to
  the day 18 days after. For the second it asks for `list_patterns`, then for
  `delete_pattern`. After each it answers with the last result of a tool it was given, word
  for word. The type's name is written in its script, where it stands for the id of the type
  (`{{id:types:assistant pattern journey}}`) and for the id of the pattern of that type
  (`{{id:patterns:assistant pattern journey}}`): the block must give its type that name.

## Before the block starts

The file's `beforeAll` signs in `admin` and removes what an interrupted run of any block that
uses the calendar left, today or on a day still to come (`removeFromCalendar()` for each name
of `JOURNEY_TYPES`). The block's
`beforeAll`:

1. works out **the two dates** of the pattern, `from` and `until` (`dayOfJourney(12)` and
   `dayOfJourney(18)`): 12 and 18 days after today's date in the calendar's time zone, which
   it reads from the settings as `admin`. They are the dates the fake asks for: its script
   names them `{{date+12}}` and `{{date+18}}`, counted from the date the server tells Claude
   at the message of test 1. The two agree unless local midnight falls between the
   `beforeAll` and test 1;
2. finds **the Sunday** (`sunday`): seven days in a row hold each weekday once, so exactly one
   Sunday lies from `from` to `until`. A Sunday, because the calendar's journeys leave no
   Sunday with hours of its own, which would not follow the new pattern (see "If the block
   fails halfway");
3. removes again what its own earlier run may have left (`removeFromCalendar()`): the weekly
   patterns of the types named `assistant pattern journey`, then those types;
4. creates the type `assistant pattern journey`, checks `201` and keeps its id. It opens no
   hours: the pattern is the assistant's to create;
5. keeps the facts the two proposals must name (`facts`): weekday 7, 04:00 to 06:00, the
   type's name, `from` and `until`;
6. starts the Administrator's count of the day again (`forgetDailyUse()`) and ends their
   conversation (`DELETE /assistant/conversation`, checked `204`).

So the block starts with a type that nothing uses, no pattern of that type, and the
Administrator without a conversation and with all of the day's messages. The `calendar` table
is not emptied: the block looks only at the patterns of its own type
(`patternsOfJourney()`, which filters the answer of `GET /calendar/patterns` on the type's
id) and at the windows of its own type on the Sunday.

## Test 1: a request for a weekly pattern

`admin` sends `fake: open the weekly pattern of the pattern journey`, and the test calls
`POST /assistant/continue` for as long as the reply is `working` (`sayAndRead()`).

1. **`POST /assistant/messages`.** There is no conversation, so the server asks the language:
   English. Then it asks Claude for the step. The fake writes "I need the type id." and asks
   for `list_types`. The server runs the code of `GET /calendar/types`, as `admin`. The reply
   is `working`.
2. **`POST /assistant/continue`.** The fake asks for `create_pattern`:
   `{ weekday: "Sunday", start: "04:00", end: "06:00", typeId, validFrom, validUntil }`, the
   `typeId` being the id of the type named `assistant pattern journey` in the list of step 1.
   The server creates nothing. It reads the types itself, as `admin` (`presentTypes()`),
   finds the name of the type, and prepares what the route will be sent at the confirmation:
   the same fields with the weekday as its number, 7. It saves Claude's request and the
   proposal in one write.

The server looks at nothing else: whether the new hours overlap other hours, and whether the
calendar already holds its fifty patterns (`docs/SHARED_CALENDAR_SPEC.md` R-AV-01 and
R-PAT-04), are the route's to check when the person confirms.

The test builds the sentence the proposal must show, with the same function of `shared/` the
server uses (`assistantTexts('en').changes.createPattern`, given `facts`). The test checks:

- one `working` reply (`reads` is 1), with `proposal` `null`;
- that the sentence holds "Create a weekly pattern: every Sunday, from 04:00 to 06:00
  (assistant pattern journey), valid from "; the two dates follow, each written in full;
- the last reply is `200`, with `status` `awaiting_confirmation` and `remainingToday` equal to
  `LIMIT` − 1;
- the proposal (`proposalOf()`): a `proposalId` that is a ULID, `question` "Make this change?",
  `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and `error`
  are `null` and whose `summary` is that sentence;
- nothing is created: `GET /calendar/patterns` holds no pattern of the block's type.

The test keeps the `proposalId`.

## Test 2: confirm creates it

`admin` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `POST /calendar/patterns` with the stored body, as `admin`. The route
   checks the role and the fields again and, under the calendar lock, the limit, the overlap
   and the appointments the change would leave outside the hours; it creates the pattern and
   gives it an id.
3. The server saves the outcome and the result Claude will read, then asks Claude for the
   closing words. The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`;
- the proposal of test 1, same id, its action with `outcome` `done` and `error` `null`;
- the text of the first message of the reply is JSON that holds `outcome` `done` and a
  `pattern` with `weekday` `Sunday`, `start` `04:00`, `end` `06:00`, `validFrom` and
  `validUntil` the two dates. The test keeps the `id` of that pattern;
- `GET /calendar/patterns` holds exactly one pattern of the block's type: its `patternId` is
  the id Claude was given, its `weekday` is 7, with the same hours and dates;
- the Sunday, read through `GET /calendar` as `admin` (`hoursOfDay()`), has among its hours
  04:00–06:00 of the type, from a pattern.

So Claude is given the pattern as the calendar now holds it, the weekday as a word again, and
with the id a later request can name (`patternForModel()`).

## Test 3: a request to delete it

`admin` sends `fake: delete the weekly pattern of the pattern journey`, again with
`sayAndRead()`. The conversation goes on, so no language is asked.

1. **`POST /assistant/messages`.** The fake asks for `list_patterns`. The server runs the code
   of `GET /calendar/patterns` and, to give each pattern the name of its type, of
   `GET /calendar/types`. The reply is `working`.
2. **`POST /assistant/continue`.** The fake asks for `delete_pattern`, with the id of the
   pattern whose type is named `assistant pattern journey` in the list of step 1. The server
   deletes nothing. It reads the patterns and the types itself (`presentPatterns()`,
   `presentTypes()`), finds the pattern the id stands for, and words it in full. It saves
   Claude's request and the proposal.

The test builds the sentence with `assistantTexts('en').changes.deletePattern`, given the
same `facts` as in test 1. The test checks:

- one `working` reply (`reads` is 1), with `proposal` `null`;
- that the sentence holds "Delete the weekly pattern: every Sunday, from 04:00 to 06:00";
- the last reply is `200`, with `status` `awaiting_confirmation`, the proposal with that one
  sentence, waiting, and `remainingToday` equal to `LIMIT` − 2;
- nothing is deleted: `GET /calendar/patterns` still holds one pattern of the block's type.

Claude gave an id and nothing else; the weekday, the hours, the type and the dates the
person reads came from the calendar. The test keeps the new `proposalId`.

## Test 4: confirm deletes it

`admin` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 3. The
server takes the proposal and calls the code of `DELETE /calendar/patterns/{patternId}`, as
`admin`. The route looks, under the calendar lock, for appointments the deletion would leave
outside the opening hours; nobody booked, so it deletes the pattern and answers with no body.
The server tells Claude so in a word, `deleted: true`, and the fake answers with that result.

The test checks:

- `200`, `status` `idle`;
- the proposal of test 3, same id, its action with `outcome` `done` and `error` `null`;
- the text of the last message of the reply is JSON that holds `outcome` `done` and
  `deleted` `true`;
- `GET /calendar/patterns` holds no pattern of the block's type;
- the Sunday, read through `GET /calendar`, has no window of the block's type among its
  hours.

## Test 5: what Claude asked for

This test calls no route of the assistant. In the table, the test checks that the requests
for a tool stored in the Administrator's conversation in progress (`storedToolRequests()`)
are exactly four, in this order:

1. `list_types`, `{}`;
2. `create_pattern`, `{ weekday: "Sunday", start: "04:00", end: "06:00", typeId, validFrom,
   validUntil }`: the id of the type the `beforeAll` created, the two dates of the `beforeAll`;
3. `list_patterns`, `{}`;
4. `delete_pattern`, `{ patternId }`: the id Claude was given in test 2.

The ids of a type and of a pattern are made by the server, and no script can hold them: that
the second and the fourth request name the right ones shows that the fake took each from the
list before it, as Claude must. The weekday is the word Claude wrote; the number 7 the route
needs is the server's doing, seen in test 2 through `GET /calendar/patterns`.

## What the block leaves

The `afterAll` ends the Administrator's conversation, deletes the type
(`removeFromCalendar()`, which finds no pattern left to delete), and checks that
`GET /calendar/types` holds no type named `assistant pattern journey`.

- **The `calendar` table**: nothing of the block. The pattern was deleted in test 4 and the
  type at the end; nothing was booked, so no appointment and no event. Each of the block's
  writes moved the `version` of the calendar lock on.
- **The `assistant` table**: the Administrator's `META` with `conversationId` `null` (the
  conversation is ended), the entries of the ended conversation beside those of the
  Administrator's earlier conversations, and one item of daily use with `messages` 2, which
  stays until a block next calls `forgetDailyUse()`.

## If the block fails halfway

- The tests build on one another: test 2 needs the `proposalId` of test 1, test 3 the pattern
  of test 2, test 4 the `proposalId` of test 3, test 5 the id of test 2 and the four
  requests. A failed test 1 takes them down.
- Test 1 gets no proposal when the fake's type name is not a type: for example when the
  block's `TYPE` and the script of the fake no longer agree.
- **A Sunday that does not follow the patterns.** The last check of test 2 needs the Sunday
  to take its hours from the weekly patterns. A date that has hours of its own does not
  (`docs/SHARED_CALENDAR_SPEC.md` R-PAT-01): the pattern is created all the same, and the
  check fails. The calendar's journeys (`backend/tests/integration/calendar.test.ts`) leave
  no such Sunday: the one day they leave with hours of its own is a Monday, 15 to 21 days
  after the day they ran (block `date overrides and one-off windows (routes 11–14)`), which
  is why the block's pattern is on a Sunday and not on a working day. On a Sunday they leave
  one weekly pattern alone, 01:00–04:00 on the next Sunday the clocks go forward (block
  `calendar view (route 15)`): it is of another type and ends where the block's hours begin,
  so it stands in the way of nothing even when that Sunday is the block's. Only hours of its
  own that somebody set by hand on the block's Sunday make this check fail.
- The confirmation of test 2 is refused, and test 2 fails, when somebody else's extra window
  or weekly pattern overlaps 04:00–06:00 on that Sunday (`availability_overlap`), or when the calendar already
  holds fifty patterns (`limit_reached`).
- A failed check skips the rest of its test, never the way back: the `afterAll` ends the
  conversation and removes the patterns of the type and the type whatever happened. So a run
  whose test 4 failed still leaves no pattern.
- If the run is stopped before the `afterAll`, the next run removes the pattern and the type
  first, in the file's `beforeAll` and again in the block's: `removeFromCalendar()` finds
  them by the type's name, whatever the pattern's dates. The next run also ends the
  Administrator's conversation before it starts, so a proposal left waiting is gone with it.
- The block removes no User: it created none.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts`; `DELETE /assistant/conversation`: `backend/src/handlers/endConversation.ts` |
| The reads | `runStep()` in `backend/src/assistant/exchange.ts`, with `runRead()` of `backend/src/assistant/tools/run.ts`; the tools `backend/src/assistant/tools/listTypes.ts` and `backend/src/assistant/tools/listPatterns.ts` (which asks a second route, for the names of the types) |
| The proposals made | `runStep()`, with `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tools | `backend/src/assistant/tools/createPattern.ts` and `backend/src/assistant/tools/deletePattern.ts`: the input, the facts each reads, the request to run, and what Claude gets of the route's answer |
| The facts | `presentTypes()`, `presentPatterns()`, `patternById()` and `patternSummaryOf()` in `backend/src/assistant/tools/facts.ts` |
| The summaries | `changes.createPattern` and `changes.deletePattern` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handlers of the changes, `create_pattern` and `delete_pattern` in `CHANGE_HANDLERS`, `backend/src/assistant/tools/changeHandlers.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts`; `patternForModel()` and `WEEKDAY_NAMES` in `backend/src/assistant/tools/result.ts` |
| The calendar's routes | `backend/src/handlers/listAvailabilityTypes.ts`, `backend/src/handlers/listPatterns.ts`, `backend/src/handlers/createPattern.ts` and `backend/src/handlers/deletePattern.ts`, called inside the assistant's functions; `GET /calendar/patterns`, `GET /calendar/types` and `GET /calendar` (`backend/src/handlers/getCalendar.ts`) by the test |
| The fake's answers | the two sentences, `tool-list-types`, `tool-create-pattern-sunday`, `tool-list-patterns`, `tool-delete-pattern-of-journey` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the marks `{{date+N}}` and `{{id:LIST:NAME}}` in `backend/docker/fake-claude.mjs` |
| Preparing the calendar | `POST /calendar/types`, `DELETE /calendar/types/{typeId}`, `GET /calendar`, `GET /calendar/types`, `GET /calendar/patterns`, `GET /calendar/appointments`, `GET /calendar/settings`, as `admin` |
| Test helpers | in the block: `patternsOfJourney()`; in the file: `sayAndRead()`, `say()`, `goOn()`, `confirm()`, `startAgain()`, `proposalOf()`, `storedToolRequests()`, `storedEntries()`, `dayOfJourney()`, `hoursOfDay()`, `dayOfCalendar()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `forgetDailyUse()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `addDays()`, `localDateOf()`, `localTimeOf()`, `weekdayOf()`, `assistantTexts()` |
| Constants | the block's `TYPE`, `ASK` and `ASK_DELETE`; `JOURNEY_TYPES`, `LIMIT` |
