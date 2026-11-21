## Brief

Implement plan step 73, "Documentation and hand-over" (`docs/FRONTEND_DEPLOY_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review. It is the last step of that plan.

**This step changes documents only.** No file under `frontend/`, `backend/`, `shared/` or
`scripts/` changes, a comment neither. If a document can only be made true by changing code,
a template or a script, **stop and say so**: that is a step of its own.

**This step touches no cloud resource.** No `sam deploy`, no `npm run deploy` of either
package, no `aws` command that creates, changes or deletes anything. Read-only `aws` commands
and curl against the page's address with no credentials are allowed, to check that a sentence
is true before writing it (the list is in "What is authorised"). No password and no token of
the real pool passes through you.

**One stop**, at the end, with the report. Five points were decided with me before this
brief was finished: they are in "Decided before the step" below, and none is asked again.

Read these in full first:
- `CLAUDE.md`, all of it. **This step does not change it** (decided, below).
- `docs/FRONTEND_DEPLOY_PLAN.md`: all of it. Step 73 is this step; the note under step 72
  says what that step did and did not do.
- `docs/RUNBOOK.md`: all of it. Section 5.5 is the record of the first deployment, with its
  open items; section 2, step 6 and section 3.1 are the procedures a colleague follows.
- `docs/FRONTEND_ARCHITECTURE.md`: the status line and the change log; section 10 (every
  row); section 11, decisions 139 to 158; section 13, all of it; and sections 6, 9 and 12.2
  wherever they speak of a deployment or of the hosting.
- `docs/FRONTEND_SERVICES.md`: the status line, section 1.1, section 10.3 (the CORS gap),
  section 8, decisions 46 to 57, sections 20.1 and 20.9.
- `docs/FOLDER_STRUCTURE.md`: section 2 (the tree) and section 7.
- `README.md`: all of it.
- `docs/FRONTEND_WALK.md`: section 1 (what the walk needs) and its status line.
- `docs/AWS_ACCOUNTS.md`, where it lists what the account holds.

Then read, to check the documents against them, **without changing them**:
`frontend/template.yaml`, `frontend/samconfig.toml`, `frontend/scripts/deploy.sh`,
`scripts/deploy-gate.sh`, `frontend/package.json`.

## Where we are (2026-11-21)

- Step 72 is done and committed: `646b706` (the brief alone, **the commit that is deployed**)
  and `6225072` (the record), on the branch `deploy-frontend`. Not pushed, not merged into
  `main`. Check `git status -sb` and `git log` rather than trusting this line.
- **The page is in use**: stack `shared-calendar-web` in `eu-north-1`, outputs `PageUrl`
  `https://dfhghsvimmgfm.cloudfront.net`, `BucketName`, `DistributionId`. Read them again
  from the stack: do not copy them from this brief.
- What the first deployment proved, and what it corrected, is already written, in the places
  where it stands: `docs/FRONTEND_ARCHITECTURE.md` v17 (sections 13, 13.2, 13.3, 13.5, 13.7,
  decision 153), `docs/FRONTEND_SERVICES.md` (sections 20.1 and 20.9, "v8, note"),
  `docs/FRONTEND_DEPLOY_PLAN.md` v4, `docs/RUNBOOK.md` section 5.5, `CLAUDE.md`. **Do not
  write it a second time: bring the text around it into line with it.**
- What step 72 left, on purpose, for this step: the rest of `docs/FRONTEND_ARCHITECTURE.md`
  section 13 in the present tense; the rows of its section 10; `README.md`;
  `docs/FOLDER_STRUCTURE.md` section 7; `docs/FRONTEND_SERVICES.md` section 10.3; the plan's
  status.
- Known sentences that are no longer true (a start, not the whole list: find the others):
  `README.md` lines 19 and 130 ("the front end is not deployed anywhere yet");
  `docs/FOLDER_STRUCTURE.md` section 7 ("What is written and not yet deployed: all of the
  hosting. No stack `shared-calendar-web` exists"); the "Today" of rows O1, O2, O5 and O7 of
  `docs/FRONTEND_ARCHITECTURE.md` section 10.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; it is committed with the step, when I ask.

## Decided before the step (2026-11-21)

1. **The open items of step 72 are left for later.** `docs/RUNBOOK.md` section 5.5 ends
   with four open items: checks at the deployed page that I did not do on 2026-11-21. Two of
   them were acceptance points of step 72 (a refresh with the revoked token refused by the
   real Cognito; a session renewed after its fifteen minutes); the others are "Sign out"
   with the network off, a reload and the console, and the rest of the walk with the phone
   width. **Do not ask me about them and do not wait for them.** Each stays an open item, in
   the same words, in every document that names it. **No document may say or suggest that
   one of them holds**: "the page is deployed" is true; "logout is proven in the cloud" is
   true only as far as the revocation answered 200.
2. **The plan is called done all the same.** `docs/FRONTEND_DEPLOY_PLAN.md` gets the status
   "done", and says in the same sentence that these checks are still owed and where they are
   listed. Wherever another document says the plan is done, the same reserve stands beside
   it, in a few words.
3. **`CLAUDE.md` is not touched.** Not shortened, not corrected. Step 72 already brought it
   to "the page is deployed". If this step leaves a sentence of it untrue (its entry of
   `docs/FRONTEND_DEPLOY_PLAN.md` says "73 is not started"; its "Where the truth lives" names
   sections and versions this step may move), **change nothing and list each such sentence
   in the report**, with the words that would make it true: I decide then.
4. **The page's real address goes into `README.md`**, read from the stack's output
   `PageUrl`. It is public once the repository is.
5. **The work stays on the branch `deploy-frontend`.** I merge into `main` myself, later: no
   merge, no push and no change of branch in this step.

## What is authorised

| Command | Why |
|---|---|
| `aws cloudformation describe-stacks`, `describe-stack-resources` on `shared-calendar-web` and `shared-calendar-api` | To write an id, an output or a status as it is |
| `aws cloudfront get-distribution`, `aws s3api get-bucket-policy`, `get-public-access-block`, `aws s3 ls` of the page's bucket | To check a sentence of section 13 before putting it in the present tense |
| curl against the page's address, **with no credentials** | The same |
| `npm run lint`, `npm run typecheck`, `npm run test:unit` at the root | The acceptance |

Not authorised: anything that writes to AWS; any deploy; `git push`; a merge or a change of
branch; any call that carries a password or a token; anything on `hello-world-api`.

## The work

The acceptance of the plan is the measure: **no document still says that the front end is
deployed nowhere or that the hosting is open; a colleague can follow `docs/RUNBOOK.md` from
a clean clone to a release of the page.**

1. **`docs/FRONTEND_ARCHITECTURE.md`**, a new version (v18):
   - **Section 13 in the present tense of what is built and deployed.** It still reads, in
     places, as a design waiting for its first deployment ("rests on AWS's documentation
     until…", "is proven only by…", "at step 72"). Rewrite those sentences to say what is,
     and keep, once and where it belongs, *how* each thing was seen (the date, the check).
     The history of a correction stays where a struck-through sentence already carries it;
     add no new history. Sections 13.1 to 13.8, each read against the template and the
     deploy script as they are.
   - **Section 10**: every row's "Today" as it stands after the deployment. O1, O2 and O5:
     decided, built and deployed; say what, if anything, of each is still unproven. O7:
     closed, with what the deployed page showed and what it has not been asked. O3, O9 and
     O10: open, blocking nothing, with what is true of each now (O9 with the measured sizes;
     O10 with the address the page has). The paragraph under the table as well.
   - The status line, the scope lines, the change log.
   - Sections 6, 9 and 12, wherever they still speak of the hosting as something to come.
   - The decisions of section 11 are not rewritten: a decision that the deployment confirmed
     or corrected gets one clause saying so, if it has none yet.
2. **`README.md`**:
   - "the front end is not deployed anywhere yet" gone, in both places, with what replaces
     it;
   - the page among the deployed stacks' ids: the stack `shared-calendar-web`, its three
     outputs, **the page's address** (read from the stack). The address is public and goes in
     here, as the plan says;
   - the command that releases the page, in the everyday commands, with its `--dry-run`, and
     the pointer to `docs/RUNBOOK.md` section 2;
   - how a person signs in at the page: which users exist is not said (no name but `admin`,
     no password, ever);
   - the table of documents: `docs/FRONTEND_DEPLOY_PLAN.md` and `docs/FRONTEND_WALK.md` if
     they are missing from it.
   `README.md` summarises and is not a source of truth: short, and pointing at the documents.
3. **`CLAUDE.md`**: not changed (decided, point 3). Read it against the other documents
   as they are at the end of the step and list, for the report, every sentence of it that
   is then untrue or points at a section that moved.
4. **`docs/FOLDER_STRUCTURE.md`**: section 7 (the hosting is deployed; what the folder holds
   and what the stack holds) and the tree of section 2 if a line of it is stale.
5. **`docs/FRONTEND_SERVICES.md`**: section 10.3, the CORS gap: it is closed, and how (one
   origin, the distribution passing `/api/…` on; the API has no CORS configuration and needs
   none; Cognito answers a browser from the page's origin, for the login and, as seen, for
   `RevokeToken`). Section 1.1 and the status line where they still say the page has no
   address. No new version unless a design changes: a note in the change log, as step 72 did.
6. **`docs/RUNBOOK.md`**: read sections 1 to 3 as a colleague with a clean clone who has to
   release the page, and fix what stops them: a step that assumes something not said, a
   command that needs a terminal set up in a way not named, the order of the two deployments.
   The title table and the first paragraph, which still speak of one stack. The open items
   of section 5.5 stay as they are, unticked (decided, point 1).
7. **`docs/FRONTEND_DEPLOY_PLAN.md`**: step 73 done, with what differed; the status line:
   **done, with the checks of step 72 still owed** and where they are listed (decided,
   points 1 and 2).
8. **Everything else that names the hosting**: search the repository's documents
   (`docs/`, `README.md`, the pages under `docs/journeys/`; `CLAUDE.md` too, to list and not to change) for a sentence that
   is no longer true: "not deployed", "deployed nowhere", "nowhere yet", "no stack", "until
   step 72", "the first deployment proves", "is open", "to do". Fix each, or say in the
   report why it stays (a change log's row and a plan's "the step as planned" are history and
   stay as written). `docs/AWS_ACCOUNTS.md` if it lists what the account holds.
   The briefs under `prompts/` are never edited.

## How we work in this step

- **A sentence is checked before it is written in the present tense.** Against the template,
  the script, the stack (read-only) or the runbook's record. A sentence that cannot be
  checked keeps its "not yet looked at", with what would show it.
- **Nothing is claimed that was not seen.** Where step 72's record says "inferred" (what is
  left in the real calendar) or "not tried", this step's documents say the same.
- No history in the body of a document beyond what a correction needs: when something was
  built is in the change logs, the plans and git.
- No e-mail address and no AWS account number in a committed file: the repository is
  public. The page's address, the stacks' ids and outputs are not secrets.
- Documents are written as the others are: what is, in plain words, for a reader who is not
  an Infrastructure-as-Code expert.
- No commit until I ask. No push.
- Report honestly: what was checked and how, what was not checked and why.

## Acceptance (`docs/FRONTEND_DEPLOY_PLAN.md` step 73)

- No document says that the front end is deployed nowhere, that the hosting is open, or that
  a first deployment is still to come. Shown by the searches of point 8, with their output:
  every remaining match named and explained.
- A colleague can follow `docs/RUNBOOK.md` from a clean clone to a release of the page: walk
  it on paper, step by step, and list every thing they would need that the runbook or the
  documents it points at do not give them. The list is empty, or its entries are fixed.
- `docs/FRONTEND_ARCHITECTURE.md` section 13 says nothing in the future tense about the
  hosting, and nothing as proven that section 5.5 of the runbook records as not done.
- Every open item of step 72 is still listed as open, in the same words everywhere, and
  wherever the plan is called done the checks still owed are named beside it.
- `git diff --stat` holds documents only, and not `CLAUDE.md`. Root `npm run lint` green (the comments' check
  reads no document, but nothing else may have moved).
- No e-mail address, no account number, no password and no token in the diff.

## Report

What changed, document by document, in a few lines each; the searches and what is left of
each; the walk through the runbook on paper and what it found; **the sentences of `CLAUDE.md`
that are now untrue, each with the words that would make it true**; the open items of step
72 as they stand, unchanged; the open points O3,
O9 and O10; and what is left for me that no plan holds: the checks still owed, the merge of `deploy-frontend` into
`main`, the push, and `docs/IMPLEMENTATION_PLAN.md` step 58 (the old stack retired).
