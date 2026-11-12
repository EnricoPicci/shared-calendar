## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
```

No AWS login is needed: this step does not touch the cloud.

## Brief

Implement plan step 41, "Shared: the time model", the first step of the shared calendar, following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for review.

Read first, in full: `CLAUDE.md`, `docs/IMPLEMENTATION_PLAN.md` section 3, "Shared calendar (steps
41–56)" (the conventions under "How these steps are run", the rule under "Where the truth lives
while the calendar is built", and step 41 itself), then `docs/SHARED_CALENDAR_SPEC.md` v2 sections
5 (time model), 9 (settings), 6.1 (the type `name` rule, for `TypeName`), R-BOOK-11 in 8.2 (the
`Note` rule), 11.2 (path and query parameters: the field formats), 20 (decisions T5, T6) and 22 (assumptions,
A1 and A5). Then `shared/src/`, `shared/tests/`, `shared/tsconfig.json`, `shared/vitest.config.ts`,
`docs/FOLDER_STRUCTURE.md` sections 2 and 3, and the change log and section 1.1 of
`docs/ARCHITECTURE.md`.

## Where we are (2026-11-12)

- Hello World is v1 (tag `v1.0.0`), the monorepo move (step 20) and the front-end services layer
  (FRONTEND_SERVICES v5, `70ad8f2`) are done.
- The calendar spec (brief 40, `05eb79e`) and the plan with spec v2 (brief 41, `1a483d0`) are
  committed. Nothing of the calendar is implemented. Nothing after `36798a5` is pushed.
- `shared/` holds `api.ts`, `roles.ts`, `username.ts`, `index.ts`; no `calendar/` folder yet.
- The architecture is at v11. This step opens v12.

## Scope of this step

Only what step 41 lists:

- `shared/src/calendar/time.ts`: `toInstant(date, time, zone)` with the "compatible" rule of
  R-TIME-03, `localDateOf(instant, zone)`, `localTimeOf(instant, zone)`, `weekdayOf(date)` (ISO,
  1 = Monday), `addDays(date, n)`, `isValidTimeZone(zone)`.
- `shared/src/calendar/schemas.ts`: the primitives only: `LocalDate`, `LocalTime`, `LocalEndTime`,
  `Weekday`, `Instant`, `Ulid`, `Note`, `TypeName`. The request bodies, queries and cross-field
  rules belong to step 42: do not write them here.
- `shared/src/calendar/defaults.ts`: the default settings of spec section 9 and the limits of A5.
- `shared/src/index.ts`: re-exports.
- Tests: `shared/tests/calendar/time.test.ts`, `schemas.test.ts` (and `defaults.test.ts` only if
  coverage needs it).
- Documents: `docs/ARCHITECTURE.md` change log v12 opened with the governance rule, quoted
  verbatim from the plan; F5 in 1.1 as "in progress"; `docs/FOLDER_STRUCTURE.md` gains the
  `shared/src/calendar/` folder; `CLAUDE.md`'s folder map mentions it. The plan's status line says
  step 41 is done.

Nothing in `backend/` or `frontend/` changes in this step, no new error code in `api.ts` (step 42).

## How we work in this step

- **No new dependency.** `Intl` only (T6), plus `zod`, which `shared/` already has. `shared/`
  imports nothing else: no Node module, no DOM API, no date library.
- **The helpers must not depend on the machine's time zone.** Never use the local-time getters of
  `Date` (`getHours`, `getDate`, `new Date(y, m, d)`, …). Date arithmetic on `YYYY-MM-DD` goes
  through UTC (`Date.UTC`, `getUTC*`); wall-clock reading in a zone goes through
  `Intl.DateTimeFormat(…, { timeZone })` and `formatToParts`. Prove it: run the shared tests once
  more with `TZ=America/New_York` and once with `TZ=Asia/Kathmandu` in the environment; they must
  stay green.
- **Known `Intl` traps to cover by test**, not by assumption:
  - `hour12: false` can format midnight as `24` in some engines: use `hourCycle: 'h23'`;
  - finding the offset of a zone at a given instant, and the two DST cases of R-TIME-03 (a time
    in the gap moves forward by the gap's length; a time that occurs twice takes the earlier
    occurrence);
  - `isValidTimeZone` must behave as the cold-start check of R-TIME-01 says (`Intl.DateTimeFormat`
    accepts it), so `''`, `'Mars/Olympus'` and a non-string answer `false`.
- **Keep it simple.** Pure functions, no classes, no caching unless a test shows it is needed. The
  functions are called a few hundred times per request at most.
- **Hard rules:** 100 % line coverage on `shared/src`; strict TypeScript; ESLint clean.
- **When the spec and the plan disagree, or the spec is unclear** (for example on what `Instant`
  accepts: R-TIME-02 gives the `toISOString` form, the plan adds "seconds and milliseconds zero"),
  stop and tell me, with a proposed change to the spec. Do not edit the spec silently.

## Acceptance (plan step 41)

- `npm run test:unit -w @shared-calendar/shared` green with 100 % lines, including:
  - `Europe/Rome` spring forward, 2027-03-28: 02:30 becomes 03:30;
  - `Europe/Rome` fall back, 2026-10-25: 02:30 takes the earlier occurrence (00:30Z);
  - `Asia/Kathmandu` (+05:45);
  - the time half of AC-35: `toInstant('2027-03-28', '01:00', 'Europe/Rome')` + 60 real minutes is
    local `03:00` on the same date;
  - `24:00` as an end only; 2028-02-29 valid, 2027-02-29 invalid; weekday across a year boundary;
  - `Instant` rejects `…T09:00Z`, a non-zero second and a `+01:00` offset; `Note` rejects 501
    characters and control characters but accepts a line feed.
- The same tests green under `TZ=America/New_York` and `TZ=Asia/Kathmandu`.
- `npm run typecheck`, `npm run lint`, `npm run test:unit` at the root green (all three packages).
- The root `DYNAMODB_PORT=8002 npm run verify` green. It needs the local stack: ask me and I start
  `DYNAMODB_PORT=8002 npm run local:up -w backend` and `npm run local:api -w backend`.
- `grep` shows no import in `shared/src/calendar/` other than `zod` and relative paths.

Report each result, including anything you could not run, then stop for review. Do not start
step 42. Commit only when I ask (the plan's first calendar checkpoint is after step 43). Do not
push and do not deploy.
