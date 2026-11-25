## Brief

Implement plan step m7, "The first sign-in" (`docs/EMAIL_PLAN.md`). Follow CLAUDE.md's working
rhythm: the step, its check, an honest report, then stop for review.

After this step, locally: a person whose account has a **temporary** password signs in with it.
Cognito gives no token. It answers with the challenge `NEW_PASSWORD_REQUIRED`, and today's page
calls that a failed sign-in. With this step, the page shows a screen "Choose your password", with
the same rule and the same live checks as the "Password" screen. The person types a new password
twice, the page answers the challenge with `RespondToAuthChallenge`, and the person is signed in
as after any sign-in. The old temporary password no longer works. When the person takes longer
than Cognito's 3 minutes, the screen says so and leads back to the sign-in. Only the front end
changes, plus a local script to make such an account. Nothing is deployed, nobody is invited
yet: that is step m8.

Read these in full first:
- `CLAUDE.md`, in particular:
  - "Working rhythm" (**the closing message is short**);
  - "Hard rules from the design" (**the password rules, which this step touches**: see "Open
    before the step starts" below; the logging rule: no password, no token, no session of a
    challenge in a log or a state);
  - "Cloud safety", "Comments", "Tooling and style";
  - "Changing these files" (**the file is at 199 of its 200 lines**).

  Then `frontend/CLAUDE.md` (136 lines), `shared/CLAUDE.md` and `backend/CLAUDE.md` (the
  scripts). The rules of `.claude/rules/` load when a file of their paths is read
  (`frontend-views.md` for the views, their tests, the page and the style sheet).
