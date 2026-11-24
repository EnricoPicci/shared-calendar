# The "the capacity of a type (AC-37 to AC-44)" journey, in simple words

| | |
|---|---|
| Test file | `backend/tests/integration/calendar.test.ts` |
| `describe` | `the capacity of a type (AC-37 to AC-44)` |
| Tests | 1. "prepares the settings, the Pool with a capacity of 3 (14:00–18:00) and the Pair with a capacity of 2 (09:00–12:00) on S"<br>2. "AC-37: cap-alice and cap-bob book the Pool at 14:00: 201 both; cap-carol sees the slot with capacity 3 and 1 place left, nothing busy"<br>3. "AC-38: cap-carol books 14:00 too; cap-dan is refused 409 slot_taken, and sees 14:00–15:00 busy with no slot there"<br>4. "AC-39: the Administrator booking cap-dan is 409 slot_taken, then 201 with overbook: true; the Administrator sees the slot with no place left"<br>5. "AC-40: the Administrator booking cap-alice at 14:00 again is 409 user_busy, forced or not"<br>6. "AC-41: a User sending overbook: true is 403 forbidden, in a booking and in a change, and nothing is written"<br>7. "AC-42: in the Pair (capacity 2), cap-alice 09:00–09:30 and cap-bob 09:30–10:00 are never there together: cap-carol books 09:00, then cap-dan is refused"<br>8. "R-CHG-01: the Administrator moving cap-dan into the full Pair is 409 slot_taken, then 201 with overbook: true; moving cap-alice onto cap-alice’s own Pool hour is 409 user_busy, forced or not"<br>9. "AC-43: the Administrator edits the Pool to a capacity of 1: 200; the three appointments stay booked; 14:00 has no place left, 15:00 has 1"<br>10. "AC-44: a type created without capacity has 1; a rename with the name only keeps it; after an edit to 3, a rename with the name only keeps 3"<br>11. "leaves S empty: every appointment cancelled, the patterns and the types deleted, the settings restored" |
| Runs against | the local stack: the API on port 3000 (`sam local`), cognito-local on port 9229, DynamoDB Local on `DYNAMODB_PORT` (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys: [the settings](../concepts.md#the-settings),
[availability types](../concepts.md#availability-types),
[where a window comes from](../concepts.md#where-a-window-comes-from),
[windows and slots](../concepts.md#windows-and-slots),
[places in a slot](../concepts.md#places-in-a-slot),
[`busy` and `appointments`](../concepts.md#busy-and-appointments-in-the-calendar-view),
[a change cancels one appointment and books another](../concepts.md#a-change-cancels-one-appointment-and-books-another),
[the `calendar` table and its items](../concepts.md#the-calendar-table-and-its-items),
[the event log](../concepts.md#the-event-log).

## What this block proves

- A type holds as many people at once as its capacity: a booking is refused `409 slot_taken` only
  when no place is left, and people are counted at their peak, so two appointments that touch
  share one place (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-07, R-SLOT-02, decision D25; AC-37,
  AC-38, AC-42).
- Only the Administrator goes over the capacity, with `overbook: true`; a User who sends it gets
  `403`; one person is never booked twice at the same time, forced or not (`docs/SHARED_CALENDAR_SPEC.md`
  R-BOOK-12, R-BOOK-13, R-CHG-01; AC-39 to AC-41).
- A User sees the places left on a slot and a full time as `busy`, never who is there; the
  Administrator sees the full slots too (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-03 to R-SLOT-06).
- A capacity lowered under the people booked cancels nobody, and an edit without a capacity keeps
  the stored one (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-05, decision D28; AC-43, AC-44).

## Who takes part

The scenarios of `docs/SHARED_CALENDAR_SPEC.md` section 18.3 speak of `alice`, `bob`, `carol` and
`dan`. The seeded `alice` must never be deleted, so four throw-away Users play them:
**`cap-alice`**, **`cap-bob`**, **`cap-carol`** and **`cap-dan`**.

- **The Administrator** (`admin`): saves the settings, makes the two types and their patterns,
  books for the Users (custom times, and over the capacity), changes and cancels, edits the types.
- **The four Users**: book whole hours, look at the day, and try what a User may not do.

## Before the block starts

**The file's `beforeAll`** empties the local `calendar` table and signs in `admin` and `alice`.
The blocks above leave settings, types, patterns on the working days and appointments on
Wednesdays, Thursdays, Fridays and Tuesdays. This block relies on none of it: it saves its own
settings, makes its own types and books on a **Saturday**, where no block above books.

**The block's `beforeAll`** removes the four `cap-…` Users if an earlier run left them
(`removeUserIfPresent()`, straight in cognito-local), creates each again through `POST /users`
(`201`) and signs each in with the password of the answer.

**The date.** `S` is the first Saturday on or after today + 8 days in `Europe/Rome`, counted with
the shared date helpers. Both patterns are valid on `S` alone, so nothing else in the calendar
changes.

## Test 1: the settings, the Pool and the Pair

The test keeps the settings it finds (`leftover`), then saves its own: a notice of 24 hours to
cancel, no booking notice, a horizon of 56 days, no limit. `S` is 8 to 14 days ahead, so every
booking of the block is inside them. Then, for each of two types, it creates the type with a
capacity and a Saturday pattern valid on `S` only:

| Type | Capacity | Hours on `S` | Slots |
|---|---|---|---|
| "Capacity pool" (the Pool) | 3 | 14:00–18:00 | 14:00, 15:00, 16:00, 17:00 |
| "Capacity pair" (the Pair) | 2 | 09:00–12:00 | 09:00, 10:00, 11:00 |

The test checks that each type is `201` with its `name` and `capacity` in the answer, and each
pattern `201`. In the table, the test checks that each `TYPE` item holds its `name` and
`capacity`.

## Test 2 (AC-37): two people in a place for three

`cap-alice` and `cap-bob` each book `S` 14:00. The test checks `201` for both. Then `cap-carol`
loads the day. The test checks that:

- the slot 14:00 is exactly `{ start, end: 15:00, typeId: the Pool, capacity: 3, placesLeft: 1 }`:
  two people in it, one place left;
- the slot 15:00 has `capacity` 3 and `placesLeft` 3;
- `busy` is empty: a time with a place left is not full (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-06).

Then `cap-alice` loads the day. The test checks that the slot 14:00 is not in it: a User is not
offered a slot that overlaps their own appointment, even with places left
(`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-03).

## Test 3 (AC-38): the third person fills it

`cap-carol` books 14:00: `201`. `cap-dan` books 14:00. The test checks `409` with exactly
`{ error: 'slot_taken', message: 'The time is already booked' }`: three people are in a place for
three. Then `cap-dan` loads the day. The test checks that:

- there is no slot at 14:00;
- `busy` is exactly one interval, 14:00–15:00;
- the whole answer holds no text `cap-`: `cap-dan` learns that the hour is full, not who fills it
  (`docs/SHARED_CALENDAR_SPEC.md` section 17).

## Test 4 (AC-39): the Administrator goes over the capacity

1. The Administrator books `{ username: 'cap-dan', start: 14:00 }`. The test checks `409
   slot_taken`: the Administrator meets the capacity too.
2. The Administrator sends the same request with `overbook: true`. The test checks `201`.
3. The Administrator loads the day. The test checks that the slot 14:00 is still listed, with
   `capacity` 3 and `placesLeft` 0: the Administrator's view keeps the full slots, so a booking
   over the capacity can start from one (`docs/SHARED_CALENDAR_SPEC.md` decision D30).

In the table, the test checks that:

- the booked `APPT` items at 14:00 are those of `cap-alice`, `cap-bob`, `cap-carol` and `cap-dan`:
  four people in a place for three;
- the new `APPT` item names `cap-dan`, was created by the Administrator and has no `overbook`
  attribute;
- its only event is `appointment.booked`, and no event of it holds the word `overbook`: the force
  is not stored anywhere (`docs/SHARED_CALENDAR_SPEC.md` decision D31).

## Test 5 (AC-40): never twice at the same time

The Administrator books `cap-alice` at 14:00 again, once with `overbook: false` and once with
`overbook: true`. The test checks, both times, `409` with exactly `{ error: 'user_busy', message:
'The User already has an appointment at this time' }`. `cap-alice` already holds 14:00, and
`overbook` lifts the capacity only, never this rule (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12,
R-BOOK-13). In the table, the test checks that 14:00 still has four booked appointments.

## Test 6 (AC-41): a User cannot force

The test counts the `APPT` items first. Then:

- `cap-alice` books 15:00 with `overbook: true`. The test checks `403` with exactly `{ error:
  'forbidden', message: 'Only the Administrator can book over the capacity' }`. The hour has
  places: the refusal comes from the flag alone, before any calendar rule.
- `cap-alice` asks to change their 14:00 appointment to 15:00 with `overbook: true`
  (`POST /calendar/appointments/{id}/change`). The test checks `403 forbidden`.

In the table, the test checks that the number of `APPT` items is unchanged.

## Test 7 (AC-42): people counted at their peak

The Pair holds two people. The Administrator books two custom times in its hour 09:00–10:00:

| Who | Time | Booked by |
|---|---|---|
| `cap-alice` | 09:00–09:30 | the Administrator |
| `cap-bob` | 09:30–10:00 | the Administrator |

The test checks `201` for both. The two touch at 09:30 but are never there together, so the hour
holds **one** person at its peak, not two (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-02, decision D25).
The test checks that:

- `cap-carol`'s view has the slot 09:00 with `capacity` 2 and `placesLeft` 1;
- `cap-carol` books 09:00: `201`. Now 09:00–09:30 holds two people, and 09:30–10:00 two as well;
- `cap-dan` books 09:00: `409 slot_taken`;
- the Administrator's view has the slot 09:00 with `capacity` 2 and `placesLeft` 0.

## Test 8 (R-CHG-01): the capacity in a change

A change is a cancel and a booking in one step, and its booking meets the same rules
(`docs/SHARED_CALENDAR_SPEC.md` R-CHG-01, [a change cancels one appointment and books
another](../concepts.md#a-change-cancels-one-appointment-and-books-another)).

1. The Administrator moves `cap-dan`'s 14:00 (the forced one of test 4) to 09:00, in the full Pair.
   The test checks `409 slot_taken`.
2. The same change with `overbook: true`. The test checks `201`, and that the new appointment
   names `cap-dan` and has the Pair's type. In the table, the test checks that the booked
   appointments at 14:00 are those of `cap-alice`, `cap-bob` and `cap-carol` again: the change
   cancelled the forced one.
3. The Administrator moves `cap-alice`'s 09:00–09:30 to 14:00, without and with `overbook: true`.
   The test checks `409 user_busy` both times: the old appointment is left out of the count, but
   `cap-alice` still holds 14:00.

## Test 9 (AC-43): a capacity lowered under the people booked

The Administrator edits the Pool to `{ name: 'Capacity pool', capacity: 1 }`. The test checks `200`
with the new `capacity` in the answer. Then:

- in the table, the booked appointments at 14:00 are still those of `cap-alice`, `cap-bob` and
  `cap-carol`: lowering the capacity cancels nobody (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-05);
- the Administrator's view has the slot 14:00 with `capacity` 1 and `placesLeft` 0 (never below
  0), and 15:00 with `capacity` 1 and `placesLeft` 1;
- `cap-dan`'s `busy` holds 14:00–15:00.

## Test 10 (AC-44): an edit without a capacity keeps it

The Administrator creates "Capacity plain" without a capacity. The test checks `201` with
`capacity` 1, and in the table the `TYPE` item holds `capacity` 1. Then three edits, each `200`
with the answer shown:

| Body | `name` in the answer | `capacity` in the answer |
|---|---|---|
| `{ name: 'Capacity plain 2' }` | Capacity plain 2 | 1 |
| `{ name: 'Capacity plain 2', capacity: 3 }` | Capacity plain 2 | 3 |
| `{ name: 'Capacity plain 3' }` | Capacity plain 3 | 3 |

An edit without a capacity keeps the stored one, it does not go back to 1
(`docs/SHARED_CALENDAR_SPEC.md` decision D28). In the table, the item holds "Capacity plain 3" and
3. The test deletes the type: `204`.

## Test 11: `S` left empty

The day after test 8, as the Administrator lists it:

| Time | Whose | Type |
|---|---|---|
| 09:00–09:30 | `cap-alice` | Pair |
| 09:30–10:00 | `cap-bob` | Pair |
| 09:00–10:00 | `cap-carol` | Pair |
| 09:00–10:00 | `cap-dan` | Pair |
| 14:00–15:00 | `cap-alice`, `cap-bob`, `cap-carol` | Pool |

1. The Administrator lists the booked appointments of `S` (`GET /calendar/appointments`, which
   lists `booked` ones when no `status` is given). The test checks there are 7, and cancels each:
   `200` (the Administrator has no notice to respect).
2. It deletes both patterns and both types: `204` each. Nothing uses the types any more.
3. The test checks that the Administrator's day `S` has no window, no slot and no `busy`.
4. It writes back the four values kept in test 1 and checks `200` and those values.

## What the block leaves

`S` has no window and no booked appointment. In the table stay, as history, the cancelled
appointments of `S` (the forced 14:00 of `cap-dan`, cancelled by the change, and the seven of
test 11) and their events. The settings are what the blocks above left. The `afterAll` removes
the four Users straight from cognito-local. The assistant's journeys use Saturdays of their own
and need them empty of windows; this block leaves its Saturday so.

## If the block fails halfway

- **Later tests still run** and depend on the earlier ones: the people at 14:00 and 09:00, and the
  ids kept in `appts` and `types`. Read the first failure first.
- **`S` may stay open.** Test 11 alone cancels the appointments and deletes the patterns and
  types; a failure before it leaves them, booked, on `S`. The settings stay at the block's own
  values too. The assistant's journeys pick a Saturday at least 12 days ahead, so on a run where
  `S` is that Saturday they meet this block's windows.
- **The Users go.** The `afterAll` removes them whatever happened; the next run's `beforeAll`
  removes them again before creating them.
- **The table starts empty next time**: the file empties the `calendar` table first.

## Where in the code

| What | Where |
|---|---|
| The types | `POST /calendar/types`, `PUT /calendar/types/{typeId}`: `createAvailabilityType.ts`, `renameAvailabilityType.ts`; `createType()`, `renameType()` in `backend/src/lib/calendarDb.ts` (an item without `capacity` reads as 1) |
| Booking | `POST /calendar/appointments`: `backend/src/handlers/bookAppointment.ts` (a User's `overbook: true` is `403` before the lock); `checkBooking()` in `backend/src/lib/calendarRules.ts` (R-BOOK-12, then R-BOOK-07 with `peopleIn()`) |
| Change | `POST /calendar/appointments/{appointmentId}/change`: `backend/src/handlers/changeAppointment.ts`; `checkChange()` |
| The view | `GET /calendar`: `calendarView()` in `backend/src/lib/calendarRules.ts` (`capacity`, `placesLeft`, the full slots for the Administrator, `busy`) |
| People at their peak | `peopleIn()` in `shared/src/calendar/rules.ts` |
| Test helpers | in the block: `S()`, `at()`, `book()`, `dayOf()`, `slotAt()`, `bookedAt()`; in `backend/tests/integration/setup.ts`: `api()`, `signIn()`, `removeUserIfPresent()`, `getCalendarItem()`, `queryCalendarPartition()` |
| Constants | `ZONE` (`Europe/Rome`), `SETTINGS`, `PEOPLE`; the state `tokens`, `types`, `patterns`, `appts`, `leftover` |

## Background: which test proves which rule

| Rule (`docs/SHARED_CALENDAR_SPEC.md`) | Answer | Test |
|---|---|---|
| R-BOOK-13: a User sending `overbook: true` | `403 forbidden` | 6 |
| R-BOOK-12: the same User already there | `409 user_busy`, forced or not | 5, 8 |
| R-BOOK-07: no place left | `409 slot_taken`; the Administrator passes with `overbook: true` | 3, 4, 7, 8 |
| R-SLOT-02: people at their peak, places left | `capacity`, `placesLeft` on each slot | 2, 7, 9 |
| R-SLOT-03, R-SLOT-04: who gets which slots | a User's full and own slots left out; the Administrator's full slots kept | 2, 3, 4, 7 |
| R-SLOT-06: busy is the time that is full | `busy` | 2, 3, 9 |
| R-TYPE-05, decision D28: the capacity of a type | created, kept, lowered | 1, 9, 10 |
