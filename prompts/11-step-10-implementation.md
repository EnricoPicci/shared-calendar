Implement plan step 10 (scripts, verification gate and operator tooling), following
CLAUDE.md's working rhythm.

Context from step 9 (commit f61b95c):
- All handlers, the authorizer and the integration suite are done. `test:unit` and
  `test:integration` exist; `RUN_INTEGRATION=1 npm run test:integration` runs journeys
  1-12 against the local stack and is green. `npm audit --audit-level=high` currently
  reports 0 vulnerabilities.
- This step adds the scripts of the plan's step 10 table: `audit`, `verify`, `deploy`,
  `bootstrap-admin`, `smoke`, and `scripts/deploy.sh`, `scripts/bootstrap-admin.sh`,
  `scripts/smoke.sh`. No production code changes, no new libraries. Scripts are bash
  (`#!/usr/bin/env bash`, `set -euo pipefail`) in the style of `scripts/local-seed.sh`.
  Update CLAUDE.md's "Everyday commands" ("More scripts arrive in step 10") when done.

Conflicts to resolve first (CLAUDE.md: the architecture wins; propose a document change
rather than silently diverging):
- Architecture 8.1 says "`npm run deploy` ... (the deploy script calls `verify` first)";
  the plan says `deploy.sh` refuses unless `.verify-ok` exists, is younger than 30 minutes
  and matches `git rev-parse HEAD`. CLAUDE.md also says "the deploy script enforces this".
  Tell me which you recommend before writing deploy.sh. My leaning is the plan's
  `.verify-ok` gate (verify needs the local stack running, which deploy should not have
  to start), with architecture 8.1 updated to match.
- The plan says `sam deploy --config-env <env>`, but samconfig.toml has only `default`
  (cloud) and `local` (no deploy section). Say how deploy.sh picks the environment; the
  simplest is no argument and the default config env.

verify:
- Order: typecheck, lint, audit, `sam validate --lint`, test:unit, test:integration.
  Stop at the first failure. Write `.verify-ok` only on full success; add it to .gitignore.
- It must set `RUN_INTEGRATION=1` itself. Without it test:integration runs nothing and
  exits 0, and verify would be green without the integration tests. Pass `DYNAMODB_PORT`
  through (I run the stack with 8002). If the stack is down, verify fails through the
  integration globalSetup; do not start the stack from verify.
- `.verify-ok` content: the commit hash and the epoch seconds, so deploy.sh can check
  both without `stat` (its flags differ between macOS and Linux). Think about uncommitted
  changes: a verify run on a dirty tree tests code that HEAD does not contain. Either
  refuse to write `.verify-ok` when `git status --porcelain` is not empty, or have
  deploy.sh refuse a dirty tree. Pick one and say why.

deploy.sh:
- Refusal messages name what is wrong (missing, too old, other commit, dirty tree) and
  exit 1. After the checks: `npm run build` (not bare `sam build`: SAM needs the
  project's esbuild on the PATH), then `sam deploy`.
- Cloud safety: never run the real deploy in this step. Test only the refusal paths
  (no `.verify-ok`, stale, wrong hash). If you want to show that the success path gets
  as far as `sam deploy`, stop and ask me first.

bootstrap-admin.sh `<stack|local>`:
- `local`: pool id from env.local.json, endpoint http://localhost:9229, dummy credentials
  (AWS_ACCESS_KEY_ID=local, AWS_SECRET_ACCESS_KEY=local, AWS_REGION=eu-west-1, unset
  AWS_PROFILE), exactly as local-seed.sh does. Stack: `UserPoolId` from the stack outputs
  (`aws cloudformation describe-stacks`, read-only) and the real credentials.
- Username: the `AdminUsername` parameter (default `admin`); local is always `admin`.
- Password: `read -s`, asked twice, must match; check the pool policy locally (12+ chars,
  upper, lower, digit, symbol) before calling Cognito, with a clear message. Then
  `admin-set-user-password --permanent`. Never echo it, never write it to disk, never put
  it in a log line. Passing it as a CLI argument makes it visible in `ps` for the
  duration of the call: either keep it out of argv (e.g. `--cli-input-json` fed from
  stdin) or tell me why that is not worth it, and note the residual risk.
- The script must not create users or change group membership: it only sets the password.

smoke.sh `<stack>`:
- Reads `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `MessagesTableName` from the outputs,
  prompts for the admin password (`read -s`), signs in, and runs journeys 3, 4, 6 and 11
  with a throw-away user `smoke-<timestamp>`: /hello as admin, create the user, sign in
  as that user, /hello as that user, check both rows in DynamoDB (architecture 9.3), then
  delete the user and check that sign-in now fails. PASS/FAIL per check, exit non-zero on
  any failure. Delete the throw-away user even when an earlier check failed (trap), and
  report if that cleanup fails.
- Tokens and the generated password stay in variables; never print them, also not in
  curl's verbose output or error messages.
- Its real run is step 11. If you can run it against the local stack cheaply (a `local`
  target reading env.local.json and http://127.0.0.1:3000, DynamoDB on DYNAMODB_PORT),
  propose it before building it: it would let us test the script now. Note that locally
  the global sign-out is skipped (SKIP_GLOBAL_SIGN_OUT), so the smoke test proves
  revocation only in the cloud.

Acceptance (plan step 10): `npm run verify` passes and writes `.verify-ok`;
`npm run deploy` without a prior verify prints the refusal and exits 1 (also show the
stale and wrong-commit refusals); `npm run bootstrap-admin local` followed by sign-in as
admin with the new password works against the emulator. Afterwards, set the local admin
password back to `Admin-Local-Pass-1!` (rerunning `npm run local:up` does that), so the
integration suite still passes. Report every result honestly, then stop for review.
Step 10 is not a commit checkpoint; commit only when I ask.

Local stack: I'll have `DYNAMODB_PORT=8002 npm run local:up` and `npm run local:api`
running. Tell me when you need them, and remind me to restart local:api after a build.
