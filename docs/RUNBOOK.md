# Operator runbook

What to do, in order, to work on the deployed stack: the daily start, updating the stack,
deploying from scratch, and the one-time setup done during plan step 11 that is easy to
forget. The why behind each rule is in `docs/ARCHITECTURE.md` and `CLAUDE.md`. Which AWS
identity to sign in with (Identity Center user, root, Builder ID) is in `docs/AWS_ACCOUNTS.md`.

| | |
|---|---|
| Stack | `shared-calendar-api` |
| Region | `eu-north-1` (the only region the AWS organization allows for regional services) |
| CLI profile | `shared-calendar-admin` (IAM Identity Center, role `AdministratorAccess`) |
| Alerts to | the `AlertEmail` stack parameter |
| Old stack | `hello-world-api` (profile `hello-admin`): replaced by `shared-calendar-api` in `docs/IMPLEMENTATION_PLAN.md` step 57 (2026-11-16); it stays, untouched, as the way back until step 58 (`docs/RENAME_PLAN.md` section 4.2). Never deploy to it: `deploy.sh` refuses |

---

## 1. Every working session

1. **Codespace only, after every Codespace start** (lost on restart): let containers on the
   Docker network `shared-calendar-local` talk to each other. Without it the authorizer times out reaching
   cognito-local and the integration tests get 502s.

   ```bash
   sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT
   ```

2. `nvm use` (Node 22 from `.nvmrc`). Commands below run from the repository root; the back
   end's scripts run in its workspace (`-w backend`, or `cd backend` and drop the flag). After a
   fresh clone or a dependency change: `npm ci` at the root.
