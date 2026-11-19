## Brief

Implement plan step 64, "My appointments" (`docs/FRONTEND_VIEW_PLAN.md`), following CLAUDE.md's
working rhythm: one step, its acceptance check, an honest report, then stop for review.

One stop at the end. Three choices about the screen were made with the Product Owner while this
brief was written: what "Change" does from the list (design point 5), how the period of the
history is chosen (design point 3) and where the list's times take their zone from (design
point 2). There is no early stop.

This step gives a User a second screen: the list of their upcoming appointments and their
history. A row opens the appointment detail of steps 62 and 63, which from now on is used from
two screens: what the two share moves out of the week view. It is the first step with two
addresses, so the navigation, leaving a view and coming back to it are checked here. It changes
nothing in `backend/`, `shared/` or `frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the view layer and the logic layer as built), the
    commands `dev`, `build` and `seed:local`, and the test conventions for the logic layer, the
    views and the shell;
  - the notes on the local `calendar` table: who empties it and when.
- `docs/FRONTEND_ARCHITECTURE.md` v5, all of it. It is the source of truth for this step: the
  thirteen rules of a view (section 3; rules 1, 4, 7, 9 and 10 above all), the shape of a view
  and of a dialog (section 4, with what step 63 added), the logic layer and what was built
  (sections 5 and 5.1: the detail's three actions, the moving state and what ends it), the
  shell, the table of screens and what a session owns (section 6), the fallback and its three
  conditions (section 7), the tests (section 8), decisions 22, 23, 28, 30 and 41 to 52.
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 64, and step 65 to see what this step
  must leave ready (the next screen is the Administrator's first, with the settings).
- `docs/SHARED_CALENDAR_SPEC.md`: section 8.1 (the appointment's fields and its lifecycle:
  "ended" is not a stored status), 8.6 (R-VIEW-01: a User's history), 11.1, route 16, with
  section 11.2 (`from`, `to`, `upcoming`, `status`: one selection per query, at most 92 days),
  11.5 (`Appointment`, `cancelReason`, `cancellableUntil`), 16.8 (what "my appointments" needs).
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules), section 19 (`AppointmentsService`; 19.1,
  19.4 and 19.6 above all: `list`, what is checked before sending, `status=booked` added when
  left out), section 15 (`CalendarSettingsService`: the read, its codes), and section 8,
  decisions 40 and 42.

Then read the code this step builds on:
- `frontend/src/logic/`: all six files, `week.screen.ts` and `appointment.detail.ts` above all,
  and their tests in `frontend/tests/unit/logic/` (`zone.ts` and `fixtures.ts` first).
- `frontend/src/views/`: `week.view.ts` (the detail dialog: its look-ups, its local state, its
  handlers, its two streams, its part of the teardown), `shell.ts` (`SCREENS`, `sessionObjects`,
  how a screen is shown and left), and their tests in `frontend/tests/unit/views/` (`page.ts`
  first; in `shell.test.ts` the block "with a second screen", which stands in for a second
  screen that did not exist yet).
- `frontend/index.html` (the frame, the element `#week`, its two dialogs and its templates) and
  `frontend/style.css`.
- `frontend/src/services/`: `appointments.service.ts` and `appointments.types.ts` (`list`,
  `appointmentsResult$`, `appointmentsState$`, `AppointmentsQueryInput`),
  `calendar-settings.service.ts` and its types (the read only).
- `shared/src/calendar/`: `schemas.ts` (`AppointmentsQuery`), `defaults.ts` (`CALENDAR_LIMITS`),
  `time.ts` (`localDateOf`, `addDays`), `types.ts` (`Appointment`, `CalendarSettings`).

## Where we are (2026-11-19)

- Step 63 is committed and pushed (`b64f154`): the note edited in the detail, "Change" with the
  banner and the confirmation, the week loaded again after a note and a change. Check
  `git status -sb` rather than trusting this line.
- What step 63 left for this step:
  - the detail dialog is inside `#week` and wired in `week.view.ts` (390 lines, six streams;
    about 55 lines look nodes up, 29 of them for the dialogs and the banner);
  - `appointmentDetail(…)` is pure and takes an `Appointment`, so a second screen can use it
    as it is; `WeekScreen.detail(appointmentId)` looks in the week on screen only;
  - `WeekScreen.move(appointmentId)` starts a move only for an appointment of the week on
    screen and only while the screen is started, and the move ends when the subscription of
    `start()` ends (`docs/FRONTEND_ARCHITECTURE.md` section 11, decision 45);
  - the detail's one sentence was written for an appointment found in the week, which is
    always booked. For a User it says "It is too late to change or cancel this appointment."
    also when the appointment is cancelled or has ended: the history shows those, and the
    sentence is then wrong (design point 6);
  - the shell's test brings a second entry of its own, shown on the week's element, because the
    real table had one screen.
