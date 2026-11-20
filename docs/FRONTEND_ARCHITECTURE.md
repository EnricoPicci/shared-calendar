# Front end — Architecture: the view layer

| | |
|---|---|
| Status | v9 — **decided; the foundation, the week, booking, cancelling, the note, the change, "My appointments", the settings, the users and the first half of the availability implemented** (2026-11-20, `docs/FRONTEND_VIEW_PLAN.md` steps 60 to 67, briefs `prompts/83-step-60-implementation.md` to `prompts/90-step-67-implementation.md`): the build and dev-server commands, the tests' environment, the shell with its navigation between the screens, the login view, the logic layer (`frontend/src/logic/`), the week calendar with its book dialog (which also confirms a change), a User's list of appointments (upcoming and history), an appointment's detail (its note, "Change" and "Cancel appointment"), one dialog opened from both screens, the Administrator's settings, one form whose fields are checked before any call, the Administrator's users: the list, a create that shows the generated password once, and a delete that asks first, and the Administrator's availability: the types and the weekly patterns, each with a form that creates, a dialog that changes and a delete that asks first, and the list of the appointments in the way of a refused change, exist in `frontend/`. The other views follow, one plan step each |
| Scope | How the views of the front end are written: the technology, the layers and which may use which, the rules of a view, the logic between the services and the views, the shell, the tests, the folders |
| Not in scope yet | Hosting, the CORS gap, keeping the session across a reload, the Content-Security-Policy of the hosting, logout. They are the open points of section 10, for later versions of this document |
| Depends on | `docs/FRONTEND_SERVICES.md` v7 (the services the views use), `docs/SHARED_CALENDAR_SPEC.md` section 16.8 (what the views need), `docs/FOLDER_STRUCTURE.md` section 7, `docs/FRONTEND_VIEW_PLAN.md` (the order of work) |
| Why this choice | `docs/FRONTEND_VIEW_OPTIONS.md` v3: the options compared (plain HTML/CSS, `lit-html`, Lit, React, Angular, Svelte) and the reasons. Not repeated here |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-16 | First version: the view layer. Plain HTML and CSS with one TypeScript module script; `lit-html` as the fallback for a single view. Everything else is an open point (section 10). |
| v2 | 2026-11-19 | Plan step 60. The open points O4 (esbuild: the build and the dev server), O6 (`happy-dom`, the views inside the 100 % line coverage) and O8 (English only) are decided, with their details in the new section 12. Section 4: the login view takes the part of the `LoginService` it uses. Section 6: the shell's two functions, the header, "Sign out". Section 8: how the tests get their document, and what `happy-dom` does not emulate of the native `<dialog>`. Section 9: the tree as built, the two lint rules in place. Section 11: decisions 15 to 21. |
| v3 | 2026-11-19 | Plan step 61: the logic layer and the week calendar, read-only. Section 4: the login shows a failure in plain words; the week's templates as built (a slot is a plain element until it does something). Section 5: the logic layer as built: its three files, "now" passed in, "today" in the default time zone and the limit of that, the offset rule and the lanes for the night the clocks go back, the `WeekScreen` as it is. Section 6: the table of screens, the address read and put right, what a session owns. Section 8: the logic's tests run with a browser zone far from the calendar's. Section 9: the tree. Section 10: new open point O9, the size of the bundle. Section 12.1: the size at step 61. Section 12.4: the interim ended. Section 11: decisions 22 to 31. |

| v5 | 2026-11-19 | Plan step 63: editing the note and changing an appointment. Section 4: the detail's fixed form for the note, two actions with their own "asked" in one dialog, the book dialog's second mode (the confirmation of a change) and how its two modes are kept apart, the banner. Section 5.1: the detail's three actions and its one sentence, the moving state of the week screen (what starts it, what ends it, what does not), the reloads after a note and a change, the argument of `change`, the known limit of a move inside a full window, the sentences of `failureText` that depend on what was attempted. Section 8: what the tests rely on for a disabled button, and what of the focus is the browser's only. Section 12.1: the size at step 63. Section 11: decisions 43 to 52. |
| v4 | 2026-11-19 | Plan step 62: booking and cancelling. Section 4: a slot and an appointment are buttons; the shape of a dialog (what is local to the view, how a result is tied to the dialog that asked for it, what an opening and a close do). Section 5.1: five files (`booking.ts` and `appointment.detail.ts` are new), the week loaded again after every booking or cancellation and every time the page becomes visible, why nothing is pushed, "now" for the detail, the Administrator's custom times and their limit on the night the clocks go back, the new sentences of `failureText`. Section 6: what a session owns now, and the stream the shell builds from `visibilitychange`. Section 8: what the dialogs' tests rely on. Section 9: the tree. Section 12.1: the size at step 62. Section 11: decisions 32 to 42. |

