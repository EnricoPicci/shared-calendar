## Brief

Implement plan step 63, "Editing the note and changing an appointment"
(`docs/FRONTEND_VIEW_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review.

One stop at the end. How a change is made on the screen, which the plan says is settled before
any code (`docs/FRONTEND_VIEW_PLAN.md` step 63, and section 8, decision 10), was settled with
the Product Owner while this brief was written: it is design point 5. There is no early stop.

This step completes the appointment detail: the note can be edited in it, and the appointment
can be moved to another time. Both roles. After every note saved and every change, whatever its
outcome, the week is loaded again. It changes nothing in `backend/`, `shared/` or
`frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the view layer and the logic layer as built), the
    commands `dev`, `build` and `seed:local`, and the test conventions for the logic layer, the
    views and the shell;
  - the notes on the local `calendar` table: who empties it and when.
- `docs/FRONTEND_ARCHITECTURE.md` v4, all of it. It is the source of truth for this step: the
  thirteen rules of a view (section 3; rules 1, 4, 9, 10 and 12 above all), the shape of a view
  and of a dialog (section 4), the logic layer and what was built (sections 5 and 5.1), the
  shell (section 6), the fallback and its three conditions (section 7), the tests and what
  `happy-dom` does not emulate of the native `<dialog>` (section 8).
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 63, and step 64 to see what this step
  must leave ready (the detail dialog is used from a second screen there, and what the two
  screens share moves out of the week view).
- `docs/SHARED_CALENDAR_SPEC.md`: section 8.3 (cancelling: R-CAN-01 to R-CAN-03), 8.4 (changing:
  R-CHG-01 to R-CHG-03, what the booking rules mean in a change, the order of the checks), 8.5
  (the note: R-NOTE-01, an unchanged note), 8.2 (the booking rules a change repeats), 11.3 (the
  error codes), 11.4 (the bodies), 11.5 (the `Appointment`, `replaces`, `replacedBy`), 16.3
  (what the view does after a write), 16.8 (what the detail needs).
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules), section 19 (`AppointmentsService`; 19.1,
  19.4, 19.5 and 19.6 above all: `change` and `updateNote`, their codes, what is checked before
  sending), and section 8, decisions 40 and 42.

Then read the code this step builds on:
- `frontend/src/logic/`: `appointment.detail.ts`, `booking.ts`, `week.screen.ts`,
  `week.model.ts`, `texts.ts`, and their tests in `frontend/tests/unit/logic/` (`zone.ts` and
  `fixtures.ts` first).
- `frontend/src/views/`: `week.view.ts` (the two dialogs: how each knows what it is about and
  whether its action was asked for since it opened), `shell.ts` (`sessionObjects`), and their
  tests in `frontend/tests/unit/views/` (`page.ts` first).
- `frontend/index.html` (the element `#week`, its two dialogs and its templates) and
  `frontend/style.css`.
- `frontend/src/services/`: `appointments.service.ts` and `appointments.types.ts` (`change`,
  `updateNote`, their result and state streams), `calendar.service.ts` (`reload`).
- `shared/src/calendar/`: `schemas.ts` (`ChangeBody`, `NoteBody`, `Note`), `rules.ts`
  (`cancellableUntil`), `types.ts` (`Appointment`).

## Where we are (2026-11-19)

- Step 62 is committed and pushed (`bcf05fb`): the book dialog, the detail dialog with "Cancel
  appointment", the week loaded again after a booking or a cancellation and when the tab
  becomes visible. Check `git status -sb` rather than trusting this line.
- What step 62 left for this step:
  - the detail dialog shows the note as text and offers only "Cancel appointment"; its markup
    was left so that the note's form and "Change" can be added without moving what is there;
  - `appointmentDetail(…)` answers `canCancel` and one sentence (`hint`) about cancelling;
    `note` is "—" when there is none, so the dialog has no value to put in a field yet;
  - `WeekScreen` reloads at `bookResult$` and `cancelResult$` only, and knows nothing of an
    appointment being moved;
  - `failureText(reason)` has one sentence per reason. Every code `change` and `updateNote` can
    answer already has one, but `cancellation_notice_too_short` says "It is too late to cancel
    this appointment.", which is the wrong sentence after a change;
  - `week.view.ts` is 288 lines and listens to four streams.
