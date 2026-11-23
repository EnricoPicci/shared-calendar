## Before opening the new session (operator)

This step runs the gate and a new journey against the local stack. In the worktree, after
`nvm use`, with Docker running and **no `ANTHROPIC_API_KEY` in the shell** (the journeys refuse
the real Claude):

```
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

No AWS login and no Anthropic key are needed. Nothing goes to the cloud in this step.

## Brief

Implement plan step p2, "Shared: the rule. Front end: `ChangePasswordService`"
(`docs/CHANGE_PASSWORD_PLAN.md`), following CLAUDE.md's working rhythm: one step, its
acceptance check, an honest report, then stop for review.

After this step the browser's services layer can change the signed-in person's own password:
`ChangePasswordService.changePassword(current, next)` checks the new password with the pool's
rule kept in `shared/`, calls Cognito's `ChangePassword` with the access token read from the
`SessionStore`, then `GlobalSignOut`, then clears the store. There is no screen yet (step p3),
nothing changes in `backend/src` or `backend/template.yaml`, and nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (the new line on passwords), "Tooling and style" (100 % line coverage on
  `shared/src` and `frontend/src`), "Changing these files"; then `frontend/CLAUDE.md` and
  `shared/CLAUDE.md`.
- `docs/CHANGE_PASSWORD_PLAN.md`, all of it: the decisions (section 2), the findings (section
  3, F1 and F2 as corrected), **the "As done" note of step p1**, step p2, and steps p3 and p4
  to see what this step must not take from them.
- `docs/ARCHITECTURE.md` **section 6.9** (the design this step builds: what the page checks,
  how each error is read, the sign-out, the 32 symbols), section 5.1 (the policy), the
  residual risks of section 7.3 and the note on changing a password in section 8.
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules, **rule 6 and rule 9**), section 3 (the
  pattern), sections 4 and 9 (`LoginService`, `SessionStore`), section 10 (`cognito.ts`,
  `api.ts`, the unit tests of the building blocks), section 11 (`RefreshService`: the other
  user of `cognito.ts`), section 13 (`UsersService`: how the journeys make throw-away accounts),
  section 14 (placement and journeys), section 8 (the decisions, numbered up to 49) and the
  change log.
- The code: `frontend/src/services/cognito.ts`, `login.service.ts` and `.types.ts`,
  `refresh.service.ts`, `session.store.ts`, `users.service.ts`; their unit tests; the
  integration tests `frontend/tests/integration/local.ts` and `journeys.test.ts`;
  `backend/src/lib/password.ts` and its unit test; `backend/template.yaml`, the user pool's
  `PasswordPolicy` (**read only**); `shared/src/index.ts` and `username.ts` (how a rule of
  `shared/` is written and exported).
- `docs/journeys/README.md` and one page of `docs/journeys/frontend/`; the project skill
  `explain-journey`.

## Where we are (2026-11-22)

- Step p1 is committed (`91289aa`): `docs/ARCHITECTURE.md` v14 describes the change in section
  6.9, designed and not built; the plan is v3; `CLAUDE.md` has the hard rule and 199 lines.
- Nothing of code exists for the change. `cognito.ts` knows only `InitiateAuth`.
- `docs/FRONTEND_SERVICES.md` is v8; its next decision is number 50.

## Decided already (the Product Owner, 2026-11-22)

Apply them; if a document proves one wrong, stop and tell me before going on.

1. **Both roles, one's own password only** (plan D1). The service takes no username: Cognito
   changes the password of the access token's owner.
2. **Sign out everywhere after a change** (plan D2): `GlobalSignOut`, then `store.clear()`.
3. **The rule lives once, in `shared/`** (finding F1), and both the front end and the tests of
   the back end use it. The page never asks Cognito to refuse a new password.
4. **The assistant is not touched** (plan D4).
5. **One success, whatever the sign-out did.** After the change the person reads only
   "Password changed" (the sentence is the screen's, step p3). A sign-out everywhere that
   fails or is skipped is a success like any other: the success carries nothing, and the
   store is cleared in every case. The plan's sentence "a failed sign-out after a successful
   change is a success that says so" is corrected to this.
6. **The service refuses a new password equal to the current one**, as part of
   `new_password_refused` (Cognito accepts it: the pool keeps no password history). The check
   that the two new passwords typed are the same is the screen's: the service receives the
   new password once.
7. **The test that holds the rule to `backend/template.yaml` is a unit test of the back end**,
   which runs in Node and can read the file; `shared/` has no Node types.

## The step

1. **`shared/src/password.ts`**, exported from `shared/src/index.ts`:
   - The pool's policy as a `zod` schema: 12 characters or more and 256 at most; an upper-case
     and a lower-case letter of the basic Latin alphabet (`A`–`Z`, `a`–`z`); a digit; a symbol
     of the 32 of `docs/ARCHITECTURE.md` section 6.9, copied exactly; **no blank character
     anywhere** (`ChangePassword` accepts only `[\S]+`). Other characters are allowed beyond
     the required ones, as Cognito allows them.
   - A function that says which conditions a text misses (a closed list of names, no
     sentences), for the screen's hints in p3.
   - Unit tests in `shared/tests/`: each condition alone, each symbol of the 32, a space and a
     tab, the bounds 11/12 and 256/257, a letter outside basic Latin not counting as a letter.
   - **The rule held to the pool**: a unit test of the back end (decision 7) that reads
     `backend/template.yaml` and compares `MinimumLength` and the four `Require…` flags with
     the rule's numbers.
   - **The generator held to the rule**: a unit test of `backend/src/lib/password.ts` that
     many generated passwords all pass the shared schema. `backend/src` does not change.
2. **`frontend/src/services/cognito.ts`, the request made general**: one function for any
   target of Cognito (`InitiateAuth`, `ChangePassword`, `GlobalSignOut`), with `initiateAuth`
   and the mapping of `LoginService` and `RefreshService` unchanged in behaviour. Their unit
   tests stay green as they are; a test that must change is a finding to report.
3. **`frontend/src/services/change-password.service.ts` and `.types.ts`**, in the pattern of
   `docs/FRONTEND_SERVICES.md` section 3 (a result stream and a state stream, subscribe first,
   then call, the method returns `void`):
   - `changePassword(current, next)`. The access token is read from the `SessionStore` at the
     moment of the call; no session is `not_signed_in`, before any request.
   - Before any request: `next` checked with the shared schema and against `current`, else
     `new_password_refused` (with the list of conditions it misses, "equal to the current one"
     among them; decision 6). Recorded as a decision of `docs/FRONTEND_SERVICES.md`.
   - The reasons, a closed list, as the plan and section 6.9 say: `NotAuthorizedException` and
     `InvalidPasswordException` → `wrong_current_password`; `LimitExceededException` and
     `TooManyRequestsException` → `too_many_attempts`; a rejected fetch → `network`; 5xx or a
     body that is not JSON → `server`; any other type, `PasswordHistoryPolicyViolationException`
     included → `unexpected`.
   - After the change: `GlobalSignOut`, unless the configuration says to skip it (the value
     injected through the constructor, as rule 3 of section 2 asks; the local stack cannot
     sign out, `docs/ARCHITECTURE.md` section 8), then `store.clear()` in every case, and the
     success, which carries nothing (decision 5). Correct the plan's sentence on a failed
     sign-out, and the sentence of `docs/ARCHITECTURE.md` section 6.9 (table, row 3) that
     says the page tells of it.
   - **Rule 6 and rule 9 hold as written**: both passwords live only in the arguments and the
     request body; no token or password in a stream, a state, a message, a log or a field. The
     unit tests assert it (every value emitted serialized and searched for both passwords and
     the token).
   - Unit tests with `fetch` stubbed, 100 % lines: every reason, the order of the two
     requests, the skip, a failed sign-out, the store cleared, nothing sent when the rule
     refuses or no one is signed in, the bodies and headers sent.
4. **A journey** in `frontend/tests/integration` (its own file or a `describe` of its own),
   under a throw-away account created first and removed last, as the other journeys do:
   a wrong current password is refused and the old password still signs in; a new password
   the rule refuses sends nothing; a change succeeds, with the sign-out skipped as locally
   configured, and the store is empty; the old password no longer signs in; the new one does.
   Its page in `docs/journeys/frontend/`, written and checked with the skill
   `explain-journey`, with the pointer comment on the `describe`; the page listed in
   `docs/journeys/README.md`. The local accounts `admin` and `alice` are never used for it.
5. **The documents**, in the same change:
   - `docs/FRONTEND_SERVICES.md` v9: a new section for the service in the shape of sections
     11 to 20 (remote calls, configuration, types, class, mapping, use from the view layer,
     security notes, unit tests, integration checks); section 10.1 for the general request;
     the journey in section 14 with its acceptance; the decisions from 50; the change log.
   - `docs/FOLDER_STRUCTURE.md`, `frontend/CLAUDE.md` and `shared/CLAUDE.md` (their folder
     maps), `docs/COMMANDS.md` if the journey adds to what the integration tests create or
     leave behind.
   - `docs/ARCHITECTURE.md`: the sentence of the v14 change-log line for this step, and only
     what the implementation proved inexact in section 6.9.
   - `docs/CHANGE_PASSWORD_PLAN.md`: the "As done" note under p2, ending with what p3 finds
     ready (in particular how the shell will get the skip value and Cognito's configuration),
     and the version line.

Not in this step: the screen, the shell, `index.html`, `logic/` and `texts.ts` (step p3); the
smoke test, `README.md`, `docs/RUNBOOK.md` (step p4); anything in `backend/src` or
`backend/template.yaml`; the assistant's documents; any `aws` command; the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the emulator answers differently from what `docs/ARCHITECTURE.md` section 8
  says (a wrong current password not `InvalidPasswordException`, a policy that is checked);
  a decision above or a sentence of section 6.9 cannot be made true; an existing test of
  `LoginService` or `RefreshService` must change; two documents disagree (the architecture
  wins over the plan, the plan over this brief).
- Comments follow `.claude/rules/comments.md`: plain words, each reference with the document's
  path in the same sentence, no step or brief number.
- Never run the back end's and the front end's integration tests at the same time. After the
  journey, check that no throw-away account is left in the local pool.
- Commit only when asked. Do not push. Do not start step p3.

## Acceptance (`docs/CHANGE_PASSWORD_PLAN.md` step p2)

- `DYNAMODB_PORT=8002 npm run verify` green at the root, with `local:up` and `local:api`
  running: typecheck, lint, unit tests with 100 % lines on `shared/src` and `frontend/src`.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend`, the new journey with the others,
  green **twice in a row**; no account of the journey left behind.
- The tests that hold the rule to `backend/template.yaml` and the generator to the rule exist
  and pass.
- `git status` shows no change under `backend/src` or in `backend/template.yaml`.
- The documents listed are updated; the "As done" note holds the detail. Then the short
  closing message, and suggest the commit.
