# Plan: the journey pages

| | |
|---|---|
| Goal | one page per `describe` block of the integration journeys (one per test file without a `describe`), in the format of `docs/journeys/README.md` |
| Pages | 21: the 9 `describe` blocks of `backend/tests/integration/calendar.test.ts`, the 9 of `frontend/tests/integration/calendar.test.ts`, and 3 whole files (the Hello World journeys of both packages, the front end's login test) |
| Brief | `prompts/60-explore-how-to-add-journey-explanation-docs.md` |

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

The main session starts each agent with a prompt that gives the skill's path,
`.claude/skills/explain-journey/SKILL.md`, and tells it to read it first, with the page's target
(test file, `describe`, page path) and, for a checker, that it edits nothing. A subagent is not
sure to load a project skill on its own.

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
| 2 | By hand | `backend/calendar-booking.md`; adds the stored items and the calendar lock to `concepts.md` | `backend/tests/integration/calendar.test.ts`, `booking (route 17)` | done |
| 3 | By hand | `frontend/calendar-appointments.md`; adds the life of an appointment and the front end's services to `concepts.md` | `frontend/tests/integration/calendar.test.ts`, `appointments` | done |
| 4 | Skill | `.claude/skills/explain-journey/SKILL.md`, from sessions 1–3 | — | done |
| 5 | Batch 1: back-end availability | `backend/calendar-settings.md`, `backend/calendar-availability-types.md`, `backend/calendar-weekly-patterns.md`, `backend/calendar-view.md`, `backend/calendar-overrides-and-one-off-windows.md` | `backend/tests/integration/calendar.test.ts`: `calendar settings (routes 1 and 2)`, `availability types (routes 3–6)`, `weekly patterns (routes 7–10)`, `calendar view (route 15)`, `date overrides and one-off windows (routes 11–14)` | planned |
| 6 | Batch 2: back-end appointments and users | `backend/calendar-listing-note-cancel.md`, `backend/calendar-change.md`, `backend/calendar-users.md`, `backend/hello-world-journeys.md` | `backend/tests/integration/calendar.test.ts`: `listing, note and cancel (routes 16, 18, 19)`, `change (route 20)`, `users (route 21, deletion)`; `backend/tests/integration/journeys.test.ts` (whole file) | planned |
| 7 | Batch 3: front-end availability | `frontend/calendar-settings.md`, `frontend/calendar-types.md`, `frontend/calendar-patterns.md`, `frontend/calendar-overrides.md`, `frontend/calendar-one-off-windows.md` | `frontend/tests/integration/calendar.test.ts`: `settings`, `types`, `patterns`, `overrides`, `one-off windows` | planned |
| 8 | Batch 4: front-end conflicts, users, Hello World | `frontend/calendar-availability-conflict.md`, `frontend/calendar-users.md`, `frontend/hello-world-journeys.md`, `frontend/login.md` | `frontend/tests/integration/calendar.test.ts`: `availability conflict`, `users`; `frontend/tests/integration/journeys.test.ts` and `login.service.test.ts` (whole files) | planned |

Inside a batch the pages are independent: none needs another page of the same batch. A page that
needs an idea another batch adds to `concepts.md` comes after it, which is why the back-end
batches come before the front-end ones.

## 5. Notes for the skill

What the sessions by hand learned, kept here for session 4, which turns them into the skill. Each
session adds its own.

The skill `.claude/skills/explain-journey/` now holds these notes as steps and checks: this section
stays as the record, and a later change goes to the skill.

**Session 1** (`frontend/calendar-view.md`): the first page set the format of
`docs/journeys/README.md`.

**Session 2** (`backend/calendar-booking.md`):

- **What took longest: the state at each test.** In a block whose tests share state, a test's
  answer depends on everything before it: how many appointments a User holds at a limit check,
  which appointments an availability change would strand, a slot that exists only because an
  earlier test widened a window. Draft a running table of the state (per test: what it adds,
  changes or removes) before writing the story, and check each test against it.
- **Sources needed beyond the block and the code it calls:** the Cognito module (who is a plain
  User), the shared schemas (what the body's validation already changes, such as a trimmed note),
  the vitest configuration (whether a failure stops the block: it does not), and the **opening
  comment of the next block**, which lists what it expects this one to leave: the best cross-check
  of "What the block leaves".
- **Hard to verify: claims no `expect` checks.** The code often decides more than the test checks
  (a conflicts list that holds every appointment of the weekday, while the test checks one). Such a
  claim is checked against the code and written as the server's behaviour, never as "the test
  checks".
- **Look for what a failure skips.** Settings put back at the end of a test, or only in the last
  test, are skipped when an earlier check fails; a `finally` is not. "If the block fails halfway"
  says which.
- **How Users are removed matters.** A helper that deletes a User straight in cognito-local writes
  no deleted-user marker and cancels nothing; `DELETE /users` does both. Say which one the block
  uses.
- **Neutral wording for the test Users.** The tests' comments may say "his" for `dave`; the pages
  use the names or "they", "themself".
- **Read the tests as consumers of one table.** The back end's journeys empty the `calendar` table
  first, so a page can count items exactly; the front end's do not, so a page must say why a count
  or a free date can be trusted.

**Session 3** (`frontend/calendar-appointments.md`):

- **Write the state table before the story, again.** In a test that tells a long story, the
  answer of a step depends on every step before it (the slot a change frees, the appointment a
  second cancel finds cancelled). The table of the day after the change was the check of every
  later step.
- **Read what each list really returns, then what the test filters.** A list's server filter (by
  `sub` for a User, by the stored name for the Administrator, booked by default) and the test's own
  filter (`date === D`, a set of ids) together decide why a count holds on a table that is never
  reset. Explain both, per list: that is the answer to "why can this be trusted".
- **Look at the blocks before, not only after.** On a table that is never reset, the block before
  (here "calendar view") can leave history on the very date this block picks, under the same
  account. The test's comments hint at it ("an earlier block may have left a cancelled one");
  find the exact cause in the helpers (`freeDate()` takes the first free date, and a released
  date is free again).
- **Name the method, the stream and the route of every call.** The front end's stream names can
  differ from the specification's (`docs/FRONTEND_SERVICES.md` section 8, decision 40); take them
  from the service's code, and give the table method → stream → route in "Where in the code".
- **Who decided a refusal: count the requests.** A front-end refusal is the service's when no
  request leaves (`noRequest()`), the API's when one does. The same `invalid_request` can come from
  either; the page says which, and why that side (the schema knows no role, clock or data).
- **Ideas several pages need go to `concepts.md` at once.** This session added the life of an
  appointment (with the change) and the front end's services (streams, `outcome()`, refused before
  sending or by the API); the earlier front-end page was brought in line with links.
- **Format changes of this session** (`docs/journeys/README.md`, "The format of a page"): the
  line "Ideas used here" under the header table is now part of the format, and the short form
  covers a call that sends no request. The earlier pages already matched.
- **Mind the specification's older parts.** `docs/SHARED_CALENDAR_SPEC.md` section 16 describes the
  services before `docs/FRONTEND_SERVICES.md` had them; where they differ the services document
  and the test win, and the difference is reported, not written into the page.

## 6. After the plan

Once every page is done, this plan has no more work and stays as the record of how the pages were
made. New and changed journeys use the skill: the page changes in the same commit as the test.
