## Brief

Implement plan step 62, "Booking and cancelling" (`docs/FRONTEND_VIEW_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review. One stop at the end. The design points are already decided (see "Design points"): there
is no early stop for them.

This step makes the week do something: a free slot opens the book dialog, an appointment opens
its detail, and the detail can cancel it. Both roles; the Administrator also chooses the User
and may give a custom start and end. After every booking or cancellation, whatever its outcome,
the week is loaded again; it is also loaded again every time the browser's tab becomes visible.
It changes nothing in `backend/`, `shared/` or
`frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the view layer and the logic layer as built), the
    commands `dev`, `build` and `seed:local`, and the test conventions for the logic layer, the
    views and the shell;
  - the notes on the local `calendar` table: who empties it and when.
- `docs/FRONTEND_ARCHITECTURE.md` v3, all of it. It is the source of truth for this step: the
  layers (section 2), the thirteen rules of a view (section 3; rules 4, 9, 10 and 12 above all),
  the shape of a view (section 4), the logic layer and what was built (sections 5 and 5.1), the
  shell and its table of screens (section 6), the fallback and its three conditions (section 7),
  the tests and what `happy-dom` does not emulate of the native `<dialog>` (section 8).
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 62, and steps 63 and 64 to see what this
  step must leave ready (the note and the change join the detail in step 63; step 64 uses the
  detail from a second screen and moves what the two share out of the week view).
- `docs/SHARED_CALENDAR_SPEC.md`: section 8.1 (an appointment's data), 8.2 (booking: the rules
  per role and the order of the checks), 8.3 (cancelling, `cancellableUntil`), 11.3 (the error
  codes), 11.4 (the bodies, the form of an instant, how a note's length is counted), 11.5 (the
  `Appointment`), 16.3 (what the view does after a write), 16.8 (what the dialogs need), and
  R-SLOT-03 to R-SLOT-05, R-TIME-03.
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules), section 19 (`AppointmentsService`; 19.1,
  19.4 and 19.6 above all), section 13 (`UsersService`: `listUsers` only), section 18.6, and
  section 8, decisions 6, 38 and 42.

Then read the code this step builds on:
- `frontend/src/logic/`: `texts.ts`, `week.model.ts`, `week.screen.ts`, and their tests in
  `frontend/tests/unit/logic/` (`zone.ts` and `fixtures.ts` first).
- `frontend/src/views/`: `week.view.ts`, `shell.ts` (`sessionObjects`, `SCREENS`),
  `login.view.ts`, and their tests in `frontend/tests/unit/views/` (`page.ts` first).
- `frontend/index.html` (the element `#week` and its templates) and `frontend/style.css`.
- `frontend/src/services/`: `appointments.service.ts` and `appointments.types.ts`,
  `users.service.ts` and `users.types.ts` (`listUsers`), `calendar.service.ts` (`reload`).
- `shared/src/calendar/`: `schemas.ts` (`BookBody`, `Note`, `Instant`), `rules.ts`
  (`isOnQuarterGrid`, `isWholeLocalHour`, `cancellableUntil`), `time.ts` (`toInstant`),
  `defaults.ts` (`CALENDAR_LIMITS.noteLength`).
- `prototypes/` (throw-away): the two dialogs in `view-plain/index.html` and
  `view-plain/calendar.view.ts`, `bookingFor` and the cancel hints in `common/logic.ts`, the
  dialog styles in `common/style.css`. Take what is right; do not import from it, and do not
  copy what the documents or this brief say differently.

## Where we are (2026-11-19)

- Step 61 is committed and pushed (`8facda0`): the logic layer, the week read-only, the
  navigation by the hash, the local seed. Check `git status -sb` rather than trusting this line.
