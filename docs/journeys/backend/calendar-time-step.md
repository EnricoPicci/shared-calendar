# The "times on 5-minute steps (AC-45 to AC-48)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/calendar.test.ts` |
| `describe` | `times on 5-minute steps (AC-45 to AC-48)` |
| Tests | 1. "prepares the settings and the type; a pattern off the step (08:07) is 400, the pattern 08:05–12:00 on S is 201"<br>2. "AC-45: step-alice sees the window 08:05–12:00 and the slots 09:00, 10:00 and 11:00: none starts at 08:05"<br>3. "a one-off window 13:05–14:10 is 201 and adds no slot; a window and a day’s own hours off the step are 400"<br>4. "AC-46: the Administrator books step-alice 10:10–10:35: 201; the slot 10:00 has no place left, and step-alice is not offered it"<br>5. "AC-47: five minutes are enough, 11:00–11:05: 201; so are 08:05–08:55, the open time in which no slot starts"<br>6. "AC-48: the Administrator at 09:07, or until 09:52, is 400; step-alice at 09:10 is 400, not a whole hour; nothing is stored"<br>7. "leaves S empty: every appointment cancelled, the window, the pattern and the type deleted, the settings restored" |
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
- The slot does not follow the step. A User still books whole local hours only, and a window that
  opens at 08:05 gives its first slot at 09:00 (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01; AC-45,
  AC-48).

## Who takes part

The scenarios of `docs/SHARED_CALENDAR_SPEC.md` section 18.3 speak of `alice`. The seeded `alice`
must never be deleted, so a throw-away User plays her: **`step-alice`**.

- **The Administrator** (`admin`): saves the settings, makes the type, the pattern and the one-off
  window, books for `step-alice` with custom times, and cleans up.
- **`step-alice`**: looks at the day, and tries to book a time that is not a whole hour.

## Before the block starts

**The file's `beforeAll`** empties the local `calendar` table and signs in `admin` and `alice`.
The blocks above leave settings, types, patterns on the working days and appointments on
Wednesdays, Thursdays, Fridays and Tuesdays. This block relies on none of it: it saves its own
settings, makes its own type and works on a **Saturday**.

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

Then it asks twice for a Saturday pattern of that type, valid on `S` only:

1. From 08:07 to 12:00. The test checks `400` with the code `invalid_request`: 08:07 is not on a
   5-minute step, and the shared schema `LocalTime` refuses it before anything is read or written.
2. From 08:05 to 12:00. The test checks `201` and that the answer holds `start` 08:05 and `end`
   12:00. In the table, the test checks that the `PATTERN` item holds the same two times.

## Test 2 (AC-45): the slots of a window that opens at 08:05

`step-alice` asks for the day `S` (`GET /calendar`). The test checks that:

- the day has one window, from 08:05 to 12:00, as instants;
- the slots are exactly 09:00–10:00, 10:00–11:00 and 11:00–12:00.