3. In every terminal that talks to AWS:

   ```bash
   export AWS_PROFILE=shared-calendar-admin
   aws sts get-caller-identity          # fails when the login expired, then:
   aws sso login --profile shared-calendar-admin --use-device-code
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
   and SAM reuses the alert address the stack already has; plan step 55 confirmed it). Run it in
   a terminal set up as in section 1, item 3: without `AWS_PROFILE` the build succeeds and
   `sam deploy` then stops with `Unable to locate credentials`, before anything reaches AWS.
   Read the change set before answering `y`. **Remove** or **Replace** on `UserPool`,
   `MessagesTable`, `CalendarTable` or `AdminUser` means data loss: answer N and investigate.
   The change set of plan step 55 (the shared calendar's first deploy) is in section 5.2.
   To keep the output (the Codespace terminal cannot be copied from), record the session with
   `script -q -c "npm run deploy -w backend" /tmp/deploy.txt`: the prompt stays interactive.
   Never `> out.txt` inside the repository: the new file makes the tree dirty and the deploy
   refuses, and the change set and its prompt would go to the file instead of the screen.
5. `npm run smoke -w backend -- shared-calendar-api` (asks for the admin password; `-w backend` is
   needed, the root has no `smoke` script): all 19 lines must say PASS (10 Hello World checks,
   9 calendar checks: section 2.1). `script -q -c "…" /tmp/smoke.txt` works here too; the
   password prompt does not echo, so the password does not reach the file.

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
No type and no window stay. A cancelled appointment blocks nothing. Besides these, the table holds
one `LOCK` item from the first calendar write on (the calendar lock, one item for the whole
table); its `version` goes up by one per locked write, 7 per smoke run on an otherwise unused
calendar. No `SETTINGS` item appears: the smoke test only reads the settings, and until an
Administrator saves them the API answers the defaults.

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

must return no rows. The same query with `/eyJ/` (a token) must return none too. Read the
"records scanned" figure as well: in the first minutes after the smoke test Logs Insights may not
have indexed the new events yet and scans 0 records, so 0 rows proves nothing. Wait a few minutes
and rerun until it scans the run's events: 4 or 5 per function call (START, the one log line, END,
REPORT, and INIT_START on a cold start), so 15 over the three log groups above.

---

## 3. Deploying from scratch (new stack, new account or after deleting it)

Plan step 11 has the full list; in short:

0. Region check, read-only: `aws cloudformation describe-stacks --stack-name shared-calendar-api
   --region eu-north-1` must answer "does not exist", not `AccessDenied … explicit deny in a
   service control policy`. In another account, check its organization's allowed region first and
   put it in `backend/samconfig.toml` (both `region` lines) and the profile.
1. Steps 1 to 3 of section 2 (commit, local stack, verify).
2. `npm run deploy -w backend -- --parameter-overrides AdminUsername="admin" FunctionArchitecture="arm64" AlertEmail=<alert address>`.
   `backend/samconfig.toml` holds everything else (stack, region, capabilities); the address is
   the one value it leaves out, because the repository is public. A `--parameter-overrides` on the
   command line replaces the whole `parameter_overrides` line of `backend/samconfig.toml`, so the
   command repeats `AdminUsername` and `FunctionArchitecture` (plan step 57 used exactly this
   command). CloudFormation stores the address with the stack, so later deploys omit it.
   Without the flag the deploy stops before creating anything: `AlertEmail` must have a value.
   Avoid `--guided`; if you use it, answer N to "Save arguments to configuration file", or SAM
   writes the address into `backend/samconfig.toml`.
3. `npm run bootstrap-admin -w backend -- shared-calendar-api`: sets the admin password. Until then the admin
   status is `FORCE_CHANGE_PASSWORD` and the smoke test cannot sign in.
4. `npm run smoke -w backend -- shared-calendar-api`: 19 PASS (section 2.1). On a new stack the
   calendar is empty, so the first date searched is free.
5. `npm run budget -w backend -- shared-calendar-api --dry-run`, then
   `npm run budget -w backend -- shared-calendar-api`. The
   budget is **not** in the template (CloudFormation has no `AWS::Budgets::Budget` in
   `eu-north-1`), so a new stack has no budget until this runs.
6. Click the link in the "AWS Notification - Subscription Confirmation" e-mail sent to
   `AlertEmail` (look in spam too), or the error alarms send nothing. Do it the same day: an
   unconfirmed subscription disappears after about two days and a redeploy does not bring it
   back. Check, and re-subscribe if the list is empty (then confirm the new e-mail):

   ```bash
   topic=$(aws cloudformation describe-stack-resources --stack-name shared-calendar-api \
     --query "StackResources[?ResourceType=='AWS::SNS::Topic'].PhysicalResourceId" --output text)
   aws sns list-subscriptions-by-topic --topic-arn "$topic"   # ARN = confirmed
   aws sns subscribe --topic-arn "$topic" --protocol email --notification-endpoint <AlertEmail>
   ```
7. Console checks: Billing → Budgets shows `shared-calendar-api-monthly` (1 USD); DynamoDB →
   `shared-calendar-api-hello-messages` → Explore items shows the smoke rows;
   `shared-calendar-api-calendar` shows the smoke test's cancelled
   appointment, its two events and the deleted-user marker (section 2.1).

If the first create fails: CloudFormation rolls back, but cannot delete the three protected
resources (the tables `<stack>-hello-messages` and `<stack>-calendar`, and the user pool), so the stack may end in
`ROLLBACK_FAILED` or `ROLLBACK_COMPLETE`. Read the first `CREATE_FAILED` in
`aws cloudformation describe-stack-events --stack-name shared-calendar-api` before changing
anything. Cleaning up means deleting the stack while keeping those resources
(`--retain-resources MessagesTable CalendarTable UserPool`), then switching off their deletion
protection and deleting them by hand; the table names, fixed for a given stack name, would
otherwise block the next deploy under that name.
The same holds for removing the stack on purpose: the calendar's appointments and history are lost
with the `<stack>-calendar` table, so export what must be kept first.

A failed change set (for example an unknown resource type) creates nothing: the stack stays in
`REVIEW_IN_PROGRESS` with 0 resources, and the next deploy simply reuses it.

---

## 4. One-time AWS setup (redo only for a new account or a new machine)

**Accounts.** The console's multi-account setup created an AWS Organization:

| Account | Use |
|---|---|
| Management account (root user = the sign-up e-mail) | billing and emergencies only; IAM Identity Center lives here (home region `us-east-1`) |
| "Identity Delegated Admin" | where the stack is deployed and where `shared-calendar-admin` signs in |
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
#   SSO session name: shared-calendar      start URL: the portal URL      SSO region: us-east-1
#   scopes: Enter                account/role: AdministratorAccess
#   default client region: eu-north-1   output: json   profile name: shared-calendar-admin
```

