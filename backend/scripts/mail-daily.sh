#!/usr/bin/env bash
# Runs the mailer's daily run once by hand on the local stack (docs/EMAIL_ARCHITECTURE.md section
# 14.2), as the hourly timer does in the cloud:
#
#   npm run mail:daily -w backend -- [<instant>]
#
# Without an instant the run reads the clock; with one (a whole minute, YYYY-MM-DDTHH:mm:00.000Z,
# in UTC) it runs as if it were that moment, which env.local.json allows the local mailer alone
# (MAIL_ALLOW_NOW). The run sends only at the hour of the daily mail's settings in the calendar's
# time zone, at most once a day (docs/EMAIL_ARCHITECTURE.md section 6.2): it says what it did, and
# its mail lands in the fake mail (http://localhost:8025). To send again the same day, delete that
# day's mark (PK DAILY, SK the date) in the table mail at http://localhost:8001.
#
# Needs npm run local:up, local:api (for the build) and local:lambda. Local only: it talks to sam
# local start-lambda on 127.0.0.1:3001, never to AWS.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ $# -gt 1 ]]; then
  echo "Usage: npm run mail:daily -w backend -- [<instant YYYY-MM-DDTHH:mm:00.000Z>]" >&2
  exit 1
fi
now=${1:-}
if [[ -n "$now" && ! "$now" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00\.000Z$ ]]; then
  echo "ERROR: '$now' is not an instant of a whole minute, such as 2026-12-01T06:00:00.000Z." >&2
  exit 1
fi
if [[ ! -f env.local.json ]]; then
  echo "ERROR: env.local.json is missing. Run 'npm run local:up' first." >&2
  exit 1
fi

# The timer's event, {"kind":"daily"}, with the instant when one is given.
event='{"kind":"daily"}'
[[ -n "$now" ]] && event="{\"kind\":\"daily\",\"now\":\"$now\"}"

# A synchronous invoke, so that the answer is the mailer's own result once the mail is in the fake.
if ! result=$(curl -sS --fail-with-body -X POST -H 'content-type: application/json' --data "$event" \
  http://127.0.0.1:3001/2015-03-31/functions/MailerFunction/invocations); then
  echo "ERROR: the mailer could not be run. Is 'npm run local:lambda' running? Its terminal says why." >&2
  echo "$result" >&2
  exit 1
fi
echo "The mailer answered: $result"
echo "The mails: http://localhost:8025"
