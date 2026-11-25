# The "times on 5-minute steps and windows of whole hours (AC-45 to AC-52)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/calendar.test.ts` |
| `describe` | `times on 5-minute steps and windows of whole hours (AC-45 to AC-52)` |
| Tests | 1. "prepares the settings and the type; a pattern off the step (08:07) or not whole hours (08:05–12:00) is 400, the pattern 08:05–12:05 on S is 201"<br>2. "AC-45: step-alice sees the window 08:05–12:05 and the slots 08:05, 09:05, 10:05 and 11:05, counted from its start"<br>3. "AC-49: a one-off window 13:05–14:10 and a day’s own hours 08:05–10:30 are 400, nothing stored; times off the step are 400 too"<br>4. "AC-50: a one-off window 12:05–13:05 joins the pattern, and a second one 14:05–15:05 stands apart: slots 08:05 to 12:05, then 14:05"<br>5. "AC-46: the Administrator books step-alice 10:10–10:35: 201; the slot 10:05 has no place left, and step-alice is not offered it"<br>6. "AC-47: five minutes are enough, 11:00–11:05: 201, touching the slot 11:05 without taking it"<br>7. "AC-51: step-alice books 09:05, a slot: 201, one hour; 09:10 inside the window is 409 outside_availability"<br>8. "AC-48: the Administrator at 09:07, or until 09:52, is 400; step-alice at 10:10 is 409 outside_availability, not a slot; nothing is stored"<br>9. "leaves S empty: every appointment cancelled, the windows, the pattern and the type deleted, the settings restored" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT` (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys: [the settings](../concepts.md#the-settings),
[availability types](../concepts.md#availability-types),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[windows and slots](../concepts.md#windows-and-slots),
[places in a slot](../concepts.md#places-in-a-slot),
[the `calendar` table and its items](../concepts.md#the-calendar-table-and-its-items).

## What this block proves

- The Administrator's times lie on 5-minute steps of the local clock: a weekly pattern, a one-off
  window and a custom appointment may start and end at 08:05 or 10:35, and a time off the step,
  such as 08:07, is `400 invalid_request` (`docs/SHARED_CALENDAR_SPEC.md` decision D32, R-BOOK-02;
  AC-46, AC-48).
- A custom appointment may last 5 minutes, one step (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02;
  AC-47).
- A window lasts a whole number of hours from its start: a pattern, a one-off window and a day's
  own hours that do not are `400 invalid_request`, and nothing is stored
  (`docs/SHARED_CALENDAR_SPEC.md` decision D33; AC-49).
- A User's slots are the hours counted from the start of the window, also across windows of the
  same type that touch (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01, section 6.6; AC-45, AC-50).
- A User books a slot's start; a start on the step that is not a slot is
  `409 outside_availability` (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-06; AC-48, AC-51).
- The nights the clocks change (`docs/SHARED_CALENDAR_SPEC.md` AC-52) are not here: the local
  stack cannot move its clock, so the unit tests of `slotsOf()` prove them.

## Who takes part

The scenarios of `docs/SHARED_CALENDAR_SPEC.md` section 18.3 speak of `alice`. The seeded `alice`
must never be deleted, so a throw-away User plays `alice`: **`step-alice`**.

- **The Administrator** (`admin`): saves the settings, makes the type, the pattern and the two
  one-off windows, books for `step-alice` with custom times, and cleans up.
- **`step-alice`**: looks at the day, books a slot, and tries two starts that are not slots.

## Before the block starts

**The file's `beforeAll`** empties the local `calendar` table and signs in `admin` and `alice`.
The blocks above leave settings, types, patterns (on the working days, and a Sunday pattern
01:00–04:00) and appointments on Wednesdays, Thursdays, Fridays and Tuesdays. This block relies on
none of it: it saves its own settings, makes its own type and works on a **Saturday**.

**The block's `beforeAll`** removes `step-alice` if an earlier run left the account
(`removeUserIfPresent()`, straight in cognito-local), creates it again through `POST /users`
(`201`) and signs it in with the password of the answer.

**The date.** `S` is the first Saturday on or after today + 8 days in `Europe/Rome`, counted with
the shared date helpers. It is the same Saturday as the block of the capacity, just above, which
left it with no window and no booked appointment. The pattern of this block is valid on `S`
alone, so nothing else in the calendar changes.

## Test 1: the settings, the type and a pattern that opens at 08:05

The test keeps the settings it finds (`leftover`), then saves its own: a notice of 24 hours to
cancel, no booking notice, a horizon of 56 days, no limit. It creates the type "Step studio"
(`201`; its capacity is 1, since none is given).

Then it asks three times for a Saturday pattern of that type, valid on `S` only:

1. From 08:07 to 12:05. The test checks `400` with the code `invalid_request`: 08:07 is not on a
   5-minute step, and the shared schema `LocalTime` refuses it before anything is read or written.
2. From 08:05 to 12:00. The test checks `400` with exactly `{ error: 'invalid_request', message:
   'Invalid input: end' }`: three hours and 55 minutes is not a whole number of hours, and the
   shared `PatternBody` refuses the end (`docs/SHARED_CALENDAR_SPEC.md` decision D33). The answer
   names the field only, as for every refusal of a schema. In the table, the test checks that no
   `PATTERN` item has this block's type.
3. From 08:05 to 12:05. The test checks `201` and that the answer holds `start` 08:05 and `end`
   12:05. In the table, the test checks that the `PATTERN` item holds the same two times.

## Test 2 (AC-45): the slots counted from 08:05

`step-alice` asks for the day `S` (`GET /calendar`). The test checks that:

- the day has one window, from 08:05 to 12:05, as instants;
- the slots are exactly 08:05–09:05, 09:05–10:05, 10:05–11:05 and 11:05–12:05.

A slot starts at the window's start or a whole number of hours after it
(`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01), so the four hours of the window are four slots.

