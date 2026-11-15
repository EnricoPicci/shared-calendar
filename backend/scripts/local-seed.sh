#!/usr/bin/env bash
# Prepares the local emulators started by docker-compose.yml. Safe to run any number of times:
# every step first checks whether its object already exists.
#
#   1. tables hello-messages and calendar on DynamoDB Local (same key schemas as template.yaml)
#   2. user pool local_pool and app client local_client on cognito-local
#   3. groups admin and user
#   4. user admin (group admin) and user alice (group user), permanent passwords
#   5. env.local.json with the generated pool and client ids, for sam local
#
# Runs on the host, so it reaches the emulators on localhost. The Lambda containers reach them
# by service name (dynamodb, cognito) instead, which is what env.local.json contains.
set -euo pipefail
cd "$(dirname "$0")/.."

DYNAMODB_URL="http://localhost:${DYNAMODB_PORT:-8000}"
COGNITO_URL="http://localhost:9229"
TABLE_NAME="hello-messages"
CALENDAR_TABLE="calendar"
POOL_NAME="local_pool"
CLIENT_NAME="local_client"
ADMIN_PASSWORD="Admin-Local-Pass-1!"
ALICE_PASSWORD="Alice-Local-Pass-1!"

# Dummy credentials: the emulators accept anything, and this keeps the AWS CLI away from the
# real AWS account configured on this machine.
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-west-1 AWS_PAGER=""
unset AWS_PROFILE AWS_SESSION_TOKEN

ddb() { aws dynamodb --endpoint-url "$DYNAMODB_URL" "$@"; }
idp() { aws cognito-idp --endpoint-url "$COGNITO_URL" "$@"; }

wait_for() {
  local name=$1; shift
  for _ in $(seq 1 30); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "ERROR: $name did not answer within 30 s. Is the Docker stack running (docker compose ps)?" >&2
  exit 1
}

# Makes sure localhost:<port> really is this project's container, attached to hello-local.
# When another project already holds the port, Docker can leave our container running with
# no port and no network: the seed would then fill the other project's emulator, and the
# Lambda containers could not reach ours by name.
check_service() {
  local service=$1 container_port=$2 host_port=$3 id published networks
  id=$(docker compose ps -q "$service" 2>/dev/null || true)
  if [[ -z "$id" ]]; then
    echo "ERROR: the $service container of this project is not running (docker compose ps)." >&2
    exit 1
  fi
  published=$(docker compose port "$service" "$container_port" 2>/dev/null || true)
  networks=$(docker inspect "$id" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}')
  if [[ "$published" != "127.0.0.1:$host_port" || " $networks" != *" hello-local "* ]]; then
    echo "ERROR: localhost:$host_port is not this project's $service container" >&2
    networks=${networks% }
    echo "       (published: '${published:-none}', networks: '${networks:-none}')." >&2
    echo "       Another container probably holds port $host_port (docker ps). Run npm run local:down," >&2
    if [[ "$service" == dynamodb ]]; then
      echo "       then DYNAMODB_PORT=8002 npm run local:up (or another free port)." >&2
    else
      echo "       free port $host_port, then npm run local:up." >&2
    fi
    exit 1
  fi
}
check_service dynamodb 8000 "${DYNAMODB_PORT:-8000}"
check_service cognito 9229 9229

wait_for "DynamoDB Local ($DYNAMODB_URL)" ddb list-tables
wait_for "cognito-local ($COGNITO_URL)" idp list-user-pools --max-results 1

# 1. Tables. The calendar table starts empty: until the Administrator saves settings, the
# defaults apply (docs/SHARED_CALENDAR_SPEC.md R-SET-01). The calendar journeys empty it at their
# start.
if ddb describe-table --table-name "$TABLE_NAME" >/dev/null 2>&1; then
  echo "table $TABLE_NAME: exists"
else
  ddb create-table \
    --table-name "$TABLE_NAME" \
    --attribute-definitions AttributeName=messageId,AttributeType=S \
    --key-schema AttributeName=messageId,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 >/dev/null
  echo "table $TABLE_NAME: created"
fi

if ddb describe-table --table-name "$CALENDAR_TABLE" >/dev/null 2>&1; then
  echo "table $CALENDAR_TABLE: exists"
else
  ddb create-table \
    --table-name "$CALENDAR_TABLE" \
    --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
    --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=10 >/dev/null
  echo "table $CALENDAR_TABLE: created"
fi

# 2. User pool and app client
POOL_ID=$(idp list-user-pools --max-results 60 --query "UserPools[?Name=='$POOL_NAME'].Id | [0]" --output text)
if [[ "$POOL_ID" == "None" || -z "$POOL_ID" ]]; then
  POOL_ID=$(idp create-user-pool --pool-name "$POOL_NAME" \
    --policies 'PasswordPolicy={MinimumLength=12,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true}' \
    --query UserPool.Id --output text)
  echo "user pool $POOL_NAME: created ($POOL_ID)"
