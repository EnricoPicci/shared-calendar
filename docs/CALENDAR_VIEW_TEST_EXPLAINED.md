# The "calendar view" journey, in simple words

This page explains one test in `frontend/tests/integration/calendar.test.ts`: the test named
"a week: the Administrator sees sources and names; fe-calendar its own appointment and
fe-calendar-b's as busy". It runs against the local stack (the API on port 3000, cognito-local on
port 9229).

The first part tells the test's story step by step. The second part, "Background", explains the
calendar ideas the story uses: settings, availability types, patterns and the other sources of
availability, overlaps, and the `busy` list.

## Who takes part

- **The Administrator** (`admin`): sees and manages everything.
- **`fe-calendar`**: a plain User created by the test file. It signs in, so the test can look at
  the calendar through its eyes.
- **`fe-calendar-b`**: a second plain User created by the test file. It never signs in. It only
  exists so that `fe-calendar` has *somebody else's* appointment to see.

## What is already in place before the test starts

- Both Users exist. The test file creates them in its `beforeAll`.
- The settings allow a User to book about a year ahead. The block's `beforeAll` changes three
  settings and its `afterAll` puts the values it read back (see "The settings for the run" below):
  - the booking horizon to 365 days;
  - the minimum booking notice to 0 hours;
  - the limit on future appointments per User to "no limit".

## The sequence of events

### 1. Prepare a bookable day

The test creates its own availability type, named `fe-calendar View` (see "Availability types"). It
then picks a date about a year ahead that has no availability yet, so that nobody else's data is in
the way. On that date it opens one window, **08:00–12:00**, of the new type. The window comes from
a weekly pattern that is valid on that single date (see "The pattern of this test").

That gives four one-hour slots: 08:00, 09:00, 10:00 and 11:00.

### 2. The Administrator books two appointments

- **08:00–09:00** for `fe-calendar`.
- **10:00–11:00** for `fe-calendar-b`, with the note "private note".

The day now looks like this:

| Time | State |
|---|---|
| 08:00 | `fe-calendar`'s appointment |
| 09:00 | free |
| 10:00 | `fe-calendar-b`'s appointment |
| 11:00 | free |

### 3. The Administrator looks at the week

The Administrator loads the calendar for seven days, starting with the chosen date. The test
checks that:

- the answer covers exactly those seven days, in the calendar's time zone;
- the chosen day has the 08:00–12:00 window, and the Administrator can also see **where it comes
  from**. The window says `source: 'pattern'`, and its `sourceId` is the id of the pattern the test
  created (see "Where a window comes from");
- the day has no date override;
- the day's `busy` list is empty, and **both** appointments are in the view's `appointments` list,
  each with its User's name. The Administrator gets the full appointments, not anonymous busy
  intervals (see "`busy` and `appointments`");
- there is no cancellation deadline on either appointment (`cancellableUntil` is empty): the
  Administrator has no notice to respect.

### 4. `fe-calendar` looks at the same week

The test loads the same week as `fe-calendar`. It keeps this calendar service for step 6. The
test checks that:

- the window is there, but **without** the Administrator-only details (no `source`, no `sourceId`,
  no `hasOverride`);
- the **free slots** are 09:00 and 11:00 only. The User's own 08:00 appointment and the other
  User's 10:00 appointment are not free;
- **10:00–11:00 shows as `busy`**: just a start time and an end time, nothing else;
- the only appointment listed is **its own** 08:00 one, with the deadline until which it may still
  cancel or change it. Its own appointment is not in `busy`: it is already in `appointments`;
- nothing in the whole answer mentions `fe-calendar-b`: not its name, not its appointment's id, not
  the "private note".

This is the privacy rule: a User sees other people's appointments only as anonymous busy time.

### 5. The Administrator cancels `fe-calendar-b`'s appointment

10:00 becomes free again.

### 6. `fe-calendar` reloads its view

The test calls `reload()` on the same service. It does not repeat the dates: the service remembers
the week it loaded last. The test checks that:

- there is no `busy` time any more;
- the free slots are now 09:00, 10:00 and 11:00.

This shows that `reload()` asks for the same week again and gets the fresh state.

### 7. Tidy up

