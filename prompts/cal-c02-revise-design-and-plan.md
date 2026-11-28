## Before opening the new session (operator)

This session opens step 4 of `docs/MULTI_CALENDAR_SEQUENCE.md`: it does its points 1 to 3 (the
merge of `main` into this branch, the design corrected against it, the plan written). Points 4
and 5, the build and the release, are the plan's own steps, each with a brief of its own.
Everything is local: documents only, no deploy, no `aws` command, nothing pushed unless asked.

1. **No session is writing on `main`** in the folder `shared-calendar` while this one merges,
   and `git status` is clean there.
2. **The local stack**: one per machine. Part C below needs it for one trial; it is started
   from this folder only on your word, so decide before the session whether another folder's
   stack can be stopped.
3. `nvm use`, then open the session **in the folder `shared-calendar-multi-calendar`**, on the
   branch `multi-calendar`.

## Brief

Bring the branch `multi-calendar` up to `main`, correct
`docs/MULTI_CALENDAR_ARCHITECTURE.md` against what `main` holds now, and then write
`docs/MULTI_CALENDAR_PLAN.md`. Three parts, a stop for my review after each. Follow
CLAUDE.md's working rhythm: an honest report at each stop, short messages.

**Documents only.** No code in `backend/`, `frontend/` or `shared/`, no script, no template, no
test. This session writes its own files only: `docs/MULTI_CALENDAR_ARCHITECTURE.md`,
`docs/MULTI_CALENDAR_SEQUENCE.md`, `docs/MULTI_CALENDAR_PLAN.md` and the next brief under
`prompts/`. It does not edit `docs/ARCHITECTURE.md`, `docs/SHARED_CALENDAR_SPEC.md`,
`docs/FRONTEND_*.md`, the `CLAUDE.md` files, `README.md` or any other existing document: the
plan's steps do, when they build. `npm run lint` stays green.

Read these first:
- `docs/MULTI_CALENDAR_ARCHITECTURE.md`, whole, and `docs/MULTI_CALENDAR_SEQUENCE.md`.
- `prompts/cal-c01-conversation.md`: how the design was reached and what I corrected.
- After the merge: `docs/MULTILANGUAGE_ARCHITECTURE.md` (sections 4, 5, 7 to 9, 11, 17) and
  `docs/MULTILANGUAGE_PLAN.md` (its findings, its rules of the run, phase B);
  `docs/EMAIL_PLAN.md` step m10, parts A and B; `docs/RUNBOOK.md` sections 3.3, 3.4, 5.11 and
  5.12; `docs/ARCHITECTURE.md` and the root `CLAUDE.md` as they are now.

## Where we are (2026-11-28; measure again at the start)

- `multi-calendar` at `7571663`: the design v3, the order of the work, two briefs. It changed
  no existing file. Its base on `main` is `a2b4774`.
- `main` at `491ca3c`, tag `v3.1.0`: e-mail at the stage `on` in SES's sandbox (`v3.0.0`, part
  A of step m10) and the two languages, both deployed. 192 files changed since the base.
- A trial merge (`git merge-tree --write-tree --name-only multi-calendar main`) gives no
  conflict.
- Steps 1 to 3 of `docs/MULTI_CALENDAR_SEQUENCE.md` are done. Its step 5 is not: AWS has not
  granted production access, and part B of step m10 is still owed, from `main`.
- Still owed on `main`, not by this session: the daily mail in Italian
  (`docs/RUNBOOK.md` section 5.12); the mailer's sending right on `identity/*`, which part B
  takes back.

## Decided already (the Product Owner)

1. **The design's decisions stand**: K1 to K25 and Q1 to Q6
   (`docs/MULTI_CALENDAR_ARCHITECTURE.md` sections 2 and 21). Part B corrects the document
   against `main`; it reopens none of them. If `main` makes one impossible or pointless, stop
   and say so.
2. **The languages' decisions stand too**: L1 to L16 of `docs/MULTILANGUAGE_ARCHITECTURE.md`.
   Everything a person reads in several calendars exists in English and in Italian, kept and
   checked the way that document says.
3. **The build happens on this branch, not on `main`.** `main` is what runs in the cloud and
   stays deployable: part B of step m10, and any fix of a release, deploy from it, and this
   branch then merges `main` again. The branch is merged into `main` once, after v4.0.0 is
   deployed (`docs/MULTI_CALENDAR_SEQUENCE.md` step 4).
4. **The release is v4.0.0.**

## Part A. The merge

1. Run the trial merge again and report its list. Then `git merge --no-ff main` on
   `multi-calendar`. If a conflict appears, stop: none is expected.
2. `npm ci` at the root (the lock file changed), then `npm run typecheck`, `npm run lint`,
   `npm run test:unit`. Report the counts. No journey, no walk: nothing of the code is this
   branch's.
3. In `docs/MULTI_CALENDAR_SEQUENCE.md`: the status line and each step's state as they are now
   (steps 1 to 3 done, with the commit or tag that closed each; step 5 open), and section 4's
   rows, of which the first two are done on `main`.

**Stop**: the report, and the merge commit on my word.

## Part B. The design corrected against `main`

Read the design section by section beside `main` and correct what no longer holds. A starting
list, not complete; each point is settled in the document or asked to me:

