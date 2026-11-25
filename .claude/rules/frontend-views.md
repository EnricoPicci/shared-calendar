---
paths:
  - "frontend/src/views/**"
  - "frontend/tests/unit/views/**"
  - "frontend/index.html"
  - "frontend/style.css"
---

# The front end's views: the page, the style sheet and their tests

Adds to `frontend/CLAUDE.md`. The design is `docs/FRONTEND_ARCHITECTURE.md` (the tests in its
sections 8 and 12.3). Paths are relative to `frontend/`.

## The page and the style sheet

- A new class of the page is looked for in `style.css` first: the tests apply no style, and
  `dialog .noted` once hid a button that had taken that name.
- No class may hold the word `admin`: the shell's test looks for that name in the whole
  document.
- `tests/unit/views/page.test.ts` holds what a person without a mouse needs of `index.html`
  (its block "without a mouse"): every field inside a `<label>` with words of its own; every
  button with words or a name; every `.error` a `role="alert"` and nothing else an alert; every
  "Loading…" a `role="status"`; the two dialogs that ask described by their question. It counts
  the fields (52) and the places of a failure (53): a new field or a new failure line changes a
  number there, on purpose.
- What a screen reader says aloud, and where the keyboard is after a dialog closes (the table
  of `docs/FRONTEND_ARCHITECTURE.md` section 8), are for the walk (`docs/FRONTEND_WALK.md`).

## Every view's test

- Every file calls `useRealPage()` (`tests/unit/views/page.ts`), which loads the `<body>` of
  the real `index.html` before each test; no test writes markup of its own, so a selector that
  does not match the page fails.
- The mount function gets fake services: plain objects typed with the view's `…Deps`, whose
  streams are subjects the test controls and whose methods are `vi.fn`.
- Every view's test has: each state of each stream, each action of the user and its call, a
  text with `<script>` shown as text, and nothing left in the page after unsubscribing.
- A test that looks in the whole document (`outerHTML`) for what a person left behind looks for
  data, not for fixed words of the page: the comments of `index.html` are in it.
- The page's fixed texts are in the frame's `textContent` also while hidden, so a test never
  looks there for a word the page may hold.
- A test helper that puts a screen's id before a selector scopes only the first part of a list
  of selectors (`#availability li, option` is every `<option>` of the page): count what a view
  left behind from the screen's element.
- A generated password in a test is a made-up text, in the views' and the shell's tests only
  (the logic's fixtures hold none, and no test takes a snapshot); "nowhere in the document" is
  looked for in the whole `outerHTML`, in every field's value and in the address.

## What `happy-dom` does differently

What it cannot show is for the browser check.

- `import.meta.url` is not a `file:` URL: use `import.meta.dirname`.
- Parsing a whole page with `DOMParser` tries to load its style sheet: use a `<template>`, as
  `pageAside()` does.
- The native `<dialog>` has no Escape key, no inertness and no focus handling. A dialog's test
  calls `close()` for the Escape key; since a click passes through a modal dialog there, a test
  can have both dialogs open, which a person cannot.
- It has no `cancel` event, ignores `closedby` and `autofocus`, and sends `close` inside
  `close()`: a test sends `cancel` itself to see it refused, and sends a `close` event itself
  after an opening to stand for the browser's late one. That Escape does not close the password
  dialog, and where the keyboard lands (on nothing, after a write that redrew the list), are
  for the browser check.
- A `disabled` button's `click()` does nothing there, as in a browser.
- A native date field's `value` is set and read as `YYYY-MM-DD` and emptied by `form.reset()`;
  what can be typed into it is for the browser check, where it is typed as digits in the order
  the browser shows its parts (the day first, or the month first).
- A number field's `value` is set and read as text (a text that is not a number reads back
  empty).
- A checkbox's `click()` sends `change` but no `input` event, so a test of an edit typed into a
  field sends `input` itself. A checkbox's `value` is always "on", so a test that reads every
  field of the page reads a checkbox by `checked` (the shell's test has `held(field)` for
  that).
- A list (`<select>`) set to a value none of its choices has reads back empty with
  `selectedIndex` −1, as in a browser, which is how the availability's forms have no type
  chosen; rebuilt with `replaceChildren`, and after `form.reset()`, it has its first choice
  chosen. The `textContent` of a `<label>` around a list holds the texts of the list's choices:
  a test that reads a label's words reads its first text node.
- It sends a `hashchange` on `history.replaceState` too, which a browser does not: harmless for
  the shell (`distinctUntilChanged` on the screen), but do not build on it.
- In the browser check, a button the page does not offer (the day's three while the list of
  "this day only" is open) cannot be pressed.

## The detail dialog and the week

- The detail dialog's cases are in `detail.view.test.ts` and run three times (`describe.each`):
  mounted alone, by the week view and by the list's view. A new case of the dialog goes there,
  and the two views' tests keep only what is theirs (which appointment is opened, what "Change"
  does).
- The fake `WeekScreen` of the week view's test moves nothing by itself: a test starts a move
  by sending a state with `moving` through `week$`.

## The availability's two views

- The availability view's test hands the mount function a fake screen whose `conflicts` is a
  `vi.fn` that makes the rows in the calendar's zone of the test.
- The dialog that confirms is the real one: the tests of the two views call
  `mountConfirm(find('#availability'))`, hand it to the mount function and add its subscription
  to the view's, as the shell does; what neither view can see alone (an opening made after
  another is the only one told) is in `availability.parts.test.ts`.
- A count of the fields of `#availability` counts the screen's three parts (31: the 20 of the
  first view's four forms and the 11 of a single date; a time is two lists, an hour and a
  minute).
- The view's test of a single date builds its states with the logic layer's own `dayModel`,
  `draftModel` and `conflictList`, and runs the dialog's cases once per kind (`describe.each`).

## The shell's test

- It uses the real `SessionStore` (memory only) and resets the emulated page's hash before each
  test.
- It stubs the global `fetch` for the whole file (unanswered unless a test answers it):
  entering the frame creates the real `CalendarService`, which loads the week, and the real
  `AppointmentsService`, `UsersService`, `CalendarSettingsService`, `AvailabilityTypesService`
  and `AvailabilityRulesService`, which a test reaches through the two dialogs and the screens.
  The requests to answer, in this order:
  - `#/appointments`: the settings first, the list second;
  - the settings: one `GET`; after a `PUT` another `GET`;
  - the users: one `GET /users`; after a `POST` or a `DELETE` another;
  - `#/availability`: three requests, the settings, the types, the patterns, and no fourth
    until a date is shown; after a write to a type another `GET /calendar/types`, after a write
    to a pattern another `GET /calendar/patterns`;
  - a date shown is one `GET /calendar?from=<date>&to=<date>`, asked again after every write to
    that date, and after a write to a pattern or a type, then following that write's own read;
  - the tab shown again asks the types, the patterns, then the date.
- An appointment id that reaches a real service must be a ULID (the fixtures' `appt-…` ids are
  refused before any request); so must a type's and a pattern's id in the test of the
  availability.
- The test of a second person compares the whole page (its source and what every field holds,
  the clock standing still) with the page that person finds when nobody was there before.
- The test of the tab becoming visible defines `visibilityState` on the document and sends
  `visibilitychange` itself, and removes the property after each test.
