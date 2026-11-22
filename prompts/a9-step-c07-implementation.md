## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend      # with ANTHROPIC_API_KEY not set in this shell
npm run local:api -w backend                        # foreground, in a terminal of its own

# In the terminal that will start Claude Code, and only there:
read -s "ASSISTANT_TRIAL_KEY?Anthropic key: " && export ASSISTANT_TRIAL_KEY
```

- This step needs **an Anthropic API key** for a short trial (a few cents). No AWS login: the
  step does not touch the cloud.
- The key goes in `ASSISTANT_TRIAL_KEY`, **not** in `ANTHROPIC_API_KEY`: Claude Code reads
  `ANTHROPIC_API_KEY` for itself and would bill the session to that key.
- `local:api` will need **two restarts** during the session: one for the new build with the
  real key, for the trial, and one to go back to the fake, for the journeys and `verify`. The
  session asks for each. If the trial shows a fault that needs a new build, there is a third.
- This step changes `backend/template.yaml` (permissions of three roles). Nothing is deployed.

## Brief

Implement plan step c07, "The Administrator: users' list, settings, types, booking for a User"
(`docs/CONVERSATIONAL_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. The design points are proposed below: apply
them as written, and stop if the code or a document proves one wrong.

After this step the Administrator, by conversation, lists the Users and the weekly patterns,
changes the settings, creates, renames and deletes a type, and books an appointment for a
User, each change through a proposal confirmed with the button. A User is never offered one of
these tools. The step adds no route and no function; it adds permissions to three roles.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments" and "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`" (how a change tool is written, the
  stopgap rule, the rule that only `confirm.ts` runs a change), "`src/lib/`" (`cognito.ts`)
  and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, **the finding F6**, step c07 with its
  two paragraphs "What step … left ready", the "As done" notes of steps c05 and c06, and step
  c08 to see what this step must leave ready and what it must not take from it.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 3 and 3.1, 4.3, 4.4, 5 (5.4 with its "As
  built", 5.5 the rules of a proposal), 7.3, 7.4, 8 (all of it), 10, 11.3, 12.1 and 12.2.
- `docs/ARCHITECTURE.md`: section 3 (who may do what), section 4 ("The assistant's routes",
  and the rows of `GET /users`, the settings, the types, the patterns and
  `POST /calendar/appointments`), 7.1.
- `docs/SHARED_CALENDAR_SPEC.md`: section 9 (the settings and their ranges), the types (their
  rules and the refusal of a type in use), section 10.1 (the users' list), section 8.2 with
  R-BOOK-01 to R-BOOK-10 for a booking by the Administrator, and the codes each route answers.
- `docs/journeys/README.md` and the project skill `explain-journey`, the pages
  `docs/journeys/backend/assistant-booking.md`, `assistant-cancel-both.md` and
  `assistant-who-may.md`, and `docs/journeys/concepts.md` ("One local calendar, shared", "The
  settings", "Availability types", "A proposal, and its two buttons").

Then read the code this step builds on:
- `backend/src/assistant/`: `exchange.ts` (how several changes become one proposal),
  `confirm.ts`, `prompt.ts` (the stopgap paragraph, the version mark), and in `tools/`:
  `tool.ts`, `bookAppointment.ts`, `cancelAppointment.ts` (the model of a change tool for
  both roles), `facts.ts` (the reads the confirmations share), `run.ts` (the one reading per
  answer, the refusal of a tool not offered), `list.ts`, `changeHandlers.ts`, `result.ts`,
  `getSettings.ts`, `listTypes.ts`, `listAppointments.ts` (an input that differs by role).
- `backend/src/handlers/listUsers.ts`, `listPatterns.ts`, `updateCalendarSettings.ts`,
  `createAvailabilityType.ts`, `renameAvailabilityType.ts`, `deleteAvailabilityType.ts` and
  `bookAppointment.ts` (the Administrator's branch: the `username`, `getUserSub`,
  `isPlainUser`), each with its test.
- `backend/src/lib/cognito.ts`: `listPlainUsers`, `getUserSub`, `isPlainUser`.
- `shared/src/assistant/` (`texts.ts` with the two language files, `limits.ts`) and
  `shared/src/calendar/` (`schemas.ts` for the settings', the types' and the booking's bodies,
  `defaults.ts` for `SETTINGS_RANGES`).
- `backend/template.yaml`: `ConfirmProposalRole`, `SendAssistantMessageRole`,
  `ContinueAssistantRole`, and the roles of the seven routes above; the environment the three
  assistant functions get (the user pool's id). `backend/scripts/local-seed.sh`: what
  `env.local.json` gives a function that calls Cognito (`backend/CLAUDE.md`, "A new calendar
  function").
- `eslint.config.js`: the list of change handlers under `backend/src/assistant`.
- `backend/docker/fake-claude.mjs` and `backend/tests/integration/fake-claude/answers.json`
  (it holds very long signatures: never print it whole), and
  `backend/tests/integration/assistant.test.ts`: the helpers, `JOURNEY_TYPES`, the block "two
  cancellations in one proposal" (a setting changed and put back in a `finally`) and the block
  "who may talk to the assistant".

Anthropic's API is not written from memory. If this step needs anything of it that the
earlier steps did not confirm, read it in the current documentation first (the `claude-api`
skill, then the documentation tools).

## Where we are (2026-11-22)

- Steps c00 to c06 are done and committed (c06: `a53bfc6`). `main` was eight commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- By conversation a User books, cancels, moves and annotates; the Administrator cancels, moves
  and annotates anybody's appointment and cannot book. A proposal holds up to five changes.
  Twelve journeys' blocks on the fake, twelve pages.
- Eight tools exist: four reads for both roles, `book_appointment` for Users only (its input
  has no username), and `cancel_appointment`, `change_appointment`, `set_appointment_note`
  for both.
- What is left in the stopgap paragraph of `INSTRUCTIONS`: the opening hours, the types, the
  settings and the Administrator's booking for a User. This step takes out the types, the
  settings and that booking; the opening hours stay for step c08.
- **Permissions today.** `ConfirmProposalRole`: the `assistant` table's two sets, the read of
  the key, and the calendar's read, write and book sets; no Cognito. `SendAssistantMessageRole`
  and `ContinueAssistantRole`: the `assistant` table's two sets, the key, the calendar's read
  set; no Cognito.
- **What the routes of this step need**, read from the template: `GET /users` needs Cognito
  `ListUsersInGroup`; the settings' write and the types' create and rename need the calendar's
  read and write sets; **the type's delete needs `CalendarDeletePolicy`**; the booking for a
  User needs Cognito `AdminGetUser` and `AdminListGroupsForUser`. Check each against the
  template before changing a role.
- The local daily limit is 10 messages a person. `alice` and `admin` keep their count from one
  run to the next within a day.
- The assistant's journeys use the days 22 to 28 from today, early in the morning, each block
  with its own throw-away User and type name; the file removes what an interrupted run left
  from tomorrow to 28 days ahead.
- **The settings are shared by every journey of the local stack.** One block already changes
  the notice for cancelling for the time of one confirmation and puts it back in a `finally`;
  a run killed in between leaves the local setting changed.
- `backend/CLAUDE.md` and the root `CLAUDE.md` have 199 lines each of their 200: a new line
  there needs room made in the same change.
- Two untracked files in `backend/`, `.verify-ok 2` and `env.local 2.json`, are strays: leave
  them alone and out of any commit.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: finding F6 (before a file is written)

A proposal shows facts the server reads itself (section 5.5, rule 2). For a booking for a
User the fact is **the person**: that the username names an existing account that is a plain
User. The booking route checks it with `AdminGetUser` and `AdminListGroupsForUser`. The two
functions that build a proposal (`sendAssistantMessage`, `continueAssistant`) will have
`ListUsersInGroup` only, for `list_users`. Answer:

1. **Proposed:** the confirmation of a booking for a User reads the users' list through the
   handler of `GET /users`, with the Administrator's identity, and finds the username in it.
   A username that is not in the list makes no proposal: Claude gets the error with the
   route's code (`user_not_found`) and tells the person. So the proposal names a person the
   server has just seen, and the two functions need no permission beyond `ListUsersInGroup`.
2. **Say what that read cannot tell** and the route would (an account deleted between the
   proposal and the confirmation, an administrator's username): what the person gets in each
   case, at the proposal or at the confirmation.
3. **Say what the read costs** (Cognito calls per proposal, with the one reading per answer of
   `run.ts`), and that a User can never reach it (the tool's input for a User has no
   username, and `GET /users` refuses a User).

Answer in a few lines and carry on if the proposal holds. **If it does not hold without a new
route, a change to a handler or to `lib/cognito.ts`, or a permission beyond those of the
plan, stop and propose.** Close F6 in the plan either way.

## Design points

1. **Who is offered what.** `list_users`, `list_patterns`, `update_settings`, `create_type`,
   `rename_type` and `delete_type` are offered to the Administrator only. `book_appointment`
   becomes a tool of both roles **with an input that differs by role**, as `list_appointments`
   already does: the Administrator's schema has a required `username`, the User's has none.
   The route refuses an Administrator's booking without a username, so the schema must too.
2. **A tool that is not offered is refused before any handler** (section 7.4): a User whose
   request names an Administrator's tool gets the result of a tool that does not exist. The
   journey of the plan shows it. Check that no handler is called and nothing is read.
3. **The two reads.**
   - `list_users`: the usernames, and nothing else of an account. Say what the line of
     progress is, in both languages.
   - `list_patterns`: the weekly patterns in local times, the type by its name, each pattern
     with its id (step c08 will need it to update or delete one). Made small as section 8.3
     asks.
4. **`update_settings`.** The route takes the four settings together. Proposed: the tool
   takes only the settings to change (at least one), the confirmation reads the present
   values through the handler of `GET /calendar/settings` and builds the whole body, and
   **the summary shows each changed setting as it is and as it would become**, and only
   those. A value outside its range, or equal to the present one for every field named, makes
   no proposal. The time zone is not a setting the route changes: say what Claude is told
   when asked for it. Say what happens when the settings change between the proposal and the
   confirmation (the stored body holds the values read at the proposal).
5. **The three type tools.** A type is named by its id, which `list_types` gives; never by
   its name alone.
   - `create_type`: a name. `rename_type`: the id and the new name; the summary shows the old
     name and the new. `delete_type`: the id; the summary names the type.
   - A name already taken, a type not found, a rename to the same name: no proposal, an error
     result with the route's code where the route has one. Say which of these the
     confirmation can read from `GET /calendar/types` and which only the route can tell.
   - **A type in use is refused at the confirmation**, by the route, as the plan's test asks:
     the proposal is made, and the outcome is `refused` with the route's code. Say why it is
     not checked at the proposal, or check it there too if the read gives it for free.
6. **Booking for a User.** The facts are those of a User's booking (the free slot at that
   time, its end, its type, read **as the Administrator sees the day**) and the person, as F6
   settles. The summary names the person. The notice, the horizon and the limit of future
   appointments are the route's: say which of them bind the Administrator's booking, and that
   none is pre-checked beyond what `GET /calendar` already answers.
7. **The summaries are the server's**: one function per tool in `changes` of
   `shared/src/assistant/`, in both languages, the Italian in the formal "lei" of the others.
   The settings are named in the words the web pages use for them (read `frontend/` for
   those words, change nothing there). **Show me the sentences in both languages before the
   journeys are written.**
8. **The template.** Three roles change, each by what its function now needs and nothing
   more: `SendAssistantMessageRole` and `ContinueAssistantRole` gain Cognito
   `ListUsersInGroup` on the user pool; `ConfirmProposalRole` gains that too (its reads),
   `AdminGetUser` and `AdminListGroupsForUser` on the user pool, and `CalendarDeletePolicy`
   for the type's delete. No wildcard. Explain each statement in plain terms in the report.
   Check the environment the three functions get, and what `local-seed.sh` must write for a
   function that now calls Cognito locally.
9. **The bundles and the lint rule.** `changeHandlers.ts` gains four lines (the settings and
   the three types). Check that the lint rule's list holds the four file names, add what is
   missing, and that after a build the four handlers are in the confirming function's bundle
   and in none of the other five. `lib/cognito.ts` enters the bundles of the functions that
   read the users' list: say what that adds.
10. **The stopgap paragraph** loses the settings, the types and the Administrator's booking.
    What stays: the opening hours (step c08). It is one paragraph for both roles: check that
    what it now says is true for a User too, who is offered none of the new tools. The
    version mark moves by itself, so conversations in progress end.
11. **Logs.** Unchanged in shape. Never a username other than the caller's, a setting's
    value, a type's name, a summary or a text. Extend the unit test that serialises the lines
    to the new tools, with a username and a type name in the inputs.
12. **The fake Claude and the journeys.**
    - A type's id cannot be scripted, as an appointment's could not. Proposed: the mark the
      fake has for an appointment generalised, or one more of the same kind for a type in the
      result of `list_types`. Keep what the fake learns the least it can be, and say what it
      was.
    - The requests for the new tools in the fake's answers are the blocks the real model sent
      in this step's trial, with ids, dates and names replaced by marks or by the journey's
      own names.
    - **The settings journey changes a setting every journey shares.** Choose a setting and a
      value that cannot make another block of the file fail if the run stops half-way (say
      why), put the old values back in a `finally`, and say what a run killed in between
      leaves. Never run it at the same time as another integration file.
    - **A booking for a User**: the block's own throw-away User, its own type name in
      `JOURNEY_TYPES`, a day or hours no other block uses (days 22 to 28 are taken in the
      early morning: say which day and hours, and extend the clean-up if the days grow). The
      appointment is found in that User's own list, booked by the Administrator.
    - The journeys talk as `admin`, whose count of the day is kept between runs: use
      `forgetDailyUse` as the file already does, and say how many messages a run sends as
      `admin`, so that two runs a day fit in the local limit.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c07 lists.

- **Code:** the tool files in `backend/src/assistant/tools/` with their lines in `list.ts`
  and `changeHandlers.ts`; `bookAppointment.ts` for a named User; what the confirmations
  share, in `facts.ts`; `prompt.ts` (point 10); `shared/src/assistant/` for the texts and the
  lines of progress; `backend/template.yaml` (point 8) and `backend/scripts/local-seed.sh` if
  the local wiring needs it; the fake and its answers (point 12); `eslint.config.js` only if
  a handler's name is missing.
- **Unit tests**, `lib/anthropic` and the handlers mocked where the core is tested, a fixed
  "now":
  - each tool: its offer by role, its schema, its facts, its request to run, what Claude gets;
  - `book_appointment`: the two schemas; a username not in the list; an Administrator's
    request without a username; the summary with the person;
  - a settings proposal shows the values as they are and as they would become; a value out of
    range; nothing to change;
  - a type in use refused at the confirmation; a name taken; a type not found;
  - a User whose request names an Administrator's tool: refused, no handler called;
  - each summary in both languages, word for word;
  - a proposal that mixes tools (a type created and a setting changed in one answer);
  - the log lines of point 11;
  - 100 % of the lines of `backend/src/assistant`, `backend/src/lib` and `shared/src`.
- **Journeys**, on the fake, each `describe` with its page written and checked with the skill
  `explain-journey` (a checker in a fresh context, its points answered):
  - **a User not offered an Administrator's tool**: the fake asks for one, the core refuses
    before any handler is called, nothing changes;
  - a setting changed and read back through the calendar's own route, then put back;
  - a booking for a User, confirmed, found in that User's own list.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c07 in the v13 entry; section 4 ("The
    assistant's routes": the tools and who is offered each); **section 7.1** (the three
    roles); section 12 only if something there became untrue.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v10: the status line, the change log, and each
    section where the implementation fixed a detail (3, 5.4, 7.3, 8.2, 11.3, 12.1), with F6's
    answer where it belongs. A changed diagram follows `.claude/rules/diagrams.md` and is
    rendered on a dark page.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, F6 closed in section 2.3, an "As done"
    note under step c07, and what step c08 finds ready and must do.
  - `docs/COMMANDS.md` (the journeys' accounts and days), `docs/FOLDER_STRUCTURE.md`,
    `backend/CLAUDE.md` only if a line became untrue, `docs/journeys/README.md` and
    `docs/journeys/concepts.md` (the people, the fake's marks and sentences, the proposal).
  - `CLAUDE.md` only if a line of it became untrue. Report the line counts of both files.

Not in this step:
- the patterns' writes, the date overrides, the one-off windows and blocking time (step c08);
- creating or deleting a user, which stay in the web pages for good (section 3.1);
- any new route or function, any change to a calendar handler, to `lib/calendarDb.ts` or to
  `lib/cognito.ts`;
- the screen and anything in `frontend/` (steps c11 and c12);
- the open points P1 to P7;
- the cloud: no deploy, no `aws` command against a real account.

## How we work in this step

- **Messages to me are short.** At the end of a task, and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do. No tables and no long
  report in the console. The detail the acceptance asks for goes into the "As done" note of
  the plan; give me more only when I ask.
- **The local stack:** I start it before the session. Run
  `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself when `local-seed.sh`, the compose
  file or the wiring changes: it is idempotent and local. Do not run `local:down`.
  **`local:api` is mine: when it needs a restart, tell me and wait**, and tell me exactly what
  to do: which terminal, which command, and what word you wait for. Plan the restarts so that
  there are as few as possible, and say at each one what it is for. **Never send anything to
  the assistant to learn whether the API was restarted**: read the fake's log
  (`docker compose logs fake-claude`, in `backend/`) or wait for my word. After a change to
  `backend/docker/fake-claude.mjs`: `docker compose restart fake-claude`, in `backend/`.
