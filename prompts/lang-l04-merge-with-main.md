## Before opening the new session (operator)

This session does item 6 of phase B of `docs/MULTILANGUAGE_PLAN.md`: the merge with `main`. It
brings the e-mail release into the branch `multilanguage`, so that what phase B then tests and
deploys (items 7 and 8) is the two languages on top of the code that runs in the cloud.
Everything is local: no deploy, no `aws` command, nothing pushed unless asked.

**Do it after part A of step m10 of the e-mail plan is closed, not before.** Item 6 waits for
"step m10 deployed"; step m10 was cut in two on `main` (`docs/EMAIL_PLAN.md` v14), and the half
that matters here is part A: the stage `on` in SES's sandbox, which makes the invitation
function's pool send invitations. Part B, after AWS grants production access, is not waited
for.

1. **Part A is closed on `main`**: its record committed (`README.md`, `docs/EMAIL_PLAN.md`,
   `docs/RUNBOOK.md` were still uncommitted in the folder `shared-calendar` on 2026-11-28), the
   tag `v3.0.0` given or deliberately left for later, `git status` clean there.
2. **No session working in the folder `shared-calendar`** while this one runs.
3. **No local stack is needed** for this session: its check is the unit tests. Leave the one
   that is up where it is (one per machine, `docs/MULTILANGUAGE_PLAN.md` finding F10).
4. `nvm use`, then open the session **in the folder `shared-calendar-multilanguage`**, on the
   branch `multilanguage`.

## Brief

Merge `main` into `multilanguage` (`git merge --no-ff main`), resolve every conflict so that the
e-mail release and the two languages both stand whole, read the files that merged by themselves
and may still be wrong together, check the merged code, and stop for review before committing.
Follow CLAUDE.md's working rhythm: an honest report at each pause, short messages.

The direction is the plan's (`docs/MULTILANGUAGE_PLAN.md` section 9): `main` into
`multilanguage` first. **`main` itself is not moved in this session** (decision 3 below).

Read these first, from **both** sides where they differ:
- `CLAUDE.md`, in particular "Hard rules from the design", "Cloud safety", "Comments" and
  "Changing these files" (the merge touches the root `CLAUDE.md`).
- `docs/MULTILANGUAGE_PLAN.md`: phase B's items 5 to 9, section 9 ("Beside the other work"),
  findings F10 and F16, and the "As done" notes of phase A.
- `docs/EMAIL_PLAN.md` on `main` (`git show main:docs/EMAIL_PLAN.md`): its version line, step
  m10's parts A and B, the "As done" note of part A. It says what part A changed that the plan
  of this branch did not expect.
- `docs/MULTILANGUAGE_ARCHITECTURE.md` section 4 (the language of a person, the invitation
  function) and `docs/EMAIL_ARCHITECTURE.md` sections 12.2 and 13.2 on both sides.

## Where we are (2026-11-28; measure again at the start)

- `multilanguage` at `023ce02`, 21 commits after its base, clean. Its base on `main` is
  `a2b4774`.
- `main` at `5a4456c`, 4 commits after the base, with part A's record still uncommitted:
  - `d1d66cc`: step m10 cut into parts A and B;
  - `e8884b2`: `MailStage=on` in `backend/samconfig.toml`;
  - `d2817ab`: the mailer's `ses:SendEmail` on `identity/*`, the From held to the stack's
    address by a condition, while SES keeps the account in its sandbox: the one exception to
    the root `CLAUDE.md`'s wildcard rule, which part B takes back;
  - `5a4456c`: the mailer's attachments sent as base64 (`backend/src/lib/ses.ts`), and the
    smoke test adding up the counts the AWS CLI prints per page.
- A trial merge (`git merge-tree --write-tree --name-only main multilanguage`, nothing
  written) gives **one file in conflict**, `backend/samconfig.toml`, and five merged by
  themselves: `CLAUDE.md`, `backend/template.yaml`, `docs/ARCHITECTURE.md`,
  `docs/EMAIL_ARCHITECTURE.md`, `docs/RUNBOOK.md`. Part A's closing commit will add
  `README.md` (the row of `v3.0.0`), `docs/EMAIL_PLAN.md` and `docs/RUNBOOK.md` again: run the
  trial again on the real `main` and report the list before merging.

## Decided already (the Product Owner)

1. **Both whole, nothing dropped.** Where both sides changed the same lines, the result holds
   both.
2. **What is released keeps its numbers.** The e-mail release is in the cloud: its version rows
   and record sections stay, and this branch's follow them (`docs/ARCHITECTURE.md`: the mail's
   row first, this plan's v19 after; `docs/RUNBOOK.md`: the mail's sections 3.3 and 5.11 as
   `main` has them, this branch's section 3.4 after). If `main` took a number this branch also
   took, this branch's moves to the next, and every reference to it follows, in the documents
   and in `docs/MULTILANGUAGE_PLAN.md`; finished briefs under `prompts/` are history and stay
   as written. `grep -rn` for each old number before calling it done.
3. **`main` receives this branch only when the two languages are deployed**, at the end of
   phase B (items 8 and 9), not in this session. Until then `main` is what runs in the cloud,
   and part B of step m10 deploys from it: with this branch merged in, that deploy would carry
   the two languages before their own release. If part B, or a fix of the e-mail release, lands
   on `main` first, `main` is merged into this branch again.
