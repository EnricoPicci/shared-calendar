## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use                                                      # Node 22; the shell default is newer
```

No AWS login is needed: this step does not touch the cloud. The local stack is needed during the
step: `npm run local:up -w backend` (if it is not up) and `npm run local:api -w backend`. The agent
will ask you to restart `local:api` once the four new functions exist. Ctrl-C removes the Lambda
containers `sam local` leaves behind, so a restart needs nothing else. Tell the agent which
`DYNAMODB_PORT` the stack uses (8000 by default, 8002 if another project holds 8000).

## Brief

Implement plan step 47, "Date overrides and one-off windows", the seventh step of the shared
calendar, following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report,
then stop for review. One stop at the end, **plus an early stop for the spec points below** (see
"Spec points this step must settle"): present them before writing the delete handlers.

Read first, in full: `CLAUDE.md`; `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built" with its row-by-row table, and step 47 itself); then
`docs/SHARED_CALENDAR_SPEC.md` v7 sections 4 (who does what), 5 (R-TIME-03, R-TIME-04), 6.3
(R-OVR-01..03), 6.4 (R-ONE-01..03), 6.5 (all of it, with the table of writes and R-AV-02), 6.6, 6.7
(R-AV-03..05), 6.1 R-TYPE-03 and R-TYPE-04, 11.1 routes 11–14 with their error codes, 11.2 `date` and
`windowId`, 11.3, 11.4 `WindowBody`, `OverrideBody`, `OneOffWindowBody`, 11.5 `DateOverride` and
`OneOffWindow`, 13.2 (the `OVERRIDE` and `WINDOW` items and their range access patterns), 13.4 (the
lock), 14 (all of it), 17, 18.3 AC-04 and AC-06..AC-09, AC-36, and 22; then `docs/ARCHITECTURE.md`
sections 2, 3, 4, 5.3, 6.6, 7.1 and the v12 change-log entry.

Then the code this step copies, from steps 43–46 (last commits `ec83f73` and `3eaeb3f`):
`backend/template.yaml` (`CreatePatternFunction` and `DeletePatternFunction` with their log groups
and roles: the write block and the delete block), `backend/src/lib/calendarDb.ts`
(`withCalendarLock`, `readState`, `createPattern`, `updatePattern`, `deletePattern`, `toOverride`,
`toOneOff`, `idOf`), `backend/src/lib/calendarRules.ts` (`checkAvailabilityWrite` and
`AvailabilityWrite`, whose `override` and `one_off` kinds exist since step 45 but have no route yet),
`backend/src/lib/http.ts` and `validation.ts`, the handlers `createPattern.ts`, `updatePattern.ts`
and `deletePattern.ts` with their unit tests, `backend/tests/unit/handlers/patternFixtures.ts`,
`backend/tests/integration/setup.ts` and `calendar.test.ts` (the view journeys of step 46 are the
ones this step builds on). From `shared/`: `OverrideBody`, `OneOffWindowBody`, `WindowBody`,
`DateParam`, `WindowIdParam` in `calendar/schemas.ts`; `DateOverride`, `OneOffWindow` in
`calendar/types.ts`; `CALENDAR_LIMITS` in `calendar/defaults.ts`; `localDateOf`, `addDays`,
`weekdayOf`, `toInstant` in `calendar/time.ts`.

## Where we are (2026-11-13)

- Steps 41–46 are done and committed (`ec83f73` is step 46, spec v7; `3eaeb3f` adds the front end's
  `test:integration` script). Check `git status -sb` for the push state rather than assuming it.
- The shape steps 43–46 set, to keep unless this step proves it wrong (then say so):
  - handler order: claims → `calendarConfig()` (500 for everyone if the zone is broken) → role →
    path parameters → body → `calendarDb` with the `calendarRules` check → one log line (`done()`);
  - every write takes the calendar lock (`withCalendarLock`) and runs its check on the state read
    **inside** the locked attempt (`readState`), so a retry re-reads and re-checks;
  - every `Query` goes through `queryPartition` (consistent, follows `LastEvaluatedKey`, optional
    `BETWEEN` upper bound since step 46);
  - `calendarDb.ts` is the only module that knows the item layout; `calendarRules.ts` holds the pure
    rules (no AWS; "today", "now" and the zone passed in);
  - `now` once per request, "today" = `localDateOf(now, timeZone)`;
  - `availability_conflict` carries `conflicts`, which only the Administrator receives and which is
    never logged; the handlers log `conflictCount`;
  - handler unit tests reload the module per test (`vi.resetModules()`).
