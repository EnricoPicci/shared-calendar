#!/usr/bin/env bash
# Builds the functions and serves the API on http://127.0.0.1:3000 against the local emulators.
# Needs `npm run local:up` first (it creates env.local.json). Stop with Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f env.local.json ]]; then
  echo "ERROR: env.local.json is missing. Run 'npm run local:up' first." >&2
  exit 1
fi

# SAM only looks for Docker at /var/run/docker.sock; Docker Desktop on macOS may use a per-user
# socket instead. Ask the docker CLI where its current daemon is.
if [[ -z "${DOCKER_HOST:-}" ]]; then
  DOCKER_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
  export DOCKER_HOST
fi

# Dummy credentials: SAM otherwise loads the real AWS login of this machine (and fails if it
# has expired) to hand it to the Lambda containers. Nothing local needs real credentials.
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-west-1
unset AWS_PROFILE AWS_SESSION_TOKEN

# sam build needs the project's esbuild on the PATH.
export PATH="$PWD/node_modules/.bin:$PATH"

sam build --config-env local
sam local start-api --config-env local
