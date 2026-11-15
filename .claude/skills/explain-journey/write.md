# Write a page

For one `describe` block of an integration test, or one test file that has no `describe`. The
format and the writing rules are those of `docs/journeys/README.md`; this file is the order of
work. Read `SKILL.md` first.

## 1. Fix the target

- The test file and the exact `describe` name (or "whole file").
- The page's path: `docs/journeys/backend/…` or `docs/journeys/frontend/…`, named as
  `docs/journeys/README.md` ("Layout") says. In a batch, take it from the session's row in
  `docs/journeys/PLAN.md` section 4.

## 2. Read, in this order

1. **`CLAUDE.md`**: "Comments", the integration notes of the package (the back end's calendar
   journeys empty the table; the front end's never reset it, and keep their settings in
   `frontend/tests/integration/fe-calendar-settings.local.json`), and "Test conventions".
2. **The whole test file, once**: its opening comment, constants, the file's `beforeAll` and
   `afterAll`, the clean-up helpers, every helper defined at the top. Then **the block in full**:
   its opening comment, its `beforeAll`/`afterAll` (also those registered by a helper, such as
   `bookingSettings()` in `frontend/tests/integration/calendar.test.ts`), every `it`, and every
   helper it calls, in the file and in `backend/tests/integration/setup.ts` or
   `frontend/tests/integration/local.ts`.
3. **The neighbours**:
   - the **block before**: what it leaves, and whether it uses the same dates or accounts. On the
     front end a date the block before released is free again, and the helper that picks a free
     date (`freeDate()`) may pick it, with that block's cancelled appointments still on it;
   - the **opening comment of the next block**: it often lists what it expects this block to
     leave. It is the best cross-check of "What the block leaves". When it says nothing about
     that, read what the next block's `beforeAll` and first test need from the state instead.
4. **The code every call reaches**, as far as the page will make claims about it:
   - back end: the handler in `backend/src/handlers/`, then `backend/src/lib/calendarDb.ts` (the
     write or read and its items), `backend/src/lib/calendarRules.ts` (the checks, in order),
     `backend/src/lib/calendarEvents.ts` (the events), `backend/src/lib/cognito.ts` (who counts
     as a plain User, the `sub` lookup);
   - front end: the service and its types in `frontend/src/services/` (the method, the stream it
     answers on, the route), `frontend/src/services/api.ts` (`apiCall()`: how an answer becomes a
     result; `invalidRequest()`: the message of a refusal before sending);
   - both: the shared schemas in `shared/src/calendar/schemas.ts`. They change what is sent or
     stored (a trimmed note or name, a default `status`), and on the front end they decide what
     is refused before a request leaves;
   - the package's `vitest.config.ts`: a failed test does not stop the block (no `bail`), and the
     integration files run one at a time (`fileParallelism: false`).
5. **The specification** the block names: the sections and rules in its comments, its test names
   (the "Test names:" comment above the `describe` says which document), and the error codes its
   assertions expect. Usually `docs/SHARED_CALENDAR_SPEC.md` (the rules `R-…`, section 11.1 for
   the route and its codes, the scenarios `AC-…` of section 18.3); on the front end also
   `docs/FRONTEND_SERVICES.md` (the service's section, the decisions of section 8, section 14.4
   for the calendar journeys). `docs/SHARED_CALENDAR_SPEC.md` section 16 describes the services
   before `docs/FRONTEND_SERVICES.md` defined them: where they differ, `docs/FRONTEND_SERVICES.md`
   and the test win, and the difference goes into the report, not into the page.
6. **`docs/journeys/concepts.md`** again, with the block in mind: which sections the page will
   link to, and which idea is missing.

## 3. Draft the state table, before any prose

In a block whose tests share state, an answer depends on everything before it. Before writing the
story, draft for yourself a table with one row per test (and one per step of a long test): what it
adds, changes or removes. Track what the answers depend on:

- appointments: time, owner, status, who booked, who cancelled;
- the settings values in force (and who puts them back, when);
- types, patterns, overrides, one-off windows, and the free slots of each date used;
- users (and on the back end, the stored items the block reads).

Then check every expected answer against it: how many future appointments a User holds at a limit
check, which appointments an availability change would strand, which slot a change frees, what a
second cancel finds. The table is a working tool; put on the page only the parts that help the
reader (for example the day after a change).

## 4. Inventory the checks of each test

