# Shared Calendar: several languages (implementation plan)

**Version:** v1 (2026-11-27): the plan, after the Product Owner's eight decisions of the brief
and the answer to one question of planning (section 2). v2 (2026-11-27): phase A started with
brief `prompts/lang-l03-phase-a-implementation.md`; steps l1 to l4 done.
**Brief:** `prompts/lang-l02-implementation-plan.md`.
**Governed by:** `docs/MULTILANGUAGE_ARCHITECTURE.md` (decisions L1 to L16, open points O1 to
O6), and through it `docs/ARCHITECTURE.md`, `docs/EMAIL_ARCHITECTURE.md`,
`docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md`,
`docs/CONVERSATIONAL_ARCHITECTURE.md`. On any conflict those documents win, and this plan is
fixed.
**Branch:** `multilanguage`, in its own worktree `../shared-calendar-multilanguage`.

**A session that starts in the middle of the work reads sections 2.2 (the three permissions and
their limits) and 6 (the rules of the run) before anything else.**

---

## 1. What is asked, and the shape of the answer

The calendar speaks English and Italian: the pages, the mailer's mails and their Excel files,
Cognito's invitation, the assistant's fixed sentences. The language is a fifth fact of the
person, kept in Cognito's attribute `locale`, written only by the person. The design is
`docs/MULTILANGUAGE_ARCHITECTURE.md`; this plan builds it and reopens none of its decisions,
except L7, which planning proved impossible on the local stack (section 2.3, P1).

The shape of the answer:

- **Phase A, by Claude Code on its own** (steps l1 to l8, section 4): everything that needs no
  cloud and no money, on the local stack of this folder. One commit per step, seven for step
  l3. After each step: its check, the commit, a short "As done" note, the next step. It stops
  only at the stops of section 6.3.
- **Phase B, with the Product Owner** (section 5): the Italian read in one pass, the Product
  Owner's own look at the screens, the facts to try in the cloud, the paid evaluation, the
  documents, the merge with `main`, the full regression, the deploy.
- **English does not change** until step l4 shows Italian: every step before it leaves each
  screen, mail and answer exactly as it is, and the existing tests say so.
- **Two lists are kept in this plan while the work runs**: the Italian wordings Claude Code was
  not sure of (section 7) and what it saw on the screens and could not settle (section 8).

## 2. Decided before the first step

### 2.1 The brief's decisions (the Product Owner, 2026-11-27)

Numbered as in `prompts/lang-l02-implementation-plan.md`.

| # | Decision |
|---|---|
| 1 | The work is carried out without a stop between steps: after each step Claude Code runs the step's check, commits, writes the "As done" note and goes on. |
| 2 | Three permissions, for this plan only (section 2.2). |
| 3 | The work stops and asks only at the stops of section 6.3. |
| 4 | Two phases: A on its own, steps l1 to l8 on the local stack; B with the Product Owner. What a step needs of the cloud or of money is moved out of it into phase B. |
| 5 | The Italian is written with the code, formal "lei" (L14), within the length budgets (L16), and reviewed once, at the end. A doubt on a wording goes into the list of section 7 and the work goes on. |
| 6 | Claude Code looks at the screens itself: each step that changes a screen ends with a look in a browser, at both widths, in the languages the step makes available. What it cannot settle by the order of L16's rule 3 goes into the list of section 8. |
| 7 | Step l3 is cut by groups of screens, one commit each. Until the last group, screens moved and screens not yet moved live side by side with English unchanged (finding F5). |
| 8 | Every step can be undone alone: one commit per step (per group in l3), its message naming the step. No step leaves the branch with a red check. |

### 2.2 The three permissions, and their limits

They are **not a general rule**. They hold for the steps of this plan, on the branch
`multilanguage`, in the worktree `../shared-calendar-multilanguage`, and **end with step l8**.
In phase B, and in every other session, branch or folder, the rules of the root `CLAUDE.md`
hold as written.

1. **To commit each step without being asked** (the rule is "commit only when asked"). One
   commit per step, its message naming the step; never an amend of an earlier step's commit.
