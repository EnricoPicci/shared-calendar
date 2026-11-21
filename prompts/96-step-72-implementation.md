## Brief

Implement plan step 72, "The first deployment" (`docs/FRONTEND_DEPLOY_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

**This step acts on the cloud.** It creates the stack `shared-calendar-web` (a private S3
bucket behind a CloudFront distribution), uploads the page and puts it in use at the address
AWS gives. Until now nothing of the front end is in the cloud.

**Who does what.** The step is done by two, and the line between them is fixed:

- **I run every command that creates or changes something in the cloud**, in my own terminal,
  and I answer the change set's question myself. They are named in "What is authorised" below.
- **I do every check that needs a password of the real user pool**, by hand, in my browser. No
  password and no token of the cloud passes through you: not typed by you, not in a script,
  not in a file, not in a command line.
- **You prepare, predict, read and check**: everything on the laptop, every read-only `aws`
  command, every check with curl and no credentials, the reading of what my terminal
  recorded, the documents.

**Three stops.**

- **Part A, the preparation**: no cloud change. Ends with the change set you expect, written
  down, and the commands for me to run. **Stop.**
- **Part B, after I have deployed**: your read-only checks, then the list of checks for me to
  do by hand in the browser. **Stop for my results.**
- **Part C, the record**: the documents. One stop at its end, with the report.

Read these in full first:
- `CLAUDE.md`, in particular "Cloud safety", "Hard rules from the design" (nothing of a token
  in a log), and under "Everyday commands" the entries of `npm run deploy -w frontend`,
  `npm run deploy -w backend`, `npm run verify`, the cloud's stack and profile, and the rule
  on passwords and tokens in scripts.
- `docs/FRONTEND_DEPLOY_PLAN.md`: all of it. Step 72 is this step; section 4 lists the risks,
  with what is done when one comes true.
- `docs/FRONTEND_ARCHITECTURE.md` section 13, all of it: 13.2 (the six resources), 13.3 (the
  API through the page's address; rules 1 and 3 rest on AWS's documentation until this step),
  13.4 (the headers), 13.5 (the files), 13.6 (the deploy command, point by point), 13.7
  (logout, and what rests on nothing run yet); section 10 (the open points O3, O9, O10) and
  section 11, decisions 150 to 158.
- `docs/FRONTEND_SERVICES.md` sections 20.1 and 20.9 (what the pages of AWS do not say about
  `RevokeToken`, and what only the cloud proves) and section 11 (the refresh: this step is the
  first time a browser renews a real 15-minute session).
- `docs/RUNBOOK.md`: sections 1 (every working session: the profile, the login with a device
  code), 2 (updating the deployed stack: how a deploy is run and recorded, how a change set
  is read), 5 (the deployment record: the form of an entry, the open items).
- `docs/FRONTEND_WALK.md`: the marks, and which checks need the local seed.

Then read the code:
- `frontend/template.yaml`, `frontend/samconfig.toml`, `frontend/scripts/deploy.sh`,
  `scripts/deploy-gate.sh`, `frontend/scripts/build.mjs`.
- `backend/samconfig.toml` and `backend/scripts/target.sh` (how a stack's outputs are read).

## Where we are (2026-11-21)

- Step 71 is done and committed (`f767e2e`, branch `deploy-frontend`, not pushed): "Sign out"
  revokes. Check `git status -sb` and `git log` rather than trusting this line.
- **The deployment is made from the branch `deploy-frontend`, as it is.** I merge it into
  `main` myself, later: no merge, no push and no change of branch in this step. The runbook's
  record names the commit deployed and the branch.
- Step 70's dry run was run once, on `0e695a7`, and passed. The tree has changed since: it is
  run again here.
- The last `verify` stamp was written on a dirty tree: it opens no gate. Part A writes a new
  one.
- The back end's stack `shared-calendar-api` is live in `eu-north-1` since plan step 57
  (2026-11-16). Since then `backend/` changed in its tests and in `backend/scripts/deploy.sh`
  only, as far as I know. **Check it** (part A, point 3): do not trust this line.
- The old stack `hello-world-api` is untouched and stays untouched. Nothing of this step
  names it.
- cognito-local implements `RevokeToken`; the real Cognito has never been asked for it by
  this code, and never from a browser on another origin.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22. The local DynamoDB has been on port 8000, not 8002: look at
  `docker ps` before passing `DYNAMODB_PORT`.
- This brief file is untracked when you read it. **Commit it alone, first** (part A, point 1,
  with my go-ahead here): the gate needs a clean tree.

## What is authorised

This brief is the explicit instruction that `CLAUDE.md` ("Cloud safety") asks for, for these
commands and no other:

| Command | Run by | How often |
|---|---|---|
| `npm run deploy -w frontend` | me, in my terminal | Twice: the first deployment, then once more with no change (the acceptance) |
| `aws sso login --profile shared-calendar-admin --use-device-code` | me | When the session has expired |
| Read-only `aws` commands (`describe-stacks`, `describe-stack-events`, `describe-stack-resources`, `cloudfront get-distribution`, `cloudfront list-distributions`, `s3api get-bucket-policy`, `get-public-access-block`, `s3 ls` of the page's bucket, `logs filter-log-events` on the API's access log, `ce get-cost-forecast`) | you | As needed |
| curl against the page's address, **with no credentials** | you | As needed |
| `git commit` of this brief alone, at the start | you | Once |

**Not authorised, whatever happens:** `npm run deploy -w backend` (if the back end turns out
to be behind, stop and say so: that is a decision and a brief of its own); `sam delete`,
`aws cloudformation delete-stack`, emptying or deleting a bucket; any `aws` command that
writes, other than through the two runs above; anything on `hello-world-api`; `git push`;
any call to the real Cognito or to the real API that carries a password or a token.

If something fails half-way (a stack that rolls back, an upload that stops), **stop and
report what the cloud holds**, from read-only commands. Do not repair, retry or delete. What
to do next is mine to decide.

## Part A: the preparation (no cloud change)

1. Commit this brief alone. Then `git status -sb` must be clean.
2. The local stack up (`local:up`, the Codespace's iptables rule, `local:api`), then root
   `npm run verify` with the right `DYNAMODB_PORT`: it must end with `verify PASSED … (clean
   tree)`. Then `RUN_INTEGRATION=1 npm run test:integration -w frontend`, which the root
   `verify` does not run. Note the time: the gate allows 30 minutes from the stamp.
3. **Is the back end's stack behind the repository?** Compare what is deployed with HEAD:
   the commit `docs/RUNBOOK.md` section 5 records for the last deployment, and
   `git diff <that commit> HEAD -- backend/src backend/template.yaml shared/src`. An empty
   diff: say so, and the back end is not deployed. Anything else: **stop**, with the diff's
   summary.
4. With a session (`export AWS_PROFILE=shared-calendar-admin`; if it has expired, ask me to
   log in), `npm run deploy -w frontend -- --dry-run`. Report what it printed: the values
   read (the API's host, the client id; neither is a secret), the four files and their sizes,
   what it would deploy, upload, invalidate and check. Check `frontend/dist/app.js` yourself:
   it holds `/api` and `https://cognito-idp.eu-north-1.amazonaws.com/` and no `localhost` and
   no `127.0.0.1`.
5. Read-only, before anything is created: no stack `shared-calendar-web` exists
   (`describe-stacks` answers that it does not); `cloudfront list-distributions` answers (the
   organization's policy lets us read); the three managed policies the template names exist
   under the ids it uses.
6. **Write down the change set you expect**, from `frontend/template.yaml`: six resources,
   each *Add*, by logical id and type, and what would mean "answer N" (anything that is not
   an *Add*; a seventh resource; SAM asking to create or use a bucket of its own for
   artifacts; a stack name or a region other than `shared-calendar-web` in `eu-north-1`).
   `docs/RUNBOOK.md` section 5.2 is the lesson: last time the answer `y` came before the
   list had been read back. This time the list is on the screen before I run anything.
7. Give me the commands, ready to paste, as `docs/RUNBOOK.md` section 2 has them for the back
   end: the profile, and the deploy recorded with `script -q -c "npm run deploy -w frontend"
   /tmp/deploy-web-1.txt` (never a file inside the repository: it would make the tree dirty).
   Say how many minutes of the 30 are left; if fewer than 15, run `verify` again first.

**Part A's report, then stop:** the result of each point; the expected change set; the
commands; anything of `docs/FRONTEND_ARCHITECTURE.md` section 13 that the dry run or the
read-only look puts in doubt. A distribution takes some minutes to be ready the first time:
say so, so that I do not take the wait for a hang.

## Part B: after I have deployed

I will tell you that it ran, and whether it ended with its four checks. Then, in this order:

1. **Read what my terminal recorded** (`/tmp/deploy-web-1.txt`): the change set as shown,
   against your list, line by line; SAM's last lines; the three outputs; the four uploads;
   the invalidation; the four checks, PASS or FAIL each. Any difference from what you
   expected is reported, also a harmless one. Nothing of that file is copied into the
   repository except what the runbook's record needs; it holds no secret, check that it
   does not before quoting it.
2. **Read-only checks** (`docs/FRONTEND_DEPLOY_PLAN.md` step 72, point 6, and more):
   - the stack is `CREATE_COMPLETE`, with six resources and three outputs;
   - the bucket is not public: its public access block has all four settings on, its policy
     names the distribution and the four objects and nothing else, and its own address
     answers 403 to curl;
   - the distribution: enabled, deployed, its price class, HTTPS only (plain HTTP is
     redirected: try it with curl), its two rules as section 13.2 says;
   - `curl -sI` on `/`, `/style.css`, `/app.js`, `/app.js.map`: 200, the right content types,
     `Cache-Control: no-cache`, and **the four headers of section 13.4 on each, and on an
     answer of `/api/…` too**, word for word; a fifth file (`/index.html` is one of the
     four; try `/nothing-here`) and what the bucket answers for it: report the status as it
     is, section 13.3 expects no page of ours there;
   - **a failure of the API is not kept**: `https://<page>/api/no-such-route` twice within
     ten seconds, the two `apigw-requestid` headers different (the plan's check, point 5);
   - `/api/calendar` without a token: 401 with the API's own JSON, not CloudFront's page;
   - the API's access log shows these calls, with CloudFront's address as the caller.
3. **The size of what a person downloads** (open point O9): with
   `curl --compressed -so /dev/null -w '%{size_download}'` for each of the three files, since
   I will read the same in my browser's network panel. Say which encoding CloudFront chose
   (`content-encoding`).
4. **The list for me**, to do by hand at the page's address. Write it as numbered checks I
   answer "yes" or "no", each with what must be seen, in the words of `docs/FRONTEND_WALK.md`.
   **Once at a desktop width, all of it; at a phone width only the checks whose answer the
   width can change** (the walk marks the others `[=]`), and say how many that is. Put the
   16 minutes of the renewed session where I can do other checks of the list meanwhile, in a
   second window, or last. The list:
   - the Administrator signs in. **The week loads**: that is the proof that the
     `Authorization` header passes through the distribution (section 13.3, rule 1). If every
     call answers 401 instead, that is the plan's second risk: say what I must look at in
     the network panel to tell;
   - the walk's checks that need no seeded data, and the others with data made by hand
     through the page: a type, a pattern, a throw-away User `walk-<tag>`, a booking as that
     User. Choose them from `docs/FRONTEND_WALK.md` and say which of its 102 are in the list
     and which are left out, with the reason. **Everything made for the checks is removed at
     the end** (the appointments cancelled, the pattern and the type deleted, the User
     deleted): the list ends with those steps. **What cannot be removed is accepted**, and
     you say in the report exactly what it is: appointments cannot be deleted through the
     API, so each booking of the list stays as a cancelled appointment with its events, and
     the deleted User leaves its deleted-user marker, as the smoke test's do. Keep the
     bookings few for that reason. The real calendar is otherwise left as it was; if it
     already holds data of mine, the list must not need an empty calendar;
   - **the session renewed**: signed in, the tab left open for 16 minutes, then one more
     action: it still works, and the network panel shows one `InitiateAuth` to Cognito about
     a minute before the fifteenth. The first time a browser renews a real session;
   - **logout**, exactly as `docs/FRONTEND_DEPLOY_PLAN.md` step 72, point 5, has it: the
     request ending in `RevokeToken` answered 200 and not blocked; a refresh with the revoked
     token refused, with a "before" to compare. For the refresh from a terminal, give me the
     command in a form where the token is read with `read -s` and sent on standard input,
     never an argument, never a file. Test the command's shape against cognito-local first,
     so that what I paste is known to work;
   - the console: `zod`'s one report and no other, at the login and after signing in;
   - a reload: the login again (open point O3, as designed, not a failure).
   For each check say what to tell you if the answer is "no".

**Part B's report, then stop for my results:** your checks, each with its result and the
command that gave it; the sizes; the list. Every FAIL, and every "could not check" with the
reason.

## Part C: the record

Only after my results. If one of them is a "no" on a point the architecture promises, that
comes first: **stop and propose the change to `docs/FRONTEND_ARCHITECTURE.md`**, as the plan
says; no fix is deployed in this step without my word.

**One "no" is decided already: `RevokeToken` blocked by the browser** (the request of "Sign
out" shown as a CORS error, or never answered 200, at the deployed page). Then the page stays
in use as it is: "Sign out" still clears the page at once, which is all it did before step
71, and the refresh token lives on at Cognito for its seven days at most. Do not stop for it.
Record it as found, with what the network panel showed: in `docs/FRONTEND_ARCHITECTURE.md`
section 13.7 and as an open point of its section 10, in `docs/FRONTEND_SERVICES.md` section
20.9, in the plan and in the runbook's record; and propose the ways out (the call passed
through the distribution like `/api`, or the limit kept) for a later step, without building
either. The check "a refresh with the revoked token is refused" then has nothing to prove
and is reported as not done, with this reason.

1. **The second deployment**, the acceptance: I run `npm run deploy -w frontend` again, with
   no change (recorded to `/tmp/deploy-web-2.txt`). It needs a clean tree and a fresh stamp:
   so it comes **before any document is edited**, and you run `verify` again first if the
   stamp is older than 30 minutes. It must say that no resource changes and end with the
   four checks. You read the record as in part B, point 1.
2. `docs/RUNBOOK.md`:
   - the deployment record of this step, in the form of its section 5 (the date, the change
     set as it was, the outputs' names, never an e-mail address; what was checked and by
     whom; what was not);
   - "releasing the page" as a step of its section 2, after the back end's: the command, what
     it asks, what it prints, the four checks;
   - how the stack `shared-calendar-web` is deleted, should it ever be: the bucket emptied
     first, and why. Written as a procedure, **not run**.
3. `docs/FRONTEND_ARCHITECTURE.md`: section 13.5, the sizes as read (O9); section 13.3 and
   13.7, what the deployment proved of the three things that rested on AWS's documentation,
   each with how it was seen; the status line. The rest of section 13 in the present tense
   is step 73's work, not this step's: change here only what this step proved or disproved.
4. `docs/FRONTEND_SERVICES.md` section 20.9: "what only the cloud proves", each point with
   its result; and section 20.1, which error type the real Cognito gave, where one was seen.
5. `docs/FRONTEND_DEPLOY_PLAN.md`: step 72 done, with what differed from the plan; the risks
   that did not come true said so; the status line.
6. `CLAUDE.md`: "What this project is" and "Where the truth lives" (the page is deployed; its
   address is in the stack's output `PageUrl`), the entry of `npm run deploy -w frontend`
   ("never run yet" is no longer true). `README.md` is step 73's.

## How we work in this step

- **The cloud is changed by me, never by you.** If a command you are about to run could
  write to AWS, it is not yours to run.
- **No secret passes through you.** No password of the real pool, no token of it. If a check
  seems to need one, it goes on my list.
- A value read from a stack (an id, a domain, a bucket's name) is not a secret, but no
  e-mail address goes into a committed file: the repository is public.
- The page's address is public once it exists. It goes into `docs/RUNBOOK.md`'s record as
  the stack's output is named, and into `README.md` only at step 73.
- When the deployment proves `docs/FRONTEND_ARCHITECTURE.md` section 13 wrong, stop and
  propose the change to the document; do not write around it.
- No commit but the first (this brief) until I ask. No push.
- The local stack is started when needed and stopped afterwards; the report says so.
- Report honestly: what was tried and how, what was not tried and why, every failure.

## Acceptance (`docs/FRONTEND_DEPLOY_PLAN.md` step 72)

- The deploy command's four checks PASS, at the first deployment and at the second.
- The second `npm run deploy -w frontend`, with no change, says that no resource changes.
- My checks in the browser, with the list of the walk's checks done and of those left out.
- The `Authorization` header reaches the API through the distribution; a failure of the API
  is not kept; `RevokeToken` is answered 200 from the page's address and a refresh with the
  revoked token is refused. Each of the three either seen, or reported as not holding, with
  a proposal. A blocked `RevokeToken` does not fail the step: it is recorded as decided in
  part C.
- Nothing in the cloud but the six resources of the stack `shared-calendar-web` and the four
  objects in its bucket; `shared-calendar-api` and `hello-world-api` unchanged.
- No password and no token in a log, a file, a command line or the report.

Checkpoint: the page is deployed.

## Report (part C)

What the cloud now holds, resource by resource; the result of each acceptance check, and who
did it; every place where the deployment differed from `docs/FRONTEND_ARCHITECTURE.md`
section 13 or from the plan, and what was done about it; the three things that rested on
documentation, each proven or not; the walk's checks done and not done; the open points as
they stand (O3, O9, O10); what step 73 has left to do.
