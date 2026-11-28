# Operator runbook

What to do, in order, to work on the two deployed stacks, the API's and the page's: the daily
start, updating the API's stack, releasing the page, deploying from scratch, the assistant's
key and alarm, the one-time
setup done during plan step 11 that is easy to forget, and what to tell a person about their
password (section 6). The tools a machine needs, with their
versions, are in `README.md`, "Prerequisites". The why behind each rule is in `docs/ARCHITECTURE.md` and `CLAUDE.md`. Which AWS
identity to sign in with (Identity Center user, root, Builder ID) is in `docs/AWS_ACCOUNTS.md`.

| | |
|---|---|
| The API's stack | `shared-calendar-api` |
| The page's stack | `shared-calendar-web`, same region and profile: the hosting of the browser page (`docs/FRONTEND_ARCHITECTURE.md` section 13), first deployed on 2026-11-21 (section 5.5) and released with section 2, step 6. The page's address is its output `PageUrl` (`README.md`, "The deployed stacks", has it) |
| Region | `eu-north-1` (the only region the AWS organization allows for regional services) |
| CLI profile | `shared-calendar-admin` (IAM Identity Center, role `AdministratorAccess`) |
| Alerts to | the `AlertEmail` stack parameter |
| Old stack | `hello-world-api` (profile `hello-admin`): replaced by `shared-calendar-api` in `docs/IMPLEMENTATION_PLAN.md` step 57 (2026-11-16); **deleted on 2026-11-21** (step 58, section 5.4), with its tables, its user pool and its budget. There is no way back to it (`docs/RENAME_PLAN.md` section 4.3). Both `deploy.sh` still refuse its name |

---

## 1. Every working session

1. **Codespace only, after every Codespace start** (lost on restart): let containers on the
   Docker network `shared-calendar-local` talk to each other. Without it the authorizer times out reaching
   cognito-local and the integration tests get 502s.

   ```bash
   sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT
   ```

2. `nvm use` (Node 22 from `.nvmrc`). Commands below run from the repository root; the back
   end's scripts run in its workspace (`-w backend`, or `cd backend` and drop the flag), the front
   end's in its own (`-w frontend`). After a fresh clone or a dependency change: `npm ci` at the
   root. On a machine that has never run the project, first the tools of `README.md`,
   "Prerequisites": Node 22, Docker, the SAM CLI, the AWS CLI, git and curl.
3. In every terminal that talks to AWS (the profile is set up once per machine: section 4; the
   person needs an Identity Center user with access to the account: `docs/AWS_ACCOUNTS.md`):

   ```bash
   export AWS_PROFILE=shared-calendar-admin
   aws sts get-caller-identity          # fails when the login expired, then:
   aws sso login --profile shared-calendar-admin --use-device-code
   ```

   The device code is needed in the Codespace: the normal login waits for a browser callback
   on `localhost`, which is the laptop, not the Codespace. Do not set `AWS_REGION`: the scripts
   and SAM take the region from `backend/samconfig.toml` and, for the page, `frontend/samconfig.toml`.

---

## 2. Updating the deployed stacks (a change to the code or to a template)

What changed decides the steps:

| What changed | Steps |
|---|---|
| `backend/` only | 1 to 5 |
| `frontend/` only (the page, or its hosting in `frontend/template.yaml`) | 1 to 3, then 6 |
| `shared/`, or both | 1 to 6: `shared/` is built into the API's functions and into the page |

**The API first, always**: the page is built with values read from the API's stack, and its
command stops when that stack is missing. One `verify` (step 3) serves both deployments when
both fit into its 30 minutes; otherwise run it again before the second.

1. Make the change, commit it. The deploy refuses uncommitted changes.
2. Start the local stack (two terminals, leave them running):

   ```bash
   DYNAMODB_PORT=8002 npm run local:up -w backend
   npm run local:api -w backend         # wait for "Running on http://127.0.0.1:3000"
   ```

   They need Docker running. `DYNAMODB_PORT=8002` is for a machine where another project holds
   port 8000; drop it when the port is free, and use the same value in step 3.

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
5. `npm run smoke -w backend -- shared-calendar-api` (asks for the admin password, and at
   `MailStage` `on` for your own e-mail address, for the invitation's check; `-w backend` is
   needed, the root has no `smoke` script): every line must say PASS. At `on`, 65 lines (11 Hello
   World and Users checks, 13 calendar checks: section 2.1; 19 of the capacity of a type: section
   2.3; 7 of the assistant: section 3.2; 7 of the change of password: section 2.2; 6 of the
   invitation and 2 of the mail: section 2.4); at `off` or `domain`, 62 (section 2.4). At `on`
   one invitation reaches your mailbox: look that it came. Once the assistant is
   deployed the smoke test needs its key (section 3.2), and its exchange costs about a US cent
   at Anthropic. `script -q -c "…" /tmp/smoke.txt` works here too; the
   password prompt does not echo, so the password does not reach the file.
6. **Releasing the page**, after the back end's deploy and its smoke test, or alone when only
   `frontend/` changed (then steps 1 to 3, and this one): `npm run deploy -w frontend`, from the
   repository root, in a
   terminal set up as in section 1, item 3, inside the same 30 minutes of the same stamp. It
   takes no argument but `--dry-run`, which goes as far as the build and then says what it
   would do, changing nothing; it passes the same gate. In order
   (`docs/FRONTEND_ARCHITECTURE.md` section 13.6):
   - the gate, then `npm run verify -w frontend` (about a minute);
   - it reads `ApiUrl` and `UserPoolClientId` from the stack `shared-calendar-api`: the back
     end is deployed first, always;
   - `sam deploy` of `frontend/template.yaml` to the stack `shared-calendar-web`. **The only
     question it asks**, and only when a resource of the hosting changes: `Deploy this
     changeset? [y/N]`. Read the table first. A release of the page alone changes no
     resource: SAM says `No changes to deploy. Stack shared-calendar-web is up to date` and
     asks nothing. **Remove** or **Replace** on `PageBucket` or `Distribution` means a new
     bucket or a new address for the page: answer N and investigate. SAM must name no bucket
     of its own (`Deployment s3 bucket : None`);
   - the build, four uploads (`app.js.map`, `app.js`, `style.css`, `index.html` last), an
     invalidation of `/*` that it waits for (a minute or two);
   - four checks with curl and no credentials, `PASS` or `FAIL` each: `GET /` 200 with the
     Content-Security-Policy; `GET /app.js` 200 as JavaScript; `GET /api/calendar` 401 and
     `GET /api/no-such-route` 404, both with the API's own JSON. Then `The page is released:`
     and the address. One `FAIL` ends the command with an error: the files are uploaded all
     the same, and what the page then serves is not as designed.
   Record it like the back end's: `script -q -c "npm run deploy -w frontend" /tmp/deploy-web.txt`.
   The checks cannot prove a signed-in call: sign in at the page once after a release, as any
   user (`README.md`, "The deployed stacks": who can sign in, and with which password); the week
   that loads is the proof. The page's address is the command's last line and the stack's output
   `PageUrl`.
   **Which branch:** `main`. The first release was made from the branch `deploy-frontend`
   (section 5.5), merged into `main` since; the release of section 5.6 was made from `main`; the
   release of section 5.12 (`v3.1.0`) was made from the branch `multilanguage`, merged into
   `main` since.

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
- The assistant's model and its daily limit of messages per person are changed in
  `backend/samconfig.toml` (`AssistantModel`, `AssistantDailyMessageLimit`), committed, then
  deployed; a new model only after the evaluation with the real model (section 3.2).

### 2.1 The smoke test's calendar journey

Between the throw-away user's `/hello` and its deletion, the smoke test runs one calendar journey
(spec 18.4) through the API only. It never changes the settings, never touches anything it did not
create, and never prints a calendar answer body (status and error code only). Its lines, all
starting with `calendar:`:

| Line | Checks |
|---|---|
| `GET /calendar/settings -> 200 (zone …, cancellation notice … h)` | the settings and the zone can be read |
| `03:00-04:05 <zone> free on <date>` | one calendar view (31 days from 50 days ahead) has a date where 03:00–04:05 holds no window and no active appointment, with fewer than 10 one-off windows: the calendar journey's window 03:05–04:05 and the capacity journey's hour 03:00–04:00 (section 2.3) |
| `POST /calendar/types smoke-<epoch> -> 201` | a type of its own |
| `POST /calendar/windows <date> 03:05-03:50 -> 400 invalid_request, nothing written` | a window that is not a whole number of hours is refused (`docs/SHARED_CALENDAR_SPEC.md` decision D33), and the date then shows no window of the type |
| `POST /calendar/windows <date> 03:05-04:05 -> 201` | a one-off window of that type, of one whole hour from a start that is not on the hour |
| `book <date> 03:05 for smoke-<epoch> -> 201, booked, 60 min, type …` | the Administrator books for the user, with a note, the window's one slot, counted from its start (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01) |
| `upcoming as smoke-<epoch> -> the appointment` | the user sees exactly it, with its note and `cancellableUntil` |
| `cancel as smoke-<epoch> -> 200, cancelled (cancelReason cancelled)` | the user cancels |
| `book <date> 03:10-03:35 for smoke-<epoch> -> 201, the times on the 5-minute step read back` | the Administrator books custom times on the 5-minute step in the same window (`docs/SHARED_CALENDAR_SPEC.md` decision D32, R-BOOK-02); the answer holds exactly those two instants |
| `cancel 03:10-03:35 as the Administrator -> 200, cancelled` | the Administrator cancels it |
| `book <date> 03:07-03:35 for smoke-<epoch> -> 400 invalid_request, nothing written` | a start off the step is refused, and the user's appointments, cancelled ones included, hold none at 03:07 |
| `DELETE /calendar/windows/<id> -> 204`, `DELETE /calendar/types/<id> -> 204` | its window and type are removed |

**What stays in the `calendar` table, by design** (history, like the smoke rows in
`hello-messages`): per run, two cancelled appointments with username and type name
`smoke-<epoch>` about 50 days ahead, 03:05–04:05 and 03:10–03:35 local, their pointers, their
`appointment.booked` and `appointment.cancelled` events, and the `DELETEDUSER` marker that journey 11 writes for the user.
No type and no window stay. A cancelled appointment blocks nothing. Besides these, the table holds
one `LOCK` item from the first calendar write on (the calendar lock, one item for the whole
table); its `version` goes up by one per locked write, 9 for this journey and 12 for the
capacity journey (section 2.3), so 21 per smoke run on an otherwise unused calendar. No `SETTINGS` item appears: the smoke test only reads the settings, and until an
Administrator saves them the API answers the defaults.

**When the calendar journey fails:**

- `no free 03:00-04:05 … from … to …`: the real calendar has availability or appointments
  between 03:00 and 04:05 on every one of those 31 days. Nothing was created. Check the calendar view for that
  range; the test never moves anyone's availability. A run on another day searches other dates.
- `no usable date: cancellationNoticeHours … h …`: every date searched was too soon for the user
  to cancel. With the spec's ranges (at most 720 h) this cannot happen; if it does, the settings
  are outside them. The operator decides; the test never changes the settings.
- `POST /calendar/types … -> 409 limit_reached`: 20 types exist; nothing was created.
- a `409` on the window or the booking (`availability_overlap`, `slot_taken`, …): someone wrote at
  03:00 on that date between the read and the write. Rerun.
- `POST /calendar/windows … 03:05-03:50 -> 201`: the API deployed does not hold windows to whole
  hours (`docs/SHARED_CALENDAR_SPEC.md` decision D33); the window made is deleted by the clean-up.
  Stop before releasing the page (`docs/WINDOW_HOURS_PLAN.md` step w5).
- `book … 03:10-03:35 … -> 400 invalid_request`, or `… 03:07-03:35 … -> 201`: the API deployed
  is not on the 5-minute step of `docs/SHARED_CALENDAR_SPEC.md` decision D32. A booking made is
  cancelled by the clean-up; stop before releasing the page (`docs/SLOT_STEP_PLAN.md` F9).
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

### 2.2 The smoke test's change of password

After the assistant's exchange and before the user's deletion, the throw-away user changes its
own password straight at Cognito, as the page's screen "Password" does (`docs/ARCHITECTURE.md`
section 6.9). No Lambda runs and nothing reaches a log of the stack. Both passwords, the access
token and the refresh token stay in the script's variables and pipes; the two new passwords come
from the script's own generator, checked against the pool's rule. Its lines, all starting
with `password:`:

| Line | Checks |
|---|---|
| `ChangePassword with a wrong current password is refused (<error>)` | a wrong current password changes nothing; the line names Cognito's error: `NotAuthorizedException` is expected of the real Cognito, `InvalidPasswordException` is cognito-local's. The page reads both as "the current password is not correct" |
| `ChangePassword as smoke-<epoch> succeeds` | the change with the right current password |
| `the refresh token from before the change still works after ChangePassword alone` | `ChangePassword` revokes nothing: why the page signs out everywhere after it |
| `GlobalSignOut with the access token from before the change succeeds` | the sign-out everywhere the page sends after a change, with the same token |
| `the refresh token from before the change is refused after GlobalSignOut (NotAuthorizedException)` | every other device is signed out at its next refresh |
| `the old password no longer signs in (<error>)` | |
| `the new password signs in` | journey 11 then proves the deletion with the new password |

Against the local stack the two lines of `GlobalSignOut` print `SKIP`: cognito-local has none
(`docs/ARCHITECTURE.md` section 8). The local run ends `PASSED (2 check(s) skipped on the local
stack)`; a run against a stack never skips them. Two wrong passwords in a run (the wrong current
one, the old one at the sign-in) stay far below Cognito's lockout.

### 2.3 The smoke test's capacity journey

Right after the calendar journey (section 2.1), on its date and in its hour, 03:00–04:00 local:
that journey found the hour free of any window and active appointment and left it so (its
cancelled appointment blocks nothing), so the new window overlaps no real one
(`docs/SHARED_CALENDAR_SPEC.md` R-AV-01) and there is no second search. It runs only when the
calendar journey ended; otherwise one line `capacity: not run, …` says so (a FAIL). Two more
throw-away users, `smoke-<epoch>-b` and `smoke-<epoch>-c`, are made like the first (section
2.4). The Administrator books, so the settings' notice, horizon and limit do not bear on
the date; nothing of the settings, no real type and no real person's appointment is touched, and
no booking is forced on a real slot. Its lines, all starting with `capacity:`:

| Line | Checks |
|---|---|
| `POST /users smoke-<epoch>-b -> 201, invited`, `a permanent password set for smoke-<epoch>-b …` | the second user, made as section 2.4 says (three lines at `off` and `domain`) |
| the same two for `smoke-<epoch>-c`, then `signed in as smoke-<epoch>-c, no challenge` | the third user, who also signs in |
| `POST /calendar/types smoke-cap-<epoch> capacity 2 -> 201, capacity 2` | a type of its own that holds two people |
| `POST /calendar/windows <date> 03:00-04:00 of smoke-cap-<epoch> -> 201` | its one-off window |
| `overbook: true as smoke-<epoch>-c -> 403 forbidden, nothing written` | a User's own booking with `overbook` is refused, and that User has no appointment (`docs/SHARED_CALENDAR_SPEC.md` AC-41) |
| `book <date> 03:00 for smoke-<epoch> -> 201 (1 of 2)`, `… for smoke-<epoch>-b -> 201 (2 of 2)` | two people in one slot |
| `the Administrator's view: the slot 03:00 with capacity 2, placesLeft 0, 2 appointments` | the full slot is still offered to the Administrator (R-SLOT-04) |
| `smoke-<epoch>-c's view: the slot 03:00 not offered, 03:00-04:00 busy` | a User does not get a full slot and sees its hour busy, without names (R-SLOT-03, R-SLOT-06) |
| `book <date> 03:00 for smoke-<epoch>-c -> 409 slot_taken` | no place left (R-BOOK-07) |
| `book … for smoke-<epoch>-c with overbook: true -> 201 (3 of 2)` | the Administrator goes over the capacity, saying so (R-BOOK-13) |
| `book … for smoke-<epoch> again with overbook: true -> 409 user_busy` | one place per person, which `overbook` does not lift (R-BOOK-12) |
| `the 3 appointments cancelled by the Administrator -> 200 each` | |
| `DELETE /calendar/windows/<id> -> 204`, `DELETE /calendar/types/<id> -> 204` | its window and type are removed |
| `DELETE /users/smoke-<epoch>-b and /users/smoke-<epoch>-c -> 204` | the two extra users are removed through the API |

The R-… rules are those of `docs/SHARED_CALENDAR_SPEC.md`. No answer body is printed (status and
error code only); the passwords of the two users stay in the script's variables, and only the
third one's is used, to sign in.

**What stays in the `calendar` table, by design**, besides what section 2.1 lists: per run,
three cancelled appointments at 03:00 on the calendar journey's date, of the users
`smoke-<epoch>`, `smoke-<epoch>-b` and `smoke-<epoch>-c`, with type name `smoke-cap-<epoch>`
(`cancelReason` `cancelled`, `cancelledBy` the Administrator), their pointers, their
`appointment.booked` and `appointment.cancelled` events, and the `DELETEDUSER` markers of the two
extra users. The refused bookings write nothing. No type, no window and no user stay.

**When the capacity journey fails:**

- `POST /users … -> 409`: a user of that name exists; a rerun takes a new epoch.
- `POST /calendar/types … -> 409 limit_reached`: 20 types exist; only the users were created,
  and they are removed.
- a `409` on the window (`availability_overlap`): someone wrote at 03:00 on that date after the
  calendar journey. Rerun.
- `overbook: true as … -> 201`, `… -> 409 slot_taken` expected but `201`, or the views not as
  said: the capacity is not deployed as built. The appointment made is cancelled by the
  clean-up; stop and investigate before releasing the page.
- any other failure: the `cleanup:` lines say what was removed, appointments first, then the
  window, the type and the two users (through `DELETE /users/<name>`, or straight in Cognito when
  the API fails). A `CLEANUP FAILED:` line names what is left: cancel the appointment as the
  Administrator, delete the window, then the type, then the user, in this order, as in
  section 2.1.

### 2.4 The smoke test's Users, invitation and mail

The smoke test reads the stack's `MailStage` and says it on its first line
(`docs/ARCHITECTURE.md` section 9.3). Its throw-away Users, `smoke-<epoch>` and the capacity
journey's two, never write to a real mailbox: their address is SES's mailbox simulator,
`success@simulator.amazonses.com`, and the script gives each a permanent password of its own
making, so that it signs in without the invitation. Only the invitation's check uses your own
address.

| Stage | How each throw-away User is made (lines starting `journey 6:` or `capacity:`) |
|---|---|
| `on` | `POST /users <name> -> 201, invited` (Cognito mails the simulator), then `a permanent password set for <name> through scripts/cognito.mjs` |
| `off`, `domain` | `POST /users <name> -> 503 mail_unavailable, nothing made`, then `<name> made straight in Cognito, with its four facts, in group user`, then the password's line |

At `on`, after the change of password, the lines starting `invitation:` and `mail:`:

| Line | Checks |
|---|---|
| `POST /users smoke-<epoch>-i -> 201, invited: the invitation is on its way` | a User with your address; **the invitation reaches your mailbox**, from `noreply@<domain>`: look for it, and in the spam folder |
| `GET /users lists smoke-<epoch>-i as invited` | its state in the Users screen |
| `POST /users/smoke-<epoch>-i/invitation -> 202, sent again` | a second invitation, with a new temporary password, reaches you |
| `… /users/smoke-<epoch>/invitation -> 409 not_invited` | a User who has chosen a password is not invited again |
| `… /users/admin/invitation -> 403 cannot_edit_admin` | an administrator is never invited |
| `DELETE /users/smoke-<epoch>-i -> 204, the account is gone` | the two invitations you received open nothing any more |
| `POST /mail/calendar <today> to <today> as admin -> 202, queued` | a mail on demand to the Administrator's own address |
| `the mailer's log line says sent, after <n> s` | the mailer sent it through SES, read in the log group `/aws/lambda/<stack>-mailer` within a minute; the mail itself, with its Excel file, reaches the Administrator's mailbox |

At `off` and `domain`, instead, `invitation: … -> 503 mail_unavailable` and `mail: … -> 503
mail_unavailable`, and no address is asked for.

