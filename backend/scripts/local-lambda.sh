#!/usr/bin/env bash
# Serves the functions' invoke on http://127.0.0.1:3001 (sam local start-lambda), so that a mail route
# run by `npm run local:api` can start the mailer in the background, as Lambda does in the cloud
# (docs/EMAIL_ARCHITECTURE.md section 14.2, docs/EMAIL_PLAN.md finding F3). An `Event` invoke is
# answered at once and the function runs afterwards. A Lambda container reaches it at
# http://host.docker.internal:3001, the address env.local.json gives the mail routes.
#
# It builds nothing: it serves the build `npm run local:api` (or `npm run build`) made, so start
# local:api first, and restart this one after every build. Stop with Ctrl-C.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f env.local.json ]]; then
  echo "ERROR: env.local.json is missing. Run 'npm run local:up' first." >&2
  exit 1
fi
if [[ ! -d .aws-sam/build/MailerFunction ]]; then
  echo "ERROR: no build of the mailer in .aws-sam/build. Start 'npm run local:api' first (it builds)." >&2
  exit 1
fi

# The same three settings as scripts/local-api.sh, for the same reasons: where Docker is, dummy
# credentials instead of this machine's AWS login, and the machine's own CPU type.
if [[ -z "${DOCKER_HOST:-}" ]]; then
  DOCKER_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
  export DOCKER_HOST
fi
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local AWS_REGION=eu-west-1
unset AWS_PROFILE AWS_SESSION_TOKEN
arch=arm64
[[ "$(uname -m)" == x86_64 ]] && arch=x86_64

sam local start-lambda --config-env local \
  --parameter-overrides "AlertEmail=local@example.invalid MailStage=on FunctionArchitecture=$arch"
