## Before opening the new session (operator, in your own terminal)

```bash
nvm use
git status                                                             # clean: step m8 (b3181b3) and the merge of slot-5min (0321402) committed
npm run local:down -w backend                                          # a fresh stack for the regression
DYNAMODB_PORT=8002 npm run local:up -w backend                         # no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # a terminal of its own
npm run local:lambda -w backend                                        # a third terminal
aws sso login --profile shared-calendar-admin --use-device-code
export AWS_PROFILE=shared-calendar-admin
aws sts get-caller-identity --profile shared-calendar-admin            # the AdministratorAccess role
```

- **This step changes the cloud.** Each command that changes it is run **by me, in my own
  terminal**, after a go I give in the session for that command alone. The session runs only
  the local checks, read-only `aws` commands and curl without credentials, and writes the
  documents.
- **To decide before the session, by me** (the session asks if I have not said):
  1. whether the commits since `origin` (steps m1 to m8, the slot and window work) are
     **pushed before the deploy**, so that the commit the cloud runs is on `origin`, as for step
     c15;
  2. **the list of who needs an account again** after the Users are deleted (point 6), kept
     outside the system: name, e-mail, postal address, their future appointments.

## Brief

Implement plan step m9, "Cloud, stage `domain`" (`docs/EMAIL_PLAN.md`), following CLAUDE.md's
working rhythm: its checks, an honest report, a stop at each pause.

After this step the stack `shared-calendar-api` runs the e-mail code at `MailStage=domain`: the
SES identity of the domain exists and waits for its DNS records, the configuration set and the
bounces' topic exist, no mail is sent, and `POST /users`, its resend and the mail routes answer
`503 mail_unavailable`. The page `shared-calendar-web` is the new one, which answers Cognito's
challenge and says "E-mail is not available yet". The deployed calendar has the Administrator
and my test User only. I have added the DNS records, confirmed the bounces' subscription and
asked AWS for production access. Step m10 waits for AWS's answer and the domain's verification.

Read these in full first:
- `CLAUDE.md`: "Working rhythm" (**the closing message is short**), "Hard rules from the
  design", **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md` and `frontend/CLAUDE.md`.
- `docs/EMAIL_PLAN.md`: **step m9**, step m8's "As done" note (what is ready), section 5.2
  (the full regression), O5, O6, F2, F13, F15; step m10, to see what this step must not take.
