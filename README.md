# Shared Calendar

The back end of a shared calendar, serverless on AWS. The calendar's routes are described in
`docs/SHARED_CALENDAR_SPEC.md` (this README gains its calendar sections in
`docs/IMPLEMENTATION_PLAN.md` step 59). The part below is the base the calendar is built on, and
its Hello World route proves that the whole chain works. Signed-in users call `POST /hello` and get a message
back that is also stored in a database; an administrator creates and deletes users. Two roles:
**user** (may call Hello World) and **admin** (may also create and delete users). Three routes:
`POST /hello`, `POST /users`, `DELETE /users/{username}`. TypeScript on AWS Lambda behind an
HTTP API, identities in Amazon Cognito, messages in DynamoDB, everything declared in one SAM
template and fully testable on a laptop before anything reaches the cloud.

This is v1 of the back end of a larger application. The repository is a monorepo: the back end
in `backend/`, the code it shares with the browser front end (the API contract
and the username rule) in `shared/`, and in `frontend/` the front end: its services layer
(session store, login, token refresh, Hello World, user administration, the calendar;
`docs/FRONTEND_SERVICES.md`) and its pages (`docs/FRONTEND_ARCHITECTURE.md`): the login, the
week calendar, a User's appointments and the Administrator's settings, users and availability.
They run locally (see "The page, locally" below) and are deployed: the page is in use at the
address given under "The deployed stacks".

Where the full story is:

| Document | What it answers |
|---|---|
| `docs/ARCHITECTURE.md` | What was built and why: API contract, data model, security, local stack, deployment |
| `docs/IMPLEMENTATION_PLAN.md` | In which order it was built, with an acceptance check per step |
| `docs/RUNBOOK.md` | What the operator does: daily start, updating the API's stack, releasing the page, deploying from scratch; the record of every deployment |
| `docs/AWS_ACCOUNTS.md` | Which AWS identity to sign in with, and why |
| `docs/FOLDER_STRUCTURE.md` | The monorepo layout (back end, front end, shared): which folder holds what, and how the pieces are built |
| `docs/FRONTEND_SERVICES.md` | The front end's services layer: the `SessionStore` and one service per remote call (login, refresh, logout, Hello World, users, the calendar), in `frontend/src/services/` |
| `docs/FRONTEND_ARCHITECTURE.md` | The front end's pages: how a view is written, the logic between the services and the views, the shell; and how the page is hosted and deployed (its section 13) |
| `docs/FRONTEND_DEPLOY_PLAN.md` | In which order the hosting was built and deployed (steps 70 to 73; done, with a few checks at the deployed page still owed, listed in `docs/RUNBOOK.md` section 5.5) |
| `docs/FRONTEND_WALK.md` | The walk through every screen in a browser, by hand: the check to repeat after a change to the pages |
| `docs/journeys/` | The integration journeys explained in simple words, one page per `describe` block (index in `docs/journeys/README.md`) |
| `CLAUDE.md` | Working rules and the complete list of commands |

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 (pinned in `.nvmrc`; run `nvm use`) | `node -v` |
| npm | bundled with Node | `npm -v` |
| git, curl | any current | `git --version`, `curl --version` |
| Docker with the Compose v2 plugin | current | `docker info`, `docker compose version` |
| AWS SAM CLI | ≥ 1.171.0 (the monorepo build; `scripts/check-sam.sh` refuses older) | `sam --version` |
| AWS CLI v2 | current | `aws --version` |

The AWS CLI is needed locally too: the seed script creates the local table, user pool and
users with it (against the emulators, with dummy credentials). No AWS account is needed until
you deploy.

**GitHub Codespaces only**, after every Codespace start: the legacy firewall drops traffic
between containers, and the authorizer then times out fetching the signing keys.

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT
```

## The deployed stacks

Two stacks, in one region and one account: the API's and the page's. The page's is never part of
the API's: a release of the page changes nothing of the API.

The API's stack is `shared-calendar-api`, created on 2026-11-16 by `docs/IMPLEMENTATION_PLAN.md`
step 57. The old stack `hello-world-api`, which it replaced, was deleted on 2026-11-21
(`docs/IMPLEMENTATION_PLAN.md` step 58; the record is `docs/RUNBOOK.md` section 5.4): its
address and its ids no longer exist.

| | |
|---|---|
| Stack | `shared-calendar-api` |
| Region | `eu-north-1` (the only region the AWS organization allows for regional services) |
| API | `https://kk32tyn1s4.execute-api.eu-north-1.amazonaws.com` |
| User pool | `eu-north-1_mG58Opv7F` |
| App client | `3gisesgktkagt34c3lentr5dmd` |
| Tables | `shared-calendar-api-calendar`, `shared-calendar-api-hello-messages` |
| CLI profile | `shared-calendar-admin` (IAM Identity Center) |

