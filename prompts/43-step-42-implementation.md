## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
```

No AWS login is needed: this step does not touch the cloud.

## Brief

Implement plan step 42, "Shared: contract and rules", the second step of the shared calendar,
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop
for review.

Read first, in full: `CLAUDE.md`, `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built", and step 42 itself), then `docs/SHARED_CALENDAR_SPEC.md` v3 sections
5 (time model), 6 (availability, all of it), 7 (slots), 8.1 (appointment data), R-BOOK-02 in 8.2
(which time checks depend on the role), 8.3 (R-CAN-03, for `cancellableUntil`), 9 (settings
ranges), 11 (the API contract, all of it), 12 (shared contract), 15.2 (events, for
`CalendarEventType`) and the acceptance scenarios AC-04, AC-08, AC-33 and AC-35 in 18.3. Then
`shared/src/` and `shared/tests/` as step 41 left them, `frontend/src/services/api.ts`,
`hello.types.ts` and `users.types.ts` (how the front end narrows `ApiErrorCode`),
`backend/src/lib/http.ts` (how the back end uses it), and the v12 entry of the change log of
`docs/ARCHITECTURE.md`.

## Where we are (2026-11-12)

- Step 41 is done and committed (`5b2633c`, not pushed): `shared/src/calendar/` holds `time.ts`
  (`toInstant`, `localDateOf`, `localTimeOf`, `weekdayOf`, `addDays`, `isValidTimeZone`),
  `schemas.ts` (the primitives `LocalDate`, `LocalTime`, `LocalEndTime`, `Weekday`, `Instant`,
  `Ulid`, `Note`, `TypeName`) and `defaults.ts` (`DEFAULT_TIME_ZONE`, `DEFAULT_SETTINGS`,
  `CALENDAR_LIMITS`). Reuse them; do not restate them.
- The spec is v3: text lengths are counted in UTF-16 code units (11.4). The schemas check
  `s.length` themselves, because zod 4.6.7's `.min()`/`.max()` on strings count code points. Any
  new length check follows the same rule.
- The architecture's v12 is open with the governance rule; it names the spec without a version.
- Nothing after `36798a5` is pushed.

## Scope of this step

Only what step 42 lists:

- `shared/src/api.ts`: the 20 error codes of 11.3, `AppointmentConflict`, the optional
  `conflicts` field of `ApiErrorBody`, `UserSummary`, `ListUsersResponse`.
- `shared/src/calendar/types.ts`: the response types of 11.5 and 11.6 (`CalendarSettings`,
  `AvailabilityType`, `WeeklyPattern`, `DateOverride`, `OneOffWindow`, `Appointment`,
  `CalendarView`, `CalendarDay`, `CalendarWindow`, `Slot`, `Interval`), `Actor` and
  `CalendarEventType` (the four `appointment.*` types of section 8).
- `shared/src/calendar/schemas.ts`: the bodies of 11.4 and the path and query parameters of 11.2,
  `.strict()`, with the cross-field rules (`start < end`, `validFrom ≤ validUntil`, `from ≤ to`,
  span ≤ 31 days for `GET /calendar` and ≤ 92 days for the appointment list, `upcoming`
  exclusive with `from`/`to`).
- `shared/src/calendar/rules.ts`: `definedWindows(date, patterns, override, oneOffs)`,
  `effectiveWindows`, `slotsOf(window)`, `overlaps(a, b)`, `isWholeLocalHour`, `isOnQuarterGrid`,
  `cancellableUntil`.
- `shared/src/index.ts`: re-exports.
- Tests: `shared/tests/calendar/schemas.test.ts` (extended), `rules.test.ts`, and `api.test.ts` /
  `types.test.ts` only if coverage needs them (type-only files have no lines).
- Documents: the v12 change-log entry of `docs/ARCHITECTURE.md` gets the step 42 sentence (shared
  contract and rules; no route, resource or behaviour of the API changes; the new error codes are
  not answered by any handler yet). `docs/FOLDER_STRUCTURE.md` (tree and section 6) and
  `CLAUDE.md`'s folder map add `rules.ts` and `types.ts`. The plan's status line says step 42 is
  done. Architecture section 4 does **not** list the new codes yet: each route step (43–51) merges
  its own routes and codes.

Nothing in `backend/` changes. In `frontend/`, only what the root typecheck forces (see below), with
no change in behaviour.

## How we work in this step

- **No new dependency.** `zod`, `Intl` and the step 41 helpers only. `shared/` imports nothing else.
- **What belongs in a schema and what does not.** A schema answers `400` for a request that is
  malformed by itself (11, status code rule). It knows no time zone, no "now", no settings and no
  stored data. Therefore these are **not** schema rules, even though they look like validation:
  - the 15-minute and whole-hour grid of an instant (R-BOOK-02): it depends on the local time in
    the calendar zone, so it is `isOnQuarterGrid` / `isWholeLocalHour` in `rules.ts`, applied by
    the handler in step 48 (still `400`);
  - which of those grids applies, and whether `end` may be set, depend on the caller's role
    (R-BOOK-02): handler, not schema;
  - overlap among an override's own windows (`409 availability_overlap`, R-AV-01), `date_in_past`,
    unknown `typeId`, count limits per date: `409`s, decided by the back end in steps 44–48.
  When a cross-field rule is unclear on this line, stop and ask.
- **Reuse the step 41 primitives** for every field: `Ulid` for ids, `LocalDate`, `LocalTime` for a
  start and `LocalEndTime` for an end, `Weekday`, `Instant`, `Note`, `TypeName`, and the existing
  `Username`. `start < end` on local times can compare the `HH:mm` strings (`24:00` sorts last).
  Spans count calendar days with `addDays`, never milliseconds.
