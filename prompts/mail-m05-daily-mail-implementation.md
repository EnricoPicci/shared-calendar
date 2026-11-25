## Brief

Implement plan step m5, "The daily mail" (`docs/EMAIL_PLAN.md`). Follow CLAUDE.md's working
rhythm: the step, its check, an honest report, then stop for review.

After this step, locally: the Administrator opens "Settings" and finds a section "Daily e-mail",
on or off and an hour. Once a day, at that hour in the calendar's time zone, every administrator
with an address gets one mail with two Excel files:
- the booked appointments of the next 7 days;
- a backup of everything from the 1st of last month onwards.

It is sent at most once a day, whatever happens. A run that fails is tried again and raises an
alarm. The hourly timer is written in the template but does not run locally: a script starts
the daily run by hand, and the journeys do the same with a fixed "now". Nothing reaches SES or
the cloud, and nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular:
  - "Working rhythm" (**the closing message is short**);
  - "Hard rules from the design" (handlers never import the AWS SDK; a new error code or
    response field starts in `shared/`; the logging rule; one role per function, no wildcard);
  - "Cloud safety", "Comments", "Tooling and style" (100 % line coverage);
  - "Changing these files" (**the file is at 199 of its 200 lines**).

  Then `backend/CLAUDE.md` (**also at 199 lines**), `frontend/CLAUDE.md` and `shared/CLAUDE.md`.
  The rules of `.claude/rules/` load when a file of their paths is read.
- `docs/EMAIL_PLAN.md`:
  - sections 1 to 4: F3 (the event's `now` and `MAIL_ALLOW_NOW`), F4 (the timer's role) and F13
    (`503 mail_unavailable` on the page) shape this step; read row m5 of section 4;
  - section 5.1 (the short check);
  - **step m5**, and the "As done" notes of steps m3 and m4 (what this step finds ready, and
    `MAIL_ALLOW_NOW`, which moved here);
  - steps m6 and m8, to see what this step must not take from them.