## Test 3 (AC-49): windows not whole hours, and times off the step

Four requests of the Administrator, each refused by a shared schema before the day is touched:

| Asks for | `message` of the `400 invalid_request` |
|---|---|
| a one-off window 13:05–14:10 (`POST /calendar/windows`) | exactly "Invalid input: end" |
| hours of its own for `S`, one window 08:05–10:30 (`PUT /calendar/overrides/{date}`) | exactly "Invalid input: windows.0.end" |
| a one-off window 15:00–16:02 | the code only is checked |
| hours of its own for `S`, one window 08:05–12:03 | the code only is checked |

The first two are on the step but not whole hours; the last two end off the step. In the table,
the test checks that `S` has no `OVERRIDE` item and no `WINDOW` item. Then `step-alice` looks at
the day: the test checks it still has the one window of the pattern.

## Test 4 (AC-50): a window that joins the pattern, and one apart

1. The Administrator adds a one-off window 12:05–13:05 (`201`); its id is kept as `joinedId`. It
   starts where the pattern ends and has the same type.
2. The Administrator adds a one-off window 14:05–15:05 (`201`, and the answer holds those two
   times); its id is kept as `windowId`.
3. `step-alice` looks at the day. The test checks the three windows as they were defined,
   08:05–12:05, 12:05–13:05 and 14:05–15:05, and the slots 08:05, 09:05, 10:05, 11:05, 12:05 and
   14:05.

The first two windows touch and share the type, so they form one effective window 08:05–13:05
(`docs/SHARED_CALENDAR_SPEC.md` section 6.6), and its slots run on from 08:05 to 12:05. The window
14:05–15:05 stands apart and gives its own slot. The view still lists the windows one by one: only
the slots see them joined.

## Test 5 (AC-46): a custom appointment from 10:10 to 10:35

The Administrator books `step-alice` from 10:10 to 10:35 (`POST /calendar/appointments` with
`username`, `start` and `end`). The test checks `201` and that the answer names `step-alice` with
those two instants. In the table, the test checks that the `APPT` item holds them too.

Then the two views of the day:

- the Administrator's slot 10:05–11:05 has `placesLeft` 0. The 25 minutes count one person in the
  hour that holds them, and the type holds one (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-05);
- `step-alice`'s slots are 08:05, 09:05, 11:05, 12:05 and 14:05. The slot 10:05 is not offered:
  it has no place left and overlaps `step-alice`'s own appointment (`docs/SHARED_CALENDAR_SPEC.md`
  R-SLOT-02, R-SLOT-03).

## Test 6 (AC-47): five minutes

The Administrator books `step-alice` from 11:00 to 11:05. The test checks `201` with those
instants: one step is the shortest appointment (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02). Then
the test checks that the Administrator's slot 11:05 still has `placesLeft` 1: the appointment ends
where the slot starts, and two intervals that touch do not overlap.

## Test 7 (AC-51): `step-alice` books a slot, and is refused a time that is not one

1. `step-alice` books 09:05, with no `end`. The test checks `201`, the username and the times
   09:05–10:05: a User's appointment lasts one hour.