For each test, list every `expect` and its value, **including those inside helpers**
(`noRequest()` expects no `fetch` call; `restoreSettings()` expects the settings written back) and
every helper that fails the test when a call does not succeed (`ok()`, a helper "that must
succeed"). Then sort:

- **checks on the API's answers** (or the service's results);
- **checks on stored items**, read directly in the table: they become the group "In the table,
  the test checks that:" of `docs/journeys/README.md`;
- **behaviour no `expect` checks** that the story needs (a conflicts list that holds more than the
  test looks at, a `finally` that restores something): verify it in the code, and write it as what
  the server or the service does, never as "the test checks".

For each call note, on the front end, **the method, the stream its result arrives on, and the
route**. Take the stream's name from the service's code: it can differ from
`docs/SHARED_CALENDAR_SPEC.md` (`docs/FRONTEND_SERVICES.md` section 8, decision 40). They go into
the table method → stream → route of "Where in the code".

For each refusal on the front end, **count the requests**: none (`noRequest()`) means the service
refused before sending; one (a `fetch` spy expecting one call) means the API decided. The same
`invalid_request` can come from either side; the page says which, and why that side
(`docs/journeys/concepts.md`, "Refused before sending, or by the API").

For each list, write down **the server's filter and the test's filter**: the server lists a User's
own appointments by the `sub` of its token, the Administrator's `username` filter matches the
stored name (so earlier runs' accounts of the same name too), and `status` defaults to `booked`;
the test then filters on a date or a set of ids. Together they are why a count holds. On the
front end, the page says so per list.

## 5. Work out what a failure does

- **What a failed check skips**: the rest of that test. Settings put back at the end of a test,
  or only in the block's last test, are skipped; an `afterAll` or a `finally` is not. The later
  tests of the block still run: say which of them need something from an earlier one.
- **How users are removed**: `removeUserIfPresent()` in `backend/tests/integration/setup.ts`
  deletes straight in cognito-local (no marker, nothing cancelled); `DELETE /users/{username}`
  (the front end's `removeUsers()`, and any test that calls the route) cancels the User's future
  appointments and writes the deleted-user marker. Say which one the block and the file use.
- **What the next run starts from**: the file's `beforeAll` (the back end empties the table; the
  front end removes its users, then `cleanUp()` its types and their rules, and writes back
  settings a killed run left changed), and what stays as history (cancelled appointments, events,
  markers).

## 6. Write the page

In the format of `docs/journeys/README.md`, section by section, in its order. While writing:

- name each test as "Test N" with the scenario if its name holds one; the header table numbers
  the `it` names in order;
- the line "Ideas used here" links only to `docs/journeys/concepts.md` sections the page relies
  on; an idea another page could use belongs there, not in a "Background" section;
- in a batch, an idea that is missing from `concepts.md` is returned as text (section 8 below);
  link to it with the anchor it will have;
- the test users are named, or "they", "themself": never "he" or "she", even where the test's
  comments say "his";
- a claim with "all", "only", "every" or "none" (every call of a User, all the appointments of a
  date) is checked call by call against the test, and scoped to what holds ("this block's
  appointments" when the block before may have left others on the same date);
- every reference names its document by path (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02); no
  history (versions, briefs, steps of the plan);
- name the code by its names, never by line number.

## 7. The pointer comment

- Add the one line `docs/journeys/README.md` ("Writing rules", "The pointer comment") asks for,
  where it says: above the `describe` and any "Test names:" comment (as in
  `backend/tests/integration/calendar.test.ts`, block `booking (route 17)`), or for a whole file
  above its opening comment.
- Nothing else in the test file changes.
- Run `npm run lint` at the root. The rule `local/doc-references` fails when the page does not
  exist (`scripts/doc-references.mjs`), so write the page first.

## 8. Check, then report

Run [`check.md`](check.md) on your own page and fix what it finds. Then report:

- **disagreements**: each place where the test, the code and the specification disagree, with
  both sources (file and name, or document and section). The page does not smooth them over; the
  test and the specification are not changed;
- **`concepts.md` additions** (in a batch): per section, the heading, where it goes (after which
  section), and the text, in the style of the file, naming its section of
  `docs/SHARED_CALENDAR_SPEC.md`; and the anchors the page already links to;
- **what you could not trace**: a claim you left out because no source confirms it, or kept with
  the reason;
- **format gaps**: a part of the block the format of `docs/journeys/README.md` does not fit. Do
  not change the format in a batch: propose it.
