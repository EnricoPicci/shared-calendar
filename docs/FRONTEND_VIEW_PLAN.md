# Front end — The view layer: implementation plan

| | |
|---|---|
| Status | v9 — **under way** (planned 2026-11-16, brief `prompts/82-plan-view-layer-implementation.md`). Step 60 done on 2026-11-19 (brief `prompts/83-step-60-implementation.md`). Step 61 done on 2026-11-19 (brief `prompts/84-step-61-implementation.md`). Step 62 done on 2026-11-19 (brief `prompts/85-step-62-implementation.md`). Step 63 done on 2026-11-19 (brief `prompts/86-step-63-implementation.md`). Step 64 done on 2026-11-19 (brief `prompts/87-step-64-implementation.md`). Step 65 done on 2026-11-19 (brief `prompts/88-step-65-implementation.md`). Step 66 done on 2026-11-20 (brief `prompts/89-step-66-implementation.md`). Step 67 done on 2026-11-20 (brief `prompts/90-step-67-implementation.md`). Step 68 done on 2026-11-20 (brief `prompts/91-step-68-implementation.md`), waiting for review: **every screen of section 3 exists**; next step 69, the closing |
| Scope | Everything needed to go from the services layer that exists to **all the views written, tested and running in a browser against the local stack**: the tooling, the shell, the logic layer and one view per screen. Steps 60 to 69 |
| Not in scope | Hosting, the CORS configuration, the Content-Security-Policy of the hosting, logout as a designed service, the session across a reload, the cloud deployment of the front end. They are the open points O1, O2, O3, O5 and O7 of `docs/FRONTEND_ARCHITECTURE.md` section 10 and get their own plan |
| Governed by | `docs/FRONTEND_ARCHITECTURE.md` (the rules of the view layer), `docs/FRONTEND_SERVICES.md` (the services the views use), `docs/SHARED_CALENDAR_SPEC.md` section 16.8 (what the views need), `docs/ARCHITECTURE.md` section 4 (the API). On any conflict with this plan, they win |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-16 | First version: steps 60 to 69. |
| v2 | 2026-11-19 | Step 61, decided before its implementation: "today", for the week the screen opens on, is taken in the default time zone (`DEFAULT_TIME_ZONE` of `shared/`), not in the zone the settings give; the week screen makes no request for the settings. The limit this accepts is in `docs/FRONTEND_ARCHITECTURE.md` section 5.1. Step 61's bullet on "today" and its line on the seed (which also books a few appointments for `alice`) are corrected. |
| v3 | 2026-11-19 | Step 62 gains a reload of the week every time the browser's tab becomes visible again, so that a booking made by someone else is seen without a sign-out. No change to the back end: the API has no way to push, and a WebSocket connection would be a feature of its own, outside this plan (section 8, decision 11). |
| v4 | 2026-11-19 | Step 63: how a change is made on the screen is decided, with the Product Owner, before the step's implementation, and no longer "to settle first". The step's text says the interaction as decided: the banner, any week while moving, what ends a move and what does not, the book dialog as the confirmation, the note always sent, and the known limit of a move inside a full window. Section 8, decision 10 says so for step 63; step 68's interaction is still to propose. |
| v5 | 2026-11-19 | Step 64: three choices about the screen were made with the Product Owner before the step's implementation (brief `prompts/87-step-64-implementation.md`), and the step's text says them: the list's time zone is read from the settings; the history's period is chosen with two dates and opens on the 30 days that end today; "Change" from the list goes to the week, with step 63's banner and confirmation. The step's browser check is brought in line. |
| v6 | 2026-11-19 | Step 65: four choices about the settings screen were made with the Product Owner before the step's implementation (brief `prompts/88-step-65-implementation.md`), and the step's text says them: "No limit" as a checkbox, what the form shows beside its fields, unsaved values lost with no question, and what follows a save. The step also carries two wordings decided at the reviews of steps 63 and 64 (the labels "Start" and "End" of the book dialog; a sentence of its own for the limit met by a change), and records that the history of "My appointments" keeps its default period. |
| v7 | 2026-11-20 | Step 66: four choices about the users screen were made with the Product Owner before the step's implementation (brief `prompts/89-step-66-implementation.md`), and the step's text says them: no "Copy" button, the password dialog closed by its button only, a confirmation with two buttons before a delete, and a row with the username only. The step's text also says where the generated password is and is not, and its browser check is brought in line. |
| v8 | 2026-11-20 | Step 67: four choices about the availability screen were made with the Product Owner before the step's implementation (brief `prompts/90-step-67-implementation.md`), and the step's text says them: creating is a fixed form and changing is a dialog; every pattern is listed, an ended one marked; "Change" is one call; a pattern's start and end are two lists on the 15-minute grid. The step's text also says what the screen reads, where a refusal is shown, and the conflicts list's three places, and its browser check is brought in line. The status line no longer says that step 66 waits for review. |
| v9 | 2026-11-20 | Step 68: nine choices about the screen were made with the Product Owner before the step's implementation (brief `prompts/91-step-68-implementation.md`), and the step's text says them in the place of "to settle first": the date is chosen on the availability screen; "this day only" is a list put together and saved in one go; "not available" is a button of its own that asks first; an extra window is created and deleted, not edited; a past date is refused; two windows of the list that overlap are refused at "Add"; "Show" is refused while the list is open; the dialog that confirms has neutral words; the logic of the part is a second object. Its browser check is brought in line. Section 8, decision 10 says so. The status line no longer says that step 67 waits for review. |

