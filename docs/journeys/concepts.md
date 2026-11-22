# The ideas the journeys use

The journey pages (`docs/journeys/README.md`) link here for the ideas that several of them need.
Each section explains one idea in simple words and names the document that defines it:
`docs/SHARED_CALENDAR_SPEC.md` for the calendar, `docs/ARCHITECTURE.md` and
`docs/CONVERSATIONAL_ARCHITECTURE.md` for the assistant. On any conflict, that document wins.

## The people of the local stack

| Name | What it is | Made by |
|---|---|---|
| `admin` | the Administrator: sees and manages everything | `local:up` (seed) |
| `alice` | a plain User | `local:up` (seed) |
| `carol` | a throw-away User of the Hello World journeys | `backend/tests/integration/journeys.test.ts` |
| `dave`, `erin` | throw-away Users of the back end's calendar journeys | `backend/tests/integration/calendar.test.ts` |
| `fe-calendar`, `fe-calendar-b` | throw-away Users of the front end's calendar journeys | `frontend/tests/integration/calendar.test.ts` |
| `fe-journey` | a throw-away User of the front end's Hello World journeys | `frontend/tests/integration/journeys.test.ts` |
| `chat-text`, `chat-lingua`, `chat-read`, `chat-book`, `chat-decline`, `chat-trouble`, `chat-note`, `chat-move`, `chat-cancel`, `chat-limit`, `chat-down` | throw-away Users of the assistant's journeys, one per block | `backend/tests/integration/assistant.test.ts` |
| `chat-rival` | a second throw-away User of one assistant journey, who books through the calendar's own route | `backend/tests/integration/assistant.test.ts` |
| `chat-nobody` | a throw-away account in neither group, made straight in cognito-local | `backend/tests/integration/assistant.test.ts` |
| `smoke-<epoch>` | the smoke test's throw-away User | `backend/scripts/smoke.sh` |

Every test file removes its own throw-away Users before it starts and after it ends, so it can be
run again after a failed run.

## One local calendar, shared

All journeys and the smoke test use the same local `calendar` table. They treat it differently:

- **The back end's calendar journeys empty it first** (the helper `resetCalendarTable()`). They can
  then expect exact contents.
- **The front end's calendar journeys never reset it.** They work on top of what the others left:
  they create only types named `fe-calendar …`, use only dates with nothing on them, from today +
  330 days, and remove what they made.
