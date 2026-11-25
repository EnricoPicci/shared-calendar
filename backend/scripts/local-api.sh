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

# sam build needs the repository's esbuild on the PATH (npm workspaces hoist it to the root).
export PATH="$PWD/../node_modules/.bin:$PWD/node_modules/.bin:$PATH"
# The monorepo build of samconfig.toml: one install at the repository root, then esbuild in place.
# Needs SAM CLI 1.171.0 or newer; an older one ignores the variable and strips node_modules.
bash scripts/check-sam.sh
export SAM_CLI_BETA_NODEJS_MONOREPO=1

# The functions run on the machine's own CPU type: on an x86 machine Docker would have to emulate
# arm64, and cold starts then exceed the 10 s timeout. The code is plain JavaScript, so it behaves
# the same on both. --parameter-overrides replaces the one in samconfig.toml, hence AlertEmail again.
arch=arm64
[[ "$(uname -m)" == x86_64 ]] && arch=x86_64

# One registry lookup per start. samconfig.toml sets skip_pull_image: otherwise every warm
# container's start asks Docker for the runtime image's digest at public.ecr.aws, several in
# parallel with no timeout, and the start-up takes 6-42 s or never completes (seen with 25
# functions). Here: one `docker pull` of AWS's Lambda base image (a no-op when it is current), at
# most 120 s. When it brings a new base, the local image SAM built on top of it ("rapid": the base plus the
# Lambda emulator) is removed, so that SAM rebuilds it from the new base. If the registry cannot be
# reached, the local image is used as it is.
runtime=$(awk '/^ *Runtime: nodejs/ { sub(/.*nodejs/, ""); sub(/\.x.*/, ""); print; exit }' template.yaml)
base_image="public.ecr.aws/lambda/nodejs:${runtime}-${arch}"
rapid_image="public.ecr.aws/lambda/nodejs:${runtime}-rapid-${arch}"
image_id() { docker image inspect -f '{{.Id}}' "$1" 2> /dev/null || true; }
pull_base_image() {
  docker pull -q "$base_image" > /dev/null 2>&1 &
  local pid=$! waited=0
  while kill -0 "$pid" 2> /dev/null; do
    if ((waited >= 120)); then
      kill "$pid" 2> /dev/null || true
      wait "$pid" 2> /dev/null || true
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pid"
}
before=$(image_id "$base_image")
if pull_base_image; then
  if [[ "$(image_id "$base_image")" != "$before" ]]; then
    echo "New Lambda base image $base_image: SAM rebuilds $rapid_image"
    docker rmi "$rapid_image" > /dev/null 2>&1 \
      || echo "WARNING: could not remove $rapid_image (in use?); SAM keeps the old one" >&2
  fi
elif [[ -z "$before" ]]; then
  echo "ERROR: cannot pull $base_image and there is no local copy" >&2
  exit 1
else
  echo "WARNING: could not check $base_image at the registry; using the local copy" >&2
fi

# On exit (Ctrl-C included), remove the Lambda containers sam local leaves running. It cleans up
# its warm containers but not every extra one it starts on a request; they pile up with every
# restart (once seen: 14 of 18 still running after Ctrl-C). Only containers SAM labels as Lambda
# containers on this project's network: the emulators and other projects' containers are untouched.
remove_lambda_containers() {
  local ids
  ids=$(docker ps -aq --filter label=sam.cli.container.type=lambda --filter network=shared-calendar-local) || return 0
  if [[ -n "$ids" ]]; then
    echo "Removing $(echo "$ids" | wc -l | tr -d ' ') Lambda container(s) left by sam local"
    # One id per line; unquoted on purpose so that each becomes an argument (no xargs -r on macOS).
    # shellcheck disable=SC2086
    docker rm -f $ids > /dev/null || true
  fi
}
trap remove_lambda_containers EXIT

sam build --config-env local
sam local start-api --config-env local \
  --parameter-overrides "AlertEmail=local@example.invalid FunctionArchitecture=$arch"
