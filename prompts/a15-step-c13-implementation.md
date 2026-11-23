## Before opening the new session (operator, in your own terminal)

```bash
nvm use
npm run local:down -w backend                                          # a fresh stack
DYNAMODB_PORT=8002 npm run local:up -w backend                         # no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
```

- The step has **two halves**. The first runs on the fake Claude and costs nothing. The second
  is **yours alone**: the assistant used by hand with the real Claude, in three short sessions.
  It **needs the Anthropic key and costs money**, a few cents a session (an exchange cost 0.3
  to 0.7 US cents in the evaluation, up to 4 for the first after a silence).
- The key is typed by you, in your own terminal, for the one `local:up` that wires the real
  Claude: the session never sees it, never asks for it and never prints
  `backend/env.local.json`. Check that the key's workspace has its monthly spend limit in the
  Anthropic Console before that half.
- The stack changes hands **four times**: fresh on the fake for the gate; fresh on the fake
  with the seed for the walk; the real Claude for your sessions; the fake again at the
  end. Each change is yours; the session tells you each time what to run and waits.
- No seed yet: the first thing the session runs is the root gate, which empties the calendar.
- It needs **no AWS login**; nothing is deployed.

## Brief

Implement plan step c13, "The walk, with the real model" (`docs/CONVERSATIONAL_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review.

After this step the assistant's panel is part of the walk, `docs/FRONTEND_WALK.md`: the checks
to repeat after a change, against the fake, and a short list that only a person with the real
model can do. The Product Owner has used the assistant with the real Claude, as both roles and
in both languages, and **open point P6** (a typed "yes" drops the proposal) is decided on what
happened. The plan says "and whoever else is at hand": nobody else is, and the "As done" note
says so.

The step writes almost no code. It changes nothing in `backend/`, `shared/` or
`frontend/src/services/`, nothing in the fake, and nothing in the cloud. What it changes in
`frontend/` is the two points of decision 151, decided below, and the small flaws of the panel
that the walk shows (design point 9).

The design points are proposed below: apply them as written, and stop if a document or the
page proves one wrong.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Cloud
  safety" and "Changing these files"; `frontend/CLAUDE.md`.
- `docs/CONVERSATIONAL_PLAN.md`: sections 1 to 4, **step c13**, the "As done" note of step c12
  to its end ("What step c13 finds ready"), the "As done" note of step c10 (how the real model
  was judged, and what goes back through the evaluation), step c14 to see what this step must
  not take from it.
- `docs/FRONTEND_WALK.md`, **all of it**: how a walk is set up (section 1), how a check is
  written (one line, what to do, an arrow, what must be seen), what only a person can check
  (section 6), where each line of a step's browser check went (section 7).
- `docs/FRONTEND_ARCHITECTURE.md`: **section 6.1** (the panel) and decisions 138 to 151;
  section 8 (the tests, and the table of where the keyboard is).
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 4, 5.5 (the rules of a proposal, rule 5 on a
  typed message), 6.1, 7.3 (the instructions), 12.3 (the evaluation), **13**, and 18.2 (P6).
- `docs/COMMANDS.md` sections 3.4 and 4: how `local:up` wires the fake or the real Claude, the
  model, the effort and the daily limit it takes from the shell, the seed, what empties the
  local calendar, the evaluation's command.
- `backend/tests/integration/fake-claude/answers.json`: the sentences the fake answers.

## Where we are (2026-11-22)

- Steps c00 to c12 are done and committed (`2676847`). The assistant is a panel at the bottom
  of every screen; its browser check passed against the fake at two widths, by a script kept
  outside the repository and deleted since.
- `docs/FRONTEND_WALK.md` is v1, 102 checks, and holds nothing of the assistant. Its seed
  gives "Studio" and "Piscina"; the fake's three sentences that read and book need 05:00 free
  on the 25th, the 26th and the 27th day from today, which no seed gives.
- Locally a person has 10 messages a day unless `local:up` is given another limit, and no
  route gives one back. A message that got `503` is counted.
- What step c12 found and left (decision 151 of `docs/FRONTEND_ARCHITECTURE.md`): after such a
  `503` the line "N messages left today" is one too high until the next reply, and after one
  on the first message of a conversation "New conversation" stays out of use until the
  conversation is read. **Decided: this step fixes both** (design point 10).
- A reload of the page signs out. A message that drops a proposal brings no notice.
- P6 is open: built as stated (a typed "yes" drops the proposal, and the model proposes
  again); in the trial with the real model the buttons came back.

## Design points

1. **The walk gains a part of its own for the assistant**, after "Both" and before "What only
   a person…", numbered on from 102 so that no existing number moves. Its checks are the lines
   of step c12's browser check, in the order a person would follow, each written as the other
   checks are. Section 1 gains what the part needs before it starts (the three early windows
   under a type of the run's tag, a throw-away User of the run so that `alice` keeps her day,
   the count of messages the part spends: it must fit in ten) and what it leaves; section 7
   gains the row of step c12. A new version, v2, with its change log.
2. **Two lists, kept apart.** The checks against the fake are exact: a sentence of
   `answers.json` in, a fixed text out. The list for the real model is short (about ten lines)
   and says what to try and what to judge, not the words of the answer: a question that reads,
   in English and in Italian; a booking confirmed and seen in the week behind; a change
   declined; a proposal answered by typing; a request the role may not make; a request the
   assistant should refuse; a long answer at a phone width. It goes in the walk's section on
   what only a person can check.
3. **The walk is run whole, by a script, as before**: all 102 checks and the new ones, at a
   desktop and at a phone width, in a headless browser kept outside the repository, on a fresh
   stack with the seed. Say the plan of the run before starting it. It removes what it made,
   whatever happened, and prints what it found before deleting.
4. **Without a mouse, by the script only.** It checks what a script can: the order of Tab,
   where the keyboard is after sending, confirming, declining, "Close" and Escape, and the
   browser's accessibility tree for the panel (the region's name, the heading's state, the
   live region and the alert with their texts). **Nobody listens with a screen reader in this
   step**: the Product Owner decided to leave it out. What a screen reader says aloud of the
   panel is written in the walk among what only a person can check, as not yet done, and the
   "As done" note says so. The table of section 8 of `docs/FRONTEND_ARCHITECTURE.md` gains the
   panel's rows.
5. **The sessions are prepared for me, not done for me. I am the only person.** Three
   sessions: as a User in English, as a User in Italian, as the Administrator. Give me one
   sheet per session, on the screen and not in the repository: how to sign in, the list of
   design point 2, and three things to write down for each proposal met: pressed or typed, the
   words typed, what the assistant did next. Each session a throw-away account of the run, so
   that its day's count and its conversation are its own. Tell me which `local:up` to run,
   with the daily limit to give it for these sessions, and wait.
6. **What the session reads of those sessions** is what I report, and the log's counts: how
   many messages, steps and proposals, how many confirmed, declined and dropped by a message,
   the tokens and the cost by the prices of the evaluation. **Nothing of a conversation's text
   is read from the table or the log.**
7. **P6: decided before the step, closed as built unless it goes badly.** One person who
   knows the buttons are there cannot show a habit of people: say so in the report. In each
   session I answer at least one proposal by typing, on purpose, in the words I would use
   ("yes", "ok", "sì", "va bene", "no"), so that what the real model does next is seen.
   - **If every time the model proposed again and the buttons came back** (or, after a "no",
     nothing was changed): P6 closes as built, with the numbers, **with no pause**.
   - **If once it did not** (a change made or said to be made without the buttons, a proposal
     lost with no word of it, a person left with nothing to press): **stop**, tell me what
     happened, and propose the fixed list of words matched in code, never through the model,
     with its size in hours, its tests and its journey. It is built only after my go.
   Either way it is written as decided in `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 5.5
   and 18.2.
8. **What the walk shows about the instructions does not go into `prompt.ts`.** It is written
   down as a request for the evaluation of step c10 (the sentence, what was expected, what
   came) in the "As done" note, **with no pause**. A change to the instructions is a step of
   its own, which I decide after this one.
9. **What the walk shows about the page: decided before the step, fix the small ones and
   list the rest.** A flaw of the panel that nobody knows yet (a text cut at a phone width, an
   answer that reads badly) is **fixed without asking** when all of these hold: it touches only
   `frontend/src/views/assistant.view.ts`, `frontend/src/logic/assistant.*.ts`, the panel's
   part of `index.html` and of `style.css`, and their tests; no rule of a document changes,
   and none of the ten choices of step c12; no existing test changes but by a new case. Each
   fix comes with its test, the walk's line run again, and one line in the "As done" note.
   **Everything else is listed at the end, not fixed**: what it is, where, a proposal and its
   size. A flaw of another screen is listed too.
10. **The two points of decision 151: decided before the step, both fixed, before the walk.**
   After a message that got `503 assistant_unavailable` or `assistant_budget_reached`, the
   panel reads the conversation again, once, **and never continues it by itself**: the line
   "N messages left today" is then the server's, and "New conversation" is in use because the
   panel knows the conversation. The person's text stays in the field as today, and sending
   it again still works as today (refused as busy, read back, answered). Logic and its tests
   only; the view does not change. The walk's line on the two sentences then expects one read
   after each, and still no `continue`. Decision 151 is rewritten as what was done, and the
   sentence of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 13 on what follows a failure
   gains it. If the read shows something this point did not foresee, stop and tell me.

## The step

1. The root gate on the fresh stack: `DYNAMODB_PORT=8002 npm run verify`.
2. Design point 10, with its tests; `npm run verify -w frontend` green. Then ask me for the
   second fresh stack, on the fake, and run the seed.
3. `docs/FRONTEND_WALK.md`: the assistant's part, the list for the real model, sections 1 and
   7, v2.
4. The whole walk by the script, at both widths; what it made removed. The small flaws of
   design point 9 fixed as they are found. Report it line by line where a line failed or was
   changed, in one sentence where all passed.
5. Ask me for the real Claude; check which Claude is wired; give me the sheets; wait for the
   sessions and for my notes.
6. The counts from the log; P6 by design point 7 (a pause only if it went badly); what my
   notes show of the page, by design point 9. Ask me for the fake again.
7. `npm run verify -w frontend` and the front end's journeys on the fake, if anything was
   fixed after the walk.
8. The documents:
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: P6 as decided (sections 5.5 and 18.2), a new
     version;
   - `docs/FRONTEND_ARCHITECTURE.md`: section 8's table, decision 151 as it ends, any new
     decision, version and change log;
   - `docs/CONVERSATIONAL_PLAN.md`: the status line, section 2.2 for P6, an "As done" note
     which ends with what step c14 finds ready;
   - `docs/COMMANDS.md` where a note changed (the walk and the real Claude);
   - `frontend/CLAUDE.md` (127 lines), `.claude/rules/frontend-views.md` and `CLAUDE.md` (199
     lines of 200): only where a line became untrue. Report the line counts.

Not in this step: step c14 and anything of the deployment; a change to the instructions, a
tool, a route or the fake; the fixed list of words unless design point 7 stops for it and I say go; a translation of the page; an
end-to-end test tool in the repository; a new dependency; the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** each change of the stack; my sessions with the real model; P6 only if a
  typed answer went badly (design point 7); a design point that proves wrong; anything
  that would change `backend/`, `shared/`, `frontend/src/services/` or the fake; two documents
  that disagree.
- **The local stack is mine**: `local:up`, `local:down` and every restart of `local:api`. Tell
  me exactly what to run, in which terminal, and the word you wait for. The dev server you may
  start and stop (stop it as `CLAUDE.md` says). To know which Claude is wired, read whether
  `ANTHROPIC_BASE_URL` is in `backend/env.local.json` with a script that prints yes or no;
  **never print that file or a line of it**.
- **The key is never yours.** No command of the session holds it, asks for it or echoes it.
  With the real Claude wired, the session sends **no message to the assistant by itself**: the
  script's walk runs on the fake only, and it refuses to start when the real one is wired.
- **The order of the runs.** The back end's journeys empty the local `calendar` table, and
  they refuse the real Claude: the gate runs first, on the fake, and never again before the
  walk. Never run the two packages' integration tests at the same time, nor a gate or a
  journey while the walk or one of my sessions is under way.
- **The log file** `/tmp/shared-calendar-local-api.log` is mine: read it with scripts that
  print counts and short lines, never whole, and never a line that could hold a text of a
  conversation; do not delete or empty it.
- Scratch files, the headless browser, its scripts and the sessions' sheets live outside the
  repository, and the scratch files are deleted at the end. A shell command that holds a
  script goes through a file or a here-document. The shell is zsh.
- **A script that deletes** names what it deletes by the run's own tag, and prints what it
  found first. The walk never changes the seed's types, patterns or appointments, nor a
  setting it does not put back.
- **Hard rules that bear on this step:** no token, password or text of a conversation in a
  log, a document or a message to me; the walk is not a source of truth: where it disagrees
  with `docs/FRONTEND_ARCHITECTURE.md` or the tests, it is the one that is fixed; the existing
  tests keep passing unchanged; comments follow CLAUDE.md "Comments"; lint must pass; no AWS
  command and no deploy.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked. Do not push. Do not start step c14.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c13)

- The root gate green on a fresh stack; then, on a second fresh stack with the seed, the whole
  walk line by line at both widths, the assistant's part included, and everything it made
  removed.
- `docs/FRONTEND_WALK.md` v2 holds the assistant's checks against the fake and the short list
  for the real model.
- The panel without a mouse: what the script checked written down, and what a screen reader
  says aloud written as not yet listened to.
- My three sessions done with the real model, as both roles and in both languages; their
  counts and their cost reported; nothing of their texts kept.
- **P6 written as decided** in `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 5.5 and 18.2,
  with the numbers behind it; if the fixed list of words was approved, built with its tests
  and its journey, and the gates green again.
- The two points of decision 151 fixed, with their tests, and written so; the small flaws
  found fixed, and the others listed with a proposal and a size.
- `npm run verify -w frontend`, `npm run typecheck` and `npm run lint` at the root green on
  the final state; the documents of "The step" updated; the scratch files deleted; **the stack
  left on the fake**.
- The "As done" note holds the detail: how many checks the walk has, what changed in a line
  and why, the sessions' numbers, what goes to the evaluation. Then the short closing message,
  and suggest the commit.
