#!/usr/bin/env bash
# Post-deploy smoke test (architecture 9.3): journeys 3, 4, 6 and 11 of plan step 9 with a
# throw-away user smoke-<timestamp>, and the calendar journey of spec 18.4 between journeys 3
# and 11. Prints PASS or FAIL per check; exits 1 if any check failed.
#
#   npm run smoke <stack-name>   the deployed stack, your AWS login (run after every deploy)
#   npm run smoke local          the local stack (local:up + local:api; pass DYNAMODB_PORT)
#
# Locally the global sign-out on delete is skipped (SKIP_GLOBAL_SIGN_OUT), so only the cloud run
# exercises refresh-token revocation; both prove that the deleted user can no longer sign in.
#
# The calendar journey works whatever the real calendar holds, and never changes the settings
# or anything it did not create: it reads the settings and the calendar view, picks the first
# date from 50 days ahead whose 03:00-04:00 (local, the calendar's zone) is free, creates the type
# smoke-<timestamp> and a one-off window there, books it for the throw-away user with a note, lists
# it as that user (upcoming) and cancels it as that user, then deletes the window and the type.
# Only the API is used; no calendar answer body is ever printed (status and error code only).
#
# Tokens and passwords stay in shell variables and travel through pipes only: never printed,
# never command-line arguments, never written to disk. On every exit, also after a failed check
# or Ctrl-C, the calendar journey's appointment is cancelled and its window and type deleted, and
# the throw-away user is deleted. What stays, by design, as history: the user's message row, and
# in the calendar table the cancelled appointment (username and type name smoke-<timestamp>), its
# pointer, its booked and cancelled events, and the deleted-user marker journey 11 writes.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 1 ]] || die "usage: npm run smoke <stack-name|local>"
load_target "$1"

SMOKE_USER="smoke-$(date +%s)"
# The booking's note: AC-36 searches the logs for "must never reach a log". Never printed.
SMOKE_NOTE="smoke-test note ${SMOKE_USER#smoke-}, must never reach a log"
failures=0
created=false # POST /users was sent: the user may exist
deleted=false # DELETE /users/{username} answered 204: nothing left to clean up

pass() { echo "PASS  $*"; }
fail() {
  echo "FAIL  $*"
  failures=$((failures + 1))
}

# What the calendar journey created and has not removed yet (ids), and the write sent whose
# answer has not been read yet (cal_pending: type, window or appointment), which clean-up looks up.
cal_type_id=""
cal_window_id=""
cal_appt_id=""
cal_booked=false
cal_pending=""
cal_date=""
cal_start=""
cal_cleanup_failed=false

