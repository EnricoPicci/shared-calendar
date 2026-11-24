## Before opening the new session (operator)

This step changes two operator scripts, runs them against the local stack, and then, only when
asked in that session, against the cloud. In the checkout, on `main` after `nvm use`, with
Docker running and **no `ANTHROPIC_API_KEY` in the shell** (the journeys refuse the real
Claude):

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

Start the stack from the same folder the session works in: `backend/env.local.json` is written
by `local:up` and names the local user pool.

Three things to settle before the cloud parts (parts B and C below), not needed for part A:

- **The tree must be clean for a deployment.** `backend/` holds three untracked copies made
  outside git ("env.local 2.json", "env.local 3.json", ".verify-ok 2"); the deploy gate
  (`scripts/deploy-gate.sh`) refuses a dirty tree, so delete them (or move them out of the
  repository) first.
- **Step p3 (`9aa5e33`) is not pushed.** Say whether the commits are pushed before the page is
  released, as for the assistant's deployment.
- **The AWS login**: `aws sso login --profile shared-calendar-admin --use-device-code` and
  `export AWS_PROFILE=shared-calendar-admin`. The smoke test asks for the admin password at its
  prompt; the Anthropic key is already stored, so the smoke test's exchange costs about a US
  cent.

## Brief

Implement plan step p4, "The proof against real Cognito, and the hand-over"
(`docs/CHANGE_PASSWORD_PLAN.md`), following CLAUDE.md's working rhythm: one step, its
acceptance check, an honest report, then stop for review.

After this step the smoke test proves the change of one's own password end to end against real
Cognito: a wrong current password refused with the error the page expects, the change made, the
old password refused, the new one accepted, the refresh token from before the change dead. The
page with the screen "Password" is released and walked at its deployed address. The operator's
documents say what to tell a person who knows their password and one who lost it. v14 of
`docs/ARCHITECTURE.md` is closed.

