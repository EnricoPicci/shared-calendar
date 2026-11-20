## Brief

Implement plan step 66, "Users" (`docs/FRONTEND_VIEW_PLAN.md`), following CLAUDE.md's working
rhythm: one step, its acceptance check, an honest report, then stop for review.

One stop at the end. Four choices about the screen were made with me while this brief was
written (section "Settled before the first line of code"). There is no early stop.

This step gives the Administrator a third screen: the list of the users, a form that creates
one, and a button that deletes one. It is the first screen that shows a secret: the password
the server generates for a new user is shown once, in a dialog, and can never be shown again.
How that password reaches the page, and how it leaves it, is the heart of the step. It is also
the second form with a field that is checked (the username), so the pattern step 65 settled for
a field in fault is used a second time here, unchanged. It changes nothing in `backend/`,
`shared/` or `frontend/src/services/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular:
  - the "Comments" section (`npm run lint` enforces it, so `verify` does too);
  - "Tooling and style": no library, abstraction or tool the documents do not call for;
  - the folder map's `frontend/` entry (the view layer and the logic layer as built), the
    commands `dev`, `build` and `seed:local`, and the test conventions for the logic layer, the
    views and the shell;
  - the hard rule on logs and secrets: a password never goes into a log, a command-line
    argument or a file. It holds for the browser check's script too.
- `docs/FRONTEND_ARCHITECTURE.md` v7, all of it. It is the source of truth for this step: the
  thirteen rules of a view (section 3; rules 3, 4, 5, 9, 10 and 12 above all), the shape of a
  view (section 4: the shape of a dialog, "The list's shape", and the shape of a form whose
  fields are checked, with a field in fault), the logic layer and what was built (sections 5
  and 5.1: the settings screen and the list screen are the nearest things to what this step
  builds), the shell, the table of screens and what a session owns (section 6), the fallback
  and its three conditions (section 7), the tests (section 8, with what `happy-dom` does not
  emulate of the native `<dialog>`), the language (section 12.4), decisions 27, 68, 69, 75
  and 76.
- `docs/FRONTEND_VIEW_PLAN.md`: sections 1 and 4, step 66, and steps 67 and 68 to see what this
  step must leave ready (two more screens for the Administrator, each with lists, forms and
  deletions to confirm).
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules; rule 6 and its one exception above all),
  section 13, all of it (`UsersService`: `createUser`, `deleteUser`, `listUsers`, what is
  checked before sending, the codes, and 13.7 on where the generated password lives and until
  when), section 10.2 (`invalid_request` and its message), and section 8, decisions 24, 31
  and 37.
- `docs/SHARED_CALENDAR_SPEC.md`: section 10 (10.1, the list: plain Users only, sorted, never an
  administrator; 10.2, what deleting a User does to the calendar, its order and
  `409 concurrent_update`), and section 16.3 (a failed write may have been applied).
- `docs/ARCHITECTURE.md` section 4, the routes `POST /users` and `DELETE /users/{username}`
  (the username rule, the codes), and the hard rules on administrators: the API never creates,
  deletes or changes one.

Then read the code this step builds on:
- `frontend/src/services/`: `users.service.ts` and `users.types.ts`.
- `shared/src/username.ts` (`USERNAME_PATTERN`, `Username`).
- `frontend/src/logic/`: `settings.model.ts` and `settings.screen.ts` (a pure file with the
  checks of a form and their sentences, and a screen class beside it: the model for this
  step), `appointments.screen.ts` (a list read again after a write and when the tab becomes
  visible), `booking.ts` (`userChoice`: the book dialog's use of `listUsers`, which this step
  must not disturb), `texts.ts` (`failureText`), and their tests in
  `frontend/tests/unit/logic/` (`zone.ts` and `fixtures.ts` first).
- `frontend/src/views/`: `settings.view.ts` (a field in fault), `appointments.view.ts` (a list
  of rows redrawn only when the list object changed), `detail.view.ts` (a dialog with an
  action, its "asked" variable, its teardown), `week.view.ts` (where `listUsers` is called and
  `listUsersState$` read for the book dialog), `shell.ts` (`SCREENS`, `sessionObjects`: the
  `UsersService` is created there already, one per session), and their tests in
  `frontend/tests/unit/views/` (`page.ts` first; in `shell.test.ts` the blocks of the settings
  and the test "a second person signing in sees nothing of the first").
- `frontend/index.html` (the frame, the three screens, the dialogs) and `frontend/style.css`.

## Where we are (2026-11-20)

- Step 65 is committed and pushed (`f7148db`): the settings. Its browser check was run again
  on 2026-11-20 and passed on every line. Check `git status -sb` rather than trusting this
  line.
- What step 65 left for this step:
  - **the pattern of a field in fault** (`docs/FRONTEND_ARCHITECTURE.md` section 4 and
    decision 69): a `.field` with its label and input, its sentence in `.refusal`
    (`role="alert"`), `aria-invalid` on the input, all set from the stream; the form has
    `novalidate`. Use it as it is. If it does not fit a username, stop and say why;
  - `sessionObjects` creates one `UsersService` per session and hands it to the week view,
    whose book dialog calls `listUsers()` when it opens for the Administrator and reads
    `listUsersState$`. The users screen will use the same service, so the same pair of
    streams (design point 6);
  - `failureText` has sentences for the transport reasons, `forbidden`, `invalid_json`,
    `invalid_request`, `internal_error`, `concurrent_update` and `user_not_found` ("This user
    no longer exists."). It has none for `user_exists` and `cannot_delete_admin`. Verify, do
    not assume;
  - the Administrator's navigation has two links, "Week" and "Settings". This step gives it a
    third;
  - **the shell's test of a second person** (`shell.test.ts`, "a second person signing in sees
    nothing of the first") signs `alice` out, signs `admin` in and expects the whole frame's
    `textContent` not to hold the word "User", the first person's role. The page's fixed texts
    are in that `textContent` also while hidden, which is why step 65 wrote "per person" in
    the settings' label (decision 75). This screen is called "Users" and its dialogs speak of
    a user: that assertion cannot stay as it is (design point 9).
- The local calendar, if nobody emptied it since: the types "Studio" and "Piscina", 8 patterns
  valid 2026-11-20 to 2027-01-19, five booked appointments of `alice` (20, 21, 23, 25 and 26
  November) and one cancelled, left by the check of step 65. The settings hold the default
  values (24, 0, 56, no limit), last saved by `admin` on 2026-11-20. The users are `admin` and
  `alice`. Look before relying on it (read-only, through the API).
- The Codespace has no browser. The check of step 65 ran in Playwright's headless Chromium,
  installed outside the repository (the package in a scratch folder, the browser in
  `~/.cache/ms-playwright/`). The same way is fine; nothing of it goes into the repository.
  Lessons from that check:
  - read what a person can see and the values of the form fields, not the page's source;
  - give every name and note the check writes a tag of its run;
  - run the whole script once it is right, not many times: each run leaves history;
  - the browser reports every 4xx answer as a console line "Failed to load resource" (the
    wrong password of the login is one: Cognito answers 400), which is not an error of the
    page;
  - **signing out leaves the address**: the same person signing in again lands on the screen
    they left, not on the week. A script that waits for the week there waits for ever;
  - a field the script filled stays filled: put every field back before the next case, or a
    case reports the leftovers of the one before;
  - Chromium lets no letter into a number field. A text field takes everything, so the cases
    of this step's username can all be typed.
- Plan step 58 (`docs/IMPLEMENTATION_PLAN.md`, the old stack) is independent of this step. Do
  not touch it.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22.
- This brief file is untracked when you read it; ask me whether to commit it.

## Settled before the first line of code

Four choices about the screen that no document had made. Apply them as written.

1. **The password dialog has no "Copy" button.** The password is a plain text that can be
   selected and copied by hand. The page never touches the clipboard.
2. **The password dialog is closed by its button only.** The password cannot be shown again
   and no route sets another, so a key pressed by mistake must not lose it: the Escape key
   does not close this one dialog. Its button says "I have noted the password". The other
   dialogs of the page keep closing with Escape.
3. **Deleting asks for confirmation in a dialog with two buttons.** It names the user and says
   that their future appointments will be cancelled and that this cannot be undone; "Delete
   user" deletes, "Keep" closes. Nothing is typed to confirm.
4. **A row of the list shows the username only**, with its "Delete" button. The creation date
   that `GET /users` also gives is not shown, so the screen needs no time zone and makes one
   request, `GET /users`.

## Design points

Apply them as written; if the code proves one wrong, stop and say so with a proposal.

1. **Where the new logic goes** (`frontend/src/logic/`, each file with its test in
   `frontend/tests/unit/logic/`):
   - a pure file for the screen: from the state of `listUsers` to the rows of the list and the
     sentence of an empty list; from what the username field holds to either the argument of
     `UsersService.createUser` or the refusal of the field; the words of the delete dialog for
     a username;
   - a class for the screen, shaped like `SettingsScreen`: one public stream, `void` methods,
     nothing started by the constructor. It reads the list at `start()`, takes "create" with
     the field's text, checks it, calls the service only when the text is accepted, and reads
     the list again after a create or a delete (design point 5);
   - `texts.ts` gains the sentences of `user_exists` and `cannot_delete_admin`, and nothing
     else unless a code of the three routes has no sentence.
2. **The username is checked in the logic layer, before any call**, with the shared `Username`
   schema and nothing written a second time: no pattern and no length in `frontend/src`.
   - The service checks the same text and answers `invalid_request` with a message, but that
     message is a developer's and never reaches the page (`docs/FRONTEND_ARCHITECTURE.md`
     section 11, decision 27).
   - The refusal is one sentence under the field, in the pattern of a field in fault: it says
     what a username is (3 to 32 characters; lowercase letters, digits, ".", "_" and "-";
     starting with a letter or a digit). The same words stand under the field all the time as
     its hint, where the settings have a range. I review the words in the report.
   - Spaces around the name are removed before the check, as a name pasted with a space would
     have them; nothing else is changed: "Bob" is refused, not sent as "bob".
   - "", "ab", "Bob", "alice smith", "-alice", "a.b_c-1", a name of 32 characters and one of
     33, " carol " and "admin" each have a decided outcome, tested. "admin" passes the check:
     the server answers `user_exists`.
   - `user_exists` is the server's answer, not a refusal of the check: it is the form's
     failure, in plain words, and the field is not marked in fault.
   - The schema stays the last word: a name the logic accepted and the service refuses is a
     defect to report.
3. **The password: where it is and where it is not.** `docs/FRONTEND_SERVICES.md` section 2,
   rule 6 has one exception, and this step is where it is used.
   - **It does not pass through the logic layer.** The screen object's stream says that a
     create is under way, that it failed and why, or that it succeeded for which username;
     it never carries the password, so no state object, no test fixture of the logic layer
     and no log of a stream can hold it. The view takes the password from the service's own
     create result, at the moment it shows it.
   - **It reaches the page through `textContent`**, in one element of the password dialog,
     and nowhere else: not an attribute, not a field's value, not the address, not the title,
     not a `console` call. The dialog shows the username, the password and the sentence that
     it cannot be shown again and must be given to the user now.
   - **It leaves the page** when the dialog is closed and when the view is left (a change of
     screen, signing out), in the view's teardown, like every other text a view put there.
   - **It is shown once.** The service keeps the create's success, password included, until
     the next `createUser` or the end of the session (`docs/FRONTEND_SERVICES.md` section
     13.7). Coming back to the screen must not open the dialog again: a result that was there
     before this mount is not this mount's. Use the "asked" variable of the other dialogs.
   - The username field is emptied after a create that succeeded, from the stream; after a
     failure what was typed stays.
4. **The Escape key and the password dialog** (settled point 2). `happy-dom` has no Escape key
   and no `cancel` event (`docs/FRONTEND_ARCHITECTURE.md` section 8), so the unit test can only
   send the event itself; what counts is the browser check.
   - Find out first what Chromium does: a `cancel` event that is refused
     (`preventDefault()`), the attribute `closedby="none"`, or both. I believe Chromium
     closes a dialog at the second Escape in a row even when the first `cancel` was refused,
     and that `closedby="none"` is what stops it; **verify this in the browser, do not take
     my word for it**, and say in the report what you found and what the page uses.
   - If no way holds against Escape pressed several times, stop and say so with a proposal
     before building something of our own around the native dialog.
   - The button is the dialog's only way out and has the focus when it opens, or is the next
     Tab from where the focus lands: say which.
5. **Reading the list again.**
   - `start()` reads the list; while it is not known the screen says it is loading. A failed
     read is said in plain words in the place of the list, with a way to try again; the form
     that creates a user stays usable.
   - The list is read again after every result of a create and of a delete, a failure
     included: a delete answered `user_not_found` means the list on show is old, and a write
     that failed may have been applied (`docs/SHARED_CALENDAR_SPEC.md` section 16.3).
   - It is read again every time the tab becomes visible, like the week and "My
     appointments", through the same stream the shell hands the screens. A dialog that is
     open stays as it is, the password dialog above all.
   - Not for a result that was already there at `start()`.
   - The rows are redrawn only when the list object changed, so the focus stays on a row's
     button through a notification that brings nothing new.
6. **One `UsersService` per session, used by the book dialog and by this screen.**
   `listUsers` has one pair of streams and one pending call: a list asked by the book dialog
   and one asked by this screen are the same call. Only one screen is on show at a time, so
   the two never ask together; even so:
   - this screen takes no list that was there before its `start()` (the book dialog may have
     left one), and reads its own;
   - the week view and `userChoice` do not change. After this step a user created here is in
     the book dialog's list at its next opening, and a deleted one is not, with no code for
     it: the browser check shows it;
   - `createUser` and `deleteUser` have their own pairs and are used by this screen only.
7. **The markup.** One screen element, `#users`, with:
   - the form that creates a user: one `.field` (the label, the text input, the hint, the
     refusal), the failure, "Create user". The input has `autocomplete="off"`,
     `autocapitalize="none"` and `spellcheck="false"`: a browser must not offer or correct a
     username;
   - the list: the loading, the failure with "Try again", the sentence of an empty list, the
     `<ul>` and the template of a row (an `<li>` with the username and one
     `<button type="button">` "Delete"). The button's accessible name says whom ("Delete
     alice"), set by the script;
   - two native dialogs, opened with `showModal()`: the password's (the username, the
     password, the sentence, its one button) and the delete's (the words, the failure, "Keep"
     and "Delete user"). The delete dialog shows its failure and stays open; it closes on its
     success. While a delete is under way "Delete user" is disabled. `concurrent_update` has
     its sentence and the person presses again.
   - **No class of the page holds the word `admin`** (the shell's test looks for that name in
     the whole document after a sign-out).
   A region that is redrawn holds no input field (rule 4): the rows hold buttons only, and
   the form is outside the list.
