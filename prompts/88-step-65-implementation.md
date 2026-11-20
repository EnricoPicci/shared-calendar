## Brief

Implement plan step 65, "Settings" (`docs/FRONTEND_VIEW_PLAN.md`), following CLAUDE.md's
working rhythm: one step, its acceptance check, an honest report, then stop for review.

One stop at the end. Seven choices were made with me while this brief was written: four about
the settings screen (section "Settled before the first line of code") and three left open by
the reviews of steps 63 and 64 (section "Where we are"). There is no early stop.

This step gives the Administrator a second screen: the four settings of the calendar, read and
changed in one fixed form. It is the first of the Administrator's forms and the simplest, and
the first screen where a person types values that have a range: how a value out of range is
refused, with its field named and no request sent, is settled here for the forms of steps 66
to 68. It also changes two wordings of the book dialog and of a refused change, decided at
review. It changes nothing in `backend/`, `shared/` or `frontend/src/services/`, and nothing in
the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the view layer and the logic layer as built), the
    commands `dev`, `build` and `seed:local`, and the test conventions for the logic layer, the
    views and the shell;
  - the notes on the local `calendar` table and on the settings: who empties the table, and
    what the front end's integration tests do to the settings
    (`fe-calendar-settings.local.json`).
- `docs/FRONTEND_ARCHITECTURE.md` v6, all of it. It is the source of truth for this step: the
  thirteen rules of a view (section 3; rules 1, 4, 9, 10 and 12 above all), the shape of a view
  (section 4: the login is the model of a fixed form; "The list's shape" for a form beside a
  stream), the logic layer and what was built (sections 5 and 5.1: the list screen above all,
  which is the nearest thing to what this step builds), the shell, the table of screens and
  what a session owns (section 6), the fallback and its three conditions (section 7), the tests
  (section 8), the language (section 12.4), decisions 21, 22, 27, 30, 34, 40, 51, 55 to 58.
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 65, and steps 66 to 68 to see what this
  step must leave ready (three more forms for the Administrator, each with fields to check).
- `docs/SHARED_CALENDAR_SPEC.md`: section 9 (the four settings, their ranges, R-SET-01 to
  R-SET-03, what each one governs), section 11.1, routes 1 and 2, with sections 11.4 and 11.5
  (`UpdateSettingsBody`, `CalendarSettings`), section 16.3 (a failed write may have been
  applied), section 16.8 (what the settings screen needs), and R-TIME-01 (the time zone is a
  deployment parameter: read-only).
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules), section 15, all of it
  (`CalendarSettingsService`: `load`, `update`, what is checked before sending, the codes,
  15.6 on loading again after a failed write), section 10.2 (`invalid_request` and its
  message), and section 8, decisions 31, 33, 34 and 36.

