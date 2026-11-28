## Before opening the new session (operator, in your own terminal)

```bash
nvm use                                                                # in the worktree shared-calendar-multilanguage
git status                                                             # only this brief untracked
DYNAMODB_PORT=8002 npm run local:up -w backend                         # the emulators, for the gate's verify; no key: the fake Claude
npm run local:api -w backend                                           # a terminal of its own
npm run local:lambda -w backend                                        # a third terminal
aws sso login --profile shared-calendar-admin --use-device-code
export AWS_PROFILE=shared-calendar-admin
aws sts get-caller-identity --profile shared-calendar-admin            # the AdministratorAccess role
```

- **This step changes the cloud and sends real mail.** Each command that changes the cloud is
  run **by me, in my own terminal**, after a go I give in the session for that command alone.
  The session runs only the local checks, read-only `aws` commands and curl without
  credentials, and writes the documents.
- SES is still in its sandbox (part B of `docs/EMAIL_PLAN.md` step m10 waits for AWS): every
  mail of this step goes to an address I verified in part A, or to SES's mailbox simulator.
- **To decide before the session, by me** (the session asks if I have not said):
  1. **the throw-away User of point 7**: its username, and that its address is my own verified
     one; it is created in the page, so that its invitation is Cognito's, worded by the
     invitation function;
  2. whether **the assistant's panel is tried once with the real Claude** in point 7 (one
     message, a few cents) or left to the next person who uses it.

## Brief

Run phase B's item 8 of `docs/MULTILANGUAGE_PLAN.md`, "The deploy", following CLAUDE.md's
working rhythm: its checks, an honest report, a stop at each pause.

After this step the stack `shared-calendar-api` runs the languages with `DefaultLanguage` at
`it`, the page `shared-calendar-web` is released from the same commit, and the cloud's facts of
the plan's F16 are tried: the app client changed in place, a person's token writing its own
`locale` and no longer its own e-mail (the gap of `docs/MULTILANGUAGE_ARCHITECTURE.md` section
4.4, closed), `GetUser` answering `locale`, one invitation received in Italian and its password
used, the Administrator's account given its language. The release itself (the version, the
record in `README.md`, the tag, `main` moved, the push) is item 9, with a brief of its own.

Read these in full first:
- `CLAUDE.md`: "Working rhythm" (**the closing message is short**), "Hard rules from the
  design", **"Cloud safety"**, "Comments"; then `backend/CLAUDE.md` and `frontend/CLAUDE.md`.
