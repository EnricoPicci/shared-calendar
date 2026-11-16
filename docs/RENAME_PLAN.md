# Rename to "shared-calendar" — plan and operator checklist

| | |
|---|---|
| Status | v1 — plan, agreed with the Product Owner on 2026-11-16; not started |
| Date | 2026-11-16 |
| Scope | Every name that says "hello-world" (or "hello" for the project as a whole) becomes a "shared-calendar" name: the cloud stack, its tables, the local Docker names, the AWS CLI profile, the documents. The Hello World feature stays. |
| Plan steps | `docs/IMPLEMENTATION_PLAN.md` steps 56 (repository), 57 (new stack), 58 (old stack retired); step 59 (documentation and hand-over) follows them |

The project began as a "Hello World API" and grew into a shared calendar. The old name is
confusing. This document lists what changes, in the repository and in AWS, what the operator does
by hand, and how to go back to today's setup at every stage.

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| R1 | A **new stack `shared-calendar-api`** beside the old `hello-world-api`, in the same account and region (`eu-north-1`). | CloudFormation cannot rename a stack. A new stack next to the old one keeps the old one untouched as the way back (section 4). |
| R2 | The new stack's **tables are named after the stack**: `${AWS::StackName}-calendar` and `${AWS::StackName}-hello-messages`, so `shared-calendar-api-calendar` and `shared-calendar-api-hello-messages`. | The old stack owns the fixed names `calendar` and `hello-messages`; a second stack cannot reuse them. Names derived from the stack never clash again (a future `-dev` stack, another move). |
| R3 | The new stack **starts empty**; nothing is copied. | The old stack holds only the user `admin`, the smoke tests' history and 4 smoke rows in `hello-messages`. Passwords cannot be copied out of Cognito, and copied rows would point at user ids (`sub`) that do not exist in the new pool. |
| R4 | The **old stack stays** until step 58; it is deleted only then, with the PO's explicit go. | Until then, going back is a `git revert` and nothing in AWS has to change (section 4). |
| R5 | AWS CLI profile `hello-admin` / SSO session `hello` → **`shared-calendar-admin` / `shared-calendar`**, added **beside** the old sections in `~/.aws/config`, which stay until step 58. | Same identity, same account, same permission set: only the local name changes. Keeping both makes the revert a matter of `AWS_PROFILE`. |
| R6 | Docker network `hello-local` → **`shared-calendar-local`**; compose project `hello-world-api` → **`shared-calendar`**. | Local names only. |
| R7 | **Local table names stay** `calendar` and `hello-messages` (`local-seed.sh`, `env.local.json`, `backend/tests/integration/setup.ts`). | Locally there is no stack name and no clash; the functions get the names from `env.local.json`, not from the template. Changing them would touch the tests for no gain. |
| R8 | The plan's current step 56 becomes **step 59**; the rename is steps 56–58. | The PO chose to renumber; step 59 then documents and tags (`v1.1.0`) the final names. |

## 2. What keeps "hello"

- **The Hello World feature**, which proves that the Lambda chain (API, authorizer, function,
  table) works: the route `/hello`, `HelloFunction`, `HelloRole`, `HelloLogGroup`,
  `backend/src/handlers/hello.ts`, the front end's `HelloService`, its messages ("Hello World, I am
  …"), its table (`…hello-messages`, R2 and R7), the unit tests' `hello-messages-test`, and the
  journey pages `docs/journeys/*/hello-world-journeys.md`.
- **History**: the numbered briefs in `prompts/`, the documents' change logs, and the deployment
  records of `docs/RUNBOOK.md` section 5 (they describe what happened to `hello-world-api`).
- **The old stack's own names** wherever a document still has to name it until step 58 (revert,
  retirement).

Everything else that names the project changes.

## 3. Stages at a glance

| Stage | Repository | AWS | Local | Way back |
|---|---|---|---|---|
| 0, today | `hello-world-api` names | `hello-world-api` live | `hello-local`, profile `hello-admin` | — |
| A, after step 56 | renamed, committed | unchanged: `hello-world-api` still live, still the one in use | renamed; both profiles exist | section 4.1 |
| B, after step 57 | + new ids in `README.md` | **both stacks live**; `shared-calendar-api` is the one in use | renamed | section 4.2 |
| C, after step 58 | old names only in history | `hello-world-api` **deleted** | old profile removed | section 4.3 (no way back to the old stack) |