Against the local stack the invitation's address is a made-up one and cognito-local prints the
invitation in its log; the resend's success prints `SKIP` (cognito-local cannot resend), and the
mail's last line is `the mail reached the fake mail …`, since the mailer's own line is in
`local:lambda`'s terminal. The local run needs `local:lambda` running. It ends `PASSED (3
check(s) skipped on the local stack)`.

If the run stops half-way, the clean-up deletes `smoke-<epoch>-i` with the other Users; a
`CLEANUP FAILED:` line names it, to delete in the page's Users screen.

---

## 3. Deploying from scratch (new stack, new account or after deleting it)

Plan step 11 has the full list; in short:

0. Region check, read-only: `aws cloudformation describe-stacks --stack-name shared-calendar-api
   --region eu-north-1` must answer "does not exist", not `AccessDenied … explicit deny in a
   service control policy`. In another account, check its organization's allowed region first and
   put it in `backend/samconfig.toml` (both `region` lines), in `frontend/samconfig.toml` (the
   page's deploy stops when the two files name different regions) and in the profile.
1. Steps 1 to 3 of section 2 (commit, local stack, verify).
2. `npm run deploy -w backend -- --parameter-overrides AdminUsername="admin" FunctionArchitecture="arm64" AssistantModel="claude-sonnet-5-5" AssistantDailyMessageLimit="30" MailStage="off" MailDomain="…" MailFromLocalPart="noreply" MailFromName="Shared calendar" PageAddress="…" DefaultLanguage="it" AlertEmail=<alert address>`,
   the values of the line in `backend/samconfig.toml` but `MailStage`, which a new stack starts
   at `off` (section 3.3).
   `backend/samconfig.toml` holds everything else (stack, region, capabilities); the address is
   the one value it leaves out, because the repository is public. A `--parameter-overrides` on the
   command line replaces the whole `parameter_overrides` line of `backend/samconfig.toml`, so the
   command repeats every parameter of that line with its value (plan step 57 used this command
   when the line held only the first two). CloudFormation stores the address with the stack, so later deploys omit it.
   Without the flag the deploy stops before creating anything: `AlertEmail` must have a value.
   Avoid `--guided`; if you use it, answer N to "Save arguments to configuration file", or SAM
   writes the address into `backend/samconfig.toml`.
3. `npm run bootstrap-admin -w backend -- shared-calendar-api`: sets the admin password. Until then the admin
   status is `FORCE_CHANGE_PASSWORD` and the smoke test cannot sign in.
4. The assistant's key, `npm run assistant-key -w backend -- shared-calendar-api`, after
   Anthropic's side is ready (section 3.2). Then `npm run smoke -w backend -- shared-calendar-api`:
   at `MailStage` `off`, 62 PASS (sections 2.1 to 2.4 and 3.2); without the key, the assistant's
   one FAIL. E-mail's stages follow in section 3.3. On a new
   stack the calendar is empty, so the first date searched is free.
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
8. The page, which needs this stack: section 3.1.

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

### 3.1 The page's stack `shared-calendar-web`: from scratch, and how it is deleted

**From scratch:** section 2, steps 1 to 3 and 6, once the stack `shared-calendar-api` exists.
The first run shows a change set of six *Add* (`BucketAccess`, `Distribution`, `PageBucket`,
`PageBucketPolicy`, `PageHeaders`, `StripApiPrefixFunction`) and nothing else; the distribution
takes three to four minutes, during which the screen stands still. The page's address is new
with every new distribution: tell the people who use it.

**Deleting it, should it ever be needed. Written as a procedure; never run.** CloudFormation
cannot delete a bucket that holds objects, so the stack's deletion fails at `PageBucket` while
the four files are in it, and leaves the stack in `DELETE_FAILED` with the distribution already
gone. So the bucket is emptied first, and the page is down from that moment:

```bash
bucket=$(aws cloudformation describe-stacks --stack-name shared-calendar-web --region eu-north-1 \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
aws s3 ls "s3://$bucket/"                      # look first: the four files and nothing else
aws s3 rm "s3://$bucket/" --recursive          # empties it; the bucket has no versioning
aws cloudformation delete-stack --stack-name shared-calendar-web --region eu-north-1
aws cloudformation wait stack-delete-complete --stack-name shared-calendar-web --region eu-north-1
```

Disabling and deleting a distribution takes several minutes. Nothing of the stack
`shared-calendar-api` is touched: the API keeps answering at its own address, and no data is
in the page's stack. If the deletion was started with the files still there: empty the bucket
as above and run `delete-stack` again.

### 3.2 The assistant: Anthropic's side, its first deployment, its key, its alarm

The assistant (`docs/CONVERSATIONAL_ARCHITECTURE.md`) asks Claude, at Anthropic, outside AWS.
The stack holds no key: the operator stores it in Parameter Store with a script, as the
SecureString `/<stack>/anthropic-api-key`. Until it is there the assistant answers
`503 assistant_unavailable` and everything else works. Anthropic's bill is the application's
first real cost; the AWS budget does not see it.

This section was first followed in `docs/CONVERSATIONAL_PLAN.md` step c15, on 2026-11-23
(section 5.6). The rotation is the one part not yet run against a stack.

**On Anthropic's side, before anything is deployed** (the Anthropic Console, signed in as the
account's owner):

1. **P1, first: the data terms.** Read, for this account, how long Anthropic keeps requests and
   whether they may be used to train models (the account's settings and the commercial
   terms). Write what was found, with the date, in `docs/CONVERSATIONAL_ARCHITECTURE.md`
   section 10.2, and close P1 in its section 18.2. **If the terms are not acceptable, stop
   here**: nothing is deployed. Until P1 is closed, nobody but the operator uses the assistant.
2. **A workspace of its own** for this application, so that its key, its use and its limit
   are apart from any other use of the account.
3. **Its monthly spend limit: 10 USD.** When it is reached, Anthropic refuses every request of
   the workspace until the limit is raised or the month ends: people read "The assistant has
   reached its spending limit…", the 5xx alarm e-mails the operator, the rest of the
   application works (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 14). The expected use is 1.5
   to 4 USD a month.
4. **Its key**, created in that workspace. The Console shows it once: keep it in a password
   manager until step 4 below, never in a file of the repository, a message or the shell's
   history.

**On ours, in order:**

1. Section 2, steps 1 to 3: commit, the local stack **with the fake Claude**, `verify`. Before
   a deployment that changes the instructions, a tool or the model, run the evaluation with the
   real model first (`docs/COMMANDS.md` section 3.4), then go back to the fake.
2. `npm run deploy -w backend`, **with no argument** (section 2, step 4). The assistant's two
   parameters come from `backend/samconfig.toml`: `AssistantModel` `claude-sonnet-5-5` and
   `AssistantDailyMessageLimit` `30`. Never add `--parameter-overrides` here: it replaces
   samconfig's whole list, and the two would not be set from it (section 3, step 2).
   Read the change set before the `y`. The assistant's first deployment showed **27 Add**: the
   table `AssistantTable`, the policies `AssistantReadPolicy` and `AssistantWritePolicy`, and six
   functions (`GetConversation`, `EndConversation`, `SendAssistantMessage`, `ContinueAssistant`,
   `ConfirmProposal`, `DeclineProposal`), each with its role, its log group and its permission;
   **25 Modify**, replacement `False`: `HttpApi` (the six routes) and the 24 existing functions
   but the authorizer, code only, as the shared package they bundle had grown. **No Remove, no
   Replace**: any on `UserPool`, `MessagesTable`, `CalendarTable` or `AdminUser` means N. The
   change set can also be read from the session while the prompt waits:
   `aws cloudformation describe-change-set` (read-only).
3. `npm run smoke -w backend -- shared-calendar-api`, **before the key**. Expected: 25 PASS and
   one FAIL, `assistant: POST /assistant/messages -> 503 assistant_unavailable: no key yet, or
   Anthropic unavailable`. It proves that a missing key harms nothing else. The function's log
   line says `outcome` `language_unavailable`, `reason` `key_missing`. That 503 fires the 5xx
   alarm: its e-mail is expected, and the alarm is back to OK within ten minutes.
4. `npm run assistant-key -w backend -- shared-calendar-api`. It
   reads the stack (read-only), says `Stack shared-calendar-api (eu-north-1), model
   claude-sonnet-5-5. The key goes to the SecureString /shared-calendar-api/anthropic-api-key.`,
   asks `Anthropic API key:` without echo, and ends with `Stored.` and one line: the name,
   `SecureString`, version `1`, the date. It never prints the key. Before asking for the key it
   refuses `local`, `hello-world-api`, a stack it cannot read (no login) and a stack without
   the assistant (deploy first); a key that does not start with `sk-ant-` or holds a space is
   refused before anything is stored. `docs/COMMANDS.md` section 6 has its messages.
5. The smoke test again: every line PASS (section 2, step 5). Its exchange costs about a US cent at Anthropic (up to 4
   when the assistant has been silent for a few minutes). When the FAIL of step 3 is still
   there, read the function's log line (below): `key_missing` is P2.
6. **The page released again**, section 2, step 6, from the same commit and inside the same 30
   minutes (otherwise `verify` again): until then the deployed page has no panel. Then at the
   page's address: sign in, open the panel at the bottom, send one message, and the short walk
   of `docs/FRONTEND_WALK.md` section 7.
7. The record in section 5: the commit, the change set, the smoke tests' lines, P1 and P2.

**P2: when the key cannot be read.** `docs/CONVERSATIONAL_ARCHITECTURE.md` section 18.2 leaves
open whether the functions' roles need `kms:Decrypt` besides `ssm:GetParameter`; the deployment
is made without it. The log line does not tell a missing parameter from one the function may
not read: both give `reason` `key_missing` (`backend/src/lib/anthropic.ts`). So once step 4
has printed the parameter, `key_missing` means the read was refused. To see the refusal:
CloudTrail, Event history, the events `GetParameter` and `Decrypt` of the last minutes, with
their error code. The fix, decided in step c15 and not before: one statement in the roles of
the three functions that ask Claude (`SendAssistantMessage`, `ContinueAssistant`,
`ConfirmProposal`), `kms:Decrypt` on that one key, usable only through Parameter Store; then
the gate, and a second deployment with its own go; then the smoke test.

**When the 5xx alarm arrives for the assistant.** The alarm counts every 5xx of the API, and the
assistant answers `503` on purpose when it cannot ask Claude
(`docs/CONVERSATIONAL_ARCHITECTURE.md` section 15). The log line's `outcome` and `reason` say
why. CloudWatch, Logs Insights, the log groups `/aws/lambda/shared-calendar-api-sendAssistantMessage`,
`…-continueAssistant` and `…-confirmProposal`, the hour of the e-mail:

```
fields @timestamp, route, username, role, conversationId, outcome, reason, status, model, steps, durationMs
| filter status >= 500
| sort @timestamp desc
```

The query names fields only, never `@message`, so nothing but those fields is shown (the lines
hold no text of a conversation anyway: `docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.1). A
first message of a conversation fails on the language question, so its outcome starts with
`language_`.

| `outcome` | `reason` | What happened | What to do |
|---|---|---|---|
| `unavailable` or `language_unavailable` | `timeout`, `connection`, `overloaded`, `rate_limit`, `other` | Anthropic unreachable, slow or overloaded | Wait: nothing is lost, and the panel goes on when asked again. Anthropic's status page says whether it is theirs. Many lines over hours: write it in section 5 |
| the same | `key_missing` | No key in Parameter Store, or the function may not read it | Step 4 above; if the parameter exists, P2 above |
| the same | `key_refused` | Anthropic refused the key: revoked, deleted, or of another workspace | A new key, as in the rotation below |
| the same | `request_refused` | Anthropic refused the request itself, a fault of ours | Nothing to wait for: note the time and the route, and look at the last deployment |
| `budget_reached` or `language_budget_reached` | | **The spend limit is reached** | Raise the workspace's limit in the Console, or wait for the next month. Each function then waits up to ten minutes before it asks Anthropic again |

Another 5xx of an assistant route (`status` 500) is an error of the application, as for any
other route.

**Rotating the key**, by routine or because it may have leaked:

1. In the Console, a new key in the same workspace. Keep the old one for now.
2. `npm run assistant-key -w backend -- shared-calendar-api`: it says `The parameter exists:
   replacing version N (a rotation).` and asks `Replace it? [y/N]`; `y`, then the new key. It
   ends with version N + 1. **(Not yet run against a stack.)**
3. Wait ten minutes: each function keeps the key it read for ten minutes, so the old key may
   still serve until then.
4. Delete the old key in the Console.
5. The smoke test: every line PASS (section 2, step 5).

A key that leaked is deleted in the Console at once, without waiting: the assistant then
answers `503` (`key_refused`) until step 2 is done and ten minutes have passed.

### 3.3 E-mail: the stages (`domain` run in `docs/EMAIL_PLAN.md` step m9, `on` part A in its step m10 part A; `on` part B is a draft)

E-mail is switched on in two deploys, because SES must first prove the domain, which waits for
DNS (`docs/ARCHITECTURE.md` section 9.2, `docs/EMAIL_ARCHITECTURE.md` section 13.2). The stage
`on` does not wait for SES's sandbox to be lifted, which waits for AWS: in the sandbox it mails
only addresses verified in SES, so it is deployed and tried first with those (part A), and the
people are invited once AWS grants production access (part B), with no deploy. The split lets
the work go on while AWS answers, which can take days. Each deploy is section 2's steps 1 to 6, with the one
line of `backend/samconfig.toml` changed: `MailStage=off` → `domain` → `on`. `MailDomain`,
`MailFromLocalPart`, `MailFromName` and `PageAddress` are already in that line; `MailReplyTo` is
left out, so replies and bounce reports go to `AlertEmail`. No e-mail address goes into the file.

**Before the deploy at `domain`** (read-only checks):

1. The region: the user pool may send through SES in its own region. AWS's Cognito guide on
   e-mail settings lists Europe (Stockholm) as "In-Region only", with SES in Europe (Stockholm).
2. The deploying profile may create Cognito's service-linked role (`iam:CreateServiceLinkedRole`),
   which `EmailConfiguration` needs at `on`: `aws iam simulate-principal-policy` on the SSO role of
   `shared-calendar-admin`, for the role `AWSServiceRoleForAmazonCognitoIdpEmailService` with the
   context key `iam:AWSServiceName=email.cognito-idp.amazonaws.com`. It must answer `allowed`.
3. A change set with `MailStage=on`, never executed: after `npm run build -w backend`,
   `sam deploy --no-execute-changeset --parameter-overrides '…'` from `backend/`, the override
   repeating every name of the `samconfig.toml` line (the trap that line's comment describes) with
   `MailStage="on"`; read with `aws cloudformation describe-change-set`, then deleted with
   `aws cloudformation delete-change-set`. The user pool must show "Modify" with every detail
   `RequiresRecreation` `Never`; nothing a replacement, nothing removed.
4. The Users that exist were created with a permanent password and no invitation: they are
   deleted in the page, the last thing before the deploy, after noting who needs an account again
   (`docs/EMAIL_PLAN.md` step m9).

**The deploy at `domain`** and its smoke test: 62 PASS, `off`'s count. The new routes' `503
mail_unavailable` are 5xx answers, so **the API's 5xx alarm goes off at this stage for every
expected 503**: the smoke test's, and each time the page opens "Settings" (`GET /mail/settings`)
or someone presses "E-mail…" (`POST /mail/calendar`). It turns OK again by itself within minutes.
Before taking one for a fault, look at the access log: `status` 503 on those routes, nothing else
of 5xx (section 5.11 has the search).

**At `domain`**, the operator's steps:

- **At the domain's DNS provider** (the same place as the page's records, `docs/CUSTOM_DOMAIN.md`):
  the stack's outputs `MailDkimRecord1` to `3`, each a CNAME of its name and its value; and the
  DMARC record, TXT `_dmarc`, `v=DMARC1; p=none;`. GoDaddy, like most providers, adds the domain
  to the name by itself: type only the part before `.<domain>` (`<selector>._domainkey`, `_dmarc`).
  GoDaddy's two name servers can answer differently for some minutes. SES verified the domain by
  itself within the hour (`aws sesv2 get-email-identity --email-identity <domain>`:
  `VerificationStatus` `SUCCESS`, DKIM `SUCCESS`).
