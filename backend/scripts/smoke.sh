#!/usr/bin/env bash
# Post-deploy smoke test (docs/ARCHITECTURE.md section 9.3): docs/IMPLEMENTATION_PLAN.md step 9,
# journeys 3, 4, 6 and 11, with a throw-away user smoke-<timestamp>, and between journeys 3 and 11
# the calendar journey of docs/SHARED_CALENDAR_SPEC.md section 18.4. Prints PASS, FAIL or SKIP per
# check (49 checks; locally 2 of them SKIP); exits 1 if any check failed.
#
#   npm run smoke <stack-name>   the deployed stack, your AWS login (run after every deploy)
#   npm run smoke local          the local stack (local:up + local:api; pass DYNAMODB_PORT)
#
# Locally the global sign-out on delete is skipped (SKIP_GLOBAL_SIGN_OUT), so only the cloud run
# exercises refresh-token revocation; both prove that the deleted user can no longer sign in.
#
# Locally the throw-away user's own GlobalSignOut is skipped too, for the same reason (cognito-local
# has none, docs/ARCHITECTURE.md section 8): its two checks print SKIP, never PASS. The cloud run
# never skips them.
#
# The calendar journey works whatever the real calendar holds, and never changes the settings
# or anything it did not create: it reads the settings and the calendar view, picks the first
# date from 50 days ahead whose 03:00-04:00 (local, the calendar's zone) is free, creates the type
# smoke-<timestamp> and a one-off window there, books it for the throw-away user with a note, lists
# it as that user (upcoming) and cancels it as that user, then deletes the window and the type.
# Only the API is used; no calendar answer body is ever printed (status and error code only).
#
# Right after it, the capacity journey (docs/SHARED_CALENDAR_SPEC.md decisions D24 to D31), 16
# checks, each line starting "capacity:", on the same date and in the same hour, which the calendar
# journey found free of any window and active appointment and left so (its cancelled appointment
# blocks nothing), so its window overlaps no real one. It creates two more throw-away users,
# smoke-<timestamp>-b and smoke-<timestamp>-c, through POST /users, and the type
# smoke-cap-<timestamp> of capacity 2 with a one-off window 03:00-04:00. smoke-<timestamp>-c sending
# its own booking with overbook: true gets 403 forbidden and nothing is written
# (docs/SHARED_CALENDAR_SPEC.md AC-41). The Administrator books smoke-<timestamp> and
# smoke-<timestamp>-b (201 both); the Administrator's view shows the slot with capacity 2 and
# placesLeft 0, smoke-<timestamp>-c's view does not offer it and shows the hour busy
# (docs/SHARED_CALENDAR_SPEC.md R-SLOT-03 and R-SLOT-06). The Administrator booking
# smoke-<timestamp>-c is refused 409 slot_taken, then made with overbook: true (201); booking
# smoke-<timestamp> again, forced, is 409 user_busy (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12). The
# Administrator cancels the three appointments, deletes the window and the type, and removes the
# two users through DELETE /users/{username}. The Administrator books, as in the calendar journey,
# so the minimum notice, the horizon and the limit of the settings do not bear on the date.
#
# After the calendar journey and before the user's deletion, one exchange with the assistant as the
# throw-away user (docs/ARCHITECTURE.md section 9.3): its conversation ended first, the sentence
# SMOKE_SENTENCE sent, continue asked for while the exchange is working (at most eight times, the
# limit of requests to Claude for one message), the conversation ended again. The sentence is a
# read: the fake Claude answers it with a read of the settings and then a text
# (tests/integration/fake-claude/answers.json), the real model in the same two steps. Only
# statuses, codes and counts are printed, never a text of the conversation. Against a stack it
# proves the key, the permissions and the route, and it costs money at Anthropic: about a US cent,
# up to 4 when nobody has used the assistant for a few minutes
# (docs/CONVERSATIONAL_ARCHITECTURE.md section 14). So once the assistant is deployed the smoke
# test needs the key (npm run assistant-key): without it the message answers
# 503 assistant_unavailable, one FAIL line, and every other check runs as usual.
#
# After the assistant's exchange and before the user's deletion, the throw-away user changes its
# own password at Cognito, as the page's screen "Password" does (docs/ARCHITECTURE.md section 6.9):
# a fresh sign-in keeps its access and refresh tokens; ChangePassword with a wrong current password
# is refused, and the line names Cognito's error (NotAuthorizedException is expected of the real
# Cognito, InvalidPasswordException of cognito-local); ChangePassword with the right one succeeds;
# the refresh token from before the change still works, since ChangePassword alone revokes nothing;
# GlobalSignOut with the access token from before the change succeeds, and that refresh token is
# then refused (both skipped locally); the old password no longer signs in, the new one does. The
# new password and the wrong current one come from the generator of POST /users
# (src/lib/password.ts), each checked against shared/src/password.ts. Only the cloud run proves
# which error a wrong current password gets and that GlobalSignOut revokes the refresh token.
# From the change on, the deletion's check (docs/IMPLEMENTATION_PLAN.md step 9, journey 11) signs
# in with the new password. Nothing of the change is
# undone: the user is deleted anyway.
#
# Tokens and passwords stay in shell variables and travel through pipes only: never printed,
# never command-line arguments, never written to disk. On every exit, also after a failed check
# or Ctrl-C, the assistant's conversation is ended once its message was sent, the calendar
# journey's appointment is cancelled and its window and type deleted, the capacity journey's
# appointments are cancelled, its window and type deleted and its two users removed through the
# API (straight in Cognito if the API fails), and the throw-away user is deleted. What stays, by
# design, as history: the user's message row, and in the calendar table the calendar journey's
# cancelled appointment (username and type name smoke-<timestamp>), the capacity journey's three
# cancelled appointments (type name smoke-cap-<timestamp>), the pointer and the booked and
# cancelled events of each, and the deleted-user markers of the three users, which the deletion
# through DELETE /users/{username} (docs/IMPLEMENTATION_PLAN.md step 9, journey 11) writes.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/target.sh

