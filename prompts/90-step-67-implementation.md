## Brief

Implement plan step 67, "Availability: types and weekly patterns" (`docs/FRONTEND_VIEW_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review.

One stop at the end. Four choices about the screen were made with me while this brief was
written (section "Settled before the first line of code"). There is no early stop.

This step gives the Administrator a fourth screen, the first of two steps on it: the list of
the availability types, with a form that creates one, a dialog that renames one and a deletion
that asks first; and the list of the weekly patterns, grouped by weekday, with a form that
creates one, a dialog that changes one and a deletion that asks first. It is the first screen
that uses two services at once (`AvailabilityTypesService` and `AvailabilityRulesService`),
the first that shows the **conflicts list** of a refused change (`availability_conflict`), and
the first that copies the dialog that confirms a deletion (step 66). It is the richest screen
after the week, so the fallback is watched more closely than before (design point 11). It
changes nothing in `backend/`, `shared/` or `frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the view layer and the logic layer as built), the
    commands `dev`, `build` and `seed:local`, and the test conventions for the logic layer, the
    views and the shell.
- `docs/FRONTEND_ARCHITECTURE.md` v8, all of it. It is the source of truth for this step: the
  thirteen rules of a view (section 3; rules 3, 4, 5, 9, 10 and 12 above all), the shape of a
  view (section 4: the shape of a dialog, "The list's shape", a form whose fields are checked
  with a field in fault, the username as a second checked field, and **"A dialog that confirms
  a deletion"**, the pattern this step copies), the logic layer and what was built (sections 5
  and 5.1: the users screen and the list screen are the nearest things to what this step
  builds), the shell, the table of screens and what a session owns (section 6), the fallback
  and its three conditions (section 7), the tests (section 8), the language (section 12.4),
  decisions 27, 68, 69, 79, 82 and 84 to 88.
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 67, and step 68 to see what this step
  must leave ready (the same screen gains a per-date editor and the one-off windows, with the
  conflicts list of this step).
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules; rule 6 on personal data above all),
  section 16, all of it (`AvailabilityTypesService`), section 17, all of it
  (`AvailabilityRulesService`: this step uses `loadPatterns`, `createPattern`, `updatePattern`
  and `deletePattern` only; 17.7 on `conflicts`), section 10.2 (`invalid_request` and its
  message, `conflicts` on a failure), and section 8, decisions 31, 32, 33 and 36.
- `docs/SHARED_CALENDAR_SPEC.md`: sections 6.1 and 6.2 (the rules of a type and of a pattern,
  R-TYPE-01 to R-TYPE-04, R-PAT-01 to R-PAT-04), 6.5 (overlaps: no two windows of one date may
  overlap, whatever their type), 6.7 (the conflict rule, R-AV-03 to R-AV-05, and what
  `conflicts` holds), 16.3 (a failed write may have been applied) and 16.8, the row
  "Availability management".
- `docs/ARCHITECTURE.md` section 4: the routes of the types and of the patterns, with their
  codes.

Then read the code this step builds on:
- `frontend/src/services/`: `availability-types.service.ts` and `.types.ts`,
  `availability-rules.service.ts` and `.types.ts`, and in `api.ts` what a failure with
  `conflicts` is.
- `shared/src/calendar/`: `schemas.ts` (`TypeName`, `TypeBody`, `PatternBody`, `LocalTime`,
  `LocalEndTime`, `Weekday`, `LocalDate`), `types.ts` (`AvailabilityType`, `WeeklyPattern`),
  `defaults.ts` (`CALENDAR_LIMITS`: 20 types, 50 patterns, a name of 40 characters), `time.ts`
  (`weekdayOf`: 1 is Monday, 7 is Sunday), and `shared/src/api.ts` (`AppointmentConflict`).
