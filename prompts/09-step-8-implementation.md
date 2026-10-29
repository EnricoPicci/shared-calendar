  Implement plan step 8 (the `deleteUser` handler), following CLAUDE.md's working rhythm.

  Context from step 7 (commit 7abd5c5):
  - Follow src/handlers/createUser.ts for the shape: getClaims, then the checks, then one
    log line per request through src/lib/logger.ts with requestId, route, username,
    role, outcome, status and durationMs (error level for 5xx). "username" is the
    caller and "target" the account being deleted. Log target only once the path
    parameter has passed validation, so a rejected value is never echoed.
  - Use requireGroup, validate(UsernameParam, pathParameters.username), noContent and the
    functions in src/lib/cognito.ts (listGroups, globalSignOut, deleteUser,
    UserNotFoundError). The handler must not import the AWS SDK.
  - An admin target answers 403 { error: "cannot_delete_admin" }, also when the target is
    in both admin and user. A target in no group is deletable (architecture section 3).
  - Unit tests mock CognitoIdentityProviderClient with aws-sdk-client-mock and build the
    event by hand, as tests/unit/handlers/createUser.test.ts does (including the check
    of the exact command order). Cover every case the plan lists.
  - template.yaml already gives DeleteUserFunction the esbuild Banner that defines
    require(). If a local call returns SAM's {"message":"Internal server error"} instead
    of our error shape, import .aws-sam/build/DeleteUserFunction/deleteUser.mjs with
    node to see the real error. Only the local check catches bundling problems.
  - AdminListGroupsForUser and AdminUserGlobalSignOut reach cognito-local for the first
    time in this step (step 7 only used create, set password, add to group). If the
    emulator differs from real Cognito, report it and propose the change instead of
    bending the code to the emulator.

  Local stack: the stack runs with DYNAMODB_PORT=8002 (another project holds 8000). I'll
  have `DYNAMODB_PORT=8002 npm run local:up` and `npm run local:api` running before you
  get to the curl calls. Tell me when you need them, and remind me to restart local:api
  after a build.

  State left by step 7: bob exists in cognito-local (in group user, CONFIRMED) and has
  no messages in the table. His password was never shown, and the table is in memory,
  so set up the acceptance like this:
  1. Delete bob directly in the emulator (aws cognito-idp admin-delete-user against
     http://localhost:9229), then recreate him through POST /users as admin, capturing
     the returned password in a shell variable.
  2. Sign in as bob with it and call POST /hello, so that he has a message in the table.
  3. Then run the plan's checks: DELETE /users/bob returns 204, a second call returns
     404, DELETE /users/admin returns 403 cannot_delete_admin, and bob's message is
     still in the table (scan hello-messages on http://localhost:8002, or look in
     dynamodb-admin). Also check that alice gets 403 and that an invalid path
     (e.g. /users/Bob) gets 400.

  Sign in the way step 7 did: aws cognito-idp initiate-auth --endpoint-url
  http://localhost:9229 --auth-flow USER_PASSWORD_AUTH, with CLIENT_ID from
  env.local.json and dummy credentials (AWS_ACCESS_KEY_ID=local,
  AWS_SECRET_ACCESS_KEY=local, AWS_REGION=eu-west-1). Keep tokens and bob's password out
  of the output: hold them in shell variables and print only statuses and non-secret
  body fields. Put the script in the session scratchpad, not in the repository. Leave
  admin and alice in place; bob ends deleted.