2. **To go from one step to the next without the stop for review.**
3. **To start, stop and restart the local stack of this folder** (`local:up`, `local:api`,
   `local:lambda`, `local:down`, the page's `dev`) without asking first. The Product Owner does
   not use this folder's local stack while the work runs.

**Nothing else is loosened:** no push, no deploy, no command against the cloud (not even a
read), no paid run, no change outside this worktree, no amend or rewrite of a commit already
made, no bypass of a check.

### 2.3 The question of planning (the Product Owner, 2026-11-27)

| # | Question | Decision |
|---|---|---|
| P1 | The local Cognito never puts `locale` into the id token (finding F8), so L7 cannot work or be tested locally. How does the page read the person's language? | **It asks Cognito.** Right after sign-in the page asks Cognito for the person's own attributes (`GetUser`, with the access token it already holds, as the password change does). One request more per sign-in; the frame stays hidden until the answer, so no screen is shown in the wrong language first. The same path locally and in the cloud. L7 and section 4.5 of `docs/MULTILANGUAGE_ARCHITECTURE.md` are rewritten by step l1. The id token is not read for the language at all. |

### 2.4 Decided by planning, within the architecture

The architecture left these to the plan. They are stated here so that the review can change
them before the start.

| # | Decision | Where it comes from |
|---|---|---|
| D1 | A change of language while signed in **leaves the frame and enters it again**, as when a second person signs in: every screen and the assistant's panel are unmounted, their objects made again with the new texts, and the screen of the address is shown again. No screen recomputes its state by itself. | F4 |
| D2 | The logic layer's objects get the page texts **as a plain object when they are made**, fixed for their life; a pure model takes the texts as its first parameter. No stream of the language reaches a screen's class. | F4 |
| D3 | A text of the page is a key in an attribute of its element (`data-text`, and `data-label` for a name read by a screen reader); the shell fills every key before it shows anything. | F3 |
| D4 | The length budgets are one object beside the texts' type, with the same shape as the texts and a number where a text is tight. | F6 |
| D5 | The padded test language is made from the English texts by a small function, and reaches the page only through the development server, at the address `?padded`. | F7 |
| D6 | While step l3 runs, the check "the page holds no words" has a list of the page's parts not yet moved, shorter after each group and removed by the last. | F5 |
| D7 | The governing documents of the architecture's section 14 are written in phase B, in one pass. In phase A a step changes only the documents the project's rules tie to its commit: a journey's page, a check of `docs/FRONTEND_WALK.md` it makes false, and this plan. Until phase B, `docs/MULTILANGUAGE_ARCHITECTURE.md` and this plan are the truth for what the steps built. | the brief, point 4 |

## 3. What planning found

The code was read on 2026-11-27, on `multilanguage` at `b414c2d` (which is `main` at `a2b4774`
plus the architecture).

- **F1. Every place a person reads a text.**
  - *`frontend/index.html`* (959 lines): 217 pieces of text with words, 119 of them distinct;
    11 names for a screen reader (`aria-label`); the `<title>`; 25 `<template>`s and 11 dialogs
    that hold some of them. No placeholder, no `title` attribute, no `<option>` with words.
  - *The logic layer*: by a search, 13 files of `frontend/src/logic/` hold about 170 sentences
    or words: `texts.ts` (76: the 60 or so sentences of `failureText`, the password's, the
    mail dialog's, the daily mail's), `availability.model.ts` (22), `date.model.ts` (17),
    `appointments.model.ts`, `assistant.model.ts` (9 each), `appointment.detail.ts`,
    `settings.model.ts`, `users.model.ts` (7 each), `booking.ts` (5), `week.model.ts`,
    `profile.model.ts` (4 each), `me.model.ts` (3), `conflicts.ts` (1). `password.model.ts`,
    `daily-mail.model.ts` and the screens' classes use the words of `texts.ts`. The first
    group of step l3 makes the exact list.
  - *The views* hold no sentence: they put in what the logic gives. The one exception is
    `shell.ts`: the two names of the roles and the seven labels of the navigation. Three views
    call `failureText` themselves (`login.view.ts`, `detail.view.ts`, `users.view.ts`).
  - *The services* hold English sentences too (about 30): they are the `message` of a failure,
    written for a developer and shown by no view. They stay as they are (R6).
  - *`shared/src/mail/texts.ts`*: three mails (daily, calendar, a User's own), the footer, the
    line of an appointment, "1 appointment / 3 appointments". An appointment's status is put
    into the line as the server's word (`booked`, `cancelled`).
  - *`backend/src/lib/excel.ts`*: 11 headings, the sheet's name "Appointments", the 3 reasons
    of a cancellation; the status is the server's word here too. The headings are also the
    keys of the cells and of the widths: step l6 separates the key from the word.
  - *`backend/src/handlers/mailer.ts`*: four file names (`calendar-<from>-to-<to>.xlsx`,
    `my-appointments-…`, `calendar-next-7-days-<date>.xlsx`, `calendar-backup-from-<date>.xlsx`).
  - *`shared/src/assistant/`*: `texts.en.ts` and `texts.it.ts`, complete, about 45 texts each.
  - *`backend/src/assistant/prompt.ts`*: the instructions, English and for Claude only. They
    name Italian in two places (the application's three words, the formal "lei").
    `backend/src/lib/anthropic.ts` holds the question that finds a message's language, with
    English as the answer for any other language.
  - *`backend/template.yaml`*: the invitation's subject and five paragraphs, in
    `InviteMessageTemplate`, only at `MailStage` `on`.
  - *Not a person's reading, left alone*: the logs, the scripts' own output, the smoke test's
    lines, the fake mail and the fake Claude, the API's `message`.
- **F2. The words of dates are written in five places today**, not three: `shared/src/mail/texts.ts`
  (short names), `shared/src/assistant/texts.en.ts` and `texts.it.ts` (long names),
  `backend/src/assistant/prompt.ts` (long English names, for Claude), and
  `frontend/src/logic/texts.ts`, which asks `Intl` with `en-US` and puts the parts together
  itself. The architecture's section 2.3 says the page already avoids `Intl`'s wording: it
  avoids its order and punctuation, not its names. Step l2 writes the names once; steps l2 and
  l3 move the five onto them. `Intl` stays in `shared/src/calendar/time.ts`, where it reads a
  time zone and words nothing. The one sort by name with a language is
  `frontend/src/logic/week.model.ts` (`localeCompare(…, 'en')`); the other three `localeCompare`
  sort times and usernames and need nothing.
- **F3. How a fixed text leaves the page (L11, D3).** An element whose whole content is a text
  carries `data-text="<key>"`, and `data-label="<key>"` for an `aria-label`; a function of the
  shell, `fillPage(root, texts)`, sets `textContent` and the attribute for every key, the
  `<template>`s' content included, before the shell shows the login or the frame (everything
  starts `hidden` already, so nothing flashes). It also sets `document.title` and
  `<html lang>`. What needs care:
  - *Words beside a field.* In 53 places the words stand before a child element, most of them
    `<label>Username <input …></label>`. The words go into a `<span data-text="…">` inside the
    label, so that filling them does not remove the field. The test of the page that reads "a
    label's words" as its first text node (`.claude/rules/frontend-views.md`) reads the span.
  - *A sentence around a value.* Four sentences have words on both sides of a value ("You
    signed in as … with a temporary password. …", "Moving: …. Choose a free time.", "Times are
    in the calendar's time zone, ….", the settings' line on the time zone), and a few more put
    a label before one ("From:", "To:"). Word order differs by language, so such a sentence is
    a function of the page texts that gives its parts in order, and the view puts them around
    the value's element. Each case is settled in its group of step l3.
  - *The server's words shown as they are* (the state of a user, the status of an appointment,
    the role): each gets a text by its code, in its group.
  - *The rules that stay*: no `innerHTML`, `textContent` only; nothing inline, so the strict
    Content-Security-Policy holds; no word in the page means no word in a comment's place
    either: the comments of `index.html` stay, in English.
- **F4. How a screen learns that the language changed (D1, D2).** The architecture's section 6.1
  leaves it to the plan, within `docs/FRONTEND_ARCHITECTURE.md` sections 3 to 5. Read in the
  code: a screen's class keeps a state made of sentences already worded (`unread:
  failureText(…)`), so to word it again in place each of the twelve classes would have to keep
  its raw data beside it and recompute: a large change with a new way to fail in every screen.
  The shell already has a path that does everything needed: when a second person signs in it
  leaves the frame (every view unsubscribes and wipes what it put in the page, rule 9), makes
  new objects and shows the screen of the address again. **A change of language takes that
  path.** It happens in two moments only: the person saves another language in "My details"
  (the screen comes back, in the new language, reading its data again), and never else while
  signed in, since the account's language is read before the frame is first shown (P1).
  The price, accepted: what was open or half typed elsewhere at that moment is lost (a message
  being typed in the assistant's panel; the panel reads its conversation again from the
  server, as at every sign-in).
  Before sign-in the rule differs, because the sign-in form must keep what was typed: the
  choice of language fills the fixed texts again and the login view words its one failure line
  again; nothing is unmounted. The choice is not offered while "Choose your password" is on
  show.
  Who holds the language: one small object of the logic layer, page-wide, made by `runShell`
  (`frontend/src/logic/language.ts`): the current language and its texts, a stream of them for
  the shell and the login view, and the three ways it changes (the browser's memory at the
  start, the choice on the sign-in screen, the account's language).
- **F5. Screens moved and not yet moved, side by side (decision 7, D6).** `fillPage` touches
  only elements that carry a key: an element not yet moved keeps its English words in
  `index.html`. A model not yet moved keeps its own constants. So after each group the page
  is whole and English. Three checks grow with the groups: the keys' test (every key of the
  page exists in the texts, every text is used) holds from the first group; "the page holds
  no words" skips the parts of the page named in a list (`#week`, `#users`, …) that the first
  group writes whole and each group shortens; the padded-language test runs over the views
  already moved. The last group empties the list and removes the mechanism.
- **F6. The shape of the page texts' type, and where a budget is written (L16, D4).**
  `frontend/src/texts/texts.ts` holds the type `PageTexts`: one object, grouped by screen
  (`frame`, `login`, `week`, `book`, `detail`, `appointments`, `settings`, `users`,
  `availability`, `date`, `me`, `password`, `assistant`) plus `failures` (by reason, with the
  variants by what was attempted and by role that `failureText` has today) and `common`
  ("Close", "Keep", "Loading…", used by several screens: one text, several keys' users). A
  fixed text is a string, a text with a value a function. A key in the page is the path
  (`data-text="week.today"`); only a string can be a key's text. Beside the type, the object
  `PAGE_TEXT_BUDGETS` has the same shape, partial, with the highest number of characters where
  a place is tight; a function text in a tight place is budgeted on sample values the test
  gives it. The budget binds English and Italian, not the padded language, whose job is to
  find the places. The numbers are set by the walk in the padded language, group by group:
  "what still fits at both widths".
- **F7. The padded test language (L16, D5).** `frontend/src/texts/padded.ts`: a function that
  takes the English object and gives one of the same type, each string between two marks and
  padded by a third, each function wrapped the same way. It is used by the views' tests (any
  visible text without the marks fails) and by the development server. It is kept out of the
  deployed bundle by a constant of the bundle, `TEST_LANGUAGE`, true only in the development
  server's bundle, as `SKIP_GLOBAL_SIGN_OUT` is today (`frontend/scripts/bundle.mjs`): with
  the constant false and the build's minification, the branch and the function are dropped.
  A test of the scripts builds the page as `npm run build` does and looks for the mark in it.
  On the local page: `http://localhost:5173/?padded`.
- **F8. What the local Cognito does (tried on 2026-11-27).** Tried against the emulator of the
  local stack that was running (the one of the `main` folder), with one throw-away user
  `lang-probe-…`, created, read, written and deleted; nothing else was touched.
  - `UpdateUserAttributes` with the person's access token is answered 200 and stores `locale`.
  - **The id token never carries `locale`**, at sign-in or at a refresh. The emulator's code
    builds the id token from `email`, `email_verified`, the custom attributes and the groups
    only. Hence P1.
  - `GetUser` with the access token is answered 200 with the attributes.
  - The emulator accepts any word as `locale`, as the real Cognito does: the reader's check of
    the architecture's section 4.1 can be tested locally.
  - **The emulator does not know the app client's write list**: with the same token the probe
    changed its own `given_name`. So that L6 closes the gap of the architecture's section 4.4
    can be proved only in the cloud (phase B).
  - The emulator calls a "custom message" function only when its own configuration names one
    (`backend/docker/cognito-local-config.json` names none): step l7 leaves that so, and the
    local invitation stays the emulator's own.
- **F9. The effect of one more function on `sam local start-api`.** The template has 39
  functions; step l7 adds the 40th, which belongs to no route. `sam local start-api` starts a
  container at a function's first request (`warm_containers = "LAZY"`), so a function no route
  calls should start none; `start-lambda` serves every function by name and starts nothing by
  itself. But the local API has stalled before, with nothing in its log, on the first request
  to a function without a container, and more than once after a function was added. Planning
  could not measure it without building. So: step l1 records how long `local:api` takes to
  answer its first request today; step l7 measures again and runs its journeys; a stall is
  told apart from a slow start by `docker ps` (no container created for the function asked);
  one restart is tried; a second stall is the stop of section 6.3.
- **F10. One local stack on this machine, not one per folder.** The stack's ports are fixed
  (3000, 3001, 9229, 8002) and the Docker project has one name (`shared-calendar`) in every
  folder, so `local:up` here takes over the containers of the `main` folder's stack, with this
  folder's own `.cognito` and `env.local.json`. **Phase A cannot run while another folder's
  stack is up**, and permission 3 covers this folder's stack only: the Product Owner stops the
  other one before giving the word to start (section 9). After phase A the other folder runs
  its own `local:up` again.
- **F11. The person's language, read and written (P1).** A new service of the page,
  `frontend/src/services/language.service.ts`, straight at Cognito like
  `change-password.service.ts`: `read` (`GetUser`) and `write` (`UpdateUserAttributes` with the
  one attribute `locale`). `frontend/src/services/cognito.ts` gains the two targets. The flow:
  - *Before sign-in*: what this browser remembers; else the browser's first supported
    language (`it-IT` counts as `it`); else the default built into the bundle.
  - *At sign-in* (also after "Choose your password"): the shell keeps the login and the frame
    hidden, reads the account's language, then enters. A supported value becomes the page's
    language and the browser's memory. No value, or one that is not in the list: the page
    writes its own language to the account, once, and enters without waiting for the answer;
    a write that fails is tried again at the next sign-in and says nothing. A read that fails:
    the frame is entered in the page's language and nothing is written.
  - *In "My details"*: a list "Language", saved at once. On success: the memory, the page's
    language, the frame entered again (D1). On failure: a sentence under the field, the list
    back on the language in use.
  - *The browser's memory*: `frontend/src/services/language-memory.ts`, one entry of
    `localStorage`; the storage is handed in by `main.ts`, and a storage that refuses (a
    private window) counts as empty.
- **F12. The default language reaches three places.** The parameter `DefaultLanguage` of
  `backend/template.yaml` (`en` or `it`, default `en`) becomes the variable `DEFAULT_LANGUAGE`
  of the mailer and of the invitation function, and a stack output that
  `frontend/scripts/deploy.sh` reads with the two it reads today and hands to the build
  (`frontend/scripts/build.mjs`, `bundle.mjs`). The development server builds with `en`.
  `backend/samconfig.toml` gets `DefaultLanguage="it"` for the cloud in step l6: a line in a
  file, which nothing deploys in phase A.
- **F13. The tests that name a text by its English words.** Counted by a search: in
  `frontend/tests/unit/views` 15 of 17 files, about 650 lines (`shell.test.ts` 210,
  `page.test.ts` 102, `week.view.test.ts` 100); in `frontend/tests/unit/logic` 27 of 30 files,
  about 430 lines. **Their expectations do not change**: English stays, and the tests stay
  English (R6). What changes in step l3 is how they reach the code:
  - `useRealPage()` (`frontend/tests/unit/views/page.ts`) fills the page with the English
    texts after it loads it, so a view's test finds the words where it found them. One change,
    for all 17 files.
  - A model's test hands the English texts to the function it calls; a screen's test hands
    them to the constructor. About 27 files, each in its group, a mechanical change.
  - `page.test.ts` (what a person without a mouse needs) reads labels and names after the
    filling; its counts of fields and failure lines stay.
  - New tests: the five checks of the architecture's section 5.2 for the page.
  The back end's and `shared/`'s tests of the mails and the Excel file (about 110 lines that
  name English words) gain the language as an argument in step l6, and keep their words.
- **F14. The files and folders**, to be written into `docs/FOLDER_STRUCTURE.md` in phase B:
  - `shared/src/language/`: `languages.ts` (the list `SUPPORTED_LANGUAGES`, the schema
    `Language`, each language's own name, the reader's check of a stored value, the choice
    among a browser's languages), `formats.ts` (the type of a language's names and the date
    writers), `formats.en.ts`, `formats.it.ts`. `shared/src/assistant/languages.ts` goes in
    step l8.
  - `shared/src/mail/`: `texts.ts` becomes the type and the functions that take a language;
    `texts.en.ts` and `texts.it.ts` hold the words of the mails, of the Excel file, of the
    file names and of the invitation.
  - `frontend/src/texts/`: `texts.ts` (the type, the budgets, `pageTexts(language)`),
    `texts.en.ts`, `texts.it.ts`, `padded.ts`. A new folder of `frontend/src`: it imports only
    `shared/`, like the logic layer, and the lint rules of `frontend/src/logic` (no DOM, no
    global) are extended to it.
  - `frontend/src/logic/language.ts`; `frontend/src/services/language.service.ts` with
    `language.types.ts`, and `language-memory.ts`; `frontend/src/views/page-texts.ts`
    (`fillPage`). `frontend/src/logic/texts.ts` keeps the functions that word a time, a range
    and an offset, which hold no word, and `failureText`, which reads the page texts.
  - `backend/src/handlers/inviteMessage.ts`, the invitation function.
  - Tests mirror `src/`, as everywhere.
- **F15. The assistant (L13).** Read in the code, beyond the architecture's section 9: the
  language's question is in `backend/src/lib/anthropic.ts` and answers one of the list, with
  English for "any other language"; it becomes "one of the list, or none", and "none" takes
  the language the page sent, English when the page sent none (an old page, between the two
  deploys). The line the application adds after each message (`timeLine` of `prompt.ts`) is
  stored with the conversation and sent again at every request: the notes of the
  conversation's language (its form of address, the application's three words) go into the
  line that follows the first message, so that they are said once and stay. The block about
  the person cannot hold them: it is part of the mark of the instructions and is made before
  the language is known. The instructions change, so **the mark changes and the conversations
  in progress end at the deploy**. The evaluation has 67 requests and its last run cost 53.00
  US cents; step l8 adds two.