Between A and B the repository already names `shared-calendar-api` while it does not exist yet:
run step 57 soon after step 56.

---

## 4. The way back

### 4.1 From stage A (renamed repository, old stack in use)

1. `git revert` the step 56 commit(s) (a new commit; history is kept). If the PO wants a fixed
   point to return to, tag the last commit before step 56 first (proposed name
   `pre-shared-calendar-rename`, only when instructed).
2. `npm run local:down -w backend`, then `local:up` and `local:api` again: the old network and
   compose project come back.
3. `export AWS_PROFILE=hello-admin` (the old profile section is still there).

Nothing in AWS has changed, so nothing there needs undoing.

### 4.2 From stage B (both stacks live)

1. As 4.1. `README.md` gets the old ids back with the revert.
2. The old stack is exactly as it was after plan step 55: same URL, pool, client, admin password,
   alarm subscription, budget. Use it again.
3. The new stack may stay (it costs nothing within the free tier, section 7) or be deleted later.
   Deleting it needs the same unprotect steps as section 6.3, on its own tables and pool, with
   the PO's go.

**Never deploy the renamed template to `hello-world-api`.** Its tables would get new names
(R2), which CloudFormation does by **replacing** them. Section 5.1 adds a guard to
`deploy.sh` against it.

### 4.3 From stage C (old stack deleted)

There is no old stack to return to. A stack named `hello-world-api` could be created again from
scratch (`docs/RUNBOOK.md` section 3) on the reverted code, but it would be empty, with new ids.
This is why step 58 waits until the new stack has been in use for a while (section 6.3).

---

## 5. Step 56 — the repository (no cloud change)

### 5.1 Files

