# Shared Calendar: a person changes their own password (implementation plan)

**Version:** v7 (2026-11-23): step p4's part A done (the smoke test's journey, run against the
local stack, and the operator's documents); its runs in the cloud left. v6: steps p1, p2 and p3
done. v5: steps p1 and p2
merged into `main` (`docs/MERGE_CHANGE_PASSWORD.md`), where the page is deployed and has a
sign-out; steps p3 and p4 amended for both. The design is in `docs/ARCHITECTURE.md` (v14,
section 6.9); the shared rule and `ChangePasswordService` are built (`docs/FRONTEND_SERVICES.md`
v11, section 22), and the screen "Password" (`docs/FRONTEND_ARCHITECTURE.md` v21).
**Governed by:** `docs/ARCHITECTURE.md` (section 7.4, option B), `docs/FRONTEND_SERVICES.md`,
`docs/FRONTEND_ARCHITECTURE.md`. On any conflict those documents win, and this plan is fixed.

---

## 1. What is asked, and the shape of the answer

A person who is signed in changes their own password, knowing the current one. The
Administrator cannot change the password of a User: there is no route for it, and none is added
(option A of `docs/ARCHITECTURE.md` section 7.4 stays unbuilt).

The architecture already names the way: the browser calls Cognito's `ChangePassword` with the
person's access token, the current password and the new one, as it already calls `InitiateAuth`
to sign in. Cognito changes the password of the token's owner and of nobody else, so "only
your own" holds by construction, not by a check of ours.

- **Nothing changes in `backend/src` or in `backend/template.yaml`**: no route, no function, no
  role, no permission. **Nothing is deployed.** The app client already allows the call.
- The work is in `shared/` (the password rule), in `frontend/` (a service, a screen), in the
  smoke test, and in the documents.
- A forgotten password is not solved here: it still means deleting and recreating the account
  (option C of the same section needs e-mail, which the design excludes).

## 2. Decided before the first step

Decided by the Product Owner on 2026-11-22.

| # | Question | Decision |
|---|---|---|
| D1 | May the Administrator change their own password in the page? | **Yes, both roles.** Cognito already accepts the call from any signed-in person, the Administrator included (finding F3). The bootstrap script stays the way back from a lost password. |
| D2 | What happens to the sessions after a change? Cognito leaves every token valid: another device stays signed in for up to 7 days (finding F2). | **Sign out everywhere, then sign in again with the new password.** After the change the service calls Cognito's `GlobalSignOut`, which revokes every refresh token of the person, and clears the store: the login appears. |
| D3 | Where in the page? | **A screen of its own, `#/password`, named "Password", last in the navigation**, with three fields: the current password, the new one, the new one again. |
| D4 | Does the assistant say anything about passwords? Its instructions do not mention them, so a person may type a password into the conversation, which goes to Anthropic. | **Later, not in this plan.** One sentence in the instructions ("you cannot change a password, it is done in the Password page, never type one here") changes the instructions' mark, which ends the open conversations, and wants a run of the paid evaluation. To be proposed as a step of `docs/CONVERSATIONAL_PLAN.md` and decided there; that plan is not changed by this one. |

## 3. What planning found

- **F1. The emulator and Cognito answer a refused change differently.** Read in the code of
  cognito-local 5.3.0: a wrong current password is `InvalidPasswordException`, and the new
  password is not checked against any policy. Real Cognito answers a wrong current password
  with `NotAuthorizedException`, and `InvalidPasswordException` when the new one breaks the
  policy. AWS's API reference lists both errors for `ChangePassword` but does not say which
  case gives which (checked in step p1): the mapping is the common reading of the two names,
  and only the smoke test in p4 proves it. The same name means opposite things. Proposal: the page checks the new password against
  the policy **before** the request, with one rule kept in `shared/`, so that Cognito is never
  asked to refuse it; then both `NotAuthorizedException` and `InvalidPasswordException` are
  read as "the current password is wrong", as `LoginService` already does for a sign-in.
  The price: if the shared rule and the pool's policy ever drift apart, real Cognito's refusal
  of a new password is shown with the wrong sentence. A unit test holds the rule to the
  numbers of `backend/template.yaml`.