- `docs/MULTILANGUAGE_PLAN.md`: **phase B's items 6 to 9** with the "As done" notes of 6 and 7;
  **F16**; the "As done" notes of steps l1, l2 and l7 (the app client, the invitation function,
  the mailer's language).
- `docs/MULTILANGUAGE_ARCHITECTURE.md` sections **4** (the person's language, 4.4 the gap), 7
  (Cognito's e-mails), 12 (security), **13** (deployment: the order, the parameter).
- `docs/RUNBOOK.md`: **section 2** (the deploy, steps 1 to 6: the API, then the page), 2.4 (the
  smoke test at `on`: 65 lines), **3.4** (the languages: what a first deploy must show), 3.3 part
  A (the sandbox), 5.11 (the last record, its change set at `on`).
- `docs/COMMANDS.md` section 6 (`smoke`, `deploy`), `scripts/deploy-gate.sh` (the stamp: the
  commit, 30 minutes, a clean tree).
- `backend/samconfig.toml` (its `parameter_overrides`, `DefaultLanguage="it"`),
  `backend/template.yaml` (the app client's `WriteAttributes`, the pool's `LambdaConfig`,
  `InviteMessageFunction` and its role, log group and permission, the output `DefaultLanguage`),
  `frontend/scripts/deploy.sh` (it reads that output).

## Where we are (2026-11-28; measure again at the start)

- `multilanguage` at `25b54d4`, equal to `origin/multilanguage`; `main` at `ef6ddc4`, equal to
  `origin/main`, merged into this branch. The cloud runs `ef6ddc4`'s code (`v3.0.0`, deployed at
  `5a4456c`), `MailStage=on` in SES's sandbox, API and page.
- Item 7 green on this code (`docs/MULTILANGUAGE_PLAN.md` item 7, "As done"): the root
  `verify`, both packages' journeys, the smoke test locally 62 PASS and 3 SKIP, the walk; its
  three findings fixed in `25b54d4`.
- The assistant's instructions are those of the paid evaluation of item 4 (69/69): nothing under
  `shared/src/assistant` or `backend/src/assistant` changed since. They differ from the cloud's,
  so **the conversations in progress end at the deploy**; no evaluation is owed.
- The cloud's accounts hold no `locale`: the Administrator's gets one at its first sign-in on
  the new page.
- `npm run test-user cloud` makes its User without Cognito's invitation (`SUPPRESS`): it cannot
  show the invitation in Italian, hence decision 1.

## The step

In this order. **Each point that changes the cloud waits for my go**; the session proposes the
exact command and I run it.

1. **The start.** This brief committed alone (on my go), so that the tree is clean for the
   deploy gate; `git status` clean, `HEAD` named.
2. **The cloud's facts, read-only** (F16, `docs/RUNBOOK.md` section 3.4), each with a
   `--query` that prints only what is needed:
   - `aws cognito-idp describe-user-pool-client`: `ReadAttributes`, `WriteAttributes`,
     `ExplicitAuthFlows` (today no write list: every standard attribute writable);
   - `aws cognito-idp describe-user-pool`: `LambdaConfig` (today no trigger) and the
     invitation's template's subject;
   - `aws cloudformation describe-stacks`: the parameters `MailStage` and `DefaultLanguage`
     (absent today), and the outputs' keys;
   - `aws sesv2 get-account`: `ProductionAccessEnabled` and `SendQuota` only.
   What differs from the documents is a pause.
3. **The gate.** `DYNAMODB_PORT=8002 npm run verify` at the root, with `local:api` and
   `local:lambda` running: the stamp on `HEAD`, a clean tree. Its counts reported.
4. **The API's deploy** (my go): `npm run deploy -w backend`, recorded with
   `script -q /tmp/deploy-api-lang.txt npm run deploy -w backend`. The change set is read before
   `y`, against item 8 and `docs/RUNBOOK.md` section 3.4:
   - the user pool **Modify** (its `LambdaConfig` gains `CustomMessage`), the app client
     **Modify** (`WriteAttributes: [locale]`), each detail `RequiresRecreation` `Never`;
   - **Add**: `InviteMessageFunction`, its role, its log group, its permission;
   - Modify for the functions whose code or environment changed (`DEFAULT_LANGUAGE`);
   - **no Remove; no Replacement** of the tables, the pool, the app client, the Administrator,
     the SES identity or the configuration set.
   Anything else is a stop, and the change set is left for me to cancel.
5. **The smoke test in the cloud** (my go): `npm run smoke -w backend -- shared-calendar-api`,
   my own verified address typed when asked: **65 PASS**. Its invitation, now worded by the
   function, in my mailbox **in Italian** (`DefaultLanguage`); I report its subject and words.
   Then, read-only, by fields only, never `@message`: the invitation function's log group (one
   line per invitation, its kind and the language's code `it`), the mailer's line `sent`, no
   error but what the smoke test expects.
6. **The page's release** (my go): `npm run deploy -w frontend`, after a new `verify` if the
   stamp is older than 30 minutes. It reads the stack's output `DefaultLanguage`; then, with curl
   and no credentials, the page answers 200 and its bundle holds the default language `it`.
7. **Operator, the look at the deployed page** (the session lists it once and waits for my
   report):
   - the sign-in screen: the list of languages, the browser's own language followed;
   - **the throw-away User of decision 1**, created in "Users" with my verified address: its
     invitation in Italian, from `noreply@<domain>`, not in spam; the first sign-in with its
     temporary password, "Choose your password", then the frame in the page's language; "My
     details" shows that language (the first sign-in's write to `locale`, and `GetUser` reading
     it); the language changed there and back, and kept at the next sign-in;
   - **the gap closed**, on that User: the session writes, in the scratchpad and never in the
     repository, a small Node script that asks for the username and the password hidden, signs
     in with `USER_PASSWORD_AUTH`, and with the User's own access token tries
     `UpdateUserAttributes` on `email` (expected: refused), then on `locale` (expected:
     accepted), then `GetUser` (expected: `locale` answered); it prints only each call's outcome
     or error name, never a token, a password or an address. I read it, then run it in my
     terminal and report. Then the User deleted in "Users";
   - **`admin` signs in once**: "My details" then holds a language (the account had none);
     "E-mail…" in the week sends a mail in that language, its Excel file opened, so the daily
     mail follows it too;
   - if decided (decision 2): the panel, one message, the answer in the page's language.
8. **The alarms, read-only**: the API's 5xx alarm, the mailer's error alarm and any alarm of the
   new function (`aws cloudwatch describe-alarms`, names, states, last change).
9. **The documents**: `docs/RUNBOOK.md` section 3.4 corrected by what really happened, and a new
   section 5.12, the record of the languages' deploy (the commit, the cloud's facts before, the
   change set, the smoke test's lines, the invitation in Italian, the gap tried, the page, the
   alarms, the cost); `docs/MULTILANGUAGE_PLAN.md` item 8's "As done" note (what item 9 finds)
   and the version line. `npm run typecheck` and `npm run lint` green.

