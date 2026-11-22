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
- `backend/template.yaml` is not expected to change: the confirming function's role already
  holds the four calendar sets. The session checks it and says so. Nothing is deployed.

## Brief

Implement plan step c08, "The Administrator: availability and blocking time"
(`docs/CONVERSATIONAL_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. The design points are proposed below: apply
them as written, and stop if the code or a document proves one wrong.

After this step the Administrator, by conversation, creates, changes and deletes a weekly
pattern, sets and deletes the override of a date, creates and deletes a one-off window, and
asks to "block Tuesday from 14:00 to 16:00", each change through a proposal confirmed with the
button. Every tool of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3 then exists, and the
stopgap paragraph of the instructions is gone. The step adds no route and no function.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety", "Comments" and "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/assistant/`" (how a change tool is written, the
  stopgap rule, the rule that only `confirm.ts` runs a change), "`src/lib/`"
  (`calendarRules.ts`: `checkAvailabilityWrite`) and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, **open point P5** (not decided here),
  step c08, the "As done" notes of steps c05, c06 and **c07 with its paragraph "What step c08
  finds ready"**, and steps c09 and c10 to see what this step must leave ready and what it
  must not take from them.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: section 3 (**the paragraph on blocking a time
  window**) and 3.1, 4.3, 4.4, 5 (5.4 with its "As built", 5.5 the rules of a proposal), 7.3,
  7.4, 8 (all of it), 10, 11.3, 12.1 and 12.2.
- `docs/ARCHITECTURE.md`: section 3, section 4 ("The assistant's routes", and the rows of the
  patterns, the overrides, the one-off windows and `GET /calendar`), 7.1.
- `docs/SHARED_CALENDAR_SPEC.md`: section 6 in full (6.2 patterns, 6.3 overrides with
  R-OVR-01 to R-OVR-03, 6.4 one-off windows with R-ONE-01 to R-ONE-03, 6.5 combining the
  sources, 6.6, **6.7 with R-AV-03 and the list of `conflicts`**), section 11.1 routes 7 to 14
  with the codes each answers, 11.4 (the bodies) and 11.6 (the view: `hasOverride`, a window's
  `source` and `sourceId`, for the Administrator).
- `docs/journeys/README.md` and the project skill `explain-journey`, the pages
  `docs/journeys/backend/assistant-settings.md`, `assistant-booking-for-user.md` and
  `assistant-cancel-both.md`, and `docs/journeys/concepts.md` ("One local calendar, shared",
  the ideas on patterns, overrides and one-off windows, "A proposal, and its two buttons",
  "The Administrator's tools", "The Administrator's conversation in the journeys").

