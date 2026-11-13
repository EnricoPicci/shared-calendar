## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. The agent
will ask you to restart `local:api` once the new function exists. Ctrl-C removes the Lambda
containers `sam local` leaves behind, so a restart needs nothing else.

## Brief

Implement plan step 46, "The calendar view", the sixth step of the shared calendar, following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for review.
One stop at the end, **plus an early stop if the 11.6 example has to change** (see "Spec points this
step must settle").

Read first, in full: `CLAUDE.md`; `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built" with its row-by-row table, and step 46 itself); then
`docs/SHARED_CALENDAR_SPEC.md` v6 sections 4 (who sees what), 5 (the time model, R-TIME-03 and
R-TIME-04), 6.5 and 6.6 (defined and effective windows), 7 (slots, R-SLOT-01..05), 8.1 (the
appointment fields; `userId`, `typeNameAtBooking`), 8.6 (R-VIEW-01..03), 9 (the settings the slots
depend on), 11 (status code rule, route 15 of 11.1, 11.2 `from`/`to`, 11.5 `Appointment`, **11.6
all of it**), 13.2 (the range access patterns), 14 (all of it), 17 (privacy between Users), 18.3
AC-04, AC-12, AC-33, AC-35, and 22 (A3); then `docs/ARCHITECTURE.md` sections 2, 3, 4, 5.3, 7.1
and the v12 change-log entry.

Then the code this step copies, from steps 43–45 (last commit `4cc56e4`): `backend/template.yaml`
(`ListPatternsFunction` with its log group and role: the read-only block), `backend/src/lib/calendarDb.ts`
(`queryPartition`, `readState`, `getSettings`, the type and pattern mappings),
`backend/src/lib/calendarRules.ts`, `backend/src/lib/http.ts` and `validation.ts`,
`backend/src/handlers/listAvailabilityTypes.ts` and `getCalendarSettings.ts` (the read-handler
pattern for both roles) with their unit tests, `backend/tests/unit/handlers/patternFixtures.ts`,
`backend/tests/integration/setup.ts` and `calendar.test.ts`. From `shared/`: `CalendarQuery` in
`calendar/schemas.ts`; `CalendarView`, `CalendarDay`, `CalendarWindow`, `Slot`, `Interval`,
`Appointment`, `CalendarSettings` in `calendar/types.ts`; `definedWindows`, `toInstantWindows`,
`effectiveWindows`, `slotsOf`, `overlaps`, `cancellableUntil` in `calendar/rules.ts`; `toInstant`,
`localDateOf`, `weekdayOf`, `addDays` in `calendar/time.ts`.

## Where we are (2026-11-12)

- Steps 41–45 are done and committed (`4cc56e4` is step 45, spec v6). Check `git status -sb` for the
  push state rather than assuming it.
- The shape steps 43–45 set, to keep unless this step proves it wrong (then say so):
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path or query parameters → `calendarDb` → one log line (`done()`), never a body;
  - every `Query` goes through `queryPartition` (consistent, follows `LastEvaluatedKey`);
  - `calendarDb.ts` is the only module that knows the item layout; `calendarRules.ts` holds the pure
    rules (no AWS, "today", "now" and the zone passed in);
  - `now` once per request, "today" = `localDateOf(now, timeZone)`;
  - handler unit tests reload the module per test (`vi.resetModules()`).
- The view is a **read**: no lock, no transaction, and no `CalendarWritePolicy`. Its reads are
  consistent like every calendar read.
- What the journeys leave behind. `calendar.test.ts` resets the table at its start, then the earlier
  journeys run in order. When the view journeys start, the settings are `minBookingNoticeHours 2`,
  `bookingHorizonDays 30`, `maxFutureAppointmentsPerUser null`. The type `Studio` has been
  **deleted** (AC-28 in step 45). Types `GYM` (`ids.pool`) and one pattern remain: Monday 07:00–08:00
  `GYM` from 2026-11-01, no end. The view journeys prepare their own state (they may create a new
  `Studio`) and must not depend on the order beyond this.
- In the agent's non-interactive shell the default Node is 24: run
  `source /usr/local/share/nvm/nvm.sh && nvm use` before running tests.
- Spec proposals still open from step 42: the appointment-list query and `upcoming` with `status`
  (both step 49), and the fall-back night, which **this step** settles (below).

## Spec points this step must settle

Present each with a proposed change. Do not edit the spec until I approve.

1. **The 11.6 example is inconsistent.** It lists a Swimming Pool window 14:00–18:00 local
   (`13:00Z–17:00Z`). Its `slots` hold only the two Studio slots, and the text says "the free slots
   are 08:00 and 10:00 local". By R-SLOT-01..03 the four Pool slots (`13:00Z`, `14:00Z`, `15:00Z`,
   `16:00Z`) are free and bookable too, so a byte-for-byte test of the example as written must fail.
   Its `appointments` element is elided (`"…": "…"`), and its ids are placeholders.
   **Stop early, before writing the view, and propose a corrected example** for spec v7: either the
   four Pool slots added, or the Pool window removed. Name every field of alice's appointment, with
   real ULIDs and its `cancellableUntil` under the default settings. The unit test then reproduces
   the corrected example byte for byte (`JSON.stringify` of the response body equals the spec's
   JSON once the spec's is compacted).
2. **The fall-back night (open proposal from step 42).** On the night clocks go back (Europe/Rome,
   2026-10-25), `slotsOf` gives a window 01:00–04:00 four slots: 01:00, 02:00 (CEST), 02:00 (CET)
   and 03:00. Two of them start at local 02:00, an hour apart. R-SLOT-01 does not say so. Propose
   the sentence for R-SLOT-01 and for 16.8 (the future views must show both, for example with the
   offset). Test it in the view.
3. **A past window whose type was deleted.** R-TYPE-03 lets a type be deleted when only past
   overrides or one-off windows use it. A window from a pattern cannot be in this situation:
   patterns block the delete whatever their validity. R-VIEW-03 shows past dates. The view's
   `CalendarWindow.typeName` then has no type to name. Past appointments do not have the problem:
   they keep `typeNameAtBooking`. Propose what the view shows. Two options: leave such a window out,
   or show it with a fixed `typeName` (for example `""` or a marker). Implement your proposal, say
   which, and test it.

## The step

Only what step 46 lists.

- `backend/template.yaml`: `GetCalendarFunction` (`GET /calendar`, admin and user: read only),
  copied from the `ListPatterns` block. Handler and log-group names as spec 14.1.
- `backend/src/lib/http.ts`: `parseQuery(event)`, the query-string counterpart of `parseJsonBody`.
  It gives the object that `validate(CalendarQuery, …)` checks. A missing query string is `{}`, so
  the schema answers 400 for the missing fields. An unknown parameter is a 400 (`.strict()`). A
  repeated parameter arrives from API Gateway joined with commas and fails the date format. Test
  that.
- `backend/src/lib/calendarDb.ts`, the reads of one view (consistent; no lock):
  - the settings (for R-SLOT-03 and `cancellableUntil`), every type (window and appointment type
    names), every pattern;
  - overrides `SK BETWEEN from AND to`, one-off windows `SK BETWEEN from AND to#~`;
  - appointments that start on the dates of the range. **Bound them exactly.** The range starts at
    `toInstant(from, '00:00')` and ends at `toInstant(addDays(to, 1), '00:00')`, the next local
    midnight, which is exclusive. 13.2 writes the upper bound as `<rangeEnd>~`, which would include
    an appointment starting exactly at that midnight, on the day after `to`. Use the exclusive
    bound, or filter by `date` in code, and say which;
  - `queryPartition` grows an upper bound (`BETWEEN`) and stays the one helper;
  - the **appointment item** of 13.2 and 8.1 is read here for the first time (step 48 writes it).
    Map it in `calendarDb` only, with every field of 8.1. Ownership is `userId` (the Cognito `sub`),
    never `username`: a deleted username can be given to a new User. The `Appointment` of 11.5 has
    no `userId`. `typeName` is the type's current name, or `typeNameAtBooking` once the type is
    gone. Write down the item's attribute names in architecture 5.3, so step 48 writes exactly
    these.
- Building the view is pure: put it with the rules (`calendarRules.ts`, spec 14.2 "the
  server-side checks of sections 6–9"), for example
  `calendarView({ from, to, now, zone, role, callerSub, settings, types, patterns, overrides, oneOffs, appointments })`.
  If you split it into its own module instead, say why. It returns:
  - `days`, one per date `from..to`. For each: `weekday`; `windows`, the **defined** windows
    (`definedWindows` → `toInstantWindows`, sorted, not merged, T11), with `typeName`, plus `source`
    and `sourceId` for the Administrator only; `slots`; `busy`; `hasOverride` for the Administrator
    only (also `true` for an override with no windows). A field that is "admin only" is **absent**
    for a User, not `null` or `false`;
  - `slots`: from the **effective** windows (`effectiveWindows`, merged, 6.6) through `slotsOf`,
    minus every slot that overlaps an active (`booked`) appointment, the caller's own included
    (R-SLOT-02). For a User also R-SLOT-03: `start > now`, `start − now ≥ minBookingNoticeHours`,
    `localDateOf(start) ≤ today + bookingHorizonDays`. For the Administrator R-SLOT-04: `start > now`
    only. A past date therefore has windows and no slots (R-VIEW-03);
  - `busy`: for a User, the other Users' booked appointments of that day as `{ start, end }`
    intervals, sorted, with nothing else (AC-12, section 17). For the Administrator, `[]`;
  - `appointments`: the booked appointments starting in the range, sorted by start: all of them for
    the Administrator, the caller's own (by `userId`) for a User, as `Appointment` (11.5), with
    `cancellableUntil` for a User and `null` for the Administrator. "Active" means `status = booked`,
    including one that has already ended. Say so in architecture section 4;
  - `timeZone`, `from`, `to`, `generatedAt` (= now).
- Handler `getCalendar.ts` (admin, user): `CalendarQuery` through `validate(parseQuery(event))`.
  One log line with `from` and `to`, never the appointments, usernames or the note.
- Integration: the view journeys in `calendar.test.ts`, after the pattern journeys.
- Documents, the step-46 rows of the plan's table:
  - `docs/ARCHITECTURE.md`:
    - section 2 (diagram and 2.1: the function);
    - section 3 (who can call, and what each role sees);
    - section 4 (route 15, its error codes, the `CalendarView` shape with what is admin only, how
      slots are chosen per role, `busy`, the appointments array);
    - 5.3 (the range reads, the appointment item's attributes);
    - 7.1 (the role);
    - the step 46 sentence in the v12 entry;
  - `CLAUDE.md` folder map (the handler, `parseQuery`, the view in `calendarRules.ts`);
  - the plan's status line.

Not in this step: any write of appointments (step 48), overrides and one-off windows routes (step
47), `GET /calendar/appointments` (step 49), `CalendarBookPolicy`, `deleteUser`, the users
`dave`/`erin`, and anything in `shared/` or `frontend/`. If `shared/` turns out to need a change (for
example a type in `types.ts`), stop and say why.

### Tests

- Unit (`aws-sdk-client-mock`, fake clock with `vi.setSystemTime`):
  - the view, pure: the corrected 11.6 example **byte for byte**, clock at `2026-11-10T09:00Z`,
    User `alice`. The same day for the Administrator: sources, `sourceId`, `hasOverride`, no
    `busy`, every appointment with its username, `cancellableUntil: null`, slots that ignore notice
    and horizon. A past date: windows, no slots. Slots with
    `minBookingNoticeHours` and `bookingHorizonDays` at their edges: exactly at the notice, one
    hour short, the last day of the horizon, the day after. A slot partly taken by the
    Administrator's 10:00–10:30 (R-SLOT-05). A cancelled appointment: not busy, not listed, its slot
    free. Merged windows (AC-08: pattern 08:00–12:00 plus one-off 12:00–13:00 of the same type gives
    the 12:00 slot). An override with no windows (`hasOverride: true`, no windows). AC-35 (2027-03-28:
    slots 01:00 and 03:00 local, each 60 real minutes). The fall-back night (2026-10-25, four slots).
    A window of a deleted type on a past date (your proposal). An appointment starting exactly at
    the next local midnight, not in the range. A range across the DST change, whose day boundaries
    are local midnights;
  - `calendarDb`: the exact queries (keys, `ConsistentRead`, `BETWEEN` bounds for a range in
    November and one across 2027-03-28), paging, the appointment mapping (every field of 8.1,
    `typeName` from the current type or the snapshot, no `userId` in the result);
  - `parseQuery`: no query string, an unknown parameter, a repeated one;
  - handler: both roles, a token in neither group (403), AC-33 (`from=2026-11-01&to=2026-12-15`
    is 400), `from > to`, an invalid date, a missing parameter, an unknown one, the invalid-zone 500,
    and the log line with `from` and `to` and without any appointment data (assert that no other
    User's username or note reaches a User's response or the log).
- Journeys (`calendar.test.ts`, after the pattern journeys). Dates come from the real today,
  computed with the shared helpers (`localDateOf`, `weekdayOf`, `addDays`, `toInstant`), never with
  fixed offsets:
  - AC-04: a pattern Monday 08:00–12:00 at a fresh Studio type, from a past Monday, no end. The view
    of "the next Monday at least 8 days ahead", as alice: one window `toInstant(D, '08:00')` to
    `toInstant(D, '12:00')`, slots at 08, 09, 10, 11 local. Alice's view has no `source`, no
    `sourceId` and no `hasOverride`; the Administrator's view of the same day has them. Mind the
    leftover Monday 07:00–08:00 `GYM` pattern: it is a second window, which touches and does not
    merge (another type);
  - AC-33: `from=2026-11-01&to=2026-12-15` is 400 `invalid_request`; also `from > to`, a missing
    `to`, an unknown parameter, and a User and the Administrator both allowed;
  - AC-35: the next spring-forward Sunday in the calendar zone, found with the helpers (a date where
    local 01:00 and 03:00 are one real hour apart), a pattern Sunday 01:00–04:00 valid on it, the
    Administrator's view: slots at local 01:00 and 03:00, each exactly 60 real minutes. Its date
    lies beyond the 30-day horizon the settings journeys left, so alice's view has the window and
    no slots. Assert that too: it is R-SLOT-03 end to end;
  - they must pass twice in a row.

## How we work in this step

- **Restarts**: after the template change, `local:api` must restart (CLAUDE.md). Ask me; do not
  start or stop the stack yourself. `local:up` is not needed unless you change `local-seed.sh`.
- **Hard rules**: 100 % lines on `backend/src/lib`; strict TypeScript; ESLint clean; no new
  dependency; no wildcard action or resource; no AWS command and no deploy. A User's response never
  carries another User's username, appointment id or note, and logs never carry appointment data.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 46)

- The three spec points presented. The corrected 11.6 example approved before its byte-for-byte
  test is written.
- `npm run test:unit -w backend` green, 100 % lines on `backend/src/lib`, with the cases above.
- Journeys: AC-04, AC-33, AC-35 (and the User side of AC-35); the settings, type and pattern journeys
  still green. They pass twice in a row.
- `grep` of the three managed policies shows no `*` in any action or resource; `GetCalendarRole` has
  `CalendarReadPolicy` only.
- `sam validate --lint`; root `npm run typecheck`, `npm run lint`, `npm run test:unit` green.
- The root `DYNAMODB_PORT=8002 npm run verify` green.

Report each result, including anything you could not run, then stop for review. Do not start
step 47. Commit only when I ask. Do not push and do not deploy.