- Two wordings were raised at step 63's review and are not decided: the Administrator's two
  lists of times are labelled "From" and "To" just under the lines "From:" and "To:" of the
  confirmation, and `appointment_limit_reached` after a change ends with "Cancel one to book
  another." Do not change either in this step unless I say so before you start.
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina", 8 patterns
  valid 2026-11-19 to 2027-01-18, five booked appointments of `alice`, default settings, and
  the history of the checks of steps 62 and 63: about 36 cancelled appointments, most of them
  `alice`'s, 6 of them with the reason `changed`, and two deleted throw-away users. I also used
  the page by hand after step 63. Look before relying on it (read-only, through the API) and
  say in the report what was there. That history is what this step's list shows: do not
  clean it.
- The Codespace has no browser. Step 63's check ran in Playwright's headless Chromium, installed
  outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
  Lessons from that check: read what a person can see and the values of the form fields, not
  the page's source; the headless browser has no tab to hide, so the check sends
  `visibilitychange` itself and the real tab switch is handed to me; the browser reports every
  4xx answer as a console line "Failed to load resource", which is not an error of the page.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new logic goes** (`frontend/src/logic/`, each file with its test in
   `frontend/tests/unit/logic/`):
   - a pure file for the list ready to draw: an array of `Appointment` in, rows out, each with
     its date, its time, its type, its note and its status in words (point 4), in the zone
     given;
   - a class for the screen, shaped like `WeekScreen`: one public stream, `void` methods,
     nothing started by the constructor, "now" passed in. It holds the mode (upcoming or
     history), the period of the history, the loads and the reloads, and answers the detail of
     one of its appointments with `appointmentDetail(…)`;
   - `appointment.detail.ts` grows: the sentences of point 6;
   - `week.screen.ts` grows: the hand-over of point 5;
   - `texts.ts` grows only if a code of the list or of the settings has no sentence yet.
2. **The time zone comes from the settings.** The answer of `GET /calendar/appointments` does
   not name the calendar's zone, and the list can be the first screen a User lands on. The list
   screen reads `GET /calendar/settings` through the `CalendarSettingsService` once at each
   `start()`, before the first list, and uses its `timeZone` for every date and time of the
   list, for the detail it answers, and for "today" (the default period of point 3).
   - While the zone is not known nothing is listed: the screen says it is loading.
   - A failed read is shown in plain words in the place of the list, and choosing a mode again
     tries again.
   - The read is for the zone only: the screen shows no setting and changes none. This is the
     first request of the application for the settings, and it is the list's only: the week
     screen keeps opening without one (`docs/FRONTEND_ARCHITECTURE.md` section 11, decision 23).
   - `sessionObjects` creates the service. Nothing here uses `DEFAULT_TIME_ZONE`.
