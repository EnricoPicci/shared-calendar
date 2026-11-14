## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. This step
changes `local-seed.sh` (the new function needs `USER_POOL_ID` and `COGNITO_ENDPOINT`, which
`env.local.json` sets per function, not in `Parameters`). The agent will therefore ask you to rerun
`local:up` and then restart `local:api` once the function exists. Ctrl-C removes the Lambda
containers `sam local` leaves behind, so a restart needs nothing else. Check `docker ps` and tell
the agent which `DYNAMODB_PORT` the stack uses (8000 by default, 8002 if another project holds
8000; it was 8000 in step 47).

## Brief

Implement plan step 48, "Booking and the event log", the eighth step of the shared calendar,
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop
for review. One stop at the end, **plus an early stop for the spec points below** (see "Spec
points this step must settle"): present them before you write `checkBooking` and the booking
transaction.

Read these in full first:
- `CLAUDE.md`;
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps 41–56)": the conventions under
  "How these steps are run", the rule under "Where the truth lives while the calendar is built" with
  its row-by-row table, and step 48 itself;
- `docs/SHARED_CALENDAR_SPEC.md` v8 sections:
  - 4 (who does what, R-PERM-01);
  - 5 (the time model);
  - 6.6 (effective windows);
  - 7 (R-SLOT-01..05, the fall-back night included);
  - 8.1 (every field) and 8.2 (R-BOOK-01..11 and the order rule);
  - 9 (the settings booking reads);
  - 10.2 (only what the deleted-user marker means for booking);
  - 11 intro (the status code rule), 11.1 route 17, 11.2, 11.3, 11.4 `BookBody` and the instant
    form, 11.5 `Appointment` and `Actor`, 11.6 (how a booking shows in the view);
  - 13.2 (the `APPT`, `APPTID`, `EVENT` and `DELETEDUSER` items and their access patterns), 13.3,
    13.4 (the lock; a booking is 5 items);
  - 14 (all of it, route 17 in particular);
  - 15 (all of it: the event item and 15.4);
  - 17, 18.2, 18.3 AC-10..AC-19, AC-25..AC-27, AC-34, AC-36, and 22;
- `docs/ARCHITECTURE.md` sections 2, 3, 4, 5.3, 6, 7.1, 7.3 and 8 (the note on Cognito emulation),
  and the v12 change-log entry.

Then read the code this step builds on, from steps 43–47 (last commit `f05c276`):
- `backend/template.yaml`: `CreatePatternFunction` (the write block), `CreateUserFunction`
  (`USER_POOL_ID`, `COGNITO_ENDPOINT`, the inline Cognito statement) and the comment that announces
  `CalendarBookPolicy` for step 48;
- `backend/src/lib/calendarDb.ts`: `withCalendarLock` and how it tells a lost lock from another
  cancellation reason, `readState`, `readCalendarRange`, `setOverride`, `createOneOffWindow`, the
  item mappers;
- `backend/src/lib/calendarRules.ts`: `Refusal`, `CalendarState`, `StateAppointment`,
  `checkAvailabilityWrite` (its conflict check already reads appointments) and `calendarView`;
- `backend/src/lib/cognito.ts` (`listGroups` already wraps `AdminListGroupsForUser`, which
  `deleteUser` uses and cognito-local implements), `auth.ts` (the `sub` claim), `http.ts`,
  `validation.ts`;
- the handlers `createOneOffWindow.ts`, `setOverride.ts`, `getCalendar.ts` and `createUser.ts`, with
  their unit tests and fixtures;
- `backend/scripts/local-seed.sh` (the per-function sections of `env.local.json`);
- `backend/tests/integration/setup.ts` (`removeUserIfPresent`, `putCalendarItem`,
  `getCalendarItem`) and `calendar.test.ts`.

From `shared/`:
- `BookBody`, `Instant`, `Note` in `calendar/schemas.ts`;
- `Appointment`, `Actor`, `CalendarEventType` in `calendar/types.ts`;
- `definedWindows`, `toInstantWindows`, `effectiveWindows`, `slotsOf`, `overlaps`,
  `isWholeLocalHour`, `isOnQuarterGrid` (the grid of R-BOOK-02) and `cancellableUntil` in
  `calendar/rules.ts`;
- `DEFAULT_SETTINGS` and the limits in `calendar/defaults.ts`;
- the helpers in `calendar/time.ts`.

## Where we are (2026-11-14)

- Steps 41–47 are done, committed and pushed (`f05c276` is step 47, spec v8). Availability is
  complete. Check `git status -sb` rather than trusting this line.
