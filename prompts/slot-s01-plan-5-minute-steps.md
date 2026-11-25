Plan the implementation of a change of the calendar's time step: from 15 minutes to 5 minutes.

Today the Administrator's windows (weekly patterns, one-off windows, date overrides) and custom
appointment times start and end on 15-minute steps (`docs/SHARED_CALENDAR_SPEC.md` D2, D12,
R-BOOK-02, section 6.2). The change: the same times start and end on 5-minute steps, so that
the Administrator can open a window at 09:05 or book 10:10 to 10:35.

What does not change: a User still books only whole-hour slots, and a slot is still exactly 60
real minutes (R-SLOT-01). Slots do not start every 5 minutes. A window 08:05 to 12:00 therefore
still yields the slots 09:00, 10:00 and 11:00, and no slot starts at 08:05. If while planning you
find that this leaves a rule or a screen unclear, say so; do not change the slot.

A second change, in the page only, to plan with the first: the "from" time drives the "to" time.
Every time the Administrator chooses a "from" time, the page sets the "to" time to one hour
later. Changing the "to" time never touches the "from" time, so any length is entered by
choosing "from" first and "to" second (decided by the Product Owner; the rule "a change of
'to' moves 'from' one hour earlier" was considered and dropped, since the two together would
allow only lengths of one hour).

- It applies to every place with a "from" and a "to" time: the forms that create and change a
  weekly pattern on the Availability page, the forms of a window on the page of a date, and the
  Administrator's times in the dialog that books or moves an appointment.
- When one hour later is not among the times offered, "to" becomes the last time offered: 24:00
  in a form of a window ("from" 23:30 gives "to" 24:00), the end of the window that holds the
  slot in the dialog ("from" 11:40 in a window that ends at 12:00 gives "to" 12:00).
- A form that opens with times already in it (the change of a pattern, the dialog with the
  slot's own hour) shows them as they are: only a choice of "from" by the person sets "to".
- The API, the assistant and the rules of the server do not change for this. It belongs to the
  logic layer of the page (`docs/FRONTEND_ARCHITECTURE.md` section 5.1), with its unit tests,
  and to `docs/FRONTEND_WALK.md`.

Where the 15-minute step is known today (a starting list, not complete; search for the rest):

- `shared/src/calendar/rules.ts` (`isOnQuarterGrid`) and `shared/src/calendar/schemas.ts`
  (`LocalTime`, the regex of the minutes);
- `backend/src/lib/calendarRules.ts` (the check of custom times, the minimum length of 15
  minutes);
- `backend/src/assistant/prompt.ts` and `backend/src/assistant/tools/facts.ts` (the assistant is
  told "the quarter hour"), which changes the assistant's instructions and so needs its
  evaluation to be looked at (`docs/CONVERSATIONAL_ARCHITECTURE.md`);
- `frontend/src/logic/availability.model.ts` and `frontend/src/logic/booking.ts` (`GRID`) and
  the screens that offer times;
- the documents: the spec, `docs/ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md`,
  `docs/FRONTEND_ARCHITECTURE.md`, the journeys in `docs/journeys/`, `docs/FRONTEND_WALK.md`.

Points to look at, and to put to me as questions where the documents do not decide them:

- What the step of the minimum length becomes: 5 minutes, or something longer.
- Whether the API's error messages and codes change: a time on the old grid stays valid, so
  nothing that works today should be refused, but a time off the 5-minute grid is refused with
  `400 invalid_request`. Is this a change that keeps every client working (the next minor
  version, `README.md` section "Versions")?
- Data already stored: every window and appointment of today is on the 15-minute grid, which is
  also on the 5-minute grid. Check that nothing needs a migration.
- The screens: a list of every 5-minute time of a day is 288 entries. How the page offers a
  time (a list, a field with a step) is a decision for the Product Owner, so ask.
- The counting of people in an interval, the merging of windows, the night the clocks change:
  confirm that none of them depends on the 15-minute step.

Work on the branch `slot-5min`, in its own worktree, beside the mail work on `main`; the
documents most likely to meet a change of the mail work are `shared/src/api.ts`,
`backend/template.yaml` and `docs/ARCHITECTURE.md`.

Ask any questions you may have to clarify this task. Start working only when everything is
clear. The result is a plan, `docs/SLOT_STEP_PLAN.md`, in the shape of `docs/CAPACITY_PLAN.md`
(steps with an acceptance check each), and no code.