# Removes the throw-away user straight in Cognito if the API did not delete it.
cleanup() {
  local status=$? err
  calendar_cleanup
  [[ "$cal_cleanup_failed" == true ]] && status=1
  if [[ "$created" == true && "$deleted" == false ]]; then
    if err=$(idp admin-delete-user --user-pool-id "$POOL_ID" --username "$SMOKE_USER" 2>&1); then
      echo "cleanup: $SMOKE_USER deleted directly in Cognito"
    elif [[ "$err" == *UserNotFoundException* ]]; then
      echo "cleanup: $SMOKE_USER does not exist, nothing to delete"
    else
      echo "CLEANUP FAILED: $SMOKE_USER may still exist in pool $POOL_ID; delete it in the Cognito console." >&2
      echo "  $err" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# sign_in <username>: password on stdin, access token on stdout. Fails on a Cognito error (printed
# to stderr) and when Cognito answers with a challenge instead of tokens.
sign_in() { cognito sign-in "$CLIENT_ID" "$1"; }

# api <method> <path> <token> [json body]: sets STATUS and BODY. The token reaches curl on stdin
# as a header (-H @-), never as an argument. STATUS is 000 when the API cannot be reached.
api() {
  local response
  response=$(printf 'Authorization: Bearer %s\n' "$3" |
    curl -sS --max-time 60 -X "$1" -H @- -H 'Content-Type: application/json' \
      ${4:+--data "$4"} -w '\n%{http_code}' "$API_URL$2") || { STATUS=000; BODY=""; return 0; }
  STATUS=${response##*$'\n'}
  BODY=${response%$'\n'*}
}

# field <name>: a string field of the API answer in BODY (see json_field in target.sh).
field() { printf '%s' "$BODY" | json_field "$1"; }

# The error code of an API answer, safe to print (never the body itself: it may hold a password).
error_code() {
  local code
  code=$(field error)
  printf '%s' "${code:-$(field message)}"
}

# cal <mode> [args]: the calendar journey's reading and date arithmetic, in node, on the answer in
# BODY (stdin; never printed, only what a mode returns is written):
#   plan              settings answer -> "<zone> <notice h> <from> <to> <earliest start>": the
#                     31 days searched, from today + 50 (or the earliest usable date if later)
#   pick <zone> <earliest>   calendar view -> "<date> <start> <end>" of the first date whose
#                     03:00-04:00 is free, or "none" / "notice" (every date too soon to cancel)
#   test <code> [args]   exit 0 if the JavaScript body <code> returns true for b (answer), a (args)
#   get <code> [args]    writes the string <code> returns (an id, never the answer itself)
# The time helpers are shared/src/calendar/time.ts itself (Node 22 runs it, stripping its types),
# so local dates and DST follow the back end's rules and never the machine's zone.
CAL_JS='
const fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");
const [mode, ...a] = process.argv.slice(1);
let b;
try { b = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(1); }
const out = (text) => process.stdout.write(text);
if (mode === "test" || mode === "get") {
  let r;
  try { r = new Function("b", "a", a[0])(b, a.slice(1)); } catch { r = undefined; }
  if (mode === "test") process.exit(r === true ? 0 : 1);
  if (typeof r === "string") out(r);
  process.exit(0);
}
const HOUR = 3600000;
import(pathToFileURL(path.resolve("../shared/src/calendar/time.ts")).href).then((t) => {
  if (mode === "plan") {
    // R-CAN-03: the user must still be allowed to cancel; one day of margin. The Administrator
    // books, so the minimum notice, the horizon and the limit do not apply (R-BOOK-04, 05, 09).
    const zone = b.timeZone, notice = b.cancellationNoticeHours;
    if (!t.isValidTimeZone(zone) || !Number.isInteger(notice) || notice < 0) process.exit(1);
    const now = a[0] ? Date.parse(a[0]) : Date.now();
    const earliest = new Date(now + (notice + 24) * HOUR).toISOString();
    const preferred = t.addDays(t.localDateOf(new Date(now).toISOString(), zone), 50);
    const first = t.localDateOf(earliest, zone);
    const from = first > preferred ? first : preferred;
    out([zone, notice, from, t.addDays(from, 30), earliest].join(" "));
  } else if (mode === "pick") {
    const [zone, earliest] = a;
    const overlaps = (s, e, x) => Date.parse(x.start) < e && s < Date.parse(x.end);
    let usable = 0;
    for (const day of b.days || []) {
      const start = t.toInstant(day.date, "03:00", zone), end = t.toInstant(day.date, "04:00", zone);
      const s = Date.parse(start), e = Date.parse(end);
      // A DST day where 03:00 does not exist or 03:00-04:00 is not 60 real minutes: skipped.
      if (t.localTimeOf(start, zone) !== "03:00" || t.localDateOf(start, zone) !== day.date || e - s !== HOUR) continue;
      if (s < Date.parse(earliest)) continue;
      usable++;
      const windows = day.windows || [];
      if (windows.some((w) => overlaps(s, e, w))) continue;
      if (windows.filter((w) => w.source === "one_off").length >= 10) continue;
      if ((b.appointments || []).some((x) => overlaps(s, e, x))) continue;
      return out([day.date, start, end].join(" "));
    }
    out(usable === 0 ? "notice" : "none");
  } else process.exit(1);
}).catch(() => process.exit(1));
'
cal() { printf '%s' "$BODY" | node --disable-warning=ExperimentalWarning -e "$CAL_JS" "$@"; }

# hello_message_id <role> <message>: the messageId of the /hello answer in BODY if it has that
# role and message, otherwise nothing.
hello_message_id() {
  [[ "$(field role)" == "$1" && "$(field message)" == "$2" ]] || return 0
  field messageId
}

# check_row <messageId> <userName> <role>: the row the API wrote, read straight from DynamoDB.
check_row() {
  local row user role user_id
  row=$(ddb get-item --table-name "$TABLE_NAME" --key "{\"messageId\": {\"S\": \"$1\"}}" \
    --query 'Item.[userName.S, role.S, userId.S]' --output text 2>/dev/null) || return 1
  read -r user role user_id <<< "$row"
  [[ "$user" == "$2" && "$role" == "$3" && -n "$user_id" && "$user_id" != None ]]
}

# cleanup_failed <what>: one line naming what to remove by hand; ids only, never a body.
cleanup_failed() {
  echo "CLEANUP FAILED: $1 -> $STATUS $(error_code); remove it by hand." >&2
  cal_cleanup_failed=true
}

# Finds what a write may have created when its answer was never read (timeout, Ctrl-C).
calendar_resolve_pending() {
  local id=""
  case "$cal_pending" in
    type)
      api GET /calendar/types "$admin_token"
      [[ "$STATUS" == 200 ]] &&
        id=$(cal get 'const x = (b.types || []).find((y) => y.name === a[0]); return x ? x.typeId : "";' "$SMOKE_USER") || id=""
      [[ -n "$id" ]] && cal_type_id=$id
      ;;
    window)
      api GET "/calendar?from=$cal_date&to=$cal_date" "$admin_token"
      [[ "$STATUS" == 200 ]] &&
        id=$(cal get 'const w = (b.days || []).flatMap((d) => d.windows || []).find((y) => y.source === "one_off" && y.typeId === a[0] && y.start === a[1]); return w ? w.sourceId : "";' "$cal_type_id" "$cal_start") || id=""
      [[ -n "$id" ]] && cal_window_id=$id
      ;;
    appointment)
      api GET "/calendar/appointments?upcoming=true&username=$SMOKE_USER" "$admin_token"
      [[ "$STATUS" == 200 ]] &&
        id=$(cal get 'const x = (b.appointments || []).find((y) => y.start === a[0]); return x ? x.appointmentId : "";' "$cal_start") || id=""
      [[ -n "$id" ]] && cal_appt_id=$id && cal_booked=true
      ;;
  esac
  if [[ "$STATUS" != 200 ]]; then
    cleanup_failed "a $cal_pending of $SMOKE_USER may exist (no answer to its creation; lookup failed)"
  fi
  cal_pending=""
}

