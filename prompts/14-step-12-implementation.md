## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
export AWS_PROFILE=hello-admin
aws sso login --profile hello-admin --use-device-code
aws sts get-caller-identity                                 # must show the AdministratorAccess role
```

Explained in `docs/RUNBOOK.md` section 1. The AWS login is only needed for the read-only
`sam list stack-outputs` of item 1 below.

## Brief

Implement plan step 12 (documentation and hand-over), following CLAUDE.md's working rhythm.
Read `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md` (step 12 and section 7,
"definition of done") and `docs/RUNBOOK.md` first.

## Where we are (2026-11-04)

- Step 11 is done and committed (`7e52743`): stack `hello-world-api` in `eu-north-1`, admin
  password set, smoke test 10/10 PASS, budget `hello-world-api-monthly` created, SNS
  subscription confirmed. Commits since then added `docs/AWS_ACCOUNTS.md`,
  `docs/NEW_ACCOUNT.md` and, in `9191c28`, the monorepo layout documents
  (`docs/FOLDER_STRUCTURE.md`, `docs/FOLDER_MOVE_MAP.md`, brief 20). Nothing is pushed.
- Still open from step 11 (`docs/RUNBOOK.md` section 5): the Cost Explorer forecast check
  (mine, in the console); and the first deploy since `AlertEmail` left `samconfig.toml`
  must show no change to `AlarmTopic` in the change set (untested; there is no deploy in
  this step, so leave it noted in the runbook).
- Order of work: step 12 comes **before** the monorepo move. The README therefore describes
  the repository as it is today (flat layout, `src/`, `scripts/`, `template.yaml` at the
  root). The move step will update the paths and the commands in one go
  (`docs/FOLDER_MOVE_MAP.md` sections 3.8 and 3.9); write the README so that this is easy:
  paths and commands in one "Commands" section and one "Layout" line that points to the
  architecture, not scattered through the prose.

## How we work in this step

- No deploy and nothing that changes AWS. You may run read-only commands without asking:
  `sam list stack-outputs --stack-name hello-world-api` and
  `aws cloudformation describe-stacks`. `ApiUrl`, `UserPoolId` and `UserPoolClientId` are not
  secrets (plan step 11, item 8) and go into the README; the `AlertEmail` value, the account id
  and anything from `aws sts get-caller-identity` do not (the repository is public).
- The local stack is needed for the acceptance check: I start
  `DYNAMODB_PORT=8002 npm run local:up` and `npm run local:api` when you ask.
- No new libraries, no code change beyond what a documentation fix proves necessary. If a
  README sentence turns out to be wrong because a script behaves differently, fix the
  document first; propose a script change only if the behaviour is a bug.

## What to write

1. `README.md` at the root, for a colleague who knows TypeScript and basic AWS but has not
   read the architecture. In this order:
   - what the application does in five lines (the two roles, the three routes), and where the
     full story is (`docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`,
     `docs/RUNBOOK.md`, `docs/AWS_ACCOUNTS.md`, `docs/FOLDER_STRUCTURE.md` as "planned
     layout, not applied yet");
   - prerequisites, taken from plan step 0 (Node 22 via `.nvmrc`, Docker with Compose v2,
     SAM CLI, AWS CLI v2, git, curl), and the Codespace firewall rule;
   - the deployed stack: name, region, the three ids from the stack outputs, the CLI profile
     name, and one sentence on signing in (`docs/AWS_ACCOUNTS.md`);
   - the everyday commands: `local:up`, `local:api`, `verify`, `deploy`, `smoke`, each with
     the `DYNAMODB_PORT=8002` form where it matters, and what `verify` gates
     (`.verify-ok`, 30 minutes, clean tree). Link the full list in CLAUDE.md rather than
     repeating it;
   - how to use the API with curl, locally and in the cloud: sign in (`aws cognito-idp
     initiate-auth` with `USER_PASSWORD_AUTH`, the password typed at a prompt or read from
     a variable, never on the command line in the README's examples), `POST /hello`,
     `POST /users`, `DELETE /users/{username}`, with the expected status codes and error
     bodies of architecture section 4. Local accounts: `admin` / `Admin-Local-Pass-1!`,
     `alice` / `Alice-Local-Pass-1!`;
   - how the administrator creates and deletes users, hands the password over out of band,
     and why there is no password reset in v1 (one line, pointing to architecture 7.4);
   - where to look at the data: dynamodb-admin at `http://localhost:8001` locally, DynamoDB
     "Explore items" in the console in the cloud; where the logs are;
   - how to set or rotate the admin password (`npm run bootstrap-admin <stack|local>`), and
     the note that after `bootstrap-admin local` the integration tests need `local:up` again;
   - a short "Security in one paragraph": no secrets in the repository, least-privilege IAM
     roles, tokens and passwords never logged, `AlertEmail` never in `samconfig.toml`.
   Keep it under about 250 lines. Everything in it must be true of the code as committed:
   check each command against the script it names and each status code against the handler.
2. `docs/ARCHITECTURE.md`: status line to "v1 implemented" with today's date, and a change-log
   line (v9) that says so. Walk through the document once against the implementation and
   list, before editing, anything it still describes differently from what was built (for
   example the "≈ 150 lines" of `template.yaml` in 9.1, the `eu-west-1` in the overview
   diagram, section 14's assumption 6 "no front end is in scope", section 12 now that
   `docs/FOLDER_STRUCTURE.md` exists). Propose each fix, then apply the ones I confirm. Keep
   section 12 as the current layout with one sentence pointing to `docs/FOLDER_STRUCTURE.md`
   for the planned one; the move step rewrites it.
3. `docs/IMPLEMENTATION_PLAN.md`: mark step 12 done in the traceability or status, and add a
   step 13 "Monorepo move" stub that points to `docs/FOLDER_STRUCTURE.md` and
   `docs/FOLDER_MOVE_MAP.md` (the detailed brief for it comes later). Section 6 "Out of
   scope" stays.
4. `docs/RUNBOOK.md` section 5: tick what step 12 closes, keep the two open items.
5. CLAUDE.md: add the README to "Where the truth lives" (as the entry point, not as a source
   of truth), nothing else unless something proved wrong.

## Acceptance (plan step 12)

A colleague can follow the README from clone to a passing `npm run verify` without asking
questions. Check it the honest way: with the local stack running, execute the README's
commands in the order a newcomer would (`nvm use`, `npm ci`, `npm run local:up`,
`npm run local:api`, the curl sign-in and the three routes as `alice` and `admin`,
`DYNAMODB_PORT=8002 npm run verify`) and fix the README wherever the real output differs
from what it says. Report each result, including anything you could not run.

Then stop for review. When I ask, commit (README, document changes) and tag the commit
`v1.0.0` (annotated tag, message "v1: Hello World API deployed and smoke-tested"). Do not
push the commits or the tag unless asked.
