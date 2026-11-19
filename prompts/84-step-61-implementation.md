## Brief

Implement plan step 61, "The week calendar, read-only" (`docs/FRONTEND_VIEW_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review. One stop at the end. The design points are already decided (see "Design points"): there
is no early stop for them.

This step creates the logic layer (`frontend/src/logic/`), the first real screen (the week) and
the navigation by the URL's hash. At its end both roles sign in, see the week of today in the
calendar's time zone and move between weeks, in a browser, against the local stack. Slots and
appointments are drawn but do nothing yet. It changes nothing in `backend/`, `shared/` or
`frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry, the commands `dev` and `build`, and the test conventions
    for the views;
  - the notes on the local `calendar` table: who empties it and when.
- `docs/FRONTEND_ARCHITECTURE.md` v2, all of it. It is the source of truth for this step: the
  layers (section 2), the thirteen rules of a view (section 3), the shape of a view with its
  lists and templates (section 4), the logic layer and its seven rules (section 5), the shell
  (section 6, point 6 above all), the fallback and its three conditions (section 7), the tests
  (section 8), the tooling (section 12).
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4 (how the steps are run, what every step does),
  step 61, and step 62 to see what this step must leave ready.
- `docs/SHARED_CALENDAR_SPEC.md`: section 16.8 (what the week needs), section 11.6 (the view the
  server builds for each role), R-SLOT-01 (the night the clocks go back), section 16.3.
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules), section 18 (`CalendarService`; 18.6 above
  all), section 10.2 (the failure reasons every API service shares).

Then read the code this step builds on:
- `frontend/src/views/shell.ts`, `login.view.ts`, `frontend/src/main.ts`, `frontend/index.html`,
  `frontend/style.css`, and their tests in `frontend/tests/unit/views/` (`page.ts` first).
- `frontend/src/services/`: `calendar.service.ts` and `calendar.types.ts`, `api.ts` (the
  transport failure reasons), `login.types.ts` (the login's reasons).
- `shared/src/calendar/`: `time.ts`, `types.ts` (`CalendarView`, `CalendarDay`, `Appointment`),
  `defaults.ts`.
- `frontend/tests/unit/services/calendar.service.test.ts` for the conventions of a test with
  streams, and `frontend/tests/unit/services/fixtures.ts`.
- `frontend/scripts/dev.mjs` and `bundle.mjs`.
- `prototypes/` (throw-away): `common/logic.ts`, `view-plain/calendar.view.ts`, the calendar part
  of `view-plain/index.html` and of `common/style.css`, `seed.mjs`, and findings of
  `prototypes/README.md`. Take what is right; do not import from it, and do not copy what the
  documents or this brief say differently (the prototype's "today" in a default zone, its
  appointment handling of steps 62 and later, its cancel hints).

## Where we are (2026-11-19)

- Step 60 is committed and pushed (`e91c476`): the build and the dev server, the shell without
  navigation, the login view, the `views` test project, the two lint rules. Check
  `git status -sb` rather than trusting this line.
- `frontend/src/logic/` does not exist. The frame of `index.html` has an empty `nav.nav` and an
  empty `main.screen`. In `shell.ts`, `enter(person)` fills the header and returns the
  subscription that everything of one person's session is added to.
- The bundle is 490 kB, 454 of them `zod` (`docs/FRONTEND_ARCHITECTURE.md` section 12.1). Known,
  not decided, not this step's task.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is still to do and is independent
  of this step. Do not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Design points

Decided with me on 2026-11-19, one by one. Apply them as written; if the code proves one wrong,
stop and say so with a proposal.

**One of them changes the plan.** `docs/FRONTEND_VIEW_PLAN.md` step 61 says that "today" is taken
in the calendar's time zone as the settings give it, not from a default zone. Decided otherwise
(point 3): "today" is taken in `DEFAULT_TIME_ZONE`. The step corrects that bullet of the plan
(a v2 line in its change log) and does not follow it.

1. **Three files in `frontend/src/logic/`**, each with its test in `frontend/tests/unit/logic/`
   (vitest project `unit`, in node, no DOM):
   - `texts.ts`: pure functions. A date ("Mon 16 Nov"), a time ("09:00"), a range
     ("09:00–10:00"), a week's label ("16 Nov – 22 Nov 2026"), a UTC offset ("+02:00"), and a
     failure in plain words.
   - `week.model.ts`: pure. `weekModel(view, role)`: a `CalendarView` in, the week ready to draw
     out.
   - `week.screen.ts`: the class `WeekScreen`, shaped like a service
     (`docs/FRONTEND_ARCHITECTURE.md` section 5).
2. **"Now" is passed in.** `WeekScreen` receives a function `now: () => Date` through its
   constructor (the shell passes `() => new Date()`); nothing in `logic/` reads the clock by
   itself. The model's "today" and everything about one loaded week come from the view's own
   `generatedAt`.
3. **"Today" is taken in `DEFAULT_TIME_ZONE`** (`Europe/Rome`, from `shared/`): the week on
   screen at the start, and the one "Today" returns to, is the week of `now()` in that zone.
   `WeekScreen` receives the `CalendarService` only; no request is made for the settings, and
   the first week is loaded at once. This is the one place the default zone is used: every time
   and date of a loaded week is shown in the zone the server names (`view.timeZone`), and the
   day marked as today comes from the view's `generatedAt` in that zone. Known limit, to write
   in `docs/FRONTEND_ARCHITECTURE.md`: with a calendar deployed in another zone, around
   midnight the screen can open on the neighbouring week.
4. **Dates and times go through `shared/`'s helpers only** (`localDateOf`, `localTimeOf`,
   `addDays`, `weekdayOf`, `toInstant`). A date is turned into words with `Intl.DateTimeFormat`
   reading it as UTC, so the browser's zone plays no part. The tests of `logic/` run with a
   browser zone that is not the calendar's (`TZ` set for the test, or the cases written so that a
   leak would show): say in the report how this is proved.
