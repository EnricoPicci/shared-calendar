## Before opening the new session (operator, in your own terminal)

```bash
nvm use
npm run local:down -w backend                                          # a calendar with nothing left by the journeys
DYNAMODB_PORT=8002 npm run local:up -w backend                         # no key: the fake Claude
npm run local:api -w backend 2>&1 | tee /tmp/shared-calendar-local-api.log   # foreground, a terminal of its own
npm run seed:local -w frontend                                         # the week to look at
```

- This step needs **no Anthropic key and costs nothing**: the panel is checked on the fake
  Claude. The line of `local:up` must say it wired the fake. It needs **no AWS login**; nothing
  is deployed.
- Start `local:up` **without** `ASSISTANT_DAILY_MESSAGE_LIMIT` in the shell: the browser check
  reaches the daily limit, which is 10 locally.
- The stack stays as it is for the whole step. The session asks you for a restart only if a
  gate has emptied the calendar before the browser check, or if the day's messages are spent.

## Brief

Implement plan step c12, "Front end: the screen" (`docs/CONVERSATIONAL_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review.

**One decision of the Product Owner changes what the documents say.** The assistant is not a
screen of its own: it is **a panel at the bottom of every screen**, for both roles, so that a
person sees the calendar while asking and sees it change after a confirmation.
`docs/CONVERSATIONAL_ARCHITECTURE.md` section 13 and the plan's step c12 say "one new screen",
with an address and a navigation entry: on this point this brief wins, and the step corrects
both documents (see "The step"). Pointing and clicking stays as it is: every screen works as
today, with the panel or without a word typed in it.

The plan asks that the choices no document has made be settled with the Product Owner before
any code. They are in the section "Settled before the first line of code": ten choices,
written with this brief and confirmed by the Product Owner. There is no early stop; if the
code or a document proves one of them wrong, stop and tell me.

After this step a person can talk to the assistant in a browser, against the local stack, from
any screen. The panel shows the conversation, sends a message, goes on by itself while the
assistant is working, shows a proposal with its two buttons and what became of it, says in
plain words when the assistant cannot answer, and tells the screens to load again after a
change. It changes nothing in `backend/`, `shared/` or
`frontend/src/services/`, nothing in the fake, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Comments" and "Changing these files".
- `frontend/CLAUDE.md`, all of it, and `.claude/rules/frontend-views.md` (it loads with the
  first view file: the page's test counts the fields and the places of a failure).
- `docs/CONVERSATIONAL_PLAN.md`: sections 1 to 4, step c12, step c13 to see what this step
  must not take from it, and the "As done" note of step c11, to its end ("What step c12 finds
  ready" and "Left as it is, for step c12 to decide").
- `docs/CONVERSATIONAL_ARCHITECTURE.md`: sections 4 (a conversation, its language, its
  limits), 5 in full (the steps, the states, a proposal, confirm and decline, a message that
  drops a proposal), 6 and 6.1 (the contract and the three sentences), section 10 where it
  says what the screen tells the person about Anthropic, and **13 (the front end)**.
- `docs/FRONTEND_ARCHITECTURE.md`: sections 2, **3 (the thirteen rules of a view)**, 4 (the
  shape of a view), **5 and 5.1 (the logic layer)**, 6 (the shell: the table of screens, what
  a session creates and drops), 8 (the tests), 9 (placement), 12.2 (the dev server) and 12.4
  (the language).
- `docs/FRONTEND_SERVICES.md`: sections 3.4 and **20 (`AssistantService`)**, with 20.6, its
  use from the view layer.
- `docs/FRONTEND_VIEW_PLAN.md` section 4: what every screen step does, in which order.
- `docs/COMMANDS.md` sections 3.4 and 4: the fake Claude, its `answers.json`, the dev server,
  the seed, what empties the local calendar.
- `docs/FRONTEND_WALK.md` sections 1 and 7: how a check by hand is set up and written down.
  The walk itself gains the assistant in step c13, not here.

Then read the code this step builds on:
- `frontend/src/services/assistant.service.ts` and `assistant.types.ts`, with the helpers of
  `frontend/tests/integration/assistant.test.ts` (`untilTheExchangeEnds` is the loop this step
  writes for the panel).
- `shared/src/assistant/`: `types.ts` (`AssistantReply`, the messages, the proposal),
  `limits.ts`, and the texts: which sentences of section 6.1 exist, in which languages, and
  how one is chosen.
- `frontend/src/logic/week.screen.ts` and `appointments.screen.ts` (how a screen loads again),
  `settings.screen.ts` (a small logic object, the shape to follow), `texts.ts`.
- `frontend/src/views/shell.ts` (the table of screens, the session's objects),
  `settings.view.ts` and `appointments.view.ts` (two small views), `index.html`, `style.css`.
- `frontend/tests/unit/views/page.ts` and `page.test.ts`, `shell.test.ts`, and one view's test
  with its logic's test.
- `frontend/scripts/dev.mjs`.
- `backend/tests/integration/fake-claude/answers.json`: the sentences the fake answers.

## Where we are (2026-11-22)

- Steps c00 to c11 are done and committed (`4979fd5`). The back end of the assistant is
  complete; `AssistantService` exists with one stream, `outcome$`, for its six calls, each
  outcome saying the call it answers; the reasons of each call are closed lists.
- The service makes one request per call and keeps no conversation: `load` gives every
  message, the other calls the messages their request added. The loop on `working` and the
  putting together of the conversation are this step's.
- `frontend/src/logic`, `frontend/src/views`, `index.html` and `style.css` hold nothing of the
  assistant. The navigation has "Week" for both roles, "My appointments" for a User, and
  "Settings", "Users" and "Availability" for the Administrator.
- The dev server passes every path under `/api/` on to the local API. The plan says it must
  pass `/assistant` on "as it does the other paths": **check whether anything is left to do**;
  if nothing is, say so and correct the plan's sentence.
- The local stack gives each person 10 messages a day, and no route gives one back. The fake
  answers only the sentences of `answers.json`, and for three of them it needs a free slot at
  05:00 on the 25th, the 26th or the 27th day from today.

## Settled before the first line of code

Ten choices that no document had made. Apply them as written.

1. **A panel, on every screen.** Once a person is signed in, the bottom of the page holds the
   assistant, whatever screen is shown, for both roles; the login has none. It has no address
   and no entry of the navigation, and the page still opens on the week.
   - **Collapsed**, as it starts after every load of the page: one bar, with the heading
     "Assistant" and the field with "Send". It stays at the bottom of the window, and the
     screen above it keeps room so that nothing of it is covered.
   - **Open**: the panel grows upward and shows, from the top, the heading with "New
     conversation" and "Close", the line about Anthropic, the conversation, the proposal, the
     failure line, the messages left today, and the field. At a desktop width it takes about
     half of the window's height; at a phone width, most of it. The screen behind stays in
     use at a desktop width.
   - It opens when the field takes the focus, when the heading is pressed, and when a message
     is sent. "Close" and Escape collapse it and give the focus back to where it was. Whether
     it is open is kept while the person moves between screens, and nowhere in the browser:
     a page loaded again starts collapsed.
   - **The conversation is asked of the server at the first opening**, not when the session
     starts: a person who never uses the assistant makes no request to it.
2. **The line about Anthropic** stands under the heading of the open panel, as
   `docs/CONVERSATIONAL_ARCHITECTURE.md` asks: "This conversation is processed by Anthropic's
   Claude." Fixed words of the page, in English.
3. **A proposal is shown once, in its place.** Under the last message, a block with the
   server's question, each action's sentence, and the two buttons with the server's labels.
   While a confirmation is under way the two buttons are disabled. Once settled, the same
   block stays where it was without its buttons, and each action has its outcome beside it:
   "Done" in the page's words, or the server's `error` sentence as given. A declined proposal
   is gone, as the server sends none: the server's notice says what happened. The block goes
   away when a reply no longer carries a proposal.
4. **The input while the assistant is working.** The field stays writable and keeps what was
   typed; "Send" is disabled and Enter sends nothing, from the moment a call leaves until the
   exchange ends. **Nothing is queued**: a message kept and sent by itself after the answer
   would drop a proposal the person has not yet seen. The progress line shows the server's `activity`, and "…" in its place when
   there is none. While a proposal waits the input is open: a message then drops the proposal,
   which is the server's rule and is shown by its notice.
5. **The loop.** While a reply says `working` the logic calls `continue`, at most
   `ASSISTANT_LIMITS.modelRequestsPerMessage` times for one message; past that it stops and
   says the assistant could not finish. It does not continue after `assistant_budget_reached`
   nor after any other failure. A conversation found `working` when the panel is first opened (a page
   loaded again in the middle) is continued in the same way.
6. **When the assistant cannot go on.** A failure is one line under the conversation, in the
   place of a failure the other screens have (`role="alert"`), and the person's text stays in
   the field when its message was not accepted.
   - The three codes of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1: the sentence of
     `shared/`, in the conversation's language, and in English when there is no conversation
     yet.
   - The daily limit reached, or `remainingToday` at 0: "Send" stays disabled until the
     page is loaded again; reading, confirming and declining still work.
   - `conversation_full`: its sentence, and "Send" disabled until "New conversation".
   - The other reasons (`assistant_busy`, `proposal_not_found`, `nothing_to_continue`,
     `invalid_request`, `forbidden`, `network`, `server`, `unexpected`, a session that ended):
     sentences of the page, in English, in `frontend/src/logic/texts.ts` beside the other
     screens'. After `assistant_busy`, `proposal_not_found` and `nothing_to_continue` the
     logic loads the conversation again, once, so that the panel shows what the server holds.
   - The service's `message` never reaches the page.
7. **The messages left today** are shown as a small line by the input, "N messages left
   today", from the server's `remainingToday`.
8. **"New conversation" does not ask first.** It ends the conversation at once: nothing of the
   calendar is lost by it. It is disabled while there is no conversation and while a call is
   under way. After it the panel is empty, still open, and the field has the focus.
9. **After a change, the screens.** When a reply carries a proposal with at least one action
   `done`, the logic tells the screens to load again by the mechanism they already load again
   on: the week and, for a User, "My appointments"; for the Administrator also the screens
   whose data the action may have changed. **The screen on show changes under the open
   panel, with no press of the person.** **Say in the report** which mechanism that is, and
   what was done for the screens that have none.
10. **The page's dialogs come first.** While a dialog of a screen is open (a booking, a
   detail, a question) the panel cannot be used, as the rest of the page cannot; nothing of
   the panel is lost by it.

## Design points

1. **The files**, in the order of `docs/FRONTEND_VIEW_PLAN.md` section 4: the logic
   `frontend/src/logic/assistant.screen.ts` (and a model file beside it if the object grows
   past what one file reads well: say which was chosen); the markup in `index.html`, **after
   the screens and in none of them**, and the styles in `style.css`, one markup for a phone
   and a desktop; the view `frontend/src/views/assistant.view.ts`. **The panel is not a
   screen**: it has no row in the shell's table of screens. The shell mounts it once with the
   session and unmounts it with the session, beside whatever screen is shown. This is a kind
   of thing `docs/FRONTEND_ARCHITECTURE.md` does not have yet (a view that lives across
   screens): the thirteen rules of a view hold for it as written, and the document gains what
   is particular to it. If a rule cannot hold for it, stop and tell me.
2. **The logic holds every rule.** What is on show (the messages in order, the progress line,
   the proposal and its state, the failure line, what is enabled) is one state the logic
   gives on a stream, whether the panel is open included; the view finds, fills and forwards.
   No DOM in the logic. The
   conversation is put together there: `load` replaces it, every other reply adds its
   messages, and a message is never shown twice (its `seq` tells).
3. **One stream in, told apart by `call`.** The logic listens to `outcome$` and switches on
   the call, then on the reason, with no default: a code added to a route and not handled
   must stop the typecheck, as in the service's test.
4. **Nothing of the model is trusted as markup.** Every text of the conversation (a message,
   a notice, the question, a label, a summary, an error) reaches the page through
   `textContent` only, line breaks kept by the style sheet, never by markup.
5. **The three kinds of message** (`person`, `assistant`, `notice`) look different and are
   told apart without colour alone. The list scrolls to its end when a message is added.
6. **Without a mouse.** A new message of the assistant, a notice and the progress line are
   announced by a live region, once each; a failure is an alert; the proposal's buttons come
   in order after the list; Enter in the field sends and a line break is not needed (a
   one-line field, with the limit of `shared/` as its length); the focus goes back to the
   field after a send, a confirmation and a decline. The panel is a region with a name of its
   own; collapsed, nothing of the hidden part is reached by Tab or read aloud; Escape
   collapses it only when no dialog of the page is open. What a screen reader says aloud is
   listened to in step c13: here the markup and the tests are right.
7. **The session's objects.** The shell makes the `AssistantService` and the logic object with
   the session and drops them with it, as for every screen: after signing out and in as
   someone else nothing of the first person's conversation is in the page, in a stream that
   replays, or in a field, and the panel is collapsed. Moving between screens neither loads
   the conversation again nor loses what was typed.
8. **The screens are not changed.** No screen's view or logic knows the panel; what a screen
   needs in order to load again is what it already has. The one thing each screen gives is
   room at its bottom, in the style sheet.
9. **No memory in the browser**: no `localStorage`, no `sessionStorage`. A page loaded again
   asks the server.
10. **Tests.** The logic's, without a DOM: open and collapsed, the first opening that loads
   and the later ones that do not; every call's outcome, every reason of every call
   and its sentence, the loop (once, to the limit, stopped by each failure, started from a
   `load` that says `working`), the proposal waiting, confirming, settled and dropped, the
   conversation put together without doubles, what is enabled in each state, the other
   screens told to load again. The view's DOM test against the real `index.html` with a fake
   logic object: every state, every action and its call, a text with `<script>` shown as text
   in each of the places of design point 4, nothing left behind on unmounting. The shell's
   test: the panel is there on every screen of both roles and not on the login, is mounted
   once in a session whatever the screens visited, and is gone with the session.
   `page.test.ts` changes where the page gains a field and a place of a failure: say which
   numbers moved. 100 % line coverage on `frontend/src` holds.
11. **The integration journeys are not changed**: they test the service.

## The step

1. The logic, with its tests.
2. The markup, the styles, the view and its DOM test.
3. The shell and its test; `dev.mjs` if the check of "Where we are" finds something to do.
4. The browser check, below.
5. The documents:
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: **section 13 rewritten for the panel** (and any
     other sentence that says "the screen 'Assistant'" as a screen of its own, the line about
     Anthropic "under its title" included), with the Product Owner's decision and its reasons
     in the change log and among the decisions, the separate screen among the alternatives
     not taken, a new version;
   - `docs/FRONTEND_ARCHITECTURE.md`: the panel: what a view that lives across screens is
     and what holds for it (the shell, section 6), its view, its logic object, placement, the
     decisions with the ten settled choices, with its version and change log;
   - `docs/CONVERSATIONAL_PLAN.md`: step c12's text **rewritten with what was decided**, its
     title and its hours included, step c13 where it says "the screen", the status line, and
     an "As done" note which ends with what step c13 finds ready;
   - `docs/FRONTEND_SERVICES.md` section 20.6: only where the step proved a sentence wrong,
     with version and change log;
   - `docs/FOLDER_STRUCTURE.md`, `docs/COMMANDS.md` where a command's note changed;
   - `frontend/CLAUDE.md` (122 lines), `.claude/rules/frontend-views.md` (the two counts) and
     `CLAUDE.md` (199 lines of 200): only where a line became untrue. The sentence of
     `frontend/CLAUDE.md` on where a new route's failure sentences go is checked against
     choice 6. Report the line counts.

Not in this step: `docs/FRONTEND_WALK.md` and anything of step c13; the real Claude; a route,
a function or a tool; a change to `backend/`, `shared/`, `frontend/src/services/`,
`answers.json` or the fake (stop and tell me first if one seems needed); a translation of the
page; a new dependency; the cloud.

### The browser check

Against the local stack and the fake, on `npm run dev -w frontend`, at a desktop width and at
a phone width, in the headless browser the earlier screens' checks used, kept outside the
repository. The first call of each route takes a few seconds under `sam local`: wait for it.

**The stage, and what it costs.** Say the plan of the run before starting it.
- Three of the fake's sentences need 05:00 free on the 25th, the 26th and the 27th day from
  today. The check opens them itself as `admin`: one type named with the tag of its run
  (`chk-c12-<number> …`) and an extra window 05:00–07:00 of it on each of the three days.
- **A person has 10 messages a day.** The plan says "as `alice`"; the Product Owner decided
  otherwise, and the plan's rewritten step says so. The User's part is run as a throw-away
  User of the run
  (`chk-c12-<number>`), created through the "Users" screen, so that `alice` keeps her day and
  a second run finds a full count; one line is checked as `alice` (the panel opens, empty,
  with her count). Count the messages of the run before it starts: the list below fits in
  ten, and the tenth reaches the limit. The Administrator's part uses at most three of
  `admin`'s.
- **It removes everything at the end, whatever happened**: the throw-away User (which cancels
  its appointment), the three windows, the type. It never changes "Studio", "Piscina", their
  patterns, the seed's appointments or a setting.

The earlier screens, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; she books
   a free slot and cancels it; "My appointments" lists her appointments; as `admin`,
   "Settings", "Users" and "Availability" open.

Step c12, as the throw-away User unless said:

2. the login shows no panel; after signing in the bar is at the bottom of every screen of a
   User and of the Administrator, collapsed, covering nothing of the screen, and **no request
   to `/assistant` has left**; the navigation has no new entry; the field's focus opens the
   panel after one request: the heading, the line about Anthropic, no message, "New
   conversation" disabled, the messages left today; "Close" and Escape collapse it; as
   `alice` too;
3. **a read**: `fake: what is open on the day of the journey?` shows the person's message,
   then the progress line "Looking at the calendar…" with "Send" disabled, then the answer,
   after two requests and no third; the count went down by one;
4. **moving to another screen** keeps the panel open with the same conversation and no
   request; **a page loaded again** starts collapsed, and opening it shows the same
   conversation, in order, after one request;
5. **a booking confirmed, with the week on show**: the week moved to the 26th day from
   today, the slot at 05:00 free; `fake: book me the slot of the booking journey` shows the
   question, the sentence of the booking and the two buttons; "Confirm" shows the action
   "Done", the buttons gone and Claude's closing words, and **the week above shows the
   appointment with no press and no reload of the page**; "My appointments" lists it;
   a dialog of the week (the appointment's detail) opens and closes over the panel, which is
   as it was;
6. **a decline**: "New conversation", then `fake: book me the slot of the declining journey`,
   then "Don't": the notice "Nothing was changed.", no block, the week unchanged;
7. **a message that drops a proposal**: `fake: book me the slot of the declining journey`
   again, then, while it waits, `fake: say the line of the application`: the block is gone,
   the server's notice says so, nothing is booked;
8. **the three sentences**: `fake: overloaded` shows the sentence of an outage and
   `fake: a spending limit of our own` the sentence of the spending limit, with no
   `continue` sent after either; then messages until the count is 0: the sentence of the
   daily limit, "Send" disabled, and the conversation still readable;
9. **a text as text**: a message `<script>alert(1)</script><b>bold</b>` is shown as written,
   in the person's message (one of the ten, sent before the limit);
10. **another person**: sign out, sign in as `admin`: the panel is collapsed and, opened,
    empty, with nothing of the User's conversation or of a text left in the field anywhere in
    the page; a read as `admin` works, from "Availability"; sign out and in as the User
    again: the User's conversation is there;
11. at a phone width, lines 2, 3 and 5 again by eye: collapsed, the bar covers nothing of any
    screen, the last row of each screen included; open, nothing is cut, and the field and
    the buttons are reachable;
12. with the keyboard only: Enter sends, Tab reaches the proposal's two buttons in order,
    the focus is in the field after a confirmation, Escape collapses the panel, and
    collapsed, Tab does not enter its hidden part;
13. the console shows no error and no violation of the Content-Security-Policy other than
    the known one of `zod`.

If a sentence of the fake does not behave as a line expects (for instance one that the
language question meets first), say so and use the nearest sentence that does; do not change
the fake.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** a settled choice or a design point that proves wrong; anything that would
  change `backend/`, `shared/`, `frontend/src/services/` or the fake; two documents that
  disagree.
- **The local stack is mine**: `local:up`, `local:down` and every restart of `local:api`. Tell
  me exactly what to run, in which terminal, and the word you wait for. The dev server you
  may start and stop (stop it as `CLAUDE.md` says). To know which Claude is wired, read
  whether `ANTHROPIC_BASE_URL` is in `backend/env.local.json` with a script that prints yes
  or no; **never print that file or a line of it**.
- **The order of the runs.** The back end's journeys empty the local `calendar` table and
  the seed with it: run the browser check **before** the root gate, or ask me for a fresh
  stack and the seed after it. Never run the two packages' integration tests at the same
  time, nor a gate or a journey while the browser check is under way.
- **The log file** `/tmp/shared-calendar-local-api.log` is mine: read it with scripts that
  print counts and short lines, never whole; do not delete or empty it.
- Scratch files, the headless browser and its scripts live outside the repository and the
  scratch files are deleted at the end. A shell command that holds a script goes through a
  file or a here-document. The shell is zsh.
- **A script that deletes** names what it deletes by the run's own user and type, and prints
  what it found first.
- **Hard rules that bear on this step:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5); no `document`, `window` or element in
    `frontend/src/logic`; no rule in a view;
  - a handler never changes the screen to show an outcome: every change comes from a stream;
  - `frontend/src` imports only `rxjs`, its two sub-paths, `@shared-calendar/shared` and
    relative files;
  - no token reaches a view, the logic layer, the document or a log; nothing of a
    conversation is logged or stored in the browser; the texts of a conversation reach the
    page through `textContent` only;
  - the API contract and the sentences of section 6.1 live in `shared/` and are not written
    again;
  - the existing tests keep passing unchanged, except `page.test.ts` and `shell.test.ts`
    where design point 9 says; if another must change, say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- When two documents disagree, stop and tell me: the architecture wins over the plan, the
  plan over this brief, **except on the panel**, where this brief carries the Product Owner's
  decision and the two documents are corrected.
- Commit only when asked. Do not push. Do not start step c13.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c12)

- The panel instead of a screen written in `docs/CONVERSATIONAL_ARCHITECTURE.md` and in the
  plan; the ten settled choices and the design points applied as written (any deviation
  reported with its reason), and written in `docs/FRONTEND_ARCHITECTURE.md`; every "say in
  the report" answered.
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src`.
- The browser check, line by line, with the earlier screens in short, as the throw-away User
  and as `admin`, at both widths, and everything it made removed.
- `RUN_INTEGRATION=1 npm run test:integration -w frontend` still green, and the root gate
  `DYNAMODB_PORT=8002 npm run verify` green on the final state, in the order of "How we
  work".
- `npm run typecheck` and `npm run lint` green at the root.
- The documents of "The step" updated; the plan's step c12 rewritten; the scratch files
  deleted; the stack left on the fake.
- The "As done" note holds the detail: how long the view and the logic are, how many streams
  the view listens to, what the shell does for a view that is not a screen, which numbers of `page.test.ts` moved, what was found about
  `dev.mjs`. Then the short closing message, and suggest the commit.
