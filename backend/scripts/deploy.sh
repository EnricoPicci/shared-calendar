#!/usr/bin/env bash
# Deploys the stack with the samconfig.toml default environment, but only after npm run verify
# has passed (docs/ARCHITECTURE.md section 8.1). verify leaves the stamp .verify-ok:
#
#   <commit hash> <epoch seconds> <clean|dirty>
#
# The deploy is refused unless the stamp exists, is younger than 30 minutes, names the current
# commit, was written on a clean tree, and the tree is still clean (sam build packages the files
# on disk, not the commit, so uncommitted changes would ship untested). That check is
# scripts/deploy-gate.sh at the repository root, which the front end's deploy script uses too.
#
# Extra arguments go to sam deploy, e.g. the first deployment of a stack, which needs the alert
# address (kept out of samconfig.toml): npm run deploy -- --parameter-overrides AlertEmail=you@example.com
# Uses your real AWS credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

# The old stack hello-world-api must never receive this template: its tables are named after the
# stack, so CloudFormation would try to replace the old stack's tables, data included
# (docs/RENAME_PLAN.md section 4.2). samconfig.toml names the new stack; this refuses an argument
# that points the deploy back at the old one (--stack-name hello-world-api or =hello-world-api).
OLD_STACK=hello-world-api
for arg in "$@"; do
  if [[ "$arg" == "$OLD_STACK" || "$arg" == *"=$OLD_STACK" ]]; then
    echo "Deploy refused: this template must not be deployed to the old stack $OLD_STACK." >&2
    echo "It is kept unchanged as the way back until it is retired (docs/RENAME_PLAN.md section 6.3)." >&2
    exit 1
  fi
done

source ../scripts/deploy-gate.sh
deploy_gate .verify-ok

echo "verify passed $gate_age_minutes min ago on $gate_head, clean tree. Building and deploying."
# Through npm: sam build needs the project's esbuild on the PATH.
npm run build
sam deploy "$@"
