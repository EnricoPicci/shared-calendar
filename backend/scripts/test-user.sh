#!/usr/bin/env bash
# Makes one User for the operator to try the User's side of the page with, straight in Cognito,
# with a temporary password (docs/EMAIL_ARCHITECTURE.md section 5.4): at the first sign-in the page
# asks for a password of the person's own, on the screen "Choose your password". The User is in
# group user and has the four facts; it stays until the operator deletes it in the Users page.
#
#   npm run test-user -w backend -- local <username>    cognito-local of npm run local:up
#   npm run test-user -w backend -- cloud <username>    the stack of samconfig.toml, your AWS login
#
# The name and the address are made up from the username, as the integration journeys make them.
# The e-mail: locally <username>@example.com (a domain kept for examples, so no mail reaches a
# person); in the cloud the operator's own, asked for here, so that the calendar's mails to this
# User reach the operator (docs/EMAIL_PLAN.md finding F15). The address is typed, kept in a
# variable and never written to a file of the repository. The temporary password is typed twice
# without echo, checked against the pool policy, never printed, never written to disk and never a
# command-line argument (which ps would show): it travels through a pipe to scripts/cognito.mjs.
# This is the one account whose first password the operator chooses: every other User gets
# Cognito's, by e-mail (root CLAUDE.md, "Hard rules from the design").
#
# An existing account of that name is refused, never changed. When a step after the creation
# fails, the account is deleted again, so that nothing half made is left.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 2 ]] || die "usage: npm run test-user -w backend -- <local|cloud> <username>"
[[ "$1" == local || "$1" == cloud ]] || die "the target is local or cloud, not $1. Nothing was changed."
username=$2
# The username rule of shared/src/user.ts (USERNAME_PATTERN), written again: a script cannot import TypeScript.
[[ "$username" =~ ^[a-z0-9][a-z0-9._-]{2,31}$ ]] ||
  die "the username must be 3 to 32 characters: lower-case letters, digits, '.', '_' or '-', starting with a letter or a digit."
[[ "$username" != admin ]] || die "admin is the Administrator. Choose another username."
# The cloud is the stack sam deploy makes, named in samconfig.toml (stack_name).
if [[ "$1" == cloud ]]; then
  stack=$(sed -n 's/^stack_name = "\(.*\)"$/\1/p' samconfig.toml | head -n 1)
  [[ -n "$stack" ]] || die "no stack_name in samconfig.toml. Nothing was changed."
  load_target "$stack"
else
  load_target local
fi

# Read-only: whether the name is taken. Any other error than "not found" stops here.
if output=$(idp admin-get-user --user-pool-id "$POOL_ID" --username "$username" 2>&1 >/dev/null); then
  die "$username exists already. Delete it in the Users page first, or choose another username. Nothing was changed."
fi
[[ "$output" == *UserNotFoundException* ]] || die "cannot read the user pool: $output"

echo "Making the User $username in user pool $POOL_ID ($1), with a temporary password."
email="$username@example.com"
if [[ "$1" == cloud ]]; then
  IFS= read -r -p "Your own e-mail address, the User's: " email || die "no address entered."
  # A plain address and nothing else: it goes into the JSON below, so no quote, space or backslash.
  [[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] ||
    die "that is not an e-mail address this script takes. Nothing was changed."
fi
IFS= read -rs -p "Temporary password: " password || die "no password entered."
echo >&2
IFS= read -rs -p "Repeat it: " again || die "no password entered."
echo >&2
[[ "$password" == "$again" ]] || die "the two entries differ. Nothing was changed."
unset again
problems=$(printf '%s\n' "$password" | password_problems)
[[ -z "$problems" ]] || die "the password does not meet the pool policy. It needs:${problems}. Nothing was changed."

# The account, without Cognito's own invitation (SUPPRESS): the password is the one typed above.
# The facts travel as arguments, as JSON: the CLI's short form would split the address at its
# comma. The username rule and the address check above let no quote into the JSON. In the cloud
# the e-mail is the operator's own: an argument ps shows on this machine for a moment, never a
# secret, and never saved.
attributes='[{"Name":"given_name","Value":"Test"},{"Name":"family_name","Value":"User '"$username"'"},'
attributes+='{"Name":"email","Value":"'"$email"'"},{"Name":"email_verified","Value":"true"},'
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
