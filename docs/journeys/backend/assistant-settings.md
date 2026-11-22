# The "a setting changed through the assistant (3, 5.4, 5.5)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a setting changed through the assistant (3, 5.4, 5.5)` |
| Tests | 1. "a request to change a setting: the proposal shows that setting as it is and as it would become, and nothing is changed"<br>2. "confirm changes it: the proposal is shown as done, and Claude is told the settings as saved"<br>3. "the calendar's own route gives the new value back, the other settings as they were, changed by the Administrator"<br>4. "Claude asked for the one setting, and nothing else"<br>5. "put back through the calendar's own route, the settings are as before the journey" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the settings](../concepts.md#the-settings),
[the calendar lock](../concepts.md#the-calendar-lock),
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

- The Administrator can change the settings by conversation, with the tool `update_settings`
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3). Claude gives only the setting to change.
- Claude asking changes nothing: the answer is a proposal, worded by the server from the
  settings it read itself, which shows the setting as it is and as it would become
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rules 1 and 2).
- The settings are saved only by `POST /assistant/proposals/{proposalId}/confirm`, which runs
  the code of `PUT /calendar/settings` with the identity of the Administrator
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.4). That route takes the four values
  together (`docs/SHARED_CALENDAR_SPEC.md` R-SET-02), so the server sends the other three as
  it read them.

## Who takes part

- **The Administrator** (`admin`): the person of this block, and the one who reads and writes
  the settings through the calendar's own routes. It is the seeded account, the same at every
  run. No throw-away User takes part.
- **The fake Claude**: for the block's sentence it first asks for the tool `update_settings`,
  with the input `{ bookingHorizonDays: 57 }`, then answers with the last result of a tool it
  was given, word for word.

## Before the block starts

The file's `beforeAll` signs in `admin`. The block's `beforeAll`:

1. reads the settings as `admin` and keeps the four values that can be written (`before`,
   through `readSettings()` and `writable()`);
2. if the booking horizon is already 57 days, writes 56 with `PUT /calendar/settings`, checks
   `200`, and takes 56 as the value before. A run stopped before its end left 57: asked again
   for 57, the server would find nothing to change and propose nothing;
3. builds the sentence the proposal must show (`summary`), with the same function of `shared/`
   the server uses (`assistantTexts('en').changes.updateSettings`): one change, the booking
   horizon, from the value before to 57;
4. starts the Administrator's count of the day again (`forgetDailyUse()`) and ends their
   conversation (`DELETE /assistant/conversation`, checked `204`).

So the block starts with the Administrator without a conversation and with all of the day's
messages, and with a booking horizon that is not 57. The other three settings are whatever the
journeys before left: the block never names their values, it only compares them with what it
read.

**Why 57.** While the block runs, and after a run that stops before the settings are put back,
the calendar has a horizon of 57 days. The assistant's journeys book no further ahead than 28
days, so that horizon refuses none of them. The journeys of the other files that depend on the
horizon write the settings they need themselves.

## Test 1: a request to change a setting

`admin` sends `fake: set the booking horizon of the settings journey`.

1. There is no conversation, so the server asks the language: English.
2. The server asks Claude for the step. The fake answers with a request for the tool
   `update_settings`: `{ bookingHorizonDays: 57 }`, one setting of the four.
3. The server saves no setting. It reads the settings as they are: it calls the code of
   `GET /calendar/settings`, as `admin` (`presentSettings()`). It compares each setting Claude
   named with its present value and keeps those that differ: here one. It prepares what the
   route will be sent at the confirmation: all four values, the horizon as asked, the other
   three as read. It saves the message, the line of the application, Claude's request and the
   proposal in one write.

The test checks:

- `200`, `language` `en`, `status` `awaiting_confirmation`, `activity` `null`,
  `remainingToday` equal to `LIMIT` − 1;
- the proposal (`proposalOf()`): a `proposalId` that is a ULID, `question` "Make this change?",
  `confirmLabel` "Confirm", `declineLabel` "Don't", and one action whose `outcome` and `error`
  are `null` and whose `summary` is the sentence built in the `beforeAll`;
- that this sentence reads, word for word, "Change the settings. Booking horizon: from *N*
  days to 57 days.", *N* being the horizon read in the `beforeAll`: the person sees the one
  setting that would change, as it is and as it would become, and none of the other three;
- nothing is changed yet: the four values, read again through `GET /calendar/settings`, equal
  those of the `beforeAll`.

The test keeps the `proposalId`.

## Test 2: confirm

`admin` calls `POST /assistant/proposals/{proposalId}/confirm` with the id of test 1.

1. The server takes the proposal, so no other request can run it.
2. It calls the code of `PUT /calendar/settings` with the stored body, the four values, as
   `admin`. The route checks the role and the values again, and saves them under the calendar
   lock.
3. It saves the outcome and the result Claude will read, then asks Claude for the closing
   words. The fake answers with that result as its text.

