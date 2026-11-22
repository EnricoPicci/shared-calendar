#!/usr/bin/env bash
# npm run assistant:eval -w backend: the evaluation of the assistant with the real model
# (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3; the command's notes: docs/COMMANDS.md
# section 4). It costs money at Anthropic and is no part of npm run verify.
#
# The evaluation is TypeScript under tests/eval. This script bundles it with the repository's
# esbuild into a temporary folder and runs it with node, from this package's folder, where
# env.local.json is. Arguments go through: npm run assistant:eval -w backend -- --list
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$PWD/../node_modules/.bin:$PWD/node_modules/.bin:$PATH"
bundle_dir=$(mktemp -d)
trap 'rm -rf "$bundle_dir"' EXIT

esbuild tests/eval/run.ts --bundle --platform=node --format=cjs --log-level=warning --outfile="$bundle_dir/assistant-eval.cjs"
node "$bundle_dir/assistant-eval.cjs" "$@"
