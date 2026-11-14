# Operator runbook

What to do, in order, to work on the deployed stack: the daily start, updating the stack,
deploying from scratch, and the one-time setup done during plan step 11 that is easy to
forget. The why behind each rule is in `docs/ARCHITECTURE.md` and `CLAUDE.md`. Which AWS
identity to sign in with (Identity Center user, root, Builder ID) is in `docs/AWS_ACCOUNTS.md`.

| | |
|---|---|
| Stack | `hello-world-api` |
| Region | `eu-north-1` (the only region the AWS organization allows for regional services) |
| CLI profile | `hello-admin` (IAM Identity Center, role `AdministratorAccess`) |
| Alerts to | the `AlertEmail` stack parameter |

---

## 1. Every working session

1. **Codespace only, after every Codespace start** (lost on restart): let containers on the
   Docker network `hello-local` talk to each other. Without it the authorizer times out reaching
   cognito-local and the integration tests get 502s.

   ```bash
   sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT
   ```

2. `nvm use` (Node 22 from `.nvmrc`). Commands below run from the repository root; the back
   end's scripts run in its workspace (`-w backend`, or `cd backend` and drop the flag). After a
   fresh clone or a dependency change: `npm ci` at the root.
3. In every terminal that talks to AWS:

   ```bash
   export AWS_PROFILE=hello-admin
   aws sts get-caller-identity          # fails when the login expired, then:
   aws sso login --profile hello-admin --use-device-code
   ```

   The device code is needed in the Codespace: the normal login waits for a browser callback
   on `localhost`, which is the laptop, not the Codespace. Do not set `AWS_REGION`: the scripts
   and SAM take the region from `backend/samconfig.toml`.

---

## 2. Updating the deployed stack (code or template change)

1. Make the change, commit it. The deploy refuses uncommitted changes.
2. Start the local stack (two terminals, leave them running):

   ```bash
   DYNAMODB_PORT=8002 npm run local:up -w backend
   npm run local:api -w backend         # wait for "Running on http://127.0.0.1:3000"
   ```

3. `DYNAMODB_PORT=8002 npm run verify -w backend`: must end with `verify PASSED … (clean tree)`.
   From now on there are **30 minutes** to deploy, and no tracked file may change.
4. `npm run deploy -w backend` (no `--guided`, no `AlertEmail`: the other answers are in
   `backend/samconfig.toml`,
   and SAM reuses the alert address the stack already has).
   Read the change set before answering `y`. **Remove** or **Replace** on `UserPool`,
   `MessagesTable`, `CalendarTable` or `AdminUser` means data loss: answer N and investigate.
   The first deploy with the shared calendar (plan step 55) shows `CalendarTable`, its policies
   and functions as **Add**; that is expected.
5. `npm run smoke -w backend -- hello-world-api` (asks for the admin password): all 19 lines must
   say PASS (10 Hello World checks, 9 calendar checks: section 2.1).

Rules:

- Never change `AdminUsername` after the first deploy: CloudFormation would delete and recreate
  the administrator.
- If a deploy rewrites `backend/samconfig.toml`, commit it before the next deploy (and verify again).
  Never commit an e-mail address into it: the repository is public.
- To change the alert address: `npm run deploy -w backend -- --parameter-overrides AlertEmail=<new>`,
  confirm the new subscription e-mail the same day, and change the budget's recipient in the
  console (Billing → Budgets; `npm run budget -w backend` does not touch an existing budget).
- Never change `CalendarTimeZone` once the calendar holds data (default `Europe/Rome`): the stored
  dates and instants were computed in that zone and would no longer agree with the new one. An
  invalid value makes every calendar request answer 500 (and fires the 5xx alarm).
- `FunctionArchitecture` stays `arm64` in the cloud; the `x86_64` value is only for the local
  stack on x86 machines (`local-api.sh` sets it).

### 2.1 The smoke test's calendar journey

Between the throw-away user's `/hello` and its deletion, the smoke test runs one calendar journey
(spec 18.4) through the API only. It never changes the settings, never touches anything it did not
create, and never prints a calendar answer body (status and error code only). Its lines, all
starting with `calendar:`:

| Line | Checks |
|---|---|
| `GET /calendar/settings -> 200 (zone …, cancellation notice … h)` | the settings and the zone can be read |
| `03:00-04:00 <zone> free on <date>` | one calendar view (31 days from 50 days ahead) has a date where that hour holds no window, no active appointment and fewer than 10 one-off windows |
| `POST /calendar/types smoke-<epoch> -> 201` | a type of its own |
| `POST /calendar/windows <date> 03:00-04:00 -> 201` | a one-off window of that type |
| `book <date> 03:00 for smoke-<epoch> -> 201, booked, 60 min, type …` | the Administrator books for the user, with a note |
| `upcoming as smoke-<epoch> -> the appointment` | the user sees exactly it, with its note and `cancellableUntil` |
| `cancel as smoke-<epoch> -> 200, cancelled (cancelReason cancelled)` | the user cancels |
| `DELETE /calendar/windows/<id> -> 204`, `DELETE /calendar/types/<id> -> 204` | its window and type are removed |

