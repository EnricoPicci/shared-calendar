Plan the implementation of a change of the windows and the slots: a window lasts whole hours from
any 5-minute start, and its slots are the hours counted from that start.

Today a User books only a slot: a whole local hour, `hh:00` to `hh+1:00`, 60 real minutes, lying
entirely inside one effective window (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01, decision D32).
Since `v2.4.0` the Administrator's windows start and end on any 5-minute step, so a window
09:05–10:05 gives a User nothing to book; found at the release's quick look
(`docs/RUNBOOK.md` section 5.9).

Decided by the Product Owner on 2026-11-25:

1. **A window lasts a whole number of hours.** It may start on any 5-minute step of the local
   clock (`TIME_STEP_MINUTES`), and its end is its start plus 1, 2, 3 … hours on that clock:
   09:05–11:05 is a window, 09:05–10:30 is not. This holds for the windows of a weekly pattern,
   of a date override and for a one-off window.
2. **A User's slots are the whole hours counted from the window's start**: 09:05–11:05 gives
   the slots 09:05–10:05 and 10:05–11:05. Each slot still lasts 60 real minutes and lies inside
   one effective window of one type.
3. **Windows of the same type that touch are joined, as today** (the spec's section 6.6), and
   the slots are counted from the start of the joined window: 09:05–10:05 and 10:05–12:05 give
   09:05, 10:05 and 11:05.
4. **The nights the clocks change:** the window is checked as whole hours on the local clock;
   its slots are 60 real minutes each from its start, as many as fit, as today (two slots in a
   window 01:05–04:05 the night the clocks go forward, four the night they go back).
5. **A window that is not whole hours is refused** by the page's form before it is sent, and by
   the server with `400 invalid_request` and a sentence of its own; no new error code.
6. **In the window forms the end is chosen as an hour only**: its minute follows the start's
   minute by itself and is not a choice, so a window of whole hours is the only one that can be
   entered. A start chosen still sets the end one hour later.
7. **Windows already stored that are not whole hours** are not changed by code: before the
   release a read-only check lists them in the cloud, and the operator changes or deletes each
   one in the page.
8. **Where and when:** built on the branch `slot-5min`, which holds no code of the mail work,
   and released alone before the mail work, as the next minor version; the merge into `main`
   then carries both (`docs/SLOT_STEP_PLAN.md` section 6).

What does not change: the calendar's answer keeps its list of slots in the same shape (only the
starts are no longer on the hour); the capacity of a type and the counting of the people in an
interval (R-SLOT-02); a slot's places; the notice, horizon and limit of a User; what the
Administrator sees and may book over the capacity (R-SLOT-04, R-BOOK-13); the Administrator's
custom appointment times (any length of at least 5 minutes inside one window, R-BOOK-02, still
chosen as an hour and a minute); the week draws a slot as a block, as today. If planning proves
one of these must change, say so and ask.

Where the slot on the hour and the free end of a window are known today (a starting list, not
complete; search for the rest):

- the spec: D32, the glossary, sections 6.2 to 6.6, R-SLOT-01 with its examples (08:30–12:00
  and 08:05–12:00 become windows that cannot be saved), R-BOOK-* where a User's start must be a
  slot, the example of section 11.6, 16.8, the acceptance scenarios and 18.4;
  `docs/ARCHITECTURE.md` section 4 and a version row;
- `shared/src/calendar/` (the slots computed from the effective windows, the check of a
  window), the seeds and fixtures that hold windows not whole hours;
- `backend/src/lib/calendarRules.ts` and the handlers of patterns, overrides and one-off
  windows; the existing tests and journeys whose windows are not whole hours;
- `backend/src/assistant/` (the instructions and the descriptions of the opening-hours tools)
  and `backend/tests/eval/requests.ts`: the instructions change, so the conversations in
  progress end at the deploy and a paid run is needed (`docs/CONVERSATIONAL_ARCHITECTURE.md`
  section 12.3), its cost said first;
- `frontend/src/logic/times.ts`, `availability.model.ts`, `date.model.ts`, `week.model.ts`, the
  window forms and the date's screen; `frontend/scripts/seed-local.mjs`;
- `backend/scripts/smoke.sh` (its window and its slot), the journeys and their pages in
  `docs/journeys/`, `docs/FRONTEND_WALK.md` (sections 4 and 11 most of all).

Points still to look at, and to put to me only if the documents and the decisions above do not
settle them:

- A User's appointment booked before the release on the hour, in a window that the operator
  then changes: what the page and the API show and allow for it afterwards.
- The read-only check of decision 7: what it reads (an `aws` query of the `calendar` table, or
  the API as the Administrator), what it prints, and where in `docs/RUNBOOK.md` it goes.
- What the assistant does with a request for a window that is not whole hours: refuse with the
  server's sentence, or propose the nearest whole hours. Which new requests the evaluation
  needs, in English and Italian.
- Whether a change of an existing pattern or override that keeps an old window not whole hours
  is refused, and how the page tells the Administrator which window to fix.

How the plan tests, decided by the Product Owner:

- **Only what is strictly necessary.** Each step's check is `typecheck`, `lint`, `test:unit` and
  only the journeys the step adds or changes, run alone; no root `verify`, no whole journey
  suite, no full walk inside a step. New tests cover the new rule and the cases it moves (a
  window not whole hours refused, the slots from a 5-minute start, joined windows, the nights
  the clocks change), not a second copy of what is already tested.
- **The full regression once, at the end**, in the release step, as the root `CLAUDE.md`
  requires before a deploy: root `verify`, the front end's journeys, the smoke test.
- **The walk kept to the change.** No step walks `docs/FRONTEND_WALK.md` whole. A step that
  changes a screen looks only at what it changes, at one width, with a handful of checks. The
  release walks the walk's checks of the window forms, of a date and of the book dialog, plus
  one look at a phone width, and records why the rest was not walked; the plan says which
  checks, by number, and their count. A walk of the whole page at two widths, as in
  `docs/SLOT_STEP_PLAN.md` step s6, is not repeated.
- The walk's new checks for this change are few and replace the ones they make wrong; they do
  not add a new long section.

Ask any questions you may have to clarify this task. Start working only when everything is
clear. The result is a plan, `docs/WINDOW_HOURS_PLAN.md`, in the shape of
`docs/SLOT_STEP_PLAN.md` (planning findings, steps with an acceptance check each, the release
last), and no code.
