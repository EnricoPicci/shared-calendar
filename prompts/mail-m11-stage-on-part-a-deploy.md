## Before opening the new session (operator, in your own terminal)

```bash
nvm use
git status                                                             # clean: the split of step m10 (d1d66cc) committed
DYNAMODB_PORT=8002 npm run local:up -w backend                         # the emulators, for the gate's verify; no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # a terminal of its own
npm run local:lambda -w backend                                        # a third terminal
aws sso login --profile shared-calendar-admin --use-device-code
export AWS_PROFILE=shared-calendar-admin
aws sts get-caller-identity --profile shared-calendar-admin            # the AdministratorAccess role
```

- **This step changes the cloud and sends real mail.** Each command that changes the cloud is run
  **by me, in my own terminal**, after a go I give in the session for that command alone. The
  session runs only the local checks, read-only `aws` commands and curl without credentials, and
  writes the documents.
- **To decide before the session, by me** (the session asks if I have not said):
  1. whether `d1d66cc` and the commit of `MailStage=on` are **pushed before the deploy**, so that
     the commit the cloud runs is on `origin`, as in step m9;
  2. **which test User, `miri` or `enri`, asks for a mail** in point 7, and whether the other is
     deleted now or kept away from mail until part B.

## Brief

Implement part A of plan step m10, "Cloud, stage `on`, and the release v3.0.0"
(`docs/EMAIL_PLAN.md`), following CLAUDE.md's working rhythm: its checks, an honest report, a
stop at each pause.

After this part the stack `shared-calendar-api` runs at `MailStage=on` while the SES account is
still in the sandbox: the pool sends its invitations through SES, the mailer and its hourly timer
exist, `POST /users`, its resend and the mail routes work. Every mail goes to an address I have
verified in SES, or to SES's mailbox simulator. The smoke test passes in the cloud, I have seen
the real mails, and the release is tagged `v3.0.0`. Part B (the Users invited again, the documents
closed) waits for AWS's production access and has its own brief.

Read these in full first:
- `CLAUDE.md`: "Working rhythm" (**the closing message is short**), "Hard rules from the
  design", **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md`.
- `docs/EMAIL_PLAN.md`: **step m10, its findings on the sandbox and part A**; part B, to see what
  this part must not take; step m9 and its "As done" note; section 5.2 (the regression's cloud
  end is this part's check); F12 (the gate's stamp).
