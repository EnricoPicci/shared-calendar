## Before opening the new session (operator)

This step changes the shared contract and runs the gate, which runs the back end's journeys
against the local stack. In the checkout, after `nvm use`, with Docker running and **no
`ANTHROPIC_API_KEY` in the shell** (the journeys refuse the real Claude):

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

Start the stack from the same folder the session works in: `backend/env.local.json` is written
by `local:up` and names the local user pool. No AWS login and no Anthropic key are needed.
Nothing goes to the cloud in this step.

## Brief

Implement plan step u2, "The shared contract (`shared/`)" (`docs/CAPACITY_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

After this step `shared/` holds what the back end and the browser will share for the capacity
of a type: the capacity's range and default, `capacity` in the type's body, `overbook` in the
booking and change bodies, the error code `user_busy`, and the pure rule that counts the people
in an interval at their peak. Nothing under `backend/src` or `frontend/src` uses them yet; the
back end is step u3 and is not started here. Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (`shared/` imports only TypeScript and `zod`; a new error code starts in
  `shared/src/api.ts`), "Comments" (the reference form), "Tooling and style" (100 % line
  coverage on `shared/src`); then `shared/CLAUDE.md`. The rule `.claude/rules/comments.md`
  loads when a file of code is read.
- `docs/CAPACITY_PLAN.md`, all of it: the decisions (section 2), the findings (section 3, F4 to
  F7 decided), the rules (section 4), **the "As done" note of step u1 and its "Step u2 finds
  ready"**, step u2, and step u3 to see what this step must not take from it.
- `docs/SHARED_CALENDAR_SPEC.md` v17: decisions D24 to D31; the glossary rows "Capacity",
  "People in an interval", "Places left"; section 6.1 (R-TYPE-05); **section 7, R-SLOT-02 and
  R-SLOT-06**; section 8.2 (R-BOOK-07, R-BOOK-12, R-BOOK-13); sections 11.3 to 11.6; section
  12 (what each file of `shared/` holds); section 18.1.
- `docs/ARCHITECTURE.md`: the v15 row and section 4's paragraph "The capacity of a type".
- The code: `shared/src/api.ts`; `shared/src/calendar/defaults.ts`, `schemas.ts` (`TypeBody`,
  `BookBody`, `ChangeBody`), `types.ts` (`AvailabilityType`, `Slot`), `rules.ts` (`overlaps`,
  `slotsOf`), `shared/src/index.ts`; their tests under `shared/tests/calendar/`.

## Where we are (2026-11-24)

- Step u1 is committed (`2f4ab56`, not pushed): the rules are in the spec (v17) and the
  architecture (v15 open), marked "not built yet". No code of the capacity exists.
- Today a slot is free when it overlaps no active appointment; `overlaps` in
  `shared/src/calendar/rules.ts` is the only shared comparison of two intervals.

## Decided already (the Product Owner, 2026-11-24)

The decisions K1 to K8 and the findings F4 to F7 of `docs/CAPACITY_PLAN.md`, written into
`docs/SHARED_CALENDAR_SPEC.md` as D24 to D31. Apply them; if the spec or the code proves one
wrong, stop and tell me before going on.

## Decided for this step (the Product Owner, 2026-11-24)

1. **The new response fields move to step u3.** `AvailabilityType.capacity`, `Slot.capacity`
   and `Slot.placesLeft` are not added here: made required now they would break the typecheck
   of up to about 35 files outside `shared/` before step u3 builds what fills them in. This step
   adds only what changes nothing elsewhere (the range, the two bodies, the code, `peopleIn`);
   u3 adds the three fields together with the code that produces them. The plan's steps u2 and
   u3 are amended in this step to say so.
2. **The short gap is accepted** (see "Known gap" under the step): the back end's schemas accept
   `capacity` and `overbook` before the handlers read them. No temporary check is added.

## The step

1. **The capacity's range and default** in `shared/src/calendar/defaults.ts`, beside the other
   limits and ranges, in their style (1 to 100, default 1: `docs/SHARED_CALENDAR_SPEC.md`
   decision D24, R-TYPE-05).
2. **`shared/src/calendar/schemas.ts`:**
   - `TypeBody`: `capacity` optional, an integer within the range of point 1, still `.strict()`.
     No default in the schema: absent means 1 at creation and "keep the stored value" at an
     edit (`docs/SHARED_CALENDAR_SPEC.md` section 11.4), which only the handler can tell apart.
   - `BookBody` and `ChangeBody`: `overbook` optional, a boolean. Whether a User may send `true`
     is the handler's check (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-13), not the schema's.
3. **`shared/src/api.ts`:** `user_busy` in `ApiErrorCode`, next to `slot_taken`, with its comment
   in the style of the others (409, `docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12); `slot_taken`'s
   comment says "no place left".