8. **The shell.** A fourth entry of `SCREENS`: `#/users`, "Users", the role `admin` only,
   after "Settings". `SessionObjects` gains the users screen. The code that reads the address,
   fills the navigation and switches between screens should not need to change; if more must
   change, say what and why.
9. **The shell's test and the word "User".** The assertion
   `expect(find('#app').textContent).not.toContain('User')` cannot hold once the page has a
   screen called "Users". Replace it with one that still proves that nothing of the first
   person is left, without relying on a word the page's own fixed texts hold: the element of
   the role says "Administrator", and no element that the first person's session filled
   (the header, the navigation, the screens' lists, fields and dialogs) holds anything of
   theirs. Say in the report what the new assertion is and what it would still catch. In
   `docs/FRONTEND_ARCHITECTURE.md`, decision 75 gets the sentence that its reason ended with
   this step; the label "per person" stays as it is. Bring CLAUDE.md's test conventions in
   line (the sentence "which is why no label of the page holds it").
10. **Watch the fallback** (`docs/FRONTEND_ARCHITECTURE.md` section 7). A list of rows with a
    button each, beside a form and two dialogs, is three streams' worth of node look-ups. If
    the code that looks nodes up grows longer than the rest of the view, or a helper that
    builds or updates nodes is about to be written, stop and say so before writing a
    workaround. The delete dialog of this step is what steps 67 and 68 will copy for a type,
    a pattern, an override and a window: keep it small and say its shape in the architecture.
11. **Tests.**
    - The logic: every function and every path, with a fake service and under
      `useFarBrowserZone()`. Most of the step's cases are here. No fixture of the logic
      layer holds a password.
    - The view: the real `index.html`, a fake screen object and a fake `UsersService` part.
    - The shell: the real service behind the stubbed `fetch`.
    - Everything inside the 100 % line coverage; `src/main.ts` stays the one file left out.

## The step

What `docs/FRONTEND_VIEW_PLAN.md` step 66 lists.

- **Logic**, with tests that include:
  - the rows from the list: several users in the server's order, one user, none (the sentence
    of an empty list), a username containing `<script>` kept as text;
  - the username: each of the texts of design point 2, with what is sent or the refusal; the
    refusal's words equal to the hint's; every accepted text accepted by the shared `Username`
    schema too (checked in the test);
  - the words of the delete dialog for a username;
  - the screen: nothing read before `start()`; the read, its failure and the next try; a
    create refused by the check (no call, the list kept); a create that succeeds (the call,
    the list read again, the field's text to empty, the username of the success in the
    stream and no password anywhere in it); a create that fails with `user_exists` and with
    a transport reason (the failure in plain words, the list read again all the same, the
    text kept); a second create while one is under way; a delete that succeeds, one that
    fails with `user_not_found`, with `cannot_delete_admin` and with `concurrent_update`,
    each followed by a read; the tab becoming visible; a list, a create result and a delete
    result that were already there at `start()`; nothing read after the subscription ends;
    started again, the list read again.