- What step 61 left for this step:
  - a slot and an appointment are plain `<div>` elements; `SlotBlock` carries no instant and
    `AppointmentBlock` no id: the model gains what the dialogs need;
  - `WeekScreen(calendar, role, now)` does not reload after a write, and `sessionObjects` in
    `shell.ts` creates the `CalendarService` and the `WeekScreen` only;
  - `failureText` knows the transport reasons, the codes of `GET /calendar` and the login's
    reasons: a booking's and a cancellation's codes fall back to the general sentence;
  - known limit of the week model (`docs/FRONTEND_ARCHITECTURE.md` section 5.1): on the night
    the clocks go back, blocks of different kinds in the same place are not moved apart. Not
    this step's task; do not make it worse.
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina", 8 patterns
  valid 2026-11-19 to 2027-01-18, five appointments of `alice`, default settings. Look before
  relying on it (read-only, through the API) and say in the report what was there.
- The Codespace has no browser. Step 61's check ran in Playwright's headless Chromium, installed
  outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
- The bundle is 504 kB, 110 kB compressed (`docs/FRONTEND_ARCHITECTURE.md` section 10, open
  point O9). Known, not this step's task.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is still to do and is independent
  of this step. Do not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new logic goes** (`frontend/src/logic/`, each file with its test in
   `frontend/tests/unit/logic/`):
   - `week.model.ts` grows: a slot block carries its `start` and `end` instants, its day's label
     and its type's name; an appointment block carries its `appointmentId`. Nothing else of the
     model changes, and its existing tests keep passing with additions only;
   - `booking.ts`, new, pure: from what the book dialog holds to the argument of
     `AppointmentsService.book`, and the times the Administrator may choose (point 5);
   - `appointment.detail.ts`, new, pure: `appointmentDetail(appointment, role, now, zone)`, an
     `Appointment` in, what the detail dialog shows out: the texts, whether "Cancel
     appointment" is offered, and the sentence that says until when or why not (point 7);
   - `texts.ts` grows: a date with a time ("Mon 23 Nov, 10:00"), and the sentences of the new
     reasons (point 9);
   - `week.screen.ts` grows (points 2 and 7).
2. **The reload is the week screen's.** `WeekScreen` receives the `AppointmentsService` (the
   part it uses, as a type) as a constructor argument. `start()` also subscribes to
   `bookResult$` and `cancelResult$` and calls `calendar.reload()` at every result, success or
   failure, whatever the reason (`docs/SHARED_CALENDAR_SPEC.md` section 16.3: after a failed
   write the server may still have applied it). The results replay their last value: a
   `start()` after the screen was left must not reload for a result that came before it.

   **The week is also loaded again every time the tab becomes visible**
   (`docs/FRONTEND_VIEW_PLAN.md` v3, step 62 and section 8, decision 11), so that what other
   people booked or cancelled in the meantime is shown. The logic layer has no DOM, so
   `WeekScreen` receives a stream through its constructor, `visible$: Observable<unknown>`,
   as it receives "now"; `start()` subscribes to it and calls `calendar.reload()` at each
   notification. The shell builds the stream from the document's `visibilitychange` event,
   keeping the notifications at which `document.visibilityState` is `visible`. It reloads the
   week on screen, whichever it is, and nothing while the week screen is not started. No timer,
   and nothing in the back end. A reload that finds a dialog open leaves it as it is (point 8).
3. **Slots and appointments become buttons** (`<button type="button">` in their templates),
   reachable by keyboard, each with a name a screen reader can say (the time, and "free" or the
   person). A busy block stays a plain element. A click only opens a dialog.