- **F16. The cloud's facts still to try**, all in phase B, none in phase A: that the app
  client is changed in place by `WriteAttributes` (read in the deploy's change set before it
  is carried out: "Modify", not "Replace"); that a write list of `locale` alone is accepted
  (the pool's schema requires no attribute, so nothing forces another name into the list);
  that the administrative calls still write the four facts (the smoke test); that `GetUser`
  answers `locale` with the app client's default read list; that a person's token can no
  longer write its own e-mail (the gap of the architecture's section 4.4, closed).

## 4. Phase A: the steps

Eight steps, fourteen commits. Each step: what it builds, the files it touches, the tests,
its check, what it leaves for phase B, and its note. The check is the lean one of the root
`CLAUDE.md`, written out in section 6.2; a step names only what it adds to it.

### Step l1 — The ground: the facts tried, the architecture corrected

- **Builds** nothing a person sees. Starts this folder's local stack (`local:up`, `local:api`,
  `local:lambda`), after checking that no other folder's is up (F10). Runs the probe of F8
  once more against this folder's emulator, on a throw-away user, to have the facts on the
  stack the work will use. Records the numbers the later steps compare with: the unit tests
  of each package, the time `local:api` takes to answer its first request, the 39 functions.
- **Files:** `docs/MULTILANGUAGE_ARCHITECTURE.md`: L7 and section 4.5 rewritten by P1 (the
  page asks Cognito; the id token is not read); section 4.4's "to try" kept for phase B;
  section 7 and section 13's sentences on the local Cognito made true by F8; section 15's
  row of step l1 and section 17's list of what is confirmed, what is false and what waits for
  the cloud; F2's correction of section 2.3 (L10's "already avoids"). This plan's note.
- **Tests:** none.
- **Check:** `npm run typecheck`, `npm run lint`, `npm run test:unit`, all green before
  anything is changed: the base the next steps are held to.
- **Leaves for phase B:** every fact of F16.

**As done (step l1).** Done 2026-11-27. No other folder's stack was up; `npm ci` was run first
(the worktree had no `node_modules`). This folder's stack started cleanly (`local:api` ready
in about 10 s). The probe of F8, run again on this stack with a throw-away user
`lang-probe-…` (created, read, written, deleted), gave the same facts: `UpdateUserAttributes`
and `GetUser` answer 200, `locale` is stored, any word is accepted (`klingon`), the id token
never carries `locale` (neither at sign-in nor after a refresh), the person's own
`given_name` can be written (no write list). `docs/MULTILANGUAGE_ARCHITECTURE.md` corrected:
the status line, L7 and section 4.5 by P1, L10's reason by F2, sections 1, 3, 4.2, 4.4, 7,
13, 15 and 17 (what is confirmed, false, found, and what waits for the cloud). Base numbers:
unit tests 632 (`shared`), 2058 (`backend`), 3165 (`frontend`), all green, 100 % lines;
**38 functions** in the template, not 39 as F9 says (step l7 adds the 39th); the first
request to `local:api` (`POST /hello` as `alice`, authorizer and function containers both
cold) answered in 0.81 s, the second in 0.04 s. Step l2 finds the branch green.

### Step l2 — `shared/`: the list of languages and the formats

- **Builds:** `shared/src/language/` (F14): the one list, the 38 names of each language, the
  date writers (a short date, a short date with its year, a long date, a date in full, a
  week's label, a weekday's name). The mail's texts, the assistant's two files of texts and
  the line for Claude of `backend/src/assistant/prompt.ts` take their names of days and months
  from it. `ASSISTANT_LANGUAGES` stays, as another name of the one list, until step l8.
- **Files:** `shared/src/language/*`, `shared/src/index.ts`, `shared/src/mail/texts.ts`,
  `shared/src/assistant/texts.en.ts`, `texts.it.ts`, `languages.ts`,
  `backend/src/assistant/prompt.ts`.
