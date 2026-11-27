Write the implementation plan for several languages, `docs/MULTILANGUAGE_PLAN.md`, from
`docs/MULTILANGUAGE_ARCHITECTURE.md`: a plan made to be carried out by Claude Code on its own,
one step after the other, stopping only where this brief says.

The design is finalized: decisions L1 to L16 and open points O1 to O6 are settled
(`docs/MULTILANGUAGE_ARCHITECTURE.md` sections 2.2, 2.3 and 16). The plan follows its section
15 (steps l1 to l9) and does not reopen a decision. Write the plan only: no code, no change to
another document.

Decided by the Product Owner on 2026-11-27:

1. **The work is carried out without a stop between steps.** I consider it technical and
   mechanical and want it automated as far as possible. After each step Claude Code runs the
   step's acceptance check, commits, writes a short "As done" note in the plan, and goes on to
   the next step.
2. **Three permissions, for this plan only.** They are not a general rule: they hold for the
   steps of `docs/MULTILANGUAGE_PLAN.md`, on the branch `multilanguage`, in this worktree, and
   end with its last step. The plan states them, with these limits, where a session that
   starts in the middle of the work will read them:
   - to commit each step without being asked (the rule is "commit only when asked");
   - to go from one step to the next without the stop for review;
   - to start, stop and restart the local stack (`local:up`, `local:api`, `local:lambda`,
     `local:down`, the page's `dev`) without asking first. I do not use the local stack of
     this folder while the work runs.
   Nothing else is loosened: no push, no deploy, nothing in the cloud, no paid run.
3. **Where the work stops and asks me.** Only here:
   - one of the facts about AWS marked "to try" (`docs/MULTILANGUAGE_ARCHITECTURE.md` section
     17) turns out false, or anything else proves the architecture wrong: say what was found
     and propose the document's change;
   - a step's check cannot be made green without bending a rule of the project (a hard rule
     of `CLAUDE.md`, the 100 % coverage, the comment rule, the layout rule L16);
   - anything in the cloud or that costs money: the read of the cloud's pool in step l1, the
     assistant's paid evaluation, the deploy;
   - the local stack hangs and cannot be brought back (it has hung before when a function was
     added, and this work adds one);
   - a decision Claude Code is not comfortable taking alone. A doubt on an Italian wording is
     not one of these: see point 5.
   A stop says plainly what was found, what was tried and what I must decide, and the plan's
   note records where the work stands, so that it can be taken up again.
4. **Two phases.**
   - **Phase A, on its own:** steps l1 to l8 on the local stack, everything that needs no
     cloud and no money. The parts of those steps that need the cloud or money (the read of
     the cloud's pool, the paid evaluation) are moved out of them into phase B, and the plan
     says what each step leaves undone for that reason.
   - **Phase B, with me:** my review of the Italian texts in one pass; my own look at the
     screens; the facts to try on the cloud's pool; the paid evaluation, its cost said and
     agreed first; the documents of the architecture's section 14; the full regression; the
     merge with `main`; the deploy, the API before the page. Each of these waits for my word.
5. **The Italian is reviewed once, at the end.** Claude Code writes it with the code, formal
   "lei" (L14), within the length budgets (L16). It keeps one list, in the plan, of the
   wordings it was not sure of, with the English text, the Italian chosen and the
   alternatives it weighed. A doubt goes into the list and the work goes on.
6. **Claude Code looks at the screens itself.** Each step that changes a screen ends with a
   look at it in the browser, at both widths, in the languages the step makes available
   (English, the padded test language, Italian). What it sees and cannot settle by the order
   of L16's rule 3 goes into a second list for my own look in phase B.
7. **Step l3 is cut by groups of screens**, one commit each, so that an error stays small and
   a group can be undone alone. The plan names the groups. Until the last group is done,
   screens already moved and screens not yet moved must live side by side with English
   unchanged; the plan says how.
8. **Every step can be undone alone.** One commit per step (per group in l3), its message
   naming the step. No step leaves the branch with a red check.

What the plan must hold, in the shape of the earlier plans (`docs/WINDOW_HOURS_PLAN.md`,
`docs/EMAIL_PLAN.md`):

- what is asked and the shape of the answer, in short;
- the decisions above, and the three permissions with their limits;
- **what planning found**: read the code before writing the steps and say what the
  architecture did not see. A starting list, not complete:
  - every place a person reads a text: `frontend/index.html`, the files of
    `frontend/src/logic/` and `frontend/src/views/` that make sentences, `shared/src/mail/`,
    `backend/src/lib/excel.ts`, the mailer's file names, `shared/src/assistant/`,
    `backend/src/assistant/prompt.ts`, the invitation in `backend/template.yaml`;
  - the tests that name a text by its English words, and how many change in step l3;
  - how a screen learns that the language changed, within
    `docs/FRONTEND_ARCHITECTURE.md` sections 3 to 5 (the architecture leaves this to the plan,
    its section 6.1);
  - the shape of the page texts' type and where a length budget is written (L16);
  - how the padded test language is shown on the local page and kept out of the deployed
    bundle;
  - the files and folders, agreed with `docs/FOLDER_STRUCTURE.md`;
  - what the local Cognito does with `locale`, `UpdateUserAttributes` and the id token: try
    it during planning if the local stack is up, reading and writing only a throw-away user;
  - the effect of one more function on `sam local start-api`;
- **the steps**, each with: what it builds, the files it touches, the tests it adds or
  changes, its acceptance check (the lean one of `CLAUDE.md`: `typecheck`, `lint`,
  `test:unit`, the journeys it adds or changes, the look at the screens it changes), what it
  leaves for phase B, and an empty "As done" note;
- **the rules of the run**: the order, what is done after each step, the stops of point 3,
  the two lists of points 5 and 6, how a session that starts in the middle finds where the
  work stands (the "As done" notes and the commits);
- **phase B** as a numbered list of what waits for me, in order;
- the questions of planning for me, if the documents and the decisions above do not settle
  them: ask them before writing the plan, one by one, in simple words.

What does not change: the architecture's decisions; English as the project's language (R6);
the tests in English; the hard rules of `CLAUDE.md`; the cloud safety rules; the journeys'
pages in `docs/journeys/` kept in step with their tests in the same commit.

Beside the other work: the e-mail plan's last step (`docs/EMAIL_PLAN.md` step m10) is still
open on `main`, and the branches `gdpr` and `whatsapp` add texts of their own. Phase A does
not wait for any of them; the plan says what the merge of phase B must do about each
(`docs/MULTILANGUAGE_ARCHITECTURE.md` section 15).

When the plan is written: commit nothing, show it to me, and do not start step l1. I review
the plan and give the word to start.