3. **Two modes, one list.**
   - **Upcoming** (the mode the screen opens in): `list({ upcoming: 'true' })`, which the
     service sends with `status=booked`.
   - **History**: `list({ from, to, status: 'all' })`. The period is chosen in a fixed form
     outside the redrawn list (`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 4): two native
     date fields, "From" and "To", and "Show". It opens on the 30 days that end today, today in
     the calendar's zone, and that period is loaded at once when the mode is chosen. A period
     may hold future dates.
   - **The period's own checks are in the logic layer**, before any call, with the limit of
     `shared/` (`CALENDAR_LIMITS.appointmentListDays`), never the number written a second time:
     a date missing, the first date after the last, a period longer than the limit. Each has
     its sentence (point 6), shown beside the form; no request is sent, and the list on screen
     stays. Everything else is the service's and the server's to say.
   - The two modes share the service's one pair of streams: a change of mode or of period while
     a load is under way replaces it. The mode and the period are the screen's state: left and
     found again within a session, the screen is on the mode and the period it was left on,
     and loads them again.
   - Which mode is on show is said by the two buttons themselves (`aria-pressed`), set from the
     stream.
4. **A row.** The list is rebuilt at every notification that brings another list, from a
   `<template>`, with no input field inside it. A row is one `<button type="button">` holding
   the date, the time, the type, the note and the status; a click opens the detail.
   - The order is the server's: by start.
   - The status in words: "Booked"; "Ended" for a booked appointment whose end is not after
     "now" (`docs/SHARED_CALENDAR_SPEC.md` section 8.1: derived from the clock, not stored);
     "Cancelled"; "Changed" for one cancelled with the reason `changed`; "Cancelled" also for
     the reason `user_deleted`, which a User cannot meet in their own list.
   - An empty list says so, with one sentence per mode (point 6).
   - A long history is not paged: at most 92 days are listed, and the page scrolls.
5. **The detail is one dialog, used from two screens.**
   - Its markup moves out of `#week` to a place of the frame that belongs to no screen, and its
     wiring out of `week.view.ts` into a file of its own in `frontend/src/views/`. Each screen's
     view mounts it for as long as the screen is on show, hands it what it needs as `Pick<…>`
     and a function (the detail of an appointment by its id, the two services' parts, what
     "Change" does), and ends it with its own subscription. Only one screen is on show at a
     time, so the dialog is mounted once at a time. Say in the report what the mount function
     returns besides the subscription, since something must open the dialog.
   - **Nothing that steps 62 and 63 checked changes** for the week: the same texts, the same
     ties between a result and the dialog that asked for it, the same teardown. The week
     view's tests of the detail keep passing; they may move to the new file's test, unchanged
     in what they assert.
   - The book dialog, with its second mode, stays the week's: only the week books and confirms.
   - **In the list the detail does the same three things.** The note and "Cancel appointment"
     call the service as in the week. After every result of a cancellation or of a note saved,
     success or failure, the list screen loads its list again, with the same care for a result
     that was already there at `start()`; and at every notification of the stream of the page
     becoming visible, which the shell hands it as it hands it to the `WeekScreen`.
   - **"Change" from the list goes to the week.** It closes the dialog, hands the appointment
     over to the `WeekScreen` and changes the address to `#/week`. The week screen, at its next
     `start()`, opens on the week of that appointment and is moving it: the banner names it,
     from the same copy in words as a move started in the week (`movingOf`), made by the list
     screen in the zone it knows. From there everything is step 63's: any week, a free slot,
     the confirmation, "Keep the appointment as it is".
   - **Step 63's rule stays: leaving the week ends the move.** The hand-over is the one thing
     that crosses from a screen to another, and it is taken once: a User who goes back to the
     list while the banner shows finds the list with no move under way, and the week, shown
     again, moves nothing. A hand-over that is never taken (the address did not change, the
     person signed out) is dropped with the session's objects.
   - The view does not know the week's address: the shell hands the list's view a function
     that shows the week, as it hands every view its dependencies.
   - After a change made this way the person is in the week, where the new appointment is.
     Nothing brings them back to the list.
6. **The sentences.**
   - The detail's one sentence, for both roles and both screens, by what the appointment is:
     cancelled with the reason `changed`: "This appointment was moved to another time.";
     cancelled otherwise: "This appointment was cancelled."; booked and ended: "This appointment
     has ended." (for a User too, in the place of "It is too late to change or cancel this
     appointment.", which stays for a booked appointment that has not ended); the others as
     they are.
   - The list: "You have no upcoming appointments."; "There are no appointments in this
     period."; "Choose both dates."; "The first date is after the last one."; "A period can be
     at most 92 days long. Choose a shorter one.", with the number taken from `shared/`.
   - Give the full table in the report, new and changed: I review the words.
7. **The shell.** A second entry of `SCREENS`: `#/appointments`, "My appointments", the role
   `user` only, after the week. `sessionObjects` gains the list screen and the
   `CalendarSettingsService`. The code that reads the address, fills the navigation and
   switches between screens should not need to change, apart from handing a view the function
   of point 5; if more must change, say what and why. The shell's tests that brought a second
   entry of their own may use the real one where that says the same thing; keep the fake entry
   where a spy is what the test needs.
8. **Watch the fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7) for both views: if a
   helper that builds or updates nodes is about to be written, or the look-ups outgrow the rest
   of a view, stop and say so before writing a workaround. A dialog mounted from two views is
   sharing a view's part, not a rendering helper; if sharing it needs more than a mount
   function and its dependencies, stop and say so.
