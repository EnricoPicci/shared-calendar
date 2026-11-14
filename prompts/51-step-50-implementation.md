## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
sam --version                                                # 1.171.0 or newer (scripts/check-sam.sh)
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. The new
function calls no Cognito (spec 14.1: the change books the User of the old appointment, whose `sub`
is stored on it), so `local-seed.sh` should not change and `local:up` need not be rerun. Only
`local:api` must be restarted once the function exists in the template; the agent will ask you.
Ctrl-C removes the Lambda containers `sam local` leaves behind; the `LAMBDA_RUNTIME Failed to get
next invocation` lines and the Python `Exception ignored … I/O operation on closed file` messages
printed while it stops are harmless (step 49). Check `docker port hello-world-api-dynamodb-1` and
tell the agent which `DYNAMODB_PORT` the stack uses (8000 by default, 8002 if another project holds
8000; it was 8000 in steps 47–49).

## Brief

Implement plan step 50, "Change", the tenth step of the shared calendar, following CLAUDE.md's
working rhythm: one step, its acceptance check, an honest report, then stop for review. One stop at
the end, **plus an early stop for the spec points below** (see "Spec points this step must
settle"): present them before you write `checkChange`, the change transaction and the
`appointment.changed` event.

Read these in full first:
- `CLAUDE.md`;
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps 41–56)": the conventions under
  "How these steps are run", the rule under "Where the truth lives while the calendar is built" with
  its row-by-row table (step 50 has its own row: the section 6 "change" diagram), and step 50 itself;
- `docs/SHARED_CALENDAR_SPEC.md` v10 sections:
  - 4 (who does what: "Change" row, R-PERM-01);
  - 5 (the time model);
  - 8.1 (every field, `replaces` / `replacedBy`, `cancelReason` `changed`, the lifecycle), 8.2 (every
    R-BOOK rule and the order of the checks, v9), 8.3 (R-CAN-01..03 and the order of v10), **8.4**
    (R-CHG-01..03), 8.5 only for the note rule R-BOOK-11 it reuses;
  - 9;
  - 11 intro (the status code rule), 11.1 route 20 ("union of #17 and #19") and the notes, 11.3,
    11.4 `ChangeBody` (`note` absent vs `null`) and the instant form, 11.5 `Appointment` and
    `ChangeAppointmentResponse`;
  - 13.2 (`APPT`, `APPTID`, `EVENT`, the deleted-user marker; every access pattern), 13.3, 13.4
    (change: 6 items; the v10 paragraph on `Update` without a condition);
  - 14.1 (route 20), 14.3 (`CalendarBookPolicy`), 14.5;
  - 15 (all of it: `appointment.changed`, `previous`, 15.4);
  - 17, 18.2, 18.3 AC-22, AC-23, AC-24, AC-36;
- `docs/ARCHITECTURE.md` sections 2, 3, 4, 5.3, 6 (6.7 "Book an appointment" is the model for the
  new "change" diagram), 7.1 and the v12 change-log entry (steps 48 and 49 in particular).

Then read the code this step builds on, from steps 43–49 (last commit `f9a66c4`):
- `backend/template.yaml`: `BookAppointmentFunction` (the only one with `CalendarBookPolicy`) and
  `CancelAppointmentFunction`;
- `backend/src/lib/calendarDb.ts`: `withCalendarLock` and `onConditionFailed`, `readState`,
  `readSettings`, `bookAppointment` (the five-item transaction and the marker check),
  `readAppointment`, `toSnapshot`, `appointmentWrite`, `cancelAppointment`, `toResponseFields`,
  `StoredAppointment`;
- `backend/src/lib/calendarRules.ts`: `checkBookingTimes`, `checkBooking` (how it counts the limit
  and the overlap on `CalendarState`), `checkCancel`, `cancellableUntilFor`, `Caller`,
  `CheckedAppointment`, `toResponse`;
- `backend/src/lib/calendarEvents.ts`: `appointmentEvent`, `EventItem`, `WrittenEventType`. It has
  no `previous` yet; step 48 said later steps add their event types without reshaping it. Check that
  adding `previous` for `appointment.changed` keeps `appointment.booked`, `appointment.cancelled`
  and `appointment.note_updated` exactly as they are;