The test checks:

- `200`, `status` `idle`;
- the same proposal, same id, same summary, its action now with `outcome` `done` and `error`
  `null`;
- the text of the first message of the reply is JSON with `outcome` `done` and with `settings`
  equal to exactly: a `timeZone` (any text), the three other values of the `beforeAll`, and
  `bookingHorizonDays` 57.

So Claude is given the settings as the calendar now holds them, and nothing more: who saved
them, and when, is left out (`settingsForModel()`).

## Test 3: the calendar's own route

`admin` reads `GET /calendar/settings`. The test checks that the four values are those of the
`beforeAll` with `bookingHorizonDays` 57, and that `updatedBy` is
`{ username: "admin", role: "admin" }`: the settings were saved as the Administrator who
confirmed, not as the assistant.

## Test 4: what Claude asked for

This test calls no route of the assistant. In the table, the test checks that the
Administrator's conversation in progress holds five entries (`storedEntries()`), with the
roles `user`, `system`, `assistant`, `user`, `assistant`, and that the third is one `tool_use`
block: the tool `update_settings` with the input `{ bookingHorizonDays: 57 }` and no other
field.

The five entries are, in order: the message, the line of the application, Claude's request,
the result of the change stored at the confirmation, and the closing words. That Claude named
one setting, while test 3 found the other three unchanged in the calendar, shows where they
came from: the server read them at the proposal and sent them back at the confirmation.

## Test 5: the settings put back

`admin` writes the four values of the `beforeAll` with `PUT /calendar/settings`. The test
checks `200`, and that the values read again equal those of the `beforeAll`. The assistant
takes no part: the way back is the calendar's own route.

## What the block leaves

The `afterAll` writes the values of the `beforeAll` once more, checks `200`, and ends the
Administrator's conversation.

- **The settings**: the four values the block found, or a horizon of 56 where it found 57.
  `updatedAt` and `updatedBy` are those of the block's last write, by `admin`. The route
  writes the settings item and, since it writes under the calendar lock, moves the lock's
  `version` on; nothing else.
- **The `assistant` table**: the Administrator's `META` with `conversationId` `null` (the
  conversation is ended), the five entries of the ended conversation beside those of the
  Administrator's earlier conversations, and one item of daily use with `messages` 1, which
  stays until a block next calls `forgetDailyUse()`.

## If the block fails halfway

- The tests build on one another: test 2 needs the `proposalId` of test 1, tests 3 and 4 the
  confirmation of test 2. A failed test 1 takes them down. Test 5 holds whatever happened
  before it.
- A failed check skips the rest of its test, never the way back: the `afterAll` writes the
  settings of the `beforeAll` whatever happened, and test 5 does too.
- If the run is stopped after test 2 and before test 5, the horizon stays 57. No other
  block of this file is refused by it (see "Why 57"). The next run's `beforeAll` finds 57 and
  writes 56, the default (`docs/SHARED_CALENDAR_SPEC.md` section 9): the value the horizon had
  before the stopped run is not known any more.
- A run stopped while the proposal waits leaves the Administrator's conversation
  `awaiting_confirmation`. The next block that talks as the Administrator, and the next run of
  this one, end the conversation before they start.
- The block removes no User: it created none.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts`; `DELETE /assistant/conversation`: `backend/src/handlers/endConversation.ts` |
| The proposal made | `runStep()` in `backend/src/assistant/exchange.ts`, with `asksForChange()` and `proposeChange()` of `backend/src/assistant/tools/run.ts` |
| The tool | `backend/src/assistant/tools/updateSettings.ts`: its input, the settings it reads, the changes it keeps, the body to send, and what Claude gets of the route's answer |
| The settings as they are | `presentSettings()` in `backend/src/assistant/tools/facts.ts` |
| The summary | `changes.updateSettings` in `shared/src/assistant/texts.en.ts` |
| The confirmation | `confirmProposal()` in `backend/src/assistant/confirm.ts`; the handler of the change, `update_settings` in `CHANGE_HANDLERS`, `backend/src/assistant/tools/changeHandlers.ts` |
| What Claude is told | `DONE` in `backend/src/assistant/proposal.ts`; `settingsForModel()` in `backend/src/assistant/tools/result.ts` |
| The calendar's routes | `backend/src/handlers/getCalendarSettings.ts` and `backend/src/handlers/updateCalendarSettings.ts`, called inside the assistant's functions and, by the test, as `GET` and `PUT /calendar/settings`; the write: `putSettings()` in `backend/src/lib/calendarDb.ts` |
| The fake's answers | the sentence, `tool-update-settings-horizon-57` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json` |
| Test helpers | in the block: `readSettings()`, `writable()`; in the file: `say()`, `confirm()`, `startAgain()`, `proposalOf()`, `storedEntries()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `forgetDailyUse()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `assistantTexts()` |
| Constants | the block's `ASK` and `ASKED`; `LIMIT` |