# Removes what the calendar journey created, through the API as the Administrator: cancels the
# appointment, then deletes the window, then the type (R-TYPE-03, R-AV-03). Safe to run twice.
calendar_cleanup() {
  [[ -n "${admin_token:-}" ]] || return 0
  [[ -z "$cal_pending" ]] || calendar_resolve_pending
  if [[ "$cal_booked" == true ]]; then
    api POST "/calendar/appointments/$cal_appt_id/cancel" "$admin_token"
    if [[ "$STATUS" == 200 ]]; then
      echo "cleanup: appointment $cal_appt_id cancelled"
    else
      cleanup_failed "appointment $cal_appt_id of $SMOKE_USER, still booked"
    fi
    cal_booked=false
  fi
  if [[ -n "$cal_window_id" ]]; then
    api DELETE "/calendar/windows/$cal_window_id" "$admin_token"
    if [[ "$STATUS" == 204 ]]; then
      echo "cleanup: one-off window $cal_window_id deleted"
    else
      cleanup_failed "one-off window $cal_window_id ($cal_date 03:00-04:00)"
    fi
    cal_window_id=""
  fi
  if [[ -n "$cal_type_id" ]]; then
    api DELETE "/calendar/types/$cal_type_id" "$admin_token"
    if [[ "$STATUS" == 204 ]]; then
      echo "cleanup: type $cal_type_id ($SMOKE_USER) deleted"
    else
      cleanup_failed "type $cal_type_id ($SMOKE_USER)"
    fi
    cal_type_id=""
  fi
}