- `frontend/src/logic/`: `users.model.ts` and `users.screen.ts` (a pure file and a screen class
  for a list with a create and a delete: the model for this step), `settings.model.ts` (a form
  of several checked fields, one sentence per field in fault), `appointments.screen.ts` (the
  calendar's time zone read from the settings before a list is shown), `booking.ts`
  (`timeChoice`: the Administrator's two lists of local times on the 15-minute grid),
  `texts.ts` (`failureText` and its second argument; `dateText`, `rangeText`), and their tests
  in `frontend/tests/unit/logic/` (`zone.ts` and `fixtures.ts` first).
- `frontend/src/views/`: `users.view.ts` (a fixed form, a list of rows with a button each, the
  delete dialog), `settings.view.ts` (several fields in fault), `week.view.ts` (the book
  dialog: a dialog with lists filled from a stream, opened with the values of what it is
  about), `shell.ts` (`SCREENS`, `sessionObjects`), and their tests in
  `frontend/tests/unit/views/` (`page.ts` first; in `shell.test.ts` the blocks of the users
  and the test of a second person).
- `frontend/index.html` (the frame, the four screens, the dialogs) and `frontend/style.css`.
- `frontend/scripts/seed-local.mjs`: what the local calendar holds.

## Where we are (2026-11-20)

- Step 66 is committed and pushed (`2a47d83`): the users. `npm run verify -w frontend` was run
  again on 2026-11-20 and is green (1559 tests, 100 % lines); the root `lint` and `typecheck`
  too. Check `git status -sb` rather than trusting this line.
- What step 66 left for this step:
  - **the dialog that confirms a deletion** (`docs/FRONTEND_ARCHITECTURE.md` section 4 and
    decision 79): two buttons, "Keep" first; what it is about and one "asked" as local
    variables; the words from the logic layer; a failure said in the dialog, which stays open;
    a success closes it; the row goes because the list is read again. Copy it as it is;
  - **no dialog has a handler of the `close` event** (decision 84): what a dialog is about is
    replaced at its next opening;
  - **the pattern of a field in fault** (decision 69) and of a hint that is also the refusal
    (decision 82);
  - `failureText` has sentences for the transport reasons, `forbidden`, `invalid_json`,
    `invalid_request`, `internal_error` and `concurrent_update`. It has none for
    `type_name_exists`, `limit_reached`, `type_not_found`, `type_in_use`, `pattern_not_found`,
    `availability_overlap` and `availability_conflict`. Verify, do not assume;
  - `sessionObjects` creates no `AvailabilityTypesService` and no `AvailabilityRulesService`
    yet; nothing in `frontend/src/views` or `frontend/src/logic` uses either. The week takes
    its type names from `GET /calendar`, not from these services;
  - the Administrator's navigation has three links, "Week", "Settings" and "Users". This step
    gives it a fourth;
  - the status line of `docs/FRONTEND_VIEW_PLAN.md` still says step 66 is "waiting for
    review". It was reviewed: this step's edit of that line takes those words out.
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina"; 8 patterns
  valid 2026-11-20 to 2027-01-19 (Studio 09:00–13:00 Monday to Friday, Piscina 15:00–18:00
  Tuesday and Thursday and 10:00–12:00 Saturday); appointments of `alice`, some cancelled; the
  default settings (24, 0, 56, no limit). The users are `admin` and `alice`. Look before
  relying on it (read-only, through the API).
- The Codespace has no browser. The checks of steps 60 to 66 ran in Playwright's headless
  Chromium, installed outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
  Lessons from those checks:
  - read what a person can see and the values of the form fields, not the page's source;
  - give every name the check writes a tag of its run;
  - run the whole script once it is right, not many times: each run leaves history;
  - the browser reports every 4xx answer as a console line "Failed to load resource", which is
    not an error of the page: this check asks for several 409 answers on purpose;
  - signing out leaves the address: the same person signing in again lands on the screen they
    left;
  - a field the script filled stays filled: put every field back before the next case;
  - a browser sends a dialog's `close` event late, perhaps after the next opening; the tests'
    environment applies no style, so a class that the style sheet hides is seen in the
    browser only.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Settled before the first line of code

Four choices about the screen that no document had made. Apply them as written.

1. **Creating is a fixed form, changing is a dialog.** Above the list of the types, a fixed
   form with the name and "Create type"; above the list of the patterns, a fixed form with the
   pattern's six fields and "Create pattern" (as "Create user" is). A row's "Rename" (a type)
   and "Change" (a pattern) open a dialog filled with the current values; a row's "Delete"
   opens the dialog that confirms a deletion.
2. **The list shows every pattern the server returns**, grouped by weekday. One whose validity
   has ended is marked "ended" and stays in the list: a type used by any pattern, ended or
   not, cannot be deleted (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-03), so the Administrator
   must be able to see it and delete it. No switch hides anything.
3. **"Change" is one call that replaces the pattern's fields** (`updatePattern`). The shortcut
   of `docs/SHARED_CALENDAR_SPEC.md` section 6.2, "from a date on" in two calls, is not built:
   the Administrator sets "valid until" on the old pattern and creates a new one, by hand.
4. **A pattern's start and end are two lists of the local times on the 15-minute grid**, as
   the book dialog's "Start" and "End" are for the Administrator: the start from 00:00 to
   23:45, the end from 00:15 to 24:00. Nothing off the grid can be chosen. The two dates are
   native date fields, as the period of "My appointments".

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new logic goes** (`frontend/src/logic/`, each file with its test in
   `frontend/tests/unit/logic/`). Propose the files' names in the report; what they hold:
   - pure, for the types: the rows of the list in the server's order (the name, and the names
     of its two buttons for a screen reader, "Rename Studio", "Delete Studio"); the sentence
     of an empty list; from what the name field holds to either the argument of `create` or
     `rename`, or the refusal of the field; the words of the delete dialog for a type;
   - pure, for the patterns: the groups of the list, Monday to Sunday, a weekday with no
     pattern left out, each group ordered by start, then by end, then by "valid from"; a row
     with its time ("09:00 – 13:00"), the name of its type, its validity in words ("from 20
     November 2026", "from … to …") and whether it has ended; the sentence of an empty list;
     the lists of the choices (weekdays, starts, ends, types); from the form's fields to
     either a `PatternBody` or the refusals, one sentence per field in fault; the fields of a
     pattern as the change dialog shows them; the words of the delete dialog for a pattern;
   - pure, for the conflicts: from the `conflicts` of a failure to the rows to draw, each
     with its date, its time and its User, in the calendar's time zone, ordered by start; and
     the sentence above them, which says how many appointments are in the way;
   - a class for the screen, shaped like `UsersScreen`: one public stream, `void` methods,
     nothing started by the constructor (design points 5 and 6);
   - `texts.ts` gains the sentences of the seven codes named above (design point 7).
2. **A type's name is checked in the logic layer, before any call**, with the shared
   `TypeName` schema and nothing written a second time: no length and no rule in
   `frontend/src`; the number 40 in the hint comes from `CALENDAR_LIMITS.typeNameLength`.
   - Spaces around the name are removed (the schema does it; the service sends the parsed
     output); nothing else is changed.
   - "", "   ", a name of 40 characters, one of 41, " Studio ", a name with a tab inside and
     a name with `<script>` each have a decided outcome, tested.
   - `type_name_exists` and `limit_reached` are the server's answers, not refusals of the
     check: the form's failure, in plain words, and the field is not marked in fault. The
     page does not compare the name with the list on show: only the server knows the stored
     types, and it compares without regard to case.
   - A rename to the same name is sent as it is; whatever the server answers is shown.
3. **A pattern's fields are checked in the logic layer, before any call**, and `PatternBody`
   stays the last word: a body the logic accepted and the service refuses is a defect to
   report. The fields, in the form's order: "Weekday" (a list, Monday to Sunday), "Start" and
   "End" (settled point 4), "Type" (a list of the types by name), "Valid from" (a date,
   required) and "Valid until" (a date, or empty for no end; say so in its hint). The refusals:
   - the end not after the start;
   - no type chosen (also when no type exists yet: the form then says, in the place of its
     hint, that a type must be created first, and "Create pattern" refuses);
   - "valid from" empty or not a date;
   - "valid until" not a date, or before "valid from".
   Every field in fault is said, each with one sentence that names it in the words of its
   label (decisions 68 and 69). What only the server knows is not checked: an overlap with
   another window, a conflict, the limit of 50, a type deleted in the meantime.
   - "Today" is not a rule here: a pattern may start in the past
     (`docs/SHARED_CALENDAR_SPEC.md` R-PAT-03). The create form's "valid from" starts with
     today's date in the calendar's time zone, as a convenience, set from the stream.
   - After a create that succeeded the form goes back to its starting values, from the
     stream; after a failure what was chosen stays.
4. **The conflicts list.** `availability_conflict` can answer `createPattern`,
   `updatePattern` and `deletePattern`. In each of the three places (the create form, the
   change dialog, the pattern's delete dialog) the failure is one sentence and, under it, the
   list of the appointments in the way: date, time and User.
   - One markup for a conflict row (a template), used in the three places; one function of
     the logic layer makes the rows.
   - `conflicts` holds usernames and times, personal data
     (`docs/FRONTEND_SERVICES.md` section 17.7): into the page through `textContent` only,
     never logged, and out of the page when the dialog that shows it is opened again, when
     the form is sent again, and at the view's teardown.
   - An empty or missing `conflicts` with that reason shows the sentence alone.
   - The page offers no way to cancel the appointments from there: the Administrator goes to
     the week. Say so in the sentence if it reads well; I review the words.
   - Step 68 shows the same list for an override and a window: say in the architecture what
     it will reuse.
5. **What the screen reads, and when.**
   - `start()` reads three things: the settings, for the calendar's time zone (as "My
     appointments" does; the zone decides "today", so which patterns have ended, the starting
     "valid from" and the dates of a conflict), the types and the patterns. While they are
     not known the screen says it is loading. A failed read is said in plain words in the
     place of its list, with "Try again"; the two lists fail and are tried again
     independently, and a form stays usable when its own list could not be read, except that
     a pattern needs the list of the types to be created.
   - A pattern's row shows its type's name, joined in the logic layer from the two lists. A
     pattern whose type is not in the list of types (read at different moments) shows a
     fixed word in its place; decide it and test it.
   - **After a write.** The types are read again after every result of a create, a rename and
     a delete of a type, a failure included; the patterns after every result of a create, a
     change and a delete of a pattern, a failure included
     (`docs/SHARED_CALENDAR_SPEC.md` section 16.3). A rename also changes what the patterns'
     rows say: the join is made again from the new list of types, with no second read of the
     patterns. A `type_not_found` on a pattern's write means the list of types on show is
     old: read the types again too.
   - Both lists are read again every time the tab becomes visible, through the same stream
     the shell hands the other screens. An open dialog stays as it is.
   - Not for a result that was already there at `start()`.
   - The rows are redrawn only when their list object changed (decision 85), so the focus
     stays on a row's button through a notification that brings nothing new. A list that
     could not be read again is taken off the screen, as the users' is.
6. **What goes through the screen object and what the view calls directly.** Decision 86
   drew the line at step 66: a write with a check goes through the screen object ("Create
   user"), a write with nothing to check is called by the view on the service ("Delete
   user"). Here: the two creates, the rename and the change have a check and go through the
   screen object; the two deletes are called by the view on the services. The rename and the
   change happen in a dialog, so their refusals and failures must reach **the dialog that
   asked**, and only it: say in the report how the stream carries them, and keep the "asked"
   of the other dialogs.
7. **The sentences.** Seven codes get their words in `texts.ts`:
   - `type_name_exists`, `type_in_use`, `type_not_found`, `pattern_not_found`,
     `availability_overlap` and `availability_conflict`, one sentence each. `type_in_use`
     says what to do: a type is in use while a weekly pattern, a date of today or later or an
     upcoming appointment uses it. `availability_overlap` says that another window of the
     same day covers part of these hours, whatever its type;
   - `limit_reached` depends on what was attempted: 20 types, 50 patterns, the numbers from
     `CALENDAR_LIMITS`, never written in a sentence by hand. `failureText` has a second
     argument for exactly this; extend its `Attempt` type rather than adding another way.
   The table of the sentences, new and changed, is in the report: I review the words.
8. **The markup.** One screen element, `#availability`, with two parts, each under its own
   heading:
   - "Types": the create form (one `.field`: the label, the text input, the hint, the
     refusal; the failure; "Create type"), the read's failure with "Try again", the sentence
     of an empty list, the `<ul>` and the template of a row (the name, "Rename", "Delete");
   - "Weekly patterns": the create form (the six fields of design point 3, each a `.field`;
     the failure; the conflicts; "Create pattern"), the read's failure with "Try again", the
     sentence of an empty list, the list and its templates (a weekday's group with its
     heading; a row with the time, the type, the validity, "ended", "Change", "Delete");
   - the native dialogs, opened with `showModal()`: the rename's (the name field, its
     refusal, the failure, "Keep" or "Cancel" and "Rename": propose the words), the change's
     (the same six fields as the create form, the failure, the conflicts), and the
     deletion's. **One delete dialog for both a type and a pattern, or one each**: choose,
     and say why, knowing that step 68 adds two more deletions on this screen. Either way it
     is the dialog of step 66, plus the conflicts for a pattern.
   - The type lists of the two pattern forms are `<select>` elements whose options the script
     fills from the stream, as the book dialog's list of users: a fixed field whose choices
     change is not a redrawn region (rule 4). A list of types that arrives while the change
     dialog is open must not move what is chosen in it; decide and test what happens when
     the chosen type is gone from the new list.
   - The buttons of a row say whom to a screen reader (`aria-label`: "Change Monday 09:00 –
     13:00 Studio", or shorter: propose).
   - **No class of the page holds the word `admin`**, and a new class is looked for in the
     style sheet first (`CLAUDE.md`: `dialog .noted` once hid a button that had taken that
     name). `.delete`, `.created`, `.list`, `.field`, `.hint`, `.refusal`, `.empty` and
     `.unread` exist already, some scoped to `#users`.
9. **The shell.** A fifth entry of `SCREENS`: `#/availability`, "Availability", the role
   `admin` only, after "Users". `sessionObjects` gains the two services, one each per
   session, and the screen object. The code that reads the address, fills the navigation and
   switches between screens should not need to change; if more must change, say what and why.
10. **The week after a change of availability.** Nothing is added for it: the week loads at
    its `start()`, so going from "Availability" to "Week" shows the new windows and a
    renamed type's name. The browser check shows it; if it does not hold, stop and say so.
11. **Watch the fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7). Two lists, two fixed
    forms, three or four dialogs and about ten streams of state make this the largest view
    after the week (312 lines), and step 68 adds to the same screen.
    - If the code that looks nodes up grows longer than the rest of the view, or a helper
      that builds or updates nodes is about to be written, stop and say so before writing a
      workaround.
    - If the view file is on its way past the week's size, stop and propose how to divide it
      (for example two mount functions, one for the types and one for the patterns, mounted
      by the one entry of `SCREENS`) rather than deciding it alone: the plan names one file,
      `availability.view.ts`.
    - A redrawn region still holds no input field: the rows hold buttons only, and both
      forms and every dialog are outside the lists.
12. **Tests.**
    - The logic: every function and every path, with fake services and under
      `useFarBrowserZone()`. Most of the step's cases are here. The cases of the time zone
      to keep: "today" for "ended" and for the starting "valid from" taken in the calendar's
      zone and not in the machine's (a "now" at which the two dates differ); a conflict's
      date and time in Rome in winter and in summer, and on the night the clocks go back.
    - The view: the real `index.html`, a fake screen object and fake parts of the two
      services.
    - The shell: the real services behind the stubbed `fetch`.
    - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.

## The step

What `docs/FRONTEND_VIEW_PLAN.md` step 67 lists.

- **Logic**, with tests that include:
  - the types' rows: several in the server's order, one, none; a name containing `<script>`
    kept as text; the name's cases of design point 2, with what is sent or the refusal, and
    every accepted name accepted by the shared `TypeBody` too (checked in the test);
  - the patterns' groups: patterns of several weekdays out of order, two on one weekday, an
    empty weekday left out, an end at 24:00, no end of validity, one that ended yesterday,
    one that ends today (not ended), one that starts in the future, a type that is not in
    the list;
  - the pattern's form: each refusal of design point 3 alone and several at once; an accepted
    body equal to what `PatternBody` parses (checked in the test); "valid until" empty sent
    as `null`; the fields of an existing pattern for the change dialog, and that sending them
    back unchanged makes the same body;
  - the conflicts: none, one, several out of order, a username containing `<script>`;
  - the words of the two deletions;
  - the screen: nothing read before `start()`; the three reads, each one's failure and its
    next try; each write refused by the check (no call, the lists kept); each write that
    succeeds, with its reads; each write that fails, with a server's code and with a
    transport reason, followed by its read all the same and with what was typed kept;
    `availability_conflict` with its list in the stream; a rename changing the patterns'
    rows without a read of the patterns; a second write while one is under way; the tab
    becoming visible; results that were already there at `start()`; nothing read after the
    subscription ends; started again, everything read again.
- **The sentences:** design point 7, with their tests; the hints and the refusals of the
  fields; the sentences of the two empty lists; the words of the dialogs.
- **Markup and styles:** design point 8; their styles in `frontend/style.css`. A phone and a
  desktop are served by the same markup: the pattern form's six fields wrap, and a row with
  its two buttons fits a phone. No inline script, style or handler (`page.test.ts` keeps
  passing, with its assertions brought in line).
- **The view:** `availability.view.ts` and its DOM test:
  - every state of every stream it listens to;
  - each form's button and its call with the fields as they are; each refusal shown beside
    its field and announced, and gone when the stream says so; a form put back only when the
    stream says so;
  - the rename dialog and the change dialog: opened with the values of the row; the call; a
    refusal and a failure shown in the dialog that asked, which stays open; a success closing
    it; a result this opening did not ask for changing nothing in it; opened for another row,
    nothing left of the one before;
  - the delete dialog for a type and for a pattern: the words; "Keep" and Escape closing it
    with no call; the call; pending; each failure, `type_in_use` above all; the success
    closing it;
  - the conflicts list in each of its three places, gone at the next try and at the next
    opening;
  - the rows redrawn only when their list object changed; a name containing `<script>` shown
    as text in a row, in a button's accessible name, in a list of types and in a dialog;
  - nothing left in the page after unsubscribing: no row, no option, no name, no conflict,
    every dialog closed and empty, the forms as `index.html` has them, no field in fault.
- **The shell:** the Administrator's navigation with its four links and the one marked;
  `#/availability` typed by a User shows the week and the address is put right, and none of
  its routes is asked for; the screen's three requests with the person's token; a create, a
  rename and a delete of a type, and a create, a change and a delete of a pattern, each with
  its request and its reads; a 409 `availability_conflict` shown with its list; availability,
  week, availability: nothing left over or doubled; the test of a second person still
  passing, with the new screen's fields among those it compares.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v9: section 4 (the shape of this screen: a create form
    and a dialog that changes, the conflicts list, the delete dialog as copied), section 5.1
    (the new files, the screen, its reads, the join of the type names, what goes through the
    screen object), section 6 (the fifth entry, what a session owns), section 8 (whatever
    was learnt), section 9, the decisions table (the four settled points and what this step
    decided), the status line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 66 no longer "waiting for review";
    step 67 done, with its date), and step 67's text brought in line with what was settled,
    with a change log line.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7, for the files added.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions (whatever was
    learnt), "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- date overrides, one-off windows and anything about a single date (step 68);
