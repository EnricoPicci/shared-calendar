## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
sam --version                                                # 1.171.0 or newer (scripts/check-sam.sh)
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. The three
new functions call no Cognito (route 16 stays without it: decided, point 2), so `local-seed.sh`
should not change and `local:up` need not be rerun. Only `local:api` must be restarted once the
functions exist in the template; the agent will ask you. Ctrl-C removes the Lambda containers
`sam local` leaves behind. Check `docker ps` and tell the agent which `DYNAMODB_PORT` the stack
uses (8000 by default, 8002 if another project holds 8000; it was 8000 in step 48).

## Brief

Implement plan step 49, "Listing, note and cancel", the ninth step of the shared calendar,
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop
for review. One stop at the end, **plus an early stop for the spec points below** (see "Spec
points this step must settle"): present them before you write `checkCancel`, `checkNote`, the two
transactions and the list query.

Read these in full first:
- `CLAUDE.md`;
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps 41–56)": the conventions under
  "How these steps are run", the rule under "Where the truth lives while the calendar is built" with
  its row-by-row table, and step 49 itself;
- `docs/SHARED_CALENDAR_SPEC.md` v9 sections:
  - 4 (who does what, R-PERM-01);
  - 5 (the time model);
  - 8.1 (every field and the lifecycle: "ended" is derived, never stored), 8.3 (R-CAN-01..03),
    8.5 (R-NOTE-01..02), 8.6 (R-VIEW-01..03); 8.2 only for the order rule it states;
  - 9 (`cancellationNoticeHours`);
  - 11 intro (the status code rule), 11.1 routes 16, 18 and 19 and the notes under the table, 11.2,
    11.3, 11.4 `NoteBody` and the text-length rule, 11.5 `Appointment`;
  - 13.2 (the `APPT` and `APPTID` items, every access pattern: by id, a time range, "active not yet
    ended", a User's appointments), 13.3, 13.4 (cancel 3 items, note 3 items);
  - 14.1 (routes 16, 18, 19), 14.5;
  - 15 (all of it: the event types `appointment.cancelled` and `appointment.note_updated`, 15.4);
  - 17, 18.2, 18.3 AC-20, AC-21, AC-30, AC-31, AC-36, and 22 (A6);
- `docs/ARCHITECTURE.md` sections 2, 3, 4, 5.3, 6 (6.7 "Book an appointment" in particular), 7.1
  and the v12 change-log entry.

Then read the code this step builds on, from steps 43–48 (last commit `97bf409`):
- `backend/template.yaml`: `BookAppointmentFunction` and `GetCalendarFunction` (a read-only
  function), the four shared managed policies;
- `backend/src/lib/calendarDb.ts`: `withCalendarLock` (and `onConditionFailed`), `queryPartition`,
  `readState`, `readCalendarRange`, `bookAppointment`, `toBookedAppointment`, the item mappers;
- `backend/src/lib/calendarRules.ts`: `Refusal`, `CalendarState`, `StateAppointment`,
  `checkBooking`, `calendarView`, `toResponse`;
- `backend/src/lib/calendarEvents.ts`: `appointmentEvent`, `AppointmentSnapshot`,
  `WrittenEventType`. It was written so that steps 49–51 add their event types without reshaping
  it: check that this holds;
- `backend/src/lib/http.ts` (`parseQuery`), `auth.ts` (the `sub` claim), `validation.ts`;
- the handlers `bookAppointment.ts`, `getCalendar.ts` (query parameters) and `deleteOneOffWindow.ts`
  (a path id), with their unit tests and fixtures;
- `backend/tests/integration/setup.ts` (`putCalendarItem`, `getCalendarItem`,
  `deleteCalendarItem`, `queryCalendarPartition`, `removeUserIfPresent`) and `calendar.test.ts`,
  the booking journeys in particular.

From `shared/`:
- `AppointmentsQuery`, `NoteBody`, `Note`, `AppointmentId` (or the ULID schema the path uses) in
  `calendar/schemas.ts`;
- `Appointment`, `Actor`, `CancelReason`, `CalendarEventType` in `calendar/types.ts`;
- `cancellableUntil` in `calendar/rules.ts`;
- `CALENDAR_LIMITS.appointmentListDays` in `calendar/defaults.ts`;
- the helpers in `calendar/time.ts` (`localDateOf`, local midnight as an instant).

## Where we are (2026-11-14)

- Steps 41–48 are done and committed (`97bf409` is step 48, spec v9). Check `git status -sb`
  rather than trusting this line; it may or may not be pushed.
- The shape steps 43–48 set. Keep it unless this step proves it wrong, and if it does, say so:
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path parameters → query or body → `calendarDb` with the `calendarRules` check → one log line
    (`done()`);
  - every write takes the calendar lock (`withCalendarLock`) and runs its check on the data read
    **inside** the locked attempt, so a retry re-reads and re-checks;
  - checks that need no data run before the lock;
  - every `Query` goes through `queryPartition`;
  - `calendarDb.ts` is the only module that knows the item layout. `calendarRules.ts` holds the pure
    rules: no AWS, and "today", "now" and the zone passed in;
  - `calendarEvents.ts` builds every `EVENT` item; the snapshot is the appointment as stored, copied
    field by field;
  - `now` is read once per request, and "today" = `localDateOf(now, timeZone)`;
  - the response's `cancellableUntil` comes from the shared helper for a User caller and is `null`
    for the Administrator;
  - handler unit tests reload the module per test (`vi.resetModules()`).
- What the journeys leave behind. `calendar.test.ts` resets the table at its start and runs its
  journeys in order. The booking journeys end by removing `dave` and `erin` and restoring the
  settings, but **their appointments stay in the table**, under the old `dave`'s `sub` and the
  username `dave`. A `dave` created again is a new Cognito account with a new `sub`. Write down, in
  a comment at the top of the new journeys, what the earlier journeys leave behind (settings, types,
  patterns, overrides, windows, the appointments with their dates and owners), and either pick
  dates and users that do not depend on it or say which part you rely on.
- In the agent's non-interactive shell, Node 22 is the default (`~/.nvm`); if `node -v` is not 22,
  run `source ~/.nvm/nvm.sh && nvm use`.
- Spec proposals still open since step 42, to be settled here: the appointment-list query (exactly
  one of `from`+`to` / `upcoming`; the shared schema already requires it, the spec does not say so)
  and `upcoming` with `status`.

## Spec points this step must settle

Present each point with a proposed change. Do not edit the spec until I approve.

1. **The list query (route 16).** 11.2 says `upcoming` is "mutually exclusive with `from`/`to`"; it
   does not say that one of the two is required, which `AppointmentsQuery` enforces. The 11.1 note
   says `upcoming=true` "returns active appointments with `end > now`", while `status` defaults to
   `booked` and may be `cancelled` or `all`. Propose:
   - the sentence that makes "exactly one of `from`+`to` or `upcoming=true`" the rule;
   - what `upcoming=true&status=cancelled` and `status=all` mean (rejected with `400`; or
     `upcoming` selects by time only and `status` filters as everywhere; or something else), and
     why;
   - which appointments a `from`/`to` range returns: by the local date of `start` (`date`) inside
     the range, so `SK BETWEEN <local midnight of from> AND <local midnight after to>` exclusive,
     as the view does; or by overlap. Say how an appointment in progress at midnight is treated
     (it cannot cross midnight, 8.1);
   - whether "ended" changes anything in the list (it is not a status: a booked appointment that
     has ended is listed as `booked`);
   - `cancellableUntil` on a listed appointment for a User caller: the helper gives
     `start − notice` for every appointment. Is that right for a cancelled or ended one, or should
     it be `null`? Whatever you propose, apply the same rule to the note and cancel responses.
2. **Whose appointments: `userId` or `username` (decided by me, 2026-11-14; write the sentences).**
   R-VIEW-01 and 13.2 say a User's appointments are "filtered on `userId`". A User caller has their
   `sub` in the token, so their own list is filtered on `userId`: exact, and a User never sees the
   appointments of an earlier account with the same name. The Administrator's `username` filter
   has no `sub` (route 16 has no Cognito actions, 14.1), and **the decision is the simple rule,
   keeping the history**:
   - the Administrator's `username` filters on the stored `username`, with no Cognito call. It means
     "the appointments booked under that name", earlier deleted accounts with the same name
     included (R-DEL-02: a new account with the same name gets a new `sub`). Nothing is hidden or
     deleted: a deleted User's appointments stay as history (D17, D19). An unknown username is
     `200` with an empty list, not `404`;
   - route 16 stays read-only on the table: no Cognito action, no seed change, no `local:up` rerun;
   - a User passing their own `username` gets the same answer as without it (11.1 implies it).
   Propose the exact sentences for 11.1 (the `username` note under the table), 11.2 and 13.2 (the
   "A User's appointments" access pattern: on `userId` for a User caller, on `username` for the
   Administrator's filter). Do not propose a different rule; if implementing it shows a problem I
   have not seen, stop and tell me.
3. **Cancel and note: the lookup, the order, and what is written.** Settle, with the exact
   sentence for the spec where it is silent:
   - the order of the checks for routes 18 and 19, as 8.2 does for booking: path id (`400`), body
     for 18 (`400`), then inside the locked attempt R-CAN-01 / R-PERM-01 (`404`), R-CAN-02 or
     R-NOTE-01's activity part (`409 appointment_not_active`), R-CAN-03 (`403
     cancellation_too_late`). A User's ownership is `userId = sub` of the token, not the username;
   - whether the lookup by id (`GetItem APPTID#<id>` → `GetItem APPT`) runs inside the locked
     attempt. The pointer never changes (13.3), but the `APPT` item does;
   - the three items of each transaction (13.4): the lock, the `APPT` item (a whole `Put`, or an
     `Update` of the changed attributes; with or without a condition on `version`, given the global
     lock), the `EVENT`. List the attributes that change: for a cancel `status`, `cancelledAt`,
     `cancelledBy`, `cancelReason: "cancelled"`, `updatedAt`, `updatedBy`, `version + 1`; for a
     note `note`, `updatedAt`, `updatedBy`, `version + 1`;
   - R-NOTE-01 on a note set to the value it already has: a write and an event anyway, or `200`
     with nothing written. Propose one, and say what the event log then means;
   - the Administrator cancelling an appointment in progress (`start ≤ now < end`): allowed by
     R-CAN-03, and R-CAN-02 only refuses `end ≤ now`. Confirm that a User's appointment in progress
     is refused by R-CAN-03 (notice), not by R-CAN-02;
   - the exact instants of AC-20 and AC-21: `start − now ≥ cancellationNoticeHours` with `now` read
     once per request. Confirm that AC-20's "exactly 24 h before" is allowed and AC-21's one minute
     later is refused, and that milliseconds do not matter (the start has none; `now` has them).
   All of this goes into architecture 5.3 (the attributes) and section 6 (a "cancel" sequence, if
   you think it adds something beyond 6.7: say so either way).

If anything else is unclear or contradictory while you read, stop and tell me, with a proposal.
For example: route 18's 11.1 row lists no `403`, so a User's note on someone else's appointment
is `404` (R-PERM-01); the snapshot of a cancelled appointment in the event; `typeName` of an
appointment whose type has been deleted (8.1: the snapshot); the 92-day bound for a User's history
(A6), which is reached through several requests.

## The step

Only what step 49 lists.

- `backend/template.yaml`, three functions, each with its log group and role, copied from the
  existing calendar functions:
  - `ListAppointmentsFunction` (`GET /calendar/appointments`, admin and user): `CalendarReadPolicy`
    only, no Cognito statement (point 2);
  - `UpdateAppointmentNoteFunction` (`PATCH /calendar/appointments/{appointmentId}`) and
    `CancelAppointmentFunction` (`POST /calendar/appointments/{appointmentId}/cancel`), admin and
    owner: `CalendarReadPolicy` and `CalendarWritePolicy`;
  - check them against spec 14.1's action list. If a policy grants an action the route does not
    use, say so (architecture 7.1).
- `backend/src/lib/calendarDb.ts`:
  - the lookup by id through the pointer (`GetItem APPTID#<id>` → `GetItem APPT`), consistent;
  - `listAppointments(…)`: the range query and the "active not yet ended" query of 13.2, filtered
    on the owner (`userId` for a User caller, the stored `username` for the Administrator's
    filter, point 2) and on `status` (point 1), sorted by start, through `queryPartition`;
  - `cancelAppointment(…, check)` and `updateAppointmentNote(…, check)` under the lock, each one
    transaction of three items (lock, `APPT`, `EVENT`), with the check on the data read inside the
    attempt. They answer the stored appointment (and the settings when the response needs them).
- `backend/src/lib/calendarRules.ts`: `checkCancel` (R-CAN-01..03 and R-PERM-01, in the settled
  order, the Administrator's exemption) and `checkNote` (R-NOTE-01 and R-PERM-01). Inputs: the
  appointment read (or its absence), the caller (role and `sub`), the settings, "now". Output:
  `Refusal` or what the write needs. Pure.
- `backend/src/lib/calendarEvents.ts`: the event types `appointment.cancelled` and
  `appointment.note_updated`, without reshaping what step 48 wrote. Still no `previous` (that is
  `appointment.changed`, step 50).
- Handlers `listAppointments.ts`, `updateAppointmentNote.ts`, `cancelAppointment.ts`:
  - the query through `parseQuery` and `AppointmentsQuery`; a User passing another `username` is
    `403 forbidden`; the 92-day bound comes from the schema;
  - the path id validated as a ULID (`400`); `NoteBody` through `parseJsonBody` and `validate`;
    the note trimmed, an empty note becomes `null` (R-BOOK-11 applies to the note as everywhere);
  - the response `Appointment` through `toResponse`, with `cancellableUntil` as settled in point 1;
    `{ appointments: [...] }` sorted by start for route 16;
  - one log line each, with `appointmentId` for 18 and 19, the outcome and the lock attempts, and for
    16 the number of appointments returned. Never the note, the body, or a `sub` (14.5, AC-36).
- Integration: the new journeys in `calendar.test.ts`, after the booking journeys, with their own
  throw-away users (`dave` and `erin` again, created through `POST /users` and removed first and at
  the end, or two new names: say which, given what the booking journeys leave behind). The settings
  are restored at the end to what the earlier journeys left.
- Documents, the step-49 rows of the plan's table:
  - `docs/ARCHITECTURE.md`:
    - section 2 (diagram and 2.1: the three functions);
    - section 3 (who can call: admin and owner, R-PERM-01);
    - section 4 (routes 16, 18, 19, their error codes in the settled order, the query parameters);
    - 5.3 (the attributes a cancel and a note change; the list's access patterns);
    - section 6 (a "cancel" sequence diagram only if point 3 says it adds something);
    - 7.1 (the three roles);
    - the step 49 sentence in the v12 entry;
  - `docs/SHARED_CALENDAR_SPEC.md` v10, only what you and I settle in points 1–3, with its change-log
    row;
  - `CLAUDE.md`: the folder map (the three handlers, the new `calendarDb.ts`, `calendarRules.ts` and
    `calendarEvents.ts` functions), and the local-weight line if you measure it again (optional; 18
    calendar functions now);
  - the plan's status line.

Not in this step:
- change (`POST …/change`, step 50);
- writing the deleted-user marker, `deleteUser`, `GET /users` (step 51);
- the smoke test (step 52);
- anything in `frontend/`.

`shared/` should need no change: `AppointmentsQuery`, `NoteBody`, `Appointment` and
`CalendarEventType` exist since step 42. If point 1 changes the query schema, or anything else
turns out to need a change in `shared/` (a schema, a type, a helper), stop and say why first.

### Tests

- Unit (`aws-sdk-client-mock` for DynamoDB, fake clock with `vi.setSystemTime`):
  - `calendarEvents.ts`: the exact `appointment.cancelled` and `appointment.note_updated` items, no
    note outside the appointment snapshot, `appointment.booked` unchanged;
  - `calendarDb`:
    - the lookup by id: found, no pointer (absent), a pointer without its `APPT` item (say what it
      answers and why that cannot happen through the API);
    - the list: the exact `Query` of each variant (range bounds, `SK ≥ now − 24 h`, consistent
      reads, paging through `queryPartition`), the filters on owner and `status`, the order;
    - the exact cancel and note transactions (three items in order, keys and attributes of point 3);
    - the reads inside the locked attempt, and a retry that re-reads and re-checks (an appointment
      cancelled by someone else between two attempts answers `409 appointment_not_active`);
    - three lost attempts answering `concurrent_update`;
  - `checkCancel` and `checkNote`, with the exact dates of 18.3 (now 2026-11-15T09:00 and 09:01
    local, `Europe/Rome`, the appointment 2026-11-16 09:00 local):
    - every R-CAN and R-NOTE row for both roles, and the order: a request that breaks two rules gets
      the earlier one's code;
    - AC-20 and AC-21 on their exact instants: exactly 24 h before is allowed, one minute later is
      refused; and a `now` with milliseconds just past the limit;
    - AC-30 (`404`, not `403`), AC-31 (an ended appointment, `409`);
    - the Administrator cancels an appointment in progress; a User cannot;
    - a note on an ended or a cancelled appointment (`409`), on someone else's (`404`);
  - handlers:
    - the role cases (a token in neither group is `403`);
    - every query variant of route 16: a range of exactly 92 days and of 93 (`400`), `upcoming`,
      neither and both (`400`), `username` (a User naming someone else `403`, naming themself as
      settled), each `status`, an unknown field (`400`);
    - an invalid appointment id (`400`); invalid JSON and invalid note bodies (`400`: 501 UTF-16
      units, a control character, an unknown field, `note` missing);
    - the invalid-zone `500`;
    - the response (`cancellableUntil` per role and as settled for cancelled/ended appointments,
      `typeName`, no `userId`);
    - the log line: `appointmentId`, attempts, the count for route 16; no note, no body, no `sub`.
- Journeys (`calendar.test.ts`, after the booking journeys). Dates come from the real today,
  computed with the shared helpers, never with fixed offsets:
  - AC-20: a User cancels with enough notice: `200`, `cancelReason: "cancelled"`, the `APPT` item
    and one `appointment.cancelled` `EVENT` read from the table, and the slot free again in the
    view;
  - AC-21: notice 720 h, the User's cancel is `403 cancellation_too_late`; then the Administrator
    cancels: `200`;
  - AC-30: `erin` cancels `dave`'s appointment, and edits its note: `404 appointment_not_found`
    both; an unknown id: `404`;
  - AC-31: an ended appointment written directly (`APPT` and `APPTID` with `putCalendarItem`):
    the Administrator's cancel and note are `409 appointment_not_active`;
  - a User's history with `status=all` (A6): their booked, cancelled and ended appointments, and
    none of anyone else's; `upcoming` returns only the future booked ones;
  - the Administrator's list with and without `username`: with `username=dave` it includes the
    appointments the booking journeys left under the earlier `dave` (point 2), while the new
    `dave`'s own list (no `username`) does not; an unknown username is `200` with an empty list;
  - the note is edited (`200`), its `appointment.note_updated` event written, and cleared with
    `null`;
  - the settings restored at the end; the throw-away users removed;
  - they must pass twice in a row.

## How we work in this step

- **Restarts**: after the template changes, `local:api` must be restarted (CLAUDE.md); `local:up`
  not needed (the seed does not change). Ask me; do not start or
  stop the stack yourself.
- **Hard rules**:
  - 100 % lines on `backend/src/lib`;
  - strict TypeScript, ESLint clean, no new dependency;
  - no wildcard action or resource;
  - handlers do not import the AWS SDK: the table goes through `calendarDb.ts`;
  - no AWS command and no deploy;
  - the note, request bodies and any `sub` never reach a log line.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 49)

- The three spec points presented and decided before `checkCancel`, `checkNote`, the two
  transactions and the list query are written.
- `npm run test:unit -w backend` is green, with 100 % lines on `backend/src/lib` and the cases above.
- The journeys pass twice in a row: AC-20, AC-21, AC-30, AC-31, the history, the note and the freed
  slot, and every earlier journey (settings, types, patterns, view, overrides and windows, booking)
  is still green. Run `RUN_INTEGRATION=1 npm run test:integration -w backend` with the stack's
  `DYNAMODB_PORT`.
- The front-end journeys are still green: `RUN_INTEGRATION=1 npm run test:integration -w frontend`,
  run after the back end's, never at the same time.
- `grep` of the four managed policies shows no `*` in any action or resource. The three new roles
  have exactly the policies listed above and no Cognito statement.
- `sam validate --lint` passes, and the root `npm run typecheck`, `npm run lint` and
  `npm run test:unit` are green.
- The root `npm run verify` is green (with the stack's `DYNAMODB_PORT`).

Report each result, including anything you could not run, then stop for review. Do not start step
50. Commit only when I ask. Do not push and do not deploy.