- **The sentences:** `user_exists` and `cannot_delete_admin` in `texts.ts` with their tests;
  the hint and the refusal of the username; the sentence of an empty list; the words of the
  two dialogs. `cannot_delete_admin` cannot arrive from this screen (the list never holds an
  administrator) and still gets its sentence.
- **Markup and styles:** design point 7; their styles in `frontend/style.css`. The password is
  shown in a fixed-width face, large enough to tell `l` from `1` and `O` from `0`, and wraps
  on a phone. A phone and a desktop are served by the same markup. No inline script, style or
  handler (`page.test.ts` keeps passing, with its assertions brought in line).
- **The view:** `users.view.ts` and its DOM test:
  - every state of every stream it listens to;
  - "Create user" and its call with the field's text as it is; the refusal shown beside the
    field and announced, and gone when the stream says so; the field emptied only when the
    stream says so;
  - the password dialog: opened by a success of the create this mount asked for, with the
    username and the password as text (one containing `<script>` shown as text); not opened
    by a success that was already there at the mount; the `cancel` event refused; its button
    closing it; **after the close the password is nowhere in the document, and after the
    view is left it is nowhere in the document** (`docs/FRONTEND_VIEW_PLAN.md` step 66,
    acceptance), looked for in the whole `outerHTML` and in every field's value;
  - a row's "Delete" opening the delete dialog with that user's words; "Keep" and Escape
    closing it with no call; "Delete user" and its call; pending, each failure, the success
    closing it; a result of a delete this dialog did not ask for changing nothing in it;
  - the rows redrawn only when the list object changed; a username containing `<script>`
    shown as text in a row, in the button's accessible name and in the delete dialog;
  - nothing left in the page after unsubscribing: no row, no name, both dialogs closed and
    empty, the field emptied, no field in fault.
