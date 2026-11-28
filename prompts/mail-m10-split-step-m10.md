## Brief

Cut step m10 of `docs/EMAIL_PLAN.md` ("Cloud, stage `on`, and the release v3.0.0") into **two
parts, A and B**, each with its own check and its own "As done" note, as step m8 was cut into
parts. This brief changes the documents only: it runs nothing in the cloud and changes no code.
Part A is run later, with its own brief.

Why: step m10 waits for AWS to lift the SES sandbox, which can take days. Everything except
mailing people at addresses not verified in SES can be done and proven before that. In the sandbox
SES delivers only to verified addresses and to the mailbox simulator, so the stage `on` can be
deployed and tried now, with every recipient an address the operator has verified.

- **Part A, in the sandbox, every recipient verified:** the deploy at `MailStage=on`, the smoke
  test in the cloud, and the operator's look with real mails. That means a real invitation, a mail
  on demand from the week page with its Excel file, and a real daily mail, all to addresses the
  operator has verified in SES. Then the release is tagged `v3.0.0`.
- **Part B, out of the sandbox:** what is left of step m10. The Users of step m9's list are
  invited again, their future appointments booked again by hand if wanted, the test Users deleted,
  the privacy notice updated, the documents closed and the plan marked finished.

Read these in full first:
- `CLAUDE.md`: "Working rhythm" (**the closing message is short**), "Hard rules from the
  design", **"Cloud safety"**, "Comments", and "Changing these files" (this brief does not
  change `CLAUDE.md`; part B does, by its section 4 row).
- `docs/EMAIL_PLAN.md`: sections 1 to 4 (F1, F2, F13, F15; **section 4, row m10**), **section
  5.2** (the full regression and where it runs), **steps m9 and m10**, step m9's "As done" note,
  **step m8's parts A, B and C** (the pattern of a step in parts), section 7 (the operator's
  tasks).
- `docs/EMAIL_ARCHITECTURE.md`: **section 8.5** (the sandbox), **13.2** (the stages: point 3
  says `on` comes "once the domain is verified and the account out of the sandbox"), 13.3 (the
  smoke test), 5.3 (a wrong address, the bounce), 12.3, 21.
