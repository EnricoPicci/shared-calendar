## Brief

Implement plan step 54, "Front end: `CalendarService` and `AppointmentsService`", the fourteenth
step of the shared calendar and the second one in `frontend/`, following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review. One stop at the
end. The design points are already decided (see "Design points (decided 2026-11-15)"): there is no
early stop for them.

This step adds no route, no function and no table item type, and changes nothing in `backend/` or
`shared/`. It adds two services, `CalendarService` (`docs/SHARED_CALENDAR_SPEC.md` section 11.1,
route 15) and `AppointmentsService` (`docs/SHARED_CALENDAR_SPEC.md` section 11.1, routes 16–20),
and the remaining journeys in `frontend/tests/integration/calendar.test.ts`. Every existing service
keeps its behaviour, its streams and its tests unchanged. With this step the services layer is
complete: `docs/IMPLEMENTATION_PLAN.md` step 54 is a checkpoint.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section: every reference to the documentation names its document by path, no
    history tags, and the "Test names:" comment above an outermost `describe` whose test names
    hold a reference. `npm run lint` enforces it, so `verify` does too;
  - the folder map's `frontend/` entry;
  - the front-end test conventions: subscribe first, then call; fake `setInterval` with the timers;
    the 24.8-day limit; the ESLint import rule;
  - the integration notes: files run one at a time, never at the same time as the back end's;
    `calendar.test.ts` never resets the local `calendar` table.
- `docs/FRONTEND_SERVICES.md` v6, all of it, in particular:
  - the rules (section 2) and the service pattern (section 3);
  - `api.ts` and its mapping table (section 10.2);
  - the three step-53 services, the shape this step copies: sections 15, 16 and 17;
  - the calendar journeys (section 14.4);
  - the decisions table (section 8): decisions 23, 24 and 29–37 are the conventions this step
    follows.
- `docs/SHARED_CALENDAR_SPEC.md` v15:
  - section 16 (16.2 the services table, 16.3 behaviour, 16.4 validation, 16.6 unit tests, 16.7
    journeys, 16.8 the future views);
  - the parts it rests on: section 8 (8.1 data, 8.2 booking, 8.3 cancel, 8.4 change, 8.5 note,
    8.6 listing);
  - section 11: 11.1 routes 15–20 and the notes under the table, 11.2 the query parameters, 11.5
    and 11.6 the response types;
  - section 6.7 (`availability_conflict`) and R-TYPE-03 (what blocks deleting a type);
  - section 18.2 (what the journeys may do to the local calendar).
- `docs/ARCHITECTURE.md` section 4: the calendar routes as implemented. It governs where it
  describes a route (`docs/FRONTEND_SERVICES.md` section 8, decision 32). Compare its error codes
  for routes 15–20 with `docs/SHARED_CALENDAR_SPEC.md` section 11.1 and report any difference.