The three ids are not secrets; they come from `sam list stack-outputs --stack-name shared-calendar-api`.
To talk to the stack from the CLI: `export AWS_PROFILE=shared-calendar-admin`, and when the session
has expired `aws sso login --profile shared-calendar-admin --use-device-code` (`docs/AWS_ACCOUNTS.md`).

The page's stack is `shared-calendar-web`, created on 2026-11-21 by `docs/FRONTEND_DEPLOY_PLAN.md`
step 72: a private S3 bucket that holds the four built files, behind a CloudFront distribution
that also passes `/api/…` on to the API, so that a browser sees one address
(`docs/FRONTEND_ARCHITECTURE.md` section 13).

| | |
|---|---|
| Stack | `shared-calendar-web` (same region, same CLI profile) |
| **The page** (output `PageUrl`) | **https://dfhghsvimmgfm.cloudfront.net** |
| Bucket (output `BucketName`) | `shared-calendar-web-pagebucket-pmpsh2fgyi1j` (private: its own address answers 403) |
| Distribution (output `DistributionId`) | `E2V5GRRPLMET12` |

None of the three is a secret; they come from `sam list stack-outputs --stack-name shared-calendar-web`.
The address is the one AWS gave the distribution, and a new distribution would get a new one.

**Signing in at the page.** Open the address and give a username and its password. `admin` is
the Administrator; its password is the one set with `bootstrap-admin` ("The administrator's
password" below). Every other person is a User the Administrator creates, on the page's "Users"
screen or with `POST /users`: the generated password is shown once and handed over out of band.
The screens are those of the table under "The page, locally". A reload of the page signs out;
"Sign out" also tells Cognito to end the session.

What has been seen at the deployed page and what has not yet been looked at there is in
`docs/RUNBOOK.md` section 5.5 (the record of the first deployment, with its open items).

## Commands

Once, after cloning, at the repository root: `nvm use && npm ci` (installs all packages, one
lock file). Every command below also runs from the root; `-w backend` runs the back end's script
in `backend/` (from inside `backend/`, drop `-w backend` and the `--` before arguments).

| Command | Does |
|---|---|
| `DYNAMODB_PORT=8002 npm run local:up -w backend` | Starts DynamoDB Local, dynamodb-admin and cognito-local in Docker and seeds them: table, pool, groups, users `admin` and `alice`. Idempotent. Drop `DYNAMODB_PORT` if port 8000 is free on your machine; whatever you choose, use the same value for every command below |
| `npm run local:api -w backend` | Builds the functions and serves the API on `http://127.0.0.1:3000` (foreground; wait for `Running on http://127.0.0.1:3000`) |
| `DYNAMODB_PORT=8002 npm run verify -w backend` | The deploy gate: typecheck, lint, audit, template lint, unit tests (of `backend` and `shared`), integration tests against the running local stack. On success writes `backend/.verify-ok` |
| `npm run deploy -w backend` | Refuses unless `backend/.verify-ok` is younger than 30 minutes, names the current commit and says `clean`, and the tree is still clean. Then `sam build` and `sam deploy` (asks to confirm the change set). Uses your real AWS login |
| `npm run smoke -w backend -- shared-calendar-api` | After every deploy of the API: creates a throw-away user, runs the journeys against the real API, deletes the user. Prompts for the admin password. `npm run smoke -w backend -- local` runs the same against the local stack |
| `npm run deploy -w frontend` | Releases the page: behind the same gate as the back end's deploy, it runs the front end's own checks, reads the API's address and the app client from the stack `shared-calendar-api`, deploys the hosting's stack `shared-calendar-web` (asks to confirm a change set only when a resource of the hosting changes), builds, uploads the four files and ends with four checks against the page's address, PASS or FAIL each. Uses your real AWS login. `npm run deploy -w frontend -- --dry-run` goes as far as the build, says what it would do and changes nothing. The procedure, and the order of the two deployments: `docs/RUNBOOK.md` section 2, step 6 |
| `npm run local:down -w backend` | Stops the Docker stack. The table is in memory and is lost; Cognito data survives in `backend/.cognito/` |

`npm run typecheck`, `npm run lint` and `npm run test:unit` at the root cover every package.
Everything else (`bootstrap-admin`, `budget`, and the notes that go with each command) is
listed in `CLAUDE.md`, "Everyday commands". The first deployment of a new stack is different
(`npm run deploy -w backend -- --parameter-overrides AlertEmail=<address>`, then
`bootstrap-admin`, `smoke`, `budget`): `docs/RUNBOOK.md` section 3.

### The page, locally

With the local stack running (`local:up`, then `local:api` in its own terminal):

```sh
npm run seed:local -w frontend # once, on an empty local calendar: something to look at
npm run dev -w frontend        # http://localhost:5173, foreground; Ctrl-C stops it
```

The seed creates two availability types ("Studio" and "Piscina"), a few weekly patterns valid
for 60 days and a few appointments for `alice`, through the local API. It only adds, does
nothing when "Studio" exists already. The back end's calendar journeys (the root `verify` runs
them) empty the local table and leave data of their own in it, a type named "Studio" among
them: after them the seed does nothing, and what brings its calendar back is a new stack
(`local:down`, `local:up`, `local:api`) and then the seed.