- **The smoke test** uses a type `smoke-<epoch>` and a free 03:00–04:00 from 50 days ahead.
- **The assistant's journeys never reset it either.** Seven blocks need the calendar. Each creates
  a type of its own name (the file's `JOURNEY_TYPES`) and a one-off window in the early
  morning, hours no other journey opens, on a day of its own: the 22nd to the 28th from
  today. Each removes its window and its type at its end (the file's helpers `openWindow()` and
  `removeFromCalendar()`). Before any block starts, the file removes what an interrupted run of
  any of them left on a day from tomorrow to 28 days ahead, so that a window left by one
  block never stands in the way of another a day later.
  The blocks that book cancel their appointments first, as the Administrator; a cancelled
  appointment keeps no slot busy, so a second run the same day finds the same free slots. Each
  block checks only what it made, whatever else its day holds.

Appointments cannot be deleted through the API, only cancelled. So cancelled appointments, their
events and the deleted-user markers of removed Users stay in the table as history.

## The `calendar` table and its items

The whole calendar lives in one DynamoDB table, `calendar` (`docs/SHARED_CALENDAR_SPEC.md`
sections 13.1 and 13.2). Every item has two keys:

- `PK`, the partition: which kind of item it is, such as `APPT` for every appointment;
- `SK`, the sort key: which one it is. The items of one partition come back sorted by `SK`.

The back end's journeys read the items directly, next to the API answers, with the helpers of
`backend/tests/integration/setup.ts`: `getCalendarItem(PK, SK)` for one item,
`queryCalendarPartition(PK)` for a whole partition. Only `backend/src/lib/calendarDb.ts` knows this
layout in the code; the handlers never see it.

| Item | `PK` | `SK` | What it holds |
|---|---|---|---|
| Calendar lock | `LOCK` | `LOCK` | `version`, a number ([the calendar lock](#the-calendar-lock)) |
| Settings | `SETTINGS` | `SETTINGS` | the four settings, `updatedAt`, `updatedBy`. Absent until the first save: until then the defaults apply (`docs/SHARED_CALENDAR_SPEC.md` R-SET-01) |
| Availability type | `TYPE` | `<typeId>` | `name`, `nameKey` (the lower-case name, for uniqueness) |
| Weekly pattern | `PATTERN` | `<patternId>` | the pattern's fields |
| Date override | `OVERRIDE` | `<date>` | `windows`, `updatedAt`, `updatedBy` |
| One-off window | `WINDOW` | `<date>#<windowId>` | the window's fields, `createdBy` |
| Appointment | `APPT` | `<start>#<appointmentId>` | the appointment ([below](#the-appointment-item)) |
| Appointment pointer | `APPTID#<appointmentId>` | `APPTID` | `sk`: the `SK` of the appointment |
| Event | `EVENT` | `<occurredAt>#<eventId>` | one change of one appointment ([the event log](#the-event-log)) |
| Deleted-user marker | `DELETEDUSER#<sub>` | `DELETEDUSER` | `username`, `deletedAt`, `deletedBy` ([below](#the-deleted-user-marker)) |

### The appointment item

All appointments share the partition `APPT`, and their `SK` starts with the start instant. So
they are sorted by start time, and "every appointment between two instants" is one query on the
sort key. That is what the overlap check and the calendar view need. The appointment's id is the
part of the `SK` after `#`; it is not stored again.

The item holds what the API answers, with three differences (`docs/SHARED_CALENDAR_SPEC.md`
section 8.1):

- `userId`: the User's Cognito `sub`. It is stored, never answered. The limit per User and the
  ownership of an appointment are decided on it, not on the username, which a later account could
  be given again.
- `typeNameAtBooking`: the type's name when the appointment was booked. Answers carry `typeName`,
  the type's current name, and fall back on the snapshot only once the type is gone.
- `version`: an internal counter, 1 at booking. `cancellableUntil` is not stored: it is worked out
  for each answer, from the caller's role and the settings.

### Why a pointer item

The routes that take an appointment id (cancel, change, note) must find the appointment, but its
key starts with the start time, which the caller does not send. So every booking also writes a
small **pointer** item, `APPTID#<id>`, holding the appointment's `SK`: one read of the pointer,
then one read of the appointment.

A secondary index on the id would do the same without a second item, but DynamoDB's indexes are
only *eventually* consistent: just after a booking, the index could still miss it and the route
would answer 404 for a moment. The pointer is written in the same transaction as the appointment
and read consistently, so it is there as soon as the booking is (`docs/SHARED_CALENDAR_SPEC.md`
section 13.3).

### The deleted-user marker

Deleting a User (`DELETE /users/{username}`) first writes the marker `DELETEDUSER#<sub>`, then
cancels the User's future appointments, and only then deletes the account in Cognito
(`docs/SHARED_CALENDAR_SPEC.md` section 10.2). An access token stays valid for some minutes after
the account is gone. The marker closes that gap: every booking transaction checks that no marker
exists for the User's `sub`, and is refused with `404 user_not_found` if one does
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-10).

The marker is keyed by the `sub`, not the username. A new account made later with the same name
gets a new `sub`, so the marker does not affect it (`docs/SHARED_CALENDAR_SPEC.md` R-DEL-02).

## The calendar lock

Several rules compare a write with the rest of the calendar: no two appointments on the same time,
no overlapping windows, no appointment left outside its window, the limit per User. If two writes
arrive at the same moment, each could check against a calendar the other is changing, and both
would pass. The lock prevents that (`docs/SHARED_CALENDAR_SPEC.md` section 13.4).

There is **one lock for the whole calendar**: the item `LOCK`/`LOCK` with a number, `version`.
Every calendar write (settings, types, patterns, overrides, one-off windows, appointments) goes
through it, in the code `withCalendarLock()` in `backend/src/lib/calendarDb.ts`:

1. read `version` (0 if the item does not exist yet);
2. read what the rules need, and check them. If a rule fails, answer its error; nothing is
   written;
3. write everything in **one transaction**: "set `version` to `version + 1`, *but only if it is
   still* the value read in step 1", together with the operation's own items. DynamoDB writes all
   of them or none.

If another write moved the version on between steps 1 and 3, the condition fails and the whole
transaction is cancelled. The write waits a random 50 to 150 ms and starts again from step 1, so it
re-reads the calendar and re-checks its rules against the new state. After 3 attempts in all, it
gives up and answers **`409 concurrent_update`**; the client may simply try again.

So calendar writes take turns: each one sees the result of the one before. With a handful of
people who almost never act at the same moment, that costs nothing. Reads (the calendar view, the
lists) take no lock.

Each write moves `version` on by one, so the settings journey can see the lock item appear at
version 1 and move to 2.

## The event log

Every change to an appointment writes one **event** item, in the same transaction as the change
itself (`docs/SHARED_CALENDAR_SPEC.md` sections 15 and 15.2). Either both are written or neither
is.

| Event `type` | Written by |
|---|---|
| `appointment.booked` | a booking |
| `appointment.cancelled` | a cancel, and each appointment cancelled by a User's deletion |
| `appointment.changed` | a change (one event for the old and the new appointment, with `previous`) |
| `appointment.note_updated` | a new note |

An event holds `eventId`, `type`, `occurredAt`, the `actor` who did it (`{ username, role }`), the
`recipients` (the appointment's User, by `userId` and `username`, and `administrator: true`), a
copy of the `appointment` as stored after the change, and `schemaVersion` 1. Events are never
updated or deleted. Changes to availability and settings write no event: they can never touch an
appointment ([booked appointments keep their window](#booked-appointments-keep-their-window)).

**Why it exists.** The calendar sends no e-mail yet. A later feature will tell people about their
appointments, and it will need to know, exactly once, everything that happened, even if a function
crashes just after a write. Writing the event in the same transaction as the change (the
"transactional outbox" pattern) guarantees that. The later notifier only has to follow the new `EVENT`
items as they are written (through DynamoDB Streams); the items, the API and the handlers stay as
they are (`docs/SHARED_CALENDAR_SPEC.md` section 15.3).

## The settings

The calendar has four settings that the Administrator can change (`docs/SHARED_CALENDAR_SPEC.md`
section 9). The time zone is a fifth value the settings answer carries, but it comes from the
deployment (`Europe/Rome` by default) and cannot be changed through the API.

| Setting | What it says | Range | Default |
|---|---|---|---|
| `cancellationNoticeHours` | until when before the start a User may cancel or change | 0–720 | 24 |
| `minBookingNoticeHours` | how long before the start a User must book | 0–720 | 0 |
| `bookingHorizonDays` | how far ahead a User may book | 1–365 | 56 |
| `maxFutureAppointmentsPerUser` | how many upcoming appointments one User may hold at once | 1–100, or `null` for no limit | `null` |

The Administrator is exempt from all four: it may book any future time and cancel or change at
any time. The deadline an answer carries (`cancellableUntil`) depends on who asks: a User gets the
moment until which it may still cancel or change its own booked appointment (`null` once it is
cancelled); the Administrator always gets `null`, since it has no notice to respect.

An update always sends all four values. The journeys that change them keep the values they read
and write them back at the end.

**The limit on future appointments.** When a User books for themself and already holds as many
future appointments as the limit allows, the booking is refused with `409
appointment_limit_reached` (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-09).

## Availability types

An availability type is a named kind of availability, usually a place. The specification's
examples are "Studio" and "Swimming Pool" (`docs/SHARED_CALENDAR_SPEC.md` sections 2 and 6.1).

- It is only a name. The Administrator keeps a catalogue of them: create, rename, delete.
- Every window of availability belongs to one type. "Monday 08:00–12:00, Studio" and "Monday
  14:00–18:00, Swimming Pool" are two windows of two types.
- An appointment takes the type of the window it lies in. That is how a User knows what or where
  they booked. The calendar view shows the type's id and name on each window, so a week view can
  colour windows by type.

Its rules (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-01 to R-TYPE-04):

- the name has 1 to 40 characters and is unique, ignoring upper and lower case;
- at most 20 types exist at the same time;
- a rename shows everywhere at once, also on existing appointments;
- a type cannot be deleted while something still uses it (`409 type_in_use`): a weekly pattern, an
  override or one-off window dated today or later, or a booked appointment that has not ended;
- a window or a booking that names an unknown type gets `409 type_not_found`.

## Where a window comes from

The calendar does not store "this date is open 08:00–12:00" day by day. The Administrator describes
availability with three kinds of rules (`docs/SHARED_CALENDAR_SPEC.md` sections 6.2 to 6.4):

| Source | What it says | Example |
|---|---|---|
| **Weekly pattern** | one window on a given weekday, every week, from a start date (`validFrom`) to an optional end date (`validUntil`) | "every Monday 08:00–12:00, Studio, from 4 January, no end date" |
| **Date override** | for one date, replaces all the pattern windows of that date with a given list (an empty list closes the day) | "on 25 December: closed" |
| **One-off window** | one extra window on one date, on top of the rest | "on 11 October also 15:00–17:00, Swimming Pool" |

For each date the server combines the three (`docs/SHARED_CALENDAR_SPEC.md` section 6.5): the
override's windows if the date has one, otherwise the windows of the patterns valid on that date,
plus the date's one-off windows. The calendar view shows the result.

In the Administrator's view each window also carries:

- `source`: `pattern`, `override` or `one_off`;
- `sourceId`: which rule exactly. This is the pattern's id, the override's date, or the one-off
  window's id.

The Administrator needs them to manage availability: to edit or delete a window, the screen must
know which rule produced it. The day also carries `hasOverride`. A User's view leaves all three
out.

### A one-day pattern and a one-off window: alike, but not the same

A pattern whose `validFrom` and `validUntil` are the same date gives a window on that one date
only. On the calendar it looks exactly like a one-off window on that date: the same slots, and a
User cannot tell them apart. The rules treat them differently:

| | Weekly pattern (valid one day) | One-off window |
|---|---|---|
| A date override on that date | **replaces it** | **stays**: one-off windows apply on top of an override (`docs/SHARED_CALENDAR_SPEC.md` R-ONE-01) |
| Changing it | can be updated in place | cannot be edited: delete it and create a new one (`docs/SHARED_CALENDAR_SPEC.md` R-ONE-02) |
| Limit | at most 50 patterns in the whole calendar | at most 10 one-off windows per date |
| Blocks deleting its type | always, whatever its dates | only while it is dated today or later |
| Deleting it once its date has passed | allowed | refused, `409 date_in_past` |
| In the Administrator's view | `source: 'pattern'`, `sourceId` the pattern's id | `source: 'one_off'`, `sourceId` the window's id |

## Windows and slots

A window is the time the Administrator opened. A slot is what a User can book in it
(`docs/SHARED_CALENDAR_SPEC.md` section 7, R-SLOT-01):

- a slot lasts 60 minutes and starts on a whole local hour (`hh:00`);
- it lies entirely inside one window and has that window's type;
- a window 08:00–12:00 gives the slots 08:00, 09:00, 10:00 and 11:00; a window 08:30–12:00 gives
  09:00, 10:00 and 11:00.

Adjacent windows of the same type are merged into one **effective window** before the slots are
counted (`docs/SHARED_CALENDAR_SPEC.md` section 6.6). `08:00–10:30 Studio` and `10:30–12:00 Studio`
form `08:00–12:00 Studio`, which offers the slot 10:00–11:00 across the joint.

A slot is **free** when no active appointment overlaps it (`docs/SHARED_CALENDAR_SPEC.md`
R-SLOT-02). The calendar view lists only free slots, so a booked hour disappears from `slots`.

The Administrator is not bound to slots: it may book custom times inside a window, such as
09:15–10:00 (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-08).

## Windows never overlap

A window that overlaps another window of its date cannot be added: the server refuses it with
`409 availability_overlap` (`docs/SHARED_CALENDAR_SPEC.md` R-AV-01). The windows of a date never
overlap, whatever their source or type. A new one-off window is checked against the date's pattern
windows (or the override's windows, if the date has an override) and against the date's other
one-off windows.

Example, with a pattern "Monday 08:00–12:00, Studio":

| One-off window on a Monday | Result |
|---|---|
| 11:00–13:00, any type | refused: 11:00–12:00 would be covered twice |
| 08:00–12:00, the same type | refused: the same time again is also an overlap |
| 12:00–14:00, any type | allowed: touching windows do not overlap |
| 12:00–14:00, Studio | allowed, and merged with the pattern's window into one effective window, 08:00–14:00 Studio |

If the date has an override, the pattern does not apply that day. A one-off window may then lie
where the pattern would have been: it is checked against the override's windows instead.

The other direction is checked too. A new or changed pattern is compared with the one-off windows
from today on, on every date it applies to that has no override. Deleting an override is checked as
well: the pattern windows that return may not overlap the date's one-off windows. However the rules
are written, a date never ends up with overlapping windows.

## Booked appointments keep their window

The Administrator cannot change the availability so that a booked appointment that has not ended
is left outside every window of its type (`docs/SHARED_CALENDAR_SPEC.md` section 6.7, R-AV-03).
The server computes the calendar as it would be after the write. If an appointment would be
stranded, it refuses the write with `409 availability_conflict` and lists the stranded appointments
in `conflicts` (only the Administrator ever sees that list).

- Extending availability never conflicts: a longer window, a new window.
- Shortening, closing or deleting a window, or changing its type, conflicts when an appointment
  lies in the part that goes.

An override shows the difference between the sources. With a pattern window 08:00–12:00 and a
booked appointment at 08:00, the Administrator sets an override with only 10:00–12:00 on that date:

| Window under the appointment | Answer to the override 10:00–12:00 | Why |
|---|---|---|
| from a pattern | `availability_conflict`, listing the 08:00 appointment | the override replaces the pattern's window, so 08:00 would no longer be open |
| a one-off window | `availability_overlap` | the override does not replace a one-off window, so nothing is stranded; but 10:00–12:00 overlaps the one-off window 08:00–12:00 that stays |

## The life of an appointment

An appointment is never deleted. It is `booked` until it is cancelled, and then it stays in the
table as `cancelled`, as history (`docs/SHARED_CALENDAR_SPEC.md` section 8.1 and decision D17).
"Ended" is not a status: a booked appointment whose end has passed is still `booked`, but nothing
can be done to it any more.

| What happens | Who may | Route | The appointment after it | Event |
|---|---|---|---|---|
| book | a User for themself; the Administrator for any plain User | `POST /calendar/appointments` | `booked`, `createdBy` the caller | `appointment.booked` |
| edit the note | its User or the Administrator, until its end | `PATCH /calendar/appointments/{appointmentId}` | still `booked`, with the new `note` | `appointment.note_updated` |
| cancel | its User until `cancellableUntil`; the Administrator until its end | `POST …/{appointmentId}/cancel` | `cancelled`, `cancelReason: 'cancelled'`, `cancelledBy` the caller | `appointment.cancelled` |
| change | as cancel | `POST …/{appointmentId}/change` | `cancelled`, `cancelReason: 'changed'`, and a new appointment ([below](#a-change-cancels-one-appointment-and-books-another)) | `appointment.changed` |
| its User is deleted | the Administrator, through `DELETE /users/{username}` | — | `cancelled`, `cancelReason: 'user_deleted'` | `appointment.cancelled` |

Two answers come back from every route that takes an appointment id
(`docs/SHARED_CALENDAR_SPEC.md` sections 8.3 to 8.5):

- **`404 appointment_not_found`** when the id is unknown, *and* when a User names someone else's
  appointment. A User cannot tell the two apart, so ids cannot be probed
  (`docs/SHARED_CALENDAR_SPEC.md` R-PERM-01).
- **`409 appointment_not_active`** when the appointment is already cancelled or has ended
  (`docs/SHARED_CALENDAR_SPEC.md` R-CAN-02 and R-NOTE-01). So a second cancel of the same
  appointment is refused, and so is a second change.

### A change cancels one appointment and books another

A change does not move the appointment. In one transaction it cancels the old one and books a new
one, with a new id (`docs/SHARED_CALENDAR_SPEC.md` section 8.4, R-CHG-02):

| | The old appointment | The new appointment |
|---|---|---|
| `status` | `cancelled`, `cancelReason: 'changed'` | `booked` |
| link | `replacedBy`: the new id | `replaces`: the old id |
| User | — | always the old one's: a change cannot give the appointment to someone else |
| note | — | the old note, unless the request sends `note` (`null` clears it) (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-03) |
| type | — | the type of the window the new time lies in |

The answer is `201 { cancelled, booked }`, the two halves. One event, `appointment.changed`, holds
the new appointment as `appointment` and the old one as `previous`.

The new appointment must pass the booking rules, checked against the calendar **without the old
one** (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-01). So an appointment can be moved by half an hour into
its own time, and a User at the limit of future appointments can still move their only one. The
old appointment must pass the cancel rules, the notice included: a User cannot change what they
could no longer cancel. The links `replaces` and `replacedBy` are stored and answered, but no rule
follows them.

## `busy` and `appointments` in the calendar view

The calendar view (`GET /calendar`) has two places that hold appointments
(`docs/SHARED_CALENDAR_SPEC.md` section 11.6): a `busy` list on each day, and one `appointments`
list for the whole range.

| Field | For a User | For the Administrator |
|---|---|---|
| `appointments` | only the User's own appointments, in full (id, time, type, note, cancellation deadline) | **every** appointment, in full, with the User's name |
| `busy` (per day) | other Users' appointments, as bare `{ start, end }`: no name, no id, no note | always empty |

- **Why the User needs `busy`.** A User may not see other people's appointments
  (`docs/SHARED_CALENDAR_SPEC.md` section 17), but the calendar must still show that the time is
  taken. So the server sends only the time span, and a view can draw a grey "busy" block there.
- **Why the Administrator's `busy` is empty.** The Administrator may see everything, so the full
  appointments are already in `appointments`, names included. A second, anonymous copy of the same
  appointments would add nothing.

A range covers at most 31 days.

## The front end's services in the journeys

The front end's journeys (`frontend/tests/integration/`) reach the API only through the services
of `frontend/src/services/`, as a screen will (`docs/FRONTEND_SERVICES.md` section 14).

- **A method returns nothing; its result arrives on a stream.** Each method has its own pair of
  streams, a result and a state: `book()` answers on `bookResult$`, `cancel()` on `cancelResult$`
  (`docs/FRONTEND_SERVICES.md` section 3). The names are those of `docs/FRONTEND_SERVICES.md`;
  where they differ from `docs/SHARED_CALENDAR_SPEC.md` section 16.2, the services document wins
  (`docs/FRONTEND_SERVICES.md` section 8, decision 40).
- **The helper `outcome(stream, call)`** (`frontend/tests/integration/local.ts`) subscribes to the
  stream first, then makes the call, waits up to 30 seconds for one new value and returns it.
- **A result** is `{ status: 'success', … }` with what the API answered, or
  `{ status: 'failure', reason, message }`. The `reason` is the API's `error` code
  (`slot_taken`), or one of the service's own (`network`, `not_signed_in`, …). The test helper
  `ok()` fails the test with the whole result when it is not a success, and returns the success.

### Refused before sending, or by the API

A service checks its input with the shared schemas (`shared/src/calendar/schemas.ts`) before it
sends anything. If the input fails, the service answers `invalid_request` at once, with the field
in the message (`note: at most 500 characters`), and **no request leaves**
(`docs/FRONTEND_SERVICES.md` section 8, decision 33). When the input passes, the service sends
what the schema made of it: a trimmed name or note, a default filled in.

A schema knows nothing of the caller's role, the clock or the stored data. So everything that
depends on them is sent, and the API decides: a User's whole hours, a taken slot, the notice, an
unknown id, someone else's appointment (`docs/FRONTEND_SERVICES.md` section 8, decision 42). The
same `invalid_request` can therefore come from either side.

A journey shows which side decided by counting the requests with a spy on `fetch`. The helper
`noRequest()` of `frontend/tests/integration/calendar.test.ts` expects none; a test that expects
the API to decide can expect exactly one.

## The assistant in the journeys

The assistant is the calendar used by conversation: a person writes a message, the server asks
Claude (Anthropic's model) and answers with what Claude said. Its routes and their answers are
defined in `docs/ARCHITECTURE.md` section 4 ("The assistant's routes"); what is not built yet
(the Administrator's changes: the settings, the types, the opening hours, a booking for a
User) is in `docs/CONVERSATIONAL_ARCHITECTURE.md`.

- **One conversation per person**, found by the `sub` of the token. No route takes a conversation
  id, so nobody can reach another person's conversation. `GET /assistant/conversation` reads it,
  `POST /assistant/messages` adds a message to it (and starts it when there is none),
  `POST /assistant/continue` does its next step when one is waiting,
  `POST /assistant/proposals/{proposalId}/confirm` and `…/decline` answer a proposal (see "A
  proposal, and its two buttons" below), `DELETE /assistant/conversation` ends it.
- **`AssistantReply`** is the answer of `GET` and of the four `POST`s: `conversationId`, `language`, `status`,
  `messages`, `activity`, `proposal`, `remainingToday`. With no conversation, the first two are
  `null`, `status` is `idle` and `messages` is empty.
- **A new account starts clean.** A conversation and the day's count are stored under the `sub`,
  and an account created again has a new `sub`. So each block plays its own throw-away User and
  finds no conversation and all of the day's messages.

### The fake Claude

The local stack does not call Anthropic. A small server of the Docker stack, the fake Claude
(`backend/docker/fake-claude.mjs`, port 9230), answers in its place
(`docs/ARCHITECTURE.md` section 8). What it answers is scripted in
`backend/tests/integration/fake-claude/answers.json`, by **the exact text of the person's
message**, one answer per step of the exchange that message starts (see "Steps, `continue` and
the tools" below). The texts the journeys send:

| The person writes | The fake answers |
|---|---|
| `Hello, can you hear me?` | "Hello. I am the assistant of the shared calendar.", after a thinking block |
| `Buongiorno, mi sente?` | "Buongiorno. Sono l'assistente del calendario condiviso." |
| `fake: say the line of the application` | "The application told me: " followed by the line of the application it received (see below) |
| `fake: a spending limit of our own`, `fake: overloaded` | an error, as Anthropic gives it for that case, at every step |
| `fake: what is open on the day of the journey?` | first a request for the tool `get_calendar`, for the one day 25 days after today; then, as its text, the result of that tool word for word |
| `fake: an outage after the read` | first a request for the tool `get_settings`; then an error the first time, and the second time the result of that tool as its text |
| `fake: book me the slot of the booking journey`, `fake: book me the slot of the declining journey`, `fake: book me the slot somebody else takes`, `fake: book me the slot confirmed twice` | first a request for the tool `book_appointment`, for a day 26, 27 or 28 days after today at a fixed hour; then, as its text, the last result of a tool it was given |
| `yes` | the same two answers as the sentence of the declining journey |
| `fake: book me a slot when the money runs out` | first a request for `book_appointment`; then an error (a spending limit) the first time, and the second time the last result of a tool as its text |
| `fake: add a note to my appointment of the note journey`, `fake: move my appointment of the moving journey`, `fake: cancel both my appointments of the cancelling journey` | first a request for `list_appointments`, for the day 22, 23 or 24 days after today; then a request for the change (`set_appointment_note`, `change_appointment`, or two `cancel_appointment` in one answer), with the id of the first appointment of that list, and of the second for the second cancellation; then the last result of a tool as its text |
| a text the file does not hold | "Fake Claude: no answer is scripted for this message." |

The language question (below) is scripted the same way: of the texts the journeys send,
`Buongiorno, mi sente?` is Italian and every other one is English.

### The language of a conversation

At the first message of a conversation the server asks Claude one extra question: in which of the
supported languages, English or Italian, the message is written. The answer becomes the
conversation's `language` and never changes (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.2).
So a first message costs two requests to Claude, every later one a single request.

### The line of the application, and the gaps in `seq`

After each message of the person the server adds one line of its own to what Claude receives: the
date and time now in the calendar's time zone, and the conversation's language as an instruction.
It is stored as a message of the conversation, with its own `seq`, but a person never reads it.
That is why the messages of a reply are numbered 1 and 3, then 4 and 6: 2 and 5 are lines of the
application.

A read makes the gap wider. Claude's request for a tool and the result of the tool are stored
too, each as an entry with its own `seq`, and a person reads neither. So an exchange with one read
shows 1 (the person) and 5 (the answer): 2 is the line of the application, 3 Claude's request, 4
the result. Had Claude written some words beside its request, entry 3 would be shown as those
words.

### Steps, `continue` and the tools

One HTTP request asks Claude for at most one step (`docs/CONVERSATIONAL_ARCHITECTURE.md` section
5.1); the first message of a conversation asks the language question before it.
An answer that needs the calendar therefore takes several requests:

1. `POST /assistant/messages`: Claude does not answer in words but asks for a **tool**, one of
   four reads (`get_settings`, `list_types`, `get_calendar`, `list_appointments`). The server runs
   it: it calls the code of the calendar's own route, with the identity of the person, so the
   person gets from the assistant exactly what they may see in the pages. It saves Claude's
   request and the result, and answers `status` `working` with `activity`, a line such as
   "Looking at the calendar…".
2. `POST /assistant/continue`, with no body: the server asks Claude again, now with the result.
   Claude answers in words (`status` `idle`), or asks for another read (`working` again).

While the `status` is `working`, a new message is refused with `409 assistant_busy`. `continue`
with no step waiting is `409 nothing_to_continue`. `continue` is not a message: it counts nothing
for the day.

What Claude is given of the calendar is not the route's answer as it is: dates and times are
local, in the calendar's time zone (`05:00`, not an instant), a window's type is its name, and
the internal fields are left out: a window carries no id. An appointment keeps its id, and so
does a type in the list of types, since a later request must be able to name them
(`docs/CONVERSATIONAL_ARCHITECTURE.md` section 8.3).

The fake has four **marks**, texts it replaces in a scripted answer, and one memory. `{{application-line}}`
becomes the line of the application. `{{date+25}}` becomes the date 25 days after the date that
line states, so the fake can ask for a day the journey prepared without knowing the date itself.
`{{last-tool-result}}` becomes the result of the last tool, which is how a journey reads what
Claude was given. `{{appointment-id-1}}` becomes the id of the first appointment in the result of
the last tool, when that result is a list of appointments (`-2` the second): the server makes
an appointment's id, so the fake, like Claude, must read the list to learn it. And a step may be written to fail once: an error the first time a request
comes, the answer when the very same request comes again.

### A proposal, and its two buttons

Claude cannot change the calendar (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5). When it
asks for a tool that changes something (`book_appointment`, offered to Users only, and
`cancel_appointment`, `change_appointment` and `set_appointment_note`, offered to everybody),
the server changes nothing. It reads the facts itself, with the person's identity. For a
booking, through the code of `GET /calendar`: the free slot at the time asked for, its end, the
name of its type. For the other three, through the code of `GET /calendar/appointments`: the
appointment the id stands for, among the person's appointments that have not ended. Several
changes asked for in one answer of Claude make one proposal, with one line in `actions` for
each, five at most; if one of them cannot be proposed, none is. Then
it saves a **proposal** and answers `status` `awaiting_confirmation`, with:

```
proposal: { proposalId, question, confirmLabel, declineLabel,
            actions: [ { summary, outcome, error } ] }
```

`question` and the two labels are fixed texts ("Make this change?", "Confirm", "Don't").
`summary` is the server's own sentence, written from the facts it read, not Claude's words:
"Book an appointment on Tuesday 24 November 2026, from 10:00 to 11:00 (Visit)." While the
proposal waits, `outcome` and `error` are `null`. What happens next is the person's choice:

- **`POST /assistant/proposals/{proposalId}/confirm`** is the only way the change is made. The
  server takes the proposal, so that a second confirmation finds none, and calls the code of the
  change's own route (`POST /calendar/appointments` for a booking, and the cancel, change and
  note routes of an appointment for the other three) with the identity of the request: every
  rule of the calendar is checked again at that moment. The changes of a proposal are run in
  order, each with its own outcome: one refused does not stop the others. It saves the outcome (`done`; `refused`
  with the route's error code in `error`; `unknown`), then asks Claude once for its closing
  words. The settled proposal stays in the replies, with its outcome, until the person's next
  message.
- **`POST /assistant/proposals/{proposalId}/decline`** changes nothing and does not ask Claude:
  the reply holds the notice "Nothing was changed.", `proposal` `null` and `status` `idle`.
- **A message instead** drops the proposal, a typed "yes" included: no text is a confirmation.
  The message is then read as usual, in the same request.

An id that names no waiting proposal of the person (never made, settled, declined, dropped) is
`404 proposal_not_found`; one that is not a ULID is `400 invalid_request`. Neither route takes a
body, and neither counts as a message of the day. `POST /assistant/continue` while a proposal
waits is `409 nothing_to_continue`: the conversation waits for the person, not for Claude.

Anthropic wants every request for a tool followed by its result, so the server stores one for
the change in each case, as an entry of role `user`. Claude reads it at its next step, and the
journeys read its `outcome` in the table: `done` after a confirmation (with what the route
answered, and the words that the person pressed the button), `declined` after a decline,
`not_confirmed` when a message dropped the proposal. A refused change is stored as the route's
`error` and message.

### The `assistant` table

The conversations live in a table of their own, `assistant` (`docs/ARCHITECTURE.md` section 5.4).
The journeys read it with `queryAssistantPartition()` of `backend/tests/integration/setup.ts`.

| Item | `PK` | `SK` | What it holds |
|---|---|---|---|
| Conversation | `CONV#<sub>` | `META` | one per person: `conversationId` (`null` when ended), `language`, `status`, `messageCount` (the person's messages), `nextSeq`, `proposal` (the proposal waiting or settled, or `null`) |
| Message | `CONV#<sub>` | `MSG#<conversationId>#<seq>`, `seq` on six digits | `kind` `model`, with `content` the JSON text of one entry as exchanged with Claude (`role` `user`, `system` for the line of the application, `assistant`); or `kind` `notice`, a fixed text of the server that the person reads and Claude never gets. The file's helper `storedEntries()` gives the `model` entries of the conversation in progress |
| Daily use | `USAGE#<sub>` | the local date | `messages`, `inputTokens`, `outputTokens` of that day |

The code never deletes an item: ending a conversation only sets `conversationId` to `null`, and
the items carry a time to expire, which DynamoDB Local may never act on
(`docs/ARCHITECTURE.md` section 8). Removing a User from Cognito leaves their items in the table,
under a `sub` nobody has any more.

### The daily limit

A person may send a fixed number of messages a day, counted on the calendar's local date
(`docs/ARCHITECTURE.md` section 4, "The assistant's routes"). The local stack sets it to 10, in
`backend/env.local.json`, where the journeys read it with `localDailyMessageLimit()`; the pages
call it `LIMIT`. `remainingToday` in a reply is what is left of it. A message counts when it is
saved, whether Claude answered it or not; a refused request counts nothing. Ending a conversation
does not give the messages back.
