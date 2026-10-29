#!/usr/bin/env bash
# Post-deploy smoke test (architecture 9.3): journeys 3, 4, 6 and 11 of plan step 9 with a
# throw-away user smoke-<timestamp>. Prints PASS or FAIL per check; exits 1 if any check failed.
#
#   npm run smoke <stack-name>   the deployed stack, your AWS login (run after every deploy)
#   npm run smoke local          the local stack (local:up + local:api; pass DYNAMODB_PORT)
#
# Locally the global sign-out on delete is skipped (SKIP_GLOBAL_SIGN_OUT), so only the cloud run
# exercises refresh-token revocation; both prove that the deleted user can no longer sign in.
#
# Tokens and passwords stay in shell variables and travel through pipes only: never printed,
# never command-line arguments, never written to disk. The throw-away user is deleted on every
# exit, also after a failed check or Ctrl-C. Its message row stays (history is kept by design).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 1 ]] || die "usage: npm run smoke <stack-name|local>"
load_target "$1"

SMOKE_USER="smoke-$(date +%s)"
failures=0
created=false # POST /users was sent: the user may exist
deleted=false # DELETE /users/{username} answered 204: nothing left to clean up

pass() { echo "PASS  $*"; }
fail() {
  echo "FAIL  $*"
  failures=$((failures + 1))
}