- "from a date on" in two calls (settled point 3); copying a pattern; several weekdays in one
  create;
- a switch that hides the ended patterns, a search, a sort chosen by the person;
- cancelling or opening an appointment from the conflicts list;
- how many patterns or appointments use a type, said before its deletion: the server's
  `type_in_use` is the answer;
- any change to the week, the book dialog or the other screens;
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- the size of the bundle, hosting, CORS, logout as a service, the session in `sessionStorage`;
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width.
The first call of each route takes a few seconds under `sam local`: wait for it, do not count
it as a failure. The check creates types named with the tag of its run (`chk67-<number> …`,
within the 40 characters of a name) and patterns of those types only, **in hours the seed's
patterns leave free** (early morning or evening: no two windows of one date may overlap,
whatever their type), and **removes every one of them at the end, whatever happened**: first
the appointment it booked (cancelled), then its patterns, then its types. It never changes or
deletes "Studio", "Piscina" or their patterns, and it reads the settings first and changes
none.

Steps 60 to 66 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; she books
   a free slot with a note and cancels it; "My appointments" lists her appointments;
2. as `admin`, "Settings" shows the four values; "Users" lists `alice` and not `admin`.

Step 67, as `admin`:

3. the navigation has "Week", "Settings", "Users" and "Availability"; the fourth shows the
   two lists: "Piscina" and "Studio", and the 8 patterns under their weekdays in the order of
   the clock; the address is `#/availability` and its link is the one marked; say which
   requests the screen made;
