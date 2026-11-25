#!/usr/bin/env bash
# Sets or rotates the Administrator's password (docs/ARCHITECTURE.md section 6.1), the only way to
# do so: the API never sets an administrator's password. With it, the Administrator's four facts
# (docs/EMAIL_ARCHITECTURE.md section 5.4): first name, last name, e-mail and postal address, or
# they are kept as they are when the first name is left empty. It never creates a user or changes
# a group.
#
#   npm run bootstrap-admin <stack-name>   the deployed stack (user AdminUsername), your AWS login
#   npm run bootstrap-admin local          cognito-local (user admin)
#
# The password is typed twice without echo and checked against the pool policy before Cognito is
# called. It is never printed, never written to disk and never a command-line argument (which ps
# would show): it travels through a pipe to scripts/cognito.mjs. The facts travel the same way;
# they are set first, so that a fact refused leaves the password as it was.
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
problems=$(printf '%s\n' "$password" | password_problems)
[[ -z "$problems" ]] || die "the password does not meet the pool policy. It needs:${problems}. Nothing was changed."

echo "Your details, as the daily e-mail and \"My details\" use them. Leave the first name empty to keep them."
IFS= read -r -p "First name: " given_name || given_name=""
if [[ -n "$given_name" ]]; then
  IFS= read -r -p "Last name: " family_name || die "no last name entered. Nothing was changed."
  IFS= read -r -p "E-mail: " email || die "no e-mail entered. Nothing was changed."
  echo "Postal address, one line at a time; an empty line ends it."
  address=""
  while IFS= read -r -p "> " line && [[ -n "$line" ]]; do
    address+="$line"$'\n'
  done
  printf '%s\n%s\n%s\n%s' "$given_name" "$family_name" "$email" "$address" | cognito set-profile "$POOL_ID" "$ADMIN_USERNAME" ||
    die "the details were refused (message above). Nothing was changed."
  unset family_name email address line
  echo "Details of $ADMIN_USERNAME set."
fi
unset given_name

printf '%s' "$password" | cognito set-password "$POOL_ID" "$ADMIN_USERNAME" ||
  die "Cognito refused (message above). The password was not changed."
unset password

echo "Password of $ADMIN_USERNAME set. Sign in with it to check."
