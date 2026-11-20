## Brief

Implement plan step 68, "Availability: date overrides and one-off windows"
(`docs/FRONTEND_VIEW_PLAN.md`), following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review.

One stop at the end. Nine choices about the screen were made with me while this brief was
written (section "Settled before the first line of code"); they are the proposal that the plan
asked for before any code, approved. There is no early stop.

This step gives the availability screen its third part, "A single date": the Administrator
chooses a date, sees that day as the weekly patterns give it and as it is now, and changes it:
"this day only" windows (a date override), "not available", back to the weekly patterns, and
extra windows (one-off windows). It is the last screen of the plan: after it every screen of
`docs/FRONTEND_VIEW_PLAN.md` section 3 exists. It is also the step that decision 107 of
`docs/FRONTEND_ARCHITECTURE.md` warned about: an override is a list of windows sent whole, and
the fallback's first condition (input fields in a redrawn region) is one design slip away. The
settled points keep it out; design point 10 watches it. It changes nothing in `backend/`,
`shared/` or `frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the availability screen as built), the commands `dev`,
    `build` and `seed:local`, and the test conventions for the logic layer, the views and the
    shell (the paragraph on a list, `<select>`, in a test above all).
- `docs/FRONTEND_ARCHITECTURE.md` v9, all of it. It is the source of truth for this step: the
  thirteen rules of a view (section 3; rules 3, 4, 9, 10 and 12 above all), the shape of a
  view (section 4: "The availability: a form that creates, a dialog that changes", "The
  conflicts list" with what this step reuses, "One dialog confirms the deletion of a type or
  of a pattern"), the logic layer (sections 5 and 5.1: the availability screen), the shell
  (section 6), the fallback and its three conditions (section 7), the tests (section 8),
  decisions 89 to 108, and 107 above all.
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 68, and step 69 to see what this step
  must leave ready (the closing: the whole walk, the sizes, the verdict on the fallback).
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules; rule 6 on personal data), section 17, all
  of it (`AvailabilityRulesService`: this step uses `setOverride`, `deleteOverride`,
  `createWindow` and `deleteWindow`; 17.7 on `conflicts`), section 18, all of it
  (`CalendarService`: `load(from, to)`, `reload()`, one pair of streams and one pending call),
  section 10.2, and section 8, decisions 31, 32 and 33.
- `docs/SHARED_CALENDAR_SPEC.md`: sections 6.3 and 6.4 (R-OVR-01 to R-OVR-03, R-ONE-01 to
  R-ONE-03), 6.5 (how the sources combine; R-AV-01 and R-AV-02: the past), 6.6 (effective
  windows), 6.7 (the conflict rule; R-AV-04: a new window never conflicts), 11.6 (the calendar
  view: `hasOverride`, and `source` and `sourceId` of a window, for the Administrator only),
  16.3 and 16.8, the row "Availability management".
- `docs/ARCHITECTURE.md` section 4: the four routes of the overrides and of the one-off
  windows with their codes, and the paragraph "The past" under them.

Then read the code this step builds on:
- `frontend/src/services/`: `availability-rules.service.ts` and `.types.ts` (the four methods
  and their states), `calendar.service.ts` and `calendar.types.ts`.
- `shared/src/calendar/`: `schemas.ts` (`WindowBody`, `OverrideBody`, `OneOffWindowBody`,
  `DateParam`, `LocalDate`), `types.ts` (`DateOverride`, `OneOffWindow`, `CalendarDay`,
  `CalendarWindow`, `WindowSource`), `rules.ts` (`definedWindows`, `toInstantWindows`,
  `effectiveWindows`), `defaults.ts` (`CALENDAR_LIMITS`: 10 windows of an override and 10
  one-off windows per date), `time.ts`.
- `frontend/src/logic/`: `availability.model.ts`, `availability.screen.ts` and `conflicts.ts`
  (what step 67 built, and what it left to reuse), `texts.ts` (`failureText` and `Attempt`;
  `dateText`, `longDateText`, `rangeText`), `appointments.model.ts` (`periodRefusal`: a date's
  own checks before any call), and their tests in `frontend/tests/unit/logic/`.
- `frontend/src/views/`: `availability.view.ts` (all of it), `shell.ts` (`SCREENS`,
  `sessionObjects`), and their tests in `frontend/tests/unit/views/` (`page.ts` first; in
  `shell.test.ts` the block of the availability and the test of a second person).
- `frontend/index.html` (the element `#availability`, its templates and its three dialogs)
  and `frontend/style.css`.