- Found by step 62's browser check: an end not after the start, chosen by the Administrator in
  the book dialog, is refused before any call with the general sentence of `invalid_request`,
  "The request was not accepted. Please try again.", and trying again does not help the person.
  Design point 6 rewords it.
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina", 8 patterns
  valid 2026-11-19 to 2027-01-18, five appointments of `alice`, default settings, and the
  history of step 62's check (cancelled appointments, a deleted throw-away user). Look before
  relying on it (read-only, through the API) and say in the report what was there.
- The Codespace has no browser. Step 62's check ran in Playwright's headless Chromium, installed
  outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository. One
  lesson from that check: to say that nothing of a person is left in the page, read what a
  person can see and the values of the form fields, not the page's source, whose comments hold
  the word "Administrator".
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new logic goes** (`frontend/src/logic/`, each file with its test in
   `frontend/tests/unit/logic/`):
   - `appointment.detail.ts` grows: which of the three actions are offered, the sentence or
     sentences under them, and the note's own value for the field (empty when there is none),
     beside the text shown when it cannot be edited;
   - `week.screen.ts` grows: the reloads of point 4 and the moving state of point 5;
   - `booking.ts` grows, or a new pure file beside it: from what the confirmation holds to the
     argument of `AppointmentsService.change`. Reuse the times' functions that exist; do not
     write them a second time;
   - `texts.ts` grows: the sentences of point 6.
2. **Which actions the detail offers** (`docs/FRONTEND_SERVICES.md` section 19.6,
   `docs/SHARED_CALENDAR_SPEC.md` sections 8.3 to 8.5), decided in the logic layer with the
   `now()` read when the dialog opens:
   - **the note** can be edited while the appointment is booked and has not ended, by both
     roles; no notice applies (R-NOTE-01);
   - **"Change"** is offered as "Cancel appointment" is: to the Administrator while the
     appointment has not ended, to a User while "now" is not after `cancellableUntil`;
   - the server decides again when the call is made;
   - **one sentence under the buttons.** For a User: "It can be changed or cancelled until Mon
     23 Nov, 09:00." or "It is too late to change or cancel this appointment." (the note's
     field is there all the same, and no words are added about it). For the Administrator:
     nothing while it can be changed or cancelled, "This appointment has ended." when it
     cannot.
