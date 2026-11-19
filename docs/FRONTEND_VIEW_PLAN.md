# Front end — The view layer: implementation plan

| | |
|---|---|
| Status | v2 — **under way** (planned 2026-11-16, brief `prompts/82-plan-view-layer-implementation.md`). Step 60 done on 2026-11-19 (brief `prompts/83-step-60-implementation.md`). Step 61 done on 2026-11-19 (brief `prompts/84-step-61-implementation.md`), waiting for review; next step 62 |
| Scope | Everything needed to go from the services layer that exists to **all the views written, tested and running in a browser against the local stack**: the tooling, the shell, the logic layer and one view per screen. Steps 60 to 69 |
| Not in scope | Hosting, the CORS configuration, the Content-Security-Policy of the hosting, logout as a designed service, the session across a reload, the cloud deployment of the front end. They are the open points O1, O2, O3, O5 and O7 of `docs/FRONTEND_ARCHITECTURE.md` section 10 and get their own plan |
| Governed by | `docs/FRONTEND_ARCHITECTURE.md` (the rules of the view layer), `docs/FRONTEND_SERVICES.md` (the services the views use), `docs/SHARED_CALENDAR_SPEC.md` section 16.8 (what the views need), `docs/ARCHITECTURE.md` section 4 (the API). On any conflict with this plan, they win |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-16 | First version: steps 60 to 69. |
| v2 | 2026-11-19 | Step 61, decided before its implementation: "today", for the week the screen opens on, is taken in the default time zone (`DEFAULT_TIME_ZONE` of `shared/`), not in the zone the settings give; the week screen makes no request for the settings. The limit this accepts is in `docs/FRONTEND_ARCHITECTURE.md` section 5.1. Step 61's bullet on "today" and its line on the seed (which also books a few appointments for `alice`) are corrected. |

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
booking or cancellation, whatever its outcome.

View: the book dialog (the slot, the note; for the Administrator the User to book for, from
`GET /users`, and the custom start and end) and the appointment detail dialog (the fields of
`docs/SHARED_CALENDAR_SPEC.md` section 11.5, "Cancel appointment" when the rules allow it, and
why not when they do not). Native `<dialog>` elements; a dialog opened a second time shows
nothing of the first.

**Browser check:** as `alice`: book a slot with a note, see it in the week, open it, cancel it;
a note with `<b>` in it is shown as text; a slot taken in the meantime is refused in plain words
and the week is refreshed; a slot too late to book and an appointment too late to cancel say so.
As `admin`: book for `alice`; book a custom start and end; cancel anyone's appointment. The
Escape key closes a dialog.

**Acceptance:** the common check.

---

### Step 63 — Editing the note and changing an appointment (≈ 5 h)

**Goal:** the appointment detail is complete: note and change, enabled according to the rules.

To settle first, before any code, and to propose for approval: **how a change is made on the
screen.** The service takes the appointment's id and the new appointment's fields, the same as a booking's
(`AppointmentsService.change`). The
proposed direction: "Change" in the detail closes the dialog and puts the week in a "choose the
new slot" state, shown by a banner with "Keep the appointment as it is"; the next free slot
clicked is the new time, confirmed in a dialog that shows the old and the new one. Which
appointment is being moved is state of the logic layer, not of the view.

Logic: which actions the detail offers (the status, the end, the role, `cancellableUntil`); the
"moving an appointment" state of the week screen; the reload after a note or a change.

View: the note edited in the detail dialog's own fixed form
(`docs/FRONTEND_ARCHITECTURE.md` section 3, rule 4); the change as approved.

**Browser check:** edit a note, empty it, leave it unchanged; change an appointment to another
slot and see the old one gone; a change refused (the new slot too close, the old one too late to
change) says why and leaves the old appointment; giving up the change leaves everything as it
was; as `admin`, change another person's appointment.

**Acceptance:** the common check.

---

### Step 64 — My appointments (≈ 4 h)

**Goal:** a User sees the list of their upcoming appointments and their history.

Logic: the list ready to draw (date, time, type, note, status in words); the two modes, upcoming
(`upcoming=true`) and history (`status=all` with a range), and the range's own checks.