- **The shell:** the Administrator's navigation with its three links and the one marked;
  `#/users` typed by a User shows the week and the address is put right; the screen asks
  `GET /users` with the person's token; a create sends the `POST`, shows the password and
  reads the list again; a delete sends the `DELETE` and reads again; users, week, users:
  nothing left over or doubled, and the password dialog not opened again; signing out with
  the password dialog open leaves the password nowhere in the document, and the next person
  sees nothing of the first; the test of design point 9; the book dialog's list of users
  still asked for at its opening, as step 62 checked.
- **Documents:**
  - `docs/FRONTEND_ARCHITECTURE.md` v8: section 4 (the shape of a dialog that confirms a
    deletion; the password dialog and why Escape does not close it), section 5.1 (the new
    files, the users screen, the check of the username, the reads of the list, where the
    password is and is not), section 6 (the fourth entry, what a session owns), section 8
    (what was learnt about `happy-dom` and about Chromium: the `cancel` event, `closedby`),
    section 9, the decisions table (the four settled points, the password's path, decision
    75's end), the status line and the change log.
  - `docs/FRONTEND_VIEW_PLAN.md`: the status line (step 66 done, with its date), and step
    66's text brought in line with what was settled, with a change log line.
  - `docs/FOLDER_STRUCTURE.md`: the tree of section 2 and section 7, for the files added.
  - `CLAUDE.md`: the folder map's `frontend/` entry, the test conventions (design point 9
    and whatever was learnt), "Where the truth lives".
  - `README.md`: "The page, locally", in a line or two.