---

## 1. How to use this plan

The plan is a sequence of **steps**, numbered after the last step of
`docs/IMPLEMENTATION_PLAN.md` (59). It follows the working rhythm of `CLAUDE.md`: one step at a
time, its acceptance check, an honest report (failures included), then a stop for review. Commit
only when asked.

- Every step ends with something that runs in a browser: there is no step whose result is "wired
  later".
- Paths are from the repository root. Commands run from the root with `-w frontend`.
- Effort figures are indicative. Total: about 50 hours.
- **When a step proves `docs/FRONTEND_ARCHITECTURE.md` wrong, the step stops and proposes the
  change to that document.** The views do not silently diverge from it.
- **The fallback is watched at every step.** If a view meets one of the conditions of
  `docs/FRONTEND_ARCHITECTURE.md` section 7 (`lit-html` for a single view), the step stops and
  says so before writing a workaround.
- The back end, `shared/` and the services are not changed by this plan. If a view needs
  something they do not give, the step stops and reports it: it is a finding, not a task of the
  step.

## 2. What is settled before the first step

Three open points of `docs/FRONTEND_ARCHITECTURE.md` section 10 blocked the first view. They were
decided with this plan (clarification round of brief `prompts/82-plan-view-layer-implementation.md`); step 60
writes them into `docs/FRONTEND_ARCHITECTURE.md` v2.

| Open point | Decision | What it means for the plan |
|---|---|---|
| O4, the bundle command and the dev server | **esbuild**, already a development dependency of the repository | Two small Node scripts in `frontend/scripts/`: a build and a dev server. No new dependency, no configuration file of a tool |
| O6, the DOM emulation and the coverage of the views | **`happy-dom`**, and the views **inside the 100 % line coverage** of `frontend/src` | One new development dependency, in `frontend/package.json`. A view is not done until its test covers every line |
| O8, the language of the interface | **English only**, no translation mechanism | The fixed texts are written in `index.html`; the texts that depend on data are in the logic layer |

Two open points stay open and shape what "running locally" means:

- **O2, CORS.** The dev server passes the API's and Cognito's paths on to the local stack, so the
  browser sees one origin and the gap does not bite locally. It is not solved.
- **O7, logout, and O3, the session across a reload.** "Sign out" clears the `SessionStore` only,
  and a reload of the page means signing in again. Both are accepted for local use.

## 3. What is built

The screens are those of `docs/SHARED_CALENDAR_SPEC.md` section 16.8, plus the login and the user
administration.

| Screen | Who | Step |
|---|---|---|
| Login | both | 60 |
| Week calendar | both | 61 |
| Book dialog | both | 62 |
| Appointment detail: cancel | both | 62 |
| Appointment detail: edit the note, change | both | 63 |
| My appointments | User | 64 |
| Settings | Administrator | 65 |
| Users | Administrator | 66 |
| Availability: types and weekly patterns | Administrator | 67 |
| Availability: date overrides and one-off windows | Administrator | 68 |

The order: first the path a User walks (sign in, see the week, book, cancel, change, list), which
is also where the hardest screen is, so that a problem with the plain approach shows early; then
the Administrator's forms, from the simplest (settings) to the richest (availability).

Not built: a screen for the Hello World route. `HelloService` stays as it is, used by its tests.

## 4. What every step does

Each screen step follows the same sequence, and its acceptance check includes all of it.

1. **Logic first.** What the screen needs beyond the services goes into `frontend/src/logic/`
   (`docs/FRONTEND_ARCHITECTURE.md` section 5), with unit tests and no DOM. Most of the test
   cases of a screen are here.
2. **Markup.** The screen's element, its dialogs and its `<template>` elements are added to
   `frontend/index.html`; its styles to `frontend/style.css`. A phone and a desktop are served by
   the same markup.
3. **The view.** `frontend/src/views/<name>.view.ts`: one mount function, following the thirteen
   rules of `docs/FRONTEND_ARCHITECTURE.md` section 3.
4. **The DOM test.** `frontend/tests/unit/views/<name>.view.test.ts`, against the real
   `index.html`, with fake services and fake logic objects (`docs/FRONTEND_ARCHITECTURE.md`
   section 8). It always includes: every state of every stream the view listens to; every action
   of the user and the call it makes; a text containing `<script>` shown as text; and that
   leaving the view leaves nothing behind.