- **In the alarm mailbox:** "Confirm subscription" in AWS's mail for the bounces' topic. Checked
  with `aws sns list-subscriptions-by-topic` on the topic (the stack's resource `MailBounceTopic`):
  a confirmed subscription shows an ARN, an unconfirmed one `PendingConfirmation`.
- **In the SES console, production access.** Sign in through the access portal as the Identity
  Center user, account "Identity Delegated Admin", role AdministratorAccess, region **Europe
  (Stockholm)**: SES, Account dashboard, "Request production access". If the console offers "Get
  started", do not follow it: that wizard makes its own identities, and the stack has made the one
  needed. The form asks the mail type (Transactional) and the website's address, and has no field
  for the use case: AWS answers by mail at once that it needs more information (the review shows
  `DENIED` meanwhile, `aws sesv2 get-account`), and the answer goes in a reply to that support
  case in the Support Center, covering what the mail asks: the address, the mail's kinds, the
  volume, where the recipients come from, how bounces and complaints are handled (the bounces'
  topic and the account's suppression list, which stays on), and a sample (the invitation's text,
  `backend/template.yaml`, `InviteMessageTemplate`). The use case of
  `docs/EMAIL_ARCHITECTURE.md` section 8.5 is the summary. Until access is granted SES writes only
  to verified addresses and to the mailbox simulator.
- **In the page, as the Administrator:** "My details" (the four facts). The daily mail's hour
  cannot be set yet: `GET` and `PUT /mail/settings` answer `503 mail_unavailable` at any stage but
  `on`, and "Settings" says "E-mail is not available yet" in its place; it is set at `on`.
- **The operator's test User**, the one way to try the User's side while `POST /users` answers
  `503`: `npm run test-user -w backend -- cloud <username>` (your own address and a temporary
  password, typed), then sign in on the page and choose a password; the week, a booking, a
  cancellation, the assistant, and "E-mail…", which says "E-mail is not available yet". A second
  one tries the 3 minutes of "Choose your password" (`docs/FRONTEND_WALK.md` check 216). Delete
  them in the Users screen when done.

**At `on`, part A: in the sandbox, every recipient verified** (`docs/EMAIL_PLAN.md` step m10,
part A). Until production access SES delivers only to addresses verified in SES and to the
mailbox simulator, Cognito's invitations included (`docs/EMAIL_ARCHITECTURE.md` section 22.2).
**Create no User, and ask no mail, for an address that is not verified**: AWS's documentation
does not say what `AdminCreateUser` does then, and a mail the mailer sends there fails.

1. Read-only, before: the domain still verified (`aws sesv2 get-email-identity --email-identity
   <domain>` with a `--query` of `VerificationStatus` and `DkimAttributes.Status`: `SUCCESS`).
2. **Verify each address that will receive a mail**: your own (the smoke test's invitation, a
   throw-away User), the Administrator's in "My details" (the smoke test's mail on demand, the
   daily mail), each test User's that will ask for a mail. In the SES console, region Europe
   (Stockholm): Identities, "Create identity", "Email address", the address, "Create identity";
   then the link in the mail from `no-reply-aws@amazon.com` or
   `no-reply-aws@verification.amazonses.com` (valid 24 hours; "Resend" on the identity's page).
   Not "Get started". Checked without printing an address:
   `aws sesv2 list-email-identities --query "EmailIdentities[?IdentityType=='EMAIL_ADDRESS'].VerificationStatus"`,
   each `SUCCESS`; compare the console's list with the addresses by eye.
3. A test User whose address is not verified: delete it in the Users screen, or never use it for
   a mail. Create no other User until part B.
4. `MailStage=on` in `backend/samconfig.toml`, committed; section 2's steps. The change set before
   "y", from `domain`: 32 changes, no Remove, no Replacement. Add for the mailer, its role, log
   group and error alarm, the hourly schedule and its role; the pool Modify on
   `AdminCreateUserConfig`, `EmailConfiguration` and `Policies`, each `RequiresRecreation`
   `Never`; the routes' `MAIL_STAGE`, `MAILER_FUNCTION` and the invoke right of `sendCalendarMail`
   and `confirmProposal`. The other roles, functions and `HttpApi` are listed only because they
   name the pool's ARN, or a changed function's: they keep it. The page only if `frontend/` or
   `shared/` changed since its last deploy.
   **The mailer's role in the sandbox.** SES checks the sender's role against the recipient too
   when the recipient is a verified address: with `ses:SendEmail` on the domain's identity alone,
   every mail of the mailer fails with `AccessDeniedException` (the mailer's log, field `reason`;
   its error alarm), while the invitations, sent with Cognito's own role, arrive, and a mail to
   the simulator, no identity of the account, is `sent`. So while the account is in the sandbox
   the template gives the mailer `identity/*`, the From held to `noreply@<domain>` by the
   condition `ses:FromAddress`: the one exception to the root `CLAUDE.md`'s wildcard rule, which
   part B removes (`docs/EMAIL_PLAN.md` step m10).
5. The smoke test, a verified address typed when asked (an address with a `+label` is its own
   identity, verified as such): 65 PASS (section 2.4), its mail line `sent` within seconds; its
   invitation and its resend in your mailbox, from `noreply@<domain>`, Reply-To the alarm
   address, not in spam; its mail on demand in the Administrator's, its Excel file opening. Then
   every log group since the deploy searched for `level` `error`, and the access log for `status`
   500 or more, by field.
6. In the page: a throw-away User with a verified address, its invitation, "Resend invitation",
   the first sign-in with the second password, "Choose your password", `active` in the list, then
   the User deleted; "E-mail…" in the week as the Administrator and as a test User whose address
   is verified, each Excel file opened; in "Settings" the daily mail's hour, set to the next whole
   hour to see the daily mail and its two files the same day, then to the hour wanted.
7. The API's 5xx alarm should no longer go off for the e-mail routes, which answer `503` only
   below `on`: one now is a fault, looked at in the access log. The mailer's error alarm counts a
   mail SES refused; it turns OK by itself an hour after the last one.
8. The tag `v3.0.0`, on the operator's word, at the commit of the record (`README.md` "Versions").

**At `on`, part B: out of the sandbox** (`docs/EMAIL_PLAN.md` step m10, part B). It starts when
`aws sesv2 get-account --query '{production:ProductionAccessEnabled,quota:SendQuota}'` answers
`production` true; the query keeps the contact addresses out of the answer. Write the new quota
in section 5.11.

1. The mailer's role back to the domain's identity alone, in `backend/template.yaml`, and the
   root `CLAUDE.md`'s wildcard rule without its exception; committed, then section 2's steps:
   the change set is the mailer's role alone, Modify. The smoke test again: 65 PASS, its mail on
   demand `sent`. Checked: `grep -rn 'identity/\*' backend/template.yaml CLAUDE.md
   docs/ARCHITECTURE.md` finds nothing. AWS does not say whether SES, out of the sandbox, still checks the role against
   a recipient that is a verified identity: if the mail line fails with `AccessDeniedException`,
   delete the address identity of that recipient (step 4) and ask the mail again.
2. Create again, in the page, the Users who need an account (step m9's list): each receives an
   invitation; book their future appointments again by hand if wanted. A bounce report, should
   one come, reaches the Reply-To mailbox: correct the User's address in the Users screen and
   "Resend invitation".
3. Delete the test Users in the Users screen.
4. The address identities verified in part A: keep them, or delete those no longer wanted (SES
   console, Identities, the address, "Delete"). A recipient needs no identity out of the sandbox,
   so nothing depends on them; kept, they spare a new verification should mail be tried in a
   sandbox again. Never delete the domain's identity, which the stack owns.
5. Update the privacy notice, outside the system (`docs/EMAIL_ARCHITECTURE.md` section 12.3).

### 3.4 The languages

The page, the mails, the Excel files, the invitation and the assistant speak English and Italian
(`docs/MULTILANGUAGE_ARCHITECTURE.md`). What the operator sets, and what each person chooses:

- **The installation's language**: the parameter `DefaultLanguage` of the API's stack, `en` or
  `it`, in the line of `backend/samconfig.toml` (`it`). It is the language of a mail, a file and
  an invitation for a person whose account holds none, which an invited person never does; and
  the page's language for a browser that remembers none and speaks none of the calendar's. The
  page takes it at its release: `npm run deploy -w frontend` reads the stack's output
  `DefaultLanguage` and builds with it. Changing it is one deploy of the API, then one release of
  the page.
- **A person's language**: their own choice, on the sign-in screen (remembered by that browser)
  and in "My details" (kept in their account, the attribute `locale`). At a first sign-in the
  page saves its language into an account that holds none. The Administrator cannot set another
  person's language and the API has no field for it. After a deploy that brings the languages,
  the Administrator signs in once so that the daily mail follows their language.
- **The invitation** is worded by the invitation function (`InviteMessageFunction`), which the
  stack has only at `MailStage` `on`; the template's English invitation, `InviteMessageTemplate`,
  stays as what Cognito sends when the function's answer is unusable. Its log group is
  `/aws/lambda/<stack>-invite-message`: one line per invitation and per resend, its kind
  (`source`, `CustomMessage_AdminCreateUser` for both), the language's code (`language`) and
  `outcome` `worded`; a call of another kind says `untouched` and has no language.
- **The assistant** answers in the language of a conversation's first message, else the page's,
  else English. A change of its instructions ends the conversations in progress at the deploy,
  and asks for the paid evaluation before it (section 3.2).
- **What a first deploy with the languages must show** (`docs/MULTILANGUAGE_PLAN.md` phase B,
  item 8): read first, without changing anything, the app client's attribute lists
  (`aws cognito-idp describe-user-pool-client`) and the pool's triggers
  (`aws cognito-idp describe-user-pool`); in the change set, the user pool and its app client
  "Modify", never "Replace", and one function, one role, one log group and one permission added;
  after it, the smoke test, a test User whose own token can change its `locale` and can no longer
  change its e-mail, one invitation received in Italian and its password used. Section 5.12 is
  the record of that deploy. What it taught:
  - Read the change set with `aws cloudformation describe-change-set` (its rows'
    `Action`, `Replacement` and each detail's `RequiresRecreation`), not only on the terminal:
    recorded with `script`, the deploy's table lost rows, among them the pool and the app client.
  - The test User for the gap is made in "Users" (`npm run test-user cloud` sends no
    invitation); its first password is chosen on the page before its token is tried. The outcome
    of each `UpdateUserAttributes` is also in CloudTrail (`aws cloudtrail lookup-events`, event
    name `UpdateUserAttributes`, its `errorCode` only).
  - The Administrator's mail in their language is looked for before the smoke tests of the day
    or on the next: each smoke test spends one of the Administrator's five mails on demand, and
    a sixth is `429 mail_limit_reached`. A language equal to `DefaultLanguage` proves nothing in
    a mail; the stored `locale` is read with `aws cognito-idp admin-get-user` and a `--query` of
    that attribute alone.

---

## 4. One-time AWS setup (redo only for a new account or a new machine)

**Accounts.** The console's multi-account setup created an AWS Organization:

| Account | Use |
|---|---|
| Management account (root user = the sign-up e-mail) | billing and emergencies only; IAM Identity Center lives here (home region `us-east-1`) |
| "Identity Delegated Admin" | where the two stacks are deployed and where `shared-calendar-admin` signs in |
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

- Plan step 58 (2026-11-21): **the old stack `hello-world-api` retired**, on the Product Owner's
  instruction, five days after step 57 (the plan named a week as the least; the Product Owner
  decided). No export: its tables held smoke history only. The commands were run in the session
  with Claude Code, under the profile `shared-calendar-admin`, each resource read back first.
  - **Before** (read-only): the stack `UPDATE_COMPLETE`, untouched since 2026-11-16 09:56 UTC,
    118 resources, no termination protection; `hello-messages` 4 rows and `calendar` 6 items,
    deletion protection on, both confirmed as the old stack's through its resources
    (`MessagesTable`, `CalendarTable`); the user pool `eu-north-1_1DOUiHwSk`, protection
    `ACTIVE`, one user, `admin`.
  - **Protection lifted**: `aws dynamodb update-table … --no-deletion-protection-enabled` on
    `hello-messages` and on `calendar`; `aws cognito-idp update-user-pool … --deletion-protection
    INACTIVE` on the old pool, with its password policy, admin-only creation, recovery setting,
    MFA off, tier and verification template repeated in the same call (the call resets what it
    is not given). The new stack's two tables and its pool were read after each: protection on.
  - **Deleted**: `aws cloudformation delete-stack --stack-name hello-world-api` at 15:19:36 UTC;
    gone by 15:21:08 UTC, with no `DELETE_FAILED`. `describe-stacks` answers "does not exist".
  - **After** (read-only): the region's tables are `shared-calendar-api-calendar` and
    `shared-calendar-api-hello-messages` only; one user pool, the new one; no function and no
    log group with the old name; the alarms are the new stack's two, `OK`; the old API's
    address no longer answers. `shared-calendar-api` and `shared-calendar-web`
    `CREATE_COMPLETE` with their `LastUpdatedTime` unchanged; without a token the API answers
    401 at its own address and through the page's, and the page answers 200.
  - **The budget** `hello-world-api-monthly` deleted (`aws budgets delete-budget`), on a go of
    its own; `shared-calendar-api-monthly` is the one left, and watches the whole account.
  - **Smoke test** of `shared-calendar-api`, run by the operator after the deletion: reported
    as passed; its output was not seen in the session.
  - **The old build artifacts** deleted, on a go of their own: in SAM's upload bucket (stack
    `aws-sam-cli-managed-default`; the bucket keeps versions) the 36 objects under the prefix
    `hello-world-api/`, 29 MB, every version of each, by key and version id; no version and no
    delete marker is left under the prefix. The 26 objects under `shared-calendar-api/` were
    not touched.
  - **The deploy scripts** (`backend/scripts/deploy.sh`, `frontend/scripts/deploy.sh`) still
    refuse the name `hello-world-api`; their comments and the words of the refusal say that
    the stack is deleted, no longer that it is kept. Both refusals tried by hand.
  - **Not done:** the sections `[profile hello-admin]` and `[sso-session hello]` are still in
    the operator's `~/.aws/config`.
  - **Cost:** the provisioned tables are the new stack's two again, 11 read and 11 write
    units of the free 25/25.

### 5.5 The page's first deployment (`docs/FRONTEND_DEPLOY_PLAN.md` step 72, 2026-11-21)

The stack `shared-calendar-web`, created beside `shared-calendar-api`, which was not deployed:
`git diff 4e22058 HEAD -- backend/src backend/template.yaml shared/src` was empty (`4e22058` is
the commit of section 5.4). Commit deployed: `646b706` (the step's brief on top of `f767e2e`),
**from the branch `deploy-frontend`**, not yet merged into `main`. Who did what: the operator
ran the two deployments and the checks in a browser; the read-only `aws` commands, the checks
with curl and the reading of the recorded output were done in the session with Claude Code,
which ran nothing that writes to AWS and saw no password and no token of the real pool.

- **Before:** root `DYNAMODB_PORT=8000 npm run verify` PASSED on the clean tree at 13:25 UTC;
  the front end's integration tests, which it does not run, 53 green;
  `npm run deploy -w frontend -- --dry-run` passed the gate, read the back end's stack and
  built. Read-only: no stack `shared-calendar-web`; no distribution, function, origin access
  control or headers policy in the account; the three managed policies under the template's
  ids. The change set to expect was written down before the command was run.
- **First deployment**, `npm run deploy -w frontend` at 13:33 UTC, no argument. SAM's values:
  stack `shared-calendar-web`, `eu-north-1`, `Deployment s3 bucket : None`, `Capabilities :
  null`, `ApiDomain` the host of `ApiUrl`. **Change set: 6 Add, nothing else**
  (`BucketAccess`, `Distribution`, `PageBucketPolicy`, `PageBucket`, `PageHeaders`,
  `StripApiPrefixFunction`), as written down, and read before the `y` this time. Executed at
  13:36:30 UTC, `CREATE_COMPLETE` at 13:39:58 UTC (the distribution about three and a half
  minutes). No bucket of SAM's own, no role.
- **Outputs:** `PageUrl` `https://dfhghsvimmgfm.cloudfront.net`, `BucketName`
  `shared-calendar-web-pagebucket-pmpsh2fgyi1j`, `DistributionId` `E2V5GRRPLMET12`.
- **Uploads:** `app.js.map` (2,200,102 bytes), `app.js` (578,155), `style.css` (16,676),
  `index.html` (30,677), in this order; one invalidation of `/*`, waited for.
- **The four checks:** PASS each, at 13:40 UTC.
- **Read-only, after** (session): the stack `CREATE_COMPLETE`, six resources, three outputs.
  The bucket: the four public-access settings on; its policy one statement (the CloudFront
  service, `s3:GetObject`, the four objects by name, this distribution's ARN); four objects;
  its own address answers 403. The distribution: enabled, `Deployed`, `PriceClass_100`,
  HTTP/2 and HTTP/3, IPv6, no alias, no logging, no firewall, no custom error response; its
  two rules as `docs/FRONTEND_ARCHITECTURE.md` section 13.3 has them. With curl and no
  credentials: plain HTTP answers 301 to HTTPS; the four files 200 with their content types
  and `Cache-Control: no-cache`; the four headers of section 13.4 word for word on the files,
  on a 401 and a 404 of the API and on the bucket's 403; a name that is no file
  (`/nothing-here`, and `/api` without a slash) 403 with S3's own XML; `/api/calendar` 401
  and `/api/no-such-route` 404 with the API's JSON; **the 404 asked twice within a second
  carried two different `apigw-requestid`**: no failure of the API is kept. Sizes downloaded:
  `index.html` 5,095 bytes, `style.css` 4,578, `app.js` 121,188, compressed with Brotli
  (with gzip only: 5,398, 4,897 and 130,771).
- **The API's access log** (`/aws/apigateway/shared-calendar-api-access`): the page's calls
  are in it within a minute, **with the caller's own address in `ip`, not CloudFront's**
  (`docs/FRONTEND_ARCHITECTURE.md` section 13.3 said the opposite and was corrected). A
  request for a path that is no route (the 404) leaves no line in it.
- **In a browser, by the operator, at a desktop width.** A shorter list than the one prepared
  (57 checks and 10 looks at a phone width, from `docs/FRONTEND_WALK.md`); what was done:
  - seen by the operator: a wrong password refused; `admin` signed in and the week loaded;
    `Bob` and `ab` refused by the page; the settings shown, 721 refused, nothing saved;
    **"Sign out": the request `RevokeToken` to Cognito answered 200**, not blocked;
  - seen in the access log, all through the page's address with a token: `GET /calendar`,
    `/users`, `/calendar/settings`, `/calendar/types` and `/calendar/patterns` 200;
    `POST /users` 201 and, for the same name again, 409; two types and two patterns created;
    an extra window created and "this day only" saved for a date; two bookings by the User.
    So **the `Authorization` header reaches the API through the distribution**, and `GET`,
    `POST`, `PUT` and `DELETE` pass.
- **Removed at the end**, by the operator through the page, each seen in the log as a 204: the
  User `walk-d1` (which cancelled its two appointments), the date's override and extra window,
  both patterns, both types. **What stays in `shared-calendar-api-calendar`, as history:** the
  two appointments, cancelled with the reason of a deleted user, their pointers and events,
  the deleted-user marker of `walk-d1`, and a higher version of the lock item. No type, no
  pattern, no window, no settings item (the settings were never saved), no User. Inferred from
  the log and the API's rules: the table itself was not read.
- **Second deployment**, the acceptance: `verify` PASSED again on the same clean commit at
  14:22 UTC; `npm run deploy -w frontend` at 14:32 UTC said `No changes to deploy. Stack
  shared-calendar-web is up to date` and asked nothing, uploaded the four files again,
  invalidated, and its four checks PASSED at 14:35 UTC. The stack's `LastUpdatedTime` is still
  that of its creation.
- **The other stacks:** `shared-calendar-api` `CREATE_COMPLETE`, last touched 2026-11-16
  12:26 UTC; `hello-world-api` `UPDATE_COMPLETE`, 2026-11-16 09:56 UTC: both as before.
- **Cost:** month-to-date 0 USD; `aws ce get-cost-forecast` still answers
  `DataUnavailableException` (section 5.3).

**Not done on 2026-11-21, and still to do** (each needs a sign-in at the page; the list is
`docs/FRONTEND_DEPLOY_PLAN.md` step 72, point 5):

- [ ] **A refresh with the revoked token is refused by the real Cognito.** The revocation was
      answered 200; that the token then makes no new session was not tried.
- [ ] **The session renewed**: a tab left signed in for 16 minutes, one `InitiateAuth` to
      Cognito about a minute before the fifteenth, and the page still working.
- [ ] "Sign out" with the network off; a reload (the login again); the console (`zod`'s one
      report and no other, under the distribution's policy).
- [ ] The rest of the walk: the password dialog, a note, a move, a cancel by the User, the
      refusals of the API in the availability's forms, the addresses typed by hand, and
      everything at a phone width. `PATCH` and the routes of a move and of a cancel were not
      sent through the distribution; `PUT /calendar/settings` neither, on purpose (a first
      save leaves a settings item that cannot be removed).


**Read again on 2026-11-21, for `docs/FRONTEND_DEPLOY_PLAN.md` step 73** (documents only;
read-only commands and curl with no credentials, in the session with Claude Code): the stack
`CREATE_COMPLETE` with its six resources and three outputs; the bucket's settings, policy and
four objects, the distribution's rules and the headers as recorded above; a second question
for `/`, `/style.css` and `/app.js` with the first answer's `ETag` answered 304 each. Nothing
was deployed, and none of the four items above was looked at: they stay open.

### 5.6 The assistant's first deployment (`docs/CONVERSATIONAL_PLAN.md` step c15, 2026-11-23)

The assistant added to `shared-calendar-api`, its key stored, and the page released again with
the panel, following section 3.2. Commit deployed: `949a048` (the step's brief and the close of
P1 on top of step c14), **pushed to `origin/main` before the deployment**. Who did what: the
operator ran the push, both deployments, both smoke tests, the key's script and everything at
the page; the session with Claude Code ran the gate and read-only `aws` commands and curl
without credentials, saw no password, no token and never the key.

- **Before, on Anthropic's side (operator):** P1 closed (`docs/CONVERSATIONAL_ARCHITECTURE.md`
  section 10.2); the workspace `shared-calendar`, its monthly spend limit of 10 USD, one key
  scoped to it.
- **The change set, worked out beforehand** (session): the template of the deployed commit
  `4e22058` against HEAD's differs by 23 blocks added (the two parameters, the table, the two
  policies, six functions with their roles and log groups) and nothing else but the
  template's description. Expected: 27 Add (with the six permissions SAM makes for the
  routes), Modify with replacement `False` on `HttpApi` and possibly on existing functions,
  code only, no Remove, no Replace. The key's script refused the stack before the deployment
  ("no assistant yet"), read-only.
- **The gate:** root `DYNAMODB_PORT=8002 npm run verify` PASSED on the clean tree at 13:13 UTC.
- **Deployment of the API**, `npm run deploy -w backend`, no argument. **Change set: 27 Add, 25
  Modify, all with replacement `False`, no Remove, no Replace**, read back by the session with
  `describe-change-set` before the operator's `y`: the Adds as expected; the Modifies `HttpApi`
  and the 24 existing functions but the authorizer, code only. Parameters: the six, with
  `AssistantModel` and `AssistantDailyMessageLimit` new. `UPDATE_COMPLETE` at 13:17 UTC.
- **After the deployment** (session, read-only): 145 resources; parameters `claude-sonnet-5-5`
  and 30 from `backend/samconfig.toml`, the other four unchanged, `AlertEmail` still set; the
  outputs unchanged. The six functions `Active`, `arm64`, `nodejs22.x`, 256 MB; 29 s for
  `sendAssistantMessage`, `continueAssistant` and `confirmProposal`, 10 s for the other three;
  in their environment `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ASSISTANT_EFFORT` and
  `ASSISTANT_BUDGET_MEMORY_SECONDS` empty, `ANTHROPIC_KEY_PARAMETER`
  `/shared-calendar-api/anthropic-api-key`. The three roles that read the key: one statement
  each, `ssm:GetParameter` on that parameter alone, no `kms:Decrypt`. The table
  `shared-calendar-api-assistant`: `ACTIVE`, 8/6, time to live on `expiresAt`, deletion
  protection off by design (`docs/ARCHITECTURE.md` section 7). `POST /assistant/messages`
  without a token: 401.
- **Smoke test before the key**, 13:35 UTC (user `smoke-1795440844`): **25 PASS and the one
  expected FAIL**, `assistant: POST /assistant/messages -> 503 assistant_unavailable: no key yet,
  or Anthropic unavailable`. Its log line: `outcome` `language_unavailable`, `reason`
  `key_missing`, 796 ms. The 5xx alarm went to ALARM at 13:36 UTC and back to OK at 13:43.
- **The key**, `npm run assistant-key -w backend -- shared-calendar-api` by the operator:
  `SecureString` `/shared-calendar-api/anthropic-api-key`, version 1, standard tier, key
  `alias/aws/ssm`, 13:40 UTC (its description read by the session, never its value).
- **Smoke test after the key**, 13:42 UTC: **26 PASS**. The exchange in two steps: the message
  with a read of the settings (`tool_requests`, 4.0 s, of which 2.2 s the language question on
  a cold function), then `continue` with the answer (`text`, 2.8 s); 5 702 tokens written to
  Anthropic's cache by the first and read from it by the second. **P2 closed: no `kms:Decrypt`
  statement is needed**, the key is read with `ssm:GetParameter` alone.
- **The page released again**, from `main`: the gate again at 13:44 UTC (the first one's 30
  minutes had passed), `npm run deploy -w frontend -- --dry-run`, then the release, its four
  checks PASS (operator). The hosting's stack was not changed by it: its `LastUpdatedTime`
  stays 2026-11-22 13:10 UTC, an update made after section 5.5 and not recorded there. Then,
  with curl: `/` 200 and its `index.html` holds the panel; `/api/assistant/conversation` and
  `/api/assistant/messages` without a token 401 with the API's own answer.
- **At the deployed page, by the operator**, in an order of their own: readings, a proposal
  declined, a booking proposed to a throw-away User and confirmed with the button, then
  cancelled from the page, exchanges in English and in Italian, "Sign out" while an answer was
  awaited; all reported as working. What the logs show (session, fields only): 27 lines of the
  assistant's routes in the two hours, among them 2 proposals, 1 decline and 1 confirmation by
  the User, whose booking route answered `201 created` inside `confirmProposal`; the
  appointment, for 2026-11-30 10:00 `Europe/Rome`, booked at 14:11:36 UTC and cancelled at
  14:11:44. The calendar handlers run as tools answered 200 each (`GET /calendar` 4, `GET
  /calendar/appointments` 3, the types and the settings 1 each). The slowest step 6.0 s (3.3 s
  of it the language question), against the functions' 29 s and the distribution's 30 s. The
  throw-away User is deleted.
- **P7 seen:** the API's access log holds 30 requests of the assistant's routes in the two
  hours, the confirmation and the decline among them, which only the page sends: the
  distribution passes `/api/assistant/…` on.
- **No text in the logs:** Logs Insights over the six assistant log groups, 132 records
  scanned: 0 rows for a word the operator typed, 0 for the smoke test's sentence, 0 for `eyJ`
  (a token), 0 for the smoke test's note. The queries named fields only.
- **What else the calendar table holds**, read by item kind (session): the history of the
  smoke tests and of the walk as in section 2.1; two types, two weekly patterns, two booked
  appointments of 2026-11-23 and one account of the pool, all made on 2026-11-22, before this
  step, through the page.
- **Cost:** AWS month-to-date 0 USD, the budget `shared-calendar-api-monthly` at 0.0 of 1 USD;
  `aws ce get-cost-forecast` still answers `DataUnavailableException`. The account's tables
  provision 19 read and 17 write units, inside the free 25/25. **Anthropic: 0.10 USD spent this
  month** on the workspace (operator, in the Console), its limit 10 USD.
- **Not done:** the rotation of the key (section 3.2); the spending limit provoked (decided
  against, `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1); nobody but the operator invited.

### 5.7 The change of one's own password (`docs/CHANGE_PASSWORD_PLAN.md` step p4, 2026-11-24)

No deployment of the API: the stack `shared-calendar-api` stayed as section 5.6 left it. The
smoke test ran against it with its new journey (section 2.2), then the page was released from
`main` with the screen "Password" and walked. Who did what: the operator ran the smoke test,
typing the admin password at its prompt, and walked the page by hand from a checklist; the session
with Claude Code ran the gate, the page's release, read-only `aws` commands and curl without
credentials, and saw no password and no token. The commits were not pushed before either run.

- **The smoke test**, `npm run smoke -w backend -- shared-calendar-api` at commit `dac4b02`,
  inside `script -q`: **33 PASS**, throw-away user `smoke-1795501431`. A first attempt stopped at
  the stack's read (`error: INVALID_REQUEST`, the AWS login of that terminal), before any check.
- **Finding F1 of `docs/CHANGE_PASSWORD_PLAN.md` proved:** a wrong current password refused with
  `NotAuthorizedException`, as `docs/ARCHITECTURE.md` section 6.9, row 2, says; the old password
  at the sign-in after the change too.
- **Finding F2 of the same plan proved:** the refresh token from before the change still valid
  after `ChangePassword` alone, `GlobalSignOut` answered, and that refresh token then refused with
  `NotAuthorizedException`.
- **The log search** of section 2.1, over the stack's 32 log groups, the last three hours, 114
  records: 0 rows for the note, for `eyJ` (a token), for `ChangePassword`, `GlobalSignOut` and
  `REFRESH_TOKEN`; a control search for the user's name matched 13 lines in 11 groups. The change
  makes no Lambda log.
- **The gate:** root `DYNAMODB_PORT=8002 npm run verify` PASSED on the clean tree at `bfbea46`.
- **The release**, `npm run deploy -w frontend` at `bfbea46`: SAM `No changes to deploy` for
  `shared-calendar-web`; the build `index.html` 35 268 bytes (6 407 gzipped), `style.css` 21 463
  (6 127), `app.js` 608 106 (137 090); the four uploads, `index.html` last; the invalidation of
  `/*` on `E2V5GRRPLMET12` waited for; the four checks PASS. Read back with curl: the page holds
  the screen's element, and the bundle hands the shell `skipGlobalSignOut` false.
- **The walk at the deployed page** (operator, by hand), two tabs with the Network panel: as the
  Administrator, "Password" last, after "Availability", the form empty with its hints (check 123
  of `docs/FRONTEND_WALK.md`), the password not changed; a throw-away User created on "Users".
  As that User: the screen (check 123); a wrong current password, `ChangePassword` 400, the
  sentence, the fields emptied, still signed in (check 126); the change, `ChangePassword` 200
  then `GlobalSignOut` 200, the login saying "Password changed." (check 127, with the sign-out
  the local stack skips); the old password refused (check 128); the new one signing in on
  `#/password` (check 129); the consoles with no password and no token (check 133). The second
  tab, signed in as the same User at 09:50 local, before the change: its refresh answered 400
  and the login appeared at 10:05, 15 minutes after its sign-in. The User deleted from the page
  at the end. Every check yes.
- **Cost:** one exchange of the smoke test with the assistant, about a US cent at Anthropic;
  nothing at AWS beyond the free allowances.

---

### 5.8 The capacity of a type (`docs/CAPACITY_PLAN.md` step u7, 2026-11-24)

The API deployed to `shared-calendar-api` and the page released to `shared-calendar-web`, from
`main`, with the capacity of a type (`docs/SHARED_CALENDAR_SPEC.md` decisions D24 to D31). Who
did what: the operator ran the API's deployment and the smoke test in a terminal inside
`script -q`, typed `y` and the admin password, and looked at the deployed page by hand from a
short list; the session ran the gates, the page's release, read-only `aws` commands and curl
without credentials, and saw no password and no token. When to deploy was the operator's choice;
nobody was told beforehand. The commits were not pushed before, during or after the release.

- **The smoke test locally first**, with its new capacity journey (section 2.3): 47 PASS and the
  2 SKIP of `GlobalSignOut`, 49 lines; a stop halfway cleaned up everything it had made.
- **The gate:** root `DYNAMODB_PORT=8002 npm run verify` PASSED on the clean tree at `e0e36f6`.
- **Deployment of the API**, `npm run deploy -w backend` at `e0e36f6`, no argument. On macOS
  `script` takes the file first and has no `-c`: `script -q /tmp/deploy.txt npm run deploy -w
  backend`. **Change set: 31 Modify, all with replacement `False`, no Add, no Remove, no
  Replace**, read back by the session with `describe-change-set` before the operator's `y`: the
  30 functions but the authorizer, `Code` their only change; `HttpApi`, all of whose details are
  its `Body`, "Dynamic", caused by a function's `Arn` (the API names the updated functions; their
  ARNs do not change). `UPDATE_COMPLETE` at 17:08 UTC. The mark of the assistant's instructions
  changed with this code, so every conversation in progress ended.
- **The smoke test**, `npm run smoke -w backend -- shared-calendar-api` at `e0e36f6`, inside
  `script -q`: **49 PASS**, throw-away user `smoke-1795540210`, the capacity journey on
  2027-01-13 03:00–04:00 (Europe/Rome).
- **The log search** of section 2.1, over the stack's 32 log groups from ten minutes before the
  run, 255 records: 0 rows for the note, for `eyJ` (a token), for the assistant's sentence, for
  `ChangePassword`, `GlobalSignOut`, `REFRESH_TOKEN` and for a non-empty `"password":"…"`; control
  searches for the user's name (27 lines in 12 groups) and for the capacity journey's names
  (12 lines in 6 groups) matched.
- **The gate again** on the clean tree at `3deee68` (the record of the API's deployment
  committed), then **the release**, `npm run deploy -w frontend`: SAM `No changes to deploy` for
  `shared-calendar-web`; the build `index.html` 37 665 bytes (6 770 gzipped), `style.css` 23 955
  (6 738), `app.js` 613 856 (138 924); the four uploads, `index.html` last; the invalidation of
  `/*` on `E2V5GRRPLMET12` waited for; the four checks PASS. Read back with curl: the served
  `app.js` is byte for byte the build.
- **The quick look at the deployed page** (operator, by hand, as the Administrator), five yes:
  the type `look-cap` created with capacity 2, the list saying "look-cap · 2 places"; the user
  `look-u7` created, its password shown once; an extra window 15:00–17:00 of `look-cap` on a free
  day of the next week saved; in the week, the slots 15:00 and 16:00 each saying "2 of 2 places
  left"; the window, the type and the user deleted. The walk of `docs/FRONTEND_WALK.md` section
  10 was not repeated at the deployed page, by the Product Owner's decision.
- **What stays**, by design: the smoke test's history (sections 2.1 and 2.3); of the quick look,
  the deleted user's `DELETEDUSER` marker. No type, window or user made for the release is left.
- **Cost:** AWS within the free tier; at Anthropic the smoke test's one exchange, about a US cent.

### 5.9 Times on 5-minute steps (`docs/SLOT_STEP_PLAN.md` step s6, 2026-11-25)

The API deployed to `shared-calendar-api` and the page released to `shared-calendar-web`, from
the branch `slot-5min`, not from `main`: its base holds no code of the mail work, which is on
`main` and must not reach the cloud before its own release (`docs/SLOT_STEP_PLAN.md` section 6).
Times on 5-minute steps (`docs/SHARED_CALENDAR_SPEC.md` decision D32). Who did what, as in 5.8:
the operator ran the API's deployment and the smoke test in a terminal inside `script -q`, typed
`y` and the admin password, and looked at the deployed page by hand from a short list; the
session ran the gates, the page's release, read-only `aws` commands and curl without
credentials, and saw no password and no token. Nothing was pushed.

- **The smoke test locally first**, with its three new lines (section 2.1): 50 PASS and the 2
  SKIP of `GlobalSignOut`, 52 lines.
- **The gate:** root `DYNAMODB_PORT=8002 npm run verify` PASSED on the clean tree at `259e0d6`.
- **Deployment of the API**, `npm run deploy -w backend` at `259e0d6`. A first attempt stopped
  before reaching AWS with `CreateOAuth2Token … authorization grant is invalid`: the terminal
  had no `AWS_PROFILE`, so SAM took the machine's default profile, whose sign-in had expired.
  Run again as `AWS_PROFILE=shared-calendar-admin script -q /tmp/deploy.txt npm run deploy -w
  backend` (section 1, item 3). **Change set: 31 Modify, all with replacement `False`, no Add,
  no Remove, no Replace**, read back with `describe-change-set` before the operator's `y`: 30
  functions with `Code` their only change, and `HttpApi`, its `Body` "Dynamic", as in 5.8.
  `UPDATE_COMPLETE` at 14:24 UTC. The mark of the assistant's instructions changed with this
  code, so every conversation in progress ended.
- **The smoke test**, `npm run smoke -w backend -- shared-calendar-api` at `259e0d6`, inside
  `script -q`: **52 PASS**, throw-away user `smoke-1795616753`, the calendar journey on
  2027-01-14 (Europe/Rome), with 03:10–03:35 booked and cancelled by the Administrator and
  03:07 refused, nothing written.
- **The log search** of section 2.1, over the stack's 32 log groups from ten minutes before the
  run, read as raw events with `aws logs filter-log-events` (Logs Insights had not indexed the
  run yet and scanned 0 records), 237 events in 18 groups: 0 for the note, for `eyJ`, for
  `ChangePassword`, `GlobalSignOut` and `REFRESH_TOKEN`, for `"password"` and for the
  assistant's sentence; the control search for the user's name matched 29 events in 12 groups.
- **The gate again** on the same clean tree at `259e0d6`, then **the release**,
  `npm run deploy -w frontend`: SAM `No changes to deploy` for `shared-calendar-web`; the build
  `index.html` 40 835 bytes (6 991 gzipped), `style.css` 24 998 (7 089), `app.js` 615 263
  (139 593); the four uploads, `index.html` last; the invalidation of `/*` on `E2V5GRRPLMET12`
  waited for; the four checks PASS. Read back with curl: the served `app.js` is byte for byte
  the build.
- **The quick look at the deployed page** (operator, by hand, as the Administrator and as a
  User), seven yes: the type `look-step` and the user `look-user` created; a window 09:05–11:00
  of `look-step` saved under "This day only" on 2026-12-03, each time list showing its whole
  value; that day offering the User one slot, 10:00; the book dialog, Start 10:10 setting End
  11:10 and End changed to 10:15 leaving Start alone, booked for `look-user`; the 10:10–10:15
  block short and readable; the appointment cancelled; the window, the user and the type
  deleted. A first try with the windows 09:05–10:05 and 11:10–12:00 offered the User no slot,
  as `docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01 says (no whole local hour fits in either); the
  Product Owner then asked for a new rule, a User's hour starting on any 5-minute step, which
  is planned apart and not part of this release.
- **No way back without care.** Once a window at 09:05 or an appointment at 10:10 is stored, the
  API of `v2.3.0` still reads it, but its page cannot show that time in its lists. Before any
  roll-back to `v2.3.0`, look for times off the quarter hour first: patterns, date overrides
  and one-off windows whose `start` or `end` is not on 00, 15, 30 or 45, and booked
  appointments whose start or end is not; while there are none, the roll-back is safe. The
  smoke test's own 03:10–03:35 is cancelled and needs no care.
- **What stays**, by design: the smoke test's history (sections 2.1 and 2.3, two cancelled
  appointments of its calendar journey); of the quick look, the deleted user's `DELETEDUSER`
  marker and the cancelled 10:10–10:15.
- **Cost:** AWS within the free tier; at Anthropic the smoke test's one exchange, about a US
  cent, and the paid evaluation before the deployment, 46.59 US cents (`docs/SLOT_STEP_PLAN.md`
  step s6).

### 5.10 Windows of whole hours (`docs/WINDOW_HOURS_PLAN.md` step w5, 2026-11-25)

A window lasts a whole number of hours, and a User's slots are counted from the window's start
(`docs/SHARED_CALENDAR_SPEC.md` decision D33). The API of this release refuses to save a window
that is not whole hours, so every such window still stored is deleted (or changed to whole hours)
**before** the API is deployed (`docs/WINDOW_HOURS_PLAN.md` decisions Q3, Q5 and Q7).

**The check, read-only.** It reads the stack's `calendar` table straight, so it needs no token and
sees every pattern, ended or not, and the date overrides and one-off windows from today. It prints
one line per window whose start and end minutes differ (`24:00` counting as `00`), with the type's
name, or `none`. Run it in a terminal set up as section 1 says (`AWS_PROFILE` set):

```bash
T=shared-calendar-api-calendar
R=eu-north-1
TODAY=$(TZ=Europe/Rome date +%F)
q() { aws dynamodb query --region "$R" --table-name "$T" --output json --key-condition-expression "$1" --expression-attribute-values "$2"; }
{
  echo '{"types":'; q "PK = :p" '{":p":{"S":"TYPE"}}'
  echo ',"pattern":'; q "PK = :p" '{":p":{"S":"PATTERN"}}'
  echo ',"override":'; q "PK = :p AND SK >= :d" "{\":p\":{\"S\":\"OVERRIDE\"},\":d\":{\"S\":\"$TODAY\"}}"
  echo ',"window":'; q "PK = :p AND SK >= :d" "{\":p\":{\"S\":\"WINDOW\"},\":d\":{\"S\":\"$TODAY\"}}"
  echo '}'
} | node -e '
let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
  const all = JSON.parse(s);
  const v = (x) => (x === undefined || x.NULL ? null : x.S ?? x.N);
  const names = new Map(all.types.Items.map((i) => [v(i.SK), v(i.name)]));
  const type = (i) => `${names.get(v(i.typeId)) ?? "unknown type"} (${v(i.typeId)})`;
  // Whole hours: the same minutes, 24:00 counting as 00 (docs/SHARED_CALENDAR_SPEC.md decision D33).
  const minute = (t) => (t === "24:00" ? "00" : t.slice(3, 5));
  const bad = (w) => minute(v(w.start)) !== minute(v(w.end));
  const days = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const out = [];
  for (const i of all.pattern.Items) if (bad(i)) out.push(`pattern ${v(i.SK)}: ${days[v(i.weekday)]} ${v(i.start)}-${v(i.end)}, ${type(i)}, valid ${v(i.validFrom)} to ${v(i.validUntil) ?? "no end"}`);
  for (const i of all.override.Items) for (const w of i.windows.L.map((x) => x.M)) if (bad(w)) out.push(`this day only ${v(i.SK)}: ${v(w.start)}-${v(w.end)}, ${type(w)}`);
  for (const i of all.window.Items) if (bad(i)) out.push(`extra window ${v(i.SK).split("#")[1]}: ${v(i.date)} ${v(i.start)}-${v(i.end)}, ${type(i)}`);
  console.log(`read: ${all.pattern.Items.length} patterns, ${all.override.Items.length} dates with their own windows, ${all.window.Items.length} extra windows (from today)`);
  console.log(out.length ? out.join("\n") : "none");
});'
```

A window listed is deleted by the Administrator on the page ("Availability": a pattern's row
"Delete"; a date's "This day only" or "Extra windows"). A delete refused with `409
availability_conflict` holds a booked appointment: change the window to whole hours that keep it,
or move the appointment first (`docs/WINDOW_HOURS_PLAN.md` F6). Then run the check again: it must
print `none`.

- **The first run**, at `e302668`: 3 patterns, 1 date with its own windows and 3
  one-off windows read; two listed, neither holding a booked appointment: the pattern Monday
  13:00–14:45 of `piscina`, valid from 2026-11-22 with no end, and the one-off window 2026-12-03
  11:10–12:00 of `look-step`, left by the quick look of section 5.9.
- **What the Product Owner did**, by hand on the page of `v2.4.0`: the pattern of `piscina`
  changed to Monday 13:00–15:00, so Mondays keep it, widened to two whole hours; the one-off
  window of `look-step` deleted.
- **The second run**: 3 patterns, 1 date with its own windows and 2 one-off windows read;
  `none`. Run once more just before the deploy, at `2dfd39c`: `none`.

**The release**, from the branch `slot-5min`, not from `main`, as in 5.9
(`docs/WINDOW_HOURS_PLAN.md` section 6). Who did what, as in 5.9: the operator changed the
windows on the page, ran the API's deployment and the smoke test in a terminal inside `script -q`,
typed `y` and the admin password, and looked at the deployed page by hand from a short list; the
session ran the check, the gates, the page's release, read-only `aws` commands and curl without
credentials, and saw no password and no token. Nothing was pushed.

- **The smoke test locally first**, with its new window and line (section 2.1): 51 PASS and the 2
  SKIP of `GlobalSignOut`, 53 lines.
- **The gate:** root `DYNAMODB_PORT=8002 npm run verify` PASSED on the clean tree at `2dfd39c`.
- **Deployment of the API**, `AWS_PROFILE=shared-calendar-admin script -q /tmp/deploy.txt npm run
  deploy -w backend` at `2dfd39c`. **Change set: 31 Modify, all with replacement `False`, no Add,
  no Remove, no Replace**, read back with `describe-change-set` before the operator's `y`: 30
  functions with `Code` their only change, and `HttpApi`, its `Body`, as in 5.9.
  `UPDATE_COMPLETE`. The mark of the assistant's instructions changed with this code, so every
  conversation in progress ended.
- **The smoke test**, `npm run smoke -w backend -- shared-calendar-api` at `2dfd39c`, inside
  `script -q`: **53 PASS**, throw-away user `smoke-1795635643`, the calendar journey on
  2027-01-14 (Europe/Rome), the window 03:05–03:50 refused `400 invalid_request` with nothing
  written, the window 03:05–04:05 and its slot 03:05 booked, listed and cancelled.
- **The log search** of section 2.1, over the stack's 32 log groups from ten minutes before the
  run, read as raw events with `aws logs filter-log-events`, 248 events in 18 groups: 0 for the
  note, for `eyJ`, for `ChangePassword`, `GlobalSignOut` and `REFRESH_TOKEN`, for `"password"`
  and for the assistant's sentence; the control search for the user's name matched 29 events in
  12 groups.
- **The release of the page**, `npm run deploy -w frontend` within the gate's 30 minutes: SAM
  `No changes to deploy` for `shared-calendar-web`; the build `index.html` 40 835 bytes (6 991
  gzipped), `style.css` 25 382 (7 197), `app.js` 616 291 (140 027); the four uploads,
  `index.html` last; the invalidation of `/*` on `E2V5GRRPLMET12` waited for; the four checks
  PASS. Read back with curl: the served `app.js` is byte for byte the build.
- **The quick look at the deployed page** (operator, by hand, as the Administrator and as a
  User), five yes: the type `look-hours` and the user `look-user` created; on 2026-12-13 an
  extra window 09:05–11:05 of `look-hours` saved, the end's minute list holding 05 alone;
  09:05–10:30 not possible to enter; as `look-user`, that Sunday offering 09:05–10:05 and
  10:05–11:05; the window, the user and the type deleted.
- **The way back** (`docs/WINDOW_HOURS_PLAN.md` F12). A roll-back to `v2.4.0` is possible at any
  time: its API accepts every window of whole hours, and its slots come back on the whole local
  hour, so a window 09:05–11:05 would offer a User one slot, 10:00, again. The windows changed
  or deleted before this release do not come back.
- **What stays**, by design: the smoke test's history (sections 2.1 and 2.3); of the quick look,
  the deleted user's `DELETEDUSER` marker. The types `look-step` and `look-cap` of the looks of
  5.8 and 5.9 are still in the calendar, with no window: they block nothing.
- **Cost:** AWS within the free tier; at Anthropic the smoke test's one exchange, about a US
  cent, and the paid evaluation before the deployment, 48.93 US cents
  (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3).

### 5.11 E-mail (`docs/EMAIL_PLAN.md` steps m9 and m10, opened 2026-11-25)

**Stage `domain` (step m9).** The API at `e756e17` (`MailStage=domain`), on `main` after the merge
of `slot-5min`, pushed before the deploy. Who did what: the operator deleted the Users and did
the steps of section 3.3 on the page, at the DNS provider, in the mailbox and in the console, and
ran the two deploys and the smoke test in a terminal inside `script -q`, typing `y` and the admin
password; the session ran the regression and the gates, read-only `aws` commands, and, at the
operator's request in the session, the build and the change set at `on` with its deletion. The
session saw no password and no token.

- **The regression, on `b7c71c1`:** root `verify` PASSED (back end 2058 unit tests and 245
  journeys, shared 632, front end 3164); the front end's journeys, 101; the local smoke test, 62
  PASS and 3 SKIP; `docs/FRONTEND_WALK.md` at 1280 × 800 and 390 × 844, every check yes but one,
  check 209: after "Cancel" on "Choose your password" the password field had no keyboard, because
  it was given the focus while its form was still hidden. Fixed in `ab19f6e`, with a unit test.
  Section 7, a person's own look, was not walked.
- **Read-only, before:** the region, yes (section 3.3, check 1); `iam:CreateServiceLinkedRole`,
  `allowed` (check 2), the role itself not there yet.
- **The change set at `on`, never executed:** 76 changes, 36 Add and 40 Modify, every one
  Replacement `False`, no Remove. The pool Modify on `AdminCreateUserConfig`,
  `EmailConfiguration` and `Policies`, each `RequiresRecreation` `Never`; the tables, the
  Administrator and the pool's client unchanged. Deleted after reading.
- **The Users deleted** in the page of `v2.5.0`; the pool then held `admin` alone.
- **The deploy**, 2026-11-25 at 22:55 UTC, after `verify` PASSED at `e756e17`: 66 changes, 30 Add
  (the SES identity, its configuration set and bounce destination, the bounces' topic and its
  policy, the table `mail`, six functions with their roles, log groups and permissions) and 36
  Modify (31 functions, 4 roles, `HttpApi`), every one Replacement `False`, no Remove; the pool
  untouched at this stage. `UPDATE_COMPLETE`, `MailStage` `domain`, the outputs
  `MailDkimRecord1` to `3` added.
- **The smoke test in the cloud:** 62 PASS, no FAIL, no SKIP; its e-mail lines answered `503
  mail_unavailable`, nothing made.
- **The logs**, from the deploy on: 38 log groups, 259 events. The words of an error only in the
  five expected `503 mail_unavailable` of the smoke test (`createUser` 3, `resendInvitation` 1,
  `sendCalendarMail` 1); the access log's 5xx all `503` of those routes, no authorizer or
  integration error. Searched by field (`level`, `status`, `route`), never the whole message.
- **The page**, after `verify` PASSED again at `e756e17`: the hosting stack had no change, the four
  checks PASS, the served `app.js` byte for byte the built one.
- **The operator, 2026-11-26.** "My details" saved. The daily mail's hour could not be set: at
  `domain` its routes answer 503, as `docs/EMAIL_ARCHITECTURE.md` section 9.1 says, so section
  3.3 and the plan were corrected; it is set at `on`. The test User (`test-user cloud`): signed
  in, a password chosen; then the week said "The server cannot be reached" once, with no request
  of that User in the access log, and worked after a reload; no cause found, not seen again. The
  week, a booking, a cancellation, the assistant, and "E-mail…" ("E-mail is not available yet")
  as expected. A second test User: check 216 yes. Both kept for now.
- **DNS** at GoDaddy, the names without the domain: one of its two name servers had the four
  records at once, the other some minutes later. SES: the domain `SUCCESS`, DKIM `SUCCESS`,
  within the hour.
- **The bounces' topic:** its one e-mail subscription confirmed (read with
  `list-subscriptions-by-topic`, the address not printed).
- **The 5xx alarm** went to ALARM and back to OK by itself three times (2026-11-26 at about 05:34,
  10:27 and 10:45 UTC), each from the expected 503 of an e-mail route: the page's "Settings" and
  "E-mail…", and the operator's tries of `POST /users` (section 3.3).
- **Production access:** the form had no field for the use case; AWS answered at once asking for
  the details (the review `DENIED` meanwhile), and the operator replied in the support case
  (section 3.3). Waiting for AWS's answer.
- **Owed to step m10:** production access granted; the daily mail's hour; the two test Users
  deleted when no longer needed.
- **Cost:** AWS within the free tier; nothing at Anthropic but the smoke test's one exchange,
  about a US cent.

**Stage `on` in the sandbox (step m10, part A), 2026-11-28.** The API at `5a4456c`, on `main`,
pushed before each deploy; the page unchanged since step m9. Who did what as in step m9: the
operator verified the addresses, ran the three deploys and the three smoke tests inside `script
-q`, and looked at the page and the mails; the session ran `verify` before each deploy and
read-only `aws` commands, and printed no address.

- **Before:** the domain `SUCCESS`, DKIM `SUCCESS`; the account in the sandbox (200 mails a day,
  1 a second, the review `DENIED` while AWS's answer is pending); four address identities, each
  `SUCCESS`, the operator's own, the Administrator's (a `+admin` address of it) and the test
  Users'. `miri` asks for mail, `enri` is kept away from it.
- **Deploy 1, `MailStage=on`** (`e8884b2`), at 08:32 UTC after `verify` PASSED: 32 changes, 6 Add
  (the mailer, its role, log group and error alarm, the schedule and its role) and 26 Modify, no
  Remove, no Replacement; the pool Modify on `AdminCreateUserConfig`, `EmailConfiguration` and
  `Policies`, each `Never`. Then the pool sends with `DEVELOPER` through the configuration set,
  its invitation's subject set, temporary passwords valid 7 days.
- **Smoke test 1:** 64 PASS, 1 FAIL, the mail on demand: SES refused the mailer
  (`AccessDeniedException`, the call and Lambda's two retries) while both invitations arrived. A
  test User `simtest` with the simulator's address asked a mail on demand: `sent`. So SES in the
  sandbox checks the mailer's role against a verified recipient's identity (section 3.3, step 4).
  The mailer's error alarm went to ALARM at 08:40 UTC, and back to OK by itself at 09:42.
- **Deploy 2, the mailer's `identity/*`** (`d2817ab`, the Product Owner's decision): 9 changes, all
  Modify, one of them real (`MailerRole`'s policy), the others listed only for the ARNs they name.
- **Smoke test 2:** 64 PASS, 1 FAIL: the mail was `sent`, but the script read the CLI's per-page
  counts as two lines (`1` and `0`); and the mail's `.xlsx` did not open, every byte that is not
  text turned into the replacement character, as SES writes an attachment given no
  `ContentTransferEncoding` (`docs/EMAIL_PLAN.md` step m10).
- **Deploy 3, the attachments as base64 and the script's sum** (`5a4456c`): 8 changes, all Modify,
  one real (`MailerFunction`'s code).
- **Smoke test 3:** **65 PASS**, no FAIL, no SKIP; the mailer's line `sent` after 5 s; the Excel
  file 3161 bytes, as made, its sheet and headings read back, and opened by the operator.
- **The operator's look:** the invitation from `noreply@<domain>`, not in spam, replies to the
  alarm address; a throw-away User created in the page, its invitation, its resend, the first
  sign-in with the second password, a password chosen, `active`, deleted; "E-mail…" as the
  Administrator and as `miri`, each mail arrived, each file opened. The daily mail, its hour set
  to the next whole hour: the timer's run at 10:00 UTC `sent`, the mail arrived with its two
  files, both opened and correct.
- **The logs**, from the first deploy on: 38 log groups, the only lines of level `error` the
  mailer's three refusals of smoke test 1; the access log without a 5xx. The alarms OK; the 5xx
  alarm unchanged since 2026-11-26, so the e-mail routes no longer set it off.
- **Owed to part B:** production access; the mailer's role back to the domain's identity, deployed,
  the smoke test again; `simtest`, `miri` and `enri` deleted.
- **Cost:** a few dozen mails through SES, a fraction of a US cent; the smoke tests' exchanges at
  Anthropic, about three US cents.

### 5.12 The languages, `v3.1.0` (`docs/MULTILANGUAGE_PLAN.md` phase B, items 8 and 9, 2026-11-28)

The API and the page at `744572b`, on the branch `multilanguage` (`main` at `ef6ddc4` merged
in); `main` and the cloud before it at `v3.0.0` (section 5.11). Released as `v3.1.0`: the tag
on the record's commit after `744572b`, `main` moved to that commit, both pushed (`README.md`
"Versions"). Who did what: the
operator ran the deploy, the smoke test and the page's release in a terminal inside `script -q`
(macOS: `script -q <file> <command>`), typing `y`, the admin password and their own address, and
looked at the page, the mails and the gap; the session ran `verify`, read-only `aws` commands
and the recordings by line, wrote the scratch script of the gap outside the repository, and saw
no password, token or address.

- **Before, read-only:** the app client with no `ReadAttributes` and no `WriteAttributes` (every
  standard attribute writable by a person's own token), `ExplicitAuthFlows`
  `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`; the pool's `LambdaConfig` empty, the
  invitation's subject the English one, sending `DEVELOPER`; the stack's `MailStage` `on`, no
  parameter and no output `DefaultLanguage`; SES in the sandbox (`ProductionAccessEnabled`
  false, 200 mails a day, 1 a second). As the documents say.
- **The gate:** root `DYNAMODB_PORT=8002 npm run verify` PASSED at `744572b` on a clean tree:
  2090 back-end unit tests, 673 shared, 3296 front end, 100 % line coverage, 249 back-end
  journeys. One stamp served both deploys.
- **The API's deploy**, 12:44 to 12:46 UTC: 58 changes, 4 Add (`InviteMessageFunction`, its role,
  log group and permission) and 54 Modify, every one Replacement `False`, every detail
  `RequiresRecreation` `Never`, no Remove. The pool Modify on `LambdaConfig`, the app client
  Modify on `WriteAttributes`; 37 functions for their code, the mailer's environment too
  (`DEFAULT_LANGUAGE`); 13 roles, `HttpApi` and the daily schedule only for the names they point
  at, none changed directly; the mailer's role with its `identity/*` of part A untouched. The
  tables, the Administrator, the SES identity and the configuration set not in the list. Read
  with `describe-change-set`: the terminal's table had lost the pool's and the client's rows
  (section 3.4). `UPDATE_COMPLETE`; after it, the client's write list `locale`, its id unchanged,
  the pool's `CustomMessage` the new function, the parameter and the output `DefaultLanguage`
  `it`.
- **The smoke test in the cloud:** **65 PASS**, no FAIL, no SKIP; the mailer's line `sent` after
  10 s. The invitation and its resend reached the operator's mailbox in Italian, from
  `noreply@<domain>`, not in spam. The invitation function's log: five lines, each
  `CustomMessage_AdminCreateUser`, `it`, `worded` (the smoke User and the capacity journey's two
  at the mailbox simulator, the operator's and its resend). No line of level `error` or `warn`
  in the 39 log groups; the access log without a 5xx, its seven 4xx the smoke test's expected
  refusals.
- **The page**, at 12:57 UTC on the same stamp: the hosting stack had no change, the four checks
  PASS, the served `app.js` byte for byte the built one, holding the default language `it`.
  Right after, the page's name did not resolve on the operator's Mac for some minutes (curl:
  `Could not resolve host`, the CloudFront name too) while CloudFront answered 200 through a
  public resolver: a passing DNS failure on that machine, not the release.
- **The operator's look, all yes:** the sign-in screen with its list of languages, following the
  browser's; a throw-away User made in "Users", its invitation in Italian, the first sign-in with
  the temporary password, "Choose your password", the frame and "My details" in the page's
  language, the language changed and back and kept at the next sign-in, the User deleted; the
  assistant's panel, one message answered in the page's language.
- **The gap closed:** the scratch script, with the throw-away User's own access token:
  `UpdateUserAttributes` on `email` refused, `NotAuthorizedException`; on `locale` accepted;
  `GetUser` answering `locale`, the e-mail unchanged. CloudTrail shows the same, and the page's
  own writes of `locale` all accepted.
- **The Administrator:** signed in once, its account holds `locale` `it` (read with
  `admin-get-user`, that attribute only). Its "E-mail…" at 13:12 UTC answered `429
  mail_limit_reached`: the day's five mails on demand were spent by part A's look and the smoke
  tests. The mail opened was the smoke test's, sent while the account had no language, so in the
  default. **Owed:** the next daily mail, in the Administrator's language. The day's run had gone
  out at 10:00 UTC, before the deploy; the mailer's lines of kind `daily` since the deploy say
  `already_sent`, so the first mail in the Administrator's language is the next day's, and the
  release of `v3.1.0` did not wait for it.
- **The alarms:** the API's 5xx, the authorizer's and the mailer's errors all `OK`, unchanged
  since before the deploy; the new function has no alarm of its own.
- **Cost:** a handful of mails through SES and of calls of the new function, nothing measurable;
  the smoke test's and the panel's exchanges at Anthropic, about two US cents.

## 6. A person's password: what to tell them

Nobody can change another person's password: not the Administrator, not the API, not the
operator through the page (`docs/ARCHITECTURE.md` section 6.9). Nobody hands a User's password
over either: Cognito makes the first one and e-mails it (`docs/ARCHITECTURE.md` section 6.3).
There is no "forgot my password".

**A new User** (once `MailStage` is `on`):

- The Administrator creates the account in the page's "Users", with the person's e-mail. The
  page shows the address once more before sending: check it, since a wrong address that belongs
  to someone else would give them the account.
- The person receives an invitation from `noreply@<domain>`: their username, a temporary
  password and the page's address. Tell them to look in the spam folder too.
- At the first sign-in with it the page says "Choose your password": they type a password of
  their own twice, with the same hints as the screen "Password". From then on the Users screen
  shows them `active`.
- The temporary password works for 7 days. Past that, or if the mail never came, the
  Administrator presses "Resend invitation" (the User is still `invited`): a new mail, with a new
  temporary password; the old one opens nothing. A wrong address: correct the e-mail in the Users
  screen first, then resend. A User shown `active` who says they never signed in: someone else
  did; delete the account and create it again with the right address.

**A person who knows their password** and wants another one, a User or the Administrator:

- Sign in at the page, open "Password", the last link, and type the current password, then the
  new one twice. The hints under the fields say what the new one still misses (12 characters or
  more, an upper-case letter, a lower-case one, a digit, one of the symbols listed there; no
  space).
- After the change the page shows the login with "Password changed.": sign in with the new one.
- The change signs the person out everywhere. Another computer or phone where they were signed
  in asks them to sign in again at its next renewal of the session, within 15 minutes or so; a
  call it makes before then still works.
- If the page says the current password is not correct, nothing has changed. After several wrong
  attempts Cognito refuses for a while ("too many attempts"): wait, then try again.

**A person who lost their password:**

- **A User:** the Administrator deletes the account in the page's "Users" and creates it again
  with the same username and their address: a new invitation goes to them. Deleting the account
  cancels the User's future appointments (`docs/SHARED_CALENDAR_SPEC.md` section 10.2): book them
  again for the new account if needed. Before `MailStage` is `on` no User can be created, so this
  waits.
- **The Administrator:** the operator runs `npm run bootstrap-admin -w backend --
  shared-calendar-api` in a terminal set up as in section 1, item 3, and types the new password
  twice. It sets the password only; the Administrator's appointments and data stay.
