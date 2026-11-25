# The "the mail of the calendar" journey, in simple words

| | |
|---|---|
| Test file | `frontend/tests/integration/mail.test.ts` |
| `describe` | `the mail of the calendar` |
| Tests | 1. "fe-mail asks for the mail of the week: success, then one mail to their own address, their appointments, none"<br>2. "two dates the wrong way round, or more than 366 days, are refused before any request, and no mail comes"<br>3. "the sixth request of the day is mail_limit_reached, and fe-mail has five mails" |
| Runs against | the local stack: the API on port 3000, cognito-local on port 9229, the functions' invoke on port 3001 (`npm run local:lambda -w backend`) and the fake mail on port 8025 (`RUN_INTEGRATION=1`) |

Ideas used here, explained once for all journeys:
[the people of the local stack](../concepts.md#the-people-of-the-local-stack),
[the four facts of a person](../concepts.md#the-four-facts-of-a-person),
[the front end's services in the journeys](../concepts.md#the-front-ends-services-in-the-journeys),
[refused before sending, or by the API](../concepts.md#refused-before-sending-or-by-the-api),
[the deleted-user marker](../concepts.md#the-deleted-user-marker),
[mail in the journeys](../concepts.md#mail-in-the-journeys).

## What this block proves

- `MailService.sendCalendar()` asks for the mail of two dates with `POST /mail/calendar`; the
  mail goes to the User's own address and holds their own appointments
  (`docs/FRONTEND_SERVICES.md` section 24, `docs/EMAIL_ARCHITECTURE.md` section 9.1).
- Two dates the shared rule refuses never leave the browser; the sixth request of a day is
  `mail_limit_reached` (`docs/EMAIL_ARCHITECTURE.md` section 6.5).

## Who takes part

- **The Administrator** (`admin`): creates and removes `fe-mail`, and asks for no mail: the
  count of a day is kept per `sub`, and `admin`'s would outlive the run.
- **`fe-mail`**: a plain User the block creates, address `fe-mail@example.com`, who asks for
  every mail of the block.
- **The fake mail**, which keeps what the mailer sends; the test reads it with `fetch`, outside
  the services, since it is no part of the API.

## Before the block starts

The `beforeAll` signs `admin` in, removes `fe-mail` if an earlier run left it
(`UsersService.deleteUser()`, accepting `user_not_found`), creates it again with the four facts of
`newUser()` and signs it in. The new account has a new `sub`, so all of the day's five mails, and
no appointment. Then it makes the fake mail forget the mails of `fe-mail@example.com`.

`RANGE` is the week of today, today to today + 6 days, in the default time zone: the dates the
week page proposes.

## Test 1: the mail of the week

`fe-mail` calls `sendCalendar(RANGE)`; the result arrives on `sendCalendarResult$`. The test
checks `{ status: 'success' }`: the route answered `202 { status: "queued" }`. The mailer runs in
the background, so the test waits for the fake to hold a mail for the address
(`mailsOnceThere(1)`), then checks: exactly one mail, to `['fe-mail@example.com']`, a subject
starting `Your appointments, `, the text `You have no appointments in this period.` (the new
account booked nothing, whatever else the calendar holds), and one file,
`my-appointments-<from>-to-<to>.xlsx`.

## Test 2: two dates the shared rule refuses

`fe-mail` calls `sendCalendar()` with the week's dates the wrong way round, then with a range of
367 days. The test checks the two results, `invalid_request` with the messages
`` to: `from` must not be after `to` `` and `to: at most 366 days`: the service checked the range
with `MailCalendarBody` of `shared/src/mail/schemas.ts` and sent nothing. The test checks the fake
still holds one mail for the address. It does not count requests: that no request left is the
service's code (`invalidRequest()`), and that nothing was counted shows in test 3.

## Test 3: the sixth request of the day

1. `fe-mail` asks four more times for `RANGE`; the test checks `success` each time. With test 1's,
   that is five.
2. The sixth time, the test checks `failure` with the reason `mail_limit_reached`.
3. It waits for five mails, then three seconds more, and checks the fake holds exactly five for
   the address: the refused request started no mailer.

## What the block leaves

The `afterAll` removes `fe-mail` through `DELETE /users/{username}` (`deleteUser()`), which
writes the [deleted-user marker](../concepts.md#the-deleted-user-marker); `fe-mail` has no
appointment to cancel. It makes the fake mail forget the address's mails. In the table `mail`
the day's count of five stays, under a `sub` no account has any more, marked to expire two days
later.

## If the block fails halfway

A failed check skips the rest of its test; the later tests still run. Test 2 counts on test 1's
one mail, test 3 on test 1 having used one of the five: if test 1 failed before asking, test 3's
sixth request is accepted and the test fails. The `afterAll` runs whatever happens, and the next
run removes `fe-mail` again before creating it, with a new `sub` and so a fresh count.

## Where in the code

| Method | Stream | Route |
|---|---|---|
| `MailService.sendCalendar(range)` | `sendCalendarResult$` | `POST /mail/calendar` |
| `UsersService.createUser()`, `deleteUser()` | `createUserResult$`, `deleteUserResult$` | `POST /users`, `DELETE /users/{username}` |

| What | Where |
|---|---|
| The service | `frontend/src/services/mail.service.ts`, its types `mail.types.ts` |
| The route and the mailer | `backend/src/handlers/sendCalendarMail.ts`, `backend/src/handlers/mailer.ts` |
| Test helpers | in the file: `removeThrowaway()`, `send()`, `mails()`, `mailsOnceThere()`, `forgetMails()`; in `frontend/tests/integration/local.ts`: `newUser()`, `signIn()`, `signedIn()`, `outcome()` |
| Constants | `THROWAWAY`, `ADDRESS`, `FAKE_MAIL`, `RANGE`, `MAIL_LIMITS.rangeDays`, `MAIL_LIMITS.mailsPerDay` |
