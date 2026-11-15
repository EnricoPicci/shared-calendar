# Plan: the journey pages

| | |
|---|---|
| Goal | one page per `describe` block of the integration journeys (one per test file without a `describe`), in the format of `docs/journeys/README.md` |
| Pages | 21: the 9 `describe` blocks of `backend/tests/integration/calendar.test.ts`, the 9 of `frontend/tests/integration/calendar.test.ts`, and 3 whole files (the Hello World journeys of both packages, the front end's login test) |
| Brief | `prompts/57-explore-how-to-add-journey-explanation-docs.md` |

This plan says in which order the pages are written, how, and what makes a session done. The
format and the writing rules are in `docs/journeys/README.md`; this plan does not repeat them.

## 1. Approach

The work has three phases.

1. **By hand** (sessions 1–3). Pages are written one at a time while the format is still being
   proven. Session 2 is a back-end page, so the format is tried on the stored items as well as on
   the services. Each session may change the format in `docs/journeys/README.md`; every page
   written before is then brought in line in the same session.
2. **The skill** (session 4). The procedure of sessions 1–3 becomes the project skill
   `.claude/skills/explain-journey/SKILL.md`. It holds what the README does not: the steps of
   writing a page, the checklist of a check, and how to refresh a page after its test changed. It
   points at the README for the format and the rules instead of copying them.
3. **Batches** (sessions 5–8). The remaining pages are written by subagents in batches of four or
   five, one batch per session, grouped by test file and topic.

## 2. How a batch session works

1. **One writer agent per page**, each in a fresh context, following the skill. The writers run
   in parallel. A writer:
   - reads the block, the helpers it calls, the code they reach, the specification sections it
     relies on and `docs/journeys/concepts.md`;
   - writes its page and the pointer comment above its `describe`;
   - does **not** edit `concepts.md`: it returns the additions it needs, as text;
   - reports every place where the test and the specification disagree.
2. **One checker agent per page**, in a fresh context, given the page and the test, not the
   writer's reasoning. It traces every "the test checks" bullet to an `expect` and every claim
   about the code or the rules to its source, and lists what it cannot trace.
3. **The main session** merges the `concepts.md` additions (one edit, no two agents writing the
   same file), fixes what the checkers found, adds the pages to the list in
   `docs/journeys/README.md`, updates the status below and runs the acceptance check.
4. **The user reviews the batch** before the next session starts.

About two agents per page, so eight to ten per batch.

## 3. Acceptance check of every session

- `npm run lint` is green (root, so the pointer comments point at pages that exist).
- Every "the test checks" bullet matches an `expect`; every reference exists in its document and
  says what the page claims. In a batch session the checkers' lists are empty or each point is
  answered.
- Each new page's `describe` carries its pointer comment.
- Each new page is listed in `docs/journeys/README.md`, and its status below is "done".
- Disagreements between a test and the specification are reported to the user, not smoothed over.
- The user has reviewed the session's pages.

## 4. Sessions

| # | Session | Pages (in `docs/journeys/`) | Explains | Status |
|---|---|---|---|---|
| 1 | By hand | `frontend/calendar-view.md` | `frontend/tests/integration/calendar.test.ts`, `calendar view` | done |
| 2 | By hand | `backend/calendar-booking.md`; adds the stored items and the calendar lock to `concepts.md` | `backend/tests/integration/calendar.test.ts`, `booking (route 17)` | planned |
| 3 | By hand | `frontend/calendar-appointments.md` | `frontend/tests/integration/calendar.test.ts`, `appointments` | planned |
| 4 | Skill | `.claude/skills/explain-journey/SKILL.md`, from sessions 1–3 | — | planned |
| 5 | Batch 1: back-end availability | `backend/calendar-settings.md`, `backend/calendar-availability-types.md`, `backend/calendar-weekly-patterns.md`, `backend/calendar-view.md`, `backend/calendar-overrides-and-one-off-windows.md` | `backend/tests/integration/calendar.test.ts`: `calendar settings (routes 1 and 2)`, `availability types (routes 3–6)`, `weekly patterns (routes 7–10)`, `calendar view (route 15)`, `date overrides and one-off windows (routes 11–14)` | planned |
| 6 | Batch 2: back-end appointments and users | `backend/calendar-listing-note-cancel.md`, `backend/calendar-change.md`, `backend/calendar-users.md`, `backend/hello-world-journeys.md` | `backend/tests/integration/calendar.test.ts`: `listing, note and cancel (routes 16, 18, 19)`, `change (route 20)`, `users (route 21, deletion)`; `backend/tests/integration/journeys.test.ts` (whole file) | planned |
| 7 | Batch 3: front-end availability | `frontend/calendar-settings.md`, `frontend/calendar-types.md`, `frontend/calendar-patterns.md`, `frontend/calendar-overrides.md`, `frontend/calendar-one-off-windows.md` | `frontend/tests/integration/calendar.test.ts`: `settings`, `types`, `patterns`, `overrides`, `one-off windows` | planned |
| 8 | Batch 4: front-end conflicts, users, Hello World | `frontend/calendar-availability-conflict.md`, `frontend/calendar-users.md`, `frontend/hello-world-journeys.md`, `frontend/login.md` | `frontend/tests/integration/calendar.test.ts`: `availability conflict`, `users`; `frontend/tests/integration/journeys.test.ts` and `login.service.test.ts` (whole files) | planned |

Inside a batch the pages are independent: none needs another page of the same batch. A page that
needs an idea another batch adds to `concepts.md` comes after it, which is why the back-end
batches come before the front-end ones.

## 5. After the plan

Once every page is done, this plan has no more work and stays as the record of how the pages were
made. New and changed journeys use the skill: the page changes in the same commit as the test.