- **F2. `ChangePassword` revokes nothing**, and cognito-local does not implement
  `GlobalSignOut` (it has `RevokeToken` only). The call of D2 is therefore
  skipped locally by a value of the injected configuration, as `SKIP_GLOBAL_SIGN_OUT` does for
  `deleteUser`, and only the smoke test proves it. An access token already issued is accepted
  by the authorizer until it expires, 15 minutes at most, plus up to 5 minutes of the
  authorizer's cache (corrected in step p1: AWS says a revoked token still passes a check of
  its signature and expiry, which is all the authorizer does): the same residual risk as after
  a deletion, `docs/ARCHITECTURE.md` section 7.3.
- **F3. `docs/ARCHITECTURE.md` says more than is true today.** Section 6.1 says the bootstrap
  script is the only way to set the Administrator's password. Any person holding their own
  access token and their current password can call `ChangePassword`, with or without this
  feature. What holds, and should be written: the **API** never sets an administrator's
  password, and nobody sets someone else's.
- **F4. Wrong current passwords count towards Cognito's lockout.** After several, Cognito
  answers `LimitExceededException`: the reason `too_many_attempts`, with its sentence.
- **F5. `NotAuthorizedException` is also the answer to a dead access token** (a deleted
  account). The sentence would say "wrong current password"; the next API call signs the
  person out anyway. Accepted, and written in the service's section.

## 4. Steps

One step at a time, its check, an honest report, then a stop for review; commit only when
asked. The gate of every step is the root `DYNAMODB_PORT=8002 npm run verify`, with
`local:up` and `local:api` running. Every step keeps 100 % line coverage and merges what it
built into the governing document in the same change.

### Step p1 — The decisions and the architecture (≈ 2 h, documents only)

- Confirm F1 against AWS's reference for
  `ChangePassword` and `GlobalSignOut` (the errors, and that the access token of
  `USER_PASSWORD_AUTH` is enough).
- `docs/ARCHITECTURE.md`: requirement F4 and the decision row "Password change / reset";
  a new flow in section 6 (the browser, Cognito, no Lambda); the control and threat rows of
  section 7.1 and 7.2 (finding F3; a stolen access token cannot change the password without
  the current one); the residual risk of section 7.3 reworded (a known password can be
  changed, a lost one cannot); section 7.4, option B marked as taken; the emulation note of
  section 8 (finding F1 and F2); the change log.
- `CLAUDE.md`, hard rules: one line, "a password is changed only by its owner, at Cognito;
  the API has no route that changes one".

**Check:** `npm run lint` (the references in the documents), and the review.

**As done (2026-11-22).** Documents only; nothing under `backend/`, `frontend/` or `shared/`
changed, nothing deployed, no `aws` command run.