[[ $# -eq 1 ]] || die "usage: npm run smoke <stack-name|local>"
load_target "$1"
TARGET=$1

SMOKE_USER="smoke-$(date +%s)"
# The booking's note: the log search of docs/SHARED_CALENDAR_SPEC.md AC-36 looks for "must never
# reach a log". Never printed.
SMOKE_NOTE="smoke-test note ${SMOKE_USER#smoke-}, must never reach a log"
# The assistant's exchange: a read, the same sentence for the fake Claude and the real model. The
# local log search looks for it too. Never printed.
SMOKE_SENTENCE="What are the calendar's settings right now?"
failures=0
skipped=0
created=false # POST /users was sent: the user may exist
deleted=false # DELETE /users/{username} answered 204: nothing left to clean up

pass() { echo "PASS  $*"; }
# skip <check>: a check the local stack cannot run; never used against a stack.
skip() {
  echo "SKIP  $*"
  skipped=$((skipped + 1))
}
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
cal_done=false # the calendar journey ended with its window and type deleted
# The capacity journey's names, and what it created and has not removed yet: the type and window
# ids, the booked appointments' ids (space-separated), the write sent whose answer has not been
# read yet (cap_pending: type, window or appointment, with the User of an appointment), and its
# two extra Users, created and removed like the throw-away user.
CAP_TYPE="smoke-cap-${SMOKE_USER#smoke-}"
CAP_USER_B="$SMOKE_USER-b"
CAP_USER_C="$SMOKE_USER-c"
cap_type_id=""
cap_window_id=""
cap_appts=""
cap_pending=""
cap_pending_user=""
cap_token=""
cap_b_created=false
cap_b_deleted=false
cap_c_created=false
cap_c_deleted=false
# The assistant's message was sent and its conversation not ended yet: clean-up ends it.
asst_open=false

# Ends the throw-away user's conversation with the assistant, then removes what the calendar
# journey created, then removes the throw-away user straight in Cognito if the API did not
# delete it.
cleanup() {
  local status=$? err
  assistant_cleanup
  calendar_cleanup
  capacity_cleanup
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
# appointment, then deletes the window, then the type, the order docs/SHARED_CALENDAR_SPEC.md
# R-TYPE-03 and R-AV-03 require. Safe to run twice.
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

# cal_fail <check>: a failed calendar check; what was created so far is removed at once, so the
# user's deletion still runs on a clean calendar.
cal_fail() {
  fail "calendar: $*"
  calendar_cleanup
}

# The calendar journey of docs/SHARED_CALENDAR_SPEC.md section 18.4. Stops at the first failed
# check.
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
    cal_done=true
  else
    cal_fail "DELETE /calendar/types/$cal_type_id -> $STATUS $(error_code)"
  fi
}

# cap_user_delete <username> <created flag name> <deleted flag name>: removes one of the capacity
# journey's Users through DELETE /users/{username}, as the Administrator, if it was created and not
# removed yet; straight in Cognito when the API fails. Quiet unless something is left behind.
cap_user_delete() {
  local name=$1 err
  [[ "${!2}" == true && "${!3}" == false ]] || return 0
  if [[ -n "${admin_token:-}" ]]; then
    api DELETE "/users/$name" "$admin_token"
    if [[ "$STATUS" == 204 ]]; then
      echo "cleanup: $name deleted"
      printf -v "$3" '%s' true
      return 0
    elif [[ "$STATUS" == 404 ]]; then
      printf -v "$3" '%s' true
      return 0
    fi
  fi
  if err=$(idp admin-delete-user --user-pool-id "$POOL_ID" --username "$name" 2>&1) ||
    [[ "$err" == *UserNotFoundException* ]]; then
    echo "cleanup: $name deleted directly in Cognito"
    printf -v "$3" '%s' true
  else
    echo "CLEANUP FAILED: $name may still exist in pool $POOL_ID; delete it in the Cognito console." >&2
    cal_cleanup_failed=true
  fi
}

# Finds what a capacity write may have created when its answer was never read (timeout, Ctrl-C):
# the type by its name, the window by its type and start, an appointment by its User and start.
capacity_resolve_pending() {
  local id=""
  case "$cap_pending" in
    type)
      api GET /calendar/types "$admin_token"
      [[ "$STATUS" == 200 ]] &&
        id=$(cal get 'const x = (b.types || []).find((y) => y.name === a[0]); return x ? x.typeId : "";' "$CAP_TYPE") || id=""
      [[ -n "$id" ]] && cap_type_id=$id
      ;;
    window)
      api GET "/calendar?from=$cal_date&to=$cal_date" "$admin_token"
      [[ "$STATUS" == 200 ]] &&
        id=$(cal get 'const w = (b.days || []).flatMap((d) => d.windows || []).find((y) => y.source === "one_off" && y.typeId === a[0] && y.start === a[1]); return w ? w.sourceId : "";' "$cap_type_id" "$cal_start") || id=""
      [[ -n "$id" ]] && cap_window_id=$id
      ;;
    appointment)
      api GET "/calendar/appointments?upcoming=true&username=$cap_pending_user" "$admin_token"
      [[ "$STATUS" == 200 ]] &&
        id=$(cal get 'const x = (b.appointments || []).find((y) => y.start === a[0]); return x ? x.appointmentId : "";' "$cal_start") || id=""
      [[ -n "$id" ]] && cap_appts="$cap_appts $id"
      ;;
  esac
  if [[ "$STATUS" != 200 ]]; then
    cleanup_failed "a $cap_pending of the capacity journey may exist (no answer to its creation; lookup failed)"
  fi
  cap_pending=""
}

