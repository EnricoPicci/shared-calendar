# Shared Calendar: e-mail (implementation plan)

**Version:** v3 (2026-11-25): steps m1 and m2, and steps m3 and m4, built and reviewed as pairs,
one brief, one check and one stop each (the Product Owner's decision); no step's content changes.
v2 (2026-11-25): the deletion of the existing Users moved from a step m0 at the start
to step m9, just before the first cloud deploy; the five proposals F1 to F5 decided as proposed;
a test User for the operator made in step m9 (F15) (the Product Owner's decisions). v1 (2026-11-25): the
plan, for review. No step done.
**Brief:** `prompts/mail-m02-plan-email-implementation.md`.
**Governed by:** `docs/EMAIL_ARCHITECTURE.md` for everything not built yet; `docs/ARCHITECTURE.md`,
`docs/SHARED_CALENDAR_SPEC.md`, `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md`
and `docs/FRONTEND_ARCHITECTURE.md` for what exists, and for each part of e-mail from the step that
merges it into them (section 4). On any conflict those documents win, and this plan is fixed.

---

## 1. What is asked, and the shape of the answer

Build what `docs/EMAIL_ARCHITECTURE.md` designs: the invitation that Cognito sends through SES
with a temporary password changed at the first sign-in (E1), the daily mail to the Administrator
(E2), the calendar on demand for the Administrator (E3) and for a User (E4), from the week page
and from the assistant, and the four facts about every person (E5). Notifications (E6) are not
in this plan.

The shape of the answer, in short:

- **Ten steps, m1 to m10**, numbered as the outline of `docs/EMAIL_ARCHITECTURE.md` section 20
  (step m9 is its step 9). The outline is refined, not replaced: what each step adds to it is
  said in the step. Two things move: the changes to existing contract types go to the step that
  fills them in (F9), and the template's mail resources are written in the step whose code needs
  them, while the stages `off`, `domain` and `on` stay in step m8.
- **The existing Users are deleted in step m9**, by the operator, just before the new API
  reaches the cloud, not at the start as the outline's step 0 has it (decided by the Product
  Owner on 2026-11-25): the people keep their access during the build.
- **Steps m1 to m8 are local.** Nothing reaches the cloud, no `aws` command is run that changes
  anything. Each step, or pair, ends with a short check (section 5) and a stop for review.
- **Steps m9 and m10 are the cloud**, each command on the operator's explicit instruction: the
  stage `domain` (the operator's DNS records, the SNS confirmation, the request for SES
  production access), with the new API **and the new page** deployed together, because
  `POST /users` no longer answers a password (F13); then the stage `on`, when mail works, and the
  release **v3.0.0**.
- **The full regression runs twice**: in step m9 before the first cloud deploy, and at the end of
  step m10 (section 5.2).
- **Two pairs of steps are built together**: m1 with m2 (the four facts, from the contract to the
  screens) and m3 with m4 (the mailer and the route that starts it). A pair has one brief, one
  check (both steps' checks, run once at the end) and one stop for review; each step keeps its own
  section and its own "As done" note. The other steps stay alone: m5's exactly-once logic, m6's
  paid evaluation and m8's change to nearly every journey each deserve a review of their own, and
  m9 and m10 wait for the operator and for AWS.

The step briefs continue the numbering of `prompts/`: `prompts/mail-m03-…` for the pair m1 and
m2, `prompts/mail-m04-…` for the pair m3 and m4, then one per step.

## 2. Decided before the first step

Every decision of `docs/EMAIL_ARCHITECTURE.md` sections 2.2 (M1 to M10), 2.3 (M11 to M17) and 21
(O1 to O7) is settled with the Product Owner and is not reopened here. The ones that shape the
plan most:

| Decision | What it means for the plan |
|---|---|
| M2, M11: Cognito makes, sends and forces the change of the temporary password | No code of ours generates or sends a password; the forced change needs no change to the authorizer or the routes, only the page's answer to the challenge (step m7) |
| M10: an on-demand mail goes only to the asker's own address | The mailer's event never carries an address (step m3) |
| M14, M15: an hourly timer, a table `mail` of its own | The calendar's table, lock and contract are untouched by every step |
| O5: the resend is proved only in the cloud | Locally the resend route is proved by its unit tests and its refusals; its success only by the smoke test of step m10 |
| O6: `iam:CreateServiceLinkedRole` checked before step 10 | A read-only check in step m9 |
| O7: our own fake mail | A fifth service of the local Docker stack (step m3) |
| Section 4.3: the existing Users deleted, moved from the start to just before the first cloud deploy (2026-11-25) | Step m9; step m1 writes the move into sections 4.3, 20 and 21 of `docs/EMAIL_ARCHITECTURE.md` |
| Section 9.1: v3.0.0 | Step m10 |

## 3. What planning found

Read for this plan: `docs/EMAIL_ARCHITECTURE.md` whole; the code of `backend/src/handlers/createUser.ts`,
`backend/src/lib/cognito.ts`, `backend/src/lib/logger.ts`, `backend/template.yaml` (the pool, the
roles of `createUser`, `confirmProposal`, `sendAssistantMessage` and `continueAssistant`, the
alarms), `backend/scripts/` (`local-seed.sh`, `smoke.sh`), `backend/docker-compose.yml`,
`backend/src/assistant/tools/` (`cancelAppointment.ts`, `listUsers.ts`), the integration tests of
both packages, `scripts/deploy-gate.sh`; AWS's CloudFormation reference for the user pool (read on
2026-11-25); the source of the installed SAM CLI 1.172.1.

Where a finding shows `docs/EMAIL_ARCHITECTURE.md` wrong or incomplete, it ends with the change to
that document, **decided** by the Product Owner on 2026-11-25 as proposed (F1 to F5, F15). Step
m1 writes them into it, before any code depends on them.

- **F1. Every journey and the smoke test read the password that `POST /users` answers.** The back
  end's journeys (`backend/tests/integration/journeys.test.ts`, the helper of `assistant.test.ts`,
  five places in `calendar.test.ts`), the front end's journeys (`journeys.test.ts`,
  `calendar.test.ts`, `assistant.test.ts`, `change-password.test.ts` under
  `frontend/tests/integration/`) and `backend/scripts/smoke.sh` (its user `smoke-<epoch>` and the
  capacity journey's `-b` and `-c`) create a User through the API and sign in with the answered
  password. From step m8 there is none. In the journeys, a helper sets a password after the
  creation (`AdminSetUserPassword` on cognito-local, as `createUserInNoGroup` in
  `backend/tests/integration/setup.ts` already does), so each journey keeps its story; their
  pages under `docs/journeys/` change with them. The smoke test cannot: section 13.3 of the
  architecture creates one throw-away User with the operator's address, and says nothing of the
  three Users its journeys sign in with. **Decided** (section 13.3): only the invitation's
  check uses the operator's address (one real mail per run); the other throw-away Users get SES's
  mailbox simulator address `success@simulator.amazonses.com` (delivered, never a real mailbox,
  never a bounce), and the script sets their permanent password through `scripts/cognito.mjs`,
  with the operator's own credentials, password on stdin, as `bootstrap-admin.sh` does for the
  Administrator. That the simulator accepts mail sent by Cognito, and in the sandbox, is confirmed
  in AWS's documentation in step m8.
- **F2. What `POST /users` does before the stage `on` is not said.** Section 13.2 says the code can
  ship at stage `off` and that profiles work, but from step m8 the route answers no password, and
  Cognito can send the invitation through our SES only at stage `on`; without our SES it would
  send through its own default service, from `no-reply@verificationemail.com`, with its default
  text. **Decided** (sections 6.5, 9.1 and 13.2): at stages `off` and `domain`, `POST /users`
  and `POST /users/{username}/invitation` answer `503 mail_unavailable`, like the mail routes,
  and create nothing. Nobody is created between step m9 and step m10, so nothing is lost; the
  smoke test at stage `domain` creates its throw-away Users straight in Cognito (F1's script, with
  the four facts and the group), and checks the `503`.
- **F3. How a route starts the mailer locally is not said.** Section 14.2 has the daily run started
  by a script, but `POST /mail/calendar` and the confirmed proposal call Lambda's asynchronous
  invoke, and `sam local start-api` offers no Lambda endpoint. The installed SAM CLI 1.172.1 has
  `sam local start-lambda`, whose source runs an `Event` invocation in the background and answers
  at once (`samcli/local/lambda_service/local_lambda_http_service.py`). **Decided** (section
  14.2): a third local process, `npm run local:lambda -w backend`, in the foreground like
  `local:api`, serving the functions' invoke on `127.0.0.1:3001`; the routes' Lambda client takes
  its endpoint from `LAMBDA_ENDPOINT` (empty in the cloud, `http://host.docker.internal:3001` in
  `env.local.json`), as Cognito's and DynamoDB's do; `verify` checks it is running, as it checks
  `local:api`. The journeys start the daily run through the same endpoint, with the event's `now`,
  which the mailer honours only when `MAIL_ALLOW_NOW` is `true`, set by `env.local.json` alone (the
  pattern of `SKIP_GLOBAL_SIGN_OUT`). To try in step m3: the Lambda container reaching the host's
  port 3001, on macOS and in a Codespace.
- **F4. The timer's role is missing.** EventBridge Scheduler calls the mailer with a role of its
  own, which section 12.2 does not list. **Decided** (section 12.2): a role for the schedule,
  assumable by `scheduler.amazonaws.com` only, allowed `lambda:InvokeFunction` on the mailer
  alone, written out in `template.yaml` as every role is.
- **F5. The assistant's proposal needs the person's address, before Confirm.** The proposal reads
  "… to a•••@example.com?" (section 7), and a person without an address should be told at the
  proposal, not after the button. A proposal is made by `sendAssistantMessage` and
  `continueAssistant`, whose roles hold only `cognito-idp:ListUsersInGroup` today; section 12.2
  gives the new permissions to `confirmProposal` only. **Decided** (sections 7 and 12.2): the
  tool's `confirmation.read` gets the person's facts through the handler of `GET /me` (as the
  cancel tool reads through the list's handler), and those two roles gain
  `cognito-idp:AdminGetUser` on the pool. And: a new tool changes the mark of the instructions,
  which ends the conversations in progress at the deploy, and the paid evaluation
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3) is run again with requests for a mail, its
  cost said before it runs, as in `docs/CAPACITY_PLAN.md` step u6. Section 7 should say both.
- **F6. The facts never reach Claude.** The tool `list_users` gives Claude the usernames only
  (`backend/src/assistant/tools/listUsers.ts`, its `toModel`), so the names, e-mails and addresses
  that `GET /users` will answer are not sent to Anthropic. Step m2 keeps it so, with a test; the
  greeting by first name stays out (O4).
- **F7. The logger redacts by field name** (`backend/src/lib/logger.ts`: `password`,
  `authorization`, `token`). The new logging rule (section 12.4) is kept by the code that writes
  the lines; as a safety net, step m2 adds `email`, `address`, `givenname` and `familyname` to
  the names it blanks, after checking that no existing log field contains them.
- **F8. The root `CLAUDE.md` is at 199 of its 200 lines.** The hard rule's new text, the longer
  logging rule, the fake mail in the local stack, the command `local:lambda` and the e-mail
  documents in "Where the truth lives" each add lines. Each step that changes it makes room in the
  same change, as "Changing these files" asks (the likeliest: the notes of the everyday commands
  move to `docs/COMMANDS.md`), and says in its report what moved where.
- **F9. Changes to existing contract types move to the step that fills them in.** Made required in
  `shared/` first, `UserSummary`'s new fields or `CreateUserBody`'s four facts would break the
  typecheck or the tests of the back end and the page until they follow (the lesson of
  `docs/CAPACITY_PLAN.md` steps u2 and u3). So step m1 adds only new types; `CreateUserBody` and
  `UserSummary` change in step m2, `CreateUserResponse` in step m8.
- **F10. The user pool, from AWS's CloudFormation reference** (read 2026-11-25):
  `EmailConfiguration` is "Update requires: No interruption", so pointing the pool at SES is an
  update, not a replacement; `InviteMessageTemplate`'s `EmailMessage` and `EmailSubject` are
  allowed only with `EmailSendingAccount: DEVELOPER`, so the invitation's text is set only at
  stage `on`, with the `EmailConfiguration`; the template must hold `{####}`, the temporary
  password. The pool's `Schema` is not touched (a schema change can replace a pool). Still to
  confirm: the `{username}` placeholder and the template's size limit (step m1), and the whole
  update by a change set read before the first deploy (step m9).
- **F11. `GET /users` gets the state for free.** `ListUsersInGroup` answers each member's
  `UserStatus` and attributes: `FORCE_CHANGE_PASSWORD` is `invited`, any other state `active`.
  No call per User.
- **F12. The deploy gate's stamp lasts 30 minutes and names the commit** (`scripts/deploy-gate.sh`),
  so step m10's deploys need their own `verify`, whatever ran in step m9 (section 5.2).
- **F13. The page goes with the API in step m9.** **Decided** (the Product Owner, 2026-11-25): the
  v2.3 page treats the challenge `NEW_PASSWORD_REQUIRED` as a failed sign-in, so with it the
  operator's test User (F15) could not sign in during the days between steps m9 and m10. Both are
  deployed in step m9, at stage `domain`. The new page must therefore say `503 mail_unavailable`
  plainly wherever mail is reached ("E-mail is not available yet"): the creation of a User, the
  resend, the week's "E-mail…" and the settings' "Daily e-mail" (steps m4, m5 and m8). The tag
  v3.0.0 still waits for step m10, when the stacks run mail as designed.
- **F14. Three texts of the documents say how a password is handed over today**, besides those
  listed by section 17: `docs/RUNBOOK.md` section 6 ("A person's password: what to tell them"),
  the comments of `createUser.ts` and `cognito.ts` (`SUPPRESS`, "no e-mail in v1"), and the
  comment of the pool's `email` attribute in `backend/template.yaml`. They change in step m8.
- **F15. A test User for the operator** (asked by the Product Owner in review, 2026-11-25). Between
  the deploys of steps m9 and m10 no User can be created through the page (F2), so the User's side
  of the app could not be tried. **Decided** (section 5.4 of `docs/EMAIL_ARCHITECTURE.md` gains a
  paragraph): a command, `npm run test-user -w backend -- <local|cloud> <username>`, creates one
  User straight in Cognito, in group `user`, with the four facts (the e-mail is the operator's
  own, prompted) and a **temporary** password the operator types (prompted, sent on stdin through
  `scripts/cognito.mjs`, never saved). At the first sign-in the page asks for a new password, so
  the screen of step m7 is tried as a real User sees it. The User stays until the operator deletes
  it in the Users page. It is the one deliberate exception to "Cognito makes and e-mails the first
  password", made by the operator's own command while mail is not on; the root `CLAUDE.md`'s hard
  rule (step m7) names it. Not the smoke test: that one removes everything it makes, so that a run
  leaves nothing behind.

## 4. When each governing document changes

`docs/EMAIL_ARCHITECTURE.md` governs what is not built yet. Every step merges what it built into
the document that governs it from then on, in the same change, as `docs/CONVERSATIONAL_PLAN.md`
did for the assistant; in step m10 `docs/EMAIL_ARCHITECTURE.md` becomes a record, like the
proposals before it. **A rule of the root `CLAUDE.md` changes in the step of the first code that
breaks it**, not later.

| Step | Documents |
|---|---|
| m1 | `docs/EMAIL_ARCHITECTURE.md`: the accepted proposals of section 3, the deletion of the Users moved to step 9 (sections 4.3, 20, 21), its status line ("being built, `docs/EMAIL_PLAN.md`"), the facts confirmed (section 22). `docs/ARCHITECTURE.md`: the status line and a v16 row, open ("e-mail being built"). Root `CLAUDE.md`, "Where the truth lives": `docs/EMAIL_ARCHITECTURE.md` with the plan, as `docs/CONVERSATIONAL_ARCHITECTURE.md` is listed. `shared/CLAUDE.md`: its folder map |
| m2 | **Root `CLAUDE.md`: the logging rule** gains "an e-mail address, a name, a postal address, a mail's text or attachment" (the first code that holds them). `docs/ARCHITECTURE.md` sections 4 (the users' routes, `GET /me`) and 5.1 (the attributes); `docs/SHARED_CALENDAR_SPEC.md` route 21 of section 11.1 and section 10.1 (`GET /users`'s answer); `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md` (the users screen, "My details"); `docs/FRONTEND_WALK.md` (their checks); `backend/CLAUDE.md` (`cognito.ts`) |
| m3 | **Root `CLAUDE.md`: the hard rule's "no e-mail sending"** becomes "The system sends e-mail only through SES: Cognito's invitations and the mailer" (the mailer is the first code that sends, if only to the fake), the local stack gains the fake mail, the everyday commands `local:lambda`. `docs/ARCHITECTURE.md` (the mailer, the table `mail`, the local stack of section 8); `docs/COMMANDS.md` (the fake mail, `local:lambda`, the mailer run by hand); `backend/CLAUDE.md` (`mailDb.ts`, `excel.ts`, `ses.ts`, the fake) |
| m4 | `docs/ARCHITECTURE.md` (`POST /mail/calendar`, its limits); `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/FRONTEND_WALK.md` (the week's dialog) |
| m5 | `docs/ARCHITECTURE.md` (the settings routes, the daily run, the timer, the alarm); the three front-end documents (the settings section) |
| m6 | **Root `CLAUDE.md`: "changes the calendar, or sends a mail, only through `confirmProposal`"**. `docs/CONVERSATIONAL_ARCHITECTURE.md` (the tool, its proposal, the evaluation's requests, a version row); `docs/FRONTEND_WALK.md` if the panel's check gains a mail proposal |
| m7 | **Root `CLAUDE.md`: the hard rule's password part** becomes "A User's first password is temporary: Cognito makes it, e-mails it and forces its change at the first sign-in; the API never sees it or answers it. The Administrator's password is set once as permanent by the bootstrap" (the page's answer to the challenge is the first code that handles a forced change). `docs/FRONTEND_SERVICES.md` (the sign-in's challenge), `docs/FRONTEND_ARCHITECTURE.md` and `docs/FRONTEND_WALK.md` (the screen "Choose your password") |
| m8 | `docs/ARCHITECTURE.md` sections 1.2, 5.1, 6.3, 7.3, 7.4, 10 and 13 rewritten from `docs/EMAIL_ARCHITECTURE.md` (its section 17), with the stages and parameters; `docs/RUNBOOK.md` section 6 and a draft of the stages' steps; the three front-end documents (the users screen's invitation); every changed journey's page |
| m9 | `docs/RUNBOOK.md`: the stage `domain`, the DNS records, the production access, the suppression list; section 5.9, the deployment record, opened |
| m10 | `docs/EMAIL_ARCHITECTURE.md` a record (status line); `docs/ARCHITECTURE.md` v16 closed; `docs/SHARED_CALENDAR_SPEC.md` section 15's sentence on the address confirmed; `docs/CONVERSATIONAL_ARCHITECTURE.md` status line (deployed); `docs/RUNBOOK.md` section 5.9 closed; `README.md` "Versions": v3.0.0; root `CLAUDE.md`: `docs/EMAIL_PLAN.md` among the records of finished work |

## 5. The acceptance check

### 5.1 A step's check, short

Unlike the earlier plans, a step does not rerun the whole regression (root `CLAUDE.md`, "Working
rhythm"). Each step's check is only:

1. `npm run typecheck`, `npm run lint` and `npm run test:unit`: fast, no Docker; they keep the
   100 % line coverage on `backend/src/lib`, `backend/src/assistant`, `shared/src` and
   `frontend/src`.
2. The integration journeys the step adds or changes, run alone (one test file, or one `describe`
   block with `-t`), with `local:up`, `local:api` and, from step m3, `local:lambda` running; their
   pages under `docs/journeys/` written or checked with the project skill `explain-journey`.
   Never the back end's and the front end's at the same time. After `npm run build -w backend`,
   `local:api` and `local:lambda` are restarted.
3. For a step that changes a screen: a look at that screen only, in a browser, by the checks the
   step adds to `docs/FRONTEND_WALK.md`; not the whole walk.

Steps m2 and m8 change how a User is created, which nearly every journey file does: their check
therefore runs most journey files (said in each), still without the walk and the smoke test.

### 5.2 The full regression, where it cannot be skipped

**The full regression** is: the root `DYNAMODB_PORT=8002 npm run verify` (the back end's gate
with every journey of the back end, then the front end's `verify`),
`RUN_INTEGRATION=1 npm run test:integration -w frontend` (every journey of the front end), the
whole of `docs/FRONTEND_WALK.md` on a restarted and seeded local stack, and
`npm run smoke -w backend -- local`.

- **Step m9, before the first cloud deploy.** The deploy gate requires `verify` on the commit
  that ships, and must not be bypassed; the rest of the regression runs there too, since it is
  the last look at the whole system before the cloud.
- **Step m10, at the end.** The gate's `verify` before each deploy (F12: a mechanical
  requirement, minutes long), the smoke test in the cloud, and the operator's look at the
  deployed page with real mails. The whole local walk is not repeated unless a screen changed
  after step m9 (the page is deployed in step m9, F13); if one did, it runs again in full before
  the page's second deploy.

## 6. Steps

One step at a time, or one pair (section 1), its check, an honest report, then a stop for review;
commit only when asked.
**When a step proves `docs/EMAIL_ARCHITECTURE.md` wrong, it stops and proposes the change to
that document**; the code does not silently diverge from it. A step marked **Operator** needs a
person to act in the cloud, at the DNS provider or in a mailbox: what they do is said in plain
words.

### Step m1 — The contract, and the facts to confirm (built with step m2)

Builds, in `shared/` only:

- `shared/src/users.ts` (or the file `docs/FOLDER_STRUCTURE.md` names): `UserProfile`, the four
  facts with the rules of `docs/EMAIL_ARCHITECTURE.md` section 4.1 (trimmed names 1–100, e-mail
  syntax at most 254 and lower-cased, address 1–300 multi-line); `UpdateUserBody`; `MeResponse`;
  the user's `status` (`invited`, `active`).
- `shared/src/mail/`: `MailSettings` and its body (`dailyEnabled`, `dailyHour` 0–23, defaults
  `true` and 7); `MailCalendarBody` (`from`, `to`, local dates, `from` ≤ `to`, at most 366 days);
  the limits (5 a day, 366 days) as constants; the texts of section 6.6 as pure functions
  (subject, plain text, HTML) for the kinds `daily`, `calendar` and `mine`, with the footer;
  `maskAddress` ("a•••@example.com"), shared by the page and the assistant.
- `shared/src/api.ts`: the codes `cannot_edit_admin`, `not_invited`, `no_email_address`,
  `mail_limit_reached`, `mail_unavailable`, each with its status in a comment.

Not here: `CreateUserBody`, `UserSummary` and `CreateUserResponse` keep their shape (F9). No
back end, no page.

Confirms, and writes into `docs/EMAIL_ARCHITECTURE.md` section 22 with the date:

- **The Excel library**: `exceljs` or `write-excel-file`, chosen on licence, upkeep (last release,
  open issues) and the size it adds to a bundle, measured by building a throw-away entry with
  esbuild in a scratch folder (never in the repository), with a file written and read back. The
  choice is asked of the Product Owner as soon as it is measured, without stopping the work on
  step m2; installing it waits for step m3.
- **SES's prices**: the pricing page read again (section 15 holds or is corrected).
- **Cognito's invitation**: the placeholders (`{username}`, `{####}`) and the size limits of
  `EmailMessage` and `EmailSubject`, in AWS's documentation.
- **The pool's update**: F10 recorded; the change set itself waits for step m9.

Documents: section 4's row m1; the proposals of section 3 accepted by the Product Owner written
into `docs/EMAIL_ARCHITECTURE.md`.

**Check**, run with step m2's at the end of the pair: typecheck, lint, test:unit (the schemas:
each fact's bounds, the e-mail lower-cased, the 366 days, an unknown field refused; the texts;
`maskAddress`). No journey, no screen of its own.

### Step m2 — Profiles: the four facts, edited by the Administrator, read by everyone (built with step m1)

Builds:

- `shared/`: `CreateUserBody` gains the four facts, required; `UserSummary` gains them and
  `status`.
- `backend/src/lib/cognito.ts`: `createUser` takes the facts (still `SUPPRESS`, still the
  permanent password, so the page keeps working); `updateProfile` (`AdminUpdateUserAttributes`,
  `email_verified` `true`); `getProfile` (`AdminGetUser`: the facts and the state);
  `listPlainUsers` with the facts and the state from the same call (F11).
- Handlers: `createUser.ts` (the four facts), new `updateUser.ts` (`PUT /users/{username}`, admin;
  `404 user_not_found`, `403 cannot_edit_admin` for another administrator, its own allowed: M12),
  new `getMe.ts` (`GET /me`, both roles). Each logs the target's username and which facts changed,
  never their values.
- `backend/src/lib/logger.ts`: the names blanked (F7).
- `backend/template.yaml`: the two functions, each with its role (`AdminUpdateUserAttributes`,
  `AdminGetUser`, `AdminListGroupsForUser` as each needs, on the one pool).
- `backend/scripts/local-seed.sh`: `admin` and `alice` with the four facts (addresses at
  `example.com`); `backend/scripts/bootstrap-admin.sh` asks the Administrator's four facts,
  prompted, sent through `scripts/cognito.mjs` on stdin, never an argument or a file.
- The assistant: `list_users` still gives Claude the usernames only, with a test (F6).
- The page: the users service (`createUser` with the facts, `updateUser`), a `me` service; the
  users screen's form gains the four fields and the list the names and the e-mail; an "Edit"
  dialog with the four facts (`docs/FRONTEND_ARCHITECTURE.md` section 4, a dialog and a form);
  "My details", a small read-only screen reached from the shell, with "Edit" for the
  Administrator.

Not here: the state's column, the invitation, the resend (step m8).

Journeys: in `backend/tests/integration/journeys.test.ts`, a new block for the profiles (create
with the facts, read them in `GET /users` and `GET /me`, edit, `cannot_edit_admin` with a second
administrator made by a helper); in the front end's, the users and "My details" services. Every
journey that creates a User sends the four facts, through one helper per package. **So this step
runs most journey files**, each alone, and their pages under `docs/journeys/` follow.

Documents: section 4's row m2, with the root `CLAUDE.md`'s logging rule.

**Check**, the pair's: step m1's and this one, once: section 5.1; the screens: Users (create,
edit) and "My details", by their new checks.

### Step m3 — The table `mail`, the fake mail, the mailer run by hand (built with step m4)

Builds:

- `backend/src/lib/mailDb.ts`: the only module that knows the table `mail`
  (`docs/EMAIL_ARCHITECTURE.md` section 10.1): the settings, the daily mark, the counter.
- `backend/src/lib/excel.ts`: the only file that imports the Excel library (a lint rule, like
  `anthropic.ts`'s); one sheet, the columns of section 6.3.
- `backend/src/lib/ses.ts`: SES v2 `SendEmail` with attachments (`Content.Simple.Attachments`),
  From, Reply-To and the configuration set from the environment, endpoint `SES_ENDPOINT`.
- `backend/src/lib/lambdaInvoke.ts`: the asynchronous invoke, endpoint `LAMBDA_ENDPOINT` (F3).
- `backend/src/handlers/mailer.ts`: the kinds `calendar` and `mine` (section 6.1): the event
  checked (kind, `sub`, username, role, range, request id; never an address); the address and the
  names read in Cognito; the appointments through `calendarDb.listAppointments`; the file; the
  mail; one log line (section 16), no address and no content.
- `backend/template.yaml`: the table `mail` (2/2, deletion protection, TTL on `expiresAt`), the
  mailer function (its timeout and memory from what step m1 measured) with its role
  (`ses:SendEmail` on the identity and configuration set named from `MailDomain`, the calendar's
  read policy, the table `mail`, `ListUsersInGroup` and `AdminGetUser`), and the parameters it
  needs; the SES resources themselves wait for step m8.
- The local stack: `fake-mail` in `backend/docker-compose.yml` and `backend/docker/fake-mail.mjs`
  (answers `SendEmail`, keeps each mail in memory, a page at `http://localhost:8025` and JSON for
  the journeys, read-only mounts as the fake Claude); the table `mail` in `local-seed.sh`;
  `env.local.json` with `SES_ENDPOINT`, `LAMBDA_ENDPOINT`, `MAIL_ALLOW_NOW`; the npm scripts
  `local:lambda` and a "mail by hand" script (`npm run mail:send -w backend -- <kind> <username>
  <from> <to>`); `verify.sh` checks `local:lambda` is up.

Tried first, reported: `local:lambda` reached from the Lambda containers (F3).

Journeys: a new file `backend/tests/integration/mail.test.ts`: the mailer started through
`local:lambda` for `admin` (`calendar`) and `alice` (`mine`), each mail read back from the fake:
the recipient is the account's own address, the Excel file opened and its rows compared with the
appointments made for it, a User's file holds only theirs. Its page under `docs/journeys/backend/`.

Documents: section 4's row m3, with the root `CLAUDE.md`'s hard rule on e-mail.

**Check**, run with step m4's at the end of the pair: section 5.1 (the new file alone). No screen
of its own.

### Step m4 — `POST /mail/calendar`, and the week page's button (built with step m3)

Builds:

- `backend/src/handlers/sendCalendarMail.ts` (`POST /mail/calendar`, both roles): the stage
  (`503 mail_unavailable` unless `MAIL_STAGE` is `on`; locally `on`), the body, the address
  (`409 no_email_address`, before counting), the counter under a condition in `mailDb`
  (`429 mail_limit_reached` past 5), the invoke, `202 { status: "queued" }`. The role decides the
  kind, never the body. Its function and role (`lambda:InvokeFunction` on the mailer,
  `AdminGetUser`, the table `mail`).
- The page: a mail service; on the week page (both roles) "E-mail…", a dialog with two dates
  (the week shown by default) and Send; the answer "On its way to a•••@example.com" or the
  reason, each code with its sentence in `frontend/src/logic/texts.ts`, `mail_unavailable`
  included ("E-mail is not available yet", F13).

Journeys: in `mail.test.ts`, the route for both roles read back from the fake; the sixth request
of the day refused; a range of 367 days refused; `no_email_address` for an account without one
(made by a helper). The front end: the mail service against the local stack.

**Check**, the pair's: step m3's and this one, once: section 5.1 (`mail.test.ts` and the front
end's mail service, each alone); the screen: the week's "E-mail…" dialog, for each role.

### Step m5 — The daily mail

Builds:

- `getMailSettings.ts` and `updateMailSettings.ts` (`GET`/`PUT /mail/settings`, admin), their
  functions and roles.
- The mailer's kind `daily` (section 6.2): the settings, the hour in `CalendarTimeZone`, the mark
  written only if absent, the states `sending`, `sent`, `failed`, a retry only from `failed` or a
  `sending` older than 10 minutes; every administrator with an address; the two files and their
  ranges (section 6.3); an administrator without an address skipped with a log line.
- `backend/template.yaml`: the hourly schedule (`AWS::Scheduler::Schedule`, minute 0) with its
  role (F4); the mailer's error alarm to the alarm topic.
- A script to start the daily run by hand locally (`npm run mail:daily -w backend`).
- The page: the settings service gains the mail settings; the settings screen a section "Daily
  e-mail" (on/off, the hour), which says "not available yet" on `503 mail_unavailable` (F13).

Journeys: in `mail.test.ts`, with the event's `now`: the run at the chosen hour sends one mail
with two files; the same hour twice sends once; the wrong hour, or switched off, sends none; a
`failed` mark is retried. The front end: the settings service.

**Check:** section 5.1; the screen: the settings' "Daily e-mail".

### Step m6 — The assistant's tool `send_calendar_mail`

Builds:

- `backend/src/assistant/tools/sendCalendarMail.ts`: a change tool, both roles, `from` and `to`;
  its `confirmation.read` through the handler of `GET /me` (the masked address, or
  `no_email_address` at the proposal: F5); its summary in `shared/src/assistant/`, English and
  Italian, for each role; one line in `list.ts`, one in `changeHandlers.ts` to the handler of
  `POST /mail/calendar`.
- `backend/template.yaml`: `confirmProposal`'s role gains the mailer's invoke, `AdminGetUser` and
  the table `mail`, with their variables; `sendAssistantMessage`'s and `continueAssistant`'s gain
  `AdminGetUser` (F5).
- The fake Claude: an answer in `backend/tests/integration/fake-claude/answers.json` that asks
  for the tool.
- The evaluation: requests for a mail in both languages and for each role
  (`backend/tests/eval/requests.ts`), the instructions changed only if a request shows the need.

Journeys: in `backend/tests/integration/assistant.test.ts`, a block of its own: the proposal with
the masked address, Confirm, the mail read back from the fake; Don't sends nothing.

**The paid evaluation**, run once in this step with `--ceiling` set, after its cost is said and
agreed: the Product Owner starts the local stack with the real key in their own terminal, and puts
the fake Claude back afterwards.

Documents: section 4's row m6, with the root `CLAUDE.md`'s rule on `confirmProposal`.

**Check:** section 5.1 (the new block alone); the evaluation's result; the panel: one mail
proposal shown and confirmed, by a look.

### Step m7 — The first sign-in

Builds:

- `frontend/src/services/cognito.ts`: the challenge `NEW_PASSWORD_REQUIRED` told apart from any
  other (which stays `challenge`), with its session; `RespondToAuthChallenge`.
- `login.service.ts`: the state "a new password is needed"; the answer signs the person in as
  usual; a session older than 3 minutes is said and leads back to the sign-in.
- The view: "Choose your password", with the rule and the live checks of the change-password
  screen (`shared/src/password.ts`).
- The local stack: a script that makes a local account with a temporary password, for the look
  at the screen (`AdminSetUserPassword` with `Permanent: false`).

Not here: the back end (the authorizer and the routes need nothing: Cognito gives no token before
the change).

Journeys: in the front end's `login.service.test.ts`, a block: an account given a temporary
password by a helper, the challenge, the new password, signed in, the old one refused.

Documents: section 4's row m7, with the root `CLAUDE.md`'s hard rule on passwords.

**Check:** section 5.1; the screen: "Choose your password", including a too-weak password and an
expired session.

### Step m8 — The invitation, the stages, the release prepared

Builds:

- `shared/`: `CreateUserResponse` becomes `{ username, status: "invited" }`, **no password**.
- `backend/src/lib/cognito.ts`: `createUser` without `SUPPRESS` and without a password,
  `DesiredDeliveryMediums: EMAIL`; `resendInvitation` (`MessageAction: RESEND`);
  `setPermanentPassword` and `backend/src/lib/password.ts` removed if nothing else uses them, and
  `AdminSetUserPassword` out of the creation's role.
- `createUser.ts`: no password, the answer above, the rollback kept, `503 mail_unavailable` at a
  stage other than `on` (F2). New `resendInvitation.ts`
  (`POST /users/{username}/invitation`, admin: `404`, `409 not_invited`, `403 cannot_edit_admin`,
  `503`; locally its success is not reachable, O5).
- `backend/template.yaml`: the parameters of section 13.1 (`MailStage` default `off`,
  `MailDomain`, `MailFromLocalPart`, `MailFromName`, `MailReplyTo`, `PageAddress`) and the
  conditions; at `domain` and `on`: the SES identity with Easy DKIM, the configuration set and its
  event destination, the SNS topic for bounces subscribed to the Reply-To; at `on` only: the
  pool's `EmailConfiguration` (`DEVELOPER`, From, Reply-To, configuration set), the invitation's
  template (section 6.6's wording, `{username}`, `{####}`, the page's address),
  `TemporaryPasswordValidityDays` 7, the mailer and its schedule; the DKIM records as outputs;
  `MAIL_STAGE` to every mail route. `backend/samconfig.toml`: the parameters, `MailStage=off`, no
  address. Every comment of F14.
- The page: the users screen's last look ("An invitation will be sent to …", Confirm), the
  answer "An invitation was sent to {email}", the password panel removed, the states invited and
  active in the list, "Resend invitation" for an invited User; the creation and the resend say
  "E-mail is not available yet" on `503 mail_unavailable` (F13).
- The tests: every journey that read the answered password sets one through the helper (F1),
  pages under `docs/journeys/` changed with them; a journey of the invitation locally: created,
  `invited` in the list, cognito-local's challenge answered (the temporary password set by the
  helper), then `active`; the resend's refusals.
- `backend/scripts/test-user.sh` and its npm script (F15), tried locally: the User made, the
  temporary password answered in the page's "Choose your password", the User deleted.
- `backend/scripts/smoke.sh`: as F1 decides; the invitation to the operator's address (a
  parameter of the run), its state, its resend, the User deleted; a mail on demand for `admin`;
  the mailer's log line `sent`; at stage `domain` the `503`s and the Users made in Cognito.

Documents: section 4's row m8.

**Check:** section 5.1, which here runs **most journey files** of both packages (F1), each alone;
`npm run smoke -w backend -- local` once, since this step rewrites it; the screens: Users
(creation with the last look, the states, resend).

### Step m9 — Cloud, stage `domain` (each command on the operator's explicit instruction)

Before anything reaches the cloud:

1. **The full regression** (section 5.2) on the commit of step m8, with the stack restarted and
   seeded for the walk.
2. **O6, read-only:** whether the profile `shared-calendar-admin` may
   `iam:CreateServiceLinkedRole` for Cognito (a policy simulation, which changes nothing).
3. **The pool's update, confirmed:** a change set of the stack with `MailStage=on`, created, read
   and deleted, never executed: the pool must show "Modify", not "Replacement", and no other
   resource a replacement (F10).
4. **Operator: the existing Users deleted**, the last thing before the deploy (moved here from
   the start of the work, decided by the Product Owner on 2026-11-25). In the deployed page, still
   v2.3, as the Administrator: the Users screen, "Delete" on every User
   (`DELETE /users/{username}`). No script, no `aws` command. Before deleting, the operator
   notes, outside the system, who will need an account again (name, e-mail, postal address) and
   their future appointments, if they are to be booked again by hand in step m10. What each
   deletion does, as the route does today (`docs/SHARED_CALENDAR_SPEC.md` section 10.2):
   - **cancels the User's appointments that have not ended** (`cancelReason` `user_deleted`, an
     `EVENT` each), and writes the `DELETEDUSER#<sub>` marker that refuses a new booking for them;
   - signs them out everywhere and deletes their Cognito account, so they can no longer sign in;
   - keeps their past and cancelled appointments, with their username, in the calendar.

   The Administrator's account is not deleted. From here to step m10 the deployed calendar has
   the Administrator only: the wait is the DNS records and AWS's answer on production access
   (days, at least), instead of the whole build. Checked: the Users screen lists no User.

Then: `MailStage=domain` in `backend/samconfig.toml`, committed; the gate's `verify`;
`npm run deploy -w backend`; the smoke test against `shared-calendar-api`, stage-aware (F2); the
log search for errors; then `npm run deploy -w frontend` (the gate again if the commit changed),
the new page (F13).

Then, **Operator**, on the deployed page and in the terminal:

- in "My details", the Administrator's four facts (M12), and the daily mail's hour in the
  settings (both work at stage `domain`; nothing is sent yet);
- **the test User** (F15): `npm run test-user -w backend -- cloud <username>`, the e-mail and the
  temporary password typed by the operator; signing in on the deployed page, the screen "Choose
  your password", a password chosen; the User's side tried: the week, a booking, a cancellation,
  the assistant; "E-mail…" answers "not available yet" until step m10.

**Operator**, in plain words:

- **At the DNS provider of the domain** (the same place as the page's records,
  `docs/CUSTOM_DOMAIN.md`): add the three DKIM records the stack's outputs list (CNAME, "these
  mails really come from us"), and the DMARC record (TXT `_dmarc.<domain>`, `v=DMARC1; p=none;`).
  SES verifies the domain on its own, in minutes to hours.
- **In the alarm mailbox:** click "Confirm subscription" in the mail AWS sends for the bounce
  topic, as for the alarms.
- **In the SES console, `eu-north-1`:** request production access, with the use case of
  `docs/EMAIL_ARCHITECTURE.md` section 8.5. AWS usually answers within a day. Until then SES
  writes only to verified addresses; to try things, verify one's own address there.

Documents: section 4's row m9.

**Check:** the smoke test PASS in the cloud; the stack's outputs show the DKIM records; the
operator reports the records added, the subscription confirmed, the request sent, the test User
signed in with its own password.

### Step m10 — Cloud, stage `on`, and the release v3.0.0 (each command on the operator's explicit instruction)

Starts only when SES shows the domain verified and the account out of the sandbox (read-only
checks).

1. `MailStage=on` in `backend/samconfig.toml`, committed; the gate's `verify`;
   `npm run deploy -w backend`. The pool now sends through SES.
2. `npm run deploy -w frontend` only if the page changed after step m9 (the gate again if the
   commit changed).
3. **Operator:** the test User's "E-mail…", its mail and Excel file arriving in the operator's
   mailbox.
4. The smoke test against the cloud: PASS, including the invitation to the operator's address.
5. **Operator, the look at the deployed page with real mails:** the smoke's invitation arrived
   (from `noreply@<domain>`, Reply-To the alarm address, not in spam); a throw-away User created
   with one's own address, signed in with the temporary password, a password chosen, the User
   deleted; a mail on demand from the week page, its Excel file opened; the next morning, the
   daily mail with its two files.
6. **Operator:** the Users who need an account created again (step m9's list); each receives
   their invitation; future appointments booked again by hand if wanted.
7. The documents closed (section 4's row m10); the tag `v3.0.0` when the operator asks for it.

**Check:** the end of the full regression (section 5.2): the gate's `verify`, the smoke test
PASS in the cloud, the operator's look all yes; this plan marked finished.

## 7. The operator's tasks, in one list

| Step | What | Where |
|---|---|---|
| m1, m6 | Review the decisions of the step (the Excel library; the evaluation's cost) | The review |
| m6 | Start the local stack with the real Anthropic key for the paid evaluation, put the fake back | Own terminal |
| m9 | Delete every User, just before the deploy; note who needs an account again, and their future appointments | The deployed page |
| m9 | The Administrator's four facts; the daily mail's hour | The deployed page |
| m9 | Type the test User's e-mail and temporary password (F15); its first sign-in, its own password chosen; the User's side tried | Own terminal, the deployed page |
| m9 | Three DKIM records and one DMARC record | The domain's DNS provider |
| m9 | Confirm the bounce topic's subscription | The alarm mailbox |
| m9 | Request SES production access | The SES console |
| m10 | The test User's "E-mail…" | The deployed page, own mailbox |
| m10 | The look with real mails; the Users invited again | The deployed page, own mailbox |
| m10 | The privacy notice updated with the new data and the Excel files (`docs/EMAIL_ARCHITECTURE.md` section 12.3) | Outside the system |

## 8. Out of this plan

- Notifications (E6, `docs/EMAIL_ARCHITECTURE.md` section 19).
- The greeting by first name, in the invitation (O3) or by the assistant (O4).
- The GDPR consent page (section 5.2 of that document says where it plugs in).
- Receiving mail at the domain (section 8.3 of that document).
- A forgot-password flow by e-mail.