- *AWS's reference, read through the AWS documentation tools.*
  - `ChangePassword` (API reference, `API_ChangePassword.html`): asks for `AccessToken`,
    `PreviousPassword` and `ProposedPassword`; both passwords at most 256 characters with the
    pattern `[\S]+`, so **no blank character at all**. Authorized by the access token alone,
    which must carry the scope `aws.cognito.signin.user.admin`; Cognito evaluates no IAM
    policy. The access token page of the developer guide
    (`amazon-cognito-user-pools-using-the-access-token.html`) says a token from an API sign-in
    carries exactly that scope: the `USER_PASSWORD_AUTH` token is enough. Success: 200, empty
    body. Errors listed: `NotAuthorizedException`, `InvalidPasswordException`,
    `LimitExceededException`, `TooManyRequestsException`, `PasswordResetRequiredException`,
    `PasswordHistoryPolicyViolationException`, `UserNotFoundException`,
    `UserNotConfirmedException`, `InvalidParameterException`, `ResourceNotFoundException`,
    `ForbiddenException`, `OperationNotEnabledException`, `InternalErrorException`. The
    reference gives each a one-line generic meaning and **does not say which answers a wrong
    current password and which a new password that breaks the policy**: F1's mapping stands as
    the reading of the names, to be proved by the smoke test in p4. Too many attempts: the
    troubleshooting page (`troubleshooting.html`) gives `LimitExceededException`, "Attempt
    limit exceeded, please try after some time", after repeated failed password attempts (F4
    holds). A revoked or dead token: `GlobalSignOut`'s page says Cognito answers "Access Token
    has been revoked" to a revoked access token, without naming the error;
    `NotAuthorizedException` (F5) stays the reading of the name, for the smoke test too. Nothing in the reference says `ChangePassword` revokes a token, and nothing that
    it does not: F2 holds as the plan's reading, again for the smoke test.
    `PasswordHistoryPolicyViolationException` needs a password history in the pool, which
    `backend/template.yaml` does not set: it cannot happen, and p2 reads it as `unexpected`.
  - `GlobalSignOut` (`API_GlobalSignOut.html`, and `token-revocation.html` of the developer
    guide): asks for `AccessToken` only, the same scope; revokes every refresh, id and access
    token of the person, so other devices fail at their next refresh. A revoked access token is
    refused by Cognito's own API but "will still be valid if verified using any JWT library
    that verifies the signature and expiration": our authorizer accepts it until it expires,
    plus its 5-minute cache. **F2 corrected** from "15 minutes at most" to 15 plus 5. The app
    client has `EnableTokenRevocation: true`, which revocation needs.
  - The symbols (`managing-users-passwords.html`): 32 characters, copied in a code block in
    `docs/ARCHITECTURE.md` section 6.9. The guide also allows a space inside a password; since
    `ChangePassword` refuses any blank, the shared rule refuses it (step p2's bullet made exact).
    The generator `backend/src/lib/password.ts` draws its symbols from a subset of the 32.
- *`docs/ARCHITECTURE.md` v14 (open)*: status line and change log; requirement F4 and the row
  of section 1.2; the user pool's row of 2.1; the refresh token's row of 3.1; the new section
  6.9 with its diagram (rendered on a dark page and looked at: all inside the light panel; the
  `autonumber` left out, as its circles clashed with the four numbered notes of the table under
  it), what the page checks, how each error is read, the scope, what the sign-out does not end;
  section 6.1's sentence replaced (finding F3); sections 7.1 ("Account hygiene", "Privilege
  boundary"), 7.2 (the admin takeover, and a new row on a stolen access token), 7.3 (the risk
  reworded, and a new one: 15 plus 5 minutes after a change), 7.4 (retitled, option B taken);
  section 8, the emulator's table row and a new note for F1 and F2. All of it said as designed
  and not built yet, with this plan named.
- *`CLAUDE.md`*: the hard rule "A password is changed only by its owner, at Cognito; the API
  has no route that changes one." To make room, the rule on handlers became one line and lost
  its reason ("this keeps later features cheap"), which `docs/ARCHITECTURE.md` section 7.4
  already gives. 199 lines.
- *Check:* `npm run lint` at the root green; `git status` shows `CLAUDE.md` and `docs/` only.
- **Step p2 finds ready:** the design it builds in `docs/ARCHITECTURE.md` section 6.9 (the
  page's checks, the reading of each error, the sign-out skipped locally, its success when the
  sign-out fails); the exact symbol list and the limits of `ChangePassword` for
  `shared/src/password.ts`; `PasswordHistoryPolicyViolationException` as `unexpected`. Still
  open, for the smoke test of p4: which error real Cognito gives to which refusal, and that
  `ChangePassword` alone revokes nothing.

### Step p2 — Shared: the rule. Front end: `ChangePasswordService` (≈ 6 h)

- `shared/src/password.ts`: the pool's policy as a `zod` schema (12 characters or more, an
  upper-case letter, a lower-case one, a digit, a symbol of Cognito's list of 32 in
  `docs/ARCHITECTURE.md` section 6.9; no blank character anywhere and at most 256 characters,
  the limits of `ChangePassword` itself), and a function
  that says which of the conditions a text misses, for the screen's hints. A unit test of
  `backend/src/lib/password.ts` asserts that every generated password passes it.
- `frontend/src/services/cognito.ts`: the request made general (one function for a target of
  Cognito, used by `InitiateAuth`, `ChangePassword` and `GlobalSignOut`).
- `frontend/src/services/change-password.service.ts` and `.types.ts`, in the pattern of
  `docs/FRONTEND_SERVICES.md` section 3: `changePassword(current, next)`, a result stream and
  a state stream. The access token is read from the `SessionStore` at the moment of the call.
  Reasons: `not_signed_in`, `new_password_refused` (the shared rule, before any request),
  `wrong_current_password`, `too_many_attempts`, `network`, `server`, `unexpected`. The
  success carries nothing. After it (D2): `GlobalSignOut` (skipped by configuration locally), then
  `store.clear()`; a sign-out that fails or is skipped gives the same success, which carries
  nothing, and the store is cleared in every case.
