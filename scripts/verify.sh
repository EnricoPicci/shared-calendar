#!/usr/bin/env bash
# The deploy gate (architecture 8.1): every local check, in order, stopping at the first failure.
#
#   typecheck, lint, audit, sam validate --lint, unit tests, integration tests
#
# The integration tests need the local stack (npm run local:up, npm run local:api); pass the same
# DYNAMODB_PORT as local:up. This script never starts the stack.
#
# On full success it writes .verify-ok, which scripts/deploy.sh requires:
#
#   <commit hash> <epoch seconds> <clean|dirty>
#
# "dirty" means the run tested uncommitted changes that the commit does not contain: deploy.sh
# refuses such a stamp. The stamp is removed first, so a failed run never leaves an older one.
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP=.verify-ok
rm -f "$STAMP"

# What this run tests: the commit, plus the uncommitted changes if there are any.
head=$(git rev-parse HEAD)
if [[ -z "$(git status --porcelain)" ]]; then tree=clean; else tree=dirty; fi

trap 'if [[ ! -f $STAMP ]]; then echo; echo "verify FAILED: no $STAMP written." >&2; fi' EXIT

step() {
  echo
  echo "==> $*"
  "$@"
}
step npm run typecheck
step npm run lint
step npm run audit
step sam validate --lint
step npm run test:unit
# Without RUN_INTEGRATION=1 the integration project selects no files and passes vacuously.
step env RUN_INTEGRATION=1 npm run test:integration

if [[ "$(git rev-parse HEAD)" != "$head" ]]; then
  echo "verify FAILED: HEAD moved during the run; run it again." >&2
  exit 1
fi

echo "$head $(date +%s) $tree" > "$STAMP"
echo
echo "verify PASSED: $STAMP written for $head ($tree tree)."
if [[ "$tree" == dirty ]]; then
  echo "The tree had uncommitted changes, so npm run deploy will refuse this stamp."
  echo "Commit, then run npm run verify again before deploying."
fi