- **The language of a person** (`docs/MULTILANGUAGE_ARCHITECTURE.md` section 4): it is kept in
  Cognito's `locale` and is the person's own to change. The design makes the other four facts
  the person's own too (`PUT /me`): say how the two live together, what `GET /me` answers, and
  what the new user pool needs so that nothing of section 17 of that document must be tried
  again, or say what must.
- **The invitation.** `main` has a function on the pool that words Cognito's invitation in a
  language, and a default language of the stack (`DefaultLanguage`). The design has two
  invitations: Cognito's, to a person with no account yet, and the mailer's, to a person who
  has one. Say in which language each is written, when the person has no language yet, and
  whether the default belongs to the stack or to the calendar.
- **The new texts**: the design's screens, its two mails, the closing Excel backup, the error
  codes' wording, in both languages, within the length rule L16, in the objects of texts
  `main` has. Name them; the plan counts them.
- **The assistant**: its instructions and tools exist in two languages on `main`. The design
  adds `calendarId` to every tool and the read `list_my_calendars`: say what changes in the
  texts and that the paid evaluation is owed again.
- **The "Hello" message** (Q1) and whatever else the design words in English only.
- **E-mail as it runs now**: the stage `on` in the sandbox, the mailer's `identity/*` exception
  until part B, verified addresses only. The design's section 18 said "the build starts only
  after v3.0.0 is deployed": rewrite it for today (built on this branch, the real Users when
  AWS grants production access, Q2).
- **Sections 9 and 10** (the API and the data) against `shared/src` and
  `docs/ARCHITECTURE.md` as merged: every route, field and error code the design names must
  be `main`'s name for it.
- **Sections 17 and 20** (what changes in the existing documents; the plan's outline): the
  languages' documents and the two rules files added to the list, the outline's steps counted
  again.

The document gets a new version line saying what changed and why. Its diagrams keep
`.claude/rules/diagrams.md`.

**Stop**: what changed, in a short list, and every point I must decide, one at a time. The
commit on my word. Part C starts only when I say the design is agreed.

## Part C. The plan

Write `docs/MULTI_CALENDAR_PLAN.md` from the corrected design, in the shape of
`docs/EMAIL_PLAN.md` and `docs/MULTILANGUAGE_PLAN.md`.

**Ask me first, one question at a time, in simple words:**

1. Whether the build runs as the languages' did (no stop between steps, a commit per step
   without asking, the local stack started and stopped without asking, the stops named in
   the plan), or with a stop for review after each step. Say what you advise for this work,
   which changes every route and the data's keys, and why.
2. Whether the trial of the local Cognito emulator may run now (it needs the local stack of
   this folder), or is the plan's first step.
3. Anything else the documents do not settle.

**What planning must find**, by reading the code before writing the steps:

- every handler, every function of `backend/src/lib/calendarDb.ts` and every key of the
  `calendar` table that learns of a calendar; the size of the change, in files;
- every service and view of the front end that calls a moved route;
- every journey, every page of `docs/journeys/`, every check of `docs/FRONTEND_WALK.md` and
  every line of the smoke test that changes, and the new ones (the journey of two
  Administrators who must not see each other, the design's section 12.3);
- the five trials of the design's section 14.1, the emulator's sign-in by e-mail address
  first: it is the one that can change the design;
- the new user pool beside the old one in `backend/template.yaml`: what the change set will
  show, what happens to today's accounts, in which order pool, data and page move so that the
  cloud is never half of each;
- the migration script of the set-up, and how it is tried before the release;
- what `sam local start-api` does with the functions this work adds (it has hung before).

**The steps**, each with: what it builds, the files it touches, the tests it adds or changes,
its acceptance check (the lean one of `CLAUDE.md`), the documents it merges into (the
design's section 17), and an empty "As done" note. Every step leaves the branch green and can
be undone alone. The plan says how old routes and new ones live together while the steps run,
or that they do not and why.

**The release**, as the plan's last part, each item on my word: the full regression; the paid
evaluation, its cost said first; the deploy from this branch, the API before the page, the
change set read; the set-up migrated; the operator's look with two Administrators and one
person linked to both; the tag `v4.0.0`; the merge into `main`. And what it does about the
rest: part B of step m10 if still open, the mailer's wildcard, the branches `gdpr` and
`whatsapp`.

Then write the brief for the plan's first step, `prompts/cal-c03-…`, in the form of the
earlier step briefs.

**Stop**: commit nothing, show me the plan, do not start its first step.

## Not in this session

Any code; any edit of an existing document that is not this branch's own; moving `main`; any
deploy, `npm run budget`, `npm run assistant-key`, any `aws` command; pushing (only when I
ask); the branches `gdpr`, `whatsapp` and `presentation`.

## How we work

- **Messages to me are short.** One or two simple sentences, then what I must decide or do.
- Questions one at a time. Give your real opinion, also against mine.
- Commit only when asked. The local stack only on my word.

## Acceptance

- `multi-calendar` holds `main` whole (`git log multi-calendar..main` empty), with typecheck,
  lint and the unit tests green and their counts reported.
- `docs/MULTI_CALENDAR_SEQUENCE.md` says what is done and what is open.
- `docs/MULTI_CALENDAR_ARCHITECTURE.md` names nothing that `main` no longer has, holds the two
  languages wherever a person reads a text, and has no point left open that the plan needs.
- `docs/MULTI_CALENDAR_PLAN.md` and the brief of its first step exist, uncommitted, with every
  reference in them found by `npm run lint`.
- No existing document of `main` edited; `main` untouched.