- **Settings ranges** (section 9) go in `defaults.ts` next to the defaults, and
  `UpdateSettingsBody` reads them from there: integers, all four fields required (R-SET-02),
  `maxFutureAppointmentsPerUser` 1–100 or `null`.
- **Query strings arrive as strings.** `upcoming` accepts the string `true` only; `status` is one
  of `booked`, `cancelled`, `all`, default `booked`; `username` is the shared `Username`. Whether a
  User may pass `username` is a role check (`403`), not a schema rule. Path parameters are objects,
  as `UsernameParam` is, so a rejection names the field.
- **The rules are pure functions** on plain data: no clock (pass `now` or the zone where needed),
  no I/O, no classes. Choose input types that steps 45–48 can fill from DynamoDB items without a
  conversion layer. Each defined window carries its `source` and `sourceId` (11.6), because the
  Administrator's view needs them and `definedWindows` is the one place that knows them.
- **DST is where these rules break.** Cover by test, not by assumption:
  - `slotsOf` finds slot starts by the **local** time of instants (whole local hour), and measures
    the slot as 60 **real** minutes. AC-35: the window 01:00–04:00 on 2027-03-28 in `Europe/Rome`
    gives exactly two slots, local 01:00 (ending at local 03:00) and 03:00.
  - The fall-back day (2026-10-25) is not an acceptance scenario, but its reading is decided:
    the window 01:00–04:00 holds four real hours (local 02:00–03:00 happens twice) and gives
    **four** slots: 23:00Z (01:00), 00:00Z (02:00 at `+02:00`), 01:00Z (02:00 at `+01:00`) and
    02:00Z (03:00). This is R-SLOT-01 read literally. Do not drop the second 02:00: it is a
    different real hour, and dropping it would leave an hour of published availability that no
    User can book, while R-BOOK-02/06/07 would still accept it if sent directly. The two 02:00
    slots cannot be double-booked: requests carry instants and the overlap check compares
    instants. Test the four slots. In the report, (1) note as input for
    `FRONTEND_ARCHITECTURE.md` that on that night two slots share the local label "02:00", so a
    view must show the offset (or summer/winter time) to tell them apart, and (2) propose, without
    applying it, a sentence for spec R-SLOT-01 (and 16.8) that records this decision.
  - `Asia/Kathmandu` (+05:45): a whole local hour is not a whole UTC hour.
  - A window ending at `24:00`: its last slot is 23:00–24:00.
- **Merging** (6.6): adjacent windows merge only when they have the same type and one ends exactly
  where the next starts, compared as instants after conversion. Touching windows of different
  types stay separate and do not overlap (`[a, b)` and `[c, d)` overlap when `a < d` and `c < b`).
- **`cancellableUntil`**: `start − cancellationNoticeHours`, in real hours. Whether the value is
  sent (User) or `null` (Administrator) is decided by the handler.
- **The wider `ApiErrorCode`.** The front end narrows it with `Extract` and per-route code lists, so
  it should compile unchanged; the root `npm run typecheck` proves it. If an exhaustive mapping
  needs a new branch, add it with no change in behaviour, and say so in the report. The same holds
  for the back end's `error()` in `http.ts`.
- **Time-zone independence**, as in step 41: run the shared tests again under
  `TZ=America/New_York` and `TZ=Asia/Kathmandu`.
- **Keep it simple.** The functions see at most 50 patterns and 20 windows per date.
- **Hard rules:** 100 % line coverage on `shared/src`; strict TypeScript; ESLint clean.
- **When the spec and the plan disagree, or the spec is unclear**, stop and tell me, with a
  proposed change to the spec. Do not edit the spec silently.

## Acceptance (plan step 42)

- `npm run test:unit -w @shared-calendar/shared` green with 100 % lines, including:
  - every schema bound (lengths, ranges, `.strict()` unknown fields, `24:00` as an end only,
    `start < end`, `validFrom ≤ validUntil`, `validUntil: null`, override windows 0 and 10 accepted
    and 11 rejected, a 31-day and a 32-day calendar range, a 92-day and a 93-day appointment range,
    `upcoming` together with `from` rejected, AC-33's range rejected);
  - pattern validity edges: `validFrom` and `validUntil` themselves included, open end;
  - an override replaces the patterns, including the empty list (AC-07 at helper level); one-off
    windows add on an override day;
  - AC-04: pattern Monday 08:00–12:00 from 2026-11-01, no end, gives on 2026-11-16 the window
    07:00Z–11:00Z and the slots 07, 08, 09, 10Z;
  - AC-08: a one-off window 12:00–13:00 Studio on that date merges into one effective window
    08:00–13:00 local, and the 12:00 slot is offered;
  - slots of 08:30–12:00 (09, 10, 11 local) and of 08:00–08:45 (none);
  - AC-35: two slots on the spring-forward day; four slots on the fall-back day (2026-10-25,
    01:00–04:00), two of them at local 02:00;
  - touching windows do not overlap; adjacent windows of different types are not merged.
- The same tests green under `TZ=America/New_York` and `TZ=Asia/Kathmandu`.
- `npm run typecheck`, `npm run lint`, `npm run test:unit` at the root green (all three packages).
- The root `DYNAMODB_PORT=8002 npm run verify` green. It needs the local stack: ask me and I start
  `DYNAMODB_PORT=8002 npm run local:up -w backend` and `npm run local:api -w backend`.
- `grep` shows no import in `shared/src/calendar/` other than `zod` and relative paths.

Report each result, including anything you could not run, then stop for review. Do not start
step 43. Commit only when I ask (the plan's first calendar checkpoint is after step 43). Do not
push and do not deploy.
