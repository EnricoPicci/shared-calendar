# Shared Calendar

A shared calendar, serverless on AWS. The Administrator publishes availability and manages
users; Users book, cancel and change appointments; both can also do it by conversation, in
English or Italian, with an assistant built on Anthropic's Claude that proposes every change and
makes it only when the person confirms. The calendar is described in `docs/ARCHITECTURE.md`
(with `docs/SHARED_CALENDAR_SPEC.md`), the assistant in `docs/ARCHITECTURE.md` (with
`docs/CONVERSATIONAL_ARCHITECTURE.md`). Underneath, a Hello World route proves that the whole
chain works: signed-in users call `POST /hello` and get a message back that is also stored in a
database. Two roles: **user** and **admin**; only an admin creates and deletes users.
The page, the mails, the Excel files, the invitation and the assistant speak English and
Italian: each person chooses on the sign-in screen and in "My details", and the installation
has a default language for the rest (`docs/MULTILANGUAGE_ARCHITECTURE.md`).
TypeScript on AWS Lambda behind an HTTP API, identities in Amazon Cognito, data in DynamoDB,
everything declared in one SAM template and fully testable on a laptop before anything reaches
the cloud.

The repository is a monorepo: the back end
in `backend/`, the code it shares with the browser front end (the API contract
and the username rule) in `shared/`, and in `frontend/` the front end: its services layer
(session store, login, token refresh, Hello World, user administration, the calendar, the
assistant, the change of one's password; `docs/FRONTEND_SERVICES.md`) and its pages
(`docs/FRONTEND_ARCHITECTURE.md`): the login, the week calendar, a User's appointments, the
Administrator's settings, users and availability, and the assistant's panel under every screen.
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
| `docs/CONVERSATIONAL_ARCHITECTURE.md` | The assistant's design: its instructions, its tools, its evaluation with the real model, the alternatives; where it is merged into `docs/ARCHITECTURE.md`, the architecture wins |
| `docs/MULTILANGUAGE_ARCHITECTURE.md` | The languages: where each text lives, how a person's language is chosen and kept, how a new language is added; merged into `docs/ARCHITECTURE.md`, which wins |
| `docs/FRONTEND_SERVICES.md` | The front end's services layer: the `SessionStore` and one service per remote call (login, refresh, logout, Hello World, users, the calendar), in `frontend/src/services/` |
| `docs/FRONTEND_ARCHITECTURE.md` | The front end's pages: how a view is written, the logic between the services and the views, the shell; and how the page is hosted and deployed (its section 13) |
| `docs/FRONTEND_DEPLOY_PLAN.md` | In which order the hosting was built and deployed (steps 70 to 73; done, with a few checks at the deployed page still owed, listed in `docs/RUNBOOK.md` section 5.5) |
| `docs/FRONTEND_WALK.md` | The walk through every screen in a browser, by hand: part of the full regression, run before a release |
| `docs/journeys/` | The integration journeys explained in simple words, one page per `describe` block (index in `docs/journeys/README.md`) |
| `docs/COMMANDS.md` | The complete list of commands, with the notes that go with each, and the local stack's quirks |
| `CLAUDE.md` | Working rules for Claude Code (one more per package: `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `shared/CLAUDE.md`; path-scoped rules in `.claude/rules/`) |

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
| Tables | `shared-calendar-api-calendar`, `shared-calendar-api-hello-messages`, `shared-calendar-api-assistant` (the assistant's conversations) |
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

## Versions

Each git tag marks a state that was deployed: the last commit of its plan, whose code is the
code the stacks ran once that plan was released. A new feature that keeps every client working
takes the next minor version; the major version changes when a client would break.

| Tag | Commit | What it is | Deployment record |
|---|---|---|---|
| `v1.0.0` | `bb31a63` | The Hello World API: sign-in, roles, users created and deleted, on the old stack `hello-world-api`, deleted since | `docs/RUNBOOK.md` section 5.1 |
| `v2.0.0` | `31bed45` | The shared calendar and its page, the page first deployed as `shared-calendar-web` | `docs/RUNBOOK.md` section 5.5 |
| `v2.1.0` | `f29e732` | The assistant, a conversation about the calendar in English or Italian (`docs/CONVERSATIONAL_PLAN.md`) | `docs/RUNBOOK.md` section 5.6 |
| `v2.2.0` | `72215ae` | The change of one's own password (`docs/CHANGE_PASSWORD_PLAN.md`) | `docs/RUNBOOK.md` section 5.7 |
| `v2.3.0` | `a8b3a2b` | The capacity of a type, several people in one slot (`docs/CAPACITY_PLAN.md`) | `docs/RUNBOOK.md` section 5.8 |
| `v2.4.0` | the record's commit after `259e0d6`, whose code was deployed | Times on 5-minute steps (`docs/SLOT_STEP_PLAN.md`), released from the branch `slot-5min` | `docs/RUNBOOK.md` section 5.9 |
| `v2.5.0` | the record's commit after `2dfd39c`, whose code was deployed | Windows of whole hours (`docs/WINDOW_HOURS_PLAN.md`), released from the branch `slot-5min` | `docs/RUNBOOK.md` section 5.10 |

`git checkout v2.5.0` gives the code as it was released; `git tag -n1` lists the tags with
their one-line message.

## Commands

Once, after cloning, at the repository root: `nvm use && npm ci` (installs all packages, one
lock file). Every command below also runs from the root; `-w backend` runs the back end's script
in `backend/` (from inside `backend/`, drop `-w backend` and the `--` before arguments).

| Command | Does |
|---|---|
| `DYNAMODB_PORT=8002 npm run local:up -w backend` | Starts DynamoDB Local, dynamodb-admin, cognito-local and a fake Claude in Docker and seeds them: table, pool, groups, users `admin` and `alice`. Idempotent. Drop `DYNAMODB_PORT` if port 8000 is free on your machine; whatever you choose, use the same value for every command below |
| `npm run local:api -w backend` | Builds the functions and serves the API on `http://127.0.0.1:3000` (foreground; wait for `Running on http://127.0.0.1:3000`) |
| `DYNAMODB_PORT=8002 npm run verify -w backend` | The deploy gate: typecheck, lint, audit, template lint, unit tests (of `backend` and `shared`), integration tests against the running local stack. On success writes `backend/.verify-ok` |
| `npm run deploy -w backend` | Refuses unless `backend/.verify-ok` is younger than 30 minutes, names the current commit and says `clean`, and the tree is still clean. Then `sam build` and `sam deploy` (asks to confirm the change set). Uses your real AWS login |
| `npm run smoke -w backend -- shared-calendar-api` | After every deploy of the API: creates a throw-away user, runs the journeys against the real API, sees a window not whole hours refused, books the slot of a window 03:05–04:05, books a custom time on the 5-minute step and sees one off the step refused, books a throw-away type of capacity 2 over its places with two more throw-away users, changes that user's own password at Cognito, deletes the users; at the stage of e-mail `on` it also checks an invitation and a mail: 65 checks, 62 at `off` and `domain`. Prompts for the admin password. `npm run smoke -w backend -- local` runs the same against the local stack, where the two checks of the sign-out everywhere say `SKIP` |
| `npm run deploy -w frontend` | Releases the page: behind the same gate as the back end's deploy, it runs the front end's own checks, reads the API's address and the app client from the stack `shared-calendar-api`, deploys the hosting's stack `shared-calendar-web` (asks to confirm a change set only when a resource of the hosting changes), builds, uploads the four files and ends with four checks against the page's address, PASS or FAIL each. Uses your real AWS login. `npm run deploy -w frontend -- --dry-run` goes as far as the build, says what it would do and changes nothing. The procedure, and the order of the two deployments: `docs/RUNBOOK.md` section 2, step 6 |
| `npm run local:down -w backend` | Stops the Docker stack. The table is in memory and is lost; Cognito data survives in `backend/.cognito/` |

`npm run typecheck`, `npm run lint` and `npm run test:unit` at the root cover every package.
Everything else (`bootstrap-admin`, `budget`, and the notes that go with each command) is
listed in `docs/COMMANDS.md`. The first deployment of a new stack is different
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
| Week (`#/week`) | both | The week, with "previous", "Today" and "next". A slot says its places ("2 of 3 places left" when its type holds more than one person). A free slot opens the book dialog (a note; the Administrator also chooses the User and other times inside the slot's window). The Administrator also sees the full slots and may book one over the capacity with "Book anyway"; appointments at the same time stand side by side, four or more as one block that lists them. An appointment opens its detail: the note, "Change" (the next free slot clicked, in any week, is the new time) and "Cancel appointment", offered when the rules allow them |
| My appointments (`#/appointments`) | User | The upcoming appointments, or all those of a period, each with its status; a row opens the same detail |
| Settings (`#/settings`) | Administrator | The cancellation notice, the booking notice, the booking horizon and the maximum of upcoming appointments |
| Users (`#/users`) | Administrator | The list, a form that creates a user and shows the generated password once, a "Delete" per row that asks first |
| Availability (`#/availability`) | Administrator | The availability types, each with its capacity (how many people at the same time, 1 to 100), the weekly patterns, and a single date: its own windows ("This day only…"), "Not available on this day", extra windows. A change that would leave a booked appointment outside the hours open for booking is refused and lists the appointments in the way |
| The assistant's panel | both, under every screen | A conversation in English or Italian (the first message's language, else the page's): questions about the calendar, and changes the assistant proposes and the person confirms with a button. Up to 30 messages a day per person; each conversation runs out a day after its last message |
| Password (`#/password`) | both, last link | The change of one's own password: the current one, the new one twice, with what the new one still misses said under it while typing. After a change the person is signed out everywhere and the login says "Password changed." |

Good to know: the week is loaded again after every write and every time the browser's tab
becomes visible again; a reload of the page signs out, since the session is kept in memory
only; an edit to `frontend/src`, `frontend/index.html` or `frontend/style.css` shows after a
reload. The dev server passes the page's calls on to the local API and to cognito-local; it is
for local work only. The deployed page ("The deployed stacks" above) is the same page, built
once and served by CloudFront, which passes its calls on to the real API
(`docs/FRONTEND_ARCHITECTURE.md` section 13).

The sign-in screen has a list of languages; "My details" keeps the chosen one in the account.
`http://localhost:5173/?padded` shows the page in a test language where every text is between
⟦ ⟧, so a word written straight into the code stands out (`docs/COMMANDS.md` section 5).

**To check every screen after a change**: `docs/FRONTEND_WALK.md`, one list of checks to do
by hand in the browser, as `alice` and as `admin`, from a fresh, seeded local stack.

Layout: `backend/` holds `src/handlers/` (one Lambda per file), `src/lib/` (the only code that
touches the AWS SDK), `src/assistant/` (the assistant's core), `tests/`, `scripts/`, `template.yaml` and `docker-compose.yml`; `shared/src/`
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
permanent: the user signs in with it right away, no first-login change. Each person, User or
Administrator, may change their own password on the page's "Password" screen, knowing the
current one; nobody can change someone else's. There is no reset of a lost password: a user who
loses it is deleted and recreated (`docs/ARCHITECTURE.md` section 7.4; what to tell a person:
`docs/RUNBOOK.md` section 6). Deleting a user signs
them out everywhere and removes the account; their messages stay in the table as history.
The API can never create an administrator, delete one, or set its password.

## Looking at the data and the logs

- **Locally:** the table in a browser at `http://localhost:8001` (dynamodb-admin); the
  functions' log lines in the `npm run local:api -w backend` terminal.
- **Cloud:** DynamoDB → `shared-calendar-api-hello-messages` → Explore items, in the console
  (region `eu-north-1`). Logs in CloudWatch: `/aws/lambda/shared-calendar-api-<function>` for
  each function (`authorizer`, `hello`, the users', the calendar's and the assistant's), and `/aws/apigateway/shared-calendar-api-access`
  for one line per request. Each function writes one structured JSON line per request with the
  request id, route, username, role, outcome and duration, never a token, a password or a text
of a conversation with the assistant.

## The administrator's password

`npm run bootstrap-admin -w backend -- shared-calendar-api` sets or rotates the admin password of the deployed
stack (typed twice, hidden; checked against the pool policy: 12+ characters with upper, lower,
digit and symbol). It is the way back from a lost admin password; the Administrator can also
change a known one on the page's "Password" screen. The API never touches admin accounts.
`npm run bootstrap-admin -w backend -- local` does the same against the emulator; after that,
run `DYNAMODB_PORT=8002 npm run local:up -w backend` again to restore `Admin-Local-Pass-1!`, or the
integration tests fail.

## Security in one paragraph

There is no secret in the repository, and one in the cloud: the Anthropic API key, an encrypted
parameter in Parameter Store that the operator stores and rotates with
`npm run assistant-key -w backend -- shared-calendar-api` (`docs/RUNBOOK.md` section 3.2) and
that only the three functions asking Claude may read. Otherwise the functions use IAM roles,
token verification uses Cognito's public keys, and the only password-like values are the two
local emulator accounts. Each function has its own IAM role limited to the exact actions it
needs on the one pool or table it uses, with no wildcard. Every request is verified by a Lambda
authorizer, and every handler checks the role again. Tokens, passwords, the create-user
response and the text of a conversation never reach the logs. The assistant changes the calendar
only when the person presses the button of a proposal the server worded, and what a person
writes to it is sent to Anthropic (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 10.2). The alert e-mail address is a stack parameter passed once on the
first deploy and is never written into `backend/samconfig.toml`, because this repository is public.
