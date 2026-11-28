## Brief

Carry out phase A of `docs/MULTILANGUAGE_PLAN.md`: steps l1 to l8, step l3 in its seven groups
l3a to l3g, fourteen commits, on the local stack of this folder, one step after the other
without stopping for review, as the plan's sections 2.2 and 6 set it. Then write the closing
note of phase A and stop. Do not start phase B.

After phase A, locally: every screen of the page, the mailer's three mails and their Excel
files, the invitation function and the assistant's fixed sentences speak English and Italian;
the person's language is the fifth fact, in Cognito's `locale`, written by the person in "My
details" and read at sign-in with `GetUser` (decision P1); the padded test language shows at
`http://localhost:5173/?padded` and is absent from the built bundle. Nothing is pushed,
deployed or run in the cloud, and nothing costs money.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm", "Hard rules from the design", "Cloud safety",
  "Comments", "Tooling and style" (100 % line coverage on `backend/src/lib`,
  `backend/src/assistant`, `shared/src` and `frontend/src`); then `backend/CLAUDE.md`,
  `frontend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of `.claude/rules/` load when a file
  of their paths is read.
- `docs/MULTILANGUAGE_PLAN.md`, all of it: **sections 2.2 (the three permissions and their
  limits) and 6 (the rules of the run) before anything else**; section 3 (F1 to F16), which
  each step stands on; section 4, the steps; sections 7 and 8, the two lists kept during the
  run; section 9.
- `docs/MULTILANGUAGE_ARCHITECTURE.md`, all of it: the decisions L1 to L16, the open points O1
  to O6, section 5.2 (the five checks of the page), section 14 (the documents phase B writes),
  section 15 (the steps), section 17 (the facts to try).
- `docs/FRONTEND_ARCHITECTURE.md` sections 3 to 5 and 12; `docs/FRONTEND_SERVICES.md` (the
  services that go straight to Cognito, the password change as the model for
  `language.service.ts`); `docs/EMAIL_ARCHITECTURE.md` (the mails, the invitation, M17);
  `docs/CONVERSATIONAL_ARCHITECTURE.md` (the language of a conversation); `docs/FOLDER_STRUCTURE.md`
  sections 2 and 3; `docs/COMMANDS.md` sections 1 to 3 (the local stack and its quirks).
- The code each step names in its "Files", read before that step starts, with its tests.

## Where we are (2026-11-27)

- `docs/MULTILANGUAGE_ARCHITECTURE.md` (`b414c2d`) and `docs/MULTILANGUAGE_PLAN.md` v1 with its
  brief (`f6081b2`) are committed on `multilanguage`, not pushed. Nothing of the languages is
  built; every "As done" note of the plan is empty.
- No local stack is up on this machine (no container, nothing on the ports 3000 and 3001). The
  plan's F10 still holds: if one is found up when step l1 starts, it belongs to another folder,
  and that is the stop of the plan's section 6.3, item 5.
- `main` has the e-mail plan's step m10 still open; `gdpr` and `whatsapp` are in their own
  worktrees. Phase A waits for none of them (the plan's section 9).

## Decided already (the Product Owner, 2026-11-27)

Everything in `docs/MULTILANGUAGE_ARCHITECTURE.md` sections 2.2, 2.3 and 16, and in
`docs/MULTILANGUAGE_PLAN.md` section 2: the brief's eight decisions, the three permissions, P1,
and the planning decisions D1 to D7. Apply them; do not reopen one. If the code proves one
wrong, that is the stop of the plan's section 6.3, item 1.

## How the run goes

- **The three permissions** of the plan's section 2.2 hold from step l1 to step l8 and end
  there: commit each step without being asked, go on without the stop for review, start, stop
  and restart this folder's local stack without asking. **Nothing else is loosened**: no push,
  no deploy, no `aws` or `sam deploy` command, not even a read of the cloud, no paid run of the
  evaluation, no change outside this worktree, no amend, rebase or reset, no bypass of a check.
- **After each step**, the plan's section 6.1 in its order: the check of section 6.2 green; the
  "As done" note and the plan's version line; the lines of sections 7 and 8, if any;
  `git status` showing only the step's files; one commit whose message starts "Step l<n> of
  docs/MULTILANGUAGE_PLAN.md:" (for a group "Step l3c of …"), with this brief inside the commit
  of step l1; the next step.
- **The check** is the lean one of the plan's section 6.2: `typecheck`, `lint`, `test:unit` at
  the root, `sam validate --lint` when `backend/template.yaml` changed, only the journeys the
  step adds or changes (run alone, never both packages' at once), and the look at the screens
  the step changes. No root `verify`, no whole walk, no smoke test: those are phase B's.
- **The look at the screens**: in a real browser, at 1280 × 800 and 390 × 844, in the languages
  the step makes available, after a restart of the stack and `npm run seed:local -w frontend`
  if the back end's calendar journeys ran since the last seed. A tight place is settled by
  L16's rule 3 (a shorter wording first, then the element made to give way in every language,
  never a rule for one language); what cannot be settled goes into the plan's section 8, and
  the work goes on.
- **The Italian**: written with the code, formal "lei" (L14), within the budgets (L16). A doubt
  goes into the plan's section 7 with the English, the Italian chosen and the alternatives
  weighed, and the work goes on. It is never a reason to stop.
- **The stops** are only those of the plan's section 6.3. A stop says plainly what was found,
  what was tried and what I must decide; the step's note records where the work stands;
  nothing half done is committed. The local stack's stall (the plan's F9, step l7 above all):
  one full restart is tried, a second stall on the same request is the stop.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step, brief or plan
  numbers in the code.
- The documents changed in phase A are only those the plan's D7 allows: a journey's page under
  `docs/journeys/` (written or checked with the project skill `explain-journey`, in the same
  commit as its test), a check of `docs/FRONTEND_WALK.md` the step makes false,
  `docs/MULTILANGUAGE_ARCHITECTURE.md` in step l1 (and at a stop of section 6.3, item 1, once I
  agree), and the plan itself. The root `CLAUDE.md`, the packages' `CLAUDE.md` and
  `.claude/rules/` wait for phase B.
- After `npm run build -w backend`, restart `local:api` and `local:lambda`. The back end's
  calendar journeys empty the local `calendar` table.

## A session that starts in the middle

Follow the plan's section 6.4: read sections 2.2 and 6 and the last note; find the step by the
first empty "As done" note and by `git log --oneline`, which must agree; read `git status` and
never throw changes away unasked; check whose the local stack is before using it; run the short
check before changing anything.

## Acceptance (`docs/MULTILANGUAGE_PLAN.md` section 4, each step's check)

- Fourteen commits on `multilanguage`, one per step and per group of l3, each green by its
  check, each with its "As done" note; none pushed.
- At the end: `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root,
  100 % line coverage kept; the journeys the steps added or changed green, each run alone.
- `index.html`, `frontend/src/logic` and `frontend/src/views` hold no sentence (the checks of
  group l3g); the built bundle holds no mark of the padded language.
- The plan's sections 7 and 8 hold every doubt and every unsettled look, or say "none".
- The closing note of phase A written (the commits, the counts of tests, what the two lists
  hold, what is known to be unproven until phase B), the local stack left up and seeded for my
  look.
- Then the short closing message of `CLAUDE.md`'s working rhythm: one or two simple sentences
  on what was done, then plainly what I must decide or do, which is phase B's item 1.
