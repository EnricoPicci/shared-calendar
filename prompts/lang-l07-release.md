## Before opening the new session (operator, in your own terminal)

```bash
nvm use                                                                # in the worktree shared-calendar-multilanguage
git status                                                             # only this brief untracked
git -C ../shared-calendar status                                       # main's worktree: clean, on main
aws sso login --profile shared-calendar-admin --use-device-code        # only for the read-only checks of point 2
export AWS_PROFILE=shared-calendar-admin
```

No local stack is needed: this step deploys nothing, so it has no gate.

- **This step changes no cloud resource.** It moves `main`, makes a tag and pushes to GitHub,
  which is public: each of those is run **by me, in my own terminal**, after a go I give in the
  session for that command alone. The session writes the documents, runs the local checks and
  read-only `aws` and `git` commands.
- **To decide before the session, by me** (the session asks if I have not said):
  1. **the version**: `v3.1.0` proposed (a minor one: nothing breaks an old client,
     `docs/MULTILANGUAGE_ARCHITECTURE.md` section 13);
  2. **how `main` is moved**: a fast-forward to the closing commit (`git merge --ff-only
     multilanguage` in `main`'s worktree), proposed, since `main` (`ef6ddc4`) is already in this
     branch and nothing has landed on `main` since; or a merge commit (`--no-ff`), as for
     `slot-5min`, which had diverged;
  3. **the worktree** `../shared-calendar-multilanguage` after the push: removed and the branch
     kept, as for `slot-5min` (proposed), or kept;
  4. **the Administrator's daily mail** (`docs/RUNBOOK.md` section 5.12, "Owed"): if it has
     arrived when the session starts, its language goes into the closing commit; if not, the
     release does not wait for it, and the record says it is still owed.

## Brief

Run phase B's item 9 of `docs/MULTILANGUAGE_PLAN.md`, "The release closed", following CLAUDE.md's
working rhythm: its checks, an honest report, a stop at each pause.

After this step the languages are a released version: one closing commit on `multilanguage`
with the version's records, `main` at that commit, the tag on it, and `main`, the branch and the
tag pushed. The cloud already runs this code (item 8, deployed at `744572b`); nothing is
deployed again.

Read these in full first:
- `CLAUDE.md`: "Working rhythm" (**the closing message is short**), "Comments", "Changing these
  files" (only if one of those files is touched, which this step should not need).
- `docs/MULTILANGUAGE_PLAN.md`: the version line, **phase B's items 6 to 9** with the "As done"
  notes of 6, 7 and 8, and section 9 (beside the other work).
- `docs/RUNBOOK.md`: **section 5.12** (the record of item 8, its "Owed"), section 3.4, section 2
  step 6's "Which branch".
- `README.md`: **"Versions"** (the rule above the table, the rows `v2.4.0` to `v3.0.0`: a row
  names the record's commit when the deployed code is an earlier one).
- `docs/MULTILANGUAGE_ARCHITECTURE.md`: the status line and **section 17**'s paragraph "Still to
  try, on the cloud's pool": both still say the cloud's facts wait for phase B.
- `git tag -n1` and `git show v3.0.0 --no-patch` (an annotated tag, its message one line).

## Where we are (2026-11-28; measure again at the start)

- `multilanguage` at `f8efbce` (item 8's record), the deployed code `744572b`; neither pushed:
  `origin/multilanguage` at `25b54d4`. `main` at `ef6ddc4`, equal to `origin/main`, merged into
  this branch at item 6 (`f6755c7`); nothing has landed on `main` since, so a fast-forward is
  possible. `main` is checked out in the worktree `../shared-calendar`.
- The cloud: `shared-calendar-api` and `shared-calendar-web` at `744572b`, `DefaultLanguage`
  `it`, `MailStage` `on` in SES's sandbox; the smoke test 65 PASS, the operator's look all yes.
- Owed: the Administrator's next daily mail, in its language (`locale` `it`, the same as the
  default); part B of `docs/EMAIL_PLAN.md` step m10, which is not this plan's.
- Other branches beside it: `gdpr`, `multi-calendar`, `presentation`, `whatsapp`; none is touched.

## The step

In this order. **Each command that moves a branch, makes a tag or pushes waits for my go**; the
session proposes the exact command and I run it.

1. **The start.** `git status` clean but this brief; `HEAD` named; `main` and `origin/main` named,
   `git merge-base --is-ancestor main multilanguage` true. Read-only, that the cloud still runs
   what item 8 left: the stack `shared-calendar-api` `UPDATE_COMPLETE` with its last update at
   item 8's deploy, `DefaultLanguage` `it`. A difference is a pause.
2. **The daily mail**, by my report: arrived or not, its language, its two files opened. Read-only
   and by fields only, the mailer's line of kind `daily` (`outcome`, `language`) since item 8.
3. **The documents**, in one closing commit, with this brief:
   - `README.md`, "Versions": the row of the version, in the style of the others: "the record's
     commit after `744572b`, whose code was deployed"; what it is (the page, the mails, the Excel
     files, the invitation and the assistant in English and Italian, a person's language in their
     account, `DefaultLanguage`; nothing breaks an old client); the record
     `docs/RUNBOOK.md` section 5.12. The paragraph under the table unchanged unless it is wrong.
   - `docs/RUNBOOK.md`: section 5.12's title and first lines name the version and the tag; its
     "Owed" by decision 4; section 2 step 6's "Which branch" gains that this release was made
     from the branch `multilanguage`, merged into `main` since.
   - `docs/MULTILANGUAGE_ARCHITECTURE.md`: the status line (built and deployed, the version);
     section 17's "Still to try" becomes what was tried in the cloud and how it answered
     (`docs/RUNBOOK.md` section 5.12). Its change log, if it has one, gains a line.
   - `docs/MULTILANGUAGE_PLAN.md`: item 9's "As done" note, the version line (v6, the plan
     finished), and anything of section 9 or 10 that the release makes untrue.
   - Nothing else changes: no code, no template, no `CLAUDE.md`. If a document is found wrong
     beyond these, it is a pause, not a fix.
   - `npm run typecheck` and `npm run lint` green (the comment rule reads the documents'
     references). The commit on my go.