**What stays in the `calendar` table, by design** (history, like the smoke rows in
`hello-messages`): per run, one cancelled appointment with username and type name
`smoke-<epoch>` at 03:00 local about 50 days ahead, its pointer, its `appointment.booked` and
`appointment.cancelled` events, and the `DELETEDUSER` marker that journey 11 writes for the user.
No type and no window stay. A cancelled appointment blocks nothing.

**When the calendar journey fails:**

- `no free 03:00-04:00 … from … to …`: the real calendar has availability or appointments at
  03:00 on every one of those 31 days. Nothing was created. Check the calendar view for that
  range; the test never moves anyone's availability. A run on another day searches other dates.
- `no usable date: cancellationNoticeHours … h …`: every date searched was too soon for the user
  to cancel. With the spec's ranges (at most 720 h) this cannot happen; if it does, the settings
  are outside them. The operator decides; the test never changes the settings.
- `POST /calendar/types … -> 409 limit_reached`: 20 types exist; nothing was created.
- a `409` on the window or the booking (`availability_overlap`, `slot_taken`, …): someone wrote at
  03:00 on that date between the read and the write. Rerun.
- any other failure: the `cleanup:` lines that follow say what was removed. A `CLEANUP FAILED:`
  line names the appointment, window or type id left behind: cancel the appointment as the
  Administrator (`POST /calendar/appointments/<id>/cancel`), then delete the window
  (`DELETE /calendar/windows/<id>`), then the type (`DELETE /calendar/types/<id>`), in this order.

**AC-36 in the cloud (plan step 55, by hand).** The booking carries the note
`smoke-test note <epoch>, must never reach a log`. After the smoke test, CloudWatch → Logs
Insights over the log groups of `BookAppointmentFunction`, `ListAppointmentsFunction` and
`CancelAppointmentFunction`, the last hour:

```
fields @timestamp, @message | filter @message like /must never reach a log/
```

must return no rows. The same query with `/eyJ/` (a token) must return none too.

---

## 3. Deploying from scratch (new stack, new account or after deleting it)

Plan step 11 has the full list; in short:

0. Region check, read-only: `aws cloudformation describe-stacks --stack-name hello-world-api
   --region eu-north-1` must answer "does not exist", not `AccessDenied … explicit deny in a
   service control policy`. In another account, check its organization's allowed region first and
   put it in `backend/samconfig.toml` (both `region` lines) and the profile.
1. Steps 1 to 3 of section 2 (commit, local stack, verify).
2. `npm run deploy -w backend -- --parameter-overrides AlertEmail=<alert address>`.
   `backend/samconfig.toml` already holds everything else (stack, region, capabilities, `AdminUsername` `admin`,
   `FunctionArchitecture` `arm64`); the address is the one value it leaves out, because the
   repository is public. CloudFormation stores it with the stack, so later deploys omit it.
   Without the flag the deploy stops before creating anything: `AlertEmail` must have a value.
   Avoid `--guided`; if you use it, answer N to "Save arguments to configuration file", or SAM
   writes the address into `backend/samconfig.toml`.
3. `npm run bootstrap-admin -w backend -- hello-world-api`: sets the admin password. Until then the admin
   status is `FORCE_CHANGE_PASSWORD` and the smoke test cannot sign in.
4. `npm run smoke -w backend -- hello-world-api`: 19 PASS (section 2.1). On a new stack the
   calendar is empty, so the first date searched is free.
5. `npm run budget -w backend -- hello-world-api --dry-run`, then
   `npm run budget -w backend -- hello-world-api`. The
   budget is **not** in the template (CloudFormation has no `AWS::Budgets::Budget` in
   `eu-north-1`), so a new stack has no budget until this runs.
6. Click the link in the "AWS Notification - Subscription Confirmation" e-mail sent to
   `AlertEmail` (look in spam too), or the error alarms send nothing. Do it the same day: an
   unconfirmed subscription disappears after about two days and a redeploy does not bring it
   back. Check, and re-subscribe if the list is empty (then confirm the new e-mail):

   ```bash
   topic=$(aws cloudformation describe-stack-resources --stack-name hello-world-api \
     --query "StackResources[?ResourceType=='AWS::SNS::Topic'].PhysicalResourceId" --output text)
   aws sns list-subscriptions-by-topic --topic-arn "$topic"   # ARN = confirmed
   aws sns subscribe --topic-arn "$topic" --protocol email --notification-endpoint <AlertEmail>
   ```