5. **The UTC offset of an instant is derived from the helpers**: the local date and time read as
   if they were UTC, minus the instant. `shared/` is not changed. If this proves fragile, stop
   and say so: the alternative is a helper in `shared/`, which is a change of its own.
6. **The night the clocks go back.** On a day in which the calendar zone's offset changes
   (either direction), every time shown in that day carries its offset ("02:00 +02:00"); on
   every other day none does. Blocks are placed by their local clock time. Two blocks of the same
   kind that the clock puts in the same place (the repeated hour) are drawn side by side, each
   half the width, the earlier on the left: the model says so (`lane` 0 or 1 of `lanes` 2), the
   view only applies it. The night the clocks go forward needs nothing: no block exists in the
   missing hour.
7. **The week model**, per day: its date, its label, whether it is today; its windows (type
   name, colour), its free slots, its busy blocks, its appointments; each block with `top` and
   `height` as percentages of the hours shown, and its time as text. For the week: the time
   zone's name, the labels of the hours shown (08:00 to 18:00, widened to whole hours to hold
   everything in the week), and the legend (the types met in the week, by name). A type's colour
   is a number from its id, the same in every week, applied as a class (`type-0` … `type-5`)
   that the style sheet defines: no colour is computed at run time.
8. **Who an appointment is for.** For the Administrator every appointment carries its User's
   name. For a User the own appointments say "You", and other people's time is a busy block with
   no name: that is what the server sends (`docs/SHARED_CALENDAR_SPEC.md` section 11.6), and the
   model adds nothing to it.
9. **`WeekScreen`**: `week$` (the label, loading, the failure in plain words or `null`, the
   last week loaded or `null`), `start(): Subscription`, `previous()`, `next()`, `today()`. A
   change of week loads at once; while it loads, the last week stays, with `loading` true and
   the new label. A failed load keeps the last week and carries the failure. A second failure
   replaces the first; a success removes it. It does not listen to bookings or cancellations
   yet: that reload is step 62's.
10. **Failures in plain words**: one function in `texts.ts`, from a failure's `reason` to a
    sentence, for the reasons a person can meet in this step: the transport reasons every API
    service shares, the codes of `GET /calendar`, and the login's reasons. The raw technical
    text is never shown: a reason without a sentence falls back to one general sentence, never to the
    service's `message`, which is written for a developer. The login view uses it too (the
    interim of `docs/FRONTEND_ARCHITECTURE.md` section 12.4 ends): the example of section 4 is
    brought in line. A wrong password and an unknown user get the same sentence. Give the full
    table of reasons and sentences in the report: I review the words.
11. **The week view** (`frontend/src/views/week.view.ts`):
    `mountWeek(root, screen): Subscription`, with `WeekDeps`, the part of `WeekScreen` it uses.
    The `<template>` elements of a day, a window, a busy block, a slot and an appointment are in
    `index.html`. Slots and appointments are plain elements, not buttons: they become buttons
    when they do something (step 62). A position is set as a property (`element.style.top`),
    never as an attribute. The view redraws the days only when the week object changed, not at
    every notification. Its teardown empties the legend, the hours and the days, and resets the
    label, the loading mark and the failure.