- Rule 6 of `docs/FRONTEND_SERVICES.md` section 2 holds as written: both passwords live in
  the arguments and the request body only. The unit tests assert that no stream, no message
  and no log holds either.
- A journey in `frontend/tests/integration`, under an account of its own, created first and
  removed last: a wrong current password is refused and nothing changes; a change succeeds;
  the old password no longer signs in; the new one does. Its page in
  `docs/journeys/frontend/`, written with the skill `explain-journey`.
- `docs/FRONTEND_SERVICES.md`: a new section for the service, the decisions, the change log.
  `docs/FOLDER_STRUCTURE.md`, `docs/journeys/README.md`.

**Check:** the gate; `RUN_INTEGRATION=1 npm run test:integration -w frontend` with the new
journey green twice in a row.

**As done (2026-11-22).** Nothing changed under `backend/src` or in `backend/template.yaml`;
nothing deployed, no `aws` command run.

- *The rule*, `shared/src/password.ts`, exported from `shared/src/index.ts`: `PASSWORD_POLICY`
  (12 to 256 characters, the four classes required), `PASSWORD_SYMBOLS` (the 32 of
  `docs/ARCHITECTURE.md` section 6.9, copied), `PASSWORD_PROBLEMS` and `passwordProblems(text)`,
  the closed list `too_short`, `too_long`, `no_uppercase`, `no_lowercase`, `no_digit`,
  `no_symbol`, `blank`, and the schema `Password`, one issue per problem with the problem's name
  as its message. A letter is `A`–`Z` or `a`–`z` only; "blank" is JavaScript's `\s`, which also
  holds the Unicode spaces (a no-break space): a little more than `ChangePassword`'s `[\S]+`
  refuses, never less. Its unit tests in `shared/tests/password.test.ts`.
- *Held to the pool and to the generator*: `backend/tests/unit/lib/password.test.ts` reads the
  user pool's `PasswordPolicy` block of `backend/template.yaml` as text (no YAML library; the
  template's tags would need one) and compares its keys and values with `PASSWORD_POLICY`, so a
  key added there, a password history for instance, fails it too; and 2 000 generated passwords
  all pass `passwordProblems` and `Password`.
- *`cognito.ts`*: `cognitoRequest(config, target, body)` for `InitiateAuth`, `ChangePassword` and
  `GlobalSignOut`, with `readCognitoBody` and `readCognitoError`; `initiateAuth` and
  `toAuthOutcome` built on them. No test of `LoginService`, `RefreshService` or `cognito.ts`
  changed; new tests only. One detail is stricter: a Cognito `message` that is not a string is
  replaced by `Cognito answered <status>`.
- *`ChangePasswordService`* (`frontend/src/services/change-password.service.ts`, `.types.ts`), as
  `docs/FRONTEND_SERVICES.md` section 22 describes it; decisions 63 to 68 of its section 8. The
  rule is checked before the session, as `UsersService` checks a username. The store is cleared
  unguarded, since a refresh during the change replaces the session object. A second call
  abandons the first, as in every service; when the first change was already made, its sign-out
  and clear go with it, so the screen must keep its button disabled while `pending` (decision 68).
- *The emulator*, checked by hand with a probe outside the repository that printed statuses and
  error classes only: a wrong current password is `400 InvalidPasswordException`; a new password
  of three letters is accepted (no policy); a change answers `200 {}`; `GlobalSignOut` answers
  `500 CognitoLocal#Unsupported`; a garbage access token is `400 InvalidParameterException`
  (real Cognito: `NotAuthorizedException`, finding F5), which the service reads as `unexpected`.
  `docs/ARCHITECTURE.md` section 8 holds; the last detail matters only locally.
- *The journey*, `frontend/tests/integration/change-password.test.ts`, block `change password`,
  account `fe-password`, page `docs/journeys/frontend/change-password.md` (written with the skill
  `explain-journey`, listed in `docs/journeys/README.md`; the account added to
  `docs/journeys/concepts.md`). `changePasswordConfig()` in `frontend/tests/integration/local.ts`
  is the local configuration, the sign-out skipped.