- `docs/EMAIL_ARCHITECTURE.md`: sections **8.5** (the sandbox), **13.2** (the stage `on` in the
  sandbox), 13.3 (the smoke test), 5.3 and 5.3.1 (the resend, a wrong address), 8.2 and 8.4 (the
  From, the Reply-To, bounces), **22.2** (AWS's pages on the sandbox).
- `docs/ARCHITECTURE.md` sections 9.2 (the stages' table: what `on` adds) and 9.3.
- `docs/RUNBOOK.md`: **section 2** (the deploy, steps 1 to 6), **2.4** (the smoke test at `on`:
  65 lines), **3.3 "At `on`, part A"** (the draft this part runs and corrects), **5.11** (the
  record of stage `domain`, which this part continues; its change set at `on`).
- `docs/COMMANDS.md` section 6 (`smoke`, `deploy`).
- `backend/samconfig.toml` (its `parameter_overrides` line and the trap its comment describes),
  `backend/template.yaml` (the condition `MailOn`), `backend/scripts/smoke.sh`'s header.

## Where we are (2026-11-28)

- `main` at `d1d66cc`, one commit ahead of `origin` (`a2b4774`). The cloud runs
  `MailStage=domain` since `e756e17`, API and page; no file of `backend/`, `frontend/` or
  `shared/` changed since, so **the page is not deployed again** unless that changes.
- SES: the domain `enricopiccinin.com` verified, DKIM `SUCCESS`; the bounces' subscription
  confirmed; the account in the sandbox, production access asked, AWS's answer pending.
- The cloud pool holds `admin` and the test Users `miri` and `enri`, made with
  `test-user cloud` with my own address.
- Step m9's change set at `on` (76 changes, the pool Modify, `RequiresRecreation` `Never`, no
  Remove) was read against the stage `off`; from `domain` fewer changes are expected, since the
  SES identity, the configuration set, the topic and the table `mail` exist.
- No address identity is verified in SES yet, as far as the documents know.

## The part

In this order. **Each point that changes the cloud waits for my go**; the session proposes the
exact command and I run it.

1. **The start, read-only.** `aws sesv2 get-email-identity --email-identity enricopiccinin.com`
   with a `--query` of `VerificationStatus` and `DkimAttributes.Status`: both `SUCCESS`. Also
   `aws sesv2 get-account` with a `--query` of `ProductionAccessEnabled` and `SendQuota` only
   (the whole answer holds contact addresses), to record the sandbox's state at the start.
2. **Operator: the addresses verified in SES.** The session lists once, in plain words, the
   console's steps (`docs/RUNBOOK.md` section 3.3, part A, step 2) and the addresses to verify:
   my own (the smoke test's invitation, the throw-away User), the Administrator's in "My
   details" (the smoke test's mail on demand, the daily mail), the address of the test User that
   asks for a mail. Then it waits for my report. Checked read-only, **printing no address**:
   `aws sesv2 list-email-identities --query "EmailIdentities[?IdentityType=='EMAIL_ADDRESS'].VerificationStatus"`,
   each `SUCCESS`; I compare the console's list with the addresses by eye.
3. **Operator: the test Users.** The one whose address is not verified, or that I chose not to
   use, deleted in the Users screen or kept away from mail (my decision 2). No other User is
   created until part B.
4. **`MailStage=on`** in `backend/samconfig.toml`, its comment in line; `npm run typecheck` and
   `npm run lint`; committed (on my go). Pushed, if I decided so.
5. **The API's deploy** (my go): the gate's `verify` on that commit (`DYNAMODB_PORT=8002 npm run
   verify -w backend`, with `local:api` and `local:lambda` running), then `npm run deploy -w
   backend`. The change set is read before `y`, against `docs/EMAIL_PLAN.md` step m10 part A,
   point 3: the pool Modify, every detail `RequiresRecreation` `Never`; Add for the mailer, its
   role, log group and error alarm, the hourly schedule and its role; Modify for the routes that
   start the mailer, with their invoke permission; **no Remove, no Replacement of the tables, the
   pool, the Administrator or the SES identity**. Anything else is a stop.
6. **The smoke test** in the cloud (my go): `npm run smoke -w backend -- shared-calendar-api`, my
   own verified address typed when asked: **65 PASS** at `on`. Its invitation and its resend in
   my mailbox; its mail on demand in the Administrator's. Then a read-only search of the log
   groups since the deploy, by fields only (`level`, `status`, `route`), never `@message`: the
   mailer's line `sent`, no error but what the smoke test expects. A failure that names SES's
   rate (1 mail a second in the sandbox) is said as such and not worked around.
7. **Operator, the look at the deployed page with real mails** (the session lists them once and
   waits for my report), every recipient verified:
   - the smoke's invitation: from `noreply@<domain>`, Reply-To the alarm address, not in spam;
   - a throw-away User created in the page with my own address, the last look checked: its
     invitation; "Resend invitation" while it is invited; the first sign-in with the second
     temporary password, "Choose your password", a password chosen, `active` in the list; then the
     User deleted;
   - "E-mail…" in the week, as the Administrator and as the test User of my decision 2: each mail
     arrives, its Excel file opened;
   - "Settings": the daily mail's hour set to the next whole hour; at that hour the daily mail
     with its two files; then the hour I want.
8. **The alarms, read-only.** The API's 5xx alarm and the mailer's error alarm
   (`aws cloudwatch describe-alarms` with a `--query` of the names, states and last change):
   the 5xx alarm should no longer go off for the e-mail routes; a change to ALARM is looked at in
   the access log, by field.
9. **The documents** (`docs/EMAIL_PLAN.md` section 4, row m10 A): `docs/RUNBOOK.md` section 3.3
   "At `on`, part A" corrected by what really happened, section 5.11 continued with this part's
   record (the commit, the change set, the smoke test's lines, the identities' count, the mails
   seen, the alarms, the cost); `README.md` "Versions": `v3.0.0`, "the record's commit after
   `<deployed commit>`, whose code was deployed", as for `v2.4.0`; the plan's "As done" note for
   part A and its version line. `npm run typecheck` and `npm run lint` green.
10. **The tag `v3.0.0`** on the record's commit, created and pushed only on my word.

Not in this part: the Users of step m9's list created again, the deletion of `miri` and `enri`
unless I decide it in point 3, the address identities' fate, the privacy notice, the documents
of row m10 B (`docs/EMAIL_ARCHITECTURE.md` a record, `docs/ARCHITECTURE.md` v18 closed, the root
`CLAUDE.md`), the plan marked finished: all part B.

## How we work in this part

- **Messages to me are short.** At the end of a point and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. Questions one at a time.
- **The pauses:** the domain not `SUCCESS`; an address identity not `SUCCESS`; before each go;
  the change set showing a Remove or a Replacement of anything that holds data, or the pool not
  Modify with `Never`; a smoke line FAIL; a mail that does not arrive or lands in spam; an alarm
  in ALARM that the expected answers do not explain; anything in the cloud that differs from
  `docs/RUNBOOK.md` section 3.3; two documents that disagree.
- **Each go is for one command.** A go for the deploy is not a go for the smoke test. When a
  command fails, I am told what happened and nothing is retried without a new go.
- **AWS in the session: read-only only** (`describe-*`, `get-*`, `list-*`, `filter-log-events`
  with fields only). Never `sam deploy`, `npm run deploy`, `npm run smoke`, `npm run test-user`,
  a change set's creation or deletion, an identity's creation or deletion, or any `aws` command
  that creates, changes or deletes, from the session.
- **Recorded output**: I record with `script -q /tmp/<name>.txt <command>`; the session reads
  those files with commands that print the lines needed, never a whole file or the
  neighbourhood of a prompt, and never a line that holds an address.
- **Ask me before you stop or restart the local stack**: I run it in my own terminals.
- **Hard rules that bear on this part:** no token, password, account id or e-mail address in a
  command's argument, a log, a document or a message to me (the repository is public; the domain
  and the page's address are already in it); comments follow CLAUDE.md "Comments"; lint must
  pass.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked. Do not start part B.

## Acceptance (`docs/EMAIL_PLAN.md` step m10, check A)

- The domain `SUCCESS`; every address that received a mail verified, checked without printing
  one.
- The gate's `verify` green on the commit that ships; the deploy's change set as worked out
  beforehand: the pool Modify, no Remove, no Replace of what holds data.
- The smoke test in the cloud: **65 PASS** at `on`; the mailer's line `sent`; no unexpected
  error in the logs.
- My report: the smoke's invitation, the throw-away User's invitation, resend and first sign-in,
  "E-mail…" as the Administrator and as a test User with its Excel file, the daily mail with its
  two files: all yes.
- The alarms as expected.
- `docs/RUNBOOK.md` sections 3.3 and 5.11, `README.md` "Versions", the plan's "As done" note,
  `npm run typecheck` and `npm run lint` green. Then the short closing message, the commit
  suggested, and the tag `v3.0.0` on my word.
