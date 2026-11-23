## Brief

Implement plan step 70, "The hosting's template and the deploy command"
(`docs/FRONTEND_DEPLOY_PLAN.md`), the first step of the front end's deployment, following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review. One stop at the end. The design is decided (`docs/FRONTEND_ARCHITECTURE.md` section 13)
and completed by the "Design points" below: there is no early stop for them.

This step gives `frontend/` its SAM template, its `deploy` command and what that command needs,
so that the step after it can be one command. **It creates, changes and deletes nothing in the
cloud**: no `sam deploy`, no change set, no upload, no invalidation. Read-only `aws` commands
(`describe-stacks`, `list-distributions`) are allowed. It changes nothing in `shared/`, in
`frontend/src/` or in `backend/`, except `backend/scripts/deploy.sh`, whose check of the stamp
moves to a file both deploy scripts use.

Read these in full first:
- `CLAUDE.md`, in particular:
  - "Cloud safety" and "Hard rules from the design" (no wildcard action or resource; nothing of
    a secret in a log, an argument or a file);
  - the "Comments" section (`npm run lint` enforces it on `#` comments of shell, YAML and TOML
    files too, so `verify` does);
  - "Tooling and style": infrastructure explained in plain terms; no library, tool or AWS
    service the documents do not call for;
  - the last entries of "Everyday commands": what the scripts may use (bash 3.2 and 5, macOS
    and Linux, node, the AWS CLI, curl, git; no jq, no `sed -i`, no here-string for a secret).
- `docs/FRONTEND_ARCHITECTURE.md` section 13, all of it: the source of truth for this step.
  Also its section 10 (the open points as they stand), section 11, decisions 138 to 153, and
  section 12 (the build and the dev server).
- `docs/FRONTEND_DEPLOY_PLAN.md`: sections 1 and 2, step 70, step 72 to see what this step must
  leave ready, and section 4 (the risks).
- `docs/FOLDER_STRUCTURE.md` sections 2, 4.5, 5 and 7.
- `docs/ARCHITECTURE.md` section 8.1 (the deploy gate).

Then read the code this step builds on:
- `backend/scripts/deploy.sh`, `backend/scripts/verify.sh`, `backend/scripts/target.sh`,
  `backend/scripts/check-sam.sh`, `backend/scripts/smoke.sh` (how a check prints PASS or FAIL),
  `backend/samconfig.toml`, and in `backend/template.yaml` the top comments, one resource with
  its comments, and the `Outputs`.
- `frontend/scripts/build.mjs`, `frontend/scripts/bundle.mjs`, `frontend/scripts/dev.mjs`,
  `frontend/package.json`, the root `package.json`.
- `scripts/check-doc-references.mjs` and `scripts/doc-references.mjs`: which files the comment
  check reads, so that the new ones are read too.

## Where we are (2026-11-21)

- The views are complete (`docs/FRONTEND_VIEW_PLAN.md`, done). The hosting is decided and
  planned: `docs/FRONTEND_ARCHITECTURE.md` v13 and `docs/FRONTEND_DEPLOY_PLAN.md` v1, written
  with brief `prompts/93-deploy-frontend.md`. Check `git status -sb` and `git log` rather than
  trusting this line: those documents may be committed or not when you start.
- `frontend/` has no `template.yaml`, no `samconfig.toml` and no `deploy` script. The root has
  no `scripts/deploy-gate.sh`.
- The back end's stack in use is `shared-calendar-api` in `eu-north-1` (profile
  `shared-calendar-admin`). On 2026-11-21 a read-only `aws cloudfront list-distributions` was
  answered under that profile; nothing more is known about CloudFront in this account.
- Steps 71 (logout) and 72 (the first deployment) are not started. "Sign out" is not touched
  by this step.
- `docs/IMPLEMENTATION_PLAN.md` step 58 (the old stack) is still to do and is independent of
  this step. Do not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Design points

They complete `docs/FRONTEND_ARCHITECTURE.md` section 13. Apply them as written; if the code or
AWS's documentation proves one wrong, stop and say so with a proposal.

### The template (`frontend/template.yaml`)