View: `appointments.view.ts`, a list rebuilt at every notification, with no input field inside
it; a row opens the detail dialog of steps 62 and 63, which is used from two screens: the step
moves what the two share out of the week view, without changing what step 62 and 63 checked.

Shell: the second address, `#/appointments`, for the User only. This is the first step with two
screens: the navigation, leaving a view and coming back to it are checked here.

**Browser check:** the upcoming list; an empty list says so; the history over a range shows a
cancelled and a changed appointment with their status; cancel from the list, and the list
follows; go to the week and back, twice, and nothing is left over or doubled; as `admin`,
`#/appointments` typed by hand shows the week.

**Acceptance:** the common check.

---

### Step 65 — Settings (≈ 3 h)

**Goal:** the Administrator reads and changes the four settings. The first of the
Administrator's forms, and the simplest.

Logic: the settings as the form shows them, with the defaults and the ranges from `shared/`; what
is sent when the form is saved.

View: `settings.view.ts`, one fixed form. Shell: `#/settings`, Administrator only.

**Browser check:** the current values; a value out of range is refused with the field named and
no request sent; a saved value is there after signing out and in; as `alice`, the address is not
in the navigation and typed by hand shows the week; a booking then follows the new notice or
horizon. The values found before the check are put back.

**Acceptance:** the common check.

---

### Step 66 — Users (≈ 4 h)

**Goal:** the Administrator lists, creates and deletes users.

Logic: the list ready to draw; the username checked with the shared schema.

View: `users.view.ts`. Creating a user shows the generated password **once**, in a dialog, with
the sentence that it cannot be shown again. The password is the one exception of
`docs/FRONTEND_SERVICES.md` section 2, rule 6: the view puts it on the screen with `textContent`,
never logs it, never puts it in the address, and removes it from the page when the dialog is
closed and when the view is left. Deleting asks for confirmation and says that the user's future
appointments are cancelled.

Shell: `#/users`, Administrator only.

**Browser check:** create a user and sign in as that user in another window with the password
shown; a username that is not allowed and one that exists are refused in plain words; delete the
user, whose appointment in the week is then cancelled; after closing the dialog the password is
nowhere in the page; the new user appears in the book dialog's list.

**Acceptance:** the common check; and the test of the view shows that the password is gone from
the document after the dialog is closed and after the view is left.

---

### Step 67 — Availability: types and weekly patterns (≈ 6 h)

**Goal:** the Administrator manages the availability types and the weekly patterns.

Logic: the types list; the patterns grouped by weekday and ordered by time; a pattern's body from
the form, checked with the shared schemas; the conflicts list of a refused change
(`availability_conflict`) ready to draw, each appointment with its date, time and User.

View: `availability.view.ts`: the types (create, rename, delete) and the patterns (create,
change, delete), every edit in a dialog or a fixed form, the lists read-only. A refused change
shows its conflicts.

Shell: `#/availability`, Administrator only.

**Browser check:** create, rename and delete a type; a type in use cannot be deleted and says
why; a duplicate name is refused; create a pattern and see its windows in the week; change and
delete it; a change that would leave a booked appointment outside any window is refused and lists
the appointments in the way.

**Acceptance:** the common check.

---

### Step 68 — Availability: date overrides and one-off windows (≈ 6 h)

**Goal:** the Administrator changes single dates: "this day only…", "not available", and extra
windows.

To settle first and to propose for approval: where a date is chosen. The proposed direction: a
date field on the availability screen that shows that day as the patterns give it and as it is
now, with the actions on it; no new address.

Logic: a date's defined and effective windows from `shared/`'s rules; an override's body
("not available" is an override with no window); a one-off window's body; a past date refused
before sending.

View: on the availability screen, the per-date editor and the one-off windows of the date, with
the conflicts list of step 67.

**Browser check:** set "this day only" windows and see them in the week; set "not available";
remove the override and the patterns are back; add and delete a one-off window; a past date is
refused; an override that would leave an appointment uncovered is refused with its conflicts.

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
| The screens' design is decided while coding | Steps 63 and 68 name the interaction to approve before any code; any other screen whose shape is not obvious gets the same treatment in its step |

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
| 10 | The interactions for "change" (step 63) and for a date's override (step 68) are proposed in their step and approved before code | They are choices about the screens that no document has made yet |
