## Brief

Implement plan step 55, "Cloud deployment", the fifteenth step of the shared calendar, following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for review.
This step puts the shared calendar into the real stack `hello-world-api` (`eu-north-1`). It is the
first stack update since plan step 11, so the first one after the monorepo move too. It writes no
application code: if a deploy, smoke or console check fails, diagnose first, propose the fix as a
code or document change, test it locally, and only then retry (see "When something fails").

**Explicit instruction (CLAUDE.md, "Cloud safety"; `docs/IMPLEMENTATION_PLAN.md` step 55).** With
this brief I authorise, for this step only, the following cloud actions, **run by me in my own
terminal**, each one only after you have prepared it and I have given my go in the conversation:
- `npm run deploy -w backend` (the stack update), with `--parameter-overrides AlertEmail=<address>`
  only if the fallback of item 3 below is needed;
- `npm run smoke -w backend -- hello-world-api`, which creates and deletes a real throw-away user
  and writes rows in `hello-messages` and `calendar`;
- if the alarm subscription turns out to be missing or unconfirmed, `aws sns subscribe` for the
  `AlarmTopic` (as in `docs/RUNBOOK.md` section 2 and plan step 11, item 6).

You do not run any of them yourself, also not with `!`, and the authorisation does not cover
anything else: no `sam delete`, no deleting or changing a stack, table, user, budget or policy, no
`--guided`, no `--no-confirm-changeset`, no second deploy without a new go from me. Read-only AWS
commands you may run without asking, once my SSO session is valid (`AWS_PROFILE=hello-admin`):
`aws sts get-caller-identity`, `aws cloudformation describe-stacks` / `describe-stack-events` /
`describe-change-set` / `list-stack-resources`, `sam list stack-outputs --stack-name
hello-world-api`, `aws dynamodb describe-table` and `scan` on the cloud tables, `aws logs`
reads and Logs Insights queries (`start-query` / `get-query-results` only read), `aws sns
list-subscriptions-by-topic`, `aws cloudwatch describe-alarms`, `aws budgets describe-budgets`,
`aws ce get-cost-forecast`. If the login has expired, ask me to run
`aws sso login --profile hello-admin --use-device-code`.

Read these in full first:
- `CLAUDE.md`, in particular "Cloud safety", the `deploy`, `smoke`, `verify` and stack-target
  lines of "Everyday commands", the rule on passwords and tokens in scripts, and "Comments" (any
  comment you touch follows it; `npm run lint` enforces it).
- `docs/IMPLEMENTATION_PLAN.md`: section 3 "Shared calendar" ("How these steps are run"), step 11
  (what the first deploy found: the region check, the expired SNS subscription, the budget outside
  the template) and step 55, all of it.
- `docs/RUNBOOK.md`, all of it: section 2 (updating the stack, the change-set rules, the
  `CalendarTimeZone` and `AdminUsername` rules), section 2.1 (the smoke test's calendar journey,
  its failure messages, the AC-36 query), section 5 (the items still open after step 11, two of
  which this deploy settles).
- `docs/SHARED_CALENDAR_SPEC.md`: section 1.3 (the zone cannot change once data exists), section
  14 (deployment: the table, 14.3 the four shared policies, 14.4 configuration, 14.5 logging),
  section 18.4 (the smoke journey) and section 22, assumption A1.
- `docs/ARCHITECTURE.md`: section 7.1 (IAM), section 9 (alarms and budget), section 10 (cost).
- `backend/template.yaml` (Parameters, `CalendarTable`, the four `Calendar…Policy` resources, the
  roles, `AlarmTopic`, the two alarms, Outputs), `backend/samconfig.toml`,
  `backend/scripts/deploy.sh`, `backend/scripts/verify.sh`, `backend/scripts/smoke.sh`,
  `backend/scripts/target.sh`.

## Where we are (2026-11-16)

- Steps 41–54 are done and committed; the back end has its 21 calendar routes and the services
  layer is complete. After step 54 came documentation only (`docs/journeys/`, the skill
  `explain-journey`). Check `git status -sb` and `git log` rather than trusting this line: at the
  time of writing `main` was at `61f729f`, even with `origin`.
- The stack in the cloud is still step 11's (deployed 2026-11-02, commit `7e52743`): 4 functions,
  `hello-messages`, the user pool, `AlarmTopic`, `AuthorizerErrorsAlarm`, `Api5xxAlarm`, budget
  `hello-world-api-monthly`. Since then `backend/template.yaml` has grown to 25 functions: the
  calendar, `ListUsersFunction`, and a calendar part in `DeleteUserFunction` and its role.
- `backend/samconfig.toml` has no `AlertEmail` (removed after step 11, public repository) and no
  `CalendarTimeZone`, so the template default `Europe/Rome` applies.
