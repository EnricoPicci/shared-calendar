## Before opening the new session (operator, in your own terminal)

```bash
nvm use
git status                                                             # clean: the P1 change committed
npm run local:down -w backend                                          # a fresh stack
DYNAMODB_PORT=8002 npm run local:up -w backend                         # no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
export AWS_PROFILE=shared-calendar-admin
aws sts get-caller-identity --profile shared-calendar-admin            # the AdministratorAccess role
```

- **This step changes the cloud.** Each command that changes it is run **by me, in my own
  terminal**, after a go I give in the session for that command alone. The session runs only
  the gate, read-only `aws` commands and curl without credentials, and writes the documents.
- **Done before this brief, by me, on 2026-11-23:** P1 is closed (`docs/CONVERSATIONAL_ARCHITECTURE.md`
  sections 10.2 and 18.2: not used for training, not retained by default). On Anthropic's
  side: the workspace `shared-calendar`, its monthly spend limit of 10 USD, one key scoped to
  that workspace, kept in my password manager. The key's script refused `shared-calendar-api`
  ("no assistant yet"), read-only.
- **Three decisions, taken by me on 2026-11-23:**
  1. at the deployed page **one change is confirmed for real**: a booking proposed by the
     assistant and confirmed with the button, then cancelled from the page, so that the
     confirming function's rights to write the calendar are proven in the cloud; the cancelled
     appointment stays as history, like the smoke test's;
  2. **the spending limit is not provoked** in this step: its recognition stays as Anthropic's
     documentation describes it (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1);
  3. **the commits are pushed to GitHub before the deployment** (point 2 below), so that the
     commit the cloud runs is on `origin`.
- **The key is never the session's.** I type it into `npm run assistant-key` in my terminal.
  No command of the session holds it, asks for it, or reads the parameter's value.

## Brief

