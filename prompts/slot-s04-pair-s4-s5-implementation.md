## Before opening the new session (operator)

This pair changes the page only, and ends with a look at the changed screens in a browser. In
the worktree `shared-calendar-slot-5min` (branch `slot-5min`), after `nvm use`, with Docker
running and **no `ANTHROPIC_API_KEY` in the shell**, a local stack started **afresh from this
worktree**, while the mail work in the checkout of `main` is not using it:

```
npm run local:down -w backend                       # the back end's journeys left their data
DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded
npm run local:api -w backend                        # in a second terminal, left running
```

The stack belongs to the folder that started it: started from the other checkout, it has
another user pool and nothing here can sign in (`docs/SLOT_STEP_PLAN.md`, the "As done" note
of step s3). `local:down` from here says the network is still in use, because of the mail
work's fake mail container: harmless.

The session starts the page itself (`npm run dev -w frontend`, in the background) and seeds
the calendar (`npm run seed:local -w frontend`); the seed only works on a stack on which the
back end's calendar journeys have not run, which is why the stack is started afresh. Nothing
goes to the cloud in this pair, and nothing is paid.

## Brief

Implement the pair of plan steps s4, "The page: hours and minutes, and 'from' drives 'to'",
and s5, "The week: a short appointment" (`docs/SLOT_STEP_PLAN.md`), following CLAUDE.md's
working rhythm as the plan sets it for a pair: both steps, s4 before s5, one check at the end,
an honest report, then stop for review.

After this pair the Administrator chooses a time on the page as an hour and a minute, on
5-minute steps, in the five places that have a start and an end: the form that creates a
weekly pattern and the dialog that changes one, the two forms that add a window on the page of
a date, and the dialog that books or moves an appointment. In each of them a start chosen by
the person sets the end one hour later, and a changed end leaves the start alone. In the week,
an appointment shorter than 15 minutes is drawn 15 minutes tall, so that it can be read and
pressed, and stands side by side with an appointment that starts inside that height. A User's
screens do not change, except that a short appointment of theirs is drawn taller. Nothing is
deployed.

The page says "Start" and "End" where the plan says "from" and "to": they are the same two
times, and the page keeps its words.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Comments",
  "Tooling and style" (100 % line coverage on `frontend/src`); then `frontend/CLAUDE.md`, all
  of it ("Rules that are easy to break", "Tests", "The logic layer's tests" with the cases to
  keep when a model changes) and `shared/CLAUDE.md`. The rule
  `.claude/rules/frontend-views.md` loads when a file of the views, the page or the style
  sheet is read: **it holds the counts of fields that this pair changes on purpose** (42 in
  the page, 23 in `#availability`).
- `docs/SLOT_STEP_PLAN.md`, all of it: the decisions **S1 to S7** (section 2), the findings
  (section 3, **F1, F7 and F8, decided**), section 4's last paragraph (what
  `docs/FRONTEND_ARCHITECTURE.md` gains), **the "As done" notes of steps s2 and s3 and "The
  pair s4 with s5 finds ready"**, steps s4 and s5, and step s6 to see what this pair must not
  take from it.
- `docs/SHARED_CALENDAR_SPEC.md`: decision D32; R-SLOT-01 (the window that opens at 08:05);
  R-BOOK-02; section 16.8, the rows "Week calendar" and "Book dialog" (the second holds a
  "not built yet" that this pair removes).