- The shape steps 43–47 set. Keep it unless this step proves it wrong, and if it does, say so:
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path parameters → body → `calendarDb` with the `calendarRules` check → one log line (`done()`);
  - every write takes the calendar lock (`withCalendarLock`) and runs its check on the state read
    **inside** the locked attempt, so a retry re-reads and re-checks;
  - checks that need no data (`date_in_past`) run before the lock, from the path or body alone;
  - every `Query` goes through `queryPartition`;
  - `calendarDb.ts` is the only module that knows the item layout. `calendarRules.ts` holds the pure
    rules: no AWS, and "today", "now" and the zone passed in;
  - `now` is read once per request, and "today" = `localDateOf(now, timeZone)`;
  - handler unit tests reload the module per test (`vi.resetModules()`).
- What the journeys leave behind. `calendar.test.ts` resets the table at its start and runs its
  journeys in order. Read the step 47 journeys (from `describe('date overrides and one-off
  windows …')` to the end of the file) and write down, in a comment at the top of the booking
  journeys, what they leave behind: settings, types, patterns, overrides and one-off windows, with
  their dates relative to D. The booking journeys must pick dates that do not depend on that
  leftover state, or say in that comment which part they rely on.
- In the agent's non-interactive shell the default Node is 24: run
  `source /usr/local/share/nvm/nvm.sh && nvm use` before running tests.
- Spec proposals still open: the appointment-list query (exactly one of `from`+`to` / `upcoming`)
  and `upcoming` with `status` (both step 49).

## Spec points this step must settle

Present each point with a proposed change. Do not edit the spec until I approve.

1. **The order of the checks, against what the handler can see.** 8.2 says the rules are checked
   in table order and the first failure decides. Taken literally, R-BOOK-01 (`404 user_not_found`,
   `409 target_not_user`, through Cognito) comes before R-BOOK-02 (`400`, times on the grid), and
   R-BOOK-11 (`400`, the note) comes last. The handler pattern, though, validates the body with zod
   before anything else, and the 11 intro says `400` is "malformed by itself". Propose one order
   that the spec can state exactly:
   - where every `400` goes: the schema, the role-dependent grid of R-BOOK-02 (it needs the zone,
     so zod alone cannot check it), `username` absent for an Administrator, and the note;
   - where `403 forbidden` goes (a User naming someone else);
   - where the two Cognito calls go. They should run before the lock, not inside the retried
     attempt: say why or why not;
   - which rules are checked inside the locked attempt (R-BOOK-03..07 and 09 need "now", settings,
     availability and appointments);
   - where R-BOOK-10 goes (the marker is a `ConditionCheck` in the transaction itself).

   Say which sentence of 8.2 changes.
2. **R-BOOK-10 and the transaction.** The marker check is the transaction's last item. Say how a
   cancellation on that item becomes `404 user_not_found`, and how it is told apart from a lost lock
   (index 0), which retries. Say whether a User booking for themself is checked against the marker
   on the `sub` from their token. No marker is ever written before step 51, so the unit tests and
   one journey write it with `putCalendarItem`. Confirm that this is the intended proof for now.
3. **What the three new items store.** 13.2 says the `APPT` item stores "every field of 8.1".
   15.2 says the event's `appointment` is "the appointment, as stored". Propose the exact attribute
   list of the `APPT` item: `userId`, `typeNameAtBooking`, `version` and its first value, no
   `cancellableUntil`, no `typeName`. Propose the values of `updatedAt`/`updatedBy` at creation
   (8.1 calls them "last change", and the response type does not allow `null`). Propose the exact
   list for the `EVENT` item's `appointment` snapshot: does it keep `PK`/`SK`, `userId`, `version`?
   Propose the `APPTID` pointer too. All three go into architecture 5.3 with every attribute name, as
   steps 46 and 47 did. Point out anything else in these items that is unclear.