12. **The screen's element** is inside `main.screen` of the frame, with its own `id`, hidden
    until the shell shows it. On it: previous, "Today", next, the week's label, "Loading…", the
    failure (`role="alert"`), the time zone in a sentence, the legend, the week. While loading,
    the week is dimmed by a class. At a phone width the days scroll sideways, one at a time.
13. **The navigation** (`docs/FRONTEND_ARCHITECTURE.md` section 6, point 6):
    - a table of screens in `shell.ts`: the hash, the label, the roles that may see it, and how
      it is mounted. One entry in this step: `#/week`, "Week", both roles. Step 64 must be able
      to add an entry without touching the rest: say in the report how;
    - the hash is read as a stream (`fromEvent(window, 'hashchange')`, starting from the current
      hash). An empty, unknown or forbidden hash shows the role's first screen and the address
      is corrected to it without adding a step to the browser's history;
    - the navigation's links are copies of a `<template>`, filled per role when a person enters
      and removed when the person leaves; the link of the screen on show is marked
      (`aria-current="page"`);
    - a change of hash leaves the current screen (unsubscribe, hide) and mounts the next;
    - signing out leaves the address as it is; the next person starts from the role's first
      screen if the hash is not theirs to see.
14. **New services and logic objects for every session** (`docs/FRONTEND_ARCHITECTURE.md`
    section 6, point 4): `enter(person)` creates the `CalendarService` and the `WeekScreen`;
    the order is mount, then `start()`
    (section 6, point 5). `ShellDeps` gains what this needs (the API's configuration, the whole
    store). The shell's test keeps using the real page, the real store and a stubbed `fetch`.
15. **The local seed**: `frontend/scripts/seed-local.mjs`, script `seed:local`
    (`npm run seed:local -w frontend`). Node only, no dependency. Through the local API as the
    seeded Administrator:
    - two types, **"Studio"** and **"Piscina"**, and a few weekly patterns of each, valid for 60
      days from today, so that the dates the front end's integration journeys use (from today +
      330 days) stay free;
    - a few appointments for `alice` on free slots of the week of today and of the next one,
      some with a note, chosen among the slots the current settings allow (it reads the slots
      from `GET /calendar` and changes no setting). If the settings leave no slot to book, it
      says so and goes on.

    It only adds; it does nothing at all when the type "Studio" already exists; it refuses any
    address but `localhost` and `127.0.0.1`; it prints what it created and never a token or a
    password. Appointments cannot be deleted through the API: after the back end's journeys
    empty the table the seed is run again and books again, which is fine on an emptied table.
16. **Tests.** The logic: every function and every path of `WeekScreen`, with fake services
    (subjects, spies) and a fixed "now"; most of the step's cases are here. The view: the real
    `index.html`, a fake `WeekScreen`. The shell: the navigation. Everything inside the 100 %
    line coverage; `src/main.ts` stays the one file left out.

## The step

Only what `docs/FRONTEND_VIEW_PLAN.md` step 61 lists.

- **Logic:** `texts.ts`, `week.model.ts`, `week.screen.ts`, with their tests. The tests include:
  - a week in `Europe/Rome` in winter and one in summer; a calendar zone that is not
    `Europe/Rome` (one with a half-hour offset); a browser zone far from the calendar's;
  - the week of 2027-10-31 (the clocks go back): two slots at 02:00 an hour apart, told apart by
    their offset and placed side by side; the week of 2027-03-28 (forward);
  - a window ending at 24:00; a week with nothing in it; hours widened before 08:00 and after
    18:00;
  - both roles: names for the Administrator; "You" and busy blocks for a User;
  - `WeekScreen`: the first week is the one of "now" in `DEFAULT_TIME_ZONE`, also when the
    browser's zone and "now" put the browser's own date in another week; previous, next, today;
    the last week kept while loading and after a failure; a failure, then a load that succeeds;
    a week that starts in one month or year and ends in the next; nothing loaded before
    `start()` and nothing after its subscription ends.
- **Markup and styles:** the week's element and its five templates, the navigation's template,
  in `frontend/index.html`; the week, the navigation and the six type colours in
  `frontend/style.css`. No inline script, style or handler (`page.test.ts` keeps passing; extend
  it where the page gained something to check).
- **The view:** `week.view.ts` and its DOM test: every state of `week$` (nothing yet, loading
  with and without a week, a week, a failure with and without a week); the three buttons and
  their calls; a type name, a username and a note containing `<script>` shown as text; the
  positions and the lanes applied; a second week replaces the first with nothing left of it;
  after unsubscribing nothing is left in the page.