- the handlers `bookAppointment.ts` (the R-BOOK order, `checkBookingTimes` before the lock) and
  `cancelAppointment.ts` (the path id, the refusal table), with their unit tests and
  `tests/unit/handlers/appointmentFixtures.ts`;
- `backend/tests/integration/setup.ts` and `calendar.test.ts`: the booking journeys and the
  "listing, note and cancel" journeys, with the comments at their top.

From `shared/`:
- `ChangeBody`, `Note`, `AppointmentIdParam` in `calendar/schemas.ts`;
- `ChangeAppointmentResponse`, `Appointment`, `CancelReason`, `CalendarEventType` in
  `calendar/types.ts`;
- `cancellableUntil`, `overlaps` in `calendar/rules.ts`.

## Where we are (2026-11-14)

- Steps 41–49 are done and committed (`f9a66c4` is step 49, spec v10). Check `git status -sb`
  rather than trusting this line; at the time of writing `main` was two commits ahead of `origin`.
- The shape steps 43–49 set. Keep it unless this step proves it wrong, and if it does, say so:
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path parameters → body → checks that need no data → `calendarDb` with the `calendarRules` check
    → one log line (`done()`);
  - every write takes the calendar lock (`withCalendarLock`) and runs its check on the data read
    **inside** the locked attempt, so a retry re-reads and re-checks; the lookup by id runs inside
    the attempt too (v10);
  - an `APPT` item is changed with an `Update` of the changed attributes, without a condition of its
    own (v10); a new one is a whole `Put`;
  - a condition the checks cannot see beforehand (the deleted-user marker) is a `ConditionCheck` in
    the transaction, answered through `onConditionFailed` without a retry;
  - ids (appointment, event) are made once per request, outside the lock loop;
  - `calendarDb.ts` is the only module that knows the item layout; `calendarRules.ts` is pure;
    `calendarEvents.ts` builds every `EVENT` item, the snapshot copied field by field;
  - `now` is read once per request; "today" = `localDateOf(now, timeZone)`;
  - `cancellableUntil` through `cancellableUntilFor`: a User caller on a `booked` appointment gets
    `start − notice`, a `cancelled` one and every Administrator answer get `null` (v10);
  - handler unit tests reload the module per test (`vi.resetModules()`).
- What the journeys leave behind. `calendar.test.ts` resets the table at its start and runs its
  journeys in order. The booking journeys (Wednesdays) and the listing journeys (Thursdays, plus an
  ended appointment dated yesterday) each create and remove their own `dave` and `erin`, and leave
  their appointments in the table as history, under earlier accounts' `sub`s. Write down, in a
  comment at the top of the new journeys, what the earlier journeys leave behind, and either pick
  dates and users that do not depend on it (Fridays are untouched) or say which part you rely on.
- In the agent's non-interactive shell, Node 22 is the default (`~/.nvm`); if `node -v` is not 22,
  run `source ~/.nvm/nvm.sh && nvm use`.
