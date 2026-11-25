#!/usr/bin/env bash
# Makes one User for the operator to try the User's side of the page with, straight in Cognito,
# with a temporary password (docs/EMAIL_ARCHITECTURE.md section 5.4): at the first sign-in the page
# asks for a password of the person's own, on the screen "Choose your password". The User is in
# group user and has the four facts; it stays until the operator deletes it in the Users page.
#
#   npm run test-user -w backend -- local <username>    cognito-local of npm run local:up
#
# Locally the four facts are made up from the username, as the integration journeys make them:
# the e-mail <username>@example.com (a domain kept for examples, so no mail reaches a person), a
# made-up name and address. Only the temporary password is asked for: typed twice without echo,
# checked against the pool policy, never printed, never written to disk and never a command-line
# argument (which ps would show): it travels through a pipe to scripts/cognito.mjs.
#
# An existing account of that name is refused, never changed. When a step after the creation
# fails, the account is deleted again, so that nothing half made is left.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 2 ]] || die "usage: npm run test-user -w backend -- local <username>"
[[ "$1" == local ]] ||
  die "only the target local exists: the target cloud comes with step m8 of docs/EMAIL_PLAN.md. Nothing was changed."
username=$2
# The username rule of shared/src/user.ts (USERNAME_PATTERN), written again: a script cannot import TypeScript.
[[ "$username" =~ ^[a-z0-9][a-z0-9._-]{2,31}$ ]] ||
  die "the username must be 3 to 32 characters: lower-case letters, digits, '.', '_' or '-', starting with a letter or a digit."
[[ "$username" != admin ]] || die "admin is the Administrator. Choose another username."
load_target "$1"

# Read-only: whether the name is taken. Any other error than "not found" stops here.
if output=$(idp admin-get-user --user-pool-id "$POOL_ID" --username "$username" 2>&1 >/dev/null); then
  die "$username exists already. Delete it in the Users page first, or choose another username. Nothing was changed."
fi
[[ "$output" == *UserNotFoundException* ]] || die "cannot read the user pool: $output"

echo "Making the User $username in user pool $POOL_ID ($1), with a temporary password."
IFS= read -rs -p "Temporary password: " password || die "no password entered."
echo >&2
IFS= read -rs -p "Repeat it: " again || die "no password entered."
echo >&2
[[ "$password" == "$again" ]] || die "the two entries differ. Nothing was changed."
unset again
problems=$(printf '%s\n' "$password" | password_problems)
[[ -z "$problems" ]] || die "the password does not meet the pool policy. It needs:${problems}. Nothing was changed."

# The account, without Cognito's own invitation (SUPPRESS): the password is the one typed above.
# The facts are made up, so they may travel as arguments, as JSON: the CLI's short form would
# split the address at its comma. The username rule above lets no quote into the JSON.
attributes='[{"Name":"given_name","Value":"Test"},{"Name":"family_name","Value":"User '"$username"'"},'
attributes+='{"Name":"email","Value":"'"$username"'@example.com"},{"Name":"email_verified","Value":"true"},'
attributes+='{"Name":"address","Value":"Via di Prova 1, 00100 Roma"}]'
idp admin-create-user --user-pool-id "$POOL_ID" --username "$username" --message-action SUPPRESS \
  --user-attributes "$attributes" >/dev/null ||
  die "Cognito refused to create $username (message above). Nothing was changed."

# From here on a failure deletes the account again.
undo() {
  idp admin-delete-user --user-pool-id "$POOL_ID" --username "$username" >/dev/null 2>&1 || true
  die "$1 The account $username was deleted again: nothing was kept."
}
idp admin-add-user-to-group --user-pool-id "$POOL_ID" --username "$username" --group-name user >/dev/null ||
  undo "Cognito refused to put $username in group user (message above)."
printf '%s' "$password" | cognito set-temporary-password "$POOL_ID" "$username" ||
  undo "Cognito refused the temporary password (message above)."
unset password

echo "User $username made, in group user, its password temporary. Sign in with it in the page:"
echo "it asks for a password of your own. Delete $username in the Users page when you are done."
