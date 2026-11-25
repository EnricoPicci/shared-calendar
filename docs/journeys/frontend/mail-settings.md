# The "the daily mail settings" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/mail-settings.test.ts` |
| `describe` | `the daily mail settings` |
| Tests | 1. "the Administrator saves another hour, switched off, and reads it back"<br>2. "an hour of 24 is refused before any request; the settings are unchanged"<br>3. "a User is refused both: forbidden" |
| Runs against | the local stack: the API on port 3000 and cognito-local on port 9229 (`RUN_INTEGRATION=1`); e-mail is on there (`MAIL_STAGE` `on` in `env.local.json`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[the daily mail in the journeys](../concepts.md#the-daily-mail-in-the-journeys).

## What this block proves

- `MailSettingsService` reads and saves the daily mail's settings with `GET` and
  `PUT /mail/settings`, the Administrator's alone (`docs/FRONTEND_SERVICES.md` section 25,
  `docs/EMAIL_ARCHITECTURE.md` section 9.1).
- An hour outside 0 to 23 never leaves the browser: the service checks it with the shared
  `MailSettingsBody` first.

## Who takes part

- **The Administrator** (`admin`): reads, saves and writes back the settings.
- **`alice`**: a plain User, refused both routes.

No mail is sent: the daily run itself is the back end's journey
([the daily mail](../backend/mail-daily.md)).

## Before the block starts

The `beforeAll` signs in `admin` and `alice`, then reads the settings as `admin`
(`getSettings()`) and keeps them as `found`; a read that does not succeed stops the block. On a
stack where nobody saved them, `found` is the defaults, on at 7.

## Test 1: another hour, saved and read back

The test makes `other`: the switch the other way from `found`, and the hour five later, round the
clock (`(found.dailyHour + 5) % 24`), so that both values differ from those found. As `admin` it
calls `updateSettings(other)`, whose result arrives on `updateResult$`, and checks
`{ status: 'success', settings: other }`: the route answered the values as saved. It then calls
`getSettings()`, on `settingsResult$`, and checks the same values come back.

## Test 2: an hour of 24

The test reads the settings first, then calls `updateSettings({ dailyEnabled: true, dailyHour:
24 })` and checks a `failure` with the reason `invalid_request`. The service refused it with
`MailSettingsBody` of `shared/src/mail/` and sent nothing (`invalidRequest()`); the test does not
count requests. It checks a second read answers the same as the first: nothing changed.

## Test 3: a User

As `alice`, the test checks that `getSettings()` and `updateSettings({ dailyEnabled: true,
dailyHour: 7 })` both end in a `failure` with the reason `forbidden`: the API's `403`. The save's
body passes the shared rule, so this request leaves, and the route refuses it for the role before
it looks at the body (`docs/ARCHITECTURE.md` section 4).

## What the block leaves

The `afterAll` saves `found` again and checks the answer is `{ status: 'success', settings:
found }`: the settings are as the block found them (on a fresh stack, saved now with the
defaults' values). It clears both sessions, which stops their expiry timers. Nothing else is
written.

## If the block fails halfway

A failed check skips the rest of its test; the later tests still run, and need nothing from the
one before. The `afterAll` runs whatever happens and writes back `found`, unless the
`beforeAll`'s read failed, when nothing was changed. A run killed before the `afterAll` leaves
test 1's `other`: the next run reads it as its `found` and writes that back, so it stays until
someone saves the settings by hand.

## Where in the code

| Method | Stream | Route |
|---|---|---|
| `MailSettingsService.getSettings()` | `settingsResult$` | `GET /mail/settings` |
| `MailSettingsService.updateSettings(settings)` | `updateResult$` | `PUT /mail/settings` |

| What | Where |
|---|---|
| The service | `frontend/src/services/mail-settings.service.ts`, its types `mail-settings.types.ts` |
| The routes | `backend/src/handlers/getMailSettings.ts`, `backend/src/handlers/updateMailSettings.ts` |
| Test helpers | in the file: `read()`, `save()`; in `frontend/tests/integration/local.ts`: `signedIn()`, `outcome()` |
| Constants | `API` of `frontend/tests/integration/local.ts` |