- `docs/EMAIL_PLAN.md`:
  - sections 1 to 4: F13 (the new page goes with the API in step m9, because the old one fails
    on this challenge) and F15 (the operator's test User) shape this step; read row m7 of
    section 4;
  - section 5.1 (the short check);
  - **step m7**, and the "As done" note of step m6 (what this step finds ready);
  - step m8, to see what this step must not take from it.
- `docs/EMAIL_ARCHITECTURE.md`: sections **5.1 and 5.2 (the flow and the page)**, 5.4 (the test
  User), 13.3 (why the page goes with the API), **14.1 (cognito-local, tried: the challenge
  works locally, its temporary password is 6 characters)**, 17 (the row of the root rule).
- `docs/FRONTEND_SERVICES.md`: sections 1.1, 4 (`LoginService`), 6 (its unit tests), 9
  (`SessionStore`), **10.1 (`cognito.ts`, `InitiateAuth`)**, 14.9 and 14.10 (the change of
  password journey), **22 (`ChangePasswordService`, the model for a request straight at
  Cognito)**.
- `docs/FRONTEND_ARCHITECTURE.md`: the login and the "Password" screen (section 5.1's rows,
  section 6), the shell's routing before sign-in, the sizes of section 7.1.
- `docs/FRONTEND_WALK.md` sections 1, 2 (the login) and 9 (the password).
- `docs/COMMANDS.md` sections 3 (the local stack, cognito-local's quirks) and 4 (the front end's
  commands and its integration tests).
- The code:
  - `frontend/src/services/`: `cognito.ts` (the reason `challenge`), `login.service.ts` and
    `login.types.ts`, `change-password.service.ts` and its types, `session.store.ts`;
  - `frontend/src/logic/password.model.ts`, `password.screen.ts`; `frontend/src/views/login.view.ts`,
    `password.view.ts`; `frontend/src/main.ts`, `frontend/index.html`, the style sheet;
  - `shared/src/password.ts` (the rule and its checks);
  - `frontend/tests/integration/login.service.test.ts`, `change-password.test.ts`, `local.ts`;
  - `backend/scripts/cognito.mjs` (how a script reaches Cognito, a password on stdin, never
    saved), `backend/scripts/bootstrap-admin.sh`, `backend/tests/integration/setup.ts`
    (`AdminSetUserPasswordCommand`);
  - the unit tests of all of these.

## Where we are (2026-11-25)

- Steps m1 to m6 are committed (`2bd1c65`, `c20649e`, `5fe43bf`, `a060fc3` with `d4b0917`), not
  pushed. `local:api` runs its containers on demand (`10c4b85`).
- Every password today is permanent: the bootstrap and the seed set them, `POST /users` makes
  one and answers it, the journeys set theirs with `AdminSetUserPassword` `Permanent: true`. No
  account the page meets is in `FORCE_CHANGE_PASSWORD`, so the challenge is never seen.
- `frontend/src/services/cognito.ts` answers any `InitiateAuth` without tokens as the failure
  `challenge`, and the login screen says the sign-in failed.
- cognito-local 5.3.0 gives the challenge `NEW_PASSWORD_REQUIRED` for an account with a
  temporary password and accepts `RespondToAuthChallenge` (tried, `docs/EMAIL_ARCHITECTURE.md`
  section 14.1).

## Decided already (the Product Owner)

Everything in `docs/EMAIL_ARCHITECTURE.md` (its decisions, open points and section 22) and in
`docs/EMAIL_PLAN.md` (sections 2 and 3, F1 to F15). Above all: Cognito forces the change of a
temporary password, so the authorizer and the routes need nothing (M2, M11); the screen uses
the rule and the live checks of the change-password screen (section 5.2); the new page must
reach the cloud before any account there has a temporary password (F13). Apply them. If the code
proves one wrong, stop and tell me before going on.

## Decided for this step (the Product Owner, 2026-11-25)

1. **The root `CLAUDE.md`'s password rule changes in step m8, not here.** Row m7 of
   `docs/EMAIL_PLAN.md` section 4 rewrote it in this step ("A User's first password is
   temporary: Cognito makes it, e-mails it and forces its change at the first sign-in; the API
   never sees it or answers it …"). But until step m8 `POST /users` still makes a permanent
   password and answers it, so written now the rule would be false for a whole step. It moves to
   step m8, with the code that makes it true, and F15's exception with it. This step leaves the
   root `CLAUDE.md` as it is.
2. **The local script is `test-user`, target `local` only.** Instead of a separate script,
   `npm run test-user -w backend -- local <username>` (F15) is built here: one User in group
   `user`, with the four facts, the e-mail filled in locally (decision 4), and a **temporary** password typed
   on stdin through `scripts/cognito.mjs`, never saved, never printed. Step m8 adds the target
   `cloud`. One script, not two.
3. **The 3 minutes are found out from Cognito, not counted by the page.** The page keeps no
   clock for the challenge: when the person presses "Choose password" and Cognito answers that
   the session is over, the screen says so ("This took too long. Please sign in again.") and
   leads back to the sign-in, the username kept.
4. **Locally, `test-user` fills in the four facts itself**, as the journeys do
   (`<username>@example.com` and made-up names and address), and asks only for the temporary
   password. The target `cloud` (step m8) asks for the real e-mail, as F15 says.
5. **"Choose your password" has a "Cancel" button** back to the sign-in: nothing is changed, the
   temporary password still works the next time.

## The step

As step m7 of the plan lists, with these points made precise:

1. **`frontend/src/services/cognito.ts`**: an `InitiateAuth` answer with `ChallengeName`
   `NEW_PASSWORD_REQUIRED` becomes its own result, with the challenge's `Session`; any other
   challenge stays the failure `challenge`. A new call, `RespondToAuthChallenge`
   (`NEW_PASSWORD_REQUIRED`, `USERNAME`, `NEW_PASSWORD`, the session), answering tokens as
   `InitiateAuth` does. Its failures named as the change of password names Cognito's
   (`InvalidPasswordException`; an expired session, `NotAuthorizedException` "Invalid session …"
   or what cognito-local and Cognito really answer, tried, not guessed).
2. **`LoginService`** (`login.service.ts`, `login.types.ts`): a state "a new password is
   needed", holding the username and nothing secret; a method that takes the new password,
   checks it with the shared rule before sending, answers the challenge, then stores the tokens
   and signs the person in exactly as a sign-in does (the same `SessionStore` path, the same
   result). The challenge's session lives only inside the service, never in a state, a result
   or a log, like the tokens. A session Cognito refuses (its 3 minutes are over: decision 3) is
   a result of its own that leads back to the sign-in, the username kept; the service keeps no
   clock.
3. **The view**: a screen "Choose your password" shown in place of the login when the service is
   in that state. The rule and the live checks are those of the "Password" screen, reused, not
   copied: a model shared with `password.model.ts` if that is the simplest, or its pieces. Two
   fields (new, and again), "Choose password" and "Cancel" (back to the sign-in, decision 5). On success the
   app as after a sign-in. The keyboard, the labels and the narrow width as the login screen.
   Keep it one screen: the GDPR consent will later be a second gate after it
   (`docs/EMAIL_ARCHITECTURE.md` section 5.2), but nothing is built for it now.
4. **`backend/scripts/test-user.sh`** and its npm script, target `local` (decision 2); any other
   target refused with a sentence saying step m8 adds `cloud`. Tried once by hand: the User
   made, the challenge answered in the page, the User removed.
5. **Tests**: unit tests for every new branch of `cognito.ts`, `LoginService`, the model, the
   screen and the view, 100 % lines kept. Journeys: in
   `frontend/tests/integration/login.service.test.ts`, a block of its own, with a throw-away
   User made for the run and removed before and after: a temporary password set by a helper
   (`AdminSetUserPassword` with `Permanent: false`, in `local.ts`); the sign-in gives the state
   "a new password is needed" and no token; a too-weak password refused before any request; a
   good one signs in (a call to `GET /me` with the token answers the User); the temporary
   password then refused, the new one accepted. Its page under `docs/journeys/frontend/`, with
   the project skill `explain-journey`. No existing journey's story changes; if one would, pause.
6. **The documents** of section 4's row m7:
   - `docs/FRONTEND_SERVICES.md`: `cognito.ts` (the challenge, `RespondToAuthChallenge`),
     `LoginService` (the state, the method, the results, their unit tests), the journey; a
     version row;
   - `docs/FRONTEND_ARCHITECTURE.md`: the screen, its model and view, the sizes; a version row;
   - `docs/FRONTEND_WALK.md`: the screen's checks, as a section of its own, with what they need
     (an account made by the script) and leave; a version row;
   - `docs/COMMANDS.md`: the script;
   - `docs/EMAIL_PLAN.md`: already moved the root rule's row from m7 to m8 and named
     `test-user`'s target `local` in step m7 (version v8, done with this brief);
   - `frontend/CLAUDE.md` and `backend/CLAUDE.md` if a line is needed (`test-user` among the
     scripts). The root `CLAUDE.md` unchanged (decision 1).

Not in this step:
- the invitation, `POST /users` without a password, the resend, the stages' conditions, the SES
  resources, the users screen's states (step m8);
- the target `cloud` of `test-user`, the root `CLAUDE.md`'s password rule, the smoke test (step m8);
- the GDPR consent;
- any `aws` command, the cloud.

## How we work in this step

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do. Questions one at a time, in simple words.
- **The pauses**:
  - code proving `docs/EMAIL_ARCHITECTURE.md` section 5 or `docs/FRONTEND_SERVICES.md` wrong
    (for instance, cognito-local or Cognito answering the challenge otherwise than written);
  - an existing journey whose story would change;
  - any line of the root `CLAUDE.md` (decision 1);
  - a new dependency.
- **Ask me before you stop or restart the local stack** (`local:up`, `local:down`, `local:api`,
  `local:lambda`): I run them in my own terminals. After `npm run build -w backend` they need a
  restart; tell me, and wait for my go-ahead.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- No password, token or challenge session in a log, a state, a result or a test's output. The
  test passwords are test values of the project (`docs/COMMANDS.md`, `local.ts`), never printed.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step m8.

## Acceptance (`docs/EMAIL_PLAN.md` step m7, section 5.1)

- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, with 100 % line
  coverage kept (`frontend/src` included).
- With `local:up` and `local:api` running, the new block of `login.service.test.ts` alone
  green, and any journey file this step changes. Not `npm run verify`, not the whole walk, not
  the smoke test.
- A look in the browser: an account made by the script; the sign-in with its temporary password
  leads to "Choose your password"; a too-weak password refused with the live checks; a good one
  signs in; signed out, the temporary password refused and the new one accepted; a challenge left
  more than 3 minutes says so and leads back to the sign-in; the screen at 390 × 844.
- `git status` shows changes under `shared/` (only if the rule's code moves), `frontend/`,
  `backend/scripts/` and `backend/package.json` (the script), `docs/`, the `CLAUDE.md` files
  only.
- In `docs/EMAIL_PLAN.md`, an "As done" note under step m7. It says:
  - what Cognito and cognito-local really answered for the challenge and its expiry;
  - each existing test or journey changed, and why;
  - how the screen reuses the change-password screen's rule and checks;
  - the script, and how it was tried;
  - what changed in the `CLAUDE.md` files.

  It ends with what step m8 finds ready. Update the plan's version line too.

Then give the short closing message, and suggest the commit.
