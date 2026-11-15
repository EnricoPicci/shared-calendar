## Brief

Run session 2 of `docs/journeys/PLAN.md`: write the journey page
`docs/journeys/backend/calendar-booking.md`, which explains the `describe` block
`booking (route 17)` of `backend/tests/integration/calendar.test.ts`. The session is done by hand,
like session 1 (no subagents). It is the first back-end page: besides the HTTP answers it explains
what the journeys read in the `calendar` table. One stop at the end, for review. Commit only when
asked.

This session writes documentation only. It changes no test behaviour, no source code and no
specification. The only code change is the pointer comment above the `describe`.

## Read these in full first

- `CLAUDE.md`, in particular "Where the truth lives", "Comments" and the back-end integration
  notes (the back end's calendar journeys empty the local `calendar` table first).
- `docs/journeys/README.md`: the reader (a developer new to the project), the format of a page and
  the writing rules.
- `docs/journeys/PLAN.md`: sections 1 (approach), 3 (acceptance check) and 4 (session 2's row).
- `docs/journeys/concepts.md`: what is already explained, so the page links to it instead of
  repeating it.
- `docs/journeys/frontend/calendar-view.md`: the page of session 1, the model for this one.
- `backend/tests/integration/calendar.test.ts`: the whole file once (the file's `beforeAll`, the
  blocks before `booking (route 17)` only to see what they leave behind), then the block itself in
  full, every `it`, its helpers and its `beforeAll`/`afterAll`.
- `backend/tests/integration/setup.ts`: the helpers the block calls (`api`, `signIn`,
  `removeUserIfPresent`, `resetCalendarTable`, `putCalendarItem`, `getCalendarItem`,
  `queryCalendarPartition` and whichever else it uses).
- The code the block reaches: `backend/src/handlers/bookAppointment.ts`, and in `backend/src/lib/`
  `calendarDb.ts` (`bookAppointment`, `withCalendarLock`), `calendarRules.ts`
  (`checkBookingTimes`, `checkBooking`, `cancellableUntilFor`) and `calendarEvents.ts`.
- `docs/SHARED_CALENDAR_SPEC.md`: section 8.1 and 8.2 (booking, R-BOOK-01 to R-BOOK-10), section 7
  (slots), section 6.7 (the conflict rule, for AC-25 to AC-27), section 9 (settings), section 11.1
  route 17 and its error codes, sections 13.2 and 13.4 (items and the calendar lock), section 15.2
  (the event item), section 18.2 and the scenarios of section 18.3 the block names (AC-10 to
  AC-19, AC-25 to AC-27, AC-34).

## What to write

1. **`docs/journeys/backend/calendar-booking.md`**, in the format of `docs/journeys/README.md`.
   The block has 17 tests that share state, so the story runs across tests: one subsection per
   test, in order, each saying what it adds to the state and what it checks. Points to cover:
   - the block's own setup: the throw-away Users `dave` and `erin`, the settings it saves first
     and restores at the end, its two types and its Wednesday pattern, the dates `W` and `W2`;
   - the mapping in the block's opening comment: in the scenarios of
     `docs/SHARED_CALENDAR_SPEC.md` section 18.3, `dave` plays `alice` and `erin` plays `bob`.
     Name the scenario of each test with its document;
   - what the block reads from the table, where a test checks it (AC-10: the `APPT`, `APPTID` and
     `EVENT` items; R-BOOK-10: the deleted-user marker; the last test: exactly one event per
     booking);
   - the race of AC-34 (two bookings of the same slot at the same moment) and why exactly one
     wins, which needs the calendar lock;
   - "If the block fails halfway": the file empties the table first, the block removes its Users
     before and after, and what the next run starts from.
   Use small state tables where they help (for example the Wednesday's slots after each booking)
   and a Mermaid sequence diagram where three or more actors take part.

2. **`docs/journeys/concepts.md`**: add, as the plan says for this session, the ideas several
   back-end pages will need, in simple words, each naming its section of
   `docs/SHARED_CALENDAR_SPEC.md`:
   - the `calendar` table and its items as the journeys see them (`APPT`, `APPTID`, `EVENT`, the
     deleted-user marker, the settings item), and why a pointer item instead of an index
     (`docs/SHARED_CALENDAR_SPEC.md` section 13.3);
   - the calendar lock: what it serialises, the retry, `409 concurrent_update`;
   - the event log: one event per change, and why it exists (the future e-mail notifications of
     `docs/SHARED_CALENDAR_SPEC.md` section 15).
   Remove the sentence near the top of `concepts.md` that announces these sections.
   Anything that matters only to the booking block stays in its page.

3. **The pointer comment** above `describe('booking (route 17)', …)`:
   `// Explained in simple words in docs/journeys/backend/calendar-booking.md.` Put it above the
   existing "Test names:" comment, so that comment stays directly above the `describe`.

4. **`docs/journeys/README.md`**: list the page under "Back end".
   **`docs/journeys/PLAN.md`**: session 2's status to "done".

## The format is still being proven

This is the first page that explains stored items. If the format of `docs/journeys/README.md` does
not fit (for example a section is missing for what a test reads from the table, or 17 tests need a
shorter form per test), propose the change, apply it to the README once agreed and bring
`docs/journeys/frontend/calendar-view.md` in line in the same session. Note what was learned for
the skill of session 4: what was hard to verify, which sources were needed, what took longest.

## Rules

- Every "the test checks" bullet matches an `expect` in the test. Every claim about the code or the
  rules is checked against its source before it is written. Every reference names its document by
  path and exists there.
- Where the test, the code and the specification disagree, say so in the report. Do not smooth it
  over in the page, and do not change the test or the specification in this session.
- No history in the page: no versions, no briefs, no "since step N".

## Acceptance check (`docs/journeys/PLAN.md` section 3)

- `npm run lint` is green at the root.
- Every "the test checks" bullet traced to its `expect`; every reference traced to its document.
- The pointer comment is in place; the page is listed in the README; session 2 is "done" in the
  plan.
- The report lists any disagreement found, the format changes proposed, and the notes for the
  skill.

Then stop for review.
