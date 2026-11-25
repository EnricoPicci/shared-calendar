## Before opening the new session (operator)

This step changes the assistant's instructions, the descriptions and checks of its four
opening-hours tools, their unit tests and the evaluation's list of requests. It runs no journey
and no paid evaluation, so it needs **no local stack, no AWS login and no Anthropic key**. In the
worktree `shared-calendar-slot-5min` (branch `slot-5min`), run `nvm use`, then open the session.
Keep **no `ANTHROPIC_API_KEY` in the shell**: nothing in this step may call the real Claude.

## Brief

Implement step w3, "The assistant", of `docs/WINDOW_HOURS_PLAN.md`, following CLAUDE.md's
working rhythm: one step, its check, an honest report, then stop for review.

After this step the assistant knows that a window lasts a whole number of hours from any
5-minute start. Its four opening-hours tools (`create_pattern`, `update_pattern`,
`set_date_override`, `create_one_off_window`) tell Claude so in the description of `end`. They
also refuse a window that is not whole hours at the proposal, with the shared rule's sentence,
before the person sees anything. The instructions say how to block time inside a window (Q1: the
block is widened until every piece left is whole hours, the person told and asked first). They
also say what to do with a request for hours that are not whole (Q4: explain, suggest the nearest
whole hours inside and around it, propose only after the person has chosen). The evaluation
holds 61 requests. **Nothing is paid and nothing is deployed:** the evaluation is run once, in
step w5.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (the assistant changes the calendar only through `confirmProposal`; logs hold
  no text of a conversation), "Cloud safety", "Comments", "Tooling and style" (100 % line
  coverage on `backend/src/assistant`); then `backend/CLAUDE.md`, section `src/assistant/`
  (**changing `INSTRUCTIONS`, or a tool's description or schema, ends every conversation in
  progress**).
- `docs/WINDOW_HOURS_PLAN.md`: section 2 (decisions 1 to 5, Q1, Q4); section 3, **F2, F3 and F8**
  (what changes in the assistant, the four requests of the evaluation); section 5's opening ("How
  a step is checked"); **step w3**; the "As done" note of step w2 (what this step finds ready, and
  decision 5 as restated); steps w4 and w5 to see what this step must not take from them.
- `docs/SHARED_CALENDAR_SPEC.md`: decision D33, section 6.2, R-SLOT-01, R-BOOK-06.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: the status line and the version table; section 7.3 (the
  instructions, as written there); section 8.2 (each tool's four parts, the four opening-hours
  tools); section 12.3 (the evaluation: the list, its counts, the last run).
- The code: `backend/src/assistant/prompt.ts` (`INSTRUCTIONS`: the paragraphs "The opening hours"
  and "Blocking time"; `promptVersion`); `backend/src/assistant/tools/facts.ts` (`hoursInput`,
  `endsAfterStart`, `END_AFTER_START`); `createPattern.ts`, `updatePattern.ts`,
  `setDateOverride.ts`, `createOneOffWindow.ts`; `shared/src/calendar/rules.ts`
  (`lastsWholeHours`) and `schemas.ts` (how the window bodies say the refusal once);
  `backend/tests/eval/requests.ts`, `checks.ts` and how a request of several messages is played;
  the unit tests under `backend/tests/unit/assistant/` that name `prompt.ts`, the four tools,
  `availabilityTools.test.ts` and `proposals.test.ts`; `docs/COMMANDS.md` where it counts the
  requests.

## Where we are (2026-11-25)

- `v2.4.0` is deployed from this branch and tagged locally (`042142e`); nothing pushed.
- Steps w1 and w2 are committed (`571ad49`, plan v3). The spec is at v20 (D33); the server refuses
  a window not whole hours with `400 invalid_request`, "Invalid input: end", and a User's start
  that is not a slot with `409 outside_availability`. `lastsWholeHours` is exported from
  `@shared-calendar/shared`; the three window schemas refuse on `end` with the message "end must be
  a whole number of hours after start".