2. `step-alice` books 09:10. The test checks `409` with exactly `{ error: 'outside_availability',
   message: 'The time is not inside the availability' }`. 09:10 is on the step, so the check of
   the body lets it through (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02); under the lock the server
   finds the window and sees that 09:10 is none of its slots (R-BOOK-06 of the same document).
   The hour would also overlap `step-alice`'s own 09:05, but `docs/SHARED_CALENDAR_SPEC.md`
   section 8.2 checks R-BOOK-06 before R-BOOK-12, so `outside_availability` answers.

In the table, the test checks the booked appointments of `step-alice`, by start:

| Time on `S` | Booked by |
|---|---|
| 09:05–10:05 | `step-alice` |
| 10:10–10:35 | the Administrator |
| 11:00–11:05 | the Administrator |

## Test 8 (AC-48): off the step, and a User's start that is not a slot

Three bookings. The test checks the status and the whole body of each:

| Who | Asks for | Answer |
|---|---|---|
| the Administrator | `step-alice` at 09:07 | `400`, "Invalid input: start must be on a 5-minute step" |
| the Administrator | `step-alice` 09:00–09:52 | `400`, "Invalid input: end must be on a 5-minute step" |
| `step-alice` | 10:10 | `409 outside_availability`, "The time is not inside the availability" |

The first two are refused from the body alone, before the lock. The third is on the step and
inside the window, but no slot starts at 10:10 (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-06). The
hour would also overlap `step-alice`'s own 10:10–10:35 and 11:00–11:05; as in test 7, R-BOOK-06
comes first in the order of `docs/SHARED_CALENDAR_SPEC.md` section 8.2. In the
table, the test checks that `step-alice` still has three booked appointments.

## Test 9: `S` left empty

1. The Administrator lists the booked appointments of `S` (`GET /calendar/appointments`, which
   lists `booked` ones when no `status` is given). The test checks there are 3, and cancels each:
   `200` (the Administrator has no notice to respect).
2. It deletes the two one-off windows, the pattern and the type: `204` each.
3. The test checks that the Administrator's day `S` has no window, no slot and no `busy`.
4. It writes back the four values kept in test 1 and checks `200` and those values.

## What the block leaves

`S` has no window and no booked appointment. In the table stay, as history, the three cancelled
appointments of `step-alice` and their events. The settings are what the blocks above left. The
`afterAll` removes `step-alice` straight from cognito-local. The assistant's journeys use
Saturdays of their own and need them empty of windows; this block leaves its Saturday so.

## If the block fails halfway

- **Later tests still run** and depend on the earlier ones: the type, the pattern and the windows
  kept in `typeId`, `patternId`, `windowId` and `joinedId`, the slots of test 4, and the count of
  three appointments. Read the
  first failure first.
- **`S` may stay open.** Test 9 alone cancels the appointments and deletes the windows, the pattern
  and the type; a failure before it leaves them on `S`. The settings stay at the block's own
  values too.
- **The User goes.** The `afterAll` removes the account whatever happened; the next run's
  `beforeAll` removes it again before creating it.
- **The table starts empty next time**: the file empties the `calendar` table first.

## Where in the code

| What | Where |
|---|---|
| The step | `TIME_STEP_MINUTES` in `shared/src/calendar/defaults.ts` |
| A window's times | `LocalTime` and `LocalEndTime` in `shared/src/calendar/schemas.ts`, and the whole hours of `WindowBody`, `PatternBody` and `OneOffWindowBody` there, through `lastsWholeHours()` of `shared/src/calendar/rules.ts`; the bodies of `POST /calendar/patterns`, `POST /calendar/windows` and `PUT /calendar/overrides/{date}` are checked with them; `validate()` in `backend/src/lib/validation.ts` names the refused field |
| A booking's times | `POST /calendar/appointments`: `backend/src/handlers/bookAppointment.ts`; `checkBookingTimes()` (the step, before the lock) and `checkBooking()` (a User's start among the window's slots, under it) in `backend/src/lib/calendarRules.ts`, with `isOnTimeStep()` of `shared/src/calendar/rules.ts` |
| The slots | `effectiveWindows()` and `slotsOf()` in `shared/src/calendar/rules.ts`; `GET /calendar`: `calendarView()` in `backend/src/lib/calendarRules.ts` |
| Test helpers | in the block: `S()`, `at()`, `book()`, `dayOf()`, `bookedOnS()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `getCalendarItem()`, `queryCalendarPartition()` |
| Constants | `ZONE` (`Europe/Rome`), `SETTINGS`, `USER`; the state `userToken`, `typeId`, `patternId`, `windowId`, `joinedId`, `leftover` |