4. **The book dialog**, a native `<dialog>` inside `#week`, opened with `showModal()`:
   - what is being booked, in words: the day, the time, the type ("Mon 23 Nov, 10:00–11:00 ·
     Studio"), in the calendar's time zone;
   - a note, a `<textarea>` with `maxlength` from `CALENDAR_LIMITS.noteLength` written in the
     markup as a number; the check that counts is the service's;
   - "Book" and "Close". "Book" calls `appointments.book(…)` and nothing else: the button is
     disabled because `bookState$` says `pending`, the dialog closes because it says `success`,
     a failure is shown in the dialog in plain words (`role="alert"`) and the dialog stays open
     with what was typed;
   - what the open dialog is about (the slot) is a local variable of the mount function
     (`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 10);
   - **opened a second time it shows nothing of the first**: the form is reset and the failure
     emptied at every opening. `bookState$` keeps its last value, so the view shows a failure
     only when it arrives while the dialog is open for the booking it belongs to.
5. **The Administrator's book dialog** has two more parts, hidden for a User:
   - **the User to book for**: a `<select>` filled from `UsersService.listUsers()`, which the
     view calls each time the dialog opens (a user created meanwhile is there). While the list
     loads "Book" is disabled; a failed list is said in plain words in the dialog; an empty
     list says that there is no User to book for. The options are rebuilt when a list arrives,
     which is the one place a redrawn region holds a form control: accepted, because it happens
     at opening, before anything can be chosen. If this proves wrong (the choice lost while the
     person is choosing), stop and say so;
   - **a custom start and end**: two `<select>` elements of local times on the 15-minute grid,
     from the start to the end of the window that holds the slot, pre-set to the slot's own
     start and end. `booking.ts` gives the options and turns the two chosen times into instants
     with `toInstant` and the calendar's zone; left as they are, the slot's own instants are
     sent. An end not after the start is refused in the dialog before any call, by the shared
     schema through the service (`invalid_request`), in plain words.
   A User's booking sends `start` and the note only: no `end`, no `username`
   (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-01, R-BOOK-02).
6. **The night the clocks go back, in the dialogs.** The slot's own instants name its hour
   without ambiguity, so booking either of the two 02:00 slots works, and the dialog shows the
   offset as the week does. A custom time chosen by the Administrator in the repeated hour is
   the earlier occurrence (`docs/SHARED_CALENDAR_SPEC.md` R-TIME-03): a known limit, to write in
   `docs/FRONTEND_ARCHITECTURE.md`, not to solve.
7. **The appointment detail**, a second native `<dialog>` inside `#week`:
   - the fields (`docs/SHARED_CALENDAR_SPEC.md` section 11.5): when (day and time), the type,
     for whom (the name for the Administrator, "You" for a User), the note ("—" when there is
     none), and who booked it and when ("Booked by admin on Thu 19 Nov, 13:24");
   - **"Cancel appointment"** is offered to the Administrator while the appointment has not
     ended, and to a User while "now" is not after `cancellableUntil`. "Now" is the `now()` the
     shell passes, read when the dialog opens, not the view's `generatedAt`;
   - under it one sentence: for a User "It can be cancelled until Sun 22 Nov, 10:00." or "It is
     too late to cancel this appointment."; for the Administrator nothing while it can be
     cancelled, and "This appointment has ended." when it cannot;
   - **no second question**: one click on "Cancel appointment" cancels. The button is disabled
     while `cancelState$` is `pending` for this appointment, the dialog closes on `success`, a
     failure is shown in the dialog in plain words;
   - the detail is found from the last loaded view by the appointment's id: `WeekScreen` gains
     `detail(appointmentId)`, which returns it ready to show, or `null` when the week on screen
     no longer holds it;
   - the note is shown, not edited, and there is no "Change": both are step 63's. Leave the
     dialog's markup so that they can be added without moving what is there.
8. **Dialogs and the redrawn week.** The dialogs are outside the region the view redraws. A
   reload that arrives while a dialog is open redraws the days behind it and leaves the dialog
   as it is. The `close` event of a dialog (the Escape key, "Close") only clears the view's
   local variable. Leaving the view closes both dialogs, resets the form, empties the list of
   users and every text (`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 9).
9. **The new sentences** in `failureText`, for every code `book`, `cancel` and `listUsers` can
   answer (`docs/FRONTEND_SERVICES.md` sections 19.1 and 13): `slot_taken`, `booking_in_past`,
   `booking_notice_too_short`, `booking_beyond_horizon`, `outside_availability`,
   `appointment_limit_reached`, `user_not_found`, `target_not_user`, `concurrent_update`,
   `appointment_not_found`, `appointment_not_active`, `cancellation_notice_too_short`,
   `invalid_json`. `slot_taken` says that the calendar has been refreshed, which point 2 makes
   true. `invalid_request` keeps one sentence for every case. Give the full table in the
   report: I review the words.
10. **Everything stays in `week.view.ts` in this step**, as the plan has it: step 64 moves what
    two screens share. `WeekDeps` gains what the view uses of the `WeekScreen`, of the
    `AppointmentsService` and of the `UsersService`, each as a `Pick<…>`. The view then listens
    to four streams. **Watch the fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7): if the
    code that looks nodes up for the second, third and fourth stream becomes longer than the
    rest of the view, or a helper that builds or updates nodes is about to be written, stop and
    say so before writing a workaround.
11. **The shell**: `sessionObjects` also creates the `AppointmentsService` and the
    `UsersService` for every session, for both roles (a User's view never calls `listUsers`).
    The table of screens does not change: no new address.
12. **Tests.**
    - The logic: every function and every path, with fake services and a fixed "now", under
      `useFarBrowserZone()`. Most of the step's cases are here.
    - The view: the real `index.html`, fake `WeekScreen`, `AppointmentsService` and
      `UsersService`; `close()` stands for the Escape key.
    - The shell: a booking's result reloads the week (real services, stubbed `fetch`), and
      signing out with a dialog open leaves nothing.
    - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.

## The step

Only what `docs/FRONTEND_VIEW_PLAN.md` step 62 lists.

- **Logic**, with tests that include:
  - `booking.ts`: a User's body (start only; a note trimmed; a blank note left out); the
    Administrator's (the username; the slot's own instants when the times were not touched; a
    custom start and end in `Europe/Rome` in winter and in summer and in a half-hour zone; the
    options from a window 08:30–12:00, and from one ending at 24:00; an end not after the
    start); the two slots of 2027-10-31 booked by their own instants;
  - `appointment.detail.ts`: both roles; a User at exactly `cancellableUntil` (still offered)
    and one millisecond later; the Administrator on an appointment in progress and on one that
    has ended; an appointment without a note; one booked by the Administrator for a User; the
    texts in a calendar zone that is not the browser's;
  - `WeekScreen`: a reload at a booking's success and at its failure, at a cancellation's
    success and failure; none before `start()`, none after its subscription ends, none for a
    result that was already there at `start()`; a reload at each notification of `visible$`,
    of the week on screen and not of the week of today, and none before `start()` or after its
    subscription ends; `detail(id)` for an appointment of the week, for
    an unknown id, and after the week changed;
  - `failureText`: every new reason has a sentence of its own.
- **Markup and styles:** the two dialogs and the changed templates in `frontend/index.html`;
  the dialogs and the buttons' focus in `frontend/style.css`. No inline script, style or handler
  (`page.test.ts` keeps passing; adjust its case on the week's templates, which says that
  nothing in them can be clicked, and say exactly what changed).
- **The view:** `week.view.ts` and its DOM test: every state of every stream it listens to; a
  click on a slot and on an appointment; "Book" and its call's argument for a User and for the
  Administrator; "Cancel appointment" and its call; the hidden parts for a User; the list of
  users loading, loaded, empty and failed; a note and a username containing `<script>` shown as
  text in both dialogs; a dialog opened a second time shows nothing of the first, after a
  success and after a failure; a failure that was already in the stream is not shown at
  opening; a reload while a dialog is open; after unsubscribing nothing is left in the page and
  both dialogs are closed.
- **The shell:** the two services per session and the stream of the tab becoming visible, and
  its test: the page hidden and shown again loads the week once more; hidden alone loads
  nothing; nothing is loaded at the login or after signing out.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v4: section 4 (a dialog's shape: what is local to the view,
    how a failure is tied to the dialog that is open), section 5.1 (the new files, the reload,
    "now" for the detail, the reload when the tab becomes visible and why nothing is pushed,
    the limit of point 6), section 6 (the session's objects, the stream the shell builds from
    `visibilitychange`), section 8
    if the dialogs taught something about `happy-dom`, section 9, the decisions table, the
    status line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 62 done, with its date), and a change
    log line only if the step changed the plan.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions if something new was
    learnt, "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- editing the note and changing an appointment (step 63); "my appointments" and a second
  address (step 64); any other screen;
- moving the dialogs out of `week.view.ts` (step 64);
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any request for the settings, and any change of a setting by the application (the browser
  check may change one through the API and puts it back);
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- the size of the bundle, hosting, CORS, logout as a service, the session in `sessionStorage`;
- deleting `prototypes/` (step 69);
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width.
If the local calendar is empty, run `npm run seed:local -w frontend` first. The first call of
each route takes a few seconds under `sam local`: wait for it, do not count it as a failure.

Steps 60 and 61 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; next and
   "Today" work; an unknown hash shows the week.

Step 62, as `alice`:

2. a click on a free slot opens the book dialog, which says the day, the time and the type; the
   User picker and the custom times are not there;
3. she books it with a note: the dialog closes, the week is loaded again and shows the
   appointment as "You";
4. a click on it opens the detail with its fields, the note, and until when it can be
   cancelled; "Cancel appointment" cancels it: the dialog closes and the slot is free again;
5. a note containing `<b>` is shown as text, in the week and in the detail;
6. a slot taken in the meantime (the check books it through the API for a throw-away user after
   the week was loaded): the refusal in plain words, the dialog still open, and the week behind
   it refreshed, with the slot gone;
7. a slot too late to book (the check raises `minBookingNoticeHours` through the API after the
   week was loaded, and puts the value back afterwards): the refusal in plain words;
8. an appointment too late to cancel (one less than `cancellationNoticeHours` ahead, booked for
   her by the check as the Administrator): the detail says so and offers no button;
9. the book dialog opened again after a refusal shows an empty note and no failure;
10. the Escape key closes each dialog, and the focus returns to the block that opened it; with
    a dialog open, a click on the week behind it does nothing.

As `admin`:

11. the book dialog lists the Users; a booking for `alice` shows her name in the week;
12. a custom start and end (for example 10:15–10:45 inside a slot): the appointment is drawn at
    its place, and as `alice` the rest of that hour is no longer offered;
13. the detail of anyone's appointment offers "Cancel appointment", also for one less than 24
    hours ahead; cancelling it frees the slot;
14. with the list of users failing (hold the call back and fail it): the sentence in the
    dialog, and "Book" disabled.

Both:

15. sign out with nothing open, sign in as the other role: no note, no name and no dialog of
    the first person in the document;
16. at the phone width both dialogs fit the screen, can be scrolled if they are taller, and
    nothing makes the page wider;
17. by keyboard only: Tab reaches a slot, Enter opens the dialog, the note can be typed, Enter
    on "Book" books;
18. with the week on screen, the check books a slot through the API, then hides the page and
    shows it again (another tab opened and closed, or the visibility emulated): the week is
    loaded again and the slot is no longer free; with a dialog open the same leaves the dialog
    as it is;
19. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; no request to another origin.

At the end the check cancels what it booked, deletes its throw-away user and writes the settings
back to the values it read; say what stays in the local table as history. The night the clocks
go back is checked by the unit tests only: say so in the report.

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local `calendar` table:** the browser check writes to it and changes one setting for a
  moment. Never run the back end's integration journeys in this step (they empty the table),
  nor the front end's while the browser check is under way (they set the settings for their own
  run). Remove what the check created where the API allows it, put the settings back also when
  the check fails half-way, and list what stays.
- **Hard rules:**
  - the thirteen rules of a view and the seven rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no date
    arithmetic and no rule in a view: whether "Cancel appointment" is offered is decided in the
    logic layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except opening and closing a dialog;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a note and a username
    reach the page through `textContent` only and are never logged;
  - the existing tests keep passing unchanged, except where this brief says a case changes; if
    another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 62)

- The design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with steps 60 and 61 in short.
- The report says how long `week.view.ts` became (lines, and how many of them look nodes up),
  how long `index.html` became, and whether any condition for the fallback
  (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came close.
- The table of the new failure reasons and their sentences.
- Which existing test cases changed, and what changed in each.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 61's.
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 63.