1. Six resources, those of section 13.2, and no other: no role, no function of Lambda, no log
   group. One parameter, `ApiDomain` (a host name, no scheme and no path; the template refuses
   a value with a `/` or a `:` in it by its `AllowedPattern`). Three outputs: `PageUrl`,
   `BucketName`, `DistributionId`.
2. **The managed policies**, by id (read from AWS's pages on 2026-11-21; read them again
   there, do not trust this list alone):
   - `CachingDisabled`: `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`
   - `CachingOptimized`: `658327ea-f89d-4fab-a63d-7e88639e58f6`
   - `AllViewerExceptHostHeader` (origin request policy): `b689b0a8-53d0-40ab-baf2-68738e2966ac`

   Each id has a comment saying in words what the policy does.
3. **The bucket's policy**: principal the CloudFront service, action `s3:GetObject`, resources
   the four object ARNs by name (`index.html`, `style.css`, `app.js`, `app.js.map`), condition
   `AWS:SourceArn` equal to this distribution's ARN. No `*` in an action or a resource.
4. **The function**: runtime `cloudfront-js-2.0`, on the viewer request of the rule `/api/*`
   only. It removes the first four characters of the path and returns the request; a path that
   is then empty becomes `/`. Nothing else: no header read, none set.
5. **Failures are never kept** (section 13.3, rule 3). Read in AWS's documentation which
   statuses CloudFront keeps for a failed answer and how long; for each of them one entry of
   `CustomErrorResponses` with `ErrorCachingMinTTL: 0` and **no** `ResponsePagePath` and no
   `ResponseCode`. If the documentation says that the policy `CachingDisabled` already keeps
   no failure, or that such an entry cannot be written, stop and report: section 13.3 and
   the plan's risk change with it.
6. The distribution: `DefaultRootObject` `index.html`; viewers redirected to HTTPS; the API's
   origin reached over HTTPS only, TLS 1.2; `Compress` on for the files; price class 100;
   HTTP/2 and HTTP/3; IPv6 on; no alias, no certificate of our own, no logging, no firewall.
7. The response headers policy of section 13.4, on both rules. Cognito's address in the
   Content-Security-Policy is built from `AWS::Region` and `AWS::URLSuffix`.
8. Comments as in `backend/template.yaml`: every resource says in plain words what it is and
   why it is set as it is; references by document path and section.

### The gate (`scripts/deploy-gate.sh`)

9. A file that is sourced and defines one function, which is given the path of the stamp and
   returns only if the deploy may go on; otherwise it prints the reason and how to get a
   stamp, and exits 1. The checks, their order and their sentences are those of
   `backend/scripts/deploy.sh` today, moved word for word. The refusal of the old stack
   `hello-world-api` stays in `backend/scripts/deploy.sh`: it is about that script's arguments.
10. `backend/scripts/deploy.sh` then sources it and behaves exactly as before.

### The deploy command (`frontend/scripts/deploy.sh`, script `deploy`)

11. The nine points of section 13.6, in order, `set -euo pipefail`, stopping at the first
    failure and naming it.
12. The back end's stack name and the region are read from `backend/samconfig.toml`, as
    `backend/scripts/target.sh` reads the region; the hosting stack's name and region from
    `frontend/samconfig.toml`. `AWS_REGION` set by the caller wins, as there. The two regions
    must be the same; if they differ the command stops and says so.
13. `frontend/samconfig.toml`: `stack_name = "shared-calendar-web"`, the region,
    `confirm_changeset = true`, and what `sam deploy` needs to deploy a template that has
    nothing to package. Find that out from `sam deploy --help` and SAM's documentation, not by
    deploying. No `sam build`: there is no code to build in this template.
14. The front end's own checks run inside the command: `npm run verify -w frontend`, after the
    gate and before anything is read from AWS.
15. The upload is four `aws s3 cp`, one per file, each with its `--content-type`
    (`text/html; charset=utf-8`, `text/css; charset=utf-8`, `text/javascript; charset=utf-8`,
    `application/json`) and `--cache-control no-cache`; `index.html` last. No `sync`, no
    `--delete`: the bucket's policy names four objects and the command writes four.
16. The four checks at the end are made with curl against `PageUrl`, without credentials,
    each printed as PASS or FAIL in the manner of `backend/scripts/smoke.sh`; one FAIL makes
    the command exit 1 after all four have run. An invalidation takes a moment: the command
    waits for it (`aws cloudfront wait invalidation-completed`) before the checks.