Then read the code this step builds on:
- `backend/src/assistant/`: `exchange.ts`, `confirm.ts` (what Claude is given of a refused
  change), `prompt.ts` (the stopgap paragraph, **the paragraph "Blocking time"**, the version
  mark), and in `tools/`: `tool.ts` (a read tool's second route, `also`; a description for
  the Administrator only), `facts.ts` (`presentTypes`, `typeById`, the instant of a local date
  and time), `run.ts`, `list.ts`, `changeHandlers.ts`, `result.ts` (how a refusal is made
  small: it keeps the code and the message only), `getCalendar.ts` (what a day is for the
  model today: no source of a window, no id, no word on an override), `listPatterns.ts`,
  `updateSettings.ts` and `renameType.ts` (the models of an Administrator's change tool).
- `backend/src/handlers/createPattern.ts`, `updatePattern.ts`, `deletePattern.ts`,
  `setOverride.ts`, `deleteOverride.ts`, `createOneOffWindow.ts`, `deleteOneOffWindow.ts`,
  `listPatterns.ts` and `getCalendar.ts`, each with its test.
- `shared/src/assistant/` (`texts.ts` with the two language files) and `shared/src/calendar/`
  (the schemas of a pattern's, an override's and a window's body, the time helpers, the
  limits).
- `backend/template.yaml`: `ConfirmProposalRole` against the roles of the seven routes above.
- `eslint.config.js`: the list of change handlers under `backend/src/assistant` (it holds the
  seven names already: check).
- `backend/docker/fake-claude.mjs` and `backend/tests/integration/fake-claude/answers.json`
  (it holds very long signatures: never print it whole), and
  `backend/tests/integration/assistant.test.ts`: the helpers (`openWindow`,
  `removeFromCalendar`, `bookSlots`, `proposalOf`), `JOURNEY_TYPES`, and the three blocks that
  talk as `admin`.
- `frontend/src/views/` for the words the web pages use for a pattern, an override ("the
  hours of a single day"), a one-off window and a closed day. Change nothing there.

Anthropic's API is not written from memory. If this step needs anything of it that the
earlier steps did not confirm, read it in the current documentation first (the `claude-api`
skill, then the documentation tools).

## Where we are (2026-11-22)

- Steps c00 to c07 are done and committed (c07: `ae2d283`). `main` was nine commits ahead of
  `origin` at the time of writing: check `git status -sb`.
- Fourteen tools exist. For both roles: four reads and the four appointment changes. For the
  Administrator: `list_users`, `list_patterns` (each pattern with its id and the name of its
  type), `update_settings`, `create_type`, `rename_type`, `delete_type`, and a required
  `username` in `book_appointment`. Fifteen journeys' blocks on the fake, fifteen pages.
- **What is left in the stopgap paragraph of `INSTRUCTIONS`: the opening hours alone.** This
  step brings their tools, so it removes the paragraph, and with it the rule about it in
  `backend/CLAUDE.md`. `INSTRUCTIONS` already holds a paragraph "Blocking time", written before
  any tool for it existed: read it against what is built here.
- **Permissions today.** `ConfirmProposalRole`: the `assistant` table's two sets, the read of
  the key, the four calendar sets (`CalendarReadPolicy`, `CalendarWritePolicy`,
  `CalendarBookPolicy`, `CalendarDeletePolicy`) and three Cognito actions on the user pool.
  The seven routes of this step need the read set with the write set or the delete set, as
  their own roles show: check each against the template before saying that nothing changes.
- **What Claude is given of a day today** (`get_calendar`): its windows as start, end and type
  name, the free slots, the appointments. Not where a window comes from, not the id of a
  one-off window, not whether the date has an override, not a type's id. The route gives the
  Administrator all of it (`hasOverride`, `source`, `sourceId`, `typeId`).
- **What Claude is given of a refused change today**: the route's code and message. The list
  `conflicts` of `availability_conflict` is dropped.
- The local daily limit is 10 messages a person. Three blocks of the journeys talk as `admin`,
  one message each, each starting that account's count of the day again (`forgetDailyUse`).
- The assistant's journeys use the days 21 to 28 from today, 04:00 to 07:00, each block with
  its own throw-away User and type name; the file removes what an interrupted run left from
  tomorrow to 28 days ahead: appointments, one-off windows and types. **It removes no pattern
  and no override**, because no journey of the file made one until now.
- **A weekly pattern holds on every week**, so one made by a journey is seen by every other
  block and file that reads those weekdays until it is deleted. The settings journey leaves a
  booking horizon of 57 days when a run is killed half-way.
- `backend/CLAUDE.md` and the root `CLAUDE.md` have 199 lines each of their 200: a new line
  there needs room made in the same change.
- Two untracked files in `backend/`, `.verify-ok 2` and `env.local 2.json`, are strays: leave
  them alone and out of any commit.
- This brief file is untracked when you read it. Ask me whether to commit it.

## First: three questions (before a file is written)

No finding of the plan's section 2.3 is tied to this step: check that all are closed. Three
things must be answered before the tools are written, in a few lines each.

1. **What the Administrator's reads must give for these tools to be usable.** To delete a
   one-off window Claude needs its id; to block time it must know which windows of the day
   come from the patterns, which from an override and which are one-off windows; to write a
   window it needs the type's id. **Proposed:** `get_calendar`, for the Administrator only,
   gives for each window its source and, for a one-off window, its id, and for each day
   whether it has an override; the type's id comes from `list_types`, as for the type tools.
   A User's result does not change. Say what it adds to the size of a result (section 8.3,
   the 6 KB cap) and what it changes in the version mark of each role.
2. **Blocking and one-off windows.** An override replaces the pattern windows of a date and
   never a one-off window (`docs/SHARED_CALENDAR_SPEC.md` R-OVR-03). So "block Tuesday from
   14:00 to 16:00" over a one-off window cannot be done by an override alone. **Proposed:**
   the instructions say so, and Claude then proposes, in one answer, the override for what is
   left of the pattern hours and the deletion of the one-off window, with a new one-off window
   for the part of it that stays open; five changes at most, as rule 4 of section 5.5 says.
   Say whether section 3 of `docs/CONVERSATIONAL_ARCHITECTURE.md` already covers this or must
   gain a sentence. **Whether the model works the hours out well is open point P5, judged in
   step c10**: here it is built as section 3 describes, and the trial reports what came.
3. **The appointments in the way.** A write to availability that would leave an appointment
   outside its window is refused with `409 availability_conflict` and the list `conflicts`
   (appointment id, username, start, end). **Proposed:** nothing is pre-checked at the
   proposal, since only the route can check under the lock; at the confirmation the change is
   `refused`, and Claude is given the code, the message and the list made small: each
   appointment as its id, username, date and local times, capped like every list. Say where
   that is built (`result.ts`, for every refusal that carries the list) and that the list
   reaches the Administrator only, the one role that can cause it.

Answer and carry on if the proposals hold. **If one does not hold without a new route, a
change to a calendar handler or to `lib/calendarDb.ts`, or a new permission, stop and
propose.**

## Design points

1. **Who is offered what.** The seven tools are offered to the Administrator only. A User who
   names one gets the result of a tool that does not exist, as step c07 built: one unit test
   over the seven names is enough, no new journey.
2. **The three pattern tools.** A pattern is named by its id, which `list_patterns` gives.
   - `create_pattern`: a weekday, a local start and end, a type's id, the date it holds from
     and, optional, the date it holds until. `update_pattern`: the id and the whole new
     pattern, as the route takes it. `delete_pattern`: the id.
   - The weekday is a word for the model, as `list_patterns` writes it. Say how an end at
     midnight is written (`24:00`, as the results write it).
   - The summaries: a creation names the weekday, the hours, the type and the dates; an
     update shows the pattern **as it is and as it would become**; a deletion names the
     pattern it deletes. The facts come from the handlers of `GET /calendar/patterns` and
     `GET /calendar/types`.
   - A pattern not found, a type not found, an update that changes nothing: no proposal, with
     the route's code where it has one. An overlap, a conflict with appointments and the
     limit are the route's, at the confirmation: say why none is checked at the proposal.
3. **The two override tools.**
   - `set_date_override`: a date and the list of windows (start, end, type's id), 0 to 10. **An
     empty list closes the day** as far as the patterns go. `delete_date_override`: a date.
   - **The confirmation shows the day as it is and as it would become**: the windows of the
     day today (read through the handler of `GET /calendar` for that date, as the
     Administrator) and the windows after the change. It must read right for a day of
     patterns, a day already overridden, and a day closed, before and after. A one-off window
     of the day is in both pictures, since the override does not touch it: say how the
     sentence shows that.
   - A date in the past, a type not found, a date without an override to delete, an override
     equal to the one the date has: no proposal. Windows of one override that overlap: say
     whether the schema, the confirmation or the route refuses them.
   - The sentence can be long (up to ten windows, twice). Say how long the longest is, and
     check it against what the screen and the stored conversation can hold.
4. **The two one-off window tools.** `create_one_off_window`: a date, a local start and end, a
   type's id. `delete_one_off_window`: the window's id, which the Administrator's
   `get_calendar` gives (question 1). The summaries name the date, the hours and the type. A
   window not found, a date in the past, a type not found: no proposal.
5. **Blocking time** is not a tool: it is what the instructions tell Claude to do with
   `get_calendar` and `set_date_override` (and question 2). Rewrite the paragraph "Blocking
   time" of `INSTRUCTIONS` against the tools as built: read the day first; take the blocked
   interval out of the pattern windows; keep the type of each piece; an empty list closes the
   day; say what to do with a one-off window in the blocked time; say that an appointment in
   the blocked time makes the calendar refuse, and to tell the person which. Keep it short.
6. **The stopgap paragraph is removed**, with the test that pins it and the rule about it in
   `backend/CLAUDE.md` (which frees a line there). What stays in the web pages for good is the
   list of section 3.1: check that the instructions still say it. The version mark moves by
   itself, so conversations in progress end.
7. **Two changes of one answer on the same thing** are not proposed, as before: the same
   pattern, the override of the same date, the same one-off window. Say what the "subject" of
   a new pattern and of a new one-off window is, and whether a block made of an override and
   a window deletion on the same date passes (it must: question 2 needs it).
8. **The summaries are the server's**: one function per tool in `changes` of
   `shared/src/assistant/`, in both languages, the Italian in the formal "lei" of the others,
   the things named in the words the web pages use for them. The weekdays and the dates are
   written by the helpers the other sentences use. **Show me the sentences in both languages
   before the journeys are written**, the override's for the three kinds of day.
9. **The template and the bundles.** `changeHandlers.ts` gains seven lines. Check the lint
   rule's list; after a build, the seven handlers are in the confirming function's bundle and
   in none of the other five (read the source maps, as step c07 did). Say whether any role
   changes: expected none.
10. **Logs.** Unchanged in shape. Never a date, an hour, a type's name, a username of the
    list of conflicts, a summary or a text. Extend the unit test that serialises the lines to
    the new tools, with a refusal that carries a list of appointments.
11. **The fake Claude and the journeys.**
    - A type's id and a pattern's id cannot be scripted, as an appointment's could not. Step
      c07 avoided the question; this step cannot. Proposed: the mark the fake has for an
      appointment's id made general (the id of the Nth item of the last result that is a
      list), or one more of the same kind. Keep what the fake learns the least it can be, and
      say what it was.
    - The requests for the new tools in the fake's answers are the blocks the real model sent
      in this step's trial, with ids, dates and names replaced by marks or by the journey's
      own names. **For the block, the fake gives the hours left**: the list of windows the
      real model sent for the same day in the trial.
    - **A block proposed, confirmed, the day's free slots read back**: a day of its own with
      a pattern or a window of the journey's own type; say which, and why the proposal reads
      right with it. **A block over an appointment**: a throw-away User books in the hours to
      block, the confirmation is refused, the proposal shows `refused` with the code, and
      Claude was given the appointment. **A pattern created and deleted.**
    - **A pattern and an override outlive a killed run** and the file's clean-up does not know
      them. Extend `removeFromCalendar` to the patterns of the journey's type and to the
      overrides of the journeys' days, before any block starts and after each. Give a
      journey's pattern the shortest validity that still shows it (the one week of its day),
      a type of its own in `JOURNEY_TYPES`, hours no other block opens, and say what another
      file's journey would see of it while the block runs. Say which days the new blocks use
      (21 to 28 are taken) and what a run killed in between leaves.
    - The new blocks talk as `admin`: `forgetDailyUse` as the file does, and say how many
      messages a run now sends as `admin`.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c08 lists.

- **Code:** the seven tool files in `backend/src/assistant/tools/` with their lines in
  `list.ts` and `changeHandlers.ts`; what the confirmations share, in `facts.ts`; the
  Administrator's `get_calendar` (question 1); the list of conflicts made small (question 3);
  `prompt.ts` (points 5 and 6); `shared/src/assistant/` for the texts; the fake and its
  answers (point 11); `backend/template.yaml` and `eslint.config.js` only if the checks of
  point 9 find something missing.
- **Unit tests**, `lib/anthropic` and the handlers mocked where the core is tested, a fixed
  "now":
  - each tool: its offer to the Administrator alone, its schema, its facts, its request to
    run, what Claude gets;
  - **the day before and after in the confirmation of an override, for a day of patterns, a
    day already overridden and a day closed; an empty list closes the day**; a day with a
    one-off window;
  - a pattern updated, shown as it is and as it would become; a pattern, a window and an
    override not found; a date in the past; nothing to change;
  - a change refused with `availability_conflict`: the outcome, and the list Claude is given,
    small, capped;
  - the Administrator's `get_calendar` result and a User's, side by side;
  - a block as one proposal of several changes (an override and a window deleted on the same
    date);
  - a User naming each of the seven tools: refused, no handler called;
  - each summary in both languages, word for word; the instructions without the stopgap
    paragraph;
  - the log lines of point 10;
  - 100 % of the lines of `backend/src/assistant`, `backend/src/lib` and `shared/src`.
- **Journeys**, on the fake, each `describe` with its page written and checked with the skill
  `explain-journey` (a checker in a fresh context, its points answered):
  - a block proposed (the fake gives the hours left), confirmed, the day's free slots read
    back through the calendar's own route;
  - a block over an appointment, refused with the appointment named;
  - a pattern created and deleted.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c08 in the v13 entry; section 4 ("The
    assistant's routes": the tools, what the Administrator's reads give, the refusal with its
    list); section 7.1 only if a role changed; section 12 only if something became untrue.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v11: the status line, the change log, and each
    section where the implementation fixed a detail (3 with blocking, 5.4, 7.3 without the
    stopgap, 8.2, 8.3, 11.3, 12.1). A changed diagram follows `.claude/rules/diagrams.md` and
    is rendered on a dark page.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line, an "As done" note under step c08, and
    what steps c09 and c10 find ready (for c10: what the trial saw of blocking, for P5).
  - `docs/COMMANDS.md`, `docs/FOLDER_STRUCTURE.md`, `docs/journeys/README.md` and
    `docs/journeys/concepts.md` (the people, the days, the fake's marks and sentences, the
    Administrator's tools, what the journeys now clean up).
  - `backend/CLAUDE.md`: the stopgap rule goes; anything else only if a line became untrue.
    `CLAUDE.md` only if a line of it became untrue. Report the line counts of both files.

Not in this step:
- a tool `block_time`, and any judgement of open point P5 (step c10);
- creating or deleting a user, which stay in the web pages for good (section 3.1);
- any new route or function, any change to a calendar handler or to `lib/calendarDb.ts`,
  `lib/calendarRules.ts` or `lib/cognito.ts`;
- the capacity of the `assistant` table and the search of the logs (step c09);
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
- **Decide what can be decided before the first restart.** Show me the answers to the three
  questions and the sentences of point 8 in one short message, with any question of yours, at
  the moment you ask for the first restart, so that one answer of mine covers all of it.
  Record the weight of the six assistant bundles before the first build of this step.
- **The trial with the real key**, before the fake's answers are written:
  - wire the real Claude with the key given to that one command,
    `ANTHROPIC_API_KEY="$ASSISTANT_TRIAL_KEY" ASSISTANT_DAILY_MESSAGE_LIMIT=40 DYNAMODB_PORT=8002 npm run local:up -w backend`,
    never exported; ask me for the restart;
  - prepare through the calendar's own routes, as `admin`: a type of the trial, a weekly
    pattern of it with two windows on one weekday, and one appointment of `alice` in it;
  - as `admin`, by a script in the scratch folder that calls the local API. **Three blocking
    requests**, each confirmed, **the proposed hours reported exactly as they came**: a block
    in the middle of a window ("block <that day> from 10:00 to 11:00"); a block that covers a
    whole window and part of the next; "close <that day>". Then: a block over `alice`'s
    appointment, confirmed, refused; a block on a day already overridden; "open <that day>
    again as usual" (the override deleted); a block over a one-off window (question 2); a
    pattern created, its hours changed, deleted, each confirmed; a one-off window created and
    deleted. As `alice`: "block Tuesday afternoon";
  - note per exchange the tools asked for with their inputs, the seconds of each step, the
    proposal as the server worded it, and whether the calendar holds what it should (read the
    day back through `GET /calendar`);
  - **read the closing words of each exchange critically**, and the hours of each proposed
    override against the day as it was. A fault of the code or of the instructions found in
    the trial is fixed in this step and tried again; hours the model works out wrong are
    reported for step c10, not repaired here by a new tool;
  - delete the trial's overrides, windows, patterns and type, cancel what it booked, then
    `local:up` without the key, ask me for the restart, and **leave the stack on the fake**.
- **The key** never appears in a command's text, in your output, in a file of the repository
  or in a test, and is never an argument of a command. Read `backend/env.local.json` by the
  names of its variables, never print it. If a tool's output shows the key by accident, say so
  at once: I rotate it.
- **The stored conversations and `answers.json`** hold very long signatures: a script that
  reads them shortens every long string before it prints. Scratch scripts live in the scratch
  folder, never in the repository, and are deleted at the end. A shell command that holds a
  script goes through a file or a here-document, not through `node -e '…'` with quotes in it.
- **Money:** a few cents. More than about fifty requests to the real model: stop and ask.
- **The journey pages** are written by one subagent and checked by another in a fresh
  context, as the skill says, while the documents are written in the main session.
- **Hard rules:**
  - **no request of the model, and no text anybody typed, runs a change**: the only code path
    to a change handler starts at `confirmProposal`;
  - **the assistant can never create a user, delete one, or reach an administrator's
    account**;
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

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c08)

- The three questions answered, and the answers written where they belong in
  `docs/CONVERSATIONAL_ARCHITECTURE.md`.
- The design points applied as written (any deviation noted with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root; `npm run
  audit -w backend` green; 100 % line coverage where it is enforced.
- The three journeys green on the fake, run twice the same day, with their pages, each
  checked, the checker's points answered. After them the local calendar holds no pattern and
  no override of the journeys.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green, on the fake, on the final state.
  It empties the local `calendar` table.
- **The roles' review**: `ConfirmProposalRole` against what the seven routes need, and the
  statement that no role changed, or which did and why; the bundles read as in step c07, the
  fifteen change handlers in the confirming function's and in none of the other five.
- With the real key, the exchanges of "How we work", **the three blocking requests with their
  proposed hours as they came**. The stack back on the fake, no key left in
  `backend/env.local.json`, the local settings as they were before the session.
- **Checkpoint: every tool of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 3 exists**, and
  the instructions hold no stopgap paragraph.
- The scratch folder's scripts deleted.
- **In the plan's "As done" note**, not in the console: the differences from the step's text,
  what was decided and by whom, the tests replaced, what the trial showed (the blocking
  requests first), the weight of the bundles before and after, what the journeys leave in the
  local tables, and what steps c09 and c10 find ready.

Then stop for review, with the short closing message of "How we work": what was done, what
failed or could not be run, and what I must decide. Suggest the commit, but commit only when I
ask. Do not push. Do not start step c09.
