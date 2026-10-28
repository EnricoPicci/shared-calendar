#!/usr/bin/env bash
# Prepares the local emulators started by docker-compose.yml. Safe to run any number of times:
# every step first checks whether its object already exists.
#
#   1. table hello-messages on DynamoDB Local (same key schema as template.yaml)
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

wait_for "DynamoDB Local ($DYNAMODB_URL)" ddb list-tables
wait_for "cognito-local ($COGNITO_URL)" idp list-user-pools --max-results 1

# 1. Table
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
cat > env.local.json <<EOF
{
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
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  }
}
EOF
echo "env.local.json: written (pool $POOL_ID, client $CLIENT_ID)"
echo
echo "Local stack ready. DB browser: http://localhost:8001"