5. **The shell.** The screen gets its address (the URL's hash) and its entry in the navigation
   of the roles that may see it.
6. **The browser check.** The step's list of checks is run in a browser against the local stack
   (`npm run local:up -w backend`, `npm run local:api -w backend`, `npm run dev -w frontend`), as
   `alice` and as `admin` where both roles see the screen, at a desktop width and at a phone
   width. The report gives the result line by line. The console shows no error and no violation
   of the Content-Security-Policy other than the known one of `zod`
   (`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O5).
7. **The documents.** `CLAUDE.md` (commands, folder map) and `docs/FRONTEND_ARCHITECTURE.md`
   where the step added or changed something they describe.

**The acceptance check common to every step:**

- `npm run verify -w frontend` is green: typecheck, lint (the comment rule and the rules of step
  60 included), unit tests of the services, the logic and the views, 100 % line coverage of
  `frontend/src`;
- the step's browser check passes, line by line;
- the screens of the earlier steps still work: the browser checks of the steps before are run
  again in short (sign in, the week, one booking and its cancellation).

The integration journeys of `frontend/tests/integration` are not changed by this plan: they test
the services, which the plan does not touch.

---

## 5. Steps

### Step 60 — Foundation: tooling, shell and login (≈ 6 h)

**Goal:** a page that is built and served by the repository's own commands, on which a person
signs in and out. Everything the later steps stand on.

Tooling:

- `frontend/scripts/build.mjs` and the script `build`: esbuild bundles `frontend/src/main.ts` into
  one module script in `frontend/dist/` and copies `index.html` and `style.css` beside it. The
  configuration (the API's URL, Cognito's URL, the client id) is put in at bundle time, never
  written in a committed file (`docs/FOLDER_STRUCTURE.md` section 7).
- `frontend/scripts/dev.mjs` and the script `dev`: a dev server on one port that serves the
  page, bundles again at every load, takes the client id from `backend/env.local.json`, passes
  `/api` and `/cognito` on to the local stack, and sends the header
  `Content-Security-Policy: default-src 'self'`. It exists for local work only.
- `happy-dom` as a development dependency of `frontend`; the vitest configuration gives the
  views' tests the DOM environment and leaves the services' and the logic's tests in `node`. A
  test helper loads the real `index.html` into the emulated document.
- `frontend/tsconfig.json` gains `DOM.Iterable`.
- Root `eslint.config.js`: no `innerHTML`, `outerHTML` or `insertAdjacentHTML` in `frontend/src`;
  no `document` or `window` in `frontend/src/logic` and `frontend/src/services`
  (`docs/FRONTEND_ARCHITECTURE.md` section 9). The scripts under `frontend/scripts/` run in Node
  and are outside the rules for the browser's code.

Views:

- `frontend/index.html` and `frontend/style.css`: the login element, and the application's frame
  (a header with who is signed in, the role and "Sign out"; an empty navigation; an empty main
  area).
- `frontend/src/main.ts`, `frontend/src/views/shell.ts`, `frontend/src/views/login.view.ts`,
  with their DOM tests. The shell as `docs/FRONTEND_ARCHITECTURE.md` section 6 describes it,
  without navigation yet: `null` shows the login, a session shows the frame.

Documents: `docs/FRONTEND_ARCHITECTURE.md` v2 (O4, O6 and O8 decided as in section 2 of this
plan, with what the step fixed in detail: how the tests get their environment, where the built
files go, how the configuration reaches the bundle), `docs/FOLDER_STRUCTURE.md` (the tree and
section 7), `CLAUDE.md` (the commands `dev` and `build`, the folder map).

To settle in the step and record: whether `src/main.ts`, one statement, is tested or is the one
file left out of the coverage by name.

**Browser check:** a wrong password shows the failure and leaves the form usable; while the call
is pending the button is disabled; `alice` signs in and the header says who and "User"; `admin`
signs in and it says "Administrator"; "Sign out" returns to the login with an empty form; signing
in as another person shows nothing of the first.

**Acceptance:** the common check; and `npm run build -w frontend` writes `frontend/dist/`
(git-ignored), whose size the report gives.

---

### Step 61 — The week calendar, read-only (≈ 7 h)

**Goal:** after signing in, both roles see the week and move between weeks. The largest piece of
rendering, done early.

Logic (`frontend/src/logic/`):

- the texts that every later step uses: a date, a time and a range in the calendar's time zone
  through `shared/`'s time helpers, never the browser's zone; a failure `reason` in plain words;
- the week ready to draw: per day its windows, free slots, busy blocks and appointments, each
  with its place in the day, its time as text and its type's colour; the hours shown; the legend;
- the week screen: which Monday is on screen, `previous`, `next`, `today`, the load at every
  change, the last week kept on screen while the next one loads;
- **"today" in the default time zone** (`DEFAULT_TIME_ZONE` of `shared/`, `Europe/Rome`): the
  week the screen opens on, and the one "Today" returns to, is the week of "now" in that zone,
  with no request for the settings, so the first week is loaded at once. Every date and time of
  a loaded week is shown in the zone the server names in its answer, and the day marked as today
  comes from that answer. The limit (a calendar deployed in another zone can open on the
  neighbouring week around midnight) is in `docs/FRONTEND_ARCHITECTURE.md` section 5.1;
- **the night the clocks go back**: two slots or appointments with the same local time an hour
  apart are told apart by their offset ("02:00 +02:00", "02:00 +01:00"), as
  `docs/SHARED_CALENDAR_SPEC.md` section 16.8 asks.

View: `week.view.ts`, with the `<template>` elements of a day, a window, a busy block, a slot and
an appointment. For the Administrator every appointment carries its User's name; for a User the
own appointments and the others' as busy blocks. The time zone is named on the screen. Slots and
appointments are drawn but do nothing yet.

Shell: the navigation by the URL's hash (`docs/FRONTEND_ARCHITECTURE.md` section 6, point 6),
with its first address, `#/week`; an unknown hash shows the week.

Also: `frontend/scripts/seed-local.mjs` (`npm run seed:local -w frontend`), which gives an empty
local calendar two types, a few patterns and a few appointments for `alice` through the API, so
that there is a week to look at. It only adds, and only on `localhost`. (The back end's calendar
journeys empty the local table: the seed is run again after them.)

**Browser check:** the week of today with its windows, slots and the legend; previous, next and
"Today"; "Loading…" and the dimmed week while loading; with the local API stopped, the failure in
plain words and the last week still on screen; as `alice`, another User's appointment is a busy
block with no name; as `admin`, names are shown; at a phone width the days scroll sideways.

**Acceptance:** the common check. The report says how long `week.view.ts` is and whether any
condition for the fallback was met.

---

### Step 62 — Booking and cancelling (≈ 6 h)

**Goal:** a free slot can be booked and an appointment cancelled, by both roles, and the week
follows.

Logic: the booking body from a slot, a note and a username; for the Administrator the custom
start and end on the 15-minute grid, checked with the shared schemas and rules; whether "Cancel"
is offered and until when (`cancellableUntil`, the role); the reload of the week after every
booking or cancellation, whatever its outcome; **the reload of the week every time the browser's
tab becomes visible again**, so that what other people booked or cancelled in the meantime is
shown. The logic layer has no DOM: the shell hands the week screen a stream that notifies when
the page becomes visible (the document's `visibilitychange`), as it hands it "now".

View: the book dialog (the slot, the note; for the Administrator the User to book for, from
`GET /users`, and the custom start and end) and the appointment detail dialog (the fields of
`docs/SHARED_CALENDAR_SPEC.md` section 11.5, "Cancel appointment" when the rules allow it, and
why not when they do not). Native `<dialog>` elements; a dialog opened a second time shows
nothing of the first.

**Browser check:** as `alice`: book a slot with a note, see it in the week, open it, cancel it;
a note with `<b>` in it is shown as text; a slot taken in the meantime is refused in plain words
and the week is refreshed; a slot too late to book and an appointment too late to cancel say so.
As `admin`: book for `alice`; book a custom start and end; cancel anyone's appointment. The
Escape key closes a dialog. With the week on screen in one tab, a booking made from elsewhere
(another window, or the API) is shown when the person comes back to the tab, and a dialog that
is open stays as it is.

**Acceptance:** the common check.

---

### Step 63 — Editing the note and changing an appointment (≈ 5 h)

**Goal:** the appointment detail is complete: note and change, enabled according to the rules.

**How a change is made on the screen**, decided with the Product Owner before any code (brief
`prompts/86-step-63-implementation.md`; the reasons are in `docs/FRONTEND_ARCHITECTURE.md`
section 11, decisions 43 to 49). The service takes the appointment's id and the new
appointment's fields, the same as a booking's without the User (`AppointmentsService.change`).

- "Change" in the detail closes the dialog and puts the week in a "choose the new time" state,
  shown by a banner that names the appointment and holds "Keep the appointment as it is".
  Which appointment is being moved is state of the logic layer (the week screen), not of the
  view.
- Previous, next and "Today" work while moving: the new time may be in any week, and the banner
  still names the appointment.
- While moving only free slots can be clicked; an appointment's button does nothing.
- The next free slot clicked is the new time, confirmed in the book dialog in a second mode:
  "Change appointment", the old time and the new one, for the Administrator the custom start
  and end and no choice of User, the note filled with the old one and always sent, "Change".
- The move ends at a successful change, at "Keep the appointment as it is" and when the screen
  is left; a refused change, whatever its reason, leaves the banner, and so does closing the
  confirmation.
- Known limit: the Administrator shifts an appointment inside its own time by clicking a free
  slot of the same window; when the window has none, the appointment is cancelled and booked
  again.

Logic: which actions the detail offers (the status, the end, the role, `cancellableUntil`); the
"moving an appointment" state of the week screen; the reload after a note or a change; the
argument of the change from what the confirmation holds.

View: the note edited in the detail dialog's own fixed form
(`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 4); the banner; the book dialog's second mode.

**Browser check:** edit a note, empty it, leave it unchanged; change an appointment to another
slot, also in a later week, and see the old one gone; a change refused (the new slot too close,
taken in the meantime) says why and leaves the old appointment and the banner; an appointment
too late to change says so and still lets its note be edited; giving up the change leaves
everything as it was; as `admin`, change another person's appointment, also with a custom start
and end; signing out while moving leaves nothing.

**Acceptance:** the common check.

---

### Step 64 — My appointments (≈ 4 h)

**Goal:** a User sees the list of their upcoming appointments and their history, and opens an
appointment's detail from it.

**Three choices about the screen**, made with the Product Owner before any code (brief
`prompts/87-step-64-implementation.md`; the reasons are in `docs/FRONTEND_ARCHITECTURE.md`
section 11, decisions 55, 59 and 60):

- **The time zone comes from the settings.** The list's answer does not name the calendar's
  zone, so the list screen reads `GET /calendar/settings` once each time it is shown, before
  the first list, for the zone only. The week screen keeps opening without that request.
- **Two modes, one list.** "Upcoming" (`upcoming=true`), the mode the screen opens in, and
  "History" (`status=all` with a range), whose period is chosen with two native date fields and
  "Show", in a fixed form outside the list. The history opens on the 30 days that end today,
  loaded at once; a period may hold future dates. The mode and the period are kept while the
  person is signed in.
- **"Change" from the list goes to the week.** It closes the detail, hands the appointment over
  to the week screen and changes the address: the week opens on the appointment's week with
  step 63's banner, and everything from there is step 63's. Leaving the week still ends the
  move; nothing brings the person back to the list after the change.

Logic: the list ready to draw (date, time, type, note, status in words: "Booked", "Ended" for
a booked appointment whose end has passed, "Cancelled", "Changed"); the list screen (the two
modes, the period and its own checks before any call: a date missing, the first date after the
last, more than the 92 days of `shared/`; the reload after a cancellation or a note saved and
when the tab becomes visible); the detail's one sentence for a cancelled, a moved and an ended
appointment; the hand-over to the week screen.

View: `appointments.view.ts`, a list rebuilt when another list arrives, with no input field
inside it; a row is a button that opens the detail dialog of steps 62 and 63. That dialog is
used from two screens: its markup moves out of the week's element and its wiring out of the
week view into `detail.view.ts`, which the view of the screen on show mounts, without changing
what steps 62 and 63 checked.

Shell: the second address, `#/appointments`, for the User only. This is the first step with two
screens: the navigation, leaving a view and coming back to it are checked here.

**Browser check:** the upcoming list, in the calendar's zone, after the settings and the list
and no other request; an empty list says so; the history over the last 30 days at once, and
over a period chosen, shows a cancelled, a changed and an ended appointment with their status;
a period too long, with its dates swapped or with a date missing is refused in plain words
with no request; a row opens the detail, with the right sentence and actions; a note saved and
a cancellation from the list, and the list follows; "Change" from the list shows the week of
the appointment with the banner, and going back to the list ends the move; go to the week and
back, twice, by the links and by the back button, and nothing is left over or doubled; the tab
shown again loads the same list again; as `admin`, `#/appointments` typed by hand shows the
week; signing out on the list with the detail open leaves nothing.

**Acceptance:** the common check.

---

### Step 65 — Settings (≈ 3 h)

**Goal:** the Administrator reads and changes the four settings. The first of the
Administrator's forms, and the simplest: how a value is refused, with its field named and no
request sent, is settled here for the forms that follow.

**Four choices about the screen**, made with the Product Owner before any code (brief
`prompts/88-step-65-implementation.md`; the reasons are in `docs/FRONTEND_ARCHITECTURE.md`
section 11, decisions 70 to 73):

- **"No limit"** for the maximum of upcoming appointments is a checkbox beside the number
  field. An empty field is refused; it never means "no limit".
- **Beside the four fields** the form shows each range in words, the calendar's time zone,
  which cannot be changed here, and who saved the settings last and when.
- **Values typed and not saved are lost**, with no question, on a change of screen and on
  signing out.
- **After "Save"** the settings are read again, whatever the outcome. A success says "Settings
  saved." and fills the form with the server's answer; after a failure what was typed stays.

Logic: the settings as the form shows them; the ranges from `shared/`; the fields checked one
by one before any call (not empty, a whole number written with digits, inside its range), with
one sentence per field in fault; what is sent when the form is saved; the read after a save.

View: `settings.view.ts`, one fixed form; a field in fault is marked and has its sentence
under it. Shell: `#/settings`, Administrator only.

Also in this step, decided at the reviews of steps 63 and 64: the two lists of times of the
book dialog are labelled "Start" and "End"; a change refused because the User holds more
appointments than the limit now allows has a sentence of its own. The history of "My
appointments" keeps opening on the 30 days that end today.

**Browser check:** the current values, the ranges, the time zone and who saved last; a value
above or below its range, an empty field, a decimal and a text are each refused under their
field with no request sent; a saved value is there after signing out and in; "No limit" sends
no number; a save that fails is said in plain words and what was typed stays; as `alice`, the
address is not in the navigation and typed by hand shows the week; a booking then follows the
new notice or horizon, and a change refused for the limit says so in its own words. The values
found before the check are put back.

**Acceptance:** the common check.

---

### Step 66 — Users (≈ 4 h)

**Goal:** the Administrator lists, creates and deletes users.

**Four choices about the screen**, made with the Product Owner before any code (brief
`prompts/89-step-66-implementation.md`; the reasons are in `docs/FRONTEND_ARCHITECTURE.md`
section 11, decisions 77 to 80):

- **The password dialog has no "Copy" button.** The password is a plain text, selected and
  copied by hand; the page never touches the clipboard.
- **The password dialog is closed by its button only**, "I have noted the password": the
  Escape key does not close this one dialog, since the password cannot be shown again and no
  route sets another.
- **Deleting asks first**, in a dialog with two buttons, "Keep" and "Delete user", which names
  the user and says that their future appointments will be cancelled and that this cannot be
  undone. Nothing is typed to confirm.
- **A row shows the username only**, with its "Delete" button: the screen makes one request,
  `GET /users`, and needs no time zone.

Logic: the list ready to draw; the username checked with the shared schema before any call,
spaces around it removed and nothing else changed, with one sentence that is both the hint
under the field and its refusal; the words of the delete dialog; the users screen (the read of
the list, its failure and the new try, the create, the list read again after every create and
delete and when the tab becomes visible). The generated password never passes through the
logic layer.

View: `users.view.ts`: a fixed form with the username, a field in fault as step 65 settled
it; the list, a row with its button. Creating a user shows the generated password **once**, in
a dialog, with the sentence that it cannot be shown again. The password is the one exception of
`docs/FRONTEND_SERVICES.md` section 2, rule 6: the view takes it from the service's own
result and puts it on the screen with `textContent`, in one element, never logs it, never puts
it in the address, and removes it from the page when the dialog is closed and when the view is
left. A name that exists is the server's answer, said in plain words as the form's failure.
The delete dialog shows a failure and stays open; it closes on its success.

Shell: `#/users`, Administrator only, after "Settings". The shell's test of a second person
signing in no longer looks for the word "User" in the frame: it compares whole pages.

**Browser check:** the list, with `alice` and without `admin`, after one request; a username
that is not allowed is refused under the field with no request, and one that exists by the
server, in plain words; create a user and sign in as that user in another window with the
password shown; the Escape key, pressed once and many times, and a click outside do not close
the password dialog; after closing it the password is nowhere in the page, nor after leaving
the screen and coming back, nor after signing out with it open; the new user appears in the
book dialog's list; delete the user, whose appointment in the week is then cancelled and whose
next booking is refused; a delete refused or that cannot reach the server is said in the
dialog, which stays open; the tab shown again reads the list again and leaves an open dialog
as it is; as `alice`, the address is not in the navigation and typed by hand shows the week;
everything by keyboard only. Every user the check created is deleted at its end.

**Acceptance:** the common check; and the test of the view shows that the password is gone from
the document after the dialog is closed and after the view is left.

---

### Step 67 — Availability: types and weekly patterns (≈ 6 h)

**Goal:** the Administrator manages the availability types and the weekly patterns.

**Four choices about the screen**, made with the Product Owner before any code (brief
`prompts/90-step-67-implementation.md`; the reasons are in `docs/FRONTEND_ARCHITECTURE.md`
section 11, decisions 89 to 92):

- **Creating is a fixed form, changing is a dialog.** Above each list a form that creates;
  a row's "Rename" (a type) and "Change" (a pattern) open a dialog filled with the current
  values; a row's "Delete" opens the dialog that confirms a deletion (step 66's).
- **The list shows every pattern the server returns**, grouped by weekday. One whose validity
  has ended is marked "ended" and stays, so that it can be seen and deleted: a type used by
  any pattern cannot be deleted. No switch hides anything.
- **"Change" is one call that replaces the pattern's fields.** "From a date on" in two calls
  is not built: the Administrator sets "Valid until" on the old pattern and creates a new one.
- **A pattern's start and end are two lists of the local times on the 15-minute grid**, as
  the book dialog's are for the Administrator; the two dates are native date fields.

Logic: the types list; the patterns grouped by weekday and ordered by time, each with its
type's name joined from the list of types, its validity in words and whether it has ended, in
the calendar's time zone, which is read from the settings; a type's name checked with the
shared schema before any call; a pattern's body from the form's six fields, each field in
fault said with its own sentence, the shared schema keeping the last word; the conflicts list
of a refused change (`availability_conflict`) ready to draw, each appointment with its date,
time and User; the availability screen (its three reads, each list's failure and new try, the
four writes that have a check, the lists read again after every write and when the tab
becomes visible).

View: `availability.view.ts`: the types (create, rename, delete) and the patterns (create,
change, delete), every edit in a dialog or a fixed form, the lists read-only. A refusal and a
failure are shown where the write was asked: in the form that creates, or in the dialog that
asked, which stays open. A refused change shows its conflicts under its failure, in the form
that creates a pattern, in the dialog that changes one and in the dialog that deletes; the
list is taken out of the page at the next try, at the next opening and when the view is
left. One dialog confirms the deletion of a type or of a pattern.

Shell: `#/availability`, Administrator only, after "Users".

**Browser check:** the two lists after three requests; a type's name that is not allowed is
refused under the field with no request, and one that exists by the server, in plain words;
create, rename and delete a type; a type in use cannot be deleted and says why; create a
pattern in hours the others leave free and see its windows in the week, with no reload of
the page; fields in fault are refused under them with no request, and an overlap by the
server; change the pattern, and make one that ends at 24:00; a pattern whose validity ended
is listed, marked, and can be deleted; a change and a deletion that would leave a booked
appointment outside any window are refused and list the appointment in the way, with its
date, time and User in the calendar's zone, and go through once it is cancelled; a write that
cannot reach the server is said where it was asked, and the same button works again; the tab
shown again reads both lists and leaves an open dialog as it is; signing out with a dialog
and a conflicts list on show leaves nothing for the next person; as `alice`, the address is
not in the navigation and typed by hand shows the week; a phone width; everything by
keyboard only. Everything the check created is removed at its end.

**Acceptance:** the common check.

---

### Step 68 — Availability: date overrides and one-off windows (≈ 6 h)

**Goal:** the Administrator changes single dates: "this day only…", "not available", and extra
windows.

**Nine choices about the screen**, made with the Product Owner before any code (brief
`prompts/91-step-68-implementation.md`; the reasons are in `docs/FRONTEND_ARCHITECTURE.md`
section 11, decisions 109 to 117):

- **The date is chosen on the availability screen**: a third part, "A single date", with a
  native date field and "Show", and under it that day as the weekly patterns give it and as
  it is now, with the actions on it. No new address and no new link.
- **"This day only" is put together, then saved in one go.** The button starts a list that
  holds the windows the day has by itself (its own, or the weekly patterns'). A row has
  "Remove" and nothing else; a fixed form, "Start", "End", "Type" and "Add", adds a window.
  Nothing is sent until "Save this day": one request with the whole list. "Discard" drops
  it. No row has a field.
- **"Not available on this day" is a button of its own**, which asks first and then sends
  the day's own windows as none. The extra windows of the day stay, and the question says so.
- **An extra window is created and deleted, not edited.**
- **A date before today, the calendar's, is refused** under the date field; nothing is read
  for it. While the calendar's time zone could not be read "Show" is refused with the
  failure of that read.
- **Two windows of the list that overlap are refused by the page, at "Add"**; windows that
  touch are accepted. An overlap with an extra window of the day is the server's to say.
- **While the list is open, "Show" is refused**; leaving the screen and signing out drop
  the list with no question.
- **The dialog that confirms has neutral words** for everything it confirms, step 67's two
  deletions included: "Please confirm", "Keep", "Confirm". The question says what will happen.
- **The logic of the part is a second object**, with its own stream; the availability
  screen's object hands it what it knows (the types, the patterns, the time zone).

Logic: the date checked before any call, in the calendar's zone; the day as the weekly
patterns give it, from `shared/`'s `definedWindows`, and as it is now, from the calendar view
of that one date; the windows of "this day only" with their checks (the fields, an overlap
among themselves, the limit of 10) and their body ("not available" is the same body with no
window); an extra window's body; the three questions; the second logic object (what it is
handed, the read of a date and its new tries, the five writes, the date read again after
every write to a date, to a type or to a pattern and when the tab becomes visible).

View: `date.view.ts`, mounted beside `availability.view.ts` on the same screen: the date's
form, the day's two descriptions, the windows being put together, the extra windows, and the
conflicts list of step 67 under a refused save and in the dialog that confirms. What the two
views share (the look-up of a form, the choices, the conflicts list, the dialog) is one file,
`availability.parts.ts`.

Shell: the same entry, which mounts both views and starts both objects; a second
`CalendarService` per session, for this part.

**Browser check:** the part with its date field on today and no request; a date shown with
one request, both descriptions the same; an empty date and a past one refused with no
request; "this day only" put together (a remove, two adds, the refusals under the fields)
and saved with one request, then seen in the week, the next week unchanged; edited again
and discarded; an overlap refused at "Add" and one with an extra window by the server;
"not available" after the dialog, and no window that day in the week; back to the weekly
patterns; an extra window added, seen in the week, and one that overlaps refused; with an
appointment on the day, a save, "not available", the way back and an extra window's
deletion each refused with the appointment listed, and going through once it is cancelled;
a write that cannot reach the server said where it was asked, and the same button working
again; a pattern changed while the date is on show; the tab shown again with the list open;
"Show" refused while the list is open; signing out with the list and a conflicts list on
show leaves nothing for the next person, whose page asks for none of these routes; a phone
width; everything by keyboard only. Everything the check created is removed at its end.

**Acceptance:** the common check. Checkpoint: every screen of section 3 exists.

---

### Step 69 — Closing (≈ 4 h)

**Goal:** the view layer is finished as a whole, and the repository says so.

- **The whole walk, twice.** One written list of checks that walks every screen as a User and
  as the Administrator, at a desktop width and at a phone width, run once more from a fresh local
  stack. It is kept in `docs/FRONTEND_ARCHITECTURE.md` or beside it, as the check to repeat after
  a later change.
- **Reading the page without a mouse:** every field has its label, every dialog takes and gives
  back the focus, every failure is announced (`role="alert"`), everything is reachable by
  keyboard.
- **What the code became:** the size of each view file and of `index.html`, the size of the
  built bundle, and the verdict on the fallback: was `lit-html` needed anywhere, and is any view
  close to it.
- **The documents:** `docs/FRONTEND_ARCHITECTURE.md` (status "implemented", what the steps
  changed, the open points that remain, now the only things between the front end and a
  deployment), `README.md`, `CLAUDE.md`, `docs/FOLDER_STRUCTURE.md`.
- **The throw-away material goes:** `prototypes/` is deleted (it is in git history), after
  anything still useful in
  `prototypes/view-plain/LOADING_SEQUENCE.md` has found its place in
  `docs/FRONTEND_ARCHITECTURE.md`.

**Acceptance:** the root `npm run verify` is green (it needs the local stack, and runs the back
end's checks and the front end's); the whole walk passes, line by line; no comment or document in
the repository refers to a deleted file.

---

## 6. Order of work and checkpoints

```
60 foundation ─► 61 week ─► 62 book, cancel ─► 63 note, change ─► 64 my appointments
                                                                        │
        69 closing ◄─ 68 overrides, windows ◄─ 67 types, patterns ◄─ 66 users ◄─ 65 settings
```

The steps are done in this order. Steps 65 to 68 depend only on step 61's shell and texts, so
their order among themselves can change if the review asks for a screen sooner.

Suggested commits: after step 60 (the tooling), after step 64 (everything a User does), after
step 68 (everything the Administrator does), after step 69.

## 7. Risks

| Risk | What is done about it |
|---|---|
| The week view outgrows the plain approach | It is built second, and step 61's report gives its size. The fallback is ready and costs one view (`docs/FRONTEND_ARCHITECTURE.md` section 7) |
| Logic drifts into a view | Logic first in every step (section 4); the review of a step reads the view for anything that is not finding, filling or forwarding |
| A selector in the script and the markup drift apart | Every view's test runs against the real `index.html`; 100 % line coverage means every look-up is executed |
| `happy-dom` does not behave like a browser for something the views use (the native `<dialog>` is the likely place) | Step 60 tries `showModal()`, `close()` and the Escape key in the test environment first, and reports what must be checked in the browser only |
| The changes of a step break an earlier screen | The earlier steps' checks are run again in short at every step (section 4), and all of them at step 69 |
| The local calendar is emptied by the back end's journeys while a browser check is under way | Known (`CLAUDE.md`): the seed of step 61 is run again; never run the journeys during a browser check |
| The screens' design is decided while coding | Steps 63 and 68 name the interaction to approve before any code (step 63's is decided); any other screen whose shape is not obvious gets the same treatment in its step |

## 8. Decisions and assumptions

| # | Decision or assumption | Why |
|---|---|---|
| 1 | The plan is a document of its own, with steps numbered after those of `docs/IMPLEMENTATION_PLAN.md` | Asked by the brief. One numbering keeps "plan step N" unambiguous in briefs and commits |
| 2 | Local only: the plan ends with all the views running against the local stack | Clarification round. Hosting and CORS are a separate discussion |
| 3 | esbuild, `happy-dom`, the views at 100 % line coverage, English only | Clarification round (section 2) |
| 4 | The tooling and the first view are one step | Every step ends with something that runs: tooling alone would not |
| 5 | The week calendar is the second step | The hardest screen first, so that the plain approach is tested where it is weakest |
| 6 | The browser check is a written list per step, not an automated browser test | No end-to-end test tool is in the architecture; adding one is a decision of its own. The DOM tests and the services' journeys cover the two sides the browser check joins |
| 7 | No screen for Hello World | Not among the screens of `docs/SHARED_CALENDAR_SPEC.md` section 16.8; the route proves the back end's chain, which the calendar's screens also exercise |
| 8 | A local seed for the calendar is part of step 61 | A week needs availability to show; the local table starts empty and the back end's journeys empty it |
| 9 | "Sign out" clears the session store only, and a reload signs out | Open points O7 and O3 of `docs/FRONTEND_ARCHITECTURE.md` section 10, outside this plan |
| 10 | The interactions for "change" (step 63) and for a date's override (step 68) are proposed in their step and approved before code. Step 63's was decided with the Product Owner on 2026-11-19 and is written in the step; step 68's, nine choices, on 2026-11-20, written in the step too | They are choices about the screens that no document has made yet |
| 11 | The week is loaded again when the tab becomes visible (step 62); nothing is pushed by the server and nothing is asked on a timer | The API is request and answer only. A reload on coming back to the tab shows other people's bookings at the moment someone looks, with no change to the back end and no call while nobody is looking. Real-time updates over a WebSocket need a second API, a table of connections and a stand-in for the local stack: a feature with its own specification, not a step of this plan |
