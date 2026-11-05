# Hello World API

A small serverless back end on AWS. Signed-in users call `POST /hello` and get a message
back that is also stored in a database; an administrator creates and deletes users. Two roles:
**user** (may call Hello World) and **admin** (may also create and delete users). Three routes:
`POST /hello`, `POST /users`, `DELETE /users/{username}`. TypeScript on AWS Lambda behind an
HTTP API, identities in Amazon Cognito, messages in DynamoDB, everything declared in one SAM
template and fully testable on a laptop before anything reaches the cloud.

This is v1 of the back end of a larger application. The repository is a monorepo: the back end
in `backend/`, the code it shares with the browser front end that will follow (the API contract
and the username rule) in `shared/`, and in `frontend/` the front end's services layer
(`LoginService`, `docs/FRONTEND_SERVICES.md`); the rest of the front end waits for its
architecture document.

Where the full story is:

| Document | What it answers |
|---|---|
| `docs/ARCHITECTURE.md` | What was built and why: API contract, data model, security, local stack, deployment |
| `docs/IMPLEMENTATION_PLAN.md` | In which order it was built, with an acceptance check per step |
| `docs/RUNBOOK.md` | What the operator does: daily start, updating the stack, deploying from scratch |
| `docs/AWS_ACCOUNTS.md` | Which AWS identity to sign in with, and why |
| `docs/FOLDER_STRUCTURE.md` | The monorepo layout (back end, front end, shared): which folder holds what, and how the pieces are built |
| `docs/FRONTEND_SERVICES.md` | The front end's services layer and its first service, `LoginService` (implemented in `frontend/src/services/`) |
| `CLAUDE.md` | Working rules and the complete list of commands |

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 (pinned in `.nvmrc`; run `nvm use`) | `node -v` |
| npm | bundled with Node | `npm -v` |
| git, curl | any current | `git --version`, `curl --version` |
| Docker with the Compose v2 plugin | current | `docker info`, `docker compose version` |
| AWS SAM CLI | ≥ 1.80 | `sam --version` |
| AWS CLI v2 | current | `aws --version` |

The AWS CLI is needed locally too: the seed script creates the local table, user pool and
users with it (against the emulators, with dummy credentials). No AWS account is needed until
you deploy.

**GitHub Codespaces only**, after every Codespace start: the legacy firewall drops traffic
between containers, and the authorizer then times out fetching the signing keys.

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT
```

## The deployed stack

| | |
|---|---|
| Stack | `hello-world-api` |
| Region | `eu-north-1` (the only region the AWS organization allows for regional services) |
| API | `https://nbari0mamc.execute-api.eu-north-1.amazonaws.com` |
| User pool | `eu-north-1_1DOUiHwSk` |
| App client | `2minh5iuva8dsk26pmdlljfmsd` |
| Table | `hello-messages` |
| CLI profile | `hello-admin` (IAM Identity Center) |

The three ids are not secrets; they come from `sam list stack-outputs --stack-name hello-world-api`.
To talk to the stack from the CLI: `export AWS_PROFILE=hello-admin`, and when the session has
expired `aws sso login --profile hello-admin --use-device-code` (`docs/AWS_ACCOUNTS.md`).

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
| `npm run smoke -w backend -- hello-world-api` | After every deploy: creates a throw-away user, runs the journeys against the real API, deletes the user. Prompts for the admin password. `npm run smoke -w backend -- local` runs the same against the local stack |
| `npm run local:down -w backend` | Stops the Docker stack. The table is in memory and is lost; Cognito data survives in `backend/.cognito/` |

`npm run typecheck`, `npm run lint` and `npm run test:unit` at the root cover every package.
Everything else (`bootstrap-admin`, `budget`, and the notes that go with each command) is
listed in `CLAUDE.md`, "Everyday commands". The first deployment of a new stack is different
(`npm run deploy -w backend -- --parameter-overrides AlertEmail=<address>`, then
`bootstrap-admin`, `smoke`, `budget`): `docs/RUNBOOK.md` section 3.

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

Cloud (same command, real pool; `AWS_PROFILE=hello-admin` exported as above):

```bash
read -rs -p "Password for admin: " PASSWORD; echo
TOKEN=$(aws cognito-idp initiate-auth --region eu-north-1 \
  --client-id 2minh5iuva8dsk26pmdlljfmsd --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=admin,PASSWORD="$PASSWORD" \
  --query AuthenticationResult.AccessToken --output text)
API=https://nbari0mamc.execute-api.eu-north-1.amazonaws.com
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
- **Cloud:** DynamoDB → `hello-messages` → Explore items, in the console (region
  `eu-north-1`). Logs in CloudWatch: `/aws/lambda/hello-world-api-<function>` for
  `authorizer`, `hello`, `createUser`, `deleteUser`, and `/aws/apigateway/hello-world-api-access`
  for one line per request. Each function writes one structured JSON line per request with the
  request id, route, username, role, outcome and duration, never a token or a password.

## The administrator's password

`npm run bootstrap-admin -w backend -- hello-world-api` sets or rotates the admin password of the deployed
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