- `docs/EMAIL_ARCHITECTURE.md`, all of it. For this step above all:
  - sections 6.1 to 6.3 (the mailer, **the daily mail exactly once**, the files and their
    ranges), 6.6 (the texts);
  - 9.1 (`GET` and `PUT /mail/settings`), 10.1 (the table `mail`: the settings and the daily
    mark), 11 (the settings screen);
  - 12.2 and 12.4 (the roles, the timer's among them; the logs), 13.2 (the stages);
  - 14.2 and 14.3 (the daily run by hand, `MAIL_ALLOW_NOW`, the tests), 16 (the log line, the
    alarm).
- `docs/ARCHITECTURE.md` sections 4 ("The mail of a range of dates"), 5.5, 7.1, 8, 9.2 and 11, as
  steps m3 and m4 left them; `docs/FRONTEND_SERVICES.md` sections 15 (`CalendarSettingsService`,
  the model of a settings service) and 24; `docs/FRONTEND_ARCHITECTURE.md` sections 4 ("A form
  whose fields are checked"), 5.1 and 6; `docs/FRONTEND_WALK.md` (the settings' checks, and its
  section 12 for the shape of new ones); `docs/COMMANDS.md` section 3.5.
- The code:
  - `shared/src/mail/` (`MailSettingsBody`, `DEFAULT_MAIL_SETTINGS`, `dailyMailText`);
  - `backend/src/lib/mailDb.ts`, `excel.ts`, `ses.ts`, `mailerEvent.ts`, `calendarDb.ts`
    (`listAppointments`), `cognito.ts`;
  - the handlers `mailer.ts`, `sendCalendarMail.ts`, `getCalendarSettings.ts` and
    `updateCalendarSettings.ts` (the model of a settings route);
  - `backend/template.yaml` (the mailer and its role, the table `mail`, `AlarmTopic` and the two
    alarms, the parameters);
  - `backend/scripts/local-seed.sh`, `mail-send.sh`;
  - `backend/tests/integration/setup.ts` and `mail.test.ts`;
  - `frontend/src/services/calendar-settings.service.ts`, `frontend/src/logic/settings.model.ts`,
    `settings.screen.ts`, `texts.ts`, `frontend/src/views/settings.view.ts`, `shell.ts`,
    `frontend/index.html`;
  - the tests of all of these.

## Where we are (2026-11-25)

- Steps m1 to m4 are committed (`2bd1c65`, `c20649e`), not pushed.
- The mailer sends the kinds `calendar` and `mine`; `POST /mail/calendar` and the week's
  "E-mail…" work locally; the fake mail and `local:lambda` run.
- `mailDb.ts` holds only the day's count (`QUOTA#<sub>`). The settings and the daily mark are
  this step's.
- `shared/src/mail/` already holds `MailSettingsBody`, `MailSettings`,
  `DEFAULT_MAIL_SETTINGS` (`true`, 7) and `dailyMailText`.
- The mailer's environment has no `MAIL_STAGE`; `MAIL_ALLOW_NOW` does not exist yet.

## Decided already (the Product Owner)

Everything in `docs/EMAIL_ARCHITECTURE.md` (its decisions, open points and section 22) and in
`docs/EMAIL_PLAN.md` (sections 2 and 3, F1 to F15). Apply them. If the code proves one wrong,
stop and tell me before going on.

## Decided for this step (the Product Owner, 2026-11-25)

1. **The page's mail settings are a service of their own**, `MailSettingsService`
   (`mail-settings.service.ts`, `.types.ts`), as `docs/EMAIL_ARCHITECTURE.md` section 11 lists.
   It is not added to `CalendarSettingsService`: the plan's "the settings service gains" is read
   that way. The settings screen uses both services.
2. **The daily run stops unless the stage is `on`.** The mailer gets `MAIL_STAGE` and its kind
   `daily` ends at once with the outcome `mail_unavailable` at any other stage, before it reads
   anything. The timer is written in this step without a stage condition (those are step m8's).
   So a stack deployed at stage `domain` sends no daily mail, and SES is never called before it
   is ready. The kinds `calendar` and `mine` are unchanged: their route already refuses.
3. **The journeys never empty the `calendar` table**, as in steps m3 and m4. The daily journeys:
   - use a fixed "now" on days of their own far ahead;
   - remove the daily marks of those dates straight in DynamoDB Local, first and last;
   - write back the mail settings they found, as the front end's calendar journeys do with the
     calendar's settings;
   - compare a file's rows with the rows they made, marked with the run, never with the count of
     the whole table.
4. **A failed daily mail is tried again later the same day.** Lambda's own retries come within
   minutes, and a run cut off leaves its mark `sending`, which may be taken only after 10
   minutes. So at any later hour of the same local day, the run also goes ahead when the day's
   mark is `failed`, or `sending` and older than 10 minutes. With no mark, only the chosen hour
   sends: switching the mail on after the hour still sends nothing until tomorrow. The step
   writes this into `docs/EMAIL_ARCHITECTURE.md` section 6.2.
5. **Several administrators share one mark.** Each administrator with an address gets a mail of
   their own, so nobody sees another's address. When one mail goes and another fails, the mark
   becomes `failed` and the retry sends to all of them again, so one may get the mail twice.
   This is accepted, since the API cannot create a second administrator. The step says so in
   `docs/EMAIL_ARCHITECTURE.md` section 6.2, and no code guards against it.

## The step

As step m5 of the plan lists, with these points made precise:

1. **`mailDb.ts`** gains:
   - the settings: read, answering `DEFAULT_MAIL_SETTINGS` when none were saved; and write, with
     `updatedAt` and `updatedBy`;
   - the daily mark `DAILY` / `<local date>`, by the rule of `docs/EMAIL_ARCHITECTURE.md`
     section 6.2. A first write happens only if the mark is absent. Taking it again is a
     conditional write, allowed only from `failed`, or from `sending` older than 10 minutes. It
     ends with `sent` (its SES message id and the count) or `failed`. Its `expiresAt` is 400
     days after the write.

   Every write is a single conditional write. "Now" is passed in. The module logs nothing.
2. **`getMailSettings.ts` and `updateMailSettings.ts`** (`GET` and `PUT /mail/settings`, admin
   only). Each has its function and its own role: the table `mail`, read or read/write, nothing
   more. The checks run in this order:
   1. the role;
   2. the stage (`503 mail_unavailable` unless `MAIL_STAGE` is `on`);
   3. the body (`MailSettingsBody`).

   Each writes one log line. Model them on `getCalendarSettings.ts` and
   `updateCalendarSettings.ts`.
3. **The mailer's kind `daily`** (`mailerEvent.ts`, `mailer.ts`):
   - **The event**: `{ kind: "daily" }`, as the timer sends it. With `MAIL_ALLOW_NOW` set to
     `true` it may also carry `now`, an instant; without it, an event with `now` is refused as
     `invalid_event`. No `sub`, username or address.
   - **The run** goes in this order:
     1. the stage (decision 2);
     2. the settings: off ends the run with a logged outcome;
     3. the hour in `CALENDAR_TIME_ZONE` and the mark, together (decision 4). At the chosen hour,
        the mark is written if absent, or taken again by the rule of item 1. At a later hour of
        the same day, only a mark to take again lets the run go on. At an earlier hour, or with
        nothing to take, the run ends with a logged outcome;
     4. every member of group `admin` that has an address, each with their own mail. An
        administrator without an address is skipped, with their username in the log line.
        Nobody to send to is an outcome, not an error;
     5. the two files of `docs/EMAIL_ARCHITECTURE.md` section 6.3: the next 7 days (booked
        only) and the backup (from the 1st of last month, every status, reading up to today plus
        366 days);
     6. the text from `dailyMailText`;
     7. the mark set to `sent`, or `failed` and the error thrown, so that Lambda tries again.
   - **The log line** is one per run: the outcome, the date, the hour, the number of mails sent
     and skipped, the counts of the two files. No address, no name.
   - **The file names** are yours to choose; say them in the report.
4. **`backend/template.yaml`**:
   - the two functions with their roles, and their routes;
   - `MAIL_STAGE` for the mailer;
   - the hourly schedule (`AWS::Scheduler::Schedule`, minute 0 of every hour, UTC, no flexible
     window, the input `{"kind":"daily"}`);
   - its own role (F4): assumable by `scheduler.amazonaws.com` only, `lambda:InvokeFunction` on
     the mailer alone;
   - the mailer's error alarm: `Errors` > 0 in an hour, to `AlarmTopic`, like the authorizer's.

   Explain each new resource and permission in plain words in the report.
5. **The local stack**:
   - `env.local.json` sets `MAIL_ALLOW_NOW=true`, for the mailer only; the template declares it
     empty, as `SKIP_GLOBAL_SIGN_OUT`;
   - a script `npm run mail:daily -w backend -- [<instant>]` starts the daily run through
     `local:lambda` and prints the mailer's result, as `mail:send` does;
   - nothing seeds the settings: their absence is the defaults.
6. **The page**:
   - `MailSettingsService` with `getSettings` and `updateSettings`, checked with the shared
     schema before any request (`docs/FRONTEND_SERVICES.md`, a new section 25);
   - on the settings screen (the Administrator's) a section "Daily e-mail": a switch, on or off,
     and the hour, saved with its own button. It is read when the screen is shown;
   - `503 mail_unavailable` makes the section say "E-mail is not available yet" in place of its
     fields (F13); a failure of the calendar's settings does not hide it, nor the other way
     round;
   - its sentences in `frontend/src/logic/texts.ts`. The hour is shown as `07:00`, the
     calendar's time zone beside it, as the settings already show it.
7. **Journeys**:
   - in `backend/tests/integration/mail.test.ts`, a new block for the daily run, started through
     `local:lambda` with a fixed `now` (decision 3). It checks that:
     - the run at the chosen hour sends one mail to `admin`'s address, with two files whose rows
       marked with the run are the ones made for it, each in the file its range and status
       decide;
     - the same hour twice sends once;
     - another hour, or the settings switched off, sends none;
     - a mark left `failed` is taken again and sends, at the chosen hour and at a later hour of
       the same day; a `sending` mark younger than 10 minutes is not; at a later hour with no
       mark, nothing is sent;
     - `GET` and `PUT /mail/settings` answer for the Administrator, refuse a User (`403`) and a
       body out of range (`400`);
   - in the front end, a new file for `MailSettingsService` against the local stack, which
     writes back what it found.

   Their pages under `docs/journeys/`, with the project skill `explain-journey`.
8. **The documents** of section 4's row m5, and:
   - `docs/EMAIL_ARCHITECTURE.md` section 6.2: decisions 4 and 5;
   - `docs/COMMANDS.md` (`mail:daily`, `MAIL_ALLOW_NOW`);
   - `docs/FRONTEND_WALK.md`: the checks of "Daily e-mail", continuing from 181;
   - `backend/CLAUDE.md`, which is at 199 lines: make room in the same change and say what moved
     where;
   - the root `CLAUDE.md` only if a rule changes. Then it is a pause.

Not in this step:
- the assistant's tool and any change under `backend/src/assistant` (step m6);
- the first sign-in (step m7);
- the invitation, the stages' conditions, the SES resources, SNS for bounces (step m8);
- the smoke test;
- any `aws` command;
- the cloud.

## How we work in this step

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do. Questions one at a time, in simple words.
- **The pauses**:
  - code proving `docs/EMAIL_ARCHITECTURE.md` wrong, the rule of section 6.2 above all;
  - an existing journey whose story would change;
  - any line of the root `CLAUDE.md`;
  - any change to `backend/src/assistant`;
  - a new dependency.
- **Ask me before you stop or restart the local stack** (`local:up`, `local:down`, `local:api`,
  `local:lambda`): I may be running them in my own terminals. After `npm run build -w backend`
  they need a restart; tell me, and wait for my go-ahead.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step m6.

## Acceptance (`docs/EMAIL_PLAN.md` step m5, section 5.1)

- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, with 100 % line
  coverage kept.
- With `local:up`, `local:api` and `local:lambda` running, each of these alone is green:
  - `mail.test.ts` (the back end, every block);
  - the front end's mail settings file;
  - any journey file this step changes.

  Not `npm run verify`, not the whole walk, not the smoke test.
- `npm run mail:daily -w backend` run once by hand at the hour set, and its mail seen at
  `http://localhost:8025` with both files opened.
- A look in the browser at the settings' "Daily e-mail": a save, a value refused, and "not
  available yet" (with `MAIL_STAGE` set to `off` for that look only, then set back; tell me
  before, since it needs a restart).
- `git status` shows changes under `shared/`, `backend/`, `frontend/`, `docs/`, the
  `CLAUDE.md` files and the root `package-lock.json` only.
- In `docs/EMAIL_PLAN.md`, an "As done" note under step m5. It says:
  - each existing test or journey changed, and why;
  - the file names chosen;
  - decisions 4 and 5 as written into `docs/EMAIL_ARCHITECTURE.md`;
  - what moved in the `CLAUDE.md` files.

  It ends with what step m6 finds ready. Update the plan's version line too.

Then give the short closing message, and suggest the commit.