- `docs/ARCHITECTURE.md` section 9.2 (the stages' table) and 9.3 (the smoke test).
- `docs/RUNBOOK.md`: **section 3.3** (its paragraph "At `on`" is still a draft), **section
  5.11** (the record of stage `domain`), section 2.4 (the smoke test's 65 lines at `on`).
- `backend/scripts/smoke.sh`, its header comment: at `on` it writes to the mailbox simulator, to
  the operator's own address (the invitation, asked for when the run starts), and to the
  Administrator's address (the mail on demand, read with `GET /me`).

## Where we are (2026-11-28)

- `main` at `a2b4774`, pushed. The cloud runs `MailStage=domain` (`e756e17`): the domain
  `enricopiccinin.com` is verified with DKIM, the bounces' subscription confirmed.
- SES production access has been asked for. AWS asked for the details and the operator replied
  in the support case. The account is still in the sandbox (`ProductionAccessEnabled` false, 200
  mails a day, 1 a second). AWS's answer is pending.
- The cloud pool holds `admin` and two test Users, `miri` and `enri`, made with `test-user cloud`.
- The branch `multilanguage` is merged into `main` **after step m10 is complete**, so after part
  B. Part A and part B change the page's texts and views as little as they can.

## The Product Owner's decisions

1. **Names:** parts A and B of step m10, like step m8's parts, so that every "step m10" in the
   documents stays true.
2. **The mail on demand belongs to part A:** "E-mail…" in the week, to a verified address, with
   its Excel file opened.
3. **The tag `v3.0.0` at the end of part A**, when the operator asks for it. `README.md`
   "Versions" gains v3.0.0 in part A, not in part B.

## What to find out first (read-only, from AWS's documentation; cite each page in the plan)

1. **What the sandbox allows at `on`:**
   - which recipients receive mail;
   - whether the Reply-To address must be verified;
   - whether Cognito's invitation, sent through SES with `EmailSendingAccount: DEVELOPER`, obeys
     the same rule.
2. **What happens when the Administrator creates a User whose address is not verified**, while the
   account is in the sandbox. Does `AdminCreateUser` fail, or is the User made and the mail
   refused? What does `POST /users` answer then, and does the API's 5xx alarm go off? If the
   documentation does not say, the plan says so. The rule of part A then covers it anyway: no User
   is created with an address that is not verified.
3. **How the operator verifies an address:** the SES console, `eu-north-1`, Identities, "Create
   identity", "Email address", and the link in AWS's mail. Find out whether an address identity
   needs anything when the account leaves the sandbox, and whether it may be deleted afterwards
   without touching the domain's identity.

If what you find contradicts a document, stop and tell me: the architecture wins over the plan,
the plan over this brief.

## The documents to change

1. **`docs/EMAIL_ARCHITECTURE.md` section 13.2, point 3:** `on` comes once the domain is
   verified, not once the account is out of the sandbox. Say what the sandbox means at `on`: mail
   reaches only verified addresses and the simulator, so until production access the
   Administrator creates no User, and asks no mail, for an address that is not verified. Section
   8.5 gains one sentence to match. `docs/ARCHITECTURE.md` section 9.2 too, if its table says the
   same as the old point 3.
2. **`docs/EMAIL_PLAN.md`:**
   - **The version line:** v14, what changed and why.
   - **Section 4's row m10, cut in two.** Part A: `README.md` "Versions" v3.0.0, and
     `docs/RUNBOOK.md` section 3.3's "At `on`" corrected and section 5.11 continued. Part B: the
     rest of the row.
   - **Section 5.2.** The second full regression runs "at the end of m10": say where it runs now.
     The deploy, the gate and the smoke test are in part A, so the regression's cloud end is part
     A's check. Part B redeploys nothing unless something changed.
   - **Step m10, rewritten as parts A and B.** Each part has its start condition (a read-only
     check), its points in order, its operator's steps in plain words, its documents and its
     check.
   - **Section 7's rows for m10,** marked A or B.
3. **`docs/RUNBOOK.md` section 3.3, "At `on`":** rewritten as the draft of both parts, which
   part A and part B will run and correct as step m9 did for `domain`.

## What part A must contain

At least this. Use the plan's points that exist and add what the questions above show is needed.

- **Starts when** SES shows the domain verified (read-only). It does not wait for production
  access.
- **The operator verifies, in the SES console, every address that will receive a mail in part
  A,** and the session checks it read-only:
  - the operator's own address, for the smoke test's invitation and the throw-away User;
  - the Administrator's address in "My details", for the daily mail and the smoke's mail on demand;
  - the address of any test User that asks for a mail.

  The check must print no address, for example the number of address identities and their state.
  No address goes into a command's argument, a log, a document or a message.
- **Before the deploy:** a test User whose address is not verified is deleted or not used for any
  mail, and no other User is created until part B.
- **The deploy:**
  1. `MailStage=on` in `backend/samconfig.toml`, committed, pushed if the operator decides so;
  2. the gate's `verify`, then `npm run deploy -w backend`;
  3. its change set read before "y": step m9's change set at `on` names what to expect (the pool
     Modify with no re-creation, the mailer, its role, log group and alarm, the daily schedule
     and its role; no Remove, no Replace of what holds data).
- **The page:** `npm run deploy -w frontend` only if the page changed after step m9.
- **The smoke test** in the cloud: 65 PASS at `on`, its invitation in the operator's mailbox.
  Then the log search, fields only.
- **The operator's look, with real mails, every recipient verified:**
  - the smoke's invitation: from `noreply@<domain>`, Reply-To the alarm address, not in spam;
  - a throw-away User created in the page with one's own address: its invitation, its first
    sign-in, a password chosen, then deleted;
  - "Resend invitation" for an invited User;
  - a mail on demand from the week page, as the Administrator and as a test User whose address is
    verified, its Excel file opened;
  - the daily mail's hour set in "Settings". To avoid waiting a day, it may be set to the next
    whole hour. Then the daily mail with its two files.
- **The 5xx alarm** should stop going off for the e-mail routes. Say so, and watch the mailer's
  error alarm.
- **The documents of part A:** `docs/RUNBOOK.md` sections 3.3 and 5.11, `README.md` "Versions"
  v3.0.0, the plan's "As done" note for part A. Then the tag `v3.0.0` on the operator's word.
- **Check:** the gate's `verify`, 65 PASS in the cloud, the operator's look all yes, the tag.

## What part B must contain

- **Starts when** `aws sesv2 get-account` shows production access (read-only); the new daily
  quota is recorded.
- **Nothing is deployed,** unless something changed.
- **The operator:**
  - the Users of step m9's list created again in the page, each receiving their invitation, and
    their future appointments booked again by hand if wanted;
  - the test Users `miri` and `enri` deleted;
  - whether to keep the address identities verified for part A. Answer it from what question 3
    found;
  - the privacy notice updated, outside the system (`docs/EMAIL_ARCHITECTURE.md` section 12.3).
- **The documents closed:** the rest of section 4's row m10, the plan marked finished.
- **Check:** the Users invited, the documents closed. Then the merge of `multilanguage` may begin,
  with its own brief.

## How we work

- **Documents only.** No code, no template, no `samconfig.toml`, no cloud command but read-only
  ones (`describe-*`, `get-*`, `list-*`), which this brief barely needs. AWS's documentation is
  read with the AWS documentation tools.
- **Messages to me are short:** one or two simple sentences, then plainly what I must decide or
  do. Questions one at a time. When two documents disagree, stop and tell me.
- **Hard rules:** no e-mail address, account id, token or password in a document or a message.
  The repository is public; the domain and the page's address are already in it. Comments follow
  `CLAUDE.md` "Comments". `npm run lint` checks the documents' references.
- Commit only when asked. Do not start part A.

## Acceptance

- The three questions answered from AWS's documentation, each with its page, or "not said".
- `docs/EMAIL_ARCHITECTURE.md` section 13.2 (and 8.5, and `docs/ARCHITECTURE.md` section 9.2 if
  needed) in line with the split.
- `docs/EMAIL_PLAN.md` v14: step m10 in parts A and B, each with its start, points, operator's
  steps, documents and check; section 4's row and section 5.2 in line; section 7 marked.
- `docs/RUNBOOK.md` section 3.3's "At `on`" as the draft of both parts.
- `npm run typecheck` and `npm run lint` green. Then the short closing message, and suggest the
  commit together with this brief.
