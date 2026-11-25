# backend/

The API: Lambda handlers behind an HTTP API, with Cognito and DynamoDB. This file adds to the
root `CLAUDE.md`, whose rules all apply here. Behaviour, contract and data model:
`docs/ARCHITECTURE.md` and `docs/SHARED_CALENDAR_SPEC.md`. The commands in full, and the local
stack's quirks: `docs/COMMANDS.md`.

Paths in this file are relative to `backend/`.

## Folder map

- `package.json` (name `backend`, scripts), `template.yaml`, `samconfig.toml`,
  `docker-compose.yml`, `tsconfig.json`, `vitest.config.ts`.
- `src/handlers/`: one Lambda entry point per file.
- `src/assistant/`: the assistant's core, which the assistant's handlers call.
- `src/lib/`: back-end modules; the only place that touches the AWS SDK.
- `tests/unit/`: vitest unit tests, mirroring `src/` (e.g. `tests/unit/lib/http.test.ts`).
- `tests/integration/`: end-to-end tests against the local Docker stack; they refuse to start
  when `env.local.json` does not wire the fake Claude (`claudeWiringProblem()`): `setup.ts` (helpers,
  including `resetCalendarTable()`, `putCalendarItem()`, `getCalendarItem()`,
  `deleteCalendarItem()`, `queryCalendarPartition()`), `journeys.test.ts` (the journeys of
  `docs/IMPLEMENTATION_PLAN.md` step 9), `calendar.test.ts` (the calendar's journeys),
  `mail.test.ts` (the mail's, which also need `local:lambda` and the fake mail).
- `scripts/`: shell scripts behind the npm scripts (`local-seed.sh`, `local-api.sh`,
  `local-lambda.sh`, `mail-send.sh`, `mail-daily.sh`, `verify.sh`, `deploy.sh`, `bootstrap-admin.sh`, `test-user.sh`, `smoke.sh`,
  `assistant-key.sh`, `assistant-eval.sh`, `budget.sh`, `check-sam.sh`; `target.sh`,
  `cognito.mjs` and `parameters.mjs` are helpers of those).
- `docker/`: files for the local stack (`cognito-local-config.json`; `fake-claude.mjs`, the
  fake Claude, whose answers are `tests/integration/fake-claude/answers.json`:
  `docs/ARCHITECTURE.md` section 8; `fake-mail.mjs`, the fake mail, a stand-in for SES).
- Generated, git-ignored: `env.local.json`, `.cognito/`, `.aws-sam/`, `.verify-ok`, `coverage/`.

## `src/lib/`

- `calendarDb.ts` is the only module that knows the `calendar` table's item layout and the
  calendar lock (`withCalendarLock`); its configuration (`calendarConfig()`) is read once per
  container.
  - Its locked writes take the rule check as a callback (`check`), run on the data read inside
    the locked attempt; the writes that compare themselves with the rest of the calendar get
    the availability state (`CalendarState`: types, patterns, overrides and one-off windows
    from today, appointments from now − 24 h).
  - Availability writes: patterns, `setOverride`, `deleteOverride`, `createOneOffWindow`,
    `deleteOneOffWindow` (a window by id: the state first, the whole `WINDOW` partition only on
    a miss, to tell a past window, `date_in_past`, from an unknown one).
  - Booking: `bookAppointment` (settings and state read inside the attempt; one transaction of
    five items: lock, `APPT`, `APPTID`, `EVENT`, a `ConditionCheck` on the `DELETEDUSER#<sub>`
    marker, whose failure `withCalendarLock` answers through the plan's `onConditionFailed`,
    without a retry).
  - Appointments by id (`readAppointment`, internal: `GetItem APPTID#<id>` → `GetItem APPT`,
    inside the locked attempt): `cancelAppointment` and `updateAppointmentNote` (check callback
    on the appointment or `null`; three items: lock, an `Update` of the changed `APPT`
    attributes, `EVENT`; an unchanged note writes nothing).
  - `changeAppointment` (settings, state and the old appointment read inside the attempt,
    check callback on the three; six items: lock, an `Update` of the old `APPT`, `Put` of the
    new `APPT` and its `APPTID`, `EVENT`, the marker `ConditionCheck` on the old one's `userId`).
  - User deletion: `markUserDeleted` (`docs/SHARED_CALENDAR_SPEC.md` section 10.2; chunks of
    `DELETION_CHUNK` = 40, each under the lock: the `sub`'s `booked` `APPT` with `end > now`;
    the first chunk also writes the `DELETEDUSER#<sub>` marker; per appointment an `Update`
    with `cancelReason` `user_deleted` and `Put EVENT`, its event id kept across retries).
  - `listAppointments` (a read: a range as the view, or upcoming `SK ≥ now − 24 h` with
    `end > now`; owner by `userId` or stored `username`; status; by start).
- `assistantDb.ts` is the only module that knows the `assistant` table's item layout
  (`docs/ARCHITECTURE.md` section 5.4); `assistantConfig()` is read once per container. It
  never deletes, never retries and never logs: a writer that lost the race gets
  `AssistantBusyError`. `readConversation` (two reads; gives the `version` every write must
  name), `startConversation`, `saveStep`, `takeProposal` (`null` when not taken),
  `endConversation`, `readDailyUse`; "now" and the time zone are passed in.
- `anthropic.ts` is the one door to Claude and **the only file that imports
  `@anthropic-ai/sdk`** (`npm run lint` refuses it elsewhere, its unit test excepted).
  `askStep` and `askLanguage` answer one of a closed list (`text`, `tool_requests`,
  `cut_short`, `refusal`, `unavailable` with a reason, `budget_reached`) and never throw for
  what Anthropic did: only `AnthropicConfigError` (`ASSISTANT_MODEL` missing, a bad `ASSISTANT_EFFORT`). It logs nothing
  and gives back nothing of Anthropic's own words. The key: `ANTHROPIC_API_KEY`, else the
  parameter named in `ANTHROPIC_KEY_PARAMETER`, kept ten minutes. "now" is passed in.
- `parameters.ts`: `readParameter(name)`, one decrypted read of Parameter Store, `null` when
  the parameter does not exist. The value is a secret: never log it.
- `calendarEvents.ts`: builds the `EVENT` item (`appointmentEvent`, the `AppointmentSnapshot`
  of the stored appointment; types `booked`, `cancelled`, `note_updated`, and `changed` with
  `previous`, the old appointment as stored after the change, a key the other types never
  have), pure; ids and "now" passed in.
- `calendarRules.ts`: the calendar's checks, pure, no AWS, "today", "now" and the zone passed
  in; a failed check is `Refusal` (`{ error, message?, conflicts? }`, code from `ApiErrorCode`).
  Rule names are those of `docs/SHARED_CALENDAR_SPEC.md`.
  - `checkTypeName`, `checkTypeDelete`, `typeNameKey`, and `checkAvailabilityWrite` for every
    availability write: patterns, overrides, one-off windows.
  - `checkBookingTimes`, R-BOOK-02 before the lock, and `checkBooking`, R-BOOK-03..06, 12, 07
    (the places, `peopleIn`) and 09 under it.
  - `checkCancel` (R-CAN-01..03, R-PERM-01 by `sub`) and `checkNote` (R-NOTE-01, answers
    `unchanged`).
  - `checkChange` (its section 8.4: `checkCancel` on the old appointment, then `checkBooking`
    for its User on the state without it).
  - `cancellableUntilFor` (a User on a booked appointment, else `null`); `calendarView`, the
    calendar view built for one caller's role from what `calendarDb.readCalendarRange` reads;
    `toResponse`, an appointment as a response.
- `cognito.ts` also has `getUserSub`, `isPlainUser`, `listPlainUsers` (both groups, every page,
  sorted by code units, each with its state and four facts) and the facts: `createUser` takes
  them, `updateProfile` (`email_verified` true), `getProfile`, `asUserSummary`, `asMe`.
- E-mail (`docs/ARCHITECTURE.md` sections 4 and 5.5): `mailDb.ts`, the only module that knows
  the `mail` table (the day's count, the mail settings, the daily mark, each write one
  conditional write but the settings'; "now" passed in); `excel.ts`, the only file that imports
  `write-excel-file` (`npm run lint`); `ses.ts`, one mail through SESv2; `lambdaInvoke.ts`, the
  mailer started with an `Event` invoke; `mailerEvent.ts`, the mailer's event (never an address)
  and the role's kind. Their handlers: `sendCalendarMail.ts` (`POST /mail/calendar`),
  `getMailSettings.ts` and `updateMailSettings.ts` (`/mail/settings`, admin), and `mailer.ts` (no
  route; kinds `calendar`, `mine` and `daily`, the hourly timer's; the error's name only in its
  log, an SES message can quote an address).
- `http.ts`: `parseJsonBody` for bodies, `parseQuery` for query strings (the object a
  `.strict()` query schema checks).

## `src/assistant/`

The assistant's core (`docs/ARCHITECTURE.md` section 4, "The assistant's routes"). It takes an
identity (`sub`, username, role), never an event or a token, and returns a reply or a refusal
with the fields of the log line; the six assistant handlers turn that into a response and write
the line.

- `config.ts`: `coreConfig()`. `prompt.ts`: `INSTRUCTIONS`, `contextBlock`, `timeLine` and
  `promptVersion`, the mark of the instructions, the block about the person and the role's
  tools. **Changing `INSTRUCTIONS`, or a tool's name, description or schema, ends every
  conversation in progress.**
- `conversation.ts`: no Claude and no handler here, so two functions bundle neither.
  `exchange.ts`: a message, `continue`, and the one step: Claude once, its reads or a proposal,
  one write. `proposal.ts`, `confirm.ts`, `decline.ts`: a proposal stored and settled.
- `tools/`: `tool.ts` (what a tool is), one file per tool, `list.ts` (`DEFINITIONS` without
  the handlers, `TOOLS` with them), `event.ts`, `result.ts`, `run.ts`, `changeHandlers.ts`.
- **A change tool** is a file with its definition (`kind: 'change'`), its `confirmation` (`read`
  gets the facts through a read handler and answers them with the request to run; `summary`
  words them with a function of `shared/src/assistant/`, both languages) and `toModel`; then one
  line in `list.ts` and one in `changeHandlers.ts`. Its file imports no handler that changes
  the calendar or sends a mail (`sendCalendarMail.ts`, a mail, reads `GET /me` and `MAIL_STAGE`).
- The root rule on `confirmProposal`, in code: only `confirm.ts` runs a change, reached from
  `handlers/confirmProposal.ts` alone (`npm run lint` refuses any other import of it, of
  `changeHandlers.ts`, or of a change handler under `src/assistant`).
- The root rule on the calendar, in code: `npm run lint` refuses an import of
  `lib/calendarDb.ts`, `lib/calendarRules.ts` or `lib/calendarEvents.ts` under `src/assistant`.
- The log fields come back from the core as `log`, holding no text (the root rule on logs);
  token counts are `usage: { input, output, cacheRead, cacheWrite }`, because the logger blanks
  every field whose name holds "token".

## `src/handlers/`, the calendar

`getCalendarSettings.ts` and `updateCalendarSettings.ts` are the pattern the other calendar
handlers copy: claims → configuration check → role → path → body → `calendarDb` with the
`calendarRules` check → one log line. Section numbers below are those of
`docs/SHARED_CALENDAR_SPEC.md`.

- Admin only, `date_in_past` from the path or body before the lock (not the window delete):
  the handlers of the types, weekly patterns, date overrides and one-off windows.
- The view: `getCalendar.ts` (`GET /calendar`, both roles).
- Booking: `bookAppointment.ts` (`POST /calendar/appointments`, both roles; the checks in the
  order of its section 8.2, the Administrator's target through Cognito before the lock).
- Appointments: `listAppointments.ts` (`GET /calendar/appointments`, both roles, read-only, no
  Cognito), `updateAppointmentNote.ts` (`PATCH …/{appointmentId}`) and `cancelAppointment.ts`
  (`POST …/{appointmentId}/cancel`), admin or owner (someone else's is 404).
- Change: `changeAppointment.ts` (`POST …/{appointmentId}/change`, admin or owner, no Cognito:
  the User is the old appointment's; `checkBookingTimes` before the lock; the order of its
  section 8.4; logs `appointmentId` and `newAppointmentId`).
- Users: `listUsers.ts` (`GET /users`, admin, Cognito only, no calendar configuration check;
  logs `userCount`).
- `deleteUser.ts` (Hello World's route) has a calendar part: after the admin and group checks,
  `calendarConfig()`, the `sub`, then `calendarDb.markUserDeleted` before the sign-out and
  delete; a failure there answers before any Cognito change (`409 concurrent_update` or `500`);
  logs `cancelledCount` and `lockAttempts`.
- A new calendar function: its variables, and when it needs a line in `scripts/local-seed.sh`
  (never `CALENDAR_TIME_ZONE`): `docs/COMMANDS.md` section 3.2.

## Writing the scripts

- Passwords and tokens in these scripts never go into a command-line argument (visible in
  `ps`) or a file: the Cognito calls carrying a password go through `scripts/cognito.mjs`
  (AWS SDK, password on stdin), the Anthropic key goes the same way through
  `scripts/parameters.mjs`, API calls pass the token to curl with `-H @-`, and JSON answers
  are parsed by `json_field` (node, stdin). The AWS CLI cannot read a request from a pipe, and
  its errors echo the input. Avoid bash here-strings (`<<<`) for secrets: bash 3.2 writes them
  to a temp file.
- The scripts run on macOS (bash 3.2, BSD tools) and Linux (bash 5, GNU tools) and need only
  node, the AWS CLI, curl and git: no jq. JSON is read with node or `--query`. Keep it that
  way: no `sed -i`, `stat`, `date -d`/`-v`, or other flags that differ between the two.
- Never put an e-mail address in `samconfig.toml`: the repository is public.

## Tests

- `vitest.config.ts` has two projects: `unit` (`tests/unit/**/*.test.ts`) and `integration`
  (`tests/integration/**/*.test.ts`). The integration project only selects files when
  `RUN_INTEGRATION=1`; otherwise it runs nothing and exits 0.
- Unit tests mock AWS with `aws-sdk-client-mock`, never real endpoints. `test:unit` fails below
  100 % line coverage on `src/lib` and `src/assistant`.
- The assistant's journeys (`assistant.test.ts`) run against the fake Claude: a sentence gets
  the answers `fake-claude/answers.json` scripts for its exact text, one per step. Each block
  plays its own throw-away User, or `admin`. **They never empty the `calendar` table**, nor do
  the mail's: each creates what it needs through the API on a day of its own, and removes it.
- Tests of the contract itself (what a schema accepts, `resolveRole`) live in `shared/`; the
  back end tests what it does with it (the 400 answer, the handlers).
- Integration files run one at a time and in no fixed order: every file prepares its own state.
- When a journey changes, its page under `docs/journeys/` changes in the same commit, written
  and checked with the project skill `explain-journey` (format, pointer comment and list of
  pages: `docs/journeys/README.md`).
