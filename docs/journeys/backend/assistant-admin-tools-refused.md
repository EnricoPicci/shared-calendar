# The "a User is not offered the Administrator's tools (3, 7.4)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a User is not offered the Administrator's tools (3, 7.4)` |
| Tests | 1. "Claude asks for a tool of the Administrator: no proposal is made, and the exchange goes on"<br>2. "Claude was answered as for a tool that does not exist, with the tools of a User and none of the Administrator"<br>3. "the settings are as they were, and there is nothing to confirm" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the settings](../concepts.md#the-settings),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[the language of a conversation](../concepts.md#the-language-of-a-conversation),
[the line of the application, and the gaps in `seq`](../concepts.md#the-line-of-the-application-and-the-gaps-in-seq),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the Administrator's tools](../concepts.md#the-administrators-tools),
[the `assistant` table](../concepts.md#the-assistant-table),
[the daily limit](../concepts.md#the-daily-limit).

## What this block proves

- A tool belongs to a role. `update_settings` is the Administrator's
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3). The server does not name it to Claude in
  a User's conversation; the block does not check that, since the fake asks for it anyway.
- Should Claude ask for it all the same, the server answers as for a tool that does not exist,
  with the same code and the same sentence, so that the name is not confirmed, and no handler
  is called (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 7.4, "A tool that is not offered to
  the caller's role").
- So nothing is proposed and nothing is changed: the exchange goes on as after a read.

## Who takes part

- **`chat-notadmin`**: a throw-away User, the person of this block.
- **The Administrator** (`admin`): creates `chat-notadmin` and reads the settings, before and
  after. It does not talk to the assistant here.
- **The fake Claude**: for the block's sentence it first asks for the tool `update_settings`,
  with a booking horizon of 57 days, then answers with the last result of a tool it was given,
  word for word. The fake answers by the text of the message, whoever sends it: it does not
  look at the tools the server offered. The real model never asked this for a User (the `about`
  lines of `backend/tests/integration/fake-claude/answers.json` say so); the journey shows what
  the server would answer if it did.

## Before the block starts

The file's `beforeAll` signs in `admin`. The block's `beforeAll`:

1. creates `chat-notadmin` again and signs it in (`newUser()`);
2. reads the settings as `admin`, with `GET /calendar/settings`, and keeps the whole answer
   (`before`): the four values, the time zone, and who saved them last and when.

`chat-notadmin` is a new account: it has no conversation and all of the day's messages. The
block needs nothing of the calendar and creates nothing in it.

## Test 1: Claude asks for a tool of the Administrator

`chat-notadmin` sends `fake: change a setting, which a User cannot`.

1. There is no conversation yet, so the server asks the language: English.
2. The server asks Claude for the step. The fake answers with a request for the tool
   `update_settings`, with the input `{ bookingHorizonDays: 57 }`.
3. The server first asks whether the answer holds a change (`asksForChange()`): a tool counts
   only when the person's role is offered it, so for a User this one does not, no fact is read
   and no proposal is built. The request is then run as a read, which looks the tool up among
   the tools of the role (`checkRequest()`) and does not find it. Claude gets an error
   result: the code `unknown_tool` and a sentence that lists the tools of a User.
4. The server saves the message, the line of the application, Claude's request and that
   result. A step is now waiting: Claude must read the result.

The test checks:

- `200`;
- `status` `working` and `proposal` `null`;
- `activity` "Working…", the general line of progress
  (`assistantTexts('en').working`). A read shows the line of its tool, such as "Looking at the
  calendar's settings…"; a tool that is not of the person's role has no line to show;
- `remainingToday` equal to `LIMIT` − 1.

## Test 2: what Claude was answered

`chat-notadmin` calls `POST /assistant/continue`. The server asks Claude again, now with the
result. The fake answers with that result as its text, which is how the journey reads it.

The test checks:

- `200`, `status` `idle`, `proposal` `null`;
- the text of the first message of the reply is JSON equal to

  ```
  { error: "unknown_tool",
    message: "There is no tool with this name. The tools are: get_settings, list_types,
              get_calendar, list_appointments, book_appointment, cancel_appointment,
              change_appointment, set_appointment_note." }
  ```

  The eight names are the tools of a User, in the order Claude is given them (the test's
  `FOR_A_USER`). None of the Administrator's is among them, and neither is `update_settings`,
  the name Claude used.

In the table, the test checks that the conversation of `chat-notadmin` holds exactly one result
of a tool (`storedToolResults()`), equal to the same code and sentence.

A name Claude made up would get this very answer. The server tells the two cases apart in its
log line only (`not_offered` or `unknown_tool` in `checkRequest()`); no test of this block
reads the log.

## Test 3: nothing changed, nothing to confirm

The test checks:

- `GET /calendar/settings`, as `admin`, answers exactly what it answered in the `beforeAll`:
  the same four values, and the same `updatedAt` and `updatedBy`, so nobody saved the settings
  in between;
- the conversation of `chat-notadmin`, read back, has `status` `idle` and `proposal` `null`;
- `POST /assistant/proposals/{proposalId}/confirm` with a well-formed id that names no proposal
  (`NO_PROPOSAL`) answers `404` with the error `proposal_not_found`. No proposal was made, so
  the test has no id of its own to try: it shows that the conversation is not waiting for a
  confirmation.

## What the block leaves

Nothing in the `calendar` table: the block wrote nothing there. The `afterAll` removes
`chat-notadmin` from cognito-local.

In the `assistant` table the items of `chat-notadmin` stay, under a `sub` no account has any
more: a `META` with the conversation still open, `idle`, `proposal` `null`; its five entries
(the message, the line of the application, Claude's request, the error result, the closing
text); and one item of daily use with `messages` 1.

## If the block fails halfway

- Test 2 needs the step test 1 left waiting. If the message of test 1 is refused, `continue`
  finds nothing to do and test 2 fails too.
- Test 3 needs test 2 for its second check only: the conversation is `idle` once the
  `continue` of test 2 was answered, and still `working` if it was not. Its first check holds
  whenever nobody wrote the settings since the `beforeAll`.
  It compares the whole answer, `updatedAt` included, so a save of the very same values would
  fail it. The integration files run one at a time (`fileParallelism: false` in
  `backend/vitest.config.ts`), so no other journey writes the settings meanwhile.
- `chat-notadmin` is removed with `removeUserIfPresent()`, straight in cognito-local: no
  deleted-user marker is written, and there is no appointment to cancel. If the run is stopped
  before the `afterAll`, the next run's `newUser()` removes the account first and creates it
  again, with a new `sub`.

## Where in the code

| What | Where |
|---|---|
| The routes | `POST /assistant/messages`: `backend/src/handlers/sendAssistantMessage.ts`; `POST /assistant/continue`: `backend/src/handlers/continueAssistant.ts`; `GET /assistant/conversation`: `backend/src/handlers/getConversation.ts`; `POST /assistant/proposals/{proposalId}/confirm`: `backend/src/handlers/confirmProposal.ts` |
| The request checked | `checkRequest()` in `backend/src/assistant/tools/run.ts`, reached through `runRead()`; `asksForChange()` in the same file; the step: `runStep()` in `backend/src/assistant/exchange.ts` |
| Whose tool it is | `roles` in `updateSettingsDefinition`, `backend/src/assistant/tools/updateSettings.ts`; the tools in order: `DEFINITIONS` in `backend/src/assistant/tools/list.ts`; the tools of a role: `offeredTo()` in `backend/src/assistant/tools/tool.ts` |
| The line of progress | `activityLine()` in `backend/src/assistant/conversation.ts`; `working` in `shared/src/assistant/texts.en.ts` |
| The code | `proposal_not_found` in `REFUSALS`, `backend/src/assistant/conversation.ts` |
| The fake's answers | the sentence, `tool-update-settings-horizon-57` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json` |
| Creating the User | `POST /users`, as `admin` (`newUser()`) |
| The settings | `GET /calendar/settings`, as `admin`: `backend/src/handlers/getCalendarSettings.ts` |
| Test helpers | in the file: `newUser()`, `say()`, `goOn()`, `conversation()`, `confirm()`, `storedToolResults()`, `storedEntries()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `subOf()`, `queryAssistantPartition()`, `localDailyMessageLimit()`; from `shared/`: `assistantTexts()` |
| Constants | the block's `ASK` and `FOR_A_USER`; `NO_PROPOSAL`, `LIMIT` |