- **Decide what can be decided before the first restart.** Show me F6's answer and the
  sentences of point 7 in one short message, with any question, at the moment you ask for the
  first restart, so that one answer of mine covers all of it.
- **The trial with the real key**, before the fake's answers are written:
  - wire the real Claude with the key given to that one command,
    `ANTHROPIC_API_KEY="$ASSISTANT_TRIAL_KEY" ASSISTANT_DAILY_MESSAGE_LIMIT=30 DYNAMODB_PORT=8002 npm run local:up -w backend`,
    never exported; ask me for the restart;
  - as `admin`, by a script in the scratch folder that calls the local API: "who are the
    users?"; "book alice on <a day with a free slot> at <a free time>", confirmed; "book
    <a name that is no user> …"; "raise the cancellation notice to 72 hours", confirmed, then
    put back by conversation; a type created, renamed and deleted, each confirmed; a type in
    use deleted; "create the type X and set the booking horizon to 40 days" in one sentence.
    As `alice`: "change the cancellation notice to 1 hour" and "who are the users?";
  - note per exchange the tools asked for with their inputs, the seconds of each step, the
    proposal as the server worded it, and whether the calendar holds what it should;
  - **read the closing words of each exchange critically.** A fault found in the trial is
    fixed in this step and tried again;
  - put back every setting, cancel what the trial booked, delete the types it made, then
    `local:up` without the key, ask me for the restart, and **leave the stack on the fake**.
