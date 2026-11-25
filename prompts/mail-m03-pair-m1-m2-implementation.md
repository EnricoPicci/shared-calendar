## Brief

Implement the pair of plan steps m1, "The contract, and the facts to confirm", and m2, "Profiles:
the four facts, edited by the Administrator, read by everyone" (`docs/EMAIL_PLAN.md`), following
CLAUDE.md's working rhythm as the plan sets it for a pair: both steps, one check at the end, an
honest report, then stop for review.

After this pair, locally: every person has a first name, a last name, an e-mail and a postal
address in Cognito; the Administrator types them when creating a User, edits them for any User
and for themselves, and sees them in the users' list; everyone reads their own in "My details"
(`GET /me`). A User is still created with a permanent password, answered as today, so every
screen and journey keeps working. Nothing sends mail, nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design" (handlers never import the AWS SDK; a new error code or response field starts
  in `shared/`; the logging rule), "Cloud safety", "Comments", "Tooling and style" (100 % line
  coverage on `backend/src/lib`, `backend/src/assistant`, `shared/src` and `frontend/src`),
  "Changing these files" (**the file is at 199 of its 200 lines**); then `backend/CLAUDE.md`,
  `frontend/CLAUDE.md` and `shared/CLAUDE.md`. The rules of `.claude/rules/` load when a file of
  their paths is read.
- `docs/EMAIL_PLAN.md`, all of it: section 1 (the pairs), section 2, **section 3 (F1 to F15:
  the decisions step m1 writes into the architecture; F6, F7, F8, F9, F11 shape step m2)**,
  section 4 (rows m1 and m2), section 5.1 (the short check), **steps m1 and m2**, and steps m3
  and m8 to see what this pair must not take from them.
