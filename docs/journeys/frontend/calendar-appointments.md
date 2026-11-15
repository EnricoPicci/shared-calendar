# The "appointments" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/calendar.test.ts` |
| `describe` | `appointments` |
| Tests | 1. "book, slot taken, book for fe-calendar, note, change, upcoming, cancel"<br>2. "fe-calendar starts off the whole hour: the API answers invalid_request (the service sends it)"<br>3. "fe-calendar lists fe-calendar-b's appointments: forbidden"<br>4. "cancel an unknown appointment: appointment_not_found"<br>5. "a note of 501 characters: invalid_request with the field, no request sent" |
| Runs against | the local stack: the API on port 3000, cognito-local on port 9229 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[one local calendar, shared](../concepts.md#one-local-calendar-shared),
[the settings](../concepts.md#the-settings),
[windows and slots](../concepts.md#windows-and-slots),
[the life of an appointment](../concepts.md#the-life-of-an-appointment),
[a change cancels one appointment and books another](../concepts.md#a-change-cancels-one-appointment-and-books-another),
[booked appointments keep their window](../concepts.md#booked-appointments-keep-their-window),
[the event log](../concepts.md#the-event-log),
[the deleted-user marker](../concepts.md#the-deleted-user-marker).

## What this block proves

- `AppointmentsService` reaches all five appointment routes: a User books, edits the note,
  changes, lists and cancels; the Administrator books, lists and cancels
  (`docs/SHARED_CALENDAR_SPEC.md` section 11.1, routes 16 to 20, and sections 8.2 to 8.6).
- A change cancels the old appointment and books a new one that keeps the note
  (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-02 and R-CHG-03); a cancelled appointment can be neither
  changed nor cancelled again (`docs/SHARED_CALENDAR_SPEC.md` R-CAN-02).
- The service refuses a note of more than 500 characters itself, without a request, but sends a
  User's booking off the whole hour and lets the API refuse it (`docs/FRONTEND_SERVICES.md`
  section 8, decision 42).

## Who takes part

- **`fe-calendar`**: a plain User created by the test file. It books for itself, writes a note,
  changes, lists and cancels. In test 1 its bookings, note, changes and cancels go through one
  `AppointmentsService`; its lists go through the helper `list()`.
- **The Administrator** (`admin`): tries to book a taken slot, books for `fe-calendar` with a
  custom end, lists `fe-calendar`'s appointments and cancels one. It also prepares and removes the
  day (`bookableDate()`, `release()`).
- **`fe-calendar-b`**: a second plain User created by the test file. It never signs in. Here it is
  only a name: the User of the booking the Administrator is refused in test 1, and the User whose
  appointments `fe-calendar` may not list in test 3.

## Before the block starts

- **The file's `beforeAll`** writes back settings an earlier killed run may have left changed,
  removes both Users and the `fe-calendar …` types and their windows, then creates both Users again
  and signs `fe-calendar` in. Each run has new accounts, with new Cognito `sub`s.
- **The block "calendar view"** has run just before (vitest runs the blocks of a file in order). It
  leaves nothing booked, but its two cancelled appointments stay on its date, one of them
  `fe-calendar`'s, under the same account as here.
- **The block's `beforeAll`** (the helper `bookingSettings()`) sets the settings so that a User
  can book about a year ahead: a horizon of 365 days, no minimum notice, no limit, and the
  cancellation notice as read. Its `afterAll` writes back the values it read. Why each value, and
  how a killed run is repaired, is told on the page of the "calendar view" block
  ([`calendar-view.md`](calendar-view.md#before-the-block-starts)). Here the values matter, since
  `fe-calendar` books and changes for itself: the date lies 330 to 360 days ahead, within the
  horizon, and a cancellation notice of at most 720 hours (30 days) cannot block a cancel or a
  change that far ahead.

## Test 1: book, note, change, list, cancel

```mermaid
sequenceDiagram
    participant U as fe-calendar
    participant A as admin
    participant API as API (local)
    A->>API: type "fe-calendar Appointments", pattern 08:00–12:00 on date D only
    U->>API: book D 08:00
    API-->>U: 201, cancellableUntil set
    A->>API: book D 08:00 for fe-calendar-b
    API-->>A: 409 slot_taken
    A->>API: book D 10:00–10:30 for fe-calendar
    API-->>A: 201, cancellableUntil null
    U->>API: note "  Bring shoes  " on the 08:00 (sent trimmed)
    U->>API: change the 08:00 to 09:00
    API-->>U: 201 { cancelled: 08:00, booked: 09:00 }
    U->>API: change the 08:00 again
    API-->>U: 409 appointment_not_active
    U->>API: list upcoming; list D, every status
    A->>API: list upcoming for fe-calendar
    U->>API: cancel the 09:00, then again
    API-->>U: 200; then 409 appointment_not_active
    A->>API: cancel the 10:00–10:30; delete pattern and type
```

### 1. Prepare a bookable day

The helper `bookableDate('Appointments')` creates the type `fe-calendar Appointments`, picks the
first date of the band (today + 330 to today + 360 days) with no window and no override, and opens
one window there, **08:00–12:00**, through a weekly pattern valid on that date only. The page of
the "calendar view" block explains the helper
([`calendar-view.md`](calendar-view.md#background-the-helper-bookabledate)). Call that date `D`.
The helper `at('08:00')` turns a local time of `D` into the instant the API wants.

`D` is often the same date the "calendar view" block used: that block deleted its pattern, so the
date is free again. Its cancelled appointments may therefore lie on `D`. They take no slot: only
active appointments do.

The test creates one `AppointmentsService` for `fe-calendar`, called `a`, and uses it for
`fe-calendar`'s booking, note, changes and cancels. Every list, `fe-calendar`'s and the
Administrator's, and every call of the Administrator go through the helpers `book()`, `cancel()`
and `list()`, each with a new service.

### 2. `fe-calendar` books 08:00 for itself

`a.book({ start: at('08:00') })`, result on `bookResult$`. A User sends only `start`: its booking is
always one hour, and it books for itself, so it names no `username`. The test checks that:

- the appointment has `username` `fe-calendar`, `start` 08:00, `end` 09:00, `date` `D`, the new
  type's `typeId`, `status` `booked` and `note` `null`;
- `createdBy` is `{ username: 'fe-calendar', role: 'user' }`;
- `cancellableUntil` is a string: `fe-calendar` is a User, so the answer says until when it may
  still cancel or change it.

The test keeps it as `booked`.

### 3. The Administrator tries 08:00 for `fe-calendar-b`

`book(admin, { start: at('08:00'), username: 'fe-calendar-b' })`. The test checks the failure
`slot_taken`. The Administrator is exempt from the notice, the horizon and the limit, but not from
the overlap rule (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-07). Nothing is written.

### 4. The Administrator books 10:00–10:30 for `fe-calendar`

`book(admin, { start: at('10:00'), end: at('10:30'), username: 'fe-calendar' })`. A User could not
send this `end`: only the Administrator may book custom times inside a window
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-08), on 15-minute local steps
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02). The test checks that the appointment has:

- `username` `fe-calendar` and `end` 10:30;
- `createdBy` `{ username: 'admin', role: 'admin' }`;
- `cancellableUntil` `null`: the answer goes to the Administrator, who has no notice to respect.

The test keeps it as `forUser`. It belongs to `fe-calendar`: the server looked up its `sub` by the
username, so it is in `fe-calendar`'s own lists from now on.

### 5. `fe-calendar` writes a note

`a.updateNote(booked.appointmentId, '  Bring shoes  ')`, result on **`updateNoteResult$`**. The
service trims the note with the shared schema `NoteBody` before sending it, so the request already
carries `Bring shoes`. The test checks that the answer is the same appointment (`appointmentId`)
with `note` `Bring shoes`.

### 6. `fe-calendar` changes 08:00 to 09:00

`a.change(booked.appointmentId, { start: at('09:00') })`, result on `changeResult$`. The body has no
`note` key, so the server carries the old note over (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-03). The
test keeps the success as `changed` and checks that:

- `changed.cancelled` is the old appointment (`booked.appointmentId`), now `status` `cancelled`,
  `cancelReason` `changed`, with `replacedBy` the id of `changed.booked`;
- `changed.booked` is new: `start` 09:00, `status` `booked`, `note` `Bring shoes`, with `replaces`
  `booked.appointmentId`.

The new appointment is checked against the calendar without the old one
([a change cancels one appointment and books another](../concepts.md#a-change-cancels-one-appointment-and-books-another)).
Here that makes no difference: 09:00 was free anyway.

### 7. `fe-calendar` changes the old appointment again

`a.change(booked.appointmentId, { start: at('11:00') })`. The old appointment is cancelled now. The
test checks the failure `appointment_not_active` (`docs/SHARED_CALENDAR_SPEC.md` R-CAN-02). 11:00
stays free.

The day now looks like this:

| Time | State |
|---|---|
| 08:00–09:00 | the old appointment, `cancelled` (`changed`): the slot is free again |
| 09:00–10:00 | `changed.booked`, `fe-calendar`'s, with the note |
| 10:00–10:30 | `forUser`, `fe-calendar`'s, booked by the Administrator |
| 10:30–11:00 | free, but no User slot: a slot is a whole hour, and 10:00–11:00 is partly taken |
| 11:00–12:00 | free |

### 8. The lists

All three lists go through the helper `list()`, result on **`appointmentsResult$`**. When a query
leaves `status` out, the service's schema fills in the default `booked`, and that is what it
sends.

1. **`fe-calendar`'s upcoming appointments**, `{ upcoming: 'true' }`: the appointments that have
   not ended. For a User the server always lists its own, by the `sub` of its token. The test
   checks that:
   - those on `D` are, in this order, `changed.booked` (09:00) and `forUser` (10:00): by start;
   - every one listed belongs to `fe-calendar`, is `booked`, and carries a `cancellableUntil`, also
     `forUser`, which the Administrator booked. The deadline depends on who asks, not on who
     booked.
2. **The Administrator's list for `fe-calendar`**, `{ upcoming: 'true', username: 'fe-calendar' }`.
   The test checks that:
   - those on `D` are the same two, in the same order;
   - every one listed has `cancellableUntil` `null`: the answer goes to the Administrator.
3. **Every status on `D`**, as `fe-calendar`: `{ from: D, to: D, status: 'all' }`. The test checks
   that, among the answer, the three appointments of this test are, in this order:
   - the old 08:00 one, `cancelled`;
   - `changed.booked`, `booked`;
   - `forUser`, `booked`.

**Why the counts can be trusted on a table that is never reset.** The test looks only at what it
can tell apart:

- The User's lists hold only appointments of this run's `fe-calendar` account: the server matches
  them on the `sub`, and the account is new. So "every one listed belongs to `fe-calendar`" holds
  for the whole list, whatever other dates it covers. Before this test the account had one
  appointment, that of the "calendar view" block, and it is cancelled.
- An upcoming list holds only appointments that have not ended, booked by default. On `D` no one
  else can hold one: `D` had no window, and a booked appointment always lies in a window of its
  type ([booked appointments keep their window](../concepts.md#booked-appointments-keep-their-window)).
  So the upcoming lists on `D` hold exactly the two of this test.
- The Administrator's `username` filter matches the name stored on each appointment, and so also
  finds the appointments of `fe-calendar` accounts of earlier runs. Those were cancelled when the
  earlier account was deleted, so a list of booked ones on `D` does not show them.
- A list of every status may show the cancelled appointment of the "calendar view" block on the
  same date, as the test's comment says: "an earlier block may have left a cancelled one there".
  So the third list is filtered on the three ids of this test.

### 9. Cancel, cancel again, tidy up

1. `a.cancel(changed.booked.appointmentId)`, result on `cancelResult$`. The test checks that the
   appointment is `cancelled`, with `cancelReason` `cancelled` and `cancelledBy`
   `{ username: 'fe-calendar', role: 'user' }`. The User is far from its deadline, so the notice
   does not refuse it.
2. The same cancel again. The test checks the failure `appointment_not_active`.
3. The Administrator cancels `forUser` (the helper `cancel()`, which must succeed).
4. `fe-calendar` lists its upcoming appointments again. The test checks that none lies on `D`.
5. The helper `release()` deletes the pattern, then the type. Both work now: no booked appointment
   is left in the window.

## Test 2: a booking off the whole hour

`fe-calendar` books 08:15 on the first date of the band. The service's schema accepts 08:15 (an
instant with zero seconds), so the service sends it, and the API refuses it: a User books whole
local hours only (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02). The test checks the failure
`invalid_request` and that `fetch` was called **exactly once**: the API decided, not the service.
The service does not check the whole hour although it knows the caller is a User, because a second
copy of a role rule in the front end could drift from the server's (`docs/FRONTEND_SERVICES.md`
section 8, decision 42). The server checks the times before it reads the calendar, so the date
needs no window.

## Test 3: listing someone else's appointments

`fe-calendar` lists `{ upcoming: 'true', username: 'fe-calendar-b' }`. The test checks the failure
`forbidden`. A User may pass `username` only with its own name (`docs/SHARED_CALENDAR_SPEC.md`
section 11.2). The server decides from the token and the query alone, before it reads anything.

## Test 4: cancelling an unknown appointment

`fe-calendar` cancels `UNKNOWN_ID`, a well-formed ULID whose time part lies in 2024, so no server
generates it now. The id passes the service's schema, so the request is sent. The test checks the
failure `appointment_not_found`. A User gets the same answer for someone else's appointment, so it
learns nothing from an id (`docs/SHARED_CALENDAR_SPEC.md` R-PERM-01).

## Test 5: a note of 501 characters

`fe-calendar` sets a note of 501 `x` on `UNKNOWN_ID`. The service checks the id first (a ULID: it
passes), then the note: at most 500 characters (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-11). The test
checks the failure `invalid_request` with the message `note: at most 500 characters`, and that no
request leaves (the helper `noRequest()`). So the unknown id never reaches the server.

## What the block leaves

Nothing booked, no type and no pattern: test 1 cancels everything and `release()` removes the
pattern and the type. The block's `afterAll` writes the settings back to the values it read and
removes `fe-calendar-settings.local.json`. On `D` this block's three cancelled appointments stay
as history, all of them `fe-calendar`'s (next to whatever the "calendar view" block and earlier
runs left there):

| Time | Booked by | `cancelReason` | Cancelled by |
|---|---|---|---|
| 08:00–09:00 | `fe-calendar` | `changed` (`replacedBy` the 09:00) | `fe-calendar` |
| 09:00–10:00 | `fe-calendar`, by the change (`replaces` the 08:00) | `cancelled` | `fe-calendar` |
| 10:00–10:30 | the Administrator | `cancelled` | the Administrator |

With them stay their events, as the server writes them: two `appointment.booked`, one
`appointment.note_updated`, one `appointment.changed` and two `appointment.cancelled`
([the event log](../concepts.md#the-event-log)). The refused requests wrote nothing.

The next block, "availability conflict", needs no more than that: it makes its own type and
pattern on a free date (often `D` again), and `fe-calendar` books 08:00 there, which only an active
appointment could block.

## If the block fails halfway

- **The later tests still run.** vitest does not stop a block at its first failure. Tests 2 to 5
  need nothing from test 1.
- **A failed check in test 1 skips the rest of it**, the cancels and `release()` included. The
  booked appointments, the type and the pattern then stay until the end of the file. The next
  block still works: its own date is another one, since `D` still has a window.
- **The settings are written back** by the block's `afterAll` whatever happened.
- **The file's `afterAll`** (and the next run's `beforeAll`) removes the two Users through
  `DELETE /users/{username}`, which cancels their booked appointments with `cancelReason`
  `user_deleted` and leaves a deleted-user marker for each
  ([the deleted-user marker](../concepts.md#the-deleted-user-marker)). Then the helper `cleanUp()`
  deletes the patterns of the `fe-calendar …` types and the types.

So a failed run leaves nothing booked behind and can simply be run again. What stays is history:
the cancelled appointments, their events and the markers.

## Where in the code

| What | Where |
|---|---|
| The service | `AppointmentsService` (`frontend/src/services/appointments.service.ts`), types in `appointments.types.ts` |
| Methods, streams, routes | `book` → `bookResult$`, `POST /calendar/appointments` (route 17); `updateNote` → `updateNoteResult$`, `PATCH /calendar/appointments/{appointmentId}` (route 18); `cancel` → `cancelResult$`, `POST …/cancel` (route 19); `change` → `changeResult$`, `POST …/change` (route 20); `list` → `appointmentsResult$`, `GET /calendar/appointments` (route 16). `docs/SHARED_CALENDAR_SPEC.md` section 16.2 names two of them `noteResult$` and `listResult$`; the names in the code are those of `docs/FRONTEND_SERVICES.md` section 8, decision 40 |
| Checks before sending | the shared schemas `BookBody`, `ChangeBody`, `AppointmentIdParam`, `NoteBody`, `AppointmentsQuery` (`shared/src/calendar/schemas.ts`); the message built by `invalidRequest()` in `frontend/src/services/api.ts` |
| An answer becoming a result | `apiCall()` in `frontend/src/services/api.ts`: the `error` code becomes the `reason`, if the route lists it |
| Test helpers | in the test file: `bookingSettings()`, `bookableDate()`, `release()`, `book()`, `cancel()`, `list()`, `appointments()`, `ok()`, `noRequest()`; in `frontend/tests/integration/local.ts`: `outcome()` |
| Constants | `USER` (`fe-calendar`), `USER_B` (`fe-calendar-b`), `BAND_OFFSET` (330 days), `UNKNOWN_ID` |
