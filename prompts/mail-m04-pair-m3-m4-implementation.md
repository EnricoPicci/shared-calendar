## Brief

Implement the pair of plan steps m3, "The table `mail`, the fake mail, the mailer run by hand",
and m4, "`POST /mail/calendar`, and the week page's button" (`docs/EMAIL_PLAN.md`). Follow
CLAUDE.md's working rhythm as the plan sets it for a pair: both steps, one check at the end, an
honest report, then stop for review.

After this pair, locally: a person, of either role, presses "E-mail…" on the week page, picks
two dates and gets a mail with an Excel file of the appointments in that range: the whole
calendar for the Administrator, their own for a User. The mail goes only to the account's own
address, at most 5 a day. It is caught by a fake mail service that shows it at
`http://localhost:8025`. The mailer also runs by hand from a script. Nothing reaches SES or the
cloud, and nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular:
  - "Working rhythm" (**the closing message is short**);
  - "Hard rules from the design" (handlers never import the AWS SDK; a new error code or
    response field starts in `shared/`; the logging rule, which now names an e-mail address, a
    mail's text and attachment; one role per function, no wildcard);
  - "Cloud safety", "Comments", "Tooling and style" (no library the architecture does not call
    for; 100 % line coverage);
  - "Changing these files" (**the file is at 199 of its 200 lines**).

  Then `backend/CLAUDE.md` (**also at 199 lines**), `frontend/CLAUDE.md` and `shared/CLAUDE.md`.
  The rules of `.claude/rules/` load when a file of their paths is read.
- `docs/EMAIL_PLAN.md`:
  - sections 1 to 4: F3 (`local:lambda`) and F12 shape this pair; read rows m3 and m4 of
    section 4;
  - section 5.1 (the short check);
  - **steps m3 and m4**, with their "As done" notes of steps m1 and m2 (what this pair finds
    ready);
  - steps m5, m6 and m8, to see what this pair must not take from them.
- `docs/EMAIL_ARCHITECTURE.md`, all of it. For this pair above all:
  - sections 3 and 3.1 (the pieces), 6.1 to 6.6 (the mailer, the Excel files, the limits, the
    texts), 8.2 (From and Reply-To);
  - 9.1 (`POST /mail/calendar`), 10.1 (the table `mail`), 11 (the pages);
  - 12.2 and 12.4 (the roles, the logs), 13.1 and 13.2 (the parameters, the stages);
  - 14.2 and 14.3 (the fake mail, `local:lambda`, the tests), 16 (the log line, the alarm);
  - 22.1 (the Excel library's measures).
- `docs/ARCHITECTURE.md` sections 2, 4, 5.3, 7.1, 8 and 11; `docs/FRONTEND_SERVICES.md` (the
  pattern of a service, section 10.2 `api.ts`, a service of both roles such as section 23);
  `docs/FRONTEND_ARCHITECTURE.md` sections 3, 4 (a dialog with a form), 5.1, 6 and 8;
  `docs/FRONTEND_WALK.md` (the week's checks, and its section 11 for the shape of new ones);
  `docs/COMMANDS.md` sections 3 and 4 (the local stack, the fake Claude as a model).
- The code:
  - `shared/src/mail/` and `shared/src/user.ts`, `shared/src/api.ts`;
  - `backend/src/lib/calendarDb.ts` (`listAppointments`), `cognito.ts`, `anthropic.ts` (the one
    door to a library, and its lint rule in `eslint.config.js`), `logger.ts`;
  - the handlers `listAppointments.ts` and `getMe.ts`;
  - `backend/template.yaml` (a function with its role, the `calendar` table, the shared
    policies, the parameters);
  - `backend/docker-compose.yml`, `backend/docker/fake-claude.mjs`;
  - `backend/scripts/local-seed.sh`, `local-api.sh`, `verify.sh`;
  - `backend/tests/integration/setup.ts` and `assistant.test.ts` (a journey that never empties
    the `calendar` table);
  - `frontend/src/services/me.service.ts`, `frontend/src/logic/week.screen.ts`, `texts.ts`,
    `frontend/src/views/week.view.ts`, `profile.parts.ts` (a dialog), `shell.ts`,
    `frontend/index.html`;
  - the tests of all of these.

## Where we are (2026-11-25)

- The pair m1 and m2 is committed (`2bd1c65`), not pushed: `main` is 4 commits ahead of
  `origin`.
- Every person has four facts in Cognito, read with `cognito.getProfile`.
- `shared/src/mail/` holds:
  - the settings;
  - `MailCalendarBody` (`from`, `to`, at most 366 days);
  - the limits;
  - the texts of the kinds `daily`, `calendar` and `mine`;
  - `maskAddress`;
  - the codes `no_email_address`, `mail_limit_reached` and `mail_unavailable`.
- The Excel library is `write-excel-file` (`docs/EMAIL_ARCHITECTURE.md` section 22.1). It is not
  installed yet; `read-excel-file` is its reader for the tests.
- Left over from step m2: six checks of `docs/FRONTEND_WALK.md` section 11 (159, 162, 164, 167,
  168, 170) and its phone width were not walked.

## Decided already (the Product Owner)

Everything in `docs/EMAIL_ARCHITECTURE.md` (its decisions, open points and section 22) and in
`docs/EMAIL_PLAN.md` (sections 2 and 3, F1 to F15). Apply them. If the code proves one wrong,
stop and tell me before going on.

## Decided for this pair (the Product Owner, 2026-11-25)

1. **Room in the root `CLAUDE.md`.** The pair adds the command `npm run local:lambda -w backend`
   to "Everyday commands", with the comment "the mailer's invoke on http://127.0.0.1:3001,
   foreground", as `local:api` has.
   - The bullet "`local:api` and `dev` run in the foreground" of "What goes wrong most often"
     keeps only how to stop a background `dev`, which saves the line. The commands' comments
     already say which run in the foreground.
   - The other lines the pair changes are worded to keep their length: the hard rule on e-mail,
     and "Cloud safety"'s list of the local stack (the fake mail, `sam local start-lambda`).
   - If the file would still reach 200 lines, stop and show me.
2. **The mail journeys never empty the `calendar` table**, as the assistant's do. Each makes the
   appointments it mails through the API, on days of its own far ahead, and removes them after.
   The rows of a file are compared with what the journey made, never counted on the whole table.
3. **The address the page shows after "Send"** is read with `GET /me` (`MeService`) and masked
   by the page with `maskAddress`. The route's answer stays `202 { status: "queued" }` as
   `docs/EMAIL_ARCHITECTURE.md` section 9.1 says.

## Step m3

As step m3 of the plan lists, with these points made precise:

1. **Try F3 first**, before the code that relies on it. Check that `sam local start-lambda` on
   `127.0.0.1:3001` answers an `Event` invoke at once, and that a function run by
   `local:api` reaches it at `http://host.docker.internal:3001`. Report what you saw. If it
   does not work on this machine, stop and tell me.
2. **`write-excel-file` installed** in `backend` only. Development dependency there:
   `read-excel-file`. Install through the root `npm` (`npm install … -w backend`), so the one lock
   file follows; run `npm audit` and report it. `backend/src/lib/excel.ts` is the only file that
   imports it. A lint rule refuses it elsewhere, as for `@anthropic-ai/sdk` (its unit test
   excepted).
3. **`backend/src/lib/mailDb.ts`, `excel.ts`, `ses.ts`, `lambdaInvoke.ts`**, each the only door to
   its table, library or AWS service, with unit tests at 100 % lines. In this pair `mailDb.ts`
   needs only the counter (`QUOTA#<sub>`). The settings and the daily mark are step m5's.
   - `excel.ts`: the columns of `docs/EMAIL_ARCHITECTURE.md` section 6.3, a User's file without
     the others' names. Its test reads the file back with `read-excel-file`.
   - `ses.ts`: SES v2 `SendEmail` with attachments in the simple form. From, Reply-To and the
     configuration set come from the environment, the endpoint from `SES_ENDPOINT`.
4. **`backend/src/handlers/mailer.ts`**, the kinds `calendar` and `mine` only.
   - The event is checked: kind, `sub`, username, role, range, request id. It never carries an
     address.
   - The address and the names are read in Cognito. A person without an address is a logged
     failure, not a mail.
   - The appointments are read through `calendarDb.listAppointments`.
   - The text comes from `shared/src/mail/texts.ts`.
   - One log line (`docs/EMAIL_ARCHITECTURE.md` section 16): no address, no name, no content,
     no file.
   - Not the kind `daily` (step m5).
5. **`backend/template.yaml`**:
   - the table `mail` as `docs/EMAIL_ARCHITECTURE.md` section 10.1 says;
   - the mailer function, its memory and timeout set from a measure inside a Lambda container
     (report the measure);
   - its own role: `ses:SendEmail` on the identity and configuration set named from
     `MailDomain`, `CalendarReadPolicy`, the table `mail`, `ListUsersInGroup` and
     `AdminGetUser` on the pool, each only if the code calls it;
   - the parameters it needs (`MailDomain`, `MailFromLocalPart`, `MailFromName`,
     `MailReplyTo`), with no address in `samconfig.toml`.

   Not here:
   - the SES identity, the configuration set, the SNS topic;
   - the conditions that create resources by stage;
   - the timer and its role.

   Those belong to steps m5 and m8. Explain each new resource and permission in plain words in
   the report.
6. **The local stack**:
   - `fake-mail` in `backend/docker-compose.yml` and `backend/docker/fake-mail.mjs`, in the
     manner of the fake Claude. It answers `SendEmail` and keeps each mail in memory, its files
     included. It shows them at `http://localhost:8025` for a person, and as JSON for the
     journeys, with a way for a journey to read and to empty them;
   - the table `mail` in `local-seed.sh`;
   - `env.local.json` with `SES_ENDPOINT`, `LAMBDA_ENDPOINT`, `MAIL_ALLOW_NOW` and
     `MAIL_STAGE=on`;
   - the npm scripts `local:lambda` and `mail:send` (the mailer by hand:
     `npm run mail:send -w backend -- <kind> <username> <from> <to>`);
   - `verify.sh` checks that `local:lambda` runs, as it checks `local:api`.
7. **Journeys**: a new file `backend/tests/integration/mail.test.ts` (decision 2). The mailer is
   started through `local:lambda` for `admin` (`calendar`) and for `alice` (`mine`), and each
   mail is read back from the fake. The journey checks that:
   - the recipient is the account's own address;
   - the file opens, and its rows are the appointments the journey made;
   - a User's file holds only their own.

   Its page under `docs/journeys/backend/`, with the project skill `explain-journey`.
8. **The documents** of section 4's row m3 (decision 1 for the root `CLAUDE.md`). `backend/CLAUDE.md`
   is at 199 lines: make room in the same change and say what moved where.

## Step m4

As step m4 of the plan lists, with these points made precise:

1. **`backend/src/handlers/sendCalendarMail.ts`** (`POST /mail/calendar`, both roles). The checks
   run in the order of `docs/EMAIL_ARCHITECTURE.md` sections 6.5 and 9.1, the first failure
   deciding:
   1. claims and role;
   2. the stage: `503 mail_unavailable` unless `MAIL_STAGE` is `on`, before anything is read
      or counted;
   3. the body;
   4. the address: `409 no_email_address`, before counting;
   5. the counter under a condition in `mailDb`: `429 mail_limit_reached` past 5 a local day;
   6. the asynchronous invoke;
   7. `202 { status: "queued" }`.

   The role decides the kind, never the body. Its function and role: `lambda:InvokeFunction` on
   the mailer only, `AdminGetUser`, the table `mail`. The parameter `MailStage` (default `off`)
   feeds `MAIL_STAGE`; locally it is `on`.
2. **The page**:
   - a mail service (`docs/FRONTEND_SERVICES.md`, a new section);
   - on the week page, for both roles, "E-mail…": a dialog (`docs/FRONTEND_ARCHITECTURE.md`
     section 4) with two dates, the week on show by default, and "Send";
   - the answer "On its way to a•••@example.com" (decision 3), or the reason in plain words;
   - each code with its sentence in `frontend/src/logic/texts.ts`, `mail_unavailable`
     included ("E-mail is not available yet", F13).
3. **Journeys**:
   - in `mail.test.ts`: the route for both roles, read back from the fake; the sixth request of
     a day refused; a range of 367 days refused; `no_email_address` for an account without one,
     made by a helper;
   - in the front end, a new file for the mail service against the local stack, with its page.

   The counter outlives a run: the journeys use throw-away Users, removed before and after, so
   a run repeated the same day still has its 5.
4. **The documents** of section 4's row m4; `docs/FRONTEND_WALK.md` gains the checks of the
   week's "E-mail…" dialog, for each role.

Not in this pair:
- the daily mail, the settings routes and screen, the timer, the alarm (step m5);
- the assistant's tool and any change under `backend/src/assistant` (step m6);
- the first sign-in (step m7);
- the invitation, the stages' conditions, the SES resources (step m8);
- the smoke test;
- any `aws` command;
- the cloud.

## How we work in this pair

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do. Questions one at a time, in simple words.
- **The pauses**:
  - the outcome of the F3 trial (step m3, item 1), if it fails;
  - `npm audit` reporting anything after the install;
  - the lines of the root `CLAUDE.md` before they change;
  - code proving `docs/EMAIL_ARCHITECTURE.md` wrong;
  - an existing journey whose story would change;
  - any change to `backend/src/assistant`.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- After `npm run build -w backend`, restart `local:api` and `local:lambda`. Once the seed or
  `docker-compose.yml` changes, restart the local stack (`local:down`, `local:up`). The back
  end's calendar journeys empty the local `calendar` table.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step m5.

## Acceptance (`docs/EMAIL_PLAN.md` steps m3 and m4, section 5.1)

- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, with 100 % line
  coverage kept.
- With `local:up`, `local:api` and `local:lambda` running, each of these alone is green:
  - `mail.test.ts`;
  - the front end's mail file;
  - any journey file this pair changes.

  Not `npm run verify`, not the whole walk, not the smoke test.
- A look in the browser at the week's "E-mail…" dialog for both roles, with the mail seen at
  `http://localhost:8025` and its file opened. In the same session, the six left-over checks of
  `docs/FRONTEND_WALK.md` section 11 and its phone width.
- `git status` shows changes under `shared/`, `backend/`, `frontend/`, `docs/`, the
  `CLAUDE.md` files, the root `package-lock.json` and `eslint.config.js` only.
- In `docs/EMAIL_PLAN.md`, an "As done" note under each of steps m3 and m4. Each note says:
  - each existing test or journey changed, and why;
  - the F3 trial;
  - the mailer's measure;
  - what moved in the `CLAUDE.md` files.

  The second note ends with what step m5 finds ready. Update the plan's version line too.

Then give the short closing message, and suggest the commit.