- `docs/EMAIL_ARCHITECTURE.md`, all of it; for this pair above all sections 4 (the facts, who
  reads and changes them), 5.4, 9.1 (the users' routes and `GET /me`), 12.2 to 12.4, 17, 20, 21
  and 22.
- `docs/ARCHITECTURE.md` sections 3, 4 (the users' routes), 5.1 (the user pool), 7 and 11;
  `docs/SHARED_CALENDAR_SPEC.md` sections 10.1 and 11.1 (route 21, `GET /users`);
  `docs/FRONTEND_SERVICES.md` (the users service, its section on errors);
  `docs/FRONTEND_ARCHITECTURE.md` sections 3, 4, 6 and 8; `docs/FRONTEND_WALK.md` (the users
  screen's checks, as a model for the new ones); `docs/FOLDER_STRUCTURE.md` sections 2 and 3.
- The code: `shared/src/username.ts`, `api.ts`, `index.ts`, `password.ts`;
  `backend/src/lib/cognito.ts`, `logger.ts`; the handlers `createUser.ts`, `listUsers.ts`,
  `deleteUser.ts`; `backend/template.yaml` (the pool, `CreateUserFunction` and its role,
  `ListUsersFunction` and its role); `backend/scripts/local-seed.sh`, `bootstrap-admin.sh`,
  `cognito.mjs`; `backend/src/assistant/tools/listUsers.ts`; `frontend/src/services/users.service.ts`
  and `users.types.ts`, `frontend/src/logic/users.model.ts`, `users.screen.ts`, `texts.ts`,
  `frontend/src/views/users.view.ts`, `shell.ts`, `password.view.ts` (a screen of both roles);
  `frontend/scripts/seed-local.mjs`; the tests of all of these; the integration tests of both
  packages that create a User, and their pages under `docs/journeys/`.

## Where we are (2026-11-25)

- `docs/EMAIL_ARCHITECTURE.md` (`67b54e1`) and `docs/EMAIL_PLAN.md` v3 with its brief
  (`b3c3425`) are committed, not pushed. Nothing of e-mail is built.
- The decisions F1 to F5, F13 and F15 and the move of the Users' deletion to step 9 are in the
  plan only: `docs/EMAIL_ARCHITECTURE.md` does not hold them yet. Step m1 writes them in.
- No User has been deleted in the cloud: that is step m9 now.

## Decided already (the Product Owner, 2026-11-25)

Everything in `docs/EMAIL_ARCHITECTURE.md` sections 2.2, 2.3 and 21, and the decisions recorded
in `docs/EMAIL_PLAN.md` (sections 2 and 3, versions v2 and v3). Apply them; if the code proves
one wrong, stop and tell me before going on.

## Decided for this pair (the Product Owner, 2026-11-25)

1. **One file for a user account in `shared/`**: `shared/src/username.ts` is renamed
   `shared/src/user.ts` and holds the username rule, the four facts (`UserProfile`),
   `CreateUserBody`, `UpdateUserBody`, `MeResponse` and the state; `shared/src/mail/` holds the
   mail's contract and texts. The rename follows everywhere the old name appears outside
   `prompts/` (`shared/src/index.ts`, `shared/src/calendar/schemas.ts`, the test file,
   `shared/CLAUDE.md`, `docs/FOLDER_STRUCTURE.md`); the old briefs keep it as history.
2. **The users' list** shows the username, the first and last name and the e-mail; the postal
   address only in the Edit dialog and in "My details".
3. **"My details"** is a screen of both roles, in the navigation just before "Change password".
4. **Room in the root `CLAUDE.md`** (F8): the entry of `docs/FRONTEND_ARCHITECTURE.md` in "Where
   the truth lives" becomes one line, without its list of section numbers; the line on
   `docs/RENAME_PLAN.md` moves to `docs/FOLDER_STRUCTURE.md`. The lines the pair adds are worded
   short; if the file would still reach 200 lines, stop and show me.

The Excel library (step m1) is measured early and asked as soon as it is measured; the work on
step m2 does not wait for the answer.

## Step m1

1. **`docs/EMAIL_ARCHITECTURE.md` first**, before any code: the decisions of
   `docs/EMAIL_PLAN.md` written where they belong: the deletion of the Users moved to step 9
   (sections 4.3, 20, 21); F1 (13.3); F2 (6.5, 9.1, 13.2); F3 (14.2); F4 (12.2); F5 (7, 12.2);
   F13, the page deployed at step 9 with the API (13.2, 20); F15, the test User (5.4, 20). Its
   status line: "being built, `docs/EMAIL_PLAN.md`". Show me the diff of this document before
   going on.
2. **`shared/`**: as step m1 of the plan lists, in `shared/src/user.ts` (decision 1):
   `UserProfile` (`docs/EMAIL_ARCHITECTURE.md` section 4.1), `UpdateUserBody`, `MeResponse`,
   the state `invited` / `active`; in `shared/src/mail/` `MailSettings` and its body,
   `MailCalendarBody`, the limits, the texts of section 6.6 for `daily`, `calendar` and `mine`,
   `maskAddress`; the five error codes in `api.ts`. Exported through `shared/src/index.ts`.
   Not `CreateUserBody`, `UserSummary` or `CreateUserResponse` (F9).
3. **The facts to confirm**, written into `docs/EMAIL_ARCHITECTURE.md` section 22 with the date:
   the Excel library (licence, last release, open issues, the size it adds to a bundle measured
   by esbuild on a throw-away entry in the scratchpad, a file written and read back: never in
   the repository, nothing installed in it); SES's prices (section 15 confirmed or corrected);
   Cognito's invitation placeholders and size limits. Use AWS's documentation tools; say which
   page each fact comes from.
4. **The documents** of section 4's row m1.

## Step m2

As step m2 of the plan lists, with these points made precise:

1. **`shared/`**: `CreateUserBody` gains the four facts, required; `UserSummary` gains them and
   `status`. Every caller follows in this pair.
2. **`backend/src/lib/cognito.ts`**: `createUser(username, profile)` still with
   `MessageAction: SUPPRESS` and the permanent password; `email` lower-cased and
   `email_verified` `true`; `updateProfile`, `getProfile` (the facts, the state, the groups if the
   handler needs them), `listPlainUsers` with the facts and the state from `ListUsersInGroup`
   (F11: `FORCE_CHANGE_PASSWORD` is `invited`, anything else `active`). An account whose facts are
   missing is a broken directory (`docs/EMAIL_ARCHITECTURE.md` section 4.3): an ordinary error.
3. **Handlers**: `createUser.ts` with the facts; new `updateUser.ts` (`PUT /users/{username}`)
   and `getMe.ts` (`GET /me`), in the pattern of the existing users' handlers; the log lines hold
   the target's username and the names of the facts changed, never a value.
4. **`backend/src/lib/logger.ts`** (F7): `email`, `address`, `givenname`, `familyname` blanked;
   first check that no existing log field's name contains one of them, and report it.
5. **`backend/template.yaml`**: the two functions, each with its own role naming only the
   actions it calls, on the pool's ARN. Explain each in plain words in the report.
6. **Scripts**: `local-seed.sh` creates `admin` and `alice` with the four facts (`example.com`
   addresses, an invented postal address); `bootstrap-admin.sh` asks the Administrator's four
   facts, prompted, sent through `scripts/cognito.mjs` on stdin, never in an argument or a file.
   Try `bootstrap-admin.sh` only against the local stack, if it can target it; never the cloud.
7. **The assistant** (F6): `list_users` still gives Claude the usernames only, with a test that
   fails if a fact reaches the model. Nothing else in `backend/src/assistant` changes.
8. **The page**: the users service (`createUser` with the facts, `updateUser`), a `me` service;
   the users screen's form with the four fields and their live checks from `shared/`, the list
   (decision 2), an "Edit" dialog (`docs/FRONTEND_ARCHITECTURE.md` section 4); "My details",
   read-only, with "Edit" for the Administrator (decision 3). Each new error code with its
   sentence in `frontend/src/logic/texts.ts`. Not the state's column, not the invitation: step m8.
9. **The tests**: unit tests for everything above at 100 % lines; one helper per package that
   gives the four facts of a throw-away User, used by every journey that creates one; a new
   `describe` for the profiles in `backend/tests/integration/journeys.test.ts` (create with the
   facts, `GET /users`, `GET /me` for both roles, edit, `user_not_found`, `cannot_edit_admin` with
   a second administrator made by a test helper, a User's `PUT` refused `403 forbidden`); the
   front end's users and `me` services against the local stack.
10. **The documents** of section 4's row m2, with the root `CLAUDE.md`'s logging rule (decision
    4); the journeys' pages written or checked with the project skill `explain-journey`;
    `docs/FRONTEND_WALK.md` gains the checks of the users screen's new parts and of "My details".

Not in this pair: anything that sends mail; the table `mail`, the mailer, the fake mail, Docker
changes (step m3); the Excel library installed (step m3); the invitation, `SUPPRESS` removed, the
state shown in the page, the resend (step m8); the first sign-in (step m7); the smoke test; any
`aws` command; the cloud.

## How we work in this pair

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do. Questions one at a time, in simple words.
- **The pauses:** the diff of `docs/EMAIL_ARCHITECTURE.md` (step m1,
  item 1); the Excel library's measure; the lines of the root `CLAUDE.md` before they change; the
  code proving `docs/EMAIL_ARCHITECTURE.md` wrong; an existing journey whose story would change
  beyond sending the four facts; any change to `backend/src/assistant` beyond F6.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- After `npm run build -w backend`, restart `local:api`. Restart the local stack (`local:down`,
  `local:up`) once the seed changes, so that `admin` and `alice` get their facts. The back end's
  calendar journeys empty the local `calendar` table.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step m3.

## Acceptance (`docs/EMAIL_PLAN.md` steps m1 and m2, section 5.1)

- `docs/EMAIL_ARCHITECTURE.md` holds the plan's decisions and the confirmed facts of section 22.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept.
- The journeys this pair adds or changes, each file or `describe` alone, with `local:up` and
  `local:api` running: green. As the plan warns, that is most journey files of both packages
  (every one that creates a User); not `npm run verify`, not the whole walk, not the smoke test.
- A look in the browser at the users screen (create with the four facts, the list, Edit) and at
  "My details" for both roles, by the new checks of `docs/FRONTEND_WALK.md`.
- `git status` shows changes under `shared/`, `backend/`, `frontend/`, `docs/`, `CLAUDE.md` and
  the packages' `CLAUDE.md` only.
- In `docs/EMAIL_PLAN.md`: an "As done" note under each of steps m1 and m2 (each existing test or
  journey changed and why; what moved out of the root `CLAUDE.md`; the Excel library chosen), the
  second ending with what the pair m3 and m4 finds ready; the version line. Then the short
  closing message, and suggest the commit.
