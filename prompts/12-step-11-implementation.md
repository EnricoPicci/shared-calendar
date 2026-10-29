Implement plan step 11 (first cloud deployment), following CLAUDE.md's working rhythm.

Context from step 10 (commit fa867ca):
- All code, the integration suite and the operator scripts are done: `verify`, `deploy`,
  `bootstrap-admin <stack|local>`, `smoke <stack|local>` (see CLAUDE.md "Everyday commands").
  Architecture v6 describes the deploy gate: `npm run deploy` refuses unless `.verify-ok` is
  younger than 30 minutes, names HEAD, says `clean`, and the tree is still clean.
- Everything was tested against the local stack only (macOS, and Linux in a Debian container).
  First exercised in this step: reading the stack outputs and the `AdminUsername` parameter
  (`describe-stacks --query`), the region taken from `samconfig.toml`, `scripts/cognito.mjs`
  (sign-in and `AdminSetUserPassword`) with my real AWS login, and the global sign-out on
  delete (skipped locally through `SKIP_GLOBAL_SIGN_OUT`).
- This step creates real, billable resources. It is the plan's commit checkpoint after the
  smoke test passes.

How we work in this step (cloud safety overrides speed):
- I run every command that touches AWS or asks for a secret, in my own terminal:
  `npm run deploy -- --guided`, `npm run bootstrap-admin hello-world-api`,
  `npm run smoke hello-world-api`. The admin password never goes through the conversation.
  You prepare each step, tell me the exact command and what to expect, and read the output
  I paste back. Do not run them yourself, also not with `!`.
- You may run read-only AWS commands without asking (`aws sts get-caller-identity`,
  `aws cloudformation describe-stacks` / `describe-stack-events`, `sam list stack-outputs`,
  `aws dynamodb scan` on the cloud table, `aws budgets describe-budgets`, `aws sns
  list-subscriptions-by-topic`, `aws logs` reads). Anything that creates, changes or deletes
  (including `sam delete`, deleting a failed stack, or an `aws` write) needs my explicit go,
  per request.
- Never print, log or store the admin password, the smoke user's password or any token.

Before the deploy (prepare, then stop for my go):
1. Check my AWS login and account: `aws sts get-caller-identity` (with the profile I name).
   Tell me how the scripts and SAM will pick the profile (AWS_PROFILE) and the region, and
   make sure all three (`sam deploy`, `bootstrap-admin`, `smoke`) end up in the same region.
2. Walk me through the `sam deploy --guided` questions before I run it: stack name
   `hello-world-api`, region, `AdminUsername` (default `admin`; never changed after the first
   deploy, template.yaml explains why), `AlertEmail`, the IAM capability prompt, the change
   set confirmation, "save arguments to samconfig.toml" (yes, config env `default`). Point out
   which answers SAM writes into `samconfig.toml`, and check the result keeps the existing
   `local` sections and comments intact enough to stay readable.
3. Failure planning: if the first create fails, CloudFormation rolls back and leaves the stack
   in `ROLLBACK_COMPLETE`, which cannot be updated, only deleted. The DynamoDB table has
   deletion protection: say what a rollback does with it and what I would have to do by hand.
   Tell me how you would diagnose a failure (stack events, read-only) before proposing any fix.
4. With the local stack running (I start `DYNAMODB_PORT=8002 npm run local:up` and
   `npm run local:api`), run `DYNAMODB_PORT=8002 npm run verify` on the clean tree. It must
   say "clean tree". Then tell me I have 30 minutes to run the deploy.

Deploy and bootstrap (I run, you check):
5. I run `npm run deploy -- --guided`. Afterwards, read-only: stack status, `sam list
   stack-outputs` (four outputs: ApiUrl, UserPoolId, UserPoolClientId, MessagesTableName),
   the admin user exists in group `admin` with status FORCE_CHANGE_PASSWORD or similar
   until bootstrap, and no other users exist.
6. The guided deploy changed `samconfig.toml` (tracked), so the tree is now dirty. Review the
   diff with me; it is committed at the end of the step. Any later `npm run deploy` in this
   step needs a commit and a fresh verify first; say so if we need one.
7. I run `npm run bootstrap-admin hello-world-api`. If it fails, diagnose from the message
   (it never contains the password); the likely spots are the stack lookup, the region and
   the SDK credentials of `cognito.mjs`. Propose fixes as code changes, tested locally again
   (`bootstrap-admin local`, `smoke local`), before I retry.

Smoke test and console checks:
8. I run `npm run smoke hello-world-api`. Every check must PASS. Report each line. Unlike
   locally, the delete here also performs the global sign-out: check in the deleteUser logs
   (read-only) that it ran and that the request logged no token or password.
9. The plan's points 5 to 7: I confirm the SNS subscription e-mail; you check, read-only,
   that the subscription is confirmed, that the budget `hello-world-api-monthly` exists with a
   1 USD limit and AlertEmail as recipient, and that the two smoke rows are in the cloud table
   (I also look at DynamoDB, Explore items, in the console). The README does not exist yet
   (step 12 writes it): propose where to record ApiUrl, UserPoolId and UserPoolClientId until
   then, or leave it to step 12 and say so in the plan.
10. Check the logs of all four functions for the smoke run: one structured line per request,
    no tokens, no passwords, no create-user response body (CLAUDE.md hard rules).

Documents:
- If the cloud behaves differently from the architecture or the plan (status codes, error
  bodies, Cognito messages, deploy steps), say so and propose the document change; bump the
  architecture version and change log if it changes behaviour.
- Update CLAUDE.md with anything the next session needs (stack name, region, profile, how to
  run the cloud smoke test), but no secrets and no account-specific ids beyond what the stack
  outputs show.
- Add any surprise from the guided deploy to plan step 11, so a redeploy from scratch works
  from the plan alone.

Acceptance (plan step 11): smoke test PASS against the stack; `sam list stack-outputs` shows
the four outputs; SNS subscription confirmed and budget present; the two smoke rows visible in
the cloud table; AWS Cost Explorer forecast for the month 0 USD apart from the API Gateway
fraction of a cent (I check this one in the console; it can lag a day, so note it as pending
if needed). Report every result honestly, including anything skipped or pending.

Then stop for review. Step 11 is a commit checkpoint: when I ask, commit samconfig.toml, any
script fixes and document changes, with the checks in the message. Do not push unless asked.