- *Documents*: `docs/FRONTEND_SERVICES.md` v10 (sections 4.8, 10, 10.1, 10.4, 14.1, 14.9, 14.10,
  22, decisions 63 to 68); `docs/ARCHITECTURE.md` v14 (the sentence of step p2, row 3 of section
  6.9 corrected); `docs/FOLDER_STRUCTURE.md`, `docs/COMMANDS.md` section 4, `frontend/CLAUDE.md`,
  `shared/CLAUDE.md`; the sentence of this step on a failed sign-out corrected.
- *Check*: root `DYNAMODB_PORT=8002 npm run verify` PASSED (back end 1 737 unit tests and 189
  journeys, audit clean; `shared` 489 tests; front end 2 282 tests in 43 files; 100 % lines on
  `backend/src/lib` and `src/assistant`, `shared/src` and `frontend/src`).
  `RUN_INTEGRATION=1 npm run test:integration -w frontend`: 70 tests in 5 files, the 5 of the new
  journey with them, green twice in a row; afterwards the local pool held `admin` and `alice`
  only. `git status`: nothing under `backend/src` or in `backend/template.yaml`. The stack was
  started afresh from this worktree before the runs.
- **Step p3 finds ready:** `ChangePasswordService` with its two streams, the reasons as a closed
  list and `problems` on `new_password_refused`; `passwordProblems` of `shared/` for the hints
  while typing, without the service; the problem names for which the screen writes its
  sentences (`frontend/src/logic/texts.ts`), `same_as_current` among them. **Cognito's
  configuration**: the shell already receives `cognitoUrl` (the `ShellDeps` configuration that
  `frontend/src/main.ts` hands over), which is all the service needs besides the store; no client
  id. **The skip value** is new: the proposal is a fourth constant of the bundle beside `API_URL`,
  `COGNITO_URL` and `CLIENT_ID`, say `SKIP_GLOBAL_SIGN_OUT`, set to `true` by
  `frontend/scripts/dev.mjs` (the local stack) and to `false` by `frontend/scripts/build.mjs`,
  so that a cloud build always signs out; p3 decides it. **The order on success**: the store is cleared before the success is emitted, so the
  shell's `session$` shows the login first; "Password changed" must be shown there, by the login
  view or the shell, not by the password screen, which is gone by then (decision 68).

### Step p3 — Front end: the screen (≈ 6 h)

- `frontend/src/logic/password.screen.ts` (and its model): three fields, current, new and
  new again; what is refused before the call, in words under the field (the conditions the
  new password misses, the two new ones that differ, a new one equal to the current); the
  state of the form from the service's state stream.
- `frontend/src/views/password.view.ts`, its element in `index.html`
  (`autocomplete="current-password"` and `"new-password"`, so that a password manager offers
  to save the change), the sentences in `logic/texts.ts`. The view empties the three fields
  on success, on failure of the current password, and on leaving (rule 9 of
  `docs/FRONTEND_ARCHITECTURE.md` section 3).
- `views/shell.ts`: the screen in the table, for both roles (D1); the service created with
  the person's session and dropped with it, which needs Cognito's configuration beside the
  API's in `ShellDeps`.
- **To decide in this step, before the code:** what the page does after a successful change,
  beside the `LogoutService`. "Sign out" puts the page-wide `LoginService` and `RefreshService`
  back to their first state before it clears the store (`docs/FRONTEND_SERVICES.md` section 8,
  decision 53); `ChangePasswordService` only clears the store. Either the shell calls the same
  `reset()`s on a successful change, or the service takes the page-wide services as the
  `LogoutService` does, or neither is needed: the answer goes into
  `docs/FRONTEND_ARCHITECTURE.md` section 6 and, if the service changes, into
  `docs/FRONTEND_SERVICES.md` section 22.
- Unit tests of the logic, the view, the shell and the page; `docs/FRONTEND_ARCHITECTURE.md`
  (sections 5.1 and 6, the change log); new checks in `docs/FRONTEND_WALK.md`.

**Check:** the gate; the new checks of the walk done by hand in a browser against the local
stack, at the two widths, as `alice` and as `admin`, then the stack restarted so that the
local accounts have their documented passwords again.

**As done (2026-11-23).** Brief `prompts/e05-step-p3-implementation.md`. Nothing under
`backend/` or `shared/src` changed; nothing deployed, no `aws` command run.

