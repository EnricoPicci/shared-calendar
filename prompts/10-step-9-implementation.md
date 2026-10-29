  Implement plan step 9 (integration tests), following CLAUDE.md's working rhythm.

  Context from step 8 (commit 02a014c):
  - All three handlers and the authorizer are done and unit-tested. This step adds no
    production code: tests/integration/setup.ts and tests/integration/journeys.test.ts as
    the plan describes, plus a `test:integration` npm script (it does not exist yet; e.g.
    `vitest run --project integration`). vitest.config.ts already defines the
    integration project and selects files only when RUN_INTEGRATION=1. Add the new
    script to CLAUDE.md's "Everyday commands".
  - The tests may use the AWS SDK directly (InitiateAuth against cognito-local, Scan
    against DynamoDB Local): the "handlers never import the AWS SDK" rule is about
    src/handlers, not tests. Use the clients already in package.json; add no libraries.
  - Error bodies to assert (architecture v5, section 4): 403 { error: "forbidden" } for
    the wrong role, 403 { error: "cannot_delete_admin" }, 404 { error: "user_not_found" },
    409 { error: "user_exists" }, 400 { error: "invalid_request" } with a message naming
    the field (e.g. "Invalid input: username"). A missing token is answered by API
    Gateway with 401 and a garbage token with 403, both with API Gateway's own
    { message } body (architecture v3). If sam local answers either differently from
    the architecture, report it and propose the change instead of bending the test.
  - cognito-local 5.3.0 does not implement AdminUserGlobalSignOut. env.local.json sets
    SKIP_GLOBAL_SIGN_OUT=true for DeleteUserFunction, so locally a delete does not revoke
    refresh tokens (architecture section 8, note on Cognito emulation). Do not write a
    test that expects revocation; the step 11 smoke test covers it against real Cognito.
    "Sign-in as carol now fails" (journey 11) does work locally: the account is gone.
  - Under sam local every event carries the same fake requestId; do not assert on it.

  Repeatability: the acceptance is "green twice in a row". The plan uses carol as the
  throw-away user, so a run that fails between journeys 6 and 11 leaves carol behind and
  the next run's journey 6 would answer 409. Make the suite tolerate that: before
  journey 6, remove carol directly in cognito-local if she exists (AdminDeleteUser against
  http://localhost:9229, ignoring UserNotFoundException). Message rows are never deleted
  (architecture: history), so assert on the rows a journey just wrote (by messageId),
  never on table counts. Do not touch admin or alice beyond signing in.

  Secrets: tokens and carol's generated password must never appear in test output. Keep
  them in variables, do not pass them to expect() in a way that prints them on failure
  (assert on presence and length, not on the value), and do not log them.

  Local stack: the stack runs with DYNAMODB_PORT=8002 (another project holds 8000). The
  globalSetup port check and scanMessages() should read DYNAMODB_PORT (default 8000)
  rather than hard-code 8002. Sign-in needs CLIENT_ID from env.local.json and dummy
  credentials (AWS_ACCESS_KEY_ID=local, AWS_SECRET_ACCESS_KEY=local,
  AWS_REGION=eu-west-1); the users are admin / Admin-Local-Pass-1! and
  alice / Alice-Local-Pass-1! (CLAUDE.md). I'll have `DYNAMODB_PORT=8002 npm run
  local:up` and `npm run local:api` running before you run the suite. Tell me when you
  need them, and remind me to restart local:api after a build.

  State left by step 8: admin and alice exist; bob was deleted; the table holds one
  message from bob, which the suite must ignore. No carol exists.

  The step 8 acceptance checked these by hand; the suite now covers them for good
  (they map onto the plan's journeys with carol in bob's place): a user-only caller
  gets 403 on delete (9), an invalid path such as /users/Bob gets 400 naming the field
  (add it next to journey 8), deleting admin gets 403 cannot_delete_admin (10), the
  first delete gets 204 with no body and the second 404 user_not_found (11, 12), the
  deleted user's message row is still in the table and the deleted user can no longer
  sign in (11).

  Acceptance: RUN_INTEGRATION=1 npm run test:integration green twice in a row, and
  npm run test:unit still green. Report both runs' results, then stop for review. Step 9
  is one of the plan's commit checkpoints, but commit only when I ask.
