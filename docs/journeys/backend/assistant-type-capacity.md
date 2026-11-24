# The "a type created with a capacity and edited through the assistant (3, 5.4)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/assistant.test.ts` |
| `describe` | `a type created with a capacity and edited through the assistant (3, 5.4)` |
| Tests | 1. "create_type with a capacity: the proposal says how many people, and confirm creates it so"<br>2. "edit_type with a capacity alone: the proposal says from and to, and confirm keeps the name" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT`, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[availability types](../concepts.md#availability-types),
[places in a slot](../concepts.md#places-in-a-slot),
[the fake Claude](../concepts.md#the-fake-claude),
[steps, `continue` and the tools](../concepts.md#steps-continue-and-the-tools),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the Administrator's tools](../concepts.md#the-administrators-tools),
[places through the assistant](../concepts.md#places-through-the-assistant),
[the Administrator's conversation in the journeys](../concepts.md#the-administrators-conversation-in-the-journeys).

## What this block proves

- `create_type` takes a capacity, and its proposal says how many people the type holds at the
  same time (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 3; `docs/SHARED_CALENDAR_SPEC.md`
  section 6.1).
- `edit_type` changes the capacity alone: the proposal says from what to what, and the
  confirmation keeps the name (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-02).

## Who takes part

- **The Administrator** (`admin`): talks to the assistant and confirms, in one conversation.
- **The fake Claude**: for the first sentence it asks for `create_type` with the name
  `assistant type capacity journey` and a capacity of 4; for the second it asks for `list_types`,
  then for `edit_type` with the id of that type, found by its name in the list, and a capacity
  of 2. After each change it answers with the last result of a tool. These answers are written by
  hand for the journey.

## Before the block starts

The block's `beforeAll` removes a type of its name an earlier run may have left
(`removeFromCalendar()`), starts the Administrator's count of the day again (`forgetDailyUse()`)
and ends their conversation (checked `204`). No type of that name exists.

## Test 1: a type created with a capacity

The test first checks the sentence `assistantTexts('en').changes.createType` writes for the name
and a capacity of 4: "Create the appointment type "assistant type capacity journey", for 4
people at the same time." `admin` then sends
`fake: create the type of the capacity journey for four people` (`sayAndRead()`). The test
checks the conversation waits for a confirmation with a proposal of that one sentence, confirms
it, and checks `idle` with the action `done`. `GET /calendar/types` then holds the type with
`capacity` 4.

## Test 2: the capacity edited

The sentence of `changes.editType`, with the capacity going from 4 to 2 and no new name, is
"Change the appointment type "assistant type capacity journey": capacity from 4 to 2." `admin`
sends `fake: let the type of the capacity journey hold two people`. The fake's `list_types` is a
read, run by the server; `sayAndRead()` drives it with `continue`. Then `edit_type` is proposed:
the server read the type's present name and capacity itself, and sends to
`PUT /calendar/types/{typeId}` at the confirmation the present name and the new capacity. The
test checks the proposal and its `done` outcome, as in test 1, then that the type has its name
and `capacity` 2. In the table, the test checks that the conversation's requests for a tool were
`create_type`, `list_types` and `edit_type`, in that order.

No appointment is booked under the type, so the lower capacity strands nobody, and the sentence
says nothing more.

## What the block leaves

The `afterAll` ends the Administrator's conversation and deletes the type
(`removeFromCalendar()`). Nothing of it stays in the `calendar` table. In the `assistant` table
the Administrator's ended conversation stays, with one item of daily use counting two messages.

## If the block fails halfway

- Test 2 needs the type of test 1: without it, the fake finds no id in the list of types.
- The `afterAll` deletes the type whatever happened; a run stopped before it is cleaned up by the
  next run's `removeFromCalendar()`, in the file's `beforeAll` and the block's.

## Where in the code

| What | Where |
|---|---|
| The tools | `backend/src/assistant/tools/createType.ts` (`CAPACITY`), `backend/src/assistant/tools/editType.ts` (what changes, `type_unchanged`, `bookedAbove()`), `backend/src/assistant/tools/listTypes.ts` |
| The sentences | `changes.createType`, `changes.editType` in `shared/src/assistant/texts.en.ts` |
| The routes run at the confirmation | `POST /calendar/types`: `backend/src/handlers/createAvailabilityType.ts`; `PUT /calendar/types/{typeId}`: `backend/src/handlers/renameAvailabilityType.ts`, through `CHANGE_HANDLERS` in `backend/src/assistant/tools/changeHandlers.ts` |
| The fake's answers | the two sentences, `tool-create-type-with-capacity`, `tool-list-types`, `tool-edit-type-capacity` and `text-last-tool-result` in `backend/tests/integration/fake-claude/answers.json`; the mark `{{id:types:NAME}}` in `backend/docker/fake-claude.mjs` |
| Test helpers | in the file: `sayAndRead()`, `confirm()`, `startAgain()`, `proposalOf()`, `storedToolRequests()`, `removeFromCalendar()`; in `backend/tests/integration/setup.ts`: `api()`, `forgetDailyUse()`, `subOf()` |
| Constants | the block's `TYPE`; `JOURNEY_TYPES` |
