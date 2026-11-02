## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
export AWS_PROFILE=hello-admin
aws sso login --profile hello-admin --use-device-code
aws sts get-caller-identity                                 # must show the AdministratorAccess role
```

Explained in `docs/RUNBOOK.md` section 1. Keep `AWS_PROFILE` exported in every terminal used
for `bootstrap-admin`, `smoke` and `budget`.

## Brief

Continue plan step 11 (first cloud deployment) from where the previous session stopped.
Brief 12 (`prompts/12-step-11-implementation.md`) still applies in full, including how we work:
I run every command that changes AWS or asks for a secret; you may run read-only AWS commands;
the admin and smoke passwords never go through the conversation. Read `docs/RUNBOOK.md` first:
it is the operator summary written at the end of the previous session.

## Where we are (2026-10-30, end of session)

Done:
- AWS set up: an AWS Organization made by the console's multi-account setup; the stack lives in
  the member account "Identity Delegated Admin"; CLI profile `hello-admin` (IAM Identity Center,
  `aws sso login --profile hello-admin --use-device-code`). The organization policy allows
  regional services only in `eu-north-1`. Details: `docs/RUNBOOK.md` section 4.
- Commits since brief 12 (not pushed):
  - `bdf18f5` region `eu-north-1`, plan step 11 item 0, CLAUDE.md cloud line.
  - `36798a5` template parameter `FunctionArchitecture` (cloud `arm64`, local `x86_64` on x86
    machines via `local-api.sh`); architecture v7. Reason: in the Codespace, emulated arm64
    cold starts exceeded the 10 s timeout.
  - `f6dea38` budget moved out of `template.yaml` into `scripts/budget.sh` (`npm run budget`),
    because CloudFormation has no `AWS::Budgets::Budget` in `eu-north-1`; architecture v8;
    `samconfig.toml` holds the guided-deploy answers.
- Brief 12 items 1 to 5 done: `verify` passed on `f6dea38` (clean tree), and
  `npm run deploy` created the stack: `CREATE_COMPLETE`, 29 resources, four outputs
  (ApiUrl, UserPoolId, UserPoolClientId, MessagesTableName). Parameters: AdminUsername `admin`,
  FunctionArchitecture `arm64`. Only user: `admin`, in group `admin`, status
  `FORCE_CHANGE_PASSWORD`.
- Brief 12 item 6 mostly done: the `samconfig.toml` diff was reviewed and committed in
  `f6dea38` (SAM moved `stack_name` to the global section and added `region` there; comments
  restored by hand).

Uncommitted in the working tree: `docs/RUNBOOK.md` (new), this brief, and the "Current status"
line in `CLAUDE.md`. All belong in the step 11 commit. Because of them the tree is dirty: any
further deploy needs a commit and a fresh `verify` first.

Changes to this Codespace that a restart undoes (see `docs/RUNBOOK.md` section 1):
`sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT` before `npm run local:api`. Check it
with `sudo iptables-legacy -S FORWARD | head -3` and run it again if the rule is missing.

## What to do next, in order

1. Check the login (`aws sts get-caller-identity` with `AWS_PROFILE=hello-admin`) and, read-only,
   that the stack is still `CREATE_COMPLETE`.
2. Brief 12 item 7: I run `npm run bootstrap-admin hello-world-api`. Afterwards check, read-only,
   that `admin` is `CONFIRMED`.
3. Brief 12 item 8: I run `npm run smoke hello-world-api`; report every line. Check in the
   deleteUser logs that the global sign-out ran and that no token or password was logged.
4. New plan step 11 item 5: I run `npm run budget hello-world-api -- --dry-run`, then without
   `--dry-run`. This is the first real run of `scripts/budget.sh` (it was only tested against a
   stubbed AWS CLI); if it fails, diagnose from the message and propose a code change. Then check,
   read-only, `aws budgets describe-budgets --region us-east-1` and its notifications.
5. Brief 12 item 9: I confirm the SNS subscription e-mail; check it read-only, plus the two smoke
   rows in the cloud table. The README does not exist yet: leave recording ApiUrl / UserPoolId /
   UserPoolClientId to step 12 and say so in the plan, or propose a place.
6. Brief 12 item 10: logs of all four functions for the smoke run (one structured line per
   request, no tokens, no passwords, no create-user response body).
7. Acceptance of plan step 11, reported honestly; Cost Explorer forecast is my console check
   (may lag a day: note it as pending).
8. Documents: anything the cloud showed that differs from architecture or plan.

## Open decision for me

`samconfig.toml` contains my alert address (`AlertEmail` in `parameter_overrides`) and the GitHub
repository is public. Nothing is pushed yet. Remind me before any push. The proposed fix, if I
want it: CloudFormation keeps parameter values between deploys, so the address can be dropped
from `samconfig.toml` (later deploys pass `AlertEmail` with `UsePreviousValue`, or the guided
deploy is not saved with it) and the unpushed commits rewritten. Do not do it without my go.

## Then

Stop for review. Step 11 is a commit checkpoint: when I ask, commit the runbook, this brief,
any fixes and document changes, with the checks in the message. Remove the "Current status"
line from `CLAUDE.md` in that commit, or update it to point at the next step. Do not push.