The SSO region (`us-east-1`, where Identity Center lives) and the client region (`eu-north-1`,
where the stack lives) are different on purpose.

**Codespace.** Besides the firewall line of section 1: no arm64 emulation is needed any more
(the local functions run as `x86_64`). The QEMU registration done during step 11
(`tonistiigi/binfmt --install arm64`) can be ignored.

---

## 5. Deployment record and open items

### 5.1 Plan step 11 (2026-11-02, first deploy)

Done on 2026-11-02: admin password set (`CONFIRMED`), smoke test 10/10 PASS, budget
`hello-world-api-monthly` created, SNS subscription confirmed (re-subscribed by hand: the first
one had expired unconfirmed), smoke rows in `hello-messages`, logs checked. The alert address
was taken out of `backend/samconfig.toml` (public repository); the stack keeps it.

### 5.2 Plan step 55 (2026-11-16, the shared calendar)

The first stack update since step 11, so also the first after the monorepo move and the first
without `AlertEmail` in `backend/samconfig.toml`. Commit deployed: `340d9b0` (the step's brief
on top of `61f729f`); `verify` PASSED on the clean tree at 09:34 UTC, deploy executed at 09:56 UTC
with `npm run deploy -w backend` and no extra argument.

- **A1:** `CalendarTimeZone` = `Europe/Rome` confirmed by the PO before the deploy; it comes from
  the template default (nothing in `backend/samconfig.toml` or on the command line). The stack
  now stores it; all 21 functions with `CALENDAR_TIME_ZONE` have `Europe/Rome`.
- **Change set:** 89 Add (`CalendarTable`; `CalendarReadPolicy`, `CalendarWritePolicy`,
  `CalendarDeletePolicy`, `CalendarBookPolicy`; 21 functions, the 20 calendar ones and
  `ListUsersFunction`, each with its role, log group and permission), 6 Modify, all with
  Replacement `False` (`AuthorizerFunction`, `HelloFunction`, `CreateUserFunction`,
  `DeleteUserFunction`, `DeleteUserRole`, `HttpApi`: the routes are part of the API's
  definition, not resources of their own), no Remove, no Replace. Nothing for `AlarmTopic`, the
  alarms, the user pool and its client, groups and admin user, or `MessagesTable`; the stage was
  not modified either. The list had been worked out beforehand from the template and the stack's
  resources. The operator answered `y` before the change set had been read back in the session;
  the check against the list was done right after, from the recorded output, and found nothing
  that would have meant N. Next time: read it first.
- **After the deploy:** stack `UPDATE_COMPLETE`, 118 resources, 25 functions (`arm64`,
  `nodejs22.x`), five outputs (`CalendarTableName` = `calendar` added; `ApiUrl`, `UserPoolId`,
  `UserPoolClientId` unchanged). Table `calendar`: provisioned 10/10, deletion protection on,
  empty. An unauthenticated `GET /calendar/settings` and `GET /calendar/appointments` answered 401.
- **Smoke test:** 19/19 PASS (user `smoke-1794823689`, the calendar journey on 2027-01-05
  03:00-04:00 `Europe/Rome`, cancellation notice 24 h).
