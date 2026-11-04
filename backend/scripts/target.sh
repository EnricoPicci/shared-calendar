# shellcheck shell=bash disable=SC2034 # sourced: the variables set here are used by the caller
# Sourced by bootstrap-admin.sh and smoke.sh. Resolves the target named on their command line:
#
#   local         the emulators of npm run local:up: ids from env.local.json, dummy credentials
#   <stack name>  a deployed stack: ids from its CloudFormation outputs, your AWS credentials
#
# load_target sets POOL_ID, CLIENT_ID, ADMIN_USERNAME, API_URL, TABLE_NAME, COGNITO_URL and
# DYNAMODB_URL (the last two empty for a stack: the AWS tools then use the real endpoints).
#
# Needs only what the project needs anyway (node, the AWS CLI, curl), so it runs unchanged on
# macOS and Linux. JSON is read with node or with the AWS CLI's --query, not with jq.

export AWS_PAGER=""

die() {
  echo "ERROR: $*" >&2
  exit 1
}

for tool in node aws curl; do
  command -v "$tool" >/dev/null || die "$tool is not installed (see the prerequisites, plan step 0)."
done

load_target() {
  local target=$1 name values
  if [[ "$target" == local ]]; then
    [[ -f env.local.json ]] || die "env.local.json is missing. Run 'npm run local:up' first."
    # Dummy credentials, as in local-seed.sh: keeps the AWS tools away from the real AWS account.
    export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-west-1
    unset AWS_PROFILE AWS_SESSION_TOKEN
    values=$(node -p 'const e = require("./env.local.json");
      [e.AuthorizerFunction.USER_POOL_ID, e.AuthorizerFunction.CLIENT_ID, e.HelloFunction.MESSAGES_TABLE].join(" ")')
    read -r POOL_ID CLIENT_ID TABLE_NAME <<< "$values"
    ADMIN_USERNAME="admin"
    API_URL=http://127.0.0.1:3000
    COGNITO_URL=http://localhost:9229
    DYNAMODB_URL="http://localhost:${DYNAMODB_PORT:-8000}"
  else
    # The stack lives in the region sam deploy used (samconfig.toml), unless AWS_REGION says otherwise.
    if [[ -z "${AWS_REGION:-}" ]]; then
      AWS_REGION=$(sed -n 's/^region = "\(.*\)"$/\1/p' samconfig.toml | head -n 1)
      export AWS_REGION
    fi
    # Read-only: describes the stack, changes nothing. A missing output comes back as None.
    # shellcheck disable=SC2016 # the backticks are JMESPath string literals, not shell
    values=$(aws cloudformation describe-stacks --stack-name "$target" --output text --query 'Stacks[0].[
        Outputs[?OutputKey==`UserPoolId`].OutputValue | [0],
        Outputs[?OutputKey==`UserPoolClientId`].OutputValue | [0],
        Outputs[?OutputKey==`MessagesTableName`].OutputValue | [0],
        Outputs[?OutputKey==`ApiUrl`].OutputValue | [0],
        Parameters[?ParameterKey==`AdminUsername`].ParameterValue | [0]]') ||
      die "cannot read stack $target in $AWS_REGION (stack name, region, AWS login?)."
    read -r POOL_ID CLIENT_ID TABLE_NAME API_URL ADMIN_USERNAME <<< "$values"
    COGNITO_URL=""
    DYNAMODB_URL=""
  fi
  for name in POOL_ID CLIENT_ID TABLE_NAME API_URL ADMIN_USERNAME; do
    [[ -n "${!name}" && "${!name}" != None && "${!name}" != undefined ]] || die "$name not found for target $target."
  done
}

# The AWS CLI for calls that carry no secret, pointed at the emulators for the local target.
idp() { aws cognito-idp ${COGNITO_URL:+--endpoint-url "$COGNITO_URL"} "$@"; }
ddb() { aws dynamodb ${DYNAMODB_URL:+--endpoint-url "$DYNAMODB_URL"} "$@"; }

# cognito <sign-in|set-password> <clientId|poolId> <username>: password on stdin. See cognito.mjs.
cognito() { COGNITO_URL="$COGNITO_URL" node scripts/cognito.mjs "$@"; }

# json_field <name>: the string field <name> of the JSON object on stdin, or nothing (also for
# input that is not JSON). Reads stdin, so it is safe for answers that hold a password.
json_field() {
  node -e 'try {
    const value = JSON.parse(require("fs").readFileSync(0, "utf8"))[process.argv[1]];
    if (typeof value === "string") process.stdout.write(value);
  } catch {}' "$1"
}