| v6 | 2026-11-19 | Plan step 64: "My appointments". Section 4: a dialog used from two views (the detail, moved out of the week's element and out of `week.view.ts`), the shape of the list. Section 5.1: seven files (`appointments.model.ts` and `appointments.screen.ts` are new), the list screen, the time zone read from the settings and what that leaves of decision 23, the period's own checks, the hand-over of an appointment to the week screen and what still ends a move, the detail's sentence by what the appointment is. Section 6: the second entry of the table, what a session owns, what the shell hands a view. Section 8: the detail's test run from three hosts, the native date field under `happy-dom`. Section 9: the tree. Section 12.1: the size at step 64. Section 11: decisions 53 to 65. |
| v7 | 2026-11-19 | Plan step 65: the settings. Section 4: the shape of a form whose fields are checked (a field in fault). Section 5.1: nine files (`settings.model.ts` and `settings.screen.ts` are new), the settings screen, the checks of the fields and where the ranges come from, the read after a save and what it fills, the second sentence of `failureText` that depends on what was attempted. Section 6: the third entry, what a session owns. Section 8: the number field and the checkbox under `happy-dom`. Section 9: the tree. Section 12.1: the size at step 65. Section 11: decision 59 confirmed, decisions 66 to 76. Two wordings decided at the reviews of steps 63 and 64: the book dialog's two lists of times are labelled "Start" and "End", and the limit met by a change has its own sentence. |
| v8 | 2026-11-20 | Plan step 66: the users. Section 4: the username, a second field that is checked, whose hint and refusal are the same words; the password dialog, which the Escape key does not close; the shape of a dialog that confirms a deletion. Section 5.1: eleven files (`users.model.ts` and `users.screen.ts` are new), the users screen, the check of the username, the reads of the list, where the generated password is and is not, the two new sentences of `failureText`. Section 6: the fourth entry, what a session owns. Section 8: what Chromium does with Escape on a modal dialog (the `cancel` event, `closedby`), a `close` event that arrives late, a class the style sheet already knew. Section 9: the tree. Section 12.1: the size at step 66. Section 11: decision 75's reason ended, decisions 77 to 88. At the review of the step: the `close` handlers of the detail and of the book dialog removed (section 4, "A close does nothing"; decision 84). |
| v9 | 2026-11-20 | Plan step 67: the availability types and the weekly patterns. Section 4: a screen with two lists, a form that creates and a dialog that changes for each, four forms of one shape, the lists of choices, the conflicts list and its three places, one dialog that confirms the deletion of a type or of a pattern. Section 5.1: fourteen files (`availability.model.ts`, `conflicts.ts` and `availability.screen.ts` are new), the availability screen: its three reads, the join of the types' names, what a write says to the form or the dialog that asked, what goes through the screen object; the seven new sentences of `failureText` and the two new things that can be attempted. Section 6: the fifth entry, what a session owns. Section 8: a list with no choice, what a label's text holds, where the keyboard is after a dialog closes. Section 9: the tree. Section 12.1: the size at step 67. Section 11: decisions 89 to 108. |

**The decision in one paragraph.** The views are written in **plain HTML and CSS, with one
TypeScript module script**. The markup of every screen is in one `index.html`; the script
subscribes to the services' streams, fills the markup and turns the user's actions into service
calls. There is no rendering library, no framework and no compiler beyond the one bundle command
a browser needs anyway. `lit-html` is the fallback, added for a single view on the day the plain
code of that view proves painful (section 7).

---

## 1. Where this document stands

- This document is the source of truth for **the view layer**: a view, the logic it uses, the
  shell.
- `docs/FRONTEND_SERVICES.md` stays the source of truth for the services. Nothing here changes a
  service.
- `docs/ARCHITECTURE.md` stays the source of truth for the API. On any conflict it wins.
- `docs/FRONTEND_VIEW_OPTIONS.md` is the record of why this option was chosen. It is not a source
  of truth: where it differs from this document, this document is right.
- The order of work belongs to `docs/FRONTEND_VIEW_PLAN.md` (steps 60 to 69).

The choice was tried before it was made: the login view and the week calendar were written twice,
in plain HTML/CSS and with `lit-html`, against the real services and the local stack. Several
rules below come from that trial.

## 2. The layers

| Layer | What it is | May use | Never |
|---|---|---|---|
| **Services** | The classes of `docs/FRONTEND_SERVICES.md`: one remote call, its result stream and its state stream each; the `SessionStore` | `rxjs`, `@shared-calendar/shared` | Anything of the layers below |
| **Logic** | What sits between the services and the views and is neither a remote call nor a screen: which week is shown, when to reload, a week ready to draw, a failure in plain words (section 5) | The services, `rxjs`, `@shared-calendar/shared` | The DOM: no `document`, no `window`, no element |
| **Views** | One mount function per screen: finds the elements of its section, fills them at every notification, turns the user's actions into calls (sections 3 and 4) | The logic, the services, the DOM | A remote call of its own, a rule, date arithmetic, a token |
| **Shell** | The start-up: creates the services, shows the login or the application according to the session, mounts and unmounts the views (section 6) | All the above | |

A layer uses the layers above it in this table, never those below. A view may call a service
directly (`login.login(…)`, `appointments.cancel(…)`) and subscribe to its streams directly: the
logic layer is not a wrapper that every call must go through. It holds only what would otherwise
end up in a view.

## 3. The rules of a view

1. **A view does three things only.** It **subscribes** to the streams it needs; it **reacts** to
   their notifications by adjusting the screen; it **turns the user's actions** into either a
   call to a method of a service or of the logic layer, or an action on pure view elements (show,
   hide, open a dialog). No remote call, no business rule, no date arithmetic, no state that the
   rest of the application needs.

2. **One HTML page holds all the markup.** Every screen is an element of `index.html` with an
   `id`, hidden with the attribute `hidden` until the shell shows it. The script does not build a
   screen's structure: it finds elements that are already there. One page also keeps the
   in-memory session alive from screen to screen.

3. **Repeated elements are copies of a `<template>`.** HTML has no loop. A row, a day, a block
   is drawn by copying the content of a `<template>` element of `index.html` and filling the
   copy. A list is rebuilt at every notification (`replaceChildren`).

4. **A region that is redrawn holds no input field.** Rebuilding a list loses the focus, the
   scroll position and the typed text of whatever is inside. Editing happens in a dialog or in a
   fixed form, never inline in a list. This is a constraint on the design of the screens.

5. **Text goes in through `textContent`.** Usernames and notes are typed by one person and shown
   to another, and the tokens are in memory (`docs/FRONTEND_SERVICES.md` section 2, rule 9): a
   script injected through a note could act as the signed-in person. `innerHTML`, `outerHTML` and
   `insertAdjacentHTML` are not used in a view or in the shell. A lint rule enforces it.

6. **One bundled module script, and nothing inline.** `index.html` loads one script with
   `<script type="module" src="…">` and one style sheet with `<link>`. No inline `<script>`, no
   handler in an HTML attribute (`onclick="…"`), no `style="…"` attribute, no `<style>` element,
   nothing put on `window`. Handlers are attached in the script (`form.onsubmit = …`). A position
   computed at run time is set as a property (`element.style.top = …`, or a CSS custom property
   with `element.style.setProperty`), which a strict Content-Security-Policy allows while it
   refuses the attribute. This keeps the policy `default-src 'self'` possible (section 10, open
   point O5).

7. **A view is one mount function.** `mount<Name>(root, deps): Subscription`. `root` is the
   view's element in `index.html`; `deps` are the services and logic objects it uses, passed in,
   never imported as instances or created by the view. It finds its elements once, attaches the
   handlers, subscribes, and returns the subscription.

8. **Subscribe first, then call.** The view subscribes when it is mounted, before the user can do
   anything, and whoever mounted it triggers the first load after the mount
   (`docs/FRONTEND_SERVICES.md` section 2, rule 5).

9. **Leaving a view is unsubscribing it, and the view cleans up after itself.** The section stays
   in the page, only hidden, so what the view put there would be seen by the next person to sign
   in. The view adds a teardown to its subscription that resets its forms, closes its dialogs and
   empties its lists.

10. **Pure view state stays in the view.** A section is `hidden` or not, a native `<dialog>` is
    open or closed, a form's fields hold their values until submit (read with `FormData`). What
    the open dialog is about (the slot being booked) is a local variable of the mount function.
    State that anything else needs, such as which week is shown, is in the logic layer.

11. **A view never sees a token.** It receives the username and the role, for the header and for
    which actions to offer, never the `Session` itself.

12. **The platform before anything of our own.** Native `<dialog>` opened with `showModal()`,
    native form controls, HTML validation attributes (`required`) as a convenience; the check
    that counts is the one the services make before sending a request. A view may have the
    two small helpers of section 4 (`find`, `copy`). The day someone wants a helper that builds
    or updates nodes is the day to use the fallback of section 7 for that view, not to write a
    rendering library.

13. **One hand-written style sheet.** Plain CSS, no design system, no preprocessor. A phone and a
    desktop are served by the same markup, through CSS (grid, media queries).

## 4. The shape of a view

The login view, complete. The markup, in `index.html`:

```html
<main id="login" class="login" hidden>
  <h1>Shared calendar</h1>
  <form>
    <label>Username <input name="username" autocomplete="username" required /></label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
    <button class="primary">Sign in</button>
    <p class="error" role="alert"></p>
  </form>
</main>
```

The mount function:

```ts
// What the view uses of the service: one method and one stream.
export type LoginDeps = Pick<LoginService, 'login' | 'loginState$'>;

export function mountLogin(root: HTMLElement, login: LoginDeps): Subscription {
  // 1. Find the elements, once.
  const form = root.querySelector('form')!;
  const button = root.querySelector('button')!;
  const error = root.querySelector('.error')!;

  // 2. The user's actions become calls.
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    login.login(String(data.get('username')), String(data.get('password')));
  };

  // 3. The streams' notifications fill the elements.
  const subscription = login.loginState$.subscribe((state) => {
    button.disabled = state.status === 'pending';
    // In plain words, by its reason (section 5): never the service's own message.
    error.textContent = state.status === 'failure' ? failureText(state.reason) : '';
  });

  // 4. Leaving the view: what was typed is wiped.
  subscription.add(() => {
    form.reset();
    error.textContent = '';
  });
  return subscription;
}
```

**What a view asks of a service** is the part it uses, named as a type (`Pick<…>`). A real
service fits it, and so does the plain object a test passes (section 8); a class with private
fields could not be replaced by one.

**How the two meet.** The contract between the HTML and the TypeScript is the selectors: an `id`
for a view's root and for each `<template>`, class names for the elements inside, `name`
attributes for the form fields. Nothing checks this contract when the code is compiled: a class
renamed in the HTML and not in the script is a `null` when the view is mounted. The view's test
(section 8) is the check.

A handler never changes the screen to show an outcome. Clicking "Sign in" only calls the service;
the button is disabled because `loginState$` notifies `pending`, and the screen changes because
the session stream notifies the shell. Every change on screen comes from a stream, except pure
view actions such as opening a dialog.

**Lists and templates.** For a larger view, two helpers keep the look-ups short:

```ts
const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
// A copy of the element inside a <template>.
const copy = <T extends HTMLElement = HTMLElement>(id: string) =>
  find<HTMLTemplateElement>(`#${id}`).content.firstElementChild!.cloneNode(true) as T;
```

```html
<template id="tpl-slot">
  <button type="button" class="block slot"><span class="time"></span> free</button>
</template>
```

```ts
// A block's copy, put in its place and in its lane, with its type's colour when it has one.
const place = (id: string, block: Placed, colour?: number) => {
  const element = copy(id);
  element.style.top = block.top;        // computed by the logic layer, as a percentage
  element.style.height = block.height;
  element.classList.add(`lane-${block.lane}-of-${block.lanes}`);
  if (colour !== undefined) element.classList.add(`type-${colour}`);
  return element;
};
const slotFor = (block: SlotBlock, timeZone: string) => {
  const element = place('tpl-slot', block, block.colour);
  element.querySelector('.time')!.textContent = block.time;
  element.onclick = () => openBook(block, timeZone); // a click only opens a dialog
  return element;
};
```

The view does no arithmetic here: `top`, `height`, `time`, the lane and the colour's number
arrive ready from the logic layer, and the style sheet says what a lane and a colour look like
(`.lane-1-of-2`, `.type-3`).

**The week's templates, as built** (`docs/FRONTEND_VIEW_PLAN.md` step 61), all inside the week's
element `#week`: `tpl-day` (a heading and the day's body), `tpl-window`, `tpl-busy`, `tpl-slot`,
`tpl-appointment`, two for the lists beside the days, `tpl-legend-item` and `tpl-hour`, and one
for a choice of a list in the book dialog, `tpl-option`. The navigation's link has one too,
`tpl-nav-link`, in the frame. A slot and an appointment are `<button type="button">` elements
(`docs/FRONTEND_VIEW_PLAN.md` step 62): a keyboard reaches them, and a screen reader says their
text, the time and "free" or the person. A window and a busy block stay plain elements. The
number of hours shown is set on each day's body as
the custom property `--hours`, so nothing the script sets stays on an element that outlives the
week. The view redraws the days only when the stream brings another week object, not at every
notification: a change of label or of "Loading…" leaves the days as they are.

**The shape of a dialog** (`docs/FRONTEND_VIEW_PLAN.md` step 62: the book dialog and the
appointment detail, both native `<dialog>` elements outside the region a view redraws; the
book dialog is inside `#week`, the detail belongs to no screen, see "A dialog used from two
views" below):

```ts
// What the dialog is about, replaced at every opening; null until the first one. And whether
// its action was asked for since it opened.
let booking: { slot: SlotBlock; zone: string } | null = null;
let bookAsked = false;

const openBook = (slot: SlotBlock, timeZone: string) => {
  bookForm.reset();              // opened a second time, it shows nothing of the first
  bookError.textContent = '';
  booking = { slot, zone: timeZone };
  bookAsked = false;
  bookWhat.textContent = bookingText(slot);
  book.showModal();
};                               // no handler of the close event: see "A close does nothing" below
bookForm.onsubmit = (event) => {
  event.preventDefault();
  bookAsked = true;
  appointments.book(bookingFor(booking!.slot, booking!.zone, role, fields));
};
appointments.bookState$.subscribe((state) => {
  bookSubmit.disabled = state.status === 'pending';
  if (!bookAsked) return;        // not this opening's booking
  bookError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
  if (state.status === 'success') book.close();
});
```

- **What is local to the view** (section 3, rule 10): what the open dialog is about (the slot,
  the appointment's id) and whether "Book" or "Cancel appointment" was pressed since it opened.
  Nothing else: the texts come from the logic layer, the outcome from the stream.
- **A result is tied to the dialog that asked for it.** A state stream keeps its last value, and
  that value may belong to an earlier opening, or to a call still under way when the dialog was
  closed. The view shows a failure, and closes on a success, only while "asked" is true: it is
  set by the handler just before the call, and cleared at every opening. A result that
  arrives while the dialog is closed changes nothing a person sees: the failure it would
  write is emptied at the next opening, and closing a closed dialog does nothing.
  The service cancels its pending call when a new one is made, so the next result is that
  call's. A button is disabled from the state alone, asked or not: "Book" while any booking is
  under way, "Cancel appointment" while the cancellation under way is of the appointment shown
  (`pending` carries its id).
- **An opening starts clean**: the form is reset, the failure emptied, what the dialog is
  about replaced and "asked" cleared. **A close does nothing**: no dialog has a handler of the
  `close` event. A browser sends that event a moment after the close, which can be after the
  dialog was opened again (the Escape key, then Enter on the button that has the keyboard
  back): a handler that forgot what the dialog was about would then forget the new opening,
  and its action would reach nobody or its result be shown to nobody. Found in the browser
  check of `docs/FRONTEND_VIEW_PLAN.md` step 66; the book dialog and the detail had such a
  handler until then. **Leaving the view** closes both dialogs, resets the form, and empties
  the lists and every text (section 3, rule 9).
- **A week that arrives while a dialog is open** redraws the days behind it and leaves the
  dialog as it is: what was typed, a failure, and the slot the dialog books stay. The block that
  opened the dialog is then a new element, so the focus does not return to it at the close.
- **The Administrator's part** of the book dialog (the User, and two lists of times) is one
  element, hidden for a User, whose view never asks for the list of users. The list is asked
  for at every opening (`UsersService.listUsers()`); its states arrive through the stream and
  are applied only while the dialog is open (`book.open`), which is why it is opened before
  the list is asked for. The picker's choices are rebuilt when a list
  arrives: the one place where a redrawn region holds a form control, accepted because it
  happens at opening, before anything can be chosen, and nothing else in a session asks for
  the list while the dialog is open.
- **No second question** before a cancellation: one click on "Cancel appointment" cancels.

**What the note and the change added to the two dialogs** (`docs/FRONTEND_VIEW_PLAN.md` step 63):

- **The note is edited in a fixed form of the detail** (section 3, rule 4): a `<textarea>` with
  the book dialog's `maxlength`, and "Save note". While the logic layer says the note can be
  edited the form is shown and the note as a text to read is hidden; otherwise the other way
  round. The note reaches the field through its `value`. "Save note" calls
  `appointments.updateNote(appointmentId, …)` with the field as it is, emptied and unchanged
  included: the shared schema, through the service, trims it and makes a blank note `null`.
- **Two actions of one dialog have an "asked" each.** The detail has "Save note" and "Cancel
  appointment", one failure element, and two local flags: a note's result is shown only after
  "Save note", a cancellation's only after "Cancel appointment", both cleared at every
  opening. Each button is disabled while the call under way is of the appointment shown.
- **"Change" closes the detail and tells the week screen** (`screen.move(appointmentId)`), which
  holds the move from then on (section 5.1). The handler does nothing else: the banner appears
  because `week$` then says that an appointment is being moved.
- **The banner** is a fixed element of `#week`, outside the redrawn region, hidden unless
  `week$` carries a move. It names the appointment with the words the stream brings and holds
  "Keep the appointment as it is", which calls `screen.keep()`. While it shows, every
  appointment's button is disabled, set at each notification of `week$` after any redraw, so a
  week drawn while moving and one drawn after the move ended have their buttons right, and the
  keyboard skips them.
- **The confirmation of a change is the book dialog in a second mode**, not a third dialog. A
  slot clicked while an appointment is being moved opens it with the title "Change
  appointment", the old time and the new one each on its line, the note's field filled with
  the old appointment's note, and "Change" in the place of "Book". The fixed texts of both
  modes are in `index.html`: the elements marked `in-booking` are shown in the first mode only,
  those marked `in-change` in the second only, and the script only shows and hides them. The
  choice of User is `in-booking`: a change asks for no User and never calls `listUsers`; the
  Administrator keeps the two lists of times.
- **What the open book dialog is about** now includes the move it confirms, or `null` for a
  booking: a copy taken at the opening of what `week$` last said. "Book" or "Change" calls
  `appointments.book(…)` or `appointments.change(appointmentId, …)` according to it, and
  nothing else. The two modes share the "asked" flag and the failure element and are kept
  apart by that copy: a state of `bookState$` is shown only in a dialog that books, one of
  `changeState$` only in a dialog that confirms a change, so a call left under way by one mode
  never shows in the other. The button is disabled by the state of its own mode's call.
- **A change's success only closes the dialog.** The banner goes because the week screen heard
  `changeResult$` and `week$` says so, not because the view did anything. After a refusal the
  dialog stays open with what was typed; closed, by "Close" or the Escape key, it leaves the
  banner, and another slot can be chosen.

**A dialog used from two views** (`docs/FRONTEND_VIEW_PLAN.md` step 64). The appointment detail
is opened from the week and from "My appointments". It is one element, `dialog#detail`, in the
frame after the screens, and one file, `frontend/src/views/detail.view.ts`:

```ts
export type DetailDeps = {
  detail: (appointmentId: string) => AppointmentDetail | null; // how this screen answers a detail
  appointments: Pick<AppointmentsService, 'cancel' | 'cancelState$' | 'updateNote' | 'updateNoteState$'>;
  change: (appointmentId: string) => void;                    // what "Change" does on this screen
};
export type DetailView = { subscription: Subscription; open: (appointmentId: string) => void };

export function mountDetail(root: HTMLDialogElement, deps: DetailDeps): DetailView { … }
```

- **The view of the screen on show mounts it**, for as long as that screen is on show, and ends
  it with its own subscription. Only one screen is on show at a time, so the dialog is mounted
  once at a time and its handlers and streams are those of one screen and one session.
- **It returns `open` beside the subscription**, because something must open it: the week view
  calls it at a click on an appointment, the list's view at a click on a row. This is the one
  mount function that does not return a `Subscription` alone (section 3, rule 7): it is a part
  of a view, not a view with an element of the shell's.
- **The view finds the dialog through its own element's document**
  (`root.ownerDocument.querySelector('#detail')`): the dialog is outside every screen's element,
  and the shell's code that shows a screen was not changed to hand it over.
- **What it is handed** says what differs between the two screens, and nothing else does: the
  detail of an appointment by its id (`screen.detail` of the `WeekScreen` or of the
  `AppointmentsScreen`), and what "Change" does: in the week, `screen.move(appointmentId)`; in
  the list, the hand-over to the week screen and the change of address (section 5.1). The note
  and "Cancel appointment" call the service in both.
- **Everything of the shape of a dialog above is unchanged**: what is local (the appointment
  shown, an "asked" for each of the two actions), a result shown only in the opening that asked
  for it, an opening that starts clean, a close that does nothing, and a teardown that closes
  it and empties it.
- The book dialog, with its second mode, stays the week's: only the week books and confirms.

**The list's shape** (`#appointments`, `frontend/src/views/appointments.view.ts`): two buttons
for the two modes, whose `aria-pressed` is set from the stream; the period's form, a fixed form
outside the list (section 3, rule 4), with two native date fields and "Show", shown in the
history only; the failure; the sentence of an empty list; and the list, whose rows are copies
of `tpl-appointment-row`. A row is one `<button type="button">` holding the date, the time,
the type, the note and the status, with a class for what the appointment is (`is-booked`,
`is-ended`, `is-cancelled`, `is-changed`), as the logic layer says it. The rows are rebuilt
only when the stream brings another list object, and the two dates are set only when it brings
another period object, so a list that arrives while a date is being typed leaves the field
alone. The form has `novalidate`: an empty or half-typed date is refused by the logic layer in
words, beside the form, not by the browser's own bubble.

**A form whose fields are checked** (`docs/FRONTEND_VIEW_PLAN.md` step 65: the settings,
`#settings`, `frontend/src/views/settings.view.ts`; the pattern for the forms of the steps that
follow). The markup of one field:

```html
<div class="field">
  <label>Booking horizon <input type="number" name="bookingHorizonDays" inputmode="numeric" /></label>
  <p class="range"></p>                         <!-- "days, from 1 to 365", set by the script -->
  <p class="error refusal" role="alert"></p>    <!-- why the value was refused -->
</div>
```

- **A field is a `.field`**: its label with its input, the words of its range, and its
  refusal. The view finds the input by its `name` and the two texts through
  `input.closest('.field')`.
- **A field in fault** is three things, all set from the stream and from nothing else: its
  sentence in `.refusal` (announced: `role="alert"`), `aria-invalid="true"` on the input, and
  through that attribute a red border from the style sheet. When the stream no longer names the
  field, the sentence is emptied and the attribute removed. The view decides nothing: the
  logic layer says which fields are in fault and in which words (section 5.1).
- **"Save" sends the fields as text**, as they are, to the logic object, which checks them:
  the view parses nothing. The form has `novalidate`; the native field's `min`, `max` and
  `step` are set by the script from the logic layer's ranges, as a convenience (the arrows stop
  there), and no range is written in `index.html`.
- **The form is filled only when the stream brings another object** for its fields, as the two
  dates of the list are: a notification that arrives while a value is being typed leaves it.
  What the form says beside its fields (the time zone, who saved last) follows every
  notification.
- **One pure view action**: "No limit" takes its number field out of use (`disabled`) and gives
  it back. An edit, typed or ticked, is told to the logic object (`edited()`), which is what
  takes "Settings saved." away: the sentence goes because the stream says so.
- **The fixed texts are in the page** (the labels, "Settings saved.", "Try again"); the range
  under a field and a refusal are made by the logic layer, since they hold numbers of
  `shared/`. A refusal names its field with the words of the label: the view's test checks
  that the two agree.
- The loop that shows and clears the refusals is six lines of the stream's subscription; no
  helper that builds or updates nodes was written (section 7).

**A second field that is checked: the username** (`docs/FRONTEND_VIEW_PLAN.md` step 66: the
users, `#users`, `frontend/src/views/users.view.ts`). The pattern above is used as it is, for
one field:

```html
<form class="create" novalidate>
  <div class="field">
    <label>Username <input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="username-hint" /></label>
    <p class="hint" id="username-hint"></p>       <!-- what a username is, set by the script -->
    <p class="error refusal" role="alert"></p>    <!-- the same words, when the text was refused -->
  </div>
  <p class="error failure" role="alert"></p>      <!-- a create the server refused, or that failed -->
  <div class="actions"><button class="primary submit">Create user</button></div>
</form>
```

- **The hint stands where the settings have a range**, and its words are the refusal's: the
  logic layer has them once (section 5.1). While the refusal shows, the style sheet hides the
  hint (`.field:has(.refusal:not(:empty)) .hint`), so the sentence is read once, in red, and
  announced. The field names the hint as its description (`aria-describedby`).
- **A browser neither offers nor corrects a username**: `autocomplete="off"`,
  `autocapitalize="none"`, `spellcheck="false"`. No pattern and no length is in the page.
- **"Create user" sends the field as text**, as it is, to the logic object. The field is
  emptied only when the stream brings another object for it, which is after a create that
  succeeded; after a refusal or a failure what was typed stays.
- **A name that exists is the form's failure, not a field in fault**: it is the server's
  answer, said under the field's box in plain words, and the field is not marked.
- The form is outside the list the script redraws (section 3, rule 4); the rows hold a button
  each and nothing to type in.

**The password dialog** (`dialog.created`, inside `#users`). Creating a user shows the password
the server generated, once: it cannot be shown again and no route sets another
(`docs/FRONTEND_SERVICES.md` section 2, rule 6, the one exception, and section 13.7).

```html
<dialog class="created" aria-labelledby="created-title" closedby="none">
  <h3 id="created-title" tabindex="-1" autofocus>User created</h3>
  <dl><dt>Username</dt><dd class="username"></dd><dt>Password</dt><dd class="password"></dd></dl>
  <p>This password cannot be shown again. Give it to the user now.</p>
  <div class="actions"><button type="button" class="primary understood">I have noted the password</button></div>
</dialog>
```

```ts
let createAsked = false;                       // a create was asked for from this mount
const forget = () => { createdName.textContent = ''; password.textContent = ''; };
created.oncancel = (event) => event.preventDefault();
find('dialog.created .understood').onclick = () => { created.close(); forget(); };
form.onsubmit = (event) => { event.preventDefault(); createAsked = true; screen.create(field.value); };
users.createUserState$.subscribe((state) => {  // the service's own state: the password is there
  if (!createAsked || state.status !== 'success') return;
  createAsked = false;
  createdName.textContent = state.user.username;
  password.textContent = state.user.password;
  created.showModal();
});
```

- **Where the password is.** In one element of the dialog, through `textContent`, from the
  opening to the close: in no attribute, no field, not in the address or the title, and in no
  `console` call. It comes from the service's own create state, read by the view at the moment
  it shows it; it never passes through the logic layer (section 5.1).
- **Where it goes.** The button takes it out of the page in the same handler that closes the
  dialog, not at the `close` event, which a browser sends a moment later. Leaving the view
  (another screen, signing out) closes the dialog and takes it out too (section 3, rule 9).
- **Shown once.** The service keeps the create's success, password included, until the next
  create or the end of the session. A success that was there when the view was mounted is an
  earlier visit's: the dialog opens only for a create asked for from this mount (the "asked"
  of the shape of a dialog). **Known limit:** a create left under way when the screen is left
  is answered to nobody: the user exists, its password was never shown, and the Administrator
  deletes the user and creates it again.
- **The Escape key does not close it**, pressed once or many times: a key pressed by mistake
  must not lose the password. `closedby="none"` is what holds in Chromium (section 8); the
  `cancel` event is refused as well, for a browser that does not know the attribute. A click
  outside it closes no modal dialog. The other dialogs of the page keep closing with Escape.
- **The keyboard lands on the heading**, not on the button (`tabindex="-1"` and `autofocus`
  on the `<h3>`): Enter or the space bar pressed by habit when the dialog appears does
  nothing, and the button is the next Tab. A screen reader says the dialog's name, "User
  created" (`aria-labelledby`).
- **No "Copy" button**, and the page never touches the clipboard. The password is plain text
  in a fixed-width face, large enough to tell `l` from `1` and `O` from `0`; one click selects
  it whole (`user-select: all`), to be copied by hand.
- **A list that arrives behind it** (the read after the create, the tab shown again) redraws
  the rows and leaves the dialog as it is.
- **While it is open nothing else of the page can be reached**, "Sign out" included: it is a
  modal dialog. A session that ends by itself meanwhile closes it through the view's teardown.

**A dialog that confirms a deletion** (`dialog.delete`, inside `#users`; the pattern for the
deletions of the steps that follow: a type, a pattern, an override, a window).

```html
<dialog class="delete" aria-labelledby="delete-title">
  <h3 id="delete-title">Delete user</h3>
  <p class="question"></p>                     <!-- whom, what follows, and that it cannot be undone -->
  <p class="error" role="alert"></p>
  <div class="actions">
    <button type="button" class="keep">Keep</button>
    <button type="button" class="danger submit">Delete user</button>
  </div>
</dialog>
```

```ts
let deleting = '';                             // whom the open dialog is about
let deleteAsked = false;                       // "Delete user" was pressed since it opened
const openDelete = (row: UserRow) => {         // a row's "Delete": a click only opens the dialog
  deleting = row.username;
  deleteAsked = false;
  question.textContent = deleteQuestion(row.username);
  removeError.textContent = '';
  remove.showModal();
};
find('dialog.delete .keep').onclick = () => remove.close();
removeSubmit.onclick = () => { deleteAsked = true; users.deleteUser(deleting); };
users.deleteUserState$.subscribe((state) => {
  removeSubmit.disabled = state.status === 'pending';
  if (!deleteAsked) return;                    // not this opening's delete
  removeError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
  if (state.status === 'success') remove.close();
});
```

- **Its shape is the shape of a dialog above**, with nothing to type: what it is about and one
  "asked" are local; the words come from the logic layer (`deleteQuestion`); the outcome comes
  from the service's state. A failure is said in the dialog, which stays open, and the button
  can be pressed again; a success closes it. The row goes because the logic layer reads the
  list again (section 5.1), not because the view removes it.
- **Two buttons, "Keep" first.** The keyboard is on "Keep" when the dialog opens, so Enter
  pressed by habit keeps; the Escape key closes it too. Nothing is typed to confirm.
- **No handler of the `close` event**, like every dialog of the page (the shape of a dialog
  above, "A close does nothing"): whom it is about is replaced at the next opening.
- **The button of a row says whom** to a screen reader (`aria-label`, "Delete alice"), set by
  the script with the words of the logic layer.
- The view is 172 lines, 26 of which look a node up or copy a template; no helper that builds
  or updates nodes was written (section 7).

**The availability: a form that creates, a dialog that changes** (`docs/FRONTEND_VIEW_PLAN.md`
step 67: `#availability`, `frontend/src/views/availability.view.ts`). One screen with two
parts, each under its heading, "Types" and "Weekly patterns". A part is the shape of the users
screen: a fixed form that creates, the failure of its read with "Try again", the sentence of
an empty list, and the list. What is new:

- **Creating is a fixed form, changing is a dialog.** A row holds buttons only (section 3,
  rule 4): "Rename" and "Delete" for a type, "Change" and "Delete" for a pattern. "Rename" and
  "Change" open a dialog filled with the row's values: `dialog.rename`, one name field, and
  `dialog.change`, the six fields of the form that creates a pattern, written a second time in
  `index.html`. Both are forms with "Close" before their action, as the book dialog is. A
  button of a row says which row it is of to a screen reader (`aria-label`, "Change Monday
  09:00 – 13:00 Studio"), with the words of the logic layer.
- **Four forms, one shape.** The two forms that create and the two dialogs are each a `<form
  novalidate>` of `.field` elements (the pattern of a field in fault above), a failure and a
  button. The view finds the parts of the four with one look-up function and keeps them by
  the names their outcomes have in the stream (`typeCreate`, `rename`, `patternCreate`,
  `change`). Three local functions serve the four: what a form holds, as text (`held`); a form
  filled with given values (`fill`); and what a write says in its form (`say`): each field in
  fault marked with its sentence under it, the failure, the appointments in the way. They set
  values and texts of elements found once; none builds a node.
- **A pattern's six fields**: "Weekday", "Start", "End" and "Type" are native lists, "Valid
  from" and "Valid until" native date fields; "Valid until" says under it "Leave empty for no
  end." The choices of the weekday and of the two times are fixed, and the script sets them
  once, at the mount, from the logic layer (the times are the 15-minute grid: nothing off it
  can be chosen). The choices of the type follow the stream. All are copies of one template,
  `tpl-choice`, and all are removed when the view is left.
- **A list of types that arrives leaves what is chosen**, in the form and in the open dialog:
  the script notes the list's value, rebuilds its choices and puts the value back. **A chosen
  type that is no longer among them leaves none chosen** (a list set to a value it does not
  hold shows nothing), and the logic layer then refuses the form with "Type must be chosen."
  This is the second place where a redrawn region is a form control (the first is the book
  dialog's list of users): a fixed field whose choices change, never a field that is rebuilt.
- **The form that creates a pattern starts with no type chosen**, so that a type is always
  chosen on purpose; while no type exists the place of the type's hint says that one must be
  created first. Its starting values, and its return to them after a create that succeeded,
  come from the stream (another object for the fields), as the username field's emptying does.
- **A result reaches the dialog that asked for it, and only it.** The four writes that have a
  check go through the logic object, whose stream carries one outcome per kind of write
  (section 5.1): whether it is under way, the refusals of its fields, its failure, the
  appointments in the way, whether it is done, and `about`, the id of the type or of the
  pattern it was asked for. The two forms that create show their outcome as it is. A dialog
  shows its own only while two things hold: its action was asked for since it opened (the
  local "asked" of the shape of a dialog), and the outcome is about what the dialog is about.
  It closes when that outcome is done. A button is disabled from the stream alone, while a
  write of its kind is under way.
- **An ended pattern** stays in the list (section 5.1) with the word "ended", fixed in the
  row's template and shown by the script, and a quieter look (`is-ended`).

**The conflicts list** (`docs/SHARED_CALENDAR_SPEC.md` section 6.7). A change of availability
that would leave booked appointments outside it is refused with `availability_conflict` and
the list of those appointments. Its markup, the same in each of its places:

```html
<p class="error failure" role="alert"></p>     <!-- the failure's own sentence -->
<div class="conflicts" hidden>
  <p class="conflicts-count"></p>              <!-- "2 appointments are in the way:" -->
  <ul class="conflicts-list"></ul>             <!-- copies of tpl-conflict: date, time, User -->
</div>
```

- **Three places so far**: the form that creates a pattern, the dialog that changes one, and
  the dialog that confirms a deletion. One template for a row, `tpl-conflict`; one function of
  the logic layer that makes the rows (`conflictList`, section 5.1); one local function of the
  view that draws a list in a place (`showConflicts`).
- **The failure is one sentence, and the list stands under it** with the sentence that counts
  it. A failure that names no appointment shows its sentence alone.
- **Personal data** (`docs/FRONTEND_SERVICES.md` section 17.7): usernames and times reach the
  page through `textContent` only and are never logged. The list is taken out of the page at
  the next try (the stream no longer carries it), at the next opening of the dialog that
  showed it, and when the view is left. The id of an appointment never reaches the page.
- **Nothing can be done to an appointment from the list**: the sentence sends the
  Administrator to the week ("Cancel or move them in the week first.").
- **What `docs/FRONTEND_VIEW_PLAN.md` step 68 reuses as it is**: the markup above in each new
  place, `tpl-conflict`, `conflictList` and `showConflicts`; an override and a one-off window
  need no word more.

**One dialog confirms the deletion of a type or of a pattern** (`dialog.delete`, inside
`#availability`): the dialog of the users above, copied, with two differences. It serves
every deletion of the screen, so its fixed words name none: "Confirm the deletion", "Keep",
"Delete"; what is deleted is in the question, which the logic layer makes ("Delete the type
Studio? This cannot be undone."). And it has the conflicts list, for a pattern.

```ts
let deleting: { kind: 'type' | 'pattern'; id: string } | null = null; // what the open dialog is about
let deleteAsked = false;                                                // "Delete" was pressed since it opened
removeSubmit.onclick = () => {                                          // nothing to check: the view calls the service
  deleteAsked = true;
  if (deleting!.kind === 'type') types.remove(deleting!.id);
  else rules.deletePattern(deleting!.id);
};
```

- **Its state comes from the service of its kind**: `removeState$` of the
  `AvailabilityTypesService` for a type, `deletePatternState$` of the
  `AvailabilityRulesService` for a pattern. A state of the other kind changes nothing in it.
  The button is disabled while a delete of the dialog's own kind is under way.
- **The appointments in the way of a pattern's deletion** come with the service's failure;
  the view hands them to the logic object (`screen.conflicts(…)`), which knows the calendar's
  time zone, and draws what comes back.
- **One dialog, not one per kind**: `docs/FRONTEND_VIEW_PLAN.md` step 68 adds two more
  deletions to this screen, and each is then a question and a call, not a dialog more.
- The view is 282 lines and listens to three streams; 36 of its lines look a node up or copy
  a template (section 7; section 11, decision 107).

## 5. The logic layer

Some of what the screens need may not be in a view (section 3, rule 1) and is not a remote call
either. It lives in the logic layer:

| What | Example |
|---|---|
| State that is not the server's and not one view's | Which week is on screen, and its Monday; which appointment is being moved to another time; which list of "My appointments" is on show, and the period of its history |
| When to call again | After a booking, a cancellation, a change or a note saved, whatever its outcome, load the calendar again (`docs/FRONTEND_SERVICES.md` section 18.6) |
| A response made ready to draw | The week: per day, its windows, slots, busy blocks and appointments, each with its place in the day and its time as text |
| What is offered | Whether the note can be edited and whether "Change" and "Cancel" are shown for an appointment (the status, the end, the role, `cancellableUntil`) |
| The texts | A date and a time in the calendar's time zone, whatever the browser's; a failure `reason` in plain words (`docs/SHARED_CALENDAR_SPEC.md` section 16.8) |
| From the user's input to a call's argument | The booking body from a slot, a note and a username; the settings' body from four fields typed as text, or why not, field by field; the username to create from what its field holds, or why not; a type's name and a pattern's body from what their forms hold, or why not, field by field |

Its rules:

1. **Plain TypeScript and RxJS, no DOM.** Pure functions (a response in, a model out) and small
   classes with public observables and `void` methods, shaped like a service
   (`docs/FRONTEND_SERVICES.md` section 3). It can be read and tested without a browser.
2. **It receives the services through its constructor** and never creates them.
3. **It makes no remote call of its own**: it calls the services' methods and combines their
   streams.
4. **It holds no token** and reads none.
5. **It does not start by itself.** An object that triggers calls has a `start()` method that
   returns a `Subscription`; the shell calls it after the view is mounted (section 3, rule 8) and
   ends it with the view.
6. **Dates and times go through `shared/`'s time helpers** with the calendar's time zone, never
   through the browser's own zone.
7. **Tested like the services**: unit tests with no network and no DOM, inside the 100 % line
   coverage of `frontend/src`.

### 5.1 As built: fourteen files

`frontend/src/logic/` (`docs/FRONTEND_VIEW_PLAN.md` steps 61 to 67), each with its test in
`frontend/tests/unit/logic/`:

| File | What it holds |
|---|---|
| `texts.ts` | Pure functions: a date (`dateText`, "Mon 16 Nov"), a time (`timeText`, "09:00"), a range (`rangeText`, "09:00–10:00"), a date with a time (`dateTimeText`, "Mon 23 Nov, 10:00"), a date with its year (`longDateText`, "20 November 2026"), a week's label (`weekLabel`, "16 Nov – 22 Nov 2026"), a UTC offset (`offsetText`, "+02:00"), whether a day's offset changes (`offsetChangesOn`), and a failure in plain words (`failureText`) |
| `week.model.ts` | Pure: `weekModel(view, role)`, a `CalendarView` in, the week ready to draw out |
| `booking.ts` | Pure, for the book dialog: what is booked in words (`bookingText`), the times the Administrator may choose (`timeChoice`), the Users to choose from (`userChoice`), and from what the dialog holds to the argument of `AppointmentsService.book` (`bookingFor`) or, when it confirms a change, of `AppointmentsService.change` (`changeFor`) |
| `appointment.detail.ts` | Pure: `appointmentDetail(appointment, role, now, zone)`, an `Appointment` in, what the detail dialog shows out, with which of its three actions are offered (the note, "Change", "Cancel appointment"), the note as a text and as a field's value, and the sentence about them; `movingOf(detail, role)`, an appointment being moved, in the words of the banner and of the confirmation |
| `week.screen.ts` | The class `WeekScreen`: which week is on screen, its loads and reloads, the detail of one of its appointments, and the appointment being moved to another time, one of its own or one handed over by the list screen |
| `appointments.model.ts` | Pure, for "My appointments": `appointmentRows(appointments, now, zone)`, the list ready to draw (date, time, type, note, and the status in words); the two sentences of an empty list (`emptyText`); the period the history opens on (`defaultPeriod`) and the period's own checks (`periodRefusal`) |
| `appointments.screen.ts` | The class `AppointmentsScreen`: which of the two lists is on show, the period of the history, the time zone read from the settings, the loads and reloads, the detail of one of its appointments, and the hand-over of one to the week screen |
| `settings.model.ts` | Pure, for the settings form: what the fields are filled with (`settingsFields`), what the form says beside them (`settingsInfo`: the time zone, who saved last and when), the range of a field with its words (`settingRange`), and from what the fields hold to the body of the save or to the refusals (`settingsFor`) |
| `settings.screen.ts` | The class `SettingsScreen`: the settings read when the screen is shown, the save with its checks, and the read that follows every save |
| `users.model.ts` | Pure, for the users screen: the list ready to draw (`userRows`: the username, and whom its "Delete" button deletes), the sentence of an empty list (`NO_USERS`), what a username is in words (`USERNAME_HINT`), from what the field holds to the username to create or to the refusal (`usernameFor`), and the words of the dialog that confirms a deletion (`deleteQuestion`) |
| `users.screen.ts` | The class `UsersScreen`: the list read when the screen is shown, a create with its check, and the list read again after every create and delete and when the page becomes visible |
| `availability.model.ts` | Pure, for the availability screen. The types: the list ready to draw (`typeRows`), the sentence of an empty list (`NO_TYPES`), what a name is in words (`TYPE_NAME_HINT`), from what the field holds to the name or to the refusal (`typeNameFor`), the question before a deletion (`deleteTypeQuestion`). The patterns: the choices of the form's lists (`WEEKDAY_CHOICES`, `START_CHOICES`, `END_CHOICES`, `typeChoices`), what the form starts with (`startingFields`), the fields of an existing pattern (`patternFields`), from what the form holds to the body or to the refusals (`patternFor`), the list grouped by weekday and ready to draw (`patternGroups`), the question before a deletion (`deletePatternQuestion`) |
| `conflicts.ts` | Pure: `conflictList(conflicts, zone)`, the appointments in the way of a refused change of availability, ready to draw, with the sentence that counts them |
| `availability.screen.ts` | The class `AvailabilityScreen`: the settings (for the time zone), the types and the patterns read when the screen is shown, the four writes that have a check, and the lists read again after every write and when the page becomes visible |

**"Now" is passed in.** Nothing in `logic/` reads the clock by itself. `WeekScreen` receives a
function `now: () => Date` through its constructor (the shell passes `() => new Date()`, a test a
fixed moment). Everything about one loaded week comes from the view's own `generatedAt`,
including the day marked as today. What can be done to an appointment is another matter: the
week may have been on screen for hours, so `detail(appointmentId)` reads `now()` at the moment
the dialog opens.

**"Today" is taken in the default time zone, and only there.** The week on screen at the start,
and the one "Today" returns to, is the week of `now()` in `DEFAULT_TIME_ZONE` (`Europe/Rome`,
from `shared/`). The screen makes no request for the settings: the first week is loaded at once.
This is the one place where the default zone stands for the calendar's. Every date and time of a
loaded week is shown in the zone the server names (`view.timeZone`), and the day marked as today
is the date of `generatedAt` in that zone. **Known limit:** with a calendar deployed in another
time zone, around midnight the screen can open on the neighbouring week (the one that holds
today in `Europe/Rome`, not in the calendar's zone). "Next" or "previous" reaches the right one.
Lifting the limit means reading the calendar's zone before the first load.

**Dates and times** go through `shared/`'s helpers only (`localDateOf`, `localTimeOf`, `addDays`,
`weekdayOf`, `toInstant`). A date is turned into words with `Intl.DateTimeFormat` reading it as
UTC and its parts put together by hand, so that neither the browser's zone nor its version of
the locale data changes the text.

**The UTC offset** of an instant is derived from those helpers: the local date and time read as
if they were UTC, minus the instant, to the minute. `shared/` has no function for it and was not
changed.

**The night the clocks go back** (`docs/SHARED_CALENDAR_SPEC.md` R-SLOT-01 and section 16.8):

- On a day in which the calendar zone's offset changes, in either direction, every time shown in
  that day carries its offset ("02:00 +02:00 – 02:00 +01:00"); on every other day none does.
- A block is placed by its local clock time. One that crosses the repeated hour and ends, on the
  clock, no later than it starts gets its real length.
- Two blocks **of the same kind** (two slots, two appointments, two busy blocks, two windows)
  that the clock puts in the same place without their sharing a moment are drawn side by side,
  each half the width, the earlier on the left: the model says `lane` 0 or 1 of `lanes` 2, the
  view applies it as a class. Blocks of different kinds in that place are not moved apart: an
  appointment in one of the two hours covers a free slot in the other.
- The night the clocks go forward needs nothing: no block exists in the missing hour, and a slot
  across it is two hours tall on the clock, as `docs/SHARED_CALENDAR_SPEC.md` R-TIME-03 has it.

**The week model.** Per day: its date, its label, whether it is today; its windows (type name,
colour), its free slots, its busy blocks, its appointments; each block with `top` and `height`
as percentages of the hours shown, and its time as text. For the week: the time zone's name, one
label per hour shown (08:00 to 18:00, widened to whole hours to hold everything in the week) and
the legend (the types met in the week, by name). A type's colour is a number from 0 to 5 made
from its id, the same in every week, applied as a class (`type-0` … `type-5`) that the style
sheet defines: no colour is computed at run time. For the Administrator every appointment
carries its User's name; for a User the own appointments say "You" and other people's time is a
busy block with no name, which is what the server sends (`docs/SHARED_CALENDAR_SPEC.md` section
11.6): the model adds nothing to it. For the dialogs, a slot also carries its own `start` and
`end` instants, its day's label, its type's name and the instants of the window that holds it;
an appointment carries its `appointmentId`. The window is the whole stretch of the slot's type:
two windows that touch and share a type count as one, through `shared/`'s `effectiveWindows`
(`docs/SHARED_CALENDAR_SPEC.md` section 6.6).

**The week screen:**

```ts
// The last week loaded stays in `week` while another loads or fails. `moving` is the
// appointment being moved to another time, in words, or null.
export type WeekState = { label: string; loading: boolean; failure: string | null; week: WeekModel | null; moving: Moving | null };
export type Moving = { appointmentId: string; when: string; what: string; note: string };

export class WeekScreen {
  readonly week$: Observable<WeekState>;

  // `calendar`: `load`, `reload` and `calendarState$` of the CalendarService.
  // `appointments`: `bookResult$`, `cancelResult$`, `updateNoteResult$` and `changeResult$` of
  // the AppointmentsService.
  // `visible$` notifies each time the page becomes visible again.
  constructor(calendar: WeekCalendar, appointments: WeekAppointments, role: Role, now: () => Date, visible$: Observable<unknown>) { … }

  start(): Subscription { … } // loads the week on screen, then every week the person moves to,
                              // and the same week again after a write and when the page is back
  previous(): void { … }
  next(): void { … }
  today(): void { … }         // loads again even when the week of today is on screen
  detail(appointmentId: string): AppointmentDetail | null { … }
  move(appointmentId: string): void { … } // starts the move of an appointment of the week on screen
  handOver(moving: Moving, date: string): void { … } // another screen's appointment to move
  keep(): void { … }                      // ends it, leaving the appointment as it is
}
```

The view subscribes to `week$` and forwards three buttons to `previous()`, `today()` and
`next()`, "Change" to `move(…)` and the banner's button to `keep()`. It knows nothing of
Mondays, of loads, or of what ends a move.

- A change of week loads at once. While it loads, the last week stays, with `loading` true and
  the new label, in one notification.
- A failed load keeps the last week and carries the failure in plain words. A second failure
  replaces the first; the failure stays while the next load is pending; a success removes it.
- Before `start()` nothing is loaded, and nothing after its subscription ends: a move then
  changes the label only.

**The week is loaded again after every booking, cancellation, change and note saved, whatever
its outcome.** The reload is the week screen's, not the view's: between `start()` and the end
of its subscription it listens to `bookResult$`, `cancelResult$`, `updateNoteResult$` and
`changeResult$` and calls `calendar.reload()` at each result, a failure included and whatever
the reason. After a write that failed the server
may still have applied it (`docs/SHARED_CALENDAR_SPEC.md` section 16.3), and after a refusal
such as `slot_taken` the week on screen is no longer true. A result stream hands its last result
to a new subscriber at once: that one came before this `start()` and reloads nothing.

**The week is loaded again every time the page becomes visible.** What other people booked or
cancelled in the meantime is then shown when someone looks. The logic layer has no document to
ask (section 5, rule 1), so `WeekScreen` receives a stream, `visible$`, as it receives "now",
and calls `calendar.reload()` at each notification: the week on screen, whichever it is, and
nothing while the screen is not started. **Nothing is pushed and nothing is asked on a timer**:
the API is request and answer only, so there is no call while nobody is looking, and real-time
updates would be a feature of their own (`docs/FRONTEND_VIEW_PLAN.md` section 8, decision 11). A
reload that finds a dialog open leaves it as it is (section 4).

**The detail of an appointment.** `detail(appointmentId)` finds the appointment in the last
calendar view loaded, the one on screen, and returns `appointmentDetail(…)` of it, or `null`
when that week does not hold it. Which of the three actions are offered is decided there, not
in the view (`docs/SHARED_CALENDAR_SPEC.md` sections 8.3 to 8.5,
`docs/FRONTEND_SERVICES.md` section 19.6), with the `now()` read when the dialog opens:

| Action | Offered (`can…`) |
|---|---|
| The note (`canEditNote`) | To both roles while the appointment is booked and has not ended. No notice applies (`docs/SHARED_CALENDAR_SPEC.md` R-NOTE-01) |
| "Change" (`canChange`) and "Cancel appointment" (`canCancel`) | Always together: a change must pass the rules of a cancellation (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-01). To the Administrator while the appointment is booked and has not ended; to a User while "now" is not after `cancellableUntil`, the instant the server computed (exactly at it they are still offered, one millisecond later they are not) |

The detail carries the note twice: as a text to read (`note`, "—" when there is none) and as
the value of the field (`noteValue`, empty when there is none). **One sentence** says what the
appointment is, for both roles and on both screens, in this order:

| The appointment | The sentence |
|---|---|
| Cancelled with the reason `changed` | "This appointment was moved to another time." |
| Cancelled otherwise (`cancelled`, `user_deleted`) | "This appointment was cancelled." |
| Booked, and its end is not after "now" | "This appointment has ended." |
| Booked and still to end, a User, "now" not after `cancellableUntil` | "It can be changed or cancelled until Mon 23 Nov, 09:00." |
| Booked and still to end, a User, later than that | "It is too late to change or cancel this appointment." (the note's field is there all the same, and no words are added about it) |
| Booked and still to end, the Administrator | Nothing: both actions are offered |

The week holds booked appointments only, so the first two are met from the history of "My
appointments". The server decides again when the call is made.

**Moving an appointment to another time** (`docs/FRONTEND_VIEW_PLAN.md` step 63). Which
appointment is being moved is state of the week screen, carried by `week$` as `moving`, so the
view keeps listening to one stream for the week.

- **What starts it:** `move(appointmentId)`, for an appointment of the week on screen that can
  be changed at that moment, while the screen is started. The screen takes a **copy in words**
  (`movingOf`): the time it is moved from, the same with its type (and, for the Administrator,
  the User's name) for the banner, and its note. The week object stays the same, so nothing is
  redrawn.
- **Any week.** Previous, next and "Today" work as usual while moving. The old appointment may
  then be outside the week on screen, where `detail(…)` looks; the banner and the confirmation
  name it from the copy, whose words do not change with the week, its zone or a later reload.
- **What ends it:** a change that succeeds (the screen hears `changeResult$`), `keep()`, and the
  end of the subscription of `start()`: leaving the screen or signing out. Started again, the
  screen moves nothing.
- **What does not:** a refused change, whatever the reason, also when the reason is about the
  old appointment (`appointment_not_found`, `appointment_not_active`,
  `cancellation_notice_too_short`, `user_not_found`): one rule for every refusal, and the
  person gives up with the banner's button. Nor a reload of the week, the page becoming
  visible, another write's result, or the confirmation being closed.
- **What can be clicked while moving** is the view's part (section 4): free slots only.

**"My appointments": the list screen** (`docs/FRONTEND_VIEW_PLAN.md` step 64).

```ts
// `period` is the history's, null until the history is first chosen, and another object only
// when another period is accepted. `rows` is the last list loaded for the mode and the period
// on show, null until there is one. `refusal` says why the period typed was not asked for.
export type ListState = {
  mode: 'upcoming' | 'history'; period: { from: string; to: string } | null;
  loading: boolean; failure: string | null; refusal: string | null;
  rows: readonly AppointmentRow[] | null; empty: string | null;
};

export class AppointmentsScreen {
  readonly list$: Observable<ListState>;

  // `settings`: `load` and `settingsResult$` of the CalendarSettingsService.
  // `appointments`: `list`, `appointmentsResult$`, `cancelResult$` and `updateNoteResult$`.
  // `week`: `handOver` of the WeekScreen.
  constructor(settings: ListSettings, appointments: ListAppointments, week: ListWeek, role: Role, now: () => Date, visible$: Observable<unknown>) { … }

  start(): Subscription { … }            // the settings, then the list the screen is on
  upcoming(): void { … }
  history(): void { … }                  // over the period it was left on; the first time, the default one
  show(from: string, to: string): void { … } // the history over the period typed, or why not
  detail(appointmentId: string): AppointmentDetail | null { … }
  move(appointmentId: string): void { … }    // hands the appointment over to the week screen
}
```

- **The time zone comes from the settings.** The answer of `GET /calendar/appointments` does
  not name the calendar's zone, and the list can be the first screen a User lands on. At each
  `start()` the screen reads `GET /calendar/settings` once, through the
  `CalendarSettingsService`, and only then asks for the list; every date and time of the list,
  the detail it answers and "today" for the default period use that zone. While it is not known
  nothing is listed and the stream says `loading`. A failed read is the failure shown in the
  place of the list, and choosing a mode again reads again. The read is for the zone only: no
  setting is shown or changed. Nothing here uses `DEFAULT_TIME_ZONE`. **The week screen keeps
  opening without that request**: its limit around midnight (above) stands, and lifting it now
  has a precedent.
- **Two modes, one list.** Upcoming is `list({ upcoming: 'true' })`, which the service sends
  with `status=booked`; the history is `list({ from, to, status: 'all' })`. They share the
  service's one pair of streams, so a change of mode or of period while a load is under way
  replaces it.
- **The period.** The history opens on the 30 days that end today (`defaultPeriod`), today in
  the calendar's zone, loaded at once. `show(from, to)` first checks the period
  (`periodRefusal`): a date missing ("Choose both dates."), the first date after the last ("The
  first date is after the last one."), or more days than one list may hold ("A period can be
  at most 92 days long. Choose a shorter one.", the number being
  `CALENDAR_LIMITS.appointmentListDays` of `shared/`). A refusal is carried by the stream as
  `refusal`, no request is sent, and the list on screen stays. Everything else about a date is
  the service's and the server's to say. A period may hold future dates. **Known consequence
  of the default:** the list is selected by the appointment's own date, not by the day it was
  cancelled, so an appointment cancelled or moved today that was to take place next week is
  not in the 30 days that end today; a period that reaches forward shows it.
- **What is kept, and what is not.** The mode and the period are state of the screen object,
  which lives as long as the session (section 6): left and found again, the screen is on the
  mode and the period it was left on. The zone and the list are forgotten when the
  subscription of `start()` ends: the next `start()` reads the settings again, says `loading`
  with no row, then lists. Another mode or another period also forgets the list on show, which
  is not theirs; the same ones, loaded again, keep it meanwhile, and a load that fails keeps it
  with the failure.
- **A row** (`appointmentRows`): the date ("Mon 23 Nov"), the time in the calendar's zone, with
  the offsets on a day the clocks change, the type, the note (empty when there is none) and the
  status in words: "Booked"; "Ended" for a booked appointment whose end is not after "now"
  (`docs/SHARED_CALENDAR_SPEC.md` section 8.1: derived from the clock, not stored);
  "Cancelled"; "Changed" for one cancelled with the reason `changed`. The order is the
  server's, by start. An empty list has one sentence per mode: "You have no upcoming
  appointments." and "There are no appointments in this period." Nothing is paged: one list
  holds at most 92 days. **Known limit:** a row's date has no year, like every date of the
  week; a history across the end of a year does not say which year a row is in.
- **The reloads.** Between `start()` and the end of its subscription the list on show is
  loaded again at every result of `cancelResult$` and `updateNoteResult$`, a failure included,
  and at every notification of `visible$`, the same stream the shell hands the week screen;
  not for a result that was already there at `start()`. While the zone is not known, a reload
  reads the settings again.
- **The detail** of an appointment of the last list loaded is `appointmentDetail(…)` in the
  zone of the settings, with `now()` read when the dialog opens, or `null`.

**"Change" from the list goes to the week: the hand-over.** The new time is chosen where times
are shown. `AppointmentsScreen.move(appointmentId)` makes the appointment's copy in words
(`movingOf`, in the zone it knows) and calls `WeekScreen.handOver(moving, date)` with it and
the appointment's local date; the list's view then asks the shell for the week (section 6).

- **Taken at the next `start()`** of the week screen, or at once when it is started: the week
  on screen becomes the one that holds the date, and `week$` carries the move, with the words
  handed over. From there everything is a move started in the week: any week, a free slot, the
  confirmation, "Keep the appointment as it is".
- **Taken once.** Leaving the week still ends the move (the end of the subscription of
  `start()`), and a later `start()` moves nothing: a User who goes back to the list while the
  banner shows finds the list as usual, and the week, shown again, on the week it was left on
  with no banner.
- **Never taken** (the address did not change, the person signed out), it is dropped with the
  session's objects.
- Nothing is handed over for an appointment the list does not hold or that cannot be changed
  at that moment.
- After a change made this way the person is in the week, where the new appointment is.
  Nothing brings them back to the list.

**The settings screen** (`docs/FRONTEND_VIEW_PLAN.md` step 65; the Administrator's).

```ts
// `fields` is what the form is filled with: null until the settings are read, and another
// object only when the form is to be filled again. `info` is what the form says beside the
// fields. `unread` is why the settings could not be read, while there is no form.
export type SettingsState = {
  loading: boolean; unread: string | null;
  fields: SettingsFields | null; info: { timeZone: string; lastSaved: string } | null;
  saving: boolean; refusals: Partial<Record<SettingField, string>>; failure: string | null; saved: boolean;
};

export class SettingsScreen {
  readonly settings$: Observable<SettingsState>;
  // `settings`: `load`, `settingsResult$`, `update` and `updateResult$` of the CalendarSettingsService.
  constructor(settings: SettingsCalls) { … }
  start(): Subscription { … }            // reads the settings
  retry(): void { … }                    // reads again, after a read that failed
  save(fields: SettingsFields): void { … } // checks the fields; saves, or says which are in fault
  edited(): void { … }                   // something was typed or ticked: "saved" no longer holds
}
```

- **The fields are checked here, before any call** (`settingsFor`). What a field holds is text.
  It is accepted when, spaces around it aside, it is written with digits only and its value is
  inside the field's range; the ranges are `SETTINGS_RANGES` of `shared/`, never a number
  written a second time. So twenty-four typed alone, between spaces or after a zero is
  accepted; a decimal point (also followed by a zero), an exponent, a sign, an empty field and
  a word are refused. Every field in fault is said, not the first only, each with one
  sentence that names it in the words of its label and says the range: "Booking horizon must be
  a whole number from 1 to 365." No request is sent, and nothing else in the state changes.
- **The service checks again**, with the shared schema, what the logic accepted. Its
  `invalid_request` carries a message that names the field, but that message is a developer's
  and never reaches the page (section 11, decision 27): this is why the check is made twice. A
  body accepted here and refused there would be a defect; the person would read the general
  sentence of `invalid_request`.
- **"No limit" is a checkbox** (`noLimit` of the fields): ticked, `null` is sent and the
  limit's field is not looked at; not ticked, the field's number is sent, and an empty field is
  a field in fault. An empty field never means "no limit".
- **Beside the fields**: each range in words (`settingRange`, "hours, from 0 to 720"); the
  calendar's time zone, read-only (`docs/SHARED_CALENDAR_SPEC.md` R-TIME-01); and "Last saved
  by admin on Thu 19 Nov, 16:44", the moment in the calendar's zone, or "These are the default
  settings: nobody has saved them yet." while `updatedAt` is `null`
  (`docs/SHARED_CALENDAR_SPEC.md` R-SET-01).
- **Reading.** `start()` reads the settings; until they arrive there is no form and the stream
  says `loading`. A read that fails is `unread`, in plain words, in the place of the form, and
  `retry()` reads again.
- **After a save, whatever its outcome, the settings are read again**
  (`docs/SHARED_CALENDAR_SPEC.md` section 16.3). On a success `saved` is true and the form is
  filled with what the server answered (`fields` is another object). On a failure `failure`
  says why and **`fields` stays the same object**, so what was typed stays in the form. The
  read that follows brings `info` up to date in both cases and fills nothing; if that read
  fails nothing is said of it.
- **`saved` lasts until the next save or the next edit** (`edited()`); the refusals until the
  next "Save".
- **Nothing else is told of a change of settings.** The week and the list read what they need
  when they are next shown or loaded again. The settings screen is the Administrator's and the
  only screen on show when a save is made, so nothing on screen is stale after it; a User's
  open page shows slots and "can be cancelled until" as they were until its next load (a
  change of week, a write, the tab shown again), and the server decides every write with the
  new values (`docs/SHARED_CALENDAR_SPEC.md` R-SET-03).
- **One `CalendarSettingsService` per session serves two screens**: the list screen, for the
  time zone, and this one. Each listens while it is started and takes no result that was
  there before its `start()`.
- **Values typed and not saved are lost** at a change of screen and at signing out, with no
  question: the end of the subscription forgets everything, and the next `start()` reads.

**The users screen** (`docs/FRONTEND_VIEW_PLAN.md` step 66; the Administrator's).

```ts
// `rows` is the last list read: null until there is one and after a read that failed, and
// another object only when the users read differ from those on show. `field` is what the
// username field is filled with: another object only when it is to be emptied. `refusal` is
// why the text typed was not sent, `failure` why a create that was sent did not succeed,
// `created` the username of the last create that succeeded.
export type UsersState = {
  loading: boolean; unread: string | null; rows: readonly UserRow[] | null; empty: string | null;
  field: { username: string }; creating: boolean; refusal: string | null; failure: string | null; created: string | null;
};

export class UsersScreen {
  readonly users$: Observable<UsersState>;
  // `users`: `listUsers`, `listUsersResult$`, `createUser`, `createUserResult$` and
  // `deleteUserResult$` of the UsersService. `visible$` notifies each time the page becomes visible.
  constructor(users: UsersCalls, visible$: Observable<unknown>) { … }
  start(): Subscription { … }      // reads the list
  retry(): void { … }              // reads again, after a read that failed
  create(text: string): void { … } // checks the text; creates the user, or says why not
}
```

- **One request.** A row is the username and its "Delete" button. The creation date that
  `GET /users` also gives is not shown, so the screen needs no time zone and asks for nothing
  but the list. The order is the server's: by username, never an administrator
  (`docs/SHARED_CALENDAR_SPEC.md` section 10.1).
- **The username is checked here, before any call** (`usernameFor`), with the shared `Username`
  schema and nothing else: no pattern and no length is written in `frontend/src`. Spaces around
  the name are removed, as a name pasted with one would have them, and nothing else is
  changed: "Bob" is refused, not sent as "bob". The refusal is one sentence, the same that
  stands under the field as its hint (`USERNAME_HINT`): "A username has 3 to 32 characters:
  lowercase letters, digits, ".", "_" and "-", starting with a letter or a digit." The two
  lengths and the three signs are in those words only; the test of the file holds them to the
  schema (a name one character shorter and one longer than the words say, each sign inside a
  name and at its start). No request is sent for a text refused.
- **The service checks again**, with the same schema; its message never reaches the page
  (section 11, decision 27). A name accepted here and refused there would be a defect.
- **A name that exists is the server's to say**: "admin" and "alice" pass the check, the
  server answers `user_exists`, and the stream carries that as `failure`, not as a refusal.
- **The generated password never passes through this object.** The screen reads a create's
  result through a type of its own (`CreateOutcome`: a success with its username, or a failure
  with its reason), which the service's result fits and which does not name the password: no
  line of the logic layer can read it, no state can hold it, and no fixture of the logic's
  tests stands for one. The stream says that a create is under way (`creating`), that it
  failed and why (`failure`), or for which username it succeeded (`created`). The view takes
  the password from the service's own state (section 4). The view does not use `created`.
- **Reading.** `start()` reads the list; until it arrives the stream says `loading`. A read
  that fails is `unread`, in plain words, in the place of the list, and `retry()` reads again;
  the form stays usable meanwhile. **A list that could not be read again is taken off the
  screen**: it is no longer known to be true (a user deleted from elsewhere may be in it).
- **The list is read again** after every result of a create and of a delete, a failure
  included: a failed write may have been applied (`docs/SHARED_CALENDAR_SPEC.md` section
  16.3), and a delete answered `user_not_found` means the list on show is old. And every time
  the page becomes visible, through the stream the shell hands the week and the list screens.
  Not for a result that was already there at `start()`.
- **The same users keep the same rows object.** A read that brings the usernames already on
  show changes `loading` only, so the view redraws nothing and the keyboard stays on a row's
  button through it; a dialog that is open is left as it is in every case.
- **The delete is called by the view**, from its dialog (`UsersService.deleteUser`), like a
  cancellation from the detail; its failure is said there with `failureText`. The screen only
  hears its result, to read the list again. `cannot_delete_admin` cannot arrive from this
  screen, whose list never holds an administrator, and has its sentence all the same.
- **One `UsersService` per session serves the week's book dialog and this screen.** `listUsers`
  has one pair of streams and one pending call; only one screen is on show at a time, so the
  two never ask together. This screen takes no list that was there before its `start()` (the
  book dialog may have left one) and reads its own; the book dialog asks at every opening
  (section 4), so a user created here is in its list and a deleted one is not, with no code
  for it. `createUser` and `deleteUser` are this screen's only.
- **What is kept, and what is not.** Nothing: the end of the subscription of `start()`
  forgets the list, what the form said and what was typed, and the next `start()` reads.

**The availability screen** (`docs/FRONTEND_VIEW_PLAN.md` step 67; the Administrator's; the
first screen that uses two services at once, and a third for the time zone).

```ts
// What one of the four writes says to the form or the dialog that asked, replaced whole at
// every new ask. `about` is the id of the type renamed or of the pattern changed, empty for
// a create.
export type Ask<F extends string> = {
  about: string; busy: boolean; refusals: Partial<Record<F, string>>;
  failure: string | null; conflicts: ConflictList | null; done: boolean;
};

// `types` and `groups` are the two lists as last read: null until there is one and after a
// read that failed, and another object only when what was read differs from what is on show.
// `choices` are the types to choose from in the two pattern forms. `typeField` and
// `patternFields` are what the two forms that create are filled with: another object only
// when the form is to be filled again.
export type AvailabilityState = {
  loading: boolean;
  typesUnread: string | null; types: readonly TypeRow[] | null; typesEmpty: string | null;
  patternsUnread: string | null; groups: readonly PatternGroup[] | null; patternsEmpty: string | null;
  choices: readonly Choice[]; typeHint: string;
  typeField: { name: string }; patternFields: PatternFields;
  typeCreate: Ask<'name'>; rename: Ask<'name'>; patternCreate: Ask<PatternField>; change: Ask<PatternField>;
};

export class AvailabilityScreen {
  readonly availability$: Observable<AvailabilityState>;
  // `settings`: `load` and `settingsResult$`. `types`: `load`, `create`, `rename` and the four
  // result streams of the AvailabilityTypesService. `rules`: `loadPatterns`, `createPattern`,
  // `updatePattern` and the four result streams of the patterns, of the AvailabilityRulesService.
  constructor(settings: AvailabilitySettings, types: AvailabilityTypes, rules: AvailabilityRules, now: () => Date, visible$: Observable<unknown>) { … }
  start(): Subscription { … }                    // reads the settings, the types and the patterns
  retryTypes(): void { … }                       // reads the types again, after a read that failed
  retryPatterns(): void { … }                    // the patterns, and the settings while the zone is not known
  createType(text: string): void { … }           // checks the name; creates, or says why not
  rename(typeId: string, text: string): void { … }
  createPattern(fields: PatternFields): void { … } // checks the six fields; creates, or says which are in fault
  change(patternId: string, fields: PatternFields): void { … } // one call that replaces the pattern's fields
  conflicts(conflicts: readonly AppointmentConflict[] | undefined): ConflictList | null { … }
}
```

- **Three reads, at once.** `start()` asks for the settings, the types and the patterns
  together. The settings are read for the calendar's time zone only, as the list screen reads
  them: the zone decides "today" (which patterns have ended, and the date the form that
  creates a pattern starts on) and the dates and times of a conflict. The list of the types
  needs its own read only; the list of the patterns needs the patterns and the zone. While
  any read is under way the stream says `loading`.
- **A failed read is said in the place of its list**, and the two lists fail and are tried
  again independently: `retryTypes()` reads the types, `retryPatterns()` the patterns, and the
  settings too while the zone is not known. A failed read of the settings is said in the
  place of the patterns' list. Both forms stay usable meanwhile; a pattern needs a type to be
  chosen, so it cannot be created while no list of types was ever read.
- **A list that could not be read again is taken off the screen**, as the users' is. **The
  types as last read are kept** for two things all the same: the choices of the two pattern
  forms, so that an open dialog does not lose its type to a read that failed, and the names in
  the patterns' rows. The server has the last word on a type that is gone (`type_not_found`).
- **The same lists read again keep the same objects** (the rows and the choices are compared
  as data), so the view redraws nothing and the keyboard stays on a row's button; a dialog
  that is open is left as it is in every case.
- **A type's rows** (`typeRows`): the name, in the server's order (by name), and the names of
  its two buttons for a screen reader ("Rename Studio", "Delete Studio").
- **A pattern's rows** (`patternGroups`): one group per weekday, Monday to Sunday, a weekday
  with no pattern left out; in a group by start, then by end, then by the first date of
  validity. A row has its hours ("09:00 – 13:00"; an end at midnight is "24:00"), the name of
  its type, and its validity in words, with the year, since a pattern may run for years
  ("from 20 November 2026", "from 20 November 2026 to 19 January 2027").
- **Every pattern the server returns is listed.** One whose validity ended before today, the
  calendar's today, is marked `ended` and stays: a type cannot be deleted while any pattern
  uses it, ended or not (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-03), so the Administrator must
  see it to delete it. A pattern that ends today has not ended. No switch hides anything.
- **The type's name is joined here** from the two lists, which are read at different moments.
  A rename therefore changes the patterns' rows when the types are read again, with no read
  of the patterns. A pattern whose type the types do not hold shows "Unknown type"; opened in
  the dialog that changes it, it has no type chosen.
- **A type's name is checked here, before any call** (`typeNameFor`), with the shared
  `TypeName` schema and nothing else: spaces around it are removed, by the schema, and
  nothing else is changed. The refusal is one sentence, the same that stands under the field
  as its hint (`TYPE_NAME_HINT`): "A name has 1 to 40 characters, with no tab in it.", the
  number being `CALENDAR_LIMITS.typeNameLength` of `shared/`. A name that exists, whatever
  its capitals, and the limit of types are the server's to say: the form's failure, the field
  not marked. The page never compares a name with the list on show. A rename to the same name
  is sent as it is.
- **A pattern's fields are checked here, before any call** (`patternFor`). The refusals: "End
  must be later than Start."; "Type must be chosen."; "Valid from must be a date."; "Valid
  until must be a date, or left empty."; "Valid until must not be before Valid from." Every
  field in fault is said, each sentence starting with the words of its label (decisions 68
  and 69). Two times and two dates are compared as texts written alike; whether a text is a
  date is the shared `LocalDate` schema's to say. The weekday and the two times come from
  lists that hold nothing wrong and are not checked. "Today" is not a rule: a pattern may
  start in the past (`docs/SHARED_CALENDAR_SPEC.md` R-PAT-03). What only the server knows is
  not checked: an overlap, a conflict, the limit of patterns, a type deleted meanwhile.
- **The service checks again**, with `PatternBody`, which has the last word; a body accepted
  here and refused there would be a defect. The tests of `availability.model.ts` hold the two
  together: every body the logic accepts is parsed by the schema unchanged, and every case it
  refuses the schema refuses too.
- **"Change" is one call**, `updatePattern`, which replaces the pattern's six fields. The
  shortcut of `docs/SHARED_CALENDAR_SPEC.md` section 6.2, "from a date on" in two calls, is
  not built: the Administrator sets "Valid until" on the old pattern and creates a new one.
- **The form that creates a pattern** starts on Monday, 09:00 to 10:00, no type chosen, valid
  from today with no end (`startingFields`). "Today" is the calendar's, so `patternFields`
  becomes another object when the settings first say the zone, and again after every create
  that succeeded; after a refusal or a failure what was chosen stays.
- **What a write says** is one `Ask` per kind of write, replaced whole at every ask: a
  refusal by the check (no call, the lists kept), `busy` while the call is under way, then
  `done` or the failure in plain words (`failureText`, with what was attempted), with the
  appointments in the way when the server named some. **While a write of a kind is under way
  another of that kind is not taken**, sent or refused: the answer that arrives is then
  always of the write the state is about, which is what lets a dialog trust `about`
  (section 4). A change and a create under way together do not concern each other.
- **The lists are read again after every write, whatever its outcome**
  (`docs/SHARED_CALENDAR_SPEC.md` section 16.3): the types after a create, a rename and a
  delete of a type; the patterns after a create, a change and a delete of a pattern. A
  pattern's write answered `type_not_found` means the list of types on show is old: the types
  are read again too. And both lists every time the page becomes visible, through the stream
  the shell hands the other screens. Not for a result that was already there at `start()`.
- **The two deletes are called by the view** (decision 86: a write with nothing to check);
  the screen hears their results, to read again. For the appointments in the way of a
  pattern's deletion the view asks `conflicts(…)`, which makes them ready to draw in the
  calendar's zone, or nothing while the zone is not known.
- **The conflicts** (`conflictList`, in a file of its own since
  `docs/FRONTEND_VIEW_PLAN.md` step 68 uses it for an override and a window): the rows by
  start, then by username, each with its date ("Mon 23 Nov"), its time in the calendar's
  zone, with the offsets on a day the clocks change, and its User; above them "1 appointment
  is in the way:" or "3 appointments are in the way:". No list, or an empty one, is nothing
  to draw. The id of an appointment is not carried further.
- **Nothing is told to the week.** It loads at its `start()`, so going from "Availability" to
  "Week" shows the new windows and a renamed type's name; a User's open page shows them at
  its next load.
- **One `CalendarSettingsService` per session now serves three screens**; each listens while
  it is started and takes no result that was there before its `start()`.
- **What is kept, and what is not.** Nothing: the end of the subscription of `start()`
  forgets the lists, the zone, what the forms said and what was typed, and the next `start()`
  reads everything again.

**The change.** `changeFor(slot, zone, role, fields)` makes the argument of
`AppointmentsService.change` from what the confirmation holds. The times are a booking's: a
User sends the slot's `start`, the Administrator both instants, the slot's own while the two
lists were not touched (one function, `timesFor`, serves both). Never a `username`: the User
is the old appointment's (`docs/SHARED_CALENDAR_SPEC.md` section 8.4). **The note is always
sent**, as the field holds it: the field opens with the old note, so untouched it stays the
same, edited it changes, and emptied it is cleared, since the shared schema makes a blank note
`null` (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-03). The key is never left out.

**Known limit: moving an appointment inside a window that has no free slot left.** The
Administrator shifts an appointment by clicking a free slot of the same window and setting the
two times, which may overlap the old ones (`docs/SHARED_CALENDAR_SPEC.md` R-CHG-01; the lists
cover the whole window). When that window has no free slot there is nothing to click: the
Administrator cancels the appointment and books it again. A User books whole hours, so the case
does not arise.

**The booking.** `bookingFor(slot, zone, role, fields)` makes the argument of
`AppointmentsService.book`. A User sends the slot's `start` and the note, nothing else
(`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-01, R-BOOK-02). The Administrator sends the User chosen
and both instants. A blank note is left out. Nothing is checked here: the shared schema, through
the service, refuses an end that is not after the start (`invalid_request`, no request sent),
and the server says the rest (`docs/FRONTEND_SERVICES.md` section 8, decision 42).

**The Administrator's custom times** are two lists of local times on the 15-minute grid, from
the start to the end of the window that holds the slot (`timeChoice`), set to the slot's own
when the dialog opens. While the two are the ones the dialog opened with, the slot's own
instants are sent; otherwise the two times become instants with `toInstant` on the slot's day in
the calendar's zone. **Known limits, on the two nights of a clock change:**

- the night the clocks go back, the slot's own instants name its hour without ambiguity, so
  either of the two 02:00 slots is booked as it is, and the dialog shows the offsets as the week
  does. A custom time chosen in the repeated hour is its **earlier** occurrence
  (`docs/SHARED_CALENDAR_SPEC.md` R-TIME-03): from the later 02:00 slot, 02:15–02:45 books the
  earlier half hour, and the later one cannot be chosen;
- the night they go forward, the lists hold the times of the missing hour, which `toInstant`
  moves forward by an hour (`docs/SHARED_CALENDAR_SPEC.md` R-TIME-03).

Availability at night on those two nights is rare; neither is solved.

**Failures in plain words.** `failureText(reason)` turns a failure's `reason` into a sentence. It
knows the reasons a person can meet so far: the transport reasons every API service shares
(`docs/FRONTEND_SERVICES.md` section 10.2), the codes of `GET /calendar`, the login's reasons,
and the codes of a booking, of a cancellation, of a change, of a note and of the list of users
(`docs/FRONTEND_SERVICES.md` sections 19.1 and 13.1). The list of appointments and the read of
the settings (`docs/FRONTEND_SERVICES.md` sections 19.1 and 15.1) brought no code without a
sentence, and neither did the save of the settings. The users (`docs/FRONTEND_SERVICES.md`
section 13.1) brought two: `user_exists`, "A user with this username exists already. Choose
another username.", and `cannot_delete_admin`, "An Administrator cannot be deleted."
`user_not_found`, met after a booking, is the same sentence after a delete: "This user no
longer exists." The sentence of `slot_taken` says that
the calendar has been refreshed, which the reload above makes true. `invalid_request` has one
sentence for every case and every screen, "The request was not accepted. Check what you entered
and try again.": an end not after the start has no sentence of its own, and the logic layer
does not check the two times. **A second, optional argument says what was attempted**
(`failureText(reason, 'change')`), for a reason whose words depend on it. There are two.
`cancellation_notice_too_short` is "It is too late to cancel this appointment." after a
cancellation and "It is too late to change this appointment." after a change, which the server
refuses with the same code (`docs/SHARED_CALENDAR_SPEC.md` section 8.4).
`appointment_limit_reached` is "You have as many upcoming appointments as the calendar allows.
Cancel one to book another." after a booking and "You have more upcoming appointments than the
calendar now allows, so this one cannot be moved. Cancel one first." after a change: a change
books nothing more, so it meets the limit only when the limit was lowered below what the User
already holds (`docs/SHARED_CALENDAR_SPEC.md` R-SET-03). Every other reason of an appointment keeps one sentence
whatever was attempted.
**The availability** (`docs/FRONTEND_SERVICES.md` sections 16.1 and 17.1) brought seven
codes. `type_name_exists`: "A type with this name exists already. Choose another name."
`type_in_use`: "This type is in use, so it cannot be deleted. A type is in use while a weekly
pattern, a date of today or later or an upcoming appointment uses it."
(`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-03). `type_not_found`: "This type no longer exists."
`pattern_not_found`: "This pattern no longer exists." `availability_overlap`: "Another window
of the same day covers part of these hours, whatever its type. Choose other hours."
(`docs/SHARED_CALENDAR_SPEC.md` R-AV-01). `availability_conflict`: "This would leave booked
appointments outside the hours open for booking. Cancel or move them in the week first.",
under which the conflicts list stands. And `limit_reached`, whose words depend on what was
attempted, a third and a fourth value of the second argument: after `'type'`, "The calendar
can hold 20 types at most. Delete one to create another."; after `'pattern'`, "The calendar
can hold 50 weekly patterns at most. Delete one to create another."; the two numbers are
`CALENDAR_LIMITS.types` and `CALENDAR_LIMITS.patterns` of `shared/`, never written in the
sentence by hand. With nothing said of what was attempted it is "The calendar cannot hold
more of these. Delete one to create another."
The raw technical text is never shown: a reason without a sentence gets one general sentence,
never the service's `message`, which is written for a developer. The login view uses it too. A
wrong password and an unknown user are one reason and get one sentence. Each later step adds the
sentences of its routes' codes.

## 6. The shell

The shell is the start-up code, one function called by the entry file of the bundle:
`runShell(config)`, in `frontend/src/views/shell.ts`. It creates what lives as long as the page
(point 1) and calls `mountShell(root, { config, store, login })`, which does the rest and is
what the shell's DOM test drives, with a store and a login of its own. `mountShell` gets the
API's configuration and the whole store because it creates the API services of each session
(point 4), which read the token from the store at each call.

1. **It creates the `SessionStore`, the `LoginService` and the `RefreshService` once**, with the
   configuration (the API's URL, Cognito's URL, the client id), which it receives as one plain
   object and never looks up itself (section 12.1). It starts the automatic refresh
   (`docs/FRONTEND_SERVICES.md` section 11.6).
2. **It subscribes to `store.session$`** (`docs/FRONTEND_SERVICES.md` section 9.5). `null` shows
   and mounts the login view. A session hides it and shows the application, with the navigation
   its `role` allows. The application's frame is one element of `index.html` (`#app`): a header
   with the username, the role in words ("Administrator" or "User") and "Sign out", the
   navigation, and the main area where the screens are. The shell fills the header when a person
   enters and empties it when that person leaves. "Sign out" clears the `SessionStore` and does
   nothing else (section 10, open point O7): the screen changes because `session$` then notifies
   `null`.
3. **A refreshed session is the same person.** The shell reacts only when the username or the
   role changes (`distinctUntilChanged`), so a token refresh leaves the screen as it is. The session is
   reduced to the username and the role before anything else sees it (section 3, rule 11).
4. **New API services and logic objects for every session.** They are created when a session
   starts and dropped when it ends, so that nothing of one person's data can be replayed to the
   next (the services' result streams replay their last value). One function of the shell,
   `sessionObjects`, creates them when a person enters: today the `CalendarService`, the
   `AppointmentsService`, the `UsersService` (for both roles; a User's view never calls it),
   the `CalendarSettingsService` (read by the list screen for the time zone, read and saved by
   the settings screen), the `WeekScreen`, the `AppointmentsScreen`, which is given the
   `WeekScreen` for the hand-over of section 5.1, the `SettingsScreen` and the `UsersScreen`,
   which is given the session's `UsersService`, the one the week's book dialog asks for its list, the `AvailabilityTypesService`, the `AvailabilityRulesService` and the `AvailabilityScreen`, which is given both and the session's `CalendarSettingsService`. They live as long as the person's session, not as long as a screen is on
   show: coming back to a screen finds its logic object as it was left. The same function builds
   the stream the week, the list, the users and the availability screens reload on (section 5.1): the document's `visibilitychange` event,
   keeping the notifications at which `document.visibilityState` is `visible`. Each screen
   listens to it only while it is started, so the screen on show is the one that loads again,
   and nothing is loaded at the login or after signing out.
5. **Mounting.** To show a view the shell un-hides its element, calls its mount function, then
   starts its logic object and triggers its first loads. To leave it, the shell unsubscribes the
   one subscription that holds all of this and hides the element.
6. **Navigation between the screens is the URL's hash** (`#/week`, `#/settings`), read as a
   stream (`fromEvent(window, 'hashchange')`, starting from the hash the page has). On each
   change the shell leaves the current view and mounts the next. No router library. A hash the
   role may not see, an unknown one or none shows the role's first screen.

**The table of screens.** The screens are one table in `shell.ts`, `SCREENS`, in the order of
the navigation. An entry is:

```ts
export type Screen = {
  hash: string;             // '#/week'
  label: string;            // 'Week', the link's text
  roles: readonly Role[];   // who may see it
  element: string;          // '#week', the screen's element inside main.screen
  // Mounts the view on the element, then starts its logic object; the subscription holds both.
  show: (root: HTMLElement, objects: SessionObjects) => Subscription;
};
```

There are five entries so far: `#/week`, "Week", both roles; `#/appointments`, "My
appointments", the role `user` only; `#/settings`, "Settings", `#/users`, "Users", and
`#/availability`, "Availability", the role `admin` only. The dialogs have no address. A new screen is a new entry,
its element in `index.html`, and its services and logic object in `sessionObjects`; the code
that reads the address, fills the navigation and switches between screens does not change, and
did not for the second entry, nor for the third, the fourth or the fifth. `mountShell` takes the table as an optional dependency, which a
test uses to bring an entry whose mount is a spy.

**What the shell hands a view** is in the entry's `show`: the logic object and the parts of the
services, as before, and for the list's view a function, `showWeek`, which sets the address to
the week's (`window.location.hash`). A view never knows an address: the list's view calls the
function after "Change", the address changes, and the shell follows it like any other change
of hash, leaving the list and mounting the week.

- **The address is put right in place.** An empty, unknown or forbidden hash shows the role's
  first screen, and the address becomes that screen's with `history.replaceState`: no step is
  added to the browser's history, so the back button does not return to the wrong address.
- **The navigation's links** are copies of a `<template>`, one per screen the role may see,
  made when a person enters and removed when the person leaves. The link of the screen on show
  carries `aria-current="page"`.
- **A change of hash** leaves the screen on show (unsubscribe, hide) and mounts the next. An
  address put right while its screen is on show changes nothing.
- **Signing out leaves the address as it is.** The next person starts from it if it is theirs to
  see, and from their role's first screen if it is not.

The sequence when the page is loaded: the browser parses `index.html`, with every view hidden;
the module script runs once the whole page is parsed (a module script is deferred), so every
element exists; the shell subscribes to `session$`, which answers at once with `null` (section
10, open point O3); the login view is shown and mounted.

## 7. The fallback: `lit-html` for a single view

`lit-html` (one function, `render`, and one template tag, `html`) is added **for one view** when
one of these is true for that view:

- it needs input fields inside a region that is redrawn (section 3, rule 4 cannot be kept);
- the code that looks nodes up to react to a second or third stream has become longer than the
  rest of the view;
- someone is about to write a helper that builds or updates nodes (section 3, rule 12).

The week calendar is the likely first case, and it may be the only one. In the trial its plain
version stayed readable, so it starts plain.

When it is added:

- it is a decision recorded in this document, naming the view, and the only new dependency;
- the view keeps the same contract, `mount<Name>(root, deps): Subscription`, the same logic layer
  and the same test. The shell, the other views and the style sheet do not change. The view's
  markup moves from `index.html` into the view's file, where only an empty element stays;
- the import is allowed for that view's file only, by the lint rule on imports;
- a computed position is bound as a property (`.style=${…}`), not written as a `style=` attribute
  or through the `styleMap` directive, both of which a strict Content-Security-Policy refuses
  (section 3, rule 6);
- a modal `<dialog>` still needs `showModal()`, called after the render: a template cannot
  express it.

**When to think again altogether.** If the interface grows well beyond the views of
`docs/SHARED_CALENDAR_SPEC.md` section 16.8, or a design system with ready-made components
becomes a requirement, the candidate is Svelte (`docs/FRONTEND_VIEW_OPTIONS.md` section 4.6). The
services and the logic layer would not change.

## 8. Testing the views

- **Every view has a DOM test.** It loads the real `index.html` into an emulated document, so a
  selector that does not match the markup fails there: this is the check the compiler cannot
  make (section 4).
- **The mount function gets fake services and fake logic objects**: plain objects whose streams
  are subjects the test controls and whose methods are spies. No mocking library.
- **What a test does**: emit a state and check the elements (the button is disabled when
  `pending`; a note containing `<script>` appears as text); act as the user (click, submit) and
  check the call and its arguments; unsubscribe and check that the view left nothing behind
  (section 3, rule 9).
- **The logic layer is tested without a DOM** (section 5, rule 7), and that is where most of the
  cases are: a view's test checks wiring, not rules. Its test files run with the machine's time
  zone set to `Pacific/Kiritimati`, 14 hours ahead of UTC (`tests/unit/logic/zone.ts`, with a
  test that the setting took), so a date or a time read in the browser's own zone would be a
  wrong result; "now" is a fixed moment handed to the object under test.
- **No test of a view needs the network.** The existing integration journeys of `frontend/`
  already cover the services against the local stack.

The emulated document is `happy-dom`'s, and the views are inside the 100 % line coverage of
`frontend/src` (section 12.3).

**What `happy-dom` does not emulate of the native `<dialog>`** (tried with `happy-dom` 21, plan
step 60). It does: `showModal()`, `close()`, the property and the attribute `open`,
`returnValue`, the `close` event, and a `<form method="dialog">` closing its dialog. It does
not, so these are checked in a browser only:

- the Escape key does not close a dialog, and there is no `cancel` event;
- a modal dialog does not make the rest of the page inert: a click on an element outside it
  still arrives;
- the focus does not move into the dialog when it opens, nor back when it closes;
- `:modal` never matches, and there is no `requestClose()`;
- the `close` event is sent at once, inside `close()`; a browser sends it a moment later.

A view's test may therefore call `close()` to stand for the Escape key, and must not rely on the
order between `close()` returning and the `close` event.

What the dialogs' tests rely on (plan step 62), all of which `happy-dom` 21 does as a browser
does: `form.reset()`, a `<select>` whose `value` is set and read, `FormData` reading a
`<textarea>` and a `<select>`, an `<option>` whose value is its text, and `close()` on a dialog
that is not open doing nothing. One difference: a list with no choice gives `FormData` an entry
with an empty value there and no entry in a browser; the view reads both as an empty text. Since a click passes
through a modal dialog there, a test can open both dialogs at once, which a person cannot: the
shell's test uses it to sign out with both open. The document's `visibilityState` is always
`visible` there: the shell's test defines the property on the document for the length of a test
and sends the `visibilitychange` event itself.

What the tests of the note and of the change rely on (plan step 63): a `<textarea>` whose
`value` is set by the script and emptied by `form.reset()`, and a `disabled` button whose
`click()` does nothing, as in a browser, so "a click on an appointment does nothing while
moving" is tested there. For the browser only: where the focus goes when "Change" closes the
detail and the appointment's button it would return to becomes disabled. In Chromium the focus
is then on nothing, and the next Tab goes to the first slot after that appointment, since the
browser continues from where the focus was.

What the tests of the list and of the shared dialog rely on (plan step 64):

- **The detail's test runs three times** (`detail.view.test.ts`, `describe.each`): the dialog
  mounted alone, by the week view and by the list's view, each host opening it its own way (a
  call of `open`, a click on an appointment, a click on a row). The same cases, with the same
  assertions, hold for the three. The week's and the list's own tests keep what is theirs:
  which appointment is opened, whose answers and calls are used, and what "Change" does.
- **The native date field** (`<input type="date">`), as `happy-dom` 21 has it: its `value` is
  set and read as the text `YYYY-MM-DD`, an empty field reads as an empty text, and
  `form.reset()` empties it, all as in a browser. There is no picker and nothing typed: what a
  person can and cannot type into the field, and the order of day and month it shows, are the
  browser's only. The tests never rely on the field refusing a value.
- **A change of address made by the script** (`window.location.hash = …`) sends `hashchange` a
  moment later there, as in a browser: the shell's test waits for the address.
- **The page's comments are in `outerHTML`.** A test that looks in the whole document for what
  one person left behind looks for data (a note, a name, a date), not for fixed words of the
  page, which a comment of `index.html` may hold.

What the tests of the settings rely on (plan step 65), as `happy-dom` 21 has it:

- **The number field** (`<input type="number">`): its `value` is set and read as text. A text
  that is not a number reads back as an empty text, as in a browser; a text with spaces around
  a number is kept as it is there, where a browser gives an empty text. `valueAsNumber`,
  `min`, `max` and the field's `validity` are there; the view uses none of them to decide.
  What a person can type into the field is the browser's only: Chromium lets digits, a point,
  a sign and the letter of an exponent through, and nothing else.
- **The checkbox**: `click()` ticks it and sends `change` but **no `input` event**, where a
  browser sends both. The view therefore tells the logic object of an edit from the checkbox's
  `change` too, and a test of an edit typed into a field sends the `input` event itself.
  `form.reset()` unticks it and empties the fields, and leaves `disabled` as it is, as in a
  browser: the view's teardown puts it back.
- **A checkbox's `value` is always "on".** A test that reads every field of the page for what a
  person left behind reads a checkbox by whether it is ticked.

What the tests of the users rely on (plan step 66), and what was learnt in the browser:

- **The Escape key on a modal dialog, in Chromium 159** (tried before any code, in the headless
  browser of the check). Plain: a `cancel` event, then the dialog closes. With the `cancel`
  event refused (`preventDefault()`): the dialog stays open at the first and at the second
  press and **closes at the third**, whatever the handler does: a page cannot keep refusing.
  With the attribute `closedby="none"`: no `cancel` event at all, and the dialog stays open
  however many times the key is pressed (eight in a row in the check). The page uses both: the
  attribute is what holds, the refusal is for a browser that does not know the attribute. A
  click outside a modal dialog closes it in none of these cases.
- **`happy-dom` 21 has neither**: no Escape key, no `cancel` event of its own, and `closedby`
  is an attribute like any other. The view's test sends a `cancel` event itself and checks that
  it is refused, and `page.test.ts` checks the attribute; that the dialog stays open under the
  key is the browser's only.
- **`autofocus` and where the keyboard lands** when a dialog opens are the browser's only
  (`happy-dom` moves no focus). In Chromium the heading of the password dialog has it, Enter
  and the space bar there do nothing, and one Tab reaches the button.
- **A `close` event that arrives late.** `happy-dom` sends `close` inside `close()`; a browser
  sends it a moment later, and input that arrives meanwhile is handled first. A test stands
  for it by sending a `close` event itself after the dialog was opened again: the delete
  dialog, the detail and the book dialog, none of which has a handler for it, must still act
  on what they show and close on their success (`users.view.test.ts`,
  `detail.view.test.ts`, `week.view.test.ts`).
- **A class the style sheet already knew.** `happy-dom` applies no style sheet. The button of
  the password dialog first had the class `noted`, which an older rule matches
  (`dialog .noted { display: contents; }`, the detail's note): in the browser it was invisible
  and out of the keyboard's reach, with every test green. A new class is looked for in
  `style.css` before it is used, and the browser check reaches every button by keyboard.
- **A password in the tests.** The view's and the shell's tests use made-up texts as the
  generated password and look for them in the whole document's source, in every field's value
  and in the address; the logic's tests have none. No test takes a snapshot.
- **The shell's test of a second person** no longer looks for a word. It compares the whole
  page (its source and what every field holds) as the Administrator finds it after a User was
  there with the page the Administrator finds when nobody was there before, with the clock
  standing still: anything left of the first person, of whatever kind, makes the two differ.

What the tests of the availability rely on (plan step 67), and what was learnt in the browser:

- **A list with no choice chosen.** A `<select>` whose `value` is set to a text none of its
  choices has shows nothing, has `selectedIndex` −1 and reads back as an empty text, in
  `happy-dom` 21 as in Chromium. The view uses it twice: the form that creates a pattern
  starts with no type chosen, and a chosen type that is gone from the list that arrives
  leaves none chosen. A list rebuilt with `replaceChildren` has its first choice chosen, and
  `form.reset()` chooses the first one too, in both: the view sets the value after a rebuild,
  and never relies on a reset to put a list back.
- **A label's text holds the texts of its list's choices** (`textContent` of a `<label>`
  around a `<select>`): a test that reads the words of a label reads its first text node.
- **A helper that puts the screen's id before a selector scopes only the first part of a
  list of selectors**: `#availability li, option` is every `<option>` of the page. A test
  that counts what a view left behind asks the screen's element instead.
- **The page's fixed words are in its comments** (plan step 64, above): "in the way" is in a
  comment of `index.html`; the tests look for a conflict's date and name.
- **Where the keyboard is after a dialog closes** is the browser's only, and in Chromium 159
  it is this. After "Close", "Keep" or the Escape key it is back on the row's button that
  opened the dialog. After a rename, a change or a delete that succeeded it is on nothing:
  the list was read again and differs, so the row's button is a new element, or is gone; the
  next Tab continues from where the button was. The same after "Create pattern" pressed on
  its button, which is disabled while the create is under way; "Create type" by the Enter
  key leaves the keyboard in the name field. When a dialog opens the keyboard is on its
  first field (the name, the weekday), and on "Keep" in the one that deletes.
- **By keyboard, a list is driven by typing** ("Sunday", "05:00") or by the arrow keys; from
  a list with none chosen the first arrow chooses the first choice.

## 9. Placement

Inside `frontend/`, next to the services:

```
frontend/
├── index.html                 # all the markup: one element per view, its dialogs, the <template>s
├── style.css                  # the one style sheet
├── scripts/                   # Node, not the browser: the bundle command and the dev server (section 12)
│   ├── bundle.mjs             # what the two share: how src/main.ts becomes app.js
│   ├── build.mjs              # npm run build -w frontend → dist/
│   ├── dev.mjs                # npm run dev -w frontend → http://localhost:5173
│   └── seed-local.mjs         # npm run seed:local -w frontend → a week to look at, in the local calendar
├── src/
│   ├── main.ts                # the entry file of the bundle: the configuration, then the shell
│   ├── services/              # docs/FRONTEND_SERVICES.md
│   ├── logic/                 # the logic layer, no DOM (section 5.1): texts.ts, week.model.ts,
│   │                          # booking.ts, appointment.detail.ts, week.screen.ts,
│   │                          # appointments.model.ts, appointments.screen.ts,
│   │                          # settings.model.ts, settings.screen.ts, users.model.ts,
│   │                          # users.screen.ts, availability.model.ts, conflicts.ts,
│   │                          # availability.screen.ts
│   └── views/                 # shell.ts and one <name>.view.ts per view: login.view.ts, week.view.ts,
│                              # appointments.view.ts, settings.view.ts, users.view.ts,
│                              # availability.view.ts; detail.view.ts, the dialog two views mount
├── tests/
│   └── unit/
│       ├── services/          # vitest project `unit`, in node
│       ├── logic/             # mirrors src/logic; project `unit`; zone.ts (the browser's zone of
│       │                      # the tests), fixtures.ts (calendar views)
│       └── views/             # mirrors src/views: the DOM tests, vitest project `views` (happy-dom);
│                              # page.ts loads the real index.html
└── dist/                      # generated, git-ignored: index.html, style.css, app.js, app.js.map
```

- The lint rule on imports of `frontend/src` stays as it is (`rxjs`, `rxjs/fetch`,
  `rxjs/operators`, `@shared-calendar/shared`, relative paths): the views and the logic add no
  import.
- Two lint rules guard the layers (root `eslint.config.js`): no `innerHTML`, `outerHTML` or
  `insertAdjacentHTML` in `frontend/src` (section 3, rule 5), and no global `document` or
  `window` in `frontend/src/logic` and `frontend/src/services` (section 2). The second is on the
  global: a parameter named `window` is not concerned.
- `frontend/scripts/*.mjs` run in Node and are outside the rules for the browser's code; the
  comment rule of `CLAUDE.md` applies to them.
- `index.html` names its script and its style sheet `app.js` and `style.css`, the names the
  build writes and the dev server answers to, so the same page is served by both.


## 10. Open points

Not decided by this version. "Blocks" says what cannot be done before the point is settled.
O4, O6 and O8 were decided with `docs/FRONTEND_VIEW_PLAN.md` (its section 2) and are no longer
open: their rows say where the decision is written.

| # | Point | Direction, where there is one | Blocks |
|---|---|---|---|
| O1 | **Hosting.** Static files on an S3 bucket behind CloudFront, or equivalent, in its own SAM template (`docs/FOLDER_STRUCTURE.md` section 7) | Fixed in principle there; the template, the domain and the deploy script are not designed | The first deployment |
| O2 | **The CORS gap.** The API answers no cross-origin request (`docs/FRONTEND_SERVICES.md` section 10.3) | One origin for the page and the API (the hosting routes a path to the API), or a `CorsConfiguration` on the API naming the page's origin. Decided with O1. Locally the dev server passes the API's and Cognito's paths on, which gives one origin (section 12.2): the gap does not bite there, and is not solved | The first deployment |
| O3 | **The session across a reload.** In memory only: a reload means signing in again (`docs/FRONTEND_SERVICES.md` section 9.6) | `sessionStorage` is the candidate named there. Decided with O5 | Nothing: the application works without it |
| O4 | **The bundle command and the dev server**, and with them where the configuration comes from and where the built files go | **Decided: esbuild**, two Node scripts. Sections 12.1 and 12.2 | Nothing any more |
| O5 | **The Content-Security-Policy of the hosting** | `default-src 'self'` works: the dev server sends it (section 12.2). To settle: `zod` probes for `eval` when it starts, which such a policy reports in the console (it is caught, and harmless) | The first deployment |
| O6 | **The DOM emulation for the views' tests and the coverage of the views** | **Decided: `happy-dom`, and the views inside the 100 % line coverage** of `frontend/src`. Section 12.3 | Nothing any more |
| O7 | **Logout.** Not designed in the services layer (`docs/FRONTEND_SERVICES.md`, status line) | The shell needs it. Until then "Sign out" can only clear the `SessionStore`, which leaves the refresh token valid at Cognito | The first deployment |
| O8 | **The language of the interface** and where its texts are kept | **Decided: English only**, no translation mechanism. Section 12.4 | Nothing any more |
| O9 | **The size of the bundle.** Of the 490 kB of `app.js` at plan step 60, 454 are `zod`, and 264 of those are its messages in other languages, which the interface never shows (section 12.1) | Slimming it means changing how `shared/` brings `zod` in (which entry of `zod` its schemas import, or what `shared/` exports to the browser): a change to `shared/`, which the back end uses too, so a decision of its own | The first deployment. Nothing locally |

What is still open stands between the front end and its first deployment, not between it and
the next view.

## 11. Decisions and assumptions

"Beyond" marks what goes further than the recommendation of `docs/FRONTEND_VIEW_OPTIONS.md` v2 or
than what the trial showed: these deserve the first look in a review.

| # | Decision or assumption | Why | Beyond |
|---|---|---|---|
| 1 | The views are plain HTML and CSS with one TypeScript module script | Maximum simplicity: nothing added to learn, ship or upgrade; nowhere for logic to hide in a view. `docs/FRONTEND_VIEW_OPTIONS.md` sections 5 and 6 | |
| 2 | `lit-html` alone is the fallback, per view, on the triggers of section 7 | The two mix in one page, so the step costs one view, not a rewrite | |
| 3 | The logic between services and views is a layer of its own, with no DOM (section 5) | Without a home it drifts into the views. In the trial it mattered more than the choice of view technology: with a week handed over ready to draw, the view held no rule | The recommendation proposed it as a direction (point H1); here it is a rule, with a folder |
| 4 | A view may use a service directly; the logic layer is not a mandatory wrapper (section 2) | The brief of the view layer allows a view to call the services; a pass-through layer would add code and no safety | Yes |
| 5 | No `style=` attribute and no inline style; computed positions are set as properties (section 3, rule 6) | Found in the trial: a strict policy refuses the attribute and allows the property | Yes: the recommendation spoke of scripts and handlers only |
| 6 | A view cleans up after itself when it is left (section 3, rule 9) | Found in the trial: the sections stay in the page; forgetting it shows one person's week to the next | Yes |
| 7 | New API services and logic objects for every session (section 6, point 4) | The result streams replay their last value; dropping the objects is simpler and safer than resetting each one | Yes: done so in the trial, not in the recommendation |
| 8 | A view receives the username and the role, never the `Session` (section 3, rule 11) | `docs/FRONTEND_SERVICES.md` section 2, rule 9: tokens live only in the `SessionStore` | Yes |
| 9 | Navigation is the URL's hash, read as a stream; no router library (section 6, point 6) | A few screens, one page; the back button and a reloadable address for free | Sketched in the recommendation, not tried: the trial had one screen per role |
| 10 | Every view has a DOM test against the real `index.html`, with fake services (section 8) | It is the answer to the selectors the compiler cannot check | Assumed in the recommendation, to be completed by O6. The trial had no automated test |
| 11 | Editing never happens inline in a redrawn list (section 3, rule 4) | A constraint on the screens, accepted for simplicity; lifting it for a view is a trigger for the fallback | |
| 12 | The folders of section 9: `src/logic/`, `src/views/`, `src/main.ts`, `index.html` and `style.css` in `frontend/` | Next to `src/services/`, one folder per layer; `index.html` where `docs/FOLDER_STRUCTURE.md` section 2 reserves it | Yes |
| 13 | Two lint rules, in place since the first view: no `innerHTML` and its relatives; no DOM in `logic/` and `services/` (section 9) | A rule that lint can check is not left to review | The second one, yes |
| 14 | The logic layer is inside the 100 % line coverage of `frontend/src` (section 5, rule 7) | It is where the rules of the screens are; it needs no DOM to be tested | Yes |
| 15 | esbuild bundles; two Node scripts, `build.mjs` and `dev.mjs`, and a third file, `bundle.mjs`, with the options they share (section 12.1) | Already a development dependency; no configuration file of a tool. The shared file keeps the dev server and the build from drifting apart (the target, the format, the constants) | The third file |
| 16 | The configuration is three constants, `API_URL`, `COGNITO_URL` and `CLIENT_ID`, put in by esbuild's `define` and read in `src/main.ts` only (section 12.1) | `docs/FRONTEND_SERVICES.md` section 2, rule 3: nothing below the entry file knows where a value comes from; nothing about a stack is in a committed file | |
| 17 | Under the dev server the two addresses have no host: `/api` and `/cognito/` (section 12.2) | The browser completes them with the origin the page came from, so the same bundle works on `localhost` and through a forwarded port of a Codespace, where the server cannot know its public name | Yes: "the dev server's own origin" was first meant as a full address |
| 18 | The dev server listens on `127.0.0.1` only, and answers `/favicon.ico` with an empty 204 (section 12.2) | It passes requests on to the local stack: not for the network. A 404 for the icon would be an error in the browser's console at every load | Yes |
| 19 | The views' tests run in a vitest project of their own, `views`, with `happy-dom`; the `unit` project stays in `node` (section 12.3) | A folder gets an environment through a project; the alternative vitest offers, a `@vitest-environment` comment, is per file and can be forgotten. In `node` a DOM global in a service or in the logic fails the test | |
| 20 | `src/main.ts` is the one file left out of the coverage, by name (section 12.3) | One statement, which needs the three constants only the bundle command defines; the browser check runs it | |
| 21 | English only; the fixed texts are in `index.html`, the texts that depend on data in the logic layer (section 12.4) | Decided with the plan. The shell holds the two role names | |
| 22 | "Now" is passed in: `WeekScreen` receives `now: () => Date`; nothing in `logic/` reads the clock (section 5.1) | A test fixes the moment without faking the clock, and the rule "no hidden input" holds for time as it does for the services | Yes |
| 23 | "Today", for the week to open on, is taken in `DEFAULT_TIME_ZONE`; no request for the settings before the first week (section 5.1) | The first week is loaded at once, and the week screen needs the `CalendarService` only. The price is the known limit around midnight for a calendar in another zone. `docs/FRONTEND_VIEW_PLAN.md` step 61 first said otherwise and was corrected | Yes |
| 24 | The UTC offset is derived in `logic/texts.ts` from `shared/`'s `localDateOf` and `localTimeOf`; no new helper in `shared/` (section 5.1) | `shared/` is not changed by the view layer's plan. It held for whole-hour and half-hour zones and both nights of the clock change | Yes |
| 25 | On a day whose offset changes every time carries its offset; two blocks of the same kind in the same place on the clock go side by side, by `lane` and `lanes` of the model (section 5.1) | `docs/SHARED_CALENDAR_SPEC.md` section 16.8 asks that the two be told apart. The model decides, the view applies a class. Blocks of different kinds are not moved apart: known, and rare (availability at night, on one night a year) | Yes |
| 26 | A type's colour is a number from its id, applied as one of six classes of the style sheet (section 5.1) | The same colour in every week with nothing stored, and no colour computed at run time, so no inline style | |
| 27 | A failure is shown by its `reason`, through `failureText`; the service's `message` never reaches the page, and an unknown reason gets one general sentence (section 5.1) | The message is a developer's text, and at times the server's own words. The login shows the same sentence for a wrong password and an unknown user | Yes |
| 28 | The screens are a table in `shell.ts`; `mountShell` takes it as an optional dependency (section 6) | A new screen is an entry. The dependency is there for the shell's test: with one screen in the real table, a change of screen and a forbidden address could not be tested otherwise | The optional dependency, yes |
| 29 | A wrong address is put right with `history.replaceState` (section 6) | No step added to the history, so the back button is not caught; it sends no `hashchange`, so the shell does not hear its own correction | Yes |
| 30 | The session's services and logic objects are created when the person enters, not when a screen is shown (section 6, point 4) | A screen left and found again keeps its state (the week it was on) within one session, and nothing outlives the session | Yes |
| 31 | The local seed books as `alice` herself, not as the Administrator for her (`frontend/scripts/seed-local.mjs`) | The server then offers and accepts only the slots the current settings allow, with no rule copied into a script. The types and the patterns are created as the Administrator | Yes |
| 32 | The reload after a write is the week screen's: it listens to `bookResult$` and `cancelResult$` and reloads at every result, a failure included (section 5.1) | `docs/SHARED_CALENDAR_SPEC.md` section 16.3: a failed write may have been applied, and after a refusal the week on screen is no longer true. In the logic layer it is tested without a DOM and cannot be forgotten by a second view | Yes: `docs/FRONTEND_SERVICES.md` section 18.6 shows the view doing it, on a success |
| 33 | The week is loaded again every time the page becomes visible; `WeekScreen` receives the stream, the shell builds it from `visibilitychange`; no timer, nothing pushed (sections 5.1 and 6) | `docs/FRONTEND_VIEW_PLAN.md` section 8, decision 11. The logic layer keeps no DOM, and the stream is handed over like "now" | Yes |
| 34 | A dialog shows a result only when it asked for it since it opened: a local "asked" of the view, beside what the dialog is about (section 4) | The state streams keep their last value; without it a failure of an earlier opening, or the result of a call left under way, would show in the next dialog | Yes |
| 35 | A slot and an appointment are buttons; a click only opens a dialog; one click on "Cancel appointment" cancels, with no second question (section 4) | Reachable by keyboard with nothing of our own. A cancelled slot is free again and can be booked again, so a confirmation would cost every cancellation a click to protect the rare slip | The second, yes |
| 36 | Whether "Cancel appointment" is offered, and the sentence under it, are decided in `logic/appointment.detail.ts` with "now" read when the dialog opens (section 5.1) | A rule and a comparison of times: not a view's (section 3, rule 1). The week's `generatedAt` may be hours old | Yes |
| 37 | The Administrator's custom times are two native lists of local times, from the start to the end of the slot's window; left as they are, the slot's own instants are sent (section 5.1) | Native controls, nothing typed that could be off the grid. The slot's own instants name the repeated hour without ambiguity; a custom time in it is the earlier occurrence, and the lists of the night the clocks go forward hold the missing hour: known limits | Yes |
| 38 | A slot of the week model carries the instants of its window, made with `shared/`'s `effectiveWindows` (section 5.1) | The dialog needs the window for the custom times, and the view may not work it out. The model was to gain only the slot's instants, its day and its type's name: this is one field more | Yes |
| 39 | The list of users is asked for at every opening of the Administrator's book dialog and applied only while it is open; the picker is rebuilt when it arrives (section 4) | A user created meanwhile is there. It is the one redrawn region with a form control, accepted because it happens before anything can be chosen. If a later screen asks for the list while the dialog is open, this must be looked at again | Yes |
| 40 | The messages beside the User picker ("Loading the users…", "There is no User to book for.") come from `logic/booking.ts`, with whether "Book" may be pressed (`userChoice`), not from `index.html` (section 5.1) | One function says the names, the message and "ready" for each state of the list, and is tested without a DOM. It departs from section 12.4, which puts fixed texts in the page | Yes |
| 41 | The week view receives its dependencies as one object: the parts it uses of the `WeekScreen`, of the `AppointmentsService` and of the `UsersService`, and the role (section 4) | Three services' parts cannot be one `Pick<…>`. The role decides which part of the book dialog is shown (section 3, rule 11) | Yes |
| 42 | Both dialogs stay in `week.view.ts` in plan step 62; what a second screen shares is moved out when that screen comes (`docs/FRONTEND_VIEW_PLAN.md` step 64) | Nothing is shared yet. The view is 288 lines; 38 of them look nodes up, 16 of those for the two dialogs and their three streams: no condition of section 7 was met | |
| 43 | **How a change is made on the screen** (decided with the Product Owner, `docs/FRONTEND_VIEW_PLAN.md` section 8, decision 10): "Change" in the detail closes it and puts the week in a "choose the new time" state, shown by a banner with "Keep the appointment as it is"; the next free slot clicked is the new time, confirmed in a dialog that names the old time and the new one (sections 4 and 5.1) | The new time is chosen where times are shown, in the week, with the same click as a booking; nothing is changed before the confirmation, and giving up is one button that is always in sight | Yes |
| 44 | Which appointment is being moved is state of the `WeekScreen`, a field of `week$`, as a copy in words taken when "Change" was pressed (section 5.1) | State that outlives a dialog and a week is not a view's (section 3, rule 10); one stream for the week. The copy lets the banner name an appointment that the week on screen does not hold | Yes |
| 45 | A move ends at a successful change, at "Keep the appointment as it is" and at the end of the screen's subscription; no refusal ends it, whatever its reason (section 5.1) | One rule the person can predict, instead of a list of reasons that close the banner by themselves. After a refusal about the old appointment the next try is refused again, and the banner's button is the way out | Yes |
| 46 | While an appointment is being moved only free slots can be clicked: every appointment's button is disabled, from the state, in the view (section 4) | The appointment being moved cannot be cancelled, nor its note edited, half-way; disabled buttons are skipped by the keyboard too | Yes |
| 47 | The confirmation of a change is the book dialog in a second mode; the fixed texts of both modes are in `index.html` and are shown and hidden (section 4) | It asks for what a booking asks for, less the User: a third dialog would repeat the form, the times and their handlers. The script writes no fixed text (section 12.4) | Yes |
| 48 | In a change the note is always sent, as the confirmation's field holds it; the field opens with the old note (section 5.1) | What the person sees in the field is what the new appointment gets: untouched, edited or emptied. Leaving the key out when the field is untouched would need the view or the logic to compare notes, for the same result | Yes |
| 49 | Moving an appointment inside its own time needs a free slot of the same window to click; with none, the Administrator cancels and books again (section 5.1, known limit) | Nothing special was built for a rare case: the appointment's own block is not a place to click while it is being moved | Yes |
| 50 | Which of the three actions the detail offers is decided in `logic/appointment.detail.ts` with "now" read when the dialog opens; "Change" is offered exactly when "Cancel appointment" is, and one sentence speaks of both (section 5.1) | `docs/SHARED_CALENDAR_SPEC.md` R-CHG-01: a change passes the rules of a cancellation. The note has no notice (R-NOTE-01) and needs no words | Yes |
| 51 | `failureText` takes what was attempted as a second, optional argument; `invalid_request` has one sentence everywhere, which says to check what was entered (section 5.1) | The server answers a change that is too late with the cancellation's code. One table of sentences stays, with the exceptions beside it. An end not after the start gets no sentence of its own and no check in the logic layer (`docs/FRONTEND_SERVICES.md` section 8, decision 42) | Yes |
| 52 | The note, the banner and the confirmation stay in `week.view.ts` in plan step 63 (`docs/FRONTEND_VIEW_PLAN.md` step 64 moves what two screens share) | The view is 390 lines and listens to six streams; 55 of its lines look nodes up or copy a template, 29 of those for the dialogs and the banner. No condition of section 7 was met: no field in a redrawn region, the look-ups far shorter than the rest, and no helper that builds or updates nodes (`bookMode` shows and hides the fixed texts of the dialog's two modes) | |
| 53 | The appointment detail is one dialog of the frame and one file, `detail.view.ts`; the view of the screen on show mounts it and ends it; `mountDetail` returns `open` beside the subscription (section 4) | Two screens open the same dialog: one markup, one wiring, and nothing of it differs but what it is handed. Something must open it, so the mount function returns that too | Yes: the one mount function that does not return a `Subscription` alone |
| 54 | A view finds the frame's dialog through its own element's document (`root.ownerDocument`), by its id (section 4) | The shell's code that shows a screen stays as it is. The price: a view reaches one element outside its own | Yes |
| 55 | The list screen reads the settings at each `start()` for the calendar's time zone, before the first list; the week screen still opens without that request (section 5.1) | Decided with the Product Owner (`docs/FRONTEND_VIEW_PLAN.md` step 64). The list's answer names no zone and the list can be the first screen. Decision 23 stands for the week, with its limit | |
| 56 | The mode and the period are state of the `AppointmentsScreen` and last as long as the session; the zone and the list are forgotten when its subscription ends (section 5.1) | A screen left and found again is where it was left (decision 30), and what it shows is read again, not replayed: between two visits a change was perhaps made from the week | The second half, yes |
| 57 | Another mode or another period forgets the list on show; the same ones, loaded again, keep it meanwhile (section 5.1) | A list of upcoming appointments under "History" would be read as the history. The week keeps its last week under the next label because both are weeks; here the two lists are not the same thing | Yes |
| 58 | The period's own checks are in `logic/appointments.model.ts`, before any call, with the limit of `shared/`; the form has `novalidate` (sections 4 and 5.1) | A rule and date arithmetic: not a view's. The browser's own check would stop the form before the sentence could be shown, and says it in its own words | The `novalidate`, yes |
| 59 | The history opens on the 30 days that end today (section 5.1) | Decided with the Product Owner. Its consequence was seen in the browser check: an appointment cancelled today for a later date is not in it, and is found by choosing a period that reaches forward. Confirmed as it is at the review of step 64 | |
| 60 | "Change" from the list hands the appointment over to the `WeekScreen` (`handOver`), which takes it once, at its next `start()` or at once when started; leaving the week still ends the move (section 5.1) | Decided with the Product Owner. The new time is chosen in the week, with step 63's banner and confirmation and no second way to move. One thing crosses from a screen to another, through the logic layer, and step 63's rule (decision 45) holds without an exception | |
| 61 | The list's view is handed `showWeek` by its entry of the table of screens; the code that follows the address did not change (section 6) | A view knows no address (the table does). The change of address is followed like one made by a link | Yes |
| 62 | The detail's sentence says first what the appointment is (moved, cancelled, ended), for both roles; only for one still to end does it speak of changing and cancelling (section 5.1) | The history shows cancelled and ended appointments, for which "too late to change or cancel" was wrong. A changed case of step 63: a User's ended appointment now reads "This appointment has ended." | |
| 63 | A row carries what the appointment is twice: in words (`status`) and as one of four names (`kind`), which the view applies as a class (section 4) | The style sheet says what a cancelled row looks like; the view decides nothing | Yes |
| 64 | A date of the list has no year, like the dates of the week (section 5.1, known limit) | `texts.ts` was to grow only for a code without a sentence. At most 92 days are listed; across the end of a year the rows do not say which year | Yes |
| 65 | No condition of section 7 was met at plan step 64 | `week.view.ts` went from 390 to 313 lines, `detail.view.ts` is 137 and `appointments.view.ts` 117; the lines that look a node up or copy a template are 46, 10 and 19. No field in a redrawn region; no helper that builds or updates nodes (`rowFor` copies a template and fills it, as the week's blocks do); sharing the dialog needed a mount function and its dependencies, nothing more | |
| 66 | The fields of the settings are checked in `logic/settings.model.ts` before any call, with the ranges of `shared/`; the service's own check stays, and its message still never reaches the page (section 5.1) | `docs/FRONTEND_VIEW_PLAN.md` step 65 asks for the field to be named. The only text that names it otherwise is a developer's message (decision 27). The check is made twice, with one source for the numbers | Yes: `docs/FRONTEND_SERVICES.md` section 8, decision 42 leaves such checks to the service |
| 67 | A value is accepted when it is written with digits only, spaces aside, and is inside its range; a decimal point, an exponent and a sign are refused also when the value would be a whole number (section 5.1) | One rule a person can predict, and one sentence for every fault. The native field lets those texts through, so the rule is the logic's | Yes |
| 68 | A refusal is one sentence per field, naming it in the words of its label; every field in fault is said (section 5.1) | The person corrects everything in one go. The label is in the page and the name in the logic layer: said twice, and the view's test checks that they agree | The words said twice, yes |
| 69 | A field in fault is a `.field` with its sentence in `.refusal` (`role="alert"`) and `aria-invalid` on its input, all from the stream; the form has `novalidate` and the native limits are a convenience (section 4) | The pattern for the forms of the steps that follow: three things, set in one loop of the subscription, with nothing decided in the view | Yes |
| 70 | "No limit" is a checkbox beside the number field; an empty field is a field in fault, never "no limit" (section 5.1) | Decided with the Product Owner (`docs/FRONTEND_VIEW_PLAN.md` step 65): a field emptied by mistake must not remove the limit | |
| 71 | The form shows each range in words, the time zone read-only, and who saved last and when (section 5.1) | Decided with the Product Owner. All of it is in the server's answer | |
| 72 | Values typed and not saved are lost with no question, on a change of screen and on signing out (section 5.1) | Decided with the Product Owner: as a typed note is in the dialogs. Four small fields | |
| 73 | The settings are read again after every save; a success fills the form with the server's answer, a failure leaves what was typed, and the read that follows fills nothing (section 5.1) | Decided with the Product Owner. `docs/SHARED_CALENDAR_SPEC.md` section 16.3: a failed write may have been applied, and the line about the last save then says so, while the person keeps what they typed | |
| 74 | Two wordings decided at the reviews of steps 63 and 64: the book dialog's two lists of times are labelled "Start" and "End"; `appointment_limit_reached` after a change has its own sentence (sections 4 and 5.1) | "From" and "To" were also the words of the two lines above them in the confirmation. A change books nothing more, so "Cancel one to book another" did not say what to do | |
| 75 | The label of the limit says "per person", not "per User" (section 4) | The page's fixed texts are in the document also while they are hidden, and the shell's test of a second person signing in looks for the word "User", the first person's role, in the whole frame. **That reason ended with plan step 66**, whose screen is called "Users": the test now compares whole pages (decision 87). The label stays as it is | Yes |
| 76 | No condition of section 7 was met at plan step 65 | `settings.view.ts` is 110 lines, 16 of which look a node up. The fields are in a fixed form, not in a redrawn region; the refusals are shown and cleared by one loop of the subscription, not by a helper that builds or updates nodes | |
| 77 | The password dialog has no "Copy" button; the password is plain text, to be selected and copied by hand, and the page never touches the clipboard (section 4) | Decided with the Product Owner (`docs/FRONTEND_VIEW_PLAN.md` step 66). One click selects the whole password, through the style sheet (`user-select: all`), which touches no clipboard | The selection by one click, yes |
| 78 | The password dialog is closed by its button only, "I have noted the password": `closedby="none"` on the dialog, and its `cancel` event refused (sections 4 and 8) | Decided with the Product Owner: the password cannot be shown again and no route sets another, so a key pressed by mistake must not lose it. In Chromium a refused `cancel` alone gives way at the third Escape; the attribute holds. The other dialogs keep closing with Escape | |
| 79 | Deleting asks first, in a dialog with two buttons, "Keep" and "Delete user", which names the user and says that their future appointments will be cancelled and that this cannot be undone; nothing is typed to confirm (section 4) | Decided with the Product Owner. A deleted user cannot be brought back, unlike a cancelled slot (decision 35) | |
| 80 | A row of the users shows the username only; the creation date is not shown (section 5.1) | Decided with the Product Owner: the screen then needs no time zone and makes one request | |
| 81 | The generated password goes from the service's own create state to one element of the page, through `textContent`, and out at the dialog's close and at the view's teardown; it never passes through the logic layer, whose screen reads a create's result through a type that does not name it (sections 4 and 5.1) | `docs/FRONTEND_SERVICES.md` section 2, rule 6 and section 13.7. No state object, no fixture of the logic's tests and no log of a stream can then hold it. The price: the view listens to one stream of the service beside the screen's, and the stream's `created` is used by no view. Known limit: a create left under way when the screen is left shows its password to nobody | Yes |
| 82 | The username is checked in `logic/users.model.ts` with the shared `Username` schema, spaces around it removed and nothing else changed; its refusal and the hint under the field are the same sentence, written once, and the style sheet hides the hint while the refusal shows (sections 4 and 5.1) | Decision 66 again, for a text. The pattern and the lengths stay in `shared/`; the numbers are in the sentence's words only, and a test holds them to the schema | The hint hidden, yes |
| 83 | When the password dialog opens the keyboard is on its heading, one Tab before the button (section 4) | The brief of the step allowed either. A button with the keyboard on it is pressed by Enter and by the space bar: the same slip the Escape key was closed against | Yes |
| 84 | No dialog has a handler of the `close` event: what a dialog is about and its "asked" are replaced at the next opening, and the list of users is applied to the book dialog while `book.open` (sections 4 and 8) | Found in the browser check of step 66: the event can arrive after the dialog was opened again, and a handler that forgets then breaks the new opening. The delete dialog was built without one; the handlers of the detail and of the book dialog were removed at the review of the step, with a test of the late event for each of the three | Yes |
| 85 | A list of users that could not be read again is taken off the screen; users read again that are those on show keep the same rows object (section 5.1) | The week keeps its last week under a failure; a list with "Delete" buttons that may be old is better not offered. The same object keeps the keyboard on a row's button through the read after a refused delete and when the tab is shown again | Yes |
| 86 | "Delete user" calls the `UsersService` from the view; "Create user" goes through the `UsersScreen` (sections 4 and 5.1) | Section 2: a view may call a service, and the logic layer holds only what would otherwise end up in a view. A create has a check and words; a delete has none | |
| 87 | The shell's test of a second person compares the whole page, its source and what every field holds, with the page the same person finds when nobody was there before (section 8) | It relied on a word, "User", that the page's own fixed texts now hold. The comparison still catches a role, a name, a link, a row, a value, an attribute or an open dialog left by the first person, and anything a later screen leaves | Yes |
| 88 | No condition of section 7 was met at plan step 66 | `users.view.ts` is 172 lines and listens to three streams; 26 of its lines look a node up or copy a template. The one field is in a fixed form; the rows hold buttons only; `rowFor` copies a template and fills it, as the list's does; the two dialogs are filled by a few assignments each | |
| 89 | On the availability screen creating is a fixed form and changing is a dialog; a row holds buttons only: "Rename" or "Change", and "Delete" (section 4) | Decided with the Product Owner (`docs/FRONTEND_VIEW_PLAN.md` step 67). As "Create user" is; and editing is never inline in a redrawn list (decision 11) | |
| 90 | The list of the patterns shows every pattern the server returns, grouped by weekday; one whose validity has ended is marked "ended" and stays; no switch hides anything (section 5.1) | Decided with the Product Owner. A type used by any pattern, ended or not, cannot be deleted (`docs/SHARED_CALENDAR_SPEC.md` R-TYPE-03), so the Administrator must be able to see it and delete it | |
| 91 | "Change" is one call that replaces the pattern's fields; "from a date on" in two calls is not built (section 5.1) | Decided with the Product Owner. The Administrator sets "Valid until" on the old pattern and creates a new one, by hand; two calls of which the second can fail would need a design of their own | |
| 92 | A pattern's start and end are two lists of the local times on the 15-minute grid, 00:00 to 23:45 and 00:15 to 24:00; its two dates are native date fields (section 4) | Decided with the Product Owner. As the book dialog's "Start" and "End" (decision 37): nothing off the grid can be chosen | |
| 93 | Three new files in the logic layer: `availability.model.ts`, pure, for the types and the patterns; `conflicts.ts`, pure, for the conflicts list; `availability.screen.ts`, the class (section 5.1) | The pattern of the users (a model and a screen). The conflicts are apart because `docs/FRONTEND_VIEW_PLAN.md` step 68 uses them for an override and a window, and they are about appointments, not about a pattern | Yes |
| 94 | A type's name is checked in `logic/availability.model.ts` with the shared `TypeName` schema; its refusal and the hint under the field are one sentence, whose number is `CALENDAR_LIMITS.typeNameLength`; a name that exists and the limit of types are the server's to say (section 5.1) | Decision 82 again. The sentence also says "with no tab in it": the schema refuses a control character inside a name, and a tab is the one a person can paste into a text field; without the words a pasted name of ten characters would be told that it must have 1 to 40 | The words about the tab, yes |
| 95 | A pattern's fields are checked in `logic/availability.model.ts`: two comparisons of texts written alike (the two times, the two dates) and the shared `LocalDate` schema; `PatternBody` has the last word through the service, and the model's tests hold the two together (section 5.1) | Decisions 66 and 68: the field is named, in the words of its label, and every field in fault is said. The schema's own cross-field checks are not relied on for that: whether they run when another field is also in fault is the schema library's to decide | Yes |
| 96 | The availability screen reads the settings, the types and the patterns at once; the list of patterns needs the zone and the patterns; each list fails and is tried again by itself (section 5.1) | Decision 55 again, for the calendar's "today" and the dates of a conflict. Nothing waits for the settings but the patterns' list: the three requests leave together | |
| 97 | A read of the types that fails takes their rows off the screen and keeps the types as last read for the choices of the pattern forms and the names in the patterns' rows; a pattern whose type the types do not hold shows "Unknown type" (section 5.1) | Decision 85 for the rows, which have "Delete" buttons. The choices are another matter: emptied behind an open dialog they would take its type away, and the server refuses a type that is gone anyway | Yes |
| 98 | The outcome of each of the four writes that have a check is one object of the stream, with `about`, the id it was asked for; a dialog shows it only when it asked since it opened and the outcome is about what the dialog is about; while a write of a kind is under way another of that kind is not taken (sections 4 and 5.1) | Decision 34 was enough while the outcome came from a service's state, which only a call changes. Here a refusal by the check changes the outcome with no call, so a call left under way by an earlier opening could answer into a later one: the id and the rule of one write at a time close that. It departs from the users screen, where a second create goes to the service, which keeps the last | Yes |
| 99 | The two deletes are called by the view on their services; the appointments in the way of a pattern's deletion are made ready to draw by `AvailabilityScreen.conflicts(…)` (sections 4 and 5.1) | Decision 86: a write with nothing to check. The view has no time zone and may do no date arithmetic, so it asks the logic object, as the week view asks for a detail | Yes |
| 100 | One dialog confirms the deletion of a type or of a pattern; its fixed words name neither ("Confirm the deletion", "Keep", "Delete"), and the question says what is deleted (section 4) | `docs/FRONTEND_VIEW_PLAN.md` step 68 adds two more deletions to the screen: with one dialog each is a question and a call. The price: the heading and the button do not say "type" or "pattern"; the question does, in its first words | Yes |
| 101 | The conflicts list is one markup in three places, one template for a row, one function of the logic layer and one local function of the view; it stands under the failure's own sentence with a sentence that counts it; nothing can be done to an appointment from it (sections 4 and 5.1) | `docs/SHARED_CALENDAR_SPEC.md` section 16.8 asks for the list. Cancelling from there would be a second way to cancel, with its own failures, inside a dialog that is about something else: the Administrator goes to the week | The count as a second sentence, yes |
| 102 | The form that creates a pattern starts with no type chosen; a list of types that arrives leaves what is chosen; a chosen type that is gone leaves none chosen, which the check refuses (section 4) | A native list always has its first choice chosen unless told otherwise: the first type would be the pattern's type by accident, and a type that is gone would silently become another | Yes |
| 103 | After a create that succeeded the form that creates a pattern goes back to its starting values; "Valid from" starts on today, the calendar's (section 5.1) | Asked by the brief of the step. Known cost: five patterns of one type for five weekdays are five times the type and the hours chosen again; copying a pattern and several weekdays in one create are not built | |
| 104 | `failureText` takes `'type'` and `'pattern'` as what was attempted, for `limit_reached`; with nothing said the sentence names no number (section 5.1) | Decision 51's second argument, extended rather than a second way. The numbers are `CALENDAR_LIMITS`' | |
| 105 | `texts.ts` gains `longDateText`, a date with its whole month and its year; a pattern's validity uses it, a conflict's date stays without a year (section 5.1) | A pattern may be valid for years; an appointment in the way has not ended and is within the booking horizon, a year at most, so its date is not ambiguous (decision 64) | Yes |
| 106 | A pattern's hours are written "09:00 – 13:00", with spaces around the dash; an appointment's time stays "09:00–10:00" (`rangeText`), also in the conflicts list of the same screen (section 5.1) | The first are two local times of a rule, written as the brief of the step has them; the second is the time of an appointment, as the week and the list write it. To settle at the review if one form is wanted | Yes |
| 107 | No condition of section 7 was met at plan step 67; one came close | `availability.view.ts` is 282 lines (the week's is 312) and listens to three streams; 36 of its lines look a node up or copy a template. No field is in a redrawn region: the rows hold buttons, and the choices of a fixed list are rebuilt, as in the book dialog (decision 39). **What came close**: four forms of one shape gave the view local functions that set values and texts of elements found once (`fill`, `say`, `showConflicts`, `choices`), where the settings had one loop in its subscription. None builds a node or decides anything; they are the same few assignments for four forms instead of written four times. If step 68's per-date editor needs rows of fields that come and go, that is the first condition of section 7, and the step must stop there | |
| 108 | The availability is a fifth entry of the table of screens, with its two services and its logic object in `sessionObjects`; the code that reads the address, fills the navigation and switches between screens did not change (section 6) | Decision 28, for the fifth time | |

## 12. The tooling (open points O4, O6 and O8, decided)

### 12.1 The bundle command

`npm run build -w frontend` runs `frontend/scripts/build.mjs`, which writes `frontend/dist/`
(git-ignored, emptied first):

| File | What it is |
|---|---|
| `dist/index.html`, `dist/style.css` | Copies of `frontend/index.html` and `frontend/style.css`, unchanged |
| `dist/app.js` | `src/main.ts` and everything it imports, as one minified module script (esbuild: `bundle`, format `esm`, target `es2022`) |
| `dist/app.js.map` | The source map, a file of its own, named in the last line of `app.js` |

**The configuration** reaches the bundle as three constants, which esbuild's `define` writes in
place of their names:

| Constant | What | In a build | Under the dev server |
|---|---|---|---|
| `API_URL` | The API's base address, no trailing slash | Environment variable `API_URL` | `/api` |
| `COGNITO_URL` | Where `InitiateAuth` is posted | Environment variable `COGNITO_URL` | `/cognito/` |
| `CLIENT_ID` | The app client of the user pool | Environment variable `CLIENT_ID` | `AuthorizerFunction.CLIENT_ID` of `backend/env.local.json` |

They are declared and read in `frontend/src/main.ts` and nowhere else; it hands them to the shell
as one plain object (`docs/FRONTEND_SERVICES.md` section 2, rule 3). A build with one of the
three variables missing stops and names it. No value is written in a committed file
(`docs/FOLDER_STRUCTURE.md` section 7). Which values a deployment uses, and the script that reads
them from the stack's outputs, belong to the hosting (section 10, open point O1).

The build prints the size of each file, as it is and compressed. At plan step 60, with the login
only: `app.js` 490 kB, 105 kB compressed. Of the 490 kB, 454 are `zod` (264 of them its messages
in other languages), which `shared/`'s schemas bring in with any import from
`@shared-calendar/shared`; the services, `shared/`, the views and `rxjs` together are 36 kB.
At plan step 61, with the logic layer and the week: `app.js` 504 kB, 110 kB compressed. At plan
step 62, with booking and cancelling: 518 kB, 113 kB compressed. At plan step 63, with the note
and the change: 520 kB, 114 kB compressed. At plan step 64, with "My appointments": 528 kB,
115 kB compressed. At plan step 65, with the settings: 532 kB, 117 kB compressed. At plan step 66, with the users: 537 kB, 118 kB compressed. At plan step 67, with the types and the weekly patterns: 561 kB, 124 kB compressed. What to do about `zod`'s share
is open point O9 (section 10).

### 12.2 The dev server

`npm run dev -w frontend` runs `frontend/scripts/dev.mjs`: Node's own HTTP server and esbuild,
nothing else. For local work only; it needs `npm run local:up -w backend` (it reads the client
id, and says so when the file is missing) and, to sign in, `npm run local:api -w backend`.

- Port 5173, or the one given (`npm run dev -w frontend -- 5180`); it listens on this machine
  only (`127.0.0.1`).
- It answers `/` (`index.html`), `/style.css` and `/app.js`, and reads nothing else from the
  disk. `/app.js` is bundled again at every request, with the source map inside it: an edit
  shows after a reload of the page. When esbuild refuses the code the answer is a 500 with the
  error, also printed in the terminal, and the page stays blank.
- It passes `/api/…` on to `http://127.0.0.1:3000` and `/cognito/…` to `http://localhost:9229`,
  so the browser sees **one origin** (section 10, open point O2). The two addresses in the
  bundle have no host; the browser completes them with the page's origin.
- It sends `Content-Security-Policy: default-src 'self'` with the page and
  `cache-control: no-store` with every answer.
- It never prints a request's body or headers: the login's body holds a password, and the API
  calls carry a token.

### 12.3 The tests' environment

- `happy-dom` is a development dependency of `frontend`, the only one the view layer adds.
- `frontend/vitest.config.ts` has a project `views` (`tests/unit/views/**/*.test.ts`,
  environment `happy-dom`) beside `unit` (the services and the logic, environment `node`, which
  no longer selects that folder). `npm run test:unit -w frontend` runs both, with one coverage
  report.
- `frontend/tests/unit/views/page.ts` loads the `<body>` of the real `index.html` into the
  emulated document before each test (`useRealPage()`); no view test writes markup of its own.
  `page.test.ts` checks the page itself: one module script and one style sheet, nothing inline,
  everything hidden at the start.
- All of `frontend/src` is held to 100 % lines, the views and the shell included. The one file
  left out, by name, is `src/main.ts`.

### 12.4 The language

English only, with no translation mechanism. The fixed texts are written in `index.html`; the
texts that depend on data are made by the logic layer (section 5.1, `frontend/src/logic/texts.ts`):
dates, times, and a failure in plain words by its `reason`. The sentences that depend on a
state are there too: the one about changing and cancelling in the detail
(`appointment.detail.ts`), those beside the User picker (`booking.ts`, section 11,
decision 40), those of "My appointments": the status of a row, the empty list and the
period's refusals (`appointments.model.ts`), and those of the settings: the range under a
field, a field's refusal and the line about the last save (`settings.model.ts`), and those of
the users: what a username is, which is the hint and the refusal, the sentence of an empty
list, the name of a row's button for a screen reader and the question of the delete dialog
(`users.model.ts`); the fixed words of the two dialogs of the users ("User created", "This
password cannot be shown again. Give it to the user now.", "I have noted the password",
"Delete user", "Keep") are in the page. Those of the availability are made by the logic
layer too: what a type's name is, which is the hint and the refusal, the refusals of a
pattern's fields, the two sentences of an empty list, the word for a type that is not known,
that a type must be created first, the names of the weekdays, a pattern's validity, the names
of a row's buttons for a screen reader, the two questions before a deletion
(`availability.model.ts`) and the sentence that counts the appointments in the way
(`conflicts.ts`); the fixed words of the screen ("Types", "Weekly patterns", the six labels,
"Leave empty for no end.", "ended", "Rename type", "Change pattern", "Confirm the deletion",
"Close", "Keep", "Delete") are in the page. The words that name an appointment being moved come from the logic layer
(`movingOf`); the fixed words around them ("Moving: … Choose a free time.", "From:", "To:") are
in the page. No view shows the `message` of a
service. The shell holds the two names of the roles.
