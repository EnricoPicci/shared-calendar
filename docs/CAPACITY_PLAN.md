# Shared Calendar: several people in one slot, a capacity per type (implementation plan)

**Version:** v3 (2026-11-24): step u1 done, the rules in the governing documents
(`docs/SHARED_CALENDAR_SPEC.md` v17, `docs/ARCHITECTURE.md` v15 open). v2 (2026-11-24): the four proposals of planning (F4 to F7) decided by the Product
Owner, F6 changed: side by side up to three people. v1 (2026-11-24): the plan, after the Product
Owner's answers to eight questions (section 2). No step done.
**Brief:** `prompts/e10-plan-concurrent-users-per-type.md`.
**Governed by:** `docs/SHARED_CALENDAR_SPEC.md`, `docs/ARCHITECTURE.md`,
`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
`docs/CONVERSATIONAL_ARCHITECTURE.md`. On any conflict those documents win, and this plan is
fixed. Step u1 writes the decisions below into them.

---

## 1. What is asked, and the shape of the answer

An availability type gets a **capacity**: how many people may be booked at the same time in
one of its windows. "Swimming Pool" may hold 3, "Studio" 1. The default is 1, which is today's
behaviour exactly. The Administrator may book more people than the capacity, but only by saying
so explicitly.

Today one rule carries the whole feature: `docs/SHARED_CALENDAR_SPEC.md` R-BOOK-07 "no active
appointment overlaps" (`409 slot_taken`), with its twin R-SLOT-02 "a slot is free when it
overlaps no active appointment". Both become "fewer people than the capacity". The rest follows:

- **The data:** the `TYPE` item gains `capacity`; an item without it reads as 1. No migration,
  no new item, no new index, no new table.
- **The API:** the type's bodies and answer gain `capacity`; the booking and change bodies gain
  `overbook`, the Administrator's force; a slot in `GET /calendar` gains `capacity` and
  `placesLeft`; one new error code, `user_busy`. **No new route**, so no new function, role or
  permission, and `backend/template.yaml` does not change.
- **The front end:** the types' screen asks for the capacity; a slot says how many places are
  left; the Administrator's week draws several appointments in one hour and offers "Book
  anyway" on a full slot.
- **The assistant:** it reads the places left, sets a type's capacity, and may propose a booking
  over the capacity to the Administrator, saying so in the proposal.
- **The release:** the API, then the page; the smoke test proves the capacity in the cloud.

## 2. Decided before the first step

Decided by the Product Owner on 2026-11-24.

| # | Question | Decision |
|---|---|---|
| K1 | Default and range | **1 to 100, default 1.** Set when a type is created, changed when it is edited. |
| K2 | How the Administrator goes over the capacity | **An explicit flag.** A booking into a full slot is refused with `409 slot_taken` for the Administrator too; the page then asks "Book anyway?" and sends the request again with `overbook: true`. Nobody overbooks by mistake. |
| K3 | How people are counted when the Administrator's custom times overlap in part | **The peak:** the most people present at the same moment. With a capacity of 2, 10:00–10:30 and 10:30–11:00 leave one place in the slot 10:00–11:00; 10:00–10:30 and 10:15–11:00 fill it. |
| K4 | One User, two appointments at the same time | **Never**, whatever the type, and the force does not lift it: `overbook` goes over the capacity only. |
| K5 | The capacity lowered below the people already booked | **Allowed, nothing cancelled**, as a change of settings (`docs/SHARED_CALENDAR_SPEC.md` R-SET-03): the slot is over its capacity and takes no new booking until people leave. |
| K6 | What a User sees of a slot partly taken | **The places left**, "2 of 3 places left", never who holds the others (`docs/SHARED_CALENDAR_SPEC.md` decision D9 stands). A time turns "busy" only when it is full. |
| K7 | The assistant | **It knows the capacity, forcing included:** it reads the places left, creates and edits a type with a capacity, and proposes to the Administrator a booking or a change over the capacity, the proposal saying so. |
| K8 | What this brief produces | **This plan only.** The governing documents are changed in step u1. |

## 3. What planning found

- **F1. The rules that become "fewer than the capacity".** In
  `backend/src/lib/calendarRules.ts`: `checkBooking` (R-BOOK-07, `slot_taken`), used by the
  booking and, with the old appointment left out, by the change (R-CHG-01); `calendarView`'s
  `offered` (R-SLOT-02) and its `busy` (every other User's appointment). Nothing else in the
  back end compares appointments with one another: the availability conflict
  (`docs/SHARED_CALENDAR_SPEC.md` R-AV-03) is about windows and types, and stays as it is. A
  window's type changed under three Swimming Pool appointments is already a conflict.
- **F2. The capacity belongs to the window, so to the time.** Windows of one date never
  overlap (`docs/SHARED_CALENDAR_SPEC.md` R-AV-01), so two appointments that overlap lie in the
  same effective window and share its type: the capacity to compare with is that window's
  type's. No rule has to weigh two types against each other.
- **F3. The User's own appointments.** Today a slot that overlaps the caller's own appointment
  is not offered, by the same rule as anyone else's. K4 keeps this, as a rule of its own: a slot
  is offered to a User only if it overlaps none of their own active appointments, and a booking
  that would overlap one of the target User's is refused with a **new code, `409 user_busy`**,
  checked **before** the capacity, so that the Administrator is never offered "Book anyway" for
  a refusal the force cannot lift. `slot_taken` keeps its meaning, "no place left", and its
  sentence in the page.
- **F4. `busy` changes its meaning for a capacity above 1.** Today it is every other User's
  appointment. With K6 it is the times where the people booked reach the capacity, so a User
  learns no more than "full". **Decided** (the Product Owner, 2026-11-24): the maximal intervals of the date where the active
  appointments, the caller's own included, are at least the capacity, minus the times of the
  caller's own appointments (which the view shows apart). With a capacity of 1 this gives
  today's intervals, except that two other people's appointments that touch are one interval
  instead of two (one block drawn instead of two touching ones), which is accepted.
- **F5. The Administrator's full slots.** Today the Administrator books from a free slot of the
  week (`frontend/src/logic/booking.ts`). A full slot is not in `slots`, so the page would have
  no place to offer "Book anyway". **Decided** (the Product Owner, 2026-11-24): for the Administrator, `slots` also holds the full
  ones, with `placesLeft: 0` (the field says it); for a User nothing changes, a full slot is
  absent. A slot over its capacity (K5, or forced) also answers `placesLeft: 0`, never a
  negative number.
- **F6. The week draws at most two blocks side by side.** `frontend/src/logic/week.model.ts`
  gives a block `lanes: 1 | 2`, made for the hour repeated on the night clocks go back. Three
  to a hundred people in one hour of the Administrator's week cannot be drawn as lanes.
  **Decided** (the Product Owner, 2026-11-24, changing the plan's proposal): a group of
  appointments that overlap is drawn **side by side, one block each, up to three**; a group of
  four or more is **one block**, "4 people · Swimming Pool", which opens the list of them (each
  one then opens its detail as today). A single appointment is drawn as today. The date screen (`frontend/src/logic/date.model.ts`) is checked for the
  same assumption in step u5.
- **F7. The type's bodies are a full replacement today** (`TypeBody` = `{ name }` for
  `POST` and `PUT /calendar/types/{typeId}`). The API is deployed before the page (step u7):
  a `capacity` required by `PUT` would break the deployed page's rename until the page follows.
  **Decided** (the Product Owner, 2026-11-24): `capacity` optional in both; absent at creation is 1, absent at an edit keeps the
  stored value. The route's name in the documents becomes "edit a type".
- **F8. The assistant's rule "two changes into the same slot are not proposed"**
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rule 4) was right with one place per
  slot. With a capacity it refuses two Users booked into the Swimming Pool at 10:00 in one
  answer. Proposed: the rule becomes "two changes of one answer that would put more people in
  a slot than its places left, or the same User twice". Changing the instructions changes their
  mark, which ends the open conversations, and the paid evaluation is run again
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3): its cost is said before it runs.
- **F9. Whether a booking was forced is not stored.** `createdBy` already says the
  Administrator booked it, and "over the capacity" is a fact of one moment (K5: the capacity can
  change afterwards). The event `appointment.booked` (`docs/SHARED_CALENDAR_SPEC.md` section
  15.2) is unchanged. Recorded here so that step u1 can say why.
- **F10. Nothing to migrate, nothing to deploy twice.** An existing `TYPE` item has no
  `capacity` and reads as 1; the calendar behaves as today until the Administrator raises one.
  The old page against the new API works (it ignores the new fields; it never sends
  `overbook`).

## 4. The rules as they will read

For step u1 to write into `docs/SHARED_CALENDAR_SPEC.md` (a new version, and decisions D24 to
D31 after D23):

- **Section 6.1:** a type has `capacity`, an integer 1–100, default 1. **R-TYPE-05** Changing
  the capacity is allowed at any time and touches no appointment (K5).
- **R-SLOT-02 — Free.** The *people in* an interval are the most active appointments that
  overlap at one instant of it (K3). A slot is free when the people in it are fewer than its
  type's capacity; `placesLeft = max(0, capacity − people)`.
- **R-SLOT-03:** also, the slot overlaps none of the User's own active appointments (K4).
- **R-SLOT-04:** the Administrator's `slots` also hold the full slots, with `placesLeft: 0`
  (F5).
- **R-SLOT-05** (partial occupation) restated with people: a half hour booked by the
  Administrator counts one person in the slot.
- **R-SLOT-06 — Busy.** F4 as a rule: the maximal intervals where the people present are at
  least the capacity that applies there (1 where no window of an existing type holds the time),
  minus the User's own appointments.
- **R-BOOK-07 — Places.** The people in `[start, end)` are fewer than the capacity of the
  window's type: `409 slot_taken`. The Administrator with `overbook: true` is exempt.
- **R-BOOK-12 — One place per person.** No active appointment of the target User overlaps
  `[start, end)`: `409 user_busy`. No exemption. Checked before R-BOOK-07 (F3).
- **R-BOOK-13 — The force.** `overbook` is a boolean, absent = `false`, accepted from the
  Administrator only; a User sending `true` gets `403 forbidden`. It lifts R-BOOK-07 only.
- **R-CHG-01:** both R-BOOK-07 and R-BOOK-12 leave the old appointment out, as the overlap check
  does today; `overbook` is accepted on a change as on a booking.
- **Section 11:** routes 4 and 5 take `{ name, capacity? }`; `AvailabilityType` gains
  `capacity`; `BookBody` and `ChangeBody` gain `overbook?`; `Slot` gains `capacity` and
  `placesLeft`; `busy` as F4; the error code `user_busy`. The example of 11.6 gains the two
  fields, and keeps every value it has.
- **Section 13.2:** the `TYPE` item gains `capacity` (N), absent = 1.
- **Section 18.3:** acceptance scenarios: three Users into a capacity of 3, the fourth refused;
  the Administrator forcing a fourth; the same User twice refused even forced; the peak of K3
  with custom times; the capacity lowered under three people.

## 5. Steps

One step at a time, its check, an honest report, then a stop for review; commit only when
asked. The gate of every step from u2 on is the root `DYNAMODB_PORT=8002 npm run verify`, with
`local:up` and `local:api` running. Every step keeps 100 % line coverage and merges what it
built into the governing document in the same change. A changed integration journey changes its
page under `docs/journeys/` in the same commit (the project skill `explain-journey`).

### Step u1 — The rules in the documents (documents only)

- The four proposals of planning, F4 (`busy`), F5 (the Administrator's full slots), F6 (side
  by side up to three, then one block) and F7 (`capacity` optional), are decided (section 3):
  nothing to ask.
- `docs/SHARED_CALENDAR_SPEC.md`: section 4 above, decisions D24–D31 (K1–K7, F9), the change
  log. `docs/ARCHITECTURE.md`: the API contract of section 4 (the two bodies, the new code), the
  `TYPE` item of section 5.3, a v15 row and the status line.
- `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md` and
  `docs/CONVERSATIONAL_ARCHITECTURE.md`: only a line each, "changed in step u4 / u5 / u6 of
  `docs/CAPACITY_PLAN.md`", so that no document says something false meanwhile.

**Check:** `npm run lint` (the references in the documents), and the review.

**As done (2026-11-24).** Documents only; nothing under `backend/`, `frontend/` or `shared/`
changed, nothing deployed, no `aws` command run. Brief `prompts/e11-step-u1-implementation.md`.

- *The findings against the code.* F1 holds: `checkBooking` and `calendarView` in
  `backend/src/lib/calendarRules.ts` are the only places that compare appointments with one
  another. F3 holds: the view drops a slot that overlaps any booked appointment, the caller's own
  included, by the same test. F5 holds: `slots` holds free slots only, and the book dialog opens
  from one. F6 holds for the week only: `week.model.ts` gives `lanes: 1 | 2`;
  `frontend/src/logic/date.model.ts` is the availability's date screen and draws no appointment,
  so step u5 changes the week alone. F7 holds: one `TypeBody`, `{ name }` `.strict()`, serves both
  type routes.
- *`docs/SHARED_CALENDAR_SPEC.md` v17.* Decisions D24 to D31 in a table of their own after D23
  (D24 capacity, D25 counting, D26 the force, D27 one place per person, D28 lowered capacity, D29
  what a User sees, D30 the Administrator's full slots, D31 a forced booking not marked); D3, D8 and
  D9 amended to point at them. The glossary gains "Capacity", "People in an interval", "Places
  left"; "Free slot" restated. Section 1.1 and the row "Group appointments" of 1.3; section 4's
  rows. 6.1: the field, R-TYPE-02 "Edit", R-TYPE-05. Section 7: R-SLOT-02 to R-SLOT-05 restated,
  **a new R-SLOT-06 for `busy`** (F4 needed a rule of its own: the plan had it only as a meaning
  of a field), the worked example of the Swimming Pool. 8.2: R-BOOK-07 "Places", R-BOOK-12,
  R-BOOK-13, the order of the checks. 8.4: the request, R-CHG-01's adjustments, R-BOOK-13 as a new
  step 3 of the order (the steps after it renumbered 4 to 7). R-VIEW-01. 11.1 routes 4, 5, 17 and
  20; 11.3 `user_busy`; 11.4; 11.5; 11.6, the example's six slots gain `"capacity": 1,
  "placesLeft": 1` at the end of each and nothing else changes, with a sentence under it. 13.2,
  16.8 (F6 as decided), 17, 18.1, AC-37 to AC-44 in 18.3. A sentence "not built yet" heads the
  changed parts of 3, 6.1, 7 and 8.2; the status line says v17 is specified and not built. The
  status line also no longer calls v16 "not implemented": it is.
- *`docs/ARCHITECTURE.md`.* The status line and the date; a v15 row, open; section 4 a new
  paragraph "The capacity of a type", after the paragraph on booking, which says what changes and
  leaves the rows as the calendar runs today; section 5.3 the `TYPE` row.
- *The three other documents.* `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md` and
  `docs/CONVERSATIONAL_ARCHITECTURE.md`: one sentence at the end of the status line each.
- *Checked:* `npm run lint` green. No diagram changed.

**Step u2 finds ready:** the contract to write in `shared/` is `docs/SHARED_CALENDAR_SPEC.md`
sections 11.3 to 11.6 (`TypeBody.capacity`, `BookBody.overbook`, `ChangeBody.overbook`,
`AvailabilityType.capacity`, `Slot.capacity` and `Slot.placesLeft`, the code `user_busy`); the
counting for `peopleIn` is R-SLOT-02 and D25, its unit tests 18.1.

### Step u2 — The shared contract (`shared/`)

- `shared/src/calendar/defaults.ts`: the range and the default of the capacity in
  `CALENDAR_LIMITS`.
- `shared/src/calendar/schemas.ts`: `TypeBody` with `capacity` optional (integer 1–100);
  `BookBody` and `ChangeBody` with `overbook` optional (boolean).
- `shared/src/calendar/types.ts`: `AvailabilityType.capacity`, `Slot.capacity`,
  `Slot.placesLeft`.
- `shared/src/api.ts`: the code `user_busy`.
- `shared/src/calendar/rules.ts`: `peopleIn(interval, appointments)`, the peak of K3, pure, so
  that the back end and the assistant share one counting.

**Check:** the root `verify`; unit tests of `peopleIn` (touching appointments are not
simultaneous, the example pair of K3, the night clocks go back).

### Step u3 — The back end

- `backend/src/lib/calendarDb.ts`: `capacity` written and read on the `TYPE` item, 1 when absent.
- `createAvailabilityType.ts` and `renameAvailabilityType.ts` (the file keeps its name, the
  route its path): the capacity of the body, F7.
- `backend/src/lib/calendarRules.ts`: `checkBooking` with R-BOOK-12, then R-BOOK-07 by
  `peopleIn` and the window's type's capacity, `overbook` for the Administrator;
  `calendarView`'s `offered`, `placesLeft`, `busy` (F4) and the Administrator's full slots (F5).
- `bookAppointment.ts` and `changeAppointment.ts`: R-BOOK-13 among the checks that need only the
  body and the caller (step 2 of the order of `docs/SHARED_CALENDAR_SPEC.md` section 8.2).
- The unit tests of the rules, the handlers' tests, the 11.6 example byte for byte.
- `backend/tests/integration/calendar.test.ts`: a new journey for the scenarios of 18.3, and its
  page under `docs/journeys/backend/`.

**Check:** the root `verify` with the journeys. No deployment.

### Step u4 — The front end's services

- The types' service: `capacity` sent and received.
- `AppointmentsService.book` and `change`: `overbook` passed through; the reason `user_busy`
  with its sentence in `frontend/src/logic/texts.ts`.
- `docs/FRONTEND_SERVICES.md`: the new version; the line of u1 removed.

**Check:** the root `verify`; `RUN_INTEGRATION=1 npm run test:integration -w frontend` (not at the
same time as the back end's).

### Step u5 — The front end's screens

- The availability screen: the capacity beside a type's name, at creation and edit.
- `week.model.ts` and `date.model.ts`: "2 of 3 places left" on a slot whose capacity is above 1
  (a capacity of 1 says nothing new); the full slot of the Administrator drawn apart; the group
  blocks of F6 (side by side up to three, then one block with the list).
- The book dialog (`booking.ts`): on `slot_taken` for the Administrator, "Book anyway?" and the
  same request with `overbook: true`; the same for a change.
- `docs/FRONTEND_ARCHITECTURE.md` (new decisions), `docs/FRONTEND_WALK.md` (new checks: a
  capacity of 3 walked as alice, as a second User, as the Administrator forcing a fourth).

**Check:** the root `verify`; the front end's journeys; the new checks of the walk in headless
Chromium at both widths, after a restart of the stack and `seed:local`.

### Step u6 — The assistant

- `get_calendar`: the capacity and the places left of each slot.
- `create_type` and `rename_type`: the capacity; their proposal's sentences.
- `book_appointment` and `change_appointment` for the Administrator: `overbook`, and a sentence
  that says the booking goes over the capacity ("the Swimming Pool will hold 4 people, its
  capacity is 3").
- Rule 4 of section 5.5 as F8; the instructions; the fake Claude's marks; the journeys and their
  pages.
- The paid evaluation with the real model, **only after its cost is stated and the Product Owner
  agrees**.

**Check:** the root `verify`; the assistant's journeys; the evaluation's result, if run.

### Step u7 — The release (each command on the operator's explicit instruction)

- The smoke test (`backend/scripts/`): a journey with a throw-away type of capacity 2: two
  Users booked into one slot, a third refused `slot_taken`, the Administrator's `overbook`
  accepted, the same User twice refused `user_busy`; everything deleted at the end.
- Order: the gate on a clean tree; `npm run deploy -w backend`; the smoke test against
  `shared-calendar-api`; `npm run deploy -w frontend`; the walk's new checks at the deployed
  address, by the operator. The API first is safe (F10).
- The record in `docs/RUNBOOK.md`; the documents' versions closed; this plan finished.

**Check:** the smoke test PASS in the cloud, the walk's checks all yes.

## 6. Out of this plan

- A capacity per window or per date (only per type, as asked).
- A waiting list for a full slot.
- Booking several places for one person (K4).
- Telling a User who else is booked with them (K6).
