# The "a proposal declined" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/assistant.test.ts` |
| `describe` | `a proposal declined` |
| Tests | 1. "send: a proposal waits, and the day is read as it is before any answer to it"<br>2. "decline: the fixed notice, no proposal any more, the conversation waits for the person, and it is not a message of the day"<br>3. "the calendar is unchanged: the same day, slot for slot, and no appointment of the person"<br>4. "the declined proposal is gone: it can be neither confirmed nor declined again"<br>5. "load: the request and the notice, and nothing to confirm" |
| Runs against | the local stack: the API on port 3000, cognito-local on port 9229, the fake Claude on port 9230 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[the assistant's service: one stream for six calls](../concepts.md#the-assistants-service-one-stream-for-six-calls),
[the assistant in the journeys](../concepts.md#the-assistant-in-the-journeys),
[the fake Claude](../concepts.md#the-fake-claude),
[a proposal, and its two buttons](../concepts.md#a-proposal-and-its-two-buttons),
[the daily limit](../concepts.md#the-daily-limit),
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the deleted-user marker](../concepts.md#the-deleted-user-marker),
[the `assistant` table](../concepts.md#the-assistant-table).

## What this block proves

- `AssistantService.decline()` settles a proposal without any change: the reply carries the
  server's fixed notice and no proposal, and the calendar is as it was
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` sections 5.4 and 5.5).
- Declining is not a message of the day (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 6).
- A declined proposal is gone: `confirm` and `decline` answer `proposal_not_found`, each as an
  outcome of its own call (`docs/FRONTEND_SERVICES.md` section 21.3).

## Who takes part

- **`fe-assistant-decline`**: a plain User the block creates. It signs in, talks to the assistant
  through one `AssistantService`, and reads its own calendar.
- **The Administrator** (`admin`): creates and removes the User, the type and the window.
- **The fake Claude**: answers for Anthropic, in test 1 only. A decline asks it nothing.

## Before the block starts

The file's `beforeAll` has refused the real Claude, signed the Administrator in and worked out
today's date in the calendar's time zone.

The block's `beforeAll` calls the helper
`open('fe-assistant-decline', 'fe-assistant declining', 27)`. It removes what an earlier run left,
creates the type `fe-assistant declining`, opens one extra window of that type, **05:00–07:00**,
on the 27th day after today, and creates and signs in the User. The fake asks to book 05:00 on
that day.

The User is new, so it has no appointment at all. A User's calendar view and a User's list hold
the caller's own appointments only, found by the token. That is why "no appointment" in this
block means that nothing was booked for this User, whatever else the day holds.

## Test 1: send, and the day as it is

`fe-assistant-decline` calls `send()` with the sentence
`fake: book me the slot of the declining journey`. The test checks that the reply says
`awaiting_confirmation` and holds the proposal of one booking: the question, the two labels, and
the server's sentence for the block's day, from 05:00 to 06:00, of the type
`fe-assistant declining`, with `outcome` and `error` `null`.

The test keeps the proposal's id, and `remainingToday` as `left`. Then it loads the block's day
as the User, through `CalendarService` (the helper `dayOf()`), keeps the whole view as `before`,
and checks that the view lists no appointment.

## Test 2: decline

`fe-assistant-decline` calls `decline()` with the proposal's id. The server changes nothing and
asks Claude nothing. The test checks that:

- the reply says `idle`, with `activity` `null` and `proposal` `null`: a declined proposal is not
  shown again;
- `remainingToday` is still `left`: the decline counted nothing;
- the messages added are one, from `notice`, with the text `Nothing was changed.` It is a fixed
  text of the server, in the conversation's language.

## Test 3: the calendar is unchanged

The test loads the same day again as the User and checks that the view **equals** the one of test
1, field for field: the same windows, the same free slots, the same busy time, no appointment.
One field is left out of the comparison, `generatedAt`, the instant the server made the view at,
which differs at every read (the helper `withoutItsInstant()`). Then it checks that the User's
list of upcoming appointments is empty.

## Test 4: the declined proposal is gone

`fe-assistant-decline` calls `confirm()`, then `decline()`, with the same id. The requests leave,
and the API answers `404` to both. The test checks that both outcomes say `failure` with the
reason `proposal_not_found`, the first with `call: 'confirm'` and the second with
`call: 'decline'`, and that the list of upcoming appointments is still empty: a late press of
"Confirm" books nothing.

## Test 5: load

`fe-assistant-decline` calls `load()`. The test checks that the reply says `idle`, with no
proposal and `remainingToday` still `left`, and that the conversation holds exactly two messages:
the person's sentence, then the notice `Nothing was changed.`

## What the block leaves

The block's `afterAll` calls `close()`: the User is deleted, then the window, then the type.
Nothing of the block stays in the calendar but the deleted-user marker of
`fe-assistant-decline`. The `assistant` table keeps the conversation and the day's count of one
message, under an account that no longer exists. Nobody reads them; in the cloud they would
expire by themselves, which DynamoDB Local may never do.

## If the block fails halfway

A failed test does not stop the block: the later tests run, and each needs what the ones before
it did.

- Test 1 sets what the others use: the proposal's id (tests 2 and 4), `left` (tests 2 and 5) and
  `before` (test 3).
- Tests 4 and 5 need the decline of test 2. If it did not go through, the proposal still waits:
  the `confirm` of test 4 then **books** 05:00 instead of finding no proposal, and test 5 finds
  another conversation than it expects.

The `afterAll` runs in any case; should the run be killed before it, the next run's `open()`
removes the User, the window and the type first. In a run that passes nothing is ever booked. In
the failed run just told, deleting the User cancels that appointment, which stays in the
`calendar` table as history with its two events.

If hours somebody else opened lie on the block's day between 05:00 and 07:00, opening the window
fails with `availability_overlap` in the `beforeAll`, and every test of the block fails.

## Where in the code

| What | Where |
|---|---|
| The calls | `AssistantService` (`frontend/src/services/assistant.service.ts`), all on the stream `outcome$`: `send(text)` → `POST /assistant/messages`; `decline(proposalId)` → `POST /assistant/proposals/{proposalId}/decline`; `confirm(proposalId)` → `POST /assistant/proposals/{proposalId}/confirm`; `load()` → `GET /assistant/conversation` |
| The calendar read back | `CalendarService.load()` on `calendarResult$` → `GET /calendar` (helper `dayOf()`); `AppointmentsService.list()` on `appointmentsResult$` → `GET /calendar/appointments` (helper `upcoming()`) |
| The expected proposal | the helper `bookingProposal()`, with `assistantTexts()` of `shared/` |
| The stage | the helpers `open()`, `close()`, `removeUser()`, `removeFromCalendar()` |
| Constants | `USER` (`fe-assistant-decline`), `TYPE` (`fe-assistant declining`), `ASK` (the sentence) |
| What the fake answers | `backend/tests/integration/fake-claude/answers.json`, under the sentence |