- `docs/ARCHITECTURE.md` holds a v17 row, open, whose number the merge with `main` may change.
- The mail work goes on in the checkout of `main` and has not been merged here.

## Decided already (the Product Owner, 2026-11-25)

Decisions 1 to 8 and Q1 to Q8 of `docs/WINDOW_HOURS_PLAN.md` section 2, decision 5 as restated
at step w2. Apply them; if the code or the evaluation proves one wrong, stop and tell me before
going on. For this step:

1. **The rule is written once (F2):** the tools' refinement calls `lastsWholeHours` of `shared/`.
   It runs after the order check and only when that passed, so that Claude reads one sentence
   per refusal, as the shared schemas do. The sentence is the shared one, "end must be a whole
   number of hours after start", on the path `end`.
2. **The description of `end` (F8):** "a whole number of hours after start: the same minutes as
   start, or 24:00 when start is on the hour" (the exact words may be adjusted, the content not).
   It cannot be a pattern given to Claude: it is said in words.
3. **Blocking (Q1):** each piece left keeps its window's own start or end; the block grows until
   every piece is whole hours (10:10–10:35 inside 09:00–13:00 becomes 10:00–11:00, leaving
   09:00–10:00 and 11:00–13:00). Claude says which times it will use and asks before proposing,
   **only when the block had to grow** (the Product Owner, 2026-11-25): a block that already
   leaves whole hours (10:00–11:00 inside 09:00–13:00) is proposed at once, as today, so the
   evaluation's other blocking requests keep one message each.
4. **Hours not whole (Q4):** Claude says that a window lasts whole hours and suggests the nearest
   whole hours inside and around the times asked (09:05–12:00 → 09:05–11:05 or 09:05–12:05). It
   proposes only after the person has chosen. **When no whole hours fit** (a start after 23:00,
   such as 23:05–24:00, since a window ends on its own date), Claude says that no window can
   start after 23:00 and suggests moving the start, 23:00–24:00, or 22:05–23:05 when the end
   matters more (the Product Owner, 2026-11-25). One sentence in the instructions; no request of
   the evaluation is added for it.