4. a type's name that is not allowed (empty, spaces only, 41 characters) is refused under the
   field with no request sent; "studio", in small letters, is refused by the server, said in
   plain words, and what was typed stays;
5. **a type is created**: the `POST`, then the read; it is in the list, in the two lists of
   types of the pattern forms, and the field is empty;
6. **it is renamed**: the dialog opens with its name; "Keep" and Escape close it with no
   request; a rename to "Studio" is refused in the dialog, which stays open; a good name
   sends the `PUT`, the dialog closes, and the list shows the new name;
7. **a pattern of that type is created** in free hours of a weekday within the next days:
   the `POST`, then the read; it is under its weekday, in the order of the clock; the form is
   back to its starting values;
8. a pattern refused by the check (the end not after the start, no "valid from", "valid
   until" before "valid from": each alone, then all at once) is refused under its fields with
   no request sent; one that overlaps a pattern of "Studio" is refused by the server in plain
   words, and what was chosen stays;
9. **the week shows the new pattern's windows**, in the new type's colour and with its name
   in the legend, with no reload of the page;
10. the type's name is changed again and the pattern's row says the new name; so does the
    week;
11. **the pattern is changed** (an hour longer): the dialog opens with its six values; the
    `PUT`, then the read; the row and the week show it; a pattern with an end at 24:00 can be
    made and shows "24:00";
12. **a deletion of a type in use is refused and says why**: "Delete" on the check's type,
    which has a pattern, answers in the dialog, which stays open; the same on "Studio"
    (nothing is changed by it); "Keep" closes;
13. **the conflicts**: the Administrator books a slot of the check's pattern for `alice` in
    the week; back on "Availability", a change that would leave that appointment outside the
    pattern (shorter hours, another type, a "valid until" before it) is refused in the dialog
    with the appointment listed, its date, time and User right for the calendar's zone; the
    deletion of the pattern is refused the same way in its dialog; the appointment is
    cancelled in the week, and then the same change and the deletion go through;
14. a pattern whose validity ended (made by the check with both dates in the past) is in the
    list, marked "ended", and can be deleted;
15. **the pattern is deleted** and its row is gone; the week no longer shows its windows;
    then **the type is deleted** and is gone from the list and from the two lists of types;
16. a write that cannot reach the server (failed by the check, with `page.route`: a
    connection refused on a create, a 409 `concurrent_update` on a change, a 404 on a delete)
    is said in plain words where it was asked, what was typed stays, the list is read again,
    and the same button works again;
17. the tab becomes visible again with the change dialog open (the check defines
    `visibilityState` and sends `visibilitychange`): both lists are read again and the dialog
    keeps what was chosen in it;
18. sign out from "Availability" with a dialog open and a conflicts list on show, sign in as
    `alice` in the same page: no name of a type of the check, no conflict and no name of the
    first person in what the page shows, in its source or in its fields.

As `alice`:

19. the navigation has "Week" and "My appointments", not "Availability"; `#/availability`
    typed by hand shows the week and the address is put right; no request to
    `/calendar/patterns` is made from her page; her week shows what the Administrator's
    changes made of it.

Both:

20. at the phone width the two forms, the two lists and every dialog fit the screen, a name
    of 40 characters wraps, and nothing makes the page wider;
21. by keyboard only: reach "Availability", create a type with the Enter key, rename it,
    create a pattern, change it, delete both; say where the focus is after each dialog
    closes, above all after a delete, when the row whose button opened the dialog is gone;
22. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; no request to another origin.

At the end the check removes what it made and reads the two lists once more to say that only
"Studio", "Piscina" and their 8 patterns are left. Say what stays in the local table as
history (the cancelled appointment and its events).

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local `calendar` table:** the browser check writes types, patterns and one
  appointment. Never run the back end's integration journeys in this step (they empty the
  table), nor the front end's while the browser check is under way (they set the settings for
  their run and write availability of their own). Never change or delete what the seed made.
  If a run of the check is cut short, the first thing to do is to list the types and the
  patterns and remove the run's own. If the table turns out to be empty, ask me before
  running `seed:local`.
