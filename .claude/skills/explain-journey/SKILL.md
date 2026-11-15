---
name: explain-journey
description: Write, check or refresh a journey page in docs/journeys/, the simple-words explanation of one describe block (or one whole test file) of backend/tests/integration or frontend/tests/integration. Use when asked to explain an integration journey, write a new page under docs/journeys/, check or review a page against its test, or bring a page up to date after its test changed.
---

# Explain a journey

A journey page explains one `describe` block of an integration test (or one test file that has
no `describe`) to a developer new to the project. This skill holds the **procedure**: how to
write a page, how to check one, how to refresh one. It does not hold the format or the writing
rules, and it does not explain the calendar ideas: those have one home each, and this skill only
points at them.

| What | Where it lives |
|---|---|
| the reader, the layout of the folder, the format of a page, the writing rules, the pointer comment, the list of pages | `docs/journeys/README.md` |
| the calendar ideas several pages use (the local table, the items, the lock, the services in the journeys, …) | `docs/journeys/concepts.md` |
| which pages are still to write, in which batch, and the acceptance check of a session | `docs/journeys/PLAN.md` |
| the comment rule a pointer comment must pass | `CLAUDE.md`, section "Comments" |

The page is never the source of truth: `docs/ARCHITECTURE.md`, `docs/SHARED_CALENDAR_SPEC.md`,
`docs/FRONTEND_SERVICES.md` and the tests are. When the page and one of them disagree, the page is
wrong, or the disagreement is reported; it is never smoothed over.

## Always read first

1. `docs/journeys/README.md` in full.
2. `docs/journeys/concepts.md` in full: what is already explained, so a page links to it.
3. One example page of the same package, to see the format applied:
   - back end (stored items, a table emptied first): `docs/journeys/backend/calendar-booking.md`;
   - front end (services, a table never reset): `docs/journeys/frontend/calendar-appointments.md`
     (a long story in the full form, then short tests) or `docs/journeys/frontend/calendar-view.md`
     (a shorter block, with a "Background" section).
   Use them as models of shape and tone. Never copy their text: every claim on a new page is
   traced to its own test.

## Then pick the procedure

| Task | Read and follow |
|---|---|
| write a new page | [`write.md`](write.md), then check your own page with [`check.md`](check.md) before you report |
| check a page someone else wrote | [`check.md`](check.md) only. Work from the page, the test and the repository, not from the writer's reasoning |
| a test changed and its page must follow | [`refresh.md`](refresh.md), then [`check.md`](check.md) on the sections you touched |

## The two kinds of journey

The two packages use the one local `calendar` table differently
(`docs/journeys/concepts.md`, "One local calendar, shared"). It changes what a page can claim:

- **Back end** (`backend/tests/integration/`): calls the API with `api()` and reads stored items
  directly (`getCalendarItem()`, `queryCalendarPartition()` in
  `backend/tests/integration/setup.ts`). The calendar file empties the table first
  (`resetCalendarTable()`), so counts are exact; but the blocks of the file run in order on the
  same table, so a block starts from what the blocks before it left. Its users are removed by
  `removeUserIfPresent()`, straight in cognito-local: no deleted-user marker, nothing cancelled.
- **Front end** (`frontend/tests/integration/`): reaches the API only through the services
  (`docs/journeys/concepts.md`, "The front end's services in the journeys"). The table is never
  reset, so every count and every "free" date needs its reason: which filter, which date band,
  which run's account. Its users are removed through `DELETE /users/{username}`
  (`removeUsers()`), which cancels their appointments and writes the marker.

`write.md` and `check.md` say, step by step, what each kind needs.

## In a batch

When the main session runs the pages of `docs/journeys/PLAN.md` section 4 with subagents
(`docs/journeys/PLAN.md` section 2):

- **A writer** writes its page and its pointer comment, and nothing else. It does **not** edit
  `docs/journeys/concepts.md`, `docs/journeys/README.md` (the list of pages) or
  `docs/journeys/PLAN.md`: other writers run at the same time. It returns, as text in its report,
  the `concepts.md` sections it needs (heading, where they go, the text) and links to them from
  its page with the anchor they will have.
- **A checker** edits nothing. It returns its list of points (`check.md`, "Report").
- **The main session** merges the `concepts.md` additions in one edit, answers each checker point,
  lists the pages in the README, updates the plan and runs the acceptance check of
  `docs/journeys/PLAN.md` section 3.

Outside a batch (one page written by hand), the writer may edit `concepts.md` and the README's
list itself.