# cal_fail <check>: a failed calendar check; what was created so far is removed at once, so
# journey 11 still runs on a clean calendar.
cal_fail() {
  fail "calendar: $*"
  calendar_cleanup
}

# The calendar journey of spec 18.4 (v13). Stops at the first failed check.
calendar_journey() {
  local plan zone notice from to earliest pick status
  api GET /calendar/settings "$admin_token"
  if [[ "$STATUS" != 200 ]]; then
    fail "calendar: GET /calendar/settings -> $STATUS $(error_code)"
    return 0
  fi
  if ! plan=$(cal plan); then
    fail "calendar: GET /calendar/settings -> 200 without a valid timeZone and cancellationNoticeHours"
    return 0
  fi
  read -r zone notice from to earliest <<< "$plan"
  pass "calendar: GET /calendar/settings -> 200 (zone $zone, cancellation notice $notice h)"

  api GET "/calendar?from=$from&to=$to" "$admin_token"
  pick=""
  if [[ "$STATUS" == 200 ]]; then pick=$(cal pick "$zone" "$earliest") || pick=""; fi
  case "$pick" in
    "")
      fail "calendar: GET /calendar?from=$from&to=$to -> $STATUS $(error_code)"
      return 0
      ;;
    notice)
      fail "calendar: no usable date: cancellationNoticeHours $notice h needs a start after $earliest; the calendar journey is skipped (settings are not changed)"
      return 0
      ;;
    none)
      fail "calendar: no free 03:00-04:00 $zone from $from to $to; the calendar journey is skipped"
      return 0
      ;;
  esac
  read -r cal_date cal_start cal_end <<< "$pick"
  pass "calendar: 03:00-04:00 $zone free on $cal_date"

  cal_pending="type"
  api POST /calendar/types "$admin_token" "{\"name\": \"$SMOKE_USER\"}"
  [[ "$STATUS" == 000 ]] || cal_pending=""
  [[ "$STATUS" == 201 ]] && cal_type_id=$(field typeId)
  if [[ -n "$cal_type_id" && "$(field name)" == "$SMOKE_USER" ]]; then
    pass "calendar: POST /calendar/types $SMOKE_USER -> 201"
  else
    cal_fail "POST /calendar/types $SMOKE_USER -> $STATUS $(error_code)"
    return 0
  fi

  cal_pending="window"
  api POST /calendar/windows "$admin_token" \
    "{\"date\": \"$cal_date\", \"start\": \"03:00\", \"end\": \"04:00\", \"typeId\": \"$cal_type_id\"}"
  [[ "$STATUS" == 000 ]] || cal_pending=""
  [[ "$STATUS" == 201 ]] && cal_window_id=$(field windowId)
  if [[ -n "$cal_window_id" ]] &&
    cal test 'return b.date === a[0] && b.start === "03:00" && b.end === "04:00" && b.typeId === a[1];' "$cal_date" "$cal_type_id"; then
    pass "calendar: POST /calendar/windows $cal_date 03:00-04:00 -> 201"
  else
    cal_fail "POST /calendar/windows $cal_date 03:00-04:00 -> $STATUS $(error_code)"
    return 0
  fi

  cal_pending="appointment"
  api POST /calendar/appointments "$admin_token" \
    "{\"username\": \"$SMOKE_USER\", \"start\": \"$cal_start\", \"note\": \"$SMOKE_NOTE\"}"
  [[ "$STATUS" == 000 ]] || cal_pending=""
  if [[ "$STATUS" == 201 ]]; then
    cal_appt_id=$(field appointmentId)
    [[ -n "$cal_appt_id" ]] && cal_booked=true
  fi
  if [[ "$cal_booked" == true ]] &&
    cal test 'return b.status === "booked" && b.username === a[0] && b.start === a[1] && b.end === a[2] && b.typeId === a[3] && b.typeName === a[0] && b.note === a[4];' \
      "$SMOKE_USER" "$cal_start" "$cal_end" "$cal_type_id" "$SMOKE_NOTE"; then
    pass "calendar: book $cal_date 03:00 for $SMOKE_USER -> 201, booked, 60 min, type $SMOKE_USER"
  else
    cal_fail "book $cal_date 03:00 for $SMOKE_USER -> $STATUS $(error_code)"
    return 0
  fi

  api GET "/calendar/appointments?upcoming=true" "$user_token"
  if [[ "$STATUS" == 200 ]] &&
    cal test 'const l = b.appointments || [], x = l[0]; return l.length === 1 && x.appointmentId === a[0] && x.start === a[1] && x.end === a[2] && x.typeId === a[3] && x.status === "booked" && x.note === a[4] && typeof x.cancellableUntil === "string";' \
      "$cal_appt_id" "$cal_start" "$cal_end" "$cal_type_id" "$SMOKE_NOTE"; then
    pass "calendar: upcoming as $SMOKE_USER -> the appointment"
  else
    cal_fail "upcoming as $SMOKE_USER -> $STATUS $(error_code)"
    return 0
  fi

  api POST "/calendar/appointments/$cal_appt_id/cancel" "$user_token"
  status=$STATUS
  if [[ "$status" == 200 ]] && cal test 'return b.status === "cancelled" && b.cancelReason === "cancelled";'; then cal_booked=false; fi
  if [[ "$status" == 200 && "$cal_booked" == false ]]; then
    pass "calendar: cancel as $SMOKE_USER -> 200, cancelled (cancelReason cancelled)"
  else
    cal_fail "cancel as $SMOKE_USER -> $status $(error_code)"
    return 0
  fi

  api DELETE "/calendar/windows/$cal_window_id" "$admin_token"
  if [[ "$STATUS" == 204 ]]; then
    pass "calendar: DELETE /calendar/windows/$cal_window_id -> 204"
    cal_window_id=""
  else
    cal_fail "DELETE /calendar/windows/$cal_window_id -> $STATUS $(error_code)"
    return 0
  fi

  api DELETE "/calendar/types/$cal_type_id" "$admin_token"
  if [[ "$STATUS" == 204 ]]; then
    pass "calendar: DELETE /calendar/types/$cal_type_id -> 204"
    cal_type_id=""
  else
    cal_fail "DELETE /calendar/types/$cal_type_id -> $STATUS $(error_code)"
  fi
}