# Removes what the capacity journey created, as the Administrator: cancels its appointments, then
# deletes the window, then the type (the order docs/SHARED_CALENDAR_SPEC.md R-TYPE-03 and R-AV-03
# require), then removes the two extra Users. Safe to run twice.
capacity_cleanup() {
  local id
  if [[ -n "${admin_token:-}" ]]; then
    [[ -z "$cap_pending" ]] || capacity_resolve_pending
    for id in $cap_appts; do
      api POST "/calendar/appointments/$id/cancel" "$admin_token"
      if [[ "$STATUS" == 200 ]]; then
        echo "cleanup: appointment $id cancelled"
      else
        cleanup_failed "appointment $id of the capacity journey, still booked"
      fi
    done
    cap_appts=""
    if [[ -n "$cap_window_id" ]]; then
      api DELETE "/calendar/windows/$cap_window_id" "$admin_token"
      if [[ "$STATUS" == 204 ]]; then
        echo "cleanup: one-off window $cap_window_id deleted"
      else
        cleanup_failed "one-off window $cap_window_id ($cal_date 03:00-04:00, type $CAP_TYPE)"
      fi
      cap_window_id=""
    fi
    if [[ -n "$cap_type_id" ]]; then
      api DELETE "/calendar/types/$cap_type_id" "$admin_token"
      if [[ "$STATUS" == 204 ]]; then
        echo "cleanup: type $cap_type_id ($CAP_TYPE) deleted"
      else
        cleanup_failed "type $cap_type_id ($CAP_TYPE)"
      fi
      cap_type_id=""
    fi
  fi
  cap_user_delete "$CAP_USER_B" cap_b_created cap_b_deleted
  cap_user_delete "$CAP_USER_C" cap_c_created cap_c_deleted
}

