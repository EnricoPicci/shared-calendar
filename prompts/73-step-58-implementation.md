## Brief

Implement plan step 58, "Retire the old stack `hello-world-api`", following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review. This step deletes
the old stack `hello-world-api` (`eu-north-1`), its two tables, its user pool and its budget. The
stack in use, `shared-calendar-api` (created in plan step 57), is **not touched**. After this step
there is no way back to the old stack (`docs/RENAME_PLAN.md` section 4.3): every deletion is
prepared, read back and checked before I give my go, one command at a time. It writes no
application code.

**When.** Not before **2026-11-23**: `docs/RENAME_PLAN.md` section 6.3 asks for the new stack to be
in use for a while with no problem (one week as a minimum). Check today's date first; if it is
earlier, stop and say so.

**Explicit instruction (CLAUDE.md, "Cloud safety"; `docs/IMPLEMENTATION_PLAN.md` step 58).** With
this brief I authorise, for this step only, the following cloud actions, **run by me in my own
terminal** with `AWS_PROFILE=shared-calendar-admin`, each one only after you have prepared it, I
have seen the exact command and what it will do, and I have given my go in the conversation:
- `npm run smoke -w backend -- shared-calendar-api`, before the retirement (item 2) and after it
  (item 9);
- `aws dynamodb update-table --table-name hello-messages --no-deletion-protection-enabled`, and the
  same for `calendar` (the old stack's tables: plain names, no stack prefix);
- `aws cognito-idp update-user-pool` on the old stack's user pool, **only** to set
  `--deletion-protection INACTIVE`, with every other mutable attribute repeated as it is now (see
  item 5);
- `aws cloudformation delete-stack --stack-name hello-world-api`;
- if the delete ends in `DELETE_FAILED`, nothing more without a new go: diagnose first;
- `aws budgets delete-budget --account-id <account> --budget-name hello-world-api-monthly`
  (`--region us-east-1`);
- only if I choose it in item 8: `aws s3 rm --recursive` on the prefix `hello-world-api/` of the SAM
  upload bucket, never on anything else in that bucket;
- if a protection must be put back (item 6), the same `update-table` / `update-user-pool` with
  protection on again.

You do not run any of them yourself, also not with `!`, and the authorisation does not cover
anything else: nothing on `shared-calendar-api` except its smoke test (no deploy, no change, no
protection lifted, no delete), no `sam delete`, no `deploy`, no `--force`, no `--retain-resources`
without a new go, no deletion of anything in the SAM bucket outside `hello-world-api/`, no change to
IAM, Identity Center or the organization. Read-only AWS commands you may run without asking, once
my SSO session is valid: `aws sts get-caller-identity`, `aws cloudformation describe-stacks` /
`describe-stack-events` / `describe-stack-resources` / `list-stack-resources` / `list-stacks` /
`get-template` (on either stack), `sam list stack-outputs`, `aws dynamodb list-tables` /
`describe-table` / `scan` (either stack's tables), `aws cognito-idp describe-user-pool` /
`list-user-pools` / `list-users` / `admin-get-user`, `aws lambda list-functions`, `aws logs
describe-log-groups` and reads, `aws sns list-topics` / `list-subscriptions-by-topic`,
`aws cloudwatch describe-alarms` / `describe-alarm-history`, `aws budgets describe-budgets`,
`aws s3 ls` on the SAM upload bucket, `aws ce get-cost-forecast` / `get-cost-and-usage`. If the
login has expired, ask me to run `aws sso login --profile shared-calendar-admin --use-device-code`.

Read these in full first:
- `CLAUDE.md`, in particular "Cloud safety", the `deploy`, `smoke` and stack-target lines of
  "Everyday commands", the "Cloud" line, the rule on passwords and tokens, and "Comments" (any
  comment you touch follows it; `npm run lint` enforces it).
- `docs/RENAME_PLAN.md`, all of it: R1–R8, section 3 (stage C), section 4 (the way back, which
  this step ends), section 6.3 (this step), section 8 (risks).
- `docs/RUNBOOK.md`: sections 1, 2, 2.1, 3 (the note on protected resources and
  `--retain-resources`), 5.2 (what the old stack holds) and 5.4 (the record of step 57, the model
  for this step's record).
- `docs/IMPLEMENTATION_PLAN.md` step 58; `docs/AWS_ACCOUNTS.md`; `docs/ARCHITECTURE.md` sections 5.2,
  5.3, 9 and 10.
- `backend/scripts/deploy.sh` (the old-stack guard), `smoke.sh`, `target.sh`, `budget.sh`; the old
  stack's template as deployed (`aws cloudformation get-template --stack-name hello-world-api`, or
  `git show 340d9b0:backend/template.yaml`): no `DeletionPolicy` on any resource, so deleting the
  stack deletes the tables and the pool once their protection is off.

## Where we are (written 2026-11-16)

- Step 57 created `shared-calendar-api` from commit `4e22058` (record in `docs/RUNBOOK.md`
  section 5.4, committed in `cec35b9`). Its ids are in `README.md`. Check `git status -sb` and
  `git log` rather than trusting this line.
- The old stack `hello-world-api`: `UPDATE_COMPLETE`, `LastUpdatedTime` 2026-11-16 09:56:34 UTC,
  118 resources. It holds the user `admin`, the smoke tests' history in `calendar` (6 items on
  2026-11-16) and 4 rows in `hello-messages`; budget `hello-world-api-monthly` (1 USD); its alarm
  subscription confirmed. Nothing in it is needed by the new stack (R3: the new stack started
  empty).
- `~/.aws/config` has both profiles. Use `shared-calendar-admin` for every command, the old stack's
  included (same account `887083795157`, same role). I remove the `hello-admin` /
  `sso-session hello` sections myself at the end (item 10).
- I cannot copy from the Codespace terminal. For each command I run, prepare it as
  `script -q -c "<command>" /tmp/step58-<name>.txt` and read the file yourself when I tell you it
  is done. Mask any e-mail address or token before quoting from it.
- The local stack is not needed except for `verify` if a script changes (item 0); in the agent's
  non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## The step

Prepare each item, tell me the exact command and what to expect, then stop for my go before every
cloud-changing command. After I tell you a command is done, read its recorded output and check the
result (read-only) before moving on. Stop at the first surprise.

0. **Decision before anything else: the `deploy.sh` guard.** After this step no stack
   `hello-world-api` exists, so the guard no longer protects data; a deploy under that name would
   create a new, empty third stack (more than 25 provisioned units with two others,
   `docs/RENAME_PLAN.md` section 7). Propose keep (reworded comment and message: the name is
   retired) or remove, with your recommendation, and ask me. Whatever I choose is done in the
   documents change of item 11; if `deploy.sh` changes, lint and a `verify` follow.
1. **Pre-flight, read-only:**
   - `aws sts get-caller-identity`: account `887083795157`; region `eu-north-1`, no `AWS_REGION`;
   - the new stack `shared-calendar-api`: `CREATE_COMPLETE` or `UPDATE_COMPLETE`, alarms `OK` and no
     `ALARM` in their history since 2026-11-16, subscription confirmed, budget present, tables
     protected. Anything wrong here stops the step: the old stack is still the way back;
   - the old stack: status, `LastUpdatedTime` (unchanged since 2026-11-16 09:56:34 UTC), its
     resources (118), and their physical ids: the two tables, the user pool id, the SNS topic, the
     26 log groups (`/aws/lambda/hello-world-api-*`, `/aws/apigateway/hello-world-api-access`).
     Write them into a list: it is what must be gone at the end, and **every** command below names
     only ids from it;
   - nothing else uses the old stack's resources: no other stack exports or imports from it
     (`list-exports` / `list-imports`, read-only), and no function of the new stack names the old
     tables or pool in its environment;
   - recent use of the old API (its access log since step 57): anything but my own checks would
     mean someone still uses the old ids. Report it before going on.
2. **The new stack works (I run it):** `npm run smoke -w backend -- shared-calendar-api`: 19/19
   PASS. A FAIL stops the step: the old stack stays.
3. **Export, read-only, my choice:** scan both old tables and `describe-user-pool` / `list-users`
   into files **outside the repository** (for example `/tmp/step58-export-*.json`; they hold user
   ids, and the repository is public). Tell me what they hold (counts, kinds of items) and ask
   whether I want to keep them somewhere; the log groups are deleted with the stack and hold only
   smoke-test lines. Nothing is copied into the new stack (R3).
4. **Tables' deletion protection off (I run it, two commands, one go each):** `update-table
   --no-deletion-protection-enabled` on `hello-messages`, then on `calendar`, with `--region
   eu-north-1`. Before each, show me the table's `TableArn` from `describe-table` to prove it is
   the old stack's (no `shared-calendar-api-` prefix; the stack's resource list names it).
   Afterwards `describe-table`: `DeletionProtectionEnabled` false, everything else unchanged. The
   new stack's two tables stay protected: check them too.
5. **User pool's deletion protection off (I run it).** `update-user-pool` **resets every mutable
   attribute it is not given** (for example `AdminCreateUserConfig` would fall back to allowing
   self sign-up on the old pool until it is deleted). So:
   - save the pool's current `describe-user-pool` to `/tmp/step58-pool-before.json`;
   - build the request as a `--cli-input-json file:///tmp/step58-pool-update.json` from it: the
     pool id, every mutable attribute the pool has now (policies, `AdminCreateUserConfig`,
     `AccountRecoverySetting`, `UserPoolTier`, MFA, verification, tags, add-ons, `LambdaConfig`,
     and whatever else the CLI's `update-user-pool` accepts and the pool sets), and
     `DeletionProtection: INACTIVE`. Check it against `aws cognito-idp update-user-pool
     --generate-cli-skeleton` and show me the file and why each field is there;
   - after my run: `describe-user-pool` again, and a diff against the saved one that shows only
     `DeletionProtection` (and `LastModifiedDate`) changed. Any other difference: stop and report.
   The new stack's pool (`eu-north-1_mG58Opv7F`) stays `ACTIVE`: check it.
6. **Way back up to here.** Until item 7 runs, everything above can be undone with the same
   commands, protection on again. Say so before asking for the go of item 7; if I stop between 4
   and 7 (for example the session ends), the protections go back on the same day.
7. **Delete the stack (I run it):** `aws cloudformation delete-stack --stack-name hello-world-api
   --region eu-north-1`, then you watch it read-only (`describe-stack-events`) until
   `describe-stacks` answers "does not exist" (a deleted stack is still listed by `list-stacks` as
   `DELETE_COMPLETE`). `DELETE_FAILED`: read the first failed resource and its reason, say what you
   think happened and how sure you are, and propose; no `--retain-resources` without my go. Then,
   read-only: none of the ids of item 1's list exists any more (tables, pool, functions, log groups,
   topic, alarms), and the new stack's resources all still exist.
8. **Outside the stack:**
   - budget (I run it): `aws budgets delete-budget --account-id 887083795157 --budget-name
     hello-world-api-monthly --region us-east-1`; then `describe-budgets` shows only
     `shared-calendar-api-monthly`;
   - SAM upload bucket: list (read-only) what is under `hello-world-api/` (count, size) and what
     else is in the bucket; recommend keep or remove; on my choice to remove, prepare the
     `aws s3 rm --recursive` limited to that prefix, with a `--dryrun` first that I run too.
9. **The new stack after the retirement (I run it):** `npm run smoke -w backend --
   shared-calendar-api`: 19/19 PASS; then read-only: its alarms not fired, its budget and
   subscription in place, the account's provisioned capacity back to 11/11 (only the new stack's
   two tables), the cost (forecast, or "not yet visible", said plainly).