The step has three parts. **Part A** is local and is done in any case. **Parts B and C touch the
cloud: each is done only when I ask for it in this session, in so many words, after part A is
reported.** Without that, each is reported as "not run".

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (logs never contain tokens or passwords; every password permanent; the API
  never changes a password), **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md`.
- `docs/CHANGE_PASSWORD_PLAN.md`, all of it: the decisions (section 2), **the findings F1 and
  F2** (section 3), the "As done" notes of steps p1 to p3 (**p3's "Step p4 finds ready"**), and
  step p4.
- `docs/ARCHITECTURE.md` section 6.9 (the change, row by row), section 7.3 (the residual risks),
  section 8 (the notes on Cognito emulation: what cognito-local answers, what it lacks), section
  9.3 (the smoke test), and the v14 row of the change log.
- `docs/RUNBOOK.md` sections 1, 2 (with 2.1, the smoke test's calendar journey), 3.1, 5.5 and
  5.6 (the records of the page's and the assistant's deployments: the shape of a record).
- `docs/COMMANDS.md` sections 5 and 6; `README.md` ("The deployed stacks", the screens' table,
  the passwords).
- `docs/FRONTEND_WALK.md` section 9 (checks 123 to 133); the walk has no section for the
  deployed page.
- The code: `backend/scripts/cognito.mjs` and `backend/scripts/smoke.sh` in full (the rules of
  its header: tokens and passwords only in shell variables and pipes, the cleanup on every
  exit, what stays by design); `frontend/scripts/deploy.sh` and `scripts/deploy-gate.sh`;
  `shared/src/password.ts`; `backend/src/lib/password.ts` (the generator of `POST /users`)
  and its tests.

## Where we are (2026-11-23)

- Steps p1 to p3 are on `main`, p3 committed as `9aa5e33`, not pushed. The screen "Password"
  exists; the page's bundle always signs out everywhere but in the dev server
  (`SKIP_GLOBAL_SIGN_OUT`, `docs/FRONTEND_ARCHITECTURE.md` decision 181).
- The stacks `shared-calendar-api` and `shared-calendar-web` are deployed; the page in the cloud
  is the one released at the assistant's deployment, without the screen. The API does not
  change in this step, so **no `sam deploy`**: the smoke test runs against the stack as it is.
- The smoke test passes 26 lines in the cloud (`docs/RUNBOOK.md` section 5.6).
- Not proved yet: which error real Cognito gives to a wrong current password (F1), and that
  `GlobalSignOut` revokes the refresh token where `ChangePassword` alone does not (F2).

## Decided already (the Product Owner)

Apply them; if a document proves one wrong, stop and tell me before going on.

1. **No deployment of the API.** No route, function, role or permission changes (v14 of
   `docs/ARCHITECTURE.md`).
2. **The smoke test changes the password of its own throw-away user only**, never the
   Administrator's and never a real User's.
3. **The cloud runs (parts B and C) only when asked in this session.**
4. **The walk at the deployed page uses a throw-away User**, created on the page by the
   Administrator and deleted at the end; never a real person's account.

## To decide at the start, before any code

Bring me these, each with your recommendation and what it costs, in one short message, and wait
for my answer:

1. **How the script gets and tests the refresh token.** `cognito.mjs sign-in` prints the access
   token only. Options: `sign-in` prints both tokens (two lines) and the shell keeps them apart;
   a separate action, `refresh`, with the refresh token on stdin, that says whether Cognito
   still accepts it. Say how neither token is printed, put in an argument or written to disk.
2. **What the smoke test does about `GlobalSignOut` locally.** cognito-local does not implement
   it (`docs/ARCHITECTURE.md` section 8), so the refresh token is not revoked against the local
   stack. Options: skip the sign-out and its check locally, with the same switch the script uses
   for the deletion's sign-out, and print a line that says so (PASS or a new kind of line); or
   something else. The local run must stay green, and the cloud run must never skip.
3. **Where the journey sits in `smoke.sh`, and which password later checks use.** Journey 11
   signs in as the deleted user with `user_password` to prove that the sign-in fails: after a
   change, it must use the new one. Say where the journey goes (I expect after the assistant's
   exchange and before the deletion) and what the cleanup does if the script stops halfway
   through the change.
4. **Where the new password comes from.** It must pass `shared/src/password.ts`, never appear
   in an argument, a file or the output. Options: the generator the back end already has; one
   made in `cognito.mjs` and kept by it; another way.
5. **The walk at the deployed page (part C): who walks, and how.** A second browser signed in
   as the same User must be seen signed out after the change (at its next refresh, so up to the
   access token's 15 minutes plus the authorizer's cache: say how the walk waits for it or makes
   it happen). The admin password is the operator's: say what the operator does by hand and
   what you do, and which checks of `docs/FRONTEND_WALK.md` section 9 are repeated there.

## The step

### Part A: local (in any case)

1. **`backend/scripts/cognito.mjs`** gains the change of a password: both passwords on stdin
   (say how they are told apart), the access token as decision 1 says, `ChangePassword` then
   `GlobalSignOut` (skipped as decision 2 says), errors printed as `<name> <message>`, never a
   password or a token; and what decision 1 adds for the refresh token. Its header comment says
   all of it.
2. **`backend/scripts/smoke.sh`** gains the journey for its throw-away user, each a PASS or FAIL
   line in the script's style:
   - a wrong current password is refused, with the error named, and the line says which one
     (`NotAuthorizedException` is what `docs/ARCHITECTURE.md` section 6.9, row 2 expects of
     real Cognito; `InvalidPasswordException` of cognito-local);
   - the change succeeds;
   - the old password no longer signs in;
   - the new one does;
   - the refresh token from before the change is dead (cloud), or the line of decision 2
     (local).
   The header comment says the journey, what it proves only in the cloud, and the new count of
   lines. The cleanup still deletes the user on every exit.
3. **Run `npm run smoke -w backend -- local`**: every line PASS (or the line of decision 2).
   Then the gate: `DYNAMODB_PORT=8002 npm run verify` at the root. Never at the same time as the
   front end's integration tests.
4. **The documents, in the same change** (the cloud's results are added in parts B and C):
   - `docs/ARCHITECTURE.md`: section 9.3 (the smoke test's new journey), section 8 only if the
     local run showed something new, and the v14 row's sentence of step p4.
   - `docs/RUNBOOK.md`: **what to tell a person who knows their password** (the screen
     "Password"; signed out everywhere after; a second device asks to sign in again within 15
     minutes or so) **and one who lost it** (a User: deleted and created again, the new password
     handed over out of band; the Administrator: `bootstrap-admin`); the smoke test's line count
     where the document says 26.
   - `docs/COMMANDS.md`: `smoke` (the new journey, what it proves only in the cloud), and
     `cognito.mjs` if it is listed.
   - `README.md`: the screen "Password" in the screens' table; the passwords' paragraph (a
     person may change their own; the lost password unchanged); the smoke test's row.
   - `docs/CHANGE_PASSWORD_PLAN.md`: the "As done" note under p4 (part A now, B and C when
     done) and the version line.

### Part B: the smoke test against `shared-calendar-api` (only when asked)

5. `npm run smoke -w backend -- shared-calendar-api`, the operator typing the admin password at
   the prompt (a run inside `script -q …` keeps the lines, as `docs/RUNBOOK.md` section 2
   says). Every line PASS. **It is the one proof of F1 and F2.** If a wrong current password
   is refused with anything but `NotAuthorizedException` or `InvalidPasswordException`, or the
   old refresh token still works after the change, **stop and tell me**: the page's sentence or
   section 6.9 is then wrong.
6. Then the log search of `docs/RUNBOOK.md` section 2 (no password, no token in the logs). The
   change makes no Lambda log, which the search should show too.

### Part C: the page released and walked (only when asked, after part B)

7. `npm run deploy -w frontend`, behind its gate (a green `verify` less than 30 minutes old, on
   a clean tree at HEAD); the back end does not change. The release's lines (the files, their
   sizes, the invalidation) are kept for the record.
8. The walk at the deployed page with a throw-away User, as decision 5 says: the screen is
   there for both roles; a wrong current password; a change; "Password changed" at the login;
   the old password refused; the new one signing in; the second browser signed out at its next
   refresh. Each check reported as yes, no or not run. The User deleted at the end, from the
   page.
9. The record: `docs/RUNBOOK.md` section 5 gains a record of this step (the commit released,
   the smoke test's lines, F1 and F2 as proved, the release, the walk, the cost), in the shape
   of sections 5.5 and 5.6; `docs/ARCHITECTURE.md` closes v14 (its row no longer "(open)",
   section 6.9's title, F1 and F2 written as proved where they are said); the plan's "As done"
   note; `docs/FRONTEND_WALK.md` if a check proved inexact at the deployed page.

Not in this step: anything in `backend/src`, `backend/template.yaml`, `frontend/src` or
`shared/src` (a finding there is a pause, not a fix); `sam deploy`; the assistant and its
documents; a forgotten password, a reset by the Administrator, MFA (the plan's section 6).

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the decisions above; the end of part A (I decide on B); the end of part B (I
  decide on C); a result of real Cognito that disagrees with `docs/ARCHITECTURE.md` section 6.9;
  a change that would be needed outside `backend/scripts`, the documents and `README.md`; two
  documents that disagree (the architecture wins over the plan, the plan over this brief).
- **Cloud safety** (`CLAUDE.md`): no `aws` command that creates, changes or deletes a resource,
  no `sam deploy`, and `npm run deploy -w frontend` only in part C, when asked. The smoke test
  creates and deletes its own user through the API, which is what it is for.
- Tokens and passwords: in shell variables and pipes only, never an argument, a file, a log or
  the output; the smoke test's header states the rule, and the new code keeps it.
- Comments follow `.claude/rules/comments.md`: plain words, each reference with the document's
  path in the same sentence, no step or brief number.
- Commit only when asked. Do not push unless asked.

## Acceptance (`docs/CHANGE_PASSWORD_PLAN.md` step p4)

- `DYNAMODB_PORT=8002 npm run verify` green at the root, with `local:up` and `local:api`
  running.
- `npm run smoke -w backend -- local` green, the new journey's lines among them.
- The smoke test against `shared-calendar-api` green with F1 and F2 proved, or reported as not
  run.
- The page released and the walk at the deployed page done, each check yes or no, or reported
  as not run.
- `git status` shows no change under `backend/src`, `frontend/src`, `shared/src` or in either
  `template.yaml`.
- The documents listed are updated; the "As done" note holds the detail. Then the short closing
  message, and suggest the commit.
