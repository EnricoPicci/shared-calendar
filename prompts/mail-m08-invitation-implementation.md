## Brief

Implement plan step m8, "The invitation, the stages, the release prepared" (`docs/EMAIL_PLAN.md`).
Follow CLAUDE.md's working rhythm: each part, its check, an honest report, then stop for review.

After this step, locally: the Administrator creates a User with the four facts, and the API
answers **no password**. Cognito makes a temporary one and e-mails it, as an invitation. Locally,
cognito-local prints it in its log instead. The User signs in with it, and the page's "Choose your
password" (step m7) asks for their own. The users screen shows each User as `invited` or `active`.
An invited User can be sent the invitation again. Before the stage `on`, the creation and the
resend answer `503 mail_unavailable`, create nothing, and the page says "E-mail is not available
yet". The template gains the stages' resources: at `domain`, the SES identity, the configuration
set and the bounces' topic; at `on`, the pool sending through SES with the invitation's text.
None of this is deployed: that is step m9. Every journey that read the answered password sets one
itself (F1). The smoke test is rewritten. `test-user` gains its target `cloud`. The root
`CLAUDE.md`'s password rule changes, now that the code makes it true.

This is the plan's largest step. It is cut into **three parts, each with its check and a pause for
review** (decision 1 below).

Read these in full first:
- `CLAUDE.md`, in particular:
  - "Working rhythm" (**the closing message is short**);
  - "Hard rules from the design" (**the password rules, which this step rewrites**, and the
    logging rule: no password, no token, no e-mail address in a log);
  - "Cloud safety" (**no `sam deploy`, no `aws` command that changes anything**; `sam validate`
    and `cfn-lint` are fine), "Comments", "Tooling and style";
  - "Changing these files" (**the file is at 199 of its 200 lines**, and this step changes it).

  Then `backend/CLAUDE.md`, `frontend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of
  `.claude/rules/` load when a file of their paths is read.
- `docs/EMAIL_PLAN.md`:
  - sections 1 to 4: **F1, F2, F10, F13, F14 and F15** shape this step; O5 (the resend's success
    is proved only in the cloud). Read row m8 of section 4;
  - section 5.1: **this step runs most journey files**, each alone;
  - **step m8**, the "As done" note of step m7 (what this step finds ready), and steps m9 and
    m10, to see what this step must not take from them.
- `docs/EMAIL_ARCHITECTURE.md`:
  - sections **5.1 to 5.4** (the flow, the page, the resend and a wrong address, the
    Administrator and the test User);
  - 6.5 and **6.6** (the limits, the invitation's text);
  - 8 (the sender, the bounces, the sandbox);
  - **9.1** (the routes, the resend's refusals);
  - **12.2** (the permissions);
  - **13.1 to 13.3** (the parameters, the stages, the smoke test);
  - 14.1 (cognito-local: no resend);
  - **17** (the rows this step merges);
  - 22 (the sources).
- `docs/ARCHITECTURE.md`: sections 1.2, 5.1, 6.3, 7.3, 7.4, 10 and 13, which this step rewrites;
  section 7.1 (the roles); section 8 (the local stack).
- `docs/FRONTEND_SERVICES.md`: `UsersService` (the creation's result), its unit tests and its
  journeys; section 4.9 (the first sign-in).
- `docs/FRONTEND_ARCHITECTURE.md`: the users screen, its dialogs (`dialog.created`), section 5.1's
  rows, the sizes of section 7.1.
- `docs/FRONTEND_WALK.md` section 4 (the Administrator's users screen) and section 15 (the first
  sign-in).
- `docs/RUNBOOK.md` section 6 ("A person's password: what to tell them"); `docs/COMMANDS.md`
  sections 3, 4 and 6 (the smoke test, `test-user`).
- The code:
  - `shared/src/api.ts` (`CreateUserResponse`, the error codes);
  - `backend/src/lib/cognito.ts` (`createUser` with `SUPPRESS`, `setPermanentPassword`),
    `backend/src/lib/password.ts`, `backend/src/handlers/createUser.ts` and the mail routes'
    handling of `MAIL_STAGE`;
  - `backend/template.yaml`: the pool, `MailStage` and its siblings, the condition
    `HasMailReplyTo`, the role of `CreateUserFunction`, the mailer and its schedule, the alarms'
    topic; `backend/samconfig.toml`;
  - `backend/scripts/smoke.sh`, `test-user.sh`, `target.sh`, `cognito.mjs`, `local-seed.sh`
    (`MAIL_STAGE` locally);
  - `backend/tests/integration/setup.ts` (`createUserInNoGroup`, `AdminSetUserPasswordCommand`)
    and every journey file that reads `password` from `POST /users`: `journeys.test.ts`,
    `assistant.test.ts`, `calendar.test.ts` (five places), `mail.test.ts` in the back end;
    `journeys.test.ts`, `calendar.test.ts`, `assistant.test.ts`, `change-password.test.ts`,
    `profiles.test.ts`, `mail.test.ts` in the front end; and `frontend/tests/integration/local.ts`
    (`setTemporaryPassword`);
  - the page: `users.service.ts` and its types, `users.model.ts`, `users.screen.ts`,
    `users.view.ts`, the `dialog.created` of `index.html`;
  - the unit tests of all of these.

## Where we are (2026-11-25)

- Steps m1 to m7 are committed (m7 is `5f3783b`), not pushed. Nothing of the e-mail work is
  deployed.
- `POST /users` creates the account with `MessageAction: SUPPRESS`, sets a generated permanent
  password (`backend/src/lib/password.ts`, `setPermanentPassword`) and answers
  `{ username, password }`. The page shows it once in `dialog.created`.
- The page answers `NEW_PASSWORD_REQUIRED` with "Choose your password" (step m7).
  `setTemporaryPassword()` in `frontend/tests/integration/local.ts` sets a temporary password on
  cognito-local. `test-user` has the target `local` only.
- `MailStage` (default `off`), `MailDomain`, `MailFromLocalPart`, `MailFromName` and
  `MailReplyTo` exist in `backend/template.yaml`, with the mailer, its schedule and the `mail`
  table. `PageAddress` does not exist. Neither do the SES identity, the configuration set, the
  bounces' topic or the pool's `EmailConfiguration`. `env.local.json` sets `MAIL_STAGE` to `on`.
- cognito-local 5.3.0 creates an account without a password and prints a 6-character temporary
  one in its log. It does not support `MessageAction: RESEND`
  (`docs/EMAIL_ARCHITECTURE.md` section 14.1).
- The smoke test reads the answered password for its own User and for the capacity journey's
  `-b` and `-c`. Its change-of-password check takes both passwords from that generator.

## Decided already (the Product Owner)

Everything in `docs/EMAIL_ARCHITECTURE.md` (its decisions, open points and section 22) and in
`docs/EMAIL_PLAN.md` (sections 2 and 3, F1 to F15). Above all:

- **F1.** The journeys set a password through a helper after the creation, and keep their
  stories. In the smoke test, only the invitation's check uses the operator's address. The other
  throw-away Users get `success@simulator.amazonses.com` and a permanent password set through
  `scripts/cognito.mjs`. Confirm in AWS's documentation that the simulator takes Cognito's mail.
- **F2.** At stages `off` and `domain`, `POST /users` and the resend answer
  `503 mail_unavailable` and create nothing.
- **F10.** The invitation's text and `EmailConfiguration` are set only at `on`. The pool's
  `Schema` is not touched.
- **F13.** The page says "E-mail is not available yet" on every `503 mail_unavailable`.
- **F14.** The three texts that say how a password is handed over change here.
- **F15.** `test-user cloud` asks for the operator's own e-mail, and is the one named exception
  to the root rule.
- **O5.** The resend's success is proved only in the cloud.

Apply them. If the code proves one wrong, stop and tell me before going on.

## Decided for this step (the Product Owner, 2026-11-25)

1. **Three parts, each its own commit after review**, as step s6 of the slot plan was:
   - **A, the invitation**: `shared/`, the back end's code (without the template's stages), the
     page, the journeys, their pages. The root `CLAUDE.md` rule changes in A, since A makes it
     true.
   - **B, the stages**: `backend/template.yaml` and `samconfig.toml`, `test-user cloud`. Checked
     by `sam validate --lint` and `npm run build -w backend`, never by a deploy.
   - **C, the smoke test and the documents**: `smoke.sh` rewritten and run once locally;
     `docs/ARCHITECTURE.md` and `docs/RUNBOOK.md` section 6 merged from
     `docs/EMAIL_ARCHITECTURE.md`; the plan's "As done" note.
2. **`backend/src/lib/password.ts` goes**, with `setPermanentPassword`, once nothing in
   `backend/src` uses them. The smoke test's passwords come from a generator of its own in the
   script (node's `crypto`), checked against the pool's rule (`password_problems`).
3. **Locally the resend is refused as in the cloud** (`404`, `409 not_invited`,
   `403 cannot_edit_admin`, `503`). Its success is reached only by unit tests: no local flag
   (O5).
4. **The root `CLAUDE.md` makes room by moving lines, not by shortening rules.** The likeliest
   move is a note of "Everyday commands" into `docs/COMMANDS.md` (F8). The report says what moved
   where.

## The step

As step m8 of the plan lists, with these points made precise.

### Part A — The invitation

1. **`shared/src/api.ts`**: `CreateUserResponse` is `{ username, status: 'invited' }`. The error
   codes `not_invited` and `mail_unavailable` are on the routes that answer them. `UserSummary`'s
   state, `invited` or `active` (F11), if it is not there yet.
2. **`backend/src/lib/cognito.ts`**:
   - `createUser` without `SUPPRESS` and without a password, `DesiredDeliveryMediums: ['EMAIL']`;
   - `resendInvitation` (`MessageAction: 'RESEND'`);
   - the state read from `UserStatus` in `listPlainUsers` (`FORCE_CHANGE_PASSWORD` is `invited`).

   The comments of F14 rewritten.
3. **`createUser.ts`**: no password. The answer above. `503 mail_unavailable` before anything is
   made at a stage other than `on`. The rollback kept. Its role loses `AdminSetUserPassword`.
4. **`resendInvitation.ts`**, `POST /users/{username}/invitation`, admin only: `404`,
   `409 not_invited`, `403 cannot_edit_admin`, `503 mail_unavailable`. Its function and role in
   `template.yaml`: one action, `AdminCreateUser` and `AdminGetUser` on the one pool, as section
   12.2 lists. The route in `env.local.json` through `local-seed.sh`.
5. **The page**: the users screen.
   - The last look before creating: "An invitation will be sent to …", then Confirm.
   - The answer: "An invitation was sent to {email}".
   - `dialog.created` and its password panel removed.
   - The states `invited` and `active` in the list.
   - "Resend invitation" for an invited User.
   - "E-mail is not available yet" on `503 mail_unavailable`, for the creation and the resend.
   - `UsersService` gains the resend (result and state pair). The view tests' counts follow.
6. **The journeys** (F1):
   - every file that read the answered password sets one with a helper right after the creation:
     `AdminSetUserPassword` `Permanent: true` on cognito-local, in `setup.ts` and `local.ts`;
   - each journey keeps its story; a journey whose story would change is a pause;
   - a new journey of the invitation, in the front end's users or login file: created, `invited`
     in the list, a temporary password set by `setTemporaryPassword()`, "Choose your password"
     answered, then `active`; and the resend's refusals (`409` for an active User, `403` for
     `admin`, `404`);
   - their pages under `docs/journeys/`, with the project skill `explain-journey` (refresh for
     each changed page, write for the new one).
7. **The root `CLAUDE.md`**: the hard rule's password part as row m8 of `docs/EMAIL_PLAN.md`
   section 4 says, with F15's exception named. "Every password is set as permanent, no forced
   change" goes. Make room as decision 4 says.

### Part B — The stages

1. **`backend/template.yaml`**:
   - the parameter `PageAddress` (the invitation's link);
   - the conditions `MailDomainStage` (`domain` or `on`) and `MailOn` (`on`);
   - at `domain` and `on`: the SES domain identity with Easy DKIM, the configuration set and its
     event destination, the SNS topic for bounces and complaints subscribed to the Reply-To;
   - at `on` only:
     - the pool's `EmailConfiguration` (`DEVELOPER`, From, Reply-To, the configuration set);
     - `InviteMessageTemplate` with section 6.6's text, `{username}`, `{####}` and the page's
       address;
     - `TemporaryPasswordValidityDays` 7;
   - the mailer and its schedule only at `on`, if they are not conditioned yet;
   - the DKIM records as outputs, at `domain` and `on`;
   - `MAIL_STAGE` to every route that sends.

   Explain each resource in plain words in its comment, as the file does. Never `Schema`.
2. **`backend/samconfig.toml`**: the parameters, `MailStage=off`, no address (the repository is
   public).
3. **`test-user.sh`** gains the target `cloud` (F15): the operator's e-mail asked for, the rest as
   `local`, through `load_target cloud`. Tried with `local` again only: `cloud` is run in step m9.
4. **Checked by** `sam validate --lint`, `npm run build -w backend`, and the template's tests if
   any. AWS's CloudFormation reference read for each new property, and cited in the comments: no
   property guessed.

### Part C — The smoke test and the documents

1. **`backend/scripts/smoke.sh`**, as F1 and `docs/EMAIL_ARCHITECTURE.md` section 13.3 say:
   - its own User and the capacity journey's created through the API at `on`, or straight in
     Cognito at `domain`, with the simulator's address and a permanent password through
     `cognito.mjs`;
   - the invitation to the operator's address (a parameter of the run), its state, its resend,
     the User deleted;
   - a mail on demand for `admin`, and the mailer's log line `sent`;
   - at `domain`, the `503`s.

   Run once locally: `npm run smoke -w backend -- local`.
2. **The documents** of section 4's row m8:
   - `docs/ARCHITECTURE.md`: sections 1.2, 5.1, 6.3, 7.3, 7.4, 10 and 13 rewritten from
     `docs/EMAIL_ARCHITECTURE.md` section 17, with the stages and the parameters; a version row;
   - `docs/RUNBOOK.md` section 6, and a draft of the stages' steps for step m9;
   - the three front-end documents: the users screen's invitation, the states, the resend;
     `docs/FRONTEND_WALK.md`'s users checks;
   - `docs/COMMANDS.md`: `test-user cloud`, the smoke test's new parameter, the journeys' new
     helpers;
   - every changed journey's page;
   - `docs/EMAIL_PLAN.md`: the "As done" note and its version line;
   - the package `CLAUDE.md` files where a line changes.

Not in this step:
- any deploy, any `aws` command that creates, changes or deletes, the change set (step m9);
- the GDPR consent;
- the release v3.0.0 (step m10).

## How we work in this step

- **Messages to me are short.** At the end of each part and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. Questions one at a time, in
  simple words.
- **The pauses**:
  - the end of each part;
  - code proving `docs/EMAIL_ARCHITECTURE.md` or `docs/EMAIL_PLAN.md` wrong, for example Cognito's
    reference saying otherwise about a property, or the simulator not taking Cognito's mail;
  - an existing journey whose story would change;
  - a new dependency.
- **Ask me before you stop or restart the local stack** (`local:up`, `local:down`, `local:api`,
  `local:lambda`): I run them in my own terminals. After `npm run build -w backend` they need a
  restart; tell me, and wait for my go-ahead. Part A adds a route, so `local:up` must run again
  for `env.local.json`.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- No password, token or e-mail address in a log, a state, a result or a test's output. The test
  passwords are test values of the project, never printed. The operator's address is never
  written in a file of the repository.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step m9.

## Acceptance (`docs/EMAIL_PLAN.md` step m8, section 5.1)

- After each part: `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root,
  with 100 % line coverage kept.
- Part A, with `local:up`, `local:api` and `local:lambda` running: each journey file this part
  changes, run alone, file by file, the back end's first, then the front end's. Not
  `npm run verify`, not the whole walk.
- Part A, a look in the browser at the users screen, by the checks it adds to
  `docs/FRONTEND_WALK.md`:
  - the last look and the answer;
  - `invited` in the list, then `active` after the User's first sign-in (the temporary password
    read in cognito-local's log by me, or set by the helper);
  - "Resend invitation" refused locally with its sentence;
  - at 390 × 844.
- Part B: `sam validate --lint` clean and `npm run build -w backend` green.
- Part C: `npm run smoke -w backend -- local` PASS once.
- `git status` shows changes under `shared/`, `backend/`, `frontend/`, `docs/`, `prompts/` and the
  `CLAUDE.md` files only.
- In `docs/EMAIL_PLAN.md`, an "As done" note under step m8. It says:
  - what cognito-local answered to the creation without a password;
  - each journey changed, and how its story was kept;
  - what AWS's references confirmed (the template's properties, the simulator);
  - the smoke test, and how it ran;
  - what moved in the root `CLAUDE.md`.

  It ends with what step m9 finds ready. Update the plan's version line too.

Then give the short closing message, and suggest the commit of each part.