else
  echo "user pool $POOL_NAME: exists ($POOL_ID)"
fi

CLIENT_ID=$(idp list-user-pool-clients --user-pool-id "$POOL_ID" --max-results 60 \
  --query "UserPoolClients[?ClientName=='$CLIENT_NAME'].ClientId | [0]" --output text)
if [[ "$CLIENT_ID" == "None" || -z "$CLIENT_ID" ]]; then
  CLIENT_ID=$(idp create-user-pool-client --user-pool-id "$POOL_ID" --client-name "$CLIENT_NAME" \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --query UserPoolClient.ClientId --output text)
  echo "app client $CLIENT_NAME: created ($CLIENT_ID)"
else
  echo "app client $CLIENT_NAME: exists ($CLIENT_ID)"
fi

# 3. Groups
for group in admin user; do
  if idp get-group --user-pool-id "$POOL_ID" --group-name "$group" >/dev/null 2>&1; then
    echo "group $group: exists"
  else
    idp create-group --user-pool-id "$POOL_ID" --group-name "$group" >/dev/null
    echo "group $group: created"
  fi
done

# 4. Users. The password is (re)set as permanent on every run, so it is always the known one.
ensure_user() {
  local username=$1 password=$2 group=$3
  if idp admin-get-user --user-pool-id "$POOL_ID" --username "$username" >/dev/null 2>&1; then
    echo "user $username: exists"
  else
    idp admin-create-user --user-pool-id "$POOL_ID" --username "$username" --message-action SUPPRESS >/dev/null
    echo "user $username: created"
  fi
  idp admin-set-user-password --user-pool-id "$POOL_ID" --username "$username" \
    --password "$password" --permanent
  idp admin-add-user-to-group --user-pool-id "$POOL_ID" --username "$username" --group-name "$group"
}
ensure_user admin "$ADMIN_PASSWORD" admin
ensure_user alice "$ALICE_PASSWORD" user

# 5. Environment for sam local. Lambda containers use service names; the token issuer is the
# address the tokens were requested from (the host), hence localhost in COGNITO_ISSUER.
# SKIP_GLOBAL_SIGN_OUT: cognito-local does not implement AdminUserGlobalSignOut and answers
# "Unsupported", which would make every local DELETE /users/{username} fail with 500. The
# deleteUser function skips that one call locally; in the cloud the variable stays empty and
# the sign-out runs (see globalSignOut in src/lib/cognito.ts).
# "Parameters" applies to every function that declares the variable in template.yaml, so each new
# calendar function needs no section of its own. CALENDAR_TIME_ZONE is deliberately absent: a value
# here would win over the template, and the CalendarTimeZone parameter (default Europe/Rome, or
# --parameter-overrides) must stay its one source. The one exception is BookAppointmentFunction,
# which also calls Cognito (the Administrator books for a User): it gets the pool, the emulator's
# address and the dummy credentials in a section of its own, like CreateUserFunction.
# DeleteUserFunction also declares the calendar variables (it cancels the deleted user's
# appointments, docs/SHARED_CALENDAR_SPEC.md section 10.2) and gets the table and the endpoint from
# "Parameters" too, beside its own section. ListUsersFunction reads Cognito only.
cat > env.local.json <<EOF
{
  "Parameters": {
    "CALENDAR_TABLE": "$CALENDAR_TABLE",
    "DYNAMODB_ENDPOINT": "http://dynamodb:8000"
  },
  "AuthorizerFunction": {
    "USER_POOL_ID": "$POOL_ID",
    "CLIENT_ID": "$CLIENT_ID",
    "JWKS_URI": "http://cognito:9229/$POOL_ID/.well-known/jwks.json",
    "COGNITO_ISSUER": "http://localhost:9229/$POOL_ID",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  },
  "HelloFunction": {
    "MESSAGES_TABLE": "$TABLE_NAME",
    "DYNAMODB_ENDPOINT": "http://dynamodb:8000",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  },
  "CreateUserFunction": {
    "USER_POOL_ID": "$POOL_ID",
    "COGNITO_ENDPOINT": "http://cognito:9229",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  },
  "DeleteUserFunction": {
    "USER_POOL_ID": "$POOL_ID",
    "COGNITO_ENDPOINT": "http://cognito:9229",
    "SKIP_GLOBAL_SIGN_OUT": "true",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  },
  "BookAppointmentFunction": {
    "USER_POOL_ID": "$POOL_ID",
    "COGNITO_ENDPOINT": "http://cognito:9229",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  },
  "ListUsersFunction": {
    "USER_POOL_ID": "$POOL_ID",
    "COGNITO_ENDPOINT": "http://cognito:9229",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  }
}
EOF
echo "env.local.json: written (pool $POOL_ID, client $CLIENT_ID)"
echo
echo "Local stack ready. DB browser: http://localhost:8001"