- This brief file is untracked when you read it. `deploy.sh` refuses any `git status --porcelain`
  output, untracked files included, so it must be committed before the `verify` that precedes the
  deploy (item 2 below). Ask me to commit it; do not commit yourself.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22. Check `docker ps` for DynamoDB Local's port before passing `DYNAMODB_PORT`
  (it has been 8002 and 8000 on different days). After a Codespace start, the iptables rule of
  CLAUDE.md is needed before `local:api`.

## The step

Prepare each item, tell me the exact command and what to expect, then stop for my go before every
cloud-changing command. After I paste the output back, read it and check it (read-only) before
moving on.

1. **A1, one last time.** Show me where the zone comes from (template default, nothing in
   `samconfig.toml`, nothing in the deploy command) and ask me to confirm `Europe/Rome`. After the
   first calendar data exists it cannot be changed (`docs/SHARED_CALENDAR_SPEC.md` section 1.3).
   Do not go on without my answer.
2. **Pre-flight, read-only:**
   - `aws sts get-caller-identity` (the account of step 11) and the region all three commands will
     use (`samconfig.toml`, no `AWS_REGION` set);
   - `describe-stacks` on `hello-world-api`: status `CREATE_COMPLETE` or `UPDATE_COMPLETE`, the
     stored parameters (that `AlertEmail` is set, without printing it in the conversation: say
     only that it is present, and mask it if a command shows it), the four outputs of step 11;
   - `aws sns list-subscriptions-by-topic` on `AlarmTopic`: confirmed (an ARN) or not. If it is
     missing or `PendingConfirmation`, prepare the re-subscribe command for after the deploy;
   - the size of what changes: the resources the template adds compared with the stack's
     `list-stack-resources`, so that the change set can be checked against a list (item 4).
   Then, on my request, I commit this brief; I start `local:up` and `local:api` if they are not
   running; you run the root `DYNAMODB_PORT=<port> npm run verify` on the clean tree. It must end
   with `verify PASSED … (clean tree)`. Tell me then that I have 30 minutes to deploy and that no
   tracked or untracked file may change in between.
3. **Deploy (I run it):** `npm run deploy -w backend`, without `AlertEmail`. SAM should reuse the
   value stored with the stack; this is untested (`docs/RUNBOOK.md` section 5). If the deploy asks
   for the address or fails on it, stop: the fallback is
   `npm run deploy -w backend -- --parameter-overrides AlertEmail=<address>`, typed by me, never
   written into `samconfig.toml` or into the conversation. Note that `parameter_overrides` in
   `samconfig.toml` and on the command line do not merge; tell me what the fallback command
   therefore has to contain, read from `samconfig.toml`, before I run it.
4. **The change set, before I answer `y`.** I paste it; you check it against your list:
   - *Add*: `CalendarTable`, the four managed policies `CalendarReadPolicy`, `CalendarWritePolicy`,
     `CalendarDeletePolicy`, `CalendarBookPolicy`, the 21 new functions with their roles, log groups
     and permissions, and the new routes and integrations;
   - *Modify*: `DeleteUserFunction`, `DeleteUserRole`, the API, and the four old functions' code
     (new bundles that include `shared/`, first deploy after the monorepo move);
   - **no change to `AlarmTopic`** (`docs/RUNBOOK.md` section 5); any change to it is an N;
   - **any Remove or Replace of `MessagesTable`, `CalendarTable`, `UserPool`, `AdminUser`,
     `AdminGroup`, `UserGroup` or `UserPoolClient`: tell me to answer N**, and investigate
     read-only;
   - anything not on the list: name it and explain it before I answer.
   Say plainly "answer y" or "answer N, because …". If the update fails, CloudFormation rolls back
   to the step-11 stack (`UPDATE_ROLLBACK_COMPLETE`); diagnose from `describe-stack-events`
   (read-only) and say what the rollback did with `CalendarTable` (deletion protection on), before
   proposing anything.
5. **After the deploy, read-only:** stack status `UPDATE_COMPLETE`; `sam list stack-outputs` shows
   five outputs, `CalendarTableName` among them; `describe-table calendar`: provisioned 10/10,
   deletion protection on, empty; the function count; the two alarms in `OK` or
   `INSUFFICIENT_DATA` and unchanged; one unauthenticated `curl` to a calendar route answers 401
   (no token needed, no data written).
6. **Smoke test (I run it):** `npm run smoke -w backend -- hello-world-api`. It prompts for the
   admin password, which never goes through the conversation. All 19 lines must say PASS (10 Hello
   World checks, 9 calendar checks, `docs/RUNBOOK.md` section 2.1). On a FAIL use the failure list
   of `docs/RUNBOOK.md` section 2.1; if a `CLEANUP FAILED:` line names an id left behind, prepare
   the clean-up calls in the order of that section and wait for my go: they change data.
