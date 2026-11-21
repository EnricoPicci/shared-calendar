#!/usr/bin/env bash
# npm run deploy -w frontend [-- --dry-run]: releases the page (docs/FRONTEND_ARCHITECTURE.md
# section 13.6). The same command for the first deployment and for every later release. A real
# cloud action, with your AWS credentials. In order, stopping at the first failure:
#
#   1. the deploy gate (the back end's stamp, backend/.verify-ok), then the front end's own
#      checks (npm run verify -w frontend)
#   2. read the back end's stack: its outputs ApiUrl and UserPoolClientId (read-only)
#   3. sam deploy of template.yaml, the hosting's stack (the change set is shown and confirmed)
#   4. read the hosting's stack: its outputs BucketName, DistributionId and PageUrl
#   5. build frontend/dist/ with the values read at point 2
#   6. upload the four files, index.html last
#   7. empty CloudFront's copies (an invalidation of /*) and wait until that is done
#   8. four checks against the page's address with curl and no credentials, PASS or FAIL each
#   9. print the page's address
#
# --dry-run does points 1, 2 and 5 and says what the others would do. It creates and changes
# nothing in the cloud and does not need the hosting's stack to exist; it passes the gate like
# a real run.
#
# The script takes no password and no token and prints none: it has none. What it prints of the
# stacks (names, ids, addresses) is not secret. It never changes the back end's stack. Nothing
# of a deployment is read from or written to a committed file.
#
# Portable: bash 3.2 and BSD tools (macOS) as well as Linux; needs node, the AWS CLI, the SAM
# CLI, curl and git.
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PAGER=""

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# No stack is named hello-world-api: the project's first stack had that name and is deleted
# (docs/RENAME_PLAN.md section 6.3). This command refuses any argument that names it, as the
# back end's deploy does, and below it refuses a backend/samconfig.toml that names it.
OLD_STACK=hello-world-api
for arg in "$@"; do
  if [[ "$arg" == "$OLD_STACK" || "$arg" == *"=$OLD_STACK" ]]; then
    echo "Deploy refused: the page must not be deployed against a stack named $OLD_STACK." >&2
    echo "That was the project's first stack and is deleted (docs/RENAME_PLAN.md section 6.3)." >&2
    exit 1
  fi
done

dry_run=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    *) die "unknown argument '$arg'. Usage: npm run deploy -w frontend [-- --dry-run]" ;;
  esac
done

for tool in node aws sam curl git; do
  command -v "$tool" > /dev/null || die "$tool is not installed."
done

# ---- 1. The gate, then the front end's own checks ------------------------------------------
# The stamp proves the back end and shared/, on this commit, on a clean tree. It is written
# before the front end's checks run, so those are run here: no Docker, about a minute.
source ../scripts/deploy-gate.sh
deploy_gate ../backend/.verify-ok
echo "verify passed $gate_age_minutes min ago on $gate_head, clean tree."

echo
echo "==> npm run verify (frontend)"
npm run verify || die "the front end's checks failed (npm run verify -w frontend): nothing was read from AWS, nothing deployed."

# ---- The names: the two stacks and their region --------------------------------------------
# setting <file> <name>: the first line `name = "value"` of a samconfig.toml.
setting() {
  sed -n 's/^'"$2"' = "\(.*\)"$/\1/p' "$1" | head -n 1
}

API_STACK=$(setting ../backend/samconfig.toml stack_name)
WEB_STACK=$(setting samconfig.toml stack_name)
[[ -n "$API_STACK" ]] || die "no stack_name in backend/samconfig.toml."
[[ -n "$WEB_STACK" ]] || die "no stack_name in frontend/samconfig.toml."
[[ "$API_STACK" != "$OLD_STACK" ]] ||
  die "backend/samconfig.toml names $OLD_STACK, the deleted first stack: the page is never deployed against it."
[[ "$WEB_STACK" != "$API_STACK" ]] ||
  die "frontend/samconfig.toml and backend/samconfig.toml name the same stack, $API_STACK."