17. **`--dry-run`**: runs the gate, the front end's `verify`, reads the back end's stack,
    builds with the real values, and prints what it would deploy, upload, invalidate and check,
    with the names it knows. It calls nothing that creates or changes a resource, and it does
    not need the hosting stack to exist. The dry run passes the gate like a real run: no
    switch that skips the gate is added, in this step or later. So in this step it can be
    tried only on a committed tree with a fresh stamp; if that is not the case, it is reported
    as not tried, with the reason.
18. The command prints no token and no password, because it has none; it prints the stack's
    ids, which are not secret. It refuses, like the back end's, any argument that names the
    old stack `hello-world-api`.

### The rest

19. `frontend/package.json`: script `deploy`; `verify` gains `sam validate --lint` on the
    template, after the unit tests, through `backend/scripts/check-sam.sh` if `sam validate`
    needs the same minimum version. Say in the report whether `verify -w frontend` now needs
    the SAM CLI on a machine that had only node, and whether that is acceptable.
20. `frontend/scripts/dev.mjs` sends
    `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'none'`.
    The Codespace's forwarded port must still show the page: try it.
21. No unit test is written for the shell scripts, as for the back end's. The function of
    point 4 lives in the template; it is proven by the deploy command's checks at step 72.

## The step

In this order:

1. `scripts/deploy-gate.sh` and `backend/scripts/deploy.sh`; try the back end's refusals by
   hand (no stamp, an old stamp, a dirty tree) before going on.
2. `frontend/template.yaml` and `frontend/samconfig.toml`; `sam validate --lint`.
3. `frontend/scripts/deploy.sh`, the script `deploy`, the new `verify`.
4. `frontend/scripts/dev.mjs`; the page in a browser.
5. The documents, in the same change:
   - `docs/FRONTEND_ARCHITECTURE.md`: a new version; section 13 corrected wherever the step
     found it different, and saying what of it now exists; the rows of O1, O2 and O5 in
     section 10; section 12.2 for the dev server's policy.
   - `docs/FRONTEND_DEPLOY_PLAN.md`: step 70 done, the change log, anything step 72 must now
     do differently.
   - `docs/FOLDER_STRUCTURE.md`: the tree of section 2, sections 4.5 and 7.
   - `CLAUDE.md`: "Where the truth lives", the commands (`deploy -w frontend`, its
     `--dry-run`, the new `verify`), the folder map (root `scripts/`, `frontend/`), the
     generated files if any is new.
   - `docs/FRONTEND_WALK.md`, only if the dev server's new policy changes what a check says.
   - `README.md` is left for step 73.

## How we work in this step

- No cloud command that creates, changes or deletes a resource, a change set included. If a
  point can only be settled by deploying, it is reported as open, for step 72.
- No commit. I review, then decide.
- When AWS's documentation and section 13 disagree, stop and propose the change to the
  document; do not write around it.
- The local stack may be up or not when you start; `npm run verify` at the root needs
  `local:up` and `local:api`, and in a Codespace the iptables rule of `CLAUDE.md`. Start them
  if they are not running, and say so.
- Report honestly: what was tried and how, what was not tried and why, every FAIL.

## Acceptance (`docs/FRONTEND_DEPLOY_PLAN.md` step 70)

- `sam validate --lint` on `frontend/template.yaml` is green; root `npm run lint` is green.
- `npm run deploy -w frontend` and `npm run deploy -w backend` each refuse, naming the reason,
  with no stamp, with a stamp older than 30 minutes, with a dirty tree. Neither gets past its
  gate in this step.
- `npm run deploy -w frontend -- --dry-run`: reads the back end's stack, builds, says what it
  would do, changes nothing; `frontend/dist/app.js` holds `/api` and Cognito's real address
  and no `localhost`. If it could not be run (no session, no committed tree), the report says
  so and what was tried in its place.
- In a browser, under the dev server: the login and the week; the console holds `zod`'s one
  report and no other.
- Root `DYNAMODB_PORT=8002 npm run verify` green.

## Report

What was built, file by file; the result of each acceptance check; what AWS's documentation
said on design points 2, 5 and 13; every place where you decided something this brief and
section 13 do not say; what step 72 will be the first to prove.
