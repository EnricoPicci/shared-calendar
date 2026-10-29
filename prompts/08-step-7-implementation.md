  Implement plan step 7 (the `createUser` handler), following CLAUDE.md's working rhythm.

  Context from step 6 (commit bcc9249):
  - Follow src/handlers/hello.ts for the shape: getClaims, then the checks, then one
    log line per request through src/lib/logger.ts with requestId, route, username,
    role, outcome, status and durationMs (error level for 5xx). Here "username" is the
    caller; log the target as a separate field (e.g. target). The logger must never
    receive the response body or the password.
  - Use requireGroup, parseJsonBody, validate(CreateUserBody), generatePassword and the
    functions in src/lib/cognito.ts (createUser, setPermanentPassword, addToGroup,
    deleteUser, UserExistsError). The handler must not import the AWS SDK.
  - Unit tests mock CognitoIdentityProviderClient with aws-sdk-client-mock, as
    tests/unit/lib/cognito.test.ts does, and build the event by hand with
    requestContext.authorizer.lambda = { sub, username, groups } (see
    tests/unit/handlers/hello.test.ts). Cover every case the plan lists.
  - template.yaml already gives CreateUserFunction the esbuild Banner that defines
    require(). Without it the bundle crashes on load ("Dynamic require of node:https").
    If a local call returns SAM's {"message":"Internal server error"} instead of our
    error shape, import .aws-sam/build/CreateUserFunction/createUser.mjs with node to
    see the real error. Unit tests run the source, not the bundle, so only the local
    check catches bundling problems.
  - This is the first time cognito.ts talks to cognito-local rather than to a mock
    (plan section 5, medium risk). If the emulator differs from real Cognito, report it
    and propose the change instead of bending the code to the emulator.

  Local stack: another project holds port 8000 on this machine, so the stack runs with
  DYNAMODB_PORT=8002 (local-seed.sh now refuses the wrong port). I'll have
  `DYNAMODB_PORT=8002 npm run local:up` and `npm run local:api` running before you get
  to the curl calls. Tell me when you need them, and remind me to restart local:api
  after a build.

  For the acceptance check, sign in as admin and alice the way scripts/local-seed.sh
  does: aws cognito-idp initiate-auth --endpoint-url http://localhost:9229 --auth-flow
  USER_PASSWORD_AUTH, with CLIENT_ID from env.local.json and dummy credentials
  (AWS_ACCESS_KEY_ID=local, AWS_SECRET_ACCESS_KEY=local, AWS_REGION=eu-west-1). Keep
  the tokens and bob's generated password out of the output: capture the password in
  a shell variable, sign in as bob with it, and report only that the sign-in returned
  tokens with no challenge. Also check that alice gets 403 and that an invalid
  username gets 400. Leave bob in place afterwards: step 8's acceptance deletes him.