# Each stack lives in the region its samconfig.toml names, unless AWS_REGION says otherwise,
# as in backend/scripts/target.sh. The two must be one: the page's Content-Security-Policy
# names Cognito's address in the hosting stack's region, and the user pool is in the back
# end's.
api_region=${AWS_REGION:-$(setting ../backend/samconfig.toml region)}
web_region=${AWS_REGION:-$(setting samconfig.toml region)}
[[ -n "$api_region" && -n "$web_region" ]] || die "no region in backend/samconfig.toml or frontend/samconfig.toml."
[[ "$api_region" == "$web_region" ]] ||
  die "the back end's region ($api_region, backend/samconfig.toml) and the hosting's ($web_region, frontend/samconfig.toml) differ: they must be the same."
REGION=$web_region

# ---- 2. The back end's stack ---------------------------------------------------------------
# Read-only: describes the stack, changes nothing. A missing output comes back as None.
echo
echo "==> reading the back end's stack $API_STACK in $REGION"
# shellcheck disable=SC2016 # the backticks are JMESPath string literals, not shell
values=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$API_STACK" --output text --query 'Stacks[0].[
    Outputs[?OutputKey==`ApiUrl`].OutputValue | [0],
    Outputs[?OutputKey==`UserPoolClientId`].OutputValue | [0]]') ||
  die "cannot read stack $API_STACK in $REGION (AWS login? is the back end deployed? It comes first: npm run deploy -w backend)."
read -r API_URL CLIENT_ID <<< "$values"
[[ -n "${API_URL:-}" && "$API_URL" != None ]] || die "stack $API_STACK has no output ApiUrl."
[[ -n "${CLIENT_ID:-}" && "$CLIENT_ID" != None ]] || die "stack $API_STACK has no output UserPoolClientId."

# The host of ApiUrl, which is "https://<host>" with nothing after it. The template refuses
# anything but a host name too (its parameter's AllowedPattern).
[[ "$API_URL" == https://* ]] || die "the output ApiUrl of $API_STACK does not start with https://: $API_URL"
API_DOMAIN=${API_URL#https://}
[[ "$API_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "the output ApiUrl of $API_STACK is not 'https://<host>': $API_URL"

COGNITO_URL="https://cognito-idp.$REGION.amazonaws.com/"
# The policy the distribution sends (template.yaml, PageHeaders), which the first check
# compares with what arrives.
POLICY="default-src 'self'; connect-src 'self' https://cognito-idp.$REGION.amazonaws.com; frame-ancestors 'none'; base-uri 'none'"

echo "    API        $API_URL"
echo "    client id  $CLIENT_ID"
echo "    Cognito    $COGNITO_URL"

# ---- 5 (both modes). The build -------------------------------------------------------------
# The page calls the API at /api of its own address; the distribution passes that on. The three
# values travel in the environment only.
build_page() {
  echo
  echo "==> npm run build (frontend)"
  API_URL=/api COGNITO_URL="$COGNITO_URL" CLIENT_ID="$CLIENT_ID" npm run build ||
    die "the build failed: nothing was uploaded."
  local name
  for name in index.html style.css app.js app.js.map; do
    [[ -s "dist/$name" ]] || die "the build left no dist/$name: nothing was uploaded."
  done
  # A bundle built for the laptop must never be uploaded.
  if grep -q localhost dist/app.js; then
    die "dist/app.js holds 'localhost': nothing was uploaded."
  fi
  grep -q "cognito-idp.$REGION.amazonaws.com" dist/app.js ||
    die "dist/app.js does not hold Cognito's address: nothing was uploaded."
}

# The four files in the order of the upload, each with its content type. index.html is last:
# until it is there, a browser gets the old page (docs/FRONTEND_ARCHITECTURE.md section 13.5).
FILES="app.js.map app.js style.css index.html"
content_type() {
  case "$1" in
    index.html) echo "text/html; charset=utf-8" ;;
    style.css) echo "text/css; charset=utf-8" ;;
    app.js) echo "text/javascript; charset=utf-8" ;;
    app.js.map) echo "application/json" ;;
  esac
}

# ---- The dry run ends here ------------------------------------------------------------------
if [[ "$dry_run" == true ]]; then
  build_page

  # Read-only, and allowed to fail: the hosting's stack need not exist yet.
  # shellcheck disable=SC2016 # JMESPath literals
  if values=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$WEB_STACK" --output text --query 'Stacks[0].[
      Outputs[?OutputKey==`BucketName`].OutputValue | [0],
      Outputs[?OutputKey==`DistributionId`].OutputValue | [0],
      Outputs[?OutputKey==`PageUrl`].OutputValue | [0]]' 2> /dev/null); then
    read -r BUCKET DISTRIBUTION PAGE_URL <<< "$values"
    exists="exists"
  else
    BUCKET="<BucketName>" DISTRIBUTION="<DistributionId>" PAGE_URL="<PageUrl>"
    exists="does not exist yet, or cannot be read: it would be created, and the three names below are its outputs"
  fi

  echo
  echo "DRY RUN: nothing was deployed, uploaded or invalidated. A real run would now:"
  echo
  echo "  3. sam deploy frontend/template.yaml"
  echo "       stack      $WEB_STACK in $REGION ($exists)"
  echo "       parameter  ApiDomain=$API_DOMAIN"
  echo "       the change set is shown and must be confirmed"
  echo "  4. read the outputs BucketName, DistributionId and PageUrl of $WEB_STACK"
  echo "  6. upload, in this order, each with Cache-Control: no-cache:"
  for name in $FILES; do
    echo "       dist/$name -> s3://$BUCKET/$name  ($(content_type "$name"), $(wc -c < "dist/$name" | tr -d ' ') bytes)"
  done
  echo "  7. invalidate /* on the distribution $DISTRIBUTION and wait for it"
  echo "  8. check, with curl and no credentials:"
  echo "       $PAGE_URL/                   200, Content-Security-Policy: $POLICY"
  echo "       $PAGE_URL/app.js             200, text/javascript"
  echo "       $PAGE_URL/api/calendar       401, the API's JSON"
  echo "       $PAGE_URL/api/no-such-route  404, the API's JSON"
  echo "  9. print $PAGE_URL"
  exit 0
