#!/usr/bin/env bash
# Sets or rotates the Administrator's password (architecture 6.1), the only way to do so: the API
# never touches admin accounts. It only sets the password; it never creates a user or changes a
# group.
#
#   npm run bootstrap-admin <stack-name>   the deployed stack (user AdminUsername), your AWS login
#   npm run bootstrap-admin local          cognito-local (user admin)
#
# The password is typed twice without echo and checked against the pool policy before Cognito is
# called. It is never printed, never written to disk and never a command-line argument (which ps
# would show): it travels through a pipe to scripts/cognito.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 1 ]] || die "usage: npm run bootstrap-admin <stack-name|local>"
load_target "$1"

echo "Setting the permanent password of $ADMIN_USERNAME in user pool $POOL_ID ($1)."
IFS= read -rs -p "New password: " password || die "no password entered."
echo >&2
IFS= read -rs -p "Repeat it: " again || die "no password entered."
echo >&2
[[ "$password" == "$again" ]] || die "the two entries differ. Nothing was changed."
unset again

# The pool policy (template.yaml), checked here for a clear message. Cognito has the last word.
problems=""
(( ${#password} >= 12 )) || problems+=" at least 12 characters;"
[[ "$password" =~ [[:upper:]] ]] || problems+=" an upper-case letter;"
[[ "$password" =~ [[:lower:]] ]] || problems+=" a lower-case letter;"
[[ "$password" =~ [[:digit:]] ]] || problems+=" a digit;"
[[ "$password" =~ [^[:alnum:]] ]] || problems+=" a symbol;"
[[ ! "$password" =~ [[:cntrl:]] ]] || problems+=" no control characters;"
[[ "$password" != " "* && "$password" != *" " ]] || problems+=" no space at the start or end;"
[[ -z "$problems" ]] || die "the password does not meet the pool policy. It needs:${problems%;}. Nothing was changed."

printf '%s' "$password" | cognito set-password "$POOL_ID" "$ADMIN_USERNAME" ||
  die "Cognito refused (message above). The password was not changed."
unset password

echo "Password of $ADMIN_USERNAME set. Sign in with it to check."
