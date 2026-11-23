## Before opening the new session (operator)

This step adds a screen, runs the gate and the front end's journeys against the local stack, and
ends with a walk by hand in a browser. In the checkout, on a new branch from `main` (for example
`git switch -c change-password-p3`), after `nvm use`, with Docker running and **no
`ANTHROPIC_API_KEY` in the shell** (the journeys refuse the real Claude):

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

Start the stack from the same folder the session works in: `backend/env.local.json` is written
by `local:up` and names the local user pool, and a copy from another folder makes the journeys
fail with "User Pool … not found". No AWS login and no Anthropic key are needed. Nothing goes to
the cloud in this step.

## Brief

Implement plan step p3, "Front end: the screen" (`docs/CHANGE_PASSWORD_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

After this step a signed-in person, User or Administrator, opens the screen "Password" (last in
the navigation, address `#/password`), types the current password and the new one twice, sees
in words what the new one still misses while typing, and changes it. On success the page signs
them out and the login says "Password changed". Nothing changes in `backend/` or `shared/`, and
nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (the line on passwords), "Tooling and style" (100 % line coverage on
  `frontend/src`), "Changing these files"; then `frontend/CLAUDE.md`, including "Rules that are
  easy to break" (no `innerHTML`, a view never sees a token, a teardown wipes what the view put
  in the page). The rules in `.claude/rules/frontend-views.md` load when a view's file is read.
- `docs/CHANGE_PASSWORD_PLAN.md`, all of it: the decisions D1 to D4 (section 2), the findings
  (section 3), **the "As done" note of step p2 and its "Step p3 finds ready"**, step p3, and
  step p4 to see what this step must not take from it.
- `docs/ARCHITECTURE.md` section 6.9 (what the page checks, how each error is read, what the
  sign-out does not end), section 7.3 (the residual risks).
- `docs/FRONTEND_SERVICES.md` section 22 (`ChangePasswordService`, **section 22.6, its use from
  the view layer**), section 20 (`LogoutService`, and decision 53 in section 8: the reset of
  the page-wide services), section 8 decisions 63 to 68, section 2 (rules 6 and 9).