fi

# ---- 3. The hosting's stack ----------------------------------------------------------------
# The stack's name and the region are passed as read above, so that sam and this script cannot
# disagree; the rest is in samconfig.toml. A release that changes no resource says so and goes
# on.
echo
echo "==> sam deploy: stack $WEB_STACK in $REGION, ApiDomain=$API_DOMAIN"
sam deploy --template-file template.yaml --stack-name "$WEB_STACK" --region "$REGION" \
  --parameter-overrides "ApiDomain=$API_DOMAIN" || die "sam deploy failed: nothing was uploaded."

# ---- 4. Its outputs -------------------------------------------------------------------------
# shellcheck disable=SC2016 # JMESPath literals
values=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$WEB_STACK" --output text --query 'Stacks[0].[
    Outputs[?OutputKey==`BucketName`].OutputValue | [0],
    Outputs[?OutputKey==`DistributionId`].OutputValue | [0],
    Outputs[?OutputKey==`PageUrl`].OutputValue | [0]]') ||
  die "cannot read stack $WEB_STACK in $REGION (was the change set confirmed?)."
read -r BUCKET DISTRIBUTION PAGE_URL <<< "$values"
for name in BUCKET DISTRIBUTION PAGE_URL; do
  [[ -n "${!name:-}" && "${!name}" != None ]] || die "stack $WEB_STACK lacks an output ($name): nothing was uploaded."
done

# ---- 5. The build ---------------------------------------------------------------------------
build_page

# ---- 6. The upload --------------------------------------------------------------------------
# Four copies by name, never a sync and never a delete: the bucket's policy names these four
# objects and no other. "no-cache" lets a browser keep its copy but makes it ask, at every
# load, whether it is still the newest.
echo
echo "==> uploading to s3://$BUCKET"
for name in $FILES; do
  aws s3 cp "dist/$name" "s3://$BUCKET/$name" --region "$REGION" --no-progress \
    --content-type "$(content_type "$name")" --cache-control no-cache ||
    die "the upload of $name failed. Files uploaded before it are already in the bucket; run the command again."