IFS= read -rs -p "Password of $ADMIN_USERNAME: " admin_password || die "no password entered."
echo >&2
echo "Smoke test of $1 ($API_URL) with throw-away user $SMOKE_USER"
echo

if admin_token=$(printf '%s' "$admin_password" | sign_in "$ADMIN_USERNAME"); then
  pass "sign-in as $ADMIN_USERNAME"
else
  fail "sign-in as $ADMIN_USERNAME (nothing else can run)"
  exit 1
fi
unset admin_password

# Journey 4: /hello as the Administrator.
api POST /hello "$admin_token"
admin_message_id=$(hello_message_id admin "Hello World, the Administrator is speaking")
if [[ "$STATUS" == 201 && -n "$admin_message_id" ]]; then
  pass "journey 4: /hello as $ADMIN_USERNAME -> 201, Administrator message"
else
  fail "journey 4: /hello as $ADMIN_USERNAME -> $STATUS $BODY"
fi

# Journey 6: create the throw-away user, sign in as it, /hello as it (journey 3).
created=true
api POST /users "$admin_token" "{\"username\": \"$SMOKE_USER\"}"
user_password=""
if [[ "$(field username)" == "$SMOKE_USER" ]]; then user_password=$(field password); fi
if [[ "$STATUS" == 201 && -n "$user_password" ]]; then
  pass "journey 6: POST /users $SMOKE_USER -> 201 with a password"