If anything else is unclear or contradictory while you read, stop and tell me, with a proposal.
For example: R-BOOK-06 against effective windows merged across two sources (AC-08's 08:00–13:00),
R-BOOK-09 counting an appointment that is in progress, the fall-back night's two 02:00 slots, or
`typeName` in the response.

## The step

Only what step 48 lists.

- `backend/template.yaml`:
  - `CalendarBookPolicy` (`dynamodb:ConditionCheckItem`, the `calendar` table's ARN only);
  - `BookAppointmentFunction` (`POST /calendar/appointments`, roles admin and user) with
    `CalendarReadPolicy`, `CalendarWritePolicy` and `CalendarBookPolicy`, plus an inline Cognito
    statement (`cognito-idp:AdminGetUser`, `cognito-idp:AdminListGroupsForUser`, the user pool's ARN
    only), and `USER_POOL_ID` and `COGNITO_ENDPOINT`. Copy it from `CreatePattern` and take the
    Cognito part from `CreateUser`;
  - check it against spec 14.1's action list. If a policy grants an action the route does not use,
    say so, as step 43 did (architecture 7.1).
- `backend/scripts/local-seed.sh`: a `BookAppointmentFunction` section in `env.local.json` with
  `USER_POOL_ID`, `COGNITO_ENDPOINT` and the dummy credentials (the calendar variables already come
  from `Parameters`). Update the comment.
- `backend/src/lib/cognito.ts`:
  - `getUserSub(username)`: `AdminGetUser`, the `sub` attribute; an unknown user is
    `UserNotFoundError`;
  - `isPlainUser(username)`: in group `user` and not in `admin`, built on `listGroups`.
  - Keep 100 % lines.
- `backend/src/lib/calendarEvents.ts` (new, pure): builds the `EVENT` item of 15.2 for
  `appointment.booked` (`eventId` a new ULID, `occurredAt` = now, `actor`, `recipients`,
  `appointment`, `schemaVersion: 1`). Write it so that steps 49–51 add their event types without
  reshaping it, but add nothing they need now.
- `backend/src/lib/calendarRules.ts`: `checkBooking`, the rules that need the state, in the order
  settled by point 1, with the Administrator's exemptions (R-BOOK-04, 05, 09; R-BOOK-08's custom
  times). Inputs: the request (start, end, the role), the settings, `CalendarState` (or what the
  check needs from it), "now", "today" and the zone. Output: `Refusal` or the window that holds the
  appointment (its type). Reuse the shared rules (effective windows, slots, overlap); do not write a
  second implementation of them.
- `backend/src/lib/calendarDb.ts`: `bookAppointment(…, check)` under the lock. Inside the attempt it
  reads the settings and the state the check needs, including the active appointments not yet ended
  (`SK ≥ now − 24 h`, as 13.2 says). It then writes one transaction: the lock update first, `Put`
  `APPT` with `SK` `<start>#<appointmentId>`, `Put` `APPTID#<id>`, `Put` `EVENT`, and
  `ConditionCheck` `DELETEDUSER#<sub>` `attribute_not_exists`. That is five items, as 13.4 counts.
  It answers the stored appointment.
- Handler `bookAppointment.ts` (admin and user):
  - `BookBody` through `parseJsonBody` and `validate`, then the order of point 1;
  - for a User, `username` and `sub` come from the token;
  - for an Administrator, `username` is required and the target comes through `getUserSub` and
    `isPlainUser`;
  - the note is trimmed, and an empty note becomes `null`;
  - success is `201` with the `Appointment`: `typeName` from the type, `cancellableUntil` from the
    shared helper for a User caller and `null` for the Administrator;
  - one log line with `appointmentId` on success, the outcome and the lock attempts. Never the
    note, the body, or the target's `sub` (AC-36).
- Integration: the booking journeys in `calendar.test.ts`, after the step 47 journeys. `dave` and
  `erin` are created here through `POST /users` (removed first with `removeUserIfPresent`, and
  again at the end). The settings are restored at the end to what the earlier journeys left.
- Documents, the step-48 rows of the plan's table:
  - `docs/ARCHITECTURE.md`:
    - section 2 (diagram and 2.1: the function, its Cognito access);
    - section 3 (who can call: admin and user, what each may do);
    - section 4 (route 17, its error codes in the settled order, the `Appointment` shape,
      `cancellableUntil`);
    - 5.3 (the `APPT`, `APPTID` and `EVENT` items with every attribute; the `DELETEDUSER` marker as
      read by booking);
    - section 6 (the "book" sequence diagram, lock retry included);
    - 7.1 (`CalendarBookPolicy`, the booking role, the Cognito row);
    - section 8 (the note on cognito-local: `AdminGetUser` returns `sub`; the list of admin APIs
      our Lambdas call);
    - the step 48 sentence in the v12 entry;
  - `CLAUDE.md`: the folder map (`bookAppointment.ts`, `calendarEvents.ts`, the new `cognito.ts`
    and `calendarDb.ts` functions), the `local:up` line if the seed's description changes, and the
    local-weight line if you measure it again (optional; 16 calendar functions now);
  - the plan's status line.

Not in this step:
- `GET /calendar/appointments`, note, cancel, change (steps 49–50);
- writing the deleted-user marker, `deleteUser`, `GET /users` (step 51);
- the smoke test (step 52);
- anything in `frontend/`.

`shared/` should need no change: `BookBody`, `Appointment` and `CalendarEventType` exist since step
42. If it turns out to need one (a schema, a type, a helper), stop and say why. The same goes for a
change to the view (`calendarView`) beyond what booking makes visible.

### Tests

- Unit (`aws-sdk-client-mock` for DynamoDB and Cognito, fake clock with `vi.setSystemTime`):
  - `cognito.ts`: `getUserSub` (found, no `sub` attribute, unknown user), `isPlainUser` (user only;
    admin only; both; neither);
  - `calendarEvents.ts`: the exact event item, `schemaVersion: 1`, no note outside the appointment
    snapshot;
  - `calendarDb`:
    - the exact transaction (five items in order, keys and attributes of the settled point 3);
    - the reads inside the locked attempt, and a retry that re-reads and re-checks;
    - the marker cancellation answering `user_not_found` without a retry (point 2);
    - three lost attempts answering `concurrent_update`;
  - `checkBooking`, with the exact dates of 18.3 (now 2026-11-10 unless the scenario says otherwise,
    `Europe/Rome`):
    - every R-BOOK row for both roles, and the order: for each pair of neighbouring rules, a request
      that breaks both gets the earlier one's code;
    - AC-10 to AC-19;
    - R-SLOT-05 (an Administrator's 10:00–10:30 makes the 10:00 slot not free for a User);
    - a booking inside AC-08's merged window across the two sources;
    - the fall-back night (both 02:00 slots bookable, as distinct instants);
    - a cancelled appointment never blocks, and an ended one never counts for R-BOOK-09;
    - say which cases you prove through the handler instead, and why;
  - handler:
    - the role cases (a token in neither group is 403; a User naming someone else is 403);
    - invalid JSON and invalid bodies (400, also an unknown field, an instant not in the exact
      form, a note of 501 UTF-16 units, a control character);
    - `username` absent for the Administrator (400);
    - Cognito: unknown target (404), target an Administrator (409 `target_not_user`);
    - the invalid-zone 500;
    - AC-34: the first transaction lost on the lock, the re-read finds the slot taken, `409
      slot_taken`;
    - the response (`cancellableUntil` per role, `typeName`, no `userId`);
    - the log line: `appointmentId`, attempts, no note, no body, no `sub`.
- Journeys (`calendar.test.ts`, after the step 47 journeys). Dates come from the real today,
  computed with the shared helpers, never with fixed offsets. In the scenarios, `dave` plays alice
  and `erin` plays bob (18.2):
  - AC-10, with the `APPT`, `APPTID` and `EVENT` items read from the table (`getCalendarItem` or a
    partition read);
  - AC-11;
  - AC-12: `erin`'s view has the `busy` interval and no slot at 09:00, and the response text
    contains neither `dave` nor the appointment id;
  - AC-13 to AC-16;
  - AC-17 (horizon 7, a slot 8 or more days ahead; then the Administrator books it for `dave`: 201);
  - AC-18 (notice 720 h);
  - AC-19 (limit 1; then the Administrator books for `dave`: 201);
  - AC-25 to AC-27 end to end: an override and a pattern change refused with `conflicts`, which only
    the Administrator receives; the extension accepted;
  - AC-34 with `Promise.all` (one 201, one 409 `slot_taken`, spec v2 wording);
  - R-BOOK-10: a `DELETEDUSER#<dave's sub>` marker written with `putCalendarItem` makes `dave`'s
    booking 404 `user_not_found`. Remove the marker afterwards;
  - the Administrator booking for `admin` is 409 `target_not_user`, and for an unknown username 404;
  - the settings restored at the end; `dave` and `erin` removed;
  - they must pass twice in a row.

## How we work in this step

- **Restarts**: after the seed and template changes, `local:up` must be rerun and `local:api`
  restarted (CLAUDE.md). Ask me; do not start or stop the stack yourself. After `local:up`, the
  seeded passwords are restored, as the integration tests expect.
- **Hard rules**:
  - 100 % lines on `backend/src/lib`;
  - strict TypeScript, ESLint clean, no new dependency;
  - no wildcard action or resource;
  - handlers do not import the AWS SDK: Cognito goes through `cognito.ts`, the table through
    `calendarDb.ts`;
  - no AWS command and no deploy;
  - the note, request bodies, `conflicts` and the target's `sub` never reach a log line.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 48)

- The three spec points presented and decided before `checkBooking` and the booking transaction are
  written.
- `npm run test:unit -w backend` is green, with 100 % lines on `backend/src/lib` and the cases above.
- The journeys pass twice in a row: AC-10 to AC-19, AC-25 to AC-27, AC-34 and R-BOOK-10, and the
  settings, type, pattern, view, override and window journeys are still green. Run
  `RUN_INTEGRATION=1 npm run test:integration -w backend` with the stack's `DYNAMODB_PORT`.
- The front-end journeys are still green: `RUN_INTEGRATION=1 npm run test:integration -w frontend`,
  run after the back end's, never at the same time.
- `grep` of the four managed policies shows no `*` in any action or resource. The booking role has
  exactly the policies listed above and one Cognito statement on the pool's ARN.
- `sam validate --lint` passes, and the root `npm run typecheck`, `npm run lint` and
  `npm run test:unit` are green.
- The root `npm run verify` is green (with the stack's `DYNAMODB_PORT`).

Report each result, including anything you could not run, then stop for review. Do not start step
49. Commit only when I ask. Do not push and do not deploy.