# Removes the throw-away user straight in Cognito if the API did not delete it.
cleanup() {
  local status=$? err
  if [[ "$created" == true && "$deleted" == false ]]; then
    if err=$(idp admin-delete-user --user-pool-id "$POOL_ID" --username "$SMOKE_USER" 2>&1); then
      echo "cleanup: $SMOKE_USER deleted directly in Cognito"
    elif [[ "$err" == *UserNotFoundException* ]]; then
      echo "cleanup: $SMOKE_USER does not exist, nothing to delete"
    else
      echo "CLEANUP FAILED: $SMOKE_USER may still exist in pool $POOL_ID; delete it in the Cognito console." >&2
      echo "  $err" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# sign_in <username>: password on stdin, access token on stdout. Fails on a Cognito error (printed
# to stderr) and when Cognito answers with a challenge instead of tokens.
sign_in() { cognito sign-in "$CLIENT_ID" "$1"; }

# api <method> <path> <token> [json body]: sets STATUS and BODY. The token reaches curl on stdin
# as a header (-H @-), never as an argument. STATUS is 000 when the API cannot be reached.
api() {
  local response
  response=$(printf 'Authorization: Bearer %s\n' "$3" |
    curl -sS --max-time 60 -X "$1" -H @- -H 'Content-Type: application/json' \
      ${4:+--data "$4"} -w '\n%{http_code}' "$API_URL$2") || { STATUS=000; BODY=""; return 0; }
  STATUS=${response##*$'\n'}
  BODY=${response%$'\n'*}
}

# field <name>: a string field of the API answer in BODY (see json_field in target.sh).
field() { printf '%s' "$BODY" | json_field "$1"; }

# The error code of an API answer, safe to print (never the body itself: it may hold a password).
error_code() {
  local code
  code=$(field error)
  printf '%s' "${code:-$(field message)}"
}

# hello_message_id <role> <message>: the messageId of the /hello answer in BODY if it has that
# role and message, otherwise nothing.
hello_message_id() {
  [[ "$(field role)" == "$1" && "$(field message)" == "$2" ]] || return 0
  field messageId
}

# check_row <messageId> <userName> <role>: the row the API wrote, read straight from DynamoDB.
check_row() {
  local row user role user_id
  row=$(ddb get-item --table-name "$TABLE_NAME" --key "{\"messageId\": {\"S\": \"$1\"}}" \
    --query 'Item.[userName.S, role.S, userId.S]' --output text 2>/dev/null) || return 1
  read -r user role user_id <<< "$row"
  [[ "$user" == "$2" && "$role" == "$3" && -n "$user_id" && "$user_id" != None ]]
}

IFS= read -rs -p "Password of $ADMIN_USERNAME: " admin_password || die "no password entered."
echo >&2
echo "Smoke test of $1 ($API_URL) with throw-away user $SMOKE_USER"
echo

if admin_token=$(printf '%s' "$admin_password" | sign_in "$ADMIN_USERNAME"); then
  pass "sign-in as $ADMIN_USERNAME"
else
  fail "sign-in as $ADMIN_USERNAME (nothing else can run)"
  exit 1
fi
unset admin_password

# Journey 4: /hello as the Administrator.
api POST /hello "$admin_token"
admin_message_id=$(hello_message_id admin "Hello World, the Administrator is speaking")
if [[ "$STATUS" == 201 && -n "$admin_message_id" ]]; then
  pass "journey 4: /hello as $ADMIN_USERNAME -> 201, Administrator message"
else
  fail "journey 4: /hello as $ADMIN_USERNAME -> $STATUS $BODY"
fi

# Journey 6: create the throw-away user, sign in as it, /hello as it (journey 3).
created=true
api POST /users "$admin_token" "{\"username\": \"$SMOKE_USER\"}"
user_password=""
if [[ "$(field username)" == "$SMOKE_USER" ]]; then user_password=$(field password); fi
if [[ "$STATUS" == 201 && -n "$user_password" ]]; then
  pass "journey 6: POST /users $SMOKE_USER -> 201 with a password"
else
  fail "journey 6: POST /users $SMOKE_USER -> $STATUS $(error_code)"
fi
BODY=""

user_token=""
if [[ -n "$user_password" ]]; then
  if user_token=$(printf '%s' "$user_password" | sign_in "$SMOKE_USER"); then
    pass "journey 6: sign-in as $SMOKE_USER, no challenge"
  else
    user_token=""
    fail "journey 6: sign-in as $SMOKE_USER"
  fi
fi

user_message_id=""
if [[ -n "$user_token" ]]; then
  api POST /hello "$user_token"
  user_message_id=$(hello_message_id user "Hello World, I am $SMOKE_USER")
  if [[ "$STATUS" == 201 && -n "$user_message_id" ]]; then
    pass "journey 3: /hello as $SMOKE_USER -> 201, 'Hello World, I am $SMOKE_USER'"
  else
    fail "journey 3: /hello as $SMOKE_USER -> $STATUS $BODY"
  fi
fi

# Both rows in DynamoDB (architecture 9.3).
if [[ -n "$admin_message_id" ]]; then
  if check_row "$admin_message_id" "$ADMIN_USERNAME" admin; then
    pass "row $admin_message_id in $TABLE_NAME ($ADMIN_USERNAME, admin)"
  else
    fail "row $admin_message_id missing or wrong in $TABLE_NAME"
  fi
fi
if [[ -n "$user_message_id" ]]; then
  if check_row "$user_message_id" "$SMOKE_USER" user; then
    pass "row $user_message_id in $TABLE_NAME ($SMOKE_USER, user)"
  else
    fail "row $user_message_id missing or wrong in $TABLE_NAME"
  fi
fi

# Journey 11: delete the throw-away user; it can no longer sign in; its message row stays.
api DELETE "/users/$SMOKE_USER" "$admin_token"
if [[ "$STATUS" == 204 ]]; then
  deleted=true
  pass "journey 11: DELETE /users/$SMOKE_USER -> 204"
else
  fail "journey 11: DELETE /users/$SMOKE_USER -> $STATUS $(error_code)"
fi

if [[ "$deleted" == true && -n "$user_password" ]]; then
  if err=$(printf '%s' "$user_password" | sign_in "$SMOKE_USER" 2>&1 >/dev/null); then
    fail "journey 11: sign-in as the deleted $SMOKE_USER still works"
  elif [[ "$err" == *NotAuthorizedException* || "$err" == *UserNotFoundException* ]]; then
    pass "journey 11: sign-in as the deleted $SMOKE_USER fails"
  else
    fail "journey 11: sign-in as the deleted $SMOKE_USER fails for an unexpected reason: $err"
  fi
fi
if [[ "$deleted" == true && -n "$user_message_id" ]]; then
  if check_row "$user_message_id" "$SMOKE_USER" user; then
    pass "journey 11: row $user_message_id of the deleted $SMOKE_USER is kept"
  else
    fail "journey 11: row $user_message_id of the deleted $SMOKE_USER is gone"
  fi
fi
unset admin_token user_token user_password

echo
if (( failures > 0 )); then
  echo "Smoke test FAILED: $failures check(s)."
  exit 1
fi
echo "Smoke test PASSED."