- After this step the appointment routes are complete (the plan's checkpoint).

## Spec points this step must settle

Present each point with a proposed change. Do not edit the spec until I approve.

1. **The order of the checks (route 20).** 8.4 says a change must pass all of R-CAN-01..03 for the
   old appointment and R-BOOK-02..11 for the new one; 11.1 says the errors are "the union of #17 and
   #19". Neither says which answer wins when both sides fail. Propose the numbered order, as 8.2 and
   8.3 do, and say why. At least:
   - path id (`400`); body `ChangeBody` with the note (`400 invalid_json` / `invalid_request`);
     R-BOOK-02 for the caller's role (`400`), from the body alone, before the lock;
   - inside the locked attempt: the old appointment first (R-CAN-01 / R-PERM-01 `404`, R-CAN-02
     `409 appointment_not_active`, R-CAN-03 `403 cancellation_too_late` for a User), then the new
     one (R-BOOK-03..07, 09 with the two adjustments of R-CHG-01);
   - R-BOOK-10 as the marker `ConditionCheck` in the transaction, on the old appointment's `userId`
     (`404 user_not_found`).
   Say whether the `message` of a refusal coming from the cancel side should name a change ("Too
   late to change this appointment") rather than reuse the cancel's text.
2. **What R-BOOK-01 means in a change.** The User is always the old appointment's (8.4). There is no
   `username` in `ChangeBody`, no Cognito call (14.1), so the target is never re-checked for being a
   plain User. Confirm that, and say what a change by the Administrator of an appointment whose User
   has since been deleted answers (the marker: `404 user_not_found`, or `404 appointment_not_found`?).
3. **The new appointment's times and type.**
   - For the Administrator, `end` absent: `start + 60 min` as in a booking, or the old appointment's
     duration? Say which, and why (AC-24 sends `end` explicitly).
   - The new appointment takes the type of the window it lies in (R-BOOK-06), which may differ from
     the old one's; its `typeNameAtBooking` is that type's name at the moment of the change.
   - A change to exactly the old times (and the same note): allowed, writing a new appointment and an
     event, or refused (with which code), or a no-op as v10 made an unchanged note? Propose one.
   - The Administrator changing an appointment in progress: R-CAN-03 exempts them, but R-BOOK-03
     needs `start > now` for the new one, so an in-progress appointment can only be moved to the
     future, never extended in place. Confirm, or propose otherwise.
4. **The two adjustments of R-CHG-01.** How the state is presented to `checkBooking`: the old
   appointment removed from `CalendarState.appointments` (both for R-BOOK-07 and for R-BOOK-09), by
   id. Confirm that this is exactly "ignores the old appointment" and "does not count the old one",
   including a User at the limit who moves their only future appointment.
5. **The six items and what is written** (13.4: change 6).
   - The items, in order: the lock; `Update` of the old `APPT` (`status` `cancelled`, `cancelledAt`,
     `cancelledBy`, `cancelReason` `changed`, `replacedBy` = new id, `updatedAt`, `updatedBy`,
     `version + 1`); `Put` of the new `APPT` (`replaces` = old id, `userId` and `username` from the
     old one, `createdAt`/`createdBy` = now/caller, `version` 1); `Put` of its `APPTID`; `Put EVENT`;
     the marker `ConditionCheck`. Say if the order should differ (the marker's index matters for
     `onConditionFailed`).
   - R-CHG-03: `note` absent keeps the old note, `null` clears it, a string is trimmed and an empty
     one becomes `null`.
   - The event (15.2): `appointment` = the new appointment as stored; `previous` = the old one **as
     stored after the change** (cancelled, `replacedBy` set) or as it was before? Say which, why
     (what a notifier needs to write "moved from … to …"), and write the sentence for 15.2.
   - How `EventItem` gains `previous` without changing the three existing event types (no
     `previous: undefined` key on them).
6. **The response.** `201 { cancelled, booked }`. `cancellableUntil` per v10: `null` on `cancelled`;
   on `booked`, `start − notice` for a User and `null` for the Administrator. `typeName` of each:
   the current name of its type (or the snapshot). Confirm.
7. **The section 6 "change" diagram.** The plan's table gives it to this step. Say what it shows
   beyond 6.7 (the old appointment read by id inside the attempt, the checks on both sides, the six
   items, the marker), and keep it as short as 6.7.

If anything else is unclear or contradictory while you read, stop and tell me, with a proposal. For
example: R-CHG-01 says R-BOOK-02..11, which includes R-BOOK-08 (custom times) for the
Administrator; the log line of a change has two appointment ids; a change of a changed appointment
(already `cancelled`, `changed`) must be `409 appointment_not_active`; whether `replaces` chains are
followed anywhere (they should not be in v1).

## The step

Only what step 50 lists.

- `backend/template.yaml`: `ChangeAppointmentFunction` (`POST /calendar/appointments/{appointmentId}/change`,
  admin and owner), with its log group and role, copied from `BookAppointmentFunction` without the
  Cognito variables and statement: `CalendarReadPolicy`, `CalendarWritePolicy` and
  `CalendarBookPolicy`, no Cognito. Check it against spec 14.1's action list (GetItem, Query,
  PutItem, UpdateItem, ConditionCheckItem): every action should be used; say so if one is not.
- `backend/src/lib/calendarRules.ts`: `checkChange`, which reuses `checkCancel` for the old
  appointment and `checkBooking` for the new one with the two adjustments of R-CHG-01, in the order
  of point 1. Inputs: the old appointment read (or its absence), the caller (role, `sub`), the new
  times (R-BOOK-02 already passed), the settings, the state, "now", "today", the zone. Output:
  `Refusal` or what the write needs (the window, hence the new type). Pure.
- `backend/src/lib/calendarEvents.ts`: the event type `appointment.changed` with `previous`, the
  three existing types unchanged.
- `backend/src/lib/calendarDb.ts`: `changeAppointment(…, check)` under the lock: inside each attempt
  the settings, the state and the old appointment by id; then the six-item transaction of point 5,
  the marker failure through `onConditionFailed`. It answers both appointments (and the settings).
  Reuse `appointmentWrite`, `toSnapshot` and the booking's item building where it fits; do not
  duplicate the `APPT` attribute list a third time.
- Handler `changeAppointment.ts`: the order of point 1; `checkBookingTimes` before the lock; the ids
  made once; the response `{ cancelled, booked }` through `toResponse` and `cancellableUntilFor`;
  one log line with both ids (say which field names), the outcome and the lock attempts. Never the
  note, the body or a `sub` (14.5, AC-36).
- Integration: the new journeys in `calendar.test.ts`, after the listing journeys, with their own
  throw-away `dave` and `erin` (removed first and at the end), their own type and pattern on
  Fridays, their own settings, restored at the end to what the earlier journeys left.
- Documents, the step-50 rows of the plan's table:
  - `docs/ARCHITECTURE.md`: section 2 (diagram and 2.1: the function), section 3 (route 20: admin
    and owner), section 4 (route 20, its error codes in the settled order, the body), 5.3 (what a
    change writes, `previous` on the event), section 6 (the "change" diagram), 7.1 (the role), the
    step 50 sentence in the v12 entry;
  - `docs/SHARED_CALENDAR_SPEC.md` v11, only what you and I settle in points 1–7, with its
    change-log row;
  - `CLAUDE.md`: the folder map (the handler, the new `calendarDb.ts`, `calendarRules.ts` and
    `calendarEvents.ts` functions); the local-weight line if you measure it again (optional; 19
    calendar functions now);
  - the plan's status line.

Not in this step:
- writing the deleted-user marker, `deleteUser`, `GET /users` (step 51);
- the smoke test (step 52);
- anything in `frontend/`.

`shared/` should need no change: `ChangeBody`, `ChangeAppointmentResponse` and
`CalendarEventType` exist since step 42. If a point changes a schema, or anything else turns out to
need a change in `shared/`, stop and say why first.

### Tests

- Unit (`aws-sdk-client-mock` for DynamoDB, fake clock with `vi.setSystemTime`):
  - `calendarEvents.ts`: the exact `appointment.changed` item with `previous`; the note only inside
    the two snapshots; the three existing types unchanged and without a `previous` key;
  - `calendarDb`:
    - the reads inside the locked attempt (settings, state, pointer, old `APPT`);
    - the exact six-item transaction (keys, attributes of point 5, the order);
    - the marker failure answering `user_not_found` without a retry;
    - a retry that re-reads and re-checks (the old appointment cancelled, or the new slot taken, by
      someone else between two attempts);
    - three lost attempts answering `concurrent_update`;
  - `checkChange`, with the exact dates of 18.3 (Europe/Rome; alice holds 2026-11-16 09:00 local;
    now with enough notice, and now 2026-11-15T09:01 local for the notice):
    - AC-22 (10:00 the same day: allowed), AC-23 (10:00 taken: `slot_taken`, nothing written),
      AC-24 (the Administrator 09:00–10:30 over the old time: allowed);
    - the notice applies to the old appointment (a User at 09:01 the day before: `403`), the
      booking rules to the new one (`booking_too_soon`, `booking_too_far`, `outside_availability`,
      the Administrator exempt as in a booking);
    - the limit does not count the old one: a User at `maxFutureAppointmentsPerUser` 1 moves their
      only future appointment;
    - someone else's appointment `404`, a cancelled or ended one `409`, an already-changed one `409`;
    - the order: a request that breaks a rule on each side gets the code of point 1;
  - handler:
    - the role cases (a token in neither group is `403`);
    - an invalid appointment id (`400`); invalid JSON and invalid bodies (`400`: an unknown field,
      `username`, a malformed instant, a note of 501 UTF-16 units); R-BOOK-02 per role (`400`);
    - R-CHG-03: the note absent (kept), `null` (cleared), trimmed, empty (`null`);
    - the invalid-zone `500`;
    - the response (`cancelled` and `booked`, `cancellableUntil` per role and status, `typeName`, no
      `userId`, no `version`);
    - the log line: both ids, attempts; no note, no body, no `sub`.
- Journeys (`calendar.test.ts`, after the listing journeys). Dates come from the real today,
  computed with the shared helpers, never with fixed offsets:
  - AC-22: a User changes 09:00 to 10:00 the same day: `201`; the old `APPT` item `cancelled` with
    `cancelReason: "changed"` and `replacedBy`, the new one with `replaces`, its `APPTID`, and one
    `appointment.changed` `EVENT` with `previous`, read from the table; the old slot free in the
    view, the new one taken;
  - AC-23: 10:00 taken by the other User: `409 slot_taken`; the 09:00 appointment is still `booked`,
    nothing written (no item, no event);
  - AC-24: the Administrator changes the User's 09:00–10:00 to 09:00–10:30: `201`;
  - the note carried over, and cleared with `null` (R-CHG-03);
  - the notice: with a notice of 720 h the User's change is `403 cancellation_too_late`, the
    Administrator's is `201`;
  - the limit: with `maxFutureAppointmentsPerUser` 1, a User moves their only future appointment;
  - someone else's appointment `404`; a changed (old) one `409`;
  - the settings restored at the end; the throw-away users removed;
  - they must pass twice in a row.

## How we work in this step

- **Restarts**: after the template changes, `local:api` must be restarted (CLAUDE.md); `local:up`
  not needed (the seed does not change). Ask me; do not start or stop the stack yourself.
- **Hard rules**:
  - 100 % lines on `backend/src/lib`;
  - strict TypeScript, ESLint clean, no new dependency;
  - no wildcard action or resource;
  - handlers do not import the AWS SDK: the table goes through `calendarDb.ts`;
  - no AWS command and no deploy;
  - the note, request bodies and any `sub` never reach a log line.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 50)

- The seven spec points presented and decided before `checkChange`, the change transaction and the
  `appointment.changed` event are written.
- `npm run test:unit -w backend` is green, with 100 % lines on `backend/src/lib` and the cases above.
- The journeys pass twice in a row: AC-22, AC-23, AC-24, the note, the notice, the limit, and every
  earlier journey (settings, types, patterns, view, overrides and windows, booking, listing, note
  and cancel) is still green. Run `RUN_INTEGRATION=1 npm run test:integration -w backend` with the
  stack's `DYNAMODB_PORT`.
- The front-end journeys are still green: `RUN_INTEGRATION=1 npm run test:integration -w frontend`,
  run after the back end's, never at the same time.
- `grep` of the four managed policies shows no `*` in any action or resource. The new role has
  exactly `CalendarReadPolicy`, `CalendarWritePolicy` and `CalendarBookPolicy`, and no Cognito
  statement.
- `sam validate --lint` passes, and the root `npm run typecheck`, `npm run lint` and
  `npm run test:unit` are green.
- The root `npm run verify` is green (with the stack's `DYNAMODB_PORT`).

Report each result, including anything you could not run, then stop for review. Do not start step
51. Commit only when I ask. Do not push and do not deploy.