9. **Tests.**
   - The logic: every function and every path, with fake services and a fixed "now", under
     `useFarBrowserZone()`. Most of the step's cases are here.
   - The views: the real `index.html`, fake logic objects and services; `close()` stands for
     the Escape key. The list's view, the detail's own test, and the week's test with what
     stays the week's.
   - The shell: real services behind the stubbed `fetch`.
   - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.

## The step

Only what `docs/FRONTEND_VIEW_PLAN.md` step 64 lists.

- **Logic**, with tests that include:
  - the list ready to draw: each status in words, with an appointment that ends exactly at
    "now" and one millisecond later; with and without a note; the date and the time in a
    calendar zone that is not the browser's, in winter and in summer and in a half-hour zone;
    an appointment on the night the clocks go back, with its offsets; the server's order kept;
    an empty list;
  - the list screen: nothing loaded before `start()`; the settings read first and the list
    only after the zone is known; a failed read of the settings, and the next try; upcoming at
    the start; the change to history with its default period, for a "now" that is another day
    in the browser's zone and in UTC; "Show" with another period; each of the period's three
    refusals, with no call and the list kept; a change of mode while a load is under way; a
    failed list, which keeps the last list and carries the failure in plain words; the reload
    at a cancellation's and a note's success and failure and at a notification of the page
    becoming visible, and none for a result that was already there at `start()`; nothing
    loaded after the subscription ends; started again, the mode and the period it was left on;
    the detail of an appointment of the list, for a booked, an ended, a cancelled and a changed
    one, and `null` for one the list does not hold;
  - `appointmentDetail`: the sentences of point 6 for both roles, and every other case
    unchanged;
  - `WeekScreen`: a hand-over taken at the next `start()` (the week of the appointment loaded,
    not the week of today or the week it was left on; the banner's words those handed over);
    taken once only; one made while the screen is started; the move it starts ended by all
    that ends a move, the end of the subscription included; everything of step 63 unchanged.
- **Markup and styles:** the element of the list with its two modes, the period's form, the
  failure, the empty sentence, the list and its `<template>`; the detail dialog in its new
  place; their styles in `frontend/style.css`. A phone and a desktop are served by the same
  markup. No inline script, style or handler (`page.test.ts` keeps passing, with its
  assertions on where the dialogs are brought in line).
- **The views:** the list's view and its DOM test: every state of the stream; each action and
  its call (the two modes, "Show" with its two dates, a row); the period's refusals shown
  beside the form; a note, a type and a date containing `<script>` shown as text; the list
  rebuilt only when it is another list; nothing left in the page after unsubscribing, the two
  date fields emptied. The detail's own file and test: all that the week's test checked of it,
  mounted for the week and for the list, and "Change" calling what it was handed. The week's
  view and test with what stays.
- **The shell:** the two addresses for a User; the navigation's two links and the one marked;
  `#/appointments` typed by the Administrator shows the week and the address is put right; the
  list asks the settings, then the list, with the person's token; a cancellation from the list
  loads the list again; "Change" from the list shows the week of the appointment with the
  banner, and going back to the list ends the move; week, list, week, list: nothing left over
  or doubled, each screen where it was left; signing out on the list, and with the detail open
  on it, leaves nothing, and the next person sees nothing of the first.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v6: section 4 (a dialog used from two views, the list's
    shape), section 5.1 (the new files, the list screen, the zone from the settings and what
    it means for decision 23, the period's checks, the hand-over and what still ends a move,
    the sentences), section 6 (the second entry, what a session owns, what the shell hands a
    view), section 8 if something new was learnt about `happy-dom` (the native date field is
    the likely place), section 9, the decisions table, the status line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 64 done, with its date), and step 64's
    text brought in line with the design points, with a change log line.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7, for the files added.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions if something new was
    learnt, "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- a list for the Administrator, or any filter by User; the Administrator's screens start at
  step 65;
- a setting shown or changed (step 65); any use of the settings but the zone;
- booking from the list; any other way to start a change than "Change" in the detail;
- following `replaces` and `replacedBy`: a changed appointment is a row with its status, and
  its replacement is another row or is in the week;
- paging, sorting or searching the list; a history longer than 92 days in one view;
- the two wordings left open at step 63's review, unless I say so;
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- the size of the bundle, hosting, CORS, logout as a service, the session in `sessionStorage`;
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width.
If the local calendar is empty, run `npm run seed:local -w frontend` first; the history then
has nothing cancelled or changed, and the check makes both before it looks at them. The first
call of each route takes a few seconds under `sam local`: wait for it, do not count it as a
failure.

