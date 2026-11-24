## Before opening the new session (operator)

Nothing to start. This step changes documents only: it needs no Docker, no local stack, no
AWS login and no Anthropic key. `nvm use` is enough.

## Brief

Implement plan step u1, "The rules in the documents" (`docs/CAPACITY_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

After this step the governing documents say how an availability type's capacity works, before
any code exists: a type holds 1 to 100 people at the same time (default 1), a slot is free while
the people in it are fewer than its type's capacity, a User sees the places left, and the
Administrator may book over the capacity with an explicit `overbook` flag. No file of code
changes in this step, and nothing is deployed. The shared contract is step u2 and is not started
here.

Read these in full first:
- `CLAUDE.md`, in particular "Where the truth lives", "Working rhythm" (**the closing message is
  short**), "Hard rules from the design" and "Comments" (the reference form, which
  `npm run lint` checks in the documents too).
- `docs/CAPACITY_PLAN.md`, all of it: the decisions K1 to K8 (section 2), the findings F1 to F10
  (section 3), **the rules as they will read (section 4)**, step u1, and steps u2 to u7 to see
  what this step must not take from them.
- `docs/SHARED_CALENDAR_SPEC.md`: the status table and the change log; section 3 (the decisions
  D1 to D23, the table the new rows join); section 6.1 (the type); section 6.7 (R-AV-03, which
  does not change: say why if a sentence seems to need it); **section 7 (the slots) and section
  8.2 (the booking, its rules and the order of its checks) in full**; section 8.4 (R-CHG-01);
  section 9 (R-SET-03, the model of K5); sections 11.1 to 11.6 (the routes 4 and 5, the error
  codes, the bodies, the response types, **the calendar view and its example**); section 13.2
  (the `TYPE` item); section 15.2 (the event, which does not change: F9); section 18.3 (the
  acceptance scenarios); section 22.
- `docs/ARCHITECTURE.md`: the status line and the change log; section 4 (the API contract:
  the calendar's routes, the error codes); section 5.3 (the table `calendar`).
- `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md` and
  `docs/CONVERSATIONAL_ARCHITECTURE.md`: the status line and the change log of each, and in the
  last one section 5.5, rule 4 (finding F8). Only one line of each changes.
- The code, **read only**, to check that the plan's findings are true: in
  `backend/src/lib/calendarRules.ts`, `checkBooking` and `calendarView`;
  `shared/src/calendar/schemas.ts` (`TypeBody`, `BookBody`, `ChangeBody`) and `types.ts`
  (`AvailabilityType`, `Slot`); `frontend/src/logic/week.model.ts` (`lanes`) and `booking.ts`.

## Where we are (2026-11-24)

- `docs/CAPACITY_PLAN.md` v1 is committed (`70d9990`, not pushed); v2 records the four answers
  to F4–F7. Nothing is built.
- The calendar today allows one person per time: `docs/SHARED_CALENDAR_SPEC.md` R-BOOK-07 "no
  active appointment overlaps" and R-SLOT-02 "a slot is free when it overlaps no active
  appointment". This step turns both into "fewer people than the capacity", on paper.
- `docs/SHARED_CALENDAR_SPEC.md` is at v16; `docs/ARCHITECTURE.md` has v14 as its last row.

## Decided already (the Product Owner, 2026-11-24)

The decisions K1 to K8 of `docs/CAPACITY_PLAN.md` section 2. Apply them; if a document or the
code proves one wrong, stop and tell me before going on. In short: 1 to 100, default 1; the
force is an explicit `overbook: true` after a `409 slot_taken`, for the Administrator only;
people counted at their peak; one User never in two appointments at the same time, forced or
not; a lowered capacity cancels nothing; a User sees the places left, never who; the assistant
knows the capacity, forcing included.

## The step

1. **The four proposals of planning are decided** (the Product Owner, 2026-11-24; recorded in
   `docs/CAPACITY_PLAN.md` v2, section 3). Apply them, do not ask again:
   - F4: `busy` for a User is the time where the people reach the capacity, minus the User's
     own appointments; with a capacity of 1, two other people's appointments that touch become
     one interval instead of two. Accepted.
   - F5: the Administrator's `slots` also hold the full ones, with `placesLeft: 0`, so the
     Administrator clicks a full slot to book over the capacity; a User never gets a full slot.
   - F6, **changed from the plan's proposal**: in the Administrator's week, appointments that
     overlap are drawn side by side, one block each, up to three; four or more are one block,
     "4 people · Swimming Pool", which opens the list. In this step only section 16.8 of
     `docs/SHARED_CALENDAR_SPEC.md` (the functional needs of the views) mentions it; the
     drawing is step u5.
   - F7: `capacity` is optional in both type bodies: absent at creation is 1, absent at an edit
     keeps the stored value.
2. **Check the findings against the code** listed above (F1, F3, F5, F6, F7), and report in
   one line each whether they hold. **If one does not, stop and tell me**, with the correction
   to the plan proposed.
3. **`docs/SHARED_CALENDAR_SPEC.md`**, v17, with its change log line and the status table:
   - Section 3: the decisions D24 onwards, one per decision K1 to K7 and one for F9 (why a
     forced booking is not stored), each in the table's style.
   - Section 6.1: the field `capacity` in the type's table; R-TYPE-05 (K5).
   - Section 7: R-SLOT-02 (the people in an interval, `placesLeft`), R-SLOT-03 (not over one's
     own appointment), R-SLOT-04 (the Administrator's full slots), R-SLOT-05 restated with
     people. A worked example with the Swimming Pool at capacity 3.
   - Section 8.2: R-BOOK-07 rewritten, R-BOOK-12 (one place per person, `user_busy`) and
     R-BOOK-13 (`overbook`), in the table; **the order of the checks** with R-BOOK-13 among
     the checks of the body and the caller, and R-BOOK-12 before R-BOOK-07 in step 5.
   - Section 8.4: R-CHG-01's adjustments cover R-BOOK-07 and R-BOOK-12; `overbook` on a change.
   - Section 11: routes 4 and 5 (`{ name, capacity? }`, F7); the new error code `user_busy` in
     11.3; `overbook` in the bodies of 11.4; `capacity` in `AvailabilityType` and `capacity`,
     `placesLeft` in `Slot` (11.5, 11.6); the meaning of `busy` (F4). **The example of 11.6
     gains the two fields on every slot and changes no other value**: the unit test reproduces
     it byte for byte in step u3.
   - Section 13.2: `capacity` (N) on the `TYPE` item, absent read as 1, no migration (F10).
   - Section 18.3: the acceptance scenarios of the plan's section 4.
   - Every sentence written as **designed and not built yet**, with `docs/CAPACITY_PLAN.md`
     named as where it is built, the way the documents already speak of unbuilt parts.
4. **`docs/ARCHITECTURE.md`**, a v15 row in the change log and the status line: section 4 (the
   two bodies, the error code `user_busy`, the slot's fields), section 5.3 (the `TYPE` item's
   `capacity`). No route, function, role or permission is added: say so in the row.
5. **`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
   `docs/CONVERSATIONAL_ARCHITECTURE.md`**: one line each, in the status, that the capacity of
   `docs/SHARED_CALENDAR_SPEC.md` changes them in steps u4, u5 and u6 of
   `docs/CAPACITY_PLAN.md`, so that none of them says something false meanwhile. Nothing else
   in them.
6. **`docs/CAPACITY_PLAN.md`**: section 4 corrected where needed, an "As done" note under
   step u1 that ends with what step u2 finds ready, and the version line.

Not in this step: any file under `backend/`, `frontend/` or `shared/`; `README.md`,
`docs/RUNBOOK.md`, `docs/COMMANDS.md`, `docs/FRONTEND_WALK.md` and `docs/journeys/`, which
change with the steps that build what they describe; `CLAUDE.md` (no new hard rule: the
capacity is a rule of the calendar, it lives in the spec); any `aws` command; the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a finding the code contradicts; a rule of the
  plan's section 4 that cannot be written without contradicting another rule of the spec; two
  documents that disagree (the spec and the architecture win over the plan, the plan over this
  brief).
- Write as the documents are written: plain words, each reference with the document's path in
  the same sentence, no step or brief number inside a sentence that describes the design (the
  change log and the status lines are where those belong).
- A new or changed Mermaid diagram, if any, follows `.claude/rules/diagrams.md` and is checked
  as it says; the pictures go to the session's scratch folder, never into the repository.
- Commit only when asked. Do not push. Do not start step u2.

## Acceptance (`docs/CAPACITY_PLAN.md` step u1)

- The spec states F4, F5 and F7 as decided, and F6 in section 16.8.
- The findings checked against the code hold, or are corrected in the plan.
- `docs/SHARED_CALENDAR_SPEC.md` v17 states the capacity in the sections listed; no sentence of
  it still says a slot is free only when it overlaps no appointment, or that a type has only a
  name; the example of 11.6 differs from v16 only by the two new fields.
- `docs/ARCHITECTURE.md` has its v15 row and agrees with the spec on the contract.
- `npm run lint` green at the root (the references in the documents).
- `git status` shows changes under `docs/` only.
- The "As done" note holds the detail. Then the short closing message, and suggest the commit.
