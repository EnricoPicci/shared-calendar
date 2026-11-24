## Before opening the new session (operator)

This step writes documents and the memory files only: no code, no template, no cloud. In the
checkout, on `main` after `nvm use`, with Docker running and **no `ANTHROPIC_API_KEY` in the
shell** (the gate needs the fake Claude):

```
git status                                          # clean, at a8b3a2b or later
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded, with the fake Claude
npm run local:api -w backend                        # in a second terminal, left running
```

No AWS login is needed: nothing in this step reads or changes the cloud.

## Brief

Implement plan step c16, "Documentation and hand-over" (`docs/CONVERSATIONAL_PLAN.md`), the last
step of that plan, following CLAUDE.md's working rhythm: one step, its acceptance check, an
honest report, then stop for review.

After this step the repository says what exists, in one place each: the assistant is part of
`docs/ARCHITECTURE.md` and of the other governing documents as built and deployed, nothing
says it is a proposal or under way, `docs/CONVERSATIONAL_ARCHITECTURE.md` says plainly what it
is from now on, the hard rules of the assistant are in the `CLAUDE.md` files where a session
finds them, and `docs/CONVERSATIONAL_PLAN.md` is done.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Comments" and **"Changing these files"**; `backend/CLAUDE.md`,
  `frontend/CLAUDE.md`, `shared/CLAUDE.md`, `.claude/rules/*.md`; Claude Code's guidance for
  memory files (https://code.claude.com/docs/en/memory).
- `docs/CONVERSATIONAL_PLAN.md`: sections 1 to 4, **step c16**, the "As done" note of step c15
  ("What step c16 finds ready"), sections 2.2, 6 and 7 (the risk "`CLAUDE.md` outgrows its 200
  lines").
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: the status line and the change log, section 1 (which
  document governs what once built), sections 10.3, 16, 18 and 19.
- `docs/ARCHITECTURE.md`: the change log (**the v13 row, still "(open)"**, and how v12 and v15
  were closed), sections 1.1, 2, 4, 5.4, 7, 9, 10, 11, 12, 14.
- `docs/SHARED_CALENDAR_SPEC.md` status line: the model of a design document whose content was
  merged and that stays.
- `docs/MERGE_DEPLOY_FRONTEND.md` section 5 (P7 and steps c14 to c16).
- `docs/FRONTEND_SERVICES.md` section 21, `docs/FRONTEND_ARCHITECTURE.md` sections 6 and 13,
  `docs/FOLDER_STRUCTURE.md`, `docs/COMMANDS.md`, `docs/RUNBOOK.md` sections 3.2, 5.6 and 5.8,
  `README.md`: to check, not to rewrite.
- `scripts/doc-references.mjs`: what `npm run lint` checks in a reference.

## Where we are (2026-11-24)

- Steps c00 to c15 are done and pushed (`origin/main` at `a8b3a2b`). The assistant runs in
  `shared-calendar-api` since 2026-11-23 (`docs/RUNBOOK.md` section 5.6) and, with the capacity
  of a type, since 2026-11-24 (section 5.8). P1 to P7 are closed or met.
- **Most of the merge is already done, step by step** (plan section 4, point 5). Read before
  writing, the state found when this brief was prepared:
  - `docs/ARCHITECTURE.md` already has the assistant's routes and codes (section 4), its table
    (5.4), "One secret" and the assistant's rows in section 7, the cost with Anthropic (10), the
    log lines (11), the folders and import rules (12). What is left: **the v13 row**, still
    "2026-11-21 (open)" with its sentence per step and none for c16; section 1.1 has no
    requirement for the assistant, and **F5 still says "In progress (plan steps 41–59)"**,
    although v12 was closed on 2026-11-21; section 2's overview and diagram, section 9 and
    section 14, to be checked.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v20: its status says "step c16, the hand-over, to
    come"; section 10.3 ("Changes to `docs/ARCHITECTURE.md` section 7") and section 19 ("What
    the implementation plan must cover") are written as things still to do.
  - `CLAUDE.md` lists the two conversational documents as "the assistant, under way".
  - **`CLAUDE.md` and `backend/CLAUDE.md` are at 199 lines each.** Several of the plan's "new
    hard rules" are already in `backend/CLAUDE.md` (the Anthropic SDK in `anthropic.ts` only;
    `confirm.ts` reached from `handlers/confirmProposal.ts` alone; the journeys against the
    fake Claude). Adding lines means moving or deleting others in the same change.
- **Two other worktrees** read these documents: `../shared-calendar-whatsapp` (branch
  `whatsapp`, from `c1cbfe7`; its brief `wa-w00` builds on `docs/CONVERSATIONAL_ARCHITECTURE.md`
  section 16, "A second channel later") and `../shared-calendar-presentation`. They are not
  touched; the report names what they will have to merge.

## Proposed, for the Product Owner to confirm at the first pause

Each is my recommendation; the session applies it only once I have said yes or changed it.

1. **`docs/CONVERSATIONAL_ARCHITECTURE.md` stays, as the calendar's specification stayed.** Its
   status becomes "implemented, merged and deployed; where it is merged into
   `docs/ARCHITECTURE.md` (and the front end's documents), those win". It keeps what only the
   assistant needs and the other documents do not hold (the instructions, the tools' four
   parts, the evaluation, the alternatives, section 16 for the WhatsApp work). It is **not**
   cut down to remove what was merged: a large rewrite of a 1 700-line document buys nothing
   and costs the WhatsApp branch a painful merge. Sections 10.3 and 19 get one sentence each
   saying they are done and where the result lives, instead of being deleted, so that the
   numbering and every reference to them hold.
2. **`docs/ARCHITECTURE.md` gets requirement F6, "the assistant"**, in section 1.1, with a
   pointer to section 4 "The assistant's routes"; F5's "In progress" becomes what it is
   (implemented). The v13 row is closed as v12 and v15 were: "2026-11-21, closed <date>", with
   the sentence of step c16.
3. **The hard rules in the `CLAUDE.md` files.** Root `CLAUDE.md` gains only what every session
   needs: the logging rule extended to "or the text of a conversation with the assistant", and
   the one-line rule that **only `confirmProposal` changes the calendar on the assistant's
   behalf and `backend/src/assistant` reaches the calendar through a handler, never through
   `lib/calendarDb.ts`**. The pointer line becomes "the assistant: its design, merged". The
   rest stays in `backend/CLAUDE.md`, where it already is. Room is made in the same change, and
   the report says what moved where.
4. **No tag, no push, no deployment** in this step. Commit only when I ask.

If the session finds a reason against one of these, it says so before writing, with its own
proposal.

## The step

1. **The inventory, before writing** (pause): go through every item of plan step c16 and say,
   for each, "already true" (with the place that proves it), "to change" (what, where) or
   "a question". Add a sweep: `grep` the documents for words that say the assistant is not
   built, a proposal, under way or "to come", and for "c16". Also report anything stale outside
   the assistant found on the way (as F5 is), and propose whether it is fixed here or noted.
   Then the four proposals above, confirmed or changed by me.
2. **`docs/ARCHITECTURE.md`**: what the inventory listed, then the v13 row closed with the
   sentence of step c16. The document's version line and change log follow its usual shape.
3. **`docs/CONVERSATIONAL_ARCHITECTURE.md`**: the status line, a change-log row v21, sections
   10.3 and 19 as decided, section 18.2 with every open point and its outcome (check it is
   already so), nothing else unless the inventory found a sentence that is untrue.
4. **The other documents**: `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
   `docs/FOLDER_STRUCTURE.md`, `docs/COMMANDS.md`, `docs/RUNBOOK.md`, `README.md`: only the
   lines the inventory found untrue. P7 is recorded as met where the plan says (plan section
   2.2 and `docs/MERGE_DEPLOY_FRONTEND.md`), as seen in step c15, point 8.
5. **The `CLAUDE.md` files and `.claude/rules/`**, as decided, by every point of `CLAUDE.md`
   "Changing these files": root `CLAUDE.md` under 200 lines, one home per fact, nothing said
   twice, no history; then the check of its last point,
   `grep -rn "CLAUDE.md" README.md docs .claude scripts frontend/scripts eslint.config.js`, run
   and reported.
6. **`docs/CONVERSATIONAL_PLAN.md`**: status "done", the step c16 "As done" note (what was
   already merged before the step, what the step changed, what moved between the `CLAUDE.md`
   files), the "Not in scope" and risk rows checked.
7. **The gate**: `npm run typecheck`, `npm run lint` (the comment rule finds no reference to a
   section that moved or was renamed), then the root `DYNAMODB_PORT=8002 npm run verify`. No
   code changes, so the front end's journeys are not needed; if a code file had to change after
   all, stop and tell me first.

Not in this step: a change under `backend/src`, `frontend/src`, `shared/src`, a test or either
`template.yaml`; any cloud command; the WhatsApp worktree or its brief; a rewrite of a document
beyond the lines found untrue; the auto-memory of Claude Code (the operator's).

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. The inventory of point 1
  may be a list, since I asked for it; keep it to one line per item.
- **The pauses:** after the inventory (point 1); two documents that disagree (the architecture
  wins over the plan, the plan over this brief); a line of root `CLAUDE.md` that cannot fit
  without removing something whose loss I should judge.
- **Hard rules that bear on this step:** no history and no status of finished work in the
  `CLAUDE.md` files and in comments; references name the document by its path, every time;
  no e-mail address, account id or key in a document (the repository is public).
- Commit only when asked. Do not push.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c16)

- No document says the assistant is a proposal, not built, under way or to come; the v13 row
  of `docs/ARCHITECTURE.md` is closed.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` says what it is from now on and which document wins;
  every open point with its outcome.
- The hard rules of the assistant in the `CLAUDE.md` files, root `CLAUDE.md` under 200 lines,
  the check of its section "Changing these files" run and reported, what moved said.
- `docs/CONVERSATIONAL_PLAN.md` status "done", with its "As done" note under step c16.
- `npm run lint` and the root gate green. Then the short closing message, and suggest the
  commit.