Not in this step: the version and its tag, `README.md`'s "Versions", `main` moved, any push
(item 9); part B of `docs/EMAIL_PLAN.md` step m10 and the address identities; the privacy
notice; the branches `gdpr`, `multi-calendar`, `whatsapp` and `presentation`; `npm run budget`,
`npm run assistant-key`, the paid evaluation (none is owed).

## How we work in this step

- **Messages to me are short.** At the end of a point and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. Questions one at a time.
- **The pauses:** a cloud fact that differs from the documents; before each go; the change set
  showing a Remove, a Replacement of anything that holds data or of the app client, or the pool
  not Modify with `Never`; a smoke line FAIL; a mail that does not arrive, lands in spam or is
  not in Italian; the gap still open (the e-mail written) or `locale` refused; an alarm in ALARM
  that the expected answers do not explain; two documents that disagree.
- **Each go is for one command.** A go for the API's deploy is not a go for the smoke test or
  for the page. When a command fails, I am told what happened and nothing is retried without a
  new go.
- **AWS in the session: read-only only** (`describe-*`, `get-*`, `list-*`, `filter-log-events`
  with fields only). Never `sam deploy`, `npm run deploy`, `npm run smoke`, `npm run test-user`,
  a change set's creation or deletion, or any `aws` command that creates, changes or deletes,
  from the session. The scratch script of point 7 is run by me.
- **Recorded output**: I record with `script -q /tmp/<name>.txt <command>`; the session reads
  those files with commands that print the lines needed, never a whole file or the
  neighbourhood of a prompt, and never a line that holds an address.
- **Ask me before you stop or restart the local stack**: I run it in my own terminals.
- **Hard rules that bear on this step:** no token, password, account id or e-mail address in a
  command's argument, a log, a document or a message to me (the repository is public; the domain
  and the page's address are already in it); comments follow CLAUDE.md "Comments"; lint must
  pass.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked: the brief at point 1, the documents of point 9 at the end. Never push.

## Acceptance (`docs/MULTILANGUAGE_PLAN.md` phase B, item 8)

- The cloud's facts read before the deploy and recorded.
- The gate green on the commit that ships; the change set as worked out: the pool and the app
  client Modify with `Never`, the four additions, no Remove, no Replacement of what holds data.
- The smoke test in the cloud: **65 PASS**; the invitation in Italian; the function's log line
  with `it`; no unexpected error in the logs.
- The page released from the same commit, its default language `it`.
- My report: the throw-away User's invitation and first sign-in, its language in "My details"
  and kept; its token refused on `email` and accepted on `locale`; the Administrator's account
  with a language and its mail in it: all yes.
- The alarms as expected.
- `docs/RUNBOOK.md` sections 3.4 and 5.12, the plan's "As done" note and version line,
  `npm run typecheck` and `npm run lint` green. Then the short closing message and the commit
  suggested.