No slot starts at 08:05: a slot starts on a whole local hour, whatever the step of the window
(`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01). The 55 minutes from 08:05 to 09:00 are open time in
which no slot starts; test 5 shows who can use them.

## Test 3: a one-off window on the step, and two refusals

1. The Administrator adds a one-off window on `S`, 13:05–14:10, of the same type
   (`POST /calendar/windows`). The test checks `201` and the two times in the answer.
2. `step-alice` looks at the day again. The test checks two windows, 08:05–12:00 and 13:05–14:10,
   and the same three slots as before. The new window is 65 minutes long, but no whole hour fits
   in it: 14:00–15:00 would end after it closes.
3. The Administrator asks for another one-off window, 15:00–16:02. The test checks `400
   invalid_request`.
4. The Administrator sets hours of its own for `S` (`PUT /calendar/overrides/{date}`) with one
   window 08:05–12:03. The test checks `400 invalid_request`. Nothing replaced the pattern: the
   refusal comes from the schema, before the day is touched.

## Test 4 (AC-46): a custom appointment from 10:10 to 10:35

The Administrator books `step-alice` from 10:10 to 10:35 (`POST /calendar/appointments` with
`username`, `start` and `end`). The test checks `201` and that the answer names `step-alice` with
those two instants. In the table, the test checks that the `APPT` item holds them too.

Then the two views of the day:

- the Administrator's slot 10:00–11:00 has `placesLeft` 0. The 25 minutes count one person in the
  hour that holds them, and the type holds one (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-05);
- `step-alice`'s slots are 09:00 and 11:00. The slot 10:00 is not offered to her: it overlaps her
  own appointment (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-03).

## Test 5 (AC-47): five minutes, and the time before the first slot

1. The Administrator books `step-alice` from 11:00 to 11:05. The test checks `201` with those
   instants: one step is the shortest appointment (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02).
2. The Administrator books `step-alice` from 08:05 to 08:55. The test checks `201`. No slot starts
   in that time, so no User could book it; the Administrator can, with custom times, because the
   time is inside the window.

In the table, the test checks that the booked appointments of `step-alice` are now three:

| Time on `S` | Booked by |
|---|---|
| 08:05–08:55 | the Administrator |
| 10:10–10:35 | the Administrator |
| 11:00–11:05 | the Administrator |

## Test 6 (AC-48): off the step, and a User off the hour

Three bookings, each refused before the server looks at the calendar. The test checks `400` and
the whole body of each:

| Who | Asks for | `message` |
|---|---|---|
| the Administrator | `step-alice` at 09:07 | "Invalid input: start must be on a 5-minute step" |
| the Administrator | `step-alice` 09:00–09:52 | "Invalid input: end must be on a 5-minute step" |
| `step-alice` | 09:10 | "Invalid input: start must be a whole hour" |

The third is on the 5-minute step, and still refused: the step is for the Administrator, a User's
start is a whole local hour (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02). In the table, the test
checks that `step-alice` still has three booked appointments.

## Test 7: `S` left empty

1. The Administrator lists the booked appointments of `S` (`GET /calendar/appointments`, which
   lists `booked` ones when no `status` is given). The test checks there are 3, and cancels each:
   `200` (the Administrator has no notice to respect).
2. It deletes the one-off window, the pattern and the type: `204` each.
3. The test checks that the Administrator's day `S` has no window, no slot and no `busy`.
4. It writes back the four values kept in test 1 and checks `200` and those values.

## What the block leaves

`S` has no window and no booked appointment. In the table stay, as history, the three cancelled
appointments of `step-alice` and their events. The settings are what the blocks above left. The
`afterAll` removes `step-alice` straight from cognito-local. The assistant's journeys use
Saturdays of their own and need them empty of windows; this block leaves its Saturday so.

## If the block fails halfway

- **Later tests still run** and depend on the earlier ones: the type, the pattern and the window
  kept in `typeId`, `patternId` and `windowId`, and the count of three appointments. Read the
  first failure first.
- **`S` may stay open.** Test 7 alone cancels the appointments and deletes the window, the pattern
  and the type; a failure before it leaves them on `S`. The settings stay at the block's own
  values too.
- **The User goes.** The `afterAll` removes the account whatever happened; the next run's
  `beforeAll` removes it again before creating it.
- **The table starts empty next time**: the file empties the `calendar` table first.

## Where in the code

| What | Where |
|---|---|
| The step | `TIME_STEP_MINUTES` in `shared/src/calendar/defaults.ts` |
| A window's times | `LocalTime` and `LocalEndTime` in `shared/src/calendar/schemas.ts`, which the bodies of `POST /calendar/patterns`, `POST /calendar/windows` and `PUT /calendar/overrides/{date}` are checked with |
| A booking's times | `POST /calendar/appointments`: `backend/src/handlers/bookAppointment.ts`; `checkBookingTimes()` in `backend/src/lib/calendarRules.ts`, with `isOnTimeStep()` and `isWholeLocalHour()` of `shared/src/calendar/rules.ts` |
| The slots | `slotsOf()` in `shared/src/calendar/rules.ts`; `GET /calendar`: `calendarView()` in `backend/src/lib/calendarRules.ts` |
| Test helpers | in the block: `S()`, `at()`, `book()`, `dayOf()`, `bookedOnS()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `getCalendarItem()`, `queryCalendarPartition()` |
| Constants | `ZONE` (`Europe/Rome`), `SETTINGS`, `USER`; the state `userToken`, `typeId`, `patternId`, `windowId`, `leftover` |
