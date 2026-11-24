## Brief

Implement plan step u5, "The front end's screens" (`docs/CAPACITY_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

After this step the page shows and offers the capacity: the types screen asks for it, a slot
says its places left, the Administrator sees the full slots and can book over the capacity after
"Book anyway?", the Administrator's week draws several people in one hour, and `user_busy` names
the appointment in the way. The assistant's panel keeps its behaviour (step u6). Nothing is
deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments", "Tooling and style" (100 % line coverage on
  `frontend/src`); then `frontend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of
  `.claude/rules/` load when a file of their paths is read.
- `docs/CAPACITY_PLAN.md`, all of it: the decisions (section 2), the findings (section 3, **F5
  and F6**), the rules (section 4), **the "As done" note of step u4 and its "Step u5 finds
  ready"**, step u5, and step u6 to see what this step must not take from it.
- `docs/SHARED_CALENDAR_SPEC.md` v17: decisions D24 to D31; R-TYPE-02, R-TYPE-05; R-SLOT-02 to
  R-SLOT-06; R-BOOK-07, R-BOOK-12, R-BOOK-13, R-CHG-01; R-VIEW-01; section 11.6; **section 16.8**
  (the rows "Week calendar" and "Book dialog" say what the screens must do); AC-15 and AC-37 to
  AC-44.
- `docs/FRONTEND_ARCHITECTURE.md`: its status line (the sentence "Not yet in line with the
  capacity of a type", which this step removes); section 3 (the rules of a view), 4 (a dialog, a
  form), 5.1 (the logic layer, the rows of `week.model.ts`, `booking.ts`, `availability.model.ts`,
  `texts.ts`, and the paragraph "Failures in plain words"), 6 (the shell), 8 (the tests), 10 (the
  open points), 12.
- `docs/FRONTEND_SERVICES.md` v12: sections 8 (decision 70), 16 and 19, as step u4 left them.
- `docs/FRONTEND_WALK.md`: how a walk is done (both widths, headless Chromium), and the checks of
  the week, the book dialog, the change and the types (check 12 among them).
- The code: `frontend/src/logic/week.model.ts` (`Placed`, `lanesOf`: `lanes: 1 | 2` is made for
  the hour repeated when the clocks go back), `week.screen.ts`, `booking.ts`, `texts.ts`
  (`failureText`, `Attempt`), `availability.model.ts` and `availability.screen.ts`,
  `date.model.ts` and `date.screen.ts`, `appointment.detail.ts`; `frontend/src/views/week.view.ts`
  (the book dialog, `bookState$`, `changeState$`), `detail.view.ts`, `availability.view.ts` and
  `availability.parts.ts`, `shell.ts`; `frontend/index.html` and `frontend/style.css`; their tests
  under `frontend/tests/unit/`.

## Where we are (2026-11-24)

- Steps u1 (`2f4ab56`), u2 (`85e93dd`), u3 (`9e87417`) and u4 (`68d9e90`) are committed, not
  pushed. The local API runs the capacity; every slot carries `capacity` and `placesLeft`, the
  Administrator's full ones with `placesLeft: 0`.
- The services are ready: `AvailabilityTypesService.create(name, capacity?)` and
  `rename(typeId, name, capacity?)`; `AppointmentsService.book` and `change` send `overbook` as
  given; `user_busy` is a reason of both, with the User's sentence in `failureText`.
- No screen uses any of it: the types screen sends a name only; a slot says nothing of its
  places; the Administrator's full slots are drawn like free ones (or not at all: check); a
  booking refused with `slot_taken` reloads the week (`week.screen.ts`) and offers nothing; the
  Administrator reads the User's sentence of `user_busy`; the week draws at most two blocks side
  by side.

## Decided already (the Product Owner)

The decisions K1 to K8 and F4 to F7 of `docs/CAPACITY_PLAN.md`, written into
`docs/SHARED_CALENDAR_SPEC.md` as D24 to D31, and the decisions of steps u2 to u4 (the sentences
of `user_busy` and `slot_taken`; the Administrator's `user_busy` sentence "This User already has
an appointment at this time." is this step's, with the role passed in). Apply them; if the spec
or the code proves one wrong, stop and tell me.

## Decided for this step (the Product Owner, 2026-11-24)

1. **`user_busy` names the appointment in the way, and offers nothing more.** The page looks,
   among the appointments of the week shown, for the target User's active appointment that
   overlaps the time asked (on a change, the appointment being moved left out,
   `docs/SHARED_CALENDAR_SPEC.md` R-CHG-01), and names its time and type:
   - a User: "You already have an appointment at this time (09:15–10:00 · Studio); open it to
     change it."
   - the Administrator: "alice already has an appointment at this time (09:15–10:00 · Studio)."
   - when none is found in the week shown, the sentences without the brackets: the User's of step
     u4, the Administrator's "This User already has an appointment at this time."

   No one-click change: the person opens the appointment and uses the existing change.
2. **"Book anyway?" always comes through the `409`.** The book dialog never sends `overbook`
   first, full slot or not. On `slot_taken` for the Administrator the dialog stays open with
   "This time is full: there is no place left. Book anyway, over the capacity?" and a button
   "Book anyway" that sends the same request again with `overbook: true`; on a change the same,
   "Change anyway?" and "Change anyway". Changing anything in the dialog (times, User, note)
   hides the offer again: it is for the request that was refused only. A User's `slot_taken` is
   unchanged (the sentence of step u4, the week reloaded). `user_busy` gets no such offer
   (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-13: the force does not lift it).
3. **The Administrator's week groups by the peak.** A group is the appointments of one day
   chained by overlap (`[start, end)`, so touching ones are not chained). A group whose peak is at
   most three is drawn side by side, each appointment in a column given by interval colouring
   (the earliest first, the leftmost free column), the group's width shared by its columns. A
   group whose peak is four or more is one block over the group's whole span, "N people ·
   Swimming Pool" (N the appointments in the group; the type of the window, which is one, by
   `docs/CAPACITY_PLAN.md` F2), which opens a list dialog: each row its time and User, a button
   that opens the appointment's detail as today. A chain 10:00–10:30, 10:15–10:45, 10:30–11:00,
   10:45–11:15 is side by side in two columns. The hour repeated when the clocks go back keeps
   its two lanes, the same model: `lane` and `lanes` widen to the columns, and the tests of the
   repeated hour stay green. A User's own appointments never overlap (R-BOOK-12): their week
   draws as today.
4. **The types screen.** "Rename" becomes "Edit", a dialog with the name and the capacity
   (prefilled with the type's own, a number 1 to 100); the new-type form gains a capacity field
   set to 1. Both always send the capacity the field holds. The list shows "· 3 places" beside
   a name only for a capacity above 1. The field's refusal is checked before sending with the
   shared bounds (`TYPE_CAPACITY`), in words under the field, as the name's.

What the spec already says, applied as it is: a slot whose capacity is above 1 says "2 of 3
places left" (for a User and the Administrator); a capacity of 1 says nothing new. The
Administrator's full slot is drawn apart (a style of its own, "Full" in its text) and opens the
book dialog like a free one.

## The step

1. **Read the decisions of this step** and apply them as written.
2. **`week.model.ts`:** a slot's places in words; the full slot's mark; the groups of decision
   3 (the group block a new kind of block, with what the list dialog needs). Pure, with the
   arithmetic out of the view.
3. **`booking.ts` and `texts.ts`:** the sentence of `user_busy` with the appointment in the way
   (decision 1), found by a pure function; the Administrator's sentence of `slot_taken` with the
   offer (decision 2); `failureText` told who attempted, in the way you find simplest (say which
   in the "As done" note).
4. **`week.view.ts`, `detail.view.ts`, `index.html`, `style.css`:** the places, the full slot,
   "Book anyway" / "Change anyway", the group block and its list dialog (the shape of a dialog
   of `docs/FRONTEND_ARCHITECTURE.md` section 4), at both widths.
5. **The types screen** (`availability.model.ts`, `availability.screen.ts`, `availability.view.ts`,
   `availability.parts.ts`): decision 4. Check `date.model.ts` and `date.screen.ts` for the
   same assumptions (one person per hour, a type that is only a name) and say what you found.
6. **Unit tests:** for every change, by the rules of `docs/FRONTEND_ARCHITECTURE.md` section 8:
   the places (capacity 1, 3 with 2 left, 0 for the Administrator); the groups (one, two, three
   side by side; four as one block; the chain of decision 3; touching appointments not
   grouped; the repeated hour); the offer shown, sent with `overbook: true`, hidden again after
   a change of the form, never for a User nor for `user_busy`; the sentences of `user_busy`
   found and not found, User and Administrator, booking and change; the capacity field at
   creation and edit, its refusals (0, 101, 2.5, empty). 100 % line coverage on `frontend/src`.
7. **The front end's journeys** test the services and do not change in this step; if one has
   to, stop and tell me.
8. **The walk** (`docs/FRONTEND_WALK.md`): new checks, then walked in headless Chromium at both
   widths, after `local:down`, `local:up`, `local:api` and `seed:local`: a type of capacity 3
   created on the types screen, edited to 2 and back; alice booking a slot of it ("2 of 3
   places left" after); a second User booking it; a third filling it (the slot gone for the
   Users, "busy" for a fourth, drawn full for the Administrator); the Administrator refused, then
   "Book anyway" for a fourth; the four drawn as one block and the list opening each detail;
   two and three drawn side by side; alice booking over her own appointment (the sentence that
   names it), and the Administrator doing the same for her. Check 12 and the other checks
   brought in line. Screenshots stay in the scratchpad.
9. **Documents**, in the same change:
   - `docs/FRONTEND_ARCHITECTURE.md`: a new version (v22) in the status line, the sentence "Not
     yet in line with the capacity of a type" removed; the decisions above where they belong
     (sections 4, 5.1 and "Failures in plain words"); section 10 if an open point arises.
   - `docs/FRONTEND_WALK.md`: the new checks, and the date of the walk.
   - `docs/ARCHITECTURE.md`: step u5's sentence in the v15 row (still open).
   - `docs/SHARED_CALENDAR_SPEC.md` section 16.8: only where the screens as built prove it wrong,
     after telling me.
   - `docs/CAPACITY_PLAN.md`: an "As done" note under step u5 that ends with what step u6 finds
     ready, and the version line (v7).

Not in this step: the assistant's panel, its proposals and `backend/src/assistant` (step u6,
the panel reads `failureText` as it is); anything under `backend/` or `shared/src` (if the
contract seems to need a change, stop); `frontend/src/services` (if a service seems to need a
change, stop); `seed:local`; `README.md`, `docs/RUNBOOK.md`, `docs/CONVERSATIONAL_*`; any `aws`
command; the cloud; `npm run deploy`.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing; a decision above that the code proves
  awkward (for example a group block that cannot be read at the phone width); any change outside
  `frontend/src/logic`, `frontend/src/views`, `frontend/index.html`, `frontend/style.css`,
  `frontend/tests/unit` and `docs/`; a change the services or the contract would need.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- The local stack: `local:up` and `local:api` running; the back end's journeys empty the local
  `calendar` table, so restart the stack and `seed:local` before the walk, and never run the two
  packages' journeys at the same time.
- Commit only when asked. Do not push. Do not start step u6.

## Acceptance (`docs/CAPACITY_PLAN.md` step u5)

- The types screen sets and edits a capacity; a slot says its places left; the Administrator
  sees a full slot and books it after "Book anyway"; the Administrator's week draws up to three
  side by side and four or more as one block with its list; `user_busy` names the appointment in
  the way for both roles.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; 100 % line
  coverage on `frontend/src`.
- **The root `DYNAMODB_PORT=8002 npm run verify` PASSED** with `local:up` and `local:api`
  running; then, apart, `RUN_INTEGRATION=1 npm run test:integration -w frontend` passed
  unchanged.
- The new checks of `docs/FRONTEND_WALK.md` walked at both widths, each one's result said.
- `git status` shows changes under `frontend/src/logic`, `frontend/src/views`,
  `frontend/index.html`, `frontend/style.css`, `frontend/tests/unit` and `docs/` only.
- The "As done" note holds the detail: the four decisions as applied, how `failureText` learns
  the role, what `date.model.ts` needed, each test added, each walk check and its result. Then
  the short closing message, and suggest the commit.
