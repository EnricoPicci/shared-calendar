# shellcheck shell=bash disable=SC2034 # sourced: the variables set here are used by the caller
# The deploy gate's check (docs/ARCHITECTURE.md section 8.1), sourced by the two deploy scripts,
# backend/scripts/deploy.sh and frontend/scripts/deploy.sh, so that both refuse for the same
# reasons, in the same words.
#
# npm run verify leaves the stamp backend/.verify-ok when every local check has passed:
#
#   <commit hash> <epoch seconds> <clean|dirty>
#
#   deploy_gate <path of the stamp>
#
# returns only if the deploy may go on: the stamp exists, is younger than 30 minutes, names the
# current commit, was written on a clean tree, and the tree is still clean (a deploy packages
# the files on disk, not the commit, so uncommitted changes would ship untested). git status
# looks at the whole repository, whichever folder the caller stands in. Otherwise it prints the
# reason and how to get a stamp, and exits 1.
#
# On return, gate_age_minutes and gate_head (the commit, 12 characters) say what was found, for
# the caller's own line.
#
# Portable: bash 3.2 and BSD tools (macOS) as well as Linux.

deploy_gate() {
  local stamp=$1 max_age_seconds=1800
  local stamp_head stamp_time stamp_tree age head

  refuse() {
    echo "Deploy refused: $*" >&2
    echo "Run npm run verify (local stack up) on a clean, committed tree, then deploy within 30 minutes." >&2
    exit 1
  }

  [[ -f "$stamp" ]] || refuse "$stamp is missing: npm run verify has not passed since its last start."

  read -r stamp_head stamp_time stamp_tree < "$stamp" || true
  if [[ ! "${stamp_head:-}" =~ ^[0-9a-f]{40}$ || ! "${stamp_time:-}" =~ ^[0-9]+$ ||
        ! "${stamp_tree:-}" =~ ^(clean|dirty)$ ]]; then
    refuse "$stamp is not in the format '<commit> <epoch seconds> <clean|dirty>'."
  fi

  age=$(( $(date +%s) - stamp_time ))
  if (( age > max_age_seconds )); then
    refuse "verify passed $(( age / 60 )) minutes ago; the limit is $(( max_age_seconds / 60 ))."
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

  gate_age_minutes=$(( age / 60 ))
  gate_head=${head:0:12}
}