Implement plan step c15, "Cloud deployment" (`docs/CONVERSATIONAL_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

After this step the assistant runs in the cloud: the stack `shared-calendar-api` has its table,
its six functions and routes and its two parameters, the key is in Parameter Store, the smoke
test passes on every line, P2 is closed, and the deployed page has the panel. Everything is
recorded in `docs/RUNBOOK.md` section 5.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**) and **"Cloud
  safety"**; `backend/CLAUDE.md`, "Writing the scripts".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1 to 4, **step c15** and step c16, the "As done" note
  of step c14 ("What step c15 finds ready"), section 2.2 (P1, P2, P7).
- `docs/RUNBOOK.md`: **section 3.2** (the order of this step, what each command must show,
  P2, the 5xx alarm, the rotation), section 2 (steps 3 to 6: the gate, the deploy, the smoke
  test, the page's release), section 5 (how a deployment is recorded: 5.2, 5.4 and 5.5 are the
  examples).
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 6.1, 10.1, 10.2, 11, 14, 15 and 18.2.
- `docs/ARCHITECTURE.md`: sections 7 (security, the role statements), 8.1 (the gate), 9
  (deployment, the smoke test).
- `docs/FRONTEND_WALK.md` section 7 (the short list for the real model);
  `docs/FRONTEND_ARCHITECTURE.md` section 13 (the page's hosting).
- `backend/template.yaml`: the assistant's resources, the three roles that read the key, the
  5xx alarm; `backend/samconfig.toml`; `backend/scripts/smoke.sh`, `assistant-key.sh`,
  `deploy.sh`; `frontend/scripts/deploy.sh`.

## Where we are (2026-11-23)

- Steps c00 to c14 are done and committed; nothing is pushed. P1, P3, P4, P5 and P6 are
  closed; P7 is met by the page's hosting and is to be seen at the deployed page (point 8).
- `shared-calendar-api` was last deployed from `4e22058` (`docs/RUNBOOK.md` section 5.4) and
  has **no assistant**. `shared-calendar-web` was released from `646b706` on the branch
  `deploy-frontend` (section 5.5), merged into `main` since: the deployed page has no panel.
- The deploy takes no argument: `backend/samconfig.toml` holds the four parameters, and the
  stack keeps `AlertEmail`. A `--parameter-overrides` on the command line would replace the
  whole list (section 3, step 2): **not used in this step**.
- Expected before the key: the smoke test's one FAIL, `503 assistant_unavailable`, which also
  fires the 5xx alarm's e-mail.

## The step

In this order. Each point marked **(go)** waits for my go in the session, and I run it.

1. **The change set, worked out before the deploy** (session, read-only): the deployed
   template (`aws cloudformation get-template`) against `backend/template.yaml` at HEAD, and
   the stack's resources. Write down what to expect: the Adds (the table, two policies, six
   functions with their roles, log groups and permissions), the Modifies with replacement
   `False` (`HttpApi`; which existing functions and roles, and why: the code bundled into them
   that changed since `4e22058`), and **no Remove, no Replace**. The two new parameters. Pause:
   I read the list.
2. **(go) The push**: `git push origin main`, by me, once the list of point 1 is read and the
   tree is clean; the session then checks, read-only, that `origin/main` is HEAD. Then **the
   gate**: the root `DYNAMODB_PORT=8002 npm run verify` on the clean tree, ending
   `verify PASSED … (clean tree)`. From then on 30 minutes to deploy, and no tracked file
   changes; the documents are written after the deployments.
3. **(go) `npm run deploy -w backend`**, recorded:
   `script -q /tmp/deploy-api.txt npm run deploy -w backend` (macOS `script`; never a file
   inside the repository). I read the change set against the list of point 1 before the `y`;
   anything else, I answer N. Then, read-only: the stack `UPDATE_COMPLETE`, its parameters
   (`AssistantModel` `claude-sonnet-5-5`, `AssistantDailyMessageLimit` `30`, `AlertEmail` kept
   without printing it), the six functions (`arm64`, `nodejs22.x`, their environment's
   names, never a value that is not a name), the table, the three roles' statements on the
   parameter, the outputs; an unauthenticated `POST /assistant/messages` answers 401.
4. **(go) the smoke test before the key**, `npm run smoke -w backend -- shared-calendar-api`,
   recorded the same way: 25 PASS and the one FAIL `assistant: POST /assistant/messages -> 503
   assistant_unavailable: no key yet, or Anthropic unavailable`. The function's log line
   (Logs Insights, fields only): `outcome` `language_unavailable`, `reason` `key_missing`.
5. **(go) `npm run assistant-key -w backend -- shared-calendar-api`**, by me, typing the key.
   It ends with `Stored.` and the parameter's name, `SecureString`, version 1, date. The session
   then reads, read-only, the parameter's description (never its value) and its key id (the
   default `alias/aws/ssm`).
6. **(go) the smoke test again**: **26 PASS**. **P2 is closed here.**
   - If the exchange passes: no `kms:Decrypt` statement is needed. Write it in
     `docs/CONVERSATIONAL_ARCHITECTURE.md` sections 18.2 (P2 closed) and 10.1 if a line
     changes, and `docs/ARCHITECTURE.md` section 7.
   - If it fails with `reason` `key_missing` although the parameter exists: **stop**. Read
     CloudTrail's events (`GetParameter`, `Decrypt`) for the refusal, propose the one statement
     (`kms:Decrypt` on that one key, with the condition that it is used through Parameter Store
     in `eu-north-1`, in the three roles that read the key), and wait. Its change to the
     template, the gate, and a second deployment each need a go of their own.
   - Any other FAIL: stop and report it with the log line's fields.
7. **(go) the page released again**, from the same commit and inside the gate's 30 minutes
   (or the gate again first): `npm run deploy -w frontend -- --dry-run`, then (go)
   `npm run deploy -w frontend`, recorded. Expected: `No changes to deploy` for the hosting,
   the four uploads, the invalidation, the four checks PASS.
8. **At the deployed page, by me** (the session prepares the list and reads the logs):
   - one exchange as the Administrator in English and one in Italian (a reading of the
     calendar, then a change proposed and declined), and the short walk of
     `docs/FRONTEND_WALK.md` section 7;
   - **one change confirmed** (decision 1): as a throw-away User created from the page, a
     booking on a free hour of a one-off window made for it, proposed by the assistant and
     confirmed with the button; seen in the week; then cancelled from the page, and the window,
     its type and the User removed. The session prepares the hour and the names, and reads the
     `confirmProposal` log line (`outcome`, `changes`, fields only);
   - "Sign out" while an answer is awaited;
   - P7 seen: the `/api/assistant/…` requests reach the API through the distribution (the
     API's access log: route and status only).
   Then the session reads the log lines of those exchanges with Logs Insights, **fields only,
   never `@message`**: per step the route, `outcome`, `steps`, `tools`, `model`, `effort`,
   `usage`, `modelMs`, `durationMs`; the seconds of the slowest step against the 29 s of the
   functions and the 30 s of the distribution. And the search for text: the smoke test's
   sentence, one word I choose from my messages, and `/eyJ/` over the six assistant log
   groups, each with its "records scanned" figure (`docs/RUNBOOK.md` section 2.1 explains why
   0 rows proves nothing until the records are scanned): no row.
9. **Read-only, after**: the 5xx alarm's history (the expected alarm of point 4, then `OK`);
   the SNS subscription still confirmed; the budget and the month-to-date cost, the forecast
   if AWS gives one; the provisioned capacity of the account's tables against the free 25/25
   (`docs/ARCHITECTURE.md` section 10). On Anthropic's side, by me: the workspace's spend
   since today and the limit still 10 USD.
10. **The documents**, after the deployments:
    - `docs/RUNBOOK.md`: a new record, section 5.6, in the shape of 5.2 and 5.5 (the commit,
      who ran what, the change set, the smoke tests' lines, P2, the page, the logs, the cost);
      in section 3.2 the marks "(first run in step c15)" removed where the command was run,
      and anything that proved different corrected;
    - `docs/CONVERSATIONAL_ARCHITECTURE.md`: P2 in sections 18.2 and 10.1, the status line, a
      change-log row;
    - `docs/ARCHITECTURE.md`: section 7 if P2 changed a statement; its change log's sentence
      for this step;
    - `docs/CONVERSATIONAL_PLAN.md`: P2 in section 2.2, the status line, an "As done" note
      under step c15 ending with what step c16 finds ready;
    - `README.md`, "The deployed stacks": only if a line became untrue.
11. `npm run typecheck` and `npm run lint` at the root.

Not in this step: a change to `backend/src/`, `shared/`, `frontend/` or the instructions; a
change of the template beyond the P2 statement, and that one only on its own go; the
evaluation with the real model; provoking the spending limit; inviting anybody but me; a
push other than the one of point 2; step c16.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the change set's list (point 1); before each (go); a FAIL of the smoke test
  that is not the expected one of point 4; P2 needing the statement; anything in the cloud
  that differs from `docs/RUNBOOK.md` section 3.2; two documents that disagree.
- **Each go is for one command.** A go for the deploy is not a go for the smoke test. When a
  command fails, I am told what happened and nothing is retried without a new go.
- **AWS in the session: read-only only** (`describe-*`, `get-*`, `list-*`, Logs Insights
  queries, `filter-log-events` with fields only). Never `put-parameter`, `get-parameter`
  with decryption, `sam deploy`, `npm run deploy`, `npm run smoke` or `npm run
  assistant-key` from the session.
- **Recorded output**: the files under `/tmp` from `script` are mine; read them with scripts
  that print the lines needed, never a password prompt's neighbourhood or a whole file; they
  hold no password (the prompts do not echo) and no key.
- **Logs**: never `@message` and never a field that could hold a text of a conversation; the
  search for text counts rows and prints none.
- **The local stack is mine** and stays on the fake: the gate needs it; nothing in this step
  wires the real Claude locally.
- **Hard rules that bear on this step:** no token, password, key or text of a conversation in
  a log, a document, an argument or a message to me; no e-mail address or account id in a
  document (the repository is public; the API's and the page's addresses are already in
  `docs/RUNBOOK.md`); IAM: one role per function, no wildcard, the P2 statement only as
  written above; comments follow CLAUDE.md "Comments"; lint must pass.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked. The one push is point 2's, on its go. Do not start step c16.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c15)

- The change set as worked out beforehand: no Remove, no Replace.
- The smoke test before the key: 25 PASS and the one expected FAIL; after the key: **26 PASS**
  in the cloud.
- P1 and **P2 written as closed** in `docs/CONVERSATIONAL_ARCHITECTURE.md` section 18.2.
- The page released again; the panel answering at the deployed page in both languages; one
  change confirmed through the panel and cancelled; P7 seen.
- No text of a conversation and no token in the assistant's log groups, with the records
  scanned.
- The deployment recorded in `docs/RUNBOOK.md` section 5 with the commit; the Anthropic
  Console shows the spend limit; the AWS bill's forecast unchanged.
- `npm run typecheck` and `npm run lint` green. Then the short closing message, and suggest
  the commit.
