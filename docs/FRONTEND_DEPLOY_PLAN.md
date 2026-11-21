# Front end — The hosting and the deployment: implementation plan

| | |
|---|---|
| Status | v5 — **done** (2026-11-21): steps 70 to 73 (briefs `prompts/94-step-70-implementation.md` to `prompts/97-step-73-implementation.md`). The template and the deploy command are written, "Sign out" revokes, **the page is deployed** (stack `shared-calendar-web`) and the documents say so. **Done with checks of step 72 still owed**, at the deployed page: a refresh with the revoked token refused by the real Cognito, a session renewed after its fifteen minutes, "Sign out" with the network off, a reload and the console, and the rest of the walk with the phone width. They are listed under step 72 and are the open items of `docs/RUNBOOK.md` section 5.5; until they are done, nothing says that they hold. The plan stays in the repository as the record of the order of work |
| Scope | Everything needed to go from the views that run locally to **the page in use on the web**: the hosting's template and the deploy command, logout, the first deployment, the documents. Steps 70 to 73 |
| Not in scope | The session across a reload, the size of the bundle, a domain of our own: the open points O3, O9 and O10 of `docs/FRONTEND_ARCHITECTURE.md` section 10. Any change to the API, to `shared/` or to a view beyond "Sign out" |
| Governed by | `docs/FRONTEND_ARCHITECTURE.md` section 13 (the hosting and the deployment), `docs/FRONTEND_SERVICES.md` (the services; logout from step 71), `docs/ARCHITECTURE.md` section 8.1 (the deploy gate) and `CLAUDE.md` (cloud safety, the hard rules). On any conflict with this plan, they win |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-21 | First version: steps 70 to 73. |
| v2 | 2026-11-21 | Step 70 done, with what it found. AWS's documentation says the cache policy `CachingDisabled` keeps no failure: the template sets nothing for failures, and the risk's row and step 72's check of it are reworded (the old check asked for a 401, which CloudFront never keeps). Step 72: the dry run first, what the change set must show, the statuses of the four checks, what the deployment is the first to prove. |
| v3 | 2026-11-21 | Step 71 done, with what it found: cognito-local implements `RevokeToken`, so the sign-out has an integration journey, and the risk's row is reworded. **Corrected: the dry run of step 70 was run** after that step's commit (2026-11-21, on commit `0e695a7`) and passed; the note under step 70 and point 1 of step 72 said it had not been. Step 72, point 5: what the first deployment must prove of logout, written out as steps a person follows at the deployed page. |
| v4 | 2026-11-21 | Step 72 done: the first deployment, with what differed from the plan and what was not done. Section 4: each risk says whether it came true. |
| v5 | 2026-11-21 | Step 73 done, with what differed from the plan: the plan is done, with the checks of step 72 that were not made still owed. Section 1: what rested on AWS's documentation was seen at step 72. |

---

## 1. How to use this plan

The plan is a sequence of **steps**, numbered after the last step of
`docs/FRONTEND_VIEW_PLAN.md` (69). It follows the working rhythm of `CLAUDE.md`: one step at a
time, its acceptance check, an honest report (failures included), then a stop for review. Commit
only when asked.

- Paths are from the repository root.
- Effort figures are indicative. Total: about 16 hours.
- **Steps 70 and 71 touch no cloud resource.** They are written and checked on the laptop.
- **Step 72 acts on the cloud and needs an explicit instruction**, in the request that starts
  it, for each command that creates or changes something (`CLAUDE.md`, cloud safety). Read-only
  commands (`describe-stacks`, `list-distributions`, curl against the page) need only a session.
- **When a step proves `docs/FRONTEND_ARCHITECTURE.md` section 13 wrong, the step stops and
  proposes the change to that document.** Three things in it rested on AWS's documentation and
  on nothing run here when the plan was written; section 4 lists them, with what step 72 showed
  of each.
- The back end's template, `shared/` and the views are not changed by this plan, except the
  shell's "Sign out" at step 71. If a step needs more, it stops and reports it.
- Steps 70 and 71 do not depend on each other; step 72 needs both.

## 2. What is settled before the first step

`docs/FRONTEND_ARCHITECTURE.md` v13:

