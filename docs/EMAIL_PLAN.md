# Shared Calendar: e-mail (implementation plan)

**Version:** v15 (2026-11-28): found at part A's first smoke test, SES in the sandbox refuses
the mailer's mail to a verified address, since it checks the role against the recipient's
identity too, and the role names the domain alone; Cognito's invitations, sent with Cognito's own
role, arrive. The Product Owner's decision: the mailer's sending right names every identity of
the account (`identity/*`, the From held to the stack's address by a condition) between parts A
and B, the one exception to the root `CLAUDE.md`'s wildcard rule; part B puts the domain back,
with a deploy and the smoke test. v14 (2026-11-28): step m10 cut into parts A (the stage `on` in SES's sandbox,
every recipient an address verified in SES, the smoke test, the operator's look with real mails,
the tag `v3.0.0`) and B (after production access: the Users invited again, the test Users and
the verified addresses kept or deleted at the operator's choice, the documents closed), each with its start, its check and its
"As done" note, since AWS's answer on production access can take days and everything else can be
proven before it (the Product Owner's decisions, with the brief
`prompts/mail-m10-split-step-m10.md`); section 4's row m10, section 5.2 and section 7 follow.
v13 (2026-11-26): step m9 done, its "As done" note written; the daily mail's hour
moved from step m9 to step m10, since its routes answer `503` at the stage `domain`
(`docs/EMAIL_ARCHITECTURE.md` section 9.1). v12 (2026-11-25): the branch `slot-5min` (times on 5-minute steps and windows of
whole hours, released as `v2.4.0` and `v2.5.0`) merged into `main` before step m9; the note
before step m9 says what the plan now builds on; the references to the documents' renumbered
versions, decisions, walk checks and record section followed. v11 (2026-11-25): step m8 done, its "As done" note written; no step's content
changed. v10 (2026-11-25): step m8 cut into parts A (the invitation), B (the stages) and C
(the smoke test and the documents), each with its check and its commit; `backend/src/lib/password.ts`
removed, the smoke test making its own passwords (the Product Owner's decisions, with the brief of
step m8). v9 (2026-11-25): step m7 done, its "As done" note written; the look at an expired
session moved from step m7's check to step m9's, since cognito-local never ends a challenge. v8 (2026-11-25): the root `CLAUDE.md`'s password rule moved from step m7 to step
m8, where the code makes it true; step m7's local script is `test-user` with its target `local`,
step m8 adds `cloud` (the Product Owner's decisions, with the brief of step m7). v7 (2026-11-25): step m6 done, its "As done" note written; no step's content
changed. v6 (2026-11-25): step m5 done, its "As done" note written; no step's content
changed. v5 (2026-11-25): steps m3 and m4 done, their "As done" notes written; no step's
content changed. v4 (2026-11-25): steps m1 and m2 done, their "As done" notes written; no step's
content changed. v3 (2026-11-25): steps m1 and m2, and steps m3 and m4, built and reviewed as pairs,
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
  `POST /users` no longer answers a password (F13); then the stage `on`, in two parts: A in SES's
  sandbox, every recipient an address verified in SES, ending with the release **v3.0.0**; B once
  AWS grants production access, the Users invited again.
- **The full regression runs twice**: in step m9 before the first cloud deploy, and at the end of
  step m10's part A (section 5.2).
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
| Section 9.1: v3.0.0 | Step m10, part A |

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
  deployed page (v2.5.0) treats the challenge `NEW_PASSWORD_REQUIRED` as a failed sign-in, so with it the
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
| m7 | `docs/FRONTEND_SERVICES.md` (the sign-in's challenge), `docs/FRONTEND_ARCHITECTURE.md` and `docs/FRONTEND_WALK.md` (the screen "Choose your password") |
| m8 | **Root `CLAUDE.md`: the hard rule's password part** becomes "A User's first password is temporary: Cognito makes it, e-mails it and forces its change at the first sign-in; the API never sees it or answers it. The Administrator's password is set once as permanent by the bootstrap" (the creation without a password is what makes it true), with F15's exception for the operator's test User. `docs/ARCHITECTURE.md` sections 1.2, 5.1, 6.3, 7.3, 7.4, 10 and 13 rewritten from `docs/EMAIL_ARCHITECTURE.md` (its section 17), with the stages and parameters; `docs/RUNBOOK.md` section 6 and a draft of the stages' steps; the three front-end documents (the users screen's invitation); every changed journey's page |
| m9 | `docs/RUNBOOK.md`: the stage `domain`, the DNS records, the production access, the suppression list; section 5.11, the deployment record, opened |
| m10 A | **Root `CLAUDE.md`: the wildcard rule** names its one exception, the mailer's `identity/*` while SES keeps the account in its sandbox; `docs/ARCHITECTURE.md` section 7.1's row "Mail only to oneself" and `docs/EMAIL_ARCHITECTURE.md` section 12.2 say the same; `README.md` "Versions": v3.0.0; `docs/RUNBOOK.md` section 3.3's "At `on`", part A, corrected by the run, and section 5.11 continued |
| m10 B | **Root `CLAUDE.md`: the wildcard rule's exception removed**, with `docs/ARCHITECTURE.md` section 7.1's row and `docs/EMAIL_ARCHITECTURE.md` section 12.2; `docs/EMAIL_ARCHITECTURE.md` a record (status line); `docs/ARCHITECTURE.md` v18 closed; `docs/SHARED_CALENDAR_SPEC.md` section 15's sentence on the address confirmed; `docs/CONVERSATIONAL_ARCHITECTURE.md` status line (deployed); `docs/RUNBOOK.md` section 3.3's "At `on`", part B, corrected, and section 5.11 closed; root `CLAUDE.md`: `docs/EMAIL_PLAN.md` among the records of finished work |

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
- **Step m10, part A.** The deploy at `on` is part A's, in SES's sandbox, so the regression's
  cloud end is part A's check: the gate's `verify` before each deploy (F12: a mechanical
  requirement, minutes long), the smoke test in the cloud, and the operator's look at the
  deployed page with real mails, every recipient an address verified in SES. The whole local walk
  is not repeated unless a screen changed after step m9 (the page is deployed in step m9, F13);
  if one did, it runs again in full before the page's second deploy. Part B deploys the API once
  more, to put the mailer's sending right back to the domain alone: the gate's `verify`, the
  deploy and the smoke test run again there.

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

**As done (2026-11-25, with step m2).** Changes under `shared/` and the documents.
`shared/src/username.ts` became `shared/src/user.ts` (its test `shared/tests/user.test.ts`) with
`UserProfile`, `PROFILE_LIMITS`, `UpdateUserBody`, `MeResponse` and the state; `shared/src/mail/`
(`schemas.ts`, `limits.ts`, `texts.ts`, `mask.ts`) with its tests under `shared/tests/mail/`; the
five codes in `shared/src/api.ts`. `docs/EMAIL_ARCHITECTURE.md` holds the Product Owner's
decisions of section 3 and the facts of its section 22, confirmed that day: **the Excel library
is `write-excel-file`** (MIT, kept up, 76 KB added to a bundle against 1 MB for `exceljs`, measured with
esbuild in a scratch folder outside the repository, a file written and read back; the Product
Owner's choice), not installed until step m3; SES's prices, Cognito's placeholders and limits
read in AWS's documentation; F10 recorded. `docs/ARCHITECTURE.md` has its v18 row, open. Root
`CLAUDE.md`, "Where the truth lives", lists `docs/EMAIL_ARCHITECTURE.md` with this plan; to make
room, the line of `docs/RENAME_PLAN.md` moved to `docs/FOLDER_STRUCTURE.md` section 8, and the
line of `docs/FRONTEND_ARCHITECTURE.md` lost its list of section numbers (the Product Owner's
decision). `shared/CLAUDE.md` names `user.ts` and `mail/`.

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

**As done (2026-11-25, with step m1).** Changes under `shared/`, `backend/`, `frontend/`, the
documents, the `CLAUDE.md` files and `.claude/rules/frontend-views.md`; nothing deployed, no
`aws` command. Root `typecheck`, `lint` and `test:unit` green, 100 % lines (shared 576 tests,
back end 1 884, front end 2 839).

- **Built as planned**: `cognito.ts` (`createUser` with the facts, `updateProfile`,
  `getProfile`, `listPlainUsers` with the facts and the state), `updateUser.ts`, `getMe.ts`, the
  logger blanking the names of F7, the two functions and roles in `template.yaml`, the seed and
  `bootstrap-admin.sh` (tried on the local stack only: the facts set, then the password; a fact
  refused changes nothing); the page's users service, a `me` service, the form's four fields with
  live checks, the list's name and e-mail, the Edit dialog, "My details" (`profile.parts.ts`,
  `profile.model.ts`, `me.model.ts`, `me.screen.ts`, `me.view.ts`). `GET /me` answers `null` for
  a fact not held (the Product Owner's choice). No existing log field held one of the blanked
  names.
- **Tests changed, and why.** Back end: `createUser.test.ts`, `listUsers.test.ts`,
  `cognito.test.ts`, `validation.test.ts` (the facts in every body and answer), `logger.test.ts`
  (the names blanked), `adminTools.test.ts` (F6: `list_users` gives Claude no fact, no state, no
  date). Front end: `users.service.test.ts`, `users.model.test.ts`, `users.screen.test.ts`,
  `users.view.test.ts`, `shell.test.ts` (the facts typed and answered, the row's two buttons,
  "My details" in both navigations), `page.test.ts` (54 fields, 68 places of a failure, six
  "Try again", ten dialogs), `booking.test.ts` and `week.view.test.ts` (fixtures of `UserSummary`
  with the facts). New: `updateUser.test.ts`, `getMe.test.ts`, `me.service.test.ts`,
  `profile.model.test.ts`, `me.model.test.ts`, `me.screen.test.ts`, `me.view.test.ts`.
- **Journeys changed, and why**, each file run alone, green: the back end's `journeys` (22, a new
  block `profiles`), `calendar` (88) and `assistant` (107); the front end's `profiles` (8, new),
  `journeys` (14), `change-password` (5), `calendar` (29) and `assistant` (19). Every User they
  create gets the four facts from one helper (`withFacts()` of
  `backend/tests/integration/setup.ts`, `newUser()` of `frontend/tests/integration/local.ts`);
  `createSecondAdmin()` makes the second administrator. Beyond sending the facts one existing
  assertion changed: the back end's AC-32 of `calendar.test.ts` expects the keys of a
  `UserSummary` with the facts and the state, the contract of this step. Pages:
  `docs/journeys/backend/profiles.md`, `docs/journeys/frontend/profiles.md`, and the section
  "The four facts of a person" of `docs/journeys/concepts.md`.
- **Found on the way.** Three local accounts made by hand earlier (`roberto`, `walk-r1-en`,
  `walk-r1-it`) had no facts, so `GET /users` answered `500`, as `docs/EMAIL_ARCHITECTURE.md`
  section 4.3 wants; deleted from cognito-local on the Product Owner's choice, and the case is
  noted in `docs/ARCHITECTURE.md` section 8 and `docs/COMMANDS.md`. `scripts/cognito.mjs` named an
  empty address wrongly in its refusal: fixed.
- **Browser look** (local stack, desktop width): as `admin`, the form's fields and refusals, a
  create, the row's name and e-mail, Edit saved and the list updated, "My details" with Edit, a
  refusal and Cancel; as `alice`, "My details" read-only with its sentence and no "Users". The
  walk's new checks are `docs/FRONTEND_WALK.md` section 12; six of them, and the phone width,
  not yet walked.
- **Documents**: root `CLAUDE.md`'s logging rule (199 lines); `docs/ARCHITECTURE.md` sections 4,
  5.1, 7.1, 8, 11 and v18; `docs/SHARED_CALENDAR_SPEC.md` v21 (section 10.1, route 21);
  `docs/FRONTEND_SERVICES.md` v13 (section 13, new section 23); `docs/FRONTEND_ARCHITECTURE.md`
  v27 (sections 4, 5.1, 6); `docs/FRONTEND_WALK.md` v10; `docs/FOLDER_STRUCTURE.md`;
  `docs/COMMANDS.md`; `backend/CLAUDE.md`, `frontend/CLAUDE.md`.

**What pair m3/m4 finds ready**: the mail's contract in `shared/src/mail/` (settings, the body of
`POST /mail/calendar`, the limits, the texts, `maskAddress`) and its error codes; every person's
facts readable through `cognito.getProfile`, the Administrator's e-mail among them; the
`write-excel-file` choice, to install; the users service and "My details" to which the week's mail
dialog will add nothing of their own.

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

**As done (2026-11-25, with step m4).** Changes under `shared/`, `backend/`, `frontend/`, the
documents, the `CLAUDE.md` files, `eslint.config.js` and `package-lock.json`; nothing deployed, no
`aws` command against the cloud. The pair's check is under step m4.

- **Built as planned**: `mailDb.ts` (the day's count only: the settings and the daily mark come
  with step m5), `excel.ts` with its lint rule, `ses.ts`, `lambdaInvoke.ts`, `mailerEvent.ts`
  (the event checked strictly, `kindFor`), `mailer.ts`, `cognito.namesBySub()`; in
  `template.yaml` the table `mail`, `MailerFunction` and its role, the parameters `MailStage`,
  `MailDomain`, `MailFromLocalPart`, `MailFromName`, `MailReplyTo`; the fake mail, the table in
  `local-seed.sh`, `local:lambda`, `mail:send`, `verify.sh`'s note. New dependencies:
  `@aws-sdk/client-sesv2`, `@aws-sdk/client-lambda`, `write-excel-file`; for the tests
  `read-excel-file`. `npm audit` reported 9 moderate findings, all there before the pair; noted
  and not changed (the Product Owner's choice).
- **Not built**: `MAIL_ALLOW_NOW`, which only the daily mail reads, moves to step m5.
- **F3, tried first**: on macOS with Docker Desktop, the route's container reached
  `sam local start-lambda` at `http://host.docker.internal:3001`; the `Event` invoke was answered
  `202` at once and the mailer ran and sent. Not tried on Linux or in a Codespace, where
  `host.docker.internal` needs a mapping (`docs/COMMANDS.md` section 3.5).
- **The mailer's measure** (in AWS's Lambda image on the local stack, memory and CPU limited by
  Docker): a mail of a whole year, 3 000 appointments, took 5.2 s to 5.8 s at 512 MB, its memory
  at most 139 MB; at 256 MB, with half the CPU, 18.9 s. Hence 512 MB and a timeout of 30 s. The
  3 000 items were removed afterwards.
- **Tests changed, and why.** Back end: `cognito.test.ts` (`namesBySub`). New: `mailDb.test.ts`,
  `excel.test.ts`, `ses.test.ts`, `lambdaInvoke.test.ts`, `mailerEvent.test.ts`,
  `mailer.test.ts`. The integration set-up (`setup.ts`) now stops every file's run when the
  table `mail`, the fake mail or `local:lambda` is missing, and gains the mail helpers; no
  journey's story changed.
- **Journeys**: `backend/tests/integration/mail.test.ts`, block "the mailer run by hand" (three
  tests), page `docs/journeys/backend/mail-mailer.md`; with step m4's block, the file is green
  alone, twice. It never empties the `calendar` table (the Product Owner's choice): its own day,
  45 days ahead, its own type and window, three appointments marked with the run, removed
  first and last; a file's rows are compared with the rows of that mark only.
- **The CLAUDE.md files.** Root (199 lines, shown to the Product Owner before the change): the
  hard rule now says mail goes only by the mailer, through SES; Cloud safety's local stack has
  the fake mail and `start-lambda`; the command `local:lambda`; `verify` needs it; the
  foreground bullet keeps only how to stop a background `dev`. `backend/CLAUDE.md` (199 lines):
  the e-mail modules, the fake mail, the two scripts, `mail.test.ts`; to make room, the list of
  the Administrator's calendar handlers became one sentence (their names are the folder's), and
  the line on the calendar journeys emptying the table went (the root says it).

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

**As done (2026-11-25, with step m3).** Root `typecheck`, `lint` and `test:unit` green, 100 %
lines (shared 576 tests, back end 1 927, front end 2 881).

- **Built as planned**: `sendCalendarMail.ts` with its function and role; the page's
  `MailService` (`mail.service.ts`, `mail.types.ts`), `MailScreen` (`mail.screen.ts`), the
  week's "E-mail…" and `dialog.mail`, `MAIL_TEXTS` and the sentence of a refused range in
  `texts.ts`, `WeekScreen.range()`; `MailCalendarResponse` in `shared/src/mail/schemas.ts`. The
  address shown after "Send" is read with `GET /me` and masked by `maskAddress`; the route
  stays `202 { status: "queued" }` (the Product Owner's choice).
- **Beyond the plan**: the route answers `404 user_not_found` when the account was deleted after
  its token was issued, as `GET /me` does. A request counted whose invoke then fails stays
  counted (`docs/ARCHITECTURE.md` section 4, "The mail of a range of dates").
- **Tests changed, and why.** Front end: `texts.test.ts` (the mail's sentences),
  `week.screen.test.ts` (`range`), `week.view.test.ts` (the dialog; its fake's text is neutral,
  since "You" was found in it by an older check), `detail.view.test.ts` (the week's fakes gain
  `range` and `mail`), `page.test.ts` (56 fields, 69 places of a failure, eleven dialogs, the
  status `mail-sent`). New: `mail.service.test.ts`, `mail.screen.test.ts`. Back end new:
  `sendCalendarMail.test.ts`.
- **Journeys**, each file alone, green: the back end's `mail.test.ts` block "POST /mail/calendar"
  (five tests: both roles, 367 days, the sixth of the day, no address), page
  `docs/journeys/backend/mail-route.md`; the front end's `mail.test.ts` (three tests, the
  throw-away User `fe-mail`), page `docs/journeys/frontend/mail.md`; the section "Mail in the
  journeys" of `docs/journeys/concepts.md`.
- **Browser look** (local stack): the dialog for `alice` and for `admin`, the address masked, a
  reversed range refused; the mails at http://localhost:8025 and the `.xlsx` opened (sheet
  "Appointments", its headings and rows). Section 12's six checks left by step m2 (173, 176,
  178, 181, 182, 184) walked and passed; the phone width at 606 px only, the narrowest the
  browser allowed: the rows wrap, an e-mail breaks, nothing scrolls sideways. The new checks are
  `docs/FRONTEND_WALK.md` section 13; the walk as a whole was not run.
- **Documents**: `docs/ARCHITECTURE.md` (v18: sections 4, 5.5, 7.1, 8, 9.2, 10, 11),
  `docs/FRONTEND_SERVICES.md` v14 (section 24), `docs/FRONTEND_ARCHITECTURE.md` v28,
  `docs/FRONTEND_WALK.md` v11, `docs/COMMANDS.md` (section 3.5), `docs/FOLDER_STRUCTURE.md`,
  `docs/EMAIL_ARCHITECTURE.md` (the counter's key as built); `frontend/CLAUDE.md`.

**What step m5 finds ready**: the table `mail` and `mailDb.ts`, to which the settings and the
daily mark are added; `excel.ts`, `ses.ts` and the mailer, whose kinds `calendar` and `mine` a
kind `daily` joins; `local:lambda`, `mail:send` and the fake mail, to run the daily mail by hand;
the parameters of the sender and `MailStage`. Still to make: `MAIL_ALLOW_NOW`, the hourly timer
and its own role.

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

**As done (2026-11-25).** Root `typecheck`, `lint` and `test:unit` green, 100 % lines (shared
576 tests, back end 1 980, front end 2 959).

- **Built as planned**: `getMailSettings.ts` and `updateMailSettings.ts`, each with its function
  and role (role → stage → body); `mailDb.ts` gains the settings (read with the defaults, saved
  with `updatedAt` and `updatedBy`) and the daily mark (`takeDailyMark`, `finishDailyMark`, one
  conditional write each, `expiresAt` 400 days after the write); `mailerEvent.ts` the event
  `DailyEvent`; `cognito.ts` `adminRecipients()`; the mailer's kind `daily`, with `MAIL_STAGE`
  (anything but `on` ends at once, `mail_unavailable`) and `MAIL_ALLOW_NOW` (an event with `now`
  is `invalid_event` without it). `template.yaml`: the two functions and routes, the schedule
  `DailyMailSchedule` with `DailyMailScheduleRole`, the alarm `MailerErrorsAlarm`; the mailer's
  role gains `GetItem`, `PutItem` and `UpdateItem` on the table `mail`. `npm run mail:daily`
  (`scripts/mail-daily.sh`); `local-seed.sh` writes `MAIL_ALLOW_NOW` for the mailer alone. The
  page: `MailSettingsService` (a service of its own), `daily-mail.model.ts`,
  `daily-mail.screen.ts`, `mountDailyMail` in `settings.view.ts`, `DAILY_MAIL_TEXTS`, the part
  `section.daily-mail` of `#settings`.
- **The file names**: `calendar-next-7-days-<date>.xlsx` (the booked appointments of the date and
  the six after it) and `calendar-backup-from-<1st of last month>.xlsx` (every status, read up to
  the date + 366 days). The mail's text is `dailyMailText`.
- **Decisions 4 and 5, as written** in `docs/EMAIL_ARCHITECTURE.md` section 6.2: a failed daily
  mail is tried again later the same day (at the chosen hour and at any later hour of the same
  local day, a mark `failed`, or `sending` older than 10 minutes, is taken again; with no mark
  only the chosen hour sends); several administrators share one mark and each gets a mail of
  their own, and on a partial failure the retry sends to all again, so one may get it twice,
  accepted, with no code guarding against it.
- **Beyond the plan**: nobody to send to ends the mark `sent` with no mail (outcome
  `no_recipient`, logged as a warning); the mark keeps `sesMessageIds` (a list, one per mail) and
  `backupCount` beside `appointmentCount` (`docs/EMAIL_ARCHITECTURE.md` section 10.1 updated);
  the settings are one unconditional `PutItem`, the last save winning; finishing a mark is
  conditional on the run's own `startedAt`, so a run taken over cannot overwrite the newer one.
- **Tests changed, and why.** Front end: `page.test.ts` (58 fields, 72 places of a failure, eight
  "Loading…", seven "Try again" with the daily e-mail's own name, the statuses `unavailable` and
  a second `saved`; a new test of the part's markup), `shell.test.ts` (the settings screen also
  sends `GET /mail/settings`: its tests count the calendar's requests apart; four new tests of
  the part), `settings.view.test.ts` (a new `describe` for `mountDailyMail`). Back end:
  `mailDb.test.ts`, `mailerEvent.test.ts`, `cognito.test.ts`, `mailer.test.ts` gain the new
  functions' tests; nothing existing changed. New: `getMailSettings.test.ts`,
  `updateMailSettings.test.ts`, `mail-settings.service.test.ts`, `daily-mail.model.test.ts`,
  `daily-mail.screen.test.ts`.
- **Journeys**, each file alone, green: the back end's `mail.test.ts`, every block (15 tests),
  with the new block "the daily mail" (seven tests, on the seven dates before the file's day,
  marks removed first and last, settings written back), page `docs/journeys/backend/mail-daily.md`;
  the front end's new `mail-settings.test.ts` (three tests, settings written back), page
  `docs/journeys/frontend/mail-settings.md`; the section "The daily mail in the journeys" of
  `docs/journeys/concepts.md`. `setup.ts` gains `putMailItem`, `getMailItem`, `deleteMailItem`.
- **By hand**: `npm run mail:daily -w backend -- 2026-11-25T06:00:00.000Z` (07:00 in Rome, the
  hour of the settings) answered `sent`, one mail to `admin@example.com` at the fake mail with
  both files, opened (the next 7 days: the headings only, nothing booked locally; the backup: the
  journey's three cancelled rows); run again, `already_sent`. **Browser look** (local stack):
  the part filled with the defaults and the zone; `7:30` refused under the hour with no request;
  `18` saved, "Daily e-mail saved.", shown as `18:00`; with `MAIL_STAGE` `off` and the API
  restarted, "E-mail is not available yet." in place of the fields and the calendar's settings
  still there; set back to `on`. The new checks are `docs/FRONTEND_WALK.md` section 14; the walk
  as a whole was not run.
- **Documents**: `docs/ARCHITECTURE.md` (v18 row and status: sections 4, 5.5, 7.1, 8, 9.2, 11),
  `docs/EMAIL_ARCHITECTURE.md` (sections 6.2 and 10.1), `docs/FRONTEND_SERVICES.md` v15
  (section 25), `docs/FRONTEND_ARCHITECTURE.md` v29, `docs/FRONTEND_WALK.md` v12 (checks 195 to
  202), `docs/COMMANDS.md` (section 3.5: `mail:daily`, `MAIL_ALLOW_NOW`, `MAIL_STAGE`).
- **The CLAUDE.md files**: `backend/CLAUDE.md` was at 199 lines; its section "A new calendar
  function" became one line under the calendar's handlers pointing at `docs/COMMANDS.md`
  section 3.2, which already held its content, and the room went to the mail settings' handlers,
  the mailer's kinds, `mailDb.ts`'s new items and `mail-daily.sh` (197 lines). `frontend/CLAUDE.md`:
  `mail-settings`, `daily-mail.model.ts`, `daily-mail.screen.ts`, `mail-settings.test.ts`. The
  root `CLAUDE.md` is unchanged.

**What step m6 finds ready**: the mailer with its kinds `calendar`, `mine` and `daily`, and its
event checked by `MailerEvent`; `lambdaInvoke.ts` to start it in the background; the count of five
a day in `mailDb.ts`, as `POST /mail/calendar` uses it; `MAIL_STAGE` reaching the mailer. The
assistant's tool `send_calendar_mail` goes through the route's handler, as the root rule on the
assistant requires.

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

**As done (2026-11-25).** Root `typecheck`, `lint` and `test:unit` green, 100 % lines (shared
577 tests, back end 1 993, front end 2 959). Brief `prompts/mail-m06-assistant-mail-tool-implementation.md`.

- **Built as planned**: `backend/src/assistant/tools/sendCalendarMail.ts` (input
  `MailCalendarBody`, kind of read `details`), its sentence `changes.sendCalendarMail` and the
  type `MailSummary` in `shared/src/assistant/` in English and Italian, one line in `list.ts`,
  one in `changeHandlers.ts`. `confirmation.read` in order: `MAIL_STAGE` (anything but `on` is
  `mail_unavailable`, nothing read), the handler of `GET /me` (`no_email_address`,
  `user_not_found`), then the call `POST /mail/calendar` with `{ from, to }` and the facts (the
  dates, `calendar` or `mine` by the role, the address masked). `subjects: ['mail']`, so two
  mails in one answer are `same_thing_twice`, whose message in `exchange.ts` now names a second
  mail. `toModel` replaces the message of a change done: the mail is on its way, no address.
  The day's five are not read at the proposal (decision 4).
- **Permissions, and why** (`backend/template.yaml`): `SendAssistantMessage` and
  `ContinueAssistant` gain `cognito-idp:AdminGetUser` on the one pool (statement
  `read-own-details`: the proposal reads the person's own address through `GET /me`) and the
  variable `MAIL_STAGE`; nothing on the table `mail`, no invoke. `ConfirmProposal` gains
  `dynamodb:UpdateItem` on the table `mail` (`count-mail`: the route counts the day's five) and
  `lambda:InvokeFunction` on the mailer alone (`start-mailer`: the route starts it), and the
  variables `MAIL_STAGE`, `MAIL_TABLE`, `MAILER_FUNCTION`, `LAMBDA_ENDPOINT` (empty in the
  cloud); the `AdminGetUser` the mail route needs it already held for the booking. Nothing of
  SES: only the mailer sends. `eslint.config.js`: the two rules on change handlers name
  `sendCalendarMail` too.
- **Tests changed, and why.** New: `backend/tests/unit/assistant/tools/sendCalendarMail.test.ts`
  (definition, schema, both roles' proposals, both languages, the stage refusal as a unit test
  only, no address, 404 and 500, `toModel` without the address). `tools.test.ts` and
  `proposals.test.ts`: the user's tool list, the `unknown_tool` list and `CHANGE_HANDLERS` gain
  the tool. `shared/tests/assistant/texts.test.ts`: the six sentences. `backend/tests/eval/week.ts`
  creates `eval-anna` and `eval-bruno` with the four facts: since step m2 `POST /users` requires
  them, and the evaluation could not have started without it.
- **Journey**: a new last block of `backend/tests/integration/assistant.test.ts`, "a mail asked
  for through the assistant (3, 5.4, 5.5)", four tests, green alone (the proposal with the dates
  and the masked address and no mail; Confirm, "on its way", one mail read back and forgotten for
  that address only; Don't, no mail; a second administrator without facts, `no_email_address`
  and no proposal), with a throw-away User `chat-mail`; the fake Claude's answer
  `tool-send-mail-week` and its sentence in `answers.json`. Page
  `docs/journeys/backend/assistant-mail.md` (skill `explain-journey`), listed in the README;
  `docs/journeys/concepts.md`, "A proposal, and its two buttons", names the mail tool. No
  existing journey's story changed.
- **The paid evaluation**, once, `claude-sonnet-5-5` at effort `low`, 2026-11-25: **63 of 63
  passed**, 122 steps, **47.10 US cents**. The six mail requests: `mail-mine` (anna, en, next
  week), `mail-miei` (bruno, it, next week, **confirmed**: `done`, one mail to
  `eval-bruno@example.com` at the fake mail, Claude's Italian closing words say it may take a few
  minutes), `mail-calendar` (admin, en), `mail-calendario-giorno` (admin, it, one day),
  `mail-two-weeks` (anna, en, two weeks side by side: one call 30 November to 13 December),
  `mail-con-intervallo` (admin, it, two weeks with a gap: one call 30 November to 27 December),
  each PASS. Read by hand: in the request with a gap Claude proposed at once without saying the
  weeks between are included; the proposal shows the real dates, which decision 5 accepts.
  **The instructions did not change.** The mark changes with the new tool, so the conversations
  in progress end at the deploy.
- **By hand**: the panel as `admin` against the fake Claude: "Send the calendar from Wednesday 2
  December 2026 to Tuesday 8 December 2026 to a•••@example.com.", Confirm, "Done", Claude told
  only that the mail is on its way; the mail "Calendar, Wed 2 Dec 2026 to Tue 8 Dec 2026" with
  its file at http://localhost:8025. No screen of the page changed: the panel already shows
  every proposal and the three refusals' sentences. New checks: `docs/FRONTEND_WALK.md` v13,
  section 15, checks 203 to 206; the walk as a whole was not run.
- **Documents**: `docs/CONVERSATIONAL_ARCHITECTURE.md` v24 (sections 3, 5.4, 5.5 rule 4, 8.2,
  8.3, 11.3, 12.2, 12.3, the risks' row); `docs/ARCHITECTURE.md` (v18 row: section 4, "The
  assistant's routes" with "A mail" and "The mail of a range of dates"; section 7.1, the roles and
  the row "A change needs the person"); `docs/EMAIL_ARCHITECTURE.md` (section 7: the stage
  refused at the proposal, the five told after Confirm, several periods one mail, as built;
  section 12.2); `docs/COMMANDS.md` (the evaluation: 63 requests, about 50 cents,
  `local:lambda`); `docs/FOLDER_STRUCTURE.md` (section 6).
- **The CLAUDE.md files**: root, the rule widened to "The assistant changes the calendar, or
  sends a mail, only through `confirmProposal`, …" (199 lines, no other line); `backend/CLAUDE.md`,
  a change tool's file imports no handler that sends a mail either (197 lines).
- **Not in this step, noticed**: `local:api` stalled twice at start-up with 37 functions under
  `warm_containers = "EAGER"`, and a retry worked each time; `LAZY` is a possible fix, not made.

**What step m7 finds ready**: every way to ask for a mail (the route, the week page, the
assistant) sends only to the account's own address, read in Cognito, and is refused while
`MAIL_STAGE` is not `on`; the facts of a person, `GET /me`, and the mailer on `local:lambda`.

### Step m7 — The first sign-in

Builds:

- `frontend/src/services/cognito.ts`: the challenge `NEW_PASSWORD_REQUIRED` told apart from any
  other (which stays `challenge`), with its session; `RespondToAuthChallenge`.
- `login.service.ts`: the state "a new password is needed"; the answer signs the person in as
  usual; a session older than 3 minutes is said and leads back to the sign-in.
- The view: "Choose your password", with the rule and the live checks of the change-password
  screen (`shared/src/password.ts`).
- The local stack: `npm run test-user -w backend -- local <username>` (F15, target `local` only;
  step m8 adds `cloud`), which makes a local account with a temporary password, for the look at
  the screen (`AdminSetUserPassword` with `Permanent: false`).

Not here: the back end (the authorizer and the routes need nothing: Cognito gives no token before
the change).

Journeys: in the front end's `login.service.test.ts`, a block: an account given a temporary
password by a helper, the challenge, the new password, signed in, the old one refused.

Documents: section 4's row m7. The root `CLAUDE.md`'s hard rule on passwords waits for step m8.

**Check:** section 5.1; the screen: "Choose your password", including a too-weak password. The
expired session is looked at in the cloud, in step m9's check: cognito-local accepts any session
(`docs/EMAIL_ARCHITECTURE.md` section 14.1).

**As done (2026-11-25).** Root `typecheck`, `lint` and `test:unit` green, 100 % lines (shared
577 tests, back end 1 993, front end 3 033). The new journey block alone green, 4 tests, twice in
a row; the whole of `login.service.test.ts` green, 9. Brief
`prompts/mail-m07-first-sign-in-implementation.md`.

- **What Cognito and cognito-local answered.** cognito-local 5.3.0 answers a temporary password's
  `InitiateAuth` with `ChallengeName: NEW_PASSWORD_REQUIRED` and a `Session`, and
  `RespondToAuthChallenge` with the three tokens. It checks neither the session (a made-up one
  gets tokens) nor the pool's rule for the new password (`weak` gets tokens):
  `docs/EMAIL_ARCHITECTURE.md` section 14.1 corrected. So the page checks the rule itself before
  sending (as "Password" does), and the end of the 3 minutes (real Cognito's
  `NotAuthorizedException`, also read: `ExpiredCodeException`) is proved by unit tests only; its
  look is in step m9's check and `docs/FRONTEND_WALK.md` check 216. Real Cognito was not tried.
- **Built.** `cognito.ts`: `respondToNewPassword`, `toSignInOutcome` (the challenge apart from any
  other, which stays `challenge`), `toChallengeOutcome`. `LoginService`: the result and state
  `new_password_required` (the username only, with a refusal after a failed try), the state
  `answering`, `choosePassword()`; the session stays in a private field, never in a state or a
  result; `reset()` is the Cancel and forgets it. New reasons `session_expired` ("This took too
  long. Please sign in again.") and `password_refused`. Kept apart from `toAuthOutcome`, so the
  `RefreshService` is untouched.
- **The screen, and the reuse.** `ChoosePasswordScreen` and `mountChoosePassword`, a section of
  `#login` beside the sign-in form, which hides while the challenge is open. The live checks are
  those of the "Password" screen: `password.model.ts` gains `newPasswordHints`, built on the same
  `newProblems`/`problemTexts` and on `againHint`, factored out of `passwordHints`; the rule stays
  `shared/src/password.ts`, so nothing under `shared/` moved. The shell mounts it with the login.
- **Existing tests changed, and why.** `login.service.test.ts` (unit): its "any challenge" case
  used `NEW_PASSWORD_REQUIRED`, which is no longer "any": now `SOFTWARE_TOKEN_MFA`.
  `login.view.test.ts`: the form is `#login form.sign-in`, since `#login` holds two forms.
  `page.test.ts`: the template list gains `tpl-first-password-need`, the fields 58 → 60, the
  places of a failure 72 → 73. No journey's story changed; `login.service.test.ts` (integration)
  only gained its block, with the page `docs/journeys/frontend/first-sign-in.md`.
- **The script.** `backend/scripts/test-user.sh` (`npm run test-user -w backend -- local
  <username>`): refuses another target (naming step m8), a name the username rule refuses,
  `admin`, an existing account; the temporary password typed twice, checked by
  `password_problems` (moved from `bootstrap-admin.sh` into `target.sh`, so both use it) and sent
  on stdin through `cognito.mjs`'s new action `set-temporary-password`; the four facts made up; a
  failure after the creation deletes the account. Tried: each refusal; a first run failed, the
  AWS CLI's short form splitting the address at its comma (now JSON); then the account made
  (`FORCE_CHANGE_PASSWORD`, group `user`, the four facts), a second run refused.
- **The look** (`docs/FRONTEND_WALK.md` checks 207 to 215), with the script's account: the
  challenge leads to "Choose your password", the focus in the field; `weak` shrinks the list
  live and the button stays off; Cancel goes back with the username kept, the password wiped; at
  390 × 844, a repeat that differs is said live, a good password signs in as the User; after the
  sign-out the temporary password is refused and the new one accepted. The account deleted
  after.
- **`CLAUDE.md` files.** Root unchanged (the password rule waits for step m8). `frontend/CLAUDE.md`:
  `choose-password` among the views and the screens. `backend/CLAUDE.md`: `test-user.sh` among
  the scripts; "the Cognito calls carrying a password", no longer two. `.claude/rules/frontend-views.md`:
  the counts of `page.test.ts` (already stale) dropped, the rule kept.
- **What step m8 finds ready.** The page answers the challenge an invitation gives, so the
  invitation needs nothing of the page's sign-in; `test-user.sh` takes a new target `cloud`
  beside `local` (`load_target` already knows both); `setTemporaryPassword()` in
  `frontend/tests/integration/local.ts` stands for the invitation's temporary password in the
  invitation's journey.

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
- `backend/scripts/test-user.sh` gains its target `cloud` (F15; the target `local` is step m7's), tried locally: the User made, the
  temporary password answered in the page's "Choose your password", the User deleted.
- `backend/scripts/smoke.sh`: as F1 decides; the invitation to the operator's address (a
  parameter of the run), its state, its resend, the User deleted; a mail on demand for `admin`;
  the mailer's log line `sent`; at stage `domain` the `503`s and the Users made in Cognito.

Documents: section 4's row m8.

Built in three parts, each with its check, a review and its commit (the brief
`prompts/mail-m08-invitation-implementation.md`): **A**, the invitation (`shared/`, the back
end's code, the page, the journeys, the root `CLAUDE.md`'s rule); **B**, the stages
(`template.yaml`, `samconfig.toml`, `test-user`'s target `cloud`); **C**, the smoke test and the
documents. `backend/src/lib/password.ts` goes with the password of the creation; the smoke test
makes its own passwords, checked against the pool's rule.

**Check:** section 5.1, which here runs **most journey files** of both packages (F1), each alone;
`npm run smoke -w backend -- local` once, since this step rewrites it; the screens: Users
(creation with the last look, the states, resend).

**As done (2026-11-25), in three parts.** A, the invitation, committed `254b3f8` with the brief
`prompts/mail-m08-invitation-implementation.md`; B, the stages, committed `223a49a`; C, the smoke
test and the documents. After each part root `typecheck`, `lint` and `test:unit` green, 100 %
lines.

- **What cognito-local answered.** `AdminCreateUser` without a password and without `SUPPRESS`
  makes the account `FORCE_CHANGE_PASSWORD` with a temporary password of 6 characters, not by the
  pool's rule, printed in its log (a box "Confirmation Code Delivery", the line "Code") instead of
  mailed; the first sign-in gets `NEW_PASSWORD_REQUIRED`. `MessageAction: RESEND` is not
  supported: the route's refusals answer locally as in the cloud, its success ends in a 500, and
  is proved by unit tests only (O5). `docs/COMMANDS.md` section 3.1 and `docs/ARCHITECTURE.md`
  section 8 say so.
- **Built (A).** `CreateUserResponse` `{ username, status: 'invited' }`; the codes `not_invited`
  and `mail_unavailable` on their routes. `cognito.ts`: `createUser` with
  `DesiredDeliveryMediums: EMAIL`, no password; `resendInvitation`; `setPermanentPassword` and
  `backend/src/lib/password.ts` removed with their tests. `createUser.ts` answers `503` before
  anything is made unless `MAIL_STAGE` is `on`, the rollback kept; its role lost
  `AdminSetUserPassword`. `resendInvitation.ts` with its function and role (`AdminListGroupsForUser`,
  `AdminGetUser`, `AdminCreateUser`, the one pool); the route in `env.local.json`. The page: the
  last look ("An invitation will be sent to …", Confirm), "An invitation was sent to …", the
  states in the list, "Resend invitation", "E-mail is not available yet"; `dialog.created` gone.
- **The journeys, and how each story was kept (A).** Every one that read the answered password
  now sets one with a helper right after the creation, `setPasswordOf` in
  `backend/tests/integration/setup.ts` and `setPermanentPassword` in
  `frontend/tests/integration/local.ts` (cognito-local's `AdminSetUserPassword`, `Permanent:
  true`), and signs in with it as before: in the back end `journeys.test.ts` (journey 6 checks
  the answer is the username and `invited`, then carol's password is set), `assistant.test.ts`,
  `calendar.test.ts` (five places), `mail.test.ts`; in the front end `journeys.test.ts`,
  `calendar.test.ts`, `assistant.test.ts`, `change-password.test.ts`, `profiles.test.ts`,
  `mail.test.ts`. No story changed: only where the password comes from. New: the block `the
  invitation` of the front end's `login.service.test.ts` (`fe-invited`: created, `invited`, a
  temporary password by `setTemporaryPassword`, "Choose your password" answered, `active`; the
  resend's `409`, `403` for `admin`, `404`), with its page `docs/journeys/frontend/invitation.md`;
  the changed pages refreshed with the skill `explain-journey`. Each changed file green, run
  alone. The walk: `docs/FRONTEND_WALK.md` checks 56 to 60 and 217 to 219, at both widths.
  Found, not caused by this step: the back end's `calendar.test.ts` leaves `bookingHorizonDays`
  at 30 while `mail.test.ts` books 45 days ahead, so their order matters.
- **The stages (B).** `PageAddress`; the conditions `MailDomainStage` and `MailOn`; at `domain`
  and `on` the SES identity with Easy DKIM, the configuration set and its event destination
  (bounces and complaints) to an SNS topic subscribed to the Reply-To, with its policy, the three
  DKIM records as outputs; at `on` only the pool's `EmailConfiguration`, `InviteMessageTemplate`
  (section 6.6's text, `{username}`, `{####}`, the page's address) and
  `TemporaryPasswordValidityDays` 7, the mailer, its log group, role, timer and alarm, and the
  routes' `MAILER_FUNCTION` and invoke permission. `MAIL_STAGE` reaches nine functions. The
  pool's `Schema` untouched. `samconfig.toml`: the parameters, `MailStage=off`, no address;
  `local-api.sh` and `local-lambda.sh` run the local stack at `on`. `sam validate --lint` clean,
  `npm run build -w backend` green. `test-user.sh` gained `cloud` (the operator's own address
  asked for), tried with `local` only.
- **What AWS's references confirmed.** Each new property of the template is cited in its comment
  from AWS's CloudFormation reference: `EmailConfiguration` (`DEVELOPER` creates Cognito's
  service-linked role), `InviteMessageTemplate`, the `PasswordPolicy`'s
  `TemporaryPasswordValidityDays`, `AWS::SES::EmailIdentity` (Easy DKIM without
  `DkimSigningAttributes`, the `DkimDNSTokenName`/`Value` attributes),
  `AWS::SES::ConfigurationSet` and its event destination; SES's guide for the SNS notifications.
  F1's simulator: AWS's Cognito guide, "Email settings for Amazon Cognito user pools", says a pool
  sending through SES in the sandbox can send "to Amazon SES mailbox simulator addresses"; SES's
  guide says the simulator works in the sandbox, counts against no daily quota and no reputation,
  and is billed like any mail. No page shows Cognito itself writing to the simulator: the smoke
  test at `on` (step m10) is the proof.
- **The smoke test (C).** `backend/scripts/smoke.sh` rewritten as F1 says: it reads `MailStage`
  (`target.sh`'s `load_target` now sets `MAIL_STAGE`); its three Users through `POST /users` at
  `on`, or after a checked `503` straight in Cognito at `off` and `domain`, with the simulator's
  address and a permanent password from its own generator (`new_password`, node's `crypto`,
  checked by `password_problems`) set through `cognito.mjs`; at `on` the invitation to the
  operator's address, asked for at the start (state, resend, the resend's `409` and `403`, the
  User deleted), and a mail on demand for `admin` with the mailer's log line `sent` read with
  `aws logs filter-log-events` (read-only); at `off` and `domain` the two `503`s. Locally a
  made-up address, the resend's success a `SKIP`, the mail looked for in the fake mail. 61 checks
  at `on`, 58 at `off` and `domain`.
  Run once locally, `npm run smoke -w backend -- local`, the admin password piped in: **PASSED**,
  61 lines, 58 PASS and 3 SKIP (the two of `GlobalSignOut`, the resend's success); the mail
  reached the fake mail after 5 s; every User and the calendar's items removed. The stages
  `off` and `domain`, and the mailer's log line, run only against a stack (step m9).
- **The documents (C).** `docs/ARCHITECTURE.md`: the status line and v18's row; F4; sections
  1.2, 3, 4 (`POST /users`, the new resend route, the conventions), 5.1, 6.2, 6.3 (a new diagram
  and the resend), 7.1, 7.3, 7.4, 8, 8.1, 9.2 (`PageAddress`, the stages' table), 9.3 (the smoke
  test's stages, invitation and mail), 10, 13 (why the rejection of v2 no longer holds) and 14.
  `docs/RUNBOOK.md`: section 2's smoke counts, a new section 2.4, a draft of the stages as
  section 3.3 for steps m9 and m10, section 6 rewritten (a new User's invitation, a lost
  password). `docs/COMMANDS.md`: `test-user cloud`, the smoke test's stages and address, the
  journeys' helpers. `docs/FRONTEND_SERVICES.md` and `docs/FRONTEND_ARCHITECTURE.md`: the users
  screen's invitation, states and resend (v17 and v31). `docs/FRONTEND_WALK.md`: checks 55 and
  217 corrected to the page as built (the `409` said in the dialog; "Back" after a failure).
  `docs/FOLDER_STRUCTURE.md`: the generator gone, the
  users' dialogs. `backend/CLAUDE.md`: `cognito.ts`'s line.
- **Two mismatches with `docs/EMAIL_ARCHITECTURE.md`, found in C and fixed** (the Product
  Owner's decision): section 9.1's resend row gains its body `{ username, status: "invited" }`
  and its `400`, as built; and the page now says section 5.1's "nothing was kept" when the
  server fails a creation (`CREATE_FAILED` in `users.model.ts`, its unit test changed), where it
  said the general server sentence.
- **What moved in the root `CLAUDE.md` (A).** The password rule of section 4's row m8, with
  `test-user` named as its one exception. To make room, three notes of "Everyday commands" went
  to `docs/COMMANDS.md` (zsh's word splitting, section 1; the Codespace's iptables rule, section
  3.3; stopping a background `dev`, section 5, where each already was), replaced by one line that
  points at sections 1 and 3.3. The file is at 199 lines.
- **What step m9 finds ready.** The code and the template of all three stages, never deployed;
  `samconfig.toml` at `off`; `test-user cloud` for the operator's test User; the smoke test
  aware of the stage, to run after each deploy; `docs/RUNBOOK.md` section 3.3, the stages' steps
  to run and correct. Still owed: O6 (the service-linked role) and the change set of the pool,
  both in step m9's list.

**The merge with `slot-5min` (2026-11-25), before step m9.** The code of steps m1 to m8 now
holds the two plans released from that branch: times on 5-minute steps (`docs/SLOT_STEP_PLAN.md`)
and windows of whole hours (`docs/WINDOW_HOURS_PLAN.md`). What is released kept its numbers; this
work's took the next: `docs/ARCHITECTURE.md` v18 (was v16), `docs/SHARED_CALENDAR_SPEC.md` v21
(was v19), `docs/CONVERSATIONAL_ARCHITECTURE.md` v24 (was v22), `docs/FRONTEND_ARCHITECTURE.md`
v27 to v31 and decisions 204 to 216 (were v24 to v28 and 195 to 207), `docs/FRONTEND_WALK.md`
v10 to v15, sections 12 to 17 and checks 171 to 219 (were v6 to v11, 11 to 16 and 157 to 205),
and this work's deployment record is `docs/RUNBOOK.md` section 5.11. The smoke test has 65
checks at `on` and 62 at `off` and `domain` (the calendar journey's four more). Checked on the
merged code: the root `verify`, the front end's journeys (101), the local smoke test (62 PASS,
3 SKIP), the walk where the two features meet, and the paid evaluation, 67 of 67, 53.00 US cents
(`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3), which stands for the run owed before step
m9 unless the assistant changes again. Three tests of this work were fixed on the way: the
evaluation's accounts (`backend/tests/eval/week.ts`) and `mail.test.ts`'s settings, left behind
by step m8, and `calendar.test.ts`'s new block, written for the old `POST /users`.

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
   v2.5.0, as the Administrator: the Users screen, "Delete" on every User
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

- in "My details", the Administrator's four facts (M12); the daily mail's hour waits for step
  m10, since `GET` and `PUT /mail/settings` answer `503 mail_unavailable` at the stage `domain`;
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
signed in with its own password; and, with a second test User, "Choose your password" left open
more than 3 minutes says "This took too long. Please sign in again." and leads back to the
sign-in, the username kept (`docs/FRONTEND_WALK.md` check 216).

**As done (2026-11-25 and 2026-11-26).** The record is `docs/RUNBOOK.md` section 5.11; in short:

- **The regression** on `b7c71c1` all green but `docs/FRONTEND_WALK.md` check 209, a field given
  the keyboard while its form was hidden, fixed in `ab19f6e` with its unit test (and check 132's
  sentence corrected).
- **Read-only:** the region, yes; O6, `allowed` (`docs/EMAIL_ARCHITECTURE.md` section 21 answers
  it). The change set at `on`: the pool "Modify", no re-creation, no replacement, nothing removed;
  deleted, never executed.
- **The Users deleted**; `MailStage=domain` committed as `e756e17` and pushed; the deploy (66
  changes, no replacement, no removal), the smoke test 62 PASS, the logs clean but the expected
  503s, the page released with its four checks PASS.
- **The operator:** "My details"; the test User and check 216 yes; the four DNS records, the
  domain verified within the hour; the bounces' subscription confirmed; production access asked,
  then AWS's questions answered in its support case, the answer pending.
- **Three findings, the documents corrected:** the daily mail's hour cannot be set at `domain`
  (its routes answer 503, as the architecture says), moved to step m10; the 5xx alarm goes off at
  `domain` for each expected 503 of an e-mail route; the console's form for production access has
  no use case, which AWS asks for in a support case. `docs/RUNBOOK.md` section 3.3 says how.

Step m10's part A waits only for the domain, verified at step m9; its part B waits for AWS's production access.

### Step m10 — Cloud, stage `on`, and the release v3.0.0 (each command on the operator's explicit instruction)

Built in two parts, each with its brief, its check and its "As done" note, as step m8 was: **A**,
the stage `on` in SES's sandbox, every recipient an address verified in SES, and the release
`v3.0.0`; **B**, once AWS grants production access, the Users invited again and the documents
closed. The cut (the Product Owner's decision, 2026-11-28, brief
`prompts/mail-m10-split-step-m10.md`): AWS's answer can take days, and everything but mailing an
address that is not verified can be deployed and proven before it
(`docs/EMAIL_ARCHITECTURE.md` section 13.2).

**What the sandbox allows at `on`**, from AWS's documentation read on 2026-11-28 (the pages are
listed in `docs/EMAIL_ARCHITECTURE.md` section 22.2):

- **Who receives mail.** Only addresses and domains verified in SES, and SES's mailbox
  simulator; at most 200 mails in 24 hours, 1 a second (SES guide, "Request production access
  (Moving out of the Amazon SES sandbox)").
- **The Reply-To.** The identities to verify are those used as "From", "Source", "Sender" or
  "Return-Path" (the same page), and the sandbox limits only where mail goes. No page says a
  Reply-To must be verified: ours, the alarm address, needs nothing.
- **Cognito's invitation** (`EmailSendingAccount: DEVELOPER`) obeys the same rule: in the
  sandbox it reaches only verified addresses and the simulator, and "Amazon Cognito can't send
  messages to your users' email addresses" (Cognito guide, "Email settings for Amazon Cognito
  user pools", step 2).
- **A User created for an address that is not verified: not said.** `AdminCreateUser`'s API
  reference lists `CodeDeliveryFailureException` among its errors, but no page says whether the
  sandbox's refusal raises it or whether the account is kept. What our code would do in each
  case: if `AdminCreateUser` throws, `createUser.ts` answers `500 internal_error` and logs at
  level `error`, so the API's 5xx alarm goes off; an account Cognito kept would be in no group,
  so the Users screen would not list it and the same username would answer `409 user_exists`.
  If it succeeds and the mail is dropped, the route answers `201 invited` and no mail comes. A
  mail asked from the mailer for such an address is refused by SES, and the mailer's error alarm
  counts it (`backend/src/handlers/mailer.ts`). Hence part A's rule: **no User is created, and no
  mail asked, for an address that is not verified**.
- **How an address is verified.** In the SES console, region Europe (Stockholm): Identities,
  "Create identity", "Email address", the address typed, "Create identity"; within five minutes a
  mail from `no-reply-aws@amazon.com` or `no-reply-aws@verification.amazonses.com`, whose link
  (valid 24 hours, "Resend" on the identity's page) makes the identity Verified (SES guide,
  "Creating and verifying identities in Amazon SES"). Not the "Get started" wizard
  (`docs/RUNBOOK.md` section 3.3).
- **After production access** a recipient needs no identity, so an address identity needs
  nothing more; it can be deleted on its own, and the domain's identity is untouched, since a
  verified address overrides the domain's settings only for an address of that domain, and the
  recipients' addresses are not at it (SES guides "Creating and verifying identities in Amazon
  SES" and "Delete an identity using the SES console"). So part B keeps them or deletes them at
  the operator's choice: they are the operator's own addresses, cost nothing, and spare a new
  verification should mail be tried again in a sandbox (another stack or region).
- **The mailer's role in the sandbox** (found at part A's first smoke test, 2026-11-28). SES
  refused the mailer's mail on demand to a verified address with `AccessDeniedException`, three
  times (the call and Lambda's two retries), while the smoke test's two invitations, sent by
  Cognito with its own role, arrived; a mail on demand by a test User whose address is SES's
  simulator, which is no identity of the account, was `sent`. So in the sandbox SES checks the
  sender's role against the recipient when the recipient is a verified identity, and a role that
  names the domain alone reaches no real mailbox. SES's IAM guide says only that the sandbox's
  restrictions "prevent the implementation of some of these policies" ("Identity and access
  management in Amazon SES", https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html).
  **Decided** (the Product Owner, 2026-11-28): between parts A and B the mailer's `ses:SendEmail`
  names every identity of the account, `identity/*`, with the condition `ses:FromAddress` equal
  to the stack's address, so that it still sends only as `noreply@<domain>`: the one exception to
  the root `CLAUDE.md`'s wildcard rule, written in that rule. Part B, out of the sandbox, puts the
  domain's identity back.
- **The Excel file arrived broken** (found at part A's second smoke test, 2026-11-28). The mail on
  demand reached the mailbox, but its `.xlsx` did not open: the file was about half as large
  again as the one the mailer makes, and every byte that is not text had become the UTF-8
  replacement character, as a binary file sent as 7-bit text does. `backend/src/lib/ses.ts` gave
  no `ContentTransferEncoding`, which SES's reference allows as `BASE64`, `QUOTED_PRINTABLE` or
  `SEVEN_BIT` without saying which applies when none is given ("Attachment", Amazon SES API v2
  reference, https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_Attachment.html). It now
  sends `BASE64`. The fake mail reads the SDK's base64 itself, so no local test could see it; the
  operator's look at the file is the proof.
- **The smoke test's mail line** read the mailer's count with `--query 'length(events)'`, which
  the AWS CLI prints once per page: two lines (`1` and `0`) where the script waited for one
  number, so it failed though the mail was `sent`. `backend/scripts/smoke.sh` adds the lines up.

#### Part A — the stage `on` in the sandbox, and the release v3.0.0

**Starts when** SES shows the domain verified, read-only:
`aws sesv2 get-email-identity --email-identity enricopiccinin.com` with a `--query` of
`VerificationStatus` and `DkimAttributes.Status`, both `SUCCESS`. It does not wait for
production access.

1. **Operator: every address that will receive a mail in part A verified in SES** (the console's
   steps above):
   - your own address, for the smoke test's invitation and the throw-away User of point 6;
   - the Administrator's address in "My details", for the smoke test's mail on demand and the
     daily mail;
   - the address of each test User that will ask for a mail.

   One address may serve several. The session checks it read-only and prints no address:
   `aws sesv2 list-email-identities --query "EmailIdentities[?IdentityType=='EMAIL_ADDRESS'].VerificationStatus"`,
   one state per address identity, each `SUCCESS`; the operator compares the console's list with
   "My details" and the test Users' addresses by eye. No address goes into a command's argument,
   a log, a document or a message.
2. **The Users, before the deploy.** The pool holds `admin`, `miri` and `enri` (step m9). A test
   User whose address is not verified is deleted in the Users screen, or kept and never used for
   a mail. No other User is created until part B: only the smoke test's (the simulator and your
   own address) and the throw-away User of point 6 (your own).
3. **The deploy.** `MailStage=on` in `backend/samconfig.toml`, committed, and pushed if the
   operator decides so; the gate's `verify` (F12); `npm run deploy -w backend`. The change set
   is read before "y". It should hold what step m9's change set at `on` showed beyond the stage
   `domain` (`docs/RUNBOOK.md` section 5.11): the pool Modify, every detail
   `RequiresRecreation` `Never`; the mailer, its role, its log group and its error alarm, the
   hourly schedule and its role, Add; the routes that start the mailer Modify (their
   `MAILER_FUNCTION`) with their invoke permission. No Remove, no Replacement of the tables or the
   pool. Anything else: stop and say so.
4. **The page:** `npm run deploy -w frontend` only if `frontend/` or `shared/` changed after the
   page deployed in step m9 (`e756e17`); the gate again if the commit changed.
5. **The smoke test** against `shared-calendar-api`, your own verified address typed when asked:
   65 PASS (`docs/RUNBOOK.md` section 2.4); its invitation, sent and resent, in your mailbox; its
   mail on demand in the Administrator's. Then the log search from the deploy on, by field only
   (`level`, `status`, `route`), as in step m9. A failure that names SES's rate (1 mail a second
   in the sandbox) is said as such, not fixed by hand. The first run, with the role on the domain
   alone, failed its mail line (the finding above); the run after the role's widening
   (`identity/*`, deployed as point 3 was) is the one that counts.
6. **Operator, the look at the deployed page with real mails**, every recipient verified:
   - the smoke's invitation: from `noreply@<domain>`, Reply-To the alarm address, not in spam;
   - a throw-away User created in the page with your own address, the last look checked: its
     invitation; "Resend invitation" while it is invited, a second mail, the first password now
     opening nothing; the first sign-in with the second, "Choose your password", a password
     chosen, `active` in the list; then the User deleted;
   - "E-mail…" in the week, as the Administrator and as a test User whose address is verified:
     each mail arrives, its Excel file opened;
   - "Settings": the daily mail's hour, set to the next whole hour so as not to wait a day; at
     that hour the daily mail with its two files; then the hour the Administrator wants.
7. **The alarms.** At `on` the e-mail routes no longer answer `503`, so the API's 5xx alarm
   should stop going off for them (at `domain` it went off for each, step m9's "As done" note): one
   now is a fault, looked at in the access log. The mailer's error alarm is watched: a mail asked
   for an address that is not verified would show there.
8. **The documents of part A:** section 4's row m10 A, this part's "As done" note. Then the tag
   `v3.0.0` on the operator's word, at the commit of the record, as for `v2.4.0`.

**Operator, in plain words (A):** verify each address that will get a mail in the SES console and
click the link in AWS's mail; delete or set aside a test User whose address is not verified; say
"y" to the deploy once its change set is read; type your address for the smoke test and look in
your mailbox; try the page as point 6 says; say when to tag.

**Check (A):** the gate's `verify` before each deploy; the smoke test 65 PASS in the cloud; the
logs clean; the operator's look all yes; the tag `v3.0.0`. With it the full regression ends
(section 5.2).

#### Part B — out of the sandbox: the Users invited again, the documents closed

**Starts when** `aws sesv2 get-account` shows `ProductionAccessEnabled` true, read-only, with a
`--query` of `ProductionAccessEnabled` and `SendQuota` only (the whole answer holds the contact
addresses). The new daily quota and rate are written in `docs/RUNBOOK.md` section 5.11.

1. **The mailer's role back to the domain alone:** in `backend/template.yaml` its
   `ses:SendEmail` names the domain's identity and the configuration set again, the condition
   removed; the root `CLAUDE.md`'s wildcard rule without its exception. Committed; the gate's
   `verify`; `npm run deploy -w backend`, its change set the mailer's role alone, Modify; the
   smoke test again, 65 PASS, now that a mail to any address needs no identity (section 5.2).
   AWS does not say whether SES, out of the sandbox, still checks the role against a recipient
   that is a verified identity: if the mail line fails with `AccessDeniedException`, the address
   identity of that recipient is deleted, which point 2 allows, and the mail asked again.
2. **Operator:**
   - the Users of step m9's list created again in the page, each with their four facts and the
     last look checked; each receives their invitation; their future appointments booked again
     by hand, if wanted. A bounce report, should one come: correct the address, "Resend
     invitation" (`docs/RUNBOOK.md` section 3.3);
   - the test Users `miri` and `enri` deleted in the Users screen;
   - the address identities verified for part A: kept, or deleted if no longer wanted, in the
     SES console (Identities, the address, "Delete"); nothing depends on them any more. The
     domain's identity is never deleted: the stack owns it, and it stays `SUCCESS`;
   - the privacy notice updated with the new data and the Excel files, outside the system
     (`docs/EMAIL_ARCHITECTURE.md` section 12.3).
3. **The documents closed:** section 4's row m10 B; this part's "As done" note; this plan marked
   finished (its version line).

**Operator, in plain words (B):** say when AWS's answer has come; say "y" to the deploy that
narrows the mailer's role, and run the smoke test again; create the people again in the
page and tell them to look for the invitation, spam folder included; book their appointments
again if wanted; delete the two test Users; keep or delete the verified addresses, as you like;
update the privacy notice.

**Check (B):** **the wildcard gone**: `grep -rn 'identity/\*' backend/template.yaml CLAUDE.md docs/ARCHITECTURE.md`
finds nothing, the root `CLAUDE.md`'s rule reads "IAM policies never use a wildcard action or
resource" with no exception, and the deployed mailer's role names the domain's identity alone
(`aws iam get-role-policy` on it, read-only); the smoke test 65 PASS after that deploy; the
operator reports the Users invited and their mails received; `miri` and
`enri` gone; the domain's identity still `SUCCESS`; root `typecheck` and `lint` green; the documents closed.
Then the merge of `multilanguage` may begin, with its own brief.

## 7. The operator's tasks, in one list

| Step | What | Where |
|---|---|---|
| m1, m6 | Review the decisions of the step (the Excel library; the evaluation's cost) | The review |
| m6 | Start the local stack with the real Anthropic key for the paid evaluation, put the fake back | Own terminal |
| m9 | Delete every User, just before the deploy; note who needs an account again, and their future appointments | The deployed page |
| m9 | The Administrator's four facts | The deployed page |
| m9 | Type the test User's e-mail and temporary password (F15); its first sign-in, its own password chosen; the User's side tried | Own terminal, the deployed page |
| m9 | Three DKIM records and one DMARC record | The domain's DNS provider |
| m9 | Confirm the bounce topic's subscription | The alarm mailbox |
| m9 | Request SES production access | The SES console |
| m10 A | Verify in SES every address that will receive a mail in part A (own, the Administrator's, a test User's) | The SES console, own mailbox |
| m10 A | Delete, or keep away from mail, a test User whose address is not verified | The deployed page |
| m10 A | Type own address for the smoke test; its invitation | Own terminal, own mailbox |
| m10 A | The look with real mails: a throw-away User, its resend and first sign-in; "E-mail…" as the Administrator and as a test User; the daily mail's hour and its mail | The deployed page, own mailbox |
| m10 A | The word for the tag `v3.0.0` | The review |
| m10 B | "y" to the deploy that narrows the mailer's role; the smoke test again | Own terminal |
| m10 B | The Users invited again (step m9's list), their appointments booked again if wanted | The deployed page |
| m10 B | The test Users `miri` and `enri` deleted; the verified addresses kept or deleted, as the operator prefers | The deployed page, the SES console |
| m10 B | The privacy notice updated with the new data and the Excel files (`docs/EMAIL_ARCHITECTURE.md` section 12.3) | Outside the system |

## 8. Out of this plan

- Notifications (E6, `docs/EMAIL_ARCHITECTURE.md` section 19).
- The greeting by first name, in the invitation (O3) or by the assistant (O4).
- The GDPR consent page (section 5.2 of that document says where it plugs in).
- Receiving mail at the domain (section 8.3 of that document).
- A forgot-password flow by e-mail.
