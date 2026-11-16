## Brief

Implement plan step 57, "Deploy the new stack `shared-calendar-api`", following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review. This step creates
the stack `shared-calendar-api` (`eu-north-1`) beside the old `hello-world-api`, which is **not
touched** and stays the way back until plan step 58 (`docs/RENAME_PLAN.md` section 4.2). It writes
no application code: if a deploy, smoke or console check fails, diagnose first, propose the fix as
a code or document change, test it locally, and only then retry (see "When something fails").

**Explicit instruction (CLAUDE.md, "Cloud safety"; `docs/IMPLEMENTATION_PLAN.md` step 57).** With
this brief I authorise, for this step only, the following cloud actions, **run by me in my own
terminal**, each one only after you have prepared it and I have given my go in the conversation:
- the first deploy of the new stack:
  `npm run deploy -w backend -- --parameter-overrides AdminUsername="admin" FunctionArchitecture="arm64" AlertEmail=<address>`,
  with the address typed by me;
- `npm run bootstrap-admin -w backend -- shared-calendar-api` (sets the admin password; the
  password never goes through the conversation);
- `npm run budget -w backend -- shared-calendar-api --dry-run`, then without `--dry-run`
  (creates the budget `shared-calendar-api-monthly`);
- `npm run smoke -w backend -- shared-calendar-api`, which creates and deletes a real throw-away
  user and writes rows in the new tables;
- if the alarm subscription turns out to be missing or expired, `aws sns subscribe` for the new
  stack's `AlarmTopic` (`docs/RUNBOOK.md` section 3, item 6).

You do not run any of them yourself, also not with `!`, and the authorisation does not cover
anything else: nothing on `hello-world-api` (no deploy, no change, no delete: `deploy.sh` refuses it
anyway), no `sam delete`, no deleting or changing a stack, table, user pool, user, budget or policy,
no lifting of deletion protection, no `--guided`, no `--no-confirm-changeset`, no second deploy
without a new go from me. Read-only AWS commands you may run without asking, once my SSO session is
valid (`AWS_PROFILE=shared-calendar-admin`): `aws sts get-caller-identity`, `aws cloudformation
describe-stacks` / `describe-stack-events` / `describe-change-set` / `list-change-sets` /
`list-stack-resources` (on either stack), `sam list stack-outputs`, `aws dynamodb describe-table`
and `scan` on the tables of either stack, `aws lambda list-functions` / `get-function-configuration`,
`aws logs` reads and Logs Insights queries (`start-query` / `get-query-results` only read), `aws sns
list-subscriptions-by-topic`, `aws cloudwatch describe-alarms` / `describe-alarm-history`, `aws
budgets describe-budgets`, `aws ce get-cost-forecast` / `get-cost-and-usage`. If the login has
expired, ask me to run `aws sso login --profile shared-calendar-admin --use-device-code`.

Read these in full first:
- `CLAUDE.md`, in particular "Cloud safety", the `deploy`, `smoke`, `verify`, `bootstrap-admin`,
  `budget` and stack-target lines of "Everyday commands", the "Cloud" line, the rule on passwords
  and tokens in scripts, and "Comments" (any comment you touch follows it; `npm run lint` enforces
  it).
- `docs/RENAME_PLAN.md`, all of it: the decisions R1–R8, section 4 (the way back), section 6.1 (this
  step), section 7 (cost), section 8 (risks).