- The Administrator cancels `fe-calendar`'s 08:00 appointment.
- The test deletes the pattern, then the type. This works only now. While a booked appointment
  lies in the window, deleting the pattern is refused with `availability_conflict`, and the type
  cannot be deleted while a pattern or a booked appointment still uses it (`type_in_use`).

Appointments cannot be deleted, only cancelled, so the two cancelled appointments stay in the local
database as history.

## If the test fails halfway

The file's `afterAll` (and the next run's `beforeAll`) clean up whatever is left:

1. they put the settings back;
2. they delete both Users, which cancels their remaining appointments;
3. they delete the pattern and the type.

So a failed run does not leave anything booked behind, and the test can simply be run again.

---

## Background

### The settings for the run

The calendar has four settings that the Administrator can change (`docs/SHARED_CALENDAR_SPEC.md`
section 9). The appointment blocks set three of them for their run:

| Setting | Set to | Why |
|---|---|---|
| `bookingHorizonDays`: how far ahead a User may book | 365 | the test's dates lie about a year ahead (from today + 330 days) |
| `minBookingNoticeHours`: how long before the start a User must book | 0 | no notice can get in the way |
| `maxFutureAppointmentsPerUser`: how many upcoming appointments one User may hold at the same time (1–100, or `null` for no limit) | `null` | see below |
| `cancellationNoticeHours`: until when a User may cancel or change | kept as read | the update needs all four values; at most 720 hours cannot block a cancel 330 days ahead |

**The limit on future appointments.** When a User books for themself and already holds as many
future appointments as the limit allows, the booking is refused with `409
appointment_limit_reached` (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-09). The Administrator is exempt.
The local calendar is shared with the back end's journeys, which can leave a small limit behind,
for example 3. That could make `fe-calendar`'s own bookings fail for a reason unrelated to what the
test checks. With `null` the result depends only on the test's own data.

In this particular test the limit does not matter: the Administrator books both appointments. It
matters in the other two appointment blocks, where `fe-calendar` books for itself. The three blocks
share the same setup.

Before changing anything, the block keeps the values it read in a file,
`frontend/tests/integration/fe-calendar-settings.local.json`. Its `afterAll` writes them back and
removes the file. If a run is killed in between, the next run finds the file and writes the values
back first.

### Availability types

An availability type is a named kind of availability, usually a place: the specification's examples
are "Studio" and "Swimming Pool" (`docs/SHARED_CALENDAR_SPEC.md` sections 2 and 6.1).

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

**Why the test makes its own type.** The local calendar is shared with the back end's journeys and
the smoke test, which have their own types ("Studio", "GYM", "Booking room", …). The front-end
journeys may not change anything they did not create. So each test creates a type whose name starts
with `fe-calendar ` and puts its window on it:

- the clean-up finds everything that belongs to the journeys by that name, even after a failed run;
- deleting the type at the end also proves the order of the tidy-up (appointments cancelled and
  pattern deleted first).

### Where a window comes from

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
know which rule produced it. A User's view leaves both fields out.

### The pattern of this test

The helper `bookableDate('View')` creates it just before the bookings, as the Administrator:

| Field | Value |
|---|---|
| `weekday` | the weekday of the chosen date |
| `start`, `end` | `08:00`, `12:00` (local time, in the calendar's time zone) |
| `typeId` | the test's own type, `fe-calendar View` |
| `validFrom` | the chosen date |
| `validUntil` | the same date |

Because `validFrom` and `validUntil` are the same day, this "weekly" pattern produces a window on
that one date only, not every week. The test owns it completely, and nothing it does reaches other
dates or other people's data. The chosen date had no window and no override before, so this pattern
is the only thing open there. That is why the test expects exactly one window, 08:00–12:00.

### A one-day pattern and a one-off window: alike, but not the same

On the calendar, a pattern valid on one date and a one-off window on that date give the same
window: the same slots, and a User cannot tell them apart. The rules treat them differently:

| | Weekly pattern (valid one day) | One-off window |
|---|---|---|
| A date override on that date | **replaces it** | **stays**: one-off windows apply on top of an override (`docs/SHARED_CALENDAR_SPEC.md` R-ONE-01) |
| Changing it | can be updated in place | cannot be edited: delete it and create a new one (`docs/SHARED_CALENDAR_SPEC.md` R-ONE-02) |
| Limit | at most 50 patterns in the whole calendar | at most 10 one-off windows per date |
| Blocks deleting its type | always, whatever its dates | only while it is dated today or later |
| Deleting it once its date has passed | allowed | refused, `409 date_in_past` |
| In the Administrator's view | `source: 'pattern'`, `sourceId` the pattern's id | `source: 'one_off'`, `sourceId` the window's id |

### Windows never overlap

A one-off window that overlaps a pattern's window cannot be added: the server refuses it with `409
availability_overlap` (`docs/SHARED_CALENDAR_SPEC.md` R-AV-01). The windows of a date never
overlap, whatever their source or type. A new one-off window is checked against the date's pattern
windows (or the override's windows, if the date has an override) and against the date's other
one-off windows.

Example, with a pattern "Monday 08:00–12:00, Studio":

| One-off window on a Monday | Result |
|---|---|
| 11:00–13:00, any type | refused: 11:00–12:00 would be covered twice |
| 08:00–12:00, the same type | refused: the same time again is also an overlap |
| 12:00–14:00, any type | allowed: touching windows do not overlap |
| 12:00–14:00, Studio | allowed. Adjacent windows of the same type are merged into one effective window, 08:00–14:00 Studio, for booking (`docs/SHARED_CALENDAR_SPEC.md` section 6.6) |

If the date has an override, the pattern does not apply that day. A one-off window may then lie
where the pattern would have been: it is checked against the override's windows instead.

The other direction is checked too. A new or changed pattern is compared with the one-off windows
from today on, on every date it applies to that has no override. Deleting an override is checked as
well: the pattern windows that return may not overlap the date's one-off windows. However the rules
are written, a date never ends up with overlapping windows.

### Why the helper uses a pattern, not a one-off window

`bookableDate()` is shared by the three appointment blocks. One of them, "availability conflict",
must prove this rule: an Administrator cannot change the availability so that a booked appointment
is left outside every window. The server refuses such a change with `409 availability_conflict` and
lists the stranded appointments in `conflicts` (`docs/SHARED_CALENDAR_SPEC.md` section 6.7).

What that block does, with the pattern:

1. **Set up.** `bookableDate()` creates the pattern: the date has one window, 08:00–12:00.
2. **Book.** `fe-calendar` books 08:00–09:00, inside the window.
3. **Try to shrink the day.** The Administrator sets an override on that date with only
   10:00–12:00. An override replaces the pattern windows of its date:

   | Before | After the override |
   |---|---|
   | 08:00–12:00 (pattern) | 10:00–12:00 (override); the pattern's window no longer applies |

   The 08:00 appointment would sit at a time that is no longer open.
4. **The server refuses** with `availability_conflict`, listing the 08:00 appointment. The test
   checks exactly that. It then tries to delete the pattern, which would strand the appointment in
   the same way and is refused in the same way.

If step 1 had created a one-off window 08:00–12:00 instead, the override would not replace it
(one-off windows stay on top). No appointment could be stranded. The override would still be
refused, but for another reason: its window 10:00–12:00 overlaps the one-off window 08:00–12:00
that stays on the date, so the answer would be `availability_overlap`.

| Window made by step 1 | Answer to the override 10:00–12:00 | What the test proves |
|---|---|---|
| a pattern | `availability_conflict`, listing the 08:00 appointment | the conflict rule, end to end |
| a one-off window | `availability_overlap` | only the overlap rule, a different refusal |

Only a window that an override replaces lets the block show the appointment being stranded and the
server refusing it.

### `busy` and `appointments`

The answer of the calendar view has two places that hold appointments (`docs/SHARED_CALENDAR_SPEC.md`
section 11.6): a `busy` list on each day, and one `appointments` list for the whole range.

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

In this test the day has two booked appointments, 08:00 for `fe-calendar` and 10:00 for
`fe-calendar-b`:

- the Administrator's view has `busy` empty and both appointments in `appointments`, with their
  names;
- `fe-calendar`'s view has only its own 08:00 appointment in `appointments`, and one `busy` entry,
  10:00–11:00, with nothing that says whose it is.