- **The key** never appears in a command's text, in your output, in a file of the repository
  or in a test, and is never an argument of a command. Read `backend/env.local.json` by the
  names of its variables, never print it. If a tool's output shows the key by accident, say so
  at once: I rotate it.
- **The stored conversations and `answers.json`** hold very long signatures: a script that
  reads them shortens every long string before it prints. Scratch scripts live in the scratch
  folder, never in the repository, and are deleted at the end.
- **Money:** a few cents. More than about forty requests to the real model: stop and ask.
- **Hard rules:**
  - **no request of the model, and no text anybody typed, runs a change**: the only code path
    to a change handler starts at `confirmProposal`;
  - **the assistant can never create a user, delete one, or reach an administrator's
    account**: it lists plain Users and books for one, nothing else of Cognito;
  - `backend/src/assistant` reaches the calendar and Cognito through a handler only;
  - `@anthropic-ai/sdk` is imported only in `backend/src/lib/anthropic.ts`; the AWS SDK only
    under `backend/src/lib`;
  - IAM: no wildcard action or resource, one role per function, only what its route needs,
    scoped to the one user pool and the one table;
  - unit tests reach no network; the journeys run on the fake and refuse the real Claude;
  - the existing tests keep passing unchanged, except those of the places this step replaces.
    Note which changed and why;
  - never run the back end's and the front end's integration tests at the same time;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief, step or finding name in a comment.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan, Anthropic's documentation and this
  brief disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed
  change. The architecture wins over the plan, and the plan over this brief. What Anthropic's
  API really does wins over all of them, and changes the architecture first.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c07)

- F6 answered and closed in the plan.
- The design points applied as written (any deviation noted with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- The three journeys green on the fake, run twice the same day, with their pages, each
  checked, the checker's points answered.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green, on the fake, on the final state.
  It empties the local `calendar` table.
- **The roles' review**: the three changed roles statement by statement against what their
  routes need, no wildcard, no other role changed; the bundles searched as in step c06, the
  change handlers in the confirming function's and in none of the other five.
- With the real key, the exchanges of "How we work". The stack back on the fake, no key left
  in `backend/env.local.json`, the local settings as they were before the session.
- The scratch folder's scripts deleted.
- **In the plan's "As done" note**, not in the console: the differences from the step's text,
  what was decided and by whom, the tests replaced, what the trial showed, the weight of the
  bundles before and after, what the journeys leave in the local tables, and what step c08
  finds ready.

Then stop for review, with the short closing message of "How we work": what was done, what
failed or could not be run, and what I must decide. Suggest the commit, but commit only when I
ask. Do not push. Do not start step c08.