4. **`shared/src/calendar/rules.ts`: `peopleIn`**, pure: given an interval and a list of
   intervals (the active appointments, as instants), the most of them present at one instant
   inside the interval (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-02, decision D25). Intervals are
   `[start, end)`: two that touch are never present together. The caller chooses which
   appointments to pass (booked ones, the old one of a change left out, the User's own or not):
   the function only counts. Exported through `shared/src/index.ts`.
5. **`shared/src/calendar/types.ts`:** unchanged (decision 1).
6. **Tests** under `shared/tests/calendar/`, 100 % line coverage kept:
   - the schemas: `capacity` absent, 1, 100 accepted; 0, 101, 2.5, `"3"`, `null` refused;
     `overbook` absent, `true`, `false` accepted, `"true"` and `1` refused; an unknown field
     still refused in each body;
   - `peopleIn`: no appointment (0); one inside; two that touch (1); the two pairs of D25 in a
     slot of capacity 2 (10:00–10:30 with 10:30–11:00 gives 1, 10:00–10:30 with 10:15–11:00
     gives 2); an appointment that only touches the interval's edge (not counted); one that
     covers the whole interval; three nested; the order of the list not mattering; the night
     clocks go back, with instants an hour apart at the same local time (`Europe/Rome`,
     2026-10-25).
7. **Documents**, in the same change:
   - `docs/SHARED_CALENDAR_SPEC.md` section 12 (the shared contract) if what a file holds is
     listed there; `shared/CLAUDE.md`'s folder map (`rules.ts` also counts the people in an
     interval). Follow "Changing these files" of `CLAUDE.md` for the latter.
   - `docs/ARCHITECTURE.md`: step u2's sentence in the v15 row.
   - `docs/CAPACITY_PLAN.md`: steps u2 and u3 amended for decision 1 (the three response fields
     in u3's list), an "As done" note under
     step u2 that ends with what step u3 finds ready, and the version line.

**Known gap, accepted:** after this step the back end's schemas accept `capacity` and
`overbook`, but the handlers do not read them yet: a `capacity` sent is dropped, and a User's
`overbook: true` is not refused with 403. Nothing is deployed between steps u2 and u3, so this
never reaches the cloud. Say it in the "As done" note. If a test of the back end asserts that
one of these fields is refused as unknown, change that test only as far as the new contract
asks, and report it.

Not in this step: any file under `backend/src` or `frontend/src`; the response types of
`shared/src/calendar/types.ts` (decision 1); the handlers' checks; the calendar view; the
front end's services and screens; the assistant; `README.md`, `docs/RUNBOOK.md`,
`docs/FRONTEND_*` and `docs/journeys/`; any `aws` command; the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the spec and the code disagreeing on a rule; any change outside `shared/` and
  `docs/` that the step seems to need (apart from a back-end test of the known gap).
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step u3.

## Acceptance (`docs/CAPACITY_PLAN.md` step u2)

- The two decisions are recorded in the plan, and step u3 lists the three response fields.
- `shared/` holds the range, the two bodies, `user_busy` and `peopleIn`, with the tests listed,
  and 100 % line coverage on `shared/src`.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root.
- The root `DYNAMODB_PORT=8002 npm run verify` PASSED, with `local:up` and `local:api` running.
- `git status` shows changes under `shared/` and `docs/` only (`shared/CLAUDE.md` included),
  plus a back-end test of the known gap if one had to change.
- The "As done" note holds the detail, the known gap included. Then the short closing message,
  and suggest the commit.