# cap_fail <check>: a failed capacity check; what was created so far is removed at once.
cap_fail() {
  fail "capacity: $*"
  capacity_cleanup
}

# cap_book <username> <token> <overbook true|false> [self]: POST /calendar/appointments for
# <username> at the journey's hour; with "self" the request is the User's own (no username in the
# body). Sets STATUS and BODY; an appointment the answer says was made is remembered for clean-up,
# whatever the check expected.
cap_book() {
  local body id
  if [[ "${4:-}" == self ]]; then
    body="{\"start\": \"$cal_start\""
  else
    body="{\"username\": \"$1\", \"start\": \"$cal_start\""
  fi
  [[ "$3" == true ]] && body="$body, \"overbook\": true"
  body="$body}"
  cap_pending="appointment"
  cap_pending_user=$1
  api POST /calendar/appointments "$2" "$body"
  [[ "$STATUS" == 000 ]] || cap_pending=""
  if [[ "$STATUS" == 201 ]]; then
    id=$(field appointmentId)
    [[ -n "$id" ]] && cap_appts="$cap_appts $id"
  fi
}

# cap_booked <username>: the answer in BODY is the appointment of <username>, booked, at the
# journey's hour, 60 minutes, of the capacity journey's type.
cap_booked() {
  cal test 'return b.status === "booked" && b.username === a[0] && b.start === a[1] && b.end === a[2] && b.typeId === a[3];' \
    "$1" "$cal_start" "$cal_end" "$cap_type_id"
}

