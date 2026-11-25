#!/usr/bin/env bash
# Runs the mailer once by hand on the local stack (docs/EMAIL_ARCHITECTURE.md section 14.2):
#
#   npm run mail:send -w backend -- <calendar|mine> <username> <from> <to>
#
# calendar: the whole calendar from <from> to <to> (local dates, YYYY-MM-DD), to an Administrator;
# mine: a User's own appointments. The mail goes to the account's own address, as from the page,
# and lands in the fake mail (http://localhost:8025). The person's `sub` and role are read in
# cognito-local; the mailer itself checks the rest (the range, the address) and says what it did.
# Unlike the route, nothing is counted: this is a tool of the laptop, not a request of a person.
#
# Needs npm run local:up, local:api (for the build) and local:lambda. Local only: it talks to
# cognito-local and to sam local start-lambda on 127.0.0.1:3001, never to AWS.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -ne 4 ]]; then
  echo "Usage: npm run mail:send -w backend -- <calendar|mine> <username> <from YYYY-MM-DD> <to YYYY-MM-DD>" >&2
  exit 1
fi
kind=$1 username=$2 from=$3 to=$4
if [[ "$kind" != calendar && "$kind" != mine ]]; then
  echo "ERROR: the kind is calendar (an Administrator's) or mine (a User's), not '$kind'." >&2
  exit 1
fi
if [[ ! "$username" =~ ^[a-z0-9][a-z0-9._-]{2,31}$ ]]; then
  echo "ERROR: '$username' is not a username." >&2
  exit 1
fi
if [[ ! -f env.local.json ]]; then
  echo "ERROR: env.local.json is missing. Run 'npm run local:up' first." >&2
  exit 1
fi

# Dummy credentials: the emulator accepts anything, and this keeps the AWS CLI away from the real
# AWS account configured on this machine.
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-west-1 AWS_PAGER=""
unset AWS_PROFILE AWS_SESSION_TOKEN
idp() { aws cognito-idp --endpoint-url http://localhost:9229 "$@"; }

pool=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("env.local.json", "utf8")).AuthorizerFunction.USER_POOL_ID)')
if ! sub=$(idp admin-get-user --user-pool-id "$pool" --username "$username" \
  --query "UserAttributes[?Name=='sub'].Value | [0]" --output text 2>/dev/null); then
  echo "ERROR: no account '$username' in cognito-local." >&2
  exit 1
fi
groups=$(idp admin-list-groups-for-user --user-pool-id "$pool" --username "$username" --query 'Groups[].GroupName' --output text)
# The role as the API resolves it: admin wins over user (docs/ARCHITECTURE.md section 3).
role=""
[[ " $groups " == *" user "* ]] && role=user
[[ " $groups " == *" admin "* ]] && role=admin
if [[ -z "$role" ]]; then
  echo "ERROR: '$username' is in neither group admin nor user." >&2
  exit 1
fi
if [[ "$kind" == calendar && "$role" != admin ]] || [[ "$kind" == mine && "$role" != user ]]; then
  echo "ERROR: '$username' is $role: the kind calendar is an Administrator's, mine a User's." >&2
  exit 1
fi

# The mailer's event (docs/EMAIL_ARCHITECTURE.md section 6.1), never an address, written by node so
# that every value is quoted as JSON.
event=$(node -e 'const [kind, sub, username, role, from, to] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({ kind, sub, username, role, from, to, requestId: `by-hand-${Date.now()}` }));' \
  "$kind" "$sub" "$username" "$role" "$from" "$to")

# A synchronous invoke, so that the answer is the mailer's own result once the mail is in the fake.
if ! result=$(curl -sS --fail-with-body -X POST -H 'content-type: application/json' --data "$event" \
  http://127.0.0.1:3001/2015-03-31/functions/MailerFunction/invocations); then
  echo "ERROR: the mailer could not be run. Is 'npm run local:lambda' running? Its terminal says why." >&2
  echo "$result" >&2
  exit 1
fi
echo "The mailer answered: $result"
echo "The mails: http://localhost:8025"
