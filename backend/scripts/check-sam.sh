#!/usr/bin/env bash
# Refuses to build with a SAM CLI older than 1.171.0 (docs/FOLDER_STRUCTURE.md section 4.3).
#
# The monorepo build relies on SAM's npm-workspaces support (SAM_CLI_BETA_NODEJS_MONOREPO=1), which
# arrived in SAM CLI 1.171.0. An older SAM ignores the variable without a word and runs
# `npm update --omit dev` once per function, in parallel: that strips the dev tools from the root
# node_modules (repair: `npm ci` at the root) or fails with ENOTEMPTY, as SAM CLI 1.170.0 does.
# Called by `npm run build` and scripts/local-api.sh before `sam build`.
# Portable: bash 3.2 and BSD tools (macOS) as well as Linux.
set -euo pipefail

MIN_MAJOR=1
MIN_MINOR=171

if ! command -v sam > /dev/null 2>&1; then
  echo "ERROR: the SAM CLI is not installed (need $MIN_MAJOR.$MIN_MINOR.0 or newer)." >&2
  exit 1
fi

# "SAM CLI, version 1.172.1" -> "1.172.1"
version=$(sam --version | awk '{print $NF}')
major=${version%%.*}
rest=${version#*.}
minor=${rest%%.*}

case "$major$minor" in
  '' | *[!0-9]*)
    echo "ERROR: could not read the SAM CLI version from '$(sam --version)'." >&2
    exit 1
    ;;
esac

if (( major < MIN_MAJOR || (major == MIN_MAJOR && minor < MIN_MINOR) )); then
  echo "ERROR: SAM CLI $version is too old: the monorepo build needs $MIN_MAJOR.$MIN_MINOR.0 or newer." >&2
  echo "       An older SAM ignores SAM_CLI_BETA_NODEJS_MONOREPO and strips the root node_modules." >&2
  echo "       Upgrade (macOS: brew upgrade aws-sam-cli), then run 'npm ci' at the repository root." >&2
  exit 1
fi