# The capacity journey (docs/SHARED_CALENDAR_SPEC.md decisions D24 to D31), after the calendar
# journey, on its date and in its hour, which that journey found free and has emptied again: a
# throw-away type of capacity 2 and its window; a User's own overbook refused with nothing written
# (docs/SHARED_CALENDAR_SPEC.md AC-41); two Users booked into the slot by the Administrator; the
# slot full in the Administrator's view and absent, its hour busy, in a third User's view
# (docs/SHARED_CALENDAR_SPEC.md R-SLOT-03, R-SLOT-04, R-SLOT-06); the third refused slot_taken,
# then booked with overbook (docs/SHARED_CALENDAR_SPEC.md R-BOOK-07 and R-BOOK-13); the first
# booked again, forced, refused user_busy (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12). Then everything
# is removed. Stops at the first failed check.
capacity_journey() {
  local password id status
  cap_b_created=true
  api POST /users "$admin_token" "{\"username\": \"$CAP_USER_B\"}"
  password=""
  if [[ "$STATUS" == 201 && "$(field username)" == "$CAP_USER_B" ]]; then password=$(field password); fi
  BODY=""
  if [[ -n "$password" ]]; then
    pass "capacity: POST /users $CAP_USER_B -> 201 with a password"
  else
    cap_fail "POST /users $CAP_USER_B -> $STATUS"
    return 0
  fi
  password=""

  cap_c_created=true
  api POST /users "$admin_token" "{\"username\": \"$CAP_USER_C\"}"
  password=""
  if [[ "$STATUS" == 201 && "$(field username)" == "$CAP_USER_C" ]]; then password=$(field password); fi
  status=$STATUS
  BODY=""
  if [[ -n "$password" ]] && cap_token=$(printf '%s' "$password" | sign_in "$CAP_USER_C"); then
    pass "capacity: POST /users $CAP_USER_C -> 201, signed in as it"
  else
    cap_token=""
    cap_fail "POST /users $CAP_USER_C -> $status, or its sign-in failed"
    return 0
  fi
  password=""

  cap_pending="type"
  api POST /calendar/types "$admin_token" "{\"name\": \"$CAP_TYPE\", \"capacity\": 2}"
  [[ "$STATUS" == 000 ]] || cap_pending=""
  [[ "$STATUS" == 201 ]] && cap_type_id=$(field typeId)
  if [[ -n "$cap_type_id" ]] && cal test 'return b.name === a[0] && b.capacity === 2;' "$CAP_TYPE"; then
    pass "capacity: POST /calendar/types $CAP_TYPE capacity 2 -> 201, capacity 2"
  else
    cap_fail "POST /calendar/types $CAP_TYPE capacity 2 -> $STATUS $(error_code)"
    return 0
  fi

  cap_pending="window"
  api POST /calendar/windows "$admin_token" \
    "{\"date\": \"$cal_date\", \"start\": \"03:00\", \"end\": \"04:00\", \"typeId\": \"$cap_type_id\"}"
  [[ "$STATUS" == 000 ]] || cap_pending=""
  [[ "$STATUS" == 201 ]] && cap_window_id=$(field windowId)
  if [[ -n "$cap_window_id" ]]; then
    pass "capacity: POST /calendar/windows $cal_date 03:00-04:00 of $CAP_TYPE -> 201"
  else
    cap_fail "POST /calendar/windows $cal_date 03:00-04:00 of $CAP_TYPE -> $STATUS $(error_code)"
    return 0
  fi

  # A User's own overbook, on a slot with both places left: refused before any check of the
  # calendar, and nothing is written (the Administrator's list of that User's appointments is empty).
  cap_book "$CAP_USER_C" "$cap_token" true self
  status=$STATUS
  id=$(error_code)
  api GET "/calendar/appointments?upcoming=true&username=$CAP_USER_C" "$admin_token"
  if [[ "$status" == 403 && "$id" == forbidden && "$STATUS" == 200 ]] &&
    cal test 'return (b.appointments || []).length === 0;'; then
    pass "capacity: overbook: true as $CAP_USER_C -> 403 forbidden, nothing written"
  else
    cap_fail "overbook: true as $CAP_USER_C -> $status $id (its appointments: $STATUS)"
    return 0
  fi

  cap_book "$SMOKE_USER" "$admin_token" false
  if [[ "$STATUS" == 201 ]] && cap_booked "$SMOKE_USER"; then
    pass "capacity: book $cal_date 03:00 for $SMOKE_USER -> 201 (1 of 2)"
  else
    cap_fail "book $cal_date 03:00 for $SMOKE_USER -> $STATUS $(error_code)"
    return 0
  fi
  cap_book "$CAP_USER_B" "$admin_token" false
  if [[ "$STATUS" == 201 ]] && cap_booked "$CAP_USER_B"; then
    pass "capacity: book $cal_date 03:00 for $CAP_USER_B -> 201 (2 of 2)"
  else
    cap_fail "book $cal_date 03:00 for $CAP_USER_B -> $STATUS $(error_code)"
    return 0
  fi

  api GET "/calendar?from=$cal_date&to=$cal_date" "$admin_token"
  if [[ "$STATUS" == 200 ]] &&
    cal test 'const s = (b.days || []).flatMap((d) => d.slots || []).filter((x) => x.start === a[0] && x.typeId === a[1]); const n = (b.appointments || []).filter((x) => x.start === a[0] && x.typeId === a[1]).length; return s.length === 1 && s[0].capacity === 2 && s[0].placesLeft === 0 && n === 2;' \
      "$cal_start" "$cap_type_id"; then
    pass "capacity: the Administrator's view: the slot 03:00 with capacity 2, placesLeft 0, 2 appointments"
  else
    cap_fail "the Administrator's view of $cal_date -> $STATUS $(error_code), or the slot 03:00 not full"
    return 0
  fi

  api GET "/calendar?from=$cal_date&to=$cal_date" "$cap_token"
  if [[ "$STATUS" == 200 ]] &&
    cal test 'const d = (b.days || [])[0] || {}, s = Date.parse(a[0]), e = Date.parse(a[1]); return !(d.slots || []).some((x) => x.start === a[0]) && (d.busy || []).some((x) => Date.parse(x.start) <= s && e <= Date.parse(x.end));' \
      "$cal_start" "$cal_end"; then
    pass "capacity: $CAP_USER_C's view: the slot 03:00 not offered, 03:00-04:00 busy"
  else
    cap_fail "$CAP_USER_C's view of $cal_date -> $STATUS $(error_code), or the slot 03:00 still offered"
    return 0
  fi

  cap_book "$CAP_USER_C" "$admin_token" false
  if [[ "$STATUS" == 409 && "$(error_code)" == slot_taken ]]; then
    pass "capacity: book $cal_date 03:00 for $CAP_USER_C -> 409 slot_taken"
  else
    cap_fail "book $cal_date 03:00 for $CAP_USER_C -> $STATUS $(error_code), expected 409 slot_taken"
    return 0
  fi
  cap_book "$CAP_USER_C" "$admin_token" true
  if [[ "$STATUS" == 201 ]] && cap_booked "$CAP_USER_C"; then
    pass "capacity: book $cal_date 03:00 for $CAP_USER_C with overbook: true -> 201 (3 of 2)"
  else
    cap_fail "book $cal_date 03:00 for $CAP_USER_C with overbook: true -> $STATUS $(error_code)"
    return 0
  fi
  cap_book "$SMOKE_USER" "$admin_token" true
  if [[ "$STATUS" == 409 && "$(error_code)" == user_busy ]]; then
    pass "capacity: book $cal_date 03:00 for $SMOKE_USER again with overbook: true -> 409 user_busy"
  else
    cap_fail "book $cal_date 03:00 for $SMOKE_USER again with overbook: true -> $STATUS $(error_code), expected 409 user_busy"
    return 0
  fi

  status=""
  for id in $cap_appts; do
    api POST "/calendar/appointments/$id/cancel" "$admin_token"
    if [[ "$STATUS" == 200 ]] && cal test 'return b.status === "cancelled";'; then
      cap_appts=${cap_appts/ $id/}
    else
      status="$id -> $STATUS $(error_code)"
      break
    fi
  done
  if [[ -z "$status" && -z "${cap_appts// /}" ]]; then
    cap_appts=""
    pass "capacity: the 3 appointments cancelled by the Administrator -> 200 each"
  else
    cap_fail "cancel $status"
    return 0
  fi

  api DELETE "/calendar/windows/$cap_window_id" "$admin_token"
  if [[ "$STATUS" == 204 ]]; then
    pass "capacity: DELETE /calendar/windows/$cap_window_id -> 204"
    cap_window_id=""
  else
    cap_fail "DELETE /calendar/windows/$cap_window_id -> $STATUS $(error_code)"
    return 0
  fi
  api DELETE "/calendar/types/$cap_type_id" "$admin_token"
  if [[ "$STATUS" == 204 ]]; then
    pass "capacity: DELETE /calendar/types/$cap_type_id -> 204"
    cap_type_id=""
  else
    cap_fail "DELETE /calendar/types/$cap_type_id -> $STATUS $(error_code)"
    return 0
  fi

  cap_token=""
  api DELETE "/users/$CAP_USER_B" "$admin_token"
  [[ "$STATUS" == 204 ]] && cap_b_deleted=true
  status=$STATUS
  api DELETE "/users/$CAP_USER_C" "$admin_token"
  [[ "$STATUS" == 204 ]] && cap_c_deleted=true
  if [[ "$cap_b_deleted" == true && "$cap_c_deleted" == true ]]; then
    pass "capacity: DELETE /users/$CAP_USER_B and /users/$CAP_USER_C -> 204"
  else
    cap_fail "DELETE /users/$CAP_USER_B -> $status, /users/$CAP_USER_C -> $STATUS"
  fi
}