7. **Checks after the smoke test, read-only** (by you where the CLI can read it, otherwise as
   console steps for me):
   - the `calendar` table holds exactly the history of `docs/RUNBOOK.md` section 2.1: the cancelled
     smoke appointment, its pointer, its two events and the `DELETEDUSER` marker; no type, no
     window, no `SETTINGS` change by the smoke test (read `SETTINGS`, if it exists, and say what
     wrote it);
   - `hello-messages` holds the two new smoke rows;
   - AC-36 in the cloud: the Logs Insights query of `docs/RUNBOOK.md` section 2.1 over the log
     groups of `BookAppointmentFunction`, `ListAppointmentsFunction` and
     `CancelAppointmentFunction` (the last hour) returns no row for the note and none for `/eyJ/`;
     run it over every calendar log group too and report the count;
   - the alarms did not fire (`Api5xxAlarm` would show an invalid zone);
   - the SNS subscription is confirmed (if I re-subscribed, I confirm the e-mail the same day);
   - the budget still exists with 1 USD; the cost forecast (`aws ce get-cost-forecast` if
     permitted, otherwise the console) is still about 0 USD: 11/11 provisioned units, inside the
     free 25/25 (`docs/ARCHITECTURE.md` section 10). Cost data can lag a day: say so rather than
     guess.
8. **Documents** (in the same change, after the checks):
   - `docs/RUNBOOK.md`: the deployment record of step 55 (date, commit deployed, change-set
     summary, smoke 19/19, the results of item 7); close the section 5 items this deploy settled
     (`AlertEmail` reuse, `AlarmTopic` unchanged, first deploy after the move) or say what stays
     open; fix anything the deploy proved wrong in sections 2 and 2.1;
   - `docs/IMPLEMENTATION_PLAN.md`: the status line (step 55 done, deployed), and step 55's text
     if the deploy proved a step wrong;
   - `docs/ARCHITECTURE.md`: only if the deploy proved something different (for example a cost or
     an IAM detail); the v12 entry stays open until step 56;
   - `CLAUDE.md`: only if a command or a cloud note proved wrong;
   - `README.md` is step 56's (the calendar routes and curl examples); here only if one of its
     stack ids changed, which it should not.

Not in this step:
- any change to `backend/src`, `shared/` or `frontend/`, or to `template.yaml`, unless a failure
  requires it; then stop, propose, test locally (`verify`, `smoke -- local`), commit on my request,
  verify again and ask for a new deploy go;
- the CORS gap and anything of `docs/FRONTEND_ARCHITECTURE.md`; no front end is deployed;
- step 56 (README calendar sections, closing v12, the tag `v1.1.0`).

## When something fails

- Stop at the first failure and report it with the exact output (redacting any address, password
  or token). Diagnose read-only first; say what you think happened and how sure you are.
- Never propose `sam delete`, deleting a table, removing deletion protection, a `--force`, or
  editing a resource by hand in the console as a fix. If a fix needs a cloud write, name it, say
  why, and wait for my go.
- A code or template fix goes through the normal gate: local tests, commit on my request, a new
  clean `verify`, a new deploy go.
- When the implementation or the deploy proves a document wrong, say so and propose the change
  (CLAUDE.md, working rhythm); do not edit the spec or the architecture silently.

## Hard rules

- The admin password, the smoke user's password, any token and the alert e-mail address never
  appear in the conversation, a command line, a file or a commit.
- No cloud-changing command run by you; none run by me without your preparation and my go.
- Comments you touch follow CLAUDE.md "Comments"; lint must pass.

## Acceptance (`docs/IMPLEMENTATION_PLAN.md` step 55)

- A1 confirmed by me before the deploy.
- `verify` green on the clean, committed tree less than 30 minutes before the deploy.
- The change set checked against the list, no Remove or Replace of a data resource, no change to
  `AlarmTopic`; stack `UPDATE_COMPLETE` with five outputs including `CalendarTableName`.
- Smoke test 19/19 PASS in the cloud, including the calendar journey of
  `docs/SHARED_CALENDAR_SPEC.md` section 18.4.
- The checks of item 7: the calendar table's history as expected, deletion protection on,
  capacity 10/10; AC-36 in the cloud (no note, no token in any log); alarms unchanged and not
  fired; subscription confirmed; cost still about 0 USD (or "not yet visible", said plainly).
- `docs/RUNBOOK.md` deployment record and the plan's status line updated.

Report each result, including anything you could not check, then stop for review. This is a
checkpoint (deployed): suggest the commit of the documents, but commit only when I ask. Do not
push, do not tag, and do not start step 56.