- **Hard rules:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no rule in
    a view: whether a name or a pattern is accepted, the order of the list, what "ended"
    means and the words of a refusal are decided in the logic layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except opening and closing a dialog;
  - dates and times go through `shared/`'s time helpers and the calendar's zone, never the
    browser's;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a name, a username and
    a conflict reach the page through `textContent` (and the accessible name of a button)
    only and are never logged; the service's `message` never reaches the page;
  - the existing tests keep passing unchanged, except where this brief says a case changes
    (`page.test.ts` on the screens, the dialogs and the templates; the shell's tests of the
    Administrator's navigation and of what a session creates); if another must change, say
    which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 67)

- The design points applied as written, and the four points settled before the start applied
  as settled (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with steps 60 to 66 in short, and everything it made
  removed.
- The report says how long each view file is (lines, and how many of them look nodes up), how
  long `index.html` became, how many streams the new view listens to, whether one delete
  dialog or two were built and why, how a refusal reaches the dialog that asked (design point
  6), what step 68 can reuse as it is (the conflicts list, the delete dialog, the lists of
  times), and whether any condition for the fallback (`docs/FRONTEND_ARCHITECTURE.md` section
  7) was met or came close.
- The table of the sentences, new and changed: I review the words.
- Which existing test cases changed, and what changed in each.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 66's (536 kB, 118 kB).
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 68.