- *The three decisions taken before the code* (by the Product Owner, on the recommendations):
  1. **After a change the shell puts the `LoginService` and the `RefreshService` back** to their
     first state, as "Sign out" does; the service takes no page-wide service. What the code
     showed: without it nothing on screen goes wrong (the login view reads only `loginState$`,
     whose last value is the person's own success, which shows no text; a refresh in flight
     cannot write the store back, `replace` being guarded), but the person's name stays in the
     two services' last outcome, which `docs/FRONTEND_SERVICES.md` section 8, decision 53 means
     to prevent. And with the store cleared before the success, nothing of the session could
     hear the success: the person's teardown had ended every subscription first. So **the order
     of decision 68 is reversed**: the service says `success` on both streams, then clears the
     store (`docs/FRONTEND_SERVICES.md` v11, sections 22.4 and 22.6, decision 69). The shell's
     reaction is a subscription of the session to the service's result.
  2. **The skip value is the bundle's fourth constant, `SKIP_GLOBAL_SIGN_OUT`**: `bundleOptions`
     of `frontend/scripts/bundle.mjs` writes `true` only for a configuration holding exactly
     `true`, which only `dev.mjs` gives; `build.mjs`, which `deploy.sh` runs, reads no variable
     for it. `frontend/tests/unit/scripts/bundle.test.ts`, the first test of a script of the
     front end, proves it: `build.mjs` reads its three variables only, a text "true" or 1 does not
     skip, `dev.mjs` gives `true`, and the bundle built in memory with the build's configuration
     hands the shell `skipGlobalSignOut: false`. The shell takes anything but `true` as `false`.
  3. **"Password changed." is shown by the login view**, in its own element `#login .notice`
     (`role="status"`), given by the shell as the optional third argument of `mountLogin` when it
     mounts the login after a change; wiped at the next "Sign in" and when the login is left; no
     timer.
- *The logic*: `frontend/src/logic/password.model.ts` (`newProblems`, `problemTexts`,
  `passwordHints`, `EMPTY_HINTS`, `hintStands`, `failurePlace`) and `password.screen.ts`
  (`PasswordScreen`: `password$`, `start()`, `typed(fields)`, `change(fields)`). The fields are
  arguments only; no state holds a password. The button is out of use while a hint stands and
  while the state is `pending`. An empty form has hints too ("Type the password you use now.",
  the five conditions, "Type the new password once more."), so the button is out of use at the
  start; `same_as_current` is said only once a current password is typed.
- *The sentences* in `logic/texts.ts`: `PASSWORD_PROBLEM_TEXT` (one per name of the shared rule,
  with its numbers and its 32 symbols, and `same_as_current`), `PASSWORD_TEXTS` (the two empty
  fields, the two new passwords that differ, "Password changed."), and `wrong_current_password`
  in `failureText`; the service's other reasons have the sentences the login and the API already
  had.
- *The view*: `frontend/src/views/password.view.ts`, its element `#password` in `index.html`
  (three `type="password"` fields, `autocomplete` `current-password` then `new-password` twice;
  what the new one misses as a list from the template `#tpl-password-need`), `style.css` (the
  form's classes and the login's notice).
- *The shell*: the sixth row of `SCREENS`; `ChangePasswordService` and `PasswordScreen` in
  `sessionObjects`; `mountShell` takes `pageWide`, `runShell` gives `[login, refresh]`;
  `AppConfig` and the shell's configuration gain `skipGlobalSignOut`; `main.ts` reads the fourth
  constant.
