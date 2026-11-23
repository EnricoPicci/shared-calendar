## Before opening the new session (operator, in your own terminal)

```bash
nvm use
npm run local:down -w backend                                          # a fresh stack
DYNAMODB_PORT=8002 npm run local:up -w backend                         # no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
```

- The whole step runs on **the fake Claude** and costs nothing at Anthropic. Nothing is
  deployed and **no command changes the cloud**.
- One check is read-only against AWS: the key's script refusing the real stack because the
  assistant is not deployed there yet (design point 2). For it, sign in before the session
  (`aws sso login --profile shared-calendar-admin --use-device-code`). Without a login the
  session skips that check and says so.
- **Three decisions, taken by the Product Owner on 2026-11-23:**
  1. the daily limit of messages per person in the cloud: **30**, the template's default
     (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 14 prices it);
  2. the monthly spend limit the runbook tells you to set on the Anthropic workspace:
     **10 USD**;
  3. the smoke test's sentence: **"What are the calendar's settings right now?"**, a read that
     the real model and the fake answer alike (design point 3).

## Brief

Implement plan step c14, "Before the deployment: the key's script, the smoke test, the
runbook" (`docs/CONVERSATIONAL_PLAN.md`), following CLAUDE.md's working rhythm: one step, its
acceptance check, an honest report, then stop for review.

After this step everything the operator needs for step c15 exists and has been tried as far as
it can be without the cloud: a script that stores the Anthropic key, a smoke test that proves
the assistant end to end, the deployment carrying the assistant's two parameters with their
values written in the repository, and the operator's order of work in `docs/RUNBOOK.md`.

The step changes nothing in `frontend/`, `shared/`, `backend/src/` or the template's
resources. It changes `backend/scripts/`, `backend/samconfig.toml`, `backend/package.json`,
one sentence of the fake's `answers.json`, and documents.

The design points are proposed below: apply them as written, and stop if a document or the
code proves one wrong.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Cloud
  safety" and "Changing these files"; `backend/CLAUDE.md`, **"Writing the scripts"**.