- `docs/FRONTEND_ARCHITECTURE.md`: section 3 (the rules of a view, **rule 9**), section 4 (the
  shape of a dialog and of a form), section 5.1 (the logic layer, one row per file), section 6
  (the shell, `SCREENS`, `sessionObjects`, the per-person teardown) and 6.1 (the panel, which
  stays out of `SCREENS`), section 8 (the views' tests), section 13.7 (logout), the decisions
  (up to 174) and the change log.
- `docs/FRONTEND_WALK.md`: its shape, sections 2 to 5, and the last check's number.
- The code: `frontend/src/main.ts`, `frontend/scripts/bundle.mjs`, `build.mjs` and `dev.mjs`
  (the bundle's constants); `src/views/shell.ts` and `login.view.ts`; one screen whose form is
  close to this one (`users.view.ts` with `logic/users.screen.ts` and `users.model.ts`, which
  check a username while typing); `logic/texts.ts`; `services/change-password.service.ts` and
  `.types.ts`, `logout.service.ts`; `shared/src/password.ts`; `index.html`, `style.css`; the
  tests of the shell, of the page (`tests/unit/views/page.test.ts`) and of one screen.

## Where we are (2026-11-23)

- Steps p1 and p2 are on `main` (merge `4bc3631`, pushed): `ChangePasswordService` exists with
  its two streams, the reasons as a closed list and `problems` on `new_password_refused`;
  `passwordProblems` of `shared/` gives the hints while typing. No screen exists.
- On `main` the page is deployed (`shared-calendar-web`) and has "Sign out", built on
  `LogoutService`; the assistant is a panel at the bottom of every screen.
- Next numbers: `docs/FRONTEND_ARCHITECTURE.md` decision 175; `docs/FRONTEND_SERVICES.md`
  decision 69 and version v11 if the service changes; `docs/FRONTEND_WALK.md` the check after its
  last one.

## Decided already (the Product Owner)

Apply them; if a document proves one wrong, stop and tell me before going on.

1. **Both roles**, one's own password only (plan D1).
2. **Sign out everywhere after a change, then sign in again** (plan D2).
3. **A screen of its own, `#/password`, named "Password", last in the navigation**, three
   fields: the current password, the new one, the new one again (plan D3).
4. **The assistant is not touched** (plan D4).
5. **One success, whatever the sign-out did**: the person reads only "Password changed".
6. **The screen checks that the two new passwords are the same**; the service receives the new
   password once and refuses one equal to the current.

## To decide at the start, before any code

Bring me these three, each with your recommendation and what it costs, in one short message,
and wait for my answer:

1. **What the page does after a successful change, beside the `LogoutService`.** "Sign out"
   resets the page-wide `LoginService` and `RefreshService` before it clears the store
   (`docs/FRONTEND_SERVICES.md` section 8, decision 53); `ChangePasswordService` only clears the
   store. Options: the shell calls the same `reset()`s on success; the service takes the
   page-wide services as `LogoutService` does (a change to section 22, v11); neither is needed.
   Say which one is true of the code as it is, with the case that would go wrong otherwise.
2. **How the build tells the service to skip `GlobalSignOut`.** The p2 note proposes a fourth
   bundle constant, `SKIP_GLOBAL_SIGN_OUT`, `true` in `dev.mjs` (the local stack) and `false` in
   `build.mjs`, so that a cloud build always signs out. Check it against `bundle.mjs` and the
   deploy command, and say how a test proves that the cloud build signs out.
3. **Where "Password changed" is shown.** The store is cleared before the success is emitted,
   so the password screen is gone when it arrives (decision 68). The login view, the shell, or
   another way: say which, and how it is cleared (the next sign-in, a time, a new failure).

## The step

1. **The logic**: `frontend/src/logic/password.model.ts` and `password.screen.ts`, in the shape
   of the other screens (one class, one stream, `start()`, "now" passed in if it needs one): the
   three fields' hints, from `passwordProblems` and the two comparisons (the two new ones differ,
   the new one equals the current); the form's state from the service's state stream; the
   button disabled while `pending` (decision 68) and while a hint stands. No DOM.
2. **The sentences** in `logic/texts.ts`: one per problem name of `shared/src/password.ts`, one
   for "the two new passwords differ", one per reason of the service (`wrong_current_password`,
   `too_many_attempts`, `network`, `server`, `unexpected`, `not_signed_in`), and "Password
   changed". English only, plain words, the 32 symbols listed in the hint for a missing symbol.
3. **The view**: `frontend/src/views/password.view.ts` and its element in `index.html`, with
   `autocomplete="current-password"` on the first field and `"new-password"` on the other two,
   `type="password"`; the hints under each field through `textContent`. The view empties the
   three fields on success, on `wrong_current_password` and on leaving (rule 9 of
   `docs/FRONTEND_ARCHITECTURE.md` section 3); no password in an attribute, a log or the
   address. `style.css` only if the existing classes do not serve.
4. **The shell**: the screen as the last row of `SCREENS`, for both roles; the service created
   in `sessionObjects` with the person's session and dropped with it, given `cognitoUrl` and the
   skip value (decision 2 above); the reaction to a success (decision 1); "Password changed" where
   decision 3 puts it. `main.ts` and the bundle scripts as decision 2 says.
5. **Tests**, 100 % lines on `frontend/src`: the model and the screen (each hint, the two
   comparisons, the button, each reason, the success); the view (fields emptied in the three
   cases, the hints, the autocomplete values, no password left in the page after a teardown);
   the shell (the row for both roles, the service per person, the reaction to a success, the
   skip value passed); the page (`page.test.ts`: the element, its fields). The existing tests of
   the other screens, of the login and of logout stay as they are; one that must change is a
   finding to report.
6. **The documents**, in the same change:
   - `docs/FRONTEND_ARCHITECTURE.md`: section 5.1 (the two new files), section 6 (the row, the
     service in `sessionObjects`, the reaction to a success), the decisions from 175, the change
     log and the status.
   - `docs/FRONTEND_SERVICES.md` only if the service changes (decision 1): section 22, the
     decision from 69, v11.
   - `docs/FRONTEND_WALK.md`: new checks for the screen, as `alice` and as `admin`, at the two
     widths: the hints while typing, the two new ones differing, a wrong current password, a
     change that succeeds, "Password changed" at the login, the old password refused, the new
     one accepted; the change log.
   - `docs/FOLDER_STRUCTURE.md`, `frontend/CLAUDE.md` (the folder map, the views and logic
     files), `docs/COMMANDS.md` if a command or the dev server changes.
   - `docs/ARCHITECTURE.md`: the sentence of step p3 in the v14 change-log row, and only what
     the screen proved inexact in section 6.9.
   - `docs/CHANGE_PASSWORD_PLAN.md`: the "As done" note under p3, ending with what p4 finds
     ready, and the version line.

Not in this step: the smoke test, `backend/scripts/cognito.mjs`, `README.md`, `docs/RUNBOOK.md`,
a release of the page (step p4); anything in `backend/` or `shared/src`; the assistant and its
documents; any `aws` command; the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the three decisions above; a decision of the plan or a sentence of
  `docs/ARCHITECTURE.md` section 6.9 that cannot be made true; an existing test that must
  change; two documents that disagree (the architecture wins over the plan, the plan over this
  brief).
- Comments follow `.claude/rules/comments.md`: plain words, each reference with the document's
  path in the same sentence, no step or brief number.
- Never run the back end's and the front end's integration tests at the same time.
- **The walk changes the passwords of `alice` and `admin`.** After it, restart the stack
  (`local:down`, `local:up`, `local:api`) so that both have their documented passwords again,
  and say so in the report.
- Commit only when asked. Do not push. Do not start step p4.

## Acceptance (`docs/CHANGE_PASSWORD_PLAN.md` step p3)

- `DYNAMODB_PORT=8002 npm run verify` green at the root, with `local:up` and `local:api`
  running: typecheck, lint, unit tests with 100 % lines on `frontend/src`.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend` green, the change of password's
  journey with the others.
- The new checks of `docs/FRONTEND_WALK.md` done by hand in a browser against the local stack
  (`npm run dev -w frontend`), at the two widths, as `alice` and as `admin`; each one reported
  as yes, no or not run. Then the stack restarted.
- `git status` shows no change under `backend/` or `shared/src`.
- The documents listed are updated; the "As done" note holds the detail. Then the short closing
  message, and suggest the commit.