10. **Local profile (I do it):** I remove `[profile hello-admin]` and `[sso-session hello]` from
    `~/.aws/config`; you check with a read of the file's section headers only (no values quoted)
    that only the `shared-calendar` ones remain, and that `aws sts get-caller-identity` with
    `shared-calendar-admin` still works.
11. **Documents** (in the same change, after the checks):
    - `docs/RENAME_PLAN.md`: status "done" (stage C); section 4: 4.1 and 4.2 marked as history,
      4.3 the way that remains; section 6.3 what actually happened, where it differed; anything
      the step proved wrong;
    - `docs/RUNBOOK.md`: the header's "Old stack" row removed or turned into one line of history;
      section 5.4 gets the record of step 58 (date, what was exported, each command and its result,
      the delete's duration, the smoke tests before and after, the checks of items 7–9); the
      section 3 note about deleting a stack with protected resources, if the step showed it
      differently;
    - `CLAUDE.md`: the `docs/RENAME_PLAN.md` paragraph, the `deploy` line (guard, as decided in
      item 0) and the "Cloud" line: no old stack, no old profile;
    - `README.md`: the transition note above the deployed-stack table;
    - `docs/AWS_ACCOUNTS.md`: the old profile and the old stack;
    - `docs/IMPLEMENTATION_PLAN.md`: the status line, and step 58's text if the step proved it
      wrong; the text of completed steps keeps the old names (history);
    - `backend/scripts/deploy.sh`: as decided in item 0;
    - `docs/ARCHITECTURE.md`: only if something proved different (the v12 entry is closed in
      step 59, not here).
    Then `git grep -n -i -E 'hello-world-api|hello-local|hello-admin|sso-session hello'` outside
    `prompts/`: only history (change logs, `docs/RUNBOOK.md` section 5, completed plan steps,
    `docs/RENAME_PLAN.md`) and, if kept, the guard. `npm run lint` green; a `verify` only if
    `deploy.sh` changed.

Not in this step:
- any change to `shared-calendar-api`, `backend/src`, `shared/`, `frontend/` or `template.yaml`;
- step 59 (README calendar sections, closing architecture v12, the tag `v1.1.0`).

## When something fails

- Stop at the first failure and report it with the exact output (redacting any address, password
  or token). Diagnose read-only first; say what you think happened and how sure you are.
- Never propose a fix that touches `shared-calendar-api`, or a `--force`, or editing a resource by
  hand in the console. If a fix needs a cloud write not listed above, name it, say why, and wait for
  my go.
- When the step proves a document wrong, say so and propose the change (CLAUDE.md, working
  rhythm); do not edit the spec or the architecture silently.

## Hard rules

- Every cloud-changing command names one resource by its full name or id, read back from the old
  stack's resource list first; never a pattern, a prefix match or a loop.
- Nothing on `shared-calendar-api` changes except the smoke tests' rows and history.
- The admin password, any token and the alert e-mail address never appear in the conversation, a
  command line you write, a file in the repository or a commit; the exports stay outside the
  repository.
- No cloud-changing command run by you; none run by me without your preparation and my go.
- Comments you touch follow CLAUDE.md "Comments"; lint must pass.

## Acceptance (`docs/IMPLEMENTATION_PLAN.md` step 58)

- `describe-stacks --stack-name hello-world-api` answers that the stack does not exist; none of its
  resources remains (tables `calendar` and `hello-messages`, the user pool, the log groups, the
  topic, the alarms).
- The budget `hello-world-api-monthly` is gone; `shared-calendar-api-monthly` remains.
- The new stack's smoke test 19/19 PASS before and after; its tables and pool still protected; its
  alarms not fired.
- The old profile removed from `~/.aws/config`; the new one works.
- `docs/RENAME_PLAN.md` status "done"; `docs/RUNBOOK.md` record; `CLAUDE.md`, `README.md`,
  `docs/AWS_ACCOUNTS.md` and the plan's status line updated; the `git grep` of item 11 clean.

Report each result, including anything you could not check, then stop for review. Suggest the
commit of the documents, but commit only when I ask. Do not push, do not tag, and do not start
step 59.