Steps 60 to 63 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; next and
   "Today" work; an unknown hash shows the week;
2. she books a free slot with a note, sees it as "You", edits its note in the detail, moves it
   to another slot with "Change", and cancels it.

Step 64, as `alice`:

3. the navigation has "Week" and "My appointments"; the second shows her upcoming appointments,
   by start, each with its date, time, type, note and "Booked", in the calendar's zone; the
   address is `#/appointments` and its link is the one marked;
4. the requests of the screen are the settings, then the list, and no other;
5. "History" shows the last 30 days at once: the appointments the earlier checks cancelled and
   changed are there with "Cancelled" and "Changed", one that has ended with "Ended";
6. another period chosen with the two dates and "Show" lists that period; a period of 93 days,
   the dates swapped and a date emptied are each refused in plain words with no request, and
   the list stays;
7. a period with nothing in it says so; so does "Upcoming" for a User with no appointment (a
   throw-away user created by the check, signed in for this line);
8. a row opens the detail: for an upcoming one the note's field, "Change" and "Cancel
   appointment" as the rules allow; for a cancelled one, a changed one and an ended one the
   right sentence, the note as text and no button but "Close";
9. a note edited from the list is saved, and the list follows; a note containing `<b>` is
   shown as text in the row;
10. "Cancel appointment" from the list: the dialog closes and the row leaves "Upcoming"; in
    "History" it is there as "Cancelled";
11. "Change" from the list: the address becomes `#/week`, the week shown is the appointment's
    (one in a later week, not the week of today), the banner names it; a free slot, the
    confirmation, "Change": the new appointment is in the week, and "My appointments" then
    shows it and, in "History", the old one as "Changed";
12. "Change" from the list, then back to "My appointments" while the banner shows: the list is
    as usual, and the week, shown again, has no banner and its appointments can be clicked;
13. week, list, week, list, by the links and by the browser's back button: each screen is where
    it was left (the week it was on, the mode and the period of the list), nothing is doubled,
    and nothing of one screen shows in the other;
14. with "History" on show, the tab hidden and shown again loads the same period again;
15. an appointment too late to change (one less than `cancellationNoticeHours` ahead, booked
    for her by the check as the Administrator): its detail from the list says so, offers
    neither "Change" nor "Cancel appointment", and still lets her edit the note.

As `admin`:

16. the navigation has "Week" only; `#/appointments` typed by hand shows the week and the
    address is put right; the detail opened in the week does all that step 63 checked: the
    note, "Change" with the banner and the confirmation, "Cancel appointment".

Both:

17. the Escape key closes the detail on both screens and the focus returns to what opened it;
18. sign out on "My appointments" with the detail open, sign in as the other role: no row, no
    note, no date field's value and no dialog of the first person in what the page shows or in
    its fields; signing in again as `alice` opens the list in "Upcoming";
19. at the phone width the list, the period's form and the detail fit the screen, a long
    history scrolls, and nothing makes the page wider;
20. by keyboard only: reach "My appointments", choose "History", set a date, "Show", open a
    row, close it;
21. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; no request to another origin.

At the end the check cancels what it booked and deletes its throw-away user; it changes no
setting. Say what stays in the local table as history.

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local `calendar` table:** the browser check writes to it. Never run the back end's
  integration journeys in this step (they empty the table), nor the front end's while the
  browser check is under way (they set the settings for their own run). Remove what the check
  created where the API allows it, and list what stays.
- **Hard rules:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no date
    arithmetic and no rule in a view: the default period, the period's checks, the status in
    words and which actions the detail offers are decided in the logic layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except opening and closing a dialog and the change of address of design point 5;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a note and a username
    reach the page through `textContent` or a field's `value` only and are never logged;
  - the existing tests keep passing unchanged, except where this brief says a case changes
    (the detail's sentence for an ended or a cancelled appointment, the tests of the detail
    moving to its own file, `page.test.ts` on where the dialogs are, the shell's tests of a
    second screen); if another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 64)

- The design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with steps 60 to 63 in short.
- The report says how long each view file became (lines, and how many of them look nodes up),
  how long `index.html` became, what moved out of `week.view.ts` and what the detail's mount
  function takes and returns, and whether any condition for the fallback
  (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came close.
- The table of the sentences, new and changed.
- Which existing test cases changed or moved, and what changed in each.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 63's (520 kB, 114 kB).
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 65.