- **After the smoke test:** `calendar` holds exactly the history of section 2.1 (the cancelled
  appointment, its `APPTID` pointer, its `appointment.booked` and `appointment.cancelled` events,
  the `DELETEDUSER` marker) plus the `LOCK` item at version 7; no type, no window, no `SETTINGS`.
  `hello-messages` holds 4 rows, the 2 of step 11 and the 2 of this run. AC-36: the Logs Insights
  queries of section 2.1 over the three log groups (15 records scanned) and over all 26 log
  groups of the stack (82 and 84 records) returned no row for the note and none for `/eyJ/`; the
  raw events of every log group, read with `aws logs filter-log-events`, hold no note, token,
  password or error line. The calendar log lines carry the request fields of
  `docs/SHARED_CALENDAR_SPEC.md` section 14.5, `appointmentId`, `lockAttempts` and plain
  counters or filters (`target`, `count`, `cancelledCount`, `upcoming`, `listStatus`), never a
  note, a body or a `conflicts` list. Alarms `OK`, unchanged since 2026-10-30, no
  history entry. SNS subscription still confirmed (no re-subscribe needed). Budget
  `hello-world-api-monthly` 1 USD, actual spend 0.0; month-to-date cost in Cost Explorer -0 USD.
  `aws ce get-cost-forecast` answers `DataUnavailableException: Insufficient amount of historical
  data`, and the budget's forecast is still "None": the forecast is not yet visible. Provisioned
  capacity is 11 read and 11 write units, inside the free 25/25 (`docs/ARCHITECTURE.md` section 10).

### 5.3 Open items

- [x] Commit at the end of step 11 (`7e52743`).
- [x] Step 12 (2026-11-04): `README.md` written, architecture marked "v1 implemented" (v9), tag
      `v1.0.0`.
- [ ] Cost Explorer forecast for the month. On 2026-11-16 the CLI and the budget still had no
      forecast ("Insufficient amount of historical data"); the month-to-date cost was 0 USD.
      Still so after plan step 57 (section 5.4), with both stacks live. Check again in the console
      (Billing, Cost Explorer) in a few days; from then on the budget to watch is
      `shared-calendar-api-monthly`.
- [x] First deploy since `AlertEmail` left `backend/samconfig.toml` (plan step 55, 2026-11-16):
      SAM reused the stored value, the change set showed nothing for `AlarmTopic`, and the
      subscription stayed confirmed. Deploys need no `AlertEmail`.
- [x] Plan step 20 (2026-11-04): monorepo move, the back end now lives in `backend/`
      (`docs/FOLDER_STRUCTURE.md`). Commands take `-w backend`.
- [x] First deploy after the move (plan step 55, 2026-11-16): the build with SAM's beta monorepo
      support worked in the cloud; the four old functions got new bundles, Modify without
      replacement. Their only template change besides the code was `CodeUri`, moved to `Globals`;
      `DeleteUserFunction` and `DeleteUserRole` also got their calendar part (section 5.2).
- [x] Plan step 52 (2026-11-14): the smoke test gains the calendar journey (section 2.1); 19/19
      PASS locally, and in the cloud with plan step 55 (section 5.2).

### 5.4 The rename to shared-calendar (`docs/RENAME_PLAN.md`)

- Plan step 56 (2026-11-16): the repository uses the new names (stack `shared-calendar-api`,
  tables named after the stack, profile `shared-calendar-admin`, Docker network
  `shared-calendar-local`); `deploy.sh` refuses the old stack's name. No cloud change: the
  deployed stack is still `hello-world-api`, as recorded in section 5.2.
