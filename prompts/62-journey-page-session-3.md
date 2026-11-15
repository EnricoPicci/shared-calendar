## Brief

Run session 3 of `docs/journeys/PLAN.md`: write the journey page
`docs/journeys/frontend/calendar-appointments.md`, which explains the `describe` block
`appointments` of `frontend/tests/integration/calendar.test.ts`. The session is done by hand, like
sessions 1 and 2 (no subagents). It is the last page written by hand before the skill of session 4,
and the first written in the format of `docs/journeys/README.md` from the start. One stop at the
end, for review. Commit only when asked.

This session writes documentation only. It changes no test behaviour, no source code and no
specification. The only code change is the pointer comment above the `describe`.

## Read these in full first

- `CLAUDE.md`, in particular "Where the truth lives", "Comments" and the front-end integration
  notes (the front end's calendar journeys never reset the local `calendar` table; the settings
  file `fe-calendar-settings.local.json`).
- `docs/journeys/README.md`: the reader, the format of a page (numbered tests, the short and the
  full form, the "In the table" group, "What the block leaves", "Background: …" headings) and the
  writing rules.
- `docs/journeys/PLAN.md`: sections 1 (approach), 3 (acceptance check), 4 (session 3's row) and
  5 (notes for the skill: apply what sessions 1 and 2 learned).
- `docs/journeys/concepts.md`: what is already explained, so the page links to it instead of
  repeating it.
- The two pages written so far, as models: `docs/journeys/frontend/calendar-view.md` (same file,
  same helpers) and `docs/journeys/backend/calendar-booking.md` (the booking rules and the
  appointment item, which this page can link to instead of repeating).
- `frontend/tests/integration/calendar.test.ts`: the whole file once (its `beforeAll`/`afterAll`,
  the clean-up helpers, `bookingSettings()`, `bookableDate()`, `release()`), then the block
  `appointments` in full, every `it` and every helper it calls. Read the next block,
  `availability conflict`, only to see what it expects this one to leave.
- `frontend/tests/integration/local.ts`: the helpers the block uses (`outcome()` and whichever
  else).
- The code the block reaches: `frontend/src/services/appointments.service.ts` and
  `appointments.types.ts`, `frontend/src/services/api.ts` (how an answer becomes a result, the
  `invalid_request` with the field before sending), and the shared schemas it checks with
  (`shared/src/calendar/schemas.ts`: the note, the booking and change bodies, the list query).
- `docs/FRONTEND_SERVICES.md` section 19 (`AppointmentsService`), section 8 decision 40 (the
  stream names) and section 14.4 (the calendar journeys).
- `docs/SHARED_CALENDAR_SPEC.md`: sections 8.2 to 8.6 (booking, cancelling, changing, the note,
  listing), section 11.1 routes 16 to 20 and their error codes, section 11.5 (the appointment as
  answered) and the rules the block's comments name (for example R-CHG-03).

## What to write

1. **`docs/journeys/frontend/calendar-appointments.md`**, in the format of
   `docs/journeys/README.md`. The block has five tests. The first tells a long story (book, slot
   taken, book for the User, note, change, upcoming, cancel) and gets the full form, with a state
   table of the day and a Mermaid sequence diagram; the other four are short. Points to cover:
   - the block's setup: the settings of `bookingSettings()` (link to the view page's explanation
     instead of repeating it), the date and window of `bookableDate()`, the Users `fe-calendar`
     and `fe-calendar-b`;
   - which service method each step calls, and which stream carries its result
     (`appointmentsResult$`, `updateNoteResult$`, not the specification's names:
     `docs/FRONTEND_SERVICES.md` section 8, decision 40);
   - the difference between a refusal the service decides before sending (no request) and one the
     API decides (the service sends it);
   - why a count or a free date can be trusted although the table is never reset (the comment
     "an earlier block may have left a cancelled one there");
   - "What the block leaves" and "If the block fails halfway".

2. **`docs/journeys/concepts.md`**: add an idea only if several pages will need it (for example the
   change of an appointment: the old one cancelled with `replacedBy`, the new one with `replaces`,
   if the back end's change page will need it too). Anything that matters only to this block stays
   in its page.

3. **The pointer comment** above `describe('appointments', …)`:
   `// Explained in simple words in docs/journeys/frontend/calendar-appointments.md.`

4. **`docs/journeys/README.md`**: list the page under "Front end".
   **`docs/journeys/PLAN.md`**: session 3's status to "done", and the session's notes for the skill
   in section 5, under "Session 3".

## The format

The format of `docs/journeys/README.md` is now settled by sessions 1 and 2. If this page still shows
a gap, propose the change in the report, apply it to the README once agreed, and bring the two
earlier pages in line in the same session.

## Rules

- Every "the test checks" bullet matches an `expect` in the test. Every claim about the code or the
  rules is checked against its source before it is written; what the server or the service does
  that no `expect` checks is written as its behaviour, never as a check. Every reference names its
  document by path and exists there.
- Where the test, the code and the specification disagree, say so in the report. Do not smooth it
  over in the page, and do not change the test or the specification in this session.
- No history in the page: no versions, no briefs, no "since step N". Neutral wording for the test
  Users.

## Acceptance check (`docs/journeys/PLAN.md` section 3)

- `npm run lint` is green at the root.
- Every "the test checks" bullet traced to its `expect`; every reference traced to its document.
- The pointer comment is in place; the page is listed in the README; session 3 is "done" in the
  plan, with its notes for the skill in section 5.
- The report lists any disagreement found, any format change proposed, and the notes for the
  skill.

Then stop for review.