- **Tests:** new, in `shared/tests/language/`: the list; the schema; the reader's check (a
  missing value, a word not in the list, `it`); the browser's choice (`it-IT`, `de` then `it`,
  none of ours); every name of every language non-empty and distinct within its kind; each
  writer on dates of both languages (the examples of the architecture's section 10). The
  existing tests of the mails, of the assistant's texts and of `prompt.ts` pass unchanged:
  that is the proof that English is byte for byte the same.
- **Check:** the short check.
- **Leaves for phase B:** the Italian names of days and months, for the review.

**As done (step l2).** Done 2026-11-27. `shared/src/language/`: `languages.ts`
(`SUPPORTED_LANGUAGES`, the schema `Language`, `LANGUAGE_OWN_NAMES`, `readLanguage` for a
stored value, `chooseLanguage` for a browser's list), `formats.ts` (the types `DateNames` and
`DateFormats`, `dateNames(language)`, `dateFormats(language)`: `shortDate`,
`shortDateWithYear`, `longDate`, `fullDate`, `weekLabel`, `weekdayName`), `formats.en.ts`,
`formats.it.ts`. One writer serves every language, since L15 keeps one order of the parts; a
language with another order would write its own. Moved onto it: `shared/src/mail/texts.ts`,
the assistant's `texts.en.ts` and `texts.it.ts`, `backend/src/assistant/prompt.ts`;
`ASSISTANT_LANGUAGES` and `AssistantLanguage` are now other names of the one list, until step
l8. The page's `frontend/src/logic/texts.ts` still asks `Intl`: group l3a moves it. Tests: 28
new in `shared/tests/language/` (shared 660); every existing test passed unchanged, English
byte for byte the same (backend 2058, frontend 3165). Step l3a finds `dateFormats` ready.

### Step l3 — The page's mechanism, in seven groups

Nothing a person sees changes: English only, the same words in the same places. Each group
moves the fixed texts of its part of `index.html` to keys, the sentences of its models into
`frontend/src/texts/texts.en.ts`, hands the texts to its screens' classes (D2), changes its
tests as F13 says, shortens the list of D6, and ends with a look at its screens (section 6.2)
in English and in the padded language. A tight place found gets a budget or gives way, by
L16's rules 2 and 3.

| Group | Its part of the page | Its files of the logic and the views |
|---|---|---|
| l3a | The mechanism, the frame (title, header, navigation, sign-out), the words several screens share | new: `src/texts/*`, `logic/language.ts`, `views/page-texts.ts`; `logic/texts.ts` (`failureText` reads the texts; the dates move onto `shared/`'s formats), `views/shell.ts`, `main.ts`, `scripts/bundle.mjs`, `dev.mjs`, `tests/unit/views/page.ts` |
| l3b | Sign-in, "Choose your password", "Password" | `password.model.ts`, `password.screen.ts`, `choose-password.screen.ts`; `login.view.ts`, `choose-password.view.ts`, `password.view.ts` |
| l3c | The week, the book dialog, the detail dialog, the "E-mail…" dialog | `week.model.ts`, `week.screen.ts`, `booking.ts`, `appointment.detail.ts`, `mail.screen.ts`; `week.view.ts`, `detail.view.ts` |
| l3d | "My appointments", "My details", "Users" | `appointments.model.ts`, `appointments.screen.ts`, `me.model.ts`, `me.screen.ts`, `profile.model.ts`, `users.model.ts`, `users.screen.ts`; their views, `profile.parts.ts` |
| l3e | "Settings" and "Daily e-mail" | `settings.model.ts`, `settings.screen.ts`, `daily-mail.model.ts`, `daily-mail.screen.ts`; `settings.view.ts` |
| l3f | "Availability": the types, the weekly patterns, a single date, the dialog that confirms | `availability.model.ts`, `availability.screen.ts`, `date.model.ts`, `date.screen.ts`, `conflicts.ts`; `availability.view.ts`, `date.view.ts`, `availability.parts.ts`, `time.parts.ts` |
| l3g | The assistant's panel; the closing | `assistant.model.ts`, `assistant.screen.ts`; `assistant.view.ts`; the list of D6 emptied and its mechanism removed |

**Group l3a** carries the weight of the design. It builds:

- the type `PageTexts`, the English object (the frame, `common`, `failures`, the password's
  conditions that several screens use), the budgets' object and `pageTexts(language)`. Until
  step l4 the page knows English alone; step l4 makes the record of every language
  (`Record<Language, PageTexts>`), from which a missing text no longer compiles;
- `fillPage` and the keys of the frame (F3); the language's object of F4, fixed on English;
  the shell filling the page before it shows anything, and handing the texts to
  `sessionObjects`;
- `failureText(texts, reason, attempt, role)` and every caller of it, in every screen, at
  once: the one change of this group that reaches the screens of the later groups;
- the dates of `logic/texts.ts` on `shared/`'s formats, `Intl` gone from it (F2);
- the padded language, the constant `TEST_LANGUAGE`, the address `?padded` (F7);
- the five checks of the architecture's section 5.2 for the page, as far as the frame: the
  keys' test, "the page holds no words" with the list of D6 whole, the texts' test (every
  text non-empty, every function answering sample values), the budgets' test, the padded
  test over a mounted view, and the test that the built bundle holds no mark;
- `useRealPage()` filling the page (F13).

**Group l3g** closes: the list of D6 is empty and gone; `index.html` holds no word outside a
comment; no file of `frontend/src/logic` or `frontend/src/views` holds a sentence (searched,
and the padded test over every view says so); the budgets found by the seven looks are all
written.

- **Tests:** per group, F13; each group's models and screens keep 100 % line coverage.
- **Check, per group:** the short check; the look at the group's screens. No journey changes:
  the front end's journeys drive the services, which this step does not touch. They are run
  once, whole, at the end of group l3g (`RUN_INTEGRATION=1 npm run test:integration -w
  frontend`), as the proof that nothing below the views moved.
- **Leaves for phase B:** the budgets' numbers, for the Product Owner's look; the full walk.

**As done (group l3a).** Done 2026-11-27. Built: `frontend/src/texts/texts.ts` (the type
`PageTexts`: `html`, the keys of `index.html`, by part of the page; `frame`; `failures`, typed
by `FAILURE_REASONS`, with the variants by attempt and by role as fields and functions;
`dates`, `shared/`'s `DateFormats`; the type `Budgets` and `PAGE_TEXT_BUDGETS` for the header
and the navigation), `texts.en.ts`, `padded.ts` (marks `⟦…⟧`, padding `·`),
`logic/language.ts` (`PageLanguage`), `views/page-texts.ts` (`fillPage`, `fillTexts`,
`htmlText`); the frame's three keys and an empty `<title>` in `index.html`; the shell fills
the page before it shows anything and words the role and the navigation from the texts
(`Screen.label` is a function of the frame's texts); `failureText(failures, reason, …)`;
`dateText`, `longDateText` and `weekLabel` gone from `logic/texts.ts` (the callers use
`dates`), `dateTimeText(dates, …)`, `Intl` gone from it; `TEST_LANGUAGE` in `main.ts`,
`bundle.mjs` and `dev.mjs`, the dev server answering `/?padded`. **Differed from the plan:**
(1) a key names a text under `html` (`data-text="frame.signOut"` is `texts.html.frame.signOut`),
so that "every text for the page is used by a key" is a test with an answer; the texts the
logic puts together live beside `html`. (2) The callers of `failureText` and of the dates in the
screens of the later groups pass the English object straight (`PAGE_TEXTS_EN.failures`): the
"model not yet moved keeps its own constants" of F5. A test lists those files, and each group
shortens the list, until only the shell is left. (3) The password's conditions
(`PASSWORD_PROBLEM_TEXT`) move with their screens in l3b, and `sessionObjects` gets the texts
in the group that first needs them. (4) `pageAside()` of the views' tests fills the page
unless asked not to (`pageAside(false)`, the page as written). Tests: new
`tests/unit/texts/texts.test.ts` (texts, samples, budgets, padded, the list of files),
`tests/unit/views/page-texts.test.ts` (keys, "the page holds no words" with the list of D6
whole, `fillPage`), `tests/unit/logic/language.test.ts`, four runShell cases in
`shell.test.ts` (English; the padded frame marked), two bundle tests (no mark in a build as
`npm run build` makes it, minified; the mark in the dev server's); frontend 3192 tests, 100 %
lines. The look: the frame at 1280 × 800 and 390 × 844 in English (unchanged) and padded; the
padded header fits at both widths, the navigation scrolls sideways at 390 as it does in English
(`overflow-x: auto`): nothing to settle. Group l3b finds `PageTexts` ready to grow.

**As done (group l3b).** Done 2026-11-27. `PageTexts` gained `password` (`PasswordTexts`: the
problems of a new password, those with a number or the symbols as functions, the three hints,
"Password changed.") and the keys `common.cancel`, `login.*`, `choose.*` (its sentence two
texts around the username, `aboutBefore` and `aboutAfter`), `password.*`; the sign-in's `<h1>`
uses `frame.title`, and the two screens share `password.newPassword` and
`password.newPasswordAgain`. A label's words are a `<span data-text>` before its field (F3).
`password.model.ts` takes the texts first (`problemText`, `problemTexts`, `againHint`,
`passwordHints`, `newPasswordHints`; `EMPTY_HINTS` and `EMPTY_NEW_HINTS` became `emptyHints`
and `emptyNewHints`); `PasswordScreen` and `ChoosePasswordScreen` take the page texts in their
constructors; `mountLogin(root, login, texts, notice)`; `sessionObjects` gets the texts.
`PASSWORD_PROBLEM_TEXT` and `PASSWORD_TEXTS` left `logic/texts.ts`. The lint rule "no DOM
global" of the logic layer now covers `frontend/src/texts` too (F14; it was due in l3a). Tests:
a helper `tests/unit/logic/password.words.ts` gives the English words under their old names,
so the expectations of seven test files are unchanged; the list of D6 lost `#login` and
`#password`; the list of files taking English straight lost three. frontend 3192 tests, 100 %
lines. The look, at both widths: the sign-in, "Choose your password" (a throw-away user with a
temporary password, deleted after) and "Password", padded; everything fits, the buttons side by
side included. Nothing for section 8.

**As done (group l3c).** Done 2026-11-27. `PageTexts` gained `week` (`WeekTexts`: a slot's
"Full", "free", places left and narrow tab; the Administrator's block of many people; the
list of Users to book for; the refusals of a full time and of `user_busy`), `appointment`
(`AppointmentTexts`: "You", the empty note, "Booked by … on …", the detail's sentence) and
`mail` (`MailTexts`, which took the place of `MAIL_TEXTS`: the address is masked by the screen,
the sentence gets it masked). The keys: `common.close`, `note`, `change`, `loading`, `from`,
`to`; `week.*` (the toolbar, the two names for a screen reader of ‹ and ›, the banner of a move
and the line of the zone as sentences around a value, a busy time in its template), `book.*`,
`mail.*`, `detail.*`. `weekModel`, `placesOf`, `userChoice`, `refusalOf` and
`appointmentDetail` take the texts first; `FULL_FOR_ADMIN` became `week.fullForAdmin`
(`assistant.model.ts` takes it from the English texts until group l3g); `WeekScreen` and
`MailScreen` take the page texts in their constructors; `mountWeek`, `mountDetail` and
`mountAppointments` get `texts` in their deps (the last one early, since it mounts the detail
dialog; `appointments.screen.ts` hands the English texts to `appointmentDetail` until group
l3d); the shell's `SessionObjects` carry `texts`. A key on an element that the script hides
and shows stands before `hidden`, so that the page after a view's teardown is the page as
written, attribute for attribute. Not changed: the legend's types are still sorted with
`localeCompare(…, 'en')`, which step l4 decides with the language. Tests: the calls given the
English texts, the expectations unchanged; `MAIL_TEXTS`'s test is covered by the mail
screen's; the list of D6 lost `#week` and `#detail`, the list of files taking English
straight lost six. frontend 3191 tests, 100 % lines. The look, padded, at both widths, as the
Administrator with `seed:local`'s week: the toolbar, the zone's line, a slot's places, the
book dialog, the detail dialog, the banner of a move, the "E-mail…" dialog; two things for
section 8.

**As done (group l3d).** Done 2026-11-27. `PageTexts` gained `list` (`ListTexts`: what
became of an appointment, the two empty lists, the three refusals of a period), `profile`
(`ProfileTexts`: the rule of each of the four facts as a function of the shared rule's longest,
and "Not set") and `users` (`UsersTexts`: the state of an account in words, the names of a
row's buttons, the invitation's two sentences, a failed creation, the empty list, the username's
hint, the question before a deletion). The keys: `common.edit`, `save`, `delete`, `back`,
`confirm`, `retry`; `appointments.*`, `profile.*` (the four facts' labels, shared by the forms
of "Users", the two Edit dialogs and the list of "My details"), `users.*`, `me.*`; the
username's label and term reuse `login.username`, the role's words `frame.roles`. The models
take the texts first (`appointmentRows`, `emptyText`, `periodRefusal`, `meDetails`,
`profileRefusals`, `recheck`, `profileFor`, `userRows`, `usernameFor`); `PROFILE_RULES` became
`profileRules(texts)`; `NOT_SET`, `NO_USERS`, `USERNAME_HINT`, `CREATE_FAILED`,
`inviteQuestion`, `invitedAnswer`, `editTitle` and `deleteQuestion` left the logic for the
texts (the Edit dialog's title is the edit button's name, `users.edit`). Found and mended: a
row of "Users" showed the state's code (`invited`, `active`) as its text; it shows
`UserRow.statusText` now, the same English words. `AppointmentsScreen`, `MeScreen` and
`UsersScreen` take the page texts in their constructors; `mountUsers` gets `texts`. Tests: the
calls given the English texts, the expectations unchanged; the list of D6 is down to
`#settings`, `#availability` and `#assistant`; the list of files taking English straight lost
five. frontend 3191 tests, 100 % lines. The look, padded, at both widths: "Users" with its row,
the dialog of a deletion, "My details" with its Edit dialog (as the Administrator), "My
appointments" with the history and a refused period (as alice); one thing for section 8.

**As done (group l3e).** Done 2026-11-27. `PageTexts` gained `settings` (`SettingsTexts`: the
defaults' sentence, "Last saved by … on …", the range and the refusal of each of the four
fields as functions of its two ends, so that each language words its own units and order, and
the "Daily e-mail" part's range, with and without the time zone, and refusal). The keys:
`settings.*` (the four labels, "No limit", the time zone's line as a sentence around the zone,
"Settings saved.") and `daily.*`. `settingsInfo`, `settingRange`, `settingsFor` and `dailyFor`
take the texts first; the field names and units of `settings.model.ts` (`IN_WORDS`) went into
the texts; `DAILY_MAIL_TEXTS` left `logic/texts.ts`: the hour "07:00", the same in every
language, is `hourText` of `daily-mail.model.ts`, and the range under the hour is
`dailyRange(texts, timeZone)`. `SettingsScreen` and `DailyMailScreen` take the page texts in
their constructors; `mountSettings` and `mountDailyMail` get them as a third argument. Tests:
the calls given the English texts, the expectations unchanged; the list of D6 is down to
`#availability` and `#assistant`; the list of files taking English straight lost three.
frontend 3191 tests, 100 % lines. The look, padded, at both widths, with a refused value:
everything fits; nothing for section 8.

**As done (group l3f).** Done 2026-11-27. `PageTexts` gained `availability`
(`AvailabilityTexts`: a type's places, the names of a row's buttons, the hints of a type's name
and capacity as functions of their bounds, the refusals of a window's fields and of a pattern's
dates, the empty lists, "Unknown type", a pattern's validity, the two questions before a
deletion, and the sentence above the conflicts) and `date` (`DateTexts`: the refusals of the
date, the day as it is, the windows of "this day only", the three questions with the date in
full words). The keys: `availability.*` (the headings, the labels, the buttons of the three
parts, the dialogs' titles, the three names of "Try again"); the time's legends and lists reuse
`book.*`, the type's label `detail.type`, "Show" `appointments.show`, "Keep" `users.keep`. The
models take the texts first (`typeRows`, `typeNameFor`, `typeFor`, `deleteTypeQuestion`,
`endRefusal`, `patternFor`, `patternGroups`, `deletePatternQuestion`, `dateFor`, `dayModel`,
`draftModel`, `draftAdd`, `windowFor`, `conflictList`); the weekdays' names are
`texts.dates.weekdayName` (`WEEKDAY_CHOICES` became `weekdayChoices(texts)`), a date in full
words `texts.dates.fullDate` (`dateWords` went); `TYPE_NAME_HINT` and `TYPE_CAPACITY_HINT`
became functions of the texts; the constants of words left the logic for the texts.
`AvailabilityScreen` and `DateScreen` take the page texts in their constructors;
`mountAvailability` gets `texts` in its deps. Tests: the calls given the English texts, the
expectations unchanged, the English words gathered in `tests/unit/logic/availability.words.ts`;
the list of D6 is down to `#assistant`; the list of files taking English straight lost six.
frontend 3191 tests, 100 % lines. The look, padded, at both widths, as the Administrator: the
types, the patterns with their validity, a single date with "This day only" open, the dialog
that confirms; everything fits; nothing for section 8.

**As done (group l3g).** Done 2026-11-27. `PageTexts` gained `assistant` (`AssistantTexts`:
who wrote a message, what became of a change of a proposal, the line of the messages left, the
line of an exchange that did not finish); what the server words in the conversation's language
stays `shared/`'s `assistantTexts`. The keys: `assistant.*` (the toggle, "New conversation", the
line on Anthropic, the field, "Send"); "Close" is `common.close`. `messageRows`,
`proposalShown`, `remainingText` and the five functions of a failed call take the texts first;
`COULD_NOT_FINISH` went into the texts; `AssistantScreen` takes the page texts in its
constructor. One change of the page: the panel's name for a screen reader, which was its own
`aria-label`, is the words of its toggle button (`aria-labelledby`), the same "Assistant": a
name filled by the script lands after `hidden`, and the panel, which the shell shows and hides,
would not be the page as written after a sign-out. The closing: the list of D6 and its test are
gone, "the page holds no words" covers the whole page; the list of files taking English straight
is the shell alone, which starts the page in a language; a search of `src/logic` and `src/views`
finds no sentence (import paths, selectors, the key "Escape" and the error of an unknown key
only). The budgets found by the looks are written (group l3c's three); the three rows of
section 8 stay for phase B. Tests: frontend 3190 (the test of the parts not yet moved went),
100 % lines; shared 660, backend 2058; the front end's journeys, whole, 101 passed. The look,
padded, at both widths: the panel open with a message and its answer from the fake Claude;
everything fits; nothing for section 8.

### Step l4 — Italian on the pages, per browser

- **Builds:** `frontend/src/texts/texts.it.ts`, every text of the page in Italian, formal
  "lei", within the budgets; the record of the page texts by language, so that a missing text
  no longer compiles; the browser's memory (`language-memory.ts`); the page's language before
  sign-in (F11: memory, browser, default) with the constant `DEFAULT_LANGUAGE` in the bundle
  (`en` for the development server; the build takes it from its environment); the choice of
  language on the sign-in screen, each language under its own name; `<html lang>`; the sort
  by name of the week with the page's language. After this step a browser set to Italian, or
  a person who chooses "Italiano", sees every screen in Italian; nothing is stored in the
  account yet, so the language is the browser's.
- **Files:** `frontend/src/texts/texts.it.ts`, `texts.ts`; `frontend/src/services/language-memory.ts`;
  `frontend/src/logic/language.ts`, `week.model.ts`; `frontend/index.html` (the choice),
  `frontend/style.css` (the choice's place, for every language alike); `views/login.view.ts`,
  `shell.ts`; `main.ts`, `scripts/bundle.mjs`, `build.mjs`, `dev.mjs`.
- **Tests:** the texts' and the budgets' tests now run over both languages; the memory (kept,
  read, a storage that refuses); the page's first language in each case of F11; the choice
  (the fixed texts filled again, the typed username and password kept, the failure line
  worded again, the choice hidden while "Choose your password" is on show); one known Italian
  sentence on the sign-in screen after the choice (the exception of the architecture's
  section 5.2); the bundle's new constant; `page.test.ts`'s count of fields, one more.
- **Check:** the short check; the look at **every** screen in Italian at both widths, both
  roles, and at the sign-in screen in the three languages. This is the long look of phase A:
  it is where a bad break or a word too long for its place shows. A wording changed for its
  length goes into the list of section 7 with the longer one it replaced.
- **Leaves for phase B:** the review of about 310 Italian texts; the Product Owner's look.

**As done (step l4).** Done 2026-11-27. Built: `frontend/src/texts/texts.it.ts`, every text of
the page in Italian, formal "lei" in the sentences, the calendar's words those of the assistant's
Italian texts ("orario settimanale", "orari propri del giorno", "finestra aggiuntiva", "tipo di
appuntamento", "capienza"), every budget kept; `PAGE_TEXTS` in `texts.ts`, the record of the page
texts by language over `shared/`'s list; `frontend/src/services/language-memory.ts`, one entry
of `localStorage` handed in by `main.ts`, a refusing storage counting as empty;
`firstLanguage` and `PageLanguage.choose` in `frontend/src/logic/language.ts` (memory, browser,
default; a choice remembered, and given to the stream when it differs); the constant
`DEFAULT_LANGUAGE` in the bundle (`en` when the build's environment gives none, `en` for the
development server, a value not in the list stops the bundle; `scripts/bundle.mjs` holds the
list of languages, held equal to `shared/`'s by its test); the choice on the sign-in screen
under the form, each language under its own name and `lang`, hidden while "Choose your
password" is on show; the shell filling the page again at each choice, the login view wording
its notice and failure line again with what was typed kept. Decided while building:
`PageTexts.locale`, the language of the texts, which the week's legend sorts its names in and
the padded test language keeps as it is (a text of its own would have been padded into a
locale that `localeCompare` refuses); "Choose your password" reads the texts of the language in
use when it asks (it lives as long as the page, and the language can be chosen before it asks,
never while it is on show). Tests: the texts' and the budgets' tests over both languages, the
texts' language; the memory; the first language in each case of F11 (in the logic and through
`runShell`); the choice (the page filled again, what was typed kept, the failure line and the
notice worded again, hidden while a password is chosen, a value outside the list refused, the
list emptied at the teardown); one known Italian sentence after the choice; the bundle's new
constant; `page.test.ts`'s fields, 71; the shell's checks of fields left empty leave out the
choice, which holds the language in use. frontend 3221 tests, 100 % lines; shared 660, backend
2058. The look: the sign-in screen in English, Italian and padded; every screen in Italian at
both widths, as the Administrator (the week, the book, detail and "E-mail…" dialogs, settings,
users and the dialog of a deletion, availability with a single date, "This day only" and the
dialog that confirms, "My details", "Password", the assistant's panel) and as alice (the week
and the detail dialog, "My appointments" with a refused period). Nothing overflows. Of section
8's three rows: the detail dialog wraps "Annulla l'appuntamento" to a second row as the padded
English did; "Pieno" fits its tab; a row of "Users" keeps its buttons on one line at 390. Found
and mended in the look: "suo", "sue" for a user's or a day's things (read as "yours" beside
the "lei"), and a gendered "disconnesso". Seventeen wordings for section 7, one row for
section 8 (the weekdays in lower case as headings).

### Step l5 — The person's language

- **Builds:** the fifth fact. `backend/template.yaml`: `WriteAttributes: [locale]` on the app
  client (L6), one line and its comment. `frontend/src/services/language.service.ts` (F11)
  and the two targets in `cognito.ts`. The shell: the read at sign-in before the frame is
  shown, the first sign-in's write, the frame entered again on a change (D1). "My details":
  the list "Language", for both roles, saved at once. The creation form, the Edit dialog and
  the routes gain nothing: `PUT /users/{username}` and `POST /users` refuse a `language` as
  they refuse any unknown field.
- **Files:** `backend/template.yaml`; `frontend/src/services/language.service.ts`,
  `language.types.ts`, `cognito.ts`; `frontend/src/logic/language.ts`, `me.screen.ts`,
  `me.model.ts`; `frontend/src/views/shell.ts`, `me.view.ts`; `frontend/index.html`,
  `frontend/style.css`; `frontend/src/texts/*` (the field's words, the failure's sentence).
- **Tests:** the service (each answer of Cognito for both calls, a value not in the list read
  as "none", no token in a result); the shell (nothing shown before the read answers; a
  supported value, no value, a word not in the list, a read that fails; the write made once
  and not waited for; the frame entered again on a change, with the address kept and nothing
  of the earlier language left in the page); "My details" (the list, a save, a failure, both
  roles); the two routes' handlers still refuse a `language` (a test each). The template has
  no unit test of its own: its line is proved by `sam validate --lint` (run in `backend/`,
  local, no cloud) and by the build.
- **Journeys:** new, in `frontend/tests/integration/`: "the language of a person": a
  throw-away user signs in with no language and gets the page's; changes it; signs in again
  on a "new browser" (an empty memory) and finds it; a word not in the list, written by hand
  at the emulator, is read as none. Its page `docs/journeys/frontend/language.md`, by the
  project skill `explain-journey`, in the same commit.
- **Check:** the short check; the new journey alone, after `npm run build -w backend` and a
  restart of `local:api` (the template changed); the look at "My details" for both roles, at
  the first sign-in of a new user, and at a change of language from three different screens'
  addresses, at both widths.
- **Leaves for phase B:** F16 whole: the change set, the gap closed, `GetUser` in the cloud.
  Locally the write list proves nothing (F8).

**As done (step l5).** *Empty.*

### Step l6 — The mailer and the Excel files by language; `DefaultLanguage`

- **Builds:** `shared/src/mail/texts.ts` as the type and the functions that take a language
  first, with `texts.en.ts` and `texts.it.ts`: the three mails, the footer, the line of an
  appointment, the status and the reason of a cancellation by their codes, the eleven
  headings, the sheet's name, the four file names (plain letters, no accent), the HTML's
  `lang`. `backend/src/lib/excel.ts`: the columns by a key, their words from the texts; the
  cells of dates and times as they are (O4). `backend/src/lib/cognito.ts`: the language read
  with the address, by the reader's check, in `getProfile` and `adminRecipients`; it does
  not reach `GET /me` or `GET /users` (O3). `backend/src/handlers/mailer.ts`: the recipient's
  language, else `DEFAULT_LANGUAGE`; the daily mail to each administrator in their own
  language, its files built once per language in use; the log may name the language's code.
  `backend/template.yaml`: the parameter `DefaultLanguage`, the variable on the mailer, the
  stack output; `backend/samconfig.toml`: `it` for the cloud (F12).
- **Files:** those named; `shared/src/index.ts`; `frontend/scripts/deploy.sh` (it reads the
  third output and hands it to the build; nothing runs it in phase A).
- **Tests:** `shared/`'s tests of the mail texts over both languages (non-empty, the plain
  text and the HTML saying the same, a value with markup escaped in both, one and several);
  the file names (no character outside plain letters, digits, `-` and `.`); the Excel file in
  Italian (its headings, its sheet's name of 31 characters at most, a cancelled row) and in
  English unchanged; the mailer: an Italian recipient, a recipient with none, with a word not
  in the list, two administrators of two languages (two files' sets, each mail with its own),
  `DEFAULT_LANGUAGE` at `it`. The existing tests keep their English words (F13).
- **Journeys:** in `backend/tests/integration/mail.test.ts`, the mailer's block gains a
  recipient whose language is Italian, set at the emulator by the test's own set-up: the fake
  mail holds one known Italian sentence and the Italian file name. Its page
  `docs/journeys/backend/mail-mailer.md`; `mail-daily.md` if the daily block changes.
- **Check:** the short check; the changed journey alone, after a build and a restart of
  `local:api` and `local:lambda`; one Italian mail of each of the three kinds read in the
  fake mail, and its Excel file opened: the look of this step.
- **Leaves for phase B:** the review of about 30 Italian texts; a real mail in Italian.

**As done (step l6).** *Empty.*

### Step l7 — The invitation function

- **Builds:** `backend/src/handlers/inviteMessage.ts`: Cognito's "custom message" trigger. For
  the source `CustomMessage_AdminCreateUser` (the invitation and its resend) it answers the
  subject and the HTML body from the mail texts, in the language of the person's `locale` by
  the reader's check, which an invited person does not have, so in `DEFAULT_LANGUAGE`; with
  Cognito's two placeholders for the username and the temporary password, which it receives
  as placeholders and never as values. Any other source is answered untouched. It imports no
  AWS SDK and logs the source and the language's code, nothing else. The invitation's words
  in `shared/src/mail/texts.en.ts` and `texts.it.ts`, the English ones those of the template
  today. `backend/template.yaml`: the function, its role (its own logs only), its log group,
  the permission for Cognito to call it, limited to this pool, and `LambdaConfig` on the pool;
  `InviteMessageTemplate` stays, in English, as Cognito's fallback.
- **Files:** those named; `backend/scripts/local-seed.sh` only if `env.local.json` must name
  the new function.
- **Tests:** the function (the invitation in each language, the default when there is no
  `locale` and when it holds a word not in the list, both placeholders present once in the
  body, the body under 20 000 characters and the subject under 140, another source untouched,
  nothing personal in the log). The template's new resources are read line by line against
  the hard rules (one role, its own logs only, no wildcard, the permission limited to this
  pool) and proved by `sam validate --lint` and the build.
- **Check:** the short check; `npm run build -w backend`, the stack restarted; **the measure
  of F9**: the first request's time against step l1's, then the journeys that create and
  invite a user, run alone (the invitation's block of
  `frontend/tests/integration/login.service.test.ts`), to see that the local stack still
  creates a user with one more function in the
  template. No journey changes; no screen changes.
- **Leaves for phase B:** the function has never been called by a Cognito: that Cognito calls
  it, that the mail arrives in Italian with a password that works, that a failure of the
  function fails the creation cleanly, are for the cloud (the smoke test and one invitation
  looked at by hand).

**As done (step l7).** *Empty.*

### Step l8 — The assistant

- **Builds:** the three changes of the architecture's section 9, as F15 details them.
  (1) One list: `ASSISTANT_LANGUAGES`, `AssistantLanguage` and
  `DEFAULT_ASSISTANT_LANGUAGE` go; `shared/src/assistant/languages.ts` is deleted. (2) The
  notes of a language (its English name, its form of address, the application's three words)
  in each language's file of texts; the fixed instructions of `prompt.ts` lose their two
  sentences on Italian and say in their place that the application's line gives the notes of
  the conversation's language; the line after the first message carries them. (3) The body of
  `POST /assistant/messages` gains one optional field, `language`, checked against the list;
  the language's question answers "none" for a message in no supported language, and the
  server then takes the field, English when it is absent. On the page: the service sends the
  page's language with a message, and the panel's own sentences follow the page's language
  while there is no conversation.
- **Files:** `shared/src/assistant/*`, `shared/src/index.ts`; `backend/src/assistant/prompt.ts`,
  `exchange.ts`, `backend/src/lib/anthropic.ts`, `assistantDb.ts`,
  `backend/src/handlers/sendAssistantMessage.ts`; `backend/docker/fake-claude.mjs` (a first
  message in a third language answered "none"); `frontend/src/services/assistant.service.ts`,
  `frontend/src/logic/assistant.model.ts`, `assistant.screen.ts`;
  `backend/tests/eval/requests.ts`.
- **Tests:** the notes of every language non-empty, and in what Claude is told for a
  conversation of that language and not for another; the instructions name no language's
  words; the body with and without the field, and with a word not in the list (`400`); the
  three outcomes of the language's question; the panel's sentences in the page's language
  before a conversation.
- **Journeys:** `backend/tests/integration/assistant.test.ts`, the block of the language: a
  first message in a third language from an Italian page is an Italian conversation, and from
  a page that sends nothing an English one. Its page
  `docs/journeys/backend/assistant-language.md`. The front end's assistant journeys are run
  once, since the service's request changed.
- **The evaluation:** two requests added (a first message in German with the page at Italian;
  the same with no language sent), 69 in all; `npm run assistant:eval -w backend -- --list`,
  which costs nothing. **No paid run.**
- **Check:** the short check; the changed journeys alone, after a build and a restart; the
  look at the panel in Italian before a conversation, at both widths.
- **Leaves for phase B:** the paid evaluation (the instructions changed, so it must be run
  once before the deploy); the conversations in progress end at the deploy.

**As done (step l8).** *Empty.*

**After step l8 phase A is over, and so are the three permissions.** Claude Code writes the
closing note below, leaves the local stack up and seeded for the Product Owner's look, and
stops.

**As done (phase A, the closing).** *Empty: the commits of the fourteen steps, the counts of
tests, what each list of sections 7 and 8 holds, what is known to be unproven.*

## 5. Phase B: what waits for the Product Owner

In order. Each item waits for the Product Owner's word; nothing here is run or committed
without it, and the rules of the root `CLAUDE.md` hold as written.

1. **The report of phase A**: the closing note, the two lists, every stop that was met.
2. **The Italian, in one pass**: the list of section 7 first, then the files
   (`frontend/src/texts/texts.it.ts`, `shared/src/mail/texts.it.ts`,
   `shared/src/language/formats.it.ts`, the notes of `shared/src/assistant/texts.it.ts`). The
   corrections in one commit; a correction that goes over a budget is settled by L16's rule 3.
3. **The Product Owner's own look at the screens**: the list of section 8, then whatever else
   the Product Owner wants to see, on the local page in Italian and at `?padded`.
4. **The cloud's facts, reading only** (F16), each command on an explicit instruction: the
   app client as it is today (its write and read lists), the pool (no trigger yet).
5. **The paid evaluation**: 69 requests; the last run of 67 cost 53.00 US cents, so about 55,
   said again and agreed before it is run, on a stack started with the real key by the
   Product Owner. The requests in Italian and the two new ones are read by hand.
6. **The documents of the architecture's section 14**, written in one pass from the "As done"
   notes and reviewed: `docs/ARCHITECTURE.md`, `docs/EMAIL_ARCHITECTURE.md` (M17 replaced),
   `docs/FRONTEND_ARCHITECTURE.md` (section 12.4 rewritten, D1 and D2 as decisions),
   `docs/FRONTEND_SERVICES.md`, `docs/CONVERSATIONAL_ARCHITECTURE.md`,
   `docs/FOLDER_STRUCTURE.md` (F14), `docs/FRONTEND_WALK.md` (a section for the languages),
   `docs/COMMANDS.md`, `docs/RUNBOOK.md`, `README.md`; the root `CLAUDE.md`'s new hard rule
   and the two packages' files, `.claude/rules/frontend-views.md` (the label's words, F3),
   all left in line with "Changing these files". The sentence for the privacy notice (the
   language and its purpose) is given to the Product Owner, who owns the notice.
7. **The merge with `main`** (section 9), in a session of its own.
8. **The full regression, once, on what will be deployed**: the root
   `DYNAMODB_PORT=8002 npm run verify`, the front end's journeys, the smoke test locally, and
   `docs/FRONTEND_WALK.md` in English with its new section in Italian. How much of the walk is
   walked is agreed first, as in the earlier releases.
9. **The deploy**, each command on an explicit instruction: the API first, with
   `DefaultLanguage` at `it`. Its change set is read before it is carried out: the app client
   and the pool "Modify", never "Replace"; one function, one role, one log group and one
   permission added. Then the smoke test in the cloud; the gap of the architecture's section
   4.4 tried on a test user (its own e-mail can no longer be written, its `locale` can); one
   invitation received and read, in Italian, its password used. Then the page. Then the
   Product Owner signs in once, so that the Administrator's account gets its language and the
   daily mail follows it.
10. **The release closed**: the version (a minor one after the e-mail work's, chosen then),
    the record in `docs/RUNBOOK.md`, `README.md`'s versions, the tag, the push.

## 6. The rules of the run

### 6.1 The order, and what is done after each step

The steps in their order, l1 to l8, the groups of l3 from a to g. The architecture allows l6,
l7 and l8 in any order; the run keeps the numbers, so that a session that starts in the middle
has one answer.

After each step, and after each group of l3, in this order:

1. The step's check (section 6.2), green.
2. The "As done" note written in this plan: what was built, what differed from the plan and
   why, the numbers (tests, the journeys run), what the next step finds ready. Short, a
   paragraph. The plan's version line gains the step.
3. New lines in the lists of sections 7 and 8, if any.
4. `git status` read: only the step's files. Then **one commit**, with the note inside it, its
   message starting "Step l5 of docs/MULTILANGUAGE_PLAN.md:" (for a group, "Step l3c …") and
   saying in plain words what the step built.
5. The next step.

### 6.2 A step's check

- `npm run typecheck`, `npm run lint`, `npm run test:unit`, at the root, all green, 100 % line
  coverage kept where it is enforced. A step that changes `backend/template.yaml` adds
  `sam validate --lint` in `backend/`, which reads the file only.
- **Only the journeys the step adds or changes**, run alone
  (`DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend -- <file> -t
  '<describe>'`, or `-w frontend` without the port; the whole file when a block needs what an
  earlier block left). Never the two packages' journeys at the same time. After
  `npm run build -w backend`, `local:api` and `local:lambda` are restarted. A journey's page
  under `docs/journeys/` changes in the same commit.
- **The look at the screens the step changes**, in a real browser driven by Claude Code, at
  1280 × 800 and at 390 × 844, in the languages the step makes available: English and the
  padded language in step l3, Italian too from step l4. Before a look: the stack restarted if
  a journey of the back end's calendar ran since the last seed, then `npm run seed:local -w
  frontend`. What is looked for: a text cut, a text over another, a row that breaks badly, a
  button pushed out of its dialog, a text without marks in the padded language, an English
  word on an Italian screen. A tight place is settled by L16's rule 3: a shorter wording
  first; then the element made to give way in every language; never a rule for one language.
  What cannot be settled that way goes into the list of section 8, and the work goes on.
- No root `verify`, no whole walk, no smoke test: those are phase B's.

### 6.3 Where the work stops and asks

Only here. A stop says plainly what was found, what was tried and what the Product Owner must
decide; the step's note records where the work stands; nothing half done is committed.

1. A fact about AWS marked "to try" turns out false, or anything else proves the architecture
   wrong: what was found, and the document's change proposed. (P1 was such a case, met at
   planning.)
2. A step's check cannot be made green without bending a rule of the project: a hard rule of
   the root `CLAUDE.md`, the 100 % coverage, the comment rule, the layout rule L16.
3. Anything in the cloud or that costs money. Phase A needs none; meeting a need for one is
   itself a stop.
4. The local stack hangs and cannot be brought back: one `local:down`, `local:up`, `local:api`,
   `local:lambda` is tried; a second hang on the same request is the stop (F9).
5. Another folder's local stack is found up (F10): it is not this plan's to stop.
6. A decision Claude Code is not comfortable taking alone. A doubt on an Italian wording is
   not one of these (section 7); a doubt on a screen that L16's rule 3 settles is not one
   either (section 8).

Not a stop: a test that fails for a reason understood and fixed within the step; a finding of
section 3 that turns out a little different in the code (it is said in the note); a group of
l3 that must take a file another group was given (said in the note).

### 6.4 A session that starts in the middle

1. Read sections 2.2, 6 and the note of the last step done.
2. Find where the work stands: the first step of section 4 whose "As done" note is empty, and
   `git log --oneline` for the last commit that names a step. The two must agree.
3. `git status`. A clean tree: start that step. A tree with changes: the step was interrupted.
   Read the diff against the step's description; go on from it when it is understood;
   otherwise stop and ask. Never throw the changes away unasked.
4. Check the local stack before using it (`docker ps`, the ports 3000 and 3001): whose it is
   (F10) and whether it answers.
5. Run the short check before changing anything: the branch must be green at a step's start.

### 6.5 To undo a step

`git revert <the step's commit>`: each commit holds one step, its tests and its note. A group
of l3 after l3a can be reverted alone while no later commit touched its files; l3a cannot,
once a later group stands on it. Nothing is ever reset or amended.

## 7. The Italian wordings to review

Kept by Claude Code while the work runs (decision 5); read first in phase B, item 2.

| Step | Where (the key, or the mail) | English | Italian chosen | Alternatives weighed, and why this one |
|---|---|---|---|---|
| l4 | Every button: `html.login.signIn`, `html.frame.signOut`, `html.common.save`, `close`, `edit`, `delete`, … | Sign in, Sign out, Save, Close, Edit, Delete | Accedi, Esci, Salva, Chiudi, Modifica, Elimina | The formal "lei" would be "Acceda", "Esca", "Salvi"; the infinitive "Accedere", "Salvare" is heavy on a button. The short verb is what Italian pages put on a button, also where their sentences say "lei"; the sentences here say "lei" throughout. To confirm as the rule (decision L14 speaks of the sentences). |
| l4 | `html.choose.heading`, `html.choose.submit` | Choose your password / Choose password | Scelga la sua password / Scegli la password | The heading is a sentence ("lei"), the button a button (the rule above). If the mix reads oddly side by side: "Imposta la password" on the button. |
| l4 | `frame.nav.appointments` | My appointments | Appuntamenti | "I miei appuntamenti" is 19 characters, over the budget of 18 for a link of the navigation; "I miei dati" keeps "miei" beside it. |
| l4 | `html.common.cancel` | Cancel | Annulla | Used in the dialogs that do not touch an appointment (the first password, a user's Edit, "My details"). The assistant avoids "Annulla" because it would read as cancelling an appointment; here the detail dialog's button is "Annulla l'appuntamento", in another dialog. Alternative: "Lascia stare". |
| l4 | `html.users.keep` (the two dialogs that confirm a deletion) | Keep | Mantieni | "Non eliminare" is clearer beside "Elimina utente", but does not fit "Not available on this day" and "Back to the weekly patterns", which the same dialog asks. "Lascia stare" is colloquial. |
| l4 | `html.availability.confirmTitle` | Please confirm | Confermi | "Conferma richiesta" reads as "confirmation requested", "Confermare?" as a question without its object. |
| l4 | `html.week.keep` | Keep the appointment as it is | Lascia l'appuntamento com'è | A button: the short verb (the first row). |
| l4 | `appointment.you`, `appointment.byYou`, `assistant.who.person` | You / you | Lei / lei | "Per: Lei", "Prenotato da lei il …", the name over the person's own message. "Io" or "Tu" would break the "lei". |
| l4 | `week.full`, `week.free`, `week.tabLeft` | Full, free, 2 left | Pieno, libero, 2 liberi | Agreeing with "orario" (masculine); "1 libero" for one place. Within the budget of 8. |
| l4 | `availability.inTheWay` | 1 appointment is in the way: | 1 appuntamento è d'ostacolo: | "impedisce la modifica" is longer and says less of what follows (the list). |
| l4 | `html.availability.remove`, `date.removeLabel` | Remove | Togli | "Rimuovi" is the usual word on a computer; "Togli" is the plainer one and shorter in the row of a window. Either is right. |
| l4 | `html.book.hour`, `html.book.minute` (read only by a screen reader) | Hour, Minute | Ora, Minuti | "Ora" also means "now"; it stands before a list of hours, so the meaning is clear. "Ore" is the alternative. |
| l4 | `html.password.about` | After the change you are signed out, here and on every other device, and sign in again… | Dopo la modifica la sessione si chiude, qui e su ogni altro dispositivo, e si accede di nuovo… | "viene disconnesso" says a gender the page does not know; the impersonal says the same without it. |
| l4 | `users.deleteQuestion`, `availability.deletePattern`, `date.deleteExtraQuestion`, `date.closeQuestion`, `date.reopenQuestion`, `failures.patternsBackOverlap` | Their / Its | di alice / Quelle ore / del giorno | "suoi", "sue" for a user's or a day's things reads as "yours" next to the "lei": the owner is named instead. |
| l4 | `settings.lastSaved`, `appointment.bookedBy` | Last saved by admin on Fri 27 Nov, 11:57 | Salvate l'ultima volta da admin il ven 27 nov, 11:57 | The date and the time come as one value of the shared formats; "alle 11:57" would need them apart. |
| l4 | `html.frame.screens` (the navigation's name for a screen reader) | Screens | Pagine | "Schermate" is the literal word, longer and less used. |

## 8. What was seen on the screens and not settled

Kept by Claude Code while the work runs (decision 6); looked at by the Product Owner in
phase B, item 3.

| Step | Screen, width, language | What was seen | What was tried | What is proposed |
|---|---|---|---|---|
| l3c | The detail dialog, 390 and 1280, padded | Its three buttons ("Close", "Change", "Cancel appointment") take two rows: "Cancel appointment" goes alone to the second, right-aligned. In English they take one. | Nothing: the wrap is the style sheet's, clean and readable. | Look again in Italian in item 3 ("Annulla appuntamento" is about as long as the padded English); keep the wrap if it reads as well. |
| l3c | The week, a slot's narrow tab beside appointments, 1280, padded | "⟦Full··⟧" fills the narrow tab and its last marks are cut. | Nothing: the tab is a few characters wide by design; the budget of 8 characters binds the real languages (`week.full`, `week.tabLeft`). | Nothing, unless the Italian ("Pieno", "2 liberi") is cut too. |
| l3d | "Users", a row of the list, 1280, padded | "⟦Delete··⟧" goes to a second line of the row, under the username. | Nothing: the row wraps by the style sheet and stays readable. | Look in Italian ("Elimina", "Invita di nuovo" beside "Modifica"); keep the wrap if it reads well. |
| l4 | "Availability", the weekdays of the pattern form's list and the headings of the patterns' groups, both widths, Italian | "lunedì", "martedì" in lower case, as Italian writes them inside a sentence; as a heading and in a list they read better with a capital. | Nothing: the names are `shared/`'s, for sentences, the same the assistant and the mails use. | A capital at the start of a heading or a list item, for every language alike (rule 1 of the architecture's section 6.3): a `::first-letter` rule of the style sheet on those two places, or a capitalised form beside the sentence form in `shared/`. |

## 9. Beside the other work

Phase A waits for none of it. What the merge of phase B must do about each:

- **Before the start: the local stack.** The `main` folder's stack was up on 2026-11-27, with
  the ports this folder needs (F10). The Product Owner stops it (`npm run local:down -w
  backend` there, and the two `sam local` terminals) before giving the word; the session of
  step m10 on `main` then has no local stack while phase A runs.
- **The e-mail plan's last step** (`docs/EMAIL_PLAN.md` step m10, on `main`): the cloud at
  stage `on` and the release v3.0.0. It should be released before this work is deployed, so
  that the invitation function meets a pool that sends invitations. At the merge: `main`
  into `multilanguage` first, the checks, then back. Files both touch:
  `backend/samconfig.toml` (m10's `MailStage` and this plan's `DefaultLanguage`, both kept),
  `backend/template.yaml` (the pool: m10 changes nothing there by plan, but it is read line
  by line), `docs/RUNBOOK.md`, `docs/ARCHITECTURE.md` (the version rows: the mail's first,
  this plan's after), `README.md`. If m10 changed a word of the invitation or of a mail, the
  English texts of `shared/src/mail/texts.en.ts` take it and the Italian ones follow.
- **`gdpr` and `whatsapp`**: each adds texts a person reads. Whichever is merged before this
  work is swept up at the merge; whichever after puts its texts into the objects itself. At a
  merge the checks do most of the finding: a word written into `index.html`, a view or a
  model fails the tests of step l3; a text added to an English object without its Italian
  does not compile. What they cannot find is searched by hand, in the merged diff: a new
  sentence in `shared/src/mail/`, `backend/src/lib/excel.ts`, the mailer's file names, the
  template's invitation, the assistant's instructions.
- **The assistant.** Step l8 changes the instructions; so may `whatsapp`. The paid evaluation
  judges the code that is deployed: if a merge after phase B's item 5 changes the
  instructions again, it is run again, its cost said first.

## 10. Out of this plan

- A third language: the architecture's section 5.3 says what it takes; nothing here prepares
  more than the one list.
- The Users list showing a User's language (O3); the names of appointment types in two
  languages (O5); a date written in words in an Excel cell (O4).
- An invitation in the invited person's own language: an invited person has none (L1).
- Translating the bounce and alarm mails, the logs, the API's `message`, the scripts.
- A layout that changes with the language, a width measured in a test (L16).
