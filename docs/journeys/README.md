# The journeys, explained

This folder explains the integration journeys in simple words, one page per `describe` block (or
per test file when the file has no `describe`). Each page tells the block's story: who takes part,
what is in place before it starts, what happens step by step, what the test checks at each step, and
what is left behind.

**The reader** is a developer new to the project: someone who reads TypeScript and tests but does
not know the calendar specification yet. The pages name the code (services, routes, helpers,
fields, error codes) and explain the calendar ideas the story needs.

**These pages are not a source of truth.** They explain the tests. The behaviour is defined by
`docs/ARCHITECTURE.md` and `docs/SHARED_CALENDAR_SPEC.md`, the services by
`docs/FRONTEND_SERVICES.md`, and the tests themselves are what runs. On any conflict, those win, and
the page is fixed.

## Layout

| Path | What it holds |
|---|---|
| `README.md` | this page: the format, the rules and the list of pages |
| `concepts.md` | the calendar ideas several journeys use, explained once; every page links to the sections it needs |
| `backend/` | one page per journey of `backend/tests/integration/` |
| `frontend/` | one page per journey of `frontend/tests/integration/` |

File names are lower case with hyphens: `<test file>-<describe block>.md`, shortened where the
test file name adds nothing (`frontend/calendar-view.md` for the block `calendar view` of
`frontend/tests/integration/calendar.test.ts`).

## The format of a page

1. **Title**: "The «block» journey, in simple words".
2. **A header table**: the test file, the `describe` block, its tests (`it` names, in order) and
   the stack it runs against.
3. **What this block proves**: two to four lines naming the rules and scenarios it covers, each with
   its document (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02, AC-12).
4. **Who takes part**: the actors and what each one is for.
5. **Before the block starts**: the state the file's and the block's `beforeAll` set up.
6. **The story**: one subsection per test, in order. A test that tells a story gets numbered steps,
   a small table of the state where it helps (for example the slots of a day), and a Mermaid sequence
   diagram when three or more actors take part. Each "the test checks" bullet matches an `expect` in
   the test.
7. **If the block fails halfway**: what the `afterAll` and the next run's `beforeAll` clean up, and
   what stays in the local tables as history.
8. **Where in the code**: the services or routes called, the helpers, the file's constants. By name,
   never by line number.
9. **Background** (optional): only what belongs to this block alone. Anything another journey
   could use goes into `concepts.md`.

## Writing rules

- Simple words, short sentences, the present tense. Explain an idea the first time it appears, or
  link to `concepts.md`.
- A reference names the document by its path, as in code comments (`CLAUDE.md`, "Comments"):
  `docs/SHARED_CALENDAR_SPEC.md` section 6.5, never "spec 6.5". No history: no versions, briefs or
  "since step N".
- Every claim is checked against the test and the code it calls before the page is written.
  When the test and the specification disagree, the page says so and the disagreement is reported.
- **The pointer comment.** The `describe` the page explains carries a one-line comment above it:
  `// Explained in simple words in docs/journeys/frontend/calendar-view.md.` Whoever changes the
  test sees the page in the same diff. The lint rule `local/doc-references` checks that the page
  exists (`scripts/doc-references.mjs`).
- When a test changes, its page changes in the same commit.

## The pages

One session per page (two for the small ones marked "together"), reviewed before the next. The
order puts one back-end page early, to prove the format on the stored items too. After the third
page the format is frozen into a project skill (`.claude/skills/explain-journey/`), which the
later pages use.

| # | Page | Explains | Status |
|---|---|---|---|
| 1 | [`frontend/calendar-view.md`](frontend/calendar-view.md) | `frontend/tests/integration/calendar.test.ts`, `calendar view` | done |
| 2 | `backend/calendar-booking.md` | `backend/tests/integration/calendar.test.ts`, `booking (route 17)`; adds the stored items and the calendar lock to `concepts.md` | planned |
| 3 | `frontend/calendar-appointments.md` | `frontend/tests/integration/calendar.test.ts`, `appointments` | planned |
| — | the skill `explain-journey` | from pages 1–3 | planned |
| 4 | `frontend/calendar-availability-conflict.md` | `frontend/tests/integration/calendar.test.ts`, `availability conflict` | planned |
| 5 | `backend/calendar-listing-note-cancel.md` | `backend/tests/integration/calendar.test.ts`, `listing, note and cancel (routes 16, 18, 19)` | planned |
| 6 | `backend/calendar-change.md` | `backend/tests/integration/calendar.test.ts`, `change (route 20)` | planned |
| 7 | `backend/calendar-users.md` | `backend/tests/integration/calendar.test.ts`, `users (route 21, deletion)` | planned |
| 8 | `backend/calendar-view.md` | `backend/tests/integration/calendar.test.ts`, `calendar view (route 15)` | planned |
| 9 | `backend/calendar-overrides-and-one-off-windows.md` | `backend/tests/integration/calendar.test.ts`, `date overrides and one-off windows (routes 11–14)` | planned |
| 10 | `backend/calendar-weekly-patterns.md` | `backend/tests/integration/calendar.test.ts`, `weekly patterns (routes 7–10)` | planned |
| 11 | `backend/calendar-settings.md`, `backend/calendar-availability-types.md` (together) | `backend/tests/integration/calendar.test.ts`, `calendar settings (routes 1 and 2)` and `availability types (routes 3–6)` | planned |
| 12 | `frontend/calendar-patterns.md`, `frontend/calendar-overrides.md`, `frontend/calendar-one-off-windows.md` (together) | `frontend/tests/integration/calendar.test.ts`, `patterns`, `overrides`, `one-off windows` | planned |
| 13 | `frontend/calendar-settings.md`, `frontend/calendar-types.md`, `frontend/calendar-users.md` (together) | `frontend/tests/integration/calendar.test.ts`, `settings`, `types`, `users` | planned |
| 14 | `backend/hello-world-journeys.md` | `backend/tests/integration/journeys.test.ts` (no `describe`: the whole file) | planned |
| 15 | `frontend/hello-world-journeys.md`, `frontend/login.md` (together) | `frontend/tests/integration/journeys.test.ts` and `login.service.test.ts` (whole files) | planned |