- Plan step 57 (2026-11-16): the new stack `shared-calendar-api`, created from scratch (section 3)
  beside `hello-world-api`. Commit deployed: `4e22058` (the step's brief on top of `b752ea5`);
  `verify` PASSED on the clean tree at 12:18 UTC (root `DYNAMODB_PORT=8002 npm run verify`); deploy
  started at 12:25 UTC with `npm run deploy -w backend -- --parameter-overrides AdminUsername="admin"
  FunctionArchitecture="arm64" AlertEmail=<address>`; stack `CREATE_COMPLETE` at 12:27:40 UTC.
  - **A1:** `CalendarTimeZone` = `Europe/Rome` from the template default (nothing in
    `backend/samconfig.toml` or on the command line); the 21 functions with `CALENDAR_TIME_ZONE`
    have it. The smoke test's booking is the new calendar's first data, so it is now fixed.
  - **Change set:** 118 Add, nothing else (25 functions, 25 roles, 25 permissions, 26 log groups,
    4 managed policies, 2 tables, the user pool, its client, 2 groups, the admin user and its
    group attachment, the API and its stage, `AlarmTopic`, 2 alarms). The deployed template names
    nothing of `hello-world-api`. As in step 55, the operator answered `y` before the change set
    had been read back in the session; the check (recorded output and `describe-change-set`) was
    done right after and found nothing that would have meant N.
  - **After the deploy:** five outputs: `ApiUrl` `https://kk32tyn1s4.execute-api.eu-north-1.amazonaws.com`,
    `UserPoolId` `eu-north-1_mG58Opv7F`, `UserPoolClientId` `3gisesgktkagt34c3lentr5dmd`,
    `CalendarTableName` `shared-calendar-api-calendar`, `MessagesTableName`
    `shared-calendar-api-hello-messages`. Tables provisioned 10/10 and 1/1, deletion protection on,
    empty. 25 functions, `arm64`, `nodejs22.x`. User pool deletion protection `ACTIVE`, `admin` in
    `FORCE_CHANGE_PASSWORD` and in group `admin`. Both alarms `OK` (from `INSUFFICIENT_DATA` at
    creation). Unauthenticated `GET /calendar/settings`, `GET /calendar/appointments` and
    `POST /hello` answered 401.
  - **Subscription:** already confirmed when first checked, minutes after the deploy (an ARN, not
    `PendingConfirmation`); no re-subscribe needed.
  - **Admin password** set with `bootstrap-admin` at 12:35 UTC; `admin` `CONFIRMED`.
  - **Budget:** `shared-calendar-api-monthly`, 1 USD, actual and forecast at 100 %, e-mail to the
    same address as `hello-world-api-monthly` (compared without printing it); the dry run first.
  - **Smoke test:** 19/19 PASS at 12:40 UTC (user `smoke-1794832806`, the calendar journey on
    2027-01-05 03:00-04:00 `Europe/Rome`, cancellation notice 24 h).
  - **After the smoke test:** `shared-calendar-api-calendar` holds exactly the history of section
    2.1 (the cancelled appointment, its `APPTID` pointer, its `appointment.booked` and
    `appointment.cancelled` events, the `DELETEDUSER` marker) plus the `LOCK` item at version 7: 6
    items, no type, no window, no `SETTINGS`. `shared-calendar-api-hello-messages` holds the run's
    2 rows. AC-36: the Logs Insights queries of section 2.1 over the three log groups (15 records
    scanned, after a first run that scanned 0) and over all 26 log groups of the stack (87 records)
    returned no row for the note and none for `/eyJ/`; the 87 raw events read with
    `aws logs filter-log-events` hold no note, token, password or error line (the access log's
    `authorizerError` and `integrationError` are `-` throughout). Alarms not fired.
  - **Old stack:** `hello-world-api` `UPDATE_COMPLETE`, `LastUpdatedTime` 2026-11-16 09:56:34 UTC
    before and after (step 55), 118 resources; its alarms `OK` since 2026-10-30, its subscription
    and budget unchanged; `calendar` 6 items, `hello-messages` 4 rows.
  - **Cost:** month-to-date -0 USD; `aws ce get-cost-forecast` still answers
    `DataUnavailableException: Insufficient amount of historical data` (not yet visible, section
    5.3). The account's provisioned tables are now the two stacks' four: 22 read and 22 write
    units, inside the free 25/25 (`docs/RENAME_PLAN.md` section 7).