# new_password: a password from the generator of POST /users (src/lib/password.ts), on stdout for
# the caller's variable only; fails unless it passes the page's rule, shared/src/password.ts. Both
# files are TypeScript, which Node 22 runs, stripping the types, as cal does.
new_password() {
  node --disable-warning=ExperimentalWarning -e '
const path = require("path"), { pathToFileURL } = require("url");
const load = (file) => import(pathToFileURL(path.resolve(file)).href);
Promise.all([load("src/lib/password.ts"), load("../shared/src/password.ts")]).then(([g, s]) => {
  const p = g.generatePassword();
  if (s.passwordProblems(p).length > 0) process.exit(1);
  process.stdout.write(p);
}).catch(() => process.exit(1));'
}

# The change of the throw-away user's own password (the header says what and why). Stops at the
# first failed check that leaves nothing to test; user_password follows the password the user has.
password_journey() {
  local tokens access refresh old new wrong err
  if ! tokens=$(printf '%s' "$user_password" | cognito tokens "$CLIENT_ID" "$SMOKE_USER"); then
    fail "password: sign-in as $SMOKE_USER for its access and refresh tokens"
    return 0
  fi
  access=${tokens%%$'\n'*}
  refresh=${tokens#*$'\n'}
  refresh=${refresh%$'\n'}
  tokens=""
  old=$user_password
  if ! new=$(new_password) || ! wrong=$(new_password) || [[ "$new" == "$old" || "$wrong" == "$old" ]]; then
    fail "password: no new password from src/lib/password.ts that passes shared/src/password.ts"
    return 0
  fi

  if err=$(printf '%s\n%s\n%s\n' "$access" "$wrong" "$new" | cognito change-password 2>&1); then
    user_password=$new
    fail "password: ChangePassword with a wrong current password succeeded"
    return 0
  elif [[ "$err" == NotAuthorizedException* || "$err" == InvalidPasswordException* ]]; then
    pass "password: ChangePassword with a wrong current password is refused (${err%% *})"
  else
    fail "password: ChangePassword with a wrong current password is refused for an unexpected reason: $err"
    return 0
  fi

  if err=$(printf '%s\n%s\n%s\n' "$access" "$old" "$new" | cognito change-password 2>&1); then
    user_password=$new
    pass "password: ChangePassword as $SMOKE_USER succeeds"
  else
    # The answer may have been lost after the change was made: the password the user has decides.
    if printf '%s' "$new" | sign_in "$SMOKE_USER" >/dev/null 2>&1; then user_password=$new; fi
    fail "password: ChangePassword as $SMOKE_USER -> $err"
    return 0
  fi

  if err=$(printf '%s\n' "$refresh" | cognito refresh "$CLIENT_ID" 2>&1); then
    pass "password: the refresh token from before the change still works after ChangePassword alone"
  else
    fail "password: the refresh token from before the change is refused after ChangePassword alone: $err"
  fi

  if [[ "$TARGET" == local ]]; then
    skip "password: GlobalSignOut (cognito-local has none, docs/ARCHITECTURE.md section 8)"
    skip "password: the refresh token from before the change refused after GlobalSignOut"
  elif err=$(printf '%s\n' "$access" | cognito sign-out 2>&1); then
    pass "password: GlobalSignOut with the access token from before the change succeeds"
    if err=$(printf '%s\n' "$refresh" | cognito refresh "$CLIENT_ID" 2>&1); then
      fail "password: the refresh token from before the change still works after GlobalSignOut"
    elif [[ "$err" == NotAuthorizedException* ]]; then
      pass "password: the refresh token from before the change is refused after GlobalSignOut (NotAuthorizedException)"
    else
      fail "password: the refresh token from before the change is refused for an unexpected reason: $err"
    fi
  else
    fail "password: GlobalSignOut with the access token from before the change -> $err"
  fi
  access=""
  refresh=""

  if err=$(printf '%s' "$old" | sign_in "$SMOKE_USER" 2>&1 >/dev/null); then
    fail "password: the old password still signs in"
  elif [[ "$err" == NotAuthorizedException* || "$err" == InvalidPasswordException* ]]; then
    pass "password: the old password no longer signs in (${err%% *})"
  else
    fail "password: the old password fails to sign in for an unexpected reason: $err"
  fi
  if printf '%s' "$new" | sign_in "$SMOKE_USER" >/dev/null; then
    pass "password: the new password signs in"
  else
    fail "password: the new password does not sign in"
  fi
}

# reply <code>: what the JavaScript body <code> returns for the assistant's answer in BODY, as text
# (a status, a count; never a text of the conversation). Through cal get, which reads stdin.
reply() { cal get "return String($1);"; }

# Ends the throw-away user's conversation if the exchange sent its message and did not end it.
assistant_cleanup() {
  [[ "$asst_open" == true && -n "${user_token:-}" ]] || return 0
  asst_open=false
  api DELETE /assistant/conversation "$user_token"
  if [[ "$STATUS" == 204 ]]; then
    echo "cleanup: the assistant's conversation of $SMOKE_USER ended"
  else
    cleanup_failed "the assistant's conversation of $SMOKE_USER (it runs out by itself within two days)"
  fi
}

# The assistant's exchange, as the throw-away user. Stops at the first failed check, but always
# ends the conversation once the message was sent.
assistant_exchange() {
  local before="" after steps=1 said=0 n status code
  api DELETE /assistant/conversation "$user_token"
  if [[ "$STATUS" != 204 ]]; then
    fail "assistant: DELETE /assistant/conversation -> $STATUS $(error_code)"
    return 0
  fi
  api GET /assistant/conversation "$user_token"
  [[ "$STATUS" == 200 ]] && before=$(reply 'b.remainingToday') || before=""
  if [[ "$before" =~ ^[0-9]+$ ]]; then
    pass "assistant: DELETE /assistant/conversation -> 204, GET -> 200 ($before messages left today)"
  else
    fail "assistant: GET /assistant/conversation -> $STATUS $(error_code)"
    return 0
  fi

  asst_open=true
  api POST /assistant/messages "$user_token" "{\"text\": \"$SMOKE_SENTENCE\"}"
  if [[ "$STATUS" == 200 ]]; then
    pass "assistant: POST /assistant/messages -> 200, status $(reply 'b.status')"
  else
    code=$(error_code)
    if [[ "$STATUS" == 503 && "$code" == assistant_unavailable ]]; then
      fail "assistant: POST /assistant/messages -> 503 assistant_unavailable: no key yet, or Anthropic unavailable"
    else
      fail "assistant: POST /assistant/messages -> $STATUS $code"
    fi
    assistant_end
    return 0
  fi
  said=$(reply '(b.messages || []).filter((m) => m.from === "assistant").length') || said=0

  # The first step was the message; each continue is one step more, eight in all at most.
  while [[ "$(reply 'b.status')" == working ]] && (( steps < 8 )); do
    api POST /assistant/continue "$user_token"
    if [[ "$STATUS" != 200 ]]; then
      fail "assistant: POST /assistant/continue (step $((steps + 1))) -> $STATUS $(error_code)"
      assistant_end
      return 0
    fi
    steps=$((steps + 1))
    n=$(reply '(b.messages || []).filter((m) => m.from === "assistant").length') || n=0
    said=$((said + ${n:-0}))
  done

  status=$(reply 'b.status') || status=""
  if [[ "$status" == idle ]]; then
    pass "assistant: the exchange ended idle after $steps steps"
  else
    fail "assistant: the exchange is $status after $steps steps"
    assistant_end
    return 0
  fi
  if (( steps >= 2 )); then
    pass "assistant: a read was run ($steps steps: a read, then the answer)"
  else
    fail "assistant: no read was run (answered in $steps step)"
  fi
  if (( said >= 1 )); then
    pass "assistant: the answer holds $said message(s) of the assistant"
  else
    fail "assistant: the answer holds no message of the assistant"
  fi
  after=$(reply 'b.remainingToday') || after=""
  if [[ "$after" == "$((before - 1))" ]]; then
    pass "assistant: $after messages left today, one less"
  else
    fail "assistant: $after messages left today, expected $((before - 1))"
  fi
  assistant_end
}

# assistant_end: ends the conversation after the message, as a check of its own.
assistant_end() {
  asst_open=false
  api DELETE /assistant/conversation "$user_token"
  if [[ "$STATUS" == 204 ]]; then
    pass "assistant: DELETE /assistant/conversation -> 204, the conversation ended"
  else
    fail "assistant: DELETE /assistant/conversation at the end -> $STATUS $(error_code)"
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

# docs/IMPLEMENTATION_PLAN.md step 9, journey 4: /hello as the Administrator.
api POST /hello "$admin_token"
admin_message_id=$(hello_message_id admin "Hello World, the Administrator is speaking")
if [[ "$STATUS" == 201 && -n "$admin_message_id" ]]; then
  pass "journey 4: /hello as $ADMIN_USERNAME -> 201, Administrator message"
else
  fail "journey 4: /hello as $ADMIN_USERNAME -> $STATUS $BODY"
fi

# docs/IMPLEMENTATION_PLAN.md step 9, journey 6: create the throw-away user, sign in as it,
# /hello as it (journey 3 of the same step).
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

# Both rows in DynamoDB (docs/ARCHITECTURE.md section 9.3).
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

# The calendar journey (docs/SHARED_CALENDAR_SPEC.md section 18.4), before the user is deleted.
if [[ -n "$user_token" ]]; then calendar_journey; fi

# The capacity journey, on the calendar journey's date and hour, only once that journey has ended.
if [[ "$cal_done" == true ]]; then
  capacity_journey
elif [[ -n "$user_token" ]]; then
  fail "capacity: not run, the calendar journey did not end (it gives the date and the hour)"
fi

# The assistant's exchange (docs/ARCHITECTURE.md section 9.3), before the user is deleted.
if [[ -n "$user_token" ]]; then assistant_exchange; fi

# The change of its own password (docs/ARCHITECTURE.md section 6.9), before the user is deleted.
if [[ -n "$user_token" ]]; then password_journey; fi

# docs/IMPLEMENTATION_PLAN.md step 9, journey 11: delete the throw-away user; it can no longer
# sign in, with the password it has at the end (the new one after a change); its message row stays.
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
if (( skipped > 0 )); then
  echo "Smoke test PASSED ($skipped check(s) skipped on the local stack)."
else
  echo "Smoke test PASSED."
fi