else
  fail "journey 6: POST /users $SMOKE_USER -> $STATUS $(error_code)"
fi
BODY=""

user_token=""
if [[ -n "$user_password" ]]; then
  if user_token=$(printf '%s' "$user_password" | sign_in "$SMOKE_USER"); then
    pass "journey 6: sign-in as $SMOKE_USER, no challenge"
  else
    user_token=""
    fail "journey 6: sign-in as $SMOKE_USER"
  fi
fi

user_message_id=""
if [[ -n "$user_token" ]]; then
  api POST /hello "$user_token"
  user_message_id=$(hello_message_id user "Hello World, I am $SMOKE_USER")
  if [[ "$STATUS" == 201 && -n "$user_message_id" ]]; then
    pass "journey 3: /hello as $SMOKE_USER -> 201, 'Hello World, I am $SMOKE_USER'"
  else
    fail "journey 3: /hello as $SMOKE_USER -> $STATUS $BODY"
  fi
fi

# Both rows in DynamoDB (architecture 9.3).
if [[ -n "$admin_message_id" ]]; then
  if check_row "$admin_message_id" "$ADMIN_USERNAME" admin; then
    pass "row $admin_message_id in $TABLE_NAME ($ADMIN_USERNAME, admin)"
  else
    fail "row $admin_message_id missing or wrong in $TABLE_NAME"
  fi
fi
if [[ -n "$user_message_id" ]]; then
  if check_row "$user_message_id" "$SMOKE_USER" user; then
    pass "row $user_message_id in $TABLE_NAME ($SMOKE_USER, user)"
  else
    fail "row $user_message_id missing or wrong in $TABLE_NAME"
  fi
fi

# The calendar journey (spec 18.4), before journey 11 deletes the user.
if [[ -n "$user_token" ]]; then calendar_journey; fi

# Journey 11: delete the throw-away user; it can no longer sign in; its message row stays.
api DELETE "/users/$SMOKE_USER" "$admin_token"
if [[ "$STATUS" == 204 ]]; then
  deleted=true
  pass "journey 11: DELETE /users/$SMOKE_USER -> 204"
else
  fail "journey 11: DELETE /users/$SMOKE_USER -> $STATUS $(error_code)"
fi

if [[ "$deleted" == true && -n "$user_password" ]]; then
  if err=$(printf '%s' "$user_password" | sign_in "$SMOKE_USER" 2>&1 >/dev/null); then
    fail "journey 11: sign-in as the deleted $SMOKE_USER still works"
  elif [[ "$err" == *NotAuthorizedException* || "$err" == *UserNotFoundException* ]]; then
    pass "journey 11: sign-in as the deleted $SMOKE_USER fails"
  else
    fail "journey 11: sign-in as the deleted $SMOKE_USER fails for an unexpected reason: $err"
  fi
fi
if [[ "$deleted" == true && -n "$user_message_id" ]]; then
  if check_row "$user_message_id" "$SMOKE_USER" user; then
    pass "journey 11: row $user_message_id of the deleted $SMOKE_USER is kept"
  else
    fail "journey 11: row $user_message_id of the deleted $SMOKE_USER is gone"
  fi
fi
unset admin_token user_token user_password

echo
if (( failures > 0 )); then
  echo "Smoke test FAILED: $failures check(s)."
  exit 1
fi
echo "Smoke test PASSED."