7. Console checks: Billing → Budgets shows `hello-world-api-monthly` (1 USD); DynamoDB →
   `hello-messages` → Explore items shows the smoke rows; `calendar` shows the smoke test's cancelled
   appointment, its two events and the deleted-user marker (section 2.1).

If the first create fails: CloudFormation rolls back, but cannot delete the three protected
resources (the tables `hello-messages` and `calendar`, and the user pool), so the stack may end in
`ROLLBACK_FAILED` or `ROLLBACK_COMPLETE`. Read the first `CREATE_FAILED` in
`aws cloudformation describe-stack-events --stack-name hello-world-api` before changing
anything. Cleaning up means deleting the stack while keeping those resources
(`--retain-resources MessagesTable CalendarTable UserPool`), then switching off their deletion
protection and deleting them by hand; the fixed table names would otherwise block the next deploy.
The same holds for removing the stack on purpose: the calendar's appointments and history are lost
with the `calendar` table, so export what must be kept first.

A failed change set (for example an unknown resource type) creates nothing: the stack stays in
`REVIEW_IN_PROGRESS` with 0 resources, and the next deploy simply reuses it.

---

## 4. One-time AWS setup (redo only for a new account or a new machine)

**Accounts.** The console's multi-account setup created an AWS Organization:

| Account | Use |
|---|---|
| Management account (root user = the sign-up e-mail) | billing and emergencies only; IAM Identity Center lives here (home region `us-east-1`) |
| "Identity Delegated Admin" | where the stack is deployed and where `hello-admin` signs in |
| "Side Quest Accepted" | unused |

The organization policy `AdvancedModeRegionRestrictionSecurityControlPolicy` applies to all
member accounts: regional services only in `eu-north-1`; in `us-east-1` only global services
(IAM, Budgets, billing…). This is why the stack is in `eu-north-1` and why the budget is a script.

**Done once as root** (management account):

- MFA on the root user; no root access keys.
- Account → "IAM user and role access to Billing information" → activated (needed to see
  Billing → Budgets with the Identity Center user).
- IAM Identity Center enabled with AWS Organizations. User created (its own plus e-mail);
  permission set `AdministratorAccess`; assigned to the "Identity Delegated Admin" account.
  To use another account, assign the permission set there too and add a profile for it.
- Access portal URL: IAM Identity Center → Dashboard → Settings summary. Both the dual-stack
  (`ssoins-….portal.us-east-1.app.aws`) and the IPv4-only URL work; always use the same one.

**CLI profile on a new machine:**

```bash
aws configure sso --use-device-code
#   SSO session name: hello      start URL: the portal URL      SSO region: us-east-1
#   scopes: Enter                account/role: AdministratorAccess
#   default client region: eu-north-1   output: json   profile name: hello-admin
```

The SSO region (`us-east-1`, where Identity Center lives) and the client region (`eu-north-1`,
where the stack lives) are different on purpose.

**Codespace.** Besides the firewall line of section 1: no arm64 emulation is needed any more
(the local functions run as `x86_64`). The QEMU registration done during step 11
(`tonistiigi/binfmt --install arm64`) can be ignored.

---

## 5. Still open after plan step 11

Done on 2026-11-02: admin password set (`CONFIRMED`), smoke test 10/10 PASS, budget
`hello-world-api-monthly` created, SNS subscription confirmed (re-subscribed by hand: the first
one had expired unconfirmed), smoke rows in `hello-messages`, logs checked. The alert address
was taken out of `backend/samconfig.toml` (public repository); the stack keeps it.

- [x] Commit at the end of step 11 (`7e52743`).
- [x] Step 12 (2026-11-04): `README.md` written, architecture marked "v1 implemented" (v9), tag
      `v1.0.0`.
- [ ] Cost Explorer forecast for the month (console; can lag a day). The budget's own forecast
      also shows "None" until AWS has a few days of cost data.
- [ ] First deploy since `AlertEmail` left `backend/samconfig.toml`: the change set must show **no**
      change to `AlarmTopic` (SAM should reuse the value stored with the stack; untested).
      If it shows Modify or Replace, answer N and pass `--parameter-overrides AlertEmail=<address>`.
- [x] Plan step 20 (2026-11-04): monorepo move, the back end now lives in `backend/`
      (`docs/FOLDER_STRUCTURE.md`). Commands take `-w backend`.
- [ ] First deploy after the move: the change set must show the four functions' code and
      nothing else (new bundles that now include `shared/`; no resource, role or parameter
      change). The build uses SAM's beta monorepo support (`backend/samconfig.toml`); if a SAM
      upgrade breaks it, `npm run build -w backend` fails before anything is deployed.
- [x] Plan step 52 (2026-11-14): the smoke test gains the calendar journey (section 2.1); 19/19
      PASS locally. Not yet run against the stack (plan step 55; the 10/10 above was step 11's).