- `docs/CONVERSATIONAL_PLAN.md`: sections 1 to 4, **steps c14, c15 and c16**, the "As done"
  note of step c13 to its end ("What step c14 finds ready"), section 2.2 (P1, P2, P7).
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 4.4 (the limits), 6.1 (the three 503 and
  429 answers), 10.1 (controls: the key), 10.2 (what leaves AWS: P1), **11.2** (the Anthropic
  account and the key's script), 12.3 (the evaluation and the smoke test's exchange), 14
  (cost and the spend limit), **15** (observability: the 5xx alarm, the log line's outcome).
- `docs/ARCHITECTURE.md`: section 8.1 (the deploy gate), **9.3** (the smoke test), 4 ("The
  assistant's routes").
- `docs/RUNBOOK.md`, all of it: its order, its tables, section 2 (updating the stacks) and
  section 5 (the record), so that the assistant's part reads like the rest.
- `docs/COMMANDS.md` sections 3.4 (how `local:up` wires the fake or the real Claude, keeping
  the local API's output) and 6 (the operator's scripts).
- `backend/scripts/smoke.sh`, `bootstrap-admin.sh`, `target.sh`, `cognito.mjs`, `deploy.sh`,
  `backend/samconfig.toml`; in `backend/template.yaml` the parameters `AssistantModel` and
  `AssistantDailyMessageLimit` and the comment over `sendAssistantMessage` on the key.
- `backend/tests/integration/fake-claude/answers.json`: how a sentence maps to its answers.

## Where we are (2026-11-23)

- Steps c00 to c13 are done. The branch `deploy-frontend` is merged into `main`
  (`docs/MERGE_DEPLOY_FRONTEND.md`): the page is deployed as `shared-calendar-web`, its
  distribution passes `/api/…` to the API, and P7 is met by it. Step c15 now ends with a release
  of the page (its point 8).
- The cloud stack `shared-calendar-api` has **no assistant**: no table, no route, no
  parameter. The functions read the key from `/<stack>/anthropic-api-key`; until it exists they
  answer `503 assistant_unavailable` and everything else works.
- `backend/scripts/deploy.sh` sources the shared gate `scripts/deploy-gate.sh` and passes its
  arguments to `sam deploy`. `samconfig.toml` sets `AdminUsername` and `FunctionArchitecture`
  only; `AssistantModel` and `AssistantDailyMessageLimit` would take the template's defaults,
  written nowhere else.
- `npm run smoke -w backend -- <stack|local>` has 19 checks; it signs in through
  `scripts/cognito.mjs` and never prints a body.
- There is no `assistant-key` script and no assistant section in the runbook.

## Design points

1. **The key goes through node, never through the AWS CLI.** `backend/CLAUDE.md` ("Writing the
   scripts") says why: the CLI takes a value only as an argument (seen by `ps`) or a file (on
   disk), and its errors echo the input. So the key travels the way the Administrator's
   password does: typed with `read -rs` in `backend/scripts/assistant-key.sh`, then
   `printf '%s' "$key" |` into a small node script, `backend/scripts/parameters.mjs`, which
   reads stdin and calls `PutParameter` (`SecureString`, the account's default key
   `aws/ssm`) with the AWS SDK already in the back end's dependencies
   (`@aws-sdk/client-ssm`). An error prints its name only, never its message, which could
   quote the value. `npm run assistant-key -w backend -- <stack>` in `package.json`.
2. **What the key's script refuses, in this order, before it asks for the key:**
   - no argument or more than one;
   - `local` (the local stack takes its key from `local:up`, `docs/COMMANDS.md` section 3.4);
   - any argument naming `hello-world-api`;
   - a stack it cannot read (read-only `describe-stacks`, as `target.sh` does);
   - **a stack with no assistant yet**: its parameters do not include `AssistantModel`. The
     message says to deploy first. This is what makes the script safe to try in this step
     against the real stack: it stops before the key is asked for.
   Then it asks for the key once, without echo, and checks its shape (starts with `sk-ant-`,
   no space, a plausible length) with a message that never shows it. When the parameter
   exists already, it says "replacing version N" and asks for `y` (a rotation). After the
   write it prints the parameter's name, type, version and date from `DescribeParameters`,
   never a value: **no command of the script decrypts the key**.
3. **The smoke test gains one exchange of the assistant, a read, as the throw-away user**,
   after journey 3 and before journey 11 (so that the user exists and is signed in):
   - `DELETE /assistant/conversation` first, `204`, so that the run starts clean;
   - `POST /assistant/messages` with the sentence of decision 3, then `POST
     /assistant/continue` while the status is `working`, at most eight times;
   - PASS lines on status and counts only: the message answered `200`; the exchange ended
     `idle` within the eight; **a read was run** (the exchange took at least two steps: the
     fake's answer is a read, then the text); the reply holds an assistant message (counted,
     never printed); `remainingToday` one less than before; `DELETE /assistant/conversation`
     `204` at the end, also on every exit after the message was sent (the trap);
   - **before the key exists** the message answers `503 assistant_unavailable`: one FAIL line
     that names the code and says "no key yet, or Anthropic unavailable", and the rest of the
     test goes on. Step c15, point 4, expects exactly that one FAIL;
   - the sentence is **added to `answers.json`** as a message of its own, mapped to the
     existing answers `tool-get-settings` and `text-last-tool-result`; no answer is recorded
     anew. In the cloud the real model reads the settings and answers in a sentence.
   The header comment says what the exchange costs in the cloud (about a cent, up to 4 after
   a silence: `docs/CONVERSATIONAL_ARCHITECTURE.md` section 14), and that a smoke test after
   every back-end deploy now needs the key.
4. **The local smoke test proves the sentence never reaches a log.** After `npm run smoke -w
   backend -- local`, search the kept output of `local:api` for the sentence (and for the
   smoke's note, as `docs/SHARED_CALENDAR_SPEC.md` AC-36 does): zero hits. Count the log lines
   of the exchange's steps and read their `outcome` fields with a script that prints counts and
   field names, never a whole line.
5. **The two parameters, written in the repository.** `backend/samconfig.toml`, the default
   deploy environment's `parameter_overrides`, gains `AssistantModel="claude-sonnet-5-5"` (the
   choice of P4) and `AssistantDailyMessageLimit="30"` (decision 1), each with a comment in
   plain words. `ASSISTANT_EFFORT` stays empty in the template (effort `low`). `deploy.sh`
   changes only if it must, and **the gate is not touched**. Write in the runbook, and in the
   comment above `parameter_overrides`, the trap of the first deployment: an argument
   `--parameter-overrides` on the command line replaces samconfig's whole list.
6. **The runbook gains the assistant's part**, written for the operator, in order, each step
   with the command and what must be seen:
   - on Anthropic's side, before anything is deployed: a workspace of its own, its key, **the
     monthly spend limit** (decision 2), and **P1**: read the account's terms on keeping
     requests and on training, and write the result where step c15 says;
   - on ours: the gate, `npm run deploy -w backend` (the change set read: one table, six
     functions with their roles and routes, two parameters, nothing replaced), the smoke test
     with its one expected FAIL, `npm run assistant-key -w backend -- shared-calendar-api`,
     the smoke test again with no FAIL, then **the page released again** (section 2, step 6)
     and the panel seen at the deployed page;
   - **P2**: what the function's log says when the key cannot be decrypted, and the statement
     to add then, with a second deployment of its own;
   - **when the 5xx alarm arrives for the assistant**: how to read the log line's `outcome`
     (CloudWatch Logs Insights on the function's log group, a query that selects the fields of
     `docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.1 and never a text), and what to do for
     each: Anthropic unavailable (wait), the spend limit reached (raise it or wait for the
     month), the key refused (rotate);
   - **how to rotate the key**: a new key in the Console, the script again, ten minutes (the
     functions keep the key that long), the old key revoked; the smoke test;
   - section 2's table and step 5: the smoke test needs the key once the assistant is
     deployed, and costs about a cent.
   A new section, numbered where the runbook's order puts it; nothing else moves. Its
   command lines are tried locally where they can be, and the rest is marked as first run in
   step c15.
7. **No test is added for the scripts** beyond what the repository does for the others:
   they are operator scripts, tried by hand. `npm run lint` covers their comments. If a piece
   of logic grows in `parameters.mjs` beyond reading stdin and one call, stop and tell me.

## The step

1. The root gate on the fresh stack: `DYNAMODB_PORT=8002 npm run verify`.
2. `answers.json`: the smoke's sentence (design point 3). The back end's assistant journeys
   once (`RUN_INTEGRATION=1`), to prove the fake still answers every journey's sentences.
3. `smoke.sh`: the exchange (design point 3). Run `npm run smoke -w backend -- local`: report
   the PASS and FAIL lines. Then design point 4 on the kept log.
4. `assistant-key.sh`, `parameters.mjs`, the npm script (design points 1 and 2). Try every
   refusal: no argument, two arguments, `local`, `hello-world-api`, `--stack-name=hello-world-api`.
   With my AWS login, and **only read-only**: `npm run assistant-key -w backend --
   no-such-stack` and `-- shared-calendar-api`, which must stop before the key is asked for.
   Report each with its message.
5. `samconfig.toml` (design point 5). The check is the gate's `sam validate --lint` and a read
   of each name against the template's parameters; `npm run deploy` is never run.
6. The documents:
   - `docs/RUNBOOK.md`: the assistant's section and section 2 (design point 6);
   - `docs/COMMANDS.md` section 6: `assistant-key`, the smoke test's new checks;
   - `docs/ARCHITECTURE.md` section 9.3 (the smoke test's checks) and wherever the number 19
     is written;
   - `docs/CONVERSATIONAL_ARCHITECTURE.md` section 11.2 if the script differs from it;
   - `docs/CONVERSATIONAL_PLAN.md`: the status line and an "As done" note under step c14,
     ending with what step c15 finds ready;
   - `backend/CLAUDE.md` (the scripts' list), `CLAUDE.md` (199 lines of 200: only if a line
     became untrue; `npm run assistant-key` is a cloud command and belongs under "Cloud
     safety" only if it is not covered by "an `aws` command that creates or changes
     resources"). Report the line counts.
7. The gate again, `npm run typecheck` and `npm run lint` at the root.

Not in this step: anything in the cloud (no deploy, no `assistant-key` past its refusals, no
smoke test against a stack); a change to `backend/src/`, `shared/`, `frontend/` or the
template's resources; a recorded answer of the fake; a `kms:Decrypt` statement (P2 is decided
in step c15); a new dependency; step c15.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a design point that proves wrong; anything that would change `backend/src/`,
  `shared/`, `frontend/` or the template's resources; two documents that disagree; the runbook
  section ready for my reading (the acceptance needs it).
- **The local stack is mine**: `local:up`, `local:down` and every restart of `local:api`. Tell
  me exactly what to run and the word you wait for. To know which Claude is wired, read
  whether `ANTHROPIC_BASE_URL` is in `backend/env.local.json` with a script that prints yes or
  no; **never print that file or a line of it**. The smoke test runs on the fake only.
- **The key is never yours.** No command of the session holds a key, asks for one or echoes
  one. The key's script is tried only on its refusals; it is never given a key, not even a
  made-up one, against a real stack.
- **AWS: read-only, and only the two refusals of step 4.** No `sam deploy`, no `aws ssm
  put-parameter`, no `npm run deploy`, no `npm run smoke` against a stack.
- **The order of the runs.** The back end's journeys empty the local `calendar` table; the
  smoke test works on top of what is there. Never run the two packages' integration tests at
  the same time, nor the smoke test during a journey.
- **The log file** `/tmp/shared-calendar-local-api.log` is mine: read it with scripts that
  print counts and field names, never whole, and never a line that could hold a text of a
  conversation; do not delete or empty it.
- **Writing the scripts:** `backend/CLAUDE.md`, "Writing the scripts": bash 3.2 and BSD tools,
  no jq, no here-string for a secret, the secret on a pipe to node. A shell command of the
  session that holds a script goes through a file or a here-document. The shell is zsh.
- **Hard rules that bear on this step:** no token, password, key or text of a conversation in
  a log, a document, an argument or a message to me; IAM unchanged; comments follow CLAUDE.md
  "Comments"; lint must pass; the existing tests keep passing unchanged.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the plan
  over this brief.
- Commit only when asked. Do not push. Do not start step c15.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c14)

- The root gate green on a fresh stack, and again on the final state.
- `npm run smoke -w backend -- local` PASS on every line, the assistant's exchange included,
  against the fake; the sentence and the note found in no line of the local API's output.
- The key's script's refusals tried, each with its message: no stack, the old stack, `local`,
  a stack without the assistant (with my login, read-only; or written as not tried).
- `samconfig.toml` carries the two parameters with their values; the gate untouched.
- `docs/RUNBOOK.md`'s assistant section **read through by me**; `docs/COMMANDS.md`,
  `docs/ARCHITECTURE.md` section 9.3 and the plan's "As done" note written.
- `npm run typecheck` and `npm run lint` at the root green; the stack left on the fake.
- Then the short closing message, and suggest the commit.