| File | Change |
|---|---|
| `backend/template.yaml` | `MessagesTable` → `TableName: !Sub ${AWS::StackName}-hello-messages`; `CalendarTable` → `TableName: !Sub ${AWS::StackName}-calendar`; `Description` "Hello World API …" → the shared calendar's back end, Hello World named as its check of the Lambda chain. The IAM policies already use the tables' ARNs (`!GetAtt`), so they need no change. |
| `backend/samconfig.toml` | `stack_name` and `s3_prefix` → `shared-calendar-api`; `docker_network` → `shared-calendar-local`. |
| `backend/docker-compose.yml` | `name: shared-calendar`; network `shared-calendar-local` (service attachments, the network's fixed `name:` and its comment). |
| `backend/scripts/local-api.sh` | the clean-up filter `--filter network=shared-calendar-local`. |
| `backend/scripts/local-seed.sh` | the network check (`" shared-calendar-local "`) and its comment. Table names unchanged (R7). |
| `backend/scripts/deploy.sh` | **New guard:** refuse when an argument names the stack `hello-world-api` (section 4.2), with a message pointing at this document. Unit-free (shell); tested by hand: `npm run deploy -w backend -- --stack-name hello-world-api` must stop before building. |
| `CLAUDE.md` | the stack line of "Everyday commands" (`shared-calendar-api`, profile `shared-calendar-admin`), the network in the Codespaces and `sam local` notes, the `docker rm` filter, and a pointer to this document under "Where the truth lives". |
| `README.md` | title; the stack name, the log group names, the `smoke` / `bootstrap-admin` / `budget` examples; the profile. The ids (`ApiUrl`, `UserPoolId`, `UserPoolClientId`) only in step 57, when they exist. |
| `docs/ARCHITECTURE.md` | title; sections 5.2 and 5.3: the physical table names `<stack>-hello-messages` / `<stack>-calendar` (locally `hello-messages` / `calendar`); the bootstrap diagram's stack name (section 6); section 9's example stacks (`shared-calendar-dev`, `shared-calendar-prod`); a change-log entry. |
| `docs/SHARED_CALENDAR_SPEC.md` | section 13.1 and decision D21: the table's physical name follows the stack (`<stack>-calendar`); a change-log entry. |
| `docs/IMPLEMENTATION_PLAN.md` | title; status line. The text of completed steps (2, 3, 11, 55: `samconfig.toml`, the network, the first deploy) keeps the old names: it is history. |
| `docs/RUNBOOK.md` | header table (stack, profile); sections 1–4: the new names and commands; section 3 (deploying from scratch) is what step 57 follows; section 5 keeps its records and gets a 5.4 for the rename. |
| `docs/FOLDER_STRUCTURE.md` | the project's description, the example commands, the front-end stack sentence. |
| `docs/AWS_ACCOUNTS.md`, `docs/NEW_ACCOUNT.md` | stack, profile and SSO session names; the optional account alias example → `shared-calendar`; the root plus-address example → `you+aws-shared-calendar-root@gmail.com`. |
| `docs/journeys/` | only if a page names the stack, the network or the profile (none did on 2026-11-16). |

### 5.2 Acceptance of step 56

- `git grep -n -i -E 'hello-world-api|hello-local|hello-admin|Hello World API|aws-hello-root|hello-(dev|prod)'`
  outside `prompts/` finds only history (change logs, `docs/RUNBOOK.md` section 5, the text of
  completed plan steps), the retirement and revert instructions (this document, plan step 58), the
  `deploy.sh` guard, and the notes that name the old stack and profile while they still exist
  (`CLAUDE.md`, `README.md`'s deployed-stack table until step 57, `docs/RUNBOOK.md` and
  `docs/AWS_ACCOUNTS.md`).
- `sam validate --lint`: the template is valid; `TableName` uses `!Sub`.
- The local stack restarted under the new names (section 5.3), then the root
  `DYNAMODB_PORT=<port> npm run verify` green.
- `deploy.sh` refuses `--stack-name hello-world-api`.

### 5.3 What the operator does in step 56

1. **Before the change:** stop `local:api` (Ctrl-C) and `npm run local:down -w backend`. Old and
   new compose names would otherwise run side by side.
2. **New profile, old one kept** (R5). In `~/.aws/config`, add beside the existing sections:

   ```ini
   [profile shared-calendar-admin]
   sso_session = shared-calendar
   sso_account_id = <the same account id as hello-admin>
   sso_role_name = AdministratorAccess
   region = eu-north-1
   [sso-session shared-calendar]
   sso_start_url = <the same portal URL as sso-session hello>
   sso_region = us-east-1
   sso_registration_scopes = sso:account:access
   ```

   Copy the values from the existing `hello-admin` / `hello` sections. Then, in every terminal
   that talks to AWS: `export AWS_PROFILE=shared-calendar-admin` and once
   `aws sso login --profile shared-calendar-admin --use-device-code` (the login cache is per SSO
   session, so the old login does not carry over). Check with `aws sts get-caller-identity`: same
   account as before. If a shell start-up file or a Codespace secret sets `AWS_PROFILE`, change it
   there too.
3. **After the change:** the iptables rule of `CLAUDE.md` is unchanged (it matches every bridge).
   `DYNAMODB_PORT=<port> npm run local:up -w backend`, `npm run local:api -w backend`. Cognito
   users in `backend/.cognito/` survive; the tables are seeded again (they are in memory anyway).
   When nothing uses it any more, the old network can go: `docker network rm hello-local`.
4. Review the diff; commit on request.

---

## 6. Steps 57 and 58 — AWS

Every command below that changes AWS is run by the operator, after the PO's explicit go
(`CLAUDE.md`, "Cloud safety"). Read-only checks need only the SSO session.

### 6.1 Step 57 — create `shared-calendar-api`

Follows `docs/RUNBOOK.md` section 3 (deploying from scratch):

1. Clean, committed tree; root `verify` green less than 30 minutes before.
2. First deploy, which must carry the alert address once. Command-line `--parameter-overrides`
   replace those of `samconfig.toml`, so the command repeats them:

   ```bash
   npm run deploy -w backend -- --parameter-overrides AdminUsername="admin" FunctionArchitecture="arm64" AlertEmail=<address>
   ```

   The address is typed in the terminal, never written into a file or the conversation.
   Expected change set: **only Add**, 118 resources, on a stack that does not exist yet. Record
   the output with `script` (`docs/RUNBOOK.md` section 2).
3. Confirm the alarm subscription e-mail **the same day** (the step-11 one expired unconfirmed).
4. `npm run bootstrap-admin -w backend -- shared-calendar-api`: the admin password (a new pool,
   so a new password; it may be the same text as the old one).
5. `npm run budget -w backend -- shared-calendar-api`: the 1 USD budget `shared-calendar-api-monthly`.
6. `npm run smoke -w backend -- shared-calendar-api`: 19/19 PASS.
7. Read-only checks, as in plan step 55: stack `CREATE_COMPLETE`, five outputs, the two tables
   (`shared-calendar-api-calendar` 10/10, `shared-calendar-api-hello-messages` 1/1, deletion
   protection on), the smoke history, AC-36 over the new log groups, alarms, subscription.
8. Documents: `README.md` gets the three new ids and the new log group names; `docs/RUNBOOK.md`
   section 5.4 records the deploy.

From now on the new stack is the one in use; the old one stays as the way back (section 4.2).

### 6.2 What changes for a user of the API

New `ApiUrl`, `UserPoolId` and `UserPoolClientId`; the old ones keep working until step 58.
Every user other than `admin` must be created again in the new pool (on 2026-11-16 there is none).
No front end is deployed, so nothing else points at the old ids.

### 6.3 Step 58 — retire `hello-world-api`

**When:** after the new stack has been in use for a while with no problem (the PO decides; one
week is a reasonable minimum). Not urgent: both stacks fit the free tier together (section 7).
After this step there is no way back to the old stack (section 4.3).

The old stack protects its data three times; each protection is lifted on purpose, one resource
at a time, with the PO's go:

1. Read-only first: export anything wanted from the old stack (its tables hold only smoke
   history; its log groups are deleted with the stack).
2. `aws dynamodb update-table --table-name hello-messages --no-deletion-protection-enabled`
   and the same for `calendar`.
3. The user pool's `DeletionProtection: ACTIVE`: `aws cognito-idp update-user-pool` resets every
   attribute it is not given, so the exact command is prepared in the step from the pool's
   current `describe-user-pool`, and checked before it runs.
4. `aws cloudformation delete-stack --stack-name hello-world-api` (not through `deploy.sh`), then
   `describe-stacks` until it is gone; `DELETE_FAILED` is diagnosed read-only first.
5. The budget outside the template: `aws budgets delete-budget --budget-name hello-world-api-monthly`.
6. The SAM upload bucket keeps the old stack's artifacts under the prefix `hello-world-api/`;
   they cost almost nothing and may stay, or be removed with the PO's go.
7. `~/.aws/config`: remove the `[profile hello-admin]` and `[sso-session hello]` sections.
8. Documents: `docs/RUNBOOK.md` section 5.4 records the retirement; this document's status
   becomes "done"; the revert sections lose their old-stack instructions.

---

## 7. Cost

Each stack provisions 11 read and 11 write units (`calendar` 10/10, `hello-messages` 1/1). Both
stacks together: 22/22, still inside the always-free 25/25 (`docs/ARCHITECTURE.md` section 10).
Lambda, API Gateway and Cognito stay within their free tiers at this load. A third stack (for
example a test one) would cross the 25 units: stay at two at most.

## 8. Risks

| Risk | Mitigation |
|---|---|
| The renamed template is deployed to `hello-world-api`, so CloudFormation tries to replace its tables | `deploy.sh` guard (section 5.1); `samconfig.toml` names the new stack |
| The new stack's alarm subscription expires unconfirmed | confirm the same day (section 6.1, item 3) |
| The repository names `shared-calendar-api` before it exists (stage A) | run step 57 right after step 56 |
| Lifting deletion protection on the wrong stack's resources | step 58 names every resource by its full name, read back with `describe-…` first; one go per command |
| Something only the old setup had is forgotten | the old stack stays until step 58; anything missing shows up while both exist |