- What the journeys leave behind. `calendar.test.ts` resets the table at its start; the journeys run
  in order. When the step 47 journeys start: settings `minBookingNoticeHours 2`,
  `bookingHorizonDays 30`; types `GYM` (`ids.pool`) and the view's `Studio` (`ids.viewStudio`);
  patterns Monday 07:00–08:00 `GYM` from 2026-11-01 and Monday 08:00–12:00 `Studio` from a past
  Monday (both no end, together AC-04's shape plus a touching window of another type), and Sunday
  01:00–04:00 `Studio` on the next spring-forward Sunday only. No override, no one-off window, no
  appointment. The step 47 journeys may build on this state but must say so in a comment, and may
  create their own types and patterns.
- In the agent's non-interactive shell the default Node is 24: run
  `source /usr/local/share/nvm/nvm.sh && nvm use` before running tests.
- Spec proposals still open: the appointment-list query and `upcoming` with `status` (both step 49).

## Spec points this step must settle

Present each with a proposed change. Do not edit the spec until I approve.

1. **Deleting a one-off window dated in the past.** Route 12 (delete an override) lists
   `409 date_in_past`; route 14 (delete a one-off window) does not. R-AV-02 says one-off windows
   cannot be *dated* in the past, but says nothing about deleting one that has become past. The
   locked attempt's state reads one-off windows from today on only (`SK ≥ today`), so as the code
   stands a past window would answer `404 window_not_found`, which is misleading: the window exists
   and the view shows it (R-VIEW-03). Propose one behaviour (`409 date_in_past`, as for overrides,
   or allowed) and how the window is found by its id (the `SK` is `<date>#<windowId>` and there is
   no pointer item: a query of the whole `WINDOW` partition matched on the id, or a new access
   pattern). Note what the choice means for history (A3) and for R-TYPE-03.
2. **The order of an override's windows.** `OverrideBody` accepts the windows in any order. The
   spec says nothing about the order in which they are stored and answered in `DateOverride`.
   Propose one (for example sorted by start, as the view sorts), and say whether two windows of the
   body that overlap each other are `409 availability_overlap` (6.5 row "set an override") rather
   than `400`, with the message format of the pattern overlap.
3. **What the override and one-off window items store.** 13.2 stores `updatedBy` on an override
   and `createdBy` on a one-off window; `DateOverride` and `OneOffWindow` (11.5) do not return them.
   Confirm that they are stored and never answered, and write every attribute name of both items
   into architecture 5.3 (as step 46 did for the appointment). If anything else is unclear in these
   items, say so here.

Anything else you find unclear or contradictory while reading: stop and tell me, with a proposal.

## The step

Only what step 47 lists.

- `backend/template.yaml`: four functions, handler and log-group names as spec 14.1:
  - `SetOverrideFunction` (`PUT /calendar/overrides/{date}`), `CalendarReadPolicy` +
    `CalendarWritePolicy`, copied from `CreatePattern`;
  - `DeleteOverrideFunction` (`DELETE /calendar/overrides/{date}`), `CalendarReadPolicy` +
    `CalendarDeletePolicy`, copied from `DeletePattern`;
  - `CreateOneOffWindowFunction` (`POST /calendar/windows`), read + write;
  - `DeleteOneOffWindowFunction` (`DELETE /calendar/windows/{windowId}`), read + delete.
  All admin only. Check against spec 14.1's action list for each route; if a policy grants an action
  the route does not use, say so as step 43 did (architecture 7.1).
- `backend/src/lib/calendarDb.ts`, under the lock, each with the `check` callback of the pattern
  writes:
  - `setOverride(date, windows, by, now, check)`: `Put` of the whole `OVERRIDE` item (create or
    replace, R-OVR-02); answers the `DateOverride`;
  - `deleteOverride(date, by, now, check)`: `404 override_not_found` when the date has none,
    otherwise `Delete`; the patterns apply again (R-OVR-02);
  - `createOneOffWindow(window, by, now, check)`: a new ULID, `Put` of the `WINDOW` item with `SK`
    `<date>#<windowId>`; answers the `OneOffWindow`;
  - `deleteOneOffWindow(windowId, now, check)`: `404 window_not_found` for an unknown id, otherwise
    `Delete` (and the past-date case of point 1).
  The check is `checkAvailabilityWrite` with the `override` or `one_off` write (value `null` for a
  delete). `date_in_past` (date < today; today is accepted) is checked **before** the lock, from the
  path or body alone, as it needs no data; say so in the handler. `limit_reached` for an 11th one-off
  window on a date comes from `checkAvailabilityWrite`; an override with 11 windows is a `400` from
  `OverrideBody`.
- Handlers `setOverride.ts`, `deleteOverride.ts`, `createOneOffWindow.ts`,
  `deleteOneOffWindow.ts` (admin only), the pattern handlers' shape: `DateParam` or `WindowIdParam`,
  then the body through `parseJsonBody` and `validate`. Success codes: `200` (set), `204` (both
  deletes), `201` (create). One log line each with `date` or `windowId`, the outcome and
  `conflictCount` on a conflict; never the windows' content beyond what the pattern handlers log,
  never `conflicts` (AC-36).
- Integration: the override and one-off window journeys in `calendar.test.ts`, after the view
  journeys, observed through `GET /calendar` (there is no list route, 11.1).
- Documents, the step-47 rows of the plan's table:
  - `docs/ARCHITECTURE.md`:
    - section 2 (diagram and 2.1: the four functions);
    - section 3 (who can call: admin only);
    - section 4 (routes 11–14, their error codes, the `DateOverride` and `OneOffWindow` shapes, the
      order of the checks, what is answered for a past date, what the view shows afterwards);
    - 5.3 (the `OVERRIDE` and `WINDOW` items with every attribute, now written; how a window is
      found by id);
    - 7.1 (the four roles);
    - the step 47 sentence in the v12 entry;
  - `CLAUDE.md` folder map (the four handlers, the new `calendarDb` writes) and the local-weight
    line if you measure it again (optional; 15 functions now);
  - the plan's status line.

Not in this step: any write of appointments (step 48), `GET /calendar/appointments` (step 49),
`CalendarBookPolicy`, `deleteUser`, the users `dave`/`erin`, and anything in `shared/` or
`frontend/`. If `shared/` turns out to need a change (for example a schema or a type), stop and say
why.

### Tests

- Unit (`aws-sdk-client-mock`, fake clock with `vi.setSystemTime`):
  - `calendarDb`: the exact transaction of each write (lock update first, then the `Put` or
    `Delete`, keys and attributes of 13.2 with `updatedBy`/`createdBy`), the reads inside the
    locked attempt, a retry that re-reads and re-checks, `override_not_found`, `window_not_found`,
    and the past-window case of point 1;
  - the rules, through the handlers or `checkAvailabilityWrite` (whichever covers them more
    directly; say which), with the exact dates of 18.3:
    - `date_in_past`: yesterday refused, today accepted, for set override, delete override and
      create one-off window (and delete one-off window per point 1);
    - limits: an override with 10 windows accepted and 11 refused (400); the 10th one-off window
      on a date accepted and the 11th `409 limit_reached`, while another date is not counted;
    - R-OVR-01 (an override replaces every pattern window of its date, an empty list closes the
      date; the other dates are unchanged), R-OVR-02 (setting again replaces; deleting brings the
      patterns back), R-OVR-03 and R-ONE-01 (a one-off window applies on a date with an override,
      also an empty one), R-ONE-02 (no update route: nothing to test beyond the absence of one),
      R-ONE-03;
    - overlap (6.5): an override's own windows among themselves (per point 2), an override against
      the one-off windows of its date, a one-off window against `base(D)` and the other one-off
      windows of D, deleting an override whose returning pattern window overlaps a one-off window;
      touching windows allowed, also of different types;
    - conflict (R-AV-03, R-AV-04): an override that shrinks or changes the type under a booked
      appointment that has not ended, an in-progress one included; deleting a one-off window that
      carries one; extending (a new one-off window, a longer override window) never conflicts; a
      cancelled or ended appointment never conflicts; `conflicts` sorted by start;
    - `type_not_found` (409) for an unknown `typeId` in either body;
  - handlers: admin only (a User and a token in neither group are 403), invalid `date` or
    `windowId` (400), invalid JSON and invalid bodies (400, also an unknown field), the
    invalid-zone 500, `concurrent_update` after three lost attempts, and the log line: `date` or
    `windowId`, `conflictCount`, no `conflicts`, no window content beyond the pattern handlers'.
- Journeys (`calendar.test.ts`, after the view journeys). Dates come from the real today, computed
  with the shared helpers (`localDateOf`, `weekdayOf`, `addDays`, `toInstant`), never with fixed
  offsets. D is "the next Monday at least 8 days ahead", as in the view journeys:
  - AC-06: override on D `[09:00–12:00 Studio]` is 200; the view of D shows that one window
    (`toInstant(D, '09:00')`–`toInstant(D, '12:00')`, `source: 'override'`, `sourceId` D,
    `hasOverride: true`) and no `GYM` window; D + 7 is unchanged;
  - AC-07: override on D + 7 `[]`; that Monday has no windows, `hasOverride: true` for the
    Administrator, no `hasOverride` for alice;
  - AC-08: on a Monday without override (D + 14), a one-off window 12:00–13:00 Studio; the view
    shows two windows (not merged) and the slot 11:00 **and** 12:00 local (the merged effective
    window 08:00–13:00);
  - AC-09: a one-off window 11:00–12:30 on a Monday with the patterns is 409
    `availability_overlap`, the message naming the date and both windows;
  - deleting the AC-06 override (204) brings the patterns back on D; deleting it again is 404
    `override_not_found`;
  - deleting an override whose returning pattern window would overlap a one-off window of that date
    is 409 `availability_overlap` (6.5, last row): an empty override on a Monday, a one-off window
    09:00–10:00 on it (allowed: the base is empty), then the delete;
  - a one-off window deleted (204) disappears from the view; an unknown id is 404
    `window_not_found`;
  - `date_in_past`: yesterday's override and one-off window are 409; today's are accepted (choose
    windows that cannot overlap today's patterns, and clean them up);
  - a User calling any of the four routes is 403;
  - they must pass twice in a row.

## How we work in this step

- **Restarts**: after the template change, `local:api` must restart (CLAUDE.md). Ask me; do not
  start or stop the stack yourself. `local:up` is not needed unless you change `local-seed.sh`.
- **Hard rules**: 100 % lines on `backend/src/lib`; strict TypeScript; ESLint clean; no new
  dependency; no wildcard action or resource; no AWS command and no deploy. `conflicts` reaches only
  the Administrator and never a log line.
- **When the spec, the plan or the architecture disagree, or the spec is unclear**, stop and tell
  me, with a proposed change. Do not edit the spec silently.

## Acceptance (plan step 47)

- The three spec points presented and decided before the delete handlers are written.
- `npm run test:unit -w backend` green, 100 % lines on `backend/src/lib`, with the cases above.
- Journeys: AC-06, AC-07, AC-08, AC-09, the override delete (patterns back, and the 409 overlap),
  the one-off delete; the settings, type, pattern and view journeys still green. They pass twice in
  a row: `RUN_INTEGRATION=1 npm run test:integration -w backend` (with the stack's `DYNAMODB_PORT`).
- The front-end journeys still green: `RUN_INTEGRATION=1 npm run test:integration -w frontend`,
  run after the back end's, never at the same time.
- `grep` of the three managed policies shows no `*` in any action or resource; each new role has
  exactly the policies listed above.
- `sam validate --lint`; root `npm run typecheck`, `npm run lint`, `npm run test:unit` green.
- The root `npm run verify` green (with the stack's `DYNAMODB_PORT`).

Plan checkpoint: after this step availability is complete (plan, "Availability complete"). Report
each result, including anything you could not run, then stop for review. Do not start step 48.
Commit only when I ask. Do not push and do not deploy.