4. **`main` moved** (my go), in `main`'s worktree, by decision 2, for example
   `git -C ../shared-calendar merge --ff-only multilanguage`. Then `main` equal to
   `multilanguage`, its tree clean.
5. **The tag** (my go): an annotated tag on that commit, its message one line like `v3.0.0`'s,
   for example `git tag -a v3.1.0 -m "…"`. `git tag -n1` shows it.
6. **The push** (my go, one command or three, as I choose): `main`, `multilanguage` and the tag,
   for example `git push origin main multilanguage v3.1.0`. Then `origin/main`,
   `origin/multilanguage` and the tag on GitHub named, each equal to the local one.
7. **The worktree**, by decision 3 (my go): `git worktree remove ../shared-calendar-multilanguage`
   from `main`'s worktree, the branch kept. Only after the push, and only if its tree is clean.

Not in this step: any deploy, `npm run smoke`, `npm run test-user`; part B of
`docs/EMAIL_PLAN.md` step m10; the privacy notice; the other branches and their worktrees; a
merge of `main` into them.

## How we work in this step

- **Messages to me are short.** At the end of a point and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. Questions one at a time.
- **The pauses:** the cloud not as item 8 left it; `main` not an ancestor of `multilanguage`, or
  moved since `ef6ddc4`; `main`'s worktree not clean; two documents that disagree; a check red;
  before each go.
- **Each go is for one command.** When a command fails, I am told what happened and nothing is
  retried without a new go. Never `--force`, never a rewrite of a pushed commit or tag.
- **AWS in the session: read-only only.** No command that changes the cloud.
- **Hard rules that bear on this step:** no token, password, account id or e-mail address in a
  command's argument, a document, a commit message or a message to me (the repository is public);
  comments and references follow CLAUDE.md "Comments"; lint must pass.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked: the closing commit of point 3, this brief in it.

## Acceptance (`docs/MULTILANGUAGE_PLAN.md` phase B, item 9)

- The cloud read and found as item 8 left it; the daily mail recorded by decision 4.
- One closing commit: `README.md`'s row, `docs/RUNBOOK.md` section 5.12 and section 2's branch
  note, the architecture's status line and section 17, the plan's item 9 note and version line,
  this brief; `npm run typecheck` and `npm run lint` green.
- `main` at the closing commit, the tag on it, `main`, `multilanguage` and the tag pushed, each
  equal to its remote; the worktree as decided.
- Then the short closing message.