Not in this step:
- a password set, changed or shown again; a "Copy" button; the clipboard;
- an administrator created, listed or deleted;
- the creation date of a user, a search, a sort or pages in the list;
- how many appointments a deletion cancels, said before or after it;
- anything about types, patterns, overrides or windows (steps 67 and 68);
- any change to the book dialog, to `userChoice` or to the week view;
- anything in `backend/`, `shared/` or `frontend/src/services/`. If a point needs a change
  there, stop and say why first;
- any new dependency; `lit-html`, unless a condition of `docs/FRONTEND_ARCHITECTURE.md`
  section 7 is met, in which case stop and say so;
- the size of the bundle, hosting, CORS, logout as a service, the session in `sessionStorage`;
- the cloud: no deploy, no AWS command.

### The browser check

Against the local stack, on `npm run dev -w frontend`, at a desktop width and at a phone width.
The first call of each route takes a few seconds under `sam local`: wait for it, do not count
it as a failure. The check creates throw-away users named with the tag of its run
(`chk66-<number>`, within the 32 characters of a username) and **deletes every one of them at
the end, whatever happened**; it also reads the settings first and, if it changed any, writes
them back. **The script never prints a generated password**: it reads it from the page into a
variable, uses it to sign in, and reports only that it worked and how long the password is.

