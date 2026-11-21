# Front end — The hosting and the deployment: implementation plan

| | |
|---|---|
| Status | v1 — **planned, not started** (2026-11-21, brief `prompts/93-deploy-frontend.md`): steps 70 to 73 |
| Scope | Everything needed to go from the views that run locally to **the page in use on the web**: the hosting's template and the deploy command, logout, the first deployment, the documents. Steps 70 to 73 |
| Not in scope | The session across a reload, the size of the bundle, a domain of our own: the open points O3, O9 and O10 of `docs/FRONTEND_ARCHITECTURE.md` section 10. Any change to the API, to `shared/` or to a view beyond "Sign out" |
| Governed by | `docs/FRONTEND_ARCHITECTURE.md` section 13 (the hosting and the deployment), `docs/FRONTEND_SERVICES.md` (the services; logout from step 71), `docs/ARCHITECTURE.md` section 8.1 (the deploy gate) and `CLAUDE.md` (cloud safety, the hard rules). On any conflict with this plan, they win |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-21 | First version: steps 70 to 73. |

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
  proposes the change to that document.** Three things in it rest on AWS's documentation and
  on nothing run here yet; section 4 lists them, with the step that proves each.
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

Not settled, and settled by a step: the design of the logout service (step 71).

## 3. Steps

### Step 70 — The hosting's template and the deploy command (≈ 6 h, no cloud)

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

### Step 71 — Logout (≈ 5 h, no cloud)

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

### Step 72 — The first deployment (≈ 3 h, needs explicit instruction)

**Needs an explicit instruction, in the request that starts the step**, for:
`npm run deploy -w frontend` (it creates the stack `shared-calendar-web`, then uploads and
invalidates), and `npm run deploy -w backend` if the back end has changes not yet deployed.

1. Commit; on a clean tree, root `DYNAMODB_PORT=8002 npm run verify` green, less than 30
   minutes before.
2. If the stack `shared-calendar-api` is behind the repository: `npm run deploy -w backend`
   and its smoke test first (`docs/RUNBOOK.md` section 2).
3. `npm run deploy -w frontend`. Review the change set: only *Add*, six resources, all of
   section 13.2. A distribution takes some minutes to be ready the first time.
4. The command's four checks: all PASS.
5. In a browser, at the page's address, at a desktop and at a phone width:
   - the Administrator signs in (the first signed-in call through the distribution: the
     week loads, so the `Authorization` header arrived);
   - the checks of `docs/FRONTEND_WALK.md` that need no seeded data, and the others with data
     made by hand through the page (a type, a pattern, a User, a booking as that User). The
     local seed refuses any address but the laptop's, on purpose. Which checks were done, and
     which were not, is reported;
   - a refusal seen by one person is not seen by the next: sign out, ask
     `https://<page>/api/calendar` with curl and no token (401), sign in, and the week loads;
   - "Sign out", then a refresh with the old refresh token is refused by Cognito (step 71 in
     the cloud);
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

### Step 73 — Documentation and hand-over (≈ 2 h)

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
| The organization's policy refuses the creation of a CloudFront distribution (reading is allowed: `list-distributions` answered on 2026-11-21) | low | Found at step 72, point 3: the stack rolls back and nothing is left. Then: ask for CloudFront to be allowed for the account, or the account of `docs/NEW_ACCOUNT.md`, which has no such policy. A host without CloudFront (Amplify Hosting in `eu-north-1`) is the last resort: it is CloudFront underneath, and the decision goes back to `docs/FRONTEND_ARCHITECTURE.md` |
| The `Authorization` header does not reach the API through the managed policy `AllViewerExceptHostHeader` (AWS's pages say it passes on every header but `Host`, and name its sibling `AllViewer` for this header) | low | Seen at step 72, point 5, at the first sign-in: every call answers 401. Then an origin request policy of our own, or `AllViewer` with the `Host` put right by the function |
| CloudFront keeps a failure of the API although the time is set to zero, or keeps a status that cannot be set | low | Step 72, point 5, third check. Then `Cache-Control: no-store` on the API's answers, which is a change to the back end and a decision of its own |
| The function removes `/api` from a path it should not (`/apix`) | low | The rule's pattern is `/api/*`: nothing else reaches the function. The fourth check of the deploy command covers the route that does not exist |
| A person loads the page during an upload and gets a new script with an old page | low | Four files in a few seconds, `index.html` last; a reload ends it (`docs/FRONTEND_ARCHITECTURE.md` section 13.5) |
| cognito-local has no `RevokeToken`, so logout is proven only in the cloud | medium | Step 71 says so in the design; the unit tests fix the call's shape; step 72 proves it |
| Moving the gate's check into a shared file changes what the back end's deploy refuses | low | Moved word for word; step 70's acceptance tries the refusals of both commands by hand |
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
