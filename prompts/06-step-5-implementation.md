  Implement plan step 5 (the authorizer), following CLAUDE.md's working rhythm.

  Context from step 4 (commit e5736f8):
  - src/lib/auth.ts `getClaims` expects the authorizer context to be
    { sub, username, groups } where groups is a JSON array string. The
    authorizer's output must match that exactly.
  - Log through src/lib/logger.ts: `log(level, { requestId, ... })`. It already
    hides fields named password/authorization/token, but still never pass the
    token or the raw header.
  - `test:unit` enforces 100 % line coverage on src/lib only; the authorizer is
    under src/handlers and is not covered by that threshold.

  For the acceptance check's curl calls, I'll have `npm run local:up` and
  `npm run local:api` running before you get there. Tell me when you need them.