Steps 60 to 65 again, in short:

1. a wrong password shows the sentence; `alice` signs in and sees the week of today; she books
   a free slot with a note and cancels it; "My appointments" lists her appointments;
2. as `admin`, "Settings" shows the four values and "Save" with a value out of range is
   refused under its field with no request sent.

Step 66, as `admin`:

3. the navigation has "Week", "Settings" and "Users"; the third shows the list, with `alice`
   and without `admin`; the address is `#/users` and its link is the one marked; the one
   request of the screen is `GET /users`;
4. a username that is not allowed ("Bob", "ab", an empty field, one with a space inside) is
   refused under the field with no request sent; an allowed one that exists (`alice`, and
   `admin`) is refused by the server, said in plain words, and what was typed stays;
5. **a user is created**: the `POST`, then `GET /users`; the dialog shows the username and the
   password with its sentence; the new user is in the list behind it; the field is empty;
6. **the Escape key does not close the password dialog**, pressed once, twice and five times
   in a row; a click outside it does not either; the button closes it;
7. **after the close the password is nowhere in the page**: not in what the page shows, not in
   the document's source (`outerHTML`), not in any field's value, not in the address;
8. in another window, the new user signs in with the password shown and sees the week as a
   User;
9. users, week, users: the password dialog does not open again and the password is still
   nowhere in the page; the list is read again;
10. as `admin`, in the week, the book dialog's list of users holds the new user; the
    Administrator books a slot for them;
11. **the user is deleted**: the dialog names them and says that their future appointments
    will be cancelled; "Keep" and Escape close it with no request; "Delete user" sends the
    `DELETE`, then `GET /users`; the dialog closes and the row is gone;
12. the appointment of line 10 is then cancelled in the week (the Administrator's view shows
    it no more), the book dialog's list no longer holds the user, and in the other window the
    deleted user's next action is refused in plain words or signs them out: say which;
13. a delete that the server refuses or that cannot reach it (the request failed by the check,
    with `page.route`: a 409 `concurrent_update`, a 404 `user_not_found`, a connection
    refused) is said in plain words in the dialog, which stays open; the list is read again;
    "Delete user" works again;
14. a create that cannot reach the server is said in plain words, the typed name stays, and
    "Create user" works again;
15. a second user is created with the password dialog left open, then the tab becomes visible
    again (the check defines `visibilityState` and sends `visibilitychange`): the list is read
    again and the dialog still shows the password;
16. sign out with the password dialog open, sign in as `alice` in the same page: no password,
    no username of the created user and no name of the first person in what the page shows,
    in its source or in its fields.

As `alice`:

17. the navigation has "Week" and "My appointments", not "Users"; `#/users` typed by hand
    shows the week and the address is put right; no request to `/users` is made from her
    page.

Both:

18. at the phone width the form, the list and both dialogs fit the screen, a username of 32
    characters and the password wrap, and nothing makes the page wider;
19. by keyboard only: reach "Users", type a name, create with the Enter key, hear the dialog
    (it has a name: `aria-labelledby`), close it with its button, reach a row's "Delete",
    confirm with the keyboard; say where the focus is after each dialog closes, above all
    after a delete, when the row whose button opened the dialog is gone;
