# The calendar ideas the journeys use

The journey pages (`docs/journeys/README.md`) link here for the ideas that several of them need.
Each section explains one idea in simple words and names the part of `docs/SHARED_CALENDAR_SPEC.md`
that defines it. On any conflict, the specification wins.

Sections about the back end's stored items and the calendar lock are added with the first
back-end page.

## The people of the local stack

| Name | What it is | Made by |
|---|---|---|
| `admin` | the Administrator: sees and manages everything | `local:up` (seed) |
| `alice` | a plain User | `local:up` (seed) |
| `carol` | a throw-away User of the Hello World journeys | `backend/tests/integration/journeys.test.ts` |
| `dave`, `erin` | throw-away Users of the back end's calendar journeys | `backend/tests/integration/calendar.test.ts` |
| `fe-calendar`, `fe-calendar-b` | throw-away Users of the front end's calendar journeys | `frontend/tests/integration/calendar.test.ts` |
| `fe-journey` | a throw-away User of the front end's Hello World journeys | `frontend/tests/integration/journeys.test.ts` |
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

Appointments cannot be deleted through the API, only cancelled. So cancelled appointments, their
events and the deleted-user markers of removed Users stay in the table as history.

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