- *Tests changed, a finding as the brief asked*: the service's test "ChangePassword, then
  GlobalSignOut, then the one success, then the store cleared" (its name, and two assertions:
  the person still in the store when each stream says `success`); the shell's tests that list
  the links or count them (the link "Password" added); `page.test.ts`: the screens'
  list, the templates' list, the fields (37 to 40), the failure lines (49 to 51), the status
  elements (the login's notice first). No test of another screen, of the login or of the
  sign-out changed otherwise; the login's has two new tests.
- *New tests*: `tests/unit/logic/password.model.test.ts`, `password.screen.test.ts`, the
  password's part of `texts.test.ts`; `tests/unit/views/password.view.test.ts`; the shell's
  block "the password, the last screen of both roles" (the row; both roles; the hints; a change
  by each role with their own token, the page-wide services put back while still signed in,
  "Password changed."; the notice said once; the skip value true and false; a wrong current
  password; a service per person; signing out and leaving the screen leave nothing); the
  login's notice; the page's markup of the screen and of the notice.
- *Documents*: `docs/FRONTEND_ARCHITECTURE.md` v21 (sections 5.1, 6, 9, 12.1; decision 16
  amended, decisions 175 to 183); `docs/FRONTEND_SERVICES.md` v11; `docs/FRONTEND_WALK.md` v4
  (section 9, checks 123 to 133; checks 3 and 40); `docs/ARCHITECTURE.md` (the sentence of step
  p3; section 6.9's title and the "Account hygiene" row no longer say "not built yet");
  `docs/FOLDER_STRUCTURE.md`, `docs/COMMANDS.md` section 5, `frontend/CLAUDE.md`,
  `.claude/rules/frontend-views.md` (the page's counts).
- *Check*: root `DYNAMODB_PORT=8002 npm run verify` PASSED (back end 1 737 unit tests and 189
  journeys, audit clean; `shared` 489 tests; front end 2 581 tests in 51 files; 100 % lines on
  `backend/src/lib` and `src/assistant`, `shared/src` and `frontend/src`).
  `RUN_INTEGRATION=1 npm run test:integration -w frontend`: 77 tests in 6 files, the change of
  password's journey with them. The walk's section 9 (checks 123 to 133) run by a script outside
  the repository in headless Chromium against the dev server and the local stack, at 1280 × 800
  and at 390 × 844, as `alice` and as `admin`: every check yes at both widths. Check 133's
  first wording forgot the 400 of check 128's wrong sign-in and was corrected. The stack was then
  restarted (`local:down`, `local:up`, `local:api`). `git status`: nothing under `backend/` or
  `shared/src`.
- **Step p4 finds ready:** the screen, deployable as it is: a build from `main` signs out
  everywhere after a change (decision 181 of `docs/FRONTEND_ARCHITECTURE.md`), which only the
  deployed page can show, with a second browser signed in as the same person; the walk's
  section 9 to repeat at the deployed page with a throw-away User (its passwords then that
  User's). Still open for the smoke test: which error real Cognito gives to which refusal
  (finding F1), that `ChangePassword` alone revokes nothing and `GlobalSignOut` does (F2).

### Step p4 — The proof against real Cognito, and the hand-over (≈ 3 h; the cloud run needs explicit instruction)

- `backend/scripts/cognito.mjs` gains the change of a password (both passwords on stdin,
  never printed); `backend/scripts/smoke.sh` gains a journey for its throw-away user: a wrong
  current password is refused, the change succeeds, the old password no longer signs in, the
  new one does, and the refresh token from before the change is dead.
- `npm run smoke -w backend -- local`, then, **only when asked in that request**, the smoke
  test against `shared-calendar-api`. It is the one proof of F1 and F2 against real Cognito.
  No deployment comes before it: the stack does not change.
- **Only when asked in that request**, the page released from `main` with the screen
  (`npm run deploy -w frontend`, behind its gate; the back end does not change), then the screen
  walked at the deployed page with a throw-away User: a change, the sign-out everywhere seen on
  a second browser, the new password signing in. It is the one proof of the screen against real
  Cognito.
- `README.md`, `docs/RUNBOOK.md` (what to tell a person who knows their password, and one who
  lost it), `docs/COMMANDS.md`; this plan's "As done" notes.

**Check:** the gate; the local smoke test green; the cloud one green, or reported as not run;
the walk at the deployed page done, or reported as not run.

**As done (2026-11-23), part A.** Brief `prompts/e06-step-p4-implementation.md`. Nothing under
`backend/src`, `frontend/src` or `shared/src` and neither `template.yaml` changed; nothing
deployed, no `aws` command run.

- *The five decisions taken before the code* (by the Product Owner, on the recommendations):
  1. **`cognito.mjs` gains four small actions**, every secret on stdin: `tokens` (the access and
     the refresh token, one per line, split by the shell with parameter expansion), `refresh`
     (prints nothing; exit 0 when Cognito still accepts the token), `change-password` (three
     lines: the access token, the current password, the new one; any other count refused; a
     line break can be neither in a password nor in a token) and `sign-out` (`GlobalSignOut`).
     **`ChangePassword` and `GlobalSignOut` are two calls**, so that the script checks the
     refresh token between them: the proof of both halves of F2. Errors print
     `<name> <message>` with every secret read from stdin blanked out of the message.
  2. **A third kind of line, `SKIP`**, for the two checks of `GlobalSignOut`, only when the
     target is `local`; the local run ends "PASSED (2 check(s) skipped on the local stack)".
     A run against a stack never skips, and a failed sign-out there is a `FAIL`.
  3. **The journey after the assistant's exchange, before the deletion**, with a sign-in of its
     own for both tokens (a `FAIL` line only if it fails); seven checks, 26 lines become 33.
     `user_password` follows the password the user has, so the deletion's check signs in with
     the new one (with the old, a failed sign-in after the deletion would prove nothing). A
     change whose answer is lost is settled by a silent sign-in with the new password. The
     cleanup deletes the user as before; it needs no password.
  4. **The new password and the wrong current one come from `generatePassword`** of
     `backend/src/lib/password.ts`, run in node with its types stripped, each checked against
     `passwordProblems` of `shared/src/password.ts`. The wrong attempt proposes a new password
     that passes the rule, so a refusal can only be about the current password (F1).
  5. **The walk at the deployed page is the operator's, by hand**, from a checklist; Claude
     drives no browser there, since every step shows or types a password. The second browser is
     a second tab (the session lives in the page's memory), signed in first; its scheduled
     refresh, about 14 minutes after its sign-in, must be answered 400 and bring the login.
     Repeated of `docs/FRONTEND_WALK.md` section 9: checks 123, 126, 127 (a `GlobalSignOut`
     answered 200 instead of none), 128, 129 and 133 as the User; 123 only as the
     Administrator, whose password is never changed.
- *The script*: `backend/scripts/smoke.sh` gains `skip`, `new_password` and `password_journey`,
  its header and the closing line; `backend/scripts/target.sh`'s comment on `cognito` follows.
  `shellcheck` clean.
- *The local run*, `npm run smoke -w backend -- local`: 31 PASS and 2 SKIP, 33 lines. A wrong
  current password: `InvalidPasswordException`, as `docs/ARCHITECTURE.md` section 8 says; the
  refresh token from before the change still works after `ChangePassword`; the old password
  refused with `InvalidPasswordException`, the new one signing in; the deletion's check with the
  new password. Probed by hand: `change-password` with two lines is refused without echoing them;
  with a garbage token cognito-local answers `InvalidParameterException`.
- *Documents*: `docs/ARCHITECTURE.md` (section 9.3's new paragraph and count, section 8's note,
  the status line, the row of section 1.2 and the residual risk of section 7.3 no longer "not
  built yet", the v14 row's sentence of step p4); `docs/RUNBOOK.md` (section 2, step 5, 33 lines;
  the new section 2.2, the journey's lines; the counts of sections 3 and 3.2; the new section 6,
  what to tell a person who knows their password and one who lost it); `docs/COMMANDS.md`
  section 6 (`smoke`, `cognito.mjs`); `README.md` (the smoke test's row, the screen "Password",
  the passwords' paragraphs).
- *Check*: `npm run lint` green; the root `DYNAMODB_PORT=8002 npm run verify` PASSED (back end
  1 737 unit tests and 189 journeys; `shared` 489; front end 2 581 in 51 files; 100 % lines on
  `backend/src/lib` and `src/assistant`, `shared/src` and `frontend/src`). `git status`: the three
  scripts under `backend/scripts`, `README.md` and the documents only.
- **Left, each only when asked:** part B, the smoke test against `shared-calendar-api` (the proof
  of F1 and F2) and the log search of `docs/RUNBOOK.md` section 2; part C, the page released and
  walked, the record in `docs/RUNBOOK.md` section 5, v14 closed.

## 5. Risks

- **The rule in `shared/` and the pool's policy drift apart** (F1). Held by the unit test
  against the template and by the smoke test; a change of the policy is a change of both.
- **The local stack cannot show the sign-out everywhere** (F2). Only the smoke test and the
  walk at the deployed page in step p4 do.
- **A walk or a failed journey leaves a local account with another password.** The journey
  uses an account of its own; after a walk, the stack is restarted.

## 6. Out of scope

A forgotten password; an Administrator resetting a User's password; password history or
expiry; MFA.