Then read the code this step builds on:
- `frontend/src/logic/`: `appointments.model.ts` and `appointments.screen.ts` (a pure file and
  a screen class beside it; the period's checks, with their sentences, are the model for this
  step's checks), `texts.ts` (`failureText`, `dateTimeText`), and their tests in
  `frontend/tests/unit/logic/` (`zone.ts` and `fixtures.ts` first).
- `frontend/src/views/`: `login.view.ts` and `appointments.view.ts` (a fixed form whose fields
  are set from a stream only when the stream brings another object), `shell.ts` (`SCREENS`,
  `sessionObjects`: the `CalendarSettingsService` is created there already, for the list
  screen), and their tests in `frontend/tests/unit/views/` (`page.ts` first; in
  `shell.test.ts` the block `"My appointments", the second screen`).
- `frontend/index.html` (the frame, the two screens, the period's form) and
  `frontend/style.css`.
- `frontend/src/services/`: `calendar-settings.service.ts` and `calendar-settings.types.ts`.
- `shared/src/calendar/`: `defaults.ts` (`DEFAULT_SETTINGS`, `SETTINGS_RANGES`), `schemas.ts`
  (`UpdateSettingsBody`, `setting(…)`), `types.ts` (`CalendarSettings`).

## Where we are (2026-11-19)

- Step 64 is committed and pushed (`880f293`): "My appointments", the detail dialog shared by
  two screens, "Change" from the list handed over to the week. Check `git status -sb` rather
  than trusting this line.
- What step 64 left for this step:
  - `sessionObjects` creates one `CalendarSettingsService` per session and hands it to the
    `AppointmentsScreen`, which uses `load` and `settingsResult$` for the time zone. It is not
    in `SessionObjects` yet: no view uses it;
  - the list screen ignores a settings result that was there before its `start()` and listens
    only while it is started. The list is a User's screen and the settings the
    Administrator's, so the two never run in one session; do not build on that, and do not
    break it either (design point 6);
  - the Administrator's navigation has one link. This step gives it a second: the checks of
    step 64 on leaving a screen and coming back are made here for the Administrator;
  - `failureText` should already have a sentence for every code of `GET` and
    `PUT /calendar/settings`: `forbidden`, `invalid_json`, `invalid_request`,
    `concurrent_update`, `internal_error` and the transport reasons. Verify, do not assume.
- **Decided: the history of "My appointments" stays as it is.** It opens on the 30 days that
  end today; an appointment cancelled or moved today for a later date is found by choosing a
  period that reaches forward (`docs/FRONTEND_ARCHITECTURE.md` section 11, decision 59). Do
  not change it; in that decision's row, replace "Whether the default should reach forward is
  for the review" with the fact that it was confirmed at the review of step 64.
- **Decided: the two wordings raised at step 63's review change in this step** (design
  point 10):
  - the Administrator's two lists of times in the book dialog are labelled "Start" and "End",
    not "From" and "To", in both modes of the dialog;
  - `appointment_limit_reached` after a change has a sentence of its own.
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina", 8 patterns
  valid 2026-11-19 to 2027-01-18, five booked appointments of `alice`, and the history of the
  checks of steps 62 to 64 (about 54 cancelled and 19 changed appointments of `alice`, several
  deleted throw-away users). The settings hold the default values (24, 0, 56, no limit), last
  saved by `admin` on 2026-11-19. Look before relying on it (read-only, through the API) and
  **write down the settings you find: the check puts them back.**
- The Codespace has no browser. Step 64's check ran in Playwright's headless Chromium,
  installed outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
  Lessons from that check: read what a person can see and the values of the form fields, not
  the page's source; give every note the check writes a tag of its run, so that the leftovers
  of an earlier run are not counted; run the whole script once it is right, not six times (each
  run leaves history in the local table); the browser reports every 4xx answer as a console
  line "Failed to load resource", which is not an error of the page.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Settled before the first line of code

Four choices about the screen that no document had made. Apply them as written.

1. **"No limit" for `maxFutureAppointmentsPerUser` is a checkbox** beside the number field.
   Checked, the field is disabled and `null` is sent; unchecked, the field's number is sent,
   and an empty field is a field in fault like any other. An empty field never means "no
   limit".
2. **The form shows three things beside the four fields:**
   - under each field, its unit and its range in words, from `SETTINGS_RANGES` ("hours, from 0
     to 720");
   - the calendar's time zone as a read-only line, with a sentence saying that it is set when
     the calendar is installed and cannot be changed here;
   - who saved the settings last and when, in the calendar's zone ("Last saved by admin on Thu
     19 Nov, 16:44"), or "These are the default settings: nobody has saved them yet." while
     `updatedAt` is `null`.
3. **Values typed and not saved are lost, with no question**, on a change of screen and on
   signing out, as a typed note is in the dialogs. Coming back, the form shows the saved
   values, read again.
4. **After "Save":**
   - the settings are read again after every result of a save, a failure included
     (`docs/SHARED_CALENDAR_SPEC.md` section 16.3);
   - on a success the form is filled with what the server answers, and one sentence says
     "Settings saved." until the next edit or the next save;
   - on a failure the failure is said in plain words and **the typed values stay in the
     form**: the read that follows does not overwrite them, and only brings the line about the
     last save up to date.

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new logic goes** (`frontend/src/logic/`, each file with its test in
   `frontend/tests/unit/logic/`):
   - a pure file for the form: from a `CalendarSettings` to what the form shows (the four
     values as the fields hold them, the "No limit" state, the time zone, the line about the
     last save, in the zone the settings name); the ranges in words; and from what the fields
     hold to either the argument of `CalendarSettingsService.update` or a refusal that names
     the field;
   - a class for the screen, shaped like `AppointmentsScreen`: one public stream, `void`
     methods, nothing started by the constructor, "now" passed in only if something needs it.
     It reads the settings at `start()`, holds the last settings read, takes the save, reads
     again after it, and carries the loading, the failure, the refusal and "saved";
   - `texts.ts` grows only if a code of the two routes has no sentence yet.
2. **The fields are checked in the logic layer, before any call.** The service checks the same
   body with the shared schema and answers `invalid_request` with a message that names the
   field, but that message is a developer's and never reaches the page
   (`docs/FRONTEND_ARCHITECTURE.md` section 11, decision 27).
   - Each field: not empty, a whole number, inside its range. The ranges come from
     `SETTINGS_RANGES` of `shared/`, never a number written a second time.
   - A refusal is one sentence that names the field in the words of its label and says the
     range ("Cancellation notice must be a whole number from 0 to 720."), and says which field
     it is about, so that the view can mark it (`aria-invalid`) and show the sentence beside
     it. Every field in fault is reported, not the first only.
   - No request is sent, and nothing else on the screen changes.
   - What the fields hold is text: "24", " 24 ", "24.0", "24.5", "1e2", "-1", "" and "abc"
     each have a decided outcome, tested. Say in the report which are accepted.
   - The schema stays the last word: a body the logic accepted and the service refuses is a
     defect to report, and the general sentence of `invalid_request` is what the person reads.
3. **One fixed form, set from the stream.** The form is filled when the stream brings another
   settings object, not at every notification, so a value being typed is left alone by a
   notification that arrives meanwhile (as the two dates of the list are). The native
   controls: `<input type="number">` with `min`, `max` and `step` set by the script from what
   the logic layer says, as a convenience; the form has `novalidate`, and the check that
   counts is design point 2. Say in the report what `happy-dom` does with a number field
   (`value`, `valueAsNumber`, a text that is not a number).
4. **A handler never changes the screen to show an outcome.** "Save" calls the screen object
   with the fields as text; the refusal, the failure, "saved" and the disabled button all come
   from the stream. The one pure view action is the "No limit" checkbox enabling and disabling
   its number field.
5. **Reading and saving.**
   - `start()` reads the settings; while they are not known the form is not shown and the
     screen says it is loading. A failed read is said in plain words in the place of the form,
     with a way to try again.
   - While a save is under way "Save" is disabled. `concurrent_update` has its sentence and
     the person tries again.
   - After a change of settings nothing else is told: the week and the list read what they
     need when they are next shown. Say in the report whether anything on screen is stale
     after a save and until when.
6. **The settings service is one per session, used by two screens.** The `AppointmentsScreen`
   listens to `settingsResult$` while it is started, the settings screen to its own streams
   while it is started. Only one screen is on show at a time and the two belong to different
   roles; even so, the settings screen must not rely on the list screen's absence: a result
   that was there before its `start()` is not this start's (the same care as everywhere).
7. **The shell.** A third entry of `SCREENS`: `#/settings`, "Settings", the role `admin` only,
   after the others. `SessionObjects` gains the settings screen. The code that reads the
   address, fills the navigation and switches between screens should not need to change; if
   more must change, say what and why.
8. **Watch the fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7): a form with four fields
   and a refusal beside each is the kind of place where a helper that updates nodes gets
   written. If the code that shows and clears the refusals grows into one, stop and say so
   before writing a workaround. What this step settles for a field in fault (the markup, the
   class, where the sentence goes) is what steps 66 to 68 will copy: keep it small and say it
   in the architecture.
9. **Tests.**
   - The logic: every function and every path, with a fake service and under
     `useFarBrowserZone()`. Most of the step's cases are here.
   - The view: the real `index.html`, a fake screen object.
   - The shell: the real service behind the stubbed `fetch`.
   - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.
10. **The two wordings decided at review.**
    - **"Start" and "End".** In `index.html` the labels of the two lists of times of the book
      dialog become "Start" and "End". The lines "From:" and "To:" of the confirmation of a
      change, which name the old time and the new one, stay. Nothing else of the dialog
      changes: the names of the fields (`start`, `end`), the view and the logic are as they
      are.
    - **A limit met by a change.** `failureText('appointment_limit_reached', 'change')` is
      "You have more upcoming appointments than the calendar now allows, so this one cannot be
      moved. Cancel one first.", through the table of the sentences that depend on what was
      attempted, beside `cancellation_notice_too_short`. After a booking the sentence stays
      "You have as many upcoming appointments as the calendar allows. Cancel one to book
      another." I review the new words in the report.

## The step

What `docs/FRONTEND_VIEW_PLAN.md` step 65 lists, and the two wordings of design point 10.

- **Logic**, with tests that include:
  - the form from the settings: the defaults with `updatedAt` `null`; saved settings with who
    and when, in a calendar zone that is not the browser's, in winter and in summer; a limit
    and no limit; the ranges in words, equal to `SETTINGS_RANGES`;
  - from the fields to the body: the four values as numbers; "No limit" as `null`; each
    field's lowest and highest value accepted and the next one refused; each of the texts of
    design point 2; two fields in fault at once; the limit's field ignored while "No limit"
    is checked, whatever it holds; a body the shared schema accepts for every accepted input
    (checked against `UpdateSettingsBody` in the test);
  - the screen: nothing read before `start()`; the read, its failure and the next try; a
    save with a refusal (no call, the settings kept); a save that succeeds (the call, the
    read again, "saved"); a save that fails (the failure in plain words, the read again all
    the same, the settings kept); `concurrent_update`; a second save while one is under way;
    "saved" gone at the next save; a result that was already there at `start()`; nothing
    read after the subscription ends; started again, the settings read again.
- **The two wordings** (design point 10): the two labels in `index.html`; the sentence in
  `texts.ts` with its test (after a change, after a booking, and after a cancellation, where
  the reason cannot arrive and the booking's sentence is what `failureText` answers); the
  week view's test of the confirmation showing the new sentence for that reason; the tests
  that read the two labels, brought in line.
- **Markup and styles:** the element of the screen with its form, the four fields with their
  labels and their ranges, "No limit", the time zone, the line about the last save, the
  refusal of each field, the failure, "saved", "Save"; their styles in `frontend/style.css`. A
  phone and a desktop are served by the same markup. No inline script, style or handler
  (`page.test.ts` keeps passing, with its assertions brought in line).
- **The view:** `settings.view.ts` and its DOM test: every state of the stream; "Save" and its
  call with the fields as text; the checkbox and its field; a refusal shown beside its field
  and announced, and gone when the stream says so; the form filled only when the settings are
  another object; a text containing `<script>` shown as text (the name of who saved last);
  nothing left in the page after unsubscribing, every field emptied.
- **The shell:** the Administrator's navigation with its links and the one marked; `#/settings`
  typed by a User shows the week and the address is put right; the screen asks the settings
  with the person's token; a save sends the `PUT` and reads again; week, settings, week,
  settings: nothing left over or doubled; signing out on the settings with values typed leaves
  nothing, and the next person sees nothing of the first; a User's "My appointments" still
  reads the settings, then the list, as step 64 checked.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v7: section 4 (the shape of a form whose fields are
    checked: a field in fault), section 5.1 (the new files, the settings screen, the checks
    and where the ranges come from, the read after a save), section 6 (the third entry, what
    a session owns), section 8 if something new was learnt about `happy-dom` (the number
    field and the checkbox are the likely places), section 9, the decisions table, the status
    line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 65 done, with its date), and step
    65's text brought in line with what was settled, with a change log line.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7, for the files added.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions if something new
    was learnt, "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- a setting shown to a User, or the rules explained in the week or in the book dialog with
  the settings' values;
- the time zone changed: it is a deployment parameter;
- anything about users, types, patterns, overrides or windows (steps 66 to 68);
- a question before leaving with unsaved values; an "undo"; a history of the settings;
- the default period of the history: it stays (decided);
- any other wording of the dialogs than the two of design point 10;
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- the size of the bundle, hosting, CORS, logout as a service, the session in `sessionStorage`;
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width.
The first call of each route takes a few seconds under `sam local`: wait for it, do not count
it as a failure. **Before anything else the check reads the settings through the API and keeps
them; at the end, whatever happened, it writes them back and reads them once more to say so.**

Steps 60 to 64 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; she books
   a free slot with a note and cancels it; as `admin`, the book dialog and the confirmation of
   a change show the two lists labelled "Start" and "End", under the lines "From:" and "To:"
   in the confirmation;
2. "My appointments" shows her upcoming appointments after the settings and the list and no
   other request; "History" lists a period; a row opens the detail.

Step 65, as `admin`:

3. the navigation has "Week" and "Settings"; the second shows the four current values, the
   ranges, the time zone and who saved last and when, in the calendar's zone; the address is
   `#/settings` and its link is the one marked;
4. the one request of the screen is `GET /calendar/settings`;
5. a value above its range, one below, a field emptied, a number with a decimal and a text
   that is not a number are each refused with the field named, beside that field, with no
   request sent; two fields in fault are both said;
6. a valid change is saved: the `PUT` with the four values, then the `GET` again; "Settings
   saved."; the line about the last save says `admin` and now;
7. "No limit" unchecked with a number, saved, then checked again and saved: the body holds the
   number, then `null`; unchecked with the field left empty, it is refused like any field in
   fault;
8. the value is still there after signing out and in;
9. **a change refused for the limit says so in its own words.** With the limit set below the
   number of `alice`'s upcoming appointments (to 1, say), she moves one of them: the
   confirmation says "You have more upcoming appointments than the calendar now allows, so
   this one cannot be moved. Cancel one first.", and the banner stays; a booking refused for
   the same reason keeps its own sentence;
9b. **a booking follows the new values.** With `bookingHorizonDays` lowered (to 7, say), the
   week two weeks ahead offers `alice` no free slot, and the week of today still does; with
   `minBookingNoticeHours` raised (to 48, say), tomorrow's slots are gone for her; with
   `cancellationNoticeHours` raised, an appointment she could cancel says it is too late in
   its detail, after the screens are read again. Say which of these you checked and how;
10. a save that the server refuses or that cannot reach it (the request failed by the check,
    with `page.route`) is said in plain words, the typed values stay also after the read that
    follows, and "Save" works again;
11. values typed and not saved, then "Week" and back: the saved values are shown;
12. week, settings, week, settings, by the links and by the browser's back button: nothing is
    doubled, the week is where it was left, and nothing of one screen shows in the other.

As `alice`:

13. the navigation has "Week" and "My appointments", not "Settings"; `#/settings` typed by
    hand shows the week and the address is put right; no `PUT` can be made from the page.

Both:

14. sign out on "Settings" with values typed and a refusal on show, sign in as `alice`: no
    value, no refusal and no name of the first person in what the page shows or in its fields;
15. at the phone width the form fits the screen, the refusals wrap, and nothing makes the page
    wider;
16. by keyboard only: reach "Settings", change a value, check and uncheck "No limit", save
    with the Enter key, and hear the outcome (the sentence is in an element with a role);
17. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; no request to another origin.

At the end the check writes the settings back as it found them, cancels what it booked and
deletes any throw-away user. Say what stays in the local table as history, and the settings'
`updatedAt` and `updatedBy`, which the write-back changes.

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local settings and the local `calendar` table:** the browser check changes the
  settings, and other things read them. Never run the back end's integration journeys in this
  step (they empty the table), nor the front end's while the browser check is under way (they
  set the settings for their own run and write back what they read: run in the middle of the
  check, they would put the check's values back as if they were mine). If a run of the check
  is cut short, the first thing to do is to write the settings back.
- **Hard rules:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no rule and
    no range in a view: whether a value is accepted, and the words of a refusal, are decided in
    the logic layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except the checkbox and its field;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a username reaches the
    page through `textContent` only and is never logged; the service's `message` never reaches
    the page;
  - the existing tests keep passing unchanged, except where this brief says a case changes
    (`page.test.ts` on the screens and the templates, the shell's tests of the
    Administrator's navigation, the tests that read the two labels or the sentence of design
    point 10); if another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 65)

- The design points applied as written, and the four points settled before the start applied
  as settled (any deviation reported with its reason).
- The two wordings of design point 10 in place, and the history's default period untouched.
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with steps 60 to 64 in short, and the settings back as
  they were found.
- The report says how long each view file is (lines, and how many of them look nodes up), how
  long `index.html` became, what a field in fault is in the markup and in the view (the
  pattern steps 66 to 68 will copy), and whether any condition for the fallback
  (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came close.
- The table of the sentences, new and changed: I review the words.
- Which existing test cases changed, and what changed in each.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 64's (528 kB, 115 kB).
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 66.