3. **The note is edited in the detail dialog**, in a fixed form of the dialog
   (`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 4): a `<textarea>` with the same
   `maxlength` as the book dialog's, and "Save note".
   - When the note can be edited the field holds it; when it cannot, the note is shown as text,
     as today, and there is no field and no button.
   - "Save note" calls `appointments.updateNote(appointmentId, note)` and nothing else: the
     button is disabled because `updateNoteState$` says `pending`, the dialog closes because it
     says `success`, a failure is shown in the dialog in plain words and the dialog stays open
     with what was typed. The same ties as the two existing actions: a result is shown only in
     the dialog that asked for it, since it opened.
   - An emptied note is sent as it is: the shared schema, through the service, makes a blank
     note `null`, which clears it. An unchanged note is sent too: the server answers success
     without writing (`docs/SHARED_CALENDAR_SPEC.md` section 8.5), and the dialog closes.
   - The note reaches the field through its `value` and the text through `textContent`, never
     as markup.
4. **The reload is still the week screen's.** `start()` also listens to `updateNoteResult$` and
   `changeResult$` and calls `calendar.reload()` at every result, success or failure, with the
   same care for a result that was already there at `start()`. `WeekAppointments` gains the two
   streams.
5. **The change**, as decided with the Product Owner:
   - **Starting it.** "Change" in the detail closes the dialog and calls a method of the
     `WeekScreen`, which from then on holds "this appointment is being moved". The state is a
     field of `week$` (the appointment being moved, as texts ready to show, or `null`): the
     view keeps listening to one stream for the week. The view shows a banner while the field
     is set, in a fixed element of `#week` outside the redrawn region, which names the
     appointment ("Moving: Mon 23 Nov, 11:00–12:00 · Studio. Choose a free time.", for the
     Administrator with the User's name) and holds the button "Keep the appointment as it is".
   - **What ends it:** a successful change; "Keep the appointment as it is"; the end of the
     subscription of `start()` (leaving the screen, signing out). **What does not:** a refused
     change, whatever the reason, also when the reason is about the old appointment
     (`appointment_not_found`, `appointment_not_active`, `cancellation_notice_too_short`,
     `user_not_found`): one rule for every refusal, and the person gives up with the banner's
     button; a reload of the week; the tab hidden and shown; the Escape key or "Close" in the
     confirmation, which close the dialog only.
   - **Any week.** Previous, next and "Today" work as usual while moving. The old appointment
     may then be outside the week on screen, where `detail(appointmentId)` looks: the screen
     keeps a copy of the appointment taken when "Change" was pressed, and the banner and the
     confirmation name it from that copy.
   - **What can be clicked while moving:** free slots only. An appointment's button does
     nothing until the move is over (disabled from the state, in the view, so that the keyboard
     skips it too): the appointment being moved cannot be cancelled half-way. A week redrawn
     while moving, or after the move ended, has its buttons in the right state.
   - **The confirmation is the book dialog in a second mode**, not a third dialog. A slot
     clicked while moving opens it with: the title "Change appointment"; the old time and the
     new one, each on its line ("From: Mon 23 Nov, 11:00–12:00", "To: Tue 24 Nov, 09:00–10:00 ·
     Studio"); for the Administrator the custom start and end, as in a booking, and **no choice
     of User** and no call of `listUsers` (`docs/SHARED_CALENDAR_SPEC.md` section 8.4: the User
     is the old appointment's); the note; "Change" in the place of "Book". The fixed texts of
     both modes are in `index.html`, shown and hidden; the script writes none of them.
   - **The note.** The field opens filled with the old appointment's note, and what it holds
     is always sent as `note`: untouched it stays the same, edited it changes, emptied it is
     cleared (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-03; the shared schema makes a blank note
     `null`). The key is never left out.
   - **The call.** "Change" calls `appointments.change(appointmentId, …)` and nothing else: a
     User sends the slot's `start` and the note; the Administrator both instants and the note,
     the slot's own while the times were not touched; never a `username`. The button is
     disabled because `changeState$` says `pending`; the dialog closes because it says
     `success`, and the move ends because the week screen heard `changeResult$`, not because
     the view said so; a failure is shown in the dialog in plain words and the dialog stays
     open with what was typed. Closing it returns to the banner: another slot can be chosen.
     The same ties as the other actions: a result is shown only in the dialog that asked for
     it, since it opened, and a change's failure never shows in a booking's dialog or the
     other way round.
   - **Moving inside its own time: nothing special.** The Administrator shifts an appointment
     by clicking a free slot of the same window and setting the two times, which may overlap
     the old ones (R-CHG-01; the lists cover the whole window). When that window has no free
     slot left there is nothing to click: a **known limit**, to write in
     `docs/FRONTEND_ARCHITECTURE.md` section 5.1; the Administrator cancels and books again. A
     User books whole hours, so the case does not arise.
6. **The sentences.**
   - `failureText` takes a second, optional argument that says what was attempted. After a
     change, `cancellation_notice_too_short` is "It is too late to change this appointment.";
     after a cancellation it stays as it is. Every other reason keeps one sentence whatever was
     attempted, unless reading it after a change or a note shows it to be wrong: then propose
     the words in the report.
   - `invalid_request` becomes "The request was not accepted. Check what you entered and try
     again.", for every case and every screen. No sentence of its own for an end not after the
     start, and no check of the two times in the logic layer.
   - Give the full table in the report: I review the words.
7. **Everything stays in `week.view.ts` in this step**, as the plan has it: step 64 moves what
   two screens share. `WeekDeps` gains what the view uses, each as a `Pick<…>`. **Watch the
   fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7): if a helper that builds or updates
   nodes is about to be written, or the look-ups for the new streams outgrow the rest of the
   view, stop and say so before writing a workaround.
8. **The shell** should not need to change: the moving state must not survive a sign-out, and
   the session's objects are dropped with the person, which should be enough. Show it in the
   shell's test; if it is not enough, say so.
9. **Tests.**
   - The logic: every function and every path, with fake services and a fixed "now", under
     `useFarBrowserZone()`. Most of the step's cases are here.
   - The view: the real `index.html`, fake `WeekScreen` and services; `close()` stands for the
     Escape key.
   - The shell: a note's result and a change's result reload the week (real services, stubbed
     `fetch`), and signing out while an appointment is being moved leaves nothing.
   - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.

## The step

Only what `docs/FRONTEND_VIEW_PLAN.md` step 63 lists.

- **Logic**, with tests that include:
  - `appointment.detail.ts`: for both roles, each of the three actions offered and not; a User
    at exactly `cancellableUntil` and one millisecond later (the note still editable, the other
    two not); an appointment in progress (the Administrator may change and cancel, both may
    edit the note); one that has ended; one that is cancelled; with and without a note; the
    sentences in a calendar zone that is not the browser's;
  - the argument of `change`: a User's (the start only); the Administrator's (the slot's own
    instants when the times were not touched, a custom start and end in `Europe/Rome` in winter
    and in summer and in a half-hour zone); the note untouched, edited and emptied, the key
    always there; never a `username`;
  - `WeekScreen`: a reload at a note's success and failure and at a change's success and
    failure; none for a result that was already there at `start()`; the moving state in every
    transition of point 5: started, ended by a success, by "Keep the appointment as it is" and
    by the end of the subscription; kept after a refused change (a reason about the new time
    and one about the old appointment), after a reload, after a notification of `visible$` and
    after a move to another week and back, with the banner's texts still those of the copy;
  - `failureText`: the two sentences of point 6, with and without the second argument, and
    every other sentence unchanged.
- **Markup and styles:** the note's form and "Change" in the detail dialog, the banner, and the
  book dialog's second mode, in `frontend/index.html`; their styles in `frontend/style.css`. No
  inline script, style or handler (`page.test.ts` keeps passing).
- **The view:** `week.view.ts` and its DOM test: every state of every stream it listens to;
  "Save note" and its call's argument (a text, an emptied field, an unchanged note); the field
  absent when the note cannot be edited; "Change" and what follows it, for both roles: the
  banner, the appointments' buttons disabled, a slot opening the confirmation with its texts
  and the old note, no call of `listUsers`, "Change" and its call's argument, a failure shown
  and the banner still there after closing; "Keep the appointment as it is"; the book dialog
  opened for a booking after a move shows nothing of the move, and the other way round; a note containing `<script>` shown as text and put
  in the field as text; the detail opened a second time, on another appointment, shows nothing
  of the first, after a success and after a failure; a failure that was already in a stream is
  not shown at opening; a reload while a dialog is open; after unsubscribing nothing is left in
  the page, no dialog is open and no banner is shown.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v5: section 4 if the dialogs' shape gained something,
    section 5.1 (the detail's three actions, the moving state, the reloads, the sentences, any
    known limit of point 5), section 8 if something new was learnt about `happy-dom`,
    section 9, the decisions table (the interaction of point 5, with its reasons), the status line
    and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 63 done, with its date), and step 63's
    text brought in line with design point 5 (the interaction is decided, no longer "to settle
    first"), with a change log line.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7, if a file was added.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions if something new was
    learnt, "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- "my appointments" and a second address (step 64); any other screen;
- moving the dialogs out of `week.view.ts` (step 64);
- following `replaces` and `replacedBy` (`docs/SHARED_CALENDAR_SPEC.md` section 8.4: stored and
  answered, never followed); a changed appointment is simply no longer in the week;
- moving an appointment to another User (the Administrator cancels and books again);
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any request for the settings, and any change of a setting by the application (the browser
  check may change one through the API and puts it back);
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- the size of the bundle, hosting, CORS, logout as a service, the session in `sessionStorage`;
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width.
If the local calendar is empty, run `npm run seed:local -w frontend` first. The first call of
each route takes a few seconds under `sam local`: wait for it, do not count it as a failure.

Steps 60 to 62 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; next and
   "Today" work; an unknown hash shows the week;
2. she books a free slot with a note, sees it as "You", opens it and cancels it.

Step 63, as `alice`:

3. the detail of an appointment of hers holds the note in a field; she edits it and saves: the
   dialog closes, and the week and the detail opened again show the new note;
4. she empties the note and saves: the week shows no note, and the detail an empty field;
5. she saves a note without touching it: the dialog closes and nothing else changes (the check
   reads the appointment through the API before and after: the same `version`);
6. a note containing `<b>` is shown as text in the week and stays text in the field;
7. "Change", then another free slot, then the confirmation, which names the old and the new
   time: the old one is gone from the week, the new one is there as "You", with the old note when
   the field was left alone, and with the new text when it was edited;
8. a change to a week further on: she moves to the next week while choosing, and the banner
   still names the appointment; while the banner shows, a click on an appointment does nothing;
9. "Keep the appointment as it is" leaves everything as it was: no banner, the appointment in
   its place, a click on a slot opens the book dialog again;
10. a change refused because the new slot is too soon (the check raises `minBookingNoticeHours`
    through the API after the week was loaded, and puts the value back afterwards): the reason
    in plain words, the old appointment still there, and the banner still there after the
    dialog is closed;
11. an appointment too late to change (one less than `cancellationNoticeHours` ahead, booked
    for her by the check as the Administrator): the detail says so, offers neither "Change" nor
    "Cancel appointment", and still lets her edit the note;
12. a new slot taken in the meantime (booked through the API for a throw-away user after the
    week was loaded): the refusal in plain words, the week behind refreshed, the old
    appointment still there.

As `admin`:

13. the detail of `alice`'s appointment lets the note be edited and saved;
14. "Change" on `alice`'s appointment, also one less than 24 hours ahead: the new appointment
    is `alice`'s, and no User is asked for;
15. a change with a custom start and end: the new appointment is drawn at its place.

Both:

16. the Escape key closes every dialog and the focus returns to the block that opened it; in
    the confirmation it closes the dialog only, and the banner stays;
17. while an appointment is being moved, the tab hidden and shown again loads the week again
    and leaves the banner and any open dialog as they are;
18. sign out while an appointment is being moved, sign in as the other role: no banner, no
    note, no name and no dialog of the first person in what the page shows or in its fields;
19. at the phone width the detail with its form, the banner and the confirmation fit the
    screen, can be scrolled if they are taller, and nothing makes the page wider;
20. by keyboard only: open a detail, type a note, save it; start a change, reach a slot,
    confirm;
21. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; no request to another origin.

At the end the check cancels what it booked, deletes its throw-away user and writes the settings
back to the values it read; say what stays in the local table as history.

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
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no date
    arithmetic and no rule in a view: which actions the detail offers, and which appointment is
    being moved, are decided and held in the logic layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except opening and closing a dialog;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a note and a username
    reach the page through `textContent` or a field's `value` only and are never logged;
  - the existing tests keep passing unchanged, except where this brief says a case changes
    (the sentence of `invalid_request`, the detail's sentence for a User); if another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 63)

- The design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with steps 60 to 62 in short.
- The report says how long `week.view.ts` became (lines, and how many of them look nodes up),
  how long `index.html` became, and whether any condition for the fallback
  (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came close.
- The table of the sentences, new and changed.
- Which existing test cases changed, and what changed in each.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 62's.
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 64.