5. **No paid run** (the plan's step w3): the evaluation is run once, in step w5, on the code that
   is deployed. `--list` costs nothing and is the check of this step.

## The step

1. **`backend/src/assistant/tools/facts.ts`:** the description of `end` in `hoursInput`; a
   refinement for whole hours beside `endsAfterStart`, built on `lastsWholeHours`, with the shared
   sentence. The four tools use it; check that each says one sentence per refusal.
2. **`backend/src/assistant/prompt.ts`:** in "Blocking time", after "Hours are on 5-minute steps",
   that a window lasts whole hours and the rule of Q1, asking only when the block grew; in "The
   opening hours", the sentence of Q4 and the one for a start after 23:00.
   Plain words, as the rest of `INSTRUCTIONS`. `promptVersion` changes with them by itself; say in
   the report that **every conversation in progress ends at the deploy**.
3. **Unit tests**, 100 % line coverage kept on `backend/src/assistant`; only the cases the rule
   adds or moves (the plan's "How a step is checked"):
   - the words given to Claude: the new sentences of the instructions, the description of `end`;
   - each of the four tools: 09:05–11:05 accepted, 09:05–10:30 refused with the sentence on
     `end`, having only read (no change handler reached); an end not after the start still said
     once, by the order check;
   - the examples that are no longer whole hours: `availabilityTools.test.ts` (09:05–11:55,
     19:05–20:10) and `proposals.test.ts` (14:00–14:30) move to whole hours that keep their point;
     any other test that fails on the new refinement changes only its example.
4. **The fake Claude and the assistant's journeys:** by the plan none holds a window not whole
   hours (05:00–07:00, 14:00, 04:00, 06:00). Search
   `backend/tests/integration/fake-claude/answers.json` and `backend/tests/integration/assistant.test.ts`
   to confirm it. If one does, **stop and tell me**: changing a journey is not in this step's
   check.
5. **The evaluation (`backend/tests/eval/requests.ts`), F8:**
   - `step-pattern-new` (English, a Sunday 14:05–16:35) becomes 14:05–17:05;
   - `step-block` (Italian, 10:10–10:35 out of 09:00–13:00) ends on a question: Claude says the
     times it will use. A second message accepts the widened block; the proposal then checks
     09:00–10:00 and 11:00–13:00, with the afternoon 15:00–18:00 kept. Change `checks.ts` only if
     the second message needs it;
   - new `hours-not-whole` (English, "Open eval Visit every Tuesday from 09:05 to 12:00") and
     `hours-not-whole-it` (Italian, an extra window 10:10–11:40), each `ends: 'answer'`,
     `noProposal()`, with a `hand` note for the reader: the suggestion of whole hours inside and
     around;
   - **61 requests.** `npm run assistant:eval -w backend -- --list` shows them and costs nothing.
     Say the new count of messages and of each language.
6. **Documents**, in the same change:
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: a version row (v23); section 7.3 (the instructions as
     they now read); section 8.2 (the four tools: the description of `end`, the refusal at the
     proposal); section 12.3 (61 requests, their counts, the four requests, **no run yet**: the
     last run stays the one of `v2.4.0`); the status line (the sentence of step w1 replaced:
     built in step w3, evaluated in step w5, not deployed).
   - `docs/COMMANDS.md`: the count of the requests.
   - `docs/ARCHITECTURE.md`: this step's sentence in the open v17 row.
   - `docs/SHARED_CALENDAR_SPEC.md`: only if a line names what the assistant does with a window
     (the status line says the assistant's part is not built yet: change it).
   - `docs/WINDOW_HOURS_PLAN.md`: the two decisions of this brief (ask only when the block grew;
     a start after 23:00) in section 2, beside Q1 and Q4; an "As done" note under step w3, ending with what step w4 and
     step w5 find ready (the cost of the run to say again before it, about 50 US cents); the
     version line.

Not in this step: any file under `frontend/` or `shared/`; `backend/src/lib`,
`backend/src/handlers`; `backend/scripts/smoke.sh`; `backend/template.yaml`; the journeys and
their pages; `README.md`, `docs/RUNBOOK.md`, `docs/FRONTEND_WALK.md`; the body of
`docs/FRONTEND_ARCHITECTURE.md` and `docs/FRONTEND_SERVICES.md`; the records of finished work
(`docs/SLOT_STEP_PLAN.md`, the old briefs); any `aws` command; the cloud; **any call to the
real Claude**.

## How we work in this step

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do.
- **The pauses:** the plan, the spec or the code disagreeing on a rule; any change the step seems
  to need in a file listed under "Not in this step"; a journey or a fake answer that holds a window
  not whole hours; a test of the eval's runner that cannot hold the two messages of `step-block`
  without a change of more than `checks.ts`.
- **The check:** `npm run typecheck`, `npm run lint` and `npm run test:unit` at the root, then
  `npm run assistant:eval -w backend -- --list`. No journey, no `verify`, no paid run.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- Commit only when asked. Do not push. Do not start step w4.

## Acceptance (`docs/WINDOW_HOURS_PLAN.md` step w3)

- The instructions say that a window lasts whole hours, the rule of Q1 for a block, and Q4 for
  hours not whole; the description of `end` says it in words; the four tools refuse 09:05–10:30
  at the proposal with the shared sentence, having only read, through `lastsWholeHours`.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept; `--list` shows 61 requests.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` v23, `docs/COMMANDS.md`, the v17 row of
  `docs/ARCHITECTURE.md` and the plan's "As done" note hold the detail, with the conversations in
  progress ending at the deploy and the paid run left to step w5.
- `git status` shows changes under `backend/src/assistant`, `backend/tests/unit/assistant`,
  `backend/tests/eval`, `docs/` and this brief only.
- Then the short closing message, and suggest the commit.