| Point | Decided | Where |
|---|---|---|
| O1, the hosting | A private S3 bucket behind a CloudFront distribution, stack `shared-calendar-web`, on the address AWS gives | Sections 13.1, 13.2 |
| O2, the CORS gap | One origin: `/api/…` passed on to the API by the distribution; the back end unchanged | Section 13.3 |
| O5, the Content-Security-Policy | `default-src 'self'` with Cognito's address, and three more headers | Section 13.4 |
| The deploy command | `npm run deploy -w frontend`: gate, the back end's outputs, `sam deploy`, build, upload, invalidation, four checks | Section 13.6 |
| O7, logout | The direction only: `RevokeToken`, then the session cleared whatever the answer | Section 13.7 |

Not settled then, and settled by a step: the design of the logout service (step 71, done:
`docs/FRONTEND_SERVICES.md` section 20; the order of row O7 became "the session cleared, then
`RevokeToken`").

## 3. Steps

### Step 70 — The hosting's template and the deploy command (≈ 6 h, no cloud) — done

**Done 2026-11-21** (brief `prompts/94-step-70-implementation.md`). What was built is said in
`docs/FRONTEND_ARCHITECTURE.md` section 13 (v14) and its decisions 154 to 158; what differs from
the list below:

- No status is set to "not kept": AWS's page says `CachingDisabled` keeps no failure, so the
  distribution has no `CustomErrorResponses` (`docs/FRONTEND_ARCHITECTURE.md` section 13.3,
  rule 3).
- The three ids of the managed policies were read again on AWS's pages and are the brief's.
- `frontend/samconfig.toml` also holds `fail_on_empty_changeset = false`, and names no bucket
  for artifacts and no capabilities: read in SAM CLI's source, not tried by deploying.
- `npm run verify -w frontend` now needs the SAM CLI.
- `docs/FRONTEND_WALK.md` did not change: no check says the policy's words.
- The dry run could not pass its gate inside the step: it needs a committed tree and a fresh
  stamp, and the step ends before the commit. **It was run after the commit** (2026-11-21, on
  commit `0e695a7`) **and passed**: the gate, the front end's `verify`, the read of the back
  end's stack, the build. Step 72 runs it again all the same, as its first command.

The step as planned:

Builds everything of `docs/FRONTEND_ARCHITECTURE.md` sections 13.2 to 13.6 that can exist
without a deployment.

- `frontend/template.yaml`: the bucket, its policy (four objects by name), the origin access
  control, the function, the response headers policy, the distribution with its two rules;
  the parameter `ApiDomain`; the outputs `PageUrl`, `BucketName`, `DistributionId`. Every
  resource with a comment in plain words (`CLAUDE.md`, "Comments").
- `frontend/samconfig.toml`: the stack's name and region, `confirm_changeset`; no value of a
  deployment.
- `scripts/deploy-gate.sh`: the check of the stamp, moved out of `backend/scripts/deploy.sh`
  word for word; `backend/scripts/deploy.sh` uses it and behaves as before.
- `frontend/scripts/deploy.sh` and the script `deploy` of `frontend/package.json`: the nine
  points of section 13.6. It has a `--dry-run` that does points 1, 2 and 5 and says what
  points 3, 4 and 6 to 8 would do, changing nothing.
- `frontend/package.json`: `verify` also runs `sam validate --lint` on the template.
- `frontend/scripts/dev.mjs`: the Content-Security-Policy of section 13.4 without Cognito's
  address.
- To check against AWS's documentation while writing, not from memory: which statuses
  CloudFront keeps for a failed answer and how the time is set to zero without replacing the
  answer (section 13.3, rule 3); the ids of the three managed policies.
- Documents: `docs/FOLDER_STRUCTURE.md` (the tree, section 7), `CLAUDE.md` (the folder map, the
  commands), `docs/FRONTEND_WALK.md` if the dev server's new policy changes what a check says.

**Acceptance:**
- `sam validate --lint` on `frontend/template.yaml` is green; `npm run lint` at the root is
  green (the comments' references included).
- The gate, tried by hand: `npm run deploy -w frontend` and `npm run deploy -w backend` each
  refuse, naming the reason, with no stamp, with an old one, with a dirty tree. Neither gets
  past the gate in this step.
- `npm run deploy -w frontend -- --dry-run`, with a session, reads the back end's stack,
  builds, prints what it would upload and where, and changes nothing; `frontend/dist/app.js`
  holds `/api` and Cognito's real address and no `localhost`.
- The walk's login and one screen, in a browser, under the dev server's new policy: no new
  report in the console.
- Root `DYNAMODB_PORT=8002 npm run verify` green.

### Step 71 — Logout (≈ 5 h, no cloud) — done

**Done 2026-11-21** (brief `prompts/95-step-71-implementation.md`), in two parts with a review
between them: the design (`docs/FRONTEND_SERVICES.md` v8, section 20), then the code. What was
built is said there and in `docs/FRONTEND_ARCHITECTURE.md` sections 6 and 13.7 (v16); what
differs from the list below, or adds to it:

- **The order is the reverse of the direction first written**: the page forgets the person at
  once and Cognito is told after, with a time limit of 10 seconds. Decided before the design;
  `docs/FRONTEND_ARCHITECTURE.md` section 13.7 and its decision 152 were corrected.
- **cognito-local implements `RevokeToken`**, and then refuses a refresh with the revoked
  token: so there is an integration journey, `frontend/tests/integration/logout.service.test.ts`
  (7 tests), with its page `docs/journeys/frontend/logout.md`.
- A sign-out also puts the two page-wide services (login, refresh) back to their first state:
  their last outcome named the person.
- The person sees the login and nothing about Cognito's answer: the design's answer to "what
  the person sees while Cognito is asked and when it does not answer".
- In the browser, beyond the acceptance: Cognito silent (the request held), where the request
  is given up after 10 seconds and another person signs in meanwhile.
- **Not proven here, and so for step 72** (its point 5): that a browser may make the call from
  the deployed page's address, and what the real Cognito answers.
- The back end, `shared/`, the hosting's template and the deploy scripts did not change.

The step as planned:


- **Design first**, as a new version of `docs/FRONTEND_SERVICES.md`: the service that signs
  out, in the pattern of its section 3 (one result/state pair; the token never in a result),
  from the direction of `docs/FRONTEND_ARCHITECTURE.md` section 13.7. The design says what
  the person sees while Cognito is asked and when it does not answer, and what the row
  "logout" of its section 4.8 becomes. **Stop for review of the design before the code.**
- Then: `cognito.ts` gains the call, the service and its types, the shell's "Sign out" uses
  it, unit tests to the 100 % of `frontend/src`, the shell's test of a second person still
  green (nothing of the first left in the page).
- Find out whether cognito-local implements `RevokeToken`. If it does: an integration journey
  (a refresh after a sign-out is refused), with its page under `docs/journeys/`. If not: say
  so in the design, the unit tests carry it locally, and step 72 proves it in the cloud.
- Documents: `docs/FRONTEND_ARCHITECTURE.md` (section 6, point 2; O7 closed),
  `docs/FRONTEND_WALK.md` (the check of "Sign out"), `CLAUDE.md`.

**Acceptance:**
- `npm run verify -w frontend` green, coverage 100 %.
- In a browser, against the local stack: "Sign out" shows the login at once, also with the
  local Cognito stopped; nothing of the person is left in the page or the address.
- No token in a log, a result, a state or the console.

### Step 72 — The first deployment (≈ 3 h, needs explicit instruction) — done

**Done 2026-11-21** (brief `prompts/96-step-72-implementation.md`). The record, with the
change set, the outputs, every check and who did it, is `docs/RUNBOOK.md` section 5.5. In
short, and what differs from the list below:

- **Deployed from the branch `deploy-frontend`**, commit `646b706`, by the operator; the
  session with Claude Code prepared, read and checked, and ran nothing that writes to AWS.
- **The back end was not behind** (no change to `backend/src`, `backend/template.yaml` or
  `shared/src` since the commit deployed at `docs/IMPLEMENTATION_PLAN.md` step 57): point 2
  was not needed. The brief had taken `npm run deploy -w backend` out of the step in any case.
- **Points 1, 3 and 4 as planned:** the dry run passed; the change set was six *Add* and was
  read before it was confirmed; no bucket of SAM's own; the four checks PASS. The stack was
  complete three and a half minutes after the confirmation.
- **Point 5, in a browser: a shorter list than planned was done**, at a desktop width only.
  Seen: the Administrator and a throw-away User signed in and their calls were answered
  through the distribution (**the `Authorization` header arrives**); a wrong password and two
  usernames refused; the settings shown; a type, patterns, a date's windows, bookings made
  and everything removed again; **`RevokeToken` answered 200 from the page's address**. The
  404 asked twice was done with curl in point 6: two different request ids, **no failure is
  kept**.
- **Point 5, not done**, and open items of `docs/RUNBOOK.md` section 5.5: **a refresh with
  the revoked token refused** (sub-point 4), "Sign out" with the network off (sub-point 5),
  the console, the phone width, the rest of the walk's checks; and, asked by the brief beyond
  this list, a session renewed after its fifteen minutes.
- **The brief changed three things of the list below:** a `RevokeToken` blocked by the
  browser would not have stopped the step (it was not blocked); the phone width was to be
  looked at only where the width can change the answer; the sizes were read with curl, not
  from the browser's network panel.
- **Point 6:** as planned, and more (the bucket's policy and public-access settings, the
  distribution's rules, the headers on every kind of answer). **Found:** the API's access log
  shows the caller's own address for the page's calls, not CloudFront's
  (`docs/FRONTEND_ARCHITECTURE.md` section 13.3, corrected), and a path that is no route
  leaves no line in it. The Cost Explorer forecast still has no data.
- **Point 7:** `app.js` is downloaded as 121 kB, compressed with Brotli
  (`docs/FRONTEND_ARCHITECTURE.md` section 13.5).
- **Point 8** and the acceptance's second deployment: done; it said "No changes to deploy"
  and its four checks passed.
- **Left in the real calendar, as history:** two cancelled appointments of the deleted User
  `walk-d1`, their events and its deleted-user marker.

The step as planned:

**Needs an explicit instruction, in the request that starts the step**, for:
`npm run deploy -w frontend` (it creates the stack `shared-calendar-web`, then uploads and
invalidates), and `npm run deploy -w backend` if the back end has changes not yet deployed.

1. Commit; on a clean tree, root `DYNAMODB_PORT=8002 npm run verify` green, less than 30
   minutes before. Then `npm run deploy -w frontend -- --dry-run`, run once already after
   step 70's commit, when it passed, and run again here because the tree has changed since:
   it reads the back end's stack, builds, and says what it would do;
   `frontend/dist/app.js` holds `/api` and Cognito's real address and no `localhost`.
2. If the stack `shared-calendar-api` is behind the repository: `npm run deploy -w backend`
   and its smoke test first (`docs/RUNBOOK.md` section 2).
3. `npm run deploy -w frontend`. Review the change set: only *Add*, six resources, all of
   `docs/FRONTEND_ARCHITECTURE.md` section 13.2. SAM must not create or ask for a bucket of
   its own for artifacts (if it does, `frontend/samconfig.toml` is wrong: stop). A
   distribution takes some minutes to be ready the first time.
4. The command's four checks: all PASS (`/` 200 with the policy, `/app.js` 200, `/api/calendar`
   401, `/api/no-such-route` 404, the last two with the API's own JSON).
5. In a browser, at the page's address, at a desktop and at a phone width:
   - the Administrator signs in (the first signed-in call through the distribution: the
     week loads, so the `Authorization` header arrived);
   - the checks of `docs/FRONTEND_WALK.md` that need no seeded data, and the others with data
     made by hand through the page (a type, a pattern, a User, a booking as that User). The
     local seed refuses any address but the laptop's, on purpose. Which checks were done, and
     which were not, is reported;
   - a failure of the API is not kept: ask `https://<page>/api/no-such-route` twice with
     curl within ten seconds (a 404, the status CloudFront keeps longest where caching is
     on). The two answers must carry different `apigw-requestid` headers: the API answered
     twice. The same id twice is a kept answer. No route of this API answers a `GET` with a
     failure that depends on the person, so this is the check there is; a 401 proves nothing
     here, CloudFront never keeps one, and only a `GET` or a `HEAD` is ever kept;
   - **logout, which only the cloud can prove** (step 71 proved it against the local
     emulator; `docs/FRONTEND_SERVICES.md` section 20.9). With the browser's developer tools
     open on the network panel, "Preserve log" ticked, signed in as a User:
     1. Press "Sign out". The login shows at once.
     2. In the network panel, find the request to `cognito-idp.<region>.amazonaws.com` sent
        at that moment: its request header `X-Amz-Target` ends in `RevokeToken`. **Its status
        must be 200.** A line in red, or "CORS error", means the browser was not allowed to
        make the call: the person was signed out of the page all the same and nothing on the
        page says so, which is why this is looked at here. If so: stop and report it; the
        way out is a decision (`docs/FRONTEND_ARCHITECTURE.md` section 13.7).
     3. The console holds no new line about that request.
     4. **A refresh with the revoked token is refused.** In the network panel, right-click the
        *sign-in* request of before (`X-Amz-Target` ending in `InitiateAuth`) and copy its
        *response*; it holds the session's `RefreshToken`. In a terminal, with the client id
        of the stack (`UserPoolClientId`), ask Cognito for a refresh with it:
        `InitiateAuth`, `AuthFlow` `REFRESH_TOKEN_AUTH`, `AuthParameters.REFRESH_TOKEN`. The
        token goes to the command on standard input or from a variable read with
        `read -s`, never as an argument and never into a file (`CLAUDE.md`). The answer must
        be `400 NotAuthorizedException`. Do the same once *before* signing out, with a
        second sign-in, to see a 200: otherwise a mistyped request also "refuses".
     5. Sign in again: it works. Sign out with the tab's network set to "Offline": the login
        shows at once all the same;
   - the console: `zod`'s one report and no other.
6. Read-only checks: the bucket is not public (its address answers 403 directly); the
   distribution's price class; the API's access log shows the page's calls; the Cost Explorer
   forecast.
7. The size of what a person downloads, read from the browser's network panel, noted in
   `docs/FRONTEND_ARCHITECTURE.md` section 13.5 (open point O9).
8. `docs/RUNBOOK.md`: the deployment record; the procedure "releasing the page" as a step of
   its section 2; how the stack is deleted (the bucket emptied first).

**Acceptance:** the four checks PASS; the checks of point 5, with the list of the walk's
checks done; a second `npm run deploy -w frontend` with no change says that no resource
changes and ends with the four checks. Checkpoint: the page is deployed.

### Step 73 — Documentation and hand-over (≈ 2 h) — done

**Done 2026-11-21** (brief `prompts/97-step-73-implementation.md`). Documents only: no file
under `frontend/`, `backend/`, `shared/` or `scripts/` changed, and nothing was deployed. What
differs from the list below:

- **The plan is called done with checks still owed.** The checks of step 72 that were not made
  on 2026-11-21 were not made in this step either, by decision: they stay open items of
  `docs/RUNBOOK.md` section 5.5, in the same words, and wherever a document says that this plan
  is done it names them. No document says that one of them holds.
- **`CLAUDE.md` was not changed**, by decision. The sentences of it that this step leaves
  untrue (this plan's entry says "73 is not started"; the versions it names for
  `docs/FRONTEND_ARCHITECTURE.md`) are listed in the step's report, with the words that would
  make each true.
- **Every sentence put in the present tense was checked first**: against the template and the
  deploy script, and against the stack with read-only commands and curl with no credentials (the
  stack and its six resources, the bucket's policy and settings, the distribution's rules, the
  headers; noted at the end of `docs/RUNBOOK.md` section 5.5). **One sentence was found wrong
  that way**: `docs/FRONTEND_ARCHITECTURE.md` section 13.4 said that `zod`'s one report is seen
  in the console under the distribution's policy; the console at the deployed page has not been
  looked at.
- **More documents than the list names**: `docs/RUNBOOK.md` (read as a colleague with a clean
  clone: which steps for which change, the order of the two deployments, the tools, the
  profile, the port, who signs in at the page after a release, the branch to release from
  while `deploy-frontend` is not merged), `docs/AWS_ACCOUNTS.md` and `docs/NEW_ACCOUNT.md` (the
  second stack), `docs/FRONTEND_WALK.md` (where the walk stands at the deployed page), and one
  sentence or two each in `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`,
  `docs/SHARED_CALENDAR_SPEC.md` and `docs/RENAME_PLAN.md`, which still called the front end
  future, undeployed or stopped by the CORS gap.
- **Left as written**: the change logs, the "step as planned" of this plan, and section 2 of
  `docs/FRONTEND_VIEW_PLAN.md` (what was open when that plan started): they are history.
- **The work is on the branch `deploy-frontend`**, not merged into `main` and not pushed: a
  clone of `main` holds neither the hosting's template nor the deploy command until it is.

The step as planned:

- `docs/FRONTEND_ARCHITECTURE.md`: section 13 in the present tense of what is built, status
  line, the open points as they stand; anything the deployment proved different.
- `README.md`: the page's address among the deployed stack's ids, "the front end is not
  deployed anywhere yet" gone, the command that releases it.
- `CLAUDE.md`: "What this project is", "Where the truth lives", the commands, the folder map.
- `docs/FOLDER_STRUCTURE.md` section 7 and `docs/FRONTEND_SERVICES.md` section 10.3: the gap
  is closed, and how.
- This plan: status "done".

**Acceptance:** no document still says that the front end is deployed nowhere or that the
hosting is open; a colleague can follow `docs/RUNBOOK.md` from a clean clone to a release of
the page.

## 4. Risks

| Risk | Likelihood | What is done |
|---|---|---|
| The organization's policy refuses the creation of a CloudFront distribution (reading is allowed: `list-distributions` answered on 2026-11-21) | low. **Did not come true** (step 72: the distribution was created) | Found at step 72, point 3: the stack rolls back and nothing is left. Then: ask for CloudFront to be allowed for the account, or the account of `docs/NEW_ACCOUNT.md`, which has no such policy. A host without CloudFront (Amplify Hosting in `eu-north-1`) is the last resort: it is CloudFront underneath, and the decision goes back to `docs/FRONTEND_ARCHITECTURE.md` |
| The `Authorization` header does not reach the API through the managed policy `AllViewerExceptHostHeader` (AWS's pages say it passes on every header but `Host`, and name its sibling `AllViewer` for this header) | low. **Did not come true** (step 72: signed-in calls answered 200) | Seen at step 72, point 5, at the first sign-in: every call answers 401. Then an origin request policy of our own, or `AllViewer` with the `Host` put right by the function |
| CloudFront keeps a failure of the API although AWS's page says the cache policy `CachingDisabled` keeps none (`docs/FRONTEND_ARCHITECTURE.md` section 13.3, rule 3) | low. **Did not come true** (step 72: a 404 asked twice was answered twice by the API) | Step 72, point 5, third check. Then `CustomErrorResponses` with the time at zero for the statuses it keeps, or `Cache-Control: no-store` on the API's answers, which is a change to the back end and a decision of its own |
| The function removes `/api` from a path it should not (`/apix`) | low. **Did not come true** (step 72: `/api` and `/apix` went to the bucket, 403) | The rule's pattern is `/api/*`: nothing else reaches the function. The fourth check of the deploy command covers the route that does not exist |
| A person loads the page during an upload and gets a new script with an old page | low | Four files in a few seconds, `index.html` last; a reload ends it (`docs/FRONTEND_ARCHITECTURE.md` section 13.5) |
| The browser is not allowed to call `RevokeToken` from the page's address (AWS's pages do not speak of browsers; Cognito answers one for the login, at the same address with the same headers). cognito-local does have the call, so everything else of logout is proven locally (step 71) | low. **Did not come true** (step 72: answered 200) | Step 72, point 5, the check of logout: the request's status in the network panel. A person is signed out of the page in any case; what would be lost is the revocation. Then: the call passed through the distribution like `/api`, or the limit accepted and written down. A decision, not a fix made in passing |
| Moving the gate's check into a shared file changes what the back end's deploy refuses | low. **Did not come true** (step 72: the page's deploy passed the gate twice; the back end's has not been run since the move) | Moved word for word; step 70 tried the refusals of both commands by hand (no stamp, an old one, a dirty tree, and for the back end a stamp in the wrong format, of another commit, of a dirty run). What nobody has seen since the move is a deploy that *passes* the gate: step 72 is the first |
| `sam deploy` wants a bucket for the template after all, or refuses a template without `Transform` | low. **Did not come true** (step 72: `Deployment s3 bucket : None`, the template accepted) | Read in SAM CLI's source at step 70, not run. Seen at step 72, point 3, before anything is created. Then `resolve_s3 = true` in `frontend/samconfig.toml` |
| The bill | low | The free allowances cover this size; the account's 1 USD budget watches the whole bill (`docs/FRONTEND_ARCHITECTURE.md` section 13.8) |

## 5. Order of work and checkpoints

```
70 template + deploy command ──┐
                               ├──► 72 first deployment (explicit instruction) ──► 73 documents
71 logout (design, then code) ─┘
```

Suggested checkpoints to commit: after step 70, after step 71, and before step 72 in any case
(the deploy needs a clean, committed tree).

This plan does not wait for `docs/IMPLEMENTATION_PLAN.md` step 58 (the old stack
`hello-world-api` retired), and that step does not wait for this plan: the page talks to
`shared-calendar-api` only.
