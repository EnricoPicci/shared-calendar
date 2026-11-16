# View prototypes — plain HTML/CSS against `lit-html`

**Throw-away.** Two versions of the same two views, the login and the week calendar, to choose
how the view layer is written (`docs/FRONTEND_VIEW_OPTIONS.md`). Delete the whole `prototypes/`
folder once the choice is made: nothing else in the repository refers to it, and it is not an npm
workspace (its one dependency, `lit-html`, is installed in `prototypes/node_modules`, and the
root `package.json` and lock file are untouched).

## What is where

| Folder | What | Lines |
|---|---|---|
| `view-plain/` | **Plain HTML/CSS**: `index.html` holds all the markup (sections, dialogs, `<template>` elements); `login.view.ts` and `calendar.view.ts` find the elements, fill them and attach the handlers | 332 (107 HTML + 225 TypeScript) |
| `view-lit/` | **`lit-html`**: `index.html` holds two empty containers; `login.view.ts` and `calendar.view.ts` hold the markup as templates and the wiring | 253 (15 HTML + 238 TypeScript) |
| `common/` | Shared by both, so that only the views differ: `logic.ts` (the logic between services and views: which week, when to reload, where a block sits, the texts), `app.ts` (the services and the shell that switches between login and calendar), `style.css` (one style sheet: both versions produce the same elements and classes) | 376 |
| `serve.mjs`, `seed.mjs` | The dev server and a seed for the local calendar | |

The files to read side by side:

- `view-plain/login.view.ts` and `view-lit/login.view.ts`
- `view-plain/index.html` + `view-plain/calendar.view.ts` and `view-lit/calendar.view.ts`

Both use the real services of `frontend/src/services` unchanged.

## What the views do

- **Login**: username and password, the button disabled while the call is pending, the failure shown.
- **Calendar**, for the Administrator and for a User: the week from `GET /calendar`, with the
  availability windows coloured by type, the free slots, the appointments (the User's own, or
  everyone's with names for the Administrator), other people's appointments as "busy" blocks
  (User), week navigation, the time zone named. A free slot opens the **book dialog** (a note; for
  the Administrator also the User to book for, from `GET /users`). An appointment opens its
  **detail**, with "Cancel appointment" when the rules allow it. After a booking or a cancellation
  the week is loaded again. On a phone the days scroll sideways, one at a time.

Left out on purpose: changing an appointment, editing a note, the Administrator's custom start and
end, the offset label for the night the clocks go back, and logout as a designed service
("Sign out" only clears the session store).

## Running them

The back end's local stack must be up (`npm run local:up -w backend`, then
`npm run local:api -w backend`; in a Codespace the iptables rule of `CLAUDE.md` first).

```sh
node prototypes/seed.mjs          # only if the local calendar is empty: two types, a few patterns
node prototypes/serve.mjs plain   # http://localhost:5173
node prototypes/serve.mjs lit     # http://localhost:5174
```

Sign in as `alice` / `Alice-Local-Pass-1!` (User) or `admin` / `Admin-Local-Pass-1!`
(Administrator). The first call of each route takes a few seconds: `sam local` starts its
container.

The server bundles `main.ts` again at every page load, so an edit shows after a reload. It passes
`/api` and `/cognito` on to the local stack, so that the browser sees one origin: the API has no
CORS configuration yet (`docs/FRONTEND_SERVICES.md` section 10.3). It serves the page with the
strict policy `Content-Security-Policy: default-src 'self'`.

Bookings made while trying the prototypes go to the local `calendar` table. A cancelled
appointment stays there as history, as after the smoke test.

Type check: `npx tsc -p prototypes`. The repository's `npm run lint` covers the folder.

## What was checked

Both versions were driven in a headless browser, as `alice` and as `admin`: a wrong password, the
sign-in, the week, a booking with the note `<b>proto</b>` (shown as text in both), the detail, the
cancellation, a second opening of the book dialog (empty note, no old error), the Escape key, a
phone-sized window, the sign-out (no week left in the page, password field empty). All passed in
both. There are no automated tests in this folder.

## Findings from writing both

1. **Size is close.** Plain is about 80 lines longer overall, but a third of it is HTML, which
   reads more easily than either TypeScript file. The TypeScript is 225 lines against 238.
   Shipped size: `lit-html` adds 3.5 kB (110.0 kB against 113.6 kB, minified and compressed; the
   rest is `rxjs`, the services and mostly `zod` from the shared package).

2. **Plain: three parallel lists.** Every element exists three times: in the HTML, in the
   `find(…)` line that looks it up, and in the line that fills it. `calendar.view.ts` opens with
   22 such look-ups. A class renamed in the HTML and not in the script fails at run time.

3. **`lit-html`: the dialogs do not fit the model.** A modal `<dialog>` is opened by calling
   `showModal()`, which a template cannot express. The `lit-html` view needs a view-state subject
   (`ui`), a step after each render that brings the dialogs in line with it (`show`), a `close`
   event handler for the Escape key, and a `tried` flag so that an earlier failure is not shown
   in a newly opened dialog. In the plain view the same thing is `dialog.showModal()` and one
   line that empties the error.

4. **`lit-html`: the week is where it pays.** `dayTemplate` is the markup of a day with the data
   in place; the plain version is five small functions that copy a template and fill it. And
   every part of the page can depend on any stream without looking an element up.

5. **Plain: leaving a view is by hand.** The sections stay in the page, so the view must empty
   itself on sign-out (reset the form, close the dialogs, remove the week); forgetting it would
   show one person's week to the next. With `lit-html` it is `render(nothing, root)`.

6. **Strict Content-Security-Policy: one trap in `lit-html`.** Its `styleMap` directive, and
   any `style=` attribute in a template, are refused by a policy without inline styles: the
   blocks lost their positions. The fix is to bind the property (`.style=${…}`). The plain version
   sets `element.style.top`, which is always allowed.

7. **Not about the views, but found here.** `zod` probes for `eval` at start-up, which a strict
   policy reports as a violation in the console (harmless: it is caught). To settle with the
   hosting, for either choice.

8. **The shared logic matters more than the choice.** With `common/logic.ts` handing over a
   week that is ready to draw, both views are thin and neither holds a rule. That file is the
   layer of `docs/FRONTEND_VIEW_OPTIONS.md` section 9, point H1.
