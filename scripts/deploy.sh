#!/usr/bin/env bash
# Deploys the stack with the samconfig.toml default environment, but only after npm run verify
# has passed (architecture 8.1). verify leaves the stamp .verify-ok:
#
#   <commit hash> <epoch seconds> <clean|dirty>
#
# The deploy is refused unless the stamp exists, is younger than 30 minutes, names the current
# commit, was written on a clean tree, and the tree is still clean (sam build packages the files
# on disk, not the commit, so uncommitted changes would ship untested).
#
# Extra arguments go to sam deploy, e.g. the first deployment: npm run deploy -- --guided
# Uses your real AWS credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP=.verify-ok
MAX_AGE_SECONDS=1800

refuse() {
  echo "Deploy refused: $*" >&2
  echo "Run npm run verify (local stack up) on a clean, committed tree, then deploy within 30 minutes." >&2
  exit 1
}

[[ -f "$STAMP" ]] || refuse "$STAMP is missing: npm run verify has not passed since its last start."

read -r stamp_head stamp_time stamp_tree < "$STAMP" || true
if [[ ! "${stamp_head:-}" =~ ^[0-9a-f]{40}$ || ! "${stamp_time:-}" =~ ^[0-9]+$ ||
      ! "${stamp_tree:-}" =~ ^(clean|dirty)$ ]]; then
  refuse "$STAMP is not in the format '<commit> <epoch seconds> <clean|dirty>'."
fi

age=$(( $(date +%s) - stamp_time ))
if (( age > MAX_AGE_SECONDS )); then
  refuse "verify passed $(( age / 60 )) minutes ago; the limit is $(( MAX_AGE_SECONDS / 60 ))."
fi

head=$(git rev-parse HEAD)
if [[ "$stamp_head" != "$head" ]]; then
  refuse "verify passed on commit ${stamp_head:0:12}, but HEAD is ${head:0:12}."
fi

if [[ "$stamp_tree" == dirty ]]; then
  refuse "verify ran on uncommitted changes, which commit ${head:0:12} does not contain."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  refuse "the working tree has uncommitted changes (git status), which would be deployed untested."
fi

echo "verify passed $(( age / 60 )) min ago on ${head:0:12}, clean tree. Building and deploying."
# Through npm: sam build needs the project's esbuild on the PATH.
npm run build
sam deploy "$@"