Open the address (in a Codespace, the forwarded port 5173) and sign in as `alice` /
`Alice-Local-Pass-1!` (a User) or `admin` / `Admin-Local-Pass-1!` (the Administrator). What
each of them finds:

| Screen | Who | What it does |
|---|---|---|
| Week (`#/week`) | both | The week, with "previous", "Today" and "next". A free slot opens the book dialog (a note; the Administrator also chooses the User and other times inside the slot's window). An appointment opens its detail: the note, "Change" (the next free slot clicked, in any week, is the new time) and "Cancel appointment", offered when the rules allow them |
| My appointments (`#/appointments`) | User | The upcoming appointments, or all those of a period, each with its status; a row opens the same detail |
| Settings (`#/settings`) | Administrator | The cancellation notice, the booking notice, the booking horizon and the maximum of upcoming appointments |
| Users (`#/users`) | Administrator | The list, a form that creates a user and shows the generated password once, a "Delete" per row that asks first |
| Availability (`#/availability`) | Administrator | The availability types, the weekly patterns, and a single date: its own windows ("This day only…"), "Not available on this day", extra windows. A change that would leave a booked appointment outside the hours open for booking is refused and lists the appointments in the way |

Good to know: the week is loaded again after every write and every time the browser's tab
becomes visible again; a reload of the page signs out, since the session is kept in memory
only; an edit to `frontend/src`, `frontend/index.html` or `frontend/style.css` shows after a
reload. The dev server passes the page's calls on to the local API and to cognito-local; it is
for local work only. The deployed page ("The deployed stacks" above) is the same page, built
once and served by CloudFront, which passes its calls on to the real API
(`docs/FRONTEND_ARCHITECTURE.md` section 13).

**To check every screen after a change**: `docs/FRONTEND_WALK.md`, one list of checks to do
by hand in the browser, as `alice` and as `admin`, from a fresh, seeded local stack.

Layout: `backend/` holds `src/handlers/` (one Lambda per file), `src/lib/` (the only code that
touches the AWS SDK), `tests/`, `scripts/`, `template.yaml` and `docker-compose.yml`; `shared/src/`
holds the API contract types and the username rule that the handlers import. The annotated tree
is in `docs/FOLDER_STRUCTURE.md` section 2.

## Using the API with curl

Every call needs a Cognito **access token** in the `Authorization: Bearer` header. Sign in
with the username and password, then call the routes. The examples use shell variables so that
no password is typed into a command line; the AWS CLI still receives it as an argument, which
is acceptable on your own machine.

Local accounts, created by `local:up`: `admin` / `Admin-Local-Pass-1!` (group `admin`) and
`alice` / `Alice-Local-Pass-1!` (group `user`).

### Sign in

Local stack (the emulator accepts any credentials; the client id is in `backend/env.local.json`):

```bash
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-west-1
CLIENT_ID=$(node -p 'require("./backend/env.local.json").AuthorizerFunction.CLIENT_ID')
read -rs -p "Password for alice: " PASSWORD; echo
TOKEN=$(aws cognito-idp initiate-auth --endpoint-url http://localhost:9229 \
  --client-id "$CLIENT_ID" --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=alice,PASSWORD="$PASSWORD" \
  --query AuthenticationResult.AccessToken --output text)
API=http://127.0.0.1:3000
```

Cloud (same command, real pool; `AWS_PROFILE=shared-calendar-admin` exported as in `docs/RUNBOOK.md` section 1):

```bash
read -rs -p "Password for admin: " PASSWORD; echo
TOKEN=$(aws cognito-idp initiate-auth --region eu-north-1 \
  --client-id 3gisesgktkagt34c3lentr5dmd --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=admin,PASSWORD="$PASSWORD" \
  --query AuthenticationResult.AccessToken --output text)
API=https://kk32tyn1s4.execute-api.eu-north-1.amazonaws.com
```

The access token is valid for 15 minutes. Stricter alternative that never puts the password
in a command line (what the operator scripts use):
`printf '%s' "$PASSWORD" | COGNITO_URL=http://localhost:9229 node backend/scripts/cognito.mjs sign-in "$CLIENT_ID" alice`
prints the token (drop `COGNITO_URL=…` for the cloud).

### The three routes

```bash
# Hello World: 201. Admin gets "Hello World, the Administrator is speaking";
# a user gets "Hello World, I am <username>". The message is stored in the table.
curl -s -X POST "$API/hello" -H "Authorization: Bearer $TOKEN"
# {"messageId":"01M…","role":"user","message":"Hello World, I am alice","createdAt":"2026-…"}

# Create a user (admin token only): 201 with the one-time view of the generated password.
curl -s -X POST "$API/users" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"username":"bob"}'
# {"username":"bob","password":"…16 characters…"}

# Delete a user (admin token only): 204, no body.
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE "$API/users/bob" -H "Authorization: Bearer $TOKEN"
```

Usernames: 3 to 32 characters, lowercase letters, digits, `.`, `_`, `-`, starting with a letter
or digit. Error answers from the handlers have the shape `{"error":"<code>","message":"…"}`:

| Status | Code | When |
|---|---|---|
| 400 | `invalid_json`, `invalid_request` | Body is not JSON; username invalid or unknown field |
| 403 | `forbidden` | Valid token but wrong role: a user on `/users`, or a token in neither group on `/hello` |
| 403 | `cannot_delete_admin` | `DELETE /users/<an administrator>` |
| 404 | `user_not_found` | `DELETE` of an unknown user |
| 409 | `user_exists` | `POST /users` with an existing username |
| 500 | `internal_error` | AWS call failed; the error alarm e-mails the operator |

Two answers come from API Gateway itself, with its own body `{"message":"…"}`: **401** when the
`Authorization` header is missing, **403** when the token is invalid or expired.

## Managing users

The administrator creates a user with `POST /users` and hands the returned password to the
person **out of band** (it is shown only in that response and is never logged). The password is
permanent: the user signs in with it right away, no first-login change. There is no password
reset in v1; a user who loses the password is deleted and recreated (`docs/ARCHITECTURE.md`
section 7.4 shows the designed-in ways to add change and reset later). Deleting a user signs
them out everywhere and removes the account; their messages stay in the table as history.
The API can never create an administrator, delete one, or set its password.

## Looking at the data and the logs

- **Locally:** the table in a browser at `http://localhost:8001` (dynamodb-admin); the
  functions' log lines in the `npm run local:api -w backend` terminal.
- **Cloud:** DynamoDB → `shared-calendar-api-hello-messages` → Explore items, in the console
  (region `eu-north-1`). Logs in CloudWatch: `/aws/lambda/shared-calendar-api-<function>` for
  `authorizer`, `hello`, `createUser`, `deleteUser`, and `/aws/apigateway/shared-calendar-api-access`
  for one line per request. Each function writes one structured JSON line per request with the
  request id, route, username, role, outcome and duration, never a token or a password.

## The administrator's password

`npm run bootstrap-admin -w backend -- shared-calendar-api` sets or rotates the admin password of the deployed
stack (typed twice, hidden; checked against the pool policy: 12+ characters with upper, lower,
digit and symbol). It is the only way to set it: the API never touches admin accounts.
`npm run bootstrap-admin -w backend -- local` does the same against the emulator; after that,
run `DYNAMODB_PORT=8002 npm run local:up -w backend` again to restore `Admin-Local-Pass-1!`, or the
integration tests fail.

## Security in one paragraph

There is no secret in the repository and none in the cloud to rotate: the functions use IAM
roles, token verification uses Cognito's public keys, and the only password-like values are the
two local emulator accounts. Each function has its own IAM role limited to the exact actions it
needs on the one pool or table it uses, with no wildcard. Every request is verified by a Lambda
authorizer, and every handler checks the role again. Tokens, passwords and the create-user
response never reach the logs. The alert e-mail address is a stack parameter passed once on the
first deploy and is never written into `backend/samconfig.toml`, because this repository is public.
