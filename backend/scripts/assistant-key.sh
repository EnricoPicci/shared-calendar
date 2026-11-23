#!/usr/bin/env bash
# Stores the Anthropic API key of a deployed stack, or replaces it to rotate the key
# (docs/CONVERSATIONAL_ARCHITECTURE.md section 11.2). The assistant's functions read it from the
# SecureString /<stack>/anthropic-api-key; until it exists they answer 503 assistant_unavailable
# and everything else works. The procedure around it: docs/RUNBOOK.md section 3.2.
#
#   npm run assistant-key -w backend -- <stack-name>   your AWS login; asks for the key, hidden
#
# Before it asks for the key it refuses: anything but one argument; "local" (the local stack
# takes its key from local:up, docs/COMMANDS.md section 3.4); the deleted stack hello-world-api;
# a stack it cannot read; a stack that has no assistant yet (no parameter AssistantModel), where
# the key would wait for functions that do not exist. When the key is there already it says which
# version it replaces and asks for y.
#
# The key is typed once without echo and checked for its shape with messages that never show it.
# It is never printed, never written to disk and never a command-line argument (which ps would
# show): it travels through a pipe to scripts/parameters.mjs, which stores it with the AWS SDK.
# The AWS CLI is used only for calls that carry no secret, and no command of this script asks for
# the decrypted value: what it prints after the write is the parameter's name, type, version and
# date.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 1 ]] || die "usage: npm run assistant-key -w backend -- <stack-name>"
stack=$1

if [[ "$stack" == local ]]; then
  die "the local stack takes its key from local:up: ANTHROPIC_API_KEY=… DYNAMODB_PORT=8002 npm run local:up -w backend (docs/COMMANDS.md section 3.4). Nothing was changed."
fi

# The project's first stack had this name and is deleted (docs/RENAME_PLAN.md section 6.3), as
# deploy.sh refuses it too: a key stored under its name would serve nothing.
OLD_STACK=hello-world-api
if [[ "$stack" == "$OLD_STACK" || "$stack" == *"=$OLD_STACK" ]]; then
  die "$OLD_STACK is the project's first stack and is deleted; the stack in use is the one backend/samconfig.toml names. Nothing was changed."
fi
[[ "$stack" != -* ]] || die "takes a stack name, not an option: npm run assistant-key -w backend -- <stack-name>"

# The stack lives in the region sam deploy used (samconfig.toml), unless AWS_REGION says otherwise.
if [[ -z "${AWS_REGION:-}" ]]; then
  AWS_REGION=$(sed -n 's/^region = "\(.*\)"$/\1/p' samconfig.toml | head -n 1)
  export AWS_REGION
fi

# Read-only: describes the stack, changes nothing. None when the parameter is not in the stack.
# shellcheck disable=SC2016 # the backticks are JMESPath string literals, not shell
model=$(aws cloudformation describe-stacks --stack-name "$stack" --output text \
  --query 'Stacks[0].Parameters[?ParameterKey==`AssistantModel`].ParameterValue | [0]') ||
  die "cannot read stack $stack in $AWS_REGION (stack name, region, AWS login?). Nothing was changed."
if [[ -z "$model" || "$model" == None ]]; then
  die "stack $stack has no assistant yet (no parameter AssistantModel): deploy it first, npm run deploy -w backend (docs/RUNBOOK.md section 3.2). Nothing was changed."
fi

name="/$stack/anthropic-api-key"
# Read-only, and never the value: DescribeParameters gives a parameter's metadata only.
# describe <query>: what the JMESPath query picks of the parameter's description, None when absent.
describe() {
  aws ssm describe-parameters --parameter-filters "Key=Name,Values=$name" --output text --query "Parameters[0].$1"
}
version=$(describe Version) || die "cannot read the parameters of $AWS_REGION (AWS login?). Nothing was changed."

echo "Stack $stack ($AWS_REGION), model $model. The key goes to the SecureString $name."
mode=new
if [[ -n "$version" && "$version" != None ]]; then
  mode=replace
  echo "The parameter exists: replacing version $version (a rotation)."
  read -r -p "Replace it? [y/N] " answer || answer=""
  [[ "$answer" == y || "$answer" == Y ]] || die "not replaced. Nothing was changed."
fi

IFS= read -rs -p "Anthropic API key: " key || die "no key entered. Nothing was changed."
echo >&2

# The shape of an Anthropic API key, checked for a clear message; Anthropic has the last word, at
# the assistant's first request after the write. The same characters local:up accepts.
[[ -n "$key" ]] || die "no key entered. Nothing was changed."
[[ "$key" == sk-ant-* ]] || die "that is not an Anthropic API key: it does not start with sk-ant-. Nothing was changed."
[[ "$key" =~ ^[A-Za-z0-9_-]+$ ]] ||
  die "the key holds a character that is not a letter, a digit, - or _ (a space, or a line pasted twice?). Nothing was changed."
(( ${#key} >= 40 && ${#key} <= 300 )) ||
  die "the key's length is not that of an Anthropic API key (expected 40 to 300 characters). Nothing was changed."

printf '%s' "$key" | node scripts/parameters.mjs put-secret "$name" "$mode" ||
  die "Parameter Store refused (the error's name above). The key was not stored."
unset key

echo "Stored. Name, type, version and last change, as Parameter Store describes them (never the value):"
describe '[Name, Type, Version, LastModifiedDate]' || die "the key was stored, but its description could not be read."
echo "The functions read the key at their first request and keep it ten minutes: after a rotation,"
echo "the old key may serve for ten minutes more. Prove it with the smoke test:"
echo "  npm run smoke -w backend -- $stack"