4. **No change of behaviour.** The merge decides nothing new. If two rules truly contradict,
   stop and ask.

## The merge

1. `git merge --no-ff main` on `multilanguage`. Resolve file by file:
   - `backend/samconfig.toml`: one line, `parameter_overrides`. `main` set `MailStage` to `on`,
     this branch added `DefaultLanguage="it"`: both kept, and this branch's comment on
     `DefaultLanguage` above it.
   - `README.md`, if in conflict: the row of `v3.0.0` from `main`, this branch's lines beside
     it; no row for the two languages yet (item 9 writes it).
2. **Read line by line what merged by itself**, since two changes that do not touch may still
   disagree:
   - `backend/template.yaml`: `main`'s mailer role (`identity/*` with the condition on
     `ses:FromAddress`) beside this branch's `DefaultLanguage`, `InviteMessageFunction`, its
     role, its log group and its permission. The invitation function's role must hold no SES
     right and no wildcard; the pool at `MailStage` `on` must still be `main`'s, with this
     branch's trigger added and nothing of `main`'s lost. The unit tests that read
     the template, and whatever `npm run lint` checks of it, decide; no build is needed here.
   - The root `CLAUDE.md`: `main`'s wildcard rule with its exception, this branch's hard rule
     on texts. **It must stay under 200 lines** ("Changing these files"): `main` has 199 and
     this branch 198 before part A's closing commit, so the merged file may go over. If it
     does, make room as that section says, and say in the report what moved where.
   - `docs/ARCHITECTURE.md` (the status line and the version rows, decision 2),
     `docs/EMAIL_ARCHITECTURE.md` (`main`'s sections 12.2 and 13.2 on the sandbox, this
     branch's decision M17 rewritten), `docs/RUNBOOK.md` (sections 3.3, 3.4 and 5.11).
3. **The texts.** `main` changed no text a person reads since the base (no file under
   `shared/` moved): confirm it with `git diff a2b4774..main --stat -- shared frontend/src`.
   If part A's closing commit changed a word of the invitation or of a mail, the English text
   of `shared/src/mail/texts.en.ts` takes it and the Italian one follows
   (`docs/MULTILANGUAGE_PLAN.md` section 9).
4. **What `main` added that this branch never saw**, searched by hand in the merged diff, as
   section 9 of the plan asks: a sentence written into a mail, an Excel file, the template's
   invitation or the smoke test's output that a person reads and that is not in the objects of
   texts. `backend/src/lib/ses.ts`'s base64 is not a text; it is read once for what it does to
   an attachment whose name this branch made depend on the language.
5. Comments keep `.claude/rules/comments.md`: no version or step numbers in code.

## The check (short: the full regression is item 7)

6. `npm ci` at the root if `package-lock.json` changed, then `npm run typecheck`,
   `npm run lint`, `npm run test:unit` (100 % line coverage kept). Report the counts.
7. No journey, no walk, no smoke test, no paid evaluation here: item 7 runs them once, on the
   merged code, with the local stack started from this folder on the operator's word. If the
   merge changed the assistant's instructions (it should not: `main` did not touch them), say
   so, since the paid evaluation is then owed again (`docs/MULTILANGUAGE_PLAN.md` section 9).
8. **The documents**: in `docs/MULTILANGUAGE_PLAN.md`, item 6's sentence "waits until step m10
   is deployed" made exact (part A of step m10, the stage `on` in the sandbox; part B not
   waited for), its "As done" note (what the trial found, each conflict and what it became,
   the counts, what item 7 finds ready), the version line; item 8's change set expecting what
   part A left in the cloud (the pool already sending through SES, the mailer's role with its
   exception). Nothing in `docs/EMAIL_PLAN.md`: it is `main`'s.

Not in this step: items 7 to 9 of phase B; moving `main` (decision 3); any deploy,
`npm run budget`, `npm run assistant-key`, any `aws` command; pushing (only when I ask); the
branches `gdpr`, `multi-calendar`, `whatsapp` and `presentation`.

## How we work

- **Messages to me are short.** One or two simple sentences, then what I must decide or do.
- **The pauses:** the trial merge's list, before merging; a conflict where the two sides
  contradict; the root `CLAUDE.md` over 200 lines; a test that fails after the merge; the end,
  before the commit.
- Commit only when asked: one merge commit, its message saying what each conflict became and
  what was read and left as merged. Then stop.

## Acceptance

- `git status` clean after the commit; `multilanguage` holds `main` whole
  (`git log main..multilanguage` shows this branch's commits and the merge, `git log
  multilanguage..main` is empty); no conflict marker anywhere
  (`git grep -n '^<<<<<<<\|^>>>>>>>'` empty).
- typecheck, lint and the unit tests with 100 % line coverage green, with their counts.
- `backend/samconfig.toml` holds `MailStage="on"` and `DefaultLanguage="it"`; no role of the
  template holds a wildcard but the mailer's one exception.
- The root `CLAUDE.md` under 200 lines.
- Every renumbered version and record section followed by its references (decision 2).
- `main` untouched.