- `docs/FRONTEND_ARCHITECTURE.md`: its status line (the last sentence, "The time step becomes
  5 minutes", which this pair removes); **section 3** (the rules of a view); **section 4**
  (the shape of a view, of a dialog and of a form; the parts on the availability's forms, the
  page of a date, the book dialog and the week's blocks, the lanes side by side and the block
  of four or more); **section 5.1** (the logic layer, one row per file); section 8 (the
  tests); **section 11, decisions 37 and 92**, and the last decision of the table, to number
  the new ones after it; section 7.1 (the sizes).
- `docs/FRONTEND_SERVICES.md`: its status line (the same sentence to remove); section 8,
  decisions 33 and 42 (what is checked before sending, and that whether a booking is allowed
  is the server's to say).
- `docs/FRONTEND_WALK.md`: section 1 (what a walk needs, both widths, the tag of a run); the
  checks that choose a time: 42, 43 and 45 (the book dialog), and those of the pattern form,
  of the dialog that changes a pattern and of the two window forms of a date in section 4;
  section 10 (the capacity's checks, as a model of checks added by a plan).
- The code:
  - `shared/src/calendar/defaults.ts` (`TIME_STEP_MINUTES`);
  - `frontend/src/logic/availability.model.ts` (`GRID`, `START_CHOICES`, `END_CHOICES`,
    `PATTERN_FIELDS`, `startingFields`, `patternFields`), `date.model.ts` (`WINDOW_FIELDS`,
    `STARTING_WINDOW`, `draftAdd`), `booking.ts` (`GRID`, `timeChoice`, `timesFor`,
    `bookingFor`, `changeFor`), `week.model.ts` (`spanOf`, `columnsOf`, `SIDE_BY_SIDE`, the
    blocks of a day), `availability.screen.ts`, `date.screen.ts`, `week.screen.ts`;
  - `frontend/src/views/availability.parts.ts` (`choices`, `form`: `held`, `fill`, `say`),
    `availability.view.ts`, `date.view.ts`, `week.view.ts`;
  - `frontend/index.html` (the five places) and `frontend/style.css` (`.times`,
    `.pattern-fields`, `.block` and its lanes);
  - their tests under `frontend/tests/unit/logic/` and `frontend/tests/unit/views/`, with
    `page.test.ts` and `shell.test.ts`.

## Where we are (2026-11-25)

- Steps s1, s2 and s3 are committed (`94cb7b7`, `26ee22e`, not pushed). The server opens and
  books on 5-minute steps; the shared schemas the services check with accept them; the
  assistant is told the step. The paid evaluation waits for step s6.
- **The page still offers quarter hours**: two constants `GRID = 15`, in
  `frontend/src/logic/availability.model.ts` and `frontend/src/logic/booking.ts`, and each time
  one list of local times.
- The week has no minimum height for a block: 5 minutes are about 4 pixels.

## Decided already (the Product Owner, 2026-11-25)

The decisions S1 to S8 and the findings F1 to F11 of `docs/SLOT_STEP_PLAN.md`. For this pair
above all:

- **S1:** a start chosen by the person sets the end one hour later, every time; a changed end
  never moves the start.
- **S2:** in every place with a start and an end (the five named in the brief above).
- **S3:** when one hour later is not possible, the end is the last time allowed: 24:00 in a
  form of a window (start 23:30 gives 24:00), the end of the window that holds the slot in the
  book dialog (start 11:40 in a window that ends at 12:00 gives 12:00).
- **S4:** a form that opens with times in it shows them as they are (the change of a pattern,
  the dialog with the slot's own hour, a form put back to 09:00 and 10:00 after it added a
  window): only a choice by the person sets the end.
- **S5:** each time is two short lists, the hours and the minutes (00, 05 … 55).
- **S7 and F7:** a block is never lower than 15 minutes' worth; a block that starts inside
  the drawn height of another stands side by side with it.
- **F8:** in the book dialog the hours are those the slot's window touches and the minutes
  all twelve whatever the hour; a pair outside the window is the server's to refuse
  (`outside_availability`, which the dialog already says). With the hour 24 the minutes hold
  only 00.
- **F1:** the step is `TIME_STEP_MINUTES`; the two `GRID` constants go.

Apply them; if the code proves one wrong, stop and tell me before going on.

## Decided for this pair (the Product Owner, 2026-11-25)

The two points the plan left to this pair, asked and answered before the pair starts;
`docs/SLOT_STEP_PLAN.md` holds them in section 3, under F8 and F7. Nothing is left to ask at
the start.

1. **The words of the two lists (F8).** The two lists of a time stand in a group named
   "Start" or "End"; each list is inside a `<label>` whose words, "Hour" and "Minute", a
   screen reader says and the eye does not see; the colon between them is hidden from the
   screen reader. On screen: `Start [09] : [05]`. The markup of one group, to build the five
   on:

   ```html
   <fieldset class="time">
     <legend>Start</legend>
     <label><span class="unseen">Hour</span> <select name="start-hour"></select></label>
     <span aria-hidden="true">:</span>
     <label><span class="unseen">Minute</span> <select name="start-minute"></select></label>
   </fieldset>
   ```

   The names are `start-hour`, `start-minute`, `end-hour` and `end-minute`. The class names
   are examples: look in `frontend/style.css` for a class that already hides words from the
   eye only, and for one named `time` or `unseen` that means something else, before adding
   any. The place of a refusal (`.field` with its `.refusal`) stays around the group. If the
   real page shows that this markup does not work (the legend out of line with the other
   labels of a row, a screen reader's words doubled), stop and show me.
2. **More than three side by side (F7).** More than three columns are one block, whatever
   made them, a real overlap or the drawn height of short appointments, as the
   Administrator's week does today (`SIDE_BY_SIDE` in `frontend/src/logic/week.model.ts`); the
   block opens the list of its appointments, each with its true times. Known and accepted:
   the block counts the appointments it holds, so in a rare case it says "4 people" of
   appointments that are not all there at the same moment. A User's week has no such block,
   as today.

## Step s4 — hours and minutes, and the start that sets the end

1. **The logic layer** (`frontend/src/logic/`), pure, no DOM, built on `TIME_STEP_MINUTES`:
   - the choices of a time: the hours and the minutes of a start and of an end, for a form
     of a window (a start 00:00 to 23:55, an end up to 24:00) and for the book dialog (the
     hours the slot's window touches, F8); the minutes of an hour, which are all twelve, or
     only 00 for the hour 24;
   - a time taken apart into its hour and its minute, and put together again as `HH:mm`;
   - **one function for S1 and S3**, used by all five places: the end for a chosen start,
     one hour later on the clock, never past the last time allowed, which the caller gives
     (24:00, or the end of the slot's window);
   - where these live (a file of their own or the existing models) is yours to propose in
     line with `docs/FRONTEND_ARCHITECTURE.md` section 5.1; one home, no copy per screen.
   - `availability.model.ts`, `date.model.ts` and `booking.ts` keep what they hand the
     services: a window's `start` and `end` as `HH:mm`, a booking's two instants, **the
     slot's own instants while the dialog's two times are the ones it opened with**
     (`timesFor`, which is what names the slot in the hour repeated when the clocks go back).
     The two `GRID` constants go.
2. **The page** (`frontend/index.html`): in the five places, each time is its group of two
   lists, as decided in point 1 of "Decided for this pair". No choice of a list is written in the
   page: the script sets them, as today.
3. **The views** (`availability.view.ts`, `date.view.ts`, `week.view.ts`, and
   `availability.parts.ts` where the forms are built):
   - the lists are filled once at the mount (the book dialog's at each opening, from the
     slot's window);
   - what a form holds and is filled with stays `start` and `end` as `HH:mm` towards the
     logic layer: the view puts the two lists of a time together and takes a time apart, with
     the logic's functions. A refusal of `start` or `end` is said under its group, and both
     lists of the group are marked for a screen reader;
   - **S1:** a `change` of the hour or of the minute of a start, made by the person, sets
     both lists of the end to the logic's answer. A `change` of the end does nothing else. A
     value set by the script (an opening, a reset, a fill) sends no `change`, which is S4;
     keep it so, and say it in a comment;
   - when the hour of an end becomes 24, or stops being 24, its list of minutes is rebuilt
     (only 00, or all twelve), keeping the minute where it can;
   - the rules of a view hold (`docs/FRONTEND_ARCHITECTURE.md` section 3): the view computes
     nothing of the calendar itself, and a teardown wipes what the view put in the page.
4. **The style sheet:** the two lists of a time on one line with their colon, at the phone
   width too; the row of a pattern's fields and the dialog's `.times` still fit. Look for a
   class in `style.css` before adding one.
5. **Tests**, 100 % line coverage kept:
   - `frontend/tests/unit/logic/`: the choices (the first and the last of each list, the
     hour 24, the hours of a window 08:05–12:00 and of one that ends at 24:00); taking apart
     and putting together; **the end for a start**: 09:00 gives 10:00, 09:05 gives 10:05,
     23:00 gives 24:00, 23:30 gives 24:00, and in the dialog 11:40 in a window that ends at
     12:00 gives 12:00 and 10:10 gives 11:10; every pair a form can hold is a body the shared
     schema accepts or refuses for the order of the two times alone, never for the step; the
     cases `frontend/CLAUDE.md` asks to keep (a half-hour zone, the two weeks of the clock
     changes, a window ending at 24:00); `timesFor` still sends the slot's own instants while
     the times were left as the dialog opened, also in the repeated hour;
   - `frontend/tests/unit/views/`: in each of the five places, a start chosen sets the end;
     chosen twice, sets it twice; the end changed, the start stays; S3 at 23:30 and at the
     end of a window; S4 for the dialog that changes a pattern, the book dialog as it opens
     and a form after it added a window; the hour 24 and its minutes; what is sent is
     `HH:mm`; a refusal under its group; nothing left in the page after the teardown;
   - `page.test.ts`: the count of the fields grows by ten, on purpose, and every new list has
     words of its own; `.claude/rules/frontend-views.md` follows with the two new numbers
     (the page's, and `#availability`'s, which grows by eight), in line with "Changing these
     files" of `CLAUDE.md`;
   - `shell.test.ts` where it reads every field of the page.
6. `npm run typecheck` and `npm run test:unit` green, so that step s5 starts from green. No
   stop: go on to step s5.

## Step s5 — a short appointment in the week

1. **`frontend/src/logic/week.model.ts`:**
   - an appointment's block is drawn at least 15 minutes tall (S7), a constant with its
     comment, and never past the end of the day shown; its text keeps the true times;
   - **F7:** the columns of the appointments are worked out on the drawn heights, so that a
     block that starts inside the drawn height of another stands beside it, the earlier on
     the left as today; what the block of four or more does is as decided in point 2 of
     "Decided for this pair";
   - the slots (always one hour), the windows and a User's `busy` blocks are drawn true to
     scale, as today: none of them is pressed for its own sake. Whether a slot and an
     appointment are "beside" each other (the slot's tab) follows the real times, as today:
     check it, and tell me if the taller block covers a tab or a free slot's button.
2. **`frontend/style.css`** only if a block 15 minutes tall cannot hold one line of text at
   the two widths; say what you changed and why.
3. **Tests** in `frontend/tests/unit/logic/week.model.test.ts`: 10:10–10:15 alone (15
   minutes tall, the text "10:10–10:15"); followed at once by 10:15–11:00 (side by side);
   followed at 10:25 or later (one column each); three of 5 minutes in a row (three
   columns), the fourth in the first column again; a short one at 23:55 (not past the day's
   end); an appointment of 15 minutes or longer, alone and followed at once (unchanged: one
   column, as today); a User's short appointment; the cases `frontend/CLAUDE.md` asks to
   keep. The week view's test only where a class or a count it reads changes.

## The check of the pair, the look and the documents

1. **The short check:** `npm run typecheck`, `npm run lint`, `npm run test:unit` at the
   root. The front end's journeys run the services, which this pair does not change: run
   them only if a file under `frontend/src/services` or `frontend/tests/integration` changed.
2. **The look**, in a browser on the local stack, at a desktop width and a phone width, as
   `admin` and, for the week, as `alice`: `npm run seed:local -w frontend`, then
   `npm run dev -w frontend` in the background. Walk the new and changed checks of point 3,
   say each one's result, and keep the screenshots in the scratchpad, never in the
   repository. Stop the page afterwards with `pkill -f 'node scripts/dev[.]mjs'`, in a
   command that holds no other text matching it.
3. **`docs/FRONTEND_WALK.md`:** the checks that choose a time say the two lists (42, 43, 45,
   and those of the pattern form, the dialog that changes a pattern and the two window forms
   of a date); a new section in the style of section 10, "Times on 5-minute steps", with
   checks for: a pattern from 08:05 and the week's first slot at 09:00; a start chosen
   setting the end, in each of the five places; the end changed leaving the start; 23:30
   giving 24:00; an appointment 10:10–10:35 booked from the dialog; one of 10:10–10:15 that
   can be read and opened, alone and beside one that starts at 10:15; a time outside the
   window refused in the dialog's own words; the keyboard through the two lists of a time.
   The date of the look.
4. **`docs/FRONTEND_ARCHITECTURE.md`:** a new version in the status line, without the
   sentence the first pair added; section 4 where it describes the availability's forms, the
   page of a date, the book dialog and the week's blocks; section 5.1 (the row of each file
   that changed, a new row for a new file, and the count in its heading if a file was
   added); **decisions 37 and 92 restated** for the two short lists, and new decisions after
   the last one for S1 to S4, F8 and S7 with F7; section 7.1 if it lists the sizes that
   changed.
5. **The other documents:** `docs/FRONTEND_SERVICES.md`, the status line without its
   sentence, and "15-minute" where it states the rule (the examples of a refusal that are
   still refused stay); `docs/SHARED_CALENDAR_SPEC.md`, the status line and the "not built
   yet" of the row "Book dialog" in section 16.8; `docs/ARCHITECTURE.md`, this pair's
   sentence in the open version row; `docs/FOLDER_STRUCTURE.md` and `frontend/CLAUDE.md` if a
   file was added to `frontend/src/logic`; `docs/SLOT_STEP_PLAN.md`, an
   "As done" note under step s4 and one under step s5, the second ending with what step s6
   finds ready, and the version line.

Not in this pair: `shared/`, `backend/` (any file), `frontend/src/services`; the assistant's
panel; the screens of a User beyond the height of a short block; the paid evaluation;
`backend/scripts/smoke.sh`; `README.md`, `docs/RUNBOOK.md`, `docs/COMMANDS.md`,
`docs/CONVERSATIONAL_ARCHITECTURE.md`; a new library or a new allowed import in
`frontend/src`; any `aws` command; the cloud; `npm run deploy`.

## How we work in this pair

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** the markup of the group of lists proved wrong by the real page; a decision of the plan that the code or the look proves wrong
  or awkward (for example two lists that do not fit a row at the phone width, or a taller
  block that hides something); any change the pair seems to need in a file listed under "Not
  in this pair".
- Do not stop, start or restart the local stack yourself: ask me. The page's dev server is
  yours to start and stop.
- No `innerHTML`; text goes in through `textContent`. No class of the page may hold the word
  `admin`.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or
  why, each reference with the document's path in the same sentence, no step or brief
  numbers, no "formerly one list".
- Commit only when asked. Do not push. Do not start step s6.

## Acceptance (`docs/SLOT_STEP_PLAN.md` steps s4 and s5)

- In the five places a time is an hour and a minute on 5-minute steps; a start chosen by the
  person sets the end one hour later, within what is allowed; a changed end leaves the start;
  a form that opens with times shows them as they are. What the services are handed has the
  shape it had.
- The step is `TIME_STEP_MINUTES` everywhere in `frontend/src`: no `GRID`, no 15 that means
  the step.
- A short appointment is 15 minutes tall in the week and stands beside one that starts
  inside that height.
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, 100 % line
  coverage kept; the two counts of fields changed on purpose, in the test and in
  `.claude/rules/frontend-views.md`.
- The new and changed checks of `docs/FRONTEND_WALK.md` looked at in a browser at both
  widths, each one's result said.
- `git status` shows changes under `frontend/`, `docs/` and `.claude/rules/` only.
- The "As done" notes hold the detail. Then the short closing message, and suggest the
  commit.