done

# ---- 7. The invalidation ---------------------------------------------------------------------
# CloudFront forgets its copies of every path, so the release is there at once. The path is
# quoted: the shell must not expand the star.
echo
echo "==> invalidating /* on $DISTRIBUTION"
invalidation=$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths '/*' \
  --query Invalidation.Id --output text) || die "the invalidation failed. The files are uploaded; run the command again."
echo "    waiting for invalidation $invalidation"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$invalidation" ||
  die "invalidation $invalidation did not complete in time. The files are uploaded; run the command again for the checks."

# ---- 8. The four checks ----------------------------------------------------------------------
# With curl and no credentials: what anybody's browser gets. They prove the bucket and its
# policy, the headers, the rule for /api/..., the function that removes the prefix, and that a
# failure of the API arrives as the API sent it. They cannot prove a signed-in call: the
# first login in a browser does.
failures=0
pass() { echo "PASS  $*"; }
fail() {
  echo "FAIL  $*"
  failures=$((failures + 1))
}

# ask <path>: sets STATUS, HEADERS (lower-case names, no carriage returns) and BODY.
ask() {
  local answer
  answer=$(curl -sS --max-time 30 -D - -w '\n%{http_code}' "$PAGE_URL$1" 2>&1) || {
    STATUS=000 HEADERS="" BODY="$answer"
    return 0
  }
  STATUS=${answer##*$'\n'}
  answer=${answer%$'\n'*}
  # Both read the whole answer to its end: a reader that stopped at the first empty line would
  # break the pipe of a long answer (app.js), and with pipefail that would end the script.
  HEADERS=$(printf '%s\n' "$answer" | tr -d '\r' | awk '/^$/ { body = 1 } !body')
  BODY=$(printf '%s\n' "$answer" | tr -d '\r' | sed '1,/^$/d')
}

# header <name>: the value of that header in HEADERS, or nothing.
header() {
  printf '%s\n' "$HEADERS" | awk -v name="$1" '
    BEGIN { FS = ":" }
    tolower($1) == name && !found { sub(/^[^:]*:[ \t]*/, ""); print; found = 1 }'
}

# api_message: the field "message" of BODY when BODY is a JSON object, or nothing.
api_message() {
  printf '%s' "$BODY" | node -e 'try {
    const value = JSON.parse(require("fs").readFileSync(0, "utf8")).message;
    if (typeof value === "string") process.stdout.write(value);
  } catch {}'
}

echo
echo "==> checking $PAGE_URL"

ask /
if [[ "$STATUS" == 200 && "$(header content-security-policy)" == "$POLICY" ]]; then
  pass "GET / -> 200 with the Content-Security-Policy"
else
  fail "GET / -> $STATUS, Content-Security-Policy: $(header content-security-policy)"
fi

ask /app.js
if [[ "$STATUS" == 200 && "$(header content-type)" == text/javascript* ]]; then
  pass "GET /app.js -> 200, $(header content-type)"
else
  fail "GET /app.js -> $STATUS, content type: $(header content-type)"
fi

# No token: the API itself refuses, with its own JSON.
ask /api/calendar
if [[ "$STATUS" == 401 && "$(header content-type)" == application/json* && "$(api_message)" == Unauthorized ]]; then
  pass "GET /api/calendar -> 401, the API's JSON"
else
  fail "GET /api/calendar -> $STATUS, content type: $(header content-type)"
fi

# No route of the API: its own JSON again, not a page of the distribution or of the bucket.
ask /api/no-such-route
if [[ "$STATUS" == 404 && "$(header content-type)" == application/json* && "$(api_message)" == "Not Found" ]]; then
  pass "GET /api/no-such-route -> 404, the API's JSON"
else
  fail "GET /api/no-such-route -> $STATUS, content type: $(header content-type)"
fi

# ---- 9. The address --------------------------------------------------------------------------
echo
if (( failures > 0 )); then
  echo "$failures of 4 checks FAILED. The page is deployed at $PAGE_URL but not as designed."
  exit 1
fi
echo "The page is released: $PAGE_URL"