- `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar": the conventions under "How these steps
  are run", step 53 and step 54.

Then read the code this step builds on:
- `frontend/src/services/`:
  - `api.ts` (`apiCall`, `query`, `conflicts`, `invalidRequest`, `unexpectedAnswer`, `hasString`);
  - the three step-53 services and their `.types.ts` (one result/state pair per method, `pending`
    with the call's arguments, validation before sending, the success checks);
  - `users.service.ts` (a delete success carrying its argument), `session.store.ts`.
- `frontend/tests/unit/services/`: `suite.ts` (`describeMethod`, the unit tests every API method
  gets), `fixtures.ts`, `availability-rules.service.test.ts`.
- `frontend/tests/integration/`: `local.ts` (`outcome()`), `calendar.test.ts` (the free-date
  search, `cleanUp()`, `removeUser()`, the settings write-back with
  `fe-calendar-settings.local.json`).
- `shared/src/calendar/schemas.ts`: `CalendarQuery`, `AppointmentsQuery`, `BookBody`, `ChangeBody`,
  `NoteBody`, `AppointmentIdParam`.
- `shared/src/calendar/types.ts`: `CalendarView`, `Appointment`, `ListAppointmentsResponse`,
  `ChangeAppointmentResponse`.
- `shared/src/api.ts`: `ApiErrorCode`, `AppointmentConflict`.

## Where we are (2026-11-15)

- Steps 41–53 are done and committed. After them come `e938c10` (timing error codes renamed, spec
  v15) and `acb7ae0` (the comment rule, brief 55). Check `git status -sb` rather than trusting this
  line: at the time of writing, `main` was one commit ahead of `origin` (`acb7ae0`).
- The back end has all 21 calendar routes. `frontend/` has `api.ts` with `GET`/`PUT`/`PATCH`,
  `query` and `conflicts`, and the services for routes 1–14 and 21. `docs/FRONTEND_SERVICES.md` is
  v6. The CORS gap (`docs/FRONTEND_SERVICES.md` section 10.3) is still open: the services are
  proven in Node, not in a browser.
- The local `calendar` table holds whatever the last back-end journeys, smoke runs and front-end
  journeys left, including:
  - the smoke test's cancelled appointments at 03:00 local about 50 days ahead;
  - deleted-user markers;
  - settings at the back-end journeys' values (`bookingHorizonDays` 30).
  The new journeys must work on top of that, and on top of a table that a failed earlier
  front-end run left half-cleaned.
- In the agent's non-interactive shell, run `source ~/.nvm/nvm.sh && nvm use` if `node -v` is not
  22. DynamoDB Local is on port 8002 here; check `docker ps` before passing `DYNAMODB_PORT`.

## Design points (decided 2026-11-15)

Apply them as written; do not re-open them. If the code proves one of them wrong, stop and say so
with a proposal. Points 1 and 2 follow from `docs/FRONTEND_SERVICES.md` section 8, decision 31.
Points 3–6 were decided with the user.

1. **`pending`.** It carries every argument of the call, under the API contract's names:
   - `load(from, to)` → `{ from, to }`; `reload()` → the `{ from, to }` it reloads;
   - `list(query)` → `{ query }`;
   - `book(booking)` → `{ booking }`;
   - `cancel(appointmentId)` → `{ appointmentId }`;
   - `change(appointmentId, change)` → `{ appointmentId, change }`;
   - `updateNote(appointmentId, note)` → `{ appointmentId, note }`.

   `cancelState$` and `changeState$` carrying the id is also what
   `docs/SHARED_CALENDAR_SPEC.md` section 16.3 asks.
2. **Success values and checks** (`docs/FRONTEND_SERVICES.md` section 8, decision 34). Success
   values:
   - `{ status: 'success', calendar }`;
   - `{ … appointments }`;
   - `{ … appointment }` (book, cancel, note);
   - `{ … cancelled, booked }` (change).

   Checked by hand, as the step-53 services do:
   - the expected status (200 or 201);
   - the top-level shape: an object; `days` and `appointments` arrays in the view; the array
     under `appointments` in the list; both objects in a change;
   - the ids: `timeZone`, `from` and `to` for the view; `appointmentId` for an appointment and for
     each listed element; both `appointmentId`s for a change.

   The rest is trusted to the contract; anything else is `unexpected`.
3. **Stream names: `docs/FRONTEND_SERVICES.md` section 8, decision 31 wins over
   `docs/SHARED_CALENDAR_SPEC.md` section 16.2.**
   - `CalendarService`: `calendarResult$`/`calendarState$`, shared by `load` and `reload`.
   - `AppointmentsService`:
     - `appointmentsResult$`/`appointmentsState$` for `list` (a load is named after what it loads;
       the spec says `listResult$`);
     - `bookResult$`/`bookState$`, `cancelResult$`/`cancelState$`, `changeResult$`/`changeState$`;
     - `updateNoteResult$`/`updateNoteState$` for `updateNote` (the spec says `noteResult$`).

   Report the two differences in the step's report and in `docs/FRONTEND_SERVICES.md`. The spec
   is not edited for them.
4. **`reload()`** re-runs the last `load` with the `from` and `to` that load was given (whether
   that load succeeded or not). Before any `load` it answers `invalid_request` ("nothing loaded
   yet") with no request sent, through idle → pending → failure like every other call
   (`docs/FRONTEND_SERVICES.md` section 8, decision 23). `load` and `reload` share one pending
   call: a new one of either cancels the other.
5. **Validation before sending: the shared schemas only** (`docs/FRONTEND_SERVICES.md` section 8,
   decision 33).
   - The schemas: `CalendarQuery`, `AppointmentsQuery`, `BookBody`, `ChangeBody`, `NoteBody` +
     `AppointmentIdParam`; the path first, then the body.
   - What is sent is zod's parsed output, for example `status=booked` added by
     `AppointmentsQuery`'s default, or the trimmed note.
   - The service does **not** check what depends on the caller's role, though the session knows it:
     a User's whole-hour times, or the Administrator's missing `username`. The API answers those
     with `invalid_request`, a route code.
   - Nor does it check what only the server knows: notice, horizon, availability, taken slots,
     limits, ownership.
6. **The journeys get past the booking horizon by setting the settings for the run.**
   - The appointment blocks need a User to book about a year ahead (the band from today + 330
     days, `docs/FRONTEND_SERVICES.md` section 8, decision 35).
   - So they read the settings, then set `bookingHorizonDays` 365, `minBookingNoticeHours` 0 and
     `maxFutureAppointmentsPerUser` null. `cancellationNoticeHours` keeps the value read: the
     update body needs all four, and a notice of at most 720 hours cannot block a cancel 330 days
     ahead.
   - They write the values read back afterwards, with the same protection as the settings block:
     the `fe-calendar-settings.local.json` repair file and the write-back in `afterAll`.
   - `fe-calendar` then books, changes and cancels as a real User would.

## The step

Only what `docs/IMPLEMENTATION_PLAN.md` step 54 lists.

- **`frontend/src/services/calendar.service.ts` / `calendar.types.ts`:** `load(from, to)` and
  `reload()`, as settled in points 1–5. The view is served to both roles; the role differences
  (`docs/SHARED_CALENDAR_SPEC.md` section 11.6) are the server's, and the success carries the
  `CalendarView` as received.
- **`frontend/src/services/appointments.service.ts` / `appointments.types.ts`:** `list`, `book`,
  `cancel`, `change`, `updateNote`, one result/state pair per method, as settled in points 1–5.
  - Error codes per route: those of `docs/ARCHITECTURE.md` section 4.
  - `concurrent_update` is a normal reason (`docs/SHARED_CALENDAR_SPEC.md` section 16.3).
  - `user_not_found` is one reason for both of its 404s on routes 17 and 20 (unknown target,
    deleted User).
  - A new call of a method cancels that method's pending call only.
- **Unit tests** in `frontend/tests/unit/services/`, mirroring `src/`, with `describeMethod` from
  `suite.ts` (`docs/SHARED_CALENDAR_SPEC.md` section 16.6). Per method:
  - success, and the request shape (method, path, query, body);
  - every route error code, `session_rejected` and `not_signed_in`;
  - `invalid_request` with no request sent;
  - network failure then success;
  - a new call cancels the same method's pending call and no other method's;
  - a late subscriber.

  Plus `reload()` before any `load`, `reload()` after a failed `load`, and `load` cancelling a
  pending `reload`. 100 % line coverage on `frontend/src`.
- **`frontend/tests/integration/calendar.test.ts`: the remaining journeys** of
  `docs/IMPLEMENTATION_PLAN.md` step 54, on the dates and types the file owns:
  - load a week (the Administrator's view and `fe-calendar`'s: windows, slots, the User's own
    appointments, `busy` without names);
  - book a free slot (as `fe-calendar`, and by the Administrator for `fe-calendar`);
  - `slot_taken`; edit the note; change; cancel;
  - `upcoming` (the User's list, and the Administrator's with `username=fe-calendar`);
  - an override refused with `availability_conflict` that exposes `conflicts` naming the booked
    appointment. This is the end-to-end proof that step 53 left for this step.

  Rules for the file:
  - **Clean-up order:** `removeUser()` must come **before** `cleanUp()`, in `afterAll` too, where
    it comes after today. A booked appointment blocks deleting its pattern (`availability_conflict`)
    and its type (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-03); deleting `fe-calendar` cancels its
    future appointments first (`docs/ARCHITECTURE.md` section 4, `DELETE /users/{username}`).
  - **What stays behind:** appointments cannot be deleted through the API. The cancelled ones,
    their events and `fe-calendar`'s deleted-user markers stay in the local table as history, as
    the smoke test's do. Say so in `docs/FRONTEND_SERVICES.md` section 14.4 and in `CLAUDE.md`.
  - Every block prepares its own state; the file does not rely on the order of the blocks or of
    the files.
- **Documents:**
  - `docs/FRONTEND_SERVICES.md` v7:
    - new sections **18** `CalendarService` and **19** `AppointmentsService`, in the shape of
      sections 15–17;
    - section 14.4 extended with the new blocks, the clean-up order and what stays behind;
    - new decisions from 38 (the design points above, the two naming differences from
      `docs/SHARED_CALENDAR_SPEC.md` section 16.2 included);
    - the change-log row and the status line ("services layer complete").
  - `docs/SHARED_CALENDAR_SPEC.md`: unchanged unless a finding requires a change. Then stop first
    (see "How we work").
  - `CLAUDE.md`:
    - the `frontend/` entry of the folder map (the two services);
    - the `test:integration -w frontend` line (the appointments, the temporary settings, what
      stays in the local table);
    - the services listed under "Calendar services".
  - The plan's status line.

Not in this step:
- any view, framework, Vite, `index.html`, `template.yaml` or `dist/` in `frontend/` (they wait for
  `docs/FRONTEND_ARCHITECTURE.md`). The CORS gap stays open.
- anything in `backend/` or `shared/`. If a point needs a change there (a missing schema, an error
  code, a response type), stop and say why first.
- a new dependency or a new allowed import in `eslint.config.js` (a design change: CLAUDE.md).
- the cloud: no deploy, no AWS command (`docs/IMPLEMENTATION_PLAN.md` step 55 needs its own
  instruction).

### Tests

- **Unit:** as listed above. `npm run verify -w frontend` green (typecheck, lint with the comment
  rule, unit tests with 100 % line coverage on `frontend/src`). The existing tests keep passing
  unchanged; if one must change, say which and why.
- **Integration, three normal runs:**
  - `RUN_INTEGRATION=1 npm run test:integration -w frontend` green **twice in a row**, the second
    right after the first. This proves the clean-up and the reruns.
  - Then once more after the back-end journeys:
    `RUN_INTEGRATION=1 DYNAMODB_PORT=8002 npm run test:integration -w backend` first, then the
    front end's, never at the same time.
- **After the runs**, show what the journeys left in the calendar, read through the API or
  DynamoDB Local:
  - no `fe-calendar` type, pattern, override or window;
  - no booked appointment of `fe-calendar`;
  - the settings equal to what they were before the run;
  - only the history named above.
- **A forced failure:** one run that fails in the middle of an appointment block, with the
  settings changed and an appointment booked, then a normal run that passes. This proves that a
  failed run can be repeated. Say how you force the failure without editing the committed test,
  for example a temporary copy in the scratchpad, or an environment variable that only that run
  sets.

## How we work in this step

- **Restarts:** none should be needed (no function changes). If `local:api` or `local:up` must be
  restarted, ask me; do not start or stop the stack yourself.
- **Hard rules:**
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token in any result, state or service field (`docs/FRONTEND_SERVICES.md` section 2,
    rule 9); nothing logged, and notes and usernames are personal data
    (`docs/SHARED_CALENDAR_SPEC.md` section 16.5);
  - a service never errors or completes its subjects: `next` only
    (`docs/FRONTEND_SERVICES.md` section 3.2);
  - the journeys never reset the calendar table, never delete or change anything they did not
    create (the settings are written back), and remove `fe-calendar` on every run;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When the spec, the plan, the architecture or `docs/FRONTEND_SERVICES.md` disagree, or one is
  unclear**, stop and tell me, with a proposed change. Do not edit any of them silently.

## Acceptance (`docs/IMPLEMENTATION_PLAN.md` step 54)

- The decided design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green with 100 % line coverage on `frontend/src`.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend`:
  - green twice in a row, and again after the back-end journeys;
  - the forced-failure run followed by a passing run;
  - nothing of the journeys left in the calendar but the named history, and the settings as before.
- The root `DYNAMODB_PORT=8002 npm run verify` green (back end unchanged, front end included).
- `docs/FRONTEND_SERVICES.md` v7, `CLAUDE.md` and the plan's status line updated.

Report each result, including anything you could not run, then stop for review. This is a
checkpoint (the services layer is complete): suggest the commit, but commit only when I ask. Do not
push and do not deploy. Do not start step 55.
