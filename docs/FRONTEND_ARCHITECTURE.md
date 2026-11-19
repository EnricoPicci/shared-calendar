# Front end — Architecture: the view layer

| | |
|---|---|
| Status | v3 — **decided; the foundation and the week implemented** (2026-11-19, `docs/FRONTEND_VIEW_PLAN.md` steps 60 and 61, briefs `prompts/83-step-60-implementation.md` and `prompts/84-step-61-implementation.md`): the build and dev-server commands, the tests' environment, the shell with its navigation, the login view, the logic layer (`frontend/src/logic/`) and the week calendar, read-only, exist in `frontend/`. The other views follow, one plan step each |
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
  <div class="block slot"><span class="time"></span> free</div>
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
const slotFor = (block: SlotBlock) => {
  const element = place('tpl-slot', block, block.colour);
  element.querySelector('.time')!.textContent = block.time;
  return element;
};
```

The view does no arithmetic here: `top`, `height`, `time`, the lane and the colour's number
arrive ready from the logic layer, and the style sheet says what a lane and a colour look like
(`.lane-1-of-2`, `.type-3`).

**The week's templates, as built** (`docs/FRONTEND_VIEW_PLAN.md` step 61), all inside the week's
element `#week`: `tpl-day` (a heading and the day's body), `tpl-window`, `tpl-busy`, `tpl-slot`,
`tpl-appointment`, and two for the lists beside the days, `tpl-legend-item` and `tpl-hour`. The
navigation's link has one too, `tpl-nav-link`, in the frame. A slot and an appointment are plain
`<div>` elements: they become buttons in the step that gives them something to do
(`docs/FRONTEND_VIEW_PLAN.md` step 62). The number of hours shown is set on each day's body as
the custom property `--hours`, so nothing the script sets stays on an element that outlives the
week. The view redraws the days only when the stream brings another week object, not at every
notification: a change of label or of "Loading…" leaves the days as they are.

## 5. The logic layer

Some of what the screens need may not be in a view (section 3, rule 1) and is not a remote call
either. It lives in the logic layer:

| What | Example |
|---|---|
| State that is not the server's and not one view's | Which week is on screen, and its Monday |
| When to call again | After a booking or a cancellation, whatever its outcome, load the calendar again (`docs/FRONTEND_SERVICES.md` section 18.6) |
| A response made ready to draw | The week: per day, its windows, slots, busy blocks and appointments, each with its place in the day and its time as text |
| What is offered | Whether "Cancel" is shown for an appointment (the role, `cancellableUntil`) |
| The texts | A date and a time in the calendar's time zone, whatever the browser's; a failure `reason` in plain words (`docs/SHARED_CALENDAR_SPEC.md` section 16.8) |
| From the user's input to a call's argument | The booking body from a slot, a note and a username |

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

### 5.1 As built: three files

`frontend/src/logic/` (`docs/FRONTEND_VIEW_PLAN.md` step 61), each with its test in
`frontend/tests/unit/logic/`:

| File | What it holds |
|---|---|
| `texts.ts` | Pure functions: a date (`dateText`, "Mon 16 Nov"), a time (`timeText`, "09:00"), a range (`rangeText`, "09:00–10:00"), a week's label (`weekLabel`, "16 Nov – 22 Nov 2026"), a UTC offset (`offsetText`, "+02:00"), and a failure in plain words (`failureText`) |
| `week.model.ts` | Pure: `weekModel(view, role)`, a `CalendarView` in, the week ready to draw out |
| `week.screen.ts` | The class `WeekScreen`: which week is on screen and its loads |

**"Now" is passed in.** Nothing in `logic/` reads the clock by itself. `WeekScreen` receives a
function `now: () => Date` through its constructor (the shell passes `() => new Date()`, a test a
fixed moment). Everything about one loaded week comes from the view's own `generatedAt`,
including the day marked as today.

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
11.6): the model adds nothing to it.

**The week screen:**

```ts
// The last week loaded stays in `week` while another loads or fails.
export type WeekState = { label: string; loading: boolean; failure: string | null; week: WeekModel | null };

export class WeekScreen {
  readonly week$: Observable<WeekState>;

  // `calendar` is the part of the CalendarService the screen uses: `load` and `calendarState$`.
  constructor(calendar: WeekCalendar, role: Role, now: () => Date) { … }

  start(): Subscription { … } // loads the week on screen, then every week the person moves to
  previous(): void { … }
  next(): void { … }
  today(): void { … }         // loads again even when the week of today is on screen
}
```

The view subscribes to `week$` and forwards three buttons to `previous()`, `today()` and
`next()`. It knows nothing of Mondays or loads.

- A change of week loads at once. While it loads, the last week stays, with `loading` true and
  the new label, in one notification.
- A failed load keeps the last week and carries the failure in plain words. A second failure
  replaces the first; the failure stays while the next load is pending; a success removes it.
- Before `start()` nothing is loaded, and nothing after its subscription ends: a move then
  changes the label only.
- It does not listen to bookings or cancellations yet: that reload comes with the screens that
  write (`docs/FRONTEND_VIEW_PLAN.md` step 62), which is when the `AppointmentsService` joins the
  constructor.

**Failures in plain words.** `failureText(reason)` turns a failure's `reason` into a sentence. It
knows the reasons a person can meet so far: the transport reasons every API service shares
(`docs/FRONTEND_SERVICES.md` section 10.2), the codes of `GET /calendar` and the login's reasons.
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
   `sessionObjects`, creates them when a person enters: today the `CalendarService` and the
   `WeekScreen`. They live as long as the person's session, not as long as a screen is on show:
   coming back to a screen finds its logic object as it was left.
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

There is one entry so far, `#/week`, "Week", both roles. A new screen is a new entry, its
element in `index.html`, and its services and logic object in `sessionObjects`; the code that
reads the address, fills the navigation and switches between screens does not change.
`mountShell` takes the table as an optional dependency, which a test uses to bring a second
entry.

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

## 9. Placement

Inside `frontend/`, next to the services:

```
frontend/
├── index.html                 # all the markup: one element per view, the dialogs, the <template>s
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
│   │                          # week.screen.ts
│   └── views/                 # shell.ts and one <name>.view.ts per view: login.view.ts, week.view.ts
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
At plan step 61, with the logic layer and the week: `app.js` 504 kB, 110 kB compressed. What to
do about `zod`'s share is open point O9 (section 10).

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
dates, times, and a failure in plain words by its `reason`. No view shows the `message` of a
service. The shell holds the two names of the roles.