- `docs/EMAIL_ARCHITECTURE.md`: sections 8 (the sender, DKIM, DMARC, bounces, **8.5 the
  sandbox and the request's use case**), **13.2** (the stages), 13.3, 5.4 (the test User), 21
  (what the operator decides and does).
- `docs/ARCHITECTURE.md` sections 9.2 (the stages' table) and 9.3 (the smoke test).
- `docs/RUNBOOK.md`: **section 2** (the deploy, steps 1 to 6), **2.4** (the smoke test at
  `domain`: 62 lines), **3.3** (the stages' draft, which this step runs and corrects), section
  5 (how a deployment is recorded: 5.6 to 5.8 are the pattern), `docs/CUSTOM_DOMAIN.md`.
- `docs/COMMANDS.md` section 6 (`test-user cloud`, `smoke`, `deploy`).
- `backend/template.yaml` (the conditions `MailDomainStage` and `MailOn`, the SES resources,
  the pool's `EmailConfiguration`) and `backend/samconfig.toml` (its `parameter_overrides`
  line already holds `MailDomain` and `PageAddress`).

## Where we are (2026-11-25)

- Step m8 is committed in three parts (`254b3f8`, `223a49a`, `b3181b3`), pushed; the merge of
  `slot-5min` on top of it (`0321402`, `docs/EMAIL_PLAN.md` the note before step m9) is not. Nothing of
  the e-mail work is deployed: the cloud runs the API and page of v2.5.0.
- `backend/samconfig.toml` says `MailStage="off"`. The local stack runs at `on`.
- The smoke test reads `MailStage` from the stack; at `domain` it has 62 lines and asks no
  address. It was run locally at `on` only.
- O6 (may the profile create Cognito's service-linked role) is still open. Nobody has made a
  change set of the pool with `MailStage=on`.
- The deployed pool holds Users created with a permanent password and no facts.

## The step

In this order. **Each point that changes the cloud waits for my go**; the session proposes the
exact command and I run it.

1. **The full regression** (`docs/EMAIL_PLAN.md` section 5.2) on the commit that ships:
   `DYNAMODB_PORT=8002 npm run verify`, `RUN_INTEGRATION=1 npm run test:integration -w
   frontend`, the whole of `docs/FRONTEND_WALK.md` on a restarted, seeded stack (I restart it
   on your word: `local:down`, `local:up`, `local:api`, `local:lambda`, then `seed:local`), and
   `npm run smoke -w backend -- local`. Report every failure; fix only on my go.
2. **The region, read-only.** Confirm in AWS's Cognito guide ("Email settings for Amazon
   Cognito user pools", the table of the SES Regions each Cognito Region may use) that a pool
   in `eu-north-1` may send through an SES identity in `eu-north-1`. If not, stop: the
   template's `EmailConfiguration` would be refused at `on`.
3. **O6, read-only.** Whether the role behind `shared-calendar-admin` may
   `iam:CreateServiceLinkedRole` for `cognito-idp.amazonaws.com`: `aws iam
   simulate-principal-policy` on that role, which changes nothing. Written in
   `docs/EMAIL_ARCHITECTURE.md`'s open points as answered.
4. **The pool's update, confirmed (my go to create the change set, my go to delete it).**
   After `npm run build -w backend`, a change set of `shared-calendar-api` with every parameter
   of `samconfig.toml` and `MailStage=on`, created without executing it. The session reads it
   (`aws cloudformation describe-change-set`) and lists it: the user pool must be **Modify**,
   never Replacement; nothing else a Replacement; no Remove of `UserPool`, `MessagesTable`,
   `CalendarTable`, `AssistantTable`, `MailTable` or `AdminUser`. Then the change set is deleted
   and nothing was executed. A Replacement of the pool is a stop: the plan changes, not the
   template in a hurry.
5. **`MailStage=domain`** in `backend/samconfig.toml`, its comment in line; committed (on my
   go). Pushed, if I decided so.
6. **Operator: the Users deleted**, the last thing before the deploy. In the deployed page
   (v2.5.0), as the Administrator, "Delete" on every User; no script, no `aws` command. The
   session says once, in plain words, what a deletion does (`docs/EMAIL_PLAN.md` step m9, point
   4) and then waits. Checked: the Users screen lists no User.
7. **The API's deploy** (my go): the gate's `verify` on that commit, then `npm run deploy -w
   backend`. The change set read before `y`: what point 4 found, at `domain` instead of `on`
   (the SES identity, the configuration set, its destination, the topic and its policy, the
   pool unchanged or Modify, the new functions and routes of steps m1 to m8; no Remove, no
   Replace of the tables, the pool or the Administrator).
8. **The smoke test** in the cloud (my go): `npm run smoke -w backend -- shared-calendar-api`,
   62 PASS at `domain`. Then a read-only search of the new functions' log groups for errors
   since the deploy (fields only, never `@message`).
9. **The page's deploy** (my go): `npm run deploy -w frontend`, its four checks PASS (F13).
10. **Operator, on the deployed page and in the terminal** (the session lists them once, in
    plain words, and waits for my report):
    - "My details": the Administrator's four facts; the settings: the daily mail's hour;
    - the test User: `npm run test-user -w backend -- cloud <username>`, my own address and a
      temporary password typed; its first sign-in on the page, "Choose your password", a
      password chosen; the User's side: the week, a booking, a cancellation, the assistant;
      "E-mail…" answers "E-mail is not available yet";
    - a second test User left at "Choose your password" for more than 3 minutes: "This took too
      long. Please sign in again.", back at the sign-in with the username kept
      (`docs/FRONTEND_WALK.md` check 216); then deleted;
    - at the domain's DNS provider: the three DKIM records of the stack's outputs
      `MailDkimRecord1` to `3` (CNAME), and DMARC (TXT `_dmarc.<domain>`, `v=DMARC1; p=none;`);
    - in the alarm mailbox: "Confirm subscription" for the bounces' topic;
    - in the SES console, `eu-north-1`: the request for production access, with the use case of
      `docs/EMAIL_ARCHITECTURE.md` section 8.5.
11. **Read-only checks after my report**: the stack's outputs show the three DKIM records; the
    topic's subscription is confirmed (`aws sns list-subscriptions-by-topic`, the endpoint's
    address never printed); the identity's state (`aws sesv2 get-email-identity`: pending or
    verified, DKIM status).
12. **The documents** (`docs/EMAIL_PLAN.md` section 4, row m9): `docs/RUNBOOK.md` section 3.3
    corrected by what really happened, and section 5.11 opened, the deployment's record (the
    commit, the change sets, the smoke test's lines, O6, the region, what is still waited
    for); `docs/EMAIL_ARCHITECTURE.md` O6 answered; `docs/ARCHITECTURE.md` status line
    (deployed at `domain`); the plan's "As done" note under step m9 and its version line.

Not in this step: `MailStage=on`, the invitations, the release v3.0.0 (step m10); re-creating
the Users (step m10, point 6).

## How we work in this step

- **Messages to me are short.** At the end of a point and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. Questions one at a time.
- **The pauses:** a failure of the regression; point 2 or 3 answered "no"; the change set of
  point 4 or 7 showing a Replacement or a Remove of anything that holds data; before each go; a
  smoke line FAIL; anything in the cloud that differs from `docs/RUNBOOK.md` section 3.3; two
  documents that disagree.
- **Each go is for one command.** A go for the deploy is not a go for the smoke test. When a
  command fails, I am told what happened and nothing is retried without a new go.
- **AWS in the session: read-only only** (`describe-*`, `get-*`, `list-*`,
  `simulate-principal-policy`, `filter-log-events` with fields only). Never `sam deploy`,
  `npm run deploy`, `npm run smoke`, `npm run test-user`, a change set's creation or deletion,
  or any `aws` command that creates, changes or deletes, from the session.
- **Recorded output**: I record with `script -q -c "…" /tmp/<name>.txt`; the session reads
  those files with commands that print the lines needed, never a whole file or the
  neighbourhood of a prompt.
- **Ask me before you stop or restart the local stack**: I run it in my own terminals.
- **Hard rules that bear on this step:** no token, password or e-mail address in a log, a
  document, an argument or a message to me; no account id or e-mail address in a document (the
  repository is public; the domain and the page's address are already in it); comments follow
  CLAUDE.md "Comments"; lint must pass.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked. Do not start step m10.

## Acceptance (`docs/EMAIL_PLAN.md` step m9)

- The full regression green on the commit that ships (or each failure reported and settled).
- The region and O6 answered from AWS's sources; the change set at `on` showing the pool as
  Modify, created and deleted, never executed.
- The deploy's change set as worked out beforehand: no Remove, no Replace of what holds data.
- The smoke test in the cloud: **62 PASS** at `domain`; no error in the new log groups.
- The page released, its four checks PASS.
- My report: the Administrator's facts, the test User signed in with its own password, check
  202 seen, the records added, the subscription confirmed, the request sent.
- The stack's outputs show the DKIM records; the subscription confirmed.
- `docs/RUNBOOK.md` sections 3.3 and 5.11, the plan's "As done" note, `npm run typecheck` and
  `npm run lint` green. Then the short closing message, and suggest the commit.