20. the console shows no error and no violation of the Content-Security-Policy other than the
    known one of `zod`; no request to another origin; **no password in any console line**.

At the end the check deletes every user it created, cancels what it booked, and reads
`GET /users` once more to say that only `alice` is left. Say what stays in the local table as
history (the cancelled appointments, their events, the deleted users' markers) and in
`backend/.cognito/`.

Run it in a headless browser if you have one without adding anything to the repository (say
which and where it was installed), and report line by line. Whatever you could not check
yourself, hand to me as a list: I run it by hand at review.

## How we work in this step

- **The local stack:** I start it (`local:up`, the iptables rule, `local:api`). Ask me when you
  need it; do not start or stop it yourself. The dev server you may start and stop (stop it as
  `CLAUDE.md` says: the plain `pkill -f` kills its own shell).
- **The local users and the local `calendar` table:** the browser check creates and deletes
  users, and each deletion leaves a marker in the table. Never run the back end's integration
  journeys in this step (they empty the table), nor the front end's while the browser check is
  under way (they create and delete users of their own and set the settings for their run).
  Never delete `alice` or touch `admin`. If a run of the check is cut short, the first thing
  to do is to list the users and delete the run's own.
- **Hard rules:**
  - the thirteen rules of a view and the rules of the logic layer
    (`docs/FRONTEND_ARCHITECTURE.md` sections 3 and 5);
  - no `document`, `window` or element in `frontend/src/logic` (lint enforces it); no rule in
    a view: whether a username is accepted, and the words of a refusal, are decided in the
    logic layer;
  - a handler never changes the screen to show an outcome: every change comes from a stream,
    except opening and closing a dialog;
  - **the generated password**: in the page through `textContent` only, in one element, gone
    at the dialog's close and at the view's teardown; never in the logic layer, in a log, in
    the address, in an attribute, in a test's snapshot or in the output of a script;
  - `frontend/src` imports only `rxjs`, `rxjs/fetch`, `rxjs/operators`,
    `@shared-calendar/shared` and relative files;
  - no token reaches a view, the logic layer, the document or a log; a username reaches the
    page through `textContent` (and the accessible name of a button) only and is never
    logged; the service's `message` never reaches the page;
  - the existing tests keep passing unchanged, except where this brief says a case changes
    (`page.test.ts` on the screens, the dialogs and the templates; the shell's tests of the
    Administrator's navigation; the shell's test of design point 9); if another must change,
    say which and why;
  - comments follow CLAUDE.md "Comments"; lint must pass;
  - no AWS command and no deploy.
- **When `docs/FRONTEND_ARCHITECTURE.md`, the plan, the spec or `docs/FRONTEND_SERVICES.md`
  disagree, or one is unclear or proves wrong**, stop and tell me, with a proposed change. Do
  not edit the rules silently.

## Acceptance (`docs/FRONTEND_VIEW_PLAN.md` step 66)

- The design points applied as written, and the four points settled before the start applied
  as settled (any deviation reported with its reason).
- `npm run verify -w frontend` green: typecheck, lint, the services' tests unchanged, the
  logic's and the views' tests, 100 % line coverage of `frontend/src` (only `src/main.ts` left
  out).
- **The test of the view shows that the password is gone from the document after the dialog
  is closed and after the view is left** (the plan's own acceptance line), and the shell's
  test shows it after a sign-out.
- The browser check, line by line, with steps 60 to 65 in short, every user it created
  deleted, and no password in its output.
- What Chromium does with Escape on the password dialog, and what the page uses against it
  (design point 4).
- The report says how long each view file is (lines, and how many of them look nodes up), how
  long `index.html` became, what the dialog that confirms a deletion is in the markup and in
  the view (the pattern steps 67 and 68 will copy), and whether any condition for the fallback
  (`docs/FRONTEND_ARCHITECTURE.md` section 7) was met or came close.
- The table of the sentences, new and changed: I review the words.
- Which existing test cases changed, and what changed in each; the new assertion of design
  point 9 and what it would still catch.
- `npm run build -w frontend` still writes `frontend/dist/`; the size of `app.js`, plain and
  compressed, beside step 65's (532 kB, 117 kB).
- The root `npm run lint` and `npm run typecheck` green; `npm run audit -w backend` reported.
- The documents updated.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step 67.