- `frontend/scripts/seed-local.mjs`: what the local calendar holds.

## Where we are (2026-11-20)

- Step 67 is committed and pushed (`9bdf61d`): the availability types and the weekly patterns.
  `npm run verify -w frontend` is green (1826 tests, 100 % lines); the root `lint` and
  `typecheck` too. Check `git status -sb` rather than trusting this line.
- What step 67 left for this step:
  - **the conflicts list**: the markup (`.conflicts` with `.conflicts-count` and
    `.conflicts-list`), `tpl-conflict`, `conflictList` in `logic/conflicts.ts`, the view's
    `showConflicts`, and `AvailabilityScreen.conflicts(…)`. Reuse them as they are;
  - **one dialog that confirms a deletion** (`dialog.delete` of `#availability`): what it is
    about is `{ kind, id }`, its words come from the logic layer, its state from the service
    of its kind. This step gives it more kinds, not a second dialog;
  - **the lists of times** (`START_CHOICES`, `END_CHOICES`), `typeChoices`, `tpl-choice`, and
    how a list keeps what is chosen when its choices are rebuilt;
  - **what a write says** (`Ask`, with `about`), and the rule that a second write of a kind
    is not taken while one is under way;
  - the screen already reads the settings (for the calendar's time zone and "today"), the
    types and the patterns, and reads the two lists again after a write and when the tab
    becomes visible;
  - `failureText` has no sentence for `date_in_past`, `override_not_found` and
    `window_not_found`, and `limit_reached` has no words for a one-off window. Verify, do not
    assume;
  - `availability.view.ts` is 282 lines, 36 of which look a node up; the week's is 312.
    `index.html` is 485 lines;
  - the status line of `docs/FRONTEND_VIEW_PLAN.md` still says step 67 is "waiting for
    review". It was reviewed: this step's edit of that line takes those words out.
- What the review of step 67 left as built, unless I say otherwise before you start: a
  pattern's hours written "09:00 – 13:00" and an appointment's time "09:00–10:00" (decision
  106); the pattern form reset after a create (decision 103); the words of the sentences.
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina"; 8 patterns
  valid 2026-11-20 to 2027-01-19 (Studio 09:00–13:00 Monday to Friday, Piscina 15:00–18:00
  Tuesday and Thursday and 10:00–12:00 Saturday); 4 appointments of `alice` (2026-11-21 10:00
  Piscina, 2026-11-23 11:00, 2026-11-25 09:00 and 2026-11-26 10:00 Studio) and cancelled ones;
  the default settings (24, 0, 56, no limit); no override and no one-off window. The users
  are `admin` and `alice`. Look before relying on it (read-only, through the API). The table
  is in memory: at the start of step 67 it was empty, and I was asked before the seed.
- The Codespace has no browser. The checks of steps 60 to 67 ran in Playwright's headless
  Chromium, installed outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
  Lessons from those checks:
  - read what a person can see and the values of the form fields, not the page's source;
  - give every name the check writes a tag of its run;
  - run the whole script once it is right, not many times: each run leaves history;
  - remove what the run made in a `finally`, through the API, whatever happened;
  - the browser reports every 4xx answer as a console line "Failed to load resource", which
    is not an error of the page;
  - a field the script filled stays filled: put every field back before the next case;
  - a modal dialog keeps "Sign out" out of reach: press it by script to stand for a session
    that ends by itself;
  - the tests' environment applies no style: a layout that breaks is seen in the browser
    only (step 67's pattern row needed a grid after the first look).
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Settled before the first line of code

Nine choices that no document had made: four about how the screen works, five about its
details. Apply them as written.

1. **The date is chosen on the availability screen.** A third part of `#/availability`, under
   its own heading, "A single date": a native date field and "Show". Under it, that day as
   the weekly patterns give it and as it is now, with the actions on it. No new address and
   no new link of the navigation.
2. **"This day only" is a draft, then one save.** The button starts a draft that holds the
   windows the weekly patterns give that day (or, on a day that has an override, the
   override's own). A row of the draft has "Remove" and nothing else; a fixed form, "Start",
   "End", "Type" and "Add", adds a window to the draft. Nothing is sent until "Save this
   day": one `setOverride` with the whole list, which the server judges whole. "Discard"
   drops the draft. No row has a field.
3. **"Not available on this day" is a button of its own**, which asks first, in the dialog
   that confirms a deletion ("Keep" first), and then sends the override with no window. The
   one-off windows of the day stay (`docs/SHARED_CALENDAR_SPEC.md` R-OVR-03), and the
   question says so.
4. **A one-off window is created and deleted, not edited.** A fixed form adds one to the
   date; its row has "Delete", which asks first. "Edit" as two calls
   (`docs/SHARED_CALENDAR_SPEC.md` R-ONE-02) is not built.
5. **A date before today is refused**, under the date field, with one sentence that a past
   date cannot be changed. Nothing is read and nothing is shown for it. "Today" is the
   calendar's. The week shows what a past day had. While the calendar's time zone could
   not be read, "today" is not known and "Show" is refused with the failure of that read,
   until a new try succeeds.
6. **Two windows of a draft that overlap are refused by the page, at "Add"**: the second
   window does not enter the draft, and the sentence stands under its "Start" and "End".
   Windows that touch (one ends where the next starts) are allowed, whatever their types
   (`docs/SHARED_CALENDAR_SPEC.md` R-AV-01). The page compares the draft's own windows with
   each other and nothing else: an overlap with a one-off window of the day is the server's
   to say, at "Save this day".
7. **While a draft is open, "Show" is refused**: one sentence says to save or discard the
   day's changes first, and no other date is read. A draft can hold several steps of work
   and is not lost by a slip. Leaving the screen and signing out still drop it with no
   question, like everything typed and not saved.
8. **The dialog that confirms has neutral words, for every case**: its heading "Please
   confirm", its buttons "Keep" and "Confirm". What will happen is in the question, which
   the logic layer makes ("Delete the type Studio? …", "Make Monday 23 November 2026 not
   available? …"). Step 67's two deletions get the new words too: "Confirm the deletion" and
   "Delete" go from the dialog. A row's own button keeps saying "Delete".
9. **The logic of the new part is a second object**, a class of its own with its own stream.
   `AvailabilityScreen` reads the types, the patterns and the settings once, as it does, and
   gains one small output with what the new object needs of them (the types, the patterns,
   the calendar's time zone); it gains nothing else. Each of the screen's two views listens
   to its own object.

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new code goes.** The same screen, one more part; the plan names one view file
   and step 67's is close to the week's size. So:
   - the view of the new part is a second mount function in a file of its own (propose the
     name), mounted by the one entry of `SCREENS` beside `mountAvailability`, on the same
     element or on the part's own: say which and why. `availability.view.ts` changes only
     where the two must meet (the delete dialog, if it is shared: design point 6);
   - the logic is a pure file for a date (its windows, its draft, its checks, its words) and
     a second class (settled point 9): one public stream, `void` methods, nothing started by
     the constructor. It reads nothing that `AvailabilityScreen` already reads: it is handed
     that object's new output. Say in the report what that output is, when it notifies, and
     how the two objects are started and ended by the one entry of `SCREENS` (the order
     matters: the first must be listening before the second asks). `AvailabilityScreen`'s
     existing stream, state and tests do not change.
2. **What the part reads.**
   - **The day as it is now** comes from `GET /calendar` for that one date
     (`CalendarService.load(date, date)`), as the Administrator: `hasOverride`, and each
     window with its `source` and `sourceId`. Overrides and one-off windows have no list
     route (`docs/FRONTEND_SERVICES.md` section 17.1).
   - **A `CalendarService` of its own.** The service has one pair of streams and one pending
     call, and `reload()` runs its last range again: the week's must not be asked for a
     single date. `sessionObjects` creates a second instance for this part. No change to the
     service.
   - **The day as the weekly patterns give it** is computed in the logic layer from the
     patterns the screen already holds, with `shared/`'s `definedWindows(date, patterns,
     null, [])`: no rule written a second time.
   - Nothing is read until a date is shown. "Show" with the same date reads again. The date
     field starts on today, the calendar's, set from the stream; nothing is shown for it
     until "Show" is pressed, or propose otherwise.
   - **Read again**: the date on show after every result of the four writes of this part, a
     failure included (`docs/SHARED_CALENDAR_SPEC.md` section 16.3); after every result of a
     write to a pattern or to a type, since the day follows them; and when the tab becomes
     visible. Not for a result that was already there at `start()`. A read that fails is
     said in the place of the day, with "Try again", and the day that could not be read
     again is taken off the screen.
   - The appointments of the day are not shown here: the week shows them.
3. **The date is checked in the logic layer, before any call.** Not a date, or empty: refused
   under the field. Before today, the calendar's today: refused under the field (settled
   point 5), with no request. Test "today" in the calendar's zone at a "now" at which the
   calendar's date and the machine's differ. **While the calendar's zone is not known** (the
   settings are not read yet, or could not be read) no date can be judged, so "Show" is
   refused: no request is made, and under the date field stands the sentence of the failed
   read of the settings, the one step 67 shows in the place of the patterns' list (while
   the settings are still being read, propose the words). "Show" works again once the
   settings are read: after the "Try again" of the patterns' list succeeds, or when the tab
   is shown again. The sentence goes when the zone is known.
   `date_in_past` from the server (a page left open over midnight) is a failure said in
   plain words, like any other.
4. **The day, as words.** One function makes what the part shows for a date:
   - the date in words, with its weekday and its year;
   - **as the weekly patterns give it**: the windows, in order, each with its hours and its
     type; or the sentence that the patterns give nothing that day;
   - **as it is now**: one sentence that says which of the three it is (the weekly patterns
     apply; this day has its own windows; this day is not available), then the windows of
     the override when there is one, then the one-off windows, each kind under its own
     words. A window's hours are a pattern's ("09:00 – 13:00"), local times of the date, an
     end at midnight "24:00";
   - which actions are offered: "This day only" and "Not available on this day" on every
     date shown; "Back to the weekly patterns" only while the date has an override.
5. **The draft is state of the logic layer**, not of the view: a list of windows that the
   stream carries, another object at every change, with the rows to draw.
   - `edit()` starts it from the day on show; `add(fields)` checks the three fields (the end
     later than the start, a type chosen: the sentences of step 67, said under the fields)
     and adds; `remove(index)` removes; `discard()` drops it; `save()` sends it.
   - **What only the draft can know is checked at "Add"**: a window that overlaps one of
     the draft is refused (settled point 6), with `shared/`'s `overlaps` or a comparison of
     local times written alike, and no rule beyond R-AV-01; and an eleventh window is
     refused (`CALENDAR_LIMITS.overrideWindowsPerDate`: the shared schema would refuse it
     at the save with a developer's message). The draft is kept ordered by start. A draft
     started from an override that already breaks neither rule cannot break them later.
   - After a save that succeeded the draft is gone and the day is read again; after a
     failure the draft stays, with the failure and, for `availability_conflict`, the
     conflicts list.
   - A draft is of one date. **"Show" while a draft is open is refused** (settled point 7):
     its sentence stands under the date field, no request is made, and it goes when the
     draft is saved or discarded. A type list that arrives, the tab shown again and a read
     of the day that fails while a draft is open each have a decided outcome, tested: the
     draft keeps its windows in all three.
   - Leaving the screen drops the draft with no question.
6. **The deletions and "not available" go through the one dialog that confirms.** Three new
   kinds: the override ("Back to the weekly patterns for …?"), a one-off window, and "not
   available", which is a `setOverride`, not a delete. The dialog's fixed words become
   neutral for all five kinds (settled point 8): "Please confirm", "Keep", "Confirm";
   `page.test.ts`, `availability.view.test.ts` and the shell's tests follow, and the
   architecture's description of that dialog too. If the dialog must serve two
   mount functions, say how, with `detail.view.ts` (a dialog two views mount) as the
   precedent; do not copy the dialog. Its words come from the logic layer; a failure is said
   in it, with the conflicts list, and it stays open; a success closes it.
7. **The conflicts list has new places**: the draft's save, the delete dialog for the
   override, for a one-off window and for "not available". `createWindow` never conflicts
   (`docs/SHARED_CALENDAR_SPEC.md` R-AV-04). Same markup, same template, same functions.
8. **The sentences.** `texts.ts` gains `date_in_past`, `override_not_found`,
   `window_not_found`, and `limit_reached` after a one-off window (the number from
   `CALENDAR_LIMITS.oneOffWindowsPerDate`), through `Attempt`. The table of the sentences,
   new and changed, and the fixed words of the part are in the report: I review the words.
9. **The markup.** Inside `#availability`, a third `<section>` under "A single date": the
   date's form; the read's failure with "Try again"; the day (the two descriptions, each a
   list drawn from a template; the three buttons); the draft (its rows from a template, each
   with "Remove"; the fixed form that adds; the failure; the conflicts list; "Save this day"
   and "Discard"), shown only while there is a draft; the one-off windows (the fixed form
   that adds one: "Start", "End", "Type", "Add window"; the list, each row with "Delete").
   - Every row holds buttons only; every form is outside the lists.
   - A new class is looked for in the style sheet first, and no class holds the word
     `admin`.
   - A phone and a desktop are served by the same markup.
10. **Watch the fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7, and decision 107).
    - A row of the draft with a field of its own is the first condition: do not write it;
      if the settled design cannot be built without it, stop and say so.
    - If the new view file is on its way past the week's size (312 lines), or a helper that
      builds or updates nodes beyond those step 67 has is about to be written, stop and say
      so before writing a workaround.
    - If the two mount functions need the same local functions (`fill`, `say`,
      `showConflicts`, `choices`), say how they share them and whether that is still "two
      small helpers" (section 3, rule 12). This is the question step 69's verdict on the
      fallback will ask.
11. **The week after a change of a date.** Nothing is added for it: the week loads at its
    `start()`. The browser check shows it; if it does not hold, stop and say so.
12. **Tests.**
    - The logic: every function and every path, with fake services and under
      `useFarBrowserZone()`. The cases of the time zone to keep: "today" for a past date
      taken in the calendar's zone and not in the machine's; a date's windows on the nights
      the clocks go back and forward (the day as the patterns give it is local times, so
      nothing moves: show it).
    - The view: the real `index.html`, a fake logic object and fake parts of the services.
    - The shell: the real services behind the stubbed `fetch`.
    - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.

## The step

What `docs/FRONTEND_VIEW_PLAN.md` step 68 lists.

- **Logic**, with tests that include:
  - the day as the patterns give it: no pattern that day, one, two in order, a pattern not
    yet valid or no longer valid on the date, an end at 24:00, a type the types do not hold;
  - the day as it is now, from a calendar view: no override and no window; an override with
    windows; an override with none ("not available"); one-off windows with and without an
    override; a view whose windows carry no `source` (a User's: it cannot arrive here, and
    has a decided outcome all the same);
  - the date's checks: empty, not a date, yesterday, today, tomorrow, each in the calendar's
    zone; and "Show" while the zone is not known: refused with the settings' failure, no
    request, and accepted after the settings are read;
  - the draft: started from the patterns' windows and from an override's; an add accepted
    and each refusal; a remove; the order kept; the limit of 10; discarded; saved, with the
    body equal to what `OverrideBody` parses (checked in the test), an empty draft included;
  - a one-off window's body from the form, equal to what `OneOffWindowBody` parses, and each
    refusal;
  - the words of the three questions;
  - the screen: nothing read before a date is shown; the read, its failure and its next
    try; each write refused by the check; each write that succeeds, with its reads; each
    write that fails, with a server's code and with a transport reason, followed by its read
    all the same and with the draft or what was chosen kept; `availability_conflict` with
    its list; a second write while one is under way; another date shown while a draft is
    open; a pattern changed while a date is on show; the tab becoming visible; results that
    were already there at `start()`; nothing read after the subscription ends; started
    again, nothing of the date before.
- **The sentences:** design point 8, with their tests.
- **Markup and styles:** design point 9. No inline script, style or handler (`page.test.ts`
  keeps passing, with its assertions brought in line).
- **The view** and its DOM test:
  - every state of every stream it listens to;
  - the date's form and its call; a refusal under the field; a past date as decided;
  - the day's two descriptions; which of the three buttons are shown;
  - the draft: shown only while there is one; a row's "Remove" and its call; the form that
    adds, its call with the fields as they are, its refusals; "Save this day" and "Discard"
    and their calls; a failure and the conflicts list in the draft, gone at the next try;
  - the one-off windows: the form and its call; a row's "Delete" opening the dialog;
  - the dialog for each of its new kinds: the words; "Keep" and Escape with no call; the
    call; pending; each failure, with the conflicts list where the route has one; the
    success closing it; a result of another kind changing nothing in it;
  - the rows redrawn only when their list object changed; a type's name containing
    `<script>` shown as text in every place it appears;
  - nothing left in the page after unsubscribing: no row, no choice, no date, no conflict,
    the dialog closed and empty, the forms as `index.html` has them, no field in fault; and
    step 67's part of the screen still left clean.
- **The shell:** `#/availability` still makes its three requests and no fourth until a date
  is shown; a date shown asks `GET /calendar` for that date with the person's token, through
  a service that is not the week's (the week, shown afterwards, loads its own week once); a
  draft saved, "not available", back to the patterns, a one-off window created and deleted,
  each with its request and its reads; a 409 `availability_conflict` on a save shown with
  its list; `date_in_past` said in plain words; availability, week, availability: nothing
  left over or doubled, the draft gone; signing out with a draft open and a conflicts list
  on show leaves nothing; the test of a second person still passing.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v10: section 4 (the third part: the date, the day, the
    draft with rows that hold buttons only, the dialog's new kinds), section 5.1 (the new
    files, what is read and when, the draft, the checks), section 6 (what a session owns:
    the second `CalendarService`), section 8 (whatever was learnt), section 9, the decisions
    table (the nine settled points and what this step decided), the status line and the
    change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 67 no longer "waiting for review";
    step 68 done, with its date; the checkpoint "every screen of section 3 exists"), step
    68's text brought in line with what was settled (the "To settle first" paragraph becomes
    what was settled), section 8, decision 10, and a change log line.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7, for the files added.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions (whatever was
    learnt), "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- "edit" of a one-off window in two calls (settled point 4); copying a day's windows to
  another date; an override for several dates at once;
- a list of every date that has an override or a one-off window: the API has no route for
  it, and reading the calendar month by month to build one is not built;
- the appointments of the day on this screen; cancelling or opening an appointment from the
  conflicts list;
- a click on a day of the week that opens this part: the date is chosen here;
- any change to the week, the book dialog or the other screens, and to step 67's two parts
  beyond what design point 6 needs;
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- step 69's closing work: the whole walk, the deletion of `prototypes/`;
- the size of the bundle, hosting, CORS, logout as a service, the session in
  `sessionStorage`;
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone
width. The first call of each route takes a few seconds under `sam local`: wait for it. The
check works on **dates the seed's appointments leave alone**: choose them after reading the
calendar (weekdays within the seed's patterns and the booking horizon, with no appointment),
and say which. It creates one type named with the tag of its run (`chk68-<number> …`), books
one appointment for `alice` as the Administrator, and **removes everything at the end,
whatever happened**: the appointment (cancelled), then every override and one-off window it
set on its dates, then its type. It never changes or deletes "Studio", "Piscina", their
patterns or the seed's appointments, and it reads the settings first and changes none.

Steps 60 to 67 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; she
   books a free slot with a note and cancels it; "My appointments" lists her appointments;
2. as `admin`, "Settings" shows the four values; "Users" lists `alice`; "Availability" shows
   the two types and the 8 patterns, after three requests.

Step 68, as `admin`:

3. the third part is there, its date field on today, nothing shown and no request made for
   it yet; "Show" for a weekday with a Studio pattern: one `GET /calendar` for that date;
   the day as the patterns give it and as it is now say the same;
4. an empty date and a date before today are each refused under the field, in plain words,
   with no request; today itself is shown;
5. **"this day only"**: the draft starts with the patterns' window; "Remove" it, add 10:00
   to 12:00 of Studio and 14:00 to 16:00 of the check's type; an add with the end not after
   the start and one with no type are refused under their fields; no request so far; "Save
   this day" sends one `PUT`, then the read; the day now says it has its own windows, the
   patterns' description is unchanged, and "Back to the weekly patterns" is offered;
6. **the week shows that day's own windows**, in their types' colours, and the same weekday
   of the next week still shows the pattern's, with no reload of the page;
7. the override is edited again: the draft starts from the override's windows; "Discard"
   sends nothing and leaves the day as it was;
8. a window that overlaps one of the draft is refused at "Add", under its fields, with no
   request, and one that touches it is accepted; a draft that overlaps a one-off window of
   the day is refused by the server at "Save this day", in plain words, and the draft stays;
9. **"not available"**: the dialog asks, under "Please confirm", with "Keep" and "Confirm"
   (and so it does for a type and a pattern of step 67's parts); "Keep" and Escape send
   nothing; confirmed, one
   `PUT` with no window; the day says it is not available; the week shows no window that
   day;
10. **back to the weekly patterns**: the dialog asks; confirmed, the `DELETE`, then the
    read; the day says the patterns apply, and the week shows the pattern's window again;
11. **a one-off window** is added in free hours of the day (evening): the `POST`, then the
    read; it is listed under its own words; the week shows it; one that overlaps the day's
    window is refused by the server in plain words, and what was chosen stays; it stays
    when the day is made "not available" and when that is undone;
12. **the conflicts**: the Administrator books a slot of the day for `alice` in the week;
    back on the date, a draft that leaves that appointment outside (shorter hours, another
    type), "not available", and, with the appointment inside a one-off window, that
    window's deletion and "back to the weekly patterns" where it applies, are each refused
    where they were asked with the appointment listed, its date, time and User right for
    the calendar's zone; the appointment is cancelled in the week, and then they go through;
13. a write that cannot reach the server (failed by the check, with `page.route`: a
    connection refused on a save of the draft, a 409 `concurrent_update` on "not available",
    a 404 on the deletion of a window) is said in plain words where it was asked, the draft
    or what was chosen stays, the day is read again, and the same button works again;
14. a pattern of that weekday is changed in step 67's part while the date is on show: the
    day's two descriptions follow, with the requests said;
15. the tab becomes visible again with a draft open (the check defines `visibilityState`
    and sends `visibilitychange`): the lists and the day are read again and the draft keeps
    its windows;
16. "Show" for another date while a draft is open is refused under the date field with no
    request, and the draft keeps its windows; after "Discard" the same "Show" goes;
17. sign out with a draft open and a conflicts list on show, sign in as `alice` in the same
    page: no date of the check, no window, no conflict and no name of the first person in
    what the page shows, in its source or in its fields; her week shows what the
    Administrator's changes made of it; no request to `/calendar/overrides` or
    `/calendar/windows` is made from her page.

Both:

18. at the phone width the date's form, the day, the draft and the dialog fit the screen,
    and nothing makes the page wider;
19. by keyboard only: reach the part, show a date, start a draft, remove a window, add one,
    save; add a one-off window and delete it; make the day not available and go back to the
    patterns; say where the focus is after each action, above all after "Remove" and after
    a row is gone;
20. the console shows no error and no violation of the Content-Security-Policy other than
    the known one of `zod`; no request to another origin.

At the end the check removes what it made and reads the calendar once more to say that the
types are "Studio" and "Piscina", the patterns their 8, and that its dates have no override
and no one-off window. Say what stays in the local table as history.

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local `calendar` table:** the browser check writes a type, overrides, one-off windows
  and one appointment. Never run the back end's integration journeys in this step (they empty
  the table), nor the front end's while the browser check is under way. Never change or
  delete what the seed made. An override and a one-off window cannot be listed: the check
  keeps the dates it wrote on, and removes by date. If a run of the check is cut short, the
  first thing to do is to read those dates and remove the run's own. If the table turns out
  to be empty, ask me before running `seed:local`.
- **Hard rules:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no rule in
    a view: what a date's windows are, whether a date or a window is accepted, what the
    draft holds, the order of the rows and the words of a refusal are decided in the logic
    layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except opening and closing a dialog;
  - dates and times go through `shared/`'s time helpers and rules and the calendar's zone,
    never the browser's;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a name, a username and
    a conflict reach the page through `textContent` (and the accessible name of a button)
    only and are never logged; the service's `message` never reaches the page;
  - the existing tests keep passing unchanged, except where this brief says a case changes
    (`page.test.ts` on the availability's parts, templates and dialogs; the shell's tests of
    what a session creates and of the availability's requests; `availability.view.test.ts`
    where the delete dialog is shared); if another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 68)

- The design points applied as written, and the nine points settled before the start applied
  as settled (any deviation reported with its reason); every "say in the report" of the
  design points answered there.
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- The browser check, line by line, with steps 60 to 67 in short, and everything it made
  removed.
- The report says how long each view file is (lines, and how many of them look nodes up), how
  long `index.html` became, how many streams each of the two views of the screen listens to,
  how the delete dialog serves its kinds, what the two views share and how, and whether any
  condition for the fallback (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came
  close: step 69 takes its verdict from this.
- The table of the sentences, new and changed, and the fixed words of the part: I review the
  words.
- Which existing test cases changed, and what changed in each.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 67's (561 kB, 124 kB).
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated. Checkpoint: every screen of `docs/FRONTEND_VIEW_PLAN.md` section 3
  exists.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 69.