- `docs/RUNBOOK.md`: section 1 (every working session, the profile), section 2 (the change-set
  rules, recording the output with `script`), section 2.1 (the smoke test's calendar journey, what
  stays in the table, the AC-36 query and the "records scanned" note), section 3 (deploying from
  scratch, which this step follows), section 5.2 (the record of plan step 55, the model for this
  step's record) and 5.4.
- `docs/IMPLEMENTATION_PLAN.md` steps 55 and 57.
- `docs/SHARED_CALENDAR_SPEC.md` section 1.3 (the zone cannot change once data exists), section 14
  and section 18.4 (the smoke journey); `docs/ARCHITECTURE.md` sections 7.1, 9 and 10.
- `backend/template.yaml` (Parameters, the two tables, `AlarmTopic`, the alarms, Outputs),
  `backend/samconfig.toml`, `backend/scripts/deploy.sh`, `verify.sh`, `smoke.sh`, `target.sh`,
  `bootstrap-admin.sh`, `budget.sh`.

## Where we are (2026-11-16)

- Step 55 deployed the calendar to `hello-world-api` (commit `340d9b0`; record in
  `docs/RUNBOOK.md` section 5.2). Step 56 renamed the repository (`42021ff`); the flaky log checks
  were fixed in `b752ea5`. Check `git status -sb` and `git log` rather than trusting this line: at
  the time of writing `main` was at `b752ea5`, three commits ahead of `origin`.
- `backend/samconfig.toml` names the stack `shared-calendar-api`; the tables are named after the
  stack. The stack does not exist yet: `README.md`'s deployed-stack table still shows
  `hello-world-api`, with a note.
- The old stack `hello-world-api` is live and holds only the user `admin`, the smoke tests' history
  and 4 smoke rows; it stays untouched.
- `~/.aws/config` has the new profile `shared-calendar-admin` (SSO session `shared-calendar`) beside
  the old `hello-admin`. I log in with the new one before we start.
- The local stack runs under the new names (`shared-calendar-local`). In the agent's
  non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if `node -v` is not
  22. Check `docker ps` for DynamoDB Local's port before passing `DYNAMODB_PORT`. After a
  Codespace start, the iptables rule of CLAUDE.md is needed before `local:api`.
- I cannot copy from the Codespace terminal. For each command I run, prepare it as
  `script -q -c "<command>" /tmp/step57-<name>.txt` and read the file yourself when I tell you it
  is done (`docs/RUNBOOK.md` section 2). Mask any e-mail address or token before quoting from it.
- This brief file is untracked when you read it. `deploy.sh` refuses any `git status --porcelain`
  output, untracked files included, so it must be committed before the `verify` that precedes the
  deploy. Ask me to commit it; do not commit yourself.

## The step

Prepare each item, tell me the exact command and what to expect, then stop for my go before every
cloud-changing command. After I tell you a command is done, read its recorded output and check the
result (read-only) before moving on.

1. **Zone.** A1 stays `Europe/Rome` (confirmed in step 55). Show me that the new stack gets it from
   the template default (nothing in `samconfig.toml`, nothing in the deploy command) and remind me
   that the new stack's first calendar data fixes it too. No answer needed unless I want to change
   it.
2. **Pre-flight, read-only:**
   - `aws sts get-caller-identity` with the new profile: the same account as step 55; the region
     all commands will use (`samconfig.toml`, no `AWS_REGION` set);
   - `describe-stacks --stack-name shared-calendar-api` must answer "does not exist";
     `list-change-sets` must show no leftover (a failed earlier attempt leaves a stack in
     `REVIEW_IN_PROGRESS`, `docs/RUNBOOK.md` section 3);
   - no table named `shared-calendar-api-calendar` or `shared-calendar-api-hello-messages` exists,
     and no log group `/aws/lambda/shared-calendar-api-*` (a leftover would block the create);
   - the old stack `hello-world-api`: status `UPDATE_COMPLETE`, unchanged since step 55 (record its
     `LastUpdatedTime` to compare at the end);
   - cost check: both stacks together provision 22/22 units, inside the free 25/25
     (`docs/RENAME_PLAN.md` section 7); any other provisioned table in the account would change
     that, so list the account's tables.
   Then, on my request, I commit this brief; the local stack is running; you run the root
   `DYNAMODB_PORT=<port> npm run verify` on the clean tree. It must end with
   `verify PASSED … (clean tree)`. Tell me then that I have 30 minutes to deploy and that no
   tracked or untracked file may change in between.
3. **Deploy (I run it)** with the command of the authorisation above. `--parameter-overrides` on
   the command line replaces the one in `samconfig.toml`, so it repeats `AdminUsername` and
   `FunctionArchitecture`; `CalendarTimeZone` stays out (default). The address is typed by me and
   never appears in the conversation, a file or a commit.
4. **The change set, before I answer `y`.** When the `[y/N]` prompt appears I tell you; you read
   the recorded output and, read-only, `describe-change-set`. Check:
   - **only Add**, 118 resources (the same template as step 55's stack: 25 functions with their
     roles, log groups and permissions, the 4 managed policies, the two tables, the user pool, its
     client, groups and admin user, the API and its stage, `AlarmTopic`, two alarms, the access log
     group);
   - the tables' physical names `shared-calendar-api-calendar` and
     `shared-calendar-api-hello-messages`;
   - nothing that names `hello-world-api` or its resources.
   Say plainly "answer y" or "answer N, because …". **I answer only after your verdict.** If the
   create fails, CloudFormation rolls back but cannot delete the protected tables and the user pool
   (`docs/RUNBOOK.md` section 3): diagnose from `describe-stack-events` (read-only) and propose,
   but do not run, any clean-up.
5. **After the deploy, read-only:** stack `CREATE_COMPLETE`; `sam list stack-outputs
   --stack-name shared-calendar-api` shows five outputs; both tables: provisioned (10/10 and 1/1),
   deletion protection on, empty; 25 functions, `arm64`, `nodejs22.x`, `CALENDAR_TIME_ZONE`
   `Europe/Rome` on the 21 that have it; the user pool with deletion protection on and the user
   `admin` in `FORCE_CHANGE_PASSWORD`; the two alarms in `OK` or `INSUFFICIENT_DATA`; one
   unauthenticated `curl` to a calendar route of the new `ApiUrl` answers 401.
6. **Alarm subscription.** The deploy sends the "AWS Notification - Subscription Confirmation"
   e-mail to the address. I confirm it **the same day**; you check
   `list-subscriptions-by-topic` on the new `AlarmTopic` (an ARN = confirmed). If it is missing or
   pending for long, prepare the `aws sns subscribe` of the authorisation.
7. **Admin password (I run it):** `npm run bootstrap-admin -w backend -- shared-calendar-api`.
   Hidden prompt, twice; the password never goes through the conversation. Afterwards check
   (read-only) that `admin` is `CONFIRMED`.
8. **Budget (I run it):** first `npm run budget -w backend -- shared-calendar-api --dry-run`, you
   read what it would create, then without `--dry-run`. Check `describe-budgets`: both
   `hello-world-api-monthly` and `shared-calendar-api-monthly`, 1 USD each.
9. **Smoke test (I run it):** `npm run smoke -w backend -- shared-calendar-api`. All 19 lines must
   say PASS (10 Hello World checks, 9 calendar checks). On a FAIL use the failure list of
   `docs/RUNBOOK.md` section 2.1; if a `CLEANUP FAILED:` line names an id left behind, prepare the
   clean-up calls in the order of that section and wait for my go: they change data.
10. **Checks after the smoke test, read-only:**
    - `shared-calendar-api-calendar` holds exactly the history of `docs/RUNBOOK.md` section 2.1 (the
      cancelled appointment, its pointer, its two events, the `DELETEDUSER` marker) plus the
      `LOCK` item; no type, window or `SETTINGS`;
    - `shared-calendar-api-hello-messages` holds the two smoke rows;
    - AC-36: the Logs Insights queries of `docs/RUNBOOK.md` section 2.1 over the three log groups,
      and over every log group of the new stack, return no row for the note and none for `/eyJ/`,
      with "records scanned" above 0 (rerun after a few minutes otherwise); and the raw events
      (`filter-log-events`) hold no note, token, password or error line;
    - the alarms did not fire; the subscription is confirmed;
    - the old stack `hello-world-api` is unchanged: same status and `LastUpdatedTime` as in item 2,
      its alarms and budget untouched;
    - cost: the forecast (`aws ce get-cost-forecast`, or "not yet visible", said plainly).
11. **Documents** (in the same change, after the checks):
    - `README.md`: the deployed-stack table gets the new stack's name, `ApiUrl`, `UserPoolId`,
      `UserPoolClientId`, tables and profile; the transition note above it says that the old stack
      `hello-world-api` stays, untouched, as the way back until plan step 58;
    - `CLAUDE.md`: the `docs/RENAME_PLAN.md` paragraph and the "Cloud" line: the stack in use is
      `shared-calendar-api`; `hello-world-api` stays until step 58;
    - `docs/RUNBOOK.md`: the header's "Old stack" row; section 5.4 gets the record of step 57
      (date, commit deployed, change set, admin password set, subscription confirmed, budget, smoke
      19/19, the results of item 10); section 5.3 if an item is settled or opened;
    - `docs/RENAME_PLAN.md`: status (step 57 done, stage B), and anything the deploy proved wrong;
    - `docs/IMPLEMENTATION_PLAN.md`: the status line, and step 57's text if the deploy proved it
      wrong;
    - `docs/AWS_ACCOUNTS.md`, `docs/ARCHITECTURE.md`: only if something proved different.

Not in this step:
- anything on `hello-world-api` (step 58 retires it, with its own brief);
- any change to `backend/src`, `shared/` or `frontend/`, or to `template.yaml`, unless a failure
  requires it; then stop, propose, test locally (`verify`, `smoke -- local`), commit on my request,
  verify again and ask for a new deploy go;
- step 59 (README calendar sections, closing v12, the tag `v1.1.0`).

## When something fails

- Stop at the first failure and report it with the exact output (redacting any address, password
  or token). Diagnose read-only first; say what you think happened and how sure you are.
- Never propose `sam delete`, deleting a table, removing deletion protection, a `--force`, or
  editing a resource by hand in the console as a fix. If a fix needs a cloud write, name it, say
  why, and wait for my go.
- A code or template fix goes through the normal gate: local tests, commit on my request, a new
  clean `verify`, a new deploy go.
- When the deploy proves a document wrong, say so and propose the change (CLAUDE.md, working
  rhythm); do not edit the spec or the architecture silently.

## Hard rules

- The admin password, the smoke user's password, any token and the alert e-mail address never
  appear in the conversation, a command line you write, a file or a commit.
- No cloud-changing command run by you; none run by me without your preparation and my go.
- Nothing on `hello-world-api` changes.
- Comments you touch follow CLAUDE.md "Comments"; lint must pass.

## Acceptance (`docs/IMPLEMENTATION_PLAN.md` step 57)

- `verify` green on the clean, committed tree less than 30 minutes before the deploy.
- The change set checked before my `y`: only Add, the tables named after the new stack, nothing
  of the old stack; stack `CREATE_COMPLETE` with five outputs.
- Alarm subscription confirmed the same day; admin `CONFIRMED`; budget
  `shared-calendar-api-monthly` 1 USD.
- Smoke test 19/19 PASS against `shared-calendar-api`, including the calendar journey of
  `docs/SHARED_CALENDAR_SPEC.md` section 18.4.
- The checks of item 10: the new tables' history as expected, deletion protection on, capacity
  10/10 and 1/1; AC-36 (no note, no token in any log); alarms not fired; the old stack unchanged;
  cost still about 0 USD (or "not yet visible", said plainly).
- `README.md` ids, `CLAUDE.md`, `docs/RUNBOOK.md` record, `docs/RENAME_PLAN.md` status and the plan's
  status line updated.

Report each result, including anything you could not check, then stop for review. This is a
checkpoint (new stack deployed): suggest the commit of the documents, but commit only when I ask.
Do not push, do not tag, and do not start step 58 or 59.