- **The login view:** the failure in plain words (design point 10), its test adjusted. This is
  the one existing test that changes; say exactly what changed in it.
- **The shell:** the navigation and the per-session objects, and its test: the first screen for
  both roles; an unknown hash; a change of hash; the link marked; sign out and in as another
  person (no link, no week, no name of the first left in the document); a refreshed session
  loads nothing again and redraws nothing.
- **The seed:** `seed-local.mjs`, run once against the local stack; run a second time to show it
  adds nothing. Say what the local table held before (if "Studio" is already there from the
  prototype's seed, tell me before doing anything about it).
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v3: section 4 (the login example, and the week's templates
    as built if they differ from the sketch), section 5 (the logic layer as built: the three
    files, "now" passed in, "today" in the default zone and its limit, the offset rule),
    section 6 (the table of screens, the hash), section 9, section 10 (**a new open point, O9**:
    the size of the bundle, 454 of 490 kB being `zod`, 264 of them its messages in other
    languages; slimming it means changing how `shared/` brings `zod` in; to settle before the
    first deployment; blocks nothing locally), section 12.4 (the interim ended), the decisions
    table, the status line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: step 61's bullet on "today" corrected (design point 3), a v2
    line in the change log, and the status line (step 61 done, with its date).
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7.
  - `CLAUDE.md`: the command `seed:local`, the folder map's `frontend/` entry, the test
    conventions for the logic layer.
  - `README.md`: the seed, in a line or two, in "The page, locally".

Not in this step:
- booking, cancelling, any dialog, any click on a slot or an appointment (step 62 onwards);
  the reload after a write; `AppointmentsService` and `UsersService` in the shell;
- a second screen or a second address;
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- the size of the bundle and `zod`, beyond recording the open point O9;
- any request for the settings: `CalendarSettingsService` enters the shell with its screen
  (step 65);
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so before writing a workaround;
- hosting, CORS on the API, logout as a service, the session in `sessionStorage`;
- deleting `prototypes/` (step 69);
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, after `npm run seed:local -w frontend`,
at a desktop width and at a phone width. The first call of each route takes a few seconds under
`sam local`: wait for it, do not count it as a failure.

Step 60 again, in short:

1. the page loads with only the login; a wrong password shows a sentence in plain words and
   leaves the form usable.

Step 61:

2. `alice` signs in: the address becomes `#/week`, the navigation shows "Week" marked as
   current, and the week of today is on screen with its windows, its free slots, the legend and
   the time zone named;
3. "Loading…" is shown and the week dimmed while a week loads (hold the call back to see it);
4. next, previous and "Today": the label and the days follow; the last week stays on screen
   while the next one loads;
5. the check creates a throw-away user through the API and books one appointment for it in
   the week on screen, beside `alice`'s from the seed. As `admin`: both are shown with their
   names;
6. as `alice`: her own appointments say "You"; the other one is a busy block with no name, and
   the other user's name is nowhere in the document. At the end the check deletes the
   throw-away user (which cancels its appointment); say what stays in the local table as
   history;
7. an unknown hash (`#/nothing`) and an empty one show the week and the address is corrected;
   the browser's back button does not get stuck on it;
8. with the local API unreachable (hold the call back and fail it, or ask me to stop
   `local:api`): the failure in plain words, the last week still on screen; reachable again,
   "Today" or a change of week recovers;
9. at the phone width the days scroll sideways and nothing else makes the page wider than the
   screen;
10. sign out, sign in as the other role: nothing of the first person's week in the document;
11. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; the network panel shows no request to another origin; no `style`
    attribute was refused by the policy.

The night the clocks go back is checked by the unit tests only (the seed's patterns end long
before 2027-10-31): say so in the report rather than building data for it.

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local `calendar` table:** the seed and the browser check write to it. Never run the back
  end's integration journeys in this step (they empty the table), nor the front end's while the
  browser check is under way. Remove what the check created where the API allows it, and list
  what stays.
- **Hard rules:**
  - the thirteen rules of a view and the seven rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no date
    arithmetic and no rule in a view;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log;
  - the existing tests keep passing unchanged, except the login view's one case of design
    point 10; if another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - the scripts run on macOS and Linux with node only;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 61)

- The design points applied as written (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with step 60's in short.
- The report says how long `week.view.ts` is (lines, and how many of them look nodes up), how
  long `index.html` became, and whether any condition for the fallback
  (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came close.
- The table of failure reasons and their sentences.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 60's.
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 62.
