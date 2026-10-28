  Implement plan step 6 (the `hello` handler), following CLAUDE.md's working rhythm.

  Context from step 5 (commits 081bd75 and 4f1a584):
  - The authorizer passes { sub, username, groups } where groups is a JSON array
    string such as '["user"]'. Read it with getClaims from src/lib/auth.ts, never
    from the event directly. For unit tests, build the event by hand with
    requestContext.authorizer.lambda = { sub, username, groups }.
  - The authorizer writes no log line when it allows a request. Logging the
    outcome (requestId, route, username, role, outcome, durationMs) is the
    handler's job (architecture section 11). Log through src/lib/logger.ts.
  - Store messages through putMessage in src/lib/db.ts; the handler must not
    import the AWS SDK.
  - The handler is under src/handlers, so test:unit's 100 % line coverage
    threshold does not apply to it; cover the plan's cases anyway.

  For the acceptance check, sign in as alice and admin the way
  scripts/local-seed.sh does: aws cognito-idp initiate-auth --endpoint-url
  http://localhost:9229 --auth-flow USER_PASSWORD_AUTH, with CLIENT_ID from
  env.local.json and dummy credentials (AWS_ACCESS_KEY_ID=local,
  AWS_SECRET_ACCESS_KEY=local, AWS_REGION=eu-west-1). Keep the tokens out of
  the output.

  I'll have `npm run local:up` and `npm run local:api` running before you get
  to the curl calls. Tell me when you need them, and remind me to restart
  local:api after a build.
