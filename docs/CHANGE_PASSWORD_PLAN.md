# Shared Calendar: a person changes their own password (implementation plan)

**Version:** v3 (2026-11-22): step p1 done, the design is in `docs/ARCHITECTURE.md` (v14, section
6.9); findings F1 and F2 checked against AWS's reference and made exact; nothing of code is built.
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
  `store.clear()`; a failed sign-out after a successful change is a success that says so.
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
- Unit tests of the logic, the view, the shell and the page; `docs/FRONTEND_ARCHITECTURE.md`
  (sections 5.1 and 6, the change log); new checks in `docs/FRONTEND_WALK.md`.

**Check:** the gate; the new checks of the walk done by hand in a browser against the local
stack, at the two widths, as `alice` and as `admin`, then the stack restarted so that the
local accounts have their documented passwords again.

### Step p4 — The proof against real Cognito, and the hand-over (≈ 3 h; the cloud run needs explicit instruction)

- `backend/scripts/cognito.mjs` gains the change of a password (both passwords on stdin,
  never printed); `backend/scripts/smoke.sh` gains a journey for its throw-away user: a wrong
  current password is refused, the change succeeds, the old password no longer signs in, the
  new one does, and the refresh token from before the change is dead.
- `npm run smoke -w backend -- local`, then, **only when asked in that request**, the smoke
  test against `shared-calendar-api`. It is the one proof of F1 and F2 against real Cognito.
  No deployment comes before it: the stack does not change.
- `README.md`, `docs/RUNBOOK.md` (what to tell a person who knows their password, and one who
  lost it), `docs/COMMANDS.md`; this plan's "As done" notes.

**Check:** the gate; the local smoke test green; the cloud one green, or reported as not run.

## 5. Risks

- **The rule in `shared/` and the pool's policy drift apart** (F1). Held by the unit test
  against the template and by the smoke test; a change of the policy is a change of both.
- **The local stack cannot show the sign-out everywhere** (F2). Only the smoke test does; the
  walk by hand in the cloud waits for the front end's hosting, which is not designed.
- **A walk or a failed journey leaves a local account with another password.** The journey
  uses an account of its own; after a walk, the stack is restarted.

## 6. Out of scope

A forgotten password; an Administrator resetting a User's password; password history or
expiry; MFA; the hosting of the front end.
